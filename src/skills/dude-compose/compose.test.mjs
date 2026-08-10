// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cmdAdd,
  cmdList,
  cmdRemove,
  cmdStatus,
  cmdVerify,
  readProfile,
} from './compose.mjs';

const ENGINE_LIB = fileURLToPath(new URL('../dude-engine/lib/', import.meta.url));
const MODEL_CONFIG_SOURCE = fileURLToPath(new URL('../../config/agent-models.json', import.meta.url));
const INSTALL_LOCATIONS = [
  '.github/agents',
  '.github/skills',
  '.github/instructions',
  '.github/prompts',
];

/** @param {string} target */
function exists(target) {
  try {
    fs.statSync(target);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} root @param {string[]} parts */
function packagedPath(root, ...parts) {
  return path.join(root, '.github', 'skills', 'dude-engine', ...parts);
}

/**
 * Package exactly the runtime dependencies compose dynamically acquires. Every
 * test root is distinct, so an ESM import from one fixture cannot satisfy
 * another fixture's acquisition.
 * @param {string} root
 */
function packageDependencies(root) {
  const lib = packagedPath(root, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  for (const name of ['agent-model-map.mjs', 'agent-projection.mjs']) {
    fs.copyFileSync(path.join(ENGINE_LIB, name), path.join(lib, name));
  }
  const config = packagedPath(root, 'config', 'agent-models.json');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.copyFileSync(MODEL_CONFIG_SOURCE, config);
}

/** @returns {string} */
function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-'));
  for (const location of INSTALL_LOCATIONS) {
    fs.mkdirSync(path.join(root, ...location.split('/')), { recursive: true });
  }
  fs.mkdirSync(path.join(root, '.dude', 'metadata'), { recursive: true });
  fs.mkdirSync(path.join(root, 'library', 'packs'), { recursive: true });
  packageDependencies(root);
  return root;
}

/**
 * @param {{ name: string, modelClass?: string, agents?: string[], userInvocable?: boolean }} options
 * @returns {string}
 */
function agentSource({ name, modelClass = 'balanced', agents, userInvocable = false }) {
  const lines = [
    '---',
    `name: ${JSON.stringify(name)}`,
    `description: ${JSON.stringify(`${name} fixture agent`)}`,
    'tools: [read, search]',
  ];
  if (agents !== undefined) {
    lines.push(`agents: [${agents.map((agent) => JSON.stringify(agent)).join(', ')}]`);
  }
  lines.push(
    `user-invocable: ${userInvocable}`,
    `model-class: ${modelClass}`,
    '---',
    '',
    `You are ${name}.`,
    '',
  );
  return lines.join('\n');
}

/**
 * @param {string} pack
 * @param {string} suffix
 * @param {{ name?: string, modelClass?: string, agents?: string[], userInvocable?: boolean }} [options]
 */
function packAgent(pack, suffix, options = {}) {
  return {
    stem: `dude-pack-${pack}-${suffix}`,
    name: `${pack} ${suffix}`,
    ...options,
  };
}

/**
 * @param {string} root
 * @param {string} name
 * @param {Array<{ stem: string, name: string, modelClass?: string, agents?: string[], userInvocable?: boolean }>} agents
 * @param {{ skill?: boolean }} [options]
 * @returns {string}
 */
function writePack(root, name, agents, { skill = true } = {}) {
  const pack = path.join(root, 'library', 'packs', name);
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(
    path.join(pack, 'pack.md'),
    `---\nname: ${name}\ndescription: ${JSON.stringify(`${name} fixture pack`)}\n---\n# ${name}\n`,
  );
  if (agents.length > 0) {
    const directory = path.join(pack, 'agents');
    fs.mkdirSync(directory, { recursive: true });
    for (const agent of agents) {
      fs.writeFileSync(
        path.join(directory, `${agent.stem}.agent.md`),
        agentSource(agent),
      );
    }
  }
  if (skill) {
    const skillName = `dude-pack-${name}-helper`;
    const directory = path.join(pack, 'skills', skillName);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'SKILL.md'),
      `---\nname: ${skillName}\ndescription: "fixture helper"\n---\n# Helper\n`,
    );
  }
  return pack;
}

/** @returns {string} */
function scaffold() {
  const root = createRoot();
  writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })]);
  return root;
}

/** @param {string} root */
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

/** @param {string} root */
function profileBytes(root) {
  const target = path.join(root, '.dude', 'metadata', 'profile.md');
  return exists(target) ? fs.readFileSync(target) : null;
}

/**
 * Capture byte and shape state without following symbolic links.
 * @param {string} root
 * @param {string[]} relativePaths
 */
function snapshotTree(root, relativePaths) {
  /** @type {Array<{ path: string, type: string, bytes?: string, target?: string }>} */
  const snapshot = [];
  /** @param {string} relativePath */
  function visit(relativePath) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        snapshot.push({ path: relativePath, type: 'missing' });
        return;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      snapshot.push({ path: relativePath, type: 'symlink', target: fs.readlinkSync(absolutePath) });
      return;
    }
    if (stat.isDirectory()) {
      snapshot.push({ path: relativePath, type: 'directory' });
      for (const entry of fs.readdirSync(absolutePath).sort()) {
        visit(path.posix.join(relativePath, entry));
      }
      return;
    }
    if (stat.isFile()) {
      snapshot.push({ path: relativePath, type: 'file', bytes: fs.readFileSync(absolutePath).toString('base64') });
      return;
    }
    snapshot.push({ path: relativePath, type: 'other' });
  }
  for (const relativePath of relativePaths) visit(relativePath);
  return snapshot;
}

/** @param {string} root */
function mutationSnapshot(root) {
  return {
    profile: profileBytes(root),
    artifacts: snapshotTree(root, ['.github']),
  };
}

/** @param {string} root @param {{ profile: Buffer | null, artifacts: unknown }} before */
function assertMutationUnchanged(root, before) {
  assert.deepEqual(profileBytes(root), before.profile, 'profile bytes changed');
  assert.deepEqual(snapshotTree(root, ['.github']), before.artifacts, 'artifact tree changed');
}

/** @param {string} root @param {string} pack */
function assertNoPackLeftovers(root, pack) {
  for (const location of INSTALL_LOCATIONS) {
    const directory = path.join(root, ...location.split('/'));
    if (!exists(directory)) continue;
    const leftovers = fs.readdirSync(directory)
      .filter((entry) => entry.startsWith(`dude-pack-${pack}-`));
    assert.deepEqual(leftovers, [], `leftovers in ${location}`);
  }
}

/** @param {string} root @param {string} modelClass */
function configuredModel(root, modelClass) {
  const config = JSON.parse(fs.readFileSync(packagedPath(root, 'config', 'agent-models.json'), 'utf8'));
  return config.targets.copilot.models[modelClass];
}

/** @param {string} root */
function cloneRoot(root) {
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-clone-'));
  fs.rmSync(clone, { recursive: true, force: true });
  fs.cpSync(root, clone, { recursive: true });
  return clone;
}

/**
 * Record temporary add/verify directories while a test invokes compose.
 * @returns {{ directories: string[], restore: () => void }}
 */
function trackStageDirectories() {
  const originalMkdtempSync = fs.mkdtempSync;
  /** @type {string[]} */
  const directories = [];
  fs.mkdtempSync = (prefix, ...rest) => {
    const directory = originalMkdtempSync(prefix, ...rest);
    if (String(prefix).includes('dude-compose-add-') || String(prefix).includes('dude-verify-')) {
      directories.push(directory);
    }
    return directory;
  };
  return {
    directories,
    restore() {
      fs.mkdtempSync = originalMkdtempSync;
    },
  };
}

/** @param {string[]} directories */
function assertNoSurvivingStageDirectories(directories) {
  for (const directory of directories) {
    assert.equal(exists(directory), false, `stage directory survived: ${directory}`);
  }
}

/**
 * Alter only a copied packaged renderer for a validation fixture.
 * @param {string} root
 * @param {string} replacement
 */
function replaceRendererRecordStem(root, replacement) {
  const renderer = packagedPath(root, 'lib', 'agent-projection.mjs');
  const source = fs.readFileSync(renderer, 'utf8');
  const marker = 'return { stem, frontmatter, body };';
  assert.ok(source.includes(marker), 'renderer fixture must retain its record return');
  fs.writeFileSync(renderer, source.replace(marker, replacement));
}

/**
 * Count complete-set validation calls in one copied packaged renderer.
 * @param {string} root
 * @param {string} counterKey
 */
function countValidateAgentSet(root, counterKey) {
  const renderer = packagedPath(root, 'lib', 'agent-projection.mjs');
  const source = fs.readFileSync(renderer, 'utf8');
  const marker = 'export function validateAgentSet(records) {';
  assert.ok(source.includes(marker), 'renderer fixture must retain validateAgentSet');
  const increment = `\n  globalThis[${JSON.stringify(counterKey)}] = (globalThis[${JSON.stringify(counterKey)}] || 0) + 1;`;
  fs.writeFileSync(renderer, source.replace(marker, `${marker}${increment}`));
}

/**
 * Follow literal relative static imports and re-exports from one ESM entry
 * module. Dynamic imports deliberately do not belong to this closure.
 * @param {string} entryPath
 * @returns {Set<string>}
 */
function staticModuleClosure(entryPath) {
  const pending = [path.resolve(entryPath)];
  const closure = new Set();
  const staticImport = /^(?:import\s+(?:[\w*$,\s{}]+?\s+from\s+)?|export\s+(?:[\w*$,\s{}]+?\s+from\s+)?)['"]([^'"]+)['"]\s*;?\s*$/gm;
  while (pending.length > 0) {
    const modulePath = /** @type {string} */ (pending.pop());
    if (closure.has(modulePath)) continue;
    closure.add(modulePath);
    const source = fs.readFileSync(modulePath, 'utf8');
    for (const match of source.matchAll(staticImport)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const importedPath = path.resolve(path.dirname(modulePath), specifier);
      assert.equal(exists(importedPath), true, `static import must resolve: ${modulePath} -> ${specifier}`);
      pending.push(importedPath);
    }
  }
  return closure;
}

test('add renders one Copilot destination per source and writes version 1 inventory', async () => {
  const root = scaffold();
  const stages = trackStageDirectories();
  try {
    const library = path.join(root, 'library', 'packs');
    const added = await cmdAdd({ root, library, name: 'demo', force: false });

    assert.equal(added.ok, true, added.error);
    const agentPath = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const skillPath = path.join(root, '.github', 'skills', 'dude-pack-demo-helper', 'SKILL.md');
    assert.equal(exists(agentPath), true);
    assert.equal(exists(skillPath), true);
    assert.equal(exists(path.join(root, '.claude', 'agents', 'dude-pack-demo-worker.md')), false);
    assert.equal(exists(path.join(root, '.github', 'agents-sdk', 'dude-pack-demo-worker.agent.json')), false);
    assert.ok(
      fs.readFileSync(agentPath, 'utf8').includes(`model: ${configuredModel(root, 'balanced')}`),
      'rendered profile uses the current packaged mapping',
    );

    const entry = readProfile(root).installed.demo;
    assert.equal(entry.inventory?.version, 1);
    assert.deepEqual(entry.files, [
      '.github/agents/dude-pack-demo-worker.agent.md',
      '.github/skills/dude-pack-demo-helper',
    ]);
    assert.equal(entry.inventory?.artifacts.length, 2);
    const agent = entry.inventory?.artifacts.find((artifact) => artifact.source === 'agents/dude-pack-demo-worker.agent.md');
    assert.deepEqual(agent && {
      path: agent.path,
      kind: agent.kind,
      source: agent.source,
    }, {
      path: '.github/agents/dude-pack-demo-worker.agent.md',
      kind: 'agents',
      source: 'agents/dude-pack-demo-worker.agent.md',
    });
    assert.match(agent?.source_sha256 || '', /^[a-f0-9]{64}$/);
    assert.match(agent?.installed_sha256 || '', /^[a-f0-9]{64}$/);

    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assertNoPackLeftovers(root, 'demo');
    assert.equal(stages.directories.length, 1, 'add must create one stage directory');
    assertNoSurvivingStageDirectories(stages.directories);
  } finally {
    stages.restore();
    cleanup(root);
  }
});

test('add validates a multi-source set exactly once and records each direct binding', async () => {
  const root = createRoot();
  const counterKey = `dude-compose-validate-agent-set-${path.basename(root)}`;
  try {
    const agents = [
      packAgent('team', 'first', { name: 'Team First' }),
      packAgent('team', 'second', { name: 'Team Second' }),
    ];
    writePack(root, 'team', agents, { skill: false });
    countValidateAgentSet(root, counterKey);

    const added = await cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'team',
      force: false,
    });

    assert.equal(added.ok, true, added.error);
    assert.equal(globalThis[counterKey], 1, 'validateAgentSet must run exactly once for the complete incoming set');
    const inventory = readProfile(root).installed.team.inventory;
    assert.ok(inventory);
    assert.equal(inventory.artifacts.length, agents.length);
    assert.equal(readProfile(root).installed.team.files.length, agents.length);
    const bindings = inventory.artifacts
      .map(({ path: destination, kind, source }) => ({ destination, kind, source }))
      .sort((first, second) => first.destination.localeCompare(second.destination));
    assert.deepEqual(bindings, agents
      .map(({ stem }) => ({
        destination: `.github/agents/${stem}.agent.md`,
        kind: 'agents',
        source: `agents/${stem}.agent.md`,
      }))
      .sort((first, second) => first.destination.localeCompare(second.destination)));
    for (const { stem } of agents) {
      assert.equal(exists(path.join(root, '.github', 'agents', `${stem}.agent.md`)), true);
    }
  } finally {
    delete globalThis[counterKey];
    cleanup(root);
  }
});

test('agents omission is a leaf and a non-empty agents roster is the composite declaration', async () => {
  const root = createRoot();
  try {
    const child = packAgent('roster', 'child', { name: 'Roster Child' });
    const coordinator = packAgent('roster', 'coordinator', {
      name: 'Roster Coordinator',
      agents: [child.stem],
    });
    writePack(root, 'roster', [coordinator, child], { skill: false });

    const added = await cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'roster',
      force: false,
    });

    assert.equal(added.ok, true, added.error);
    const coordinatorOutput = fs.readFileSync(
      path.join(root, '.github', 'agents', `${coordinator.stem}.agent.md`),
      'utf8',
    );
    const childOutput = fs.readFileSync(
      path.join(root, '.github', 'agents', `${child.stem}.agent.md`),
      'utf8',
    );
    assert.match(coordinatorOutput, new RegExp(`^agents: \\[${JSON.stringify(child.stem)}\\]$`, 'm'));
    assert.doesNotMatch(childOutput, /^agents:/m);
    assert.equal(readProfile(root).installed.roster.inventory?.artifacts.length, 2);

    const removed = cmdRemove({ root, name: 'roster' });
    assert.equal(removed.ok, true, removed.error);
  } finally {
    cleanup(root);
  }
});

const invalidAgentSetScenarios = [
  {
    name: 'duplicate stems',
    agents: [
      packAgent('roster', 'first'),
      packAgent('roster', 'second'),
    ],
    patch(root) {
      replaceRendererRecordStem(root, 'return { stem: "dude-pack-roster-first", frontmatter, body };');
    },
    message: /agent 'dude-pack-roster-first' duplicates source stem/,
  },
  {
    name: 'duplicate display names',
    agents: [
      packAgent('roster', 'first', { name: 'Duplicate Display' }),
      packAgent('roster', 'second', { name: 'Duplicate Display' }),
    ],
    message: /agent 'dude-pack-roster-second' duplicates display name 'Duplicate Display'/,
  },
  {
    name: 'duplicate roster stems',
    agents: [
      packAgent('roster', 'coordinator', {
        agents: ['dude-pack-roster-child', 'dude-pack-roster-child'],
      }),
      packAgent('roster', 'child'),
    ],
    message: /agent 'dude-pack-roster-coordinator'.*duplicate values/,
  },
  {
    name: 'display-name roster entry',
    agents: [
      packAgent('roster', 'coordinator', { agents: ['Roster Child'] }),
      packAgent('roster', 'child', { name: 'Roster Child' }),
    ],
    message: /agent 'dude-pack-roster-coordinator'.*Roster Child.*stable stem/,
  },
  {
    name: 'self-reference',
    agents: [
      packAgent('roster', 'coordinator', { agents: ['dude-pack-roster-coordinator'] }),
    ],
    message: /agent 'dude-pack-roster-coordinator' must not delegate to itself/,
  },
  {
    name: 'unresolved pack-local reference',
    agents: [
      packAgent('roster', 'coordinator', { agents: ['dude-pack-roster-missing'] }),
    ],
    message: /agent 'dude-pack-roster-coordinator' delegates to unknown stem 'dude-pack-roster-missing'/,
  },
  {
    name: 'non-Dude wildcard',
    agents: [
      packAgent('roster', 'worker', { agents: ['*'] }),
    ],
    message: /agent 'dude-pack-roster-worker' only coordinator stem dude may delegate to \*/,
  },
  {
    name: 'mixed wildcard and explicit roster',
    agents: [
      packAgent('roster', 'coordinator', { agents: ['*', 'dude-pack-roster-child'] }),
      packAgent('roster', 'child'),
    ],
    patch(root) {
      replaceRendererRecordStem(
        root,
        "return { stem: stem.endsWith('-coordinator') ? 'dude' : stem, frontmatter, body };",
      );
    },
    message: /agent 'dude' must not mix wildcard delegation with explicit stems/,
  },
  {
    name: 'empty declared roster',
    agents: [
      packAgent('roster', 'coordinator', { agents: [] }),
    ],
    message: /agent 'dude-pack-roster-coordinator' frontmatter agents must not be empty when declared/,
  },
];

for (const scenario of invalidAgentSetScenarios) {
  test(`add validates the complete incoming set before staging: ${scenario.name}`, async () => {
    const root = createRoot();
    const originalMkdtempSync = fs.mkdtempSync;
    let stageAttempts = 0;
    try {
      writePack(root, 'roster', scenario.agents);
      scenario.patch?.(root);
      const before = mutationSnapshot(root);
      fs.mkdtempSync = (prefix, ...rest) => {
        if (String(prefix).includes('dude-compose-add-')) {
          stageAttempts += 1;
          throw new Error('stage creation must not run for an invalid agent set');
        }
        return originalMkdtempSync(prefix, ...rest);
      };

      const result = await cmdAdd({
        root,
        library: path.join(root, 'library', 'packs'),
        name: 'roster',
        force: false,
      });

      assert.equal(result.ok, false);
      assert.match(result.error || '', scenario.message);
      assert.equal(stageAttempts, 0, 'agent-set validation must precede staging');
      assertMutationUnchanged(root, before);
    } finally {
      fs.mkdtempSync = originalMkdtempSync;
      cleanup(root);
    }
  });
}

test('remove normalizes one host-owned model line but rejects duplicate-model drift', async () => {
  const tolerated = scaffold();
  const drifted = scaffold();
  try {
    const toleratedAdd = await cmdAdd({
      root: tolerated,
      library: path.join(tolerated, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(toleratedAdd.ok, true, toleratedAdd.error);
    const toleratedAgent = path.join(tolerated, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const seeded = fs.readFileSync(toleratedAgent, 'utf8');
    assert.match(seeded, /^model: .+$/m);
    fs.writeFileSync(toleratedAgent, seeded.replace(/^model: .+$/m, 'model: host-selected-model'));
    const toleratedRemove = cmdRemove({ root: tolerated, name: 'demo' });
    assert.equal(toleratedRemove.ok, true, toleratedRemove.error);

    const driftedAdd = await cmdAdd({
      root: drifted,
      library: path.join(drifted, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(driftedAdd.ok, true, driftedAdd.error);
    const driftedAgent = path.join(drifted, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const original = fs.readFileSync(driftedAgent, 'utf8');
    fs.writeFileSync(
      driftedAgent,
      original.replace(/^model: .+$/m, 'model: host-selected-model\nmodel: duplicate-model'),
    );
    const before = mutationSnapshot(drifted);
    const driftedRemove = cmdRemove({ root: drifted, name: 'demo' });
    assert.equal(driftedRemove.ok, false);
    assert.match(driftedRemove.error || '', /no longer matches pack "demo" inventory/);
    assertMutationUnchanged(drifted, before);
  } finally {
    cleanup(tolerated);
    cleanup(drifted);
  }
});

test('remove rejects a raw source model-line tamper and succeeds when the source is unavailable', async () => {
  const changed = scaffold();
  const unavailable = scaffold();
  try {
    const changedAdded = await cmdAdd({
      root: changed,
      library: path.join(changed, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(changedAdded.ok, true, changedAdded.error);
    const sourcePath = path.join(changed, 'library', 'packs', 'demo', 'agents', 'dude-pack-demo-worker.agent.md');
    const sourceBytes = fs.readFileSync(sourcePath, 'utf8');
    // This is syntactically valid frontmatter. It must still alter the raw
    // authoritative-source evidence rather than being treated as a host rewrite.
    fs.writeFileSync(
      sourcePath,
      sourceBytes.replace('model-class: balanced\n', 'model-class: balanced\nmodel: source-tamper\n'),
    );
    const changedBefore = mutationSnapshot(changed);
    const changedRemove = cmdRemove({ root: changed, name: 'demo' });
    assert.equal(changedRemove.ok, false);
    assert.match(changedRemove.error || '', /source artifact .* no longer matches its recorded digest/);
    assertMutationUnchanged(changed, changedBefore);

    const unavailableAdded = await cmdAdd({
      root: unavailable,
      library: path.join(unavailable, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(unavailableAdded.ok, true, unavailableAdded.error);
    fs.rmSync(path.join(unavailable, 'library', 'packs', 'demo'), { recursive: true, force: true });
    const unavailableRemove = cmdRemove({ root: unavailable, name: 'demo' });
    assert.equal(unavailableRemove.ok, true, unavailableRemove.error);
    assertNoPackLeftovers(unavailable, 'demo');
  } finally {
    cleanup(changed);
    cleanup(unavailable);
  }
});

test('remove refuses a symlinked available source without mutating profile or installed artifact', async () => {
  const root = scaffold();
  try {
    // Arrange
    const added = await cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(added.ok, true, added.error);
    const sourcePath = path.join(root, 'library', 'packs', 'demo', 'agents', 'dude-pack-demo-worker.agent.md');
    const tamperedPath = path.join(root, 'tampered-source.agent.md');
    fs.writeFileSync(tamperedPath, `${fs.readFileSync(sourcePath, 'utf8')}tampered\n`);
    fs.rmSync(sourcePath);
    fs.symlinkSync(tamperedPath, sourcePath);
    const profileBefore = profileBytes(root);
    const installedPath = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const installedBytesBefore = fs.readFileSync(installedPath);

    // Act
    const removed = cmdRemove({ root, name: 'demo' });

    // Assert
    assert.equal(removed.ok, false);
    assert.match(removed.error || '', /symbolic link/);
    assert.deepEqual(profileBytes(root), profileBefore, 'profile bytes changed');
    assert.equal(exists(installedPath), true, 'installed artifact was deleted');
    assert.deepEqual(fs.readFileSync(installedPath), installedBytesBefore, 'installed artifact bytes changed');
  } finally {
    cleanup(root);
  }
});

const dependencyFailureScenarios = [
  {
    name: 'missing packaged configuration',
    mutate(root) {
      fs.rmSync(packagedPath(root, 'config', 'agent-models.json'));
    },
    message: /agent model configuration|configuration/,
  },
  {
    name: 'corrupt packaged configuration',
    mutate(root) {
      fs.writeFileSync(packagedPath(root, 'config', 'agent-models.json'), '{ not JSON');
    },
    message: /agent model configuration.*malformed JSON/,
  },
  {
    name: 'schema-invalid packaged configuration',
    mutate(root) {
      const configPath = packagedPath(root, 'config', 'agent-models.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.unexpected = true;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    },
    message: /agent model configuration.*invalid/,
  },
  {
    name: 'empty packaged configuration',
    mutate(root) {
      fs.writeFileSync(packagedPath(root, 'config', 'agent-models.json'), '{}');
    },
    message: /agent model configuration.*invalid/,
  },
  {
    name: 'missing packaged model loader',
    mutate(root) {
      fs.rmSync(packagedPath(root, 'lib', 'agent-model-map.mjs'));
    },
    message: /cannot load packaged agent model loader/,
  },
  {
    // `source` has already imported this exact renderer path during setup.
    name: 'missing packaged renderer after a same-path import',
    reuseInstalledRoot: true,
    mutate(root) {
      fs.rmSync(packagedPath(root, 'lib', 'agent-projection.mjs'));
    },
    message: /cannot load packaged Copilot renderer/,
  },
];

for (const scenario of dependencyFailureScenarios) {
  test(`add and verify fail closed without mutation for ${scenario.name}`, async () => {
    const source = scaffold();
    let root = '';
    try {
      const installed = await cmdAdd({
        root: source,
        library: path.join(source, 'library', 'packs'),
        name: 'demo',
        force: false,
      });
      assert.equal(installed.ok, true, installed.error);
      root = scenario.reuseInstalledRoot ? source : cloneRoot(source);
      scenario.mutate(root);
      const before = mutationSnapshot(root);
      const stages = trackStageDirectories();

      try {
        const add = await cmdAdd({
          root,
          library: path.join(root, 'library', 'packs'),
          name: 'demo',
          force: false,
        });
        assert.equal(add.ok, false);
        assert.match(add.error || '', scenario.message);
        assertMutationUnchanged(root, before);

        const verify = await cmdVerify({ root, library: path.join(root, 'library', 'packs') });
        assert.equal(verify.ok, false);
        assert.match(verify.error || '', scenario.message);
        assertMutationUnchanged(root, before);

        assert.deepEqual(stages.directories, [], 'dependency failures must precede stage creation');
        assertNoSurvivingStageDirectories(stages.directories);

        const listed = cmdList({ root, library: path.join(root, 'library', 'packs') });
        const status = cmdStatus({ root });
        assert.equal(listed.ok, true, listed.error);
        assert.equal(status.ok, true, status.error);

        const removed = cmdRemove({ root, name: 'demo' });
        assert.equal(removed.ok, true, removed.error);
        assertNoPackLeftovers(root, 'demo');
      } finally {
        stages.restore();
      }
    } finally {
      if (root && root !== source) cleanup(root);
      cleanup(source);
    }
  });
}

test('remove, list, and status dispatch with every rendering dependency absent', async () => {
  const source = scaffold();
  let root = '';
  try {
    const installed = await cmdAdd({
      root: source,
      library: path.join(source, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(installed.ok, true, installed.error);
    root = cloneRoot(source);
    fs.rmSync(packagedPath(root, 'config', 'agent-models.json'));
    fs.rmSync(packagedPath(root, 'lib', 'agent-model-map.mjs'));
    fs.rmSync(packagedPath(root, 'lib', 'agent-projection.mjs'));

    assert.equal(cmdList({ root, library: path.join(root, 'library', 'packs') }).ok, true);
    assert.equal(cmdStatus({ root }).ok, true);
    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assertNoPackLeftovers(root, 'demo');
  } finally {
    if (root) cleanup(root);
    cleanup(source);
  }
});

test('a mapping change does not block removal and is used by the next add', async () => {
  const root = scaffold();
  try {
    const library = path.join(root, 'library', 'packs');
    const firstAdd = await cmdAdd({ root, library, name: 'demo', force: false });
    assert.equal(firstAdd.ok, true, firstAdd.error);

    const configPath = packagedPath(root, 'config', 'agent-models.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const previousModel = config.targets.copilot.models.balanced;
    const nextModel = `${previousModel}-mapping-fixture`;
    config.targets.copilot.models.balanced = nextModel;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assertNoPackLeftovers(root, 'demo');

    const secondAdd = await cmdAdd({ root, library, name: 'demo', force: false });
    assert.equal(secondAdd.ok, true, secondAdd.error);
    const rendered = fs.readFileSync(
      path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md'),
      'utf8',
    );
    assert.ok(rendered.includes(`model: ${nextModel}`));
  } finally {
    cleanup(root);
  }
});

test('verify copies and sweeps exactly the four install locations', async () => {
  const root = createRoot();
  const stages = trackStageDirectories();
  try {
    writePack(root, 'good', [], { skill: true });
    fs.writeFileSync(path.join(root, '.github', 'agents', 'dude-pack-good-stale.agent.md'), 'stale\n');
    const staleSkill = path.join(root, '.github', 'skills', 'dude-pack-good-stale');
    fs.mkdirSync(staleSkill, { recursive: true });
    fs.writeFileSync(path.join(staleSkill, 'SKILL.md'), 'stale\n');
    fs.writeFileSync(path.join(root, '.github', 'instructions', 'dude-pack-good-stale.instructions.md'), 'stale\n');
    fs.writeFileSync(path.join(root, '.github', 'prompts', 'dude-pack-good-stale.prompt.md'), 'stale\n');

    const result = await cmdVerify({ root, library: path.join(root, 'library', 'packs') });
    const verified = result.result?.verified.find((entry) => entry.name === 'good');
    assert.ok(verified);
    assert.equal(verified.leftovers, 4);
    assert.equal(result.ok, false);
    assert.ok(stages.directories.some((directory) => path.basename(directory).startsWith('dude-verify-good-')));
    assertNoSurvivingStageDirectories(stages.directories);
  } finally {
    stages.restore();
    cleanup(root);
  }
});

test('compose static import closure excludes projection dependencies', () => {
  const closure = staticModuleClosure(fileURLToPath(new URL('./compose.mjs', import.meta.url)));
  const profileModule = path.resolve(fileURLToPath(new URL('../dude-engine/lib/profile.mjs', import.meta.url)));
  const forbidden = new Set([
    fileURLToPath(new URL('../dude-engine/lib/agent-model-map.mjs', import.meta.url)),
    fileURLToPath(new URL('../dude-engine/lib/agent-projection.mjs', import.meta.url)),
  ].map((modulePath) => path.resolve(modulePath)));

  assert.equal(closure.has(profileModule), true, 'closure walker must include compose relative imports');
  assert.equal(
    [...closure].some((modulePath) => forbidden.has(modulePath)),
    false,
    `static closure reaches a projection dependency: ${[...closure].join(', ')}`,
  );
});

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
  cmdRefresh,
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
 * @param {{ skill?: boolean, instruction?: boolean, prompt?: boolean }} [options]
 * @returns {string}
 */
function writePack(root, name, agents, { skill = true, instruction = false, prompt = false } = {}) {
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
  if (instruction) {
    const directory = path.join(pack, 'instructions');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, `dude-pack-${name}-guide.instructions.md`),
      `# ${name} guide\n`,
    );
  }
  if (prompt) {
    const directory = path.join(pack, 'prompts');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, `dude-pack-${name}-ask.prompt.md`),
      `# ${name} ask\n`,
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
 * Record temporary refresh stage and transaction directories while a test
 * invokes compose. Both the `dude-compose-refresh-<name>-` stage and the
 * `dude-compose-refresh-<name>-txn-` transaction share the tracked substring.
 * @returns {{ directories: string[], restore: () => void }}
 */
function trackRefreshDirectories() {
  const originalMkdtempSync = fs.mkdtempSync;
  /** @type {string[]} */
  const directories = [];
  fs.mkdtempSync = (prefix, ...rest) => {
    const directory = originalMkdtempSync(prefix, ...rest);
    if (String(prefix).includes('dude-compose-refresh-')) {
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

/** @param {string} root @param {string} name */
function addPack(root, name) {
  return cmdAdd({ root, library: path.join(root, 'library', 'packs'), name, force: false });
}

/** @param {string} root @param {string} name @param {{ fetch?: boolean }} [options] */
function refreshPack(root, name, options = {}) {
  return cmdRefresh({ root, library: path.join(root, 'library', 'packs'), name, ...options });
}

/**
 * Rewrite the single fenced JSON payload of an install profile in place,
 * preserving the surrounding document. Used to stage a legacy (inventory-less)
 * entry that still parses but is not fully current.
 * @param {string} root
 * @param {(payload: any) => void} mutate
 */
function rewriteProfileJson(root, mutate) {
  const target = path.join(root, '.dude', 'metadata', 'profile.md');
  const text = fs.readFileSync(target, 'utf8');
  const match = text.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  assert.ok(match, 'profile.md must contain a fenced JSON block');
  const payload = JSON.parse(match[1]);
  mutate(payload);
  fs.writeFileSync(target, text.replace(match[0], `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``));
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

test('refresh rewrites all four artifact kinds and applies add, replace, and remove in one step', async () => {
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'mixed', [packAgent('mixed', 'worker', { name: 'Mixed Worker' })], {
      skill: true,
      instruction: true,
      prompt: true,
    });
    const packDir = path.join(root, 'library', 'packs', 'mixed');
    // A second prompt that the edited source later drops (an old-only removal).
    fs.writeFileSync(path.join(packDir, 'prompts', 'dude-pack-mixed-legacy.prompt.md'), '# mixed legacy\n');

    const added = await addPack(root, 'mixed');
    assert.equal(added.ok, true, added.error);

    // Edit the source: change every kind's content (four replacements), drop the
    // legacy prompt (one removal), and add a new instruction (one addition).
    fs.writeFileSync(
      path.join(packDir, 'agents', 'dude-pack-mixed-worker.agent.md'),
      agentSource({ name: 'Mixed Worker' }).replace('You are Mixed Worker.', 'You are Mixed Worker v2.'),
    );
    fs.writeFileSync(
      path.join(packDir, 'skills', 'dude-pack-mixed-helper', 'SKILL.md'),
      '---\nname: dude-pack-mixed-helper\ndescription: "fixture helper"\n---\n# Helper v2\n',
    );
    fs.writeFileSync(path.join(packDir, 'instructions', 'dude-pack-mixed-guide.instructions.md'), '# mixed guide v2\n');
    fs.writeFileSync(path.join(packDir, 'prompts', 'dude-pack-mixed-ask.prompt.md'), '# mixed ask v2\n');
    fs.rmSync(path.join(packDir, 'prompts', 'dude-pack-mixed-legacy.prompt.md'));
    fs.writeFileSync(path.join(packDir, 'instructions', 'dude-pack-mixed-extra.instructions.md'), '# mixed extra\n');

    const result = await refreshPack(root, 'mixed');
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.result?.replaced, [
      '.github/agents/dude-pack-mixed-worker.agent.md',
      '.github/instructions/dude-pack-mixed-guide.instructions.md',
      '.github/prompts/dude-pack-mixed-ask.prompt.md',
      '.github/skills/dude-pack-mixed-helper',
    ]);
    assert.deepEqual(result.result?.added, ['.github/instructions/dude-pack-mixed-extra.instructions.md']);
    assert.deepEqual(result.result?.removed, ['.github/prompts/dude-pack-mixed-legacy.prompt.md']);

    // New destination exists with its new bytes.
    const extra = path.join(root, '.github', 'instructions', 'dude-pack-mixed-extra.instructions.md');
    assert.equal(exists(extra), true, 'addition missing on disk');
    assert.equal(fs.readFileSync(extra, 'utf8'), '# mixed extra\n');

    // Replaced destinations hold the new projected bytes across all four kinds.
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'agents', 'dude-pack-mixed-worker.agent.md'), 'utf8'),
      /You are Mixed Worker v2\./,
    );
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'skills', 'dude-pack-mixed-helper', 'SKILL.md'), 'utf8'),
      /# Helper v2/,
    );
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'instructions', 'dude-pack-mixed-guide.instructions.md'), 'utf8'),
      /mixed guide v2/,
    );
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'prompts', 'dude-pack-mixed-ask.prompt.md'), 'utf8'),
      /mixed ask v2/,
    );

    // Falsifier: the old-only destination is absent on disk, not merely dropped
    // from the record.
    assert.equal(
      exists(path.join(root, '.github', 'prompts', 'dude-pack-mixed-legacy.prompt.md')),
      false,
      'removed destination still on disk',
    );

    // The record's files and inventory reflect the new destination set.
    const entry = readProfile(root).installed.mixed;
    assert.deepEqual(entry.files.slice().sort(), [
      '.github/agents/dude-pack-mixed-worker.agent.md',
      '.github/instructions/dude-pack-mixed-extra.instructions.md',
      '.github/instructions/dude-pack-mixed-guide.instructions.md',
      '.github/prompts/dude-pack-mixed-ask.prompt.md',
      '.github/skills/dude-pack-mixed-helper',
    ]);
    assert.equal(entry.files.includes('.github/prompts/dude-pack-mixed-legacy.prompt.md'), false);
    assert.equal(entry.inventory?.artifacts.length, 5);

    // The stage and transaction directories were created and then cleaned.
    assert.ok(refreshes.directories.length >= 2, 'refresh must create a stage and a transaction directory');
    assertNoSurvivingStageDirectories(refreshes.directories);
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh reprojects a changed source over the same destination set', async () => {
  const root = createRoot();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);
    const before = readProfile(root).installed.demo;
    const beforeFiles = before.files.slice().sort();
    const beforeAgentHash = before.inventory?.artifacts
      .find((artifact) => artifact.path === '.github/agents/dude-pack-demo-worker.agent.md')?.installed_sha256;
    assert.ok(beforeAgentHash);

    // Content-only change across the same destination set.
    const packDir = path.join(root, 'library', 'packs', 'demo');
    fs.writeFileSync(
      path.join(packDir, 'agents', 'dude-pack-demo-worker.agent.md'),
      agentSource({ name: 'Demo Worker' }).replace('You are Demo Worker.', 'You are Demo Worker changed.'),
    );
    fs.writeFileSync(
      path.join(packDir, 'skills', 'dude-pack-demo-helper', 'SKILL.md'),
      '---\nname: dude-pack-demo-helper\ndescription: "fixture helper"\n---\n# Helper changed\n',
    );

    const result = await refreshPack(root, 'demo');
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.result?.added, []);
    assert.deepEqual(result.result?.removed, []);
    assert.deepEqual(result.result?.replaced, beforeFiles);

    const after = readProfile(root).installed.demo;
    assert.deepEqual(after.files.slice().sort(), beforeFiles, 'file set changed on a content-only refresh');
    const afterAgentHash = after.inventory?.artifacts
      .find((artifact) => artifact.path === '.github/agents/dude-pack-demo-worker.agent.md')?.installed_sha256;
    assert.notEqual(afterAgentHash, beforeAgentHash, 'inventory hash unchanged despite a content change');

    assert.match(
      fs.readFileSync(path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md'), 'utf8'),
      /You are Demo Worker changed\./,
    );
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'skills', 'dude-pack-demo-helper', 'SKILL.md'), 'utf8'),
      /# Helper changed/,
    );
  } finally {
    cleanup(root);
  }
});

test('refresh refuses a hand-edited installed artifact and preserves the drift', async () => {
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);

    // Change the source so a refresh would otherwise proceed, then hand-edit the
    // installed artifact so the installed-side hash no longer matches.
    const packDir = path.join(root, 'library', 'packs', 'demo');
    fs.writeFileSync(path.join(packDir, 'skills', 'dude-pack-demo-helper', 'SKILL.md'), '---\nname: dude-pack-demo-helper\ndescription: "fixture helper"\n---\n# Helper changed\n');
    const installedAgent = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const drifted = `${fs.readFileSync(installedAgent, 'utf8')}\nhand edit\n`;
    fs.writeFileSync(installedAgent, drifted);

    const before = mutationSnapshot(root);
    const result = await refreshPack(root, 'demo');

    assert.equal(result.ok, false);
    assert.match(result.error || '', /installed artifact '.*' no longer matches pack "demo" inventory; refusing refresh/);
    assertMutationUnchanged(root, before);
    assert.equal(fs.readFileSync(installedAgent, 'utf8'), drifted, 'drifted bytes were not preserved');
    // The refusal precedes staging.
    assertNoSurvivingStageDirectories(refreshes.directories);
    assert.deepEqual(refreshes.directories, [], 'installed-drift refusal must precede staging');
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh refuses an absent pack and a non-current profile without mutating', async () => {
  const absent = createRoot();
  const nonCurrent = createRoot();
  try {
    // Absent pack: nothing is installed to refresh.
    writePack(absent, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const absentBefore = mutationSnapshot(absent);
    const absentResult = await refreshPack(absent, 'demo');
    assert.equal(absentResult.ok, false);
    assert.match(absentResult.error || '', /pack "demo" refresh requires a complete current inventory/);
    assertMutationUnchanged(absent, absentBefore);

    // Non-current profile: a second installed pack carries only a legacy record,
    // so the whole profile is not fully current even though the target is.
    writePack(nonCurrent, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    writePack(nonCurrent, 'extra', [packAgent('extra', 'aide', { name: 'Extra Aide' })], { skill: false });
    assert.equal((await addPack(nonCurrent, 'demo')).ok, true);
    assert.equal((await addPack(nonCurrent, 'extra')).ok, true);
    rewriteProfileJson(nonCurrent, (payload) => {
      delete payload.installed.extra.inventory;
    });
    const nonCurrentBefore = mutationSnapshot(nonCurrent);
    const nonCurrentResult = await refreshPack(nonCurrent, 'demo');
    assert.equal(nonCurrentResult.ok, false);
    assert.match(
      nonCurrentResult.error || '',
      /refusing to refresh pack "demo": the install profile is not fully current/,
    );
    assertMutationUnchanged(nonCurrent, nonCurrentBefore);
  } finally {
    cleanup(absent);
    cleanup(nonCurrent);
  }
});

test('refresh refuses an unresolvable source without mutating', async () => {
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);
    fs.rmSync(path.join(root, 'library', 'packs', 'demo'), { recursive: true, force: true });

    const before = mutationSnapshot(root);
    const result = await refreshPack(root, 'demo', { fetch: false });

    assert.equal(result.ok, false);
    assert.match(result.error || '', /pack not found in catalog/);
    assertMutationUnchanged(root, before);
    assertNoSurvivingStageDirectories(refreshes.directories);
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh refuses a new destination occupied by a foreign artifact', async () => {
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);

    // The edited source ships a would-be addition, but a foreign artifact already
    // occupies its destination.
    const packDir = path.join(root, 'library', 'packs', 'demo');
    fs.mkdirSync(path.join(packDir, 'instructions'), { recursive: true });
    fs.writeFileSync(path.join(packDir, 'instructions', 'dude-pack-demo-guide.instructions.md'), '# demo guide\n');
    const occupied = path.join(root, '.github', 'instructions', 'dude-pack-demo-guide.instructions.md');
    fs.writeFileSync(occupied, '# pre-existing foreign artifact\n');

    const before = mutationSnapshot(root);
    const result = await refreshPack(root, 'demo');

    assert.equal(result.ok, false);
    assert.match(result.error || '', /already exists as a core, project, or foreign artifact/);
    assertMutationUnchanged(root, before);
    assert.equal(fs.readFileSync(occupied, 'utf8'), '# pre-existing foreign artifact\n', 'foreign artifact was altered');
    assertNoSurvivingStageDirectories(refreshes.directories);
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh refuses when the profile changes after authorization', async () => {
  const root = createRoot();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);

    // A changed source keeps refresh on its success path up to the reread.
    const packDir = path.join(root, 'library', 'packs', 'demo');
    fs.writeFileSync(path.join(packDir, 'skills', 'dude-pack-demo-helper', 'SKILL.md'), '---\nname: dude-pack-demo-helper\ndescription: "fixture helper"\n---\n# Helper changed\n');

    const profileAbs = path.join(root, '.dude', 'metadata', 'profile.md');
    const before = mutationSnapshot(root);
    const originalReadFileSync = fs.readFileSync;
    let profileReads = 0;
    // Return tampered bytes only on the second read of the profile — the reread
    // that re-establishes authority — without mutating the file on disk.
    fs.readFileSync = (file, ...rest) => {
      if (typeof file === 'string' && path.resolve(file) === path.resolve(profileAbs)) {
        profileReads += 1;
        if (profileReads === 2) {
          return Buffer.concat([originalReadFileSync(file), Buffer.from('\n')]);
        }
      }
      return originalReadFileSync(file, ...rest);
    };
    let result;
    try {
      result = await refreshPack(root, 'demo');
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    assert.equal(result.ok, false);
    assert.match(result.error || '', /profile changed after authorizing refresh of pack "demo"; refusing refresh/);
    assert.equal(profileReads, 2, 'refresh must reread the profile exactly once after authorizing');
    assertMutationUnchanged(root, before);
  } finally {
    cleanup(root);
  }
});

test('refresh rolls back every mutation and leaves no residue when a phase-2 write fails', async () => {
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  const originalWriteFileSync = fs.writeFileSync;
  try {
    writePack(root, 'mixed', [packAgent('mixed', 'worker', { name: 'Mixed Worker' })], {
      skill: true,
      instruction: true,
      prompt: true,
    });
    const packDir = path.join(root, 'library', 'packs', 'mixed');
    fs.writeFileSync(path.join(packDir, 'prompts', 'dude-pack-mixed-legacy.prompt.md'), '# mixed legacy\n');
    const added = await addPack(root, 'mixed');
    assert.equal(added.ok, true, added.error);

    // Edit the source so the transaction applies a replacement, an addition, and
    // a removal before the profile write fails.
    fs.writeFileSync(path.join(packDir, 'instructions', 'dude-pack-mixed-guide.instructions.md'), '# mixed guide v2\n');
    fs.writeFileSync(path.join(packDir, 'prompts', 'dude-pack-mixed-followup.prompt.md'), '# mixed followup\n');
    fs.rmSync(path.join(packDir, 'prompts', 'dude-pack-mixed-legacy.prompt.md'));

    const before = mutationSnapshot(root);
    // Fail the atomic profile write (its temp sibling) after every artifact
    // mutation has been applied, forcing a full rollback.
    fs.writeFileSync = (file, ...rest) => {
      if (typeof file === 'string' && path.basename(file).startsWith('profile.md.tmp-')) {
        throw new Error('injected profile write failure');
      }
      return originalWriteFileSync(file, ...rest);
    };

    const result = await refreshPack(root, 'mixed');

    fs.writeFileSync = originalWriteFileSync;
    assert.equal(result.ok, false);
    assert.match(result.error || '', /pack refresh failed and was rolled back: injected profile write failure/);

    // Every artifact and the profile are byte-identical to the pre-refresh state.
    assertMutationUnchanged(root, before);
    // No addition remains.
    assert.equal(
      exists(path.join(root, '.github', 'prompts', 'dude-pack-mixed-followup.prompt.md')),
      false,
      'addition survived rollback',
    );
    // No removal is missing.
    assert.equal(
      exists(path.join(root, '.github', 'prompts', 'dude-pack-mixed-legacy.prompt.md')),
      true,
      'removed destination was not restored',
    );
    // No stage or transaction directory survives.
    assert.ok(refreshes.directories.length >= 2, 'stage and transaction directories were created');
    assertNoSurvivingStageDirectories(refreshes.directories);
    // No profile-transaction residue remains.
    const residue = fs.readdirSync(path.join(root, '.dude', 'metadata'))
      .filter((entry) => entry.startsWith('profile.md.tmp-') || entry.startsWith('profile.md.backup-'));
    assert.deepEqual(residue, [], 'profile transaction residue survived');
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh preserves the remove digest guard and the add --force semantics', async () => {
  // add --force still overwrites an occupied agent destination.
  const overwrite = createRoot();
  // add --force still refuses an occupied instruction destination.
  const protectedInstruction = createRoot();
  // remove refuses a changed source that refresh nonetheless accepts (FR-011).
  const changed = createRoot();
  try {
    writePack(overwrite, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const agentDest = path.join(overwrite, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    fs.writeFileSync(agentDest, '# foreign agent\n');
    const denied = await cmdAdd({ root: overwrite, library: path.join(overwrite, 'library', 'packs'), name: 'demo', force: false });
    assert.equal(denied.ok, false);
    assert.match(denied.error || '', /already exists as a core, project, or foreign artifact/);
    const forced = await cmdAdd({ root: overwrite, library: path.join(overwrite, 'library', 'packs'), name: 'demo', force: true });
    assert.equal(forced.ok, true, forced.error);
    assert.match(fs.readFileSync(agentDest, 'utf8'), /You are Demo Worker\./);

    writePack(protectedInstruction, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: false, instruction: true });
    const instructionDest = path.join(protectedInstruction, '.github', 'instructions', 'dude-pack-demo-guide.instructions.md');
    fs.writeFileSync(instructionDest, '# foreign instruction\n');
    const forcedInstruction = await cmdAdd({ root: protectedInstruction, library: path.join(protectedInstruction, 'library', 'packs'), name: 'demo', force: true });
    assert.equal(forcedInstruction.ok, false);
    assert.match(forcedInstruction.error || '', /already exists as a core, project, or foreign artifact/);
    assert.equal(fs.readFileSync(instructionDest, 'utf8'), '# foreign instruction\n', 'force must not overwrite an instruction');
    assert.equal(
      exists(path.join(protectedInstruction, '.github', 'agents', 'dude-pack-demo-worker.agent.md')),
      false,
      'a refused add must not write any artifact',
    );

    writePack(changed, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    assert.equal((await addPack(changed, 'demo')).ok, true);
    const sourceAgent = path.join(changed, 'library', 'packs', 'demo', 'agents', 'dude-pack-demo-worker.agent.md');
    fs.writeFileSync(
      sourceAgent,
      fs.readFileSync(sourceAgent, 'utf8').replace('You are Demo Worker.', 'You are Demo Worker changed.'),
    );
    const removeBefore = mutationSnapshot(changed);
    const removed = cmdRemove({ root: changed, name: 'demo' });
    assert.equal(removed.ok, false);
    assert.match(removed.error || '', /no longer matches its recorded digest/);
    assertMutationUnchanged(changed, removeBefore);
    const refreshed = await refreshPack(changed, 'demo');
    assert.equal(refreshed.ok, true, refreshed.error);
    assert.match(
      fs.readFileSync(path.join(changed, '.github', 'agents', 'dude-pack-demo-worker.agent.md'), 'utf8'),
      /You are Demo Worker changed\./,
    );
  } finally {
    cleanup(overwrite);
    cleanup(protectedInstruction);
    cleanup(changed);
  }
});

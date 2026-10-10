// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess, { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  cmdAdd,
  cmdList,
  cmdPreviewRefresh,
  cmdRefresh,
  cmdRemove,
  cmdStatus,
  cmdVerify,
  readProfile,
} from './compose.mjs';
import {
  MAX_ADDED_SOURCES,
  PACK_SOURCES_PATH,
  PackSourceError,
  describeBuiltinSources,
  describePackSources,
  matchesRecordedSource,
  parsePackSourcesDocument,
  readPackSources,
  serializePackSourcesDocument,
  validateNewSource,
  writePackSources,
} from '../dude-engine/lib/pack-sources.mjs';

const ENGINE_LIB = fileURLToPath(new URL('../dude-engine/lib/', import.meta.url));
const MODEL_CONFIG_SOURCE = fileURLToPath(new URL('../../config/agent-models.json', import.meta.url));
const INSTALL_LOCATIONS = [
  '.github/agents',
  '.github/skills',
  '.github/instructions',
  '.github/prompts',
];
const COMPOSE_SOURCE = fileURLToPath(new URL('./compose.mjs', import.meta.url));

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

/** @returns {string} */
function createReleasedRoot() {
  const root = createRoot();
  fs.rmSync(path.join(root, 'library'), { recursive: true, force: true });
  return root;
}

/** @param {string} cwd @param {...string} args */
function runGit(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout || 'no output'}`,
  );
  return result.stdout.trim();
}

/**
 * Write one minimal remote pack whose source and rendered bytes identify the
 * published revision.
 * @param {string} repo
 * @param {string} name
 * @param {string} version
 * @param {{ useCases?: string[] }} [options]
 */
function writeRemotePack(repo, name, version, { useCases } = {}) {
  const pack = path.join(repo, 'library', 'packs', name);
  fs.rmSync(pack, { recursive: true, force: true });
  fs.mkdirSync(path.join(pack, 'agents'), { recursive: true });
  const useCasesLine = useCases === undefined
    ? ''
    : `use-cases: [${useCases.map((useCase) => JSON.stringify(useCase)).join(', ')}]\n`;
  fs.writeFileSync(
    path.join(pack, 'pack.md'),
    `---\nname: ${name}\ndescription: ${JSON.stringify(`${name} catalog ${version}`)}\n${useCasesLine}---\n# ${name} ${version}\n`,
  );
  fs.writeFileSync(
    path.join(pack, 'agents', `dude-pack-${name}-worker.agent.md`),
    agentSource({ name: `${name} ${version}` }),
  );
}

/** @param {string} repo @param {string} message */
function commitRemote(repo, message) {
  runGit(repo, 'add', '-A');
  runGit(repo, '-c', 'user.email=fixture@example.test', '-c', 'user.name=Remote Fixture', 'commit', '-qm', message);
  return runGit(repo, 'rev-parse', 'HEAD');
}

/**
 * Create a Git worktree used only through its file URL, so compose follows its
 * production remote-clone branch rather than its local-directory shortcut.
 * @returns {{ parent: string, repo: string, source: string }}
 */
function createRemoteCatalog() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-remote-'));
  const repo = path.join(parent, 'catalog');
  fs.mkdirSync(repo);
  runGit(repo, 'init', '-q', '-b', 'main');
  return { parent, repo, source: pathToFileURL(repo).href };
}

/** @param {string} root @param {string} source @param {string} ref */
function writeManifestSource(root, source, ref) {
  const target = path.join(root, '.dude', 'metadata', 'bundle-manifest.md');
  fs.writeFileSync(target, `# Bundle Manifest\n\n\`\`\`json\n${JSON.stringify({ source_repo: source, source_ref: ref })}\n\`\`\`\n`);
}

/** @param {Awaited<ReturnType<typeof cmdList>>} listed @param {string} name @param {string} description */
function assertListedDescription(listed, name, description) {
  assert.equal(listed.ok, true, listed.error);
  const pack = listed.result?.packs.find((candidate) => candidate.name === name);
  assert.equal(pack?.description, description);
}

/** @param {string} root @param {string} name @param {string} version */
function assertInstalledVersion(root, name, version) {
  assert.match(
    fs.readFileSync(path.join(root, '.github', 'agents', `dude-pack-${name}-worker.agent.md`), 'utf8'),
    new RegExp(`You are ${name} ${version}\\.`),
  );
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
 * @param {{ skill?: boolean, instruction?: boolean, prompt?: boolean, useCases?: string[] }} [options]
 * @returns {string}
 */
function writePack(root, name, agents, {
  skill = true,
  instruction = false,
  prompt = false,
  useCases,
} = {}) {
  const pack = path.join(root, 'library', 'packs', name);
  fs.mkdirSync(pack, { recursive: true });
  const useCasesLine = useCases === undefined
    ? ''
    : `use-cases: [${useCases.map((useCase) => JSON.stringify(useCase)).join(', ')}]\n`;
  fs.writeFileSync(
    path.join(pack, 'pack.md'),
    `---\nname: ${name}\ndescription: ${JSON.stringify(`${name} fixture pack`)}\n${useCasesLine}---\n# ${name}\n`,
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

/**
 * Add a raw use-cases declaration to an otherwise ordinary fixture manifest.
 * This intentionally permits malformed values for consumer failure tests.
 * @param {string} root
 * @param {string} name
 * @param {string} declaration
 */
function appendUseCasesDeclaration(root, name, declaration) {
  const manifest = path.join(root, 'library', 'packs', name, 'pack.md');
  const content = fs.readFileSync(manifest, 'utf8');
  const closingFence = content.indexOf('\n---\n', 4);
  assert.notEqual(closingFence, -1, 'fixture manifest must have a closing frontmatter fence');
  fs.writeFileSync(
    manifest,
    `${content.slice(0, closingFence)}\nuse-cases: ${declaration}${content.slice(closingFence)}`,
  );
}

/**
 * Invoke the source Compose CLI against one fixture root.
 * @param {string} root
 * @param {...string} args
 */
function runCompose(root, ...args) {
  const result = spawnSync(
    process.execPath,
    [COMPOSE_SOURCE, '--root', root, ...args],
    { encoding: 'utf8' },
  );
  assert.equal(result.error, undefined, `source compose CLI could not start: ${result.error?.message || 'unknown error'}`);
  return result;
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

/** @param {string} root @param {string} name */
function writeCompletePredecessorProfile(root, name) {
  const files = readProfile(root).installed[name].files;
  const inventory = {
    version: 1,
    pack: name,
    source: { type: 'library', location: fs.realpathSync(path.join(root, 'library', 'packs')), ref: '' },
    manifest_sha256: 'a'.repeat(64),
    artifacts: files.map((file) => {
      const kind = file.split('/')[1];
      return {
        path: file,
        kind,
        source: `${kind}/${file.split('/').at(-1)}`,
        source_sha256: 'b'.repeat(64),
        installed_sha256: 'c'.repeat(64),
      };
    }),
    digest: '',
  };
  inventory.digest = crypto.createHash('sha256').update(JSON.stringify({
    version: inventory.version,
    pack: inventory.pack,
    source: inventory.source,
    manifest_sha256: inventory.manifest_sha256,
    artifacts: [...inventory.artifacts].sort((first, second) => first.path.localeCompare(second.path)),
  })).digest('hex');
  const predecessor = {
    enabled_packs: [name],
    installed: {
      [name]: {
        files,
        installed_at: '2026-08-01T12:00:00.000Z',
        inventory,
      },
    },
  };
  fs.writeFileSync(
    path.join(root, '.dude', 'metadata', 'profile.md'),
    `# Install Profile\n\n\`\`\`json\n${JSON.stringify(predecessor, null, 2)}\n\`\`\`\n`,
  );
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

test('list adds declared and omitted use-cases without changing existing fields or catalog order', async () => {
  const root = createRoot();
  try {
    // Arrange: one installed declared pack and one omitted declaration.
    writePack(root, 'alpha', [packAgent('alpha', 'worker')], {
      skill: false,
      useCases: ['writing', 'ui'],
    });
    writePack(root, 'beta', [packAgent('beta', 'worker')], { skill: false });
    const added = await addPack(root, 'alpha');
    assert.equal(added.ok, true, added.error);

    // Act.
    const listed = await cmdList({ root, library: path.join(root, 'library', 'packs') });

    // Assert: pre-existing values and catalog order remain stable; discovery is additive.
    assert.equal(listed.ok, true, listed.error);
    assert.deepEqual(listed.result, {
      packs: [
        {
          name: 'alpha',
          installed: true,
          description: 'alpha fixture pack',
          use_cases: ['writing', 'ui'],
        },
        {
          name: 'beta',
          installed: false,
          description: 'beta fixture pack',
          use_cases: [],
        },
      ],
      enabled_packs: ['alpha'],
      origin: 'local',
    });
    assert.deepEqual(Object.keys(readProfile(root).installed.alpha).sort(), ['files', 'source']);

    // A malformed present value reports its pack context and leaves list read-only.
    writePack(root, 'broken', [], { skill: false });
    appendUseCasesDeclaration(root, 'broken', 'not-a-list');
    const beforeMalformedList = mutationSnapshot(root);
    const malformed = await cmdList({ root, library: path.join(root, 'library', 'packs') });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.code, 2);
    assert.match(malformed.error || '', /pack "broken" has invalid metadata: .*use-cases.*must be a list/);
    assertMutationUnchanged(root, beforeMalformedList);
  } finally {
    cleanup(root);
  }
});

test('cmdList filters overlapping use cases by exact membership in catalog order and accepts no match', async () => {
  const root = createRoot();
  try {
    // Arrange: `writing` overlaps while the valid nearby identifier must not match it.
    writePack(root, 'alpha', [packAgent('alpha', 'worker')], {
      skill: false,
      useCases: ['writing', 'ui'],
    });
    writePack(root, 'bravo', [packAgent('bravo', 'worker')], {
      skill: false,
      useCases: ['api', 'writing'],
    });
    writePack(root, 'charlie', [packAgent('charlie', 'worker')], {
      skill: false,
      useCases: ['writing-tools'],
    });
    const library = path.join(root, 'library', 'packs');

    // Act.
    const filtered = await cmdList({ root, library, useCase: 'writing' });
    const noMatch = await cmdList({ root, library, useCase: 'release-management' });

    // Assert.
    assert.equal(filtered.ok, true, filtered.error);
    assert.deepEqual(filtered.result?.packs.map((pack) => pack.name), ['alpha', 'bravo']);
    assert.deepEqual(filtered.result?.packs.map((pack) => pack.use_cases), [
      ['writing', 'ui'],
      ['api', 'writing'],
    ]);
    assert.deepEqual(filtered.result?.enabled_packs, []);
    assert.equal(filtered.result?.origin, 'local');
    assert.equal(noMatch.ok, true, noMatch.error);
    assert.equal(noMatch.code, 0);
    assert.deepEqual(noMatch.result?.packs, []);
  } finally {
    cleanup(root);
  }
});

test('cmdList rejects an invalid programmatic filter before resolving a released-root source', async () => {
  const root = createReleasedRoot();
  try {
    // Arrange: reaching catalog resolution would attempt this unavailable source.
    const library = path.join(root, 'library', 'packs');
    assert.equal(exists(path.join(root, 'library')), false);

    // Act.
    const result = await cmdList({
      root,
      library,
      source: 'file:///definitely-missing-use-case-source',
      useCase: 'writing--tools',
    });

    // Assert: the usage error wins before profile/catalog/source work.
    assert.deepEqual(result, {
      ok: false,
      code: 1,
      error: 'invalid use case: "writing--tools"',
    });
  } finally {
    cleanup(root);
  }
});

test('source CLI keeps unfiltered human lines and aligns human and JSON use-case results', () => {
  const root = createRoot();
  try {
    // Arrange.
    writePack(root, 'alpha', [packAgent('alpha', 'worker')], {
      skill: false,
      useCases: ['writing', 'ui'],
    });
    writePack(root, 'bravo', [packAgent('bravo', 'worker')], {
      skill: false,
      useCases: ['api', 'writing'],
    });
    writePack(root, 'charlie', [packAgent('charlie', 'worker')], { skill: false });

    // Act.
    const unfiltered = runCompose(root, 'list');
    const human = runCompose(root, 'list', '--use-case', 'writing');
    const json = runCompose(root, 'list', '--use-case', 'writing', '--json');
    const emptyHuman = runCompose(root, 'list', '--use-case', 'release-management');
    const emptyJson = runCompose(root, 'list', '--use-case', 'release-management', '--json');

    // Assert: the unfiltered human contract is unchanged and both filtered modes agree.
    assert.equal(unfiltered.status, 0, unfiltered.stderr);
    assert.equal(
      unfiltered.stdout,
      '[ ] alpha — alpha fixture pack\n[ ] bravo — bravo fixture pack\n[ ] charlie — charlie fixture pack\n',
    );
    assert.equal(unfiltered.stderr, '');
    assert.equal(human.status, 0, human.stderr);
    assert.equal(human.stdout, '[ ] alpha — alpha fixture pack\n[ ] bravo — bravo fixture pack\n');
    assert.equal(human.stderr, '');
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout), {
      ok: true,
      packs: [
        {
          name: 'alpha',
          installed: false,
          description: 'alpha fixture pack',
          use_cases: ['writing', 'ui'],
        },
        {
          name: 'bravo',
          installed: false,
          description: 'bravo fixture pack',
          use_cases: ['api', 'writing'],
        },
      ],
      enabled_packs: [],
      origin: 'local',
    });
    assert.equal(emptyHuman.status, 0, emptyHuman.stderr);
    assert.equal(emptyHuman.stdout, 'No packs match use case "release-management".\n');
    assert.equal(emptyHuman.stderr, '');
    assert.equal(emptyJson.status, 0, emptyJson.stderr);
    assert.deepEqual(JSON.parse(emptyJson.stdout), {
      ok: true,
      packs: [],
      enabled_packs: [],
      origin: 'local',
    });
  } finally {
    cleanup(root);
  }
});

test('source CLI rejects missing, repeated, invalid, flag-valued, and non-list use-case filters', () => {
  const root = createRoot();
  try {
    /** @type {Array<{ name: string, args: string[], error: string }>} */
    const cases = [
      {
        name: 'missing value',
        args: ['list', '--use-case'],
        error: '--use-case requires an identifier',
      },
      {
        name: 'repeated flag',
        args: ['list', '--use-case', 'writing', '--use-case', 'ui'],
        error: '--use-case may be specified only once',
      },
      {
        name: 'invalid identifier',
        args: ['list', '--use-case', 'Writing'],
        error: 'invalid use case: "Writing"',
      },
      {
        name: 'another flag as the value',
        args: ['list', '--use-case', '--no-fetch'],
        error: '--use-case requires an identifier',
      },
      {
        name: 'non-list command',
        args: ['status', '--use-case', 'writing'],
        error: '--use-case is only supported by list',
      },
    ];

    // Arrange / Act / Assert: every malformed use is a CLI usage error.
    for (const scenario of cases) {
      const result = runCompose(root, ...scenario.args);
      assert.equal(result.status, 1, `${scenario.name}: ${result.stderr}`);
      assert.equal(result.stdout, '', `${scenario.name}: unexpected standard output`);
      assert.equal(result.stderr, `[FAIL] ${scenario.error}\n`, scenario.name);
    }
  } finally {
    cleanup(root);
  }
});

test('a file URL catalog on a released root lists declared and omitted metadata unfiltered and filtered', async () => {
  const remote = createRemoteCatalog();
  const root = createReleasedRoot();
  const library = path.join(root, 'library', 'packs');
  try {
    // Arrange: file:// takes the remote-clone source branch, not the local shortcut.
    writeRemotePack(remote.repo, 'declared', 'A', { useCases: ['writing', 'web-development'] });
    writeRemotePack(remote.repo, 'omitted', 'A');
    commitRemote(remote.repo, 'publish discovery fixtures');
    writeManifestSource(root, remote.source, 'main');
    assert.equal(exists(path.join(root, 'library')), false, 'fixture must retain released-root shape');

    // Act.
    const unfiltered = await cmdList({ root, library });
    const filtered = await cmdList({ root, library, useCase: 'writing' });

    // Assert.
    assert.equal(unfiltered.ok, true, unfiltered.error);
    assert.deepEqual(unfiltered.result, {
      packs: [
        {
          name: 'declared',
          installed: false,
          description: 'declared catalog A',
          use_cases: ['writing', 'web-development'],
        },
        {
          name: 'omitted',
          installed: false,
          description: 'omitted catalog A',
          use_cases: [],
        },
      ],
      enabled_packs: [],
      origin: `${remote.source} @ main`,
    });
    assert.equal(filtered.ok, true, filtered.error);
    assert.deepEqual(filtered.result?.packs.map((pack) => pack.name), ['declared']);
    assert.equal(filtered.result?.origin, `${remote.source} @ main`);
    assert.equal(exists(path.join(root, 'library')), false, 'remote listing must not create a local catalog');
  } finally {
    cleanup(root);
    cleanup(remote.parent);
  }
});

test('lifecycle accepts omitted metadata, rejects malformed present metadata before mutation, and removes without source', async () => {
  const root = createRoot();
  try {
    // Arrange: ordinary manifests omit metadata by default; a second fixture is malformed.
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    writePack(root, 'invalid', [packAgent('invalid', 'worker')], { skill: false });
    appendUseCasesDeclaration(root, 'invalid', 'not-a-list');
    const invalidAddBefore = mutationSnapshot(root);
    const addStages = trackStageDirectories();
    let invalidAdd;
    try {
      invalidAdd = await addPack(root, 'invalid');
    } finally {
      addStages.restore();
    }

    // Assert malformed add fails before staging or any artifact/profile mutation.
    assert.equal(invalidAdd.ok, false);
    assert.equal(invalidAdd.code, 2);
    assert.match(invalidAdd.error || '', /pack "invalid" has invalid metadata: .*use-cases.*must be a list/);
    assert.deepEqual(addStages.directories, []);
    assertMutationUnchanged(root, invalidAddBefore);

    // Act: omitted metadata remains valid across add, preview, and refresh.
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);
    const previewBefore = mutationSnapshot(root);
    const preview = await cmdPreviewRefresh({ root, library: path.join(root, 'library', 'packs'), name: 'demo' });
    assert.equal(preview.ok, true, preview.error);
    assertMutationUnchanged(root, previewBefore);
    const refreshed = await refreshPack(root, 'demo');
    assert.equal(refreshed.ok, true, refreshed.error);
    assert.equal(Object.hasOwn(readProfile(root).installed.demo, 'use_cases'), false);

    // Assert malformed current metadata fails both refresh paths before staging or mutation.
    appendUseCasesDeclaration(root, 'demo', 'not-a-list');
    const invalidRefreshBefore = mutationSnapshot(root);
    const refreshStages = trackRefreshDirectories();
    let invalidPreview;
    let invalidRefresh;
    try {
      invalidPreview = await cmdPreviewRefresh({
        root,
        library: path.join(root, 'library', 'packs'),
        name: 'demo',
      });
      invalidRefresh = await refreshPack(root, 'demo');
    } finally {
      refreshStages.restore();
    }
    for (const result of [invalidPreview, invalidRefresh]) {
      assert.equal(result.ok, false);
      assert.equal(result.code, 2);
      assert.match(result.error || '', /pack "demo" has invalid metadata: .*use-cases.*must be a list/);
    }
    assert.deepEqual(refreshStages.directories, []);
    assertMutationUnchanged(root, invalidRefreshBefore);

    // Remove consults only installed-profile authority, even once the source is unavailable.
    fs.rmSync(path.join(root, 'library', 'packs', 'demo'), { recursive: true, force: true });
    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assertNoPackLeftovers(root, 'demo');
  } finally {
    cleanup(root);
  }
});

test('verify preserves source-lint results across discovery metadata and install state', async () => {
  const root = createRoot();
  try {
    fs.writeFileSync(
      packagedPath(root, 'SKILL.md'),
      '---\nname: dude-engine\ndescription: fixture engine\n---\n# Engine\n',
    );
    writeManifestSource(root, 'https://example.invalid/dude', 'main');
    writePack(root, 'good', [], { skill: true });
    const library = path.join(root, 'library', 'packs');

    async function verify() {
      const before = mutationSnapshot(root);
      const result = await cmdVerify({ root, library });
      assertMutationUnchanged(root, before);
      return result;
    }

    const omittedUninstalled = await verify();
    assert.deepEqual(omittedUninstalled, {
      ok: true,
      code: 0,
      result: {
        verified: [{ name: 'good', warnings: 1, failures: 0, leftovers: 0 }],
        profile: { status: 'absent' },
      },
    });

    appendUseCasesDeclaration(root, 'good', 'not-a-list');
    const malformedUninstalled = await verify();
    assert.deepEqual(malformedUninstalled, omittedUninstalled);

    writePack(root, 'good', [], { skill: true });
    const added = await addPack(root, 'good');
    assert.equal(added.ok, true, added.error);
    const omittedInstalled = await verify();
    assert.deepEqual(omittedInstalled, {
      ok: true,
      code: 0,
      result: {
        verified: omittedUninstalled.result?.verified,
        profile: { status: 'valid', path: '.dude/metadata/profile.md' },
      },
    });

    appendUseCasesDeclaration(root, 'good', 'not-a-list');
    const malformedInstalled = await verify();
    assert.deepEqual(malformedInstalled, omittedInstalled);
  } finally {
    cleanup(root);
  }
});

test('verify retains its manifest-name check while ignoring discovery metadata', async () => {
  const root = createRoot();
  try {
    // Arrange: this was a pre-discovery staging failure, not metadata validation.
    writePack(root, 'good', [], { skill: true });
    const manifest = path.join(root, 'library', 'packs', 'good', 'pack.md');
    fs.writeFileSync(
      manifest,
      fs.readFileSync(manifest, 'utf8').replace('name: good', 'name: other'),
    );
    const before = mutationSnapshot(root);
    const expected = {
      ok: false,
      code: 2,
      result: {
        verified: [{
          name: 'good',
          warnings: 0,
          failures: 1,
          leftovers: 0,
          error: 'pack.md name "other" does not match directory "good"',
        }],
        profile: { status: 'absent' },
      },
    };
    const library = path.join(root, 'library', 'packs');

    // Act: malformed discovery metadata must not mask verify's original name check.
    const omitted = await cmdVerify({ root, library });
    appendUseCasesDeclaration(root, 'good', 'not-a-list');
    const malformed = await cmdVerify({ root, library });

    // Assert: both source forms preserve the exact pre-existing failure and stay read-only.
    assert.deepEqual(omitted, expected);
    assert.deepEqual(malformed, omitted);
    assertMutationUnchanged(root, before);
  } finally {
    cleanup(root);
  }
});

test('remote manifest branch re-fetches current bytes for released-bundle list, add, and refresh', async () => {
  const remote = createRemoteCatalog();
  const root = createReleasedRoot();
  const library = path.join(root, 'library', 'packs');
  try {
    writeRemotePack(remote.repo, 'demo', 'A');
    commitRemote(remote.repo, 'publish A');
    writeManifestSource(root, remote.source, 'main');
    assert.equal(exists(path.join(root, 'library')), false, 'consumer must have the released-bundle shape');

    // Arrange: list creates the first remote checkout at A.
    assertListedDescription(await cmdList({ root, library }), 'demo', 'demo catalog A');

    // Act/Assert: each later consumer runs after a new branch publication.
    writeRemotePack(remote.repo, 'demo', 'B');
    commitRemote(remote.repo, 'publish B');
    assertListedDescription(await cmdList({ root, library }), 'demo', 'demo catalog B');

    writeRemotePack(remote.repo, 'demo', 'C');
    const commitC = commitRemote(remote.repo, 'publish C');
    const added = await cmdAdd({ root, library, name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    assertInstalledVersion(root, 'demo', 'C');
    assert.deepEqual(readProfile(root).installed.demo.source, {
      type: 'remote',
      repository: remote.source,
      requested_ref: 'main',
      resolved_commit: commitC,
    });
    assert.match(
      readProfile(root).installed.demo.source.resolved_commit,
      /^[a-f0-9]{40}$/,
      'remote add records the normalized full concrete commit',
    );

    writeRemotePack(remote.repo, 'demo', 'D');
    const commitD = commitRemote(remote.repo, 'publish D');
    const refreshed = await cmdRefresh({ root, library, name: 'demo' });
    assert.equal(refreshed.ok, true, refreshed.error);
    assertInstalledVersion(root, 'demo', 'D');
    assert.equal(readProfile(root).installed.demo.source.resolved_commit, commitD);
    assert.match(
      readProfile(root).installed.demo.source.resolved_commit,
      /^[a-f0-9]{40}$/,
      'remote refresh records the normalized full concrete commit',
    );
  } finally {
    cleanup(root);
    cleanup(remote.parent);
  }
});

test('remote concrete tags and latest releases are resolved again after publication moves', async () => {
  const tagRemote = createRemoteCatalog();
  const latestRemote = createRemoteCatalog();
  const tagRoot = createReleasedRoot();
  const latestRoot = createReleasedRoot();
  try {
    writeRemotePack(tagRemote.repo, 'demo', 'tag-A');
    commitRemote(tagRemote.repo, 'publish tag A');
    runGit(tagRemote.repo, 'tag', 'catalog-fixture');
    writeManifestSource(tagRoot, tagRemote.source, 'catalog-fixture');
    assertListedDescription(
      await cmdList({ root: tagRoot, library: path.join(tagRoot, 'library', 'packs') }),
      'demo',
      'demo catalog tag-A',
    );
    writeRemotePack(tagRemote.repo, 'demo', 'tag-B');
    const tagCommit = commitRemote(tagRemote.repo, 'publish tag B');
    runGit(tagRemote.repo, 'tag', '-f', 'catalog-fixture');
    const tagAdded = await cmdAdd({
      root: tagRoot,
      library: path.join(tagRoot, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(tagAdded.ok, true, tagAdded.error);
    assertInstalledVersion(tagRoot, 'demo', 'tag-B');
    assert.deepEqual(readProfile(tagRoot).installed.demo.source, {
      type: 'remote',
      repository: tagRemote.source,
      requested_ref: 'catalog-fixture',
      resolved_commit: tagCommit,
    });

    writeRemotePack(latestRemote.repo, 'demo', 'release-1');
    commitRemote(latestRemote.repo, 'publish release 1');
    runGit(latestRemote.repo, 'tag', 'v1.0.0');
    writeManifestSource(latestRoot, latestRemote.source, 'latest');
    assertListedDescription(
      await cmdList({ root: latestRoot, library: path.join(latestRoot, 'library', 'packs') }),
      'demo',
      'demo catalog release-1',
    );
    writeRemotePack(latestRemote.repo, 'demo', 'release-2');
    const latestCommit = commitRemote(latestRemote.repo, 'publish release 2');
    runGit(latestRemote.repo, 'tag', 'v1.1.0');
    assertListedDescription(
      await cmdList({ root: latestRoot, library: path.join(latestRoot, 'library', 'packs') }),
      'demo',
      'demo catalog release-2',
    );
    const latestAdded = await cmdAdd({
      root: latestRoot,
      library: path.join(latestRoot, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(latestAdded.ok, true, latestAdded.error);
    assert.deepEqual(readProfile(latestRoot).installed.demo.source, {
      type: 'remote',
      repository: latestRemote.source,
      requested_ref: 'latest',
      resolved_commit: latestCommit,
    });
  } finally {
    cleanup(tagRoot);
    cleanup(latestRoot);
    cleanup(tagRemote.parent);
    cleanup(latestRemote.parent);
  }
});

test('a full remote SHA remains exact but refuses when its prior remote becomes unavailable', async () => {
  const remote = createRemoteCatalog();
  const root = createReleasedRoot();
  const library = path.join(root, 'library', 'packs');
  try {
    writeRemotePack(remote.repo, 'demo', 'SHA-A');
    const pinned = commitRemote(remote.repo, 'publish SHA A');
    writeManifestSource(root, remote.source, pinned);
    assertListedDescription(await cmdList({ root, library }), 'demo', 'demo catalog SHA-A');

    // Moving ordinary refs cannot alter a full-SHA selection.
    writeRemotePack(remote.repo, 'demo', 'SHA-B');
    commitRemote(remote.repo, 'publish SHA B');
    runGit(remote.repo, 'tag', '-f', 'mutable-fixture');
    const added = await cmdAdd({ root, library, name: 'demo', force: false });
    assert.equal(added.ok, true, added.error);
    assertInstalledVersion(root, 'demo', 'SHA-A');
    assert.deepEqual(readProfile(root).installed.demo.source, {
      type: 'remote',
      repository: remote.source,
      requested_ref: pinned,
      resolved_commit: pinned,
    });

    // The earlier SHA checkout exists, so this would succeed under SHA checkout
    // reuse. Removing the file:// source makes a fresh clone observable.
    fs.renameSync(remote.repo, `${remote.repo}-offline`);
    const repeated = await cmdList({ root, library });
    assert.equal(repeated.ok, false);
    assert.equal(repeated.code, 2);
    assert.match(repeated.error || '', /failed to fetch source/);
  } finally {
    cleanup(root);
    cleanup(remote.parent);
  }
});

test('unavailable mutable remotes refuse list, add, and refresh without stale mutation', async () => {
  const remote = createRemoteCatalog();
  const root = createReleasedRoot();
  const library = path.join(root, 'library', 'packs');
  try {
    writeRemotePack(remote.repo, 'demo', 'online');
    writeRemotePack(remote.repo, 'other', 'online');
    commitRemote(remote.repo, 'publish online catalog');
    writeManifestSource(root, remote.source, 'main');
    assertListedDescription(await cmdList({ root, library }), 'demo', 'demo catalog online');
    const installed = await cmdAdd({ root, library, name: 'demo', force: false });
    assert.equal(installed.ok, true, installed.error);
    assertInstalledVersion(root, 'demo', 'online');

    // A previous checkout is now available at compose's usual destination, but
    // the selected remote can no longer provide current bytes.
    fs.renameSync(remote.repo, `${remote.repo}-offline`);
    const listed = await cmdList({ root, library });
    assert.equal(listed.ok, false);
    assert.equal(listed.code, 2);
    assert.match(listed.error || '', /failed to fetch source/);

    const beforeAdd = mutationSnapshot(root);
    const added = await cmdAdd({ root, library, name: 'other', force: false });
    assert.equal(added.ok, false);
    assert.match(added.error || '', /failed to fetch source/);
    assertMutationUnchanged(root, beforeAdd);
    assert.equal(readProfile(root).installed.other, undefined);
    assertNoPackLeftovers(root, 'other');

    const beforeRefresh = mutationSnapshot(root);
    const refreshed = await cmdRefresh({ root, library, name: 'demo' });
    assert.equal(refreshed.ok, false);
    assert.match(refreshed.error || '', /failed to fetch source/);
    assertMutationUnchanged(root, beforeRefresh);
  } finally {
    cleanup(root);
    cleanup(remote.parent);
  }
});

test('remote source selection preserves local authority, explicit inputs, manifest fallback, and no-fetch', async () => {
  const remote = createRemoteCatalog();
  const root = createRoot();
  const explicitRoot = createReleasedRoot();
  const noFetchRoot = createReleasedRoot();
  try {
    writeRemotePack(remote.repo, 'remote-only', 'manifest');
    commitRemote(remote.repo, 'publish manifest main');
    runGit(remote.repo, 'checkout', '-qb', 'explicit-fixture');
    writeRemotePack(remote.repo, 'explicit-only', 'explicit');
    commitRemote(remote.repo, 'publish explicit branch');
    runGit(remote.repo, 'checkout', '-q', 'main');

    writePack(root, 'local', [packAgent('local', 'worker', { name: 'Local Worker' })], { skill: false });
    writeManifestSource(root, remote.source, 'main');
    const library = path.join(root, 'library', 'packs');

    // A whole local catalog wins even with a configured remote.
    const localList = await cmdList({ root, library });
    assertListedDescription(localList, 'local', 'local fixture pack');
    assert.equal(localList.result?.packs.some((pack) => pack.name === 'remote-only'), false);
    assert.equal(localList.result?.origin, 'local');

    // An explicit source is exclusive: the local target does not preempt it, and
    // a source that cannot be fetched is a refusal, never a fallback to the library.
    const explicitBefore = mutationSnapshot(root);
    const explicitAdd = await cmdAdd({
      root,
      library,
      name: 'local',
      force: false,
      source: 'file:///definitely-missing-local-precedence',
      ref: 'main',
    });
    assert.equal(explicitAdd.ok, false);
    assert.match(explicitAdd.error || '', /failed to fetch source/);
    assertMutationUnchanged(root, explicitBefore);

    // Without a source, the requested local target is still used.
    const localAdded = await cmdAdd({ root, library, name: 'local', force: false });
    assert.equal(localAdded.ok, true, localAdded.error);
    assert.deepEqual(readProfile(root).installed.local.source, {
      type: 'local',
      location: fs.realpathSync(library),
    });
    const localSource = path.join(root, 'library', 'packs', 'local', 'agents', 'dude-pack-local-worker.agent.md');
    fs.writeFileSync(
      localSource,
      fs.readFileSync(localSource, 'utf8').replace('You are Local Worker.', 'You are Local Worker refreshed.'),
    );
    const refreshBefore = mutationSnapshot(root);
    const explicitRefresh = await cmdRefresh({
      root,
      library,
      name: 'local',
      source: 'file:///definitely-missing-local-precedence',
      ref: 'main',
    });
    assert.equal(explicitRefresh.ok, false);
    assert.match(explicitRefresh.error || '', /failed to fetch source/);
    assertMutationUnchanged(root, refreshBefore);
    const localRefreshed = await cmdRefresh({ root, library, name: 'local' });
    assert.equal(localRefreshed.ok, true, localRefreshed.error);
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'agents', 'dude-pack-local-worker.agent.md'), 'utf8'),
      /You are Local Worker refreshed\./,
    );

    // Other local catalog content does not block a missing target's manifest
    // fallback from reaching the remote.
    const remoteAdded = await cmdAdd({ root, library, name: 'remote-only', force: false });
    assert.equal(remoteAdded.ok, true, remoteAdded.error);
    assertInstalledVersion(root, 'remote-only', 'manifest');

    // Explicit source/ref values override an unusable manifest.
    writeManifestSource(explicitRoot, 'file:///definitely-missing-manifest', 'main');
    assertListedDescription(
      await cmdList({
        root: explicitRoot,
        library: path.join(explicitRoot, 'library', 'packs'),
        source: remote.source,
        ref: 'explicit-fixture',
      }),
      'explicit-only',
      'explicit-only catalog explicit',
    );

    // An explicit source without a ref keeps main; it must not independently
    // fill the ref from this conflicting manifest.
    writeManifestSource(explicitRoot, 'file:///definitely-missing-manifest', 'explicit-fixture');
    assertListedDescription(
      await cmdList({
        root: explicitRoot,
        library: path.join(explicitRoot, 'library', 'packs'),
        source: remote.source,
      }),
      'remote-only',
      'remote-only catalog manifest',
    );

    // An explicit ref combines with the manifest source instead of its ref.
    writeManifestSource(explicitRoot, remote.source, 'main');
    assertListedDescription(
      await cmdList({
        root: explicitRoot,
        library: path.join(explicitRoot, 'library', 'packs'),
        ref: 'explicit-fixture',
      }),
      'explicit-only',
      'explicit-only catalog explicit',
    );

    // Local-only callers neither need nor contact the configured remote.
    writeManifestSource(noFetchRoot, 'file:///definitely-missing-no-fetch', 'main');
    const noFetchList = await cmdList({
      root: noFetchRoot,
      library: path.join(noFetchRoot, 'library', 'packs'),
      fetch: false,
    });
    assert.equal(noFetchList.ok, true, noFetchList.error);
    assert.deepEqual(noFetchList.result?.packs, []);
    const noFetchBefore = mutationSnapshot(noFetchRoot);
    const noFetchAdd = await cmdAdd({
      root: noFetchRoot,
      library: path.join(noFetchRoot, 'library', 'packs'),
      name: 'remote-only',
      force: false,
      fetch: false,
    });
    assert.equal(noFetchAdd.ok, false);
    assert.match(noFetchAdd.error || '', /pack not found in catalog/);
    assertMutationUnchanged(noFetchRoot, noFetchBefore);
  } finally {
    cleanup(root);
    cleanup(explicitRoot);
    cleanup(noFetchRoot);
    cleanup(remote.parent);
  }
});

test('direct local Git and non-Git catalogs record only their local locations', async () => {
  const gitRoot = createRoot();
  const plainRoot = createRoot();
  try {
    for (const [root, name] of [[gitRoot, 'gitlocal'], [plainRoot, 'plainlocal']]) {
      writePack(root, name, [packAgent(name, 'worker', { name: `${name} Worker` })], { skill: false });
    }
    const gitCatalog = path.join(gitRoot, 'library');
    runGit(gitCatalog, 'init', '-q', '-b', 'main');
    runGit(gitCatalog, 'add', '-A');
    runGit(gitCatalog, '-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-qm', 'catalog');

    // Act
    const gitAdded = await addPack(gitRoot, 'gitlocal');
    const plainAdded = await addPack(plainRoot, 'plainlocal');

    // Assert
    assert.equal(gitAdded.ok, true, gitAdded.error);
    assert.equal(plainAdded.ok, true, plainAdded.error);
    for (const [root, name] of [[gitRoot, 'gitlocal'], [plainRoot, 'plainlocal']]) {
      const source = readProfile(root).installed[name].source;
      assert.deepEqual(source, {
        type: 'local',
        location: fs.realpathSync(path.join(root, 'library', 'packs')),
      });
      assert.equal(Object.hasOwn(source, 'resolved_commit'), false);
    }
  } finally {
    cleanup(gitRoot);
    cleanup(plainRoot);
  }
});

test('add renders one Copilot destination per source and writes only exact files plus local identity', async () => {
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
    assert.deepEqual(entry.files, [
      '.github/agents/dude-pack-demo-worker.agent.md',
      '.github/skills/dude-pack-demo-helper',
    ]);
    assert.deepEqual(entry.source, {
      type: 'local',
      location: fs.realpathSync(path.join(root, 'library', 'packs')),
    });
    assert.deepEqual(Object.keys(entry).sort(), ['files', 'source']);

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

test('add validates a multi-source set exactly once and records each exact destination', async () => {
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
    const entry = readProfile(root).installed.team;
    assert.equal(entry.files.length, agents.length);
    assert.deepEqual(entry.files, agents
      .map(({ stem }) => ({
        destination: `.github/agents/${stem}.agent.md`,
      }))
      .map(({ destination }) => destination)
      .sort());
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
    assert.equal(readProfile(root).installed.roster.files.length, 2);

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

test('remove accepts changed source and installed bytes, missing listed paths, and deletes no unlisted artifact', async () => {
  const root = scaffold();
  try {
    const added = await cmdAdd({
      root,
      library: path.join(root, 'library', 'packs'),
      name: 'demo',
      force: false,
    });
    assert.equal(added.ok, true, added.error);
    const installedPath = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const unlisted = path.join(root, '.github', 'agents', 'dude-pack-demo-unlisted.agent.md');
    fs.writeFileSync(installedPath, 'hand-edited generated output\n');
    fs.writeFileSync(unlisted, 'must remain\n');
    fs.writeFileSync(
      path.join(root, 'library', 'packs', 'demo', 'agents', 'dude-pack-demo-worker.agent.md'),
      `${agentSource({ name: 'Demo Worker' })}changed source\n`,
    );
    fs.rmSync(path.join(root, '.github', 'skills', 'dude-pack-demo-helper'), { recursive: true });

    // Act
    const removed = cmdRemove({ root, name: 'demo' });

    // Assert
    assert.equal(removed.ok, true, removed.error);
    assert.equal(exists(installedPath), false, 'listed edited artifact remains');
    assert.equal(exists(unlisted), true, 'unlisted artifact was deleted');
    assert.deepEqual(readProfile(root).installed, {});
  } finally {
    cleanup(root);
  }
});

test('add and remove restore exact bytes and clean profile residue after a caught profile-write failure', async () => {
  const addRoot = scaffold();
  const removeRoot = scaffold();
  const originalWriteFileSync = fs.writeFileSync;
  try {
    const failProfileWrite = (file, ...rest) => {
      if (typeof file === 'string' && path.basename(file).startsWith('profile.md.tmp-')) {
        throw new Error('injected profile write failure');
      }
      return originalWriteFileSync(file, ...rest);
    };

    // Arrange
    const addBefore = mutationSnapshot(addRoot);
    fs.writeFileSync = failProfileWrite;
    const failedAdd = await addPack(addRoot, 'demo');
    fs.writeFileSync = originalWriteFileSync;

    // Act + Assert
    assert.equal(failedAdd.ok, false);
    assert.match(failedAdd.error || '', /rolled back: injected profile write failure/);
    assertMutationUnchanged(addRoot, addBefore);
    assertNoPackLeftovers(addRoot, 'demo');

    assert.equal((await addPack(removeRoot, 'demo')).ok, true);
    const removeBefore = mutationSnapshot(removeRoot);
    fs.writeFileSync = failProfileWrite;
    const failedRemove = cmdRemove({ root: removeRoot, name: 'demo' });
    fs.writeFileSync = originalWriteFileSync;
    assert.equal(failedRemove.ok, false);
    assert.match(failedRemove.error || '', /rolled back: injected profile write failure/);
    assertMutationUnchanged(removeRoot, removeBefore);
    for (const root of [addRoot, removeRoot]) {
      const residue = fs.readdirSync(path.join(root, '.dude', 'metadata'))
        .filter((entry) => /^profile\.md\.(?:tmp|backup)-/.test(entry));
      assert.deepEqual(residue, [], 'profile transaction residue survived');
    }
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    cleanup(addRoot);
    cleanup(removeRoot);
  }
});

test('remove and refresh refuse a symbolic linked recorded destination before mutation', async () => {
  const root = scaffold();
  try {
    assert.equal((await addPack(root, 'demo')).ok, true);
    const installed = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const decoy = path.join(root, 'decoy.agent.md');
    fs.writeFileSync(decoy, 'outside\n');
    fs.rmSync(installed);
    fs.symlinkSync(decoy, installed);
    const before = mutationSnapshot(root);

    // Act + Assert
    const removed = cmdRemove({ root, name: 'demo' });
    const refreshed = await refreshPack(root, 'demo');
    for (const result of [removed, refreshed]) {
      assert.equal(result.ok, false);
      assert.match(result.error || '', /symbolic link/);
    }
    assertMutationUnchanged(root, before);
  } finally {
    cleanup(root);
  }
});

test('status derives sorted enabled packs and never rewrites a profile', async () => {
  const root = createRoot();
  try {
    writePack(root, 'zeta', [packAgent('zeta', 'worker')], { skill: false });
    writePack(root, 'alpha', [packAgent('alpha', 'worker')], { skill: false });
    assert.equal((await addPack(root, 'zeta')).ok, true);
    assert.equal((await addPack(root, 'alpha')).ok, true);
    const before = profileBytes(root);

    // Act
    const status = cmdStatus({ root });

    // Assert
    assert.equal(status.ok, true, status.error);
    assert.deepEqual(status.result.enabled_packs, ['alpha', 'zeta']);
    assert.deepEqual(profileBytes(root), before, 'status rewrote profile bytes');
  } finally {
    cleanup(root);
  }
});

test('status reads a complete predecessor without writing and a lifecycle writer emits canonical bytes', async () => {
  const root = scaffold();
  try {
    assert.equal((await addPack(root, 'demo')).ok, true);
    writeCompletePredecessorProfile(root, 'demo');
    const predecessorBytes = profileBytes(root);

    // Act
    const status = cmdStatus({ root });

    // Assert status remains read-only before a lifecycle writer runs.
    assert.equal(status.ok, true, status.error);
    assert.deepEqual(status.result.enabled_packs, ['demo']);
    assert.deepEqual(profileBytes(root), predecessorBytes);

    // Act + Assert: a successful writer serializes canonical state only.
    const removed = cmdRemove({ root, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assert.notDeepEqual(profileBytes(root), predecessorBytes, 'successful lifecycle writer retained predecessor bytes');
    assert.doesNotMatch(profileBytes(root).toString('utf8'), /enabled_packs|inventory|sha256|digest|installed_at/);
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

        const listed = await cmdList({ root, library: path.join(root, 'library', 'packs') });
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

    assert.equal((await cmdList({ root, library: path.join(root, 'library', 'packs') })).ok, true);
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

    // The record keeps only the new exact destination set and source identity.
    const entry = readProfile(root).installed.mixed;
    assert.deepEqual(entry.files.slice().sort(), [
      '.github/agents/dude-pack-mixed-worker.agent.md',
      '.github/instructions/dude-pack-mixed-extra.instructions.md',
      '.github/instructions/dude-pack-mixed-guide.instructions.md',
      '.github/prompts/dude-pack-mixed-ask.prompt.md',
      '.github/skills/dude-pack-mixed-helper',
    ]);
    assert.equal(entry.files.includes('.github/prompts/dude-pack-mixed-legacy.prompt.md'), false);
    assert.deepEqual(Object.keys(entry).sort(), ['files', 'source']);

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
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md'), 'utf8'),
      /You are Demo Worker changed\./,
    );
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'skills', 'dude-pack-demo-helper', 'SKILL.md'), 'utf8'),
      /# Helper changed/,
    );

    // The same source identity and bytes still take the ordinary projection
    // path; refresh has no unchanged shortcut.
    const repeated = await refreshPack(root, 'demo');
    assert.equal(repeated.ok, true, repeated.error);
    assert.deepEqual(repeated.result?.replaced, beforeFiles);
    assert.deepEqual(repeated.result?.added, []);
    assert.deepEqual(repeated.result?.removed, []);
  } finally {
    cleanup(root);
  }
});

test('refresh preview has refresh parity, is byte-read-only, and cleans its stage', async () => {
  // Arrange
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'mixed', [packAgent('mixed', 'worker', { name: 'Mixed Worker' })], {
      skill: true,
      instruction: true,
      prompt: true,
    });
    const pack = path.join(root, 'library', 'packs', 'mixed');
    fs.writeFileSync(path.join(pack, 'prompts', 'dude-pack-mixed-legacy.prompt.md'), '# old prompt\n');
    assert.equal((await addPack(root, 'mixed')).ok, true);

    fs.writeFileSync(
      path.join(pack, 'agents', 'dude-pack-mixed-worker.agent.md'),
      agentSource({ name: 'Mixed Worker' }).replace('You are Mixed Worker.', 'You are Mixed Worker v2.'),
    );
    fs.rmSync(path.join(pack, 'prompts', 'dude-pack-mixed-legacy.prompt.md'));
    fs.writeFileSync(path.join(pack, 'instructions', 'dude-pack-mixed-extra.instructions.md'), '# added instruction\n');
    const before = mutationSnapshot(root);

    // Act
    const preview = await cmdPreviewRefresh({ root, library: path.join(root, 'library', 'packs'), name: 'mixed' });

    // Assert
    assert.equal(preview.ok, true, preview.error);
    assert.deepEqual(preview.result?.replaced, [
      '.github/agents/dude-pack-mixed-worker.agent.md',
      '.github/instructions/dude-pack-mixed-guide.instructions.md',
      '.github/prompts/dude-pack-mixed-ask.prompt.md',
      '.github/skills/dude-pack-mixed-helper',
    ]);
    assert.deepEqual(preview.result?.added, ['.github/instructions/dude-pack-mixed-extra.instructions.md']);
    assert.deepEqual(preview.result?.removed, ['.github/prompts/dude-pack-mixed-legacy.prompt.md']);
    assertMutationUnchanged(root, before);
    assertNoSurvivingStageDirectories(refreshes.directories);

    const refreshed = await refreshPack(root, 'mixed');
    assert.equal(refreshed.ok, true, refreshed.error);
    assert.deepEqual(refreshed.result?.replaced, preview.result?.replaced);
    assert.deepEqual(refreshed.result?.added, preview.result?.added);
    assert.deepEqual(refreshed.result?.removed, preview.result?.removed);
    assert.equal(
      exists(path.join(root, '.github', 'prompts', 'dude-pack-mixed-legacy.prompt.md')),
      false,
      'the previewed removal did not occur during refresh',
    );
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh preview refuses an occupied addition without mutation or surviving stage', async () => {
  // Arrange
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    assert.equal((await addPack(root, 'demo')).ok, true);
    const pack = path.join(root, 'library', 'packs', 'demo');
    fs.mkdirSync(path.join(pack, 'instructions'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'instructions', 'dude-pack-demo-guide.instructions.md'), '# new source\n');
    const occupied = path.join(root, '.github', 'instructions', 'dude-pack-demo-guide.instructions.md');
    fs.writeFileSync(occupied, '# foreign bytes\n');
    const before = mutationSnapshot(root);

    // Act
    const preview = await cmdPreviewRefresh({ root, library: path.join(root, 'library', 'packs'), name: 'demo' });

    // Assert
    assert.equal(preview.ok, false);
    assert.match(preview.error || '', /already exists as a core, project, or foreign artifact/);
    assertMutationUnchanged(root, before);
    assert.equal(fs.readFileSync(occupied, 'utf8'), '# foreign bytes\n');
    assertNoSurvivingStageDirectories(refreshes.directories);
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh overwrites a hand-edited installed artifact and follows the ordinary reprojection path', async () => {
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);

    // Change the source and hand-edit an installed destination. The recorded path
    // remains replaceable output rather than byte-evidence authority.
    const packDir = path.join(root, 'library', 'packs', 'demo');
    fs.writeFileSync(path.join(packDir, 'skills', 'dude-pack-demo-helper', 'SKILL.md'), '---\nname: dude-pack-demo-helper\ndescription: "fixture helper"\n---\n# Helper changed\n');
    const installedAgent = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    const drifted = `${fs.readFileSync(installedAgent, 'utf8')}\nhand edit\n`;
    fs.writeFileSync(installedAgent, drifted);

    const result = await refreshPack(root, 'demo');

    assert.equal(result.ok, true, result.error);
    assert.deepEqual(result.result?.replaced.sort(), readProfile(root).installed.demo.files);
    assert.doesNotMatch(fs.readFileSync(installedAgent, 'utf8'), /hand edit/);
    assert.match(
      fs.readFileSync(path.join(root, '.github', 'skills', 'dude-pack-demo-helper', 'SKILL.md'), 'utf8'),
      /# Helper changed/,
    );
    assertNoSurvivingStageDirectories(refreshes.directories);
    assert.ok(refreshes.directories.length >= 2, 'refresh stages and applies even when bytes are unchanged or edited');
  } finally {
    refreshes.restore();
    cleanup(root);
  }
});

test('refresh refuses an absent pack and malformed profile without mutating', async () => {
  const absent = createRoot();
  const nonCurrent = createRoot();
  try {
    // Absent pack: nothing is installed to refresh.
    writePack(absent, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const absentBefore = mutationSnapshot(absent);
    const absentResult = await refreshPack(absent, 'demo');
    assert.equal(absentResult.ok, false);
    assert.match(absentResult.error || '', /pack "demo" is not installed/);
    assertMutationUnchanged(absent, absentBefore);

    // Malformed authority is rejected before staging or mutation.
    writePack(nonCurrent, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    writePack(nonCurrent, 'extra', [packAgent('extra', 'aide', { name: 'Extra Aide' })], { skill: false });
    assert.equal((await addPack(nonCurrent, 'demo')).ok, true);
    rewriteProfileJson(nonCurrent, (payload) => {
      payload.installed.demo.unexpected = true;
    });
    const nonCurrentBefore = mutationSnapshot(nonCurrent);
    const nonCurrentResult = await refreshPack(nonCurrent, 'demo');
    assert.equal(nonCurrentResult.ok, false);
    assert.match(
      nonCurrentResult.error || '',
      /unsupported or missing fields/,
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

test('refresh rolls back a projected missing recorded replacement without recreating it', async () => {
  // Arrange
  const root = createRoot();
  const refreshes = trackRefreshDirectories();
  const originalWriteFileSync = fs.writeFileSync;
  const originalRmSync = fs.rmSync;
  const originalCopyFileSync = fs.copyFileSync;
  try {
    writePack(root, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    const added = await addPack(root, 'demo');
    assert.equal(added.ok, true, added.error);

    const missingDestination = path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md');
    assert.ok(readProfile(root).installed.demo.files.includes('.github/agents/dude-pack-demo-worker.agent.md'));
    fs.rmSync(missingDestination);
    const before = mutationSnapshot(root);
    const residueBefore = fs.readdirSync(path.join(root, '.dude', 'metadata'))
      .filter((entry) => entry.startsWith('profile.md.tmp-') || entry.startsWith('profile.md.backup-'));
    let missingReplacementRemovals = 0;
    let projectedMissingDestination = false;
    fs.rmSync = (target, ...rest) => {
      if (typeof target === 'string' && path.resolve(target) === missingDestination) {
        missingReplacementRemovals += 1;
      }
      return originalRmSync(target, ...rest);
    };
    fs.copyFileSync = (source, target, ...rest) => {
      const copied = originalCopyFileSync(source, target, ...rest);
      if (typeof target === 'string' && path.resolve(target) === missingDestination) {
        projectedMissingDestination = exists(missingDestination);
      }
      return copied;
    };
    fs.writeFileSync = (file, ...rest) => {
      if (typeof file === 'string' && path.basename(file).startsWith('profile.md.tmp-')) {
        throw new Error('injected profile write failure');
      }
      return originalWriteFileSync(file, ...rest);
    };

    // Act
    const result = await refreshPack(root, 'demo');

    // Assert
    fs.writeFileSync = originalWriteFileSync;
    fs.rmSync = originalRmSync;
    fs.copyFileSync = originalCopyFileSync;
    assert.equal(result.ok, false);
    assert.match(result.error || '', /pack refresh failed and was rolled back: injected profile write failure/);
    assert.equal(projectedMissingDestination, true, 'refresh did not project the missing same-path destination before failing');
    assert.equal(
      missingReplacementRemovals,
      2,
      'missing recorded path must take the backup:null replacement apply and rollback branch, not addition-only handling',
    );
    assert.equal(exists(missingDestination), false, 'rollback recreated a destination absent before refresh');
    assertMutationUnchanged(root, before);
    const residueAfter = fs.readdirSync(path.join(root, '.dude', 'metadata'))
      .filter((entry) => entry.startsWith('profile.md.tmp-') || entry.startsWith('profile.md.backup-'));
    assert.deepEqual(residueAfter, residueBefore, 'profile transaction residue changed');
    assert.ok(refreshes.directories.length >= 2, 'refresh created stage and transaction directories');
    assertNoSurvivingStageDirectories(refreshes.directories);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.rmSync = originalRmSync;
    fs.copyFileSync = originalCopyFileSync;
    refreshes.restore();
    cleanup(root);
  }
});

test('remove accepts changed source bytes while add retains force semantics', async () => {
  // add --force still overwrites an occupied agent destination.
  const overwrite = createRoot();
  // add --force still refuses an occupied instruction destination.
  const protectedInstruction = createRoot();
  // remove no longer compares source bytes.
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
    const removed = cmdRemove({ root: changed, name: 'demo' });
    assert.equal(removed.ok, true, removed.error);
    assertNoPackLeftovers(changed, 'demo');
  } finally {
    cleanup(overwrite);
    cleanup(protectedInstruction);
    cleanup(changed);
  }
});

test('T003 remote refresh preview is not an apply token; the owner must retain and re-establish its reviewed commit', async () => {
  const remote = createRemoteCatalog();
  const moving = createReleasedRoot(), pinned = createReleasedRoot();
  try {
    writeRemotePack(remote.repo, 'demo', 'reviewed');
    const reviewedCommit = commitRemote(remote.repo, 'reviewed source');
    for (const root of [moving, pinned]) {
      writeManifestSource(root, remote.source, 'main');
      assert.equal((await addPack(root, 'demo')).ok, true);
    }
    const args = root => ({ root, library: path.join(root, 'library/packs'), name: 'demo' });
    const previews = [];
    for (const root of [moving, pinned]) {
      const before = mutationSnapshot(root);
      const preview = await cmdPreviewRefresh(args(root));
      assert.equal(preview.ok, true, preview.error);
      assert.equal(preview.result.source.resolved_commit, reviewedCommit);
      assertMutationUnchanged(root, before);
      previews.push(preview.result);
    }

    writeRemotePack(remote.repo, 'demo', 'moved');
    const movedCommit = commitRemote(remote.repo, 'source moved after preview');
    assert.notEqual(movedCommit, reviewedCommit);
    // Ordinary refresh intentionally prepares again. This is the unsafe
    // assumption the Canvas owner guidance must not make about an old preview.
    const unbound = await cmdRefresh(args(moving));
    assert.equal(unbound.ok, true, unbound.error);
    assert.equal(readProfile(moving).installed.demo.source.resolved_commit, movedCommit);
    assertInstalledVersion(moving, 'demo', 'moved');

    // The existing source/ref interface supports the reviewed exact commit.
    // Re-preview that basis rather than treating the first dry-run as a token.
    const reviewedArgs = { ...args(pinned), source: previews[1].source.repository, ref: reviewedCommit };
    const before = mutationSnapshot(pinned);
    const rechecked = await cmdPreviewRefresh(reviewedArgs);
    assert.equal(rechecked.ok, true, rechecked.error);
    assert.equal(rechecked.result.source.resolved_commit, reviewedCommit);
    assert.equal(rechecked.result.source.requested_ref, reviewedCommit);
    for (const key of ['files', 'replaced', 'added', 'removed']) {
      assert.deepEqual(rechecked.result[key], previews[1][key]);
    }
    assertMutationUnchanged(pinned, before);
    const applied = await cmdRefresh(reviewedArgs);
    assert.equal(applied.ok, true, applied.error);
    assert.equal(readProfile(pinned).installed.demo.source.resolved_commit, reviewedCommit);
    assertInstalledVersion(pinned, 'demo', 'reviewed');
  } finally {
    cleanup(moving); cleanup(pinned);
    fs.rmSync(remote.parent, { recursive: true, force: true });
  }
});

test('T003 source CLI --envelope prints the unchanged engine envelope for add, remove, and refresh; --json keeps its shape', async () => {
  // Arrange: the CLI root and an engine-control root receive the same pack and
  // operations, so every CLI envelope is compared with the engine's own return.
  const root = createRoot();
  const control = createRoot();
  try {
    for (const target of [root, control]) {
      writePack(target, 'demo', [packAgent('demo', 'worker', { name: 'Demo Worker' })], { skill: true });
    }
    /** @param {ReturnType<typeof runCompose>} result @param {number} status */
    const stdoutJson = (result, status) => {
      assert.equal(result.status, status, result.stderr);
      assert.equal(result.stderr, '');
      return JSON.parse(result.stdout);
    };
    /** @param {object} value */
    const keys = (value) => Object.keys(value).sort();

    // Act / Assert: install success is exactly the engine envelope.
    const added = stdoutJson(runCompose(root, 'add', 'demo', '--envelope'), 0);
    assert.deepEqual(added, await addPack(control, 'demo'));
    assert.deepEqual(keys(added), ['code', 'ok', 'result']);
    assert.deepEqual(keys(added.result), ['added', 'files', 'origin']);

    // Refresh success: --json keeps its flattened shape; --envelope does not.
    const expectedRefresh = await refreshPack(control, 'demo');
    assert.equal(expectedRefresh.ok, true, expectedRefresh.error);
    assert.deepEqual(stdoutJson(runCompose(root, 'refresh', 'demo', '--json'), 0),
      { ok: true, ...expectedRefresh.result });
    const refreshed = stdoutJson(runCompose(root, 'refresh', 'demo', '--envelope'), 0);
    assert.deepEqual(refreshed, await refreshPack(control, 'demo'));
    assert.deepEqual(keys(refreshed), ['code', 'ok', 'result']);

    // Refresh pre-mutation failure: an occupied new destination refuses first.
    for (const target of [root, control]) {
      const packDir = path.join(target, 'library', 'packs', 'demo');
      fs.mkdirSync(path.join(packDir, 'instructions'), { recursive: true });
      fs.writeFileSync(path.join(packDir, 'instructions', 'dude-pack-demo-guide.instructions.md'), '# demo guide\n');
      fs.writeFileSync(
        path.join(target, '.github', 'instructions', 'dude-pack-demo-guide.instructions.md'),
        '# pre-existing foreign artifact\n',
      );
    }
    const expectedFailure = await refreshPack(control, 'demo');
    assert.equal(expectedFailure.mutation, 'none');
    const before = mutationSnapshot(root);
    assert.deepEqual(stdoutJson(runCompose(root, 'refresh', 'demo', '--json'), 2),
      { ok: false, error: expectedFailure.error }, 'the --json failure shape is unchanged');
    const failed = stdoutJson(runCompose(root, 'refresh', 'demo', '--envelope'), 2);
    assert.deepEqual(failed, expectedFailure);
    assert.deepEqual(failed, { ok: false, code: 2, mutation: 'none', error: expectedFailure.error });
    assert.match(failed.error, /destination ownership conflict/);
    assertMutationUnchanged(root, before);

    // Remove success.
    const removed = stdoutJson(runCompose(root, 'remove', 'demo', '--envelope'), 0);
    assert.deepEqual(removed, cmdRemove({ root: control, name: 'demo' }));
    assert.deepEqual(keys(removed.result), ['files', 'removed']);

    // Add failure: the retained foreign instruction still blocks a new install.
    const addFailure = stdoutJson(runCompose(root, 'add', 'demo', '--envelope'), 2);
    assert.deepEqual(addFailure, await addPack(control, 'demo'));
    assert.deepEqual(keys(addFailure), ['code', 'error', 'ok']);
    assert.equal(addFailure.code, 2);
    assert.match(addFailure.error, /already exists as a core, project, or foreign artifact/);

    // The flag is a usage error outside the three result-bearing operations.
    for (const command of ['list', 'status', 'verify']) {
      assert.deepEqual(stdoutJson(runCompose(root, command, '--envelope'), 1), {
        ok: false, code: 1, error: '--envelope is only supported by add, remove, and refresh',
      });
    }
    const help = runCompose(root, '--help');
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--envelope {8}unchanged engine result envelope for add\/remove\/refresh/);
  } finally {
    cleanup(root);
    cleanup(control);
  }
});

test('T003 source Compose guidance owns Canvas permission, exact-source rechecks, result shape and failure limits', () => {
  const text = fs.readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');
  const section = text.split('## Canvas Pack Requests And Results\n')[1]?.split('\n## Add Flow')[0];
  assert.ok(section, 'the shipped source skill must contain the owner handoff');
  const prose = section.replace(/\s+/g, ' ');
  for (const requirement of [
    'The HTTP handler never runs Compose mutations.',
    'The click, prepared receipt, admission, delivery, and accepted permission reply are not an Applied result.',
    'Missing tools are a refusal, not permission to install prerequisites.',
    'unrecorded residue do not change that set.',
    'a later refresh prepares again and is not inherently bound to that preview.',
    '--ref <resolved_commit>',
    'Drift or an unprovable basis requires a fresh preview and literal confirmation.',
    'Decline performs no pack/profile write.',
    'result` is the complete unchanged Compose envelope.',
    '`node .github/skills/dude-compose/compose.mjs add|remove|refresh <name> --envelope`',
    'Forward the step 4 command\'s stdout unchanged as `result`',
    'never upgrade uncertainty to restoration.',
    'Never enqueue, replay, or retry that receipt.',
    'The idea-specific capture acknowledgment and six human request classes are unchanged.',
  ]) assert.ok(prose.includes(requirement), `missing owner contract: ${requirement}`);
  const example = JSON.parse(section.match(/```json\n(\{\n[\s\S]*?)\n```/)[1]);
  assert.equal(example.op, 'acknowledge');
  assert.deepEqual(Object.keys(example.acknowledgment).sort(), [
    'recognizes', 'receiptId', 'owner', 'operation', 'name', 'workspaceId', 'sessionId', 'providerGeneration',
    'outcome', 'mutation', 'result', 'profileRevision', 'source', 'note',
  ].sort());
  assert.equal(example.acknowledgment.recognizes, 'pack_result');
  assert.deepEqual(Object.keys(example.acknowledgment.result.result).sort(), ['added', 'files', 'origin']);
});

/* ------------------------------------------------------ T007 saved pack sources */

/**
 * A workspace with a library and a metadata folder, beside which other folders
 * can serve as sources.
 */
function createSourcesWorkspace() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-sources-'));
  const root = path.join(parent, 'workspace');
  fs.mkdirSync(path.join(root, '.dude', 'metadata'), { recursive: true });
  fs.mkdirSync(path.join(root, 'library', 'packs'), { recursive: true });
  return { parent, root, file: path.join(root, ...PACK_SOURCES_PATH.split('/')) };
}

/**
 * A folder in the supported source layout, with one metadata-only pack per name.
 * @param {string} parent
 * @param {string} name
 * @param {string[]} [packs]
 */
function createSourceFolder(parent, name, packs = ['one']) {
  const folder = path.join(parent, name);
  fs.mkdirSync(path.join(folder, 'library', 'packs'), { recursive: true });
  for (const pack of packs) {
    fs.mkdirSync(path.join(folder, 'library', 'packs', pack), { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'library', 'packs', pack, 'pack.md'),
      `---\nname: ${pack}\ndescription: "${pack}"\n---\n`,
    );
  }
  return folder;
}

const UPSTREAM = { source_repo: 'https://github.com/E-G-C/dude', source_ref: 'main' };

/** @param {number} n @param {string} [ref] */
function remoteEntry(n, ref = 'main') {
  return { type: 'remote', repository: `https://github.com/acme/pack-${n}`, ref };
}

/** @param {string | Buffer} bytes */
function sha256Revision(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

/** @param {string} code a predicate for `assert.throws` */
function refusal(code) {
  return (/** @type {unknown} */ error) => error instanceof PackSourceError && error.code === code;
}

/** @param {string} json */
function sourcesBlock(json) {
  return `# Pack Sources\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

/**
 * A valid sources document of exactly `size` bytes: the JSON block between
 * Markdown prose, padded with three-byte characters so its character count is
 * lower than its byte count.
 * @param {number} size
 * @param {string} [json]
 */
function sourcesDocumentOfSize(size, json = '{"sources":[]}') {
  const head = '# Pack Sources\n\nNotes kept beside the list, \u00e9\u00e8\u00ea included.\n\n';
  const block = `\`\`\`json\n${json}\n\`\`\`\n`;
  const padding = size - Buffer.byteLength(head) - Buffer.byteLength(block) - 1;
  assert.ok(padding >= 0, 'the size must leave room for the document');
  return `${head}${block}\n${'\u20ac'.repeat(Math.floor(padding / 3))}${'x'.repeat(padding % 3)}`;
}

test('T007 saved sources: a missing file is empty at revision absent, and the canonical document round-trips', () => {
  const { parent, root, file } = createSourcesWorkspace();
  try {
    assert.deepEqual(readPackSources(root), { ok: true, sources: [], revision: 'absent' });

    const planExample = '{"sources":[{"type":"remote","repository":"https://github.com/acme/dude-packs","ref":"main"},{"type":"local","location":"../team-packs"}]}';
    const entries = parsePackSourcesDocument(
      `# Pack Sources\n\nProse may surround the block.\n\n\`\`\`json\n${planExample}\n\`\`\`\n\nMore prose.\n`,
    );
    assert.deepEqual(entries, JSON.parse(planExample).sources);

    // The saved block holds only the specified fields, in one stable form.
    const document = serializePackSourcesDocument(entries);
    const blocks = [...document.matchAll(/```json\n([\s\S]*?)\n```/g)];
    assert.equal(blocks.length, 1);
    assert.deepEqual(JSON.parse(blocks[0][1]), JSON.parse(planExample));
    assert.deepEqual(parsePackSourcesDocument(document), entries);
    assert.equal(serializePackSourcesDocument(parsePackSourcesDocument(document)), document);
    assert.deepEqual(
      JSON.parse(/```json\n([\s\S]*?)\n```/.exec(serializePackSourcesDocument([]))?.[1] ?? 'null'),
      { sources: [] },
    );

    // The same document with CRLF line endings, or a byte-order mark, parses to the same entries.
    assert.deepEqual(parsePackSourcesDocument(document.replace(/\n/g, '\r\n')), entries);
    assert.deepEqual(parsePackSourcesDocument(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(document)])), entries);

    // The revision is the SHA-256 of the raw bytes, surrounding Markdown included.
    const written = writePackSources(root, entries, 'absent');
    assert.equal(written.revision, sha256Revision(fs.readFileSync(file)));
    assert.deepEqual(readPackSources(root), { ok: true, sources: entries, revision: written.revision });
    fs.appendFileSync(file, '\nA note outside the block.\n');
    const annotated = readPackSources(root);
    assert.equal(annotated.ok, true);
    assert.deepEqual(annotated.ok && annotated.sources, entries);
    assert.equal(annotated.ok && annotated.revision, sha256Revision(fs.readFileSync(file)));
    assert.notEqual(annotated.ok && annotated.revision, written.revision);

    // A save regenerates the whole file, as its header says, so prose outside the block is not kept.
    const resaved = writePackSources(root, entries, annotated.ok ? annotated.revision : '');
    assert.equal(fs.readFileSync(file, 'utf8'), document);
    assert.equal(resaved.revision, written.revision);
    const header = document.replace(/\s+/g, ' ');
    assert.ok(header.includes('regenerates the whole file'), 'the header names what a save does');
    assert.ok(header.includes('text outside the JSON block is not kept'));
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: built-ins, keys, counts, and every field beyond the two entry shapes are refused, never saved', () => {
  const { parent, root, file } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const described = describePackSources({ root, sources: [remoteEntry(1)], builtins });
    assert.equal(described.ok, true);
    const attempts = [
      described.ok ? described.sources : [],
      builtins,
      [{ ...remoteEntry(1), count: 3 }],
      [{ ...remoteEntry(1), addedAt: '2026-10-03T00:00:00Z' }],
      [{ type: 'local', location: '../x', alias: 'x', priority: 1 }],
      [{ type: 'remote', repository: 'https://github.com/acme/x' }],
    ];
    for (const attempt of attempts) {
      assert.throws(() => serializePackSourcesDocument(attempt), refusal('unavailable'));
      assert.throws(() => writePackSources(root, attempt, 'absent'), refusal('unavailable'));
    }
    assert.equal(exists(file), false, 'a refused list must not create the file');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), []);
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: malformed, unsafe, multiple-block, unknown-field, repeated, and over-limit documents are unavailable, never empty', () => {
  const { parent, root, file } = createSourcesWorkspace();
  try {
    const entries = (...sources) => sourcesBlock(JSON.stringify({ sources }));
    const empty = sourcesBlock('{"sources":[]}');
    const cases = [
      { name: 'no JSON block', content: '# Pack Sources\n', expected: /exactly one fenced JSON block \(found 0\)/ },
      { name: 'two JSON blocks', content: `${empty}\n${empty}`, expected: /exactly one fenced JSON block \(found 2\)/ },
      { name: 'malformed JSON', content: sourcesBlock('{nope}'), expected: /malformed JSON/ },
      { name: 'array root', content: sourcesBlock('[]'), expected: /JSON must contain only sources/ },
      { name: 'unknown root field', content: sourcesBlock('{"sources":[],"version":1}'), expected: /JSON must contain only sources/ },
      { name: 'missing sources', content: sourcesBlock('{}'), expected: /JSON must contain only sources/ },
      { name: 'sources that is not a list', content: sourcesBlock('{"sources":{}}'), expected: /sources must be a list/ },
      { name: 'entry that is not an object', content: sourcesBlock('{"sources":["x"]}'), expected: /sources\[0\] must be an object/ },
      { name: 'unknown entry field', content: entries({ ...remoteEntry(1), alias: 'a' }), expected: /sources\[0\] has unsupported or missing fields/ },
      { name: 'persisted key', content: entries({ ...remoteEntry(1), key: 'src_1' }), expected: /unsupported or missing fields/ },
      { name: 'remote without a ref', content: entries({ type: 'remote', repository: 'https://github.com/acme/x' }), expected: /unsupported or missing fields/ },
      { name: 'unknown type', content: entries({ type: 'ssh', location: 'x' }), expected: /sources\[0\]\.type must be "remote" or "local"/ },
      { name: 'credentials in a repository', content: entries({ ...remoteEntry(1), repository: 'https://user:s3cr3t@github.com/acme/x' }), expected: /sources\[0\]\.repository must be a public https:\/\/github\.com\/<owner>\/<repo> repository/ },
      { name: 'explicit port', content: entries({ ...remoteEntry(1), repository: 'https://github.com:443/acme/x' }), expected: /sources\[0\]\.repository must be a public/ },
      { name: 'non-canonical repository', content: entries({ ...remoteEntry(1), repository: 'https://github.com/acme/x.git' }), expected: /must be written https:\/\/github\.com\/acme\/x/ },
      { name: 'leading-dash ref', content: entries(remoteEntry(1, '--upload-pack=x')), expected: /sources\[0\]\.ref is not a valid ref/ },
      { name: 'ref with two periods', content: entries(remoteEntry(1, 'a..b')), expected: /not a valid ref/ },
      { name: 'overlong ref', content: entries(remoteEntry(1, 'a'.repeat(129))), expected: /not a valid ref/ },
      { name: 'URL as a local location', content: entries({ type: 'local', location: 'file:///tmp/x' }), expected: /sources\[0\]\.location must be one trimmed line .* not a URL/ },
      { name: 'untrimmed local location', content: entries({ type: 'local', location: ' ../x' }), expected: /one trimmed line/ },
      { name: 'overlong local location', content: entries({ type: 'local', location: 'x'.repeat(2049) }), expected: /one trimmed line/ },
      { name: 'a ninth source', content: entries(...Array.from({ length: 9 }, (_, index) => remoteEntry(index))), expected: /lists 9 sources; at most 8 can be added/ },
      { name: 'the same repository at another ref', content: entries(remoteEntry(1, 'main'), remoteEntry(1, 'v2')), expected: /sources\[1\] repeats sources\[0\]/ },
      { name: 'the same repository in another case', content: entries(remoteEntry(1), { ...remoteEntry(1), repository: 'https://github.com/ACME/Pack-1' }), expected: /sources\[1\] repeats sources\[0\]/ },
      { name: 'the same folder with a trailing separator', content: entries({ type: 'local', location: '../a' }, { type: 'local', location: '../a/' }), expected: /sources\[1\] repeats sources\[0\]/ },
      { name: 'a document over its size limit', content: `${empty}${' '.repeat(65_536)}`, expected: /larger than 65536 bytes/ },
      { name: 'invalid UTF-8', content: Buffer.concat([Buffer.from(empty), Buffer.from([0xff, 0xfe])]), expected: /not valid UTF-8/ },
    ];
    for (const { name, content, expected } of cases) {
      assert.throws(
        () => parsePackSourcesDocument(content),
        (error) => refusal('unavailable')(error) && expected.test(error.message) && !error.message.includes('s3cr3t'),
        name,
      );
      fs.writeFileSync(file, content);
      const bytes = fs.readFileSync(file);
      const read = readPackSources(root);
      assert.equal(read.ok, false, name);
      assert.match(read.ok ? '' : read.error, expected, name);
      assert.equal('sources' in read, false, `${name}: unavailable is never an empty list`);
      assert.deepEqual(fs.readFileSync(file), bytes, `${name}: reading must not change the file`);
    }

    // The bounds themselves are valid.
    assert.equal(
      parsePackSourcesDocument(entries(...Array.from({ length: MAX_ADDED_SOURCES }, (_, index) => remoteEntry(index)))).length,
      8,
    );
    const padded = `${empty}${' '.repeat(65_536 - Buffer.byteLength(empty))}`;
    assert.equal(Buffer.byteLength(padded), 65_536);
    assert.deepEqual(parsePackSourcesDocument(padded), []);
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: the 64 KiB cap counts every byte of the file, is exact at 65,536 and 65,537, and a refusal never truncates or resets', () => {
  const { parent, root, file } = createSourcesWorkspace();
  try {
    const entries = [remoteEntry(1), { type: 'local', location: '../team-packs' }];
    const json = JSON.stringify({ sources: entries });
    const atLimit = sourcesDocumentOfSize(65_536, json);
    const overLimit = sourcesDocumentOfSize(65_537, json);
    assert.equal(Buffer.byteLength(atLimit), 65_536);
    assert.equal(Buffer.byteLength(overLimit), 65_537);
    assert.ok(overLimit.length < 65_536, 'the cap counts bytes, not characters');

    // Exactly 64 KiB, surrounding Markdown included, is a complete document.
    assert.deepEqual(parsePackSourcesDocument(atLimit), entries);
    assert.deepEqual(parsePackSourcesDocument(Buffer.from(atLimit)), entries);
    fs.writeFileSync(file, atLimit);
    assert.deepEqual(readPackSources(root), { ok: true, sources: entries, revision: sha256Revision(atLimit) });

    // One more byte makes it unavailable, never an empty list, and the file is never cut down to fit.
    for (const bytes of [overLimit, Buffer.from(overLimit)]) {
      assert.throws(
        () => parsePackSourcesDocument(bytes),
        (error) => refusal('unavailable')(error) && /larger than 65536 bytes/.test(error.message),
      );
    }
    fs.writeFileSync(file, overLimit);
    const unreadable = readPackSources(root);
    assert.equal(unreadable.ok, false);
    assert.match(unreadable.ok ? '' : unreadable.error, /larger than 65536 bytes/);
    assert.equal('sources' in unreadable, false, 'unavailable is never an empty list');
    assert.equal(fs.readFileSync(file, 'utf8'), overLimit, 'reading never truncates');

    // A save cannot reset a list it cannot read, even when handed that file's own hash.
    assert.throws(() => writePackSources(root, [], sha256Revision(overLimit)), refusal('unavailable'));
    assert.equal(fs.readFileSync(file, 'utf8'), overLimit);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['pack-sources.md'], 'no temporary or backup residue');

    // A document at the cap is fully usable: a save regenerates it as the canonical, much smaller one.
    fs.writeFileSync(file, atLimit);
    const grown = [...entries, remoteEntry(2)];
    const saved = writePackSources(root, grown, sha256Revision(atLimit));
    assert.deepEqual(readPackSources(root), { ok: true, sources: grown, revision: saved.revision });
    assert.ok(fs.statSync(file).size < 1_024);

    // The longest list a save can write still fits the cap, so a valid save is never refused or cut.
    const widest = Array.from({ length: MAX_ADDED_SOURCES }, (_, index) => ({ type: 'local', location: `${'\\'.repeat(2046)}${index}x` }));
    const longest = serializePackSourcesDocument(widest);
    assert.ok(Buffer.byteLength(longest) <= 65_536, `${Buffer.byteLength(longest)} bytes`);
    assert.deepEqual(parsePackSourcesDocument(longest), widest);
    fs.rmSync(file);
    const widestSaved = writePackSources(root, widest, 'absent');
    assert.equal(fs.readFileSync(file, 'utf8'), longest);
    assert.deepEqual(readPackSources(root), { ok: true, sources: widest, revision: widestSaved.revision });
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: a saved local location is accepted at 2,048 UTF-8 bytes and refused at 2,049, by bytes not characters, without truncation', () => {
  const { parent, root, file } = createSourcesWorkspace();
  try {
    const widths = [
      ['one-byte', 'x'.repeat(2048), 'x'.repeat(2049)],
      ['two-byte', '\u00e9'.repeat(1024), `${'\u00e9'.repeat(1024)}x`],
      ['three-byte', `${'\u20ac'.repeat(682)}ab`, '\u20ac'.repeat(683)],
      ['four-byte', '\u{1F600}'.repeat(512), `${'\u{1F600}'.repeat(512)}x`],
    ];
    // The same JSON plainly, and with every non-ASCII code unit written as a \u escape: the bound is on the decoded text.
    const plain = (/** @type {string} */ text) => text;
    const escaped = (/** @type {string} */ text) => text.replace(/[^\x00-\x7f]/g, (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
    for (const [kind, atLimit, overLimit] of widths) {
      assert.equal(Buffer.byteLength(atLimit), 2048, kind);
      assert.equal(Buffer.byteLength(overLimit), 2049, kind);

      // A hand-edited document.
      for (const spell of [plain, escaped]) {
        const documentFor = (/** @type {string} */ location) => sourcesBlock(spell(JSON.stringify({ sources: [{ type: 'local', location }] })));
        assert.deepEqual(parsePackSourcesDocument(documentFor(atLimit)), [{ type: 'local', location: atLimit }], kind);
        assert.throws(
          () => parsePackSourcesDocument(documentFor(overLimit)),
          (error) => refusal('unavailable')(error) && /sources\[0\]\.location must be one trimmed line of at most 2048 bytes/.test(error.message),
          kind,
        );
        fs.writeFileSync(file, documentFor(overLimit));
        const unreadable = readPackSources(root);
        assert.equal(unreadable.ok, false, kind);
        assert.equal('sources' in unreadable, false, `${kind}: unavailable is never an empty list`);
        assert.equal(fs.readFileSync(file, 'utf8'), documentFor(overLimit), `${kind}: reading never truncates`);
      }

      // A save keeps the whole accepted location, and refuses the longer one before writing anything.
      fs.rmSync(file, { force: true });
      const saved = writePackSources(root, [{ type: 'local', location: atLimit }], 'absent');
      const savedBytes = fs.readFileSync(file);
      assert.deepEqual(readPackSources(root), { ok: true, sources: [{ type: 'local', location: atLimit }], revision: saved.revision }, kind);
      assert.throws(() => serializePackSourcesDocument([{ type: 'local', location: overLimit }]), refusal('unavailable'), kind);
      assert.throws(() => writePackSources(root, [{ type: 'local', location: overLimit }], saved.revision), refusal('unavailable'), kind);
      assert.deepEqual(fs.readFileSync(file), savedBytes, `${kind}: a refused save leaves the saved list as it was`);
      assert.deepEqual(fs.readdirSync(path.dirname(file)), ['pack-sources.md'], kind);
    }
  } finally {
    cleanup(parent);
  }
});

test('T007 source validation: only a public https://github.com/<owner>/<repo> remote is accepted, rebuilt from validated parts', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const validate = (/** @type {unknown} */ location, /** @type {unknown} */ ref) => validateNewSource({ root, sources: [], builtins, location, ref });

    // Letter case, `.git`, a trailing slash, and the scheme's case never change the key.
    const canonical = validate('https://github.com/Acme/Dude-Packs');
    assert.deepEqual(canonical.entry, { type: 'remote', repository: 'https://github.com/Acme/Dude-Packs', ref: 'main' });
    for (const spelling of [
      'https://github.com/acme/dude-packs',
      'https://github.com/Acme/Dude-Packs.git',
      'https://github.com/Acme/Dude-Packs/',
      'HTTPS://github.com/Acme/Dude-Packs',
    ]) {
      const accepted = validate(spelling);
      assert.equal(accepted.entry.type === 'remote' && accepted.entry.repository.toLowerCase(), 'https://github.com/acme/dude-packs', spelling);
      assert.equal(accepted.source.key, canonical.source.key, spelling);
    }

    const refused = [
      ['https://user:s3cr3t@github.com/acme/x', 'credentials'],
      ['https://s3cr3t@github.com/acme/x', 'credentials'],
      ['https://github.com@evil.example/acme/x', 'credentials'],
      ['https://github.com:443/acme/x', 'invalid_location', /port number/],
      ['https://github.com:8443/acme/x', 'invalid_location', /port number/],
      ['http://github.com/acme/x', 'invalid_location', /Other transports are not supported/],
      ['git://github.com/acme/x', 'invalid_location', /Other transports are not supported/],
      ['ssh://git@github.com/acme/x', 'invalid_location', /Other transports are not supported/],
      ['git@github.com:acme/x.git', 'invalid_location', /SSH addresses are not supported/],
      ['file:///tmp/x', 'invalid_location', /Other transports are not supported/],
      ['ext::sh -c touch% /tmp/pwned', 'invalid_location', /Other transports are not supported/],
      ['https://gitlab.com/acme/x', 'invalid_location', /Other hosts are not supported/],
      ['https://gist.github.com/acme/x', 'invalid_location', /Other hosts are not supported/],
      ['https://github.com.evil.example/acme/x', 'invalid_location', /Other hosts are not supported/],
      ['https://evil.example/github.com/acme/x', 'invalid_location', /Other hosts are not supported/],
      ['https://github.com./acme/x', 'invalid_location', /Other hosts are not supported/],
      ['https://GitHub.com/acme/x', 'invalid_location', /Other hosts are not supported/],
      ['https:github.com/acme/x', 'invalid_location', /complete https:\/\/ URL/],
      ['https://github.com\\acme\\x', 'invalid_location', /backslashes and encoded slashes/],
      ['https://github.com/acme%2Fx', 'invalid_location', /backslashes and encoded slashes/],
      ['https://github.com/acme%5Cx', 'invalid_location', /backslashes and encoded slashes/],
      ['https://github.com/acme/x?tab=readme', 'invalid_location', /query or fragment/],
      ['https://github.com/acme/x#readme', 'invalid_location', /query or fragment/],
      ['https://github.com/acme/x/tree/main', 'invalid_location', /repository address only/],
      ['https://github.com/acme', 'invalid_location', /repository address only/],
      ['https://github.com/', 'invalid_location', /repository address only/],
      ['https://github.com', 'invalid_location', /repository address only/],
      ['https://github.com/acme/x//', 'invalid_location', /repository address only/],
      ['https://github.com/acme/..', 'invalid_location', /repository address only/],
      ['https://github.com/ac me/x', 'invalid_location', /repository address only/],
      ['https://github.com/acme/x.git.git', 'invalid_location', /repository address only/],
      [' https://github.com/acme/x', 'invalid_location', /one line, without surrounding spaces/],
      ['https://github.com/acme/x\n', 'invalid_location', /one line, without surrounding spaces/],
      ['https://github.com/acme/x\u0000', 'invalid_location', /one line, without surrounding spaces/],
      ['https://github.com/acme/x\u2028', 'invalid_location', /one line, without surrounding spaces/],
      ['   ', 'invalid_location', /Enter a GitHub repository URL or a local folder/],
      ['', 'invalid_location', /Enter a GitHub repository URL or a local folder/],
      [undefined, 'invalid_location', /Enter a GitHub repository URL or a local folder/],
      [5, 'invalid_location', /Enter a GitHub repository URL or a local folder/],
    ];
    for (const [location, code = 'invalid_location', message] of refused) {
      assert.throws(
        () => validate(location),
        (error) => refusal(code)(error)
          && (!message || message.test(error.message))
          && !error.message.includes('s3cr3t')
          && !error.message.includes('evil.example'),
        String(location),
      );
    }

    // A URL-shaped value is judged as a URL, so it is never retried as a folder.
    for (const location of ['https://github.com/acme/folder-name/x/y', 'file:///tmp', 'ext::x']) {
      assert.throws(
        () => validate(location),
        (error) => error instanceof PackSourceError && !error.code.startsWith('local_'),
        location,
      );
    }
  } finally {
    cleanup(parent);
  }
});

test('T007 source validation: a ref is 1-128 safe characters without a leading dash or two periods, and only a remote has one', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const location = 'https://github.com/acme/dude-packs';
    const validate = (/** @type {string} */ place, /** @type {unknown} */ ref) => validateNewSource({ root, sources: [], builtins, location: place, ref });

    for (const omitted of [undefined, null, '']) assert.equal(validate(location, omitted).entry.type === 'remote' && validate(location, omitted).entry.ref, 'main');
    for (const ref of ['main', 'v1.0.0', 'release/1.2', 'feature_x.y-z', 'a'.repeat(128), '7'.repeat(40)]) {
      const entry = validate(location, ref).entry;
      assert.equal(entry.type === 'remote' && entry.ref, ref);
    }
    for (const ref of ['-x', '--upload-pack=touch', 'a'.repeat(129), 'a..b', '..', '.hidden', '/main', 'main ', ' main', 'a b', 'a:b', 'a\\b', 'caf\u00e9', 5, {}]) {
      assert.throws(() => validate(location, ref), refusal('invalid_ref'), JSON.stringify(ref));
    }

    // A local folder has no ref, and a supplied one is refused rather than ignored.
    const team = createSourceFolder(parent, 'team-packs');
    assert.throws(() => validate(team, 'main'), refusal('ref_not_applicable'));
    assert.deepEqual(validate(team, '').entry, { type: 'local', location: team });
    assert.deepEqual(validate(team, undefined).entry, { type: 'local', location: team });
  } finally {
    cleanup(parent);
  }
});

test('T007 source validation: a location is one trimmed line of at most 2,048 UTF-8 bytes', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const validate = (/** @type {string} */ location) => validateNewSource({ root, sources: [], builtins, location });
    const atLimit = ['x'.repeat(2048), `${'\u20ac'.repeat(682)}ab`];
    const overLimit = ['x'.repeat(2049), '\u20ac'.repeat(683), `${'\u20ac'.repeat(682)}abc`];
    for (const location of atLimit) {
      assert.equal(Buffer.byteLength(location), 2048);
      // Within the bound the value is judged as a folder, which does not exist.
      assert.throws(() => validate(location), refusal('local_missing'));
    }
    for (const location of overLimit) {
      assert.ok(Buffer.byteLength(location) > 2048);
      assert.throws(() => validate(location), refusal('invalid_location'));
    }
    for (const location of ['two\nlines', 'tab\there', 'bell\u0007', ' leading', 'trailing ', '\ud800lone-surrogate']) {
      assert.throws(() => validate(location), refusal('invalid_location'), JSON.stringify(location));
    }
  } finally {
    cleanup(parent);
  }
});

test('T007 source validation: a local source is an existing folder that contains library/packs, never the workspace library', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const validate = (/** @type {string} */ location) => validateNewSource({ root, sources: [], builtins, location });
    const team = createSourceFolder(parent, 'team-packs');
    createSourceFolder(parent, 'empty-packs', []);

    // Absolute and workspace-relative spellings are saved as typed and share one identity.
    const absolute = validate(team);
    const relative = validate('../team-packs');
    assert.deepEqual(absolute.entry, { type: 'local', location: team });
    assert.deepEqual(relative.entry, { type: 'local', location: '../team-packs' });
    assert.equal(absolute.source.type === 'local' && absolute.source.root, fs.realpathSync(team));
    assert.equal(relative.source.key, absolute.source.key);
    assert.equal(validate('../empty-packs').entry.type, 'local', 'a valid empty catalog is accepted');

    assert.throws(() => validate('../does-not-exist'), refusal('local_missing'));
    assert.throws(() => validate(path.join(team, 'library', 'packs', 'one', 'pack.md')), refusal('local_missing'), 'a file is not a folder');
    assert.throws(() => validate('C:\\definitely\\missing\\packs'), refusal('local_missing'), 'a Windows drive path is a folder, not a URL');
    assert.throws(() => validate(parent), refusal('local_layout'), 'a folder without library/packs');
    assert.throws(
      () => validate(path.join(team, 'library', 'packs')),
      (error) => refusal('bare_packs_folder')(error) && error.message === 'Choose the folder that contains library/packs.',
    );
    for (const own of ['.', root, '../workspace', `${root}${path.sep}`, path.join(root, 'library', '..')]) {
      assert.throws(() => validate(own), refusal('own_library'), own);
    }
  } finally {
    cleanup(parent);
  }
});

test('T007 source validation: a linked library folder is refused and a link to the workspace is still its own library', { skip: process.platform === 'win32' }, () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const validate = (/** @type {string} */ location) => validateNewSource({ root, sources: [], builtins, location });
    const team = createSourceFolder(parent, 'team-packs');
    const linkedLibrary = path.join(parent, 'linked-library');
    fs.mkdirSync(linkedLibrary);
    fs.symlinkSync(path.join(team, 'library'), path.join(linkedLibrary, 'library'), 'dir');
    assert.throws(() => validate(linkedLibrary), refusal('local_layout'));
    const alias = path.join(parent, 'workspace-alias');
    fs.symlinkSync(root, alias, 'dir');
    assert.throws(() => validate(alias), refusal('own_library'));
  } finally {
    cleanup(parent);
  }
});

test('T007 source validation: a repeated identity, even at another ref, and a ninth source are refused', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const upstream = builtins.find((builtin) => builtin.builtin === 'bundle-upstream');
    const first = validateNewSource({ root, sources: [], builtins, location: 'https://github.com/acme/dude-packs' });
    const saved = [first.entry];
    for (const [location, ref] of [
      ['https://github.com/acme/dude-packs'],
      ['https://github.com/acme/dude-packs', 'v2'],
      ['https://github.com/ACME/Dude-Packs.git/', 'main'],
    ]) {
      assert.throws(
        () => validateNewSource({ root, sources: saved, builtins, location, ref }),
        (error) => refusal('duplicate')(error) && error.key === first.source.key,
        location,
      );
    }
    // The bundle upstream is already a source.
    for (const [location, ref] of [['https://github.com/E-G-C/dude'], ['https://github.com/e-g-c/DUDE.git', 'v9']]) {
      assert.throws(
        () => validateNewSource({ root, sources: saved, builtins, location, ref }),
        (error) => refusal('duplicate')(error) && error.key === upstream?.key,
        location,
      );
    }

    // One folder spelled several ways is one source.
    const team = createSourceFolder(parent, 'team-packs');
    const local = validateNewSource({ root, sources: [], builtins, location: team });
    const spellings = [`${team}${path.sep}`, '../team-packs', path.join(team, '..', 'team-packs'), path.join(team, 'library', '..')];
    if (process.platform === 'win32') spellings.push(team.toUpperCase());
    for (const location of spellings) {
      assert.throws(
        () => validateNewSource({ root, sources: [local.entry], builtins, location }),
        (error) => refusal('duplicate')(error) && error.key === local.source.key,
        location,
      );
    }

    // Eight sources are accepted. The ninth is refused before its own checks.
    assert.equal(MAX_ADDED_SOURCES, 8);
    let list = [];
    for (let index = 0; index < MAX_ADDED_SOURCES; index += 1) {
      list = [...list, validateNewSource({ root, sources: list, builtins, location: `https://github.com/acme/pack-${index}` }).entry];
    }
    assert.equal(list.length, 8);
    assert.deepEqual(parsePackSourcesDocument(serializePackSourcesDocument(list)), list);
    for (const location of ['https://github.com/acme/pack-8', 'not even a location\n']) {
      assert.throws(() => validateNewSource({ root, sources: list, builtins, location }), refusal('limit'));
    }
  } finally {
    cleanup(parent);
  }
});

test('T007 source identity: keys are opaque, ignore the ref, cover the built-ins, and keep an unresolvable folder', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    assert.deepEqual(builtins.map((builtin) => builtin.builtin), ['local-library', 'bundle-upstream']);
    const [library, upstream] = builtins;
    assert.equal(library.type === 'local' && library.root, fs.realpathSync(path.join(root, 'library', 'packs')));
    assert.deepEqual(upstream.type === 'remote' && [upstream.repository, upstream.ref], [UPSTREAM.source_repo, 'main']);
    assert.deepEqual(
      describeBuiltinSources({ root, upstream: UPSTREAM }).map((builtin) => builtin.key),
      builtins.map((builtin) => builtin.key),
      'keys are derived the same way on every read',
    );
    const team = createSourceFolder(parent, 'team-packs');
    const described = (/** @type {import('../dude-engine/lib/pack-sources.mjs').PackSource[]} */ sources) => {
      const result = describePackSources({ root, sources, builtins });
      assert.equal(result.ok, true, JSON.stringify(result));
      return result.ok ? result.sources : [];
    };

    const [one] = described([remoteEntry(1, 'main')]);
    const [otherRef] = described([{ ...remoteEntry(1, 'v2'), repository: 'https://github.com/ACME/Pack-1' }]);
    assert.equal(one.key, otherRef.key, 'neither the ref nor letter case is identity');
    const [byRelative] = described([{ type: 'local', location: '../team-packs' }]);
    const [byAbsolute] = described([{ type: 'local', location: team }]);
    assert.equal(byRelative.key, byAbsolute.key);
    const keys = [library.key, upstream.key, one.key, byAbsolute.key];
    assert.equal(new Set(keys).size, 4, 'every source, built-in or added, has its own key');
    for (const key of keys) assert.match(key, /^src_[0-9a-f]{32}$/);

    // A folder that cannot be resolved still has a key, so a saved entry is never dropped.
    const [gone] = described([{ type: 'local', location: '../gone' }]);
    assert.equal(gone.type === 'local' && gone.root, null);
    assert.match(gone.key, /^src_[0-9a-f]{32}$/);
    assert.equal(described([{ type: 'local', location: '../gone/' }])[0].key, gone.key);

    // Two entries that are one source, or an entry that is a built-in, make the list unavailable.
    for (const sources of [
      [{ type: 'local', location: team }, { type: 'local', location: '../team-packs' }],
      [{ type: 'remote', repository: 'https://github.com/E-G-C/dude', ref: 'v2' }],
    ]) {
      const result = describePackSources({ root, sources: /** @type {any} */ (sources), builtins });
      assert.equal(result.ok, false);
      assert.match(result.ok ? '' : result.error, /sources\[\d\] repeats another source/);
      assert.throws(
        () => validateNewSource({ root, sources: /** @type {any} */ (sources), builtins, location: 'https://github.com/acme/other' }),
        refusal('unavailable'),
      );
    }

    // The library exists only while library/packs does, and the upstream only while the manifest names one.
    assert.deepEqual(describeBuiltinSources({ root, upstream: null }).map((builtin) => builtin.builtin), ['local-library']);
    fs.rmSync(path.join(root, 'library'), { recursive: true });
    assert.deepEqual(describeBuiltinSources({ root, upstream: { source_repo: 'https://github.com/E-G-C/dude' } }).map((builtin) => [builtin.builtin, builtin.type === 'remote' && builtin.ref]), [['bundle-upstream', 'main']]);
    assert.deepEqual(describeBuiltinSources({ root, upstream: null }), []);
  } finally {
    cleanup(parent);
  }
});

test('T007 source matching: recorded provenance matches by repository ignoring ref, or by real folder, never by pack name', () => {
  const { parent, root } = createSourcesWorkspace();
  try {
    const team = createSourceFolder(parent, 'team-packs');
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const [library, upstream] = builtins;
    const result = describePackSources({
      root,
      builtins,
      sources: [
        { type: 'remote', repository: 'https://github.com/acme/dude-packs', ref: 'main' },
        { type: 'local', location: '../team-packs' },
        { type: 'local', location: '../gone' },
      ],
    });
    assert.equal(result.ok, true);
    const [acme, folder, gone] = result.ok ? result.sources : [];
    const realTeam = fs.realpathSync(team);

    // What Compose records: the library's real library/packs, an added local source's containing root.
    const recorded = {
      library: { type: 'local', location: fs.realpathSync(path.join(root, 'library', 'packs')) },
      folder: { type: 'local', location: realTeam },
      insideFolder: { type: 'local', location: path.join(realTeam, 'library', 'packs') },
      acme: { type: 'remote', repository: 'https://github.com/ACME/Dude-Packs.git', requested_ref: 'a'.repeat(40), resolved_commit: 'a'.repeat(40) },
      upstream: { type: 'remote', repository: 'https://github.com/E-G-C/dude', requested_ref: 'latest', resolved_commit: 'b'.repeat(40) },
    };
    for (const [name, source] of [['library', library], ['folder', folder], ['acme', acme], ['upstream', upstream]]) {
      const matched = Object.entries(recorded)
        .filter(([, record]) => matchesRecordedSource(source, record))
        .map(([recordName]) => recordName);
      assert.deepEqual(matched, [name], `${name} matches only its own record; library/packs inside an added root is not that source`);
    }
    assert.equal(matchesRecordedSource(gone, recorded.folder), false, 'an unresolvable folder matches nothing');

    for (const garbage of [
      null, undefined, 'x', 5, {}, { type: 'local' }, { type: 'remote' },
      { type: 'local', location: '../team-packs' }, { type: 'local', location: 5 }, { type: 'remote', repository: 5 },
    ]) {
      for (const source of [library, folder, acme, upstream]) {
        assert.equal(matchesRecordedSource(source, garbage), false, JSON.stringify(garbage));
      }
    }

    // A bundle upstream that is not public GitHub compares as exact text.
    const odd = describeBuiltinSources({ root, upstream: { source_repo: 'file:///srv/dude.git', source_ref: 'main' } })
      .find((builtin) => builtin.builtin === 'bundle-upstream');
    assert.ok(odd);
    assert.equal(matchesRecordedSource(odd, { type: 'remote', repository: 'file:///srv/dude.git', requested_ref: 'main', resolved_commit: null }), true);
    assert.equal(matchesRecordedSource(odd, { type: 'remote', repository: 'file:///srv/other.git', requested_ref: 'main', resolved_commit: null }), false);

    // Windows folders compare without regard to letter case.
    if (process.platform === 'win32') {
      assert.equal(matchesRecordedSource(folder, { type: 'local', location: realTeam.toUpperCase() }), true);
    }
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: the writer swaps one file against the exact revision and refuses a stale or unreadable preimage', () => {
  const { parent, root, file } = createSourcesWorkspace();
  const metadata = path.dirname(file);
  try {
    const one = [remoteEntry(1)];
    const two = [remoteEntry(1), remoteEntry(2)];

    // Expected-missing creation, and a revision that expects a file that is not there.
    assert.throws(() => writePackSources(root, one, sha256Revision('x')), refusal('stale'));
    assert.equal(exists(file), false);
    const created = writePackSources(root, one, 'absent');
    assert.deepEqual(fs.readdirSync(metadata), ['pack-sources.md'], 'one file, no temporary or backup residue');
    const createdBytes = fs.readFileSync(file);
    assert.throws(() => writePackSources(root, two, 'absent'), refusal('stale'));
    assert.deepEqual(fs.readFileSync(file), createdBytes);

    // Replacement against the exact revision, then a stale one that is neither merged nor retried.
    const replaced = writePackSources(root, two, created.revision);
    assert.notEqual(replaced.revision, created.revision);
    assert.deepEqual(readPackSources(root), { ok: true, sources: two, revision: replaced.revision });
    assert.throws(() => writePackSources(root, [remoteEntry(3)], created.revision), refusal('stale'));
    assert.deepEqual(readPackSources(root).ok && readPackSources(root).sources, two);

    // Two writers that read the same revision: the first lands, the second is refused.
    const read = readPackSources(root);
    assert.equal(read.ok, true);
    const base = read.ok ? read.sources : [];
    const revision = read.ok ? read.revision : '';
    writePackSources(root, [...base, remoteEntry(3)], revision);
    assert.throws(() => writePackSources(root, [...base, remoteEntry(4)], revision), refusal('stale'));
    assert.deepEqual(readPackSources(root).ok && readPackSources(root).sources, [...two, remoteEntry(3)]);

    // An unreadable list is never replaced, even when the caller presents its own hash.
    const garbage = 'not a sources document';
    fs.writeFileSync(file, garbage);
    assert.throws(() => writePackSources(root, [], sha256Revision(garbage)), refusal('unavailable'));
    assert.equal(fs.readFileSync(file, 'utf8'), garbage);

    // Removing the last source leaves a valid empty list.
    fs.writeFileSync(file, serializePackSourcesDocument(one));
    const current = readPackSources(root);
    writePackSources(root, [], current.ok ? current.revision : '');
    assert.deepEqual(readPackSources(root).ok && readPackSources(root).sources, []);
    assert.deepEqual(fs.readdirSync(metadata), ['pack-sources.md']);
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: a caught write failure keeps or restores the previous bytes and leaves no residue', () => {
  const { parent, root, file } = createSourcesWorkspace();
  const metadata = path.dirname(file);
  const originalWriteFileSync = fs.writeFileSync;
  const originalRenameSync = fs.renameSync;
  try {
    const one = [remoteEntry(1)];
    const two = [remoteEntry(1), remoteEntry(2)];
    const isTemporary = (/** @type {unknown} */ target) => typeof target === 'string' && path.basename(target).startsWith('pack-sources.md.tmp-');
    const isBackup = (/** @type {unknown} */ target) => typeof target === 'string' && path.basename(target).startsWith('pack-sources.md.backup-');

    // A failed temporary write: nothing is created, and nothing is left behind.
    fs.writeFileSync = (target, ...rest) => {
      if (isTemporary(target)) throw new Error('injected write failure');
      return originalWriteFileSync(target, ...rest);
    };
    assert.throws(() => writePackSources(root, one, 'absent'), /injected write failure/);
    fs.writeFileSync = originalWriteFileSync;
    assert.equal(exists(file), false);
    assert.deepEqual(fs.readdirSync(metadata), []);

    // A failed swap after the previous file was moved aside: the previous bytes return.
    const created = writePackSources(root, one, 'absent');
    const before = fs.readFileSync(file);
    fs.renameSync = (from, to) => {
      if (isTemporary(from)) throw new Error('injected rename failure');
      return originalRenameSync(from, to);
    };
    assert.throws(() => writePackSources(root, two, created.revision), /injected rename failure/);
    fs.renameSync = originalRenameSync;
    assert.deepEqual(fs.readFileSync(file), before);
    assert.deepEqual(fs.readdirSync(metadata), ['pack-sources.md']);

    // A failed creation swap leaves no file at all.
    fs.rmSync(file);
    fs.renameSync = (from, to) => {
      if (isTemporary(from)) throw new Error('injected rename failure');
      return originalRenameSync(from, to);
    };
    assert.throws(() => writePackSources(root, one, 'absent'), /injected rename failure/);
    fs.renameSync = originalRenameSync;
    assert.deepEqual(fs.readdirSync(metadata), []);

    // If even the restore fails, the error names where the previous bytes remain.
    writePackSources(root, one, 'absent');
    fs.renameSync = (from, to) => {
      if (isTemporary(from)) throw new Error('injected rename failure');
      if (isBackup(from)) throw new Error('injected restore failure');
      return originalRenameSync(from, to);
    };
    assert.throws(
      () => writePackSources(root, two, sha256Revision(before)),
      /previous bytes remain in pack-sources\.md\.backup-/,
    );
    fs.renameSync = originalRenameSync;
    const residue = fs.readdirSync(metadata);
    assert.equal(residue.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(metadata, residue[0])), before);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    fs.renameSync = originalRenameSync;
    cleanup(parent);
  }
});

test('T007 saved sources: the add and remove sequence a Canvas caller uses works end to end through the shared API', () => {
  const { parent, root, file } = createSourcesWorkspace();
  try {
    const team = createSourceFolder(parent, 'team-packs');
    const builtins = describeBuiltinSources({ root, upstream: UPSTREAM });
    const add = (/** @type {string} */ location) => {
      const read = readPackSources(root);
      assert.equal(read.ok, true);
      assert.ok(read.ok);
      const added = validateNewSource({ root, sources: read.sources, builtins, location });
      const saved = writePackSources(root, [...read.sources, added.entry], read.revision);
      return { key: added.source.key, revision: saved.revision };
    };
    const acme = add('https://github.com/acme/dude-packs');
    const folder = add(team);

    // The keys the adds returned are the keys every later read derives.
    const read = readPackSources(root);
    assert.ok(read.ok);
    assert.equal(read.revision, folder.revision);
    const described = describePackSources({ root, sources: read.sources, builtins });
    assert.ok(described.ok);
    assert.deepEqual(described.sources.map((source) => source.key), [acme.key, folder.key]);

    // A removal names the current key and revision, and deletes only that entry.
    const remaining = read.sources.filter((_, index) => described.sources[index].key !== acme.key);
    const removed = writePackSources(root, remaining, read.revision);
    const after = readPackSources(root);
    assert.ok(after.ok);
    assert.equal(after.revision, removed.revision);
    assert.deepEqual(after.sources, [{ type: 'local', location: team }]);
    assert.deepEqual(
      describePackSources({ root, sources: after.sources, builtins }).ok && describePackSources({ root, sources: after.sources, builtins }).sources.map((source) => source.key),
      [folder.key],
    );
    assert.throws(() => writePackSources(root, [], read.revision), refusal('stale'), 'the removed-from revision is stale');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['pack-sources.md']);
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: an unusable sources path is unavailable and is never written through', () => {
  const { parent, root, file } = createSourcesWorkspace();
  const metadata = path.dirname(file);
  try {
    // The sources path is a folder.
    fs.mkdirSync(file);
    const asFolder = readPackSources(root);
    assert.equal(asFolder.ok, false);
    assert.match(asFolder.ok ? '' : asFolder.error, /must be a regular file/);
    assert.throws(() => writePackSources(root, [remoteEntry(1)], 'absent'), refusal('unavailable'));
    assert.equal(fs.statSync(file).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(metadata), ['pack-sources.md']);
    assert.deepEqual(fs.readdirSync(file), []);

    // Its metadata folder is a file.
    fs.rmSync(metadata, { recursive: true });
    fs.writeFileSync(metadata, 'not a folder');
    assert.equal(readPackSources(root).ok, false);
    assert.throws(() => writePackSources(root, [remoteEntry(1)], 'absent'), /non-directory parent/);
    assert.equal(fs.readFileSync(metadata, 'utf8'), 'not a folder');
  } finally {
    cleanup(parent);
  }
});

test('T007 saved sources: a linked sources file or metadata folder is refused without touching its target', { skip: process.platform === 'win32' }, () => {
  const { parent, root, file } = createSourcesWorkspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-sources-outside-'));
  try {
    const external = path.join(outside, 'pack-sources.md');
    fs.writeFileSync(external, serializePackSourcesDocument([remoteEntry(9)]));
    const externalBytes = fs.readFileSync(external);
    fs.symlinkSync(external, file);
    assert.equal(readPackSources(root).ok, false);
    assert.throws(() => writePackSources(root, [remoteEntry(1)], sha256Revision(externalBytes)), /symbolic link/);
    assert.deepEqual(fs.readFileSync(external), externalBytes);

    fs.rmSync(file);
    fs.rmSync(path.dirname(file), { recursive: true });
    fs.symlinkSync(outside, path.dirname(file), 'dir');
    assert.equal(readPackSources(root).ok, false);
    assert.throws(() => writePackSources(root, [remoteEntry(1)], sha256Revision(externalBytes)), /symbolic link/);
    assert.deepEqual(fs.readdirSync(outside), ['pack-sources.md']);
    assert.deepEqual(fs.readFileSync(external), externalBytes);
  } finally {
    cleanup(parent);
    cleanup(outside);
  }
});

/* ------------------------------------------- T007 explicit source resolution */

test('T007 an explicit remote source is exclusive for list, add, and refresh, and never falls back', async () => {
  const remote = createRemoteCatalog();
  const manifestRemote = createRemoteCatalog();
  const root = createRoot();
  try {
    writePack(root, 'shared', [packAgent('shared', 'worker', { name: 'shared local' })], { skill: false });
    writePack(root, 'local-only', [packAgent('local-only', 'worker', { name: 'local-only local' })], { skill: false });
    writeRemotePack(remote.repo, 'shared', 'remote');
    writeRemotePack(remote.repo, 'remote-only', 'remote');
    const firstCommit = commitRemote(remote.repo, 'publish the explicit catalog');
    writeRemotePack(manifestRemote.repo, 'manifest-only', 'manifest');
    commitRemote(manifestRemote.repo, 'publish the manifest catalog');
    writeManifestSource(root, manifestRemote.source, 'main');
    const library = path.join(root, 'library', 'packs');
    const explicit = { root, library, source: remote.source, ref: 'main' };
    const unusable = { root, library, source: 'file:///definitely-missing-explicit-source', ref: 'main' };

    // list: only the explicit source's packs, though the library and the manifest have others.
    const listed = await cmdList(explicit);
    assert.equal(listed.ok, true, listed.error);
    assert.deepEqual(listed.result?.packs.map((pack) => pack.name), ['remote-only', 'shared']);
    assert.equal(listed.result?.origin, `${remote.source} @ main`);
    assertListedDescription(listed, 'shared', 'shared catalog remote');
    assert.deepEqual(
      (await cmdList({ root, library })).result?.packs.map((pack) => pack.name),
      ['local-only', 'shared'],
      'without a source the whole local catalog still wins',
    );

    // add: a pack the library also has is installed from the explicit source.
    const added = await cmdAdd({ ...explicit, name: 'shared', force: false });
    assert.equal(added.ok, true, added.error);
    assertInstalledVersion(root, 'shared', 'remote');
    assert.deepEqual(readProfile(root).installed.shared.source, {
      type: 'remote',
      repository: remote.source,
      requested_ref: 'main',
      resolved_commit: firstCommit,
    });

    // A pack only the library or only the manifest's upstream has is not found, and not taken from there.
    for (const name of ['local-only', 'manifest-only']) {
      const before = mutationSnapshot(root);
      const missing = await cmdAdd({ ...explicit, name, force: false });
      assert.equal(missing.ok, false, name);
      assert.match(missing.error || '', new RegExp(`pack "${name}" not found in source`));
      assertMutationUnchanged(root, before);
      assert.equal(readProfile(root).installed[name], undefined);
    }

    // refresh: the same source, at its new commit, though the library has a same-named pack.
    writeRemotePack(remote.repo, 'shared', 'remote-b');
    const secondCommit = commitRemote(remote.repo, 'publish the second revision');
    const preview = await cmdPreviewRefresh({ ...explicit, name: 'shared' });
    assert.equal(preview.ok, true, preview.error);
    assert.equal(preview.result.source.resolved_commit, secondCommit);
    const refreshed = await cmdRefresh({ ...explicit, name: 'shared' });
    assert.equal(refreshed.ok, true, refreshed.error);
    assertInstalledVersion(root, 'shared', 'remote-b');
    assert.equal(readProfile(root).installed.shared.source.resolved_commit, secondCommit);

    // A source that cannot be fetched is a refusal, not a reason to use the library or the manifest.
    const listFailure = await cmdList(unusable);
    assert.equal(listFailure.ok, false);
    assert.match(listFailure.error || '', /failed to fetch source/);
    const before = mutationSnapshot(root);
    const addFailure = await cmdAdd({ ...unusable, name: 'local-only', force: false });
    assert.equal(addFailure.ok, false);
    assert.match(addFailure.error || '', /failed to fetch source/);
    const refreshFailure = await cmdRefresh({ ...unusable, name: 'shared' });
    assert.equal(refreshFailure.ok, false);
    assert.match(refreshFailure.error || '', /failed to fetch source/);
    assert.equal(refreshFailure.mutation, 'none');
    assertMutationUnchanged(root, before);
  } finally {
    cleanup(root);
    cleanup(remote.parent);
    cleanup(manifestRemote.parent);
  }
});

test('T007 an explicit source without the catalog or pack, or under --no-fetch, is a refusal that ignores --library', async () => {
  const remote = createRemoteCatalog();
  const bare = createRemoteCatalog();
  const root = createRoot();
  const elsewhere = createRoot();
  try {
    writePack(root, 'shared', [packAgent('shared', 'worker', { name: 'shared local' })], { skill: false });
    writePack(elsewhere, 'elsewhere', [packAgent('elsewhere', 'worker')], { skill: false });
    writeRemotePack(remote.repo, 'shared', 'remote');
    commitRemote(remote.repo, 'publish the explicit catalog');
    fs.writeFileSync(path.join(bare.repo, 'README.md'), '# A repository with no pack catalog\n');
    commitRemote(bare.repo, 'publish without a catalog');
    const library = path.join(root, 'library', 'packs');
    const before = mutationSnapshot(root);

    // No catalog in the explicit source: nothing is answered from the library.
    const noCatalog = await cmdList({ root, library, source: bare.source, ref: 'main' });
    assert.equal(noCatalog.ok, false);
    assert.match(noCatalog.error || '', /no pack catalog found in/);
    const noPack = await cmdAdd({ root, library, name: 'shared', force: false, source: bare.source, ref: 'main' });
    assert.equal(noPack.ok, false);
    assert.match(noPack.error || '', /pack "shared" not found in source/);
    assertMutationUnchanged(root, before);

    // --no-fetch never fetches an explicit remote, and the library is not a fallback.
    const noFetchList = await cmdList({ root, library, fetch: false, source: remote.source });
    assert.equal(noFetchList.ok, false);
    assert.match(noFetchList.error || '', /--no-fetch does not fetch it/);
    const noFetchAdd = await cmdAdd({ root, library, name: 'shared', force: false, fetch: false, source: remote.source });
    assert.equal(noFetchAdd.ok, false);
    assert.match(noFetchAdd.error || '', /--no-fetch does not fetch it/);
    assertMutationUnchanged(root, before);
    assert.equal((await addPack(root, 'shared')).ok, true, 'without a source the library still installs it');
    assertInstalledVersion(root, 'shared', 'local');
    const installed = mutationSnapshot(root);
    const noFetchRefresh = await cmdRefresh({ root, library, name: 'shared', fetch: false, source: remote.source });
    assert.equal(noFetchRefresh.ok, false);
    assert.match(noFetchRefresh.error || '', /--no-fetch does not fetch it/);
    assert.equal(noFetchRefresh.mutation, 'none');
    assertMutationUnchanged(root, installed);

    // --library is not consulted when a source is explicit.
    const ignored = await cmdList({ root, library: path.join(elsewhere, 'library', 'packs'), source: remote.source, ref: 'main' });
    assert.equal(ignored.ok, true, ignored.error);
    assert.deepEqual(ignored.result?.packs.map((pack) => pack.name), ['shared']);
  } finally {
    cleanup(root);
    cleanup(elsewhere);
    cleanup(remote.parent);
    cleanup(bare.parent);
  }
});

test('T007 an explicit local source is read in place, records its containing root, and has no fallback', async () => {
  const root = createRoot();
  const folder = createRoot();
  const noLayout = createRoot();
  try {
    writePack(root, 'shared', [packAgent('shared', 'worker', { name: 'shared local' })], { skill: false });
    writePack(root, 'local-only', [packAgent('local-only', 'worker', { name: 'local-only local' })], { skill: false });
    writePack(folder, 'shared', [packAgent('shared', 'worker', { name: 'shared folder' })], { skill: false });
    writePack(folder, 'folder-only', [packAgent('folder-only', 'worker', { name: 'folder-only folder' })], { skill: false });
    fs.rmSync(path.join(noLayout, 'library'), { recursive: true });
    const library = path.join(root, 'library', 'packs');

    const listed = await cmdList({ root, library, source: folder });
    assert.equal(listed.ok, true, listed.error);
    assert.deepEqual(listed.result?.packs.map((pack) => pack.name), ['folder-only', 'shared']);
    assert.equal(listed.result?.origin, `source ${folder}`);

    // The folder's pack is installed, not the same-named library pack, and its containing root is recorded.
    const added = await cmdAdd({ root, library, name: 'shared', force: false, source: folder });
    assert.equal(added.ok, true, added.error);
    assertInstalledVersion(root, 'shared', 'folder');
    assert.deepEqual(readProfile(root).installed.shared.source, { type: 'local', location: fs.realpathSync(folder) });

    // A local folder needs no fetch, so --no-fetch still reads it.
    const noFetch = await cmdAdd({ root, library, name: 'folder-only', force: false, fetch: false, source: folder });
    assert.equal(noFetch.ok, true, noFetch.error);

    // A pack only the library has, or a folder with no library/packs, is a refusal.
    const before = mutationSnapshot(root);
    const missing = await cmdAdd({ root, library, name: 'local-only', force: false, source: folder });
    assert.equal(missing.ok, false);
    assert.match(missing.error || '', /pack "local-only" not found in source/);
    const noCatalog = await cmdList({ root, library, source: noLayout });
    assert.equal(noCatalog.ok, false);
    assert.match(noCatalog.error || '', /no pack catalog found in/);
    assertMutationUnchanged(root, before);

    // refresh reads the same folder.
    const packAgentFile = path.join(folder, 'library', 'packs', 'shared', 'agents', 'dude-pack-shared-worker.agent.md');
    fs.writeFileSync(packAgentFile, fs.readFileSync(packAgentFile, 'utf8').replace('You are shared folder.', 'You are shared folder refreshed.'));
    const refreshed = await cmdRefresh({ root, library, name: 'shared', source: folder });
    assert.equal(refreshed.ok, true, refreshed.error);
    assertInstalledVersion(root, 'shared', 'folder refreshed');
    assert.deepEqual(readProfile(root).installed.shared.source, { type: 'local', location: fs.realpathSync(folder) });

    // The CLI passes --source straight through, with the same exclusivity.
    const cliList = runCompose(root, 'list', '--source', folder, '--json');
    assert.equal(cliList.status, 0, cliList.stderr);
    assert.deepEqual(JSON.parse(cliList.stdout).packs.map((pack) => pack.name), ['folder-only', 'shared']);
    const cliMissing = runCompose(root, 'add', 'local-only', '--source', folder);
    assert.equal(cliMissing.status, 2);
    assert.match(cliMissing.stderr, /\[FAIL\] pack "local-only" not found in source/);
  } finally {
    cleanup(root);
    cleanup(folder);
    cleanup(noLayout);
  }
});

test('T007 ordinary Compose calls neither read nor enumerate the saved sources', async () => {
  const root = scaffold();
  try {
    // A file any reader would refuse, naming a source that must never be contacted.
    const sourcesFile = path.join(root, ...PACK_SOURCES_PATH.split('/'));
    fs.writeFileSync(
      sourcesFile,
      sourcesBlock('{"sources":[{"type":"remote","repository":"https://github.com/acme/never-contacted","ref":"main"},{"type":"x"}'),
    );
    const bytes = fs.readFileSync(sourcesFile);
    for (const args of [['list', '--json'], ['status', '--json'], ['add', 'demo', '--json'], ['refresh', 'demo', '--json'], ['remove', 'demo', '--json']]) {
      const result = runCompose(root, ...args);
      assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    }
    assert.deepEqual(fs.readFileSync(sourcesFile), bytes);
    assert.doesNotMatch(fs.readFileSync(COMPOSE_SOURCE, 'utf8'), /pack-sources/);
  } finally {
    cleanup(root);
  }
});

/* ---------------------------------------------- T007 Compose owner guidance */

test('T007 Compose guidance documents the exclusive source, the catalogSource binding, pinning, freshness, and the result echo', () => {
  const text = fs.readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');
  const unwrap = (/** @type {string} */ value) => value.replace(/\s+/g, ' ');
  const flags = unwrap(text.split('\n## Engine\n')[1]?.split('\n## Discovery metadata')[0] ?? '');
  const catalog = unwrap(text.split('\n## Catalog Resolution\n')[1]?.split('\n## Verify')[0] ?? '');
  const section = text.split('## Canvas Pack Requests And Results\n')[1]?.split('\n## Add Flow')[0] ?? '';
  const sources = unwrap(section.split('### Sources In Pack Requests\n')[1]?.split('The pack acknowledgment has exactly these fields')[0] ?? '');
  assert.ok(flags && catalog && section && sources, 'the shipped skill must contain each owner section');

  for (const requirement of [
    'an explicit `--source` is exclusive, see Catalog Resolution',
    'a remote repository, or a local folder that contains `library/packs`',
  ]) assert.ok(flags.includes(requirement), `missing --source documentation: ${requirement}`);
  for (const requirement of [
    'An explicit `--source` replaces that order.',
    'The local catalog is skipped, the manifest is not consulted, `--library` is ignored',
    'a missing pack, a missing catalog, or a fetch failure is a refusal, never a reason to try another catalog',
    'With `--no-fetch`, an explicit remote source is refused rather than fetched',
    'no Compose call reads or lists `.dude/metadata/pack-sources.md`',
  ]) assert.ok(catalog.includes(requirement), `missing catalog resolution rule: ${requirement}`);
  for (const requirement of [
    'Make the source the first permission target',
    'the configured ref for a remote source, and the resolved commit',
    'say that a remote commit is not applicable and do not invent one',
    'target revision is `commit:<40 hex>`',
    'Label a source the project added "Third-party source"',
    'begin that target with `Source changes: A -> B` whenever they differ',
    'including an unlisted local path moving to the local library',
    '`catalogSource`',
    'It is absent, never `null`',
    'Retain `catalogSource` exactly as received',
    '`--source <repository>` and the configured `--ref <ref>` for a remote source',
    'or `--source <location>` for a local folder, and add no other source and no `--library` or `--force`',
    'a refresh preview reports it as `source.resolved_commit`',
    'For an install, await `resolvePackDir` from `.github/skills/dude-compose/compose.mjs` with the root, library, pack name, source, and ref the install will use',
    'never a reason to use another source or catalog',
    'The raw-bytes revision of `.dude/metadata/pack-sources.md`',
    'must still equal `sourcesRevision`',
    'Apply with `--ref <resolved_commit>`',
    'Put the same `catalogSource`, unchanged, in the acknowledgment as `catalogSource`, and only when the request was bound to one',
    'A matching pack name or an echoed key alone is not enough.',
    'Removal is source-free',
  ]) assert.ok(sources.includes(requirement), `missing source-bound owner rule: ${requirement}`);

  // The default-only bodies and acknowledgment keep their exact bytes: no field, never null.
  assert.ok(section.includes(
    '{"op":"prepare","operation":"install","name":"<exact pack name>"}\n'
    + '{"op":"submit","operation":"install","name":"<exact pack name>","packReceipt":"<provider UUID>"}\n',
  ));
  const acknowledgment = JSON.parse(section.match(/```json\n(\{\n[\s\S]*?)\n```/)[1]).acknowledgment;
  assert.equal(Object.hasOwn(acknowledgment, 'catalogSource'), false);

  // The source-bound bodies and the closed binding are exactly the contract.
  assert.ok(section.includes(
    '{"op":"prepare","operation":"install","name":"<exact pack name>","source":"<configured source key>"}\n'
    + '{"op":"submit","operation":"install","name":"<exact pack name>","source":"<same source key>","packReceipt":"<provider UUID>"}\n',
  ));
  const binding = JSON.parse(/```json\n(\{"catalogSource":[^\n]*\})\n```/.exec(section)?.[1] ?? 'null');
  assert.deepEqual(Object.keys(binding.catalogSource), ['key', 'sourcesRevision', 'source']);
  assert.deepEqual(Object.keys(binding.catalogSource.source), ['type', 'repository', 'ref']);
});

/* ----------------------------------------- T007 upgrade --all Compose calls */

// `upgrade --all` gives Compose the plan's resolved commit as `ref` and never a `source`: an explicit
// source is exclusive and would skip a local target's catalog. Behaviour tests cannot see a `source`
// that resolves to the catalog Compose would have read anyway, so this reads the two call sites. The
// scan is lexical: it blanks comments and string or template literals and matches brackets, and it
// does not understand regular-expression literals or nested templates. If `cmdPacks` gains one and
// this test stops finding the calls, extend the scan rather than the expectations.
// Alternatives: block comment, line comment, 'string', "string", template (substitutions included).
const UPGRADE_NON_CODE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\[\s\S]|[^'\\\n])*'|"(?:\\[\s\S]|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`/g;

/**
 * The index of the bracket that closes the one at `open`.
 * @param {string} code source with comments and literals blanked
 * @param {number} open
 * @returns {number}
 */
function closingBracket(code, open) {
  let depth = 0;
  for (let at = open; at < code.length; at += 1) {
    if ('([{'.includes(code[at])) depth += 1;
    if (')]}'.includes(code[at])) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return assert.fail(`nothing closes the bracket at offset ${open}; the scan may have misread a regular-expression literal or a nested template`);
}

/**
 * The non-empty ranges between the top-level commas of `code.slice(from, to)`.
 * @param {string} code source with comments and literals blanked
 * @param {number} from
 * @param {number} to
 * @returns {Array<[number, number]>}
 */
function splitTopLevel(code, from, to) {
  const cuts = [from - 1];
  let depth = 0;
  for (let at = from; at < to; at += 1) {
    if ('([{'.includes(code[at])) depth += 1;
    else if (')]}'.includes(code[at])) depth -= 1;
    else if (code[at] === ',' && depth === 0) cuts.push(at);
  }
  cuts.push(to);
  return cuts
    .slice(1)
    .map((end, index) => /** @type {[number, number]} */ ([cuts[index] + 1, end]))
    .filter(([start, end]) => code.slice(start, end).trim() !== '');
}

/**
 * Read `async function cmdPacks` of the upgrade source without running it: its body with comments and
 * literals blanked, and each `compose.cmdPreviewRefresh(` / `compose.cmdRefresh(` call in it with the
 * properties of its one object-literal argument (`null` when the argument is anything else).
 * @param {string} source
 */
function readCmdPacks(source) {
  const heads = [...source.matchAll(/\basync\s+function\s+cmdPacks\s*\(/g)];
  assert.equal(heads.length, 1, 'upgrade.mjs must declare `async function cmdPacks(` exactly once');
  const written = source.slice(heads[0].index);
  const blanked = written.replace(UPGRADE_NON_CODE, (token) => token.replace(/[^\n]/g, ' '));
  const bodyStart = blanked.indexOf('{', closingBracket(blanked, heads[0][0].length - 1));
  const bodyEnd = closingBracket(blanked, bodyStart);
  const text = written.slice(bodyStart + 1, bodyEnd);
  const code = blanked.slice(bodyStart + 1, bodyEnd);
  // Once literals are blanked no quote or backtick is left, unless the scan misread something.
  assert.doesNotMatch(code, /['"`]/, 'cmdPacks holds a quote or backtick outside any string, template, or comment, most likely in a regular-expression literal that the scan does not understand');

  const calls = [...code.matchAll(/\bcompose\s*\.\s*(cmdPreviewRefresh|cmdRefresh)\s*\(/g)].map((match) => {
    const at = /** @type {number} */ (match.index);
    const paren = at + match[0].length - 1;
    const [argument, ...others] = splitTopLevel(code, paren + 1, closingBracket(code, paren));
    /** @type {Array<{ key: string, value: string | null, written: string }> | null} */
    let properties = null;
    if (argument && others.length === 0) {
      const open = argument[0] + code.slice(...argument).search(/\S/);
      const close = argument[0] + code.slice(...argument).trimEnd().length - 1;
      if (code[open] === '{' && closingBracket(code, open) === close) {
        properties = splitTopLevel(code, open + 1, close).map(([start, end]) => {
          const written = text.slice(start, end).replace(/\s+/g, ' ').trim();
          // Only `name` and `name: value` have a key; spreads, quoted or computed keys, and methods do not.
          const plain = /^([A-Za-z_$][\w$]*)\s*(?::\s*([\s\S]+))?$/.exec(code.slice(start, end).trim());
          return plain
            ? { key: plain[1], value: plain[2] ?? plain[1], written }
            : { key: `<${written}>`, value: null, written };
        });
      }
    }
    return { method: match[1], at, properties };
  });
  return { code, calls };
}

test('T007 upgrade --all: the Compose preview and refresh calls pass exactly root, library, name, and the resolved-commit ref, never a source', () => {
  const { code, calls } = readCmdPacks(fs.readFileSync(new URL('../dude-bundle-upgrade/upgrade.mjs', import.meta.url), 'utf8'));

  // One `ref`, bound at the top level of cmdPacks to the plan's resolved commit, before either call.
  const declarations = [...code.matchAll(/\b(?:const|let|var)\s+ref\b/g)];
  assert.equal(declarations.length, 1, `cmdPacks must declare \`ref\` exactly once, found ${declarations.length}`);
  const declared = /** @type {number} */ (declarations[0].index);
  const binding = /const\s+ref\s*=\s*plan\s*\.\s*source\s*\.\s*resolved_commit\s*;/y;
  binding.lastIndex = declared;
  assert.ok(binding.test(code), 'cmdPacks must bind `const ref = plan.source.resolved_commit;`');
  const before = code.slice(0, declared);
  assert.equal(
    (before.match(/[([{]/g) ?? []).length,
    (before.match(/[)\]}]/g) ?? []).length,
    'the `ref` binding must sit at the top level of cmdPacks so that both calls see it',
  );

  for (const method of ['cmdPreviewRefresh', 'cmdRefresh']) {
    const found = calls.filter((call) => call.method === method);
    assert.equal(found.length, 1, `cmdPacks must call compose.${method}( exactly once, found ${found.length}`);
    const [{ at, properties }] = found;
    assert.ok(properties, `compose.${method} must be passed one object literal`);
    const shown = properties.map((property) => property.written).join(', ');
    assert.deepEqual(
      properties.map((property) => property.key).sort(),
      ['library', 'name', 'ref', 'root'],
      `compose.${method} must pass exactly root, library, name, and ref, never a source: { ${shown} }`,
    );
    assert.equal(
      properties.find((property) => property.key === 'ref')?.value,
      'ref',
      `compose.${method} must pass the bound commit as ref: { ${shown} }`,
    );
    assert.ok(declared < at, `ref must be bound before compose.${method}(`);
  }
});

/* ---------------------------------------- T002 targeted remote acquisition */

// Captured before any test records process starts, so the fixture repository's
// own Git, including the GitHub stand-in's object reads, never counts as Compose's.
const fixtureSpawnSync = childProcess.spawnSync;
const PROCESS_APIS = /** @type {const} */ (['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']);
const GITHUB_SOURCE = 'https://github.com/acme/catalog';
const GITHUB_API = 'https://api.github.com/repos/acme/catalog';
const GITHUB_RAW = 'https://raw.githubusercontent.com/acme/catalog';
/** Bytes any text conversion would change: a NUL, CRLFs, and a lone CR. */
const BINARY_ASSET = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x0d, 0x0a, 0xfe, 0x0d]);
const STALE_ADD = 'profile changed after authorizing add of pack "alpha"; refusing add';
const STALE_LIST = 'profile changed while the catalog was read; refusing stale installed flags';

/** @param {string} cwd @param {...string} args */
function fixtureGit(cwd, ...args) {
  const result = fixtureSpawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed in ${cwd}: ${result.stderr || result.stdout || 'no output'}`);
  return result.stdout.trim();
}

/** @typedef {string | Buffer | { bytes: string, executable: true }} CatalogFile */

/**
 * One published revision of a multi-pack catalog. `alpha` ships nested skill
 * companions, an executable script, a binary asset, and notices; `gamma` is a
 * folder without a manifest; everything outside `library/packs` is unrelated.
 * Revision `two` drops alpha's prompt, changes its agent, and adds an instruction.
 * @param {'one' | 'two'} revision
 * @returns {Record<string, CatalogFile>}
 */
function catalogFiles(revision) {
  const alpha = 'library/packs/alpha';
  const skill = `${alpha}/skills/dude-pack-alpha-writer`;
  return {
    'README.md': '# Unrelated repository content\n',
    'docs/large.bin': Buffer.alloc(256 * 1024, 7),
    'library/README.md': '# Library\n',
    'library/packs/notes.txt': 'not a pack\n',
    [`${alpha}/pack.md`]: '---\nname: alpha\ndescription: "alpha pack"\nuse-cases: [writing]\n---\n# alpha\n',
    [`${alpha}/LICENSE`]: 'MIT License (alpha)\n',
    [`${alpha}/NOTICE`]: 'alpha notice\n',
    [`${alpha}/agents/dude-pack-alpha-worker.agent.md`]: agentSource({ name: `Alpha Worker ${revision}` }),
    [`${skill}/SKILL.md`]: '---\nname: dude-pack-alpha-writer\ndescription: "fixture writer"\n---\n# Writer\n',
    [`${skill}/LICENSE`]: 'MIT License (writer)\n',
    [`${skill}/assets/logo.png`]: BINARY_ASSET,
    [`${skill}/scripts/run.sh`]: { bytes: '#!/bin/sh\necho alpha\n', executable: true },
    [`${skill}/scripts/vendor.js`]: 'export const vendor = 1;\n',
    [`${skill}/scripts/vendor.js.LEGAL.txt`]: 'vendor: MIT\n',
    [`${skill}/references/deep/notes.md`]: 'nested notes\n',
    ...(revision === 'one'
      ? { [`${alpha}/prompts/dude-pack-alpha-ask.prompt.md`]: '# alpha ask\n' }
      : { [`${alpha}/instructions/dude-pack-alpha-guide.instructions.md`]: '# alpha guide\n' }),
    'library/packs/beta/pack.md': '---\nname: beta\ndescription: "beta pack"\n---\n# beta\n',
    'library/packs/beta/agents/dude-pack-beta-worker.agent.md': agentSource({ name: 'Beta Worker' }),
    'library/packs/gamma/README.md': 'a folder without a manifest\n',
  };
}

/**
 * Replace the repository's working tree with `files` and commit it.
 * @param {string} repo
 * @param {Record<string, CatalogFile>} files
 * @param {string} message
 * @returns {string} the new commit
 */
function publishCatalog(repo, files, message) {
  for (const entry of fs.readdirSync(repo)) {
    if (entry !== '.git') fs.rmSync(path.join(repo, entry), { recursive: true, force: true });
  }
  /** @type {string[]} */
  const executables = [];
  for (const [relative, value] of Object.entries(files)) {
    const absolute = path.join(repo, ...relative.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    const executable = typeof value === 'object' && !Buffer.isBuffer(value);
    fs.writeFileSync(absolute, executable ? value.bytes : value);
    if (executable) {
      executables.push(relative);
      if (process.platform !== 'win32') fs.chmodSync(absolute, 0o755);
    }
  }
  fixtureGit(repo, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'add', '-A');
  for (const relative of executables) fixtureGit(repo, 'update-index', '--chmod=+x', '--', relative);
  fixtureGit(repo, '-c', 'user.email=fixture@example.test', '-c', 'user.name=Catalog Fixture', 'commit', '-qm', message);
  return fixtureGit(repo, 'rev-parse', 'HEAD');
}

/** A real repository at revision `one`; its working tree is also a local folder source. */
function createGitHubCatalog() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-github-'));
  const repo = path.join(parent, 'catalog');
  fs.mkdirSync(repo);
  fixtureGit(repo, 'init', '-q', '-b', 'main');
  return { parent, repo, first: publishCatalog(repo, catalogFiles('one'), 'revision one') };
}

/** @param {string} directory @returns {string[]} sorted file paths relative to `directory` */
function relativeFiles(directory) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} current @param {string} prefix */
  const visit = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(current, entry.name), relative);
      else files.push(relative);
    }
  };
  visit(directory, '');
  return files.sort();
}

/**
 * A request-recording stand-in for GitHub's API and raw hosts. It answers from one
 * real repository's own Git objects, as GitHub serves that repository, so a GitHub
 * read can be compared with the same commit read as a local folder. `intercept`
 * may answer or delay a request instead.
 * @param {string} repo
 */
function githubStandIn(repo) {
  /** @type {string[]} */
  const requests = [];
  /** @type {((url: string, signal: AbortSignal | undefined) => Promise<Response | undefined>) | null} */
  let intercept = null;
  /** @param {...string} args @returns {Buffer | null} */
  const objects = (...args) => {
    const result = fixtureSpawnSync('git', args, { cwd: repo, encoding: 'buffer' });
    return result.status === 0 ? result.stdout : null;
  };
  /** @param {unknown} value @param {number} [status] */
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  /** @param {string} url */
  const route = (url) => {
    if (url.startsWith(`${GITHUB_RAW}/`)) {
      const [commit, ...segments] = url.slice(GITHUB_RAW.length + 1).split('/').map(decodeURIComponent);
      const bytes = objects('cat-file', 'blob', `${commit}:${segments.join('/')}`);
      return bytes ? new Response(bytes) : new Response('404: Not Found', { status: 404 });
    }
    if (url.startsWith(`${GITHUB_API}/commits/`)) {
      const ref = url.slice(`${GITHUB_API}/commits/`.length).split('/').map(decodeURIComponent).join('/');
      const commit = objects('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
      return commit ? new Response(commit.toString('utf8').trim()) : json({ message: `No commit found for SHA: ${ref}` }, 422);
    }
    if (url.startsWith(`${GITHUB_API}/git/commits/`)) {
      const sha = url.slice(`${GITHUB_API}/git/commits/`.length);
      const tree = objects('rev-parse', '--verify', '--quiet', `${sha}^{tree}`);
      return tree ? json({ sha, tree: { sha: tree.toString('utf8').trim() } }) : json({ message: 'Not Found' }, 404);
    }
    if (url.startsWith(`${GITHUB_API}/git/trees/`)) {
      const [sha, query] = url.slice(`${GITHUB_API}/git/trees/`.length).split('?');
      const listed = objects('ls-tree', '-z', '-l', ...(query === 'recursive=1' ? ['-r', '-t'] : []), sha);
      if (!listed) return json({ message: 'Not Found' }, 404);
      const tree = listed.toString('utf8').split('\0').filter(Boolean).map((line) => {
        const [, mode, type, object, size, itemPath] = /** @type {RegExpExecArray} */ (/^(\d{6}) (\w+) ([0-9a-f]{40}) +(-|\d+)\t(.*)$/s.exec(line));
        return { path: itemPath, mode, type, sha: object, ...(type === 'blob' ? { size: Number(size) } : {}) };
      });
      return json({ sha, tree, truncated: false });
    }
    if (url.startsWith(`${GITHUB_API}/tags?`)) {
      const page = Number(new URL(url).searchParams.get('page'));
      const listed = objects('for-each-ref', '--format=%(refname:strip=2) %(*objectname) %(objectname)', 'refs/tags');
      const tags = (listed?.toString('utf8') ?? '').split('\n').filter(Boolean).map((line) => {
        const [name, commit] = line.split(' ').filter(Boolean);
        return { name, commit: { sha: commit } };
      });
      return json(tags.slice((page - 1) * 100, page * 100));
    }
    return new Response('unexpected request', { status: 599 });
  };
  return {
    requests,
    /** @param {typeof intercept} handler */
    intercept(handler) {
      intercept = handler;
    },
    /** @param {string} prefix */
    of: (prefix) => requests.filter((url) => url.startsWith(prefix)),
    /** @type {typeof fetch} */
    async fetch(input, init = {}) {
      const url = String(input);
      requests.push(url);
      await new Promise((resolve) => setImmediate(resolve));
      init.signal?.throwIfAborted();
      return (intercept ? await intercept(url, init.signal ?? undefined) : undefined) ?? route(url);
    },
  };
}

/**
 * Hold the first request `matches` accepts until `release()`, so a test can act
 * while that acquisition waits. A held request still ends with its operation.
 * @param {ReturnType<typeof githubStandIn>} server
 * @param {(url: string) => boolean} matches
 */
function holdFirst(server, matches) {
  /** @type {() => void} */
  let release = () => {};
  const released = new Promise((resolve) => { release = () => resolve(undefined); });
  /** @type {() => void} */
  let reach = () => {};
  const arrived = new Promise((resolve) => { reach = () => resolve(undefined); });
  let held = false;
  server.intercept(async (url, signal) => {
    if (held || !matches(url)) return undefined;
    held = true;
    reach();
    await new Promise((resolve, reject) => {
      void released.then(resolve);
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    return undefined;
  });
  return { arrived, release };
}

/**
 * Run `run` with `fetch` answered by `server`, every process start recorded (and
 * `spawnSync` optionally replaced), and the OS temporary folder pointed at an
 * empty folder, so a check can see that each call left nothing behind.
 * @param {ReturnType<typeof githubStandIn> | null} server null fails any HTTP request
 * @param {(state: { calls: Array<{ api: string, command: unknown, args: string[] }>, temporary: string }) => Promise<void>} run
 * @param {{ spawnSync?: (...args: any[]) => any }} [replace]
 */
async function withAcquisition(server, run, replace = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-acq-'));
  const savedEnv = ['TMPDIR', 'TMP', 'TEMP'].map((name) => /** @type {[string, string | undefined]} */ ([name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const originals = Object.fromEntries(PROCESS_APIS.map((name) => [name, childProcess[name]]));
  /** @type {Array<{ api: string, command: unknown, args: string[] }>} */
  const calls = [];
  for (const name of PROCESS_APIS) {
    /** @type {any} */ (childProcess)[name] = function recorded(/** @type {any[]} */ ...args) {
      calls.push({ api: name, command: args[0], args: Array.isArray(args[1]) ? [...args[1]] : [] });
      const replacement = /** @type {any} */ (replace)[name];
      return replacement ? replacement(...args) : originals[name].apply(this, args);
    };
  }
  syncBuiltinESMExports();
  globalThis.fetch = server
    ? server.fetch
    : /** @type {typeof fetch} */ (async (input) => assert.fail(`no HTTP request was expected: ${String(input)}`));
  for (const [name] of savedEnv) process.env[name] = temporary;
  try {
    await run({ calls, temporary });
  } finally {
    for (const [name, value] of savedEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    globalThis.fetch = originalFetch;
    Object.assign(childProcess, originals);
    syncBuiltinESMExports();
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** @param {string} root @param {string} relative */
function executableBits(root, relative) {
  return fs.statSync(path.join(root, ...relative.split('/'))).mode & 0o111;
}

/**
 * Both roots hold the same installed alpha, byte for byte and with the same
 * executable bits, and record the same files.
 * @param {string} githubRoot
 * @param {string} localRoot
 */
function assertSameProjection(githubRoot, localRoot) {
  assert.deepEqual(snapshotTree(githubRoot, ['.github']), snapshotTree(localRoot, ['.github']));
  assert.deepEqual(readProfile(githubRoot).installed.alpha.files, readProfile(localRoot).installed.alpha.files);
  if (process.platform !== 'win32') {
    const script = '.github/skills/dude-pack-alpha-writer/scripts/run.sh';
    assert.notEqual(executableBits(githubRoot, script), 0, 'the shipped script stays executable');
    assert.equal(executableBits(githubRoot, script), executableBits(localRoot, script));
  }
}

test('T002 GitHub list, add, preview, and refresh read only manifests or the selected pack and project like the same commit read locally', async () => {
  const catalog = createGitHubCatalog();
  const githubRoot = createRoot();
  const localRoot = createRoot();
  const server = githubStandIn(catalog.repo);
  const github = { root: githubRoot, library: path.join(githubRoot, 'library', 'packs'), source: GITHUB_SOURCE, ref: 'main' };
  const local = { root: localRoot, library: path.join(localRoot, 'library', 'packs'), source: catalog.repo };
  try {
    await withAcquisition(server, async ({ calls, temporary }) => {
      // list: only direct manifests, and the trees that find them, at one commit.
      const listed = await cmdList(github);
      assert.equal(listed.ok, true, listed.error);
      assert.deepEqual(listed.result, {
        packs: [
          { name: 'alpha', installed: false, description: 'alpha pack', use_cases: ['writing'] },
          { name: 'beta', installed: false, description: 'beta pack', use_cases: [] },
        ],
        enabled_packs: [],
        origin: `${GITHUB_SOURCE} @ main`,
      });
      assert.deepEqual((await cmdList(local)).result?.packs, listed.result.packs, 'the same commit lists the same packs locally');
      assert.deepEqual(
        server.of(GITHUB_RAW).sort(),
        ['alpha', 'beta'].map((name) => `${GITHUB_RAW}/${catalog.first}/library/packs/${name}/pack.md`),
      );
      assert.deepEqual(server.requests.filter((url) => url.endsWith('?recursive=1')), [], 'no pack is read whole to list it');
      assert.equal(server.of(`${GITHUB_API}/commits/`).length, 2, 'the branch is resolved, then rechecked');
      assert.deepEqual(fs.readdirSync(temporary), [], 'list removed its acquired catalog');

      // add: only the selected pack's complete subtree.
      server.requests.length = 0;
      const added = await cmdAdd({ ...github, name: 'alpha', force: false });
      assert.equal(added.ok, true, added.error);
      assert.equal(added.result.origin, `${GITHUB_SOURCE} @ main`);
      const alphaTree = fixtureGit(catalog.repo, 'rev-parse', `${catalog.first}:library/packs/alpha`);
      assert.deepEqual(server.requests.filter((url) => url.endsWith('?recursive=1')), [`${GITHUB_API}/git/trees/${alphaTree}?recursive=1`]);
      assert.deepEqual(
        server.of(GITHUB_RAW).sort(),
        relativeFiles(path.join(catalog.repo, 'library', 'packs', 'alpha'))
          .map((file) => `${GITHUB_RAW}/${catalog.first}/library/packs/alpha/${file}`),
        'every file of alpha, notices included, and nothing else',
      );
      assert.deepEqual(readProfile(githubRoot).installed.alpha.source, {
        type: 'remote', repository: GITHUB_SOURCE, requested_ref: 'main', resolved_commit: catalog.first,
      });
      assert.deepEqual(fs.readdirSync(temporary), [], 'add removed its acquired pack and its stage');
      assert.deepEqual(calls, [], 'a GitHub source is never cloned or otherwise run as a process');
    });

    const localAdded = await cmdAdd({ ...local, name: 'alpha', force: false });
    assert.equal(localAdded.ok, true, localAdded.error);
    assert.deepEqual(readProfile(localRoot).installed.alpha.source, { type: 'local', location: fs.realpathSync(catalog.repo) });
    assertSameProjection(githubRoot, localRoot);
    const writer = path.join(githubRoot, '.github', 'skills', 'dude-pack-alpha-writer');
    assert.deepEqual(fs.readFileSync(path.join(writer, 'assets', 'logo.png')), BINARY_ASSET, 'a binary asset keeps its exact bytes');
    for (const nested of ['LICENSE', 'scripts/vendor.js.LEGAL.txt', 'references/deep/notes.md']) {
      assert.equal(exists(path.join(writer, ...nested.split('/'))), true, `${nested} is projected with its skill`);
    }

    // refresh: the next commit replaces, adds, and removes; its preview changes nothing.
    const second = publishCatalog(catalog.repo, catalogFiles('two'), 'revision two');
    await withAcquisition(server, async ({ calls, temporary }) => {
      server.requests.length = 0;
      const before = mutationSnapshot(githubRoot);
      const preview = await cmdPreviewRefresh({ ...github, name: 'alpha' });
      assert.equal(preview.ok, true, preview.error);
      assert.deepEqual(preview.result, {
        previewed: 'alpha',
        replaced: ['.github/agents/dude-pack-alpha-worker.agent.md', '.github/skills/dude-pack-alpha-writer'],
        added: ['.github/instructions/dude-pack-alpha-guide.instructions.md'],
        removed: ['.github/prompts/dude-pack-alpha-ask.prompt.md'],
        files: [
          '.github/agents/dude-pack-alpha-worker.agent.md',
          '.github/instructions/dude-pack-alpha-guide.instructions.md',
          '.github/skills/dude-pack-alpha-writer',
        ],
        source: { type: 'remote', repository: GITHUB_SOURCE, requested_ref: 'main', resolved_commit: second },
      });
      assertMutationUnchanged(githubRoot, before);
      assert.deepEqual(fs.readdirSync(temporary), [], 'the preview removed its acquired pack and its stage');

      const refreshed = await cmdRefresh({ ...github, name: 'alpha' });
      assert.equal(refreshed.ok, true, refreshed.error);
      const { replaced, added, removed, files, source } = preview.result;
      assert.deepEqual(refreshed.result, { refreshed: 'alpha', replaced, added, removed, files });
      assert.equal(exists(path.join(githubRoot, '.github', 'prompts', 'dude-pack-alpha-ask.prompt.md')), false, 'the dropped prompt is removed');
      assert.deepEqual(readProfile(githubRoot).installed.alpha.source, source);
      assert.ok(server.of(GITHUB_RAW).every((url) => url.startsWith(`${GITHUB_RAW}/${second}/library/packs/alpha/`)), 'refresh reads only alpha at the new commit');
      assert.deepEqual(fs.readdirSync(temporary), [], 'refresh removed its acquired pack, stage, and transaction');
      assert.deepEqual(calls, []);
    });
    const localRefreshed = await cmdRefresh({ ...local, name: 'alpha' });
    assert.equal(localRefreshed.ok, true, localRefreshed.error);
    assertSameProjection(githubRoot, localRoot);
  } finally {
    cleanup(githubRoot);
    cleanup(localRoot);
    cleanup(catalog.parent);
  }
});

test('T002 an add refuses when its profile basis or a destination changed while it acquired, and never erases the other change', async (t) => {
  const catalog = createGitHubCatalog();
  /**
   * Hold alpha's GitHub add after it read the profile, run `meanwhile`, then let
   * the add finish.
   * @param {(root: string) => Promise<void>} prepare
   * @param {(root: string) => Promise<void>} meanwhile
   * @param {(result: Awaited<ReturnType<typeof cmdAdd>>, root: string, between: ReturnType<typeof mutationSnapshot>) => void} check
   */
  const interleave = async (prepare, meanwhile, check) => {
    const root = createRoot();
    writePack(root, 'yankee', [packAgent('yankee', 'worker')], { skill: false });
    writePack(root, 'zulu', [packAgent('zulu', 'worker')], { skill: false });
    const server = githubStandIn(catalog.repo);
    try {
      await prepare(root);
      await withAcquisition(server, async ({ calls, temporary }) => {
        const hold = holdFirst(server, (url) => url.includes('/library/packs/alpha/'));
        const pending = cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'alpha', force: false, source: GITHUB_SOURCE, ref: 'main' });
        await hold.arrived;
        await meanwhile(root);
        const between = mutationSnapshot(root);
        hold.release();
        check(await pending, root, between);
        assert.deepEqual(fs.readdirSync(temporary), [], 'the add removed its acquired pack and its stage');
        assert.deepEqual(calls, []);
      });
    } finally {
      cleanup(root);
    }
  };
  /** @param {Awaited<ReturnType<typeof cmdAdd>>} result @param {string} root @param {ReturnType<typeof mutationSnapshot>} between */
  const refusedStale = (result, root, between) => {
    assert.deepEqual(result, { ok: false, code: 2, error: STALE_ADD });
    assertMutationUnchanged(root, between);
    assertNoPackLeftovers(root, 'alpha');
  };
  try {
    await t.test('another GitHub add creates the profile that was absent', () => interleave(
      async () => {},
      async (root) => {
        assert.equal(profileBytes(root), null, 'an absent profile authorized the held add');
        const first = await cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'beta', force: false, source: GITHUB_SOURCE, ref: 'main' });
        assert.equal(first.ok, true, first.error);
      },
      (result, root, between) => {
        refusedStale(result, root, between);
        assert.deepEqual(Object.keys(readProfile(root).installed), ['beta']);
      },
    ));

    await t.test('another add changes the existing profile', () => interleave(
      async (root) => { assert.equal((await addPack(root, 'yankee')).ok, true); },
      async (root) => { assert.equal((await addPack(root, 'zulu')).ok, true); },
      (result, root, between) => {
        refusedStale(result, root, between);
        assert.deepEqual(Object.keys(readProfile(root).installed).sort(), ['yankee', 'zulu']);
      },
    ));

    await t.test('a foreign file appears at a destination', () => interleave(
      async () => {},
      async (root) => { fs.writeFileSync(path.join(root, '.github', 'agents', 'dude-pack-alpha-worker.agent.md'), '# foreign\n'); },
      (result, root, between) => {
        assert.equal(result.ok, false);
        assert.match(result.error ?? '', /^destination ownership conflict:\n {2}\.github\/agents\/dude-pack-alpha-worker\.agent\.md \(already exists/);
        assertMutationUnchanged(root, between);
      },
    ));

    await t.test('nothing changes, so the held add applies', () => interleave(
      async () => {},
      async () => {},
      (result, root) => {
        assert.equal(result.ok, true, result.error);
        assert.equal(readProfile(root).installed.alpha.source.resolved_commit, catalog.first);
      },
    ));
  } finally {
    cleanup(catalog.parent);
  }
});

test('T002 a refresh refuses when a destination parent became a link while it acquired, and leaves the linked folder untouched', async () => {
  const catalog = createGitHubCatalog();
  const root = createRoot();
  // A folder outside the workspace that holds a file with the installed prompt's name.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-compose-outside-'));
  const prompt = 'dude-pack-alpha-ask.prompt.md';
  const outsideBytes = Buffer.from('# not installed by any pack\n');
  fs.writeFileSync(path.join(outside, prompt), outsideBytes);
  const prompts = path.join(root, '.github', 'prompts');
  const server = githubStandIn(catalog.repo);
  const github = { root, library: path.join(root, 'library', 'packs'), source: GITHUB_SOURCE, ref: 'main' };
  try {
    await withAcquisition(server, async ({ calls, temporary }) => {
      assert.equal((await cmdAdd({ ...github, name: 'alpha', force: false })).ok, true);
      assert.equal(exists(path.join(prompts, prompt)), true, 'revision one installs the prompt');
      // Revision two drops alpha's only prompt, so the refresh removes that destination.
      publishCatalog(catalog.repo, catalogFiles('two'), 'revision two');

      const hold = holdFirst(server, (url) => url.includes('/library/packs/alpha/'));
      const pending = cmdRefresh({ ...github, name: 'alpha' });
      await hold.arrived;
      // While the pack is acquired, the prompt's parent becomes a link to the outside folder
      // (a junction on Windows), so the recorded destination now names the outside file.
      fs.rmSync(prompts, { recursive: true });
      fs.symlinkSync(outside, prompts, 'junction');
      const between = mutationSnapshot(root);
      hold.release();
      const refreshed = await pending;

      assert.deepEqual(fs.readdirSync(outside), [prompt], 'the outside file is not removed through the link');
      assert.deepEqual(fs.readFileSync(path.join(outside, prompt)), outsideBytes, 'the outside file keeps its bytes');
      assert.deepEqual(refreshed, {
        ok: false,
        code: 2,
        mutation: 'none',
        error: `pack profile path '.github/prompts/${prompt}' contains symbolic link '.github/prompts'`,
      });
      assertMutationUnchanged(root, between);
      assert.deepEqual(fs.readdirSync(temporary), [], 'the refused refresh removed its acquired pack and its stage');
      assert.deepEqual(calls, []);
    });
  } finally {
    // Remove the link itself first, so cleaning the workspace cannot reach the outside folder.
    if (fs.lstatSync(prompts, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(prompts);
    cleanup(root);
    cleanup(outside);
    cleanup(catalog.parent);
  }
});

test('T002 a GitHub list refuses installed flags from a profile that changed while it read the catalog', async () => {
  const catalog = createGitHubCatalog();
  const root = createRoot();
  writePack(root, 'zulu', [packAgent('zulu', 'worker')], { skill: false });
  const server = githubStandIn(catalog.repo);
  const github = { root, library: path.join(root, 'library', 'packs'), source: GITHUB_SOURCE, ref: 'main' };
  try {
    await withAcquisition(server, async ({ calls, temporary }) => {
      const hold = holdFirst(server, (url) => url.startsWith(`${GITHUB_RAW}/`));
      const pending = cmdList(github);
      await hold.arrived;
      assert.equal((await addPack(root, 'zulu')).ok, true);
      hold.release();
      assert.deepEqual(await pending, { ok: false, code: 2, error: STALE_LIST });
      assert.deepEqual(fs.readdirSync(temporary), [], 'the refused list still removed its acquired catalog');

      server.intercept(null);
      assert.equal((await cmdAdd({ ...github, name: 'alpha', force: false })).ok, true);
      const listed = await cmdList(github);
      assert.equal(listed.ok, true, listed.error);
      assert.deepEqual(listed.result?.packs.map(({ name, installed }) => [name, installed]), [['alpha', true], ['beta', false]]);
      assert.deepEqual(listed.result?.enabled_packs, ['alpha', 'zulu']);
      assert.deepEqual(fs.readdirSync(temporary), []);
      assert.deepEqual(calls, []);
    });
  } finally {
    cleanup(root);
    cleanup(catalog.parent);
  }
});

test('T002 a core-only install reads its GitHub upstream by its configured spelling and ref, and a ref-only refresh stays local-first and pinned', async () => {
  const catalog = createGitHubCatalog();
  fixtureGit(catalog.repo, 'tag', 'v1.0.0');
  fixtureGit(catalog.repo, 'tag', 'v1.1.0-rc1');
  const second = publishCatalog(catalog.repo, catalogFiles('two'), 'revision two');
  fixtureGit(catalog.repo, '-c', 'user.email=fixture@example.test', '-c', 'user.name=Catalog Fixture', 'tag', '-a', 'v1.1.0', '-m', 'release');
  const spelling = 'git@github.com:acme/catalog.git';
  const released = createReleasedRoot();
  writeManifestSource(released, spelling, 'latest');
  const vendored = createRoot();
  writePack(vendored, 'alpha', [packAgent('alpha', 'worker', { name: 'Vendored Alpha' })], { skill: false });
  writeManifestSource(vendored, GITHUB_SOURCE, 'main');
  const server = githubStandIn(catalog.repo);
  try {
    await withAcquisition(server, async ({ calls, temporary }) => {
      const library = path.join(released, 'library', 'packs');
      const listed = await cmdList({ root: released, library });
      assert.equal(listed.ok, true, listed.error);
      assert.equal(listed.result?.origin, `${spelling} @ latest`);
      assert.deepEqual(listed.result?.packs.map((pack) => pack.name), ['alpha', 'beta']);
      assert.ok(server.of(GITHUB_RAW).every((url) => url.startsWith(`${GITHUB_RAW}/${second}/`)), 'latest is the highest stable release');
      assert.equal(server.of(`${GITHUB_API}/tags?`).length, 2, 'the release channel is selected, then rechecked');

      const added = await cmdAdd({ root: released, library, name: 'alpha', force: false });
      assert.equal(added.ok, true, added.error);
      assert.deepEqual(readProfile(released).installed.alpha.source, {
        type: 'remote', repository: spelling, requested_ref: 'latest', resolved_commit: second,
      });

      // A ref-only call, as `upgrade --all` makes it: no source, and a full commit as the ref.
      server.requests.length = 0;
      const pinned = await cmdPreviewRefresh({ root: released, library, name: 'alpha', ref: catalog.first });
      assert.equal(pinned.ok, true, pinned.error);
      assert.deepEqual(pinned.result.source, { type: 'remote', repository: spelling, requested_ref: catalog.first, resolved_commit: catalog.first });
      assert.deepEqual(server.of(`${GITHUB_API}/commits/`), [`${GITHUB_API}/commits/${catalog.first}`], 'a full commit needs no recheck');
      assert.ok(server.of(GITHUB_RAW).every((url) => url.startsWith(`${GITHUB_RAW}/${catalog.first}/library/packs/alpha/`)));
      assert.deepEqual(server.of(`${GITHUB_API}/tags?`), []);
      assert.deepEqual(fs.readdirSync(temporary), []);

      // A local target stays authoritative for the same ref-only call.
      server.requests.length = 0;
      const vendoredLibrary = path.join(vendored, 'library', 'packs');
      assert.equal((await cmdAdd({ root: vendored, library: vendoredLibrary, name: 'alpha', force: false })).ok, true);
      const localFirst = await cmdPreviewRefresh({ root: vendored, library: vendoredLibrary, name: 'alpha', ref: catalog.first });
      assert.equal(localFirst.ok, true, localFirst.error);
      assert.deepEqual(localFirst.result.source, { type: 'local', location: fs.realpathSync(vendoredLibrary) });
      assert.deepEqual(server.requests, [], 'the local target is read in place');
      assert.deepEqual(fs.readdirSync(temporary), []);
      assert.deepEqual(calls, []);
    });
  } finally {
    cleanup(released);
    cleanup(vendored);
    cleanup(catalog.parent);
  }
});

test('T002 GitHub failures, missing or invalid packs, and refused sources and refs leave membership unchanged and nothing behind', async () => {
  const catalog = createGitHubCatalog();
  // A pack with invalid metadata lives on its own branch, so the main catalog stays valid.
  fixtureGit(catalog.repo, 'checkout', '-q', '-b', 'broken');
  publishCatalog(catalog.repo, {
    ...catalogFiles('one'),
    'library/packs/broken/pack.md': '---\nname: broken\ndescription: "broken pack"\nuse-cases: not-a-list\n---\n# broken\n',
    'library/packs/broken/agents/dude-pack-broken-worker.agent.md': agentSource({ name: 'Broken Worker' }),
  }, 'invalid pack');
  fixtureGit(catalog.repo, 'checkout', '-q', 'main');
  const root = createRoot();
  const server = githubStandIn(catalog.repo);
  const github = { root, library: path.join(root, 'library', 'packs'), source: GITHUB_SOURCE, ref: 'main' };
  try {
    await withAcquisition(server, async ({ calls, temporary }) => {
      assert.equal((await cmdAdd({ ...github, name: 'alpha', force: false })).ok, true);
      const installed = mutationSnapshot(root);
      /**
       * @param {string} label
       * @param {() => Promise<any>} act
       * @param {RegExp | string} expected
       * @param {{ requests?: number }} [options]
       */
      const refused = async (label, act, expected, { requests } = {}) => {
        server.requests.length = 0;
        const result = await act();
        assert.equal(result.ok, false, label);
        assert.equal(result.code, 2, label);
        if (typeof expected === 'string') assert.equal(result.error, expected, label);
        else assert.match(result.error, expected, label);
        if (requests !== undefined) assert.equal(server.requests.length, requests, `${label}: requests`);
        assertMutationUnchanged(root, installed);
        assert.deepEqual(fs.readdirSync(temporary), [], `${label}: nothing is left behind`);
        return result;
      };

      // A failed read part way through a pack refuses before any change.
      server.intercept(async (url) => (url.startsWith(`${GITHUB_RAW}/`) && url.endsWith('/run.sh') ? new Response('boom', { status: 500 }) : undefined));
      const refresh = await refused('refresh', () => cmdRefresh({ ...github, name: 'alpha' }),
        /^failed to fetch source https:\/\/github\.com\/acme\/catalog @ main: .*HTTP 500/);
      assert.equal(refresh.mutation, 'none');
      await refused('preview', () => cmdPreviewRefresh({ ...github, name: 'alpha' }), /HTTP 500/);
      // A manifest that cannot be read makes the catalog unavailable, never an empty list.
      server.intercept(async (url) => (url.endsWith('/beta/pack.md') ? new Response('Not Found', { status: 404 }) : undefined));
      await refused('list', () => cmdList(github), /HTTP 404.*must be public/);
      server.intercept(null);

      await refused('missing ref', () => cmdAdd({ ...github, ref: 'no-such-branch', name: 'beta', force: false }),
        /^failed to fetch source https:\/\/github\.com\/acme\/catalog @ no-such-branch: .*HTTP 422/);
      await refused('missing pack', () => cmdAdd({ ...github, name: 'omega', force: false }), `pack "omega" not found in source ${GITHUB_SOURCE} @ main`);
      await refused('folder without a manifest', () => cmdAdd({ ...github, name: 'gamma', force: false }), `pack "gamma" not found in source ${GITHUB_SOURCE} @ main`);
      await refused('invalid pack', () => cmdAdd({ ...github, ref: 'broken', name: 'broken', force: false }), /^pack "broken" has invalid metadata: .*use-cases/);
      await refused('invalid ref', () => cmdAdd({ ...github, ref: 'a..b', name: 'beta', force: false }),
        'A GitHub pack source ref must be a valid branch, tag or full commit name.', { requests: 0 });
      const credential = await refused('credential source', () => cmdAdd({ ...github, source: 'https://reader:hunter2@github.com/acme/catalog', name: 'beta', force: false }),
        /^A pack source address must not contain a user name or password;/, { requests: 0 });
      assert.doesNotMatch(credential.error, /hunter2/);
      await refused('malformed GitHub source', () => cmdList({ ...github, source: 'https://github.com/acme' }),
        /^A GitHub pack source must be https:\/\/github\.com\/<owner>\/<repo>/, { requests: 0 });
      assert.deepEqual(calls, [], 'no failure falls back to Git');
    });
    assert.deepEqual(Object.keys(readProfile(root).installed), ['alpha']);
  } finally {
    cleanup(root);
    cleanup(catalog.parent);
  }
});

test('T002 --no-fetch, local folders, and a local catalog never contact a GitHub source', async () => {
  const catalog = createGitHubCatalog();
  const released = createReleasedRoot();
  writeManifestSource(released, GITHUB_SOURCE, 'main');
  const vendored = createRoot();
  writePack(vendored, 'zulu', [packAgent('zulu', 'worker')], { skill: false });
  writeManifestSource(vendored, GITHUB_SOURCE, 'main');
  const server = githubStandIn(catalog.repo);
  try {
    await withAcquisition(server, async ({ calls, temporary }) => {
      const releasedLibrary = path.join(released, 'library', 'packs');
      assert.deepEqual(await cmdList({ root: released, library: releasedLibrary, fetch: false }),
        { ok: true, code: 0, result: { packs: [], enabled_packs: [], origin: 'local' } });
      const offlineAdd = await cmdAdd({ root: released, library: releasedLibrary, name: 'alpha', force: false, fetch: false });
      assert.match(offlineAdd.error ?? '', /^pack not found in catalog: /);

      const vendoredLibrary = path.join(vendored, 'library', 'packs');
      const listed = await cmdList({ root: vendored, library: vendoredLibrary });
      assert.deepEqual([listed.result?.origin, listed.result?.packs.map((pack) => pack.name)], ['local', ['zulu']]);
      assert.equal((await cmdAdd({ root: vendored, library: vendoredLibrary, name: 'zulu', force: false })).ok, true);
      const folder = await cmdList({ root: vendored, library: vendoredLibrary, source: catalog.repo, fetch: false });
      assert.deepEqual(folder.result?.packs.map((pack) => pack.name), ['alpha', 'beta'], 'a local folder needs no fetch');
      for (const result of [
        await cmdList({ root: released, library: releasedLibrary, fetch: false, source: GITHUB_SOURCE }),
        await cmdAdd({ root: released, library: releasedLibrary, name: 'alpha', force: false, fetch: false, source: GITHUB_SOURCE }),
        await cmdRefresh({ root: vendored, library: vendoredLibrary, name: 'zulu', fetch: false, source: GITHUB_SOURCE }),
      ]) {
        assert.equal(result.ok, false);
        assert.match(result.error ?? '', /--no-fetch does not fetch it/);
      }
      const verified = await cmdVerify({ root: vendored, library: vendoredLibrary });
      assert.deepEqual(verified.result?.verified.map((entry) => entry.name), ['zulu'], 'verify reads only the local catalog');

      assert.deepEqual(server.requests, [], 'nothing reached GitHub');
      assert.deepEqual(calls.filter(({ command }) => command === 'git'), [], 'nothing ran Git');
      assert.deepEqual(fs.readdirSync(temporary), []);
    });
  } finally {
    cleanup(released);
    cleanup(vendored);
    cleanup(catalog.parent);
  }
});

test('T002 an other-host clone whose stop is unconfirmed is reported with its kept material, and Compose writes nothing', async () => {
  const root = createRoot();
  const before = mutationSnapshot(root);
  const repository = 'https://git.example.invalid/acme/catalog';
  try {
    await withAcquisition(null, async ({ calls, temporary }) => {
      const result = await cmdAdd({ root, library: path.join(root, 'library', 'packs'), name: 'alpha', force: false, source: repository, ref: 'main' });
      assert.equal(result.ok, false);
      assert.equal(result.code, 2);
      assert.match(result.error ?? '', new RegExp(`^failed to fetch source ${repository.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} @ main: `
        + 'Git did not finish within the 60-second acquisition deadline; its process tree could not be confirmed stopped, so its temporary material was kept at '));
      const kept = fs.readdirSync(temporary);
      assert.equal(kept.length, 1, 'only the acquisition root remains; no stage was created');
      assert.match(kept[0], /^dude-pack-/);
      assert.ok(result.error?.endsWith(path.join(temporary, kept[0])), 'the error names the kept root');
      assertMutationUnchanged(root, before);
      assert.deepEqual(calls.map(({ command, args }) => [command, args[0]]), [['git', 'clone']], 'nothing runs after the stopped clone');
    }, {
      spawnSync: () => ({
        pid: 4242,
        status: null,
        signal: 'SIGKILL',
        error: Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        stdout: null,
        stderr: null,
        output: [null, null, null],
      }),
    });
  } finally {
    cleanup(root);
  }
});

test('T002 Compose guidance describes targeted GitHub reads, other-host clones, cleanup, and the anonymous-access limit', () => {
  const text = fs.readFileSync(new URL('./SKILL.md', import.meta.url), 'utf8');
  const unwrap = (/** @type {string} */ value) => value.replace(/\s+/g, ' ');
  const catalog = unwrap(text.split('\n## Catalog Resolution\n')[1]?.split('\n## Verify')[0] ?? '');
  const sources = unwrap(text.split('### Sources In Pack Requests\n')[1]?.split('**An added source arrives')[0] ?? '');
  assert.ok(catalog && sources, 'the shipped skill must contain both sections');
  for (const requirement of [
    'is read over anonymous HTTPS and never cloned, not even after a failure',
    '`list` downloads only each direct `library/packs/<name>/pack.md` and the tree listings that find them',
    '`add` and `refresh` download only the selected pack\'s complete folder, including nested skill files, scripts, assets, and shipped notices',
    'a branch, tag, or `latest` that moves during the read is refused rather than mixed',
    '**Other hosts**, GitHub Enterprise included, are cloned whole with Git',
    // The cleanup promise names its exception beside it.
    'which Compose removes before it answers or writes, including after a failure. The one exception is a Git clone whose process tree cannot be confirmed stopped',
    'Compose keeps it and reports the unconfirmed cleanup in its refusal',
    'the error says so and names the temporary material it kept',
    'Compose sends no token and uses none of Git\'s credential helpers, `.netrc`, SSH keys, or proxy settings for them',
    'therefore fails visibly, and Compose never retries it through Git',
    'Git is required only for remote sources on other hosts',
  ]) assert.ok(catalog.includes(requirement), `missing catalog resolution rule: ${requirement}`);
  // Every remote source-first commit comes from Compose's own awaited resolution, which is then disposed.
  for (const requirement of [
    'Take a remote commit only from Compose\'s own resolution of that source, whatever its host',
    'a refresh preview reports it as `source.resolved_commit`',
    'For an install, await `resolvePackDir` from `.github/skills/dude-compose/compose.mjs` with the root, library, pack name, source, and ref the install will use',
    'read `sourceIdentity.resolved_commit`',
    'await its `dispose()` afterward to remove it',
    'reads a public GitHub repository anonymously over HTTPS and clones any other host, GitHub Enterprise included, with Git',
    'Do not look the commit up separately',
  ]) assert.ok(sources.includes(requirement), `missing source-first preview rule: ${requirement}`);
  assert.doesNotMatch(sources, /git ls-remote|api\.github\.com/);
});

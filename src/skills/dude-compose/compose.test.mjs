// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
 */
function writeRemotePack(repo, name, version) {
  const pack = path.join(repo, 'library', 'packs', name);
  fs.rmSync(pack, { recursive: true, force: true });
  fs.mkdirSync(path.join(pack, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(pack, 'pack.md'),
    `---\nname: ${name}\ndescription: ${JSON.stringify(`${name} catalog ${version}`)}\n---\n# ${name} ${version}\n`,
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

/** @param {ReturnType<typeof cmdList>} listed @param {string} name @param {string} description */
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
    assertListedDescription(cmdList({ root, library }), 'demo', 'demo catalog A');

    // Act/Assert: each later consumer runs after a new branch publication.
    writeRemotePack(remote.repo, 'demo', 'B');
    commitRemote(remote.repo, 'publish B');
    assertListedDescription(cmdList({ root, library }), 'demo', 'demo catalog B');

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
      cmdList({ root: tagRoot, library: path.join(tagRoot, 'library', 'packs') }),
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
      cmdList({ root: latestRoot, library: path.join(latestRoot, 'library', 'packs') }),
      'demo',
      'demo catalog release-1',
    );
    writeRemotePack(latestRemote.repo, 'demo', 'release-2');
    const latestCommit = commitRemote(latestRemote.repo, 'publish release 2');
    runGit(latestRemote.repo, 'tag', 'v1.1.0');
    assertListedDescription(
      cmdList({ root: latestRoot, library: path.join(latestRoot, 'library', 'packs') }),
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
    assertListedDescription(cmdList({ root, library }), 'demo', 'demo catalog SHA-A');

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
    const repeated = cmdList({ root, library });
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
    assertListedDescription(cmdList({ root, library }), 'demo', 'demo catalog online');
    const installed = await cmdAdd({ root, library, name: 'demo', force: false });
    assert.equal(installed.ok, true, installed.error);
    assertInstalledVersion(root, 'demo', 'online');

    // A previous checkout is now available at compose's usual destination, but
    // the selected remote can no longer provide current bytes.
    fs.renameSync(remote.repo, `${remote.repo}-offline`);
    const listed = cmdList({ root, library });
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
    const localList = cmdList({ root, library });
    assertListedDescription(localList, 'local', 'local fixture pack');
    assert.equal(localList.result?.packs.some((pack) => pack.name === 'remote-only'), false);
    assert.equal(localList.result?.origin, 'local');

    // The requested local target also wins over an explicit unusable source.
    const localAdded = await cmdAdd({
      root,
      library,
      name: 'local',
      force: false,
      source: 'file:///definitely-missing-local-precedence',
      ref: 'main',
    });
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
    const localRefreshed = await cmdRefresh({
      root,
      library,
      name: 'local',
      source: 'file:///definitely-missing-local-precedence',
      ref: 'main',
    });
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
      cmdList({
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
      cmdList({
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
      cmdList({
        root: explicitRoot,
        library: path.join(explicitRoot, 'library', 'packs'),
        ref: 'explicit-fixture',
      }),
      'explicit-only',
      'explicit-only catalog explicit',
    );

    // Local-only callers neither need nor contact the configured remote.
    writeManifestSource(noFetchRoot, 'file:///definitely-missing-no-fetch', 'main');
    const noFetchList = cmdList({
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

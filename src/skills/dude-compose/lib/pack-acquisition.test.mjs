// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { acquireRemoteCatalog, acquireRemotePack } from './pack-acquisition.mjs';

// Captured before any test patches the module, for fixture Git only.
const realSpawnSync = childProcess.spawnSync;
const REAL_TMP = fs.realpathSync(os.tmpdir());
const IS_WINDOWS = process.platform === 'win32';
const MIB = 1_048_576;
const KIB = 1_024;

const OWNER = 'acme';
const REPOSITORY = 'catalog';
const SOURCE = `https://github.com/${OWNER}/${REPOSITORY}`;
const API = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPOSITORY}`;
const FOREIGN_URL = 'https://attacker.invalid/never-follow';
const JSON_HEADERS = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
const SHA_HEADERS = { accept: 'application/vnd.github.sha', 'x-github-api-version': '2022-11-28' };
const UNSUPPORTED = /A GitHub pack source must be https:\/\/github\.com\/<owner>\/<repo>/;
const AMBIGUOUS_AUTHORITY = /^A remote pack source URL must name its host directly after ":\/\/", with no backslash before its path;/;
const REMOTE_HELPER = /^A remote pack source must not use Git's "<transport>::<address>" remote-helper form;/;
const BRACKETED_HOST = /^A remote pack source may enclose only an IPv6 address in brackets,/;
const PROCESS_APIS = /** @type {const} */ (['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork']);

/* ------------------------------------------------------------ Git objects */

/** @param {crypto.BinaryLike} bytes */
function sha1(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex');
}

/** @param {Buffer} bytes */
function blobId(bytes) {
  return sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
}

/** @param {string} name @param {string} [description] */
function manifest(name, description = `${name} fixture pack`) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${name}\n`;
}

/**
 * @typedef {string | Buffer | { bytes: string | Buffer, mode: '100644' | '100755' } | { symlink: string } | { gitlink: string }} FixtureFile
 * @typedef {{ name: string, mode: string, type: 'tree' | 'blob' | 'commit', sha: string, size?: number }} FixtureEntry
 * @typedef {{
 *   trees: Map<string, FixtureEntry[]>,
 *   blobs: Map<string, Buffer>,
 *   commits: Map<string, string>,
 *   refs: Map<string, string>,
 *   tags: Array<{ name: string, commit: string }>,
 * }} FixtureRepository
 */

/** @param {FixtureFile} value */
function bytesOf(value) {
  if (typeof value === 'string' || Buffer.isBuffer(value)) return Buffer.from(value);
  if ('bytes' in value) return Buffer.from(value.bytes);
  throw new Error('fixture entry has no file bytes');
}

/** @returns {FixtureRepository} */
function createRepository() {
  return { trees: new Map(), blobs: new Map(), commits: new Map(), refs: new Map(), tags: [] };
}

/** Git's tree order: names compare bytewise, a tree's name as if it ended in a slash. */
function gitTreeOrder(/** @type {FixtureEntry} */ left, /** @type {FixtureEntry} */ right) {
  const key = (/** @type {FixtureEntry} */ entry) => Buffer.from(entry.type === 'tree' ? `${entry.name}/` : entry.name);
  return Buffer.compare(key(left), key(right));
}

/**
 * Store real Git tree and blob objects for `files` and one commit that names them.
 * @param {FixtureRepository} repo
 * @param {Record<string, FixtureFile>} files
 * @param {string} label
 */
function addCommit(repo, files, label) {
  /** @type {Map<string, any>} */
  const root = new Map();
  for (const [filePath, value] of Object.entries(files)) {
    const segments = filePath.split('/');
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      if (!node.has(segment)) node.set(segment, new Map());
      node = node.get(segment);
    }
    node.set(/** @type {string} */ (segments.at(-1)), value);
  }
  /** @param {Map<string, any>} node @returns {string} */
  const write = (node) => {
    /** @type {FixtureEntry[]} */
    const entries = [...node].map(([name, child]) => {
      if (child instanceof Map) return { name, mode: '040000', type: 'tree', sha: write(child) };
      if (typeof child === 'object' && 'gitlink' in child) return { name, mode: '160000', type: 'commit', sha: child.gitlink };
      const symlink = typeof child === 'object' && !Buffer.isBuffer(child) && 'symlink' in child;
      const bytes = symlink ? Buffer.from(child.symlink) : bytesOf(child);
      const mode = symlink ? '120000' : (typeof child === 'object' && !Buffer.isBuffer(child) && child.mode) || '100644';
      const sha = blobId(bytes);
      repo.blobs.set(sha, bytes);
      return { name, mode, type: 'blob', sha, size: bytes.length };
    });
    entries.sort(gitTreeOrder);
    const body = Buffer.concat(entries.flatMap((entry) => [
      Buffer.from(`${entry.mode === '040000' ? '40000' : entry.mode} ${entry.name}\0`),
      Buffer.from(entry.sha, 'hex'),
    ]));
    const sha = sha1(Buffer.concat([Buffer.from(`tree ${body.length}\0`), body]));
    repo.trees.set(sha, entries);
    return sha;
  };
  const rootTree = write(root);
  const commit = sha1(`fixture commit ${label} ${rootTree}`);
  repo.commits.set(commit, rootTree);
  return { commit, rootTree };
}

/**
 * @param {FixtureRepository} repo
 * @param {string} rootTree
 * @param {string} relativePath
 */
function entryAt(repo, rootTree, relativePath) {
  let entries = repo.trees.get(rootTree);
  /** @type {FixtureEntry | undefined} */
  let entry;
  const segments = relativePath.split('/');
  for (const [index, segment] of segments.entries()) {
    entry = entries?.find((candidate) => candidate.name === segment);
    if (!entry) return undefined;
    if (index < segments.length - 1) {
      if (entry.type !== 'tree') return undefined;
      entries = repo.trees.get(entry.sha);
    }
  }
  return entry;
}

/** @param {FixtureRepository} repo @param {string} sha @param {boolean} recursive */
function treeJson(repo, sha, recursive) {
  /** @type {object[]} */
  const tree = [];
  /** @param {FixtureEntry[]} entries @param {string} prefix */
  const visit = (entries, prefix) => {
    for (const entry of entries) {
      const itemPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      tree.push({
        path: itemPath,
        mode: entry.mode,
        type: entry.type,
        sha: entry.sha,
        ...(entry.type === 'blob' ? { size: entry.size } : {}),
        url: FOREIGN_URL,
      });
      if (recursive && entry.type === 'tree') visit(/** @type {FixtureEntry[]} */ (repo.trees.get(entry.sha)), itemPath);
    }
  };
  visit(/** @type {FixtureEntry[]} */ (repo.trees.get(sha)), '');
  return { sha, url: FOREIGN_URL, tree, truncated: false };
}

/* --------------------------------------------------------- GitHub server */

/** @param {BodyInit | null} body @param {number} status @param {Record<string, string>} headers */
function response(body, status = 200, headers = {}) {
  const value = new Response(body, { status, headers });
  Object.defineProperty(value, 'url', { value: FOREIGN_URL });
  return value;
}

/** @param {unknown} value @param {number} [status] */
function jsonResponse(value, status = 200) {
  return response(Buffer.from(JSON.stringify(value)), status, { 'content-type': 'application/json' });
}

/** A body that never yields; it settles only when its reader is cancelled. */
function stalledResponse(/** @type {() => void} */ onCancel) {
  return response(new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      onCancel();
    },
  }, { highWaterMark: 0 }));
}

/** @param {string} url */
function requestKind(url) {
  if (url.startsWith(`${RAW}/`)) return 'raw';
  if (url.startsWith(`${API}/commits/`)) return 'commit-sha';
  if (url.startsWith(`${API}/git/commits/`)) return 'git-commit';
  if (url.startsWith(`${API}/git/trees/`)) return url.endsWith('?recursive=1') ? 'tree-recursive' : 'tree';
  if (url.startsWith(`${API}/tags?`)) return 'tags';
  return 'other';
}

/**
 * @typedef {{ url: string, kind: string, init: RequestInit, headers: Record<string, string> }} RecordedRequest
 * @typedef {(request: RecordedRequest, requests: RecordedRequest[]) => Promise<Response | undefined> | Response | undefined} Intercept
 */

/**
 * A request-recording GitHub stand-in serving `repo` the way the API and raw
 * hosts do. Every request is checked against the anonymous request policy.
 * @param {FixtureRepository} repo
 * @param {Intercept} [intercept]
 */
function githubServer(repo, intercept) {
  /** @type {RecordedRequest[]} */
  const requests = [];
  /** @type {string[]} */
  const violations = [];
  let active = 0;
  let peak = 0;

  /** @param {RecordedRequest} request */
  const checkPolicy = (request) => {
    const { init, kind } = request;
    const expectedHeaders = kind === 'raw' ? {} : kind === 'commit-sha' ? SHA_HEADERS : JSON_HEADERS;
    if (init.method !== 'GET' || init.redirect !== 'error' || init.credentials !== 'omit' || !(init.signal instanceof AbortSignal)) {
      violations.push(`${request.url}: not an anonymous non-redirecting GET`);
    }
    try {
      assert.deepEqual(request.headers, expectedHeaders);
    } catch {
      violations.push(`${request.url}: headers ${JSON.stringify(request.headers)}`);
    }
  };

  /** @param {RecordedRequest} request */
  const route = (request) => {
    const { url, kind } = request;
    if (kind === 'commit-sha') {
      const ref = url.slice(`${API}/commits/`.length).split('/').map(decodeURIComponent).join('/');
      const commit = repo.refs.get(ref) ?? [...repo.commits.keys()].find((sha) => sha === ref.toLowerCase());
      return commit ? response(commit, 200, { 'content-type': 'application/vnd.github.sha' })
        : jsonResponse({ message: `No commit found for SHA: ${ref}` }, 422);
    }
    if (kind === 'git-commit') {
      const sha = url.slice(`${API}/git/commits/`.length);
      const tree = repo.commits.get(sha);
      return tree ? jsonResponse({ sha, tree: { sha: tree, url: FOREIGN_URL }, url: FOREIGN_URL, html_url: FOREIGN_URL, message: 'fixture' })
        : jsonResponse({ message: 'Not Found' }, 404);
    }
    if (kind === 'tree' || kind === 'tree-recursive') {
      const sha = url.slice(`${API}/git/trees/`.length).replace('?recursive=1', '');
      return repo.trees.has(sha) ? jsonResponse(treeJson(repo, sha, kind === 'tree-recursive')) : jsonResponse({ message: 'Not Found' }, 404);
    }
    if (kind === 'tags') {
      const query = new URL(url).searchParams;
      if (query.get('per_page') !== '100') violations.push(`${url}: unexpected page size`);
      const page = Number(query.get('page'));
      return jsonResponse(repo.tags.slice((page - 1) * 100, page * 100).map((tag) => ({
        name: tag.name,
        commit: { sha: tag.commit, url: FOREIGN_URL },
        zipball_url: FOREIGN_URL,
        tarball_url: FOREIGN_URL,
        node_id: 'fixture',
      })));
    }
    if (kind === 'raw') {
      const [commit, ...segments] = url.slice(`${RAW}/`.length).split('/').map(decodeURIComponent);
      const rootTree = repo.commits.get(commit);
      const entry = rootTree ? entryAt(repo, rootTree, segments.join('/')) : undefined;
      return entry?.type === 'blob' ? response(/** @type {Buffer} */ (repo.blobs.get(entry.sha))) : response('404: Not Found', 404);
    }
    violations.push(`${url}: unexpected URL`);
    return response('unexpected', 599);
  };

  /** @type {typeof fetch} */
  const fetch = async (input, init = {}) => {
    const url = String(input);
    /** @type {RecordedRequest} */
    const request = { url, kind: requestKind(url), init, headers: Object.fromEntries(new Headers(init.headers).entries()) };
    requests.push(request);
    checkPolicy(request);
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      init.signal?.throwIfAborted();
      const custom = intercept ? await intercept(request, requests) : undefined;
      return custom ?? route(request);
    } finally {
      active -= 1;
    }
  };

  return {
    fetch,
    requests,
    violations,
    peak: () => peak,
    /** @param {string} kind */
    of: (kind) => requests.filter((request) => request.kind === kind),
  };
}

/* ------------------------------------------------------------- harnesses */

/** @param {(base: string) => Promise<void>} run */
async function withTemp(run) {
  const base = fs.mkdtempSync(path.join(REAL_TMP, 'dpa-'));
  const saved = ['TMPDIR', 'TMP', 'TEMP'].map((name) => [name, process.env[name]]);
  for (const [name] of saved) process.env[/** @type {string} */ (name)] = base;
  try {
    await run(base);
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[/** @type {string} */ (name)];
      else process.env[/** @type {string} */ (name)] = value;
    }
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/** @param {typeof fetch} handler @param {() => Promise<void>} run */
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

/**
 * Record every child-process API call made while `run` runs. `replace` stands in
 * for an API; anything not replaced still runs for real.
 * @param {(calls: Array<{ api: string, command: unknown, args: string[], options: any }>) => Promise<void>} run
 * @param {{ spawnSync?: (command: string, args: string[], options: any) => any }} [replace]
 */
async function withProcessRecorder(run, replace = {}) {
  const originals = Object.fromEntries(PROCESS_APIS.map((name) => [name, childProcess[name]]));
  /** @type {Array<{ api: string, command: unknown, args: string[], options: any }>} */
  const calls = [];
  for (const name of PROCESS_APIS) {
    /** @type {any} */ (childProcess)[name] = function recorded(/** @type {any[]} */ ...args) {
      calls.push({ api: name, command: args[0], args: Array.isArray(args[1]) ? [...args[1]] : [], options: args[2] });
      const replacement = /** @type {any} */ (replace)[name];
      return replacement ? replacement(...args) : originals[name].apply(this, args);
    };
  }
  syncBuiltinESMExports();
  try {
    await run(calls);
  } finally {
    Object.assign(childProcess, originals);
    syncBuiltinESMExports();
  }
}

/**
 * Run `run` against a recording GitHub stand-in, a recorded process table and an
 * isolated temporary directory. No test may start a process or leave a policy
 * violation behind.
 * @param {FixtureRepository} repo
 * @param {(state: { server: ReturnType<typeof githubServer>, base: string }) => Promise<void>} run
 * @param {Intercept} [intercept]
 */
async function withGitHub(repo, run, intercept) {
  const server = githubServer(repo, intercept);
  await withTemp((base) => withFetch(server.fetch, () => withProcessRecorder(async (calls) => {
    await run({ server, base });
    assert.deepEqual(calls, [], 'GitHub acquisition starts no process, Git included');
  })));
  assert.deepEqual(server.violations, []);
}

/** @param {string} base */
function acquisitionRoots(base) {
  return fs.readdirSync(base).filter((name) => name.startsWith('dude-pack-'));
}

/** @param {string} directory @returns {string[]} */
function listFiles(directory) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} current @param {string} prefix */
  const visit = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(current, entry.name), relative);
      else files.push(relative);
    }
  };
  visit(directory, '');
  return files;
}

/** @param {Promise<unknown>} promise @returns {Promise<Error>} */
async function rejection(promise) {
  return promise.then(
    () => assert.fail('expected the acquisition to reject'),
    (error) => {
      assert.ok(error instanceof Error, 'rejections are Error objects');
      return error;
    },
  );
}

/** @param {string} text */
function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Record the mode every acquisition file write asks for.
 * @param {Array<{ file: string, mode: number | undefined }>} writes
 * @param {() => Promise<any>} run
 */
async function withWriteModes(writes, run) {
  const original = fs.promises.writeFile;
  fs.promises.writeFile = /** @type {any} */ (async (/** @type {any} */ file, /** @type {any} */ data, /** @type {any} */ options) => {
    writes.push({ file: String(file), mode: options?.mode });
    return original.call(fs.promises, file, data, options);
  });
  try {
    return await run();
  } finally {
    fs.promises.writeFile = original;
  }
}

/** @param {string} cwd @param {...string} args */
function runGit(cwd, ...args) {
  const result = realSpawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

/**
 * A real Git repository holding `files`, committed on `main`.
 * @param {Record<string, FixtureFile>} files
 */
function createGitRepository(files) {
  const parent = fs.mkdtempSync(path.join(REAL_TMP, 'dpr-'));
  const dir = path.join(parent, 'repo');
  fs.mkdirSync(dir);
  runGit(dir, 'init', '-q', '-b', 'main');
  writeWorkingFiles(dir, files);
  const tree = commitAll(dir, files, 'fixture');
  return { parent, dir, tree, url: pathToFileURL(dir).href };
}

/** @param {string} dir @param {Record<string, FixtureFile>} files */
function writeWorkingFiles(dir, files) {
  for (const [filePath, value] of Object.entries(files)) {
    const absolute = path.join(dir, ...filePath.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, bytesOf(value));
    if (!IS_WINDOWS && typeof value === 'object' && !Buffer.isBuffer(value) && 'mode' in value && value.mode === '100755') {
      fs.chmodSync(absolute, 0o755);
    }
  }
}

/** @param {string} dir @param {Record<string, FixtureFile>} files @param {string} message */
function commitAll(dir, files, message) {
  runGit(dir, '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'add', '-A');
  for (const [filePath, value] of Object.entries(files)) {
    if (typeof value === 'object' && !Buffer.isBuffer(value) && 'mode' in value && value.mode === '100755') {
      runGit(dir, 'update-index', '--chmod=+x', '--', filePath);
    }
  }
  runGit(dir, '-c', 'user.email=fixture@example.test', '-c', 'user.name=Fixture', 'commit', '-qm', message);
  return runGit(dir, 'rev-parse', 'HEAD^{tree}');
}

/* --------------------------------------------------------------- catalogs */

const ALPHA_FILES = Object.freeze({
  'library/packs/alpha/pack.md': manifest('alpha'),
  'library/packs/alpha/LICENSE': 'MIT License\n\nCopyright (c) fixture\n',
  'library/packs/alpha/NOTICE': 'Alpha fixture notice\n',
  'library/packs/alpha/agents/dude-pack-alpha-worker.agent.md': '---\nname: "Alpha Worker"\n---\nYou are Alpha.\n',
  'library/packs/alpha/skills/dude-pack-alpha-writer/SKILL.md': '---\nname: dude-pack-alpha-writer\n---\n# Writer\n',
  'library/packs/alpha/skills/dude-pack-alpha-writer/assets/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe]),
  'library/packs/alpha/skills/dude-pack-alpha-writer/scripts/run.sh': { bytes: '#!/bin/sh\necho alpha\n', mode: '100755' },
  'library/packs/alpha/skills/dude-pack-alpha-writer/scripts/vendor.js': 'export const vendor = 1;\n',
  'library/packs/alpha/skills/dude-pack-alpha-writer/scripts/vendor.js.LEGAL.txt': 'vendor: MIT\n',
  'library/packs/alpha/skills/dude-pack-alpha-writer/references/deep/er/notes.md': 'nested notes\n',
});

/** A catalog with nested companions, a directory without a manifest, a non-directory entry and unrelated content. */
const CATALOG_FILES = Object.freeze({
  'README.md': 'unrelated repository readme\n',
  'docs/guide.md': 'unrelated documentation\n',
  'library/README.md': 'library readme\n',
  'library/packs/notes.txt': 'not a pack\n',
  ...ALPHA_FILES,
  'library/packs/beta/pack.md': { bytes: manifest('beta'), mode: '100755' },
  'library/packs/beta/agents/dude-pack-beta-worker.agent.md': '---\nname: "Beta Worker"\n---\nYou are Beta.\n',
  'library/packs/gamma/README.md': 'a directory without a manifest\n',
  'library/packs/delta/pack.md': manifest('delta'),
  'library/packs/epsilon/pack.md': manifest('epsilon'),
  'library/packs/zeta/pack.md': manifest('zeta'),
});
const CATALOG_MANIFESTS = ['alpha', 'beta', 'delta', 'epsilon', 'zeta'];

/**
 * @param {Record<string, FixtureFile>} files
 * @param {string} [ref]
 */
function repositoryWith(files, ref = 'main') {
  const repo = createRepository();
  const { commit, rootTree } = addCommit(repo, files, 'initial');
  repo.refs.set(ref, commit);
  return { repo, commit, rootTree };
}

test('GitHub discovery reads only direct manifests and the metadata that finds them', async () => {
  const { repo, commit, rootTree } = repositoryWith({ ...CATALOG_FILES, 'big/unrelated.bin': Buffer.alloc(3 * MIB, 7) });
  await withGitHub(repo, async ({ server, base }) => {
    const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: 'main' });
    try {
      assert.deepEqual(acquired.sourceIdentity, { type: 'remote', repository: SOURCE, requested_ref: 'main', resolved_commit: commit });
      const root = path.resolve(acquired.catalogDir, '..', '..');
      assert.equal(path.dirname(root), base);
      assert.match(path.basename(root), /^dude-pack-/);
      assert.deepEqual(listFiles(acquired.catalogDir), CATALOG_MANIFESTS.map((name) => `${name}/pack.md`));
      for (const name of CATALOG_MANIFESTS) {
        assert.deepEqual(
          fs.readFileSync(path.join(acquired.catalogDir, name, 'pack.md')),
          bytesOf(CATALOG_FILES[/** @type {keyof typeof CATALOG_FILES} */ (`library/packs/${name}/pack.md`)]),
        );
      }
      if (!IS_WINDOWS) {
        assert.notEqual(fs.statSync(path.join(acquired.catalogDir, 'beta', 'pack.md')).mode & 0o111, 0, 'an executable manifest keeps its mode');
      }

      // One commit lookup each side of the content, then nonrecursive trees and manifests only.
      assert.equal(server.requests[0].url, `${API}/commits/main`);
      assert.equal(server.requests.at(-1)?.url, `${API}/commits/main`);
      assert.equal(server.of('commit-sha').length, 2);
      assert.deepEqual(server.of('git-commit').map(({ url }) => url), [`${API}/git/commits/${commit}`]);
      const treeShas = ['', 'library', 'library/packs', ...['alpha', 'beta', 'delta', 'epsilon', 'gamma', 'zeta'].map((name) => `library/packs/${name}`)]
        .map((dir) => (dir ? /** @type {FixtureEntry} */ (entryAt(repo, rootTree, dir)).sha : rootTree));
      assert.deepEqual(server.of('tree').map(({ url }) => url).sort(), treeShas.map((sha) => `${API}/git/trees/${sha}`).sort());
      assert.deepEqual(
        server.of('raw').map(({ url }) => url).sort(),
        CATALOG_MANIFESTS.map((name) => `${RAW}/${commit}/library/packs/${name}/pack.md`).sort(),
      );
      assert.equal(server.of('tree-recursive').length + server.of('tags').length + server.of('other').length, 0);
      assert.equal(server.requests.length, 2 + 1 + treeShas.length + CATALOG_MANIFESTS.length, 'no companion, unrelated blob or archive is read');
      assert.ok(server.peak() > 1 && server.peak() <= 4, `requests overlap within the four-request bound (peak ${server.peak()})`);
    } finally {
      await acquired.dispose();
    }
    assert.deepEqual(acquisitionRoots(base), []);
    await acquired.dispose();
  });
});

test('GitHub discovery returns a verified empty catalog but never substitutes empty for a missing one', async (t) => {
  await t.test('a packs folder with no manifests is an empty catalog', async () => {
    const { repo } = repositoryWith({ 'library/packs/gamma/README.md': 'no manifest\n', 'library/packs/x.txt': 'file\n' });
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: 'main' });
      try {
        assert.deepEqual(fs.readdirSync(acquired.catalogDir), []);
        assert.equal(server.of('raw').length, 0);
      } finally {
        await acquired.dispose();
      }
    });
  });

  const missing = [
    ['no library folder', { 'README.md': 'x\n' }, /^no pack catalog found in https:\/\/github\.com\/acme\/catalog @ main$/],
    ['no packs folder', { 'library/README.md': 'x\n' }, /^no pack catalog found in https:\/\/github\.com\/acme\/catalog @ main$/],
    ['a library file', { library: 'not a folder\n' }, /failed to fetch source .* the catalog's library entry is not a directory/],
    ['a packs submodule', { 'library/packs': { gitlink: '7'.repeat(40) } }, /failed to fetch source .* the catalog's packs entry is not a directory/],
  ];
  for (const [name, files, expected] of missing) {
    await t.test(String(name), async () => {
      const { repo } = repositoryWith(/** @type {Record<string, FixtureFile>} */ (files));
      await withGitHub(repo, async ({ server, base }) => {
        const error = await rejection(acquireRemoteCatalog({ repository: SOURCE, ref: 'main' }));
        assert.match(error.message, /** @type {RegExp} */ (expected));
        assert.equal(server.of('raw').length, 0);
        assert.deepEqual(acquisitionRoots(base), []);
      });
    });
  }
});

test('GitHub pack acquisition matches the local checkout of the same commit, nested files and modes included', async () => {
  const files = { ...CATALOG_FILES };
  const { repo, commit, rootTree } = repositoryWith(files);
  const local = createGitRepository(files);
  try {
    assert.equal(local.tree, rootTree, 'the stand-in serves the same Git objects as a real repository');
    await withGitHub(repo, async ({ server, base }) => {
      /** @type {Array<{ file: string, mode: number | undefined }>} */
      const writes = [];
      const acquired = await withWriteModes(writes, () => acquireRemotePack({ repository: SOURCE, ref: 'main', name: 'alpha' }));
      try {
        assert.deepEqual(acquired.sourceIdentity, { type: 'remote', repository: SOURCE, requested_ref: 'main', resolved_commit: commit });
        assert.equal(acquired.packDir, path.join(path.resolve(acquired.packDir, '..', '..', '..'), 'library', 'packs', 'alpha'));
        const localPack = path.join(local.dir, 'library', 'packs', 'alpha');
        const expectedFiles = listFiles(localPack);
        assert.deepEqual(listFiles(acquired.packDir), expectedFiles);
        assert.ok(expectedFiles.includes('LICENSE') && expectedFiles.includes('NOTICE')
          && expectedFiles.includes('skills/dude-pack-alpha-writer/scripts/vendor.js.LEGAL.txt'), 'shipped notices are part of the subtree');
        for (const file of expectedFiles) {
          assert.deepEqual(fs.readFileSync(path.join(acquired.packDir, ...file.split('/'))), fs.readFileSync(path.join(localPack, ...file.split('/'))), file);
          if (!IS_WINDOWS) {
            assert.equal(
              fs.statSync(path.join(acquired.packDir, ...file.split('/'))).mode & 0o111,
              fs.statSync(path.join(localPack, ...file.split('/'))).mode & 0o111,
              `${file} keeps its executable bits`,
            );
          }
        }
        const modes = Object.fromEntries(writes.map(({ file, mode }) => [path.relative(acquired.packDir, file).split(path.sep).join('/'), mode]));
        assert.deepEqual(Object.keys(modes).sort(), expectedFiles);
        for (const file of expectedFiles) {
          assert.equal(modes[file], file === 'skills/dude-pack-alpha-writer/scripts/run.sh' ? 0o755 : 0o644, `${file} is written with its Git mode`);
        }

        // Ancestors, one recursive tree for the selected pack, and only its files.
        const alphaTree = /** @type {FixtureEntry} */ (entryAt(repo, rootTree, 'library/packs/alpha')).sha;
        assert.deepEqual(server.of('tree').map(({ url }) => url), ['', 'library', 'library/packs']
          .map((dir) => `${API}/git/trees/${dir ? /** @type {FixtureEntry} */ (entryAt(repo, rootTree, dir)).sha : rootTree}`));
        assert.deepEqual(server.of('tree-recursive').map(({ url }) => url), [`${API}/git/trees/${alphaTree}?recursive=1`]);
        assert.deepEqual(
          server.of('raw').map(({ url }) => url).sort(),
          expectedFiles.map((file) => `${RAW}/${commit}/library/packs/alpha/${file}`).sort(),
        );
        assert.equal(server.of('commit-sha').length, 2);
        assert.equal(server.requests.length, 2 + 1 + 3 + 1 + expectedFiles.length);
        assert.ok(server.peak() <= 4);
      } finally {
        await acquired.dispose();
      }
      assert.deepEqual(acquisitionRoots(base), []);
    });
  } finally {
    fs.rmSync(local.parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

/** Two published states of one small catalog, so content shows which commit was read. */
function twoRevisions() {
  const repo = createRepository();
  const first = addCommit(repo, { 'library/packs/alpha/pack.md': manifest('alpha', 'first'), 'library/packs/alpha/agents/a.agent.md': 'a\n' }, 'first');
  const second = addCommit(repo, { 'library/packs/alpha/pack.md': manifest('alpha', 'second'), 'library/packs/alpha/agents/a.agent.md': 'b\n' }, 'second');
  return { repo, first: first.commit, second: second.commit };
}

/** @param {string} catalogDir */
function catalogDescription(catalogDir) {
  return /description: "([^"]*)"/.exec(fs.readFileSync(path.join(catalogDir, 'alpha', 'pack.md'), 'utf8'))?.[1];
}

test('GitHub revisions resolve once, read one commit, and recheck mutable selectors', async (t) => {
  await t.test('a branch whose name has slashes keeps them as path separators', async () => {
    const { repo, second } = twoRevisions();
    repo.refs.set('release/1.x', second);
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: 'release/1.x' });
      try {
        assert.equal(acquired.sourceIdentity.resolved_commit, second);
        assert.equal(acquired.sourceIdentity.requested_ref, 'release/1.x');
        assert.equal(catalogDescription(acquired.catalogDir), 'second');
        assert.deepEqual(server.of('commit-sha').map(({ url }) => url), [`${API}/commits/release/1.x`, `${API}/commits/release/1.x`]);
      } finally {
        await acquired.dispose();
      }
    });
  });

  await t.test('an annotated tag is read at the commit GitHub peels it to', async () => {
    const { repo, first } = twoRevisions();
    repo.refs.set('v2.0.0', first);
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemotePack({ repository: SOURCE, ref: 'v2.0.0', name: 'alpha' });
      try {
        assert.equal(acquired.sourceIdentity.resolved_commit, first);
        assert.equal(fs.readFileSync(path.join(acquired.packDir, 'agents', 'a.agent.md'), 'utf8'), 'a\n');
        assert.equal(server.of('raw').every(({ url }) => url.startsWith(`${RAW}/${first}/`)), true, 'files are read by commit, never by tag');
        assert.equal(server.of('commit-sha').length, 2, 'a tag can move, so it is rechecked');
      } finally {
        await acquired.dispose();
      }
    });
  });

  await t.test('an exact commit is validated against GitHub and needs no recheck', async () => {
    const { repo, second } = twoRevisions();
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: second.toUpperCase() });
      try {
        assert.equal(acquired.sourceIdentity.resolved_commit, second);
        assert.equal(acquired.sourceIdentity.requested_ref, second.toUpperCase(), 'the requested selector is recorded as given');
        assert.equal(server.of('commit-sha').length, 1);
      } finally {
        await acquired.dispose();
      }
    });
  });

  await t.test('an exact commit that GitHub resolves to another commit is refused', async () => {
    const { repo, first, second } = twoRevisions();
    await withGitHub(repo, async ({ server, base }) => {
      const error = await rejection(acquireRemoteCatalog({ repository: SOURCE, ref: first }));
      assert.match(error.message, /resolved the requested commit to a different commit/);
      assert.equal(server.of('tree').length, 0);
      assert.deepEqual(acquisitionRoots(base), []);
    }, (request) => (request.kind === 'commit-sha' ? response(second) : undefined));
  });

  await t.test('a missing ref is refused, not replaced', async () => {
    const { repo } = twoRevisions();
    await withGitHub(repo, async ({ server, base }) => {
      const error = await rejection(acquireRemoteCatalog({ repository: SOURCE, ref: 'no-such-branch' }));
      assert.match(error.message, /failed to fetch source https:\/\/github\.com\/acme\/catalog @ no-such-branch: .*HTTP 422/);
      assert.equal(server.requests.length, 1);
      assert.deepEqual(acquisitionRoots(base), []);
    });
  });
});

/** @param {number} count @param {string} commit */
function buildTags(count, commit) {
  return Array.from({ length: count }, (_, index) => ({ name: `build-${String(index).padStart(4, '0')}`, commit }));
}

test('the latest channel enumerates every tag page to a proven end and selects the highest stable release', async (t) => {
  await t.test('the highest release on the last of three pages wins over earlier pages', async () => {
    const { repo, first, second } = twoRevisions();
    repo.tags.push(
      { name: 'v9.9.9', commit: first },
      { name: 'v10.0.0-rc1', commit: first },
      ...buildTags(198, first),
      { name: 'v2.0.0', commit: first },
      ...buildTags(49, first).map((tag) => ({ ...tag, name: `nightly-${tag.name}` })),
      { name: 'v10.2.0', commit: second },
    );
    assert.equal(repo.tags.length, 251);
    assert.equal(repo.tags.findIndex((tag) => tag.name === 'v10.2.0'), 250, 'the highest release is the last entry of page three');
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: 'latest' });
      try {
        assert.deepEqual(acquired.sourceIdentity, { type: 'remote', repository: SOURCE, requested_ref: 'latest', resolved_commit: second });
        assert.equal(catalogDescription(acquired.catalogDir), 'second');
        const pages = server.of('tags').map(({ url }) => new URL(url).searchParams.get('page'));
        assert.deepEqual(pages, ['1', '2', '3', '1', '2', '3'], 'both selections read every page');
        assert.equal(server.of('commit-sha').length, 0);
      } finally {
        await acquired.dispose();
      }
    });
  });

  await t.test('an exact multiple of the page size ends at an empty page', async () => {
    const { repo, first } = twoRevisions();
    repo.tags.push({ name: 'v1.0.0', commit: first }, ...buildTags(199, first));
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: 'latest' });
      try {
        assert.equal(acquired.sourceIdentity.resolved_commit, first);
        assert.equal(server.of('tags').length, 6);
      } finally {
        await acquired.dispose();
      }
    });
  });

  await t.test('twenty full pages without a proven end is a limit failure before any content', async () => {
    const { repo, first } = twoRevisions();
    repo.tags.push({ name: 'v1.0.0', commit: first }, ...buildTags(1_999, first));
    await withGitHub(repo, async ({ server, base }) => {
      const error = await rejection(acquireRemoteCatalog({ repository: SOURCE, ref: 'latest' }));
      assert.match(error.message, /tag list did not end within 20 pages of 100 tags/);
      assert.equal(server.of('tags').length, 20);
      assert.equal(server.requests.length, 20);
      assert.deepEqual(acquisitionRoots(base), []);
    });
  });

  await t.test('no stable release is reported as such, not as an empty catalog', async () => {
    const { repo, first } = twoRevisions();
    repo.tags.push({ name: 'v1.0.0-rc1', commit: first }, { name: 'release-1', commit: first });
    await withGitHub(repo, async ({ base }) => {
      const error = await rejection(acquireRemoteCatalog({ repository: SOURCE, ref: 'latest' }));
      assert.equal(error.message, 'no releases published yet at https://github.com/acme/catalog (channel: latest)');
      assert.deepEqual(acquisitionRoots(base), []);
    });
  });
});

test('a selector that changes during acquisition is refused as drift and nothing is kept', async (t) => {
  const cases = [
    {
      name: 'a branch moves',
      ref: 'main',
      setUp: (/** @type {ReturnType<typeof twoRevisions>} */ { repo, first }) => { repo.refs.set('main', first); },
      move: (/** @type {ReturnType<typeof twoRevisions>} */ { repo, second }) => { repo.refs.set('main', second); },
      expected: (/** @type {ReturnType<typeof twoRevisions>} */ { first, second }) => new RegExp(`changed during acquisition \\(from ${first} to ${second}\\); nothing was kept`),
    },
    {
      name: 'a newer release is published',
      ref: 'latest',
      setUp: (/** @type {ReturnType<typeof twoRevisions>} */ { repo, first }) => { repo.tags.push({ name: 'v1.0.0', commit: first }); },
      move: (/** @type {ReturnType<typeof twoRevisions>} */ { repo, second }) => { repo.tags.push({ name: 'v1.1.0', commit: second }); },
      expected: (/** @type {ReturnType<typeof twoRevisions>} */ { first, second }) => new RegExp(`from v1\\.0\\.0 at ${first} to v1\\.1\\.0 at ${second}`),
    },
    {
      name: 'the selected release tag moves',
      ref: 'latest',
      setUp: (/** @type {ReturnType<typeof twoRevisions>} */ { repo, first }) => { repo.tags.push({ name: 'v1.0.0', commit: first }); },
      move: (/** @type {ReturnType<typeof twoRevisions>} */ { repo, second }) => { repo.tags[0] = { name: 'v1.0.0', commit: second }; },
      expected: (/** @type {ReturnType<typeof twoRevisions>} */ { first, second }) => new RegExp(`from v1\\.0\\.0 at ${first} to v1\\.0\\.0 at ${second}`),
    },
  ];
  for (const driftCase of cases) {
    for (const operation of ['catalog', 'pack']) {
      await t.test(`${driftCase.name} (${operation})`, async () => {
        const fixture = twoRevisions();
        driftCase.setUp(fixture);
        let moved = false;
        await withGitHub(fixture.repo, async ({ server, base }) => {
          const pending = operation === 'catalog'
            ? acquireRemoteCatalog({ repository: SOURCE, ref: driftCase.ref })
            : acquireRemotePack({ repository: SOURCE, ref: driftCase.ref, name: 'alpha' });
          const error = await rejection(pending);
          assert.match(error.message, driftCase.expected(fixture));
          assert.ok(server.of('raw').length > 0, 'the recheck follows the content reads');
          assert.equal(server.of('raw').every(({ url }) => url.startsWith(`${RAW}/${fixture.first}/`)), true, 'every read used the first commit');
          assert.deepEqual(acquisitionRoots(base), []);
        }, (request) => {
          // Publish after the opening resolution, before any content is read.
          if (request.kind === 'git-commit' && !moved) {
            moved = true;
            driftCase.move(fixture);
          }
          return undefined;
        });
      });
    }
  }
});

test('every ordinary public GitHub spelling is read over HTTPS and keeps its configured identity', async (t) => {
  for (const spelling of [
    SOURCE,
    `${SOURCE}.git`,
    `${SOURCE}/`,
    `HTTPS://GITHUB.COM/${OWNER}/${REPOSITORY}.git`,
    `ssh://git@github.com/${OWNER}/${REPOSITORY}.git`,
    `git+ssh://git@github.com/${OWNER}/${REPOSITORY}`,
    `git@github.com:${OWNER}/${REPOSITORY}.git`,
    `git@GitHub.com:${OWNER}/${REPOSITORY}`,
  ]) {
    await t.test(spelling, async () => {
      const { repo, commit } = repositoryWith({ 'library/packs/alpha/pack.md': manifest('alpha') });
      await withGitHub(repo, async ({ server }) => {
        const acquired = await acquireRemoteCatalog({ repository: spelling, ref: 'main' });
        try {
          assert.deepEqual(acquired.sourceIdentity, { type: 'remote', repository: spelling, requested_ref: 'main', resolved_commit: commit });
          assert.equal(server.requests.every(({ url }) => url.startsWith(`${API}/`) || url.startsWith(`${RAW}/`)), true);
        } finally {
          await acquired.dispose();
        }
      });
    });
  }
});

test('credential-bearing and malformed GitHub-shaped sources are refused without a request, a process or an echo', async (t) => {
  const refused = [
    ['a password in an HTTPS URL', 'https://user:s3cr3t-value@github.com/acme/catalog', /user name or password/],
    ['a token as the HTTPS user', 'https://ghp_s3cr3tvalue@github.com/acme/catalog.git', /user name or password/],
    ['a password in an SSH URL', 'ssh://git:s3cr3t-value@github.com/acme/catalog.git', /user name or password/],
    ['a password for another host', 'https://user:s3cr3t-value@gitlab.example.invalid/acme/catalog.git', /user name or password/],
    ['a token for another host', 'https://s3cr3t-value@gitlab.example.invalid/acme/catalog.git', /user name or password/],
    ['an owner without a repository', 'https://github.com/acme', UNSUPPORTED],
    ['a tree path', 'https://github.com/acme/catalog/tree/main', UNSUPPORTED],
    ['a query', 'https://github.com/acme/catalog?ref=main', UNSUPPORTED],
    ['a fragment', 'https://github.com/acme/catalog#readme', UNSUPPORTED],
    ['an explicit port', 'https://github.com:443/acme/catalog', UNSUPPORTED],
    ['plain HTTP', 'http://github.com/acme/catalog', UNSUPPORTED],
    ['the Git protocol', 'git://github.com/acme/catalog.git', UNSUPPORTED],
    ['a www host', 'https://www.github.com/acme/catalog', UNSUPPORTED],
    ['another GitHub host over SSH', 'ssh://git@ssh.github.com:443/acme/catalog.git', UNSUPPORTED],
    ['an SSH user other than git', 'ssh://alice@github.com/acme/catalog.git', UNSUPPORTED],
    ['an SCP address without the git user', 'github.com:acme/catalog.git', UNSUPPORTED],
    ['an SCP address with a rooted path', 'git@github.com:/acme/catalog.git', UNSUPPORTED],
    ['an address without a scheme', 'github.com/acme/catalog', UNSUPPORTED],
    ['an encoded owner', 'https://github.com/%61cme/catalog', UNSUPPORTED],
    ['backslash separators', 'https://github.com\\acme\\catalog', UNSUPPORTED],
    ['a doubled .git suffix', 'https://github.com/acme/catalog.git.git', UNSUPPORTED],
    ['a dot repository', 'https://github.com/acme/..', UNSUPPORTED],
    ['surrounding space', ' https://github.com/acme/catalog', /one line/],
    ['a control character', 'https://github.com/acme/catalog\n', /one line/],
    ['an option-shaped source', '--upload-pack=touch x', /must not begin with "-"/],
  ];
  for (const [name, source, expected] of refused) {
    await t.test(String(name), async () => {
      await withGitHub(createRepository(), async ({ server, base }) => {
        for (const pending of [
          acquireRemoteCatalog({ repository: /** @type {string} */ (source), ref: 'main' }),
          acquireRemotePack({ repository: /** @type {string} */ (source), ref: 'main', name: 'alpha' }),
        ]) {
          const error = await rejection(pending);
          assert.match(error.message, /** @type {RegExp} */ (expected));
          assert.equal(error.message.includes(/** @type {string} */ (source).trim()), false, 'the refused address is not repeated');
          assert.equal(error.message.includes('s3cr3t'), false, 'no credential reaches the message');
        }
        assert.equal(server.requests.length, 0);
        assert.deepEqual(acquisitionRoots(base), []);
      });
    });
  }
});

/**
 * Refuse `source` for a catalog and a pack, each with a valid ref and name, before
 * any request, process or root, and without repeating the address or its credential.
 * @param {string} source
 * @param {RegExp} expected
 */
async function assertRefusedBeforeAnyRead(source, expected) {
  const server = githubServer(createRepository());
  // Git is stood in for, so even a misclassified source starts no real clone.
  await withTemp((base) => withFetch(server.fetch, () => withProcessRecorder(async (calls) => {
    for (const acquire of [
      () => acquireRemoteCatalog({ repository: source, ref: 'main' }),
      () => acquireRemotePack({ repository: source, ref: 'main', name: 'alpha' }),
    ]) {
      const error = await rejection(acquire());
      assert.deepEqual(calls, [], 'no process starts, Git included');
      assert.equal(server.requests.length, 0, 'no HTTP request is made');
      assert.match(error.message, expected);
      assert.equal(error.message.includes(source), false, 'the refused address is not repeated');
      assert.equal(error.message.includes('s3cr3t'), false, 'no credential reaches the message');
    }
    assert.deepEqual(acquisitionRoots(base), []);
  }, { spawnSync: () => ({ pid: 0, status: 128, signal: null, stdout: null, stderr: null, output: [] }) })));
}

test('a URL with an empty or backslash-split authority is refused without a request, a process or an echo', async (t) => {
  // Git finds a host after the extra slash or past the backslash, so each spelling
  // could reach GitHub, or carry its credentials, through a clone.
  const ambiguous = [
    ['an empty authority before a GitHub address', 'https:///github.com/acme/catalog'],
    ['an empty authority hiding GitHub credentials', 'https:///user:s3cr3t-value@github.com/acme/catalog'],
    ['an empty SSH authority before a GitHub address', 'ssh:///git@github.com/acme/catalog.git'],
    ['an empty authority hiding credentials for another host', 'https:///user:s3cr3t-value@gitlab.example.invalid/acme/catalog.git'],
    ['a backslash before a GitHub host', 'https://example.invalid\\@github.com/acme/catalog'],
    ['a backslash hiding GitHub credentials', 'https://user\\:s3cr3t-value@github.com/acme/catalog'],
  ];
  for (const [name, source] of ambiguous) {
    await t.test(name, () => assertRefusedBeforeAnyRead(source, AMBIGUOUS_AUTHORITY));
  }
});

test('remote-helper and bracketed-name addresses are refused before Git, HTTP or a root, without an echo', async (t) => {
  // Git hands `<transport>::<address>` to a remote helper and connects to a bracketed
  // name as the host, so each spelling could clone GitHub, or carry its credentials,
  // past classification. Neither refusal depends on the name inside.
  /** @type {Array<[string, string, RegExp]>} */
  const refused = [
    ['an SCP address with a bracketed GitHub host', 'git@[github.com]:acme/catalog.git', BRACKETED_HOST],
    ['an SSH URL with a bracketed GitHub host', 'ssh://git@[github.com]/acme/catalog.git', BRACKETED_HOST],
    ['the https remote helper around a GitHub URL', 'https::https://github.com/acme/catalog', REMOTE_HELPER],
    ['a remote helper hiding GitHub credentials', 'https::https://user:s3cr3t-value@github.com/acme/catalog', REMOTE_HELPER],
    ['another remote helper', 'codecommit::us-east-1://catalog', REMOTE_HELPER],
    ['an unnamed remote helper', '::https://github.com/acme/catalog', REMOTE_HELPER],
    ['an SCP address with a bracketed host name', 'git@[gitlab.example.invalid]:acme/catalog.git', BRACKETED_HOST],
    ['an SSH URL with a bracketed host name', 'ssh://git@[gitlab.example.invalid]/acme/catalog.git', BRACKETED_HOST],
    // Git also unwraps a bracket that holds the user, and drops text after a bracket.
    ['an SCP address bracketing its user and GitHub host', '[git@github.com]:acme/catalog.git', BRACKETED_HOST],
    ['an SCP address with text after a bracketed GitHub host', '[github.com]x:acme/catalog.git', BRACKETED_HOST],
    ['an SSH URL bracketing its user and GitHub host', 'ssh://[git@github.com]/acme/catalog.git', BRACKETED_HOST],
    ['an SSH URL with text after a bracketed GitHub host', 'ssh://git@[github.com]x/acme/catalog.git', BRACKETED_HOST],
  ];
  for (const [name, source, expected] of refused) {
    await t.test(name, () => assertRefusedBeforeAnyRead(source, expected));
  }
});

test('refs and pack names that cannot address one revision are refused before any request', async (t) => {
  const githubRefs = ['', '-x', 'a..b', 'a b', 'x@{1}', '@', 'x.lock', 'a.lock/b', '/x', 'x/', 'x//y', '.x', 'a/.b', 'x^', 'x~1',
    'x:y', 'x?', 'x*', 'x[', 'x\\y', 'x\u0000', 'x'.repeat(256)];
  for (const ref of githubRefs) {
    await t.test(`GitHub ref ${JSON.stringify(ref.length > 20 ? `${ref.slice(0, 8)}...` : ref)}`, async () => {
      await withGitHub(createRepository(), async ({ server, base }) => {
        const error = await rejection(acquireRemoteCatalog({ repository: SOURCE, ref }));
        assert.match(error.message, /ref must be/);
        assert.equal(server.requests.length, 0);
        assert.deepEqual(acquisitionRoots(base), []);
      });
    });
  }
  for (const ref of ['', '-x', 'a b', 'x\u0000y']) {
    await t.test(`Git ref ${JSON.stringify(ref)}`, async () => {
      await withTemp(async (base) => withProcessRecorder(async (calls) => {
        const error = await rejection(acquireRemoteCatalog({ repository: 'https://gitlab.example.invalid/acme/catalog.git', ref }));
        assert.match(error.message, /ref must/);
        assert.deepEqual(calls, []);
        assert.deepEqual(acquisitionRoots(base), []);
      }));
    });
  }
  for (const name of ['', 'Alpha', '../alpha', 'alpha/beta', 'a', '-alpha', 'alpha-']) {
    await t.test(`pack name ${JSON.stringify(name)}`, async () => {
      await withGitHub(createRepository(), async ({ server }) => {
        await assert.rejects(acquireRemotePack({ repository: SOURCE, ref: 'main', name }), /valid pack identifier/);
        assert.equal(server.requests.length, 0);
      });
    });
  }
  await t.test('a non-signal is refused and a signal that already ended starts nothing', async () => {
    await withGitHub(createRepository(), async ({ server, base }) => {
      await assert.rejects(acquireRemoteCatalog({ repository: SOURCE, ref: 'main', signal: /** @type {any} */ ({ aborted: false }) }), /signal must be an AbortSignal/);
      const ended = new AbortController();
      ended.abort(new Error('closed'));
      await assert.rejects(acquireRemoteCatalog({ repository: SOURCE, ref: 'main', signal: ended.signal }), /cancelled before it started/);
      assert.equal(server.requests.length, 0);
      assert.deepEqual(acquisitionRoots(base), []);
    });
  });
});

test('other hosts, GitHub Enterprise included, keep Git whole-repository acquisition and make no HTTP request', async (t) => {
  for (const source of [
    'https://github.example.com/acme/catalog.git',
    'https://gitlab.example.invalid/acme/catalog.git',
    'ssh://git@gitlab.example.invalid/acme/catalog.git',
    'git@gitlab.example.invalid:acme/catalog.git',
    'file:///definitely-missing-pack-source',
    'file:///github.com/acme/catalog',
    // An IPv6 host may be bracketed, with a port outside its brackets, and a path may hold `::`.
    'ssh://git@[2001:db8::1]:2222/acme/catalog.git',
    'https://[::1]:8443/acme/catalog.git',
    'git@[2001:db8::1]:acme/catalog.git',
    '[::1]:acme/catalog.git',
    'git@gitlab.example.invalid:acme/a::b.git',
  ]) {
    await t.test(source, async () => {
      await withTemp((base) => withFetch(/** @type {any} */ (() => assert.fail('another host is not read over HTTP')), () => withProcessRecorder(async (calls) => {
        const error = await rejection(acquireRemoteCatalog({ repository: source, ref: 'main' }));
        assert.equal(error.message, `failed to fetch source ${source} @ main`);
        const [shallow, full] = calls;
        assert.equal(shallow.command, 'git');
        assert.deepEqual(shallow.args.slice(0, -1), ['clone', '--quiet', '--depth=1', '--branch', 'main', '--', source]);
        assert.deepEqual(full.args.slice(0, -1), ['clone', '--quiet', '--', source]);
        assert.equal(calls.length, 2, 'a failed full clone stops the acquisition');
        assert.deepEqual(acquisitionRoots(base), []);
      }, { spawnSync: () => ({ pid: 0, status: 128, signal: null, stdout: null, stderr: null, output: [] }) })));
    });
  }
});

/**
 * Run one refused GitHub acquisition and check what every refusal shares: the
 * expected reason, no process, no kept root.
 * @param {FixtureRepository} repo
 * @param {() => Promise<unknown>} acquire
 * @param {RegExp} expected
 * @param {Intercept} [intercept]
 * @param {(server: ReturnType<typeof githubServer>) => void} [check]
 */
async function assertRefusedGitHub(repo, acquire, expected, intercept, check) {
  await withGitHub(repo, async ({ server, base }) => {
    const error = await rejection(acquire());
    assert.match(error.message, expected);
    check?.(server);
    assert.deepEqual(acquisitionRoots(base), []);
  }, intercept);
}

const catalog = () => acquireRemoteCatalog({ repository: SOURCE, ref: 'main' });
const alpha = () => acquireRemotePack({ repository: SOURCE, ref: 'main', name: 'alpha' });

test('GitHub transport failures are explicit and never fall back to another read', async (t) => {
  await t.test('a missing or private repository says GitHub is read anonymously', async () => {
    await assertRefusedGitHub(createRepository(), catalog, new RegExp(
      `^failed to fetch source ${escape(SOURCE)} @ main: GitHub metadata fetch failed: GitHub metadata request failed with HTTP 404 `
      + '\\(GitHub sources are read anonymously, so the repository and ref must be public\\)$',
    ), () => jsonResponse({ message: 'Not Found' }, 404), (server) => assert.equal(server.requests.length, 1));
  });

  await t.test('a rate limit is named and not retried', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    await assertRefusedGitHub(repo, alpha, /HTTP 403 \(rate limit\)$/,
      (request) => (request.kind === 'tree' ? response('{"message":"API rate limit exceeded"}', 403, { 'x-ratelimit-remaining': '0' }) : undefined),
      (server) => assert.equal(server.of('tree').length, 1, 'no retry'));
  });

  await t.test('a redirect is refused and its location never requested', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    await assertRefusedGitHub(repo, alpha, /HTTP 301/,
      (request) => (request.kind === 'tree-recursive' ? response(null, 301, { location: FOREIGN_URL }) : undefined),
      (server) => {
        assert.equal(server.requests.some(({ url }) => url === FOREIGN_URL), false);
        assert.equal(server.of('raw').length, 0);
      });
  });

  await t.test('a raw read refused by fetch redirect handling ends the acquisition', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    await assertRefusedGitHub(repo, catalog, /fetch failed: redirect refused/,
      (request) => { if (request.kind === 'raw') throw new TypeError('redirect refused'); return undefined; });
  });

  const malformedTrees = [
    ['a truncated recursive tree', (/** @type {any} */ value) => ({ ...value, truncated: true }), /truncated/],
    ['a tree that names another tree', (/** @type {any} */ value) => ({ ...value, sha: '9'.repeat(40) }), /identity does not match/],
    ['a tree without its truncation marker', (/** @type {any} */ { truncated, ...value }) => value, /truncated/],
  ];
  for (const [name, mutate, expected] of malformedTrees) {
    await t.test(`${name} is refused before any file is read`, async () => {
      const { repo } = repositoryWith(CATALOG_FILES);
      await assertRefusedGitHub(repo, alpha, /** @type {RegExp} */ (expected), (request) => {
        if (request.kind !== 'tree-recursive') return undefined;
        const sha = request.url.slice(`${API}/git/trees/`.length).replace('?recursive=1', '');
        return jsonResponse(/** @type {Function} */ (mutate)(treeJson(repo, sha, true)));
      }, (server) => assert.equal(server.of('raw').length, 0));
    });
  }

  await t.test('a commit object for another commit is refused', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    await assertRefusedGitHub(repo, catalog, /identity does not match the resolved commit/,
      (request) => (request.kind === 'git-commit' ? jsonResponse({ sha: '8'.repeat(40), tree: { sha: '1'.repeat(40) } }) : undefined),
      (server) => assert.equal(server.of('tree').length, 0));
  });

  await t.test('a commit lookup that is not one commit ID is refused', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    await assertRefusedGitHub(repo, catalog, /did not return one full commit ID/,
      (request) => (request.kind === 'commit-sha' ? jsonResponse({ sha: 'a'.repeat(40) }) : undefined));
  });

  await t.test('an oversized metadata response is stopped while streaming despite a small Content-Length', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    let cancelled = 0;
    await assertRefusedGitHub(repo, catalog, /metadata response body exceeds the 2097152-byte \(2 MiB\) limit/, (request) => {
      if (request.kind !== 'tree') return undefined;
      return response(new ReadableStream({
        pull(controller) { controller.enqueue(Buffer.alloc(MIB, 0x20)); },
        cancel() { cancelled += 1; },
      }, { highWaterMark: 0 }), 200, { 'content-length': '64' });
    }, (server) => {
      assert.equal(cancelled, 1);
      assert.equal(server.of('tree')[0].init.signal?.aborted, true);
    });
  });
});

test('selected-pack entries that cannot be materialized faithfully are refused before any file is read', async (t) => {
  const unsafe = [
    ['a symbolic link', { 'library/packs/alpha/skills/link': { symlink: '../../../../README.md' } }, /symbolic link at "skills\/link", which is not followed/],
    ['a submodule', { 'library/packs/alpha/vendor': { gitlink: '5'.repeat(40) } }, /submodule at "vendor", which is not read/],
    ['a Windows device name', { 'library/packs/alpha/aux.md': 'x\n' }, /not representable on Windows: "aux\.md"/],
    ['a Windows device folder', { 'library/packs/alpha/con/notes.md': 'x\n' }, /not representable on Windows: "con"/],
    ['a trailing dot', { 'library/packs/alpha/notes.': 'x\n' }, /not representable on Windows/],
    ['a trailing space', { 'library/packs/alpha/notes ': 'x\n' }, /not representable on Windows/],
    ['a colon', { 'library/packs/alpha/a:b.md': 'x\n' }, /not representable on Windows/],
    ['a pipe', { 'library/packs/alpha/a|b.md': 'x\n' }, /not representable on Windows/],
    ['a backslash', { 'library/packs/alpha/a\\b.md': 'x\n' }, /backslash/],
    ['a case collision', { 'library/packs/alpha/Notes.md': 'x\n', 'library/packs/alpha/notes.md': 'y\n' }, /case collision/],
  ];
  for (const [name, extra, expected] of unsafe) {
    await t.test(String(name), async () => {
      const { repo } = repositoryWith({ ...ALPHA_FILES, ...(/** @type {object} */ (extra)) });
      await assertRefusedGitHub(repo, alpha, /** @type {RegExp} */ (expected), undefined,
        (server) => assert.equal(server.of('raw').length, 0));
    });
  }

  await t.test('a pack with no manifest, a missing pack and a non-directory pack are not found or refused', async () => {
    const files = { ...ALPHA_FILES, 'library/packs/beta/README.md': 'no manifest\n', 'library/packs/gamma': 'a file\n' };
    for (const [name, expected] of [
      ['beta', /^pack "beta" not found in source https:\/\/github\.com\/acme\/catalog @ main$/],
      ['omega', /^pack "omega" not found in source https:\/\/github\.com\/acme\/catalog @ main$/],
      ['gamma', /pack "gamma" is not a directory in the catalog/],
    ]) {
      const { repo } = repositoryWith(files);
      await assertRefusedGitHub(repo, () => acquireRemotePack({ repository: SOURCE, ref: 'main', name: /** @type {string} */ (name) }),
        /** @type {RegExp} */ (expected), undefined, (server) => assert.equal(server.of('raw').length, 0));
    }
  });

  await t.test('discovery refuses a manifest that is not a regular file and a pack name it cannot write', async () => {
    for (const [extra, expected] of [
      [{ 'library/packs/beta/pack.md': { symlink: '../alpha/pack.md' } }, /pack "beta" has a pack\.md that is not a regular file/],
      [{ 'library/packs/aux/pack.md': manifest('aux') }, /not representable on Windows: "aux"/],
    ]) {
      const { repo } = repositoryWith({ ...ALPHA_FILES, .../** @type {object} */ (extra) });
      await assertRefusedGitHub(repo, catalog, /** @type {RegExp} */ (expected), undefined, (server) => assert.equal(server.of('raw').length, 0));
    }
  });

  await t.test('a selected pack named for a Windows device is refused before any request or write', async () => {
    for (const name of ['aux', 'con']) {
      // The alpha fixture, which is acquired normally, under a device name.
      const renamed = Object.fromEntries(Object.entries(ALPHA_FILES).map(([filePath, value]) => [
        filePath.replace('library/packs/alpha/', `library/packs/${name}/`),
        filePath === 'library/packs/alpha/pack.md' ? manifest(name) : value,
      ]));
      const { repo } = repositoryWith({ ...ALPHA_FILES, ...renamed });
      await withGitHub(repo, async ({ server, base }) => {
        /** @type {Array<{ file: string, mode: number | undefined }>} */
        const writes = [];
        const error = await rejection(withWriteModes(writes, () => acquireRemotePack({ repository: SOURCE, ref: 'main', name })));
        assert.match(error.message, new RegExp(`not representable on Windows: "${name}"`));
        assert.equal(server.requests.length, 0, 'nothing is requested, so nothing is downloaded');
        assert.deepEqual(writes, [], 'nothing is written');
        assert.deepEqual(acquisitionRoots(base), []);
        const control = await acquireRemotePack({ repository: SOURCE, ref: 'main', name: 'alpha' });
        await control.dispose();
      });
    }
  });
});

test('downloaded bytes are bound to the tree size and Git blob ID before they are kept', async (t) => {
  const cases = [
    ['one extra byte', (/** @type {Buffer} */ bytes) => Buffer.concat([bytes, Buffer.from('x')]), /raw file size does not match Git tree metadata for "library\/packs\/alpha\/NOTICE"/],
    ['one missing byte', (/** @type {Buffer} */ bytes) => bytes.subarray(1), /raw file size does not match/],
    ['same-length different bytes', (/** @type {Buffer} */ bytes) => Buffer.from(bytes.toString('utf8').toUpperCase()), /Git blob SHA-1 integrity mismatch for "library\/packs\/alpha\/NOTICE"/],
  ];
  for (const [name, change, expected] of cases) {
    await t.test(String(name), async () => {
      const { repo } = repositoryWith(ALPHA_FILES);
      const original = bytesOf(ALPHA_FILES['library/packs/alpha/NOTICE']);
      await assertRefusedGitHub(repo, alpha, /** @type {RegExp} */ (expected),
        (request) => (request.url.endsWith('/library/packs/alpha/NOTICE') ? response(/** @type {Function} */ (change)(original)) : undefined));
    });
  }

  await t.test('a manifest streamed past its 64 KiB bound behind a false Content-Length is stopped', async () => {
    const { repo } = repositoryWith(CATALOG_FILES);
    await assertRefusedGitHub(repo, catalog, /raw response body exceeds the 65536-byte \(64 KiB\) limit/,
      (request) => (request.kind === 'raw' ? response(Buffer.alloc(64 * KIB + 1, 0x61), 200, { 'content-length': '12' }) : undefined));
  });
});

/** @param {number} count */
function catalogWithDirectories(count) {
  /** @type {Record<string, FixtureFile>} */
  const files = {};
  for (let index = 0; index < count; index += 1) {
    const name = `p${String(index).padStart(3, '0')}`;
    files[`library/packs/${name}/pack.md`] = manifest(name);
  }
  return files;
}

/** @param {string} name @param {number} byteCount */
function manifestOfSize(name, byteCount) {
  const head = manifest(name);
  assert.ok(byteCount >= head.length);
  return `${head}${'x'.repeat(byteCount - head.length)}`;
}

/**
 * A selected pack at exactly 1,024 entries and 512 regular files: 64 directory
 * chains eight levels deep hold 511 files, plus the manifest.
 * @param {{ deeperFirstChain?: boolean }} [options]
 */
function packAtEntryBounds({ deeperFirstChain = false } = {}) {
  /** @type {Record<string, FixtureFile>} */
  const files = { 'library/packs/alpha/pack.md': manifest('alpha') };
  let remaining = 511;
  for (let group = 0; group < 64; group += 1) {
    const levels = Array.from({ length: group === 0 && deeperFirstChain ? 8 : 7 }, (_, level) => `l${level + 1}`);
    const dir = ['library/packs/alpha', `g${String(group).padStart(2, '0')}`, ...levels].join('/');
    const count = Math.min(8, remaining);
    for (let file = 0; file < count; file += 1) files[`${dir}/f${file}.txt`] = `${group}:${file}\n`;
    remaining -= count;
  }
  return files;
}

test('catalog bounds accept their limits and refuse one more before the extra reads', async (t) => {
  await t.test('128 pack directories are read; 129 are refused before any pack tree', async () => {
    const exact = repositoryWith(catalogWithDirectories(128));
    await withGitHub(exact.repo, async ({ server }) => {
      const acquired = await catalog();
      try {
        assert.equal(fs.readdirSync(acquired.catalogDir).length, 128);
        assert.equal(server.of('raw').length, 128);
        assert.equal(server.of('tree').length, 3 + 128);
      } finally {
        await acquired.dispose();
      }
    });
    const over = repositoryWith(catalogWithDirectories(129));
    await assertRefusedGitHub(over.repo, catalog, /more than 128 direct pack directories/, undefined,
      (server) => assert.deepEqual([server.of('tree').length, server.of('raw').length], [3, 0]));
  });

  await t.test('a 64 KiB manifest is read; one byte more is refused before any download', async () => {
    const exact = repositoryWith({ 'library/packs/alpha/pack.md': manifestOfSize('alpha', 64 * KIB) });
    await withGitHub(exact.repo, async () => {
      const acquired = await catalog();
      try {
        assert.equal(fs.statSync(path.join(acquired.catalogDir, 'alpha', 'pack.md')).size, 64 * KIB);
      } finally {
        await acquired.dispose();
      }
    });
    const over = repositoryWith({ 'library/packs/alpha/pack.md': manifestOfSize('alpha', 64 * KIB + 1) });
    await assertRefusedGitHub(over.repo, catalog, /pack\.md over the 65536-byte \(64 KiB\) manifest limit/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });

  await t.test('1 MiB of manifests is read; one byte more is refused before any download', async () => {
    /** @type {Record<string, FixtureFile>} */
    const files = {};
    for (let index = 0; index < 16; index += 1) files[`library/packs/p${index}/pack.md`] = manifestOfSize(`p${index}`, 64 * KIB);
    const exact = repositoryWith(files);
    await withGitHub(exact.repo, async () => {
      const acquired = await catalog();
      try {
        assert.equal(fs.readdirSync(acquired.catalogDir).length, 16);
      } finally {
        await acquired.dispose();
      }
    });
    const over = repositoryWith({ ...files, 'library/packs/q/pack.md': 'x' });
    await assertRefusedGitHub(over.repo, catalog, /manifests exceed the 1048576-byte \(1 MiB\) aggregate limit/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });

  await t.test('the largest latest-channel walk the bounds admit fits the 176-request metadata budget', async () => {
    const { repo, commit } = repositoryWith(catalogWithDirectories(128));
    repo.tags.push({ name: 'v1.0.0', commit }, ...buildTags(1_949, commit));
    await withGitHub(repo, async ({ server }) => {
      const acquired = await acquireRemoteCatalog({ repository: SOURCE, ref: 'latest' });
      try {
        const metadata = server.requests.filter(({ kind }) => kind !== 'raw').length;
        assert.equal(metadata, 20 + 1 + 3 + 128 + 20);
        assert.ok(metadata <= 176);
      } finally {
        await acquired.dispose();
      }
    });
  });
});

test('selected-pack bounds accept their limits and refuse one more before any download', async (t) => {
  await t.test('1,024 entries and 512 files are read in 512 raw requests; one more entry is refused', async () => {
    const exact = repositoryWith(packAtEntryBounds());
    await withGitHub(exact.repo, async ({ server }) => {
      const acquired = await alpha();
      try {
        assert.equal(listFiles(acquired.packDir).length, 512);
        assert.equal(server.of('raw').length, 512);
        assert.ok(server.peak() <= 4);
      } finally {
        await acquired.dispose();
      }
    });
    const over = repositoryWith(packAtEntryBounds({ deeperFirstChain: true }));
    await assertRefusedGitHub(over.repo, alpha, /pack "alpha" has more than 1024 entries/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });

  await t.test('a 513th regular file is refused', async () => {
    /** @type {Record<string, FixtureFile>} */
    const files = { 'library/packs/alpha/pack.md': manifest('alpha') };
    for (let index = 0; index < 512; index += 1) files[`library/packs/alpha/f${index}.txt`] = '';
    await assertRefusedGitHub(repositoryWith(files).repo, alpha, /more than 512 regular files/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });

  await t.test('depth 16 is read; depth 17 is refused', async () => {
    /** @param {number} depth */
    const deep = (depth) => ({
      'library/packs/alpha/pack.md': manifest('alpha'),
      [`library/packs/alpha/${Array.from({ length: depth - 1 }, (_, index) => `d${index}`).join('/')}/leaf.txt`]: 'deep\n',
    });
    const exact = repositoryWith(deep(16));
    await withGitHub(exact.repo, async () => {
      const acquired = await alpha();
      try {
        assert.ok(listFiles(acquired.packDir).some((file) => file.split('/').length === 16));
      } finally {
        await acquired.dispose();
      }
    });
    await assertRefusedGitHub(repositoryWith(deep(17)).repo, alpha, /deeper than 16 levels/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });

  await t.test('an 8 MiB file is read; one byte more is refused', async () => {
    const exact = repositoryWith({ 'library/packs/alpha/pack.md': manifest('alpha'), 'library/packs/alpha/big.bin': Buffer.alloc(8 * MIB, 1) });
    await withGitHub(exact.repo, async () => {
      const acquired = await alpha();
      try {
        assert.equal(fs.statSync(path.join(acquired.packDir, 'big.bin')).size, 8 * MIB);
      } finally {
        await acquired.dispose();
      }
    });
    const over = repositoryWith({ 'library/packs/alpha/pack.md': manifest('alpha'), 'library/packs/alpha/big.bin': Buffer.alloc(8 * MIB + 1, 1) });
    await assertRefusedGitHub(over.repo, alpha, /file "big\.bin" exceeds the 8388608-byte \(8 MiB\) per-file limit/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });

  await t.test('64 MiB of files is read; one byte more is refused', async () => {
    const head = manifest('alpha');
    const block = Buffer.alloc(8 * MIB, 2);
    /** @param {number} extra */
    const files = (extra) => {
      /** @type {Record<string, FixtureFile>} */
      const value = { 'library/packs/alpha/pack.md': head };
      for (let index = 0; index < 7; index += 1) value[`library/packs/alpha/b${index}.bin`] = block;
      value['library/packs/alpha/last.bin'] = Buffer.alloc(8 * MIB - head.length + extra, 3);
      return value;
    };
    await withGitHub(repositoryWith(files(0)).repo, async () => {
      const acquired = await alpha();
      try {
        const total = listFiles(acquired.packDir).reduce((sum, file) => sum + fs.statSync(path.join(acquired.packDir, file)).size, 0);
        assert.equal(total, 64 * MIB);
      } finally {
        await acquired.dispose();
      }
    });
    await assertRefusedGitHub(repositoryWith(files(1)).repo, alpha, /exceeds the 67108864-byte \(64 MiB\) aggregate file limit/, undefined,
      (server) => assert.equal(server.of('raw').length, 0));
  });
});

/**
 * Hold back the one timer of `delay` milliseconds so a test can fire it; every
 * other timer runs normally.
 * @param {number} delay
 * @param {(fire: () => void) => Promise<void>} run
 */
async function withHeldTimer(delay, run) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  /** @type {(() => void) | null} */
  let held = null;
  const handle = { held: true };
  globalThis.setTimeout = /** @type {any} */ ((/** @type {Function} */ callback, /** @type {number} */ milliseconds, /** @type {any[]} */ ...args) => {
    if (milliseconds !== delay) return originalSetTimeout(/** @type {any} */ (callback), milliseconds, ...args);
    held = () => callback(...args);
    return handle;
  });
  globalThis.clearTimeout = /** @type {any} */ ((/** @type {any} */ value) => {
    if (value !== handle) originalClearTimeout(value);
  });
  try {
    await run(() => /** @type {() => void} */ (held)());
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

async function untilSettled(/** @type {() => boolean} */ condition) {
  for (let turn = 0; turn < 10_000 && !condition(); turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(condition(), 'the awaited condition was reached');
}

test('GitHub reads are timed per request and per acquisition with the chosen budgets', async (t) => {
  for (const [operation, acquire, perRequest, total] of [
    ['catalog', catalog, 15_000, 30_000],
    ['pack', alpha, 30_000, 120_000],
  ]) {
    await t.test(String(operation), async () => {
      const originalSetTimeout = globalThis.setTimeout;
      /** @type {number[]} */
      const delays = [];
      const { repo } = repositoryWith(CATALOG_FILES);
      try {
        globalThis.setTimeout = /** @type {any} */ ((/** @type {any} */ callback, /** @type {number} */ milliseconds, /** @type {any[]} */ ...args) => {
          delays.push(milliseconds);
          return originalSetTimeout(callback, milliseconds, ...args);
        });
        await withGitHub(repo, async ({ server }) => {
          const acquired = /** @type {any} */ (await /** @type {Function} */ (acquire)());
          await acquired.dispose();
          const long = delays.filter((delay) => delay >= 1_000);
          assert.equal(long.filter((delay) => delay === total).length, 1, 'one total deadline');
          assert.equal(long.filter((delay) => delay === perRequest).length, server.requests.length, 'one timeout per request');
          assert.equal(long.length, server.requests.length + 1, 'no other timer, so no retry or reset');
        });
      } finally {
        globalThis.setTimeout = originalSetTimeout;
      }
    });
  }
});

test('a deadline, a cancellation or a sibling failure ends every in-flight request and removes the root', async (t) => {
  /**
   * @param {(server: ReturnType<typeof githubServer>) => void} stop
   * @param {RegExp} expected
   * @param {{ failFourth?: boolean, signal?: AbortSignal }} [options]
   */
  const run = async (stop, expected, { failFourth = false, signal } = {}) => {
    const { repo } = repositoryWith(CATALOG_FILES);
    let cancelled = 0;
    let raws = 0;
    await withGitHub(repo, async ({ server, base }) => {
      const pending = acquireRemoteCatalog({ repository: SOURCE, ref: 'main', signal }).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      // Stop only once every in-flight request has been handed its response.
      await untilSettled(() => raws === 4);
      if (!failFourth) stop(server);
      // The stop itself must end the reads, not a later per-request timeout.
      /** @type {NodeJS.Timeout | undefined} */
      let late;
      const settled = await Promise.race([
        pending,
        new Promise((resolve) => { late = setTimeout(() => resolve({ late: true }), 2_000); }),
      ]);
      clearTimeout(late);
      assert.notDeepEqual(settled, { late: true }, 'the acquisition settles promptly after the stop');
      const outcome = /** @type {{ error?: Error }} */ (await pending);
      assert.ok(outcome.error, 'the acquisition rejects');
      assert.match(outcome.error.message, expected);
      assert.equal(server.of('raw').length, 4, 'no request starts after the operation ended');
      const stalled = server.of('raw').slice(0, 3).concat(failFourth ? [] : server.of('raw').slice(3));
      assert.equal(stalled.every(({ init }) => init.signal?.aborted), true, 'every in-flight request is aborted');
      assert.equal(cancelled, stalled.length, 'every in-flight body is cancelled');
      assert.deepEqual(acquisitionRoots(base), []);
    }, (request) => {
      if (request.kind !== 'raw') return undefined;
      raws += 1;
      if (failFourth && raws === 4) return response('{"message":"boom"}', 500);
      return stalledResponse(() => { cancelled += 1; });
    });
  };

  await t.test('the 30-second catalog deadline', async () => {
    await withHeldTimer(30_000, (fire) => run(() => fire(), /failed to fetch source .* the GitHub catalog acquisition did not finish within its 30-second deadline$/));
  });

  await t.test('a caller cancellation', async () => {
    const controller = new AbortController();
    await run(() => controller.abort(new Error('Canvas closed')), /the GitHub catalog acquisition was cancelled$/, { signal: controller.signal });
  });

  await t.test('one failed sibling request', async () => {
    await run(() => {}, /GitHub raw request failed with HTTP 500$/, { failFourth: true });
  });
});

test('every acquisition owns a unique temporary root until its own disposal', async () => {
  const { repo } = repositoryWith(CATALOG_FILES);
  await withGitHub(repo, async ({ base }) => {
    const [first, second, third] = await Promise.all([catalog(), alpha(), catalog()]);
    const roots = [
      path.resolve(first.catalogDir, '..', '..'),
      path.resolve(second.packDir, '..', '..', '..'),
      path.resolve(third.catalogDir, '..', '..'),
    ];
    assert.equal(new Set(roots).size, 3);
    assert.deepEqual(acquisitionRoots(base).sort(), roots.map((root) => path.basename(root)).sort());
    const secondFiles = listFiles(second.packDir);
    await first.dispose();
    await first.dispose();
    assert.equal(fs.existsSync(roots[0]), false);
    assert.deepEqual(listFiles(second.packDir), secondFiles, 'another acquisition is untouched');
    assert.equal(fs.existsSync(path.join(second.packDir, 'pack.md')), true);
    assert.equal(fs.existsSync(path.join(third.catalogDir, 'alpha', 'pack.md')), true);
    await Promise.all([second.dispose(), third.dispose()]);
    assert.deepEqual(acquisitionRoots(base), []);
  });
});

/**
 * @param {(state: { base: string, calls: Array<{ api: string, command: unknown, args: string[], options: any }> }) => Promise<void>} run
 * @param {(command: string, args: string[], options: any) => any} [spawnSync] stands in for Git
 */
async function withGitAcquisition(run, spawnSync) {
  await withTemp((base) => withFetch(/** @type {any} */ (() => assert.fail('another host is never read over HTTP')),
    () => withProcessRecorder((calls) => run({ base, calls }), spawnSync ? { spawnSync } : {})));
}

/** @param {any} options */
function assertBoundedGit(options, { capture = false } = {}) {
  assert.equal(options.killSignal, 'SIGKILL');
  assert.equal(options.windowsHide, true);
  assert.ok(options.timeout > 0 && options.timeout <= 60_000, `timeout ${options.timeout} is within the 60-second deadline`);
  assert.deepEqual(options.stdio, ['ignore', capture ? 'pipe' : 'ignore', 'ignore']);
}

const stoppedGit = (/** @type {string} */ code) => ({
  pid: 4242,
  status: null,
  signal: 'SIGKILL',
  error: Object.assign(new Error(`spawnSync git ${code}`), { code }),
  stdout: null,
  stderr: null,
  output: [null, null, null],
});

test('another host is cloned whole with its ref behavior, inside the Git deadline and output bounds', async (t) => {
  const remote = createGitRepository({
    'docs/unrelated.md': 'whole repository content\n',
    'library/packs/alpha/pack.md': manifest('alpha', 'one'),
    'library/packs/alpha/agents/a.agent.md': 'one\n',
  });
  const commits = { one: runGit(remote.dir, 'rev-parse', 'HEAD') };
  runGit(remote.dir, 'tag', 'v1.0.0');
  runGit(remote.dir, 'tag', 'v2.0.0-rc1');
  for (const [label, tag] of [['two', 'v1.2.0'], ['three', 'v1.10.0']]) {
    fs.writeFileSync(path.join(remote.dir, 'library', 'packs', 'alpha', 'pack.md'), manifest('alpha', label));
    commitAll(remote.dir, {}, label);
    commits[/** @type {'one'} */ (label)] = runGit(remote.dir, 'rev-parse', 'HEAD');
    runGit(remote.dir, 'tag', tag);
  }
  const head = runGit(remote.dir, 'rev-parse', 'HEAD');
  try {
    await t.test('a branch is a shallow clone of the whole repository at its current commit', async () => {
      await withGitAcquisition(async ({ base, calls }) => {
        const acquired = await acquireRemoteCatalog({ repository: remote.url, ref: 'main' });
        try {
          assert.deepEqual(acquired.sourceIdentity, { type: 'remote', repository: remote.url, requested_ref: 'main', resolved_commit: head });
          const checkout = path.resolve(acquired.catalogDir, '..', '..');
          assert.equal(path.basename(checkout), 'repo');
          assert.equal(path.dirname(path.dirname(checkout)), base);
          // Git applies the user's checkout settings (such as core.autocrlf), as the clone always has.
          assert.equal(fs.readFileSync(path.join(checkout, 'docs', 'unrelated.md'), 'utf8').replace(/\r\n/g, '\n'), 'whole repository content\n');
          // Seen through the module's live spawnSync binding, which the catalog helper's stop gate also wraps.
          assert.deepEqual(calls.map(({ api, command, args }) => [api, command, ...args]), [
            ['spawnSync', 'git', 'clone', '--quiet', '--depth=1', '--branch', 'main', '--', remote.url, checkout],
            ['spawnSync', 'git', 'rev-parse', '--verify', 'HEAD^{commit}'],
          ]);
          assertBoundedGit(calls[0].options);
          assertBoundedGit(calls[1].options, { capture: true });
          assert.equal(calls[1].options.cwd, checkout);
          assert.equal(calls[1].options.maxBuffer, MIB);
        } finally {
          await acquired.dispose();
        }
        assert.deepEqual(acquisitionRoots(base), []);
      });
    });

    await t.test('a tag is cloned shallowly and a full commit falls back to a full clone and checkout', async () => {
      await withGitAcquisition(async ({ calls }) => {
        const tagged = await acquireRemotePack({ repository: remote.url, ref: 'v1.0.0', name: 'alpha' });
        try {
          assert.equal(tagged.sourceIdentity.resolved_commit, commits.one);
          assert.match(fs.readFileSync(path.join(tagged.packDir, 'pack.md'), 'utf8'), /description: "one"/);
          assert.equal(path.basename(path.resolve(tagged.packDir, '..', '..', '..')), 'repo');
        } finally {
          await tagged.dispose();
        }
        calls.length = 0;
        const pinned = await acquireRemoteCatalog({ repository: remote.url, ref: commits.two });
        try {
          assert.deepEqual(pinned.sourceIdentity, { type: 'remote', repository: remote.url, requested_ref: commits.two, resolved_commit: commits.two });
          assert.deepEqual(calls.map(({ args }) => args[0]), ['clone', 'clone', 'checkout', 'rev-parse']);
          assert.deepEqual(calls[1].args.slice(0, -1), ['clone', '--quiet', '--', remote.url]);
          assert.deepEqual(calls[2].args, ['checkout', '--quiet', commits.two]);
          for (const call of calls) assertBoundedGit(call.options, { capture: call.args[0] === 'rev-parse' });
        } finally {
          await pinned.dispose();
        }
      });
    });

    await t.test('latest selects the highest stable tag from git ls-remote, within the shared output budget', async () => {
      await withGitAcquisition(async ({ calls }) => {
        const acquired = await acquireRemoteCatalog({ repository: remote.url, ref: 'latest' });
        try {
          assert.deepEqual(acquired.sourceIdentity, { type: 'remote', repository: remote.url, requested_ref: 'latest', resolved_commit: commits.three });
          assert.deepEqual(calls[0].args, ['ls-remote', '--tags', '--refs', '--', remote.url]);
          assertBoundedGit(calls[0].options, { capture: true });
          assert.equal(calls[0].options.maxBuffer, MIB);
          assert.deepEqual(calls[1].args.slice(0, 6), ['clone', '--quiet', '--depth=1', '--branch', 'v1.10.0', '--']);
          const listing = realSpawnSync('git', ['ls-remote', '--tags', '--refs', remote.url], { encoding: 'buffer' }).stdout;
          assert.equal(calls[2].options.maxBuffer, MIB - listing.length, 'captured output is charged across the acquisition');
        } finally {
          await acquired.dispose();
        }
      });
    });

    await t.test('missing packs, catalogs, releases and remotes are explicit and remove the root', async () => {
      const bare = createGitRepository({ 'README.md': 'no catalog\n' });
      runGit(bare.dir, 'tag', 'v3.0.0-rc1');
      try {
        const missingRemote = pathToFileURL(path.join(remote.parent, 'missing')).href;
        for (const [acquire, expected] of [
          [() => acquireRemotePack({ repository: remote.url, ref: 'main', name: 'omega' }), `pack "omega" not found in source ${remote.url} @ main`],
          [() => acquireRemoteCatalog({ repository: bare.url, ref: 'main' }), `no pack catalog found in ${bare.url} @ main`],
          [() => acquireRemoteCatalog({ repository: bare.url, ref: 'latest' }), `no releases published yet at ${bare.url} (channel: latest)`],
          [() => acquireRemoteCatalog({ repository: missingRemote, ref: 'main' }), `failed to fetch source ${missingRemote} @ main`],
        ]) {
          await withGitAcquisition(async ({ base }) => {
            const error = await rejection(/** @type {Function} */ (acquire)());
            assert.equal(error.message, expected);
            assert.deepEqual(acquisitionRoots(base), []);
          });
        }
      } finally {
        fs.rmSync(bare.parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    });

    await t.test('an exhausted deadline starts no fallback clone', async () => {
      const realNow = Date.now;
      let offset = 0;
      Date.now = () => realNow() + offset;
      try {
        await withGitAcquisition(async ({ base, calls }) => {
          const error = await rejection(acquireRemoteCatalog({ repository: remote.url, ref: commits.one }));
          assert.equal(error.message, `failed to fetch source ${remote.url} @ ${commits.one}: Git did not finish within the 60-second acquisition deadline`);
          assert.deepEqual(calls.map(({ args }) => args.slice(0, 3)), [['clone', '--quiet', '--depth=1']], 'the fallback never starts');
          assert.deepEqual(acquisitionRoots(base), [], 'the shallow attempt exited, so its root is removed');
        }, (command, args, options) => {
          const result = realSpawnSync(command, args, options);
          offset = 61_000;
          return result;
        });
      } finally {
        Date.now = realNow;
      }
    });

    for (const [name, stopAt, ref, expected] of [
      ['a deadline kill', '--depth=1', 'main', /Git did not finish within the 60-second acquisition deadline; its process tree could not be confirmed stopped, so its temporary material was kept at /],
      ['an output-bound kill', 'ls-remote', 'latest', /Git wrote more than the 1048576-byte \(1 MiB\) output limit; its process tree could not be confirmed stopped, so its temporary material was kept at /],
    ]) {
      await t.test(`${name} keeps and reports its material instead of removing it`, async () => {
        await withGitAcquisition(async ({ base, calls }) => {
          const error = await rejection(acquireRemoteCatalog({ repository: remote.url, ref: /** @type {string} */ (ref) }));
          assert.match(error.message, /** @type {RegExp} */ (expected));
          const roots = acquisitionRoots(base);
          assert.equal(roots.length, 1, 'the root is kept');
          assert.ok(error.message.endsWith(path.join(base, roots[0])), 'the message names the kept root');
          assert.equal(calls.length, 1, 'nothing more runs after a stopped Git');
        }, (command, args, options) => (args.includes(/** @type {string} */ (stopAt))
          ? stoppedGit(stopAt === 'ls-remote' ? 'ENOBUFS' : 'ETIMEDOUT')
          : realSpawnSync(command, args, options)));
      });
    }

    await t.test('a cancellation after a failed shallow attempt prevents the fallback clone', async () => {
      const controller = new AbortController();
      await withGitAcquisition(async ({ base, calls }) => {
        const error = await rejection(acquireRemoteCatalog({ repository: remote.url, ref: commits.one, signal: controller.signal }));
        assert.equal(error.message, `failed to fetch source ${remote.url} @ ${commits.one}: the acquisition was cancelled`);
        assert.equal(calls.length, 1);
        assert.deepEqual(acquisitionRoots(base), []);
      }, (command, args, options) => {
        const result = realSpawnSync(command, args, options);
        controller.abort(new Error('Canvas closed'));
        return result;
      });
    });

    await t.test('missing Git is reported as such', async () => {
      await withGitAcquisition(async ({ base }) => {
        const error = await rejection(acquireRemoteCatalog({ repository: remote.url, ref: 'main' }));
        assert.equal(error.message, 'git is required to fetch a pack from a remote source');
        assert.deepEqual(acquisitionRoots(base), []);
      }, () => ({ pid: 0, status: null, signal: null, error: Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' }), output: null, stdout: null, stderr: null }));
    });
  } finally {
    fs.rmSync(remote.parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

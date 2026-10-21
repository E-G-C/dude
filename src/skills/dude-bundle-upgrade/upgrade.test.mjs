// @ts-check
/**
 * The staged bundle upgrade against real tagged fixture upstreams built from
 * the current source. One upstream carries an older release (v8.0.0), the
 * target release (v9.0.0, an annotated tag), and tagged target variants;
 * consumers are disposable copies of the older release with installed packs.
 * Every engine run is the consumer's installed `upgrade.mjs`, as chat runs it,
 * with its own temporary folder, so each retained or released prepared result
 * can be observed exactly.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getEventListeners } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import childProcess, { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRelease } from '../../../scripts/build-release.mjs';
import { cmdAdd, readProfile } from '../dude-compose/compose.mjs';
import { loadAgentModelConfig } from '../dude-engine/lib/agent-model-map.mjs';
import { parseAgentSource, renderCopilotAgent } from '../dude-engine/lib/agent-projection.mjs';
import {
  parseDevelopmentBaseRelease,
  renderDevelopmentBaseRelease,
  validateDevelopmentBaseRelease,
} from '../dude-engine/lib/development-base-release.mjs';
import { enumerateCorePaths } from '../dude-engine/lib/ownership.mjs';
import { normalizeString } from '../dude-engine/lib/text.mjs';
import { applyUpgrade, composeEnvironment, composeStopWindowMs, discardUpgrade, prepareUpgrade, scanCoreInventoryPaths } from './upgrade.mjs';
import {
  ACQUISITION_DEADLINE_MS,
  checkSourceAddress,
  compareReleaseTags,
  foregroundGitEnvironment,
  githubReleaseUrl,
  isCheckableWindowsGit,
  isDeploymentPath,
  isGitHubHost,
  isRemoteAddress,
  observeRoot,
  releaseCheckCommand,
} from './lib/release-source.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENGINE = '.github/skills/dude-bundle-upgrade/upgrade.mjs';
const LINT = '.github/skills/dude-lint/lint.mjs';
const MANIFEST = '.dude/metadata/bundle-manifest.md';
const PROFILE = '.dude/metadata/profile.md';
const LOG = '.dude/metadata/upgrade-log.md';
const BASE_RELEASE = '.dude/metadata/development-base-release.md';
const UPSTREAM_REPOSITORY = 'https://github.com/E-G-C/dude';
// What the older release (v8.0.0) has that the target (v9.0.0) changes.
const REPLACED = Object.freeze([
  '.github/agents/dude.agent.md',
  '.github/extensions/dude/ui/review/NOTICE.txt',
  '.github/skills/dude-bundle-import/lib/import-frontmatter.mjs',
]);
const ADDED = Object.freeze([
  '.github/extensions/dude/ui/review/styles.css',
  '.github/skills/dude-bundle-import/lib/directory-risk.mjs',
]);
const RETIRED = Object.freeze(['.github/skills/dude-retired/SKILL.md', '.github/skills/dude-retired/reference/notes.md']);
// A consumer-only difference: a checkout that converted the instructions to CRLF.
const CRLF_INSTRUCTIONS = '.github/instructions/dude.instructions.md';
const ALPHA = Object.freeze({
  helper: '.github/agents/dude-pack-alpha-helper.agent.md',
  worker: '.github/agents/dude-pack-alpha-worker.agent.md',
  legacy: '.github/instructions/dude-pack-alpha-legacy.instructions.md',
  notes: '.github/skills/dude-pack-alpha-notes/SKILL.md',
  detail: '.github/skills/dude-pack-alpha-notes/reference/detail.md',
});
const UNRELATED = Object.freeze({
  'README.md': '# Consumer project\n',
  'docs/notes.md': 'project notes\n',
  'src/extensions/dude/keep.mjs': 'export const projectSource = true;\n',
  '.dude/memory/context.md': '# Context\n\n- The consumer keeps its own memory.\n',
  '.github/skills/dude-local-mine/SKILL.md': '---\nname: "dude-local-mine"\ndescription: "Use when testing a project-local fixture skill."\n---\n\n# Mine\n',
  '.github/skills/project/SKILL.md': '---\nname: "project"\ndescription: "Consumer project knowledge, customized."\n---\n\n# Project\n',
  '.github/extensions/other/keep.txt': 'another extension tree\n',
});
const STALE_RECORD = renderDevelopmentBaseRelease({ source_repo: 'https://example.invalid/old-dude', base_release: 'v7.0.0' });
// What the permission variants (perm, perm-lint) make executable (Git mode
// 100755): a core script the update adds, a core script that a consumer may
// already have, an alpha pack script, and a core file whose mode alone changes.
const CORE_SCRIPT = Object.freeze({
  added: '.github/skills/dude-compose/scripts/added.sh',
  existing: '.github/skills/dude-compose/scripts/existing.sh',
});
const PACK_SCRIPT = '.github/skills/dude-pack-alpha-notes/scripts/check.sh';
const PACK_SCRIPT_SOURCE = 'library/packs/alpha/skills/dude-pack-alpha-notes/scripts/check.sh';
const MODE_ONLY = '.github/skills/dude-lint/SKILL.md';
const POSIX_ONLY = process.platform === 'win32'
  && 'Windows has no POSIX file permissions, so the upgrade records and changes none there';
const LEGACY_ENGINE = '#!/usr/bin/env node\n// An upgrade engine from before staged upgrades: it has no staging contract.\nprocess.exit(40);\n';
// A target engine whose pack preparation could not confirm that a process it
// started has stopped, as the real engine reports such a failure.
const UNCONFIRMED_ENGINE = `export const UPGRADE_STAGING_CONTRACT = 1;
import fs from 'node:fs';
import path from 'node:path';
export async function stageUpgrade({ preparedRoot }) {
  fs.writeFileSync(path.join(preparedRoot, 'still-in-use.txt'), 'a process may still write here\\n');
  throw Object.assign(new Error('pack "alpha" could not be prepared: its process tree could not be confirmed stopped'),
    { reason: 'pack-failed', pack: 'alpha', cleanupConfirmed: false });
}
export async function applyPreparedUpgrade() {
  throw new Error('never prepared');
}
`;
// The lint-script variant's own linter: its report follows the project's
// lint-scenario.txt and whether the update it belongs to is in place. Beside
// the project, each run also records those two facts and whether the apply had
// already reported its bundle check (see `lintRuns`).
const SCRIPTED_LINT = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
let scenario = '';
try { scenario = fs.readFileSync(path.join(root, 'lint-scenario.txt'), 'utf8').trim(); } catch {}
const updated = fs.existsSync(path.join(root, '.github/skills/dude-marker/SKILL.md'));
const beside = path.dirname(root);
fs.appendFileSync(path.join(beside, 'lint-runs.log'),
  (updated ? 'after' : 'before') + (fs.existsSync(path.join(beside, 'checking-reported')) ? ' reported' : ' unreported') + '\\n');
const before = { existing: ['A'], new: [], duplicate: ['A'], replacement: ['A'] };
const after = { existing: ['A'], new: ['B'], duplicate: ['A', 'A'], replacement: ['B'] };
if (scenario === 'crash-before' || (scenario === 'crash-after' && updated)) {
  process.exitCode = 3;
} else if (scenario === 'unreadable-after' && updated) {
  console.log('[FAIL]  fixture failure B');
  console.log('[INFO]  Findings: 0 warning(s), 0 failure(s)');
} else if (scenario === 'oversized-after' && updated) {
  process.stdout.write('x'.repeat(17 * 1024 * 1024));
} else {
  const failures = (updated ? after : before)[scenario] ?? [];
  for (const failure of failures) console.log('[FAIL]  fixture failure ' + failure);
  console.log('[INFO]  Findings: 0 warning(s), ' + failures.length + ' failure(s)');
  process.exitCode = failures.length > 0 ? 1 : 0;
}
`;
const NO_CHANGES = Object.freeze({ added: 0, replaced: 0, removed: 0 });
// A target release's Compose that, run as the staging function's child,
// records the prompt and temporary-folder variables it was given, none of
// which is a credential, and then waits to be stopped. Imported, it is the
// real Compose, renamed beside it.
const STALLED_COMPOSE = `export * from './compose-real.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const names = ['GIT_TERMINAL_PROMPT', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GCM_INTERACTIVE', 'TMPDIR', 'TMP', 'TEMP'];
  const record = path.join(process.env.TMP, 'compose-environment.json');
  fs.writeFileSync(record + '.partial', JSON.stringify({ pid: process.pid, ...Object.fromEntries(names.map((name) => [name, process.env[name] ?? null])) }));
  fs.renameSync(record + '.partial', record);
  setInterval(() => {}, 1_000);
}
`;

/** Every root this file creates; removed once its tests finish. */
const ownedRoots = /** @type {string[]} */ ([]);
after(() => {
  for (const root of ownedRoots) fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/* --------------------------------------------------------------- helpers */

/** @param {string} a @param {string} b */
const codeUnitCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** @param {string} value */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The folder a prepared ID names: its first 16 hex digits. @param {string} id */
const preparedFolder = (id) => `dude-up-${id.slice(0, 16)}`;
/** A retained description, as the installed engine hands it to the target. @param {string} preparedRoot */
const description = (preparedRoot) => JSON.parse(fs.readFileSync(path.join(preparedRoot, 'prepared.json'), 'utf8'));

/**
 * Wait for a condition this process observes.
 * @param {() => boolean} condition
 * @param {number} timeoutMs
 * @param {string} label
 */
async function until(condition, timeoutMs, label) {
  const deadline = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() > deadline) assert.fail(`timed out waiting until ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Make a folder's contents impossible to remove until the returned release
 * runs: on Windows a process holds it as its working directory, elsewhere the
 * folder is made read-only.
 * @param {string} directory
 * @returns {Promise<() => Promise<void>>}
 */
async function holdRemoval(directory) {
  if (process.platform !== 'win32') {
    fs.chmodSync(directory, 0o555);
    return async () => fs.chmodSync(directory, 0o755);
  }
  const holder = spawn(process.execPath, ['-e', 'process.stdout.write("held"); setInterval(() => {}, 1000);'], {
    cwd: directory,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.once('data', resolve);
  });
  return async () => {
    const closed = new Promise((resolve) => holder.once('close', resolve));
    holder.kill();
    await closed;
  };
}

/** @param {string} cwd @param {...string} args */
function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} in ${cwd}\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

/** Raw blob bytes, without checkout conversion. @param {string} cwd @param {string} spec */
function gitBlob(cwd, spec) {
  const result = spawnSync('git', ['cat-file', 'blob', spec], { cwd });
  assert.equal(result.status, 0, `git cat-file blob ${spec}: ${String(result.stderr)}`);
  return /** @type {Buffer} */ (result.stdout);
}

/** @param {string} root @param {string} relativePath @param {string | Buffer} content */
function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** @param {string} root @param {string} relativePath */
function read(root, relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split('/')));
}

/** @param {string} root @param {string} relativePath */
function exists(root, relativePath) {
  return fs.existsSync(path.join(root, ...relativePath.split('/')));
}

/** @param {string} root */
function initRepository(root) {
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Upgrade Fixture');
  git(root, 'config', 'user.email', 'upgrade-fixture@example.invalid');
  git(root, 'config', 'core.autocrlf', 'false');
}

/** @param {string} root @param {string} message */
function commitAll(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

/** @param {string} root @param {string} sourceRepo @param {string} sourceRef @param {string} installedRef */
function writeManifest(root, sourceRepo, sourceRef, installedRef) {
  const current = read(root, MANIFEST).toString('utf8');
  const json = JSON.stringify({ source_repo: sourceRepo, source_ref: sourceRef, installed_ref: installedRef }, null, 2);
  write(root, MANIFEST, current.replace(/```json\n[\s\S]*?\n```/, `\`\`\`json\n${json}\n\`\`\``));
}

/** @param {string} root */
function manifestData(root) {
  return JSON.parse(/** @type {string[]} */ (/```json\n([\s\S]*?)\n```/.exec(read(root, MANIFEST).toString('utf8')))[1]);
}

/** @param {string} root @returns {Map<string, string>} every non-Git file and its SHA-256 */
function snapshot(root) {
  /** @type {Map<string, string>} */
  const files = new Map();
  /** @param {string} relativeDirectory */
  const walk = (relativeDirectory) => {
    const absolute = path.join(root, ...relativeDirectory.split('/').filter(Boolean));
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (relativePath === '.git') continue;
      if (entry.isSymbolicLink()) files.set(relativePath, `link:${fs.readlinkSync(path.join(absolute, entry.name))}`);
      else if (entry.isDirectory()) walk(relativePath);
      else files.set(relativePath, createHash('sha256').update(fs.readFileSync(path.join(absolute, entry.name))).digest('hex'));
    }
  };
  walk('');
  return files;
}

/** HEAD, branch, index, staged paths, tags, and branches: what an upgrade must never move. @param {string} root */
function gitState(root) {
  return {
    head: git(root, 'rev-parse', 'HEAD'),
    branch: git(root, 'symbolic-ref', '--short', 'HEAD'),
    index: createHash('sha256').update(git(root, 'ls-files', '-s')).digest('hex'),
    staged: git(root, 'diff', '--cached', '--name-only'),
    tags: git(root, 'tag', '--list'),
    branches: git(root, 'branch', '--list', '--format=%(refname)'),
  };
}
/**
 * `base` with `variables` set, replacing a variable of the same name in any
 * case, as Windows reads names.
 * @param {NodeJS.ProcessEnv} base
 * @param {Record<string, string>} variables
 */
function withVariables(base, variables) {
  const names = new Set(Object.keys(variables).map((name) => name.toUpperCase()));
  return { ...Object.fromEntries(Object.entries(base).filter(([name]) => !names.has(name.toUpperCase()))), ...variables };
}

/** @param {{ root: string, tmp: string, env?: Record<string, string> }} consumer */
function consumerEnv(consumer) {
  return withVariables(process.env, { ...consumer.env, TMPDIR: consumer.tmp, TEMP: consumer.tmp, TMP: consumer.tmp });
}

/**
 * Run the consumer's installed engine with its own temporary folder.
 * @param {{ root: string, tmp: string, env?: Record<string, string> }} consumer
 * @param {...string} args
 */
function upgrade(consumer, ...args) {
  return spawnSync(process.execPath, [path.join(consumer.root, ...ENGINE.split('/')), ...args], {
    cwd: consumer.root,
    encoding: 'utf8',
    env: consumerEnv(consumer),
  });
}

/**
 * @param {{ root: string, tmp: string }} consumer
 * @param {...string} args
 * @returns {{ code: number | null, json: any, stderr: string }}
 */
function upgradeJson(consumer, ...args) {
  const result = upgrade(consumer, ...args, '--format', 'json');
  let json;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    assert.fail(`expected JSON from ${args.join(' ')} (exit ${result.status}):\n${result.stdout}${result.stderr}`);
  }
  return { code: result.status, json, stderr: result.stderr };
}

/**
 * The same run without blocking this process, so a server here can answer.
 * @param {{ root: string, tmp: string, env?: Record<string, string> }} consumer
 * @param {...string} args
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, ms: number }>}
 */
function upgradeAsync(consumer, ...args) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [path.join(consumer.root, ...ENGINE.split('/')), ...args], {
      cwd: consumer.root,
      env: consumerEnv(consumer),
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: performance.now() - started }));
  });
}

/**
 * A Git daemon address that accepts connections and never answers. It reads
 * and discards what a client sends: on POSIX a stopped client's connection
 * close is seen only after its unread request.
 */
async function silentGitServer() {
  /** @type {Set<net.Socket>} */
  const sockets = new Set();
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.resume();
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const { port } = /** @type {net.AddressInfo} */ (server.address());
  return {
    address: `git://127.0.0.1:${port}/dude.git`,
    port,
    get connections() {
      return connections;
    },
    /** Connections still open: a stopped client process closes its own. */
    get open() {
      return sockets.size;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}

/** Request headers Git sends by itself; any other one was configured. */
const GIT_REQUEST_HEADERS = new Set(['host', 'user-agent', 'accept', 'accept-encoding', 'accept-language', 'pragma', 'git-protocol']);
const CREDENTIAL_HEADERS = Object.freeze(['authorization', 'proxy-authorization', 'cookie']);

/**
 * @typedef {(request: http.IncomingMessage, response: http.ServerResponse) => void} Answer
 */

/**
 * A loopback HTTP peer for the release check's credential tests, answering as
 * its current `answer` says. Of each request it keeps only which credential
 * headers arrived and the names of headers Git does not send by itself: it
 * never keeps, prints, or writes a header value.
 */
async function recordingPeer() {
  /** @type {{ credentials: string[], configured: string[] }[]} */
  const requests = [];
  let connections = 0;
  const peer = {
    /** @type {Answer} */
    answer: (_request, response) => {
      response.writeHead(404);
      response.end();
    },
    requests,
    url: '',
    origin: '',
    get connections() {
      return connections;
    },
    /** Every credential header and configured header name that some request carried, sorted. */
    carried() {
      return [...new Set(requests.flatMap((request) => [...request.credentials, ...request.configured]))].sort();
    },
    reset() {
      requests.length = 0;
      connections = 0;
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
  const server = http.createServer((request, response) => {
    const names = new Set(request.rawHeaders.filter((_, index) => index % 2 === 0).map((name) => name.toLowerCase()));
    requests.push({
      credentials: CREDENTIAL_HEADERS.filter((name) => names.has(name)),
      configured: [...names].filter((name) => !GIT_REQUEST_HEADERS.has(name) && !CREDENTIAL_HEADERS.includes(name)).sort(),
    });
    peer.answer(request, response);
  });
  server.on('connection', () => {
    connections += 1;
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  peer.origin = `http://127.0.0.1:${/** @type {net.AddressInfo} */ (server.address()).port}`;
  peer.url = `${peer.origin}/dude.git`;
  return peer;
}

/** Git's dumb-protocol ref listing with one newer release, also through a proxy. @type {Answer} */
const listing = (request, response) => {
  if (String(request.url).endsWith('/info/refs?service=git-upload-pack')) {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(`${'1'.repeat(40)}\trefs/tags/v9.0.0\n`);
  } else {
    response.writeHead(404);
    response.end();
  }
};
/** @param {string} scheme @returns {Answer} */
const challenge = (scheme) => (_request, response) => {
  response.writeHead(401, { 'www-authenticate': scheme });
  response.end();
};
/** @param {string} location @returns {Answer} */
const redirect = (location) => (_request, response) => {
  response.writeHead(302, { location });
  response.end();
};

/**
 * The user's side of a credential test, all of it disposable and none of it
 * the maintainer's: a home with `.netrc` and `_netrc` logins and a cookie
 * file; a global file with a credential helper that leaves a mark when it
 * runs, a configured header, the cookie file, and a client certificate; a
 * replacement system file with a configured `Authorization` header; the
 * environment's own configuration carriers and client certificate; and, when
 * `proxy` is given, proxy variables and `http.proxy`. Every configured header
 * names its carrier.
 * @param {string} folder
 * @param {{ proxy?: string }} [options]
 */
function credentialSeeds(folder, { proxy } = {}) {
  const home = path.join(folder, 'home');
  /** @param {string} name a path in the home, with forward slashes for Git and sh */
  const inHome = (name) => path.join(home, name).split(path.sep).join('/');
  write(home, '.netrc', 'machine 127.0.0.1 login dude-dummy password dude-dummy-netrc\n');
  write(home, '_netrc', 'machine 127.0.0.1 login dude-dummy password dude-dummy-netrc\n');
  write(home, 'cookies.txt', '# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tdude_seeded\tdude-dummy-cookie\n');
  write(home, '.gitconfig', [
    '[credential]',
    `\thelper = "!f() { echo ran > '${inHome('helper-ran')}'; echo username=dude-dummy; echo password=dude-dummy-helper; }; f"`,
    '[http]',
    '\textraHeader = X-Dude-Global: dude-dummy',
    `\tcookieFile = ${inHome('cookies.txt')}`,
    `\tsslCert = ${inHome('client.pem')}`,
    `\tsslKey = ${inHome('client.key')}`,
    ...(proxy ? [`\tproxy = ${proxy}`] : []),
    '',
  ].join('\n'));
  write(home, 'system.gitconfig', '[http]\n\textraHeader = X-Dude-System: dude-dummy\n\textraHeader = Authorization: Basic dude-dummy-system\n');
  return {
    home,
    helperRan: () => fs.existsSync(path.join(home, 'helper-ran')),
    /** @type {Record<string, string>} */
    env: {
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
      GIT_CONFIG_SYSTEM: path.join(home, 'system.gitconfig'),
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_VALUE_0: 'X-Dude-Count: dude-dummy',
      GIT_CONFIG_PARAMETERS: "'http.extraheader=X-Dude-Parameters: dude-dummy'",
      GIT_SSL_CERT: path.join(home, 'client.pem'),
      GIT_SSL_KEY: path.join(home, 'client.key'),
      ...(proxy ? { http_proxy: proxy, https_proxy: proxy, all_proxy: proxy } : {}),
    },
  };
}

/**
 * The same seeds without any system file: no system-level helper can run.
 * @param {Record<string, string>} env
 */
function withoutSystemFile(env) {
  const { GIT_CONFIG_SYSTEM: _system, ...rest } = env;
  return { ...rest, GIT_CONFIG_NOSYSTEM: '1' };
}

/**
 * A Windows process-table row. Process ID plus creation time is a process's
 * exact identity: Windows reuses process IDs, and a process keeps the ID of a
 * parent that has ended.
 * @typedef {{ pid: number, ppid: number, created: string, name: string, commandLine: string | null }} ProcessRow
 */

/** @returns {Promise<ProcessRow[]>} */
function processTable() {
  const script = 'Get-CimInstance Win32_Process | ForEach-Object {'
    + ' $created = if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 };'
    + ' [pscustomobject]@{pid=$_.ProcessId;ppid=$_.ParentProcessId;created=$created.ToString();'
    + 'name=$_.Name;commandLine=$_.CommandLine} | ConvertTo-Json -Compress }';
  return new Promise((resolve, reject) => {
    childProcess.execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)));
      });
  });
}

/**
 * A process and every process it started, parents first, by exact identity.
 * @param {ProcessRow[]} rows
 * @param {ProcessRow} root
 */
function processTree(rows, root) {
  const tree = [root];
  for (let index = 0; index < tree.length; index += 1) {
    const parent = tree[index];
    // A process that only reuses an ended parent's ID is older than that parent.
    tree.push(...rows.filter((row) => row.ppid === parent.pid && row.pid !== parent.pid
      && BigInt(row.created) >= BigInt(parent.created)));
  }
  return tree;
}

/**
 * The recorded processes still running once a bound has passed, by exact identity.
 * @param {ProcessRow[]} recorded
 * @param {number} [boundMs]
 */
async function survivors(recorded, boundMs = 3_000) {
  const deadline = performance.now() + boundMs;
  for (;;) {
    const rows = await processTable();
    const running = recorded.filter((member) => rows.some((row) => row.pid === member.pid && row.created === member.created));
    if (running.length === 0 || performance.now() >= deadline) return running;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Whether a process with this ID still runs. @param {number} pid */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stand in for every taskkill call production makes through child_process,
 * whose named export is synchronized with the default export it replaces;
 * other commands pass through. `decide` runs the real taskkill or reports a
 * failed one.
 * @param {(run: () => void, fail: () => void) => void} decide
 */
function replaceTaskkill(decide) {
  const original = childProcess.execFile;
  /** @type {string[][]} */
  const calls = [];
  childProcess.execFile = /** @type {any} */ (/** @this {any} */ function (/** @type {any[]} */ ...args) {
    const [file, commandArgs, options, callback] = args;
    if (file !== 'taskkill') return Reflect.apply(original, this, args);
    calls.push([...commandArgs]);
    decide(
      () => { Reflect.apply(original, this, [file, commandArgs, options, callback]); },
      () => callback(Object.assign(new Error(`Command failed: taskkill ${commandArgs.join(' ')}`), { code: 1 }), '', ''),
    );
    return undefined;
  });
  syncBuiltinESMExports();
  return {
    calls,
    restore() {
      childProcess.execFile = original;
      syncBuiltinESMExports();
    },
  };
}

/** @param {string} name @param {string} role @param {string} version */
function packAgent(name, role, version) {
  return [
    '---',
    `name: "${name} ${role}"`,
    `description: "Fixture ${name} ${role}."`,
    'tools: ["read"]',
    'user-invocable: false',
    'model-class: balanced',
    '---',
    '',
    `You are the ${name} ${role} (${version}).`,
    '',
    '## Scope',
    '',
    'Fixture work only.',
    '',
    '**Coordinator-only artifacts:** none.',
    '',
  ].join('\n');
}

/**
 * Write one catalog pack under `<root>/library/packs/<name>`.
 * @param {string} root
 * @param {string} name
 * @param {string} version
 * @param {{ helper?: boolean, legacy?: boolean, nested?: boolean }} [shape]
 */
function writePack(root, name, version, shape = {}) {
  const directory = `library/packs/${name}`;
  fs.rmSync(path.join(root, ...directory.split('/')), { recursive: true, force: true });
  write(root, `${directory}/pack.md`, `---\nname: ${name}\ndescription: "Fixture ${name} pack."\n---\n\n# ${name}\n`);
  write(root, `${directory}/agents/dude-pack-${name}-worker.agent.md`, packAgent(name, 'worker', version));
  if (shape.helper) write(root, `${directory}/agents/dude-pack-${name}-helper.agent.md`, packAgent(name, 'helper', version));
  write(
    root,
    `${directory}/skills/dude-pack-${name}-notes/SKILL.md`,
    `---\nname: "dude-pack-${name}-notes"\ndescription: "Use when reading the ${name} fixture notes."\n---\n\n# Notes (${version})\n`,
  );
  if (shape.nested) write(root, `${directory}/skills/dude-pack-${name}-notes/reference/detail.md`, `# Detail (${version})\n`);
  if (shape.legacy) write(root, `${directory}/instructions/dude-pack-${name}-legacy.instructions.md`, `# Legacy ${name} guidance (${version})\n`);
}

/**
 * @typedef {{
 *   root: string,
 *   upstream: string,
 *   source: string,
 *   commits: { v8: string, v9: string, main: string },
 *   template: string,
 *   tags: string,
 *   prereleaseOnly: string,
 * }} Fixture
 */

/** @type {Promise<Fixture> | undefined} */
let sharedFixture;
/** The shared upstreams and consumer template, built once. */
const fixture = () => (sharedFixture ??= buildFixture());

/** @returns {Promise<Fixture>} */
async function buildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-ut-'));
  ownedRoots.push(root);
  const upstream = path.join(root, 'up');
  const source = pathToFileURL(upstream).href;

  // The target core is the current release; the older release differs from it.
  buildRelease({ repoRoot: REPO_ROOT, outDir: upstream, ref: '' });
  const target = new Map([...REPLACED, ...ADDED].map((relativePath) => [relativePath, read(upstream, relativePath)]));
  for (const relativePath of REPLACED) {
    write(upstream, relativePath, Buffer.concat([/** @type {Buffer} */ (target.get(relativePath)), Buffer.from('\n// older release fixture\n')]));
  }
  for (const relativePath of ADDED) fs.rmSync(path.join(upstream, ...relativePath.split('/')));
  write(upstream, RETIRED[0], '---\nname: "dude-retired"\ndescription: "Use when testing a retired fixture skill."\n---\n\n# Retired\n');
  write(upstream, RETIRED[1], '# Retired notes\n');
  writePack(upstream, 'alpha', 'v8', { legacy: true });
  writePack(upstream, 'beta', 'stable');
  initRepository(upstream);
  const v8 = commitAll(upstream, 'release v8');
  git(upstream, 'tag', 'v8.0.0');

  // The consumer template: the older release with packs and project content.
  const template = path.join(root, 'template');
  fs.cpSync(upstream, template, {
    recursive: true,
    filter: (from) => !['.git', 'library'].includes(path.relative(upstream, from).split(path.sep)[0]),
  });
  writeManifest(template, source, 'latest', 'v8.0.0');
  write(template, LOG, '# Upgrade Log\n');
  write(template, BASE_RELEASE, STALE_RECORD);
  write(template, CRLF_INSTRUCTIONS, read(template, CRLF_INSTRUCTIONS).toString('utf8').replace(/\n/g, '\r\n'));
  for (const [relativePath, content] of Object.entries(UNRELATED)) write(template, relativePath, content);
  writePack(template, 'delta', 'local');
  writePack(template, 'alpha', 'project library copy', { helper: true, nested: true });

  const foreign = path.join(root, 'fx');
  writePack(foreign, 'gamma', 'v1');
  initRepository(foreign);
  commitAll(foreign, 'gamma');
  git(foreign, 'tag', 'v1.0.0');
  const library = path.join(template, 'library', 'packs');
  for (const [name, packSource, ref] of [['alpha', source, 'v8.0.0'], ['beta', source, 'v8.0.0'], ['gamma', pathToFileURL(foreign).href, 'v1.0.0']]) {
    const added = await cmdAdd({ root: template, library, name, source: packSource, ref, force: false });
    assert.equal(added.ok, true, `${name}: ${added.error}`);
  }
  const delta = await cmdAdd({ root: template, library, name: 'delta', force: false });
  assert.equal(delta.ok, true, delta.error);
  initRepository(template);
  commitAll(template, 'consumer on v8.0.0');
  const lint = spawnSync(process.execPath, [path.join(template, ...LINT.split('/')), template], { encoding: 'utf8' });
  assert.equal(lint.status, 0, `the consumer template must start lint-clean:\n${lint.stdout}`);

  // The target release: an annotated v9.0.0 tag, with a later prerelease tag.
  for (const [relativePath, bytes] of target) write(upstream, relativePath, bytes);
  fs.rmSync(path.join(upstream, '.github/skills/dude-retired'), { recursive: true });
  writePack(upstream, 'alpha', 'v9', { helper: true, nested: true });
  const v9 = commitAll(upstream, 'release v9');
  git(upstream, 'tag', '-a', 'v9.0.0', '-m', 'Release v9.0.0');
  git(upstream, 'tag', 'v10.0.0-rc1');

  // Target variants, each one commit after v9.0.0 under its own tag.
  /** @param {string} tag @param {() => void} change */
  const variant = (tag, change) => {
    git(upstream, 'checkout', '-q', '--detach', 'v9.0.0');
    change();
    commitAll(upstream, tag);
    git(upstream, 'tag', tag);
  };
  variant('legacy-engine', () => write(upstream, ENGINE, LEGACY_ENGINE));
  variant('unconfirmed-stop', () => write(upstream, ENGINE, UNCONFIRMED_ENGINE));
  variant('no-manifest', () => fs.rmSync(path.join(upstream, ...MANIFEST.split('/'))));
  variant('lint-new', () => write(upstream, '.github/skills/dude-broken/SKILL.md', '---\nname: "dude-wrong"\ndescription: "Use when testing a fixture failure."\n---\n\n# Broken\n'));
  variant('lint-script', () => {
    write(upstream, LINT, SCRIPTED_LINT);
    write(upstream, '.github/skills/dude-marker/SKILL.md', '---\nname: "dude-marker"\ndescription: "Use when testing the fixture linter."\n---\n\n# Marker\n');
  });
  // Git records these files as executable on every platform; the last one's
  // bytes are unchanged, so only its mode differs from v9.0.0.
  const permissionRelease = () => {
    write(upstream, CORE_SCRIPT.added, '#!/bin/sh\necho added\n');
    write(upstream, CORE_SCRIPT.existing, '#!/bin/sh\necho target\n');
    write(upstream, PACK_SCRIPT_SOURCE, '#!/bin/sh\necho pack\n');
    const executable = [CORE_SCRIPT.added, CORE_SCRIPT.existing, PACK_SCRIPT_SOURCE, MODE_ONLY];
    for (const relativePath of executable) fs.chmodSync(path.join(upstream, ...relativePath.split('/')), 0o755);
    git(upstream, 'add', '-A');
    git(upstream, 'update-index', '--chmod=+x', '--', ...executable);
  };
  variant('perm', permissionRelease);
  variant('perm-lint', () => {
    permissionRelease();
    write(upstream, '.github/skills/dude-broken/SKILL.md', '---\nname: "dude-wrong"\ndescription: "Use when testing a fixture failure."\n---\n\n# Broken\n');
  });
  git(upstream, 'checkout', '-q', 'main');
  // The development branch after v9.0.0 records that release as its base.
  write(upstream, BASE_RELEASE, renderDevelopmentBaseRelease({ source_repo: UPSTREAM_REPOSITORY, base_release: 'v9.0.0' }));
  const main = commitAll(upstream, 'development build');

  // Tag-only sources for release checks.
  const tags = path.join(root, 'tags');
  write(tags, 'README.md', 'tags\n');
  initRepository(tags);
  commitAll(tags, 'tags');
  for (const tag of ['v1.2.0', 'v1.9.0', 'v1.11.0-rc1', 'nightly']) git(tags, 'tag', tag);
  git(tags, 'tag', '-a', 'v1.10.0', '-m', 'Release v1.10.0');
  const prereleaseOnly = path.join(root, 'pre');
  write(prereleaseOnly, 'README.md', 'prereleases\n');
  initRepository(prereleaseOnly);
  commitAll(prereleaseOnly, 'prereleases');
  git(prereleaseOnly, 'tag', 'v2.0.0-rc1');

  return {
    root,
    upstream,
    source,
    commits: { v8, v9, main },
    template,
    tags: pathToFileURL(tags).href,
    prereleaseOnly: pathToFileURL(prereleaseOnly).href,
  };
}

let consumerCount = 0;
/** A disposable consumer: a copy of the template with its own temporary folder. @param {Fixture} shared */
function newConsumer(shared) {
  consumerCount += 1;
  const base = path.join(shared.root, `c${consumerCount}`);
  const root = path.join(base, 'w');
  const tmp = path.join(base, 't');
  fs.cpSync(shared.template, root, { recursive: true });
  fs.mkdirSync(tmp);
  return { root, tmp };
}

/** The changes a full v8.0.0 -> v9.0.0 core update makes, as the preview lists them. */
function coreChanges() {
  return [
    ...REPLACED.map((relativePath) => ({ path: relativePath, group: 'core', pack: null, op: 'replace' })),
    { path: CRLF_INSTRUCTIONS, group: 'core', pack: null, op: 'replace' },
    ...ADDED.map((relativePath) => ({ path: relativePath, group: 'core', pack: null, op: 'add' })),
    ...RETIRED.map((relativePath) => ({ path: relativePath, group: 'core', pack: null, op: 'remove' })),
  ];
}

/** @param {{ path: string }[]} changes */
const sorted = (changes) => [...changes].sort((left, right) => codeUnitCompare(left.path, right.path));
/* ------------------------------------------------------------ release source */

test('release sources: remote addresses, safe release pages, numeric versions, deployment paths, and the foreground Git environment', () => {
  for (const remote of ['https://github.com/E-G-C/dude', 'file:///C:/up', 'git://127.0.0.1:9/x', 'ssh://git@example.com/x.git', 'git@example.com:owner/repo.git']) {
    assert.equal(isRemoteAddress(remote), true, remote);
  }
  for (const local of ['C:\\work\\dude', 'C:/work/dude', '/srv/dude', '../dude', 'dude']) assert.equal(isRemoteAddress(local), false, local);
  for (const unsafe of ['', ' https://x', '-c core.x=y', 'ext::sh -c x', '::x', 'a\nb']) {
    assert.throws(() => checkSourceAddress(unsafe), { name: 'ReleaseSourceError' }, JSON.stringify(unsafe));
  }

  assert.equal(githubReleaseUrl('https://github.com/E-G-C/dude', 'v1.2.3'), 'https://github.com/E-G-C/dude/releases/tag/v1.2.3');
  assert.equal(githubReleaseUrl('https://github.com/E-G-C/dude.git', 'v1.2.3'), 'https://github.com/E-G-C/dude/releases/tag/v1.2.3');
  for (const [source, tag] of [
    ['http://github.com/E-G-C/dude', 'v1.2.3'],
    ['https://github.com/E-G-C/dude/tree/main', 'v1.2.3'],
    ['https://example.com/E-G-C/dude', 'v1.2.3'],
    ['file:///C:/up', 'v1.2.3'],
    ['https://github.com/E-G-C/dude', 'v1.2.3-rc1'],
  ]) assert.equal(githubReleaseUrl(source, tag), null, `${source} ${tag}`);

  assert.ok(compareReleaseTags('v1.10.0', 'v1.9.0') > 0, 'numeric, not lexical');
  assert.ok(compareReleaseTags('v2.0.0', 'v10.0.0') < 0);
  assert.equal(compareReleaseTags('v3.1.4', 'v3.1.4'), 0);
  assert.throws(() => compareReleaseTags('v1.0.0-rc1', 'v1.0.0'));

  for (const deployed of [
    '.github/agents/dude.agent.md',
    '.github/agents/dude-spec-lead.agent.md',
    '.github/skills/dude-engine/config/agent-models.json',
    '.github/skills/dude-bundle-upgrade/lib/release-source.mjs',
    '.github/instructions/dude.instructions.md',
    '.github/extensions/dude/ui/assets/app.js',
    MANIFEST,
    BASE_RELEASE,
  ]) assert.equal(isDeploymentPath(deployed), true, deployed);
  for (const other of [
    '.github/agents/dude-local-worker.agent.md',
    '.github/agents/dude-pack-alpha-worker.agent.md',
    '.github/agents/custom.agent.md',
    '.github/skills/dude-pack-alpha-notes/SKILL.md',
    '.github/skills/dude-local-mine/SKILL.md',
    '.github/skills/project/SKILL.md',
    '.github/instructions/other.instructions.md',
    '.github/extensions/dude-preview/extension.mjs',
    '.github/extensions/other/keep.txt',
    '.github/workflows/ci.yml',
    'src/extensions/dude/extension.mjs',
    'library/packs/alpha/pack.md',
    PROFILE,
    LOG,
    '.dude/metadata/pack-sources.md',
  ]) assert.equal(isDeploymentPath(other), false, other);

  // Foreground acquisition keeps the user's own Git environment, without prompts.
  const inherited = {
    PATH: 'inherited',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: 'store',
    GIT_CONFIG_KEY_1: 'http.extraHeader',
    GIT_CONFIG_VALUE_1: 'X-Dude-Count: dude-dummy',
    GIT_CONFIG_GLOBAL: '/home/user/.gitconfig',
  };
  const foreground = foregroundGitEnvironment({ ...inherited, SSH_AUTH_SOCK: '/run/agent.sock', HOME: '/home/user' });
  assert.deepEqual(
    [foreground.SSH_AUTH_SOCK, foreground.HOME, foreground.GIT_CONFIG_COUNT, foreground.GIT_CONFIG_VALUE_1, foreground.GIT_CONFIG_GLOBAL, foreground.GIT_ALLOW_PROTOCOL],
    ['/run/agent.sock', '/home/user', '2', 'X-Dude-Count: dude-dummy', '/home/user/.gitconfig', undefined],
  );
  assert.deepEqual([foreground.GIT_TERMINAL_PROMPT, foreground.GIT_ASKPASS, foreground.SSH_ASKPASS, foreground.GCM_INTERACTIVE], ['0', '', '', 'never']);

  // Compose reads github.com packs over HTTPS; any other host may need its synchronous Git.
  for (const [location, github] of [
    ['https://github.com/E-G-C/dude', true],
    ['https://GitHub.com/E-G-C/dude.git', true],
    ['ssh://git@github.com/E-G-C/dude.git', true],
    ['git@github.com:E-G-C/dude.git', true],
    ['https://api.github.com/repos/E-G-C/dude', true],
    ['https://github.com.example.com/E-G-C/dude', false],
    ['https://example.com/github.com/dude', false],
    ['git://127.0.0.1:9418/dude.git', false],
    ['ssh://git@[::1]:22/dude.git', false],
    ['file:///C:/up', false],
    ['C:\\work\\dude', false],
  ]) assert.equal(isGitHubHost(/** @type {string} */ (location)), github, /** @type {string} */ (location));
});

/* ------------------------------------------------------------- check command */

test('the release check runs Git with a fresh environment and fixed settings of its own, and on Windows only Git for Windows 2.32.0(2) or later', () => {
  const source = 'https://example.com/dude.git';
  // Everything a launching environment could sign in, configure, or proxy with.
  const inherited = {
    PATH: 'inherited-path',
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    TEMP: 'inherited-temp',
    TMP: 'inherited-tmp',
    TMPDIR: 'inherited-tmpdir',
    HOME: '/home/user',
    USERPROFILE: 'C:\\Users\\user',
    HOMEDRIVE: 'C:',
    HOMEPATH: '\\Users\\user',
    XDG_CONFIG_HOME: '/home/user/.config',
    HTTP_PROXY: 'http://proxy.example.invalid:8080',
    HTTPS_PROXY: 'http://proxy.example.invalid:8080',
    ALL_PROXY: 'http://proxy.example.invalid:8080',
    NO_PROXY: 'example.com',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: 'store',
    GIT_CONFIG_KEY_1: 'http.extraHeader',
    GIT_CONFIG_VALUE_1: 'X-Dude-Count: dude-dummy',
    GIT_CONFIG_PARAMETERS: "'http.extraheader=X-Dude-Parameters: dude-dummy'",
    GIT_CONFIG_GLOBAL: '/home/user/.gitconfig',
    GIT_CONFIG_SYSTEM: '/home/user/system.gitconfig',
    GIT_CONFIG_NOSYSTEM: '0',
    GIT_DIR: '/work/project/.git',
    GIT_SSL_CERT: '/home/user/client.pem',
    GIT_SSL_KEY: '/home/user/client.key',
    GIT_SSL_CERT_PASSWORD_PROTECTED: '1',
    GIT_SSL_NO_VERIFY: '1',
    GIT_SSL_CAINFO: '/home/user/ca.pem',
    CURL_CA_BUNDLE: '/home/user/ca.pem',
    GIT_ASKPASS: '/usr/lib/git-askpass',
    SSH_ASKPASS: '/usr/lib/ssh-askpass',
    GIT_TERMINAL_PROMPT: '1',
    GCM_INTERACTIVE: 'always',
    GIT_ALLOW_PROTOCOL: 'ssh:ext',
    SSH_AUTH_SOCK: '/run/agent.sock',
    GIT_SSH_COMMAND: 'ssh -i /home/user/.ssh/id',
    GIT_PROXY_COMMAND: '/usr/bin/proxy',
    GIT_HTTP_PROXY_AUTHMETHOD: 'negotiate',
    KRB5CCNAME: 'FILE:/tmp/krb5cc_user',
    NODE_OPTIONS: '--require /home/user/hook.js',
  };
  const { args, env } = releaseCheckCommand(source, inherited);
  // Each setting is given on Git's command line, before the one command.
  assert.deepEqual(args, [
    '-c', 'credential.helper=',
    '-c', 'credential.interactive=false',
    '-c', 'http.emptyAuth=false',
    '-c', 'http.proactiveAuth=none',
    '-c', 'http.allowNTLMAuth=false',
    '-c', 'http.delegation=none',
    '-c', 'http.extraHeader=',
    '-c', 'http.saveCookies=false',
    '-c', 'http.sslAutoClientCert=false',
    '-c', 'http.proxy=',
    '-c', 'core.gitProxy=none',
    '-c', 'http.followRedirects=false',
    '-c', 'http.sslVerify=true',
    'ls-remote', '--tags', '--', source,
  ]);
  // The whole environment: six inherited variables and an isolated home that is never created.
  const home = String(env.HOME);
  assert.equal(path.dirname(home), os.tmpdir());
  assert.match(path.basename(home), /^dude-upgrade-check-home-[0-9a-f-]{36}$/);
  assert.equal(fs.existsSync(home), false, 'the isolated home is never created');
  /** @type {Record<string, string>} */
  const windowsHome = {};
  if (process.platform === 'win32') {
    Object.assign(windowsHome, { USERPROFILE: home, HOMEDRIVE: String(env.HOMEDRIVE), HOMEPATH: String(env.HOMEPATH) });
    assert.match(windowsHome.HOMEDRIVE, /^(?:[A-Za-z]:|\\\\[^\\]+\\[^\\]+)$/);
    assert.equal(`${windowsHome.HOMEDRIVE}${windowsHome.HOMEPATH}`, home, 'HOMEDRIVE and HOMEPATH name the isolated home');
  }
  assert.deepEqual(env, {
    PATH: 'inherited-path',
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    TEMP: 'inherited-temp',
    TMP: 'inherited-tmp',
    TMPDIR: 'inherited-tmpdir',
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    ...windowsHome,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
    GIT_DIR: path.join(home, '.git'),
    GIT_ALLOW_PROTOCOL: 'file:git:http:https',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GCM_INTERACTIVE: 'never',
  });
  assert.notEqual(releaseCheckCommand(source, inherited).env.HOME, home, 'each check gets its own home');
  // Only variables that are present are inherited; Windows gives names in any case.
  const sparse = releaseCheckCommand(source, { Path: 'windows-path', windir: 'C:\\Windows', Temp: 'windows-temp', Home: 'C:\\Users\\user' }).env;
  assert.deepEqual(
    Object.fromEntries(Object.entries(sparse).filter(([name]) => /^(?:path|systemroot|windir|temp|tmp|tmpdir)$/i.test(name))),
    process.platform === 'win32' ? { Path: 'windows-path', windir: 'C:\\Windows', Temp: 'windows-temp' } : {},
  );
  assert.equal(Object.keys(sparse).some((name) => name === 'Home'), false);

  // Older Git for Windows offered a Windows client certificate by itself.
  for (const [output, checkable] of [
    ['git version 2.55.0.windows.3\n', true],
    ['git version 2.53.0.windows.4', true],
    ['git version 2.33.0.windows.1', true],
    ['git version 2.32.0.windows.2', true],
    ['git version 2.32.0.windows.1', false],
    ['git version 2.32.0', false],
    ['git version 2.31.1.windows.1', false],
    ['git version 2.45.1', true],
    ['git version 1.9.5.msysgit.1', false],
    ['v24.0.0', false],
    ['', false],
  ]) assert.equal(isCheckableWindowsGit(String(output)), checkable, String(output));
});

/* ----------------------------------------------------------- observation */

test('the prepared folder observation stops its work once the folder reaches exactly 1 GiB or exactly 65,536 files and folders, and one byte or one entry fewer keeps it running', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-ob-'));
  const reason = /^the upgrade's temporary folder grew past 1 GiB or 65536 files and folders, so its work was stopped$/;
  /** @param {{ signal: AbortSignal }} observed @param {string} label */
  const stopped = async (observed, label) => {
    await until(() => observed.signal.aborted, 10_000, `${label} stopped the work`);
    assert.equal(observed.signal.reason?.code, 'too-large', label);
    assert.match(observed.signal.reason?.message, reason, label);
  };
  /** @param {{ signal: AbortSignal }} observed @param {string} label @param {number} [milliseconds] */
  const running = async (observed, label, milliseconds = 1_000) => {
    // Observations every 250 ms, each of which would have stopped the work at a bound.
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    assert.equal(observed.signal.aborted, false, `${label} keeps the work running`);
  };
  try {
    // A small folder keeps running, and a caller's own stop passes through.
    const small = path.join(root, 's');
    write(small, 'one.txt', 'x');
    const caller = new AbortController();
    const observedSmall = observeRoot(small, caller.signal);
    try {
      await running(observedSmall, 'a small folder');
      const cancelled = new Error('cancelled by the caller');
      caller.abort(cancelled);
      assert.equal(observedSmall.signal.reason, cancelled, "the caller's stop passes through");
    } finally {
      observedSmall.stop();
    }

    // Bytes: one byte under 1 GiB keeps running; exactly 1 GiB stops the work.
    const bytes = path.join(root, 'b');
    write(bytes, 'one.txt', 'x');
    const handle = fs.openSync(path.join(bytes, 'large.bin'), 'wx');
    try {
      fs.ftruncateSync(handle, 2 ** 30 - 2);
      const under = observeRoot(bytes, new AbortController().signal);
      try {
        await running(under, 'one byte under 1 GiB');
      } finally {
        under.stop();
      }
      fs.ftruncateSync(handle, 2 ** 30 - 1);
      const exact = observeRoot(bytes, new AbortController().signal);
      try {
        await stopped(exact, 'exactly 1 GiB');
      } finally {
        exact.stop();
      }
    } finally {
      fs.closeSync(handle);
    }

    // Entries: 65,535 files and folders keep running, whatever their type or
    // size; exactly 65,536 stop the work.
    const entries = path.join(root, 'e');
    fs.mkdirSync(entries);
    for (let index = 0; index < 65_534; index += 1) fs.writeFileSync(path.join(entries, String(index)), '');
    fs.mkdirSync(path.join(entries, 'folder'));
    const fewer = observeRoot(entries, new AbortController().signal);
    try {
      // A walk lists this folder at once, so a stop below the bound would come well within this time.
      await running(fewer, '65,535 entries', 3_000);
    } finally {
      fewer.stop();
    }
    fs.writeFileSync(path.join(entries, 'one-more'), '');
    const crowded = observeRoot(entries, new AbortController().signal);
    try {
      await stopped(crowded, 'exactly 65,536 entries');
    } finally {
      crowded.stop();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('a deadline still fires after garbage collection while its operation waits, and once disposed it leaves no timer or listener behind', () => {
  // Node 20 can collect a timeout signal that only a combined signal refers
  // to, and such a deadline never fires. Collections are forced in a child.
  const library = new URL('./lib/release-source.mjs', import.meta.url).href;
  const script = [
    "import { getEventListeners } from 'node:events';",
    `import { deadlineSignal } from ${JSON.stringify(library)};`,
    'const caller = new AbortController();',
    // Held and listened to, as a running operation holds its deadline.
    'const deadline = deadlineSignal(500, caller.signal);',
    "deadline.signal.addEventListener('abort', () => {}, { once: true });",
    'for (let round = 0; round < 20; round += 1) {',
    '  globalThis.gc();',
    '  await new Promise((resolve) => setTimeout(resolve, 100));',
    '}',
    "const fired = deadline.signal.aborted ? deadline.signal.reason?.name : 'never';",
    'deadline.dispose();',
    'const disposed = deadlineSignal(600_000, caller.signal);',
    'disposed.dispose();',
    "process.stdout.write(JSON.stringify({ fired, listeners: getEventListeners(caller.signal, 'abort').length, aborted: disposed.signal.aborted }));",
  ].join('\n');
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.error, undefined, 'a disposed deadline must not keep its process running');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { fired: 'TimeoutError', listeners: 0, aborted: false });
});

/* ------------------------------------------------------------------- check */

test('the release check lists tags only: numeric stable order, annotated tags, no downgrade offer, no stable releases, and unavailable sources', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const missing = pathToFileURL(path.join(shared.root, 'missing')).href;
  for (const [label, source, installed, expected] of [
    ['a newer stable release', shared.tags, 'v1.9.0', { status: 'upgrade_available', available_ref: 'v1.10.0' }],
    ['the installed release', shared.tags, 'v1.10.0', { status: 'up_to_date', available_ref: 'v1.10.0' }],
    ['an installed release newer than the source', shared.tags, 'v1.12.0', { status: 'up_to_date', available_ref: 'v1.10.0' }],
    ['prereleases only', shared.prereleaseOnly, 'v1.0.0', { status: 'no_stable_releases', available_ref: null }],
    ['an unavailable source', missing, 'v1.0.0', { status: 'check_failed', available_ref: null }],
    ['the bundle upstream, past its prerelease tag', shared.source, 'v8.0.0', { status: 'upgrade_available', available_ref: 'v9.0.0' }],
  ]) {
    writeManifest(consumer.root, source, 'latest', installed);
    const before = snapshot(consumer.root);
    const checked = upgradeJson(consumer, 'status');
    assert.equal(checked.code, 0, `${label}: ${checked.stderr}`);
    assert.equal(checked.json.status, expected.status, label);
    assert.equal(checked.json.available_ref, expected.available_ref, label);
    assert.equal(checked.json.channel, 'latest', label);
    assert.equal(checked.json.installed_ref, installed, label);
    assert.equal(checked.json.release_url, null, `${label}: a file source has no release page`);
    if (expected.status === 'check_failed') assert.equal(checked.json.checked_at, null, label);
    else assert.match(checked.json.checked_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, label);
    assert.deepEqual(snapshot(consumer.root), before, `${label}: the check writes nothing`);
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], `${label}: the check creates no temporary file or home`);
  }

  const text = upgrade(consumer, 'status');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /^Bundle: update available \(v9\.0\.0\)$/m);
  assert.match(text.stdout, /^ {2}Installed: v8\.0\.0$/m);
  assert.match(text.stdout, /^ {2}Next: {6}@dude upgrade --dry-run$/m);
});

test('the release check makes no lookup for pinned, development, or unusable installs, and stops a silent source at five seconds', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const silent = await silentGitServer();
  try {
    for (const [label, ref, installed, status, code] of [
      ['a pinned install', 'v9.0.0', 'v9.0.0', 'pinned', 0],
      ['a development install', 'main', 'main', 'development', 0],
      ['a latest install without a stable installed version', 'latest', 'main', 'installation_unavailable', 40],
    ]) {
      writeManifest(consumer.root, silent.address, ref, installed);
      const checked = await upgradeAsync(consumer, 'status', '--format', 'json');
      assert.equal(checked.code, code, `${label}: ${checked.stderr}`);
      assert.equal(JSON.parse(checked.stdout).status, status, label);
      assert.equal(JSON.parse(checked.stdout).available_ref, null, label);
      assert.equal(silent.connections, 0, `${label}: no source contact`);
    }

    writeManifest(consumer.root, shared.upstream, 'latest', 'v8.0.0');
    const local = await upgradeAsync(consumer, 'status', '--format', 'json');
    assert.equal(JSON.parse(local.stdout).status, 'check_failed');
    assert.match(JSON.parse(local.stdout).detail, /local-path source does not support ref latest/);

    fs.rmSync(path.join(consumer.root, ...MANIFEST.split('/')));
    const unavailable = await upgradeAsync(consumer, 'status', '--format', 'json');
    assert.equal(unavailable.code, 40);
    assert.equal(JSON.parse(unavailable.stdout).status, 'installation_unavailable');
    assert.match(JSON.parse(unavailable.stdout).detail, /install or copy a current bundle engine/);
    git(consumer.root, 'checkout', '-q', '--', MANIFEST);

    writeManifest(consumer.root, silent.address, 'latest', 'v8.0.0');
    const before = snapshot(consumer.root);
    const timedOut = await upgradeAsync(consumer, 'status', '--format', 'json');
    const report = JSON.parse(timedOut.stdout);
    assert.equal(timedOut.code, 0, timedOut.stderr);
    assert.equal(report.status, 'check_failed');
    assert.match(report.detail, /did not answer within 5 seconds/);
    assert.ok(silent.connections >= 1, 'the latest install contacted its source');
    assert.ok(timedOut.ms >= 4_500 && timedOut.ms < 15_000, `the check stopped at its deadline (${Math.round(timedOut.ms)} ms)`);
    assert.deepEqual(snapshot(consumer.root), before, 'the check writes nothing');
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'the check creates no temporary file or home');
  } finally {
    await silent.close();
  }
});

test('the release check never uses SSH: an SSH source fails clearly without a connection, and rewritten addresses cannot start SSH', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  // An SSH server stand-in: any SSH client the check started would connect here.
  const silent = await silentGitServer();
  try {
    for (const address of [
      `ssh://git@127.0.0.1:${silent.port}/dude.git`,
      `git+ssh://git@127.0.0.1:${silent.port}/dude.git`,
      'git@127.0.0.1:owner/dude.git',
    ]) {
      writeManifest(consumer.root, address, 'latest', 'v8.0.0');
      const checked = await upgradeAsync(consumer, 'status', '--format', 'json');
      assert.equal(checked.code, 0, `${address}: ${checked.stderr}`);
      const report = JSON.parse(checked.stdout);
      assert.equal(report.status, 'check_failed', address);
      assert.equal(report.available_ref, null, address);
      assert.equal(
        report.detail,
        `release checks never sign in, so they do not use the SSH address ${address}; record an HTTPS source to check it automatically, or run "@dude upgrade --dry-run", which uses your own Git sign-in`,
        address,
      );
    }
    assert.equal(silent.connections, 0, 'no SSH client was started');

    // Inherited Git configuration that rewrites an HTTP source into SSH is not
    // read by the check at all, and could not start SSH either.
    const refused = net.createServer();
    await new Promise((resolve) => refused.listen(0, '127.0.0.1', () => resolve(undefined)));
    const closedPort = /** @type {net.AddressInfo} */ (refused.address()).port;
    await new Promise((resolve) => refused.close(() => resolve(undefined)));
    const httpSource = `http://127.0.0.1:${closedPort}/dude.git`;
    writeManifest(consumer.root, httpSource, 'latest', 'v8.0.0');
    const rewriting = {
      ...consumer,
      env: {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `url.ssh://git@127.0.0.1:${silent.port}/.insteadOf`,
        GIT_CONFIG_VALUE_0: `http://127.0.0.1:${closedPort}/`,
      },
    };
    const rewritten = await upgradeAsync(rewriting, 'status', '--format', 'json');
    assert.equal(rewritten.code, 0, rewritten.stderr);
    const report = JSON.parse(rewritten.stdout);
    assert.equal(report.status, 'check_failed');
    assert.match(report.detail, new RegExp(`^could not list the tags of ${escapeRegExp(httpSource)}: `));
    assert.doesNotMatch(report.detail, /ssh/i, 'the inherited rewrite was not applied');
    assert.equal(silent.connections, 0, 'the rewritten SSH address was never contacted');
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'the check creates no temporary file or home');
  } finally {
    await silent.close();
  }
});

test('the release check sends no credential, configured header, or cookie when its source lists tags or answers 401 for Basic, Negotiate, NTLM, Digest, or Bearer, while preparation sends the same seeds', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const peer = await recordingPeer();
  try {
    writeManifest(consumer.root, peer.url, 'latest', 'v8.0.0');
    git(consumer.root, 'config', 'http.extraHeader', 'X-Dude-Repository: dude-dummy');
    const seeds = credentialSeeds(path.dirname(consumer.root));
    const user = { ...consumer, env: seeds.env };
    const cookies = read(seeds.home, 'cookies.txt');
    /** @param {string} label */
    const check = async (label) => {
      const checked = await upgradeAsync(user, 'status', '--format', 'json');
      assert.equal(checked.code, 0, `${label}: ${checked.stderr}`);
      return JSON.parse(checked.stdout);
    };

    // A listing: the check succeeds without any seed.
    peer.answer = listing;
    const listed = await check('a listing');
    assert.deepEqual([listed.status, listed.available_ref], ['upgrade_available', 'v9.0.0'], listed.detail);
    assert.ok(peer.requests.length > 0, 'the check listed the tags over HTTP');
    assert.deepEqual(peer.carried(), [], 'a listing: no credential, configured header, or cookie');

    // Each challenge: the check answers none and reports that it could not
    // check. Negotiate and NTLM run only against this policy: a check that
    // answered them would sign in with the account running the test.
    for (const scheme of ['Basic realm="dude"', 'Negotiate', 'NTLM', 'Digest realm="dude", nonce="dude-nonce", qop="auth"', 'Bearer realm="dude"']) {
      peer.reset();
      peer.answer = challenge(scheme);
      const report = await check(scheme);
      assert.deepEqual([report.status, report.available_ref, report.checked_at], ['check_failed', null, null], scheme);
      assert.ok(report.detail.startsWith(`could not list the tags of ${peer.url}`), `${scheme}: ${report.detail}`);
      assert.ok(peer.requests.length > 0, `${scheme}: the check met the challenge`);
      assert.deepEqual(peer.carried(), [], `${scheme}: no credential, configured header, or cookie`);
    }
    assert.equal(seeds.helperRan(), false, 'the seeded credential helper never ran');
    assert.deepEqual(read(seeds.home, 'cookies.txt'), cookies, 'no cookie was saved');
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'the check creates no temporary file or home');

    // Preparation uses the user's own Git, so the same seeds reach the peer:
    // every configured header and the cookie with a listing...
    peer.reset();
    peer.answer = listing;
    const prepared = await upgradeAsync(user, 'plan', '--dry-run', '--format', 'json');
    assert.equal(prepared.code, 40, prepared.stdout + prepared.stderr);
    assert.deepEqual(peer.carried(), ['authorization', 'cookie', 'x-dude-count', 'x-dude-global', 'x-dude-parameters', 'x-dude-repository', 'x-dude-system']);
    // ...and a seeded login under a Basic challenge, with no system file at all.
    peer.reset();
    peer.answer = challenge('Basic realm="dude"');
    const signedIn = await upgradeAsync({ ...consumer, env: withoutSystemFile(seeds.env) }, 'plan', '--dry-run', '--format', 'json');
    assert.equal(signedIn.code, 40, signedIn.stdout + signedIn.stderr);
    assert.equal(peer.requests[0]?.credentials.includes('authorization'), false, 'the first request carried no login');
    assert.ok(peer.requests.some((request) => request.credentials.includes('authorization')), 'preparation answered with a seeded login');
    assert.equal(seeds.helperRan(), true, 'preparation ran the seeded credential helper');
    assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  } finally {
    await peer.close();
  }
});

test('the release check follows no redirect and uses no proxy from the environment or configuration, while preparation does both', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const peer = await recordingPeer();
  const elsewhere = await recordingPeer();
  // A proxy that would answer the listing itself.
  const proxy = await recordingPeer();
  try {
    writeManifest(consumer.root, peer.url, 'latest', 'v8.0.0');
    elsewhere.answer = listing;
    proxy.answer = listing;
    const proxied = credentialSeeds(path.join(path.dirname(consumer.root), 'proxied'), { proxy: proxy.origin });
    const plain = credentialSeeds(path.join(path.dirname(consumer.root), 'plain'));
    const user = { ...consumer, env: { ...withoutSystemFile(proxied.env), no_proxy: '' } };
    const toElsewhere = redirect(`${elsewhere.url}/info/refs?service=git-upload-pack`);

    // A redirect to a second loopback port is an error, not a new address.
    peer.answer = toElsewhere;
    const redirected = await upgradeAsync(user, 'status', '--format', 'json');
    assert.equal(redirected.code, 0, redirected.stderr);
    const report = JSON.parse(redirected.stdout);
    assert.deepEqual([report.status, report.available_ref], ['check_failed', null], report.detail);
    assert.ok(report.detail.startsWith(`could not list the tags of ${peer.url}`), report.detail);
    assert.ok(peer.requests.length > 0, 'the check met the redirect');
    assert.equal(elsewhere.connections, 0, 'the redirect was not followed');

    // The source is reached directly, past the proxy that the environment and the configuration name.
    peer.reset();
    peer.answer = listing;
    const direct = await upgradeAsync(user, 'status', '--format', 'json');
    assert.equal(direct.code, 0, direct.stderr);
    const listed = JSON.parse(direct.stdout);
    assert.deepEqual([listed.status, listed.available_ref], ['upgrade_available', 'v9.0.0'], listed.detail);
    assert.ok(peer.requests.length > 0, 'the check reached its source directly');
    assert.deepEqual(peer.carried(), []);
    assert.equal(proxy.connections, 0, 'the proxy was never used');
    assert.deepEqual(fs.readdirSync(consumer.tmp), []);

    // Preparation uses the user's own Git: through the proxy...
    const throughProxy = await upgradeAsync(user, 'plan', '--dry-run', '--format', 'json');
    assert.equal(throughProxy.code, 40, throughProxy.stdout + throughProxy.stderr);
    assert.ok(proxy.requests.length > 0, 'preparation went through the proxy');
    // ...and, without one, to the redirected address.
    peer.answer = toElsewhere;
    const followed = await upgradeAsync({ ...consumer, env: withoutSystemFile(plain.env) }, 'plan', '--dry-run', '--format', 'json');
    assert.equal(followed.code, 40, followed.stdout + followed.stderr);
    assert.ok(elsewhere.requests.length > 0, 'preparation followed the redirect');
    assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  } finally {
    await Promise.all([peer.close(), elsewhere.close(), proxy.close()]);
  }
});

test('the release check refuses an address that carries a user name, password, query, or fragment, or names a network share, before starting any process', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const peer = await recordingPeer();
  peer.answer = listing;
  try {
    const { host } = new URL(peer.url);
    for (const address of [
      `http://dude-dummy@${host}/dude.git`,
      `http://dude-dummy:dude-dummy@${host}/dude.git`,
      `${peer.url}?token=dude-dummy`,
      `${peer.url}#dude-dummy`,
      // Network shares, which Windows would sign in to with the user's account.
      'file://dude-share.invalid/share/dude.git',
      'file:////dude-share.invalid/share/dude.git',
      'file:///%5C%5Cdude-share.invalid%5Cshare%5Cdude.git',
      'file:///%2F%2Fdude-share.invalid/share/dude.git',
    ]) {
      writeManifest(consumer.root, address, 'latest', 'v8.0.0');
      const checked = await upgradeAsync(consumer, 'status', '--format', 'json');
      assert.equal(checked.code, 0, `${address}: ${checked.stderr}`);
      const report = JSON.parse(checked.stdout);
      assert.deepEqual([report.status, report.available_ref], ['check_failed', null], address);
      assert.equal(
        report.detail,
        'release checks never sign in, so they use only a file:, git:, http:, or https: address with no user name, password, query, or fragment, and no network share; record such a source to check it automatically, or run "@dude upgrade --dry-run", which uses your own Git sign-in',
        address,
      );
    }
    assert.equal(peer.connections, 0, 'no address was contacted');
    assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  } finally {
    await peer.close();
  }
});

test('on Windows, the release check refuses a Git that does not report Git for Windows 2.32.0(2) or later, before it contacts the source', {
  skip: process.platform !== 'win32' && 'only Git for Windows can offer a Windows client certificate by itself',
}, async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const peer = await recordingPeer();
  peer.answer = listing;
  // A program named git that is not Git: this Node, which reports only its own version.
  const fake = path.join(path.dirname(consumer.root), 'not-git');
  fs.mkdirSync(fake);
  try {
    fs.linkSync(process.execPath, path.join(fake, 'git.exe'));
  } catch {
    fs.copyFileSync(process.execPath, path.join(fake, 'git.exe'));
  }
  try {
    writeManifest(consumer.root, peer.url, 'latest', 'v8.0.0');
    const checked = await upgradeAsync({ ...consumer, env: { PATH: `${fake}${path.delimiter}${process.env.PATH}` } }, 'status', '--format', 'json');
    assert.equal(checked.code, 0, checked.stderr);
    const report = JSON.parse(checked.stdout);
    assert.deepEqual([report.status, report.available_ref], ['check_failed', null], report.detail);
    assert.equal(
      report.detail,
      `release checks on Windows need Git for Windows 2.32.0(2) or later, because an older one can offer a client certificate from your Windows certificate store by itself; this Git reports "${process.version}". Update Git, or run "@dude upgrade --dry-run", which uses your own Git sign-in`,
    );
    assert.equal(peer.connections, 0, 'the source was never contacted');
    assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  } finally {
    await peer.close();
  }
});
/* -------------------------------------------------------------- core-only */

test('core-only: the preview lists exact grouped changes, apply writes the reviewed raw bytes in place, and a repeat is a no-op', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // An uncommitted customization of a touched core file and an unrelated edit in progress.
  write(root, REPLACED[0], Buffer.concat([read(root, REPLACED[0]), Buffer.from('\nlocal customization\n')]));
  write(root, 'docs/notes.md', 'project notes, edited\n');
  const before = snapshot(root);
  const state = gitState(root);
  const expectedChanges = sorted([
    ...coreChanges(),
    { path: MANIFEST, group: 'metadata', pack: null, op: 'replace' },
    { path: BASE_RELEASE, group: 'metadata', pack: null, op: 'remove' },
    { path: LOG, group: 'metadata', pack: null, op: 'replace' },
  ]);

  // The dry run reports the complete result and retains and writes nothing.
  const dry = upgradeJson(consumer, 'plan', '--dry-run');
  assert.equal(dry.code, 10, dry.stderr);
  assert.equal(dry.json.status, 'ready');
  assert.equal(dry.json.id, null);
  assert.equal(dry.json.dry_run, true);
  assert.equal(dry.json.from_ref, 'v8.0.0');
  assert.equal(dry.json.to_ref, 'v9.0.0');
  assert.deepEqual(dry.json.source, {
    location: shared.source,
    requested_ref: 'latest',
    resolved_ref: 'v9.0.0',
    commit: git(shared.upstream, 'rev-parse', 'v9.0.0^{commit}'),
  });
  assert.equal(dry.json.source.commit, shared.commits.v9, 'the annotated tag is peeled to its commit');
  assert.equal(dry.json.branch, 'main');
  assert.equal(dry.json.include_packs, false);
  assert.deepEqual(dry.json.counts, {
    core: { added: 2, replaced: 4, removed: 2 },
    metadata: { added: 0, replaced: 2, removed: 1 },
    packs: {},
  });
  assert.deepEqual(dry.json.changes, expectedChanges);
  assert.deepEqual(dry.json.packs, { eligible: ['alpha', 'beta'], selected: false, affected: [], unchanged: [], not_selected: ['alpha', 'beta'] });
  assert.deepEqual(dry.json.base_release, { from: 'v7.0.0', to: null, changed: true });
  assert.deepEqual(dry.json.dirty_paths, [REPLACED[0]], 'the uncommitted customization of a touched path is named');
  assert.doesNotMatch(JSON.stringify(dry.json), /sha256|[0-9a-f]{64}/, 'the preview shows no hashes');
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  assert.deepEqual(snapshot(root), before);

  // The chat preview retains one prepared result and states what applying does.
  const preview = upgrade(consumer, 'plan');
  assert.equal(preview.status, 10, preview.stderr);
  const id = /** @type {string} */ (/^Prepared ID: ([0-9a-f]{32})$/m.exec(preview.stdout)?.[1]);
  assert.ok(id, preview.stdout);
  for (const line of [
    'Upgrade preview: v8.0.0 -> v9.0.0',
    'Branch: main (the changes stay uncommitted)',
    'Core: 4 replaced, 2 added, 2 removed',
    'Metadata: 2 replaced, 0 added, 1 removed',
    'Base release record: v7.0.0 -> (none)',
    'Eligible packs not included (add --all to include them): alpha, beta',
    `  remove  core: ${RETIRED[1]}`,
    `  ${REPLACED[0]}`,
    'Git cannot recover pre-existing uncommitted edits that the update overwrites. Start a new session afterward to load the updated Dude.',
    `Reply "confirm upgrade" to apply prepared result ${id}.`,
  ]) assert.ok(preview.stdout.split('\n').includes(line), `missing preview line: ${line}\n${preview.stdout}`);
  assert.match(preview.stdout, /^Warning: applying overwrites local customizations in these files on branch main and leaves the changes uncommitted\.$/m);
  assert.deepEqual(fs.readdirSync(consumer.tmp), [preparedFolder(id)]);
  assert.deepEqual(snapshot(root), before, 'preparation writes no project file');

  // One confirmation applies exactly the prepared bytes in place.
  const applied = upgradeJson(consumer, 'apply', '--plan', id, '--confirm', 'confirm-upgrade');
  assert.equal(applied.code, 0, JSON.stringify(applied.json));
  assert.equal(applied.json.outcome, 'applied');
  assert.deepEqual(applied.json.counts, dry.json.counts);
  assert.deepEqual(applied.json.changes, expectedChanges);
  assert.deepEqual(applied.json.existing_failures, []);
  for (const relativePath of [...REPLACED, ...ADDED, CRLF_INSTRUCTIONS]) {
    assert.deepEqual(read(root, relativePath), gitBlob(shared.upstream, `${shared.commits.v9}:${relativePath}`), relativePath);
  }
  assert.equal(read(root, CRLF_INSTRUCTIONS).includes('\r'), false, 'raw blob bytes, not checkout-converted ones');
  for (const relativePath of RETIRED) assert.equal(exists(root, relativePath), false, relativePath);
  assert.equal(exists(root, '.github/skills/dude-retired'), false, 'the emptied skill folder is removed');
  assert.deepEqual(manifestData(root), { source_repo: shared.source, source_ref: 'latest', installed_ref: 'v9.0.0' });
  assert.equal(
    read(root, MANIFEST).toString('utf8').replace(/```json\n[\s\S]*?\n```/, ''),
    read(shared.template, MANIFEST).toString('utf8').replace(/```json\n[\s\S]*?\n```/, ''),
    'the manifest prose is kept',
  );
  assert.equal(exists(root, BASE_RELEASE), false, 'a release target leaves no stale development record');
  assert.match(read(root, LOG).toString('utf8'), new RegExp(`^# Upgrade Log\\n\\n## \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z — upgrade\\n${[
    '- from: v8.0.0',
    '- to: v9.0.0',
    '- ref: latest',
    `- commit: ${shared.commits.v9}`,
    '- core: 4 replaced, 2 added, 2 removed',
    '- packs: none',
    '- base release record: v7.0.0 -> (none)',
    '- notes: left uncommitted on main',
  ].map(escapeRegExp).join('\\n')}\\n$`));

  const after = snapshot(root);
  const touched = new Set(expectedChanges.map((change) => change.path));
  for (const [relativePath, hash] of before) {
    if (!touched.has(relativePath)) assert.equal(after.get(relativePath), hash, `preserved: ${relativePath}`);
  }
  assert.deepEqual([...after.keys()].filter((relativePath) => !before.has(relativePath)).sort(), [...ADDED].sort());
  assert.deepEqual(gitState(root), state, 'HEAD, branch, index, tags, and branches are untouched');
  const status = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).stdout;
  for (const change of expectedChanges) assert.match(status, new RegExp(`^(?: M| D|\\?\\?) ${escapeRegExp(change.path)}$`, 'm'), change.path);
  assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'apply releases the prepared result');

  // The same confirmation cannot apply twice.
  const again = upgradeJson(consumer, 'apply', '--plan', id, '--confirm', 'confirm-upgrade');
  assert.equal(again.code, 40);
  assert.deepEqual([again.json.status, again.json.reason], ['refused', 'not-found']);
  assert.deepEqual(snapshot(root), after);

  // Nothing remains to update, so nothing is prepared or recorded.
  const repeat = upgradeJson(consumer, 'plan');
  assert.equal(repeat.code, 0, repeat.stderr);
  assert.equal(repeat.json.status, 'nothing_to_update');
  assert.equal(repeat.json.id, null);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  assert.deepEqual(snapshot(root), after);

  // The development branch differs only in installation records: a metadata-only update.
  const development = upgradeJson(consumer, 'plan', '--ref', 'main');
  assert.equal(development.code, 10, development.stderr);
  assert.equal(development.json.to_ref, 'main');
  assert.deepEqual(development.json.counts, { core: NO_CHANGES, metadata: { added: 1, replaced: 2, removed: 0 }, packs: {} });
  assert.deepEqual(development.json.changes.map((/** @type {{ path: string }} */ change) => change.path), [MANIFEST, BASE_RELEASE, LOG]);
  assert.deepEqual(development.json.base_release, { from: null, to: 'v9.0.0', changed: true });
  const recorded = upgradeJson(consumer, 'apply', '--plan', development.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(recorded.code, 0, JSON.stringify(recorded.json));
  assert.equal(read(root, BASE_RELEASE).toString('utf8'), renderDevelopmentBaseRelease({ source_repo: shared.source, base_release: 'v9.0.0' }));
  assert.deepEqual(manifestData(root), { source_repo: shared.source, source_ref: 'main', installed_ref: 'main' });
  // Records compare by value: the same record with other line endings needs no write.
  write(root, BASE_RELEASE, read(root, BASE_RELEASE).toString('utf8').replace(/\n/g, '\r\n'));
  const settled = upgradeJson(consumer, 'plan', '--ref', 'main');
  assert.equal(settled.code, 0, settled.stderr);
  assert.equal(settled.json.status, 'nothing_to_update', 'a record equal by value keeps the refresh a true no-op');
  assert.deepEqual(gitState(root), state);
});

test('a main refresh leaves no development base record when the target has no usable provenance', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  // A development upstream whose main branch moves from case to case.
  const upstream = path.join(path.dirname(consumer.root), 'dev-upstream');
  fs.cpSync(shared.upstream, upstream, { recursive: true });
  const source = pathToFileURL(upstream).href;
  /** @param {string} release */
  const record = (release, sourceRepo = UPSTREAM_REPOSITORY) => (
    `# Development Base Release\n\n\`\`\`json\n${JSON.stringify({ source_repo: sourceRepo, base_release: release }, null, 2)}\n\`\`\`\n`
  );
  for (const [label, recordBytes, installedRef] of [
    ['no record', null, 'main'],
    ['a malformed record', '# Development Base Release\n\n```json\n{"source_repo": "x",\n```\n', 'main'],
    ['a prerelease record', record('v10.0.0-rc1'), 'main'],
    ['a record for another source', record('v9.0.0', 'https://example.invalid/other-dude'), 'main'],
    ['a release manifest', record('v9.0.0'), 'v9.0.0'],
  ]) {
    if (recordBytes === null) fs.rmSync(path.join(upstream, ...BASE_RELEASE.split('/')));
    else write(upstream, BASE_RELEASE, recordBytes);
    writeManifest(upstream, UPSTREAM_REPOSITORY, 'latest', installedRef);
    commitAll(upstream, label);
    const planned = upgradeJson(consumer, 'plan', '--dry-run', '--source', source, '--ref', 'main');
    assert.equal(planned.code, 10, `${label}: ${planned.stderr}`);
    assert.deepEqual(planned.json.base_release, { from: 'v7.0.0', to: null, changed: true }, label);
    assert.ok(
      planned.json.changes.some((/** @type {{ path: string, op: string }} */ change) => change.path === BASE_RELEASE && change.op === 'remove'),
      `${label}: the earlier record is removed, not kept`,
    );
  }
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
});
/* --------------------------------------------------------------- combined */

test('combined: --all refreshes only eligible out-of-the-box packs from the target commit, never the project library', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const before = snapshot(root);
  const state = gitState(root);
  const installed = readProfile(root).installed;
  assert.equal(installed.delta.source.type, 'local', 'delta comes from the project library');
  assert.notEqual(installed.gamma.source.repository, shared.source, 'gamma comes from another repository');
  const packChanges = [
    { path: ALPHA.helper, group: 'pack', pack: 'alpha', op: 'add' },
    { path: ALPHA.worker, group: 'pack', pack: 'alpha', op: 'replace' },
    { path: ALPHA.legacy, group: 'pack', pack: 'alpha', op: 'remove' },
    { path: ALPHA.notes, group: 'pack', pack: 'alpha', op: 'replace' },
    { path: ALPHA.detail, group: 'pack', pack: 'alpha', op: 'add' },
  ];
  const expectedChanges = sorted([
    ...coreChanges(),
    { path: MANIFEST, group: 'metadata', pack: null, op: 'replace' },
    { path: BASE_RELEASE, group: 'metadata', pack: null, op: 'remove' },
    { path: PROFILE, group: 'metadata', pack: null, op: 'replace' },
    { path: LOG, group: 'metadata', pack: null, op: 'replace' },
    ...packChanges,
  ]);
  const expectedCounts = {
    core: { added: 2, replaced: 4, removed: 2 },
    metadata: { added: 0, replaced: 3, removed: 1 },
    packs: { alpha: { added: 2, replaced: 2, removed: 1 } },
  };
  const expectedPacks = { eligible: ['alpha', 'beta'], selected: true, affected: ['alpha'], unchanged: ['beta'], not_selected: [] };

  // The combined dry run shows the real pack changes and writes nothing.
  const dry = upgradeJson(consumer, 'plan', '--all', '--dry-run');
  assert.equal(dry.code, 10, dry.stderr);
  assert.deepEqual(dry.json.counts, expectedCounts);
  assert.deepEqual(dry.json.changes, expectedChanges);
  assert.deepEqual(dry.json.packs, expectedPacks);
  assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'pack staging leaves no temporary material');
  assert.deepEqual(snapshot(root), before);

  // A changed pack choice replaces the earlier prepared result.
  const coreOnly = upgradeJson(consumer, 'plan');
  assert.equal(coreOnly.code, 10, coreOnly.stderr);
  const combined = upgradeJson(consumer, 'plan', '--all');
  assert.equal(combined.code, 10, combined.stderr);
  assert.deepEqual(combined.json.counts, expectedCounts);
  assert.deepEqual(fs.readdirSync(consumer.tmp), [preparedFolder(combined.json.id)]);
  const superseded = upgradeJson(consumer, 'apply', '--plan', coreOnly.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(superseded.code, 40);
  assert.deepEqual([superseded.json.status, superseded.json.reason], ['refused', 'not-found']);
  assert.deepEqual(snapshot(root), before, 'a superseded confirmation writes nothing');

  const applied = upgradeJson(consumer, 'apply', '--plan', combined.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(applied.code, 0, JSON.stringify(applied.json));
  assert.equal(applied.json.outcome, 'applied');
  assert.deepEqual(applied.json.counts, expectedCounts);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);

  // Alpha now holds the target commit's projection, not the project library's copy.
  const config = loadAgentModelConfig(path.join(REPO_ROOT, 'src', 'config', 'agent-models.json'));
  for (const [relativePath, role] of [[ALPHA.worker, 'worker'], [ALPHA.helper, 'helper']]) {
    const sourceBytes = gitBlob(shared.upstream, `${shared.commits.v9}:library/packs/alpha/agents/dude-pack-alpha-${role}.agent.md`);
    const rendered = renderCopilotAgent(parseAgentSource(sourceBytes, { stem: `dude-pack-alpha-${role}`, config }), config);
    assert.equal(read(root, relativePath).toString('utf8'), normalizeString(Buffer.from(rendered).toString('utf8')), relativePath);
    assert.match(read(root, relativePath).toString('utf8'), /\(v9\)/);
  }
  for (const [relativePath, sourcePath] of [
    [ALPHA.notes, 'library/packs/alpha/skills/dude-pack-alpha-notes/SKILL.md'],
    [ALPHA.detail, 'library/packs/alpha/skills/dude-pack-alpha-notes/reference/detail.md'],
  ]) assert.deepEqual(read(root, relativePath), gitBlob(shared.upstream, `${shared.commits.v9}:${sourcePath}`), relativePath);
  assert.equal(exists(root, ALPHA.legacy), false);
  for (const relativePath of Object.values(ALPHA).filter((relativePath) => exists(root, relativePath))) {
    assert.doesNotMatch(read(root, relativePath).toString('utf8'), /project library copy/, relativePath);
  }

  // Only alpha's record moves, to the exact target commit; the others keep theirs.
  const profile = readProfile(root).installed;
  assert.deepEqual(profile.alpha, {
    files: [ALPHA.helper, ALPHA.worker, '.github/skills/dude-pack-alpha-notes'],
    source: { type: 'remote', repository: shared.source, requested_ref: shared.commits.v9, resolved_commit: shared.commits.v9 },
  });
  for (const name of ['beta', 'gamma', 'delta']) assert.deepEqual(profile[name], installed[name], `${name} keeps its record`);

  const after = snapshot(root);
  const touched = new Set(expectedChanges.map((change) => change.path));
  for (const [relativePath, hash] of before) {
    if (!touched.has(relativePath)) assert.equal(after.get(relativePath), hash, `preserved: ${relativePath}`);
  }
  assert.deepEqual(
    [...after.keys()].filter((relativePath) => !before.has(relativePath)).sort(),
    [...ADDED, ALPHA.helper, ALPHA.detail].sort(),
  );
  assert.deepEqual(gitState(root), state);
  assert.match(read(root, LOG).toString('utf8'), /\n- packs: alpha \(2 replaced, 2 added, 1 removed\)\n/);
});

test('with a local folder source, --all is refused before anything is prepared, because packs would come from its working tree; a file: URL source refreshes packs from the exact commit', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // A copy of the upstream whose working tree has a pack file in no commit.
  const folder = path.join(path.dirname(root), 'local-upstream');
  fs.cpSync(shared.upstream, folder, { recursive: true });
  write(folder, 'library/packs/alpha/skills/dude-pack-alpha-notes/reference/uncommitted.md', '# In no commit\n');
  const uncommitted = '.github/skills/dude-pack-alpha-notes/reference/uncommitted.md';
  /** @param {string} from @param {string} to */
  const recordPacksFrom = (from, to) => write(root, PROFILE, read(root, PROFILE).toString('utf8').split(from).join(to));
  // The packs are recorded from the folder's own path: the only record a folder source selects.
  const spelled = JSON.stringify(folder).slice(1, -1);
  recordPacksFrom(shared.source, spelled);
  const before = snapshot(root);

  for (const args of [['plan', '--all'], ['plan', '--all', '--dry-run']]) {
    const refused = upgradeJson(consumer, ...args, '--source', folder, '--ref', 'v9.0.0');
    assert.equal(
      refused.code,
      40,
      `${args.join(' ')} prepared ${JSON.stringify(refused.json.changes?.map((/** @type {{ path: string }} */ change) => change.path))}`,
    );
    assert.deepEqual([refused.json.status, refused.json.reason], ['refused', 'invalid-input'], args.join(' '));
    assert.equal(
      refused.json.detail,
      '--all needs the source as a Git address, such as a file: URL, so that packs come from the exact target commit; a local folder path would be read as its current working tree. Prepare without --all, or pass --source with a Git address',
      args.join(' '),
    );
  }
  assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'nothing was prepared');
  assert.deepEqual(snapshot(root), before, 'nothing was written');

  // A core-only preparation from the folder is unaffected.
  const coreOnly = upgradeJson(consumer, 'plan', '--dry-run', '--source', folder, '--ref', 'v9.0.0');
  assert.equal(coreOnly.code, 10, coreOnly.stderr);
  assert.deepEqual(coreOnly.json.counts.packs, {});
  assert.deepEqual(coreOnly.json.counts.core, { added: 2, replaced: 4, removed: 2 });

  // The same repository as a file: URL refreshes packs through Git at the exact commit.
  const address = pathToFileURL(folder).href;
  recordPacksFrom(spelled, address);
  const combined = upgradeJson(consumer, 'plan', '--all', '--dry-run', '--source', address, '--ref', 'v9.0.0');
  assert.equal(combined.code, 10, combined.stderr);
  assert.deepEqual(combined.json.packs.affected, ['alpha']);
  const packPaths = combined.json.changes
    .filter((/** @type {{ group: string }} */ change) => change.group === 'pack')
    .map((/** @type {{ path: string }} */ change) => change.path);
  assert.deepEqual(packPaths, [ALPHA.helper, ALPHA.worker, ALPHA.legacy, ALPHA.notes, ALPHA.detail], 'the committed v9 pack, without the working-tree file');
  assert.equal(packPaths.includes(uncommitted), false);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
});
/* --------------------------------------------------------------- refusals */

test('a target without the staging contract or a canonical manifest, a selected-pack conflict, or an unsafe destination refuses with nothing prepared or written', async () => {
  const shared = await fixture();

  const unsupported = newConsumer(shared);
  const unsupportedBefore = snapshot(unsupported.root);
  const legacy = upgradeJson(unsupported, 'plan', '--ref', 'legacy-engine');
  assert.equal(legacy.code, 40);
  assert.deepEqual([legacy.json.status, legacy.json.reason], ['refused', 'unsupported-target']);
  assert.match(legacy.json.detail, /legacy-engine does not support staged upgrades/);
  assert.deepEqual(fs.readdirSync(unsupported.tmp), []);
  assert.deepEqual(snapshot(unsupported.root), unsupportedBefore);
  // A target needs its own canonical manifest; there is no other manifest path.
  const unmanifested = upgradeJson(unsupported, 'plan', '--ref', 'no-manifest');
  assert.equal(unmanifested.code, 40);
  assert.deepEqual([unmanifested.json.status, unmanifested.json.reason], ['refused', 'invalid-target']);
  assert.match(unmanifested.json.detail, /the target release has no valid \.dude\/metadata\/bundle-manifest\.md/);
  assert.deepEqual(fs.readdirSync(unsupported.tmp), []);
  assert.deepEqual(snapshot(unsupported.root), unsupportedBefore);

  // A foreign file at a new pack destination blocks the combined result only.
  const conflicted = newConsumer(shared);
  write(conflicted.root, ALPHA.helper, 'a project file, not recorded for any pack\n');
  const conflictedBefore = snapshot(conflicted.root);
  const blocked = upgradeJson(conflicted, 'plan', '--all');
  assert.equal(blocked.code, 40);
  assert.deepEqual([blocked.json.status, blocked.json.reason, blocked.json.pack], ['refused', 'pack-failed', 'alpha']);
  assert.match(blocked.json.detail, /destination ownership conflict/);
  assert.match(blocked.json.detail, /prepare without packs for a core-only result/);
  assert.deepEqual(fs.readdirSync(conflicted.tmp), []);
  assert.deepEqual(snapshot(conflicted.root), conflictedBefore);
  const coreOnly = upgradeJson(conflicted, 'plan');
  assert.equal(coreOnly.code, 10, coreOnly.stderr);
  assert.deepEqual(coreOnly.json.counts.packs, {});
  assert.equal(coreOnly.json.changes.some((/** @type {{ path: string }} */ change) => change.path === ALPHA.helper), false);
  const discarded = upgradeJson(conflicted, 'discard', '--plan', coreOnly.json.id);
  assert.equal(discarded.code, 0);
  assert.deepEqual(discarded.json, { status: 'discarded', id: coreOnly.json.id });
  assert.deepEqual(fs.readdirSync(conflicted.tmp), []);
  const declined = upgradeJson(conflicted, 'apply', '--plan', coreOnly.json.id, '--confirm', 'confirm-upgrade');
  assert.deepEqual([declined.code, declined.json.reason], [40, 'not-found']);
  assert.deepEqual(snapshot(conflicted.root), conflictedBefore);

  // Linked or wrong-type destinations refuse before anything is prepared.
  for (const [label, setUp, pattern] of [
    ['a linked core runtime folder', (/** @type {string} */ root) => {
      const linked = path.join(root, '.github', 'extensions', 'dude', 'lib');
      fs.renameSync(linked, path.join(root, 'moved-lib'));
      fs.symlinkSync(path.join(root, 'moved-lib'), linked, process.platform === 'win32' ? 'junction' : 'dir');
    }, /symbolic link/],
    ['a base release record folder', (/** @type {string} */ root) => {
      fs.rmSync(path.join(root, ...BASE_RELEASE.split('/')));
      fs.mkdirSync(path.join(root, ...BASE_RELEASE.split('/')));
    }, /expected a regular file at \.dude\/metadata\/development-base-release\.md/],
  ]) {
    const consumer = newConsumer(shared);
    setUp(consumer.root);
    const before = snapshot(consumer.root);
    const refused = upgradeJson(consumer, 'plan');
    assert.equal(refused.code, 40, label);
    assert.equal(refused.json.status, 'refused', label);
    assert.match(refused.json.detail, pattern, label);
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], label);
    assert.deepEqual(snapshot(consumer.root), before, label);
  }
});

test('a newer installed release, local-path latest, missing metadata, and a cancelled preparation refuse before acquiring anything', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;

  writeManifest(root, shared.source, 'latest', 'v10.0.0');
  const newer = snapshot(root);
  const status = upgradeJson(consumer, 'status');
  assert.deepEqual([status.json.status, status.json.available_ref], ['up_to_date', 'v9.0.0']);
  const downgrade = upgradeJson(consumer, 'plan');
  assert.equal(downgrade.code, 0, downgrade.stderr);
  assert.equal(downgrade.json.status, 'nothing_to_update');
  assert.match(downgrade.json.detail, /never offers a downgrade/);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  assert.deepEqual(snapshot(root), newer);

  writeManifest(root, shared.upstream, 'latest', 'v8.0.0');
  const local = upgradeJson(consumer, 'plan');
  assert.equal(local.code, 40);
  assert.equal(local.json.reason, 'invalid-input');
  assert.match(local.json.detail, /local-path source does not support ref latest; pass an explicit local branch or tag/);
  const explicit = upgradeJson(consumer, 'plan', '--dry-run', '--ref', 'v9.0.0');
  assert.equal(explicit.code, 10, explicit.stderr);
  assert.deepEqual(explicit.json.source, { location: shared.upstream, requested_ref: 'v9.0.0', resolved_ref: 'v9.0.0', commit: shared.commits.v9 });
  assert.deepEqual(explicit.json.counts.core, { added: 2, replaced: 4, removed: 2 });
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);

  fs.rmSync(path.join(root, ...MANIFEST.split('/')));
  const missing = upgradeJson(consumer, 'plan');
  assert.equal(missing.code, 40);
  assert.equal(missing.json.reason, 'invalid-manifest');
  assert.match(missing.json.detail, /canonical bundle manifest missing or malformed at \.dude\/metadata\/bundle-manifest\.md/);
  assert.match(missing.json.detail, /install or copy a current bundle engine/);
  git(root, 'checkout', '-q', '--', MANIFEST);

  const ownTemporary = () => fs.readdirSync(os.tmpdir()).filter((name) => /^dude-up-[0-9a-f]{16}$/.test(name)).sort();
  const earlier = ownTemporary();
  await assert.rejects(
    prepareUpgrade({ root, signal: AbortSignal.abort() }),
    (/** @type {any} */ error) => error.reason === 'cancelled',
  );
  assert.deepEqual(ownTemporary(), earlier, 'a cancelled preparation retains nothing');
  assert.deepEqual(snapshot(root), snapshot(shared.template), 'and writes nothing');
});

test('the preparation deadline also bounds local work: an exhausted core-only budget is refused at once, a deadline that passes during the comparison is refused before the result is retained, and neither keeps anything', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const before = snapshot(root);
  const ownTemporary = () => fs.readdirSync(os.tmpdir()).filter((name) => /^dude-up-[0-9a-f]{16}$/.test(name)).sort();
  const timedOut = (/** @type {any} */ error) => error.reason === 'timeout'
    && error.message === 'the preparation did not finish within 55 seconds';
  const caller = new AbortController();

  // In time, the same preparation in this process is ready, and its deadline no longer listens.
  const earlier = ownTemporary();
  const ready = await prepareUpgrade({ root, signal: caller.signal });
  assert.equal(ready.status, 'ready');
  assert.deepEqual(ownTemporary(), [...earlier, preparedFolder(ready.id)].sort());
  assert.equal(getEventListeners(caller.signal, 'abort').length, 0, 'the finished preparation left no deadline listening');

  // Through the startedAt contract: a core-only budget already spent is refused before any comparison.
  const preparedRoot = path.join(path.dirname(root), 'p');
  fs.cpSync(path.join(os.tmpdir(), preparedFolder(ready.id), 'release'), path.join(preparedRoot, 'release'), { recursive: true });
  discardUpgrade({ root, id: ready.id });
  assert.deepEqual(ownTemporary(), earlier);
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  /** @type {string[]} */
  const phases = [];
  await assert.rejects(target.stageUpgrade({
    workspaceRoot: root,
    preparedRoot,
    source: ready.source,
    includePacks: false,
    startedAt: Date.now() - ACQUISITION_DEADLINE_MS,
    onProgress: (/** @type {{ phase: string }} */ event) => phases.push(event.phase),
  }), timedOut);
  assert.deepEqual(phases, ['staging-core']);
  assert.equal(exists(preparedRoot, 'prepared.json'), false, 'no result was retained');

  // Through the installed engine, with this process's clock moved past the
  // deadline during the target's own synchronous local work.
  for (const [label, phase, seen] of [
    ['a budget spent while the core is staged', 'staging-core', ['fetching', 'staging-core']],
    ['a deadline that passes during the comparison', 'comparing', ['fetching', 'staging-core', 'comparing']],
  ]) {
    /** @type {string[]} */
    const observed = [];
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    try {
      await assert.rejects(prepareUpgrade({
        root,
        signal: caller.signal,
        onProgress: (event) => {
          observed.push(event.phase);
          // As if this local work had taken the whole core-only window.
          if (event.phase === phase) offset = ACQUISITION_DEADLINE_MS;
        },
      }), timedOut, /** @type {string} */ (label));
    } finally {
      Date.now = realNow;
    }
    assert.deepEqual(observed, seen, /** @type {string} */ (label));
    assert.deepEqual(ownTemporary(), earlier, `${label}: no prepared folder or description is kept`);
    assert.equal(getEventListeners(caller.signal, 'abort').length, 0, `${label}: no deadline still listens`);
  }
  assert.deepEqual(snapshot(root), before, 'nothing was written');
});

test('core acquisition is stopped once its prepared folder grows past 1 GiB, long before its 55-second deadline, and retains nothing', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  // A source that accepts the fetch and never answers. An exact commit needs no
  // ref lookup, so the stall is in acquisition, inside the observed folder.
  const silent = await silentGitServer();
  const child = spawn(process.execPath, [
    path.join(consumer.root, ...ENGINE.split('/')), 'plan', '--source', silent.address, '--ref', shared.commits.v9, '--format', 'json',
  ], { cwd: consumer.root, env: consumerEnv(consumer), windowsHide: true });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.resume();
  /** @type {{ exited: boolean, code: number | null }} */
  const run = { exited: false, code: null };
  child.on('close', (code) => Object.assign(run, { exited: true, code }));
  try {
    await until(() => silent.connections >= 1 || run.exited, 30_000, 'acquisition reached the stalled source');
    assert.equal(run.exited, false, `the preparation ended before it fetched: ${stdout}`);
    const folders = fs.readdirSync(consumer.tmp).filter((name) => /^dude-up-[0-9a-f]{16}$/.test(name));
    assert.equal(folders.length, 1, 'acquisition works in its own prepared folder');
    // One byte past 1 GiB, written without data, in the folder being observed.
    const started = performance.now();
    const handle = fs.openSync(path.join(consumer.tmp, folders[0], 'outgrown.bin'), 'wx');
    try {
      fs.ftruncateSync(handle, 2 ** 30 + 1);
    } finally {
      fs.closeSync(handle);
    }
    await until(() => run.exited, 20_000, 'the observed bound stopped acquisition');
    const elapsed = performance.now() - started;
    assert.equal(run.code, 40, stdout);
    const report = JSON.parse(stdout);
    assert.deepEqual([report.status, report.reason], ['refused', 'too-large'], report.detail);
    assert.equal(report.detail, "the upgrade's temporary folder grew past 1 GiB or 65536 files and folders, so its work was stopped");
    assert.ok(elapsed < 15_000, `stopped ${Math.round(elapsed)} ms after the folder passed its bound`);
    await until(() => silent.open === 0, 10_000, 'the stopped Git closed its connection');
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], 'the stopped acquisition retained nothing');
  } finally {
    if (!run.exited) child.kill('SIGKILL');
    await silent.close();
  }
});

test('a selected-pack Compose child gets no prompt, and another host\'s pack is stopped before Compose\'s own 60-second Git deadline', () => {
  // Compose clones any host but github.com with a synchronous Git that has a
  // 60-second deadline of its own; the child is stopped first, with more than
  // the two-second stop allowance to spare.
  for (const location of ['git://127.0.0.1:9418/dude.git', 'file:///C:/up', 'https://example.com/dude.git', 'ssh://git@example.com/dude.git']) {
    assert.equal(composeStopWindowMs(location), 55_000, location);
    assert.ok(60_000 - composeStopWindowMs(location) > 2_000, location);
  }
  // A github.com pack is read over HTTPS within Compose's 120-second bound.
  for (const location of ['https://github.com/E-G-C/dude', 'https://GitHub.com/E-G-C/dude.git']) {
    assert.equal(composeStopWindowMs(location), 130_000, location);
  }

  const temporary = path.join(os.tmpdir(), 'dude-compose-temporary');
  const env = composeEnvironment(temporary, {
    PATH: 'inherited',
    GIT_TERMINAL_PROMPT: '1',
    GIT_ASKPASS: '/usr/lib/git-askpass',
    SSH_ASKPASS: '/usr/lib/ssh-askpass',
    GCM_INTERACTIVE: 'always',
    TMPDIR: '/elsewhere',
    TMP: 'C:\\elsewhere',
    TEMP: 'C:\\elsewhere',
  });
  assert.deepEqual(
    [env.GIT_TERMINAL_PROMPT, env.GIT_ASKPASS, env.SSH_ASKPASS, env.GCM_INTERACTIVE],
    ['0', '', '', 'never'],
    'no terminal prompt, askpass program, or interactive credential manager',
  );
  assert.deepEqual([env.TMPDIR, env.TMP, env.TEMP], [temporary, temporary, temporary], 'every temporary root is in the observed folder');
  assert.equal(env.PATH, 'inherited');
});

test('selected-pack preparation runs Compose as an owned child: a stalled pack source is stopped on cancellation or at the deadline, inside the observed folder, with its connection closed', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // A pack source that accepts connections and never answers, recorded for both packs of the bundle upstream.
  const silent = await silentGitServer();
  try {
    write(root, PROFILE, read(root, PROFILE).toString('utf8').split(shared.source).join(silent.address));
    // A retained release from the real upstream; the stalled source is given to its staging function.
    const retained = upgradeJson(consumer, 'plan');
    assert.equal(retained.code, 10, retained.stderr);
    const release = path.join(consumer.tmp, preparedFolder(retained.json.id), 'release');
    const source = { location: silent.address, requested_ref: 'v9.0.0', resolved_ref: 'v9.0.0', commit: shared.commits.v9 };
    const before = snapshot(root);
    /** @param {string} name */
    const preparedCopy = (name) => {
      const preparedRoot = path.join(path.dirname(root), name);
      fs.cpSync(release, path.join(preparedRoot, 'release'), { recursive: true });
      return preparedRoot;
    };

    // Cancellation once Compose's Git is waiting on the source.
    const cancelRoot = preparedCopy('p1');
    const target = await import(pathToFileURL(path.join(cancelRoot, 'release', ...ENGINE.split('/'))).href);
    const controller = new AbortController();
    /** @type {{ done: boolean, error?: any }} */
    const outcome = { done: false };
    const staging = target.stageUpgrade({ workspaceRoot: root, preparedRoot: cancelRoot, source, includePacks: true, signal: controller.signal })
      .then(() => { outcome.done = true; }, (/** @type {any} */ error) => { Object.assign(outcome, { done: true, error }); });
    await until(() => silent.connections >= 1 || outcome.done, 30_000, 'the pack fetch reached the stalled source');
    assert.equal(outcome.done, false, `staging ended before it reached the source: ${outcome.error?.message}`);
    const cancelledAt = performance.now();
    controller.abort();
    await staging;
    assert.equal(outcome.error?.reason, 'cancelled', outcome.error?.message);
    assert.notEqual(outcome.error?.cleanupConfirmed, false, 'the child process tree was confirmed stopped');
    assert.ok(performance.now() - cancelledAt < 10_000, 'the stalled child was stopped promptly');
    await until(() => silent.open === 0, 10_000, 'the stopped Git closed its connection');
    assert.ok(
      fs.readdirSync(path.join(cancelRoot, 'tmp')).some((name) => name.startsWith('dude-pack-')),
      "Compose's temporary root is inside the observed prepared folder",
    );
    assert.deepEqual(snapshot(root), before);

    // The preparation deadline stops the same stalled source. Two packs are
    // eligible, so the deadline is the core window plus two 130-second pack
    // windows; five seconds of it remain.
    const deadlineRoot = preparedCopy('p2');
    const reached = silent.connections;
    const started = performance.now();
    await assert.rejects(
      target.stageUpgrade({
        workspaceRoot: root,
        preparedRoot: deadlineRoot,
        source,
        includePacks: true,
        startedAt: Date.now() - (ACQUISITION_DEADLINE_MS + 2 * 130_000) + 5_000,
      }),
      (/** @type {any} */ error) => error.reason === 'timeout' && error.cleanupConfirmed !== false,
    );
    const elapsed = performance.now() - started;
    assert.ok(elapsed >= 3_000 && elapsed < 20_000, `stopped at the deadline (${Math.round(elapsed)} ms)`);
    assert.ok(silent.connections > reached, 'the pack fetch had reached the source');
    await until(() => silent.open === 0, 10_000, 'the stopped Git closed its connection');
    assert.deepEqual(snapshot(root), before);
  } finally {
    await silent.close();
  }
});

test('a selected-pack Compose child really gets the no-prompt environment inside its prepared folder, and for a source other than github.com it is stopped at 55 seconds, not after the 130-second pack window', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // A retained release from the real upstream, whose own Compose is replaced by one that stalls.
  const retained = upgradeJson(consumer, 'plan');
  assert.equal(retained.code, 10, retained.stderr);
  const preparedRoot = path.join(path.dirname(root), 'p');
  fs.cpSync(path.join(consumer.tmp, preparedFolder(retained.json.id), 'release'), path.join(preparedRoot, 'release'), { recursive: true });
  const composeFolder = path.join(preparedRoot, 'release', '.github', 'skills', 'dude-compose');
  fs.renameSync(path.join(composeFolder, 'compose.mjs'), path.join(composeFolder, 'compose-real.mjs'));
  fs.writeFileSync(path.join(composeFolder, 'compose.mjs'), STALLED_COMPOSE);
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  // A file: source, which Compose would clone with its own synchronous Git.
  const source = { location: shared.source, requested_ref: 'v9.0.0', resolved_ref: 'v9.0.0', commit: shared.commits.v9 };
  // This process allows every prompt, so only the child's own environment can refuse them.
  const prompts = { GIT_TERMINAL_PROMPT: '1', GIT_ASKPASS: 'dude-askpass', SSH_ASKPASS: 'dude-ssh-askpass', GCM_INTERACTIVE: 'always' };
  const saved = Object.fromEntries(Object.keys(prompts).map((name) => [name, process.env[name]]));
  const restore = () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  Object.assign(process.env, prompts);
  const controller = new AbortController();
  /** @type {{ done: boolean, error?: any }} */
  const outcome = { done: false };
  const started = performance.now();
  const staging = target.stageUpgrade({ workspaceRoot: root, preparedRoot, source, includePacks: true, signal: controller.signal })
    .then(() => { outcome.done = true; }, (/** @type {any} */ error) => { Object.assign(outcome, { done: true, error }); });
  try {
    const temporary = path.join(preparedRoot, 'tmp');
    const record = path.join(temporary, 'compose-environment.json');
    await until(() => fs.existsSync(record) || outcome.done, 30_000, 'the Compose child started');
    restore();
    assert.equal(outcome.done, false, `staging ended before Compose started: ${outcome.error?.message}`);
    const { pid, ...given } = JSON.parse(fs.readFileSync(record, 'utf8'));
    assert.deepEqual(given, {
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
      SSH_ASKPASS: '',
      GCM_INTERACTIVE: 'never',
      TMPDIR: temporary,
      TMP: temporary,
      TEMP: temporary,
    }, 'no prompt of any kind, and every temporary root inside the observed prepared folder');

    // Two packs are eligible, so the whole preparation may take 55 + 2 x 130 seconds;
    // this child alone is stopped at 55, before Compose's own 60-second Git deadline.
    await until(() => outcome.done, 75_000, 'the stalled Compose child was stopped');
    const elapsed = performance.now() - started;
    assert.equal(outcome.error?.reason, 'pack-failed', outcome.error?.message);
    assert.equal(outcome.error?.pack, 'alpha');
    assert.match(outcome.error?.message, /: it did not finish within 55 seconds; prepare without packs for a core-only result$/);
    assert.notEqual(outcome.error?.cleanupConfirmed, false, 'the child process tree was confirmed stopped');
    assert.ok(elapsed >= 55_000 && elapsed < 75_000, `stopped after ${Math.round(elapsed)} ms`);
    assert.equal(isRunning(pid), false, 'the Compose child no longer runs');
  } finally {
    restore();
    controller.abort();
    await staging;
    fs.rmSync(preparedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('a preparation whose process could not be confirmed stopped keeps its folder, names it, and never offers it as a result', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const before = snapshot(consumer.root);
  const refused = upgradeJson(consumer, 'plan', '--ref', 'unconfirmed-stop');
  assert.equal(refused.code, 40, refused.stderr);
  assert.deepEqual([refused.json.status, refused.json.reason, refused.json.pack], ['refused', 'pack-failed', 'alpha']);
  const kept = fs.readdirSync(consumer.tmp);
  assert.equal(kept.length, 1);
  assert.match(kept[0], /^dude-up-[0-9a-f]{16}$/);
  const keptRoot = path.join(consumer.tmp, kept[0]);
  assert.ok(
    refused.json.detail.endsWith(`; a process could not be confirmed stopped, so its temporary material was kept at ${keptRoot}`),
    refused.json.detail,
  );
  assert.equal(exists(keptRoot, 'still-in-use.txt'), true, 'the material is kept');
  assert.equal(exists(keptRoot, 'prepared.json'), false, 'and it is no prepared result');
  assert.deepEqual(snapshot(consumer.root), before);
});

test('on Windows, a stopped pack preparation ends Compose before its Git, so a Git that ends first starts no full-clone fallback, and only the process table confirms the stop', {
  skip: process.platform !== 'win32' && 'Windows stops a process tree process by process; elsewhere the owned process group is stopped at once',
}, async (t) => {
  const shared = await fixture();
  // A retained release from the real upstream, copied for each case.
  const base = newConsumer(shared);
  const retained = upgradeJson(base, 'plan');
  assert.equal(retained.code, 10, retained.stderr);
  const release = path.join(base.tmp, preparedFolder(retained.json.id), 'release');

  for (const kill of ['a kill that ends the native Git first', 'a kill that fails']) await t.test(kill, async () => {
    const consumer = newConsumer(shared);
    const preparedRoot = path.join(path.dirname(consumer.root), 'p');
    const silent = await silentGitServer();
    /** @type {ProcessRow[]} */
    let tree = [];
    /** @type {{ composeRunning: boolean | null, nativeCloneEnded: boolean }} */
    const firstKill = { composeRunning: null, nativeCloneEnded: false };
    let kills = 0;
    const taskkill = replaceTaskkill((run, fail) => {
      kills += 1;
      if (kill === 'a kill that fails') {
        fail();
        return;
      }
      if (kills > 1) {
        run();
        return;
      }
      // As a tree kill can: end the native shallow clone first, then leave its
      // parents a second, in which a running Compose would start its full clone.
      const clone = tree.findLast((member) => member.name.toLowerCase() === 'git.exe'
        && /\bclone\b/.test(member.commandLine ?? '') && (member.commandLine ?? '').includes('--depth=1'));
      firstKill.composeRunning = isRunning(tree[0].pid);
      if (clone && isRunning(clone.pid)) {
        process.kill(clone.pid, 'SIGKILL');
        firstKill.nativeCloneEnded = true;
      }
      setTimeout(run, 1_000);
    });
    try {
      fs.cpSync(release, path.join(preparedRoot, 'release'), { recursive: true });
      write(consumer.root, PROFILE, read(consumer.root, PROFILE).toString('utf8').split(shared.source).join(silent.address));
      const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
      const source = { location: silent.address, requested_ref: 'v9.0.0', resolved_ref: 'v9.0.0', commit: shared.commits.v9 };
      /** @type {{ done: boolean, error?: any }} */
      const outcome = { done: false };
      const staging = target.stageUpgrade({ workspaceRoot: consumer.root, preparedRoot, source, includePacks: true })
        .then(() => { outcome.done = true; }, (/** @type {any} */ error) => { Object.assign(outcome, { done: true, error }); });
      await until(() => silent.connections >= 1 || outcome.done, 60_000, "Compose's Git reached the stalled source");
      assert.equal(outcome.done, false, `staging ended before it reached the source: ${outcome.error?.message}`);
      // Compose and every process it started, by exact identity, before the stop.
      const rows = await processTable();
      const compose = rows.find((row) => row.name.toLowerCase() === 'node.exe'
        && (row.commandLine ?? '').includes('compose.mjs') && (row.commandLine ?? '').includes(preparedRoot));
      assert.ok(compose, 'Compose runs as an owned child process');
      tree = processTree(rows, compose);
      assert.ok(tree.some((member) => member.name.toLowerCase() === 'git.exe' && /\bclone\b/.test(member.commandLine ?? '')),
        `the native shallow clone runs under Compose: ${JSON.stringify(tree)}`);

      // The prepared folder reaches its observed bound, which stops the preparation.
      const handle = fs.openSync(path.join(preparedRoot, 'outgrown.bin'), 'wx');
      try {
        fs.ftruncateSync(handle, 2 ** 30);
      } finally {
        fs.closeSync(handle);
      }
      await staging;
      assert.equal(outcome.error?.reason, 'pack-failed', outcome.error?.message);
      assert.match(outcome.error?.message, /grew past 1 GiB or 65536 files and folders/);
      assert.equal(isRunning(compose.pid), false, 'Compose itself was stopped');
      assert.equal(silent.connections, 1, 'no second source contact: Compose started no full-clone fallback');

      if (kill === 'a kill that fails') {
        // Its descendants still run, so the stop stays unconfirmed and the caller keeps the folder.
        assert.ok(taskkill.calls.length > 0, 'the descendants were to be stopped');
        assert.notDeepEqual(await survivors(tree.slice(1), 0), [], 'the failed kills left descendants running');
        assert.equal(outcome.error?.cleanupConfirmed, false, 'a stop the process table cannot confirm stays unconfirmed');
        return;
      }
      assert.equal(firstKill.composeRunning, false, 'Compose had ended before any process it started was stopped');
      assert.equal(firstKill.nativeCloneEnded, true, 'the native shallow clone then ended before the rest of the tree');
      const owned = (await processTable()).filter((row) => (row.commandLine ?? '').includes(preparedRoot));
      const recorded = [...new Map([...tree, ...owned].map((member) => [`${member.pid}:${member.created}`, member])).values()];
      assert.deepEqual(await survivors(recorded), [], 'no recorded or folder-owning process survived the stop');
      assert.equal(outcome.error?.cleanupConfirmed, true, 'the process table confirmed the stop');
      await until(() => silent.open === 0, 10_000, 'the stopped Git closed its connection');
      // Confirmed, so nothing holds the folder and it can go at once.
      fs.rmSync(preparedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      assert.equal(fs.existsSync(preparedRoot), false);
    } finally {
      taskkill.restore();
      // Whatever a failed case left running, by exact identity, before the peer goes.
      const rows = await processTable();
      for (const row of rows) {
        const recorded = tree.some((member) => member.pid === row.pid && member.created === row.created);
        if (recorded || (row.commandLine ?? '').includes(preparedRoot)) {
          try {
            process.kill(row.pid, 'SIGKILL');
          } catch {
            // It ended first.
          }
        }
      }
      await silent.close();
      fs.rmSync(preparedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
/* ------------------------------------------------------------------ drift */

test('apply refuses drift in every touched kind, record, workspace, branch, and retained byte, writes nothing, and needs a fresh preview', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const planned = upgradeJson(consumer, 'plan', '--all');
  assert.equal(planned.code, 10, planned.stderr);
  const { id } = planned.json;
  const preparedRoot = path.join(consumer.tmp, preparedFolder(id));
  // The installed engine hands a prepared result to this retained target code.
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  const prepared = description(preparedRoot);
  const baseline = snapshot(root);
  const state = gitState(root);

  /** @param {string} relativePath */
  const edit = (relativePath) => write(root, relativePath, Buffer.concat([read(root, relativePath), Buffer.from('drift\n')]));
  /** @param {string} relativePath */
  const remove = (relativePath) => fs.rmSync(path.join(root, ...relativePath.split('/')));
  /** @param {string} relativePath */
  const create = (relativePath) => write(root, relativePath, 'appeared after the preview\n');
  for (const [label, relativePath, change] of [
    ['a replaced core file', REPLACED[1], edit],
    ['a missing replaced core file', REPLACED[2], remove],
    ['a removed core file', RETIRED[1], remove],
    ['an edited core file the update removes', RETIRED[0], edit],
    ['an added core path', ADDED[0], create],
    ['a replaced pack file', ALPHA.notes, edit],
    ['an added pack path', ALPHA.detail, create],
    ['the bundle manifest', MANIFEST, edit],
    ['the base release record', BASE_RELEASE, remove],
    ['the upgrade log', LOG, edit],
    ['the pack profile', PROFILE, edit],
  ]) {
    const original = exists(root, relativePath) ? read(root, relativePath) : null;
    change(relativePath);
    const drifted = snapshot(root);
    const result = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
    assert.equal(result.outcome, 'nothing_changed', label);
    assert.match(result.reason, new RegExp(`^${escapeRegExp(relativePath)} changed since the preview; prepare the upgrade again$`), label);
    assert.deepEqual(snapshot(root), drifted, `${label}: nothing was written`);
    if (original === null) remove(relativePath);
    else write(root, relativePath, original);
    assert.deepEqual(snapshot(root), baseline);
  }

  // A folder where the update adds a file is drift too.
  fs.mkdirSync(path.join(root, ...ADDED[1].split('/')));
  const occupied = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
  assert.equal(occupied.outcome, 'nothing_changed');
  assert.match(occupied.reason, new RegExp(`^expected a regular file at ${escapeRegExp(ADDED[1])}; prepare the upgrade again$`));
  fs.rmdirSync(path.join(root, ...ADDED[1].split('/')));
  assert.deepEqual(snapshot(root), baseline);

  git(root, 'checkout', '-q', '-b', 'elsewhere');
  const otherBranch = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
  assert.equal(otherBranch.outcome, 'nothing_changed');
  assert.match(otherBranch.reason, /^the current branch is elsewhere, not main/);
  git(root, 'checkout', '-q', 'main');
  git(root, 'branch', '-q', '-D', 'elsewhere');

  // The result is bound to its workspace: another project can neither find nor apply it.
  const other = newConsumer(shared);
  const otherBefore = snapshot(other.root);
  const elsewhere = upgradeJson({ root: other.root, tmp: consumer.tmp }, 'apply', '--plan', id, '--confirm', 'confirm-upgrade');
  assert.deepEqual([elsewhere.code, elsewhere.json.status, elsewhere.json.reason], [40, 'refused', 'other-workspace']);
  const misbound = await target.applyPreparedUpgrade({ workspaceRoot: other.root, preparedRoot, prepared });
  assert.deepEqual([misbound.outcome, misbound.reason], ['nothing_changed', 'this result was prepared for another workspace']);
  assert.deepEqual(snapshot(other.root), otherBefore);
  assert.deepEqual(fs.readdirSync(consumer.tmp), [preparedFolder(id)], 'a refused lookup keeps the result for its own workspace');

  const stagedFile = path.join(preparedRoot, 'stage', ...REPLACED[1].split('/'));
  const stagedBytes = fs.readFileSync(stagedFile);
  fs.writeFileSync(stagedFile, 'tampered after the preview\n');
  const tampered = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
  assert.equal(tampered.outcome, 'nothing_changed');
  assert.match(tampered.reason, new RegExp(`^the prepared bytes for ${escapeRegExp(REPLACED[1])} changed`));
  fs.writeFileSync(stagedFile, stagedBytes);
  assert.deepEqual(snapshot(root), baseline);
  assert.deepEqual(gitState(root), state);

  // Through chat, a refusal releases the result, so only a fresh preview can apply.
  edit(REPLACED[1]);
  const drifted = snapshot(root);
  const refused = upgradeJson(consumer, 'apply', '--plan', id, '--confirm', 'confirm-upgrade');
  assert.equal(refused.code, 40);
  assert.equal(refused.json.outcome, 'nothing_changed');
  assert.match(refused.json.reason, /changed since the preview; prepare the upgrade again/);
  assert.deepEqual(snapshot(root), drifted);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  const retried = upgradeJson(consumer, 'apply', '--plan', id, '--confirm', 'confirm-upgrade');
  assert.deepEqual([retried.code, retried.json.reason], [40, 'not-found']);
  const text = upgrade(consumer, 'plan');
  const fresh = /** @type {string} */ (/^Prepared ID: ([0-9a-f]{32})$/m.exec(text.stdout)?.[1]);
  const applied = upgrade(consumer, 'apply', '--plan', fresh, '--confirm', 'confirm-upgrade');
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.match(applied.stdout, /^Applied v8\.0\.0 -> v9\.0\.0 on branch main; the changes are uncommitted\.$/m);
  assert.match(applied.stdout, /Git cannot recover pre-existing uncommitted edits that the update overwrote/);
  assert.match(applied.stdout, /`git restore -- <path>` returns a\s+modified or deleted tracked file to its staged version, which is its committed version unless you staged a change\s+to it \(`git restore --source=HEAD -- <path>` takes the committed version\); delete an untracked file the update added/);
  assert.deepEqual(read(root, REPLACED[1]), gitBlob(shared.upstream, `${shared.commits.v9}:${REPLACED[1]}`));
});

test('apply refuses drift in a guarded record that the update itself leaves unchanged', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // The manifest already names the target and no base record exists, so the
  // update rewrites neither: each is only a guarded record of the result.
  writeManifest(root, shared.source, 'latest', 'v9.0.0');
  fs.rmSync(path.join(root, ...BASE_RELEASE.split('/')));
  const planned = upgradeJson(consumer, 'plan');
  assert.equal(planned.code, 10, planned.stderr);
  const touched = planned.json.changes.map((/** @type {{ path: string }} */ change) => change.path);
  assert.deepEqual([touched.includes(MANIFEST), touched.includes(BASE_RELEASE), touched.includes(LOG)], [false, false, true]);
  const preparedRoot = path.join(consumer.tmp, preparedFolder(planned.json.id));
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  const prepared = description(preparedRoot);
  const baseline = snapshot(root);

  const manifestBytes = read(root, MANIFEST);
  for (const [label, relativePath, drift, undo] of [
    ['the unchanged manifest', MANIFEST, () => write(root, MANIFEST, Buffer.concat([manifestBytes, Buffer.from('drift\n')])),
      () => write(root, MANIFEST, manifestBytes)],
    ['the absent base release record', BASE_RELEASE, () => write(root, BASE_RELEASE, STALE_RECORD),
      () => fs.rmSync(path.join(root, ...BASE_RELEASE.split('/')))],
  ]) {
    /** @type {() => void} */ (drift)();
    const drifted = snapshot(root);
    const result = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
    assert.equal(result.outcome, 'nothing_changed', /** @type {string} */ (label));
    assert.equal(result.reason, `${relativePath} changed since the preview; prepare the upgrade again`, /** @type {string} */ (label));
    assert.deepEqual(snapshot(root), drifted, `${label}: nothing was written`);
    /** @type {() => void} */ (undo)();
    assert.deepEqual(snapshot(root), baseline);
  }

  // Unchanged, the same result applies.
  const applied = upgradeJson(consumer, 'apply', '--plan', planned.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(applied.code, 0, JSON.stringify(applied.json));
  assert.equal(applied.json.outcome, 'applied');
  assert.deepEqual(read(root, MANIFEST), manifestBytes);
});

test('apply checks the prepared ID against the retained description and release files before running retained code, and a changed result writes nothing', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const before = snapshot(root);
  const state = gitState(root);
  const marker = path.join(path.dirname(root), 'retained-engine-ran.txt');
  /** @type {[string, (preparedRoot: string) => void][]} */
  const changes = [
    ['an operation removed from the description', (preparedRoot) => {
      const file = path.join(preparedRoot, 'prepared.json');
      const prepared = JSON.parse(fs.readFileSync(file, 'utf8'));
      const kept = prepared.changes.filter((/** @type {{ path: string }} */ change) => change.path !== LOG);
      assert.equal(kept.length, prepared.changes.length - 1);
      fs.writeFileSync(file, `${JSON.stringify({ ...prepared, changes: kept }, null, 2)}\n`);
    }],
    ['retained engine code that would run on import', (preparedRoot) => {
      fs.appendFileSync(path.join(preparedRoot, 'release', ...ENGINE.split('/')), `\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\n`);
    }],
    ['a changed retained linter', (preparedRoot) => {
      fs.appendFileSync(path.join(preparedRoot, 'release', ...LINT.split('/')), '\n// changed after the preview\n');
    }],
    ['an added retained module', (preparedRoot) => {
      write(path.join(preparedRoot, 'release'), '.github/skills/dude-bundle-upgrade/lib/added.mjs', 'export {};\n');
    }],
  ];
  for (const [label, change] of changes) {
    const planned = upgradeJson(consumer, 'plan');
    assert.equal(planned.code, 10, `${label}: ${planned.stderr}`);
    change(path.join(consumer.tmp, preparedFolder(planned.json.id)));
    const applied = upgradeJson(consumer, 'apply', '--plan', planned.json.id, '--confirm', 'confirm-upgrade');
    assert.equal(applied.code, 40, `${label}: ${JSON.stringify(applied.json)}`);
    assert.deepEqual(
      [applied.json.id, applied.json.outcome, applied.json.reason],
      [planned.json.id, 'nothing_changed', 'the prepared upgrade changed since the preview; prepare the upgrade again'],
      label,
    );
    assert.equal(fs.existsSync(marker), false, `${label}: no retained code ran`);
    assert.deepEqual(snapshot(root), before, `${label}: nothing was written`);
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], `${label}: the changed result is released`);
    const again = upgradeJson(consumer, 'apply', '--plan', planned.json.id, '--confirm', 'confirm-upgrade');
    assert.deepEqual([again.code, again.json.reason], [40, 'not-found'], label);
  }
  assert.deepEqual(gitState(root), state);
});

test('an earlier prepared result that cannot be invalidated refuses its replacement and its own apply, writes nothing, and stays usable', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const before = snapshot(root);
  const first = upgradeJson(consumer, 'plan');
  assert.equal(first.code, 10, first.stderr);
  const firstRoot = path.join(consumer.tmp, preparedFolder(first.json.id));
  // A folder occupies the name the description would be renamed to.
  fs.mkdirSync(path.join(firstRoot, 'released.json'));

  const replacement = upgradeJson(consumer, 'plan');
  assert.equal(replacement.code, 40, replacement.stderr);
  assert.equal(replacement.json.reason, 'invalidation-failed');
  assert.ok(replacement.json.detail.startsWith(`the earlier prepared upgrade at ${firstRoot} could not be invalidated, so no new one was prepared: `),
    replacement.json.detail);
  assert.deepEqual(fs.readdirSync(consumer.tmp), [preparedFolder(first.json.id)], 'no second result was prepared');

  const blocked = upgradeJson(consumer, 'apply', '--plan', first.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(blocked.code, 40, JSON.stringify(blocked.json));
  assert.equal(blocked.json.outcome, 'nothing_changed');
  assert.ok(blocked.json.reason.startsWith('the prepared upgrade could not be marked as used, so nothing was applied: '), blocked.json.reason);
  assert.ok(blocked.json.reason.endsWith(`; it is still at ${firstRoot}`), blocked.json.reason);
  assert.deepEqual(snapshot(root), before, 'nothing was written');

  // Once the name is free, the same result is still the one usable result.
  fs.rmdirSync(path.join(firstRoot, 'released.json'));
  const discarded = upgradeJson(consumer, 'discard', '--plan', first.json.id);
  assert.deepEqual([discarded.code, discarded.json], [0, { status: 'discarded', id: first.json.id }]);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
  assert.deepEqual(snapshot(root), before);
});

test('a prepared result whose folder cannot be removed is invalidated first, named, and never usable again', {
  skip: process.platform !== 'win32' && process.getuid?.() === 0 && 'a read-only folder does not stop removal by root',
}, async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const before = snapshot(root);

  // A replacing preparation invalidates the earlier result and names the folder it could not remove.
  const first = upgradeJson(consumer, 'plan');
  assert.equal(first.code, 10, first.stderr);
  const firstRoot = path.join(consumer.tmp, preparedFolder(first.json.id));
  let release = await holdRemoval(path.join(firstRoot, 'release', '.github', 'skills'));
  let second;
  try {
    second = upgradeJson(consumer, 'plan');
  } finally {
    await release();
  }
  assert.equal(second.code, 10, second.stderr);
  assert.ok(second.json.cleanup?.startsWith(`the prepared upgrade at ${firstRoot} could not be removed, so it was kept there: `), `cleanup: ${second.json.cleanup}`);
  assert.equal(fs.existsSync(firstRoot), true, 'the folder is kept');
  assert.equal(exists(firstRoot, 'prepared.json'), false, 'its description was invalidated first');
  const replaced = upgradeJson(consumer, 'apply', '--plan', first.json.id, '--confirm', 'confirm-upgrade');
  assert.deepEqual([replaced.code, replaced.json.reason], [40, 'not-found'], 'the replaced ID is never usable again');
  assert.deepEqual(snapshot(root), before);

  // A used result whose folder cannot be removed cannot apply again, even once the files are back.
  const secondRoot = path.join(consumer.tmp, preparedFolder(second.json.id));
  const original = read(root, REPLACED[1]);
  write(root, REPLACED[1], Buffer.concat([original, Buffer.from('drift\n')]));
  release = await holdRemoval(path.join(secondRoot, 'release', '.github', 'skills'));
  let used;
  try {
    used = upgradeJson(consumer, 'apply', '--plan', second.json.id, '--confirm', 'confirm-upgrade');
  } finally {
    await release();
  }
  assert.equal(used.code, 40, JSON.stringify(used.json));
  assert.deepEqual([used.json.id, used.json.outcome], [second.json.id, 'nothing_changed']);
  assert.ok(used.json.cleanup?.startsWith(`the prepared upgrade at ${secondRoot} could not be removed, so it was kept there: `), `cleanup: ${used.json.cleanup}`);
  assert.equal(exists(secondRoot, 'prepared.json'), false);
  write(root, REPLACED[1], original);
  assert.deepEqual(snapshot(root), before);
  const again = upgradeJson(consumer, 'apply', '--plan', second.json.id, '--confirm', 'confirm-upgrade');
  assert.deepEqual([again.code, again.json.reason], [40, 'not-found'], 'the used ID is never usable again');
  assert.deepEqual(snapshot(root), before, 'nothing was written');
});
/* ------------------------------------------------------------------- lint */

test('the target linter: a same-count replacement failure restores every touched file, including overwritten local edits', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // The project's own edit of a core skill is an existing failure that the target fixes.
  const lintSkill = '.github/skills/dude-lint/SKILL.md';
  write(root, lintSkill, read(root, lintSkill).toString('utf8').replace(/^name: .*$/m, 'name: "dude-lint-edited"'));
  const before = snapshot(root);
  const state = gitState(root);
  const planned = upgradeJson(consumer, 'plan', '--ref', 'lint-new');
  assert.equal(planned.code, 10, planned.stderr);
  assert.deepEqual(planned.json.dirty_paths, [lintSkill]);
  assert.ok(planned.json.changes.some((/** @type {{ path: string, op: string }} */ change) => change.path === lintSkill && change.op === 'replace'));

  const applied = upgradeJson(consumer, 'apply', '--plan', planned.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(applied.code, 40, JSON.stringify(applied.json));
  assert.equal(applied.json.outcome, 'restored');
  assert.match(applied.json.reason, /the update introduced 1 new bundle check failure/);
  assert.deepEqual(applied.json.new_failures, [
    ".github/skills/dude-broken/SKILL.md  frontmatter name 'dude-wrong' must match directory 'dude-broken'",
  ]);
  assert.deepEqual(snapshot(root), before, 'every core and metadata file is back, with the local edit');
  assert.equal(exists(root, '.github/skills/dude-broken'), false, 'a folder the batch created is removed');
  assert.deepEqual(gitState(root), state);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
});

test('the target linter: only new failure identities or occurrences restore, and an unreadable check never passes', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const scenario = (/** @type {string} */ name) => write(root, 'lint-scenario.txt', `${name}\n`);

  // Through chat: a new failure restores the batch and reports it.
  scenario('new');
  const before = snapshot(root);
  const first = upgradeJson(consumer, 'plan', '--ref', 'lint-script');
  assert.equal(first.code, 10, first.stderr);
  const restored = upgrade(consumer, 'apply', '--plan', first.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(restored.status, 40, restored.stdout + restored.stderr);
  assert.match(restored.stdout, /^Files restored: the update introduced 1 new bundle check failure\(s\)$/m);
  assert.match(restored.stdout, /^ {2}new failure: fixture failure B$/m);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);

  // The retained target code against one prepared result, scenario by scenario.
  const planned = upgradeJson(consumer, 'plan', '--ref', 'lint-script');
  assert.equal(planned.code, 10, planned.stderr);
  const preparedRoot = path.join(consumer.tmp, preparedFolder(planned.json.id));
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  const prepared = description(preparedRoot);
  for (const [name, outcome, detail, failures] of [
    ['crash-before', 'nothing_changed', /^the bundle check could not run before writing: its report was unreadable \(exit 3\)$/, null],
    ['duplicate', 'restored', /introduced 1 new bundle check failure/, ['fixture failure A']],
    ['replacement', 'restored', /introduced 1 new bundle check failure/, ['fixture failure B']],
    ['crash-after', 'restored', /^the bundle check could not run after writing: its report was unreadable \(exit 3\)$/, []],
    ['unreadable-after', 'restored', /^the bundle check could not run after writing: its report was unreadable \(exit 0\)$/, []],
    ['oversized-after', 'restored', /^the bundle check could not run after writing: its report exceeded 16 MiB$/, []],
  ]) {
    scenario(name);
    const unchanged = snapshot(root);
    const result = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
    assert.equal(result.outcome, outcome, name);
    assert.match(result.reason, detail, name);
    if (failures) assert.deepEqual(result.new_failures, failures, name);
    assert.deepEqual(snapshot(root), unchanged, `${name}: every touched file is as it was`);
  }

  // An unchanged existing failure permits the update and stays disclosed.
  scenario('existing');
  const applied = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
  assert.equal(applied.outcome, 'applied');
  assert.deepEqual(applied.existing_failures, ['fixture failure A']);
  assert.equal(exists(root, '.github/skills/dude-marker/SKILL.md'), true);
  assert.deepEqual(read(root, LINT), Buffer.from(SCRIPTED_LINT), 'the target linter was applied as the target bytes');
});
/* -------------------------------------------------------- apply progress */

/**
 * The scripted linter's record of its runs beside a consumer, in order: whether
 * the update was in place (`before` or `after`), and whether the apply had
 * already reported its bundle check when the run started.
 * @param {string} root
 */
function lintRuns(root) {
  const log = path.join(path.dirname(root), 'lint-runs.log');
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
}

/**
 * A progress listener that records each event with what had happened when it
 * came: whether every reviewed change was in place, and which bundle checks had
 * run. It then marks the report beside the project, where the scripted linter
 * looks for it.
 * @param {string} root
 * @param {{ path: string, after: { sha256: string } | null }[]} changes
 */
function checkingListener(root, changes) {
  /** @type {{ event: Record<string, unknown>, frozen: boolean, written: boolean, runs: string[] }[]} */
  const heard = [];
  const inPlace = () => changes.every((change) => (change.after === null ? !exists(root, change.path)
    : exists(root, change.path) && createHash('sha256').update(read(root, change.path)).digest('hex') === change.after.sha256));
  /** @param {Readonly<Record<string, unknown>>} event */
  const onProgress = (event) => {
    heard.push({ event: { ...event }, frozen: Object.isFrozen(event), written: inPlace(), runs: lintRuns(root) });
    fs.writeFileSync(path.join(path.dirname(root), 'checking-reported'), '');
  };
  return { heard, onProgress };
}

test('apply reports its bundle check once, after every file is written and before the check runs, also before a restored outcome and through the installed engine', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const once = [{ event: { phase: 'checking' }, frozen: true, written: true, runs: ['before unreported'] }];

  // A new failure after writing: the check is reported before it runs, and the files are still restored.
  write(root, 'lint-scenario.txt', 'new\n');
  const before = snapshot(root);
  const planned = upgradeJson(consumer, 'plan', '--ref', 'lint-script');
  assert.equal(planned.code, 10, planned.stderr);
  const preparedRoot = path.join(consumer.tmp, preparedFolder(planned.json.id));
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  const prepared = description(preparedRoot);
  let listener = checkingListener(root, prepared.changes);
  const restored = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared, onProgress: listener.onProgress });
  assert.deepEqual([restored.outcome, restored.new_failures], ['restored', ['fixture failure B']], JSON.stringify(restored));
  assert.deepEqual(listener.heard, once, 'one report, once every file was written and before the check after writing ran');
  assert.deepEqual(lintRuns(root), ['before unreported', 'after reported'], 'the check after writing started only after the report');
  assert.deepEqual(snapshot(root), before, 'every touched file was restored');
  const discarded = upgradeJson(consumer, 'discard', '--plan', planned.json.id);
  assert.equal(discarded.code, 0, JSON.stringify(discarded.json));

  // The installed engine hands the listener to the retained target engine.
  for (const name of ['lint-runs.log', 'checking-reported']) fs.rmSync(path.join(path.dirname(root), name));
  fs.rmSync(path.join(root, 'lint-scenario.txt'));
  const ready = await prepareUpgrade({ root, ref: 'lint-script' });
  assert.equal(ready.status, 'ready');
  listener = checkingListener(root, description(path.join(os.tmpdir(), preparedFolder(ready.id))).changes);
  const applied = await applyUpgrade({ root, id: ready.id, onProgress: listener.onProgress });
  assert.equal(applied.outcome, 'applied', JSON.stringify(applied));
  assert.deepEqual(listener.heard, once);
  assert.deepEqual(lintRuns(root), ['before unreported', 'after reported']);
  assert.equal(exists(root, '.github/skills/dude-marker/SKILL.md'), true, 'the update stays applied');
  assert.equal(fs.existsSync(path.join(os.tmpdir(), preparedFolder(ready.id))), false, 'the applied result was released');
});

test('apply reports no bundle check when it refuses before writing, and a listener that throws changes no outcome', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const planned = upgradeJson(consumer, 'plan', '--ref', 'lint-script');
  assert.equal(planned.code, 10, planned.stderr);
  const preparedRoot = path.join(consumer.tmp, preparedFolder(planned.json.id));
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  const prepared = description(preparedRoot);
  /** @type {unknown[]} */
  const heard = [];
  const onProgress = (/** @type {unknown} */ event) => { heard.push(event); };

  // Refusals before writing report nothing.
  const original = read(root, REPLACED[1]);
  write(root, REPLACED[1], Buffer.concat([original, Buffer.from('drift\n')]));
  const drifted = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared, onProgress });
  assert.deepEqual([drifted.outcome, drifted.reason],
    ['nothing_changed', `${REPLACED[1]} changed since the preview; prepare the upgrade again`]);
  write(root, REPLACED[1], original);
  write(root, 'lint-scenario.txt', 'crash-before\n');
  const unchecked = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared, onProgress });
  assert.deepEqual([unchecked.outcome, unchecked.reason],
    ['nothing_changed', 'the bundle check could not run before writing: its report was unreadable (exit 3)']);
  assert.deepEqual(heard, [], 'nothing was written, so no check after writing was reported');

  // A listener that throws neither restores an update nor replaces the real reason for restoring one.
  let calls = 0;
  const throwing = () => {
    calls += 1;
    throw new Error('the listener failed');
  };
  write(root, 'lint-scenario.txt', 'new\n');
  const unchanged = snapshot(root);
  const restored = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared, onProgress: throwing });
  assert.deepEqual([restored.outcome, restored.reason, restored.new_failures],
    ['restored', 'the update introduced 1 new bundle check failure(s)', ['fixture failure B']]);
  assert.deepEqual(snapshot(root), unchanged);
  fs.rmSync(path.join(root, 'lint-scenario.txt'));
  const applied = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared, onProgress: throwing });
  assert.deepEqual([applied.outcome, applied.existing_failures], ['applied', []], JSON.stringify(applied));
  assert.equal(calls, 2, 'each application reported its check once');
  assert.deepEqual(read(root, REPLACED[1]), gitBlob(shared.upstream, `lint-script:${REPLACED[1]}`), 'the applied update was not restored');
  assert.equal(exists(root, '.github/skills/dude-marker/SKILL.md'), true);
});
/* ------------------------------------------------------------ permissions */

/** @param {string} root @param {string} relativePath @returns {number} the file's permission bits */
const permission = (root, relativePath) => fs.statSync(path.join(root, ...relativePath.split('/'))).mode & 0o777;

/** @param {string} root @returns {Map<string, number>} every non-Git file and its permission bits */
function permissions(root) {
  /** @type {Map<string, number>} */
  const files = new Map();
  /** @param {string} relativeDirectory */
  const walk = (relativeDirectory) => {
    const absolute = path.join(root, ...relativeDirectory.split('/').filter(Boolean));
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (relativePath === '.git') continue;
      if (entry.isDirectory()) walk(relativePath);
      else if (entry.isFile()) files.set(relativePath, permission(root, relativePath));
    }
  };
  walk('');
  return files;
}

/** @param {string} root @param {[string, number][]} entries */
function setPermissions(root, entries) {
  for (const [relativePath, bits] of entries) fs.chmodSync(path.join(root, ...relativePath.split('/')), bits);
}

test('on POSIX, acquisition writes exactly the release files Git records as 100755 as executable, and the retained result marks each written file the release makes executable', {
  skip: POSIX_ONLY,
}, async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const planned = upgradeJson(consumer, 'plan', '--all', '--ref', 'perm');
  assert.equal(planned.code, 10, planned.stderr);
  const preparedRoot = path.join(consumer.tmp, preparedFolder(planned.json.id));

  const executable = [...permissions(path.join(preparedRoot, 'release'))]
    .filter(([, bits]) => (bits & 0o111) !== 0)
    .sort(([left], [right]) => codeUnitCompare(left, right));
  assert.deepEqual(executable, [[CORE_SCRIPT.added, 0o755], [CORE_SCRIPT.existing, 0o755], [MODE_ONLY, 0o755]],
    'exactly the deployment blobs Git records as 100755 are executable');

  const marked = description(preparedRoot).changes
    .filter((/** @type {Record<string, unknown>} */ change) => 'executable' in change)
    .map((/** @type {Record<string, unknown>} */ change) => [change.path, change.group, change.op, change.executable]);
  assert.deepEqual(marked, [
    [CORE_SCRIPT.added, 'core', 'add', true],
    [CORE_SCRIPT.existing, 'core', 'add', true],
    [PACK_SCRIPT, 'pack', 'add', true],
  ], 'the core scripts as the release has them, and the pack script as its Compose projection copied it');
  assert.equal(planned.json.changes.some((/** @type {{ path: string }} */ change) => change.path === MODE_ONLY), false,
    'a file whose bytes are unchanged is no change, whatever its mode');
  assert.doesNotMatch(JSON.stringify(planned.json), /executable/, 'the preview itself is unchanged');
  const discarded = upgradeJson(consumer, 'discard', '--plan', planned.json.id);
  assert.equal(discarded.code, 0, JSON.stringify(discarded.json));
});

test('on POSIX, apply writes added and replaced core and pack files with their recorded executable permission, so an existing executable file stays executable, while every other file keeps its permission and a byte-identical file with another mode is not changed', {
  skip: POSIX_ONLY,
}, async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // An older copy of a script the release makes executable, a replaced file
  // with a narrower permission, and an unchanged file with a permission of its own.
  write(root, CORE_SCRIPT.existing, '#!/bin/sh\necho older\n');
  const unchanged = '.github/skills/dude-lint/lint.mjs';
  setPermissions(root, [[CORE_SCRIPT.existing, 0o755], [REPLACED[1], 0o600], [unchanged, 0o700]]);
  const before = permissions(root);
  assert.equal(/** @type {number} */ (before.get(MODE_ONLY)) & 0o111, 0, 'the release makes this unchanged file executable');

  const planned = upgradeJson(consumer, 'plan', '--all', '--ref', 'perm');
  assert.equal(planned.code, 10, planned.stderr);
  const ops = new Map(planned.json.changes.map((/** @type {{ path: string, op: string }} */ change) => [change.path, change.op]));
  assert.deepEqual([CORE_SCRIPT.added, CORE_SCRIPT.existing, PACK_SCRIPT, REPLACED[1]].map((relativePath) => ops.get(relativePath)),
    ['add', 'replace', 'add', 'replace']);
  assert.deepEqual([ops.has(MODE_ONLY), ops.has(unchanged)], [false, false], 'byte-identical files are no change, whatever their modes');
  const applied = upgradeJson(consumer, 'apply', '--plan', planned.json.id, '--confirm', 'confirm-upgrade');
  assert.equal(applied.code, 0, JSON.stringify(applied.json));
  assert.equal(applied.json.outcome, 'applied');

  for (const [relativePath, source] of [
    [CORE_SCRIPT.added, CORE_SCRIPT.added],
    [CORE_SCRIPT.existing, CORE_SCRIPT.existing],
    [PACK_SCRIPT, PACK_SCRIPT_SOURCE],
  ]) {
    assert.deepEqual(read(root, relativePath), gitBlob(shared.upstream, `perm:${source}`), relativePath);
    assert.equal(permission(root, relativePath), 0o755, `${relativePath} is executable, as the release records`);
  }
  const after = permissions(root);
  for (const [relativePath, bits] of before) {
    if (after.has(relativePath)) assert.equal(after.get(relativePath), bits, `${relativePath} keeps its permission`);
  }
  for (const relativePath of [...after.keys()].filter((name) => !before.has(name) && name !== CORE_SCRIPT.added && name !== PACK_SCRIPT)) {
    assert.equal(/** @type {number} */ (after.get(relativePath)) & 0o111, 0, `${relativePath} is added without an execute bit`);
  }
});

test('on POSIX, a restored update puts back the original permission of every replaced and deleted file, and removes the files it added', {
  skip: POSIX_ONLY,
}, async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  // Two replaced files, a script the release makes executable and a narrower
  // file it does not, and two deleted files, each with a permission of its own.
  write(root, CORE_SCRIPT.existing, '#!/bin/sh\necho older\n');
  setPermissions(root, [[CORE_SCRIPT.existing, 0o700], [REPLACED[1], 0o640], [RETIRED[0], 0o600], [RETIRED[1], 0o750]]);
  const before = snapshot(root);
  const beforePermissions = permissions(root);
  const state = gitState(root);

  const ready = await prepareUpgrade({ root, ref: 'perm-lint' });
  assert.equal(ready.status, 'ready');
  const ops = new Map(ready.changes.map((/** @type {{ path: string, op: string }} */ change) => [change.path, change.op]));
  assert.deepEqual([CORE_SCRIPT.existing, REPLACED[1], ...RETIRED, CORE_SCRIPT.added].map((relativePath) => ops.get(relativePath)),
    ['replace', 'replace', 'remove', 'remove', 'add']);
  /** @type {Record<string, number | null>[]} */
  const during = [];
  const result = await applyUpgrade({
    root,
    id: ready.id,
    onProgress: () => {
      during.push(Object.fromEntries([CORE_SCRIPT.existing, CORE_SCRIPT.added, REPLACED[1], RETIRED[1]]
        .map((relativePath) => [relativePath, exists(root, relativePath) ? permission(root, relativePath) : null])));
    },
  });
  assert.deepEqual(during, [{ [CORE_SCRIPT.existing]: 0o755, [CORE_SCRIPT.added]: 0o755, [REPLACED[1]]: 0o640, [RETIRED[1]]: null }],
    'the update was in place, with its permissions, when the bundle check ran');
  assert.equal(result.outcome, 'restored', JSON.stringify(result));
  assert.match(result.reason, /the update introduced 1 new bundle check failure/);
  assert.deepEqual(snapshot(root), before, 'every file is back, and every added one is gone');
  assert.deepEqual(permissions(root), beforePermissions, 'each with its original permission');
  assert.deepEqual(gitState(root), state);
  assert.equal(fs.existsSync(path.join(os.tmpdir(), preparedFolder(ready.id))), false, 'the used result was released');
});

test('on POSIX, a changed recorded permission refuses without writes', { skip: POSIX_ONLY }, async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const { root } = consumer;
  const before = snapshot(root);
  const beforePermissions = permissions(root);
  const state = gitState(root);
  /** @param {string} label */
  const unchanged = (label) => {
    assert.deepEqual(snapshot(root), before, `${label}: nothing was written`);
    assert.deepEqual(permissions(root), beforePermissions, `${label}: no permission changed`);
  };
  /** @param {Record<string, unknown>[]} changes @param {string} relativePath */
  const changeAt = (changes, relativePath) => /** @type {Record<string, unknown>} */ (changes.find((change) => change.path === relativePath));

  // The prepared ID binds the description, so a changed mark is refused before any retained code runs.
  /** @type {[string, (changes: Record<string, unknown>[]) => void][]} */
  const edits = [
    ['a mark removed from an executable file', (changes) => { delete changeAt(changes, CORE_SCRIPT.added).executable; }],
    ['a mark added to a regular file', (changes) => { changeAt(changes, REPLACED[1]).executable = true; }],
  ];
  for (const [label, edit] of edits) {
    const planned = upgradeJson(consumer, 'plan', '--ref', 'perm');
    assert.equal(planned.code, 10, `${label}: ${planned.stderr}`);
    const file = path.join(consumer.tmp, preparedFolder(planned.json.id), 'prepared.json');
    const prepared = JSON.parse(fs.readFileSync(file, 'utf8'));
    edit(prepared.changes);
    fs.writeFileSync(file, `${JSON.stringify(prepared, null, 2)}\n`);
    const applied = upgradeJson(consumer, 'apply', '--plan', planned.json.id, '--confirm', 'confirm-upgrade');
    assert.deepEqual([applied.code, applied.json.outcome, applied.json.reason],
      [40, 'nothing_changed', 'the prepared upgrade changed since the preview; prepare the upgrade again'], label);
    unchanged(label);
    assert.deepEqual(fs.readdirSync(consumer.tmp), [], `${label}: the changed result is released`);
  }

  // The retained target engine applies only a recorded mark it can apply as recorded.
  const planned = upgradeJson(consumer, 'plan', '--ref', 'perm');
  assert.equal(planned.code, 10, planned.stderr);
  const preparedRoot = path.join(consumer.tmp, preparedFolder(planned.json.id));
  const target = await import(pathToFileURL(path.join(preparedRoot, 'release', ...ENGINE.split('/'))).href);
  const prepared = description(preparedRoot);
  /** @type {[string, string, unknown][]} */
  const invalid = [
    ['a mark that is not true', CORE_SCRIPT.added, 'yes'],
    ['a false mark', CORE_SCRIPT.added, false],
    ['a mark on a removed file', RETIRED[0], true],
  ];
  for (const [label, relativePath, value] of invalid) {
    const changes = prepared.changes.map((/** @type {{ path: string }} */ change) => (
      change.path === relativePath ? { ...change, executable: value } : change));
    const result = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared: { ...prepared, changes } });
    assert.deepEqual([result.outcome, result.reason],
      ['nothing_changed', `the prepared permission for ${relativePath} is invalid; prepare the upgrade again`], label);
    unchanged(label);
  }

  // Unchanged, the same result applies with the permissions it records.
  const applied = await target.applyPreparedUpgrade({ workspaceRoot: root, preparedRoot, prepared });
  assert.equal(applied.outcome, 'applied', JSON.stringify(applied));
  assert.deepEqual([permission(root, CORE_SCRIPT.added), permission(root, CORE_SCRIPT.existing)], [0o755, 0o755]);
  const discarded = upgradeJson(consumer, 'discard', '--plan', planned.json.id);
  assert.equal(discarded.code, 0, JSON.stringify(discarded.json));
  assert.deepEqual(gitState(root), state);
});
/* ------------------------------------------------------------ chat contract */

test('the chat contract: help lists the current commands, and retired commands, flags, and confirmations refuse before writing', async () => {
  const shared = await fixture();
  const consumer = newConsumer(shared);
  const before = snapshot(consumer.root);
  const state = gitState(consumer.root);

  const help = upgrade(consumer, 'help');
  assert.equal(help.status, 0);
  for (const command of ['status', 'plan', 'apply', 'discard', 'help']) assert.match(help.stdout, new RegExp(`^ {2}${command} `, 'm'), command);
  for (const flag of ['--source <s>', '--ref <r>', '--all', '--dry-run', '--plan <id>', '--confirm <token>', '--format text|json']) {
    assert.ok(help.stdout.includes(flag), flag);
  }
  assert.match(help.stdout, /It creates no tag, branch, or commit and does not\s+stage anything/);
  assert.doesNotMatch(help.stdout, /rollback|packs-preview|packs-apply|confirm-packs|skip-removals|safety|--out\b/);

  const id = '0123456789abcdef0123456789abcdef';
  for (const args of [
    [],
    ['rollback'],
    ['rollback', '--tag', 'dude-pre-upgrade-20260101-000000'],
    ['packs-preview', '--plan', id],
    ['packs-apply', '--plan', id, '--confirm', 'confirm-packs'],
    ['plan', '--out', 'plan.json'],
    ['plan', '--skip-removals'],
    ['apply', '--plan', id, '--confirm', 'confirm-upgrade', '--skip-removals'],
    ['apply', '--plan', id, '--confirm', 'confirm-upgrade', '--allow-dirty'],
    ['apply', '--plan', id],
    ['apply', '--plan', id, '--confirm', 'confirm-packs'],
    ['apply', '--plan', id, '--confirm', 'yes'],
    ['apply', '--plan', id, '--confirm', 'confirm upgrade'],
    ['apply', '--confirm', 'confirm-upgrade'],
    ['apply', '--plan', path.join(consumer.tmp, 'old-plan.json'), '--confirm', 'confirm-upgrade'],
    ['apply', '--plan', id, '--confirm', 'confirm-upgrade'],
    ['discard', '--plan', 'not-an-id'],
  ]) {
    const result = upgrade(consumer, ...args);
    assert.equal(result.status, 40, `${args.join(' ') || '(no subcommand)'}\n${result.stdout}${result.stderr}`);
  }
  assert.deepEqual(snapshot(consumer.root), before);
  assert.deepEqual(gitState(consumer.root), state);
  assert.deepEqual(fs.readdirSync(consumer.tmp), []);
});

/* -------------------------------------------------------- public surfaces */

test('public upgrade surfaces state exact core ownership, the one-confirmation flow, and the uncommitted result', () => {
  /** @param {string} relative */
  const readText = (relative) => fs.readFileSync(path.join(REPO_ROOT, ...relative.split('/')), 'utf8');
  const source = readText('src/skills/dude-bundle-upgrade/SKILL.md');
  assert.equal(readText('.github/skills/dude-bundle-upgrade/SKILL.md'), source, 'source and deployed skills are byte-identical');
  const commands = readText('docs/commands.md');
  const commandStart = commands.indexOf('### Upgrading the bundle');
  const commandEnd = commands.indexOf('\n### ', commandStart + 4);
  assert.ok(commandStart >= 0 && commandEnd > commandStart);
  const surfaces = new Map([
    ['skill', source],
    ['upgrading guide', readText('docs/upgrading.md')],
    ['command reference', commands.slice(commandStart, commandEnd)],
  ]);

  for (const [label, content] of surfaces) {
    const prose = content.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');
    for (const corePath of [
      '.github/agents/dude.agent.md',
      '.github/agents/dude-<slug>.agent.md',
      '.github/skills/dude-<slug>/**',
      '.github/instructions/dude.instructions.md',
      '.github/extensions/dude/**',
      '.github/extensions/dude-preview/**',
      '.github/extensions/dude-local/**',
      'dude-local-*',
      'dude-pack-*',
    ]) assert.ok(content.includes(corePath), `${label}: ${corePath}`);
    assert.match(prose, /(?:siblings|other names)[\s\S]{0,600}project-owned and preserved/i, `${label}: other extension trees`);
    assert.match(prose, /only (?:upstream\/)?core-owned extension tree/i, `${label}: the sole core extension tree`);
    assert.ok(content.includes('`upgrade.mjs status`'), `${label}: the internal check`);
    assert.match(prose, /(?:distinct|separate) from (?:the )?global `@dude status`/i, `${label}: global status is separate`);
    assert.match(prose, /`plan`[^.]{0,160}authoritative|authoritative[^.]{0,160}`plan`/i, `${label}: plan is the byte authority`);
    assert.match(prose, /true no-op[\s\S]{0,300}no (?:file|byte) (?:change|difference)/i, `${label}: what a no-op is`);
    assert.ok(content.includes('confirm upgrade'), `${label}: the literal confirmation`);
    assert.match(prose, /uncommitted on the current branch/i, `${label}: the uncommitted result`);
    assert.match(prose, /Git cannot recover[^.]{0,120}uncommitted/i, `${label}: overwritten uncommitted edits are not recoverable`);
    assert.match(prose, /new session/i, `${label}: the new-session handoff`);
    assert.doesNotMatch(
      content,
      /--rollback|rollback --tag|packs-preview|packs-apply|confirm packs|confirm-packs|skip-removals|dude-pre-upgrade|chore\/dude-upgrade|safety tag/i,
      `${label}: retired commands and flags`,
    );
  }
  const examples = [...surfaces.get('command reference').matchAll(/```(?:text|bash)?\n([\s\S]*?)```/g)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(examples, /(?:^|\n)\s*@dude status(?:\s|$)/, 'global @dude status is not an upgrade step');
  assert.match(examples, /@dude upgrade --all --dry-run/);
});
/* ------------------------------------------------- inventory and records */

test('core inventory scanning follows the direct tree and includes engine configuration as ordinary content', () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-direct-scan-'));
  try {
    const expected = [
      '.github/agents/dude-spec-lead.agent.md',
      '.github/agents/dude.agent.md',
      '.github/instructions/dude.instructions.md',
      '.github/skills/dude-engine/SKILL.md',
      '.github/skills/dude-engine/config/agent-models.json',
    ];
    for (const relativePath of [
      ...expected,
      '.github/agents/dude-pack-demo-worker.agent.md',
      '.github/agents/dude-local-worker.agent.md',
      '.github/agents/project-worker.agent.md',
      '.github/skills/dude-pack-demo-helper/SKILL.md',
      '.github/skills/dude-local-helper/SKILL.md',
    ]) {
      write(root, relativePath, 'x\n');
    }

    // Act
    const scanned = scanCoreInventoryPaths(root, 'fixture workspace');
    const enumerated = enumerateCorePaths(root);

    // Assert
    assert.deepEqual(scanned, expected);
    assert.deepEqual(enumerated, expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('core inventory scanning owns only exact Dude extension regular files', () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-extension-scan-'));
  try {
    const owned = [
      '.github/extensions/dude/extension.mjs',
      '.github/extensions/dude/lib/canvas-server.mjs',
      '.github/extensions/dude/lib/nested/projection.mjs',
      '.github/extensions/dude/ui/assets/app.js',
      '.github/extensions/dude/ui/assets/licenses/NOTICE.txt',
      '.github/extensions/dude/ui/index.html',
    ];
    for (const relativePath of [
      ...owned,
      '.github/extensions/dude-preview/extension.mjs',
      '.github/extensions/dude-local/extension.mjs',
      '.github/extensions/other/deep/extension.mjs',
      'src/extensions/dude/extension.mjs',
      'scripts/dude-canvas-ui/build.mjs',
    ]) write(root, relativePath, 'x\n');

    // Act
    const scanned = scanCoreInventoryPaths(root, 'fixture workspace');

    // Assert
    assert.deepEqual(scanned, [...owned].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('extension inventory scanner rejects unsafe exact destination shapes', () => {
  const fixtures = [
    {
      label: 'symlinked extensions root',
      setup: (/** @type {string} */ root) => {
        write(root, 'target.txt', 'target\n');
        fs.mkdirSync(path.join(root, '.github'), { recursive: true });
        fs.symlinkSync(path.join(root, 'target.txt'), path.join(root, '.github/extensions'), 'file');
      },
    },
    {
      label: 'wrong-type exact Dude root',
      setup: (/** @type {string} */ root) => write(root, '.github/extensions/dude', 'not a directory\n'),
    },
    {
      label: 'symlinked exact Dude root',
      setup: (/** @type {string} */ root) => {
        write(root, 'target.txt', 'target\n');
        fs.mkdirSync(path.join(root, '.github/extensions'), { recursive: true });
        fs.symlinkSync(path.join(root, 'target.txt'), path.join(root, '.github/extensions/dude'), 'file');
      },
    },
    {
      label: 'symlinked exact Dude descendant',
      setup: (/** @type {string} */ root) => {
        write(root, 'target.txt', 'target\n');
        write(root, '.github/extensions/dude/extension.mjs', 'runtime\n');
        fs.symlinkSync(path.join(root, 'target.txt'), path.join(root, '.github/extensions/dude/lib'), 'file');
      },
    },
  ];

  for (const { label, setup } of fixtures) {
    // Arrange
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-extension-type-'));
    try {
      setup(root);

      // Act + Assert
      assert.throws(
        () => scanCoreInventoryPaths(root, 'fixture workspace'),
        /fixture workspace (?:contains symbolic link|type changed)/,
        label,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('direct core inventory scanning still refuses symlinks and incompatible file types', () => {
  // Arrange + Act + Assert: direct agent files and their root must be real.
  for (const relativePath of [
    '.github/agents/dude-spec-lead.agent.md',
    '.github/agents',
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-direct-link-'));
    try {
      write(root, 'decoy.txt', 'x\n');
      const absolutePath = path.join(root, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.symlinkSync(path.join(root, 'decoy.txt'), absolutePath);
      assert.throws(
        () => scanCoreInventoryPaths(root, 'fixture workspace'),
        /fixture workspace contains symbolic link/,
        relativePath,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-up-direct-type-'));
  try {
    write(root, '.github/agents/dude.agent.md', 'x\n');
    fs.mkdirSync(path.join(root, '.github/agents/dude-spec-lead.agent.md'), { recursive: true });

    // Act + Assert
    assert.throws(
      () => scanCoreInventoryPaths(root, 'fixture workspace'),
      /fixture workspace type changed: \.github\/agents\/dude-spec-lead\.agent\.md/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('development base release records accept only one exact stable payload', () => {
  // Arrange
  /** @param {string} sourceRepo @param {string} baseRelease */
  const baseReleaseRecord = (sourceRepo, baseRelease) => renderDevelopmentBaseRelease({ source_repo: sourceRepo, base_release: baseRelease });
  const valid = baseReleaseRecord('https://github.com/E-G-C/dude', 'v1.3.0');
  /** @param {string} json */
  const fenced = (json) => `# Development Base Release\n\n\`\`\`json\n${json}\n\`\`\`\n`;
  const invalid = [
    ['no fenced payload', '# Development Base Release\n'],
    ['two fenced payloads', `${valid}\n${valid}`],
    ['malformed JSON', fenced('{"source_repo": "x",')],
    ['an extra JSON payload', fenced('{"source_repo":"x","base_release":"v1.0.0"} {}')],
    ['an array payload', fenced('[]')],
    ['a null payload', fenced('null')],
    ['an extra field', fenced('{"source_repo":"x","base_release":"v1.0.0","installed_ref":"main"}')],
    ['a missing field', fenced('{"source_repo":"x"}')],
    ['a blank source', fenced('{"source_repo":"  ","base_release":"v1.0.0"}')],
    ['a non-string source', fenced('{"source_repo":["x"],"base_release":"v1.0.0"}')],
    ['a numeric release', fenced('{"source_repo":"x","base_release":1.3}')],
    ['a prerelease', fenced('{"source_repo":"x","base_release":"v1.4.0-rc1"}')],
    ['an uppercase prefix', fenced('{"source_repo":"x","base_release":"V1.3.0"}')],
    ['a two-part version', fenced('{"source_repo":"x","base_release":"v1.3"}')],
    ['a padded release', fenced('{"source_repo":"x","base_release":" v1.3.0"}')],
    ['a trailing newline in the release', fenced('{"source_repo":"x","base_release":"v1.3.0\\n"}')],
  ];

  // Act + Assert
  assert.deepEqual(parseDevelopmentBaseRelease(Buffer.from(valid)), {
    source_repo: 'https://github.com/E-G-C/dude',
    base_release: 'v1.3.0',
  });
  assert.deepEqual(
    parseDevelopmentBaseRelease(Buffer.from(valid.replace(/\n/g, '\r\n'))),
    parseDevelopmentBaseRelease(Buffer.from(valid)),
    'line endings do not change the recorded value',
  );
  for (const sourceRepo of ['C:\\Users\\dev\\dude', 'file:///tmp/a ```json b', 'ssh://git@example.invalid/dude.git', 'ünïcode']) {
    assert.deepEqual(
      parseDevelopmentBaseRelease(Buffer.from(baseReleaseRecord(sourceRepo, 'v10.20.30'))),
      { source_repo: sourceRepo, base_release: 'v10.20.30' },
      `rendering round-trips ${sourceRepo}`,
    );
  }
  for (const [label, text] of invalid) {
    assert.throws(() => parseDevelopmentBaseRelease(Buffer.from(text)), /development base release/, label);
  }
  const invalidUtf8 = Buffer.concat([Buffer.from(valid.slice(0, 20)), Buffer.from([0xc3, 0x28]), Buffer.from(valid.slice(20))]);
  assert.throws(() => parseDevelopmentBaseRelease(invalidUtf8), /not valid UTF-8/);
  assert.throws(() => parseDevelopmentBaseRelease(/** @type {any} */ (valid)), TypeError);
  assert.throws(
    () => renderDevelopmentBaseRelease({ source_repo: 'x', base_release: 'v1.3.0-rc1' }),
    /stable vX\.Y\.Z/,
  );
  assert.throws(
    () => validateDevelopmentBaseRelease(/** @type {any} */ ({ source_repo: 'x', base_release: 'v1.3.0', installed_ref: 'main' })),
    /exactly source_repo and base_release/,
  );
});

// @ts-check
/**
 * Browser-level T010 regression coverage for the shipped Dude canvas.
 *
 * This intentionally uses no browser library. It drives a fresh headless Chromium
 * process over the Chrome DevTools Protocol and serves the actual committed
 * shell and bundle through the production provider and controlled UI fixtures.
 * Screenshots are evidence only and deliberately live outside the repository.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BROWSER = process.env.DUDE_CANVAS_BROWSER ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const REQUIRED = process.env.DUDE_CANVAS_BROWSER_REQUIRED === '1';
const FLUENT_PACKAGE_ROOT = path.join(HERE, 'node_modules', '@fluentui', 'react-components');
const FLUENT_PACKAGE_JSON = path.join(FLUENT_PACKAGE_ROOT, 'package.json');
/** @type {string} Evidence belongs to the single suite run in this process. */
let artifactRoot;
const DEADLINE_MS = 12_000;
const SHA256 = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ACTION_REFRESH = Object.freeze({
  kind: 'refresh',
  label: 'Refresh from repository',
  method: 'POST',
  path: '/api/refresh',
});

/** @param {string} color */
function cssRgb(color) {
  assert.match(color, /^#[\da-f]{6}$/i, `expected an opaque Fluent token, got ${color}`);
  return `rgb(${Number.parseInt(color.slice(1, 3), 16)}, ${Number.parseInt(color.slice(3, 5), 16)}, ${Number.parseInt(color.slice(5, 7), 16)})`;
}

/** @param {string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} slug @param {string} number */
function selected(slug, number) {
  return {
    title: slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    ideaPath: `.dude/ideas/${number}-${slug}.md`,
    slug,
    specPath: `.dude/specs/${number}-${slug}/spec.md`,
    explicit: true,
  };
}

/** @param {string} slug @param {string} number */
function sources(slug, number) {
  return [
    {
      kind: 'inventory',
      label: 'Feature inventory',
      paths: ['.dude/ideas', '.dude/specs'],
      role: 'selection',
      contentIdentity: SHA256,
    },
    {
      kind: 'file',
      label: 'Idea',
      path: `.dude/ideas/${number}-${slug}.md`,
      role: 'identity',
      contentIdentity: SHA256,
      details: { section: 'Coordinator Log', eventCount: 2, recentEvents: [] },
    },
    {
      kind: 'file',
      label: 'Specification',
      path: `.dude/specs/${number}-${slug}/spec.md`,
      role: 'definition',
      contentIdentity: SHA256,
      details: { section: 'Revision Log', eventCount: 1, recentEvents: [] },
    },
  ];
}

/**
 * Builds a complete projection using only fields emitted by projection.mjs.
 * @param {{
 *   slug?: string,
 *   number?: string,
 *   authority?: 'definition'|'lightweight'|'tracked',
 *   stage?: string,
 *   next?: string|null,
 *   nextSourceDescription?: string,
 *   nextTaskKey?: string,
 *   nextReason?: string|null,
 *   blockers?: Array<{classification?:string,reason:string,source:Record<string,unknown>}>,
 *   unansweredQuestions?: number|null,
 *   tasks?: {total:number,open:number,inProgress:number,blocked:number,done:number}|null,
 *   phases?: Array<{name:string,total:number,open:number,inProgress:number,blocked:number,done:number,state:string}>,
 *   activity?: {total:number,recent:Array<{date:string,text:string}>}|null,
 *   latestEvent?: {date:string,text:string,source:Record<string,string>}|null,
 *   attention?: Array<{code:string,severity:'warning'|'error',message:string}>,
 *   diagnostics?: Array<{code:string,severity:'warning'|'error',path:string,message:string}>,
 * }} [options]
 */
function completeProjection(options = {}) {
  const slug = options.slug ?? 'lightweight-workspace';
  const number = options.number ?? '042';
  const selection = selected(slug, number);
  const tasks = options.tasks === undefined
    ? { total: 5, open: 1, inProgress: 1, blocked: 0, done: 3 }
    : options.tasks;
  const phases = options.phases ?? [
    { name: 'Foundation', total: 3, open: 0, inProgress: 0, blocked: 0, done: 3, state: 'done' },
    { name: 'Verification', total: 2, open: 1, inProgress: 1, blocked: 0, done: 0, state: 'current' },
  ];
  const activity = options.activity ?? {
    total: 2,
    recent: [
      { date: '2026-09-03 UTC', text: 'Verification evidence was requested.' },
      { date: '2026-09-02 UTC', text: 'Implementation was recorded.' },
    ],
  };
  const latestEvent = options.latestEvent ?? {
    date: '2026-09-03 UTC',
    text: 'Verification evidence was requested.',
    source: { path: selection.specPath, section: 'Revision Log' },
  };
  const next = options.next === undefined ? 'Verify the rendered canvas.' : options.next;
  return {
    complete: true,
    status: 'ok',
    readAt: '2026-09-03T23:45:00.000Z',
    attemptedAt: null,
    selected: selection,
    authority: options.authority ?? 'lightweight',
    stage: options.stage ?? 'In progress',
    next: next === null
      ? null
      : {
        description: next,
        source: {
          kind: options.authority === 'tracked' ? 'tracked' : 'file',
          ...(options.authority === 'tracked'
            ? { issueId: 'dude-42', title: next }
            : {
              path: `.dude/specs/${number}-${slug}/tasks.md`,
              taskKey: options.nextTaskKey ?? 'T011@052a11y1',
              description: options.nextSourceDescription ?? next,
            }),
        },
      },
    nextReason: options.nextReason ?? (next === null ? 'No supported next step is currently established.' : null),
    blockers: options.blockers ?? [],
    unansweredQuestions: options.unansweredQuestions ?? 2,
    tasks,
    phases,
    activity,
    latestEvent,
    attention: options.attention ?? [],
    diagnostics: options.diagnostics ?? [],
    sources: sources(slug, number),
    choices: options.choices ?? [{
      ideaPath: selection.ideaPath,
      slug: selection.slug,
      specPath: selection.specPath,
    }],
    action: ACTION_REFRESH,
  };
}

/**
 * Two exactly owned T010 features. One is a stable CSS/SVG/JSON capture target;
 * the other is intentionally transient and attempts an opaque-frame mutation.
 * Every byte lives in a disposable workspace.
 */
function createReviewWorkspaceFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-review-fixture-'));
  const root = path.join(directory, 'workspace');
  const fixtureFontPath = path.join(
    HERE,
    'node_modules',
    '@fluentui',
    'react-icons',
    'lib',
    'utils',
    'fonts',
    'FluentSystemIcons-Regular.woff',
  );
  assert.equal(fs.existsSync(fixtureFontPath), true, 'required browser fixture has a real local WOFF asset');
  const write = (relative, value) => {
    const absolute = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, value);
  };
  const revision = (value) => `sha256:${sha256(value)}`;
  const stableCss = [
    'html { background: #e7f0f8; color-scheme: light dark; scrollbar-width: none; }',
    'html::-webkit-scrollbar { display: none; }',
    "@font-face { font-family: 'T010 Fixture Icons'; src: url('fixture.woff') format('woff'); font-display: block; }",
    'body { margin: 0; min-height: 1500px; background: #e7f0f8; color: #102a43; font: 16px/1.5 system-ui, sans-serif; }',
    '.sticky { position: sticky; top: 0; z-index: 5; height: 64px; box-sizing: border-box; padding: 18px 24px; background: #24557a; color: #fff; }',
    '.spacer { height: 280px; background: #c9dfef; }',
    '.hero { min-height: 100vh; box-sizing: border-box; padding: 32px; position: relative; background: #d9eaf7; }',
    '.card { width: min(520px, calc(100% - 96px)); min-height: 112px; box-sizing: border-box; padding: 18px; border: 2px solid #24557a; border-radius: 12px; background: #fff; }',
    '.logo { position: absolute; top: 88px; right: 36px; width: 64px; height: 64px; }',
    ".font-proof { position: absolute; right: 52px; top: 176px; font: 28px 'T010 Fixture Icons'; }",
    '#data { margin: 24px 0 0; width: min(420px, calc(100% - 120px)); padding: 12px; background: #f2f8fc; border-left: 6px solid #0f6cbd; }',
    '.tail { height: 500px; background: #b8d4e8; }',
    '@media (prefers-color-scheme: dark) {',
    '  html, body { background: #081b2b; color: #f5f9fc; }',
    '  .sticky { background: #163a5f; }',
    '  .spacer { background: #0d2940; }',
    '  .hero { background: #102a43; }',
    '  .card { background: #173f5f; border-color: #77b7e5; }',
    '  #data { background: #1f4f72; border-left-color: #79c0ff; }',
    '  .tail { background: #0b2336; }',
    '}',
    '',
  ].join('\n');
  const stableHtml = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    '<link rel="stylesheet" href="mock.css"></head><body>',
    '<header class="sticky" id="sticky">Sticky source header</header>',
    '<div class="spacer" aria-hidden="true"></div>',
    '<main class="hero">',
    '  <section class="card" id="copy"><h1>Current canonical mock</h1><p>Source content remains visible beneath annotations.</p></section>',
    '  <img class="logo" src="logo.svg" alt="Fixture logo">',
    '  <span class="font-proof" aria-label="Loaded local WOFF asset">&#xE700;</span>',
    '  <p id="data" role="status">Loading local JSON…</p>',
    '</main><div class="tail"></div>',
    '<script type="module">',
    "const value = await fetch('copy.json').then(response => response.json());",
    "document.querySelector('#data').textContent = value.label;",
    "document.documentElement.dataset.fixtureReady = 'true';",
    '</script></body></html>',
    '',
  ].join('\n');
  const hostileHtml = [
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    '<style>body{margin:0;min-height:900px;font:16px system-ui} video{width:40px;height:30px}</style>',
    '<p id="security-result">Opaque fixture executed.</p><video></video>',
    '<script>',
    "try { parent.document.body.dataset.mockEscaped = 'true'; } catch {}",
    "fetch('/api/needs-you/review/save', { method: 'POST', credentials: 'include', headers: {'content-type':'application/json'}, body: '{}' })",
    "  .then(() => parent.postMessage({type:'hostile-done', result:'network-returned'}, '*'))",
    "  .catch(() => parent.postMessage({type:'hostile-done', result:'blocked'}, '*'));",
    "parent.postMessage({type:'dude-review-query', channel:'00000000-0000-4000-8000-000000000000', id:1, op:'save'}, '*');",
    '</script>',
    '',
  ].join('\n');
  const shared = {
    'mock.css': stableCss,
    'copy.json': '{"label":"Source-bound JSON asset ✓"}\n',
    'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#ffb900"/><path d="M16 34l10 10 23-25" fill="none" stroke="#102a43" stroke-width="7"/></svg>\n',
    'fixture.woff': fs.readFileSync(fixtureFontPath),
  };

  function feature(number, slug, html, assets = shared, artifactName = 'mock.html') {
    const ideaPath = `.dude/ideas/${number}-${slug}.md`;
    const specDirectory = `.dude/specs/${number}-${slug}`;
    const specPath = `${specDirectory}/spec.md`;
    const artifactPath = `${specDirectory}/design/${artifactName}`;
    write(artifactPath, html);
    for (const [name, value] of Object.entries(assets)) write(`${specDirectory}/design/${name}`, value);
    write(specPath, [
      '---',
      `title: ${slug}`,
      `preview_path: ${artifactPath}`,
      '---',
      '',
      `# ${slug}`,
      '',
    ].join('\n'));
    write(`${specDirectory}/tasks.md`, '- [ ] T001@aaaaaaaa Review fixture\n');
    write(ideaPath, [
      '---',
      `title: ${slug}`,
      `slug: ${slug}`,
      'status: defined',
      `spec_path: ${specPath}`,
      '---',
      '',
      '## Idea',
      '',
      `${slug} fixture.`,
      '',
    ].join('\n'));
    const assetPaths = Object.keys(assets).map((name) => `${specDirectory}/design/${name}`);
    const preview = {
      artifact: { path: artifactPath, revision: revision(fs.readFileSync(path.join(root, ...artifactPath.split('/')))) },
      assets: assetPaths.map((assetPath) => ({
        path: assetPath,
        revision: revision(fs.readFileSync(path.join(root, ...assetPath.split('/')))),
      })),
    };
    return {
      ideaPath,
      specDirectory,
      specPath,
      artifactPath,
      preview,
      scope: { kind: 'feature', ideaPath, specPath },
    };
  }

  return {
    directory,
    root,
    stable: feature('701', 'stable-review', stableHtml),
    hostile: feature('702', 'hostile-review', hostileHtml),
    addFeature: feature,
    revision,
    write,
    close() { fs.rmSync(directory, { recursive: true, force: true }); },
  };
}

/**
 * Stable disposable equivalent of the production-reachable nested-scroll
 * geometry used by the Review clipping regressions. Approved design artifacts
 * are protected acceptance inputs, never test fixtures.
 */
function nestedOpenFixtureHtml() {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    '<style>',
    'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui}',
    '*{box-sizing:border-box}',
    'header{height:111px;background:#d9eaf7}',
    '#main{position:absolute;left:0;top:111px;width:100%;height:430px;',
    'overflow:auto;scrollbar-width:none;background:#edf4fa}',
    '#main::-webkit-scrollbar{display:none}',
    '#content{position:relative;width:100%;height:806px}',
    '#open{position:absolute;left:645px;top:428px;width:238px;height:30px}',
    'body>i{position:absolute;left:2px;width:1px;height:1px;visibility:visible}',
    'body>i:first-of-type{top:2px}body>i:nth-of-type(2){top:4px}',
    '</style></head><body>',
    '<header aria-hidden="true"></header>',
    '<main id="main"><div id="content"><button id="open">Open</button></div></main>',
    '<i aria-hidden="true"></i><i aria-hidden="true"></i>',
    '</body></html>',
  ].join('');
}

/**
 * Bounded condition wait. It is used only for lifecycle/DOM/network conditions;
 * no test relies on an arbitrary fixed delay.
 * @template T
 * @param {() => Promise<T>|T} probe
 * @param {string} description
 * @param {number} [timeout]
 * @returns {Promise<T>}
 */
async function until(probe, description, timeout = DEADLINE_MS) {
  const end = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ''}`);
}

class Cdp {
  /** @param {string} debuggerUrl */
  constructor(debuggerUrl) {
    this.nextId = 1;
    /** @type {Map<number, {resolve:(value:any)=>void,reject:(reason:unknown)=>void}>} */
    this.pending = new Map();
    /** @type {Map<string, Array<(params:any)=>void>>} */
    this.listeners = new Map();
    this.socket = new WebSocket(debuggerUrl);
    this.closed = new Promise(resolve => {
      this.socket.addEventListener('close', resolve, { once: true });
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if ('id' in message) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP socket closed'));
      this.pending.clear();
      this.listeners.clear();
    });
  }

  /** @param {string} method @param {Record<string,unknown>} [params] @param {string} [sessionId] */
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return result;
  }

  /** @param {string} method @param {(params:any)=>void} listener */
  on(method, listener) {
    const registered = this.listeners.get(method) ?? [];
    registered.push(listener);
    this.listeners.set(method, registered);
  }

  close() {
    if (this.socket.readyState !== WebSocket.CLOSING
      && this.socket.readyState !== WebSocket.CLOSED) this.socket.close();
    return this.closed;
  }
}

/** @param {number} root */
function browserDescendants(root) {
  if (process.platform === 'win32') return [];
  const output = spawnSync('ps', ['-axo', 'pid=,ppid='], {
    encoding: 'utf8',
    timeout: 1_000,
    maxBuffer: 1024 * 1024,
  });
  if (output.error) throw output.error;
  if (output.status !== 0) throw new Error(`Could not inventory browser descendants (ps exit ${output.status}).`);
  const byParent = new Map();
  for (const line of output.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const children = byParent.get(Number(match[2])) ?? [];
    children.push(Number(match[1]));
    byParent.set(Number(match[2]), children);
  }
  const found = [];
  const visit = pid => {
    for (const child of byParent.get(pid) ?? []) {
      visit(child);
      found.push(child);
    }
  };
  visit(root);
  return found;
}

/** @param {number} pid */
function browserPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

/** @param {number[]} pids */
function liveBrowserPids(pids) {
  return pids.filter(browserPidAlive);
}

/** @param {import('node:child_process').ChildProcess} child */
function browserHandlesClosed(child) {
  return (child.exitCode !== null || child.signalCode !== null)
    && child.stdio.every(stream => !stream || stream.closed || stream.destroyed);
}

/**
 * Reap only the browser and descendants observed beneath its exact spawned PID.
 * @param {import('node:child_process').ChildProcess} child
 */
async function stopBrowser(child) {
  if (!child.pid) return [];
  const errors = [];
  let owned = [child.pid];
  try {
    if (browserPidAlive(child.pid)) {
      owned = [...new Set([child.pid, ...browserDescendants(child.pid)])];
    }
  } catch (error) {
    errors.push(new Error(`Could not inventory descendants of owned browser pid ${child.pid}.`, { cause: error }));
  }
  const signal = (pids, name) => {
    for (const pid of pids) {
      try {
        process.kill(pid, name);
      } catch (error) {
        if (error?.code !== 'ESRCH') {
          errors.push(new Error(`Could not send ${name} to owned browser pid ${pid}.`, { cause: error }));
        }
      }
    }
  };
  signal(owned, 'SIGTERM');
  let survivors = owned;
  await until(() => {
    survivors = liveBrowserPids(owned);
    return survivors.length === 0;
  }, 'all exact browser processes to exit after SIGTERM', 3_000).catch(() => {});
  if (survivors.length) {
    signal(survivors, 'SIGKILL');
    await until(() => {
      survivors = liveBrowserPids(survivors);
      return survivors.length === 0;
    }, 'all exact browser processes to exit after SIGKILL', 2_000)
      .catch(error => errors.push(error));
  }
  if (!browserHandlesClosed(child)) {
    await until(() => browserHandlesClosed(child), 'owned browser child-process handles to close', 1_000)
      .catch(() => {});
  }
  if (!browserHandlesClosed(child)) {
    for (const stream of child.stdio) stream?.destroy();
    await until(() => browserHandlesClosed(child), 'owned browser pipes to close', 1_000)
      .catch(error => errors.push(error));
  }
  if (survivors.length) errors.push(new Error(`Owned browser pids did not exit: ${survivors.join(', ')}.`));
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Owned browser process cleanup failed.');
  return owned;
}

/**
 * @param {{browser:ReturnType<typeof spawn>,page?:Cdp,profile:string}} state
 */
async function cleanupBrowserDriver(state) {
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => state.page?.close()),
    stopBrowser(state.browser),
  ]);
  const errors = outcomes.filter(({ status }) => status === 'rejected')
    .map(({ reason }) => reason);
  try {
    fs.rmSync(state.profile, {
      recursive: true,
      force: true,
      maxRetries: 4,
      retryDelay: 50,
    });
  } catch (error) {
    errors.push(new Error(`Could not remove owned browser profile ${state.profile}.`, { cause: error }));
  }
  if (fs.existsSync(state.profile)) errors.push(new Error(`Owned browser profile still exists: ${state.profile}.`));
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Owned browser driver cleanup failed.');
}

/** @param {number|null} [forcedDeviceScale] */
async function startBrowser(forcedDeviceScale = null) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-browser-profile-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    ...(forcedDeviceScale === null ? [] : [`--force-device-scale-factor=${forcedDeviceScale}`]),
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let launchError;
  let stderr = '';
  let page;
  browser.once('error', (error) => { launchError = error; });
  browser.stdout.resume();
  browser.stderr.on('data', (bytes) => { stderr += bytes; });
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = await until(() => {
      if (launchError) return launchError;
      if (browser.exitCode !== null || browser.signalCode !== null) {
        return new Error(`Browser exited before CDP startup (${browser.exitCode ?? browser.signalCode}): ${stderr}`);
      }
      if (!fs.existsSync(portFile)) return null;
      const first = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
      return /^\d+$/.test(first) ? Number(first) : null;
    }, 'browser DevToolsActivePort');
    if (port instanceof Error) throw port;
    const info = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return response.ok ? response.json() : null;
    }, 'browser DevTools version endpoint');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    page = new Cdp(target.webSocketDebuggerUrl);
    await page.open();
    await Promise.all([
      page.send('Page.enable'),
      page.send('Runtime.enable'),
      page.send('DOM.enable'),
      page.send('Network.enable'),
      page.send('Accessibility.enable'),
    ]);
    return { browser, info, page, profile };
  } catch (error) {
    try {
      await cleanupBrowserDriver({ browser, page, profile });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError],
        `Could not launch DUDE_CANVAS_BROWSER=${BROWSER}; cleanup also failed.`);
    }
    throw new Error(`Could not launch DUDE_CANVAS_BROWSER=${BROWSER}: ${error.message}`, { cause: error });
  }
}

/** @param {Cdp} page @param {string} expression */
async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Runtime evaluation failed');
  }
  return result.result?.value;
}

/** @param {Cdp} page @param {string|null} fixture @param {number} width @param {'light'|'dark'} theme @param {string} base @param {number} [height] @param {boolean} [forcedColors] @param {number} [deviceScaleFactor] */
async function navigate(page, fixture, width, theme, base, height = 900, forcedColors = false, deviceScaleFactor = 1) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'forced-colors', value: forcedColors ? 'active' : 'none' },
    ],
  });
  await page.send('Page.navigate', { url: fixture ? `${base}/?fixture=${fixture}` : `${base}/` });
  try {
    await until(async () => evaluate(page, `Boolean(
      document.querySelector('header') &&
      document.querySelector('main') &&
      document.querySelector('footer')
    )`), `${fixture} application render`);
  } catch (error) {
    const snapshot = await evaluate(page, `JSON.stringify({
      href: location.href,
      ready: document.readyState,
      root: document.querySelector('#root')?.innerText,
      scripts: [...document.scripts].map((script) => script.src || 'inline'),
    })`);
    throw new Error(`${error.message}; browser DOM: ${snapshot}`);
  }
  await until(async () => evaluate(page, `!document.body.innerText.includes('Reading repository state')
    && [...document.querySelectorAll('header button')].some((node) => node.textContent.trim() === 'Refresh'
      && node.getAttribute('aria-busy') !== 'true')`), `${fixture} initial projection response`);
}

/** @param {Cdp} page @param {string} selector */
async function focus(page, selector) {
  await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error('Missing focus target: ${selector}');
    node.focus();
    return document.activeElement === node;
  })()`);
}

/** @param {Cdp} page @param {string} key @param {string} [code] @param {{shift?:boolean}} [options] */
async function key(page, key, code = key, { shift = false } = {}) {
  const virtualKeys = {
    ArrowDown: 40,
    End: 35,
    Enter: 13,
    Escape: 27,
    Home: 36,
    Tab: 9,
  };
  const windowsVirtualKeyCode = virtualKeys[key] ?? 0;
  // CDP requires Enter's carriage-return text to exercise the browser's
  // native button activation path (rather than only React key handlers).
  const text = key === 'Enter' ? '\r' : undefined;
  const modifiers = shift ? 8 : 0;
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
    modifiers, text,
    unmodifiedText: text,
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
    modifiers,
  });
}

/** Wait through a microtask and two paint frames without arbitrary sleeping. @param {Cdp} page */
async function settleBrowserWork(page) {
  await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() => {
    Promise.resolve().then(() => requestAnimationFrame(resolve));
  }))`);
}

/**
 * Runs a WCAG sRGB contrast calculation against actual computed browser colors.
 * The background walker composites translucent colors through rendered ancestors.
 * @param {string} foreground
 * @param {string} background
 */
function contrast(foreground, background) {
  const parse = (value) => {
    const channels = value.match(/[\d.]+/g)?.map(Number);
    assert.ok(channels && channels.length >= 3, `computed color must be RGB(A): ${value}`);
    return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 };
  };
  const composite = (top, bottom) => ({
    r: (top.r * top.a) + (bottom.r * (1 - top.a)),
    g: (top.g * top.a) + (bottom.g * (1 - top.a)),
    b: (top.b * top.a) + (bottom.b * (1 - top.a)),
    a: 1,
  });
  const luminance = (value) => {
    const rgb = [value.r, value.g, value.b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
  };
  const fg = parse(foreground);
  const bg = composite(parse(background), { r: 255, g: 255, b: 255, a: 1 });
  const [light, dark] = [luminance(fg), luminance(bg)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

/** @param {string[]} failures @param {() => void} assertion */
function collect(failures, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

async function prepareT010Baseline(reviewTest) {
      if (process.env.DUDE_CANVAS_ACCEPTANCE_FIXTURE === '1') {
        reviewTest.skip('the prerequisite-only copied harness intentionally omits provider and engine source');
        return;
      }
      const skipOrFail = (message) => {
        assert.equal(REQUIRED, false, `Required T010 browser coverage: ${message}`);
        reviewTest.skip(message);
      };
      try {
        fs.accessSync(BROWSER, fs.constants.X_OK);
      } catch {
        const message = `Browser is not executable at ${BROWSER}; set DUDE_CANVAS_BROWSER to a Chromium-family executable.`;
        if (process.env.DUDE_CANVAS_BROWSER !== undefined) assert.fail(message);
        skipOrFail(message);
        return;
      }
      if (typeof globalThis.WebSocket !== 'function') {
        skipOrFail('Global WebSocket is unavailable; use Node 22+ without --no-experimental-websocket for direct CDP coverage.');
        return;
      }
      if (!fs.existsSync(FLUENT_PACKAGE_ROOT) || !fs.existsSync(FLUENT_PACKAGE_JSON)) {
        skipOrFail('Scoped Fluent dependencies are absent; run `npm ci --prefix scripts/dude-canvas-ui` to run browser coverage.');
        return;
      }
      const artifactParent = path.resolve(process.env.DUDE_CANVAS_ARTIFACTS_DIR ?? os.tmpdir());
      fs.mkdirSync(artifactParent, { recursive: true });
      artifactRoot = fs.mkdtempSync(path.join(artifactParent, 'dude-canvas-t010-baseline-'));
      const screenshots = [];
      const sourcePaths = [
        'src/extensions/dude/lib/canvas-server.mjs',
        'src/extensions/dude/lib/review.mjs',
        'src/extensions/dude/lib/review/browser.mjs',
        'src/extensions/dude/lib/review/data.mjs',
        'src/extensions/dude/lib/review/png.mjs',
        'src/extensions/dude/ui/review/engine.mjs',
        'src/extensions/dude/ui/review/inspector.mjs',
        'src/extensions/dude/ui/review/geometry.mjs',
        'src/extensions/dude/ui/review/shapes.mjs',
        'src/extensions/dude/ui/review/panel.mjs',
        'src/extensions/dude/ui/review/capture.mjs',
        'src/extensions/dude/ui/review/bridge.mjs',
        'src/extensions/dude/ui/review/styles.css',
      ];
      const sources = Object.fromEntries(sourcePaths.map((relative) => [
        relative,
        sha256(fs.readFileSync(path.join(ROOT, relative))),
      ]));
      reviewTest.diagnostic(`T010 baseline evidence directory: ${artifactRoot}`);
      reviewTest.diagnostic(`T010 runtime source SHA-256: ${JSON.stringify(sources)}`);
      let browserVersion = null;
      reviewTest.after(() => {
        fs.writeFileSync(path.join(artifactRoot, 'index.json'), `${JSON.stringify({
          case: 'T010 mounts the vanilla engine under current Fluent tokens and seals real source-aligned evidence',
          generatedAt: new Date().toISOString(),
          browser: browserVersion,
          sources,
          screenshots,
        }, null, 2)}\n`);
      });
      return {
        screenshots,
        setBrowserVersion(value) { browserVersion = value; },
      };
}

const T010_REVIEW_SOURCES = Object.freeze([
        'scripts/dude-canvas-ui/browser.test.mjs',
        'src/extensions/dude/lib/canvas-server.mjs',
        'src/extensions/dude/lib/review.mjs',
        'src/extensions/dude/lib/review/browser.mjs',
        'src/extensions/dude/lib/review/data.mjs',
        'src/extensions/dude/lib/review/png.mjs',
        'src/extensions/dude/ui/review/engine.mjs',
        'src/extensions/dude/ui/review/inspector.mjs',
        'src/extensions/dude/ui/review/geometry.mjs',
        'src/extensions/dude/ui/review/shapes.mjs',
        'src/extensions/dude/ui/review/panel.mjs',
        'src/extensions/dude/ui/review/capture.mjs',
        'src/extensions/dude/ui/review/bridge.mjs',
        'src/extensions/dude/ui/review/styles.css',
      ]);

      /** @param {import('node:test').TestContext} context */
function t010BrowserReady(context) {
        if (process.env.DUDE_CANVAS_ACCEPTANCE_FIXTURE === '1') {
          context.skip('the prerequisite-only copied harness intentionally omits provider and engine source');
          return false;
        }
        const skipOrFail = (message) => {
          assert.equal(REQUIRED, false, `Required T010 browser coverage: ${message}`);
          context.skip(message);
          return false;
        };
        try {
          fs.accessSync(BROWSER, fs.constants.X_OK);
        } catch {
          const message = `Browser is not executable at ${BROWSER}; set DUDE_CANVAS_BROWSER to a Chromium-family executable.`;
          if (process.env.DUDE_CANVAS_BROWSER !== undefined) assert.fail(message);
          return skipOrFail(message);
        }
        if (typeof globalThis.WebSocket !== 'function') {
          return skipOrFail('Global WebSocket is unavailable; use Node 22+ without --no-experimental-websocket for direct CDP coverage.');
        }
        if (!fs.existsSync(FLUENT_PACKAGE_ROOT) || !fs.existsSync(FLUENT_PACKAGE_JSON)) {
          return skipOrFail('Scoped Fluent dependencies are absent; run `npm ci --prefix scripts/dude-canvas-ui` to run browser coverage.');
        }
        return true;
      }

      /** @param {import('node:test').TestContext} context @param {string} slug */
function createT010Evidence(context, slug) {
        const parent = path.resolve(process.env.DUDE_CANVAS_ARTIFACTS_DIR ?? os.tmpdir());
        fs.mkdirSync(parent, { recursive: true });
        const directory = fs.mkdtempSync(path.join(parent, `dude-canvas-${slug}-`));
        const sources = Object.fromEntries(T010_REVIEW_SOURCES.map((relative) => [
          relative,
          sha256(fs.readFileSync(path.join(ROOT, relative))),
        ]));
        context.diagnostic(`T010 review regression evidence directory: ${directory}`);
        context.diagnostic(`T010 review regression source SHA-256: ${JSON.stringify(sources)}`);
        return {
          directory,
          sources,
          /** @param {string} name @param {unknown} value */
          json(name, value) {
            fs.writeFileSync(path.join(directory, name), `${JSON.stringify({
              generatedAt: new Date().toISOString(),
              sources,
              .../** @type {Record<string, unknown>} */ (value),
            }, null, 2)}\n`);
          },
          /** @param {string} name @param {Buffer} value */
          image(name, value) {
            fs.writeFileSync(path.join(directory, name), value);
            return { file: name, bytes: value.length, sha256: sha256(value) };
          },
        };
      }

      /** @param {any} decoded @param {number} x @param {number} y */
function decodedPixel(decoded, x, y) {
        const px = Math.max(0, Math.min(decoded.width - 1, Math.round(x)));
        const py = Math.max(0, Math.min(decoded.height - 1, Math.round(y)));
        return [...decoded.pixels.subarray((py * decoded.width + px) * 4, (py * decoded.width + px) * 4 + 4)];
      }

      /** @param {number[]} value */
function pixelColor(value) {
        return `rgb(${value[0]}, ${value[1]}, ${value[2]})`;
      }

      /**
       * Record only Review capture profiles created through this Node process
       * while one T010 case owns the instrumentation. Other processes may create
       * or remove identically prefixed directories in the shared OS temp root.
       */
function trackT010ReviewProfiles() {
        const reviewPrefix = path.join(os.tmpdir(), 'dude-review-browser-');
        const originalMkdtempSync = fs.mkdtempSync;
        /** @type {string[]} */
        const owned = [];
        let restored = false;
        const instrumentedMkdtempSync = function (prefix, ...rest) {
          const directory = originalMkdtempSync.call(fs, prefix, ...rest);
          if (typeof prefix === 'string' && typeof directory === 'string'
            && path.resolve(prefix) === path.resolve(reviewPrefix)) {
            owned.push(path.resolve(directory));
          }
          return directory;
        };
        fs.mkdtempSync = instrumentedMkdtempSync;

        const receipt = () => owned.length;
        const createdSince = (start) => {
          assert.equal(Number.isInteger(start) && start >= 0 && start <= owned.length, true);
          return owned.slice(start);
        };
        const survivorsSince = (start) => createdSince(start).filter((directory) => fs.existsSync(directory));
        const assertReapedSince = (start, label) => {
          assert.deepEqual(survivorsSince(start), [], label);
        };
        const restore = () => {
          if (restored) return;
          assert.equal(
            fs.mkdtempSync,
            instrumentedMkdtempSync,
            'T010 profile instrumentation remains the active test-owned fs wrapper',
          );
          fs.mkdtempSync = originalMkdtempSync;
          restored = true;
        };

        return {
          receipt,
          createdSince,
          survivorsSince,
          assertReapedSince,
          createUnrelatedFixture() {
            return originalMkdtempSync.call(fs, reviewPrefix);
          },
          finish(label) {
            restore();
            const survivors = survivorsSince(0);
            try {
              assert.deepEqual(survivors, [], label);
            } finally {
              // Red paths may clean up only paths this exact instrumentation
              // observed this process create; unrelated temp entries are untouched.
              for (const directory of survivors) {
                fs.rmSync(directory, { recursive: true, force: true });
              }
            }
          },
        };
      }

      /**
       * Counterfactual for the ownership oracle itself. An unrelated same-prefix
       * fixture can appear and disappear without affecting the receipt, while a
       * retained path created through the instrumented runtime seam is detected.
       *
       * @param {ReturnType<typeof trackT010ReviewProfiles>} profiles
       */
function proveT010ProfileOwnership(profiles) {
        const start = profiles.receipt();
        let unrelated = null;
        let retainedOwned = null;
        try {
          unrelated = profiles.createUnrelatedFixture();
          profiles.assertReapedSince(
            start,
            'an unrelated same-prefix fixture appearing does not belong to this T010 runtime',
          );
          fs.rmSync(unrelated, { recursive: true, force: true });
          unrelated = null;
          profiles.assertReapedSince(
            start,
            'an unrelated same-prefix fixture disappearing does not belong to this T010 runtime',
          );

          retainedOwned = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-browser-'));
          assert.throws(
            () => profiles.assertReapedSince(
              start,
              'counterfactual retained owned profile must be reported',
            ),
            /counterfactual retained owned profile must be reported/,
          );
          fs.rmSync(retainedOwned, { recursive: true, force: true });
          retainedOwned = null;
          profiles.assertReapedSince(start, 'removed owned fixture satisfies the exact receipt');
          return {
            unrelatedAppearingIgnored: true,
            unrelatedDisappearingIgnored: true,
            retainedOwnedFlagged: true,
          };
        } finally {
          if (unrelated) fs.rmSync(unrelated, { recursive: true, force: true });
          if (retainedOwned) fs.rmSync(retainedOwned, { recursive: true, force: true });
        }
      }

      /**
       * Focused T010 harness. It mounts one disposable canonical mock through the
       * real Needs You provider, production HTTP server, current FluentProvider, and
       * adopted engine. Each caller owns and reaps its browser, provider, and files.
       *
       * @param {import('node:test').TestContext} context
       * @param {{
       *   number:string,
       *   slug:string,
       *   html:string,
       *   width?:number,
       *   height?:number,
       *   theme?:'light'|'dark',
       *   deviceScale?:number,
       *   assets?:Record<string,string|Buffer>,
       *   artifactName?:string,
       *   waitForInitialReady?:boolean,
       *   profileOwnership:ReturnType<typeof trackT010ReviewProfiles>,
       * }} options
       */
async function createT010ReviewHarness(context, options) {
        const [
          { createNeedsYou },
          { createReview },
          { closeInstance, openInstance },
        ] = await Promise.all([
          import('../../src/extensions/dude/lib/needs-you.mjs'),
          import('../../src/extensions/dude/lib/review.mjs'),
          import('../../src/extensions/dude/lib/canvas-server.mjs'),
        ]);
        const workspace = createReviewWorkspaceFixture();
        const feature = workspace.addFeature(
          options.number,
          options.slug,
          options.html,
          options.assets ?? {},
          options.artifactName,
        );
        const captureProfileReceipt = options.profileOwnership.receipt();
        const adapter = createReview({ root: workspace.root });
        const realSaveReview = adapter.saveReview;
        let armedSaveBarrier = null;
        let activeSaveBarrier = null;
        adapter.saveReview = async (input) => {
          const barrier = armedSaveBarrier;
          if (barrier) {
            armedSaveBarrier = null;
            activeSaveBarrier = barrier;
            barrier.markStarted();
            try {
              await barrier.released;
            } finally {
              activeSaveBarrier = null;
            }
          }
          return realSaveReview(input);
        };
        const releaseSaveBarriers = () => {
          armedSaveBarrier?.release();
          activeSaveBarrier?.release();
          armedSaveBarrier = null;
          activeSaveBarrier = null;
          adapter.saveReview = realSaveReview;
        };
        const sends = [];
        const session = {
          sessionId: `t010-regression-session-${randomUUID()}`,
          send: async (input) => { sends.push(input); return `unexpected-${sends.length}`; },
          rpc: {
            queue: {
              pendingItems: async () => ({ items: [], steeringMessages: [], inFlightSteeringCount: 0 }),
            },
          },
        };
        const provider = createNeedsYou({ root: workspace.root, reviewAdapter: adapter });
        provider.bindSession(/** @type {any} */ (session));
        const controller = new AbortController();
        const request = {
          owner: 'dude-spec-lead',
          requestRef: `t010-${options.slug}`,
          scope: feature.scope,
          source: {
            kind: 'file',
            path: feature.ideaPath,
            revision: workspace.revision(fs.readFileSync(path.join(workspace.root, ...feature.ideaPath.split('/')))),
          },
          revision: `current-t010-${options.slug}`,
          class: 'preview',
          prompt: 'Review this exact current canonical mock.',
          whyHuman: 'Visual feedback requires the user.',
          unblocks: 'The design owner can revise the canonical mock.',
          blocking: true,
          fields: feature.preview,
        };
        const invocation = {
          sessionId: session.sessionId,
          toolName: 'dude_needs_you',
          toolCallId: `t010-regression-tool-${randomUUID()}`,
          signal: controller.signal,
        };
        const toolResult = provider.tool.handler({ op: 'request', request }, invocation);
        const record = await until(() => provider.read().requests.find((entry) => (
          entry.request.requestRef === request.requestRef && entry.phase === 'pending'
        )), `pending ${request.requestRef}`);
        const instanceId = `t010-regression-${randomUUID()}`;
        let instance;
        let ownedBrowser;
        let closed = false;
        try {
          instance = await openInstance(
            instanceId,
            () => {},
            completeProjection({ slug: options.slug, number: options.number }),
            { root: workspace.root },
            provider,
          );
          const origin = new URL(instance.url).origin;
          const postJson = async (route, body) => {
            const response = await fetch(new URL(route, instance.url), {
              method: 'POST',
              headers: { 'content-type': 'application/json', origin },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(45_000),
            });
            return { response, payload: await response.json() };
          };
          const openedResponse = await postJson('/api/needs-you/review/open', {
            requestHandle: record.requestHandle,
            revision: request.revision,
          });
          assert.equal(openedResponse.response.status, 202);
          const opened = openedResponse.payload;
          ownedBrowser = await startBrowser(options.deviceScale ?? 1);
          const page = ownedBrowser.page;
          /** @type {Array<any>} */
          const network = [];
          page.on('Network.requestWillBeSent', (event) => network.push(event));
          await navigate(
            page,
            null,
            options.width ?? 480,
            options.theme ?? 'light',
            origin,
            options.height ?? 360,
            false,
            options.deviceScale ?? 1,
          );
          await evaluate(page, `(() => {
            window.__t010FixtureMessages = [];
            window.addEventListener('message', event => {
              if (typeof event.data?.type === 'string' && event.data.type.startsWith('t010-')) {
                window.__t010FixtureMessages.push(event.data);
              }
            });
            window.__reviewBridgeLog = [];
            window.addEventListener('message', event => {
              if (!['dude-review-result', 'dude-review-scrolled'].includes(event.data?.type)) return;
              window.__reviewBridgeLog.push({
                at: performance.now(),
                type: event.data.type,
                id: event.data.id ?? null,
                error: event.data.error ?? null,
                signature: event.data.result?.signature ?? null,
                scrollY: event.data.result?.viewport?.scrollY ?? null,
              });
            });
          })()`);
          const mount = async (
            review = opened,
            theme = options.theme ?? 'light',
            waitForReady = true,
            offscreen = false,
          ) => {
            await evaluate(page, `(async () => {
              window.__review?.dispose?.();
              document.querySelector('[data-t010-regression-host]')?.remove();
              document.documentElement.style.overflow = 'hidden';
              document.body.style.overflow = 'hidden';
              const fluent = document.querySelector('.fui-FluentProvider');
              if (!fluent) throw new Error('Current FluentProvider was not mounted');
              const host = document.createElement('section');
              host.dataset.t010RegressionHost = 'true';
              host.setAttribute('aria-label', 'T010 focused review regression fixture');
              host.style.cssText = [
                'position:fixed', 'left:-1px',
                'top:${offscreen ? 'calc(100vh + 64px)' : '-1px'}',
                'width:calc(100vw + 2px)', 'height:calc(100vh + 2px)',
                'z-index:2147483640', 'overflow:hidden',
                'background:var(--colorNeutralBackground1)',
              ].join(';');
              fluent.append(host);
              window.__reviewChanges = [];
              window.__reviewMessages = [];
              window.__reviewMessageTimeline = [];
              window.__reviewBridgeLog = [];
              const module = await import('/review/engine.mjs');
              window.__reviewMountedAt = performance.now();
              window.__review = module.mountReview(host, {
                review: ${JSON.stringify(review)},
                requestHandle: ${JSON.stringify(record.requestHandle)},
                revision: ${JSON.stringify(request.revision)},
                theme: ${JSON.stringify(theme)},
                onChange: state => window.__reviewChanges.push(structuredClone(state)),
                onMessage: message => {
                  const copy = structuredClone(message);
                  window.__reviewMessages.push(copy);
                  window.__reviewMessageTimeline.push({ at: performance.now(), ...copy });
                },
              });
            })()`);
            if (waitForReady) {
              await until(
                () => evaluate(page, 'Boolean(window.__review?.getState().ready)'),
                `${options.slug} engine ready`,
                15_000,
              );
            }
            return evaluate(page, 'window.__review.getState()');
          };
          await mount(
            opened,
            options.theme ?? 'light',
            options.waitForInitialReady ?? true,
          );
          const command = (action, timeout = 15_000) => evaluate(page, `Promise.race([
            window.__review.command(${JSON.stringify(action)}),
            new Promise((_, reject) => setTimeout(
              () => reject(new Error('T010 focused command deadline')),
              ${timeout}
            ))
          ])`);
          const reviewDirectory = path.join(
            workspace.root,
            ...feature.specDirectory.split('/'),
            'reviews',
            opened.submissionId,
          );
          return {
            workspace,
            feature,
            adapter,
            provider,
            toolResult,
            request,
            record,
            instance,
            origin,
            opened,
            page,
            browser: ownedBrowser,
            network,
            reviewDirectory,
            command,
            mount,
            postJson,
            holdNextSave() {
              assert.equal(armedSaveBarrier, null, 'only one bounded save barrier may be armed');
              assert.equal(activeSaveBarrier, null, 'the prior bounded save barrier has completed');
              let markStarted;
              let release;
              let released = false;
              const started = new Promise((resolve) => { markStarted = resolve; });
              const releasedPromise = new Promise((resolve) => { release = resolve; });
              const barrier = {
                started,
                released: releasedPromise,
                markStarted: () => markStarted(undefined),
                release: () => {
                  if (released) return;
                  released = true;
                  release(undefined);
                },
              };
              armedSaveBarrier = barrier;
              return { started, release: barrier.release };
            },
            readWorking() {
              return JSON.parse(fs.readFileSync(path.join(reviewDirectory, 'working.json'), 'utf8'));
            },
            async screenshot() {
              const result = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
              return Buffer.from(result.data, 'base64');
            },
            async close() {
              if (closed) return;
              closed = true;
              releaseSaveBarriers();
              controller.abort();
              try { await evaluate(page, 'window.__review?.dispose?.()'); } catch {}
              try { await page.send('Page.navigate', { url: 'about:blank' }); } catch {}
              await cleanupBrowserDriver(ownedBrowser);
              assert.equal(
                fs.existsSync(ownedBrowser.profile),
                false,
                'focused harness reaps its exact browser-driver profile',
              );
              try {
                if (instance) await closeInstance(instanceId);
              } finally {
                provider.dispose();
              }
              await Promise.allSettled([toolResult]);
              workspace.close();
              assert.equal(sends.length, 0, 'focused Review regressions never use session.send');
              options.profileOwnership.assertReapedSince(
                captureProfileReceipt,
                'focused harness reaps each exact Review profile this process created for it',
              );
            },
          };
        } catch (error) {
          releaseSaveBarriers();
          controller.abort();
          if (ownedBrowser) {
            await cleanupBrowserDriver(ownedBrowser);
            assert.equal(
              fs.existsSync(ownedBrowser.profile),
              false,
              'failed focused harness reaps its exact browser-driver profile',
            );
          }
          try {
            if (instance) await closeInstance(instanceId);
          } finally {
            provider.dispose();
          }
          await Promise.allSettled([toolResult]);
          workspace.close();
          options.profileOwnership.assertReapedSince(
            captureProfileReceipt,
            'failed focused harness reaps each exact Review profile this process created for it',
          );
          throw error;
        }
      }

      /** @param {Awaited<ReturnType<typeof createT010ReviewHarness>>} harness */
async function seedTwoReviewAnnotations(harness) {
        await harness.command({ type: 'tool', tool: 'box' });
        const firstId = await harness.command({ type: 'addAtCenter' });
        await harness.command({
          type: 'edit',
          id: firstId,
          changes: { x1: 60, y1: 80, x2: 170, y2: 170 },
        });
        const secondId = await harness.command({ type: 'addAtCenter' });
        const secondBeforeEdit = (await evaluate(
          harness.page,
          `window.__review.getState().annotations.find(annotation => annotation.id === ${JSON.stringify(secondId)})`,
        ));
        await harness.command({
          type: 'edit',
          id: secondId,
          changes: { x1: 270, y1: 100, x2: 410, y2: 200 },
        });
        await harness.command({ type: 'select', id: secondId });
        await harness.command({
          type: 'caret',
          caret: { id: secondId, field: 'comment', start: 0, end: 0, direction: 'none' },
        });
        await harness.command({ type: 'tool', tool: 'select' });
        const saved = await harness.command({ type: 'save' });
        assert.equal(saved.status, 'saved');
        return {
          firstId,
          secondId,
          secondBeforeEdit,
          committed: await evaluate(harness.page, 'window.__review.getState()'),
          workingRevision: saved.workingRevision,
        };
      }

      /** Attach CDP directly to the current opaque canonical-source frame. */
async function attachT010SourceFrame(harness) {
        const targetInfos = (await harness.page.send('Target.getTargets')).targetInfos;
        const target = targetInfos.find(info => (
          info.type === 'iframe' && info.url.includes(harness.opened.framePath)
        ));
        assert.ok(target, `the canonical source iframe is attached: ${JSON.stringify(targetInfos)}`);
        const { sessionId } = await harness.page.send('Target.attachToTarget', {
          targetId: target.targetId,
          flatten: true,
        });
        await harness.page.send('Runtime.enable', {}, sessionId);
        return {
          target,
          sessionId,
          async evaluate(expression) {
            const result = await harness.page.send('Runtime.evaluate', {
              expression,
              awaitPromise: true,
              returnByValue: true,
            }, sessionId);
            if (result.exceptionDetails) {
              throw new Error(
                result.exceptionDetails.exception?.description
                ?? result.exceptionDetails.text
                ?? 'Canonical source evaluation failed',
              );
            }
            return result.result?.value;
          },
        };
      }

      /**
       * One production-shaped source can be switched among the three diagnosed
       * readiness conditions without replacing its frame or bridge. The
       * monotonic timer and message-driven update are ordinary application
       * behavior; neither branches on Review operations or fields.
       *
       * @param {'stable'|'unstable'|'animation'|'scroll-animation'|'image'} initialMode
       */
function readinessReviewHtml(initialMode = 'stable') {
        assert.ok(['stable', 'unstable', 'animation', 'scroll-animation', 'image'].includes(initialMode));
        return [
          '<!doctype html><html><head><meta charset="utf-8">',
          '<meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;min-height:4800px;font:16px/1.4 system-ui;background:#fff;color:#242424}',
          'main{padding:24px}.row{height:48px;border-bottom:1px solid #ddd}',
          '#mover{width:120px;height:40px;background:#0f6cbd;color:#fff;padding:8px;box-sizing:border-box}',
          '</style></head><body><main>',
          '<h1>Readiness diagnosis fixture</h1>',
          '<div id="mover">Moving target</div>',
          '<p id="counter">stable</p><div id="rows"></div>',
          '</main><script>',
          `const initialMode=${JSON.stringify(initialMode)};`,
          "const rows=document.querySelector('#rows');",
          "for(let index=0;index<80;index++){const row=document.createElement('p');row.className='row';row.textContent='Settled row '+index;rows.append(row)}",
          "const mover=document.querySelector('#mover');",
          "const counter=document.querySelector('#counter');",
          'let mode="stable",mutationTimer=null,mutationCount=0,mutationGeneration=0;',
          'let mutationInFlight=0,lastMutationGeneration=null,incompleteImage=null;',
          'function mutate(label,generation=mutationGeneration){',
          '  if(mode!=="unstable"||generation!==mutationGeneration) return;',
          '  mutationInFlight++;',
          '  try{counter.textContent=label+" "+(++mutationCount);lastMutationGeneration=generation}',
          '  finally{mutationInFlight--}',
          '}',
          'addEventListener("message",()=>{',
          '  mutate("message mutation");',
          '});',
          'function stopTransientWork(){',
          '  mutationGeneration++;',
          '  if(mutationTimer!==null){clearInterval(mutationTimer);mutationTimer=null}',
          '  for(const animation of document.getAnimations()) animation.cancel();',
          "  mover.style.transition='none';mover.style.transform='none';",
          '  incompleteImage?.remove();incompleteImage=null;',
          '}',
          'function startAnimation(){',
          "  mover.style.transition='none';mover.style.transform='translateX(0px)';",
          '  void mover.offsetWidth;',
          "  mover.style.transition='transform 60s linear';mover.style.transform='translateX(180px)';",
          '}',
          'addEventListener("scroll",()=>{',
          '  if(mode==="scroll-animation"&&!document.getAnimations().some(animation=>animation.playState==="running")) startAnimation();',
          '},{capture:true});',
          'function diagnostics(){',
          '  const running=document.getAnimations().filter(animation=>animation.playState==="running"||animation.pending);',
          '  const incomplete=[...document.images].filter(image=>!image.complete||!image.naturalWidth);',
          '  return {mode,readyState:document.readyState,fonts:document.fonts.status,',
          '    images:document.images.length,incompleteImages:incomplete.length,',
          '    runningAnimations:running.length,mutationCount,mutationGeneration,',
          '    mutationTimerActive:mutationTimer!==null,mutationInFlight,lastMutationGeneration,scrollY,',
          '    documentHeight:document.documentElement.scrollHeight};',
          '}',
          'async function setMode(next){',
          '  stopTransientWork();mode=next;counter.textContent=next;',
          '  if(next==="unstable"){',
          '    const generation=mutationGeneration;',
          '    mutationTimer=setInterval(()=>mutate("timer mutation",generation),0);',
          '  }else if(next==="animation"){',
          '    startAnimation();',
          '  }else if(next==="image"){',
          "    incompleteImage=document.createElement('img');incompleteImage.alt='Incomplete lazy fixture';",
          "    incompleteImage.loading='lazy';incompleteImage.style.cssText='position:absolute;top:4500px;width:20px;height:20px';",
          "    incompleteImage.src='data:image/png;base64,AA==';document.body.append(incompleteImage);",
          '  }',
          '  await Promise.resolve();return diagnostics();',
          '}',
          'window.__readinessFixture={diagnostics,setMode,',
          '  paint:()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))};',
          'void setMode(initialMode);',
          '</script></body></html>',
        ].join('');
      }

      /** @param {Awaited<ReturnType<typeof createT010ReviewHarness>>} harness @param {any} action */
function reviewCommandOutcome(harness, action) {
        return evaluate(harness.page, `window.__review.command(${JSON.stringify(action)})
          .then(value=>({ok:true,value}))
          .catch(error=>({ok:false,code:error.code??null,message:error.message}))`);
      }

      /** @param {Awaited<ReturnType<typeof createT010ReviewHarness>>} harness */
function resetReviewObservations(harness) {
        return evaluate(harness.page, `(() => {
          window.__reviewMessages=[];
          window.__reviewMessageTimeline=[];
          window.__reviewBridgeLog=[];
          return true;
        })()`);
      }

      /** @param {Awaited<ReturnType<typeof attachT010SourceFrame>>} source @param {'stable'|'unstable'|'animation'|'scroll-animation'|'image'} mode */
async function setReadinessMode(source, mode) {
        await source.evaluate(`window.__readinessFixture.setMode(${JSON.stringify(mode)})`);
        return source.evaluate('window.__readinessFixture.diagnostics()');
      }

      /**
       * Stop the mutation source by generation, flush its rendered text change,
       * and observe both the child and engine idle. A timer task queued before
       * clearInterval may still run, but its old generation cannot mutate.
       *
       * @param {Awaited<ReturnType<typeof createT010ReviewHarness>>} harness
       * @param {Awaited<ReturnType<typeof attachT010SourceFrame>>} source
       */
async function settleReadinessFixture(harness, source) {
        await setReadinessMode(source, 'stable');
        await source.evaluate('window.__readinessFixture.paint()');
        return until(async () => {
          const diagnostics = await source.evaluate('window.__readinessFixture.diagnostics()');
          const state = await evaluate(harness.page, 'window.__review.getState()');
          const priorGeneration = diagnostics.lastMutationGeneration;
          return diagnostics.mode === 'stable'
            && diagnostics.mutationTimerActive === false
            && diagnostics.mutationInFlight === 0
            && (priorGeneration === null || priorGeneration < diagnostics.mutationGeneration)
            && !state.busy
            ? { diagnostics, state }
            : null;
        }, 'quiescent readiness mutation source and review engine');
      }

      /** @param {Awaited<ReturnType<typeof createT010ReviewHarness>>} harness */
function pendingReviewPhase(harness) {
        return harness.provider.read().requests.find(
          ({ requestHandle }) => requestHandle === harness.record.requestHandle,
        )?.phase;
      }

      /**
       * Commit one annotation through the production pointer path. The returned
       * record proves the native gesture added exactly one durable annotation
       * before any DOM-paint assertion inspects it.
       *
       * @param {Awaited<ReturnType<typeof createT010ReviewHarness>>} harness
       * @param {'box'|'circle'|'arrow'|'line'|'highlight'} tool
       * @param {{x:number,y:number}} start
       * @param {{x:number,y:number}} end
       */
async function drawT010WithNativePointer(harness, tool, start, end) {
        await harness.command({ type: 'tool', tool });
        const before = await evaluate(
          harness.page,
          'window.__review.getState().annotations.length',
        );
        const geometry = await evaluate(harness.page, `(() => {
          const state = window.__review.getState();
          const rect = document.querySelector('.dude-review-overlay').getBoundingClientRect();
          return {
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            viewport: state.view.viewport,
          };
        })()`);
        const point = ({ x, y }) => ({
          x: geometry.rect.left
            + (x - geometry.viewport.scrollX) * geometry.rect.width / geometry.viewport.width,
          y: geometry.rect.top
            + (y - geometry.viewport.scrollY) * geometry.rect.height / geometry.viewport.height,
        });
        const from = point(start);
        const to = point(end);
        await harness.page.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved', ...from, button: 'none', buttons: 0,
        });
        await harness.page.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1,
        });
        for (let step = 1; step <= 6; step += 1) {
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: from.x + (to.x - from.x) * step / 6,
            y: from.y + (to.y - from.y) * step / 6,
            button: 'left',
            buttons: 1,
          });
        }
        await harness.page.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1,
        });
        return until(async () => {
          const state = await evaluate(harness.page, 'window.__review.getState()');
          return state.annotations.length === before + 1 && !state.busy
            ? state.annotations.at(-1)
            : null;
        }, `${tool} committed through native pointer input`);
      }

if (process.env.DUDE_CANVAS_ACCEPTANCE_FIXTURE !== '1') {
test('T013 portable capture: style-only host evidence and a blank pin seal and deliver while effect mismatches refuse', {
        timeout: 180_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T013 portable capture leaves no exact Review profile created by this test process',
        ));
        const [
          { capturePage },
          { ReviewError },
          {
            anchorMatches,
            captureAnchorMatches,
            clipHidesAnchor,
            insideClip,
            portableElement,
          },
        ] = await Promise.all([
          import('../../src/extensions/dude/lib/review/browser.mjs'),
          import('../../src/extensions/dude/lib/review/data.mjs'),
          import('../../src/extensions/dude/ui/review/geometry.mjs'),
        ]);
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden}',
          '#target{position:absolute;left:100px;top:80px;width:180px;height:60px;',
          'box-sizing:border-box;color:rgb(128,128,128);font-family:BlinkMacSystemFont;',
          'border:none;overflow:visible}',
          '</style>',
          '<button id="target">Portable target</button>',
        ].join('');
        let harness;
        try {
          // Arrange: admit one real blank numbered pin through the mounted
          // production engine, then model only the known WebKit serialization
          // differences in the host-owned saved observation.
          harness = await createT010ReviewHarness(context, {
            number: '760',
            slug: 'portable-style-evidence',
            html,
            width: 480,
            height: 360,
            deviceScale: 2,
            profileOwnership,
          });
          const source = await attachT010SourceFrame(harness);
          await source.evaluate(`import('/review/inspector.mjs').then(module => {
            globalThis.__t013Inspector = module.createInspector(document, window);
            return true;
          })`);
          const chromiumTarget = await source.evaluate(
            "globalThis.__t013Inspector.describeSelector('#target')",
          );
          const runtimeStyles = {
            'font-family': chromiumTarget.element.styles['font-family'],
            border: chromiumTarget.element.styles.border,
            overflow: chromiumTarget.element.styles.overflow,
          };
          assert.equal(
            Object.values(runtimeStyles).every(value => typeof value === 'string' && value.length > 0),
            true,
            'the current browser supplies all three host-observation fields',
          );
          await harness.command({ type: 'element', selector: '#target' });
          const commentId = await harness.command({ type: 'addComment' });
          const numeral = await evaluate(harness.page, `document.querySelector(
            '[data-annotation="${commentId}"] text'
          )?.textContent`);
          const saved = await harness.command({ type: 'save' });
          const working = harness.readWorking();
          const comment = working.state.annotations.find(({ id }) => id === commentId);
          assert.ok(comment);
          assert.deepEqual(
            {
              tool: comment.tool,
              comment: comment.comment,
              replacement: comment.replacement,
              styleNote: comment.styleNote,
              numeral,
            },
            {
              tool: 'comment',
              comment: '',
              replacement: '',
              styleNote: '',
              numeral: '1',
            },
            'the admitted production marker is numbered and carries no manufactured prose',
          );
          assert.deepEqual(comment.element, chromiumTarget.element,
            'before the falsifier, host and fresh-source Chromium descriptors are identical');

          const hostState = structuredClone(working.state);
          const hostComment = hostState.annotations.find(({ id }) => id === commentId);
          const differingObservation = (actual, candidates) => {
            const different = candidates.find(candidate => candidate !== actual);
            assert.ok(different, `a synthetic host observation must differ from ${actual}`);
            return different;
          };
          const differingHostStyles = {
            'font-family': differingObservation(runtimeStyles['font-family'], [
              '"system-ui"',
              'BlinkMacSystemFont',
            ]),
            border: differingObservation(runtimeStyles.border, [
              '0px none rgb(128, 128, 128)',
              'rgb(118, 118, 118)',
            ]),
            overflow: differingObservation(runtimeStyles.overflow, ['visible', 'clip']),
          };
          hostComment.element.styles = {
            ...hostComment.element.styles,
            ...differingHostStyles,
          };
          hostState.view.signature = `sha256:${sha256('synthetic WebKit host signature')}`;
          const portableHost = portableElement(hostComment.element);
          const portableChromium = portableElement(chromiumTarget.element);
          const inspectedChromium = {
            ...chromiumTarget,
            element: chromiumTarget.element,
          };
          const changedStyleKeys = Object.keys(differingHostStyles).filter(
            key => hostComment.element.styles[key] !== chromiumTarget.element.styles[key],
          ).sort();
          assert.deepEqual(
            changedStyleKeys,
            ['border', 'font-family', 'overflow'],
            'all three synthetic host observations genuinely differ from this browser runtime',
          );
          assert.deepEqual(
            portableHost,
            portableChromium,
            'changing only host-observation styles leaves every portable field identical',
          );
          assert.notDeepEqual(
            hostComment.element.styles,
            chromiumTarget.element.styles,
            'the positive path contains a real full-descriptor inequality',
          );
          assert.equal(
            captureAnchorMatches(
              hostComment.element,
              hostComment.scrollBasis,
              inspectedChromium,
              hostState.view.scrolls,
            ),
            true,
            'the production capture matcher accepts the style-only descriptor difference',
          );
          assert.equal(
            anchorMatches(
              hostComment.element,
              hostComment.scrollBasis,
              inspectedChromium,
              hostState.view.scrolls,
            ),
            false,
            'restoring the old full-descriptor gate makes this positive fixture fail',
          );
          const hostSave = await harness.postJson('/api/needs-you/review/save', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
            workingRevision: saved.workingRevision,
            working: hostState,
          });
          assert.equal(hostSave.response.status, 202);
          const annotationResponse = {
            class: 'preview',
            action: 'annotations',
            submissionId: harness.opened.submissionId,
          };
          const premature = await harness.postJson('/api/needs-you/respond', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            response: annotationResponse,
          });
          assert.equal(premature.response.status, 409);
          assert.equal(premature.payload.error, 'review_historical');
          assert.equal(
            harness.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === harness.record.requestHandle,
            ).phase,
            'pending',
            'unsealed evidence cannot consume the original waiter',
          );

          // Act: cross the real adapter capture/seal boundary and then consume
          // the original waiting invocation through its normal response route.
          const seal = await harness.postJson('/api/needs-you/review/seal', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
            workingRevision: hostSave.payload.workingRevision,
          });
          assert.equal(seal.response.status, 202, JSON.stringify(seal.payload));
          const provenance = JSON.parse(fs.readFileSync(
            path.join(harness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          const report = fs.readFileSync(
            path.join(harness.reviewDirectory, 'report.md'),
            'utf8',
          );
          const delivered = await harness.postJson('/api/needs-you/respond', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            response: annotationResponse,
          });
          const toolResult = await harness.toolResult;

          // Assert: version 2 keeps signatures renderer-local and hashes only
          // the portable target, while retaining styles as host observations.
          const portableWarning = 'This is a fresh source rendering, not a recording of native host pixels. For anchored marks, target identity, geometry, visibility, and clipping were checked against the reviewed viewport; computed styles are host observations, not cross-renderer proof.';
          assert.equal(provenance.version, 2);
          assert.deepEqual(provenance.capture.warnings, [portableWarning]);
          assert.ok(report.includes(portableWarning));
          assert.doesNotMatch(
            report,
            /Visible layout, text, styles, local assets, and anchors were checked/,
            'version 2 does not claim renderer-specific styles or the whole visible layout matched',
          );
          assert.equal(provenance.capture.beforeSignature, provenance.capture.afterSignature);
          assert.notEqual(provenance.capture.beforeSignature, hostState.view.signature,
            'the removed host-versus-Chromium signature gate is exercised, not bypassed');
          assert.equal(
            provenance.capture.selectors[0].elementRevision,
            `sha256:${sha256(JSON.stringify(portableHost))}`,
          );
          assert.notEqual(
            provenance.capture.selectors[0].elementRevision,
            `sha256:${sha256(JSON.stringify(hostComment.element))}`,
            'computed styles do not leak back into the version-2 target revision',
          );
          assert.match(report, /## 1\. comment/);
          assert.doesNotMatch(report, /^(?:Comment|Suggested replacement text|Suggested style change):/m);
          assert.match(report, /Target text and computed styles below are host-review observations\./);
          assert.match(report, /Computed styles are not cross-renderer proof\./);
          for (const [key, value] of Object.entries(differingHostStyles)) {
            assert.ok(
              report.includes(`${JSON.stringify(key)}: ${JSON.stringify(value)}`),
              `the report retains the synthetic ${key} host observation`,
            );
          }
          assert.equal(delivered.response.status, 202);
          assert.equal(delivered.payload.status, 'delivered');
          assert.equal(toolResult.resultType, 'success');
          assert.equal(toolResult.binaryResultsForLlm.length, 1);
          assert.equal(toolResult.binaryResultsForLlm[0].mimeType, 'image/png');
          const resultDetails = JSON.parse(toolResult.textResultForLlm);
          assert.equal(resultDetails.response.action, 'annotations');
          assert.equal(resultDetails.response.submissionId, harness.opened.submissionId);
          assert.equal(resultDetails.review.report.text, report);
          assert.equal(
            harness.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === harness.record.requestHandle,
            ).phase,
            'awaiting_acknowledgment',
          );

          // Arrange three independent fresh-capture negatives. They use the
          // production CDP pipe boundary directly so visibility, effective
          // clipping, and browser scroll clamping are measured by Chromium.
          const captureOrigin = 'http://127.0.0.1:43123';
          const captureViewport = {
            width: 320,
            height: 240,
            scrollX: 0,
            scrollY: 0,
            deviceScale: 1,
            theme: 'light',
            documentWidth: 320,
            documentHeight: 240,
          };
          const capturePalette = {
            stroke: '#d13438',
            background: '#ffffff',
            foreground: '#242424',
            highlightFill: '#fff4ce',
            highlightStroke: '#c19c00',
            selection: '#0f6cbd',
            fontFamily: 'Segoe UI',
          };
          const captureInput = (fixtureHtml, state) => {
            const captureId = randomUUID();
            const framePath = `/review-source/${captureId}/mock.html`;
            return {
              resources: new Map([[
                framePath,
                { bytes: Buffer.from(fixtureHtml), mime: 'text/html; charset=utf-8' },
              ]]),
              framePath,
              origin: captureOrigin,
              state,
              signal: new AbortController().signal,
            };
          };
          const anchoredCaptureState = (element, point, scrolls = []) => ({
            annotations: [{
              id: randomUUID(),
              tool: 'comment',
              x1: point.x,
              y1: point.y,
              x2: point.x,
              y2: point.y,
              comment: '',
              replacement: '',
              styleNote: '',
              element,
              scrollBasis: scrolls,
            }],
            notes: '',
            tool: 'comment',
            selectedId: null,
            caret: null,
            view: {
              viewport: captureViewport,
              signature: `sha256:${sha256(`host:${JSON.stringify(element)}`)}`,
              scrolls,
            },
            palette: capturePalette,
          });
          const hiddenHtml = [
            '<!doctype html><meta charset="utf-8"><style>',
            'html,body{margin:0;width:100%;height:100%;overflow:hidden}',
            '#target{position:absolute;left:80px;top:60px;width:120px;height:40px;visibility:hidden}',
            '</style><button id="target">Hidden target</button>',
          ].join('');
          const hiddenState = anchoredCaptureState({
            selector: '#target',
            selectorMatches: 1,
            tag: 'button',
            text: 'Hidden target',
            rect: { x: 80, y: 60, width: 120, height: 40 },
            styles: { visibility: 'visible' },
          }, { x: 96, y: 76 });
          const clippedHtml = [
            '<!doctype html><meta charset="utf-8"><style>',
            'html,body{margin:0;width:100%;height:100%;overflow:hidden}',
            '#clip{position:absolute;left:40px;top:40px;width:160px;height:100px;overflow:clip}',
            '#target{position:absolute;left:120px;top:20px;width:100px;height:40px}',
            '</style><div id="clip"><button id="target">Clipped target</button></div>',
          ].join('');
          const clippedElement = {
            selector: '#target',
            selectorMatches: 1,
            tag: 'button',
            text: 'Clipped target',
            rect: { x: 160, y: 60, width: 100, height: 40 },
            styles: { overflow: 'visible' },
          };
          const clippedPoint = { x: 230, y: 90 };
          const clippedState = anchoredCaptureState(clippedElement, clippedPoint);
          const clip = { left: 40, top: 40, right: 200, bottom: 140 };
          assert.equal(clipHidesAnchor(clippedElement.rect, clip), true);
          assert.equal(insideClip(clippedState.annotations[0], clip), false);
          const nestedHtml = [
            '<!doctype html><meta charset="utf-8"><style>',
            'html,body{margin:0;width:100%;height:100%;overflow:hidden}',
            '#port{position:absolute;left:20px;top:20px;width:180px;height:100px;overflow:auto}',
            '#content{height:300px}',
            '</style><div id="port"><div id="content"></div></div>',
          ].join('');
          const nestedState = {
            annotations: [{
              id: randomUUID(),
              tool: 'box',
              x1: 220,
              y1: 80,
              x2: 280,
              y2: 140,
              comment: '',
              replacement: '',
              styleNote: '',
              element: null,
            }],
            notes: '',
            tool: 'box',
            selectedId: null,
            caret: null,
            view: {
              viewport: captureViewport,
              signature: `sha256:${sha256('host nested-scroll signature')}`,
              scrolls: [{ selector: '#port', scrollLeft: 0, scrollTop: 999 }],
            },
            palette: capturePalette,
          };

          // Act + Assert
          for (const fixture of [
            {
              name: 'not-visible target',
              input: captureInput(hiddenHtml, hiddenState),
              code: 'review_outside_viewport',
            },
            {
              name: 'annotation outside a target-hiding clip',
              input: captureInput(clippedHtml, clippedState),
              code: 'review_outside_viewport',
            },
            {
              name: 'clamped nested-scroll offset',
              input: captureInput(nestedHtml, nestedState),
              code: 'review_capture_mismatch',
            },
          ]) {
            await assert.rejects(
              capturePage(fixture.input),
              (error) => error instanceof ReviewError && error.code === fixture.code,
              fixture.name,
            );
          }
        } finally {
          if (harness) await harness.close();
        }
      });

test('T013 Review readiness: an off-screen settled opaque frame is unresponsive while visible wheel bursts stay silent', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T013 readiness coverage leaves no exact Review profile created by this test process',
        ));
        const frameMessage = 'The mock did not answer in time. Keep it visible on screen, then try again.';
        let harness;
        try {
          // Arrange: mount a genuinely opaque production Review frame whose
          // document, fonts, images, and animations are already settled.
          harness = await createT010ReviewHarness(context, {
            number: '764',
            slug: 'readiness-offscreen',
            html: readinessReviewHtml('stable'),
            width: 480,
            height: 360,
            profileOwnership,
          });
          let source = await attachT010SourceFrame(harness);
          await source.evaluate('window.__readinessFixture.paint()');
          const settled = await source.evaluate('window.__readinessFixture.diagnostics()');
          assert.deepEqual(
            {
              readyState: settled.readyState,
              fonts: settled.fonts,
              incompleteImages: settled.incompleteImages,
              runningAnimations: settled.runningAnimations,
            },
            {
              readyState: 'complete',
              fonts: 'loaded',
              incompleteImages: 0,
              runningAnimations: 0,
            },
            'the source is genuinely settled before any frame-intersection change',
          );
          const visibleRaf = await source.evaluate(`new Promise(resolve => {
            const started=performance.now();
            requestAnimationFrame(()=>resolve({served:true,elapsed:performance.now()-started}));
          })`);
          assert.equal(visibleRaf.served, true);
          assert.ok(visibleRaf.elapsed < 1000, `visible child rAF was served in ${visibleRaf.elapsed} ms`);

          // Act: deliver the same zero-gap 40-tick native wheel burst a user
          // sends through the overlay while the frame intersects the viewport.
          await resetReviewObservations(harness);
          const beforeWheel = await evaluate(harness.page, 'window.__review.getState().view.viewport.scrollY');
          const wheelPoint = await evaluate(harness.page, `(() => {
            const rect=document.querySelector('.dude-review-overlay').getBoundingClientRect();
            return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
          })()`);
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: wheelPoint.x,
            y: wheelPoint.y,
            button: 'none',
            buttons: 0,
          });
          for (let tick = 0; tick < 40; tick += 1) {
            await harness.page.send('Input.dispatchMouseEvent', {
              type: 'mouseWheel',
              x: wheelPoint.x,
              y: wheelPoint.y,
              deltaX: 0,
              deltaY: 8,
            });
          }
          const afterWheel = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return !state.busy && state.view.viewport.scrollY > beforeWheel ? state : null;
          }, 'settled visible wheel burst');

          // Assert: ordinary scrolling changes the retained view without any
          // user-visible readiness diagnosis.
          assert.ok(afterWheel.view.viewport.scrollY >= beforeWheel + 300);
          assert.deepEqual(
            await evaluate(harness.page, 'window.__reviewMessages'),
            [],
            'settled visible scrolling is silent',
          );
          assert.equal(pendingReviewPhase(harness), 'pending');

          // Arrange: move the still-active frame wholly below the emulated
          // viewport. It remains laid out and script-enabled, but its sandbox
          // deliberately has no allow-same-origin token.
          const recovered = await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 });
          assert.equal(recovered.ok, true);
          await resetReviewObservations(harness);
          await evaluate(harness.page, `new Promise(resolve => {
            const host=document.querySelector('[data-t010-regression-host]');
            host.style.top='calc(100vh + 64px)';
            requestAnimationFrame(()=>requestAnimationFrame(resolve));
          })`);
          const frameFacts = await evaluate(harness.page, `(() => {
            const iframe=document.querySelector('.dude-review-frame iframe');
            const rect=iframe.getBoundingClientRect();
            return {
              sandbox:iframe.getAttribute('sandbox'),
              opaque:iframe.contentDocument===null,
              rect:rect.toJSON(),
              viewport:{width:innerWidth,height:innerHeight},
              intersectionWidth:Math.max(0,Math.min(rect.right,innerWidth)-Math.max(rect.left,0)),
              intersectionHeight:Math.max(0,Math.min(rect.bottom,innerHeight)-Math.max(rect.top,0)),
            };
          })()`);
          assert.equal(frameFacts.sandbox, 'allow-scripts');
          assert.equal(frameFacts.opaque, true, 'sandboxing gives the same-origin URL an opaque origin');
          assert.ok(frameFacts.rect.top >= frameFacts.viewport.height);
          assert.equal(frameFacts.intersectionWidth * frameFacts.intersectionHeight, 0);
          await source.evaluate(`(() => {
            window.__offscreenRaf={started:performance.now(),served:false,servedAt:null};
            requestAnimationFrame(()=>{
              window.__offscreenRaf.served=true;
              window.__offscreenRaf.servedAt=performance.now();
            });
            return true;
          })()`);

          // Act: an explicit production scroll refresh now reaches the real
          // four-second bridge deadline.
          const timeoutStarted = performance.now();
          const offscreen = await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 80 });
          const timeoutElapsed = performance.now() - timeoutStarted;

          // Assert: zero replies plus a stalled child rAF prove this is the
          // off-screen renderer throttle, not loading or an inspector refusal.
          const offscreenProof = await source.evaluate(`({
            diagnostics:window.__readinessFixture.diagnostics(),
            raf:window.__offscreenRaf,
            elapsed:performance.now()-window.__offscreenRaf.started,
          })`);
          assert.deepEqual(
            { ok: offscreen.ok, code: offscreen.code, message: offscreen.message },
            { ok: false, code: 'review_frame_unresponsive', message: frameMessage },
          );
          assert.ok(
            timeoutElapsed >= 3900 && timeoutElapsed < 6500,
            `off-screen bridge timeout was bounded at four seconds, observed ${timeoutElapsed} ms`,
          );
          assert.equal(offscreenProof.raf.served, false, 'the off-screen child rAF did not turn');
          assert.ok(offscreenProof.elapsed >= 3900);
          assert.deepEqual(
            {
              readyState: offscreenProof.diagnostics.readyState,
              fonts: offscreenProof.diagnostics.fonts,
              incompleteImages: offscreenProof.diagnostics.incompleteImages,
              runningAnimations: offscreenProof.diagnostics.runningAnimations,
            },
            {
              readyState: 'complete',
              fonts: 'loaded',
              incompleteImages: 0,
              runningAnimations: 0,
            },
          );
          assert.equal(
            (await evaluate(harness.page, 'window.__reviewBridgeLog'))
              .filter(event => event.type === 'dude-review-result').length,
            0,
            'the timed-out bridge query received no child result',
          );
          assert.deepEqual(
            await evaluate(harness.page, 'window.__reviewMessages'),
            [{ message: frameMessage, error: true, code: 'review_frame_unresponsive' }],
          );
          assert.equal(pendingReviewPhase(harness), 'pending');

          // Restore visibility so the timed-out child work can drain, then
          // trigger the bridge's own external-scroll notification. The parent
          // moves the frame off-screen in the notification task, before the
          // scheduled refresh frame runs.
          await evaluate(harness.page, `new Promise(resolve => {
            document.querySelector('[data-t010-regression-host]').style.top='-1px';
            requestAnimationFrame(()=>requestAnimationFrame(resolve));
          })`);
          await until(
            () => source.evaluate('window.__offscreenRaf.served'),
            'previously throttled child rAF resumes on screen',
          );
          await until(
            () => evaluate(harness.page, '!window.__review.getState().busy'),
            'late off-screen bridge work drains',
          );
          assert.equal(
            (await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 })).ok,
            true,
            'the visible frame recovers before testing scheduled refresh',
          );
          await resetReviewObservations(harness);
          await evaluate(harness.page, `(() => {
            window.__scheduleOffscreenAt=null;
            const move=event=>{
              if(event.data?.type!=='dude-review-scrolled') return;
              window.removeEventListener('message',move);
              const iframe=document.querySelector('.dude-review-frame iframe');
              document.querySelector('[data-t010-regression-host]').style.top='calc(100vh + 64px)';
              // Preserve the production race that makes scheduleRefresh see
              // the timeout: an already accepted scroll is waiting for the
              // now-throttled child rAF, so its following view read queues
              // behind that work and receives no bridge reply.
              iframe.contentWindow.postMessage({
                type:'dude-review-query',
                channel:event.data.channel,
                id:900000000,
                op:'scroll',
                x:0,
                y:120,
              },'*');
              window.__scheduleOffscreenAt=performance.now();
            };
            window.addEventListener('message',move);
          })()`);
          await source.evaluate('scrollTo({left:0,top:120,behavior:"instant"})');
          await until(
            () => evaluate(harness.page, 'window.__scheduleOffscreenAt!==null'),
            'real bridge scroll notification moves the frame off screen',
          );
          await until(
            () => evaluate(harness.page, 'window.__review.getState().busy'),
            'scheduled off-screen refresh starts',
          );
          await until(
            () => evaluate(harness.page, `!window.__review.getState().busy
              && performance.now()-window.__scheduleOffscreenAt>=3900`),
            'scheduled off-screen refresh reaches its bridge deadline',
            7_000,
          );
          const scheduledOffscreen = await evaluate(harness.page, `({
            messages:window.__reviewMessages,
            bridge:window.__reviewBridgeLog,
            frameTop:document.querySelector('.dude-review-frame iframe').getBoundingClientRect().top,
            viewportHeight:innerHeight,
          })`);
          assert.ok(scheduledOffscreen.frameTop >= scheduledOffscreen.viewportHeight);
          assert.ok(scheduledOffscreen.bridge.some(event => event.type === 'dude-review-scrolled'));
          assert.equal(
            scheduledOffscreen.bridge.filter(event => event.type === 'dude-review-result').length,
            0,
            'the scheduled refresh exercised review_frame_unresponsive',
          );
          assert.deepEqual(
            scheduledOffscreen.messages,
            [],
            'scheduleRefresh keeps review_frame_unresponsive silent',
          );

          // Arrange: save real markup, then remount that production state
          // off-screen so initialize() takes its restore path.
          await evaluate(harness.page, `new Promise(resolve => {
            document.querySelector('[data-t010-regression-host]').style.top='-1px';
            requestAnimationFrame(()=>requestAnimationFrame(resolve));
          })`);
          await until(
            () => evaluate(harness.page, 'window.__reviewBridgeLog.some(event=>event.type==="dude-review-result")'),
            'scheduled timeout work drains after visibility returns',
          );
          assert.equal(
            (await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 })).ok,
            true,
          );
          await harness.command({ type: 'tool', tool: 'box' });
          const annotationId = await harness.command({ type: 'addAtCenter' });
          const saved = await harness.command({ type: 'save' });
          const stored = harness.readWorking();
          const restoredReview = {
            ...harness.opened,
            working: stored.state,
            workingRevision: saved.workingRevision,
          };

          // Act: initialize must retry the same timeout rather than reporting
          // after the first failed restore.
          await harness.mount(restoredReview, 'light', false, true);
          await until(
            () => evaluate(harness.page, `(() => {
              const values=window.__reviewChanges.map(state=>state.busy);
              let first=values.indexOf(true);
              if(first<0) return false;
              let gap=values.indexOf(false,first+1);
              return gap>=0&&values.indexOf(true,gap+1)>=0;
            })()`),
            'off-screen initialize retry begins after its first timeout',
            7_000,
          );
          assert.deepEqual(
            await evaluate(harness.page, 'window.__reviewMessages'),
            [],
            'initialize does not report the first transient timeout',
          );
          const initializedFailure = await until(async () => {
            const timeline = await evaluate(harness.page, 'window.__reviewMessageTimeline');
            return timeline.find(entry => entry.code === 'review_frame_unresponsive') ?? null;
          }, 'specific initialize timeout diagnosis', 12_000);
          const initializeElapsed = initializedFailure.at
            - await evaluate(harness.page, 'window.__reviewMountedAt');
          assert.ok(
            initializeElapsed >= 7900,
            `initialize retried until its eight-second bound, observed ${initializeElapsed} ms`,
          );
          assert.deepEqual(
            {
              message: initializedFailure.message,
              error: initializedFailure.error,
              code: initializedFailure.code,
            },
            { message: frameMessage, error: true, code: 'review_frame_unresponsive' },
          );
          assert.equal(
            (await evaluate(harness.page, 'window.__reviewBridgeLog'))
              .filter(event => event.type === 'dude-review-result').length,
            0,
          );
          const retained = await evaluate(harness.page, 'window.__review.getState()');
          assert.equal(retained.ready, false);
          assert.ok(retained.annotations.some(annotation => annotation.id === annotationId));
          assert.equal(pendingReviewPhase(harness), 'pending');
          source = await until(
            () => attachT010SourceFrame(harness).catch(() => null),
            'remounted off-screen canonical frame',
          );
          const restoredChild = await source.evaluate('window.__readinessFixture.diagnostics()');
          assert.deepEqual(
            {
              readyState: restoredChild.readyState,
              fonts: restoredChild.fonts,
              incompleteImages: restoredChild.incompleteImages,
              runningAnimations: restoredChild.runningAnimations,
            },
            {
              readyState: 'complete',
              fonts: 'loaded',
              incompleteImages: 0,
              runningAnimations: 0,
            },
            'initialize reports frame silence even though the restored child is settled',
          );
        } finally {
          if (harness) await harness.close();
        }
      });

test('T013 Review readiness: unstable views, running transitions, and incomplete lazy images keep distinct diagnoses', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T013 visible readiness coverage leaves no exact Review profile created by this test process',
        ));
        const unsettledMessage = 'The mock kept changing while its view was read. Your markup is retained; try again.';
        const notReadyMessage = 'The mock has not settled. Wait for its fonts, images, animations, and layout.';
        let harness;
        try {
          // Arrange: retain one real annotation and server-side working
          // revision before inducing any transient source behavior.
          harness = await createT010ReviewHarness(context, {
            number: '765',
            slug: 'readiness-visible-causes',
            html: readinessReviewHtml('stable'),
            width: 480,
            height: 360,
            profileOwnership,
          });
          const source = await attachT010SourceFrame(harness);
          await harness.command({ type: 'tool', tool: 'box' });
          const annotationId = await harness.command({ type: 'addAtCenter' });
          const saved = await harness.command({ type: 'save' });
          const retainedWorking = harness.readWorking();
          assert.ok(retainedWorking.state.annotations.some(annotation => annotation.id === annotationId));

          // Act: a monotonic ordinary timer changes source text between the two
          // complete view reads.
          await setReadinessMode(source, 'unstable');
          const unstableDiagnostics = await until(async () => {
            const value = await source.evaluate('window.__readinessFixture.diagnostics()');
            return value.readyState === 'complete' && value.fonts === 'loaded'
              && value.mutationCount >= 2 ? value : null;
          }, 'settled but mutating source');
          await resetReviewObservations(harness);
          const unstable = await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 120 });

          // Assert: this is a view-refresh mismatch, not loading or silence.
          assert.deepEqual(
            { ok: unstable.ok, code: unstable.code, message: unstable.message },
            { ok: false, code: 'review_view_unsettled', message: unsettledMessage },
          );
          assert.deepEqual(
            {
              readyState: unstableDiagnostics.readyState,
              fonts: unstableDiagnostics.fonts,
              incompleteImages: unstableDiagnostics.incompleteImages,
              runningAnimations: unstableDiagnostics.runningAnimations,
            },
            {
              readyState: 'complete',
              fonts: 'loaded',
              incompleteImages: 0,
              runningAnimations: 0,
            },
          );
          assert.deepEqual(
            await evaluate(harness.page, 'window.__reviewMessages'),
            [{ message: unsettledMessage, error: true, code: 'review_view_unsettled' }],
          );
          assert.deepEqual(harness.readWorking(), retainedWorking, 'unsettled refresh retains saved markup bytes');
          assert.equal(pendingReviewPhase(harness), 'pending', 'unsettled refresh does not consume the waiter');

          // Arrange + Act: exercise the same mismatch through the bridge's
          // external-scroll notification and scheduleRefresh().
          const quiescent = await settleReadinessFixture(harness, source);
          assert.deepEqual(
            {
              mutationTimerActive: quiescent.diagnostics.mutationTimerActive,
              mutationInFlight: quiescent.diagnostics.mutationInFlight,
              generationAdvanced: quiescent.diagnostics.lastMutationGeneration
                < quiescent.diagnostics.mutationGeneration,
              engineBusy: quiescent.state.busy,
            },
            {
              mutationTimerActive: false,
              mutationInFlight: 0,
              generationAdvanced: true,
              engineBusy: false,
            },
            'stable mode clears and supersedes the mutation interval before recovery',
          );
          assert.equal(
            (await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 })).ok,
            true,
          );
          await setReadinessMode(source, 'unstable');
          await resetReviewObservations(harness);
          await source.evaluate('scrollTo({left:0,top:80,behavior:"instant"})');
          const scheduledUnsettled = await until(async () => {
            const value = await evaluate(harness.page, `({
              busy:window.__review.getState().busy,
              messages:window.__reviewMessages,
              bridge:window.__reviewBridgeLog,
            })`);
            const results = value.bridge.filter(event => event.type === 'dude-review-result');
            return !value.busy && results.length >= 2 ? value : null;
          }, 'scheduled unsettled refresh');
          const scheduledSignatures = scheduledUnsettled.bridge
            .filter(event => event.type === 'dude-review-result' && event.signature)
            .map(event => event.signature);
          assert.ok(new Set(scheduledSignatures).size >= 2,
            'the two scheduled production reads returned different signatures');
          assert.deepEqual(
            scheduledUnsettled.messages,
            [],
            'scheduleRefresh keeps review_view_unsettled silent',
          );

          // Arrange + Act: a genuine running CSS transition must still be
          // refused by the unchanged inspector readiness gate.
          await settleReadinessFixture(harness, source);
          assert.equal(
            (await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 })).ok,
            true,
          );
          const armedAnimation = await setReadinessMode(source, 'scroll-animation');
          assert.equal(armedAnimation.runningAnimations, 0);
          assert.equal(armedAnimation.incompleteImages, 0);
          await resetReviewObservations(harness);
          const animation = await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 120 });
          const animationDiagnostics = await source.evaluate('window.__readinessFixture.diagnostics()');
          assert.deepEqual(
            { ok: animation.ok, code: animation.code, message: animation.message },
            { ok: false, code: 'review_not_ready', message: notReadyMessage },
          );
          assert.ok(
            animationDiagnostics.runningAnimations > 0,
            'the production scroll started the transition that caused review_not_ready',
          );
          assert.deepEqual(
            await evaluate(harness.page, 'window.__reviewMessages'),
            [{ message: notReadyMessage, error: true, code: 'review_not_ready' }],
          );

          // Arrange + Act: schedule the same genuine refusal from a native
          // source scroll. The bridge result identifies the swallowed code.
          await settleReadinessFixture(harness, source);
          assert.equal(
            (await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 })).ok,
            true,
          );
          await setReadinessMode(source, 'scroll-animation');
          await resetReviewObservations(harness);
          await source.evaluate('scrollTo({left:0,top:80,behavior:"instant"})');
          const scheduledNotReady = await until(async () => {
            const value = await evaluate(harness.page, `({
              busy:window.__review.getState().busy,
              messages:window.__reviewMessages,
              bridge:window.__reviewBridgeLog,
            })`);
            return !value.busy
              && value.bridge.some(event => event.error === 'review_not_ready') ? value : null;
          }, 'scheduled animation refusal');
          assert.deepEqual(
            scheduledNotReady.messages,
            [],
            'scheduleRefresh keeps review_not_ready silent',
          );

          // Arrange + Act: an invalid lazy image has no natural pixels even
          // after its error completes, and must remain a genuine readiness
          // refusal independent of animation state.
          await settleReadinessFixture(harness, source);
          assert.equal(
            (await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 0 })).ok,
            true,
          );
          await setReadinessMode(source, 'image');
          const imageDiagnostics = await until(async () => {
            const value = await source.evaluate('window.__readinessFixture.diagnostics()');
            return value.images === 1 && value.incompleteImages === 1 ? value : null;
          }, 'incomplete lazy image');
          assert.equal(imageDiagnostics.runningAnimations, 0);
          await resetReviewObservations(harness);
          const image = await reviewCommandOutcome(harness, { type: 'scroll', x: 0, y: 120 });

          // Assert: collapsing either the timeout or changing-view diagnosis
          // back into review_not_ready makes these exact-code oracles fail.
          assert.deepEqual(
            { ok: image.ok, code: image.code, message: image.message },
            { ok: false, code: 'review_not_ready', message: notReadyMessage },
          );
          assert.deepEqual(
            new Set([unstable.code, animation.code, image.code]),
            new Set(['review_view_unsettled', 'review_not_ready']),
          );
          assert.deepEqual(harness.readWorking(), retainedWorking);
          assert.equal(pendingReviewPhase(harness), 'pending');
          assert.equal(
            saved.workingRevision,
            `sha256:${sha256(fs.readFileSync(path.join(harness.reviewDirectory, 'working.json')))}`,
          );
        } finally {
          if (harness) await harness.close();
        }
      });

test('T013 Review readiness: initialize retries genuine and changing-view refusals then reports the repeated cause', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T013 initialize coverage leaves no exact Review profile created by this test process',
        ));
        const cases = [
          {
            mode: 'animation',
            number: '766',
            slug: 'readiness-initialize-animation',
            code: 'review_not_ready',
            message: 'The mock has not settled. Wait for its fonts, images, animations, and layout.',
          },
          {
            mode: 'unstable',
            number: '767',
            slug: 'readiness-initialize-unsettled',
            code: 'review_view_unsettled',
            message: 'The mock kept changing while its view was read. Your markup is retained; try again.',
          },
        ];
        const observedCodes = [];
        for (const fixture of cases) {
          let harness;
          try {
            // Arrange: mount an initially non-ready real source without waiting
            // for the engine. Its bridge and all retry timing remain production.
            harness = await createT010ReviewHarness(context, {
              number: fixture.number,
              slug: fixture.slug,
              html: readinessReviewHtml(/** @type {any} */ (fixture.mode)),
              width: 480,
              height: 360,
              waitForInitialReady: false,
              profileOwnership,
            });
            const source = await until(
              () => attachT010SourceFrame(harness).catch(() => null),
              `${fixture.mode} initialize source frame`,
            );
            const diagnostics = await until(async () => {
              const value = await source.evaluate('window.__readinessFixture.diagnostics()');
              if (value.readyState !== 'complete' || value.fonts !== 'loaded') return null;
              if (fixture.mode === 'animation') return value.runningAnimations > 0 ? value : null;
              return value.mutationCount >= 2 ? value : null;
            }, `${fixture.mode} initialize cause`);

            // Act: observe at least two production refusals before the bounded
            // initialize loop is allowed to give up.
            const retried = await until(async () => {
              const value = await evaluate(harness.page, `({
                ready:window.__review.getState().ready,
                messages:window.__reviewMessages,
                bridge:window.__reviewBridgeLog,
              })`);
              if (fixture.code === 'review_not_ready') {
                return value.bridge.filter(event=>event.error==='review_not_ready').length >= 2
                  ? value : null;
              }
              const signatures = value.bridge
                .filter(event=>event.type==='dude-review-result'&&event.signature)
                .map(event=>event.signature);
              return new Set(signatures).size >= 2 ? value : null;
            }, `${fixture.mode} initialize retries`);

            // Assert: transient attempts are silent and the source evidence
            // identifies the expected cause rather than another diagnosis.
            assert.equal(retried.ready, false);
            assert.deepEqual(retried.messages, [], 'initialize does not report a retryable attempt');
            if (fixture.mode === 'animation') {
              assert.ok(diagnostics.runningAnimations > 0);
              assert.equal(diagnostics.incompleteImages, 0);
            } else {
              assert.equal(diagnostics.runningAnimations, 0);
              assert.equal(diagnostics.incompleteImages, 0);
            }

            const failure = await until(async () => {
              const timeline = await evaluate(harness.page, 'window.__reviewMessageTimeline');
              return timeline.find(entry => entry.code === fixture.code) ?? null;
            }, `${fixture.mode} initialize give-up`, 12_000);
            const elapsed = failure.at - await evaluate(harness.page, 'window.__reviewMountedAt');
            assert.ok(
              elapsed >= 7900,
              `${fixture.mode} initialize retried until eight seconds, observed ${elapsed} ms`,
            );
            assert.deepEqual(
              { message: failure.message, error: failure.error, code: failure.code },
              { message: fixture.message, error: true, code: fixture.code },
            );
            assert.equal(
              (await evaluate(harness.page, 'window.__reviewMessageTimeline')).length,
              1,
              'the bounded give-up reports once rather than once per retry',
            );
            assert.equal(pendingReviewPhase(harness), 'pending');
            observedCodes.push(failure.code);
          } finally {
            if (harness) await harness.close();
          }
        }
        assert.deepEqual(
          observedCodes,
          ['review_not_ready', 'review_view_unsettled'],
          'initialize preserves the specific cause it kept encountering',
        );
      });

test('T013 capture readiness: a fresh capture refused by a running animation says so', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T013 capture readiness coverage leaves no exact Review profile created by this test process',
        ));
        const [{ capturePage }, { ReviewError }] = await Promise.all([
          import('../../src/extensions/dude/lib/review/browser.mjs'),
          import('../../src/extensions/dude/lib/review/data.mjs'),
        ]);
        // The capture seam refuses through the same unchanged inspector gate the
        // mounted engine uses, so its single readiness message must name every
        // condition readView() checks. This is the identical wording the mounted
        // engine already reports for review_not_ready in the cases above.
        const notReadyMessage = 'The mock has not settled. Wait for its fonts, images, animations, and layout.';
        const captureOrigin = 'http://127.0.0.1:43127';
        const captureViewport = {
          width: 320,
          height: 240,
          scrollX: 0,
          scrollY: 0,
          deviceScale: 1,
          theme: 'light',
          documentWidth: 320,
          documentHeight: 240,
        };
        const captureState = (seed) => ({
          annotations: [],
          notes: '',
          tool: 'select',
          selectedId: null,
          caret: null,
          view: {
            viewport: captureViewport,
            signature: `sha256:${sha256(`host:${seed}`)}`,
          },
          palette: {
            stroke: '#d13438',
            background: '#ffffff',
            foreground: '#242424',
            highlightFill: '#fff4ce',
            highlightStroke: '#c19c00',
            selection: '#0f6cbd',
            fontFamily: 'Segoe UI',
          },
        });
        const captureInput = (fixtureHtml, seed) => {
          const captureId = randomUUID();
          const framePath = `/review-source/${captureId}/mock.html`;
          return {
            // Only the mock itself is served. Nothing else can be blamed for
            // the refusal that follows.
            resources: new Map([[
              framePath,
              { bytes: Buffer.from(fixtureHtml), mime: 'text/html; charset=utf-8' },
            ]]),
            framePath,
            origin: captureOrigin,
            state: captureState(seed),
            signal: new AbortController().signal,
          };
        };

        // Arrange: one source whose only unsettled condition is a sixty-second
        // CSS animation, and one whose only unsettled condition is an image
        // that never yields natural pixels. Neither carries the other's cause.
        const animationHtml = [
          '<!doctype html><meta charset="utf-8"><style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px/1.4 system-ui}',
          '@keyframes drift{from{transform:translateX(0)}to{transform:translateX(180px)}}',
          '#mover{width:120px;height:40px;background:#0f6cbd;animation:drift 60s linear}',
          '</style><div id="mover"></div>',
        ].join('');
        const imageHtml = [
          '<!doctype html><meta charset="utf-8"><style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px/1.4 system-ui}',
          'img{width:40px;height:40px}',
          '</style><img src="/never-served.png" alt="Unservable capture fixture">',
        ].join('');

        // Act: drive the production capture seam directly, once per cause.
        const fixtures = [
          { name: 'running animation', input: captureInput(animationHtml, 'capture-animation') },
          { name: 'image without natural pixels', input: captureInput(imageHtml, 'capture-image') },
        ];
        const refusals = [];
        for (const fixture of fixtures) {
          const outcome = await capturePage(fixture.input).then(
            (value) => ({ refused: false, value }),
            (error) => ({ refused: true, error }),
          );
          assert.equal(outcome.refused, true, `${fixture.name} refuses the fresh capture`);
          assert.ok(
            outcome.error instanceof ReviewError,
            `${fixture.name} refuses through the production review error`,
          );
          refusals.push({
            name: fixture.name,
            code: outcome.error.code,
            status: outcome.error.status,
            message: outcome.error.message,
          });
        }

        // Assert: an animation-caused refusal must not misreport its cause as
        // fonts, images, or layout. Restoring a copy that omits animations
        // fails the first assertion; changing, splitting, or re-coding the
        // other readiness causes fails the second.
        assert.match(
          refusals.find(({ name }) => name === 'running animation').message,
          /animations/,
          'the animation-only capture refusal names animations',
        );
        assert.deepEqual(
          refusals,
          fixtures.map(({ name }) => ({
            name,
            code: 'review_not_ready',
            status: 503,
            message: notReadyMessage,
          })),
          'every capture readiness refusal reports the one accurate readiness message',
        );
      });

test('T012 anchoring regression: root scrolling retains an unchanged annotation', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 root-scroll control leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-anchor-root-control');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>html,body{margin:0}body{min-height:1400px;font:16px system-ui}',
          '#target{display:block;margin:120px 24px 0;padding:16px;width:260px}</style>',
          '<button id="target">Unchanged root-scroll target</button>',
        ].join('');
        let harness;
        try {
          // Arrange.
          harness = await createT010ReviewHarness(context, {
            number: '757',
            slug: 'root-anchor-control',
            html,
            width: 480,
            height: 360,
            profileOwnership,
          });
          await harness.command({ type: 'element', selector: '#target' });
          const initialTarget = await evaluate(harness.page, 'window.__review.getState().target');
          const annotationId = await harness.command({ type: 'addComment' });
          await harness.command({
            type: 'edit',
            id: annotationId,
            changes: { comment: 'Root scrolling must not change this anchor identity.' },
          });
          await harness.command({ type: 'save' });

          // Act: take the ordinary production root-scroll route offscreen and
          // back, then exercise the same inactive/active path as Back/re-enter.
          await harness.command({ type: 'scroll', x: 0, y: 600 });
          const offscreen = await evaluate(harness.page, 'window.__review.getState()');
          await harness.command({ type: 'scroll', x: 0, y: 0 });
          await harness.command({ type: 'element', selector: '#target' });
          const returnedTarget = await evaluate(harness.page, 'window.__review.getState().target');
          await evaluate(harness.page, 'window.__review.update({ active: false })');
          await evaluate(harness.page, 'window.__review.update({ active: true })');
          const returned = await until(
            () => evaluate(harness.page, `(() => {
              const state = window.__review.getState();
              return state.ready && !state.busy ? state : null;
            })()`),
            'unchanged root anchor after re-entry',
            15_000,
          );

          // Assert.
          assert.equal(offscreen.view.viewport.scrollY, 600);
          assert.equal(offscreen.annotations.length, 1);
          assert.equal(offscreen.stale, false);
          assert.deepEqual(returnedTarget, initialTarget);
          assert.equal(returned.annotations.length, 1);
          assert.equal(returned.stale, false);
          const screenshot = evidence.image('root-scroll-returned.png', await harness.screenshot());
          evidence.json('root-scroll-control.json', {
            case: context.name,
            verification: {
              command: "DUDE_CANVAS_BROWSER_REQUIRED=1 node --test --test-name-pattern='T012 anchoring regression:' scripts/dude-canvas-ui/browser.test.mjs",
              result: 'pass',
            },
            browser: harness.browser.info.Browser,
            initialTarget,
            offscreen: {
              scrollY: offscreen.view.viewport.scrollY,
              annotationCount: offscreen.annotations.length,
              stale: offscreen.stale,
            },
            returnedTarget,
            returned: {
              scrollY: returned.view.viewport.scrollY,
              annotationCount: returned.annotations.length,
              stale: returned.stale,
              error: returned.error,
            },
            screenshot,
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 anchoring regression: nested-scroll Open comment clips then recovers before delivery', {
        timeout: 180_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 nested-anchor regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-anchor-regression');
        const productAppSha256 = sha256(fs.readFileSync(path.join(
          ROOT,
          'src/extensions/dude/ui/assets/app.js',
        )));
        assert.equal(
          productAppSha256,
          '8a571800c96c8e55fb7eba4ac06e31a345334bf7ae9cc338d753fd7371a9055c',
          'the exact-source regression executes the current published product UI',
        );
        const exactHarnessOptions = {
          number: '757',
          slug: 'nested-open-recovery',
          html: nestedOpenFixtureHtml(),
          width: 908,
          height: 586,
          theme: /** @type {'light'} */ ('light'),
          deviceScale: 2,
          profileOwnership,
        };
        let harness;
        let atMaxHarness;
        let sealedAtInnerMax;
        try {
          // First seal the stable synthetic mock while MAIN is still at its
          // 376px maximum. The second allocation below owns the reported
          // 376 -> 0 clip refusal and the expected 0 -> 376 recovery.
          atMaxHarness = await createT010ReviewHarness(context, exactHarnessOptions);
          const atMaxSource = await attachT010SourceFrame(atMaxHarness);
          const atMaxTarget = await evaluate(atMaxHarness.page, `window.__review.getState().targets
            .find(target => target.selector === '#open')`);
          assert.ok(atMaxTarget, 'the at-376 capture exposes the synthetic unique Open button');
          assert.equal(await atMaxSource.evaluate(`new Promise(resolve => {
            const main = [...document.querySelectorAll('main')].find(candidate => {
              const style = getComputedStyle(candidate);
              return style.overflowY === 'auto' && candidate.scrollHeight > candidate.clientHeight;
            });
            main.scrollTop = 376;
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(main.scrollTop)));
          })`), 376);
          await until(async () => {
            const state = await evaluate(atMaxHarness.page, 'window.__review.getState()');
            return !state.busy && state.view.scrolls?.length === 1
              && state.view.scrolls[0].scrollTop === 376
              ? state
              : null;
          }, 'synthetic at-376 engine view');
          await atMaxHarness.command({ type: 'scroll', x: 0, y: 0 });
          await atMaxHarness.command({ type: 'element', selector: atMaxTarget.selector });
          const atMaxId = await atMaxHarness.command({ type: 'addComment' });
          await atMaxHarness.command({
            type: 'edit',
            id: atMaxId,
            changes: { comment: 'can’t change the status to closed' },
          });
          const atMaxSeal = await atMaxHarness.command({ type: 'seal' }, 45_000);
          assert.equal(atMaxSeal.status, 'sealed');
          const atMaxWorking = atMaxHarness.readWorking();
          const atMaxProvenance = JSON.parse(fs.readFileSync(
            path.join(atMaxHarness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          const atMaxReport = fs.readFileSync(path.join(atMaxHarness.reviewDirectory, 'report.md'));
          const atMaxImage = fs.readFileSync(path.join(atMaxHarness.reviewDirectory, 'annotated.png'));
          const { decodePng: decodeAtMaxPng } = await import('../../src/extensions/dude/lib/review/png.mjs');
          const atMaxDecoded = decodeAtMaxPng(atMaxImage);
          const atMaxStroke = atMaxWorking.state.palette.stroke.match(/[a-f0-9]{2}/gi)
            .map(value => Number.parseInt(value, 16));
          let atMaxPainted = false;
          for (let y = 178 * 2 - 7; y <= 178 * 2 + 7 && !atMaxPainted; y += 1) {
            for (let x = (661 + 11) * 2 - 7; x <= (661 + 11) * 2 + 7; x += 1) {
              if (decodedPixel(atMaxDecoded, x, y).slice(0, 3).every((channel, index) => (
                Math.abs(channel - atMaxStroke[index]) <= 35
              ))) {
                atMaxPainted = true;
                break;
              }
            }
          }
          assert.deepEqual(
            {
              point: {
                x: atMaxWorking.state.annotations[0].x1,
                y: atMaxWorking.state.annotations[0].y1,
              },
              basis: atMaxWorking.state.annotations[0].scrollBasis,
              view: atMaxWorking.state.view.scrolls,
              capture: atMaxProvenance.capture.scrolls,
            },
            {
              point: { x: 661, y: 178 },
              basis: [{
                selector: atMaxWorking.state.annotations[0].scrollBasis[0].selector,
                scrollLeft: 0,
                scrollTop: 376,
              }],
              view: [{
                selector: atMaxWorking.state.annotations[0].scrollBasis[0].selector,
                scrollLeft: 0,
                scrollTop: 376,
              }],
              capture: [{
                selector: atMaxWorking.state.annotations[0].scrollBasis[0].selector,
                scrollLeft: 0,
                scrollTop: 376,
              }],
            },
          );
          assert.match(
            atMaxReport.toString('utf8'),
            /Geometry: at \(661, 178\)\.[\s\S]*Original annotation geometry: at \(661, 178\)\./,
          );
          assert.equal(atMaxPainted, true, 'the at-376 fresh PNG paints the synthetic marker');
          sealedAtInnerMax = {
            originalCss: { x: 661, y: 178 },
            currentCss: { x: 661, y: 178 },
            currentDevice: { x: 1322, y: 356 },
            scrolls: atMaxProvenance.capture.scrolls,
            reportSha256: sha256(atMaxReport),
            image: evidence.image('open-sealed-at-inner-max.png', atMaxImage),
            pixelAligned: atMaxPainted,
          };
          await atMaxHarness.close();
          atMaxHarness = null;

          // Arrange: open a second exact synthetic owner allocation at the
          // same 908x586, DPR 2, light reviewed viewport.
          harness = await createT010ReviewHarness(context, exactHarnessOptions);
          const targetInfos = (await harness.page.send('Target.getTargets')).targetInfos;
          const sourceTarget = targetInfos.find(target => (
            target.type === 'iframe' && target.url.includes(harness.opened.framePath)
          ));
          assert.ok(sourceTarget, `the exact reviewed source iframe is attached: ${JSON.stringify(targetInfos)}`);
          const { sessionId: sourceSession } = await harness.page.send('Target.attachToTarget', {
            targetId: sourceTarget.targetId,
            flatten: true,
          });
          await harness.page.send('Runtime.enable', {}, sourceSession);
          const sourceEvaluate = async expression => {
            const result = await harness.page.send('Runtime.evaluate', {
              expression,
              awaitPromise: true,
              returnByValue: true,
            }, sourceSession);
            if (result.exceptionDetails) {
              throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
            }
            return result.result?.value;
          };
          const readSource = selector => sourceEvaluate(`(() => {
            const selector = ${JSON.stringify(selector)};
            const matches = document.querySelectorAll(selector);
            const node = matches[0];
            const rect = node?.getBoundingClientRect();
            const main = [...document.querySelectorAll('main')].find(candidate => {
              const style = getComputedStyle(candidate);
              return style.overflowY === 'auto' && candidate.scrollHeight > candidate.clientHeight;
            });
            const portRect = main?.getBoundingClientRect();
            const portClient = main && portRect && {
              left: portRect.left + main.clientLeft,
              top: portRect.top + main.clientTop,
              right: portRect.left + main.clientLeft + main.clientWidth,
              bottom: portRect.top + main.clientTop + main.clientHeight,
            };
            return {
              rootScroll: { x: scrollX, y: scrollY },
              rootViewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
              port: main && {
                tag: main.tagName,
                className: String(main.className),
                scrollTop: main.scrollTop,
                nativeRect: {
                  x: portRect.x,
                  y: portRect.y,
                  width: portRect.width,
                  height: portRect.height,
                },
                client: {
                  left: main.clientLeft,
                  top: main.clientTop,
                  width: main.clientWidth,
                  height: main.clientHeight,
                },
                ancestorClip: {
                  left: Math.max(0, portClient.left),
                  top: Math.max(0, portClient.top),
                  right: Math.min(innerWidth, portClient.right),
                  bottom: Math.min(innerHeight, portClient.bottom),
                },
                clientHeight: main.clientHeight,
                scrollHeight: main.scrollHeight,
                maxScrollTop: main.scrollHeight - main.clientHeight,
              },
              element: node && {
                selector,
                matches: matches.length,
                sameNode: globalThis.__t012AnchorNode
                  ? node === globalThis.__t012AnchorNode
                  : null,
                tag: node.localName,
                text: node.textContent,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                styles: (() => {
                  const style = getComputedStyle(node);
                  return {
                    color: style.color,
                    backgroundColor: style.backgroundColor,
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    lineHeight: style.lineHeight,
                    textAlign: style.textAlign,
                    display: style.display,
                    position: style.position,
                    width: style.width,
                    height: style.height,
                    padding: style.padding,
                    border: style.border,
                    opacity: style.opacity,
                    visibility: style.visibility,
                    overflow: style.overflow,
                  };
                })(),
              },
            };
          })()`);
          const driveInnerScroll = value => sourceEvaluate(`new Promise(resolve => {
            const main = [...document.querySelectorAll('main')].find(candidate => {
              const style = getComputedStyle(candidate);
              return style.overflowY === 'auto' && candidate.scrollHeight > candidate.clientHeight;
            });
            if (!main) throw new Error('The synthetic mock lost its nested MAIN scrollport');
            main.scrollTo({ top: ${value}, behavior: 'instant' });
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(main.scrollTop)));
          })`);
          const openTarget = await evaluate(harness.page, `window.__review.getState().targets
            .find(target => target.selector === '#open')`);
          assert.ok(openTarget, 'the exact synthetic viewport exposes its unique Open button');
          await sourceEvaluate(`globalThis.__t012AnchorNode =
            document.querySelector(${JSON.stringify(openTarget.selector)}); true`);
          const initial = await readSource(openTarget.selector);
          assert.equal(initial.port.scrollTop, 0);
          assert.equal(initial.port.maxScrollTop, 376);
          assert.equal(initial.element.matches, 1);
          assert.equal(initial.element.sameNode, true);

          // Native input on the real overlay must reach the reviewed MAIN,
          // not an iframe click or a test-only scroll command.
          const overlay = await evaluate(harness.page, `(() => {
            const node = document.querySelector('.dude-review-overlay');
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          })()`);
          const wheelPoint = {
            x: overlay.x + overlay.width / 2,
            y: overlay.y + overlay.height / 2,
          };
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            ...wheelPoint,
            button: 'none',
            buttons: 0,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            ...wheelPoint,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            ...wheelPoint,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          });
          await until(
            () => evaluate(harness.page, `document.activeElement
              === document.querySelector('.dude-review-overlay')
              && !window.__review.getState().busy`),
            'native pointer focuses the overlay before wheel input',
          );
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            ...wheelPoint,
            deltaX: 0,
            deltaY: 600,
          });
          const settledAt = y => until(async () => {
            const source = await readSource(openTarget.selector);
            return source.port.scrollTop === y
              && !(await evaluate(harness.page, 'window.__review.getState().busy')) ? source : null;
          }, `native nested scroll settles at ${y}`, 15_000);
          const afterWheel = await settledAt(376);
          assert.equal(afterWheel.rootScroll.y, 0);
          await key(harness.page, 'Home', 'Home');
          await settledAt(0);
          await key(harness.page, 'PageDown', 'PageDown');
          const afterPageDown = await settledAt(344);
          assert.equal(afterPageDown.rootScroll.y, 0);
          await key(harness.page, 'End', 'End');
          const afterNativeInput = await settledAt(376);
          assert.equal(afterNativeInput.port.scrollTop, 376);
          assert.equal(afterNativeInput.rootScroll.y, 0);

          // Native input reproduces the exact saved user state: MAIN is at its
          // 376px maximum while window scroll remains zero. Production then
          // selects and comments on the visible unique Open button.
          await harness.command({ type: 'scroll', x: 0, y: 0 });
          await harness.command({ type: 'element', selector: openTarget.selector });
          const anchoredElement = await evaluate(harness.page, 'window.__review.getState().target');
          const annotationId = await harness.command({ type: 'addComment' });
          await harness.command({
            type: 'edit',
            id: annotationId,
            changes: { comment: 'can’t change the status to closed' },
          });
          await harness.command({
            type: 'caret',
            caret: {
              id: annotationId,
              field: 'comment',
              start: 2,
              end: 7,
              direction: 'backward',
            },
          });
          await harness.command({ type: 'save' });
          const markerSnapshot = () => evaluate(harness.page, `(() => {
            const state = window.__review.getState();
            const annotation = state.annotations.find(item =>
              item.id === ${JSON.stringify(annotationId)});
            const group = document.querySelector(
              '[data-annotation="${annotationId}"]'
            );
            const circle = group?.querySelector('circle');
            const rect = circle?.getBoundingClientRect();
            const radius = circle && Number(circle.getAttribute('r'));
            const strokeWidth = circle && Number.parseFloat(getComputedStyle(circle).strokeWidth);
            const paintedRadius = radius + strokeWidth / 2;
            return {
              annotation,
              state: {
                stale: state.stale,
                editable: state.editable,
                error: state.error,
                busy: state.busy,
                status: state.status,
                selectedId: state.selectedId,
                caret: state.caret,
                canUndo: state.canUndo,
                canRedo: state.canRedo,
                annotations: state.annotations,
                signature: state.view.signature,
                viewport: state.view.viewport,
                scrolls: state.view.scrolls,
              },
              marker: circle ? {
                document: {
                  x: Number(circle.getAttribute('cx')),
                  y: Number(circle.getAttribute('cy')),
                },
                screenCss: {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                },
                nativeRect: {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                  width: rect.width,
                  height: rect.height,
                },
                paintedFootprint: {
                  left: Number(circle.getAttribute('cx')) - paintedRadius,
                  top: Number(circle.getAttribute('cy')) - paintedRadius,
                  right: Number(circle.getAttribute('cx')) + paintedRadius,
                  bottom: Number(circle.getAttribute('cy')) + paintedRadius,
                  radius: paintedRadius,
                },
                screenshotDevice: {
                  x: (rect.x + rect.width / 2) * state.view.viewport.deviceScale,
                  y: (rect.y + rect.height / 2) * state.view.viewport.deviceScale,
                },
              } : null,
            };
          })()`);
          const anchoredSource = await readSource(openTarget.selector);
          const anchored = await markerSnapshot();
          assert.deepEqual(
            {
              portScrollTop: anchoredSource.port.scrollTop,
              rootScrollY: anchoredSource.rootScroll.y,
              selectorMatches: anchoredSource.element.matches,
              elementRect: anchoredElement.rect,
              marker: anchored.marker.document,
            },
            {
              portScrollTop: 376,
              rootScrollY: 0,
              selectorMatches: 1,
              elementRect: { x: 645, y: 163, width: 238, height: 30 },
              marker: { x: 661, y: 178 },
            },
          );
          const anchoredImage = evidence.image('open-anchored-at-inner-max.png', await harness.screenshot());

          // Act: mirror the user's upward nested-scroll transition without
          // changing source bytes, viewport, theme, selector, text, or styles.
          assert.equal(await driveInnerScroll('0'), 0);
          const floatedSource = await readSource(openTarget.selector);
          assert.deepEqual(
            {
              ...anchoredSource.element,
              rect: {
                x: anchoredSource.element.rect.x,
                width: anchoredSource.element.rect.width,
                height: anchoredSource.element.rect.height,
              },
            },
            {
              ...floatedSource.element,
              rect: {
                x: floatedSource.element.rect.x,
                width: floatedSource.element.rect.width,
                height: floatedSource.element.rect.height,
              },
            },
            'nested scrolling changes only the Open button viewport Y, not its unique identity, text, or style',
          );
          const floatedAfterNotification = await until(async () => {
            const snapshot = await markerSnapshot();
            return snapshot.annotation?.x1 === floatedSource.element.rect.x + 16
              && snapshot.annotation?.y1 === floatedSource.element.rect.y + 15
              && snapshot.state.scrolls?.some(scroll => (
                scroll.selector === anchored.annotation.scrollBasis[0].selector
                && scroll.scrollTop === 0
              ))
              && !snapshot.state.busy
              ? snapshot
              : null;
          }, 'external nested scroll notification projects the annotation without an engine command', 15_000);
          const floatedSaved = await harness.command({ type: 'save' });
          assert.equal(floatedSaved.status, 'saved');
          const floatedBeforeSeal = await markerSnapshot();
          const workingPath = path.join(harness.reviewDirectory, 'working.json');
          const workingBeforeRefusal = fs.readFileSync(workingPath);
          const storedBeforeRefusal = JSON.parse(workingBeforeRefusal);
          const filesBeforeRefusal = fs.readdirSync(harness.reviewDirectory).sort();
          const saveRequests = () => harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          const sealRequests = () => harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/seal'
          )).length;
          const savesBeforeRefusal = saveRequests();
          const sealsBeforeRefusal = sealRequests();
          const waiterBeforeRefusal = harness.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === harness.record.requestHandle,
          );
          const markerRadius = anchored.marker.paintedFootprint.radius;
          const projectedFootprint = {
            left: floatedBeforeSeal.annotation.x1 - markerRadius,
            top: floatedBeforeSeal.annotation.y1 - markerRadius,
            right: floatedBeforeSeal.annotation.x1 + markerRadius,
            bottom: floatedBeforeSeal.annotation.y1 + markerRadius,
            radius: markerRadius,
          };
          const footprintInside = (clip, footprint) => (
            footprint.left >= clip.left
            && footprint.top >= clip.top
            && footprint.right <= clip.right
            && footprint.bottom <= clip.bottom
          );

          // Assert the independently measured boundary before changing the Send
          // oracle. The Open button intersects only the last two CSS pixels of
          // MAIN, while its projected comment is still inside the root viewport
          // and wholly outside MAIN's client clip.
          assert.deepEqual(
            {
              rootScroll: floatedSource.rootScroll,
              rootViewport: floatedSource.rootViewport,
              portRect: floatedSource.port.nativeRect,
              portClient: floatedSource.port.client,
              ancestorClip: floatedSource.port.ancestorClip,
              targetRect: floatedSource.element.rect,
              projectedPoint: {
                x: floatedBeforeSeal.annotation.x1,
                y: floatedBeforeSeal.annotation.y1,
              },
              projectedFootprint,
            },
            {
              rootScroll: { x: 0, y: 0 },
              rootViewport: { left: 0, top: 0, right: 908, bottom: 586 },
              portRect: { x: 0, y: 111, width: 908, height: 430 },
              portClient: { left: 0, top: 0, width: 908, height: 430 },
              ancestorClip: { left: 0, top: 111, right: 908, bottom: 541 },
              targetRect: { x: 645, y: 539, width: 238, height: 30 },
              projectedPoint: { x: 661, y: 554 },
              projectedFootprint: {
                left: 648,
                top: 541,
                right: 674,
                bottom: 567,
                radius: 13,
              },
            },
          );
          assert.equal(
            floatedSource.element.rect.y < floatedSource.port.ancestorClip.bottom
              && floatedSource.element.rect.y + floatedSource.element.rect.height
                > floatedSource.port.ancestorClip.bottom,
            true,
            'the exact Open button intersects MAIN without admitting its comment marker',
          );
          assert.equal(
            footprintInside(floatedSource.rootViewport, projectedFootprint),
            true,
            'the misplaced marker would pass a root-viewport-only check',
          );
          assert.equal(
            footprintInside(floatedSource.port.ancestorClip, projectedFootprint),
            false,
            'the marker footprint is outside the effective nested ancestor clip',
          );
          assert.deepEqual(
            {
              storedPoint: {
                x: storedBeforeRefusal.state.annotations[0].x1,
                y: storedBeforeRefusal.state.annotations[0].y1,
              },
              currentPoint: {
                x: floatedBeforeSeal.annotation.x1,
                y: floatedBeforeSeal.annotation.y1,
              },
              basis: storedBeforeRefusal.state.annotations[0].scrollBasis,
              selector: floatedSource.element.selector,
              matches: floatedSource.element.matches,
              sameNode: floatedSource.element.sameNode,
            },
            {
              storedPoint: { x: 661, y: 178 },
              currentPoint: { x: 661, y: 554 },
              basis: [{
                selector: storedBeforeRefusal.state.annotations[0].scrollBasis[0].selector,
                scrollLeft: 0,
                scrollTop: 376,
              }],
              selector: openTarget.selector,
              matches: 1,
              sameNode: true,
            },
            'scrolling changes projection and visibility, not stored geometry or anchor identity',
          );

          const floatingImage = evidence.image(
            'open-outside-main-clip.png',
            await harness.screenshot(),
          );
          let sealAttempt;
          try {
            sealAttempt = {
              ok: true,
              result: await harness.command({ type: 'seal' }, 45_000),
            };
          } catch (error) {
            sealAttempt = {
              ok: false,
              code: error.code ?? null,
              message: error.message,
            };
          }
          const afterSendAttempt = await markerSnapshot();
          const messages = await evaluate(harness.page, 'window.__reviewMessages');
          const filesAfterRefusal = fs.readdirSync(harness.reviewDirectory).sort();
          const workingAfterRefusal = fs.readFileSync(workingPath);
          const savesAfterRefusal = saveRequests();
          const sealsAfterRefusal = sealRequests();
          const waiterAfterRefusal = harness.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === harness.record.requestHandle,
          );
          const refusedImage = evidence.image(
            'open-after-outside-clip-send.png',
            await harness.screenshot(),
          );
          const ax = await harness.page.send('Accessibility.getFullAXTree');
          evidence.json('open-after-outside-clip-send.ax.json', ax);

          let unexpectedSeal = null;
          if (sealAttempt.ok) {
            const report = fs.readFileSync(path.join(harness.reviewDirectory, 'report.md'));
            const png = fs.readFileSync(path.join(harness.reviewDirectory, 'annotated.png'));
            const provenance = JSON.parse(fs.readFileSync(
              path.join(harness.reviewDirectory, 'provenance.json'),
              'utf8',
            ));
            unexpectedSeal = {
              files: filesAfterRefusal,
              reportSha256: sha256(report),
              reportGeometry: /Geometry: at \(661, 554\)\./.test(report.toString('utf8')),
              capture: provenance.capture,
              image: evidence.image('unexpected-sealed-at-inner-zero.png', png),
              finding: 'The PNG is coordinate-aligned but paints the comment on unrelated Preview controls below MAIN.',
            };
          }

          // The live engine must refuse before POSTing save/seal, but that UI
          // guard is not authority. Attempt the server route directly with the
          // real retained revision: the isolated native capture must rediscover
          // the same ancestor clip and refuse without creating immutable files.
          const directCaptureReceipt = profileOwnership.receipt();
          const directSeal = await harness.postJson('/api/needs-you/review/seal', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
            workingRevision: floatedSaved.workingRevision,
          });
          const directCaptureProfiles = profileOwnership.createdSince(directCaptureReceipt);
          const filesAfterDirectSeal = fs.readdirSync(harness.reviewDirectory).sort();
          const workingAfterDirectSeal = fs.readFileSync(workingPath);
          const waiterAfterDirectSeal = harness.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === harness.record.requestHandle,
          );

          // Assert the user contract. Keep the test red until nested clipping
          // hides the live marker and Send refuses without consuming the
          // annotation, edit state, working bytes, files, or waiting request.
          const failures = [];
          collect(failures, () => assert.equal(
            floatedBeforeSeal.marker,
            null,
            'a comment outside MAIN must not float over unrelated Preview controls',
          ));
          collect(failures, () => assert.equal(afterSendAttempt.state.stale, false,
            'ordinary nested scrolling does not make the exact source stale'));
          collect(failures, () => assert.equal(floatedSource.element.matches, 1,
            'the original selector remains unique after ordinary nested scrolling'));
          collect(failures, () => assert.equal(floatedSource.element.sameNode, true,
            'the original DOM node remains connected after ordinary nested scrolling'));
          collect(failures, () => assert.equal(
            sealAttempt.ok,
            false,
            'Send refuses while the comment marker is outside its nested clip',
          ));
          collect(failures, () => assert.deepEqual(
            afterSendAttempt.state.error,
            {
              code: 'review_outside_viewport',
              message: 'Keep all annotations inside the reviewed viewport before sending.',
            },
            'the native engine state retains the exact typed outside-viewport refusal',
          ));
          collect(failures, () => assert.equal(afterSendAttempt.state.editable, true,
            'an outside-clip refusal leaves the working review editable'));
          collect(failures, () => assert.equal(
            afterSendAttempt.state.annotations.length,
            1,
            'the annotation list survives the refusal',
          ));
          collect(failures, () => assert.equal(
            afterSendAttempt.state.annotations[0].id,
            annotationId,
            'the same annotation remains selected after the refusal',
          ));
          collect(failures, () => assert.equal(afterSendAttempt.state.selectedId, annotationId));
          collect(failures, () => assert.deepEqual(afterSendAttempt.state.caret, {
            id: annotationId,
            field: 'comment',
            start: 2,
            end: 7,
            direction: 'backward',
          }));
          collect(failures, () => assert.equal(afterSendAttempt.state.canUndo, true,
            'the refusal preserves edit history'));
          collect(failures, () => assert.equal(afterSendAttempt.state.canRedo, false));
          collect(failures, () => assert.deepEqual(
            filesBeforeRefusal,
            ['working.json'],
          ));
          collect(failures, () => assert.deepEqual(
            filesAfterRefusal,
            ['working.json'],
            'outside-clip refusal creates no report, PNG, provenance, or partial seal',
          ));
          collect(failures, () => assert.deepEqual(
            workingAfterRefusal,
            workingBeforeRefusal,
            'outside-clip refusal does not rewrite working state',
          ));
          collect(failures, () => assert.equal(
            savesAfterRefusal,
            savesBeforeRefusal,
            'outside-clip refusal does not make a sealing save',
          ));
          collect(failures, () => assert.equal(
            sealsAfterRefusal,
            sealsBeforeRefusal,
            'outside-clip refusal does not call the backend seal route',
          ));
          collect(failures, () => assert.equal(waiterBeforeRefusal.phase, 'pending'));
          collect(failures, () => assert.equal(
            waiterAfterRefusal.phase,
            'pending',
            'outside-clip refusal does not consume the current Needs You request',
          ));
          collect(failures, () => assert.equal(
            messages.some(message => (
              message.code === 'review_anchor_invalid'
              && message.message === 'Choose one visible, unique element. Changed anchors are not retargeted.'
            )),
            false,
            'the uniqueness warning is reserved for missing or ambiguous anchors',
          ));
          collect(failures, () => assert.equal(directSeal.response.status, 409));
          collect(failures, () => assert.deepEqual(
            directSeal.payload,
            {
              error: 'review_outside_viewport',
              message: 'Keep all annotations inside the reviewed viewport before sending.',
            },
            'the native backend independently returns the typed clipping refusal',
          ));
          collect(failures, () => assert.equal(
            directCaptureProfiles.length,
            1,
            'the direct backend attempt reaches one fresh native capture',
          ));
          collect(failures, () => profileOwnership.assertReapedSince(
            directCaptureReceipt,
            'the direct clipped capture reaps its exact process-created profile',
          ));
          collect(failures, () => assert.deepEqual(
            filesAfterDirectSeal,
            ['working.json'],
            'the native clipping refusal creates no immutable or partial evidence',
          ));
          collect(failures, () => assert.deepEqual(
            workingAfterDirectSeal,
            workingBeforeRefusal,
            'the direct backend clipping refusal leaves working bytes unchanged',
          ));
          collect(failures, () => assert.equal(
            waiterAfterDirectSeal.phase,
            'pending',
            'the direct backend clipping refusal remains non-consuming',
          ));

          // A conforming refusal keeps this exact review live. Scroll the same
          // MAIN back to its creation basis, require the same marker to return,
          // then seal and deliver exactly once through the ordinary route.
          let recovery = null;
          if (!sealAttempt.ok
            && afterSendAttempt.state.error?.code === 'review_outside_viewport'
            && directSeal.response.status === 409
            && directSeal.payload.error === 'review_outside_viewport') {
            try {
              assert.equal(await driveInnerScroll('376'), 376);
              const returnedSource = await settledAt(376);
              const returned = await until(async () => {
                const snapshot = await markerSnapshot();
                return snapshot.marker?.document.x === 661
                  && snapshot.marker?.document.y === 178
                  && !snapshot.state.stale
                  && snapshot.state.editable
                  && !snapshot.state.busy
                  ? snapshot
                  : null;
              }, 'the clipped Open marker returns at MAIN 376', 15_000);
              assert.deepEqual(returned.marker.paintedFootprint, {
                left: 648,
                top: 165,
                right: 674,
                bottom: 191,
                radius: 13,
              });
              assert.equal(
                footprintInside(returnedSource.port.ancestorClip, returned.marker.paintedFootprint),
                true,
              );
              assert.equal(returned.annotation.id, annotationId);
              assert.deepEqual(returned.state.caret, {
                id: annotationId,
                field: 'comment',
                start: 2,
                end: 7,
                direction: 'backward',
              });
              const recoveredSeal = await harness.command({ type: 'seal' }, 45_000);
              assert.equal(recoveredSeal.status, 'sealed');
              const recoveredWorking = harness.readWorking();
              const recoveredReport = fs.readFileSync(
                path.join(harness.reviewDirectory, 'report.md'),
              );
              const recoveredPng = fs.readFileSync(
                path.join(harness.reviewDirectory, 'annotated.png'),
              );
              const recoveredProvenance = JSON.parse(fs.readFileSync(
                path.join(harness.reviewDirectory, 'provenance.json'),
                'utf8',
              ));
              assert.deepEqual(
                {
                  original: {
                    x: recoveredWorking.state.annotations[0].x1,
                    y: recoveredWorking.state.annotations[0].y1,
                    basis: recoveredWorking.state.annotations[0].scrollBasis,
                  },
                  view: recoveredWorking.state.view.scrolls,
                  capture: recoveredProvenance.capture.scrolls,
                },
                {
                  original: {
                    x: 661,
                    y: 178,
                    basis: [{
                      selector: recoveredWorking.state.annotations[0].scrollBasis[0].selector,
                      scrollLeft: 0,
                      scrollTop: 376,
                    }],
                  },
                  view: [{
                    selector: recoveredWorking.state.annotations[0].scrollBasis[0].selector,
                    scrollLeft: 0,
                    scrollTop: 376,
                  }],
                  capture: [{
                    selector: recoveredWorking.state.annotations[0].scrollBasis[0].selector,
                    scrollLeft: 0,
                    scrollTop: 376,
                  }],
                },
              );
              assert.match(
                recoveredReport.toString('utf8'),
                /Geometry: at \(661, 178\)\.[\s\S]*Original annotation geometry: at \(661, 178\)\./,
              );
              const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
              const decoded = decodePng(recoveredPng);
              const stroke = recoveredWorking.state.palette.stroke.match(/[a-f0-9]{2}/gi)
                .map(value => Number.parseInt(value, 16));
              let painted = false;
              for (let y = 178 * 2 - 7; y <= 178 * 2 + 7 && !painted; y += 1) {
                for (let x = (661 + 11) * 2 - 7; x <= (661 + 11) * 2 + 7; x += 1) {
                  if (decodedPixel(decoded, x, y).slice(0, 3).every((channel, index) => (
                    Math.abs(channel - stroke[index]) <= 35
                  ))) {
                    painted = true;
                    break;
                  }
                }
              }
              assert.equal(painted, true, 'recovered capture paints the returned Open marker');
              const sealedBytes = Object.fromEntries(
                ['working.json', 'report.md', 'annotated.png', 'provenance.json'].map(name => [
                  name,
                  fs.readFileSync(path.join(harness.reviewDirectory, name)),
                ]),
              );
              const duplicateSeal = await harness.postJson('/api/needs-you/review/seal', {
                requestHandle: harness.record.requestHandle,
                revision: harness.request.revision,
                submissionId: harness.opened.submissionId,
                workingRevision: recoveredSeal.workingRevision,
              });
              assert.equal(duplicateSeal.response.status, 409);
              assert.equal(duplicateSeal.payload.error, 'review_sealed');
              for (const [name, bytes] of Object.entries(sealedBytes)) {
                assert.deepEqual(
                  fs.readFileSync(path.join(harness.reviewDirectory, name)),
                  bytes,
                  `duplicate seal leaves ${name} unchanged`,
                );
              }
              const delivered = await evaluate(harness.page, `(async () => {
                const response = await fetch('/api/needs-you/respond', {
                  method: 'POST',
                  headers: {'content-type':'application/json'},
                  body: JSON.stringify({
                    requestHandle: ${JSON.stringify(harness.record.requestHandle)},
                    revision: ${JSON.stringify(harness.request.revision)},
                    response: ${JSON.stringify(recoveredSeal.response)},
                  }),
                });
                return { status: response.status, body: await response.json() };
              })()`);
              assert.equal(delivered.status, 202);
              assert.equal(delivered.body.status, 'delivered');
              assert.equal(delivered.body.saved, false);
              assert.equal(delivered.body.applied, false);
              const duplicateDelivery = await evaluate(harness.page, `(async () => {
                const response = await fetch('/api/needs-you/respond', {
                  method: 'POST',
                  headers: {'content-type':'application/json'},
                  body: JSON.stringify({
                    requestHandle: ${JSON.stringify(harness.record.requestHandle)},
                    revision: ${JSON.stringify(harness.request.revision)},
                    response: ${JSON.stringify(recoveredSeal.response)},
                  }),
                });
                return { status: response.status, body: await response.json() };
              })()`);
              assert.equal(duplicateDelivery.status, 409);
              assert.equal(duplicateDelivery.body.error, 'already_consumed');
              assert.equal(
                harness.network.filter(({ request }) => (
                  new URL(request.url).pathname === '/api/needs-you/respond'
                )).length,
                2,
                'one accepted response and its rejected duplicate reach the provider',
              );
              const waiterAfterDelivery = harness.provider.read().requests.find(
                ({ requestHandle }) => requestHandle === harness.record.requestHandle,
              );
              assert.equal(waiterAfterDelivery.phase, 'awaiting_acknowledgment');
              recovery = {
                source: returnedSource,
                overlay: returned,
                seal: recoveredSeal,
                duplicateSeal: {
                  status: duplicateSeal.response.status,
                  error: duplicateSeal.payload.error,
                  immutableBytesUnchanged: true,
                },
                delivery: delivered,
                duplicateDelivery,
                waiterPhase: waiterAfterDelivery.phase,
                files: fs.readdirSync(harness.reviewDirectory).sort(),
                reportSha256: sha256(recoveredReport),
                image: evidence.image('open-recovered-sealed.png', recoveredPng),
                screenshot: evidence.image(
                  'open-recovered-at-inner-max.png',
                  await harness.screenshot(),
                ),
                pixelAligned: painted,
              };
            } catch (error) {
              failures.push(`scroll-back recovery: ${error.stack ?? error.message}`);
            }
          }
          collect(failures, () => assert.ok(
            recovery,
            'the same refused review scrolls back, restores its marker, and seals and delivers once',
          ));
          evidence.json('nested-anchor-regression.json', {
            case: context.name,
            expected: 'MAIN 376 -> 0 keeps the Open projection at 661,554 but hides its out-of-clip marker and refuses Send non-consumingly; MAIN 0 -> 376 restores 661,178 for one faithful seal and delivery.',
            verification: {
              command: "DUDE_CANVAS_BROWSER_REQUIRED=1 node --test --test-name-pattern='nested-scroll Open comment clips then recovers before delivery' scripts/dude-canvas-ui/browser.test.mjs",
              result: failures.length ? 'fail' : 'pass',
              passingControls: 1,
              failingRegressions: failures.length ? 1 : 0,
            },
            sourceFixture: {
              kind: 'synthetic-disposable',
              sha256: sha256(exactHarnessOptions.html),
              protectedDesignUsed: false,
            },
            productAppSha256,
            sealedAtInnerMax,
            fixture: {
              ideaPath: harness.feature.ideaPath,
              specPath: harness.feature.specPath,
              artifactPath: harness.feature.artifactPath,
              preview: harness.feature.preview,
            },
            browser: harness.browser.info.Browser,
            sourceTarget: { type: sourceTarget.type, url: sourceTarget.url },
            nativeInputProbe: {
              input: ['mouseWheel deltaY 600 on the pointer overlay', 'Home, PageDown, End on the focused pointer overlay'],
              before: initial,
              afterWheel,
              afterPageDown,
              after: afterNativeInput,
              finding: 'Native wheel and keyboard move the nested MAIN while root scroll remains zero.',
            },
            driverSetup: {
              diagnosticOnly: true,
              method: 'CDP isolated-world MAIN.scrollTo',
              reason: 'Exercise the external-scroll notification after native input establishes the stable synthetic state.',
            },
            anchored: {
              source: anchoredSource,
              element: anchoredElement,
              overlay: anchored,
              screenshot: anchoredImage,
            },
            afterInnerScrollUp: {
              source: floatedSource,
              afterExternalNotification: floatedAfterNotification,
              beforeSeal: floatedBeforeSeal,
              projectedFootprint,
              screenshot: floatingImage,
            },
            send: {
              attempt: sealAttempt,
              state: afterSendAttempt,
              files: {
                before: filesBeforeRefusal,
                after: filesAfterRefusal,
              },
              working: {
                beforeSha256: sha256(workingBeforeRefusal),
                afterSha256: sha256(workingAfterRefusal),
                unchanged: workingBeforeRefusal.equals(workingAfterRefusal),
              },
              saves: {
                before: savesBeforeRefusal,
                after: savesAfterRefusal,
              },
              seals: {
                before: sealsBeforeRefusal,
                after: sealsAfterRefusal,
              },
              waiter: {
                before: waiterBeforeRefusal.phase,
                after: waiterAfterRefusal.phase,
              },
              messages,
              screenshot: refusedImage,
              unexpectedSeal,
            },
            directBackendSeal: {
              status: directSeal.response.status,
              payload: directSeal.payload,
              captureProfiles: directCaptureProfiles,
              files: filesAfterDirectSeal,
              workingUnchanged: workingAfterDirectSeal.equals(workingBeforeRefusal),
              waiter: waiterAfterDirectSeal.phase,
            },
            recovery,
            observedFailures: failures,
          });
          assert.deepEqual(failures, [], failures.join('\n'));
        } finally {
          if (atMaxHarness) await atMaxHarness.close();
          if (harness) await harness.close();
        }
      });

test('T012 drawing admission: a clipped synthetic Open comment is rejected before history or save', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 immediate Open visibility leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-live-open-add-visibility');
        let harness;
        try {
          // Arrange: mount a stable synthetic mock in its reviewed viewport.
          // MAIN intentionally stays at zero, where Open intersects its client
          // clip but a comment at Open's ordinary point cannot fit.
          harness = await createT010ReviewHarness(context, {
            number: '756',
            slug: 'clipped-open-admission',
            html: nestedOpenFixtureHtml(),
            width: 908,
            height: 586,
            theme: 'light',
            deviceScale: 2,
            profileOwnership,
          });
          const source = await attachT010SourceFrame(harness);
          await until(
            () => source.evaluate(`(() => {
              const sentinel = document.querySelector('body > i:nth-of-type(2)');
              if (document.readyState !== 'complete' || document.fonts.status !== 'loaded'
                || !sentinel) return false;
              const rect = sentinel.getBoundingClientRect();
              const style = getComputedStyle(sentinel);
              return rect.width > 0 && rect.height > 0
                && rect.right > 0 && rect.bottom > 0
                && rect.left < innerWidth && rect.top < innerHeight
                && style.visibility === 'visible' && style.display !== 'none'
                && Number(style.opacity) !== 0;
            })()`),
            'synthetic source fonts and native focus sentinels settled',
          );
          const openTarget = await evaluate(harness.page, `window.__review.getState().targets
            .find(target => target.selector === '#open')`);
          assert.ok(openTarget, 'the synthetic MAIN 0 view exposes the actual unique Open selector');
          await source.evaluate(`(() => {
            globalThis.__t012LiveOpenNode =
              document.querySelector(${JSON.stringify(openTarget.selector)});
            globalThis.__t012LiveVisibilityQueries = [];
            addEventListener('message', event => {
              const data = event.data;
              if (data?.type === 'dude-review-query') {
                globalThis.__t012LiveVisibilityQueries.push({
                  op: data.op,
                  selector: data.selector ?? null,
                  keys: Object.keys(data).sort(),
                });
              }
            });
            return Boolean(globalThis.__t012LiveOpenNode);
          })()`);
          const sourceSnapshot = () => source.evaluate(`(() => {
            const selector = ${JSON.stringify(openTarget.selector)};
            const matches = document.querySelectorAll(selector);
            const target = matches[0];
            const rect = target.getBoundingClientRect();
            const main = [...document.querySelectorAll('main')].find(candidate => {
              const style = getComputedStyle(candidate);
              return style.overflowY === 'auto'
                && candidate.scrollHeight > candidate.clientHeight;
            });
            const portRect = main.getBoundingClientRect();
            const client = {
              left: portRect.left + main.clientLeft,
              top: portRect.top + main.clientTop,
              right: portRect.left + main.clientLeft + main.clientWidth,
              bottom: portRect.top + main.clientTop + main.clientHeight,
            };
            return {
              rootScroll: {x:scrollX,y:scrollY},
              viewport: {left:0,top:0,right:innerWidth,bottom:innerHeight},
              main: {
                scrollTop: main.scrollTop,
                maxScrollTop: main.scrollHeight - main.clientHeight,
                rect: {
                  x: portRect.x, y: portRect.y,
                  width: portRect.width, height: portRect.height,
                },
                client: {
                  left: main.clientLeft, top: main.clientTop,
                  width: main.clientWidth, height: main.clientHeight,
                },
                clip: {
                  left: Math.max(0, client.left),
                  top: Math.max(0, client.top),
                  right: Math.min(innerWidth, client.right),
                  bottom: Math.min(innerHeight, client.bottom),
                },
              },
              target: {
                selector,
                matches: matches.length,
                sameNode: target === globalThis.__t012LiveOpenNode,
                rect: {x:rect.x,y:rect.y,width:rect.width,height:rect.height},
              },
            };
          })()`);
          await harness.command({ type: 'element', selector: openTarget.selector });
          await settleBrowserWork(harness.page);
          const beforeSource = await sourceSnapshot();
          const beforeState = await evaluate(harness.page, 'window.__review.getState()');
          assert.deepEqual(beforeSource, {
            rootScroll: { x: 0, y: 0 },
            viewport: { left: 0, top: 0, right: 908, bottom: 586 },
            main: {
              scrollTop: 0,
              maxScrollTop: 376,
              rect: { x: 0, y: 111, width: 908, height: 430 },
              client: { left: 0, top: 0, width: 908, height: 430 },
              clip: { left: 0, top: 111, right: 908, bottom: 541 },
            },
            target: {
              selector: openTarget.selector,
              matches: 1,
              sameNode: true,
              rect: { x: 645, y: 539, width: 238, height: 30 },
            },
          });
          assert.equal(beforeState.annotations.length, 0);
          assert.equal(beforeState.target.selector, openTarget.selector);
          const beforeScreenshot = await harness.screenshot();
          await source.evaluate('globalThis.__t012LiveVisibilityQueries = []');

          const arrangedSave = await harness.command({ type: 'save' });
          assert.equal(arrangedSave.status, 'saved');
          assert.equal(
            await evaluate(harness.page, 'window.__review.getState().dirty'),
            false,
            'the admission control begins from a clean saved state',
          );
          const workingBefore = fs.readFileSync(path.join(
            harness.reviewDirectory,
            'working.json',
          ));
          const saveRequestsBefore = harness.network.filter(({ request }) => (
            request.method === 'POST'
              && new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;

          // Act: use the production keyboard/toolbar admission path. The
          // synthetic Open point is inside MAIN, but its 14px comment paint
          // envelope crosses MAIN's actual client clip.
          let rejection;
          try {
            await harness.command({ type: 'addComment' });
          } catch (error) {
            rejection = { message: error.message };
          }
          await settleBrowserWork(harness.page);
          const live = await evaluate(harness.page, `(() => {
            const state = window.__review.getState();
            return {
              state: {
                annotationCount: state.annotations.length,
                selectedId: state.selectedId,
                stale: state.stale,
                editable: state.editable,
                error: state.error,
                view: state.view,
                palette: state.palette,
                dirty: state.dirty,
                canUndo: state.canUndo,
                canRedo: state.canRedo,
              },
              dom: {
                groupCount: document.querySelectorAll(
                  '.dude-review-overlay [data-annotation]'
                ).length,
                pinned: document.querySelector('.dude-review-frame')
                  .classList.contains('dude-review-frame-pinned'),
              },
            };
          })()`);
          const afterSource = await sourceSnapshot();
          const queries = await source.evaluate(
            'structuredClone(globalThis.__t012LiveVisibilityQueries)',
          );
          const afterScreenshot = await harness.screenshot();
          const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
          const beforeDecoded = decodePng(beforeScreenshot);
          const afterDecoded = decodePng(afterScreenshot);
          const stroke = beforeState.palette.stroke.match(/[a-f0-9]{2}/gi)
            .map(value => Number.parseInt(value, 16));
          const nativeSample = {
            x: Math.round((661 + 11) * beforeState.view.viewport.deviceScale),
            y: Math.round(554 * beforeState.view.viewport.deviceScale),
            radius: 7,
          };
          const countNativeStroke = (decoded) => {
            let count = 0;
            for (let y = nativeSample.y - nativeSample.radius;
              y <= nativeSample.y + nativeSample.radius; y += 1) {
              for (let x = nativeSample.x - nativeSample.radius;
                x <= nativeSample.x + nativeSample.radius; x += 1) {
                if (decodedPixel(decoded, x, y).slice(0, 3).every(
                  (channel, index) => Math.abs(channel - stroke[index]) <= 35,
                )) count += 1;
              }
            }
            return count;
          };
          const nativePaint = {
            before: countNativeStroke(beforeDecoded),
            after: countNativeStroke(afterDecoded),
          };
          const saveRequestsAfter = harness.network.filter(({ request }) => (
            request.method === 'POST'
              && new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          const workingAfter = fs.readFileSync(path.join(
            harness.reviewDirectory,
            'working.json',
          ));

          // Assert: source identity and the exact candidate geometry establish
          // a real rejection boundary. No invisible record, history entry,
          // autosave, or viewport pin is admitted.
          assert.deepEqual(afterSource, beforeSource);
          assert.deepEqual(queries.map(({ op }) => op), [
            'view',
            'selector',
            'view',
            'selector',
          ], 'Add comment performs only its production refresh and selector reads');
          assert.match(
            rejection?.message ?? '',
            /Annotation not added\. Draw fully inside the visible review area, away from its edges\./,
          );
          assert.deepEqual({
            point: { x: 661, y: 554 },
            envelope: { left: 647, top: 540, right: 675, bottom: 568 },
            clip: beforeSource.main.clip,
            crossesBottom: 568 > beforeSource.main.clip.bottom,
          }, {
            point: { x: 661, y: 554 },
            envelope: { left: 647, top: 540, right: 675, bottom: 568 },
            clip: { left: 0, top: 111, right: 908, bottom: 541 },
            crossesBottom: true,
          }, 'the rejected comment paint crosses the measured MAIN client clip');
          assert.deepEqual(
            {
              annotationCount: live.state.annotationCount,
              selectedId: live.state.selectedId,
              stale: live.state.stale,
              editable: live.state.editable,
              error: live.state.error,
              dirty: live.state.dirty,
              canUndo: live.state.canUndo,
              canRedo: live.state.canRedo,
              dom: live.dom,
            },
            {
              annotationCount: 0,
              selectedId: null,
              stale: false,
              editable: true,
              error: {
                code: 'review_drawing_outside',
                message: 'Annotation not added. Draw fully inside the visible review area, away from its edges.',
              },
              dirty: false,
              canUndo: false,
              canRedo: false,
              dom: { groupCount: 0, pinned: false },
            },
            'the failed admission changes only its actionable error state',
          );
          assert.equal(nativePaint.before, 0,
            'the approved footer has no pre-existing marker-colored paint at the sample');
          const failures = [];
          collect(failures, () => assert.equal(
            nativePaint.after,
            nativePaint.before,
            'the rejected candidate adds no native marker paint outside MAIN',
          ));
          collect(failures, () => assert.equal(
            workingAfter.equals(workingBefore),
            true,
            'the rejected candidate leaves the saved working envelope byte-identical',
          ));
          collect(failures, () => assert.equal(
            saveRequestsAfter,
            saveRequestsBefore,
            'the rejected candidate schedules no working-state autosave',
          ));
          evidence.json('live-open-add-result.json', {
            case: context.name,
            expected: 'At MAIN 0 the actual Open candidate at 661,554 is rejected because its paint envelope crosses the client clip; no hidden record is retained.',
            verificationBoundary: {
              engineActionsAfterSelection: ['addComment'],
              renderWait: 'microtask plus two requestAnimationFrame callbacks',
              save: false,
              seal: false,
              remount: false,
              extraViewRefresh: false,
              nativeCapture: false,
            },
            sourceFixture: {
              kind: 'synthetic-disposable',
              sha256: sha256(nestedOpenFixtureHtml()),
              protectedDesignUsed: false,
            },
            browser: harness.browser.info.Browser,
            source: {
              before: beforeSource,
              after: afterSource,
            },
            rejection,
            live,
            sourceQueries: {
              count: queries.length,
              rows: queries,
            },
            nativePaint: {
              ...nativePaint,
              sample: nativeSample,
              stroke: live.state.palette.stroke,
              screenshot: evidence.image('live-open-add.png', afterScreenshot),
              beforeScreenshot: evidence.image('live-open-selected.png', beforeScreenshot),
            },
            persistence: {
              saveRequestsBefore,
              saveRequestsAfter,
              workingSha256Before: sha256(workingBefore),
              workingSha256After: sha256(workingAfter),
            },
            observedFailures: failures,
          });
          assert.deepEqual(failures, [], failures.join('\n'));
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 drawing admission: native edge gestures never become invisible working annotations', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 native drawing admission leaves no exact Review profile created by this test process',
        ));
        const output = createT010Evidence(context, 't012-native-drawing-admission');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;',
          'background:#edf4fa;color:#102a43}',
          '*{box-sizing:border-box}',
          'main{position:relative;width:100%;height:100%;border:0;background:#d9eaf7}',
          '#target{position:absolute;left:clamp(40px,25vw,260px);top:96px;',
          'width:min(240px,calc(100% - 80px));height:72px;border:2px solid #24557a;',
          'background:#fff;color:#102a43}',
          '</style>',
          '<main><button id="target">Visible native annotation target</button></main>',
        ].join('');
        const cases = [
          { name: 'reported-989x728-light', width: 989, height: 728, theme: 'light', detailed: true },
          { name: 'short-1000x400-light', width: 1000, height: 400, theme: 'light', detailed: false },
          { name: 'narrow-360x728-dark', width: 360, height: 728, theme: 'dark', detailed: false },
        ];
        const results = [];
        /** @type {Awaited<ReturnType<typeof createT010ReviewHarness>>|null} */
        let harness = null;
        try {
          for (const [caseIndex, scenario] of cases.entries()) {
            harness = await createT010ReviewHarness(context, {
              number: String(770 + caseIndex),
              slug: `native-admission-${scenario.name}`,
              html,
              width: scenario.width + 80,
              height: scenario.height + 80,
              theme: /** @type {'light'|'dark'} */ (scenario.theme),
              deviceScale: 2,
              profileOwnership,
            });
            const { page } = harness;
            await evaluate(page, `(() => {
              const host = document.querySelector('[data-t010-regression-host]');
              host.style.left = '39px';
              host.style.top = '39px';
              host.style.width = '${scenario.width + 2}px';
              host.style.height = '${scenario.height + 2}px';
              window.__t012AdmissionPointer = [];
              for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
                document.addEventListener(type, event => {
                  const frame = document.querySelector('.dude-review-frame')?.getBoundingClientRect();
                  if (!frame) return;
                  const overlay = event.target?.closest?.('.dude-review-overlay');
                  window.__t012AdmissionPointer.push({
                    type,
                    trusted:event.isTrusted,
                    clientX:event.clientX,
                    clientY:event.clientY,
                    localX:event.clientX - frame.left,
                    localY:event.clientY - frame.top,
                    target:overlay ? 'overlay'
                      : event.target?.closest?.('.dude-review-engine') ? 'engine' : event.target?.tagName,
                  });
                }, true);
              }
            })()`);
            await until(() => evaluate(page, `(() => {
              const state = window.__review.getState();
              const frame = document.querySelector('.dude-review-frame');
              return state.ready && !state.busy
                && state.view.viewport.width === ${scenario.width}
                && state.view.viewport.height === ${scenario.height}
                && state.view.viewport.deviceScale === 2
                && state.view.viewport.theme === ${JSON.stringify(scenario.theme)}
                && frame.clientWidth === ${scenario.width}
                && frame.clientHeight === ${scenario.height};
            })()`), `${scenario.name} exact reviewed frame`);
            const source = await attachT010SourceFrame(harness);
            await until(() => source.evaluate(`document.readyState === 'complete'
              && document.fonts.status === 'loaded'`), `${scenario.name} source ready`);
            await harness.command({ type: 'element', selector: '#target' });
            const arranged = await harness.command({ type: 'save' });
            assert.equal(arranged.status, 'saved');
            const cleanImage = await harness.screenshot();

            const frame = await evaluate(page, `(() => {
              const rect = document.querySelector('.dude-review-frame').getBoundingClientRect();
              return {
                rect:rect.toJSON(),
                clientWidth:document.documentElement.clientWidth,
                clientHeight:document.documentElement.clientHeight,
                deviceScale:devicePixelRatio,
              };
            })()`);
            assert.deepEqual(
              {
                left: frame.rect.left,
                top: frame.rect.top,
                width: frame.rect.width,
                height: frame.rect.height,
                deviceScale: frame.deviceScale,
              },
              {
                left: 40,
                top: 40,
                width: scenario.width,
                height: scenario.height,
                deviceScale: 2,
              },
              `${scenario.name} uses the measured iframe boundary rather than the outer browser edge`,
            );
            const target = await source.evaluate(`(() => {
              const rect = document.querySelector('#target').getBoundingClientRect();
              return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
            })()`);
            const point = (local) => ({
              x: frame.rect.left + local.x,
              y: frame.rect.top + local.y,
            });
            const gesture = async (start, end, shift = false) => {
              const from = point(start);
              const to = point(end);
              const pointerStart = await evaluate(page, 'window.__t012AdmissionPointer.length');
              await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
              await page.send('Input.dispatchMouseEvent', {
                type: 'mousePressed',
                ...from,
                button: 'left',
                buttons: 1,
                clickCount: 1,
                ...(shift ? { modifiers: 8 } : {}),
              });
              await page.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                ...to,
                button: 'left',
                buttons: 1,
                ...(shift ? { modifiers: 8 } : {}),
              });
              await page.send('Input.dispatchMouseEvent', {
                type: 'mouseReleased',
                ...to,
                button: 'left',
                buttons: 0,
                clickCount: 1,
                ...(shift ? { modifiers: 8 } : {}),
              });
              await until(() => evaluate(page, '!window.__review.getState().busy'),
                `${scenario.name} pointer gesture settled`);
              return evaluate(page, `window.__t012AdmissionPointer.slice(${pointerStart})`);
            };
            const state = () => evaluate(page, 'window.__review.getState()');
            const saveRequests = () => harness.network.filter(({ request }) => (
              request.method === 'POST'
                && new URL(request.url).pathname === '/api/needs-you/review/save'
            )).length;
            const markerSnapshot = () => evaluate(page, `(() => {
              const state = window.__review.getState();
              const frame = document.querySelector('.dude-review-frame').getBoundingClientRect();
              const groups = [...document.querySelectorAll(
                '.dude-review-overlay [data-annotation]'
              )];
              return {
                hiddenIds:state.hiddenIds,
                pinned:document.querySelector('.dude-review-frame')
                  .classList.contains('dude-review-frame-pinned'),
                frame:frame.toJSON(),
                groups:groups.map(group => ({
                  id:group.getAttribute('data-annotation'),
                  children:[...group.children].map(node => {
                    const rect = node.getBoundingClientRect();
                    return {
                      tag:node.tagName.toLowerCase(),
                      left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,
                    };
                  }),
                })),
              };
            })()`);

            // Arrange visible controls through the same production pointer and
            // keyboard-command entry points that edge candidates use.
            await harness.command({ type: 'tool', tool: 'comment' });
            const commentPoint = {
              x: target.x + Math.min(16, target.width / 2),
              y: target.y + Math.min(16, target.height / 2),
            };
            await gesture(commentPoint, commentPoint);
            const commentState = await until(async () => {
              const current = await state();
              return current.annotations.length === 1 ? current : null;
            }, `${scenario.name} ordinary native comment`);
            const commentId = commentState.annotations[0].id;
            await harness.command({
              type: 'edit',
              id: commentId,
              changes: { comment: `Visible ${scenario.name} comment.` },
            });

            let arrowId = null;
            let reverseBoxId = null;
            if (scenario.detailed) {
              await harness.command({ type: 'tool', tool: 'arrow' });
              const head = { x: 862.2890625, y: 25.80859375 };
              const tail = { x: 758.41015625, y: 136.0625 };
              await gesture(head, tail);
              const arrowState = await until(async () => {
                const current = await state();
                return current.annotations.length === 2 ? current : null;
              }, 'ordinary native ZoomIt arrow');
              const arrow = arrowState.annotations.at(-1);
              arrowId = arrow.id;
              assert.deepEqual(
                { x1: arrow.x1, y1: arrow.y1, x2: arrow.x2, y2: arrow.y2 },
                { x1: tail.x, y1: tail.y, x2: head.x, y2: head.y },
                'the ordinary arrow renders and commits with its press point at endpoint two',
              );
              await harness.command({ type: 'tool', tool: 'box' });
              await gesture({ x: 500, y: 300 }, { x: 400, y: 200 }, true);
              const boxState = await until(async () => {
                const current = await state();
                return current.annotations.length === 3 ? current : null;
              }, 'reverse Shift-drag box');
              const box = boxState.annotations.at(-1);
              reverseBoxId = box.id;
              assert.deepEqual(
                { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 },
                { x1: 500, y1: 300, x2: 400, y2: 200 },
                'reverse Shift-drag preserves its stored direction while producing a square bound',
              );
            } else {
              await harness.command({ type: 'tool', tool: 'box' });
              const boxId = await harness.command({ type: 'addAtCenter' });
              assert.ok(boxId, `${scenario.name} keyboard Add at center remains admitted`);
            }
            await harness.command({ type: 'select', id: commentId });
            await harness.command({
              type: 'caret',
              caret: { id: commentId, field: 'comment', start: 1, end: 7, direction: 'backward' },
            });
            await harness.command({ type: 'tool', tool: 'arrow' });
            const baselineSave = await harness.command({ type: 'save' });
            assert.equal(baselineSave.status, 'saved');
            const baseline = await state();
            const baselineWorking = fs.readFileSync(path.join(
              harness.reviewDirectory,
              'working.json',
            ));
            const baselineMarkers = await markerSnapshot();
            assert.equal(baseline.hiddenIds.length, 0);
            assert.equal(baselineMarkers.pinned, true);
            assert.equal(baselineMarkers.groups.length, baseline.annotations.length);
            const paintEnvelope = (annotation) => {
              const pad = annotation.tool === 'comment' ? 14
                : annotation.tool === 'arrow' ? 11 : 2;
              return {
                left: Math.min(annotation.x1, annotation.x2) - pad,
                top: Math.min(annotation.y1, annotation.y2) - pad,
                right: Math.max(annotation.x1, annotation.x2) + pad,
                bottom: Math.max(annotation.y1, annotation.y2) + pad,
              };
            };
            for (const annotation of baseline.annotations) {
              const envelope = paintEnvelope(annotation);
              assert.equal(
                envelope.left >= 0 && envelope.top >= 0
                  && envelope.right <= scenario.width
                  && envelope.bottom <= scenario.height,
                true,
                `${scenario.name} committed ${annotation.tool} paint envelope is fully contained`,
              );
            }
            const childRects = baselineMarkers.groups.flatMap(group => group.children);
            assert.ok(childRects.length >= baseline.annotations.length * 2,
              `${scenario.name} containment checks real rendered shape and number nodes`);
            for (const rect of childRects) {
              assert.equal(
                rect.left >= frame.rect.left - 1 && rect.top >= frame.rect.top - 1
                  && rect.right <= frame.rect.right + 1 && rect.bottom <= frame.rect.bottom + 1,
                true,
                `${scenario.name} rendered ${rect.tag} stays inside the actual frame`,
              );
            }

            const rejectionResults = [];
            const assertRejected = async (name, tool, start, end, shift = false) => {
              await harness.command({ type: 'tool', tool });
              await harness.command({ type: 'select', id: commentId });
              await harness.command({
                type: 'caret',
                caret: { id: commentId, field: 'comment', start: 1, end: 7, direction: 'backward' },
              });
              await harness.command({ type: 'save' });
              const before = await state();
              const bytesBefore = fs.readFileSync(path.join(
                harness.reviewDirectory,
                'working.json',
              ));
              const savesBefore = saveRequests();
              const pointer = await gesture(start, end, shift);
              await until(() => evaluate(page, `window.__review.getState().error?.code
                === 'review_drawing_outside'`), `${name} actionable admission error`);
              const after = await state();
              const afterMarkers = await markerSnapshot();
              const messages = await evaluate(page, 'window.__reviewMessages.slice()');
              const bytesAfter = fs.readFileSync(path.join(
                harness.reviewDirectory,
                'working.json',
              ));
              assert.deepEqual(after.annotations, before.annotations,
                `${name} leaves every existing annotation and source basis unchanged`);
              assert.equal(after.selectedId, before.selectedId, `${name} preserves selection`);
              assert.deepEqual(after.caret, before.caret, `${name} preserves the backward caret`);
              assert.deepEqual(after.view, before.view, `${name} preserves the source viewport and signature`);
              assert.equal(after.workingRevision, before.workingRevision,
                `${name} leaves the saved revision unchanged`);
              assert.equal(after.dirty, false, `${name} leaves no autosave work`);
              assert.equal(after.canUndo, before.canUndo, `${name} adds no undo history`);
              assert.equal(after.canRedo, before.canRedo, `${name} adds no redo history`);
              assert.equal(afterMarkers.pinned, true, `${name} does not change the existing viewport pin`);
              assert.deepEqual(afterMarkers.frame, baselineMarkers.frame,
                `${name} does not resize or pan the actual reviewed frame`);
              assert.deepEqual(after.hiddenIds, [],
                `${name} cannot manufacture a hidden annotation`);
              assert.equal(afterMarkers.groups.length, before.annotations.length,
                `${name} paints every existing mark and no candidate`);
              assert.equal(saveRequests(), savesBefore, `${name} issues no save request`);
              assert.equal(bytesAfter.equals(bytesBefore), true,
                `${name} leaves persisted working bytes unchanged`);
              assert.deepEqual(after.error, {
                code: 'review_drawing_outside',
                message: 'Annotation not added. Draw fully inside the visible review area, away from its edges.',
              });
              assert.ok(messages.some(message => (
                message.error
                  && message.code === 'review_drawing_outside'
                  && /Annotation not added/.test(message.message)
              )), `${name} reports an actionable user message`);
              rejectionResults.push({ name, tool, start, end, shift, pointer, error: after.error });
            };

            if (scenario.detailed) {
              const rawBefore = await state();
              const rawBytes = fs.readFileSync(path.join(
                harness.reviewDirectory,
                'working.json',
              ));
              const rawSaves = saveRequests();
              const rawPointer = await gesture(
                { x: 861.41796875, y: -0.5 },
                { x: 767.73046875, y: 146.484375 },
              );
              const rawAfter = await state();
              assert.deepEqual(rawAfter.annotations, rawBefore.annotations);
              assert.equal(rawAfter.selectedId, rawBefore.selectedId);
              assert.deepEqual(rawAfter.caret, rawBefore.caret);
              assert.deepEqual(rawAfter.view, rawBefore.view);
              assert.equal(rawAfter.workingRevision, rawBefore.workingRevision);
              assert.equal(rawAfter.dirty, false);
              assert.equal(saveRequests(), rawSaves);
              assert.equal(fs.readFileSync(path.join(
                harness.reviewDirectory,
                'working.json',
              )).equals(rawBytes), true);
              const rawDown = rawPointer.find(event => event.type === 'pointerdown');
              assert.ok(rawDown && rawDown.target !== 'overlay' && rawDown.localY === -0.5,
                'the raw outside press lands outside the actual iframe and never begins an overlay drag');
              await assertRejected(
                'reported arrowhead at 5.80859375',
                'arrow',
                { x: 862.2890625, y: 5.80859375 },
                { x: 758.41015625, y: 136.0625 },
              );
              await assertRejected(
                'reported arrowhead at zero',
                'arrow',
                { x: 861.41796875, y: 0 },
                { x: 767.73046875, y: 146.484375 },
              );
              await assertRejected(
                'reported box top at 1.69921875',
                'box',
                { x: 899.10546875, y: 1.69921875 },
                { x: 487, y: 354.87109375 },
              );
              await assertRejected(
                'captured release outside the frame',
                'arrow',
                { x: 800, y: 30 },
                { x: 810, y: -40 },
              );
              await assertRejected(
                'edge comment at 5.80859375',
                'comment',
                { x: 400, y: 5.80859375 },
                { x: 400, y: 5.80859375 },
              );
              const afterUndo = await harness.command({ type: 'undo' });
              assert.equal(
                afterUndo.annotations.some(annotation => annotation.id === reverseBoxId),
                false,
                'the first undo reaches the latest valid reverse box, not a rejected candidate',
              );
              assert.equal(
                afterUndo.annotations.some(annotation => annotation.id === arrowId),
                true,
                'the earlier ordinary ZoomIt arrow remains after one undo',
              );
              const afterRedo = await harness.command({ type: 'redo' });
              assert.deepEqual(afterRedo.annotations, baseline.annotations,
                'redo restores the exact valid baseline after all rejected gestures');
            } else {
              await assertRejected(
                `${scenario.name} edge comment`,
                'comment',
                { x: Math.round(scenario.width * 0.55), y: 5 },
                { x: Math.round(scenario.width * 0.55), y: 5 },
              );
            }

            const markedImage = await harness.screenshot();
            let strokeContainment = null;
            if (scenario.detailed) {
              const [{ decodePng }, finalState] = await Promise.all([
                import('../../src/extensions/dude/lib/review/png.mjs'),
                state(),
              ]);
              const clean = decodePng(cleanImage);
              const marked = decodePng(markedImage);
              const stroke = finalState.palette.stroke.match(/[a-f0-9]{2}/gi)
                .map(value => Number.parseInt(value, 16));
              const scaleX = marked.width / frame.clientWidth;
              const scaleY = marked.height / frame.clientHeight;
              let addedInside = 0;
              let addedOutside = 0;
              for (let y = 0; y < marked.height; y += 1) {
                for (let x = 0; x < marked.width; x += 1) {
                  const offset = (y * marked.width + x) * 4;
                  const afterMatches = stroke.every((value, channel) => (
                    Math.abs(marked.pixels[offset + channel] - value) <= 35
                  ));
                  const beforeMatches = stroke.every((value, channel) => (
                    Math.abs(clean.pixels[offset + channel] - value) <= 35
                  ));
                  if (!afterMatches || beforeMatches) continue;
                  const cssX = x / scaleX;
                  const cssY = y / scaleY;
                  if (cssX >= frame.rect.left && cssX < frame.rect.right
                    && cssY >= frame.rect.top && cssY < frame.rect.bottom) addedInside += 1;
                  else addedOutside += 1;
                }
              }
              strokeContainment = { addedInside, addedOutside };
              assert.ok(addedInside > 100,
                'ordinary marks add a non-vacuous set of native stroke-colored pixels');
              assert.equal(addedOutside, 0,
                'native stroke-colored pixels added by ordinary marks stay inside the actual frame');
            }
            results.push({
              scenario,
              browser: harness.browser.info.Browser,
              frame,
              target,
              annotations: baseline.annotations.map(annotation => ({
                id: annotation.id,
                tool: annotation.tool,
                envelope: paintEnvelope(annotation),
              })),
              rejectionResults,
              strokeContainment,
              workingSha256: sha256(baselineWorking),
              screenshot: output.image(`${scenario.name}.png`, markedImage),
            });
            await harness.close();
            harness = null;
          }
          output.json('native-drawing-admission.json', {
            case: context.name,
            productionCreationPaths: {
              nativeCommentPick: 'ordinary and edge candidate',
              nativeShapeDrag: 'arrow, reverse Shift-box, and captured outside release',
              keyboardAddComment: 'covered by the adjacent synthetic Open admission regression',
              keyboardAddAtCenter: 'ordinary compact controls in this test',
            },
            results,
          });
          assert.equal(results.length, 3, 'the bounded native matrix executes each requested viewport once');
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 actual selector visibility: #inside edits and history immediately follow the client clip', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 edit-history visibility leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-live-edit-history-visibility');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;background:#edf4fa;color:#102a43}',
          '*{box-sizing:border-box}',
          '#fieldclip{position:absolute;left:40px;top:50px;width:320px;height:220px;',
          'border:5px solid #24557a;overflow:scroll;scrollbar-gutter:stable;background:#d9eaf7}',
          '#fieldclip::-webkit-scrollbar{width:16px;height:16px}',
          '#fieldclip::-webkit-scrollbar-track{background:#c9dfef}',
          '#fieldclip::-webkit-scrollbar-thumb{background:#24557a}',
          '#content{position:relative;width:500px;height:500px}',
          '#inside,#edge{position:absolute;width:120px;height:90px}',
          '#inside{left:20px;top:160px}',
          '#edge{left:160px;top:174px}',
          '</style>',
          '<main id="fieldclip"><div id="content">',
          '<button id="inside">Partial field, marker inside</button>',
          '<button id="edge">Partial field, marker edge</button>',
          '</div></main>',
        ].join('');
        let harness;
        try {
          // Arrange: create one real anchored comment whose complete marker
          // footprint fits the existing field-clip fixture, then establish that
          // baseline once before isolating edit/history renders.
          harness = await createT010ReviewHarness(context, {
            number: '762',
            slug: 'live-edit-history-visibility',
            html,
            width: 480,
            height: 360,
            theme: 'light',
            profileOwnership,
          });
          const source = await attachT010SourceFrame(harness);
          await source.evaluate(`(() => {
            globalThis.__t012EditTarget = document.querySelector('#inside');
            globalThis.__t012EditVisibilityQueries = [];
            addEventListener('message', event => {
              const data = event.data;
              if (data?.type === 'dude-review-query') {
                globalThis.__t012EditVisibilityQueries.push({
                  op: data.op,
                  selector: data.selector ?? null,
                  keys: Object.keys(data).sort(),
                });
              }
            });
            return Boolean(globalThis.__t012EditTarget);
          })()`);
          const sourceSnapshot = () => source.evaluate(`(() => {
            const port = document.querySelector('#fieldclip');
            const target = document.querySelector('#inside');
            const portRect = port.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const client = {
              left: portRect.left + port.clientLeft,
              top: portRect.top + port.clientTop,
              right: portRect.left + port.clientLeft + port.clientWidth,
              bottom: portRect.top + port.clientTop + port.clientHeight,
            };
            return {
              selector: '#inside',
              matches: document.querySelectorAll('#inside').length,
              sameNode: target === globalThis.__t012EditTarget,
              port: {
                scrollLeft: port.scrollLeft,
                scrollTop: port.scrollTop,
                clip: {
                  left: Math.max(0, client.left),
                  top: Math.max(0, client.top),
                  right: Math.min(innerWidth, client.right),
                  bottom: Math.min(innerHeight, client.bottom),
                },
              },
              targetRect: {
                x: targetRect.x, y: targetRect.y,
                width: targetRect.width, height: targetRect.height,
              },
            };
          })()`);
          await harness.command({ type: 'element', selector: '#inside' });
          const annotationId = await harness.command({ type: 'addComment' });
          await harness.command({ type: 'scroll', x: 0, y: 0 });
          await settleBrowserWork(harness.page);
          const baselineSave = await harness.command({ type: 'save' });
          assert.equal(baselineSave.status, 'saved');
          const baselineWorking = harness.readWorking();
          const baselineRecord = baselineWorking.state.annotations.find(
            ({ id }) => id === annotationId,
          );
          const readLive = async () => {
            await settleBrowserWork(harness.page);
            return evaluate(harness.page, `(() => {
              const state = window.__review.getState();
              const annotation = state.annotations.find(
                entry => entry.id === ${JSON.stringify(annotationId)}
              );
              const groups = [...document.querySelectorAll(
                '[data-annotation="${annotationId}"]'
              )];
              const circles = groups.flatMap(group => [...group.querySelectorAll('circle')]);
              const circle = circles[0];
              return {
                annotation,
                annotationCount: state.annotations.length,
                selectedId: state.selectedId,
                stale: state.stale,
                editable: state.editable,
                error: state.error,
                canUndo: state.canUndo,
                canRedo: state.canRedo,
                dom: {
                  groupCount: groups.length,
                  circleCount: circles.length,
                  point: circle ? {
                    x: Number(circle.getAttribute('cx')),
                    y: Number(circle.getAttribute('cy')),
                  } : null,
                },
              };
            })()`);
          };
          const baselineSource = await sourceSnapshot();
          const baseline = await readLive();
          assert.deepEqual(baselineSource, {
            selector: '#inside',
            matches: 1,
            sameNode: true,
            port: {
              scrollLeft: 0,
              scrollTop: 0,
              clip: { left: 45, top: 55, right: 339, bottom: 249 },
            },
            targetRect: { x: 65, y: 215, width: 120, height: 90 },
          });
          assert.deepEqual(
            {
              point: { x: baselineRecord.x1, y: baselineRecord.y1 },
              selector: baselineRecord.element.selector,
              scrollBasis: baselineRecord.scrollBasis,
              dom: baseline.dom,
            },
            {
              point: { x: 81, y: 231 },
              selector: '#inside',
              scrollBasis: [{
                selector: '#fieldclip',
                scrollLeft: 0,
                scrollTop: 0,
              }],
              dom: {
                groupCount: 1,
                circleCount: 1,
                point: { x: 81, y: 231 },
              },
            },
            'the existing #inside marker begins fully inside the native client clip',
          );
          await source.evaluate('globalThis.__t012EditVisibilityQueries = []');

          // Act: cross the bottom clip with a numeric edit, return inside, then
          // traverse the same two edit entries in both history directions.
          // Each snapshot is the immediate normal render with no view command.
          await harness.command({
            type: 'edit',
            id: annotationId,
            changes: { x1: 81, y1: 240, x2: 81, y2: 240 },
          });
          const editedOutside = await readLive();
          const outsideScreenshot = await harness.screenshot();
          await harness.command({
            type: 'edit',
            id: annotationId,
            changes: { x1: 81, y1: 230, x2: 81, y2: 230 },
          });
          const editedInside = await readLive();
          await harness.command({ type: 'undo' });
          const undoOutside = await readLive();
          await harness.command({ type: 'undo' });
          const undoBaseline = await readLive();
          await harness.command({ type: 'redo' });
          const redoOutside = await readLive();
          await harness.command({ type: 'redo' });
          const redoInside = await readLive();
          const finalSave = await harness.command({ type: 'save' });
          assert.equal(finalSave.status, 'saved');
          const finalWorking = harness.readWorking();
          const finalRecord = finalWorking.state.annotations.find(
            ({ id }) => id === annotationId,
          );
          const finalSource = await sourceSnapshot();
          const mutationQueries = await source.evaluate(
            'structuredClone(globalThis.__t012EditVisibilityQueries)',
          );

          // Assert the fixed geometry boundary independently of render state.
          const envelope = (snapshot) => ({
            left: snapshot.annotation.x1 - 14,
            top: snapshot.annotation.y1 - 14,
            right: snapshot.annotation.x1 + 14,
            bottom: snapshot.annotation.y1 + 14,
          });
          assert.deepEqual(envelope(baseline), {
            left: 67, top: 217, right: 95, bottom: 245,
          });
          assert.deepEqual(envelope(editedOutside), {
            left: 67, top: 226, right: 95, bottom: 254,
          });
          assert.deepEqual(envelope(editedInside), {
            left: 67, top: 216, right: 95, bottom: 244,
          });
          assert.equal(
            envelope(editedOutside).bottom > baselineSource.port.clip.bottom,
            true,
            'the numeric edit crosses the actual #fieldclip client edge',
          );
          assert.deepEqual(finalSource, baselineSource,
            'numeric edits and history do not change source identity or geometry');
          assert.deepEqual(mutationQueries, [],
            'the edit/history observation issues no engine view or selector refresh');
          const semantics = (annotation) => {
            const { x1, y1, x2, y2, ...rest } = annotation;
            return rest;
          };
          for (const snapshot of [
            baseline,
            editedOutside,
            editedInside,
            undoOutside,
            undoBaseline,
            redoOutside,
            redoInside,
          ]) {
            assert.equal(snapshot.annotation.id, annotationId);
            assert.equal(snapshot.annotationCount, 1);
            assert.equal(snapshot.selectedId, annotationId);
            assert.equal(snapshot.stale, false);
            assert.equal(snapshot.editable, true);
            assert.deepEqual(semantics(snapshot.annotation), semantics(baseline.annotation));
          }
          assert.deepEqual(
            [
              editedOutside,
              editedInside,
              undoOutside,
              undoBaseline,
              redoOutside,
              redoInside,
            ].map(snapshot => ({
              y: snapshot.annotation.y1,
              canUndo: snapshot.canUndo,
              canRedo: snapshot.canRedo,
            })),
            [
              { y: 240, canUndo: true, canRedo: false },
              { y: 230, canUndo: true, canRedo: false },
              { y: 240, canUndo: true, canRedo: true },
              { y: 231, canUndo: true, canRedo: true },
              { y: 240, canUndo: true, canRedo: true },
              { y: 230, canUndo: true, canRedo: false },
            ],
            'undo and redo traverse exactly the two intended coordinate edits',
          );
          assert.deepEqual(
            finalWorking.state,
            {
              ...baselineWorking.state,
              annotations: [{
                ...baselineRecord,
                x1: 81,
                y1: 230,
                x2: 81,
                y2: 230,
              }],
            },
            'persistence changes only the intended final coordinates',
          );

          const failures = [];
          const expectMarker = (snapshot, expected, label) => collect(
            failures,
            () => assert.deepEqual(snapshot.dom, expected, label),
          );
          const hidden = { groupCount: 0, circleCount: 0, point: null };
          const inside230 = {
            groupCount: 1,
            circleCount: 1,
            point: { x: 81, y: 230 },
          };
          const inside231 = {
            groupCount: 1,
            circleCount: 1,
            point: { x: 81, y: 231 },
          };
          expectMarker(
            editedOutside,
            hidden,
            'the outside numeric edit is hidden on its immediate render',
          );
          expectMarker(
            editedInside,
            inside230,
            'the inside numeric edit is visible on its immediate render',
          );
          expectMarker(
            undoOutside,
            hidden,
            'undo uses its outside geometry rather than the prior visibility set',
          );
          expectMarker(
            undoBaseline,
            inside231,
            'the second undo restores the visible baseline geometry',
          );
          expectMarker(
            redoOutside,
            hidden,
            'redo uses its outside geometry rather than the prior visibility set',
          );
          expectMarker(
            redoInside,
            inside230,
            'the second redo restores the visible edited geometry',
          );
          evidence.json('live-edit-history-result.json', {
            case: context.name,
            expected: 'The same #inside annotation hides and returns synchronously as numeric edit and history geometry crosses its native client clip.',
            verificationBoundary: {
              selector: '#inside',
              mutationActions: ['edit outside', 'edit inside', 'undo', 'undo', 'redo', 'redo'],
              viewOrSelectorQueriesDuringMutations: mutationQueries.length,
              seal: false,
              remount: false,
            },
            browser: harness.browser.info.Browser,
            source: {
              baseline: baselineSource,
              final: finalSource,
            },
            annotationId,
            baseline,
            editedOutside,
            editedInside,
            undoOutside,
            undoBaseline,
            redoOutside,
            redoInside,
            persisted: finalRecord,
            history: {
              intendedEditEntries: 2,
              traversedY: [240, 230, 240, 231, 240, 230],
            },
            sourceQueries: {
              count: mutationQueries.length,
              rows: mutationQueries,
            },
            screenshot: evidence.image('live-edit-outside.png', outsideScreenshot),
            observedFailures: failures,
          });
          assert.deepEqual(failures, [], failures.join('\n'));
        } finally {
          if (harness) await harness.close();
        }
      });

const t012LiveFieldClipHtml = () => [
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
        '<style>',
        'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;background:#edf4fa;color:#102a43}',
        '*{box-sizing:border-box}',
        '#fieldclip{position:absolute;left:40px;top:50px;width:320px;height:220px;',
        'border:5px solid #24557a;overflow:scroll;scrollbar-gutter:stable;background:#d9eaf7}',
        '#fieldclip::-webkit-scrollbar{width:16px;height:16px}',
        '#fieldclip::-webkit-scrollbar-track{background:#c9dfef}',
        '#fieldclip::-webkit-scrollbar-thumb{background:#24557a}',
        '#content{position:relative;width:500px;height:500px}',
        '#inside,#edge{position:absolute;width:120px;height:90px}',
        '#inside{left:20px;top:160px}',
        '#edge{left:160px;top:174px}',
        '</style>',
        '<main id="fieldclip"><div id="content">',
        '<button id="inside">Partial field, marker inside</button>',
        '<button id="edge">Partial field, marker edge</button>',
        '</div></main>',
      ].join('');

test('T012 actual selector visibility: pointer preview follows #fieldclip while capture is held', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 pointer-preview visibility leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-live-pointer-preview-visibility');
        let harness;
        try {
          // Arrange: retain the same #fieldclip geometry and native clip used
          // by the numeric edit/history control, with one committed marker at
          // 81,231 whose complete footprint ends four pixels above the clip.
          harness = await createT010ReviewHarness(context, {
            number: '763',
            slug: 'live-pointer-preview-visibility',
            html: t012LiveFieldClipHtml(),
            width: 480,
            height: 360,
            theme: 'light',
            profileOwnership,
          });
          const source = await attachT010SourceFrame(harness);
          await harness.command({ type: 'element', selector: '#inside' });
          const annotationId = await harness.command({ type: 'addComment' });
          const baselineSave = await harness.command({ type: 'save' });
          assert.equal(baselineSave.status, 'saved');
          const baselineWorking = harness.readWorking();
          await source.evaluate(`(() => {
            globalThis.__t012PointerQueries = [];
            addEventListener('message', event => {
              const data = event.data;
              if (data?.type === 'dude-review-query') {
                globalThis.__t012PointerQueries.push({
                  id: data.id,
                  op: data.op,
                  selector: data.selector ?? null,
                });
              }
            });
          })()`);
          await evaluate(harness.page, `(() => {
            const overlay = document.querySelector('.dude-review-overlay');
            globalThis.__t012PointerCapture = {
              pointerId: null,
              downHeld: false,
              got: 0,
              lost: 0,
            };
            overlay.addEventListener('pointerdown', event => {
              globalThis.__t012PointerCapture.pointerId = event.pointerId;
              globalThis.__t012PointerCapture.downHeld =
                overlay.hasPointerCapture(event.pointerId);
            });
            overlay.addEventListener('gotpointercapture', () => {
              globalThis.__t012PointerCapture.got += 1;
            });
            overlay.addEventListener('lostpointercapture', () => {
              globalThis.__t012PointerCapture.lost += 1;
            });
          })()`);
          const snapshot = () => evaluate(harness.page, `(() => {
            const state = window.__review.getState();
            const annotation = state.annotations.find(
              entry => entry.id === ${JSON.stringify(annotationId)}
            );
            const group = document.querySelector(
              '[data-annotation="${annotationId}"]'
            );
            const circle = group?.querySelector('circle');
            const rect = circle?.getBoundingClientRect();
            const overlay = document.querySelector('.dude-review-overlay');
            const capture = globalThis.__t012PointerCapture;
            return {
              annotation,
              state: {
                annotationCount: state.annotations.length,
                selectedId: state.selectedId,
                stale: state.stale,
                editable: state.editable,
                error: state.error,
                busy: state.busy,
                dirty: state.dirty,
                canUndo: state.canUndo,
                canRedo: state.canRedo,
              },
              dom: {
                groupCount: group ? 1 : 0,
                circleCount: circle ? 1 : 0,
                point: circle ? {
                  x: Number(circle.getAttribute('cx')),
                  y: Number(circle.getAttribute('cy')),
                } : null,
                screen: circle ? {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                } : null,
              },
              capture: {
                pointerId: capture.pointerId,
                downHeld: capture.downHeld,
                held: capture.pointerId !== null
                  && overlay.hasPointerCapture(capture.pointerId),
                got: capture.got,
                lost: capture.lost,
              },
            };
          })()`);
          const baseline = await snapshot();
          assert.deepEqual(
            {
              point: {
                x: baseline.annotation.x1,
                y: baseline.annotation.y1,
              },
              scrollBasis: baseline.annotation.scrollBasis,
              dom: {
                groupCount: baseline.dom.groupCount,
                circleCount: baseline.dom.circleCount,
                point: baseline.dom.point,
              },
              history: {
                dirty: baseline.state.dirty,
                canUndo: baseline.state.canUndo,
                canRedo: baseline.state.canRedo,
              },
            },
            {
              point: { x: 81, y: 231 },
              scrollBasis: [{
                selector: '#fieldclip',
                scrollLeft: 0,
                scrollTop: 0,
              }],
              dom: {
                groupCount: 1,
                circleCount: 1,
                point: { x: 81, y: 231 },
              },
              history: {
                dirty: false,
                canUndo: true,
                canRedo: false,
              },
            },
          );
          await source.evaluate('globalThis.__t012PointerQueries = []');

          // Act: keep the native primary pointer down while its preview crosses
          // the current client clip, returns inside, and is then cancelled.
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: baseline.dom.screen.x,
            y: baseline.dom.screen.y,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: baseline.dom.screen.x,
            y: baseline.dom.screen.y + 10,
            button: 'left',
            buttons: 1,
          });
          await settleBrowserWork(harness.page);
          const outside = await snapshot();
          const outsideScreenshot = await harness.screenshot();
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: baseline.dom.screen.x,
            y: baseline.dom.screen.y - 1,
            button: 'left',
            buttons: 1,
          });
          await settleBrowserWork(harness.page);
          const returned = await snapshot();
          await key(harness.page, 'Escape', 'Escape');
          const cancelledBeforeRelease = await snapshot();
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: baseline.dom.screen.x,
            y: baseline.dom.screen.y - 1,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          });
          await settleBrowserWork(harness.page);
          const cancelled = await snapshot();

          // Assert: visibility is derived from each preview's current geometry,
          // not a retained hidden set. Escape restores the committed record,
          // releases capture, and creates no history entry or native query.
          assert.deepEqual(
            {
              point: { x: outside.annotation.x1, y: outside.annotation.y1 },
              dom: {
                groupCount: outside.dom.groupCount,
                circleCount: outside.dom.circleCount,
                point: outside.dom.point,
              },
              captureHeld: outside.capture.held,
              busy: outside.state.busy,
              dirty: outside.state.dirty,
            },
            {
              point: { x: 81, y: 241 },
              dom: { groupCount: 0, circleCount: 0, point: null },
              captureHeld: true,
              busy: true,
              dirty: false,
            },
            'the captured pointer preview hides as its marker footprint crosses the native clip',
          );
          assert.deepEqual(
            {
              point: { x: returned.annotation.x1, y: returned.annotation.y1 },
              dom: {
                groupCount: returned.dom.groupCount,
                circleCount: returned.dom.circleCount,
                point: returned.dom.point,
              },
              captureHeld: returned.capture.held,
              busy: returned.state.busy,
              dirty: returned.state.dirty,
            },
            {
              point: { x: 81, y: 230 },
              dom: {
                groupCount: 1,
                circleCount: 1,
                point: { x: 81, y: 230 },
              },
              captureHeld: true,
              busy: true,
              dirty: false,
            },
            'the same held pointer becomes visible again when its preview returns inside',
          );
          assert.deepEqual(cancelledBeforeRelease.annotation, baseline.annotation);
          assert.deepEqual(cancelledBeforeRelease.dom.point, { x: 81, y: 231 });
          assert.equal(cancelledBeforeRelease.capture.held, false);
          assert.deepEqual(
            {
              annotation: cancelled.annotation,
              annotationCount: cancelled.state.annotationCount,
              selectedId: cancelled.state.selectedId,
              stale: cancelled.state.stale,
              editable: cancelled.state.editable,
              error: cancelled.state.error,
              busy: cancelled.state.busy,
              dirty: cancelled.state.dirty,
              canUndo: cancelled.state.canUndo,
              canRedo: cancelled.state.canRedo,
              capture: cancelled.capture,
            },
            {
              annotation: baseline.annotation,
              annotationCount: 1,
              selectedId: annotationId,
              stale: false,
              editable: true,
              error: null,
              busy: false,
              dirty: false,
              canUndo: true,
              canRedo: false,
              capture: {
                pointerId: cancelled.capture.pointerId,
                downHeld: true,
                held: false,
                got: 1,
                lost: 1,
              },
            },
          );
          assert.deepEqual(harness.readWorking().state, baselineWorking.state,
            'the cancelled preview leaves the persisted working state untouched');
          const afterUndo = await harness.command({ type: 'undo' });
          assert.deepEqual(afterUndo.annotations, [],
            'the first undo reaches the pre-add state, so cancel added no history entry');
          const afterRedo = await harness.command({ type: 'redo' });
          assert.deepEqual(afterRedo.annotations, [baseline.annotation]);
          await harness.command({ type: 'select', id: annotationId });
          const finalSave = await harness.command({ type: 'save' });
          assert.equal(finalSave.status, 'saved');
          assert.deepEqual(harness.readWorking().state, baselineWorking.state,
            'the non-historical selection restore leaves the committed state exact');
          const pointerQueries = await source.evaluate(
            'structuredClone(globalThis.__t012PointerQueries)',
          );
          assert.deepEqual(pointerQueries, [],
            'pointer preview, Escape, and history need no view or selector query workaround');
          evidence.json('live-pointer-preview-result.json', {
            case: context.name,
            expected: 'A held pointer preview hides outside #fieldclip, returns inside, and Escape restores the one committed record without history or native queries.',
            browser: harness.browser.info.Browser,
            annotationId,
            baseline,
            outside,
            returned,
            cancelledBeforeRelease,
            cancelled,
            history: {
              undoAnnotationCount: afterUndo.annotations.length,
              redoAnnotationCount: afterRedo.annotations.length,
            },
            sourceQueries: pointerQueries,
            screenshot: evidence.image('live-pointer-outside.png', outsideScreenshot),
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 admission race: an old selector response cannot cross an adopted nested view', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 admission race leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-admission-view-race');
        let harness;
        try {
          // Arrange: keep one committed #inside annotation and target, then use
          // capture-phase protocol instrumentation to hold only addComment's
          // second (admission) selector result. The bridge and engine are real.
          harness = await createT010ReviewHarness(context, {
            number: '764',
            slug: 'admission-view-race',
            html: t012LiveFieldClipHtml(),
            width: 480,
            height: 360,
            theme: 'light',
            profileOwnership,
          });
          let source = await attachT010SourceFrame(harness);
          await harness.command({ type: 'element', selector: '#inside' });
          const retainedId = await harness.command({ type: 'addComment' });
          const baselineSave = await harness.command({ type: 'save' });
          assert.equal(baselineSave.status, 'saved');
          const baselineWorking = harness.readWorking();
          // Register before remount so this test listener precedes the new
          // engine's result listener. It passes all initialization traffic and
          // later holds exactly the fourth admission response.
          await evaluate(harness.page, `(() => {
            const gate = globalThis.__t012AdmissionGate = {
              armed: false,
              responseOrdinal: 0,
              held: null,
            };
            addEventListener('message', event => {
              const iframe = document.querySelector('.dude-review-frame iframe');
              if (!iframe || event.source !== iframe.contentWindow || event.origin !== 'null') return;
              const data = event.data;
              if (!gate.armed || data?.type !== 'dude-review-result') return;
              gate.responseOrdinal += 1;
              if (gate.held === null && gate.responseOrdinal === 4) {
                event.stopImmediatePropagation();
                gate.held = {
                  data: structuredClone(data),
                  sourceIsFrame: event.source === iframe.contentWindow,
                  origin: event.origin,
                };
              }
            });
          })()`);
          const reopen = await harness.postJson('/api/needs-you/review/open', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
          });
          assert.equal(reopen.response.status, 202);
          assert.deepEqual(reopen.payload.working, baselineWorking.state);
          await harness.mount(reopen.payload);
          source = await attachT010SourceFrame(harness);
          await harness.command({ type: 'element', selector: '#inside' });
          const baseline = await evaluate(harness.page, 'window.__review.getState()');
          await source.evaluate(`(() => {
            const trace = globalThis.__t012AdmissionTrace = {
              selectorOrdinal: 0,
              queries: [],
            };
            addEventListener('message', event => {
              const data = event.data;
              if (event.source !== parent || data?.type !== 'dude-review-query') return;
              const selectorOrdinal = data.op === 'selector'
                ? ++trace.selectorOrdinal
                : null;
              const row = {
                id: data.id,
                op: data.op,
                selector: data.selector ?? null,
                selectorOrdinal,
              };
              trace.queries.push(row);
            });
          })()`);
          await evaluate(harness.page, `(() => {
            const gate = globalThis.__t012AdmissionGate;
            gate.armed = true;
            gate.responseOrdinal = 0;
            gate.held = null;
          })()`);
          await evaluate(harness.page, `(() => {
            globalThis.__t012AdmissionSettled = null;
            globalThis.__t012AdmissionOutcome = window.__review
              .command({type:'addComment'})
              .then(
                id => ({status:'resolved', id}),
                error => ({
                  status: 'rejected',
                  code: error.code ?? null,
                  message: error.message,
                }),
              )
              .then(result => {
                globalThis.__t012AdmissionSettled = result;
                return result;
              });
          })()`);
          let held;
          try {
            held = await until(
              () => evaluate(
                harness.page,
                'structuredClone(globalThis.__t012AdmissionGate.held)',
              ),
              'the fresh admission selector result is held at the real bridge boundary',
              3_000,
            );
          } catch (error) {
            const diagnostic = await evaluate(harness.page, `({
              gate: {
                responseOrdinal: globalThis.__t012AdmissionGate.responseOrdinal,
                held: globalThis.__t012AdmissionGate.held,
              },
              settled: globalThis.__t012AdmissionSettled,
            })`);
            diagnostic.trace = await source.evaluate(
              'structuredClone(globalThis.__t012AdmissionTrace.queries)',
            );
            throw new Error(`${error.message}; admission gate: ${JSON.stringify(diagnostic)}`);
          }
          const beforeScrollTrace = await source.evaluate(
            'structuredClone(globalThis.__t012AdmissionTrace.queries)',
          );
          assert.deepEqual(beforeScrollTrace.map(({ op }) => op), [
            'view',
            'selector',
            'view',
            'selector',
          ]);
          assert.equal(held.data.id, beforeScrollTrace.at(-1).id);
          assert.equal(held.sourceIsFrame, true);
          assert.equal(held.origin, 'null');
          assert.deepEqual(Object.keys(held.data.result).sort(), [
            'clip',
            'element',
            'scrollBasis',
            'visible',
          ], 'the held admission fact is the complete fresh native description');
          assert.deepEqual(
            {
              selector: held.data.result.element.selector,
              rect: held.data.result.element.rect,
              scrollBasis: held.data.result.scrollBasis,
              visible: held.data.result.visible,
              clip: held.data.result.clip,
            },
            {
              selector: '#inside',
              rect: { x: 65, y: 215, width: 120, height: 90 },
              scrollBasis: [{
                selector: '#fieldclip',
                scrollLeft: 0,
                scrollTop: 0,
              }],
              visible: true,
              clip: { left: 45, top: 55, right: 339, bottom: 249 },
            },
          );

          // Act: while that old response is pending, native nested scrolling
          // drives the ordinary notification/refresh path to adopt a new view
          // at the same engine epoch. Release the exact old response only after
          // the new target geometry and annotation projection are observable.
          assert.equal(await source.evaluate(`new Promise(resolve => {
            const port = document.querySelector('#fieldclip');
            port.scrollTo({left:0,top:10,behavior:'instant'});
            requestAnimationFrame(() => requestAnimationFrame(
              () => resolve(port.scrollTop)
            ));
          })`), 10);
          const adopted = await until(
            () => evaluate(harness.page, `(() => {
              const state = window.__review.getState();
              const port = state.view.scrolls.find(
                entry => entry.selector === '#fieldclip'
              );
              const annotation = state.annotations.find(
                entry => entry.id === ${JSON.stringify(retainedId)}
              );
              return port?.scrollTop === 10
                && state.target?.rect?.y === 205
                && annotation?.y1 === 221
                && !state.busy
                ? state
                : null;
            })()`),
            'the current nested view is adopted before the old response is released',
            3_000,
          );
          await evaluate(
            harness.page,
            'globalThis.__t012AdmissionGate.armed = false',
          );
          await source.evaluate(
            `parent.postMessage(${JSON.stringify(held.data)}, '*'); true`,
          );
          const outcome = await evaluate(
            harness.page,
            'globalThis.__t012AdmissionOutcome',
          );
          await settleBrowserWork(harness.page);
          const final = await evaluate(harness.page, 'window.__review.getState()');
          const trace = await source.evaluate(
            'structuredClone(globalThis.__t012AdmissionTrace.queries)',
          );

          // Assert: this is a same-epoch supersession, not source staleness.
          // The old native target geometry cannot replace the adopted target or
          // create a second annotation over the new view.
          assert.deepEqual(outcome, {
            status: 'rejected',
            code: 'review_superseded',
            message: 'Review view superseded.',
          });
          assert.deepEqual(trace.map(({ op }) => op), [
            'view',
            'selector',
            'view',
            'selector',
            'view',
            'selector',
            'view',
          ]);
          assert.deepEqual(
            {
              stale: final.stale,
              editable: final.editable,
              error: final.error,
              busy: final.busy,
              annotationIds: final.annotations.map(({ id }) => id),
              retainedPoint: {
                x: final.annotations[0].x1,
                y: final.annotations[0].y1,
              },
              target: {
                selector: final.target.selector,
                rect: final.target.rect,
              },
              scrolls: final.view.scrolls,
              canUndo: final.canUndo,
              canRedo: final.canRedo,
            },
            {
              stale: false,
              editable: true,
              error: null,
              busy: false,
              annotationIds: [retainedId],
              retainedPoint: { x: 81, y: 221 },
              target: {
                selector: '#inside',
                rect: { x: 65, y: 205, width: 120, height: 90 },
              },
              scrolls: [{
                selector: '#fieldclip',
                scrollLeft: 0,
                scrollTop: 10,
              }],
              canUndo: false,
              canRedo: false,
            },
          );
          assert.notDeepEqual(final.target.rect, held.data.result.element.rect,
            'the released old target facts do not overwrite the adopted target');
          assert.equal(final.canUndo, false,
            'remount began with empty history and the refused admission adds no entry');
          const finalSave = await harness.command({ type: 'save' });
          assert.equal(finalSave.status, 'saved');
          const persisted = harness.readWorking();
          assert.deepEqual(
            persisted.state.annotations,
            baselineWorking.state.annotations,
            'the superseded admission preserves the exact stored annotation',
          );
          assert.equal(
            persisted.state.view.scrolls.find(
              ({ selector }) => selector === '#fieldclip'
            ).scrollTop,
            10,
          );
          evidence.json('admission-view-race-result.json', {
            case: context.name,
            expected: 'A complete old selector result is refused after a same-epoch nested view adoption, without source staleness, retargeting, or annotation commit.',
            browser: harness.browser.info.Browser,
            retainedId,
            baseline: {
              annotation: baseline.annotations[0],
              target: baseline.target,
              view: baseline.view,
            },
            held,
            adopted: {
              annotation: adopted.annotations[0],
              target: adopted.target,
              view: adopted.view,
            },
            outcome,
            final: {
              annotations: final.annotations,
              target: final.target,
              view: final.view,
              stale: final.stale,
              error: final.error,
            },
            trace,
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 nested-scroll field clip: a partial target stays valid only while its marker footprint fits', {
        timeout: 180_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 field-clip control leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-field-clip-control');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;background:#edf4fa;color:#102a43}',
          '*{box-sizing:border-box}',
          '#fieldclip{position:absolute;left:40px;top:50px;width:320px;height:220px;',
          'border:5px solid #24557a;overflow:scroll;scrollbar-gutter:stable;background:#d9eaf7}',
          '#fieldclip::-webkit-scrollbar{width:16px;height:16px}',
          '#fieldclip::-webkit-scrollbar-track{background:#c9dfef}',
          '#fieldclip::-webkit-scrollbar-thumb{background:#24557a}',
          '#content{position:relative;width:500px;height:500px}',
          '#inside,#edge{position:absolute;width:120px;height:90px}',
          '#inside{left:20px;top:160px}',
          '#edge{left:160px;top:174px}',
          '#tightclip{position:absolute;left:380px;top:50px;width:12px;height:180px;',
          'overflow:hidden;background:#b7d7ec}',
          '#tightcontent{position:relative;width:80px;height:180px}',
          '</style>',
          '<main id="fieldclip"><div id="content">',
          '<button id="inside">Partial field, marker inside</button>',
          '<button id="edge">Partial field, marker edge</button>',
          '</div></main>',
          '<aside id="tightclip"><div id="tightcontent"></div></aside>',
        ].join('');
        const options = {
          number: '760',
          slug: 'nested-field-clip',
          html,
          width: 480,
          height: 360,
          theme: /** @type {'light'} */ ('light'),
          profileOwnership,
        };
        const sourceGeometry = (source, selector, portSelector = '#fieldclip') => source.evaluate(`(() => {
          const port = document.querySelector(${JSON.stringify(portSelector)});
          const target = document.querySelector(${JSON.stringify(selector)});
          if (!port || !target) return {
            missing: { port: !port, target: !target },
            ids: [...document.querySelectorAll('[id]')].map(node => node.id),
          };
          const portRect = port.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const client = {
            left: portRect.left + port.clientLeft,
            top: portRect.top + port.clientTop,
            right: portRect.left + port.clientLeft + port.clientWidth,
            bottom: portRect.top + port.clientTop + port.clientHeight,
          };
          return {
            rootViewport: {left:0,top:0,right:innerWidth,bottom:innerHeight},
            port: {
              nativeRect: {
                x: portRect.x, y: portRect.y,
                width: portRect.width, height: portRect.height,
              },
              client: {
                left: port.clientLeft, top: port.clientTop,
                width: port.clientWidth, height: port.clientHeight,
              },
              clip: {
                left: Math.max(0, client.left),
                top: Math.max(0, client.top),
                right: Math.min(innerWidth, client.right),
                bottom: Math.min(innerHeight, client.bottom),
              },
              scrollLeft: port.scrollLeft,
              scrollTop: port.scrollTop,
              scrollWidth: port.scrollWidth,
              scrollHeight: port.scrollHeight,
            },
            target: {
              selector: ${JSON.stringify(selector)},
              matches: document.querySelectorAll(${JSON.stringify(selector)}).length,
              rect: {
                x: targetRect.x, y: targetRect.y,
                width: targetRect.width, height: targetRect.height,
              },
            },
          };
        })()`);
        const markerSnapshot = (currentHarness, id) => evaluate(currentHarness.page, `(() => {
          const state = window.__review.getState();
          const annotation = state.annotations.find(item => item.id === ${JSON.stringify(id)});
          const group = document.querySelector('[data-annotation="${id}"]');
          const circles = [...(group?.querySelectorAll('circle') ?? [])];
          const circle = annotation?.tool === 'comment' ? circles[0] : circles.at(-1);
          const label = [...(group?.querySelectorAll('text') ?? [])].at(-1);
          const rect = circle?.getBoundingClientRect();
          const labelRect = label?.getBoundingClientRect();
          const radius = circle && Number(circle.getAttribute('r'));
          const strokeWidth = circle && Number.parseFloat(getComputedStyle(circle).strokeWidth);
          const paintedRadius = radius + strokeWidth / 2;
          const clipReference = group?.getAttribute('clip-path');
          const clipId = /^url\\(#(.+)\\)$/.exec(clipReference ?? '')?.[1] ?? null;
          const clipRect = clipId && document.getElementById(clipId)?.querySelector('rect');
          return {
            annotation,
            marker: circle ? {
              point: {
                x: Number(circle.getAttribute('cx')),
                y: Number(circle.getAttribute('cy')),
              },
              nativeRect: {
                left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
                width: rect.width, height: rect.height,
              },
              paintedFootprint: {
                left: Number(circle.getAttribute('cx')) - paintedRadius,
                top: Number(circle.getAttribute('cy')) - paintedRadius,
                right: Number(circle.getAttribute('cx')) + paintedRadius,
                bottom: Number(circle.getAttribute('cy')) + paintedRadius,
                radius: paintedRadius,
              },
              numeral: label ? {
                text: label.textContent,
                nativeRect: {
                  left: labelRect.left, top: labelRect.top,
                  right: labelRect.right, bottom: labelRect.bottom,
                  width: labelRect.width, height: labelRect.height,
                },
              } : null,
              clipPath: clipReference,
              clipRegion: clipRect ? {
                x: Number(clipRect.getAttribute('x')),
                y: Number(clipRect.getAttribute('y')),
                width: Number(clipRect.getAttribute('width')),
                height: Number(clipRect.getAttribute('height')),
              } : null,
            } : null,
            state: {
              stale: state.stale,
              editable: state.editable,
              error: state.error,
              busy: state.busy,
              selectedId: state.selectedId,
              annotations: state.annotations,
              scrolls: state.view.scrolls,
            },
          };
        })()`);
        const drawWithNativePointer = async (currentHarness, tool, start, end) => {
          // Arrange
          await currentHarness.command({ type: 'tool', tool });
          const before = await evaluate(
            currentHarness.page,
            'window.__review.getState().annotations.length',
          );
          const geometry = await evaluate(currentHarness.page, `(() => {
            const state = window.__review.getState();
            const rect = document.querySelector('.dude-review-overlay').getBoundingClientRect();
            return {
              rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
              viewport: state.view.viewport,
            };
          })()`);
          const point = ({ x, y }) => ({
            x: geometry.rect.left
              + (x - geometry.viewport.scrollX) * geometry.rect.width / geometry.viewport.width,
            y: geometry.rect.top
              + (y - geometry.viewport.scrollY) * geometry.rect.height / geometry.viewport.height,
          });
          const from = point(start);
          const to = point(end);

          // Act: drive the production pointer path; never call a DOM handler.
          await currentHarness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0,
          });
          await currentHarness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', x: from.x, y: from.y,
            button: 'left', buttons: 1, clickCount: 1,
          });
          for (let step = 1; step <= 6; step += 1) {
            await currentHarness.page.send('Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x: from.x + (to.x - from.x) * step / 6,
              y: from.y + (to.y - from.y) * step / 6,
              button: 'left',
              buttons: 1,
            });
          }
          await currentHarness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: to.x, y: to.y,
            button: 'left', buttons: 0, clickCount: 1,
          });

          // Assert enough here to prevent a missing native event from yielding a
          // later vacuous marker check.
          return until(async () => {
            const state = await evaluate(currentHarness.page, 'window.__review.getState()');
            return state.annotations.length === before + 1 && !state.busy
              ? state.annotations.at(-1)
              : null;
          }, `${tool} committed through native pointer input`);
        };
        const footprintInside = (clip, footprint) => (
          footprint.left >= clip.left
          && footprint.top >= clip.top
          && footprint.right <= clip.right
          && footprint.bottom <= clip.bottom
        );
        let positiveHarness;
        let edgeHarness;
        try {
          // Arrange: the normal field is taller than the visible portion of the
          // nested client area, but its actual comment paint fits completely.
          positiveHarness = await createT010ReviewHarness(context, options);
          const positiveSource = await attachT010SourceFrame(positiveHarness);
          const positiveGeometry = await sourceGeometry(positiveSource, '#inside');
          assert.deepEqual(positiveGeometry, {
            rootViewport: { left: 0, top: 0, right: 480, bottom: 360 },
            port: {
              nativeRect: { x: 40, y: 50, width: 320, height: 220 },
              client: { left: 5, top: 5, width: 294, height: 194 },
              clip: { left: 45, top: 55, right: 339, bottom: 249 },
              scrollLeft: 0,
              scrollTop: 0,
              scrollWidth: 500,
              scrollHeight: 500,
            },
            target: {
              selector: '#inside',
              matches: 1,
              rect: { x: 65, y: 215, width: 120, height: 90 },
            },
          });
          await positiveHarness.command({ type: 'element', selector: '#inside' });
          const positiveId = await positiveHarness.command({ type: 'addComment' });
          await positiveHarness.command({
            type: 'edit',
            id: positiveId,
            changes: { comment: 'Keep this partially clipped field marker.' },
          });
          await positiveHarness.command({ type: 'scroll', x: 0, y: 0 });
          const positive = await until(async () => {
            const snapshot = await markerSnapshot(positiveHarness, positiveId);
            return snapshot.marker && !snapshot.state.busy ? snapshot : null;
          }, 'partial field marker remains rendered inside its client clip');
          const exactBoxAnnotation = await drawWithNativePointer(
            positiveHarness,
            'box',
            { x: 47, y: 57 },
            { x: 337, y: 247 },
          );
          const exactBox = await until(async () => {
            const snapshot = await markerSnapshot(positiveHarness, exactBoxAnnotation.id);
            return snapshot.marker && !snapshot.state.busy ? snapshot : null;
          }, 'exact field box badge is rendered');
          const exactBoxGeometry = await sourceGeometry(positiveSource, '#content');
          const tightGeometry = await sourceGeometry(
            positiveSource,
            '#tightcontent',
            '#tightclip',
          );
          const tightAnnotation = await drawWithNativePointer(
            positiveHarness,
            'box',
            { x: 382, y: 80 },
            { x: 390, y: 140 },
          );
          const tight = await until(async () => {
            const snapshot = await markerSnapshot(positiveHarness, tightAnnotation.id);
            return snapshot.marker && !snapshot.state.busy ? snapshot : null;
          }, 'narrow field box badge is rendered');
          await positiveHarness.command({ type: 'select', id: null });
          const tightRaster = await evaluate(positiveHarness.page, `(async () => {
            const source = document.querySelector('.dude-review-overlay');
            const viewport = window.__review.getState().view.viewport;
            const svg = source.cloneNode(true);
            svg.setAttribute('width', String(viewport.width));
            svg.setAttribute('height', String(viewport.height));
            const serialized = new XMLSerializer().serializeToString(svg);
            const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
            try {
              const image = await new Promise((resolve, reject) => {
                const node = new Image();
                node.onload = () => resolve(node);
                node.onerror = () => reject(new Error('serialized marker SVG failed'));
                node.src = url;
              });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const context = canvas.getContext('2d');
              context.drawImage(image, 0, 0, viewport.width, viewport.height);
              const pixels = context.getImageData(
                0, 0, viewport.width, viewport.height
              ).data;
              const foreground = window.__review.getState().palette.foreground
                .match(/[a-f0-9]{2}/gi).map(value => Number.parseInt(value, 16));
              const nearForeground = (x, y) => {
                const at = (y * viewport.width + x) * 4;
                return pixels[at + 3] > 128 && foreground.every((channel, index) => (
                  Math.abs(pixels[at + index] - channel) <= 40
                ));
              };
              const painted = (left, top, right, bottom) => {
                let count = 0;
                for (let y = top; y < bottom; y += 1) {
                  for (let x = left; x < right; x += 1) {
                    if (pixels[(y * viewport.width + x) * 4 + 3] > 8) count += 1;
                  }
                }
                return count;
              };
              const glyphMask = (left, top, right, bottom) => {
                const mask = [];
                for (let y = top; y < bottom; y += 1) {
                  for (let x = left; x < right; x += 1) {
                    if (nearForeground(x, y)) mask.push([x, y]);
                  }
                }
                return mask;
              };
              return {
                serializedHasClipPath: serialized.includes('clipPath')
                  && serialized.includes('clip-path'),
                leftOfClip: painted(370, 55, 380, 90),
                insideClip: painted(380, 55, 392, 150),
                rightOfClip: painted(392, 55, 402, 90),
                exactGlyphMask: glyphMask(49, 57, 61, 73),
                tightGlyphMask: glyphMask(380, 60, 392, 82),
              };
            } finally {
              URL.revokeObjectURL(url);
            }
          })()`);

          // Assert the positive boundary before sealing it through the ordinary
          // engine/provider/fresh-capture path.
          assert.equal(
            positiveGeometry.target.rect.y < positiveGeometry.port.clip.bottom
              && positiveGeometry.target.rect.y + positiveGeometry.target.rect.height
                > positiveGeometry.port.clip.bottom,
            true,
            'the large field itself is partially clipped',
          );
          assert.deepEqual(
            {
              point: positive.marker.point,
              nativeRect: positive.marker.nativeRect,
              paintedFootprint: positive.marker.paintedFootprint,
            },
            {
              point: { x: 81, y: 231 },
              nativeRect: {
                left: 69, top: 219, right: 93, bottom: 243, width: 24, height: 24,
              },
              paintedFootprint: {
                left: 68, top: 218, right: 94, bottom: 244, radius: 13,
              },
            },
          );
          assert.equal(positive.marker.numeral.text, '1');
          assert.equal(
            positive.marker.clipPath,
            `url(#dude-review-clip-${positive.annotation.id})`,
          );
          assert.deepEqual(
            positive.marker.clipRegion,
            { x: 45, y: 55, width: 294, height: 194 },
          );
          assert.equal(
            footprintInside(positiveGeometry.port.clip, positive.marker.paintedFootprint),
            true,
            'a partially clipped large field stays valid when its marker paint fits',
          );
          assert.deepEqual(
            {
              tool: exactBox.annotation.tool,
              geometry: {
                x1: exactBox.annotation.x1,
                y1: exactBox.annotation.y1,
                x2: exactBox.annotation.x2,
                y2: exactBox.annotation.y2,
              },
              selector: exactBox.annotation.element?.selector,
              point: exactBox.marker.point,
              footprint: exactBox.marker.paintedFootprint,
              clipPath: exactBox.marker.clipPath,
              clipRegion: exactBox.marker.clipRegion,
            },
            {
              tool: 'box',
              geometry: { x1: 47, y1: 57, x2: 337, y2: 247 },
              selector: '#content',
              point: { x: 54.75, y: 64.75 },
              footprint: {
                left: 45, top: 55, right: 64.5, bottom: 74.5, radius: 9.75,
              },
              clipPath: `url(#dude-review-clip-${exactBox.annotation.id})`,
              clipRegion: { x: 45, y: 55, width: 294, height: 194 },
            },
            'the exact admitted box uses the nested clip and clamps its complete badge disc',
          );
          assert.equal(
            footprintInside(exactBoxGeometry.port.clip, exactBox.marker.paintedFootprint),
            true,
            'the exact-box badge paint stays inside the port client clip',
          );
          assert.equal(
            exactBox.marker.numeral.nativeRect.left >= exactBoxGeometry.port.clip.left
              && exactBox.marker.numeral.nativeRect.top >= exactBoxGeometry.port.clip.top
              && exactBox.marker.numeral.nativeRect.right <= exactBoxGeometry.port.clip.right
              && exactBox.marker.numeral.nativeRect.bottom <= exactBoxGeometry.port.clip.bottom,
            true,
            'the complete exact-box numeral layout stays inside the nested clip',
          );
          assert.deepEqual(tightGeometry, {
            rootViewport: { left: 0, top: 0, right: 480, bottom: 360 },
            port: {
              nativeRect: { x: 380, y: 50, width: 12, height: 180 },
              client: { left: 0, top: 0, width: 12, height: 180 },
              clip: { left: 380, top: 50, right: 392, bottom: 230 },
              scrollLeft: 0,
              scrollTop: 0,
              scrollWidth: 80,
              scrollHeight: 180,
            },
            target: {
              selector: '#tightcontent',
              matches: 1,
              rect: { x: 380, y: 50, width: 80, height: 180 },
            },
          });
          assert.deepEqual(
            {
              tool: tight.annotation.tool,
              geometry: {
                x1: tight.annotation.x1,
                y1: tight.annotation.y1,
                x2: tight.annotation.x2,
                y2: tight.annotation.y2,
              },
              selector: tight.annotation.element?.selector,
              point: tight.marker.point,
              footprint: tight.marker.paintedFootprint,
              clipPath: tight.marker.clipPath,
              clipRegion: tight.marker.clipRegion,
            },
            {
              tool: 'box',
              geometry: { x1: 382, y1: 80, x2: 390, y2: 140 },
              selector: '#tightcontent',
              point: { x: 386, y: 71 },
              footprint: {
                left: 376.25, top: 61.25, right: 395.75, bottom: 80.75,
                radius: 9.75,
              },
              clipPath: `url(#dude-review-clip-${tight.annotation.id})`,
              clipRegion: { x: 380, y: 50, width: 12, height: 180 },
            },
            'a clip narrower than the 19.5px disc centres the badge for symmetric cropping',
          );
          assert.equal(
            footprintInside(tightGeometry.port.clip, tight.marker.paintedFootprint),
            false,
            'the narrow control is genuinely too small to contain the geometric disc',
          );
          assert.deepEqual(tightRaster, {
            serializedHasClipPath: true,
            leftOfClip: 0,
            insideClip: tightRaster.insideClip,
            rightOfClip: 0,
            exactGlyphMask: tightRaster.exactGlyphMask,
            tightGlyphMask: tightRaster.tightGlyphMask,
          }, 'the browser rasterizer crops all badge paint at both narrow clip edges');
          assert.ok(
            tightRaster.insideClip > 0
              && tightRaster.exactGlyphMask.length > 0
              && tightRaster.tightGlyphMask.length > 0,
            `the narrow crop guard cannot pass on an empty overlay: ${JSON.stringify(tightRaster)}`,
          );
          assert.equal(
            tight.marker.numeral.nativeRect.left >= tightGeometry.port.clip.left
              && tight.marker.numeral.nativeRect.top >= tightGeometry.port.clip.top
              && tight.marker.numeral.nativeRect.right <= tightGeometry.port.clip.right
              && tight.marker.numeral.nativeRect.bottom <= tightGeometry.port.clip.bottom,
            true,
            'the narrow crop removes only the oversized disc edge, not its numeral',
          );
          const positiveSeal = await positiveHarness.command({ type: 'seal' }, 45_000);
          assert.equal(positiveSeal.status, 'sealed');
          const positiveProvenance = JSON.parse(fs.readFileSync(
            path.join(positiveHarness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          assert.deepEqual(positiveProvenance.capture.scrolls, [
            { selector: '#fieldclip', scrollLeft: 0, scrollTop: 0 },
            { selector: '#tightclip', scrollLeft: 0, scrollTop: 0 },
          ]);
          const positiveImage = fs.readFileSync(
            path.join(positiveHarness.reviewDirectory, 'annotated.png'),
          );
          const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
          const decoded = decodePng(positiveImage);
          const state = positiveHarness.readWorking().state;
          const scale = state.view.viewport.deviceScale;
          const color = (value) => {
            const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
            if (hex) return hex.slice(1).map((channel) => Number.parseInt(channel, 16));
            const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
            assert.ok(rgb, `expected an opaque palette color, got ${value}`);
            return rgb.slice(1, 4).map(Number);
          };
          const foreground = color(state.palette.foreground);
          const near = (sample, expected, tolerance = 40) => sample.slice(0, 3)
            .every((channel, index) => Math.abs(channel - expected[index]) <= tolerance);
          const strokePixel = (sample) => sample[0] > 120
            && sample[0] - sample[1] > 40
            && sample[0] - sample[2] > 40;
          const ringCount = (point, radius) => {
            let count = 0;
            for (let angle = 0; angle < 64; angle += 1) {
              const x = (point.x + Math.cos(angle * Math.PI / 32) * radius) * scale;
              const y = (point.y + Math.sin(angle * Math.PI / 32) * radius) * scale;
              if (strokePixel(decodedPixel(decoded, x, y))) count += 1;
            }
            return count;
          };
          const pixelCount = (left, top, right, bottom, predicate) => {
            let count = 0;
            for (let y = Math.floor(top * scale); y < Math.ceil(bottom * scale); y += 1) {
              for (let x = Math.floor(left * scale); x < Math.ceil(right * scale); x += 1) {
                if (predicate(decodedPixel(decoded, x, y))) count += 1;
              }
            }
            return count;
          };
          const pixelMask = (left, top, right, bottom, predicate) => {
            const mask = [];
            for (let y = Math.floor(top * scale); y < Math.ceil(bottom * scale); y += 1) {
              for (let x = Math.floor(left * scale); x < Math.ceil(right * scale); x += 1) {
                if (predicate(decodedPixel(decoded, x, y))) mask.push([x, y]);
              }
            }
            return mask;
          };
          const deliveredPixels = {
            exactBox: {
              ringAtPlaced: ringCount(exactBox.marker.point, 9),
              ringAtBare: ringCount({ x: 38, y: 48 }, 9),
              glyphAtPlaced: pixelCount(
                exactBox.marker.point.x - 5,
                exactBox.marker.point.y - 7,
                exactBox.marker.point.x + 5,
                exactBox.marker.point.y + 7,
                (sample) => near(sample, foreground),
              ),
              glyphMask: pixelMask(
                49,
                57,
                61,
                73,
                (sample) => near(sample, foreground),
              ),
            },
            tight: {
              leftOfClip: pixelCount(370, 55, 380, 90, strokePixel),
              insideClip: pixelCount(380, 55, 392, 150, strokePixel),
              rightOfClip: pixelCount(392, 55, 402, 90, strokePixel),
              glyphInsideClip: pixelCount(
                380,
                60,
                392,
                82,
                (sample) => near(sample, foreground),
              ),
              glyphMask: pixelMask(
                380,
                60,
                392,
                82,
                (sample) => near(sample, foreground),
              ),
            },
          };
          assert.ok(
            deliveredPixels.exactBox.ringAtPlaced >= 40,
            `the delivered PNG lacks the disc at the nested placed anchor: ${JSON.stringify(deliveredPixels)}`,
          );
          assert.equal(
            deliveredPixels.exactBox.ringAtBare,
            0,
            'the delivered PNG has no duplicate disc at the bare Sharpie anchor',
          );
          assert.ok(
            deliveredPixels.exactBox.glyphAtPlaced >= 3,
            `the delivered exact-box numeral is absent: ${JSON.stringify(deliveredPixels)}`,
          );
          assert.deepEqual(
            deliveredPixels.exactBox.glyphMask,
            tightRaster.exactGlyphMask,
            'the delivered exact-box numeral matches the complete live glyph, not a cropped fragment',
          );
          assert.deepEqual(
            {
              leftOfClip: deliveredPixels.tight.leftOfClip,
              rightOfClip: deliveredPixels.tight.rightOfClip,
            },
            { leftOfClip: 0, rightOfClip: 0 },
            'the delivered PNG also crops the degenerate disc at both nested edges',
          );
          assert.ok(
            deliveredPixels.tight.insideClip > 0
              && deliveredPixels.tight.glyphInsideClip >= 3,
            `the narrow delivered badge and numeral must still paint inside: ${JSON.stringify(deliveredPixels)}`,
          );
          assert.deepEqual(
            deliveredPixels.tight.glyphMask,
            tightRaster.tightGlyphMask,
            'the narrow delivered numeral matches its complete live glyph despite disc cropping',
          );
          const positiveControl = {
            geometry: positiveGeometry,
            overlay: positive,
            exactBox: {
              geometry: exactBoxGeometry,
              overlay: exactBox,
              deliveredPixels: deliveredPixels.exactBox,
            },
            narrowClip: {
              geometry: tightGeometry,
              overlay: tight,
              serializedRaster: tightRaster,
              deliveredPixels: deliveredPixels.tight,
            },
            seal: positiveSeal,
            capture: positiveProvenance.capture,
            image: evidence.image(
              'partial-field-marker-inside-sealed.png',
              positiveImage,
            ),
            screenshot: evidence.image(
              'partial-field-marker-inside.png',
              await positiveHarness.screenshot(),
            ),
          };
          await positiveHarness.close();
          positiveHarness = null;

          // Arrange + Act: create two valid comments on the same partially
          // clipped field, then edit one retained record across the client
          // edge. New candidates are admitted only while fully visible; saved
          // edits remain recoverable and continue to exercise Send refusal.
          edgeHarness = await createT010ReviewHarness(context, options);
          const edgeSource = await attachT010SourceFrame(edgeHarness);
          const edgeGeometry = await sourceGeometry(edgeSource, '#inside');
          await edgeHarness.command({ type: 'element', selector: '#inside' });
          const edgeId = await edgeHarness.command({ type: 'addComment' });
          await edgeHarness.command({
            type: 'edit',
            id: edgeId,
            changes: {
              x1: 81,
              y1: 245,
              x2: 81,
              y2: 245,
              comment: 'Hide this retained marker until all of its paint fits.',
            },
          });
          const insideOffsetId = await edgeHarness.command({ type: 'addComment' });
          await edgeHarness.command({
            type: 'edit',
            id: insideOffsetId,
            changes: {
              x1: 81,
              y1: 230,
              x2: 81,
              y2: 230,
              comment: 'Keep this second marker because all of its paint fits.',
            },
          });
          await edgeHarness.command({ type: 'scroll', x: 0, y: 0 });
          await edgeHarness.command({ type: 'save' });
          const edge = await until(async () => {
            const snapshot = await markerSnapshot(edgeHarness, edgeId);
            return snapshot.annotation?.x1 === 81
              && snapshot.annotation?.y1 === 245
              && !snapshot.state.busy
              ? snapshot
              : null;
          }, 'partial field edge projection');
          const insideOffset = await markerSnapshot(edgeHarness, insideOffsetId);
          const edgeFootprint = {
            left: edge.annotation.x1 - positive.marker.paintedFootprint.radius,
            top: edge.annotation.y1 - positive.marker.paintedFootprint.radius,
            right: edge.annotation.x1 + positive.marker.paintedFootprint.radius,
            bottom: edge.annotation.y1 + positive.marker.paintedFootprint.radius,
            radius: positive.marker.paintedFootprint.radius,
          };
          const insideOffsetFootprint = {
            left: insideOffset.annotation.x1 - positive.marker.paintedFootprint.radius,
            top: insideOffset.annotation.y1 - positive.marker.paintedFootprint.radius,
            right: insideOffset.annotation.x1 + positive.marker.paintedFootprint.radius,
            bottom: insideOffset.annotation.y1 + positive.marker.paintedFootprint.radius,
            radius: positive.marker.paintedFootprint.radius,
          };
          assert.deepEqual(edgeGeometry, {
            rootViewport: { left: 0, top: 0, right: 480, bottom: 360 },
            port: {
              nativeRect: { x: 40, y: 50, width: 320, height: 220 },
              client: { left: 5, top: 5, width: 294, height: 194 },
              clip: { left: 45, top: 55, right: 339, bottom: 249 },
              scrollLeft: 0,
              scrollTop: 0,
              scrollWidth: 500,
              scrollHeight: 500,
            },
            target: {
              selector: '#inside',
              matches: 1,
              rect: { x: 65, y: 215, width: 120, height: 90 },
            },
          });
          assert.deepEqual(edgeFootprint, {
            left: 68, top: 232, right: 94, bottom: 258, radius: 13,
          });
          assert.deepEqual(insideOffsetFootprint, {
            left: 68, top: 217, right: 94, bottom: 243, radius: 13,
          });
          assert.equal(edge.annotation.y1 < edgeGeometry.port.clip.bottom, true,
            'the edge marker point itself remains inside the client clip');
          assert.equal(
            footprintInside(edgeGeometry.rootViewport, edgeFootprint),
            true,
            'root-only visibility would admit the edge marker',
          );
          assert.equal(
            footprintInside(edgeGeometry.port.clip, edgeFootprint),
            false,
            'the complete marker footprint crosses the nested client clip',
          );
          assert.equal(
            footprintInside(edgeGeometry.port.clip, insideOffsetFootprint),
            true,
            'a different offset on the same anchor keeps its complete marker footprint inside',
          );
          assert.deepEqual(
            {
              first: {
                selector: edge.annotation.element.selector,
                element: edge.annotation.element,
                marker: edge.marker,
              },
              second: {
                selector: insideOffset.annotation.element.selector,
                element: insideOffset.annotation.element,
                markerPoint: insideOffset.marker?.point,
              },
            },
            {
              first: {
                selector: '#inside',
                element: insideOffset.annotation.element,
                marker: null,
              },
              second: {
                selector: '#inside',
                element: edge.annotation.element,
                markerPoint: { x: 81, y: 230 },
              },
            },
            'visibility is evaluated per annotation even when both share one cached anchor node',
          );
          const workingPath = path.join(edgeHarness.reviewDirectory, 'working.json');
          const workingBefore = fs.readFileSync(workingPath);
          const edgeBeforeSendImage = evidence.image(
            'partial-field-marker-crosses-edge.png',
            await edgeHarness.screenshot(),
          );
          let sealAttempt;
          try {
            sealAttempt = {
              ok: true,
              result: await edgeHarness.command({ type: 'seal' }, 45_000),
            };
          } catch (error) {
            sealAttempt = {
              ok: false,
              code: error.code ?? null,
              message: error.message,
            };
          }
          const afterSend = await markerSnapshot(edgeHarness, edgeId);
          const insideOffsetAfterSend = await markerSnapshot(edgeHarness, insideOffsetId);
          const files = fs.readdirSync(edgeHarness.reviewDirectory).sort();
          const workingAfter = fs.readFileSync(workingPath);
          const waiter = edgeHarness.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === edgeHarness.record.requestHandle,
          );
          let unexpectedSeal = null;
          if (sealAttempt.ok) {
            const image = fs.readFileSync(path.join(edgeHarness.reviewDirectory, 'annotated.png'));
            unexpectedSeal = {
              image: evidence.image('unexpected-partial-edge-seal.png', image),
              imageSha256: sha256(image),
            };
          }
          const failures = [];
          collect(failures, () => assert.equal(
            edge.marker,
            null,
            'a partially clipped field does not render marker paint across its client edge',
          ));
          collect(failures, () => assert.equal(sealAttempt.ok, false));
          collect(failures, () => assert.deepEqual(
            afterSend.state.error,
            {
              code: 'review_outside_viewport',
              message: 'Keep all annotations inside the reviewed viewport before sending.',
            },
            'the native engine state retains the exact typed outside-viewport refusal',
          ));
          collect(failures, () => assert.equal(afterSend.state.stale, false));
          collect(failures, () => assert.equal(afterSend.state.editable, true));
          collect(failures, () => assert.equal(afterSend.annotation.id, edgeId));
          collect(failures, () => assert.equal(
            afterSend.state.annotations.some(({ id }) => id === insideOffsetId),
            true,
          ));
          collect(failures, () => assert.equal(
            insideOffsetAfterSend.marker?.point.y,
            230,
            'the valid same-anchor marker remains rendered after its sibling refuses Send',
          ));
          collect(failures, () => assert.deepEqual(files, ['working.json']));
          collect(failures, () => assert.deepEqual(workingAfter, workingBefore));
          collect(failures, () => assert.equal(waiter.phase, 'pending'));
          evidence.json('field-clip-result.json', {
            case: context.name,
            expected: 'A partial field is valid when all marker paint fits; numbered badges remain inside the effective clip; a sub-19.5px port crops the disc but retains its complete numeral; and a point-inside comment whose footprint crosses the client edge hides and refuses.',
            verification: {
              command: "DUDE_CANVAS_BROWSER_REQUIRED=1 node --test --test-reporter=tap --test-concurrency=1 --test-name-pattern='T012 nested-scroll field clip:' scripts/dude-canvas-ui/browser.test.mjs",
              result: failures.length ? 'fail' : 'pass',
            },
            browser: edgeHarness.browser.info.Browser,
            positiveControl,
            edge: {
              geometry: edgeGeometry,
              overlay: edge,
              footprint: edgeFootprint,
              sameAnchorInsideOffset: {
                overlay: insideOffset,
                footprint: insideOffsetFootprint,
              },
              screenshot: edgeBeforeSendImage,
              send: {
                attempt: sealAttempt,
                state: afterSend,
                files,
                workingUnchanged: workingBefore.equals(workingAfter),
                waiterPhase: waiter.phase,
                unexpectedSeal,
              },
            },
            observedFailures: failures,
          });
          assert.deepEqual(failures, [], failures.join('\n'));
        } finally {
          if (positiveHarness) await positiveHarness.close();
          if (edgeHarness) await edgeHarness.close();
        }
      });

test('T012 fully-visible anchor clip: a crossing marker uses the reviewed viewport', {
        timeout: 180_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 fully-visible anchor regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-fully-visible-anchor-clip');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;background:#edf4fa;color:#102a43}',
          '*{box-sizing:border-box}',
          '#clip{position:absolute;left:100px;top:80px;width:200px;height:160px;',
          'border:4px solid #24557a;overflow:auto;background:#d9eaf7}',
          '#target{position:absolute;left:50px;top:50px;width:80px;height:50px}',
          '</style>',
          '<main id="clip"><button id="target">Fully visible target</button></main>',
        ].join('');
        let harness;
        try {
          // Arrange: overflow establishes a real effective clip, but equal
          // scroll/client dimensions prove it cannot hide any part of target.
          harness = await createT010ReviewHarness(context, {
            number: '763',
            slug: 'fully-visible-anchor-clip',
            html,
            width: 480,
            height: 360,
            theme: 'light',
            profileOwnership,
          });
          const source = await attachT010SourceFrame(harness);
          const sourceGeometry = await source.evaluate(`(() => {
            const port = document.querySelector('#clip');
            const target = document.querySelector('#target');
            const portRect = port.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const style = getComputedStyle(port);
            const clip = {
              left: portRect.left + port.clientLeft,
              top: portRect.top + port.clientTop,
              right: portRect.left + port.clientLeft + port.clientWidth,
              bottom: portRect.top + port.clientTop + port.clientHeight,
            };
            const rect = {
              x: targetRect.x, y: targetRect.y,
              width: targetRect.width, height: targetRect.height,
            };
            return {
              viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
              port: {
                overflowX: style.overflowX,
                overflowY: style.overflowY,
                clientWidth: port.clientWidth,
                clientHeight: port.clientHeight,
                scrollWidth: port.scrollWidth,
                scrollHeight: port.scrollHeight,
                clip,
              },
              target: {
                selector: '#target',
                matches: document.querySelectorAll('#target').length,
                rect,
                fullyContained: rect.x >= clip.left
                  && rect.y >= clip.top
                  && rect.x + rect.width <= clip.right
                  && rect.y + rect.height <= clip.bottom,
              },
            };
          })()`);
          assert.deepEqual(sourceGeometry, {
            viewport: { left: 0, top: 0, right: 480, bottom: 360 },
            port: {
              overflowX: 'auto',
              overflowY: 'auto',
              clientWidth: 192,
              clientHeight: 152,
              scrollWidth: 192,
              scrollHeight: 152,
              clip: { left: 104, top: 84, right: 296, bottom: 236 },
            },
            target: {
              selector: '#target',
              matches: 1,
              rect: { x: 154, y: 134, width: 80, height: 50 },
              fullyContained: true,
            },
          });

          // Act: the box midpoint lands on target, while its left edge crosses
          // the target's no-scroll clipping ancestor. All input is native CDP.
          const annotation = await drawT010WithNativePointer(
            harness,
            'box',
            { x: 80, y: 100 },
            { x: 240, y: 200 },
          );
          const live = await evaluate(harness.page, `(async () => {
            const geometry = await import('/review/geometry.mjs');
            const state = window.__review.getState();
            const annotation = state.annotations.find(
              item => item.id === ${JSON.stringify(annotation.id)}
            );
            const groups = [...document.querySelectorAll(
              '[data-annotation="${annotation.id}"]'
            )];
            const group = groups[0] ?? null;
            const clipReference = group?.getAttribute('clip-path') ?? null;
            const clipId = /^url\\(#(.+)\\)$/.exec(clipReference ?? '')?.[1] ?? null;
            const clipRect = clipId && document.getElementById(clipId)?.querySelector('rect');
            const anchorClip = ${JSON.stringify(sourceGeometry.port.clip)};
            const viewportClip = geometry.paintClip(state.view.viewport);
            return {
              annotation,
              annotationCount: state.annotations.length,
              selectedId: state.selectedId,
              bounds: geometry.bounds(annotation),
              predicates: {
                clipHidesAnchor: geometry.clipHidesAnchor(annotation.element.rect, anchorClip),
                insideAnchorClip: geometry.insideClip(annotation, anchorClip),
                insideViewport: geometry.insideClip(annotation, viewportClip),
              },
              dom: {
                groupCount: groups.length,
                shapeCount: group
                  ? [...group.children].filter(node => node.tagName.toLowerCase() === 'rect').length
                  : 0,
                clipPath: clipReference,
                clipRegion: clipRect ? {
                  x: Number(clipRect.getAttribute('x')),
                  y: Number(clipRect.getAttribute('y')),
                  width: Number(clipRect.getAttribute('width')),
                  height: Number(clipRect.getAttribute('height')),
                } : null,
              },
              viewport: state.view.viewport,
              stale: state.stale,
              editable: state.editable,
              error: state.error,
            };
          })()`);

          // Assert the record, paint group, and region independently. A clip
          // definition cannot stand in for deleted marker paint, and a group
          // cannot stand in for an annotation that was never committed.
          assert.equal(live.annotationCount, 1, 'the native gesture committed exactly one annotation');
          assert.equal(live.annotation.id, annotation.id);
          assert.equal(live.selectedId, annotation.id);
          assert.equal(live.annotation.tool, 'box');
          assert.equal(live.annotation.element.selector, '#target');
          assert.equal(live.bounds.x < sourceGeometry.port.clip.left, true,
            'the marker genuinely crosses the ancestor clip');
          assert.deepEqual(live.dom, {
            groupCount: 1,
            shapeCount: 1,
            clipPath: `url(#dude-review-clip-${annotation.id})`,
            clipRegion: { x: 0, y: 0, width: 480, height: 360 },
          });
          assert.deepEqual(live.predicates, {
            clipHidesAnchor: false,
            insideAnchorClip: false,
            insideViewport: true,
          });
          assert.equal(live.stale, false);
          assert.equal(live.editable, true);
          assert.equal(live.error, null);

          const liveScreenshot = evidence.image(
            'fully-visible-anchor-live.png',
            await harness.screenshot(),
          );
          const captureReceipt = profileOwnership.receipt();
          const seal = await harness.command({ type: 'seal' }, 45_000);
          assert.equal(seal.status, 'sealed');
          assert.equal(
            profileOwnership.createdSince(captureReceipt).length,
            1,
            'a successful seal performs exactly one owned fresh capture',
          );
          profileOwnership.assertReapedSince(
            captureReceipt,
            'the fully-visible-anchor capture reaps its exact browser profile',
          );
          const files = fs.readdirSync(harness.reviewDirectory).sort();
          assert.deepEqual(files, [
            'annotated.png',
            'provenance.json',
            'report.md',
            'working.json',
          ]);
          const image = fs.readFileSync(path.join(harness.reviewDirectory, 'annotated.png'));
          const provenance = JSON.parse(fs.readFileSync(
            path.join(harness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
          const decoded = decodePng(image);
          let outsideAncestorStrokePixels = 0;
          for (let y = 95; y <= 205; y += 1) {
            for (let x = 76; x <= 84; x += 1) {
              const pixel = decodedPixel(decoded, x, y);
              if (pixel[0] > 120
                && pixel[0] - pixel[1] > 40
                && pixel[0] - pixel[2] > 40) outsideAncestorStrokePixels += 1;
            }
          }
          assert.ok(
            outsideAncestorStrokePixels >= 100,
            `the delivered box must paint across the ancestor edge: ${outsideAncestorStrokePixels}`,
          );
          assert.deepEqual(
            provenance.capture.selectors.map(({ annotationId, selector }) => ({
              annotationId,
              selector,
            })),
            [{ annotationId: annotation.id, selector: '#target' }],
          );
          const capturedImage = evidence.image('fully-visible-anchor-annotated.png', image);
          evidence.json('fully-visible-anchor-result.json', {
            case: context.name,
            expected: 'A marker crossing a no-scroll clipping ancestor paints and seals against the reviewed viewport because the ancestor hides none of its anchor.',
            browser: harness.browser.info.Browser,
            sourceGeometry,
            live,
            seal,
            capture: provenance.capture,
            outsideAncestorStrokePixels,
            files,
            screenshots: { live: liveScreenshot, annotated: capturedImage },
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 viewport overhang: a retained annotation refuses before downstream seal', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 viewport-overhang regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-viewport-overhang');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;background:#edf4fa;color:#102a43}',
          '*{box-sizing:border-box}',
          '#target{position:absolute;left:350px;top:120px;width:80px;height:70px}',
          '</style>',
          '<button id="target">Viewport target</button>',
        ].join('');
        let harness;
        try {
          // Arrange + Act: admit a fully contained native box whose midpoint
          // anchors to a wholly visible target, then edit the retained record
          // so its two-pixel paint envelope extends one pixel beyond the
          // viewport. New-candidate admission and saved-edit recovery are
          // intentionally different contracts.
          harness = await createT010ReviewHarness(context, {
            number: '764',
            slug: 'viewport-overhang',
            html,
            width: 480,
            height: 360,
            theme: 'light',
            profileOwnership,
          });
          const annotation = await drawT010WithNativePointer(
            harness,
            'box',
            { x: 300, y: 100 },
            { x: 470, y: 200 },
          );
          await harness.command({
            type: 'edit',
            id: annotation.id,
            changes: { x2: 479 },
          });
          const live = await evaluate(harness.page, `(async () => {
            const geometry = await import('/review/geometry.mjs');
            const state = window.__review.getState();
            const annotation = state.annotations.find(
              item => item.id === ${JSON.stringify(annotation.id)}
            );
            const groups = [...document.querySelectorAll(
              '[data-annotation="${annotation.id}"]'
            )];
            const clipIds = [...document.querySelectorAll('clipPath')]
              .map(node => node.id)
              .filter(id => id === ${JSON.stringify(`dude-review-clip-${annotation.id}`)});
            const viewportClip = geometry.paintClip(state.view.viewport);
            return {
              annotation,
              annotationCount: state.annotations.length,
              selectedId: state.selectedId,
              bounds: geometry.bounds(annotation),
              predicates: {
                clipHidesAnchor: geometry.clipHidesAnchor(
                  annotation.element.rect,
                  viewportClip
                ),
                insideViewport: geometry.insideClip(annotation, viewportClip),
              },
              dom: { groupCount: groups.length, clipRegionCount: clipIds.length },
              viewport: state.view.viewport,
              stale: state.stale,
              editable: state.editable,
              status: state.status,
              error: state.error,
            };
          })()`);
          assert.equal(live.annotationCount, 1, 'the overhang guard owns one real annotation');
          assert.equal(live.annotation.id, annotation.id);
          assert.equal(live.annotation.tool, 'box');
          assert.equal(live.annotation.element.selector, '#target');
          assert.equal(live.bounds.x + live.bounds.width > 478, true);
          assert.deepEqual(live.predicates, {
            clipHidesAnchor: false,
            insideViewport: false,
          });
          // Record current paint behavior in evidence, but do not make it a
          // permanent policy oracle: the coordinator still owns whether a
          // future unsendable viewport overhang may paint cropped.
          assert.equal(live.stale, false);
          assert.equal(live.editable, true);
          assert.equal(live.status, 'editing');
          assert.equal(live.error, null);

          const saved = await harness.command({ type: 'save' });
          assert.equal(saved.status, 'saved');
          const workingPath = path.join(harness.reviewDirectory, 'working.json');
          const beforeSeal = fs.readFileSync(workingPath);
          const captureReceipt = profileOwnership.receipt();
          const sealRequests = () => harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/seal'
          )).length;
          const sealRequestsBefore = sealRequests();
          let refusal;
          try {
            refusal = { ok: true, result: await harness.command({ type: 'seal' }, 45_000) };
          } catch (error) {
            refusal = {
              ok: false,
              code: error.code ?? null,
              message: error.message,
            };
          }
          const after = await evaluate(harness.page, `(() => {
            const state = window.__review.getState();
            return {
              annotationPresent: state.annotations.some(
                item => item.id === ${JSON.stringify(annotation.id)}
              ),
              stale: state.stale,
              editable: state.editable,
              status: state.status,
              error: state.error,
            };
          })()`);
          const afterSeal = fs.readFileSync(workingPath);
          const files = fs.readdirSync(harness.reviewDirectory).sort();
          const waiter = harness.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === harness.record.requestHandle,
          );

          // Assert the current pre-downstream refusal without prescribing a
          // future paint policy for unsendable viewport overhangs.
          assert.equal(refusal.ok, false);
          assert.match(refusal.message, /inside the reviewed viewport/i);
          assert.deepEqual(after, {
            annotationPresent: true,
            stale: false,
            editable: true,
            status: 'editing',
            error: {
              code: 'review_outside_viewport',
              message: 'Keep all annotations inside the reviewed viewport before sending.',
            },
          });
          assert.deepEqual(
            profileOwnership.createdSince(captureReceipt),
            [],
            'the engine hidden set refuses before any capture process is allocated',
          );
          assert.equal(
            sealRequests(),
            sealRequestsBefore,
            'the engine hidden set refuses before any seal request reaches downstream guards',
          );
          assert.deepEqual(files, ['working.json']);
          assert.equal(afterSeal.equals(beforeSeal), true);
          assert.equal(waiter.phase, 'pending');
          evidence.json('viewport-overhang-result.json', {
            case: context.name,
            expected: 'A box whose paint envelope exceeds the reviewed viewport is hidden and the same engine hidden set refuses sealing before fresh capture.',
            browser: harness.browser.info.Browser,
            live,
            refusal,
            after,
            captureProfilesCreated: profileOwnership.createdSince(captureReceipt),
            sealRequests: { before: sealRequestsBefore, after: sealRequests() },
            files,
            workingUnchanged: afterSeal.equals(beforeSeal),
            waiterPhase: waiter.phase,
            screenshot: evidence.image(
              'viewport-overhang-hidden.png',
              await harness.screenshot(),
            ),
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 nested-scroll state: edits, clipping, restore, and capture retain original semantics', {
        timeout: 180_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 nested state regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-nested-state-regression');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui;background:#edf4fa;color:#102a43}',
          '*{box-sizing:border-box} #main,#independent{scrollbar-width:none}',
          '#main::-webkit-scrollbar,#independent::-webkit-scrollbar{display:none}',
          '#main{position:absolute;left:40px;top:40px;width:500px;height:300px;overflow:auto;background:#d9eaf7}',
          '#main-content{position:relative;width:480px;height:676px}',
          '#target{position:absolute;left:200px;top:500px;width:238px;height:30px}',
          '#independent{position:absolute;left:620px;top:40px;width:240px;height:180px;overflow:auto;background:#dbe7ef}',
          '#side-content{position:relative;height:500px}',
          '#side-band{position:absolute;left:0;right:0;top:150px;height:40px;background:rgb(0,170,85)}',
          '</style>',
          '<main id="main"><div id="main-content"><button id="target">Open</button></div></main>',
          '<aside id="independent"><div id="side-content"><div id="side-band"></div></div></aside>',
        ].join('');
        let harness;
        try {
          // Arrange: both real scrollports begin at zero in a disposable exact
          // owner, then native source scroll events establish MAIN 376 and an
          // independent port at 143 before the target is admitted.
          harness = await createT010ReviewHarness(context, {
            number: '758',
            slug: 'nested-scroll-state',
            html,
            width: 908,
            height: 586,
            theme: 'light',
            deviceScale: 2,
            profileOwnership,
          });
          let source = await attachT010SourceFrame(harness);
          const sourceSnapshot = () => source.evaluate(`(() => {
            const target = document.querySelector('#target');
            const rect = target.getBoundingClientRect();
            return {
              main: {
                scrollTop: document.querySelector('#main').scrollTop,
                max: document.querySelector('#main').scrollHeight
                  - document.querySelector('#main').clientHeight,
              },
              independent: {
                scrollTop: document.querySelector('#independent').scrollTop,
                max: document.querySelector('#independent').scrollHeight
                  - document.querySelector('#independent').clientHeight,
              },
              target: {
                sameNode: globalThis.__t012Target
                  ? target === globalThis.__t012Target
                  : null,
                matches: document.querySelectorAll('#target').length,
                text: target.textContent,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              },
            };
          })()`);
          const setPorts = (main, independent) => source.evaluate(`new Promise(resolve => {
            document.querySelector('#main').scrollTo({left:0,top:${main},behavior:'instant'});
            document.querySelector('#independent').scrollTo({left:0,top:${independent},behavior:'instant'});
            requestAnimationFrame(() => requestAnimationFrame(() => resolve({
              main: document.querySelector('#main').scrollTop,
              independent: document.querySelector('#independent').scrollTop,
            })));
          })`);
          const engineAt = (main, independent) => until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            const bySelector = Object.fromEntries(
              (state.view.scrolls ?? []).map(scroll => [scroll.selector, scroll]),
            );
            return !state.busy
              && bySelector['#main']?.scrollTop === main
              && bySelector['#independent']?.scrollTop === independent
              ? state
              : null;
          }, `engine adopts MAIN ${main} and independent ${independent}`, 15_000);
          const markerSnapshot = id => evaluate(harness.page, `(() => {
            const state = window.__review.getState();
            const annotation = state.annotations.find(entry => entry.id === ${JSON.stringify(id)});
            const group = document.querySelector('[data-annotation="${id}"]');
            const circle = group?.querySelector('circle');
            const rect = circle?.getBoundingClientRect();
            return {
              annotation,
              exists: Boolean(circle),
              screen: circle ? {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
              } : null,
              state: {
                stale: state.stale,
                editable: state.editable,
                error: state.error,
                tool: state.tool,
                selectedId: state.selectedId,
                caret: state.caret,
                scrolls: state.view.scrolls,
                annotations: state.annotations,
              },
            };
          })()`);
          await source.evaluate("globalThis.__t012Target=document.querySelector('#target'); true");
          assert.deepEqual(await setPorts(376, 143), { main: 376, independent: 143 });
          const initialView = await engineAt(376, 143);
          const initialSource = await sourceSnapshot();
          assert.deepEqual(
            {
              main: initialSource.main,
              independent: initialSource.independent,
              target: initialSource.target,
            },
            {
              main: { scrollTop: 376, max: 376 },
              independent: { scrollTop: 143, max: 320 },
              target: {
                sameNode: true,
                matches: 1,
                text: 'Open',
                rect: { x: 240, y: 164, width: 238, height: 30 },
              },
            },
          );
          assert.deepEqual(initialView.view.scrolls, [
            { selector: '#main', scrollLeft: 0, scrollTop: 376 },
            { selector: '#independent', scrollLeft: 0, scrollTop: 143 },
          ]);

          await harness.command({ type: 'element', selector: '#target' });
          const commentId = await harness.command({ type: 'addComment' });
          await harness.command({
            type: 'edit',
            id: commentId,
            changes: { comment: 'Keep the original target and custom offset.' },
          });
          await harness.command({ type: 'tool', tool: 'box' });
          const freeId = await harness.command({ type: 'addAtCenter' });
          await harness.command({
            type: 'edit',
            id: freeId,
            changes: { x1: 620, y1: 300, x2: 800, y2: 350 },
          });
          await harness.command({ type: 'tool', tool: 'select' });
          await harness.command({ type: 'select', id: commentId });
          await harness.command({
            type: 'caret',
            caret: { id: commentId, field: 'comment', start: 2, end: 7, direction: 'backward' },
          });
          await harness.command({ type: 'save' });
          const createdWorking = harness.readWorking();
          const createdComment = createdWorking.state.annotations.find(({ id }) => id === commentId);
          const createdFree = createdWorking.state.annotations.find(({ id }) => id === freeId);
          assert.deepEqual(
            {
              point: { x: createdComment.x1, y: createdComment.y1 },
              basis: createdComment.scrollBasis,
              targetRect: createdComment.element.rect,
              free: {
                x1: createdFree.x1,
                y1: createdFree.y1,
                x2: createdFree.x2,
                y2: createdFree.y2,
                element: createdFree.element,
              },
            },
            {
              point: { x: 256, y: 179 },
              basis: [{ selector: '#main', scrollLeft: 0, scrollTop: 376 }],
              targetRect: { x: 240, y: 164, width: 238, height: 30 },
              free: { x1: 620, y1: 300, x2: 800, y2: 350, element: null },
            },
          );

          // Act: an external scroll projects current coordinates. Numeric and
          // pointer edits inverse-map into the creation basis; a later scroll is
          // not an undo step, and Escape plus autosave cannot persist a preview.
          assert.deepEqual(await setPorts(250, 143), { main: 250, independent: 143 });
          const at250 = await engineAt(250, 143);
          assert.deepEqual(
            at250.annotations.find(({ id }) => id === freeId),
            { ...createdFree },
            'an independent free drawing does not follow an element scroll ancestor',
          );
          const projectedAt250 = at250.annotations.find(({ id }) => id === commentId);
          assert.deepEqual(
            { x: projectedAt250.x1, y: projectedAt250.y1 },
            { x: 256, y: 305 },
          );
          await harness.command({
            type: 'edit',
            id: commentId,
            changes: { x1: 266, y1: 313, x2: 266, y2: 313 },
          });
          let current = await markerSnapshot(commentId);
          assert.deepEqual(
            { x: current.annotation.x1, y: current.annotation.y1 },
            { x: 266, y: 313 },
          );
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: current.screen.x,
            y: current.screen.y,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: current.screen.x + 14,
            y: current.screen.y + 9,
            button: 'left',
            buttons: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: current.screen.x + 14,
            y: current.screen.y + 9,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          });
          current = await until(async () => {
            const snapshot = await markerSnapshot(commentId);
            return !snapshot.state.error
              && snapshot.annotation.x1 === 280
              && snapshot.annotation.y1 === 322
              ? snapshot
              : null;
          }, 'pointer edit is committed in projected coordinates');

          assert.deepEqual(await setPorts(230, 143), { main: 230, independent: 143 });
          await engineAt(230, 143);
          const afterUndo = await harness.command({ type: 'undo' });
          assert.equal(
            afterUndo.view.scrolls.find(({ selector }) => selector === '#main').scrollTop,
            230,
            'undo does not consume or reverse the external scroll',
          );
          assert.deepEqual(
            {
              x: afterUndo.annotations.find(({ id }) => id === commentId).x1,
              y: afterUndo.annotations.find(({ id }) => id === commentId).y1,
            },
            { x: 266, y: 333 },
            'undo reaches the numeric edit before the pointer edit',
          );
          const afterRedo = await harness.command({ type: 'redo' });
          assert.deepEqual(
            {
              x: afterRedo.annotations.find(({ id }) => id === commentId).x1,
              y: afterRedo.annotations.find(({ id }) => id === commentId).y1,
            },
            { x: 280, y: 342 },
          );

          // MAIN 230 puts the correctly projected marker below its client clip
          // (40..340), so it cannot be a native pointer target. Move the real
          // port back to 250 before exercising cancel/autosave; this changes
          // only the current projection and leaves the stored basis untouched.
          assert.deepEqual(await setPorts(250, 143), { main: 250, independent: 143 });
          await engineAt(250, 143);
          const cancelStart = await markerSnapshot(commentId);
          assert.equal(cancelStart.exists, true);
          assert.deepEqual(
            { x: cancelStart.annotation.x1, y: cancelStart.annotation.y1 },
            { x: 280, y: 322 },
          );

          const saveRequests = () => harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          const savesBeforeCancel = saveRequests();
          await harness.command({ type: 'notes', text: 'Autosave keeps the committed projected edit.' });
          current = await markerSnapshot(commentId);
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: current.screen.x,
            y: current.screen.y,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: current.screen.x + 30,
            y: current.screen.y + 20,
            button: 'left',
            buttons: 1,
          });
          await until(async () => {
            const snapshot = await markerSnapshot(commentId);
            return snapshot.annotation.x1 === 310 && snapshot.annotation.y1 === 342;
          }, 'cancelled projected pointer preview');
          await key(harness.page, 'Escape', 'Escape');
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: current.screen.x + 30,
            y: current.screen.y + 20,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          });
          const afterCancel = await until(async () => {
            const snapshot = await markerSnapshot(commentId);
            const persisted = harness.readWorking();
            const stored = persisted.state.annotations.find(({ id }) => id === commentId);
            return saveRequests() > savesBeforeCancel
              && snapshot.annotation.x1 === 280
              && snapshot.annotation.y1 === 322
              && stored.x1 === 280
              && stored.y1 === 196
              && persisted.state.notes === 'Autosave keeps the committed projected edit.'
              ? { snapshot, persisted }
              : null;
          }, 'autosave persists committed inverse coordinates after Escape', 8_000);
          assert.equal(afterCancel.snapshot.state.tool, 'select');
          assert.equal(afterCancel.snapshot.state.selectedId, commentId);
          assert.deepEqual(afterCancel.snapshot.state.caret, {
            id: commentId,
            field: 'comment',
            start: 2,
            end: 7,
            direction: 'backward',
          });

          // The same connected, unique target can be clipped by its port without
          // becoming stale. The marker hides, Send refuses non-consumingly, and
          // the same annotation ID returns when the target re-enters.
          assert.deepEqual(await setPorts(0, 143), { main: 0, independent: 143 });
          const offscreenState = await engineAt(0, 143);
          const offscreen = await markerSnapshot(commentId);
          assert.equal(offscreen.exists, false);
          assert.equal(offscreen.state.stale, false);
          assert.equal(offscreen.state.editable, true);
          assert.equal(offscreenState.annotations.some(({ id }) => id === commentId), true);
          await assert.rejects(
            harness.command({ type: 'seal' }, 45_000),
            /inside the reviewed viewport/i,
          );
          const refused = await markerSnapshot(commentId);
          assert.equal(refused.state.stale, false);
          assert.equal(refused.state.editable, true);
          assert.equal(refused.state.error.code, 'review_outside_viewport');
          assert.deepEqual(fs.readdirSync(harness.reviewDirectory), ['working.json']);
          assert.equal(
            (await evaluate(harness.page, 'window.__reviewMessages')).some(message => (
              message.code === 'review_anchor_invalid'
            )),
            false,
            'clipping does not emit the missing-or-ambiguous anchor warning',
          );
          assert.deepEqual(await setPorts(376, 143), { main: 376, independent: 143 });
          await engineAt(376, 143);
          const returned = await until(async () => {
            const snapshot = await markerSnapshot(commentId);
            return snapshot.exists && !snapshot.state.stale ? snapshot : null;
          }, 'the clipped annotation returns with its original ID');
          assert.equal(returned.annotation.id, commentId);

          // Back/inactive restores every port, including the unrelated one.
          const retainedScrolls = returned.state.scrolls;
          await evaluate(harness.page, 'window.__review.update({active:false})');
          assert.deepEqual(await source.evaluate(`(() => {
            const main = document.querySelector('#main');
            const independent = document.querySelector('#independent');
            main.scrollTop = 0;
            independent.scrollTop = 0;
            return {main:main.scrollTop,independent:independent.scrollTop};
          })()`), { main: 0, independent: 0 });
          await evaluate(harness.page, 'window.__review.update({active:true})');
          const resumed = await engineAt(376, 143);
          assert.deepEqual(resumed.view.scrolls, retainedScrolls);
          assert.deepEqual(
            {
              main: (await sourceSnapshot()).main.scrollTop,
              independent: (await sourceSnapshot()).independent.scrollTop,
            },
            { main: 376, independent: 143 },
          );

          // Reopen remounts a fresh source frame at zero, then restores both
          // offsets from the original working state before allowing capture.
          await harness.command({ type: 'save' });
          const persistedBeforeReopen = harness.readWorking();
          const reopen = await harness.postJson('/api/needs-you/review/open', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
          });
          assert.equal(reopen.response.status, 202);
          assert.deepEqual(reopen.payload.working, persistedBeforeReopen.state);
          await harness.mount(reopen.payload);
          source = await attachT010SourceFrame(harness);
          const reopened = await engineAt(376, 143);
          const reopenedSource = await sourceSnapshot();
          assert.deepEqual(
            {
              main: reopenedSource.main.scrollTop,
              independent: reopenedSource.independent.scrollTop,
              commentId: reopened.annotations.find(({ id }) => id === commentId)?.id,
              free: reopened.annotations.find(({ id }) => id === freeId),
              caret: reopened.caret,
              tool: reopened.tool,
            },
            {
              main: 376,
              independent: 143,
              commentId,
              free: createdFree,
              caret: {
                id: commentId,
                field: 'comment',
                start: 2,
                end: 7,
                direction: 'backward',
              },
              tool: 'select',
            },
          );

          const seal = await harness.command({ type: 'seal' }, 45_000);
          assert.equal(seal.status, 'sealed');
          const working = harness.readWorking();
          const provenance = JSON.parse(fs.readFileSync(
            path.join(harness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          const report = fs.readFileSync(path.join(harness.reviewDirectory, 'report.md'));
          const image = fs.readFileSync(path.join(harness.reviewDirectory, 'annotated.png'));
          const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
          const decoded = decodePng(image);
          const near = (pixel, expected, tolerance = 8) => pixel.slice(0, 3)
            .every((channel, index) => Math.abs(channel - expected[index]) <= tolerance);
          const stroke = working.state.palette.stroke.match(/[a-f0-9]{2}/gi)
            .map(value => Number.parseInt(value, 16));
          const storedComment = working.state.annotations.find(({ id }) => id === commentId);
          const sealedCurrent = reopened.annotations.find(({ id }) => id === commentId);
          let painted = false;
          const markerPoint = {
            x: Math.round((sealedCurrent.x1 + 11) * 2),
            y: Math.round(sealedCurrent.y1 * 2),
          };
          for (let y = markerPoint.y - 7; y <= markerPoint.y + 7 && !painted; y += 1) {
            for (let x = markerPoint.x - 7; x <= markerPoint.x + 7; x += 1) {
              if (near(decodedPixel(decoded, x, y), stroke, 35)) {
                painted = true;
                break;
              }
            }
          }

          // Assert the fresh-capture boundary, not merely the live overlay.
          assert.deepEqual(storedComment.scrollBasis, [
            { selector: '#main', scrollLeft: 0, scrollTop: 376 },
          ]);
          assert.deepEqual(
            { x: storedComment.x1, y: storedComment.y1 },
            { x: 280, y: 196 },
          );
          assert.deepEqual(working.state.view.scrolls, [
            { selector: '#main', scrollLeft: 0, scrollTop: 376 },
            { selector: '#independent', scrollLeft: 0, scrollTop: 143 },
          ]);
          assert.deepEqual(provenance.capture.scrolls, working.state.view.scrolls);
          assert.equal(painted, true, 'fresh PNG paints the current comment coordinates');
          assert.equal(
            near(decodedPixel(decoded, 650 * 2, 60 * 2), [0, 170, 85]),
            true,
            'fresh PNG restores and captures the independent port at scrollTop 143',
          );
          assert.match(report.toString('utf8'), /Viewed nested scroll containers:/);
          assert.match(report.toString('utf8'), /"selector": "#independent"[\s\S]*"scrollTop": 143/);
          assert.match(report.toString('utf8'), /Original annotation geometry: at \(280, 196\)\./);
          const screenshot = evidence.image('nested-state-sealed.png', await harness.screenshot());
          evidence.json('nested-state-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            sourceTarget: { type: source.target.type, url: source.target.url },
            original: {
              coordinates: { x: storedComment.x1, y: storedComment.y1 },
              element: storedComment.element,
              scrollBasis: storedComment.scrollBasis,
            },
            current: {
              coordinates: { x: sealedCurrent.x1, y: sealedCurrent.y1 },
              viewScrolls: working.state.view.scrolls,
            },
            editing: {
              numericAtMain250: { x: 266, y: 313 },
              pointerAtMain250: { x: 280, y: 322 },
              undoAtMain230: { x: 266, y: 333 },
              redoAtMain230: { x: 280, y: 342 },
              cancelStartAtMain250: { x: 280, y: 322 },
              autosavedOriginal: { x: 280, y: 196 },
              caret: working.state.caret,
              tool: working.state.tool,
            },
            clipping: {
              hiddenWithoutStale: !offscreen.exists && !offscreen.state.stale,
              refusal: refused.state.error,
              returnedId: returned.annotation.id,
            },
            restore: {
              inactive: resumed.view.scrolls,
              reopened: reopened.view.scrolls,
            },
            capture: provenance.capture,
            image: evidence.image('nested-state-annotated.png', image),
            imageSha256: sha256(image),
            reportSha256: sha256(report),
            pixelOracle: {
              commentPainted: painted,
              independentBandCss: { x: 650, y: 60 },
              independentBandPixel: decodedPixel(decoded, 650 * 2, 60 * 2),
            },
            screenshot,
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 nested-scroll refusals: inspector identity and complete port restore fail closed', {
        timeout: 120_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 nested refusal regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-nested-refusals');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui}',
          '#main{box-sizing:border-box;position:absolute;left:30px;top:30px;width:480px;height:280px;overflow:auto}',
          '#main::-webkit-scrollbar{width:16px;height:16px}',
          '#content{position:relative;width:440px;height:656px}',
          '#target{position:absolute;left:180px;top:480px;width:220px;height:32px}',
          '#independent{position:absolute;left:560px;top:30px;width:240px;height:180px;overflow:auto}',
          '#independent>div{height:500px}',
          '</style>',
          '<main id="main"><div id="content"><button id="target">Unchanged target</button></div></main>',
          '<aside id="independent"><div></div></aside>',
        ].join('');
        let harness;
        try {
          // Arrange: use the production inspector in the actual opaque source
          // document. The independent port is intentionally zero yet must still
          // be present in the ordered view snapshot.
          harness = await createT010ReviewHarness(context, {
            number: '759',
            slug: 'nested-scroll-refusals',
            html,
            width: 840,
            height: 420,
            profileOwnership,
          });
          let source = await attachT010SourceFrame(harness);
          await source.evaluate(`import('/review/inspector.mjs').then(module => {
            globalThis.__t012Inspector = module.createInspector(document, window);
            return true;
          })`);
          await source.evaluate(`new Promise(resolve => {
            document.querySelector('#main').scrollTop = 100;
            document.querySelector('#independent').scrollTop = 0;
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          })`);
          let fullView = await source.evaluate('globalThis.__t012Inspector.readView()');
          let retainedView = {
            viewport: fullView.viewport,
            signature: fullView.signature,
            scrolls: fullView.scrolls,
          };
          assert.deepEqual(fullView.scrolls, [
            { selector: '#main', scrollLeft: 0, scrollTop: 100 },
            { selector: '#independent', scrollLeft: 0, scrollTop: 0 },
          ]);

          // Client geometry is private current-view evidence. Change only the
          // live scrollbar width: source bytes, outer bounds, captured computed
          // styles, target identity, and scroll offsets remain unchanged while
          // the effective clip narrows. The full signature must notice it.
          const clipSignatureSnapshot = () => source.evaluate(`(async () => {
            const view = await globalThis.__t012Inspector.readView();
            const target = globalThis.__t012Inspector.describeSelector('#target');
            const port = document.querySelector('#main');
            const rect = port.getBoundingClientRect();
            const style = getComputedStyle(port);
            const styleKeys = [
              'color','background-color','background-image','font-family','font-size',
              'font-weight','line-height','letter-spacing','text-align','display',
              'position','width','height','margin','padding','gap','border',
              'border-radius','opacity','transform','visibility','overflow',
              'clip-path','filter','box-shadow'
            ];
            return {
              view,
              target,
              port: {
                rect: {x:rect.x,y:rect.y,width:rect.width,height:rect.height},
                client: {
                  left:port.clientLeft,top:port.clientTop,
                  width:port.clientWidth,height:port.clientHeight
                },
                styles: Object.fromEntries(styleKeys.map(key => [
                  key, style.getPropertyValue(key)
                ])),
              },
            };
          })()`);
          const sourceRevision = () => harness.workspace.revision(fs.readFileSync(path.join(
            harness.workspace.root,
            ...harness.feature.artifactPath.split('/'),
          )));
          const clipBefore = await clipSignatureSnapshot();
          assert.equal(clipBefore.view.signature, fullView.signature);
          assert.equal(sourceRevision(), harness.feature.preview.artifact.revision);
          await source.evaluate(`new Promise((resolve, reject) => {
            const rule = [...document.styleSheets[0].cssRules].find(entry =>
              entry.selectorText === '#main::-webkit-scrollbar');
            if (!rule) {
              reject(new Error('scrollbar fixture rule missing'));
              return;
            }
            rule.style.width = '32px';
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          })`);
          const clipNarrowed = await clipSignatureSnapshot();
          assert.equal(sourceRevision(), harness.feature.preview.artifact.revision);
          assert.deepEqual(clipNarrowed.target.element, clipBefore.target.element);
          assert.deepEqual(clipNarrowed.target.scrollBasis, clipBefore.target.scrollBasis);
          assert.equal(clipNarrowed.target.visible, clipBefore.target.visible);
          assert.deepEqual(clipNarrowed.port.rect, clipBefore.port.rect);
          assert.deepEqual(clipNarrowed.port.styles, clipBefore.port.styles);
          assert.equal(
            clipNarrowed.port.client.width < clipBefore.port.client.width,
            true,
            'the real scrollbar consumes more client width without changing the outer box',
          );
          assert.deepEqual(
            {
              left: clipNarrowed.target.clip.left,
              top: clipNarrowed.target.clip.top,
              bottom: clipNarrowed.target.clip.bottom,
            },
            {
              left: clipBefore.target.clip.left,
              top: clipBefore.target.clip.top,
              bottom: clipBefore.target.clip.bottom,
            },
          );
          assert.equal(
            clipNarrowed.target.clip.right < clipBefore.target.clip.right,
            true,
            'the effective native client clip narrows on the changed axis',
          );
          assert.deepEqual(
            {
              viewport: clipNarrowed.view.viewport,
              scrolls: clipNarrowed.view.scrolls,
              targets: clipNarrowed.view.targets,
            },
            {
              viewport: clipBefore.view.viewport,
              scrolls: clipBefore.view.scrolls,
              targets: clipBefore.view.targets,
            },
            'the public current view cannot explain the clip-only signature change',
          );
          assert.notEqual(
            clipNarrowed.view.signature,
            clipBefore.view.signature,
            'full current-view identity includes native client clip geometry',
          );
          await source.evaluate(`new Promise(resolve => {
            const rule = [...document.styleSheets[0].cssRules].find(entry =>
              entry.selectorText === '#main::-webkit-scrollbar');
            rule.style.width = '16px';
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          })`);
          const clipRestored = await clipSignatureSnapshot();
          assert.equal(clipRestored.view.signature, clipBefore.view.signature);
          assert.deepEqual(clipRestored.target, clipBefore.target);

          // Save a real engine view while the same file is narrowed only in the
          // live CSSOM. The narrowed host clip and wider canonical capture clip
          // both contain the target and pin, so version 2 accepts their equivalent
          // clipping effect without equating their renderer-local signatures.
          await source.evaluate(`new Promise((resolve, reject) => {
            const rule = [...document.styleSheets[0].cssRules].find(entry =>
              entry.selectorText === '#main::-webkit-scrollbar');
            if (!rule) {
              reject(new Error('scrollbar fixture rule missing'));
              return;
            }
            rule.style.width = '32px';
            document.querySelector('#main').scrollTop = 376;
            document.querySelector('#independent').scrollTop = 0;
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          })`);
          await harness.command({ type: 'scroll', x: 0, y: 0 });
          const narrowedEngine = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            const main = state.view.scrolls.find(({ selector }) => selector === '#main');
            return !state.busy && main?.scrollTop === 376 ? state : null;
          }, 'engine adopts the narrowed native client clip');
          await harness.command({ type: 'element', selector: '#target' });
          const clipCompatibleId = await harness.command({ type: 'addComment' });
          await harness.command({
            type: 'edit',
            id: clipCompatibleId,
            changes: { comment: 'Keep this fully contained target and pin.' },
          });
          const narrowedSaved = await harness.command({ type: 'save' });
          const clipCompatibleWorking = fs.readFileSync(path.join(
            harness.reviewDirectory,
            'working.json',
          ));
          const clipCompatibleProfileReceipt = profileOwnership.receipt();
          const clipCompatibleSeal = await harness.postJson('/api/needs-you/review/seal', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
            workingRevision: narrowedSaved.workingRevision,
          });
          assert.equal(
            clipCompatibleSeal.response.status,
            202,
            JSON.stringify(clipCompatibleSeal.payload),
          );
          const clipCompatibleProvenance = JSON.parse(fs.readFileSync(
            path.join(harness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          assert.equal(
            clipCompatibleProvenance.capture.beforeSignature,
            clipCompatibleProvenance.capture.afterSignature,
            'the fresh Chromium rendering remains stable within its renderer',
          );
          assert.notEqual(
            clipCompatibleProvenance.capture.beforeSignature,
            narrowedEngine.view.signature,
            'version 2 does not require the canonical and live clip signatures to match',
          );
          assert.equal(
            profileOwnership.createdSince(clipCompatibleProfileReceipt).length,
            1,
            'the effect-compatible clip comparison reaches one fresh native capture',
          );
          profileOwnership.assertReapedSince(
            clipCompatibleProfileReceipt,
            'the effect-compatible clip capture reaps its exact process-created profile',
          );
          assert.deepEqual(
            fs.readdirSync(harness.reviewDirectory).sort(),
            ['annotated.png', 'provenance.json', 'report.md', 'working.json'],
            'effect-compatible clip geometry creates complete immutable evidence',
          );
          assert.deepEqual(
            fs.readFileSync(path.join(harness.reviewDirectory, 'working.json')),
            clipCompatibleWorking,
            'sealing does not rewrite the saved working bytes',
          );
          assert.equal(
            harness.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === harness.record.requestHandle,
            ).phase,
            'pending',
          );

          // A sealed submission is immutable. Continue the independent restore
          // and node-identity refusals in a fresh disposable review rather than
          // deleting successful evidence or letting the seal mask later checks.
          await harness.close();
          harness = null;
          harness = await createT010ReviewHarness(context, {
            number: '759',
            slug: 'nested-scroll-refusals',
            html,
            width: 840,
            height: 420,
            profileOwnership,
          });
          source = await attachT010SourceFrame(harness);
          await source.evaluate(`import('/review/inspector.mjs').then(module => {
            globalThis.__t012Inspector = module.createInspector(document, window);
            return true;
          })`);
          await source.evaluate(`new Promise(resolve => {
            document.querySelector('#main').scrollTop = 100;
            document.querySelector('#independent').scrollTop = 0;
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          })`);
          fullView = await source.evaluate('globalThis.__t012Inspector.readView()');
          retainedView = {
            viewport: fullView.viewport,
            signature: fullView.signature,
            scrolls: fullView.scrolls,
          };
          assert.deepEqual(fullView.scrolls, [
            { selector: '#main', scrollLeft: 0, scrollTop: 100 },
            { selector: '#independent', scrollLeft: 0, scrollTop: 0 },
          ]);
          await harness.command({ type: 'scroll', x: 0, y: 0 });
          const resetState = await evaluate(harness.page, 'window.__review.getState()');
          assert.equal(resetState.view.signature, fullView.signature);
          assert.deepEqual(resetState.annotations, []);

          // Act + Assert: missing, extra, duplicate, malformed, and clamped
          // snapshots are all reachable restore inputs and none is accepted as
          // equivalent to the complete current DOM-ordered port set.
          const restoreCases = [
            {
              name: 'missing port',
              view: { ...retainedView, scrolls: retainedView.scrolls.slice(0, 1) },
              code: 'review_capture_mismatch',
            },
            {
              name: 'extra port',
              view: {
                ...retainedView,
                scrolls: [
                  ...retainedView.scrolls,
                  { selector: '#not-a-port', scrollLeft: 0, scrollTop: 0 },
                ],
              },
              code: 'review_capture_mismatch',
            },
            {
              name: 'duplicate port',
              view: {
                ...retainedView,
                scrolls: [retainedView.scrolls[0], retainedView.scrolls[0]],
              },
              code: 'review_invalid_input',
            },
            {
              name: 'extra record field',
              view: {
                ...retainedView,
                scrolls: [
                  { ...retainedView.scrolls[0], extra: true },
                  retainedView.scrolls[1],
                ],
              },
              code: 'review_invalid_input',
            },
            {
              name: 'nonfinite record',
              view: {
                ...retainedView,
                scrolls: [
                  { ...retainedView.scrolls[0], scrollTop: null },
                  retainedView.scrolls[1],
                ],
              },
              code: 'review_invalid_input',
            },
            {
              name: 'browser clamp',
              view: {
                ...retainedView,
                scrolls: [
                  { ...retainedView.scrolls[0], scrollTop: 999_999 },
                  retainedView.scrolls[1],
                ],
              },
              code: 'review_capture_mismatch',
            },
          ];
          const refusals = [];
          for (const fixture of restoreCases) {
            await assert.rejects(
              source.evaluate(
                `globalThis.__t012Inspector.restoreView(${JSON.stringify(fixture.view)})`,
              ),
              new RegExp(fixture.code),
              fixture.name,
            );
            refusals.push({ case: fixture.name, code: fixture.code });
            await source.evaluate(
              `globalThis.__t012Inspector.restoreView(${JSON.stringify(retainedView)})`,
            );
          }

          // The ordinary opaque-frame bridge accepts only its closed query and
          // notification shapes. Capture the already-established geometry
          // channel from a real engine query, then prove extra fields do not
          // generate a reply or a false scroll refresh.
          await source.evaluate(`(() => {
            globalThis.__t012BridgeChannel = null;
            addEventListener('message', event => {
              if (event.data?.type === 'dude-review-query') {
                globalThis.__t012BridgeChannel = event.data.channel;
              }
            });
          })()`);
          await harness.command({ type: 'scroll', x: 0, y: 0 });
          const bridgeChannel = await until(
            () => source.evaluate('globalThis.__t012BridgeChannel'),
            'source observes one real closed bridge query',
          );
          const malformedReplyCount = await evaluate(harness.page, `new Promise(resolve => {
            const replies = [];
            const listener = event => {
              if (event.data?.type === 'dude-review-result'
                && [900001, 900002].includes(event.data.id)) {
                replies.push(event.data);
              }
            };
            addEventListener('message', listener);
            document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
              type:'dude-review-query',
              channel:${JSON.stringify(bridgeChannel)},
              id:900001,
              op:'view',
              extra:true,
            }, '*');
            document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
              type:'dude-review-query',
              channel:${JSON.stringify(bridgeChannel)},
              id:900002,
              op:'scroll',
              point:{x:10,y:10},
              delta:{x:-1000001,y:0},
            }, '*');
            requestAnimationFrame(() => requestAnimationFrame(() => {
              removeEventListener('message', listener);
              resolve(replies.length);
            }));
          })`);
          assert.equal(malformedReplyCount, 0);
          const changesBeforeMalformedNotify = await evaluate(
            harness.page,
            'window.__reviewChanges.length',
          );
          await source.evaluate(`parent.postMessage({
            type:'dude-review-scrolled',
            channel:${JSON.stringify(bridgeChannel)},
            extra:true,
          }, '*')`);
          await settleBrowserWork(harness.page);
          assert.equal(
            await evaluate(harness.page, 'window.__reviewChanges.length'),
            changesBeforeMalformedNotify,
            'an extra-field scroll notification is ignored',
          );

          // One inspector lifetime pins both the node and every ancestor object,
          // not merely an equivalent selector/text/style/rect description.
          const initial = await source.evaluate(
            "globalThis.__t012Inspector.describeSelector('#target')",
          );
          await source.evaluate(`(() => {
            const original = document.querySelector('#target');
            globalThis.__t012OriginalTarget = original;
            original.replaceWith(original.cloneNode(true));
          })()`);
          await assert.rejects(
            source.evaluate("globalThis.__t012Inspector.describeSelector('#target')"),
            /review_anchor_invalid/,
            'an identical replacement node is not silently retargeted',
          );
          await source.evaluate(`(() => {
            document.querySelector('#target').replaceWith(globalThis.__t012OriginalTarget);
          })()`);
          assert.deepEqual(
            await source.evaluate("globalThis.__t012Inspector.describeSelector('#target')"),
            initial,
          );
          await source.evaluate(`(() => {
            const target = document.querySelector('#target');
            const wrapper = document.createElement('div');
            wrapper.id = 'temporary-wrapper';
            target.before(wrapper);
            wrapper.append(target);
          })()`);
          await assert.rejects(
            source.evaluate("globalThis.__t012Inspector.describeSelector('#target')"),
            /review_anchor_invalid/,
            'a changed ancestor chain is not an unchanged anchor',
          );
          await source.evaluate(`(() => {
            const wrapper = document.querySelector('#temporary-wrapper');
            wrapper.replaceWith(wrapper.firstElementChild);
          })()`);

          // Admit the same target through the real engine, persist it, then
          // replace it with an identical clone. The stale refusal retains the
          // original working bytes and cannot seal or consume the request.
          await source.evaluate(`new Promise(resolve => {
            document.querySelector('#main').scrollTop = 376;
            document.querySelector('#independent').scrollTop = 71;
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          })`);
          await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            const scrolls = Object.fromEntries(state.view.scrolls.map(entry => [entry.selector, entry]));
            return !state.busy
              && scrolls['#main']?.scrollTop === 376
              && scrolls['#independent']?.scrollTop === 71;
          }, 'engine adopts the refusal fixture ports');
          await harness.command({ type: 'element', selector: '#target' });
          const annotationId = await harness.command({ type: 'addComment' });
          await harness.command({
            type: 'edit',
            id: annotationId,
            changes: { comment: 'Do not retarget this retained comment.' },
          });
          await harness.command({ type: 'save' });
          const workingPath = path.join(harness.reviewDirectory, 'working.json');
          const workingBeforeReplacement = fs.readFileSync(workingPath);
          await source.evaluate(`(() => {
            const target = document.querySelector('#target');
            target.replaceWith(target.cloneNode(true));
            window.dispatchEvent(new Event('scroll'));
          })()`);
          const stale = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return state.stale && state.error?.code === 'review_anchor_invalid' ? state : null;
          }, 'identical replacement node invalidates the admitted engine anchor');
          await assert.rejects(
            harness.command({ type: 'seal' }, 45_000),
            /source, theme, or viewport changed/i,
          );
          assert.equal(stale.annotations.some(({ id }) => id === annotationId), true);
          assert.equal(stale.editable, false);
          assert.deepEqual(fs.readFileSync(workingPath), workingBeforeReplacement);
          assert.deepEqual(fs.readdirSync(harness.reviewDirectory), ['working.json']);
          assert.equal(
            harness.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === harness.record.requestHandle,
            ).phase,
            'pending',
          );
          evidence.json('nested-refusals-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            initialPorts: retainedView.scrolls,
            clientClipSignature: {
              sourceRevision: sourceRevision(),
              before: {
                signature: clipBefore.view.signature,
                clip: clipBefore.target.clip,
                port: clipBefore.port,
              },
              narrowed: {
                signature: clipNarrowed.view.signature,
                clip: clipNarrowed.target.clip,
                port: clipNarrowed.port,
              },
              restored: {
                signature: clipRestored.view.signature,
                clip: clipRestored.target.clip,
              },
              effectCompatibleCapture: {
                retainedSignature: narrowedEngine.view.signature,
                captureBeforeSignature: clipCompatibleProvenance.capture.beforeSignature,
                captureAfterSignature: clipCompatibleProvenance.capture.afterSignature,
                sourceRevision: sourceRevision(),
                status: clipCompatibleSeal.response.status,
                workingSha256: sha256(clipCompatibleWorking),
                files: ['annotated.png', 'provenance.json', 'report.md', 'working.json'],
                waiter: 'pending',
              },
            },
            refusals,
            identity: {
              identicalReplacement: 'review_anchor_invalid',
              ancestorChain: 'review_anchor_invalid',
              engineReplacement: stale.error,
              annotationRetained: stale.annotations.some(({ id }) => id === annotationId),
              workingSha256: sha256(workingBeforeReplacement),
            },
          });
        } finally {
          if (harness) await harness.close();
        }
      });

test('T012 legacy compatibility: root-only work seals unchanged and nested unknown basis stays retained', {
        timeout: 180_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'T012 legacy regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't012-legacy-compatibility');
        let rootHarness;
        let nestedHarness;
        try {
          // Arrange a current root-only annotation, then remove only the two
          // optional T012 fields to reproduce a valid pre-scroll working file.
          rootHarness = await createT010ReviewHarness(context, {
            number: '760',
            slug: 'legacy-root-only',
            html: [
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
              '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui}',
              '#target{position:absolute;left:80px;top:90px;width:220px;height:40px}</style>',
              '<button id="target">Legacy root target</button>',
            ].join(''),
            width: 480,
            height: 360,
            profileOwnership,
          });
          await rootHarness.command({ type: 'element', selector: '#target' });
          const rootId = await rootHarness.command({ type: 'addComment' });
          await rootHarness.command({
            type: 'edit',
            id: rootId,
            changes: { comment: 'Legacy root-only comment remains sendable.' },
          });
          const currentRootSave = await rootHarness.command({ type: 'save' });
          const legacyRoot = structuredClone(rootHarness.readWorking().state);
          assert.deepEqual(legacyRoot.view.scrolls, []);
          assert.deepEqual(legacyRoot.annotations[0].scrollBasis, []);
          delete legacyRoot.view.scrolls;
          delete legacyRoot.annotations[0].scrollBasis;
          await evaluate(rootHarness.page, 'window.__review.dispose()');
          const savedLegacyRoot = await rootHarness.postJson('/api/needs-you/review/save', {
            requestHandle: rootHarness.record.requestHandle,
            revision: rootHarness.request.revision,
            submissionId: rootHarness.opened.submissionId,
            workingRevision: currentRootSave.workingRevision,
            working: legacyRoot,
          });
          assert.equal(savedLegacyRoot.response.status, 202);
          const persistedLegacyRoot = rootHarness.readWorking();
          assert.deepEqual(persistedLegacyRoot.state, legacyRoot);
          assert.equal(Object.hasOwn(persistedLegacyRoot.state.view, 'scrolls'), false);
          assert.equal(Object.hasOwn(persistedLegacyRoot.state.annotations[0], 'scrollBasis'), false);

          // Act: reopen and seal through the real engine/capture pipeline.
          const rootReopen = await rootHarness.postJson('/api/needs-you/review/open', {
            requestHandle: rootHarness.record.requestHandle,
            revision: rootHarness.request.revision,
            submissionId: rootHarness.opened.submissionId,
          });
          assert.equal(rootReopen.response.status, 202);
          assert.deepEqual(rootReopen.payload.working, legacyRoot);
          const reopenedRoot = await rootHarness.mount(rootReopen.payload);
          assert.equal(reopenedRoot.ready, true);
          assert.equal(Object.hasOwn(reopenedRoot.view, 'scrolls'), false);
          assert.equal(Object.hasOwn(reopenedRoot.annotations[0], 'scrollBasis'), false);
          const rootSeal = await rootHarness.command({ type: 'seal' }, 45_000);
          assert.equal(rootSeal.status, 'sealed');
          const rootWorking = rootHarness.readWorking();
          const rootProvenance = JSON.parse(fs.readFileSync(
            path.join(rootHarness.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          const rootReport = fs.readFileSync(path.join(rootHarness.reviewDirectory, 'report.md'));
          const rootImage = fs.readFileSync(path.join(rootHarness.reviewDirectory, 'annotated.png'));
          const rootHistory = rootHarness.adapter.readHistory({
            scope: rootHarness.feature.scope,
            submissionId: rootHarness.opened.submissionId,
            signal: new AbortController().signal,
          });

          // Assert the old shape remains absent at every persisted/read boundary.
          assert.equal(Object.hasOwn(rootWorking.state.view, 'scrolls'), false);
          assert.equal(Object.hasOwn(rootWorking.state.annotations[0], 'scrollBasis'), false);
          assert.equal(Object.hasOwn(rootProvenance.capture, 'scrolls'), false);
          assert.equal(Object.hasOwn(rootHistory.provenance.capture, 'scrolls'), false);
          assert.equal(rootProvenance.version, 2);
          assert.equal(rootHistory.status, 'historical');
          assert.equal(rootHistory.editable, false);
          const rootReportText = rootReport.toString('utf8');
          assert.match(rootReportText, /Original annotation geometry: at \(96, 106\)\./);
          assert.doesNotMatch(
            rootReportText,
            /Viewed nested scroll containers|Ancestor scroll basis/,
          );
          assert.deepEqual(fs.readdirSync(rootHarness.reviewDirectory).sort(), [
            'annotated.png',
            'provenance.json',
            'report.md',
            'working.json',
          ]);
          const rootResult = {
            workingSha256: sha256(fs.readFileSync(path.join(rootHarness.reviewDirectory, 'working.json'))),
            reportSha256: sha256(rootReport),
            image: evidence.image('legacy-root-annotated.png', rootImage),
            noMaterializedDefaults: !Object.hasOwn(rootWorking.state.view, 'scrolls')
              && !Object.hasOwn(rootWorking.state.annotations[0], 'scrollBasis')
              && !Object.hasOwn(rootProvenance.capture, 'scrolls'),
            historicalWithoutLiveAuthority: rootHistory.status === 'historical'
              && rootHistory.editable === false,
          };
          await rootHarness.close();
          rootHarness = null;

          // A legacy element inside a real nested port has no provable creation
          // basis. It remains byte-retained but unavailable; reopening must not
          // infer [], retarget the node, autosave a migration, or launch capture.
          nestedHarness = await createT010ReviewHarness(context, {
            number: '761',
            slug: 'legacy-nested-unknown',
            html: [
              '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
              '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px system-ui}',
              '#main{position:absolute;left:30px;top:30px;width:360px;height:200px;overflow:auto}',
              '#content{position:relative;height:500px}',
              '#target{position:absolute;left:50px;top:80px;width:220px;height:40px}</style>',
              '<main id="main"><div id="content"><button id="target">Legacy nested target</button></div></main>',
            ].join(''),
            width: 480,
            height: 360,
            profileOwnership,
          });
          await nestedHarness.command({ type: 'element', selector: '#target' });
          const nestedId = await nestedHarness.command({ type: 'addComment' });
          await nestedHarness.command({
            type: 'edit',
            id: nestedId,
            changes: { comment: 'Retain this unknown legacy nested anchor.' },
          });
          const currentNestedSave = await nestedHarness.command({ type: 'save' });
          const legacyNested = structuredClone(nestedHarness.readWorking().state);
          assert.deepEqual(legacyNested.view.scrolls, [
            { selector: '#main', scrollLeft: 0, scrollTop: 0 },
          ]);
          assert.deepEqual(legacyNested.annotations[0].scrollBasis, [
            { selector: '#main', scrollLeft: 0, scrollTop: 0 },
          ]);
          delete legacyNested.view.scrolls;
          delete legacyNested.annotations[0].scrollBasis;
          await evaluate(nestedHarness.page, 'window.__review.dispose()');
          const savedLegacyNested = await nestedHarness.postJson('/api/needs-you/review/save', {
            requestHandle: nestedHarness.record.requestHandle,
            revision: nestedHarness.request.revision,
            submissionId: nestedHarness.opened.submissionId,
            workingRevision: currentNestedSave.workingRevision,
            working: legacyNested,
          });
          assert.equal(savedLegacyNested.response.status, 202);
          const legacyNestedBytes = fs.readFileSync(
            path.join(nestedHarness.reviewDirectory, 'working.json'),
          );
          const savesBeforeReopen = nestedHarness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          const nestedReopen = await nestedHarness.postJson('/api/needs-you/review/open', {
            requestHandle: nestedHarness.record.requestHandle,
            revision: nestedHarness.request.revision,
            submissionId: nestedHarness.opened.submissionId,
          });
          assert.equal(nestedReopen.response.status, 202);
          assert.deepEqual(nestedReopen.payload.working, legacyNested);
          await nestedHarness.mount(nestedReopen.payload, 'light', false);
          const unavailable = await until(async () => {
            const state = await evaluate(nestedHarness.page, 'window.__review.getState()');
            return state.stale && state.error?.code === 'review_anchor_invalid' ? state : null;
          }, 'legacy nested anchor remains unavailable without an inferred basis', 15_000);
          await assert.rejects(
            nestedHarness.command({ type: 'seal' }, 45_000),
            /source, theme, or viewport changed/i,
          );
          const savesAfterRefusal = nestedHarness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          assert.equal(unavailable.ready, false);
          assert.equal(unavailable.editable, false);
          assert.equal(unavailable.annotations[0].id, nestedId);
          assert.equal(Object.hasOwn(unavailable.view, 'scrolls'), false);
          assert.equal(Object.hasOwn(unavailable.annotations[0], 'scrollBasis'), false);
          assert.equal(savesAfterRefusal, savesBeforeReopen);
          assert.deepEqual(
            fs.readFileSync(path.join(nestedHarness.reviewDirectory, 'working.json')),
            legacyNestedBytes,
          );
          assert.deepEqual(fs.readdirSync(nestedHarness.reviewDirectory), ['working.json']);
          assert.equal(
            nestedHarness.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === nestedHarness.record.requestHandle,
            ).phase,
            'pending',
          );
          evidence.json('legacy-compatibility-result.json', {
            case: context.name,
            browser: nestedHarness.browser.info.Browser,
            rootOnly: rootResult,
            nestedUnknown: {
              refusal: unavailable.error,
              retainedAnnotationId: unavailable.annotations[0].id,
              workingSha256: sha256(legacyNestedBytes),
              noMaterializedDefaults: !Object.hasOwn(unavailable.view, 'scrolls')
                && !Object.hasOwn(unavailable.annotations[0], 'scrollBasis'),
              saveRequestsAfterReopen: savesAfterRefusal - savesBeforeReopen,
              requestPhase: 'pending',
            },
          });
        } finally {
          if (rootHarness) await rootHarness.close();
          if (nestedHarness) await nestedHarness.close();
        }
      });

test('T010 review regression: live inline SVG paint drift cannot seal fresh source pixels', { timeout: 180_000, concurrency: false }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'SVG regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-svg-paint-regression');
        const paintHtml = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f5f5f5}',
          'svg{display:block;width:100%;height:100%;color:#0f6cbd}',
          '</style>',
          '<svg xmlns="http://www.w3.org/2000/svg" aria-label="Inline SVG paint fixture">',
          '  <rect id="paint-change" x="40" y="40" width="180" height="100" fill="#d13438" stroke="#0f6cbd" stroke-width="14"/>',
          '  <rect id="paint-static" x="280" y="40" width="140" height="100" fill="#d13438" stroke="#0f6cbd" stroke-width="14"/>',
          '  <path id="geometry-change" d="M40 205 L180 205 L40 305 Z" fill="currentColor"/>',
          '  <circle id="current-color-circle" cx="320" cy="250" r="50" fill="currentColor"/>',
          '</svg>',
          '<script>',
          "addEventListener('message', event => {",
          "  const afterPaint = payload => requestAnimationFrame(() => requestAnimationFrame(() => parent.postMessage(payload, '*')));",
          "  if (event.data?.type === 't010-set-svg-paint') {",
          "    const node = document.querySelector('#paint-change');",
          "    node.setAttribute('fill', event.data.fill);",
          "    node.setAttribute('stroke', event.data.stroke);",
          "    afterPaint({type:'t010-svg-paint-applied', fill:node.getAttribute('fill'), stroke:node.getAttribute('stroke')});",
          '    return;',
          '  }',
          "  if (event.data?.type === 't010-set-svg-transform') {",
          "    const node = document.querySelector('#geometry-change');",
          '    const before = node.getBoundingClientRect();',
          "    if (event.data.transform) node.setAttribute('transform', event.data.transform);",
          "    else node.removeAttribute('transform');",
          '    afterPaint({',
          "      type:'t010-svg-transform-applied', transform:node.getAttribute('transform'),",
          '      before:{x:before.x,y:before.y,width:before.width,height:before.height},',
          '      after:null,',
          '    });',
          '    requestAnimationFrame(() => requestAnimationFrame(() => {',
          '      const after = node.getBoundingClientRect();',
          "      parent.postMessage({type:'t010-svg-transform-settled', transform:node.getAttribute('transform'),",
          '        before:{x:before.x,y:before.y,width:before.width,height:before.height},',
          '        after:{x:after.x,y:after.y,width:after.width,height:after.height}}, "*");',
          '    }));',
          '    return;',
          '  }',
          "  if (event.data?.type === 't010-set-svg-unsupported') {",
          "    document.querySelector('#unsupported-defs')?.remove();",
          "    document.querySelector('#unsupported-use')?.remove();",
          "    document.querySelector('#paint-static').setAttribute('fill', '#d13438');",
          "    const svg = document.querySelector('svg');",
          "    if (event.data.mode === 'gradient') {",
          "      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');",
          "      defs.id = 'unsupported-defs';",
          "      defs.innerHTML = '<linearGradient id=\"unsupported-gradient\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"#000\"/></linearGradient>';",
          '      svg.prepend(defs);',
          "      document.querySelector('#paint-static').setAttribute('fill', 'url(#unsupported-gradient)');",
          "    } else if (event.data.mode === 'use') {",
          "      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');",
          "      use.id = 'unsupported-use';",
          "      use.setAttribute('href', '#paint-static');",
          "      use.setAttribute('transform', 'translate(0 120)');",
          '      svg.append(use);',
          '    }',
          "    afterPaint({type:'t010-svg-unsupported-applied', mode:event.data.mode});",
          '  }',
          '});',
          '</script>',
          '',
        ].join('\n');

        // Arrange + Act + Assert: unchanged paint remains a supported inline SVG
        // source and seals through the ordinary engine/HTTP/capture path.
        const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
        let profileProof;
        let positiveControl;
        const positive = await createT010ReviewHarness(context, {
          number: '711',
          slug: 'svg-paint-positive',
          html: paintHtml,
          profileOwnership,
        });
        try {
          profileProof = proveT010ProfileOwnership(profileOwnership);
          const before = await evaluate(positive.page, 'window.__review.getState().view.signature');
          await evaluate(positive.page, `document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
            type: 't010-set-svg-paint', fill: '#d13438', stroke: '#0f6cbd'
          }, '*')`);
          await until(
            () => evaluate(positive.page, `window.__t010FixtureMessages.some(message =>
              message.type === 't010-svg-paint-applied'
              && message.fill === '#d13438'
              && message.stroke === '#0f6cbd')`),
            'same SVG paint control',
          );
          await positive.command({ type: 'scroll', x: 0, y: 0 });
          const after = await evaluate(positive.page, 'window.__review.getState().view.signature');
          assert.equal(after, before, 'writing the same fill and stroke keeps the inspected view equivalent');

          const staticImage = await positive.screenshot();
          const staticDecoded = decodePng(staticImage);
          const pathCurrentColor = decodedPixel(staticDecoded, 70, 250);
          const circleCurrentColor = decodedPixel(staticDecoded, 320, 250);
          assert.ok(
            contrast(pixelColor(pathCurrentColor), 'rgb(15, 108, 189)') < 1.05,
            `static path resolves currentColor, got ${JSON.stringify(pathCurrentColor)}`,
          );
          assert.ok(
            contrast(pixelColor(circleCurrentColor), 'rgb(15, 108, 189)') < 1.05,
            `static circle resolves currentColor, got ${JSON.stringify(circleCurrentColor)}`,
          );
          const staticImageEvidence = evidence.image('static-inline-svg-current-color.png', staticImage);

          const unsupportedModes = [];
          for (const mode of ['gradient', 'use']) {
            await evaluate(positive.page, `(() => {
              window.__t010FixtureMessages = [];
              document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
                type: 't010-set-svg-unsupported', mode: ${JSON.stringify(mode)}
              }, '*');
            })()`);
            await until(
              () => evaluate(positive.page, `window.__t010FixtureMessages.some(message =>
                message.type === 't010-svg-unsupported-applied'
                && message.mode === ${JSON.stringify(mode)})`),
              `unsupported inline SVG ${mode} applied`,
            );
            await assert.rejects(
              positive.command({ type: 'scroll', x: 0, y: 0 }),
              /fresh capture cannot verify/i,
              `${mode} reference mode is explicitly unsupported`,
            );
            assert.equal(
              await evaluate(positive.page, 'window.__review.getState().error.code'),
              'review_transient_unsupported',
              `${mode} reference mode reports the typed refusal`,
            );
            unsupportedModes.push({ mode, error: 'review_transient_unsupported' });
            await evaluate(positive.page, `(() => {
              window.__t010FixtureMessages = [];
              document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
                type: 't010-set-svg-unsupported', mode: 'none'
              }, '*');
            })()`);
            await until(
              () => evaluate(positive.page, `window.__t010FixtureMessages.some(message =>
                message.type === 't010-svg-unsupported-applied'
                && message.mode === 'none')`),
              `unsupported inline SVG ${mode} removed`,
            );
            await positive.command({ type: 'scroll', x: 0, y: 0 });
          }

          await positive.command({ type: 'element', selector: '#paint-static' });
          const annotationId = await positive.command({ type: 'addComment' });
          await positive.command({
            type: 'edit',
            id: annotationId,
            changes: { comment: 'Keep the unchanged static SVG shapes.' },
          });
          const positiveSaved = await positive.command({ type: 'save' });
          assert.equal(positiveSaved.status, 'saved');
          const positiveWorking = positive.readWorking().state;
          const positiveAnchor = positiveWorking.annotations.find(({ id }) => id === annotationId).element;
          assert.deepEqual(
            Object.keys(positiveWorking.view).sort(),
            ['scrolls', 'signature', 'viewport'],
            'private SVG evidence adds no fields beyond the bounded Review view',
          );
          assert.deepEqual(positiveWorking.view.scrolls, [], 'the SVG control has no nested scroll containers');
          assert.ok(
            Object.keys(positiveAnchor.styles).length <= 32,
            'SVG target remains inside the existing computed-style cap',
          );
          const sealed = await positive.command({ type: 'seal' }, 45_000);
          assert.equal(
            sealed.status,
            'sealed',
            'static rect/path/circle/currentColor SVG remains reviewable after explicit unsupported-mode refusals',
          );
          positiveControl = {
            signatures: { before, after, unchanged: before === after },
            currentColorPixels: { path: pathCurrentColor, circle: circleCurrentColor },
            unsupportedModes,
            persistedViewKeys: Object.keys(positiveWorking.view).sort(),
            persistedStyleCount: Object.keys(positiveAnchor.styles).length,
            sealStatus: sealed.status,
            image: staticImageEvidence,
          };
        } finally {
          await positive.close();
        }

        // Arrange: a second owned review starts from the same canonical
        // red/blue source. Its live frame then changes painting without
        // changing the mirrored path's portable rectangle.
        const changed = await createT010ReviewHarness(context, {
          number: '712',
          slug: 'svg-paint-drift',
          html: paintHtml,
          profileOwnership,
        });
        try {
          const originalSignature = await evaluate(changed.page, 'window.__review.getState().view.signature');
          await evaluate(changed.page, `document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
            type: 't010-set-svg-transform', transform: 'matrix(-1 0 0 1 220 0)'
          }, '*')`);
          const geometryMutation = await until(
            () => evaluate(changed.page, `window.__t010FixtureMessages.find(message =>
              message.type === 't010-svg-transform-settled'
              && message.transform === 'matrix(-1 0 0 1 220 0)')`),
            'same-bounds SVG transform applied in the live review frame',
          );
          await evaluate(changed.page, `document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
            type: 't010-set-svg-paint', fill: '#107c10', stroke: '#ca5010'
          }, '*')`);
          await until(
            () => evaluate(changed.page, `window.__t010FixtureMessages.some(message =>
              message.type === 't010-svg-paint-applied'
              && message.fill === '#107c10'
              && message.stroke === '#ca5010')`),
            'changed SVG paint applied in the live review frame',
          );
          await changed.command({ type: 'scroll', x: 0, y: 0 });
          const refreshed = await evaluate(changed.page, 'window.__review.getState()');
          const liveImage = await changed.screenshot();
          const liveDecoded = decodePng(liveImage);
          const liveFill = decodedPixel(liveDecoded, 90, 85);
          const liveStroke = decodedPixel(liveDecoded, 40, 85);
          assert.deepEqual(
            geometryMutation.after,
            geometryMutation.before,
            'the mirrored path retains the same live bounding box',
          );
          assert.notEqual(
            refreshed.view.signature,
            originalSignature,
            'same-bounds SVG painting changes the host renderer-local signature',
          );

          // Act: add two free drawings over the changed SVG regions and seal.
          // Version 2 deliberately has no semantic target for either drawing.
          await changed.command({ type: 'tool', tool: 'box' });
          const geometryId = await changed.command({ type: 'addAtCenter' });
          await changed.command({
            type: 'edit',
            id: geometryId,
            changes: { x1: 50, y1: 215, x2: 170, y2: 295 },
          });
          const paintId = await changed.command({ type: 'addAtCenter' });
          await changed.command({
            type: 'edit',
            id: paintId,
            changes: { x1: 55, y1: 55, x2: 205, y2: 125 },
          });
          const saved = await changed.command({ type: 'save' });
          const working = changed.readWorking();
          const workingBeforeSeal = fs.readFileSync(path.join(changed.reviewDirectory, 'working.json'));
          assert.deepEqual(
            working.state.annotations.map(({ id, element }) => ({ id, element })),
            [
              { id: geometryId, element: null },
              { id: paintId, element: null },
            ],
            'free drawings carry no manufactured anchor identity',
          );
          const seal = await changed.postJson('/api/needs-you/review/seal', {
            requestHandle: changed.record.requestHandle,
            revision: changed.request.revision,
            submissionId: changed.opened.submissionId,
            workingRevision: saved.workingRevision,
            revisionText: 'Review these unanchored marks against the fresh canonical source.',
          });
          assert.equal(
            seal.response.status,
            202,
            `unanchored paint-only drift follows the version-2 viewport contract: ${JSON.stringify(seal.payload)}`,
          );

          const image = fs.readFileSync(path.join(changed.reviewDirectory, 'annotated.png'));
          const decoded = decodePng(image);
          const freshFill = decodedPixel(decoded, 90, 85);
          const freshStroke = decodedPixel(decoded, 40, 85);
          const provenance = JSON.parse(fs.readFileSync(
            path.join(changed.reviewDirectory, 'provenance.json'),
            'utf8',
          ));
          const report = fs.readFileSync(path.join(changed.reviewDirectory, 'report.md'), 'utf8');
          const liveImageEvidence = evidence.image('live-changed-svg-paint.png', liveImage);
          const sealedImageEvidence = evidence.image('sealed-fresh-source-contract.png', image);
          const files = fs.readdirSync(changed.reviewDirectory).sort();
          const waiter = changed.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === changed.record.requestHandle,
          );
          const unanchoredDisclosure = 'Unanchored drawing: only viewport/revision binding and containment are verified; no semantic target is verified.';

          // Assert: the host and fresh source demonstrably paint differently,
          // while each renderer is locally stable and the report states the
          // intentionally narrower evidence for both unanchored drawings.
          assert.ok(
            contrast(pixelColor(liveFill), 'rgb(16, 124, 16)') < 1.05,
            `live fill must be green, got ${JSON.stringify(liveFill)}`,
          );
          assert.ok(
            contrast(pixelColor(liveStroke), 'rgb(202, 80, 16)') < 1.05,
            `live stroke must be orange, got ${JSON.stringify(liveStroke)}`,
          );
          assert.ok(
            contrast(pixelColor(freshFill), 'rgb(209, 52, 56)') < 1.05,
            `fresh source fill must remain canonical red, got ${JSON.stringify(freshFill)}`,
          );
          assert.ok(
            contrast(pixelColor(freshStroke), 'rgb(15, 108, 189)') < 1.05,
            `fresh source stroke must remain canonical blue, got ${JSON.stringify(freshStroke)}`,
          );
          assert.equal(provenance.version, 2);
          assert.equal(provenance.capture.beforeSignature, provenance.capture.afterSignature);
          assert.notEqual(provenance.capture.beforeSignature, refreshed.view.signature);
          assert.deepEqual(provenance.capture.selectors, []);
          assert.equal(report.split(unanchoredDisclosure).length - 1, 2);
          assert.doesNotMatch(report, /Portable target revision:|Host-review target/);
          assert.deepEqual(files, ['annotated.png', 'provenance.json', 'report.md', 'working.json']);
          assert.deepEqual(
            fs.readFileSync(path.join(changed.reviewDirectory, 'working.json')),
            workingBeforeSeal,
          );
          assert.equal(waiter?.phase, 'pending');
          evidence.json('svg-paint-result.json', {
            case: context.name,
            browser: changed.browser.info.Browser,
            signatures: {
              original: originalSignature,
              refreshed: refreshed.view.signature,
              changed: originalSignature !== refreshed.view.signature,
              captureBefore: provenance.capture.beforeSignature,
              captureAfter: provenance.capture.afterSignature,
            },
            sameBoundsMutation: geometryMutation,
            positiveControl,
            profileOwnership: {
              ...profileProof,
              exactProcessCreatedReceipts: profileOwnership.createdSince(0).length,
              survivingAtResult: profileOwnership.survivorsSince(0).length,
            },
            live: {
              fill: liveFill,
              stroke: liveStroke,
              expectedFill: '#107c10',
              expectedStroke: '#ca5010',
              image: liveImageEvidence,
            },
            freshCapture: {
              fill: freshFill,
              stroke: freshStroke,
              canonicalFill: '#d13438',
              canonicalStroke: '#0f6cbd',
              image: sealedImageEvidence,
            },
            semanticTargets: provenance.capture.selectors,
            unanchoredDisclosureCount: report.split(unanchoredDisclosure).length - 1,
            seal: { status: seal.response.status, payload: seal.payload },
            files,
            waiterPhase: waiter?.phase ?? null,
          });
        } finally {
          await changed.close();
        }

        // Arrange: a third owned review records an anchored target only after
        // a live transform changes that target's portable rectangle.
        const anchored = await createT010ReviewHarness(context, {
          number: '713',
          slug: 'svg-anchored-geometry-drift',
          html: paintHtml,
          profileOwnership,
        });
        try {
          const originalSignature = await evaluate(anchored.page, 'window.__review.getState().view.signature');
          await evaluate(anchored.page, `document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
            type: 't010-set-svg-transform', transform: 'matrix(1 0 0 1 60 0)'
          }, '*')`);
          const rectMutation = await until(
            () => evaluate(anchored.page, `window.__t010FixtureMessages.find(message =>
              message.type === 't010-svg-transform-settled'
              && message.transform === 'matrix(1 0 0 1 60 0)')`),
            'rect-changing SVG transform applied in the live review frame',
          );
          await anchored.command({ type: 'scroll', x: 0, y: 0 });
          const changedState = await evaluate(anchored.page, 'window.__review.getState()');
          assert.notDeepEqual(
            rectMutation.after,
            rectMutation.before,
            'the anchored counterexample changes a portable target rectangle',
          );
          assert.notEqual(changedState.view.signature, originalSignature);
          await anchored.command({ type: 'element', selector: '#geometry-change' });
          const annotationId = await anchored.command({ type: 'addComment' });
          await anchored.command({
            type: 'edit',
            id: annotationId,
            changes: { comment: 'The moved anchored target must retain its measured rectangle.' },
          });
          const saved = await anchored.command({ type: 'save' });
          const working = anchored.readWorking();
          const anchoredAnnotation = working.state.annotations.find(({ id }) => id === annotationId);
          assert.deepEqual(anchoredAnnotation.element.rect, rectMutation.after);

          // Act.
          const seal = await anchored.postJson('/api/needs-you/review/seal', {
            requestHandle: anchored.record.requestHandle,
            revision: anchored.request.revision,
            submissionId: anchored.opened.submissionId,
            workingRevision: saved.workingRevision,
            revisionText: 'Keep the anchored target aligned with the reviewed rectangle.',
          });
          const files = fs.readdirSync(anchored.reviewDirectory).sort();
          const waiter = anchored.provider.read().requests.find(
            ({ requestHandle }) => requestHandle === anchored.record.requestHandle,
          );

          // Assert: portable anchored geometry remains a sealing gate even
          // though whole-page and same-bounds painting are not compared.
          assert.notEqual(seal.response.status, 202);
          assert.equal(seal.payload.error, 'review_anchor_invalid');
          assert.deepEqual(files, ['working.json']);
          assert.equal(waiter?.phase, 'pending');
          evidence.json('svg-anchored-geometry-result.json', {
            case: context.name,
            browser: anchored.browser.info.Browser,
            mutation: rectMutation,
            hostSignatureChanged: originalSignature !== changedState.view.signature,
            recordedRect: anchoredAnnotation.element.rect,
            seal: { status: seal.response.status, payload: seal.payload },
            files,
            waiterPhase: waiter?.phase ?? null,
          });
        } finally {
          await anchored.close();
        }
      });

test('T010 review regression: live sandbox iframe self-navigation never reaches another loopback origin', { timeout: 120_000, concurrency: false }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'iframe regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-iframe-navigation-regression');
        const receiverRequests = [];
        const receiver = createServer((req, res) => {
          receiverRequests.push({
            method: req.method,
            url: req.url,
            receivedAt: Date.now(),
            host: req.headers.host,
            referer: req.headers.referer ?? null,
          });
          res.writeHead(200, {
            'cache-control': 'no-store',
            'content-type': 'text/html; charset=utf-8',
          });
          res.end('<!doctype html><meta charset="utf-8"><body>Unexpected navigation receiver</body>');
        });
        await new Promise((resolve, reject) => {
          receiver.once('error', reject);
          receiver.listen(0, '127.0.0.1', () => resolve(undefined));
        });
        const target = `http://127.0.0.1:${/** @type {any} */ (receiver.address()).port}/t010-self-navigation`;
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<link rel="stylesheet" href="legit.css">',
          '<p id="status">Canonical frame is ready.</p>',
          '<script>',
          "requestAnimationFrame(() => parent.postMessage({",
          "  type:'t010-legit-source-ready',",
          "  marker:getComputedStyle(document.documentElement).getPropertyValue('--t010-source-asset').trim(),",
          "  background:getComputedStyle(document.documentElement).backgroundColor,",
          "}, '*'));",
          "addEventListener('message', event => {",
          "  if (event.data?.type !== 't010-arm-self-navigation') return;",
          '  setTimeout(() => {',
          `    const target = ${JSON.stringify(target)};`,
          "    parent.postMessage({type:'t010-self-navigation-attempt', target, at:performance.now()}, '*');",
          '    location.assign(target);',
          '  }, 80);',
          '});',
          '</script>',
          '',
        ].join('\n');
        let harness;
        try {
          harness = await createT010ReviewHarness(context, {
            number: '713',
            slug: 'iframe-self-navigation',
            html,
            assets: {
              'legit.css': 'html,body{--t010-source-asset:mounted;margin:0;min-height:100%;background:#f5f5f5;font:16px system-ui}\n',
            },
            profileOwnership,
          });
          const legitimateMount = await until(
            () => evaluate(harness.page, `window.__t010FixtureMessages.find(message =>
              message.type === 't010-legit-source-ready'
              && message.marker === 'mounted')`),
            'legitimate source CSS applied inside the opaque child',
          );
          const parentResponse = await fetch(harness.origin, {
            signal: AbortSignal.timeout(DEADLINE_MS),
          });
          const parentCsp = parentResponse.headers.get('content-security-policy');
          const childResponse = await fetch(new URL(harness.opened.framePath, harness.origin), {
            headers: { origin: 'null' },
            signal: AbortSignal.timeout(DEADLINE_MS),
          });
          const childCsp = childResponse.headers.get('content-security-policy');
          const legitimateAssetPath = `${path.posix.dirname(harness.opened.framePath)}/legit.css`;
          const legitimateAsset = await fetch(new URL(legitimateAssetPath, harness.origin), {
            headers: { origin: 'null' },
            signal: AbortSignal.timeout(DEADLINE_MS),
          });
          assert.equal(parentResponse.status, 200);
          assert.equal(parentCsp, `frame-src ${harness.origin}/review-source/`);
          assert.equal(childResponse.status, 200);
          assert.match(childCsp, /^sandbox allow-scripts;/);
          assert.doesNotMatch(childCsp, /allow-same-origin/);
          assert.match(childCsp, /default-src 'none'/);
          assert.match(childCsp, /frame-src 'none'/);
          assert.equal(legitimateAsset.status, 200);
          assert.equal(legitimateAsset.headers.get('content-type'), 'text/css; charset=utf-8');
          assert.match(await childResponse.text(), /data-dude-review-bridge/);
          assert.equal(
            await legitimateAsset.text(),
            'html,body{--t010-source-asset:mounted;margin:0;min-height:100%;background:#f5f5f5;font:16px system-ui}\n',
          );
          assert.equal(legitimateMount.marker, 'mounted');
          assert.equal(legitimateMount.background, 'rgb(245, 245, 245)');
          const requestedNavigations = [];
          const receiverRequestIds = new Set();
          const receiverFailures = [];
          harness.page.on('Page.frameRequestedNavigation', (event) => {
            if (event.url === target) requestedNavigations.push(event);
          });
          harness.page.on('Network.requestWillBeSent', (event) => {
            if (event.request.url === target) receiverRequestIds.add(event.requestId);
          });
          harness.page.on('Network.loadingFailed', (event) => {
            if (receiverRequestIds.has(event.requestId)) receiverFailures.push(event);
          });

          // Arrange: receiver is empty before the controlled canonical script is
          // armed. This distinguishes containment from a fixture that never tried.
          assert.equal(receiverRequests.length, 0);

          // Act: the real opaque engine iframe announces immediately before its own
          // delayed location.assign. CDP events are retained when the root target
          // surfaces them; the source-bound bridge message proves the attempt even
          // when Chromium keeps opaque-frame events on its unexposed child session.
          await evaluate(harness.page, `document.querySelector('.dude-review-frame iframe').contentWindow.postMessage({
            type: 't010-arm-self-navigation'
          }, '*')`);
          const bridgeAttempt = await until(
            () => evaluate(harness.page, `window.__t010FixtureMessages.find(message =>
              message.type === 't010-self-navigation-attempt')`),
            'canonical frame self-navigation attempt message',
          );
          await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()').catch(() => null);
            return receiverRequests.length > 0 || receiverFailures.length > 0 || state?.stale ? {
              receiverRequests: receiverRequests.length,
              receiverFailures: receiverFailures.length,
              stale: state?.stale ?? null,
            } : null;
          }, 'bounded self-navigation outcome', 2_500).catch(() => ({
            receiverRequests: receiverRequests.length,
            receiverFailures: receiverFailures.length,
            stale: false,
          }));
          if (receiverRequests.length) {
            await until(
              () => evaluate(harness.page, 'window.__review.getState().stale'),
              'engine reaction to the navigated live iframe',
              2_500,
            ).catch(() => false);
          }
          const state = await evaluate(harness.page, 'window.__review.getState()');
          const image = await harness.screenshot();
          const imageEvidence = evidence.image('iframe-self-navigation-outcome.png', image);
          evidence.json('iframe-self-navigation-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            canonicalOrigin: harness.origin,
            parentCsp,
            childCsp,
            legitimateAsset: {
              path: legitimateAssetPath,
              status: legitimateAsset.status,
              mountedByChild: legitimateMount,
            },
            receiverOrigin: new URL(target).origin,
            target,
            bridgeAttempt,
            requestedNavigations: requestedNavigations.map((event) => ({
              url: event.url,
              reason: event.reason,
              disposition: event.disposition,
            })),
            receiverFailures: receiverFailures.map((event) => ({
              errorText: event.errorText,
              blockedReason: event.blockedReason ?? null,
            })),
            receiverRequests,
            engine: {
              ready: state.ready,
              stale: state.stale,
              status: state.status,
              error: state.error,
            },
            screenshot: imageEvidence,
          });

          // Assert: self-navigation is an outbound request by the untrusted live
          // frame, not a child-frame load covered by frame-src and not a capture-page
          // request. The explicit bridge and CDP observations make zero non-vacuous.
          assert.equal(bridgeAttempt.target, target);
          assert.deepEqual(
            receiverRequests,
            [],
            `untrusted canonical iframe reached the test-owned receiver before the engine reacted: ${JSON.stringify({
              receiverRequests,
              receiverFailures,
              state: { stale: state.stale, error: state.error },
            })}`,
          );
        } finally {
          let harnessCloseError = null;
          try {
            if (harness) await harness.close();
          } catch (error) {
            harnessCloseError = error;
          } finally {
            await new Promise((resolve) => receiver.close(() => resolve(undefined)));
          }
          if (harnessCloseError) throw harnessCloseError;
        }
      });

test('T010 review regression: pointer-cancelled drag cannot become durable through autosave', { timeout: 120_000, concurrency: false }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'cancelled-drag regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-cancelled-drag-regression');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>html,body{margin:0;min-height:100%;background:#f5f5f5;color:#242424;font:16px system-ui}</style>',
          '<main><h1>Cancelled drag fixture</h1><p>The canonical source remains unchanged.</p></main>',
          '',
        ].join('\n');
        const harness = await createT010ReviewHarness(context, {
          number: '714',
          slug: 'cancelled-drag-autosave',
          html,
          profileOwnership,
        });
        try {
          // Arrange: two committed annotations, B selected, Select active, and an
          // actual caret are already persisted through the production HTTP route.
          const seeded = await seedTwoReviewAnnotations(harness);
          const geometry = (state, id) => {
            const annotation = state.annotations.find((entry) => entry.id === id);
            return {
              x1: annotation.x1,
              y1: annotation.y1,
              x2: annotation.x2,
              y2: annotation.y2,
            };
          };
          const committedB = geometry(seeded.committed, seeded.secondId);
          const workingAtCommit = harness.readWorking();
          assert.equal(workingAtCommit.state.annotations.length, 2);
          assert.deepEqual(geometry(workingAtCommit.state, seeded.secondId), committedB);
          const saveRequests = () => harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          const savesBeforeDrag = saveRequests();
          const changesBeforeDrag = await evaluate(harness.page, 'window.__reviewChanges.length');

          // Act: a tool round-trip starts the 700 ms autosave, then native CDP touch
          // pointer events move selected B and hold it until that save completes.
          await harness.command({ type: 'tool', tool: 'box' });
          await harness.command({ type: 'tool', tool: 'select' });
          await harness.page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
          await harness.page.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: 270, y: 150, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
          });
          await harness.page.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: 220, y: 220, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
          });
          const draggedB = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            const current = geometry(state, seeded.secondId);
            return JSON.stringify(current) !== JSON.stringify(committedB) ? current : null;
          }, 'native pointer drag changes live B geometry');
          await until(async () => {
            const observedSave = await evaluate(harness.page, `window.__reviewChanges
              .slice(${changesBeforeDrag})
              .some(state => state.saving)`);
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return observedSave && saveRequests() > savesBeforeDrag && !state.saving;
          }, 'autosave completion while the pointer remains down', 5_000);
          const persistedDuringDrag = harness.readWorking();
          await harness.page.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          await harness.page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
          const liveAfterCancel = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return !state.busy && JSON.stringify(geometry(state, seeded.secondId)) === JSON.stringify(committedB)
              ? state : null;
          }, 'pointercancel restores committed live geometry');
          const persistedAfterCancel = harness.readWorking();
          const savesBeforeExplicit = saveRequests();
          const explicit = await harness.command({ type: 'save' });
          assert.equal(explicit.status, 'saved');
          const persistedAfterExplicit = harness.readWorking();
          const savesAfterExplicit = saveRequests();

          // A second real held drag is cancelled through the shared inactive path.
          // It must restore geometry before the retained view is resumed.
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: 270,
            y: 150,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: 230,
            y: 220,
            button: 'left',
            buttons: 1,
          });
          const draggedBeforeInactive = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            const current = geometry(state, seeded.secondId);
            return JSON.stringify(current) !== JSON.stringify(committedB) ? current : null;
          }, 'native held drag changes geometry before inactive cancellation');
          await evaluate(harness.page, 'window.__review.update({ active: false })');
          const inactiveCancelled = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return !state.active && JSON.stringify(geometry(state, seeded.secondId)) === JSON.stringify(committedB)
              ? state : null;
          }, 'inactive update cancels and restores held drag');
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: 230,
            y: 220,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          });
          await evaluate(harness.page, 'window.__review.update({ active: true })');
          const resumedAfterInactive = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return state.active && state.ready
              && JSON.stringify(geometry(state, seeded.secondId)) === JSON.stringify(committedB)
              ? state : null;
          }, 'inactive-cancelled review resumes with committed geometry');
          const persistedAfterInactive = harness.readWorking();

          // Hold the real adapter response after an HTTP autosave starts. Selection
          // and caret then change while that save is late; one coalesced follow-up
          // must persist the newer metadata and clear dirty without adding history.
          const lateSaveRequestsBefore = saveRequests();
          const lateSave = harness.holdNextSave();
          await harness.command({ type: 'notes', text: 'Current metadata survives a late save.' });
          let lateSaveTimer;
          try {
            await Promise.race([
              lateSave.started,
              new Promise((_, reject) => {
                lateSaveTimer = setTimeout(
                  () => reject(new Error('bounded late-save barrier was not reached')),
                  3_000,
                );
              }),
            ]);
          } finally {
            clearTimeout(lateSaveTimer);
          }
          await harness.command({ type: 'select', id: seeded.firstId });
          await harness.command({
            type: 'caret',
            caret: { id: seeded.firstId, field: 'comment', start: 0, end: 0, direction: 'none' },
          });
          const dirtyWhileLate = await evaluate(harness.page, 'window.__review.getState()');
          assert.equal(dirtyWhileLate.saving, true);
          assert.equal(dirtyWhileLate.dirty, true);
          lateSave.release();
          const latePersisted = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            const working = harness.readWorking();
            return !state.saving && !state.dirty
              && working.state.notes === 'Current metadata survives a late save.'
              && working.state.selectedId === seeded.firstId
              && working.state.caret?.id === seeded.firstId
              && saveRequests() === lateSaveRequestsBefore + 2
              ? { state, working }
              : null;
          }, 'coalesced follow-up persists metadata changed behind a late save', 8_000);

          // The next undo must reach the last real commit (B's geometry edit), not a
          // phantom cancellation/metadata entry. Redo is kept local and disposed.
          const afterUndo = await harness.command({ type: 'undo' });
          const afterRedo = await harness.command({ type: 'redo' });
          evidence.json('cancelled-drag-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            committedB,
            draggedB,
            draggedBeforeInactive,
            persistedDuringDragB: geometry(persistedDuringDrag.state, seeded.secondId),
            liveAfterCancelB: geometry(liveAfterCancel, seeded.secondId),
            persistedAfterCancelB: geometry(persistedAfterCancel.state, seeded.secondId),
            persistedAfterExplicitB: geometry(persistedAfterExplicit.state, seeded.secondId),
            inactiveCancellation: {
              inactiveB: geometry(inactiveCancelled, seeded.secondId),
              resumedB: geometry(resumedAfterInactive, seeded.secondId),
              persistedB: geometry(persistedAfterInactive.state, seeded.secondId),
            },
            lateSave: {
              dirtyWhileLate: dirtyWhileLate.dirty,
              requests: saveRequests() - lateSaveRequestsBefore,
              persistedNotes: latePersisted.working.state.notes,
              selectedId: latePersisted.working.state.selectedId,
              caret: latePersisted.working.state.caret,
              tool: latePersisted.working.state.tool,
            },
            stateAfterCancel: {
              tool: liveAfterCancel.tool,
              selectedId: liveAfterCancel.selectedId,
              caret: liveAfterCancel.caret,
              dirty: liveAfterCancel.dirty,
            },
            saves: {
              beforeDrag: savesBeforeDrag,
              afterAutosave: saveRequests(),
              beforeExplicit: savesBeforeExplicit,
              afterExplicit: savesAfterExplicit,
            },
            undo: {
              annotationCount: afterUndo.annotations.length,
              first: geometry(afterUndo, seeded.firstId),
              second: geometry(afterUndo, seeded.secondId),
              expectedSecond: geometry({ annotations: [seeded.secondBeforeEdit] }, seeded.secondId),
              selectedId: afterUndo.selectedId,
              caret: afterUndo.caret,
              tool: afterUndo.tool,
            },
          });

          // Assert: cancellation restores both representations, explicit Save can
          // repair any race, and tool/selection/caret/history semantics are retained.
          const failures = [];
          collect(failures, () => assert.deepEqual(geometry(persistedDuringDrag.state, seeded.secondId), committedB));
          collect(failures, () => assert.equal(persistedDuringDrag.state.tool, 'select'));
          collect(failures, () => assert.equal(persistedDuringDrag.state.selectedId, seeded.secondId));
          collect(failures, () => assert.deepEqual(persistedDuringDrag.state.caret, {
            id: seeded.secondId,
            field: 'comment',
            start: 0,
            end: 0,
            direction: 'none',
          }));
          collect(failures, () => assert.deepEqual(geometry(liveAfterCancel, seeded.secondId), committedB));
          collect(failures, () => assert.deepEqual(geometry(persistedAfterCancel.state, seeded.secondId), committedB));
          collect(failures, () => assert.deepEqual(geometry(persistedAfterExplicit.state, seeded.secondId), committedB));
          collect(failures, () => assert.equal(liveAfterCancel.tool, 'select'));
          collect(failures, () => assert.equal(liveAfterCancel.selectedId, seeded.secondId));
          collect(failures, () => assert.deepEqual(liveAfterCancel.caret, {
            id: seeded.secondId,
            field: 'comment',
            start: 0,
            end: 0,
            direction: 'none',
          }));
          collect(failures, () => assert.deepEqual(geometry(inactiveCancelled, seeded.secondId), committedB));
          collect(failures, () => assert.deepEqual(geometry(resumedAfterInactive, seeded.secondId), committedB));
          collect(failures, () => assert.deepEqual(geometry(persistedAfterInactive.state, seeded.secondId), committedB));
          collect(failures, () => assert.equal(resumedAfterInactive.tool, 'select'));
          collect(failures, () => assert.equal(resumedAfterInactive.selectedId, seeded.secondId));
          collect(failures, () => assert.deepEqual(resumedAfterInactive.caret, liveAfterCancel.caret));
          collect(failures, () => assert.equal(saveRequests() - lateSaveRequestsBefore, 2));
          collect(failures, () => assert.equal(latePersisted.working.state.tool, 'select'));
          collect(failures, () => assert.equal(latePersisted.working.state.selectedId, seeded.firstId));
          collect(failures, () => assert.deepEqual(latePersisted.working.state.caret, {
            id: seeded.firstId,
            field: 'comment',
            start: 0,
            end: 0,
            direction: 'none',
          }));
          collect(failures, () => assert.equal(afterUndo.annotations.length, 2));
          collect(failures, () => assert.deepEqual(
            geometry(afterUndo, seeded.secondId),
            geometry({ annotations: [seeded.secondBeforeEdit] }, seeded.secondId),
          ));
          collect(failures, () => assert.deepEqual(
            geometry(afterUndo, seeded.firstId),
            geometry(seeded.committed, seeded.firstId),
          ));
          collect(failures, () => assert.equal(afterUndo.selectedId, seeded.firstId));
          collect(failures, () => assert.deepEqual(afterUndo.caret, latePersisted.working.state.caret));
          collect(failures, () => assert.equal(afterUndo.tool, 'select'));
          collect(failures, () => assert.deepEqual(afterRedo.annotations, seeded.committed.annotations));
          assert.deepEqual(failures, [], failures.join('\n'));
        } finally {
          try {
            await harness.page.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
            await harness.page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
          } catch {}
          await harness.close();
        }
      });

test('T010 review regression: click-only selection persists across unchanged-source reopen', { timeout: 120_000, concurrency: false }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'selection regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-click-selection-regression');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>html,body{margin:0;min-height:100%;background:#ffffff;color:#242424;font:16px system-ui}</style>',
          '<main><h1>Selection persistence fixture</h1><p>No source or annotation geometry changes.</p></main>',
          '',
        ].join('\n');
        const harness = await createT010ReviewHarness(context, {
          number: '715',
          slug: 'click-selection-persistence',
          html,
          profileOwnership,
        });
        try {
          // Arrange: B is the persisted selection in a clean two-annotation review.
          const seeded = await seedTwoReviewAnnotations(harness);
          const annotationsAtCommit = structuredClone(seeded.committed.annotations);
          const savesBeforeClick = harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          assert.equal(seeded.committed.selectedId, seeded.secondId);
          assert.equal(seeded.committed.dirty, false);

          // Act: an actual mouse press/release on A's border has zero movement.
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: 60,
            y: 125,
            button: 'left',
            buttons: 1,
            clickCount: 1,
          });
          await harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: 60,
            y: 125,
            button: 'left',
            buttons: 0,
            clickCount: 1,
          });
          const afterClick = await until(async () => {
            const state = await evaluate(harness.page, 'window.__review.getState()');
            return !state.busy && state.selectedId === seeded.firstId ? state : null;
          }, 'click-only live selection of A');
          const afterSelectionUndo = await harness.command({ type: 'undo' });
          const afterSelectionRedo = await harness.command({ type: 'redo' });
          const explicit = await harness.command({ type: 'save' });
          assert.equal(explicit.status, 'saved');
          const persisted = harness.readWorking();
          const reopen = await harness.postJson('/api/needs-you/review/open', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
          });
          assert.equal(reopen.response.status, 202);
          await harness.mount(reopen.payload);
          const reopened = await evaluate(harness.page, 'window.__review.getState()');
          const screenshot = await harness.screenshot();
          const screenshotEvidence = evidence.image('click-selection-reopen.png', screenshot);
          const savesAfterClick = harness.network.filter(({ request }) => (
            new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          evidence.json('click-selection-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            selected: {
              persistedBeforeClick: seeded.secondId,
              clickedLive: afterClick.selectedId,
              workingFile: persisted.state.selectedId,
              openResponse: reopen.payload.working.selectedId,
              remountedLive: reopened.selectedId,
            },
            dirtyAfterClick: afterClick.dirty,
            historyAfterClick: {
              firstUndoSecond: afterSelectionUndo.annotations.find(({ id }) => id === seeded.secondId),
              expectedSecond: seeded.secondBeforeEdit,
              redoRestoredCommitted: JSON.stringify(afterSelectionRedo.annotations) === JSON.stringify(annotationsAtCommit),
            },
            saveRequests: {
              beforeClick: savesBeforeClick,
              afterExplicitSave: savesAfterClick,
            },
            annotationGeometryUnchanged: JSON.stringify(afterClick.annotations) === JSON.stringify(annotationsAtCommit),
            sourceRevision: harness.request.fields.artifact.revision,
            reopenedSourceRevision: reopen.payload.preview.artifact.revision,
            screenshot: screenshotEvidence,
          });

          // Assert: selection is a persisted working-state change in its own right.
          // No geometry/text edit or undo entry is needed to make A survive reopen.
          const failures = [];
          collect(failures, () => assert.equal(afterClick.selectedId, seeded.firstId));
          collect(failures, () => assert.equal(afterClick.dirty, true));
          collect(failures, () => assert.deepEqual(afterClick.annotations, annotationsAtCommit));
          collect(failures, () => assert.deepEqual(
            afterSelectionUndo.annotations.find(({ id }) => id === seeded.secondId),
            seeded.secondBeforeEdit,
          ));
          collect(failures, () => assert.deepEqual(
            afterSelectionUndo.annotations.find(({ id }) => id === seeded.firstId),
            annotationsAtCommit.find(({ id }) => id === seeded.firstId),
          ));
          collect(failures, () => assert.equal(afterSelectionUndo.selectedId, seeded.firstId));
          collect(failures, () => assert.deepEqual(afterSelectionRedo.annotations, annotationsAtCommit));
          collect(failures, () => assert.equal(afterSelectionRedo.selectedId, seeded.firstId));
          collect(failures, () => assert.equal(persisted.state.selectedId, seeded.firstId));
          collect(failures, () => assert.deepEqual(persisted.state.annotations, annotationsAtCommit));
          collect(failures, () => assert.equal(reopen.payload.preview.artifact.revision, harness.request.fields.artifact.revision));
          collect(failures, () => assert.equal(reopen.payload.working.selectedId, seeded.firstId));
          collect(failures, () => assert.equal(reopened.selectedId, seeded.firstId));
          collect(failures, () => assert.deepEqual(reopened.annotations, annotationsAtCommit));
          assert.deepEqual(failures, [], failures.join('\n'));
        } finally {
          await harness.close();
        }
      });

test('T010 review regression: Comment-armed pins select, move, open, and still capture elsewhere', {
        timeout: 240_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'Comment-pin regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-comment-pin');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          'html,body{margin:0;width:100%;height:100%;overflow:hidden;',
          'background:#fff;color:#242424;font:16px system-ui}',
          'main{position:relative;width:100%;height:100%;padding:24px;box-sizing:border-box}',
          'section{position:absolute;padding:16px;border:1px solid #d1d1d1}',
          '#one{left:80px;top:100px;width:360px;height:250px}',
          '#two{left:700px;top:100px;width:230px;height:180px}',
          '</style>',
          '<main><h1>Comment pin fixture</h1>',
          '<section id="one">Existing pins remain editable while Comment stays armed.</section>',
          '<section id="two">Empty source locations still accept new pins.</section>',
          '</main>',
        ].join('');
        const harness = await createT010ReviewHarness(context, {
          number: '717',
          slug: 'comment-pin-regression',
          html,
          width: 1000,
          height: 700,
          profileOwnership,
        });
        try {
          const readState = () => evaluate(harness.page, 'window.__review.getState()');
          const idle = (label = 'the Comment-pin engine is idle') => until(async () => {
            const state = await readState();
            return state.busy ? null : state;
          }, label);
          const geometryOf = (state, id) => {
            const annotation = state.annotations.find((entry) => entry.id === id);
            assert.ok(annotation, `annotation ${id} is present`);
            return {
              x1: annotation.x1,
              y1: annotation.y1,
              x2: annotation.x2,
              y2: annotation.y2,
            };
          };
          const pointOf = (state, id) => {
            const geometry = geometryOf(state, id);
            return { x: geometry.x1, y: geometry.y1 };
          };
          const messageCount = (code) => evaluate(harness.page, `window.__reviewMessages
            .filter(message => message.code === ${JSON.stringify(code)}).length`);
          const addCount = () => messageCount('review_comment_added');
          const openCount = () => messageCount('review_comment_open');
          const saveRequests = () => harness.network.filter(({ request }) => (
            request.method === 'POST'
              && new URL(request.url).pathname === '/api/needs-you/review/save'
          )).length;
          const workingBytes = () => fs.readFileSync(path.join(
            harness.reviewDirectory,
            'working.json',
          ));
          const opening = await readState();
          const viewport = opening.view.viewport;
          assert.deepEqual(
            {
              width: viewport.width,
              height: viewport.height,
              scrollX: viewport.scrollX,
              scrollY: viewport.scrollY,
            },
            { width: 1000, height: 700, scrollX: 0, scrollY: 0 },
            'the pointer fixture uses the requested document CSS coordinates',
          );
          const frame = await evaluate(harness.page, `(() => {
            const rect = document.querySelector('.dude-review-overlay').getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })()`);
          const client = ({ x, y }) => ({
            x: frame.left + (x - viewport.scrollX) * frame.width / viewport.width,
            y: frame.top + (y - viewport.scrollY) * frame.height / viewport.height,
          });
          const hover = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', ...client(point), button: 'none', buttons: 0,
          });
          const pressAt = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', ...client(point), button: 'left', buttons: 1, clickCount: 1,
          });
          const moveTo = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', ...client(point), button: 'left', buttons: 1,
          });
          const releaseAt = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', ...client(point), button: 'left', buttons: 0, clickCount: 1,
          });
          const clickAt = async (point) => {
            await hover(point);
            await pressAt(point);
            await releaseAt(point);
          };
          const dragFromTo = async (start, end) => {
            await hover(start);
            await pressAt(start);
            await moveTo(end);
            await releaseAt(end);
          };
          const outAndBack = async (start, away, id) => {
            await hover(start);
            await pressAt(start);
            await moveTo(away);
            const during = await until(async () => {
              const state = await readState();
              const geometry = geometryOf(state, id);
              return state.busy
                && (geometry.x1 !== start.x || geometry.y1 !== start.y
                  || geometry.x2 !== start.x || geometry.y2 !== start.y)
                ? state
                : null;
            }, 'the pin is observably displaced while its pointer is held');
            await moveTo(start);
            await releaseAt(start);
            return during;
          };
          const overlayAction = () => evaluate(harness.page, `(() => {
            const overlay = document.querySelector('.dude-review-overlay');
            return {
              action: overlay.dataset.action ?? null,
              cursor: getComputedStyle(overlay).cursor,
            };
          })()`);
          const actionAt = async (point, expected, label) => {
            let observed;
            await until(async () => {
              await hover(point);
              observed = await overlayAction();
              return observed.action === expected.action && observed.cursor === expected.cursor;
            }, label);
            return observed;
          };
          const atCount = (count, label) => until(async () => {
            const state = await readState();
            return !state.busy && state.annotations.length === count ? state : null;
          }, label);
          const selected = async (id, count, label) => {
            const state = await idle(`${label} settles`);
            assert.equal(
              state.annotations.length,
              count,
              `${label}: annotation count`,
            );
            assert.equal(state.selectedId, id, `${label}: selected annotation`);
            return state;
          };
          const separate = () => new Promise((resolve) => setTimeout(resolve, 650));
          await evaluate(harness.page, `(() => {
            window.__t010PinPresses = [];
            document.addEventListener('pointerdown', event => {
              if (!event.isTrusted || !event.target.closest?.('.dude-review-overlay')) return;
              window.__t010PinPresses.push({
                at:event.timeStamp,
                x:event.clientX,
                y:event.clientY,
                annotation:event.target.closest('g[data-annotation]')?.dataset.annotation ?? null,
              });
            }, { capture: true });
          })()`);
          const pressCount = () => evaluate(harness.page, 'window.__t010PinPresses.length');
          const pairMetrics = async (start) => {
            const presses = await evaluate(
              harness.page,
              `window.__t010PinPresses.slice(${start})`,
            );
            return {
              count: presses.length,
              elapsed: presses.length === 2 ? presses[1].at - presses[0].at : null,
              distance: presses.length === 2
                ? Math.hypot(presses[1].x - presses[0].x, presses[1].y - presses[0].y)
                : null,
              annotations: presses.map(({ annotation }) => annotation),
            };
          };
          const assertPair = (metrics, label) => {
            assert.equal(metrics.count, 2, `${label} contains two trusted presses`);
            assert.ok(metrics.elapsed >= 0 && metrics.elapsed <= 500,
              `${label} stays inside 500 ms: ${JSON.stringify(metrics)}`);
            assert.ok(metrics.distance <= 4,
              `${label} stays inside 4 px: ${JSON.stringify(metrics)}`);
          };

          // Arrange: place two ordinary anchored pins, save them, and retain
          // their source identity before exercising existing-marker routing.
          await harness.command({ type: 'tool', tool: 'comment' });
          await clickAt({ x: 200, y: 200 });
          const firstPlaced = await atCount(1, 'the first empty-source press places a pin');
          const firstId = firstPlaced.annotations[0].id;
          await clickAt({ x: 500, y: 200 });
          const secondPlaced = await atCount(2, 'a later empty-source press places another pin');
          const secondId = secondPlaced.annotations[1].id;
          assert.deepEqual(
            {
              tools: secondPlaced.annotations.map(({ tool }) => tool),
              selectedId: secondPlaced.selectedId,
              tool: secondPlaced.tool,
              addMessages: await addCount(),
              openMessages: await openCount(),
            },
            {
              tools: ['comment', 'comment'],
              selectedId: secondId,
              tool: 'comment',
              addMessages: 2,
              openMessages: 0,
            },
            'ordinary Comment presses add and select exactly the intended pins',
          );
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const arrangedWorking = harness.readWorking();
          const arrangedView = structuredClone(secondPlaced.view);
          const firstIdentity = structuredClone(arrangedWorking.state.annotations[0]);
          const artifactPath = path.join(
            harness.workspace.root,
            ...harness.feature.artifactPath.split('/'),
          );
          const artifactRevision = harness.workspace.revision(fs.readFileSync(artifactPath));
          assert.equal(artifactRevision, harness.request.fields.artifact.revision);

          // Act: press both an earlier and a later pin while Comment remains
          // armed. Assert selection, count, coordinates, cursor, and messages,
          // rather than accepting the cursor as a proxy for the action.
          await clickAt({ x: 200, y: 200 });
          const firstSelected = await selected(
            firstId,
            2,
            'pressing the first pin selects it without duplication',
          );
          await clickAt({ x: 500, y: 200 });
          const secondSelected = await selected(
            secondId,
            2,
            'pressing the later pin selects it without duplication',
          );
          const firstCursor = await actionAt(
            { x: 200, y: 200 },
            { action: 'move', cursor: 'move' },
            'Comment exposes the existing first pin as movable',
          );
          assert.deepEqual(firstSelected.annotations, secondSelected.annotations);
          assert.equal(secondSelected.tool, 'comment');
          assert.equal(await addCount(), 2);
          assert.equal(await openCount(), 0);
          assert.equal(
            await evaluate(harness.page,
              "document.querySelectorAll('.dude-review-overlay [data-handle]').length"),
            0,
            'a selected pin has no resize handles',
          );

          // Act: drag the first pin and traverse that one committed movement in
          // both history directions before saving its exact point geometry.
          await clickAt({ x: 200, y: 200 });
          await selected(firstId, 2, 'the first pin is selected for movement');
          const beforeMove = await idle();
          const beforeMoveGeometry = geometryOf(beforeMove, firstId);
          await dragFromTo({ x: 200, y: 200 }, { x: 218, y: 212 });
          const moved = await until(async () => {
            const state = await readState();
            return !state.busy && geometryOf(state, firstId).x1 === 218 ? state : null;
          }, 'the Comment-armed drag commits the first pin movement');
          assert.deepEqual(geometryOf(moved, firstId), {
            x1: 218, y1: 212, x2: 218, y2: 212,
          });
          assert.deepEqual(geometryOf(moved, secondId), geometryOf(beforeMove, secondId));
          assert.equal(moved.selectedId, firstId);
          assert.equal(moved.tool, 'comment');
          assert.equal(moved.annotations.length, 2);
          assert.equal(moved.canUndo, true);
          const moveUndone = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(moveUndone, firstId), beforeMoveGeometry);
          assert.equal(moveUndone.canRedo, true);
          const moveRedone = await harness.command({ type: 'redo' });
          assert.deepEqual(geometryOf(moveRedone, firstId), geometryOf(moved, firstId));
          assert.equal(moveRedone.canRedo, false);
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const movedWorking = harness.readWorking();
          assert.deepEqual(
            geometryOf(movedWorking.state, firstId),
            geometryOf(moved, firstId),
            'working.json stores the committed pin movement',
          );

          // Assert: redo and Save are inert when there is no future or dirty
          // state. Neither may rewrite working.json or issue another save.
          const noOpBytes = workingBytes();
          const noOpRequests = saveRequests();
          const beforeNoOps = await readState();
          const noOpRedo = await harness.command({ type: 'redo' });
          const noOpSave = await harness.command({ type: 'save' });
          assert.deepEqual(noOpRedo.annotations, beforeNoOps.annotations);
          assert.equal(noOpRedo.selectedId, beforeNoOps.selectedId);
          assert.equal(noOpRedo.canRedo, false);
          assert.equal(noOpSave.workingRevision, beforeNoOps.workingRevision);
          assert.equal(saveRequests(), noOpRequests);
          assert.deepEqual(workingBytes(), noOpBytes);

          // Act: a bounded native pair opens the pin once, while Enter on the
          // selected overlay is its keyboard twin. Neither path adds or moves.
          const movedPoint = pointOf(moved, firstId);
          await separate();
          const opensBeforePair = await openCount();
          const pairStart = await pressCount();
          await clickAt(movedPoint);
          await clickAt(movedPoint);
          const pair = await pairMetrics(pairStart);
          assertPair(pair, 'the existing-pin open gesture');
          assert.deepEqual(pair.annotations, [firstId, firstId]);
          const afterPair = await until(async () => {
            const state = await readState();
            return !state.busy && await openCount() === opensBeforePair + 1 ? state : null;
          }, 'two unmoved pin presses open one comment');
          assert.equal(afterPair.annotations.length, 2);
          assert.equal(afterPair.selectedId, firstId);
          assert.equal(afterPair.tool, 'comment');
          assert.deepEqual(geometryOf(afterPair, firstId), geometryOf(moved, firstId));
          await focus(harness.page, '.dude-review-overlay');
          const opensBeforeEnter = await openCount();
          await key(harness.page, 'Enter', 'Enter');
          const afterEnter = await until(async () => {
            const state = await readState();
            return await openCount() === opensBeforeEnter + 1 ? state : null;
          }, 'Enter opens the selected pin comment');
          assert.equal(
            await evaluate(harness.page,
              "document.activeElement === document.querySelector('.dude-review-overlay')"),
            true,
            'the direct engine emits the open request without moving surface focus',
          );
          assert.deepEqual(afterEnter.annotations, afterPair.annotations);
          assert.equal(afterEnter.selectedId, firstId);

          // Act: empty source still adds, stacked pins choose the one painted
          // last, and the earliest pin remains reachable away from the stack.
          await separate();
          await clickAt({ x: 820, y: 470 });
          const thirdPlaced = await atCount(3, 'empty source away from pins adds a third pin');
          const thirdId = thirdPlaced.annotations[2].id;
          assert.equal(thirdPlaced.selectedId, thirdId);
          assert.ok(thirdPlaced.annotations[2].element);
          await clickAt({ x: 820, y: 180 });
          const fourthPlaced = await atCount(4, 'a fourth pin is placed before overlap');
          const fourthId = fourthPlaced.annotations[3].id;
          const stackedPoint = pointOf(fourthPlaced, secondId);
          await dragFromTo(pointOf(fourthPlaced, fourthId), stackedPoint);
          const stacked = await until(async () => {
            const state = await readState();
            return !state.busy
              && geometryOf(state, fourthId).x1 === stackedPoint.x
              && geometryOf(state, fourthId).y1 === stackedPoint.y ? state : null;
          }, 'the later pin is moved directly over the earlier pin');
          assert.equal(stacked.annotations.length, 4);
          await separate();
          await clickAt(stackedPoint);
          const topmost = await selected(
            fourthId,
            4,
            'the topmost overlapping pin takes the Comment press',
          );
          await separate();
          await clickAt(movedPoint);
          const earliest = await selected(
            firstId,
            4,
            'the earliest uncovered pin remains selectable',
          );
          assert.equal(await addCount(), 4);

          // Act: Box ignores pins as drawing-mode grab targets. Comment then
          // gives a pin inside a newer box precedence, while Select retains its
          // existing topmost whole-face answer.
          await harness.command({ type: 'tool', tool: 'box' });
          const boxOverPinCursor = await actionAt(
            stackedPoint,
            { action: null, cursor: 'crosshair' },
            'Box keeps its drawing cursor over an existing pin',
          );
          const stackedBeforeBox = structuredClone(topmost.annotations);
          await dragFromTo(stackedPoint, { x: stackedPoint.x + 90, y: stackedPoint.y + 70 });
          const boxOverPinState = await atCount(5, 'Box draws from an existing pin');
          const boxOverPin = boxOverPinState.annotations[4];
          assert.equal(boxOverPin.tool, 'box');
          assert.equal(boxOverPinState.selectedId, boxOverPin.id);
          assert.deepEqual(
            boxOverPinState.annotations.slice(0, 4),
            stackedBeforeBox,
            'drawing from a pin moves or duplicates no existing pin',
          );
          await dragFromTo({ x: 150, y: 150 }, { x: 430, y: 330 });
          const enclosingState = await atCount(6, 'a later box encloses the first pin');
          const enclosingBox = enclosingState.annotations[5];
          assert.equal(enclosingBox.tool, 'box');
          assert.ok(
            movedPoint.x > Math.min(enclosingBox.x1, enclosingBox.x2)
              && movedPoint.x < Math.max(enclosingBox.x1, enclosingBox.x2)
              && movedPoint.y > Math.min(enclosingBox.y1, enclosingBox.y2)
              && movedPoint.y < Math.max(enclosingBox.y1, enclosingBox.y2),
            'the mode-precedence probe is genuinely inside the later box',
          );
          await harness.command({ type: 'tool', tool: 'comment' });
          const overlapCursor = await actionAt(
            movedPoint,
            { action: 'move', cursor: 'move' },
            'Comment exposes the pin even inside the later box',
          );
          await clickAt(movedPoint);
          const commentOverlap = await selected(
            firstId,
            6,
            'Comment selects the pin inside the later box',
          );
          await harness.command({ type: 'tool', tool: 'select' });
          await separate();
          await clickAt(movedPoint);
          const selectOverlap = await selected(
            enclosingBox.id,
            6,
            'Select keeps its topmost box-face precedence at the same point',
          );
          await clickAt(pointOf(selectOverlap, thirdId));
          const selectPin = await selected(
            thirdId,
            6,
            'Select still picks an uncovered pin by its existing marker predicate',
          );

          // Act: Comment on source covered only by a drawing adds a new pin and
          // does not edit that drawing.
          await harness.command({ type: 'tool', tool: 'comment' });
          const enclosingBeforeComment = geometryOf(selectPin, enclosingBox.id);
          await separate();
          await clickAt({ x: 350, y: 300 });
          const shapeOnly = await atCount(7, 'Comment inside a shape-only location adds a pin');
          const shapeOnlyId = shapeOnly.annotations[6].id;
          assert.equal(shapeOnly.annotations[6].tool, 'comment');
          assert.equal(shapeOnly.selectedId, shapeOnlyId);
          assert.ok(shapeOnly.annotations[6].element);
          assert.deepEqual(geometryOf(shapeOnly, enclosingBox.id), enclosingBeforeComment);

          // Arrange a retained viewport-hidden pin through the supported edit
          // path. Its invisible point cannot become a Comment grab target.
          const shapeOnlyOriginal = geometryOf(shapeOnly, shapeOnlyId);
          await harness.command({
            type: 'edit',
            id: shapeOnlyId,
            changes: { x1: 10, y1: 10, x2: 10, y2: 10 },
          });
          await harness.command({ type: 'select', id: firstId });
          const hiddenBefore = await idle('the hidden-pin fixture is idle');
          assert.ok(hiddenBefore.hiddenIds.includes(shapeOnlyId));
          assert.equal(
            await evaluate(harness.page,
              `document.querySelector('[data-annotation="${shapeOnlyId}"]') === null`),
            true,
            'the retained out-of-viewport pin has no painted marker',
          );
          const hiddenCursor = await actionAt(
            { x: 10, y: 10 },
            { action: null, cursor: 'crosshair' },
            'an invisible pin is not offered as movable',
          );
          const hiddenAdds = await addCount();
          const hiddenOpens = await openCount();
          await clickAt({ x: 10, y: 10 });
          const hiddenAfter = await until(async () => {
            const state = await readState();
            return !state.busy && state.error?.code === 'review_drawing_outside'
              ? state
              : null;
          }, 'the edge press is refused as a new candidate, not routed to the hidden pin');
          assert.equal(hiddenAfter.annotations.length, 7);
          assert.equal(hiddenAfter.selectedId, firstId);
          assert.deepEqual(geometryOf(hiddenAfter, shapeOnlyId), {
            x1: 10, y1: 10, x2: 10, y2: 10,
          });
          assert.equal(await addCount(), hiddenAdds);
          assert.equal(await openCount(), hiddenOpens);
          const hiddenRestored = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(hiddenRestored, shapeOnlyId), shapeOnlyOriginal);

          // Arrange one redo opportunity, then make a genuine out-and-back pin
          // motion followed immediately by one press. The net-equal motion adds
          // no history and cannot prime comment opening.
          await harness.command({ type: 'select', id: firstId });
          const outBackBase = geometryOf(await idle(), firstId);
          const outBackPoint = { x: outBackBase.x1, y: outBackBase.y1 };
          const redoPoint = { x: outBackPoint.x + 24, y: outBackPoint.y + 18 };
          await dragFromTo(outBackPoint, redoPoint);
          const committedForRedo = await until(async () => {
            const state = await readState();
            return !state.busy && geometryOf(state, firstId).x1 === redoPoint.x ? state : null;
          }, 'a real pin move creates the redo fixture');
          const beforeOutBack = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(beforeOutBack, firstId), outBackBase);
          assert.equal(beforeOutBack.canRedo, true);
          await separate();
          const outBackAdds = await addCount();
          const outBackOpens = await openCount();
          const outBackStart = await pressCount();
          const outBackHeld = await outAndBack(
            outBackPoint,
            { x: outBackPoint.x + 20, y: outBackPoint.y + 14 },
            firstId,
          );
          assert.notDeepEqual(geometryOf(outBackHeld, firstId), outBackBase);
          await clickAt(outBackPoint);
          const afterOutBack = await idle('the out-and-back pin gesture and follower settle');
          const outBackPair = await pairMetrics(outBackStart);
          assertPair(outBackPair, 'the out-and-back pin motion and its following press');
          assert.deepEqual(geometryOf(afterOutBack, firstId), outBackBase);
          assert.equal(afterOutBack.canRedo, true);
          assert.equal(afterOutBack.selectedId, firstId);
          assert.equal(afterOutBack.tool, 'comment');
          assert.equal(await addCount(), outBackAdds);
          assert.equal(await openCount(), outBackOpens);
          const redoAfterOutBack = await harness.command({ type: 'redo' });
          assert.deepEqual(
            geometryOf(redoAfterOutBack, firstId),
            geometryOf(committedForRedo, firstId),
            'the redo opportunity survives the net-equal pin motion',
          );
          const baseAgain = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(baseAgain, firstId), outBackBase);

          // Act: a 2x1-pixel effective pin move and immediate follower remain
          // inside the open gesture's spatial and timing bounds. Manipulation,
          // rather than distance alone, disqualifies the pair.
          await separate();
          const tinyPoint = { x: outBackPoint.x + 2, y: outBackPoint.y + 1 };
          const tinyAdds = await addCount();
          const tinyOpens = await openCount();
          const tinyStart = await pressCount();
          await dragFromTo(outBackPoint, tinyPoint);
          const tinyMoved = await until(async () => {
            const state = await readState();
            return !state.busy && geometryOf(state, firstId).x1 === tinyPoint.x ? state : null;
          }, 'the tiny effective pin movement commits');
          await clickAt(tinyPoint);
          const tinyAfterFollower = await idle('the tiny pin movement follower settles');
          const tinyPair = await pairMetrics(tinyStart);
          assertPair(tinyPair, 'the tiny pin movement and its following press');
          assert.deepEqual(geometryOf(tinyMoved, firstId), {
            x1: tinyPoint.x, y1: tinyPoint.y, x2: tinyPoint.x, y2: tinyPoint.y,
          });
          assert.equal(tinyAfterFollower.selectedId, firstId);
          assert.equal(tinyAfterFollower.tool, 'comment');
          assert.equal(tinyAfterFollower.annotations.length, 7);
          assert.equal(await addCount(), tinyAdds);
          assert.equal(await openCount(), tinyOpens);
          const tinyUndone = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(tinyUndone, firstId), outBackBase);
          assert.equal(tinyUndone.canRedo, true);
          const tinyRedone = await harness.command({ type: 'redo' });
          assert.deepEqual(geometryOf(tinyRedone, firstId), geometryOf(tinyMoved, firstId));
          assert.equal(tinyRedone.canRedo, false);
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const tinyWorking = harness.readWorking();
          assert.deepEqual(geometryOf(tinyWorking.state, firstId), geometryOf(tinyMoved, firstId));

          // Act: save metadata during a real held pin preview, then cancel that
          // pointer. Only committed coordinates may reach working.json.
          const previewBase = geometryOf(await idle(), firstId);
          const previewPoint = { x: previewBase.x1, y: previewBase.y1 };
          const previewClient = client(previewPoint);
          const previewAdds = await addCount();
          const previewOpens = await openCount();
          await harness.page.send('Emulation.setTouchEmulationEnabled', {
            enabled: true,
            maxTouchPoints: 1,
          });
          await harness.page.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{
              ...previewClient, radiusX: 1, radiusY: 1, force: 1, id: 1,
            }],
          });
          await harness.page.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{
              x: previewClient.x + 30,
              y: previewClient.y + 20,
              radiusX: 1,
              radiusY: 1,
              force: 1,
              id: 1,
            }],
          });
          const heldPreview = await until(async () => {
            const state = await readState();
            return state.busy
              && JSON.stringify(geometryOf(state, firstId)) !== JSON.stringify(previewBase)
              ? state
              : null;
          }, 'the native touch pointer holds a changed pin preview');
          assert.notDeepEqual(geometryOf(heldPreview, firstId), previewBase);
          await harness.command({
            type: 'notes',
            text: 'Committed pin geometry survives a preview save.',
          });
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const persistedDuringPreview = harness.readWorking();
          assert.deepEqual(
            geometryOf(persistedDuringPreview.state, firstId),
            previewBase,
            'the preview save freezes the last committed pin geometry',
          );
          assert.equal(
            persistedDuringPreview.state.notes,
            'Committed pin geometry survives a preview save.',
          );
          await harness.page.send('Input.dispatchTouchEvent', {
            type: 'touchCancel',
            touchPoints: [],
          });
          await harness.page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
          const afterCancel = await until(async () => {
            const state = await readState();
            return !state.busy
              && JSON.stringify(geometryOf(state, firstId)) === JSON.stringify(previewBase)
              ? state
              : null;
          }, 'pointer cancellation restores committed pin geometry');
          assert.equal(afterCancel.tool, 'comment');
          assert.equal(afterCancel.selectedId, firstId);
          assert.equal(afterCancel.canRedo, false);
          assert.equal(await addCount(), previewAdds);
          assert.equal(await openCount(), previewOpens);

          // Assert the complete persisted and authority boundary, including an
          // explicit no-op save after cancellation.
          const finalBytes = workingBytes();
          const finalSaveRequests = saveRequests();
          const finalSave = await harness.command({ type: 'save' });
          assert.equal(finalSave.status, 'saved');
          assert.equal(saveRequests(), finalSaveRequests);
          assert.deepEqual(workingBytes(), finalBytes);
          const finalState = await readState();
          const finalWorking = harness.readWorking();
          const finalFirst = finalWorking.state.annotations.find(({ id }) => id === firstId);
          assert.deepEqual(finalWorking.state.annotations, finalState.annotations);
          assert.equal(finalWorking.state.annotations.length, 7);
          assert.equal(finalWorking.state.selectedId, firstId);
          assert.equal(finalWorking.state.tool, 'comment');
          assert.equal(finalWorking.state.caret, null);
          assert.equal(finalWorking.state.notes, 'Committed pin geometry survives a preview save.');
          assert.deepEqual(geometryOf(finalWorking.state, firstId), previewBase);
          assert.deepEqual(finalState.view, arrangedView);
          assert.deepEqual(finalFirst.element, firstIdentity.element);
          assert.deepEqual(finalFirst.scrollBasis, firstIdentity.scrollBasis);
          assert.equal(
            harness.workspace.revision(fs.readFileSync(artifactPath)),
            artifactRevision,
            'pointer, history, and save paths leave canonical source bytes unchanged',
          );
          assert.equal(
            harness.provider.read().requests.find(
              ({ requestHandle }) => requestHandle === harness.record.requestHandle,
            )?.phase,
            'pending',
            'working pin gestures neither seal nor consume the current request',
          );
          const finalCursor = await actionAt(
            previewPoint,
            { action: 'move', cursor: 'move' },
            'the final persisted pin remains directly movable',
          );
          const screenshot = evidence.image('comment-pin-final.png', await harness.screenshot());
          evidence.json('comment-pin-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            engineSha256: evidence.sources['src/extensions/dude/ui/review/engine.mjs'],
            viewport,
            ids: {
              first: firstId,
              second: secondId,
              third: thirdId,
              fourth: fourthId,
              shapeOnly: shapeOnlyId,
              boxOverPin: boxOverPin.id,
              enclosingBox: enclosingBox.id,
            },
            clickSelection: {
              first: firstSelected.selectedId,
              later: secondSelected.selectedId,
              count: secondSelected.annotations.length,
            },
            movement: {
              before: beforeMoveGeometry,
              committed: geometryOf(moved, firstId),
              undo: geometryOf(moveUndone, firstId),
              redo: geometryOf(moveRedone, firstId),
              tiny: geometryOf(tinyMoved, firstId),
              cancelRestored: geometryOf(afterCancel, firstId),
            },
            opening: {
              pair,
              pairMessages: opensBeforePair + 1,
              enterMessages: opensBeforeEnter + 1,
              directFocusStayedOnOverlay: true,
            },
            precedence: {
              stackedPoint,
              topmost: topmost.selectedId,
              earliest: earliest.selectedId,
              CommentInsideBox: commentOverlap.selectedId,
              SelectInsideBox: selectOverlap.selectedId,
              SelectUncoveredPin: selectPin.selectedId,
            },
            cursors: {
              first: firstCursor,
              boxOverPin: boxOverPinCursor,
              CommentInsideBox: overlapCursor,
              hidden: hiddenCursor,
              final: finalCursor,
            },
            history: {
              outAndBackPair: outBackPair,
              redoSurvivedOutAndBack: afterOutBack.canRedo,
              tinyPair,
              finalCanUndo: finalState.canUndo,
              finalCanRedo: finalState.canRedo,
            },
            persistence: {
              annotationCount: finalWorking.state.annotations.length,
              selectedId: finalWorking.state.selectedId,
              tool: finalWorking.state.tool,
              firstCoordinates: geometryOf(finalWorking.state, firstId),
              workingRevision: finalSave.workingRevision,
              workingSha256: sha256(finalBytes),
              sourceRevision: artifactRevision,
              noOpSaveRequests: saveRequests() - finalSaveRequests,
            },
            screenshot,
          });
        } finally {
          try {
            await harness.page.send('Input.dispatchTouchEvent', {
              type: 'touchCancel',
              touchPoints: [],
            });
            await harness.page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
          } catch {}
          await harness.close();
        }
      });

test('T010 review regression: armed drawing tools reach selected handles and borders while other locations still draw', {
        timeout: 240_000,
        concurrency: false,
      }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'direct-manipulation regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-direct-manipulation');
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>html,body{margin:0;min-height:100%;background:#ffffff;color:#242424;font:16px system-ui}',
          'main{padding:24px}</style>',
          '<main><h1>Direct manipulation fixture</h1><p>Marks are adjusted without changing tools.</p></main>',
          '',
        ].join('\n');
        const harness = await createT010ReviewHarness(context, {
          number: '716',
          slug: 'direct-manipulation',
          html,
          width: 1000,
          height: 700,
          profileOwnership,
        });
        try {
          const readState = () => evaluate(harness.page, 'window.__review.getState()');
          const geometryOf = (state) => Object.fromEntries(state.annotations.map((a) => [
            a.id, { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 },
          ]));
          const commentOpens = () => evaluate(harness.page, `window.__reviewMessages
            .filter(message => message.code === 'review_comment_open').length`);
          const idle = () => until(async () => {
            const state = await readState();
            return state.busy ? null : state;
          }, 'the engine is idle before the next probe');

          // Arrange: one selected shape of each type, placed apart so a probe
          // can only answer for the shape it belongs to.
          const opening = await readState();
          const viewport = opening.view.viewport;
          assert.ok(viewport.width >= 700 && viewport.height >= 430,
            `the routing matrix needs the recorded fixture viewport: ${JSON.stringify(viewport)}`);
          const layout = [
            { tool: 'box', x1: 40, y1: 40, x2: 200, y2: 150 },
            { tool: 'circle', x1: 260, y1: 40, x2: 420, y2: 150 },
            { tool: 'highlight', x1: 480, y1: 40, x2: 640, y2: 150 },
            { tool: 'line', x1: 40, y1: 260, x2: 200, y2: 360 },
            { tool: 'arrow', x1: 260, y1: 260, x2: 420, y2: 360 },
          ];
          const shapes = [];
          for (const shape of layout) {
            await harness.command({ type: 'tool', tool: shape.tool });
            const id = await harness.command({ type: 'addAtCenter' });
            await harness.command({ type: 'edit', id, changes: {
              x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2,
            } });
            shapes.push({ ...shape, id });
          }
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const segment = (shape) => ['line', 'arrow'].includes(shape.tool);
          const handlePoint = (shape) => ({ x: shape.x1, y: shape.y1 });
          const borderPoint = (shape) => (segment(shape)
            ? { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 }
            : { x: shape.x1, y: (shape.y1 + shape.y2) / 2 });
          const interiorPoint = (shape) => ({ x: shape.x1 + 40, y: shape.y1 + 30 });
          const drawingSpace = { x: viewport.width - 120, y: viewport.height - 80 };

          // Real pointer delivery in the same document CSS pixels the engine uses.
          const frame = await evaluate(harness.page, `(() => {
            const rect = document.querySelector('.dude-review-overlay').getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })()`);
          const client = ({ x, y }) => ({
            x: frame.left + (x - viewport.scrollX) * frame.width / viewport.width,
            y: frame.top + (y - viewport.scrollY) * frame.height / viewport.height,
          });
          const hover = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', ...client(point), button: 'none', buttons: 0,
          });
          const pressAt = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', ...client(point), button: 'left', buttons: 1, clickCount: 1,
          });
          const moveTo = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', ...client(point), button: 'left', buttons: 1,
          });
          const releaseAt = (point) => harness.page.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', ...client(point), button: 'left', buttons: 0, clickCount: 1,
          });
          const clickAt = async (point) => {
            await hover(point);
            await pressAt(point);
            await releaseAt(point);
          };
          const overlayAction = () => evaluate(harness.page, `(() => {
            const overlay = document.querySelector('.dude-review-overlay');
            return { action: overlay.dataset.action ?? null, cursor: getComputedStyle(overlay).cursor };
          })()`);
          // Real trusted presses, so a pair is proved to be inside the existing
          // 500 ms / 4 px bounds instead of assumed to be.
          await evaluate(harness.page, `(() => {
            window.__t059Presses = [];
            document.addEventListener('pointerdown', event => {
              if (!event.isTrusted || !event.target.closest?.('.dude-review-overlay')) return;
              window.__t059Presses.push({ at: event.timeStamp, x: event.clientX, y: event.clientY });
            }, { capture: true });
          })()`);
          const pressCount = () => evaluate(harness.page, 'window.__t059Presses.length');
          const pairMetrics = async (start) => {
            const presses = await evaluate(harness.page, `window.__t059Presses.slice(${start})`);
            return {
              count: presses.length,
              elapsed: presses.length === 2 ? presses[1].at - presses[0].at : null,
              distance: presses.length === 2
                ? Math.hypot(presses[1].x - presses[0].x, presses[1].y - presses[0].y) : null,
            };
          };
          const assertPair = (metrics, description) => {
            assert.equal(metrics.count, 2, `${description} contains exactly two trusted presses`);
            assert.ok(metrics.elapsed >= 0 && metrics.elapsed <= 500,
              `${description} stays inside 500 ms: ${JSON.stringify(metrics)}`);
            assert.ok(metrics.distance <= 4,
              `${description} stays inside 4 px: ${JSON.stringify(metrics)}`);
          };
          // Each arrangement starts beyond the existing pairing window, so one
          // case cannot become half of the next one's gesture.
          const separate = () => new Promise((resolve) => { setTimeout(resolve, 650); });
          const actionAt = async (point, expected, description) => {
            let observed = null;
            await until(async () => {
              await hover(point);
              observed = await overlayAction();
              return observed.action === expected.action && observed.cursor === expected.cursor;
            }, description);
            return observed;
          };
          // An out-and-back gesture must be seen moving before it returns, so
          // final equality cannot hide that the mark was actually manipulated.
          const outAndBack = async (start, away) => {
            await hover(start);
            await pressAt(start);
            await moveTo(away);
            const during = await until(async () => {
              const state = await readState();
              return state.busy ? state : null;
            }, 'the held gesture is observed in flight');
            await moveTo(start);
            await releaseAt(start);
            return during;
          };

          // Act + Assert: five armed drawing tools against five selected shapes.
          const matrix = [];
          for (const armed of ['box', 'circle', 'arrow', 'line', 'highlight']) {
            await harness.command({ type: 'tool', tool: armed });
            for (const shape of shapes) {
              await harness.command({ type: 'select', id: shape.id });
              const before = await idle();
              const cursors = {
                handle: await actionAt(handlePoint(shape), { action: 'nwse-resize', cursor: 'nwse-resize' },
                  `${armed} shows a resize cursor on the selected ${shape.tool} handle`),
                border: await actionAt(borderPoint(shape), { action: 'move', cursor: 'move' },
                  `${armed} shows a move cursor on the selected ${shape.tool} border`),
                drawing: await actionAt(drawingSpace, { action: null, cursor: 'crosshair' },
                  `${armed} shows the drawing cursor away from the selected ${shape.tool}`),
              };
              assert.deepEqual(geometryOf(before), geometryOf(await readState()),
                `hovering the selected ${shape.tool} with ${armed} armed changes no geometry`);

              const start = handlePoint(shape);
              const held = await outAndBack(start, { x: start.x + 14, y: start.y + 11 });
              const heldGeometry = geometryOf(held);
              assert.notDeepEqual(heldGeometry[shape.id], geometryOf(before)[shape.id],
                `${armed} armed on the selected ${shape.tool} handle resizes that shape`);
              for (const other of shapes.filter(({ id }) => id !== shape.id)) {
                assert.deepEqual(heldGeometry[other.id], geometryOf(before)[other.id],
                  `resizing the selected ${shape.tool} leaves the ${other.tool} untouched`);
              }
              const after = await idle();
              assert.deepEqual(geometryOf(after), geometryOf(before),
                `returning the ${shape.tool} handle to its origin restores its exact geometry`);
              assert.equal(after.annotations.length, shapes.length,
                `manipulating the selected ${shape.tool} with ${armed} armed creates no annotation`);
              assert.equal(after.tool, armed, `${armed} stays armed after the adjustment`);
              assert.equal(after.selectedId, shape.id, `and the ${shape.tool} stays selected`);
              matrix.push({
                armed,
                selected: shape.tool,
                cursors,
                resized: heldGeometry[shape.id],
                restored: geometryOf(after)[shape.id],
              });
            }
          }
          assert.equal(matrix.length, 25, 'every armed tool is exercised against every selected shape type');

          // Assert: the remaining corner and endpoint cursors name their own directions.
          const box = shapes[0];
          const line = shapes[3];
          await harness.command({ type: 'tool', tool: 'highlight' });
          await harness.command({ type: 'select', id: box.id });
          await idle();
          const cornerCursor = await actionAt({ x: box.x2, y: box.y1 },
            { action: 'nesw-resize', cursor: 'nesw-resize' }, 'the opposite corner names its own diagonal');
          await harness.command({ type: 'select', id: line.id });
          await idle();
          const endpointCursor = await actionAt({ x: line.x2, y: line.y2 },
            { action: 'nwse-resize', cursor: 'nwse-resize' }, 'a segment endpoint follows the stroke direction');

          // Assert: a selected border or stroke moves only its own shape, and
          // that committed adjustment is exactly one undo/redo step.
          const moves = [];
          for (const [index, shape] of shapes.entries()) {
            const armed = ['circle', 'arrow', 'line', 'highlight', 'box'][index];
            await harness.command({ type: 'tool', tool: armed });
            await harness.command({ type: 'select', id: shape.id });
            const before = await idle();
            const start = borderPoint(shape);
            const target = { x: start.x + 18, y: start.y + 12 };
            await hover(start);
            await pressAt(start);
            await moveTo(target);
            await releaseAt(target);
            const moved = await until(async () => {
              const state = await readState();
              return !state.busy && state.annotations.some((a) => a.id === shape.id
                && a.x1 === before.annotations.find((b) => b.id === shape.id).x1 + 18) ? state : null;
            }, `${armed} armed moves the selected ${shape.tool} from its border`);
            const beforeShape = geometryOf(before)[shape.id];
            assert.deepEqual(geometryOf(moved)[shape.id], {
              x1: beforeShape.x1 + 18, y1: beforeShape.y1 + 12,
              x2: beforeShape.x2 + 18, y2: beforeShape.y2 + 12,
            }, `the whole ${shape.tool} translates without changing its dimensions`);
            for (const other of shapes.filter(({ id }) => id !== shape.id)) {
              assert.deepEqual(geometryOf(moved)[other.id], geometryOf(before)[other.id],
                `moving the ${shape.tool} leaves the ${other.tool} untouched`);
            }
            assert.equal(moved.annotations.length, shapes.length, 'the move creates no annotation');
            assert.equal(moved.tool, armed, 'and leaves the drawing tool armed');
            const undone = await harness.command({ type: 'undo' });
            assert.deepEqual(geometryOf(undone)[shape.id], beforeShape,
              `one undo restores the geometry preceding the ${shape.tool} move`);
            const redone = await harness.command({ type: 'redo' });
            assert.deepEqual(geometryOf(redone)[shape.id], geometryOf(moved)[shape.id],
              'and one redo restores that adjustment');
            await harness.command({ type: 'undo' });
            moves.push({ armed, selected: shape.tool, before: beforeShape, moved: geometryOf(moved)[shape.id] });
          }

          // Assert: interiors away from the border and handles still draw.
          const draws = [];
          for (const armed of ['box', 'circle', 'arrow', 'line', 'highlight']) {
            await harness.command({ type: 'tool', tool: armed });
            await harness.command({ type: 'select', id: box.id });
            const before = await idle();
            const from = interiorPoint(box);
            const to = { x: from.x + 60, y: from.y + 50 };
            await hover(from);
            await pressAt(from);
            await moveTo(to);
            await releaseAt(to);
            const drawn = await until(async () => {
              const state = await readState();
              return !state.busy && state.annotations.length === before.annotations.length + 1 ? state : null;
            }, `${armed} draws inside the selected shape`);
            const created = drawn.annotations.at(-1);
            assert.equal(created.tool, armed, 'the interior drawing uses the armed tool');
            assert.equal(drawn.selectedId, created.id, 'and keeps the existing new-selection behavior');
            assert.deepEqual(geometryOf(drawn)[box.id], geometryOf(before)[box.id],
              'while the shape it was drawn inside is unchanged');
            await harness.command({ type: 'delete', id: created.id });
            draws.push({ armed, created: { x1: created.x1, y1: created.y1, x2: created.x2, y2: created.y2 } });
          }

          // Assert: an unselected mark and a bare number badge are not grab targets.
          const circle = shapes[1];
          await harness.command({ type: 'tool', tool: 'box' });
          await harness.command({ type: 'select', id: box.id });
          const beforeUnselected = await idle();
          const unselectedRing = borderPoint(circle);
          const unselectedBadge = { x: circle.x1 - 9, y: circle.y1 - 9 };
          const unselectedCursors = {
            ring: await actionAt(unselectedRing, { action: null, cursor: 'crosshair' },
              'an unselected ring offers no drawing-mode grab'),
            badge: await actionAt(unselectedBadge, { action: null, cursor: 'crosshair' },
              'and neither does its number badge'),
          };
          await hover(unselectedBadge);
          await pressAt(unselectedBadge);
          await moveTo({ x: unselectedBadge.x + 50, y: unselectedBadge.y + 40 });
          await releaseAt({ x: unselectedBadge.x + 50, y: unselectedBadge.y + 40 });
          const overBadge = await until(async () => {
            const state = await readState();
            return !state.busy && state.annotations.length === shapes.length + 1 ? state : null;
          }, 'a press on an unselected badge draws the armed shape instead of grabbing it');
          assert.deepEqual(geometryOf(overBadge)[circle.id], geometryOf(beforeUnselected)[circle.id],
            'the unselected circle is unchanged');
          assert.notEqual(overBadge.selectedId, circle.id, 'and was never selected by that press');
          await harness.command({ type: 'delete', id: overBadge.annotations.at(-1).id });

          // Assert: two unmoved border presses open that shape's comment once,
          // while every manipulated or drawing-only press opens none.
          await harness.command({ type: 'tool', tool: 'highlight' });
          await harness.command({ type: 'select', id: box.id });
          const beforeComments = await idle();
          const commentsBefore = await commentOpens();
          const border = borderPoint(box);
          await separate();
          const qualifyingStart = await pressCount();
          await clickAt(border);
          await clickAt(border);
          assertPair(await pairMetrics(qualifyingStart), 'the qualifying border pair');
          const opened = await until(async () => {
            const state = await readState();
            return !state.busy && await commentOpens() === commentsBefore + 1 ? state : null;
          }, 'two unmoved border presses open the selected shape comment');
          assert.equal(opened.selectedId, box.id, 'the opened comment belongs to the pressed shape');
          assert.equal(opened.tool, 'highlight', 'and the drawing tool stays armed');
          assert.equal(opened.annotations.length, shapes.length, 'no annotation is added');
          assert.deepEqual(geometryOf(opened), geometryOf(beforeComments), 'and no geometry changes');
          const lastMessage = await evaluate(harness.page, 'window.__reviewMessages.at(-1)');
          assert.equal(lastMessage.code, 'review_comment_open');
          assert.equal(lastMessage.error, false);

          const negatives = {};
          await separate();
          const firstOutAndBackStart = await pressCount();
          const heldFirst = await outAndBack(border, { x: border.x + 22, y: border.y + 16 });
          assert.notDeepEqual(geometryOf(heldFirst)[box.id], geometryOf(beforeComments)[box.id],
            'the first out-and-back press genuinely moved the shape');
          await idle();
          await clickAt(border);
          await idle();
          assertPair(await pairMetrics(firstOutAndBackStart), 'the out-and-back press and the press after it');
          negatives.firstPressOutAndBack = await commentOpens();
          assert.equal(negatives.firstPressOutAndBack, commentsBefore + 1,
            'a single press after an out-and-back first press opens no comment');

          await separate();
          const secondOutAndBackStart = await pressCount();
          await clickAt(border);
          const heldSecond = await outAndBack(border, { x: border.x + 22, y: border.y + 16 });
          assert.notDeepEqual(geometryOf(heldSecond)[box.id], geometryOf(beforeComments)[box.id],
            'the second press genuinely moved the shape');
          await idle();
          assertPair(await pairMetrics(secondOutAndBackStart), 'the unmoved press and the moving second press');
          negatives.secondPressOutAndBack = await commentOpens();
          assert.equal(negatives.secondPressOutAndBack, commentsBefore + 1,
            'a moved second press opens no comment');
          const primedStart = await pressCount();
          await clickAt(border);
          await idle();
          negatives.pressAfterMovedSecond = await commentOpens();
          assert.equal(negatives.pressAfterMovedSecond, commentsBefore + 1,
            'and it cannot prime the single press that follows it');
          assert.equal((await pairMetrics(primedStart)).count, 1,
            'that following press is one further trusted press');

          await separate();
          const handlePairStart = await pressCount();
          await clickAt(handlePoint(box));
          await clickAt(handlePoint(box));
          await idle();
          assertPair(await pairMetrics(handlePairStart), 'the handle pair');
          negatives.handlePair = await commentOpens();
          assert.equal(negatives.handlePair, commentsBefore + 1, 'a handle pair opens no comment');
          await separate();
          const drawingPairStart = await pressCount();
          await clickAt(drawingSpace);
          await clickAt(drawingSpace);
          await idle();
          assertPair(await pairMetrics(drawingPairStart), 'the drawing-space pair');
          negatives.drawingSpacePair = await commentOpens();
          assert.equal(negatives.drawingSpacePair, commentsBefore + 1,
            'and neither does a drawing-only pair');

          // Arrange: a real 2x1-pixel move remains inside the comment pair's
          // 4 px proximity bound, so the geometry change itself must
          // disqualify the following single press.
          await separate();
          await harness.command({ type: 'tool', tool: 'box' });
          await harness.command({ type: 'select', id: box.id });
          const tinyBefore = await idle();
          const tinyBeforeGeometry = geometryOf(tinyBefore)[box.id];
          const tinyStart = borderPoint(box);
          const tinyEnd = { x: tinyStart.x + 2, y: tinyStart.y + 1 };
          const tinyPressStart = await pressCount();

          // Act: commit the tiny move, then press once on the moved border
          // while both native gesture bounds still qualify.
          await hover(tinyStart);
          await pressAt(tinyStart);
          await moveTo(tinyEnd);
          await releaseAt(tinyEnd);
          const tinyCommitted = await until(async () => {
            const state = await readState();
            const geometry = geometryOf(state)[box.id];
            return !state.busy && geometry.x1 === tinyBeforeGeometry.x1 + 2
              && geometry.y1 === tinyBeforeGeometry.y1 + 1 ? state : null;
          }, 'the tiny effective move is committed');
          await clickAt(tinyEnd);
          const tinyAfterFollower = await idle();
          const tinyPair = await pairMetrics(tinyPressStart);

          // Assert: the move is committed and saved, but neither it nor the
          // following single press opens Comments. One undo and redo traverse
          // exactly this effective geometry change.
          assertPair(tinyPair, 'the tiny move and its following press');
          assert.deepEqual(geometryOf(tinyCommitted)[box.id], {
            x1: tinyBeforeGeometry.x1 + 2,
            y1: tinyBeforeGeometry.y1 + 1,
            x2: tinyBeforeGeometry.x2 + 2,
            y2: tinyBeforeGeometry.y2 + 1,
          }, 'the 2x1-pixel move changes every box coordinate exactly once');
          negatives.tinyMotion = await commentOpens();
          assert.equal(negatives.tinyMotion, commentsBefore + 1,
            'a tiny effective move cannot prime its following single press');
          const tinySaved = await harness.command({ type: 'save' });
          assert.equal(tinySaved.status, 'saved');
          const tinyPersisted = harness.readWorking().state.annotations
            .find(({ id }) => id === box.id);
          assert.deepEqual(
            { x1: tinyPersisted.x1, y1: tinyPersisted.y1, x2: tinyPersisted.x2, y2: tinyPersisted.y2 },
            geometryOf(tinyAfterFollower)[box.id],
            'the committed tiny move, rather than a pointer preview, reaches working storage',
          );
          const tinyUndone = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(tinyUndone)[box.id], tinyBeforeGeometry,
            'one undo restores the geometry before the tiny move');
          const tinyRedone = await harness.command({ type: 'redo' });
          assert.deepEqual(geometryOf(tinyRedone)[box.id], geometryOf(tinyCommitted)[box.id],
            'one redo restores the tiny committed move');
          await harness.command({ type: 'undo' });

          const afterComments = await idle();
          assert.deepEqual(geometryOf(afterComments), geometryOf(beforeComments),
            'every nonqualifying gesture ends at its starting geometry');
          assert.equal(afterComments.annotations.length, shapes.length,
            'and adds no annotation');

          // Assert: net-equal manipulation adds no history step and keeps redo.
          await harness.command({ type: 'tool', tool: 'box' });
          await harness.command({ type: 'select', id: box.id });
          const committedStart = geometryOf(await idle())[box.id];
          const moveStart = borderPoint(box);
          const moveTarget = { x: moveStart.x + 24, y: moveStart.y + 18 };
          await hover(moveStart);
          await pressAt(moveStart);
          await moveTo(moveTarget);
          await releaseAt(moveTarget);
          const committedMove = await until(async () => {
            const state = await readState();
            return !state.busy && geometryOf(state)[box.id].x1 === committedStart.x1 + 24 ? state : null;
          }, 'the committed move is applied');
          assert.equal(committedMove.canUndo, true, 'the committed move records one history step');
          const committedGeometry = geometryOf(committedMove)[box.id];
          const undoneMove = await harness.command({ type: 'undo' });
          assert.deepEqual(geometryOf(undoneMove)[box.id], committedStart,
            'one undo restores the preceding geometry');
          assert.equal(undoneMove.canRedo, true, 'and leaves the adjustment available to redo');
          const netEqual = await outAndBack(borderPoint(box), { x: borderPoint(box).x + 20, y: borderPoint(box).y + 14 });
          assert.notDeepEqual(geometryOf(netEqual)[box.id], committedStart,
            'the net-equal gesture genuinely moved the shape in flight');
          const afterNetEqual = await idle();
          assert.deepEqual(geometryOf(afterNetEqual)[box.id], committedStart,
            'a net-equal adjustment ends at its starting geometry');
          assert.equal(afterNetEqual.canRedo, true,
            'it adds no history step, so the existing redo opportunity survives');
          const redoneMove = await harness.command({ type: 'redo' });
          assert.deepEqual(geometryOf(redoneMove)[box.id], committedGeometry,
            'and that redo still restores the earlier adjustment');
          await harness.command({ type: 'undo' });

          // Assert: a working save during a pointer preview keeps committed geometry.
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const committedBeforePreview = (await idle()).annotations;
          const previewStart = borderPoint(box);
          await hover(previewStart);
          await pressAt(previewStart);
          await moveTo({ x: previewStart.x + 30, y: previewStart.y + 24 });
          const preview = await until(async () => {
            const state = await readState();
            return state.busy ? state : null;
          }, 'the pointer preview is in flight');
          await harness.command({ type: 'notes', text: 'Committed geometry survives a preview save.' });
          assert.equal((await harness.command({ type: 'save' })).status, 'saved');
          const persistedDuringPreview = harness.readWorking();
          assert.deepEqual(persistedDuringPreview.state.annotations, committedBeforePreview,
            'the working save keeps the last committed geometry, not the preview');
          assert.equal(persistedDuringPreview.state.notes, 'Committed geometry survives a preview save.',
            'while the metadata change it was asked to save is persisted');
          await moveTo(previewStart);
          await releaseAt(previewStart);
          const afterPreview = await idle();
          assert.deepEqual(afterPreview.annotations, committedBeforePreview,
            'and the returned preview commits nothing');

          // Assert: a review that stops accepting edits stops promising one.
          await harness.command({ type: 'select', id: box.id });
          await idle();
          const availableCursor = await actionAt(borderPoint(box), { action: 'move', cursor: 'move' },
            'the selected border offers a move before availability is lost');
          await evaluate(harness.page, 'window.__review.update({ unavailable: true })');
          const unavailableCursor = await until(async () => {
            const observed = await overlayAction();
            const state = await readState();
            return !state.editable && observed.action === null ? { observed, state } : null;
          }, 'the transient action cursor clears when the update path refuses editing');
          assert.equal(unavailableCursor.observed.cursor, 'crosshair',
            'the resting pointer falls back to the plain armed-tool cursor');

          // Assert: the same refresh happens when a live operation reports the loss.
          const reopen = await harness.postJson('/api/needs-you/review/open', {
            requestHandle: harness.record.requestHandle,
            revision: harness.request.revision,
            submissionId: harness.opened.submissionId,
          });
          assert.equal(reopen.response.status, 202);
          await harness.mount(reopen.payload);
          await harness.command({ type: 'tool', tool: 'box' });
          await harness.command({ type: 'select', id: box.id });
          await idle();
          const reportedBefore = await actionAt(borderPoint(box), { action: 'move', cursor: 'move' },
            'the remounted review offers the same move before the provider is lost');
          harness.provider.dispose();
          await harness.command({ type: 'notes', text: 'This metadata change cannot be saved.' });
          const reportedAfter = await until(async () => {
            const state = await readState();
            const observed = await overlayAction();
            return !state.editable && state.error && observed.action === null ? { state, observed } : null;
          }, 'the reported availability loss refreshes the resting action cursor', 15_000);
          assert.equal(reportedAfter.state.status, 'unavailable',
            'the reported loss marks the review unavailable');
          assert.equal(reportedAfter.observed.cursor, 'crosshair',
            'and leaves only the plain armed-tool cursor behind');

          evidence.json('direct-manipulation-result.json', {
            case: context.name,
            browser: harness.browser.info.Browser,
            viewport,
            matrix,
            cursors: { corner: cornerCursor, endpoint: endpointCursor, unselected: unselectedCursors },
            moves,
            draws,
            comments: {
              opened: commentsBefore + 1,
              negatives,
              tinyMotion: {
                pair: tinyPair,
                before: tinyBeforeGeometry,
                committed: geometryOf(tinyCommitted)[box.id],
                savedWorkingRevision: tinySaved.workingRevision,
              },
            },
            history: { committedStart, committedGeometry },
            previewSave: {
              notes: persistedDuringPreview.state.notes,
              annotations: persistedDuringPreview.state.annotations.map(({ id, x1, y1, x2, y2 }) => ({ id, x1, y1, x2, y2 })),
            },
            availability: {
              beforeUpdate: availableCursor,
              afterUpdate: unavailableCursor.observed,
              beforeReport: reportedBefore,
              afterReport: reportedAfter.observed,
              reportedCode: reportedAfter.state.error?.code ?? null,
            },
          });
        } finally {
          await harness.close();
        }
      });

test('T010 review regression: keyboard focus remains visible when source paint matches a Fluent focus color', { timeout: 120_000, concurrency: false }, async (context) => {
        if (!t010BrowserReady(context)) return;
        const profileOwnership = trackT010ReviewProfiles();
        context.after(() => profileOwnership.finish(
          'focus regression leaves no exact Review profile created by this test process',
        ));
        const evidence = createT010Evidence(context, 't010-keyboard-focus-regression');
        const fluentRequire = createRequire(path.join(HERE, 'package.json'));
        const { webDarkTheme, webLightTheme } = fluentRequire('@fluentui/react-components');
        const focusPaint = {
          light: webLightTheme.colorStrokeFocus2,
          dark: webDarkTheme.colorStrokeFocus2,
        };
        const html = [
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
          '<style>',
          `html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${focusPaint.light}}`,
          `@media (prefers-color-scheme:dark){html,body{background:${focusPaint.dark}}}`,
          '</style>',
          '<body></body>',
          '',
        ].join('\n');
        const { decodePng } = await import('../../src/extensions/dude/lib/review/png.mjs');
        const results = [];
        const failures = [];
        for (const [index, theme] of /** @type {const} */ (['light', 'dark']).entries()) {
          const harness = await createT010ReviewHarness(context, {
            number: String(716 + index),
            slug: `focus-contrast-${theme}`,
            html,
            theme,
            profileOwnership,
          });
          try {
            // Arrange: keyboard starts on a transparent test-owned predecessor. The
            // flat canonical page exactly matches this theme's focus2 token.
            await evaluate(harness.page, `(() => {
              const host = document.querySelector('[data-t010-regression-host]');
              const probe = document.createElement('button');
              probe.dataset.t010FocusProbe = 'true';
              probe.textContent = 'Focus predecessor';
              probe.style.cssText = 'position:absolute;left:20px;top:20px;width:1px;height:1px;opacity:0;z-index:-1';
              host.prepend(probe);
              probe.focus();
            })()`);
            const before = await harness.screenshot();

            // Act: use the real browser keyboard path, not element.focus(), to expose
            // the new outer panning scrollport and then the overlay's
            // :focus-visible treatment.
            await key(harness.page, 'Tab', 'Tab');
            const outerFocused = await evaluate(harness.page,
              `document.activeElement === document.querySelector('.dude-review-engine')`);
            await key(harness.page, 'Tab', 'Tab');
            await settleBrowserWork(harness.page);
            const style = await evaluate(harness.page, `(() => {
              const overlay = document.querySelector('.dude-review-overlay');
              const computed = getComputedStyle(overlay);
              const host = document.querySelector('[data-t010-regression-host]');
              const focusBand = getComputedStyle(overlay.parentElement, '::after');
              const rect = overlay.getBoundingClientRect();
              return {
                focused: document.activeElement === overlay,
                focusVisible: overlay.matches(':focus-visible'),
                rect: {left:rect.left,top:rect.top,width:rect.width,height:rect.height},
                outlineColor: computed.outlineColor,
                outlineStyle: computed.outlineStyle,
                outlineWidth: computed.outlineWidth,
                outlineOffset: computed.outlineOffset,
                frameOverflow: getComputedStyle(overlay.parentElement).overflow,
                focusBand: {
                  content: focusBand.content,
                  borderColor: focusBand.borderColor,
                  borderStyle: focusBand.borderStyle,
                  borderWidth: focusBand.borderWidth,
                  inset: focusBand.inset,
                  pointerEvents: focusBand.pointerEvents,
                },
                focus1: getComputedStyle(host).getPropertyValue('--colorStrokeFocus1').trim(),
                focus2: getComputedStyle(host).getPropertyValue('--colorStrokeFocus2').trim(),
              };
            })()`);
            const after = await harness.screenshot();
            const beforeDecoded = decodePng(before);
            const afterDecoded = decodePng(after);
            assert.deepEqual(
              { width: beforeDecoded.width, height: beforeDecoded.height },
              { width: afterDecoded.width, height: afterDecoded.height },
            );
            const background = decodedPixel(afterDecoded, afterDecoded.width / 2, afterDecoded.height / 2);
            const changed = [];
            const add = (x, y) => {
              const beforePixel = decodedPixel(beforeDecoded, x, y);
              const afterPixel = decodedPixel(afterDecoded, x, y);
              if (afterPixel.slice(0, 3).some((channel, channelIndex) => (
                Math.abs(channel - beforePixel[channelIndex]) > 4
              ))) changed.push({ x, y, before: beforePixel, after: afterPixel });
            };
            for (let x = 18; x < afterDecoded.width - 18; x += 1) {
              for (let y = 1; y <= 10; y += 1) {
                add(x, y);
                add(x, afterDecoded.height - 1 - y);
              }
            }
            for (let y = 18; y < afterDecoded.height - 18; y += 1) {
              for (let x = 1; x <= 10; x += 1) {
                add(x, y);
                add(afterDecoded.width - 1 - x, y);
              }
            }
            const maxPixelContrast = changed.reduce((maximum, sample) => Math.max(
              maximum,
              contrast(pixelColor(sample.after), pixelColor(background)),
            ), 1);
            const focus1Css = /^#[\da-f]{6}$/i.test(style.focus1) ? cssRgb(style.focus1) : style.focus1;
            const focus1ToBackgroundContrast = contrast(focus1Css, pixelColor(background));
            const focus1Pixels = changed.filter((sample) => (
              contrast(pixelColor(sample.after), focus1Css) < 1.05
            )).length;
            const beforeEvidence = evidence.image(`focus-${theme}-before.png`, before);
            const afterEvidence = evidence.image(`focus-${theme}-after.png`, after);
            const result = {
              theme,
              browser: harness.browser.info.Browser,
              configuredMatchingPaint: focusPaint[theme],
              outerFocused,
              style,
              nativeBackground: background,
              focus2ToBackgroundContrast: contrast(
                /^#[\da-f]{6}$/i.test(style.focus2) ? cssRgb(style.focus2) : style.focus2,
                pixelColor(background),
              ),
              focus1ToBackgroundContrast,
              focus1Pixels,
              changedPerimeterPixels: changed.length,
              maxChangedPixelContrast: maxPixelContrast,
              changedSamples: changed.slice(0, 20),
              before: beforeEvidence,
              after: afterEvidence,
            };
            results.push(result);

            // Assert later so both black/light and white/dark fixtures always produce
            // independent screenshots and metrics in one focused invocation.
            collect(failures, () => assert.equal(outerFocused, true,
              `${theme}: keyboard reaches the Review panning scrollport first`));
            collect(failures, () => assert.equal(style.focused, true, `${theme}: keyboard reaches the overlay`));
            collect(failures, () => assert.equal(style.focusVisible, true, `${theme}: :focus-visible is active`));
            collect(failures, () => assert.notEqual(style.outlineStyle, 'none', `${theme}: existing focus2 outline remains active`));
            collect(failures, () => assert.ok(Number.parseFloat(style.outlineWidth) > 0, `${theme}: existing focus2 outline has positive width`));
            collect(failures, () => assert.notEqual(style.focusBand.content, 'none', `${theme}: adjacent focus1 band is generated`));
            collect(failures, () => assert.equal(style.focusBand.borderStyle, 'solid', `${theme}: focus1 band uses a solid border`));
            collect(failures, () => assert.ok(Number.parseFloat(style.focusBand.borderWidth) > 0, `${theme}: focus1 band has positive width`));
            collect(failures, () => assert.ok(Number.parseFloat(style.focusBand.inset) > 0, `${theme}: focus1 band is inset inside the frame`));
            collect(failures, () => assert.equal(style.frameOverflow, 'hidden', `${theme}: inset focus band is clipped to the frame`));
            collect(failures, () => assert.equal(style.focusBand.pointerEvents, 'none', `${theme}: focus1 band is pointer-transparent`));
            collect(failures, () => assert.ok(
              contrast(style.focusBand.borderColor, focus1Css) < 1.05,
              `${theme}: generated band uses focus1 (${JSON.stringify(result)})`,
            ));
            collect(failures, () => assert.ok(
              result.focus2ToBackgroundContrast < 1.1,
              `${theme}: fixture paint must match focus2 (${JSON.stringify(result)})`,
            ));
            collect(failures, () => assert.ok(
              changed.length >= 40,
              `${theme}: keyboard focus changes no visible native perimeter (${JSON.stringify(result)})`,
            ));
            collect(failures, () => assert.ok(
              focus1Pixels >= 40,
              `${theme}: no bounded run of focus1 pixels was painted (${JSON.stringify(result)})`,
            ));
            collect(failures, () => assert.ok(
              focus1ToBackgroundContrast >= 20 && maxPixelContrast >= 20,
              `${theme}: black/white focus band contrast is below 20:1 (${JSON.stringify(result)})`,
            ));
          } finally {
            await harness.close();
          }
        }
        evidence.json('keyboard-focus-result.json', {
          case: context.name,
          expected: 'The existing focus2 outline remains, with an adjacent pointer-transparent focus1 band at black/white contrast on each matching source paint.',
          results,
        });
        assert.deepEqual(failures, [], failures.join('\n'));
      });

test('T010 mounts the vanilla engine under current Fluent tokens and seals real source-aligned evidence', { timeout: 120_000, concurrency: false }, async (reviewTest) => {
      const baseline = await prepareT010Baseline(reviewTest);
      if (!baseline) return;
      const profileOwnership = trackT010ReviewProfiles();
      reviewTest.after(() => profileOwnership.finish(
        'mounted Review success leaves no exact capture profile created by this test process',
      ));
      const { screenshots } = baseline;
      const runtimePath = path.join(ROOT, 'src', 'extensions', 'dude', 'lib', 'review.mjs');
      assert.equal(fs.existsSync(runtimePath), true, 'the real project run requires the adopted Review runtime');
      const [
        { createNeedsYou },
        { createReview, ReviewError },
        { closeInstance, openInstance },
        { decodePng },
        { BADGE_RADIUS, badgeAnchor, evidencePoints },
      ] = await Promise.all([
        import('../../src/extensions/dude/lib/needs-you.mjs'),
        import('../../src/extensions/dude/lib/review.mjs'),
        import('../../src/extensions/dude/lib/canvas-server.mjs'),
        import('../../src/extensions/dude/lib/review/png.mjs'),
        import('../../src/extensions/dude/ui/review/geometry.mjs'),
      ]);
      const workspace = createReviewWorkspaceFixture();
      const adapter = createReview({ root: workspace.root });
      const sends = [];
      let queueReads = 0;
      const session = {
        sessionId: `review-session-${randomUUID()}`,
        send: async (input) => { sends.push(input); return `unexpected-${sends.length}`; },
        rpc: {
          queue: {
            pendingItems: async () => {
              queueReads += 1;
              return { items: [], steeringMessages: [], inFlightSteeringCount: 0 };
            },
          },
        },
      };
      const provider = createNeedsYou({ root: workspace.root, reviewAdapter: adapter });
      provider.bindSession(/** @type {any} */ (session));
      const logs = [];
      const controllers = [];
      const toolResults = [];
      let instance;
      let reviewBrowser;
      let reviewPage;
      const instanceId = `t010-review-${randomUUID()}`;

      const requestFor = (feature, requestRef) => ({
        owner: 'dude-spec-lead',
        requestRef,
        scope: feature.scope,
        source: {
          kind: 'file',
          path: feature.ideaPath,
          revision: workspace.revision(fs.readFileSync(path.join(workspace.root, ...feature.ideaPath.split('/')))),
        },
        revision: `current-${requestRef}`,
        class: 'preview',
        prompt: 'Review the exact current canonical mock.',
        whyHuman: 'Visual revision feedback requires the user.',
        unblocks: 'The design owner can revise the canonical mock.',
        blocking: true,
        fields: feature.preview,
      });
      const publish = async (request, suffix) => {
        const controller = new AbortController();
        controllers.push(controller);
        const invocation = {
          sessionId: session.sessionId,
          toolName: 'dude_needs_you',
          toolCallId: `review-tool-${suffix}-${randomUUID()}`,
          signal: controller.signal,
        };
        const result = provider.tool.handler({ op: 'request', request }, invocation);
        toolResults.push(result);
        const record = await until(() => provider.read().requests.find((entry) => (
          entry.request.requestRef === request.requestRef && entry.phase === 'pending'
        )), `pending ${request.requestRef}`);
        return { controller, invocation, record, request, result };
      };
      const stableRequest = requestFor(workspace.stable, 'stable-mounted-review');
      const hostileRequest = requestFor(workspace.hostile, 'hostile-isolation-review');
      let stablePending;
      let hostilePending;

      try {
        reviewBrowser = await startBrowser(2);
        baseline.setBrowserVersion(reviewBrowser.info.Browser);
        reviewPage = reviewBrowser.page;
        stablePending = await publish(stableRequest, 'stable');
        hostilePending = await publish(hostileRequest, 'hostile');
        instance = await openInstance(
          instanceId,
          (message) => void logs.push(message),
          completeProjection({ slug: 'stable-review', number: '701' }),
          { root: workspace.root },
          provider,
        );
        const origin = new URL(instance.url).origin;
        const postJson = async (route, body) => {
          const response = await fetch(new URL(route, instance.url), {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(45_000),
          });
          const payload = await response.json();
          return { response, payload };
        };

        // A browser-selected UUID cannot allocate a writable output. The first
        // successful open omits it and receives the provider's UUID instead.
        const forgedId = randomUUID();
        const forged = await postJson('/api/needs-you/review/open', {
          requestHandle: stablePending.record.requestHandle,
          revision: stableRequest.revision,
          submissionId: forgedId,
        });
        assert.notEqual(forged.response.status, 202);
        assert.equal(
          fs.existsSync(path.join(workspace.root, ...workspace.stable.specDirectory.split('/'), 'reviews', forgedId)),
          false,
        );
        const stableOpenResponse = await postJson('/api/needs-you/review/open', {
          requestHandle: stablePending.record.requestHandle,
          revision: stableRequest.revision,
        });
        const hostileOpenResponse = await postJson('/api/needs-you/review/open', {
          requestHandle: hostilePending.record.requestHandle,
          revision: hostileRequest.revision,
        });
        assert.equal(stableOpenResponse.response.status, 202);
        assert.equal(hostileOpenResponse.response.status, 202);
        const stableOpen = stableOpenResponse.payload;
        const hostileOpen = hostileOpenResponse.payload;
        assert.notEqual(stableOpen.submissionId, hostileOpen.submissionId);
        assert.match(stableOpen.submissionId, /^[a-f0-9-]{36}$/);
        assert.deepEqual(
          fs.readdirSync(path.join(workspace.root, ...workspace.stable.specDirectory.split('/'), 'reviews')),
          [stableOpen.submissionId],
        );
        assert.deepEqual(
          fs.readdirSync(path.join(workspace.root, ...workspace.hostile.specDirectory.split('/'), 'reviews')),
          [hostileOpen.submissionId],
        );

        const frameResponse = await fetch(new URL(stableOpen.framePath, instance.url), {
          headers: { origin: 'null' },
          signal: AbortSignal.timeout(DEADLINE_MS),
        });
        assert.equal(frameResponse.status, 200);
        const csp = frameResponse.headers.get('content-security-policy');
        assert.match(csp, /^sandbox allow-scripts;/);
        assert.doesNotMatch(csp, /allow-same-origin/);
        assert.match(csp, /default-src 'none'/);
        assert.match(csp, /connect-src http:\/\/127\.0\.0\.1:\d+\/review-source\//);
        assert.match(csp, /worker-src 'none'/);
        assert.match(csp, /form-action 'none'/);
        assert.match(await frameResponse.text(), /data-dude-review-bridge/);
        for (const [name, mime] of [
          ['mock.css', 'text/css; charset=utf-8'],
          ['copy.json', 'application/json; charset=utf-8'],
          ['logo.svg', 'image/svg+xml'],
          ['fixture.woff', 'font/woff'],
        ]) {
          const resource = await fetch(new URL(
            `${path.posix.dirname(stableOpen.framePath)}/${name}`,
            instance.url,
          ), { headers: { origin: 'null' }, signal: AbortSignal.timeout(DEADLINE_MS) });
          assert.equal(resource.status, 200, name);
          assert.equal(resource.headers.get('content-type'), mime, name);
          assert.equal(resource.headers.get('access-control-allow-origin'), '*', name);
          assert.ok((await resource.arrayBuffer()).byteLength > 0, name);
        }
        assert.equal((await fetch(new URL(
          `${path.posix.dirname(stableOpen.framePath)}/not-declared.txt`,
          instance.url,
        ), { headers: { origin: 'null' }, signal: AbortSignal.timeout(DEADLINE_MS) })).status, 409);
        assert.equal((await fetch(new URL(
          `${stableOpen.framePath}?credential=forged`,
          instance.url,
        ), { headers: { origin: 'null' }, signal: AbortSignal.timeout(DEADLINE_MS) })).status, 403);

        const mount = async (openReview, pending, theme, zeroWidth = false) => {
          await evaluate(reviewPage, `(async () => {
            window.__review?.dispose?.();
            document.querySelector('[data-t010-review-host]')?.remove();
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            const fluent = document.querySelector('.fui-FluentProvider');
            if (!fluent) throw new Error('Current FluentProvider was not mounted');
            const container = document.createElement('section');
            container.dataset.t010ReviewHost = 'true';
            container.setAttribute('aria-label', 'T010 mounted review fixture');
            container.style.cssText = [
              'position:fixed', 'left:-1px', 'top:-1px',
              'height:calc(100vh + 2px)', 'z-index:2147483640',
              'overflow:hidden', 'background:var(--colorNeutralBackground1)',
              ${zeroWidth ? "'width:0'" : "'width:calc(100vw + 2px)'"},
            ].join(';');
            fluent.append(container);
            window.__reviewChanges = [];
            window.__reviewMessages = [];
            const module = await import('/review/engine.mjs');
            window.__review = module.mountReview(container, {
              review: ${JSON.stringify(openReview)},
              requestHandle: ${JSON.stringify(pending.record.requestHandle)},
              revision: ${JSON.stringify(pending.request.revision)},
              theme: ${JSON.stringify(theme)},
              onChange: state => window.__reviewChanges.push({
                active: state.active, ready: state.ready, status: state.status,
                saving: state.saving, sealing: state.sealing, stale: state.stale,
                dirty: state.dirty, error: state.error,
              }),
              onMessage: message => window.__reviewMessages.push(message),
            });
            ${zeroWidth ? "await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); container.style.width = 'calc(100vw + 2px)';" : ''}
            return true;
          })()`);
          await until(
            () => evaluate(reviewPage, `Boolean(window.__review?.getState().ready)`),
            `${openReview.submissionId} mounted review ready`,
            15_000,
          );
          return evaluate(reviewPage, `window.__review.getState()`);
        };
        const command = (action, timeout = 10_000) => evaluate(reviewPage, `Promise.race([
          window.__review.command(${JSON.stringify(action)}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('review command test deadline')), ${timeout}))
        ])`);

        // The hostile frame executes scripts but remains opaque. Neither parent
        // DOM access, credentialed mutation fetch, nor a forged bridge command
        // can create output or mutate the shell.
        await navigate(reviewPage, null, 360, 'light', origin, 600, false, 2);
        await evaluate(reviewPage, `(() => {
          window.__hostileMessages = [];
          window.addEventListener('message', event => {
            if (event.data?.type === 'hostile-done') window.__hostileMessages.push(event.data);
          });
        })()`);
        await evaluate(reviewPage, `(async () => {
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
          const fluent = document.querySelector('.fui-FluentProvider');
          const container = document.createElement('section');
          container.dataset.t010ReviewHost = 'true';
          container.style.cssText = 'position:fixed;left:-1px;top:-1px;width:calc(100vw + 2px);height:calc(100vh + 2px);z-index:2147483640';
          fluent.append(container);
          const module = await import('/review/engine.mjs');
          window.__review = module.mountReview(container, {
            review: ${JSON.stringify(hostileOpen)},
            requestHandle: ${JSON.stringify(hostilePending.record.requestHandle)},
            revision: ${JSON.stringify(hostileRequest.revision)},
            theme: 'light',
          });
        })()`);
        await until(
          () => evaluate(reviewPage, `window.__hostileMessages?.length === 1`),
          'opaque hostile frame completion',
          10_000,
        );
        const isolation = await evaluate(reviewPage, `({
          escaped: document.body.dataset.mockEscaped ?? null,
          message: window.__hostileMessages[0],
          sandbox: document.querySelector('.dude-review-frame iframe')?.getAttribute('sandbox'),
          sameOriginReadable: (() => {
            try { return Boolean(document.querySelector('.dude-review-frame iframe').contentDocument?.body); }
            catch { return false; }
          })(),
        })`);
        assert.equal(isolation.escaped, null);
        assert.equal(isolation.sameOriginReadable, false);
        assert.equal(isolation.sandbox, 'allow-scripts');
        assert.ok(['blocked', 'network-returned'].includes(isolation.message.result));
        assert.deepEqual(
          fs.readdirSync(path.join(
            workspace.root,
            ...workspace.hostile.specDirectory.split('/'),
            'reviews',
            hostileOpen.submissionId,
          )),
          ['working.json'],
          'untrusted frame activity creates no review operation output',
        );
        await evaluate(reviewPage, `window.__review.dispose()`);

        // A transient video is rejected by real CDP capture. Working markup
        // survives and the owned browser profile exits on the failure path.
        const hostileWorking = {
          annotations: [{
            id: randomUUID(), tool: 'box', x1: 40, y1: 60, x2: 160, y2: 140,
            comment: '', replacement: '', styleNote: '', element: null,
          }],
          notes: 'Transient fixture must not seal.',
          tool: 'box',
          selectedId: null,
          caret: null,
          view: {
            viewport: {
              width: 360, height: 600, scrollX: 0, scrollY: 0, deviceScale: 1,
              theme: 'light', documentWidth: 360, documentHeight: 900,
            },
            signature: workspace.revision('hostile-view-that-must-not-be-trusted'),
          },
          palette: {
            stroke: '#d13438', background: '#ffffff', foreground: '#242424',
            highlightFill: '#fff4ce', highlightStroke: '#c19c00',
            selection: '#0f6cbd', fontFamily: 'Segoe UI',
          },
        };
        const hostileSaved = await postJson('/api/needs-you/review/save', {
          requestHandle: hostilePending.record.requestHandle,
          revision: hostileRequest.revision,
          submissionId: hostileOpen.submissionId,
          workingRevision: hostileOpen.workingRevision,
          working: hostileWorking,
        });
        assert.equal(hostileSaved.response.status, 202);
        const transientProfiles = profileOwnership.receipt();
        const transientSeal = await postJson('/api/needs-you/review/seal', {
          requestHandle: hostilePending.record.requestHandle,
          revision: hostileRequest.revision,
          submissionId: hostileOpen.submissionId,
          workingRevision: hostileSaved.payload.workingRevision,
        });
        assert.equal(transientSeal.response.status, 503);
        assert.equal(
          transientSeal.payload.error,
          'review_transient_unsupported',
          'the isolated transient video cannot be promoted to fresh-render evidence',
        );
        assert.equal(
          profileOwnership.createdSince(transientProfiles).length,
          1,
          'transient refusal launched one exact process-created capture profile',
        );
        profileOwnership.assertReapedSince(
          transientProfiles,
          'transient refusal removed its exact process-created capture profile',
        );
        assert.deepEqual(
          fs.readdirSync(path.join(
            workspace.root,
            ...workspace.hostile.specDirectory.split('/'),
            'reviews',
            hostileOpen.submissionId,
          )),
          ['working.json'],
        );
        assert.equal(provider.read().requests.find(
          ({ requestHandle }) => requestHandle === hostilePending.record.requestHandle,
        ).phase, 'pending');

        // Mount the same unchanged stable allocation at the three required
        // widths, representative themes, and final DPR 2. The final mount starts
        // at zero width and recovers through its existing ResizeObserver.
        const matrix = [
          { width: 360, theme: 'light', scale: 2 },
          { width: 1440, theme: 'dark', scale: 2 },
          { width: 768, theme: 'dark', scale: 2, zero: true },
        ];
        let engineState;
        for (const entry of matrix) {
          await navigate(reviewPage, null, entry.width, entry.theme, origin, 600, false, entry.scale);
          engineState = await mount(stableOpen, stablePending, entry.theme, entry.zero);
          await evaluate(reviewPage, `(() => {
            const host = document.querySelector('[data-t010-review-host]');
            const probe = document.createElement('button');
            probe.dataset.reviewFocusProbe = 'true';
            probe.textContent = 'Focus probe';
            probe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;z-index:-1';
            host.prepend(probe);
            probe.focus();
          })()`);
          await key(reviewPage, 'Tab', 'Tab');
          const outerFocused = await evaluate(reviewPage,
            `document.activeElement === document.querySelector('.dude-review-engine')`);
          assert.equal(outerFocused, true,
            'the keyboard reaches the outer Review panning scrollport before the overlay');
          await key(reviewPage, 'Tab', 'Tab');
          await settleBrowserWork(reviewPage);
          const geometry = await evaluate(reviewPage, `(() => {
            const host = document.querySelector('[data-t010-review-host]');
            const frame = host.querySelector('.dude-review-frame');
            const iframe = frame.querySelector('iframe');
            const overlay = frame.querySelector('svg');
            const rect = frame.getBoundingClientRect();
            return {
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: innerWidth,
              frame: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
              iframeTitle: iframe.title,
              sandbox: iframe.getAttribute('sandbox'),
              overlayLabel: overlay.getAttribute('aria-label'),
              overlayRole: overlay.getAttribute('role'),
              focused: document.activeElement === overlay,
              outline: getComputedStyle(overlay).outlineStyle,
              tokenStroke: getComputedStyle(host).getPropertyValue('--colorPaletteRedBorder2').trim(),
            };
          })()`);
          assert.equal(engineState.view.viewport.width, entry.width);
          assert.equal(engineState.view.viewport.height, 600);
          assert.equal(engineState.view.viewport.deviceScale, entry.scale);
          assert.equal(engineState.view.viewport.theme, entry.theme);
          assert.equal(geometry.documentWidth, entry.width, 'fixed review mount creates no page-level overflow');
          assert.deepEqual(geometry.frame, { left: 0, top: 0, width: entry.width, height: 600 });
          assert.equal(geometry.iframeTitle, 'Canonical HTML mock');
          assert.equal(geometry.sandbox, 'allow-scripts');
          assert.equal(geometry.overlayRole, 'group');
          assert.match(geometry.overlayLabel, /Reviewed HTML document/);
          assert.equal(geometry.focused, true);
          assert.notEqual(geometry.outline, 'none');
          assert.ok(geometry.tokenStroke);
          assert.equal(engineState.palette.stroke, geometry.tokenStroke);
          if (entry !== matrix.at(-1)) await evaluate(reviewPage, `window.__review.dispose()`);
        }

        await command({ type: 'scroll', x: 0, y: 300 });
        await focus(reviewPage, '.dude-review-overlay');
        await key(reviewPage, 'b', 'KeyB');
        await until(() => evaluate(reviewPage, `window.__review.getState().tool === 'box'`), 'box keyboard shortcut');
        const draw = async (x1, y1, x2, y2) => {
          await reviewPage.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1,
          });
          await reviewPage.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: x2, y: y2, button: 'left', buttons: 1,
          });
          await reviewPage.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1,
          });
        };
        await draw(60, 100, 180, 170);
        await until(() => evaluate(reviewPage, `window.__review.getState().annotations.length === 1`), 'first pointer annotation');
        await draw(210, 110, 320, 180);
        await until(() => evaluate(reviewPage, `window.__review.getState().annotations.length === 2`), 'repeated pointer annotation');
        assert.equal((await evaluate(reviewPage, `window.__review.getState().tool`)), 'box', 'drawing tool stays selected');
        await key(reviewPage, 'Backspace', 'Backspace');
        await until(() => evaluate(reviewPage, `window.__review.getState().annotations.length === 1`), 'Mac Backspace delete');
        await command({ type: 'undo' });
        assert.equal((await evaluate(reviewPage, `window.__review.getState().annotations.length`)), 2);
        await command({ type: 'redo' });
        assert.equal((await evaluate(reviewPage, `window.__review.getState().annotations.length`)), 1);

        const shapeCases = [
          ['circle', { x1: 570, y1: 380, x2: 700, y2: 470 }],
          ['arrow', { x1: 100, y1: 620, x2: 260, y2: 700 }],
          ['line', { x1: 300, y1: 640, x2: 500, y2: 700 }],
          ['highlight', { x1: 540, y1: 650, x2: 700, y2: 720 }],
        ];
        let nativeArrowCapture;
        for (const [tool, coordinates] of shapeCases) {
          await command({ type: 'tool', tool });
          if (tool === 'arrow') {
            // ZoomIt capture order is a user-input contract: press at the head,
            // then drag back to the tail. Do not substitute the command API,
            // because that would leave the pointer mapping untested.
            const geometry = await evaluate(reviewPage, `(() => {
              const rect = document.querySelector('.dude-review-overlay').getBoundingClientRect();
              const viewport = window.__review.getState().view.viewport;
              return {
                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                viewport,
                count: window.__review.getState().annotations.length,
              };
            })()`);
            const clientPoint = (point) => ({
              x: geometry.rect.left
                + (point.x - geometry.viewport.scrollX) * geometry.rect.width / geometry.viewport.width,
              y: geometry.rect.top
                + (point.y - geometry.viewport.scrollY) * geometry.rect.height / geometry.viewport.height,
            });
            const head = clientPoint({ x: coordinates.x2, y: coordinates.y2 });
            const tail = clientPoint({ x: coordinates.x1, y: coordinates.y1 });
            await reviewPage.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...head });
            await reviewPage.send('Input.dispatchMouseEvent', {
              type: 'mousePressed', ...head, button: 'left', buttons: 1, clickCount: 1,
            });
            await reviewPage.send('Input.dispatchMouseEvent', {
              type: 'mouseMoved', ...tail, button: 'left', buttons: 1,
            });
            await reviewPage.send('Input.dispatchMouseEvent', {
              type: 'mouseReleased', ...tail, button: 'left', buttons: 0, clickCount: 1,
            });
            const captured = await until(() => evaluate(reviewPage, `(() => {
              const annotations = window.__review.getState().annotations;
              return annotations.length === ${geometry.count + 1} ? annotations.at(-1) : null;
            })()`), 'native ZoomIt arrow capture');
            const close = (actual, expected) => Math.abs(actual - expected) <= 0.75;
            assert.equal(captured.tool, 'arrow');
            assert.equal(close(captured.x2, coordinates.x2) && close(captured.y2, coordinates.y2), true,
              'the native press point is stored as the rendered arrowhead end');
            assert.equal(close(captured.x1, coordinates.x1) && close(captured.y1, coordinates.y1), true,
              'the moving cursor is stored as the arrow tail end');
            const tip = await evaluate(reviewPage, `(() => {
              const group = document.querySelector(
                '[data-annotation="${captured.id}"]'
              );
              const [x, y] = group.querySelector('polygon').getAttribute('points')
                .split(' ')[0].split(',').map(Number);
              return { x, y };
            })()`);
            assert.equal(close(tip.x, captured.x2) && close(tip.y, captured.y2), true,
              'the rendered polygon tip remains at stored endpoint two');
            nativeArrowCapture = { id: captured.id, head, tail, stored: captured, tip };
          } else {
            const id = await command({ type: 'addAtCenter' });
            await command({ type: 'edit', id, changes: coordinates });
          }
          assert.equal((await evaluate(reviewPage, `window.__review.getState().tool`)), tool);
        }
        assert.ok(nativeArrowCapture, 'the native arrow guard cannot pass without creating an arrow');
        for (const selector of ['#missing-anchor', 'p']) {
          await assert.rejects(
            command({ type: 'element', selector }),
            /unique|missing|anchor/i,
            `${selector} cannot become a retargeted annotation anchor`,
          );
          assert.equal(
            await evaluate(reviewPage, `window.__review.getState().error.code`),
            'review_anchor_invalid',
          );
        }
        await command({ type: 'element', selector: '#data' });
        const commentId = await command({ type: 'addComment' });
        const literalComment = '  第一\u00a0line\nKeep `literal` formatting.  ';
        await command({
          type: 'edit',
          id: commentId,
          changes: {
            comment: literalComment,
            replacement: 'Replace\u00a0without trimming',
            styleNote: 'Use the current Fluent emphasis token.',
          },
        });
        await command({ type: 'notes', text: 'Overall\u00a0notes\nremain literal.' });

        // Sixty history entries are retained. Older entries are dropped, the
        // sixty-first undo is inert, and a new edit clears the redo branch.
        await evaluate(reviewPage, `(async () => {
          for (let index = 0; index < 65; index++) {
            await window.__review.command({
              type: 'edit',
              id: ${JSON.stringify(commentId)},
              changes: { comment: 'history-' + index },
            });
          }
          for (let index = 0; index < 60; index++) await window.__review.command({ type: 'undo' });
        })()`);
        assert.equal(
          (await evaluate(reviewPage, `window.__review.getState().annotations.find(a => a.id === ${JSON.stringify(commentId)}).comment`)),
          'history-4',
        );
        await command({ type: 'undo' });
        assert.equal(
          (await evaluate(reviewPage, `window.__review.getState().annotations.find(a => a.id === ${JSON.stringify(commentId)}).comment`)),
          'history-4',
          'history cap makes the sixty-first undo inert',
        );
        await command({ type: 'redo' });
        assert.equal(
          (await evaluate(reviewPage, `window.__review.getState().annotations.find(a => a.id === ${JSON.stringify(commentId)}).comment`)),
          'history-5',
        );
        await command({
          type: 'edit',
          id: commentId,
          changes: {
            comment: literalComment,
            replacement: 'Replace\u00a0without trimming',
            styleNote: 'Use the current Fluent emphasis token.',
          },
        });
        assert.equal((await evaluate(reviewPage, `window.__review.getState().canRedo`)), false);
        await command({
          type: 'caret',
          caret: { id: commentId, field: 'comment', start: 2, end: 8, direction: 'backward' },
        });
        await command({ type: 'tool', tool: 'highlight' });

        // Native text/combobox editing owns Ctrl+Z; it must not consume engine
        // history or change the selected annotation.
        const beforeNativeUndo = await evaluate(reviewPage, `JSON.stringify(window.__review.getState().annotations)`);
        await evaluate(reviewPage, `(() => {
          const input = document.createElement('input');
          input.setAttribute('role', 'combobox');
          input.value = 'native field';
          input.dataset.nativeUndoGuard = 'true';
          document.querySelector('[data-t010-review-host]').append(input);
          input.focus();
        })()`);
        await reviewPage.send('Input.dispatchKeyEvent', {
          type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
        });
        await reviewPage.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
        });
        assert.equal(await evaluate(reviewPage, `JSON.stringify(window.__review.getState().annotations)`), beforeNativeUndo);
        await evaluate(reviewPage, `document.querySelector('[data-native-undo-guard]').remove()`);

        const retained = await evaluate(reviewPage, `(() => {
          const state = window.__review.getState();
          return {
            tool: state.tool,
            scrollY: state.view.viewport.scrollY,
            caret: state.caret,
            annotations: state.annotations.length,
          };
        })()`);
        await evaluate(reviewPage, `window.__review.update({ active: false })`);
        assert.deepEqual(await evaluate(reviewPage, `({
          active: window.__review.getState().active,
          hidden: document.querySelector('.dude-review-engine').hidden,
        })`), { active: false, hidden: true });
        await evaluate(reviewPage, `window.__review.update({ active: true })`);
        await until(
          () => evaluate(reviewPage, `window.__review.getState().ready && window.__review.getState().view.viewport.scrollY === 300`),
          'inactive Review viewport restoration',
          15_000,
        );
        assert.deepEqual(await evaluate(reviewPage, `(() => {
          const state = window.__review.getState();
          return {
            tool: state.tool,
            scrollY: state.view.viewport.scrollY,
            caret: state.caret,
            annotations: state.annotations.length,
          };
        })()`), retained);
        await assert.rejects(command({ type: 'not-a-command' }), /invalid/i);
        assert.equal(
          (await evaluate(reviewPage, `window.__review.getState().error.code`)),
          'review_invalid_input',
          'Fluent shell receives a stable engine error hook',
        );

        const saved = await command({ type: 'save' });
        assert.equal(saved.status, 'saved');
        engineState = await evaluate(reviewPage, `window.__review.getState()`);
        assert.equal(engineState.annotations.length, 6);
        assert.deepEqual(
          engineState.annotations.map(({ tool }) => tool),
          ['box', 'circle', 'arrow', 'line', 'highlight', 'comment'],
          'all six production annotation tools are present before checking marker numbering',
        );
        assert.equal(engineState.view.viewport.scrollY, 300);
        assert.equal(engineState.view.viewport.deviceScale, 2);
        assert.deepEqual(engineState.caret, {
          id: commentId,
          field: 'comment',
          start: 2,
          end: 8,
          direction: 'backward',
        });
        const renderedMarkers = await evaluate(reviewPage, `[...document.querySelectorAll(
          '.dude-review-overlay [data-annotation]'
        )].map(group => {
          const children = [...group.children];
          const labels = children.filter(node => node.tagName.toLowerCase() === 'text');
          return {
            id: group.getAttribute('data-annotation'),
            tags: children.map(node => node.tagName.toLowerCase()),
            labels: labels.map(node => ({
              text: node.textContent,
              fill: node.getAttribute('fill'),
              family: node.getAttribute('font-family'),
              box: (() => {
                const rect = node.getBoundingClientRect();
                return { width: rect.width, height: rect.height };
              })(),
            })),
            badge: (() => {
              const node = children.at(-2);
              return node?.tagName.toLowerCase() === 'circle' ? {
                cx: Number(node.getAttribute('cx')),
                cy: Number(node.getAttribute('cy')),
                r: Number(node.getAttribute('r')),
                fill: node.getAttribute('fill'),
                stroke: node.getAttribute('stroke'),
              } : null;
            })(),
          };
        })`);
        assert.equal(renderedMarkers.length, engineState.annotations.length,
          'numbering cannot pass with an empty or partial rendered marker set');
        for (const [index, annotation] of engineState.annotations.entries()) {
          const marker = renderedMarkers[index];
          assert.equal(marker.id, annotation.id, `marker ${index + 1} keeps list order`);
          assert.deepEqual(marker.labels.map(({ text }) => text), [String(index + 1)],
            `${annotation.tool} renders exactly its own list number`);
          assert.equal(marker.labels[0].box.width > 0 && marker.labels[0].box.height > 0, true,
            `${annotation.tool} numeral has a painted layout box`);
          assert.equal(marker.labels[0].fill, engineState.palette.foreground);
          assert.equal(marker.labels[0].family, engineState.palette.fontFamily);
          const anchor = badgeAnchor(annotation);
          if (annotation.tool === 'comment') {
            assert.equal(anchor, null, 'the numbered comment marker has no duplicate badge');
            assert.deepEqual(marker.tags, ['circle', 'text']);
            assert.equal(marker.badge.r, 12);
          } else {
            assert.ok(anchor, `${annotation.tool} has a badge anchor`);
            assert.equal(Math.abs(marker.badge.cx - anchor.x) < 0.001, true);
            assert.equal(Math.abs(marker.badge.cy - anchor.y) < 0.001, true);
            assert.equal(marker.badge.r, BADGE_RADIUS);
            assert.equal(marker.badge.fill, engineState.palette.background);
            assert.equal(marker.badge.stroke, engineState.palette.stroke);
          }
        }
        const stableReviewDirectory = path.join(
          workspace.root,
          ...workspace.stable.specDirectory.split('/'),
          'reviews',
          stableOpen.submissionId,
        );
        assert.deepEqual(fs.readdirSync(stableReviewDirectory), ['working.json']);
        const workingBeforeFaults = fs.readFileSync(path.join(stableReviewDirectory, 'working.json'));
        const liveInput = {
          root: path.resolve(workspace.root),
          workspaceId: provider.read().workspaceId,
          sessionId: session.sessionId,
          providerGeneration: provider.read().providerGeneration,
          toolCallId: stablePending.invocation.toolCallId,
          requestHandle: stablePending.record.requestHandle,
          request: stableRequest,
          submissionId: stableOpen.submissionId,
          revisionText: '  Revise\u00a0this\nwithout approving it.  ',
          origin,
          signal: new AbortController().signal,
          checkCurrent: async () => {},
          workingRevision: saved.workingRevision,
        };

        const cancellation = new AbortController();
        const cancellationProfiles = profileOwnership.receipt();
        const cancellingSeal = adapter.sealReview({
          ...liveInput,
          signal: cancellation.signal,
        });
        await until(
          () => profileOwnership.createdSince(cancellationProfiles).length === 1,
          'owned capture browser launch before cancellation',
          10_000,
        );
        cancellation.abort();
        await assert.rejects(
          cancellingSeal,
          (error) => error instanceof ReviewError && error.code === 'review_capture_timeout',
        );
        await until(
          () => profileOwnership.survivorsSince(cancellationProfiles).length === 0,
          'owned capture browser exit after cancellation',
          10_000,
        );
        assert.equal(
          profileOwnership.createdSince(cancellationProfiles).length,
          1,
          'cancellation receipt identifies one exact process-created capture profile',
        );
        assert.deepEqual(fs.readdirSync(stableReviewDirectory), ['working.json']);
        assert.deepEqual(fs.readFileSync(path.join(stableReviewDirectory, 'working.json')), workingBeforeFaults);

        const cssPath = path.join(
          workspace.root,
          ...workspace.stable.preview.assets.find(({ path: assetPath }) => assetPath.endsWith('/mock.css')).path.split('/'),
        );
        const cssBeforeDrift = fs.readFileSync(cssPath);
        const driftProfiles = profileOwnership.receipt();
        const driftingSeal = adapter.sealReview(liveInput);
        await until(
          () => profileOwnership.createdSince(driftProfiles).length === 1,
          'owned capture browser launch before asset drift',
          10_000,
        );
        fs.appendFileSync(cssPath, '\n/* changed during capture */\n');
        try {
          await assert.rejects(
            driftingSeal,
            (error) => error instanceof ReviewError && error.code === 'review_source_changed',
          );
        } finally {
          fs.writeFileSync(cssPath, cssBeforeDrift);
        }
        await until(
          () => profileOwnership.survivorsSince(driftProfiles).length === 0,
          'owned capture browser exit after asset drift',
          10_000,
        );
        assert.equal(
          profileOwnership.createdSince(driftProfiles).length,
          1,
          'source-drift receipt identifies one exact process-created capture profile',
        );
        assert.deepEqual(fs.readdirSync(stableReviewDirectory), ['working.json']);
        assert.deepEqual(fs.readFileSync(path.join(stableReviewDirectory, 'working.json')), workingBeforeFaults);

        // Inject each reachable exclusive-write failure after a real capture.
        // Cleanup may remove only adapter-created partials and must retain work.
        for (const filename of ['report.md', 'annotated.png', 'provenance.json']) {
          const originalOpenSync = fs.openSync;
          const failureProfiles = profileOwnership.receipt();
          fs.openSync = function injectedOpen(target, ...args) {
            if (String(target).endsWith(`${path.sep}${filename}`)) {
              throw Object.assign(new Error(`injected ${filename} write failure`), { code: 'EIO' });
            }
            return originalOpenSync.call(fs, target, ...args);
          };
          try {
            await assert.rejects(
              adapter.sealReview(liveInput),
              (error) => error instanceof ReviewError && error.code === 'review_write_failed',
              filename,
            );
          } finally {
            fs.openSync = originalOpenSync;
          }
          assert.deepEqual(fs.readdirSync(stableReviewDirectory), ['working.json'], `${filename} partials removed`);
          assert.deepEqual(fs.readFileSync(path.join(stableReviewDirectory, 'working.json')), workingBeforeFaults);
          assert.equal(
            profileOwnership.createdSince(failureProfiles).length,
            1,
            `${filename} failure launched one exact process-created capture profile`,
          );
          profileOwnership.assertReapedSince(
            failureProfiles,
            `${filename} failure exited its exact process-created capture profile`,
          );
        }

        const sealResult = await command({
          type: 'seal',
          text: liveInput.revisionText,
        }, 45_000);
        assert.equal(sealResult.status, 'sealed');
        assert.equal(sealResult.sent, false);
        assert.equal(sealResult.applied, false);
        assert.deepEqual(sealResult.response, {
          class: 'preview',
          action: 'annotations',
          submissionId: stableOpen.submissionId,
          text: liveInput.revisionText,
        });
        assert.deepEqual(fs.readdirSync(stableReviewDirectory).sort(), [
          'annotated.png',
          'provenance.json',
          'report.md',
          'working.json',
        ]);
        const events = await evaluate(reviewPage, `({
          changes: window.__reviewChanges,
          messages: window.__reviewMessages,
          state: window.__review.getState(),
        })`);
        assert.equal(events.changes.some(({ saving }) => saving), true);
        assert.equal(events.changes.some(({ sealing }) => sealing), true);
        assert.equal(events.state.status, 'sealed');
        assert.equal(events.state.editable, false);
        assert.ok(events.messages.some(({ message }) => /not been sent or applied/i.test(message)));

        const duplicateSeal = await postJson('/api/needs-you/review/seal', {
          requestHandle: stablePending.record.requestHandle,
          revision: stableRequest.revision,
          submissionId: stableOpen.submissionId,
          workingRevision: saved.workingRevision,
          revisionText: liveInput.revisionText,
        });
        assert.equal(duplicateSeal.response.status, 409);
        assert.equal(duplicateSeal.payload.error, 'review_sealed');
        const evidenceBytes = Object.fromEntries(
          ['working.json', 'report.md', 'annotated.png', 'provenance.json']
            .map((name) => [name, fs.readFileSync(path.join(stableReviewDirectory, name))]),
        );
        const sourceBytes = fs.readFileSync(path.join(workspace.root, ...workspace.stable.artifactPath.split('/')));
        const validationInput = {
          root: path.resolve(workspace.root),
          workspaceId: provider.read().workspaceId,
          sessionId: session.sessionId,
          providerGeneration: provider.read().providerGeneration,
          toolCallId: stablePending.invocation.toolCallId,
          requestHandle: stablePending.record.requestHandle,
          request: stableRequest,
          submissionId: stableOpen.submissionId,
          revisionText: liveInput.revisionText,
          signal: new AbortController().signal,
        };
        for (const [name, absolute, mutate] of [
          ['report', path.join(stableReviewDirectory, 'report.md'), (bytes) => Buffer.concat([bytes, Buffer.from('tamper')])],
          ['image', path.join(stableReviewDirectory, 'annotated.png'), (bytes) => {
            const changed = Buffer.from(bytes);
            changed[Math.floor(changed.length / 2)] ^= 1;
            return changed;
          }],
          ['provenance', path.join(stableReviewDirectory, 'provenance.json'), (bytes) => Buffer.concat([bytes, Buffer.from(' ')] )],
          ['working', path.join(stableReviewDirectory, 'working.json'), (bytes) => Buffer.concat([bytes, Buffer.from('\n')])],
          ['source', path.join(workspace.root, ...workspace.stable.artifactPath.split('/')), (bytes) => Buffer.concat([bytes, Buffer.from('<!-- drift -->')])],
        ]) {
          const original = name === 'source' ? sourceBytes : evidenceBytes[
            name === 'report' ? 'report.md'
              : name === 'image' ? 'annotated.png'
                : name === 'provenance' ? 'provenance.json' : 'working.json'
          ];
          fs.writeFileSync(absolute, mutate(original));
          try {
            await assert.rejects(
              adapter.readSealedSubmission(validationInput),
              (error) => error instanceof ReviewError
                && ['review_evidence_invalid', 'review_source_changed'].includes(error.code),
              `post-seal ${name} tamper`,
            );
          } finally {
            fs.writeFileSync(absolute, original);
          }
        }
        await assert.rejects(
          adapter.readSealedSubmission({ ...validationInput, sessionId: 'fresh-session-cannot-inherit' }),
          (error) => error instanceof ReviewError && error.code === 'review_historical',
        );
        const validated = await adapter.readSealedSubmission(validationInput);
        assert.equal(validated.submissionId, stableOpen.submissionId);
        const historicalAdapter = createReview({ root: workspace.root });
        try {
          const historical = await historicalAdapter.openReview({
            ...validationInput,
            sessionId: 'later-session',
            providerGeneration: 'later-generation',
            toolCallId: 'later-tool',
            requestHandle: 'later-handle',
            origin,
            allocate: false,
            checkCurrent: async () => {},
          });
          assert.equal(historical.status, 'historical');
          assert.equal(historical.editable, false);
          assert.equal(historical.evidence.report, validated.report.text);
          assert.equal(
            Buffer.from(historical.evidence.image.base64, 'base64').equals(validated.image.bytes),
            true,
          );
          await assert.rejects(
            historicalAdapter.saveReview({
              ...validationInput,
              sessionId: 'later-session',
              providerGeneration: 'later-generation',
              toolCallId: 'later-tool',
              requestHandle: 'later-handle',
              origin,
              checkCurrent: async () => {},
              workingRevision: historical.workingRevision,
              working: historical.working,
            }),
            (error) => error instanceof ReviewError && error.code === 'review_historical',
          );
        } finally {
          historicalAdapter.dispose();
        }

        const provenanceText = evidenceBytes['provenance.json'].toString('utf8');
        assert.doesNotMatch(provenanceText, /request-handle|review-tool-|review-session-|第一|Replace\u00a0without trimming/);
        assert.equal(logs.some((line) => /第一|Replace\u00a0without trimming|review-tool-|request-handle/.test(line)), false);
        assert.ok(queueReads > 0);
        assert.equal(sends.length, 0);

        const delivered = await evaluate(reviewPage, `(async () => {
          const response = await fetch('/api/needs-you/respond', {
            method: 'POST',
            headers: {'content-type':'application/json'},
            body: JSON.stringify({
              requestHandle: ${JSON.stringify(stablePending.record.requestHandle)},
              revision: ${JSON.stringify(stableRequest.revision)},
              response: ${JSON.stringify(sealResult.response)},
            }),
          });
          return { status: response.status, body: await response.json() };
        })()`);
        assert.equal(delivered.status, 202);
        assert.equal(delivered.body.status, 'delivered');
        assert.equal(delivered.body.saved, false);
        assert.equal(delivered.body.applied, false);
        const toolResult = await stablePending.result;
        const toolDetails = JSON.parse(toolResult.textResultForLlm);
        assert.equal(toolResult.resultType, 'success');
        assert.equal(toolDetails.status, 'awaiting_acknowledgment');
        assert.equal(toolDetails.acceptedAnswer, false);
        assert.equal(toolDetails.response.action, 'annotations');
        assert.equal(toolDetails.review.report.text.includes(literalComment), true);
        assert.match(toolDetails.review.report.text, /Source-bound JSON asset ✓/);
        for (const tool of ['box', 'circle', 'arrow', 'line', 'highlight', 'comment']) {
          assert.match(toolDetails.review.report.text, new RegExp(`## \\d+\\. ${tool}`));
        }
        assert.equal(toolDetails.review.provenance.path, `${workspace.stable.specDirectory}/reviews/${stableOpen.submissionId}/provenance.json`);
        assert.equal(toolResult.binaryResultsForLlm.length, 1);
        assert.equal(toolResult.binaryResultsForLlm[0].mimeType, 'image/png');
        assert.equal(sends.length, 0, 'annotation delivery uses the original tool result, never session.send');
        const image = Buffer.from(toolResult.binaryResultsForLlm[0].data, 'base64');
        const decoded = decodePng(image);
        assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 1536, height: 1200 });
        assert.equal(image.equals(evidenceBytes['annotated.png']), true);
        fs.writeFileSync(path.join(artifactRoot, 't010-sealed-annotated.png'), image);
        fs.writeFileSync(
          path.join(artifactRoot, 't010-sealed-report.md'),
          toolDetails.review.report.text,
        );
        fs.writeFileSync(
          path.join(artifactRoot, 't010-sealed-provenance.json'),
          evidenceBytes['provenance.json'],
        );
        fs.writeFileSync(path.join(artifactRoot, 't010-result.json'), `${JSON.stringify({
          browser: reviewBrowser.info.Browser,
          owner: workspace.stable.ideaPath,
          spec: workspace.stable.specPath,
          submissionId: stableOpen.submissionId,
          viewport: engineState.view.viewport,
          annotations: engineState.annotations.map(({ id, tool, element }) => ({
            id,
            tool,
            selector: element?.selector ?? null,
          })),
          reportRevision: toolDetails.review.report.revision,
          imageRevision: toolDetails.review.image.revision,
          provenanceRevision: toolDetails.review.provenance.revision,
          imageSha256: sha256(image),
          deliveredOnce: true,
          sessionSendCalls: sends.length,
          sessionMessageSent: false,
          approved: false,
          applied: false,
        }, null, 2)}\n`);
        const pixel = (x, y) => [...decoded.pixels.subarray((y * decoded.width + x) * 4, (y * decoded.width + x) * 4 + 4)];
        const near = (actual, expected, tolerance = 5) => actual.slice(0, 3)
          .every((channel, index) => Math.abs(channel - expected[index]) <= tolerance);
        assert.equal(near(pixel(1480, 40), [22, 58, 95]), true, 'sticky dark header pixels survive source capture');
        assert.equal(near(pixel(1480, 600), [16, 42, 67]), true, 'unmarked dark hero pixels survive source capture');
        let foundLogo = false;
        for (let y = 260; y < 400 && !foundLogo; y += 2) {
          for (let x = 1330; x < 1470; x += 2) {
            if (near(pixel(x, y), [255, 185, 0], 8)) { foundLogo = true; break; }
          }
        }
        assert.equal(foundLogo, true, 'the declared local SVG is visible in the actual image');
        const parseColor = (value) => {
          if (/^#[a-f0-9]{6}$/i.test(value)) return [
            Number.parseInt(value.slice(1, 3), 16),
            Number.parseInt(value.slice(3, 5), 16),
            Number.parseInt(value.slice(5, 7), 16),
          ];
          const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          assert.equal(channels?.length, 3, `unsupported computed color ${value}`);
          return channels;
        };
        const stroke = parseColor(engineState.palette.stroke);
        const badgeForeground = parseColor(engineState.palette.foreground);
        const badgeBackground = parseColor(engineState.palette.background);
        const badgeGlyphs = engineState.annotations.map((annotation, index) => {
          const anchor = badgeAnchor(annotation) ?? { x: annotation.x1, y: annotation.y1 };
          const radius = (badgeAnchor(annotation) ? BADGE_RADIUS : 12) - 2;
          const centerX = Math.round(
            (anchor.x - engineState.view.viewport.scrollX) * engineState.view.viewport.deviceScale,
          );
          const centerY = Math.round(
            (anchor.y - engineState.view.viewport.scrollY) * engineState.view.viewport.deviceScale,
          );
          const reach = Math.round(radius * engineState.view.viewport.deviceScale);
          const foregroundPixels = [];
          let backgroundPixels = 0;
          for (let dy = -reach; dy <= reach; dy += 1) {
            for (let dx = -reach; dx <= reach; dx += 1) {
              if (dx * dx + dy * dy > reach * reach) continue;
              const sample = pixel(centerX + dx, centerY + dy);
              if (near(sample, badgeForeground, 55)) foregroundPixels.push({ x: dx, y: dy });
              if (near(sample, badgeBackground, 35)) backgroundPixels += 1;
            }
          }
          const xs = foregroundPixels.map(({ x }) => x);
          const ys = foregroundPixels.map(({ y }) => y);
          return {
            index: index + 1,
            tool: annotation.tool,
            foregroundPixels: foregroundPixels.length,
            backgroundPixels,
            glyphWidth: xs.length ? Math.max(...xs) - Math.min(...xs) + 1 : 0,
            glyphHeight: ys.length ? Math.max(...ys) - Math.min(...ys) + 1 : 0,
          };
        });
        assert.equal(badgeGlyphs.length, engineState.annotations.length,
          'delivered-PNG checks run once per known annotation, never against an empty set');
        for (const glyph of badgeGlyphs) {
          assert.equal(glyph.foregroundPixels >= 4, true,
            `${glyph.tool} ${glyph.index} delivered badge contains foreground numeral pixels`);
          assert.equal(glyph.backgroundPixels > glyph.foregroundPixels, true,
            `${glyph.tool} ${glyph.index} delivered badge retains its isolating disc`);
          assert.equal(glyph.glyphWidth >= 2 && glyph.glyphHeight >= 4, true,
            `${glyph.tool} ${glyph.index} delivered numeral has a two-dimensional glyph`);
        }
        for (const annotation of engineState.annotations.filter(({ tool }) => tool !== 'highlight')) {
          for (const point of evidencePoints(annotation)) {
            const centerX = Math.round((point.x - 0) * 2);
            const centerY = Math.round((point.y - 300) * 2);
            let marked = false;
            for (let dy = -6; dy <= 6 && !marked; dy += 1) {
              for (let dx = -6; dx <= 6; dx += 1) {
                if (near(pixel(centerX + dx, centerY + dy), stroke, 35)) { marked = true; break; }
              }
            }
            assert.equal(marked, true, `${annotation.tool} evidence point ${point.x},${point.y} is painted`);
          }
        }
        const highlight = engineState.annotations.find(({ tool }) => tool === 'highlight');
        const highlightPoint = evidencePoints(highlight)[0];
        const highlighted = pixel(
          Math.round(highlightPoint.x * 2),
          Math.round((highlightPoint.y - 300) * 2),
        );
        assert.equal(near(highlighted, [16, 42, 67], 8), false, 'highlight center changes the known source pixel');

        const evidenceImage = await reviewPage.send('Page.captureScreenshot', { format: 'png' });
        const evidenceBuffer = Buffer.from(evidenceImage.data, 'base64');
        const evidenceName = `0768-t010-mounted-review-dark-dpr2.png`;
        fs.writeFileSync(path.join(artifactRoot, evidenceName), evidenceBuffer);
        screenshots.push({
          file: evidenceName,
          fixture: 't010-mounted-review',
          viewport: { width: 768, height: 600, deviceScale: 2 },
          theme: 'dark',
          sha256: sha256(evidenceBuffer),
          observations: [
            'Real mount under the current FluentProvider with opaque sandbox frame',
            'Six annotation tools, scrollY 300, sticky/vh source, local CSS/SVG/JSON, and DPR 2',
            'Report/image sealed but not approved, sent, or applied until the existing response route',
          ],
        });

        await assert.rejects(
          provider.respond({
            requestHandle: stablePending.record.requestHandle,
            revision: stableRequest.revision,
            response: sealResult.response,
          }),
          (error) => error.code === 'already_consumed',
        );
        assert.equal(provider.read().requests.find(
          ({ requestHandle }) => requestHandle === stablePending.record.requestHandle,
        ).phase, 'awaiting_acknowledgment');
        assert.equal(provider.read().requests.find(
          ({ requestHandle }) => requestHandle === hostilePending.record.requestHandle,
        ).phase, 'pending', 'the unrelated exact owner remains independently current');
        const disposed = await evaluate(reviewPage, `(() => {
          const before = window.__reviewChanges.length;
          window.__review.dispose();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }));
          return {
            before,
            after: window.__reviewChanges.length,
            mounted: Boolean(document.querySelector('.dude-review-engine')),
          };
        })()`);
        assert.deepEqual(disposed, { before: disposed.before, after: disposed.before, mounted: false },
          'dispose removes the engine and its global/message/keyboard listeners');
      } catch (error) {
        const failure = await reviewPage?.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
        if (failure) {
          const bytes = Buffer.from(failure.data, 'base64');
          const name = 't010-mounted-review-failure.png';
          fs.writeFileSync(path.join(artifactRoot, name), bytes);
          screenshots.push({
            file: name,
            fixture: 't010-mounted-review',
            viewport: { width: 768, height: 600 },
            theme: 'dark',
            sha256: sha256(bytes),
            observations: [String(error)],
          });
        }
        throw error;
      } finally {
        for (const controller of controllers) controller.abort();
        try { await reviewPage?.send('Page.navigate', { url: 'about:blank' }); } catch {}
        if (reviewBrowser) {
          await cleanupBrowserDriver(reviewBrowser);
          assert.equal(
            fs.existsSync(reviewBrowser.profile),
            false,
            'mounted Review fixture reaps its exact browser-driver profile',
          );
        }
        try { if (instance) await closeInstance(instanceId); } finally { provider.dispose(); }
        await Promise.allSettled(toolResults);
        workspace.close();
        profileOwnership.assertReapedSince(
          0,
          'no exact Review capture profile created by this test process survives fixture cleanup',
        );
      }
});
}

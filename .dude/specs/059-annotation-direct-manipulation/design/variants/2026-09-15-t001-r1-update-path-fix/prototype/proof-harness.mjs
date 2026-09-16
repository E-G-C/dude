// @ts-check
// Design-local harness primitives for the 059 proof. The CDP client, browser
// lifecycle, bounded waits, and native input helpers below are design-local
// copies of the primitives in scripts/dude-canvas-ui/browser.test.mjs; this
// file adds no general tooling and touches no repository test.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_ROOT = path.resolve(HERE, '..');
const REPOSITORY_ROOT = path.resolve(DESIGN_ROOT, '..', '..', '..', '..');
const BROWSER = process.env.DUDE_CANVAS_BROWSER ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const DEADLINE_MS = 15_000;
const sha256 = value => createHash('sha256').update(value).digest('hex');
/** Progress, so a stalled step is visible while the proof is running. */
const step = label => process.stderr.write(`· ${label}\n`);

async function until(probe, description, timeout = DEADLINE_MS) {
  const end = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ''}`);
}

class Cdp {
  constructor(debuggerUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(debuggerUrl);
    this.closed = new Promise(resolve => this.socket.addEventListener('close', resolve, { once: true }));
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
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
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    // A control channel that stops answering is a failure to report, not a
    // wait to sit in: every command carries its own deadline.
    return Promise.race([result, new Promise((_, reject) => setTimeout(
      () => reject(new Error(`CDP ${method} did not answer within 30s`)), 30_000).unref?.())]);
  }
  close() {
    if (this.socket.readyState !== WebSocket.CLOSING && this.socket.readyState !== WebSocket.CLOSED) this.socket.close();
    return this.closed;
  }
}

function descendants(root) {
  const output = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 2_000, maxBuffer: 1024 * 1024 });
  if (output.status !== 0) return [];
  const byParent = new Map();
  for (const line of output.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const children = byParent.get(Number(match[2])) ?? [];
    children.push(Number(match[1]));
    byParent.set(Number(match[2]), children);
  }
  const found = [];
  const visit = pid => { for (const child of byParent.get(pid) ?? []) { visit(child); found.push(child); } };
  visit(root);
  return found;
}

async function stopBrowser(child, profile, page) {
  await Promise.allSettled([page?.close()]);
  if (child.pid) {
    const owned = [...new Set([child.pid, ...descendants(child.pid)])];
    for (const pid of owned) { try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ } }
    await until(() => owned.every(pid => {
      try { process.kill(pid, 0); return false; } catch { return true; }
    }), 'owned browser processes to exit', 4_000).catch(() => {
      for (const pid of owned) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
    });
  }
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
}

/** Background-safe isolated profile. No user profile, no app activation. */
async function startBrowser(deviceScale = 1) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-059-design-profile-'));
  const browser = spawn(BROWSER, [
    '--headless=new', '--disable-gpu', '--disable-backgrounding-occluded-windows',
    '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    `--force-device-scale-factor=${deviceScale}`,
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout.resume();
  let stderr = '';
  browser.stderr.on('data', bytes => { stderr += bytes; });
  const portFile = path.join(profile, 'DevToolsActivePort');
  const port = await until(() => {
    if (browser.exitCode !== null) throw new Error(`browser exited: ${stderr}`);
    if (!fs.existsSync(portFile)) return null;
    const first = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
    return /^\d+$/.test(first) ? Number(first) : null;
  }, 'browser DevToolsActivePort');
  const info = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok ? response.json() : null;
  }, 'browser DevTools version endpoint');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = new Cdp(target.webSocketDebuggerUrl);
  await page.open();
  await Promise.all([page.send('Page.enable'), page.send('Runtime.enable'),
    page.send('DOM.enable'), page.send('Network.enable'), page.send('Accessibility.enable')]);
  return { browser, page, profile, info };
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'evaluation failed');
  }
  return result.result?.value;
}

async function setViewport(page, width, height, theme) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-color-scheme', value: theme }] });
}

// ---------------------------------------------------------------------------
// Native input, in document CSS pixels of the reviewed view.

async function clientPoint(page, p) {
  return evaluate(page, `(() => {
    const overlay = document.querySelector('.dude-review-overlay');
    const box = overlay.getBoundingClientRect();
    const view = window.__designReviewEngine.getState().view.viewport;
    return {
      x: box.left + (${p.x} - view.scrollX) * box.width / view.width,
      y: box.top + (${p.y} - view.scrollY) * box.height / view.height,
    };
  })()`);
}

async function move(page, page_point, buttons = 0) {
  const at = await clientPoint(page, page_point);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, ...(buttons ? { button: 'left', buttons } : {}) });
  return at;
}

async function press(page, p) {
  const at = await clientPoint(page, p);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
  return at;
}

async function release(page, p) {
  const at = await clientPoint(page, p);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 });
  return at;
}

/** One complete press-drag-release in document coordinates, with real steps. */
async function drag(page, from, to, steps = 6) {
  await press(page, from);
  for (let step = 1; step <= steps; step += 1) {
    await move(page, { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps }, 1);
  }
  await release(page, to);
  await settle(page);
}

async function settle(page) {
  await evaluate(page, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}

const state = page => evaluate(page, 'window.__designReviewEngine.getState()');
const cursor = page => evaluate(page, `getComputedStyle(document.querySelector('.dude-review-overlay')).cursor`);
const action = page => evaluate(page, `document.querySelector('.dude-review-overlay').dataset.action ?? null`);

async function clickTool(page, label) {
  await evaluate(page, `(() => {
    const button = document.querySelector('[aria-label=${JSON.stringify(label)}]');
    if (!button) throw new Error('missing tool ' + ${JSON.stringify(label)});
    button.scrollIntoView({ block: 'nearest' });
    return true;
  })()`);
  const at = await evaluate(page, `(() => {
    const box = document.querySelector('[aria-label=${JSON.stringify(label)}]').getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 });
  await settle(page);
}

async function key(page, name, { code = name, text = undefined, modifiers = 0 } = {}) {
  const virtual = { Enter: 13, Escape: 27, Tab: 9, Delete: 46,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35 }[name] ?? 0;
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: virtual, modifiers, ...(text ? { text } : {}) });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: virtual, modifiers });
  await settle(page);
}

// ---------------------------------------------------------------------------
// Geometry helpers on the engine's own projected annotations.

const boundsOf = a => ({ x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), width: Math.abs(a.x2 - a.x1), height: Math.abs(a.y2 - a.y1) });
const segment = a => ['line', 'arrow'].includes(a.tool);

function handlePoint(a, name) {
  if (name === 'p1') return { x: a.x1, y: a.y1 };
  if (name === 'p2') return { x: a.x2, y: a.y2 };
  const b = boundsOf(a);
  return { nw: { x: b.x, y: b.y }, ne: { x: b.x + b.width, y: b.y },
    se: { x: b.x + b.width, y: b.y + b.height }, sw: { x: b.x, y: b.y + b.height } }[name];
}

/** A point on the mark's painted edge or stroke, away from every handle. */
function boundaryPoint(a) {
  if (segment(a)) return { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 };
  const b = boundsOf(a);
  if (a.tool === 'circle') return { x: b.x + b.width / 2, y: b.y };
  return { x: b.x + b.width / 2, y: b.y };
}

/** A point inside the mark's area but away from its border and handles. */
function interiorPoint(a) {
  const b = boundsOf(a);
  if (segment(a)) {
    const length = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
    const nx = -(a.y2 - a.y1) / length, ny = (a.x2 - a.x1) / length;
    return { x: (a.x1 + a.x2) / 2 + nx * 26, y: (a.y1 + a.y2) / 2 + ny * 26 };
  }
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function badgePoint(a) {
  if (segment(a)) {
    const dx = a.x1 - a.x2, dy = a.y1 - a.y2, length = Math.hypot(dx, dy) || 1;
    return { x: a.x1 + (dx / length) * 14, y: a.y1 + (dy / length) * 14 };
  }
  const b = boundsOf(a);
  return { x: b.x - 9, y: b.y - 9 };
}

const TOOL_LABEL = { select: 'Select (V)', comment: 'Comment (C)', box: 'Box (B)', circle: 'Circle (O)',
  arrow: 'Arrow (A)', line: 'Line (L)', highlight: 'Highlight (H)' };
const SHAPES = ['box', 'circle', 'arrow', 'line', 'highlight'];

/** Where each shape type is drawn for one matrix cell, in document pixels. */
function shapeStroke(tool, origin) {
  return segment({ tool })
    ? { from: { x: origin.x, y: origin.y }, to: { x: origin.x + 150, y: origin.y + 90 } }
    : { from: { x: origin.x, y: origin.y }, to: { x: origin.x + 160, y: origin.y + 110 } };
}


export { until, Cdp, startBrowser, stopBrowser, evaluate, setViewport, clientPoint, move, press, release,
  drag, settle, state, cursor, action, clickTool, key, boundsOf, segment, handlePoint, boundaryPoint,
  interiorPoint, badgePoint, shapeStroke, sha256, step, TOOL_LABEL, SHAPES, DESIGN_ROOT, REPOSITORY_ROOT, BROWSER };

// Temporary verification helpers for the 067 pre-approval check. Not product code.
// Adapted from the repository's existing browser harness idea (scripts/dude-canvas-ui/browser.test.mjs):
// a WebSocket CDP client, a unique throwaway profile, and cleanup limited to exact owned PIDs.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function until(probe, description, timeout = 15000, step = 25) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) { last = error; }
    await sleep(step);
  }
  throw new Error(`Timed out waiting for ${description}${last ? `: ${last.message}` : ''}`);
}

/* ------------------------------------------------------------------ hashing */

export const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex');
export const sha256File = file => sha256Bytes(fs.readFileSync(file));

export function walkFiles(dir, out = [], prune = new Set(['node_modules'])) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!prune.has(entry.name)) walkFiles(full, out, prune); }
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Map of repo-relative posix path -> { sha256, bytes } for every file under the given repo-relative roots. */
export function manifest(repo, roots, skip = () => false) {
  const map = new Map();
  for (const root of roots) {
    const abs = path.join(repo, root);
    if (!fs.existsSync(abs)) continue;
    const files = fs.statSync(abs).isDirectory() ? walkFiles(abs) : [abs];
    for (const file of files) {
      const rel = path.relative(repo, file).split(path.sep).join('/');
      if (skip(rel)) continue;
      const bytes = fs.readFileSync(file);
      map.set(rel, { sha256: sha256Bytes(bytes), bytes: bytes.length });
    }
  }
  return map;
}

export function manifestDigest(map) {
  const hash = createHash('sha256');
  for (const key of [...map.keys()].sort()) hash.update(`${key}\0${map.get(key).sha256}\n`);
  return hash.digest('hex');
}

export function diffManifests(before, after) {
  const changed = [], removed = [], added = [];
  for (const [key, value] of before) {
    if (!after.has(key)) removed.push(key);
    else if (after.get(key).sha256 !== value.sha256) changed.push(key);
  }
  for (const key of after.keys()) if (!before.has(key)) added.push(key);
  return { changed, removed, added };
}

/* ------------------------------------------------------------------ CDP client */

export class Cdp {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(url);
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

  send(method, params = {}, timeout = 30000) {
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, listener) {
    const list = this.listeners.get(method) ?? [];
    list.push(listener);
    this.listeners.set(method, list);
  }

  close() {
    if (this.socket.readyState !== WebSocket.CLOSING && this.socket.readyState !== WebSocket.CLOSED) this.socket.close();
    return this.closed;
  }
}

/* ------------------------------------------------------------------ process inventory (Windows) */

export function listProcesses() {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 120000, windowsHide: true });
  if (result.status !== 0) throw new Error(`process listing failed: ${result.stderr || result.error}`);
  let parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) parsed = [parsed];
  return parsed.map(item => ({ pid: item.ProcessId, ppid: item.ParentProcessId, name: item.Name, cmd: item.CommandLine || '' }));
}

/** Exact ownership: descendants of the spawned PID plus any process whose command line carries our unique profile path. */
export function ownedProcesses(rootPid, profileDir) {
  const procs = listProcesses();
  const marker = profileDir.toLowerCase();
  const children = new Map();
  for (const proc of procs) children.set(proc.ppid, [...(children.get(proc.ppid) ?? []), proc]);
  const owned = new Map();
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    if (owned.has(pid)) continue;
    const me = procs.find(proc => proc.pid === pid);
    if (me) owned.set(pid, me);
    for (const child of children.get(pid) ?? []) stack.push(child.pid);
  }
  for (const proc of procs) if (proc.cmd.toLowerCase().includes(marker)) owned.set(proc.pid, proc);
  return [...owned.values()].map(proc => ({ pid: proc.pid, ppid: proc.ppid, name: proc.name }));
}

/* ------------------------------------------------------------------ browser */

export function discoverBrowser() {
  const candidates = [process.env.DUDE_CANVAS_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error('No Chromium-family browser found; set DUDE_CANVAS_BROWSER.');
  return found;
}

export async function launchBrowser(browserPath, tempRoot) {
  const profile = fs.mkdtempSync(path.join(tempRoot, 'edge-profile-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-update', '--disable-background-networking', '--disable-sync',
    '--force-color-profile=srgb', '--remote-allow-origins=*', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'];
  const child = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '';
  let launchError = null;
  child.once('error', error => { launchError = error; });
  child.stdout.resume();
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
  const ctx = { child, profile, pid: child.pid, args };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = await until(() => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Browser exited early (${child.exitCode}): ${stderr}`);
      if (!fs.existsSync(portFile)) return null;
      const first = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
      return /^\d+$/.test(first) ? Number(first) : null;
    }, 'DevToolsActivePort', 30000);
    ctx.port = port;
    ctx.version = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return response.ok ? response.json() : null;
    }, 'DevTools version endpoint');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    ctx.page = await attachPage(target.webSocketDebuggerUrl);
    return ctx;
  } catch (error) {
    await shutdownBrowser(ctx).catch(() => {});
    throw error;
  }
}

export async function attachPage(wsUrl) {
  const cdp = new Cdp(wsUrl);
  await cdp.open();
  const state = { console: [], exceptions: [], logs: [], requests: [], sockets: [], allRequests: [], allSockets: [], scriptIds: [] };
  const page = { cdp, state, send: (method, params, timeout) => cdp.send(method, params, timeout) };
  cdp.on('Runtime.exceptionThrown', params => state.exceptions.push(
    String(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text).slice(0, 300)));
  cdp.on('Runtime.consoleAPICalled', params => {
    if (['error', 'warning', 'assert'].includes(params.type)) {
      state.console.push(`${params.type}: ${params.args.map(arg => arg.value ?? arg.description ?? arg.type).join(' ')}`.slice(0, 300));
    }
  });
  cdp.on('Log.entryAdded', params => {
    if (['error', 'warning'].includes(params.entry.level)) {
      state.logs.push(`${params.entry.level}/${params.entry.source}: ${params.entry.text} ${params.entry.url ?? ''}`.slice(0, 300));
    }
  });
  cdp.on('Network.requestWillBeSent', params => {
    const entry = { url: params.request.url.slice(0, 220), type: params.type };
    state.requests.push(entry);
    state.allRequests.push(entry);
    if (params.type === 'Script') state.scriptIds.push({ id: params.requestId, url: params.request.url });
  });
  cdp.on('Network.webSocketCreated', params => { state.sockets.push(params.url); state.allSockets.push(params.url); });
  await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable', 'DOM.enable', 'Accessibility.enable']
    .map(method => cdp.send(method)));
  return page;
}

/** Close via the browser endpoint, then terminate only still-living processes that carry our unique profile. */
export async function shutdownBrowser(ctx) {
  const report = { ownedBefore: [], closedGracefully: false, killed: [], survivorsAfter: [], profileRemoved: false };
  try { report.ownedBefore = ownedProcesses(ctx.pid, ctx.profile); } catch (error) { report.inventoryError = String(error.message); }
  try { await ctx.page?.cdp.close(); } catch { /* ignore */ }
  try {
    if (ctx.port && ctx.version?.webSocketDebuggerUrl) {
      const browser = new Cdp(ctx.version.webSocketDebuggerUrl);
      await browser.open();
      await browser.send('Browser.close', {}, 5000).catch(() => {});
      await Promise.race([browser.closed, sleep(2000)]);
    }
  } catch { /* fall through to PID cleanup */ }
  const exited = () => ctx.child.exitCode !== null || ctx.child.signalCode !== null;
  await until(exited, 'browser process exit', 8000).catch(() => {});
  report.closedGracefully = exited();
  await sleep(800);
  let survivors = [];
  try { survivors = ownedProcesses(ctx.pid, ctx.profile).filter(proc => proc.pid !== process.pid); } catch (error) { report.inventoryError = String(error.message); }
  const rootMayStillBeOurs = !exited();
  for (const proc of survivors) {
    if (proc.pid === ctx.pid && !rootMayStillBeOurs) continue; // the spawned PID has exited; do not touch a reused PID
    try { process.kill(proc.pid); report.killed.push(proc.pid); } catch { /* already gone */ }
  }
  await sleep(1000);
  try { report.survivorsAfter = ownedProcesses(ctx.pid, ctx.profile).filter(proc => proc.pid !== ctx.pid || rootMayStillBeOurs); } catch { /* ignore */ }
  for (let attempt = 0; attempt < 10 && fs.existsSync(ctx.profile); attempt += 1) {
    try { fs.rmSync(ctx.profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { await sleep(300); }
  }
  report.profileRemoved = !fs.existsSync(ctx.profile);
  return report;
}

/* ------------------------------------------------------------------ page helpers */

export async function evalFn(page, fn, ...args) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'evaluation failed');
  }
  return result.result?.value;
}

const VIRTUAL_KEYS = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, ' ': 32, Backspace: 8 };

export async function pressKey(page, key, { shift = false } = {}) {
  const code = VIRTUAL_KEYS[key] ?? 0;
  const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
  const modifiers = shift ? 8 : 0;
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code, modifiers, text, unmodifiedText: text });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code, modifiers });
}

export async function clickPoint(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

/** Real mouse click at the center of the matching element (scrolled into view first). Throws if another element would receive it. */
export async function clickSelector(page, selector, { index = 0, text = null } = {}) {
  const target = await evalFn(page, (selector, index, text) => {
    let nodes = [...document.querySelectorAll(selector)];
    if (text !== null) nodes = nodes.filter(node => (node.textContent || '').replace(/\s+/g, ' ').trim() === text
      || node.getAttribute('aria-label') === text);
    const node = nodes[index];
    if (!node) return null;
    node.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, ok: Boolean(hit && (node === hit || node.contains(hit) || hit.contains(node))), hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 40)}` : null };
  }, selector, index, text);
  if (!target) throw new Error(`No element for ${selector}${text !== null ? ` with text "${text}"` : ''}`);
  if (!target.ok) throw new Error(`Click on ${selector} would hit ${target.hit}`);
  await clickPoint(page, target.x, target.y);
  return target;
}

export async function typeText(page, text) {
  await page.send('Input.insertText', { text });
}

export async function screenshot(page, clip = null) {
  const params = { format: 'png', fromSurface: true, captureBeyondViewport: false };
  if (clip) params.clip = { ...clip, scale: 1 };
  const { data } = await page.send('Page.captureScreenshot', params);
  return Buffer.from(data, 'base64');
}

/* ------------------------------------------------------------------ PNG + color */

export function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG');
  let offset = 8, width = 0, height = 0, channels = 0;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const kind = buffer.toString('ascii', offset + 4, offset + 8);
    if (kind === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8); height = buffer.readUInt32BE(offset + 12);
      const depth = buffer[offset + 16], colorType = buffer[offset + 17], interlace = buffer[offset + 20];
      channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
      if (depth !== 8 || !channels || interlace !== 0) throw new Error(`unsupported PNG depth=${depth} type=${colorType} interlace=${interlace}`);
    } else if (kind === 'IDAT') data.push(buffer.subarray(offset + 8, offset + 8 + length));
    else if (kind === 'IEND') break;
    offset += 12 + length;
  }
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride), row = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1), filter = raw[base];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0, up = previous[x], upperLeft = x >= channels ? previous[x - channels] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      else if (filter === 2) prediction = up;
      else if (filter === 3) prediction = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
        prediction = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      }
      row[x] = (raw[base + 1 + x] + prediction) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const to = (y * width + x) * 4, from = x * channels;
      pixels[to] = row[from]; pixels[to + 1] = row[from + 1]; pixels[to + 2] = row[from + 2];
      pixels[to + 3] = channels === 4 ? row[from + 3] : 255;
    }
    [previous, row] = [row, previous];
  }
  return { width, height, pixels };
}

const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
export const blend = (fg, alpha, bg) => fg.map((channel, index) => channel * alpha + bg[index] * (1 - alpha));

export function pixelAt(image, x, y) {
  const cx = Math.min(image.width - 1, Math.max(0, Math.floor(x))), cy = Math.min(image.height - 1, Math.max(0, Math.floor(y)));
  const at = (cy * image.width + cx) * 4;
  return [image.pixels[at], image.pixels[at + 1], image.pixels[at + 2]];
}

/** Most frequent color in a device-pixel rectangle (strided for large areas). */
export function modeColor(image, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(image.width, Math.ceil(x1)); y1 = Math.min(image.height, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return null;
  const step = (x1 - x0) * (y1 - y0) > 40000 ? 2 : 1;
  const counts = new Map();
  let best = null, bestCount = 0;
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const at = (y * image.width + x) * 4;
      const key = (image.pixels[at] << 16) | (image.pixels[at + 1] << 8) | image.pixels[at + 2];
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (count > bestCount) { bestCount = count; best = key; }
    }
  }
  return best === null ? null : [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

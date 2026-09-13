// @ts-check
// Browser discovery/HTML capture patterns adapted from Sharpie (MIT; NOTICE.txt).
// CDP pipe uses only Node >=20 APIs. No WebSocket, download, SDK install path,
// shared browser profile, foreground activation, or screenshot-only CLI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInspector, imageIsStatic, validScrolls } from '../../ui/review/inspector.mjs';
import { captureAnchorMatches, portableElement, projectAnnotation, insideClip, clipHidesAnchor } from '../../ui/review/geometry.mjs';
import { REVIEW_LIMITS, ReviewError, element, hash, same } from './data.mjs';
import { verifyComposite } from './png.mjs';

const STATIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ui/review');
const COMMAND_MS = 4000;
const STARTUP_MS = 10000;
const WIRE_BYTES = 32 * 1024 * 1024;
const captureError = stage => new ReviewError('review_capture_failed', 503, { stage });

/**
 * The only removal seam for an owned profile; every path that created one runs
 * it and reports the outcome instead of leaking the directory. rmSync makes no
 * retries by default, so one write from a browser helper still flushing the
 * tree fails the whole removal with ENOTEMPTY.
 */
const removeProfile = directory => {
  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 }); return true; }
  catch { return false; }
};

export function findBrowser() {
  const names = process.platform === 'win32' ? ['msedge.exe', 'chrome.exe', 'chromium.exe']
    : ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'];
  const candidates = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
    .flatMap(dir => names.map(name => path.join(dir, name)));
  if (process.platform === 'darwin') {
    for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      for (const name of ['Microsoft Edge', 'Google Chrome', 'Chromium']) {
        candidates.push(path.join(dir, `${name}.app`, 'Contents', 'MacOS', name));
      }
    }
  } else if (process.platform === 'win32') {
    for (const dir of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)) {
      for (const relative of ['Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe', 'Chromium/Application/chrome.exe']) {
        candidates.push(path.join(dir, relative));
      }
    }
  }
  return candidates.find(candidate => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile(); } catch { return false; }
  }) ?? null;
}

function descendants(pid) {
  if (process.platform === 'win32') return [];
  const result = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 1000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) return null;
  const byParent = new Map();
  for (const line of result.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!m) continue;
    const parent = Number(m[2]), children = byParent.get(parent) ?? [];
    children.push(Number(m[1])); byParent.set(parent, children);
  }
  const found = [];
  const visit = parent => { for (const child of byParent.get(parent) ?? []) { visit(child); found.push(child); } };
  visit(pid);
  return found;
}

/** One attached, isolated, owned process; every command has a deadline. */
export async function launchBrowser(signal, deviceScale = 1) {
  signal.throwIfAborted();
  if (!Number.isFinite(deviceScale) || deviceScale < 0.25 || deviceScale > 4) throw new ReviewError('review_invalid_input', 400);
  const executable = findBrowser();
  if (!executable) throw new ReviewError('review_browser_missing', 503);
  let profile, child;
  try {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-browser-'));
    child = spawn(executable, [
      '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      // PNG readback and the SVG/Canvas compositor must use the same color space,
      // rather than a display ICC profile followed by Canvas's sRGB conversion.
      '--force-color-profile=srgb',
      // Metrics overrides on the top target alone do not change OOPIF DPR.
      `--force-device-scale-factor=${deviceScale}`,
      '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch {
    const cleanupUncertain = profile !== undefined && !removeProfile(profile);
    throw new ReviewError('review_capture_failed', 503, { stage: 'launch', cleanupUncertain });
  }
  let nextId = 0, buffer = Buffer.alloc(0), failure = null, closing = null;
  const pending = new Map(), listeners = new Map();
  const exited = new Promise(resolve => child.once('close', resolve));
  const withExit = error => new ReviewError(error.code, error.status, {
    ...error.detail, exitCode: child.exitCode, signal: child.signalCode,
  });
  const fail = error => {
    failure ??= error instanceof ReviewError ? error : captureError();
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(failure); }
    pending.clear();
  };
  child.once('error', () => fail(captureError('launch')));
  child.once('exit', () => {
    if (!closing) fail(captureError('child_exit'));
    if (failure) failure.detail = withExit(failure).detail;
  });
  child.stdio[3].on('error', () => fail(captureError('pipe_write')));
  child.stdio[4].on('error', () => fail(captureError('pipe_read')));
  child.stdio[4].on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > WIRE_BYTES) { fail(captureError('protocol')); return; }
    let split;
    while ((split = buffer.indexOf(0)) !== -1) {
      const bytes = buffer.subarray(0, split); buffer = buffer.subarray(split + 1);
      let message;
      try { message = JSON.parse(bytes.toString('utf8')); } catch { fail(captureError('protocol')); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { fail(captureError('protocol')); return; }
      if (message.id) {
        const p = pending.get(message.id);
        if (!p) continue;
        pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(captureError('protocol'));
        else p.resolve(message.result);
      } else for (const listener of listeners.get(message.method) ?? []) {
        Promise.resolve().then(() => listener(message.params, message.sessionId)).catch(fail);
      }
    }
  });
  function send(method, params = {}, sessionId) {
    if (failure) return Promise.reject(failure);
    if (signal.aborted) return Promise.reject(new ReviewError('review_capture_timeout', 503));
    const id = ++nextId, bytes = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
    if (Buffer.byteLength(bytes) > WIRE_BYTES) return Promise.reject(captureError('protocol'));
    return new Promise((resolve, reject) => {
      // Only the initial Browser.getVersion includes process startup and CDP
      // readiness (measured valid replies at 4.9–7.6s on a loaded host).
      // Later commands, including Browser.close, retain the responsiveness
      // bound; the provider still bounds the whole open/seal operation at 30s.
      const timer = setTimeout(() => {
        pending.delete(id); reject(new ReviewError('review_capture_timeout', 503, { stage: 'command_timeout' }));
      }, id === 1 ? STARTUP_MS : COMMAND_MS);
      pending.set(id, { resolve, reject, timer });
      try { child.stdio[3].write(`${bytes}\0`, error => { if (error) fail(captureError('pipe_write')); }); }
      catch { fail(captureError('pipe_write')); }
    });
  }
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      let cleanupUncertain = false, owned = [];
      signal.removeEventListener('abort', onAbort);
      if (child.pid && child.exitCode === null && child.signalCode === null && !failure && !signal.aborted) {
        // A normal browser shutdown may exit without replying to Browser.close.
        await Promise.race([send('Browser.close').catch(() => {}), exited]);
      }
      fail(captureError('cleanup'));
      const wait = async ms => {
        const deadline = Date.now() + ms;
        while (true) {
          // The main child's close does not cover helpers that have no CDP pipes.
          owned = owned.filter(pid => {
            try { process.kill(pid, 0); return true; } catch (error) {
              if (error.code === 'ESRCH') return false;
              cleanupUncertain = true; return true;
            }
          });
          if (!owned.length && (!child.pid || child.exitCode !== null || child.signalCode !== null)) return true;
          const remaining = deadline - Date.now();
          if (remaining <= 0) return false;
          await new Promise(resolve => setTimeout(resolve, Math.min(50, remaining)));
        }
      };
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        const children = descendants(child.pid);
        cleanupUncertain = children === null;
        owned = [child.pid, ...(children ?? [])];
        for (const pid of owned.slice().reverse()) {
          try { process.kill(pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') cleanupUncertain = true; }
        }
        if (!(await wait(1000))) {
          if (process.platform === 'win32') {
            const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 2000, windowsHide: true, stdio: 'ignore' });
            if (result.status !== 0) cleanupUncertain = true;
          } else for (const pid of owned.slice().reverse()) {
            try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') cleanupUncertain = true; }
          }
        }
      }
      child.stdio[3].destroy(); child.stdio[4].destroy();
      // Removal stays after the escalation because Windows cannot delete a file
      // an owned process still holds open, but it now runs even when the wait
      // timed out: leaking a temp directory is worse than reporting uncertainty,
      // and a POSIX unlink of an open file is safe.
      const reaped = await wait(2000);
      const removed = removeProfile(profile);
      if (!reaped || !removed || cleanupUncertain) throw captureError('cleanup');
    })().catch(() => {
      throw withExit(new ReviewError('review_capture_failed', 503, { stage: 'cleanup', cleanupUncertain: true }));
    });
    return closing;
  }
  const onAbort = () => { fail(new ReviewError('review_capture_timeout', 503)); void close().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    const version = await send('Browser.getVersion');
    if (typeof version?.product !== 'string' || version.product.length > 160
      || !/(?:Chrome|Chromium|Edg)\//.test(version.product)) throw captureError('protocol');
    return { send, close, version: version.product,
      on(method, listener) { const list = listeners.get(method) ?? []; list.push(listener); listeners.set(method, list); } };
  } catch (error) {
    let primary = error instanceof ReviewError ? error : captureError();
    try { await close(); }
    catch { primary = new ReviewError(primary.code, primary.status, { ...primary.detail, cleanupUncertain: true }); }
    throw withExit(primary);
  }
}

export async function preflightCapture(signal) {
  const browser = await launchBrowser(signal);
  try { return { available: true, browser: browser.version, mode: 'fresh-viewport' }; }
  finally { await browser.close(); }
}

async function until(probe, signal, milliseconds = 8000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const result = await probe();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new ReviewError('review_not_ready', 503);
}

/** No renderer-supplied PNG, SVG, path, MIME, or executable enters this seam. */
export async function capturePage({ resources, framePath, origin, state, signal }) {
  const browser = await launchBrowser(signal, state.view.viewport.deviceScale);
  let resourceFailure = false, primaryFailure = null;
  try {
    const target = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const send = (method, params = {}) => browser.send(method, params, sessionId);
    const pageSessions = new Set([sessionId]);
    const v = state.view.viewport;
    const capturePath = '/__dude_review_capture__';
    const frameUrl = `${origin}${framePath}`;
    const files = new Map(resources);
    const wrapper = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;color-scheme:${v.theme}}iframe{border:0;width:100%;height:100%;display:block;pointer-events:none;color-scheme:${v.theme}}</style><iframe sandbox="allow-scripts" src="${frameUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>`;
    files.set(capturePath, { bytes: Buffer.from(wrapper), mime: 'text/html; charset=utf-8' });
    for (const name of ['capture.mjs', 'shapes.mjs', 'geometry.mjs']) {
      files.set(`/review/${name}`, { bytes: fs.readFileSync(path.join(STATIC_ROOT, name)), mime: 'text/javascript; charset=utf-8' });
    }
    browser.on('Fetch.requestPaused', async (event, eventSession) => {
      if (!pageSessions.has(eventSession)) return;
      const reply = (method, params) => browser.send(method, params, eventSession);
      const url = new URL(event.request.url);
      const file = url.origin === origin && !url.search && !url.hash ? files.get(url.pathname) : null;
      if (!file || event.request.method !== 'GET') {
        resourceFailure = true;
        await reply('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
        return;
      }
      await reply('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: file.mime },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'no-store' },
          ...(file.csp ? [{ name: 'Content-Security-Policy', value: file.csp }] : []),
        ], body: file.bytes.toString('base64') });
    });
    browser.on('Network.loadingFailed', (event, eventSession) => {
      if (pageSessions.has(eventSession) && !event.canceled) resourceFailure = true;
    });
    // Opaque sandbox frames are out-of-process on supported Chromium builds.
    // Pause each owned child before execution, install the same closed network
    // interception, then inspect it through its own isolated CDP world.
    browser.on('Target.attachedToTarget', async (event, parentSession) => {
      if (!pageSessions.has(parentSession)) return;
      if (event.targetInfo.type !== 'iframe' || pageSessions.size >= 2) throw new ReviewError('review_capture_failed', 503);
      const childSession = event.sessionId;
      pageSessions.add(childSession);
      for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await browser.send(method, {}, childSession);
      await browser.send('Network.setCacheDisabled', { cacheDisabled: true }, childSession);
      await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, childSession);
      await browser.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, childSession);
      await browser.send('Runtime.runIfWaitingForDebugger', {}, childSession);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height,
      deviceScaleFactor: v.deviceScale, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v.theme }] });
    await send('Page.navigate', { url: `${origin}${capturePath}` });
    const viewed = await until(async () => {
      for (const pageSession of pageSessions) {
        const result = await browser.send('Page.getFrameTree', {}, pageSession);
        const tree = result.frameTree;
        const frame = tree.frame.url === frameUrl ? tree.frame
          : tree.childFrames?.find(f => f.frame.url === frameUrl)?.frame;
        if (frame) return { frame, pageSession };
      }
      return null;
    }, signal);
    const { executionContextId } = await browser.send('Page.createIsolatedWorld', {
      frameId: viewed.frame.id, worldName: 'dude-review-evidence', grantUniveralAccess: false,
    }, viewed.pageSession);
    async function evaluate(expression, contextId) {
      const result = await browser.send('Runtime.evaluate', {
        expression, ...(contextId ? { contextId } : {}), awaitPromise: true, returnByValue: true,
      }, contextId ? viewed.pageSession : sessionId);
      if (result.exceptionDetails) {
        const description = result.exceptionDetails.exception?.description ?? '';
        const code = ['review_not_ready', 'review_anchor_invalid', 'review_transient_unsupported',
          'review_capture_mismatch', 'review_document_too_large', 'review_invalid_input'].find(c => description.includes(c));
        throw new ReviewError(code ?? 'review_capture_failed', 503);
      }
      return result.result?.value;
    }
    await evaluate(`globalThis.__dudeReviewInspector = (${createInspector.toString()})(document, window, (${imageIsStatic.toString()}), (${validScrolls.toString()})); true`, executionContextId);
    await until(async () => {
      try { return await evaluate('globalThis.__dudeReviewInspector.readView()', executionContextId); }
      catch (error) { if (error.code === 'review_not_ready') return null; throw error; }
    }, signal);
    await evaluate(`globalThis.__dudeReviewInspector.restoreView(${JSON.stringify(state.view)})`, executionContextId);
    let prior = null;
    const before = await until(async () => {
      if (resourceFailure) throw new ReviewError('review_capture_failed', 503);
      let current;
      try { current = await evaluate('globalThis.__dudeReviewInspector.readView()', executionContextId); }
      catch (error) { if (error.code === 'review_not_ready') return null; throw error; }
      const stable = prior?.signature === current.signature;
      prior = current;
      return stable ? current : null;
    }, signal);
    if (!same(before.viewport, v) || !same(before.scrolls, state.view.scrolls ?? [])) throw new ReviewError('review_capture_mismatch');
    const readAnchors = async () => {
      const anchors = await evaluate(`(${JSON.stringify(state.annotations.map(a => a.element?.selector ?? null))}).map(s => s ? globalThis.__dudeReviewInspector.describeSelector(s) : null)`, executionContextId);
      for (let i = 0; i < anchors.length; i++) if (state.annotations[i].element) {
        const a = state.annotations[i], current = anchors[i];
        if (!captureAnchorMatches(a.element, a.scrollBasis, current, before.scrolls)) throw new ReviewError('review_anchor_invalid');
        if (!current.visible) throw new ReviewError('review_outside_viewport');
        if (clipHidesAnchor(current.element.rect, current.clip)
          && !insideClip(projectAnnotation(a, before.scrolls), current.clip)) throw new ReviewError('review_outside_viewport');
      }
      return anchors;
    };
    const anchors = await readAnchors();
    // markerSvg keeps each annotation inside the region it was admitted against,
    // so the sealed image must carry the same anchor clip the live overlay used,
    // including omitting a clip that hides no part of its own anchor.
    const annotations = state.annotations.map((a, i) => ({ ...projectAnnotation(a, before.scrolls),
      ...(anchors[i]?.clip && clipHidesAnchor(anchors[i].element.rect, anchors[i].clip)
        ? { clip: anchors[i].clip } : {}) }));
    const source = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const composite = await evaluate(`import(${JSON.stringify(`${origin}/review/capture.mjs`)}).then(m => m.compositePage(${JSON.stringify({
      png: source.data, annotations, viewport: v, palette: state.palette,
    })}))`);
    const after = await evaluate('globalThis.__dudeReviewInspector.readView()', executionContextId);
    if (resourceFailure || before.signature !== after.signature || !same(before.viewport, after.viewport)
      || !same(before.scrolls, after.scrolls)) throw new ReviewError('review_capture_mismatch');
    if (!same(anchors, await readAnchors())) throw new ReviewError('review_anchor_invalid');
    const image = Buffer.from(composite.image, 'base64'), sourceBytes = Buffer.from(source.data, 'base64');
    const overlay = Buffer.from(composite.overlay, 'base64');
    const { width, height } = verifyComposite(sourceBytes, overlay, image, { ...state, annotations });
    return { image, capture: {
      mode: 'fresh-viewport', browser: browser.version, colorSpace: 'srgb',
      warnings: ['This is a fresh source rendering, not a recording of native host pixels. For anchored marks, target identity, geometry, visibility, and clipping were checked against the reviewed viewport; computed styles are host observations, not cross-renderer proof.'],
      width, height, viewport: v, beforeSignature: before.signature, afterSignature: after.signature,
      ...(state.view.scrolls === undefined ? {} : { scrolls: before.scrolls }),
      sourceImageRevision: hash(sourceBytes), overlayRevision: hash(overlay),
      selectors: anchors.flatMap((a, i) => a ? [{ annotationId: state.annotations[i].id,
        selector: a.element.selector, matches: a.element.selectorMatches, elementRevision: hash(JSON.stringify(portableElement(element(a.element)))) }] : []),
    } };
  } catch (error) {
    primaryFailure = error instanceof ReviewError ? error
      : new ReviewError(signal.aborted ? 'review_capture_timeout' : 'review_capture_failed', 503);
    throw primaryFailure;
  } finally {
    try { await browser.close(); }
    catch (error) {
      if (!primaryFailure) throw error;
      throw new ReviewError(primaryFailure.code, primaryFailure.status, { ...primaryFailure.detail, cleanupUncertain: true });
    }
  }
}

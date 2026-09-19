// @ts-check
/**
 * Durable T011 browser acceptance against the published production bundle.
 *
 * The suite drives Native CDP directly and mounts the committed app.js through
 * the actual Canvas server, projection reader, Needs You provider, and Review
 * adapter. Every workspace, bd executable, browser profile, and provider is
 * owned by one test and removed afterward. Evidence is written only beneath
 * DUDE_CANVAS_ARTIFACTS_DIR (or the OS temporary directory).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { createNeedsYou } from '../../src/extensions/dude/lib/needs-you.mjs';
import { createReview } from '../../src/extensions/dude/lib/review.mjs';
import { buildReport, jsonBytes } from '../../src/extensions/dude/lib/review/data.mjs';
import { decodePng } from '../../src/extensions/dude/lib/review/png.mjs';
import { closeInstance, openInstance } from '../../src/extensions/dude/lib/canvas-server.mjs';
import {
  createInspector,
  imageIsStatic,
  validScrolls,
} from '../../src/extensions/dude/ui/review/inspector.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BROWSER = process.env.DUDE_CANVAS_BROWSER
  ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const REQUIRED = process.env.DUDE_CANVAS_BROWSER_REQUIRED === '1';
const DEADLINE = 20_000;
const PUBLISHED_APP_SHA256 = 'fcf3f9102f8eabd36f9bd0494a84695fda2891e1d53a7f05b03a1be2088a9463';

/** @param {string|Buffer} value */
function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {string|Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} root @param {string} relative @param {string|Buffer} value */
function write(root, relative, value) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

/**
 * @param {string} root
 * @param {number} number
 * @param {string} slug
 * @param {'draft'|'defined'|'resolved'} [status]
 * @param {string|null} [tasks]
 */
function createIdea(root, number, slug, status = 'draft', tasks = null) {
  const id = String(number).padStart(3, '0');
  const ideaPath = `.dude/ideas/${id}-${slug}.md`;
  const specPath = status === 'defined' ? `.dude/specs/${id}-${slug}/spec.md` : null;
  write(root, ideaPath, [
    '---',
    `title: ${slug.replaceAll('-', ' ')}`,
    `slug: ${slug}`,
    `status: ${status}`,
    `spec_path: ${specPath ?? ''}`,
    '---',
    '',
    '## Idea',
    '',
    `Intent for ${slug}, with literal source text.`,
    '',
  ].join('\n'));
  if (specPath) {
    write(root, specPath, `# ${slug}\n\nCanonical feature fixture.\n`);
    write(
      root,
      `${path.posix.dirname(specPath)}/tasks.md`,
      tasks ?? `# Tasks\n\n- [~] T001@a1111111 Current instruction for ${slug}.\n`,
    );
  }
  return {
    kind: status === 'defined' ? /** @type {'feature'} */ ('feature') : /** @type {'idea'} */ ('idea'),
    ideaPath,
    ...(specPath ? { specPath } : {}),
  };
}

/** @param {string} root @param {{ideaPath:string,specPath:string}} scope */
function createPreview(root, scope) {
  const artifactPath = `${path.posix.dirname(scope.specPath)}/design/mock.html`;
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    '<title>T011 exact review fixture</title><style>',
    'html,body{margin:0;font:16px/1.5 system-ui;background:#fff;color:#242424}',
    'main{padding:32px;min-height:1100px;box-sizing:border-box}',
    'h1{margin:0 0 24px;font-size:24px}',
    'button{font:inherit;min-height:32px}',
    '#target{padding:20px;border:2px solid #0f6cbd;width:240px;max-width:65%;margin-top:20px}',
    '#lower{margin-top:480px}',
    '</style></head><body><main><h1 id="heading">Source-aligned design</h1>',
    '<button id="action">A real layout target</button>',
    '<p id="target">Preserve the current user wording.</p>',
    '<p id="lower">Scrolled source content</p></main></body></html>',
  ].join('');
  write(root, artifactPath, html);
  write(root, scope.specPath, [
    '---',
    `preview_path: ${artifactPath}`,
    '---',
    '',
    '# Canonical design fixture',
    '',
  ].join('\n'));
  return {
    artifact: {
      path: artifactPath,
      revision: hash(fs.readFileSync(path.join(root, ...artifactPath.split('/')))),
    },
    assets: [],
  };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

/** @param {Buffer} bytes */
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/** @param {string} kind @param {Buffer} bytes */
function pngChunk(kind, bytes) {
  const type = Buffer.from(kind);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
  return Buffer.concat([length, type, bytes, checksum]);
}

/** @param {number} width @param {number} height */
function historyPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + (width * 4));
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + (x * 4);
      row[offset] = (x + y) % 256;
      row[offset + 1] = (x * 3) % 256;
      row[offset + 2] = (y * 5) % 256;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Create a sealed historical record in the adapter's production serialization.
 * Reading it back through createReview is the fixture validity gate; this adds
 * no live request handle, provider generation, or restored authority.
 * @param {string} root
 * @param {{kind:'feature',ideaPath:string,specPath:string}} scope
 * @param {{artifact:{path:string,revision:string},assets:any[]}} preview
 * @param {{submissionId:string,label:string,revision:string}} options
 */
function createSealedHistory(root, scope, preview, options) {
  const viewport = {
    width: 160, height: 120, scrollX: 0, scrollY: 0, deviceScale: 1,
    theme: 'light', documentWidth: 160, documentHeight: 120,
  };
  const annotation = {
    id: randomUUID(), tool: 'box', x1: 20, y1: 20, x2: 80, y2: 60,
    comment: `${options.label} retained report.`, replacement: '', styleNote: '', element: null,
  };
  const state = {
    annotations: [annotation],
    notes: '',
    tool: 'box',
    selectedId: null,
    caret: null,
    view: { viewport, signature: hash(`${options.label}-view`) },
    palette: {
      stroke: '#d13438', background: '#ffffff', foreground: '#242424',
      highlightFill: '#fff4ce', highlightStroke: '#c19c00',
      selection: '#0f6cbd', fontFamily: 'Segoe UI',
    },
  };
  const historicalPreview = {
    ...preview,
    artifact: { ...preview.artifact, revision: options.revision },
  };
  const working = {
    version: 1,
    submissionId: options.submissionId,
    scope,
    preview: historicalPreview,
    requestRef: `${options.label.toLowerCase()}-history-request`,
    requestRevision: `${options.label.toLowerCase()}-history-request-revision`,
    state,
  };
  const workingBytes = jsonBytes(working);
  const capture = {
    mode: 'fresh-viewport',
    browser: 'Chromium/133.0.0.0',
    colorSpace: 'srgb',
    warnings: ['Fresh source rendering.'],
    width: viewport.width,
    height: viewport.height,
    viewport,
    beforeSignature: state.view.signature,
    afterSignature: state.view.signature,
    sourceImageRevision: hash(`${options.label}-source-image`),
    overlayRevision: hash(`${options.label}-overlay`),
    selectors: [],
  };
  const revisionText = `${options.label} requested revision.`;
  const report = buildReport(working, capture, revisionText);
  const image = historyPng(capture.width, capture.height);
  const provenance = {
    version: 1,
    submissionId: options.submissionId,
    scope,
    requestRef: working.requestRef,
    requestRevision: working.requestRevision,
    preview: historicalPreview,
    workingRevision: hash(workingBytes),
    annotationRevision: hash(JSON.stringify(state.annotations)),
    reportRevision: hash(report),
    imageRevision: hash(image),
    revisionText,
    capture,
  };
  const directory = `${path.posix.dirname(scope.specPath)}/reviews/${options.submissionId}`;
  write(root, `${directory}/working.json`, workingBytes);
  write(root, `${directory}/report.md`, report);
  write(root, `${directory}/annotated.png`, image);
  write(root, `${directory}/provenance.json`, jsonBytes(provenance));
  return {
    submissionId: options.submissionId,
    label: options.label,
    preview: historicalPreview,
    report,
  };
}

/** @template T @param {()=>T|Promise<T>} probe @param {string} label @param {number} [timeout] */
async function until(probe, label, timeout = DEADLINE) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last}` : ''}`);
}

class Cdp {
  /** @param {string} url */
  constructor(url) {
    this.socket = new WebSocket(url);
    this.next = 1;
    this.pending = new Map();
    this.listeners = new Map();
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
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params, message.sessionId);
      }
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('CDP socket closed'));
      }
      this.pending.clear();
      this.listeners.clear();
    });
  }

  /**
   * @param {string} method
   * @param {Record<string,unknown>} [params]
   * @param {string} [sessionId]
   */
  send(method, params = {}, sessionId) {
    const id = this.next++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command deadline: ${method}`));
      }, 45_000);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({
      id,
      method,
      params,
      ...(sessionId ? { sessionId } : {}),
    }));
    return promise;
  }

  /**
   * @param {string} method
   * @param {(value:any, sessionId?:string)=>void} listener
   */
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => {
      const current = this.listeners.get(method);
      if (!current) return;
      const index = current.indexOf(listener);
      if (index !== -1) current.splice(index, 1);
      if (!current.length) this.listeners.delete(method);
    };
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

/** @param {ReturnType<typeof spawn>} child */
function browserHandlesClosed(child) {
  return (child.exitCode !== null || child.signalCode !== null)
    && child.stdio.every(stream => !stream || stream.closed || stream.destroyed);
}

/**
 * Reap only the browser and descendants observed beneath its exact spawned PID.
 * @param {ReturnType<typeof spawn>} child
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

/** @param {{browser:ReturnType<typeof spawn>,page?:Cdp,profile:string}} state */
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

/**
 * Run every independently owned cleanup before retaining all failures.
 * @param {Array<()=>unknown|Promise<unknown>>} steps
 */
async function runCleanupSteps(...steps) {
  const errors = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'Multiple owned test cleanups failed.');
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
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

/**
 * Read-only evaluation for diagnostics. Unlike the interaction helper above,
 * this never grants a transient user activation.
 * @param {Cdp} page
 * @param {string} expression
 * @param {{sessionId?:string,contextId?:number}} [route]
 */
async function observeRuntime(page, expression, route = {}) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    ...(route.contextId ? { contextId: route.contextId } : {}),
    awaitPromise: true,
    returnByValue: true,
  }, route.sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

/**
 * Subscribe the owned page to flattened child targets before Review entry,
 * then bind an isolated, read-only inspector to the exact mounted source
 * iframe. The tuple is revalidated for every observation.
 * @param {Cdp} page
 */
async function createReviewSourceObserver(page) {
  const attachments = new Map();
  const asynchronous = new Set();
  const setupErrors = [];
  const invalidations = [];
  const lifecycle = [];
  const removers = [];
  let binding = null;
  let closing = false;

  const remember = (type, value, sessionId = null) => {
    if (lifecycle.length < 400) lifecycle.push({
      order:lifecycle.length + 1,
      type,
      sessionId:sessionId ?? null,
      value,
    });
  };
  const schedule = work => {
    const pending = Promise.resolve().then(work).catch(error => {
      setupErrors.push(error);
    }).finally(() => asynchronous.delete(pending));
    asynchronous.add(pending);
  };
  const invalidate = (reason, detail = {}) => {
    if (!closing) invalidations.push({
      order:invalidations.length + 1,
      reason,
      detail,
    });
  };
  const waitForSetup = async () => {
    while (asynchronous.size) await Promise.allSettled([...asynchronous]);
    if (setupErrors.length === 1) throw setupErrors[0];
    if (setupErrors.length > 1) {
      throw new AggregateError(setupErrors, 'Review source target setup failed.');
    }
  };

  removers.push(page.on('Target.attachedToTarget', (event, parentSession) => {
    if (parentSession && !attachments.has(parentSession)) return;
    const record = {
      attached:true,
      attachedOrder:lifecycle.length + 1,
      parentSession:parentSession ?? null,
      sessionId:event.sessionId,
      targetId:event.targetInfo.targetId,
      targetInfo:structuredClone(event.targetInfo),
      initialized:false,
    };
    attachments.set(event.sessionId, record);
    remember('Target.attachedToTarget', {
      sessionId:event.sessionId,
      targetInfo:structuredClone(event.targetInfo),
      waitingForDebugger:event.waitingForDebugger,
    }, parentSession);
    if (event.targetInfo.type !== 'iframe') return;
    schedule(async () => {
      await page.send('Page.enable', {}, event.sessionId);
      await page.send('Runtime.enable', {}, event.sessionId);
      await page.send('Target.setAutoAttach', {
        autoAttach:true,
        flatten:true,
        waitForDebuggerOnStart:false,
      }, event.sessionId);
      record.initialized = true;
    });
  }));
  removers.push(page.on('Target.targetInfoChanged', (event, sessionId) => {
    const record = [...attachments.values()]
      .find(candidate => candidate.targetId === event.targetInfo.targetId);
    if (record) record.targetInfo = structuredClone(event.targetInfo);
    remember('Target.targetInfoChanged', structuredClone(event.targetInfo), sessionId);
    if (binding && record?.sessionId === binding.sessionId
      && event.targetInfo.url !== binding.url) {
      invalidate('target-url-changed', {
        expected:binding.url,
        actual:event.targetInfo.url,
      });
    }
  }));
  removers.push(page.on('Target.detachedFromTarget', (event, parentSession) => {
    const record = attachments.get(event.sessionId);
    if (record) record.attached = false;
    remember('Target.detachedFromTarget', structuredClone(event), parentSession);
    if (binding?.sessionId === event.sessionId) {
      invalidate('owning-session-detached', { targetId:event.targetId ?? null });
    }
  }));
  removers.push(page.on('Page.frameNavigated', (event, sessionId) => {
    remember('Page.frameNavigated', structuredClone(event.frame), sessionId);
    if (binding && sessionId === binding.sessionId && event.frame.id === binding.frameId
      && (event.frame.loaderId !== binding.loaderId || event.frame.url !== binding.url)) {
      invalidate('owning-frame-navigated', {
        expected:{ loaderId:binding.loaderId, url:binding.url },
        actual:{ loaderId:event.frame.loaderId, url:event.frame.url },
      });
    }
  }));
  removers.push(page.on('Page.frameDetached', (event, sessionId) => {
    remember('Page.frameDetached', structuredClone(event), sessionId);
    if (binding && sessionId === binding.sessionId && event.frameId === binding.frameId) {
      invalidate('owning-frame-detached', { reason:event.reason ?? null });
    }
  }));
  removers.push(page.on('Runtime.executionContextDestroyed', (event, sessionId) => {
    remember('Runtime.executionContextDestroyed', structuredClone(event), sessionId);
    if (binding && sessionId === binding.sessionId
      && event.executionContextId === binding.executionContextId) {
      invalidate('isolated-context-destroyed');
    }
  }));
  removers.push(page.on('Runtime.executionContextsCleared', (event, sessionId) => {
    remember('Runtime.executionContextsCleared', structuredClone(event), sessionId);
    if (binding && sessionId === binding.sessionId) {
      invalidate('owning-contexts-cleared');
    }
  }));

  await page.send('Target.setAutoAttach', {
    autoAttach:true,
    flatten:true,
    waitForDebuggerOnStart:false,
  });

  const resolveOwner = async () => {
    await page.send('DOM.enable');
    const { root } = await page.send('DOM.getDocument', { depth:1 });
    const { nodeId } = await page.send('DOM.querySelector', {
      nodeId:root.nodeId,
      selector:'.dude-review-frame iframe',
    });
    if (!nodeId) return null;
    const [{ node }, owner] = await Promise.all([
      page.send('DOM.describeNode', { nodeId }),
      observeRuntime(page, `(() => {
        const iframe = document.querySelector('.dude-review-frame iframe');
        if (!iframe) return null;
        return {
          src:iframe.src,
          attributeSrc:iframe.getAttribute('src'),
          title:iframe.title,
        };
      })()`),
    ]);
    if (!node.frameId || !owner?.src) return null;
    const attributes = Object.fromEntries(Array.from(
      { length:(node.attributes?.length ?? 0) / 2 },
      (_, index) => [
        node.attributes[index * 2],
        node.attributes[index * 2 + 1],
      ],
    ));
    return {
      frameId:node.frameId,
      nodeId,
      backendNodeId:node.backendNodeId,
      resolvedSrc:owner.src,
      attributeSrc:owner.attributeSrc,
      describedSrc:attributes.src ?? null,
      title:owner.title,
    };
  };
  const frameFromTree = (tree, frameId) => {
    if (tree.frame.id === frameId) return tree.frame;
    for (const child of tree.childFrames ?? []) {
      const frame = frameFromTree(child, frameId);
      if (frame) return frame;
    }
    return null;
  };
  const validateBinding = async () => {
    await waitForSetup();
    if (!binding) throw new Error('Review source observer is not bound.');
    if (invalidations.length) {
      throw new Error(`Review source observer was invalidated: ${
        JSON.stringify(invalidations.at(-1))}`);
    }
    const owner = await resolveOwner();
    const record = attachments.get(binding.sessionId);
    if (!owner || !record?.attached
      || owner.frameId !== binding.frameId
      || owner.resolvedSrc !== binding.url
      || record.targetId !== binding.targetId
      || record.targetInfo.url !== binding.url) {
      throw new Error(`Review source owner/session binding changed: ${JSON.stringify({
        owner,
        attached:record?.attached ?? null,
        targetId:record?.targetId ?? null,
        targetUrl:record?.targetInfo.url ?? null,
        binding,
      })}`);
    }
    const { frameTree } = await page.send('Page.getFrameTree', {}, binding.sessionId);
    const frame = frameFromTree(frameTree, binding.frameId);
    if (!frame || frame.loaderId !== binding.loaderId || frame.url !== binding.url) {
      throw new Error(`Review source frame tuple changed: ${JSON.stringify({
        expected:{ frameId:binding.frameId, loaderId:binding.loaderId, url:binding.url },
        actual:frame,
      })}`);
    }
    const href = await observeRuntime(page, 'location.href', {
      sessionId:binding.sessionId,
      contextId:binding.executionContextId,
    });
    if (href !== binding.url) {
      throw new Error(`Review source isolated context changed URL: ${href}`);
    }
    return { owner, frame, href };
  };

  return {
    async bind() {
      if (binding) return structuredClone(binding);
      const viewed = await until(async () => {
        await waitForSetup();
        const owner = await resolveOwner();
        if (!owner) return null;
        const candidates = [];
        for (const record of attachments.values()) {
          if (!record.attached || !record.initialized
            || record.targetInfo.type !== 'iframe') continue;
          const { frameTree } = await page.send('Page.getFrameTree', {}, record.sessionId);
          const frame = frameFromTree(frameTree, owner.frameId);
          if (frame && frame.loaderId && frame.url === owner.resolvedSrc
            && record.targetInfo.url === owner.resolvedSrc) {
            candidates.push({ owner, record, frame });
          }
        }
        return candidates.length === 1 ? candidates[0] : null;
      }, 'one exact attached Review source target');
      const { executionContextId } = await page.send('Page.createIsolatedWorld', {
        frameId:viewed.frame.id,
        worldName:`dude-t012-observer-${randomUUID()}`,
        grantUniveralAccess:false,
      }, viewed.record.sessionId);
      if (!Number.isInteger(executionContextId)) {
        throw new Error('Review source isolated world has no execution context id.');
      }
      binding = {
        targetId:viewed.record.targetId,
        sessionId:viewed.record.sessionId,
        frameId:viewed.frame.id,
        loaderId:viewed.frame.loaderId,
        executionContextId,
        url:viewed.owner.resolvedSrc,
        ownerBackendNodeId:viewed.owner.backendNodeId,
      };
      await observeRuntime(page, `(() => {
        window.__t012ReviewObserver?.cleanup?.();
        const describe = node => {
          if (node === window) return 'window';
          if (node === document) return 'document';
          if (!(node instanceof Element)) return String(node);
          const parts = [node.localName];
          if (node.id) parts.push('#' + node.id);
          if (node.classList.contains('dude-review-overlay')) {
            parts.push('.dude-review-overlay');
          }
          if (node.hasAttribute('data-review-engine-host')) {
            parts.push('[data-review-engine-host]');
          }
          if (node.hasAttribute('data-review-workspace')) {
            parts.push('[data-review-workspace]');
          }
          const label = node.getAttribute('aria-label');
          if (label) parts.push('[aria-label="' + label + '"]');
          return parts.join('');
        };
        const time = () => performance.timeOrigin + performance.now();
        const probe = {
          wheel:[],
          mousemove:[],
          scroll:[],
          replies:[],
        };
        const wheel = event => {
          if (probe.wheel.length >= 80) return;
          const path = event.composedPath();
          const record = {
            order:probe.wheel.length + 1,
            time:time(),
            isTrusted:event.isTrusted,
            clientX:event.clientX,
            clientY:event.clientY,
            deltaX:event.deltaX,
            deltaY:event.deltaY,
            deltaMode:event.deltaMode,
            target:describe(event.target),
            hit:describe(document.elementFromPoint(event.clientX, event.clientY)),
            targetClasses:event.target instanceof Element
              ? [...event.target.classList] : [],
            path:path.map(describe),
            pathClasses:path.map(node => (
              node instanceof Element ? [...node.classList] : []
            )),
            focus:describe(document.activeElement),
            defaultPreventedAtCapture:event.defaultPrevented,
            defaultPreventedAfterDispatch:null,
          };
          probe.wheel.push(record);
          queueMicrotask(() => {
            record.defaultPreventedAfterDispatch = event.defaultPrevented;
          });
        };
        const mousemove = event => {
          if (probe.mousemove.length >= 120) return;
          const path = event.composedPath();
          probe.mousemove.push({
            order:probe.mousemove.length + 1,
            time:time(),
            isTrusted:event.isTrusted,
            clientX:event.clientX,
            clientY:event.clientY,
            target:describe(event.target),
            hit:describe(document.elementFromPoint(event.clientX, event.clientY)),
            targetClasses:event.target instanceof Element
              ? [...event.target.classList] : [],
            path:path.map(describe),
            pathClasses:path.map(node => (
              node instanceof Element ? [...node.classList] : []
            )),
            focus:describe(document.activeElement),
          });
        };
        const scroll = event => {
          if (probe.scroll.length >= 120) return;
          probe.scroll.push({
            order:probe.scroll.length + 1,
            time:time(),
            isTrusted:event.isTrusted,
            target:describe(event.target),
            scrollX,
            scrollY,
          });
        };
        const reply = event => {
          const iframe = document.querySelector('.dude-review-frame iframe');
          const data = event.data;
          if (!iframe || event.source !== iframe.contentWindow || event.origin !== 'null'
            || !data || probe.replies.length >= 300) return;
          const result = data.result;
          probe.replies.push({
            order:probe.replies.length + 1,
            time:time(),
            type:data.type,
            channel:typeof data.channel === 'string' ? data.channel : null,
            id:Number.isSafeInteger(data.id) ? data.id : null,
            keys:Object.keys(data).sort(),
            error:typeof data.error === 'string' ? data.error : null,
            viewport:result?.viewport ? structuredClone(result.viewport) : null,
            signature:typeof result?.signature === 'string' ? result.signature : null,
            scrolls:Array.isArray(result?.scrolls) ? structuredClone(result.scrolls) : null,
            targets:Array.isArray(result?.targets)
              ? result.targets.map(target => ({
                selector:target.selector,
                label:target.label,
              })) : null,
            element:result?.element ? {
              selector:result.element.selector,
              text:result.element.text,
              rect:structuredClone(result.element.rect),
              visible:result.visible,
              clip:structuredClone(result.clip),
            } : null,
          });
        };
        document.addEventListener('wheel', wheel, {capture:true, passive:true});
        document.addEventListener('mousemove', mousemove, {capture:true, passive:true});
        document.addEventListener('scroll', scroll, {capture:true, passive:true});
        window.addEventListener('message', reply, {capture:true, passive:true});
        window.__t012ReviewObserver = {
          probe,
          cleanup() {
            document.removeEventListener('wheel', wheel, true);
            document.removeEventListener('mousemove', mousemove, true);
            document.removeEventListener('scroll', scroll, true);
            window.removeEventListener('message', reply, true);
            delete window.__t012ReviewObserver;
          },
        };
        return true;
      })()`);
      await observeRuntime(page, `(() => {
        globalThis.__t012SourceObserver?.cleanup?.();
        const inspector = (${createInspector.toString()})(
          document,
          window,
          (${imageIsStatic.toString()}),
          (${validScrolls.toString()})
        );
        const describe = node => {
          if (node === window) return 'window';
          if (node === document) return 'document';
          if (!(node instanceof Element)) return String(node);
          const label = node.getAttribute('aria-label');
          return node.localName + (node.id ? '#' + node.id : '')
            + (label ? '[aria-label="' + label + '"]' : '');
        };
        const time = () => performance.timeOrigin + performance.now();
        const probe = {
          wheel:[],
          mousemove:[],
          scroll:[],
          queries:[],
          frameCount:0,
          lastFrameTime:null,
        };
        let frameRequest = null;
        const frame = timestamp => {
          probe.frameCount += 1;
          probe.lastFrameTime = timestamp;
          frameRequest = requestAnimationFrame(frame);
        };
        frameRequest = requestAnimationFrame(frame);
        const wheel = event => {
          if (probe.wheel.length >= 80) return;
          const record = {
            order:probe.wheel.length + 1,
            time:time(),
            isTrusted:event.isTrusted,
            clientX:event.clientX,
            clientY:event.clientY,
            deltaX:event.deltaX,
            deltaY:event.deltaY,
            deltaMode:event.deltaMode,
            target:describe(event.target),
            hit:describe(document.elementFromPoint(event.clientX, event.clientY)),
            path:event.composedPath().map(describe),
            focus:describe(document.activeElement),
            defaultPreventedAtCapture:event.defaultPrevented,
            defaultPreventedAfterDispatch:null,
          };
          probe.wheel.push(record);
          queueMicrotask(() => {
            record.defaultPreventedAfterDispatch = event.defaultPrevented;
          });
        };
        const mousemove = event => {
          if (probe.mousemove.length >= 120) return;
          probe.mousemove.push({
            order:probe.mousemove.length + 1,
            time:time(),
            isTrusted:event.isTrusted,
            clientX:event.clientX,
            clientY:event.clientY,
            target:describe(event.target),
            hit:describe(document.elementFromPoint(event.clientX, event.clientY)),
            path:event.composedPath().map(describe),
            focus:describe(document.activeElement),
          });
        };
        const scroll = event => {
          if (probe.scroll.length >= 120) return;
          probe.scroll.push({
            order:probe.scroll.length + 1,
            time:time(),
            isTrusted:event.isTrusted,
            target:describe(event.target),
            scrollX,
            scrollY,
          });
        };
        const query = event => {
          const data = event.data;
          if (event.source !== parent || event.origin === 'null' || !data
            || data.type !== 'dude-review-query' || probe.queries.length >= 300) return;
          probe.queries.push({
            order:probe.queries.length + 1,
            time:time(),
            type:data.type,
            channel:typeof data.channel === 'string' ? data.channel : null,
            id:Number.isSafeInteger(data.id) ? data.id : null,
            op:typeof data.op === 'string' ? data.op : null,
            keys:Object.keys(data).sort(),
            point:data.point ? structuredClone(data.point) : null,
            delta:data.delta ? structuredClone(data.delta) : null,
            selector:typeof data.selector === 'string' ? data.selector : null,
            key:typeof data.key === 'string' ? data.key : null,
            x:Number.isFinite(data.x) ? data.x : null,
            y:Number.isFinite(data.y) ? data.y : null,
          });
        };
        document.addEventListener('wheel', wheel, {capture:true, passive:true});
        document.addEventListener('mousemove', mousemove, {capture:true, passive:true});
        document.addEventListener('scroll', scroll, {capture:true, passive:true});
        window.addEventListener('message', query, {capture:true, passive:true});
        globalThis.__t012SourceObserver = {
          inspector,
          probe,
          cleanup() {
            cancelAnimationFrame(frameRequest);
            document.removeEventListener('wheel', wheel, true);
            document.removeEventListener('mousemove', mousemove, true);
            document.removeEventListener('scroll', scroll, true);
            window.removeEventListener('message', query, true);
            delete globalThis.__t012SourceObserver;
          },
        };
        return true;
      })()`, {
        sessionId:binding.sessionId,
        contextId:binding.executionContextId,
      });
      await validateBinding();
      return structuredClone(binding);
    },
    async snapshot(checkpoint) {
      const validated = await validateBinding();
      const route = {
        sessionId:binding.sessionId,
        contextId:binding.executionContextId,
      };
      const [owner, source] = await Promise.all([
        observeRuntime(page, `(() => {
          const iframe = document.querySelector('.dude-review-frame iframe');
          const frame = iframe?.closest('.dude-review-frame');
          const overlay = document.querySelector('.dude-review-overlay');
          const host = document.querySelector('[data-review-engine-host]');
          const rect = node => node?.getBoundingClientRect().toJSON() || null;
          const focus = document.activeElement;
          return {
            probe:structuredClone(window.__t012ReviewObserver?.probe || null),
            iframe:{
              src:iframe?.src || null,
              attributeSrc:iframe?.getAttribute('src') || null,
              rect:rect(iframe),
              frameRect:rect(frame),
              overlayRect:rect(overlay),
              hostRect:rect(host),
              pinned:frame?.classList.contains('dude-review-frame-pinned') || false,
              clientWidth:frame?.clientWidth ?? null,
              clientHeight:frame?.clientHeight ?? null,
            },
            focus:{
              tag:focus?.tagName || null,
              id:focus?.id || null,
              role:focus?.getAttribute?.('role') || null,
              ariaLabel:focus?.getAttribute?.('aria-label') || null,
              text:focus?.innerText?.trim().slice(0, 120) || null,
            },
            boxDisabled:document.querySelector('[aria-label="Box (B)"]')?.disabled ?? null,
          };
        })()`),
        observeRuntime(page, `(async () => {
          const observed = globalThis.__t012SourceObserver;
          if (!observed) throw new Error('Source observer is unavailable.');
          const view = await observed.inspector.readView();
          const heading = observed.inspector.describeSelector('#heading');
          const focus = document.activeElement;
          return {
            href:location.href,
            readyState:document.readyState,
            probe:structuredClone(observed.probe),
            view,
            heading,
            focus:{
              tag:focus?.tagName || null,
              id:focus?.id || null,
              role:focus?.getAttribute?.('role') || null,
              ariaLabel:focus?.getAttribute?.('aria-label') || null,
              text:focus?.innerText?.trim().slice(0, 120) || null,
            },
          };
        })()`, route),
      ]);
      return {
        checkpoint,
        capturedAt:new Date().toISOString(),
        identity:{ ...structuredClone(binding), validated },
        owner,
        source,
      };
    },
    async close() {
      if (closing) return { alreadyClosed:true };
      closing = true;
      const errors = [];
      const sessions = [...attachments.values()].filter(record => record.attached);
      if (binding) {
        try {
          await observeRuntime(page, 'window.__t012ReviewObserver?.cleanup?.(); true');
        } catch (error) { errors.push(error); }
        try {
          await observeRuntime(page, 'globalThis.__t012SourceObserver?.cleanup?.(); true', {
            sessionId:binding.sessionId,
            contextId:binding.executionContextId,
          });
        } catch (error) { errors.push(error); }
      }
      for (const record of sessions.slice().reverse()) {
        if (record.targetInfo.type !== 'iframe') continue;
        try {
          await page.send('Target.setAutoAttach', {
            autoAttach:false,
            flatten:true,
            waitForDebuggerOnStart:false,
          }, record.sessionId);
        } catch (error) { errors.push(error); }
      }
      try {
        await page.send('Target.setAutoAttach', {
          autoAttach:false,
          flatten:true,
          waitForDebuggerOnStart:false,
        });
      } catch (error) { errors.push(error); }
      // Disabling root auto-attachment detaches its flattened children on this
      // Edge version. Keep the event listeners through that command so only a
      // session still reported attached needs an explicit detach.
      for (const record of sessions.filter(candidate => candidate.attached).reverse()) {
        try {
          await page.send('Target.detachFromTarget', {
            sessionId:record.sessionId,
          }, record.parentSession ?? undefined);
          record.attached = false;
        } catch (error) { errors.push(error); }
      }
      for (const remove of removers.splice(0)) remove();
      const summary = {
        binding:binding ? structuredClone(binding) : null,
        attachedSessions:sessions.map(record => ({
          targetId:record.targetId,
          sessionId:record.sessionId,
          type:record.targetInfo.type,
          detached:!record.attached,
        })),
        invalidations:structuredClone(invalidations),
        lifecycle:structuredClone(lifecycle),
        errors:errors.map(error => error.message),
      };
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Review source observer cleanup failed.');
      }
      return summary;
    },
  };
}

/** @param {Awaited<ReturnType<typeof createReviewSourceObserver>>} observer */
async function qualifyReviewSourceObserver(observer) {
  const before = await observer.snapshot('qualification-before');
  const after = await until(async () => {
    const value = await observer.snapshot('qualification-after');
    return value.source.probe.frameCount > before.source.probe.frameCount
      ? value : null;
  }, 'progressing stable Review source observer');
  const stable = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const parentEvents = ['wheel', 'mousemove', 'scroll'];
  const sourceEvents = ['wheel', 'mousemove', 'scroll'];
  const checks = {
    identity:stable(before.identity.targetId, after.identity.targetId)
      && stable(before.identity.sessionId, after.identity.sessionId)
      && stable(before.identity.frameId, after.identity.frameId)
      && stable(before.identity.loaderId, after.identity.loaderId)
      && stable(before.identity.executionContextId, after.identity.executionContextId)
      && stable(before.identity.url, after.identity.url),
    exactSource:before.owner.iframe.src === before.identity.url
      && after.owner.iframe.src === after.identity.url
      && before.source.href === before.identity.url
      && after.source.href === after.identity.url,
    progress:after.source.probe.frameCount > before.source.probe.frameCount
      && after.source.probe.lastFrameTime > before.source.probe.lastFrameTime,
    sourceView:stable(before.source.view, after.source.view),
    heading:stable(before.source.heading, after.source.heading),
    sourceFocus:stable(before.source.focus, after.source.focus),
    parentFocus:stable(before.owner.focus, after.owner.focus),
    geometry:stable(before.owner.iframe, after.owner.iframe),
    noParentInput:parentEvents.every(name => (
      before.owner.probe[name].length === after.owner.probe[name].length
    )),
    noSourceInput:sourceEvents.every(name => (
      before.source.probe[name].length === after.source.probe[name].length
    )),
  };
  return {
    before,
    after,
    checks,
    passed:Object.values(checks).every(Boolean),
  };
}

/** Pair source-observed bridge requests with exact-iframe parent replies. */
function reviewBridgeSnapshot(observation) {
  const queries = observation.source.probe.queries;
  const replies = observation.owner.probe.replies;
  const correlations = [];
  for (const query of queries) {
    const reply = replies.find(candidate => (
      candidate.channel === query.channel && candidate.id === query.id
    ));
    if (reply) correlations.push({ query, reply });
  }
  const views = correlations.filter(({ reply }) => (
    reply.type === 'dude-review-result'
      && !reply.error
      && reply.viewport
      && Array.isArray(reply.targets)
  ));
  return {
    queries:queries.length,
    replies:replies.length,
    correlations,
    latestView:views.at(-1) ?? null,
  };
}

/** @param {Cdp} page */
async function shortPanelWheelPoints(page) {
  return observeRuntime(page, `(() => {
    const describe = node => ({
      tag:node?.tagName || null,
      id:node?.id || null,
      ariaLabel:node?.getAttribute?.('aria-label') || null,
      reviewOverlay:Boolean(node?.closest?.('.dude-review-overlay')),
      reviewEngineHost:Boolean(node?.closest?.('[data-review-engine-host]')),
      reviewWorkspace:Boolean(node?.closest?.('[data-review-workspace]')),
    });
    const host = document.querySelector('[data-review-engine-host]');
    const outsideRect = host?.parentElement?.parentElement?.getBoundingClientRect();
    const overlay = document.querySelector('.dude-review-overlay');
    const overlayRect = overlay?.getBoundingClientRect();
    if (!outsideRect || !overlayRect) return null;
    const outside = {
      x:outsideRect.left + outsideRect.width / 2,
      y:outsideRect.top + 20,
    };
    const candidates = [
      [.5,.5],[.75,.5],[.25,.5],[.75,.75],[.25,.75],
    ].map(([x, y]) => ({
      x:overlayRect.left + overlayRect.width * x,
      y:overlayRect.top + overlayRect.height * y,
    }));
    const overlayPoint = candidates.find(point => (
      document.elementFromPoint(point.x, point.y)?.closest?.('.dude-review-overlay')
    )) || null;
    return {
      outside:{
        ...outside,
        hit:describe(document.elementFromPoint(outside.x, outside.y)),
      },
      overlay:overlayPoint ? {
        ...overlayPoint,
        hit:describe(document.elementFromPoint(overlayPoint.x, overlayPoint.y)),
      } : null,
      outsideRect:outsideRect.toJSON(),
      overlayRect:overlayRect.toJSON(),
    };
  })()`);
}

/**
 * Dispatch one controlled native wheel and retain both requested delivery and
 * the actual parent/source event paths.
 * @param {Cdp} page
 * @param {Awaited<ReturnType<typeof createReviewSourceObserver>>} observer
 * @param {'standalone'|'positioned'|'overlay-negative'} variant
 */
async function dispatchObservedReviewWheel(page, observer, variant) {
  const points = await shortPanelWheelPoints(page);
  const point = variant === 'overlay-negative' ? points?.overlay : points?.outside;
  const pre = await observer.snapshot('pre-wheel');
  const marker = {
    parentWheel:pre.owner.probe.wheel.length,
    parentMousemove:pre.owner.probe.mousemove.length,
    sourceWheel:pre.source.probe.wheel.length,
    sourceMousemove:pre.source.probe.mousemove.length,
    sourceScroll:pre.source.probe.scroll.length,
    sourceQuery:pre.source.probe.queries.length,
    parentReply:pre.owner.probe.replies.length,
  };
  const synthesized = variant !== 'standalone';
  const request = {
    order:1,
    requestedAt:new Date().toISOString(),
    type:synthesized ? 'synthesizeScrollGesture' : 'mouseWheel',
    x:point.x,
    y:point.y,
    deltaX:0,
    deltaY:360,
    ...(synthesized ? {
      yDistance:-360,
      gestureSourceType:'mouse',
      preventFling:true,
    } : {}),
    variant,
  };
  if (synthesized) {
    await page.send('Input.synthesizeScrollGesture', {
      x:point.x,
      y:point.y,
      yDistance:-360,
      gestureSourceType:'mouse',
      preventFling:true,
    });
  } else {
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseWheel',
      x:point.x,
      y:point.y,
      deltaX:0,
      deltaY:360,
    });
  }
  let priorKey = null;
  let stableTurns = 0;
  const post = await until(async () => {
    const value = await observer.snapshot('post-wheel');
    const parentDelivered = value.owner.probe.wheel.length > marker.parentWheel;
    const sourceDelivered = value.source.probe.wheel.length > marker.sourceWheel;
    if (!parentDelivered && !sourceDelivered || value.owner.boxDisabled) return null;
    const bridge = reviewBridgeSnapshot(value);
    const key = JSON.stringify({
      signature:value.source.view.signature,
      scrollX:value.source.view.viewport.scrollX,
      scrollY:value.source.view.viewport.scrollY,
      latestBridgeId:bridge.latestView?.reply.id ?? null,
      latestBridgeScrollY:bridge.latestView?.reply.viewport.scrollY ?? null,
    });
    stableTurns = key === priorKey ? stableTurns + 1 : 0;
    priorKey = key;
    const changed = value.source.view.viewport.scrollY
      !== pre.source.view.viewport.scrollY;
    const bridgeCaughtUp = !changed || (
      bridge.latestView
      && bridge.latestView.reply.viewport.scrollY
        === value.source.view.viewport.scrollY
    );
    return stableTurns >= 1 && bridgeCaughtUp ? value : null;
  }, `${variant} native wheel delivery and settled source`);
  const parentEvents = post.owner.probe.wheel.slice(marker.parentWheel);
  const sourceEvents = post.source.probe.wheel.slice(marker.sourceWheel);
  const receivedByOverlay = event => event.pathClasses.some(classes => (
    classes.includes('dude-review-overlay')
  ));
  const receiver = {
    parentEvents,
    sourceEvents,
    sourceScrollEvents:post.source.probe.scroll.slice(marker.sourceScroll),
    paths:[
      ...parentEvents.map(event => ({ world:'parent', path:event.path })),
      ...sourceEvents.map(event => ({ world:'source', path:event.path })),
    ],
    overlay:parentEvents.some(receivedByOverlay),
    outsideOverlay:parentEvents.some(event => !receivedByOverlay(event)),
    source:Boolean(sourceEvents.length),
  };
  return {
    variant,
    points,
    request,
    marker,
    pre,
    post,
    bridge:reviewBridgeSnapshot(post),
    receiver,
  };
}

/** Inspect only the listbox linked by the Review element combobox. */
function reviewChooserSnapshot(page) {
  return observeRuntime(page, `(() => {
    const label = [...document.querySelectorAll('label')]
      .find(node => node.textContent.trim() === 'Choose an element');
    const chooser = label && document.getElementById(label.htmlFor);
    const controls = (chooser?.getAttribute('aria-controls') || '')
      .split(/\\s+/).filter(Boolean);
    const linked = controls.map(id => document.getElementById(id))
      .filter(node => node?.getAttribute('role') === 'listbox');
    const listbox = linked.find(node => node.getClientRects().length)
      || linked[0]
      || null;
    const options = listbox ? [...listbox.querySelectorAll('[role="option"]')]
      .map(node => ({
        id:node.id || null,
        label:node.textContent.trim(),
        value:node.getAttribute('value')
          || node.getAttribute('data-fui-option-value')
          || null,
        visible:Boolean(node.getClientRects().length),
        selected:node.getAttribute('aria-selected'),
      })) : [];
    const focus = document.activeElement;
    return {
      labelFor:label?.htmlFor || null,
      chooserId:chooser?.id || null,
      ariaControls:controls,
      ariaExpanded:chooser?.getAttribute('aria-expanded') || null,
      ariaActiveDescendant:chooser?.getAttribute('aria-activedescendant') || null,
      linkedListboxCount:linked.length,
      linkedListboxId:listbox?.id || null,
      linkedListboxVisible:Boolean(listbox?.getClientRects().length),
      labels:options.filter(option => option.visible).map(option => option.label),
      options,
      focus:focus === chooser ? 'chooser'
        : focus?.getAttribute?.('role')
          || focus?.getAttribute?.('aria-label')
          || focus?.tagName
          || null,
    };
  })()`);
}

/**
 * Open the actual Review picker, inspect its aria-controls-linked listbox, and
 * close it without selecting or issuing a product bridge command.
 * @param {Cdp} page
 */
async function observeReviewChooser(page) {
  await clickAtCurrentPosition(page, button('Notes and more'));
  await until(() => observeRuntime(page, `Boolean(document.querySelector(
    '.fui-PopoverSurface[aria-label="Notes and more"]'
  )?.getClientRects().length)`), 'observed Notes and more surface');
  const focusPath = [];
  for (let step = 0; step < 80; step += 1) {
    if (await observeRuntime(page, `document.activeElement === (${field('Choose an element')})`)) {
      break;
    }
    await pressNavigationKey(page, 'Tab');
    focusPath.push(await observeRuntime(page, `document.activeElement?.getAttribute('aria-label')
      || document.activeElement?.getAttribute('role')
      || document.activeElement?.innerText?.trim()
      || document.activeElement?.tagName`));
  }
  const before = await reviewChooserSnapshot(page);
  await press(page, 'Enter');
  const opened = await until(async () => {
    const value = await reviewChooserSnapshot(page);
    return value.ariaExpanded === 'true'
      && value.linkedListboxCount === 1
      && value.linkedListboxVisible
      ? value : null;
  }, 'aria-controls-linked Review element listbox');
  await press(page, 'Escape');
  await until(async () => {
    const value = await reviewChooserSnapshot(page);
    return value.ariaExpanded !== 'true' ? value : null;
  }, 'closed Review element listbox');
  await press(page, 'Escape');
  await until(() => observeRuntime(page, `!document.querySelector(
    '.fui-PopoverSurface[aria-label="Notes and more"]'
  )?.getClientRects().length
    && document.activeElement === (${button('Notes and more')})`),
  'closed observed Notes and more surface with focus returned to its trigger');
  return {
    focusPath,
    before,
    opened,
    after:{
      focus:await observeRuntime(page, `document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim()
        || document.activeElement?.tagName
        || null`),
    },
  };
}

/**
 * A fresh-fixture control uses the same production bundle, source bytes,
 * geometry, observer, and picker instrumentation as the retained positive.
 * @param {'standalone'|'overlay-negative'} variant
 * @param {Record<string,any>} record
 */
async function runShortPanelWheelControl(variant, record) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `dude-canvas-t012-${variant}-`));
  let fixture;
  let publication;
  let browserState;
  let observer;
  const runtimeErrors = [];
  record.variant = variant;
  record.root = root;
  record.stage = 'fixture';
  try {
    const feature = createIdea(
      root,
      900,
      'floating-toolbar-regression',
      'defined',
      '# Tasks\n\n- [x] T001@aaaaaaaa Closed fixture remains review-eligible.\n',
    );
    const preview = createPreview(root, /** @type {any} */ (feature));
    record.sourceRevision = preview.artifact.revision;
    fixture = await createFixture(root);
    const scope = {
      kind:'feature',
      ideaPath:feature.ideaPath,
      specPath:feature.specPath,
    };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Review the synthetic floating-toolbar workspace mock.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(2);
    record.browser = browserState.version.Browser ?? browserState.version;
    record.browserPid = browserState.browser.pid;
    record.profile = browserState.profile;
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    await viewport(page, 1000, 'light', 900, 2);
    await page.send('Page.navigate', { url:fixture.instance.url });
    await visible(page, 'Connected');
    await choose(page, 'Show', 'Closed');
    await visible(page, '1 of 1 recorded ideas and features');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Defined feature');
    observer = await createReviewSourceObserver(page);
    record.stage = 'subscribed-before-review';
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`),
    `${variant} focused Review engine`, 60_000);
    record.binding = await observer.bind();
    await viewport(page, 1000, 'light', 300, 2);
    record.shortPanel = await until(() => observeRuntime(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      return frame.clientWidth === 942
        && frame.clientHeight === 118
        && rect.width === 942
        && rect.height === 117.5
        && !frame.classList.contains('dude-review-frame-pinned')
        && document.querySelector('.dude-review-overlay')?.getAttribute('viewBox')
          === '0 0 942 118'
        && !document.querySelector('[aria-label="Box (B)"]').disabled
        ? {
          viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
          frame:{
            clientWidth:frame.clientWidth,
            clientHeight:frame.clientHeight,
            rect:rect.toJSON(),
          },
          viewBox:document.querySelector('.dude-review-overlay').getAttribute('viewBox'),
        } : null;
    })()`), `${variant} exact unpinned short panel`);
    record.qualification = await qualifyReviewSourceObserver(observer);
    record.stage = record.qualification.passed ? 'qualified' : 'qualification-failed';
    if (!record.qualification.passed) return record;
    record.wheel = await dispatchObservedReviewWheel(page, observer, variant);
    record.stage = 'wheel-observed';
    record.chooser = await observeReviewChooser(page);
    record.runtimeErrors = structuredClone(runtimeErrors);
    record.stage = 'complete';
    return record;
  } finally {
    const cleanupErrors = [];
    const observerSummary = await Promise.resolve()
      .then(() => observer?.close())
      .catch(error => { cleanupErrors.push(error); return null; });
    if (publication) {
      publication.controller.abort();
      await publication.result.catch(() => {});
    }
    if (browserState) {
      await cleanupBrowserDriver(browserState).catch(error => cleanupErrors.push(error));
    }
    if (fixture) {
      await fixture.close().catch(error => cleanupErrors.push(error));
    } else {
      try { fs.rmSync(root, { recursive:true, force:true }); }
      catch (error) { cleanupErrors.push(error); }
    }
    record.cleanup = {
      observer:observerSummary,
      rootExists:fs.existsSync(root),
      profileExists:browserState ? fs.existsSync(browserState.profile) : null,
      browserAlive:browserState?.browser.pid
        ? browserPidAlive(browserState.browser.pid)
        : null,
      errors:cleanupErrors.map(error => error.message),
    };
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, `${variant} control cleanup failed.`);
    }
  }
}

async function startBrowser(deviceScaleFactor = 1, stabilizeHeadlessTimeline = false) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-profile-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--disable-backgrounding-occluded-windows',
    ...(stabilizeHeadlessTimeline ? [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--force-device-scale-factor=${deviceScaleFactor}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let launchError;
  let page;
  browser.stderr.on('data', (value) => { stderr += value; });
  browser.once('error', (error) => { launchError = error; });
  try {
    const port = await until(() => {
      if (launchError) return launchError;
      if (browser.exitCode !== null || browser.signalCode !== null) {
        return new Error(`browser exited before CDP startup: ${stderr}`);
      }
      const active = path.join(profile, 'DevToolsActivePort');
      if (!fs.existsSync(active)) return null;
      const first = fs.readFileSync(active, 'utf8').split(/\r?\n/)[0];
      return /^\d+$/.test(first) ? Number(first) : null;
    }, 'owned browser startup');
    if (port instanceof Error) throw port;
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const target = stabilizeHeadlessTimeline
      ? (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json())
        .find(candidate => candidate.type === 'page')
      : await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    if (!target?.webSocketDebuggerUrl) throw new Error('owned browser has no debuggable page target');
    page = new Cdp(target.webSocketDebuggerUrl);
    await page.open();
    await Promise.all([
      page.send('Page.enable'),
      page.send('Runtime.enable'),
      page.send('Network.enable'),
      page.send('Accessibility.enable'),
    ]);
    if (stabilizeHeadlessTimeline) {
      await page.send('Page.bringToFront');
      await page.send('Emulation.setFocusEmulationEnabled', {enabled:true});
    }
    return { browser, page, profile, version };
  } catch (error) {
    error.message += ` (owned launch pid=${browser.pid}, exit=${browser.exitCode}, signal=${browser.signalCode}, stderr=${stderr})`;
    try {
      await cleanupBrowserDriver({ browser, page, profile });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Owned browser launch and cleanup both failed.');
    }
    throw error;
  }
}

function installEmptyBoard() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-bd-'));
  const executable = path.join(directory, process.platform === 'win32' ? 'bd.cmd' : 'bd');
  if (process.platform === 'win32') {
    fs.writeFileSync(executable, `@${JSON.stringify(process.execPath)} -e "process.stdout.write('[]')" %*\r\n`);
  } else {
    fs.writeFileSync(executable, '#!/usr/bin/env node\nprocess.stdout.write("[]");\n', { mode: 0o755 });
  }
  const originalPath = process.env.PATH;
  process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ''}`;
  return {
    close() {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function installFailingCaptureBrowser() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-capture-browser-'));
  const bin = path.join(root, 'bin');
  const receipt = path.join(root, 'receipt.json');
  fs.mkdirSync(bin);
  const executable = path.join(bin, 'microsoft-edge');
  fs.writeFileSync(executable, [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    `const receipt = ${JSON.stringify(receipt)};`,
    'let count = 0;',
    'try { count = JSON.parse(fs.readFileSync(receipt, "utf8")).count; } catch {}',
    "const profile = process.argv.find((value) => value.startsWith('--user-data-dir='))?.slice(16) ?? null;",
    'fs.writeFileSync(receipt, JSON.stringify({ count: count + 1, pid: process.pid, profile }));',
    'process.exit(23);',
    '',
  ].join('\n'), { mode: 0o755 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
  return {
    executable,
    read() {
      return JSON.parse(fs.readFileSync(receipt, 'utf8'));
    },
    close() {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * @param {string} root
 * @param {string|null} [target]
 * @param {((adapter:ReturnType<typeof createReview>)=>any)|null} [wrapReview]
 */
async function createFixture(root, target = null, wrapReview = null) {
  fs.mkdirSync(root, { recursive: true });
  const baseAdapter = createReview({ root });
  const adapter = wrapReview ? wrapReview(baseAdapter) : baseAdapter;
  const provider = createNeedsYou({ root, reviewAdapter: adapter });
  const sends = [];
  const session = {
    sessionId: randomUUID(),
    rpc: {
      queue: {
        pendingItems: async () => ({
          items: [],
          steeringMessages: [],
          inFlightSteeringCount: 0,
        }),
      },
    },
    send: async (input) => {
      const messageId = randomUUID();
      sends.push(input);
      provider.onEvent({
        id: randomUUID(),
        type: 'user.message',
        data: { content: input.prompt, messageId, delivery: 'idle' },
      });
      return messageId;
    },
  };
  provider.bindSession(/** @type {any} */ (session));
  provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
  const instanceId = `t011-${randomUUID()}`;
  const instance = await openInstance(
    instanceId,
    () => {},
    null,
    { root, ...(target ? { target } : {}) },
    provider,
  );
  return {
    adapter,
    instance,
    instanceId,
    provider,
    root,
    sends,
    session,
    async close({ removeRoot = true } = {}) {
      provider.dispose();
      await closeInstance(instanceId);
      if (removeRoot) fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** @param {ReturnType<typeof createFixture> extends Promise<infer T> ? T : never} fixture @param {string} kind @param {any} fields @param {any} [scope] */
function requestFor(fixture, kind, fields, scope = { kind: 'session' }) {
  return {
    owner: 'dude',
    requestRef: randomUUID(),
    revision: randomUUID(),
    class: kind,
    scope,
    source: scope.kind === 'session'
      ? { kind: 'session', revision: randomUUID() }
      : {
        kind: 'file',
        path: scope.ideaPath,
        revision: hash(fs.readFileSync(path.join(fixture.root, ...scope.ideaPath.split('/')))),
      },
    prompt: `Current ${kind} question`,
    whyHuman: 'This exact human choice changes the requested outcome.',
    unblocks: 'The current owner can continue with the chosen outcome.',
    blocking: true,
    fields,
  };
}

/** @param {ReturnType<typeof createFixture> extends Promise<infer T> ? T : never} fixture @param {any} request */
async function publish(fixture, request) {
  const controller = new AbortController();
  const invocation = {
    sessionId: fixture.session.sessionId,
    toolName: 'dude_needs_you',
    toolCallId: randomUUID(),
    signal: controller.signal,
  };
  const result = fixture.provider.tool.handler({ op: 'request', request }, invocation);
  const record = await until(
    () => fixture.provider.read().requests.find((item) => (
      item.request.requestRef === request.requestRef && item.phase === 'pending'
    )),
    `published ${request.requestRef}`,
  );
  return { controller, record, result };
}

/** @param {ReturnType<typeof createFixture> extends Promise<infer T> ? T : never} fixture @param {any} receipt @param {string} outcome @param {any} source @param {Record<string,unknown>} [extra] */
async function acknowledge(fixture, receipt, outcome, source, extra = {}) {
  const result = await fixture.provider.tool.handler({
    op: 'acknowledge',
    acknowledgment: {
      receiptId: receipt.receiptId,
      owner: receipt.owner,
      requestRef: receipt.requestRef,
      scope: receipt.scope,
      previousRevision: receipt.previousRevision,
      recognizes: receipt.recognizes,
      outcome,
      note: `Owner ${outcome} this exact response after rereading.`,
      source,
      ...extra,
    },
  }, {
    sessionId: fixture.session.sessionId,
    toolName: 'dude_needs_you',
    toolCallId: randomUUID(),
    signal: new AbortController().signal,
  });
  const body = JSON.parse(result.textResultForLlm);
  assert.equal(body.status, outcome);
  return body;
}

function button(text) {
  return `[...document.querySelectorAll('button')].find((node) => node.innerText.trim() === ${JSON.stringify(text)} && node.getClientRects().length)`;
}

function describedText(expression) {
  return `(() => {
    const node = ${expression};
    return (node?.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
      .filter(Boolean).join(' ');
  })()`;
}

function field(label) {
  return `(() => {
    const label = [...document.querySelectorAll('label')].find((node) => node.textContent.trim() === ${JSON.stringify(label)});
    return label && document.getElementById(label.htmlFor);
  })()`;
}

/** @param {Cdp} page @param {string} expression */
async function click(page, expression) {
  await until(() => evaluate(page, `Boolean(${expression})`), `rendered target ${expression}`);
  await evaluate(page, `(() => {
    const node = ${expression};
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  })()`);
  let prior;
  const point = await until(async () => {
    const next = await evaluate(page, `(() => {
      const node = ${expression};
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, width: rect.width, height: rect.height,
        disabled: node.matches(':disabled,[aria-disabled="true"]'),
        hit: Boolean(hit && (node === hit || node.contains(hit))),
      };
    })()`);
    const stable = next?.hit && !next.disabled && next.width >= 24 && next.height >= 24
      && prior?.x === next.x && prior?.y === next.y;
    prior = next;
    return stable ? next : null;
  }, `stable, enabled 24px target ${expression}`);
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
  });
}

/** @param {Cdp} page */
async function openReviewDetails(page) {
  const surface = `document.querySelector('.fui-PopoverSurface[aria-label="Notes and more"]')`;
  if (!await evaluate(page, `Boolean(${surface}?.getClientRects().length)`)) {
    await click(page, button('Notes and more'));
  }
  await until(
    () => evaluate(page, `Boolean(${surface}?.getClientRects().length)`),
    'Notes and more disclosure',
  );
}

/** @param {Cdp} page */
async function closeReviewDetails(page) {
  const surface = `document.querySelector('.fui-PopoverSurface[aria-label="Notes and more"]')`;
  if (!await evaluate(page, `Boolean(${surface}?.getClientRects().length)`)) return;
  await click(page, button('Notes and more'));
  await until(
    () => evaluate(page, `!${surface}?.getClientRects().length`),
    'Notes and more disclosure exit',
  );
}

/** @param {Cdp} page @param {string} title */
async function openReviewNotice(page, title) {
  await click(
    page,
    `document.querySelector('[aria-label=${JSON.stringify(`Read review notice: ${title}`)}]')`,
  );
  await until(
    () => evaluate(page, `Boolean(document.querySelector(
      '.fui-PopoverSurface[aria-label="Notes and more"]'
    )?.getClientRects().length)`),
    `${title} notice disclosure`,
  );
}

/**
 * Click an already-visible control without scrollIntoView. This keeps the
 * short-panel reachability oracle from repairing the geometry it measures.
 * @param {Cdp} page
 * @param {string} expression
 */
async function clickAtCurrentPosition(page, expression) {
  let prior;
  const point = await until(async () => {
    const next = await evaluate(page, `(() => {
      const node = ${expression};
      if (!node || node.matches(':disabled,[aria-disabled="true"]')) return null;
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, width: rect.width, height: rect.height,
        onScreen: rect.left >= 0 && rect.top >= 0
          && rect.right <= document.documentElement.clientWidth
          && rect.bottom <= document.documentElement.clientHeight,
        hit: Boolean(hit && (node === hit || node.contains(hit))),
      };
    })()`);
    const stable = next?.onScreen && next.hit && next.width >= 24 && next.height >= 24
      && prior?.x === next.x && prior?.y === next.y;
    prior = next;
    return stable ? next : null;
  }, `stable current-position target ${expression}`);
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
  });
}

/** @param {Cdp} page @param {string} expression @param {string} value */
async function fill(page, expression, value) {
  await until(
    () => evaluate(page, `Boolean(${expression} && !${expression}.disabled)`),
    `enabled field ${expression}`,
  );
  await evaluate(page, `(() => {
    const node = ${expression};
    node.focus();
    node.select?.();
  })()`);
  await page.send('Input.insertText', { text: value });
}

/** @param {Cdp} page @param {string} key @param {string} [code] @param {number} [modifiers] */
async function press(page, key, code = key, modifiers = 0) {
  const virtual = {
    Enter: 13, Tab: 9, Escape: 27, Home: 36, ' ': 32,
    ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39,
  }[key] ?? 0;
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, modifiers,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
    ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}),
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, modifiers,
    windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual,
  });
}

/**
 * Dispatch a non-text navigation key through CDP's native-key path.
 *
 * `keyDown` rather than `rawKeyDown`: once sequential Tab navigation has handed
 * focus past the end of the document, the browser process suppresses the next
 * keyboard event it receives and only a `keyDown` clears that suppression. A
 * `rawKeyDown` is dropped there before the renderer sees it, so no `keydown` is
 * dispatched and no default action runs. Both types produce the identical DOM
 * `keydown` for a non-text key; only the browser-side pre-handler differs.
 * @param {Cdp} page
 * @param {string} key
 * @param {string} [code]
 * @param {number} [modifiers]
 */
async function pressNavigationKey(page, key, code = key, modifiers = 0) {
  const virtual = {
    Tab: 9, PageDown: 34, Home: 36, End: 35,
    ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39,
  }[key] ?? 0;
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, modifiers,
    windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual,
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, modifiers,
    windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual,
  });
}

/** @param {Cdp} page @param {string} label @param {string} option */
async function choose(page, label, option) {
  await click(page, field(label));
  await click(page, `[...document.querySelectorAll('[role=option]')].find((node) => node.textContent.trim() === ${JSON.stringify(option)} && node.getClientRects().length)`);
}

/** @param {Cdp} page @param {number} width @param {'light'|'dark'} theme @param {number} [height] */
async function viewport(page, width, theme, height = 900, deviceScaleFactor = 1) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor, mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  });
  if (await evaluate(page, `Boolean(document.querySelector('.fui-FluentProvider'))`)) {
    const expected = theme === 'dark' ? '#ffffff' : '#242424';
    await until(() => evaluate(page, `getComputedStyle(document.querySelector('.fui-FluentProvider'))
      .getPropertyValue('--colorNeutralForeground1').trim() === ${JSON.stringify(expected)}`), `${theme} Fluent theme`);
    await until(() => evaluate(page, `document.getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .every((animation) => animation.playState === 'finished' || animation.playState === 'idle')`),
    `${theme} finite Fluent transitions`);
  }
}

/** @param {Cdp} page @param {ReturnType<typeof createFixture> extends Promise<infer T> ? T : never} fixture @param {number} [width] @param {'light'|'dark'} [theme] */
async function navigate(page, fixture, width = 1440, theme = 'light') {
  await viewport(page, width, theme);
  await page.send('Page.navigate', { url: fixture.instance.url });
  await until(() => evaluate(page, `document.querySelector('h1')?.textContent === 'Overview'
    && !document.body.innerText.includes('Reading repository state')
    && document.querySelector('footer')?.textContent.includes('Connected')`), 'published application read');
}

/** @param {Cdp} page @param {string} text */
function visible(page, text) {
  return until(() => evaluate(page, `document.body.innerText.includes(${JSON.stringify(text)})`), `visible text ${text}`);
}

/** @param {import('node:test').TestContext} context @param {string} slug */
function evidence(context, slug) {
  const parent = path.resolve(process.env.DUDE_CANVAS_ARTIFACTS_DIR ?? os.tmpdir());
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, `dude-canvas-${slug}-`));
  const sourcePaths = [
    'scripts/dude-canvas-ui/t011-browser.test.mjs',
    'src/extensions/dude/frontend/app.jsx',
    'src/extensions/dude/frontend/needs-you.jsx',
    'src/extensions/dude/frontend/review.jsx',
    'src/extensions/dude/frontend/use-canvas-data.js',
    'src/extensions/dude/frontend/styles.js',
    'src/extensions/dude/frontend/theme.js',
    'src/extensions/dude/lib/projection.mjs',
    'src/extensions/dude/lib/needs-you.mjs',
    'src/extensions/dude/lib/review.mjs',
    'src/extensions/dude/lib/canvas-server.mjs',
    'src/extensions/dude/ui/index.html',
    'src/extensions/dude/ui/assets/app.js',
  ];
  const sources = Object.fromEntries(sourcePaths.map((relative) => [
    relative,
    sha256(fs.readFileSync(path.join(ROOT, ...relative.split('/')))),
  ]));
  assert.equal(sources['src/extensions/dude/ui/assets/app.js'], PUBLISHED_APP_SHA256,
    'the browser suite must execute the coordinator-published production bytes');
  const results = [];
  context.diagnostic(`T011 evidence directory: ${directory}`);
  context.diagnostic(`T011 source SHA-256: ${JSON.stringify(sources)}`);
  context.after(() => {
    fs.writeFileSync(path.join(directory, 'results.json'), `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      sources,
      results,
    }, null, 2)}\n`);
  });
  return { directory, results, sources };
}

/** @param {ReturnType<typeof evidence>} output @param {string} name @param {unknown} value */
function writeEvidenceJson(output, name, value) {
  const file = path.join(output.directory, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/** @param {any} node @param {string} name */
function axProperty(node, name) {
  return node.properties?.find((property) => property.name === name)?.value?.value ?? null;
}

/** @param {{nodes:any[]}} tree */
function axLiveRegions(tree) {
  const byId = new Map(tree.nodes.map((node) => [node.nodeId, node]));
  const subtreeText = (node, seen = new Set()) => {
    if (!node || seen.has(node.nodeId)) return '';
    seen.add(node.nodeId);
    // Chromium 152 exposes each StaticText value again through its
    // InlineTextBox child. The latter is paint-layout detail, not a second
    // accessibility announcement.
    if (node.role?.value === 'InlineTextBox') return '';
    return [
      node.name?.value || '',
      ...(node.childIds || []).map((id) => subtreeText(byId.get(id), seen)),
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  };
  return tree.nodes.filter((node) => ['polite', 'assertive'].includes(axProperty(node, 'live')))
    .map((node) => ({
      nodeId: node.nodeId,
      role: node.role?.value ?? null,
      name: node.name?.value ?? '',
      live: axProperty(node, 'live'),
      atomic: axProperty(node, 'atomic'),
      relevant: axProperty(node, 'relevant'),
      text: subtreeText(node),
    }));
}

/** @param {{nodes:any[]}} tree @param {string} expected */
function axGroupsContaining(tree, expected) {
  const byId = new Map(tree.nodes.map((node) => [node.nodeId, node]));
  const subtreeText = (node, seen = new Set()) => {
    if (!node || seen.has(node.nodeId)) return '';
    seen.add(node.nodeId);
    if (node.role?.value === 'InlineTextBox') return '';
    return [
      node.name?.value || '',
      ...(node.childIds || []).map((id) => subtreeText(byId.get(id), seen)),
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  };
  return tree.nodes.filter((node) => !node.ignored && node.role?.value === 'group'
    && subtreeText(node).includes(expected)).map((node) => ({
    nodeId: node.nodeId,
    role: node.role?.value,
    name: node.name?.value ?? '',
    nameSources: node.name?.sources ?? [],
    text: subtreeText(node),
  }));
}

/**
 * Chrome 152 uses Fluent's native Document.ariaNotify path instead of the
 * fallback DOM live region. Wrap the browser API without replacing its effect
 * so the test can observe the exact native boundary selected by this runtime.
 * @param {Cdp} page
 */
async function installNativeAnnouncementProbe(page) {
  return evaluate(page, `(() => {
    window.__t011NativeAnnouncements = [];
    const native = document.ariaNotify;
    if (typeof native !== 'function') return { supported: false, wrapped: false };
    const wrapper = function(message, options) {
      window.__t011NativeAnnouncements.push({
        message: String(message),
        options: options ? structuredClone(options) : {},
      });
      return Reflect.apply(native, document, [message, options]);
    };
    Object.defineProperty(document, 'ariaNotify', {
      configurable: true,
      writable: true,
      value: wrapper,
    });
    return {
      supported: true,
      wrapped: document.ariaNotify === wrapper,
      nativeImplementation: Function.prototype.toString.call(native),
    };
  })()`);
}

/**
 * Sample the owner document while Fluent's bounded live-message cycle is
 * present. Older browsers use the fallback DOM/AX live region; browsers with
 * Document.ariaNotify invoke that native API instead.
 * @param {Cdp} page
 * @param {string} expected
 * @param {number} [timeout]
 */
async function observeLiveFeedback(page, expected, timeout = 750) {
  const end = Date.now() + timeout;
  const samples = [];
  let best = null;
  while (Date.now() < end) {
    const dom = await evaluate(page, `(() => {
      const expected = ${JSON.stringify(expected)};
      const nodes = [...new Set(document.querySelectorAll(
        '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]'
      ))];
      return nodes.map((node) => ({
        tag: node.tagName,
        role: node.getAttribute('role'),
        live: node.getAttribute('aria-live')
          || (node.getAttribute('role') === 'status' ? 'polite'
            : node.getAttribute('role') === 'alert' ? 'assertive' : null),
        atomic: node.getAttribute('aria-atomic'),
        ownerDocument: node.ownerDocument === document,
        text: node.textContent.replace(/\\s+/g, ' ').trim(),
        containsExpected: node.textContent.includes(expected),
      }));
    })()`);
    const tree = await page.send('Accessibility.getFullAXTree');
    const ax = axLiveRegions(tree);
    const native = await evaluate(page, `({
      supported: typeof document.ariaNotify === 'function',
      calls: Array.isArray(window.__t011NativeAnnouncements)
        ? structuredClone(window.__t011NativeAnnouncements) : [],
    })`);
    const summary = {
      elapsedMs: timeout - Math.max(0, end - Date.now()),
      dom,
      ax,
      native,
      domMatch: dom.some((entry) => entry.ownerDocument && entry.containsExpected),
      axMatch: ax.some((entry) => entry.text.includes(expected)),
      nativeMatch: native.calls.some((entry) => (
        entry.message.includes(expected) && entry.options?.priority === 'high'
      )),
    };
    samples.push(summary);
    const score = native.supported
      ? Number(summary.nativeMatch) * 2
      : Number(summary.domMatch) + Number(summary.axMatch);
    if (!best || score > best.score) best = { score, summary, tree };
    if (score === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return {
    expected,
    samples,
    best: best?.summary ?? null,
    tree: best?.tree ?? { nodes: [] },
    nativeSupported: samples.some(sample => sample.native.supported),
  };
}

/**
 * Save browser-owned visual, AX, DOM, and network evidence before a deliberate
 * regression assertion reports the verified defect.
 * @param {Cdp} page
 * @param {ReturnType<typeof evidence>} output
 * @param {string} name
 * @param {Record<string, unknown>} proof
 */
async function saveRegressionProof(page, output, name, proof) {
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const image = Buffer.from(screenshot.data, 'base64');
  fs.writeFileSync(path.join(output.directory, `${name}.png`), image);
  const tree = await page.send('Accessibility.getFullAXTree');
  fs.writeFileSync(path.join(output.directory, `${name}.ax.json`), `${JSON.stringify(tree, null, 2)}\n`);
  const dom = await evaluate(page, `(() => ({
    title: document.title,
    url: location.href,
    activeElement: {
      tag: document.activeElement?.tagName || null,
      name: document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim() || null,
    },
    liveRegions: [...document.querySelectorAll(
      '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]'
    )].map((node) => ({
      tag: node.tagName,
      role: node.getAttribute('role'),
      live: node.getAttribute('aria-live'),
      text: node.textContent.replace(/\\s+/g, ' ').trim(),
    })),
  }))()`);
  writeEvidenceJson(output, `${name}.proof`, {
    ...proof,
    dom,
    screenshot: { bytes: image.length, sha256: sha256(image) },
  });
  return { tree, dom, image };
}

/** @param {Cdp} page @param {string} prompt */
async function triggerReviewCaptureRefusal(page, prompt) {
  await click(page, `[...document.querySelectorAll('button')].find((node) =>
    node.innerText.includes(${JSON.stringify(prompt)}) && node.getClientRects().length)`);
  await click(page, button('Open Review'));
  await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
    && !document.querySelector('[aria-label="Box (B)"]').disabled`), 'review regression engine ready', 30_000);
  await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
  await openReviewDetails(page);
  await click(page, button('Add at center'));
  await visible(page, 'Comments (1)');
  await click(page, button('Comments (1)'));
  await fill(page, field('Y1'), '100000');
  await press(page, 'Tab');
  await fill(page, field('Y2'), '100100');
  await press(page, 'Tab');
  await click(page, `document.querySelector('[aria-label="Close comments"]')`);
  await click(page, button('Send annotations'));
  await visible(page, 'Review needs attention. Read notice');
  await openReviewNotice(page, 'Review needs attention');
  const message = await until(() => evaluate(page, `(() => {
    const candidates = [
      'Keep all annotations inside the reviewed viewport before sending.',
    ];
    return candidates.find((candidate) => document.body.innerText.includes(candidate)) || null;
  })()`), 'specific Review capture refusal');
  await evaluate(page, `document.querySelector('[data-review-return]').focus()`);
  return message;
}

/** Collect the exact text-contrast samples consumed by the owning audit. */
function textContrastSnapshot(page) {
  return evaluate(page, `(() => {
    const channels = (value) => (value.match(/[\\d.]+/g) || []).slice(0, 4).map(Number);
    const composite = (top, bottom) => {
      const alpha = top[3] === undefined ? 1 : top[3];
      return top.slice(0, 3).map((value, index) => value * alpha + bottom[index] * (1 - alpha));
    };
    const background = (element) => {
      let result = [255, 255, 255];
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const value = channels(getComputedStyle(node).backgroundColor);
        if (value.length >= 3 && (value[3] ?? 1) > 0) layers.push(value);
      }
      for (const layer of layers.reverse()) result = composite(layer, result);
      return result;
    };
    const luminance = (rgb) => rgb.map((value) => value / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return [...document.querySelectorAll(
      'h1,h2,h3,p,label,button:not(:disabled),[role=tab],[data-work-number]'
    )]
      .filter((node) => node.getClientRects().length && node.textContent.trim())
      .map((node) => {
        const style = getComputedStyle(node);
        const labelledControl = node.tagName === 'LABEL' && node.htmlFor
          ? document.getElementById(node.htmlFor) : null;
        const describedBy = (node.getAttribute('aria-describedby') || '').split(/\\s+/)
          .filter(Boolean);
        const description = describedBy
          .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
          .filter(Boolean).join(' ');
        const focusableInactiveSave = node.matches('button[aria-disabled="true"]')
          && node.innerText.trim() === 'Save markup'
          && Boolean(node.closest('[data-review-workspace]'))
          && !node.closest('[data-review-tools]')
          && node.tabIndex === 0
          && Boolean(description);
        const foreground = channels(style.color);
        const bg = background(node);
        const light = Math.max(luminance(foreground), luminance(bg));
        const dark = Math.min(luminance(foreground), luminance(bg));
        const size = Number.parseFloat(style.fontSize);
        const weight = Number.parseInt(style.fontWeight, 10) || 400;
        const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        return {
          text: node.textContent.trim().slice(0, 100),
          foreground: style.color,
          background: 'rgb(' + bg.join(', ') + ')',
          ratio: (light + .05) / (dark + .05),
          threshold,
          title: node.getAttribute('title'),
          describedBy,
          description: description || null,
          ariaDisabled: node.getAttribute('aria-disabled'),
          disabledProperty: /** @type {any} */ (node).disabled ?? null,
          className: node.className,
          transition: {
            property:style.transitionProperty,
            duration:style.transitionDuration,
          },
          documentVisibility:document.visibilityState,
          timelineCurrentTime:document.timeline.currentTime,
          runningAnimations:document.getAnimations()
            .filter(animation => animation.playState === 'running').length,
          exemption: labelledControl?.disabled || focusableInactiveSave
            ? 'inactive control (WCAG 1.4.3)' : null,
        };
      });
  })()`);
}

function textContrastFailures(contrast) {
  return contrast.filter((sample) => !sample.exemption
    && sample.ratio + 0.001 < sample.threshold);
}

function assertTextContrast(contrast, name) {
  assert.ok(contrast.length > 0, `${name}: contrast audit found rendered text`);
  assert.deepEqual(
    textContrastFailures(contrast),
    [],
    `${name}: rendered active text meets WCAG contrast`,
  );
}

/**
 * Assert rendered geometry, target sizing, AX names, and computed text
 * contrast. `clientWidth` is the usable viewport; the test intentionally does
 * not equate it with innerWidth when a native scrollbar consumes space.
 * @param {Cdp} page
 * @param {ReturnType<typeof evidence>} output
 * @param {string} name
 * @param {Array<{case:string,controls:unknown[]}>|null} [deferredHorizontalFindings]
 */
async function audit(page, output, name, deferredHorizontalFindings = null) {
  // Responsive updates and autosave can start Fluent's 100ms
  // background/border/color transition after viewport() has settled. Measure
  // the finished paint, not the disabled color at the first active frame.
  await settleFocusPaint(page);
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const image = Buffer.from(screenshot.data, 'base64');
  fs.writeFileSync(path.join(output.directory, `${name}.png`), image);
  const tree = await page.send('Accessibility.getFullAXTree');
  fs.writeFileSync(path.join(output.directory, `${name}.ax.json`), `${JSON.stringify(tree, null, 2)}\n`);
  const namedRoles = new Set([
    'button', 'checkbox', 'combobox', 'listbox', 'option', 'radio',
    'radiogroup', 'tab', 'tabpanel', 'textbox', 'toolbar',
  ]);
  const unnamed = tree.nodes.filter((node) => (
    !node.ignored && namedRoles.has(node.role?.value) && !node.name?.value
  ));
  assert.deepEqual(unnamed, [], `${name}: every interactive AX widget has a name`);

  const geometry = await evaluate(page, `(() => {
    const clientWidth = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll(
      'button,input,textarea,[role=combobox],[role=radio],[data-work-path]'
    )].filter((node) => node.getClientRects().length).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 100)
          || node.getAttribute('name') || node.tagName,
        x: rect.x, right: rect.right, width: rect.width, height: rect.height,
      };
    });
    const frame = document.querySelector('.fui-FluentProvider > div')?.getBoundingClientRect();
    return {
      innerWidth,
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      frame: frame?.toJSON(),
      controls,
    };
  })()`);
  fs.writeFileSync(path.join(output.directory, `${name}.geometry.json`), `${JSON.stringify(geometry, null, 2)}\n`);
  assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `${name}: no page horizontal overflow`);
  assert.ok(geometry.bodyScrollWidth <= geometry.clientWidth + 1, `${name}: body fits usable client viewport`);
  assert.ok(Math.abs(geometry.frame.x) <= 1 && geometry.frame.right <= geometry.clientWidth + 1,
    `${name}: full application frame fits the usable viewport`);
  assert.deepEqual(
    geometry.controls.filter((control) => control.width < 24 || control.height < 24),
    [],
    `${name}: rendered interaction targets are at least 24 by 24 CSS pixels`,
  );
  const clipped = geometry.controls.filter(
    (control) => control.x < -1 || control.right > geometry.clientWidth + 1,
  );
  if (deferredHorizontalFindings && clipped.length) {
    deferredHorizontalFindings.push({ case: name, controls: clipped });
  } else {
    assert.deepEqual(clipped, [], `${name}: rendered controls are not horizontally clipped`);
  }

  const contrast = await textContrastSnapshot(page);
  fs.writeFileSync(path.join(output.directory, `${name}.contrast.json`), `${JSON.stringify(contrast, null, 2)}\n`);
  assertTextContrast(contrast, name);
  output.results.push({
    case: name,
    screenshot: { bytes: image.length, sha256: sha256(image) },
    controls: geometry.controls.length,
    contrastSamples: contrast.length,
    minimumApplicableContrast: Math.min(...contrast.filter(({ exemption }) => !exemption).map(({ ratio }) => ratio)),
    contrastExemptions: contrast.filter(({ exemption }) => exemption).length,
    usableViewport: geometry.clientWidth,
  });
}

/** @param {Cdp} page */
function reviewToolbarSnapshot(page) {
  return evaluate(page, `(() => {
    const toolbar = document.querySelector('[role="toolbar"][aria-label="Annotation tools"]');
    if (!toolbar) throw new Error('Missing Annotation tools toolbar');
    const palette = toolbar.closest('[data-review-tools]');
    if (!palette) throw new Error('Missing data-review-tools palette');
    const describe = node => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('aria-label') || node.innerText.trim(),
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        disabled: node.matches(':disabled,[aria-disabled="true"]'),
        tabIndex: node.tabIndex,
      };
    };
    const frame = document.querySelector('.dude-review-frame');
    const paletteRect = palette.getBoundingClientRect();
    const workflow = ['Save markup', 'Comments (0)', 'Send annotations'].map(name => {
      const node = [...document.querySelectorAll('button')].find(button => button.innerText.trim() === name);
      return node ? { ...describe(node), inPalette: palette.contains(node) } : { name, missing: true };
    });
    return {
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      palette: {
        marker: palette.hasAttribute('data-review-tools'),
        x: paletteRect.x,
        y: paletteRect.y,
        right: paletteRect.right,
        bottom: paletteRect.bottom,
        width: paletteRect.width,
        height: paletteRect.height,
      },
      toolbar: {
        label: toolbar.getAttribute('aria-label'),
        role: toolbar.getAttribute('role'),
        orientation: toolbar.getAttribute('aria-orientation'),
        buttons: [...toolbar.querySelectorAll('button')].map(describe),
      },
      controls: [...palette.querySelectorAll('button')].map(describe),
      workflow,
      frame: frame ? { width: frame.clientWidth, height: frame.clientHeight } : null,
    };
  })()`);
}

/** @param {Cdp} page @param {string} checkpoint */
function shortReviewToolbarSnapshot(page, checkpoint) {
  return evaluate(page, `(() => {
    const rect = node => {
      if (!node) return null;
      const { x, y, top, right, bottom, left, width, height } = node.getBoundingClientRect();
      return { x, y, top, right, bottom, left, width, height };
    };
    const section = document.querySelector('[data-review-workspace]');
    const host = document.querySelector('[data-review-engine-host]');
    const canvasBand = host?.parentElement;
    const workspace = canvasBand?.parentElement;
    const palette = document.querySelector('[data-review-tools]');
    const toolbar = palette?.querySelector('[role="toolbar"][aria-label="Annotation tools"]');
    const frame = document.querySelector('.dude-review-frame');
    const sectionRect = section?.getBoundingClientRect();
    const paletteRect = palette?.getBoundingClientRect();
    const visiblePanel = sectionRect ? {
      left: Math.max(0, sectionRect.left),
      top: Math.max(0, sectionRect.top),
      right: Math.min(document.documentElement.clientWidth, sectionRect.right),
      bottom: Math.min(document.documentElement.clientHeight, sectionRect.bottom),
    } : null;
    const within = (box, bounds) => Boolean(bounds
      && box.left >= bounds.left - 1 && box.top >= bounds.top - 1
      && box.right <= bounds.right + 1 && box.bottom <= bounds.bottom + 1);
    const controls = palette ? [...palette.querySelectorAll('button')]
      .filter(node => !node.matches(':disabled,[aria-disabled="true"]'))
      .map(node => {
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          name: node.getAttribute('aria-label') || node.innerText.trim(),
          rect: rect(node),
          insidePalette: within(box, paletteRect),
          insideVisiblePanel: within(box, visiblePanel),
          centerHittable: Boolean(hit && (node === hit || node.contains(hit))),
        };
      }) : [];
    const frameRect = frame?.getBoundingClientRect();
    return {
      checkpoint: ${JSON.stringify(checkpoint)},
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        dpr: devicePixelRatio,
      },
      panel: rect(section),
      workspace: workspace ? {
        ...rect(workspace),
        scrollTop: workspace.scrollTop,
        scrollHeight: workspace.scrollHeight,
        clientHeight: workspace.clientHeight,
      } : null,
      frame: rect(frame),
      framePinned: Boolean(frame?.classList.contains('dude-review-frame-pinned')),
      frameVisibleHeight: frameRect && visiblePanel
        ? Math.max(0, Math.min(frameRect.bottom, visiblePanel.bottom)
          - Math.max(frameRect.top, visiblePanel.top)) : 0,
      palette: palette ? {
        ...rect(palette),
        insideVisiblePanel: within(paletteRect, visiblePanel),
        computedOverflow: getComputedStyle(palette).overflow,
      } : null,
      toolbar: toolbar ? {
        role: toolbar.getAttribute('role'),
        label: toolbar.getAttribute('aria-label'),
        orientation: toolbar.getAttribute('aria-orientation'),
      } : null,
      controls,
      active: {
        tag: document.activeElement?.tagName || null,
        role: document.activeElement?.getAttribute('role') || null,
        name: document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.innerText?.trim() || null,
      },
      status: [...document.querySelectorAll('.fui-Badge')].map(node => node.textContent.trim())[0] || null,
      comments: [...document.querySelectorAll('button')]
        .find(node => /^Comments \\(\\d+\\)$/.test(node.innerText.trim()))?.innerText.trim() || null,
    };
  })()`);
}

/** Measure the revealed target, not the offscreen DOM rectangle of a scrolled tool. */
function floatingControlSnapshot(page, expression) {
  return evaluate(page, `(() => {
    const node = ${expression}, box = node.getBoundingClientRect();
    const within = bounds => box.left >= bounds.left - 1 && box.top >= bounds.top - 1
      && box.right <= bounds.right + 1 && box.bottom <= bounds.bottom + 1;
    const palette = node.closest('[data-review-tools]');
    const toolbar = node.closest('[role="toolbar"]');
    const hits = [[.5,.5],[.08,.08],[.92,.08],[.08,.92],[.92,.92]].map(([x,y]) => {
      const hit = document.elementFromPoint(box.x+x*box.width, box.y+y*box.height);
      return Boolean(hit && (hit === node || node.contains(hit)));
    });
    const style = getComputedStyle(node);
    const before = getComputedStyle(node, '::before');
    const after = getComputedStyle(node, '::after');
    const describeStyle = computed => ({
      content:computed.content, display:computed.display, position:computed.position,
      inset:computed.inset, border:computed.border, outline:computed.outline,
      outlineOffset:computed.outlineOffset, boxShadow:computed.boxShadow,
      overflow:computed.overflow, overflowX:computed.overflowX, overflowY:computed.overflowY,
      clip:computed.clip, clipPath:computed.clipPath,
    });
    const ancestors = [];
    for (let current = node; current; current = current.parentElement) {
      const currentBox = current.getBoundingClientRect();
      const currentStyle = getComputedStyle(current);
      ancestors.push({
        tag:current.tagName, className:current.className,
        attributes:Object.fromEntries([...current.attributes].map(attribute => [attribute.name, attribute.value])),
        box:currentBox.toJSON(), overflow:currentStyle.overflow,
        overflowX:currentStyle.overflowX, overflowY:currentStyle.overflowY,
        clip:currentStyle.clip, clipPath:currentStyle.clipPath,
        scrollTop:current.scrollTop, scrollLeft:current.scrollLeft,
        scrollHeight:current.scrollHeight, scrollWidth:current.scrollWidth,
        clientHeight:current.clientHeight, clientWidth:current.clientWidth,
        focusVisibleScope:Boolean(current.focusVisible),
      });
    }
    return {
      name:node.getAttribute('aria-label') || node.innerText.trim(),
      title:node.getAttribute('title'),
      description:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
        .filter(Boolean).join(' ') || null,
      box:box.toJSON(), disabled:node.matches(':disabled,[aria-disabled="true"]'),
      focused:node === document.activeElement,
      focusVisible:node.matches(':focus-visible'),
      attributes:Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value])),
      focusVisibleElements:[...document.querySelectorAll('[data-fui-focus-visible]')]
        .map(element => element.getAttribute('aria-label') || element.innerText.trim()),
      provider:{
        contains:document.querySelector('.fui-FluentProvider')?.contains(node) || false,
        focusVisibleScope:Boolean(document.querySelector('.fui-FluentProvider')?.focusVisible),
      },
      keyborg:window.__keyborg ? {
        refs:Object.keys(window.__keyborg.refs || {}),
        coreKeys:Object.keys(window.__keyborg.core || {}),
        navigating:window.__keyborg.core?.isNavigatingWithKeyboard,
      } : null,
      ancestors,
      clippingAncestors:ancestors.filter(ancestor => ancestor.overflowX !== 'visible'
        || ancestor.overflowY !== 'visible' || ancestor.clip !== 'auto'
        || ancestor.clipPath !== 'none').map(ancestor => ({
          ...ancestor,
          margins:{
            top:box.top-ancestor.box.top, right:ancestor.box.right-box.right,
            bottom:ancestor.box.bottom-box.bottom, left:box.left-ancestor.box.left,
          },
          whollyContains:box.left >= ancestor.box.left && box.top >= ancestor.box.top
            && box.right <= ancestor.box.right && box.bottom <= ancestor.box.bottom,
        })),
      focusTokens:{
        focus1:style.getPropertyValue('--colorStrokeFocus1').trim(),
        focus2:style.getPropertyValue('--colorStrokeFocus2').trim(),
        transparent:style.getPropertyValue('--colorTransparentStroke').trim(),
      },
      inViewport:within({left:0,top:0,right:document.documentElement.clientWidth,bottom:document.documentElement.clientHeight}),
      inPanel:within(document.querySelector('[data-review-workspace]').getBoundingClientRect()),
      inPalette:!palette || within(palette.getBoundingClientRect()),
      inScroller:!toolbar || within(toolbar.getBoundingClientRect()),
      scroller:toolbar ? {
        box:toolbar.getBoundingClientRect().toJSON(),
        scrollTop:toolbar.scrollTop, scrollLeft:toolbar.scrollLeft,
        scrollHeight:toolbar.scrollHeight, scrollWidth:toolbar.scrollWidth,
        clientHeight:toolbar.clientHeight, clientWidth:toolbar.clientWidth,
        overflow:getComputedStyle(toolbar).overflow,
        overflowX:getComputedStyle(toolbar).overflowX,
        overflowY:getComputedStyle(toolbar).overflowY,
        clip:getComputedStyle(toolbar).clip,
        clipPath:getComputedStyle(toolbar).clipPath,
      } : null,
      hits, focus:{
        outline:style.outline, outlineOffset:style.outlineOffset, shadow:style.boxShadow,
        border:style.border, before:describeStyle(before), after:describeStyle(after),
      },
    };
  })()`);
}

/**
 * Measure the Review drawer's master-detail selection without treating
 * aria-current alone as visual proof. The shape marker, focus paint, list
 * scrollport, native overlay numerals, and footer semantics are independent
 * oracles so an empty list or a color-only row cannot pass.
 * @param {Cdp} page
 */
function reviewSelectionSnapshot(page) {
  return evaluate(page, `(() => {
    const close = document.querySelector('[aria-label="Close comments"]');
    const drawer = close?.closest('.fui-OverlayDrawer')
      || close?.closest('[role="dialog"]');
    if (!drawer) return { present:false };
    const list = drawer.querySelector('[aria-label="Annotations"]');
    const rows = [...drawer.querySelectorAll('[data-annotation-id]')];
    const channels = value => {
      const match = String(value).match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      const values = match[1].split(',').map(Number);
      return {
        r:values[0], g:values[1], b:values[2],
        a:values.length > 3 ? values[3] : 1,
      };
    };
    const composite = (top, bottom) => {
      if (!top) return bottom;
      const alpha = top.a ?? 1;
      return {
        r:top.r * alpha + bottom.r * (1 - alpha),
        g:top.g * alpha + bottom.g * (1 - alpha),
        b:top.b * alpha + bottom.b * (1 - alpha),
        a:1,
      };
    };
    const background = node => {
      const layers = [];
      for (let current = node; current; current = current.parentElement) {
        const value = channels(getComputedStyle(current).backgroundColor);
        if (value && value.a > 0) layers.push(value);
      }
      return layers.reverse().reduce(
        (result, layer) => composite(layer, result),
        {r:255,g:255,b:255,a:1},
      );
    };
    const luminance = value => {
      const linear = channel => {
        const normalized = channel / 255;
        return normalized <= .04045
          ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
      };
      return .2126 * linear(value.r) + .7152 * linear(value.g)
        + .0722 * linear(value.b);
    };
    const ratio = (left, right) => {
      const a = luminance(left), b = luminance(right);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    const rect = node => {
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        top:box.top, right:box.right, bottom:box.bottom, left:box.left,
        width:box.width, height:box.height,
      };
    };
    const listRect = rect(list);
    const describePseudo = (node, pseudo) => {
      const style = getComputedStyle(node, pseudo);
      const color = channels(style.backgroundColor);
      const rowBackground = background(node);
      const width = Number.parseFloat(style.width);
      const height = Number.parseFloat(style.height);
      const opacity = Number.parseFloat(style.opacity);
      const visible = !['none', 'normal'].includes(style.content)
        && style.display !== 'none'
        && style.visibility === 'visible'
        && Number.isFinite(opacity) && opacity > 0
        && Number.isFinite(width) && width > 0
        && Number.isFinite(height) && height > 0
        && color && color.a > 0;
      return {
        pseudo, content:style.content, display:style.display,
        visibility:style.visibility, opacity, visible, width, height,
        position:style.position, borderRadius:style.borderRadius,
        backgroundColor:style.backgroundColor,
        contrastAgainstRow:visible ? ratio(composite(color, rowBackground), rowBackground) : null,
      };
    };
    const described = rows.map((node, index) => {
      const style = getComputedStyle(node);
      const box = rect(node);
      const label = [...node.querySelectorAll('span')].find(candidate =>
        /^\\s*\\d+\\./.test(candidate.textContent)
        && ![...candidate.children].some(child => /^\\s*\\d+\\./.test(child.textContent)));
      const labelStyle = label ? getComputedStyle(label) : null;
      const labelForeground = labelStyle ? channels(labelStyle.color) : null;
      const labelBackground = label ? background(label) : null;
      const labelSize = labelStyle ? Number.parseFloat(labelStyle.fontSize) : null;
      const labelWeight = labelStyle ? Number.parseInt(labelStyle.fontWeight, 10) || 400 : null;
      const resolvedBackground = background(node);
      return {
        index,
        id:node.getAttribute('data-annotation-id'),
        ariaCurrent:node.getAttribute('aria-current'),
        ariaLabel:node.getAttribute('aria-label'),
        text:node.innerText.replace(/\\s+/g, ' ').trim(),
        tabIndex:node.tabIndex,
        active:node === document.activeElement || node.contains(document.activeElement),
        focusVisible:node.matches(':focus-visible') || node.hasAttribute('data-fui-focus-visible'),
        focusAttribute:node.hasAttribute('data-fui-focus-visible'),
        outline:style.outline,
        outlineStyle:style.outlineStyle,
        outlineWidth:style.outlineWidth,
        boxShadow:style.boxShadow,
        backgroundColor:style.backgroundColor,
        resolvedBackground,
        labelColor:labelStyle?.color ?? null,
        labelWeight:labelStyle?.fontWeight ?? null,
        label:label && labelForeground && labelBackground ? {
          text:label.textContent.replace(/\\s+/g, ' ').trim(),
          foreground:labelStyle.color,
          background:'rgb(' + [labelBackground.r,labelBackground.g,labelBackground.b].join(', ') + ')',
          fontSize:labelSize,
          fontWeight:labelWeight,
          threshold:labelSize >= 24 || (labelSize >= 18.66 && labelWeight >= 700) ? 3 : 4.5,
          ratio:ratio(composite(labelForeground, labelBackground), labelBackground),
        } : null,
        pseudos:[describePseudo(node, '::before'), describePseudo(node, '::after')],
        rect:box,
        fullyVisible:Boolean(box && listRect
          && box.top >= listRect.top - .5 && box.bottom <= listRect.bottom + .5),
      };
    });
    const selected = described.find(row => row.ariaCurrent === 'true') || null;
    const comparison = described.find(row => row.ariaCurrent !== 'true') || null;
    const frame = document.querySelector('.dude-review-frame');
    const overlay = document.querySelector('.dude-review-overlay');
    const done = drawer.querySelector('[data-review-comments-done]');
    const comment = [...drawer.querySelectorAll('label')]
      .find(node => node.textContent.trim() === 'Comment (optional)');
    const commentNode = comment ? document.getElementById(comment.htmlFor) : null;
    return {
      present:true,
      rows:described,
      selectedVsUnselectedContrast:selected && comparison
        ? ratio(selected.resolvedBackground, comparison.resolvedBackground) : null,
      list:list ? {
        rect:listRect,
        clientHeight:list.clientHeight,
        scrollHeight:list.scrollHeight,
        scrollTop:list.scrollTop,
        overflowY:getComputedStyle(list).overflowY,
        maxHeight:getComputedStyle(list).maxHeight,
      } : null,
      editor:commentNode ? {
        rect:rect(commentNode),
        value:commentNode.value,
        focused:document.activeElement === commentNode,
        selectionStart:commentNode.selectionStart,
        selectionEnd:commentNode.selectionEnd,
        selectionDirection:commentNode.selectionDirection,
      } : null,
      drawerBody:rect(drawer.querySelector('.fui-DrawerBody')),
      badges:[...drawer.querySelectorAll('.fui-Badge')].map(node => node.textContent.trim()),
      status:drawer.querySelector('[data-review-comment-status]')
        ?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
      statusRegions:drawer.querySelectorAll('[role="status"]').length,
      liveRegions:drawer.querySelectorAll(
        '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]'
      ).length,
      closeTitle:close?.getAttribute('title') ?? null,
      done:done ? {
        text:done.innerText.trim(),
        title:done.getAttribute('title'),
      } : null,
      prohibitedPositiveClaim:/\\b(?:submitted|delivered|approved)\\b/i.test(drawer.innerText),
      frame:frame ? {
        rect:rect(frame),
        clientWidth:frame.clientWidth,
        clientHeight:frame.clientHeight,
        offsetWidth:frame.offsetWidth,
        offsetHeight:frame.offsetHeight,
        inlineWidth:frame.style.width,
        inlineHeight:frame.style.height,
        viewBox:overlay?.getAttribute('viewBox') || null,
      } : null,
      overlayNumerals:overlay ? [...overlay.querySelectorAll('[data-annotation]')].map(group => ({
        id:group.getAttribute('data-annotation'),
        numerals:[...group.querySelectorAll('text')].map(node => node.textContent.trim()),
      })) : [],
      reviewBadge:[...document.querySelectorAll('[data-review-workspace] > header .fui-Badge')]
        .map(node => node.textContent.trim())[0] || null,
      documentOverflow:{
        clientWidth:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth,
        clientHeight:document.documentElement.clientHeight,
        scrollHeight:document.documentElement.scrollHeight,
      },
    };
  })()`);
}

/**
 * Return findings separately so live rendered mutations can be passed through
 * this collector before the owning assertion is expected to reject them.
 * @param {any} snapshot
 * @param {number} expectedSelectedIndex
 */
function selectionVisualFindings(snapshot, expectedSelectedIndex) {
  const findings = [];
  if (!snapshot?.present) return ['comments drawer is absent'];
  if (snapshot.rows.length < 2) findings.push('fewer than two annotation rows');
  const selected = snapshot.rows.filter(row => row.ariaCurrent === 'true');
  const focused = snapshot.rows.filter(row => row.active);
  if (selected.length !== 1) findings.push(`expected one selected row, found ${selected.length}`);
  if (focused.length !== 1) findings.push(`expected one focused row, found ${focused.length}`);
  if (selected[0]?.index !== expectedSelectedIndex) {
    findings.push(`selected row index ${selected[0]?.index} did not equal ${expectedSelectedIndex}`);
  }
  if (selected[0]?.id && selected[0]?.id === focused[0]?.id) {
    findings.push('focus and selection are on the same row');
  }
  const markerRows = snapshot.rows.filter(row => row.pseudos.some(pseudo => pseudo.visible));
  if (markerRows.length !== 1 || markerRows[0]?.id !== selected[0]?.id) {
    findings.push('the non-color shape marker does not belong only to the selected row');
  }
  const marker = selected[0]?.pseudos.find(pseudo => pseudo.visible);
  if (!marker || marker.width < 4 || marker.height < 20 || marker.position !== 'absolute') {
    findings.push('selected row has no 4x20 absolute shape marker');
  }
  if (!marker || marker.contrastAgainstRow < 3) {
    findings.push('selected shape marker is below 3:1 against its row');
  }
  if (!(snapshot.selectedVsUnselectedContrast > 1.05)) {
    findings.push('selected and unselected row backgrounds are not visually distinct');
  }
  if (!selected[0] || !focused[0]
    || JSON.stringify(selected[0].resolvedBackground) === JSON.stringify(focused[0].resolvedBackground)) {
    findings.push('selected and focused-unselected row fills are indistinguishable');
  }
  if (!selected[0] || !focused[0] || selected[0].labelColor === focused[0].labelColor) {
    findings.push('selected and focused-unselected row labels are indistinguishable');
  }
  if (!selected[0]?.label
    || selected[0].label.ratio + 0.001 < selected[0].label.threshold) {
    findings.push('selected label text is below its WCAG contrast threshold');
  }
  if (!focused[0]?.focusVisible
    || (focused[0].outlineStyle === 'none' && focused[0].boxShadow === 'none')) {
    findings.push('focused-unselected row has no independent keyboard focus paint');
  }
  if (!selected[0]?.fullyVisible) findings.push('selected row is not fully visible in its list scrollport');
  return findings;
}

function assertSelectionVisual(snapshot, expectedSelectedIndex, message) {
  assert.deepEqual(selectionVisualFindings(snapshot, expectedSelectedIndex), [], message);
}

/** Wait for finite transitions and two compositor frames; no time-based sleep. */
async function settleFocusPaint(page) {
  await evaluate(page, `(async () => {
    const finite = document.getAnimations().filter(animation =>
      Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map(animation => animation.finished.catch(() => undefined)));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
}

/**
 * Capture the native viewport used for focus-paint comparison.
 * @param {Cdp} page
 * @param {ReturnType<typeof evidence>} output
 * @param {string} name
 */
async function captureFocusScreenshot(page, output, name) {
  await settleFocusPaint(page);
  const viewportSize = await evaluate(page, `({
    width:document.documentElement.clientWidth,
    height:document.documentElement.clientHeight,
    dpr:devicePixelRatio,
  })`);
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const image = Buffer.from(screenshot.data, 'base64');
  const decoded = decodePng(image);
  const relative = `${name}.png`;
  fs.writeFileSync(path.join(output.directory, relative), image);
  return {
    image,
    evidence: {
      path: relative,
      bytes: image.length,
      sha256: sha256(image),
      width: decoded.width,
      height: decoded.height,
      viewport: viewportSize,
    },
  };
}

/** @param {string} value */
function cssColorChannels(value) {
  const hex = /^#([\da-f]{6})$/i.exec(value);
  if (hex) {
    return [0, 2, 4].map(offset => Number.parseInt(hex[1].slice(offset, offset + 2), 16));
  }
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return channels?.length === 3 ? channels : null;
}

/**
 * Compare equal-sized, target-relative control regions in two native screenshots.
 * Focus paint for Fluent buttons is inset, so the measured band is the inner
 * three CSS pixels of the control perimeter rather than an unclipped outset.
 * @param {ReturnType<typeof captureFocusScreenshot> extends Promise<infer T> ? T : never} before
 * @param {ReturnType<typeof captureFocusScreenshot> extends Promise<infer T> ? T : never} after
 * @param {any} beforeTarget
 * @param {any} afterTarget
 */
function focusPaintDifference(before, after, beforeTarget, afterTarget) {
  const beforePng = decodePng(before.image);
  const afterPng = decodePng(after.image);
  assert.deepEqual(
    { width: afterPng.width, height: afterPng.height },
    { width: beforePng.width, height: beforePng.height },
    'focus comparison screenshots use one native viewport',
  );
  assert.ok(Math.abs(beforeTarget.box.width - afterTarget.box.width) < 0.01
    && Math.abs(beforeTarget.box.height - afterTarget.box.height) < 0.01,
  'focus comparison targets retain their rendered size');
  const beforeScale = {
    x: beforePng.width / before.evidence.viewport.width,
    y: beforePng.height / before.evidence.viewport.height,
  };
  const afterScale = {
    x: afterPng.width / after.evidence.viewport.width,
    y: afterPng.height / after.evidence.viewport.height,
  };
  assert.ok(Math.abs(beforeScale.x - afterScale.x) < 0.001
    && Math.abs(beforeScale.y - afterScale.y) < 0.001,
  'focus comparison screenshots retain their native scale');
  const paddingCss = 3;
  const cropWidth = Math.round((beforeTarget.box.width + paddingCss * 2) * beforeScale.x);
  const cropHeight = Math.round((beforeTarget.box.height + paddingCss * 2) * beforeScale.y);
  const origins = [beforeTarget, afterTarget].map((target, index) => {
    const scale = index ? afterScale : beforeScale;
    return {
      x: Math.round((target.box.left - paddingCss) * scale.x),
      y: Math.round((target.box.top - paddingCss) * scale.y),
    };
  });
  const targetBounds = {
    left: Math.round(paddingCss * beforeScale.x),
    top: Math.round(paddingCss * beforeScale.y),
    right: Math.round((paddingCss + beforeTarget.box.width) * beforeScale.x) - 1,
    bottom: Math.round((paddingCss + beforeTarget.box.height) * beforeScale.y) - 1,
  };
  const perimeterBand = Math.max(2, Math.ceil(3 * Math.max(beforeScale.x, beforeScale.y)));
  const focusToken = cssColorChannels(afterTarget.focusTokens.focus2);
  const samples = [];
  let changedPixels = 0;
  let perimeterChangedPixels = 0;
  let focusTokenPerimeterPixels = 0;
  let maxChannelDelta = 0;
  let changedBounds = null;
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const beforeOffset = ((origins[0].y + y) * beforePng.width + origins[0].x + x) * 4;
      const afterOffset = ((origins[1].y + y) * afterPng.width + origins[1].x + x) * 4;
      assert.ok(beforeOffset >= 0 && beforeOffset + 3 < beforePng.pixels.length
        && afterOffset >= 0 && afterOffset + 3 < afterPng.pixels.length,
      'focus comparison crop stays inside both native screenshots');
      const beforePixel = [...beforePng.pixels.subarray(beforeOffset, beforeOffset + 4)];
      const afterPixel = [...afterPng.pixels.subarray(afterOffset, afterOffset + 4)];
      const delta = Math.max(...afterPixel.slice(0, 3)
        .map((channel, index) => Math.abs(channel - beforePixel[index])));
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta <= 8) continue;
      changedPixels += 1;
      changedBounds = changedBounds
        ? {
          left: Math.min(changedBounds.left, x),
          top: Math.min(changedBounds.top, y),
          right: Math.max(changedBounds.right, x),
          bottom: Math.max(changedBounds.bottom, y),
        }
        : { left: x, top: y, right: x, bottom: y };
      const inside = x >= targetBounds.left && x <= targetBounds.right
        && y >= targetBounds.top && y <= targetBounds.bottom;
      const distance = inside ? Math.min(
        x - targetBounds.left,
        targetBounds.right - x,
        y - targetBounds.top,
        targetBounds.bottom - y,
      ) : Number.POSITIVE_INFINITY;
      if (distance < perimeterBand) {
        perimeterChangedPixels += 1;
        if (focusToken && afterPixel.slice(0, 3)
          .every((channel, index) => Math.abs(channel - focusToken[index]) <= 8)) {
          focusTokenPerimeterPixels += 1;
        }
      }
      if (samples.length < 24) {
        samples.push({ x, y, delta, before: beforePixel, after: afterPixel });
      }
    }
  }
  return {
    crop: { width: cropWidth, height: cropHeight, paddingCss, targetBounds, perimeterBand },
    nativeScale: beforeScale,
    changedPixels,
    perimeterChangedPixels,
    focusToken: afterTarget.focusTokens.focus2,
    focusTokenPerimeterPixels,
    maxChannelDelta,
    changedBounds,
    samples,
  };
}

/** Native wheel reveals a tool without scrollIntoView repairing outer geometry. */
async function revealFloatingTool(page, label) {
  const expression = `document.querySelector('[data-review-tools] [aria-label="${label}"]')`;
  for (let turn = 0; turn < 12; turn++) {
    const target = await floatingControlSnapshot(page, expression);
    if (target.inPalette && target.inPanel && target.inScroller && target.hits.every(Boolean)) return target;
    const wheel = await evaluate(page, `(() => {
      const node = ${expression}, toolbar = node.closest('[role="toolbar"]');
      const a = node.getBoundingClientRect(), b = toolbar.getBoundingClientRect();
      const hit = document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {x:b.x+b.width/2,y:b.y+b.height/2,top:toolbar.scrollTop,
        exposed:hit && (hit === toolbar || toolbar.contains(hit)),
        delta:a.y+a.height/2-b.y-b.height/2};
    })()`);
    assert.ok(wheel.exposed, 'native wheel must target the palette, not a disclosure backdrop');
    await page.send('Input.dispatchMouseEvent', {type:'mouseMoved', x:wheel.x,y:wheel.y});
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseWheel', x:wheel.x,y:wheel.y,deltaX:0,deltaY:wheel.delta,
    });
    let prior = wheel.top, stable = 0, moved = false;
    await until(async () => {
      const top = await evaluate(page, `document.querySelector('[data-review-tools] [role="toolbar"]').scrollTop`);
      moved ||= top !== wheel.top;
      stable = top === prior ? stable + 1 : 0;
      prior = top;
      return moved && stable >= 3;
    }, `native palette scroll settled for ${label}`);
  }
  assert.fail(`Native palette scroll did not wholly reveal ${label}`);
}

/** @param {import('node:test').TestContext} context */
function browserReady(context) {
  const failOrSkip = (message) => {
    if (REQUIRED) assert.fail(`Required T011 browser coverage: ${message}`);
    context.skip(message);
    return false;
  };
  try {
    fs.accessSync(BROWSER, fs.constants.X_OK);
  } catch {
    if (process.env.DUDE_CANVAS_BROWSER !== undefined) {
      assert.fail(`Browser is not executable at ${BROWSER}.`);
    }
    return failOrSkip(`Browser is not executable at ${BROWSER}.`);
  }
  if (typeof globalThis.WebSocket !== 'function') {
    return failOrSkip('Global WebSocket is unavailable; use the supported Node runtime.');
  }
  if (!fs.existsSync(path.join(HERE, 'node_modules', '@fluentui', 'react-components', 'package.json'))) {
    return failOrSkip('Existing scoped Fluent dependencies are unavailable.');
  }
  return true;
}

test('T011 browser: published blank capture, ordinary-chat refresh, local state, root identity, and responsive shell', {
  timeout: 240_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't011-blank');
  const board = installEmptyBoard();
  const owned = [];
  let browserState;
  let movedRoot = null;
  const runtimeErrors = [];
  const network = [];
  try {
    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      network.push({ method: event.request.method, url: event.request.url });
    });

    const blankRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-blank-'));
    const blank = await createFixture(blankRoot);
    owned.push(blank);

    // Arrange + Act: the production page starts from a genuinely empty root.
    await navigate(page, blank, 360, 'light');

    // Assert the approved stable shell, not the removed Now rail/dual chooser.
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[role=tab]')].map((node) => node.innerText.trim())`),
      ['Overview', 'Now', 'Needs you', 'New idea']);
    assert.equal(await evaluate(page, `document.querySelectorAll('[role=tab]').length`), 4);
    assert.equal(await evaluate(page, `document.body.innerText.includes('Details')
      || document.body.innerText.includes('Browse features')`), false);
    await visible(page, 'Welcome to Dude');
    assert.equal(blank.instance.eventClients.size, 1, 'StrictMode leaves exactly one live EventSource');
    const blankEventSources = blank.instance.eventClients.size;

    for (const theme of ['light', 'dark']) {
      for (const width of [360, 768, 1440]) {
        await viewport(page, width, /** @type {'light'|'dark'} */ (theme));
        await audit(page, output, `blank-overview-${width}-${theme}`);
      }
    }

    await viewport(page, 360, 'light');
    await click(page, button('New idea'));
    const limit = blank.provider.read().limits.textBytes;
    const oversized = 'é'.repeat(limit);
    await fill(page, field('Your idea'), oversized);
    await click(page, button('Save'));
    await visible(page, 'UTF-8 byte limit');
    assert.equal(blank.provider.read().captures.length, 0,
      'client byte validation refuses before receipt preparation');
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), oversized);

    const literal = '  A new\u00a0idea\n\nKeep this *literal* wording.  ';
    await fill(page, field('Your idea'), literal);
    await click(page, button('Cancel'));
    await visible(page, 'No current requests from the joined owner');
    assert.equal(await evaluate(page, `document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim()`), 'Needs you');
    await click(page, button('New idea'));
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), literal,
      'Cancel is local navigation and retains the in-tab draft');

    for (const theme of ['light', 'dark']) {
      for (const width of [360, 768, 1440]) {
        await viewport(page, width, /** @type {'light'|'dark'} */ (theme));
        assert.equal(await evaluate(page, `${field('Your idea')}.value`), literal);
        await audit(page, output, `new-idea-${width}-${theme}`);
      }
    }
    await viewport(page, 360, 'light');
    await click(page, button('Save'));
    await until(() => blank.sends.length === 1, 'one same-session capture send');
    await visible(page, 'Awaiting acknowledgment');
    const captured = blank.provider.read().captures.find((item) => item.intent === literal);
    assert.ok(captured);
    assert.equal(captured.continuation, 'capture_only');
    assert.equal(captured.saved, false, 'transport delivery is not optimistic Saved state');
    const canonical = createIdea(blank.root, 1, 'literal-capture');
    const canonicalSource = {
      kind: 'file',
      path: canonical.ideaPath,
      revision: hash(fs.readFileSync(path.join(blank.root, ...canonical.ideaPath.split('/')))),
    };
    await acknowledge(blank, captured.receipt, 'applied', canonicalSource);
    await visible(page, 'Idea saved');
    await click(page, button('Overview'));
    await visible(page, 'literal capture');

    // Ordinary chat publication has no waiter and no manual Refresh. Preserve
    // finder query and an unrelated local draft while the work index rereads.
    await fill(page, field('Search work'), 'ordinary');
    await visible(page, 'No matching work');
    await click(page, button('New idea'));
    const unsent = '  Unsent\u00a0draft\n\nmust survive publication.  ';
    await fill(page, field('Your idea'), unsent);
    createIdea(blank.root, 2, 'ordinary-chat-publication');
    const workReadsBefore = network.filter(({ url }) => url.endsWith('/api/work-index')).length;
    blank.provider.onEvent({
      id: randomUUID(),
      type: 'session.idle',
      data: { aborted: false },
    });
    await until(
      () => network.filter(({ url }) => url.endsWith('/api/work-index')).length > workReadsBefore,
      'workspace SSE work-index reread',
    );
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), unsent);
    await click(page, button('Overview'));
    assert.equal(await evaluate(page, `${field('Search work')}.value`), 'ordinary');
    await visible(page, 'ordinary chat publication');

    // Explicit New idea preparation must lose atomically if a waiter arrives
    // at the actual HTTP boundary.
    await click(page, button('New idea'));
    const brainstorm = '  Continue brainstorming\u00a0this.\n\nKeep bytes.  ';
    await fill(page, field('Your idea'), brainstorm);
    blank.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    let paused = null;
    page.on('Fetch.requestPaused', (event) => {
      if (event.request.url.endsWith('/api/needs-you/capture-receipt')) paused = event;
    });
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/needs-you/capture-receipt', requestStage: 'Request' }],
    });
    const capturesBeforeRace = blank.provider.read().captures.length;
    await click(page, button('Submit'));
    await until(() => paused, 'paused capture preparation request');
    const racingRequest = requestFor(blank, 'fact', { input: { kind: 'text' } });
    racingRequest.prompt = 'Waiter admitted during New idea preparation';
    const racing = await publish(blank, racingRequest);
    await page.send('Fetch.continueRequest', { requestId: paused.requestId });
    await page.send('Fetch.disable');
    await visible(page, 'no waiting request');
    assert.equal(blank.provider.read().captures.length, capturesBeforeRace,
      'the raced explicit-null preparation leaves no unused receipt');
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), brainstorm);
    racing.controller.abort();
    const racedResult = JSON.parse((await racing.result).textResultForLlm);
    assert.equal(racedResult.status, 'cancelled');

    blank.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await click(page, button('Submit'));
    await until(() => blank.sends.length === 2, 'one later explicit brainstorm send');
    const brainstormCapture = blank.provider.read().captures.find((item) => item.intent === brainstorm);
    assert.equal(brainstormCapture.continuation, 'brainstorm');
    assert.equal(blank.sends.length, 2, 'failed preparation was never replayed');

    // Missing coverage is not a root replacement. Once a different inode is
    // proven, presentation resets rather than carrying the old workspace.
    const transientRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-root-'));
    const transient = await createFixture(transientRoot);
    owned.push(transient);
    await navigate(page, transient, 768, 'light');
    await click(page, button('New idea'));
    const rootDraft = 'Keep this draft while the root is temporarily missing.';
    await fill(page, field('Your idea'), rootDraft);
    movedRoot = `${transient.root}-original`;
    fs.renameSync(transient.root, movedRoot);
    await click(page, button('Refresh'));
    await visible(page, 'Current request coverage unavailable');
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), rootDraft);
    fs.mkdirSync(transient.root);
    await click(page, button('Refresh'));
    await until(() => evaluate(page, `document.querySelector('h1')?.textContent === 'Overview'`), 'replacement root reset');
    await click(page, button('New idea'));
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), '');

    assert.deepEqual(runtimeErrors, [], 'the published app raised no browser runtime exception');
    const foreign = network.filter(({ url }) => {
      const parsed = new URL(url);
      return parsed.protocol.startsWith('http') && !owned.some((fixture) => parsed.origin === new URL(fixture.instance.url).origin);
    });
    assert.deepEqual(foreign, [], 'the UI made no third-party network request');
    output.results.push({
      case: 'blank-capture-publication-root',
      pass: true,
      browser: browserState.version.Browser,
      activeEventSourcesWhileMounted: blankEventSources,
      networkRequests: network.length,
    });
  } finally {
    for (const fixture of owned.reverse()) {
      await fixture.close({ removeRoot: fs.existsSync(fixture.root) });
    }
    if (movedRoot) fs.rmSync(movedRoot, { recursive: true, force: true });
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T002 production shell: one numbered finder, selected-only Overview, Clear, races, and rail modes', {
  timeout: 300_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't002-shell-finder');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  const runtimeErrors = [];
  const network = [];
  const observations = {};
  try {
    // Arrange: 62 admitted records include exactly 50 feature packages. Five
    // completed features and one resolved idea make the initial Open count 56.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t002-shell-'));
    const records = [];
    for (let number = 1; number <= 62; number += 1) {
      const id = String(number).padStart(3, '0');
      const slug = number === 1 ? 'zulu-record-001'
        : number === 2 ? 'alpha-record-002'
          : `record-${id}`;
      const status = number <= 50 ? 'defined' : number === 62 ? 'resolved' : 'draft';
      const tasks = number <= 50 && number % 10 === 0
        ? `# Tasks\n\n- [x] T001@${id}aaaaa Completed instruction for ${slug}.\n`
        : null;
      records.push(createIdea(root, number, slug, status, tasks));
    }
    assert.equal(fs.readdirSync(path.join(root, '.dude', 'specs')).length, 50);
    fixture = await createFixture(root);
    const request = requestFor(fixture, 'fact', { input: { kind: 'text' } });
    request.prompt = 'Retain this request draft across work lookup changes';
    publication = await publish(fixture, request);
    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (!event.request.url.startsWith(fixture.instance.url)) return;
      network.push({
        method: event.request.method,
        path: new URL(event.request.url).pathname,
        body: event.request.postData ?? null,
      });
    });

    // Act: open the actual committed bundle through the production server.
    await navigate(page, fixture, 1440, 'light');

    // Assert: the App-owned selector starts Overview/Open/unselected and has
    // one native search input, one Show control, and numeric capture order.
    await visible(page, '56 of 62 recorded ideas and features');
    assert.equal(await evaluate(page, `document.querySelector('[role=tab][aria-selected=true]')?.innerText.trim()`), 'Overview');
    assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'Open');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-selector]').length`), 1);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-selector] input[type=search]').length`), 1);
    assert.equal(await evaluate(page, `document.querySelectorAll('input[type=search]').length`), 1);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Working on"]'))`), false);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Clear work selection"]'))`), false);
    const initialPaths = await evaluate(page, `[...document.querySelectorAll('[data-work-path]')]
      .map(node => node.getAttribute('data-work-path'))`);
    assert.equal(initialPaths.length, 56);
    assert.deepEqual(initialPaths.slice(0, 3), [
      '.dude/ideas/001-zulu-record-001.md',
      '.dude/ideas/002-alpha-record-002.md',
      '.dude/ideas/003-record-003.md',
    ], 'capture chronology wins even when titles would sort alphabetically');
    assert.equal(initialPaths.includes('.dude/ideas/010-record-010.md'), false);
    assert.equal(await evaluate(page, `document.querySelectorAll('[aria-current=true][data-work-path]').length`), 0);

    // Arrange retained local state that Clear must not own.
    await click(page, button('New idea'));
    const ideaDraft = '  New idea text survives Clear.\n\nExact bytes.  ';
    await fill(page, field('Your idea'), ideaDraft);
    await click(page, button('Needs you'));
    await click(page, `[...document.querySelectorAll('button')].find(node =>
      node.innerText.includes(${JSON.stringify(request.prompt)}) && node.getClientRects().length)`);
    const requestDraft = '  Request draft survives Clear.\n\nExact bytes.  ';
    await fill(page, field('Your response'), requestDraft);
    await click(page, button('Overview'));

    // Act: set a narrowed, queried, scrolled, and roved lookup, then navigate
    // without committing it.
    await fill(page, field('Search work'), 'record');
    await evaluate(page, `document.querySelector('[data-work-scroll]').scrollTop = 560`);
    await until(() => evaluate(page, `(() => {
      const list = document.querySelector('[data-work-scroll]');
      return list?.scrollTop > 0;
    })()`), 'scrolled unselected finder');
    await evaluate(page, `document.querySelector('[data-work-path=".dude/ideas/031-record-031.md"]').focus()`);
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('data-work-path')`),
      '.dude/ideas/031-record-031.md');
    const retainedLookup = await until(() => evaluate(page, `(() => {
      const list = document.querySelector('[data-work-scroll]');
      return list?.scrollTop > 0 ? { scrollTop: list.scrollTop } : null;
    })()`), 'settled roved finder position');
    await click(page, button('Now'));
    await visible(page, 'No record is selected');
    assert.equal(await evaluate(page, `${field('Search work')}.value`), 'record');
    assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'Open');
    await click(page, button('Back to Overview'));
    assert.equal(await evaluate(page, `document.querySelector('[data-work-scroll]').scrollTop`), retainedLookup.scrollTop);
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('data-work-path')`),
      '.dude/ideas/031-record-031.md');
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Working on"]'))`), false,
      'roving through results does not implicitly select work');

    // Act: All exposes the complete inventory. Native arrow navigation reaches
    // the last rendered row and scrolls the bounded list without selecting it.
    await fill(page, field('Search work'), '');
    await choose(page, 'Show', 'All');
    await visible(page, '62 of 62 recorded ideas and features');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    for (let index = 1; index < 62; index += 1) await pressNavigationKey(page, 'ArrowDown');
    const terminalRow = await evaluate(page, `(() => {
      const list = document.querySelector('[data-work-scroll]');
      return {
        activePath: document.activeElement?.getAttribute('data-work-path'),
        activeLabel: document.activeElement?.getAttribute('aria-label'),
        scrollTop: list?.scrollTop ?? 0,
        currentRows: document.querySelectorAll('[aria-current=true][data-work-path]').length,
      };
    })()`);
    assert.equal(terminalRow.activePath, '.dude/ideas/062-record-062.md');
    assert.match(terminalRow.activeLabel, /^062\. record 062\. Resolved idea\. Progress not established\. \.dude\/ideas\/062-record-062\.md$/);
    assert.ok(terminalRow.scrollTop > 0);
    assert.equal(terminalRow.currentRows, 0);
    await fill(page, field('Search work'), '062');
    await visible(page, '1 of 62 recorded ideas and features');
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-work-path]')]
      .map(node => node.getAttribute('data-work-path'))`), ['.dude/ideas/062-record-062.md']);

    // Arrange the exact pre-Clear state again, then commit one row with Enter.
    await fill(page, field('Search work'), 'record');
    await choose(page, 'Show', 'Open');
    await evaluate(page, `document.querySelector('[data-work-scroll]').scrollTop = 480`);
    await until(() => evaluate(page, `document.querySelector('[data-work-scroll]').scrollTop > 0`),
      'queried Open finder scroll before selection');
    await evaluate(page, `document.querySelector('[data-work-path=".dude/ideas/031-record-031.md"]').focus()`);
    const targetReadsBefore = network.filter(entry => entry.path === '/api/refresh'
      && JSON.parse(entry.body || '{}').target === '.dude/ideas/031-record-031.md').length;
    await press(page, 'Enter');
    await visible(page, 'Current instruction for record-031');
    assert.equal(network.filter(entry => entry.path === '/api/refresh'
      && JSON.parse(entry.body || '{}').target === '.dude/ideas/031-record-031.md').length,
    targetReadsBefore + 1, 'one activation starts one selected-target read');
    assert.equal(await evaluate(page, `document.querySelectorAll('input[type=search]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelectorAll('[aria-label="Working on"]').length`), 1);
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Working on"]')?.innerText.includes('031')`), true);
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Working on"]')?.innerText.includes('record 031')`), true);
    for (const destination of ['needs', 'new']) {
      await click(page, `document.querySelector('#dude-tab-${destination}')`);
      assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-selector] input[type=search]').length`), 0);
      assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-selector] [role=combobox]').length`), 0);
      const identityLabel = destination === 'needs' ? 'Browsing' : 'Working on';
      assert.equal(await evaluate(page, `document.querySelectorAll(
        '[data-work-selector] [aria-label="${identityLabel}"]'
      ).length`), 1);
      assert.equal(await evaluate(page, `document.querySelector(
        '[data-work-selector] [aria-label="${identityLabel}"]'
      )?.innerText.includes('031')`), true,
      `${identityLabel} retains selected work 031 while the displayed surface owns its own scope`);
    }
    await click(page, `document.querySelector('#dude-tab-context')`);
    await visible(page, 'Current instruction for record-031');

    // Assert selected Overview is the same exact record, never a global list.
    await click(page, button('Overview'));
    await visible(page, '1 selected record');
    const selectedOverview = await evaluate(page, `(() => {
      const rows = [...document.querySelectorAll('[data-work-path]')];
      return {
        paths: rows.map(node => node.getAttribute('data-work-path')),
        labels: rows.map(node => node.getAttribute('aria-label')),
        current: rows.map(node => node.getAttribute('aria-current')),
        search: document.querySelectorAll('input[type=search]').length,
        show: document.querySelectorAll('[data-work-selector] [role=combobox]').length,
        nothingSelected: document.body.innerText.includes('Nothing is selected'),
      };
    })()`);
    assert.deepEqual(selectedOverview.paths, ['.dude/ideas/031-record-031.md']);
    assert.deepEqual(selectedOverview.current, ['true']);
    assert.match(selectedOverview.labels[0], /^031\. record 031\. In progress\. 0 of 1 tasks\. \.dude\/ideas\/031-record-031\.md$/);
    assert.equal(selectedOverview.search, 0);
    assert.equal(selectedOverview.show, 0);
    assert.equal(selectedOverview.nothingSelected, false);
    await audit(page, output, 't002-selected-overview-1440-light');
    await viewport(page, 1440, 'dark');
    await audit(page, output, 't002-selected-overview-1440-dark');
    await viewport(page, 1440, 'light');
    const targetReadsBeforeReopen = network.filter(entry => entry.path === '/api/refresh'
      && JSON.parse(entry.body || '{}').target === '.dude/ideas/031-record-031.md').length;
    await click(page, `document.querySelector('[data-work-path=".dude/ideas/031-record-031.md"]')`);
    await visible(page, 'Current instruction for record-031');
    assert.equal(network.filter(entry => entry.path === '/api/refresh'
      && JSON.parse(entry.body || '{}').target === '.dude/ideas/031-record-031.md').length,
    targetReadsBeforeReopen, 'reopening the same selected row does not create another selected object read');
    await click(page, button('Back to Overview'));

    // Act + Assert: Clear owns only lookup state and focuses the same search.
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    assert.equal(await evaluate(page, `${field('Search work')}.value`), '');
    assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'All');
    assert.equal(await evaluate(page, `document.querySelector('[data-work-scroll]').scrollTop`), 0);
    assert.equal(await evaluate(page, `document.activeElement === ${field('Search work')}`), true);
    await pressNavigationKey(page, 'ArrowDown');
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('data-work-path')`),
      '.dude/ideas/001-zulu-record-001.md', 'Clear resets the roving position to the first capture');
    await click(page, button('Needs you'));
    assert.equal(await evaluate(page, `${field('Your response')}.value`), requestDraft);
    assert.equal(fixture.provider.read().requests.find(entry =>
      entry.request.requestRef === request.requestRef).phase, 'pending');
    await click(page, button('New idea'));
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), ideaDraft);
    await click(page, button('Overview'));

    // Act: hold A's selected projection, explicitly Clear, select B, then
    // release A. The data epochs may retain A's read but cannot adopt it as B.
    await fill(page, field('Search work'), '033');
    let heldA = null;
    page.on('Fetch.requestPaused', event => {
      if (event.request.url.endsWith('/api/refresh')) heldA = event;
    });
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/refresh', requestStage: 'Response' }],
    });
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await until(() => heldA, 'held selected A projection');
    await click(page, button('Back to Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '034');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    const selected034 = await until(() => evaluate(page, `(() => {
      const heading = document.querySelector('h1');
      if (heading?.textContent.replace(/\\s+/g, ' ').trim() !== '034 record 034') return null;
      const spans = [...heading.querySelectorAll(':scope > span')];
      const source = [...document.querySelectorAll('main *')].find(node =>
        node.childElementCount === 0
        && node.textContent.trim() === '.dude/specs/034-record-034/spec.md');
      return {
        accessibleTextIdentity: heading.textContent.replace(/\\s+/g, ' ').trim(),
        renderedText: heading.innerText,
        number: spans[0]?.textContent.trim() || null,
        title: spans[1]?.textContent.trim() || null,
        sourcePath: source?.textContent.trim() || null,
      };
    })()`), '034 selected heading identity');
    assert.match(selected034.renderedText, /^034\s+record 034$/,
      'visual wrapping may insert a line break but cannot concatenate or drop heading content');
    assert.deepEqual({
      accessibleTextIdentity: selected034.accessibleTextIdentity,
      number: selected034.number,
      title: selected034.title,
      sourcePath: selected034.sourcePath,
    }, {
      accessibleTextIdentity: '034 record 034',
      number: '034',
      title: 'record 034',
      sourcePath: '.dude/specs/034-record-034/spec.md',
    }, 'the object heading may wrap between number and title without changing its text identity');
    assert.equal(await evaluate(page, `document.body.innerText.includes('Current instruction for record-033')`), false);
    await page.send('Fetch.continueRequest', { requestId: heldA.requestId });
    await page.send('Fetch.disable');
    await visible(page, 'Current instruction for record-034');
    assert.equal(await evaluate(page, `document.body.innerText.includes('Current instruction for record-033')`), false);

    // Act: malformed selected work withholds progress/instruction but retains
    // the exact committed identity and selected-only Overview.
    const malformedTasks = path.join(root, '.dude', 'specs', '034-record-034', 'tasks.md');
    fs.writeFileSync(malformedTasks, '# Tasks\n\n- [?] T001@034aaaaa Invalid state.\n');
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await visible(page, 'Current instruction unavailable');
    assert.deepEqual(await evaluate(page, `(() => {
      const heading = document.querySelector('h1');
      const spans = [...heading.querySelectorAll(':scope > span')];
      return {
        textIdentity: heading.textContent.replace(/\\s+/g, ' ').trim(),
        number: spans[0]?.textContent.trim() || null,
        title: spans[1]?.textContent.trim() || null,
        sourcePathPresent: [...document.querySelectorAll('main *')].some(node =>
          node.childElementCount === 0
          && node.textContent.trim() === '.dude/specs/034-record-034/spec.md'),
      };
    })()`), {
      textIdentity: '034 record 034',
      number: '034',
      title: 'record 034',
      sourcePathPresent: true,
    });
    assert.equal(await evaluate(page, `document.querySelectorAll('input[type=search]').length`), 0);
    await click(page, button('Overview'));
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-work-path]')]
      .map(node => node.getAttribute('data-work-path'))`), ['.dude/ideas/034-record-034.md']);
    fs.writeFileSync(malformedTasks, '# Tasks\n\n- [~] T001@034aaaaa Current instruction for record-034.\n');
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await click(page, button('Now'));
    await visible(page, 'Current instruction for record-034');

    // Act: fail one selected-target response. Selection is still explicit and
    // cannot fall back to the prior record while the read is unavailable.
    await click(page, button('Back to Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '035');
    let failedTarget = null;
    page.on('Fetch.requestPaused', event => {
      if (event.request.url.endsWith('/api/refresh')) failedTarget = event;
    });
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/refresh', requestStage: 'Response' }],
    });
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await until(() => failedTarget, 'selected target response to fail');
    await page.send('Fetch.failRequest', { requestId: failedTarget.requestId, errorReason: 'ConnectionReset' });
    await page.send('Fetch.disable');
    await visible(page, 'Current instruction unavailable');
    assert.equal(await evaluate(page, `document.querySelector('h1')?.textContent
      .replace(/\\s+/g, ' ').trim()`), '035 record 035');
    assert.equal(await evaluate(page, `document.body.innerText.includes('Current instruction for record-034')`), false);
    await click(page, button('Refresh'));
    await visible(page, 'Current instruction for record-035');

    // Act: remove the selected source and add a same-title record elsewhere.
    // The retained commitment must not become a title-based global fallback.
    await click(page, button('Back to Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '038');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await visible(page, 'Current instruction for record-038');
    fs.rmSync(path.join(root, '.dude', 'ideas', '038-record-038.md'));
    fs.rmSync(path.join(root, '.dude', 'specs', '038-record-038'), { recursive: true });
    createIdea(root, 99, 'record-038', 'defined');
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await visible(page, 'The selected source is unavailable');
    assert.equal(await evaluate(page, `document.querySelector('h1')?.textContent
      .replace(/\\s+/g, ' ').trim()`), '038 record 038');
    assert.equal(await evaluate(page, `document.body.innerText.includes('.dude/ideas/038-record-038.md')`), true);
    assert.equal(await evaluate(page, `document.body.innerText.includes('.dude/ideas/099-record-038.md')`), false);
    await click(page, button('Overview'));
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-path]').length`), 0,
      'selected Overview never exposes replacement or global rows when its source disappears');
    assert.equal(await evaluate(page, `document.body.innerText.includes('.dude/ideas/038-record-038.md')`), true);
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await visible(page, '62 of 62 recorded ideas and features');

    // Assert desktop disclosure is inline and nonmodal. Native Tab from the
    // final rail destination proceeds into ordinary page content.
    const tabs = await evaluate(page, `[...document.querySelectorAll('[role=tab]')].map(node => ({
      text: node.innerText.trim(), current: node.getAttribute('aria-current')
    }))`);
    assert.deepEqual(tabs.map(({ text }) => text), ['Overview', 'Now', 'Needs you', 'New idea']);
    assert.equal(tabs.filter(({ current }) => current === 'page').length, 1);
    assert.equal(await evaluate(page, `document.body.innerText.includes('Settings')
      || document.body.innerText.includes('Switch work')
      || document.body.innerText.includes('Kanban')`), false);
    assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width`), 48);
    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width`), 208);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-navigation-dialog]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelector('main').inert`), false);
    await audit(page, output, 't002-navigation-expanded-1440-light');
    await evaluate(page, `document.querySelector('#dude-tab-new').focus()`);
    await pressNavigationKey(page, 'Tab');
    assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').contains(document.activeElement)`), false,
      'desktop rail does not trap normal Tab navigation');
    await click(page, `document.querySelector('[aria-label="Collapse navigation pane"]')`);
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`), 'Expand navigation pane');

    // Assert narrow disclosure is a 260px modal, inerts existing and newly
    // portaled background, and traps both Tab directions.
    await viewport(page, 719, 'light');
    assert.equal(await evaluate(page, `Math.round(document.querySelector('[data-navigation-pane]').getBoundingClientRect().height)`), 49);
    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    await until(() => evaluate(page, `Boolean(document.querySelector('[data-navigation-dialog]'))`),
      'narrow navigation dialog');
    assert.equal(await evaluate(page, `Math.round(document.querySelector('[data-navigation-dialog]').getBoundingClientRect().width)`), 260);
    assert.equal(await evaluate(page, `document.querySelector('header').inert
      && document.querySelector('main').inert && document.querySelector('footer').inert`), true);
    await evaluate(page, `(() => {
      const portal = document.createElement('div');
      portal.dataset.t002Portal = 'true';
      portal.innerHTML = '<button style="min-width:24px;min-height:24px">Portaled background control</button>';
      document.body.append(portal);
    })()`);
    await until(() => evaluate(page, `document.querySelector('[data-t002-portal]').inert`),
      'newly inserted background portal made inert');
    await audit(page, output, 't002-navigation-overlay-719-light');
    for (const shift of [false, true]) {
      await pressNavigationKey(page, 'Tab', 'Tab', shift ? 8 : 0);
      assert.equal(await evaluate(page, `document.querySelector('[data-navigation-dialog]').contains(document.activeElement)`), true);
    }
    await press(page, 'Escape');
    await until(() => evaluate(page, `!document.querySelector('[data-navigation-dialog]')`), 'Escape closes navigation');
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`), 'Expand navigation pane');
    assert.equal(await evaluate(page, `document.querySelector('header').inert
      || document.querySelector('main').inert || document.querySelector('footer').inert
      || document.querySelector('[data-t002-portal]').inert`), false);

    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    await click(page, `document.querySelector('[aria-label="Close navigation pane"]')`);
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`), 'Expand navigation pane');
    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    await click(page, `document.querySelector('[data-navigation-dimmer]')`);
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`), 'Expand navigation pane');
    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    await click(page, `document.querySelector('[data-navigation-dialog] #dude-tab-needs')`);
    await visible(page, request.prompt);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-navigation-dialog]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelector('[role=tab][aria-selected=true]')?.innerText.trim()`), 'Needs you');
    await until(() => evaluate(page, `document.activeElement === document.querySelector(
      '#dude-panel-needs h1'
    )`), 'narrow destination focuses its real view heading');
    await click(page, button('Overview'));

    // Breakpoint dismissal shares the same toggle focus restoration in both
    // directions and treats exactly 720 CSS px as desktop.
    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    await viewport(page, 720, 'light');
    await until(() => evaluate(page, `!document.querySelector('[data-navigation-dialog]')
      && document.activeElement?.getAttribute('aria-label') === 'Expand navigation pane'`),
    '719 to 720 navigation dismissal');
    assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width`), 48);
    await click(page, `document.querySelector('[aria-label="Expand navigation pane"]')`);
    assert.equal(await evaluate(page, `document.querySelector('[data-navigation-pane]').getBoundingClientRect().width`), 208);
    await viewport(page, 719, 'light');
    await until(() => evaluate(page, `!document.querySelector('[data-navigation-dialog]')
      && document.activeElement?.getAttribute('aria-label') === 'Expand navigation pane'`),
    '720 to 719 navigation dismissal');

    // Fresh rendered screenshots, AX trees, geometry, and computed contrast
    // bind the approved T002 elements across themes and supported widths.
    await evaluate(page, `document.querySelector('[data-t002-portal]')?.remove()`);
    const visualMatrix = [];
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      for (const width of [360, 768, 1440, 1920]) {
        await viewport(page, width, theme);
        await audit(page, output, `t002-overview-${width}-${theme}`);
        visualMatrix.push({ width, theme });
      }
    }
    await viewport(page, 720, 'light', 900, 2);
    assert.equal(await evaluate(page, `devicePixelRatio`), 2);
    await audit(page, output, 't002-overview-720-dpr2-light');
    await page.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'dark' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await until(() => evaluate(page, `getComputedStyle(document.querySelector('.fui-FluentProvider'))
      .getPropertyValue('--colorNeutralForeground1').trim() === '#ffffff'`), 'dark reduced-motion theme');
    const reducedDuration = await evaluate(page, `getComputedStyle(
      document.querySelector('[data-navigation-pane]')
    ).transitionDuration`);
    assert.ok(Number.parseFloat(reducedDuration) <= 0.001,
      `reduced motion keeps rail transitions effectively immediate, got ${reducedDuration}`);
    await audit(page, output, 't002-overview-720-dpr2-reduced-motion-dark');

    const approvedPath = path.join(
      ROOT,
      '.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html',
    );
    const approvedSha256 = sha256(fs.readFileSync(approvedPath));
    assert.equal(approvedSha256, '1508fe1efaf6a5228784dee8c140a569927bf27eb1dfc9244679b6ae80ec2962');
    assert.deepEqual(runtimeErrors, []);
    assert.equal(fixture.instance.eventClients.size, 1);
    assert.deepEqual(
      [...new Set(network.map(({ path: pathname }) => pathname)
        .filter(pathname => /settings|kanban|task-(?:write|mutate)|workflow/i.test(pathname)))],
      [],
      'the T002 journey invokes no future destination or task-mutation route',
    );
    Object.assign(observations, {
      records: 62,
      packages: 50,
      initialOpen: 56,
      retainedLookup,
      terminalRow,
      selectedOverview,
      localState: { requestDraftRetained: true, ideaDraftRetained: true },
      races: { lateARejectedForB: true, failedTargetRetainedIdentity: true },
      unavailable: { retained: records[37].ideaPath, replacement: '.dude/ideas/099-record-038.md' },
      rail: { desktop: [48, 208], compactRow: 49, narrowOverlay: 260, breakpoint: 720 },
      visualMatrix,
      scale: { devicePixelRatio: 2, nativeZoomClaimed: false, reducedMotion: true },
      approvedDesign: { path: path.relative(ROOT, approvedPath), sha256: approvedSha256 },
      browser: browserState.version.Browser,
      networkRequests: network.length,
    });
    output.results.push({ case: 't002-production-shell-finder', pass: true, ...observations });
  } finally {
    publication?.controller.abort();
    if (publication) await publication.result.catch(() => {});
    if (browserState) await browserState.page.send('Fetch.disable').catch(() => {});
    if (fixture) await fixture.close();
    if (browserState) await cleanupBrowserDriver(browserState);
    board.close();
  }
});

test('T003 production Now: source-backed task detail, freshness guards, responsive focus, and retained local work', {
  timeout: 420_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't003-task-inspection');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let factPublication;
  let reviewPublication;
  let movedRoot = null;
  const runtimeErrors = [];
  const network = [];
  const observations = {};
  const activeKey = 'T002@b062d2e5';
  const allKeys = [
    'T001@a062c1d4',
    activeKey,
    'T003@c062e3f6',
    'T004@d062f4a7',
    'T005@e062a5b8',
  ];
  const title = 'Dude Canvas Workspace Integration — Long Literal Source Title';
  const activeUnit = marker => [
    `- [~] ${activeKey} Apply the approved shell and finder`,
    '    deps: T001@a062c1d4',
    '',
    `Literal current body ${marker} keeps CRLF, Unicode café — 東京, and every blank paragraph.`,
    '',
    '<script>globalThis.__t003SourceExecuted = true</script>',
    '',
    '```js',
    'const literal = "<button>Run</button>";',
    '- [ ] T999@fenced99 Fenced task lookalike',
    '```',
    '',
    '<!--',
    '## Hidden source heading',
    '- [!] T998@hidden98 Comment-hidden task lookalike',
    '-->',
    '',
    'Acceptance:',
    '  - keep the complete unit as inert source text',
    '  - never infer a verification result from this wording',
    '',
    ...Array.from({ length: 34 }, (_unused, index) => (
      `Keyboard-scroll proof line ${String(index + 1).padStart(2, '0')} — ${'source '.repeat(9).trim()}`
    )),
    '',
  ].join('\r\n');
  const tasksSource = (marker, includeActive = true) => [
    '# Tasks\r\n\r\n',
    '## Phase 1: Establish The Integrated Design\r\n',
    '- [x] T001@a062c1d4 Establish the approved integrated design\r\n\r\n',
    'Recorded completion text is not a verification verdict.\r\n\r\n',
    ...(includeActive ? [
      '## Phase 2: Find And Select Work\r\n',
      activeUnit(marker),
    ] : []),
    '## Phase 3: Restore Selected-Feature Now Orientation\r\n',
    '- [!] T003@c062e3f6 Restore selected-feature Now orientation\r\n',
    `    deps: ${includeActive ? 'T002@b062d2e5' : 'T001@a062c1d4'}\r\n`,
    '    blocked-by: external-dependency: waiting for the isolated fixture\r\n\r\n',
    'Blocked source detail remains separate from dependency readiness.\r\n\r\n',
    '## Phase 4: Complete The Context-Preserving Interaction Loop\r\n',
    '- [ ] T004@d062f4a7 Complete the context-preserving interaction loop\r\n',
    '    deps: T001@a062c1d4\r\n\r\n',
    'Ready by recorded dependencies does not grant Work admission.\r\n\r\n',
    '## Phase 5: Verify The Installed Walkthrough\r\n',
    '- [ ] T005@e062a5b8 Verify the installed walkthrough\r\n',
    '    deps: T003@c062e3f6\r\n\r\n',
    'Waiting remains distinct from an explicit blocker.\r\n',
  ].join('');
  try {
    // Arrange: retain the 62-record/50-package production-scale fixture while
    // making 061 and 062 the two exact feature identities exercised below.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t003-now-'));
    let featureA;
    let featureB;
    for (let number = 1; number <= 62; number += 1) {
      if (number <= 48) {
        createIdea(root, number, `supporting-feature-${String(number).padStart(3, '0')}`, 'defined');
      } else if (number === 61) {
        featureB = createIdea(root, number, 'guard-feature-b', 'defined', [
          '# Tasks',
          '',
          '## Phase 1: Guard',
          '- [~] T001@bguard01 Guard feature B current task',
          '',
          'FEATURE-B-BODY must remain selected after delayed feature A data arrives.',
          '',
        ].join('\n'));
      } else if (number === 62) {
        featureA = createIdea(root, number, 'dude-canvas-workspace-integration', 'defined', tasksSource('SOURCE-A1'));
      } else {
        createIdea(root, number, `supporting-draft-${String(number).padStart(3, '0')}`);
      }
    }
    assert.ok(featureA?.specPath && featureB?.specPath);
    assert.equal(fs.readdirSync(path.join(root, '.dude', 'specs')).length, 50);
    const ideaPath = path.join(root, ...featureA.ideaPath.split('/'));
    const ideaBytes = fs.readFileSync(ideaPath, 'utf8')
      .replace('title: dude canvas workspace integration', `title: ${title}`)
      .concat('\n## Coordinator Log\n\n- 2026-09-16 UTC - Source-backed task inspection fixture was recorded.\n');
    fs.writeFileSync(ideaPath, ideaBytes);
    const preview = createPreview(root, /** @type {any} */ (featureA));
    fixture = await createFixture(root);
    const factRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } });
    factRequest.prompt = 'T003 retained request draft';
    factPublication = await publish(fixture, factRequest);
    const reviewRequest = requestFor(fixture, 'preview', preview, featureA);
    reviewRequest.prompt = 'T003 retained Review frame and caret';
    reviewPublication = await publish(fixture, reviewRequest);

    // The same real endpoints establish the count/source precondition before
    // the browser journey; no DTO or projection renderer is substituted.
    const [indexResponse, projectionResponse] = await Promise.all([
      fetch(new URL('/api/work-index', fixture.instance.url)),
      fetch(new URL('/api/refresh', fixture.instance.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: featureA.ideaPath }),
      }),
    ]);
    assert.equal(indexResponse.status, 200);
    assert.equal(projectionResponse.status, 200);
    const endpointIndex = await indexResponse.json();
    const endpointProjection = (await projectionResponse.json()).projection;
    const endpointRow = endpointIndex.items.find(item => item.ideaPath === featureA.ideaPath);
    const endpointTaskSource = endpointRow.sources.find(source => source.path.endsWith('/tasks.md'));
    assert.deepEqual(endpointRow.taskCounts, {
      total: 5, open: 2, inProgress: 1, blocked: 1, done: 1,
    });
    assert.deepEqual(endpointProjection.tasks, endpointRow.taskCounts);
    assert.equal(endpointProjection.taskDetails.items.length, 5);
    assert.equal(endpointProjection.taskDetails.items.find(task => task.taskKey === activeKey).instruction.text,
      activeUnit('SOURCE-A1'));
    assert.equal(
      endpointProjection.taskDetails.items.find(task => task.taskKey === activeKey).source.contentIdentity,
      endpointTaskSource.contentIdentity,
      'selected detail and work-index counts bind the same current task bytes',
    );

    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (!event.request.url.startsWith(fixture.instance.url)) return;
      network.push({
        method: event.request.method,
        path: new URL(event.request.url).pathname,
        body: event.request.postData ?? null,
      });
    });
    await navigate(page, fixture, 1440, 'light');

    // Arrange unrelated local request input before opening selected work.
    await click(page, button('Needs you'));
    await click(page, `[...document.querySelectorAll('button')].find(node =>
      node.innerText.includes('T003 retained request draft') && node.getClientRects().length)`);
    const requestDraft = '  Request draft survives task inspection.\n\nLiteral bytes.  ';
    await fill(page, field('Your response'), requestDraft);
    await click(page, button('Overview'));
    await fill(page, field('Search work'), '062');
    const targetReadsBefore = network.filter(entry => entry.path === '/api/refresh'
      && JSON.parse(entry.body || '{}').target === featureA.ideaPath).length;

    // Act: keyboard activation commits 062 once.
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await until(() => evaluate(page, `document.querySelector('h1')?.textContent
      .replace(/\\s+/g, ' ').trim() === ${JSON.stringify(`062 ${title}`)}`), 'T003 selected object heading');
    await visible(page, 'SOURCE-A1');

    // Assert source-backed identity, all five actual 062 task keys, default All,
    // unfiltered phase totals, and distinct recorded-state/readiness language.
    assert.equal(network.filter(entry => entry.path === '/api/refresh'
      && JSON.parse(entry.body || '{}').target === featureA.ideaPath).length,
    targetReadsBefore + 1, 'one selection activation starts one exact selected read');
    assert.deepEqual(await evaluate(page, `(() => {
      const heading = document.querySelector('h1');
      const spans = [...heading.querySelectorAll(':scope > span')];
      return {
        identity: heading.textContent.replace(/\\s+/g, ' ').trim(),
        number: spans[0]?.textContent.trim(),
        title: spans[1]?.textContent.trim(),
        sourcePath: [...document.querySelectorAll('main *')].some(node =>
          node.childElementCount === 0 && node.textContent.trim() === ${JSON.stringify(featureA.specPath)}),
      };
    })()`), {
      identity: `062 ${title}`,
      number: '062',
      title,
      sourcePath: true,
    });
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
      .map(node => node.getAttribute('data-task-key'))`), allKeys);
    assert.equal(await evaluate(page, `document.querySelector('[data-task-filter="all"]')
      ?.getAttribute('aria-pressed')`), 'true');
    const phaseTotals = await evaluate(page, `[...document.querySelectorAll('[data-task-phase]')].map(section => ({
      heading:section.getAttribute('data-task-phase'),
      total:[...section.querySelectorAll('*')].find(node =>
        /^\\d+ of \\d+ tasks complete$/.test(node.textContent.trim()))?.textContent.trim() || null,
    }))`);
    assert.deepEqual(phaseTotals.map(({ total }) => total), [
      '1 of 1 tasks complete',
      '0 of 1 tasks complete',
      '0 of 1 tasks complete',
      '0 of 1 tasks complete',
      '0 of 1 tasks complete',
    ]);
    const stateText = await evaluate(page, `Object.fromEntries([...document.querySelectorAll('[data-task-key]')]
      .map(node => [node.dataset.taskKey, node.innerText]))`);
    assert.match(stateText['T001@a062c1d4'], /Done/);
    assert.match(stateText[activeKey], /In progress/);
    assert.match(stateText['T003@c062e3f6'], /Blocked/);
    assert.match(stateText['T004@d062f4a7'], /Ready by recorded task dependencies/);
    assert.match(stateText['T005@e062a5b8'], /Waiting on dependencies/);
    assert.equal(await evaluate(page, `(() => {
      const next = document.querySelector('[data-now-next]');
      const full = [...next.querySelectorAll('p')].find(node => node.textContent === ${JSON.stringify(activeUnit('SOURCE-A1'))});
      return Boolean(full);
    })()`), true, 'Next renders the exact complete CRLF unit from the selected source');
    assert.equal(await evaluate(page, `globalThis.__t003SourceExecuted`), undefined);
    assert.equal(await evaluate(page, `[...document.scripts].some(node =>
      node.textContent.includes('__t003SourceExecuted'))`), false);
    assert.equal(await evaluate(page, `document.body.innerText.includes('<script>globalThis.__t003SourceExecuted = true</script>')`), true);
    assert.equal(await evaluate(page, `document.body.innerText.includes('T999@fenced99 Fenced task lookalike')`), true);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 5,
      'fenced and comment-hidden syntax never becomes a sixth production row');
    assert.equal(await evaluate(page, `(() => {
      const headings = [...document.querySelectorAll('h2')];
      const tasks = headings.find(node => node.textContent.trim() === 'Tasks');
      const activity = headings.find(node => node.textContent.trim() === 'Activity');
      return Boolean(tasks && activity && tasks !== activity && tasks.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING);
    })()`), true, 'Activity remains a separate region after Tasks');

    // Mutate only a test-owned HTTP companion response. Null counts must not
    // become a false zero, while an actual source-identity disagreement with
    // equal counts must withhold both rows and body.
    let pausedIndex = null;
    page.on('Fetch.requestPaused', event => {
      if (new URL(event.request.url).pathname === '/api/work-index') pausedIndex = event;
    });
    const mutateNextIndex = async (label, mutate) => {
      pausedIndex = null;
      await page.send('Fetch.enable', {
        patterns: [{ urlPattern: '*/api/work-index', requestStage: 'Response' }],
      });
      await click(page, button('Refresh'));
      const paused = await until(() => pausedIndex, `${label} work-index response`);
      try {
        const body = await page.send('Fetch.getResponseBody', { requestId: paused.requestId });
        const text = body.base64Encoded
          ? Buffer.from(body.body, 'base64').toString('utf8')
          : body.body;
        const value = JSON.parse(text);
        const row = value.items.find(item => item.ideaPath === featureA.ideaPath);
        const before = structuredClone(row);
        mutate(row);
        await page.send('Fetch.fulfillRequest', {
          requestId: paused.requestId,
          responseCode: paused.responseStatusCode,
          responseHeaders: (paused.responseHeaders || []).filter(header => (
            !['content-length', 'transfer-encoding'].includes(header.name.toLowerCase())
          )),
          body: Buffer.from(JSON.stringify(value)).toString('base64'),
        });
        return { before, after: structuredClone(row) };
      } finally {
        await page.send('Fetch.disable');
      }
    };
    const nullable = await mutateNextIndex('nullable-count', row => { row.taskCounts = null; });
    assert.deepEqual(nullable.before.taskCounts, endpointRow.taskCounts);
    assert.equal(nullable.after.taskCounts, null);
    await visible(page, 'SOURCE-A1');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 5,
      'a correctly nullable index count does not deny valid planned/selected detail');
    const mismatched = await mutateNextIndex('source-mismatch', row => {
      assert.deepEqual(row.taskCounts, endpointRow.taskCounts);
      const source = row.sources.find(item => item.path.endsWith('/tasks.md'));
      source.contentIdentity = `sha256:${'f'.repeat(64)}`;
    });
    assert.deepEqual(mismatched.after.taskCounts, mismatched.before.taskCounts,
      'the negative control changes identity without changing counts');
    assert.notEqual(
      mismatched.after.sources.find(source => source.path.endsWith('/tasks.md')).contentIdentity,
      mismatched.before.sources.find(source => source.path.endsWith('/tasks.md')).contentIdentity,
    );
    await visible(page, 'Current instruction unavailable');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 0);
    assert.equal(await evaluate(page, `document.body.innerText.includes('SOURCE-A1')`), false);
    assert.equal(await evaluate(page, `document.body.innerText.includes(
      'including source identities and task counts. Task progress and detail are withheld'
    )`), true, 'the equal-count negative control fails for the intended source-identity reason');
    await click(page, button('Refresh'));
    await visible(page, 'SOURCE-A1');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-task-key]').length`), 5);

    // Act: one keyboard activation opens the real read-only inspector. Repeated
    // activation focuses it; its full body scrolls by keyboard.
    await evaluate(page, `document.querySelector('[data-task-key="${activeKey}"]').focus()`);
    await press(page, 'Enter');
    await until(() => evaluate(page, `document.querySelector('[data-task-detail="${activeKey}"]')
      === document.activeElement`), 'focused T003 task inspector');
    assert.equal(await evaluate(page, `document.querySelector('[data-task-instruction="${activeKey}"]').textContent`),
      activeUnit('SOURCE-A1'));
    assert.equal(await evaluate(page, `document.querySelector('[data-task-detail="${activeKey}"]')
      .innerText.includes('Not exposed by this source.')`), true);
    assert.equal(await evaluate(page, `document.querySelector('[data-task-detail="${activeKey}"]')
      .innerText.includes('In progress is recorded state, not evidence that an agent is working now.')`), true);
    assert.equal(await evaluate(page, `[...document.querySelectorAll('button')].some(node =>
      ['Run','Retry','Mark done','Edit task'].includes(node.innerText.trim()))`), false);
    await evaluate(page, `document.querySelector('[data-task-key="${activeKey}"]').focus()`);
    await press(page, 'Enter');
    await until(() => evaluate(page, `document.querySelector('[data-task-detail="${activeKey}"]')
      === document.activeElement`), 'repeated activation refocuses the inspector');
    const wide = await evaluate(page, `(() => {
      const detail = document.querySelector('[data-task-detail="${activeKey}"]');
      const dock = detail.closest('aside');
      const source = detail.querySelector('[data-task-instruction]');
      return {
        inDock: Boolean(dock),
        inRow: Boolean(detail.closest('li')),
        dockWidth: dock?.getBoundingClientRect().width || 0,
        sourceScrollable: source.scrollHeight > source.clientHeight,
      };
    })()`);
    assert.equal(wide.inDock, true);
    assert.equal(wide.inRow, false);
    assert.ok(Math.abs(wide.dockWidth - 320) <= 1, `wide inspector dock is 320px: ${JSON.stringify(wide)}`);
    assert.equal(wide.sourceScrollable, true);
    await evaluate(page, `document.querySelector('[data-task-instruction="${activeKey}"]').focus()`);
    await pressNavigationKey(page, 'PageDown');
    await until(() => evaluate(page, `document.querySelector('[data-task-instruction="${activeKey}"]').scrollTop > 0`),
      'keyboard-scrolled full task body');
    await audit(page, output, 't003-now-detail-1440-light');
    await viewport(page, 1440, 'dark');
    await audit(page, output, 't003-now-detail-1440-dark');

    // Responsive movement keeps focus on the same key while moving the
    // inspector from the 320px dock to the in-flow row.
    await evaluate(page, `document.querySelector('[data-task-detail="${activeKey}"]').focus()`);
    await viewport(page, 360, 'light');
    const narrow = await until(() => evaluate(page, `(() => {
      const detail = document.querySelector('[data-task-detail="${activeKey}"]');
      if (!detail?.closest('li')) return null;
      return {
        focused: detail === document.activeElement,
        inRow: Boolean(detail.closest('li')),
        inDock: Boolean(detail.closest('aside')),
        pageWidth: document.documentElement.scrollWidth,
        titleIdentity: document.querySelector('h1').textContent.replace(/\\s+/g, ' ').trim(),
      };
    })()`), 'narrow in-flow task detail');
    assert.deepEqual(narrow, {
      focused: true,
      inRow: true,
      inDock: false,
      pageWidth: 360,
      titleIdentity: `062 ${title}`,
    });
    await audit(page, output, 't003-now-detail-360-light');
    await viewport(page, 360, 'dark');
    await audit(page, output, 't003-now-detail-360-dark');
    await viewport(page, 1440, 'light');
    await until(() => evaluate(page, `Boolean(document.querySelector(
      '[data-task-detail="${activeKey}"]'
    )?.closest('aside'))`), 'task detail returned to wide dock');

    // Close returns focus to the source row. A filter that hides a selected row
    // dismisses detail but keeps focus on the filter and leaves Next/phase
    // totals unchanged.
    await click(page, `document.querySelector('[aria-label="Close task detail"]')`);
    assert.equal(await evaluate(page, `document.activeElement?.dataset.taskKey`), activeKey);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false);
    await click(page, `document.querySelector('[data-task-key="${activeKey}"]')`);
    await click(page, `document.querySelector('[data-task-filter="done"]')`);
    await until(() => evaluate(page, `!document.querySelector('[data-task-detail]')`), 'filtered task detail dismissal');
    assert.equal(await evaluate(page, `document.activeElement?.dataset.taskFilter`), 'done');
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
      .map(node => node.dataset.taskKey)`), ['T001@a062c1d4']);
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-phase]')].map(section =>
      [...section.querySelectorAll('*')].find(node =>
        /^\\d+ of \\d+ tasks complete$/.test(node.textContent.trim()))?.textContent.trim() || null
    )`), phaseTotals.map(({ total }) => total), 'phase totals remain unfiltered');
    assert.equal(await evaluate(page, `document.body.innerText.includes('SOURCE-A1')`), true, 'filtering never retargets Next');
    await click(page, `document.querySelector('[data-task-filter="all"]')`);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false,
      'returning to All does not reopen dismissed detail');
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
      .map(node => node.dataset.taskKey)`), allKeys);

    // Preserve the already shipped Review object/frame/caret and unrelated
    // request draft while task inspection comes and goes.
    await click(page, `document.querySelector('[data-task-key="${activeKey}"]')`);
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`), 'T003 retained Review ready', 60_000);
    await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
    await openReviewDetails(page);
    await click(page, button('Add at center'));
    await visible(page, 'Comments (1)');
    await click(page, button('Comments (1)'));
    const reviewComment = '  T003 Review caret remains local.  ';
    await fill(page, field('Comment (optional)'), reviewComment);
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft', 'ArrowLeft', 8);
    await press(page, 'ArrowLeft', 'ArrowLeft', 8);
    await press(page, 'ArrowLeft', 'ArrowLeft', 8);
    const expectedCaret = { start: reviewComment.length - 5, end: reviewComment.length - 2 };
    assert.deepEqual(await evaluate(page, `({
      start:${field('Comment (optional)')}.selectionStart,
      end:${field('Comment (optional)')}.selectionEnd,
    })`), expectedCaret);
    await click(page, `document.querySelector('[aria-label="Close comments"]')`);
    await evaluate(page, `window.__t003ReviewFrame = document.querySelector('.dude-review-frame')`);
    await click(page, `document.querySelector('[data-review-return]')`);
    await visible(page, 'SOURCE-A1');
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail="${activeKey}"]'))`), true);
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))`),
      'retained T003 Review reopened');
    assert.equal(await evaluate(page, `window.__t003ReviewFrame === document.querySelector('.dude-review-frame')`), true);
    await click(page, button('Comments (1)'));
    assert.deepEqual(await evaluate(page, `({
      value:${field('Comment (optional)')}.value,
      start:${field('Comment (optional)')}.selectionStart,
      end:${field('Comment (optional)')}.selectionEnd,
    })`), { value: reviewComment, ...expectedCaret });
    await click(page, `document.querySelector('[aria-label="Close comments"]')`);
    await click(page, `document.querySelector('[data-review-return]')`);
    await click(page, button('Needs you'));
    await click(page, `[...document.querySelectorAll('button')].find(node =>
      node.innerText.includes('T003 retained request draft') && node.getClientRects().length)`);
    assert.equal(await evaluate(page, `${field('Your response')}.value`), requestDraft);
    await click(page, button('Now'));
    await visible(page, 'SOURCE-A1');

    // A same-key source refresh replaces the body in place instead of serving
    // a cached task object.
    fs.writeFileSync(path.join(root, ...featureA.specPath.split('/')).replace(/spec\.md$/, 'tasks.md'),
      tasksSource('SOURCE-A2'));
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await visible(page, 'SOURCE-A2');
    assert.equal(await evaluate(page, `document.querySelector('[data-task-instruction="${activeKey}"]').textContent`),
      activeUnit('SOURCE-A2'));
    assert.equal(await evaluate(page, `document.body.innerText.includes('SOURCE-A1')`), false);

    // Hold A3's actual selected response, choose feature B, then release it.
    // The data epoch and render-time key scope must never expose A3 under B.
    fs.writeFileSync(path.join(root, ...featureA.specPath.split('/')).replace(/spec\.md$/, 'tasks.md'),
      tasksSource('SOURCE-A3-DELAYED'));
    let heldA = null;
    page.on('Fetch.requestPaused', event => {
      if (new URL(event.request.url).pathname === '/api/refresh') heldA = event;
    });
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/refresh', requestStage: 'Response' }],
    });
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await until(() => heldA, 'held feature A3 selected response');
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '061');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await until(() => evaluate(page, `document.querySelector('h1')?.textContent
      .replace(/\\s+/g, ' ').trim() === '061 guard feature b'`), 'feature B heading before delayed A release');
    await page.send('Fetch.continueRequest', { requestId: heldA.requestId });
    await page.send('Fetch.disable');
    await visible(page, 'FEATURE-B-BODY');
    assert.equal(await evaluate(page, `document.body.innerText.includes('SOURCE-A3-DELAYED')`), false);
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
      .map(node => node.dataset.taskKey)`), ['T001@bguard01']);
    assert.equal(await evaluate(page, `window.__t003ReviewFrame === document.querySelector('.dude-review-frame')`), true,
      'feature switching does not dispose the retained Review entry object');

    // Reselect A, then remove the inspected key from the real task source.
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '062');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await visible(page, 'SOURCE-A3-DELAYED');
    await click(page, `document.querySelector('[data-task-key="${activeKey}"]')`);
    fs.writeFileSync(path.join(root, ...featureA.specPath.split('/')).replace(/spec\.md$/, 'tasks.md'),
      tasksSource('SOURCE-A4', false));
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await until(() => evaluate(page, `document.querySelectorAll('[data-task-key]').length === 4`),
      'confirmed active-key removal');
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false);
    assert.equal(await evaluate(page, `document.body.innerText.includes('SOURCE-A3-DELAYED')`), false);
    assert.deepEqual(await evaluate(page, `[...document.querySelectorAll('[data-task-key]')]
      .map(node => node.dataset.taskKey)`), allKeys.filter(key => key !== activeKey));

    // Clear removes only task inspection and focuses the original finder.
    await click(page, `document.querySelector('[data-task-key="T003@c062e3f6"]')`);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail="T003@c062e3f6"]'))`), true);
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false);
    assert.equal(await evaluate(page, `document.activeElement === ${field('Search work')}`), true);
    assert.equal(await evaluate(page, `${field('Search work')}.value`), '');

    // A proven root inode replacement invalidates the task key before effects
    // can paint it under replacement work.
    await fill(page, field('Search work'), '062');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await click(page, `document.querySelector('[data-task-key="T003@c062e3f6"]')`);
    movedRoot = `${root}-original`;
    fs.renameSync(root, movedRoot);
    createIdea(root, 62, 'replacement-root', 'defined', '# Tasks\n\n- [ ] T001@newroot1 Replacement root task.\n');
    await click(page, button('Refresh'));
    await until(() => evaluate(page, `document.querySelector('h1')?.textContent === 'Overview'`),
      'replacement root resets selected task state');
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-task-detail]'))`), false);
    assert.equal(await evaluate(page, `document.body.innerText.includes('waiting for the isolated fixture')`), false);

    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(
      [...new Set(network.map(({ path: pathname }) => pathname)
        .filter(pathname => /settings|kanban|task-(?:write|mutate)|workflow/i.test(pathname)))],
      [],
      'task inspection invokes no future destination or mutation route',
    );
    Object.assign(observations, {
      records: 62,
      packages: 50,
      sourceBackedTaskKeys: allKeys,
      baseline: {
        counts: endpointRow.taskCounts,
        sourceIdentity: endpointTaskSource.contentIdentity,
        exactCrLfUnit: true,
        fencedAndCommentedLookalikesInert: true,
      },
      guards: {
        nullableCountsRetainedDetail: true,
        equalCountsMismatchedSourceWithheld: true,
        delayedFeatureARejectedForB: true,
        removedKeyDismissed: true,
        rootReplacementDismissed: true,
      },
      interaction: {
        oneSelectionRead: true,
        repeatedActivationFocused: true,
        closeReturnedToRow: true,
        filterReturnedToFilter: true,
        keyboardBodyScroll: true,
      },
      responsive: { wideDock: 320, narrowInline: 360, focusMigrated: true },
      retained: { requestDraft: true, reviewFrame: true, reviewCaret: expectedCaret },
      visualCases: output.results.map(result => result.case),
      browser: browserState.version.Browser,
      nativeHostClaimed: false,
    });
    writeEvidenceJson(output, 't003-task-inspection-observation', observations);
    output.results.push({ case: 't003-production-now-task-inspection', pass: true, ...observations });
  } finally {
    factPublication?.controller.abort();
    reviewPublication?.controller.abort();
    if (factPublication) await factPublication.result.catch(() => {});
    if (reviewPublication) await reviewPublication.result.catch(() => {});
    if (fixture) await fixture.close({ removeRoot: fs.existsSync(fixture.root) });
    if (movedRoot) fs.rmSync(movedRoot, { recursive: true, force: true });
    if (browserState) await cleanupBrowserDriver(browserState);
    board.close();
  }
});

test('T004 contextual requests: exact scope, independent drafts, truthful Browsing, history return, and visual access', {
  timeout: 360_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't004-contextual-requests');
  const board = installEmptyBoard();
  const fixtures = [];
  const publications = [];
  let browserState;
  const runtimeErrors = [];
  const network = [];
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t004-context-'));
    const featureA = createIdea(root, 801, 'context-feature-a', 'defined', [
      '# Tasks',
      '',
      '## Phase 1: Context',
      '- [~] T001@a801aaaa Inspect request isolation',
      '',
      'Keep task inspection local to feature A.',
      '',
      '- [ ] T002@a801bbbb Return without retargeting',
      '    deps: T001@a801aaaa',
      '',
    ].join('\n'));
    const featureB = createIdea(root, 802, 'request-feature-b', 'defined');
    const draftIdea = createIdea(root, 803, 'idea-scoped-context');
    const previewA = createPreview(root, /** @type {any} */ (featureA));
    const historyA = createSealedHistory(root, /** @type {any} */ ({
      kind: 'feature',
      ideaPath: featureA.ideaPath,
      specPath: featureA.specPath,
    }), previewA, {
      submissionId: '44444444-4444-4444-8444-444444444444',
      label: 'T004 history A',
      revision: hash('t004-history-a-revision'),
    });
    const fixture = await createFixture(root);
    fixtures.push(fixture);

    const sessionRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } });
    sessionRequest.prompt = 'Session request stays independently reachable';
    publications.push(await publish(fixture, sessionRequest));
    const foreignRequest = requestFor(fixture, 'scope_choice', {
      options: [
        { id: 'keep-b', label: 'Keep request B exact', consequence: 'Feature A remains only the browsing selection.' },
        { id: 'move-b', label: 'Move request B', consequence: 'The owner would need a fresh request.' },
      ],
    }, {
      kind: 'feature',
      ideaPath: featureB.ideaPath,
      specPath: featureB.specPath,
    });
    foreignRequest.prompt = 'Choose for feature B while browsing A';
    const foreign = await publish(fixture, foreignRequest);
    publications.push(foreign);

    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (!event.request.url.startsWith(fixture.instance.url)) return;
      network.push({
        method: event.request.method,
        path: new URL(event.request.url).pathname,
        body: event.request.postData ?? null,
      });
    });
    await navigate(page, fixture, 1440, 'light');
    await click(page, `document.querySelector('[data-work-path="${featureA.ideaPath}"]')`);
    await visible(page, 'Keep task inspection local to feature A.');

    // Session and foreign-feature requests are real and reachable, but neither
    // creates a contextual action or a Review entry for selected feature A.
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-request-entry]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-entry]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelectorAll('iframe').length`), 0);
    await click(page, button('Needs you'));
    await visible(page, sessionRequest.prompt);
    await visible(page, foreignRequest.prompt);
    await click(page, button('Now'));

    // One exact feature request opens its form directly from Now. Merely
    // opening the response surface does not mount Review.
    const exactRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } }, {
      kind: 'feature',
      ideaPath: featureA.ideaPath,
      specPath: featureA.specPath,
    });
    exactRequest.prompt = 'One exact feature A request opens directly';
    const exact = await publish(fixture, exactRequest);
    publications.push(exact);
    await visible(page, 'Respond to request');
    assert.equal(await evaluate(page, `document.querySelector('[data-request-entry]')
      ?.getAttribute('data-request-entry')`), exact.record.requestHandle);
    await evaluate(page, `document.querySelector('[data-request-entry]').focus()`);
    await press(page, 'Enter');
    await visible(page, exactRequest.prompt);
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Working on"]')
      ?.innerText.includes('801')`), true);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Browsing"]'))`), false);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-workspace]').length`), 0);
    const exactDraft = '  Exact A draft\n\nkeeps literal whitespace.  ';
    await fill(page, field('Your response'), exactDraft);

    // An idea-scoped request with the same exact idea and a preview request are
    // also contextual. Several matches route to the existing explicit list;
    // preview capability remains a separate, user-entered Review action.
    const ideaRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } }, {
      kind: 'feature',
      ideaPath: featureA.ideaPath,
      specPath: featureA.specPath,
    });
    ideaRequest.prompt = 'Second feature-scoped request for the selected source';
    publications.push(await publish(fixture, ideaRequest));
    const previewRequest = requestFor(fixture, 'preview', previewA, {
      kind: 'feature',
      ideaPath: featureA.ideaPath,
      specPath: featureA.specPath,
    });
    previewRequest.prompt = 'Preview remains a separate contextual capability';
    const previewPublication = await publish(fixture, previewRequest);
    publications.push(previewPublication);
    await click(page, button('Now'));
    await visible(page, 'Choose request (3)');
    assert.equal(await evaluate(page, `document.querySelector('[data-request-entry]')
      ?.getAttribute('data-request-entry')`), 'choices');
    assert.equal(await evaluate(page, `document.querySelector('[data-review-entry]')
      ?.getAttribute('data-review-entry')`), previewPublication.record.requestHandle);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-workspace]').length`), 0);
    await click(page, button('Choose request (3)'));
    await visible(page, exactRequest.prompt);
    await visible(page, ideaRequest.prompt);
    await visible(page, previewRequest.prompt);
    await visible(page, sessionRequest.prompt);
    await visible(page, foreignRequest.prompt);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-workspace]').length`), 0);

    // Select B while A remains the committed work context. The command bar and
    // request surface name different identities, and the B option/text draft
    // survives task inspection, New idea/Cancel, Clear, and reselection.
    await click(page, `[...document.querySelectorAll('button')].find(node =>
      node.innerText.includes(${JSON.stringify(foreignRequest.prompt)}) && node.getClientRects().length)`);
    await visible(page, 'You are browsing 801 · context feature a');
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Browsing"]')
      ?.innerText.includes('801')`), true);
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Request scope"]')
      ?.innerText.includes(${JSON.stringify(featureB.specPath)})`), true);
    await choose(page, 'Alternative', 'Keep request B exact');
    const foreignDraft = '  B response\n\nretains *literal* context.  ';
    await fill(page, field('Additional context (optional)'), foreignDraft);

    await click(page, button('Now'));
    await click(page, `document.querySelector('[data-task-key="T001@a801aaaa"]')`);
    await click(page, `document.querySelector('[data-task-filter="todo"]')`);
    assert.equal(await evaluate(page, `document.activeElement?.dataset.taskFilter`), 'todo');
    await click(page, button('Needs you'));
    assert.equal(await evaluate(page, `${field('Alternative')}.innerText.trim()`), 'Keep request B exact');
    assert.equal(await evaluate(page, `${field('Additional context (optional)')}.value`), foreignDraft);

    await click(page, button('New idea'));
    const newIdeaDraft = '  New idea remains unfiled.\n\nDo not attach A or B.  ';
    await fill(page, field('Your idea'), newIdeaDraft);
    await click(page, button('Cancel'));
    assert.equal(await evaluate(page, `${field('Alternative')}.innerText.trim()`), 'Keep request B exact');
    assert.equal(await evaluate(page, `${field('Additional context (optional)')}.value`), foreignDraft);
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    assert.equal(await evaluate(page, `document.activeElement === ${field('Search work')}`), true);
    assert.equal(await evaluate(page, `${field('Search work')}.value`), '');
    assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'All');
    await fill(page, field('Search work'), '801');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await visible(page, 'Keep task inspection local to feature A.');
    assert.equal(await evaluate(page, `document.querySelector('[data-task-filter="all"]')
      ?.getAttribute('aria-pressed')`), 'true', 'Clear resets only the local task inspection');
    await click(page, button('Needs you'));
    assert.equal(await evaluate(page, `${field('Alternative')}.innerText.trim()`), 'Keep request B exact');
    assert.equal(await evaluate(page, `${field('Additional context (optional)')}.value`), foreignDraft);
    await click(page, button('New idea'));
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), newIdeaDraft);
    await click(page, button('Cancel'));

    // Fresh visual, geometry, AX-name, target-size, and contrast evidence for
    // the cross-scope form and its Browsing control at every required width.
    for (const theme of ['light', 'dark']) {
      for (const width of [360, 768, 1440, 1920]) {
        await viewport(page, width, /** @type {'light'|'dark'} */ (theme));
        assert.equal(await evaluate(page, `${field('Additional context (optional)')}.value`), foreignDraft);
        await audit(page, output, `t004-browsing-form-${width}-${theme}`);
      }
    }
    await viewport(page, 768, 'light');
    await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    assert.equal(await until(() => evaluate(page, `visualViewport?.scale === 2 ? visualViewport.scale : null`),
      'T004 200 percent page scale'), 2);
    await audit(page, output, 't004-browsing-form-768-light-page-scale-200');
    await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'dark' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await until(() => evaluate(page, `getComputedStyle(document.querySelector('.fui-FluentProvider'))
      .getPropertyValue('--colorNeutralForeground1').trim() === '#ffffff'`), 'T004 dark reduced-motion theme');
    assert.ok(await evaluate(page, `getComputedStyle(document.querySelector('[data-work-selector]'))
      .transitionDuration.split(',').every(value => Number.parseFloat(value) <= 0.00001)`),
    'reduced motion leaves no perceptible selector transition');
    await audit(page, output, 't004-browsing-form-768-dark-reduced-motion');
    await viewport(page, 1440, 'light');

    const responsePostsBefore = network.filter(entry =>
      entry.method === 'POST' && entry.path === '/api/needs-you/respond').length;
    await click(page, button('Send response'));
    const foreignResult = JSON.parse((await foreign.result).textResultForLlm);
    assert.equal(foreignResult.status, 'awaiting_acknowledgment');
    assert.equal(foreignResult.response.optionId, 'keep-b');
    assert.equal(foreignResult.response.text, foreignDraft);
    assert.deepEqual(foreignResult.receipt.scope, {
      kind: 'feature',
      ideaPath: featureB.ideaPath,
      specPath: featureB.specPath,
    });
    await until(() => network.filter(entry =>
      entry.method === 'POST' && entry.path === '/api/needs-you/respond').length === responsePostsBefore + 1,
    'one cross-scope response POST observed by CDP');
    await acknowledge(fixture, foreignResult.receipt, 'accepted', foreignRequest.source);
    await visible(page, 'The owner accepted this response');

    // Once A's source changes, all of its formerly exact requests become
    // nonpending and therefore create neither a contextual response action nor
    // Review authority. The still-pending session request remains independent.
    fs.appendFileSync(path.join(root, ...featureA.ideaPath.split('/')), '\n<!-- T004 source invalidation -->\n');
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await until(() => fixture.provider.read().requests
      .filter(item => [exactRequest.requestRef, ideaRequest.requestRef, previewRequest.requestRef]
        .includes(item.request.requestRef))
      .every(item => item.phase !== 'pending'), 'A-scoped requests invalidated by their real source');
    await click(page, button('Now'));
    await until(() => evaluate(page, `document.querySelectorAll('[data-request-entry]').length === 0`),
      'no stale contextual response entry');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-entry]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelectorAll('iframe').length`), 0);

    // A draft's exact idea scope independently receives the same one-request
    // direct entry behavior; no defined-feature ownership is inferred.
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '803');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await visible(page, 'Intent for idea-scoped-context, with literal source text.');
    const draftIdeaRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } }, {
      kind: 'idea',
      ideaPath: draftIdea.ideaPath,
    });
    draftIdeaRequest.prompt = 'One exact draft-idea request opens directly';
    const draftIdeaPublication = await publish(fixture, draftIdeaRequest);
    publications.push(draftIdeaPublication);
    await visible(page, 'Respond to request');
    assert.equal(await evaluate(page, `document.querySelector('[data-request-entry]')
      ?.getAttribute('data-request-entry')`), draftIdeaPublication.record.requestHandle);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-entry]').length`), 0);

    // History return remounts Context. Its original control is disconnected,
    // so the product must restore the recorded scroll and focus a fresh exact
    // locator rather than the background selectedRequest.
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await fill(page, field('Search work'), '801');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    await viewport(page, 768, 'light', 480);
    await visible(page, historyA.submissionId);
    await evaluate(page, `(() => {
      const button = document.querySelector('[data-history-entry="${historyA.submissionId}"]');
      button.scrollIntoView({ block: 'center' });
      button.focus();
      window.__t004HistoryOrigin = button;
      window.__t004HistoryScroll = button.closest('[role="tabpanel"]').scrollTop;
    })()`);
    const historyScroll = await evaluate(page, `window.__t004HistoryScroll`);
    assert.ok(historyScroll > 0, `history focus fixture scrolls the Context panel: ${historyScroll}`);
    await click(page, `document.querySelector('[data-history-entry="${historyA.submissionId}"]')`);
    await visible(page, `Submission: ${historyA.submissionId}`);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Browsing"]'))`), false,
      'displayed history scope, not background request B, labels the selected A identity');
    await click(page, button('Back'));
    const historyReturn = await until(() => evaluate(page, `(() => {
      const node = document.querySelector('[data-history-entry="${historyA.submissionId}"]');
      const panel = node?.closest('[role="tabpanel"]');
      if (!node || document.activeElement !== node) return null;
      return {
        originConnected: window.__t004HistoryOrigin.isConnected,
        replaced: node !== window.__t004HistoryOrigin,
        focusedSubmission: node.dataset.historyEntry,
        scrollTop: panel.scrollTop,
      };
    })()`), 'T004 history locator focus and scroll return');
    assert.deepEqual({
      originConnected: historyReturn.originConnected,
      replaced: historyReturn.replaced,
      focusedSubmission: historyReturn.focusedSubmission,
    }, {
      originConnected: false,
      replaced: true,
      focusedSubmission: historyA.submissionId,
    });
    assert.ok(Math.abs(historyReturn.scrollTop - historyScroll) <= 1,
      `history return restores ${historyScroll}px scroll, observed ${historyReturn.scrollTop}px`);

    // A current preview on a provider without the Review adapter remains a
    // response request, but it cannot manufacture an Open Review destination.
    const unavailableRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t004-no-review-'));
    const unavailableFeature = createIdea(unavailableRoot, 804, 'review-capability-unavailable', 'defined');
    const unavailablePreview = createPreview(unavailableRoot, /** @type {any} */ (unavailableFeature));
    const unavailableFixture = await createFixture(unavailableRoot, null, () => null);
    fixtures.push(unavailableFixture);
    const unavailableRequest = requestFor(unavailableFixture, 'preview', unavailablePreview, {
      kind: 'feature',
      ideaPath: unavailableFeature.ideaPath,
      specPath: unavailableFeature.specPath,
    });
    unavailableRequest.prompt = 'Preview without a current Review capability';
    const unavailablePublication = await publish(unavailableFixture, unavailableRequest);
    publications.push(unavailablePublication);
    await navigate(page, unavailableFixture, 768, 'dark');
    await click(page, `document.querySelector('[data-work-path="${unavailableFeature.ideaPath}"]')`);
    await visible(page, 'Respond to request');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-entry]').length`), 0);
    await click(page, button('Respond to request'));
    await visible(page, unavailableRequest.prompt);
    await visible(page, 'The current preview owner or Review capability is unavailable.');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-workspace]').length`), 0);
    assert.equal(await evaluate(page, `document.querySelectorAll('.dude-review-frame iframe').length`), 0);

    const approved062 = fs.readFileSync(path.join(
      ROOT,
      '.dude/specs/062-dude-canvas-workspace-integration/design/workspace-integration.html',
    ));
    const approved052 = fs.readFileSync(path.join(
      ROOT,
      '.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html',
    ));
    const comparison = {
      classification: 'matches approved T004 composition',
      approved062: { sha256: sha256(approved062), bytes: approved062.length },
      reference052: { sha256: sha256(approved052), bytes: approved052.length },
      observedAdaptations: [
        'one command-bar Working on or Browsing identity remains distinct from request scope',
        'Needs you and New idea share the retained shell without a second work selector',
        'sealed history returns through the selected-work dock with locator and scroll restoration',
        '360px uses the narrow shell while 768px, 1440px, and 1920px retain fluid available width',
      ],
      visualCases: output.results.map(item => item.case),
      pageScalePercent: 200,
      reducedMotion: true,
      nativeDesktopHostClaimed: false,
      textOnlyZoomClaimed: false,
    };
    assert.equal(comparison.approved062.sha256,
      '1508fe1efaf6a5228784dee8c140a569927bf27eb1dfc9244679b6ae80ec2962');
    assert.equal(comparison.reference052.sha256,
      'd491b002154088f4cc6cac4773a6745ac2f9a02b5f78b5a593c3c88335169d70');
    writeEvidenceJson(output, 't004-approved-comparison', comparison);
    output.results.push({
      case: 't004-contextual-request-loop',
      pass: true,
      browser: browserState.version.Browser,
      zeroContextualWithForeignAndSession: true,
      oneExactDirectEntry: true,
      severalExactChoiceEntry: true,
      foreignScopeDelivered: foreignResult.receipt.scope,
      historyReturn,
      comparison,
    });
    assert.deepEqual(runtimeErrors, []);
  } finally {
    for (const publication of publications) publication.controller.abort();
    if (browserState) await cleanupBrowserDriver(browserState);
    for (const fixture of fixtures.reverse()) await fixture.close({
      removeRoot: fs.existsSync(fixture.root),
    });
    await Promise.allSettled(publications.map(publication => publication.result));
    board.close();
  }
});

test('T004 Review opening: late success and error cannot override newer navigation or per-open identity', {
  timeout: 300_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't004-review-open-races');
  const board = installEmptyBoard();
  const publications = [];
  let fixture;
  let browserState;
  let movedRoot = null;
  let fetchEnabled = false;
  const runtimeErrors = [];
  const network = [];
  const paused = [];
  const observations = [];
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t004-open-race-'));
    const feature = createIdea(root, 811, 'review-open-race', 'defined');
    let preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const makePreviewRequest = async (prompt, currentPreview = preview) => {
      const request = requestFor(fixture, 'preview', currentPreview, scope);
      request.prompt = prompt;
      const publication = await publish(fixture, request);
      publications.push(publication);
      return { publication, request };
    };
    const sameRequest = await makePreviewRequest('Same request uses a new opening intent every time');
    const errorRequest = await makePreviewRequest('Late Review error must stay behind New idea');
    const clearRequest = await makePreviewRequest('Clear supersedes this pending Review open');
    const sourceRequest = await makePreviewRequest('Source invalidation supersedes this Review open');

    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (!event.request.url.startsWith(fixture.instance.url)) return;
      network.push({
        method: event.request.method,
        path: new URL(event.request.url).pathname,
        body: event.request.postData ?? null,
      });
    });
    page.on('Fetch.requestPaused', event => {
      if (new URL(event.request.url).pathname === '/api/needs-you/review/open'
        && event.responseStatusCode) paused.push(event);
    });
    await navigate(page, fixture, 1440, 'light');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Review design requests');
    await page.send('Fetch.enable', {
      patterns: [{
        urlPattern: '*/api/needs-you/review/open',
        requestStage: 'Response',
      }],
    });
    fetchEnabled = true;

    const requestButton = request => `[...document.querySelectorAll('button')].find(node =>
      node.innerText.includes(${JSON.stringify(request.prompt)}) && node.getClientRects().length)`;
    const showRequest = async request => {
      await click(page, `document.querySelector('#dude-tab-needs')`);
      if (await evaluate(page, `Boolean(${button('All requests')})`)) {
        await click(page, button('All requests'));
      }
      await click(page, requestButton(request));
      await visible(page, request.prompt);
    };
    const beginOpen = async (request, label) => {
      await showRequest(request);
      const occurrence = paused.length;
      await click(page, button('Open Review'));
      return until(() => paused[occurrence], `${label} deferred Review-open response`);
    };
    const continueOpen = async event => {
      await page.send('Fetch.continueRequest', { requestId: event.requestId });
    };
    const failOpen = async event => {
      await page.send('Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'ConnectionReset',
      });
    };
    const settle = () => evaluate(page, `new Promise(resolve => requestAnimationFrame(() =>
      Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
    const foreground = () => evaluate(page, `Boolean(document.querySelector('[data-review-workspace]')
      ?.getClientRects().length)`);

    // A valid server success is held after the real adapter allocates its
    // working submission. New idea cancels only this foreground intent.
    const first = await beginOpen(sameRequest.request, 'first same-request');
    await click(page, button('New idea'));
    const localDraft = '  Newer navigation keeps this draft.\n\nNo late Review may replace it.  ';
    await fill(page, field('Your idea'), localDraft);
    await continueOpen(first);
    await settle();
    assert.equal(await evaluate(page, `document.querySelector('h1')?.innerText.trim()`), 'New idea');
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), localDraft);
    assert.equal(await foreground(), false);
    assert.equal(await evaluate(page, `document.body.innerText.includes('Action unavailable')`), false);
    observations.push({ ordering: 'success then New idea', foreground: false, draft: localDraft });

    // Leave and reopen the same request twice. The newer response completes
    // first and mounts one real engine; the older per-open intent must not
    // replace that entry even though both responses have the same request key
    // and provider-owned submission.
    const second = await beginOpen(sameRequest.request, 'second same-request');
    await click(page, button('Now'));
    const third = await beginOpen(sameRequest.request, 'third same-request');
    await continueOpen(third);
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]')?.disabled`),
    'newest same-request Review engine', 60_000);
    await evaluate(page, `(() => {
      window.__t004RaceWorkspace = document.querySelector('[data-review-workspace]');
      window.__t004RaceEngineHost = document.querySelector('[data-review-engine-host]');
      window.__t004RaceFrame = document.querySelector('.dude-review-frame');
      window.__t004RaceOverlay = document.querySelector('.dude-review-overlay');
    })()`);
    const newest = await evaluate(page, `(() => ({
      prompt: document.querySelector('[data-review-workspace] h1')?.innerText.trim(),
      framePath: document.querySelector('.dude-review-frame iframe')?.src,
      viewBox: document.querySelector('.dude-review-overlay')?.getAttribute('viewBox'),
    }))()`);
    await continueOpen(second);
    await settle();
    const afterOlderSameRequest = await evaluate(page, `(() => ({
      sameWorkspace: window.__t004RaceWorkspace === document.querySelector('[data-review-workspace]'),
      sameEngineHost: window.__t004RaceEngineHost === document.querySelector('[data-review-engine-host]'),
      sameFrame: window.__t004RaceFrame === document.querySelector('.dude-review-frame'),
      sameOverlay: window.__t004RaceOverlay === document.querySelector('.dude-review-overlay'),
      prompt: document.querySelector('[data-review-workspace] h1')?.innerText.trim(),
      framePath: document.querySelector('.dude-review-frame iframe')?.src,
      viewBox: document.querySelector('.dude-review-overlay')?.getAttribute('viewBox'),
    }))()`);
    assert.deepEqual(afterOlderSameRequest, {
      sameWorkspace: true,
      sameEngineHost: true,
      sameFrame: true,
      sameOverlay: true,
      ...newest,
    });
    observations.push({
      ordering: 'same request older success after newer success',
      newest,
      retainedIdentity: afterOlderSameRequest,
    });

    // A transport error is stale after explicit navigation too. The already
    // mounted engine remains hidden and the newer draft receives no banner.
    await click(page, `document.querySelector('[data-review-return]')`);
    const errorOpen = await beginOpen(errorRequest.request, 'late-error');
    await click(page, button('New idea'));
    await failOpen(errorOpen);
    await settle();
    assert.deepEqual(await evaluate(page, `({
      heading: document.querySelector('h1')?.innerText.trim(),
      draft: ${field('Your idea')}.value,
      reviewForeground: Boolean(document.querySelector('[data-review-workspace]')?.getClientRects().length),
      actionUnavailable: document.body.innerText.includes('Action unavailable'),
      connectionError: document.body.innerText.includes('The connection was interrupted')
    })`), {
      heading: 'New idea',
      draft: localDraft,
      reviewForeground: false,
      actionUnavailable: false,
      connectionError: false,
    });
    observations.push({ ordering: 'error then New idea', foreground: false, banner: false });

    // Clear is also a newer navigation intent. It resets only lookup/task
    // state and cannot be undone by a successful Review response.
    const clearOpen = await beginOpen(clearRequest.request, 'clear');
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await continueOpen(clearOpen);
    await settle();
    assert.deepEqual(await evaluate(page, `({
      heading: document.querySelector('h1')?.innerText.trim(),
      search: ${field('Search work')}.value,
      show: ${field('Show')}.innerText.trim(),
      reviewForeground: Boolean(document.querySelector('[data-review-workspace]')?.getClientRects().length),
      selected: Boolean(document.querySelector('[aria-label="Working on"],[aria-label="Browsing"]'))
    })`), {
      heading: 'Overview',
      search: '',
      show: 'All',
      reviewForeground: false,
      selected: false,
    });
    observations.push({ ordering: 'success then Clear', foreground: false, selected: false });

    // Re-select A, hold its source-sensitive request, then invalidate the real
    // canonical preview through the production endpoint. The held older
    // success may report an unavailable action, but cannot mount stale bytes.
    await fill(page, field('Search work'), '811');
    await evaluate(page, `${field('Search work')}.focus()`);
    await pressNavigationKey(page, 'ArrowDown');
    await press(page, 'Enter');
    const sourceOpen = await beginOpen(sourceRequest.request, 'source-invalidation');
    fs.appendFileSync(path.join(root, ...preview.artifact.path.split('/')),
      '\n<!-- changed while the first open response was held -->\n');
    const invalidationResponse = await fetch(new URL('/api/needs-you/review/open', fixture.instance.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: new URL(fixture.instance.url).origin,
      },
      body: JSON.stringify({
        requestHandle: sourceRequest.publication.record.requestHandle,
        revision: sourceRequest.request.revision,
      }),
    });
    assert.equal(invalidationResponse.ok, false);
    const invalidationBody = await invalidationResponse.json();
    assert.equal(invalidationBody.error, 'source_changed');
    await until(() => fixture.provider.read().requests.find(item =>
      item.request.requestRef === sourceRequest.request.requestRef)?.phase === 'source_changed',
    'source-invalidated request phase');
    await visible(page, 'Stale context');

    // Publish and select a genuinely fresh request while the invalidated
    // response is still held. Releasing the stale response after this newer
    // intent cannot relabel the fresh request or mount the old source.
    preview = {
      ...preview,
      artifact: {
        ...preview.artifact,
        revision: hash(fs.readFileSync(path.join(root, ...preview.artifact.path.split('/')))),
      },
    };
    const rootRequest = await makePreviewRequest('Root replacement supersedes this valid Review open', preview);
    await click(page, button('Needs you'));
    const rootOpen = await beginOpen(rootRequest.request, 'root-replacement');
    const freshRequestState = await evaluate(page, `(() => {
      const title = [...document.querySelectorAll('*')].find(node =>
        node.childElementCount === 0 && node.textContent.trim() === 'Action unavailable');
      const notice = title?.closest('[role="alert"],[role="status"]') || title?.parentElement?.parentElement;
      return {
        prompt: [...document.querySelectorAll('p')].find(node =>
          node.innerText.trim() === ${JSON.stringify(rootRequest.request.prompt)}
        )?.innerText.trim() || null,
        requestIdentity: [...document.querySelectorAll('main *')].find(node =>
          node.childElementCount === 0
          && node.textContent.includes(${JSON.stringify(`Request: ${rootRequest.request.requestRef}`)})
        )?.textContent.trim() || null,
        actionUnavailable: Boolean(title),
        notice: notice?.innerText.replace(/\\s+/g, ' ').trim() || null,
        reviewForeground: Boolean(document.querySelector('[data-review-workspace]')?.getClientRects().length),
      };
    })()`);
    writeEvidenceJson(output, 't004-fresh-request-after-stale-open', {
      expected: {
        prompt: rootRequest.request.prompt,
        requestIdentity: rootRequest.request.requestRef,
        actionUnavailable: false,
        reviewForeground: false,
      },
      observed: freshRequestState,
      sequence: [
        'hold a real Review-open success',
        'invalidate the bound source through the production endpoint',
        'publish and select a fresh owner-qualified request',
        'start and hold that fresh request open',
        'release the stale response after the fresh intent',
      ],
    });
    assert.equal(freshRequestState.prompt, rootRequest.request.prompt);
    assert.match(freshRequestState.requestIdentity || '', new RegExp(rootRequest.request.requestRef));
    assert.equal(freshRequestState.reviewForeground, false);
    assert.equal(freshRequestState.actionUnavailable, false,
      `the stale Review-open result must not annotate the fresh request: ${JSON.stringify(freshRequestState)}`);
    await continueOpen(sourceOpen);
    await settle();
    const afterLateSource = await evaluate(page, `({
      freshPrompt: document.body.innerText.includes(${JSON.stringify(rootRequest.request.prompt)}),
      stalePrompt: document.body.innerText.includes(${JSON.stringify(sourceRequest.request.prompt)}),
      staleStatus: document.body.innerText.includes('Stale context'),
      actionUnavailable: document.body.innerText.includes('Action unavailable'),
      reviewForeground: Boolean(document.querySelector('[data-review-workspace]')?.getClientRects().length)
    })`);
    assert.deepEqual({
      freshPrompt: afterLateSource.freshPrompt,
      stalePrompt: afterLateSource.stalePrompt,
      actionUnavailable: afterLateSource.actionUnavailable,
      reviewForeground: afterLateSource.reviewForeground,
    }, {
      freshPrompt: true,
      stalePrompt: false,
      actionUnavailable: false,
      reviewForeground: false,
    }, 'a source-invalidated open response cannot annotate a newer request');
    observations.push({
      ordering: 'source-invalidated success after a fresh request started',
      providerPhase: 'source_changed',
      ...afterLateSource,
    });
    writeEvidenceJson(output, 't004-fresh-request-after-stale-open', {
      expected: {
        prompt: rootRequest.request.prompt,
        requestIdentity: rootRequest.request.requestRef,
        actionUnavailable: false,
        reviewForeground: false,
      },
      beforeLateSource: freshRequestState,
      afterLateSource,
      sequence: [
        'hold a real Review-open success',
        'invalidate the bound source through the production endpoint',
        'publish and select a fresh owner-qualified request',
        'start and hold that fresh request open',
        'release the stale response after the fresh intent',
      ],
    });
    await saveRegressionProof(page, output, 't004-fresh-request-after-stale-open', {
      freshRequestState,
      afterLateSource,
    });

    // Keep the fresh valid response held while the owned fixture root first
    // becomes unavailable, then is replaced at the same path. Temporary
    // unavailability retains the explicit target without foregrounding Review;
    // the proven new root key clears the per-open intent before its response
    // can annotate replacement work.
    movedRoot = `${root}-original`;
    fs.renameSync(root, movedRoot);
    await click(page, button('Refresh'));
    await visible(page, 'Current request coverage unavailable');
    assert.equal(await foreground(), false);
    assert.equal(await evaluate(page, `document.body.innerText.includes(
      ${JSON.stringify(rootRequest.request.prompt)}
    )`), true);
    createIdea(root, 812, 'replacement-root-after-review-open', 'defined');
    await click(page, button('Refresh'));
    await until(() => evaluate(page, `document.querySelector('h1')?.innerText.trim() === 'Overview'
      && !document.querySelector('[aria-label="Working on"],[aria-label="Browsing"]')`),
    'replacement root reset while Review response is held');
    await continueOpen(rootOpen);
    await settle();
    const afterRootReplacement = await evaluate(page, `({
      heading: document.querySelector('h1')?.innerText.trim(),
      replacementVisible: document.body.innerText.includes('replacement root after review open'),
      reviewForeground: Boolean(document.querySelector('[data-review-workspace]')?.getClientRects().length),
      stalePrompt: document.body.innerText.includes(${JSON.stringify(rootRequest.request.prompt)}),
      actionUnavailable: document.body.innerText.includes('Action unavailable')
    })`);
    assert.deepEqual(afterRootReplacement, {
      heading: 'Overview',
      replacementVisible: true,
      reviewForeground: false,
      stalePrompt: false,
      actionUnavailable: false,
    });
    observations.push({
      ordering: 'root replacement before held success',
      ...afterRootReplacement,
    });

    await page.send('Fetch.disable');
    fetchEnabled = false;
    const openPosts = network.filter(entry =>
      entry.method === 'POST' && entry.path === '/api/needs-you/review/open');
    assert.equal(openPosts.length, 7,
      'each explicit entry creates only its own real Review-open request, including the per-open same-request attempts');
    const proof = {
      browser: browserState.version.Browser,
      observations,
      openPosts: openPosts.map(({ body }) => JSON.parse(body)),
      sameRequestHandle: sameRequest.publication.record.requestHandle,
      retainedSubmissionPath: newest.framePath,
      deterministicDeferral: 'CDP Fetch response-stage continuation/failure; no timeout sleep is a race oracle',
    };
    writeEvidenceJson(output, 't004-review-open-races', proof);
    await saveRegressionProof(page, output, 't004-review-open-races', proof);
    output.results.push({
      case: 't004-review-open-races',
      pass: true,
      browser: browserState.version.Browser,
      observations,
      openPosts: openPosts.length,
    });
    assert.deepEqual(runtimeErrors, []);
  } finally {
    if (fetchEnabled && browserState) {
      await browserState.page.send('Fetch.disable').catch(() => {});
    }
    for (const publication of publications) publication.controller.abort();
    if (browserState) await cleanupBrowserDriver(browserState);
    if (fixture) await fixture.close({ removeRoot: fs.existsSync(fixture.root) });
    if (movedRoot) fs.rmSync(movedRoot, { recursive: true, force: true });
    await Promise.allSettled(publications.map(publication => publication.result));
    board.close();
  }
});

test('T011 browser: complete finder, six owner forms, keyboard context, late reads, and uncertain delivery', {
  timeout: 300_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't011-work-and-forms');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  const runtimeErrors = [];
  const network = [];
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-mixed-'));
    for (let index = 1; index <= 50; index += 1) {
      createIdea(root, index, `draft-${String(index).padStart(2, '0')}`);
    }
    const currentScope = createIdea(root, 51, 'current-feature', 'defined');
    createIdea(
      root,
      52,
      'completed-feature',
      'defined',
      '# Tasks\n\n- [x] T001@b2222222 Completed source instruction.\n',
    );
    const previewScope = createIdea(root, 53, 'design-feature', 'defined');
    const previewFields = createPreview(root, /** @type {any} */ (previewScope));
    createIdea(root, 54, 'resolved-without-implementation', 'resolved');
    fixture = await createFixture(root);
    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      network.push({
        method: event.request.method,
        url: event.request.url,
        body: event.request.postData ?? null,
      });
    });
    await navigate(page, fixture, 1440, 'light');

    // One complete finder includes every draft and keeps uncommitted lookup
    // state across ordinary view navigation. Committing a row intentionally
    // replaces Search/Show with Working on/Clear.
    await visible(page, '52 of 54 recorded');
    await fill(page, field('Search work'), 'draft');
    await visible(page, '50 of 54 recorded');
    await evaluate(page, `(() => {
      window.__t011FinderScrollEvents = [];
      const listener = (event) => {
        if (!event.target?.matches?.('[data-work-scroll]')) return;
        window.__t011FinderScrollEvents.push({
          top: event.target.scrollTop,
          at: performance.now(),
        });
      };
      document.addEventListener('scroll', listener, true);
      document.querySelector('[data-work-scroll]').scrollTop = 640;
    })()`);
    const requestedScroll = await until(() => evaluate(page, `(() => {
      const top = document.querySelector('[data-work-scroll]')?.scrollTop || 0;
      const events = window.__t011FinderScrollEvents || [];
      return top > 0 && events.some((event) => event.top === top)
        ? { top, eventCount: events.length, events: [...events] }
        : null;
    })()`), 'finder scroll event before Context entry');
    const retainedScroll = requestedScroll.top;
    const draftRow = '[data-work-path=".dude/ideas/030-draft-30.md"]';
    await evaluate(page, `(() => {
      const row = document.querySelector(${JSON.stringify(draftRow)});
      row.focus();
      return document.activeElement === row;
    })()`);
    const entryScroll = await until(() => evaluate(page, `(() => {
      const top = document.querySelector('[data-work-scroll]')?.scrollTop || 0;
      const events = window.__t011FinderScrollEvents || [];
      const latest = events.at(-1);
      return top > 0 && latest?.top === top
        ? { top, eventCount: events.length, events: [...events] }
        : null;
    })()`), 'settled finder scroll event before immediate Context navigation');
    await evaluate(page, `document.querySelector('#dude-tab-context').focus()`);
    await press(page, 'Enter');
    await visible(page, 'No record is selected');
    assert.equal(await evaluate(page, `document.querySelector('[role=tab][aria-selected=true]')?.innerText.trim()`), 'Now');
    assert.equal(await evaluate(page, `document.querySelectorAll('h1').length`), 1,
      'unselected Now has one heading rather than a redundant generic heading');
    await click(page, button('Back to Overview'));
    assert.equal(await evaluate(page, `${field('Search work')}.value`), 'draft');
    const restoredScrollState = await until(
      () => evaluate(page, `(() => {
        const top = document.querySelector('[data-work-scroll]')?.scrollTop || 0;
        return top === ${entryScroll.top} ? {
          top,
          eventCount: (window.__t011FinderScrollEvents || []).length,
          events: [...(window.__t011FinderScrollEvents || [])],
        } : null;
      })()`),
      'retained inner work-list position',
    );
    const restoredScroll = restoredScrollState.top;
    assert.ok(restoredScroll > 0);
    assert.equal(restoredScroll, entryScroll.top,
      'unselected navigation restores the last scroll position whose native event reached the production handler');

    await evaluate(page, `${field('Search work')}.focus()`);
    await press(page, 'ArrowDown');
    assert.equal(
      await evaluate(page, `document.activeElement?.getAttribute('data-work-path')`),
      '.dude/ideas/030-draft-30.md',
      'the retained roving position returns to the same uncommitted row',
    );
    await press(page, 'Enter');
    await visible(page, 'Intent for draft-30, with literal source text.');
    assert.equal(await evaluate(page, `document.querySelectorAll(${JSON.stringify(draftRow)}).length`), 0,
      'committing a row opens Now instead of leaving a second chooser behind');
    assert.equal(await evaluate(page, `document.querySelectorAll('input[type=search]').length`), 0,
      'selected mode replaces discovery rather than rendering a hidden duplicate search');
    await click(page, button('Back to Overview'));
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-path]').length`), 1,
      'selected Overview renders only the exact committed record');
    assert.equal(
      await evaluate(page, `document.querySelector('[data-work-path]')?.getAttribute('data-work-path')`),
      '.dude/ideas/030-draft-30.md',
    );
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    assert.equal(await evaluate(page, `${field('Search work')}.value`), '');
    assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'All');
    assert.equal(await evaluate(page, `document.querySelector('[data-work-scroll]').scrollTop`), 0);
    assert.equal(await evaluate(page, `document.activeElement === ${field('Search work')}`), true);

    await choose(page, 'Show', 'Closed');
    await visible(page, '2 of 54 recorded');
    await visible(page, 'Resolved ideas were not necessarily implemented');
    await click(page, `document.querySelector('[data-work-path=".dude/ideas/054-resolved-without-implementation.md"]')`);
    await visible(page, 'Resolution does not mean it was implemented');
    assert.equal(await evaluate(page, `document.body.innerText.includes('Define this draft explicitly')`), false);
    await click(page, button('Back to Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await visible(page, '54 of 54 recorded');

    // A late A response cannot put A's instruction under B's identity.
    let pausedRefresh = null;
    page.on('Fetch.requestPaused', (event) => {
      if (event.request.url.endsWith('/api/refresh')) pausedRefresh = event;
    });
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/refresh', requestStage: 'Response' }],
    });
    await click(page, `document.querySelector('[data-work-path=".dude/ideas/053-design-feature.md"]')`);
    await until(() => pausedRefresh, 'late Context A response');
    await click(page, button('Back to Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await click(page, `document.querySelector('[data-work-path=".dude/ideas/051-current-feature.md"]')`);
    await visible(page, 'current feature');
    assert.equal(await evaluate(page, `document.querySelector('[role=tabpanel]:not([hidden])').innerText
      .includes('Current instruction for design-feature')`), false);
    await page.send('Fetch.continueRequest', { requestId: pausedRefresh.requestId });
    await page.send('Fetch.disable');
    await visible(page, 'Current instruction for current-feature');

    // Permanent tabs are keyboard activated once and do not alter browsing
    // identity or issue a duplicate orientation request for the same context.
    await click(page, button('Back to Overview'));
    const readsBeforeTab = network.filter(({ url }) => url.endsWith('/api/refresh')).length;
    await evaluate(page, `document.querySelector('#dude-tab-context').focus()`);
    await press(page, 'Enter');
    await until(() => evaluate(page, `document.querySelector('[role=tabpanel]:not([hidden]) h1')?.innerText
      .includes('current feature')`), 'keyboard Context tab');
    assert.equal(network.filter(({ url }) => url.endsWith('/api/refresh')).length, readsBeforeTab);
    await evaluate(page, `document.querySelector('#dude-tab-overview').focus()`);
    await press(page, 'Enter');
    await visible(page, '1 selected record');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-work-path]').length`), 1);
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await visible(page, '54 of 54 recorded');

    for (const theme of ['light', 'dark']) {
      for (const width of [360, 768, 1440]) {
        await viewport(page, width, /** @type {'light'|'dark'} */ (theme));
        assert.equal(await evaluate(page, `${field('Show')}.innerText.trim()`), 'All');
        await audit(page, output, `work-finder-${width}-${theme}`);
      }
    }

    // Publish all six real classes. Inventory/history alone cannot create
    // these records, and selecting one stays within Needs you.
    const literal = '  第一\u00a0line\n\nKeep *literal* wording.  ';
    const requests = [
      requestFor(fixture, 'onboarding', {
        input: {
          kind: 'choice',
          options: [
            { id: 'capture', label: 'Capture one idea' },
            { id: 'define', label: 'Define existing intent' },
          ],
        },
      }),
      requestFor(fixture, 'fact', { input: { kind: 'text' } }),
      requestFor(fixture, 'manual_observation', {
        steps: ['Observe the host-only result.'],
        automationUnavailable: 'The embedded host cannot automate this subjective observation.',
        evidenceRequired: 'Describe the visible result.',
      }),
      requestFor(fixture, 'permission', {
        operation: 'fixture-only-exact-operation',
        targets: [{ target: 'fixture target A', revision: 'target-r1' }],
        consequences: 'Only fixture target A would change.',
        eligibility: 'The operation owner must revalidate every safety condition.',
        confirmation: 'Permit fixture A only',
      }),
      requestFor(fixture, 'scope_choice', {
        options: [
          { id: 'separate', label: 'Keep the scope separate', consequence: 'No unrelated work is reopened.' },
          { id: 'clarify', label: 'Discuss scope first', consequence: 'The owner waits for clarification.' },
        ],
      }),
      requestFor(fixture, 'preview', previewFields, {
        kind: 'feature',
        ideaPath: previewScope.ideaPath,
        specPath: previewScope.specPath,
      }),
    ];
    const pending = [];
    for (const request of requests) pending.push(await publish(fixture, request));
    assert.equal(fixture.provider.read().requests.length, 6,
      'ordinary blockers, inventory, and blank answers manufactured zero requests');
    await click(page, button('Needs you'));

    for (let requestIndex = 0; requestIndex < requests.length; requestIndex += 1) {
      const request = requests[requestIndex];
      const publication = pending[requestIndex];
      await click(page, `[...document.querySelectorAll('button')].find((node) =>
        node.innerText.includes(${JSON.stringify(request.prompt)}) && node.getClientRects().length)`);
      await visible(page, request.whyHuman);
      await visible(page, `Owner: ${request.owner}`);
      await visible(page, `Request: ${request.requestRef}`);
      assert.equal(await evaluate(page, `document.querySelector('[role=tab][aria-selected=true]')?.innerText.trim()`), 'Needs you');

      for (const theme of ['light', 'dark']) {
        for (const width of [360, 768, 1440]) {
          await viewport(page, width, /** @type {'light'|'dark'} */ (theme));
          await audit(page, output, `form-${request.class}-${width}-${theme}`);
        }
      }
      await viewport(page, 1440, 'light');

      if (request.class === 'preview') {
        assert.equal(await evaluate(page, `${button('Approve this revision')}.disabled`), true);
        assert.equal(await evaluate(page, `document.querySelectorAll('iframe').length`), 0,
          'preview selection does not auto-open Review');
        publication.controller.abort();
        const cancelled = JSON.parse((await publication.result).textResultForLlm);
        assert.equal(cancelled.status, 'cancelled');
        await click(page, button('All requests'));
        continue;
      }
      if (request.class === 'onboarding') {
        await choose(page, 'Your answer', 'Capture one idea');
      } else if (request.class === 'fact') {
        await fill(page, field('Your response'), literal);
      } else if (request.class === 'manual_observation') {
        await fill(page, field('What you observed'), literal);
      } else if (request.class === 'permission') {
        assert.equal(await evaluate(page, `${field('Enter the exact confirmation')}.value`), '',
          'literal confirmation is never prefilled');
        await fill(page, field('Enter the exact confirmation'), request.fields.confirmation);
        await click(page, field('I grant permission for this operation on these exact targets.'));
      } else {
        await choose(page, 'Alternative', 'Keep the scope separate');
        await fill(page, field('Additional context (optional)'), literal);
      }

      const responsePostsBefore = network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length;
      await click(page, button(request.class === 'permission' ? 'Send permission' : 'Send response'));
      // A second activation after the synchronous handler must be inert.
      await evaluate(page, `(${button(request.class === 'permission' ? 'Send permission' : 'Send response')})?.click()`);
      const delivered = JSON.parse((await publication.result).textResultForLlm);
      assert.equal(delivered.status, 'awaiting_acknowledgment');
      assert.equal(
        network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length,
        responsePostsBefore + 1,
        'synchronous click guard permits one response POST',
      );
      if (['fact', 'manual_observation', 'scope_choice'].includes(request.class)) {
        assert.equal(delivered.response.text, literal);
      }
      if (request.class === 'onboarding') assert.equal(delivered.response.optionId, 'capture');
      if (request.class === 'permission') {
        assert.equal(delivered.response.confirmation, request.fields.confirmation);
        assert.deepEqual(delivered.response.targets, request.fields.targets);
      }
      await visible(page, 'Awaiting acknowledgment');
      const outcome = request.class === 'fact' ? 'accepted' : 'applied';
      await acknowledge(fixture, delivered.receipt, outcome, request.source);
      await visible(page, outcome === 'accepted'
        ? 'The owner accepted this response' : 'The owner confirmed application');
      await click(page, button('All requests'));
    }

    // Simulate a response that reached the provider but whose HTTP response was
    // lost. Reconciliation may show the receipt; it cannot replay the POST.
    const uncertainRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } });
    uncertainRequest.prompt = 'Response whose HTTP result is lost';
    const uncertain = await publish(fixture, uncertainRequest);
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Response whose HTTP result is lost') && node.getClientRects().length)`);
    await fill(page, field('Your response'), literal);
    let pausedResponse = null;
    page.on('Fetch.requestPaused', (event) => {
      if (event.request.url.endsWith('/api/needs-you/respond')) pausedResponse = event;
    });
    await page.send('Fetch.enable', {
      patterns: [{ urlPattern: '*/api/needs-you/respond', requestStage: 'Response' }],
    });
    const uncertainPostsBefore = network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length;
    await click(page, button('Send response'));
    await until(() => pausedResponse, 'held response after provider delivery');
    const uncertainTool = JSON.parse((await uncertain.result).textResultForLlm);
    assert.equal(uncertainTool.response.text, literal);
    await page.send('Fetch.failRequest', {
      requestId: pausedResponse.requestId,
      errorReason: 'ConnectionReset',
    });
    await page.send('Fetch.disable');
    await visible(page, 'Awaiting acknowledgment');
    await click(page, button('Refresh'));
    await visible(page, 'Awaiting acknowledgment');
    assert.equal(
      network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length,
      uncertainPostsBefore + 1,
      'lost HTTP result is reconciled without automatic resubmission',
    );
    await acknowledge(fixture, uncertainTool.receipt, 'declined', uncertainRequest.source);
    await visible(page, 'The owner declined this response');

    assert.deepEqual(runtimeErrors, []);
    assert.equal(fixture.instance.eventClients.size, 1);
    const origins = new Set(network.filter(({ url }) => /^https?:/.test(url)).map(({ url }) => new URL(url).origin));
    assert.deepEqual([...origins], [new URL(fixture.instance.url).origin]);
    const paths = network.filter(({ url }) => /^https?:/.test(url)).map(({ url }) => new URL(url).pathname);
    assert.equal(paths.some((value) => /(?:acknowledge|answer|approval|command|workflow|task-write)/i.test(value)), false,
      'browser invokes no protected workflow mutation or owner acknowledgment route');
    output.results.push({
      case: 'finder-forms-races',
      pass: true,
      retainedScroll,
      finderScrollOrdering: {
        requested: requestedScroll,
        beforeEntry: entryScroll,
        afterReturn: restoredScrollState,
      },
      browser: browserState.version.Browser,
      responsePosts: paths.filter((value) => value === '/api/needs-you/respond').length,
      requestCount: fixture.provider.read().requests.length,
    });
  } finally {
    fixture?.provider.dispose();
    if (fixture) await closeInstance(fixture.instanceId);
    if (fixture?.root) fs.rmSync(fixture.root, { recursive: true, force: true });
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T011 browser: mounted Review seals a real PNG once, acknowledges, preserves history, and requires fresh approval', {
  timeout: 300_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't011-review');
  const board = installEmptyBoard();
  let browserState;
  const fixtures = [];
  const runtimeErrors = [];
  const network = [];
  const geometryFindings = [];
  const stateFindings = [];
  const mobileToolbar = [];
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-review-'));
    createIdea(root, 1, 'draft-without-review');
    const feature = createIdea(root, 2, 'review-feature', 'defined');
    const browsingFeature = createIdea(root, 3, 'history-browsing-context', 'defined');
    const preview = createPreview(root, /** @type {any} */ (feature));
    const fixture = await createFixture(root);
    fixtures.push(fixture);
    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      network.push({
        method: event.request.method,
        url: event.request.url,
        body: event.request.postData ?? null,
      });
    });

    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const feedbackRequest = requestFor(fixture, 'preview', preview, scope);
    feedbackRequest.prompt = 'Annotate the exact current revision';
    const feedback = await publish(fixture, feedbackRequest);
    const otherRequest = requestFor(fixture, 'preview', preview, scope);
    otherRequest.prompt = 'Independent second preview request';
    const other = await publish(fixture, otherRequest);

    await navigate(page, fixture, 1440, 'light');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Review design requests');
    assert.equal(await evaluate(page, `document.querySelectorAll('iframe').length`), 0);
    await click(page, button('Review design requests'));
    await visible(page, 'Annotate the exact current revision');
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-workspace]').length`), 0,
      'multiple current matches route to explicit request choice instead of auto-selecting');
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Annotate the exact current revision') && node.getClientRects().length)`);
    await click(page, button('Open Review'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`), 'mounted production Review engine', 30_000);

    const toolbarControlNames = [
      'Move tools', 'Select (V)', 'Comment (C)', 'Box (B)', 'Circle (O)', 'Arrow (A)', 'Line (L)', 'Highlight (H)',
      'Undo annotation', 'Redo annotation', 'Switch tools to horizontal',
    ];
    const workflowControlNames = ['Save markup', 'Comments (0)', 'Send annotations'];
    for (const theme of ['light', 'dark']) {
      for (const width of [360, 768, 1440]) {
        await viewport(page, width, /** @type {'light'|'dark'} */ (theme));
        await audit(page, output, `live-review-${width}-${theme}`, geometryFindings);
        if (width === 360) {
          // Arrange: the engine has admitted this exact narrow frame before a
          // compact tool changes. Drawing tools stay in the marked floating
          // palette; workflow actions remain in their separate command row.
          const before = await reviewToolbarSnapshot(page);

          // Act: traverse the enabled Fluent toolbar in its rendered order,
          // then select the formerly clipped final drawing tool.
          const enabledRovingOrder = before.toolbar.buttons
            .filter(({ disabled }) => !disabled)
            .map(({ name }) => name);
          await evaluate(page, `document.querySelector('[aria-label="Select (V)"]').focus()`);
          const traversed = [];
          for (let index = 0; index < enabledRovingOrder.length; index += 1) {
            traversed.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
              || document.activeElement?.innerText.trim()`));
            await press(page, 'ArrowDown');
          }
          const wrappedFocus = await evaluate(page, `document.activeElement?.getAttribute('aria-label')
            || document.activeElement?.innerText.trim()`);
          await click(page, `document.querySelector('[aria-label="Highlight (H)"]')`);
          await until(() => evaluate(page, `document.querySelector('[aria-label="Highlight (H)"]')
            ?.getAttribute('aria-pressed') === 'true'`), `${theme} Highlight selection`);
          await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() =>
            Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
          const after = await reviewToolbarSnapshot(page);

          // Assert: target sizing and each individual bound use clientWidth,
          // not the wider innerWidth or only a page-overflow proxy.
          assert.deepEqual(before.controls.map(({ name }) => name), toolbarControlNames);
          assert.deepEqual(before.workflow.map(({ name }) => name), workflowControlNames);
          assert.deepEqual(before.workflow.filter(({ missing, inPalette }) => missing || inPalette), [],
            `${theme} workflow actions remain present outside the floating palette`);
          assert.deepEqual(
            { marker: before.palette.marker, role: before.toolbar.role,
              label: before.toolbar.label, orientation: before.toolbar.orientation },
            { marker: true, role: 'toolbar', label: 'Annotation tools', orientation: 'vertical' },
            `${theme} default floating tool semantics are explicitly vertical`,
          );
          assert.deepEqual(traversed, enabledRovingOrder);
          assert.equal(wrappedFocus, 'Select (V)',
            `${theme} vertical toolbar ArrowDown navigation wraps to its first enabled control`,
          );
          for (const snapshot of [before, after]) {
            assert.deepEqual(
              snapshot.controls.filter(({ x, y, right, bottom, width: controlWidth, height }) => (
                x < snapshot.palette.x - 1 || y < snapshot.palette.y - 1
                || right > snapshot.palette.right + 1 || bottom > snapshot.palette.bottom + 1
                || x < -1 || y < -1 || right > snapshot.clientWidth + 1
                || bottom > snapshot.clientHeight + 1 || controlWidth < 24 || height < 24
              )),
              [],
              `${theme} 360px drawing tools fit both the palette and visible viewport at 24px minimum`,
            );
          }
          assert.deepEqual(after.frame, before.frame,
            `${theme} Highlight wrapping does not resize the already admitted Review frame`);
          mobileToolbar.push({ theme, before, after, traversed, wrappedFocus });
        }
      }
    }
    await viewport(page, 1440, 'light');
    const frameWidth = await evaluate(page, `document.querySelector('.dude-review-frame').clientWidth`);
    await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
    await openReviewDetails(page);
    await click(page, button('Add at center'));
    await click(page, button('Comments (1)'));
    const literal = '  第一\u00a0comment\n\nKeep `literal` markup.  ';
    await fill(page, field('Comment (optional)'), literal);
    await until(() => evaluate(page, `${field('Comment (optional)')}.value === ${JSON.stringify(literal)}`), 'rendered literal comment');
    const expectedCaret = { start: 3, end: 24, direction: 'backward' };
    assert.ok(expectedCaret.start >= 0 && expectedCaret.end <= literal.length
      && expectedCaret.start < expectedCaret.end, 'backward caret fixture is a bounded non-collapsed range');
    await evaluate(page, `(() => {
      const node = ${field('Comment (optional)')};
      node.focus();
      node.setSelectionRange(${expectedCaret.start}, ${expectedCaret.end}, ${JSON.stringify(expectedCaret.direction)});
      node.dispatchEvent(new Event('select', { bubbles: true }));
    })()`);
    await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() =>
      Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
    const caretBefore = await evaluate(page, `({
      start: ${field('Comment (optional)')}.selectionStart,
      end: ${field('Comment (optional)')}.selectionEnd,
      direction: ${field('Comment (optional)')}.selectionDirection
    })`);
    assert.deepEqual(caretBefore, expectedCaret);
    await click(page, `document.querySelector('[aria-label="Close comments"]')`);
    assert.equal(await evaluate(page, `document.querySelector('.dude-review-frame').clientWidth`), frameWidth,
      'overlay drawer does not resize the reviewed source frame');

    const workIndexBeforeSave = network.filter(({ url }) => url.endsWith('/api/work-index')).length;
    const savePostsBefore = network.filter(({ url }) => url.endsWith('/api/needs-you/review/save')).length;
    await click(page, button('Save markup'));
    await until(
      () => network.filter(({ url }) => url.endsWith('/api/needs-you/review/save')).length === savePostsBefore + 1,
      'one working-markup save',
    );
    await openReviewDetails(page);
    await visible(page, 'Working markup matches the saved revision');
    await until(() => fixture.provider.read().requests.find((item) => (
      item.request.requestRef === feedbackRequest.requestRef && !item.reviewing
    )), 'provider save completion');
    const liveReviewRecord = fixture.provider.read().requests.find(
      (item) => item.request.requestRef === feedbackRequest.requestRef,
    );
    const savedWorking = JSON.parse(fs.readFileSync(path.join(
      root,
      ...path.posix.dirname(feature.specPath).split('/'),
      'reviews',
      liveReviewRecord.reviewSubmissionId,
      'working.json',
    ), 'utf8'));
    const savedCaret = savedWorking.state.caret
      ? {
        start: savedWorking.state.caret.start,
        end: savedWorking.state.caret.end,
        direction: savedWorking.state.caret.direction,
      }
      : null;
    if (!savedCaret || savedCaret.start !== caretBefore.start || savedCaret.end !== caretBefore.end
      || savedCaret.direction !== caretBefore.direction) {
      stateFindings.push({
        case: 'comment caret in explicit working save',
        expected: caretBefore,
        actual: savedCaret,
      });
    }
    assert.equal(
      network.filter(({ url }) => url.endsWith('/api/work-index')).length,
      workIndexBeforeSave,
      'a Needs You autosave hint does not trigger a full work-index scan',
    );

    await click(page, button('Back'));
    assert.ok(['Open Review', 'Needs you'].includes(await evaluate(page, `document.activeElement?.innerText.trim()`)),
      'Back restores the exact entry control or its stable Needs you tab fallback');
    await click(page, button('Open Review'));
    await visible(page, 'Comments (1)');
    // Open synchronously while the retained engine is still restoring its
    // frame. The textarea exists disabled first; its browser-default range must
    // not overwrite the pending canonical backward selection.
    await evaluate(page, `${button('Comments (1)')}.click()`);
    const pendingSample = await until(() => evaluate(page, `(() => {
      const node = ${field('Comment (optional)')};
      if (!node?.disabled) return null;
      const pending = {
        start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection
      };
      node.setSelectionRange(0, 0, 'none');
      node.dispatchEvent(new Event('select', { bubbles: true }));
      return {
        pending,
        empty: {
          start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection
        }
      };
    })()`), 'disabled comment field during Review reactivation');
    const disabledRestore = pendingSample.pending;
    const mountedEmptySelection = pendingSample.empty;
    assert.deepEqual(disabledRestore, expectedCaret,
      'the pending canonical range is applied while the remounted field is still disabled');
    assert.deepEqual(
      { start: mountedEmptySelection.start, end: mountedEmptySelection.end },
      { start: 0, end: 0 },
      'the remounted browser field exposes the collapsed range that must not become canonical',
    );
    assert.match(
      mountedEmptySelection.direction,
      /^(?:forward|backward|none)$/,
      'collapsed browser ranges may serialize direction differently but still use valid metadata',
    );
    assert.throws(
      () => assert.deepEqual(
        {
          start: mountedEmptySelection.start,
          end: mountedEmptySelection.end,
          // Keep direction valid so this falsifier can fail only because the
          // valuable nonempty canonical range was replaced.
          direction: expectedCaret.direction,
        },
        expectedCaret,
        'the canonical backward selection must remain nonempty',
      ),
      /the canonical backward selection must remain nonempty/,
      'replacing the canonical caret with the transient collapsed range fails the exact range oracle',
    );
    const restoredCaret = await until(() => evaluate(page, `(() => {
      const node = ${field('Comment (optional)')};
      if (!node || node.disabled || document.activeElement !== node) return null;
      return { start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection };
    })()`), 'enabled comment field with restored backward range');
    if (restoredCaret.start !== caretBefore.start || restoredCaret.end !== caretBefore.end
      || restoredCaret.direction !== caretBefore.direction) {
      stateFindings.push({
        case: 'comment caret after unchanged-source Back and reopen',
        expected: caretBefore,
        actual: restoredCaret,
      });
    }
    await click(page, `document.querySelector('[aria-label="Close comments"]')`);

    // A drawer closed during the same pending reactivation must cancel its
    // focus intent. Once the engine becomes actionable it cannot steal focus
    // back into a hidden old textarea.
    await click(page, button('Back'));
    await click(page, button('Open Review'));
    await visible(page, 'Comments (1)');
    await evaluate(page, `${button('Comments (1)')}.click()`);
    const pendingClose = await until(() => evaluate(page, `(() => {
      const node = ${field('Comment (optional)')};
      return node?.disabled ? true : null;
    })()`), 'second disabled comment field during Review reactivation');
    await evaluate(page, `document.querySelector('[aria-label="Close comments"]').click()`);
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')
      ?.getClientRects().length`), 'closed pending comment drawer');
    await evaluate(page, `document.querySelector('[data-review-return]').focus()`);
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Box (B)"]').disabled`),
      'Review actionable after pending drawer close');
    await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() =>
      Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
    assert.equal(await evaluate(page, `document.activeElement === document.querySelector('[data-review-return]')`), true,
      'closing a pending caret restore prevents later focus theft');

    for (const [tool, shortcut] of [
      ['Circle', 'O'],
      ['Arrow', 'A'],
      ['Line', 'L'],
      ['Highlight', 'H'],
    ]) {
      await click(page, `document.querySelector('[aria-label="${tool} (${shortcut})"]')`);
      await openReviewDetails(page);
      await click(page, button('Add at center'));
    }
    await click(page, `document.querySelector('[aria-label="Undo annotation"]')`);
    await visible(page, 'Comments (4)');
    await click(page, `document.querySelector('[aria-label="Redo annotation"]')`);
    await visible(page, 'Comments (5)');
    await openReviewDetails(page);
    await until(() => evaluate(page, `Boolean(${field('Choose an element')})`),
      'disclosed element chooser');
    await choose(page, 'Choose an element', 'Preserve the current user wording.');
    await click(page, button('Add comment'));
    await fill(page, field('Comment (optional)'), 'Make the selected copy clearer.');
    await fill(page, field('Suggested replacement text'), 'Preserve this exact replacement.');
    await fill(page, field('Suggested style change'), 'Keep body-sized instructions.');
    await fill(page, field('X1'), '70');
    await press(page, 'Tab');
    await click(page, `document.querySelector('[aria-label="Close comments"]')`);
    await visible(page, 'Comments (6)');

    // Return preserves source scroll/markup. A capture attempt with an anchor
    // outside the viewed viewport fails without consuming the waiter.
    await openReviewDetails(page);
    await click(page, button('Scroll mock down'));
    await until(() => evaluate(page, `!${button('Scroll mock up')}.disabled`), 'review viewport scrolled down');
    await click(page, button('Back'));
    await click(page, button('Open Review'));
    await visible(page, 'Comments (6)');
    await openReviewDetails(page);
    await until(() => evaluate(page, `!${button('Scroll mock up')}.disabled`), 'restored nonzero review scroll');
    await closeReviewDetails(page);
    const refusalSealPosts = network.filter(({ url }) => (
      new URL(url).pathname === '/api/needs-you/review/seal'
    )).length;
    await click(page, button('Send annotations'));
    await until(() => evaluate(page, `document.querySelector('[data-review-feedback]')
      ?.innerText.includes('Send blocked')`), 'actionable Send blocker beside the command');
    assert.equal(
      fixture.provider.read().requests.find(({ requestHandle }) => requestHandle === feedback.record.requestHandle).phase,
      'pending',
    );
    const captureRefusalNotice = await evaluate(page, `(() => {
      const node = document.querySelector('[data-review-feedback]');
      const labels = (node?.getAttribute('aria-labelledby') || '').trim().split(/\\s+/)
        .filter(Boolean).map((id) => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || null);
      return node ? {
        text: node.innerText.replace(/\\s+/g, ' ').trim(),
        labels,
        detailsOpen:Boolean(document.querySelector(
          '.fui-PopoverSurface[aria-label="Notes and more"]'
        )?.getClientRects().length),
        inspect:Boolean([...node.querySelectorAll('button')]
          .find(button => button.innerText.trim() === 'Inspect annotations')),
      } : null;
    })()`);
    assert.match(
      captureRefusalNotice?.text ?? '',
      /Send blocked Annotation(?:s)? [\d, ]+ (?:is|are) not fully visible and cannot be captured\. Edit (?:its|their) coordinates or delete (?:it|them) in Comments\. Inspect annotations/,
    );
    assert.equal(captureRefusalNotice?.detailsOpen, false,
      'the current failure is visible beside Send rather than only behind Read notice');
    assert.equal(captureRefusalNotice?.inspect, true,
      'the current failure provides its direct annotation-inspection path');
    assert.equal(
      network.filter(({ url }) => new URL(url).pathname === '/api/needs-you/review/seal').length,
      refusalSealPosts,
      'client-visible blockers refuse before a seal request or capture',
    );
    await click(page, button('Inspect annotations'));
    await until(() => evaluate(page, `Boolean(document.querySelector(
      '[data-annotation-id][aria-current="true"]'
    )?.innerText.includes('Outside view; blocks Send'))`), 'Inspect selects an existing blocking row');
    await click(page, button('Done'));
    await audit(page, output, 'capture-refusal-retains-markup');

    // Re-enter this still-current Review from Needs you while Context browses
    // a different feature. History belongs to the request scope, not selection.
    await click(page, button('Back'));
    await click(page, button('Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await click(page, `document.querySelector('[data-work-path="${browsingFeature.ideaPath}"]')`);
    await visible(page, 'Intent for history-browsing-context, with literal source text.');
    await click(page, button('Needs you'));
    await visible(page, feedbackRequest.prompt);
    await click(page, button('Open Review'));
    await visible(page, 'Comments (6)');

    // Restore the exact reviewed viewport, seal through the real capture
    // process, and verify one typed text+PNG result reaches the original waiter.
    await openReviewDetails(page);
    await click(page, button('Scroll mock up'));
    await until(() => evaluate(page, `${button('Scroll mock up')}.disabled`), 'review viewport returned to top');
    await closeReviewDetails(page);
    await visible(page, 'Comments (6)');
    const paletteHomeGeometry = await evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame').getBoundingClientRect();
      const palette = document.querySelector('[data-review-tools]').getBoundingClientRect();
      return {
        frame: frame.toJSON(),
        palette: palette.toJSON(),
        offset: document.querySelector('[data-review-tools]')
          .getAttribute('data-review-tools-offset'),
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        deviceScale: devicePixelRatio,
      };
    })()`);
    assert.equal(paletteHomeGeometry.offset, '0,0');
    const ownerHomeCapture = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const ownerAtHome = Buffer.from(ownerHomeCapture.data, 'base64');
    fs.writeFileSync(path.join(output.directory, 'review-send-owner-palette-home.png'), ownerAtHome);
    const ownerHomeDecoded = decodePng(ownerAtHome);
    const ownerScale = {
      x: ownerHomeDecoded.width / paletteHomeGeometry.clientWidth,
      y: ownerHomeDecoded.height / paletteHomeGeometry.clientHeight,
    };
    const rgba = (decoded, x, y) => {
      const px = Math.max(0, Math.min(decoded.width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(decoded.height - 1, Math.round(y)));
      return [...decoded.pixels.subarray((py * decoded.width + px) * 4,
        (py * decoded.width + px) * 4 + 4)];
    };

    // Park with the non-drag pointer path. The home screenshot is the
    // source-only reference for the footprint where both the moved palette and
    // its adjacent popup will later be visible.
    const captureGrip = `document.querySelector('[data-review-tools-grip]')`;
    const captureMenu = `document.querySelector('[data-review-tools-menu]')`;
    const captureMenuItem = label => `[...document.querySelectorAll(
      '[data-review-tools-menu] [role="menuitem"]'
    )].find(node => node.textContent.trim() === ${JSON.stringify(label)})`;
    await clickAtCurrentPosition(page, captureGrip);
    await until(() => evaluate(page, `Boolean(${captureMenu}?.getClientRects().length)`),
      'capture position menu opened');
    await until(() => evaluate(page, `document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .every(animation => animation.playState === 'finished' || animation.playState === 'idle')`),
    'capture position menu motion');
    await clickAtCurrentPosition(page, captureMenuItem('Bottom left'));
    await until(() => evaluate(page, `!${captureMenu}?.getClientRects().length`),
      'capture position menu selected');
    await evaluate(page,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const paletteOwnerGeometry = await evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame').getBoundingClientRect();
      const node = document.querySelector('[data-review-tools]');
      const palette = node.getBoundingClientRect();
      const stage = node.parentElement;
      return {
        frame:frame.toJSON(),
        palette:palette.toJSON(),
        offset:node.getAttribute('data-review-tools-offset'),
        expectedOffset:[
          Math.ceil(Math.min(-node.offsetLeft, 0)),
          Math.floor(Math.max(stage.clientHeight - node.offsetTop - node.offsetHeight, 0)),
        ].join(','),
        clientWidth:document.documentElement.clientWidth,
        clientHeight:document.documentElement.clientHeight,
        deviceScale:devicePixelRatio,
      };
    })()`);
    assert.deepEqual(paletteOwnerGeometry.frame, paletteHomeGeometry.frame,
      'parking the palette over the mock leaves the capture frame byte-identical');
    assert.equal(paletteOwnerGeometry.offset, paletteOwnerGeometry.expectedOffset,
      'Bottom left uses the exact layout-derived clamp limits');
    const channelDistance = (left, right) => Math.max(...left.slice(0, 3)
      .map((channel, index) => Math.abs(channel - right[index])));
    const responsePostsBefore = network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length;
    let observedToolResult = null;
    let observedToolError = null;
    feedback.result.then(
      result => { observedToolResult = result; },
      error => { observedToolError = error; },
    );
    const sendStartedAt = Date.now();
    await click(page, button('Send annotations'));
    await evaluate(page, `(${button('Send annotations')})?.click()`);
    await clickAtCurrentPosition(page, captureGrip);
    await until(() => evaluate(page, `${captureGrip}.getAttribute('aria-expanded') === 'true'
      && Boolean(${captureMenu}?.getClientRects().length)`), 'capture menu reopened during seal');
    const menuReopenedAt = Date.now();
    assert.equal(observedToolResult, null,
      'the real capture must still be pending when the popup exclusion screenshot is taken');
    assert.equal(observedToolError, null);
    await until(() => evaluate(page, `document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .every(animation => animation.playState === 'finished' || animation.playState === 'idle')`),
    'capture popup motion during seal');
    await evaluate(page,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const paletteMenuOwnerGeometry = await evaluate(page, `(() => ({
      frame:document.querySelector('.dude-review-frame').getBoundingClientRect().toJSON(),
      palette:document.querySelector('[data-review-tools]').getBoundingClientRect().toJSON(),
      menu:${captureMenu}.getBoundingClientRect().toJSON(),
      gripExpanded:${captureGrip}.getAttribute('aria-expanded'),
    }))()`);
    assert.deepEqual(paletteMenuOwnerGeometry.frame, paletteHomeGeometry.frame);
    assert.deepEqual(paletteMenuOwnerGeometry.palette, paletteOwnerGeometry.palette);
    assert.equal(paletteMenuOwnerGeometry.gripExpanded, 'true');
    const ownerCapture = await page.send('Page.captureScreenshot', {
      format:'png',
      captureBeyondViewport:false,
    });
    const ownerWithPaletteMenu = Buffer.from(ownerCapture.data, 'base64');
    fs.writeFileSync(
      path.join(output.directory, 'review-send-owner-with-palette-menu.png'),
      ownerWithPaletteMenu,
    );
    const ownerDecoded = decodePng(ownerWithPaletteMenu);
    const toolResult = await feedback.result;
    const deliveredAt = Date.now();
    assert.equal(await evaluate(page, `${captureGrip}.getAttribute('aria-expanded')`), 'true',
      'the popup remains open through real PNG delivery');
    const delivered = JSON.parse(toolResult.textResultForLlm);
    assert.equal(delivered.status, 'awaiting_acknowledgment');
    assert.equal(delivered.response.action, 'annotations');
    assert.equal(toolResult.binaryResultsForLlm.length, 1);
    assert.equal(toolResult.binaryResultsForLlm[0].mimeType, 'image/png');
    const binaryData = toolResult.binaryResultsForLlm[0].data;
    const png = Buffer.isBuffer(binaryData)
      ? binaryData
      : typeof binaryData === 'string'
        ? Buffer.from(binaryData, 'base64')
        : Buffer.from(binaryData);
    assert.ok(png.length > 1_000);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    fs.writeFileSync(path.join(output.directory, 'review-send-delivered.png'), png);
    const decodedPng = decodePng(png);
    const pngScale = {
      x:decodedPng.width / paletteOwnerGeometry.frame.width,
      y:decodedPng.height / paletteOwnerGeometry.frame.height,
    };
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const sourceNeighborhoodSpread = (x, y) => {
      const pixels = [];
      const centerX = Math.round(x * ownerScale.x);
      const centerY = Math.round(y * ownerScale.y);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        pixels.push(rgba(ownerHomeDecoded, centerX + dx, centerY + dy));
      }
      return Math.max(...pixels.flatMap((left, index) => (
        pixels.slice(index + 1).map(right => channelDistance(left, right))
      )));
    };
    const stableSourceErrorLimit = 8;
    const assertStableSourceBound = (name, samples) => {
      assert.ok(samples.length > 0, `${name}: the stable-source bound needs a selected pixel`);
      const maximum = Math.max(...samples.map(sample => sample.distanceToMock));
      assert.ok(maximum <= stableSourceErrorLimit,
        `${name}: every flat-painted distinguishing pixel must remain within ${
          stableSourceErrorLimit} channel levels of its source; maximum was ${maximum}`);
      return maximum;
    };

    // Arrange: this translucent-contamination control satisfies the relative
    // classifier (it is closer to source than chrome) but is far from source.
    const syntheticContamination = {
      source:[255, 255, 255, 255],
      chrome:[66, 66, 66, 255],
      delivered:[200, 200, 200, 255],
    };
    syntheticContamination.distanceToMock = channelDistance(
      syntheticContamination.delivered,
      syntheticContamination.source,
    );
    syntheticContamination.distanceToChrome = channelDistance(
      syntheticContamination.delivered,
      syntheticContamination.chrome,
    );
    syntheticContamination.distanceAdvantage = syntheticContamination.distanceToChrome
      - syntheticContamination.distanceToMock;
    syntheticContamination.followingChrome = syntheticContamination.distanceToChrome
      <= stableSourceErrorLimit;

    // Act: exercise the same absolute helper used for the delivered PNG.
    let syntheticBoundFailure = null;
    try {
      assertStableSourceBound('synthetic translucent chrome', [syntheticContamination]);
    } catch (error) {
      syntheticBoundFailure = {name:error.name, message:error.message};
    }

    // Assert: the former relative-only oracle would pass this pixel, while the
    // restored measured eight-level source bound must reject it.
    assert.deepEqual({
      distanceToMock:syntheticContamination.distanceToMock,
      distanceToChrome:syntheticContamination.distanceToChrome,
      distanceAdvantage:syntheticContamination.distanceAdvantage,
      followingChrome:syntheticContamination.followingChrome,
    }, {
      distanceToMock:55,
      distanceToChrome:134,
      distanceAdvantage:79,
      followingChrome:false,
    });
    assert.ok(syntheticBoundFailure,
      'the stable-source oracle must reject synthetic translucent chrome contamination');
    assert.match(syntheticBoundFailure.message, /within 8 channel levels.+maximum was 55/);
    const syntheticCaptureFalsification = {
      ...syntheticContamination,
      priorRelativeOraclePasses:syntheticContamination.distanceAdvantage > 0
        && !syntheticContamination.followingChrome,
      absoluteSourceBound:stableSourceErrorLimit,
      rejectedByAbsoluteBound:true,
      failure:syntheticBoundFailure,
    };
    const judgeSurface = (name, box) => {
      const samples = [];
      for (let y = Math.ceil(box.top) + 3; y < box.bottom - 3; y += 2) {
        for (let x = Math.ceil(box.left) + 3; x < box.right - 3; x += 2) {
          const relative = {
            x:x - paletteOwnerGeometry.frame.left,
            y:y - paletteOwnerGeometry.frame.top,
          };
          if (relative.x < 1 || relative.y < 1
            || relative.x >= paletteOwnerGeometry.frame.width - 1
            || relative.y >= paletteOwnerGeometry.frame.height - 1) continue;
          const home = rgba(ownerHomeDecoded, x * ownerScale.x, y * ownerScale.y);
          const open = rgba(ownerDecoded, x * ownerScale.x, y * ownerScale.y);
          const chromeDistance = channelDistance(home, open);
          if (chromeDistance <= 40) continue;
          const deliveredPixel = rgba(
            decodedPng,
            relative.x * pngScale.x,
            relative.y * pngScale.y,
          );
          const distanceToMock = channelDistance(deliveredPixel, home);
          const distanceToChrome = channelDistance(deliveredPixel, open);
          samples.push({
            x,
            y,
            relative,
            home,
            open,
            delivered:deliveredPixel,
            chromeDistance,
            sourceNeighborhoodSpread:sourceNeighborhoodSpread(x, y),
            distanceToMock,
            distanceToChrome,
            distanceAdvantage:distanceToChrome - distanceToMock,
          });
        }
      }
      const stable = samples.filter(sample => sample.sourceNeighborhoodSpread <= 2);
      const result = {
        name,
        distinguishingSamples:samples.length,
        stableSourceSamples:stable.length,
        unstableEdgeSamplesExcluded:samples.length - stable.length,
        stableCloserToMock:stable.filter(sample => sample.distanceAdvantage > 0).length,
        stableFollowingChrome:stable.filter(
          sample => sample.distanceToChrome <= stableSourceErrorLimit,
        ).length,
        stableSourceErrorLimit,
        minimumStableDistanceAdvantage:Math.min(...stable.map(sample => sample.distanceAdvantage)),
        meanStableDistanceToMock:mean(stable.map(sample => sample.distanceToMock)),
        meanStableDistanceToChrome:mean(stable.map(sample => sample.distanceToChrome)),
        maximumStableDistanceToMock:assertStableSourceBound(name, stable),
        strongestStable:stable.slice()
          .sort((left, right) => right.chromeDistance - left.chromeDistance)[0],
      };
      assert.ok(result.distinguishingSamples > 50 && result.stableSourceSamples > 50,
        `${name}: calibrated exclusion needs at least 50 distinguishing and flat-painted samples`);
      assert.equal(result.stableCloserToMock, result.stableSourceSamples,
        `${name}: every flat-painted distinguishing pixel must be closer to mock than visible chrome`);
      assert.ok(result.minimumStableDistanceAdvantage > 0,
        `${name}: stable source classification must have a positive per-sample margin`);
      assert.equal(result.stableFollowingChrome, 0,
        `${name}: no flat-painted distinguishing pixel may follow the visible surface`);
      return result;
    };
    const chromeExclusion = {
      palette:judgeSurface('palette', paletteMenuOwnerGeometry.palette),
      menu:judgeSurface('menu', paletteMenuOwnerGeometry.menu),
    };

    // Align the independent fresh-render PNG with a text-bearing region that
    // neither visible surface touches. Exact equality is intentionally not the
    // oracle: the owner screenshot carries a display ICC profile while capture
    // is explicitly sRGB, so 8-bit conversion may round a channel by one. The
    // correct origin must instead be the unique nearest physical-pixel offset.
    const control = [];
    for (let y = 40; y < 80; y += 1) for (let x = 100; x < 340; x += 1) {
      const absolute = {
        x:paletteOwnerGeometry.frame.left + x,
        y:paletteOwnerGeometry.frame.top + y,
      };
      control.push({absolute, relative:{x, y}});
    }
    const controlAtOffset = (dx, dy) => {
      const distances = control.map(({absolute, relative}) => {
        const sourcePixel = rgba(
          ownerHomeDecoded,
          absolute.x * ownerScale.x + dx,
          absolute.y * ownerScale.y + dy,
        );
        const deliveredPixel = rgba(
          decodedPng,
          relative.x * pngScale.x,
          relative.y * pngScale.y,
        );
        return channelDistance(sourcePixel, deliveredPixel);
      });
      return {
        dx,
        dy,
        exact:distances.filter(distance => distance === 0).length,
        meanDistance:mean(distances),
        maximumDistance:Math.max(...distances),
      };
    };
    const aligned = controlAtOffset(0, 0);
    const adjacent = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dx, dy]) => controlAtOffset(dx, dy));
    const controlColors = new Set();
    let changedWhenMenuOpened = 0;
    for (const {absolute} of control) {
      const home = rgba(ownerHomeDecoded, absolute.x * ownerScale.x, absolute.y * ownerScale.y);
      const open = rgba(ownerDecoded, absolute.x * ownerScale.x, absolute.y * ownerScale.y);
      controlColors.add(JSON.stringify(home));
      if (channelDistance(home, open) > 0) changedWhenMenuOpened += 1;
    }
    const alignedControl = {
      samples:control.length,
      distinctSourceColors:controlColors.size,
      changedWhenMenuOpened,
      aligned,
      adjacent,
    };
    assert.ok(alignedControl.samples > 100 && alignedControl.distinctSourceColors > 16,
      'the alignment control must contain real text edges rather than a uniform background');
    assert.equal(alignedControl.changedWhenMenuOpened, 0,
      'the palette and popup must not touch the independent alignment control');
    assert.ok(aligned.maximumDistance <= 2,
      'the aligned control must stay within the existing compositor rounding bound');
    assert.ok(adjacent.every(candidate => aligned.meanDistance < candidate.meanDistance
      && aligned.exact > candidate.exact),
    `the true capture origin must beat every adjacent physical-pixel origin: ${
      JSON.stringify(alignedControl)}`);
    const paletteChromeProbe = chromeExclusion.palette.strongestStable;
    writeEvidenceJson(output, 'review-send-palette-exclusion.metrics', {
      geometry: {
        home:paletteHomeGeometry,
        parked:paletteOwnerGeometry,
        openDuringSeal:paletteMenuOwnerGeometry,
      },
      timing:{sendStartedAt, menuReopenedAt, deliveredAt},
      homeScreenshot: {
        bytes: ownerAtHome.length,
        sha256: sha256(ownerAtHome),
        width: ownerHomeDecoded.width,
        height: ownerHomeDecoded.height,
      },
      openDuringSealScreenshot: {
        bytes: ownerWithPaletteMenu.length,
        sha256: sha256(ownerWithPaletteMenu),
        width: ownerDecoded.width,
        height: ownerDecoded.height,
      },
      sourceAlignedPng: {
        bytes: png.length,
        sha256: sha256(png),
        width: decodedPng.width,
        height: decodedPng.height,
      },
      chromeExclusion,
      syntheticCaptureFalsification,
      alignedControl,
      paletteChromeProbe,
    });
    await until(
      () => network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length === responsePostsBefore + 1,
      'one annotation response POST observed by CDP',
    );
    assert.equal(
      network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length,
      responsePostsBefore + 1,
      'synchronous Review guard seals and responds once',
    );
    assert.equal(
      fixture.provider.read().requests.find(({ requestHandle }) => requestHandle === other.record.requestHandle).phase,
      'pending',
      'delivery stays with the original waiter and leaves the other request alone',
    );
    await acknowledge(fixture, delivered.receipt, 'applied', feedbackRequest.source, {
      preview: { reviewedRevision: preview.artifact.revision, current: preview },
    });
    await visible(page, 'Feedback applied. Read notice');
    await openReviewNotice(page, 'Feedback applied');
    await visible(page, 'The owner confirmed application');
    await visible(page, 'Feedback applied');
    assert.equal(await evaluate(page, `document.body.innerText.includes('They have not been sent or applied.')`), false);
    await audit(page, output, 'review-applied-success');

    const submissionId = delivered.response.submissionId;
    const reviewDirectory = path.join(root, ...path.posix.dirname(feature.specPath).split('/'), 'reviews', submissionId);
    const provenance = JSON.parse(fs.readFileSync(path.join(reviewDirectory, 'provenance.json'), 'utf8'));
    const reportText = fs.readFileSync(path.join(reviewDirectory, 'report.md'), 'utf8');
    assert.equal(delivered.review.report.text, reportText,
      'the original fixture waiter receives the exact sealed report');
    assert.deepEqual(
      { width: decodedPng.width, height: decodedPng.height },
      { width: provenance.capture.width, height: provenance.capture.height },
      'the returned PNG is aligned to the reviewed source viewport',
    );
    assert.deepEqual(
      { width: delivered.review.image.width, height: delivered.review.image.height },
      { width: decodedPng.width, height: decodedPng.height },
    );
    assert.equal(sha256(fs.readFileSync(path.join(reviewDirectory, 'annotated.png'))), provenance.imageRevision.slice(7));
    assert.equal(sha256(fs.readFileSync(path.join(reviewDirectory, 'report.md'))), provenance.reportRevision.slice(7));
    assert.equal(reportText.includes('Make the selected copy clearer.'), true);
    fs.cpSync(reviewDirectory, path.join(output.directory, `sealed-${submissionId}`), { recursive: true });

    // A Review-origin history read is immutable navigation. An unrelated
    // workspace SSE reread must not cancel it, even though browsing selection
    // intentionally names a different feature.
    let pausedReviewHistory = null;
    page.on('Fetch.requestPaused', (event) => {
      const url = new URL(event.request.url);
      if (url.pathname === '/api/needs-you/review/history'
        && url.searchParams.get('submissionId') === submissionId) {
        pausedReviewHistory = event;
      }
    });
    await page.send('Fetch.enable', {
      patterns: [{
        urlPattern: '*review/history*submissionId*',
        requestStage: 'Response',
      }],
    });
    const workReadsBeforeHistoryRefresh = network.filter(({ url }) => url.endsWith('/api/work-index')).length;
    await click(page, button('View sealed feedback'));
    const heldHistory = await until(() => pausedReviewHistory, 'held Review-origin history response');
    const historyUrl = new URL(heldHistory.request.url);
    assert.equal(historyUrl.searchParams.get('ideaPath'), feature.ideaPath);
    assert.equal(historyUrl.searchParams.get('specPath'), feature.specPath);
    assert.notEqual(historyUrl.searchParams.get('ideaPath'), browsingFeature.ideaPath,
      'Review history follows the request scope rather than the unrelated browsing selection');
    createIdea(root, 4, 'unrelated-history-refresh');
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await until(
      () => network.filter(({ url }) => url.endsWith('/api/work-index')).length > workReadsBeforeHistoryRefresh,
      'unrelated workspace SSE work-index reread during held history',
    );
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-review-workspace]'))`), true,
      'ordinary workspace refresh leaves the pending Review-origin navigation in its return view');
    await page.send('Fetch.continueRequest', { requestId: heldHistory.requestId });
    await page.send('Fetch.disable');
    await visible(page, `Submission: ${submissionId}`);
    const reviewHistoryRefresh = {
      reviewScope: scope,
      browsingSelection: {
        ideaPath: browsingFeature.ideaPath,
        specPath: browsingFeature.specPath,
      },
      requestUrl: heldHistory.request.url,
      workReadsBefore: workReadsBeforeHistoryRefresh,
      workReadsAfter: network.filter(({ url }) => url.endsWith('/api/work-index')).length,
      displayedSubmission: await evaluate(page, `document.body.innerText.includes(${JSON.stringify(`Submission: ${submissionId}`)})
        ? ${JSON.stringify(submissionId)} : null`),
    };
    assert.equal(reviewHistoryRefresh.displayedSubmission, submissionId,
      'the current held history success remains adoptable after an unrelated SSE refresh');
    writeEvidenceJson(output, 'review-origin-history-refresh.metrics', reviewHistoryRefresh);
    await saveRegressionProof(page, output, 'review-origin-history-refresh', reviewHistoryRefresh);
    await click(page, button('Back'));
    await visible(page, feedbackRequest.prompt);
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-review-workspace]'))`), true);
    await click(page, button('Back'));
    await click(page, button('Now'));
    await visible(page, 'Intent for history-browsing-context, with literal source text.');

    other.controller.abort();
    const otherResult = JSON.parse((await other.result).textResultForLlm);
    assert.equal(otherResult.status, 'cancelled');
    write(
      root,
      preview.artifact.path,
      fs.readFileSync(path.join(root, ...preview.artifact.path.split('/')), 'utf8')
        .replace('Source-aligned design', 'Successor source-aligned design'),
    );

    // A fresh provider can inspect old, consumed evidence, but gets no iframe,
    // live handle, send action, or approval authority from it.
    const restarted = await createFixture(root);
    fixtures.push(restarted);
    await navigate(page, restarted, 1440, 'light');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Review history');
    await visible(page, 'No current owner-qualified preview request is waiting for this record');
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Open sealed feedback') && node.getClientRects().length)`);
    await visible(page, 'Sealed review history');
    assert.equal(await evaluate(page, `document.querySelectorAll('iframe').length`), 0);
    assert.equal(restarted.provider.read().requests.length, 0);
    assert.equal(await evaluate(page, `document.body.innerText.includes('Approve this revision')
      || document.body.innerText.includes('Send annotations')`), false);
    await audit(page, output, 'read-only-older-source-history');

    // Viewing then checking an approval cannot survive source drift. A new
    // request starts unchecked and requires a separate explicit approval.
    await click(page, button('Back'));
    const driftPreview = {
      ...preview,
      artifact: {
        path: preview.artifact.path,
        revision: hash(fs.readFileSync(path.join(root, ...preview.artifact.path.split('/')))),
      },
    };
    const driftRequest = requestFor(restarted, 'preview', driftPreview, scope);
    driftRequest.prompt = 'Approval that will become stale';
    const drift = await publish(restarted, driftRequest);
    await click(page, button('Needs you'));
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Approval that will become stale') && node.getClientRects().length)`);
    assert.equal(await evaluate(page, `${button('Approve this revision')}.disabled`), true);
    await click(page, button('Open Review'));
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Box (B)"]').disabled`), 'fresh approval view');
    await click(page, button('Back'));
    await click(page, field('I approve the exact revision I reviewed.'));
    fs.appendFileSync(path.join(root, ...preview.artifact.path.split('/')), '\n<!-- drift before approval -->\n');
    restarted.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    await visible(page, 'Stale context');
    assert.equal(await evaluate(page, `${button('Approve this revision')}.disabled`), true);
    const stale = JSON.parse((await drift.result).textResultForLlm);
    assert.equal(stale.status, 'source_changed');

    const latestPreview = {
      ...driftPreview,
      artifact: {
        path: driftPreview.artifact.path,
        revision: hash(fs.readFileSync(path.join(root, ...driftPreview.artifact.path.split('/')))),
      },
    };

    // The successor revision receives a second independent, real report+PNG
    // feedback round before any approval request exists. Its own original
    // waiter receives exactly the sealed response, then its owner acknowledges
    // application through the provider.
    const secondFeedbackRequest = requestFor(restarted, 'preview', latestPreview, scope);
    secondFeedbackRequest.prompt = 'Annotate the successor revision in a second feedback round';
    const secondFeedback = await publish(restarted, secondFeedbackRequest);
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Annotate the successor revision in a second feedback round')
      && node.getClientRects().length)`);
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-review-workspace]')
      .length`), 1, 'the stale prior Review remains retained only until the explicit successor entry');
    await click(page, button('Open Review'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`),
    'second real feedback Review', 60_000);
    await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
    await openReviewDetails(page);
    await click(page, button('Add at center'));
    await visible(page, 'Comments (1)');
    await click(page, button('Comments (1)'));
    const secondComment = '  Second revision feedback\n\nretains literal wording.  ';
    await fill(page, field('Comment (optional)'), secondComment);
    await click(page, `document.querySelector('[aria-label="Close comments"]')`);
    const secondResponsePostsBefore = network.filter(({ url }) =>
      url.endsWith('/api/needs-you/respond')).length;
    await click(page, button('Send annotations'));
    await evaluate(page, `(${button('Send annotations')})?.click()`);
    const secondToolResult = await secondFeedback.result;
    const secondDelivered = JSON.parse(secondToolResult.textResultForLlm);
    assert.equal(secondDelivered.status, 'awaiting_acknowledgment');
    assert.equal(secondDelivered.response.action, 'annotations');
    assert.equal(secondDelivered.response.text, undefined);
    assert.equal(secondToolResult.binaryResultsForLlm.length, 1);
    assert.equal(secondToolResult.binaryResultsForLlm[0].mimeType, 'image/png');
    const secondPng = Buffer.isBuffer(secondToolResult.binaryResultsForLlm[0].data)
      ? secondToolResult.binaryResultsForLlm[0].data
      : typeof secondToolResult.binaryResultsForLlm[0].data === 'string'
        ? Buffer.from(secondToolResult.binaryResultsForLlm[0].data, 'base64')
        : Buffer.from(secondToolResult.binaryResultsForLlm[0].data);
    assert.ok(secondPng.length > 1_000);
    assert.equal(secondPng.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await until(() => network.filter(({ url }) =>
      url.endsWith('/api/needs-you/respond')).length === secondResponsePostsBefore + 1,
    'second feedback response POST observed once');
    const secondSubmissionId = secondDelivered.response.submissionId;
    const secondDirectory = path.join(
      root,
      ...path.posix.dirname(feature.specPath).split('/'),
      'reviews',
      secondSubmissionId,
    );
    const secondReport = fs.readFileSync(path.join(secondDirectory, 'report.md'), 'utf8');
    const secondStoredPng = fs.readFileSync(path.join(secondDirectory, 'annotated.png'));
    const secondProvenance = JSON.parse(fs.readFileSync(
      path.join(secondDirectory, 'provenance.json'),
      'utf8',
    ));
    assert.deepEqual(fs.readdirSync(secondDirectory).sort(), [
      'annotated.png',
      'provenance.json',
      'report.md',
      'working.json',
    ]);
    assert.equal(secondDelivered.review.report.text, secondReport,
      'the second original waiter receives its exact sealed report');
    assert.equal(secondReport.includes(secondComment), true);
    assert.equal(hash(secondReport), secondProvenance.reportRevision);
    assert.equal(hash(secondStoredPng), secondProvenance.imageRevision);
    assert.equal(hash(secondPng), secondProvenance.imageRevision,
      'the second original waiter image equals its immutable sealed PNG');
    const secondDecoded = decodePng(secondPng);
    assert.deepEqual(
      { width: secondDecoded.width, height: secondDecoded.height },
      { width: secondProvenance.capture.width, height: secondProvenance.capture.height },
    );
    assert.equal(secondProvenance.preview.artifact.revision, latestPreview.artifact.revision);
    fs.cpSync(secondDirectory, path.join(output.directory, `sealed-${secondSubmissionId}`), {
      recursive: true,
    });
    await acknowledge(restarted, secondDelivered.receipt, 'applied', secondFeedbackRequest.source, {
      preview: { reviewedRevision: latestPreview.artifact.revision, current: latestPreview },
    });
    await visible(page, 'Feedback applied. Read notice');
    await openReviewNotice(page, 'Feedback applied');
    await visible(page, 'The owner confirmed application');
    await closeReviewDetails(page);
    await click(page, `document.querySelector('[data-review-return]')`);

    const secondRound = {
      requestRef: secondFeedbackRequest.requestRef,
      requestHandle: secondFeedback.record.requestHandle,
      submissionId: secondSubmissionId,
      report: { bytes: Buffer.byteLength(secondReport), sha256: sha256(secondReport) },
      image: {
        bytes: secondPng.length,
        sha256: sha256(secondPng),
        width: secondDecoded.width,
        height: secondDecoded.height,
      },
      artifactRevision: latestPreview.artifact.revision,
      originalWaiterStatus: secondDelivered.status,
      ownerAcknowledgment: 'applied',
    };
    writeEvidenceJson(output, 'second-real-feedback-round', secondRound);

    // Approval is a third, separate owner request for the same currently
    // viewed revision. Neither feedback waiter can supply this response.
    const approvalRequest = requestFor(restarted, 'preview', latestPreview, scope);
    approvalRequest.prompt = 'Approve the newly viewed exact revision';
    const approval = await publish(restarted, approvalRequest);
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Approve the newly viewed exact revision') && node.getClientRects().length)`);
    assert.equal(await evaluate(page, `${field('I approve the exact revision I reviewed.')}.checked`), false);
    await click(page, button('Open Review'));
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Box (B)"]').disabled`), 'successor Review entry');
    await click(page, button('Back'));
    assert.equal(await evaluate(page, `${field('I approve the exact revision I reviewed.')}.checked`), false);
    await click(page, field('I approve the exact revision I reviewed.'));
    await click(page, button('Approve this revision'));
    const approved = JSON.parse((await approval.result).textResultForLlm);
    assert.equal(approved.response.action, 'approve');
    assert.equal(approved.response.artifactRevision, latestPreview.artifact.revision);
    assert.notEqual(approvalRequest.requestRef, feedbackRequest.requestRef);
    assert.notEqual(approvalRequest.requestRef, secondFeedbackRequest.requestRef);
    assert.notEqual(approved.response.action, secondDelivered.response.action);
    await acknowledge(restarted, approved.receipt, 'applied', approvalRequest.source, {
      preview: { reviewedRevision: latestPreview.artifact.revision, current: latestPreview },
    });
    await visible(page, 'The owner confirmed application');

    // A real page exit is also a cancellation boundary. Hold a valid history
    // success, navigate the production document away and back, then prove the
    // destroyed view cannot adopt or translate that late response.
    await click(page, button('Now'));
    await visible(page, 'Review history');
    let pausedTeardownHistory = null;
    const teardownFailures = [];
    page.on('Network.loadingFailed', (event) => teardownFailures.push({
      requestId: event.requestId,
      errorText: event.errorText,
      canceled: event.canceled ?? false,
    }));
    page.on('Fetch.requestPaused', (event) => {
      const url = new URL(event.request.url);
      if (url.pathname === '/api/needs-you/review/history'
        && url.searchParams.get('submissionId') === submissionId) {
        pausedTeardownHistory = event;
      }
    });
    await page.send('Fetch.enable', {
      patterns: [{
        urlPattern: '*review/history*submissionId*',
        requestStage: 'Response',
      }],
    });
    await evaluate(page, `window.addEventListener('pagehide', () => {
      sessionStorage.setItem('t011-history-pagehide', 'observed');
    }, { once: true })`);
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes(${JSON.stringify(submissionId)}) && node.getClientRects().length)`);
    const heldAtTeardown = await until(() => pausedTeardownHistory, 'held history response before page exit');
    await navigate(page, restarted, 1440, 'light');
    const pagehideObserved = await evaluate(page, `sessionStorage.getItem('t011-history-pagehide')`);
    let lateTeardownResponse;
    try {
      await page.send('Fetch.continueRequest', { requestId: heldAtTeardown.requestId });
      lateTeardownResponse = 'continued after old document teardown';
    } catch (error) {
      lateTeardownResponse = `cancelled before continuation: ${error.message}`;
    }
    await page.send('Fetch.disable');
    await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() =>
      Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
    const afterTeardown = await evaluate(page, `({
      heading: document.querySelector('h1')?.innerText.trim() || null,
      historicalSubmission: document.body.innerText.includes(${JSON.stringify(`Submission: ${submissionId}`)}),
      actionUnavailable: document.body.innerText.includes('Action unavailable')
    })`);
    const teardownHistory = {
      pagehideObserved,
      requestUrl: heldAtTeardown.request.url,
      networkId: heldAtTeardown.networkId,
      lateTeardownResponse,
      loadingFailure: teardownFailures.find(({ requestId }) => requestId === heldAtTeardown.networkId) ?? null,
      afterTeardown,
    };
    writeEvidenceJson(output, 'history-page-teardown.metrics', teardownHistory);
    assert.equal(pagehideObserved, 'observed', 'the held read crossed the real pagehide boundary');
    assert.deepEqual(afterTeardown, {
      heading: 'Overview',
      historicalSubmission: false,
      actionUnavailable: false,
    }, 'late history completion cannot replace or add an error to the successor document');

    assert.deepEqual(runtimeErrors, []);
    assert.equal(restarted.instance.eventClients.size, 1);
    output.results.push({
      case: 'review-roundtrip-history-approval',
      functionalRoundtrip: true,
      acceptance: geometryFindings.length || stateFindings.length ? 'failed' : 'passed',
      browser: browserState.version.Browser,
      submissionId,
      png: { bytes: png.length, sha256: sha256(png) },
      feedbackRounds: [{
        requestRef: feedbackRequest.requestRef,
        submissionId,
        report: { bytes: Buffer.byteLength(reportText), sha256: sha256(reportText) },
        image: { bytes: png.length, sha256: sha256(png) },
        ownerAcknowledgment: 'applied',
      }, secondRound],
      approval: {
        requestRef: approvalRequest.requestRef,
        artifactRevision: approved.response.artifactRevision,
        ownerAcknowledgment: 'applied',
        separateFromFeedback: true,
      },
      paletteChromeProbe,
      frameWidth,
      caretBefore,
      savedCaret,
      restoredCaret,
      disabledRestore,
      mountedEmptySelection,
      pendingClose,
      mobileToolbar,
      captureRefusalNotice,
      reviewHistoryRefresh,
      teardownHistory,
      geometryFindings,
      stateFindings,
    });
    assert.deepEqual(
      { geometryFindings, stateFindings },
      { geometryFindings: [], stateFindings: [] },
      'Review controls must fit the usable viewport and unchanged-source return must restore caret state',
    );
  } finally {
    for (const fixture of fixtures.reverse()) {
      fixture.provider.dispose();
      await closeInstance(fixture.instanceId);
    }
    const root = fixtures[0]?.root;
    if (root) fs.rmSync(root, { recursive: true, force: true });
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T012 Send recovery: retained geometry stays visible and non-consuming while one blank comment delivers', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-send-blockers');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  let fetchEnabled = false;
  const runtimeErrors = [];
  const network = [];
  const ids = {
    comment: '6336c676-2b3d-4f31-b385-747991a41cb2',
    arrowFive: '8fa212e9-88bb-4594-a736-ea223b0cf499',
    arrowZero: '3d0bc637-8fad-4537-a369-1be75b669a07',
    blankComment: 'bdf44499-e7fe-45f2-ba4c-c12ca16c4ba2',
    box: '5f67c40c-af25-4afb-9112-643c8a8a0597',
  };
  try {
    // Arrange: create a synthetic owned preview in a disposable provider root.
    // Protected approved-design artifacts and actual reviews are never fixtures.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-send-blockers-'));
    const feature = createIdea(root, 912, 'send-blocker-recovery', 'defined');
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.requestRef = 'ship-057-fresh-annotate';
    request.revision = 'fresh-annotate-20260911-2';
    request.prompt = 'Review the retained reported annotations and send corrected feedback.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(2, true);
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (/^https?:/.test(event.request.url)) {
        network.push({
          method: event.request.method,
          path: new URL(event.request.url).pathname,
        });
      }
    });

    await viewport(page, 999, 'light', 905, 2);
    await page.send('Page.navigate', { url: fixture.instance.url });
    await visible(page, 'Connected');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Comment (C)"]').disabled`),
    'initial retained-blocker Review engine', 60_000);
    const initialFrame = await evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      return {width:frame.clientWidth,height:frame.clientHeight};
    })()`);
    await viewport(
      page,
      999 + 989 - initialFrame.width,
      'light',
      905 + 728 - initialFrame.height,
      2,
    );
    await until(() => evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      return frame.clientWidth === 989 && frame.clientHeight === 728
        && document.querySelector('.dude-review-overlay').getAttribute('viewBox') === '0 0 989 728'
        && !document.querySelector('[aria-label="Comment (C)"]').disabled;
    })()`), 'reported 989x728 reviewed frame at DPR2', 60_000);

    const bindEngine = async () => {
      const binding = await evaluate(page, `(() => {
        const start = document.querySelector('[data-review-workspace]');
        const fiberKey = start && Object.keys(start).find(key => key.startsWith('__reactFiber$'));
        let fiber = fiberKey ? start[fiberKey] : null;
        const engines = [];
        while (fiber) {
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            const candidate = hook.memoizedState?.current;
            if (candidate && ['update','getState','command','handleKeyDown','dispose']
              .every(name => typeof candidate[name] === 'function')) engines.push(candidate);
          }
          fiber = fiber.return;
        }
        const unique = [...new Set(engines)];
        if (unique.length === 1) window.__t012SendEngine = unique[0];
        return {candidates:unique.length,bound:Boolean(window.__t012SendEngine)};
      })()`);
      assert.deepEqual(binding, { candidates: 1, bound: true },
        'the fixture observes exactly the engine mounted by the production Review UI');
    };
    await bindEngine();
    const engineState = () => evaluate(page, 'window.__t012SendEngine.getState()');
    const waitSaved = label => until(async () => {
      const state = await engineState();
      const record = fixture.provider.read().requests.find(
        item => item.requestHandle === publication.record.requestHandle,
      );
      return state.ready && !state.busy && !state.saving && !state.dirty
        && record && !record.reviewing ? state : null;
    }, label, 60_000);

    // Create one valid native anchored comment only to obtain this fixture's
    // current selector description. The retained fixture below replaces it;
    // reported IDs and coordinates remain exact while anchor serialization is
    // native to this isolated Chromium/source pair.
    const nativeState = await evaluate(page, `(async () => {
      const engine = window.__t012SendEngine;
      const target = engine.getState().targets.find(item => item.selector === '#heading');
      if (!target) throw new Error('synthetic fixture heading target is unavailable');
      await engine.command({type:'element',selector:target.selector});
      const id = await engine.command({type:'addComment'});
      await engine.command({
        type:'edit',
        id,
        changes:{comment:'Native anchor template only.'},
      });
      await engine.command({type:'save'});
      return engine.getState();
    })()`);
    assert.equal(nativeState.annotations.length, 1);
    assert.equal(nativeState.annotations[0].tool, 'comment');
    assert.equal(nativeState.view.viewport.width, 989);
    assert.equal(nativeState.view.viewport.height, 728);
    assert.equal(nativeState.view.viewport.deviceScale, 2);
    assert.equal(nativeState.view.viewport.theme, 'light');
    const nativeComment = nativeState.annotations[0];
    await waitSaved('native anchor template saved');
    const activeRecord = fixture.provider.read().requests.find(
      item => item.requestHandle === publication.record.requestHandle,
    );
    const workingFile = path.join(
      root,
      ...path.posix.dirname(feature.specPath).split('/'),
      'reviews',
      activeRecord.reviewSubmissionId,
      'working.json',
    );
    assert.equal(fs.existsSync(workingFile), true);

    await page.send('Page.navigate', { url: 'about:blank' });
    const envelope = JSON.parse(fs.readFileSync(workingFile, 'utf8'));
    const anchored = (value) => ({
      ...value,
      element: structuredClone(nativeComment.element),
      ...(Object.hasOwn(nativeComment, 'scrollBasis')
        ? { scrollBasis: structuredClone(nativeComment.scrollBasis) } : {}),
    });
    const retainedAnnotations = [
      anchored({
        id: ids.comment,
        tool: 'comment',
        x1: 292.23828125,
        y1: 152.78515625,
        x2: 292.23828125,
        y2: 152.78515625,
        comment: 'Let’s try to send this note back',
        replacement: '',
        styleNote: '',
      }),
      {
        id: ids.arrowFive,
        tool: 'arrow',
        x1: 758.41015625,
        y1: 136.0625,
        x2: 862.2890625,
        y2: 5.80859375,
        comment: 'No visible ',
        replacement: '',
        styleNote: '',
        element: null,
      },
      {
        id: ids.arrowZero,
        tool: 'arrow',
        x1: 767.73046875,
        y1: 146.484375,
        x2: 861.41796875,
        y2: 0,
        comment: 'No visible',
        replacement: '',
        styleNote: '',
        element: null,
      },
      anchored({
        id: ids.blankComment,
        tool: 'comment',
        x1: 841.6484375,
        y1: 63.421875,
        x2: 841.6484375,
        y2: 63.421875,
        comment: '',
        replacement: '',
        styleNote: '',
      }),
      {
        id: ids.box,
        tool: 'box',
        x1: 899.10546875,
        y1: 1.69921875,
        x2: 487,
        y2: 354.87109375,
        comment: '',
        replacement: '',
        styleNote: '',
        element: null,
      },
    ];
    const retainedState = {
      ...envelope.state,
      annotations: retainedAnnotations,
      notes: '',
      tool: 'box',
      selectedId: ids.box,
      caret: {
        id: ids.box,
        field: 'comment',
        start: 0,
        end: 0,
        direction: 'none',
      },
      view: structuredClone(nativeState.view),
      palette: structuredClone(nativeState.palette),
    };
    fs.writeFileSync(workingFile, `${JSON.stringify({
      ...envelope,
      state: retainedState,
    }, null, 2)}\n`);
    const retainedWorkingHash = sha256(fs.readFileSync(workingFile));

    await page.send('Page.navigate', { url: fixture.instance.url });
    await visible(page, 'Connected');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Comment (C)"]').disabled`),
    'retained invalid fixture reopened', 60_000);
    await bindEngine();
    const reopened = await engineState();
    assert.deepEqual(reopened.annotations, retainedAnnotations,
      'saved untrusted geometry reopens byte-for-byte instead of being rebased or omitted');
    assert.deepEqual(reopened.hiddenIds, [ids.arrowFive, ids.arrowZero, ids.box]);
    assert.equal(reopened.selectedId, ids.box);
    assert.deepEqual(reopened.caret, retainedState.caret);
    const paintEnvelopes = reopened.annotations.map((annotation, index) => {
      const pad = annotation.tool === 'comment' ? 14
        : annotation.tool === 'arrow' ? 11 : 2;
      return {
        number: index + 1,
        id: annotation.id,
        left: Math.min(annotation.x1, annotation.x2) - pad,
        top: Math.min(annotation.y1, annotation.y2) - pad,
        right: Math.max(annotation.x1, annotation.x2) + pad,
        bottom: Math.max(annotation.y1, annotation.y2) + pad,
      };
    });
    assert.deepEqual(
      paintEnvelopes.filter(envelope => envelope.top < 0).map(({ number, id }) => ({ number, id })),
      [
        { number: 2, id: ids.arrowFive },
        { number: 3, id: ids.arrowZero },
        { number: 5, id: ids.box },
      ],
      'the actual paint envelopes, not error flags, identify the three reported top-edge blockers',
    );
    const renderedIds = await evaluate(page, `[...document.querySelectorAll(
      '.dude-review-overlay [data-annotation]'
    )].map(node => node.getAttribute('data-annotation'))`);
    assert.deepEqual(renderedIds, [ids.comment, ids.blankComment],
      'retained hidden marks paint nothing while every visible retained mark remains numbered');

    const sendText = () => evaluate(page, `document.querySelector('[data-review-feedback]')
      ?.innerText.replace(/\\s+/g, ' ').trim() || ''`);
    const reviewFrame = () => evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      return {
        rect:frame.getBoundingClientRect().toJSON(),
        clientWidth:frame.clientWidth,
        clientHeight:frame.clientHeight,
        pinned:frame.classList.contains('dude-review-frame-pinned'),
        viewBox:document.querySelector('.dude-review-overlay').getAttribute('viewBox'),
      };
    })()`);
    const frameBeforeRefusal = await reviewFrame();
    assert.deepEqual(
      {
        width: frameBeforeRefusal.clientWidth,
        height: frameBeforeRefusal.clientHeight,
        pinned: frameBeforeRefusal.pinned,
        viewBox: frameBeforeRefusal.viewBox,
      },
      { width: 989, height: 728, pinned: true, viewBox: '0 0 989 728' },
    );
    const sealPostsBefore = network.filter(entry => entry.path === '/api/needs-you/review/seal').length;
    const respondPostsBefore = network.filter(entry => entry.path === '/api/needs-you/respond').length;
    let waiterSettlements = 0;
    publication.result.then(() => { waiterSettlements += 1; });

    // Act: Send with all three current geometry blockers.
    await click(page, button('Send annotations'));
    const firstBlockerText = await until(async () => {
      const text = await sendText();
      return text.includes('Send blocked') ? text : null;
    }, 'current numbered geometry blockers');
    const firstRefusalState = await engineState();
    const firstFeedback = await evaluate(page, `(() => {
      const send = ${button('Send annotations')};
      const feedback = document.querySelector('[data-review-feedback]');
      const rect = feedback.getBoundingClientRect();
      return {
        visible:rect.width > 0 && rect.height > 0,
        sameActionRow:send.parentElement === feedback.parentElement,
        describedBy:(send.getAttribute('aria-describedby') || '').split(/\\s+/)
          .includes(feedback.id),
        detailsOpen:Boolean(document.querySelector(
          '.fui-PopoverSurface[aria-label="Notes and more"]'
        )?.getClientRects().length),
      };
    })()`);

    // Assert: the failed form action explains itself beside Send and never
    // starts sealing, capture, receipt creation, or waiter consumption.
    assert.equal(
      firstBlockerText,
      'Send blocked Annotations 2, 3, 5 are not fully visible and cannot be captured. '
        + 'Edit their coordinates or delete them in Comments. '
        + 'Inspect annotations',
    );
    assert.deepEqual(firstFeedback, {
      visible: true,
      sameActionRow: true,
      describedBy: true,
      detailsOpen: false,
    });
    assert.equal(firstRefusalState.error.code, 'review_outside_viewport');
    assert.deepEqual(firstRefusalState.annotations, retainedAnnotations);
    assert.deepEqual(await reviewFrame(), frameBeforeRefusal,
      'blocker summarization does not resize, stale, or rebase the pinned frame');
    assert.equal(network.filter(entry => entry.path === '/api/needs-you/review/seal').length,
      sealPostsBefore);
    assert.equal(network.filter(entry => entry.path === '/api/needs-you/respond').length,
      respondPostsBefore);
    assert.equal(sha256(fs.readFileSync(workingFile)), retainedWorkingHash);
    assert.deepEqual(fs.readdirSync(path.dirname(workingFile)), ['working.json']);
    assert.equal(publication.record.receipt, null);
    assert.equal(fixture.provider.read().requests.find(
      item => item.requestHandle === publication.record.requestHandle,
    ).phase, 'pending');
    assert.equal(waiterSettlements, 0);
    const refusalScreenshot = Buffer.from((await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })).data, 'base64');
    fs.writeFileSync(path.join(output.directory, 'reported-send-blocked.png'), refusalScreenshot);

    // Inspect keeps the already-selected failing box and its canonical caret.
    await click(page, button('Inspect annotations'));
    await until(() => evaluate(page, `document.activeElement === ${field('Comment (optional)')}`),
      'Inspect focuses the selected blocking annotation editor');
    let current = await engineState();
    assert.equal(current.selectedId, ids.box);
    assert.deepEqual(current.caret, retainedState.caret);
    const collapsedCaret = await evaluate(page, `({
      start:${field('Comment (optional)')}.selectionStart,
      end:${field('Comment (optional)')}.selectionEnd,
      direction:${field('Comment (optional)')}.selectionDirection
    })`);
    assert.deepEqual(
      { start: collapsedCaret.start, end: collapsedCaret.end },
      { start: 0, end: 0 },
      'the retained blank comment restores the exact collapsed caret offsets',
    );
    assert.match(
      collapsedCaret.direction,
      /^(?:forward|backward|none)$/,
      'a collapsed caret may expose browser-specific direction metadata',
    );

    const editNumber = async (label, value, id, property) => {
      await fill(page, field(label), String(value));
      await press(page, 'Tab');
      await until(async () => {
        const state = await engineState();
        return state.annotations.find(annotation => annotation.id === id)?.[property] === value;
      }, `${label} correction committed`);
    };
    await editNumber('Y1', 16, ids.box, 'y1');
    assert.equal(await until(async () => {
      const text = await sendText();
      return text.includes('Annotations 2, 3 are not fully visible') ? text : null;
    }, 'box correction updates current blocker indices'),
    'Send blocked Annotations 2, 3 are not fully visible and cannot be captured. '
      + 'Edit their coordinates or delete them in Comments. '
      + 'Inspect annotations');

    await click(page, `document.querySelector('[data-annotation-id="${ids.arrowFive}"]')`);
    await until(async () => (await engineState()).selectedId === ids.arrowFive,
      'reported arrow 2 selected');
    await editNumber('Y2', 24, ids.arrowFive, 'y2');
    assert.equal(await until(async () => {
      const text = await sendText();
      return text.includes('Annotation 3 is not fully visible') ? text : null;
    }, 'arrow correction updates current blocker indices'),
    'Send blocked Annotation 3 is not fully visible and cannot be captured. '
      + 'Edit their coordinates or delete them in Comments. '
      + 'Inspect annotations');

    await click(page, `document.querySelector('[data-annotation-id="${ids.arrowZero}"]')`);
    await until(async () => (await engineState()).selectedId === ids.arrowZero,
      'reported arrow 3 selected');
    await click(page, button('Delete annotation'));
    await until(async () => (await engineState()).annotations.length === 4,
      'reported arrow 3 explicitly deleted');
    await until(async () => (await sendText()) === '' ? true : null,
      'geometry blockers clear while the blank comment remains valid');
    assert.equal(await sendText(), '');
    current = await engineState();
    assert.deepEqual(current.hiddenIds, []);
    assert.deepEqual(
      current.annotations.map(annotation => ({ id: annotation.id, tool: annotation.tool })),
      [
        { id: ids.comment, tool: 'comment' },
        { id: ids.arrowFive, tool: 'arrow' },
        { id: ids.blankComment, tool: 'comment' },
        { id: ids.box, tool: 'box' },
      ],
      'legal blank arrow, comment, and box remain after the geometry blockers clear',
    );
    assert.deepEqual(
      current.annotations.find(annotation => annotation.id === ids.blankComment),
      retainedAnnotations.find(annotation => annotation.id === ids.blankComment),
      'the valid numbered pin stays blank instead of receiving manufactured feedback text',
    );
    assert.equal(await until(async () => {
      const role = await evaluate(page, `document.activeElement?.getAttribute('role')`);
      return role === 'listitem' ? role : null;
    }, 'deleted blocker focus moves on the next animation frame'), 'listitem',
    'deleting a blocker keeps keyboard focus on the existing annotation list');
    assert.deepEqual(await reviewFrame(), frameBeforeRefusal);
    await click(page, button('Done'));
    const correctedState = await waitSaved('geometry corrections autosaved');
    assert.deepEqual(correctedState.hiddenIds, []);
    assert.deepEqual(
      correctedState.annotations.find(annotation => annotation.id === ids.blankComment),
      current.annotations.find(annotation => annotation.id === ids.blankComment),
      'saving the corrected geometry preserves the valid pin with optional text blank',
    );
    const correctedWorking = fs.readFileSync(workingFile);
    assert.equal(fixture.provider.read().requests.find(
      item => item.requestHandle === publication.record.requestHandle,
    ).phase, 'pending');
    assert.equal(waiterSettlements, 0);

    // Hold each real production request at its boundary. This proves progress
    // is visible before success, duplicate activation is inert, and receipt
    // success appears only after the original response completes. Install the
    // barriers before the first Send that becomes valid after geometry repair.
    let sealPaused = null;
    let respondPaused = null;
    page.on('Fetch.requestPaused', event => {
      const pathname = new URL(event.request.url).pathname;
      if (pathname === '/api/needs-you/review/seal' && !sealPaused) sealPaused = event;
      if (pathname === '/api/needs-you/respond' && !respondPaused) respondPaused = event;
    });
    await page.send('Fetch.enable', {
      patterns: [
        { urlPattern: '*/api/needs-you/review/seal', requestStage: 'Request' },
        { urlPattern: '*/api/needs-you/respond', requestStage: 'Request' },
      ],
    });
    fetchEnabled = true;
    const frameBeforeSuccess = await reviewFrame();
    const successSealPosts = network.filter(entry => entry.path === '/api/needs-you/review/seal').length;
    const successRespondPosts = network.filter(entry => entry.path === '/api/needs-you/respond').length;
    await click(page, button('Send annotations'));
    await until(() => sealPaused, 'held production seal request');
    const captureProgress = await sendText();
    assert.equal(
      captureProgress,
      'Preparing annotations Checking the view and capturing the annotated image…',
    );
    assert.equal(captureProgress.includes('delivered'), false);
    assert.equal(await evaluate(page, `${button('Send annotations')}.disabled`), true);
    assert.equal(fs.readFileSync(workingFile).equals(correctedWorking), true,
      'the valid Send starts from the exact autosaved geometry and blank pin');
    assert.equal(fixture.provider.read().requests.find(
      item => item.requestHandle === publication.record.requestHandle,
    ).phase, 'pending');
    assert.equal(waiterSettlements, 0);
    assert.deepEqual(await reviewFrame(), frameBeforeSuccess,
      'capture progress does not resize or stale the pinned frame');
    await evaluate(page, `${button('Send annotations')}.click()`);
    await page.send('Fetch.continueRequest', { requestId: sealPaused.requestId });
    await until(() => respondPaused, 'held production response delivery');
    const deliveryProgress = await sendText();
    assert.equal(
      deliveryProgress,
      'Sending annotations Delivering the report and image to the waiting owner…',
    );
    assert.equal(deliveryProgress.includes('delivered'), false);
    assert.equal(waiterSettlements, 0);
    assert.deepEqual(await reviewFrame(), frameBeforeSuccess,
      'delivery progress does not resize or stale the pinned frame');
    await page.send('Fetch.continueRequest', { requestId: respondPaused.requestId });
    await page.send('Fetch.disable');
    fetchEnabled = false;
    const successText = await until(async () => {
      const text = await sendText();
      return text.includes('The report and image were delivered.') ? text : null;
    }, 'receipt-backed Send success');
    assert.match(successText, /Feedback sent; awaiting acknowledgment/);
    const toolResult = await publication.result;
    const delivered = JSON.parse(toolResult.textResultForLlm);
    assert.equal(waiterSettlements, 1);
    assert.equal(network.filter(entry => entry.path === '/api/needs-you/review/seal').length,
      successSealPosts + 1);
    assert.equal(network.filter(entry => entry.path === '/api/needs-you/respond').length,
      successRespondPosts + 1);
    assert.equal(delivered.status, 'awaiting_acknowledgment');
    assert.equal(delivered.response.action, 'annotations');
    assert.equal(delivered.acceptedAnswer, false);
    assert.equal(toolResult.binaryResultsForLlm.length, 1);
    assert.equal(toolResult.binaryResultsForLlm[0].mimeType, 'image/png');
    const binary = toolResult.binaryResultsForLlm[0].data;
    const png = Buffer.isBuffer(binary)
      ? binary
      : typeof binary === 'string' ? Buffer.from(binary, 'base64') : Buffer.from(binary);
    const decoded = decodePng(png);
    assert.deepEqual({ width: decoded.width, height: decoded.height }, {
      width: 1978,
      height: 1456,
    }, 'the original waiter receives the full 989x728 DPR2 source capture');
    const finalDirectory = path.dirname(workingFile);
    assert.equal(png.equals(fs.readFileSync(path.join(finalDirectory, 'annotated.png'))), true);
    const report = fs.readFileSync(path.join(finalDirectory, 'report.md'), 'utf8');
    assert.equal((report.match(/^## \d+\. /gm) || []).length, 4,
      'the report retains every corrected visible mark instead of omitting hidden entries');
    assert.match(report, /## 2\. arrow/);
    assert.match(report, /arrowhead at the second endpoint/);
    assert.match(report, /## 3\. comment/);
    const blankCommentSection = report.match(/## 3\. comment[\s\S]*?(?=\n## 4\. box)/)?.[0];
    assert.ok(blankCommentSection, 'the blank numbered pin has its own delivered report section');
    assert.doesNotMatch(
      blankCommentSection,
      /^(?:Comment|Suggested replacement text|Suggested style change):/m,
      'optional marker text stays blank in the delivered report',
    );
    assert.match(report, /## 4\. box/);
    assert.equal(delivered.review.report.text, report,
      'the original waiter receives the exact report containing the blank numbered pin');
    const finalWorking = JSON.parse(fs.readFileSync(workingFile, 'utf8'));
    assert.deepEqual(finalWorking.state.annotations.map(annotation => annotation.id), [
      ids.comment,
      ids.arrowFive,
      ids.blankComment,
      ids.box,
    ]);
    assert.equal(fixture.provider.read().requests.find(
      item => item.requestHandle === publication.record.requestHandle,
    ).phase, 'awaiting_acknowledgment');
    assert.equal(fixture.sends.length, 0,
      'delivery returns once to the original disposable waiter without session.send or resend');
    assert.deepEqual(runtimeErrors, []);
    const successScreenshot = Buffer.from((await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })).data, 'base64');
    fs.writeFileSync(path.join(output.directory, 'corrected-send-success.png'), successScreenshot);
    const result = {
      case: context.name,
      browser: browserState.version.Browser,
      request: {
        requestRef: request.requestRef,
        revision: request.revision,
        phase: 'awaiting_acknowledgment',
      },
      fixture: {
        ids,
        viewport: retainedState.view.viewport,
        anchorSerialization: 'native equivalent descriptions from the isolated synthetic fixture',
        initialHiddenIndices: [2, 3, 5],
        initialBlankCommentIndex: 4,
        finalBlankCommentIndex: 3,
        finalBlankCommentText: '',
        finalIds: finalWorking.state.annotations.map(annotation => annotation.id),
      },
      refusal: {
        text: firstBlockerText,
        sealPosts: 0,
        respondPosts: 0,
        waiterSettlements: 0,
        retainedWorkingHash,
        screenshot: {
          file: 'reported-send-blocked.png',
          bytes: refusalScreenshot.length,
          sha256: sha256(refusalScreenshot),
        },
      },
      recovery: {
        afterBox: 'Annotations 2, 3',
        afterArrow: 'Annotation 3',
        afterDelete: 'No blockers; blank comment 3 retained',
        finalAnnotationCount: finalWorking.state.annotations.length,
      },
      delivery: {
        captureProgress,
        deliveryProgress,
        successText,
        sealPosts: 1,
        respondPosts: 1,
        waiterSettlements,
        png: { bytes: png.length, sha256: sha256(png), width: decoded.width, height: decoded.height },
        report: { bytes: Buffer.byteLength(report), sha256: sha256(report) },
        approved: false,
        sessionSendCalls: fixture.sends.length,
        screenshot: {
          file: 'corrected-send-success.png',
          bytes: successScreenshot.length,
          sha256: sha256(successScreenshot),
        },
      },
    };
    writeEvidenceJson(output, 'send-blocker-recovery.metrics', result);
    output.results.push(result);
  } finally {
    if (fetchEnabled && browserState) {
      try { await browserState.page.send('Fetch.disable'); } catch {}
    }
    publication?.controller.abort();
    if (fixture) await fixture.close();
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T012 Send acknowledgment precedence: declined and unavailable receipts replace local waiting copy without resending', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-send-ack-verified');
  const board = installEmptyBoard();
  let browserState;
  let activeFixture;
  let activePublication;
  const runtimeErrors = [];
  const network = [];
  try {
    browserState = await startBrowser(1, true);
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (/^https?:/.test(event.request.url)) {
        network.push({
          method: event.request.method,
          path: new URL(event.request.url).pathname,
        });
      }
    });
    const cases = [
      {
        outcome: 'declined',
        title: 'Feedback sent; declined',
        detail: 'The owner declined this response. Your markup and sealed evidence are retained. '
          + 'A fresh request is needed before responding again.',
        freshness: 'current',
        current: true,
      },
      {
        outcome: 'unavailable',
        title: 'Feedback sent; current authority unavailable',
        detail: 'The owner reported this response as unavailable. Your markup and sealed evidence are retained. '
          + 'Return to the owner context to check the request; nothing will be resent automatically.',
        freshness: 'unavailable',
        current: false,
      },
    ];

    for (const [index, expectation] of cases.entries()) {
      // Arrange: each owner outcome gets a fresh real request, waiter, and
      // receipt. The production Review UI creates and sends one native mark.
      const root = fs.mkdtempSync(path.join(
        os.tmpdir(),
        `dude-canvas-t012-send-${expectation.outcome}-`,
      ));
      const feature = createIdea(root, 920 + index, `send-${expectation.outcome}`, 'defined');
      const preview = createPreview(root, /** @type {any} */ (feature));
      activeFixture = await createFixture(root);
      const scope = {
        kind: 'feature',
        ideaPath: feature.ideaPath,
        specPath: feature.specPath,
      };
      const request = requestFor(activeFixture, 'preview', preview, scope);
      request.prompt = `Send feedback before the owner reports ${expectation.outcome}.`;
      activePublication = await publish(activeFixture, request);
      let waiterSettlements = 0;
      activePublication.result.then(() => { waiterSettlements += 1; });

      await navigate(page, activeFixture, 1200, 'light');
      await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
      await click(page, button('Review design'));
      await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
        && !document.querySelector('[aria-label="Box (B)"]').disabled`),
      `${expectation.outcome} Review engine`, 60_000);
      await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
      await openReviewDetails(page);
      await click(page, button('Add at center'));
      await closeReviewDetails(page);
      await visible(page, 'Comments (1)');

      const feedbackText = () => evaluate(page, `document.querySelector('[data-review-feedback]')
        ?.innerText.replace(/\\s+/g, ' ').trim() || ''`);
      const sealPostsBefore = network.filter(entry => entry.path === '/api/needs-you/review/seal').length;
      const respondPostsBefore = network.filter(entry => entry.path === '/api/needs-you/respond').length;

      // Act: complete the actual report+PNG delivery before acknowledging its
      // receipt through the provider's owner-only acknowledgment operation.
      await click(page, button('Send annotations'));
      const waitingText = await until(async () => {
        const text = await feedbackText();
        return text.includes('The report and image were delivered.') ? text : null;
      }, `${expectation.outcome} receipt-backed delivery`);
      assert.equal(
        waitingText,
        'Feedback sent; awaiting acknowledgment The report and image were delivered. '
          + 'Sending feedback did not approve the design.',
      );
      const toolResult = await activePublication.result;
      const delivered = JSON.parse(toolResult.textResultForLlm);
      assert.equal(waiterSettlements, 1);
      assert.equal(delivered.status, 'awaiting_acknowledgment');
      assert.equal(delivered.response.action, 'annotations');
      assert.equal(delivered.acceptedAnswer, false);
      assert.equal(toolResult.binaryResultsForLlm.length, 1);
      assert.equal(toolResult.binaryResultsForLlm[0].mimeType, 'image/png');
      const binary = toolResult.binaryResultsForLlm[0].data;
      const png = Buffer.isBuffer(binary)
        ? binary
        : typeof binary === 'string' ? Buffer.from(binary, 'base64') : Buffer.from(binary);
      const reviewDirectory = path.join(
        root,
        ...path.posix.dirname(feature.specPath).split('/'),
        'reviews',
        delivered.response.submissionId,
      );
      const report = fs.readFileSync(path.join(reviewDirectory, 'report.md'), 'utf8');
      assert.equal(png.equals(fs.readFileSync(path.join(reviewDirectory, 'annotated.png'))), true,
        'the original waiter receives the one PNG stored with its sealed submission');
      assert.equal((report.match(/^## \d+\. /gm) || []).length, 1,
        'the original waiter report contains the one native annotation');
      assert.equal(
        network.filter(entry => entry.path === '/api/needs-you/review/seal').length,
        sealPostsBefore + 1,
      );
      assert.equal(
        network.filter(entry => entry.path === '/api/needs-you/respond').length,
        respondPostsBefore + 1,
      );

      await acknowledge(activeFixture, delivered.receipt, expectation.outcome, request.source, {
        preview: { reviewedRevision: preview.artifact.revision, current: preview },
      });
      const acknowledgedText = await until(async () => {
        const text = await feedbackText();
        return text.includes(expectation.title) ? text : null;
      }, `${expectation.outcome} current receipt outcome beside Send`);

      // Assert: current receipt authority outranks the historical local
      // "sent" phase while the delivery and non-approval facts remain visible.
      const expectedText = `${expectation.title} The report and image were delivered. `
        + `Sending feedback did not approve the design. ${expectation.detail}`;
      assert.equal(acknowledgedText, expectedText);
      assert.equal(acknowledgedText.includes('Feedback sent; awaiting acknowledgment'), false,
        'a terminal current receipt outcome cannot retain the old waiting title');
      assert.match(acknowledgedText, /The report and image were delivered\./);
      assert.match(acknowledgedText, /Sending feedback did not approve the design\./);
      const currentRecord = activeFixture.provider.read().requests.find(
        item => item.requestHandle === activePublication.record.requestHandle,
      );
      assert.equal(currentRecord.phase, expectation.outcome);
      assert.equal(currentRecord.receipt.acknowledgment.outcome, expectation.outcome);
      assert.equal(currentRecord.receipt.receiptId, delivered.receipt.receiptId);
      assert.equal(currentRecord.receipt.freshness, expectation.freshness);
      assert.equal(currentRecord.receipt.current, expectation.current);
      await evaluate(page, `new Promise(resolve => requestAnimationFrame(() =>
        requestAnimationFrame(resolve)))`);
      assert.equal(
        network.filter(entry => entry.path === '/api/needs-you/review/seal').length,
        sealPostsBefore + 1,
        'owner acknowledgment does not seal again',
      );
      assert.equal(
        network.filter(entry => entry.path === '/api/needs-you/respond').length,
        respondPostsBefore + 1,
        'owner acknowledgment does not resend the response',
      );
      assert.equal(activeFixture.sends.length, 0,
        'delivery and acknowledgment never fall back to session.send');
      const screenshot = Buffer.from((await page.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })).data, 'base64');
      const result = {
        case: expectation.outcome,
        waitingText,
        acknowledgedText,
        requestRef: request.requestRef,
        receiptId: delivered.receipt.receiptId,
        phase: currentRecord.phase,
        freshness: currentRecord.receipt.freshness,
        current: currentRecord.receipt.current,
        waiterSettlements,
        delivery: {
          sealPosts: 1,
          respondPosts: 1,
          sessionSendCalls: activeFixture.sends.length,
          report: { bytes: Buffer.byteLength(report), sha256: sha256(report) },
          png: { bytes: png.length, sha256: sha256(png) },
        },
        screenshot: {
          file: `send-${expectation.outcome}-ack.png`,
          bytes: screenshot.length,
          sha256: sha256(screenshot),
        },
      };
      fs.writeFileSync(path.join(output.directory, result.screenshot.file), screenshot);
      writeEvidenceJson(output, `send-${expectation.outcome}-ack`, result);
      output.results.push(result);

      activePublication = null;
      await activeFixture.close();
      activeFixture = null;
    }
    assert.deepEqual(runtimeErrors, []);
  } finally {
    activePublication?.controller.abort();
    if (activeFixture) await activeFixture.close();
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T012 review regression: short-panel floating tools stay inside their palette and remain reachable after workspace navigation', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const parent = path.resolve(process.env.DUDE_CANVAS_ARTIFACTS_DIR ?? os.tmpdir());
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'dude-canvas-t012-floating-toolbar-'));
  const output = /** @type {ReturnType<typeof evidence>} */ ({
    directory,
    results: [],
    sources: {},
  });
  context.diagnostic(`T012 floating-toolbar evidence directory: ${directory}`);
  const wheelExperiment = {
    version:1,
    treatment:{
      browser:'existing installed discovery',
      source:'identical createPreview bytes in three fresh fixtures',
      viewport:{width:1000,height:300,dpr:2},
      delta:{x:0,y:360},
      variants:[
        'legacy standalone outside-point wheel (observation only)',
        'coordinate-anchored synthesized native mouse scroll outside the overlay',
        'coordinate-anchored synthesized native mouse scroll on the overlay',
      ],
    },
    variants:{
      standalone:{},
      overlayNegative:{},
      positioned:{},
    },
    discriminator:{
      status:'not-reached',
      reason:null,
    },
  };
  context.after(() => writeEvidenceJson(
    output,
    'short-panel-wheel-discriminator',
    wheelExperiment,
  ));
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  let wheelObserver;
  const runtimeErrors = [];
  try {
    await runShortPanelWheelControl(
      'standalone',
      wheelExperiment.variants.standalone,
    );
    writeEvidenceJson(output, 'short-panel-wheel-discriminator', wheelExperiment);
    assert.equal(
      wheelExperiment.variants.standalone.qualification?.passed,
      true,
      'standalone source observation must qualify before its diagnostic wheel',
    );
    await runShortPanelWheelControl(
      'overlay-negative',
      wheelExperiment.variants.overlayNegative,
    );
    writeEvidenceJson(output, 'short-panel-wheel-discriminator', wheelExperiment);
    assert.equal(
      wheelExperiment.variants.overlayNegative.qualification?.passed,
      true,
      'overlay-negative source observation must qualify before its diagnostic wheel',
    );

    // Arrange: create a synthetic owned preview in a disposable real provider
    // root. Protected approved-design artifacts are integrity inputs, not test
    // fixtures. The completed feature exercises the Closed finder before
    // entering its one eligible Review from Context.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-floating-toolbar-'));
    const feature = createIdea(
      root,
      900,
      'floating-toolbar-regression',
      'defined',
      '# Tasks\n\n- [x] T001@aaaaaaaa Closed fixture remains review-eligible.\n',
    );
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Review the synthetic floating-toolbar workspace mock.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(2);
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    await viewport(page, 1000, 'light', 900, 2);
    await page.send('Page.navigate', {url:fixture.instance.url});
    await visible(page, 'Connected');
    await choose(page, 'Show', 'Closed');
    await visible(page, '1 of 1 recorded ideas and features');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Defined feature');
    const admissionStartedAt = Date.now();
    wheelExperiment.variants.positioned = {
      variant:'positioned',
      sourceRevision:preview.artifact.revision,
      browser:browserState.version.Browser ?? browserState.version,
      browserPid:browserState.browser.pid,
      profile:browserState.profile,
      stage:'subscribed-before-review',
    };
    wheelObserver = await createReviewSourceObserver(page);
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`),
    'focused floating-toolbar Review engine', 60_000);
    wheelExperiment.variants.positioned.binding = await wheelObserver.bind();
    const shortPanelFixture = Object.freeze({
      viewport: {width:1000, height:300, dpr:2},
      frame: {width:942, clientHeight:118, rawHeight:117.5},
    });
    await viewport(
      page,
      shortPanelFixture.viewport.width,
      'light',
      shortPanelFixture.viewport.height,
      shortPanelFixture.viewport.dpr,
    );
    let shortViewport;
    try {
      // This synthetic fixture has one approved short-panel geometry. Capture
      // its unpinned half-pixel rectangle before any annotation can pin it.
      shortViewport = await until(() => evaluate(page, `(() => {
        const frame = document.querySelector('.dude-review-frame');
        if (!frame) return null;
        const expected = ${JSON.stringify(shortPanelFixture.frame)};
        const {x, y, top, right, bottom, left, width, height}
          = frame.getBoundingClientRect();
        const viewBox = document.querySelector('.dude-review-overlay')?.getAttribute('viewBox');
        return frame.clientWidth === expected.width
          && frame.clientHeight === expected.clientHeight
          && width === expected.width
          && height === expected.rawHeight
          && !frame.classList.contains('dude-review-frame-pinned')
          && viewBox === '0 0 ' + frame.clientWidth + ' ' + frame.clientHeight
          && !document.querySelector('[aria-label="Box (B)"]').disabled
          ? {
            width:frame.clientWidth,
            height:frame.clientHeight,
            viewBox,
            rawFrame:{x, y, top, right, bottom, left, width, height},
          } : null;
      })()`), 'unannotated short viewport admitted at native DPR2');
    } catch (error) {
      const admissionFailure = await evaluate(page, `(() => {
        const frame = document.querySelector('.dude-review-frame');
        const workspace = document.querySelector('[data-review-workspace]');
        const notices = [...(workspace?.querySelectorAll(
          '[aria-label^="Read review notice:"]'
        ) || [])].map(node => ({
          label:node.getAttribute('aria-label'),
          text:node.textContent.replace(/\\s+/g, ' ').trim(),
          visible:Boolean(node.getClientRects().length),
        }));
        // The canonical iframe intentionally has an opaque sandbox origin and
        // does not own the Review engine. Never turn a caught cross-origin
        // access failure into a claimed engine observation. The parent notice
        // is the only error detail this probe can honestly inspect.
        const parentNotice = notices.find(notice => notice.visible
          && notice.label === 'Read review notice: Review needs attention') || null;
        return {
          elapsedMs:${Date.now() - admissionStartedAt},
          frame:frame ? {
            clientWidth:frame.clientWidth,
            clientHeight:frame.clientHeight,
            rect:frame.getBoundingClientRect().toJSON(),
          } : null,
          overlayViewBox:document.querySelector('.dude-review-overlay')?.getAttribute('viewBox') || null,
          boxDisabled:document.querySelector('[aria-label="Box (B)"]')?.disabled ?? null,
          reviewInspection:parentNotice ? {
            available:true,
            source:'parent-visible-review-notice',
            notice:parentNotice,
          } : {
            available:false,
            source:'parent-review-workspace',
            reason:'No parent-visible Review error notice was mounted; opaque iframe engine inspection is intentionally unavailable.',
          },
          notices,
          resourceTimings:performance.getEntriesByType('resource')
            .filter(entry => entry.name.includes('/api/needs-you/review/'))
            .map(entry => ({
              name:entry.name,
              startTime:entry.startTime,
              responseStart:entry.responseStart,
              responseEnd:entry.responseEnd,
              duration:entry.duration,
            })),
        };
      })()`);
      if (admissionFailure.reviewInspection.available) {
        try {
          await openReviewNotice(page, 'Review needs attention');
          admissionFailure.reviewInspection.disclosure = await evaluate(page, `(() => {
            const candidates = [...document.querySelectorAll('[role="group"]')]
              .filter(node => node.getClientRects().length)
              .map(node => {
                const labels = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/)
                  .filter(Boolean)
                  .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || null);
                return {
                  labels,
                  text:node.textContent.replace(/\\s+/g, ' ').trim(),
                };
              })
              .filter(candidate => candidate.labels.length === 1
                && candidate.labels[0] === 'Review needs attention')
              .sort((left, right) => left.text.length - right.text.length);
            return candidates[0] || null;
          })()`);
        } catch (noticeError) {
          admissionFailure.reviewInspection.disclosureUnavailable = noticeError.message;
        }
      }
      writeEvidenceJson(output, 'short-panel-admission-failure', admissionFailure);
      context.diagnostic(`T012 admission failure detail: ${JSON.stringify(admissionFailure)}`);
      throw error;
    }
    await evaluate(page, `window.floatingFrame = document.querySelector('.dude-review-frame iframe');
      window.floatingLoads = 0;
      window.floatingFrame.addEventListener('load', () => window.floatingLoads++)`);
    wheelExperiment.variants.positioned.shortPanel = {
      viewport:structuredClone(shortPanelFixture.viewport),
      frame:{
        clientWidth:shortViewport.width,
        clientHeight:shortViewport.height,
        rect:structuredClone(shortViewport.rawFrame),
      },
      viewBox:shortViewport.viewBox,
    };
    wheelExperiment.variants.positioned.qualification =
      await qualifyReviewSourceObserver(wheelObserver);
    wheelExperiment.variants.positioned.stage =
      wheelExperiment.variants.positioned.qualification.passed
        ? 'qualified'
        : 'qualification-failed';
    writeEvidenceJson(output, 'short-panel-wheel-discriminator', wheelExperiment);
    assert.equal(
      wheelExperiment.variants.positioned.qualification.passed,
      true,
      'positioned source observation must qualify before its diagnostic wheel',
    );

    // Act: use each tool's own native scroller, not a scrollIntoView helper.
    // Disabled history commands are measured too, then activated when their
    // actual history state permits. The orientation switch is outside it.
    const snapshots = [];
    const targets = [];
    const keyboardReachability = {};
    const workflowState = {};
    const movementState = {
      pointer: null,
      menu: null,
      drag: null,
      keyboard: null,
      edges: [],
      orientationReset: null,
      persistence: null,
      frameResizeObservations: [],
    };
    const pinningState = {
      pointerComment: null,
      keyboardComment: null,
      commentConfirmation: {},
      annotatedResize: null,
      emptyReturn: null,
      genuineFrameChange: null,
      wheelDelivery: wheelExperiment,
    };
    context.after(() => writeEvidenceJson(output, 'short-panel-observations', {
      snapshots,
      targets,
      keyboardReachability,
      workflowState,
      movementState,
      pinningState,
      runtimeErrors,
    }));
    const tools = ['Select (V)', 'Comment (C)', 'Box (B)', 'Circle (O)',
      'Arrow (A)', 'Line (L)', 'Highlight (H)', 'Undo annotation', 'Redo annotation'];
    const tool = label => `document.querySelector('[data-review-tools] [aria-label="${label}"]')`;
    const grip = `document.querySelector('[data-review-tools-grip]')`;
    const menu = `document.querySelector('[data-review-tools-menu]')`;
    const menuItem = label => `[...document.querySelectorAll(
      '[data-review-tools-menu] [role="menuitem"]'
    )].find(node => node.textContent.trim() === ${JSON.stringify(label)})`;
    const toggle = `document.querySelector('[data-review-tools] [aria-label^="Switch tools to"]')`;
    const settlePalette = () => evaluate(
      page,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    const waitForPaletteUncovered = () => until(() => evaluate(page, `(() => {
      const toolbar = document.querySelector('[data-review-tools] [role="toolbar"]');
      const palette = document.querySelector('[data-review-tools]');
      if (!toolbar || !palette) return false;
      const box = toolbar.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return Boolean(hit && (hit === palette || palette.contains(hit)))
        && document.getAnimations()
          .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
          .every(animation => animation.playState === 'finished' || animation.playState === 'idle');
    })()`), 'comment drawer no longer covers the floating palette');
    const currentWorkingFile = () => {
      const reviews = path.join(
        root,
        ...path.posix.dirname(feature.specPath).split('/'),
        'reviews',
      );
      if (!fs.existsSync(reviews)) return null;
      const entry = fs.readdirSync(reviews)
        .find(name => fs.existsSync(path.join(reviews, name, 'working.json')));
      return entry ? path.join(reviews, entry, 'working.json') : null;
    };
    const currentWorkingState = () => {
      const file = currentWorkingFile();
      return file ? JSON.parse(fs.readFileSync(file, 'utf8')).state : null;
    };
    const commentDrawerSnapshot = () => evaluate(page, `(() => {
      const close = document.querySelector('[aria-label="Close comments"]');
      const drawer = close?.closest('.fui-OverlayDrawer')
        || close?.closest('[role="dialog"]')
        || [...document.querySelectorAll('.fui-OverlayDrawer,[role="dialog"]')]
          .find(node => node.textContent.includes('Comments and geometry'));
      if (!drawer) return {present:false};
      const status = drawer.querySelector('[data-review-comment-status]');
      const done = drawer.querySelector('[data-review-comments-done]');
      const comment = ${field('Comment (optional)')};
      const intro = 'Each annotation can be selected and edited here without dragging a small handle. '
        + 'Comments are kept as you type. Sending them is a separate action.';
      return {
        present:true,
        text:drawer.innerText.replace(/\\s+/g, ' ').trim(),
        introPresent:drawer.innerText.replace(/\\s+/g, ' ').includes(intro),
        badges:[...drawer.querySelectorAll('.fui-Badge')]
          .map(node => node.textContent.trim()),
        status:status?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
        statusRegions:drawer.querySelectorAll('[role="status"]').length,
        liveRegions:drawer.querySelectorAll(
          '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]'
        ).length,
        commentValue:comment?.value ?? null,
        current:[...drawer.querySelectorAll('[data-annotation-id][aria-current="true"]')]
          .map(node => node.getAttribute('aria-label')),
        list:[...drawer.querySelectorAll('[data-annotation-id]')]
          .map(node => node.getAttribute('aria-label')),
        done:{
          text:done?.innerText.trim() ?? null,
          title:done?.getAttribute('title') ?? null,
        },
        closeTitle:close?.getAttribute('title') ?? null,
        prohibitedPositiveClaim:/\\b(?:submitted|delivered|approved)\\b/i.test(drawer.innerText),
      };
    })()`);
    const assertCommentDrawer = async ({
      number = null,
      comment = null,
      status = '',
      nativeLiveRegion = false,
    } = {}) => {
      const snapshot = await until(async () => {
        const value = await commentDrawerSnapshot();
        return value.present && value.status === status ? value : null;
      }, `comment drawer status ${JSON.stringify(status)}`);
      assert.equal(snapshot.introPresent, true,
        'the drawer states that typing keeps a comment and sending is separate');
      assert.deepEqual(snapshot.badges, number === null ? [] : ['Not sent'],
        'only the selected annotation carries the exact static unsent badge');
      assert.equal(snapshot.statusRegions, 1,
        'the drawer owns one status region rather than a badge announcer plus a footer announcer');
      assert.equal(snapshot.liveRegions, 1,
        'no second live-region role duplicates the comment confirmation');
      assert.deepEqual(snapshot.done, {
        text:'Done',
        title:'Close this list. Comments stay on their annotations. Sending them is a separate action.',
      });
      assert.equal(
        snapshot.closeTitle,
        'Close this list. Your comments stay on their annotations.',
      );
      assert.equal(snapshot.prohibitedPositiveClaim, false,
        'drawer-authored wording must not claim submitted, delivered, or approved');
      if (number === null) {
        assert.deepEqual(snapshot.current, []);
        assert.equal(snapshot.commentValue, null);
      } else {
        assert.equal(snapshot.current.length, 1);
        assert.match(snapshot.current[0], new RegExp(`^Annotation ${number}:`));
        assert.equal(snapshot.commentValue, comment);
      }
      if (nativeLiveRegion && status) {
        const matching = axLiveRegions(await page.send('Accessibility.getFullAXTree'))
          .filter(region => region.role === 'status'
            && region.live === 'polite'
            && region.text.includes(status));
        assert.equal(matching.length, 1,
          'the exact current confirmation reaches one native polite status region');
        snapshot.nativeLiveRegion = matching;
      }
      return snapshot;
    };
    const liveAnnotationState = () => evaluate(page, `(() => {
      const comments = [...document.querySelectorAll('button')]
        .find(node => /^Comments \\(\\d+\\)$/.test(node.innerText.trim()));
      const count = Number(comments?.innerText.match(/\\d+/)?.[0]);
      const overlay = document.querySelector('.dude-review-overlay');
      return {
        annotationCount:Number.isFinite(count) ? count : null,
        annotationIds:[...(overlay?.querySelectorAll('[data-annotation]') || [])]
          .map(node => node.getAttribute('data-annotation')),
        tool:overlay?.getAttribute('data-tool') || null,
        saveDisabled:${button('Save markup')}
          ?.matches(':disabled,[aria-disabled="true"]') ?? null,
        undoDisabled:${tool('Undo annotation')}?.disabled ?? null,
        redoDisabled:${tool('Redo annotation')}?.disabled ?? null,
      };
    })()`);
    const pinSnapshot = () => evaluate(page, `(() => {
      const rect = node => node?.getBoundingClientRect().toJSON() || null;
      const frame = document.querySelector('.dude-review-frame');
      const overlay = document.querySelector('.dude-review-overlay');
      const outer = document.querySelector('.dude-review-engine');
      const palette = document.querySelector('[data-review-tools]');
      const band = palette?.parentElement;
      const grip = document.querySelector('[data-review-tools-grip]');
      const paletteRect = palette?.getBoundingClientRect();
      const bandRect = band?.getBoundingClientRect();
      const gripRect = grip?.getBoundingClientRect();
      const gripHit = gripRect && document.elementFromPoint(
        gripRect.left + gripRect.width / 2,
        gripRect.top + gripRect.height / 2,
      );
      return {
        status:[...document.querySelectorAll('[data-review-workspace] .fui-Badge')]
          .map(node => node.textContent.trim())[0] || null,
        comments:[...document.querySelectorAll('button')]
          .find(node => /^Comments \\(\\d+\\)$/.test(node.innerText.trim()))?.innerText.trim() || null,
        frame:{
          rect:rect(frame),
          clientWidth:frame?.clientWidth ?? null,
          clientHeight:frame?.clientHeight ?? null,
          offsetWidth:frame?.offsetWidth ?? null,
          offsetHeight:frame?.offsetHeight ?? null,
          offsetLeft:frame?.offsetLeft ?? null,
          offsetTop:frame?.offsetTop ?? null,
          inlineWidth:frame?.style.width || '',
          inlineHeight:frame?.style.height || '',
          pinned:frame?.classList.contains('dude-review-frame-pinned') || false,
        },
        viewBox:overlay?.getAttribute('viewBox') || null,
        markers:[...(overlay?.querySelectorAll('[data-annotation]') || [])].map(node => {
          const circle = node.querySelector('circle');
          return {
            id:node.getAttribute('data-annotation'),
            rect:rect(node),
            cx:circle ? Number(circle.getAttribute('cx')) : null,
            cy:circle ? Number(circle.getAttribute('cy')) : null,
          };
        }),
        outer:{
          rect:rect(outer),
          clientWidth:outer?.clientWidth ?? null,
          clientHeight:outer?.clientHeight ?? null,
          scrollWidth:outer?.scrollWidth ?? null,
          scrollHeight:outer?.scrollHeight ?? null,
          scrollLeft:outer?.scrollLeft ?? null,
          scrollTop:outer?.scrollTop ?? null,
          overflow:outer ? getComputedStyle(outer).overflow : null,
          focused:document.activeElement === outer,
        },
        palette:{
          rect:rect(palette),
          band:rect(band),
          offset:palette?.getAttribute('data-review-tools-offset') || null,
          outsideOuter:Boolean(outer && palette && !outer.contains(palette)),
          whollyReachable:Boolean(paletteRect && bandRect
            && paletteRect.left >= bandRect.left - 1
            && paletteRect.top >= bandRect.top - 1
            && paletteRect.right <= bandRect.right + 1
            && paletteRect.bottom <= bandRect.bottom + 1),
          gripAboveOuter:Boolean(gripHit && grip && (gripHit === grip || grip.contains(gripHit))),
        },
        controls:[...document.querySelectorAll('[data-review-workspace] button')]
          .filter(node => node.getClientRects().length)
          .map(node => ({
            name:node.getAttribute('aria-label') || node.innerText.trim(),
            disabled:node.matches(':disabled,[aria-disabled="true"]'),
            title:node.getAttribute('title'),
            describedBy:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
              .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || null),
            description:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
              .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
              .filter(Boolean).join(' ') || null,
          })),
        sameIframe:window.floatingFrame === frame?.querySelector('iframe')
          && window.floatingLoads === 0,
      };
    })()`);
    const paletteState = () => evaluate(page, `(() => {
      const palette = document.querySelector('[data-review-tools]');
      const stage = palette.parentElement;
      const handle = ${grip};
      const frame = document.querySelector('.dude-review-frame');
      const iframe = frame.querySelector('iframe');
      const toolbar = palette.querySelector('[role="toolbar"][aria-label="Annotation tools"]');
      const menu = ${menu};
      const offset = palette.getAttribute('data-review-tools-offset').split(',').map(Number);
      const rect = node => node.getBoundingClientRect().toJSON();
      const hit = (() => {
        const box = handle.getBoundingClientRect();
        return [[.5,.5],[.08,.08],[.92,.08],[.08,.92],[.92,.92]].map(([x,y]) => {
          const node = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
          return Boolean(node && (node === handle || handle.contains(node)));
        });
      })();
      return {
        offset: {x:offset[0], y:offset[1]},
        palette: rect(palette),
        grip: {...rect(handle), hit},
        stage: rect(stage),
        frame: rect(frame),
        iframe: rect(iframe),
        layout: {
          stageClientWidth:stage.clientWidth,
          stageClientHeight:stage.clientHeight,
          stageClientLeft:stage.clientLeft,
          stageClientTop:stage.clientTop,
          left:palette.offsetLeft,
          top:palette.offsetTop,
          width:palette.offsetWidth,
          height:palette.offsetHeight,
          minX:Math.min(0, -palette.offsetLeft),
          maxX:Math.max(0, stage.clientWidth - palette.offsetLeft - palette.offsetWidth),
          minY:Math.min(0, -palette.offsetTop),
          maxY:Math.max(0, stage.clientHeight - palette.offsetTop - palette.offsetHeight),
        },
        toolScroller:{height:toolbar.clientHeight,width:toolbar.clientWidth},
        orientation:toolbar.getAttribute('aria-orientation'),
        switchName:${toggle}.getAttribute('aria-label'),
        gripExpanded:handle.getAttribute('aria-expanded'),
        menu:menu?.getClientRects().length ? {
          rect:rect(menu),
          items:[...menu.querySelectorAll('[role="menuitem"]')].map(node => {
            const box = node.getBoundingClientRect();
            const hits = [[.5,.5],[.08,.08],[.92,.08],[.08,.92],[.92,.92]]
              .map(([x,y]) => {
                const hit = document.elementFromPoint(
                  box.left + box.width * x,
                  box.top + box.height * y,
                );
                return Boolean(hit && (hit === node || node.contains(hit)));
              });
            let background = 'rgba(0, 0, 0, 0)';
            for (let current = node; current; current = current.parentElement) {
              const value = getComputedStyle(current).backgroundColor;
              if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                background = value;
                break;
              }
            }
            return {
              name:node.textContent.trim(),
              rect:box.toJSON(),
              hits,
              foreground:getComputedStyle(node).color,
              background,
            };
          }),
        } : null,
        reviewStatus:[...document.querySelectorAll('[data-review-workspace] .fui-Badge')]
          .map(node => node.textContent.trim())[0] || null,
        comments:[...document.querySelectorAll('button')]
          .find(node => /^Comments \\(\\d+\\)$/.test(node.innerText.trim()))?.innerText.trim() || null,
        workflowStatuses:[...document.querySelectorAll('[data-review-workspace] [role="status"]')]
          .filter(node => !node.closest('[data-review-tools]'))
          .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
        moveStatus:palette.querySelector('[role="status"]')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      };
    })()`);
    const dragPalette = async (dx, dy) => {
      const from = await evaluate(page, `(() => {
        const box = ${grip}.getBoundingClientRect();
        return {x:box.left + box.width / 2, y:box.top + box.height / 2};
      })()`);
      await page.send('Input.dispatchMouseEvent', {type:'mouseMoved', ...from});
      await page.send('Input.dispatchMouseEvent', {
        type:'mousePressed', ...from, button:'left', buttons:1, clickCount:1,
      });
      for (let step = 1; step <= 6; step += 1) {
        await page.send('Input.dispatchMouseEvent', {
          type:'mouseMoved',
          x:from.x + dx * step / 6,
          y:from.y + dy * step / 6,
          button:'left',
          buttons:1,
        });
      }
      await page.send('Input.dispatchMouseEvent', {
        type:'mouseReleased',
        x:from.x + dx,
        y:from.y + dy,
        button:'left',
        buttons:0,
        clickCount:1,
      });
      await settlePalette();
    };
    const waitForMenu = () => until(
      () => evaluate(page, `Boolean(${menu}?.getClientRects().length)`),
      'Move tools position menu',
    );
    const waitForNoMenu = () => until(
      () => evaluate(page, `!${menu}?.getClientRects().length`),
      'dismissed Move tools position menu',
    );
    const waitForMenuMotion = () => until(
      () => evaluate(page, `document.getAnimations()
        .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .every(animation => animation.playState === 'finished' || animation.playState === 'idle')`),
      'finite Move tools menu motion',
    );
    const openToolsMenu = async () => {
      const before = await paletteState();
      await clickAtCurrentPosition(page, grip);
      await waitForMenu();
      await waitForMenuMotion();
      await settlePalette();
      const opened = await paletteState();
      assert.deepEqual(opened.offset, before.offset,
        'opening Move tools must not change the parked offset');
      assert.equal(opened.gripExpanded, 'true');
      assert.ok(opened.menu);
      return {before, opened};
    };
    const chooseToolsPosition = async label => {
      const opened = await openToolsMenu();
      await clickAtCurrentPosition(page, menuItem(label));
      await waitForNoMenu();
      await settlePalette();
      return {opened, landed:await paletteState()};
    };
    const tabToGrip = async () => {
      const path = [];
      for (let step = 0; step < 60; step += 1) {
        if (await evaluate(page, `document.activeElement === (${grip})`)) return path;
        await pressNavigationKey(page, 'Tab');
        path.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.innerText?.trim() || document.activeElement?.tagName`));
      }
      assert.fail(`Native Tab did not reach Move tools: ${JSON.stringify(path)}`);
    };
    const tabTo = async (expression, label, limit = 80) => {
      const path = [];
      for (let step = 0; step < limit; step += 1) {
        if (await evaluate(page, `document.activeElement === (${expression})`)) return path;
        await pressNavigationKey(page, 'Tab');
        path.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.innerText?.trim() || document.activeElement?.tagName`));
      }
      assert.fail(`Native Tab did not reach ${label}: ${JSON.stringify(path)}`);
    };
    let expectedComments = 'Comments (0)';
    const checkpoint = async name => {
      const snapshot = await shortReviewToolbarSnapshot(page, name);
      snapshot.iframeSame = await evaluate(page, `window.floatingFrame === document.querySelector('.dude-review-frame iframe')
        && window.floatingLoads === 0`);
      snapshot.expectedComments = expectedComments;
      snapshots.push(snapshot);
      return snapshot;
    };
    const recordTarget = async (name, expression) => {
      const target = {checkpoint:name, ...await floatingControlSnapshot(page, expression)};
      targets.push(target);
      return target;
    };

    wheelExperiment.variants.positioned.wheel =
      await dispatchObservedReviewWheel(page, wheelObserver, 'positioned');
    wheelExperiment.variants.positioned.stage = 'wheel-observed';
    await checkpoint('workspace-wheel-attempt');
    await clickAtCurrentPosition(page, button('Notes and more'));
    await until(() => observeRuntime(page, `Boolean(document.querySelector(
      '.fui-PopoverSurface[aria-label="Notes and more"]'
    )?.getClientRects().length)`), 'positioned Notes and more surface');
    const positionedChooserPath = [];
    for (let step = 0; step < 80; step += 1) {
      if (await observeRuntime(
        page,
        `document.activeElement === (${field('Choose an element')})`,
      )) break;
      await pressNavigationKey(page, 'Tab');
      positionedChooserPath.push(await observeRuntime(
        page,
        `document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.getAttribute('role')
          || document.activeElement?.innerText?.trim()
          || document.activeElement?.tagName`,
      ));
    }
    await checkpoint('keyboard-chooser-focused');
    await recordTarget('keyboard-chooser-focused', field('Choose an element'));
    await saveRegressionProof(page, output, 'keyboard-chooser-focused', {});
    const positionedChooserBefore = await reviewChooserSnapshot(page);
    await press(page, 'Enter');
    const positionedChooserOpened = await until(async () => {
      const value = await reviewChooserSnapshot(page);
      return value.ariaExpanded === 'true'
        && value.linkedListboxCount === 1
        && value.linkedListboxVisible
        ? value : null;
    }, 'positioned aria-controls-linked element choices');
    wheelExperiment.variants.positioned.chooser = {
      focusPath:positionedChooserPath,
      before:positionedChooserBefore,
      opened:positionedChooserOpened,
    };
    await press(page, 'Escape');
    await until(async () => {
      const value = await reviewChooserSnapshot(page);
      return value.ariaExpanded !== 'true' ? value : null;
    }, 'positioned element choices closed');
    await press(page, 'Escape');
    await until(() => observeRuntime(page, `!document.querySelector(
      '.fui-PopoverSurface[aria-label="Notes and more"]'
    )?.getClientRects().length
      && document.activeElement === (${button('Notes and more')})`),
    'positioned Notes and more closed with focus returned to its trigger');

    const summarizeWheelVariant = record => {
      const post = record.wheel?.post;
      const bridge = record.wheel?.bridge?.latestView?.reply ?? null;
      const sourceHeading = post?.source.view.targets
        .find(target => target.selector === '#heading') ?? null;
      const bridgeHeading = bridge?.targets
        ?.find(target => target.selector === '#heading') ?? null;
      const linked = record.chooser?.opened ?? null;
      const chooserHeading = linked?.options.find(option => (
        option.visible && option.label === (bridgeHeading?.label || 'Source-aligned design')
      )) ?? null;
      return {
        browser:record.browser,
        sourceRevision:record.sourceRevision,
        geometry:record.shortPanel,
        requestedPoint:record.wheel?.request
          ? { x:record.wheel.request.x, y:record.wheel.request.y }
          : null,
        requestedHit:record.wheel?.points?.[
          record.variant === 'overlay-negative' ? 'overlay' : 'outside'
        ]?.hit ?? null,
        receiver:record.wheel?.receiver ?? null,
        source:{
          scrollY:post?.source.view.viewport.scrollY ?? null,
          headingVisible:post?.source.heading.visible ?? null,
          headingRect:post?.source.heading.element?.rect ?? null,
          headingClip:post?.source.heading.clip ?? null,
          headingTarget:sourceHeading,
        },
        bridge:{
          channel:record.wheel?.bridge?.latestView?.query.channel ?? null,
          id:record.wheel?.bridge?.latestView?.query.id ?? null,
          op:record.wheel?.bridge?.latestView?.query.op ?? null,
          replyType:bridge?.type ?? null,
          scrollY:bridge?.viewport?.scrollY ?? null,
          headingTarget:bridgeHeading,
          correlated:Boolean(record.wheel?.bridge?.latestView),
        },
        chooser:{
          headingOption:chooserHeading,
          ariaControls:linked?.ariaControls ?? null,
          ariaExpanded:linked?.ariaExpanded ?? null,
          ariaActiveDescendant:linked?.ariaActiveDescendant ?? null,
          linkedListboxCount:linked?.linkedListboxCount ?? null,
          linkedListboxId:linked?.linkedListboxId ?? null,
          linkedListboxVisible:linked?.linkedListboxVisible ?? null,
          focus:linked?.focus ?? null,
        },
      };
    };
    wheelExperiment.summaries = {
      standalone:summarizeWheelVariant(wheelExperiment.variants.standalone),
      positioned:summarizeWheelVariant(wheelExperiment.variants.positioned),
      overlayNegative:summarizeWheelVariant(wheelExperiment.variants.overlayNegative),
    };
    const { standalone, positioned, overlayNegative } = wheelExperiment.summaries;
    const same = (left, right) => isDeepStrictEqual(left, right);
    const matched = {
      browser:standalone.browser === positioned.browser
        && positioned.browser === overlayNegative.browser,
      source:standalone.sourceRevision === positioned.sourceRevision
        && positioned.sourceRevision === overlayNegative.sourceRevision,
      geometry:same(standalone.geometry, positioned.geometry)
        && same(positioned.geometry, overlayNegative.geometry),
      outsidePoint:same(standalone.requestedPoint, positioned.requestedPoint),
      dpr:[standalone, positioned, overlayNegative]
        .every(value => value.geometry?.viewport?.dpr === 2),
      dimensions:[standalone, positioned, overlayNegative].every(value => (
        value.geometry?.viewport?.width === 1000
          && value.geometry?.viewport?.height === 300
          && value.geometry?.frame?.clientWidth === 942
          && value.geometry?.frame?.clientHeight === 118
          && value.geometry?.frame?.rect?.height === 117.5
      )),
    };
    wheelExperiment.matched = matched;
    const visibleTargetMissingFromChooser = Object.values(wheelExperiment.summaries)
      .some(value => (
        value.source.headingVisible
          && value.source.headingTarget?.selector === '#heading'
          && value.bridge.headingTarget?.selector === '#heading'
          && !value.chooser.headingOption
      ));
    const positionedWheel = wheelExperiment.variants.positioned.wheel;
    const positionedSourceQueries = positionedWheel.post.source.probe.queries
      .slice(positionedWheel.marker.sourceQuery);
    const negativeWheel = wheelExperiment.variants.overlayNegative.wheel;
    const negativeSourceQueries = negativeWheel.post.source.probe.queries
      .slice(negativeWheel.marker.sourceQuery);
    const negativeScrollQueries = negativeSourceQueries
      .filter(query => query.op === 'scroll');
    const negativeSuccessfulQueries = negativeWheel.bridge.correlations
      .filter(({query, reply}) => (
        query.order > negativeWheel.marker.sourceQuery
          && reply.type === 'dude-review-result'
          && !reply.error
          && reply.viewport
      ));
    const negativeDeliveryComplete = negativeScrollQueries.length > 0
      && negativeScrollQueries.reduce((total, query) => total + query.delta.y, 0) === 360
      && negativeSourceQueries.at(-1)?.op === 'view'
      && negativeSuccessfulQueries.length === negativeSourceQueries.length;
    const trustedWheelTotal = value => {
      const events = value.receiver?.parentEvents ?? [];
      return events.length > 0
        && events.every(event => event.isTrusted && event.deltaMode === 0)
        && events.reduce((total, event) => total + event.deltaY, 0) === 360;
    };
    const positionedPositive = positioned.requestedHit?.reviewOverlay === false
      && trustedWheelTotal(positioned)
      && positioned.receiver?.outsideOverlay
      && !positioned.receiver?.overlay
      && !positioned.receiver?.source
      && positionedSourceQueries.length === 0
      && positioned.source.scrollY === 0
      && positioned.source.headingVisible
      && positioned.source.headingTarget?.selector === '#heading'
      && positioned.bridge.correlated
      && positioned.bridge.scrollY === 0
      && positioned.bridge.headingTarget?.selector === '#heading'
      && positioned.chooser.headingOption
      && positioned.chooser.linkedListboxCount === 1
      && positioned.chooser.linkedListboxVisible
      && positioned.chooser.focus === 'chooser';
    const negativeControl = overlayNegative.requestedHit?.reviewOverlay === true
      && trustedWheelTotal(overlayNegative)
      && overlayNegative.receiver?.overlay
      && !overlayNegative.receiver?.outsideOverlay
      && !overlayNegative.receiver?.source
      && negativeDeliveryComplete
      && overlayNegative.source.scrollY > 0
      && overlayNegative.source.headingVisible === false
      && overlayNegative.source.headingRect
      && overlayNegative.source.headingClip
      && overlayNegative.source.headingRect.y + overlayNegative.source.headingRect.height
        <= overlayNegative.source.headingClip.top
      && overlayNegative.source.headingTarget === null
      && overlayNegative.bridge.correlated
      && overlayNegative.bridge.scrollY === overlayNegative.source.scrollY
      && overlayNegative.bridge.headingTarget === null
      && overlayNegative.chooser.headingOption === null
      && overlayNegative.chooser.linkedListboxCount === 1
      && overlayNegative.chooser.linkedListboxVisible;
    wheelExperiment.legacyStandalone = {
      gating:false,
      requestedOutsideOverlay:standalone.requestedHit?.reviewOverlay === false,
      actualReceiver:standalone.receiver?.overlay
        ? 'overlay'
        : standalone.receiver?.outsideOverlay
          ? 'outside-overlay'
          : standalone.receiver?.source
            ? 'source'
            : 'unobserved',
      sourceScrollY:standalone.source.scrollY,
      headingVisible:standalone.source.headingVisible,
    };
    const matchedPass = Object.values(matched).every(Boolean);
    if (!matchedPass) {
      wheelExperiment.discriminator = {
        status:'invalid-comparison',
        reason:'Browser, source, geometry, DPR, or outside point did not match.',
      };
    } else if (visibleTargetMissingFromChooser) {
      wheelExperiment.discriminator = {
        status:'refuted-precondition-only',
        reason:'A settled source and bridge heading was omitted by its linked listbox.',
      };
    } else if (!positionedPositive) {
      wheelExperiment.discriminator = {
        status:'refuted-targeting',
        reason:'Confirmed positioned outside-overlay delivery did not preserve the positive source/bridge/listbox precondition.',
      };
    } else if (!negativeControl) {
      wheelExperiment.discriminator = {
        status:'failed-negative-control',
        reason:'The deliberate overlay wheel did not completely deliver 360 trusted pixels or exclude the offscreen heading with source/bridge/listbox agreement.',
      };
    } else {
      wheelExperiment.discriminator = {
        status:'pending-native-second-comment',
        reason:'Receiver/source/bridge/listbox distinction succeeded; native #heading selection remains.',
      };
    }
    wheelExperiment.variants.positioned.stage = 'chooser-observed';
    writeEvidenceJson(output, 'short-panel-wheel-discriminator', wheelExperiment);
    assert.equal(
      wheelExperiment.discriminator.status,
      'pending-native-second-comment',
      wheelExperiment.discriminator.reason,
    );

    await checkpoint('ready-vertical');
    for (const label of tools) {
      await revealFloatingTool(page, label);
      const target = await recordTarget(`wheel-${label}`, tool(label));
      await recordTarget(`pinned-${label}`, toggle);
      if (!target.disabled) await clickAtCurrentPosition(page, tool(label));
      await checkpoint(`wheel-${label}`);
    }
    await saveRegressionProof(page, output, 'vertical-native-scroll', {targets});
    await clickAtCurrentPosition(page, toggle);
    await until(() => evaluate(page, `${toggle}?.getAttribute('aria-label') === 'Switch tools to vertical'`),
      'pointer-selected horizontal tools');
    await checkpoint('pointer-horizontal');
    for (const label of tools) await recordTarget(`horizontal-${label}`, tool(label));
    keyboardReachability.horizontalPointerTarget = await recordTarget('horizontal-toggle', toggle);
    await clickAtCurrentPosition(page, toggle);
    await until(() => evaluate(page, `${toggle}?.getAttribute('aria-label') === 'Switch tools to horizontal'`),
      'pointer-returned vertical tools');
    await checkpoint('pointer-return-vertical');
    await press(page, 'Enter');
    await until(() => evaluate(page, `${toggle}?.getAttribute('aria-label') === 'Switch tools to vertical'`),
      'keyboard-selected horizontal tools');
    await checkpoint('keyboard-horizontal');
    await press(page, 'Enter');
    await until(() => evaluate(page, `${toggle}?.getAttribute('aria-label') === 'Switch tools to horizontal'`),
      'keyboard-selected vertical tools');
    await checkpoint('keyboard-vertical');

    await clickAtCurrentPosition(page, button('Source'));
    await checkpoint('source-open');
    await press(page, 'Escape');
    await until(() => evaluate(page, `document.activeElement === (${button('Source')})`),
      'Source returns focus to its trigger');

    // Arrange: select Comment with a trusted pointer and target the approved
    // mock's unique header. This first commit is the exact point where the
    // validated inner viewport must become immutable.
    wheelExperiment.variants.positioned.prePin =
      await wheelObserver.snapshot('pre-pin');
    await revealFloatingTool(page, 'Comment (C)');
    await clickAtCurrentPosition(page, tool('Comment (C)'));
    const frame = snapshots[0].frame;
    const p = {x:frame.x+150,y:frame.y+18.5};
    assert.equal(await evaluate(page, `Boolean(document.elementFromPoint(${p.x}, ${p.y})
      ?.closest('.dude-review-overlay'))`), true,
    'the first comment pointer lands on the actual reviewed overlay');
    await page.send('Input.dispatchMouseEvent', {type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
    await page.send('Input.dispatchMouseEvent', {type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})
      && Boolean(document.querySelector('[aria-label="Close comments"]'))
      && Boolean(${field('Comment (optional)')} && !${field('Comment (optional)')}.disabled)
      && document.activeElement === ${field('Comment (optional)')}`),
    'native pointer comment opens its enabled focused text field directly');
    await evaluate(page, `(() => {
      const node = document.querySelector('[data-review-comment-status]');
      window.t012CommentStatusMutations = [];
      window.t012CommentStatusObserver = new MutationObserver(records => {
        window.t012CommentStatusMutations.push({
          mutations:records.length,
          text:node.innerText.replace(/\\s+/g, ' ').trim(),
          regions:node.closest('.fui-OverlayDrawer')?.querySelectorAll('[role="status"]').length ?? null,
        });
      });
      window.t012CommentStatusObserver.observe(node, {
        childList:true, subtree:true, characterData:true,
      });
    })()`);
    await page.send('Input.insertText', {text:'Pointer comment enters here directly.'});
    await until(() => evaluate(page, `${field('Comment (optional)')}.value
      === 'Pointer comment enters here directly.'`), 'native pointer comment text rendered');
    const pointerTyping = await assertCommentDrawer({
      number:1,
      comment:'Pointer comment enters here directly.',
      status:'Comment kept on annotation 1. Markup not saved yet.',
      nativeLiveRegion:true,
    });
    await pressNavigationKey(page, 'ArrowLeft');
    await pressNavigationKey(page, 'ArrowLeft', 'ArrowLeft', 8);
    expectedComments = 'Comments (1)';
    const pointerWorking = await until(() => {
      const working = currentWorkingState();
      return working?.annotations?.length === 1
        && working.annotations[0].comment === 'Pointer comment enters here directly.'
        ? working : null;
    }, 'first pointer comment and native caret autosaved');
    const pointerSaved = await assertCommentDrawer({
      number:1,
      comment:'Pointer comment enters here directly.',
      status:'Comment kept on annotation 1. Markup saved.',
      nativeLiveRegion:true,
    });
    const pointerAnnouncements = await evaluate(page, 'window.t012CommentStatusMutations');
    assert.equal(pointerAnnouncements.filter(({text}) => (
      text === 'Comment kept on annotation 1. Markup not saved yet.'
    )).length, 1, 'typing changes the one mounted status region to not-yet-saved once');
    assert.equal(pointerAnnouncements.filter(({text}) => (
      text === 'Comment kept on annotation 1. Markup saved.'
    )).length, 1, 'autosave changes the same mounted status region to saved once');
    assert.deepEqual(
      [...new Set(pointerAnnouncements.map(({regions}) => regions))],
      [1],
      'every observed comment-status mutation had one drawer status region',
    );
    const pointerPin = await pinSnapshot();
    assert.equal(pointerPin.frame.pinned, true,
      'the frame is pinned before the first comment becomes durable');
    assert.deepEqual(
      {
        clientWidth:pointerPin.frame.clientWidth,
        clientHeight:pointerPin.frame.clientHeight,
        inlineWidth:pointerPin.frame.inlineWidth,
        inlineHeight:pointerPin.frame.inlineHeight,
        viewBox:pointerPin.viewBox,
      },
      {
        clientWidth:shortViewport.width,
        clientHeight:shortViewport.height,
        inlineWidth:`${shortViewport.width}px`,
        inlineHeight:`${shortViewport.height}px`,
        viewBox:shortViewport.viewBox,
      },
      'the pin uses the validated inner iframe CSS dimensions',
    );
    assert.equal(pointerPin.markers.length, 1,
      'pointer comment coverage cannot pass without a visible marker');
    const pointerCaretBeforeClose = await evaluate(page, `({
      start:${field('Comment (optional)')}.selectionStart,
      end:${field('Comment (optional)')}.selectionEnd,
      direction:${field('Comment (optional)')}.selectionDirection,
    })`);
    pinningState.pointerComment = {
      working:pointerWorking,
      snapshot:pointerPin,
      confirmation:{typing:pointerTyping, saved:pointerSaved, announcements:pointerAnnouncements},
      caretBeforeClose:pointerCaretBeforeClose,
    };
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`),
      'pointer comment drawer exit');
    const frameAfterDismiss = await pinSnapshot();
    await clickAtCurrentPosition(page, button('Comments (1)'));
    await until(() => evaluate(page, `Boolean(${field('Comment (optional)')})
      && document.activeElement === ${field('Comment (optional)')}`),
    'pointer-dismissed comment drawer reopens its retained field');
    const pointerReopened = await assertCommentDrawer({
      number:1,
      comment:'Pointer comment enters here directly.',
      status:'Comment kept on annotation 1. Markup saved.',
    });
    const pointerCaretAfterReopen = await evaluate(page, `({
      start:${field('Comment (optional)')}.selectionStart,
      end:${field('Comment (optional)')}.selectionEnd,
      direction:${field('Comment (optional)')}.selectionDirection,
    })`);
    assert.deepEqual(pointerCaretAfterReopen, pointerCaretBeforeClose,
      'the X dismiss keeps both comment text and the native backward caret range');
    const frameAfterReopen = await pinSnapshot();
    await clickAtCurrentPosition(page, `document.querySelector('[data-review-comments-done]')`);
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')
      && document.activeElement === (${button('Comments (1)')})`),
    'pointer Done returns focus to Comments (1)');
    const frameAfterDone = await pinSnapshot();
    const stableFrame = value => ({
      rect:value.frame.rect,
      clientWidth:value.frame.clientWidth,
      clientHeight:value.frame.clientHeight,
      inlineWidth:value.frame.inlineWidth,
      inlineHeight:value.frame.inlineHeight,
      viewBox:value.viewBox,
    });
    assert.deepEqual(
      [frameAfterDismiss, frameAfterReopen, frameAfterDone].map(stableFrame),
      [pointerPin, pointerPin, pointerPin].map(stableFrame),
      'opening, X-closing, reopening, and finishing the drawer never resize the pinned frame',
    );
    pinningState.commentConfirmation.pointer = {
      typing:pointerTyping,
      saved:pointerSaved,
      reopened:pointerReopened,
      announcements:pointerAnnouncements,
      caretBeforeClose:pointerCaretBeforeClose,
      caretAfterReopen:pointerCaretAfterReopen,
      frameAfterDismiss,
      frameAfterReopen,
      frameAfterDone,
    };
    await waitForPaletteUncovered();

    // Act through the keyboard-only picker path. A second comment must open
    // the same editor directly; no separate Comments action is allowed.
    const keyboardPath = {
      details:await tabTo(button('Notes and more'), 'Notes and more'),
      chooser:[],
      add:[],
    };
    await press(page, 'Enter');
    await until(() => evaluate(page, `Boolean(document.querySelector(
      '.fui-PopoverSurface[aria-label="Notes and more"]'
    )?.getClientRects().length)`), 'keyboard-opened Notes and more');
    keyboardPath.chooser = await tabTo(field('Choose an element'), 'Choose an element');
    await press(page, 'Enter');
    const keyboardChooser = await until(async () => {
      const value = await reviewChooserSnapshot(page);
      return value.ariaExpanded === 'true'
        && value.linkedListboxCount === 1
        && value.linkedListboxVisible
        ? value : null;
    }, 'keyboard-opened linked element choices');
    const keyboardTargetIndex = keyboardChooser.labels
      .findIndex(label => label === 'Source-aligned design');
    assert.ok(keyboardTargetIndex >= 0,
      'the visible synthetic mock title is present in the keyboard element choices');
    await pressNavigationKey(page, 'Home');
    for (let index = 0; index < keyboardTargetIndex; index += 1) {
      await pressNavigationKey(page, 'ArrowDown');
    }
    const keyboardSelection = await reviewChooserSnapshot(page);
    await press(page, 'Enter');
    keyboardPath.add = await tabTo(button('Add comment'), 'Add comment');
    await press(page, 'Enter');
    await until(() => evaluate(page, `Boolean(${button('Comments (2)')})
      && Boolean(${field('Comment (optional)')} && !${field('Comment (optional)')}.disabled)
      && document.activeElement === ${field('Comment (optional)')}`),
    'keyboard comment opens its enabled focused text field directly');
    await page.send('Input.insertText', {text:'Keyboard comment enters here directly.'});
    await until(() => evaluate(page, `${field('Comment (optional)')}.value
      === 'Keyboard comment enters here directly.'`), 'native keyboard comment text rendered');
    const keyboardTyping = await assertCommentDrawer({
      number:2,
      comment:'Keyboard comment enters here directly.',
      status:'Comment kept on annotation 2. Markup not saved yet.',
      nativeLiveRegion:true,
    });
    const keyboardWorking = await until(() => {
      const working = currentWorkingState();
      return working?.annotations?.length === 2
        && working.annotations[1].comment === 'Keyboard comment enters here directly.'
        ? working : null;
    }, 'keyboard comment autosaved');
    const keyboardSaved = await assertCommentDrawer({
      number:2,
      comment:'Keyboard comment enters here directly.',
      status:'Comment kept on annotation 2. Markup saved.',
      nativeLiveRegion:true,
    });
    const keyboardPin = await pinSnapshot();
    assert.equal(keyboardPin.frame.pinned, true);
    assert.equal(keyboardPin.markers.length, 2,
      'keyboard comment coverage cannot pass without its second visible marker');
    assert.equal(await evaluate(page, `document.activeElement === ${field('Comment (optional)')}
      && !${field('Comment (optional)')}.disabled`), true);
    wheelExperiment.variants.positioned.nativeSelection = {
      pickerOpened:keyboardChooser,
      pickerSelection:keyboardSelection,
      keyboardPath:structuredClone(keyboardPath),
      firstAnnotation:{
        tool:keyboardWorking.annotations[0].tool,
        selector:keyboardWorking.annotations[0].element?.selector ?? null,
        comment:keyboardWorking.annotations[0].comment,
      },
      secondAnnotation:{
        tool:keyboardWorking.annotations[1].tool,
        selector:keyboardWorking.annotations[1].element?.selector ?? null,
        comment:keyboardWorking.annotations[1].comment,
      },
      commentCount:keyboardWorking.annotations.length,
      source:await wheelObserver.snapshot('native-second-comment'),
    };
    const nativeSelectionSucceeded =
      keyboardWorking.annotations.length === 2
      && keyboardWorking.annotations[1].tool === 'comment'
      && keyboardWorking.annotations[1].element?.selector === '#heading'
      && keyboardWorking.annotations[1].comment
        === 'Keyboard comment enters here directly.'
      && keyboardChooser.linkedListboxCount === 1
      && keyboardChooser.linkedListboxVisible
      && keyboardSelection.ariaActiveDescendant
      && keyboardSelection.focus === 'chooser';
    wheelExperiment.discriminator = nativeSelectionSucceeded
      ? {
        status:'succeeded',
        reason:'Positioned outside-overlay delivery preserved #heading through source, bridge, linked listbox, and native keyboard comment creation; the deliberate overlay control delivered the full native wheel input and excluded the offscreen heading with source/bridge agreement.',
      }
      : {
        status:'failed-native-selection',
        reason:'The qualified positive path did not create its second native #heading comment.',
      };
    wheelExperiment.variants.positioned.stage = nativeSelectionSucceeded
      ? 'discriminator-succeeded'
      : 'native-selection-failed';
    writeEvidenceJson(output, 'short-panel-wheel-discriminator', wheelExperiment);
    assert.equal(
      wheelExperiment.discriminator.status,
      'succeeded',
      wheelExperiment.discriminator.reason,
    );
    wheelExperiment.variants.positioned.observerCleanup = await wheelObserver.close();
    wheelObserver = null;
    pinningState.keyboardComment = {
      targetIndex:keyboardTargetIndex,
      path:keyboardPath,
      pickerOpened:keyboardChooser,
      pickerSelection:keyboardSelection,
      working:keyboardWorking,
      snapshot:keyboardPin,
    };
    keyboardPath.done = await tabTo(
      `document.querySelector('[data-review-comments-done]')`,
      'Done',
    );
    await press(page, 'Enter');
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')
      && document.activeElement === (${button('Comments (2)')})`),
    'keyboard Done returns focus to Comments (2)');
    await clickAtCurrentPosition(page, button('Comments (2)'));
    await until(() => evaluate(page, `Boolean(${field('Comment (optional)')})`),
      'comments reopen after keyboard Done');
    const keyboardReopened = await assertCommentDrawer({
      number:2,
      comment:'Keyboard comment enters here directly.',
      status:'Comment kept on annotation 2. Markup saved.',
    });

    // GitHub review and Gerrit draft-comment surfaces are most vulnerable when
    // a pending confirmation survives the item it described. Exercise the
    // reachable equivalents here: selection changes, delete, undo, redo, and
    // close/reopen. Blank is the only honest state when history has no current
    // selection; selecting a restored item must recompute its own number/text.
    await click(page, `document.querySelector('[data-annotation-id][aria-label^="Annotation 1:"]')`);
    const selectedFirst = await assertCommentDrawer({
      number:1,
      comment:'Pointer comment enters here directly.',
      status:'Comment kept on annotation 1. Markup saved.',
    });
    await click(page, `document.querySelector('[data-annotation-id][aria-label^="Annotation 2:"]')`);
    const selectedSecond = await assertCommentDrawer({
      number:2,
      comment:'Keyboard comment enters here directly.',
      status:'Comment kept on annotation 2. Markup saved.',
    });
    await click(page, button('Delete annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})`),
      'selected second annotation deleted');
    const afterDelete = await assertCommentDrawer({status:''});
    assert.deepEqual(afterDelete.list, [
      'Annotation 1: comment. Pointer comment enters here directly.',
    ], 'Delete leaves only the first numbered comment and clears selected confirmation');
    await until(() => evaluate(page, `document.activeElement
      ?.getAttribute('aria-label')?.startsWith('Annotation 1:')`),
    'Delete moves focus to the surviving annotation rather than a removed editor');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await waitForPaletteUncovered();
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (2)')})`),
      'Delete undo restores the second annotation');
    await clickAtCurrentPosition(page, button('Comments (2)'));
    const afterDeleteUndo = await assertCommentDrawer({status:''});
    assert.equal(afterDeleteUndo.list.length, 2);
    await click(page, `document.querySelector('[data-annotation-id][aria-label^="Annotation 2:"]')`);
    const undoSelectedStatus = await until(async () => {
      const value = await commentDrawerSnapshot();
      return [
        'Comment kept on annotation 2. Markup not saved yet.',
        'Comment kept on annotation 2. Markup saved.',
      ].includes(value.status) ? value.status : null;
    }, 'restored annotation confirmation after Delete undo');
    const afterUndoSelection = await assertCommentDrawer({
      number:2,
      comment:'Keyboard comment enters here directly.',
      status:undoSelectedStatus,
    });
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await waitForPaletteUncovered();
    await revealFloatingTool(page, 'Redo annotation');
    await clickAtCurrentPosition(page, tool('Redo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})`),
      'Delete redo removes the restored second annotation');
    await clickAtCurrentPosition(page, button('Comments (1)'));
    const afterDeleteRedo = await assertCommentDrawer({status:''});
    assert.deepEqual(afterDeleteRedo.list, [
      'Annotation 1: comment. Pointer comment enters here directly.',
    ]);
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await waitForPaletteUncovered();
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (2)')})`),
      'second Delete undo restores the keyboard comment for the existing history regression');
    await clickAtCurrentPosition(page, button('Comments (2)'));
    const afterSecondUndo = await assertCommentDrawer({status:''});
    assert.equal(afterSecondUndo.list.length, 2);
    await click(page, `document.querySelector('[data-annotation-id][aria-label^="Annotation 2:"]')`);
    const secondUndoStatus = await until(async () => {
      const value = await commentDrawerSnapshot();
      return [
        'Comment kept on annotation 2. Markup not saved yet.',
        'Comment kept on annotation 2. Markup saved.',
      ].includes(value.status) ? value.status : null;
    }, 'second restored annotation confirmation');
    const afterSecondUndoSelection = await assertCommentDrawer({
      number:2,
      comment:'Keyboard comment enters here directly.',
      status:secondUndoStatus,
    });
    pinningState.commentConfirmation.keyboard = {
      typing:keyboardTyping,
      saved:keyboardSaved,
      reopened:keyboardReopened,
      selectionSwitch:{first:selectedFirst, second:selectedSecond},
      delete:afterDelete,
      undo:{blank:afterDeleteUndo, selected:afterUndoSelection},
      redo:afterDeleteRedo,
      restoredAgain:{blank:afterSecondUndo, selected:afterSecondUndoSelection},
      keyboardDonePath:keyboardPath.done,
    };
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await waitForPaletteUncovered();
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (2)')})
      && !${tool('Redo annotation')}.disabled`), 'undo keyboard comment text edit');
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})`),
      'undo keyboard comment creation');
    await until(() => currentWorkingState()?.annotations?.length === 1,
      'keyboard comment undo autosaved');
    expectedComments = 'Comments (1)';
    await until(() => evaluate(page, `${button('Save markup')}.matches('[aria-disabled="true"]')
      && ${describedText(button('Save markup'))}
        === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'`),
    'comment-confirmation history autosave settled');

    // A narrower outer panel must expose a real horizontal scrollport without
    // resizing the inner frame. Compare the complete durable state, require a
    // painted marker, and derive alignment from SVG coordinates and the
    // recorded untransformed viewport instead of accepting a rect-only oracle.
    const annotatedBeforeResize = structuredClone(currentWorkingState());
    const pinBeforeResize = await pinSnapshot();
    await viewport(page, 780, 'light', 400, 2);
    await until(async () => {
      const value = await pinSnapshot();
      return value.status === 'Review'
        && value.frame.clientWidth === pinBeforeResize.frame.clientWidth
        && value.frame.clientHeight === pinBeforeResize.frame.clientHeight
        && value.outer.scrollWidth > value.outer.clientWidth ? value : null;
    }, 'annotated pinned frame inside a narrower outer panel');
    const pinAfterResize = await pinSnapshot();
    const annotatedAfterResize = currentWorkingState();
    assert.deepEqual(annotatedAfterResize, annotatedBeforeResize,
      'panel resize preserves viewport, mock scroll, annotation, anchor/text/style evidence, and caret');
    assert.deepEqual(
      {
        width:pinAfterResize.frame.clientWidth,
        height:pinAfterResize.frame.clientHeight,
        offsetWidth:pinAfterResize.frame.offsetWidth,
        offsetHeight:pinAfterResize.frame.offsetHeight,
        inlineWidth:pinAfterResize.frame.inlineWidth,
        inlineHeight:pinAfterResize.frame.inlineHeight,
        viewBox:pinAfterResize.viewBox,
      },
      {
        width:pinBeforeResize.frame.clientWidth,
        height:pinBeforeResize.frame.clientHeight,
        offsetWidth:pinBeforeResize.frame.offsetWidth,
        offsetHeight:pinBeforeResize.frame.offsetHeight,
        inlineWidth:pinBeforeResize.frame.inlineWidth,
        inlineHeight:pinBeforeResize.frame.inlineHeight,
        viewBox:pinBeforeResize.viewBox,
      },
      'layout dimensions and the SVG coordinate system stay frozen',
    );
    assert.equal(pinAfterResize.markers.length, 1,
      'alignment coverage cannot pass with a hidden or absent marker');
    const annotationAfterResize = annotatedAfterResize.annotations[0];
    const markerAfterResize = pinAfterResize.markers[0];
    assert.equal(markerAfterResize.id, annotationAfterResize.id);
    assert.equal(markerAfterResize.cx,
      annotationAfterResize.x1 - annotatedAfterResize.view.viewport.scrollX);
    assert.equal(markerAfterResize.cy,
      annotationAfterResize.y1 - annotatedAfterResize.view.viewport.scrollY);
    assert.ok(annotationAfterResize.x1 >= annotationAfterResize.element.rect.x
      && annotationAfterResize.x1 <= annotationAfterResize.element.rect.x
        + annotationAfterResize.element.rect.width
      && annotationAfterResize.y1 >= annotationAfterResize.element.rect.y
      && annotationAfterResize.y1 <= annotationAfterResize.element.rect.y
        + annotationAfterResize.element.rect.height,
    'the visible marker remains inside its unchanged recorded target');
    assert.deepEqual(
      {
        outsideOuter:pinAfterResize.palette.outsideOuter,
        whollyReachable:pinAfterResize.palette.whollyReachable,
        gripAboveOuter:pinAfterResize.palette.gripAboveOuter,
      },
      {outsideOuter:true, whollyReachable:true, gripAboveOuter:true},
      'the floating palette remains outside and hit-testably above the outer scroller',
    );
    const enabledAfterResize = pinAfterResize.controls
      .filter(({disabled}) => !disabled).map(({name}) => name);
    for (const name of [
      'Move tools', 'Select (V)', 'Comment (C)', 'Box (B)', 'Circle (O)',
      'Arrow (A)', 'Line (L)', 'Highlight (H)', 'Comments (1)',
      'Notes and more', 'Send annotations',
    ]) assert.ok(enabledAfterResize.includes(name), `${name} remains usable after panel resize`);
    const disabledSave = pinAfterResize.controls.find(({name}) => name === 'Save markup');
    assert.equal(disabledSave?.disabled, true);
    assert.equal(
      disabledSave?.description,
      'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.',
    );

    await tabTo(`document.querySelector('.dude-review-engine')`, 'Review viewport');
    await pressNavigationKey(page, 'ArrowRight');
    await until(() => evaluate(page, `document.querySelector('.dude-review-engine').scrollLeft > 0`),
      'native keyboard outer pan');
    const pinAfterPan = await pinSnapshot();
    assert.deepEqual(currentWorkingState(), annotatedBeforeResize,
      'outer panning cannot change the durable inner view or annotation evidence');
    assert.deepEqual(pinAfterPan.palette.rect, pinAfterResize.palette.rect,
      'outer panning moves the frame and marker together, not the floating palette');
    assert.equal(
      (pinAfterPan.markers[0].rect.left + pinAfterPan.markers[0].rect.width / 2)
        - pinAfterPan.frame.rect.left,
      markerAfterResize.cx,
      'the panned marker remains aligned in the frozen frame coordinate system',
    );
    await pressNavigationKey(page, 'ArrowLeft');
    await until(() => evaluate(page, `document.querySelector('.dude-review-engine').scrollLeft === 0`),
      'native keyboard outer pan reset');
    pinningState.annotatedResize = {
      before:pinBeforeResize,
      resized:pinAfterResize,
      panned:pinAfterPan,
      working:annotatedBeforeResize,
    };
    await viewport(page, 1000, 'light', 300, 2);
    await until(() => evaluate(page, `document.querySelector('.dude-review-frame').clientWidth === ${shortViewport.width}
      && document.querySelector('.dude-review-frame').clientHeight === ${shortViewport.height}
      && !${tool('Box (B)')}.disabled`), 'return to the original panel size');

    // A movable palette is presentation-only. Derive every clamp bound from
    // offset layout (which transforms cannot change), then drive only trusted
    // CDP pointer and key input through the grip.
    const annotationBeforeMove = structuredClone(currentWorkingState().annotations[0]);
    const movableBaseline = await paletteState();
    assert.equal(movableBaseline.toolScroller.height >= 36, true,
      'the 1000x300 tool scroller still exposes a complete 36px tool');
    assert.deepEqual(movableBaseline.offset, {x:0, y:0});
    assert.equal(movableBaseline.layout.minX <= 0 && movableBaseline.layout.maxX >= 0, true);
    assert.equal(movableBaseline.layout.minY <= 0 && movableBaseline.layout.maxY >= 0, true);
    const assertLayoutPlacement = (value, label) => {
      const expectedLeft = value.stage.left + value.layout.stageClientLeft
        + value.layout.left + value.offset.x;
      const expectedTop = value.stage.top + value.layout.stageClientTop
        + value.layout.top + value.offset.y;
      assert.ok(Math.abs(value.palette.left - expectedLeft) <= 1,
        `${label}: transformed left must equal immutable layout left plus exposed offset`);
      assert.ok(Math.abs(value.palette.top - expectedTop) <= 1,
        `${label}: transformed top must equal immutable layout top plus exposed offset`);
      assert.ok(value.offset.x >= value.layout.minX && value.offset.x <= value.layout.maxX,
        `${label}: horizontal offset is outside layout-derived clamp bounds`);
      assert.ok(value.offset.y >= value.layout.minY && value.offset.y <= value.layout.maxY,
        `${label}: vertical offset is outside layout-derived clamp bounds`);
    };
    assertLayoutPlacement(movableBaseline, 'movable home');
    const formerlyCovered = {
      from: {
        x: movableBaseline.palette.left + 8,
        y: movableBaseline.palette.top + 44,
      },
      to: {
        x: movableBaseline.palette.left + 44,
        y: movableBaseline.palette.top + 84,
      },
    };
    const homeHit = await evaluate(page, `(() => {
      const point = ${JSON.stringify(formerlyCovered.from)};
      const hit = document.elementFromPoint(point.x, point.y);
      const palette = document.querySelector('[data-review-tools]');
      return Boolean(hit && (hit === palette || palette.contains(hit)));
    })()`);
    assert.equal(homeHit, true, 'the target used by the regression is genuinely covered at home');
    await evaluate(page, `(() => {
      window.floatingFrameSizes = [];
      window.floatingFrameObserver = new ResizeObserver(entries => {
        for (const {target} of entries) {
          window.floatingFrameSizes.push({width:target.clientWidth,height:target.clientHeight});
        }
      });
      window.floatingFrameObserver.observe(document.querySelector('.dude-review-frame'));
    })()`);
    await settlePalette();
    await evaluate(page, 'window.floatingFrameSizes = []');

    // A click or tap is the pointer-only alternative to dragging. Calibrate
    // the open popup itself, then use its five named choices with native input.
    const menuContract = await openToolsMenu();
    const menuTree = await page.send('Accessibility.getFullAXTree');
    const exposedMenuNodes = menuTree.nodes
      .filter(node => !node.ignored && ['menu', 'menuitem'].includes(node.role?.value))
      .map(node => ({role:node.role.value, name:node.name?.value || ''}));
    assert.deepEqual(
      exposedMenuNodes.filter(node => node.role === 'menu'),
      [{role:'menu', name:'Move tools'}],
      'the native Fluent menu takes the accessible name Move tools from its trigger',
    );
    assert.deepEqual(
      exposedMenuNodes.filter(node => node.role === 'menuitem').map(node => node.name),
      ['Top left', 'Top right', 'Bottom left', 'Bottom right', 'Reset to default spot'],
      'the pointer alternative exposes exactly four corners and an explicit reset',
    );
    assert.deepEqual(
      menuContract.opened.menu.items.map(item => item.name),
      ['Top left', 'Top right', 'Bottom left', 'Bottom right', 'Reset to default spot'],
    );
    const parseRgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = value => parseRgb(value).map(channel => channel / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const contrast = item => {
      const foreground = luminance(item.foreground);
      const background = luminance(item.background);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    };
    for (const item of menuContract.opened.menu.items) {
      assert.ok(item.rect.width >= 24 && item.rect.height >= 24 && item.hits.every(Boolean),
        `${item.name}: menu target must be at least 24px square and wholly hit-testable`);
      assert.ok(contrast(item) >= 4.5, `${item.name}: menu text contrast must be at least 4.5:1`);
    }
    movementState.menu = {initial:menuContract};
    assert.ok(menuContract.opened.grip.width >= 24 && menuContract.opened.grip.height >= 24
      && menuContract.opened.grip.hit.every(Boolean),
    `Move tools grip remains at least 24px square and wholly hit-testable while its popup is open: ${
      JSON.stringify(menuContract.opened.grip)}`);

    // Menu keys stop at the portal rather than reaching the Review section's
    // drawing shortcuts. Delete is intentionally not covered by the engine's
    // later menuitem-origin filter: if it leaks, it deletes the selected box.
    const liveBeforeMenuKey = await liveAnnotationState();
    assert.equal(liveBeforeMenuKey.annotationCount, 1,
      'the menu-key isolation probe needs one retained live annotation');
    assert.equal(liveBeforeMenuKey.annotationIds.length, 1,
      'the retained annotation must be painted before the menu-key probe');
    await evaluate(page, `(() => {
      window.t012MenuKeyEvents = [];
      document.addEventListener('keydown', event => {
        if (event.target?.closest?.('[data-review-tools-menu]')) {
          window.t012MenuKeyEvents.push({
            key:event.key,
            code:event.code,
            trusted:event.isTrusted,
            target:event.target.getAttribute('role'),
          });
        }
      }, true);
    })()`);
    // Edge 133's optional nativeVirtualKeyCode path can hide even an owned
    // headless blank page. The portable raw CDP fields still create a trusted
    // DOM key event and avoid that native-window driver path.
    await page.send('Input.dispatchKeyEvent', {
      type:'rawKeyDown',
      key:'Delete',
      code:'Delete',
      windowsVirtualKeyCode:46,
    });
    await page.send('Input.dispatchKeyEvent', {
      type:'keyUp',
      key:'Delete',
      code:'Delete',
      windowsVirtualKeyCode:46,
    });
    await until(() => evaluate(page, 'window.t012MenuKeyEvents.length === 1'),
      'one trusted Delete event at the menu item');
    const menuKeyCompletion = await evaluate(page, `new Promise(resolve => {
      queueMicrotask(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
        keyEvents:window.t012MenuKeyEvents.length,
        menuOpen:Boolean(${menu}?.getClientRects().length),
        activeRole:document.activeElement?.getAttribute('role') || null,
      }))));
    })`);
    const liveAfterMenuKey = await liveAnnotationState();
    assert.deepEqual(liveAfterMenuKey, liveBeforeMenuKey,
      'a native menu Delete must not change the live Review annotation or history state');
    const menuKeyEvents = await evaluate(page, 'window.t012MenuKeyEvents');
    assert.deepEqual(menuKeyEvents, [{key:'Delete', code:'Delete', trusted:true, target:'menuitem'}],
      'the shortcut probe must actually reach a menu item as one trusted key event');
    assert.deepEqual(menuKeyCompletion, {
      keyEvents:1,
      menuOpen:true,
      activeRole:'menuitem',
    }, 'the live-state assertion runs after the trusted key event and two rendered frames');
    await press(page, 'Escape');
    await waitForNoMenu();

    // The stage-only dismissal target must consume an outside pointer action.
    // Comment is selected because any fall-through to the overlay would create
    // an annotation, making this guard capable of failing.
    await revealFloatingTool(page, 'Comment (C)');
    await clickAtCurrentPosition(page, tool('Comment (C)'));
    await until(() => currentWorkingState()?.tool === 'comment', 'Comment tool before menu dismissal');
    const stateBeforeDismiss = structuredClone(currentWorkingState());
    await openToolsMenu();
    await evaluate(page, `(() => {
      window.t012MenuDismissEvents = [];
      for (const type of ['pointerdown', 'pointerup', 'click']) {
        document.addEventListener(type, event => {
          const target = event.target;
          window.t012MenuDismissEvents.push({
            type,
            trusted:event.isTrusted,
            target:target?.hasAttribute?.('data-review-tools-dismiss') ? 'dismiss'
              : target?.closest?.('.dude-review-overlay') ? 'overlay'
                : target?.tagName || null,
          });
        }, {capture:true, once:true});
      }
    })()`);
    const dismissPoint = await evaluate(page, `(() => {
      const stage = document.querySelector('[data-review-tools]').parentElement.getBoundingClientRect();
      for (const [x, y] of [
        [stage.left + stage.width * .5, stage.top + stage.height * .5],
        [stage.left + stage.width * .75, stage.top + stage.height * .75],
        [stage.left + stage.width * .35, stage.top + stage.height * .75],
      ]) {
        if (document.elementFromPoint(x, y)?.hasAttribute('data-review-tools-dismiss')) return {x, y};
      }
      return null;
    })()`);
    assert.ok(dismissPoint, 'a real point on the stage dismissal layer must be hit-testable');
    await page.send('Input.dispatchMouseEvent', {
      type:'mousePressed', ...dismissPoint, button:'left', buttons:1, clickCount:1,
    });
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseReleased', ...dismissPoint, button:'left', buttons:0, clickCount:1,
    });
    await waitForNoMenu();
    const dismissEvents = await evaluate(page, 'window.t012MenuDismissEvents');
    assert.deepEqual(
      dismissEvents.map(({type, trusted, target}) => ({type, trusted, target})),
      [
        {type:'pointerdown', trusted:true, target:'dismiss'},
        {type:'pointerup', trusted:true, target:'dismiss'},
        {type:'click', trusted:true, target:'dismiss'},
      ],
      'outside dismissal must end on its own layer without reaching the annotation overlay',
    );
    assert.deepEqual(currentWorkingState(), stateBeforeDismiss,
      'outside-menu dismissal must not start or alter an annotation');

    await revealFloatingTool(page, 'Box (B)');
    await clickAtCurrentPosition(page, tool('Box (B)'));
    await until(() => currentWorkingState()?.tool === 'box', 'Box tool restored after dismissal proof');
    const cornerResults = [];
    for (const [label, expectedX, expectedY] of [
      ['Top left', 'minX', 'minY'],
      ['Top right', 'maxX', 'minY'],
      ['Bottom left', 'minX', 'maxY'],
      ['Bottom right', 'maxX', 'maxY'],
    ]) {
      const result = await chooseToolsPosition(label);
      const landed = result.landed;
      assert.deepEqual(landed.offset, {
        x:landed.layout[expectedX],
        y:landed.layout[expectedY],
      }, `${label}: native menu selection must use the exact measured clamp limits`);
      assertLayoutPlacement(landed, `${label} pointer placement`);
      assert.deepEqual(landed.frame, movableBaseline.frame);
      assert.deepEqual(landed.iframe, movableBaseline.iframe);
      assert.deepEqual(currentWorkingState().annotations, [annotationBeforeMove]);
      assert.match(landed.moveStatus,
        new RegExp(`\\b${label.startsWith('Top') ? 'top' : 'bottom'}\\b`));
      assert.match(landed.moveStatus,
        new RegExp(`\\b${label.endsWith('left') ? 'left' : 'right'}\\b`));
      cornerResults.push({label, opened:result.opened.opened, landed});
    }
    const explicitReset = await chooseToolsPosition('Reset to default spot');
    assert.deepEqual(explicitReset.landed.offset, {x:0, y:0});
    assert.equal(explicitReset.landed.moveStatus, 'Tools at the default spot.');
    assertLayoutPlacement(explicitReset.landed, 'explicit pointer reset');

    const chosenPointerPosition = await chooseToolsPosition('Top right');
    const pointerMoved = chosenPointerPosition.landed;
    assertLayoutPlacement(pointerMoved, 'pointer-moved palette');
    assert.notDeepEqual(pointerMoved.offset, movableBaseline.offset,
      'a native click-only menu choice must move the palette');
    assert.deepEqual(pointerMoved.frame, movableBaseline.frame,
      'moving the palette must not resize or move the admitted frame');
    assert.deepEqual(pointerMoved.iframe, movableBaseline.iframe,
      'moving the palette must not resize or move the source iframe');
    assert.equal(pointerMoved.reviewStatus, 'Review');
    assert.equal(pointerMoved.comments, 'Comments (1)');
    assert.deepEqual(currentWorkingState().annotations, [annotationBeforeMove],
      'click-only pointer movement must neither create nor alter an annotation');
    movementState.pointer = {
      baseline: movableBaseline,
      moved: pointerMoved,
      annotationsAfterPointerChoice: currentWorkingState().annotations.length,
    };
    movementState.menu = {
      nativeAccessibility:exposedMenuNodes,
      initial:menuContract,
      keyEvents:menuKeyEvents,
      keyCompletion:menuKeyCompletion,
      keyLiveState:{before:liveBeforeMenuKey, after:liveAfterMenuKey},
      dismissal:{point:dismissPoint, events:dismissEvents},
      corners:cornerResults,
      explicitReset,
      chosenPointerPosition,
    };

    // The parked position survives ordinary Review disclosure navigation.
    await clickAtCurrentPosition(page, button('Source'));
    await press(page, 'Escape');
    await until(() => evaluate(page, `document.activeElement === (${button('Source')})`),
      'Source closes back to its native trigger after a palette move');
    const stayed = await paletteState();
    assert.deepEqual(stayed.offset, pointerMoved.offset);
    assert.deepEqual(stayed.palette, pointerMoved.palette);
    assert.deepEqual(stayed.frame, movableBaseline.frame);

    // The exact mock area hidden at home is drawable immediately after the
    // click-only move. Undo only this second box so the pre-existing history
    // path below continues from its original one-annotation state.
    const vacatedHit = await evaluate(page, `(() => {
      const point = ${JSON.stringify(formerlyCovered.from)};
      const hit = document.elementFromPoint(point.x, point.y);
      const overlay = document.querySelector('.dude-review-overlay');
      return Boolean(hit && (hit === overlay || overlay.contains(hit)));
    })()`);
    assert.equal(vacatedHit, true, 'moving the palette exposes its former mock target');
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseMoved',
      ...formerlyCovered.from,
    });
    await page.send('Input.dispatchMouseEvent', {
      type:'mousePressed',
      ...formerlyCovered.from,
      button:'left',
      buttons:1,
      clickCount:1,
    });
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseMoved',
      ...formerlyCovered.to,
      button:'left',
      buttons:1,
    });
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseReleased',
      ...formerlyCovered.to,
      button:'left',
      buttons:0,
      clickCount:1,
    });
    await until(() => evaluate(page, `Boolean(${button('Comments (2)')})`),
      'drawing still works immediately after a click-only palette move');
    await until(() => currentWorkingState()?.annotations?.length === 2,
      'post-move annotation autosaved');
    assert.deepEqual(currentWorkingState().annotations[0], annotationBeforeMove,
      'the existing annotation survives drawing after a palette move');
    movementState.pointer.formerlyCovered = {
      ...formerlyCovered,
      annotationsAfterDrawing: currentWorkingState().annotations.length,
    };
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})`),
      'remove only the post-move regression box');
    await until(() => currentWorkingState()?.annotations?.length === 1,
      'post-move regression box undo autosaved');
    assert.deepEqual(currentWorkingState().annotations, [annotationBeforeMove]);

    // Direct manipulation remains a separate grip-only path. Moving far
    // enough to cross the drag threshold must suppress its trailing click,
    // retain the annotation, and leave the new position menu closed.
    const beforeDrag = await paletteState();
    await dragPalette(-Math.round(movableBaseline.layout.stageClientWidth * .25), 20);
    const afterDrag = await paletteState();
    assert.notDeepEqual(afterDrag.offset, beforeDrag.offset, 'native grip drag still moves the palette');
    assert.equal(afterDrag.menu, null, 'the trailing drag click must not open the position menu');
    assert.notEqual(afterDrag.gripExpanded, 'true');
    assertLayoutPlacement(afterDrag, 'native grip drag');
    assert.deepEqual(afterDrag.frame, movableBaseline.frame);
    assert.deepEqual(afterDrag.iframe, movableBaseline.iframe);
    assert.deepEqual(currentWorkingState().annotations, [annotationBeforeMove],
      'grip dragging must not alter the retained annotation');
    movementState.drag = {before:beforeDrag, after:afterDrag};

    // Reach the grip through native Tab order, then verify both key steps and
    // the palette-specific live region without confusing it with the workflow
    // status region that shares role=status.
    await clickAtCurrentPosition(page, button('Source'));
    await press(page, 'Escape');
    const gripTabPath = await tabToGrip();
    const keyboardBefore = await paletteState();
    assert.equal(keyboardBefore.grip.hit.every(Boolean), true);
    await pressNavigationKey(page, 'ArrowLeft');
    await settlePalette();
    const oneStep = await paletteState();
    assert.equal(oneStep.offset.x, Math.max(
      keyboardBefore.layout.minX,
      keyboardBefore.offset.x - 16,
    ));
    assert.equal(oneStep.offset.y, keyboardBefore.offset.y);
    await pressNavigationKey(page, 'ArrowLeft', 'ArrowLeft', 8);
    await settlePalette();
    const longStep = await paletteState();
    assert.equal(longStep.offset.x, Math.max(oneStep.layout.minX, oneStep.offset.x - 48));
    assert.equal(longStep.offset.y, oneStep.offset.y);
    assert.match(longStep.moveStatus, /^Tools .*from the default spot\./);
    assert.deepEqual(longStep.workflowStatuses, movableBaseline.workflowStatuses,
      'keyboard movement must not overwrite the workflow status region');
    const politeStatusRegions = axLiveRegions(await page.send('Accessibility.getFullAXTree'))
      .filter(region => region.role === 'status' && region.live === 'polite');
    const matchingMoveRegions = politeStatusRegions
      .filter(region => region.role === 'status'
        && region.live === 'polite'
        && region.text === longStep.moveStatus);
    assert.equal(matchingMoveRegions.length, 1,
      `the keyboard landing position reaches exactly one native polite status region: ${
        JSON.stringify(politeStatusRegions)}`);
    assert.deepEqual(longStep.frame, movableBaseline.frame);
    assert.equal(longStep.reviewStatus, 'Review');
    assert.equal(longStep.comments, 'Comments (1)');
    movementState.keyboard = {
      tabPath: gripTabPath,
      before: keyboardBefore,
      oneStep,
      longStep,
      matchingMoveRegions,
    };

    // Exercise all four bounds independently. Expected offsets come from
    // offsetLeft/Top/Width/Height and stage client dimensions, never from an
    // already transformed bounding rectangle (the historical drift trap).
    for (const [key, axis, bound, edge] of [
      ['ArrowLeft', 'x', 'minX', 'left'],
      ['ArrowUp', 'y', 'minY', 'top'],
      ['ArrowRight', 'x', 'maxX', 'right'],
      ['ArrowDown', 'y', 'maxY', 'bottom'],
    ]) {
      await pressNavigationKey(page, 'Home');
      for (let step = 0; step < 24; step += 1) {
        await pressNavigationKey(page, key, key, 8);
      }
      await settlePalette();
      const clamped = await paletteState();
      assert.deepEqual(clamped.layout, movableBaseline.layout,
        `${edge}: transforms must not change the layout inputs used for clamping`);
      assert.equal(clamped.offset[axis], clamped.layout[bound],
        `${edge}: exposed offset must land on the layout-derived bound`);
      assert.equal(clamped.grip.hit.every(Boolean), true,
        `${edge}: the clamped Move tools grip remains wholly hit-testable`);
      assert.match(clamped.moveStatus, new RegExp(`\\b${edge} edge\\b`));
      assertLayoutPlacement(clamped, `${edge}-clamped palette`);
      movementState.edges.push({key, axis, bound, edge, state:clamped});
    }
    await pressNavigationKey(page, 'Home');
    await settlePalette();
    const returnedHome = await paletteState();
    assert.deepEqual(returnedHome.offset, {x:0, y:0});
    assert.deepEqual(returnedHome.palette, movableBaseline.palette,
      'Home must recover the exact default palette spot');

    // Each orientation starts from its own home corner rather than carrying a
    // stale transform from the prior placement.
    await dragPalette(180, 0);
    const verticalOffset = (await paletteState()).offset;
    assert.notDeepEqual(verticalOffset, {x:0, y:0});
    await clickAtCurrentPosition(page, toggle);
    await until(() => evaluate(page, `${toggle}.getAttribute('aria-label') === 'Switch tools to vertical'`),
      'movable palette horizontal placement');
    const horizontalHome = await paletteState();
    assert.deepEqual(horizontalHome.offset, {x:0, y:0});
    await dragPalette(-120, -20);
    const horizontalOffset = (await paletteState()).offset;
    assert.notDeepEqual(horizontalOffset, {x:0, y:0});
    await clickAtCurrentPosition(page, toggle);
    await until(() => evaluate(page, `${toggle}.getAttribute('aria-label') === 'Switch tools to horizontal'`),
      'movable palette vertical placement');
    const verticalHome = await paletteState();
    assert.deepEqual(verticalHome.offset, {x:0, y:0});
    assert.deepEqual(verticalHome.frame, movableBaseline.frame);
    movementState.orientationReset = {
      verticalOffset,
      horizontalHome,
      horizontalOffset,
      verticalHome,
    };
    movementState.frameResizeObservations = await evaluate(page, 'window.floatingFrameSizes');
    assert.deepEqual(movementState.frameResizeObservations, [],
      'palette transforms must not trigger even an intermediate frame resize');
    await checkpoint('movable-returned-vertical');

    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})
      && !${tool('Redo annotation')}.disabled`), 'native Undo of pointer comment text');
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, tool('Undo annotation'));
    await until(() => evaluate(page, `Boolean(${button('Comments (0)')})`), 'native Undo');
    expectedComments = 'Comments (0)';
    const emptyWorking = await until(() => {
      const working = currentWorkingState();
      return working?.annotations?.length === 0 ? working : null;
    }, 'undo-to-empty autosaved');
    const emptyAtOriginalPanel = await pinSnapshot();
    assert.equal(emptyAtOriginalPanel.frame.pinned, true,
      'undo-to-empty must not release the validated frame lock');
    assert.deepEqual(
      {
        width:emptyAtOriginalPanel.frame.clientWidth,
        height:emptyAtOriginalPanel.frame.clientHeight,
        inlineWidth:emptyAtOriginalPanel.frame.inlineWidth,
        inlineHeight:emptyAtOriginalPanel.frame.inlineHeight,
      },
      {
        width:pointerPin.frame.clientWidth,
        height:pointerPin.frame.clientHeight,
        inlineWidth:pointerPin.frame.inlineWidth,
        inlineHeight:pointerPin.frame.inlineHeight,
      },
    );
    await viewport(page, 780, 'light', 400, 2);
    await until(async () => {
      const value = await pinSnapshot();
      return value.status === 'Review' && value.outer.scrollWidth > value.outer.clientWidth
        ? value : null;
    }, 'empty pinned frame remains wider than its outer panel');
    const emptyAtNarrowPanel = await pinSnapshot();
    assert.deepEqual(currentWorkingState(), emptyWorking,
      'an empty undo history cannot adopt the resized panel geometry');
    assert.equal(emptyAtNarrowPanel.frame.pinned, true);
    assert.equal(emptyAtNarrowPanel.frame.clientWidth, pointerPin.frame.clientWidth);
    assert.equal(emptyAtNarrowPanel.frame.clientHeight, pointerPin.frame.clientHeight);
    assert.deepEqual(
      {
        outsideOuter:emptyAtNarrowPanel.palette.outsideOuter,
        whollyReachable:emptyAtNarrowPanel.palette.whollyReachable,
        gripAboveOuter:emptyAtNarrowPanel.palette.gripAboveOuter,
      },
      {outsideOuter:true, whollyReachable:true, gripAboveOuter:true},
    );
    const retainedEmptyOffset = emptyAtNarrowPanel.palette.offset;
    await clickAtCurrentPosition(page, `document.querySelector('[data-review-return]')`);
    await until(() => evaluate(page, `Boolean(${button('Review design')})`),
      'return destination after empty Review');
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(${button('Comments (0)')})
      && !${tool('Box (B)')}.disabled`), 'unchanged empty Review reactivation');
    const emptyReturned = await pinSnapshot();
    assert.equal(emptyReturned.sameIframe, true,
      'leave and return retains the exact pinned iframe');
    assert.equal(emptyReturned.frame.pinned, true);
    assert.equal(emptyReturned.frame.clientWidth, pointerPin.frame.clientWidth);
    assert.equal(emptyReturned.frame.clientHeight, pointerPin.frame.clientHeight);
    assert.equal(emptyReturned.palette.offset, retainedEmptyOffset,
      'leave and return retains the reachable palette placement');
    assert.deepEqual(currentWorkingState(), emptyWorking,
      'leave and return preserves the empty history at its recorded view');
    pinningState.emptyReturn = {
      original:emptyAtOriginalPanel,
      resized:emptyAtNarrowPanel,
      returned:emptyReturned,
      working:emptyWorking,
    };
    await viewport(page, 1000, 'light', 300, 2);
    await until(() => evaluate(page, `document.querySelector('.dude-review-frame').clientWidth === ${pointerPin.frame.clientWidth}
      && document.querySelector('.dude-review-frame').clientHeight === ${pointerPin.frame.clientHeight}
      && !${tool('Select (V)')}.disabled`), 'original panel restored after empty return');
    pinningState.emptyReturn.restored = await pinSnapshot();
    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    for (const label of [...tools.slice(0, 7), 'Redo annotation']) {
      const focused = await recordTarget(`vertical-key-${label}`, 'document.activeElement');
      assert.equal(focused.name, label, 'vertical ArrowDown follows Fluent enabled tool order');
      assert.equal(focused.focused, true);
      await recordTarget(`vertical-key-pin-${label}`, toggle);
      await checkpoint(`vertical-key-${label}`);
      if (label !== 'Redo annotation') await press(page, 'ArrowDown');
    }
    await saveRegressionProof(page, output, 'vertical-keyboard-scroll', {targets});
    await press(page, 'Enter');
    await until(() => evaluate(page, `Boolean(${button('Comments (1)')})`), 'native keyboard Redo');
    await clickAtCurrentPosition(page, button('Comments (1)'));
    await until(() => evaluate(page, `Boolean(document.querySelector('[aria-label="Close comments"]'))`),
      'comments drawer after native Redo');
    if (!await evaluate(page, `Boolean(${field('Comment (optional)')})`)) {
      await clickAtCurrentPosition(page, `document.querySelector('[aria-label^="Annotation 1:"]')`);
    }
    await until(() => evaluate(page, `Boolean(${field('Comment (optional)')} && !${field('Comment (optional)')}.disabled)`),
      'editable restored comment after list selection');
    await click(page, field('Comment (optional)'));
    await until(() => evaluate(page, `${field('Comment (optional)')} && !${field('Comment (optional)')}.disabled
      && document.activeElement === ${field('Comment (optional)')}`), 'native Redo opens its editable comment');
    await page.send('Input.insertText', {text:'Restored after empty return.'});
    await until(() => evaluate(page, `${field('Comment (optional)')}.value.includes(
      'Restored after empty return.'
    )`), 'native edit clears the superseded Redo branch');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await waitForPaletteUncovered();
    expectedComments = 'Comments (1)';
    const tabPath = [];
    for (let step = 0; step < 30; step++) {
      if (await evaluate(page, `document.activeElement === (${toggle})`)) break;
      await press(page, 'Tab');
      tabPath.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim()`));
    }
    keyboardReachability.verticalTabPath = tabPath;
    keyboardReachability.verticalToggle = await recordTarget('keyboard-toggle-vertical', toggle);
    keyboardReachability.verticalReached = await evaluate(page, `document.activeElement === (${toggle})`);
    await saveRegressionProof(page, output, 'keyboard-toggle-vertical', {keyboardReachability});
    assert.equal(keyboardReachability.verticalReached, true,
      `Tab reaches the pinned switch after Redo disables itself: ${JSON.stringify(tabPath)}`);
    await press(page, 'Enter');
    await checkpoint('annotated-horizontal');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    await press(page, 'ArrowRight');
    assert.equal((await recordTarget('horizontal-key-comment', 'document.activeElement')).name, 'Comment (C)');
    const horizontalTabPath = [];
    for (let step = 0; step < 4; step++) {
      if (await evaluate(page, `document.activeElement === (${toggle})`)) break;
      await press(page, 'Tab');
      horizontalTabPath.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim()`));
    }
    keyboardReachability.horizontalTabPath = horizontalTabPath;
    keyboardReachability.horizontalToggle = await recordTarget('keyboard-toggle-horizontal', toggle);
    keyboardReachability.horizontalReached = await evaluate(page, `document.activeElement === (${toggle})`);
    assert.equal(keyboardReachability.horizontalReached, true,
      `Tab reaches the pinned horizontal switch from the toolbar: ${JSON.stringify(horizontalTabPath)}`);

    // Save, Comments, and Send remain separate reachable workflow controls.
    await until(() => evaluate(page, `${button('Save markup')}.matches('[aria-disabled="true"]')
      && ${describedText(button('Save markup'))}
        === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'`),
    'comment history autosave settled before workflow-state assertions');
    for (const name of ['Save markup','Comments (1)','Send annotations']) {
      const target = await recordTarget(`workflow-${name}`, button(name));
      const inPalette = await evaluate(page, `Boolean((${button(name)}).closest('[data-review-tools]'))`);
      workflowState[name] = {...target, inPalette};
      assert.equal(inPalette, false);
    }
    await clickAtCurrentPosition(page, button('Comments (1)'));
    await until(() => evaluate(page, `Boolean(document.querySelector('[aria-label="Close comments"]'))`),
      'native Comments drawer action');
    await checkpoint('comments-open');
    if (!await evaluate(page, `Boolean(${field('Comment (optional)')})`)) {
      await clickAtCurrentPosition(
        page,
        `document.querySelector('[aria-label^="Annotation 1:"]')`,
      );
    }
    await until(() => evaluate(page, `Boolean(${field('Comment (optional)')})`),
      'selected annotation editor after native Comments action');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`), 'drawer exit');
    await until(() => evaluate(page, `${button('Save markup')}.matches('[aria-disabled="true"]')
      && ${describedText(button('Save markup'))}
        === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'`),
    'comment-caret autosave settled after drawer exit');
    await clickAtCurrentPosition(page, button('Notes and more'));
    await until(async () => {
      if (await evaluate(page, `document.activeElement === (${field('Overall review notes')})`)) return true;
      await press(page, 'Tab'); return false;
    }, 'native keyboard notes focus');
    workflowState.disclosedReasons = await evaluate(page, `document.querySelector(
      '.fui-PopoverSurface[aria-label="Notes and more"]'
    )?.innerText || ''`);
    if (workflowState['Save markup'].disabled) {
      assert.match(workflowState.disclosedReasons, /Working markup matches the saved revision\./);
    }
    if (workflowState['Send annotations'].disabled) {
      assert.match(workflowState.disclosedReasons, /Image capture unavailable|Add at least one annotation/);
    }
    await page.send('Input.insertText', {text:'Short-panel saved notes.'});
    await clickAtCurrentPosition(page, button('Save markup'));
    await checkpoint('saved-notes');

    // Palette placement remains ephemeral React state: moving it produces no
    // working-markup write and no browser-storage write. The fresh workspace
    // home position and orientation-reset assertions above cover how a new
    // placement begins without imposing a reset while this workspace is still
    // intentionally mounted.
    await until(() => currentWorkingState()?.notes === 'Short-panel saved notes.',
      'short-panel notes save completion');
    const workingFile = currentWorkingFile();
    assert.ok(workingFile);
    const workingBeforePaletteMove = fs.readFileSync(workingFile);
    const browserStorageBeforePaletteMove = await evaluate(page, `({
      local:Object.fromEntries([...Array(localStorage.length)].map((_, index) => {
        const key = localStorage.key(index); return [key, localStorage.getItem(key)];
      })),
      session:Object.fromEntries([...Array(sessionStorage.length)].map((_, index) => {
        const key = sessionStorage.key(index); return [key, sessionStorage.getItem(key)];
      })),
    })`);
    await dragPalette(-120, -20);
    const ephemeralMove = await paletteState();
    assert.notDeepEqual(ephemeralMove.offset, {x:0, y:0});
    const workingAfterPaletteMove = fs.readFileSync(workingFile);
    const browserStorageAfterPaletteMove = await evaluate(page, `({
      local:Object.fromEntries([...Array(localStorage.length)].map((_, index) => {
        const key = localStorage.key(index); return [key, localStorage.getItem(key)];
      })),
      session:Object.fromEntries([...Array(sessionStorage.length)].map((_, index) => {
        const key = sessionStorage.key(index); return [key, sessionStorage.getItem(key)];
      })),
    })`);
    assert.equal(workingAfterPaletteMove.equals(workingBeforePaletteMove), true,
      'moving the palette must not persist any working-markup bytes');
    assert.deepEqual(browserStorageAfterPaletteMove, browserStorageBeforePaletteMove,
      'moving the palette must not persist any browser-storage bytes');
    movementState.persistence = {
      moved:ephemeralMove,
      workingFile:path.relative(root, workingFile),
      workingSha256Before:sha256(workingBeforePaletteMove),
      workingSha256After:sha256(workingAfterPaletteMove),
      workingBytes:workingAfterPaletteMove.length,
      browserStorageBefore:browserStorageBeforePaletteMove,
      browserStorageAfter:browserStorageAfterPaletteMove,
    };

    // Assert: every revealed target fits its scroller, palette, and panel.
    // Hidden tool rectangles are never accepted as evidence of reachability.
    const findings = [];
    for (const target of targets) {
      if (!target.inViewport || !target.inPanel || !target.inPalette || !target.inScroller
        || !target.hits.every(Boolean) || target.box.width < 24 || target.box.height < 24) {
        findings.push({issue:'revealed target is not wholly painted and hittable', target});
      }
      if (target.name.startsWith('Switch tools to ') && target.title !== target.name) {
        findings.push({issue:'orientation switch aria-label and title differ', target});
      }
    }
    for (const snapshot of snapshots) {
      if (!snapshot.palette?.insideVisiblePanel) {
        findings.push({
          checkpoint: snapshot.checkpoint,
          issue: 'floating palette left the visible Review panel',
          panel: snapshot.panel,
          palette: snapshot.palette,
          workspace: snapshot.workspace,
        });
      }
      if (snapshot.frameVisibleHeight !== snapshot.frame.height || snapshot.workspace.scrollTop !== 0
        || snapshot.iframeSame === false) {
        findings.push({
          checkpoint: snapshot.checkpoint,
          issue: 'ordinary toolbar navigation moved, clipped, or replaced the mock',
          frame: snapshot.frame,
          panel: snapshot.panel,
          workspace: snapshot.workspace,
        });
      }
      if (snapshot.status !== 'Review' || snapshot.comments !== snapshot.expectedComments) {
        findings.push({
          checkpoint: snapshot.checkpoint,
          issue: 'presentation-only toolbar navigation changed or staled Review state',
          status: snapshot.status,
          comments: snapshot.comments,
          expectedComments: snapshot.expectedComments,
        });
      }
    }
    const byCheckpoint = Object.fromEntries(snapshots.map(snapshot => [snapshot.checkpoint, snapshot]));
    const expectedEnabled = [
      'Move tools', 'Select (V)', 'Comment (C)', 'Box (B)', 'Circle (O)',
      'Arrow (A)', 'Line (L)', 'Highlight (H)', 'Switch tools to horizontal',
    ];
    if (JSON.stringify(byCheckpoint['ready-vertical'].controls.map(({ name }) => name))
      !== JSON.stringify(expectedEnabled)) {
      findings.push({
        checkpoint: 'ready-vertical',
        issue: 'enabled vertical toolbar contract changed',
        actual: byCheckpoint['ready-vertical'].controls.map(({ name }) => name),
        expected: expectedEnabled,
      });
    }
    for (const [checkpoint, expectedOrientation] of [
      ['ready-vertical', 'vertical'],
      ['pointer-horizontal', null],
      ['pointer-return-vertical', 'vertical'],
      ['keyboard-horizontal', null],
      ['keyboard-vertical', 'vertical'],
    ]) {
      if (byCheckpoint[checkpoint].toolbar?.orientation !== expectedOrientation) {
        findings.push({
          checkpoint,
          issue: 'toolbar aria-orientation does not match its rendered direction',
          actual: byCheckpoint[checkpoint].toolbar?.orientation,
          expected: expectedOrientation,
        });
      }
    }
    const normalPanelSnapshots = snapshots.filter(({viewport}) => (
      viewport.width === shortPanelFixture.viewport.width
      && viewport.height === shortPanelFixture.viewport.height
      && viewport.dpr === shortPanelFixture.viewport.dpr
    ));
    const frameFields = ['x', 'y', 'top', 'right', 'bottom', 'left', 'width', 'height'];
    const expectedRawFrame = shortViewport.rawFrame;
    const expectedNormalizationDelta = shortPanelFixture.frame.clientHeight
      - shortPanelFixture.frame.rawHeight;
    const normalizationDelta = shortViewport.height - expectedRawFrame.height;
    const expectedPinnedFrame = {
      ...expectedRawFrame,
      bottom:expectedRawFrame.bottom + normalizationDelta,
      height:shortViewport.height,
    };
    const firstPinnedIndex = normalPanelSnapshots.findIndex(({framePinned}) => framePinned);
    const pinSequence = normalPanelSnapshots.map(({checkpoint, framePinned}) => ({
      checkpoint,
      framePinned,
    }));
    const expectedFrame = snapshot => (
      snapshot.framePinned ? expectedPinnedFrame : expectedRawFrame
    );
    const frameMismatches = normalPanelSnapshots
      .filter(snapshot => frameFields.some(
        field => snapshot.frame?.[field] !== expectedFrame(snapshot)[field],
      ))
      .map(snapshot => ({
        checkpoint:snapshot.checkpoint,
        framePinned:snapshot.framePinned,
        actual:snapshot.frame,
        expected:expectedFrame(snapshot),
      }));
    const actualPinnedFrame = normalPanelSnapshots[firstPinnedIndex]?.frame || null;
    const changedFields = actualPinnedFrame
      ? frameFields.filter(field => actualPinnedFrame[field] !== expectedRawFrame[field])
      : [];
    const actualNormalization = actualPinnedFrame ? {
      height:actualPinnedFrame.height - expectedRawFrame.height,
      bottom:actualPinnedFrame.bottom - expectedRawFrame.bottom,
    } : null;
    if (normalPanelSnapshots.length !== snapshots.length
      || firstPinnedIndex <= 0
      || normalPanelSnapshots.slice(0, firstPinnedIndex).some(({framePinned}) => framePinned)
      || normalPanelSnapshots.slice(firstPinnedIndex).some(({framePinned}) => !framePinned)
      || expectedNormalizationDelta !== 0.5
      || normalizationDelta !== expectedNormalizationDelta
      || JSON.stringify(changedFields) !== JSON.stringify(['bottom', 'height'])
      || actualNormalization?.height !== expectedNormalizationDelta
      || actualNormalization?.bottom !== expectedNormalizationDelta
      || frameMismatches.length !== 0) {
      findings.push({
        checkpoint: 'all',
        issue: 'toolbar navigation changed the frame beyond its one-time half-pixel pin normalization',
        expectedRawFrame,
        expectedPinnedFrame,
        normalizationDelta,
        actualNormalization,
        changedFields,
        firstPinnedIndex,
        pinSequence,
        frameMismatches,
      });
    }

    // A real change to the reviewed frame is still invalidating. This control
    // keeps the ordinary-panel-resize assertion from passing merely because
    // the engine stopped observing geometry altogether.
    await openReviewDetails(page);
    await click(page, button('Scroll mock down'));
    await until(() => evaluate(page, `!${button('Scroll mock up')}.disabled`),
      'native mock scroll moved away from the anchored header');
    await click(page, button('Scroll mock up'));
    await until(() => evaluate(page, `${button('Scroll mock up')}.disabled
      && document.querySelectorAll('.dude-review-overlay [data-annotation]').length === 1`),
    'native mock scroll returned and revalidated the retained marker');
    await until(() => evaluate(page, `${button('Save markup')}.matches('[aria-disabled="true"]')
      && ${describedText(button('Save markup'))}
        === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'`),
    'scroll restoration autosave settled before genuine drift');
    const genuineBefore = await pinSnapshot();
    const genuineWorkingBefore = fs.readFileSync(workingFile);
    pinningState.genuineFrameChange = {before:genuineBefore};
    assert.equal(genuineBefore.markers.length, 1,
      'the genuine-change control starts with one painted retained annotation');
    await evaluate(page, `document.querySelector('.dude-review-frame').style.width
      = '${genuineBefore.frame.clientWidth - 24}px'`);
    await until(async () => {
      const value = await pinSnapshot();
      return value.status === 'Stale source' ? value : null;
    }, 'genuine reviewed-frame size invalidation');
    const genuineAfter = await pinSnapshot();
    assert.equal(genuineAfter.frame.clientWidth, genuineBefore.frame.clientWidth - 24);
    assert.equal(genuineAfter.markers.length, 0,
      'genuine frame drift immediately suppresses stale marker paint');
    assert.equal(fs.readFileSync(workingFile).equals(genuineWorkingBefore), true,
      'genuine drift neither clears, rebases, filters, nor saves over retained markup');
    const controlByName = Object.fromEntries(genuineAfter.controls.map(control => [control.name, control]));
    for (const name of [
      'Select (V)', 'Comment (C)', 'Box (B)', 'Circle (O)',
      'Arrow (A)', 'Line (L)', 'Highlight (H)', 'Save markup', 'Send annotations',
    ]) {
      assert.equal(controlByName[name]?.disabled, true, `${name} is guarded after genuine drift`);
      assert.ok(
        controlByName[name]?.title
          || controlByName[name]?.describedBy.some(Boolean),
        `${name} discloses why it is unavailable`,
      );
    }
    assert.equal(controlByName['Comments (1)']?.disabled, false,
      'retained comments remain inspectable');
    assert.equal(controlByName['Restore recorded view']?.disabled, false,
      'the stale same-submission session has an enabled recovery path');
    assert.match(
      controlByName['Restore recorded view']?.title || '',
      /same submission\. Nothing is sent\./,
      'the recovery action is honestly named and scoped',
    );
    assert.equal(
      fixture.provider.read().requests.find(
        ({requestHandle}) => requestHandle === publication.record.requestHandle,
      ).phase,
      'pending',
      'genuine drift does not consume the waiting request',
    );
    pinningState.genuineFrameChange = {
      ...pinningState.genuineFrameChange,
      after:genuineAfter,
      workingSha256:sha256(genuineWorkingBefore),
    };
    const expectedRestoredWorking = JSON.parse(genuineWorkingBefore).state;
    const reviewsDirectory = path.dirname(path.dirname(workingFile));
    const submissionDirectories = fs.readdirSync(reviewsDirectory).sort();
    const restoreSameSubmission = async label => {
      await click(page, button('Restore recorded view'));
      const restored = await until(async () => {
        const value = await pinSnapshot();
        return value.status === 'Review' && value.frame.pinned
          && value.frame.clientWidth === genuineBefore.frame.clientWidth
          && value.frame.clientHeight === genuineBefore.frame.clientHeight
          && value.markers.length === 1
          && !value.controls.find(control => control.name === 'Send annotations')?.disabled
          ? value : null;
      }, `${label} same-submission restoration`, 30_000);
      assert.deepEqual(currentWorkingState(), expectedRestoredWorking,
        `${label} restores every original annotation, view, anchor, note, and caret`);
      assert.deepEqual(fs.readdirSync(reviewsDirectory).sort(), submissionDirectories,
        `${label} allocates no new review submission`);
      assert.equal(restored.palette.offset, genuineBefore.palette.offset,
        `${label} retains the reachable palette placement`);
      assert.ok(restored.controls.some(
        ({name}) => name === 'Read review notice: Recorded view restored',
      ), `${label} is claimed only after the restored engine is ready`);
      return restored;
    };
    const restoredAfterFrame = await restoreSameSubmission('frame-size');

    await viewport(page, 1000, 'dark', 300, 2);
    const staleTheme = await until(async () => {
      const value = await pinSnapshot();
      return value.status === 'Stale source' ? value : null;
    }, 'genuine theme invalidation');
    assert.equal(staleTheme.markers.length, 0,
      'theme drift immediately suppresses marker paint');
    assert.deepEqual(currentWorkingState(), expectedRestoredWorking);
    assert.equal(fs.readFileSync(workingFile).equals(genuineWorkingBefore), true);
    await viewport(page, 1000, 'light', 300, 2);
    const restoredAfterTheme = await restoreSameSubmission('theme');

    await viewport(page, 1000, 'light', 300, 3);
    const staleDpr = await until(async () => {
      const value = await pinSnapshot();
      return value.status === 'Stale source' ? value : null;
    }, 'genuine display-scale invalidation');
    assert.equal(staleDpr.markers.length, 0,
      'DPR drift immediately suppresses marker paint');
    assert.deepEqual(currentWorkingState(), expectedRestoredWorking);
    assert.equal(fs.readFileSync(workingFile).equals(genuineWorkingBefore), true);
    assert.deepEqual(fs.readdirSync(reviewsDirectory).sort(), submissionDirectories);
    assert.equal(
      fixture.provider.read().requests.find(
        ({requestHandle}) => requestHandle === publication.record.requestHandle,
      ).phase,
      'pending',
      'frame, theme, and DPR invalidation leave the original request pending',
    );
    await viewport(page, 1000, 'light', 300, 2);
    pinningState.genuineFrameChange = {
      ...pinningState.genuineFrameChange,
      restoredAfterFrame,
      staleTheme,
      restoredAfterTheme,
      staleDpr,
      submissionDirectories,
    };
    writeEvidenceJson(output, 'short-panel-floating-toolbar.metrics', {
      fixtureSourceRevision: preview.artifact.revision,
      browser: browserState.version,
      snapshots,
      targets,
      keyboardReachability,
      workflowState,
      movementState,
      pinningState,
      runtimeErrors,
      findings,
    });
    await saveRegressionProof(page, output, 'short-panel-floating-toolbar', {
      snapshots,
      findings,
    });
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(
      findings,
      [],
      'short-panel floating tools must remain wholly painted, hittable, and reachable after real wheel/focus navigation',
    );
  } finally {
    const positionedCleanup = wheelExperiment.variants.positioned.cleanup ?? {
      observer:null,
      publication:false,
      browser:false,
      fixture:false,
      board:false,
    };
    wheelExperiment.variants.positioned.cleanup = positionedCleanup;
    await runCleanupSteps(
      async () => {
        if (!wheelObserver) return;
        positionedCleanup.observer = await wheelObserver.close();
        wheelObserver = null;
      },
      async () => {
        if (!publication) return;
        publication.controller.abort();
        await publication.result.catch(() => {});
        positionedCleanup.publication = true;
      },
      async () => {
        if (!browserState) return;
        await cleanupBrowserDriver(browserState);
        positionedCleanup.browser = true;
        positionedCleanup.profileExists = fs.existsSync(browserState.profile);
        positionedCleanup.browserAlive = browserState.browser.pid
          ? browserPidAlive(browserState.browser.pid)
          : null;
      },
      async () => {
        if (!fixture) return;
        const fixtureRoot = fixture.root;
        await fixture.close();
        positionedCleanup.fixture = true;
        positionedCleanup.fixtureRootExists = fs.existsSync(fixtureRoot);
      },
      () => {
        board.close();
        positionedCleanup.board = true;
      },
    );
  }
});

test('T012 review regression: master-detail selection and focusable saved state stay non-vacuous', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-selection-save');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  const runtimeErrors = [];
  const network = [];
  const observations = {
    convention: {
      selection: 'Fluent NavItem/mail-client master-detail selection: current-item shape and fill stay distinct from keyboard focus.',
      scrolling: 'Mail/file/layers master-detail lists reveal a newly selected item with nearest scrolling but do not repeatedly fight user browsing.',
      disabled: 'Fluent v9 disabledFocusable: an inactive command remains keyboard/AX reachable while native activation has no command effect.',
      motion: 'The owned target uses CDP focus emulation plus Chromium backgrounding guards after Edge repeatedly reported visibilityState hidden with a zero-time animation timeline.',
    },
    shortPanel: [],
    save: null,
    initialReveal: null,
    userScroll: null,
    markerReveal: null,
    selectionHistory: null,
    caretAndFrame: null,
    responsive: [],
    oracleFalsification: null,
    nativeEvents: null,
    runtimeErrors,
  };
  context.after(() => writeEvidenceJson(output, 'selection-save.metrics', observations));
  try {
    // Arrange: isolate a synthetic owned mock, real provider/adapter, browser
    // profile, and review files. No approved design or user review is a fixture.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-selection-save-'));
    const feature = createIdea(
      root,
      902,
      'selection-save-regression',
      'defined',
      '# Tasks\n\n- [x] T001@cccccccc Closed fixture remains review-eligible.\n',
    );
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Verify selected annotations and the already-saved command.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(2, true);
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', event => {
      if (event.request.url.startsWith(fixture.instance.url)) {
        network.push({
          method:event.request.method,
          path:new URL(event.request.url).pathname,
          at:Date.now(),
        });
      }
    });
    await viewport(page, 1000, 'light', 900, 2);
    await page.send('Page.navigate', {url:fixture.instance.url});
    await visible(page, 'Connected');
    await choose(page, 'Show', 'Closed');
    await visible(page, '1 of 1 recorded ideas and features');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Defined feature');
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`),
    'selection/save Review engine', 60_000);
    await evaluate(page, `(() => {
      window.__t012NativeInput = [];
      const name = node => node?.getAttribute?.('aria-label')
        || node?.innerText?.replace?.(/\\s+/g, ' ')?.trim()?.slice(0, 120)
        || node?.tagName || null;
      for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click']) {
        document.addEventListener(type, event => {
          window.__t012NativeInput.push({
            type, isTrusted:event.isTrusted, key:event.key || null,
            code:event.code || null, target:name(event.target),
          });
        }, true);
      }
    })()`);

    const comments = count => button(`Comments (${count})`);
    const commentCount = () => evaluate(page, `Number([...document.querySelectorAll('button')]
      .map(node => node.innerText.trim())
      .find(text => /^Comments \\(\\d+\\)$/.test(text))?.match(/\\d+/)?.[0] ?? -1)`);
    const frameSnapshot = () => evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      const overlay = document.querySelector('.dude-review-overlay');
      const box = frame?.getBoundingClientRect();
      return frame ? {
        rect:{top:box.top,right:box.right,bottom:box.bottom,left:box.left,
          width:box.width,height:box.height},
        clientWidth:frame.clientWidth,clientHeight:frame.clientHeight,
        offsetWidth:frame.offsetWidth,offsetHeight:frame.offsetHeight,
        inlineWidth:frame.style.width,inlineHeight:frame.style.height,
        viewBox:overlay?.getAttribute('viewBox') || null,
        badge:[...document.querySelectorAll('[data-review-workspace] > header .fui-Badge')]
          .map(node => node.textContent.trim())[0] || null,
      } : null;
    })()`);
    const capture = async name => {
      const result = await page.send('Page.captureScreenshot', {
        format:'png',
        captureBeyondViewport:false,
      });
      const image = Buffer.from(result.data, 'base64');
      const relative = `${name}.png`;
      fs.writeFileSync(path.join(output.directory, relative), image);
      return {path:relative,bytes:image.length,sha256:sha256(image)};
    };
    const workingFile = () => {
      const reviews = path.join(
        root,
        ...path.posix.dirname(feature.specPath).split('/'),
        'reviews',
      );
      if (!fs.existsSync(reviews)) return null;
      const submission = fs.readdirSync(reviews).find(name =>
        fs.existsSync(path.join(reviews, name, 'working.json')));
      return submission ? path.join(reviews, submission, 'working.json') : null;
    };
    const workingState = () => {
      const file = workingFile();
      return file ? JSON.parse(fs.readFileSync(file, 'utf8')).state : null;
    };
    const nativeSelectAll = async expression => {
      const point = await evaluate(page, `(() => {
        const rect=(${expression}).getBoundingClientRect();
        return {x:rect.left + rect.width / 2,y:rect.top + rect.height / 2};
      })()`);
      for (let count = 1; count <= 3; count += 1) {
        await page.send('Input.dispatchMouseEvent', {
          type:'mousePressed',...point,button:'left',buttons:1,clickCount:count,
        });
        await page.send('Input.dispatchMouseEvent', {
          type:'mouseReleased',...point,button:'left',buttons:0,clickCount:count,
        });
      }
    };
    const settleFiniteMotion = label => until(() => evaluate(page, `document.getAnimations()
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .every(animation => animation.playState === 'finished'
        || animation.playState === 'idle')`), label);
    const browseAnnotationListToTop = async () => {
      await settleFiniteMotion('comments drawer motion before native list browsing');
      let position = await evaluate(page, `(() => {
        const rows=[...document.querySelectorAll('[data-annotation-id]')];
        return {
          active:rows.indexOf(document.activeElement),
          selected:rows.findIndex(row => row.getAttribute('aria-current') === 'true'),
        };
      })()`);
      if (position.active < 0 && position.selected >= 0) {
        await clickAtCurrentPosition(
          page,
          `document.querySelectorAll('[data-annotation-id]')[${position.selected}]`,
        );
        position.active = position.selected;
      }
      if (position.active < 0) {
        for (let step = 0; step < 20 && position.active < 0; step += 1) {
          await pressNavigationKey(page, 'Tab');
          position.active = await evaluate(page, `[...document.querySelectorAll(
            '[data-annotation-id]'
          )].indexOf(document.activeElement)`);
        }
      }
      assert.ok(position.active >= 0, 'native keyboard traversal reaches an annotation row');
      for (let index = position.active; index > 0; index -= 1) {
        await pressNavigationKey(page, 'ArrowUp');
      }
      await until(() => evaluate(page, `(() => {
        const list=document.querySelector('[aria-label="Annotations"]');
        const rows=[...document.querySelectorAll('[data-annotation-id]')];
        return rows.indexOf(document.activeElement) === 0 && list.scrollTop <= .5;
      })()`), 'native keyboard browsing reaches the first annotation row');
    };
    const assertClearedSelection = (snapshot, expectedRows, label) => {
      assert.equal(snapshot.rows.length, expectedRows, `${label}: expected row count`);
      assert.deepEqual(
        snapshot.rows.filter(row => row.ariaCurrent === 'true').map(row => row.id),
        [],
        `${label}: no aria-current survives`,
      );
      assert.deepEqual(
        snapshot.rows.filter(row => row.pseudos.some(pseudo => pseudo.visible)).map(row => row.id),
        [],
        `${label}: no visual selection shape survives`,
      );
      assert.deepEqual(snapshot.badges, [], `${label}: no selected-row badge survives`);
      assert.equal(snapshot.status, '', `${label}: no selected-row status survives`);
      assert.equal(snapshot.statusRegions, 1, `${label}: one status region remains mounted`);
      assert.equal(snapshot.liveRegions, 1, `${label}: one live region remains mounted`);
    };

    // Act + Assert: first cover the short panel while unpinned and therefore
    // fresh in each theme. This is the Edge/Office-style "and more" disclosure:
    // a descriptive trigger, with infrequent commands grouped in a fitting
    // overflow surface rather than promoted into crowded permanent chrome.
    await viewport(page, 1000, 'light', 300, 2);
    const shortFrames = [];
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      await viewport(page, 1000, theme, 300, 2);
      await until(() => evaluate(page, `!document.querySelector('[aria-label="Box (B)"]').disabled`),
        `${theme} unpinned short Review remains actionable`, 60_000);
      const trigger = await evaluate(page, `(() => {
        const node = ${button('Notes and more')};
        return node ? {
          text:node.innerText.trim(),
          title:node.getAttribute('title'),
          description:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
            .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
            .filter(Boolean).join(' ') || null,
          rect:node.getBoundingClientRect().toJSON(),
        } : null;
      })()`);
      assert.deepEqual(
        {text:trigger?.text,title:trigger?.title,description:trigger?.description},
        {
          text:'Notes and more',
          title:null,
          description:"Overall review notes, choosing an element to comment on, scrolling the mock, the drawing shortcuts, and this request's status.",
        },
        `${theme} short-panel disclosure names and previews its grouped contents`,
      );
      await clickAtCurrentPosition(page, button('Notes and more'));
      await until(() => evaluate(page, `Boolean(document.querySelector(
        '.fui-PopoverSurface[aria-label="Notes and more"]'
      )?.getClientRects().length)`), `${theme} short Notes and more surface`);
      await settleFiniteMotion(`${theme} short Notes and more motion`);
      const details = await evaluate(page, `(() => {
        const surface = document.querySelector('.fui-PopoverSurface[aria-label="Notes and more"]');
        const rect = surface.getBoundingClientRect();
        const named = label => [...surface.querySelectorAll('button')]
          .find(node => node.innerText.trim() === label);
        const inLayout = node => {
          if (!node) return false;
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0
            && box.top >= rect.top - 1 && box.bottom <= rect.bottom + 1;
        };
        return {
          ariaLabel:surface.getAttribute('aria-label'),
          triggerDescription:${describedText(button('Notes and more'))} || null,
          visibleTooltips:[...document.querySelectorAll('[role="tooltip"]')]
            .filter(node => {
              const box = node.getBoundingClientRect();
              const style = getComputedStyle(node);
              return style.display !== 'none' && style.visibility !== 'hidden'
                && box.width > 0 && box.height > 0;
            }).map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
          rect:rect.toJSON(),
          withinViewport:rect.top >= -1
            && rect.bottom <= document.documentElement.clientHeight + 1,
          scrollable:surface.scrollHeight > surface.clientHeight,
          pickerPresent:{
            addComment:Boolean(named('Add comment')),
            addAtCenter:Boolean(named('Add at center')),
            scrollUp:Boolean(named('Scroll mock up')),
            scrollDown:Boolean(named('Scroll mock down')),
          },
          picker:{
            addComment:inLayout(named('Add comment')),
            addAtCenter:inLayout(named('Add at center')),
            scrollUp:inLayout(named('Scroll mock up')),
            scrollDown:inLayout(named('Scroll mock down')),
          },
          overflow:{
            horizontal:document.documentElement.scrollWidth
              > document.documentElement.clientWidth + 1,
            vertical:document.documentElement.scrollHeight
              > document.documentElement.clientHeight + 1,
          },
        };
      })()`);
      assert.equal(details.ariaLabel, 'Notes and more');
      assert.deepEqual(details.visibleTooltips, [],
        `${theme} open Notes and more surface has no competing tooltip`);
      assert.equal(details.withinViewport, true, `${theme} popover fits the 300px panel`);
      assert.equal(details.scrollable, true, `${theme} short popover exposes its own scroller`);
      assert.deepEqual(details.pickerPresent, {
        addComment:true,addAtCenter:true,scrollUp:true,scrollDown:true,
      }, `${theme} picker commands remain inside the scrollable popover`);
      assert.deepEqual(details.overflow, {horizontal:false,vertical:false});
      const screenshot = await capture(`selection-save-short-1000x300-dpr2-${theme}`);
      shortFrames.push(await frameSnapshot());
      observations.shortPanel.push({theme,trigger,details,screenshot,frame:shortFrames.at(-1)});
      await press(page, 'Escape');
      await settleFiniteMotion(`${theme} short disclosure close motion`);
      await until(() => evaluate(page, `!document.querySelector(
        '.fui-PopoverSurface[aria-label="Notes and more"]'
      )?.getClientRects().length
        && document.activeElement === (${button('Notes and more')})`),
      `${theme} short disclosure returns native focus`);
    }
    assert.deepEqual(
      shortFrames.map(frame => ({
        clientWidth:frame.clientWidth,clientHeight:frame.clientHeight,
        offsetWidth:frame.offsetWidth,offsetHeight:frame.offsetHeight,
        inlineWidth:frame.inlineWidth,inlineHeight:frame.inlineHeight,
        viewBox:frame.viewBox,badge:frame.badge,
      })),
      [shortFrames[0], shortFrames[0]].map(frame => ({
        clientWidth:frame.clientWidth,clientHeight:frame.clientHeight,
        offsetWidth:frame.offsetWidth,offsetHeight:frame.offsetHeight,
        inlineWidth:frame.inlineWidth,inlineHeight:frame.inlineHeight,
        viewBox:frame.viewBox,badge:frame.badge,
      })),
      'light/dark short-panel disclosure leaves the same fresh reviewed frame',
    );
    assert.equal(shortFrames[0].badge, 'Review');

    await viewport(page, 1000, 'light', 900, 2);
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Box (B)"]').disabled`),
      'fresh full-height Review after short-panel checks', 60_000);
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Box (B)"]')`);
    await openReviewDetails(page);
    await clickAtCurrentPosition(page, button('Add at center'));
    await until(async () => (await commentCount()) === 1, 'first centered box');
    await press(page, 'Escape');
    await settleFiniteMotion('first drawing disclosure close motion');
    await revealFloatingTool(page, 'Highlight (H)');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Highlight (H)"]')`);
    await openReviewDetails(page);
    for (let count = 2; count <= 14; count += 1) {
      await clickAtCurrentPosition(page, button('Add at center'));
      await until(async () => (await commentCount()) === count, `centered highlight ${count}`);
    }
    await press(page, 'Escape');
    await settleFiniteMotion('fourteen-drawing disclosure close motion');
    await until(() => evaluate(page, `${button('Save markup')}.matches('[aria-disabled="true"]')
      && ${describedText(button('Save markup'))}
        === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'`),
    'fourteen annotations autosaved');
    await until(() => {
      const record = fixture.provider.read().requests.find(
        item => item.requestHandle === publication.record.requestHandle,
      );
      return record && !record.reviewing;
    }, 'provider autosave idle');
    const file = await until(() => workingFile(), 'isolated working review file');

    // Save markup uses Fluent's documented focusable-disabled state. Attribute
    // semantics are not accepted as proof of inactivity: native Enter, Space,
    // and pointer activation must leave the already-observed save transport and
    // working bytes unchanged.
    await clickAtCurrentPosition(page, button('Source'));
    await press(page, 'Escape');
    await settleFiniteMotion('Source disclosure close motion');
    await until(() => evaluate(page, `document.activeElement === (${button('Source')})`),
      'Source returns native focus before Save markup traversal');
    const savePath = [];
    for (let step = 0; step < 6; step += 1) {
      if (await evaluate(page, `document.activeElement === (${button('Save markup')})`)) break;
      await pressNavigationKey(page, 'Tab');
      savePath.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim() || document.activeElement?.tagName`));
    }
    const saveFocusTooltip = await until(() => evaluate(page, `(() => {
      const node = ${button('Save markup')};
      const ids = (node?.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
      const described = ids.map(id => document.getElementById(id)).filter(Boolean);
      const visible = described.filter(tip => {
        const style = getComputedStyle(tip);
        const box = tip.getBoundingClientRect();
        return style.display !== 'none' && style.visibility === 'visible'
          && Number.parseFloat(style.opacity) > 0 && box.width > 0 && box.height > 0;
      });
      return document.activeElement === node && visible.length === 1 ? {
        id:visible[0].id,
        text:visible[0].textContent.replace(/\\s+/g, ' ').trim(),
        rect:visible[0].getBoundingClientRect().toJSON(),
      } : null;
    })()`), 'Save reason tooltip after native keyboard focus', 8_000);

    // Instrument the mounted engine command at its real React ref boundary.
    // Network and working-file equality cannot distinguish a forwarded clean
    // save from suppression because engine.save() deliberately returns early
    // when changeRevision === savedRevision. The direct clean call below proves
    // the probe observes that no-op; the native events must then observe zero
    // calls through the same wrapped command.
    const commandProbe = await evaluate(page, `(() => {
      const start = document.querySelector('[data-review-workspace]');
      const fiberKey = start && Object.keys(start).find(key => key.startsWith('__reactFiber$'));
      let fiber = fiberKey ? start[fiberKey] : null;
      const engines = [];
      while (fiber) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          const candidate = hook.memoizedState?.current;
          if (candidate && ['update','getState','command','handleKeyDown','dispose']
            .every(name => typeof candidate[name] === 'function')) engines.push(candidate);
        }
        fiber = fiber.return;
      }
      const unique = [...new Set(engines)];
      if (unique.length !== 1) return { installed:false, candidates:unique.length };
      const engine = unique[0], original = engine.command;
      const probe = { engine, original, calls:[] };
      engine.command = function(action) {
        probe.calls.push({ type:action?.type ?? null });
        return original.call(engine, action);
      };
      window.__t012EngineCommandProbe = probe;
      return { installed:true, candidates:unique.length };
    })()`);
    assert.deepEqual(commandProbe, {installed:true,candidates:1},
      'the command-call probe attaches to exactly one mounted Review engine');
    const cleanNoOpPostsBefore = network.filter(entry =>
      entry.path === '/api/needs-you/review/save').length;
    const cleanNoOpBytesBefore = fs.readFileSync(file);
    const cleanNoOpResult = await evaluate(page, `(async () => {
      const probe = window.__t012EngineCommandProbe;
      const result = await probe.engine.command({type:'save'});
      return { result, calls:probe.calls.slice() };
    })()`);
    assert.deepEqual(cleanNoOpResult.calls, [{type:'save'}],
      'the probe observes a directly forwarded clean-state Save command');
    assert.equal(
      network.filter(entry => entry.path === '/api/needs-you/review/save').length,
      cleanNoOpPostsBefore,
      'the directly forwarded clean-state Save command takes the engine no-op path',
    );
    assert.equal(fs.readFileSync(file).equals(cleanNoOpBytesBefore), true,
      'the directly forwarded clean-state Save command leaves working bytes unchanged');
    await evaluate(page, 'window.__t012EngineCommandProbe.calls = []');

    const saveBefore = await evaluate(page, `(() => {
      const node = ${button('Save markup')};
      const rect = node.getBoundingClientRect();
      const describedBy = (node.getAttribute('aria-describedby') || '').split(/\\s+/)
        .filter(Boolean);
      const description = describedBy.map(id => document.getElementById(id)?.textContent
          .replace(/\\s+/g, ' ').trim() || null);
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      window.__t012SaveStatusMutations = description.slice();
      const target = document.getElementById(describedBy[0]);
      window.__t012SaveObserver = new MutationObserver(() => {
        window.__t012SaveStatusMutations.push(target?.textContent.replace(/\\s+/g, ' ').trim() || null);
      });
      if (target) window.__t012SaveObserver.observe(target, {
        childList:true,subtree:true,characterData:true,
      });
      return {
        disabledProperty:node.disabled,
        ariaDisabled:node.getAttribute('aria-disabled'),
        title:node.getAttribute('title'),
        tabIndex:node.tabIndex,
        focused:document.activeElement === node,
        describedBy,
        description,
        pointerHit:Boolean(hit && (hit === node || node.contains(hit))),
        point:{x:rect.left + rect.width / 2,y:rect.top + rect.height / 2},
        scope:Boolean(node.closest('[data-review-workspace]')),
        inPalette:Boolean(node.closest('[data-review-tools]')),
        name:node.innerText.trim(),
        statusStrip:[...document.querySelectorAll('[data-review-workspace] [role="status"]')]
          .find(item => !item.closest('[data-review-tools]') && item.textContent.trim())
          ?.textContent.replace(/\\s+/g, ' ').trim() || null,
      };
    })()`);
    const axTree = await page.send('Accessibility.getFullAXTree');
    const saveAx = axTree.nodes.filter(node => !node.ignored
      && node.role?.value === 'button' && node.name?.value === 'Save markup')
      .map(node => ({
        role:node.role.value,
        name:node.name.value,
        description:node.description?.value ?? null,
        disabled:axProperty(node, 'disabled'),
        focused:axProperty(node, 'focused'),
      }));
    const savePostsBefore = network.filter(entry =>
      entry.path === '/api/needs-you/review/save').length;
    const bytesBefore = fs.readFileSync(file);
    assert.ok(savePostsBefore > 0,
      'the same network oracle observed at least one real autosave before the no-op probe');
    await press(page, 'Enter');
    await press(page, ' ', 'Space');
    await page.send('Input.dispatchMouseEvent', {
      type:'mousePressed', ...saveBefore.point,
      button:'left',buttons:1,clickCount:1,
    });
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseReleased', ...saveBefore.point,
      button:'left',buttons:0,clickCount:1,
    });
    // CDP acknowledges each trusted input only after its synchronous event
    // dispatch. One browser microtask checkpoint then flushes any command
    // promise queued by those handlers without adding a sleep or retry.
    await evaluate(page, 'Promise.resolve(true)');
    const saveAfter = await evaluate(page, `(() => {
      const node = ${button('Save markup')};
      window.__t012SaveObserver?.disconnect();
      return {
        disabledProperty:node.disabled,
        ariaDisabled:node.getAttribute('aria-disabled'),
        title:node.getAttribute('title'),
        focused:document.activeElement === node,
        describedBy:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean),
        description:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
          .map(id => document.getElementById(id)?.textContent
            .replace(/\\s+/g, ' ').trim() || null),
        mutations:window.__t012SaveStatusMutations,
        commandCalls:window.__t012EngineCommandProbe.calls.slice(),
      };
    })()`);
    const saveObservation = {
      path:savePath,
      before:saveBefore,
      after:saveAfter,
      ax:saveAx,
      focusTooltip:saveFocusTooltip,
      cleanNoOpControl:{
        calls:cleanNoOpResult.calls,
        savePostsBefore:cleanNoOpPostsBefore,
        savePostsAfter:network.filter(entry =>
          entry.path === '/api/needs-you/review/save').length,
        workingShaBefore:sha256(cleanNoOpBytesBefore),
        workingShaAfter:sha256(fs.readFileSync(file)),
      },
      savePostsBefore,
      savePostsAfter:network.filter(entry =>
        entry.path === '/api/needs-you/review/save').length,
      workingShaBefore:sha256(bytesBefore),
      workingShaAfter:sha256(fs.readFileSync(file)),
      providerReviewing:fixture.provider.read().requests.find(
        item => item.requestHandle === publication.record.requestHandle,
      )?.reviewing ?? null,
    };
    const saveFindings = value => {
      const issues = [];
      const reason = 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.';
      if (!value.path.includes('Save markup') || !value.before.focused) {
        issues.push('native Tab did not reach Save markup');
      }
      if (value.before.disabledProperty !== false || value.before.ariaDisabled !== 'true'
        || value.before.tabIndex !== 0) {
        issues.push('Save markup is not focusable with aria-disabled=true');
      }
      if (value.before.title !== null) issues.push('Save markup retains a conflicting native title');
      if (value.before.description.join(' ') !== reason) {
        issues.push('Save markup accessible description is missing or changed');
      }
      if (!/\. Read notice$/.test(value.before.statusStrip || '')
        || value.before.statusStrip.includes(reason)) {
        issues.push(`the notice-present Save probe did not keep an independent notice in the status strip: ${value.before.statusStrip}`);
      }
      if (value.focusTooltip?.text !== reason) {
        issues.push('native keyboard focus did not reveal the Save reason tooltip');
      }
      if (!value.before.pointerHit) issues.push('Save markup is not hover/pointer reachable');
      if (value.ax.length !== 1 || value.ax[0].disabled !== true
        || value.ax[0].focused !== true || value.ax[0].description !== reason) {
        issues.push('native accessibility tree does not expose the focused disabled Save reason');
      }
      if (value.savePostsAfter !== value.savePostsBefore) {
        issues.push('inactive Save markup issued a save request');
      }
      if (value.workingShaAfter !== value.workingShaBefore) {
        issues.push('inactive Save markup changed working review bytes');
      }
      if (value.providerReviewing !== false) {
        issues.push('inactive Save markup entered provider saving state');
      }
      if (value.after.mutations.some(text => /Saving working markup/.test(text || ''))) {
        issues.push('inactive Save markup announced a saving transition');
      }
      if (value.after.commandCalls.length !== 0) {
        issues.push('inactive Save markup forwarded a command to the engine');
      }
      if (value.after.ariaDisabled !== 'true' || value.after.title !== null
        || value.after.description.join(' ') !== reason) {
        issues.push('inactive Save markup changed its disabled semantics');
      }
      return issues;
    };
    const assertSaveObservation = (value, label) => {
      assert.deepEqual(saveFindings(value), [], label);
    };
    assertSaveObservation(
      saveObservation,
      'notice-present focusable Save remains described and suppresses every native activation',
    );
    const ariaDisabledControls = await evaluate(page, `[...document.querySelectorAll(
      '[aria-disabled="true"]'
    )].filter(node => node.getClientRects().length).map(node => ({
      name:node.getAttribute('aria-label') || node.innerText.trim(),
      scope:Boolean(node.closest('[data-review-workspace]')),
      inPalette:Boolean(node.closest('[data-review-tools]')),
      tabIndex:node.tabIndex,
      title:node.getAttribute('title'),
      describedBy:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean),
      description:(node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '')
        .filter(Boolean).join(' ') || null,
      ariaDisabled:node.getAttribute('aria-disabled'),
    }))`);
    assert.deepEqual(
      ariaDisabledControls.map(control => control.name),
      ['Save markup'],
      'Save markup is the only rendered aria-disabled control at the audit boundary',
    );

    const baselineContrast = await textContrastSnapshot(page);
    assertTextContrast(baselineContrast, 'baseline Save contrast boundary');
    const baselineSaveContrast = baselineContrast.filter(sample => sample.text === 'Save markup');
    assert.equal(baselineSaveContrast.length, 1);
    assert.equal(
      baselineSaveContrast[0].exemption,
      'inactive control (WCAG 1.4.3)',
      'the real audit exempts only the current focusable inactive Save sample',
    );

    // Each boundary mutation changes the live production DOM and then invokes
    // the same collector and owning assertion used by audit(). No copied
    // predicate participates in this proof.
    const contrastBoundaryFalsifications = [];
    const falsifyContrastBoundary = async (name, mutation) => {
      await evaluate(page, `(() => {
        const node = ${button('Save markup')};
        ${mutation}
      })()`);
      try {
        const candidate = await textContrastSnapshot(page);
        const failures = textContrastFailures(candidate);
        assert.throws(
          () => assertTextContrast(candidate, `mutated Save boundary: ${name}`),
          /rendered active text meets WCAG contrast/,
          `${name} must make the owning contrast assertion fail`,
        );
        assert.ok(failures.length > 0, `${name} exposes at least one real low-contrast sample`);
        contrastBoundaryFalsifications.push({name,failures});
      } finally {
        await evaluate(page, `window.__t012ContrastRestore?.();
          delete window.__t012ContrastRestore; true`);
      }
      assertTextContrast(
        await textContrastSnapshot(page),
        `restored Save boundary after ${name}`,
      );
    };
    await falsifyContrastBoundary('aria-disabled selector', `
      const value = node.getAttribute('aria-disabled');
      const color = {
        value:node.style.getPropertyValue('color'),
        priority:node.style.getPropertyPriority('color'),
      };
      const painted = getComputedStyle(node).color;
      window.__t012ContrastRestore = () => {
        node.setAttribute('aria-disabled', value);
        if (color.value) node.style.setProperty('color', color.value, color.priority);
        else node.style.removeProperty('color');
      };
      node.style.setProperty('color', painted, 'important');
      node.removeAttribute('aria-disabled');
    `);
    await falsifyContrastBoundary('exact Save markup text', `
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let textNode;
      while (walker.nextNode()) {
        if (walker.currentNode.data.trim() === 'Save markup') { textNode = walker.currentNode; break; }
      }
      if (!textNode) throw new Error('Save markup text node not found');
      const value = textNode.data;
      window.__t012ContrastRestore = () => { textNode.data = value; };
      textNode.data = 'Send annotations';
    `);
    await falsifyContrastBoundary('Review workspace scope', `
      const workspace = node.closest('[data-review-workspace]');
      if (!workspace) throw new Error('Save markup workspace not found');
      window.__t012ContrastRestore = () => workspace.setAttribute('data-review-workspace', '');
      workspace.removeAttribute('data-review-workspace');
    `);
    await falsifyContrastBoundary('outside floating tools', `
      const had = node.hasAttribute('data-review-tools');
      const value = node.getAttribute('data-review-tools');
      window.__t012ContrastRestore = () => had
        ? node.setAttribute('data-review-tools', value) : node.removeAttribute('data-review-tools');
      node.setAttribute('data-review-tools', '');
    `);
    await falsifyContrastBoundary('tabIndex zero', `
      const value = node.getAttribute('tabindex');
      window.__t012ContrastRestore = () => value === null
        ? node.removeAttribute('tabindex') : node.setAttribute('tabindex', value);
      node.setAttribute('tabindex', '-1');
    `);
    await falsifyContrastBoundary('nonempty resolved description', `
      const value = node.getAttribute('aria-describedby');
      window.__t012ContrastRestore = () => value === null
        ? node.removeAttribute('aria-describedby') : node.setAttribute('aria-describedby', value);
      node.removeAttribute('aria-describedby');
    `);

    const collectCurrentSaveObservation = async (postsBefore, workingBytesBefore) => {
      const surface = await evaluate(page, `(() => {
        const node = ${button('Save markup')};
        const rect = node.getBoundingClientRect();
        const describedBy = (node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
        const description = describedBy.map(id => document.getElementById(id)?.textContent
          .replace(/\\s+/g, ' ').trim() || null);
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const visibleTip = describedBy.map(id => document.getElementById(id)).find(tip => {
          if (!tip) return false;
          const style = getComputedStyle(tip), box = tip.getBoundingClientRect();
          return style.display !== 'none' && style.visibility === 'visible'
            && Number.parseFloat(style.opacity) > 0 && box.width > 0 && box.height > 0;
        });
        return {
          disabledProperty:node.disabled,
          ariaDisabled:node.getAttribute('aria-disabled'),
          title:node.getAttribute('title'),
          tabIndex:node.tabIndex,
          focused:document.activeElement === node,
          describedBy,
          description,
          pointerHit:Boolean(hit && (hit === node || node.contains(hit))),
          point:{x:rect.left + rect.width / 2,y:rect.top + rect.height / 2},
          scope:Boolean(node.closest('[data-review-workspace]')),
          inPalette:Boolean(node.closest('[data-review-tools]')),
          name:node.innerText.trim(),
          statusStrip:[...document.querySelectorAll('[data-review-workspace] [role="status"]')]
            .find(item => !item.closest('[data-review-tools]') && item.textContent.trim())
            ?.textContent.replace(/\\s+/g, ' ').trim() || null,
          visibleTip:visibleTip ? {
            id:visibleTip.id,
            text:visibleTip.textContent.replace(/\\s+/g, ' ').trim(),
          } : null,
          commandCalls:window.__t012EngineCommandProbe.calls.slice(),
        };
      })()`);
      const tree = await page.send('Accessibility.getFullAXTree');
      const ax = tree.nodes.filter(node => !node.ignored
        && node.role?.value === 'button' && node.name?.value === 'Save markup')
        .map(node => ({
          role:node.role.value,
          name:node.name.value,
          description:node.description?.value ?? null,
          disabled:axProperty(node, 'disabled'),
          focused:axProperty(node, 'focused'),
        }));
      return {
        path:surface.focused ? ['Save markup'] : [],
        before:surface,
        after:{
          ...surface,
          mutations:surface.description,
          commandCalls:surface.commandCalls,
        },
        ax,
        focusTooltip:surface.visibleTip,
        savePostsBefore:postsBefore,
        savePostsAfter:network.filter(entry =>
          entry.path === '/api/needs-you/review/save').length,
        workingShaBefore:sha256(workingBytesBefore),
        workingShaAfter:sha256(fs.readFileSync(file)),
        providerReviewing:fixture.provider.read().requests.find(
          item => item.requestHandle === publication.record.requestHandle,
        )?.reviewing ?? null,
      };
    };
    const saveOracleFalsifications = [];
    const falsifySaveOracle = async (name, mutate, restore) => {
      const postsBefore = network.filter(entry =>
        entry.path === '/api/needs-you/review/save').length;
      const workingBytesBefore = fs.readFileSync(file);
      try {
        await mutate();
        const candidate = await collectCurrentSaveObservation(postsBefore, workingBytesBefore);
        const findings = saveFindings(candidate);
        assert.throws(
          () => assertSaveObservation(candidate, `mutated Save oracle: ${name}`),
          /mutated Save oracle/,
          `${name} must make the owning Save assertion fail`,
        );
        assert.ok(findings.length > 0, `${name} produces a concrete Save finding`);
        saveOracleFalsifications.push({name,findings});
      } finally {
        await restore();
        await evaluate(page, 'window.__t012EngineCommandProbe.calls = []');
      }
    };

    await falsifySaveOracle(
      'not keyboard reachable',
      () => evaluate(page, `(() => {
        const node = ${button('Save markup')};
        window.__t012SaveTabIndex = node.getAttribute('tabindex');
        node.setAttribute('tabindex', '-1');
      })()`),
      () => evaluate(page, `(() => {
        const node = ${button('Save markup')}, value = window.__t012SaveTabIndex;
        if (value === null) node.removeAttribute('tabindex'); else node.setAttribute('tabindex', value);
        delete window.__t012SaveTabIndex;
      })()`),
    );
    await falsifySaveOracle(
      'missing aria-disabled',
      () => evaluate(page, `(() => {
        const node = ${button('Save markup')};
        window.__t012SaveAriaDisabled = node.getAttribute('aria-disabled');
        node.removeAttribute('aria-disabled');
      })()`),
      () => evaluate(page, `(() => {
        const node = ${button('Save markup')};
        node.setAttribute('aria-disabled', window.__t012SaveAriaDisabled);
        delete window.__t012SaveAriaDisabled;
      })()`),
    );
    await falsifySaveOracle(
      'native activation caused a request',
      async () => {
        await evaluate(page, `(() => {
          const node = ${button('Save markup')};
          const listener = () => {
            window.__t012InjectedSaveRequest = fetch('/api/needs-you/review/save', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:'{}',
            }).then(response => response.text());
          };
          window.__t012InjectedSaveListener = listener;
          node.addEventListener('click', listener, {once:true});
        })()`);
        await page.send('Input.dispatchMouseEvent', {
          type:'mousePressed', ...saveBefore.point,
          button:'left',buttons:1,clickCount:1,
        });
        await page.send('Input.dispatchMouseEvent', {
          type:'mouseReleased', ...saveBefore.point,
          button:'left',buttons:0,clickCount:1,
        });
        await evaluate(page, 'window.__t012InjectedSaveRequest');
      },
      () => evaluate(page, `(() => {
        ${button('Save markup')}?.removeEventListener(
          'click',
          window.__t012InjectedSaveListener,
        );
        delete window.__t012InjectedSaveListener;
        delete window.__t012InjectedSaveRequest;
      })()`),
    );
    await falsifySaveOracle(
      'native activation changed working bytes',
      async () => {
        const bytes = fs.readFileSync(file);
        fs.writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n')]));
      },
      async () => {
        fs.writeFileSync(file, bytesBefore);
      },
    );
    await falsifySaveOracle(
      'native activation announced saving',
      () => evaluate(page, `(() => {
        const node = ${button('Save markup')};
        const id = (node.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean)[0];
        const target = document.getElementById(id);
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode();
        if (!textNode) throw new Error('Save description text node not found');
        window.__t012SaveDescriptionNode = textNode;
        window.__t012SaveDescriptionText = textNode.data;
        textNode.data = 'Saving working markup…';
      })()`),
      () => evaluate(page, `(() => {
        window.__t012SaveDescriptionNode.data = window.__t012SaveDescriptionText;
        delete window.__t012SaveDescriptionNode;
        delete window.__t012SaveDescriptionText;
      })()`),
    );
    assert.equal(fs.readFileSync(file).equals(bytesBefore), true,
      'Save oracle byte falsification restores the exact fixture working file');
    const restoredSave = await collectCurrentSaveObservation(
      network.filter(entry => entry.path === '/api/needs-you/review/save').length,
      fs.readFileSync(file),
    );
    assertSaveObservation(restoredSave, 'Save oracle restores the live production surface');

    observations.save = {
      ...saveObservation,
      ariaDisabledControls,
      cleanNoOpDiscriminator:{
        forwardedCalls:cleanNoOpResult.calls.length,
        nativeActivationCalls:saveAfter.commandCalls.length,
        forwardedNetworkDelta:saveObservation.cleanNoOpControl.savePostsAfter
          - saveObservation.cleanNoOpControl.savePostsBefore,
        nativeNetworkDelta:saveObservation.savePostsAfter - saveObservation.savePostsBefore,
      },
      contrastExemption:'button[aria-disabled=true] + exact Save markup text + Review scope + outside palette + tabindex 0 + resolved description',
      contrastBoundaryFalsifications,
      saveOracleFalsifications,
    };
    await evaluate(page, `(() => {
      const probe = window.__t012EngineCommandProbe;
      probe.engine.command = probe.original;
      delete window.__t012EngineCommandProbe;
    })()`);

    const frameClosed = await frameSnapshot();
    await clickAtCurrentPosition(page, comments(14));
    await until(() => evaluate(page, `Boolean(document.querySelector(
      '[aria-label="Close comments"]'
    ))`), 'fourteen-row comments drawer');
    await settleFiniteMotion('fourteen-row comments drawer motion');
    const initialReveal = await until(async () => {
      const value = await reviewSelectionSnapshot(page);
      const selected = value.rows?.find(row => row.ariaCurrent === 'true');
      return selected?.index === 13 && selected.fullyVisible ? value : null;
    }, 'initially selected fourteenth row revealed');
    assert.equal(initialReveal.list.overflowY, 'auto');
    assert.ok(initialReveal.list.scrollHeight > initialReveal.list.clientHeight);
    assert.ok(initialReveal.list.scrollTop > 0);
    assert.ok(initialReveal.editor.rect.top >= initialReveal.drawerBody.top - .5
      && initialReveal.editor.rect.bottom <= initialReveal.drawerBody.bottom + .5,
    'bounded list reveal leaves the selected editor fully visible');
    assert.deepEqual(initialReveal.badges, ['Not sent']);
    assert.equal(initialReveal.statusRegions, 1);
    assert.equal(initialReveal.liveRegions, 1);
    assert.equal(initialReveal.prohibitedPositiveClaim, false);
    assert.equal(initialReveal.reviewBadge, 'Review');
    observations.initialReveal = initialReveal;

    // A nearest-scroll effect must reveal a changed selection, not continuously
    // pull the user back. Browse to the list start with native arrow keys and prove
    // the still-selected last row can remain offscreen until selection changes.
    await browseAnnotationListToTop();
    await settleFiniteMotion('palette uncovered before marker selection');
    const afterUserScroll = await reviewSelectionSnapshot(page);
    assert.ok(afterUserScroll.list.scrollTop <= .5);
    assert.equal(
      afterUserScroll.rows.find(row => row.ariaCurrent === 'true')?.fullyVisible,
      false,
      'manual list browsing is not fought by a repeating scroll effect',
    );
    await clickAtCurrentPosition(page, `document.querySelectorAll('[data-annotation-id]')[0]`);
    await until(() => evaluate(page, `document.querySelectorAll(
      '[data-annotation-id]'
    )[0].getAttribute('aria-current') === 'true'`), 'first list row selected natively');
    const firstSelected = await reviewSelectionSnapshot(page);
    assert.equal(firstSelected.rows[0].fullyVisible, true);
    observations.userScroll = {afterUserScroll,firstSelected};
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    observations.dismissalProbe = await evaluate(page, `(() => {
      const close=document.querySelector('[aria-label="Close comments"]');
      const drawer=close?.closest('.fui-OverlayDrawer') || close?.closest('[role="dialog"]');
      return {
        closePresent:Boolean(close),
        drawerPresent:Boolean(drawer),
        visibilityState:document.visibilityState,
        timelineCurrentTime:document.timeline.currentTime,
        drawerRect:drawer?.getBoundingClientRect().toJSON() || null,
        drawerAttributes:drawer
          ? Object.fromEntries([...drawer.attributes].map(attribute =>
            [attribute.name,attribute.value])) : null,
        events:window.__t012NativeInput.slice(-8),
        animations:document.getAnimations().map(animation => ({
          playState:animation.playState,
          currentTime:animation.currentTime,
          endTime:animation.effect?.getComputedTiming().endTime,
        })),
      };
    })()`);
    await settleFiniteMotion('native X close before mock-to-list selection');
    await until(() => evaluate(page, `!document.querySelector(
      '[aria-label="Close comments"]'
    )`), 'drawer closed before mock-to-list selection');
    await settleFiniteMotion('split focus and selection paint');
    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Select (V)"]')`);
    const lastMarker = await evaluate(page, `(() => {
      const groups = [...document.querySelectorAll(
        '.dude-review-overlay [data-annotation]'
      )];
      const group = groups.at(-1);
      const shape = group.querySelector('rect') || group;
      const rect = shape.getBoundingClientRect();
      const candidates = [[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75]];
      const point = candidates.map(([x,y]) => ({
        x:rect.left + rect.width * x,
        y:rect.top + rect.height * y,
      })).find(({x,y}) => document.elementFromPoint(x,y)?.closest('[data-annotation]') === group);
      return {
        id:group.getAttribute('data-annotation'),
        count:groups.length,
        point:point || {x:rect.left + rect.width / 2,y:rect.top + rect.height / 2},
      };
    })()`);
    assert.equal(lastMarker.count, 14);
    await page.send('Input.dispatchMouseEvent', {
      type:'mousePressed', ...lastMarker.point,
      button:'left',buttons:1,clickCount:1,
    });
    await page.send('Input.dispatchMouseEvent', {
      type:'mouseReleased', ...lastMarker.point,
      button:'left',buttons:0,clickCount:1,
    });
    await clickAtCurrentPosition(page, comments(14));
    await settleFiniteMotion('mock-selection comments drawer motion');
    const markerReveal = await until(async () => {
      const value = await reviewSelectionSnapshot(page);
      const selected = value.rows?.find(row => row.ariaCurrent === 'true');
      return selected?.id === lastMarker.id && selected.fullyVisible ? value : null;
    }, 'mock-selected last marker revealed in the list');
    assert.ok(markerReveal.list.scrollTop > 0);
    assert.equal(markerReveal.rows.find(row => row.ariaCurrent === 'true').index, 13);
    observations.markerReveal = {lastMarker,snapshot:markerReveal};

    // Put native keyboard focus on the adjacent unselected row. Selection must
    // retain its shape/fill while Fluent's focus ring moves independently.
    await clickAtCurrentPosition(page, `[...document.querySelectorAll(
      '[data-annotation-id]'
    )].find(node => node.getAttribute('data-annotation-id') === ${JSON.stringify(lastMarker.id)})`);
    await pressNavigationKey(page, 'ArrowUp');
    await until(() => evaluate(page, `(() => {
      const rows=[...document.querySelectorAll('[data-annotation-id]')];
      return rows.indexOf(document.activeElement) === 12
        && rows[13].getAttribute('aria-current') === 'true';
    })()`), 'focus on row 13 while row 14 remains selected');
    await settleFiniteMotion('responsive sweep initial focus paint');
    const distinct = await reviewSelectionSnapshot(page);
    assertSelectionVisual(
      distinct,
      13,
      'selected row 14 remains visibly distinct from keyboard focus on row 13',
    );
    assert.deepEqual(
      distinct.overlayNumerals.map((entry, index) => entry.numerals),
      Array.from({length:14}, (_value, index) => [String(index + 1)]),
      'every shape has exactly one Sharpie-style numeral',
    );

    // Delete, undo, and redo must not leave a current-item marker describing an
    // annotation that history no longer selects. A later switch and reopen must
    // produce exactly one marker for the current row.
    await click(page, button('Delete annotation'));
    await until(async () => (await commentCount()) === 13, 'selected row deleted');
    const afterDelete = await reviewSelectionSnapshot(page);
    assertClearedSelection(afterDelete, 13, 'Delete');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await settleFiniteMotion('Delete drawer close motion');
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`),
      'Delete drawer closed before Undo');
    await revealFloatingTool(page, 'Undo annotation');
    await clickAtCurrentPosition(page, `document.querySelector(
      '[data-review-tools] [aria-label="Undo annotation"]'
    )`);
    await until(async () => (await commentCount()) === 14, 'Delete undo');
    await clickAtCurrentPosition(page, comments(14));
    await settleFiniteMotion('Delete-undo comments drawer motion');
    const afterUndo = await reviewSelectionSnapshot(page);
    assertClearedSelection(afterUndo, 14, 'undo');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await settleFiniteMotion('Delete-undo drawer close motion');
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`),
      'Delete-undo drawer closed before Redo');
    await revealFloatingTool(page, 'Redo annotation');
    await clickAtCurrentPosition(page, `document.querySelector(
      '[data-review-tools] [aria-label="Redo annotation"]'
    )`);
    await until(async () => (await commentCount()) === 13, 'Delete redo');
    await clickAtCurrentPosition(page, comments(13));
    await settleFiniteMotion('Delete-redo comments drawer motion');
    const afterRedo = await reviewSelectionSnapshot(page);
    assertClearedSelection(afterRedo, 13, 'redo');
    await browseAnnotationListToTop();
    await clickAtCurrentPosition(page, `document.querySelectorAll('[data-annotation-id]')[0]`);
    await until(() => evaluate(page, `document.querySelectorAll(
      '[data-annotation-id]'
    )[0].getAttribute('aria-current') === 'true'`), 'first surviving row selection');
    const switchedFirst = await reviewSelectionSnapshot(page);
    await clickAtCurrentPosition(page, `document.querySelectorAll('[data-annotation-id]')[1]`);
    await until(() => evaluate(page, `document.querySelectorAll(
      '[data-annotation-id]'
    )[1].getAttribute('aria-current') === 'true'`), 'second surviving row selection');
    const switchedSecond = await reviewSelectionSnapshot(page);
    const firstId = switchedFirst.rows.find(row => row.ariaCurrent === 'true')?.id;
    const secondId = switchedSecond.rows.find(row => row.ariaCurrent === 'true')?.id;
    assert.notEqual(firstId, secondId);
    assert.equal(switchedFirst.rows.filter(row => row.pseudos.some(pseudo => pseudo.visible)).length, 1);
    assert.equal(switchedSecond.rows.filter(row => row.pseudos.some(pseudo => pseudo.visible)).length, 1);
    await clickAtCurrentPosition(page, `document.querySelector('[data-review-comments-done]')`);
    await settleFiniteMotion('selection-history Done close motion');
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')
      && document.activeElement === (${comments(13)})`),
    'Done returns native focus to Comments (13)');
    await clickAtCurrentPosition(page, comments(13));
    await settleFiniteMotion('selection-reopen comments drawer motion');
    const afterReopen = await reviewSelectionSnapshot(page);
    assert.deepEqual(
      afterReopen.rows.filter(row => row.ariaCurrent === 'true').map(row => row.id),
      [secondId],
      'close and reopen retains exactly the selected surviving row',
    );
    assert.deepEqual(
      afterReopen.rows.filter(row => row.pseudos.some(pseudo => pseudo.visible)).map(row => row.id),
      [secondId],
      'close and reopen retains exactly one matching visual marker',
    );
    observations.selectionHistory = {
      afterDelete,afterUndo,afterRedo,switchedFirst,switchedSecond,afterReopen,
    };

    // Native geometry editing and a backward caret range exercise the same
    // selected box. Closing and reopening the modal drawer must preserve both
    // the range and the already-pinned frame without staling Review.
    await clickAtCurrentPosition(page, `document.querySelectorAll('[data-annotation-id]')[0]`);
    await until(() => evaluate(page, `Boolean(${field('X1')})`), 'box geometry editor');
    const geometryBefore = await evaluate(page, `({
      x1:${field('X1')}.value,
      y1:${field('Y1')}.value,
    })`);
    await click(page, field('X1'));
    await nativeSelectAll(field('X1'));
    await page.send('Input.insertText', {text:'111'});
    await pressNavigationKey(page, 'Tab');
    await until(() => workingState()?.annotations?.[0]?.x1 === 111,
      'native X1 edit persisted');
    const geometryAfter = await evaluate(page, `({
      x1:${field('X1')}.value,
      y1:${field('Y1')}.value,
    })`);
    assert.equal(geometryAfter.x1, '111');
    assert.equal(geometryAfter.y1, geometryBefore.y1);
    const caretText = '0123456789012345678901234567890123456789 selected box comment';
    await click(page, field('Comment (optional)'));
    await page.send('Input.insertText', {text:caretText});
    await until(() => evaluate(page, `${field('Comment (optional)')}.value === ${JSON.stringify(caretText)}`),
      'native comment text entered');
    await nativeSelectAll(field('Comment (optional)'));
    assert.deepEqual(
      await evaluate(page, `({
        start:${field('Comment (optional)')}.selectionStart,
        end:${field('Comment (optional)')}.selectionEnd,
      })`),
      {start:0,end:caretText.length},
      'native triple click selects the one-paragraph textarea contents',
    );
    await pressNavigationKey(page, 'ArrowLeft');
    assert.deepEqual(
      await evaluate(page, `({
        start:${field('Comment (optional)')}.selectionStart,
        end:${field('Comment (optional)')}.selectionEnd,
      })`),
      {start:0,end:0},
      'native Select All then ArrowLeft establishes the textarea start',
    );
    for (let step = 0; step < 36; step += 1) {
      await pressNavigationKey(page, 'ArrowRight');
    }
    await pressNavigationKey(page, 'ArrowLeft', 'ArrowLeft', 8);
    await pressNavigationKey(page, 'ArrowLeft', 'ArrowLeft', 8);
    const caretBefore = await evaluate(page, `({
      start:${field('Comment (optional)')}.selectionStart,
      end:${field('Comment (optional)')}.selectionEnd,
      direction:${field('Comment (optional)')}.selectionDirection,
    })`);
    assert.deepEqual(caretBefore, {start:34,end:36,direction:'backward'});
    await until(() => {
      const caret = workingState()?.caret;
      return caret?.start === 34 && caret?.end === 36 && caret?.direction === 'backward';
    }, 'native backward caret persisted');
    await until(() => evaluate(page, `${button('Save markup')}.matches('[aria-disabled="true"]')
      && ${describedText(button('Save markup'))}
        === 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'`),
    'geometry and comment autosave settled');
    const drawerBeforeClose = await reviewSelectionSnapshot(page);
    assert.deepEqual(drawerBeforeClose.badges, ['Not sent']);
    assert.equal(
      drawerBeforeClose.status,
      'Comment kept on annotation 1. Markup saved.',
    );
    assert.deepEqual(drawerBeforeClose.done, {
      text:'Done',
      title:'Close this list. Comments stay on their annotations. Sending them is a separate action.',
    });
    assert.equal(
      drawerBeforeClose.closeTitle,
      'Close this list. Your comments stay on their annotations.',
    );
    assert.equal(drawerBeforeClose.reviewBadge, 'Review');
    await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Close comments"]')`);
    await settleFiniteMotion('caret X close motion');
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`),
      'native X close after backward caret');
    const frameAfterClose = await frameSnapshot();
    await clickAtCurrentPosition(page, comments(13));
    await settleFiniteMotion('caret-reopen comments drawer motion');
    const drawerAfterReopen = await until(async () => {
      const value = await reviewSelectionSnapshot(page);
      return value.editor?.focused ? value : null;
    }, 'reopened selected field receives native-restored focus');
    const caretAfter = {
      start:drawerAfterReopen.editor.selectionStart,
      end:drawerAfterReopen.editor.selectionEnd,
      direction:drawerAfterReopen.editor.selectionDirection,
    };
    assert.deepEqual(caretAfter, caretBefore);
    assert.deepEqual(
      [frameClosed, drawerBeforeClose.frame, frameAfterClose, drawerAfterReopen.frame]
        .map(frame => ({
          rect:frame.rect,clientWidth:frame.clientWidth,clientHeight:frame.clientHeight,
          offsetWidth:frame.offsetWidth,offsetHeight:frame.offsetHeight,
          inlineWidth:frame.inlineWidth,inlineHeight:frame.inlineHeight,viewBox:frame.viewBox,
        })),
      [frameClosed, frameClosed, frameClosed, frameClosed]
        .map(frame => ({
          rect:frame.rect,clientWidth:frame.clientWidth,clientHeight:frame.clientHeight,
          offsetWidth:frame.offsetWidth,offsetHeight:frame.offsetHeight,
          inlineWidth:frame.inlineWidth,inlineHeight:frame.inlineHeight,viewBox:frame.viewBox,
        })),
      'fresh frame geometry is identical closed, open, X-closed, and reopened',
    );
    assert.deepEqual(
      [frameClosed.badge, drawerBeforeClose.reviewBadge, frameAfterClose.badge,
        drawerAfterReopen.reviewBadge],
      ['Review','Review','Review','Review'],
      'drawer transitions never stale the reviewed frame',
    );
    await clickAtCurrentPosition(page, `document.querySelector('[data-review-comments-done]')`);
    await settleFiniteMotion('final Done close motion');
    await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')
      && document.activeElement === (${comments(13)})`),
    'final Done returns focus to Comments (13)');
    observations.caretAndFrame = {
      geometryBefore,geometryAfter,caretBefore,caretAfter,
      frameClosed,drawerBeforeClose,frameAfterClose,drawerAfterReopen,
    };

    // Reopen and separate focus from selection again before the responsive
    // light/dark sweep. DPR/theme identity changes later may intentionally mark
    // the source stale; the row visual contract must still describe retained
    // selection, while the fresh frame guarantee above remains separately pinned.
    await clickAtCurrentPosition(page, comments(13));
    await until(() => evaluate(page, `Boolean(document.querySelector(
      '[aria-label="Close comments"]'
    ))`), 'drawer for responsive selection sweep');
    await settleFiniteMotion('responsive comments drawer motion');
    await browseAnnotationListToTop();
    await clickAtCurrentPosition(page, `document.querySelectorAll('[data-annotation-id]')[0]`);
    await pressNavigationKey(page, 'ArrowDown');
    await until(() => evaluate(page, `(() => {
      const rows=[...document.querySelectorAll('[data-annotation-id]')];
      return rows.indexOf(document.activeElement) === 1
        && rows[0].getAttribute('aria-current') === 'true';
    })()`), 'responsive sweep starts with focus and selection on different rows');
    await settleFiniteMotion('responsive sweep initial focus paint');

    const sweepCases = [
      {width:1000,height:400,dpr:2},
      {width:780,height:900,dpr:2},
      {width:360,height:900,dpr:1},
      {width:768,height:900,dpr:1},
      {width:1440,height:900,dpr:1},
    ];
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      for (const size of sweepCases) {
        await viewport(page, size.width, theme, size.height, size.dpr);
        await until(() => evaluate(page, `Boolean(document.querySelector(
          '[aria-label="Close comments"]'
        ))`), `${size.width}x${size.height} ${theme} comments drawer`);
        const currentFocus = await evaluate(page, `(() => {
          const rows=[...document.querySelectorAll('[data-annotation-id]')];
          return {
            focused:rows.indexOf(document.activeElement),
            selected:rows.findIndex(row => row.getAttribute('aria-current') === 'true'),
          };
        })()`);
        if (currentFocus.focused !== 1 || currentFocus.selected !== 0) {
          await clickAtCurrentPosition(page, `document.querySelectorAll('[data-annotation-id]')[0]`);
          await pressNavigationKey(page, 'ArrowDown');
          await until(() => evaluate(page, `(() => {
            const rows=[...document.querySelectorAll('[data-annotation-id]')];
            return rows.indexOf(document.activeElement) === 1
              && rows[0].getAttribute('aria-current') === 'true';
          })()`), `${size.width}x${size.height} ${theme} split focus`);
        }
        await settleFiniteMotion(`${size.width}x${size.height} ${theme} focus paint`);
        const snapshot = await reviewSelectionSnapshot(page);
        const visualFindings = selectionVisualFindings(snapshot, 0);
        assertSelectionVisual(
          snapshot,
          0,
          `${size.width}x${size.height} DPR${size.dpr} ${theme} selection is visible and distinct from focus`,
        );
        assert.ok(snapshot.documentOverflow.scrollWidth
          <= snapshot.documentOverflow.clientWidth + 1,
        `${size.width}x${size.height} ${theme} has no horizontal document overflow`);
        assert.deepEqual(
          snapshot.rows.map((row, index) => ({
            aria:Number(row.ariaLabel.match(/^Annotation (\d+):/)?.[1]),
            text:Number(row.text.match(/^(\d+)\./)?.[1]),
            expected:index + 1,
          })).filter(item => item.aria !== item.expected || item.text !== item.expected),
          [],
          `${size.width}x${size.height} ${theme} list numbering remains one ordered numeral per row`,
        );
        const screenshot = await capture(
          `selection-save-${size.width}x${size.height}-dpr${size.dpr}-${theme}`,
        );
        const result = {...size,theme,snapshot,visualFindings,screenshot};
        observations.responsive.push(result);
      }
    }

    // Falsification now perturbs the rendered product, recollects through
    // reviewSelectionSnapshot(), and invokes the same owning assertion as the
    // responsive sweep. Snapshot copies are not accepted as paint evidence.
    const visualFalsifications = [];
    const falsifyLiveVisual = async (name, mutate, restore, screenshot = false) => {
      await mutate();
      try {
        await settleFocusPaint(page);
        const candidate = await reviewSelectionSnapshot(page);
        const findings = selectionVisualFindings(candidate, 0);
        assert.throws(
          () => assertSelectionVisual(candidate, 0, `live visual mutation: ${name}`),
          /live visual mutation/,
          `${name} must make the owning selection assertion fail`,
        );
        assert.ok(findings.length > 0, `${name} produces a concrete visual finding`);
        visualFalsifications.push({
          name,
          findings,
          selected:candidate.rows.find(row => row.ariaCurrent === 'true') ?? null,
          ...(screenshot ? {screenshot:await capture(`selection-falsifier-${name.replaceAll(' ', '-')}`)} : {}),
        });
      } finally {
        await restore();
        await settleFocusPaint(page);
      }
      assertSelectionVisual(
        await reviewSelectionSnapshot(page),
        0,
        `live selection paint restored after ${name}`,
      );
    };
    await falsifyLiveVisual(
      'empty list',
      () => evaluate(page, `(() => {
        window.__t012UnidentifiedRows = [...document.querySelectorAll('[data-annotation-id]')]
          .map(node => ({node,id:node.getAttribute('data-annotation-id')}));
        for (const {node} of window.__t012UnidentifiedRows) {
          node.removeAttribute('data-annotation-id');
        }
      })()`),
      () => evaluate(page, `(() => {
        for (const {node,id} of window.__t012UnidentifiedRows) {
          node.setAttribute('data-annotation-id', id);
        }
        delete window.__t012UnidentifiedRows;
      })()`),
    );
    await falsifyLiveVisual(
      'opacity-zero selection marker',
      () => evaluate(page, `(() => {
        const selected = document.querySelector('[data-annotation-id][aria-current="true"]');
        selected.setAttribute('data-t012-marker-opacity-zero', '');
        const style = document.createElement('style');
        style.dataset.t012MarkerMutation = 'opacity';
        style.textContent = '[data-t012-marker-opacity-zero]::after { opacity: 0 !important; }';
        document.head.append(style);
      })()`),
      () => evaluate(page, `(() => {
        document.querySelector('[data-t012-marker-opacity-zero]')
          ?.removeAttribute('data-t012-marker-opacity-zero');
        document.querySelector('style[data-t012-marker-mutation="opacity"]')?.remove();
      })()`),
      true,
    );
    await falsifyLiveVisual(
      'focus-selection conflation',
      async () => {
        await pressNavigationKey(page, 'ArrowUp');
        await until(() => evaluate(page, `(() => {
          const rows = [...document.querySelectorAll('[data-annotation-id]')];
          return rows.indexOf(document.activeElement) === 0
            && rows[0].getAttribute('aria-current') === 'true';
        })()`), 'live focus-selection conflation');
      },
      async () => {
        await pressNavigationKey(page, 'ArrowDown');
        await until(() => evaluate(page, `(() => {
          const rows = [...document.querySelectorAll('[data-annotation-id]')];
          return rows.indexOf(document.activeElement) === 1
            && rows[0].getAttribute('aria-current') === 'true';
        })()`), 'split focus restored after falsification');
      },
    );
    await falsifyLiveVisual(
      'offscreen selected row',
      () => evaluate(page, `(() => {
        const selected = document.querySelector('[data-annotation-id][aria-current="true"]');
        window.__t012SelectedTransform = {
          value:selected.style.getPropertyValue('transform'),
          priority:selected.style.getPropertyPriority('transform'),
        };
        selected.style.setProperty('transform', 'translateY(-2000px)', 'important');
      })()`),
      () => evaluate(page, `(() => {
        const selected = document.querySelector('[data-annotation-id][aria-current="true"]');
        const prior = window.__t012SelectedTransform;
        if (prior.value) selected.style.setProperty('transform', prior.value, prior.priority);
        else selected.style.removeProperty('transform');
        delete window.__t012SelectedTransform;
      })()`),
    );
    const markerBackground = await reviewSelectionSnapshot(page).then(snapshot => {
      const background = snapshot.rows.find(row => row.ariaCurrent === 'true')?.resolvedBackground;
      return `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`;
    });
    await falsifyLiveVisual(
      'low-contrast selection marker',
      () => evaluate(page, `(() => {
        const selected = document.querySelector('[data-annotation-id][aria-current="true"]');
        selected.setAttribute('data-t012-marker-low-contrast', '');
        const style = document.createElement('style');
        style.dataset.t012MarkerMutation = 'contrast';
        style.textContent = '[data-t012-marker-low-contrast]::after { background-color: ${markerBackground} !important; }';
        document.head.append(style);
      })()`),
      () => evaluate(page, `(() => {
        document.querySelector('[data-t012-marker-low-contrast]')
          ?.removeAttribute('data-t012-marker-low-contrast');
        document.querySelector('style[data-t012-marker-mutation="contrast"]')?.remove();
      })()`),
    );
    observations.oracleFalsification = {
      visual:visualFalsifications,
      save:saveOracleFalsifications,
      contrastExemption:contrastBoundaryFalsifications,
    };
    observations.nativeEvents = await evaluate(page, 'window.__t012NativeInput');
    assert.ok(observations.nativeEvents.some(event =>
      event.type === 'keydown' && event.key === 'Enter' && event.isTrusted
        && event.target === 'Save markup'),
    'browser received trusted native Enter on Save markup');
    assert.ok(observations.nativeEvents.some(event =>
      event.type === 'keydown' && event.key === ' ' && event.isTrusted
        && event.target === 'Save markup'),
    'browser received trusted native Space on Save markup');
    assert.ok(observations.nativeEvents.some(event =>
      event.type === 'pointerdown' && event.isTrusted && event.target === 'Save markup'),
    'browser received a trusted native pointer press on Save markup');
    assert.deepEqual(runtimeErrors, []);
    writeEvidenceJson(output, 'selection-save.metrics', observations);
  } finally {
    if (publication) {
      publication.controller.abort();
      await publication.result.catch(() => {});
    }
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    if (fixture) await fixture.close();
    board.close();
  }
});

test('T012 review regression: double-click opens an annotation comment while drawing, dragging, and empty space stay unchanged', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-open-comment');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  const runtimeErrors = [];
  const observations = {
    convention: {
      open: 'Explorer, mail lists, and drawing tools all open the item under a double-click; Enter opens the selected one.',
      badge: 'A numbered annotation badge belongs to the mark it labels, as a PDF review pin does, so pressing the number presses that mark.',
      face: 'A drawn rectangle answers to its whole face like its highlight sibling; topmost-first keeps a later drawing inside an earlier one selectable.',
      pinned: 'The reviewed viewport is pinned, so revealing a comment must not move, resize, or scroll the mock.',
    },
    face: null,
    badge: null,
    doubleClick: null,
    shape: null,
    keyboard: null,
    emptySpace: null,
    gestureBounds: null,
    drawing: null,
    precedence: null,
    dragAndResize: null,
    dragPriming: null,
    commentField: null,
    commentPin: null,
    pickerAndKeyboard: null,
    accessibility: null,
    frame: null,
    runtimeErrors,
  };
  context.after(() => writeEvidenceJson(output, 'open-comment.metrics', observations));
  try {
    // Arrange: one disposable provider root, a plain review fixture, and an
    // owned browser profile. No user review directory is a fixture.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-open-comment-'));
    const feature = createIdea(
      root,
      903,
      'open-comment-regression',
      'defined',
      '# Tasks\n\n- [x] T001@dddddddd Closed fixture remains review-eligible.\n',
    );
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Comment on the marked regions of this mock.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(2, true);
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    await viewport(page, 1000, 'light', 900, 2);
    await page.send('Page.navigate', {url:fixture.instance.url});
    await visible(page, 'Connected');
    await choose(page, 'Show', 'Closed');
    await visible(page, '1 of 1 recorded ideas and features');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Defined feature');
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Box (B)"]').disabled`),
    'open-comment Review engine', 60_000);

    const tool = label => `document.querySelector('[data-review-tools] [aria-label="${label}"]')`;
    const workingFile = () => {
      const reviews = path.join(
        root,
        ...path.posix.dirname(feature.specPath).split('/'),
        'reviews',
      );
      if (!fs.existsSync(reviews)) return null;
      const submission = fs.readdirSync(reviews).find(name =>
        fs.existsSync(path.join(reviews, name, 'working.json')));
      return submission ? path.join(reviews, submission, 'working.json') : null;
    };
    const workingState = () => {
      const file = workingFile();
      return file ? JSON.parse(fs.readFileSync(file, 'utf8')).state : null;
    };
    const frameSnapshot = () => evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      const overlay = document.querySelector('.dude-review-overlay');
      const box = frame.getBoundingClientRect();
      return {
        rect:{top:box.top,left:box.left,width:box.width,height:box.height},
        clientWidth:frame.clientWidth,clientHeight:frame.clientHeight,
        viewBox:overlay.getAttribute('viewBox'),
      };
    })()`);
    const frame = await frameSnapshot();
    assert.ok(frame.clientWidth >= 900 && frame.clientHeight >= 360,
      `the reviewed frame must hold the marked regions: ${JSON.stringify(frame)}`);
    const descriptions = await evaluate(page, `(() => {
      const root = document.querySelector('.dude-review-engine');
      const overlay = document.querySelector('.dude-review-overlay');
      return {
        root:{
          role:root?.getAttribute('role') || null,
          name:root?.getAttribute('aria-label') || null,
          description:root?.getAttribute('aria-description') || null,
        },
        overlay:{
          role:overlay?.getAttribute('role') || null,
          name:overlay?.getAttribute('aria-label') || null,
          description:overlay?.getAttribute('aria-description') || null,
        },
      };
    })()`);
    assert.deepEqual(descriptions, {
      root:{
        role:'region',
        name:'Review viewport',
        description:'Use arrow keys to pan when the panel is smaller than the recorded mock. Scrolling on the mock scrolls its content instead.',
      },
      overlay:{
        role:'group',
        name:'Reviewed HTML document. Use drawing tools or Choose an element to annotate.',
        description:'With the Select tool, double-click an annotation or its number to write its comment. With a drawing tool, the selected annotation keeps its handles for resizing and its border for moving, and two presses on that border write its comment. With the Comment tool, press a pin you already placed to select it, drag it to move it, and press it twice to write its comment, while a press anywhere else places another pin. Enter does the same for the selected annotation.',
      },
    }, 'pan and annotation-open instructions remain on their separate accessible surfaces');
    const descriptionTree = await page.send('Accessibility.getFullAXTree');
    const describedSurface = name => descriptionTree.nodes.filter(node =>
      !node.ignored && node.name?.value === name).map(node => ({
        role:node.role?.value ?? null,
        description:node.description?.value ?? null,
      }));
    assert.deepEqual(describedSurface('Review viewport'), [{
      role:'region',
      description:descriptions.root.description,
    }], 'the native accessibility tree exposes only the root pan instruction on Review viewport');
    assert.deepEqual(
      describedSurface('Reviewed HTML document. Use drawing tools or Choose an element to annotate.'),
      [{role:'group',description:descriptions.overlay.description}],
      'the native accessibility tree exposes both open gestures only on the reviewed document',
    );
    observations.accessibility = {
      dom:descriptions,
      ax:{
        root:describedSurface('Review viewport'),
        overlay:describedSurface('Reviewed HTML document. Use drawing tools or Choose an element to annotate.'),
      },
    };
    // Every mock point is proved to land on the annotation overlay before it
    // is pressed, so no assertion rests on a guess about where the floating
    // palette, a disclosure, or the mock's own content sits.
    const at = async (x, y) => {
      const point = {x:frame.rect.left + x, y:frame.rect.top + y};
      assert.equal(await evaluate(page, `Boolean(document.elementFromPoint(${point.x}, ${point.y})
        ?.closest('.dude-review-overlay'))`), true,
      `mock point ${x},${y} must land on the reviewed overlay`);
      return point;
    };
    const dragMouse = async (from, to, steps = 6) => {
      await page.send('Input.dispatchMouseEvent', {type:'mouseMoved', ...from});
      await page.send('Input.dispatchMouseEvent', {
        type:'mousePressed', ...from, button:'left', buttons:1, clickCount:1,
      });
      for (let step = 1; step <= steps; step += 1) {
        await page.send('Input.dispatchMouseEvent', {
          type:'mouseMoved',
          x:from.x + (to.x - from.x) * step / steps,
          y:from.y + (to.y - from.y) * step / steps,
          button:'left',
          buttons:1,
        });
      }
      await page.send('Input.dispatchMouseEvent', {
        type:'mouseReleased', ...to, button:'left', buttons:0, clickCount:1,
      });
    };
    const clickMouse = async (point, clicks = 1) => {
      await page.send('Input.dispatchMouseEvent', {type:'mouseMoved', x:point.x, y:point.y});
      for (let clickCount = 1; clickCount <= clicks; clickCount += 1) {
        await page.send('Input.dispatchMouseEvent', {
          type:'mousePressed', x:point.x, y:point.y, button:'left', buttons:1, clickCount,
        });
        await page.send('Input.dispatchMouseEvent', {
          type:'mouseReleased', x:point.x, y:point.y, button:'left', buttons:0, clickCount,
        });
      }
    };
    await evaluate(page, `(() => {
      window.__t012OpenCommentPresses = [];
      document.addEventListener('pointerdown', event => {
        if (!event.isTrusted || !event.target.closest?.('.dude-review-overlay')) return;
        window.__t012OpenCommentPresses.push({
          at:event.timeStamp,
          x:event.clientX,
          y:event.clientY,
          annotation:event.target.closest('g[data-annotation]')?.dataset.annotation || null,
        });
      }, {capture:true});
    })()`);
    const pressCount = () => evaluate(page, 'window.__t012OpenCommentPresses.length');
    const pressesSince = start => evaluate(page,
      `window.__t012OpenCommentPresses.slice(${start})`);
    const pairMetrics = presses => ({
      count:presses.length,
      elapsed:presses.length === 2 ? presses[1].at - presses[0].at : null,
      distance:presses.length === 2
        ? Math.hypot(presses[1].x - presses[0].x, presses[1].y - presses[0].y) : null,
      annotations:presses.map(press => press.annotation),
    });
    const settle = () => evaluate(page,
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const separate = () => new Promise(resolve => setTimeout(resolve, 650));
    // The engine refreshes its unpinned view whenever the stage reflows, and an
    // admission that races that refresh is superseded rather than drawn. Wait
    // for saved, still chrome before each drawing gesture, the way the rest of
    // this suite waits for autosave before its next annotation.
    const quiet = async label => {
      await until(() => evaluate(page, `Boolean(${button('Save markup')}?.matches('[aria-disabled="true"]'))`),
        `saved markup before ${label}`);
      let prior = null;
      let stable = 0;
      await until(async () => {
        const now = JSON.stringify(await frameSnapshot());
        stable = now === prior ? stable + 1 : 0;
        prior = now;
        return stable >= 3;
      }, `stable reviewed frame before ${label}`);
    };
    const commentsOpen = () => evaluate(page,
      `Boolean(document.querySelector('[aria-label="Close comments"]'))`);
    const closeComments = async label => {
      await clickAtCurrentPosition(page, `document.querySelector('[data-review-comments-done]')`);
      await until(async () => !await commentsOpen(), `Comments closed after ${label}`);
      await settle();
    };
    const markedRow = () => evaluate(page, `document.querySelector(
      '[data-annotation-id][aria-current="true"]'
    )?.dataset.annotationId ?? null`);
    const focusedComment = () => evaluate(page, `(() => {
      const node = ${field('Comment (optional)')};
      return Boolean(node) && !node.disabled && document.activeElement === node;
    })()`);
    const resetPress = async label => {
      assert.ok(workingState()?.selectedId,
        `${label} starts with a selected marker so the empty press has an observable result`);
      await clickMouse(await at(760, 330));
      await until(() => workingState()?.selectedId === null,
        `empty-space reset before ${label}`);
      await settle();
      assert.equal(await commentsOpen(), false, `${label} starts with Comments closed`);
    };
    // Press the number a reviewer actually sees: the painted disc, read from
    // the overlay rather than recomputed, and away from the shape it labels so
    // neither that shape's face nor its tolerance can be the answer.
    const numberPoint = number => evaluate(page, `(() => {
      const label = [...document.querySelectorAll('.dude-review-overlay g[data-annotation] text')]
        .find(node => node.textContent.trim() === '${number}');
      if (!label) return null;
      const group = label.closest('g[data-annotation]');
      const disc = group.querySelector('circle');
      const shape = group.querySelector('rect');
      const badge = disc.getBoundingClientRect();
      const painted = shape.getBoundingClientRect();
      const point = {x:badge.left + badge.width * 0.3, y:badge.top + badge.height * 0.3};
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        ...point,
        id:group.dataset.annotation,
        number:label.textContent.trim(),
        onBadge:hit === disc || hit === label,
        gap:{x:painted.left - point.x, y:painted.top - point.y},
      };
    })()`);

    // Act: draw one wide box, then a smaller one wholly inside it, so the face
    // rule and its topmost-first precedence are both exercised.
    await revealFloatingTool(page, 'Box (B)');
    await clickAtCurrentPosition(page, tool('Box (B)'));
    await quiet('the outer box');
    await dragMouse(await at(160, 90), await at(520, 300));
    await until(() => workingState()?.annotations?.length === 1, 'outer box autosaved');
    await quiet('the inner box');
    await dragMouse(await at(380, 200), await at(470, 280));
    await until(() => workingState()?.annotations?.length === 2, 'inner box autosaved');
    const [outer, inner] = workingState().annotations.map(item => item.id);
    assert.deepEqual(
      workingState().annotations.map(item => ({
        selector:item.element?.selector ?? null,
        scrollBasis:Array.isArray(item.scrollBasis),
      })),
      [
        {selector:'main',scrollBasis:true},
        {selector:'main',scrollBasis:true},
      ],
      'pointer-created boxes still retain their inspected element anchors',
    );
    const pinnedFrame = await frameSnapshot();
    assert.deepEqual(
      {
        ...pinnedFrame,
        rect:{...pinnedFrame.rect,height:frame.rect.height},
      },
      frame,
      'admitting the boxes retains the exact client geometry, origin, width, and viewBox',
    );
    assert.equal(frame.rect.height, frame.clientHeight - 0.5,
      'the unpinned flex frame begins on the observed half-pixel outer edge');
    assert.equal(pinnedFrame.rect.height, pinnedFrame.clientHeight,
      'pinning resolves only that outer half-pixel edge to the validated client height');
    assert.equal(await evaluate(page,
      `document.querySelector('.dude-review-frame').classList.contains('dude-review-frame-pinned')`),
    true, 'the reviewed frame is pinned before a comment can be revealed');

    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    await until(() => workingState()?.tool === 'select', 'select tool chosen');

    // Assert: a rectangle answers to its whole face, and the drawing made
    // inside it still takes its own press.
    await clickMouse(await at(240, 150));
    await until(() => workingState()?.selectedId === outer,
      'a press inside the outer box selects it');
    await clickMouse(await at(425, 240));
    await until(() => workingState()?.selectedId === inner,
      'a press inside both boxes selects the one drawn last');
    observations.face = {outer, inner, selected:workingState().selectedId};

    // Assert: the painted number selects the annotation it labels.
    const badge = await numberPoint(1);
    assert.equal(badge?.id, outer, 'annotation 1 paints its number for the outer box');
    assert.equal(badge.onBadge, true, 'the press lands on the painted number itself');
    assert.ok(badge.gap.x > 8 && badge.gap.y > 8,
      `the number sits beyond the shape face and its tolerance: ${JSON.stringify(badge.gap)}`);
    await clickMouse(badge);
    await until(() => workingState()?.selectedId === outer,
      'pressing the number selects its annotation');
    observations.badge = badge;

    // Assert: double-clicking that number opens its comment, ready to type.
    assert.equal(await commentsOpen(), false, 'Comments is closed before the gesture');
    await resetPress('the exact two-press badge gesture');
    const badgePressStart = await pressCount();
    await clickMouse(badge, 2);
    const badgePresses = pairMetrics(await pressesSince(badgePressStart));
    assert.equal(badgePresses.count, 2, 'the badge gesture contains exactly two trusted presses');
    assert.ok(badgePresses.elapsed >= 0 && badgePresses.elapsed <= 500,
      `the badge presses stay inside 500 ms: ${JSON.stringify(badgePresses)}`);
    assert.ok(badgePresses.distance <= 4,
      `the badge presses stay inside 4 px: ${JSON.stringify(badgePresses)}`);
    assert.deepEqual(badgePresses.annotations, [outer, outer],
      'both trusted presses land on the painted badge for the outer annotation');
    await until(async () => await commentsOpen() && await focusedComment(),
      'double-clicking the number opens its focused comment field');
    assert.equal(await markedRow(), outer, 'the opened comment belongs to the pressed annotation');
    assert.deepEqual(await frameSnapshot(), pinnedFrame,
      'opening Comments from the number does not transiently move the pinned frame');
    await page.send('Input.insertText', {text:'Opened from the number.'});
    await until(() => workingState()?.annotations
      .find(item => item.id === outer)?.comment === 'Opened from the number.',
    'typing lands on the double-clicked annotation');
    assert.equal(workingState().annotations.find(item => item.id === inner).comment, '',
      'typing into the focused outer field does not change the other annotation');
    observations.doubleClick = {
      id:outer,
      comment:workingState().annotations.find(item => item.id === outer).comment,
      presses:badgePresses,
      frame:await frameSnapshot(),
    };
    await closeComments('the number gesture');

    // Assert: the same gesture on the shape itself opens that shape's comment.
    await resetPress('the exact two-press shape gesture');
    const shapePoint = await at(425, 240);
    const shapePressStart = await pressCount();
    await clickMouse(shapePoint, 2);
    const shapePresses = pairMetrics(await pressesSince(shapePressStart));
    assert.equal(shapePresses.count, 2, 'the shape gesture contains exactly two trusted presses');
    assert.ok(shapePresses.elapsed >= 0 && shapePresses.elapsed <= 500,
      `the shape presses stay inside 500 ms: ${JSON.stringify(shapePresses)}`);
    assert.ok(shapePresses.distance <= 4,
      `the shape presses stay inside 4 px: ${JSON.stringify(shapePresses)}`);
    await until(async () => await commentsOpen() && await focusedComment(),
      'double-clicking a shape opens its focused comment field');
    assert.equal(await markedRow(), inner, 'the inner shape owns the opened comment');
    assert.deepEqual(await frameSnapshot(), pinnedFrame,
      'opening Comments from the shape does not transiently move the pinned frame');
    await until(() => workingState()?.selectedId === inner,
      'the shape gesture selection reaches the persisted working state');
    observations.shape = {
      id:inner,
      marked:await markedRow(),
      presses:shapePresses,
      frame:await frameSnapshot(),
    };
    await closeComments('the shape gesture');

    // Assert: Enter on the focused mock is the keyboard twin of that gesture.
    await evaluate(page, `document.querySelector('.dude-review-overlay').focus({preventScroll:true})`);
    await press(page, 'Enter');
    await until(async () => await commentsOpen() && await focusedComment(),
      'Enter opens the selected annotation comment');
    assert.equal(await markedRow(), inner, 'Enter opens the annotation that is selected');
    assert.deepEqual(await frameSnapshot(), pinnedFrame,
      'opening Comments from Enter does not transiently move the pinned frame');
    observations.keyboard = {
      marked:await markedRow(),
      selected:workingState().selectedId,
      frame:await frameSnapshot(),
    };
    await closeComments('the keyboard gesture');

    // Assert: empty mock space opens nothing.
    const empty = await at(760, 150);
    await clickMouse(empty, 2);
    await settle();
    await until(() => workingState()?.selectedId === null,
      'an empty-space press still clears the selection, exactly as one press always did');
    assert.equal(await commentsOpen(), false, 'double-clicking empty space opens no comment');
    assert.equal(workingState().annotations.length, 2, 'and adds no annotation');
    observations.emptySpace = {point:empty, selectedId:workingState().selectedId};

    // Assert: both heuristic bounds are real gates. A slow second press, a
    // nearby-but-not-4px press, and a fast press on another marker all retain
    // ordinary selection without opening Comments.
    const outerPoint = await at(240, 150);
    const slowStart = await pressCount();
    await clickMouse(outerPoint);
    await new Promise(resolve => setTimeout(resolve, 650));
    await clickMouse(outerPoint);
    const slowPresses = pairMetrics(await pressesSince(slowStart));
    assert.equal(slowPresses.count, 2);
    assert.ok(slowPresses.elapsed > 500,
      `the negative timing probe must cross 500 ms: ${JSON.stringify(slowPresses)}`);
    assert.ok(slowPresses.distance <= 4);
    await until(() => workingState()?.selectedId === outer,
      'slow presses retain ordinary marker selection');
    assert.equal(await commentsOpen(), false, 'a slow second press does not open Comments');

    await resetPress('the displaced same-marker presses');
    const displacedStart = await pressCount();
    await clickMouse(outerPoint);
    await clickMouse(await at(255, 150));
    const displacedPresses = pairMetrics(await pressesSince(displacedStart));
    assert.equal(displacedPresses.count, 2);
    assert.ok(displacedPresses.elapsed >= 0 && displacedPresses.elapsed <= 500,
      `the displaced presses must stay inside 500 ms: ${JSON.stringify(displacedPresses)}`);
    assert.ok(displacedPresses.distance > 4,
      `the negative distance probe must cross 4 px: ${JSON.stringify(displacedPresses)}`);
    await until(() => workingState()?.selectedId === outer,
      'displaced presses on the same marker retain ordinary selection');
    assert.equal(await commentsOpen(), false, 'presses farther than 4 px do not open Comments');

    await resetPress('the different-marker presses');
    const differentStart = await pressCount();
    await clickMouse(outerPoint);
    await clickMouse(shapePoint);
    const differentPresses = pairMetrics(await pressesSince(differentStart));
    assert.equal(differentPresses.count, 2);
    assert.ok(differentPresses.elapsed >= 0 && differentPresses.elapsed <= 500,
      `the different-marker presses must stay inside 500 ms: ${JSON.stringify(differentPresses)}`);
    assert.ok(differentPresses.distance > 4);
    await until(() => workingState()?.selectedId === inner,
      'the second ordinary press selects the different marker');
    assert.equal(await commentsOpen(), false, 'a fast press on a different marker does not open Comments');
    observations.gestureBounds = {
      slow:slowPresses,
      displaced:displacedPresses,
      different:{...differentPresses,selected:workingState().selectedId},
    };

    // Assert: a drawing tool keeps its own double-press, and still draws.
    await revealFloatingTool(page, 'Box (B)');
    await clickAtCurrentPosition(page, tool('Box (B)'));
    await until(() => workingState()?.tool === 'box', 'box tool restored for the drawing check');
    await clickMouse(await at(700, 240), 2);
    await settle();
    assert.equal(await commentsOpen(), false,
      'a drawing-tool double-press on empty space opens no comment');
    assert.equal(workingState().annotations.length, 2, 'and a zero-size double-press draws nothing');
    await dragMouse(await at(640, 60), await at(860, 160));
    await until(() => workingState()?.annotations?.length === 3,
      'drawing still works immediately after a double-press');
    // That new box stays selected, and its corner handle now answers to a
    // drawing-mode press. Clear the selection through the existing tools so the
    // two overlapping badges can still be arranged from the same coordinates.
    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    await until(() => workingState()?.tool === 'select',
      'select tool chosen to clear the selection before the badge fixture');
    await clickMouse(await at(760, 330));
    await until(() => workingState()?.selectedId === null,
      'no annotation is selected while the overlapping-badge fixture is drawn');
    await revealFloatingTool(page, 'Box (B)');
    await clickAtCurrentPosition(page, tool('Box (B)'));
    await until(() => workingState()?.tool === 'box', 'box tool re-armed for the second nearby box');
    await settle();
    await dragMouse(await at(644, 64), await at(820, 145));
    await until(() => workingState()?.annotations?.length === 4,
      'a second nearby box supplies two genuinely overlapping badge discs');
    const [, , badgeUnder, badgeOver] = workingState().annotations.map(item => item.id);
    observations.drawing = {annotations:workingState().annotations.length};

    // Assert: where two badge discs overlap away from either box face, the
    // later painted annotation wins the same topmost-first scan as shapes.
    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    await until(() => workingState()?.tool === 'select', 'select tool restored for the drag check');
    await clickMouse(outerPoint);
    await until(() => workingState()?.selectedId === outer,
      'a different annotation is selected before the overlapping badge press');
    const overlappingBadges = await evaluate(page, `(() => {
      const groups = [...document.querySelectorAll('.dude-review-overlay g[data-annotation]')];
      const read = id => {
        const group = groups.find(node => node.dataset.annotation === id);
        const disc = group?.querySelector('circle');
        const shape = group?.querySelector('rect');
        if (!group || !disc || !shape) return null;
        const badge = disc.getBoundingClientRect();
        const face = shape.getBoundingClientRect();
        return {
          id,
          center:{x:badge.left + badge.width / 2,y:badge.top + badge.height / 2},
          radius:Math.max(badge.width, badge.height) / 2,
          face:{left:face.left,top:face.top,right:face.right,bottom:face.bottom},
        };
      };
      const under = read(${JSON.stringify(badgeUnder)});
      const over = read(${JSON.stringify(badgeOver)});
      if (!under || !over) return null;
      const point = {
        x:Math.min(under.center.x, over.center.x) - 2,
        y:Math.min(under.center.y, over.center.y) - 2,
      };
      const describe = badge => ({
        ...badge,
        distance:Math.hypot(point.x - badge.center.x, point.y - badge.center.y),
        shapeAnswers:point.x >= badge.face.left - 8 && point.x <= badge.face.right + 8
          && point.y >= badge.face.top - 8 && point.y <= badge.face.bottom + 8,
      });
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        ...point,
        badges:[describe(under),describe(over)],
        paintedAnnotation:hit?.closest('g[data-annotation]')?.dataset.annotation || null,
      };
    })()`);
    assert.ok(overlappingBadges, 'both nearby boxes paint numbered badge discs');
    for (const badgeMetric of overlappingBadges.badges) {
      assert.ok(badgeMetric.distance <= badgeMetric.radius,
        `the probe is inside both painted badge discs: ${JSON.stringify(badgeMetric)}`);
      assert.equal(badgeMetric.shapeAnswers, false,
        `the badge probe is outside box ${badgeMetric.id} and its 8 px shape tolerance`);
    }
    assert.equal(overlappingBadges.paintedAnnotation, badgeOver,
      'the later annotation is visibly on top where the badge discs overlap');
    await clickMouse(overlappingBadges);
    await until(() => workingState()?.selectedId === badgeOver,
      'the topmost overlapping badge selects the annotation painted on top');
    assert.equal(await commentsOpen(), false, 'one overlapping-badge press does not open Comments');
    observations.precedence = {badges:overlappingBadges,selected:workingState().selectedId};

    // Assert: a drag beginning on the qualifying second press still moves the
    // annotation and never reveals Comments.
    await resetPress('the second-press drag');
    const before = workingState().annotations.find(item => item.id === inner);
    const secondDragStart = await pressCount();
    await clickMouse(shapePoint);
    await dragMouse(shapePoint, await at(465, 260));
    const secondDragPresses = pairMetrics(await pressesSince(secondDragStart));
    assert.equal(secondDragPresses.count, 2);
    assert.ok(secondDragPresses.elapsed >= 0 && secondDragPresses.elapsed <= 500,
      `the drag starts on a timely second press: ${JSON.stringify(secondDragPresses)}`);
    assert.ok(secondDragPresses.distance <= 4,
      `the drag starts at the first press position: ${JSON.stringify(secondDragPresses)}`);
    await until(() => {
      const next = workingState()?.annotations.find(item => item.id === inner);
      return next && next.x1 === before.x1 + 40 && next.y1 === before.y1 + 20
        && next.x2 === before.x2 + 40 && next.y2 === before.y2 + 20;
    }, 'a drag beginning on the second face press still moves the annotation');
    assert.equal(await commentsOpen(), false,
      'moving on the qualifying second press suppresses comment reveal');

    // Assert: the selected northwest resize handle wins even at a point inside
    // its 9 px reach that is also visibly on the annotation badge.
    const moved = workingState().annotations.find(item => item.id === inner);
    const movedBounds = {
      left:Math.min(moved.x1, moved.x2),
      top:Math.min(moved.y1, moved.y2),
      right:Math.max(moved.x1, moved.x2),
      bottom:Math.max(moved.y1, moved.y2),
    };
    const handle = await at(movedBounds.left - 6, movedBounds.top - 6);
    const handleOverlap = await evaluate(page, `(() => {
      const point = ${JSON.stringify(handle)};
      const group = [...document.querySelectorAll('.dude-review-overlay g[data-annotation]')]
        .find(node => node.dataset.annotation === ${JSON.stringify(inner)});
      const disc = group?.querySelector('circle');
      const resize = document.querySelector('.dude-review-overlay [data-handle="nw"]');
      if (!disc || !resize) return null;
      const badge = disc.getBoundingClientRect();
      const grip = resize.getBoundingClientRect();
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        point,
        badgeDistance:Math.hypot(
          point.x - badge.left - badge.width / 2,
          point.y - badge.top - badge.height / 2,
        ),
        badgeReach:Math.max(badge.width, badge.height) / 2 + 8,
        handleDistance:Math.hypot(
          point.x - grip.left - grip.width / 2,
          point.y - grip.top - grip.height / 2,
        ),
        paintedAnnotation:hit?.closest('g[data-annotation]')?.dataset.annotation || null,
      };
    })()`);
    assert.ok(handleOverlap);
    assert.ok(handleOverlap.handleDistance <= 9,
      `the resize probe is inside the handle radius: ${JSON.stringify(handleOverlap)}`);
    assert.ok(handleOverlap.badgeDistance <= handleOverlap.badgeReach,
      `the same resize probe is inside the badge grab radius: ${JSON.stringify(handleOverlap)}`);
    assert.equal(handleOverlap.paintedAnnotation, inner,
      'the pointer visibly lands on the numbered badge beneath the geometric handle radius');
    await dragMouse(handle, {x:handle.x - 20, y:handle.y - 15});
    await until(() => {
      const resized = workingState()?.annotations.find(item => item.id === inner);
      return resized && Math.min(resized.x1, resized.x2) === movedBounds.left - 26
        && Math.min(resized.y1, resized.y2) === movedBounds.top - 21
        && Math.max(resized.x1, resized.x2) === movedBounds.right
        && Math.max(resized.y1, resized.y2) === movedBounds.bottom;
    }, 'the corner handle resizes instead of moving the annotation through its badge');
    assert.equal(await commentsOpen(), false, 'resizing through the badge opens no comment');
    observations.dragAndResize = {
      before,
      secondPresses:secondDragPresses,
      moved,
      handleOverlap,
      resized:workingState().annotations.find(item => item.id === inner),
    };

    // Assert: Enter remains owned by Fluent controls outside the overlay. A
    // toolbar button changes tools, the element chooser opens its listbox, and
    // a comment-list option selects its own row without a surface-level open.
    const annotationsBeforeControls = structuredClone(workingState().annotations);
    await evaluate(page, `${tool('Line (L)')}.focus({preventScroll:true})`);
    await press(page, 'Enter');
    await until(() => workingState()?.tool === 'line',
      'Enter on a Fluent palette button activates that tool');
    assert.equal(await commentsOpen(), false, 'palette Enter does not open Comments');
    assert.deepEqual(workingState().annotations, annotationsBeforeControls,
      'palette Enter changes no annotation');

    await clickAtCurrentPosition(page, button('Notes and more'));
    await until(() => evaluate(page, `Boolean(${field('Choose an element')}
      ?.getClientRects().length)`), 'visible element chooser after box interactions');
    await evaluate(page, `${field('Choose an element')}.focus({preventScroll:true})`);
    await press(page, 'Enter');
    await until(() => evaluate(page, `Boolean(document.querySelector('[role="listbox"]')
      ?.getClientRects().length)`), 'Enter on the Fluent chooser opens its listbox');
    assert.equal(await commentsOpen(), false, 'chooser Enter does not open Comments');
    await clickAtCurrentPosition(page, `[...document.querySelectorAll('[role="option"]')]
      .find(node => node.textContent.trim() === 'Preserve the current user wording.')`);
    await until(() => evaluate(page, `!${button('Add comment')}.disabled
      && ${field('Choose an element')}.textContent.includes('Preserve the current user wording.')`),
    'the element picker retains the chosen real mock target');
    assert.equal(await commentsOpen(), false, 'choosing an element does not open an annotation comment');
    await clickAtCurrentPosition(page, button('Add comment'));
    await until(async () => workingState()?.annotations?.length === 5
      && await commentsOpen() && await focusedComment(),
    'the chosen element creates an anchored annotation in the focused editor');
    const anchored = workingState().annotations.at(-1);
    assert.equal(anchored.tool, 'comment');
    assert.equal(anchored.element?.selector, '#target',
      'the new annotation retains the exact chosen element identity');
    assert.equal(anchored.element?.text, 'Preserve the current user wording.');
    assert.ok(Array.isArray(anchored.scrollBasis),
      'the chosen-element annotation retains its verified scroll basis');
    assert.deepEqual(
      workingState().annotations.slice(0, 4).map(item => item.id),
      annotationsBeforeControls.map(item => item.id),
      'anchored creation preserves every existing box after interior hit testing',
    );

    const commentListBefore = structuredClone(workingState().annotations);
    const listOption = await evaluate(page, `(() => {
      const row = document.querySelector(
        '[data-annotation-id="${outer}"]'
      );
      row?.focus({preventScroll:true});
      return row ? {
        role:row.getAttribute('role'),
        focused:document.activeElement === row,
        label:row.getAttribute('aria-label'),
      } : null;
    })()`);
    assert.deepEqual(listOption, {
      role:'listitem',
      focused:true,
      label:'Annotation 1: box. Opened from the number.',
    }, 'the Comments master list exposes a focused Fluent list item for annotation 1');
    await press(page, 'Enter');
    await until(() => workingState()?.selectedId === outer,
      'Enter on the comment-list option performs its own row selection');
    assert.equal(await commentsOpen(), true, 'comment-list Enter keeps the existing drawer open');
    assert.equal(await markedRow(), outer, 'comment-list Enter marks the option it activated');
    assert.deepEqual(workingState().annotations, commentListBefore,
      'comment-list Enter edits no comment or geometry');
    observations.pickerAndKeyboard = {
      paletteTool:workingState().tool,
      target:{selector:anchored.element.selector,text:anchored.element.text},
      anchored:{id:anchored.id,scrollBasis:anchored.scrollBasis},
      listOption,
      selected:workingState().selectedId,
    };
    await closeComments('the element picker and comment-list Enter checks');

    // Assert: a press that dragged is not half of a double press. The single
    // press that follows it lands inside both heuristic bounds and must still
    // leave Comments closed.
    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    await until(() => workingState()?.tool === 'select',
      'select tool restored after the palette Enter check');
    await resetPress('the drag-primed single press');
    const primedBefore = workingState().annotations.find(item => item.id === inner);
    const primedBounds = {
      left:Math.min(primedBefore.x1, primedBefore.x2),
      top:Math.min(primedBefore.y1, primedBefore.y2),
      right:Math.max(primedBefore.x1, primedBefore.x2),
      bottom:Math.max(primedBefore.y1, primedBefore.y2),
    };
    const primedPoint = await at(
      (primedBounds.left + primedBounds.right) / 2,
      (primedBounds.top + primedBounds.bottom) / 2,
    );
    const primedStart = await pressCount();
    await dragMouse(primedPoint, {x:primedPoint.x + 24, y:primedPoint.y}, 2);
    await clickMouse(primedPoint);
    const primedPresses = pairMetrics(await pressesSince(primedStart));
    assert.equal(primedPresses.count, 2);
    assert.ok(primedPresses.elapsed >= 0 && primedPresses.elapsed <= 500,
      `the press after the drag must land inside 500 ms: ${JSON.stringify(primedPresses)}`);
    assert.ok(primedPresses.distance <= 4,
      `the press after the drag must land within 4 px: ${JSON.stringify(primedPresses)}`);
    await until(() => {
      const next = workingState()?.annotations.find(item => item.id === inner);
      return next && next.x1 === primedBefore.x1 + 24 && next.x2 === primedBefore.x2 + 24
        && next.y1 === primedBefore.y1 && next.y2 === primedBefore.y2;
    }, 'the priming press genuinely dragged the annotation');
    await until(() => workingState()?.selectedId === inner,
      'the following single press answers to the same dragged marker');
    await settle();
    assert.equal(await commentsOpen(), false,
      'a single press straight after a drag opens no comment');
    observations.dragPriming = {presses:primedPresses, moved:24, selected:workingState().selectedId};

    // Park the tools clear of the reviewed target. Both placements float over
    // the stage, so this exposes the anchored marker without touching layout.
    await clickAtCurrentPosition(page,
      `document.querySelector('[data-review-tools] [aria-label="Switch tools to horizontal"]')`);
    await until(() => evaluate(page, `Boolean(document.querySelector(
      '[data-review-tools] [aria-label="Switch tools to vertical"]'
    ))`), 'tools parked in their horizontal placement');
    await settle();

    // Assert: the explicit gesture always opens the comment itself, even when
    // the reviewer last left a caret in a suggested replacement field, while an
    // ordinary reopen still returns to that remembered field.
    const markerPoint = await at(anchored.x1, anchored.y1);
    await clickMouse(markerPoint);
    await until(() => workingState()?.selectedId === anchored.id,
      'the anchored marker is selected before the field checks');
    const replacementField = field('Suggested replacement text');
    const commentCount = () => workingState().annotations.length;
    const parkCaretInReplacement = async label => {
      await clickAtCurrentPosition(page, button(`Comments (${commentCount()})`));
      await until(() => evaluate(page, `Boolean(${replacementField})`),
        `the anchored replacement field before ${label}`);
      await clickAtCurrentPosition(page, replacementField);
      await until(() => evaluate(page, `document.activeElement === ${replacementField}`),
        `native focus in the replacement field before ${label}`);
      await closeComments(label);
      await until(() => workingState()?.caret?.id === anchored.id
        && workingState()?.caret?.field === 'replacement',
      `the remembered caret names the replacement field before ${label}`);
    };
    await parkCaretInReplacement('the ordinary reopen');
    await clickAtCurrentPosition(page, button(`Comments (${commentCount()})`));
    await until(() => evaluate(page, `document.activeElement === ${replacementField}`),
      'an ordinary reopen still returns to the remembered replacement field');
    assert.equal(await focusedComment(), false,
      'the ordinary reopen does not claim the comment field');
    await closeComments('the ordinary reopen control');

    await parkCaretInReplacement('the double-press gesture');
    const fieldsBeforeGesture = workingState().annotations.find(item => item.id === anchored.id);
    const gestureStart = await pressCount();
    await clickMouse(markerPoint, 2);
    const gesturePresses = pairMetrics(await pressesSince(gestureStart));
    assert.equal(gesturePresses.count, 2);
    assert.ok(gesturePresses.elapsed >= 0 && gesturePresses.elapsed <= 500,
      `the field gesture must stay inside 500 ms: ${JSON.stringify(gesturePresses)}`);
    await until(async () => await commentsOpen() && await focusedComment(),
      'the double press opens the comment field, not the remembered replacement field');
    assert.equal(await markedRow(), anchored.id, 'the opened comment belongs to the marker');
    assert.equal(await evaluate(page, `document.activeElement === ${replacementField}`), false,
      'the remembered replacement field does not take the gesture focus');
    await page.send('Input.insertText', {text:'Typed into the comment.'});
    await until(() => {
      const marker = workingState()?.annotations.find(item => item.id === anchored.id);
      return marker?.comment === 'Typed into the comment.';
    }, 'the double-press gesture types into the comment');
    assert.equal(
      workingState().annotations.find(item => item.id === anchored.id).replacement,
      fieldsBeforeGesture.replacement,
      'the suggested replacement text is untouched by the gesture',
    );
    await closeComments('the double-press field gesture');

    // Assert: the keyboard twin answers the same way.
    await parkCaretInReplacement('the Enter gesture');
    assert.equal(workingState().selectedId, anchored.id,
      'the marker stays selected for the keyboard gesture');
    await evaluate(page, `document.querySelector('.dude-review-overlay').focus({preventScroll:true})`);
    await press(page, 'Enter');
    await until(async () => await commentsOpen() && await focusedComment(),
      'Enter opens the comment field, not the remembered replacement field');
    assert.equal(await evaluate(page, `document.activeElement === ${replacementField}`), false,
      'the remembered replacement field does not take the keyboard focus');
    await page.send('Input.insertText', {text:'Typed again by keyboard.'});
    await until(() => {
      const marker = workingState()?.annotations.find(item => item.id === anchored.id);
      // The reopened field is a fresh node, so the browser owns where its caret
      // lands; both typed fragments reaching this one comment is the answer.
      return marker?.comment.includes('Typed into the comment.')
        && marker?.comment.includes('Typed again by keyboard.');
    }, 'the keyboard gesture types into the same comment');
    const markerAfterFields = workingState().annotations.find(item => item.id === anchored.id);
    assert.equal(markerAfterFields.replacement, fieldsBeforeGesture.replacement,
      'the keyboard gesture leaves the suggested replacement text unchanged');
    assert.equal(markerAfterFields.styleNote, fieldsBeforeGesture.styleNote,
      'the keyboard gesture leaves the suggested style change unchanged');
    observations.commentField = {
      presses:gesturePresses,
      comment:markerAfterFields.comment,
      replacement:markerAfterFields.replacement,
      styleNote:markerAfterFields.styleNote,
    };
    await closeComments('the keyboard field gesture');

    // Assert: with a drawing tool armed, the selected shape keeps working. Its
    // handles resize, its border moves it, two unmoved border presses open its
    // comment, and its interior still draws.
    await revealFloatingTool(page, 'Select (V)');
    await clickAtCurrentPosition(page, tool('Select (V)'));
    await until(() => workingState()?.tool === 'select',
      'select tool armed to choose the drawing-mode target');
    const armedBounds = () => {
      const shape = workingState().annotations.find(item => item.id === inner);
      return {
        left:Math.min(shape.x1, shape.x2), top:Math.min(shape.y1, shape.y2),
        right:Math.max(shape.x1, shape.x2), bottom:Math.max(shape.y1, shape.y2),
      };
    };
    const armedStart = armedBounds();
    await clickMouse(await at(
      (armedStart.left + armedStart.right) / 2,
      (armedStart.top + armedStart.bottom) / 2,
    ));
    await until(() => workingState()?.selectedId === inner,
      'the shape is selected before its drawing-mode affordances are used');
    await revealFloatingTool(page, 'Box (B)');
    await clickAtCurrentPosition(page, tool('Box (B)'));
    await until(() => workingState()?.tool === 'box', 'box tool armed over the selected shape');
    const annotationsArmed = workingState().annotations.length;
    const overlayCursor = () => evaluate(page, `(() => {
      const overlay = document.querySelector('.dude-review-overlay');
      return {action:overlay.dataset.action ?? null, cursor:getComputedStyle(overlay).cursor};
    })()`);
    // The cursor answers to the same classification the next press uses, so it
    // is read from real pointer movement over the live overlay.
    const hoverCursor = async (point, expected, label) => {
      let observed = null;
      await until(async () => {
        await page.send('Input.dispatchMouseEvent', {type:'mouseMoved', x:point.x, y:point.y});
        await settle();
        observed = await overlayCursor();
        return observed.action === expected.action && observed.cursor === expected.cursor;
      }, label);
      return observed;
    };
    const borderPoint = await at(armedStart.left, (armedStart.top + armedStart.bottom) / 2);
    const cornerPoint = await at(armedStart.left, armedStart.top);
    const interiorPoint = await at(
      (armedStart.left + armedStart.right) / 2,
      (armedStart.top + armedStart.bottom) / 2,
    );
    const armedCursors = {
      border:await hoverCursor(borderPoint, {action:'move', cursor:'move'},
        'a move cursor on the selected border'),
      corner:await hoverCursor(cornerPoint, {action:'nwse-resize', cursor:'nwse-resize'},
        'a diagonal resize cursor on the selected corner handle'),
      interior:await hoverCursor(interiorPoint, {action:null, cursor:'crosshair'},
        'the drawing cursor inside the selected shape'),
    };
    assert.deepEqual(armedCursors, {
      border:{action:'move', cursor:'move'},
      corner:{action:'nwse-resize', cursor:'nwse-resize'},
      interior:{action:null, cursor:'crosshair'},
    }, 'the armed cursor describes the action each press would perform');
    assert.equal(workingState().annotations.length, annotationsArmed,
      'hovering the selected affordances adds no annotation');
    assert.deepEqual(armedBounds(), armedStart, 'and changes no geometry');

    await dragMouse(borderPoint, {x:borderPoint.x + 30, y:borderPoint.y});
    await until(() => {
      const next = armedBounds();
      return next.left === armedStart.left + 30 && next.right === armedStart.right + 30
        && next.top === armedStart.top && next.bottom === armedStart.bottom;
    }, 'dragging the selected border with a drawing tool armed moves the whole shape');
    const armedMoved = armedBounds();
    assert.equal(workingState().annotations.length, annotationsArmed,
      'the border move creates no annotation');
    assert.equal(workingState().tool, 'box', 'and leaves the drawing tool armed');

    const armedCorner = await at(armedMoved.left, armedMoved.top);
    await dragMouse(armedCorner, {x:armedCorner.x - 16, y:armedCorner.y - 12});
    await until(() => {
      const next = armedBounds();
      return next.left === armedMoved.left - 16 && next.top === armedMoved.top - 12
        && next.right === armedMoved.right && next.bottom === armedMoved.bottom;
    }, 'dragging the selected handle with a drawing tool armed resizes that shape');
    const armedResized = armedBounds();
    assert.equal(workingState().annotations.length, annotationsArmed,
      'the handle resize creates no annotation');
    assert.equal(workingState().tool, 'box', 'and leaves the drawing tool armed');

    const armedBorder = await at(armedResized.left, (armedResized.top + armedResized.bottom) / 2);
    const armedPairStart = await pressCount();
    await clickMouse(armedBorder, 2);
    const armedPairPresses = pairMetrics(await pressesSince(armedPairStart));
    assert.equal(armedPairPresses.count, 2,
      'the armed border gesture contains exactly two trusted presses');
    assert.ok(armedPairPresses.elapsed >= 0 && armedPairPresses.elapsed <= 500,
      `the armed border presses stay inside 500 ms: ${JSON.stringify(armedPairPresses)}`);
    assert.ok(armedPairPresses.distance <= 4,
      `the armed border presses stay inside 4 px: ${JSON.stringify(armedPairPresses)}`);
    await until(async () => await commentsOpen() && await focusedComment(),
      'two unmoved presses on the selected border open its focused comment field');
    assert.equal(await markedRow(), inner, 'the opened comment belongs to the pressed shape');
    assert.equal(workingState().annotations.length, annotationsArmed,
      'the border gesture adds no annotation');
    assert.deepEqual(armedBounds(), armedResized, 'and moves nothing');
    assert.equal(workingState().tool, 'box', 'the drawing tool is still armed');
    await closeComments('the armed border gesture');

    const interiorFrom = await at(armedResized.left + 20, armedResized.top + 20);
    const interiorTo = await at(armedResized.left + 60, armedResized.top + 50);
    await dragMouse(interiorFrom, interiorTo);
    await until(() => workingState()?.annotations?.length === annotationsArmed + 1,
      'a press inside the selected shape, away from its border, still draws');
    assert.deepEqual(armedBounds(), armedResized,
      'drawing inside the selected shape leaves it unchanged');
    assert.equal(await commentsOpen(), false, 'the interior drawing opens no comment');
    observations.armedManipulation = {
      cursors:armedCursors,
      start:armedStart,
      moved:armedMoved,
      resized:armedResized,
      pair:armedPairPresses,
      drawn:workingState().annotations.length,
      tool:workingState().tool,
    };

    // Assert the full shell response to the settled Comment-pin convention.
    // The engine-only regression owns movement and history; this existing
    // production UI fixture proves both open gestures reveal the real drawer
    // and focus its comment field without adding or moving the pin.
    await revealFloatingTool(page, 'Comment (C)');
    await clickAtCurrentPosition(page, tool('Comment (C)'));
    await until(() => workingState()?.tool === 'comment',
      'Comment is armed for the existing-pin shell path');
    const existingPinPoint = await at(anchored.x1, anchored.y1);
    const existingPinCursor = await hoverCursor(
      existingPinPoint,
      {action:'move', cursor:'move'},
      'Comment exposes the existing anchored pin as movable',
    );
    const pinCount = workingState().annotations.length;
    const pinBefore = structuredClone(
      workingState().annotations.find(item => item.id === anchored.id),
    );
    await separate();
    await clickMouse(existingPinPoint);
    await until(() => workingState()?.selectedId === anchored.id,
      'one Comment press selects the existing pin');
    assert.equal(workingState().annotations.length, pinCount,
      'one Comment press adds no duplicate pin');
    assert.deepEqual(
      workingState().annotations.find(item => item.id === anchored.id),
      pinBefore,
      'one Comment press changes no pin coordinates or fields',
    );
    assert.equal(await commentsOpen(), false,
      'one Comment press leaves the drawer closed');

    await separate();
    const pinPairStart = await pressCount();
    await clickMouse(existingPinPoint, 2);
    const pinPair = pairMetrics(await pressesSince(pinPairStart));
    assert.equal(pinPair.count, 2,
      'the Comment-pin open gesture contains exactly two trusted presses');
    assert.ok(pinPair.elapsed >= 0 && pinPair.elapsed <= 500,
      `the Comment-pin presses stay inside 500 ms: ${JSON.stringify(pinPair)}`);
    assert.ok(pinPair.distance <= 4,
      `the Comment-pin presses stay inside 4 px: ${JSON.stringify(pinPair)}`);
    assert.deepEqual(pinPair.annotations, [anchored.id, anchored.id],
      'both presses land on the existing pin');
    await until(async () => await commentsOpen() && await focusedComment(),
      'the Comment-pin pair opens the real drawer with comment focus');
    assert.equal(await markedRow(), anchored.id,
      'the drawer marks the pin opened by the pair');
    assert.equal(workingState().annotations.length, pinCount,
      'the opening pair adds no pin');
    assert.deepEqual(
      workingState().annotations.find(item => item.id === anchored.id),
      pinBefore,
      'the opening pair changes no persisted pin data',
    );
    await closeComments('the Comment-pin pair');

    await evaluate(page, `document.querySelector('.dude-review-overlay')
      .focus({preventScroll:true})`);
    await press(page, 'Enter');
    await until(async () => await commentsOpen() && await focusedComment(),
      'Enter on the selected Comment pin opens the real drawer with comment focus');
    assert.equal(await markedRow(), anchored.id,
      'Enter opens the selected pin');
    assert.equal(workingState().annotations.length, pinCount,
      'Enter adds no pin');
    assert.deepEqual(
      workingState().annotations.find(item => item.id === anchored.id),
      pinBefore,
      'Enter changes no persisted pin data',
    );
    observations.commentPin = {
      id:anchored.id,
      cursor:existingPinCursor,
      count:pinCount,
      selectedId:workingState().selectedId,
      tool:workingState().tool,
      pair:pinPair,
      panelOpen:await commentsOpen(),
      commentFocused:await focusedComment(),
      coordinates:{x1:pinBefore.x1,y1:pinBefore.y1,x2:pinBefore.x2,y2:pinBefore.y2},
    };
    await closeComments('the Comment-pin Enter gesture');
    await quiet('the final Comment-pin shell state');

    // Assert: no gesture moved, resized, or scrolled the pinned reviewed view.
    const after = await frameSnapshot();
    assert.deepEqual(after, pinnedFrame,
      'the reviewed frame stays exactly at its admitted pinned geometry through every comment gesture');
    assert.deepEqual(
      {x:workingState().view.viewport.scrollX, y:workingState().view.viewport.scrollY},
      {x:0, y:0},
      'the mock was never scrolled',
    );
    observations.frame = {beforePin:frame, pinned:pinnedFrame, after};
    assert.deepEqual(runtimeErrors, []);
    writeEvidenceJson(output, 'open-comment.metrics', observations);
  } finally {
    if (publication) {
      publication.controller.abort();
      await publication.result.catch(() => {});
    }
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    if (fixture) await fixture.close();
    board.close();
  }
});

test('T012 accessibility: selected annotation label meets text contrast in fresh light and dark reviews', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-selected-label-contrast');
  const board = installEmptyBoard();
  const observations = {
    convention: 'Fluent subtle-selected tabs use a text-role brand token; 14px selected labels must meet WCAG 4.5:1 against their composited background.',
    cases: [],
  };
  context.after(() => writeEvidenceJson(output, 'selected-label-contrast.metrics', observations));
  try {
    for (const [ordinal, theme] of /** @type {const} */ (['light', 'dark']).entries()) {
      let fixture;
      let publication;
      let browserState;
      const runtimeErrors = [];
      try {
        // Arrange: each theme receives its own fixture, review, and browser.
        // Changing theme after the first annotation is a recorded-view change,
        // so a shared review would turn the dark case stale.
        const root = fs.mkdtempSync(path.join(os.tmpdir(), `dude-canvas-t012-label-${theme}-`));
        const feature = createIdea(
          root,
          904 + ordinal,
          `selected-label-contrast-${theme}`,
          'defined',
          '# Tasks\n\n- [x] T001@dddddddd Closed fixture remains review-eligible.\n',
        );
        const preview = createPreview(root, /** @type {any} */ (feature));
        fixture = await createFixture(root);
        const scope = {
          kind:'feature',
          ideaPath:feature.ideaPath,
          specPath:feature.specPath,
        };
        publication = await publish(fixture, requestFor(fixture, 'preview', preview, scope));
        browserState = await startBrowser(2, true);
        const {page} = browserState;
        page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));

        // Act: enter Review with the host already in the measured theme, then
        // create two real annotations through native pointer paths.
        await viewport(page, 1000, theme, 400, 2);
        await page.send('Page.navigate', {url:fixture.instance.url});
        await visible(page, 'Connected');
        await choose(page, 'Show', 'Closed');
        await visible(page, '1 of 1 recorded ideas and features');
        await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
        await visible(page, 'Defined feature');
        await click(page, button('Review design'));
        await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
          && !document.querySelector('[aria-label="Box (B)"]').disabled
          && [...document.querySelectorAll('[data-review-workspace] > header .fui-Badge')]
            .some(node => node.textContent.trim() === 'Review')`),
        `${theme} fresh Review ready`, 60_000);
        await clickAtCurrentPosition(page, `document.querySelector('[aria-label="Box (B)"]')`);
        await openReviewDetails(page);
        await clickAtCurrentPosition(page, button('Add at center'));
        await until(() => evaluate(page, `Boolean(${button('Comments (1)')})`),
          `${theme} first contrast annotation`);
        await press(page, 'Escape');
        await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`),
          `${theme} first annotation drawer closed`);
        await openReviewDetails(page);
        await clickAtCurrentPosition(page, button('Add at center'));
        await until(() => evaluate(page, `Boolean(${button('Comments (2)')})`),
          `${theme} second contrast annotation`);
        await press(page, 'Escape');
        await until(() => evaluate(page, `!document.querySelector('[aria-label="Close comments"]')`),
          `${theme} second annotation drawer closed`);
        await clickAtCurrentPosition(page, button('Comments (2)'));
        await until(() => evaluate(page, `Boolean(document.querySelector('[aria-label="Close comments"]'))`),
          `${theme} contrast comments drawer`);
        await settleFocusPaint(page);

        // Assert: measure the selected label's computed foreground against the
        // actual composited background collected from the rendered drawer.
        const snapshot = await reviewSelectionSnapshot(page);
        const selected = snapshot.rows.find(row => row.ariaCurrent === 'true');
        assert.equal(snapshot.reviewBadge, 'Review',
          `${theme} contrast is measured before any recorded-view staleness`);
        assert.ok(selected?.label, `${theme} selected row has a measured text label`);
        assert.equal(selected.label.threshold, 4.5);
        assert.ok(
          selected.label.ratio + 0.001 >= selected.label.threshold,
          `${theme} selected label contrast ${selected.label.ratio} meets 4.5:1`,
        );
        assert.deepEqual(
          {
            foreground:selected.label.foreground,
            background:selected.label.background,
            fontSize:selected.label.fontSize,
            fontWeight:selected.label.fontWeight,
          },
          theme === 'light'
            ? {foreground:'rgb(17, 94, 163)',background:'rgb(235, 235, 235)',fontSize:14,fontWeight:600}
            : {foreground:'rgb(98, 171, 245)',background:'rgb(56, 56, 56)',fontSize:14,fontWeight:600},
          `${theme} selected label uses the text-role brand ramp against its real selected fill`,
        );
        const screenshotResult = await page.send('Page.captureScreenshot', {
          format:'png',
          captureBeyondViewport:false,
        });
        const image = Buffer.from(screenshotResult.data, 'base64');
        const screenshot = `selected-label-contrast-${theme}.png`;
        fs.writeFileSync(path.join(output.directory, screenshot), image);
        assert.deepEqual(runtimeErrors, []);
        observations.cases.push({
          theme,
          reviewBadge:snapshot.reviewBadge,
          label:selected.label,
          screenshot:{path:screenshot,bytes:image.length,sha256:sha256(image)},
          runtimeErrors,
        });
      } finally {
        if (publication) {
          publication.controller.abort();
          await publication.result.catch(() => {});
        }
        if (browserState) {
          await cleanupBrowserDriver(browserState);
        }
        if (fixture) await fixture.close();
      }
    }
    assert.deepEqual(
      observations.cases.map(({theme,reviewBadge}) => ({theme,reviewBadge})),
      [{theme:'light',reviewBadge:'Review'},{theme:'dark',reviewBadge:'Review'}],
      'both theme measurements came from separate fresh reviews',
    );
  } finally {
    board.close();
  }
});

test('T012 review regression: real keyboard focus visibly paints floating tools in both placements and themes', {
  timeout: 120_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-focus-visibility');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  const runtimeErrors = [];
  const scenarios = [];
  const postReviewScenarios = [];
  const findings = [];
  const metrics = {
    requirement: 'FR-016 visible keyboard focus',
    viewport: { width: 1000, height: 300, deviceScaleFactor: 2 },
    keyboardDispatch: {
      method: 'Input.dispatchKeyEvent',
      sequence: ['keyDown', 'keyUp'],
      virtualKey: 'Tab',
      note: 'The page receives trusted Tab/focus events while forward Tab navigation establishes the toolbar predecessor and then the target.',
    },
    postReviewViewport: { width: 1000, height: 900, deviceScaleFactor: 2 },
    browser: null,
    scenarios,
    postReviewScenarios,
    findings,
    runtimeErrors,
    browserEvents: [],
  };
  context.after(() => writeEvidenceJson(output, 'focus-visibility.metrics', metrics));
  try {
    // Arrange: mount a synthetic owned mock in a disposable provider/root,
    // then enter Review through the production app.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-focus-visibility-'));
    const feature = createIdea(
      root,
      901,
      'focus-visibility-regression',
      'defined',
      '# Tasks\n\n- [x] T001@bbbbbbbb Closed fixture remains review-eligible.\n',
    );
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = {
      kind: 'feature',
      ideaPath: feature.ideaPath,
      specPath: feature.specPath,
    };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Review visible keyboard focus on the synthetic workspace mock.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(2);
    metrics.browser = browserState.version;
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', event => runtimeErrors.push(event));
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.addEventListener('keydown', event => {
        const target = event.composedPath()[0];
        window.__recordFocusEvidence?.({
          kind:'event', owner:'window-before-app', type:'keydown', isTrusted:event.isTrusted,
          key:event.key || null, code:event.code || null, shiftKey:Boolean(event.shiftKey),
          target:target?.getAttribute?.('aria-label')
            || target?.innerText?.replace?.(/\\s+/g, ' ')?.trim()?.slice(0, 100)
            || target?.tagName || null,
          active:document.activeElement?.getAttribute?.('aria-label')
            || document.activeElement?.innerText?.replace?.(/\\s+/g, ' ')?.trim()?.slice(0, 100)
            || document.activeElement?.tagName || null,
          targetFocusVisible:target?.matches?.(':focus-visible') || false,
          targetFuiFocusVisible:target?.hasAttribute?.('data-fui-focus-visible') || false,
          navigating:window.__keyborg?.core?.isNavigatingWithKeyboard ?? null,
        });
      }, true);`,
    });
    await viewport(page, 1000, 'light', 900, 2);
    await page.send('Page.navigate', { url: fixture.instance.url });
    await visible(page, 'Connected');
    await choose(page, 'Show', 'Closed');
    await visible(page, '1 of 1 recorded ideas and features');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Defined feature');
    await evaluate(page, `(() => {
      window.__focusVisibilityProvider = document.querySelector('.fui-FluentProvider');
      return true;
    })()`);
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Highlight (H)"]').disabled`),
    'focus-visibility Review engine', 60_000);
    await viewport(page, 1000, 'light', 300, 2);
    // Bind focus painting to the admitted short frame rather than the obsolete
    // pre-integration 122px remainder; overlay agreement remains exact.
    await until(() => evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame');
      const viewBox = document.querySelector('.dude-review-overlay')?.getAttribute('viewBox');
      return devicePixelRatio === 2 && frame.clientWidth === 942
        && frame.clientHeight >= 112 && frame.clientHeight <= 130
        && viewBox === '0 0 ' + frame.clientWidth + ' ' + frame.clientHeight;
    })()`), 'short Review viewport admitted at native DPR2');

    // Browser-side logs distinguish CDP native input from Runtime.evaluate
    // focus. `isTrusted` is captured from the events the page actually receives.
    await evaluate(page, `(() => {
      window.__focusEvidenceEvents = [];
      window.__focusEvidenceSequence = 0;
      const label = node => node?.getAttribute?.('aria-label')
        || node?.innerText?.replace?.(/\\s+/g, ' ')?.trim()?.slice(0, 100)
        || node?.tagName || null;
      const save = entry => {
        window.__focusEvidenceSequence += 1;
        window.__focusEvidenceEvents.push({
          sequence:window.__focusEvidenceSequence,
          ...entry,
        });
        if (window.__focusEvidenceEvents.length > 1200) window.__focusEvidenceEvents.shift();
      };
      window.__recordFocusEvidence = save;
      for (const type of ['keydown','keyup','focusin','focusout','keyborg:focusin']) {
        document.addEventListener(type, event => save({
          kind:'event', owner:'document', type, isTrusted:event.isTrusted,
          key:event.key || null, code:event.code || null,
          shiftKey:Boolean(event.shiftKey), target:label(event.target),
          relatedTarget:label(event.relatedTarget),
          programmatic:event.detail?.isFocusedProgrammatically ?? null,
          active:label(document.activeElement),
          targetFocusVisible:event.target?.matches?.(':focus-visible') || false,
          targetFuiFocusVisible:event.target?.hasAttribute?.('data-fui-focus-visible') || false,
          navigating:window.__keyborg?.core?.isNavigatingWithKeyboard ?? null,
        }), true);
      }
      for (const type of ['keydown','keyup']) {
        window.addEventListener(type, event => save({
          kind:'event', owner:'window', type, isTrusted:event.isTrusted,
          key:event.key || null, code:event.code || null,
          shiftKey:Boolean(event.shiftKey), target:label(event.target),
          active:label(document.activeElement),
          targetFocusVisible:event.target?.matches?.(':focus-visible') || false,
          targetFuiFocusVisible:event.target?.hasAttribute?.('data-fui-focus-visible') || false,
          navigating:window.__keyborg?.core?.isNavigatingWithKeyboard ?? null,
        }), true);
      }
      new MutationObserver(records => {
        for (const record of records) {
          if (record.attributeName === 'data-fui-focus-visible') save({
            kind:'attribute', target:label(record.target),
            present:record.target.hasAttribute('data-fui-focus-visible'),
            active:label(document.activeElement),
            navigating:window.__keyborg?.core?.isNavigatingWithKeyboard ?? null,
          });
        }
      }).observe(document.documentElement, {subtree:true,attributes:true});
    })()`);

    const tool = label => `document.querySelector('[data-review-tools] [aria-label="${label}"]')`;
    const toggle = `document.querySelector('[data-review-tools] [aria-label^="Switch tools to"]')`;
    const eventMark = () => evaluate(page, 'window.__focusEvidenceSequence');
    const eventsSince = mark => evaluate(page, `window.__focusEvidenceEvents
      .filter(event => event.sequence > ${mark})`);
    const state = async (name, expression) => {
      await settleFocusPaint(page);
      const target = await floatingControlSnapshot(page, expression);
      const screenshot = await captureFocusScreenshot(page, output, name);
      return { target, screenshot };
    };
    const serializableState = value => ({
      target: value.target,
      screenshot: value.screenshot.evidence,
    });
    const addKeyboardFindings = (scenario, keyboardEvents) => {
      const { id, keyboard, keyboardPaint } = scenario;
      const attr = Object.hasOwn(keyboard.target.attributes, 'data-fui-focus-visible');
      const trustedTabDown = keyboardEvents.some(event => event.kind === 'event'
        && event.type === 'keydown' && event.key === 'Tab' && event.isTrusted);
      if (!trustedTabDown) findings.push({ id, issue: 'page did not receive a trusted Tab keydown' });
      if (!keyboard.target.focused) findings.push({ id, issue: 'native Tab did not focus the target' });
      if (!keyboard.target.focusVisible) {
        findings.push({ id, issue: 'browser :focus-visible did not match after native Tab' });
      }
      const indicatorFailures = [];
      if (!attr) indicatorFailures.push('missing data-fui-focus-visible');
      if (keyboard.target.focus.shadow === 'none') indicatorFailures.push('no Fluent inset focus shadow');
      if (keyboardPaint.perimeterChangedPixels < 40) indicatorFailures.push('fewer than 40 changed perimeter pixels');
      if (keyboardPaint.focusTokenPerimeterPixels < 20) indicatorFailures.push('fewer than 20 focus-token perimeter pixels');
      if (keyboardPaint.maxChannelDelta < 24) indicatorFailures.push('maximum RGB-channel delta below 24');
      if (indicatorFailures.length) {
        findings.push({
          id,
          issue: 'native keyboard focus has no visible Fluent indicator',
          indicatorFailures,
          observed: {
            attribute: attr,
            shadow: keyboard.target.focus.shadow,
            perimeterChangedPixels: keyboardPaint.perimeterChangedPixels,
            focusTokenPerimeterPixels: keyboardPaint.focusTokenPerimeterPixels,
            maxChannelDelta: keyboardPaint.maxChannelDelta,
            focusToken: keyboardPaint.focusToken,
          },
        });
      }
      if (!keyboard.target.inViewport || !keyboard.target.inPanel
        || !keyboard.target.inPalette || !keyboard.target.inScroller
        || !keyboard.target.hits.every(Boolean)) {
        findings.push({ id, issue: 'focused target is clipped or not wholly hit-testable', target: keyboard.target });
      }
    };
    const calibrateFocusPaint = async (id, expression, keyboard) => {
      const nativeAttribute = Object.hasOwn(keyboard.target.attributes, 'data-fui-focus-visible');
      await evaluate(page, `${expression}.removeAttribute('data-fui-focus-visible')`);
      const negative = await state(`${id}-ring-free-baseline`, expression);
      await evaluate(page, `${expression}.setAttribute('data-fui-focus-visible', '')`);
      const forced = await state(`${id}-forced-fluent-indicator`, expression);
      const forcedPaint = focusPaintDifference(
        negative.screenshot,
        forced.screenshot,
        negative.target,
        forced.target,
      );
      if (!nativeAttribute) {
        await evaluate(page, `${expression}.removeAttribute('data-fui-focus-visible')`);
      }
      await settleFocusPaint(page);
      return { negative, forced, forcedPaint };
    };
    const addCalibrationFindings = scenario => {
      const { id, negative, forced, forcedPaint } = scenario;
      if (Object.hasOwn(negative.target.attributes, 'data-fui-focus-visible')
        || !negative.target.focused
        || !negative.target.focusVisible
        || negative.target.focus.shadow !== 'none'
        || !Object.hasOwn(forced.target.attributes, 'data-fui-focus-visible')
        || forced.target.focus.shadow === 'none'
        || forcedPaint.perimeterChangedPixels < 40
        || forcedPaint.focusTokenPerimeterPixels < 20
        || forcedPaint.maxChannelDelta < 24) {
        findings.push({
          id,
          issue: 'pixel oracle calibration could not detect the isolated Fluent attribute style',
          negative: negative.target,
          forced: forced.target,
          forcedPaint,
        });
      }
    };
    const setPlacement = async placement => {
      const expected = placement === 'vertical'
        ? 'Switch tools to horizontal' : 'Switch tools to vertical';
      if (await evaluate(page, `${toggle}.getAttribute('aria-label') !== ${JSON.stringify(expected)}`)) {
        await clickAtCurrentPosition(page, toggle);
        await until(() => evaluate(page, `${toggle}.getAttribute('aria-label') === ${JSON.stringify(expected)}`),
          `${placement} focus-evidence placement`);
      }
      await settleFocusPaint(page);
    };
    const pointerFocusSource = async id => {
      await clickAtCurrentPosition(page, button('Source'));
      await until(() => evaluate(page, `${button('Source')}.getAttribute('aria-expanded') === 'true'`),
        `${id} Source pointer disclosure`);
      await clickAtCurrentPosition(page, button('Source'));
      await until(() => evaluate(page, `${button('Source')}.getAttribute('aria-expanded') !== 'true'
        && document.activeElement === (${button('Source')})`),
      `${id} Source pointer close`);
    };
    const workspaceState = async (name, expression) => {
      await settleFocusPaint(page);
      const target = await evaluate(page, `(() => {
        const node = ${expression};
        if (!node) return null;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const withinViewport = box.left >= 0 && box.top >= 0
          && box.right <= document.documentElement.clientWidth
          && box.bottom <= document.documentElement.clientHeight;
        const hits = [[.5,.5],[.08,.08],[.92,.08],[.08,.92],[.92,.92]].map(([x,y]) => {
          const hit = document.elementFromPoint(box.x+x*box.width, box.y+y*box.height);
          return Boolean(hit && (hit === node || node.contains(hit)));
        });
        const provider = document.querySelector('.fui-FluentProvider');
        const review = document.querySelector('[data-review-workspace]');
        return {
          name:node.getAttribute('aria-label') || node.innerText.trim(),
          tag:node.tagName,
          role:node.getAttribute('role'),
          box:box.toJSON(),
          focused:node === document.activeElement,
          focusVisible:node.matches(':focus-visible'),
          attributes:Object.fromEntries([...node.attributes].map(attribute => [attribute.name, attribute.value])),
          provider:{
            contains:provider?.contains(node) || false,
            focusVisibleScope:Boolean(provider?.focusVisible),
            sameInstance:provider === window.__focusVisibilityProvider,
          },
          review:{
            mounted:Boolean(review),
            visible:Boolean(review?.getClientRects().length),
          },
          keyborg:window.__keyborg ? {
            refs:Object.keys(window.__keyborg.refs || {}),
            navigating:window.__keyborg.core?.isNavigatingWithKeyboard,
          } : null,
          focusTokens:{
            focus1:style.getPropertyValue('--colorStrokeFocus1').trim(),
            focus2:style.getPropertyValue('--colorStrokeFocus2').trim(),
            transparent:style.getPropertyValue('--colorTransparentStroke').trim(),
          },
          inViewport:withinViewport,
          hits,
          focus:{
            outline:style.outline,
            outlineOffset:style.outlineOffset,
            shadow:style.boxShadow,
            border:style.border,
          },
        };
      })()`);
      assert.ok(target, `post-Review focus target exists for ${name}`);
      const screenshot = await captureFocusScreenshot(page, output, name);
      return { target, screenshot };
    };
    const runPostReviewScenario = async (theme, view, expectedName) => {
      const id = `${theme}-post-review-${view}`;
      const tab = `document.querySelector('#dude-tab-${view}')`;
      const alternateView = view === 'overview' ? 'context' : 'overview';
      const alternateTab = `document.querySelector('#dude-tab-${alternateView}')`;
      const focusOrigin = view === 'new'
        ? `document.querySelector('#dude-panel-new textarea')`
        : `document.querySelector('#dude-panel-${view} h1')`;
      const targetExpression = `document.querySelector(
        '#dude-panel-${view} button:not(:disabled):not([aria-disabled="true"])'
      )`;
      if (await evaluate(page, `${tab}.getAttribute('aria-selected') === 'true'`)) {
        await clickAtCurrentPosition(page, alternateTab);
        await until(() => evaluate(page, `${alternateTab}.getAttribute('aria-selected') === 'true'`),
          `${id} alternate view`);
      }
      await clickAtCurrentPosition(page, tab);
      await until(() => evaluate(page, `${tab}.getAttribute('aria-selected') === 'true'
        && Boolean(${targetExpression}?.getClientRects().length)
        && document.activeElement === (${focusOrigin})`),
      `${id} selected view and destination focus`);
      const before = await workspaceState(`${id}-unfocused`, targetExpression);
      const mark = await eventMark();
      const tabPath = [];
      const backwards = await evaluate(page, `Boolean((${targetExpression}).compareDocumentPosition(
        ${focusOrigin}
      ) & Node.DOCUMENT_POSITION_FOLLOWING)`);
      for (let step = 0; step < 24; step += 1) {
        if (await evaluate(page, `document.activeElement === (${targetExpression})`)) break;
        await pressNavigationKey(page, 'Tab', 'Tab', backwards ? 8 : 0);
        tabPath.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.innerText?.trim()
          || document.activeElement?.tagName`));
      }
      const keyboard = await workspaceState(`${id}-keyboard-focused`, targetExpression);
      const keyboardEvents = await eventsSince(mark);
      const keyboardPaint = focusPaintDifference(
        before.screenshot,
        keyboard.screenshot,
        before.target,
        keyboard.target,
      );
      const scenario = {
        id,
        theme,
        view,
        expectedName,
        navigation: `native ${backwards ? 'backward' : 'forward'} Tab from the destination focus after a real pointer selection of the workspace tab`,
        tabPath,
        before: serializableState(before),
        keyboard: serializableState(keyboard),
        keyboardEvents,
        keyboardPaint,
      };
      postReviewScenarios.push(scenario);
      const attr = Object.hasOwn(keyboard.target.attributes, 'data-fui-focus-visible');
      const trustedTabDown = keyboardEvents.some(event => event.kind === 'event'
        && event.type === 'keydown' && event.key === 'Tab' && event.isTrusted);
      const indicatorFailures = [];
      if (before.target.focused
        || Object.hasOwn(before.target.attributes, 'data-fui-focus-visible')
        || before.target.focus.shadow !== 'none') {
        indicatorFailures.push('unfocused pixel baseline was not ring-free');
      }
      if (!trustedTabDown) indicatorFailures.push('page did not receive a trusted Tab keydown');
      if (!keyboard.target.focused) indicatorFailures.push('native Tab did not focus the target');
      if (!keyboard.target.focusVisible) indicatorFailures.push('browser :focus-visible did not match after native Tab');
      if (!attr) indicatorFailures.push('missing data-fui-focus-visible');
      if (keyboard.target.focus.shadow === 'none') indicatorFailures.push('no Fluent inset focus shadow');
      if (keyboardPaint.perimeterChangedPixels < 40) indicatorFailures.push('fewer than 40 changed perimeter pixels');
      if (keyboardPaint.focusTokenPerimeterPixels < 20) indicatorFailures.push('fewer than 20 focus-token perimeter pixels');
      if (keyboardPaint.maxChannelDelta < 24) indicatorFailures.push('maximum RGB-channel delta below 24');
      if (keyboard.target.name !== expectedName) indicatorFailures.push(`focused ${keyboard.target.name} instead of ${expectedName}`);
      if (!keyboard.target.inViewport || !keyboard.target.hits.every(Boolean)) {
        indicatorFailures.push('focused target is clipped or not wholly hit-testable');
      }
      if (!keyboard.target.provider.contains
        || !keyboard.target.provider.focusVisibleScope
        || !keyboard.target.provider.sameInstance) {
        indicatorFailures.push('focus target did not remain in the original FluentProvider scope');
      }
      if (!keyboard.target.review.mounted || keyboard.target.review.visible) {
        indicatorFailures.push('scenario did not run after returning from the mounted Review workspace');
      }
      if (indicatorFailures.length) {
        findings.push({
          id,
          issue: 'post-Review workspace control has no visible Fluent keyboard indicator',
          indicatorFailures,
          before: before.target,
          keyboard: keyboard.target,
          keyboardPaint,
        });
      }
    };

    const runToolScenario = async theme => {
      const id = `${theme}-vertical-scrolled-tool`;
      const targetExpression = tool('Highlight (H)');
      await revealFloatingTool(page, 'Highlight (H)');
      await clickAtCurrentPosition(page, targetExpression);
      await settleFocusPaint(page);
      await clickAtCurrentPosition(page, button('Source'));
      await press(page, 'Escape');
      await until(() => evaluate(page, `document.activeElement === (${button('Source')})`),
        `${id} Source returns native focus`);
      const before = await state(`${id}-unfocused`, targetExpression);
      const mark = await eventMark();
      const tabPath = [];
      for (let step = 0; step < 24; step += 1) {
        if (await evaluate(page, `document.activeElement === (${targetExpression})`)) break;
        await pressNavigationKey(page, 'Tab');
        tabPath.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.innerText?.trim()`));
      }
      const keyboard = await state(`${id}-keyboard-focused`, targetExpression);
      const keyboardEvents = await eventsSince(mark);
      const keyboardPaint = focusPaintDifference(
        before.screenshot,
        keyboard.screenshot,
        before.target,
        keyboard.target,
      );
      const calibration = await calibrateFocusPaint(id, targetExpression, keyboard);
      const scenario = {
        id,
        theme,
        placement: 'vertical',
        control: 'Highlight (H)',
        navigation: 'native Tab to the selected, wheel-revealed roving toolbar item',
        tabPath,
        before: serializableState(before),
        keyboard: serializableState(keyboard),
        keyboardEvents,
        keyboardPaint,
        negative: serializableState(calibration.negative),
        forced: serializableState(calibration.forced),
        forcedPaint: calibration.forcedPaint,
      };
      scenarios.push(scenario);
      addKeyboardFindings(scenario, keyboardEvents);
      addCalibrationFindings(scenario);
      if (before.target.scroller.scrollTop <= 0 || keyboard.target.scroller.scrollTop <= 0) {
        findings.push({
          id,
          issue: 'drawing-tool focus evidence did not exercise the internally scrolled vertical toolbar',
          beforeScrollTop: before.target.scroller.scrollTop,
          keyboardScrollTop: keyboard.target.scroller.scrollTop,
        });
      }
    };

    const runToggleScenario = async (theme, placement) => {
      const id = `${theme}-${placement}-pinned-toggle`;
      const selectedTool = tool('Highlight (H)');
      if (placement === 'vertical') await revealFloatingTool(page, 'Highlight (H)');
      await clickAtCurrentPosition(page, selectedTool);
      const unfocused = await state(`${id}-unfocused`, toggle);

      // Reproduce the hypothesized harness artifact explicitly.
      const programmaticMark = await eventMark();
      await evaluate(page, `${toggle}.focus({preventScroll:true})`);
      const programmatic = await state(`${id}-programmatic-focused`, toggle);
      const programmaticEvents = await eventsSince(programmaticMark);
      const programmaticPaint = focusPaintDifference(
        unfocused.screenshot,
        programmatic.screenshot,
        unfocused.target,
        programmatic.target,
      );

      // Then reset modality with a real pointer trigger and establish the same
      // target through the production forward-Tab path used by the acceptance.
      await pointerFocusSource(id);
      const keyboardMark = await eventMark();
      const tabPath = [];
      for (let step = 0; step < 24; step += 1) {
        if (await evaluate(page, `document.activeElement === (${selectedTool})`)) break;
        await pressNavigationKey(page, 'Tab');
        tabPath.push(await evaluate(page, `document.activeElement?.getAttribute('aria-label')
          || document.activeElement?.innerText?.trim()`));
      }
      const keyboardBefore = await state(`${id}-keyboard-predecessor`, toggle);
      const predecessor = await evaluate(page, `document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim()`);
      await pressNavigationKey(page, 'Tab');
      const keyboard = await state(`${id}-keyboard-focused`, toggle);
      const keyboardEvents = await eventsSince(keyboardMark);
      const keyboardPaint = focusPaintDifference(
        keyboardBefore.screenshot,
        keyboard.screenshot,
        keyboardBefore.target,
        keyboard.target,
      );
      const calibration = await calibrateFocusPaint(id, toggle, keyboard);
      const scenario = {
        id,
        theme,
        placement,
        control: keyboard.target.name,
        navigation: 'native forward Tab path to the selected toolbar item, then native Tab to the pinned toggle',
        tabPath,
        predecessor,
        unfocused: serializableState(unfocused),
        programmatic: serializableState(programmatic),
        programmaticEvents,
        programmaticPaint,
        keyboardBefore: serializableState(keyboardBefore),
        keyboard: serializableState(keyboard),
        keyboardEvents,
        keyboardPaint,
        negative: serializableState(calibration.negative),
        forced: serializableState(calibration.forced),
        forcedPaint: calibration.forcedPaint,
      };
      scenarios.push(scenario);
      addKeyboardFindings(scenario, keyboardEvents);
      addCalibrationFindings(scenario);
      if (predecessor !== 'Highlight (H)') {
        findings.push({ id, issue: 'forward Tab did not establish the selected toolbar predecessor', predecessor, tabPath });
      }
    };

    // Act: one native DPR2 short panel covers both placements in both host
    // themes. The scrolled drawing tool is checked in each theme as well.
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      await viewport(page, 1000, theme, 300, 2);
      await setPlacement('vertical');
      await runToolScenario(theme);
      await runToggleScenario(theme, 'vertical');
      await setPlacement('horizontal');
      await runToggleScenario(theme, 'horizontal');
    }
    await clickAtCurrentPosition(page, `document.querySelector('[data-review-return]')`);
    await until(() => evaluate(page, `document.querySelector('#dude-tab-context')?.getAttribute('aria-selected') === 'true'
      && !document.querySelector('[data-review-workspace]')?.getClientRects().length`),
    'returned from Review to Context');
    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      await viewport(page, 1000, theme, 900, 2);
      for (const [view, expectedName] of [
        ['context', 'Back to Overview'],
        ['overview', 'New idea'],
        ['needs', 'All requests'],
        ['new', 'Cancel'],
      ]) {
        await runPostReviewScenario(theme, view, expectedName);
      }
    }
    metrics.browserEvents = await evaluate(page, 'window.__focusEvidenceEvents');
    writeEvidenceJson(output, 'focus-visibility.metrics', metrics);

    // Assert: browser keyboard modality, the Fluent focus attribute/style, and
    // a native-pixel perimeter change are all required. Geometry alone cannot
    // satisfy visible focus.
    assert.equal(scenarios.length, 6);
    assert.equal(postReviewScenarios.length, 8);
    assert.deepEqual(runtimeErrors, []);
    assert.deepEqual(
      findings,
      [],
      'real keyboard focus must visibly paint Review controls and every post-Review workspace view in both themes',
    );
  } finally {
    if (publication) {
      publication.controller.abort();
      await publication.result.catch(() => {});
    }
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    if (fixture) await fixture.close();
    board.close();
  }
});

test('T012 browser: published capture warnings are closed, accessible, and retain save-only markup', {
  timeout: 240_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  if (process.platform === 'win32') {
    context.skip('The test-owned failing browser uses the POSIX executable contract.');
    return;
  }
  const output = evidence(context, 't012-capture-diagnostics');
  const board = installEmptyBoard();
  const failingBrowser = installFailingCaptureBrowser();
  let browserState;
  let fixture;
  let root;
  const runtimeErrors = [];
  const network = [];
  const baseCaptures = [];
  const sealCalls = [];
  const diagnosticByRequest = new Map();
  const untrusted = 'UNTRUSTED_CAPTURE_DIAGNOSTIC_TEXT_MUST_NOT_RENDER';
  const ownedExitWording = {
    child_exit: 'The capture browser exited before the operation completed.',
    pipe_write: 'The capture browser command pipe failed.',
  };
  const cases = [
    {
      key: 'owned_exit',
      injected: null,
      wording: null,
    },
    {
      key: 'child_exit',
      injected: {
        available: false,
        reason: 'review_capture_failed',
        detail: { stage: 'child_exit', exitCode: 23 },
      },
      wording: 'The capture browser exited before the operation completed.',
    },
    {
      key: 'pipe_write',
      injected: {
        available: false,
        reason: 'review_capture_failed',
        detail: { stage: 'pipe_write', exitCode: 23 },
      },
      wording: 'The capture browser command pipe failed.',
    },
    {
      key: 'browser_missing',
      injected: { available: false, reason: 'review_browser_missing' },
      wording: 'No supported browser was found for image capture.',
    },
    {
      key: 'protocol',
      injected: {
        available: false,
        reason: 'review_capture_failed',
        detail: { stage: 'protocol', signal: 'SIGTERM' },
      },
      wording: 'The capture browser returned an invalid or failed protocol response.',
    },
    {
      key: 'timeout',
      injected: {
        available: false,
        reason: 'review_capture_timeout',
        detail: { stage: 'command_timeout' },
      },
      wording: 'The capture browser did not answer a command before its deadline.',
    },
    {
      key: 'cleanup',
      injected: {
        available: false,
        reason: 'review_capture_failed',
        detail: { stage: 'cleanup', cleanupUncertain: true },
      },
      wording: 'Cleanup of the capture browser or its temporary profile could not be confirmed.',
    },
    {
      key: 'unknown',
      injected: {
        available: false,
        reason: untrusted,
        detail: { stage: untrusted, message: untrusted, raw: untrusted },
        message: untrusted,
      },
      wording: 'Image capture is unavailable; the failure stage is unknown.',
    },
  ];
  try {
    // Arrange: each UI case uses the production adapter and real provider. The
    // first descriptor is the actual result from the owned exit-23 browser.
    // Later closed descriptors isolate the published wording map without
    // spawning more browsers or manufacturing additional transport failures.
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-capture-diagnostics-'));
    const feature = createIdea(root, 712, 'capture-diagnostic-warning', 'defined');
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root, null, (base) => ({
      ...base,
      async openReview(input) {
        const opened = await base.openReview(input);
        baseCaptures.push({
          requestRef: input.request.requestRef,
          capture: structuredClone(opened.capture),
        });
        const injected = diagnosticByRequest.get(input.request.requestRef);
        return injected ? { ...opened, capture: structuredClone(injected) } : opened;
      },
      async sealReview(input) {
        sealCalls.push(input.request.requestRef);
        return base.sealReview(input);
      },
    }));
    const scope = { kind: 'feature', ideaPath: feature.ideaPath, specPath: feature.specPath };
    const publications = new Map();
    for (const diagnostic of cases) {
      const request = requestFor(fixture, 'preview', preview, scope);
      request.prompt = `T012 ${diagnostic.key} capture warning`;
      diagnosticByRequest.set(request.requestRef, diagnostic.injected);
      publications.set(diagnostic.key, {
        request,
        publication: await publish(fixture, request),
      });
    }
    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      network.push({
        requestId: event.requestId,
        method: event.request.method,
        url: event.request.url,
      });
    });
    const rendered = [];

    // Act + Assert
    for (const diagnostic of cases) {
      const { request, publication } = publications.get(diagnostic.key);
      await navigate(page, fixture, 1440, 'light');
      const nativeProbe = await installNativeAnnouncementProbe(page);
      assert.equal(
        nativeProbe.wrapped,
        nativeProbe.supported,
        'the native announcement probe either delegates the actual API or leaves the DOM fallback untouched',
      );
      await click(page, button('Needs you'));
      await click(page, `[...document.querySelectorAll('button')].find((node) =>
        node.innerText.includes(${JSON.stringify(request.prompt)}) && node.getClientRects().length)`);
      await click(page, button('Open Review'));
      await visible(page, 'Image capture unavailable. Read notice');
      await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
        && !document.querySelector('[aria-label="Box (B)"]').disabled`),
      `${diagnostic.key} Review engine ready`, 30_000);
      const baseCapture = baseCaptures.find((entry) => entry.requestRef === request.requestRef)?.capture;
      const renderedCapture = diagnostic.injected ?? baseCapture;
      if (diagnostic.key === 'owned_exit') {
        assert.deepEqual(
          {
            available: renderedCapture?.available,
            reason: renderedCapture?.reason,
            stage: renderedCapture?.detail?.stage,
            exitCode: renderedCapture?.detail?.exitCode,
          },
          {
            available: false,
            reason: 'review_capture_failed',
            stage: renderedCapture?.detail?.stage,
            exitCode: 23,
          },
          'the actual owned exit-23 probe returns a closed capture failure with its exit code',
        );
        assert.ok(
          Object.hasOwn(ownedExitWording, renderedCapture.detail.stage),
          `the owned exit race must close as child_exit or pipe_write, not ${renderedCapture.detail.stage}`,
        );
      }
      const wording = diagnostic.wording ?? ownedExitWording[renderedCapture.detail.stage];
      const expected = `${wording} Review cannot send report-only feedback. Working annotations are retained.`;
      const announced = observeLiveFeedback(page, expected, 2_000);
      await openReviewNotice(page, 'Image capture unavailable');
      await visible(page, expected);
      const announcement = await announced;
      const notice = await evaluate(page, `(() => {
        const expected = ${JSON.stringify(expected)};
        const node = [...document.querySelectorAll('[role="group"]')]
          .filter((candidate) => candidate.textContent.includes(expected))
          .sort((left, right) => left.textContent.length - right.textContent.length)[0];
        if (!node) return null;
        const ids = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).filter(Boolean);
        const labels = ids.map((id) => ({
          id,
          exists: Boolean(document.getElementById(id)),
          text: document.getElementById(id)?.textContent.replace(/\\s+/g, ' ').trim() || '',
        }));
        return {
          role: node.getAttribute('role'),
          text: node.textContent.replace(/\\s+/g, ' ').trim(),
          ariaLabel: node.getAttribute('aria-label') || '',
          ariaLabelledby: node.getAttribute('aria-labelledby') || '',
          labels,
          nativeTitleValid: Boolean((node.getAttribute('aria-label') || '').trim())
            || (labels.length > 0 && labels.every((label) => label.exists && label.text)),
        };
      })()`);
      const tree = await page.send('Accessibility.getFullAXTree');
      const axGroup = axGroupsContaining(tree, expected)[0] ?? null;
      const live = {
        channel: announcement.nativeSupported ? 'ariaNotify' : 'live-region',
        dom: announcement.samples.some(({ dom }) => dom.some((entry) => (
          entry.ownerDocument && entry.containsExpected
        ))),
        ax: announcement.samples.some(({ ax }) => ax.some((entry) => (
          entry.text.includes(expected) && ['polite', 'assertive'].includes(entry.live)
        ))),
        native: announcement.samples.some(({ nativeMatch }) => nativeMatch),
      };
      assert.ok(notice, `${diagnostic.key} warning is rendered by the published Fluent MessageBar`);
      assert.equal(notice.nativeTitleValid, true, `${diagnostic.key} warning retains a native title reference`);
      assert.deepEqual(notice.labels.map(({ text }) => text), ['Image capture unavailable']);
      assert.ok(axGroup?.name?.trim(), `${diagnostic.key} warning has a named native AX group`);
      if (live.channel === 'ariaNotify') {
        assert.equal(live.native, true,
          `${diagnostic.key} warning reaches the browser's native high-priority ariaNotify API`);
      } else {
        assert.deepEqual(
          { dom: live.dom, ax: live.ax },
          { dom: true, ax: true },
          `${diagnostic.key} warning reaches the owner-document DOM and native AX live region`,
        );
      }
      if (diagnostic.key === 'unknown') {
        assert.equal(await evaluate(page, `document.body.innerText.includes(${JSON.stringify(untrusted)})`), false,
          'unknown diagnostic keys and text are never echoed');
      }

      if (diagnostic.key === 'owned_exit') {
        assert.deepEqual(
          baseCapture,
          renderedCapture,
          'the UI oracle is rooted in the actual owned exit-23 preflight',
        );
        const savePosts = network.filter(({ url }) => url.endsWith('/api/needs-you/review/save')).length;
        const sealPosts = network.filter(({ url }) => url.endsWith('/api/needs-you/review/seal')).length;
        const responsePosts = network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length;
        await click(page, `document.querySelector('[aria-label="Box (B)"]')`);
        await openReviewDetails(page);
        await click(page, button('Add at center'));
        await visible(page, 'Comments (1)');
        await until(() => evaluate(page, `!${button('Save markup')}.disabled`),
          'capture-unavailable Save markup enabled');
        await click(page, button('Save markup'));
        await until(
          () => network.filter(({ url }) => url.endsWith('/api/needs-you/review/save')).length === savePosts + 1,
          'one capture-unavailable working save',
        );
        await openReviewDetails(page);
        await visible(page, 'Working markup matches the saved revision');
        const sendDisabled = await evaluate(page, `(() => {
          const node = ${button('Send annotations')};
          const disabled = node.disabled;
          node.click();
          return disabled;
        })()`);
        await evaluate(page, 'new Promise((resolve) => setTimeout(resolve, 100))');
        assert.equal(sendDisabled, true, 'capture-unavailable markup cannot be sent');
        assert.equal(
          network.filter(({ url }) => url.endsWith('/api/needs-you/review/seal')).length,
          sealPosts,
          'the disabled send performs no seal',
        );
        assert.equal(
          network.filter(({ url }) => url.endsWith('/api/needs-you/respond')).length,
          responsePosts,
          'capture-unavailable markup performs no report-only response',
        );
        const current = fixture.provider.read().requests.find(
          ({ requestHandle }) => requestHandle === publication.record.requestHandle,
        );
        assert.equal(current.phase, 'pending', 'the owner waiter remains current after a working save');
        const reviewDirectory = path.join(
          root,
          ...path.posix.dirname(feature.specPath).split('/'),
          'reviews',
          current.reviewSubmissionId,
        );
        assert.deepEqual(fs.readdirSync(reviewDirectory), ['working.json']);
        const working = JSON.parse(fs.readFileSync(path.join(reviewDirectory, 'working.json'), 'utf8'));
        assert.equal(working.state.annotations.length, 1, 'Save markup retains the working annotation');
        await visible(page, expected);
        await saveRegressionProof(page, output, 'capture-diagnostic-owned-exit', {
          test: 'T012 browser: published capture warnings are closed, accessible, and retain save-only markup',
          browser: browserState.version.Browser,
          expected,
          notice,
          axGroup,
          live,
          baseCapture: baseCaptures.find((entry) => entry.requestRef === request.requestRef)?.capture,
          workingAnnotations: working.state.annotations.length,
        });
      }
      rendered.push({
        key: diagnostic.key,
        expected,
        notice,
        axGroup,
        live,
      });
    }

    const probe = failingBrowser.read();
    assert.equal(probe.count, 1,
      'all later Review allocations reuse the first negative capability result without an automatic retry');
    assert.throws(
      () => process.kill(probe.pid, 0),
      (error) => error.code === 'ESRCH',
      'the one test-owned failing process has exited',
    );
    assert.equal(fs.existsSync(probe.profile), false, 'the actual failed preflight removed its owned profile');
    assert.equal(baseCaptures.length, cases.length);
    const actualCapture = baseCaptures[0].capture;
    assert.deepEqual(
      baseCaptures.map(({ capture }) => capture),
      cases.map(() => actualCapture),
      'the production adapter keeps one unchanged negative descriptor for its provider lifetime',
    );
    const injectedCases = cases.filter(({ injected }) => injected);
    assert.equal(new Set(injectedCases.map(({ wording }) => wording)).size, injectedCases.length,
      'browser missing, child exit, pipe write, protocol, timeout, cleanup, and unknown have distinct wording');
    assert.deepEqual(sealCalls, []);
    assert.deepEqual(runtimeErrors, []);
    writeEvidenceJson(output, 'capture-diagnostic-warning-matrix', {
      browser: browserState.version.Browser,
      executable: failingBrowser.executable,
      probe: { count: probe.count, profileRemoved: !fs.existsSync(probe.profile) },
      baseCaptures,
      rendered,
      sealCalls,
    });
    output.results.push({
      case: 't012-capture-diagnostic-warning-matrix',
      pass: true,
      browser: browserState.version.Browser,
      warningCases: rendered.map(({ key }) => key),
      browserProbes: probe.count,
      workingSaves: network.filter(({ url }) => url.endsWith('/api/needs-you/review/save')).length,
      seals: sealCalls.length,
    });
  } finally {
    await runCleanupSteps(
      () => fixture?.provider.dispose(),
      () => fixture ? closeInstance(fixture.instanceId) : undefined,
      () => { if (root) fs.rmSync(root, { recursive: true, force: true }); },
      () => browserState ? cleanupBrowserDriver(browserState) : undefined,
      () => failingBrowser.close(),
      () => board.close(),
    );
  }
});

test('T011 review regression: dynamic status notices reach native live regions', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't011-review-status-announcements');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  const runtimeErrors = [];
  const network = [];
  try {
    // Arrange
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-review-live-'));
    const feature = createIdea(root, 701, 'review-live-feedback', 'defined');
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const factRequest = requestFor(fixture, 'fact', { input: { kind: 'text' } });
    factRequest.prompt = 'Receipt outcome announcement control';
    const fact = await publish(fixture, factRequest);
    const scope = { kind: 'feature', ideaPath: feature.ideaPath, specPath: feature.specPath };
    const previewRequest = requestFor(fixture, 'preview', preview, scope);
    previewRequest.prompt = 'Capture refusal announcement control';
    const review = await publish(fixture, previewRequest);

    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      network.push({ requestId: event.requestId, method: event.request.method, url: event.request.url });
    });
    await navigate(page, fixture, 1440, 'light');
    const nativeProbe = await installNativeAnnouncementProbe(page);
    assert.equal(
      nativeProbe.wrapped,
      nativeProbe.supported,
      'the native announcement probe either delegates the actual API or leaves the DOM fallback untouched',
    );
    await click(page, button('Needs you'));
    await click(page, `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes('Receipt outcome announcement control') && node.getClientRects().length)`);
    await fill(page, field('Your response'), 'Decline this fixture response after owner review.');

    // Act: first exercise an actual owner-matched receipt outcome.
    await click(page, button('Send response'));
    const delivered = JSON.parse((await fact.result).textResultForLlm);
    assert.equal(delivered.status, 'awaiting_acknowledgment');
    await evaluate(page, `${button('All requests')}.focus()`);
    const declinedFocusBefore = await evaluate(page, `document.activeElement?.innerText.trim() || null`);
    await acknowledge(fixture, delivered.receipt, 'declined', factRequest.source);
    const declinedText = 'The owner declined this response. A fresh request is needed before responding again.';
    await visible(page, declinedText);
    const declined = await observeLiveFeedback(page, declinedText);
    const declinedFocusAfter = await evaluate(page, `document.activeElement?.innerText.trim() || null`);
    fs.writeFileSync(
      path.join(output.directory, 'declined-outcome.live.ax.json'),
      `${JSON.stringify(declined.tree, null, 2)}\n`,
    );
    writeEvidenceJson(output, 'declined-outcome.live', {
      expected: declined.expected,
      samples: declined.samples,
      best: declined.best,
      focus: { before: declinedFocusBefore, after: declinedFocusAfter },
    });

    // Act again through the mounted Review engine: a source-aligned annotation
    // is retained when its edited geometry is outside the reviewed viewport.
    await click(page, button('All requests'));
    const refusalText = await triggerReviewCaptureRefusal(page, previewRequest.prompt);
    const focus = await evaluate(page, `({
      name: document.activeElement?.getAttribute('aria-label')
        || document.activeElement?.innerText?.trim() || null,
      isBack: document.activeElement === document.querySelector('[data-review-return]')
    })`);
    const refusal = await observeLiveFeedback(page, refusalText);
    fs.writeFileSync(
      path.join(output.directory, 'capture-refusal.live.ax.json'),
      `${JSON.stringify(refusal.tree, null, 2)}\n`,
    );
    writeEvidenceJson(output, 'capture-refusal.live', {
      expected: refusal.expected,
      samples: refusal.samples,
      best: refusal.best,
      focus,
    });

    const assertiveMatch = (observation) => {
      const dom = observation.samples.some(({ dom }) => dom.some((entry) => (
        entry.ownerDocument && entry.containsExpected && entry.live === 'assertive'
      )));
      const ax = observation.samples.some(({ ax }) => ax.some((entry) => (
        entry.text.includes(observation.expected) && entry.live === 'assertive'
      )));
      const native = observation.samples.some(({ nativeMatch }) => nativeMatch);
      return {
        channel: observation.nativeSupported ? 'ariaNotify' : 'live-region',
        dom,
        ax,
        native,
        delivered: observation.nativeSupported ? native : dom && ax,
      };
    };
    const declinedMatch = assertiveMatch(declined);
    const refusalMatch = assertiveMatch(refusal);
    const politeNativeControl = refusal.samples.some(({ ax }) => ax.some((entry) => (
      entry.role === 'status' && entry.live === 'polite'
        && entry.text.includes('Review needs attention')
    )));
    const findings = [];
    if (declinedFocusBefore !== 'All requests' || declinedFocusAfter !== declinedFocusBefore) findings.push({
      transition: 'owner outcome focus',
      expected: { before: 'All requests', after: 'All requests' },
      actual: { before: declinedFocusBefore, after: declinedFocusAfter },
    });
    if (!focus.isBack || focus.name !== 'Back') findings.push({
      transition: 'capture refusal focus',
      expected: 'Back',
      actual: focus.name,
    });
    if (!politeNativeControl) findings.push({
      transition: 'native polite status control',
      expected: 'the Review-needs-attention role=status AX node with live=polite',
      actual: refusal.best?.ax ?? [],
    });
    if (!declinedMatch.delivered) findings.push({
      transition: 'owner-declined matching receipt',
      expected: declinedMatch.channel === 'ariaNotify'
        ? { nativeAPI: 'Document.ariaNotify', priority: 'high', text: declinedText }
        : { ownerDocumentDescendant: true, nativeAXLive: 'assertive', text: declinedText },
      actual: declinedMatch,
    });
    if (!refusalMatch.delivered) findings.push({
      transition: 'Review capture refusal',
      expected: refusalMatch.channel === 'ariaNotify'
        ? { nativeAPI: 'Document.ariaNotify', priority: 'high', text: refusalText }
        : { ownerDocumentDescendant: true, nativeAXLive: 'assertive', text: refusalText },
      actual: refusalMatch,
    });
    await saveRegressionProof(page, output, 'status-announcements', {
      test: 'T011 review regression: dynamic status notices reach native live regions',
      browser: browserState.version.Browser,
      nativeProbe,
      focus,
      politeNativeControl,
      declinedMatch,
      refusalMatch,
      findings,
      network,
      pendingReviewPhase: fixture.provider.read().requests.find(
        ({ requestHandle }) => requestHandle === review.record.requestHandle,
      )?.phase,
    });
    output.results.push({
      case: 'review-regression-status-announcements',
      browser: browserState.version.Browser,
      nativeAnnouncementSupported: nativeProbe.supported,
      focus,
      politeNativeControl,
      declinedMatch,
      refusalMatch,
      findings,
      networkRequests: network.length,
    });

    // Assert
    assert.deepEqual(runtimeErrors, []);
    assert.equal(
      fixture.provider.read().requests.find(
        ({ requestHandle }) => requestHandle === review.record.requestHandle,
      ).phase,
      'pending',
      'capture refusal preserves the real owner waiter',
    );
    assert.deepEqual(findings, [],
      'specific dynamic outcomes and warnings must enter the native API or owner-document/native AX live region');
  } finally {
    fixture?.provider.dispose();
    if (fixture) await closeInstance(fixture.instanceId);
    if (fixture?.root) fs.rmSync(fixture.root, { recursive: true, force: true });
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T011 review regression: Review capture refusal notice has a valid accessible name', {
  timeout: 150_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't011-review-notice-name');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  const runtimeErrors = [];
  const network = [];
  try {
    // Arrange
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-review-name-'));
    const feature = createIdea(root, 711, 'review-notice-name', 'defined');
    const preview = createPreview(root, /** @type {any} */ (feature));
    fixture = await createFixture(root);
    const scope = { kind: 'feature', ideaPath: feature.ideaPath, specPath: feature.specPath };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Review notice accessible-name control';
    const publication = await publish(fixture, request);
    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      network.push({ requestId: event.requestId, method: event.request.method, url: event.request.url });
    });
    await navigate(page, fixture, 1440, 'light');
    await click(page, button('Needs you'));

    // Act
    const refusalText = await triggerReviewCaptureRefusal(page, request.prompt);
    const domNotice = await evaluate(page, `(() => {
      const expected = ${JSON.stringify(refusalText)};
      const candidates = [...document.querySelectorAll('[role="group"]')]
        .filter((node) => node.textContent.includes(expected))
        .sort((left, right) => left.textContent.length - right.textContent.length);
      const node = candidates[0];
      if (!node) return null;
      const ids = (node.getAttribute('aria-labelledby') || '').trim().split(/\\s+/).filter(Boolean);
      const labels = ids.map((id) => {
        const target = document.getElementById(id);
        return {
          id,
          exists: Boolean(target),
          text: target?.textContent.replace(/\\s+/g, ' ').trim() || '',
        };
      });
      const ariaLabel = node.getAttribute('aria-label') || '';
      return {
        role: node.getAttribute('role'),
        text: node.textContent.replace(/\\s+/g, ' ').trim(),
        ariaLabel,
        ariaLabelledby: node.getAttribute('aria-labelledby'),
        labels,
        labelReferenceValid: Boolean(ariaLabel.trim())
          || (labels.length > 0 && labels.every((label) => label.exists && label.text)),
      };
    })()`);
    const tree = await page.send('Accessibility.getFullAXTree');
    const axGroups = axGroupsContaining(tree, refusalText);
    fs.writeFileSync(
      path.join(output.directory, 'review-capture-refusal-name.ax.json'),
      `${JSON.stringify(tree, null, 2)}\n`,
    );
    const exactAxGroup = axGroups[0] ?? null;
    const properlyNamed = Boolean(
      domNotice?.labelReferenceValid && exactAxGroup?.name?.trim(),
    );
    const proof = {
      test: 'T011 review regression: Review capture refusal notice has a valid accessible name',
      browser: browserState.version.Browser,
      expectedText: refusalText,
      domNotice,
      axGroups,
      properlyNamed,
      network,
    };
    writeEvidenceJson(output, 'review-capture-refusal-name', proof);
    await saveRegressionProof(page, output, 'review-notice-name', proof);
    output.results.push({
      case: 'review-regression-notice-name',
      browser: browserState.version.Browser,
      domNotice,
      axGroups,
      properlyNamed,
      networkRequests: network.length,
    });

    // Assert
    assert.deepEqual(runtimeErrors, []);
    assert.equal(
      fixture.provider.read().requests.find(
        ({ requestHandle }) => requestHandle === publication.record.requestHandle,
      ).phase,
      'pending',
      'the named notice oracle exercises the real non-consuming capture refusal',
    );
    assert.ok(domNotice, 'the exact Review engine refusal MessageBar remains visually rendered');
    assert.ok(exactAxGroup, 'the exact rendered refusal has a native AX group');
    assert.equal(properlyNamed, true,
      'this specific Review refusal needs a mounted title reference or another valid explicit accessible label');
  } finally {
    fixture?.provider.dispose();
    if (fixture) await closeInstance(fixture.instanceId);
    if (fixture?.root) fs.rmSync(fixture.root, { recursive: true, force: true });
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
  }
});

test('T011 review regression: latest history navigation wins over superseded reads and errors', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't011-history-navigation-race');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  const runtimeErrors = [];
  const network = [];
  const paused = new Map();
  const terminal = new Map();
  const interceptionErrors = [];
  const driverEvents = [];
  const diagnosticStartedAt = Date.now();
  let transportSequence = 0;
  let droppedTransportEvents = 0;
  let diagnosticFailure = null;
  let diagnosticRecords = [];
  const recordTransport = (entry) => {
    const value = {
      sequence: ++transportSequence,
      elapsedMs: Date.now() - diagnosticStartedAt,
      ...entry,
    };
    if (network.length < 256) network.push(value);
    else droppedTransportEvents += 1;
  };
  const recordDriver = (phase, record, extra = {}) => {
    driverEvents.push({
      sequence: driverEvents.length + 1,
      elapsedMs: Date.now() - diagnosticStartedAt,
      phase,
      label: record.label,
      submissionId: record.submissionId,
      ...extra,
    });
  };
  const boundedObservation = async (label, probe) => {
    let timer;
    const observed = await Promise.race([
      Promise.resolve().then(probe).then(
        (value) => ({ available: true, value }),
        (error) => ({ available: false, reason: `${label}: ${error.message}` }),
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({
          available: false,
          reason: `${label}: diagnostic deadline after 1500ms`,
        }), 1_500);
      }),
    ]);
    clearTimeout(timer);
    return observed;
  };
  try {
    // Arrange: two immutable records are serialized as production history and
    // then independently accepted by the real adapter before the UI uses them.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t011-history-race-'));
    const feature = createIdea(root, 721, 'history-navigation', 'defined');
    const preview = createPreview(root, /** @type {any} */ (feature));
    const scope = { kind: 'feature', ideaPath: feature.ideaPath, specPath: feature.specPath };
    const historyA = createSealedHistory(root, scope, preview, {
      submissionId: '11111111-1111-4111-8111-111111111111',
      label: 'History A',
      revision: hash('history-a-artifact-revision'),
    });
    const historyB = createSealedHistory(root, scope, preview, {
      submissionId: '22222222-2222-4222-8222-222222222222',
      label: 'History B',
      revision: hash('history-b-artifact-revision'),
    });
    const successorFeature = createIdea(root, 722, 'history-successor', 'defined');
    const successorPreview = createPreview(root, /** @type {any} */ (successorFeature));
    const successorScope = {
      kind: 'feature',
      ideaPath: successorFeature.ideaPath,
      specPath: successorFeature.specPath,
    };
    const successorHistory = createSealedHistory(root, successorScope, successorPreview, {
      submissionId: '33333333-3333-4333-8333-333333333333',
      label: 'History successor',
      revision: hash('history-successor-artifact-revision'),
    });
    diagnosticRecords = [historyA, historyB];
    fixture = await createFixture(root);
    const validatedList = fixture.adapter.readHistory({
      scope,
      signal: new AbortController().signal,
    });
    const validatedA = fixture.adapter.readHistory({
      scope,
      submissionId: historyA.submissionId,
      signal: new AbortController().signal,
    });
    const validatedB = fixture.adapter.readHistory({
      scope,
      submissionId: historyB.submissionId,
      signal: new AbortController().signal,
    });
    assert.deepEqual(
      validatedList.items.map(({ submissionId }) => submissionId),
      [historyA.submissionId, historyB.submissionId],
    );
    assert.ok(validatedA.report.includes('History A retained report.'));
    assert.ok(validatedB.report.includes('History B retained report.'));
    assert.deepEqual(
      fixture.adapter.readHistory({
        scope: successorScope,
        signal: new AbortController().signal,
      }).items.map(({ submissionId }) => submissionId),
      [successorHistory.submissionId],
    );

    browserState = await startBrowser();
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));
    page.on('Network.requestWillBeSent', (event) => {
      const url = event.request.url.startsWith('data:')
        ? `data:${event.request.url.slice(5, event.request.url.indexOf(',') + 1)}[${event.request.url.length} characters]`
        : event.request.url;
      const entry = {
        phase: 'requested',
        requestId: event.requestId,
        method: event.request.method,
        url,
      };
      recordTransport(entry);
    });
    page.on('Network.loadingFinished', (event) => {
      terminal.set(event.requestId, { phase: 'finished', encodedDataLength: event.encodedDataLength });
      recordTransport({ phase: 'finished', requestId: event.requestId, encodedDataLength: event.encodedDataLength });
    });
    page.on('Network.loadingFailed', (event) => {
      terminal.set(event.requestId, {
        phase: 'failed',
        errorText: event.errorText,
        canceled: event.canceled ?? false,
      });
      recordTransport({
        phase: 'failed',
        requestId: event.requestId,
        errorText: event.errorText,
        canceled: event.canceled ?? false,
      });
    });
    page.on('Fetch.requestPaused', (event) => {
      const url = new URL(event.request.url);
      const submissionId = url.searchParams.get('submissionId');
      if (!submissionId) return;
      const records = paused.get(submissionId) ?? [];
      records.push(event);
      paused.set(submissionId, records);
      recordTransport({
        phase: 'paused-response',
        fetchRequestId: event.requestId,
        networkId: event.networkId,
        submissionId,
        status: event.responseStatusCode,
        url: event.request.url,
      });
    });

    await navigate(page, fixture, 1440, 'light');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Review history');
    await visible(page, historyA.submissionId);
    await visible(page, historyB.submissionId);
    await visible(page, 'Current task instruction');
    await until(
      () => evaluate(page, `${button('Refresh')}.getAttribute('aria-busy') !== 'true'`),
      'initial selected Context is no longer busy',
    );
    await until(() => {
      const initialIndexReads = network.filter(({ phase, url }) => (
        phase === 'requested' && url.endsWith('/api/work-index')
      ));
      return initialIndexReads.length > 0
        && initialIndexReads.every(({ requestId }) => terminal.has(requestId));
    }, 'initial selected Context work-index completion');
    await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() =>
      Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
    await click(page, button('New idea'));
    const localDraft = '  Local draft must survive superseded history.\n\nExact bytes.  ';
    await fill(page, field('Your idea'), localDraft);
    await click(page, button('Now'));
    await visible(page, 'Review history');
    await evaluate(page, `(() => {
      const ids = ${JSON.stringify([historyA.submissionId, historyB.submissionId])};
      const events = [], nodes = new WeakMap(), known = new Map();
      const counts = Object.fromEntries(ids.map((id) => [id, {
        pointerDown: 0,
        mouseDown: 0,
        mouseUp: 0,
        clickCapture: 0,
        clickBubble: 0,
      }]));
      const startedAt = performance.now();
      let sequence = 0, droppedEvents = 0, nextNode = 1, prior = '', gesture = null;
      const push = (kind, value) => {
        const entry = {
          sequence: ++sequence,
          elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
          kind,
          ...value,
        };
        if (events.length < 128) events.push(entry);
        else droppedEvents += 1;
      };
      const describe = (node) => {
        const element = node instanceof Element ? node : null;
        const button = element?.closest('button') ?? null;
        const submissionId = ids.find((id) => button?.textContent.includes(id)) ?? null;
        let nodeId = button && submissionId ? nodes.get(button) : null;
        if (button && submissionId && !nodeId) {
          nodeId = 'history-button-' + nextNode++;
          nodes.set(button, nodeId);
          known.set(nodeId, { node: button, submissionId });
        }
        return {
          tag: element?.tagName ?? null,
          submissionId,
          historyNodeId: nodeId,
          connected: element?.isConnected ?? null,
        };
      };
      const buttonState = (submissionId) => {
        const button = [...document.querySelectorAll('button')]
          .find((node) => node.textContent.includes(submissionId)) ?? null;
        if (!button) return { submissionId, present: false };
        const identified = describe(button);
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
          submissionId,
          historyNodeId: identified.historyNodeId,
          connected: button.isConnected,
          visible: Boolean(button.getClientRects().length),
          disabled: button.matches(':disabled,[aria-disabled="true"]'),
          rect: {
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          },
          correctCenterHit: describe(hit).historyNodeId === identified.historyNodeId,
        };
      };
      const current = () => {
        const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]');
        const visiblePanel = [...document.querySelectorAll('[role="tabpanel"]')]
          .find((node) => !node.hidden);
        return {
          heading: document.querySelector('h1')?.textContent.trim() || null,
          selectedView: selectedTab?.textContent.trim() || null,
          selectedTabId: selectedTab?.id || null,
          visiblePanelId: visiblePanel?.id || null,
          activeElement: describe(document.activeElement),
          buttons: ids.map(buttonState),
        };
      };
      const snapshot = (reason, force = false) => {
        const value = current();
        const signature = JSON.stringify([
          value.selectedTabId,
          value.visiblePanelId,
          value.buttons.map(({ historyNodeId, connected, rect }) => (
            [historyNodeId, connected, rect]
          )),
        ]);
        if (force || signature !== prior) {
          prior = signature;
          push('inventory', { reason, value });
        }
        return value;
      };
      const nativeEvent = (event) => {
        const eventTarget = describe(event.target);
        const relatedTarget = describe(event.relatedTarget);
        if ((event.type === 'pointerdown' || event.type === 'mousedown') && eventTarget.submissionId) {
          gesture = {
            submissionId: eventTarget.submissionId,
            historyNodeId: eventTarget.historyNodeId,
          };
        }
        if (!eventTarget.submissionId && !relatedTarget.submissionId && !gesture) return;
        if (eventTarget.submissionId) {
          if (event.type === 'pointerdown') counts[eventTarget.submissionId].pointerDown += 1;
          if (event.type === 'mousedown') counts[eventTarget.submissionId].mouseDown += 1;
          if (event.type === 'mouseup') counts[eventTarget.submissionId].mouseUp += 1;
          if (event.type === 'click') counts[eventTarget.submissionId].clickCapture += 1;
        }
        push('native-event', {
          type: event.type,
          target: eventTarget,
          relatedTarget,
          gesture,
          correctGestureTarget: gesture
            ? eventTarget.historyNodeId === gesture.historyNodeId
            : null,
          point: Number.isFinite(event.clientX) ? { x: event.clientX, y: event.clientY } : null,
          activeElement: describe(document.activeElement),
        });
        queueMicrotask(() => snapshot('after-' + event.type));
      };
      const bubbledClick = (event) => {
        const eventTarget = describe(event.target);
        if (!eventTarget.submissionId) return;
        counts[eventTarget.submissionId].clickBubble += 1;
        push('native-click-bubbled', {
          target: eventTarget,
          gesture,
          correctGestureTarget: eventTarget.historyNodeId === gesture?.historyNodeId,
        });
        gesture = null;
      };
      const eventTypes = ['pointerdown', 'mousedown', 'focusin', 'pointerup', 'mouseup', 'click', 'focusout'];
      for (const type of eventTypes) document.addEventListener(type, nativeEvent, true);
      document.addEventListener('click', bubbledClick, false);
      const observer = new MutationObserver(() => snapshot('history-inventory-mutation'));
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-selected'],
      });
      window.__t011HistoryDiagnostic = {
        snapshot,
        interaction(submissionId) {
          const value = current();
          return {
            clickBubble: counts[submissionId]?.clickBubble ?? 0,
            gestureSubmissionId: gesture?.submissionId ?? null,
            pressedNodeId: gesture?.historyNodeId ?? null,
            currentButton: value.buttons.find((buttonState) => (
              buttonState.submissionId === submissionId
            )) ?? null,
          };
        },
        nodeState(nodeId) {
          const node = known.get(nodeId)?.node ?? null;
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return {
            nodeId,
            connected: node.isConnected,
            rect: {
              x: Math.round(rect.x * 10) / 10,
              y: Math.round(rect.y * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
            },
          };
        },
        read() {
          const final = snapshot('final', true);
          observer.disconnect();
          for (const type of eventTypes) document.removeEventListener(type, nativeEvent, true);
          document.removeEventListener('click', bubbledClick, false);
          return {
            events,
            droppedEvents,
            counts,
            final,
            knownNodes: [...known].map(([nodeId, entry]) => {
              const node = entry.node;
              const rect = node.getBoundingClientRect();
              return {
                nodeId,
                submissionId: entry.submissionId,
                connected: node.isConnected,
                rect: {
                  x: Math.round(rect.x * 10) / 10,
                  y: Math.round(rect.y * 10) / 10,
                  width: Math.round(rect.width * 10) / 10,
                  height: Math.round(rect.height * 10) / 10,
                },
              };
            }),
          };
        },
      };
      snapshot('installed', true);
      return true;
    })()`);
    await page.send('Fetch.enable', {
      patterns: [{
        urlPattern: '*review/history*submissionId*',
        requestStage: 'Response',
      }],
    });

    const historyButton = (record) => `[...document.querySelectorAll('button')].find((node) =>
      node.innerText.includes(${JSON.stringify(record.submissionId)}) && node.getClientRects().length)`;
    const clickHistory = async (record) => {
      recordDriver('click-started', record);
      try {
        const expectedClickCount = driverEvents.filter((event) => (
          event.phase === 'click-driver-returned' && event.submissionId === record.submissionId
        )).length + 1;
        await click(page, historyButton(record));
        const interaction = await evaluate(
          page,
          `window.__t011HistoryDiagnostic.interaction(${JSON.stringify(record.submissionId)})`,
        );
        if (interaction.clickBubble !== expectedClickCount) {
          recordDriver('native-click-missing', record, interaction);
          throw new Error(`${record.label} native click did not complete; pressed node ${
            interaction.pressedNodeId ?? 'unavailable'
          }, current node ${interaction.currentButton?.historyNodeId ?? 'unavailable'}`);
        }
        recordDriver('click-driver-returned', record, {
          nativeClickCount: interaction.clickBubble,
        });
      } catch (error) {
        recordDriver('click-driver-failed', record, { message: error.message });
        throw error;
      }
    };
    const waitPaused = (record, occurrence) => until(() => (
      paused.get(record.submissionId)?.[occurrence] ?? null
    ), `${record.label} paused history response ${occurrence + 1}`);
    const waitTerminal = async (event, label) => {
      if (!event.networkId) return;
      await until(() => terminal.get(event.networkId), `${label} network completion`);
    };
    const continuePaused = async (event, label) => {
      try {
        await page.send('Fetch.continueRequest', { requestId: event.requestId });
        recordTransport({ phase: 'continued', fetchRequestId: event.requestId, networkId: event.networkId, label });
      } catch (error) {
        interceptionErrors.push({ label, action: 'continue', message: error.message });
      }
      await waitTerminal(event, label);
    };
    const failPaused = async (event, label) => {
      try {
        await page.send('Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'ConnectionReset',
        });
        recordTransport({ phase: 'failed-by-test', fetchRequestId: event.requestId, networkId: event.networkId, label });
      } catch (error) {
        interceptionErrors.push({ label, action: 'fail', message: error.message });
      }
      await waitTerminal(event, label);
    };
    const settleReact = () => evaluate(page, `new Promise((resolve) => requestAnimationFrame(() =>
      Promise.resolve().then(() => requestAnimationFrame(resolve))))`);
    const displayedSubmission = () => evaluate(page, `(() => {
      const text = document.body.innerText;
      for (const id of ${JSON.stringify([historyA.submissionId, historyB.submissionId])}) {
        if (text.includes('Submission: ' + id)) return id;
      }
      return null;
    })()`);

    // Act 1: hold A, press B, and let an ordinary workspace hint complete its
    // real work-index and history-list reads before releasing at the same point.
    await clickHistory(historyA);
    const aFirst = await waitPaused(historyA, 0);
    const workReadsBeforeGesture = network.filter(({ phase, url }) => (
      phase === 'requested' && url.endsWith('/api/work-index')
    )).length;
    const listReadsBeforeGesture = network.filter(({ phase, url }) => {
      if (phase !== 'requested' || typeof url !== 'string' || url.startsWith('data:')) return false;
      try {
        const parsed = new URL(url);
        return parsed.pathname === '/api/needs-you/review/history'
          && !parsed.searchParams.has('submissionId');
      } catch {
        return false;
      }
    }).length;
    const bRequestsBeforeGesture = network.filter(({ phase, url }) => {
      if (phase !== 'requested' || typeof url !== 'string' || url.startsWith('data:')) return false;
      try {
        const parsed = new URL(url);
        return parsed.pathname === '/api/needs-you/review/history'
          && parsed.searchParams.get('submissionId') === historyB.submissionId;
      } catch {
        return false;
      }
    }).length;
    const bPoint = await until(() => evaluate(page, `(() => {
      const node = ${historyButton(historyB)};
      if (!node) return null;
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const state = window.__t011HistoryDiagnostic.interaction(${JSON.stringify(historyB.submissionId)});
      return state.currentButton?.connected && state.currentButton.visible
        && state.currentButton.correctCenterHit && hit && (node === hit || node.contains(hit))
        ? { x, y, button: state.currentButton } : null;
    })()`), 'stable History B press point');
    recordDriver('press-started', historyB, { point: { x: bPoint.x, y: bPoint.y } });
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: bPoint.x,
      y: bPoint.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    const afterPress = await evaluate(
      page,
      `window.__t011HistoryDiagnostic.interaction(${JSON.stringify(historyB.submissionId)})`,
    );
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    const gestureIndexRequest = await until(() => {
      const indexRequests = network.filter(({ phase, url }) => (
        phase === 'requested' && url.endsWith('/api/work-index')
      ));
      return indexRequests.length > workReadsBeforeGesture ? indexRequests.at(-1) : null;
    }, 'workspace work-index reread between History B press and release');
    const gestureListRequest = await until(() => {
      const listRequests = network.filter(({ phase, url }) => {
        if (phase !== 'requested' || typeof url !== 'string' || url.startsWith('data:')) return false;
        try {
          const parsed = new URL(url);
          return parsed.pathname === '/api/needs-you/review/history'
            && !parsed.searchParams.has('submissionId');
        } catch {
          return false;
        }
      });
      return listRequests.length > listReadsBeforeGesture ? listRequests.at(-1) : null;
    }, 'history LIST reread between History B press and release');
    await Promise.all([
      until(
        () => terminal.get(gestureIndexRequest.requestId),
        'work-index response completion between History B press and release',
      ),
      until(
        () => terminal.get(gestureListRequest.requestId),
        'history LIST response completion between History B press and release',
      ),
    ]);
    await settleReact();
    const afterGestureRefresh = await evaluate(page, `(() => {
      const interaction = window.__t011HistoryDiagnostic.interaction(${JSON.stringify(historyB.submissionId)});
      return {
        ...interaction,
        pressedNode: window.__t011HistoryDiagnostic.nodeState(interaction.pressedNodeId),
      };
    })()`);
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: bPoint.x,
      y: bPoint.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await settleReact();
    const afterGestureRelease = await evaluate(
      page,
      `window.__t011HistoryDiagnostic.interaction(${JSON.stringify(historyB.submissionId)})`,
    );
    const bFirstObservation = await boundedObservation(
      'History B paused response after native release',
      () => until(
        () => paused.get(historyB.submissionId)?.[0] ?? null,
        'History B paused response after native release',
        1_500,
      ),
    );
    const bFirst = bFirstObservation.available ? bFirstObservation.value : null;
    const bPausedResponsesAfterGesture = paused.get(historyB.submissionId)?.length ?? 0;
    const bRequestsAfterGesture = network.filter(({ phase, url }) => {
      if (phase !== 'requested' || typeof url !== 'string' || url.startsWith('data:')) return false;
      try {
        const parsed = new URL(url);
        return parsed.pathname === '/api/needs-you/review/history'
          && parsed.searchParams.get('submissionId') === historyB.submissionId;
      } catch {
        return false;
      }
    }).length;
    if (afterGestureRelease.clickBubble === 1) {
      recordDriver('click-driver-returned', historyB, {
        nativeClickCount: afterGestureRelease.clickBubble,
      });
    }
    const gestureFindings = [];
    if (afterPress.pressedNodeId !== bPoint.button.historyNodeId) gestureFindings.push({
      check: 'pressed B node identity',
      expected: bPoint.button.historyNodeId,
      actual: afterPress.pressedNodeId,
    });
    if (afterGestureRefresh.pressedNode?.connected !== true
      || afterGestureRefresh.currentButton?.historyNodeId !== bPoint.button.historyNodeId
      || JSON.stringify(afterGestureRefresh.currentButton?.rect) !== JSON.stringify(bPoint.button.rect)
      || JSON.stringify(afterGestureRefresh.pressedNode?.rect) !== JSON.stringify(bPoint.button.rect)) {
      gestureFindings.push({
        check: 'B node remains connected, identical, and rect-stable through the LIST commit',
        expected: { nodeId: bPoint.button.historyNodeId, connected: true, rect: bPoint.button.rect },
        actual: {
          pressedNode: afterGestureRefresh.pressedNode,
          currentButton: afterGestureRefresh.currentButton,
        },
      });
    }
    if (afterGestureRelease.clickBubble !== 1) gestureFindings.push({
      check: 'one native bubbled click for B',
      expected: 1,
      actual: afterGestureRelease.clickBubble,
    });
    if (bRequestsAfterGesture - bRequestsBeforeGesture !== 1) gestureFindings.push({
      check: 'one History B HTTP request',
      expected: 1,
      actual: bRequestsAfterGesture - bRequestsBeforeGesture,
    });
    if (bPausedResponsesAfterGesture !== 1) gestureFindings.push({
      check: 'one paused History B response',
      expected: 1,
      actual: bPausedResponsesAfterGesture,
      observation: bFirstObservation.available ? 'available' : bFirstObservation.reason,
    });
    if (bFirst) {
      await continuePaused(bFirst, 'B completes before A');
      await visible(page, `Submission: ${historyB.submissionId}`);
    }
    await continuePaused(aFirst, 'late A after B');
    await settleReact();
    const afterAThenB = {
      expected: historyB.submissionId,
      displayed: await displayedSubmission(),
    };

    // Return to the draft that existed before the SSE gesture. History reads are
    // navigation only and must not touch this text.
    await click(page, button('Back'));
    await visible(page, 'Review history');
    await click(page, button('New idea'));
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), localDraft);
    await click(page, button('Now'));
    await visible(page, 'Review history');

    // Act 2: a late successful A must not open over the user's newer New idea.
    await clickHistory(historyA);
    const aSecond = await waitPaused(historyA, 1);
    await click(page, button('New idea'));
    assert.equal(await evaluate(page, `${field('Your idea')}.value`), localDraft);
    await continuePaused(aSecond, 'late A after New idea');
    await settleReact();
    const afterNewIdea = {
      heading: await evaluate(page, `document.querySelector('h1')?.textContent
        .replace(/\\s+/g, ' ').trim() || null`),
      historySubmission: await displayedSubmission(),
    };
    if (afterNewIdea.historySubmission) {
      await click(page, button('Back'));
      await visible(page, 'New idea');
    }
    const draftAfterLateSuccess = await evaluate(page, `${field('Your idea')}.value`);

    // Act 3: a superseded transport error is equally stale and must not put an
    // Action unavailable banner over the user's current New idea.
    await click(page, button('Now'));
    await visible(page, 'Review history');
    const bPausedBeforeLateError = paused.get(historyB.submissionId)?.length ?? 0;
    await clickHistory(historyB);
    const bSecond = await waitPaused(historyB, bPausedBeforeLateError);
    await click(page, button('New idea'));
    await failPaused(bSecond, 'late B error after New idea');
    await settleReact();
    const staleErrorText = 'The connection was interrupted. Delivery may be uncertain; nothing will be resent.';
    const afterLateError = await evaluate(page, `({
      heading: document.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      actionUnavailable: document.body.innerText.includes('Action unavailable'),
      staleError: document.body.innerText.includes(${JSON.stringify(staleErrorText)}),
      draft: ${field('Your idea')}?.value ?? null
    })`);
    await page.send('Fetch.disable');

    // A held list for the prior exact owner must neither appear under the
    // successor heading nor replace the successor's completed list.
    await click(page, button('Now'));
    await visible(page, 'Review history');
    const pausedLists = [];
    page.on('Fetch.requestPaused', (event) => {
      const url = new URL(event.request.url);
      if (url.pathname === '/api/needs-you/review/history'
        && !url.searchParams.has('submissionId')) pausedLists.push(event);
    });
    await page.send('Fetch.enable', {
      patterns: [{
        urlPattern: '*review/history*',
        requestStage: 'Response',
      }],
    });
    fixture.provider.onEvent({ id: randomUUID(), type: 'session.idle', data: { aborted: false } });
    const priorList = await until(() => pausedLists.find((event) => {
      const url = new URL(event.request.url);
      return url.searchParams.get('ideaPath') === feature.ideaPath
        && url.searchParams.get('specPath') === feature.specPath;
    }), 'held prior-owner history LIST response');
    await click(page, button('Back to Overview'));
    await click(page, `document.querySelector('[aria-label="Clear work selection"]')`);
    await click(page, `document.querySelector('[data-work-path="${successorFeature.ideaPath}"]')`);
    await visible(page, 'history successor');
    const successorList = await until(() => pausedLists.find((event) => {
      const url = new URL(event.request.url);
      return url.searchParams.get('ideaPath') === successorFeature.ideaPath
        && url.searchParams.get('specPath') === successorFeature.specPath;
    }), 'held successor history LIST response');
    const successorWhilePending = await evaluate(page, `({
      heading: document.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      successor: document.body.innerText.includes(${JSON.stringify(successorHistory.submissionId)}),
      priorA: document.body.innerText.includes(${JSON.stringify(historyA.submissionId)}),
      priorB: document.body.innerText.includes(${JSON.stringify(historyB.submissionId)})
    })`);
    await continuePaused(successorList, 'successor history LIST completes before prior owner');
    await visible(page, successorHistory.submissionId);
    const successorBeforeLateList = await evaluate(page, `({
      heading: document.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      successor: document.body.innerText.includes(${JSON.stringify(successorHistory.submissionId)}),
      priorA: document.body.innerText.includes(${JSON.stringify(historyA.submissionId)}),
      priorB: document.body.innerText.includes(${JSON.stringify(historyB.submissionId)})
    })`);
    await continuePaused(priorList, 'late prior-owner history LIST');
    await settleReact();
    const successorAfterLateList = await evaluate(page, `({
      heading: document.querySelector('h1')?.textContent.replace(/\\s+/g, ' ').trim() || null,
      successor: document.body.innerText.includes(${JSON.stringify(successorHistory.submissionId)}),
      priorA: document.body.innerText.includes(${JSON.stringify(historyA.submissionId)}),
      priorB: document.body.innerText.includes(${JSON.stringify(historyB.submissionId)})
    })`);
    await page.send('Fetch.disable');

    const findings = [];
    if (afterAThenB.displayed !== historyB.submissionId) findings.push({
      ordering: 'A held, B selected and completed, then A completed',
      expected: historyB.submissionId,
      actual: afterAThenB.displayed,
    });
    if (afterNewIdea.heading !== 'New idea' || afterNewIdea.historySubmission !== null) findings.push({
      ordering: 'A held, New idea selected, then A completed',
      expected: { heading: 'New idea', historySubmission: null },
      actual: afterNewIdea,
    });
    if (afterLateError.heading !== 'New idea' || afterLateError.actionUnavailable || afterLateError.staleError) {
      findings.push({
        ordering: 'B held, New idea selected, then B failed',
        expected: { heading: 'New idea', actionUnavailable: false, staleError: false },
        actual: afterLateError,
      });
    }
    if (draftAfterLateSuccess !== localDraft || afterLateError.draft !== localDraft) findings.push({
      ordering: 'local draft retention',
      expected: localDraft,
      actual: {
        afterLateSuccess: draftAfterLateSuccess,
        afterLateError: afterLateError.draft,
      },
    });
    if (successorWhilePending.heading !== '722 history successor' || successorWhilePending.successor
      || successorWhilePending.priorA || successorWhilePending.priorB) {
      findings.push({
        ordering: 'successor LIST pending while prior-owner LIST was held',
        expected: {
          heading: '722 history successor',
          successor: false,
          priorA: false,
          priorB: false,
        },
        actual: successorWhilePending,
      });
    }
    for (const [ordering, actual] of [
      ['successor LIST completed while prior-owner LIST was held', successorBeforeLateList],
      ['prior-owner LIST completed after successor LIST', successorAfterLateList],
    ]) {
      if (actual.heading !== '722 history successor' || !actual.successor || actual.priorA || actual.priorB) {
        findings.push({
          ordering,
          expected: {
            heading: '722 history successor',
            successor: true,
            priorA: false,
            priorB: false,
          },
          actual,
        });
      }
    }
    const metrics = {
      test: 'T011 review regression: latest history navigation wins over superseded reads and errors',
      browser: browserState.version.Browser,
      validatedRecords: validatedList.items,
      afterAThenB,
      afterNewIdea,
      draftAfterLateSuccess,
      afterLateError,
      nativePressRefreshRelease: {
        point: { x: bPoint.x, y: bPoint.y },
        beforePress: bPoint.button,
        afterPress,
        afterRefresh: afterGestureRefresh,
        afterRelease: afterGestureRelease,
        bHttpRequests: bRequestsAfterGesture - bRequestsBeforeGesture,
        bPausedResponses: bPausedResponsesAfterGesture,
        findings: gestureFindings,
      },
      exactContextListRace: {
        whileSuccessorPending: successorWhilePending,
        beforeLatePriorList: successorBeforeLateList,
        afterLatePriorList: successorAfterLateList,
      },
      findings,
      interceptionErrors,
      network,
    };
    writeEvidenceJson(output, 'history-navigation-race.network', network);
    writeEvidenceJson(output, 'history-navigation-race.metrics', metrics);
    await saveRegressionProof(page, output, 'history-navigation-race', metrics);
    output.results.push({
      case: 'review-regression-history-navigation-race',
      browser: browserState.version.Browser,
      afterAThenB,
      afterNewIdea,
      afterLateError,
      gestureFindings,
      localDraftRetained: draftAfterLateSuccess === localDraft && afterLateError.draft === localDraft,
      findings,
      networkRequests: network.filter(({ phase }) => phase === 'requested').length,
    });

    // Assert
    assert.deepEqual(runtimeErrors, []);
    assert.equal(draftAfterLateSuccess, localDraft);
    assert.equal(afterLateError.draft, localDraft);
    assert.deepEqual(gestureFindings, [],
      'History B must remain the same connected target through a real SSE LIST commit and complete one native click/request');
    assert.deepEqual(findings, [],
      'late history success/error responses must not replace or annotate a newer explicit navigation choice');
  } catch (error) {
    diagnosticFailure = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    throw error;
  } finally {
    let diagnosticRetentionError = null;
    const dom = browserState
      ? await boundedObservation('final history DOM observation', () => evaluate(
        browserState.page,
        `window.__t011HistoryDiagnostic?.read() ?? null`,
      ))
      : { available: false, reason: 'final history DOM observation: browser was not started' };
    const historyRequests = network.filter(({ phase, url }) => {
      if (phase !== 'requested' || typeof url !== 'string' || url.startsWith('data:')) return false;
      try { return new URL(url).pathname === '/api/needs-you/review/history'; }
      catch { return false; }
    });
    const historyHttpCounts = Object.fromEntries(diagnosticRecords.map((record) => [
      record.submissionId,
      historyRequests.filter(({ url }) => {
        try { return new URL(url).searchParams.get('submissionId') === record.submissionId; }
        catch { return false; }
      }).length,
    ]));
    const listHttpCount = historyRequests.filter(({ url }) => {
      try { return !new URL(url).searchParams.has('submissionId'); }
      catch { return false; }
    }).length;
    const transportCounts = (pathname) => network.filter(({ phase, url }) => {
      if (phase !== 'requested' || typeof url !== 'string' || url.startsWith('data:')) return false;
      try { return new URL(url).pathname === pathname; }
      catch { return false; }
    }).length;
    const diagnostic = {
      test: 'T011 review regression: latest history navigation wins over superseded reads and errors',
      status: diagnosticFailure ? 'failed' : 'completed',
      failure: diagnosticFailure,
      browser: browserState?.version.Browser ?? null,
      driverEvents,
      interactionCounts: {
        driverClickCalls: Object.fromEntries(diagnosticRecords.map((record) => [
          record.submissionId,
          driverEvents.filter((event) => (
            event.phase === 'click-started' && event.submissionId === record.submissionId
          )).length,
        ])),
        historyHttpRequests: historyHttpCounts,
        historyListHttpRequests: listHttpCount,
        workspaceRefreshHttpRequests: transportCounts('/api/refresh'),
        workIndexHttpRequests: transportCounts('/api/work-index'),
      },
      pausedResponseCounts: Object.fromEntries(diagnosticRecords.map((record) => [
        record.submissionId,
        paused.get(record.submissionId)?.length ?? 0,
      ])),
      terminal: [...terminal].map(([requestId, value]) => ({ requestId, ...value })),
      interceptionErrors,
      transportEvents: network,
      droppedTransportEvents,
      dom,
    };
    try {
      writeEvidenceJson(output, 'history-navigation-race.network', network);
      writeEvidenceJson(output, 'history-navigation-race.diagnostic', diagnostic);
      if (diagnosticFailure) {
        output.results.push({
          case: 'review-regression-history-navigation-race-diagnostic',
          status: 'failed',
          failure: diagnosticFailure.message,
          interactionCounts: diagnostic.interactionCounts,
          pausedResponseCounts: diagnostic.pausedResponseCounts,
        });
      }
    } catch (error) {
      diagnosticRetentionError = error;
      context.diagnostic(`T011 history diagnostic retention failed: ${error.message}`);
    }
    fixture?.provider.dispose();
    if (fixture) await closeInstance(fixture.instanceId);
    if (fixture?.root) fs.rmSync(fixture.root, { recursive: true, force: true });
    if (browserState) {
      await cleanupBrowserDriver(browserState);
    }
    board.close();
    if (!diagnosticFailure && diagnosticRetentionError) throw diagnosticRetentionError;
  }
});

test('T012 review regression: the selected-element context summary collapses source whitespace while its stored text stays literal', {
  timeout: 180_000,
  concurrency: false,
}, async (context) => {
  if (!browserReady(context)) return;
  const output = evidence(context, 't012-context-whitespace');
  const board = installEmptyBoard();
  let browserState;
  let fixture;
  let publication;
  const runtimeErrors = [];
  const observations = {
    convention: 'Browsers render body copy with collapsed whitespace; only code, transcript, and user-authored surfaces keep literal newlines. '
      + 'The captured-context summary is body copy about the element, so it follows that convention while the stored annotation text stays literal.',
    reproduced: 'The reported panel painted a 445-byte header of 46 lines, 37 of them blank, as a 920px-tall paragraph at a 20px line height.',
    cases: [],
    saved: null,
    sealed: null,
    runtimeErrors,
  };
  context.after(() => writeEvidenceJson(output, 'context-whitespace.metrics', observations));
  try {
    // Arrange: a fixture whose header carries the same kind of source
    // whitespace the reported mock carried — blank-line runs and indentation
    // between its children — beside an ordinary single-line paragraph that has
    // none, so the collapse can be shown to change only the first one.
    const headerLines = [
      '    <span class="brand">Dude Canvas workspace</span>',
      ...Array(11).fill(''),
      '    <span class="crumb">Ideas and features, newest capture first</span>',
      ...Array(8).fill(''),
      '    <span class="crumb">062 Canvas workspace integration</span>',
      ...Array(9).fill(''),
      '    <button type="button" id="shell-review">Review this design</button>',
      ...Array(9).fill(''),
      '    <button type="button" id="shell-send">Send annotations to the design owner</button>',
    ];
    const headerText = `\n${headerLines.map((line) => line.replace(/<[^>]+>/g, '')).join('\n')}\n`;
    const headerCollapsed = headerText.replace(/\s+/gu, ' ').trim();
    const viewHeadText = 'Ideas and features, newest capture first. Number shows capture order only.';
    const userComment = 'After placing  a comment marker, this context box was unreadable.';
    const headerStats = {
      bytes: Buffer.byteLength(headerText),
      lineCount: headerText.split('\n').length,
      blankLineCount: headerText.split('\n').filter((line) => line.trim() === '').length,
      maxBlankRun: headerText.split('\n').reduce((state, line) => {
        const run = line.trim() === '' ? state.run + 1 : 0;
        return { run, max: Math.max(state.max, run) };
      }, { run: 0, max: 0 }).max,
      collapsedLength: headerCollapsed.length,
    };
    assert.ok(headerStats.blankLineCount >= 30 && headerStats.maxBlankRun >= 8,
      `the fixture must reproduce the reported blank-line shape: ${JSON.stringify(headerStats)}`);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-t012-context-whitespace-'));
    const feature = createIdea(root, 907, 'context-whitespace-regression', 'defined');
    assert.ok(feature.specPath);
    const artifactPath = `${path.posix.dirname(feature.specPath)}/design/mock.html`;
    write(root, artifactPath, [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width">',
      '<title>T012 context whitespace fixture</title><style>',
      'html,body{margin:0;font:16px/1.5 system-ui;background:#fff;color:#242424}',
      '#shell-bar{display:flex;gap:16px;align-items:center;padding:16px;border-bottom:2px solid #0f6cbd}',
      'main{padding:32px;min-height:700px;box-sizing:border-box}',
      '#view-head{margin:24px 0 0;max-width:640px}',
      'button{font:inherit;min-height:32px}',
      '</style></head><body>',
      '<header id="shell-bar" aria-label="Shell bar">',
      ...headerLines,
      '</header>',
      '<main><h1 id="heading">Workspace integration</h1>',
      `<p id="view-head">${viewHeadText}</p>`,
      '</main></body></html>',
    ].join('\n'));
    write(root, feature.specPath, [
      '---',
      `preview_path: ${artifactPath}`,
      '---',
      '',
      '# Context whitespace fixture',
      '',
    ].join('\n'));
    const preview = {
      artifact: {
        path: artifactPath,
        revision: hash(fs.readFileSync(path.join(root, ...artifactPath.split('/')))),
      },
      assets: [],
    };
    fixture = await createFixture(root);
    const scope = { kind: 'feature', ideaPath: feature.ideaPath, specPath: feature.specPath };
    const request = requestFor(fixture, 'preview', preview, scope);
    request.prompt = 'Comment on the captured elements of this mock.';
    publication = await publish(fixture, request);
    browserState = await startBrowser(1, true);
    const { page } = browserState;
    page.on('Runtime.exceptionThrown', (event) => runtimeErrors.push(event));

    // The reported panel ran at this exact window and display scale.
    await viewport(page, 1499, 'light', 1219, 1);
    await page.send('Page.navigate', { url: fixture.instance.url });
    await visible(page, 'Connected');
    await click(page, `document.querySelector('[data-work-path="${feature.ideaPath}"]')`);
    await visible(page, 'Defined feature');
    await click(page, button('Review design'));
    await until(() => evaluate(page, `Boolean(document.querySelector('.dude-review-overlay'))
      && !document.querySelector('[aria-label="Comment (C)"]')?.disabled`),
    'context-whitespace Review engine', 60_000);

    const workingFile = () => {
      const reviews = path.join(root, ...path.posix.dirname(feature.specPath).split('/'), 'reviews');
      if (!fs.existsSync(reviews)) return null;
      const submission = fs.readdirSync(reviews).sort()
        .find((name) => fs.existsSync(path.join(reviews, name, 'working.json')));
      return submission ? path.join(reviews, submission, 'working.json') : null;
    };
    const workingState = () => {
      const file = workingFile();
      return file ? JSON.parse(fs.readFileSync(file, 'utf8')).state : null;
    };
    const commentsOpen = () => evaluate(page, `Boolean(document.querySelector(
      '[aria-label="Close comments"]'
    )?.getClientRects().length)`);

    /** @param {string} option @param {string} selector @param {number} expected */
    const addCommentFor = async (option, selector, expected) => {
      await openReviewDetails(page);
      await until(() => evaluate(page, `Boolean(${field('Choose an element')})`), 'disclosed element chooser');
      await choose(page, 'Choose an element', option);
      await click(page, button('Add comment'));
      await until(() => commentsOpen(), `Comments open for ${option}`);
      return structuredClone(await until(() => {
        const state = workingState();
        return state && state.annotations.length === expected
          && state.annotations.at(-1)?.element?.selector === selector ? state : null;
      }, `saved annotation for ${option}`, 60_000));
    };
    const closeComments = async (label) => {
      await click(page, button('Done'));
      await until(async () => !await commentsOpen(), `Comments closed after ${label}`);
    };

    /**
     * Measure the rendered context summary beside two test-owned controls at
     * the same width: the same literal text under the rule the panel uses, and
     * under the `pre-wrap` rule it replaced. The controls live and die inside
     * this measurement, so no live style or source is changed to prove the
     * negative.
     * @param {string} raw
     */
    const measureContext = (raw) => evaluate(page, `(() => {
      const raw=${JSON.stringify(raw)};
      const paragraph=[...document.querySelectorAll('p')]
        .find(node=>node.textContent===raw&&node.getClientRects().length);
      if(!paragraph) return null;
      const style=getComputedStyle(paragraph);
      const rect=paragraph.getBoundingClientRect();
      const range=document.createRange();
      range.selectNodeContents(paragraph);
      const lineBoxes=[...range.getClientRects()].length;
      const container=paragraph.parentElement.getBoundingClientRect();
      const host=document.createElement('div');
      host.style.cssText=['position:absolute','left:-20000px','top:0','visibility:hidden',
        'width:'+rect.width+'px','z-index:-1'].join(';');
      const collapsed=paragraph.cloneNode(true);
      collapsed.style.setProperty('white-space','normal','important');
      const preWrap=paragraph.cloneNode(true);
      preWrap.style.setProperty('white-space','pre-wrap','important');
      host.append(collapsed,preWrap);
      // Measured inside the panel the summary lives in, so both controls
      // inherit the same font, size, and width it actually renders with.
      paragraph.parentElement.append(host);
      const controls={
        collapsed:{
          textEqualsRaw:collapsed.textContent===raw,
          whiteSpace:getComputedStyle(collapsed).whiteSpace,
          height:collapsed.getBoundingClientRect().height,
        },
        preWrap:{
          textEqualsRaw:preWrap.textContent===raw,
          whiteSpace:getComputedStyle(preWrap).whiteSpace,
          height:preWrap.getBoundingClientRect().height,
        },
      };
      host.remove();
      return {
        textEqualsRaw:paragraph.textContent===raw,
        innerText:paragraph.innerText,
        computed:{
          whiteSpace:style.whiteSpace,
          overflowWrap:style.overflowWrap,
          lineHeight:parseFloat(style.lineHeight),
        },
        width:rect.width,
        height:rect.height,
        lineBoxes,
        container:{width:container.width},
        commentsOpen:Boolean(document.querySelector('[aria-label="Close comments"]')?.getClientRects().length),
        controls,
      };
    })()`);

    /**
     * @param {any} metrics @param {string} label @param {string} raw
     * @param {{maxLines:number, collapsesWhitespace:boolean}} expected
     */
    const assertContext = (metrics, label, raw, expected) => {
      assert.ok(metrics, `${label}: the context summary is rendered`);
      assert.equal(metrics.textEqualsRaw, true, `${label}: the literal captured text stays in the DOM`);
      assert.equal(metrics.computed.whiteSpace, 'normal', `${label}: source whitespace is collapsed for display`);
      assert.equal(metrics.computed.overflowWrap, 'anywhere', `${label}: long unbroken strings still break`);
      assert.equal(metrics.innerText.replace(/\s+/gu, ' ').trim(), raw.replace(/\s+/gu, ' ').trim(),
        `${label}: every captured word is still readable`);
      assert.ok(metrics.width <= metrics.container.width + 1,
        `${label}: the summary stays inside its panel: ${JSON.stringify(metrics)}`);
      assert.ok(metrics.height <= metrics.computed.lineHeight * expected.maxLines,
        `${label}: the summary is ${metrics.height}px, over ${expected.maxLines} lines of ${metrics.computed.lineHeight}px`);
      assert.equal(metrics.controls.collapsed.textEqualsRaw, true, `${label}: the control carries the same literal text`);
      assert.ok(Math.abs(metrics.controls.collapsed.height - metrics.height) <= 1,
        `${label}: the rendered height is the collapsed-whitespace height: ${JSON.stringify(metrics)}`);
      if (expected.collapsesWhitespace) {
        assert.ok(metrics.controls.preWrap.height >= metrics.height * 5,
          `${label}: the replaced pre-wrap rule painted ${metrics.controls.preWrap.height}px for the same text`);
        assert.ok(metrics.controls.preWrap.height >= 600,
          `${label}: the reported empty height is reproduced by the control: ${JSON.stringify(metrics.controls)}`);
      } else {
        assert.equal(metrics.controls.preWrap.height, metrics.height,
          `${label}: text without source newlines is unaffected by the rule`);
      }
    };

    // Act: the first selection this review ever had is the whitespace-heavy
    // element, which is how the incident was reported.
    const first = await addCommentFor('Shell bar', '#shell-bar', 1);
    const headerId = first.annotations[0].id;
    assert.equal(first.annotations[0].element.text, headerText,
      'the inspector still captures the literal element text');
    const firstMetrics = await measureContext(headerText);
    assertContext(firstMetrics, 'first selection at 1499x1219', headerText,
      { maxLines: 8, collapsesWhitespace: true });
    await fill(page, field('Comment (optional)'), userComment);
    await until(() => workingState()?.annotations[0]?.comment === userComment, 'literal comment kept');
    const literalStyles = await evaluate(page, `(() => {
      const row=document.querySelector('[data-annotation-id][aria-current="true"]');
      const comment=[...(row?.querySelectorAll('span')||[])]
        .find(node=>node.textContent===${JSON.stringify(userComment)});
      const selector=[...document.querySelectorAll('span')]
        .find(node=>node.textContent==='#shell-bar'&&node.getClientRects().length);
      return {
        comment:comment?{text:comment.textContent,whiteSpace:getComputedStyle(comment).whiteSpace}:null,
        selector:selector?{whiteSpace:getComputedStyle(selector).whiteSpace}:null,
      };
    })()`);
    assert.equal(literalStyles.comment?.text, userComment, 'the reviewer comment is shown exactly as typed');
    assert.equal(literalStyles.comment?.whiteSpace, 'pre-wrap',
      'reviewer comments keep their own literal line breaks');
    assert.equal(literalStyles.selector?.whiteSpace, 'pre-wrap',
      'the captured selector keeps its code presentation');
    await closeComments('first selection');

    // A later selection of ordinary single-line text is unchanged.
    const second = await addCommentFor(viewHeadText, '#view-head', 2);
    assert.equal(second.annotations[1].element.text, viewHeadText,
      'the single-line control carries its own captured text');
    const viewHeadMetrics = await measureContext(viewHeadText);
    assertContext(viewHeadMetrics, 'single-line element', viewHeadText,
      { maxLines: 4, collapsesWhitespace: false });
    await closeComments('single-line element');

    // The same whitespace-heavy element, selected later from the list.
    await click(page, `[...document.querySelectorAll('button')]
      .find(node => /^Comments \\(\\d+\\)$/.test(node.innerText.trim()) && node.getClientRects().length)`);
    await until(() => commentsOpen(), 'Comments reopened for a later selection');
    await click(page, `document.querySelector('[data-annotation-id="${headerId}"]')`);
    await until(() => evaluate(page, `document.querySelector(
      '[data-annotation-id="${headerId}"]'
    )?.getAttribute('aria-current') === 'true'`), 'the earlier annotation is selected again');
    const laterMetrics = await measureContext(headerText);
    assertContext(laterMetrics, 'later selection at 1499x1219', headerText,
      { maxLines: 8, collapsesWhitespace: true });
    const wideScreenshot = Buffer.from((await page.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
    })).data, 'base64');
    fs.writeFileSync(path.join(output.directory, 'context-summary-1499.png'), wideScreenshot);

    // Narrow width keeps the summary collapsed, wrapped, and reachable.
    await viewport(page, 420, 'light', 1219, 1);
    await until(() => commentsOpen(), 'Comments stay open at a narrow width');
    const narrowMetrics = await measureContext(headerText);
    assertContext(narrowMetrics, 'later selection at 420 wide', headerText,
      { maxLines: 14, collapsesWhitespace: true });
    assert.ok(narrowMetrics.lineBoxes >= 2,
      `the narrow summary still wraps: ${JSON.stringify(narrowMetrics)}`);
    assert.equal(narrowMetrics.commentsOpen, true, 'the panel is still usable at a narrow width');
    const narrowScreenshot = Buffer.from((await page.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
    })).data, 'base64');
    fs.writeFileSync(path.join(output.directory, 'context-summary-420.png'), narrowScreenshot);

    // Assert: nothing the reviewer or the inspector stored was normalized.
    const savedBytes = fs.readFileSync(/** @type {string} */ (workingFile()));
    const saved = JSON.parse(savedBytes.toString('utf8')).state;
    assert.equal(saved.annotations.length, 2);
    assert.equal(saved.annotations[0].element.text, headerText);
    assert.equal(saved.annotations[1].element.text, viewHeadText);
    assert.equal(saved.annotations[0].comment, userComment);
    assert.ok(savedBytes.includes(Buffer.from(JSON.stringify(headerText).slice(1, -1), 'utf8')),
      'the persisted markup carries the captured text verbatim');

    observations.saved = {
      headerTextSha256: sha256(headerText),
      savedHeaderTextSha256: sha256(saved.annotations[0].element.text),
      comment: saved.annotations[0].comment,
      workingBytes: savedBytes.length,
    };

    // The display-only rule must not normalize the state when the ordinary
    // production flow seals it. Return to the original wide shell, wait for
    // the current working bytes to settle, then send through the same UI and
    // provider path used by the main Review acceptance.
    await closeComments('the narrow context check');
    await viewport(page, 1499, 'light', 1219, 1);
    await until(() => evaluate(page, `Boolean(${button('Save markup')}
      ?.matches('[aria-disabled="true"]'))`), 'context markup saved before sealing', 60_000);
    const workingPath = /** @type {string} */ (workingFile());
    const sealBaseline = fs.readFileSync(workingPath);
    const artifactBeforeSeal = fs.readFileSync(path.join(root, ...artifactPath.split('/')));
    await click(page, button('Send annotations'));
    await evaluate(page, `(${button('Send annotations')})?.click()`);
    const toolResult = await publication.result;
    const delivered = JSON.parse(toolResult.textResultForLlm);
    const reviewDirectory = path.dirname(workingPath);
    const reportBytes = fs.readFileSync(path.join(reviewDirectory, 'report.md'));
    const report = reportBytes.toString('utf8');
    const provenanceBytes = fs.readFileSync(path.join(reviewDirectory, 'provenance.json'));
    const provenance = JSON.parse(provenanceBytes.toString('utf8'));
    const imageBytes = fs.readFileSync(path.join(reviewDirectory, 'annotated.png'));
    const sealedWorking = fs.readFileSync(workingPath);
    const sealedState = JSON.parse(sealedWorking.toString('utf8')).state;
    const artifactAfterSeal = fs.readFileSync(path.join(root, ...artifactPath.split('/')));

    assert.deepEqual(fs.readdirSync(reviewDirectory).sort(), [
      'annotated.png',
      'provenance.json',
      'report.md',
      'working.json',
    ]);
    assert.deepEqual(sealedWorking, sealBaseline,
      'sealing leaves the settled literal working state byte-identical');
    assert.deepEqual(artifactAfterSeal, artifactBeforeSeal,
      'sealing does not change the canonical source');
    assert.equal(hash(artifactAfterSeal), preview.artifact.revision,
      'the sealed report still answers to the original source revision');
    assert.equal(sealedState.annotations[0].element.text, headerText);
    assert.equal(sealedState.annotations[1].element.text, viewHeadText);
    assert.equal(sealedState.annotations[0].comment, userComment);
    assert.ok(report.includes(headerText),
      'the report retains the whitespace-heavy captured text literally');
    assert.ok(report.includes(viewHeadText),
      'the report retains the single-line captured text');
    assert.ok(report.includes(userComment),
      'the report retains the reviewer comment, including its double space');
    assert.deepEqual(
      provenance.capture.selectors.map(({ annotationId, selector }) => ({
        annotationId,
        selector,
      })),
      [
        {annotationId:headerId,selector:'#shell-bar'},
        {annotationId:second.annotations[1].id,selector:'#view-head'},
      ],
      'the seal keeps both original annotation IDs and selector anchors',
    );
    assert.equal(toolResult.resultType, 'success');
    assert.equal(toolResult.binaryResultsForLlm.length, 1);
    const deliveredImage = Buffer.isBuffer(toolResult.binaryResultsForLlm[0].data)
      ? toolResult.binaryResultsForLlm[0].data
      : typeof toolResult.binaryResultsForLlm[0].data === 'string'
        ? Buffer.from(toolResult.binaryResultsForLlm[0].data, 'base64')
        : Buffer.from(toolResult.binaryResultsForLlm[0].data);
    assert.equal(
      deliveredImage.equals(imageBytes),
      true,
      'the original waiter receives the exact sealed context image',
    );
    assert.equal(delivered.status, 'awaiting_acknowledgment');
    assert.equal(delivered.response.action, 'annotations');
    assert.equal(
      fixture.provider.read().requests.find(
        ({ requestHandle }) => requestHandle === publication.record.requestHandle,
      )?.phase,
      'awaiting_acknowledgment',
    );
    assert.deepEqual(runtimeErrors, []);
    observations.sealed = {
      files:fs.readdirSync(reviewDirectory).sort(),
      workingSha256:sha256(sealedWorking),
      reportSha256:sha256(reportBytes),
      imageSha256:sha256(imageBytes),
      provenanceSha256:sha256(provenanceBytes),
      sourceRevision:hash(artifactAfterSeal),
      selectors:provenance.capture.selectors.map(({ annotationId, selector }) => ({
        annotationId,
        selector,
      })),
      status:delivered.status,
    };
    observations.cases.push(
      { case: 'first selection at 1499x1219', stats: headerStats, metrics: firstMetrics },
      { case: 'single-line element', metrics: viewHeadMetrics },
      { case: 'later selection at 1499x1219', metrics: laterMetrics },
      { case: 'later selection at 420 wide', metrics: narrowMetrics },
    );
    output.results.push({
      case: 'T012 review regression: captured-context whitespace',
      pass: true,
      browser: browserState.version.Browser,
      appRevision: `sha256:${output.sources['src/extensions/dude/ui/assets/app.js']}`,
      contextHeight: {
        wide: firstMetrics.height,
        wideReplacedPreWrapControl: firstMetrics.controls.preWrap.height,
        narrow: narrowMetrics.height,
        narrowReplacedPreWrapControl: narrowMetrics.controls.preWrap.height,
      },
    });
  } finally {
    if (publication) {
      publication.controller.abort();
      await publication.result.catch(() => {});
    }
    if (browserState) await cleanupBrowserDriver(browserState);
    if (fixture) await fixture.close();
    board.close();
  }
});

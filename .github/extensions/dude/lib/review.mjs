// @ts-check
/**
 * Exact-owner HTML review outputs. No workflow mutations or session sending.
 * Small-file/submission patterns adapted from Sharpie; MIT, ui/review/NOTICE.txt.
 * Copyright (c) 2026 Enrique Gonzalez.
 *
 * Only the joined Needs You provider calls this adapter. Allocations and capture
 * attestations are ephemeral; files alone can never supply a live binding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveFeatureOwner } from '../../../skills/dude-engine/lib/feature.mjs';
import { parseFrontmatterScalars, parseIdeaIdentity, parseSpecIdentity } from '../../../skills/dude-engine/lib/feature-identity.mjs';
import { resolveMutationPath } from '../../../skills/dude-engine/lib/workspace-paths.mjs';
import { capturePage, preflightCapture } from './review/browser.mjs';
import { decodePng } from './review/png.mjs';
import { imageIsStatic } from '../ui/review/inspector.mjs';
import { portableElement, projectElement } from '../ui/review/geometry.mjs';
import {
  REVIEW_LIMITS, ReviewError, requireReview, hash, jsonBytes, same, isHash, isUuid,
  object, string, workingState, emptyState, assertVisibleAnnotations, buildReport,
} from './review/data.mjs';

export { REVIEW_LIMITS, ReviewError } from './review/data.mjs';

const UI_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../ui/review');
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
});
const identity = stat => ({ dev: stat.dev, ino: stat.ino });
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const liveBinding = input => ({
  workspaceId: input.workspaceId, sessionId: input.sessionId,
  providerGeneration: input.providerGeneration, toolCallId: input.toolCallId,
  requestHandle: input.requestHandle,
});
const encodePath = value => value.split('/').map(encodeURIComponent).join('/');

/** @param {{root:string}} options */
export function createReview({ root }) {
  root = path.resolve(root);
  const initialRoot = fs.lstatSync(root), realRoot = fs.realpathSync(root);
  const allocations = new Map();
  let closed = false;
  let capability = null;

  function safePath(relative) {
    try {
      const current = fs.lstatSync(root);
      requireReview(!closed && current.isDirectory() && !current.isSymbolicLink()
        && sameFile(current, initialRoot) && fs.realpathSync(root) === realRoot, 'review_unsafe_path');
      requireReview(typeof relative === 'string' && !/[\\?#%]/.test(relative)
        && !path.posix.isAbsolute(relative) && !path.win32.isAbsolute(relative)
        && relative.split('/').every(p => p && p !== '.' && p !== '..'), 'review_unsafe_path');
      return resolveMutationPath(root, relative);
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      throw new ReviewError('review_unsafe_path');
    }
  }
  function readRegular(relative, limit) {
    let fd;
    try {
      const absolute = safePath(relative);
      fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const before = fs.fstatSync(fd);
      requireReview(before.isFile() && before.nlink === 1 && before.size <= limit, 'review_unsafe_path');
      const bytes = Buffer.alloc(before.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const n = fs.readSync(fd, bytes, count, bytes.length - count, null);
        if (!n) break;
        count += n;
      }
      const after = fs.fstatSync(fd), current = fs.lstatSync(safePath(relative));
      requireReview(count === before.size && sameFile(before, after) && sameFile(after, current)
        && before.size === after.size && current.size === after.size
        && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs
        && current.mtimeMs === after.mtimeMs && current.ctimeMs === after.ctimeMs, 'review_source_changed');
      return bytes.subarray(0, count);
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      throw new ReviewError('review_unsafe_path');
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function parse(bytes) {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new ReviewError('review_evidence_invalid', 422); }
  }
  function source(input) {
    input.signal.throwIfAborted();
    requireReview(input.root === root && input.request.class === 'preview'
      && input.request.scope.kind === 'feature', 'review_unavailable');
    const { scope, fields: preview } = input.request;
    safePath(scope.specPath); safePath(scope.ideaPath);
    const resolved = resolveFeatureOwner({ root, specPath: scope.specPath });
    requireReview(!resolved.diagnostics.length && resolved.owner?.ideaPath === scope.ideaPath, 'review_source_changed');
    const spec = readRegular(scope.specPath, 8 * 1024 * 1024);
    const scalars = parseFrontmatterScalars(spec);
    const designRoot = `${path.posix.dirname(scope.specPath)}/design/`;
    requireReview(scalars.scalars.get('preview_path')?.value === preview.artifact.path
      && preview.artifact.path.startsWith(designRoot) && /\.html?$/.test(preview.artifact.path), 'review_source_changed');
    const files = new Map();
    let total = 0;
    for (const entry of [preview.artifact, ...preview.assets]) {
      requireReview(entry.path.startsWith(designRoot) && isHash(entry.revision), 'review_source_changed');
      const bytes = readRegular(entry.path, 8 * 1024 * 1024);
      total += bytes.length;
      requireReview(total <= 32 * 1024 * 1024 && hash(bytes) === entry.revision, 'review_source_changed');
      const mime = MIME[path.extname(entry.path).toLowerCase()];
      requireReview(mime, 'review_unavailable');
      if (mime.startsWith('image/')) requireReview(imageIsStatic(bytes), 'review_transient_unsupported');
      files.set(entry.path, { bytes, mime });
    }
    return { files, designRoot };
  }
  function directory(input) {
    requireReview(isUuid(input.submissionId));
    return `${path.posix.dirname(input.request.scope.specPath)}/reviews/${input.submissionId}`;
  }
  function allocated(input) {
    const entry = allocations.get(input.submissionId);
    requireReview(entry && same(entry.binding, liveBinding(input))
      && entry.requestRef === input.request.requestRef && entry.requestRevision === input.request.revision
      && same(entry.scope, input.request.scope) && same(entry.preview, input.request.fields), 'review_historical');
    const current = fs.lstatSync(safePath(directory(input)));
    requireReview(current.isDirectory() && sameFile(entry.directoryIdentity, current), 'review_unsafe_path');
    return entry;
  }
  function exists(relative) {
    const absolute = safePath(relative);
    try { fs.lstatSync(absolute); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  function onlyWorking(input) {
    const dir = directory(input);
    if (exists(`${dir}/provenance.json`)) throw new ReviewError('review_sealed');
    if (exists(`${dir}/report.md`) || exists(`${dir}/annotated.png`)) throw new ReviewError('review_incomplete');
  }
  function storedWorking(scope, submissionId) {
    const dir = `${path.posix.dirname(scope.specPath)}/reviews/${submissionId}`;
    const bytes = readRegular(`${dir}/working.json`, REVIEW_LIMITS.workingBytes);
    const value = parse(bytes);
    object(value, ['version', 'submissionId', 'scope', 'preview', 'requestRef', 'requestRevision', 'state']);
    requireReview(value.version === 1 && value.submissionId === submissionId
      && same(value.scope, scope), 'review_source_changed');
    object(value.preview, ['artifact', 'assets']);
    requireReview(Array.isArray(value.preview.assets) && value.preview.assets.length <= 32);
    const seen = new Set(), designRoot = `${path.posix.dirname(scope.specPath)}/design/`;
    for (const entry of [value.preview.artifact, ...value.preview.assets]) {
      object(entry, ['path', 'revision']);
      requireReview(typeof entry.path === 'string' && entry.path.startsWith(designRoot)
        && isHash(entry.revision) && !seen.has(entry.path), 'review_evidence_invalid');
      safePath(entry.path);
      seen.add(entry.path);
    }
    requireReview(/\.html?$/.test(value.preview.artifact.path), 'review_evidence_invalid');
    string(value.requestRef, 160); string(value.requestRevision, 160);
    const state = workingState(value.state);
    requireReview(same(value.state, state), 'review_evidence_invalid');
    return { value, bytes, revision: hash(bytes) };
  }
  function readWorking(input) {
    const working = storedWorking(input.request.scope, input.submissionId);
    const { value } = working;
    requireReview(same(value.preview, input.request.fields), 'review_source_changed');
    const live = allocations.get(input.submissionId);
    if (live && same(live.binding, liveBinding(input))) {
      requireReview(value.requestRef === live.requestRef && value.requestRevision === live.requestRevision, 'review_evidence_invalid');
    }
    return working;
  }
  function exclusiveWrite(relative, bytes, created) {
    const absolute = safePath(relative);
    let fd;
    try {
      fd = fs.openSync(absolute, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      const stat = fs.fstatSync(fd);
      created.push({ relative, identity: identity(stat) });
      let count = 0;
      while (count < bytes.length) count += fs.writeSync(fd, bytes, count, bytes.length - count);
      fs.fsyncSync(fd);
      const current = fs.lstatSync(safePath(relative));
      requireReview(current.isFile() && current.nlink === 1 && sameFile(current, stat), 'review_unsafe_path');
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  function cleanup(created) {
    // Never recursive: unknown/replaced paths and files survive a caught failure.
    for (const entry of created.slice().reverse()) {
      try {
        const absolute = safePath(entry.relative), stat = fs.lstatSync(absolute);
        if (stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && sameFile(entry.identity, stat)) fs.unlinkSync(absolute);
      } catch { /* Uncertain interruption remains incomplete evidence. */ }
    }
  }
  async function writeBoundary(input) {
    await input.checkCurrent();
    source(input);
    input.signal.throwIfAborted();
  }

  function resources(input, origin) {
    requireReview(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'review_unavailable');
    const { files, designRoot } = source(input);
    const base = `/review-source/${input.submissionId}/`;
    const routes = new Map();
    for (const [name, file] of files) routes.set(`${base}${encodePath(name.slice(designRoot.length))}`, { ...file });
    const urls = [...routes.keys()].map(p => `${origin}${p}`).join(' ');
    const csp = `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' ${urls} ${origin}/review/bridge.mjs ${origin}/review/inspector.mjs; style-src 'unsafe-inline' ${urls}; img-src data: ${urls}; font-src data: ${urls}; connect-src ${urls}; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
    const framePath = `${base}${encodePath(input.request.fields.artifact.path.slice(designRoot.length))}`;
    const frame = routes.get(framePath);
    let html;
    try { html = new TextDecoder('utf-8', { fatal: true }).decode(frame.bytes); }
    catch { throw new ReviewError('review_unavailable'); }
    // The bridge has no file/parent authority. sandbox allow-scripts deliberately
    // omits allow-same-origin, both on the element and in the response CSP.
    frame.bytes = Buffer.from(`${html}\n<script type="module" data-dude-review-bridge src="${origin}/review/bridge.mjs"></script>\n`);
    frame.csp = csp;
    for (const [route, file] of routes) if (route !== framePath && file.mime.startsWith('text/html')) file.csp = csp;
    for (const name of ['bridge.mjs', 'inspector.mjs']) {
      routes.set(`/review/${name}`, { bytes: fs.readFileSync(path.join(UI_ROOT, name)), mime: MIME['.mjs'] });
    }
    return { routes, framePath };
  }

  async function openReview(input) {
    await writeBoundary(input);
    const dir = directory(input);
    if (input.allocate) {
      requireReview(!allocations.has(input.submissionId) && allocations.size < 64, 'review_conflict');
      if (!capability) {
        try { capability = await preflightCapture(input.signal); }
        catch (error) {
          if (input.signal.aborted) throw error;
          const failure = error instanceof ReviewError ? error : new ReviewError('review_capture_failed', 503);
          capability = { available: false, reason: failure.code, ...(failure.detail ? { detail: failure.detail } : {}) };
        }
      }
      await writeBoundary(input);
      const parent = path.posix.dirname(dir);
      if (!exists(parent)) fs.mkdirSync(safePath(parent), { mode: 0o700 });
      requireReview(fs.lstatSync(safePath(parent)).isDirectory(), 'review_unsafe_path');
      const created = [];
      let directoryIdentity;
      try {
        fs.mkdirSync(safePath(dir), { mode: 0o700 });
        directoryIdentity = identity(fs.lstatSync(safePath(dir)));
        const value = { version: 1, submissionId: input.submissionId,
          scope: input.request.scope, preview: input.request.fields,
          requestRef: input.request.requestRef, requestRevision: input.request.revision, state: emptyState() };
        exclusiveWrite(`${dir}/working.json`, jsonBytes(value), created);
        allocations.set(input.submissionId, { binding: liveBinding(input), directoryIdentity,
          requestRef: input.request.requestRef, requestRevision: input.request.revision,
          scope: input.request.scope, preview: input.request.fields, seal: null });
      } catch (error) {
        cleanup(created);
        if (directoryIdentity) {
          try {
            const absolute = safePath(dir), stat = fs.lstatSync(absolute);
            if (stat.isDirectory() && sameFile(directoryIdentity, stat)) fs.rmdirSync(absolute);
          } catch { /* Do not remove a nonempty or replaced directory. */ }
        }
        if (error instanceof ReviewError) throw error;
        throw new ReviewError('review_write_failed', 503);
      }
    }
    source(input);
    const working = readWorking(input);
    const live = allocations.has(input.submissionId)
      && same(allocations.get(input.submissionId).binding, liveBinding(input));
    if (live) allocated(input);
    const sealed = exists(`${dir}/provenance.json`);
    const incomplete = !sealed && (exists(`${dir}/report.md`) || exists(`${dir}/annotated.png`));
    const evidence = sealed ? readEvidence(input, working) : null;
    return { submissionId: input.submissionId, scope: working.value.scope, preview: working.value.preview,
      requestRef: working.value.requestRef, requestRevision: working.value.requestRevision,
      working: working.value.state, workingRevision: working.revision,
      status: !live ? 'historical' : sealed ? 'sealed' : incomplete ? 'incomplete' : 'editing',
      editable: live && !sealed && !incomplete,
      framePath: resources(input, input.origin).framePath,
      capture: capability ?? { available: false, reason: 'review_unavailable' },
      ...(evidence ? { evidence: { report: evidence.report, provenance: evidence.provenance,
        image: { base64: evidence.image.toString('base64'), width: evidence.width, height: evidence.height } } } : {}),
    };
  }

  async function saveReview(input) {
    await writeBoundary(input);
    allocated(input); onlyWorking(input);
    const prior = readWorking(input);
    requireReview(input.workingRevision === prior.revision, 'review_conflict');
    const state = workingState(input.working);
    const bytes = jsonBytes({ ...prior.value, state });
    requireReview(bytes.length <= REVIEW_LIMITS.workingBytes);
    const temporary = `${directory(input)}/.working-${randomUUID()}.tmp`;
    const created = [];
    try {
      exclusiveWrite(temporary, bytes, created);
      source(input); allocated(input); onlyWorking(input);
      requireReview(readWorking(input).revision === prior.revision, 'review_conflict');
      fs.renameSync(safePath(temporary), safePath(`${directory(input)}/working.json`));
      requireReview(readWorking(input).revision === hash(bytes), 'review_conflict');
      return { status: 'saved', submissionId: input.submissionId, workingRevision: hash(bytes) };
    } catch (error) {
      if (error instanceof ReviewError) throw error;
      throw new ReviewError('review_write_failed', 503);
    } finally { cleanup(created); }
  }

  function validateCapture(capture, state, version) {
    object(capture, ['mode', 'browser', 'colorSpace', 'warnings', 'width', 'height', 'viewport', 'beforeSignature',
      'afterSignature', 'sourceImageRevision', 'overlayRevision', 'selectors'], ['scrolls']);
    const v = state.view.viewport;
    requireReview(capture.mode === 'fresh-viewport' && capture.colorSpace === 'srgb' && typeof capture.browser === 'string'
      && /^(?:Chrome|Chromium|Edg)\/[\d.]+$/.test(capture.browser)
      && Array.isArray(capture.warnings) && capture.warnings.length === 1
      && capture.warnings.every(w => typeof w === 'string' && w.length <= 512)
      && capture.width === v.width * v.deviceScale && capture.height === v.height * v.deviceScale
      && same(capture.viewport, v) && isHash(capture.beforeSignature)
      && capture.beforeSignature === capture.afterSignature
      && Object.hasOwn(capture, 'scrolls') === Object.hasOwn(state.view, 'scrolls')
      && same(capture.scrolls, state.view.scrolls)
      && isHash(capture.sourceImageRevision) && isHash(capture.overlayRevision), 'review_evidence_invalid');
    // Only historical version-1 seals claimed equality with the host renderer.
    if (version === 1) requireReview(capture.beforeSignature === state.view.signature, 'review_evidence_invalid');
    const selectors = state.annotations.flatMap(a => {
      if (!a.element) return [];
      const projected = projectElement(a.element, a.scrollBasis, state.view.scrolls);
      return [{
        annotationId: a.id, selector: a.element.selector, matches: 1,
        elementRevision: hash(JSON.stringify(version === 1 ? projected : portableElement(projected))),
      }];
    });
    requireReview(same(capture.selectors, selectors), 'review_evidence_invalid');
  }
  // File integrity is shared with history. Live callers below ALSO retain
  // current-source, allocation and in-memory capture attestation validation.
  function readEvidenceFiles(scope, submissionId, working) {
    const dir = `${path.posix.dirname(scope.specPath)}/reviews/${submissionId}`;
    const provenanceBytes = readRegular(`${dir}/provenance.json`, REVIEW_LIMITS.workingBytes);
    const p = parse(provenanceBytes);
    object(p, ['version', 'submissionId', 'scope', 'requestRef', 'requestRevision', 'preview',
      'workingRevision', 'annotationRevision', 'reportRevision', 'imageRevision', 'revisionText', 'capture']);
    assertVisibleAnnotations(working.value.state);
    requireReview((p.version === 1 || p.version === 2) && p.submissionId === submissionId
      && same(p.scope, working.value.scope) && same(p.preview, working.value.preview)
      && p.requestRef === working.value.requestRef && p.requestRevision === working.value.requestRevision
      && p.workingRevision === working.revision
      && p.annotationRevision === hash(JSON.stringify(working.value.state.annotations))
      && isHash(p.reportRevision) && isHash(p.imageRevision), 'review_evidence_invalid');
    requireReview(p.revisionText === null || (typeof p.revisionText === 'string' && p.revisionText.trim()));
    if (p.revisionText !== null) string(p.revisionText, 32768);
    validateCapture(p.capture, working.value.state, p.version);
    const reportBytes = readRegular(`${dir}/report.md`, REVIEW_LIMITS.reportBytes);
    const expected = buildReport(working.value, p.capture, p.revisionText, p.version);
    requireReview(reportBytes.equals(Buffer.from(expected)) && hash(reportBytes) === p.reportRevision, 'review_evidence_invalid');
    const image = readRegular(`${dir}/annotated.png`, REVIEW_LIMITS.pngBytes);
    const { width, height } = decodePng(image);
    requireReview(width === p.capture.width && height === p.capture.height && hash(image) === p.imageRevision, 'review_evidence_invalid');
    requireReview(storedWorking(scope, submissionId).revision === working.revision
      && readRegular(`${dir}/provenance.json`, REVIEW_LIMITS.workingBytes).equals(provenanceBytes), 'review_evidence_invalid');
    return { report: expected, image, width, height, provenance: p, provenanceRevision: hash(provenanceBytes) };
  }
  function readEvidence(input, working = readWorking(input)) {
    const evidence = readEvidenceFiles(input.request.scope, input.submissionId, working);
    source(input);
    requireReview(readWorking(input).revision === working.revision, 'review_evidence_invalid');
    return evidence;
  }

  function historyOwner(scope) {
    object(scope, ['kind', 'ideaPath', 'specPath']);
    requireReview(scope.kind === 'feature' && parseIdeaIdentity(scope.ideaPath)
      && parseSpecIdentity(scope.specPath), 'review_invalid_input');
    safePath(scope.ideaPath); safePath(scope.specPath);
    const resolved = resolveFeatureOwner({ root, specPath: scope.specPath });
    requireReview(!resolved.diagnostics.length && resolved.owner?.ideaPath === scope.ideaPath, 'review_source_changed');
  }

  /**
   * Selected-owner sealed history only. No live frame, allocation, saved-state
   * writes, restored waiter, send response, or session/handle credentials.
   * Old source hashes remain historical and need not match today's artifact.
   */
  function readHistory({ scope, submissionId, signal }) {
    signal.throwIfAborted();
    historyOwner(scope);
    const parent = `${path.posix.dirname(scope.specPath)}/reviews`;
    const readOne = id => {
      requireReview(isUuid(id));
      const working = storedWorking(scope, id);
      const evidence = readEvidenceFiles(scope, id, working);
      historyOwner(scope);
      signal.throwIfAborted();
      return { submissionId: id, scope, preview: working.value.preview,
        status: 'historical', editable: false, report: evidence.report, provenance: evidence.provenance,
        image: { base64: evidence.image.toString('base64'), width: evidence.width, height: evidence.height } };
    };
    if (submissionId !== undefined) return readOne(submissionId);
    if (!exists(parent)) return { scope, items: [], coverage: { state: 'current', reason: null } };
    const entries = [], items = [];
    let partial = false, bytes = 0;
    const dir = fs.opendirSync(safePath(parent));
    try {
      for (let entry; (entry = dir.readSync());) {
        if (entries.length === 64) { partial = true; break; }
        entries.push(entry);
      }
    } finally { dir.closeSync(); }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      signal.throwIfAborted();
      if (!entry.isDirectory() || !isUuid(entry.name)) { partial = true; continue; }
      try {
        // Working-only reviews are not submissions. A partial seal never
        // supplies a fabricated time, priority, or historical record.
        if (!exists(`${parent}/${entry.name}/provenance.json`)) {
          if (exists(`${parent}/${entry.name}/report.md`) || exists(`${parent}/${entry.name}/annotated.png`)) partial = true;
          continue;
        }
        for (const name of ['working.json', 'provenance.json', 'report.md', 'annotated.png']) {
          bytes += fs.lstatSync(safePath(`${parent}/${entry.name}/${name}`)).size;
        }
        if (bytes > 32 * 1024 * 1024) { partial = true; break; }
        const record = readOne(entry.name);
        items.push({ submissionId: record.submissionId, preview: record.preview,
          requestRef: record.provenance.requestRef, requestRevision: record.provenance.requestRevision,
          image: { width: record.image.width, height: record.image.height },
          reportRevision: record.provenance.reportRevision, imageRevision: record.provenance.imageRevision });
      } catch { partial = true; }
    }
    historyOwner(scope);
    return { scope, items, coverage: { state: partial ? 'partial' : 'current',
      reason: partial ? 'Some review entries were unreadable, incomplete, or outside the bounded history read.' : null } };
  }

  async function sealReview(input) {
    await writeBoundary(input);
    const entry = allocated(input);
    onlyWorking(input);
    const working = readWorking(input);
    requireReview(input.workingRevision === working.revision, 'review_conflict');
    assertVisibleAnnotations(working.value.state);
    const revisionText = input.revisionText ?? null;
    if (revisionText !== null) { string(revisionText, 32768); requireReview(revisionText.trim()); }
    // Freeze the actual working bytes, not an HTTP-supplied report or image.
    const { routes, framePath } = resources(input, input.origin);
    const { image, capture } = await capturePage({
      resources: routes, framePath, origin: input.origin, state: working.value.state, signal: input.signal,
    });
    validateCapture(capture, working.value.state, 2);
    const report = buildReport(working.value, capture, revisionText, 2);
    decodePng(image);
    const provenance = {
      version: 2, submissionId: input.submissionId, scope: working.value.scope,
      requestRef: working.value.requestRef, requestRevision: working.value.requestRevision,
      preview: working.value.preview, workingRevision: working.revision,
      annotationRevision: hash(JSON.stringify(working.value.state.annotations)),
      reportRevision: hash(report), imageRevision: hash(image), revisionText, capture,
    };
    const seal = jsonBytes(provenance);
    requireReview(seal.length <= REVIEW_LIMITS.workingBytes);
    await writeBoundary(input);
    allocated(input); onlyWorking(input);
    requireReview(readWorking(input).bytes.equals(working.bytes), 'review_conflict');
    const created = [], dir = directory(input);
    let sealed = false;
    try {
      exclusiveWrite(`${dir}/report.md`, Buffer.from(report), created);
      exclusiveWrite(`${dir}/annotated.png`, image, created);
      source(input); allocated(input);
      requireReview(readWorking(input).bytes.equals(working.bytes), 'review_conflict');
      // Last write is the immutable seal. Never overwrite/recover an old seal.
      exclusiveWrite(`${dir}/provenance.json`, seal, created);
      sealed = true;
      entry.seal = { provenanceRevision: hash(seal), imageRevision: hash(image), reportRevision: hash(report) };
      readEvidence(input, working);
      return { status: 'sealed', submissionId: input.submissionId, workingRevision: working.revision,
        reportPath: `${dir}/report.md`, imagePath: `${dir}/annotated.png`, provenancePath: `${dir}/provenance.json`,
        sent: false, applied: false };
    } catch (error) {
      if (!sealed) cleanup(created);
      if (error instanceof ReviewError) throw error;
      throw new ReviewError('review_write_failed', 503);
    }
  }

  async function readSealedSubmission(input) {
    source(input);
    const entry = allocated(input);
    requireReview(entry.seal, 'review_historical');
    const evidence = readEvidence(input);
    const p = evidence.provenance;
    requireReview(p.requestRef === input.request.requestRef && p.requestRevision === input.request.revision
      && p.revisionText === input.revisionText
      && evidence.provenanceRevision === entry.seal.provenanceRevision
      && p.imageRevision === entry.seal.imageRevision && p.reportRevision === entry.seal.reportRevision, 'review_evidence_invalid');
    input.signal.throwIfAborted();
    return {
      binding: { ...entry.binding }, submissionId: input.submissionId,
      requestRef: p.requestRef, requestRevision: p.requestRevision, scope: p.scope, preview: p.preview,
      revisionText: p.revisionText, report: { text: evidence.report, revision: p.reportRevision },
      image: { bytes: evidence.image, revision: p.imageRevision, width: evidence.width, height: evidence.height },
      provenanceRevision: evidence.provenanceRevision,
    };
  }

  return {
    openReview, saveReview, sealReview, readSealedSubmission, readHistory,
    readResource(input) {
      const { routes } = resources(input, input.origin);
      const file = routes.get(input.resourcePath);
      requireReview(file && input.resourcePath.startsWith(`/review-source/${input.submissionId}/`), 'review_unavailable');
      return file;
    },
    dispose() { closed = true; allocations.clear(); },
  };
}

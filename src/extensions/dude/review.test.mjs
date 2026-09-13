// @ts-check
/**
 * T010 regressions for the exact-owner Review adapter and its data boundary.
 *
 * Filesystem cases use only disposable workspaces. Browser-backed capture and
 * the mounted engine are exercised by scripts/dude-canvas-ui/browser.test.mjs;
 * this file keeps storage, restoration, validation, and report behavior
 * independently runnable under the ordinary Node test runner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createReview, ReviewError, REVIEW_LIMITS } from './lib/review.mjs';
import {
  assertVisibleAnnotations,
  buildReport,
  hash,
  jsonBytes,
  workingState,
} from './lib/review/data.mjs';
import { decodePng } from './lib/review/png.mjs';
import {
  BADGE_PAINT,
  anchorMatches,
  captureAnchorMatches,
  BADGE_RADIUS,
  badgeAnchor,
  bounds,
  clipHidesAnchor,
  constrainBox,
  constrainSegment,
  evidencePoints,
  handlesFor,
  hitTest,
  insideClip,
  moveBy,
  paintClip,
  portableElement,
  probePoint,
  projectAnnotation,
  projectElement,
  resizeBy,
} from './ui/review/geometry.mjs';
import { imageIsStatic, validScrolls } from './ui/review/inspector.mjs';
import { rememberCaret, restoreCaret } from './ui/review/panel.mjs';
import { markerSvg, renderAnnotation } from './ui/review/shapes.mjs';

let sequence = 0;

/** @param {string} root @param {string} relative @param {string|Buffer} value */
function write(root, relative, value) {
  const absolute = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value);
}

/** @param {string} root @param {string} relative */
function read(root, relative) {
  return fs.readFileSync(path.join(root, ...relative.split('/')));
}

/** @param {string} root */
function snapshot(root) {
  /** @type {Map<string, {type:string,bytes?:Buffer,target?:string}>} */
  const result = new Map();
  /** @param {string} directory */
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        result.set(relative, { type: 'symlink', target: fs.readlinkSync(absolute) });
      } else if (stat.isDirectory()) {
        result.set(relative, { type: 'directory' });
        visit(absolute);
      } else {
        assert.equal(stat.isFile(), true, `unsupported fixture entry ${relative}`);
        result.set(relative, { type: 'file', bytes: fs.readFileSync(absolute) });
      }
    }
  }
  visit(root);
  return result;
}

/**
 * @param {string} root
 * @param {string} number
 * @param {string} slug
 * @param {{html?:string,assets?:Record<string,string|Buffer>,status?:string}} [options]
 */
function createFeature(root, number, slug, options = {}) {
  const directory = `.dude/specs/${number}-${slug}`;
  const ideaPath = `.dude/ideas/${number}-${slug}.md`;
  const specPath = `${directory}/spec.md`;
  const artifactPath = `${directory}/design/mock.html`;
  const defaultAssets = {
    'mock.css': 'html { color-scheme: light dark; }\nmain { color: #123456; }\n',
    'copy.json': '{"label":"fixture"}\n',
    'logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#246"/></svg>\n',
    'fixture.woff': Buffer.from('declared-font-route-fixture'),
  };
  const assets = { ...defaultAssets, ...options.assets };
  const html = options.html ?? [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<link rel="stylesheet" href="mock.css">',
    '<main id="fixture">Fixture <img alt="logo" src="logo.svg"></main>',
    '',
  ].join('\n');
  write(root, artifactPath, html);
  for (const [name, value] of Object.entries(assets)) write(root, `${directory}/design/${name}`, value);
  write(root, specPath, [
    '---',
    `title: ${slug}`,
    `preview_path: ${artifactPath}`,
    '---',
    '',
    `# ${slug}`,
    '',
  ].join('\n'));
  write(root, `${directory}/tasks.md`, '- [ ] T001@aaaaaaaa Fixture task\n');
  write(root, ideaPath, [
    '---',
    `title: ${slug}`,
    `slug: ${slug}`,
    `status: ${options.status ?? 'defined'}`,
    `spec_path: ${specPath}`,
    '---',
    '',
    '## Idea',
    '',
    `${slug} review fixture.`,
    '',
  ].join('\n'));
  const assetEntries = Object.keys(assets).map((name) => {
    const assetPath = `${directory}/design/${name}`;
    return { path: assetPath, revision: hash(read(root, assetPath)) };
  });
  return {
    root,
    directory,
    ideaPath,
    specPath,
    artifactPath,
    preview: {
      artifact: { path: artifactPath, revision: hash(read(root, artifactPath)) },
      assets: assetEntries,
    },
    scope: { kind: /** @type {'feature'} */ ('feature'), ideaPath, specPath },
  };
}

/** @param {ReturnType<typeof createFeature>} feature @param {Partial<any>} [overrides] */
function requestFor(feature, overrides = {}) {
  return {
    owner: 'dude-spec-lead',
    requestRef: `review-${++sequence}`,
    scope: feature.scope,
    source: { kind: 'file', path: feature.ideaPath, revision: hash(read(feature.root, feature.ideaPath)) },
    revision: `request-revision-${sequence}`,
    class: 'preview',
    prompt: 'Review this exact mock.',
    whyHuman: 'Visual feedback requires the user.',
    unblocks: 'The design owner can revise the canonical mock.',
    blocking: true,
    fields: feature.preview,
    ...overrides,
  };
}

/**
 * @param {string} root
 * @param {any} request
 * @param {{submissionId?:string,allocate?:boolean,binding?:Partial<any>,checkCurrent?:()=>Promise<void>}} [options]
 */
function adapterInput(root, request, options = {}) {
  const controller = new AbortController();
  const binding = {
    workspaceId: 'workspace-fixture',
    sessionId: 'session-fixture',
    providerGeneration: 'generation-fixture',
    toolCallId: 'tool-fixture',
    requestHandle: 'request-handle-fixture',
    ...options.binding,
  };
  return {
    root: path.resolve(root),
    ...binding,
    request,
    submissionId: options.submissionId ?? randomUUID(),
    allocate: options.allocate ?? true,
    origin: 'http://127.0.0.1:43123',
    signal: controller.signal,
    checkCurrent: options.checkCurrent ?? (async () => {}),
    controller,
  };
}

function palette() {
  return {
    stroke: '#d13438',
    background: '#ffffff',
    foreground: '#242424',
    highlightFill: '#fff4ce',
    highlightStroke: '#c19c00',
    selection: '#0f6cbd',
    fontFamily: 'Segoe UI',
  };
}

/** @param {{width?:number,height?:number,scrollX?:number,scrollY?:number,deviceScale?:number,theme?:'light'|'dark'}} [options] */
function view(options = {}) {
  const viewport = {
    width: options.width ?? 800,
    height: options.height ?? 600,
    scrollX: options.scrollX ?? 0,
    scrollY: options.scrollY ?? 0,
    deviceScale: options.deviceScale ?? 1,
    theme: options.theme ?? 'light',
    documentWidth: 800,
    documentHeight: 1200,
  };
  return { viewport, signature: hash(`view:${JSON.stringify(viewport)}`) };
}

/** @param {Partial<any>} [overrides] */
function annotation(overrides = {}) {
  return {
    id: randomUUID(),
    tool: 'box',
    x1: 80,
    y1: 90,
    x2: 220,
    y2: 180,
    comment: '',
    replacement: '',
    styleNote: '',
    element: null,
    ...overrides,
  };
}

/** @param {Partial<any>} [overrides] */
function savedState(overrides = {}) {
  return {
    annotations: [annotation()],
    notes: '',
    tool: 'box',
    selectedId: null,
    caret: null,
    view: view(),
    palette: palette(),
    ...overrides,
  };
}

/** @param {unknown} error @param {string} code */
function isReviewError(error, code) {
  return error instanceof ReviewError && error.code === code;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

/** @param {Buffer} bytes */
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

/** @param {string} type @param {Buffer} data */
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), result.length - 4);
  return result;
}

/** @param {number} width @param {number} height */
function png(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.concat(Array.from({ length: height }, (_, y) => Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width * 4 }, (_unused, index) => (
      index % 4 === 3 ? 255 : (index + y * 17) % 256
    ))),
  ])));
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Create immutable Review evidence through the same serialized formats the
 * production history reader validates. This deliberately supplies no live
 * allocation, invocation, provider, session, or request-handle state.
 * @param {string} root
 * @param {ReturnType<typeof createFeature>} feature
 * @param {{
 *   submissionId?:string,
 *   requestRef?:string,
 *   requestRevision?:string,
 *   revisionText?:string|null,
 *   version?:1|2,
 *   state?:any,
 *   capture?:Record<string,unknown>,
 * }} [options]
 */
function sealedHistory(root, feature, options = {}) {
  const submissionId = options.submissionId ?? randomUUID();
  const version = options.version ?? 1;
  const state = options.state ?? savedState({
    annotations: [annotation({ x1: 40, y1: 40, x2: 120, y2: 90, comment: 'Retained historical feedback.' })],
    view: view({ width: 320, height: 240 }),
  });
  const working = {
    version: 1,
    submissionId,
    scope: feature.scope,
    preview: feature.preview,
    requestRef: options.requestRef ?? `history-${submissionId}`,
    requestRevision: options.requestRevision ?? 'history-request-revision',
    state,
  };
  const workingBytes = jsonBytes(working);
  const localSignature = version === 1
    ? state.view.signature
    : hash(`history-capture:${submissionId}`);
  const selectors = state.annotations.flatMap((entry) => {
    if (!entry.element) return [];
    const projected = projectElement(entry.element, entry.scrollBasis, state.view.scrolls);
    return [{
      annotationId: entry.id,
      selector: entry.element.selector,
      matches: 1,
      elementRevision: hash(JSON.stringify(
        version === 1 ? projected : portableElement(projected),
      )),
    }];
  });
  const capture = {
    mode: 'fresh-viewport',
    browser: 'Chromium/133.0.0.0',
    colorSpace: 'srgb',
    warnings: ['Fresh source rendering.'],
    width: state.view.viewport.width * state.view.viewport.deviceScale,
    height: state.view.viewport.height * state.view.viewport.deviceScale,
    viewport: state.view.viewport,
    beforeSignature: localSignature,
    afterSignature: localSignature,
    ...(Object.hasOwn(state.view, 'scrolls') ? { scrolls: state.view.scrolls } : {}),
    sourceImageRevision: hash('history-source-image'),
    overlayRevision: hash('history-overlay'),
    selectors,
    ...options.capture,
  };
  const revisionText = options.revisionText === undefined ? 'Revise this exact source.' : options.revisionText;
  const report = buildReport(working, capture, revisionText, version);
  const image = png(capture.width, capture.height);
  const provenance = {
    version,
    submissionId,
    scope: feature.scope,
    requestRef: working.requestRef,
    requestRevision: working.requestRevision,
    preview: feature.preview,
    workingRevision: hash(workingBytes),
    annotationRevision: hash(JSON.stringify(state.annotations)),
    reportRevision: hash(report),
    imageRevision: hash(image),
    revisionText,
    capture,
  };
  const directory = `${feature.directory}/reviews/${submissionId}`;
  write(root, `${directory}/working.json`, workingBytes);
  write(root, `${directory}/report.md`, report);
  write(root, `${directory}/annotated.png`, image);
  write(root, `${directory}/provenance.json`, jsonBytes(provenance));
  return { submissionId, directory, working, workingBytes, report, image, provenance };
}

test('ReviewError exposes only closed, bounded capture diagnostic fields', () => {
  // Arrange
  const callerDetail = {
    stage: 'protocol',
    exitCode: 23,
    signal: 'SIGTERM',
    cleanupUncertain: true,
    stderr: 'DO_NOT_ECHO_STDERR',
    raw: 'DO_NOT_ECHO_RAW',
    path: '/private/DO_NOT_ECHO_PATH',
    env: { TOKEN: 'DO_NOT_ECHO_TOKEN' },
    command: ['DO_NOT_ECHO_COMMAND'],
    log: 'DO_NOT_ECHO_LOG',
  };
  const closedStages = [
    'launch', 'pipe_read', 'pipe_write', 'protocol',
    'child_exit', 'command_timeout', 'cleanup',
  ];

  // Act
  const accepted = new ReviewError('review_capture_failed', 503, callerDetail);
  const acceptedStages = closedStages.map(
    (stage) => new ReviewError('review_capture_failed', 503, { stage }).detail?.stage,
  );
  const rejected = new ReviewError('review_capture_failed', 503, {
    stage: 'transport',
    exitCode: 4_294_967_296,
    signal: 'NOT_AN_OS_SIGNAL',
    cleanupUncertain: false,
    raw: 'DO_NOT_ECHO_UNKNOWN',
  });

  // Assert
  assert.deepEqual(acceptedStages, closedStages);
  assert.deepEqual(accepted.detail, {
    stage: 'protocol',
    exitCode: 23,
    signal: 'SIGTERM',
    cleanupUncertain: true,
  });
  assert.equal(Object.hasOwn(rejected, 'detail'), false);
  assert.doesNotMatch(
    `${accepted.message}\n${JSON.stringify(accepted)}\n${rejected.message}\n${JSON.stringify(rejected)}`,
    /DO_NOT_ECHO|private|TOKEN|COMMAND/,
  );
});

test('review data preserves literal authored text, caret ranges, geometry, and complete PNG validation', () => {
  // Arrange
  const id = randomUUID();
  const literal = '  第一\u00a0line\n```` nested ` fence\nfinal  ';
  const target = {
    selector: '#primary',
    selectorMatches: 1,
    tag: 'button',
    text: 'Save\u00a0now',
    rect: { x: 30, y: 40, width: 140, height: 36 },
    styles: { color: 'rgb(17, 34, 51)', 'font-family': '"Segoe UI"' },
  };
  const state = savedState({
    annotations: [annotation({
      id,
      tool: 'comment',
      x1: 96,
      y1: 112,
      x2: 96,
      y2: 112,
      comment: literal,
      replacement: 'Replace\u00a0verbatim',
      styleNote: 'font-weight: 600',
      element: target,
    })],
    notes: `Notes:\n${literal}`,
    tool: 'comment',
    selectedId: id,
    caret: { id, field: 'comment', start: 2, end: 10, direction: 'backward' },
  });
  const working = {
    submissionId: randomUUID(),
    scope: { kind: 'feature', ideaPath: '.dude/ideas/001-a.md', specPath: '.dude/specs/001-a/spec.md' },
    preview: {
      artifact: { path: '.dude/specs/001-a/design/mock.html', revision: hash('mock') },
      assets: [],
    },
    requestRef: 'literal-review',
    requestRevision: 'revision-a',
    state,
  };
  const capture = {
    width: 800,
    height: 600,
    mode: 'fresh-viewport',
    warnings: ['Fresh source rendering.'],
  };
  const textarea = {
    selectionStart: 2,
    selectionEnd: 10,
    selectionDirection: 'backward',
    calls: [],
    setSelectionRange(...args) { this.calls.push(args); },
  };

  // Act
  const validated = workingState(state);
  assertVisibleAnnotations(validated);
  const report = buildReport(working, capture, literal);
  const remembered = rememberCaret(/** @type {any} */ (textarea), id);
  const restored = restoreCaret(/** @type {any} */ (textarea), remembered, id);
  const validPng = png(7, 5);
  const decoded = decodePng(validPng);

  // Assert
  assert.deepEqual(validated, state, 'validation does not normalize, trim, or replace authored bytes');
  assert.equal(report.includes(literal), true);
  assert.match(report, /Revise the canonical mock through its design owner/);
  assert.match(report, /not approval or authority to edit production UI/);
  assert.match(report, /Captured target \(exactly one visible match\)/);
  assert.match(report, /`````text\n  第一\u00a0line\n```` nested ` fence\nfinal  \n`````/);
  assert.deepEqual(remembered, { id, field: 'comment', start: 2, end: 10, direction: 'backward' });
  assert.equal(restored, true);
  assert.deepEqual(textarea.calls, [[2, 10, 'backward']]);
  assert.equal(restoreCaret(/** @type {any} */ (textarea), remembered, 'another-id'), false);
  assert.deepEqual({ width: decoded.width, height: decoded.height, bytes: decoded.pixels.length }, {
    width: 7,
    height: 5,
    bytes: 7 * 5 * 4,
  });

  const badCrc = Buffer.from(validPng);
  badCrc[badCrc.length - 8] ^= 1;
  assert.throws(() => decodePng(badCrc), (error) => isReviewError(error, 'review_evidence_invalid'));
  const trailing = Buffer.concat([validPng, Buffer.from([0])]);
  assert.throws(() => decodePng(trailing), (error) => isReviewError(error, 'review_evidence_invalid'));
  assert.equal(imageIsStatic(validPng), true);
  assert.equal(imageIsStatic(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="x"/></svg>')), false);
  assert.equal(imageIsStatic(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')), true);
});

test('geometry stays in document CSS pixels for hit testing, constrained drawing, handles, and evidence anchors', () => {
  // Arrange
  const box = annotation({ x1: 200, y1: 180, x2: 80, y2: 90 });
  const line = annotation({ tool: 'line', x1: 20, y1: 30, x2: 120, y2: 130 });

  // Act + Assert
  assert.deepEqual(bounds(box), { x: 80, y: 90, width: 120, height: 90 });
  assert.equal(hitTest(box, { x: 80, y: 130 }), true);
  assert.equal(hitTest(box, { x: 140, y: 130 }), true, 'a box answers to its whole marked face');
  assert.equal(hitTest(box, { x: 140, y: 260 }), false, 'the marked face ends with the drawing');
  assert.deepEqual(constrainBox({ x: 10, y: 10 }, { x: 30, y: 50 }), { x: 50, y: 50 });
  assert.deepEqual(constrainSegment({ x: 10, y: 10 }, { x: 80, y: 20 }), { x: 80, y: 10 });
  assert.deepEqual(handlesFor(line), [
    { name: 'p1', x: 20, y: 30 },
    { name: 'p2', x: 120, y: 130 },
  ]);
  assert.deepEqual(evidencePoints(line), [
    { x: 20, y: 30 },
    { x: 70, y: 80 },
    { x: 120, y: 130 },
  ]);
  moveBy(box, 5, 7);
  assert.deepEqual(bounds(box), { x: 85, y: 97, width: 120, height: 90 });
  resizeBy(box, 'se', { x: 260, y: 240 });
  assert.deepEqual(bounds(box), { x: 85, y: 97, width: 175, height: 143 });
});

test('a press answers to an annotation number where that number is painted, and to a box face', () => {
  // Arrange
  const box = annotation({ x1: 120, y1: 140, x2: 300, y2: 260 });
  const line = annotation({ tool: 'line', x1: 120, y1: 140, x2: 320, y2: 300 });
  const circle = annotation({ tool: 'circle', x1: 120, y1: 140, x2: 320, y2: 300 });
  const pin = annotation({ tool: 'comment', x1: 400, y1: 420, x2: 400, y2: 420 });
  const viewport = { scrollX: 0, scrollY: 0, width: 800, height: 600 };
  const free = paintClip(viewport);
  const pushed = paintClip(viewport, { left: 100, top: 220, right: 420, bottom: 520 });

  // Act
  const freeBadge = badgeAnchor(box, free);
  const pushedBadge = badgeAnchor(box, pushed);

  // Assert
  assert.deepEqual(freeBadge, { x: 111, y: 131 });
  assert.deepEqual(pushedBadge, { x: 111, y: 229.75 },
    'the renderer-independent clip boundary fixes the moved badge location');
  assert.equal(hitTest(box, freeBadge, free), true, 'the number answers for the annotation it labels');
  assert.equal(hitTest(box, pushedBadge, pushed), true, 'a moved badge answers where it is drawn');
  assert.equal(hitTest(box, freeBadge, pushed), false, 'and not where it is no longer drawn');
  assert.equal(hitTest(line, badgeAnchor(line, free), free), true, 'a segment badge answers beside its tail');
  assert.equal(hitTest(line, { x: 300, y: 160 }, free), false, 'a line is still only its line');
  assert.equal(hitTest(circle, { x: 220, y: 220 }, free), false, 'a circle is still only its ring');
  assert.equal(badgeAnchor(pin, free), null, 'the comment marker already draws its own number');
  assert.equal(hitTest(pin, { x: 425, y: 420 }, free), false, 'so no badge widens its radius');
  assert.equal(hitTest(box, { x: 210, y: 200 }, free), true, 'a box answers to its whole marked face');
});

test('server Send validation accepts optional blank numbered comment pins', () => {
  // Arrange
  const target = {
    selector: '#feedback-target',
    selectorMatches: 1,
    tag: 'button',
    text: 'Visible feedback target',
    rect: { x: 40, y: 40, width: 180, height: 60 },
    styles: { color: 'rgb(36, 36, 36)', display: 'block' },
  };
  const legalBlankShapes = workingState(savedState({
    annotations: [
      annotation({ tool: 'box', x1: 60, y1: 80, x2: 180, y2: 160 }),
      annotation({ tool: 'arrow', x1: 240, y1: 220, x2: 340, y2: 120 }),
    ],
  }));
  const blankComment = workingState(savedState({
    tool: 'comment',
    annotations: [annotation({
      tool: 'comment',
      x1: 120,
      y1: 100,
      x2: 120,
      y2: 100,
      element: target,
    })],
  }));
  const replacementOnlyComment = workingState({
    ...blankComment,
    annotations: [{
      ...blankComment.annotations[0],
      replacement: 'Use the shorter visible label.',
    }],
  });

  // Act
  const shapeResult = (() => {
    try {
      assertVisibleAnnotations(legalBlankShapes);
      return 'accepted';
    } catch (error) {
      return error;
    }
  })();
  const blankCommentResult = (() => {
    try {
      assertVisibleAnnotations(blankComment);
      return 'accepted';
    } catch (error) {
      return error;
    }
  })();
  const replacementResult = (() => {
    try {
      assertVisibleAnnotations(replacementOnlyComment);
      return 'accepted';
    } catch (error) {
      return error;
    }
  })();

  // Assert
  assert.equal(shapeResult, 'accepted',
    'blank box and arrow drawings remain legal production feedback');
  assert.equal(blankCommentResult, 'accepted',
    'a uniquely anchored numbered pin remains valid when all optional text fields are blank');
  assert.deepEqual(
    blankComment.annotations.map(({ tool, comment, replacement, styleNote }) => (
      { tool, comment, replacement, styleNote }
    )),
    [{ tool: 'comment', comment: '', replacement: '', styleNote: '' }],
    'admission preserves the blank comment instead of manufacturing authored prose',
  );
  assert.equal(replacementResult, 'accepted',
    'a comment marker may carry its authored feedback in an existing alternate text field');
});

test('every rendered annotation carries its list number while hidden markers paint nothing', () => {
  // Arrange
  class SvgNode {
    constructor(name) {
      this.tagName = name;
      this.attributes = {};
      this.children = [];
      this.textContent = '';
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
  }
  const originalDocument = globalThis.document;
  globalThis.document = /** @type {any} */ ({
    createElementNS(_namespace, name) { return new SvgNode(name); },
  });
  const annotations = [
    annotation({ id: 'comment-1', tool: 'comment', x1: 60, y1: 70, x2: 60, y2: 70 }),
    annotation({ id: 'box-2', tool: 'box', x1: 160, y1: 140, x2: 100, y2: 90 }),
    annotation({ id: 'circle-3', tool: 'circle', x1: 180, y1: 100, x2: 240, y2: 160 }),
    annotation({ id: 'arrow-4', tool: 'arrow', x1: 300, y1: 200, x2: 340, y2: 200 }),
    annotation({ id: 'line-5', tool: 'line', x1: 400, y1: 250, x2: 400, y2: 300 }),
    annotation({ id: 'highlight-6', tool: 'highlight', x1: 450, y1: 80, x2: 520, y2: 125 }),
  ];
  const expectedTags = [
    ['circle', 'text'],
    ['rect', 'circle', 'text'],
    ['ellipse', 'circle', 'text'],
    ['line', 'polygon', 'circle', 'text'],
    ['line', 'circle', 'text'],
    ['rect', 'circle', 'text'],
  ];

  try {
    // Act
    const anchors = annotations.map(badgeAnchor);
    const groups = annotations.map((value, index) => renderAnnotation(value, index, palette()));
    const rendered = markerSvg(
      annotations,
      { width: 640, height: 480, scrollX: 0, scrollY: 0 },
      palette(),
      new Set(['box-2']),
    );
    const clipRegions = rendered.children[0].children;
    const visibleGroups = rendered.children[1].children;

    // Assert
    assert.equal(BADGE_RADIUS, 9);
    assert.deepEqual(
      rendered.children.map(({ tagName }) => tagName),
      ['defs', 'g'],
      'markerSvg exposes clip definitions before its painted annotation layer',
    );
    assert.deepEqual(anchors, [
      null,
      { x: 91, y: 81 },
      { x: 171, y: 91 },
      { x: 286, y: 200 },
      { x: 400, y: 236 },
      { x: 441, y: 71 },
    ], 'comments use their own marker; segments use their tail and other tools use their corner');
    assert.equal(groups.length, annotations.length, 'the guard cannot pass with an empty annotation set');
    groups.forEach((group, index) => {
      assert.equal(group.attributes['data-annotation'], annotations[index].id);
      assert.deepEqual(group.children.map(({ tagName }) => tagName), expectedTags[index]);
      const labels = group.children.filter(({ tagName }) => tagName === 'text');
      assert.equal(labels.length, 1, `${annotations[index].tool} paints exactly one numeral`);
      assert.equal(labels[0].textContent, String(index + 1));
      assert.equal(labels[0].attributes.fill, palette().foreground);
      assert.equal(labels[0].attributes['font-family'], palette().fontFamily);
      if (annotations[index].tool !== 'comment') {
        const disc = group.children.at(-2);
        assert.equal(disc.tagName, 'circle');
        assert.equal(disc.attributes.r, String(BADGE_RADIUS));
        assert.equal(disc.attributes.fill, palette().background);
        assert.equal(disc.attributes.stroke, palette().stroke);
      }
    });
    assert.deepEqual(
      visibleGroups.map((group) => group.attributes['data-annotation']),
      ['comment-1', 'circle-3', 'arrow-4', 'line-5', 'highlight-6'],
    );
    assert.deepEqual(
      visibleGroups.map((group) => group.attributes['clip-path']),
      ['comment-1', 'circle-3', 'arrow-4', 'line-5', 'highlight-6']
        .map((id) => `url(#dude-review-clip-${id})`),
      'every painted annotation is bound to its own paint clip',
    );
    assert.deepEqual(
      clipRegions.map((region) => region.attributes.id),
      ['comment-1', 'circle-3', 'arrow-4', 'line-5', 'highlight-6']
        .map((id) => `dude-review-clip-${id}`),
      'only painted annotations receive clip regions',
    );
    assert.equal(
      [...visibleGroups, ...clipRegions].some((node) => (
        node.attributes['data-annotation'] === 'box-2'
          || node.attributes.id === 'dude-review-clip-box-2'
      )),
      false,
      'a hidden annotation emits neither a painted group nor a clip region',
    );
    assert.deepEqual(
      visibleGroups.flatMap((group) => group.children
        .filter(({ tagName }) => tagName === 'text')
        .map(({ textContent }) => textContent)),
      ['1', '3', '4', '5', '6'],
      'a hidden annotation paints no shape or badge and survivors keep their list indexes',
    );
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('synthetic stored Review arrows retain their pinned endpoint-two arrowheads', () => {
  // Arrange
  const savedArrows = [
    {
      tail: { x: 20, y: 30 },
      head: { x: 140, y: 45 },
    },
    {
      tail: { x: 160, y: 150 },
      head: { x: 60, y: 80 },
    },
    {
      tail: { x: 90, y: 180 },
      head: { x: 90, y: 40 },
    },
  ].map(({ tail, head }) => {
    const arrow = annotation({
      tool: 'arrow',
      x1: tail.x,
      y1: tail.y,
      x2: head.x,
      y2: head.y,
    });
    const bytes = Buffer.from(JSON.stringify({ state: { annotations: [arrow] } }));
    return { bytes, revision: hash(bytes), index: 0, tail, head };
  });
  class SvgNode {
    constructor(name) {
      this.tagName = name;
      this.attributes = {};
      this.children = [];
      this.textContent = '';
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
  }
  const originalDocument = globalThis.document;
  globalThis.document = /** @type {any} */ ({
    createElementNS(_namespace, name) { return new SvgNode(name); },
  });

  try {
    // Act
    const rendered = savedArrows.map((saved) => {
      const arrow = JSON.parse(saved.bytes.toString('utf8')).state.annotations[saved.index];
      const polygon = renderAnnotation(arrow, saved.index, palette()).children
        .find(({ tagName }) => tagName === 'polygon');
      const [tipX, tipY] = polygon.attributes.points.split(' ')[0].split(',').map(Number);
      return {
        revision: hash(saved.bytes),
        tool: arrow.tool,
        tail: { x: arrow.x1, y: arrow.y1 },
        head: { x: arrow.x2, y: arrow.y2 },
        probe: probePoint(arrow),
        renderedTip: { x: tipX, y: tipY },
      };
    });

    // Assert
    assert.equal(rendered.length, 3, 'the guard cannot pass without all three stored directions');
    assert.deepEqual(rendered, savedArrows.map(({ revision, tail, head }) => ({
      revision,
      tool: 'arrow',
      tail,
      head,
      probe: head,
      renderedTip: head,
    })));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('annotation paint envelopes, not anchor points or target bounds, determine clip visibility', () => {
  // Arrange
  const nestedClip = { left: 0, top: 111, right: 908, bottom: 541 };
  const fieldClip = { left: 45, top: 55, right: 339, bottom: 249 };
  const nestedComment = annotation({
    tool: 'comment',
    x1: 661,
    y1: 554,
    x2: 661,
    y2: 554,
  });
  const partialTargetMarker = annotation({
    tool: 'comment',
    x1: 81,
    y1: 231,
    x2: 81,
    y2: 231,
  });
  const edgeMarker = annotation({
    tool: 'comment',
    x1: 221,
    y1: 245,
    x2: 221,
    y2: 245,
  });
  const exactBox = annotation({
    tool: 'box',
    x1: 47,
    y1: 57,
    x2: 337,
    y2: 247,
  });
  const exactArrow = annotation({
    tool: 'arrow',
    x1: 56,
    y1: 66,
    x2: 328,
    y2: 238,
  });
  const rootClip = { left: 0, top: 0, right: 1000, bottom: 400 };
  const rootEdgeBox = annotation({
    tool: 'box',
    x1: 2,
    y1: 133.33333333333334,
    x2: 750,
    y2: 240,
  });
  const footprint = (point) => ({
    left: point.x - BADGE_PAINT,
    top: point.y - BADGE_PAINT,
    right: point.x + BADGE_PAINT,
    bottom: point.y + BADGE_PAINT,
  });

  // Act
  const visibility = {
    nestedComment: insideClip(nestedComment, nestedClip),
    partialTargetMarker: insideClip(partialTargetMarker, fieldClip),
    edgeMarker: insideClip(edgeMarker, fieldClip),
    exactBox: insideClip(exactBox, fieldClip),
    exactArrow: insideClip(exactArrow, fieldClip),
  };
  const anchors = {
    exactBox: {
      bare: badgeAnchor(exactBox),
      clamped: badgeAnchor(exactBox, fieldClip),
    },
    exactArrow: {
      bare: badgeAnchor(exactArrow),
      clamped: badgeAnchor(exactArrow, fieldClip),
    },
    rootEdgeBox: {
      bare: badgeAnchor(rootEdgeBox),
      clamped: badgeAnchor(rootEdgeBox, rootClip),
    },
  };

  // Assert
  assert.deepEqual(visibility, {
    nestedComment: false,
    partialTargetMarker: true,
    edgeMarker: false,
    exactBox: true,
    exactArrow: true,
  });
  assert.equal(BADGE_PAINT, 9.75, 'the containment contract includes the badge stroke paint');
  assert.deepEqual(anchors.exactBox, {
    bare: { x: 38, y: 48 },
    clamped: { x: 54.75, y: 64.75 },
  }, 'the Sharpie anchor is preserved without a clip and minimally clamped with one');
  assert.deepEqual(footprint(anchors.exactBox.bare), {
    left: 28.25,
    top: 38.25,
    right: 47.75,
    bottom: 57.75,
  }, 'the control proves the bare exact-box disc really crosses the field clip');
  assert.deepEqual(footprint(anchors.exactBox.clamped), {
    left: 45,
    top: 55,
    right: 64.5,
    bottom: 74.5,
  }, 'the full exact-box disc, not merely its centre, lands inside the correct clip edges');
  assert.deepEqual(anchors.exactArrow.clamped, { x: 54.75, y: 64.75 });
  assert.ok(
    Math.abs(anchors.exactArrow.bare.x - 44.167292068959576) < 1e-12
      && Math.abs(anchors.exactArrow.bare.y - 58.51755233772444) < 1e-12,
    `the bare Sharpie arrow anchor is preserved: ${JSON.stringify(anchors.exactArrow.bare)}`,
  );
  assert.deepEqual(footprint(anchors.exactArrow.clamped), {
    left: 45,
    top: 55,
    right: 64.5,
    bottom: 74.5,
  }, 'the exact-arrow badge is clamped by its complete painted radius');
  assert.equal(
    insideClip(rootEdgeBox, rootClip),
    true,
    'the UI-reachable root-edge box remains sendable under the unchanged shape predicate',
  );
  assert.deepEqual(anchors.rootEdgeBox, {
    bare: { x: -7, y: 124.33333333333334 },
    clamped: { x: 9.75, y: 124.33333333333334 },
  }, 'the root-edge badge moves only on the escaping axis');
  assert.deepEqual(footprint(anchors.rootEdgeBox.clamped), {
    left: 0,
    top: 114.58333333333334,
    right: 19.5,
    bottom: 134.08333333333334,
  }, 'the complete root-edge badge touches, but never crosses, the root clip');
  assert.equal(
    edgeMarker.y1 < fieldClip.bottom,
    true,
    'a point inside the clip is insufficient when the comment envelope crosses it',
  );
  assert.equal(
    insideClip({ ...exactBox, x1: 46 }, fieldClip),
    false,
    'ordinary shapes retain their two-pixel paint allowance',
  );
  assert.equal(
    insideClip({ ...exactArrow, x1: 55 }, fieldClip),
    false,
    'arrows retain their eleven-pixel arrowhead allowance',
  );
});

test('anchor clipping begins only when the effective clip hides part of its own target', () => {
  // Arrange
  const rect = { x: 20, y: 30, width: 80, height: 40 };
  const fullyContained = { left: 20, top: 30, right: 100, bottom: 70 };
  const onePixelOverhangs = {
    left: { ...fullyContained, left: 21 },
    top: { ...fullyContained, top: 31 },
    right: { ...fullyContained, right: 99 },
    bottom: { ...fullyContained, bottom: 69 },
  };
  const unusable = {
    missing: null,
    empty: { left: 20, top: 30, right: 20, bottom: 70 },
    invalid: { left: 20, top: 30, right: Number.NaN, bottom: 70 },
  };

  // Act
  const result = {
    fullyContained: clipHidesAnchor(rect, fullyContained),
    overhangs: Object.fromEntries(Object.entries(onePixelOverhangs)
      .map(([edge, clip]) => [edge, clipHidesAnchor(rect, clip)])),
    unusable: Object.fromEntries(Object.entries(unusable)
      .map(([kind, clip]) => [kind, clipHidesAnchor(rect, clip)])),
  };

  // Assert
  assert.equal(Object.keys(result.overhangs).length, 4, 'all four clip edges are exercised');
  assert.deepEqual(result, {
    fullyContained: false,
    overhangs: { left: true, top: true, right: true, bottom: true },
    unusable: { missing: true, empty: true, invalid: true },
  });
});

test('capture matching excludes renderer styles but rejects portable identity, geometry, and scroll drift', () => {
  // Arrange
  const hostElement = {
    selector: '#portable-target',
    selectorMatches: 1,
    tag: 'button',
    text: 'Open review',
    rect: { x: 120, y: 84, width: 180, height: 44 },
    styles: {
      'font-family': '"system-ui"',
      border: 'rgb(118, 118, 118)',
      overflow: 'clip',
    },
  };
  const chromiumElement = {
    ...hostElement,
    styles: {
      'font-family': 'BlinkMacSystemFont',
      border: '0px none rgb(128, 128, 128)',
      overflow: 'visible',
    },
  };
  const basis = [{ selector: '#review-port', scrollLeft: 0, scrollTop: 120 }];
  const scrolls = [{ selector: '#review-port', scrollLeft: 0, scrollTop: 120 }];
  const current = {
    element: chromiumElement,
    scrollBasis: scrolls,
    visible: true,
  };
  const changedPortableEvidence = [
    ['missing descriptor', null],
    ['selector', { ...current, element: { ...chromiumElement, selector: '#other-target' } }],
    ['selector match count', {
      ...current,
      element: { ...chromiumElement, selectorMatches: 2 },
    }],
    ['tag', { ...current, element: { ...chromiumElement, tag: 'div' } }],
    ['text', { ...current, element: { ...chromiumElement, text: 'Close review' } }],
    ['rectangle x', {
      ...current,
      element: {
        ...chromiumElement,
        rect: { ...chromiumElement.rect, x: chromiumElement.rect.x + 0.01 },
      },
    }],
    ['rectangle width', {
      ...current,
      element: {
        ...chromiumElement,
        rect: { ...chromiumElement.rect, width: chromiumElement.rect.width + 0.01 },
      },
    }],
    ['ancestor order', {
      ...current,
      scrollBasis: [
        { selector: '#inner-port', scrollLeft: 0, scrollTop: 0 },
        ...scrolls,
      ],
    }],
    ['nested scroll offset', {
      ...current,
      scrollBasis: [{ ...scrolls[0], scrollTop: scrolls[0].scrollTop + 1 }],
    }],
  ];

  // Act
  const portableHost = portableElement(hostElement);
  const portableChromium = portableElement(chromiumElement);
  const captureMatches = captureAnchorMatches(hostElement, basis, current, scrolls);
  const oldStyleInclusiveMatch = anchorMatches(hostElement, basis, current, scrolls);
  const rejected = changedPortableEvidence.map(([name, evidence]) => ({
    name,
    matches: captureAnchorMatches(hostElement, basis, evidence, scrolls),
  }));

  // Assert
  assert.deepEqual(portableChromium, portableHost,
    'the capture contract compares selector, match count, tag, text, and projected rect exactly');
  assert.notDeepEqual(chromiumElement.styles, hostElement.styles,
    'the positive fixture contains all three known renderer-specific serializations');
  assert.equal(captureMatches, true,
    'style-only host/Chromium differences are accepted at the production capture matcher');
  assert.equal(oldStyleInclusiveMatch, false,
    'the prior full-descriptor equality gate fails this positive case, pinning its removal');
  assert.deepEqual(rejected, changedPortableEvidence.map(([name]) => ({ name, matches: false })),
    'every portable descriptor or nested-scroll change remains a hard mismatch');
});

test('nested-scroll projection preserves original evidence and matches only the same current ancestor chain', () => {
  // Arrange
  const originalElement = {
    selector: '#target',
    selectorMatches: 1,
    tag: 'button',
    text: 'Open',
    rect: { x: 244, y: 164, width: 238, height: 30 },
    styles: { color: 'rgb(36, 36, 36)', display: 'block' },
  };
  const basis = [
    { selector: '#outer', scrollLeft: -20, scrollTop: 100 },
    { selector: '#main', scrollLeft: 5, scrollTop: 376 },
  ];
  const currentScrolls = [
    { selector: '#outer', scrollLeft: -10, scrollTop: 80 },
    { selector: '#main', scrollLeft: 20, scrollTop: 250 },
    { selector: '#independent', scrollLeft: 0, scrollTop: 143 },
  ];
  const original = annotation({
    tool: 'comment',
    x1: 278,
    y1: 201,
    x2: 278,
    y2: 201,
    comment: 'Keep this target.',
    element: originalElement,
    scrollBasis: basis,
  });
  const freeDrawing = annotation({
    x1: 620,
    y1: 490,
    x2: 800,
    y2: 535,
    element: null,
  });
  const originalSnapshot = structuredClone(original);

  // Act
  const current = projectAnnotation(original, currentScrolls);
  const projectedElement = projectElement(originalElement, basis, currentScrolls);
  const inspected = {
    element: projectedElement,
    scrollBasis: currentScrolls.slice(0, 2),
    visible: true,
  };

  // Assert
  assert.deepEqual(
    { x1: current.x1, y1: current.y1, x2: current.x2, y2: current.y2 },
    { x1: 253, y1: 347, x2: 253, y2: 347 },
  );
  assert.deepEqual(projectedElement.rect, { x: 219, y: 310, width: 238, height: 30 });
  assert.deepEqual(projectAnnotation(current, currentScrolls, true), original);
  assert.deepEqual(projectAnnotation(freeDrawing, currentScrolls), freeDrawing,
    'elementless drawings remain in document coordinates');
  assert.equal(anchorMatches(originalElement, basis, inspected, currentScrolls), true);
  assert.equal(anchorMatches(
    originalElement,
    basis,
    { ...inspected, visible: false },
    currentScrolls,
  ), true, 'viewport clipping is not an identity or uniqueness failure');

  for (const changed of [
    null,
    { ...inspected, element: { ...projectedElement, text: 'Closed' } },
    { ...inspected, element: { ...projectedElement, rect: { ...projectedElement.rect, y: 311 } } },
    { ...inspected, element: { ...projectedElement, rect: { ...projectedElement.rect, width: 239 } } },
    {
      ...inspected,
      element: { ...projectedElement, styles: { ...projectedElement.styles, color: 'rgb(0, 0, 0)' } },
    },
    { ...inspected, scrollBasis: inspected.scrollBasis.slice().reverse() },
    {
      ...inspected,
      scrollBasis: [...inspected.scrollBasis, currentScrolls[2]],
    },
  ]) {
    assert.equal(anchorMatches(originalElement, basis, changed, currentScrolls), false);
  }
  assert.equal(
    anchorMatches(originalElement, basis, inspected, currentScrolls.filter(s => s.selector !== '#main')),
    false,
    'a missing current scrollport cannot be inferred',
  );
  assert.equal(
    anchorMatches(originalElement, undefined, {
      element: originalElement,
      scrollBasis: [currentScrolls[1]],
      visible: true,
    }, currentScrolls),
    false,
    'a legacy anchor with no basis remains unknown when it has a scroll ancestor',
  );
  assert.throws(
    () => projectAnnotation(original, currentScrolls.filter(s => s.selector !== '#main')),
    /review_anchor_invalid/,
  );
  assert.deepEqual(original, originalSnapshot, 'projection never rewrites original semantic evidence');
});

test('nested-scroll records are bounded and reports distinguish current projection from original evidence', () => {
  // Arrange
  const target = {
    selector: '#target',
    selectorMatches: 1,
    tag: 'button',
    text: 'Open',
    rect: { x: 244, y: 84, width: 238, height: 30 },
    styles: { color: 'rgb(36, 36, 36)', display: 'block' },
  };
  const basis = [{ selector: '#main', scrollLeft: 0, scrollTop: 376 }];
  const currentScrolls = [
    { selector: '#main', scrollLeft: 0, scrollTop: 300 },
    { selector: '#independent', scrollLeft: -12, scrollTop: 143 },
  ];
  const id = '11111111-1111-4111-8111-111111111111';
  const state = savedState({
    annotations: [annotation({
      id,
      tool: 'comment',
      x1: 278,
      y1: 100,
      x2: 278,
      y2: 100,
      comment: 'Project this exact comment.',
      element: target,
      scrollBasis: basis,
    })],
    selectedId: id,
    view: {
      ...view({ width: 908, height: 586, deviceScale: 2 }),
      scrolls: currentScrolls,
    },
  });
  const working = {
    submissionId: '22222222-2222-4222-8222-222222222222',
    scope: {
      kind: 'feature',
      ideaPath: '.dude/ideas/057-dude-canvas-needs-you.md',
      specPath: '.dude/specs/057-dude-canvas-needs-you/spec.md',
    },
    preview: {
      artifact: {
        path: '.dude/specs/057-dude-canvas-needs-you/design/mock.html',
        revision: hash('nested mock'),
      },
      assets: [],
    },
    requestRef: 'nested-report',
    requestRevision: 'revision-1',
    state,
  };
  const oversizedScrolls = Array.from({ length: 600 }, (_, index) => ({
    selector: `#port-${index}-${'x'.repeat(990)}`,
    scrollLeft: 0,
    scrollTop: index,
  }));
  const malformed = [
    [{ selector: '#main', scrollLeft: 0, scrollTop: 0, extra: true }],
    [
      { selector: '#main', scrollLeft: 0, scrollTop: 0 },
      { selector: '#main', scrollLeft: 0, scrollTop: 1 },
    ],
    [{ selector: '#main', scrollLeft: 0, scrollTop: Number.NaN }],
    [{ selector: '#main', scrollLeft: 0, scrollTop: -1 }],
    [{ selector: '#main', scrollLeft: 1_000_001, scrollTop: 0 }],
    [{ selector: `#${'x'.repeat(1024)}`, scrollLeft: 0, scrollTop: 0 }],
    oversizedScrolls,
  ];

  // Act
  const validated = workingState(state);
  const report = buildReport(working, {
    width: 1816,
    height: 1172,
    mode: 'fresh-viewport',
    warnings: ['Fresh source rendering.'],
  }, null);

  // Assert
  assertVisibleAnnotations(validated);
  assert.deepEqual(validated.annotations[0].scrollBasis, basis);
  assert.deepEqual(
    { x1: validated.annotations[0].x1, y1: validated.annotations[0].y1 },
    { x1: 278, y1: 100 },
    'storage validation retains original coordinates',
  );
  assert.deepEqual(validated.view.scrolls, currentScrolls);
  assert.match(report, /Geometry: at \(278, 176\)\./);
  assert.match(report, /Original annotation geometry: at \(278, 100\)\./);
  assert.match(report, /"selector": "#independent"[\s\S]*"scrollLeft": -12[\s\S]*"scrollTop": 143/);
  assert.match(report, /Current validated target geometry:[\s\S]*"y": 160/);
  assert.equal(validScrolls(currentScrolls), true, 'negative RTL scrollLeft is a supported browser value');
  for (const records of malformed) assert.equal(validScrolls(records), false);
  assert.throws(
    () => workingState({
      ...state,
      view: { ...state.view, scrolls: currentScrolls.slice(1) },
    }),
    (error) => isReviewError(error, 'review_anchor_invalid'),
    'every stored basis selector must exist in the current view snapshot',
  );
  assert.throws(
    () => workingState({
      ...state,
      annotations: [{ ...state.annotations[0], element: null }],
    }),
    (error) => isReviewError(error, 'review_anchor_invalid'),
    'scroll basis is valid only for an element anchor',
  );
  assert.throws(
    () => workingState({
      ...state,
      view: { ...state.view, extra: true },
    }),
    (error) => isReviewError(error, 'review_invalid_input'),
    'the persisted view boundary remains closed',
  );
});

test('root-only legacy state and report bytes remain unchanged while nested legacy basis stays unknown', () => {
  // Arrange
  const id = '33333333-3333-4333-8333-333333333333';
  const target = {
    selector: '#legacy-target',
    selectorMatches: 1,
    tag: 'button',
    text: 'Legacy target',
    rect: { x: 30, y: 40, width: 140, height: 36 },
    styles: { color: 'rgb(17, 34, 51)', 'font-family': '"Segoe UI"' },
  };
  const state = savedState({
    annotations: [annotation({
      id,
      tool: 'comment',
      x1: 96,
      y1: 112,
      x2: 96,
      y2: 112,
      comment: 'Legacy root-only comment.',
      element: target,
    })],
    selectedId: id,
    tool: 'comment',
  });
  const working = {
    submissionId: '44444444-4444-4444-8444-444444444444',
    scope: {
      kind: 'feature',
      ideaPath: '.dude/ideas/001-legacy.md',
      specPath: '.dude/specs/001-legacy/spec.md',
    },
    preview: {
      artifact: {
        path: '.dude/specs/001-legacy/design/mock.html',
        revision: hash('legacy mock'),
      },
      assets: [],
    },
    requestRef: 'legacy-review',
    requestRevision: 'legacy-revision',
    state,
  };
  const capture = {
    width: 800,
    height: 600,
    mode: 'fresh-viewport',
    warnings: ['Fresh source rendering.'],
  };

  // Act
  const validated = workingState(state);
  const report = buildReport(working, capture, null);

  // Assert
  assertVisibleAnnotations(validated);
  assert.deepEqual(Object.keys(validated.view).sort(), ['signature', 'viewport']);
  assert.equal(Object.hasOwn(validated.annotations[0], 'scrollBasis'), false);
  assert.doesNotMatch(report, /nested scroll|Original annotation geometry|Ancestor scroll basis/i);
  assert.equal(
    hash(report),
    'sha256:01993e29837a9bee2c0adf8b2488a7385a3c2408b44259dfcc18abf46fa69986',
    'the representative pre-scroll report serialization remains byte-identical',
  );
  assert.equal(anchorMatches(target, undefined, {
    element: target,
    scrollBasis: [],
    visible: true,
  }, []), true, 'legacy root-only anchors remain usable after proving no scroll ancestor');
  assert.equal(anchorMatches(target, undefined, {
    element: target,
    scrollBasis: [{ selector: '#main', scrollLeft: 0, scrollTop: 0 }],
    visible: true,
  }, [{ selector: '#main', scrollLeft: 0, scrollTop: 0 }]), false,
  'legacy nested anchors are retained as unknown, not inferred or retargeted');
});

test('real adapter allocates beneath each exact owner, serves only admitted resources, and saves one concurrent revision', { timeout: 30_000 }, async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-storage-'));
  const alpha = createFeature(root, '101', 'alpha');
  const beta = createFeature(root, '202', 'beta');
  const adapter = createReview({ root });
  const alphaRequest = requestFor(alpha);
  const betaRequest = requestFor(beta);
  const alphaInput = adapterInput(root, alphaRequest);
  const betaInput = adapterInput(root, betaRequest, {
    binding: {
      toolCallId: 'tool-beta',
      requestHandle: 'request-handle-beta',
    },
  });
  try {
    // Act
    const [openedAlpha, openedBeta] = await Promise.all([
      adapter.openReview(alphaInput),
      adapter.openReview(betaInput),
    ]);

    // Assert: caller bindings select a current request; they do not select an
    // output directory outside the exact request owner.
    assert.equal(openedAlpha.status, 'editing');
    assert.equal(openedBeta.status, 'editing');
    assert.equal(openedAlpha.editable, true);
    assert.match(openedAlpha.submissionId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(
      fs.readdirSync(path.join(root, ...alpha.directory.split('/'), 'reviews')),
      [alphaInput.submissionId],
    );
    assert.deepEqual(
      fs.readdirSync(path.join(root, ...beta.directory.split('/'), 'reviews')),
      [betaInput.submissionId],
    );
    assert.equal(fs.existsSync(path.join(root, ...alpha.directory.split('/'), 'reviews', betaInput.submissionId)), false);
    assert.equal(fs.existsSync(path.join(root, ...beta.directory.split('/'), 'reviews', alphaInput.submissionId)), false);

    const frame = adapter.readResource({ ...alphaInput, resourcePath: openedAlpha.framePath });
    assert.equal(frame.mime, 'text/html; charset=utf-8');
    assert.match(frame.bytes.toString('utf8'), /data-dude-review-bridge/);
    assert.match(frame.csp, /^sandbox allow-scripts;/);
    assert.doesNotMatch(frame.csp, /allow-same-origin/);
    assert.match(frame.csp, /default-src 'none'/);
    assert.match(frame.csp, /worker-src 'none'/);
    assert.match(frame.csp, /form-action 'none'/);
    const fontPath = `${path.posix.dirname(openedAlpha.framePath)}/fixture.woff`;
    const font = adapter.readResource({ ...alphaInput, resourcePath: fontPath });
    assert.equal(font.mime, 'font/woff');
    assert.deepEqual(font.bytes, Buffer.from('declared-font-route-fixture'));
    assert.throws(
      () => adapter.readResource({
        ...alphaInput,
        resourcePath: `${path.posix.dirname(openedAlpha.framePath)}/not-declared.json`,
      }),
      (error) => isReviewError(error, 'review_unavailable'),
    );

    const first = savedState({ notes: 'first \u00a0 revision' });
    const second = savedState({ notes: 'second revision', tool: 'circle' });
    const outcomes = await Promise.allSettled([
      adapter.saveReview({
        ...alphaInput,
        workingRevision: openedAlpha.workingRevision,
        working: first,
      }),
      adapter.saveReview({
        ...alphaInput,
        workingRevision: openedAlpha.workingRevision,
        working: second,
      }),
    ]);
    assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
    const rejected = outcomes.find(({ status }) => status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected');
    assert.equal(isReviewError(rejected.reason, 'review_conflict'), true);
    const reopened = await adapter.openReview({ ...alphaInput, allocate: false });
    assert.equal(reopened.status, 'editing');
    assert.equal(reopened.editable, true);
    assert.ok(['first \u00a0 revision', 'second revision'].includes(reopened.working.notes));
    assert.equal(
      fs.readdirSync(path.join(root, ...alpha.directory.split('/'), 'reviews', alphaInput.submissionId))
        .some((name) => name.startsWith('.working-')),
      false,
      'losing concurrent save leaves no adapter-created temporary file',
    );
  } finally {
    adapter.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unchanged saved work reopens as editable only in its live allocation and as read-only evidence after provider loss', { timeout: 30_000 }, async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-restore-'));
  const feature = createFeature(root, '303', 'restore');
  const request = requestFor(feature);
  const adapter = createReview({ root });
  const input = adapterInput(root, request);
  let revision;
  try {
    const opened = await adapter.openReview(input);
    const state = savedState({
      notes: '  preserve\u00a0notes\nand formatting  ',
      tool: 'highlight',
    });
    const saved = await adapter.saveReview({
      ...input,
      workingRevision: opened.workingRevision,
      working: state,
    });
    revision = saved.workingRevision;
    const live = await adapter.openReview({ ...input, allocate: false });
    assert.equal(live.editable, true);
    assert.equal(live.status, 'editing');
    assert.equal(live.workingRevision, revision);
    assert.deepEqual(live.working, state);
  } finally {
    adapter.dispose();
  }

  const restoredAdapter = createReview({ root });
  const historical = adapterInput(root, request, {
    submissionId: input.submissionId,
    allocate: false,
    binding: {
      sessionId: 'fresh-session',
      providerGeneration: 'fresh-generation',
      toolCallId: 'fresh-tool',
      requestHandle: 'fresh-handle',
    },
  });
  try {
    // Act
    const reopened = await restoredAdapter.openReview(historical);

    // Assert
    assert.equal(reopened.status, 'historical');
    assert.equal(reopened.editable, false);
    assert.equal(reopened.workingRevision, revision);
    assert.equal(reopened.working.notes, '  preserve\u00a0notes\nand formatting  ');
    await assert.rejects(
      restoredAdapter.saveReview({
        ...historical,
        workingRevision: reopened.workingRevision,
        working: reopened.working,
      }),
      (error) => isReviewError(error, 'review_historical'),
    );
    assert.deepEqual(
      fs.readdirSync(path.join(root, ...feature.directory.split('/'), 'reviews', input.submissionId)),
      ['working.json'],
    );
  } finally {
    restoredAdapter.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('blank, draft, resolved, malformed, duplicate, other-owner, traversal, symlink, and nonregular sources refuse before review output', { timeout: 60_000 }, async (t) => {
  const cases = [
    {
      name: 'blank workspace',
      arrange(root) {
        const missing = createFeature(root, '401', 'removed');
        const request = requestFor(missing);
        fs.rmSync(path.join(root, '.dude'), { recursive: true });
        return request;
      },
      code: 'review_source_changed',
    },
    {
      name: 'draft owner',
      arrange(root) {
        const feature = createFeature(root, '402', 'draft', { status: 'draft' });
        return requestFor(feature);
      },
      code: 'review_source_changed',
    },
    {
      name: 'resolved owner',
      arrange(root) {
        const feature = createFeature(root, '403', 'resolved', { status: 'resolved' });
        return requestFor(feature);
      },
      code: 'review_source_changed',
    },
    {
      name: 'malformed idea',
      arrange(root) {
        const feature = createFeature(root, '404', 'malformed');
        write(root, feature.ideaPath, 'not frontmatter\n');
        return requestFor(feature);
      },
      code: 'review_source_changed',
    },
    {
      name: 'duplicate exact owner',
      arrange(root) {
        const feature = createFeature(root, '405', 'duplicate');
        write(root, '.dude/ideas/406-copy.md', [
          '---',
          'title: copy',
          'slug: copy',
          'status: defined',
          `spec_path: ${feature.specPath}`,
          '---',
          '',
          '## Idea',
          '',
          'Duplicate owner.',
          '',
        ].join('\n'));
        return requestFor(feature);
      },
      code: 'review_source_changed',
    },
    {
      name: 'other owner scope',
      arrange(root) {
        const alpha = createFeature(root, '407', 'alpha');
        const beta = createFeature(root, '408', 'beta');
        return requestFor(alpha, { scope: beta.scope });
      },
      code: 'review_source_changed',
    },
    {
      name: 'traversal artifact',
      arrange(root) {
        const feature = createFeature(root, '409', 'traversal');
        return requestFor(feature, {
          fields: {
            ...feature.preview,
            artifact: { path: '../outside.html', revision: hash('outside') },
          },
        });
      },
      code: 'review_source_changed',
    },
    {
      name: 'symlink asset',
      arrange(root) {
        const feature = createFeature(root, '410', 'symlink');
        const asset = feature.preview.assets.find(({ path: assetPath }) => assetPath.endsWith('/copy.json'));
        const absolute = path.join(root, ...asset.path.split('/'));
        fs.rmSync(absolute);
        fs.symlinkSync(path.join(root, ...feature.artifactPath.split('/')), absolute);
        feature.preview = {
          ...feature.preview,
          assets: feature.preview.assets.map((entry) => (
            entry.path === asset.path ? { ...entry, revision: hash(read(root, entry.path)) } : entry
          )),
        };
        return requestFor(feature);
      },
      code: 'review_unsafe_path',
    },
    {
      name: 'nonregular asset',
      arrange(root) {
        const feature = createFeature(root, '411', 'directory');
        const asset = feature.preview.assets.find(({ path: assetPath }) => assetPath.endsWith('/copy.json'));
        const absolute = path.join(root, ...asset.path.split('/'));
        fs.rmSync(absolute);
        fs.mkdirSync(absolute);
        feature.preview = {
          ...feature.preview,
          assets: feature.preview.assets.map((entry) => (
            entry.path === asset.path ? { ...entry, revision: hash('directory') } : entry
          )),
        };
        return requestFor(feature);
      },
      code: 'review_unsafe_path',
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      // Arrange
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-refusal-'));
      let adapter;
      try {
        const request = fixture.arrange(root);
        const before = snapshot(root);
        adapter = createReview({ root });
        const input = adapterInput(root, request);

        // Act + Assert
        await assert.rejects(
          adapter.openReview(input),
          (error) => isReviewError(error, fixture.code),
        );
        assert.deepEqual(snapshot(root), before, 'refusal writes no review directory or unrelated .dude bytes');
      } finally {
        adapter?.dispose();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});

test('source, owner, cancellation, and root identity are rechecked before each live save', { timeout: 30_000 }, async (t) => {
  await t.test('asset drift and cancellation retain the prior working bytes', async () => {
    // Arrange
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-boundary-'));
    const feature = createFeature(root, '501', 'boundary');
    const request = requestFor(feature);
    const adapter = createReview({ root });
    const input = adapterInput(root, request);
    try {
      const opened = await adapter.openReview(input);
      const workingPath = `${feature.directory}/reviews/${input.submissionId}/working.json`;
      const before = read(root, workingPath);
      const asset = feature.preview.assets.find(({ path: assetPath }) => assetPath.endsWith('/mock.css'));
      fs.appendFileSync(path.join(root, ...asset.path.split('/')), '/* drift */\n');

      // Act + Assert
      await assert.rejects(
        adapter.saveReview({
          ...input,
          workingRevision: opened.workingRevision,
          working: savedState({ notes: 'must not persist' }),
        }),
        (error) => isReviewError(error, 'review_source_changed'),
      );
      assert.deepEqual(read(root, workingPath), before);
      input.controller.abort();
      await assert.rejects(
        adapter.saveReview({
          ...input,
          workingRevision: opened.workingRevision,
          working: savedState(),
        }),
        { name: 'AbortError' },
      );
      assert.deepEqual(read(root, workingPath), before);
    } finally {
      adapter.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('replaced workspace root cannot redirect an existing adapter', async () => {
    // Arrange
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-root-'));
    const root = path.join(parent, 'workspace');
    fs.mkdirSync(root);
    const feature = createFeature(root, '502', 'root');
    const request = requestFor(feature);
    const adapter = createReview({ root });
    const input = adapterInput(root, request);
    const opened = await adapter.openReview(input);
    const moved = `${root}-original`;
    fs.renameSync(root, moved);
    fs.mkdirSync(root);
    write(root, 'sentinel.txt', 'replacement root\n');
    try {
      // Act + Assert
      await assert.rejects(
        adapter.saveReview({
          ...input,
          workingRevision: opened.workingRevision,
          working: savedState(),
        }),
        (error) => isReviewError(error, 'review_unsafe_path'),
      );
      assert.deepEqual(fs.readdirSync(root), ['sentinel.txt']);
      assert.equal(
        fs.existsSync(path.join(moved, ...feature.directory.split('/'), 'reviews', input.submissionId, 'working.json')),
        true,
        'the original working evidence remains in the original root',
      );
    } finally {
      adapter.dispose();
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

test('missing capture capability keeps valid working markup and creates no report-only submission', { timeout: 10_000 }, async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-no-browser-'));
  const feature = createFeature(root, '503', 'no-browser');
  const request = requestFor(feature);
  const adapter = createReview({ root });
  const input = adapterInput(root, request);
  const originalAccessSync = fs.accessSync;
  fs.accessSync = () => {
    throw Object.assign(new Error('injected unavailable executable'), { code: 'EACCES' });
  };
  try {
    const opened = await adapter.openReview(input);
    assert.equal(opened.capture.available, false);
    assert.equal(opened.capture.reason, 'review_browser_missing');
    assert.equal(Object.hasOwn(opened.capture, 'detail'), false,
      'a missing executable is not fabricated as a child exit');
    const state = savedState();
    const saved = await adapter.saveReview({
      ...input,
      workingRevision: opened.workingRevision,
      working: state,
    });

    // Act + Assert
    await assert.rejects(
      adapter.sealReview({
        ...input,
        workingRevision: saved.workingRevision,
        revisionText: 'Keep markup for an explicit retry.',
      }),
      (error) => isReviewError(error, 'review_browser_missing'),
    );
    assert.deepEqual(
      fs.readdirSync(path.join(root, ...feature.directory.split('/'), 'reviews', input.submissionId)),
      ['working.json'],
    );
    const persisted = JSON.parse(read(
      root,
      `${feature.directory}/reviews/${input.submissionId}/working.json`,
    ).toString('utf8'));
    assert.deepEqual(persisted.state, state);
  } finally {
    fs.accessSync = originalAccessSync;
    adapter.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a cached negative capture descriptor retains child_exit detail and does not retry on later allocations', {
  skip: process.platform === 'win32'
    ? 'The test-owned executable uses the POSIX executable contract.'
    : false,
  timeout: 15_000,
  concurrency: false,
}, async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-negative-cache-'));
  const feature = createFeature(root, '504', 'negative-cache');
  const bin = path.join(root, 'owned-browser-bin');
  const receipt = path.join(root, 'owned-browser-receipt.json');
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
  const adapter = createReview({ root });
  const firstInput = adapterInput(root, requestFor(feature));
  const secondInput = adapterInput(root, requestFor(feature));
  try {
    // Act
    const first = await adapter.openReview(firstInput);
    const second = await adapter.openReview(secondInput);

    // Assert
    const expected = {
      available: false,
      reason: 'review_capture_failed',
      detail: { stage: 'child_exit', exitCode: 23 },
    };
    assert.deepEqual(first.capture, expected);
    assert.deepEqual(second.capture, expected);
    const probe = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    assert.equal(probe.count, 1, 'the provider lifetime caches its first negative preflight');
    assert.equal(fs.existsSync(probe.profile), false, 'the one failed probe removed its owned profile');
    assert.equal(
      fs.existsSync(path.join(
        root,
        ...feature.directory.split('/'),
        'reviews',
        firstInput.submissionId,
        'working.json',
      )),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(
        root,
        ...feature.directory.split('/'),
        'reviews',
        secondInput.submissionId,
        'working.json',
      )),
      true,
    );
  } finally {
    adapter.dispose();
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 selected-owner sealed history is read-only, source-revision tolerant, and carries no restored live authority', async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-history-'));
  const feature = createFeature(root, '601', 'history');
  const sealed = sealedHistory(root, feature);
  const adapter = createReview({ root });
  const request = requestFor(feature, {
    requestRef: sealed.working.requestRef,
    revision: sealed.working.requestRevision,
  });
  const liveInput = adapterInput(root, request, {
    submissionId: sealed.submissionId,
    allocate: false,
  });
  try {
    await assert.rejects(
      adapter.readSealedSubmission(liveInput),
      (error) => isReviewError(error, 'review_historical'),
    );
    fs.appendFileSync(path.join(root, ...feature.artifactPath.split('/')), '<!-- newer canonical revision -->\n');

    // Act
    const list = adapter.readHistory({
      scope: feature.scope,
      signal: new AbortController().signal,
    });
    const selected = adapter.readHistory({
      scope: feature.scope,
      submissionId: sealed.submissionId,
      signal: new AbortController().signal,
    });

    // Assert
    assert.deepEqual(Object.keys(list).sort(), ['coverage', 'items', 'scope']);
    assert.deepEqual(list.scope, feature.scope);
    assert.deepEqual(list.coverage, { state: 'current', reason: null });
    assert.equal(list.items.length, 1);
    assert.deepEqual(Object.keys(list.items[0]).sort(), [
      'image', 'imageRevision', 'preview', 'reportRevision',
      'requestRef', 'requestRevision', 'submissionId',
    ]);
    assert.equal(list.items[0].submissionId, sealed.submissionId);
    assert.equal(list.items[0].preview.artifact.revision, sealed.working.preview.artifact.revision,
      'an older legitimate source remains historical instead of being rewritten to today');
    assert.deepEqual(Object.keys(selected).sort(), [
      'editable', 'image', 'preview', 'provenance', 'report',
      'scope', 'status', 'submissionId',
    ]);
    assert.equal(selected.status, 'historical');
    assert.equal(selected.editable, false);
    assert.equal(selected.report, sealed.report);
    assert.equal(Buffer.from(selected.image.base64, 'base64').equals(sealed.image), true);
    assert.deepEqual(
      { width: selected.image.width, height: selected.image.height },
      { width: 320, height: 240 },
    );
    const serialized = JSON.stringify({ list, selected });
    assert.doesNotMatch(serialized, /requestHandle|toolCallId|sessionId|providerGeneration|framePath|captureReceipt/);
    assert.doesNotMatch(serialized, /reviewedAt|mtime|priority|liveFrame|credentials/i);
    assert.equal(fs.existsSync(path.join(root, ...sealed.directory.split('/'), 'provenance.json')), true);
  } finally {
    adapter.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('versioned seals keep v2 renderer evidence local and v1 history byte-exact', async (t) => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-versioned-seals-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const feature = createFeature(root, '603', 'versioned-seals');
  const nestedScrolls = [{ selector: '#review-port', scrollLeft: 0, scrollTop: 40 }];
  const target = {
    selector: '#historical-target',
    selectorMatches: 1,
    tag: 'button',
    text: 'Historical target',
    rect: { x: 48, y: 52, width: 180, height: 44 },
    styles: {
      'font-family': '"system-ui"',
      border: 'rgb(118, 118, 118)',
      overflow: 'clip',
    },
  };
  const state = savedState({
    annotations: [annotation({
      id: '11111111-1111-4111-8111-111111111111',
      tool: 'comment',
      x1: 80,
      y1: 88,
      x2: 80,
      y2: 88,
      comment: 'Retain these exact historical bytes.',
      element: target,
      scrollBasis: nestedScrolls,
    })],
    tool: 'comment',
    view: {
      ...view({ width: 320, height: 240, deviceScale: 2 }),
      scrolls: nestedScrolls,
    },
  });
  const v1 = sealedHistory(root, feature, {
    version: 1,
    submissionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    requestRef: 'historical-version-1',
    requestRevision: 'historical-revision-1',
    revisionText: 'Apply the historical annotation exactly.',
    state,
  });
  const v2 = sealedHistory(root, feature, {
    version: 2,
    submissionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    requestRef: 'portable-version-2',
    requestRevision: 'portable-revision-2',
    revisionText: null,
    state,
  });
  const adapter = createReview({ root });
  let selectedV1;
  let selectedV2;
  try {
    selectedV1 = adapter.readHistory({
      scope: feature.scope,
      submissionId: v1.submissionId,
      signal: new AbortController().signal,
    });
    selectedV2 = adapter.readHistory({
      scope: feature.scope,
      submissionId: v2.submissionId,
      signal: new AbortController().signal,
    });
  } finally {
    adapter.dispose();
  }
  const projected = projectElement(target, nestedScrolls, nestedScrolls);
  const fullRevision = hash(JSON.stringify(projected));
  const portableRevision = hash(JSON.stringify(portableElement(projected)));
  const mutations = [
    {
      name: 'version 1 renderer signature no longer equals the historical host signature',
      sealed: v1,
      mutate({ provenance }) {
        provenance.capture.beforeSignature = hash('other historical renderer');
        provenance.capture.afterSignature = provenance.capture.beforeSignature;
      },
    },
    {
      name: 'version 1 selector revision is downgraded to the portable subset',
      sealed: v1,
      mutate({ provenance }) {
        provenance.capture.selectors[0].elementRevision = portableRevision;
      },
    },
    {
      name: 'version 1 report bytes are relabeled with version 2 wording',
      sealed: v1,
      mutate({ root: copy, provenance, reportPath }) {
        const relabeled = buildReport(v1.working, provenance.capture, provenance.revisionText, 2);
        fs.writeFileSync(path.join(copy, ...reportPath.split('/')), relabeled);
        provenance.reportRevision = hash(relabeled);
      },
    },
    {
      name: 'version 2 Chromium signature changes during capture',
      sealed: v2,
      mutate({ root: copy, provenance, reportPath }) {
        provenance.capture.afterSignature = hash('unstable Chromium after signature');
        const report = buildReport(v2.working, provenance.capture, provenance.revisionText, 2);
        fs.writeFileSync(path.join(copy, ...reportPath.split('/')), report);
        provenance.reportRevision = hash(report);
      },
    },
    {
      name: 'version 2 capture viewport changes',
      sealed: v2,
      mutate({ provenance }) {
        provenance.capture.viewport = {
          ...provenance.capture.viewport,
          width: provenance.capture.viewport.width + 1,
        };
      },
    },
    {
      name: 'version 2 capture DPR changes',
      sealed: v2,
      mutate({ provenance }) {
        provenance.capture.viewport = {
          ...provenance.capture.viewport,
          deviceScale: 1,
        };
      },
    },
    {
      name: 'version 2 nested-scroll readback changes',
      sealed: v2,
      mutate({ provenance }) {
        provenance.capture.scrolls = [{
          ...provenance.capture.scrolls[0],
          scrollTop: provenance.capture.scrolls[0].scrollTop + 1,
        }];
      },
    },
    {
      name: 'version 2 selector identity is forged',
      sealed: v2,
      mutate({ provenance }) {
        provenance.capture.selectors[0].selector = '#forged-target';
      },
    },
    {
      name: 'version 2 selector match count is forged',
      sealed: v2,
      mutate({ provenance }) {
        provenance.capture.selectors[0].matches = 2;
      },
    },
    {
      name: 'version 2 selector revision restores the style-inclusive hash',
      sealed: v2,
      mutate({ provenance }) {
        provenance.capture.selectors[0].elementRevision = fullRevision;
      },
    },
  ];

  // Act
  const mutationResults = [];
  for (const fixture of mutations) {
    await t.test(fixture.name, () => {
      const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-versioned-copy-'));
      fs.cpSync(root, copy, { recursive: true });
      const provenancePath = `${fixture.sealed.directory}/provenance.json`;
      const reportPath = `${fixture.sealed.directory}/report.md`;
      const provenance = JSON.parse(fs.readFileSync(
        path.join(copy, ...provenancePath.split('/')),
        'utf8',
      ));
      fixture.mutate({ root: copy, provenance, reportPath });
      fs.writeFileSync(
        path.join(copy, ...provenancePath.split('/')),
        jsonBytes(provenance),
      );
      const copiedAdapter = createReview({ root: copy });
      try {
        assert.throws(
          () => copiedAdapter.readHistory({
            scope: feature.scope,
            submissionId: fixture.sealed.submissionId,
            signal: new AbortController().signal,
          }),
          (error) => isReviewError(error, 'review_evidence_invalid'),
        );
        mutationResults.push(fixture.name);
      } finally {
        copiedAdapter.dispose();
        fs.rmSync(copy, { recursive: true, force: true });
      }
    });
  }

  // Assert
  assert.equal(selectedV1.report, v1.report,
    'the history reader reconstructs and byte-compares the original version-1 report');
  assert.equal(
    hash(v1.report),
    'sha256:308500adae32a5a3c835903647ab7b1661bc2be8a51cb18c6e17c3c223e5e5dd',
    'the anchored synthetic old-format report is a fixed byte fixture',
  );
  assert.equal(selectedV1.provenance.capture.beforeSignature, state.view.signature);
  assert.equal(v1.provenance.capture.selectors[0].elementRevision, fullRevision,
    'version 1 binds the complete descriptor, including host-observed styles');
  assert.notEqual(fullRevision, portableRevision,
    'the historical full-descriptor assertion cannot pass if styles are accidentally omitted');
  assert.equal(selectedV2.report, v2.report);
  assert.equal(v2.provenance.capture.beforeSignature, v2.provenance.capture.afterSignature);
  assert.notEqual(v2.provenance.capture.beforeSignature, state.view.signature,
    'version 2 requires only renderer-local before/after equality');
  assert.equal(v2.provenance.capture.selectors[0].elementRevision, portableRevision,
    'version 2 binds the portable descriptor subset');
  assert.notEqual(v2.provenance.capture.selectors[0].elementRevision, fullRevision);
  assert.deepEqual(mutationResults, mutations.map(({ name }) => name),
    'every forged, mismatched, or renderer-unstable seal is rejected');
});

test('T011 history enforces exact owner and UUID scope while qualifying malformed, unsafe, and bounded neighbors', {
  timeout: 30_000,
}, async () => {
  // Arrange
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-history-scope-'));
  const alpha = createFeature(root, '611', 'alpha-history');
  const beta = createFeature(root, '612', 'beta-history');
  const alphaSeal = sealedHistory(root, alpha);
  const betaSeal = sealedHistory(root, beta);
  const adapter = createReview({ root });
  try {
    // Act + Assert: one owner cannot see another owner's history.
    const alphaList = adapter.readHistory({ scope: alpha.scope, signal: new AbortController().signal });
    const betaList = adapter.readHistory({ scope: beta.scope, signal: new AbortController().signal });
    assert.deepEqual(alphaList.items.map(({ submissionId }) => submissionId), [alphaSeal.submissionId]);
    assert.deepEqual(betaList.items.map(({ submissionId }) => submissionId), [betaSeal.submissionId]);
    assert.equal(JSON.stringify(alphaList).includes(betaSeal.submissionId), false);
    assert.equal(JSON.stringify(betaList).includes(alphaSeal.submissionId), false);

    assert.throws(
      () => adapter.readHistory({
        scope: alpha.scope,
        submissionId: '../not-a-uuid',
        signal: new AbortController().signal,
      }),
      (error) => isReviewError(error, 'review_invalid_input'),
    );
    assert.throws(
      () => adapter.readHistory({
        scope: { ...alpha.scope, ideaPath: beta.ideaPath },
        signal: new AbortController().signal,
      }),
      (error) => isReviewError(error, 'review_source_changed'),
    );

    const parent = `${alpha.directory}/reviews`;
    write(root, `${parent}/not-a-uuid/provenance.json`, '{}');
    const incomplete = randomUUID();
    write(root, `${parent}/${incomplete}/report.md`, 'partial report\n');
    const nonregular = randomUUID();
    fs.mkdirSync(path.join(root, ...`${parent}/${nonregular}/working.json`.split('/')), { recursive: true });
    const symlink = randomUUID();
    if (process.platform !== 'win32') {
      fs.symlinkSync(
        path.join(root, ...alphaSeal.directory.split('/')),
        path.join(root, ...parent.split('/'), symlink),
        'dir',
      );
      assert.throws(
        () => adapter.readHistory({
          scope: alpha.scope,
          submissionId: symlink,
          signal: new AbortController().signal,
        }),
        (error) => isReviewError(error, 'review_unsafe_path'),
      );
    }
    assert.throws(
      () => adapter.readHistory({
        scope: alpha.scope,
        submissionId: nonregular,
        signal: new AbortController().signal,
      }),
      (error) => isReviewError(error, 'review_unsafe_path'),
    );
    for (let index = 0; index < 70; index += 1) {
      fs.mkdirSync(path.join(root, ...parent.split('/'), randomUUID()), { recursive: true });
    }

    // Act
    const partial = adapter.readHistory({
      scope: alpha.scope,
      signal: new AbortController().signal,
    });

    // Assert
    assert.equal(partial.coverage.state, 'partial');
    assert.match(partial.coverage.reason, /unreadable, incomplete, or outside the bounded history read/);
    assert.ok(partial.items.length <= 1, 'bounded collection cannot fabricate records from malformed neighbors');

    write(root, '.dude/ideas/999-ambiguous-history.md', [
      '---',
      'title: ambiguous history',
      'slug: ambiguous-history',
      'status: defined',
      `spec_path: ${alpha.specPath}`,
      '---',
      '',
      '## Idea',
      '',
      'Duplicate owner fixture.',
      '',
    ].join('\n'));
    assert.throws(
      () => adapter.readHistory({ scope: alpha.scope, signal: new AbortController().signal }),
      (error) => isReviewError(error, 'review_source_changed'),
      'selected owner ambiguity invalidates the history scope',
    );
  } finally {
    adapter.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T011 history refuses report, image, provenance, and working tamper or oversize without changing original bytes', async (t) => {
  // Arrange
  const original = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-history-tamper-'));
  const feature = createFeature(original, '621', 'tamper-history');
  const sealed = sealedHistory(original, feature);
  const cases = [
    {
      name: 'report bytes',
      code: 'review_evidence_invalid',
      tamper(root) { fs.appendFileSync(path.join(root, ...`${sealed.directory}/report.md`.split('/')), 'tampered'); },
    },
    {
      name: 'PNG bytes',
      code: 'review_evidence_invalid',
      tamper(root) { write(root, `${sealed.directory}/annotated.png`, png(16, 16)); },
    },
    {
      name: 'provenance seal',
      code: 'review_evidence_invalid',
      tamper(root) {
        const file = path.join(root, ...`${sealed.directory}/provenance.json`.split('/'));
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.reportRevision = hash('other report');
        fs.writeFileSync(file, jsonBytes(value));
      },
    },
    {
      name: 'working state',
      code: 'review_evidence_invalid',
      tamper(root) {
        const file = path.join(root, ...`${sealed.directory}/working.json`.split('/'));
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.state.notes = 'different working bytes';
        fs.writeFileSync(file, jsonBytes(value));
      },
    },
    {
      name: 'oversized selected report',
      code: 'review_unsafe_path',
      tamper(root) {
        fs.truncateSync(
          path.join(root, ...`${sealed.directory}/report.md`.split('/')),
          REVIEW_LIMITS.reportBytes + 1,
        );
      },
    },
    {
      name: 'oversized selected image',
      code: 'review_unsafe_path',
      tamper(root) {
        fs.truncateSync(
          path.join(root, ...`${sealed.directory}/annotated.png`.split('/')),
          REVIEW_LIMITS.pngBytes + 1,
        );
      },
    },
  ];
  try {
    for (const fixture of cases) {
      await t.test(fixture.name, () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-review-history-copy-'));
        fs.cpSync(original, root, { recursive: true });
        const copiedFeature = {
          ...feature,
          root,
        };
        fixture.tamper(root);
        const before = snapshot(root);
        const adapter = createReview({ root });
        try {
          // Act + Assert
          assert.throws(
            () => adapter.readHistory({
              scope: copiedFeature.scope,
              submissionId: sealed.submissionId,
              signal: new AbortController().signal,
            }),
            (error) => isReviewError(error, fixture.code),
          );
          assert.deepEqual(snapshot(root), before, 'read refusal leaves every original byte and path untouched');
        } finally {
          adapter.dispose();
          fs.rmSync(root, { recursive: true, force: true });
        }
      });
    }
  } finally {
    fs.rmSync(original, { recursive: true, force: true });
  }
});

test('review limits reject out-of-view, malformed caret, duplicate IDs, oversized text, and invalid viewport scaling', () => {
  // Arrange
  const duplicate = randomUUID();
  const valid = savedState();
  const styleNames = Array.from({ length: 33 }, (_, index) => (
    `x-${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + (index % 26))}`
  ));
  const target = {
    selector: '#style-cap',
    selectorMatches: 1,
    tag: 'rect',
    text: '',
    rect: { x: 20, y: 20, width: 80, height: 40 },
    styles: Object.fromEntries(styleNames.slice(0, 32).map((name) => [name, 'currentColor'])),
  };
  const atStyleCapInput = {
    ...valid,
    annotations: [annotation({
      tool: 'comment',
      x1: 40,
      y1: 40,
      x2: 40,
      y2: 40,
      element: target,
    })],
  };

  // Act
  const atStyleCap = workingState(atStyleCapInput);

  // Assert
  assert.deepEqual(
    Object.keys(atStyleCap.view).sort(),
    ['signature', 'viewport'],
    'private inspection evidence does not extend the persisted view contract',
  );
  assert.equal(Object.keys(atStyleCap.annotations[0].element.styles).length, 32);
  assert.throws(
    () => workingState({
      ...atStyleCapInput,
      annotations: [{
        ...atStyleCapInput.annotations[0],
        element: {
          ...target,
          styles: { ...target.styles, [styleNames[32]]: 'currentColor' },
        },
      }],
    }),
    (error) => isReviewError(error, 'review_invalid_input'),
  );
  assert.throws(
    () => workingState({
      ...valid,
      annotations: [annotation({ id: duplicate }), annotation({ id: duplicate, x1: 300, x2: 420 })],
    }),
    (error) => isReviewError(error, 'review_invalid_input'),
  );
  assert.throws(
    () => workingState({
      ...valid,
      selectedId: valid.annotations[0].id,
      caret: { id: valid.annotations[0].id, field: 'comment', start: 4, end: 2, direction: 'none' },
    }),
    (error) => isReviewError(error, 'review_invalid_input'),
  );
  assert.throws(
    () => workingState({ ...valid, notes: 'x'.repeat(32769) }),
    (error) => isReviewError(error, 'review_invalid_input'),
  );
  assert.throws(
    () => workingState({
      ...valid,
      view: view({ width: REVIEW_LIMITS.dimension, height: REVIEW_LIMITS.dimension, deviceScale: 4 }),
    }),
    (error) => isReviewError(error, 'review_invalid_input'),
  );
  const outside = workingState({
    ...valid,
    view: view({ width: 200, height: 160 }),
    annotations: [annotation({ x1: 190, y1: 140, x2: 260, y2: 220 })],
  });
  assert.throws(
    () => assertVisibleAnnotations(outside),
    (error) => isReviewError(error, 'review_outside_viewport'),
  );
});

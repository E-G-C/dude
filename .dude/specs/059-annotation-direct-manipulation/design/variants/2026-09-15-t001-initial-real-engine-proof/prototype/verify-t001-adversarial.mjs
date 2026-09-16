// @ts-check
// Independent, focused verification for T001@59a10f01.
//
// This is test infrastructure only. It imports the design fixture transport and
// native-CDP primitives, exercises the source-derived Review engine, and writes
// timestamped evidence under this design directory. It does not modify the
// prototype implementation or any live Canvas source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureDriver } from './fixture-driver.mjs';
import {
  startBrowser, stopBrowser, evaluate, until, clientPoint, move, drag, settle,
  state, cursor, clickTool, key, handlePoint, boundaryPoint, TOOL_LABEL,
  DESIGN_ROOT, REPOSITORY_ROOT, sha256,
} from './proof-harness.mjs';
import { hitBoundary, withinClip, cursorForHandle } from './review/geometry.mjs';

const startedAt = new Date().toISOString();
const stamp = startedAt.replace(/[:.]/g, '-');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = {
  task: 'T001@59a10f01',
  startedAt,
  command: 'node .dude/specs/059-annotation-direct-manipulation/design/prototype/verify-t001-adversarial.mjs',
  checks: [],
  counts: { groupsPlanned: 6, groupsExecuted: 0, passed: 0, failed: 0, skipped: 0 },
  caseCounts: {
    geometryPredicates: 0,
    scaleVariants: 0,
    nativeRoutingCases: 0,
    gestureCases: 0,
    caretCases: 0,
    providerControlCases: 0,
  },
  observations: {},
  artifacts: [],
};

const rawMove = (page, at, buttons = 0) => page.send('Input.dispatchMouseEvent',
  { type: 'mouseMoved', ...at, ...(buttons ? { button: 'left', buttons } : {}) });
const rawDown = (page, at) => page.send('Input.dispatchMouseEvent',
  { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
const rawUp = (page, at) => page.send('Input.dispatchMouseEvent',
  { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 });
const command = (page, value) => evaluate(page,
  `window.__designReviewEngine.command(${JSON.stringify(value)})`);
const coords = annotation => [annotation.x1, annotation.y1, annotation.x2, annotation.y2];
const find = (value, id) => value.annotations.find(annotation => annotation.id === id);
const commentsOpen = page => evaluate(page,
  `Boolean(document.querySelector('[aria-label="Close comments"]'))`);

async function setViewportAtScale(page, width, height, theme, deviceScaleFactor) {
  await page.send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor, mobile: false });
  await page.send('Emulation.setEmulatedMedia',
    { media: '', features: [{ name: 'prefers-color-scheme', value: theme }] });
}

async function openFresh(page, options = {}) {
  const {
    width = 1280, height = 900, theme = 'light', deviceScaleFactor = 1,
  } = options;
  const driver = await startFixtureDriver();
  await setViewportAtScale(page, width, height, theme, deviceScaleFactor);
  await page.send('Page.navigate', { url: driver.url });
  await until(async () => evaluate(page, `location.origin === ${JSON.stringify(driver.origin)}
    && Boolean(window.__designReviewEngine?.getState().ready)`),
  `fresh fixture at ${width}x${height} DPR ${deviceScaleFactor}`, 40_000);
  return driver;
}

async function draw(page, tool, from, to) {
  await clickTool(page, TOOL_LABEL[tool]);
  const before = (await state(page)).annotations.length;
  await drag(page, from, to);
  const after = await until(async () => {
    const value = await state(page);
    return value.annotations.length === before + 1 && !value.busy ? value : null;
  }, `${tool} native drawing to commit`);
  return after.annotations.at(-1);
}

async function clearAnnotations(page) {
  await evaluate(page, `(async () => {
    const engine = window.__designReviewEngine;
    for (const annotation of engine.getState().annotations) {
      await engine.command({ type: 'delete', id: annotation.id });
    }
  })()`);
  await settle(page);
}

async function clickButton(page, text) {
  const at = await evaluate(page, `(() => {
    const node = [...document.querySelectorAll('button')]
      .find(button => button.textContent.trim() === ${JSON.stringify(text)});
    if (!node) throw new Error('missing button: ' + ${JSON.stringify(text)});
    const box = node.getBoundingClientRect();
    return {
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
    };
  })()`);
  assert.equal(at.disabled, false, `${text} is enabled for this arranged case`);
  await rawMove(page, at);
  await rawDown(page, at);
  await rawUp(page, at);
  await settle(page);
}

async function closeComments(page) {
  if (!await commentsOpen(page)) return;
  await key(page, 'Escape', { code: 'Escape' });
  const closed = await until(async () => !await commentsOpen(page),
    'Comments to close with Escape', 2_000).then(() => true, () => false);
  if (!closed) await clickButton(page, 'Done');
  await until(async () => !await commentsOpen(page), 'Comments to close');
}

async function installPointerAudit(page) {
  await evaluate(page, `(() => {
    window.__t001PointerAudit = [];
    const overlay = document.querySelector('.dude-review-overlay');
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      overlay.addEventListener(type, event => window.__t001PointerAudit.push({
        type, isTrusted: event.isTrusted, pointerType: event.pointerType,
        button: event.button, buttons: event.buttons,
      }), true);
    }
  })()`);
}

async function pointerAudit(page) {
  return evaluate(page, `window.__t001PointerAudit ?? []`);
}

async function pressGesture(page, annotationId, { at, away = null, sample = false }) {
  const home = await clientPoint(page, at);
  const startedAt = Date.now();
  let inputs = 0;
  await rawMove(page, home); inputs += 1;
  await rawDown(page, home); inputs += 1;
  let inFlight = null;
  if (away) {
    const destination = await clientPoint(page, { x: at.x + away.x, y: at.y + away.y });
    for (let index = 1; index <= 3; index += 1) {
      await rawMove(page, {
        x: home.x + (destination.x - home.x) * index / 3,
        y: home.y + (destination.y - home.y) * index / 3,
      }, 1);
      inputs += 1;
    }
    if (sample) inFlight = coords(find(await state(page), annotationId));
    for (let index = 2; index >= 0; index -= 1) {
      await rawMove(page, {
        x: home.x + (destination.x - home.x) * index / 3,
        y: home.y + (destination.y - home.y) * index / 3,
      }, 1);
      inputs += 1;
    }
  }
  await rawUp(page, home); inputs += 1;
  await settle(page);
  return { startedAt, elapsedMs: Date.now() - startedAt, inputs, inFlight };
}

async function saveAndRead(page, driver, submissionId) {
  await command(page, { type: 'save' });
  await until(async () => !(await state(page)).saving, 'working save to finish');
  return driver.readWorking(submissionId);
}

async function prepareRedo(page, driver, subjectId) {
  const baselineState = await state(page);
  const baseline = coords(find(baselineState, subjectId));
  const at = boundaryPoint(find(baselineState, subjectId));
  await drag(page, at, { x: at.x + 24, y: at.y + 16 });
  const moved = coords(find(await state(page), subjectId));
  assert.notDeepEqual(moved, baseline, 'redo arrangement includes a real changed move');
  await command(page, { type: 'undo' });
  await settle(page);
  const undone = await state(page);
  assert.deepEqual(coords(find(undone, subjectId)), baseline, 'redo arrangement returned to baseline');
  assert.equal(undone.canRedo, true, 'redo is available before the no-op gesture');
  const working = await saveAndRead(page, driver, undone.submissionId);
  assert.deepEqual(coords(find(working.state, subjectId)), baseline,
    'the arranged working file contains the committed baseline');
  return { baseline, moved, workingGeometry: coords(find(working.state, subjectId)) };
}

async function frameSnapshot(page) {
  return evaluate(page, `(() => {
    const frame = document.querySelector('.dude-review-frame').getBoundingClientRect();
    const stage = document.querySelector('[data-review-engine-host]').getBoundingClientRect();
    const iframe = document.querySelector('.dude-review-frame iframe');
    const engine = window.__designReviewEngine.getState();
    return {
      parentDeviceScale: window.devicePixelRatio,
      childDeviceScale: engine.view.viewport.deviceScale,
      cssViewport: { width: innerWidth, height: innerHeight },
      frame: { width: frame.width, height: frame.height },
      stage: { width: stage.width, height: stage.height },
      reviewViewport: {
        width: engine.view.viewport.width,
        height: engine.view.viewport.height,
        scrollX: engine.view.viewport.scrollX,
        scrollY: engine.view.viewport.scrollY,
      },
      sandbox: iframe.getAttribute('sandbox'),
    };
  })()`);
}

async function runGroup(name, run) {
  results.counts.groupsExecuted += 1;
  try {
    const detail = await run();
    results.checks.push({ name, status: 'passed', detail });
    results.counts.passed += 1;
    process.stdout.write(`PASS ${name}: ${detail.summary}\n`);
  } catch (error) {
    results.checks.push({
      name,
      status: 'failed',
      error: { name: error?.name, message: error?.message, stack: error?.stack },
    });
    results.counts.failed += 1;
    throw error;
  }
}

async function verifyGeometryPredicates() {
  // Arrange
  const circle = { tool: 'circle', x1: 500, y1: 400, x2: 200, y2: 200 };
  const line = { tool: 'line', x1: 100, y1: 300, x2: 500, y2: 300 };
  const arrow = { tool: 'arrow', x1: 500, y1: 350, x2: 100, y2: 350 };
  const box = { tool: 'box', x1: 120, y1: 100, x2: 420, y2: 300 };
  const clip = { left: 100, top: 80, right: 500, bottom: 400 };

  // Act
  const actual = {
    circleTop: hitBoundary(circle, { x: 350, y: 200 }),
    circleNearInner: hitBoundary(circle, { x: 350, y: 207 }),
    circlePastInnerBand: hitBoundary(circle, { x: 350, y: 209 }),
    circleCenter: hitBoundary(circle, { x: 350, y: 300 }),
    circleBoundingCorner: hitBoundary(circle, { x: 200, y: 200 }),
    lineNearStroke: hitBoundary(line, { x: 300, y: 309 }),
    linePastStroke: hitBoundary(line, { x: 300, y: 311 }),
    arrowNearStroke: hitBoundary(arrow, { x: 300, y: 341 }),
    arrowPastStroke: hitBoundary(arrow, { x: 300, y: 339 }),
    boxEdge: hitBoundary(box, { x: 250, y: 106 }),
    boxInterior: hitBoundary(box, { x: 250, y: 120 }),
    clipEdge: withinClip({ x: 100, y: 80 }, clip),
    clipOutside: withinClip({ x: 99.99, y: 80 }, clip),
    endpointCursors: [
      cursorForHandle({ ...line, x2: 500, y2: 300 }, 'p2'),
      cursorForHandle({ ...line, x2: 500, y2: 700 }, 'p2'),
      cursorForHandle({ ...line, x2: 500, y2: 700, x1: 100, y1: 300 }, 'p2'),
      cursorForHandle({ ...line, x2: 100, y2: 700, x1: 500, y1: 300 }, 'p2'),
    ],
  };

  // Assert
  assert.deepEqual(actual, {
    circleTop: true,
    circleNearInner: true,
    circlePastInnerBand: false,
    circleCenter: false,
    circleBoundingCorner: false,
    lineNearStroke: true,
    linePastStroke: false,
    arrowNearStroke: true,
    arrowPastStroke: false,
    boxEdge: true,
    boxInterior: false,
    clipEdge: true,
    clipOutside: false,
    endpointCursors: ['ew-resize', 'nwse-resize', 'nwse-resize', 'nesw-resize'],
  });
  results.caseCounts.geometryPredicates = 14;
  results.observations.geometryPredicates = actual;
  return {
    summary: '14 boundary, clip, interior, ellipse, segment, and directional-cursor predicates matched',
  };
}

async function verifyDpr2AndPinnedFrame() {
  /** @type {any} */
  let mismatchBrowser;
  /** @type {any} */
  let mismatchDriver;
  /** @type {any} */
  let matchedBrowser;
  /** @type {any} */
  let matchedDriver;
  try {
    // Arrange: reproduce the reported mixed-scale test setup.
    mismatchBrowser = await startBrowser(2);
    mismatchDriver = await openFresh(mismatchBrowser.page,
      { width: 768, height: 800, deviceScaleFactor: 1 });
    await installPointerAudit(mismatchBrowser.page);
    const mixedBefore = await frameSnapshot(mismatchBrowser.page);

    // Act: send a real first drawing through the mismatched parent/child view.
    await clickTool(mismatchBrowser.page, TOOL_LABEL.box);
    await drag(mismatchBrowser.page, { x: 120, y: 150 }, { x: 300, y: 280 });
    const mixedAfter = await until(async () => {
      const value = await state(mismatchBrowser.page);
      return !value.busy && value.error ? value : null;
    }, 'mixed-DPR first drawing refusal');

    // Assert: the failure is the existing scale admission check, not missing input.
    assert.equal(mixedBefore.parentDeviceScale, 1);
    assert.equal(mixedBefore.childDeviceScale, 2);
    assert.equal(mixedAfter.annotations.length, 0);
    assert.equal(mixedAfter.error.code, 'review_not_ready');
    const mixedAudit = await pointerAudit(mismatchBrowser.page);
    assert.ok(mixedAudit.some(event => event.type === 'pointerdown'));
    assert.ok(mixedAudit.every(event => event.isTrusted && event.pointerType === 'mouse'));

    await mismatchDriver.close();
    mismatchDriver = null;
    await stopBrowser(mismatchBrowser.browser, mismatchBrowser.profile, mismatchBrowser.page);
    mismatchBrowser = null;

    // Arrange: keep the emulated top-level viewport at the browser's real DPR 2.
    matchedBrowser = await startBrowser(2);
    matchedDriver = await openFresh(matchedBrowser.page,
      { width: 768, height: 800, deviceScaleFactor: 2 });
    await installPointerAudit(matchedBrowser.page);
    const matchedBefore = await frameSnapshot(matchedBrowser.page);

    // Act: draw, then narrow the host after the first annotation.
    const annotation = await draw(matchedBrowser.page, 'box',
      { x: 120, y: 150 }, { x: 330, y: 300 });
    const pinnedBeforeResize = await frameSnapshot(matchedBrowser.page);
    await setViewportAtScale(matchedBrowser.page, 640, 800, 'light', 2);
    await wait(300);
    await settle(matchedBrowser.page);
    const pinnedAfterResize = await frameSnapshot(matchedBrowser.page);
    await setViewportAtScale(matchedBrowser.page, 768, 800, 'light', 2);
    await wait(200);
    await clickTool(matchedBrowser.page, TOOL_LABEL.circle);
    const current = find(await state(matchedBrowser.page), annotation.id);
    await drag(matchedBrowser.page, handlePoint(current, 'se'),
      { x: current.x2 + 26, y: current.y2 + 18 });
    const afterManipulation = await frameSnapshot(matchedBrowser.page);

    // Assert: synchronized DPR 2 admits real input, and the first mark pins the frame.
    assert.equal(matchedBefore.parentDeviceScale, 2);
    assert.equal(matchedBefore.childDeviceScale, 2);
    assert.equal((await state(matchedBrowser.page)).annotations.length, 1);
    assert.equal((await state(matchedBrowser.page)).tool, 'circle');
    assert.equal(pinnedBeforeResize.reviewViewport.width,
      pinnedAfterResize.reviewViewport.width);
    assert.equal(pinnedBeforeResize.reviewViewport.height,
      pinnedAfterResize.reviewViewport.height);
    assert.ok(Math.abs(pinnedBeforeResize.frame.width - pinnedAfterResize.frame.width) < 0.1);
    assert.ok(pinnedAfterResize.frame.width > pinnedAfterResize.stage.width,
      'the pinned reviewed frame remains wider than the narrowed host stage');
    assert.equal(afterManipulation.reviewViewport.width,
      pinnedBeforeResize.reviewViewport.width);
    assert.equal(afterManipulation.reviewViewport.height,
      pinnedBeforeResize.reviewViewport.height);
    assert.equal(matchedBefore.sandbox, 'allow-scripts');
    const audit = await pointerAudit(matchedBrowser.page);
    assert.ok(audit.some(event => event.type === 'pointerdown'));
    assert.ok(audit.every(event => event.isTrusted && event.pointerType === 'mouse'));

    const shot = await matchedBrowser.page.send('Page.captureScreenshot',
      { format: 'png', fromSurface: true });
    const shotPath = path.join(DESIGN_ROOT, 'screenshots',
      `independent-${stamp}-768-css-dpr2-light.png`);
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    results.artifacts.push({
      path: path.relative(REPOSITORY_ROOT, shotPath),
      sha256: sha256(fs.readFileSync(shotPath)),
      bytes: fs.statSync(shotPath).size,
    });
    results.caseCounts.scaleVariants = 2;
    results.observations.deviceScale = {
      mixed: {
        before: mixedBefore,
        refusal: mixedAfter.error,
        annotationCount: mixedAfter.annotations.length,
        trustedPointerEvents: mixedAudit.length,
      },
      synchronized: {
        before: matchedBefore,
        pinnedBeforeResize,
        pinnedAfterResize,
        afterManipulation,
        trustedPointerEvents: audit.length,
      },
    };
    return {
      summary: 'mixed DPR 1/2 reproduced review_not_ready; synchronized DPR 2 drew, resized, and retained the pinned frame',
    };
  } finally {
    if (mismatchDriver) await mismatchDriver.close();
    if (mismatchBrowser) {
      await stopBrowser(mismatchBrowser.browser, mismatchBrowser.profile, mismatchBrowser.page);
    }
    if (matchedDriver) await matchedDriver.close();
    if (matchedBrowser) {
      await stopBrowser(matchedBrowser.browser, matchedBrowser.profile, matchedBrowser.page);
    }
  }
}

async function verifyNativeRoutingAndIdentity() {
  const browser = await startBrowser();
  let driver;
  try {
    // Arrange
    driver = await openFresh(browser.page);
    await installPointerAudit(browser.page);
    const names = ['engine.mjs', 'geometry.mjs', 'shapes.mjs', 'inspector.mjs',
      'panel.mjs', 'capture.mjs', 'bridge.mjs', 'styles.css', 'NOTICE.txt'];
    const loaded = await evaluate(browser.page, `(async () => {
      const names = ${JSON.stringify(names)};
      const digest = async text => {
        const bytes = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      };
      const result = {};
      for (const name of names) {
        result[name] = await digest(await (await fetch('/review/' + name)).text());
      }
      result.host = await digest(await (await fetch('/design/host.js')).text());
      result.document = await digest(await (await fetch('/')).text());
      return result;
    })()`);
    const expected = Object.fromEntries(names.map(name => [
      name,
      sha256(fs.readFileSync(path.join(DESIGN_ROOT, 'prototype', 'review', name))),
    ]));
    expected.host = sha256(fs.readFileSync(path.join(DESIGN_ROOT, 'prototype', 'assets', 'host.js')));
    expected.document = sha256(fs.readFileSync(path.join(DESIGN_ROOT,
      'review-direct-manipulation.html')));

    // Act: use near-boundary points and an older selected segment with native input.
    const circle = await draw(browser.page, 'circle',
      { x: 200, y: 150 }, { x: 500, y: 350 });
    await clickTool(browser.page, TOOL_LABEL.box);
    let current = find(await state(browser.page), circle.id);
    const circleNearRing = {
      x: (current.x1 + current.x2) / 2,
      y: Math.min(current.y1, current.y2) + 7,
    };
    await move(browser.page, circleNearRing);
    const circleNearCursor = await cursor(browser.page);
    const circleBeforeMove = coords(current);
    await drag(browser.page, circleNearRing,
      { x: circleNearRing.x + 20, y: circleNearRing.y + 12 });
    current = find(await state(browser.page), circle.id);
    const circleAfterMove = coords(current);
    const circlePastBand = {
      x: (current.x1 + current.x2) / 2,
      y: Math.min(current.y1, current.y2) + 12,
    };
    await move(browser.page, circlePastBand);
    const circlePastCursor = await cursor(browser.page);
    const beforeInteriorDraw = await state(browser.page);
    await drag(browser.page, circlePastBand,
      { x: circlePastBand.x + 50, y: circlePastBand.y + 34 });
    const afterInteriorDraw = await state(browser.page);

    await clearAnnotations(browser.page);
    const line = await draw(browser.page, 'line',
      { x: 180, y: 430 }, { x: 560, y: 430 });
    await clickTool(browser.page, TOOL_LABEL.highlight);
    current = find(await state(browser.page), line.id);
    const lineNear = { x: (current.x1 + current.x2) / 2, y: current.y1 + 9 };
    await move(browser.page, lineNear);
    const lineNearCursor = await cursor(browser.page);
    const lineBeforeMove = coords(current);
    await drag(browser.page, lineNear, { x: lineNear.x + 18, y: lineNear.y + 10 });
    current = find(await state(browser.page), line.id);
    const lineAfterMove = coords(current);
    const linePastBand = {
      x: (current.x1 + current.x2) / 2,
      y: (current.y1 + current.y2) / 2 + 12,
    };
    await move(browser.page, linePastBand);
    const linePastCursor = await cursor(browser.page);
    const beforeLineInteriorDraw = await state(browser.page);
    await drag(browser.page, linePastBand,
      { x: linePastBand.x + 46, y: linePastBand.y + 28 });
    const afterLineInteriorDraw = await state(browser.page);

    await clearAnnotations(browser.page);
    const older = await draw(browser.page, 'line',
      { x: 150, y: 250 }, { x: 470, y: 250 });
    const newer = await draw(browser.page, 'box',
      { x: 650, y: 180 }, { x: 850, y: 320 });
    await clickTool(browser.page, TOOL_LABEL.select);
    await drag(browser.page, boundaryPoint(older), boundaryPoint(older), 1);
    assert.equal((await state(browser.page)).selectedId, older.id,
      'Select reselected the older segment through its stroke');
    await clickTool(browser.page, TOOL_LABEL.circle);
    const olderBefore = coords(find(await state(browser.page), older.id));
    const newerBefore = coords(find(await state(browser.page), newer.id));
    const endpoint = handlePoint(find(await state(browser.page), older.id), 'p2');
    await move(browser.page, endpoint);
    const olderHandleCursor = await cursor(browser.page);
    await drag(browser.page, endpoint, { x: endpoint.x + 32, y: endpoint.y + 22 });
    const olderAfterState = await state(browser.page);

    const foreignOrigin = await fetch(`${driver.origin}/api/needs-you`, {
      headers: { Origin: 'https://example.invalid' },
    });

    // Assert
    assert.deepEqual(loaded, expected, 'served bytes equal the exact design asset bytes');
    assert.equal(circleNearCursor, 'move');
    assert.deepEqual(circleAfterMove.map((value, index) => value - circleBeforeMove[index]),
      [20, 12, 20, 12]);
    assert.equal(circlePastCursor, 'crosshair');
    assert.equal(afterInteriorDraw.annotations.length,
      beforeInteriorDraw.annotations.length + 1);
    assert.equal(afterInteriorDraw.annotations.at(-1).tool, 'box');
    assert.deepEqual(coords(find(afterInteriorDraw, circle.id)), circleAfterMove);
    assert.equal(lineNearCursor, 'move');
    assert.deepEqual(lineAfterMove.map((value, index) => value - lineBeforeMove[index]),
      [18, 10, 18, 10]);
    assert.equal(linePastCursor, 'crosshair');
    assert.equal(afterLineInteriorDraw.annotations.length,
      beforeLineInteriorDraw.annotations.length + 1);
    assert.equal(afterLineInteriorDraw.annotations.at(-1).tool, 'highlight');
    assert.deepEqual(coords(find(afterLineInteriorDraw, line.id)), lineAfterMove);
    assert.match(olderHandleCursor, /resize$/);
    assert.notDeepEqual(coords(find(olderAfterState, older.id)), olderBefore);
    assert.deepEqual(coords(find(olderAfterState, newer.id)), newerBefore);
    assert.equal(olderAfterState.tool, 'circle');
    assert.equal(olderAfterState.selectedId, older.id);
    assert.equal(foreignOrigin.status, 403);
    const audit = await pointerAudit(browser.page);
    assert.ok(audit.length >= 30);
    assert.ok(audit.every(event => event.isTrusted && event.pointerType === 'mouse'));

    results.caseCounts.nativeRoutingCases = 5;
    results.observations.nativeRouting = {
      loadedAssets: loaded,
      circle: {
        nearRing: { point: circleNearRing, cursor: circleNearCursor },
        pastBand: { point: circlePastBand, cursor: circlePastCursor },
        moved: { from: circleBeforeMove, to: circleAfterMove },
        interiorDrew: afterInteriorDraw.annotations.at(-1).tool,
      },
      segment: {
        nearStroke: { point: lineNear, cursor: lineNearCursor },
        pastBand: { point: linePastBand, cursor: linePastCursor },
        moved: { from: lineBeforeMove, to: lineAfterMove },
        interiorDrew: afterLineInteriorDraw.annotations.at(-1).tool,
      },
      olderSelection: {
        selectedId: olderAfterState.selectedId,
        tool: olderAfterState.tool,
        handleCursor: olderHandleCursor,
        older: { from: olderBefore, to: coords(find(olderAfterState, older.id)) },
        newerUnchanged: coords(find(olderAfterState, newer.id)),
      },
      pointerEvents: { total: audit.length, trusted: audit.filter(event => event.isTrusted).length },
      foreignOriginStatus: foreignOrigin.status,
    };
    return {
      summary: 'exact served assets, trusted native routing near ellipse/segment bands, older selection, and 403 guard passed',
    };
  } finally {
    if (driver) await driver.close();
    await stopBrowser(browser.browser, browser.profile, browser.page);
  }
}

async function verifyGestureHistoryAndSaves() {
  const browser = await startBrowser();
  const gestureObservations = [];
  let driver;
  try {
    // Arrange case 1: a saved baseline with an independent redo opportunity.
    driver = await openFresh(browser.page);
    await installPointerAudit(browser.page);
    let subject = await draw(browser.page, 'box',
      { x: 280, y: 210 }, { x: 560, y: 400 });
    await clickTool(browser.page, TOOL_LABEL.circle);
    let arranged = await prepareRedo(browser.page, driver, subject.id);
    await wait(600);
    let border = boundaryPoint(find(await state(browser.page), subject.id));

    // Act case 1: move the first press away and exactly back, then press once.
    const firstMoved = await pressGesture(browser.page, subject.id,
      { at: border, away: { x: 42, y: 30 }, sample: true });
    const firstFollower = await pressGesture(browser.page, subject.id, { at: border });
    await wait(250);
    let after = await state(browser.page);
    const savedAfterFirst = await saveAndRead(browser.page, driver, after.submissionId);

    // Assert case 1
    assert.notDeepEqual(firstMoved.inFlight, arranged.baseline);
    assert.deepEqual(coords(find(after, subject.id)), arranged.baseline);
    assert.equal(await commentsOpen(browser.page), false);
    assert.equal(after.canRedo, true);
    assert.deepEqual(coords(find(savedAfterFirst.state, subject.id)), arranged.baseline);
    await command(browser.page, { type: 'redo' });
    await settle(browser.page);
    assert.deepEqual(coords(find(await state(browser.page), subject.id)), arranged.moved);
    gestureObservations.push({
      case: 'first press out-and-back then one press',
      opened: false,
      inFlight: firstMoved.inFlight,
      final: arranged.baseline,
      redoPreserved: true,
      savedGeometry: coords(find(savedAfterFirst.state, subject.id)),
      inputs: firstMoved.inputs + firstFollower.inputs,
      pressToPressMs: firstFollower.startedAt - firstMoved.startedAt,
    });

    await driver.close();
    driver = null;

    // Arrange case 2: a separate fixture with its own saved baseline and redo.
    driver = await openFresh(browser.page);
    await installPointerAudit(browser.page);
    subject = await draw(browser.page, 'box',
      { x: 280, y: 210 }, { x: 560, y: 400 });
    await clickTool(browser.page, TOOL_LABEL.circle);
    arranged = await prepareRedo(browser.page, driver, subject.id);
    await wait(600);
    border = boundaryPoint(find(await state(browser.page), subject.id));

    // Act case 2: an unmoved first press, a moving second press, then one press.
    const secondFirst = await pressGesture(browser.page, subject.id, { at: border });
    const secondMoved = await pressGesture(browser.page, subject.id,
      { at: border, away: { x: 40, y: 28 }, sample: true });
    const openedAfterMovingSecond = await commentsOpen(browser.page);
    const secondFollower = await pressGesture(browser.page, subject.id, { at: border });
    await wait(250);
    after = await state(browser.page);
    const savedAfterSecond = await saveAndRead(browser.page, driver, after.submissionId);

    // Assert case 2
    assert.notDeepEqual(secondMoved.inFlight, arranged.baseline);
    assert.deepEqual(coords(find(after, subject.id)), arranged.baseline);
    assert.equal(openedAfterMovingSecond, false);
    assert.equal(await commentsOpen(browser.page), false);
    assert.equal(after.canRedo, true);
    assert.deepEqual(coords(find(savedAfterSecond.state, subject.id)), arranged.baseline);
    await command(browser.page, { type: 'redo' });
    await settle(browser.page);
    assert.deepEqual(coords(find(await state(browser.page), subject.id)), arranged.moved);
    gestureObservations.push({
      case: 'unmoved first, second out-and-back, then one press',
      openedAfterSecond: false,
      openedAfterFollower: false,
      inFlight: secondMoved.inFlight,
      final: arranged.baseline,
      redoPreserved: true,
      savedGeometry: coords(find(savedAfterSecond.state, subject.id)),
      inputs: secondFirst.inputs + secondMoved.inputs + secondFollower.inputs,
      pressToPressMs: [
        secondMoved.startedAt - secondFirst.startedAt,
        secondFollower.startedAt - secondMoved.startedAt,
      ],
    });

    await driver.close();
    driver = null;

    // Arrange case 3: a clean saved fixture for a tiny final geometry change.
    driver = await openFresh(browser.page);
    await installPointerAudit(browser.page);
    subject = await draw(browser.page, 'box',
      { x: 280, y: 210 }, { x: 560, y: 400 });
    await clickTool(browser.page, TOOL_LABEL.circle);
    let currentState = await state(browser.page);
    const tinyBefore = coords(find(currentState, subject.id));
    await saveAndRead(browser.page, driver, currentState.submissionId);
    await wait(600);
    border = boundaryPoint(find(await state(browser.page), subject.id));
    const home = await clientPoint(browser.page, border);
    const tinyEnd = await clientPoint(browser.page, { x: border.x + 2, y: border.y + 1 });

    // Act case 3: commit a 2x1-pixel move, then press once within the 4px pair radius.
    await rawMove(browser.page, home);
    await rawDown(browser.page, home);
    await rawMove(browser.page, tinyEnd, 1);
    const tinyInFlight = coords(find(await state(browser.page), subject.id));
    await rawUp(browser.page, tinyEnd);
    await until(async () => !(await state(browser.page)).busy,
      'tiny committed move to finish before its follower');
    await rawMove(browser.page, tinyEnd);
    await rawDown(browser.page, tinyEnd);
    await rawUp(browser.page, tinyEnd);
    await wait(250);
    after = await state(browser.page);
    const tinyAfter = coords(find(after, subject.id));
    const tinySaved = await saveAndRead(browser.page, driver, after.submissionId);

    // Assert case 3
    assert.deepEqual(tinyAfter.map((value, index) => value - tinyBefore[index]),
      [2, 1, 2, 1]);
    assert.deepEqual(tinyInFlight, tinyAfter);
    assert.equal(await commentsOpen(browser.page), false);
    assert.deepEqual(coords(find(tinySaved.state, subject.id)), tinyAfter);
    await command(browser.page, { type: 'undo' });
    await settle(browser.page);
    assert.deepEqual(coords(find(await state(browser.page), subject.id)), tinyBefore);
    await command(browser.page, { type: 'redo' });
    await settle(browser.page);
    assert.deepEqual(coords(find(await state(browser.page), subject.id)), tinyAfter);
    gestureObservations.push({
      case: '2x1-pixel committed move then one press within pair radius',
      opened: false,
      from: tinyBefore,
      inFlight: tinyInFlight,
      to: tinyAfter,
      oneUndoOneRedo: true,
      savedGeometry: coords(find(tinySaved.state, subject.id)),
    });

    // Arrange cases 4 and 5 on the same unchanged annotation, outside prior timing.
    await wait(600);
    border = boundaryPoint(find(await state(browser.page), subject.id));

    // Act: exceed time, then exceed proximity while staying on the same border.
    const slowFirst = await pressGesture(browser.page, subject.id, { at: border });
    await wait(550);
    const slowSecond = await pressGesture(browser.page, subject.id, { at: border });
    await wait(100);
    const slowOpened = await commentsOpen(browser.page);
    await wait(600);
    const displacedFirst = await pressGesture(browser.page, subject.id,
      { at: { x: border.x - 6, y: border.y } });
    const displacedSecond = await pressGesture(browser.page, subject.id,
      { at: { x: border.x, y: border.y } });
    await wait(200);
    const displacedOpened = await commentsOpen(browser.page);

    // Assert
    assert.equal(slowOpened, false);
    assert.ok(slowSecond.startedAt - slowFirst.startedAt > 500);
    assert.equal(displacedOpened, false);
    gestureObservations.push({
      case: 'same-point presses beyond 500ms',
      opened: false,
      pressToPressMs: slowSecond.startedAt - slowFirst.startedAt,
    }, {
      case: 'same-border presses 6px apart',
      opened: false,
      distancePx: 6,
      pressToPressMs: displacedSecond.startedAt - displacedFirst.startedAt,
    });

    const audit = await pointerAudit(browser.page);
    assert.ok(audit.every(event => event.isTrusted && event.pointerType === 'mouse'));
    results.caseCounts.gestureCases = 5;
    results.observations.adversarialGestures = gestureObservations;
    results.observations.adversarialGesturePointerEvents = {
      total: audit.length,
      trusted: audit.filter(event => event.isTrusted).length,
    };
    return {
      summary: '5 native gesture cases preserved comment exclusion, independent redo/history, and committed saves',
    };
  } finally {
    if (driver) await driver.close();
    await stopBrowser(browser.browser, browser.profile, browser.page);
  }
}

async function verifyBackwardCaretRange() {
  const browser = await startBrowser();
  let driver;
  try {
    // Arrange
    driver = await openFresh(browser.page);
    const subject = await draw(browser.page, 'box',
      { x: 300, y: 220 }, { x: 570, y: 410 });
    await evaluate(browser.page, `document.querySelector('.dude-review-overlay').focus()`);
    await key(browser.page, 'Enter', { code: 'Enter', text: '\r' });
    await until(() => commentsOpen(browser.page), 'Enter to open Comments');
    const fieldReady = await until(async () => evaluate(browser.page, `(() => {
      const node = document.activeElement;
      return node?.labels?.[0]?.textContent?.startsWith('Comment') ? true : null;
    })()`), 'Comment field focus');
    assert.equal(fieldReady, true);
    const text = 'Retain this backward range';
    for (const character of text) {
      await browser.page.send('Input.dispatchKeyEvent',
        { type: 'keyDown', key: character, text: character, unmodifiedText: character });
      await browser.page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character });
    }
    await key(browser.page, 'End', { code: 'End' });

    // Act: form a non-collapsed backward selection with native Shift+ArrowLeft.
    for (let index = 0; index < 6; index += 1) {
      await key(browser.page, 'ArrowLeft', { code: 'ArrowLeft', modifiers: 8 });
    }
    const placed = await evaluate(browser.page, `(() => {
      const node = document.activeElement;
      return {
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
        value: node.value,
      };
    })()`);
    await until(async () => {
      const value = await state(browser.page);
      return value.caret?.start === placed.start && value.caret?.end === placed.end
        && value.caret?.direction === placed.direction ? value : null;
    }, 'engine to remember the backward range');
    await closeComments(browser.page);
    await evaluate(browser.page, `document.querySelector('.dude-review-overlay').focus()`);
    await key(browser.page, 'Enter', { code: 'Enter', text: '\r' });
    await until(() => commentsOpen(browser.page), 'Comments to reopen');
    const restored = await until(async () => evaluate(browser.page, `(() => {
      const node = document.activeElement;
      if (!node?.labels?.[0]?.textContent?.startsWith('Comment')) return null;
      return {
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
        value: node.value,
      };
    })()`), 'backward range to restore');

    // Assert
    assert.equal(placed.value, text);
    assert.ok(placed.end > placed.start);
    assert.equal(placed.direction, 'backward');
    assert.deepEqual(restored, placed);
    assert.equal((await state(browser.page)).selectedId, subject.id);
    results.caseCounts.caretCases = 1;
    results.observations.caretRange = { placed, restored, selectedId: subject.id };
    return {
      summary: `native keyboard restored non-collapsed backward range ${placed.start}-${placed.end}`,
    };
  } finally {
    if (driver) await driver.close();
    await stopBrowser(browser.browser, browser.profile, browser.page);
  }
}

async function verifyRealSaveAndSendControls() {
  const browser = await startBrowser();
  let driver;
  try {
    // Arrange
    driver = await openFresh(browser.page);
    await installPointerAudit(browser.page);
    const subject = await draw(browser.page, 'box',
      { x: 260, y: 210 }, { x: 580, y: 420 });
    let current = await state(browser.page);
    assert.equal(current.capture.available, true,
      `fixture capture must be available: ${current.capture.reason ?? 'available'}`);
    await command(browser.page, {
      type: 'edit',
      id: subject.id,
      changes: { x2: subject.x2 + 18 },
    });
    current = await state(browser.page);
    assert.equal(current.dirty, true);

    // Act: invoke the displayed controls with native mouse input.
    await clickButton(browser.page, 'Save markup');
    current = await until(async () => {
      const value = await state(browser.page);
      return !value.dirty && !value.saving ? value : null;
    }, 'Save markup control to finish');
    const working = driver.readWorking(current.submissionId);
    await clickButton(browser.page, 'Send annotations');
    const sent = await until(async () => {
      const feedback = await evaluate(browser.page,
        `document.querySelector('[data-review-feedback]')?.innerText?.trim() ?? ''`);
      const files = path.join(driver.workspace.root,
        ...driver.workspace.specDirectory.split('/'), 'reviews', current.submissionId);
      const complete = ['working.json', 'report.md', 'annotated.png', 'provenance.json']
        .every(name => fs.existsSync(path.join(files, name)));
      return complete && /Feedback sent|delivered/i.test(feedback)
        ? { feedback, directory: files } : null;
    }, 'real seal, image capture, provider response, and UI receipt', 120_000);
    const providerRecord = driver.provider.read().requests.find(entry =>
      entry.request.requestRef === 'design-059-direct-manipulation');
    const reportPath = path.join(sent.directory, 'report.md');
    const imagePath = path.join(sent.directory, 'annotated.png');
    const provenancePath = path.join(sent.directory, 'provenance.json');
    const retainedImage = path.join(DESIGN_ROOT, 'screenshots',
      `independent-${stamp}-sealed-annotated.png`);
    fs.copyFileSync(imagePath, retainedImage);

    // Assert
    assert.deepEqual(coords(find(working.state, subject.id)),
      coords(find(current, subject.id)));
    assert.equal(providerRecord.phase, 'awaiting_acknowledgment');
    assert.equal(providerRecord.responseAction, 'annotations');
    assert.equal(providerRecord.receipt.acknowledgment, null);
    assert.match(sent.feedback, /awaiting acknowledgment/i);
    assert.ok(fs.statSync(reportPath).size > 0);
    assert.ok(fs.statSync(imagePath).size > 8);
    assert.deepEqual([...fs.readFileSync(imagePath).subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10]);
    const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    assert.equal(provenance.submissionId, current.submissionId);
    const audit = await pointerAudit(browser.page);
    assert.ok(audit.every(event => event.isTrusted && event.pointerType === 'mouse'));

    results.artifacts.push({
      path: path.relative(REPOSITORY_ROOT, retainedImage),
      sha256: sha256(fs.readFileSync(retainedImage)),
      bytes: fs.statSync(retainedImage).size,
    });
    results.caseCounts.providerControlCases = 2;
    results.observations.realControls = {
      submissionId: current.submissionId,
      savedGeometry: coords(find(working.state, subject.id)),
      provider: {
        phase: providerRecord.phase,
        responseAction: providerRecord.responseAction,
        acknowledgment: providerRecord.receipt.acknowledgment,
      },
      feedback: sent.feedback,
      sealed: {
        report: { bytes: fs.statSync(reportPath).size, sha256: sha256(fs.readFileSync(reportPath)) },
        image: { bytes: fs.statSync(imagePath).size, sha256: sha256(fs.readFileSync(imagePath)) },
        provenance: {
          bytes: fs.statSync(provenancePath).size,
          sha256: sha256(fs.readFileSync(provenancePath)),
        },
      },
      trustedPointerEvents: audit.length,
    };
    return {
      summary: 'native Save wrote working.json; native Send sealed report/PNG/provenance through the real provider and stopped awaiting acknowledgment',
    };
  } finally {
    if (driver) await driver.close();
    await stopBrowser(browser.browser, browser.profile, browser.page);
  }
}

let failure = null;
try {
  await runGroup('geometry boundary and clip predicates', verifyGeometryPredicates);
  await runGroup('DPR 2 setup and pinned frame', verifyDpr2AndPinnedFrame);
  await runGroup('native routing, identity, and request guard', verifyNativeRoutingAndIdentity);
  await runGroup('gesture history, redo, and working saves', verifyGestureHistoryAndSaves);
  await runGroup('non-collapsed backward caret restoration', verifyBackwardCaretRange);
  await runGroup('real Save and Send controls', verifyRealSaveAndSendControls);
} catch (error) {
  failure = error;
} finally {
  results.finishedAt = new Date().toISOString();
  results.counts.skipped = results.counts.groupsPlanned - results.counts.groupsExecuted;
  results.outcome = results.counts.failed ? 'failed' : 'passed';
  if (failure) {
    results.failure = { name: failure?.name, message: failure?.message, stack: failure?.stack };
  }
  const evidencePath = path.join(DESIGN_ROOT, 'evidence',
    `independent-t001-${stamp}.json`);
  fs.writeFileSync(evidencePath, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`groups executed/passed/failed/skipped: `
    + `${results.counts.groupsExecuted}/${results.counts.passed}/`
    + `${results.counts.failed}/${results.counts.skipped}\n`);
  process.stdout.write(`evidence: ${path.relative(REPOSITORY_ROOT, evidencePath)}\n`);
}

if (failure) throw failure;

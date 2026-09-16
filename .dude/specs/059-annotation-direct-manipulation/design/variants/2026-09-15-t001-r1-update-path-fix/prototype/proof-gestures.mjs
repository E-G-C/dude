// @ts-check
// Second stage of the 059 design proof: the coupled comment/history gesture,
// the retained Select and Comments behaviour, real working saves, the keyboard
// alternatives, and the rendered evidence.
//
// Every observation here comes from native input against the actual engine and
// the actual Fluent chrome. Nothing is simulated, and nothing reports a save,
// seal, or delivery that the real adapter did not perform.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startFixtureDriver } from './fixture-driver.mjs';
import {
  evaluate, state, cursor, drag, move, clickTool, key, settle, until,
  clientPoint, handlePoint, boundaryPoint, interiorPoint, badgePoint,
  setViewport, TOOL_LABEL, DESIGN_ROOT, step,
} from './proof-harness.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Raw dispatches on precomputed client coordinates, so a pair stays timely. */
const rawMove = (page, at, buttons = 0) => page.send('Input.dispatchMouseEvent',
  { type: 'mouseMoved', ...at, ...(buttons ? { button: 'left', buttons } : {}) });
const rawDown = (page, at) => page.send('Input.dispatchMouseEvent',
  { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 });
const rawUp = (page, at) => page.send('Input.dispatchMouseEvent',
  { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 });

const commentsOpen = page => evaluate(page, `Boolean(document.querySelector('[aria-label="Close comments"]'))`);
const focusedField = page => evaluate(page, `(() => {
  const node = document.activeElement;
  if (!node) return null;
  const label = node.labels?.[0]?.textContent ?? node.getAttribute('aria-label') ?? node.tagName;
  return { label, tag: node.tagName, start: node.selectionStart ?? null, end: node.selectionEnd ?? null, value: node.value ?? null };
})()`);

async function closeComments(page) {
  if (!await commentsOpen(page)) return;
  // Escape is the drawer's own dismissal; the explicit Close comments button is
  // the fallback, re-measured on each attempt so an animating drawer cannot
  // make this harness press empty space.
  await key(page, 'Escape', { code: 'Escape' });
  const dismissed = await until(async () => !await commentsOpen(page), 'the Comments drawer to close', 2_000)
    .then(() => true, () => false);
  if (!dismissed) {
    await until(async () => {
      const at = await evaluate(page, `(() => {
        const node = document.querySelector('[aria-label="Close comments"]');
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      })()`);
      if (!at) return true;
      await rawMove(page, at); await rawDown(page, at); await rawUp(page, at);
      return !await commentsOpen(page);
    }, 'the Comments drawer to close');
  }
  await settle(page);
}

async function clearAnnotations(page) {
  await evaluate(page, `(async () => {
    const engine = window.__designReviewEngine;
    for (const a of engine.getState().annotations) await engine.command({ type: 'delete', id: a.id });
  })()`);
  await settle(page);
}

const command = (page, action) => evaluate(page, `window.__designReviewEngine.command(${JSON.stringify(action)})`);
const find = (value, id) => value.annotations.find(a => a.id === id);
const coords = a => [a.x1, a.y1, a.x2, a.y2];

/** Draw one mark with its own tool through the real palette and pointer. */
async function draw(page, tool, from, to) {
  await clickTool(page, TOOL_LABEL[tool]);
  const before = (await state(page)).annotations.length;
  await drag(page, from, to);
  const after = await until(async () => {
    const value = await state(page);
    return value.annotations.length === before + 1 ? value : null;
  }, `${tool} to be drawn`);
  return after.annotations.at(-1);
}

export async function runRemainingProof({ page, driver, results, record, screenshots }) {
  const observations = results.observations;

  // ---------------------------------------------------------------------
  // Older selection, unselected marks, badges, and no selection.
  step('US1 selection scope: setup');
  await clearAnnotations(page);
  const older = await draw(page, 'box', { x: 120, y: 150 }, { x: 300, y: 270 });
  const newer = await draw(page, 'box', { x: 460, y: 150 }, { x: 620, y: 270 });
  assert.equal((await state(page)).selectedId, newer.id, 'the newest mark is selected after drawing');

  await clickTool(page, TOOL_LABEL.select);
  await drag(page, interiorPoint(older), interiorPoint(older), 1);
  await settle(page);
  assert.equal((await state(page)).selectedId, older.id, 'Select picks the older mark by its whole face');

  const selection = { checks: [] };
  step('US1 selection scope: older selection resize');
  await clickTool(page, TOOL_LABEL.circle);
  let current = await state(page);
  let mark = find(current, older.id);
  const olderHome = coords(mark);
  await drag(page, handlePoint(mark, 'se'), { x: mark.x2 + 22, y: mark.y2 + 16 });
  let after = await state(page);
  assert.notDeepEqual(coords(find(after, older.id)), olderHome, 'an older selected mark still resizes by its handle');
  assert.equal(after.annotations.length, current.annotations.length, 'resizing an older mark adds nothing');
  selection.checks.push({ case: 'older selection resize', from: olderHome, to: coords(find(after, older.id)) });
  await command(page, { type: 'edit', id: older.id, changes: { x1: olderHome[0], y1: olderHome[1], x2: olderHome[2], y2: olderHome[3] } });
  await settle(page);

  // A location that belongs only to an unselected mark must draw, not grab.
  step('US1 selection scope: unselected border');
  current = await state(page);
  const unselectedEdge = boundaryPoint(find(current, newer.id));
  await drag(page, unselectedEdge, { x: unselectedEdge.x + 30, y: unselectedEdge.y + 24 });
  after = await state(page);
  assert.equal(after.annotations.length, current.annotations.length + 1, 'a press on an unselected border draws');
  assert.deepEqual(coords(find(after, newer.id)), coords(find(current, newer.id)), 'the unselected mark was not grabbed');
  assert.equal(after.annotations.at(-1).tool, 'circle', 'the armed tool drew the new mark');
  selection.checks.push({ case: 'unselected border draws', added: true, unselectedUnchanged: true });
  await command(page, { type: 'delete', id: after.annotations.at(-1).id });
  await command(page, { type: 'select', id: older.id });
  await settle(page);

  // A number badge adds no drawing-mode target of its own.
  step('US1 selection scope: badge only');
  current = await state(page);
  const badge = badgePoint(find(current, older.id));
  await drag(page, badge, { x: badge.x - 26, y: badge.y - 20 });
  after = await state(page);
  assert.equal(after.annotations.length, current.annotations.length + 1, 'a press on the selected badge draws');
  assert.deepEqual(coords(find(after, older.id)), coords(find(current, older.id)), 'the badge did not move its mark');
  selection.checks.push({ case: 'badge-only draws', badgePoint: badge });
  await command(page, { type: 'delete', id: after.annotations.at(-1).id });
  await settle(page);

  // With nothing selected, the same border is drawing space.
  step('US1 selection scope: no selection');
  await clickTool(page, TOOL_LABEL.select);
  await drag(page, { x: 900, y: 600 }, { x: 900, y: 600 }, 1);
  await settle(page);
  assert.equal((await state(page)).selectedId, null, 'Select on empty space clears the selection');
  await clickTool(page, TOOL_LABEL.box);
  current = await state(page);
  const clearedEdge = boundaryPoint(find(current, older.id));
  await drag(page, clearedEdge, { x: clearedEdge.x + 40, y: clearedEdge.y + 30 });
  after = await state(page);
  assert.equal(after.annotations.length, current.annotations.length + 1, 'with no selection the border draws');
  assert.deepEqual(coords(find(after, older.id)), coords(find(current, older.id)), 'no unselected mark was grabbed');
  selection.checks.push({ case: 'no selection draws', added: true });
  await command(page, { type: 'delete', id: after.annotations.at(-1).id });
  await settle(page);
  observations.selectionRouting = selection;
  record('US1 selection scope', { detail: 'older selection manipulates; unselected border, badge-only and no-selection all draw' });

  // ---------------------------------------------------------------------
  // Retained Select behaviour.
  step('US3 retained Select: whole face');
  await clickTool(page, TOOL_LABEL.select);
  await command(page, { type: 'select', id: older.id });
  current = await state(page);
  mark = find(current, older.id);
  const faceHome = coords(mark);
  const face = interiorPoint(mark);
  await drag(page, face, { x: face.x + 18, y: face.y + 12 });
  after = await state(page);
  const facePoint = find(after, older.id);
  assert.equal(facePoint.x1 - faceHome[0], 18, 'Select still moves a box by its whole face');
  assert.equal(facePoint.y1 - faceHome[1], 12, 'Select face movement keeps its delta');
  const selectChecks = { faceMove: { from: faceHome, to: coords(facePoint) } };

  step('US3 retained Select: overlap and badge');
  // The published T011 overlapping-badge fixture starts its second box four
  // pixels from the first box's corner, which is now inside that selected
  // mark's handle reach. This arranges the same overlap from a drawing start
  // that is clear of the handle and the border band instead, so the badge
  // oracle below is unchanged rather than weakened.
  const innerStart = { x: facePoint.x1 + 30, y: facePoint.y1 + 30 };
  const nearest = Math.min(...[[facePoint.x1, facePoint.y1], [facePoint.x2, facePoint.y1],
    [facePoint.x1, facePoint.y2], [facePoint.x2, facePoint.y2]]
    .map(([x, y]) => Math.hypot(innerStart.x - x, innerStart.y - y)));
  const insetFromEdge = Math.min(innerStart.x - facePoint.x1, facePoint.x2 - innerStart.x,
    innerStart.y - facePoint.y1, facePoint.y2 - innerStart.y);
  assert.ok(nearest > 9, 'the overlapping-shape start is clear of the selected handle reach');
  assert.ok(insetFromEdge > 8, 'and clear of the selected border band');
  observations.t011Adaptation = { start: innerStart, nearestHandlePx: Math.round(nearest * 100) / 100,
    insetFromEdgePx: insetFromEdge, handleReachPx: 9, borderBandPx: 8 };
  const inner = await draw(page, 'box', innerStart, { x: facePoint.x1 + 120, y: facePoint.y1 + 90 });
  await clickTool(page, TOOL_LABEL.select);
  await command(page, { type: 'select', id: older.id });
  const overlap = interiorPoint(inner);
  await drag(page, overlap, overlap, 1);
  await settle(page);
  assert.equal((await state(page)).selectedId, inner.id, 'Select keeps its topmost order where marks overlap');
  selectChecks.topmost = true;
  await command(page, { type: 'select', id: older.id });
  await settle(page);
  const innerBadge = badgePoint(find(await state(page), inner.id));
  await drag(page, innerBadge, innerBadge, 1);
  await settle(page);
  assert.equal((await state(page)).selectedId, inner.id, 'Select still answers on a number badge');
  selectChecks.badgeSelect = true;

  // The comment pin keeps its own behaviour and gains no handles.
  step('US3 retained Select: comment pin');
  await clickTool(page, TOOL_LABEL.comment);
  const pinAt = { x: 820, y: 220 };
  const beforePin = (await state(page)).annotations.length;
  await drag(page, pinAt, pinAt, 1);
  const pinned = await until(async () => {
    const value = await state(page);
    return value.annotations.length === beforePin + 1 ? value : null;
  }, 'the comment pin to be added');
  const pin = pinned.annotations.at(-1);
  assert.equal(pin.tool, 'comment', 'the Comment tool added a pin');
  assert.equal(await commentsOpen(page), true, 'adding a pin opens Comments through the existing path');
  await closeComments(page);
  await clickTool(page, TOOL_LABEL.box);
  current = await state(page);
  const pinEdge = { x: pin.x1 + 12, y: pin.y1 };
  await drag(page, pinEdge, { x: pinEdge.x + 40, y: pinEdge.y + 30 });
  after = await state(page);
  assert.deepEqual(coords(find(after, pin.id)), coords(find(current, pin.id)), 'a drawing tool cannot drag a comment pin by its ring');
  assert.equal(after.annotations.length, current.annotations.length + 1, 'that press drew instead');
  selectChecks.pinNotDraggable = true;
  await command(page, { type: 'delete', id: after.annotations.at(-1).id });
  await command(page, { type: 'delete', id: pin.id });
  await command(page, { type: 'delete', id: inner.id });
  await settle(page);
  observations.retainedSelect = selectChecks;
  record('US3 retained Select and Comment behaviour', { detail: 'whole-face move, topmost overlap, badge selection, non-resizable pin' });

  // ---------------------------------------------------------------------
  // US2: the coupled comment recogniser.
  step('US2 gestures: setup');
  await clearAnnotations(page);
  const subject = await draw(page, 'box', { x: 300, y: 220 }, { x: 560, y: 400 });
  await clickTool(page, TOOL_LABEL.circle);
  const gestures = [];

  /**
   * One press, optionally moving away and back before release. Returns the
   * inputs dispatched, the geometry seen in flight, and the elapsed time.
   */
  async function pressGesture({ at, away = null, sample = false }) {
    const home = await clientPoint(page, at);
    let inputs = 0;
    const startedAt = Date.now();
    await rawMove(page, home); inputs += 1;
    await rawDown(page, home); inputs += 1;
    let moved = null;
    if (away) {
      const target = await clientPoint(page, { x: at.x + away.x, y: at.y + away.y });
      for (let step = 1; step <= 3; step += 1) {
        await rawMove(page, { x: home.x + (target.x - home.x) * step / 3, y: home.y + (target.y - home.y) * step / 3 }, 1);
        inputs += 1;
      }
      if (sample) moved = coords(find(await state(page), subject.id));
      for (let step = 2; step >= 0; step -= 1) {
        await rawMove(page, { x: home.x + (target.x - home.x) * step / 3, y: home.y + (target.y - home.y) * step / 3 }, 1);
        inputs += 1;
      }
    }
    await rawUp(page, home); inputs += 1;
    return { inputs, startedAt, elapsed: Date.now() - startedAt, inFlight: moved };
  }

  const borderOf = async () => boundaryPoint(find(await state(page), subject.id));
  /**
   * Start each case outside the existing 500 ms pairing window, so one case's
   * last press can never be read as the first half of the next case's gesture.
   */
  const startCase = async () => {
    await wait(600);
    assert.equal(await commentsOpen(page), false, 'each gesture case starts with Comments closed');
  };

  // 1. A qualifying unmoved pair opens Comments once, in its Comment field.
  step('US2 gesture 1: qualifying pair');
  await startCase();
  let border = await borderOf();
  let before = await state(page);
  let first = await pressGesture({ at: border });
  let second = await pressGesture({ at: border });
  await until(() => commentsOpen(page), 'the qualifying pair to open Comments');
  const focused = await until(async () => {
    const value = await focusedField(page);
    return value?.label?.startsWith('Comment') ? value : null;
  }, 'the Comment field to take focus');
  after = await state(page);
  assert.equal(after.annotations.length, before.annotations.length, 'the qualifying pair adds no annotation');
  assert.equal(after.tool, 'circle', 'the drawing tool stays armed through the comment gesture');
  assert.deepEqual(coords(find(after, subject.id)), coords(find(before, subject.id)), 'the qualifying pair changes no geometry');
  gestures.push({ case: 'qualifying border pair, drawing tool armed', opened: true, focus: focused.label,
    inputs: first.inputs + second.inputs, pressToPressMs: second.startedAt - first.startedAt });
  await closeComments(page);

  // 2. First press out and back, then one timely unmoved press: no Comments.
  step('US2 gesture 2: first press out and back');
  await startCase();
  border = await borderOf();
  before = await state(page);
  first = await pressGesture({ at: border, away: { x: 46, y: 34 }, sample: true });
  second = await pressGesture({ at: border });
  await wait(250);
  after = await state(page);
  assert.equal(await commentsOpen(page), false, 'an out-and-back first press cannot prime a comment');
  assert.notDeepEqual(first.inFlight, coords(find(before, subject.id)), 'the first press really moved the mark in flight');
  assert.deepEqual(coords(find(after, subject.id)), coords(find(before, subject.id)), 'and returned it to its exact start');
  gestures.push({ case: 'first press out and back, then one unmoved press', opened: false, inFlight: first.inFlight,
    start: coords(find(before, subject.id)), end: coords(find(after, subject.id)),
    inputs: first.inputs + second.inputs, pressToPressMs: second.startedAt - first.startedAt });

  // 3. Unmoved press, then an out-and-back second press, then one more press.
  step('US2 gesture 3: moving second press');
  await startCase();
  border = await borderOf();
  before = await state(page);
  first = await pressGesture({ at: border });
  second = await pressGesture({ at: border, away: { x: 40, y: 30 }, sample: true });
  const openedAfterSecond = await commentsOpen(page);
  const third = await pressGesture({ at: border });
  await wait(250);
  after = await state(page);
  assert.equal(openedAfterSecond, false, 'a moving second press does not open Comments');
  assert.equal(await commentsOpen(page), false, 'and it cannot prime the press after it');
  assert.notDeepEqual(second.inFlight, coords(find(before, subject.id)), 'the second press really moved the mark in flight');
  assert.deepEqual(coords(find(after, subject.id)), coords(find(before, subject.id)), 'final geometry is unchanged');
  gestures.push({ case: 'unmoved press, moving second press, then one unmoved press', opened: false, inFlight: second.inFlight,
    inputs: first.inputs + second.inputs + third.inputs,
    pressToPressMs: [second.startedAt - first.startedAt, third.startedAt - second.startedAt] });

  // 4. Two unmoved presses on a handle do not open Comments.
  step('US2 gesture 4: handle pair');
  await startCase();
  const handle = handlePoint(find(await state(page), subject.id), 'se');
  first = await pressGesture({ at: handle });
  second = await pressGesture({ at: handle });
  await wait(250);
  assert.equal(await commentsOpen(page), false, 'a handle pair is a resize affordance, not a comment gesture');
  gestures.push({ case: 'handle pair', opened: false, inputs: first.inputs + second.inputs });

  // 4b. An out-and-back resize records nothing and primes nothing.
  step('US2 gesture 4b: out-and-back resize then one press');
  await startCase();
  before = await state(page);
  const resizeBack = await pressGesture({ at: handle, away: { x: 44, y: 32 }, sample: true });
  second = await pressGesture({ at: await borderOf() });
  await wait(250);
  after = await state(page);
  assert.equal(await commentsOpen(page), false, 'an out-and-back resize cannot prime a comment');
  assert.notDeepEqual(resizeBack.inFlight, coords(find(before, subject.id)), 'the resize really changed geometry in flight');
  assert.deepEqual(coords(find(after, subject.id)), coords(find(before, subject.id)), 'and the mark came back to its exact size');
  assert.equal(after.canUndo, before.canUndo, 'a net-equal resize adds no history step');
  assert.equal(after.canRedo, before.canRedo, 'a net-equal resize keeps any redo opportunity');
  gestures.push({ case: 'out-and-back resize then one press', opened: false, inFlight: resizeBack.inFlight,
    inputs: resizeBack.inputs + second.inputs });

  // 5. Two presses in drawing space do not open Comments.
  step('US2 gesture 5: drawing-space pair');
  await startCase();
  const openSpace = { x: 860, y: 520 };
  before = await state(page);
  first = await pressGesture({ at: openSpace });
  second = await pressGesture({ at: openSpace });
  await wait(250);
  assert.equal(await commentsOpen(page), false, 'drawing-space presses never open Comments');
  after = await state(page);
  assert.equal(after.annotations.length, before.annotations.length, 'presses below the minimum drawing size add nothing');
  gestures.push({ case: 'drawing-space pair', opened: false, inputs: first.inputs + second.inputs });
  await command(page, { type: 'select', id: subject.id });
  await settle(page);

  // 6. A cancelled press leaves no eligible half-gesture.
  step('US2 gesture 6: cancelled press');
  await startCase();
  border = await borderOf();
  before = await state(page);
  let home = await clientPoint(page, border);
  await rawMove(page, home);
  await rawDown(page, home);
  await rawMove(page, { x: home.x + 30, y: home.y + 20 }, 1);
  await key(page, 'Escape', { code: 'Escape' });
  await rawUp(page, { x: home.x + 30, y: home.y + 20 });
  await settle(page);
  await clickTool(page, TOOL_LABEL.circle);
  await command(page, { type: 'select', id: subject.id });
  first = await pressGesture({ at: border });
  await wait(250);
  after = await state(page);
  assert.equal(await commentsOpen(page), false, 'a cancelled press cannot be half of a pair');
  assert.deepEqual(coords(find(after, subject.id)), coords(find(before, subject.id)), 'the cancelled move restored its mark');
  gestures.push({ case: 'cancelled press then one press', opened: false, inputs: first.inputs + 4 });

  // 7. A small but real adjustment is an adjustment, not a click.
  step('US2 gesture 7: two-pixel adjustment');
  await startCase();
  border = await borderOf();
  before = await state(page);
  const small = await pressGesture({ at: border, away: { x: 2, y: 2 }, sample: true });
  second = await pressGesture({ at: border });
  await wait(250);
  after = await state(page);
  assert.equal(await commentsOpen(page), false, 'a 2 px adjustment still disqualifies the pair');
  assert.notDeepEqual(small.inFlight, coords(find(before, subject.id)), 'the small adjustment really changed geometry');
  gestures.push({ case: 'two-pixel adjustment inside the pair tolerance', opened: false, inFlight: small.inFlight,
    inputs: small.inputs + second.inputs });

  // 8. The same correction holds for Select.
  step('US2 gesture 8: Select out and back');
  await startCase();
  await clickTool(page, TOOL_LABEL.select);
  border = await borderOf();
  before = await state(page);
  first = await pressGesture({ at: border, away: { x: 44, y: 32 }, sample: true });
  second = await pressGesture({ at: border });
  await wait(250);
  assert.equal(await commentsOpen(page), false, 'Select gets the same out-and-back correction');
  after = await state(page);
  assert.deepEqual(coords(find(after, subject.id)), coords(find(before, subject.id)), 'Select out-and-back leaves geometry equal');
  gestures.push({ case: 'Select out-and-back then one press', opened: false, inFlight: first.inFlight,
    inputs: first.inputs + second.inputs });

  // 9. And Select still opens a comment on a genuine unmoved pair.
  step('US2 gesture 9: Select unmoved pair');
  await startCase();
  border = await borderOf();
  first = await pressGesture({ at: border });
  second = await pressGesture({ at: border });
  await until(() => commentsOpen(page), 'Select double-press to open Comments');
  gestures.push({ case: 'Select unmoved pair', opened: true, inputs: first.inputs + second.inputs });
  await closeComments(page);
  observations.gestures = gestures;
  record('US2 comment recogniser', {
    detail: `${gestures.length} gesture cases: ${gestures.filter(item => item.opened).length} open Comments, ${gestures.filter(item => !item.opened).length} open nothing`,
  });

  // ---------------------------------------------------------------------
  // History, redo and committed-only saves, observed independently.
  step('US2 history and redo');
  await clickTool(page, TOOL_LABEL.circle);
  const history = {};
  before = await state(page);
  border = await borderOf();
  await drag(page, border, { x: border.x + 30, y: border.y + 22 });
  after = await state(page);
  history.afterRealMove = { canUndo: after.canUndo, canRedo: after.canRedo, geometry: coords(find(after, subject.id)) };
  assert.equal(after.canUndo, true, 'a real adjustment is undoable');
  assert.notDeepEqual(history.afterRealMove.geometry, coords(find(before, subject.id)), 'the real adjustment changed geometry');
  await command(page, { type: 'undo' });
  await settle(page);
  after = await state(page);
  history.afterUndo = { canUndo: after.canUndo, canRedo: after.canRedo, geometry: coords(find(after, subject.id)) };
  assert.equal(after.canRedo, true, 'undo leaves a redo opportunity');
  assert.deepEqual(history.afterUndo.geometry, coords(find(before, subject.id)), 'undo restored the preceding geometry');

  await startCase();
  border = await borderOf();
  const netEqual = await pressGesture({ at: border, away: { x: 38, y: 28 }, sample: true });
  await wait(200);
  after = await state(page);
  history.afterNetEqual = { canUndo: after.canUndo, canRedo: after.canRedo,
    geometry: coords(find(after, subject.id)), inFlight: netEqual.inFlight };
  assert.equal(after.canRedo, true, 'a net-equal adjustment does not clear the redo opportunity');
  assert.deepEqual(history.afterNetEqual.geometry, history.afterUndo.geometry, 'a net-equal adjustment records nothing');
  await command(page, { type: 'redo' });
  await settle(page);
  after = await state(page);
  history.afterRedo = { canUndo: after.canUndo, canRedo: after.canRedo, geometry: coords(find(after, subject.id)) };
  assert.deepEqual(history.afterRedo.geometry, history.afterRealMove.geometry, 'redo restored the adjustment');
  observations.history = history;
  record('US2 history and redo', { detail: 'one step for a changed adjustment, none for a net-equal one, redo preserved' });

  // A working save during a live preview must write the committed geometry.
  step('US2 committed-only save');
  const submissionId = (await state(page)).submissionId;
  const committed = coords(find(await state(page), subject.id));
  border = await borderOf();
  home = await clientPoint(page, border);
  await rawMove(page, home);
  await rawDown(page, home);
  for (let step = 1; step <= 3; step += 1) await rawMove(page, { x: home.x + step * 14, y: home.y + step * 10 }, 1);
  const preview = coords(find(await state(page), subject.id));
  await command(page, { type: 'save' });
  const savedDuringPreview = coords(driver.readWorking(submissionId).state.annotations.find(a => a.id === subject.id));
  await rawUp(page, { x: home.x + 42, y: home.y + 30 });
  await settle(page);
  const settled = coords(find(await state(page), subject.id));
  await command(page, { type: 'save' });
  const savedAfterRelease = await until(() => {
    const value = driver.readWorking(submissionId).state.annotations.find(a => a.id === subject.id);
    return value && coords(value).every((n, index) => n === settled[index]) ? coords(value) : null;
  }, 'the committed adjustment to reach the real working file');
  const saves = { submissionId, committed, preview, savedDuringPreview, settled, savedAfterRelease };
  assert.notDeepEqual(saves.preview, saves.committed, 'the preview really moved the mark');
  assert.deepEqual(saves.savedDuringPreview, saves.committed, 'a save during a preview keeps the last committed geometry');
  observations.saves = saves;
  record('US2 committed-only working save', { detail: 'the real Review adapter wrote committed geometry during a live preview' });

  // ---------------------------------------------------------------------
  // US3: keyboard and Comments alternatives.
  step('US3 keyboard: Enter, caret, numeric');
  const keyboard = {};
  await evaluate(page, `document.querySelector('.dude-review-overlay').focus()`);
  await key(page, 'Enter', { code: 'Enter', text: '\\r' });
  await until(() => commentsOpen(page), 'Enter on the selected annotation to open Comments');
  const enterFocus = await until(async () => {
    const value = await focusedField(page);
    return value?.label?.startsWith('Comment') ? value : null;
  }, 'Enter to focus the Comment field');
  keyboard.enter = { opened: true, focus: enterFocus.label, caret: [enterFocus.start, enterFocus.end] };

  for (const character of 'Border is too tight') {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: character, key: character, unmodifiedText: character });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character });
  }
  await settle(page);
  const typed = await until(async () => {
    const value = find(await state(page), subject.id);
    return value.comment === 'Border is too tight' ? value : null;
  }, 'the typed comment to reach its annotation');
  keyboard.literalComment = typed.comment;

  for (let index = 0; index < 5; index += 1) await key(page, 'ArrowLeft', { code: 'ArrowLeft' });
  const placed = await focusedField(page);
  assert.equal(placed.start, keyboard.literalComment.length - 5, 'the arrow keys really moved the caret inside the text');
  await closeComments(page);
  await evaluate(page, `document.querySelector('.dude-review-overlay').focus()`);
  await key(page, 'Enter', { code: 'Enter', text: '\\r' });
  await until(() => commentsOpen(page), 'Comments to reopen');
  const restored = await until(async () => {
    const value = await focusedField(page);
    return value?.label?.startsWith('Comment') ? value : null;
  }, 'the Comment field to take focus again');
  keyboard.caret = { placed: [placed.start, placed.end], restored: [restored.start, restored.end] };
  assert.deepEqual(keyboard.caret.restored, keyboard.caret.placed, 'the remembered caret came back with the field');

  // Numeric geometry editing, the keyboard alternative to a small handle.
  const numericBefore = coords(find(await state(page), subject.id));
  const fieldAt = await evaluate(page, `(() => {
    const label = [...document.querySelectorAll('label')].find(node => node.textContent.trim() === 'X1');
    const input = label && document.getElementById(label.htmlFor);
    input.scrollIntoView({ block: 'center' });
    const box = input.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  await rawMove(page, fieldAt); await rawDown(page, fieldAt); await rawUp(page, fieldAt);
  await evaluate(page, `document.activeElement.select()`);
  for (const character of String(numericBefore[0] + 24)) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: character, key: character, unmodifiedText: character });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: character });
  }
  await key(page, 'Tab', { code: 'Tab' });
  keyboard.numeric = { before: numericBefore, after: await until(async () => {
    const value = find(await state(page), subject.id);
    return value.x1 === numericBefore[0] + 24 ? coords(value) : null;
  }, 'the numeric edit to move the annotation') };
  await closeComments(page);
  observations.keyboard = keyboard;
  record('US3 keyboard alternatives', { detail: 'Enter opens Comments with focus and caret; typed text and numeric geometry edits apply' });

  // ---------------------------------------------------------------------
  // Rendered evidence: light and dark, desktop and compact.
  const shots = [];
  for (const [label, width, height, theme] of [
    ['desktop-light', 1280, 900, 'light'], ['desktop-dark', 1280, 900, 'dark'],
    ['compact-light', 640, 780, 'light'], ['compact-dark', 640, 780, 'dark'],
  ]) {
    step(`evidence: ${label}`);
    // Each appearance and size gets its own fresh fixture review: reopening a
    // recorded submission under a different theme or panel size is exactly the
    // stale-evidence refusal the product already performs.
    const shotDriver = await startFixtureDriver();
    await setViewport(page, width, height, theme);
    await page.send('Page.navigate', { url: shotDriver.url });
    await until(() => evaluate(page, 'Boolean(window.__designReviewEngine?.getState().ready)'),
      `${label} review to settle`, 40_000);
    // Clear of the parked tool palette, so the evidence shows the whole mark.
    const shape = await draw(page, 'box', { x: 150, y: 190 }, { x: 380, y: 330 });
    await clickTool(page, TOOL_LABEL.circle);
    await move(page, handlePoint(shape, 'se'));
    const handleCursor = await cursor(page);
    await move(page, boundaryPoint(shape));
    const borderCursor = await cursor(page);
    await move(page, { x: shape.x2 + 80, y: shape.y2 + 60 });
    const drawCursor = await cursor(page);
    await move(page, boundaryPoint(shape));
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const file = path.join(DESIGN_ROOT, 'screenshots', `direct-manipulation-${label}-${width}x${height}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const geometry = await evaluate(page, `(() => {
      const frame = document.querySelector('.dude-review-frame').getBoundingClientRect();
      const palette = document.querySelector('[data-review-tools]').getBoundingClientRect();
      const tools = [...document.querySelectorAll('[aria-label="Annotation tools"] [name="tool"]')];
      const overlay = document.querySelector('.dude-review-overlay');
      return {
        frame: { width: Math.round(frame.width), height: Math.round(frame.height) },
        paletteInsideStage: palette.left >= frame.left - 1 && palette.right <= frame.right + 1,
        toolsReachable: tools.length === 7 && tools.every(node => node.getBoundingClientRect().width > 0),
        toolsEnabled: tools.filter(node => !node.disabled).length,
        overlayName: overlay.getAttribute('aria-label'),
        overlayDescription: overlay.getAttribute('aria-description'),
        commentsButton: [...document.querySelectorAll('button')].find(node => /^Comments \\(\\d+\\)$/.test(node.innerText.trim()))?.innerText.trim() ?? null,
      };
    })()`);
    assert.equal(geometry.toolsReachable, true, `all seven tools stay reachable at ${label}`);
    assert.equal(handleCursor.endsWith('resize'), true, `${label} shows a resize cursor on the selected handle`);
    assert.equal(borderCursor, 'move', `${label} shows a move cursor on the selected border`);
    assert.equal(drawCursor, 'crosshair', `${label} keeps the drawing cursor elsewhere`);
    shots.push({ label, width, height, theme, file: path.relative(DESIGN_ROOT, file),
      cursors: { handle: handleCursor, border: borderCursor, drawing: drawCursor }, geometry });
    screenshots.push(file);
    await shotDriver.close();
  }
  observations.screenshots = shots;
  record('rendered evidence', { detail: `${shots.length} screenshots with matching cursors, frame geometry and accessible names` });

  // Accessibility observations from the real tree, at the last size.
  const tree = await page.send('Accessibility.getFullAXTree', { max_depth: -1 });
  const named = ['Review viewport', 'Annotation tools', 'Review workspace', 'Annotations',
    'Reviewed HTML document. Use drawing tools or Choose an element to annotate.'];
  // Reach the drawing surface the way a keyboard reviewer does, so the focus
  // ring is the browser's own :focus-visible answer rather than a scripted one.
  await evaluate(page, `(() => { document.querySelector('[data-review-return]').focus(); return true; })()`);
  let tabs = 0;
  const reached = await until(async () => {
    if (await evaluate(page, `document.activeElement === document.querySelector('.dude-review-overlay')`)) return true;
    await key(page, 'Tab', { code: 'Tab' });
    tabs += 1;
    return false;
  }, 'keyboard focus to reach the reviewed overlay').then(() => true, () => false);
  const focusRing = await evaluate(page, `(() => {
    const overlay = document.querySelector('.dude-review-overlay');
    const style = getComputedStyle(overlay);
    return { visible: overlay.matches(':focus-visible'), outlineWidth: style.outlineWidth, outlineColor: style.outlineColor };
  })()`);
  observations.accessibility = {
    namedRegions: tree.nodes.filter(node => named.includes(node.name?.value))
      .map(node => ({ role: node.role?.value, name: node.name?.value })),
    keyboardTabsToOverlay: tabs, reachedByKeyboard: reached, focusRing,
  };
  assert.equal(reached, true, 'the reviewed overlay is reachable by keyboard from the Back control');
  assert.equal(focusRing.visible, true, 'the reviewed overlay still shows a visible keyboard focus ring');
  record('accessibility observations', { detail: `named review regions retained; overlay reached in ${tabs} Tab presses with a visible focus ring` });
}

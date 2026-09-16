// @ts-check
// Focused regression for feature 059, code review finding R1. The transient
// action cursor must not outlive the editable state that justified it: when the
// host reports the request as no longer current, a pointer already resting on a
// selected handle or border has to fall back to the armed tool's own cursor
// instead of promising a resize or move the next press would refuse.
//
// It drives the real design host with native pointer input over CDP, then loses
// editing under the resting pointer through each existing entry point that drops
// it in place: the engine's own public `update` boundary -- the same call
// `ReviewWorkspace` makes with `unavailable: !current` -- and the real provider's
// own refusal reaching `reportError`. Neither moves the pointer, so the observed
// cursor is the stationary-pointer case in the finding.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureDriver } from './fixture-driver.mjs';
import {
  until, startBrowser, stopBrowser, evaluate, setViewport, move, drag, settle, state,
  cursor, action, clickTool, handlePoint, boundaryPoint, sha256, step,
  TOOL_LABEL, DESIGN_ROOT, REPOSITORY_ROOT,
} from './proof-harness.mjs';

/** A fresh fixture workspace, host document and engine mount. */
async function openFresh(page) {
  const driver = await startFixtureDriver();
  await setViewport(page, 1280, 900, 'light');
  await page.send('Page.navigate', { url: driver.url });
  await until(() => evaluate(page, `location.origin === ${JSON.stringify(driver.origin)}
    && Boolean(window.__designReviewEngine?.getState().ready)`),
  'the design host to mount the real engine and settle its fixture view', 40_000);
  return driver;
}

// One hovered case per mount, because becoming unavailable is one-way for the
// mount it happened to, exactly as it is for a request that stopped being current.
//
// `through` names which existing entry point drops editing: `update` is the host
// boundary the finding named, and `refusal` is the provider's own answer, which
// arrives at `reportError` with no host update behind it.
const CASES = [
  { name: 'drawing tool armed over a selected handle', tool: 'box', at: 'handle',
    hoverAction: 'nwse-resize', toolCursor: 'crosshair', through: 'update' },
  { name: 'Select over a selected border', tool: 'select', at: 'border',
    hoverAction: 'move', toolCursor: 'default', through: 'update' },
  { name: 'drawing tool armed over a selected handle, refused by the provider',
    tool: 'box', at: 'handle', hoverAction: 'nwse-resize', toolCursor: 'crosshair',
    through: 'refusal', errorCode: 'provider_unavailable' },
];
const REFUSED_NOTE = 'Working note kept while the provider stops answering.';

async function runCase(page, plan) {
  const driver = await openFresh(page);
  try {
    step(`R1 regression: ${plan.name}`);
    // Which bytes actually answered this mount, while its origin is still up.
    const loadedEngine = await evaluate(page, `(async () => {
      const text = await (await fetch('/review/engine.mjs')).text();
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    })()`);
    await clickTool(page, TOOL_LABEL.box);
    await drag(page, { x: 120, y: 140 }, { x: 320, y: 280 });
    const drawn = await until(async () => {
      const value = await state(page);
      return value.annotations.length === 1 && !value.busy ? value : null;
    }, 'the fixture box to be added by native drawing');
    const id = drawn.selectedId;
    assert.equal(drawn.annotations[0].id, id, 'the drawn box is the selected one');

    // Arm the tool under test. A drawing tool stays armed over its own
    // selection; Select is the other routing side of the same classification.
    await clickTool(page, TOOL_LABEL[plan.tool]);
    const armed = await state(page);
    assert.equal(armed.tool, plan.tool, 'the armed tool is the one that was clicked');
    assert.equal(armed.selectedId, id, 'arming a tool does not change the selection');
    assert.equal(armed.editable, true, 'the engine is editable before the availability update');

    const mark = armed.annotations.find(a => a.id === id);
    const at = plan.at === 'handle' ? handlePoint(mark, 'se') : boundaryPoint(mark);
    await move(page, at);
    await settle(page);
    const hovered = { action: await action(page), cursor: await cursor(page) };
    assert.equal(hovered.action, plan.hoverAction, `hovering paints the ${plan.hoverAction} action`);
    assert.equal(hovered.cursor, plan.hoverAction, `the computed cursor is ${plan.hoverAction}`);

    // How this mount loses editing, under that same resting pointer. The
    // provider's own refusal is delivered out of band, exactly as a session that
    // ends while a reviewer holds still: no browser event and no feed reread, so
    // nothing tells the workspace this request stopped being current and no
    // `update({ unavailable })` follows it. The notes command is the one the
    // notes field itself issues; it leaves one unsaved change, so the engine's
    // existing debounced save asks the real provider and is refused.
    if (plan.through === 'refusal') {
      driver.provider.onEvent({ type: 'session.shutdown' });
      await evaluate(page, `window.__designReviewEngine.command({ type: 'notes', text: ${JSON.stringify(REFUSED_NOTE)} })`);
      const editing = { action: await action(page), cursor: await cursor(page) };
      assert.equal(editing.action, plan.hoverAction, 'the action cursor still answers while editing is still allowed');
    }

    // Control against a remount: this is the same overlay node afterwards, so a
    // cleared cursor is the engine clearing its own action, not fresh DOM.
    await evaluate(page, `document.querySelector('.dude-review-overlay').dataset.r1Probe = 'hovered'`);
    const before = await state(page);
    assert.equal(before.editable, true, 'editing is still allowed on the brink of the loss');
    if (plan.through === 'refusal') assert.equal(before.dirty, true, 'the refused save has an unsaved change to carry');

    if (plan.through === 'update') {
      // The public boundary, with the pointer left exactly where it is. No
      // pointer event, no fake callback, and no changed identity field -- a
      // changed handle, revision or preview would invalidate the view first and
      // repaint for that other reason.
      await evaluate(page, `window.__designReviewEngine.update({ unavailable: true })`);
    } else {
      await until(async () => (await state(page)).status === 'unavailable',
        "the engine's own debounced save to be refused by the provider", 10_000);
    }
    await settle(page);

    const blocked = { action: await action(page), cursor: await cursor(page) };
    const after = await state(page);
    const sameOverlay = await evaluate(page,
      `document.querySelector('.dude-review-overlay').dataset.r1Probe === 'hovered'`);
    assert.equal(sameOverlay, true, 'the hovered overlay node survived the loss');
    assert.equal(after.stale, false, 'the loss reported unavailable, not a stale source');
    assert.equal(after.editable, false, 'the loss blocked editing');
    assert.equal(after.status, 'unavailable', 'the engine reports the unavailable status');
    // Which entry point actually answered: only `reportError` reports an error
    // code, so this names the branch under test rather than assuming it.
    assert.equal(after.error?.code ?? null, plan.errorCode ?? null,
      plan.errorCode ? 'the provider refusal reached reportError' : 'no error was invented');
    assert.equal(blocked.action, null, 'no action cursor outlives the editable state');
    assert.equal(blocked.cursor, plan.toolCursor,
      `the stationary pointer falls back to the ${plan.tool} cursor`);

    // The original refusal is unchanged, through both the command surface and a
    // real press on the same point that was promising a resize or move.
    const refusal = await evaluate(page, `(async () => {
      try {
        await window.__designReviewEngine.command({ type: 'edit', id: ${JSON.stringify(id)},
          changes: { x1: 10, y1: 12, x2: 180, y2: 150 } });
        return { refused: false, code: null };
      } catch (error) { return { refused: true, code: error.code ?? null, message: error.message }; }
    })()`);
    assert.equal(refusal.refused, true, 'an edit command is still refused');
    assert.equal(refusal.code, 'review_historical', 'the existing unavailable refusal answers');
    await drag(page, at, { x: at.x + 30, y: at.y + 22 });
    const pressed = await state(page);
    const afterPress = { action: await action(page), cursor: await cursor(page) };
    assert.deepEqual(pressed.annotations, before.annotations, 'a press on the same point changes nothing');
    assert.equal(afterPress.action, null, 'moving the pointer does not restore the action cursor');

    // Nothing else moved across the transition.
    assert.deepEqual(after.annotations, before.annotations, 'annotation geometry is unchanged');
    assert.equal(after.selectedId, before.selectedId, 'the selection is unchanged');
    assert.equal(after.tool, before.tool, 'the armed tool is unchanged');
    assert.deepEqual(after.notes, before.notes, 'the notes are unchanged');
    assert.equal(after.dirty, before.dirty, 'no save state was invented');

    return {
      tool: plan.tool, point: plan.at, through: plan.through, loadedEngine, hovered, blocked, afterPress, sameOverlay,
      refusal: { code: refusal.code, message: refusal.message },
      reportedError: after.error ?? null,
      annotation: { before: before.annotations[0], after: pressed.annotations[0] },
      engineState: {
        before: { editable: before.editable, status: before.status, stale: before.stale,
          canUndo: before.canUndo, selectedId: before.selectedId, tool: before.tool },
        after: { editable: after.editable, status: after.status, stale: after.stale,
          canUndo: after.canUndo, selectedId: after.selectedId, tool: after.tool },
      },
    };
  } finally {
    await driver.close();
  }
}

async function main() {
  const started = new Date();
  const results = { task: 'T001@59a10f01 code review finding R1', startedAt: started.toISOString(),
    command: 'node .dude/specs/059-annotation-direct-manipulation/design/prototype/proof-unavailable-cursor.mjs',
    checks: [], counts: { planned: CASES.length, executed: 0, passed: 0, failed: 0 }, observations: {} };
  const browserState = await startBrowser();
  const { page } = browserState;
  try {
    results.observations.browser = browserState.info?.Browser ?? null;
    for (const plan of CASES) {
      results.counts.executed += 1;
      try {
        const detail = await runCase(page, plan);
        results.checks.push({ name: plan.name, status: 'passed', detail });
        results.counts.passed += 1;
        process.stdout.write(`PASS ${plan.name}: hovered ${detail.hovered.cursor}, unavailable ${detail.blocked.cursor}\n`);
      } catch (error) {
        results.checks.push({ name: plan.name, status: 'failed',
          error: { message: error?.message, stack: error?.stack } });
        results.counts.failed += 1;
        process.stdout.write(`FAIL ${plan.name}: ${error?.message}\n`);
      }
    }
    // Which bytes answered, so this report names one exact revision.
    results.observations.engineRevision = {
      loaded: [...new Set(results.checks.map(check => check.detail?.loadedEngine).filter(Boolean))],
      designCopy: sha256(fs.readFileSync(path.join(DESIGN_ROOT, 'prototype', 'review', 'engine.mjs'))),
      currentSource: sha256(fs.readFileSync(path.join(REPOSITORY_ROOT, 'src', 'extensions', 'dude', 'ui', 'review', 'engine.mjs'))),
    };
  } finally {
    await stopBrowser(browserState.browser, browserState.profile, page);
  }
  results.finishedAt = new Date().toISOString();
  results.outcome = results.counts.failed === 0 ? 'passed' : 'failed';
  return results;
}

export { main };

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const results = await main();
  const stamp = results.startedAt.replace(/[:.]/g, '-');
  const file = path.join(DESIGN_ROOT, 'evidence', `regression-unavailable-cursor-${stamp}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${results.outcome}: ${results.counts.passed} passed, ${results.counts.failed} failed; `
    + `evidence: ${path.relative(REPOSITORY_ROOT, file)}\n`);
  process.exitCode = results.counts.failed === 0 ? 0 : 1;
}

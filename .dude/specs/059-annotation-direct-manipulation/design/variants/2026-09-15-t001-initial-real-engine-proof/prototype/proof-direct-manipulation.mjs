// @ts-check
// Focused design proof for feature 059. It drives the real design host with
// native pointer and keyboard input over CDP, exactly as the existing Canvas
// browser suites do, and records what it actually observed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureDriver } from './fixture-driver.mjs';
import { runRemainingProof } from './proof-gestures.mjs';
import {
  until, startBrowser, stopBrowser, evaluate, setViewport, clientPoint, move, drag, settle,
  state, cursor, action, clickTool, handlePoint, boundaryPoint, interiorPoint, segment, shapeStroke,
  sha256, step, TOOL_LABEL, SHAPES, DESIGN_ROOT, REPOSITORY_ROOT,
} from './proof-harness.mjs';

async function main() {
  const started = new Date();
  const results = { startedAt: started.toISOString(), checks: [], counts: { passed: 0, failed: 0 }, observations: {} };
  const record = (name, detail) => { results.checks.push({ name, ...detail }); results.counts.passed += 1; };
  const driver = await startFixtureDriver();
  const browserState = await startBrowser();
  const { page } = browserState;
  const screenshots = [];
  try {
    results.observations.browser = browserState.info?.Browser ?? null;
    await setViewport(page, 1280, 900, 'light');
    await page.send('Page.navigate', { url: driver.url });
    await until(() => evaluate(page, 'Boolean(window.__designReviewEngine?.getState().ready)'),
      'the design host to mount the real engine and settle its fixture view', 40_000);

    // --- Loaded-code identity -------------------------------------------------
    const served = await evaluate(page, `(async () => {
      const names = ['engine.mjs','geometry.mjs','shapes.mjs','inspector.mjs','panel.mjs','capture.mjs','bridge.mjs','styles.css','NOTICE.txt'];
      const digest = async text => {
        const bytes = new TextEncoder().encode(text);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
      };
      const out = {};
      for (const name of names) out[name] = await digest(await (await fetch('/review/' + name)).text());
      out['design/host.js'] = await digest(await (await fetch('/design/host.js')).text());
      out['document'] = await digest(await (await fetch('/')).text());
      return out;
    })()`);
    const localHash = relative => sha256(fs.readFileSync(path.join(DESIGN_ROOT, relative)));
    const sourceHash = relative => sha256(fs.readFileSync(path.join(REPOSITORY_ROOT, relative)));
    const identity = {};
    for (const name of ['engine.mjs', 'geometry.mjs', 'shapes.mjs', 'inspector.mjs', 'panel.mjs', 'capture.mjs', 'bridge.mjs', 'styles.css', 'NOTICE.txt']) {
      const design = localHash(path.join('prototype', 'review', name));
      const source = sourceHash(path.join('src', 'extensions', 'dude', 'ui', 'review', name));
      assert.equal(served[name], design, `the browser loaded the design copy of ${name}`);
      identity[name] = { loaded: served[name], designCopy: design, currentSource: source, differsFromSource: design !== source };
    }
    identity['design/host.js'] = { loaded: served['design/host.js'], designCopy: localHash(path.join('prototype', 'assets', 'host.js')) };
    identity['review-direct-manipulation.html'] = { loaded: served.document, designCopy: localHash('review-direct-manipulation.html') };
    assert.equal(served['design/host.js'], identity['design/host.js'].designCopy, 'the browser loaded the design bundle');
    assert.equal(served.document, identity['review-direct-manipulation.html'].designCopy, 'the browser loaded the canonical design HTML');
    results.observations.assets = identity;
    record('loaded code identity', { detail: 'nine review modules, bundle and canonical HTML match their design bytes' });

    const mounted = await evaluate(page, `(() => {
      const engine = window.__designReviewEngine;
      return { hasCommand: typeof engine.command === 'function', hasUpdate: typeof engine.update === 'function',
        workspace: Boolean(document.querySelector('[data-review-workspace]')),
        host: Boolean(document.querySelector('[data-review-engine-host] .dude-review-engine')),
        tools: [...document.querySelectorAll('[aria-label="Annotation tools"] [name="tool"]')].map(node => node.getAttribute('aria-label')),
        frame: Boolean(document.querySelector('.dude-review-frame iframe[sandbox="allow-scripts"]')) };
    })()`);
    assert.equal(mounted.workspace && mounted.host && mounted.frame, true, 'the actual ReviewWorkspace mounted the actual engine');
    assert.deepEqual(mounted.tools, ['Select (V)', 'Comment (C)', 'Box (B)', 'Circle (O)', 'Arrow (A)', 'Line (L)', 'Highlight (H)'],
      'the existing seven-tool palette is intact');
    results.observations.mounted = mounted;
    record('real component surface', { detail: 'ReviewWorkspace, seven tools, sandboxed reviewed child' });

    const view = (await state(page)).view.viewport;
    results.observations.viewport = view;

    // ---------------------------------------------------------------------
    // US1: routing matrix, five armed tools against five selected shapes.
    const matrix = [];
    let origin = { x: 80, y: 120 };
    for (const shape of SHAPES) {
      await clickTool(page, TOOL_LABEL[shape]);
      const stroke = shapeStroke(shape, origin);
      const before = (await state(page)).annotations.length;
      await drag(page, stroke.from, stroke.to);
      const created = await until(async () => {
        const value = await state(page);
        return value.annotations.length === before + 1 ? value : null;
      }, `${shape} to be added by native drawing`);
      const id = created.selectedId;
      assert.equal(created.annotations.at(-1).id, id, 'the new mark is the selected one');

      for (const armed of SHAPES) {
        step(`US1 matrix: ${armed} armed on a selected ${shape}`);
        await clickTool(page, TOOL_LABEL[armed]);
        const cell = { selected: shape, armed };
        let current = await state(page);
        assert.equal(current.tool, armed, 'the armed tool is the one that was clicked');
        assert.equal(current.selectedId, id, 'arming a tool does not change the selection');
        let mark = current.annotations.find(a => a.id === id);
        const home = { x1: mark.x1, y1: mark.y1, x2: mark.x2, y2: mark.y2 };

        // Handle: hover cue, then a real resize.
        const handleName = segment(mark) ? 'p2' : 'se';
        const handleAt = handlePoint(mark, handleName);
        await move(page, handleAt);
        cell.handleCursor = await cursor(page);
        cell.handleAction = await action(page);
        const count = current.annotations.length;
        await drag(page, handleAt, { x: handleAt.x + 24, y: handleAt.y + 18 });
        let after = await state(page);
        const resized = after.annotations.find(a => a.id === id);
        cell.resized = { from: [mark.x1, mark.y1, mark.x2, mark.y2], to: [resized.x1, resized.y1, resized.x2, resized.y2] };
        assert.equal(after.annotations.length, count, `${armed} on a ${shape} handle adds no annotation`);
        assert.equal(after.tool, armed, 'the drawing tool stays armed through a resize');
        assert.equal(after.selectedId, id, 'the resized mark stays selected');
        assert.notDeepEqual(cell.resized.from, cell.resized.to, `${armed} resizes the selected ${shape} by its handle`);
        assert.match(cell.handleCursor, /resize$/, 'the handle cursor is a resize cursor');

        // Boundary: hover cue, then a real move that preserves dimensions.
        mark = resized;
        const edge = boundaryPoint(mark);
        await move(page, edge);
        cell.borderCursor = await cursor(page);
        await drag(page, edge, { x: edge.x + 20, y: edge.y + 14 });
        after = await state(page);
        const moved = after.annotations.find(a => a.id === id);
        cell.moved = { from: [mark.x1, mark.y1, mark.x2, mark.y2], to: [moved.x1, moved.y1, moved.x2, moved.y2] };
        assert.equal(after.annotations.length, count, `${armed} on a selected ${shape} border adds no annotation`);
        assert.equal(movedWithoutResize(mark, moved), true, `${armed} moves the whole selected ${shape} without resizing it`);
        assert.equal(cell.borderCursor, 'move', 'the selected border cursor is move');

        // Interior/away: hover cue, then a real new drawing.
        const inside = interiorPoint(moved);
        await move(page, inside);
        cell.interiorCursor = await cursor(page);
        await drag(page, inside, { x: inside.x + 34, y: inside.y + 26 });
        after = await state(page);
        cell.drawnInside = after.annotations.length === count + 1 && after.annotations.at(-1).tool === armed;
        assert.equal(cell.drawnInside, true, `${armed} still draws inside a selected ${shape} away from its border`);
        assert.equal(cell.interiorCursor, 'crosshair', 'drawing space keeps the crosshair cursor');
        const kept = after.annotations.find(a => a.id === id);
        assert.deepEqual([kept.x1, kept.y1, kept.x2, kept.y2], cell.moved.to, 'drawing inside leaves the original mark unchanged');
        await evaluate(page, `window.__designReviewEngine.command({ type: 'delete', id: ${JSON.stringify(after.selectedId)} })`);
        // Restore this cell's starting geometry through the existing numeric
        // edit command, so each armed tool is tested from the same mark rather
        // than one that drifted across the viewport.
        await evaluate(page, `window.__designReviewEngine.command({ type: 'edit', id: ${JSON.stringify(id)}, changes: ${JSON.stringify(home)} })`);
        await evaluate(page, `window.__designReviewEngine.command({ type: 'select', id: ${JSON.stringify(id)} })`);
        await settle(page);
        matrix.push(cell);
      }
      // Keep the canvas clear for the next shape type.
      await evaluate(page, `window.__designReviewEngine.command({ type: 'delete', id: ${JSON.stringify(id)} })`);
      await settle(page);
      origin = { x: origin.x + 30, y: origin.y + 20 };
    }
    results.observations.routingMatrix = matrix;
    record('US1 routing matrix', { detail: `${matrix.length} armed-tool/selected-shape cells: handle resize, border move, interior draw, matching cursors` });
    results.counts.matrixCells = matrix.length;
    await runRemainingProof({ page, driver, results, record, screenshots });
  } finally {
    await stopBrowser(browserState.browser, browserState.profile, page);
    await driver.close();
  }
  return results;
}

/** Dimensions unchanged and both ends shifted by the same delta. */
function movedWithoutResize(before, after) {
  const dx = after.x1 - before.x1, dy = after.y1 - before.y1;
  return Math.abs(after.x2 - before.x2 - dx) < 0.01 && Math.abs(after.y2 - before.y2 - dy) < 0.01
    && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5);
}

export { main };

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const results = await main();
  const stamp = results.startedAt.replace(/[:.]/g, '-');
  const file = path.join(DESIGN_ROOT, 'evidence', `proof-${stamp}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`${results.checks.map(check => `PASS ${check.name}: ${check.detail}`).join('\n')}\n`);
  process.stdout.write(`checks passed: ${results.counts.passed}; evidence: ${path.relative(REPOSITORY_ROOT, file)}\n`);
}

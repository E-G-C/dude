// Shared harness for the 067 pre-approval verification (temporary, test-only).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as P from './probes.mjs';
import { blend, clickPoint, clickSelector, contrastRatio, decodePng, evalFn, modeColor, pixelAt, pressKey, screenshot, sleep, typeText, until } from './cdp.mjs';

export const THEMES = [
  { id: 'light', q: 'tone=light', scheme: 'light' },
  { id: 'dark', q: 'tone=dark', scheme: 'dark' },
  { id: 'app-light', q: 'tone=light&appearance=app', scheme: 'light' },
  { id: 'app-dark', q: 'tone=dark&appearance=app', scheme: 'dark' },
];
export const VP = {
  w1440: { id: '1440x900', w: 1440, h: 900, dpr: 1 },
  w1280: { id: '1280x900', w: 1280, h: 900, dpr: 1 },
  w1080: { id: '1080x900', w: 1080, h: 900, dpr: 1 },
  w1079: { id: '1079x900', w: 1079, h: 900, dpr: 1 },
  w768: { id: '768x900', w: 768, h: 900, dpr: 1 },
  w600: { id: '600x900', w: 600, h: 900, dpr: 1 },
  z200: { id: '720x450@2 (200% emulated)', w: 720, h: 450, dpr: 2 },
};

export function makeCheckRegistry() {
  const checks = [];
  let assertions = 0;
  const create = (id, group, title, options = {}) => {
    const entry = { id, group, title, assertions: 0, failures: [], notes: [], evidence: [], observation: Boolean(options.observation) };
    const api = {
      ok(condition, message) {
        entry.assertions += 1; assertions += 1;
        if (!condition) entry.failures.push(message);
        return Boolean(condition);
      },
      eq(actual, expected, message) {
        entry.assertions += 1; assertions += 1;
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        if (!pass) entry.failures.push(`${message}: expected ${JSON.stringify(expected)}; observed ${JSON.stringify(actual)}`);
        return pass;
      },
      matches(text, pattern, message) {
        entry.assertions += 1; assertions += 1;
        const pass = pattern.test(text ?? '');
        if (!pass) entry.failures.push(`${message}: pattern ${pattern} not found in ${JSON.stringify((text ?? '').slice(0, 200))}`);
        return pass;
      },
      absent(text, pattern, message) {
        entry.assertions += 1; assertions += 1;
        const hit = (text ?? '').match(pattern);
        if (hit) entry.failures.push(`${message}: found ${JSON.stringify(hit[0])} in ${JSON.stringify((text ?? '').slice(Math.max(0, hit.index - 40), hit.index + 80))}`);
        return !hit;
      },
      note(text) { entry.notes.push(text); },
      shot(name) { entry.evidence.push(name); },
      info(text) { entry.notes.push(text); },
      fail(message) { entry.assertions += 1; assertions += 1; entry.failures.push(message); },
      done() { entry.status = entry.failures.length ? (entry.observation ? 'observation' : 'fail') : 'pass'; checks.push(entry); return entry; },
    };
    return api;
  };
  return { checks, create, get assertions() { return assertions; } };
}

export function makeEnv({ repo, packageDir, outDir, shotsDir, page, registry, oracle, data }) {
  const designDir = path.join(packageDir, 'design');
  const htmlPath = path.join(designDir, 'work-type-presentation.html');
  const baseUrl = pathToFileURL(htmlPath).href;
  const savedShots = [];
  const frames = [];
  const env = {
    repo, packageDir, designDir, htmlPath, baseUrl, page, registry, oracle, data, frames, savedShots, outDir, shotsDir, stats: {},
    ev: (fn, ...args) => evalFn(page, fn, ...args),
    check: registry.create,
    url: query => `${baseUrl}?${query}`,
    async open(query, vp, scheme = 'light') {
      const { state } = page;
      await evalFn(page, P.mark).catch(() => {});
      for (const key of ['console', 'exceptions', 'logs', 'requests', 'sockets']) state[key].length = 0;
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr ?? 1, mobile: false });
      await page.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await page.send('Page.navigate', { url: env.url(query) });
      await until(() => evalFn(page, P.probeReady), `render ${query}`, 20000);
      await evalFn(page, P.settle);
      return state;
    },
    problems() {
      const { state } = page;
      return [...state.console, ...state.exceptions, ...state.logs];
    },
    async saveShot(name, buffer = null) {
      fs.mkdirSync(shotsDir, { recursive: true });
      const data = buffer ?? await screenshot(page);
      const file = path.join(shotsDir, `${name}.png`);
      fs.writeFileSync(file, data);
      savedShots.push(path.relative(packageDir, file).split(path.sep).join('/'));
      return file;
    },
    async text(selector) {
      return evalFn(page, selector => (document.querySelector(selector)?.innerText ?? null), selector);
    },
    async waitFor(probe, description, timeout = 8000, ...args) {
      return until(() => evalFn(page, probe, ...args), description, timeout, 40);
    },
  };
  return env;
}

/* ------------------------------------------------------------------ pixel measurements */

const LARGE_PX = 24, LARGE_BOLD_PX = 18.66;
const requiredRatio = sample => (sample.fs >= LARGE_PX || (sample.fs >= LARGE_BOLD_PX && sample.fw >= 700) ? 3 : 4.5);

/** Text contrast: computed text color over the background actually rendered behind it (text hidden, then sampled from pixels). */
export async function measureContrast(env, { keepShot = false } = {}) {
  const { page } = env;
  const dpr = await evalFn(page, () => devicePixelRatio);
  const samples = await evalFn(page, P.probeTextSamples);
  const controlsProbe = await evalFn(page, P.probeControls);
  const controls = controlsProbe.controls;
  const normalPng = await screenshot(page);
  const normal = decodePng(normalPng);
  await evalFn(page, P.hideText);
  await sleep(40);
  const hidden = decodePng(await screenshot(page));
  await evalFn(page, P.showText);
  const text = [];
  for (const sample of samples) {
    const [x, y, w, h] = sample.rect;
    const bg = modeColor(hidden, x * dpr, y * dpr, (x + w) * dpr, (y + h) * dpr);
    if (!bg) continue;
    const alpha = sample.fg[3] * sample.op;
    const fg = blend(sample.fg.slice(0, 3), alpha, bg);
    const ratio = contrastRatio(fg, bg);
    const computed = contrastRatio(blend(sample.fg.slice(0, 3), alpha, sample.bgc), sample.bgc);
    text.push({ t: sample.t, ratio, computed, required: requiredRatio(sample), region: sample.region, disabled: sample.disabled, fs: sample.fs, fw: sample.fw,
      fg: fg.map(Math.round), bg: bg.map(Math.round), kind: sample.kind });
  }
  const boundaries = [];
  for (const control of controls) {
    const [x, y, w, h] = control.rect;
    const [bt, br, bb, bl] = control.border;
    const mx = x + w / 2, my = y + h / 2;
    const edges = [
      { edge: 'top', inside: [mx, y + Math.max(bt, 1) / 2], outside: [mx, y - 2], axis: 'y', width: bt },
      { edge: 'bottom', inside: [mx, y + h - Math.max(bb, 1) / 2], outside: [mx, y + h + 2], axis: 'y', width: bb },
      { edge: 'left', inside: [x + Math.max(bl, 1) / 2, my], outside: [x - 2, my], axis: 'x', width: bl },
      { edge: 'right', inside: [x + w - Math.max(br, 1) / 2, my], outside: [x + w + 2, my], axis: 'x', width: br },
    ];
    let best = 0, worst = Infinity;
    for (const edge of edges) {
      const out = pixelAt(normal, edge.outside[0] * dpr, edge.outside[1] * dpr);
      let top = 0;
      for (const delta of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) {
        const px = edge.axis === 'y' ? edge.inside[0] * dpr : (edge.inside[0] + delta) * dpr;
        const py = edge.axis === 'y' ? (edge.inside[1] + delta) * dpr : edge.inside[1] * dpr;
        top = Math.max(top, contrastRatio(pixelAt(normal, px, py), out));
      }
      best = Math.max(best, top); worst = Math.min(worst, top);
    }
    boundaries.push({ kind: control.kind, name: control.name, disabled: control.disabled, best, worst });
  }
  return { text, boundaries, dpr, normalPng: keepShot ? normalPng : null, samples: samples.length, skippedControls: controlsProbe.skipped };
}

/** Measures the first screen, then scrolls the largest scrolling region in steps so content below the fold is measured too. */
export async function measureScrolled(env, { keepShot = false, maxPasses = 8 } = {}) {
  const { page } = env;
  const info = await evalFn(page, P.scrollerInfo);
  const merged = await measureContrast(env, { keepShot });
  merged.passes = 1;
  if (!info) return merged;
  const step = Math.max(60, info.clientHeight - 60);
  let position = 0;
  while (merged.passes < maxPasses && position + info.clientHeight < info.scrollHeight - 2) {
    position += step;
    const actual = await evalFn(page, P.scrollTo, position);
    await sleep(120);
    const next = await measureContrast(env, {});
    merged.text.push(...next.text); merged.boundaries.push(...next.boundaries); merged.samples += next.samples;
    merged.skippedControls += next.skippedControls; merged.passes += 1;
    if (actual === null || actual < position) break;
  }
  await evalFn(page, P.scrollTo, 0);
  merged.scroller = { scrollHeight: info.scrollHeight, clientHeight: info.clientHeight };
  return merged;
}

export function summarizeContrast(measure) {
  const product = measure.text.filter(entry => (entry.region === 'product' || entry.region === 'popup') && !entry.disabled);
  const strip = measure.text.filter(entry => entry.region === 'strip' && !entry.disabled);
  const disabled = measure.text.filter(entry => entry.disabled);
  const fails = product.filter(entry => entry.ratio + 0.001 < entry.required);
  const stripFails = strip.filter(entry => entry.ratio + 0.001 < entry.required);
  const min = list => (list.length ? Math.min(...list.map(entry => entry.ratio)) : null);
  const minEntry = list => list.reduce((lowest, entry) => (!lowest || entry.ratio < lowest.ratio ? entry : lowest), null);
  const fields = measure.boundaries.filter(entry => ['field', 'dropdown'].includes(entry.kind) && !entry.disabled);
  const fieldFails = fields.filter(entry => entry.best < 3);
  const disagree = product.filter(entry => Math.abs(entry.ratio - entry.computed) > 1).length;
  return {
    textSamples: product.length, textMin: min(product), textMinEntry: minEntry(product), textFails: fails.slice(0, 8), textFailCount: fails.length,
    stripSamples: strip.length, stripMin: min(strip), stripFailCount: stripFails.length, stripFails: stripFails.slice(0, 4),
    disabledSamples: disabled.length, disabledMin: min(disabled), pixelVsComputedDisagree: disagree,
    fieldBoundaries: fields.length, fieldMin: fields.length ? Math.min(...fields.map(entry => entry.best)) : null, fieldFails,
    buttonBoundaries: measure.boundaries.filter(entry => entry.kind === 'button').length,
    buttonBoundaryMin: (() => { const list = measure.boundaries.filter(entry => entry.kind === 'button' && !entry.disabled && entry.best > 1.05); return list.length ? Math.min(...list.map(entry => entry.best)) : null; })(),
  };
}

/* ------------------------------------------------------------------ keyboard focus */

async function activeAxName(page) {
  const { result } = await page.send('Runtime.evaluate', { expression: 'document.activeElement' });
  if (!result?.objectId) return null;
  const { node } = await page.send('DOM.describeNode', { objectId: result.objectId });
  const { nodes } = await page.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
  const ax = nodes?.find(entry => entry.backendDOMNodeId === node.backendNodeId) ?? nodes?.[0];
  return ax ? { name: String(ax.name?.value ?? '').trim(), role: ax.role?.value ?? '' } : null;
}

/** Presses Tab up to `stops` times; each stop is compared with a no-focus baseline to find the painted focus indicator. */
export async function tabWalk(env, stops, { focusFirst = null } = {}) {
  const { page } = env;
  const dpr = await evalFn(page, () => devicePixelRatio);
  await evalFn(page, () => { document.activeElement?.blur?.(); window.scrollTo(0, 0); return true; });
  await sleep(80);
  await screenshot(page); // the first frame after a state change can use a different text antialiasing mode; use the second
  await sleep(150);
  const baseline = decodePng(await screenshot(page));
  const result = [];
  const compare = (base, shot, desc) => {
    const [rx, ry, rw, rh] = desc.rect;
    const pad = 8;
    const x0 = Math.max(0, Math.floor((rx - pad) * dpr)), y0 = Math.max(0, Math.floor((ry - pad) * dpr));
    const x1 = Math.min(base.width, Math.ceil((rx + rw + pad) * dpr)), y1 = Math.min(base.height, Math.ceil((ry + rh + pad) * dpr));
    const surround = modeColor(base, x0, y0, x1, y1) ?? [255, 255, 255];
    const inner = modeColor(base, rx * dpr, ry * dpr, (rx + rw) * dpr, (ry + rh) * dpr) ?? surround;
    let changed = 0, best = 0, outsideChanged = 0;
    for (let y = 0; y < base.height; y += 1) {
      for (let x = 0; x < base.width; x += 1) {
        const at = (y * base.width + x) * 4;
        if (Math.abs(base.pixels[at] - shot.pixels[at]) + Math.abs(base.pixels[at + 1] - shot.pixels[at + 1]) + Math.abs(base.pixels[at + 2] - shot.pixels[at + 2]) <= 24) continue;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) {
          changed += 1;
          const now = [shot.pixels[at], shot.pixels[at + 1], shot.pixels[at + 2]];
          best = Math.max(best, contrastRatio(now, surround), contrastRatio(now, inner));
        } else outsideChanged += 1;
      }
    }
    return { changed, best, outsideChanged };
  };
  const stable = async () => { await screenshot(page); await sleep(150); return decodePng(await screenshot(page)); };
  const measureStop = async index => {
    const desc = await evalFn(page, P.activeDescriptor);
    if (!desc) { result.push({ index, none: true }); return; }
    const ax = await activeAxName(page).catch(() => null);
    const obscured = await evalFn(page, P.obscuredCheck);
    const focused = await stable();
    let { changed, best, outsideChanged } = compare(baseline, focused, desc);
    let method = 'baseline';
    if (outsideChanged >= 40) {
      // the page moved (for example it scrolled to the control): compare against the same view with focus removed
      await evalFn(page, () => { window.__verifyEl = document.activeElement; document.activeElement.blur(); return true; });
      await sleep(100);
      const blurred = await stable();
      await evalFn(page, () => { window.__verifyEl.focus({ preventScroll: true }); return true; });
      await sleep(80);
      ({ changed, best, outsideChanged } = compare(blurred, focused, desc));
      method = 'blur-compare';
    }
    const label = ax?.name || desc.label;
    result.push({ index, label, axRole: ax?.role ?? null, tag: desc.tag, role: desc.role, path: desc.path, rect: desc.rect.map(Math.round), inViewport: desc.inViewport,
      visibleFocus: desc.visibleFocus, obscured: obscured === false, changed, indicatorRatio: best, outsideChanged, method,
      baselineValid: outsideChanged < 40, mock: /^(Show|Hide) controls$/.test(label) });
  };
  if (focusFirst) {
    // enter the element by keyboard (Shift+Tab then Tab) so :focus-visible applies as it does for a keyboard user
    await evalFn(page, selector => { document.querySelector(selector).focus(); return true; }, focusFirst);
    await pressKey(page, 'Tab', { shift: true });
    await sleep(60);
    await pressKey(page, 'Tab');
    await sleep(100);
    await measureStop(-1);
  }
  for (let index = 0; index < stops; index += 1) {
    await pressKey(page, 'Tab');
    await sleep(90);
    await measureStop(index);
  }
  return result;
}

/* ------------------------------------------------------------------ accessibility tree */

const NAME_REQUIRED = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'option', 'treeitem']);
export async function axAudit(env) {
  const { nodes } = await env.page.send('Accessibility.getFullAXTree');
  const out = { total: nodes.length, namedInteractive: 0, unnamed: [], rows: [], roles: {}, focusableUnnamed: [] };
  for (const node of nodes) {
    if (node.ignored) continue;
    const role = node.role?.value ?? '';
    const name = String(node.name?.value ?? '').trim();
    out.roles[role] = (out.roles[role] ?? 0) + 1;
    const focusable = Boolean(node.properties?.some(property => property.name === 'focusable' && property.value?.value === true));
    if (NAME_REQUIRED.has(role)) {
      if (name) out.namedInteractive += 1; else out.unnamed.push({ role, id: node.nodeId });
    }
    if (focusable && !name && !['RootWebArea', 'none', 'presentation'].includes(role)) out.focusableUnnamed.push({ role, id: node.nodeId });
    if ((role === 'row' || role === 'listitem') && /\.dude\/ideas\//.test(name)) out.rows.push({ role, name });
  }
  return out;
}

export async function typeInto(env, selector, text, { clear = false } = {}) {
  await clickSelector(env.page, selector);
  if (clear) {
    await env.page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, commands: ['selectAll'] });
    await env.page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await pressKey(env.page, 'Backspace');
  }
  if (text) await typeText(env.page, text);
}

export async function chooseOption(env, field, optionText) {
  await clickSelector(env.page, `[data-capture-choice="${field}"]`);
  await env.waitFor(P.hasListbox, `${field} options`, 4000);
  const options = await evalFn(env.page, P.listboxOptions);
  await clickSelector(env.page, '[role=listbox] [role=option]', { text: optionText });
  await until(async () => !(await evalFn(env.page, P.listboxOptions)).length, `${field} listbox closed`, 4000, 40);
  return options.map(option => option.text);
}

export { sleep, until, clickSelector, clickPoint, pressKey, screenshot, evalFn, decodePng, modeColor, pixelAt, P };

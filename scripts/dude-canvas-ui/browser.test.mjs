// @ts-check
/**
 * Browser-level contract coverage for the shipped Dude Now canvas.
 *
 * This intentionally uses no browser library. It drives a fresh headless Chromium
 * process over the Chrome DevTools Protocol and serves the actual committed
 * shell and bundle through the production provider and controlled UI fixtures.
 * Screenshots are evidence only and deliberately live outside the repository.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const UI_ROOT = path.join(ROOT, 'src', 'extensions', 'dude', 'ui');
const BROWSER = process.env.DUDE_CANVAS_BROWSER ?? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const REQUIRED = process.env.DUDE_CANVAS_BROWSER_REQUIRED === '1';
const FLUENT_PACKAGE_ROOT = path.join(HERE, 'node_modules', '@fluentui', 'react-components');
const FLUENT_PACKAGE_JSON = path.join(FLUENT_PACKAGE_ROOT, 'package.json');
/** @type {string} Evidence belongs to the single suite run in this process. */
let artifactRoot;
const DEADLINE_MS = 12_000;
const SHA256 = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const LONG_OPTION_SLUG = 'feature-with-a-deliberately-overlong-canonical-name-that-must-remain-accessible-while-the-visible-option-label-is-clipped';
const LONG_CANONICAL_IDENTIFIER = `047-${LONG_OPTION_SLUG}`;
const T013_SOURCE_DESCRIPTION = [
  'After T012@052dog12, run final unchanged-revision verification: focused extension/engine tests and recursive repository tests;',
  '`npm ci --prefix scripts/dude-canvas-ui`;',
  'two clean scoped builds whose `app.js` and required `app.js.LEGAL.txt` bytes exactly match each other and committed output;',
  'dependency/license audit and exact raw/gzip budget report;',
  'and development/release/consumer inspection proving the runtime allowlist is exact while `frontend/**`, every test, package manifests, lockfile, and build tooling are absent.',
  'Verify release never invokes npm/esbuild, consumers remain install- and network-free, upgrade owns only `.github/extensions/dude/**`, unrelated extensions survive,',
  'then run workspace lint, prose repetition inspection, backlog freshness, diff hygiene, and independent Reviewer acceptance;',
  'leave package 025, idea 053, all five preserved design artifacts, Needs You, Sharpie/Review, pdf.js, and every deferred outcome untouched.',
  '(FR-001 through FR-027; SC-001 through SC-010; VSC-001 through VSC-006)',
].join(' ');
const T013_PROJECTED_DESCRIPTION = T013_SOURCE_DESCRIPTION.replace('T012@052dog12', 'task');
const T013_NEXT_SOURCE = Object.freeze({
  kind: 'file',
  path: '.dude/specs/052-dude-canvas-ui/tasks.md',
  taskKey: 'T013@052rel13',
  description: T013_SOURCE_DESCRIPTION,
});
const STRUCTURED_LONG_DESCRIPTION = 'Review the current release evidence: compare both deterministic builds; retain every reviewed legal notice before handoff.';
const UNSAFE_UNSTRUCTURED_DESCRIPTION = 'Keep every original word in this unstructured verification instruction while running `npm ci` against `frontend/**` and reporting the complete unchanged source meaning for the release handoff';
const UNSAFE_UNSTRUCTURED_VISIBLE = UNSAFE_UNSTRUCTURED_DESCRIPTION.replaceAll('`', '');
const ACTION_REFRESH = Object.freeze({
  kind: 'refresh',
  label: 'Refresh from repository',
  method: 'POST',
  path: '/api/refresh',
});

/** @param {string} color */
function cssRgb(color) {
  assert.match(color, /^#[\da-f]{6}$/i, `expected an opaque Fluent token, got ${color}`);
  return `rgb(${Number.parseInt(color.slice(1, 3), 16)}, ${Number.parseInt(color.slice(3, 5), 16)}, ${Number.parseInt(color.slice(5, 7), 16)})`;
}

function loadChooserSurfaceTokens() {
  const fluentRequire = createRequire(path.join(HERE, 'package.json'));
  const { webDarkTheme, webLightTheme } = fluentRequire('@fluentui/react-components');
  return Object.freeze(Object.fromEntries(
    Object.entries({ dark: webDarkTheme, light: webLightTheme }).map(([appearance, theme]) => [
      appearance,
      Object.freeze({
        background1: cssRgb(theme.colorNeutralBackground1),
        background2: cssRgb(theme.colorNeutralBackground2),
        brand: cssRgb(theme.colorCompoundBrandStroke),
        brandForeground: cssRgb(theme.colorBrandForeground1),
        greenForeground: cssRgb(theme.colorPaletteGreenForeground1),
        greenBorder: cssRgb(theme.colorPaletteGreenBorder2),
        selected: cssRgb(theme.colorNeutralBackground1Selected),
        stroke2: cssRgb(theme.colorNeutralStroke2),
        thicker: theme.strokeWidthThicker,
      }),
    ]),
  ));
}

/** @param {string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} slug @param {string} number */
function selected(slug, number) {
  return {
    title: slug.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    ideaPath: `.dude/ideas/${number}-${slug}.md`,
    slug,
    specPath: `.dude/specs/${number}-${slug}/spec.md`,
    explicit: true,
  };
}

/** @param {string} slug @param {string} number */
function sources(slug, number) {
  return [
    {
      kind: 'inventory',
      label: 'Feature inventory',
      paths: ['.dude/ideas', '.dude/specs'],
      role: 'selection',
      contentIdentity: SHA256,
    },
    {
      kind: 'file',
      label: 'Idea',
      path: `.dude/ideas/${number}-${slug}.md`,
      role: 'identity',
      contentIdentity: SHA256,
      details: { section: 'Coordinator Log', eventCount: 2, recentEvents: [] },
    },
    {
      kind: 'file',
      label: 'Specification',
      path: `.dude/specs/${number}-${slug}/spec.md`,
      role: 'definition',
      contentIdentity: SHA256,
      details: { section: 'Revision Log', eventCount: 1, recentEvents: [] },
    },
  ];
}

/**
 * Builds a complete projection using only fields emitted by projection.mjs.
 * @param {{
 *   slug?: string,
 *   number?: string,
 *   authority?: 'definition'|'lightweight'|'tracked',
 *   stage?: string,
 *   next?: string|null,
 *   nextSourceDescription?: string,
 *   nextTaskKey?: string,
 *   nextReason?: string|null,
 *   blockers?: Array<{classification?:string,reason:string,source:Record<string,unknown>}>,
 *   unansweredQuestions?: number|null,
 *   tasks?: {total:number,open:number,inProgress:number,blocked:number,done:number}|null,
 *   phases?: Array<{name:string,total:number,open:number,inProgress:number,blocked:number,done:number,state:string}>,
 *   activity?: {total:number,recent:Array<{date:string,text:string}>}|null,
 *   latestEvent?: {date:string,text:string,source:Record<string,string>}|null,
 *   attention?: Array<{code:string,severity:'warning'|'error',message:string}>,
 *   diagnostics?: Array<{code:string,severity:'warning'|'error',path:string,message:string}>,
 * }} [options]
 */
function completeProjection(options = {}) {
  const slug = options.slug ?? 'lightweight-workspace';
  const number = options.number ?? '042';
  const selection = selected(slug, number);
  const tasks = options.tasks === undefined
    ? { total: 5, open: 1, inProgress: 1, blocked: 0, done: 3 }
    : options.tasks;
  const phases = options.phases ?? [
    { name: 'Foundation', total: 3, open: 0, inProgress: 0, blocked: 0, done: 3, state: 'done' },
    { name: 'Verification', total: 2, open: 1, inProgress: 1, blocked: 0, done: 0, state: 'current' },
  ];
  const activity = options.activity ?? {
    total: 2,
    recent: [
      { date: '2026-09-03 UTC', text: 'Verification evidence was requested.' },
      { date: '2026-09-02 UTC', text: 'Implementation was recorded.' },
    ],
  };
  const latestEvent = options.latestEvent ?? {
    date: '2026-09-03 UTC',
    text: 'Verification evidence was requested.',
    source: { path: selection.specPath, section: 'Revision Log' },
  };
  const next = options.next === undefined ? 'Verify the rendered canvas.' : options.next;
  return {
    complete: true,
    status: 'ok',
    readAt: '2026-09-03T23:45:00.000Z',
    attemptedAt: null,
    selected: selection,
    authority: options.authority ?? 'lightweight',
    stage: options.stage ?? 'In progress',
    next: next === null
      ? null
      : {
        description: next,
        source: {
          kind: options.authority === 'tracked' ? 'tracked' : 'file',
          ...(options.authority === 'tracked'
            ? { issueId: 'dude-42', title: next }
            : {
              path: `.dude/specs/${number}-${slug}/tasks.md`,
              taskKey: options.nextTaskKey ?? 'T011@052a11y1',
              description: options.nextSourceDescription ?? next,
            }),
        },
      },
    nextReason: options.nextReason ?? (next === null ? 'No supported next step is currently established.' : null),
    blockers: options.blockers ?? [],
    unansweredQuestions: options.unansweredQuestions ?? 2,
    tasks,
    phases,
    activity,
    latestEvent,
    attention: options.attention ?? [],
    diagnostics: options.diagnostics ?? [],
    sources: sources(slug, number),
    choices: options.choices ?? MANY_CHOICES,
    action: ACTION_REFRESH,
  };
}

/** @param {'current'|'changed'|'stale'|'unavailable'|'conflict'} state @param {string} message */
function freshness(state, message) {
  return {
    state,
    checkedAt: '2026-09-03T23:46:00.000Z',
    readAt: '2026-09-03T23:45:00.000Z',
    message,
    diagnostics: [],
    nextAction: ACTION_REFRESH,
  };
}

function unavailableProjection(code, message, selectedFeature = null) {
  return {
    complete: false,
    status: 'unavailable',
    readAt: null,
    attemptedAt: '2026-09-03T23:45:00.000Z',
    selected: selectedFeature,
    authority: null,
    stage: null,
    next: null,
    nextReason: message,
    blockers: [],
    unansweredQuestions: selectedFeature ? 2 : null,
    tasks: null,
    phases: [],
    activity: null,
    latestEvent: null,
    attention: [{ code, severity: 'error', message }],
    diagnostics: [{ code, severity: 'error', path: '.', message }],
    sources: [],
    action: ACTION_REFRESH,
  };
}

const MANY_CHOICES = Object.freeze([
  ...Array.from({ length: 50 }, (_value, index) => {
    const ordinal = index + 1;
    const number = index === 47 ? '052' : index === 48 ? '053' : index === 49
      ? '054'
      : String(ordinal).padStart(3, '0');
    const slug = index === 47
      ? 'dude-canvas-ui'
      : index === 48
        ? 'feature-slug-target'
        : index === 46
          ? LONG_OPTION_SLUG
        : `feature-${String(ordinal).padStart(2, '0')}`;
    return {
      ideaPath: `.dude/ideas/${number}-${slug}.md`,
      slug,
      specPath: `.dude/specs/${number}-${slug}/spec.md`,
    };
  }),
]);
const UNLISTED_EXACT_SELECTED_CHOICES = Object.freeze([
  ...MANY_CHOICES.filter(({ slug }) => slug !== 'dude-canvas-ui'),
  {
    ideaPath: '.dude/ideas/055-listed-feature.md',
    slug: 'listed-feature',
    specPath: '.dude/specs/055-listed-feature/spec.md',
  },
]);

const TRACKED = completeProjection({
  slug: 'tracked-workspace',
  number: '043',
  authority: 'tracked',
  next: 'Inspect the exact tracked work item.',
  tasks: { total: 4, open: 2, inProgress: 0, blocked: 0, done: 2 },
  phases: [
    { name: 'Definition', total: 2, open: 0, inProgress: 0, blocked: 0, done: 2, state: 'done' },
    { name: 'Tracked delivery', total: 2, open: 2, inProgress: 0, blocked: 0, done: 0, state: 'current' },
  ],
});
const BLOCKED = completeProjection({
  slug: 'blocked-workspace',
  number: '044',
  stage: 'Blocked',
  next: null,
  nextReason: 'No canonical task is ready.',
  tasks: { total: 3, open: 1, inProgress: 0, blocked: 1, done: 1 },
  blockers: [{
    classification: 'external-dependency',
    reason: 'Waiting for the authoritative service response.',
    source: {
      kind: 'file',
      path: '.dude/specs/044-blocked-workspace/tasks.md',
      taskKey: 'T021@052a11y1',
      reason: 'Waiting for the authoritative service response.',
    },
  }],
  phases: [{ name: 'Validation', total: 3, open: 1, inProgress: 0, blocked: 1, done: 1, state: 'current' }],
});
const MISMATCH = completeProjection({
  slug: 'selected-b',
  number: '045',
  authority: 'tracked',
  stage: 'Defined',
  next: null,
  nextReason: 'Tracked work is authoritative, but it has no exact issue for this feature.',
  tasks: null,
  phases: [],
  attention: [{
    code: 'TRACKED_FEATURE_NOT_FOUND',
    severity: 'warning',
    message: 'Selected feature is absent from the populated tracked board.',
  }],
});

const COMPLETED_PROJECTIONS = Object.fromEntries([
  ['complete-lightweight', 'dude-canvas-ui', '052', 'lightweight', 3],
  ['complete-tracked', 'feature-17', '017', 'tracked', 4],
  ['complete-single', 'feature-01', '001', 'lightweight', 1],
].map(([fixture, slug, number, authority, total]) => {
  const tasks = { total, open: 0, inProgress: 0, blocked: 0, done: total };
  return [fixture, completeProjection({
    slug, number, authority, tasks,
    stage: 'Verified',
    next: null,
    nextReason: authority === 'tracked'
      ? 'No supported next tracked task is currently established.'
      : 'All canonical tasks are complete.',
    unansweredQuestions: 0,
    phases: authority === 'tracked' ? [] : [{ name: 'Delivery', ...tasks, state: 'done' }],
  })];
}));

/**
 * Loopback-only production-shape fixture server. Each state is keyed by the
 * current page query, so the real bundle receives the same relative API paths
 * it uses under the production canvas server.
 */
function createFixtureServer() {
  const index = fs.readFileSync(path.join(UI_ROOT, 'index.html'));
  const app = fs.readFileSync(path.join(UI_ROOT, 'assets', 'app.js'));
  const legal = fs.readFileSync(path.join(UI_ROOT, 'assets', 'app.js.LEGAL.txt'));
  const observations = {
    calls: /** @type {Array<{method:string,path:string,fixture:string,body?:unknown}>} */ ([]),
    events: 0,
    viewport: 0,
    refreshes: /** @type {Array<{fixture:string,body:unknown}>} */ ([]),
  };
  /** @type {Map<string, {res:import('node:http').ServerResponse, fixture:string, body:unknown}>} */
  const refreshGates = new Map();
  const server = createServer(async (req, res) => {
    const base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
    const requestUrl = new URL(req.url ?? '/', base);
    const referer = req.headers.referer ? new URL(req.headers.referer, base) : requestUrl;
    const fixture = referer.searchParams.get('fixture') ?? requestUrl.searchParams.get('fixture') ?? 'lightweight';
    const record = { method: req.method ?? 'GET', path: requestUrl.pathname, fixture };
    observations.calls.push(record);
    const send = (status, body, contentType = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': contentType });
      res.end(Buffer.isBuffer(body) ? body : typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (req.method === 'GET' && requestUrl.pathname === '/') return send(200, index, 'text/html; charset=utf-8');
    if (req.method === 'GET' && requestUrl.pathname === '/assets/app.js') return send(200, app, 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && requestUrl.pathname === '/assets/app.js.LEGAL.txt') return send(200, legal, 'text/plain; charset=utf-8');
    if (req.method === 'GET' && requestUrl.pathname === '/events') {
      observations.events += 1;
      res.writeHead(200, {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
      });
      res.write(': connected\n\n');
      req.on('close', () => res.end());
      return;
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/viewport') {
      observations.viewport += 1;
      const body = await bodyJson(req);
      observations.calls.at(-1).body = body;
      return send(200, { recorded: true, width: body.width, height: body.height });
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/projection') {
      return send(200, projectionPayload(fixture));
    }
    if (req.method === 'GET' && requestUrl.pathname === '/api/freshness') {
      return send(200, freshnessPayload(fixture));
    }
    if (req.method === 'POST' && requestUrl.pathname === '/api/refresh') {
      const body = await bodyJson(req);
      observations.refreshes.push({ fixture, body });
      observations.calls.at(-1).body = body;
      if (fixture === 'busy' || (
        (fixture === 'chooser' || fixture === 'selected')
        && (body?.target === 'feature-17' || body?.target === 'dude-canvas-ui')
      )) {
        refreshGates.set(fixture, { res, fixture, body });
        return;
      }
      return send(200, refreshPayload(fixture, body));
    }
    send(404, { error: 'Not found.' });
  });
  return {
    observations,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(undefined));
      });
      return `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
    },
    async waitForRefresh(fixture, timeout = DEADLINE_MS) {
      const gate = refreshGates.get(fixture);
      if (gate) return;
      try {
        await until(() => refreshGates.has(fixture), `${fixture} refresh request`, timeout);
      } catch (error) {
        throw new Error(`${error.message}; observed calls: ${JSON.stringify(observations.calls.slice(-6))}`);
      }
    },
    releaseRefresh(fixture) {
      const gate = refreshGates.get(fixture);
      assert.ok(gate, `${fixture} refresh must be pending before release`);
      refreshGates.delete(fixture);
      const response = refreshPayload(gate.fixture, gate.body);
      gate.res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
      gate.res.end(JSON.stringify(response));
    },
    async close() {
      for (const gate of refreshGates.values()) {
        gate.res.destroy();
      }
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}

/** @param {import('node:http').IncomingMessage} req */
async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const value = Buffer.concat(chunks).toString('utf8');
  return value ? JSON.parse(value) : {};
}

/** @param {string} fixture */
function projectionPayload(fixture) {
  if (Object.hasOwn(COMPLETED_PROJECTIONS, fixture)) {
    return {
      projection: COMPLETED_PROJECTIONS[fixture],
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'definition-only' || fixture === 'resolved') {
    const projection = completeProjection({
      authority: 'definition',
      stage: fixture === 'resolved' ? 'Completed without a package' : 'Defined',
      next: null,
      nextReason: fixture === 'resolved' ? 'This idea is resolved.' : 'No canonical task execution evidence exists yet.',
      tasks: null,
      phases: [],
    });
    if (fixture === 'resolved') {
      projection.selected.specPath = null;
      projection.sources = projection.sources.filter(({ label }) => label !== 'Specification');
      projection.latestEvent = null;
      projection.choices = [];
    }
    return { projection, freshness: freshness('current', 'Every authoritative source matches the last complete read.') };
  }
  if (fixture === 'tracked-waiting' || fixture === 'tracked-no-executable-tasks') {
    // Production can have open tasks with no ready issue, or only an exact
    // owning epic (zero executable tasks). Neither establishes completion.
    const waiting = fixture === 'tracked-waiting';
    return {
      projection: completeProjection({
        authority: 'tracked',
        stage: waiting ? 'In progress' : 'Defined',
        next: null,
        nextReason: 'No supported next tracked task is currently established.',
        tasks: waiting
          ? { total: 2, open: 1, inProgress: 0, blocked: 0, done: 1 }
          : { total: 0, open: 0, inProgress: 0, blocked: 0, done: 0 },
        phases: [],
      }),
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'chooser' || fixture === 'empty') {
    return {
      projection: {
        complete: true,
        status: 'choose',
        readAt: '2026-09-03T23:45:00.000Z',
        attemptedAt: null,
        selected: null,
        authority: null,
        stage: null,
        next: null,
        nextReason: null,
        blockers: [],
        unansweredQuestions: null,
        tasks: null,
        phases: [],
        activity: null,
        latestEvent: null,
        attention: [],
        diagnostics: [],
        sources: [{
          kind: 'inventory',
          label: 'Feature inventory',
          paths: ['.dude/ideas', '.dude/specs'],
          role: 'selection',
          contentIdentity: SHA256,
        }],
        choices: fixture === 'chooser' ? MANY_CHOICES : [],
        action: { kind: 'select-feature', label: 'Select a feature', method: 'POST', path: '/api/refresh' },
      },
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'tracked') return { projection: TRACKED, freshness: freshness('current', 'Every authoritative source matches the last complete read.') };
  if (fixture === 'blocked') return { projection: BLOCKED, freshness: freshness('current', 'Every authoritative source matches the last complete read.') };
  if (fixture === 'mismatch') return { projection: MISMATCH, freshness: freshness('current', 'Every authoritative source matches the last complete read.') };
  if (fixture === 't013-next') {
    return {
      projection: completeProjection({
        slug: 'dude-canvas-ui',
        number: '052',
        next: T013_PROJECTED_DESCRIPTION,
        nextSourceDescription: T013_SOURCE_DESCRIPTION,
        nextTaskKey: T013_NEXT_SOURCE.taskKey,
      }),
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'structured-next') {
    return {
      projection: completeProjection({ next: STRUCTURED_LONG_DESCRIPTION }),
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'unsafe-next') {
    return {
      projection: completeProjection({ next: UNSAFE_UNSTRUCTURED_DESCRIPTION }),
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'malformed') {
    return {
      projection: unavailableProjection('TASKS_MALFORMED', 'Canonical task state is malformed.', selected('malformed-workspace', '046')),
      freshness: freshness('unavailable', 'No complete projection is available.'),
    };
  }
  if (fixture === 'partial') {
    return {
      projection: unavailableProjection('PROJECTION_INPUT_MISSING', 'A canonical projection input could not be read completely.', selected('partial-workspace', '047')),
      freshness: freshness('unavailable', 'No complete projection is available.'),
    };
  }
  if (fixture === 'conflict') {
    return {
      projection: unavailableProjection('PROJECTION_READ_CONFLICT', 'Canonical feature state is conflicting.', selected('conflict-workspace', '048')),
      freshness: freshness('conflict', 'Refresh found conflicting canonical state; the last complete read was preserved.'),
    };
  }
  if (fixture === 'tracker-unavailable') {
    return {
      projection: unavailableProjection('TRACKED_AUTHORITY_UNAVAILABLE', 'Tracked authority could not be read.', selected('tracker-workspace', '049')),
      freshness: freshness('unavailable', 'No complete projection is available.'),
    };
  }
  if (fixture === 'selected') {
    return {
      projection: completeProjection({ slug: 'dude-canvas-ui', number: '052' }),
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  if (fixture === 'unlisted-selected') {
    return {
      projection: completeProjection({
        slug: 'dude-canvas-ui',
        number: '052',
        choices: UNLISTED_EXACT_SELECTED_CHOICES,
      }),
      freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
    };
  }
  return {
    projection: completeProjection({
      slug: fixture === 'busy' ? 'busy-workspace' : fixture === 'changed' ? 'changed-workspace' : 'lightweight-workspace',
      number: fixture === 'busy' ? '050' : fixture === 'changed' ? '051' : '042',
    }),
    freshness: freshness('current', 'Every authoritative source matches the last complete read.'),
  };
}

/** @param {string} fixture @param {unknown} body */
function refreshPayload(fixture, body) {
  if (fixture === 'stale') {
    return {
      replaced: false,
      projection: completeProjection({ slug: 'lightweight-workspace', number: '042' }),
      freshness: freshness('stale', 'Refresh could not read authoritative state; the last complete read was preserved.'),
    };
  }
  if (fixture === 'conflict') {
    return {
      replaced: false,
      projection: completeProjection({ slug: 'lightweight-workspace', number: '042' }),
      freshness: freshness('conflict', 'Refresh found conflicting canonical state; the last complete read was preserved.'),
    };
  }
  const target = body && typeof body === 'object' && 'target' in body ? /** @type {any} */ (body).target : null;
  if ((fixture === 'chooser' || fixture === 'selected') && target === 'dude-canvas-ui') {
    return {
      replaced: false,
      projection: null,
      freshness: freshness('stale', 'The selected feature could not be read completely; choose a feature again.'),
    };
  }
  return {
    replaced: true,
    projection: completeProjection({
      slug: target ?? (fixture === 'busy' ? 'atomic-replacement' : fixture === 'tracked' ? 'tracked-refreshed' : 'lightweight-refreshed'),
      number: target ? '017' : '052',
      authority: fixture === 'tracked' ? 'tracked' : 'lightweight',
      next: target ? 'Read the selected complete projection.' : 'Refresh completed from one complete read.',
      tasks: { total: 6, open: 1, inProgress: 1, blocked: 0, done: 4 },
    }),
    freshness: freshness('current', 'Refresh completed from one complete read.'),
  };
}

/** @param {string} fixture */
function freshnessPayload(fixture) {
  if (fixture === 'changed') {
    return {
      projection: completeProjection({ slug: 'changed-workspace', number: '051' }),
      freshness: freshness('changed', 'An authoritative source changed after the last complete read.'),
    };
  }
  return projectionPayload(fixture);
}

/**
 * Only bd is substituted. Production reads these canonical files and spawns
 * this executable, including every input-identity recheck. Like the server
 * tests, a recorded child PID is the release barrier, not an elapsed delay.
 */
function createProviderFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-provider-'));
  const root = path.join(directory, 'repo');
  const bin = path.join(directory, 'bin');
  const callsPath = path.join(directory, 'calls');
  const controlPath = path.join(directory, 'control.json');
  const heldPath = path.join(directory, 'held');
  const originalPath = process.env.PATH;
  const write = (relative, text) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const tasks017 = '.dude/specs/017-feature-17/tasks.md';
  const initial017 = '# Feature 17 tasks\n\n## Phase 1: Delivery\n\n'
    + '- [x] T001@017base1 Record the baseline evidence.\n'
    + '- [~] T002@017check Validate the selected feature before handoff.\n';
  try {
    fs.mkdirSync(bin);
    fs.mkdirSync(callsPath);
    for (const choice of MANY_CHOICES) {
      const defined = ['feature-01', 'feature-17', 'dude-canvas-ui'].includes(choice.slug);
      const title = choice.slug === 'dude-canvas-ui' ? 'Dude Canvas UI' : choice.slug.replaceAll('-', ' ');
      write(choice.ideaPath, [
        '---', `title: ${title}`, `slug: ${choice.slug}`,
        `status: ${defined ? 'defined' : 'draft'}`, `spec_path: ${defined ? choice.specPath : ''}`,
        '---', '', '## Idea', '', `Read-only orientation for ${title}.`, '',
        ...(defined ? [
          '## Coordinator Log', '',
          '- 2026-09-02 UTC - Implementation evidence was recorded.',
          '- 2026-09-03 UTC - Browser acceptance was requested.', '',
        ] : []),
      ].join('\n'));
      if (!defined) continue;
      write(choice.specPath, [
        `# ${title}`, '', 'Show the selected feature and its source-backed work.', '',
        '## Revision Log', '', '- 2026-09-01 UTC - Initial read-only scope defined.', '',
      ].join('\n'));
      write(path.posix.join(path.posix.dirname(choice.specPath), 'tasks.md'),
        choice.slug === 'dude-canvas-ui'
          ? [
            '# Canvas tasks', '', '## Phase 1: Foundation', '',
            '- [x] T001@052base1 Define the read-only provider boundary.',
            '- [x] T002@052base2 Build the committed renderer.', '',
            '## Phase 2: Acceptance', '',
            '- [x] T012@052dog12 Record the browser interaction evidence.',
            `- [~] T013@052rel13 ${T013_SOURCE_DESCRIPTION}`,
            '    deps: T012@052dog12',
            '- [ ] T014@052ship1 Publish the accepted evidence.',
            '    deps: T013@052rel13', '',
          ].join('\n')
          : choice.slug === 'feature-17' ? initial017
            : '# Baseline tasks\n\n## Phase 1: Baseline\n\n- [~] T001@001base1 Inspect the initial committed feature.\n');
    }
    fs.writeFileSync(controlPath, JSON.stringify({ outcome: 'empty', hold: false }));
    fs.writeFileSync(path.join(bin, 'bd'), [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      `const control = JSON.parse(fs.readFileSync(${JSON.stringify(controlPath)}, 'utf8'));`,
      'let held = false;',
      'if (control.hold) {',
      `  try { fs.closeSync(fs.openSync(${JSON.stringify(heldPath)}, 'wx')); held = true; }`,
      "  catch (error) { if (error.code !== 'EEXIST') throw error; }",
      '}',
      'let timer;',
      'const finish = () => {',
      '  clearInterval(timer);',
      "  if (control.outcome === 'empty') { process.stdout.write('[]'); process.exit(0); }",
      "  process.stderr.write(control.outcome === 'absent' ? 'Error: no beads database found\\n' : 'Error: fixture read failed\\n');",
      '  process.exit(1);',
      '};',
      "if (held) { timer = setInterval(() => {}, 1000); process.once('SIGUSR1', finish); }",
      // Publish after the signal handler is installed. Separate files avoid
      // losing calls if a browser freshness read overlaps another acquisition.
      `const record = ${JSON.stringify(callsPath)} + '/' + process.pid + '.json';`,
      'fs.writeFileSync(record + ".tmp", JSON.stringify({pid: process.pid, args: process.argv.slice(2), outcome: control.outcome, held}));',
      'fs.renameSync(record + ".tmp", record);',
      'if (!held) finish();',
      '',
    ].join('\n'), { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  const calls = () => fs.readdirSync(callsPath).filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(callsPath, file), 'utf8')));
  return {
    root,
    directory,
    calls,
    setOutcome(outcome, hold = false) {
      fs.writeFileSync(controlPath, JSON.stringify({ outcome, hold }));
    },
    changeSelectedSource() {
      write(tasks017, initial017.replace('[~] T002', '[x] T002'));
    },
    async close() {
      try {
        // closeInstance normally reaps these first; also cover fixture failures.
        const owned = calls().map(({ pid }) => pid);
        for (const pid of owned) {
          try { process.kill(pid, 'SIGKILL'); } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        }
        await until(() => owned.every((pid) => {
          try { process.kill(pid, 0); return false; } catch (error) {
            if (error.code === 'ESRCH') return true;
            throw error;
          }
        }), 'owned bd children reaped', 2_000);
      } finally {
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Bounded condition wait. It is used only for lifecycle/DOM/network conditions;
 * no test relies on an arbitrary fixed delay.
 * @template T
 * @param {() => Promise<T>|T} probe
 * @param {string} description
 * @param {number} [timeout]
 * @returns {Promise<T>}
 */
async function until(probe, description, timeout = DEADLINE_MS) {
  const end = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < end) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ''}`);
}

class Cdp {
  /** @param {string} debuggerUrl */
  constructor(debuggerUrl) {
    this.nextId = 1;
    /** @type {Map<number, {resolve:(value:any)=>void,reject:(reason:unknown)=>void}>} */
    this.pending = new Map();
    /** @type {Map<string, Array<(params:any)=>void>>} */
    this.listeners = new Map();
    this.socket = new WebSocket(debuggerUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
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

  /** @param {string} method @param {Record<string,unknown>} [params] */
  send(method, params = {}) {
    const id = this.nextId++;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  /** @param {string} method @param {(params:any)=>void} listener */
  on(method, listener) {
    const registered = this.listeners.get(method) ?? [];
    registered.push(listener);
    this.listeners.set(method, registered);
  }

  close() {
    this.socket.close();
  }
}

/** @param {number} root */
function descendants(root) {
  const output = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' });
  if (output.status !== 0) return [];
  const byParent = new Map();
  for (const line of output.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const parent = Number(match[2]);
    const children = byParent.get(parent) ?? [];
    children.push(pid);
    byParent.set(parent, children);
  }
  const found = [];
  const visit = (pid) => {
    for (const child of byParent.get(pid) ?? []) {
      visit(child);
      found.push(child);
    }
  };
  visit(root);
  return found;
}

/** @param {import('node:child_process').ChildProcess} child */
async function stopBrowser(child) {
  if (!child.pid || child.exitCode !== null) return;
  const pids = [child.pid, ...descendants(child.pid)];
  for (const pid of pids.reverse()) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* process already exited */ }
  }
  await until(() => child.exitCode !== null || child.signalCode !== null, 'browser process exit', 3_000)
    .catch(() => undefined);
  if (child.exitCode !== null || child.signalCode !== null) return;
  for (const pid of [child.pid, ...descendants(child.pid)].reverse()) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* process already exited */ }
  }
}

async function startBrowser() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-canvas-browser-profile-'));
  const browser = spawn(BROWSER, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let launchError;
  let stderr = '';
  browser.once('error', (error) => { launchError = error; });
  browser.stdout.resume();
  browser.stderr.on('data', (bytes) => { stderr += bytes; });
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const port = await until(() => {
      if (launchError) return launchError;
      if (browser.exitCode !== null || browser.signalCode !== null) {
        return new Error(`Browser exited before CDP startup (${browser.exitCode ?? browser.signalCode}): ${stderr}`);
      }
      if (!fs.existsSync(portFile)) return null;
      const first = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
      return /^\d+$/.test(first) ? Number(first) : null;
    }, 'browser DevToolsActivePort');
    if (port instanceof Error) throw port;
    const info = await until(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      return response.ok ? response.json() : null;
    }, 'browser DevTools version endpoint');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const page = new Cdp(target.webSocketDebuggerUrl);
    await page.open();
    await Promise.all([
      page.send('Page.enable'),
      page.send('Runtime.enable'),
      page.send('DOM.enable'),
      page.send('Network.enable'),
      page.send('Accessibility.enable'),
    ]);
    return { browser, info, page, profile };
  } catch (error) {
    await stopBrowser(browser);
    fs.rmSync(profile, { recursive: true, force: true });
    throw new Error(`Could not launch DUDE_CANVAS_BROWSER=${BROWSER}: ${error.message}`, { cause: error });
  }
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
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Runtime evaluation failed');
  }
  return result.result?.value;
}

/** @param {Cdp} page @param {string|null} fixture @param {number} width @param {'light'|'dark'} theme @param {string} base @param {number} [height] @param {boolean} [forcedColors] */
async function navigate(page, fixture, width, theme, base, height = 900, forcedColors = false) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'forced-colors', value: forcedColors ? 'active' : 'none' },
    ],
  });
  await page.send('Page.navigate', { url: fixture ? `${base}/?fixture=${fixture}` : `${base}/` });
  try {
    await until(async () => evaluate(page, `Boolean(
      document.querySelector('header') &&
      document.querySelector('main') &&
      document.querySelector('footer')
    )`), `${fixture} application render`);
  } catch (error) {
    const snapshot = await evaluate(page, `JSON.stringify({
      href: location.href,
      ready: document.readyState,
      root: document.querySelector('#root')?.innerText,
      scripts: [...document.scripts].map((script) => script.src || 'inline'),
    })`);
    throw new Error(`${error.message}; browser DOM: ${snapshot}`);
  }
  await until(async () => evaluate(page, `!document.body.innerText.includes('Reading repository state')
    && [...document.querySelectorAll('header button')].some((node) => node.textContent.trim() === 'Refresh'
      && node.getAttribute('aria-busy') !== 'true')`), `${fixture} initial projection response`);
}

/** @param {Cdp} page @param {string} selector */
async function focus(page, selector) {
  await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error('Missing focus target: ${selector}');
    node.focus();
    return document.activeElement === node;
  })()`);
}

/** @param {Cdp} page */
async function focusRefresh(page) {
  await evaluate(page, `(() => {
    const node = [...document.querySelectorAll('header button')]
      .find((candidate) => candidate.textContent.trim() === 'Refresh');
    if (!node) throw new Error('Missing Refresh button');
    node.focus();
    return document.activeElement === node;
  })()`);
}

/** @param {Cdp} page */
function refreshState(page) {
  return evaluate(page, `(() => {
    const node = [...document.querySelectorAll('header button')]
      .find((candidate) => candidate.textContent.trim() === 'Refresh');
    if (!node) throw new Error('Missing Refresh button');
    return { busy: node.getAttribute('aria-busy'), text: node.textContent.trim(), focused: document.activeElement === node };
  })()`);
}

/** @param {Cdp} page */
async function clickRefresh(page) {
  const point = await evaluate(page, `(() => {
    const node = [...document.querySelectorAll('header button')]
      .find((candidate) => candidate.textContent.trim() === 'Refresh');
    if (!node) throw new Error('Missing Refresh button');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
  })()`);
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

/** Measure current targets and hit-test the same coordinates used for CDP input.
 * @param {Cdp} page @param {string} selector @param {string[]} observations
 */
async function measuredPointer(page, selector, observations) {
  const target = await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error('Missing pointer target: ' + ${JSON.stringify(selector)});
    const rect = node.getBoundingClientRect();
    return {
      rect: rect.toJSON(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      viewport: { width: innerWidth, height: innerHeight },
      disabled: node.matches(':disabled, [aria-disabled="true"]'),
    };
  })()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y });
  const hit = await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    const hit = document.elementFromPoint(${target.x}, ${target.y});
    return { contained: node.contains(hit), tag: hit?.tagName, text: hit?.textContent.trim() };
  })()`);
  const evidence = `${selector}: ${JSON.stringify({ ...target, hit })}`;
  observations.push(evidence);
  assert.equal(target.disabled, false, evidence);
  assert.ok(target.rect.width >= 24 && target.rect.height >= 24, `WCAG 2.2 AA 2.5.8, 24x24 CSSpx: ${evidence}`);
  assert.ok(target.rect.left >= 0 && target.rect.top >= 0
    && target.rect.right <= target.viewport.width && target.rect.bottom <= target.viewport.height,
  `full pointer target is in the viewport: ${evidence}`);
  assert.equal(hit.contained, true, `actual pointer coordinates hit the intended target: ${evidence}`);
  return { x: target.x, y: target.y };
}

/** @param {Cdp} page @param {string} selector @param {string[]} [observations] */
async function click(page, selector, observations) {
  const point = observations ? await measuredPointer(page, selector, observations) : await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error('Missing click target: ${selector}');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
  })()`);
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
}

/** @param {Cdp} page @param {string} key @param {string} [code] @param {{shift?:boolean}} [options] */
async function key(page, key, code = key, { shift = false } = {}) {
  const virtualKeys = {
    ArrowDown: 40,
    End: 35,
    Enter: 13,
    Escape: 27,
    Home: 36,
    Tab: 9,
  };
  const windowsVirtualKeyCode = virtualKeys[key] ?? 0;
  // CDP requires Enter's carriage-return text to exercise the browser's
  // native button activation path (rather than only React key handlers).
  const text = key === 'Enter' ? '\r' : undefined;
  const modifiers = shift ? 8 : 0;
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
    modifiers, text,
    unmodifiedText: text,
  });
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
    modifiers,
  });
}

/** Wait through a microtask and two paint frames without arbitrary sleeping. @param {Cdp} page */
async function settleBrowserWork(page) {
  await evaluate(page, `new Promise((resolve) => requestAnimationFrame(() => {
    Promise.resolve().then(() => requestAnimationFrame(resolve));
  }))`);
}

/** @param {Cdp} page */
async function activeElement(page) {
  return evaluate(page, `(() => {
    const node = document.activeElement;
    return {
      ariaLabel: node?.getAttribute('aria-label'),
      id: node?.id,
      role: node?.getAttribute('role'),
      tag: node?.tagName,
      text: node?.textContent?.trim(),
    };
  })()`);
}

/** @param {Cdp} page @param {string} name @param {string} fixture @param {number} width @param {'light'|'dark'} theme @param {string[]} observations */
async function screenshot(page, name, fixture, width, theme, observations) {
  const image = await page.send('Page.captureScreenshot', { format: 'png' });
  const bytes = Buffer.from(image.data, 'base64');
  const filename = `${String(width).padStart(4, '0')}-${fixture}-${theme}-${name}.png`;
  const absolute = path.join(artifactRoot, filename);
  fs.writeFileSync(absolute, bytes);
  return {
    file: filename,
    fixture,
    viewport: { width, height: 900 },
    theme,
    sha256: sha256(bytes),
    observations,
  };
}

/**
 * Runs a WCAG sRGB contrast calculation against actual computed browser colors.
 * The background walker composites translucent colors through rendered ancestors.
 * @param {string} foreground
 * @param {string} background
 */
function contrast(foreground, background) {
  const parse = (value) => {
    const channels = value.match(/[\d.]+/g)?.map(Number);
    assert.ok(channels && channels.length >= 3, `computed color must be RGB(A): ${value}`);
    return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 1 };
  };
  const composite = (top, bottom) => ({
    r: (top.r * top.a) + (bottom.r * (1 - top.a)),
    g: (top.g * top.a) + (bottom.g * (1 - top.a)),
    b: (top.b * top.a) + (bottom.b * (1 - top.a)),
    a: 1,
  });
  const luminance = (value) => {
    const rgb = [value.r, value.g, value.b].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
  };
  const fg = parse(foreground);
  const bg = composite(parse(background), { r: 255, g: 255, b: 255, a: 1 });
  const [light, dark] = [luminance(fg), luminance(bg)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
}

const DEFAULT_CONTRAST_SAMPLES = Object.freeze([
  Object.freeze({ name: 'identity', selector: '#feature-heading' }),
  Object.freeze({ name: 'next headline', selector: '[aria-labelledby="next-heading"] p' }),
  Object.freeze({ name: 'section title', selector: '#phases-heading' }),
  Object.freeze({ name: 'complete marker', selector: '[aria-labelledby="lifecycle-heading"] ol li:first-child > span' }),
  Object.freeze({ name: 'dock Later text', selector: '[aria-labelledby="surfaces-heading"] li:nth-child(2) span:last-child' }),
  Object.freeze({ name: 'Refresh label', selector: 'header button' }),
  Object.freeze({ name: 'Refresh boundary', property: 'border-top-color', selector: 'header button' }),
  Object.freeze({ name: 'Now boundary', property: 'border-top-color', selector: 'nav[aria-label="Surfaces"] button[aria-current="page"]' }),
]);

const CHOOSER_OPEN_CONTRAST_SAMPLES = Object.freeze([
  Object.freeze({ name: 'chooser option', selector: 'header [role="option"]' }),
  Object.freeze({ name: 'chooser summary band', selector: 'header [aria-live]' }),
  Object.freeze({ name: 'Combobox boundary', parent: true, property: 'border-top-color', selector: 'header input[role="combobox"]' }),
  Object.freeze({ name: 'Combobox placeholder', pseudo: '::placeholder', selector: 'header input[role="combobox"]' }),
]);

const CHOOSER_ZERO_CONTRAST_SAMPLES = Object.freeze([
  Object.freeze({
    name: 'zero-match caption',
    position: 'absolute',
    selector: 'header *',
    text: 'No features match "not-a-feature".',
  }),
]);

/**
 * The browser returns effective opaque backgrounds. `large` is calculated here,
 * rather than assumed from a token, so text thresholds stay auditable.
 * @param {Cdp} page
 * @param {ReadonlyArray<{name:string,selector:string,property?:string,pseudo?:string,parent?:boolean,position?:string,text?:string}>} samples
 */
async function computedContrastSamples(page, samples = DEFAULT_CONTRAST_SAMPLES) {
  return evaluate(page, `(() => {
    const opaqueBackground = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const value = getComputedStyle(node).backgroundColor;
        const channels = value.match(/[\\d.]+/g)?.map(Number);
        if (channels && channels.length >= 3 && (channels[3] ?? 1) > 0) return value;
      }
      return 'rgb(255, 255, 255)';
    };
    const sample = ({ name, selector, property = 'color', pseudo = null, parent = false, position = null, text = null }) => {
      const candidates = [...document.querySelectorAll(selector)];
      let element = candidates.find((candidate) => (
        position === null || getComputedStyle(candidate).position === position
      ) && (text === null || candidate.textContent.trim() === text));
      if (parent) element = element?.parentElement;
      if (!element) throw new Error('missing contrast sample ' + name + ': ' + selector);
      const style = getComputedStyle(element, pseudo);
      return {
        name,
        foreground: style[property],
        background: opaqueBackground(element),
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
      };
    };
    return ${JSON.stringify(samples)}.map(sample);
  })()`);
}

/** @param {Cdp} page @param {number} total */
async function assertCompletedCard(page, total) {
  const card = await evaluate(page, `(() => {
    const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
    const heading = card?.querySelector('h3#next-heading');
    const glyph = heading?.querySelector('svg');
    return {
      heading: heading?.textContent.trim(),
      paragraphs: [...(card?.querySelectorAll('p') ?? [])].map(node => node.textContent.trim()),
      glyph: {
        hidden: glyph?.getAttribute('aria-hidden'),
        focusable: glyph?.getAttribute('focusable'),
        paths: [...(glyph?.querySelectorAll('path') ?? [])].map(node => node.getAttribute('d')),
      },
      text: card?.innerText,
      dividers: card?.querySelectorAll('.fui-Divider, [role="separator"]').length,
      alerts: card?.querySelectorAll('[role="alert"]').length,
    };
  })()`);
  assert.equal(card.heading, 'Complete');
  assert.deepEqual(card.paragraphs, [
    'All tasks complete',
    total === 1 ? 'The 1 task for this feature is complete.' : `All ${total} tasks for this feature are complete.`,
  ]);
  assert.deepEqual(card.glyph, {
    hidden: 'true', focusable: 'false', paths: ['m4.5 8 2.25 2.25L11.75 5'],
  }, 'shared check is decorative, not the warning glyph');
  assert.doesNotMatch(card.text, /Why|Current phase|Next step unavailable|commit|merge|release/i);
  assert.equal(card.dividers, 0, 'no empty facts divider');
  assert.equal(card.alerts, 0);
}

/** @param {Cdp} page */
async function assertUnavailableCard(page) {
  const card = await evaluate(page, `(() => {
    const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
    return {
      heading: card?.querySelector('#next-heading')?.textContent.trim(),
      headline: card?.querySelector('.fui-Title3')?.textContent.trim(),
      glyph: card?.querySelector('#next-heading svg')?.innerHTML,
      text: card?.innerText,
    };
  })()`);
  assert.equal(card.heading, 'Next step');
  assert.equal(card.headline, 'Next step unavailable');
  assert.match(card.glyph, /M8 2/, 'unavailable card retains the warning glyph');
  assert.doesNotMatch(card.text, /All tasks complete|tasks? for this feature (?:is|are) complete/);
}

/** @param {string[]} failures @param {() => void} assertion */
function collect(failures, assertion) {
  try {
    assertion();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

/** @param {Array<any>} nodes */
function axNodes(nodes) {
  return nodes.map((node) => ({
    name: node.name?.value ?? '',
    role: node.role?.value ?? '',
    level: node.properties?.find((property) => property.name === 'level')?.value?.value,
  }));
}

test('shipped canvas browser contract', { timeout: 120_000, concurrency: false }, async (t) => {
  const skipOrFail = (message) => {
    assert.equal(REQUIRED, false, `Required canvas browser coverage: ${message}`);
    t.skip(message);
  };
  try {
    fs.accessSync(BROWSER, fs.constants.X_OK);
  } catch {
    const message = `Browser is not executable at ${BROWSER}; set DUDE_CANVAS_BROWSER to a Chromium-family executable.`;
    if (process.env.DUDE_CANVAS_BROWSER !== undefined) assert.fail(message);
    skipOrFail(message);
    return;
  }
  if (typeof globalThis.WebSocket !== 'function') {
    skipOrFail('Global WebSocket is unavailable; use Node 22+ without --no-experimental-websocket for direct CDP coverage.');
    return;
  }
  if (!fs.existsSync(FLUENT_PACKAGE_ROOT) || !fs.existsSync(FLUENT_PACKAGE_JSON)) {
    skipOrFail('Scoped Fluent dependencies are absent; run `npm ci --prefix scripts/dude-canvas-ui` to run browser coverage.');
    return;
  }
  const artifactParent = path.resolve(process.env.DUDE_CANVAS_ARTIFACTS_DIR ?? os.tmpdir());
  fs.mkdirSync(artifactParent, { recursive: true });
  artifactRoot = fs.mkdtempSync(path.join(artifactParent, 'dude-canvas-browser-'));
  t.diagnostic(`Canvas evidence directory: ${artifactRoot}`);
  const assets = Object.fromEntries(['index.html', 'assets/app.js', 'assets/app.js.LEGAL.txt']
    .map((file) => [file, sha256(fs.readFileSync(path.join(UI_ROOT, file)))]));
  t.diagnostic(`Committed canvas asset SHA-256: ${JSON.stringify(assets)}`);
  let browserVersion = null;
  /** @type {Array<Record<string,unknown>>} */
  const screenshots = [];
  /** @type {string[]} */
  const screenshotObservations = [];
  t.after(() => {
    fs.writeFileSync(path.join(artifactRoot, 'index.json'), `${JSON.stringify({
      browser: browserVersion,
      generatedAt: new Date().toISOString(),
      assets,
      screenshots,
      observations: screenshotObservations,
    }, null, 2)}\n`);
  });
  const CHOOSER_SURFACE_TOKENS = loadChooserSurfaceTokens();
  const fixture = createFixtureServer();
  t.after(() => fixture.close());
  const base = await fixture.listen();
  const { browser, info, page, profile } = await startBrowser();
  browserVersion = info.Browser;
  t.diagnostic(`Canvas browser: ${browserVersion}; executable: ${BROWSER}`);
  /** @type {Array<{url:string}>} */
  const network = [];
  page.on('Network.requestWillBeSent', (event) => network.push({ url: event.request.url }));

  try {
    await t.test('renders complete Lightweight, Tracked, blocked, unavailable, and attention-only projections', async () => {
      // Arrange + Act
      await navigate(page, 'lightweight', 1440, 'light', base);

      // Assert
      const lightweight = await evaluate(page, `(() => ({
        main: document.querySelector('main')?.innerText,
        dock: document.querySelector('aside')?.innerText,
        status: document.querySelector('footer')?.innerText,
        regions: {
          commandBar: Boolean(document.querySelector('header')),
          rail: Boolean(document.querySelector('nav[aria-label="Surfaces"]')),
          now: Boolean(document.querySelector('main[aria-label="Now"]')),
          dock: Boolean(document.querySelector('aside[aria-label="Details"]')),
          status: Boolean(document.querySelector('footer[aria-label="Status"]')),
        },
      }))()`);
      assert.deepEqual(lightweight.regions, {
        commandBar: true, rail: true, now: true, dock: true, status: true,
      });
      for (const text of [
        'Lightweight Workspace', 'In progress', 'Verify the rendered canvas.',
        'Lifecycle', 'Phases', 'Foundation', 'Verification', 'Activity',
        'Properties', 'Evidence', 'Current complete read', '2 unanswered questions',
      ]) assert.match(`${lightweight.main}\n${lightweight.dock}\n${lightweight.status}`, new RegExp(text, 'i'));
      assert.match(lightweight.dock, /No blockers are recorded\./);
      assert.match(lightweight.status, /5 tasks make up this feature|3 done · 1 in progress/);
      assert.doesNotMatch(lightweight.main, /\bT\d{3,}@[a-z0-9]{8}\b|sha256:|\.dude\/|tasks\.md/i);
      screenshots.push(await screenshot(page, 'normal', 'lightweight', 1440, 'light', [
        'wide Fluent shell captured for approved-contract comparison',
        'complete Lightweight projection',
        'observed: Details dock is right of the workspace at the wide breakpoint',
      ]));

      await navigate(page, 'tracked', 1200, 'dark', base);
      const tracked = await evaluate(page, `document.body.innerText`);
      assert.match(tracked, /Tracked Workspace/);
      assert.match(tracked, /Inspect the exact tracked work item\./);
      assert.match(tracked, /Tracked delivery/);
      assert.match(tracked, /4 tasks make up this feature/);
      screenshots.push(await screenshot(page, 'tracked', 'tracked', 1200, 'dark', ['complete tracked authority projection']));

      await navigate(page, 'blocked', 1440, 'light', base);
      const blocked = await evaluate(page, `document.body.innerText`);
      assert.match(blocked, /Blocked Workspace/);
      assert.match(blocked, /Authoritative blocker/);
      assert.match(blocked, /Waiting for the authoritative service response\./);
      assert.match(blocked, /No canonical task is ready\./);
      await assertUnavailableCard(page);
      screenshots.push(await screenshot(page, 'blocked', 'blocked', 1440, 'light', ['blocker is named in Attention and next reason remains focal']));

      for (const [state, expected] of [
        ['malformed', 'Canonical task state is malformed.'],
        ['partial', 'A canonical projection input could not be read completely.'],
        ['conflict', 'Canonical feature state is conflicting.'],
        ['tracker-unavailable', 'Tracked authority could not be read.'],
      ]) {
        await navigate(page, state, 960, 'light', base);
        const result = await evaluate(page, `(() => ({ text: document.body.innerText, lifecycle: Boolean(document.querySelector('#lifecycle-heading')), tasks: document.querySelector('aside')?.innerText }))()`);
        assert.match(result.text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(result.text, /Next step unavailable/);
        assert.equal(result.lifecycle, false, `${state} withholds lifecycle instead of mixing partial facts`);
        assert.match(result.tasks, /Withheld|Not available from this authority/);
        await assertUnavailableCard(page);
      }
      screenshots.push(await screenshot(page, 'partial', 'partial', 960, 'light', ['incomplete projection withholds task and phase facts']));

      await navigate(page, 'mismatch', 1080, 'dark', base);
      const mismatch = await evaluate(page, `(() => ({ main: document.querySelector('main').innerText, dock: document.querySelector('aside').innerText }))()`);
      assert.match(mismatch.main, /Selected B/);
      assert.match(mismatch.main, /Tracked work is authoritative, but it has no exact issue for this feature\./);
      assert.match(mismatch.dock, /Repository attention/);
      assert.match(mismatch.dock, /Selected feature is absent from the populated tracked board\./);
      assert.doesNotMatch(mismatch.dock, /Authoritative blocker/);
      assert.doesNotMatch(`${mismatch.main}\n${mismatch.dock}`, /tracked-only-a|Markdown fallback|T001@/i);
      await assertUnavailableCard(page);
    });

    await t.test('completed cards show only the confirmed all-task summary, with accessible green treatment', async () => {
      // Arrange: the user's three-task Lightweight case covers both themes and
      // the supported narrow/wide layouts; other counts need no duplicate matrix.
      for (const [state, total, width, theme, identifier] of [
        ['complete-lightweight', 3, 1440, 'light', '052-dude-canvas-ui'],
        ['complete-lightweight', 3, 360, 'dark', '052-dude-canvas-ui'],
        ['complete-tracked', 4, 1440, 'dark', '017-feature-17'],
        ['complete-single', 1, 360, 'light', '001-feature-01'],
      ]) {
        // Act
        await navigate(page, state, width, theme, base);

        // Assert
        await assertCompletedCard(page, total);
        assert.equal(await evaluate(page, `document.querySelector('header input[role="combobox"]')?.value`), identifier);
        const ax = axNodes((await page.send('Accessibility.getFullAXTree')).nodes);
        assert.equal(ax.filter(({ role, name, level }) => role === 'heading' && name.toLowerCase() === 'complete' && level === 3).length, 1,
          `one Complete heading without an announced glyph: ${JSON.stringify(ax.filter(({ role }) => role === 'heading'))}`);
        assert.equal(ax.some(({ role }) => role === 'alert'), false, 'completion never announces an error');
        assert.equal(ax.some(({ role, name }) => role === 'img' && /warning|error|check/i.test(name)), false);
        const geometry = await evaluate(page, `(() => {
          const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
          const rect = card.getBoundingClientRect();
          return {
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            left: rect.left, right: rect.right, height: rect.height,
            clipped: [...card.querySelectorAll('h3, p')].some(node => node.scrollWidth > node.clientWidth),
            border: getComputedStyle(card).borderLeftColor,
          };
        })()`);
        assert.equal(geometry.width, width);
        assert.equal(geometry.scrollWidth, width, `${state} ${theme}: no horizontal overflow`);
        assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.height > 0);
        assert.equal(geometry.clipped, false, 'summary is not horizontally clipped');
        assert.equal(geometry.border, CHOOSER_SURFACE_TOKENS[theme].greenBorder);
        const samples = await computedContrastSamples(page, [
          { name: 'completion eyebrow', selector: '#next-heading' },
          { name: 'completion check', selector: '#next-heading svg' },
          { name: 'completion boundary', selector: '[aria-labelledby="next-heading"] .fui-Card', property: 'border-left-color' },
          { name: 'completion headline', selector: '[aria-labelledby="next-heading"] .fui-Title3' },
          { name: 'completion body', selector: '[aria-labelledby="next-heading"] .fui-Body1' },
        ]);
        const observations = [];
        for (const sample of samples) {
          if (/eyebrow|check/.test(sample.name)) {
            assert.equal(sample.foreground, CHOOSER_SURFACE_TOKENS[theme].greenForeground);
          }
          assert.match(sample.background, /^rgb\(/, 'measure against the real opaque card background');
          const ratio = contrast(sample.foreground, sample.background);
          const large = sample.fontSize >= 24 || (sample.fontSize >= 18.66 && sample.fontWeight >= 700);
          const threshold = /check|boundary/.test(sample.name) || large ? 3 : 4.5;
          assert.ok(ratio >= threshold, `${state} ${theme} ${sample.name}: ${ratio.toFixed(2)}:1 >= ${threshold}:1`);
          observations.push(`${sample.name}: ${ratio.toFixed(2)}:1 (minimum ${threshold}:1); ${sample.foreground} on ${sample.background}`);
        }
        await click(page, 'header input[role="combobox"]');
        await until(() => evaluate(page, `Boolean(document.querySelector('header [role="option"][aria-selected="true"]'))`), 'confirmed completed selection');
        assert.equal(await evaluate(page, `document.querySelector('header [role="option"][aria-selected="true"]').textContent.trim()`), identifier);
        await key(page, 'Escape');
        await until(() => evaluate(page, `document.querySelector('header input[role="combobox"]')?.getAttribute('aria-expanded') === 'false'`), 'completed chooser closed');
        observations.push(`Confirmed ${identifier}; ${width}px; card ${JSON.stringify(geometry)}; decorative check; no warning, Why, current phase, or divider`);
        screenshots.push(await screenshot(page, 'completed', state, width, theme, observations));
      }
    });

    await t.test('no next step without completed execution never claims all tasks complete', async () => {
      // Arrange
      for (const [state, reason] of [
        ['definition-only', 'No canonical task execution evidence exists yet.'],
        ['resolved', 'This idea is resolved.'],
        ['tracked-waiting', 'No supported next tracked task is currently established.'],
        ['tracked-no-executable-tasks', 'No supported next tracked task is currently established.'],
      ]) {
        // Act
        await navigate(page, state, 1200, 'light', base);

        // Assert
        await assertUnavailableCard(page);
        const text = await evaluate(page, `document.querySelector('section[aria-labelledby="next-heading"]').innerText`);
        assert.ok(text.includes(reason), `${state}: existing reason remains visible`);
        assert.match(text, /Why/i);
      }
    });

    await t.test('next-step formatting keeps T013 source exact, concise, accessible, and responsive', async () => {
      // Arrange
      await navigate(page, 't013-next', 1440, 'light', base);

      // Act
      const primary = await evaluate(page, `(() => {
        const region = document.querySelector('section[aria-labelledby="next-heading"]');
        const card = region?.querySelector('.fui-Card');
        const headline = card?.querySelector('.fui-Title3');
        const cue = [...(card?.querySelectorAll('.fui-Caption1') ?? [])]
          .find((node) => node.textContent.trim() === 'Full next-step text is available in Evidence.');
        if (!region || !card || !headline || !cue) throw new Error('T013 Next Card structure is incomplete');
        const visible = (node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };
        cue.focus();
        return {
          cardText: card.innerText,
          controls: card.querySelectorAll(
            'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
          ).length,
          cue: {
            className: cue.className,
            focused: document.activeElement === cue,
            tabIndex: cue.tabIndex,
            text: cue.innerText,
            visible: visible(cue),
          },
          headline: {
            className: headline.className,
            tag: headline.tagName,
            text: headline.innerText,
            visible: visible(headline),
          },
          headingCount: region.querySelectorAll('h3#next-heading').length,
          headingText: region.querySelector('h3#next-heading')?.textContent.trim(),
        };
      })()`);

      // Assert
      assert.equal(primary.headline.tag, 'P');
      assert.match(primary.headline.className, /\bfui-Title3\b/);
      assert.equal(primary.headline.text, 'Run final unchanged-revision verification.');
      assert.equal(primary.headline.visible, true);
      assert.match(primary.cue.className, /\bfui-Caption1\b/);
      assert.equal(primary.cue.text, 'Full next-step text is available in Evidence.');
      assert.equal(primary.cue.visible, true);
      assert.equal(primary.cue.tabIndex, -1);
      assert.equal(primary.cue.focused, false);
      assert.equal(primary.controls, 0, 'formatting adds no Next Card interaction');
      assert.equal(primary.headingCount, 1);
      assert.equal(primary.headingText, 'Next step');
      for (const [pattern, label] of [
        [/After task/i, 'projected dependency scaffold'],
        [/`/, 'raw inline-code backtick'],
        [/\bnpm ci\b/i, 'install command'],
        [/frontend\/\*\*/i, 'frontend glob'],
        [/\bT\d{3,}@[a-z0-9]{8}\b/i, 'task key'],
        [/\b(?:sha(?:1|256|512):)?[a-f0-9]{64}\b/i, 'content hash'],
        [/\b(?:FR|SC|VSC)-\d+\b/i, 'requirement marker'],
        [/focused extension\/engine tests|two clean scoped builds|dependency\/license audit|development\/release\/consumer inspection|leave package 025/i, 'tail checklist'],
      ]) {
        assert.doesNotMatch(primary.cardText, pattern, `primary Next Card omits ${label}`);
      }

      const evidenceSelector = 'section[aria-labelledby="evidence-heading"] button';
      await focus(page, evidenceSelector);
      assert.equal((await activeElement(page)).text, 'Source details');
      await key(page, 'Enter');
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(evidenceSelector)})?.getAttribute('aria-expanded') === 'true'`),
        'keyboard-expanded T013 source details',
      );
      const keyboardEvidence = await evaluate(page, `(() => {
        const section = document.querySelector('section[aria-labelledby="evidence-heading"]');
        const label = [...section.querySelectorAll('dt')]
          .find((node) => node.textContent.trim() === 'Next source');
        const code = label?.nextElementSibling?.querySelector('code');
        if (!code) throw new Error('Next source evidence row is missing');
        return {
          expanded: section.querySelector('button')?.getAttribute('aria-expanded'),
          sourceText: code.textContent,
          visibleText: section.innerText,
        };
      })()`);
      assert.equal(keyboardEvidence.expanded, 'true');
      assert.equal(keyboardEvidence.sourceText, JSON.stringify(T013_NEXT_SOURCE));
      assert.deepEqual(JSON.parse(keyboardEvidence.sourceText), T013_NEXT_SOURCE);
      assert.ok(keyboardEvidence.visibleText.includes(T013_SOURCE_DESCRIPTION));
      const expandedAx = axNodes((await page.send('Accessibility.getFullAXTree')).nodes);
      assert.ok(
        expandedAx.some((node) => node.name.includes(T013_SOURCE_DESCRIPTION)),
        'AX text exposes the exact unsanitized canonical T013 source description',
      );
      assert.equal(
        expandedAx.filter((node) => (
          node.role === 'heading' && node.level === 3 && node.name.toLowerCase() === 'next step'
        )).length,
        1,
        'AX exposes one level-3 Next step heading',
      );

      await key(page, 'Enter');
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(evidenceSelector)})?.getAttribute('aria-expanded') === 'false'`),
        'keyboard-collapsed T013 source details',
      );
      await click(page, evidenceSelector);
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(evidenceSelector)})?.getAttribute('aria-expanded') === 'true'`),
        'click-expanded T013 source details',
      );
      assert.equal(
        await evaluate(page, `(() => {
          const label = [...document.querySelectorAll('section[aria-labelledby="evidence-heading"] dt')]
            .find((node) => node.textContent.trim() === 'Next source');
          return label?.nextElementSibling?.querySelector('code')?.textContent;
        })()`),
        JSON.stringify(T013_NEXT_SOURCE),
        'click expansion exposes the same exact source bytes',
      );

      for (const [fixtureName, expected] of [
        ['lightweight', 'Verify the rendered canvas.'],
        ['tracked', 'Inspect the exact tracked work item.'],
      ]) {
        await navigate(page, fixtureName, 760, 'light', base);
        const short = await evaluate(page, `(() => {
          const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
          return {
            cueCount: [...card.querySelectorAll('.fui-Caption1')]
              .filter((node) => node.textContent.trim() === 'Full next-step text is available in Evidence.').length,
            headline: card.querySelector('.fui-Title3')?.innerText,
          };
        })()`);
        assert.equal(short.headline, expected, `${fixtureName} short description remains exact`);
        assert.equal(short.cueCount, 0, `${fixtureName} short description has no condensation cue`);
      }

      await navigate(page, 'structured-next', 760, 'light', base);
      const structured = await evaluate(page, `(() => {
        const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
        return {
          headline: card.querySelector('.fui-Title3')?.innerText,
          cue: [...card.querySelectorAll('.fui-Caption1')]
            .find((node) => node.textContent.trim() === 'Full next-step text is available in Evidence.')?.innerText,
          text: card.innerText,
        };
      })()`);
      assert.equal(structured.headline, 'Review the current release evidence.');
      assert.equal(structured.cue, 'Full next-step text is available in Evidence.');
      assert.doesNotMatch(structured.text, /compare both deterministic builds|reviewed legal notice/i);

      await navigate(page, 'unsafe-next', 360, 'light', base);
      const unsafe = await evaluate(page, `(() => {
        const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
        const headline = card.querySelector('.fui-Title3');
        const cardRect = card.getBoundingClientRect();
        const headlineRect = headline.getBoundingClientRect();
        const style = getComputedStyle(headline);
        return {
          card: {
            clientWidth: card.clientWidth,
            left: cardRect.left,
            right: cardRect.right,
            scrollWidth: card.scrollWidth,
          },
          cueCount: [...card.querySelectorAll('.fui-Caption1')]
            .filter((node) => node.textContent.trim() === 'Full next-step text is available in Evidence.').length,
          document: {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          },
          headline: {
            clientHeight: headline.clientHeight,
            clientWidth: headline.clientWidth,
            left: headlineRect.left,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            right: headlineRect.right,
            scrollHeight: headline.scrollHeight,
            scrollWidth: headline.scrollWidth,
            text: headline.innerText,
            textOverflow: style.textOverflow,
            webkitLineClamp: style.webkitLineClamp,
          },
        };
      })()`);
      assert.equal(unsafe.headline.text, UNSAFE_UNSTRUCTURED_VISIBLE);
      assert.equal(unsafe.cueCount, 0);
      assert.doesNotMatch(unsafe.headline.text, /`/);
      assert.equal(unsafe.document.scrollWidth, unsafe.document.clientWidth);
      assert.ok(unsafe.card.scrollWidth <= unsafe.card.clientWidth);
      assert.ok(unsafe.headline.scrollWidth <= unsafe.headline.clientWidth);
      assert.ok(unsafe.headline.scrollHeight <= unsafe.headline.clientHeight + 1);
      assert.ok(unsafe.headline.left >= unsafe.card.left - 1 && unsafe.headline.right <= unsafe.card.right + 1);
      assert.notEqual(unsafe.headline.textOverflow, 'ellipsis');
      assert.ok(!['clip', 'hidden'].includes(unsafe.headline.overflowX));
      assert.ok(!['clip', 'hidden'].includes(unsafe.headline.overflowY));
      assert.ok(!unsafe.headline.webkitLineClamp || unsafe.headline.webkitLineClamp === 'none');

      await navigate(page, 'unsafe-next', 720, 'light', base);
      let zoomGeometry;
      await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      try {
        zoomGeometry = await evaluate(page, `(() => {
          const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
          const headline = card.querySelector('.fui-Title3');
          const cardRect = card.getBoundingClientRect();
          const headlineRect = headline.getBoundingClientRect();
          return {
            card: { clientWidth: card.clientWidth, left: cardRect.left, right: cardRect.right, scrollWidth: card.scrollWidth },
            document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
            headline: { left: headlineRect.left, right: headlineRect.right, text: headline.innerText },
            scale: visualViewport.scale,
          };
        })()`);
      } finally {
        await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      }
      assert.equal(zoomGeometry.scale, 2);
      assert.equal(zoomGeometry.headline.text, UNSAFE_UNSTRUCTURED_VISIBLE);
      assert.equal(zoomGeometry.document.scrollWidth, zoomGeometry.document.clientWidth);
      assert.ok(zoomGeometry.card.scrollWidth <= zoomGeometry.card.clientWidth);
      assert.ok(
        zoomGeometry.headline.left >= zoomGeometry.card.left - 1
          && zoomGeometry.headline.right <= zoomGeometry.card.right + 1,
        'unsafe unstructured fallback remains inside its Card at 200% equivalence',
      );

      /** @type {string[]} */
      const overflowFailures = [];
      for (const width of [360, 606, 760, 1375, 1440]) {
        await navigate(page, 't013-next', width, 'light', base);
        const geometry = await evaluate(page, `(() => {
          const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
          const headline = card.querySelector('.fui-Title3');
          const cue = [...card.querySelectorAll('.fui-Caption1')]
            .find((node) => node.textContent.trim() === 'Full next-step text is available in Evidence.');
          const cardRect = card.getBoundingClientRect();
          const headlineRect = headline.getBoundingClientRect();
          const cueRect = cue.getBoundingClientRect();
          return {
            card: { clientWidth: card.clientWidth, left: cardRect.left, right: cardRect.right, scrollWidth: card.scrollWidth },
            cue: { left: cueRect.left, right: cueRect.right },
            document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
            headline: { left: headlineRect.left, right: headlineRect.right },
          };
        })()`);
        collect(overflowFailures, () => assert.equal(
          geometry.document.scrollWidth,
          geometry.document.clientWidth,
          `${width}px: page has no horizontal overflow`,
        ));
        collect(overflowFailures, () => assert.ok(
          geometry.card.scrollWidth <= geometry.card.clientWidth,
          `${width}px: Next Card has no horizontal overflow`,
        ));
        for (const [name, rect] of [['headline', geometry.headline], ['cue', geometry.cue]]) {
          collect(overflowFailures, () => assert.ok(
            rect.left >= geometry.card.left - 1 && rect.right <= geometry.card.right + 1,
            `${width}px: ${name} remains inside the Next Card`,
          ));
        }
        collect(overflowFailures, () => assert.ok(
          geometry.card.left >= -1 && geometry.card.right <= geometry.document.clientWidth + 1,
          `${width}px: Next Card remains inside the page`,
        ));
      }
      assert.deepEqual(overflowFailures, [], overflowFailures.join('\n\n'));

      await navigate(page, 't013-next', 760, 'light', base, 900, true);
      const forcedColors = await evaluate(page, `(() => {
        const card = document.querySelector('section[aria-labelledby="next-heading"] .fui-Card');
        const heading = card.querySelector('#next-heading');
        const headline = card.querySelector('.fui-Title3');
        const cue = [...card.querySelectorAll('.fui-Caption1')]
          .find((node) => node.textContent.trim() === 'Full next-step text is available in Evidence.');
        const visible = (node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden'
            && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
        };
        const style = getComputedStyle(card);
        return {
          active: matchMedia('(forced-colors: active)').matches,
          borderLeftStyle: style.borderLeftStyle,
          borderLeftWidth: style.borderLeftWidth,
          cueText: cue?.innerText,
          visible: [card, heading, headline, cue].every((node) => node && visible(node)),
        };
      })()`);
      assert.equal(forcedColors.active, true);
      assert.equal(forcedColors.visible, true);
      assert.equal(forcedColors.cueText, 'Full next-step text is available in Evidence.');
      assert.notEqual(forcedColors.borderLeftStyle, 'none');
      assert.ok(Number.parseFloat(forcedColors.borderLeftWidth) > 0);
    });

    await t.test('canonical 50-row chooser reports the complete inventory everywhere', async () => {
      // Arrange: every row is reachable through canonical inventory.
      assert.equal(MANY_CHOICES.length, 50);
      await navigate(page, 'chooser', 760, 'light', base);
      await click(page, 'header input[role="combobox"]');
      await until(
        () => evaluate(page, `document.querySelector('header input[role="combobox"]')?.getAttribute('aria-expanded') === 'true'`),
        'first-click command-bar chooser opening',
      );

      // Assert: the initial choice has no default and is a five-row scroll viewport.
      const initial = await evaluate(page, `(() => {
        const input = document.querySelector('header input[role="combobox"]');
        const listbox = document.querySelector('header [role="listbox"]');
        const first = listbox?.querySelector('[role="option"]');
        return {
          inputValue: input?.value,
          listboxHeight: Math.round(listbox?.getBoundingClientRect().height ?? 0),
          listboxScrollHeight: listbox?.scrollHeight ?? 0,
          optionCount: listbox?.querySelectorAll('[role="option"]').length ?? 0,
          options: [...(listbox?.querySelectorAll('[role="option"]') ?? [])].map((node) => node.textContent.trim()),
          placeholder: input?.getAttribute('placeholder'),
          properties: document.querySelector('[aria-labelledby="properties-heading"]')?.textContent.trim(),
          rowHeight: Math.round(first?.getBoundingClientRect().height ?? 0),
          text: document.body.innerText,
          chooserStatus: [...(document.querySelectorAll('header [aria-live]') ?? [])].map((node) => ({
            describedBy: input?.getAttribute('aria-describedby'),
            id: node.id,
            live: node.getAttribute('aria-live'),
            role: node.getAttribute('role'),
            text: node.textContent.trim(),
          })),
          ariaAutocomplete: input?.getAttribute('aria-autocomplete'),
        };
      })()`);
      assert.match(initial.text, /Choose a feature/);
      const reportedCounts = {
        pageFact: initial.text.match(/(\d+) features from the complete projected inventory/)?.[1],
        placeholder: initial.placeholder?.match(/^Choose from (\d+) features$/)?.[1],
        summaryBand: initial.chooserStatus[0]?.text.match(/^(\d+) features\. Scroll or type to narrow them\.$/)?.[1],
        list: String(initial.optionCount),
        properties: initial.properties?.match(/Features(\d+) available/)?.[1],
      };
      assert.deepEqual(
        reportedCounts,
        { pageFact: '50', placeholder: '50', summaryBand: '50', list: '50', properties: '50' },
        'page fact, placeholder, summary band, list, and Properties dock agree on the complete inventory',
      );
      assert.match(initial.text, /50 features\. Scroll or type to narrow them\./);
      assert.match(
        initial.text,
        /Scroll the list to reach any feature, or type a number or name to filter it—for example, 052 or dude\./,
      );
      assert.match(
        initial.text,
        /CANONICAL IDENTIFIER\s*Number and name exactly as filed; the slug remains the internal target\./,
      );
      assert.doesNotMatch(initial.text, /(?:slug-only|type a slug|filter by slug)/i);
      assert.equal(initial.inputValue, '', 'chooser has no default value');
      assert.equal(initial.placeholder, 'Choose from 50 features');
      assert.equal(initial.optionCount, 50, 'the complete projected inventory is in the DOM');
      assert.equal(initial.options[0], '001-feature-01', 'the first visible choice derives its canonical identifier from ideaPath');
      assert.equal(initial.options[47], '052-dude-canvas-ui', 'the 48th visible choice uses the exact canvas idea identifier');
      assert.doesNotMatch(initial.text, /\.dude\/ideas\//, 'the chooser does not disclose raw idea paths');
      assert.match(initial.text, /50 features from the complete projected inventory/, 'page count shares the canonical valid choices');
      assert.match(initial.properties, /PropertiesFeatures50 availableSelectedNone/, 'Properties dock shares the canonical valid-choice count');
      assert.equal(initial.ariaAutocomplete, 'list', 'the editable combobox declares list autocomplete');
      assert.equal(initial.chooserStatus.length, 1, 'the Field hint root is the one stable chooser live region');
      assert.deepEqual(
        initial.chooserStatus[0] && {
          live: initial.chooserStatus[0].live,
          role: initial.chooserStatus[0].role,
          text: initial.chooserStatus[0].text,
        },
        {
          live: 'polite',
          role: 'status',
          text: '50 features. Scroll or type to narrow them.',
        },
      );
      assert.ok(
        initial.chooserStatus[0]?.id && initial.chooserStatus[0].describedBy?.split(/\s+/).includes(initial.chooserStatus[0].id),
        `combobox aria-describedby must reference its Field hint root: ${JSON.stringify(initial.chooserStatus)}`,
      );
      const optionNames = axNodes((await page.send('Accessibility.getFullAXTree')).nodes)
        .filter((node) => node.role === 'option')
        .map((node) => node.name);
      assert.equal(optionNames[0], '001-feature-01', 'the first option AX name is canonical');
      assert.equal(optionNames[47], '052-dude-canvas-ui', 'the 48th option AX name is canonical');
      assert.ok(initial.rowHeight > 0, 'the option row has a measurable shared token height');
      assert.equal(initial.listboxHeight, initial.rowHeight * 5, 'five token-sized rows are visible in the default viewport');
      assert.ok(initial.listboxScrollHeight > initial.listboxHeight, 'the complete list is scrollable');
      screenshots.push(await screenshot(page, 'chooser', 'chooser', 760, 'light', [
        '50 options rendered in the command-bar listbox',
        'five 36px rows visible; remaining options are reachable by scrolling',
      ]));

      // Act + Assert: a real wheel scroll reaches the 48th (zero-based index 47) choice.
      const listboxPoint = await evaluate(page, `(() => {
        const rect = document.querySelector('header [role="listbox"]')?.getBoundingClientRect();
        return rect && { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
      })()`);
      assert.ok(listboxPoint, 'open direct chooser has a listbox to scroll');
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: listboxPoint.x,
        y: listboxPoint.y,
        deltaX: 0,
        deltaY: 2_000,
      });
      await until(
        () => evaluate(page, `(() => {
          const listbox = document.querySelector('header [role="listbox"]');
          const option = [...document.querySelectorAll('header [role="option"]')]
            .find((node) => node.textContent.trim() === '052-dude-canvas-ui');
          if (!listbox || !option) return false;
          const box = listbox.getBoundingClientRect();
          const row = option.getBoundingClientRect();
          return listbox.scrollTop > 0 && row.top >= box.top && row.bottom <= box.bottom;
        })()`),
        'scroll reachability for 052-dude-canvas-ui',
      );

      for (const [query, expected] of [
        ['052', '052-dude-canvas-ui'],
        ['dude', '052-dude-canvas-ui'],
        ['slug', '053-feature-slug-target'],
      ]) {
        await page.send('Input.insertText', { text: query });
        await until(
          () => evaluate(page, `document.body.innerText.includes(${JSON.stringify(`1 of 50 features match "${query}".`)})`),
          `${query} filter summary`,
        );
        assert.deepEqual(
          await evaluate(page, `[...document.querySelectorAll('header [role="option"]')].map((node) => node.textContent.trim())`),
          [expected],
          `${query} filter retains the canonical matching option`,
        );
        await key(page, 'Escape');
        await until(
          () => evaluate(page, `(() => {
            const input = document.querySelector('header input[role="combobox"]');
            return input?.value === ''
              && input.getAttribute('aria-expanded') === 'true'
              && document.querySelector('header [aria-live]')?.textContent.trim() === '50 features. Scroll or type to narrow them.';
          })()`),
          `${query} filter clear`,
        );
      }

      // Act: a punctuation-only query must remain text in the same count live region.
      await evaluate(page, `(() => {
        const summary = document.querySelector('header [aria-live]');
        if (!summary) throw new Error('Missing no-query summary live region');
        window.__dudeCanvasSummary = summary;
      })()`);
      await page.send('Input.insertText', { text: '<&' });
      await until(
        () => evaluate(page, `document.querySelector('header [aria-live]')?.textContent.trim() === '0 of 50 features match "<&".'`),
        'escaped zero-match count',
      );
      const escaped = await evaluate(page, `(() => {
        const summary = document.querySelector('header [aria-live]');
        const empty = [...document.querySelectorAll('header *')].find((node) => (
          node.textContent.trim() === 'No features match "<&".'
          && getComputedStyle(node).position === 'absolute'
        ));
        return {
          emptyClosestLive: empty?.closest('[aria-live]')?.getAttribute('aria-live'),
          emptyChildElements: empty?.childElementCount,
          emptyHtml: empty?.innerHTML,
          emptyLive: empty?.getAttribute('aria-live'),
          emptyRole: empty?.getAttribute('role'),
          liveText: [...document.querySelectorAll('header [aria-live]')].map((node) => node.textContent.trim()),
          summaryChildElements: summary?.childElementCount,
          summaryHtml: summary?.innerHTML,
          summaryIsStable: summary === window.__dudeCanvasSummary,
        };
      })()`);
      assert.equal(escaped.summaryIsStable, true, 'filtering updates the existing summary live node');
      assert.deepEqual(
        escaped.liveText,
        ['0 of 50 features match "<&".'],
        'the stable summary root retains the exact zero-result count copy',
      );
      assert.equal(escaped.summaryChildElements, 1, 'the hint root holds one non-live text child');
      assert.equal(escaped.emptyChildElements, 0, 'zero-match explanation treats query punctuation as text');
      assert.equal(escaped.emptyLive, null, 'zero-match caption is not itself live');
      assert.equal(escaped.emptyClosestLive, undefined, 'zero-match caption is outside the hint live region');
      assert.notEqual(escaped.emptyRole, 'status', 'zero-match caption is not another status role');
      assert.match(escaped.summaryHtml, /&lt;&amp;/);
      assert.match(escaped.emptyHtml, /&lt;&amp;/);
      await key(page, 'Escape');
      await until(
        () => evaluate(page, `document.querySelector('header input[role="combobox"]')?.value === ''
          && document.querySelector('header [aria-live]')?.textContent.trim() === '50 features. Scroll or type to narrow them.'`),
        'escaped query clear',
      );

      // Act: select a different exact filtered slug that completes successfully.
      await page.send('Input.insertText', { text: 'feature-17' });
      await until(
        () => evaluate(page, `document.body.innerText.includes('1 of 50 features match "feature-17".')`),
        'exact selection filter',
      );
      await key(page, 'ArrowDown');
      await key(page, 'Enter');
      await fixture.waitForRefresh('chooser');
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'Reading 017-feature-17.')`),
        true,
        'selection reads announce the canonical numbered identifier before the request resolves',
      );
      assert.deepEqual(
        fixture.observations.refreshes.at(-1),
        { fixture: 'chooser', body: { target: 'feature-17' } },
        'selection sends the exact slug rather than the visible canonical identifier',
      );
      fixture.releaseRefresh('chooser');
      await until(() => evaluate(page, `document.querySelector('#feature-heading')?.textContent?.includes('Feature 17')`), 'selected feature render');
      assert.equal((await activeElement(page)).id, 'feature-heading', 'successful selection moves focus to identity heading');
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'Opened 017-feature-17.')`),
        true,
        'successful selection announces the opened canonical numbered identifier',
      );
    });

    /** @param {number} width @param {'light'|'dark'} theme */
    async function selectedOpenJourney(width, theme) {
      // Arrange
      await navigate(page, 'selected', width, theme, base);
      const inputSelector = 'header input[role="combobox"]';
      /** @type {string[]} */
      const observations = [];
      const selectedRefreshes = () => fixture.observations.refreshes
        .filter((refresh) => refresh.fixture === 'selected').length;
      const initial = await evaluate(page, `(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        return {
          expanded: input?.getAttribute('aria-expanded'),
          value: input?.value,
        };
      })()`);

      // Act: the first pointer interaction opens the committed selection's full inventory.
      await click(page, inputSelector, observations);
      await until(
        () => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 50`),
        'selected 052 opens all valid inventory choices',
      );
      await settleBrowserWork(page);
      const opened = await evaluate(page, `(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        const option = [...document.querySelectorAll('header [role="option"]')]
          .find((node) => node.textContent.trim() === '052-dude-canvas-ui');
        const check = option?.querySelector('.fui-Option__checkIcon');
        const style = option && getComputedStyle(option);
        const listbox = document.querySelector('header [role="listbox"]');
        const box = listbox?.getBoundingClientRect();
        const row = option?.getBoundingClientRect();
        // clientWidth/Height round to integers; preserve the fractional box
        // edge while subtracting borders and any reserved scrollbar space.
        const scrollport = box && {
          top: box.top + listbox.clientTop,
          bottom: box.bottom - (listbox.offsetHeight - listbox.clientHeight - listbox.clientTop),
          left: box.left + listbox.clientLeft,
          right: box.right - (listbox.offsetWidth - listbox.clientWidth - listbox.clientLeft),
        };
        return {
          check: check && {
            color: getComputedStyle(check).color,
            visible: Boolean(check.getBoundingClientRect().width),
          },
          expanded: input?.getAttribute('aria-expanded'),
          fill: style?.backgroundColor,
          selected: option?.getAttribute('aria-selected'),
          summary: document.querySelector('header [role="status"]')?.textContent.trim(),
          visible: Boolean(scrollport && row
            && row.top >= scrollport.top && row.bottom <= scrollport.bottom
            && row.left >= scrollport.left && row.right <= scrollport.right),
          row: row?.toJSON(),
          listbox: box?.toJSON(),
          scrollport,
          viewport: { width: innerWidth, height: innerHeight },
          document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
          listWidth: { scroll: listbox.scrollWidth, client: listbox.clientWidth },
          identifiers: [...listbox.querySelectorAll('[role="option"]')].map((node) => node.textContent.trim()),
          selectedLabel: (() => {
            const label = option.querySelector('span:last-child');
            return { scroll: label.scrollWidth, client: label.clientWidth };
          })(),
          // Below-the-fold facts remain scrollable; only the selected row must
          // fit vertically in the viewport. Other inventory rows may scroll away.
          content: [...document.querySelectorAll(
            '#feature-heading, #feature-heading + span, main section, main p, main h3, aside section, aside p, aside h3, aside dl, footer'
          )].map((node) => ({
            name: node.id || node.getAttribute('aria-labelledby') || node.tagName,
            rect: node.getBoundingClientRect().toJSON(),
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
            scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
          })),
        };
      })()`);
      observations.push(`selected-open ${width}/${theme}: ${JSON.stringify(opened)}`);
      // Capture before assertions too, so a geometry failure retains its image.
      screenshots.push(await screenshot(page, 'selected-open', 'selected', width, theme, observations));

      // Assert
      assert.deepEqual(initial, { expanded: 'false', value: '052-dude-canvas-ui' });
      assert.equal(opened.expanded, 'true');
      assert.equal(opened.selected, 'true', 'the committed row remains selected while browsing');
      assert.equal(opened.visible, true, `opening scrolls the full committed 052 row into view: ${JSON.stringify({ row: opened.row, scrollport: opened.scrollport })}`);
      assert.equal(opened.check?.visible, true, 'the committed row renders Fluent’s selection check');
      assert.equal(opened.check?.color, CHOOSER_SURFACE_TOKENS[theme].brandForeground, 'the local selected check uses brand foreground');
      assert.equal(opened.fill, CHOOSER_SURFACE_TOKENS[theme].selected, 'the committed row retains its selected fill');
      assert.equal(opened.summary, '50 features. 052-dude-canvas-ui is selected. Scroll or type to narrow them.');
      assert.deepEqual(opened.identifiers, MANY_CHOICES.map(({ ideaPath }) => path.basename(ideaPath, '.md')),
        'the complete canonical inventory stays ordered, including offscreen rows');
      for (const [name, rect] of Object.entries({ row: opened.row, listbox: opened.listbox })) {
        assert.ok(rect && rect.left >= 0 && rect.top >= 0
          && rect.right <= opened.viewport.width && rect.bottom <= opened.viewport.height,
        `${width}/${theme}: full ${name} fits the viewport: ${JSON.stringify(rect)}`);
      }
      assert.equal(opened.document.scrollWidth, opened.document.clientWidth, 'no page horizontal overflow');
      assert.equal(opened.listWidth.scroll, opened.listWidth.client, 'no listbox horizontal overflow');
      assert.equal(opened.selectedLabel.scroll, opened.selectedLabel.client, 'the current 052 label is fully visible');
      for (const name of ['feature-heading', 'next-heading', 'lifecycle-heading', 'phases-heading',
        'activity-heading', 'attention-heading', 'freshness-heading', 'properties-heading', 'evidence-heading', 'FOOTER']) {
        assert.ok(opened.content.some((content) => content.name === name), `required content is measured: ${name}`);
      }
      for (const content of opened.content) {
        assert.ok(content.rect.width > 0 && content.rect.height > 0
          && content.rect.left >= 0 && content.rect.right <= width
          && content.scrollWidth <= content.clientWidth
          && content.scrollHeight <= content.clientHeight,
        `${width}/${theme}: essential content has no clipping: ${JSON.stringify(content)}`);
      }
      const optionNames = axNodes((await page.send('Accessibility.getFullAXTree')).nodes)
        .filter((node) => node.role === 'option').map((node) => node.name);
      assert.ok(optionNames.includes('052-dude-canvas-ui'), 'AX exposes the committed canonical identity');
      assert.ok(optionNames.includes(LONG_CANONICAL_IDENTIFIER), 'intentional long-label ellipsis retains full AX identity');
      await measuredPointer(page, 'header [role="option"][aria-selected="true"]', observations);
      await measuredPointer(page, inputSelector, observations);

      // Act + Assert: typing replaces (rather than appends to) the committed value, and Escape restores it.
      await page.send('Input.insertText', { text: 'dude' });
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.value === 'dude'`),
        'typing replaces committed selected display',
      );
      assert.deepEqual(
        await evaluate(page, `[...document.querySelectorAll('header [role="option"]')].map((node) => node.textContent.trim())`),
        ['052-dude-canvas-ui'],
        'typing a name filters the canonical identifier',
      );
      await key(page, 'Escape');
      await until(
        () => evaluate(page, `(() => {
          const input = document.querySelector(${JSON.stringify(inputSelector)});
          return input?.value === '052-dude-canvas-ui' && input.getAttribute('aria-expanded') === 'true';
        })()`),
        'first Escape restores committed selected display and keeps browsing open',
      );
      await key(page, 'Escape');
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded') === 'false'`),
        'second Escape closes the restored chooser',
      );
      // Dismiss the popup before measuring underlying controls it can cover.
      await measuredPointer(page, 'header button', observations);
      await measuredPointer(page, 'button[aria-label="Now, the open surface"]', observations);

      // Native Tab must not commit the active row or steal focus later.
      await click(page, inputSelector, observations);
      await key(page, 'End');
      await key(page, 'ArrowUp');
      await key(page, 'ArrowUp');
      assert.equal(await evaluate(page, `document.querySelector('header [role="option"][data-activedescendant-focusvisible]')?.textContent.trim()`),
        '052-dude-canvas-ui', 'the committed row is active before Tab');
      const beforeTab = selectedRefreshes();
      await key(page, 'Tab');
      assert.equal((await activeElement(page)).text, 'Refresh', 'Tab immediately reaches Refresh');
      await settleBrowserWork(page);
      assert.equal((await activeElement(page)).text, 'Refresh', 'Tab does not trigger deferred focus restoration');
      assert.equal(selectedRefreshes(), beforeTab, 'Tab never issues a selection refresh');
      assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)}).value`), '052-dude-canvas-ui');
      assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)}).getAttribute('aria-expanded')`), 'false');

      // Act: a pointer selection that the server refuses cannot replace 052.
      await click(page, inputSelector, observations);
      await until(
        () => evaluate(page, `document.querySelector('header [role="option"][aria-selected="true"]')?.textContent.trim() === '052-dude-canvas-ui'`),
        'reopened selected 052 row',
      );
      await settleBrowserWork(page);
      await click(page, 'header [role="option"][aria-selected="true"]', observations);
      await fixture.waitForRefresh('selected');
      assert.deepEqual(
        fixture.observations.refreshes.at(-1),
        { fixture: 'selected', body: { target: 'dude-canvas-ui' } },
        'pointer selection submits the semantic slug, never the display label',
      );
      fixture.releaseRefresh('selected');
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-invalid') === 'true'`),
        'refused selected target restores the chooser',
      );
      const refused = await evaluate(page, `(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        const option = document.querySelector('header [role="option"][aria-selected="true"]');
        return {
          heading: document.querySelector('#feature-heading')?.textContent?.trim(),
          inputValue: input?.value,
          selected: option?.textContent?.trim(),
          status: [...document.querySelectorAll('header [role="status"]')].map((node) => node.textContent.trim()),
        };
      })()`);
      assert.equal(refused.heading, 'Dude Canvas Ui');
      assert.equal(refused.inputValue, '052-dude-canvas-ui', 'a refused selected target restores the committed display');
      assert.equal(refused.selected, '052-dude-canvas-ui', 'the reopened row remains the committed current selection');
      assert.ok(
        refused.status.some((text) => text === '052-dude-canvas-ui could not be opened. 052-dude-canvas-ui is still the open feature.'),
        `selected refusal is truthful: ${JSON.stringify(refused)}`,
      );

      // Act: a keyboard selection that succeeds replaces the committed projection and moves focus.
      await page.send('Input.insertText', { text: 'feature-17' });
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.value === 'feature-17'`),
        'replacement query after refusal',
      );
      await key(page, 'ArrowDown');
      await key(page, 'Enter');
      await fixture.waitForRefresh('selected');
      assert.deepEqual(
        fixture.observations.refreshes.at(-1),
        { fixture: 'selected', body: { target: 'feature-17' } },
        'keyboard selection also submits only the semantic slug',
      );
      fixture.releaseRefresh('selected');
      await until(
        () => evaluate(page, `document.querySelector('#feature-heading')?.textContent?.includes('Feature 17')`),
        'successful selected target replacement',
      );
      assert.equal((await activeElement(page)).id, 'feature-heading', 'a successful replacement moves focus to its heading');
      assert.equal(
        await evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.value`),
        '017-feature-17',
        'only the accepted projection commits the replacement display label',
      );

      // The remaining current control may be below the fold; scroll it into
      // reach rather than treating ordinary document scrolling as clipping.
      const sourceSelector = '[aria-labelledby="evidence-heading"] button';
      await evaluate(page, `document.querySelector(${JSON.stringify(sourceSelector)}).scrollIntoView({ block: 'center' })`);
      await settleBrowserWork(page);
      await click(page, sourceSelector, observations);
      assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(sourceSelector)}).getAttribute('aria-expanded')`), 'true');
      await click(page, sourceSelector, observations);
      assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(sourceSelector)}).getAttribute('aria-expanded')`), 'false');
    }

    for (const theme of /** @type {const} */ (['light', 'dark'])) {
      for (const width of [360, 760, 1440]) {
        await t.test(`selected-open ${width}px ${theme}: keeps 052 committed while browsing, refusing, and replacing a target`,
          () => selectedOpenJourney(width, theme));
      }
    }

    await t.test('Tab closes an active listed selected row without refresh or focus hijack', async () => {
      // Arrange: a complete selected projection has its listed 052 row active.
      await navigate(page, 'selected', 760, 'light', base);
      const inputSelector = 'header input[role="combobox"]';
      const selectedRefreshes = () => fixture.observations.refreshes
        .filter((refresh) => refresh.fixture === 'selected').length;
      await click(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 50`),
        'open full selected inventory before Tab',
      );
      await key(page, 'End');
      await key(page, 'ArrowUp');
      await key(page, 'ArrowUp');
      await until(
        () => evaluate(page, `(() => {
          const option = document.querySelector('header [role="option"][data-activedescendant-focusvisible]');
          return option?.textContent.trim() === '052-dude-canvas-ui'
            && option.getAttribute('aria-selected') === 'true';
        })()`),
        'current 052 row is active before Tab',
      );
      const listedBefore = await evaluate(page, `(() => ({
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        inputValue: document.querySelector(${JSON.stringify(inputSelector)})?.value,
        main: document.querySelector('main')?.innerText,
      }))()`);
      const listedRefreshesBefore = selectedRefreshes();

      // Act: native Tab leaves an active selected row.
      await key(page, 'Tab');
      const listedImmediately = await activeElement(page);
      await settleBrowserWork(page);
      const listedAfter = await evaluate(page, `(() => ({
        active: document.activeElement?.tagName === 'BUTTON'
          ? 'BUTTON:' + document.activeElement.textContent.trim()
          : document.activeElement?.tagName ?? null,
        expanded: document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded'),
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        inputValue: document.querySelector(${JSON.stringify(inputSelector)})?.value,
        main: document.querySelector('main')?.innerText,
      }))()`);

      // Assert: neither an option selection nor deferred focus restoration ran.
      assert.equal(selectedRefreshes(), listedRefreshesBefore, 'Tab on the active row does not issue a selection refresh');
      assert.deepEqual(
        {
          heading: listedAfter.heading,
          inputValue: listedAfter.inputValue,
          main: listedAfter.main,
        },
        listedBefore,
        'Tab preserves the committed 052 projection and display',
      );
      assert.equal(listedAfter.expanded, 'false', 'Tab closes the selected chooser');
      assert.equal(listedImmediately.text, 'Refresh', 'native Tab immediately reaches Refresh');
      assert.equal(
        listedAfter.active,
        'BUTTON:Refresh',
        'Tab from an active listed row remains on Refresh after animation and queued work',
      );
    });

    await t.test('Tab closes a typed active exact match without committing it', async () => {
      // Arrange: a selected projection has a typed exact 052 match active.
      await navigate(page, 'selected', 760, 'light', base);
      const inputSelector = 'header input[role="combobox"]';
      const selectedRefreshes = () => fixture.observations.refreshes
        .filter((refresh) => refresh.fixture === 'selected').length;
      await focus(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded') === 'true'`),
        'open selected inventory for typed Tab',
      );
      await settleBrowserWork(page);
      await page.send('Input.insertText', { text: '052' });
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.value === '052'
          && document.querySelectorAll('header [role="option"]').length === 1`),
        'typed 052 exact match',
      );
      await key(page, 'ArrowDown');
      await until(
        () => evaluate(page, `document.querySelector('header [role="option"][data-activedescendant-focusvisible]')?.textContent.trim() === '052-dude-canvas-ui'`),
        'typed 052 match is active before Tab',
      );
      const typedBefore = await evaluate(page, `(() => ({
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        main: document.querySelector('main')?.innerText,
      }))()`);
      const typedRefreshesBefore = selectedRefreshes();

      // Act: Tab abandons the typed, active exact match.
      await key(page, 'Tab');
      const typedImmediately = await activeElement(page);
      await settleBrowserWork(page);
      const typedAfter = await evaluate(page, `(() => ({
        active: document.activeElement?.tagName === 'BUTTON'
          ? 'BUTTON:' + document.activeElement.textContent.trim()
          : document.activeElement?.tagName ?? null,
        expanded: document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded'),
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        inputValue: document.querySelector(${JSON.stringify(inputSelector)})?.value,
        main: document.querySelector('main')?.innerText,
      }))()`);

      // Assert: the abandoned query did not become a selection and its committed display is restored.
      assert.equal(selectedRefreshes(), typedRefreshesBefore, 'Tab abandons an exact typed match without a selection refresh');
      assert.deepEqual(
        { heading: typedAfter.heading, main: typedAfter.main },
        typedBefore,
        'the typed query leaves the committed 052 projection unchanged',
      );
      assert.equal(typedAfter.expanded, 'false', 'typed Tab closes the abandoned filtered list');
      assert.equal(typedAfter.inputValue, '052-dude-canvas-ui', 'typed Tab restores the committed display');
      assert.equal(typedImmediately.text, 'Refresh', 'typed Tab immediately reaches Refresh');

      // Act + Assert: reopening restores the full approved inventory and its actual committed row.
      await click(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 50`),
        'reopen after typed Tab restores full inventory',
      );
      const reopened = await evaluate(page, `(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        const option = [...document.querySelectorAll('header [role="option"]')]
          .find((node) => node.textContent.trim() === '052-dude-canvas-ui');
        return {
          inputValue: input?.value,
          selected: option?.getAttribute('aria-selected'),
        };
      })()`);
      assert.deepEqual(
        reopened,
        { inputValue: '052-dude-canvas-ui', selected: 'true' },
        'reopening retains the approved committed display and listed-row selection',
      );
      assert.equal(typedAfter.active, 'BUTTON:Refresh', 'typed Tab focus remains on Refresh after animation and queued work');
    });

    await t.test('Tab exits an active chooser with no committed row without selecting it', async () => {
      // Arrange: query a real row from the complete no-selection inventory.
      await navigate(page, 'chooser', 760, 'light', base);
      const inputSelector = 'header input[role="combobox"]';
      const chooserRefreshes = () => fixture.observations.refreshes
        .filter((refresh) => refresh.fixture === 'chooser').length;
      await focus(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded') === 'true'`),
        'open unselected chooser before Tab',
      );
      await settleBrowserWork(page);
      await page.send('Input.insertText', { text: '052' });
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.value === '052'
          && document.querySelectorAll('header [role="option"]').length === 1`),
        'typed uncommitted 052 match',
      );
      await key(page, 'ArrowDown');
      await until(
        () => evaluate(page, `document.querySelector('header [role="option"][data-activedescendant-focusvisible]')?.textContent.trim() === '052-dude-canvas-ui'`),
        'uncommitted 052 match is active before Tab',
      );
      const refreshesBefore = chooserRefreshes();

      // Act: native Tab must not let Fluent select the active option.
      await key(page, 'Tab');
      const immediately = await activeElement(page);
      await settleBrowserWork(page);
      const after = await evaluate(page, `(() => ({
        active: document.activeElement?.tagName === 'BUTTON'
          ? 'BUTTON:' + document.activeElement.textContent.trim()
          : document.activeElement?.tagName ?? null,
        expanded: document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded'),
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        inputValue: document.querySelector(${JSON.stringify(inputSelector)})?.value,
      }))()`);

      // Assert: closing resets uncommitted input and leaves the native next control focused.
      assert.equal(chooserRefreshes(), refreshesBefore, 'Tab does not refresh or commit an unselected active row');
      assert.equal(after.heading, 'Choose a feature', 'Tab leaves the no-selection projection in chooser mode');
      assert.equal(after.expanded, 'false', 'Tab closes the unselected chooser');
      assert.equal(after.inputValue, '', 'Tab clears the uncommitted chooser query');
      assert.equal(immediately.text, 'Refresh', 'native Tab immediately reaches Refresh from the unselected chooser');
      assert.equal(after.active, 'BUTTON:Refresh', 'Refresh retains focus after animation and queued work');
    });

    await t.test('Shift+Tab closes selected and unselected choosers without later focus hijack', async () => {
      // Arrange: the selected chooser has a typed, active 052 row to discard.
      await navigate(page, 'selected', 760, 'light', base);
      const inputSelector = 'header input[role="combobox"]';
      const selectedRefreshes = () => fixture.observations.refreshes
        .filter((refresh) => refresh.fixture === 'selected').length;
      await focus(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded') === 'true'`),
        'open selected chooser before Shift+Tab',
      );
      await settleBrowserWork(page);
      await page.send('Input.insertText', { text: '052' });
      await key(page, 'ArrowDown');
      await until(
        () => evaluate(page, `document.querySelector('header [role="option"][data-activedescendant-focusvisible]')?.textContent.trim() === '052-dude-canvas-ui'`),
        'selected 052 row is active before Shift+Tab',
      );
      const selectedRefreshesBefore = selectedRefreshes();

      // Act + Assert: no previous in-document control is required; native backward traversal reaches BODY.
      await key(page, 'Tab', 'Tab', { shift: true });
      const selectedImmediate = await activeElement(page);
      await settleBrowserWork(page);
      const selectedAfter = await evaluate(page, `(() => ({
        active: document.activeElement?.tagName,
        expanded: document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded'),
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        inputValue: document.querySelector(${JSON.stringify(inputSelector)})?.value,
      }))()`);
      assert.equal(selectedRefreshes(), selectedRefreshesBefore, 'selected Shift+Tab does not refresh or commit');
      assert.equal(selectedAfter.heading, 'Dude Canvas Ui', 'selected Shift+Tab preserves the committed projection');
      assert.equal(selectedAfter.expanded, 'false', 'selected Shift+Tab closes the chooser');
      assert.equal(selectedAfter.inputValue, '052-dude-canvas-ui', 'selected Shift+Tab restores committed display');
      assert.equal(selectedImmediate.tag, 'BODY', 'native backward traversal exits at the document boundary');
      assert.equal(selectedAfter.active, 'BODY', 'no deferred selected-chooser focus restoration hijacks backward traversal');

      // Arrange + Act: repeat from an unselected chooser, whose reset value is empty.
      await navigate(page, 'chooser', 760, 'light', base);
      const chooserRefreshes = () => fixture.observations.refreshes
        .filter((refresh) => refresh.fixture === 'chooser').length;
      await focus(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded') === 'true'`),
        'open unselected chooser before Shift+Tab',
      );
      await settleBrowserWork(page);
      await page.send('Input.insertText', { text: '052' });
      await key(page, 'ArrowDown');
      await until(
        () => evaluate(page, `document.querySelector('header [role="option"][data-activedescendant-focusvisible]')?.textContent.trim() === '052-dude-canvas-ui'`),
        'unselected 052 row is active before Shift+Tab',
      );
      const chooserRefreshesBefore = chooserRefreshes();
      await key(page, 'Tab', 'Tab', { shift: true });
      const chooserImmediate = await activeElement(page);
      await settleBrowserWork(page);
      const chooserAfter = await evaluate(page, `(() => ({
        active: document.activeElement?.tagName,
        expanded: document.querySelector(${JSON.stringify(inputSelector)})?.getAttribute('aria-expanded'),
        heading: document.querySelector('#feature-heading')?.textContent.trim(),
        inputValue: document.querySelector(${JSON.stringify(inputSelector)})?.value,
      }))()`);

      // Assert: the unselected chooser does not manufacture a committed choice or recover focus later.
      assert.equal(chooserRefreshes(), chooserRefreshesBefore, 'unselected Shift+Tab does not refresh or commit');
      assert.equal(chooserAfter.heading, 'Choose a feature', 'unselected Shift+Tab remains in chooser mode');
      assert.equal(chooserAfter.expanded, 'false', 'unselected Shift+Tab closes the chooser');
      assert.equal(chooserAfter.inputValue, '', 'unselected Shift+Tab clears its query');
      assert.equal(chooserImmediate.tag, 'BODY', 'native backward traversal also exits from the unselected chooser');
      assert.equal(chooserAfter.active, 'BODY', 'no deferred unselected-chooser focus restoration hijacks backward traversal');
    });

    await t.test('an exact selected identity absent from choices has no chooser selection claim', async () => {
      // Arrange
      assert.equal(UNLISTED_EXACT_SELECTED_CHOICES.length, 50, 'fixture keeps a full valid active inventory');
      await navigate(page, 'unlisted-selected', 760, 'light', base);
      const inputSelector = 'header input[role="combobox"]';

      // Act
      await click(page, inputSelector);
      await until(
        () => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 50`),
        'open full active choices for an unlisted exact selected identity',
      );
      const unlisted = await evaluate(page, `(() => {
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        const options = [...document.querySelectorAll('header [role="option"]')];
        return {
          listedActiveReplacement: options.some((node) => node.textContent.trim() === '055-listed-feature'),
          visibleChecks: options.filter((option) => {
            const check = option.querySelector('.fui-Option__checkIcon');
            if (!check) return false;
            const style = getComputedStyle(check);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          }).length,
          heading: document.querySelector('#feature-heading')?.textContent.trim(),
          inputValue: input?.value,
          listed052: options.some((node) => node.textContent.trim() === '052-dude-canvas-ui'),
          optionCount: options.length,
          selectedOptions: options.filter((node) => node.getAttribute('aria-selected') === 'true').length,
          summary: document.querySelector('header [role="status"]')?.textContent.trim(),
        };
      })()`);

      // Assert
      assert.deepEqual(
        unlisted,
        {
          heading: 'Dude Canvas Ui',
          inputValue: '052-dude-canvas-ui',
          listedActiveReplacement: true,
          listed052: false,
          optionCount: 50,
          selectedOptions: 0,
          summary: '50 features. Scroll or type to narrow them.',
          visibleChecks: 0,
        },
        'an unlisted exact selected identity is displayed without claiming an active choice is selected',
      );
    });

    await t.test('long canonical option labels clip visually without truncating their accessible name', async () => {
      // Arrange + Act
      await navigate(page, 'chooser', 360, 'light', base);
      await focus(page, 'header input[role="combobox"]');
      await until(
        () => evaluate(page, `document.querySelectorAll('header [role="listbox"] [role="option"]').length === 50`),
        '360px chooser with long canonical option',
      );
      const longOption = await evaluate(page, `(() => {
        const option = [...document.querySelectorAll('header [role="option"]')]
          .find((node) => node.textContent.trim() === ${JSON.stringify(LONG_CANONICAL_IDENTIFIER)});
        const label = [...(option?.querySelectorAll('span') ?? [])].find((node) => (
          node.textContent === ${JSON.stringify(LONG_CANONICAL_IDENTIFIER)}
          && node.childElementCount === 0
        ));
        const style = label && getComputedStyle(label);
        const labelRect = label?.getBoundingClientRect();
        const text = label?.firstChild;
        const prefixRange = document.createRange();
        if (text?.nodeType === Node.TEXT_NODE) {
          prefixRange.setStart(text, 0);
          prefixRange.setEnd(text, 3);
        }
        const prefix = prefixRange.getBoundingClientRect();
        return {
          label: label && {
            clientWidth: label.clientWidth,
            display: style.display,
            overflowX: style.overflowX,
            scrollWidth: label.scrollWidth,
            textOverflow: style.textOverflow,
            whiteSpace: style.whiteSpace,
          },
          prefix: {
            bottom: prefix.bottom,
            left: prefix.left,
            right: prefix.right,
            top: prefix.top,
            width: prefix.width,
          },
          rect: labelRect && {
            bottom: labelRect.bottom,
            left: labelRect.left,
            right: labelRect.right,
            top: labelRect.top,
          },
          optionText: option?.textContent.trim(),
        };
      })()`);
      const optionNames = axNodes((await page.send('Accessibility.getFullAXTree')).nodes)
        .filter((node) => node.role === 'option')
        .map((node) => node.name);

      // Assert
      assert.equal(longOption.optionText, LONG_CANONICAL_IDENTIFIER);
      assert.deepEqual(longOption.label && {
        display: longOption.label.display,
        overflowX: longOption.label.overflowX,
        textOverflow: longOption.label.textOverflow,
        whiteSpace: longOption.label.whiteSpace,
      }, {
        display: 'block',
        overflowX: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }, 'the inner option label owns the rendered ellipsis CSS');
      assert.ok(
        longOption.label && longOption.label.clientWidth < longOption.label.scrollWidth,
        `360px long option must have clipped inline content: ${JSON.stringify(longOption)}`,
      );
      assert.ok(
        longOption.rect
          && longOption.prefix.width > 0
          && longOption.prefix.left >= longOption.rect.left - 1
          && longOption.prefix.right <= longOption.rect.right + 1,
        `the visible label starts with its numbered prefix: ${JSON.stringify(longOption)}`,
      );
      assert.ok(
        optionNames.includes(LONG_CANONICAL_IDENTIFIER),
        'the Option AX name remains the complete canonical identifier despite visible ellipsis',
      );
    });

    await t.test('manual refresh is atomic, stale retention preserves the full view, and focus checks do not announce', async () => {
      // Arrange
      await navigate(page, 'busy', 1200, 'light', base);
      await focusRefresh(page);
      const before = await evaluate(page, `document.querySelector('main').innerText`);
      const refreshBefore = await refreshState(page);
      assert.equal(refreshBefore.focused, true);
      assert.notEqual(refreshBefore.busy, 'true');

      // Act
      await clickRefresh(page);
      await fixture.waitForRefresh('busy', 800);

      // Assert while a bounded server barrier holds the response
      const busy = await evaluate(page, `(() => ({
        active: document.activeElement?.textContent?.trim(),
        busy: [...document.querySelectorAll('header button')].find((node) => node.textContent.trim() === 'Refresh')?.getAttribute('aria-busy'),
        main: document.querySelector('main')?.innerText,
        freshness: document.querySelector('aside')?.innerText,
      }))()`);
      assert.equal(busy.active, 'Refresh');
      assert.equal(busy.busy, 'true');
      assert.equal(busy.main, before, 'no partial successor fields render while refresh is in flight');
      assert.match(busy.freshness, /Reading repository sources/);
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'Reading repository sources.')`),
        true,
        'manual refresh announces its reading state',
      );
      fixture.releaseRefresh('busy');
      await until(() => evaluate(page, `document.querySelector('#feature-heading')?.textContent?.includes('Atomic Replacement')`), 'atomic refresh successor');
      assert.equal((await activeElement(page)).text, 'Refresh', 'Refresh retains focus after complete replacement');
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'One complete projection replaced the previous view.')`),
        true,
        'successful refresh announces atomic replacement',
      );

      await navigate(page, 'stale', 960, 'dark', base);
      const preserved = await evaluate(page, `document.querySelector('main').innerText`);
      await focusRefresh(page);
      await clickRefresh(page);
      await until(() => evaluate(page, `document.querySelector('aside').innerText.includes('Preserved complete read')`), 'stale freshness');
      assert.equal(await evaluate(page, `document.querySelector('main').innerText`), preserved, 'failed refresh preserves every displayed projection fact');
      assert.equal((await activeElement(page)).text, 'Refresh', 'failed refresh preserves Refresh focus');
      const staleText = await evaluate(page, `document.body.innerText`);
      assert.match(staleText, /Showing the last complete read/);
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'The complete projection was preserved. Review freshness details, then refresh.')`),
        true,
        'failed refresh announces preserved facts rather than a false completion',
      );
      screenshots.push(await screenshot(page, 'stale', 'stale', 960, 'dark', ['failed refresh retains previous complete projection']));

      await navigate(page, 'changed', 960, 'light', base);
      await focusRefresh(page);
      const announcement = await evaluate(page, `[...document.querySelectorAll('[role="status"]')].map((node) => node.textContent).join('')`);
      await evaluate(page, `window.dispatchEvent(new Event('focus'))`);
      await until(() => evaluate(page, `document.querySelector('aside').innerText.includes('Repository changed')`), 'focus freshness check');
      assert.equal((await activeElement(page)).text, 'Refresh', 'background freshness check leaves focus in place');
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].map((node) => node.textContent).join('')`),
        announcement,
        'background currentness check is not a noisy live announcement',
      );
      const focusRequests = fixture.observations.calls.filter((call) => call.fixture === 'changed' && call.path === '/api/freshness');
      assert.ok(focusRequests.length >= 1, 'focus reaches the freshness API');
      const beforeVisibility = focusRequests.length;
      await evaluate(page, `document.dispatchEvent(new Event('visibilitychange'))`);
      await until(
        () => fixture.observations.calls.filter((call) => call.fixture === 'changed' && call.path === '/api/freshness').length > beforeVisibility,
        'visible document freshness check',
      );
      assert.equal(
        await evaluate(page, `[...document.querySelectorAll('[role="status"]')].map((node) => node.textContent).join('')`),
        announcement,
        'visible-document freshness check is not a noisy live announcement',
      );
    });

    await t.test('semantic landmarks, headings, controls, keyboard focus, accordion, and live status are operable', async () => {
      // Arrange
      await navigate(page, 'lightweight', 1440, 'light', base);

      // Act
      const tree = axNodes((await page.send('Accessibility.getFullAXTree')).nodes);
      const landmarkNames = tree
        .filter((node) => ['banner', 'navigation', 'main', 'complementary', 'contentinfo'].includes(node.role))
        .map((node) => `${node.role}:${node.name}`);
      const headings = tree.filter((node) => node.role === 'heading');
      /** @type {string[]} */
      const semanticFailures = [];

      // Assert
      for (const requiredLandmark of [
        'banner:',
        'complementary:Details',
        'contentinfo:Status',
        'main:Now',
        'navigation:Surfaces',
      ]) {
        collect(semanticFailures, () => assert.ok(
          landmarkNames.includes(requiredLandmark),
          `AX exposes required named landmark ${requiredLandmark}: ${JSON.stringify(landmarkNames)}`,
        ));
      }
      collect(semanticFailures, () => assert.equal(headings.filter((node) => node.level === 1 && node.name === 'Dude — Now').length, 1));
      collect(semanticFailures, () => assert.ok(headings.some((node) => node.level === 2 && node.name === 'Lightweight Workspace')));
      for (const name of ['Next step', 'Lifecycle', 'Phases', 'Activity', 'Attention', 'Freshness', 'Properties', 'Evidence']) {
        collect(semanticFailures, () => assert.ok(
          headings.some((node) => node.level === 3 && node.name.toLowerCase() === name.toLowerCase()),
          `AX has ${name} heading`,
        ));
      }
      const enabled = await evaluate(page, `(() => [...document.querySelectorAll('button:not([disabled]), input:not([disabled]), summary')].map((node) => ({
        label: node.getAttribute('aria-label'), role: node.getAttribute('role'), text: node.textContent.trim()
      })))()`);
      collect(semanticFailures, () => assert.deepEqual(enabled.map((node) => node.label ?? node.text).filter(Boolean), [
        'Refresh',
        'Now, the open surface',
        'Source details',
      ]));
      collect(semanticFailures, () => assert.doesNotMatch(
        JSON.stringify(tree.filter((node) => (
          (node.role === 'button' || node.role === 'link')
          && !node.name.endsWith('arrives in a later cycle')
        ))),
        /\b(?:send|message|answer|approval|stop|review|command|replay|abort)\b/i,
      ));

      await focusRefresh(page);
      await key(page, 'Tab');
      const afterRefreshTab = await activeElement(page);
      collect(semanticFailures, () => assert.equal(afterRefreshTab.ariaLabel, 'Now, the open surface'));
      const controlFocus = await evaluate(page, `(() => {
        const node = document.activeElement;
        const style = getComputedStyle(node);
        const after = getComputedStyle(node, '::after');
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
          afterBorderWidth: after.borderTopWidth,
          afterBoxShadow: after.boxShadow,
          afterContent: after.content,
        };
      })()`);
      collect(semanticFailures, () => assert.ok(
        (controlFocus.outlineStyle !== 'none' && controlFocus.outlineWidth !== '0px')
          || controlFocus.boxShadow !== 'none'
          || (controlFocus.afterContent !== 'none'
            && (controlFocus.afterBorderWidth !== '0px' || controlFocus.afterBoxShadow !== 'none')),
        `keyboard-focused control has a visible focus treatment: ${JSON.stringify(controlFocus)}`,
      ));
      await key(page, 'Tab');
      const afterNowTab = await activeElement(page);
      collect(semanticFailures, () => assert.match(afterNowTab.text, /Source details/));
      const accordionBefore = await evaluate(page, `(() => {
        const node = document.activeElement;
        return { tag: node?.tagName, role: node?.getAttribute('role'), expanded: node?.getAttribute('aria-expanded') };
      })()`);
      await key(page, 'Enter');
      const accordionAfter = await evaluate(page, `(() => {
        const node = document.activeElement;
        return { tag: node?.tagName, role: node?.getAttribute('role'), expanded: node?.getAttribute('aria-expanded') };
      })()`);
      const expanded = accordionAfter.expanded === 'true';
      collect(semanticFailures, () => assert.equal(
        expanded,
        true,
        `Enter expands Source details: ${JSON.stringify({ before: accordionBefore, after: accordionAfter })}`,
      ));
      if (expanded) {
        await key(page, 'Enter');
        const collapsed = await evaluate(page, `document.activeElement?.getAttribute('aria-expanded') === 'false'`);
        collect(semanticFailures, () => assert.equal(collapsed, true, 'Enter collapses Source details'));
      }
      await key(page, 'Tab');
      const afterAccordionTab = await activeElement(page);
      collect(semanticFailures, () => assert.notEqual(afterAccordionTab.text, 'Source details', 'accordion leaves no keyboard trap'));

      await focus(page, 'button[aria-label="Now, the open surface"]');
      await key(page, 'Enter');
      const nowAnnounced = await evaluate(page, `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent.includes('Now is already the open surface.'))`);
      collect(semanticFailures, () => assert.equal(nowAnnounced, true, 'Enter announces that Now is already open'));
      const focusStyles = await evaluate(page, `(() => {
        const read = (node) => {
          const style = getComputedStyle(node);
          return {
            outlineColor: style.outlineColor,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            boxShadow: style.boxShadow,
            background: getComputedStyle(node.parentElement).backgroundColor,
          };
        };
        const heading = document.querySelector('#feature-heading');
        heading.focus();
        return {
          heading: read(heading),
          refresh: read([...document.querySelectorAll('header button')].find((node) => node.textContent.trim() === 'Refresh')),
        };
      })()`);
      collect(semanticFailures, () => assert.equal(focusStyles.heading.outlineStyle, 'solid'));
      collect(semanticFailures, () => assert.equal(focusStyles.heading.outlineWidth, '2px'));
      collect(semanticFailures, () => assert.ok(
        contrast(focusStyles.heading.outlineColor, focusStyles.heading.background) >= 3,
        `identity focus outline meets 3:1: ${JSON.stringify(focusStyles.heading)}`,
      ));
      assert.deepEqual(semanticFailures, [], semanticFailures.join('\n\n'));
    });

    await t.test('chooser exists only in the command bar and direct inline listbox has no overlay side effects', async () => {
      /** @type {string[]} */
      const placementFailures = [];
      for (const width of [360, 760, 1440]) {
        // Arrange + Act
        await navigate(page, 'chooser', width, 'light', base);
        await focus(page, 'header input[role="combobox"]');
        await until(
          () => evaluate(page, `document.querySelectorAll('header [role="listbox"] [role="option"]').length === 50`),
          `${width}px direct command-bar listbox`,
        );
        const placement = await evaluate(page, `(() => {
          const header = document.querySelector('header');
          const main = document.querySelector('main');
          const input = header?.querySelector('input[role="combobox"]');
          const listbox = header?.querySelector('[role="listbox"]');
          const rect = (node) => {
            if (!node) return null;
            const value = node.getBoundingClientRect();
            return { bottom: value.bottom, left: value.left, right: value.right, top: value.top };
          };
          return {
            chooserCount: document.querySelectorAll('[role="combobox"]').length,
            dialogCount: document.querySelectorAll('[role="dialog"]').length,
            headerChooserCount: header?.querySelectorAll('[role="combobox"]').length ?? 0,
            listboxInHeader: Boolean(header && listbox && header.contains(listbox)),
            listboxRect: rect(listbox),
            mainAriaHidden: main?.getAttribute('aria-hidden'),
            mainInteractiveSelectors: main?.querySelectorAll('input, [role="combobox"], [aria-haspopup]').length ?? 0,
            mainText: main?.innerText,
            modalCount: document.querySelectorAll('[aria-modal="true"]').length,
            portalCount: document.querySelectorAll('[data-portal-node="true"]').length,
            inputRect: rect(input),
            pointerFocus: (() => {
              const control = input?.parentElement;
              const style = control && getComputedStyle(control);
              return {
                controlOutlineStyle: style?.outlineStyle,
                controlOutlineWidth: style?.outlineWidth,
                inputFocusVisible: input?.matches(':focus-visible'),
              };
            })(),
            viewport: { height: window.innerHeight, width: window.innerWidth },
          };
        })()`);

        // Assert
        collect(placementFailures, () => assert.equal(placement.chooserCount, 1, `${width}px: exactly one chooser`));
        collect(placementFailures, () => assert.equal(placement.headerChooserCount, 1, `${width}px: chooser belongs to command bar`));
        collect(placementFailures, () => assert.equal(placement.mainInteractiveSelectors, 0, `${width}px: explanation has no selector`));
        collect(placementFailures, () => assert.match(
          placement.mainText,
          /The feature list is the Feature box in the command bar at the top of this window\.\s*It is the only place a feature is chosen\./,
          `${width}px: page explanation names command-bar selection honestly`,
        ));
        collect(placementFailures, () => assert.equal(placement.dialogCount, 0, `${width}px: no dialog layer`));
        collect(placementFailures, () => assert.equal(placement.modalCount, 0, `${width}px: no modal layer`));
        collect(placementFailures, () => assert.equal(placement.portalCount, 0, `${width}px: no portal mount`));
        collect(placementFailures, () => assert.equal(placement.mainAriaHidden, null, `${width}px: main remains available`));
        collect(placementFailures, () => assert.equal(
          placement.pointerFocus.inputFocusVisible,
          true,
          `${width}px: focused text input matches :focus-visible after direct activation (${JSON.stringify(placement.pointerFocus)})`,
        ));
        collect(placementFailures, () => assert.equal(
          placement.pointerFocus.controlOutlineStyle,
          'solid',
          `${width}px: direct input focus gives its chooser control a visible outline (${JSON.stringify(placement.pointerFocus)})`,
        ));
        collect(placementFailures, () => assert.equal(
          placement.pointerFocus.controlOutlineWidth,
          '2px',
          `${width}px: chooser focus outline uses the approved 2px width (${JSON.stringify(placement.pointerFocus)})`,
        ));
        collect(placementFailures, () => assert.equal(placement.listboxInHeader, true, `${width}px: listbox remains inline in command bar`));
        collect(placementFailures, () => assert.ok(
          placement.listboxRect && placement.inputRect && placement.listboxRect.top >= placement.inputRect.bottom,
          `${width}px: direct listbox is below its input (${JSON.stringify(placement)})`,
        ));
        for (const [name, rect] of Object.entries({ listbox: placement.listboxRect })) {
          collect(placementFailures, () => assert.ok(rect, `${width}px: ${name} is rendered`));
          if (rect) {
            collect(placementFailures, () => assert.ok(
              rect.left >= 0 && rect.top >= 0
                && rect.right <= placement.viewport.width && rect.bottom <= placement.viewport.height,
              `${width}px: ${name} stays inside the viewport (${JSON.stringify({ rect, viewport: placement.viewport })})`,
            ));
          }
        }
        screenshotObservations.push(
          `${width}px command-bar chooser: listbox ${JSON.stringify(placement.listboxRect)}; portals ${placement.portalCount}`,
        );
        screenshots.push(await screenshot(page, 'inline-chooser', 'chooser', width, 'light', [
          'only command-bar selector; page offers an honest explanation',
          'direct inline listbox has no dialog, modal, aria-hidden, or portal side effect',
        ]));
      }

      for (const [state, identity, identifier, complete] of [
        ['lightweight', 'Lightweight Workspace', '042-lightweight-workspace', true],
        ['tracked', 'Tracked Workspace', '043-tracked-workspace', true],
        ['blocked', 'Blocked Workspace', '044-blocked-workspace', true],
        ['mismatch', 'Selected B', '045-selected-b', true],
        ['malformed', 'Malformed Workspace', null, false],
        ['partial', 'Partial Workspace', null, false],
        ['conflict', 'Conflict Workspace', null, false],
        ['tracker-unavailable', 'Tracker Workspace', null, false],
        ['empty', 'No feature available', null, false],
      ]) {
        await navigate(page, state, 960, 'light', base);
        const nonChooser = await evaluate(page, `(() => ({
          comboboxes: document.querySelectorAll('[role="combobox"]').length,
          headerText: document.querySelector('header')?.innerText,
          inputs: document.querySelectorAll('header input').length,
          inputValue: document.querySelector('header input')?.value,
        }))()`);
        collect(placementFailures, () => assert.equal(
          nonChooser.comboboxes,
          complete ? 1 : 0,
          `${state}: only complete navigation inventories render the command-bar chooser`,
        ));
        collect(placementFailures, () => assert.equal(
          nonChooser.inputs,
          complete ? 1 : 0,
          `${state}: selected complete projection uses the same text chooser`,
        ));
        if (complete) {
          collect(placementFailures, () => assert.equal(
            nonChooser.inputValue,
            identifier,
            `${state}: selected projection commits its canonical identifier into the chooser`,
          ));
        } else {
          collect(placementFailures, () => assert.match(
            nonChooser.headerText,
            new RegExp(identity),
            `${state}: unavailable or empty state remains a non-interactive identity`,
          ));
        }
      }
      assert.deepEqual(placementFailures, [], placementFailures.join('\n\n'));
    });

    await t.test('chooser band, list, and zero-match composite preserve stroke and geometry semantics', async () => {
      const cases = [
        { width: 360, height: 900, rows: 5, theme: 'light', forcedColors: false },
        { width: 360, height: 900, rows: 5, theme: 'dark', forcedColors: false },
        { width: 760, height: 900, rows: 5, theme: 'light', forcedColors: false },
        { width: 760, height: 900, rows: 5, theme: 'dark', forcedColors: false },
        { width: 760, height: 1000, rows: 8, theme: 'light', forcedColors: false },
        { width: 760, height: 900, rows: 5, theme: 'light', forcedColors: true },
        { width: 760, height: 900, rows: 5, theme: 'dark', forcedColors: true },
      ];
      /** @type {string[]} */
      const geometryFailures = [];

      for (const viewport of cases) {
        // Arrange + Act
        await navigate(
          page,
          'chooser',
          viewport.width,
          viewport.theme,
          base,
          viewport.height,
          viewport.forcedColors,
        );
        await focus(page, 'header input[role="combobox"]');
        await until(
          () => evaluate(page, `document.querySelectorAll('header [role="listbox"] [role="option"]').length === 50`),
          `${viewport.width}x${viewport.height} chooser open`,
        );
        const geometry = await evaluate(page, `(() => {
          const header = document.querySelector('header');
          const input = header?.querySelector('input[role="combobox"]');
          const control = input?.parentElement;
          const band = header?.querySelector('[aria-live][role="status"]');
          const listbox = header?.querySelector('[role="listbox"]');
          const first = listbox?.querySelector('[role="option"]');
          const surface = (node) => {
            if (!node) return null;
            const style = getComputedStyle(node);
            return {
              background: style.backgroundColor,
              border: {
                bottomColor: style.borderBottomColor,
                bottomStyle: style.borderBottomStyle,
                bottomWidth: style.borderBottomWidth,
                leftColor: style.borderLeftColor,
                leftStyle: style.borderLeftStyle,
                leftWidth: style.borderLeftWidth,
                rightColor: style.borderRightColor,
                rightStyle: style.borderRightStyle,
                rightWidth: style.borderRightWidth,
                topColor: style.borderTopColor,
                topStyle: style.borderTopStyle,
                topWidth: style.borderTopWidth,
              },
              fontSize: style.fontSize,
              lineHeight: style.lineHeight,
              padding: {
                bottom: style.paddingBottom,
                left: style.paddingLeft,
                right: style.paddingRight,
                top: style.paddingTop,
              },
              radii: {
                bottomLeft: style.borderBottomLeftRadius,
                bottomRight: style.borderBottomRightRadius,
                topLeft: style.borderTopLeftRadius,
                topRight: style.borderTopRightRadius,
              },
              shadow: style.boxShadow,
              zIndex: style.zIndex,
            };
          };
          const rect = (node) => {
            if (!node) return null;
            const value = node.getBoundingClientRect();
            return {
              bottom: value.bottom,
              height: value.height,
              left: value.left,
              right: value.right,
              top: value.top,
              width: value.width,
            };
          };
          const firstRect = rect(first);
          const hit = firstRect
            ? document.elementFromPoint(firstRect.left + (firstRect.width / 2), firstRect.top + (firstRect.height / 2))
            : null;
          return {
            band: rect(band),
            bandStatus: band?.getAttribute('aria-live'),
            control: rect(control),
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            },
            forcedColors: matchMedia('(forced-colors: active)').matches,
            firstHit: Boolean(first && hit && first.contains(hit)),
            listbox: rect(listbox),
            listboxChildRoles: [...(listbox?.children ?? [])].map((node) => node.getAttribute('role')),
            listboxSurface: surface(listbox),
            row: rect(first),
            summaryBandSurface: surface(band),
            summary: {
              overflows: (band?.scrollWidth ?? 0) > (band?.clientWidth ?? 0),
              text: band?.textContent.trim(),
              visible: Boolean(band && band.getBoundingClientRect().width > 0 && band.getBoundingClientRect().height > 0),
            },
          };
        })()`);

        // Assert
        const mode = viewport.forcedColors ? 'forced-colors' : viewport.theme;
        const description = `${viewport.width}x${viewport.height}/${mode}`;
        const tokens = CHOOSER_SURFACE_TOKENS[viewport.theme];
        collect(geometryFailures, () => assert.equal(geometry.forcedColors, viewport.forcedColors, `${description}: forced-colors media feature is applied`));
        collect(geometryFailures, () => assert.equal(geometry.bandStatus, 'polite', `${description}: band root is the polite status region`));
        collect(geometryFailures, () => assert.equal(geometry.summary.text, '50 features. Scroll or type to narrow them.', `${description}: summary reports valid selectable choices with exact approved copy`));
        collect(geometryFailures, () => assert.equal(geometry.summary.visible, true, `${description}: summary band remains visible`));
        collect(geometryFailures, () => assert.ok(geometry.control && geometry.band && geometry.listbox && geometry.row, `${description}: chooser geometry is measurable`));
        if (geometry.control && geometry.band && geometry.listbox && geometry.row) {
          collect(geometryFailures, () => assert.ok(Math.abs(geometry.band.left - geometry.control.left) <= 1, `${description}: summary aligns to control left edge (${JSON.stringify(geometry)})`));
          collect(geometryFailures, () => assert.ok(Math.abs(geometry.band.width - geometry.control.width) <= 1, `${description}: summary spans control width (${JSON.stringify(geometry)})`));
          collect(geometryFailures, () => assert.equal(Math.round(geometry.band.height), 20, `${description}: summary band is exactly 20px`));
          collect(geometryFailures, () => assert.equal(Math.round(geometry.band.top - geometry.control.bottom), 0, `${description}: summary starts at the control edge`));
          collect(geometryFailures, () => assert.equal(Math.round(geometry.listbox.top - geometry.control.bottom), 20, `${description}: positioned listbox has the exact 20px summary offset`));
          collect(geometryFailures, () => assert.equal(Math.round(geometry.listbox.top - geometry.band.bottom), 0, `${description}: adjacent surfaces leave no vertical seam`));
          collect(geometryFailures, () => assert.equal(Math.round(geometry.listbox.height / geometry.row.height), viewport.rows, `${description}: listbox exposes ${viewport.rows} full rows`));
        }
        collect(geometryFailures, () => assert.ok(geometry.summaryBandSurface && geometry.listboxSurface, `${description}: chooser surfaces have computed styles`));
        if (geometry.summaryBandSurface && geometry.listboxSurface) {
          const bandSurface = geometry.summaryBandSurface;
          const listboxSurface = geometry.listboxSurface;
          collect(geometryFailures, () => assert.deepEqual(
            bandSurface.radii,
            { bottomLeft: '0px', bottomRight: '0px', topLeft: '4px', topRight: '4px' },
            `${description}: summary owns only the tokenized raised top corners`,
          ));
          collect(geometryFailures, () => assert.deepEqual(
            bandSurface.padding,
            { bottom: '2px', left: '8px', right: '8px', top: '2px' },
            `${description}: summary retains its compact token padding`,
          ));
          for (const side of ['top', 'left', 'right']) {
            const title = `${side[0].toUpperCase()}${side.slice(1)}`;
            collect(geometryFailures, () => assert.equal(bandSurface.border[`${side}Style`], 'solid', `${description}: summary ${side} stroke is solid`));
            collect(geometryFailures, () => assert.equal(bandSurface.border[`${side}Width`], '1px', `${description}: summary ${side} stroke is thin`));
            if (!viewport.forcedColors) {
              collect(geometryFailures, () => assert.equal(bandSurface.border[`${side}Color`], tokens.stroke2, `${description}: summary ${title} resolves colorNeutralStroke2`));
            }
          }
          collect(geometryFailures, () => assert.equal(bandSurface.border.bottomStyle, 'none', `${description}: summary has no bottom stroke at the seam`));
          collect(geometryFailures, () => assert.equal(bandSurface.border.bottomWidth, '0px', `${description}: summary bottom seam width is zero`));
          collect(geometryFailures, () => assert.deepEqual(
            listboxSurface.radii,
            { bottomLeft: '4px', bottomRight: '4px', topLeft: '0px', topRight: '0px' },
            `${description}: listbox is flat at the seam and rounded only at the bottom`,
          ));
          collect(geometryFailures, () => assert.deepEqual(
            listboxSurface.padding,
            { bottom: '0px', left: '0px', right: '0px', top: '0px' },
            `${description}: listbox retains zero composite padding`,
          ));
          collect(geometryFailures, () => assert.equal(listboxSurface.border.topStyle, 'none', `${description}: listbox has no second seam stroke`));
          collect(geometryFailures, () => assert.equal(listboxSurface.border.topWidth, '0px', `${description}: listbox top seam width is zero`));
          for (const side of ['right', 'bottom', 'left']) {
            collect(geometryFailures, () => assert.equal(listboxSurface.border[`${side}Style`], 'solid', `${description}: listbox ${side} stroke is solid`));
            collect(geometryFailures, () => assert.equal(listboxSurface.border[`${side}Width`], '1px', `${description}: listbox ${side} stroke is thin`));
            if (!viewport.forcedColors) {
              collect(geometryFailures, () => assert.equal(listboxSurface.border[`${side}Color`], tokens.stroke2, `${description}: listbox ${side} resolves colorNeutralStroke2`));
            }
          }
          if (!viewport.forcedColors) {
            collect(geometryFailures, () => assert.equal(bandSurface.background, tokens.background1, `${description}: band resolves colorNeutralBackground1`));
            collect(geometryFailures, () => assert.equal(listboxSurface.background, tokens.background1, `${description}: listbox resolves colorNeutralBackground1`));
            collect(geometryFailures, () => assert.notEqual(bandSurface.shadow, 'none', `${description}: summary elevation is present`));
            collect(geometryFailures, () => assert.notEqual(listboxSurface.shadow, 'none', `${description}: listbox elevation is present below the summary`));
          } else {
            collect(geometryFailures, () => assert.equal(bandSurface.background, listboxSurface.background, `${description}: forced colors preserve one continuous Canvas surface`));
            collect(geometryFailures, () => assert.notEqual(bandSurface.border.topColor, bandSurface.background, `${description}: forced colors retain a visible band stroke`));
            collect(geometryFailures, () => assert.notEqual(listboxSurface.border.bottomColor, listboxSurface.background, `${description}: forced colors retain a visible list stroke`));
          }
        }
        collect(geometryFailures, () => assert.equal(geometry.firstHit, true, `${description}: the first listbox row wins its hit test`));
        collect(geometryFailures, () => assert.equal(geometry.listboxChildRoles.length, 50, `${description}: listbox contains every selectable row`));
        collect(geometryFailures, () => assert.equal(geometry.listboxChildRoles.every((role) => role === 'option'), true, `${description}: listbox children are options only`));
        collect(geometryFailures, () => assert.equal(geometry.document.scrollWidth, geometry.document.clientWidth, `${description}: open chooser has no horizontal overflow`));

        // Act: no matching option leaves the listbox absent and its explanation in the same column.
        await page.send('Input.insertText', { text: 'not-a-feature' });
        await until(
          () => evaluate(page, `document.body.innerText.includes('No features match "not-a-feature".')`),
          `${description} zero-match caption`,
        );
        const zeroMatch = await evaluate(page, `(() => {
          const header = document.querySelector('header');
          const input = header?.querySelector('input[role="combobox"]');
          const control = input?.parentElement;
          const summary = header?.querySelector('[aria-live][role="status"]');
          const empty = [...(header?.querySelectorAll('*') ?? [])].find((node) => (
            node.textContent.trim() === 'No features match "not-a-feature".'
            && getComputedStyle(node).position === 'absolute'
          ));
          const surface = (node) => {
            if (!node) return null;
            const style = getComputedStyle(node);
            return {
              background: style.backgroundColor,
              border: {
                bottomColor: style.borderBottomColor,
                bottomStyle: style.borderBottomStyle,
                bottomWidth: style.borderBottomWidth,
                leftColor: style.borderLeftColor,
                leftStyle: style.borderLeftStyle,
                leftWidth: style.borderLeftWidth,
                rightColor: style.borderRightColor,
                rightStyle: style.borderRightStyle,
                rightWidth: style.borderRightWidth,
                topColor: style.borderTopColor,
                topStyle: style.borderTopStyle,
                topWidth: style.borderTopWidth,
              },
              fontSize: style.fontSize,
              lineHeight: style.lineHeight,
              padding: {
                bottom: style.paddingBottom,
                left: style.paddingLeft,
                right: style.paddingRight,
                top: style.paddingTop,
              },
              radii: {
                bottomLeft: style.borderBottomLeftRadius,
                bottomRight: style.borderBottomRightRadius,
                topLeft: style.borderTopLeftRadius,
                topRight: style.borderTopRightRadius,
              },
              shadow: style.boxShadow,
            };
          };
          const rect = (node) => {
            if (!node) return null;
            const value = node.getBoundingClientRect();
            return { bottom: value.bottom, left: value.left, right: value.right, top: value.top, width: value.width };
          };
          const listbox = header?.querySelector('[role="listbox"]');
          const listboxRect = listbox?.getBoundingClientRect();
          return {
            control: rect(control),
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            },
            empty: rect(empty),
            emptyLive: empty?.getAttribute('aria-live'),
            emptyText: empty?.textContent.trim(),
            emptySurface: surface(empty),
            listboxVisible: Boolean(listboxRect && listboxRect.width > 0 && listboxRect.height > 0),
            liveText: [...(header?.querySelectorAll('[aria-live]') ?? [])].map((node) => node.textContent.trim()),
            summaryBand: rect(summary),
          };
        })()`);
        collect(geometryFailures, () => assert.equal(zeroMatch.listboxVisible, false, `${description}: zero-match state has no visible listbox artifact`));
        collect(geometryFailures, () => assert.deepEqual(zeroMatch.liveText, ['0 of 50 features match "not-a-feature".'], `${description}: the one live hint retains count copy`));
        collect(geometryFailures, () => assert.equal(zeroMatch.emptyLive, null, `${description}: zero caption is non-live`));
        collect(geometryFailures, () => assert.equal(zeroMatch.emptyText, 'No features match "not-a-feature".', `${description}: zero-match caption uses the approved copy`));
        collect(geometryFailures, () => assert.ok(zeroMatch.control && zeroMatch.empty && zeroMatch.summaryBand && zeroMatch.emptySurface, `${description}: zero-match geometry is measurable`));
        if (zeroMatch.control && zeroMatch.empty && zeroMatch.summaryBand) {
          collect(geometryFailures, () => assert.ok(Math.abs(zeroMatch.empty.left - zeroMatch.control.left) <= 1, `${description}: zero-match explanation aligns to control left edge (${JSON.stringify(zeroMatch)})`));
          collect(geometryFailures, () => assert.ok(Math.abs(zeroMatch.empty.width - zeroMatch.control.width) <= 1, `${description}: zero-match explanation spans control width (${JSON.stringify(zeroMatch)})`));
          collect(geometryFailures, () => assert.equal(Math.round(zeroMatch.empty.top - zeroMatch.summaryBand.bottom), 0, `${description}: zero-match explanation follows the 20px band without a gap`));
        }
        if (zeroMatch.emptySurface) {
          const emptySurface = zeroMatch.emptySurface;
          collect(geometryFailures, () => assert.deepEqual(
            emptySurface.radii,
            { bottomLeft: '4px', bottomRight: '4px', topLeft: '0px', topRight: '0px' },
            `${description}: zero-match surface completes the composite with lower corners only`,
          ));
          collect(geometryFailures, () => assert.deepEqual(
            emptySurface.padding,
            { bottom: '8px', left: '8px', right: '8px', top: '8px' },
            `${description}: zero-match caption has the approved token padding`,
          ));
          collect(geometryFailures, () => assert.equal(emptySurface.fontSize, '14px', `${description}: zero-match caption has approved Fluent type size`));
          collect(geometryFailures, () => assert.equal(emptySurface.lineHeight, '20px', `${description}: zero-match caption has approved Fluent line height`));
          collect(geometryFailures, () => assert.equal(emptySurface.border.topStyle, 'none', `${description}: zero-match caption leaves the seam open`));
          collect(geometryFailures, () => assert.equal(emptySurface.border.topWidth, '0px', `${description}: zero-match caption has no top seam width`));
          for (const side of ['right', 'bottom', 'left']) {
            collect(geometryFailures, () => assert.equal(emptySurface.border[`${side}Style`], 'solid', `${description}: zero-match ${side} stroke is solid`));
            collect(geometryFailures, () => assert.equal(emptySurface.border[`${side}Width`], '1px', `${description}: zero-match ${side} stroke is thin`));
            if (!viewport.forcedColors) {
              collect(geometryFailures, () => assert.equal(emptySurface.border[`${side}Color`], tokens.stroke2, `${description}: zero-match ${side} resolves colorNeutralStroke2`));
            }
          }
          if (!viewport.forcedColors) {
            collect(geometryFailures, () => assert.equal(emptySurface.background, tokens.background1, `${description}: zero-match resolves colorNeutralBackground1`));
            collect(geometryFailures, () => assert.notEqual(emptySurface.shadow, 'none', `${description}: zero-match surface keeps its elevation`));
          } else {
            collect(geometryFailures, () => assert.notEqual(emptySurface.border.bottomColor, emptySurface.background, `${description}: forced colors retain a visible zero-match stroke`));
          }
        }
        collect(geometryFailures, () => assert.equal(zeroMatch.document.scrollWidth, zeroMatch.document.clientWidth, `${description}: zero-match state has no horizontal overflow`));
        screenshotObservations.push(
          `${description} chooser composite: band ${JSON.stringify(geometry.summaryBandSurface)}; list ${JSON.stringify(geometry.listboxSurface)}; zero ${JSON.stringify(zeroMatch.emptySurface)}`,
        );
      }

      assert.deepEqual(geometryFailures, [], geometryFailures.join('\n\n'));
    });

    await t.test('active first and last options keep their brand edge fully inside the scrollport', async () => {
      /** @type {string[]} */
      const activeFailures = [];

      for (const theme of /** @type {const} */ (['light', 'dark'])) {
        // Arrange
        await navigate(page, 'chooser', 760, theme, base);
        await focus(page, 'header input[role="combobox"]');
        await until(
          () => evaluate(page, `document.querySelectorAll('header [role="listbox"] [role="option"]').length === 50`),
          `${theme} active-option setup`,
        );
        await key(page, 'ArrowDown');

        for (const [keyName, expected] of [['Home', '001-feature-01'], ['End', '054-feature-50']]) {
          // Act
          await key(page, keyName);
          await until(
            () => evaluate(page, `document.querySelector('header [role="option"][data-activedescendant-focusvisible]')?.textContent.trim() === ${JSON.stringify(expected)}`),
            `${theme} ${keyName} active option`,
          );
          const active = await evaluate(page, `(() => {
            const listbox = document.querySelector('header [role="listbox"]');
            const option = listbox?.querySelector('[role="option"][data-activedescendant-focusvisible]');
            const inactive = [...(listbox?.querySelectorAll('[role="option"]') ?? [])].find((node) => node !== option);
            const rect = (node) => {
              const value = node?.getBoundingClientRect();
              return value && { bottom: value.bottom, left: value.left, right: value.right, top: value.top };
            };
            const style = option && getComputedStyle(option);
            const after = option && getComputedStyle(option, '::after');
            return {
              active: {
                after: after && {
                  bottom: after.bottom,
                  left: after.left,
                  right: after.right,
                  top: after.top,
                },
                background: style?.backgroundColor,
                boxShadow: style?.boxShadow,
                padding: style && {
                  bottom: style.paddingBottom,
                  left: style.paddingLeft,
                  right: style.paddingRight,
                  top: style.paddingTop,
                },
                rect: rect(option),
                text: option?.textContent.trim(),
              },
              document: {
                clientWidth: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
              },
              inactivePadding: inactive && {
                bottom: getComputedStyle(inactive).paddingBottom,
                left: getComputedStyle(inactive).paddingLeft,
                right: getComputedStyle(inactive).paddingRight,
                top: getComputedStyle(inactive).paddingTop,
              },
              scrollport: listbox && {
                clientHeight: listbox.clientHeight,
                clientLeft: listbox.clientLeft,
                clientTop: listbox.clientTop,
                clientWidth: listbox.clientWidth,
                rect: rect(listbox),
                scrollHeight: listbox.scrollHeight,
                scrollTop: listbox.scrollTop,
                scrollWidth: listbox.scrollWidth,
              },
            };
          })()`);

          // Assert
          const description = `${theme}/${keyName}`;
          const tokens = CHOOSER_SURFACE_TOKENS[theme];
          collect(activeFailures, () => assert.equal(active.active.text, expected, `${description}: expected endpoint is active`));
          collect(activeFailures, () => assert.equal(active.document.scrollWidth, active.document.clientWidth, `${description}: active option causes no document horizontal overflow`));
          collect(activeFailures, () => assert.ok(active.scrollport?.rect && active.active.rect, `${description}: active row and scrollport are measurable`));
          if (active.scrollport?.rect && active.active.rect) {
            const { rect, clientLeft, clientTop } = active.scrollport;
            const row = active.active.rect;
            collect(activeFailures, () => assert.ok(
              row.left >= rect.left + clientLeft - 1
                && row.right <= rect.right - clientLeft + 1
                && row.top >= rect.top + clientTop - 1
                && row.bottom <= rect.bottom - clientTop + 1,
              `${description}: active row and its inset ring remain fully inside the scrollport (${JSON.stringify(active)})`,
            ));
          }
          collect(activeFailures, () => assert.equal(active.scrollport?.scrollWidth, active.scrollport?.clientWidth, `${description}: scrollport has no horizontal scroll range`));
          collect(activeFailures, () => assert.equal(active.active.background, tokens.background2, `${description}: active option resolves colorNeutralBackground2`));
          collect(activeFailures, () => assert.ok(
            active.active.boxShadow?.includes('inset')
              && active.active.boxShadow.includes(tokens.thicker)
              && active.active.boxShadow.includes(tokens.brand),
            `${description}: active option has the tokenized inset brand edge (${JSON.stringify(active.active)})`,
          ));
          collect(activeFailures, () => assert.deepEqual(
            active.active.padding,
            active.inactivePadding,
            `${description}: active treatment does not change option padding`,
          ));
          collect(activeFailures, () => assert.deepEqual(
            active.active.after,
            { bottom: '0px', left: '0px', right: '0px', top: '0px' },
            `${description}: Fluent active ring offsets are contained by the option box`,
          ));
          if (keyName === 'End') {
            collect(activeFailures, () => assert.ok(active.scrollport?.scrollTop > 0, `${description}: final option is reached by vertical scrolling`));
          }
        }
      }

      assert.deepEqual(activeFailures, [], activeFailures.join('\n\n'));
    });

    await t.test('chooser keyboard reaches the complete list, escapes in two stages, and retains chooser after a failed selection', async () => {
      // Arrange
      await navigate(page, 'chooser', 760, 'light', base);
      await focus(page, 'header input[role="combobox"]');
      await until(
        () => evaluate(page, `document.querySelector('header input[role="combobox"]')?.getAttribute('aria-expanded') === 'true'`),
        'open command-bar chooser',
      );
      const optionState = () => evaluate(page, `(() => {
        const input = document.querySelector('header input[role="combobox"]');
        const id = input?.getAttribute('aria-activedescendant');
        return {
          activeDescendant: id,
          activeText: id ? document.getElementById(id)?.textContent?.trim() : null,
          focused: document.activeElement === input,
          inputValue: input?.value,
          listboxOpen: input?.getAttribute('aria-expanded') === 'true',
          options: [...document.querySelectorAll('header [role="option"]')].map((node) => node.textContent?.trim()),
        };
      })()`);
      /** @type {string[]} */
      const keyboardFailures = [];

      // Act + Assert: keyboard traversal covers the complete, unwindowed result set.
      await key(page, 'ArrowDown');
      const afterArrow = await optionState();
      collect(keyboardFailures, () => assert.ok(afterArrow.activeDescendant, `ArrowDown supplies an active option: ${JSON.stringify(afterArrow)}`));
      await key(page, 'Home');
      const afterHome = await optionState();
      collect(keyboardFailures, () => assert.equal(afterHome.activeText, '001-feature-01', `Home reaches the first projected choice: ${JSON.stringify(afterHome)}`));
      await key(page, 'End');
      const afterEnd = await optionState();
      collect(keyboardFailures, () => assert.equal(afterEnd.activeText, '054-feature-50', `End reaches the final projected choice: ${JSON.stringify(afterEnd)}`));

      // Act + Assert: a zero-match query is announced without an empty listbox or viewport overflow.
      await page.send('Input.insertText', { text: 'not-a-feature' });
      await until(
        () => evaluate(page, `document.body.innerText.includes('No features match "not-a-feature".')`),
        'zero-match filtered count',
      );
      const zeroMatch = await evaluate(page, `(() => {
        const header = document.querySelector('header');
        const input = header?.querySelector('input[role="combobox"]');
        const listbox = header?.querySelector('[role="listbox"]');
        const empty = [...header.querySelectorAll('*')].find((node) => (
          node.textContent.trim() === 'No features match "not-a-feature".'
          && getComputedStyle(node).position === 'absolute'
        ));
        const rect = empty?.getBoundingClientRect();
        const listboxRect = listbox?.getBoundingClientRect();
        return {
          emptyLive: empty?.getAttribute('aria-live'),
          emptyText: empty?.textContent.trim(),
          emptyVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
          inputValue: input?.value,
          listboxVisible: Boolean(listboxRect && listboxRect.width > 0 && listboxRect.height > 0),
          liveText: [...header.querySelectorAll('[aria-live]')].map((node) => node.textContent.trim()),
          optionCount: header?.querySelectorAll('[role="option"]').length ?? 0,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      })()`);
      collect(keyboardFailures, () => assert.equal(zeroMatch.inputValue, 'not-a-feature'));
      collect(keyboardFailures, () => assert.equal(zeroMatch.optionCount, 0, `zero-match query has no options: ${JSON.stringify(zeroMatch)}`));
      collect(keyboardFailures, () => assert.equal(zeroMatch.listboxVisible, false, `zero-match query leaves no empty listbox artifact: ${JSON.stringify(zeroMatch)}`));
      collect(keyboardFailures, () => assert.equal(zeroMatch.emptyVisible, true, `zero-match explanation remains visible: ${JSON.stringify(zeroMatch)}`));
      collect(keyboardFailures, () => assert.equal(zeroMatch.emptyLive, null, `zero-match caption is not a second live region: ${JSON.stringify(zeroMatch)}`));
      collect(keyboardFailures, () => assert.equal(zeroMatch.emptyText, 'No features match "not-a-feature".'));
      collect(keyboardFailures, () => assert.deepEqual(
        zeroMatch.liveText,
        ['0 of 50 features match "not-a-feature".'],
        `stable live summary retains the approved zero-result count copy: ${JSON.stringify(zeroMatch)}`,
      ));
      collect(keyboardFailures, () => assert.equal(zeroMatch.overflow, false, `zero-match explanation does not overflow: ${JSON.stringify(zeroMatch)}`));

      // Act + Assert: first Escape clears the zero-match query, then second Escape closes while focus stays in the field.
      await key(page, 'Escape');
      await until(
        () => evaluate(page, `(() => {
          const input = document.querySelector('header input[role="combobox"]');
          return input?.value === ''
            && input.getAttribute('aria-expanded') === 'true'
            && document.querySelectorAll('header [role="option"]').length === 50;
        })()`),
        'first Escape query clear',
      );
      const cleared = await optionState();
      collect(keyboardFailures, () => assert.equal(cleared.listboxOpen, true, `first Escape leaves the list open: ${JSON.stringify(cleared)}`));
      collect(keyboardFailures, () => assert.equal(cleared.focused, true, `first Escape retains input focus: ${JSON.stringify(cleared)}`));
      await new Promise((resolve) => setTimeout(resolve, 50));
      await key(page, 'Escape');
      await until(
        () => evaluate(page, `document.querySelector('header input[role="combobox"]')?.getAttribute('aria-expanded') === 'false'`),
        'second Escape listbox close',
      );
      const closed = await optionState();
      collect(keyboardFailures, () => assert.equal(closed.focused, true, `second Escape retains input focus: ${JSON.stringify(closed)}`));
      collect(keyboardFailures, () => assert.equal(closed.inputValue, '', `second Escape retains cleared query: ${JSON.stringify(closed)}`));

      // Act: a physical click reopens the direct input. Its failed exact selection keeps chooser mode.
      await click(page, 'header input[role="combobox"]');
      await until(
        () => evaluate(page, `document.querySelector('header input[role="combobox"]')?.getAttribute('aria-expanded') === 'true'`),
        'click reopening direct chooser',
      );
      await page.send('Input.insertText', { text: 'dude' });
      await until(
        () => evaluate(page, `document.body.innerText.includes('1 of 50 features match "dude".')`),
        'failed-selection filter',
      );
      await key(page, 'ArrowDown');
      await key(page, 'Enter');
      await fixture.waitForRefresh('chooser');
      collect(keyboardFailures, () => assert.deepEqual(
       fixture.observations.refreshes.at(-1),
       { fixture: 'chooser', body: { target: 'dude-canvas-ui' } },
       'selecting canonical option 052 posts its slug rather than its visible identifier or raw path',
      ));
      const failedReadAnnouncement = await evaluate(
       page,
       `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'Reading 052-dude-canvas-ui.')`,
      );
      collect(keyboardFailures, () => assert.equal(
       failedReadAnnouncement,
       true,
       'a failed selection still announces the canonical numbered identifier while its exact slug is read',
      ));
      fixture.releaseRefresh('chooser');
      await until(
        () => evaluate(page, `document.querySelector('aside')?.innerText.includes('The selected feature could not be read completely')`),
        'failed selected-feature response',
      );
      const failure = await evaluate(page, `(() => ({
        comboboxes: document.querySelectorAll('[role="combobox"]').length,
        heading: document.querySelector('#feature-heading')?.textContent?.trim(),
        inputValue: document.querySelector('header input[role="combobox"]')?.value,
        selectedHeading: document.querySelector('#feature-heading')?.textContent?.includes('Dude Canvas UI'),
      }))()`);
      collect(keyboardFailures, () => assert.equal(failure.comboboxes, 1, `failed selection preserves chooser: ${JSON.stringify(failure)}`));
      collect(keyboardFailures, () => assert.equal(failure.heading, 'Choose a feature', `failed selection does not replace projection: ${JSON.stringify(failure)}`));
      collect(keyboardFailures, () => assert.equal(failure.inputValue, '', `failed chooser selection clears its uncommitted display: ${JSON.stringify(failure)}`));
      collect(keyboardFailures, () => assert.equal(failure.selectedHeading, false, `failed selection does not focus a false successor: ${JSON.stringify(failure)}`));
      const failedOpenedAnnouncement = await evaluate(
       page,
       `[...document.querySelectorAll('[role="status"]')].some((node) => node.textContent === 'Opened 052-dude-canvas-ui.')`,
      );
      collect(keyboardFailures, () => assert.equal(
       failedOpenedAnnouncement,
       false,
       'a failed selection must not announce an opened canonical identifier',
      ));
      screenshots.push(await screenshot(page, 'escape-result', 'chooser', 760, 'light', [
        'End reaches feature-50; Escape clears then closes while focus remains in the command-bar field',
        'failed dude-canvas-ui selection retains chooser mode and does not replace the projection',
      ]));
      assert.deepEqual(keyboardFailures, [], keyboardFailures.join('\n\n'));
    });

    await t.test('responsive anatomy is fluid at every required width in light and dark without overflow', async () => {
      const widths = [360, 520, 760, 960, 1079, 1080, 1200, 1440, 1920];
      /** @type {string[]} */
      const responsiveFailures = [];
      for (const theme of /** @type {const} */ (['light', 'dark'])) {
        for (const width of widths) {
          // Arrange + Act
          await navigate(page, 'lightweight', width, theme, base);
          // Assert
          const geometry = await evaluate(page, `(() => {
            const rect = (selector) => {
              const value = document.querySelector(selector).getBoundingClientRect();
              return { x: Math.round(value.x), y: Math.round(value.y), width: Math.round(value.width), height: Math.round(value.height) };
            };
            const shell = document.querySelector('header').parentElement;
            return {
              document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
              shell: rect('header'),
              header: rect('header'),
              rail: rect('nav[aria-label="Surfaces"]'),
              main: rect('main'),
              dock: rect('aside'),
              status: rect('footer'),
              statusPosition: getComputedStyle(document.querySelector('footer')).position,
              headlineWidth: Math.round(document.querySelector('[aria-labelledby="next-heading"] p').getBoundingClientRect().width),
              headlineMaxWidth: Math.ceil(Number.parseFloat(getComputedStyle(document.querySelector('[aria-labelledby="next-heading"] p')).maxWidth)),
              proseWidth: Math.round(document.querySelector('[aria-labelledby="activity-heading"] p:last-of-type').getBoundingClientRect().width),
              shellWidth: Math.round(shell.getBoundingClientRect().width),
              messageBars: [...document.querySelectorAll('aside .fui-MessageBar')].map((node) => ({
                clientWidth: node.clientWidth,
                overflowX: getComputedStyle(node).overflowX,
                scrollWidth: node.scrollWidth,
              })),
            };
          })()`);
          if (width === 360 && theme === 'light') {
            screenshots.push(await screenshot(page, 'minimum-overflow', 'lightweight', 360, 'light', [
              `actual document scrollWidth ${geometry.document.scrollWidth}px / clientWidth ${geometry.document.clientWidth}px`,
              'horizontal rail and static status bar',
            ]));
          }
          if (theme === 'light' && [360, 1079, 1080].includes(width)) {
            screenshotObservations.push(
              `${width}px light geometry: main x=${geometry.main.x} width=${geometry.main.width} y=${geometry.main.y}; dock x=${geometry.dock.x} width=${geometry.dock.width} y=${geometry.dock.y}; document ${geometry.document.scrollWidth}/${geometry.document.clientWidth}; MessageBars ${JSON.stringify(geometry.messageBars)}`,
            );
          }
          collect(responsiveFailures, () => assert.equal(geometry.document.scrollWidth, geometry.document.clientWidth, `${width}/${theme}: no horizontal overflow`));
          if (width === 360) {
            collect(responsiveFailures, () => assert.ok(
              geometry.messageBars.length > 0,
              `${width}/${theme}: attention message bars remain rendered`,
            ));
            for (const messageBar of geometry.messageBars) {
              collect(responsiveFailures, () => assert.equal(
                messageBar.scrollWidth,
                messageBar.clientWidth,
                `${width}/${theme}: attention message wraps without horizontal clipping (${JSON.stringify(messageBar)})`,
              ));
              collect(responsiveFailures, () => assert.notEqual(
                messageBar.overflowX,
                'clip',
                `${width}/${theme}: attention message is not CSS-clipped (${JSON.stringify(messageBar)})`,
              ));
            }
          }
          collect(responsiveFailures, () => assert.equal(geometry.shellWidth, width, `${width}/${theme}: shell uses host width without a permanent max width`));
          collect(responsiveFailures, () => assert.ok(
            geometry.headlineWidth <= geometry.headlineMaxWidth + 1,
            `${width}/${theme}: 36ch headline remains bounded (${JSON.stringify(geometry)})`,
          ));
          collect(responsiveFailures, () => assert.ok(geometry.proseWidth <= 900, `${width}/${theme}: 68ch prose remains bounded`));
          if (width < 720) {
            collect(responsiveFailures, () => assert.equal(geometry.rail.width, width, `${width}: rail becomes horizontal`));
            collect(responsiveFailures, () => assert.ok(geometry.main.y >= geometry.rail.y + geometry.rail.height, `${width}: work follows horizontal rail`));
            collect(responsiveFailures, () => assert.equal(geometry.statusPosition, 'static', `${width}: narrow status bar is document flow`));
          } else if (width < 1080) {
            collect(responsiveFailures, () => assert.ok(geometry.rail.width >= 47 && geometry.rail.width <= 49, `${width}: 48px activity rail`));
            collect(responsiveFailures, () => assert.ok(geometry.dock.y >= geometry.main.y + 1, `${width}: dock is below work at medium width`));
            collect(responsiveFailures, () => assert.equal(geometry.statusPosition, 'sticky', `${width}: medium status bar persists`));
          } else {
            collect(responsiveFailures, () => assert.ok(geometry.rail.width >= 47 && geometry.rail.width <= 49, `${width}: 48px activity rail`));
            collect(responsiveFailures, () => assert.ok(
              geometry.dock.x >= geometry.main.x + geometry.main.width - 1,
              `${width}: dock moves beside work at 1080 (${JSON.stringify(geometry)})`,
            ));
            collect(responsiveFailures, () => assert.ok(
              geometry.dock.width >= 300 && geometry.dock.width <= 340,
              `${width}: dock keeps approved range (${JSON.stringify(geometry)})`,
            ));
          }
        }
      }
      await navigate(page, 'lightweight', 360, 'light', base);
      screenshots.push(await screenshot(page, 'minimum', 'lightweight', 360, 'light', ['360px compatibility composition', 'horizontal rail', 'static status bar']));
      await navigate(page, 'lightweight', 960, 'light', base);
      screenshots.push(await screenshot(page, 'medium', 'lightweight', 960, 'light', ['medium rail/work with dock below']));
      assert.deepEqual(responsiveFailures, [], responsiveFailures.join('\n\n'));
    });

    await t.test('chooser text and interactive boundaries meet computed contrast thresholds in both themes', async () => {
      /** @type {Array<{theme:string,name:string,ratio:number,threshold:number,foreground:string,background:string}>} */
      const ratios = [];

      for (const theme of /** @type {const} */ (['light', 'dark'])) {
        // Arrange + Act
        await navigate(page, 'chooser', 760, theme, base);
        await focus(page, 'header input[role="combobox"]');
        await until(
          () => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 50`),
          `${theme} chooser contrast setup`,
        );
        const samples = [
          ...await computedContrastSamples(page, CHOOSER_OPEN_CONTRAST_SAMPLES),
        ];
        await page.send('Input.insertText', { text: 'not-a-feature' });
        await until(
          () => evaluate(page, `document.querySelectorAll('header [aria-live]').length === 1
            && document.body.innerText.includes('No features match "not-a-feature".')`),
          `${theme} zero-match contrast setup`,
        );
        samples.push(...await computedContrastSamples(page, CHOOSER_ZERO_CONTRAST_SAMPLES));

        // Assert
        assert.deepEqual(
          samples.map((sample) => sample.name),
          ['chooser option', 'chooser summary band', 'Combobox boundary', 'Combobox placeholder', 'zero-match caption'],
          `${theme}: all required chooser contrast samples are rendered`,
        );
        for (const sample of samples) {
          const threshold = sample.name === 'Combobox boundary' ? 3 : 4.5;
          const ratio = contrast(sample.foreground, sample.background);
          ratios.push({ theme, name: sample.name, ratio, threshold, foreground: sample.foreground, background: sample.background });
          assert.ok(
            ratio >= threshold,
            `${theme} ${sample.name}: ${ratio.toFixed(2)}:1 must meet ${threshold}:1`,
          );
        }
      }

      screenshotObservations.push(...ratios.map((item) => (
        `${item.theme} ${item.name}: ${item.ratio.toFixed(2)}:1 (minimum ${item.threshold}:1)`
      )));
    });

    await t.test('200% zoom equivalence, reduced motion, and computed WCAG contrast hold in both themes', async () => {
      /** @type {Array<{theme:string,name:string,ratio:number,threshold:number,foreground:string,background:string}>} */
      const ratios = [];
      for (const theme of /** @type {const} */ (['light', 'dark'])) {
        // A 720 CSS-pixel viewport is the responsive layout equivalent of a
        // 1440px host at 200% browser zoom. Page scale additionally verifies
        // the browser's visual-viewport zoom signal without changing layout.
        await navigate(page, 'lightweight', 720, theme, base);
        await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
        const zoom = await evaluate(page, `(() => ({
          scale: visualViewport.scale,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          essential: [
            document.querySelector('[aria-labelledby="next-heading"]'),
            document.querySelector('#lifecycle-heading'),
            document.querySelector('#phases-heading'),
            document.querySelector('#activity-heading'),
            document.querySelector('#properties-heading'),
            document.querySelector('#evidence-heading'),
            document.querySelector('footer[aria-label="Status"]'),
          ].every(Boolean)
        }))()`);
        assert.equal(zoom.scale, 2, `${theme}: CDP 200% visual viewport scale`);
        assert.equal(zoom.scrollWidth, zoom.clientWidth, `${theme}: 200% equivalent has no horizontal overflow`);
        assert.equal(zoom.essential, true, `${theme}: 200% retains essential regions`);
        await page.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

        const samples = await computedContrastSamples(page);
        for (const sample of samples) {
          const large = sample.fontSize >= 24 || (sample.fontSize >= 18.66 && sample.fontWeight >= 700);
          const threshold = /boundary/.test(sample.name) ? 3 : (large ? 3 : 4.5);
          const ratio = contrast(sample.foreground, sample.background);
          ratios.push({ theme, name: sample.name, ratio, threshold, foreground: sample.foreground, background: sample.background });
          assert.ok(ratio >= threshold, `${theme} ${sample.name}: ${ratio.toFixed(2)}:1 must meet ${threshold}:1`);
        }

        await page.send('Emulation.setEmulatedMedia', {
          media: '',
          features: [
            { name: 'prefers-color-scheme', value: theme },
            { name: 'prefers-reduced-motion', value: 'reduce' },
          ],
        });
        await page.send('Page.reload', { ignoreCache: true });
        await until(() => evaluate(page, `Boolean(document.querySelector('#feature-heading'))`), `${theme} reduced motion render`);
        const reduced = await evaluate(page, `(() => {
          const values = [...document.querySelectorAll('*')].map((node) => {
            const style = getComputedStyle(node);
            return { animation: style.animationDuration, transition: style.transitionDuration };
          });
          const remaining = document.getAnimations({ subtree: true }).map((animation) => animation.animationName ?? animation.constructor.name);
          return { values, remaining };
        })()`);
        assert.equal(
          reduced.values.every((value) => {
            const milliseconds = (duration) => Math.max(...duration.split(',').map((part) => {
              const number = Number.parseFloat(part);
              return part.includes('ms') ? number : number * 1000;
            }));
            return milliseconds(value.animation) <= 10 && milliseconds(value.transition) <= 10;
          }),
          true,
          `${theme}: authored reduced-motion durations collapse to 0.01s or less`,
        );
        screenshotObservations.push(`${theme} reduced-motion residual animations: ${reduced.remaining.length}`);
      }
      await page.send('Emulation.setEmulatedMedia', {
        media: '',
        features: [{ name: 'prefers-color-scheme', value: 'light' }],
      });
      assert.ok(ratios.some((item) => item.name === 'complete marker'));
      assert.ok(ratios.some((item) => item.name === 'dock Later text'));
      screenshotObservations.push(...ratios.map((item) => (
        `${item.theme} ${item.name}: ${item.ratio.toFixed(2)}:1 (minimum ${item.threshold}:1)`
      )));
    });

    await t.test('the actual bundle reaches only its loopback read APIs, EventSource, and viewport report', async () => {
      await navigate(page, 'lightweight', 1200, 'light', base);
      await until(() => fixture.observations.events > 0 && fixture.observations.viewport > 0, 'EventSource and viewport reports');
      const paths = new Set(fixture.observations.calls.map((call) => call.path));
      for (const expected of ['/', '/assets/app.js', '/api/projection', '/api/freshness', '/api/viewport', '/events', '/api/refresh']) {
        assert.ok(paths.has(expected), `actual browser reached ${expected}`);
      }
      assert.ok(network.every(({ url }) => url.startsWith(base)), `no external or CDN request: ${JSON.stringify(network)}`);
      assert.equal(
        fixture.observations.calls.some((call) => /(?:send|message|answer|approval|stop|command|abort|replay|review)/i.test(call.path)),
        false,
        'no prohibited capability route is reached',
      );
    });

    await t.test('real provider: canonical selection, no-database fallback, refusal, replacement, and source freshness', async (flow) => {
      // Arrange: lazy import keeps T001 prerequisite probes dependency-free.
      const { openInstance, closeInstance } = await import('../../src/extensions/dude/lib/canvas-server.mjs');
      const originalPath = process.env.PATH;
      const provider = createProviderFixture();
      const instanceId = `browser-${path.basename(provider.directory)}`;
      const requests = [];
      const completed = new Set();
      let origin;
      let instance;
      let succeeded = false;
      const inputSelector = 'header input[role="combobox"]';
      const value = () => evaluate(page, `document.querySelector('${inputSelector}')?.value`);
      const main = () => evaluate(page, `document.querySelector('main')?.innerText`);
      const statuses = () => evaluate(page, `[...document.querySelectorAll('[role="status"]')].map(node => node.textContent.trim())`);
      const recordRequest = ({ requestId, request }) => {
        if (!origin || !request.url.startsWith(`${origin}/`)) return;
        requests.push({
          id: requestId, url: request.url, method: request.method,
          path: new URL(request.url).pathname,
          ...(request.postData ? { body: JSON.parse(request.postData) } : {}),
        });
      };
      const recordCompleted = ({ requestId }) => completed.add(requestId);
      page.on('Network.requestWillBeSent', recordRequest);
      page.on('Network.loadingFinished', recordCompleted);
      const readResponse = async (request) => {
        await until(() => completed.has(request.id), `${request.method} ${request.path} response`, 5_000);
        const response = await page.send('Network.getResponseBody', { requestId: request.id });
        return JSON.parse(response.body);
      };
      const select017 = async () => {
        const previous = requests.filter(({ path }) => path === '/api/refresh').length;
        if (await evaluate(page, `document.querySelector('${inputSelector}')?.getAttribute('aria-expanded') !== 'true'`)) {
          await click(page, inputSelector);
        }
        await page.send('Input.insertText', { text: '017' });
        await until(() => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 1
          && document.querySelector('header [role="option"]')?.textContent.trim() === '017-feature-17'`), '017 filtered option');
        await click(page, 'header [role="option"]');
        return until(() => requests.filter(({ path }) => path === '/api/refresh')[previous], '017 POST target', 1_500);
      };
      try {
        instance = await openInstance(instanceId, () => {}, null, { root: provider.root, target: 'feature-01' });
        origin = new URL(instance.url).origin;
        await navigate(page, null, 760, 'light', origin);
        await until(() => instance.eventClients.size === 1, 'production EventSource attachment');
        const initialRequest = requests.find(({ path }) => path === '/api/projection');
        assert.ok(initialRequest, 'renderer requested the production projection');
        const initial = await readResponse(initialRequest);
        assert.equal(initial.projection.complete, true);
        assert.equal(initial.projection.selected.slug, 'feature-01');
        assert.equal(initial.projection.authority, 'lightweight');
        assert.equal(initial.projection.choices.length, 50);
        assert.deepEqual(initial.projection.diagnostics, []);
        assert.equal(await value(), '001-feature-01');
        const before = await main();
        assert.match(before, /Inspect the initial committed feature/);

        // Act: one physical click opens all 50; query text alone cannot commit.
        await click(page, inputSelector);
        await until(() => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 50`), 'production full inventory');
        const inventory = await evaluate(page, `[...document.querySelectorAll('header [role="option"]')].map(node => node.textContent.trim())`);
        assert.deepEqual(inventory, MANY_CHOICES.map(({ ideaPath }) => path.posix.basename(ideaPath, '.md')));
        assert.equal(await evaluate(page, `document.querySelector('header [role="option"][aria-selected="true"]')?.textContent.trim()`), '001-feature-01');
        await page.send('Input.insertText', { text: '052' });
        await until(() => evaluate(page, `document.querySelectorAll('header [role="option"]').length === 1`), '052 filtered option');
        assert.equal(await value(), '052');
        assert.equal(await main(), before, 'typing preserves all committed facts');
        assert.equal(requests.filter(({ path }) => path === '/api/refresh').length, 0, 'typing sends no selection');

        provider.setOutcome('absent', true);
        await click(page, 'header [role="option"]');
        const held = await until(() => provider.calls().find(({ held }) => held), 'held production bd child', 1_500);
        const pendingStarted = Date.now();
        try {
          const selection = requests.find(({ path }) => path === '/api/refresh');
          assert.deepEqual(selection?.body, { target: 'dude-canvas-ui' }, 'one activation posts only the semantic slug');
          assert.equal(requests.filter(({ path }) => path === '/api/refresh').length, 1);
          assert.deepEqual(held.args, ['list', '--all', '--limit', '0', '--json']);
          assert.equal(held.outcome, 'absent');
          assert.equal(await main(), before, 'held read preserves the old heading and every fact');
          assert.equal(await value(), '052-dude-canvas-ui', 'pending display identifies the request, not a committed replacement');
          assert.ok((await statuses()).includes('Reading 052-dude-canvas-ui.'), 'pending announcement names the requested 052');
          assert.equal((await statuses()).some((text) => text === 'Opened 052-dude-canvas-ui.'), false);
          screenshots.push(await screenshot(page, 'pending-052', 'real-provider', 760, 'light', [
            'Held real bd child; pending 052 display/announcement with committed 001 heading and facts',
          ]));
        } finally {
          process.kill(held.pid, 'SIGUSR1');
        }
        assert.ok(Date.now() - pendingStarted < 2_000, 'release the observed barrier well inside the production deadline');
        const accepted052 = await readResponse(requests.find(({ path }) => path === '/api/refresh'));
        assert.equal(accepted052.replaced, true);
        assert.equal(accepted052.freshness.state, 'current');
        assert.equal(accepted052.projection.complete, true);
        assert.equal(accepted052.projection.authority, 'lightweight');
        assert.deepEqual(accepted052.projection.diagnostics, []);
        assert.equal(accepted052.projection.selected.specPath, '.dude/specs/052-dude-canvas-ui/spec.md');
        assert.deepEqual(accepted052.projection.tasks, { total: 5, open: 1, inProgress: 1, blocked: 0, done: 3 });
        assert.deepEqual(accepted052.projection.phases.map(({ name }) => name), ['Foundation', 'Acceptance']);
        assert.equal(accepted052.projection.activity.total, 2);
        assert.equal(accepted052.projection.activity.recent[0].text, 'Browser acceptance was requested.');
        assert.equal(accepted052.projection.latestEvent.source.path, '.dude/ideas/052-dude-canvas-ui.md');
        assert.deepEqual(accepted052.projection.next.source, T013_NEXT_SOURCE, 'long Next comes from canonical task bytes');
        const absenceCalls = provider.calls().filter(({ outcome }) => outcome === 'absent');
        assert.ok(absenceCalls.length >= 2, 'absence stays stable through the source-identity recheck');
        assert.ok(absenceCalls.every(({ args }) => JSON.stringify(args) === JSON.stringify(['list', '--all', '--limit', '0', '--json'])),
          'no bd ready probe for recognized database absence');
        await until(async () => await value() === '052-dude-canvas-ui' && (await activeElement(page)).id === 'feature-heading', '052 commit and heading focus');
        const committed052 = await main();
        assert.match(committed052, /Dude Canvas UI/);
        assert.match(committed052, /Browser acceptance was requested/);
        assert.ok((await statuses()).includes('Opened 052-dude-canvas-ui.'));
        assert.equal(await evaluate(page, `document.querySelector('section[aria-labelledby="next-heading"] .fui-Title3')?.textContent.trim()`),
          'Run final unchanged-revision verification.');
        const evidenceSelector = 'section[aria-labelledby="evidence-heading"] button';
        await focus(page, evidenceSelector);
        await key(page, 'Enter');
        await until(() => evaluate(page, `document.querySelector('${evidenceSelector}')?.getAttribute('aria-expanded') === 'true'`), 'real task-source disclosure');
        const disclosedSource = await evaluate(page, `(() => {
          const label = [...document.querySelectorAll('section[aria-labelledby="evidence-heading"] dt')]
            .find(node => node.textContent.trim() === 'Next source');
          return label?.nextElementSibling?.querySelector('code')?.textContent;
        })()`);
        assert.deepEqual(JSON.parse(disclosedSource), T013_NEXT_SOURCE, 'renderer discloses the exact real task source');
        await key(page, 'Enter');
        screenshots.push(await screenshot(page, 'accepted-052', 'real-provider', 760, 'light', [
          'Production openInstance/readNowProjection over 50 canonical ledgers',
          'One-click selection; held bd read released with exact no-database stderr, empty stdout, exit 1',
          'Complete Lightweight facts and exact long Next source',
        ]));

        // Act + Assert: an unrelated nonzero read refuses, retaining all of 052.
        provider.setOutcome('failure');
        const failedRequest = await select017();
        assert.deepEqual(failedRequest.body, { target: 'feature-17' });
        const refused = await readResponse(failedRequest);
        assert.equal(refused.replaced, false);
        assert.equal(refused.freshness.state, 'unavailable', 'production distinguishes unreadable authority from other stale reads');
        assert.match(refused.freshness.message, /last complete read was preserved/);
        assert.deepEqual(refused.projection, accepted052.projection);
        assert.ok(refused.freshness.diagnostics.some(({ code }) => code === 'TRACKED_AUTHORITY_UNAVAILABLE'));
        await until(() => evaluate(page, `document.querySelector('${inputSelector}')?.getAttribute('aria-invalid') === 'true'`), 'production selection refusal');
        assert.equal(await value(), '052-dude-canvas-ui');
        assert.equal(await main(), committed052);
        assert.match(await evaluate(page, `document.querySelector('aside').innerText`), /Read unavailable/);
        assert.match(await evaluate(page, `document.querySelector('aside').innerText`), /last complete read was preserved/);
        assert.ok((await statuses()).includes('017-feature-17 could not be opened. 052-dude-canvas-ui is still the open feature.'));
        assert.equal((await statuses()).includes('Opened 017-feature-17.'), false);
        screenshots.push(await screenshot(page, 'refused-017', 'real-provider', 760, 'light', [
          'Generic bd exit 1 reports unavailable authority and preserves the last complete read',
          'Committed 052 value, heading, and all rendered facts retained',
        ]));

        provider.setOutcome('empty');
        const retryRequest = await select017();
        assert.notEqual(retryRequest.id, failedRequest.id);
        assert.deepEqual(retryRequest.body, { target: 'feature-17' });
        const accepted017 = await readResponse(retryRequest);
        assert.equal(accepted017.replaced, true);
        assert.equal(accepted017.projection.complete, true);
        assert.equal(accepted017.projection.selected.specPath, '.dude/specs/017-feature-17/spec.md');
        assert.deepEqual(accepted017.projection.tasks, { total: 2, open: 0, inProgress: 1, blocked: 0, done: 1 });
        await until(async () => await value() === '017-feature-17' && (await activeElement(page)).id === 'feature-heading', '017 replacement and heading focus');
        assert.ok((await statuses()).includes('Opened 017-feature-17.'));
        const committed017 = await main();
        assert.match(committed017, /Validate the selected feature before handoff/);

        // Act: edit only disposable selected source. Synthetic focus exercises
        // the renderer listener; it is not a claim about Copilot host focus.
        provider.changeSelectedSource();
        const freshnessCount = requests.filter(({ path }) => path === '/api/freshness').length;
        const announcement = await statuses();
        await evaluate(page, `window.dispatchEvent(new Event('focus'))`);
        await until(() => requests.filter(({ path }) => path === '/api/freshness').length > freshnessCount, 'real GET freshness from focus listener');
        const freshnessRequest = requests.filter(({ path }) => path === '/api/freshness').at(-1);
        assert.equal(freshnessRequest.method, 'GET');
        const changed = await readResponse(freshnessRequest);
        assert.equal(changed.freshness.state, 'changed');
        assert.deepEqual(changed.projection, accepted017.projection, 'freshness route never replaces the committed projection');
        await until(() => evaluate(page, `document.querySelector('aside')?.innerText.includes('Repository changed')`), 'changed-source indication');
        assert.equal(await main(), committed017, 'changed-source indication leaves all old facts intact');
        assert.deepEqual(await statuses(), announcement, 'background freshness does not announce replacement');
        assert.equal((await activeElement(page)).id, 'feature-heading');
        screenshots.push(await screenshot(page, 'changed-017', 'real-provider', 760, 'light', [
          'Synthetic focus reached real freshness route and detected edited task bytes without replacement',
        ]));

        const refreshCount = requests.filter(({ path }) => path === '/api/refresh').length;
        await clickRefresh(page);
        const refreshRequest = await until(() => requests.filter(({ path }) => path === '/api/refresh')[refreshCount], 'explicit Refresh POST', 1_500);
        assert.deepEqual(refreshRequest.body, {}, 'Refresh uses the committed production target');
        const refreshed = await readResponse(refreshRequest);
        assert.equal(refreshed.replaced, true);
        assert.equal(refreshed.freshness.state, 'current');
        assert.equal(refreshed.projection.complete, true);
        assert.deepEqual(refreshed.projection.diagnostics, []);
        assert.equal(refreshed.projection.selected.slug, 'feature-17');
        assert.equal(refreshed.projection.stage, 'Verified');
        assert.deepEqual(refreshed.projection.tasks, { total: 2, open: 0, inProgress: 0, blocked: 0, done: 2 });
        assert.equal(refreshed.projection.nextReason, 'All canonical tasks are complete.', 'canonical reason remains in the API data');
        await until(() => evaluate(page, `document.querySelector('aside')?.innerText.includes('Current complete read')
          && document.querySelector('[aria-labelledby="next-heading"] .fui-Title3')?.textContent === 'All tasks complete'`), 'new complete facts after explicit refresh');
        await assertCompletedCard(page, 2);
        assert.notEqual(await main(), committed017);
        assert.equal(await value(), '017-feature-17');
        assert.equal((await activeElement(page)).text, 'Refresh');
        screenshots.push(await screenshot(page, 'refreshed-017', 'real-provider', 760, 'light', [
          'Explicit production Refresh replaces changed source with two done tasks and current freshness',
        ]));
        // A failed read after completion must retain the completed facts AND the
        // existing freshness warning; completion is not a freshness override.
        const completed017 = await main();
        provider.setOutcome('failure');
        const completedRefreshCount = requests.filter(({ path }) => path === '/api/refresh').length;
        await clickRefresh(page);
        const failedCompletedRequest = await until(
          () => requests.filter(({ path }) => path === '/api/refresh')[completedRefreshCount],
          'Refresh of completed feature', 1_500,
        );
        const failedCompleted = await readResponse(failedCompletedRequest);
        assert.equal(failedCompleted.replaced, false);
        assert.equal(failedCompleted.freshness.state, 'unavailable');
        assert.deepEqual(failedCompleted.projection, refreshed.projection);
        await until(() => evaluate(page, `document.querySelector('aside')?.innerText.includes('Read unavailable')`), 'completed read freshness warning');
        assert.equal(await main(), completed017, 'last complete facts remain intact');
        await assertCompletedCard(page, 2);
        assert.match(await evaluate(page, `document.querySelector('aside').innerText`), /last complete read was preserved/);
        assert.equal((await activeElement(page)).text, 'Refresh');
        screenshots.push(await screenshot(page, 'completed-read-unavailable', 'real-provider', 760, 'light', [
          'Failed real-provider Refresh retains the two-task completion card alongside Read unavailable',
        ]));
        const allowed = new Set(['GET /', 'GET /assets/app.js', 'GET /favicon.ico',
          'GET /api/projection', 'GET /api/freshness', 'GET /events', 'POST /api/refresh', 'POST /api/viewport']);
        assert.ok(requests.every(({ method, path }) => allowed.has(`${method} ${path}`)), 'production route allowlist only');
        for (const route of ['GET /api/projection', 'GET /api/freshness', 'POST /api/refresh', 'GET /events', 'POST /api/viewport']) {
          assert.ok(requests.some(({ method, path }) => `${method} ${path}` === route), `renderer reached ${route}`);
        }
        assert.ok(network.every(({ url }) => url.startsWith(base) || url.startsWith(`${origin}/`)), 'both flows stay on their loopback servers');
        assert.ok(provider.calls().every(({ args }) => JSON.stringify(args) === JSON.stringify(['list', '--all', '--limit', '0', '--json'])));
        succeeded = true;
      } catch (error) {
        screenshots.push(await screenshot(page, 'failure', 'real-provider', 760, 'light', [String(error)])
          .catch(() => ({ observations: ['Could not capture failed production flow'] })));
        throw error;
      } finally {
        screenshotObservations.push(`Real-provider routes: ${JSON.stringify(requests)}`);
        screenshotObservations.push(`Real-provider bd calls: ${JSON.stringify(provider.calls())}`);
        const cleanupErrors = [];
        for (const cleanup of [
          () => page.send('Page.navigate', { url: 'about:blank' }),
          () => closeInstance(instanceId),
          () => provider.close(),
        ]) {
          try { await cleanup(); } catch (error) { cleanupErrors.push(String(error)); }
        }
        page.listeners.get('Network.requestWillBeSent')?.splice(page.listeners.get('Network.requestWillBeSent').indexOf(recordRequest), 1);
        page.listeners.get('Network.loadingFinished')?.splice(page.listeners.get('Network.loadingFinished').indexOf(recordCompleted), 1);
        if (cleanupErrors.length) flow.diagnostic(`Production fixture cleanup: ${cleanupErrors.join('; ')}`);
        if (succeeded) {
          assert.deepEqual(cleanupErrors, []);
          assert.equal(process.env.PATH, originalPath);
          assert.equal(fs.existsSync(provider.directory), false);
          assert.equal(instance.server.listening, false);
          assert.equal(instance.eventClients.size, 0);
        }
      }
    });

    await t.test('production fixture cleanup reaps a held acquisition after an assertion failure', async () => {
      // Arrange: exercise this fixture's failure path, not a new process framework.
      const { openInstance, closeInstance } = await import('../../src/extensions/dude/lib/canvas-server.mjs');
      const originalPath = process.env.PATH;
      const provider = createProviderFixture();
      const instanceId = `cleanup-${path.basename(provider.directory)}`;
      let child;
      let startup;

      // Act
      await assert.rejects(async () => {
        try {
          provider.setOutcome('empty', true);
          startup = openInstance(instanceId, () => {}, null, { root: provider.root, target: 'feature-01' })
            .catch((error) => error);
          child = await until(() => provider.calls().find(({ held }) => held), 'cleanup fixture held child', 1_500);
          assert.fail('deliberate fixture assertion failure');
        } finally {
          try { await closeInstance(instanceId); } finally { await provider.close(); }
        }
      }, /deliberate fixture assertion failure/);

      // Assert
      assert.match((await startup).message, /startup was cancelled/);
      assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
      assert.equal(process.env.PATH, originalPath);
      assert.equal(fs.existsSync(provider.directory), false);
      assert.equal(await closeInstance(instanceId), false, 'no production instance remains');
    });
  } finally {
    page.close();
    try {
      await stopBrowser(browser);
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
});

// @ts-check
/**
 * Work driver tests: one actual core release integration plus the driver-owned
 * boundary cases. Every workspace, run directory, ownership store, and scratch
 * file lives under a fresh short test-owned temporary root. Child processes get
 * that root's own TEMP and a PATH without the host's Beads, so neither the
 * host's ownership store nor its Beads inventory can reach a result.
 * Test-controlled specialist records here are fixture data, not verification
 * or review of any real task.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { buildRelease } from '../../../scripts/build-release.mjs';
import { prepareSpecialistResult } from './host-adapter.mjs';
import { canonicalJson, prepareLearningReviewV2, sha256 } from './recovery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SOURCE_DRIVER = path.join(HERE, 'driver.mjs');
const IDEA = '.dude/ideas/001-demo.md';
const SPEC = '.dude/specs/001-demo/spec.md';
const TASKS = '.dude/specs/001-demo/tasks.md';
const SNAPSHOT = '.dude/state/task-state.json';
const STORE = 'dude-work-host-adapter-v1';
const T1 = 'T001@aaaaaaaa';
const T2 = 'T002@bbbbbbbb';
const SHIP_ARGS = ['--max', 'unlimited', '--recover-on-block', '--recovery-cycles', 'unlimited', '--policy', 'autonomous'];
const SHIP_POLICY = { overall: 'unlimited', recovery: 'unlimited', recover: true, untilBlocked: false, mode: 'autonomous' };
const FINITE_ARGS = ['--max', '2', '--recover-on-block', '--recovery-cycles', '1', '--policy', 'autonomous'];
const FINITE_POLICY = { overall: 2, recovery: 1, recover: true, untilBlocked: false, mode: 'autonomous' };
const CLAIM_LINE = /^- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z - work: Claimed (T\d{3}@[a-z0-9]{8}) for the user-authorized autonomous Work invocation; implementation has not started\.$/;
const DEPENDENT_TASKS = [
  `- [ ] ${T1} Change the demo product files.`,
  `- [ ] ${T2} Follow up on the demo.`,
  `    deps: ${T1}`,
];

/** @param {{slug?:string, specPath?:string, finalLf?:boolean}} [options] */
function ideaText({ slug = 'demo', specPath = SPEC, finalLf = true } = {}) {
  const text = [
    '---', `title: ${slug}`, `slug: ${slug}`, 'status: defined', `spec_path: ${specPath}`, '---', '',
    '## Idea', '', 'Drive fixture tasks through the Work driver.', '',
    '## Coordinator Log', '', '- 2026-10-17T00:00:00Z - define: Seeded the fixture.',
  ].join('\n');
  return finalLf ? `${text}\n` : text;
}

/** @param {string[]} lines @param {boolean} [breadcrumb] */
function tasksText(lines, breadcrumb = true) {
  return [
    ...(breadcrumb ? [`<!-- audit log: ${IDEA}#coordinator-log -->`] : []),
    '# Tasks', '', '## Phase 1', '', ...lines, '',
  ].join('\n');
}

/** @param {string} root @param {string} relative @param {string} text */
function write(root, relative, text) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** @param {string} root @param {string} relative */
function read(root, relative) {
  return fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');
}

/** @param {string} file @returns {any} */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** @param {string} file @param {unknown} value */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/** @param {string} ws @param {{tasks?:string[], idea?:string, extra?:Record<string, string>}} [options] */
function seed(ws, { tasks = DEPENDENT_TASKS, idea = ideaText(), extra = {} } = {}) {
  write(ws, IDEA, idea);
  write(ws, SPEC, '# Spec\n');
  write(ws, '.dude/specs/001-demo/plan.md', '# Plan\n');
  write(ws, TASKS, tasksText(tasks));
  write(ws, 'src/demo.txt', 'before\n');
  for (const [relative, text] of Object.entries(extra)) write(ws, relative, text);
}

/** Relative path -> content hash for every file below a directory; absent directories are empty. @param {string} dir */
function tree(dir) {
  /** @type {Record<string, string>} */
  const files = {};
  /** @param {string} current */
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files[path.relative(dir, absolute).split(path.sep).join('/')] = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    }
  };
  walk(dir);
  return files;
}

/** @param {string} text @param {string} taskKey */
function glyphOf(text, taskKey) {
  return new RegExp(`^- \\[(.)\\] ${taskKey} `, 'm').exec(text)?.[1] ?? null;
}

/** @param {string} ws */
function claimLines(ws) {
  return read(ws, IDEA).split('\n').filter((line) => CLAIM_LINE.test(line));
}

/** Every v2 event line in the lane history, in order. @param {string} ws */
function laneEvents(ws) {
  return historyLines(ws).map((line) => JSON.parse(line.slice('- dude-run-event: '.length)));
}

/** The exact lane-history event lines, in order. @param {string} ws */
function historyLines(ws) {
  return read(ws, TASKS).split('\n').filter((line) => line.startsWith('- dude-run-event: '));
}

/** @param {string} ws */
function approachEvents(ws) {
  return laneEvents(ws).filter((event) => event.type === 'approach-occurrence');
}

/** The decoded substantive records of one original capture. @param {any} capture @returns {any[]} */
function captureRecords(capture) {
  return JSON.parse(Buffer.from(capture.bytes.base64, 'base64').toString('utf8')).records
    .map((/** @type {any} */ entry) => entry.substantive);
}

/**
 * One short test-owned root: `ws` workspace, `tmp` child TEMP (ownership store
 * and default run directories), `bin` child PATH, and `io` scratch. Disposal
 * waits for every spawned child before removing exactly this root.
 * @param {import('node:test').TestContext} t
 */
function makeFixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dwt-')));
  const fixture = {
    root,
    ws: path.join(root, 'ws'),
    tmp: path.join(root, 'tmp'),
    bin: path.join(root, 'bin'),
    io: path.join(root, 'io'),
    /** Extra child environment this fixture's own tests set. @type {Record<string, string>} */
    env: {},
    /** @type {{child: import('node:child_process').ChildProcess, exit: Promise<unknown>}[]} */
    children: [],
  };
  for (const dir of [fixture.tmp, fixture.bin, fixture.io]) fs.mkdirSync(dir);
  t.after(async () => {
    for (const { child } of fixture.children) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    await Promise.allSettled(fixture.children.map(({ exit }) => exit));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return fixture;
}

/** @param {ReturnType<typeof makeFixture>} fixture */
function childEnv(fixture) {
  const inherited = Object.entries(process.env)
    .filter(([key]) => !/^(path|temp|tmp|tmpdir|node_test_context)$/i.test(key));
  return {
    ...Object.fromEntries(inherited), PATH: fixture.bin, TEMP: fixture.tmp, TMP: fixture.tmp, TMPDIR: fixture.tmp, ...fixture.env,
  };
}

/**
 * Put a fixture Beads answering the inventory query with one imported issue on
 * the child PATH. Node's non-shell spawn runs no script on Windows, so there the
 * fixture is a test-owned copy of this Node binary named bd.exe with a preload
 * that acts only inside that exact executable; elsewhere it is a shell script.
 * The driver keeps its fixed `bd` command, and the host's Beads stays off PATH.
 * @param {ReturnType<typeof makeFixture>} fixture
 */
function fixtureBeads(fixture) {
  const inventory = '[{"id":"fixture-1","status":"open"}]';
  if (process.platform !== 'win32') {
    const stub = path.join(fixture.bin, 'bd');
    fs.writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n' '${inventory}'\n`);
    fs.chmodSync(stub, 0o755);
    return;
  }
  const executable = path.join(fixture.bin, 'bd.exe');
  fs.copyFileSync(process.execPath, executable);
  const preload = path.join(fixture.io, 'bd-preload.cjs');
  fs.writeFileSync(preload, [
    "const fs = require('node:fs');",
    // Every Node child inherits the preload; only the test-owned bd.exe answers.
    `if (fs.realpathSync.native(process.execPath).toLowerCase() === ${JSON.stringify(fs.realpathSync.native(executable).toLowerCase())}) {`,
    `  fs.writeSync(1, ${JSON.stringify(`${inventory}\n`)});`,
    '  process.exit(0);',
    '}',
    '',
  ].join('\n'));
  fixture.env.NODE_OPTIONS = `--require "${preload.split(path.sep).join('/')}"`;
}

/**
 * @typedef {{code:number|null, stdout:string, stderr:string}} Exit
 * @param {ReturnType<typeof makeFixture>} fixture @param {string[]} args @param {string} [driver]
 */
function start(fixture, args, driver = SOURCE_DRIVER) {
  const child = spawn(process.execPath, [driver, ...args], {
    cwd: fixture.root,
    env: childEnv(fixture),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  /** @type {Promise<Exit>} */
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
  fixture.children.push({ child, exit });
  return { child, exit, stdout: () => stdout };
}

/** One driver call and its single JSON report. @param {ReturnType<typeof makeFixture>} fixture @param {string[]} args @param {string} [driver] */
async function call(fixture, args, driver) {
  const result = await start(fixture, args, driver).exit;
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    // Usage errors and unexpected failures print no report.
  }
  return { ...result, json };
}

/** @param {Exit & {json:any}} result @param {number} code @param {string} label */
function expectExit(result, code, label) {
  assert.equal(result.code, code, `${label}: exit ${result.code}\n${result.stdout}\n${result.stderr}`);
  return result.json;
}

/**
 * Wait for a published status, never a fixed sleep. A finished run that does
 * not match fails at once with its terminal status.
 * @param {string} dir @param {(status: any) => boolean} predicate @param {string} label
 */
async function waitForStatus(dir, predicate, label) {
  const file = path.join(dir, 'status.json');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    let status = null;
    try {
      status = readJson(file);
    } catch {
      // Not yet published.
    }
    if (status && predicate(status)) return status;
    if (status?.state === 'finished') assert.fail(`${label}: the run finished first: ${JSON.stringify(status)}`);
    await sleep(25);
  }
  return assert.fail(`${label}: timed out waiting for the run status`);
}

/** @param {{stdout: () => string}} runner */
async function startedDirectory(runner) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const line = runner.stdout().split('\n').find((entry) => entry.startsWith('{"event":"started"'));
    if (line) return JSON.parse(line).dir;
    await sleep(25);
  }
  return assert.fail('the run never reported its directory');
}

/** @param {string} label @param {'passed'|'failed'} outcome @param {string} [evidence] */
function check(label, outcome = 'passed', evidence = `fixture evidence: ${label} ${outcome}`) {
  return { definition: `fixture check: ${label}`, outcome, evidence };
}

/** @param {string} label @param {string} [observed] the observed evidence; the basis stays stable */
function finding(label, observed = `fixture observation: ${label}`) {
  return {
    basis: {
      expectation: { kind: 'governing-rule', reference: `fixture rule: ${label}` },
      subjects: [T1],
      failureClass: 'review-rejection',
      checkDefinition: `fixture check: ${label}`,
    },
    observation: { kind: 'observed-evidence', evidence: observed },
  };
}

test('release bundle: the installed driver claims, bridges, settles, and continues with carried state', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  const built = buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  assert.ok(built.files.includes('.github/skills/dude-work/driver.mjs'), 'the core release ships the driver');
  assert.equal(built.files.some((file) => file.endsWith('.test.mjs')), false, 'the release ships no tests');
  assert.deepEqual(fs.readdirSync(path.join(fixture.ws, '.github', 'skills')).filter((name) => name.startsWith('dude-pack-')), []);
  seed(fixture.ws);
  const ws = fs.realpathSync(fixture.ws);
  const ownerBefore = read(ws, IDEA);

  // Claim with Ship's forwarded unlimited controls and the default run location.
  const claimed = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, 'claim');
  assert.equal(path.dirname(claimed.out), fixture.tmp, 'the default claim directory is under the temporary directory');
  assert.match(path.basename(claimed.out), /^dw-/);
  const report = readJson(claimed.report);
  assert.deepEqual(
    report.steps.filter((row) => row.outcome === 'accepted').map((row) => [row.operation, row.reason]),
    [
      ['fresh-inspection', 'inspection-refreshed'],
      ['authorize-lane-effect', 'lane-permit-issued'],
      ['apply-lane-effect', 'lane-mutation-applied'],
      ['commit-lane-receipt', 'lane-receipt-committed'],
    ],
    'setup keeps the required order and commits its claim receipt',
  );
  assert.equal(report.steps.some((row) => row.operation === 'settle-effect'), false, 'settle-effect is never called for the claim');
  assert.match(report.receipt.receiptHash, /^[0-9a-f]{64}$/);
  assert.equal(report.pair.status, 'absent');
  const request = readJson(claimed.runnerRequest);
  assert.deepEqual(request.target, { specPath: SPEC, lane: 'lightweight', taskKey: T1 });
  assert.deepEqual(request.owner, { ideaPath: IDEA, specPath: SPEC });
  assert.equal(request.root, ws);
  assert.equal(
    canonicalJson(request.state),
    canonicalJson({ policy: SHIP_POLICY, overallUsed: 0, recoveryUsed: [], pending: [], completed: [] }),
    'the first claim carries the validated empty state with the parsed policy',
  );
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
  assert.equal(readJson(path.join(ws, SNAPSHOT))[TASKS].glyphs[T1], '~');
  const claimedOwner = read(ws, IDEA);
  assert.equal(claimedOwner.slice(0, ownerBefore.length), ownerBefore, 'the claim only appends to the owner log');
  assert.deepEqual(claimLines(ws).map((line) => CLAIM_LINE.exec(line)?.[1]), [T1]);

  // Run with the default exchange directory; answer each published challenge.
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest], driver);
  const dir = await startedDirectory(runner);
  assert.equal(path.dirname(dir), fixture.tmp, 'the default exchange directory is under the temporary directory');
  assert.match(path.basename(dir), /^dw-/);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'assessment');
  assert.equal(first.kind, 'assessment');
  assert.ok(fs.existsSync(first.packet), 'the model packet is published beside its challenge');
  const input = writeJson(path.join(fixture.io, 'assessment.json'), {
    action: 'execute-task',
    targets: ['src/demo.txt'],
    summary: 'Change the demo product file.',
    intent: 'unchanged',
    equivalence: 'none',
    retention: 'transient',
  });
  const assessed = expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', first.challenge, '--input', input], driver), 0, 'assess');

  const second = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 2, 'specialist pair');
  assert.equal(second.kind, 'specialist-pair');
  assert.equal(second.packet, null, 'only a challenge carrying a model packet gets a sidecar');
  assert.equal(readJson(second.challenge).assessmentIdentity, assessed.assessmentIdentity, 'authorization binds the published Assessment');
  const baseline = path.join(fixture.io, 'baseline.json');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, 'snapshot');
  write(ws, 'src/demo.txt', 'after\n');
  const changed = path.join(fixture.io, 'changed.json');
  const scoped = expectExit(await call(fixture, ['diff', '--root', ws, '--baseline', baseline, '--challenge', second.challenge, '--out', changed], driver), 0, 'diff');
  assert.deepEqual(scoped.changes, [{ path: 'src/demo.txt', change: 'modified' }]);
  const tester = { checks: [check('integration')] };
  const reviewer = { verdict: 'accepted', findings: [] };
  const responded = expectExit(await call(fixture, [
    'respond', '--root', ws, '--challenge', second.challenge,
    '--tester', writeJson(path.join(fixture.io, 'tester.json'), tester),
    '--reviewer', writeJson(path.join(fixture.io, 'reviewer.json'), reviewer),
    '--changed', changed,
  ], driver), 0, 'respond');
  assert.equal(responded.outcome, 'succeeded');

  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.state, 'finished');
  assert.equal(status.outcome, 'ended');
  assert.equal(status.reason, 'task-settled');
  assert.equal(status.haltReport, null);
  const result = readJson(status.result);
  assert.equal(result.outcome, 'ended');
  assert.equal(result.reason, 'task-settled');
  const completion = result.steps.find((row) => row.step === 'commit-lane-receipt');
  assert.equal(completion?.reason, 'lane-receipt-committed', 'the completion lane receipt is committed');
  assert.equal(result.steps.at(-1).reason, 'task-settled');

  // Official settlement: done task, agreeing snapshot, one claim line, one approach occurrence.
  assert.equal(glyphOf(read(ws, TASKS), T1), 'x');
  assert.equal(readJson(path.join(ws, SNAPSHOT))[TASKS].glyphs[T1], 'x');
  assert.equal(read(ws, IDEA), claimedOwner, 'the runner adds no owner log line');
  const events = approachEvents(ws);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].target, { lane: 'lightweight', specPath: SPEC, taskKey: T1 });
  assert.equal(events[0].occurrenceIdentity, result.occurrenceIdentity);
  assert.equal(events[0].occurrence.disposition, 'accepted');
  assert.deepEqual(events[0].basis.materialInputs.targets, ['src/demo.txt']);
  const probe = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 0, 'ownership');
  assert.equal(probe.status, 'absent');

  // Reusable final state and the original retained captures.
  const settled = readJson(status.acceptedState);
  assert.equal(canonicalJson(settled), Buffer.from(result.stateBase64, 'base64').toString('utf8'));
  assert.equal(settled.overallUsed, 1);
  assert.equal(settled.completed.length, 1);
  assert.deepEqual(settled.pending, []);
  const retained = readJson(status.retainedEvidence);
  assert.deepEqual(Object.keys(retained), ['currentRun', 'verification', 'review', 'lint']);
  const verificationText = retained.verification.flatMap(captureRecords).find((/** @type {any} */ entry) => entry.type === 'verification-text');
  assert.deepEqual(verificationText.checks, [{ definition: tester.checks[0].definition, evidence: tester.checks[0].evidence }]);
  const reviewText = retained.review.flatMap(captureRecords).find((/** @type {any} */ entry) => entry.type === 'independent-review-text');
  assert.deepEqual(reviewText.findings, []);
  assert.ok(
    retained.currentRun.flatMap(captureRecords).some((/** @type {any} */ entry) => entry.event?.occurrenceIdentity === result.occurrenceIdentity),
    'the retained current run holds the settled occurrence',
  );

  // Same-invocation continuation: a policy mismatch refuses; the exact policy carries nonzero accounting.
  const tasksBefore = read(ws, TASKS);
  const mismatch = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T2, '--state', status.acceptedState, '--', ...FINITE_ARGS,
  ], driver), 2, 'policy mismatch');
  assert.equal(mismatch.stage, 'state');
  assert.match(mismatch.detail, /policy/);
  assert.equal(read(ws, TASKS), tasksBefore);
  const next = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T2, '--state', status.acceptedState, '--', ...SHIP_ARGS,
  ], driver), 0, 'continuation claim');
  assert.equal(
    canonicalJson(readJson(next.runnerRequest).state),
    canonicalJson(settled),
    'claim setup preserves the settled state, policy, and nonzero accounting',
  );
  assert.equal(readJson(next.report).pair.status, 'absent', 'the next task took and released a fresh setup pair');
  assert.equal(glyphOf(read(ws, TASKS), T2), '~');
  assert.deepEqual(claimLines(ws).map((line) => CLAIM_LINE.exec(line)?.[1]), [T1, T2]);
});

/**
 * Assert a claim refusal changed no workspace byte, took no ownership pair,
 * and published no runner request.
 * @param {ReturnType<typeof makeFixture>} fixture @param {Record<string, string>} before
 * @param {Exit & {json:any}} result @param {string} stage @param {string} label
 */
function expectRefusedBeforeClaim(fixture, before, result, stage, label) {
  const report = expectExit(result, 2, label);
  if (stage !== '') assert.equal(report.stage, stage, `${label}: ${report.detail ?? report.refused}`);
  assert.deepEqual(tree(fixture.ws), before, `${label}: no lane write`);
  assert.deepEqual(Object.keys(tree(path.join(fixture.tmp, STORE))), [], `${label}: no ownership pair`);
  assert.equal(Object.keys(tree(fixture.root)).some((file) => file.endsWith('runner-request.json')), false, `${label}: no runner request`);
}

/** A synthesized `--state` beside a result with the given terminal pair. @param {string} dir @param {Record<string, unknown>} state @param {string} reason */
function carried(dir, state, reason) {
  const bytes = canonicalJson(state);
  writeJson(path.join(dir, 'result.json'), {
    outcome: 'ended', reason, stateBase64: Buffer.from(bytes).toString('base64'), stateHash: sha256(bytes),
  });
  return writeJson(path.join(dir, 'accepted-state.json'), state);
}

test('claim refuses every ineligible admission before any lane mutation', { timeout: 120_000 }, async (t) => {
  const independent = [`- [ ] ${T1} First independent task.`, `- [ ] ${T2} Second independent task.`];
  const empty = (/** @type {Record<string, unknown>} */ policy) => ({ policy, overallUsed: 0, recoveryUsed: [], pending: [], completed: [] });
  /** @type {{label:string, stage:string, task?:string, args?:string[], setup?:(fixture: ReturnType<typeof makeFixture>) => string[]}[]} */
  const cases = [
    { label: 'unfinished dependency', stage: 'task', task: T2 },
    {
      label: 'another unblocked in-progress task',
      stage: 'task',
      task: T2,
      setup: ({ ws }) => (seed(ws, { tasks: [`- [~] ${T1} Already claimed.`, `- [ ] ${T2} Independent task.`] }), []),
    },
    { label: 'later ready task', stage: 'task', task: T2, setup: ({ ws }) => (seed(ws, { tasks: independent }), []) },
    {
      label: 'ambiguous ownership',
      stage: 'owner',
      setup: ({ ws }) => (seed(ws, { extra: { '.dude/ideas/002-copy.md': ideaText({ slug: 'copy' }) } }), []),
    },
    {
      label: 'malformed task file',
      stage: 'tasks',
      setup: ({ ws }) => (seed(ws, { tasks: [...DEPENDENT_TASKS, '- [?] T003@cccccccc Malformed glyph.'] }), []),
    },
    {
      label: 'missing owner breadcrumb',
      stage: 'tasks',
      setup: ({ ws }) => (seed(ws), write(ws, TASKS, tasksText(DEPENDENT_TASKS, false)), []),
    },
    { label: 'owner log without a final LF', stage: 'owner-log', setup: ({ ws }) => (seed(ws, { idea: ideaText({ finalLf: false }) }), []) },
    { label: 'guarded Work policy', stage: 'policy', args: ['--policy', 'guarded'] },
    { label: 'no Work arguments', stage: 'policy', args: [] },
    { label: 'invalid Work arguments', stage: 'invocation', args: ['--recovery-cycles', '2', '--policy', 'autonomous'] },
    {
      label: 'feature selector for another owner',
      stage: 'selector',
      args: ['other', ...SHIP_ARGS],
      setup: ({ ws }) => (seed(ws, {
        extra: {
          '.dude/ideas/002-other.md': ideaText({ slug: 'other', specPath: '.dude/specs/002-other/spec.md' }),
          '.dude/specs/002-other/spec.md': '# Other\n',
        },
      }), []),
    },
    {
      label: 'carried state from a cancelled run',
      stage: 'state',
      setup: (fixture) => (seed(fixture.ws), ['--state', carried(path.join(fixture.io, 'x'), empty(SHIP_POLICY), 'cancelled')]),
    },
    {
      label: 'carried state with another policy',
      stage: 'state',
      setup: (fixture) => (seed(fixture.ws), ['--state', carried(path.join(fixture.io, 'x'), empty(FINITE_POLICY), 'task-settled')]),
    },
    {
      label: 'claim directory inside the workspace',
      stage: '',
      setup: (fixture) => (seed(fixture.ws), ['--out', path.join(fixture.ws, '.runs')]),
    },
  ];
  const outcomes = await Promise.all(cases.map(async (entry) => {
    const fixture = makeFixture(t);
    const options = entry.setup ? entry.setup(fixture) : (seed(fixture.ws), []);
    const before = tree(fixture.ws);
    const result = await call(fixture, [
      'claim', '--root', fixture.ws, '--spec', SPEC, '--task', entry.task ?? T1, ...options, '--', ...(entry.args ?? SHIP_ARGS),
    ]);
    return { entry, fixture, before, result };
  }));
  for (const { entry, fixture, before, result } of outcomes) {
    expectRefusedBeforeClaim(fixture, before, result, entry.stage, entry.label);
  }
});

test('claim refuses imported tracked work instead of falling back to Lightweight', { timeout: 60_000 }, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws);
  fixtureBeads(fixture);
  const before = tree(fixture.ws);
  const result = await call(fixture, ['claim', '--root', fixture.ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS]);
  expectRefusedBeforeClaim(fixture, before, result, 'lane', 'tracked lane');
  assert.deepEqual(readJson(result.json.report).lane, { lane: 'tracked', beads: 'populated', issues: 1 }, 'the fixture Beads decided the lane');
});

test('failure paths: boundaries, preflight, scope, outcome derivation, ownership probe, and cancellation', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws, { extra: { 'src/gone.txt': 'remove me\n', 'src/dirty.txt': 'committed\n' } });
  const ws = fs.realpathSync(fixture.ws);
  const store = path.join(fixture.tmp, STORE);

  // Finite autonomous controls pass through unchanged; there is no embedded Ship policy.
  const claimed = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T1, '--out', path.join(fixture.io, 'claim'), '--', ...FINITE_ARGS,
  ]), 0, 'claim');
  assert.equal(claimed.out, path.join(fixture.io, 'claim'));
  assert.deepEqual(readJson(claimed.runnerRequest).state.policy, FINITE_POLICY);

  // Run directories: a reused directory and a workspace descendant are refused untouched.
  const reused = path.join(fixture.io, 'reused');
  write(reused, 'keep.txt', 'earlier run\n');
  const reusedBefore = tree(reused);
  expectExit(await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', reused]), 2, 'reused --dir');
  assert.deepEqual(tree(reused), reusedBefore);
  const wsBefore = tree(ws);
  expectExit(await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', path.join(ws, '.exchange')]), 2, 'workspace --dir');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', ws]), 1, 'snapshot at the workspace root');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', path.join(ws, 'src', 'base.json')]), 1, 'snapshot beneath the workspace');
  assert.deepEqual(tree(ws), wsBefore, 'refused outputs created nothing in the workspace');

  const dir = path.join(fixture.io, 'exchange');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir]);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'assessment');

  // The ownership probe reports the live pair and writes nothing.
  const storeBefore = tree(store);
  const present = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 1, 'present pair');
  assert.equal(present.status, 'loaded');
  assert.deepEqual(Object.keys(storeBefore).sort(), [`${present.checkpointKey}.checkpoint`, `${present.checkpointKey}.claim`]);
  assert.deepEqual(tree(store), storeBefore);
  assert.deepEqual(tree(ws), wsBefore);

  // An invalid Assessment publishes nothing; a valid one publishes exactly once.
  const assessment = {
    action: 'execute-task',
    targets: ['src/demo.txt', 'src/gone.txt', 'src/new.txt'],
    summary: 'Change, add, and remove the demo product files.',
    intent: 'unchanged',
    equivalence: 'none',
    retention: 'transient',
  };
  for (const [label, input] of /** @type {[string, Record<string, unknown>][]} */ ([
    ['backslash target', { ...assessment, targets: ['src\\demo.txt'] }],
    ['action none', { ...assessment, action: 'none' }],
    ['unknown field', { ...assessment, extra: true }],
  ])) {
    const refused = expectExit(await call(fixture, [
      'assess', '--root', ws, '--challenge', first.challenge, '--input', writeJson(path.join(fixture.io, `bad-${label}.json`), input),
    ]), 1, label);
    assert.equal(refused.ok, false, label);
    assert.equal(fs.existsSync(first.response), false, `${label}: no response`);
  }
  const input = writeJson(path.join(fixture.io, 'assessment.json'), assessment);
  expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', first.challenge, '--input', input]), 0, 'assess');
  const firstResponse = fs.readFileSync(first.response);
  expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', first.challenge, '--input', input]), 1, 'duplicate assess');
  assert.deepEqual(fs.readFileSync(first.response), firstResponse, 'the duplicate left the response bytes untouched');

  // Scope: pre-existing dirt is excluded; additions, modifications, and deletions are exact.
  const second = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 2, 'specialist pair');
  write(ws, 'src/dirty.txt', 'dirty before the attempt\n');
  const baseline = path.join(fixture.io, 'baseline.json');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline]), 0, 'snapshot');
  write(ws, 'src/demo.txt', 'after\n');
  write(ws, 'src/new.txt', 'added\n');
  fs.rmSync(path.join(ws, 'src', 'gone.txt'));
  write(ws, 'src/extra.txt', 'unauthorized\n');
  const changed = path.join(fixture.io, 'changed.json');
  const scope = ['diff', '--root', ws, '--baseline', baseline, '--challenge', second.challenge, '--out', changed];
  const outside = expectExit(await call(fixture, scope), 1, 'unauthorized path');
  assert.deepEqual(outside.unauthorized, ['src/extra.txt']);
  assert.equal(fs.existsSync(changed), false, 'no changed-path file for an unauthorized delta');
  expectExit(await call(fixture, [...scope.slice(0, -1), path.join(ws, 'changed.json')]), 1, 'diff output in the workspace');
  fs.rmSync(path.join(ws, 'src', 'extra.txt'));
  const delta = expectExit(await call(fixture, scope), 0, 'diff');
  assert.deepEqual(delta.changes, [
    { path: 'src/demo.txt', change: 'modified' },
    { path: 'src/gone.txt', change: 'deleted' },
    { path: 'src/new.txt', change: 'added' },
  ]);
  assert.deepEqual(readJson(changed), ['src/demo.txt', 'src/gone.txt', 'src/new.txt']);

  // Outcome derivation keeps every supplied row; an invalid pair publishes nothing.
  const none = writeJson(path.join(fixture.io, 'none.json'), []);
  const passing = { checks: [check('first'), check('second')] };
  const failing = { checks: [check('first'), check('second', 'failed')] };
  const accepted = { verdict: 'accepted', findings: [] };
  const rejected = { verdict: 'rejected', findings: [finding('first')] };
  const variants = /** @type {[string, any, any, string, string|null][]} */ ([
    ['succeeded', passing, accepted, changed, 'succeeded'],
    ['failed', failing, accepted, changed, 'failed'],
    ['blocked', passing, rejected, changed, 'blocked'],
    ['failed-over-blocked', failing, rejected, changed, 'failed'],
    ['no-change', passing, accepted, none, 'no-change'],
    ['invalid-pair', passing, { verdict: 'accepted', findings: [finding('first')] }, changed, null],
    ['unauthorized-changed', passing, accepted, writeJson(path.join(fixture.io, 'outside.json'), ['src/demo.txt', 'src/extra.txt']), null],
  ]);
  await Promise.all(variants.map(async ([label, tester, reviewer, changedFile, expected]) => {
    const copy = path.join(fixture.io, `variant-${label}`, 'challenge-2.json');
    fs.mkdirSync(path.dirname(copy));
    fs.copyFileSync(second.challenge, copy);
    const result = await call(fixture, [
      'respond', '--root', ws, '--challenge', copy,
      '--tester', writeJson(path.join(fixture.io, `tester-${label}.json`), tester),
      '--reviewer', writeJson(path.join(fixture.io, `reviewer-${label}.json`), reviewer),
      '--changed', changedFile,
    ]);
    const response = path.join(path.dirname(copy), 'response-2.json');
    if (expected === null) {
      expectExit(result, 1, label);
      assert.equal(fs.existsSync(response), false, `${label}: no response`);
      return;
    }
    expectExit(result, 0, label);
    const published = readJson(response).specialistResult;
    assert.equal(published.outcome, expected, label);
    assert.deepEqual(published.verification, tester, `${label}: every check row is intact`);
    assert.deepEqual(published.review, reviewer, `${label}: every finding is intact`);
    assert.deepEqual(published.changedTargets, readJson(changedFile), label);
    assert.deepEqual(published.operations, ['execute-task'], label);
  }));

  // The actual failed evidence reaches the runner unchanged and starts a recovery Assessment.
  const failed = expectExit(await call(fixture, [
    'respond', '--root', ws, '--challenge', second.challenge,
    '--tester', path.join(fixture.io, 'tester-failed.json'),
    '--reviewer', path.join(fixture.io, 'reviewer-failed.json'),
    '--changed', changed,
  ]), 0, 'respond');
  assert.equal(failed.outcome, 'failed');
  const secondResponse = fs.readFileSync(second.response);
  expectExit(await call(fixture, [
    'respond', '--root', ws, '--challenge', second.challenge,
    '--tester', path.join(fixture.io, 'tester-succeeded.json'),
    '--reviewer', path.join(fixture.io, 'reviewer-succeeded.json'),
    '--changed', changed,
  ]), 1, 'duplicate respond');
  assert.deepEqual(fs.readFileSync(second.response), secondResponse);
  const third = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 3, 'recovery assessment');
  assert.equal(third.kind, 'assessment');
  const [failedEvent] = approachEvents(ws);
  assert.equal(failedEvent.occurrence.disposition, 'verification-failed');
  assert.ok(fs.readFileSync(third.packet, 'utf8').includes(failing.checks[1].evidence), 'the failed row reaches the next packet');
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');

  // Cancellation goes through the runner, keeps [~], clears the pair, and offers no continuation.
  expectExit(await call(fixture, ['respond', '--root', ws, '--challenge', third.challenge, '--cancel']), 0, 'cancel');
  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.outcome, 'ended');
  assert.equal(status.reason, 'cancelled');
  assert.equal(status.acceptedState, null);
  assert.equal(fs.existsSync(path.join(dir, 'accepted-state.json')), false);
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
  const wsAfter = tree(ws);
  const absent = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 0, 'absent pair');
  assert.equal(absent.status, 'absent');
  assert.equal(absent.checkpointKey, present.checkpointKey);
  assert.deepEqual(tree(store), {});
  assert.deepEqual(tree(ws), wsAfter);
  const result = readJson(status.result);
  writeJson(path.join(dir, 'accepted-state.json'), JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8')));
  const refused = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T2, '--state', path.join(dir, 'accepted-state.json'), '--', ...FINITE_ARGS,
  ]), 2, 'continuation after cancel');
  assert.equal(refused.stage, 'state');
  assert.match(refused.detail, /task-settled/);
  assert.deepEqual(tree(ws), wsAfter);
});

test('a foreign response keeps the runner hard stop and its retained pair through a held status file; the driver cleans nothing', {
  timeout: 120_000,
}, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws);
  const ws = fs.realpathSync(fixture.ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS]), 0, 'claim');
  const dir = path.join(fixture.io, 'exchange');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir]);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'assessment');

  // A response that bypasses the builders, bound to no outstanding challenge,
  // consumed while a reader holds status.json open. On Windows that hold blocks
  // every status replacement until it is released; it must not break the exchange.
  const held = fs.openSync(path.join(dir, 'status.json'), 'r');
  try {
    const temporary = `${first.response}.fixture`;
    writeJson(temporary, { version: 1, type: 'cancel', challengeIdentity: sha256('a foreign challenge'), kind: 'assessment' });
    fs.renameSync(temporary, first.response);
    await sleep(2_000);
  } finally {
    fs.closeSync(held);
  }
  const done = await runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.outcome, 'hard-stop');
  assert.equal(status.reason, 'challenge-response-foreign');
  assert.equal(status.orphan, true);
  assert.equal(status.cleanup, 'not-attempted');
  assert.equal(status.haltReport.halted, true);
  assert.equal(status.acceptedState, null);
  const result = readJson(status.result);
  for (const field of ['outcome', 'reason', 'detail', 'target', 'orphan', 'cleanup', 'haltReport', 'stateHash']) {
    assert.deepEqual(status[field], result[field], `the terminal status preserves the runner's ${field}`);
  }
  assert.equal(Object.hasOwn(status, 'ownership'), Object.hasOwn(result, 'ownership'));
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');

  const present = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 1, 'retained pair');
  assert.equal(present.status, 'loaded');

  // Test-owned disposal of this fixture's own bounded pair after its runner exited.
  const store = path.join(fixture.tmp, STORE);
  fs.rmSync(path.join(store, `${present.checkpointKey}.checkpoint`));
  fs.rmSync(path.join(store, `${present.checkpointKey}.claim`));
  const absent = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 0, 'after test cleanup');
  assert.equal(absent.status, 'absent');
});

/** The largest Tester record the official limits admit: 16 rows of 16,384-byte definitions and evidence. */
function largestTester() {
  /** @param {string} prefix */
  const text = (prefix) => `${prefix}${'x'.repeat(16_384 - prefix.length)}`;
  return {
    checks: Array.from({ length: 16 }, (_, index) => ({
      definition: text(`fixture check ${index + 1}: `),
      outcome: 'passed',
      evidence: text(`fixture evidence ${index + 1}: `),
    })),
  };
}

test('a hard stop during a later completion capture keeps every earlier original capture in the retained evidence', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  seed(fixture.ws);
  const ws = fs.realpathSync(fixture.ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, 'claim');
  const dir = path.join(fixture.io, 'exchange');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);

  /**
   * One attempt through the published challenges: Assessment, baseline, one
   * product change, checked scope, and the controlled specialist pair.
   * @param {number} n the Assessment challenge number @param {string} equivalence
   * @param {string} content @param {{checks: Record<string, unknown>[]}} tester
   */
  const attempt = async (n, equivalence, content, tester) => {
    const assessment = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n, `assessment ${n}`);
    assert.equal(assessment.kind, 'assessment');
    const input = writeJson(path.join(fixture.io, `assessment-${n}.json`), {
      action: 'address-test', // its Tester capture is the lint capture as well
      targets: ['src/demo.txt'],
      summary: `Change the demo product file (challenge ${n}).`,
      intent: 'unchanged',
      equivalence,
      retention: 'transient',
    });
    expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', assessment.challenge, '--input', input], driver), 0, `assess ${n}`);
    const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n + 1, `specialist pair ${n + 1}`);
    assert.equal(pair.kind, 'specialist-pair');
    const baseline = path.join(fixture.io, `baseline-${n + 1}.json`);
    expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, `snapshot ${n + 1}`);
    write(ws, 'src/demo.txt', content);
    const changed = path.join(fixture.io, `changed-${n + 1}.json`);
    expectExit(await call(fixture, [
      'diff', '--root', ws, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed,
    ], driver), 0, `diff ${n + 1}`);
    expectExit(await call(fixture, [
      'respond', '--root', ws, '--challenge', pair.challenge,
      '--tester', writeJson(path.join(fixture.io, `tester-${n + 1}.json`), tester),
      '--reviewer', writeJson(path.join(fixture.io, `reviewer-${n + 1}.json`), { verdict: 'accepted', findings: [] }),
      '--changed', changed,
    ], driver), 0, `respond ${n + 1}`);
    return pair;
  };
  // The first attempt fails verification and is retained; the second passes
  // every preflight, but its capture overflows the runtime's model packet.
  const firstPair = await attempt(1, 'none', 'after one\n', { checks: [check('first'), check('second', 'failed')] });
  const secondPair = await attempt(3, 'distinct', 'after two\n', largestTester());

  const done = await runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.outcome, 'hard-stop');
  assert.equal(status.reason, 'evidence-incomplete');
  const result = readJson(status.result);
  assert.equal(result.steps.find((row) => row.step === 'attempt:1:settle-completion')?.reason, 'verification-failed');
  assert.deepEqual(
    [result.steps.at(-1).step, result.steps.at(-1).outcome],
    ['attempt:2:record-attempt-result', 'hard-stop'],
    'the runner stopped inside the later completion capture',
  );
  const occurrences = approachEvents(ws);
  assert.equal(occurrences.length, 1, 'only the first attempt was retained');
  const [retainedOccurrence] = occurrences;
  assert.equal(retainedOccurrence.occurrence.disposition, 'verification-failed');

  // Each stream holds the first attempt's original captures, then the stopped
  // capture's, exactly as the official builder handed them to the runtime.
  /** @param {any} pair */
  const capturedStreams = (pair) => {
    const challenge = readJson(pair.challenge);
    const state = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
    return prepareSpecialistResult(state, readJson(pair.response).specialistResult).streams;
  };
  const first = capturedStreams(firstPair);
  const second = capturedStreams(secondPair);
  const retained = readJson(status.retainedEvidence);
  assert.deepEqual(Object.keys(retained), ['currentRun', 'verification', 'review', 'lint']);
  /** @param {any[]} rows */
  const digests = (rows) => rows.map((row) => `${row.state}:${sha256(Buffer.from(row.bytes.base64, 'base64'))}`);
  for (const field of /** @type {const} */ (['verification', 'review', 'lint'])) {
    assert.equal(first[field].length, 1, `the first attempt carries one ${field} capture`);
    const expected = [...first[field], ...second[field]];
    assert.deepEqual(digests(retained[field]), digests(expected), `${field}: the earlier capture precedes the stopped one, bytes intact`);
    assert.deepEqual(retained[field], expected, `${field}: every original capture record is unchanged`);
  }
  assert.ok(
    retained.currentRun.flatMap(captureRecords).some((/** @type {any} */ entry) => entry.event?.occurrenceIdentity === retainedOccurrence.occurrenceIdentity),
    'the retained current run holds the first attempt occurrence',
  );
});

test('the ownership probe refuses without an exact current binding', { timeout: 60_000 }, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws, { extra: { '.dude/ideas/002-copy.md': ideaText({ slug: 'copy' }) } });
  const before = tree(fixture.root);
  for (const [label, args] of /** @type {[string, string[]][]} */ ([
    ['missing workspace', ['--root', path.join(fixture.root, 'missing'), '--spec', SPEC, '--task', T1]],
    ['ambiguous owner', ['--root', fixture.ws, '--spec', SPEC, '--task', T1]],
    ['non-canonical target', ['--root', fixture.ws, '--spec', SPEC, '--task', 'T1']],
  ])) {
    const refused = expectExit(await call(fixture, ['ownership', ...args]), 2, label);
    assert.equal(refused.ok, false, label);
  }
  assert.deepEqual(tree(fixture.root), before, 'refused probes write nothing');
});

// --- Learning review through the live released driver ------------------------
//
// Each run below reaches a real learning-review challenge only through the
// released public commands: claim, an attached run, and two assessed attempts
// whose independent reviews reject with the same finding. The fixture learning
// results exercise transport and the receiver; they are no learning judgment.

const LEARNING_TARGET = { specPath: SPEC, lane: 'lightweight', taskKey: T1 };

/** @param {any} challenge */
function challengeState(challenge) {
  return JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
}

/** @param {string} label */
function fixtureHash(label) {
  return sha256(`driver-learning-fixture:${label}`);
}

/** A duplicate-free set in UTF-8 byte order, as every v2 identity set requires. @param {string[]} values */
function sortedSet(values) {
  return [...new Set(values)].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

/** @template {{alternativeIdentity: string}} T @param {T[]} rows */
function byAlternativeIdentity(rows) {
  return [...rows].sort((left, right) => Buffer.compare(
    Buffer.from(left.alternativeIdentity),
    Buffer.from(right.alternativeIdentity),
  ));
}

/**
 * The governed failed-approach set of one real learning challenge and, for each
 * failed basis, the retained occurrence events that support it in lane history.
 * @param {any} challenge @param {string} ws
 */
function governedEvidence(challenge, ws) {
  const set = challengeState(challenge).learningGovernance.failedApproachSet;
  const events = laneEvents(ws);
  /** @type {Map<string, string[]>} */
  const support = new Map(set.approachBasisIdentities.map((/** @type {string} */ basis) => [basis, sortedSet(events
    .filter((event) => (event.type === 'approach-occurrence' && sha256(canonicalJson(event.basis)) === basis)
      || (event.type === 'finding-occurrence' && event.occurrence.attemptApproachBasisIdentity === basis))
    .map((event) => event.eventHash))]));
  return { set, events, support };
}

/** One fixture approach basis for a proposed alternative. @param {string} label */
function alternativeBasis(label) {
  return {
    version: 1,
    target: { ...LEARNING_TARGET },
    action: 'retry-task',
    materialInputs: { targets: ['src/demo.txt'], operations: ['retry-task'], checks: ['verification'] },
    mechanismIdentities: [fixtureHash(`mechanism:${label}`)],
    assumptionIdentities: [],
    evidenceAcquisitionIdentities: [],
    validationPlanIdentities: [],
  };
}

/**
 * A credible-material alternative compared with the given failed bases, every
 * governed basis unless a case narrows them, and bound to one discriminating check.
 * @param {ReturnType<typeof governedEvidence>} evidence @param {string} label
 * @param {{bases?: string[], basis?: Record<string, unknown>}} [options]
 */
function credibleAlternative(evidence, label, { bases = evidence.set.approachBasisIdentities, basis = alternativeBasis(label) } = {}) {
  const approachBasisIdentity = sha256(canonicalJson(basis));
  const materialDifferences = bases.map((failed) => ({
    failedApproachBasisIdentity: failed,
    changedDimensions: ['mechanism'],
    evidenceIdentities: evidence.support.get(failed) ?? [fixtureHash(`difference:${label}`)],
  }));
  const checkBody = {
    definitionIdentity: fixtureHash(`check-definition:${label}`),
    evidenceIdentities: [fixtureHash(`check-evidence:${label}`)],
  };
  const discriminatingCheck = { identity: sha256(canonicalJson(checkBody)), ...checkBody };
  const semanticAssessmentIdentity = fixtureHash(`assessment:${label}`);
  const body = {
    version: 2,
    disposition: 'credible-material',
    approachBasisIdentity,
    failedApproachSetIdentity: evidence.set.setIdentity,
    materialDifferences,
    discriminatingCheck,
    semanticAssessmentIdentity,
  };
  return { ...body, alternativeIdentity: sha256(canonicalJson(body)), approachBasis: basis };
}

/**
 * A rejected alternative: the same as the first governed failed approach and
 * different from the rest, so it is a disguised repetition.
 * @param {ReturnType<typeof governedEvidence>} evidence @param {string} label
 */
function rejectedAlternative(evidence, label) {
  const basis = alternativeBasis(label);
  const comparisons = evidence.set.approachBasisIdentities.map((/** @type {string} */ failed, /** @type {number} */ index) => ({
    failedApproachBasisIdentity: failed,
    outcome: index === 0 ? 'same' : 'different',
    ...(index === 0 ? {} : { changedDimensions: ['mechanism'] }),
    evidenceIdentities: evidence.support.get(failed),
  }));
  const body = {
    version: 2,
    disposition: 'not-materially-different',
    approachBasisIdentity: sha256(canonicalJson(basis)),
    failedApproachSetIdentity: evidence.set.setIdentity,
    comparisons,
    semanticAssessmentIdentity: fixtureHash(`assessment:${label}`),
    reason: 'disguised-repetition',
  };
  return { ...body, alternativeIdentity: sha256(canonicalJson(body)), approachBasis: basis };
}

/** @param {string} statement @param {string[]} evidenceIdentities */
function learningFinding(statement, evidenceIdentities) {
  const body = { version: 1, statement, evidenceIdentities: sortedSet(evidenceIdentities), assumptionIdentities: [] };
  return { ...body, findingIdentity: sha256(canonicalJson(body)) };
}

/**
 * One complete fixture learning result for a real challenge: a finding over
 * every retained occurrence and alternatives compared with the whole failed set.
 * @param {ReturnType<typeof governedEvidence>} evidence @param {'selected-alternative'|'no-progress'} outcome
 * @param {{findings?: Record<string, unknown>[], alternatives?: Record<string, unknown>[], selected?: string}} [options]
 */
function learningReview(evidence, outcome, { findings, alternatives, selected } = {}) {
  const credible = credibleAlternative(evidence, 'alternative');
  const rejected = rejectedAlternative(evidence, 'repeated');
  const rows = alternatives ?? (outcome === 'selected-alternative' ? [credible, rejected] : [rejected]);
  const review = {
    version: 2,
    target: { ...LEARNING_TARGET },
    assumptionIdentities: [fixtureHash('assumption')],
    findings: findings ?? [learningFinding(
      'The same review finding repeated after the action changed, so the action was not its cause.',
      [...evidence.support.values()].flat(),
    )],
    alternatives: byAlternativeIdentity(/** @type {{alternativeIdentity: string}[]} */ (rows)),
    outcome,
    ...(outcome === 'selected-alternative' ? { selectedAlternativeIdentity: selected ?? credible.alternativeIdentity } : {}),
  };
  return { review, credible, rejected };
}

/**
 * Build the actual core release into a fresh fixture, claim T1, start the
 * attached runner, and answer two real attempts whose independent reviews
 * reject with the same finding, until that live runner publishes its
 * learning-review challenge. With `failedCheck`, each attempt also fails a check.
 * @param {import('node:test').TestContext} t @param {{failedCheck?: boolean, tasks?: string[]}} [options]
 */
async function reachLearningChallenge(t, { failedCheck = false, tasks = DEPENDENT_TASKS } = {}) {
  const fixture = makeFixture(t);
  const built = buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  assert.equal(built.files.some((file) => file.endsWith('.test.mjs')), false, 'the release ships no tests');
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  seed(fixture.ws, { tasks });
  const ws = fs.realpathSync(fixture.ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, 'claim');
  const dir = path.join(fixture.io, 'exchange');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  /** @type {{tester: any, reviewer: any}[]} */
  const records = [];
  for (const [attempt, action, equivalence] of /** @type {[number, string, string][]} */ ([
    [1, 'execute-task', 'none'],
    [2, failedCheck ? 'retry-task' : 'address-review', 'distinct'],
  ])) {
    const n = 2 * attempt - 1;
    const assessment = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n, `assessment ${n}`);
    assert.equal(assessment.kind, 'assessment');
    const input = writeJson(path.join(fixture.io, `assessment-${n}.json`), {
      action,
      targets: ['src/demo.txt'],
      summary: `Change the demo product file (attempt ${attempt}).`,
      intent: 'unchanged',
      equivalence,
      retention: 'transient',
    });
    expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', assessment.challenge, '--input', input], driver), 0, `assess ${n}`);
    const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n + 1, `specialist pair ${n + 1}`);
    assert.equal(pair.kind, 'specialist-pair');
    const baseline = path.join(fixture.io, `baseline-${n + 1}.json`);
    expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, `snapshot ${n + 1}`);
    write(ws, 'src/demo.txt', `attempt ${attempt}\n`);
    const changed = path.join(fixture.io, `changed-${n + 1}.json`);
    expectExit(await call(fixture, [
      'diff', '--root', ws, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed,
    ], driver), 0, `diff ${n + 1}`);
    // The finding basis stays stable; each attempt's observed evidence is its own.
    const tester = {
      checks: [
        check('repeat', 'passed', `fixture evidence: repeat passed in attempt ${attempt}`),
        ...(failedCheck ? [check('unit', 'failed', `fixture evidence: unit failed in attempt ${attempt}`)] : []),
      ],
    };
    const reviewer = { verdict: 'rejected', findings: [finding('repeat', `fixture observation: the repeated finding in attempt ${attempt}`)] };
    const responded = expectExit(await call(fixture, [
      'respond', '--root', ws, '--challenge', pair.challenge,
      '--tester', writeJson(path.join(fixture.io, `tester-${n + 1}.json`), tester),
      '--reviewer', writeJson(path.join(fixture.io, `reviewer-${n + 1}.json`), reviewer),
      '--changed', changed,
    ], driver), 0, `respond ${n + 1}`);
    assert.equal(responded.outcome, failedCheck ? 'failed' : 'blocked');
    records.push({ tester, reviewer });
  }
  const learning = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 5, 'learning review');
  assert.equal(learning.kind, 'learning-review');
  const challenge = readJson(learning.challenge);
  return { fixture, driver, ws, dir, runner, claimed, learning, challenge, records };
}

/**
 * The learning owner's evidence is complete: the governed set holds every
 * retained failed approach, and the bound packet carries each attempt's
 * original check rows and rejected findings.
 * @param {Awaited<ReturnType<typeof reachLearningChallenge>>} context
 */
function assertCompleteLearningEvidence({ ws, learning, challenge, records }) {
  const state = challengeState(challenge);
  assert.equal(state.learningGovernance.phase, 'required');
  assert.equal(state.learningGovernance.governanceIdentity, challenge.governanceIdentity);
  assert.equal(state.learningGovernance.trigger.channel, 'finding');
  const evidence = governedEvidence(challenge, ws);
  const failed = evidence.events.filter((event) => event.type === 'approach-occurrence');
  assert.equal(failed.length, 2);
  assert.ok(failed.every((event) => event.occurrence.disposition !== 'accepted'));
  assert.deepEqual(
    evidence.set.approachBasisIdentities,
    sortedSet(failed.map((event) => sha256(canonicalJson(event.basis)))),
    'the governed set holds every retained failed approach',
  );
  const packet = fs.readFileSync(learning.packet, 'utf8');
  for (const { tester, reviewer } of records) {
    for (const row of tester.checks) assert.ok(packet.includes(row.evidence), `the packet carries ${row.evidence}`);
    for (const row of reviewer.findings) {
      assert.ok(packet.includes(row.observation.evidence), `the packet carries ${row.observation.evidence}`);
    }
  }
  return evidence;
}

/** The first result step whose name starts with the prefix, and its index. @param {any[]} steps @param {string} prefix */
function stepOf(steps, prefix) {
  const index = steps.findIndex((step) => step.step.startsWith(prefix));
  assert.ok(index >= 0, `the run took a ${prefix} step: ${steps.map((step) => step.step).join(', ')}`);
  return { index, step: steps[index] };
}

/** The decoded current-run events of the retained evidence, in capture order. @param {any} retained */
function currentRunEvents(retained) {
  return retained.currentRun.flatMap(captureRecords)
    .filter((/** @type {any} */ entry) => entry.event)
    .map((/** @type {any} */ entry) => entry.event);
}

/**
 * Copy a real challenge into a fresh scratch exchange beside a copy of the live
 * status, optionally editing and rebinding it, so each refusal below reaches its
 * own guard while every other prerequisite stays valid.
 * @param {Awaited<ReturnType<typeof reachLearningChallenge>>} context @param {string} label
 * @param {{source?: string, name?: string, status?: boolean, edit?: (challenge: any) => void, rebind?: boolean}} [options]
 */
function scratchChallenge({ fixture, dir, learning }, label, { source = learning.challenge, name = path.basename(source), status = true, edit, rebind = false } = {}) {
  const copy = readJson(source);
  edit?.(copy);
  if (rebind) {
    const { challengeIdentity, bindingIdentity, ...body } = copy;
    copy.bindingIdentity = sha256(canonicalJson(body));
  }
  const scratch = path.join(fixture.io, `case-${label.replace(/[^a-z0-9]+/gi, '-')}`);
  fs.mkdirSync(scratch);
  if (status) fs.copyFileSync(path.join(dir, 'status.json'), path.join(scratch, 'status.json'));
  return writeJson(path.join(scratch, name), copy);
}

/** Run driver calls a few at a time; each refusal is independent. @template T @param {(() => Promise<T>)[]} calls */
async function inBatches(calls, size = 6) {
  /** @type {T[]} */
  const results = [];
  for (let index = 0; index < calls.length; index += size) {
    results.push(...await Promise.all(calls.slice(index, index + size).map((run) => run())));
  }
  return results;
}

test('learning review, selected alternative: the live released runner retains, re-inspects, and binds the result before a separately verified attempt settles', {
  timeout: 300_000,
}, async (t) => {
  const context = await reachLearningChallenge(t);
  const { fixture, driver, ws, dir, runner, learning, challenge } = context;
  const evidence = assertCompleteLearningEvidence(context);
  const respond = (/** @type {string[]} */ args) => call(fixture, ['respond', '--root', ws, ...args], driver);
  const { review, credible, rejected } = learningReview(evidence, 'selected-alternative');
  const reviewFile = writeJson(path.join(fixture.io, 'learning-review.json'), review);
  const historyBefore = read(ws, TASKS);
  const priorEvents = historyLines(ws);
  const exchangeBefore = tree(dir);

  // Mixed, partial, and missing forms are usage errors.
  const unused = writeJson(path.join(fixture.io, 'unused.json'), {});
  const usage = await inBatches(/** @type {[string, string[]][]} */ ([
    ['learning review with --cancel', ['--learning-review', reviewFile, '--cancel']],
    ['learning review with the specialist trio', ['--learning-review', reviewFile, '--tester', unused, '--reviewer', unused, '--changed', unused]],
    ['learning review with part of the trio', ['--learning-review', reviewFile, '--tester', unused]],
    ['part of the trio alone', ['--tester', unused, '--reviewer', unused]],
    ['no response form', []],
    ['learning review without a file', ['--learning-review']],
  ]).map(([label, args]) => async () => ({ label, result: await respond(['--challenge', learning.challenge, ...args]) })));
  for (const { label, result } of usage) {
    expectExit(result, 64, label);
    assert.match(result.stderr, /--learning-review/, `${label}: the usage names the learning form`);
  }

  // Local preflight binds the exact waiting challenge, its state, governance, and Inspection.
  const earlier = readJson(path.join(dir, 'challenge-3.json'));
  const otherState = Buffer.from(canonicalJson({ ...challengeState(challenge), overallUsed: 9 })).toString('base64');
  const looseState = JSON.stringify(challengeState(challenge), null, 1);
  /** @type {[string, string, RegExp][]} */
  const contexts = [
    ['an assessment challenge', scratchChallenge(context, 'kind', { source: path.join(dir, 'challenge-1.json') }), /not a runner learning-review challenge/],
    ['a copy away from its exchange status', scratchChallenge(context, 'away', { status: false }), /status\.json is unreadable/],
    ['a foreign challenge identity', scratchChallenge(context, 'foreign', {
      edit: (copy) => { copy.challengeIdentity = fixtureHash('foreign challenge'); },
    }), /not the waiting challenge/],
    ['a stale challenge number', scratchChallenge(context, 'stale', { name: 'challenge-4.json' }), /not the waiting challenge/],
    ['an edited challenge body', scratchChallenge(context, 'body', {
      edit: (copy) => { copy.acceptedRevision += 1; },
    }), /does not match its bindingIdentity/],
    ['another accepted state', scratchChallenge(context, 'state', {
      edit: (copy) => { copy.stateBase64 = otherState; }, rebind: true,
    }), /stateBase64 does not match its stateHash/],
    ['non-canonical state bytes', scratchChallenge(context, 'canonical', {
      edit: (copy) => {
        copy.stateBase64 = Buffer.from(looseState).toString('base64');
        copy.stateHash = sha256(looseState);
      },
      rebind: true,
    }), /not canonical RunState bytes/],
    ['another governance case', scratchChallenge(context, 'governance', {
      edit: (copy) => { copy.governanceIdentity = fixtureHash('another governance case'); }, rebind: true,
    }), /does not bind the learning requirement/],
    ['an earlier Inspection', scratchChallenge(context, 'inspection', {
      edit: (copy) => { copy.inspection = earlier.inspection; }, rebind: true,
    }), /cannot answer this challenge: repeat-not-established/],
  ];
  const second = approachEvents(ws)[1];
  const latest = sha256(canonicalJson(second.basis));
  // Each defective alternative is otherwise complete and is the one selected.
  const partial = credibleAlternative(evidence, 'partial', { bases: [latest] });
  const duplicated = credibleAlternative(evidence, 'duplicate', { bases: [latest, ...evidence.set.approachBasisIdentities].sort() });
  const disguised = credibleAlternative(evidence, 'disguised', { basis: approachEvents(ws)[0].basis });
  const tooLarge = (/** @type {number} */ index) => learningFinding(`Oversized finding ${index}: ${'x'.repeat(480)}`, Array.from(
    { length: 16 }, (_, row) => fixtureHash(`oversized:${index}:${row}`),
  ));
  /** @type {[string, unknown, RegExp][]} */
  const results = [
    ['a caller-authored envelope', { version: 1, type: 'challenge-response', challengeIdentity: challenge.challengeIdentity, kind: 'learning-review', review },
      /learning review v2 contains unknown field 'type'/],
    ['a result for another task', { ...review, target: { ...LEARNING_TARGET, taskKey: T2 } }, /must be the governed affected target/],
    ['a comparison with only the latest failure', learningReview(evidence, 'selected-alternative', {
      alternatives: [partial], selected: partial.alternativeIdentity,
    }).review, /must carry exactly one comparison for every current failed-approach basis/],
    ['a duplicated comparison', learningReview(evidence, 'selected-alternative', {
      alternatives: [duplicated], selected: duplicated.alternativeIdentity,
    }).review, /sorted by failedApproachBasisIdentity and duplicate-free/],
    ['a finding without evidence', learningReview(evidence, 'selected-alternative', {
      findings: [learningFinding('A conclusion that cites no evidence.', [])],
    }).review, /findings\[0\]\.evidenceIdentities must contain 1 through 16 rows/],
    ['a disguised repetition', learningReview(evidence, 'selected-alternative', {
      alternatives: [disguised], selected: disguised.alternativeIdentity,
    }).review, /must differ materially from every current failed approach/],
    ['a selection that is not credible', learningReview(evidence, 'selected-alternative', { selected: rejected.alternativeIdentity }).review,
      /cannot answer this challenge: alternative-selection-mismatch/],
    ['no progress beside a credible alternative', learningReview(evidence, 'no-progress', { alternatives: [credible, rejected] }).review,
      /cannot answer this challenge: alternative-invalid/],
    ['a selected alternative without its identity', (({ selectedAlternativeIdentity, ...rest }) => rest)(review),
      /selectedAlternativeIdentity is required for a selected alternative/],
    ['findings out of identity order', learningReview(evidence, 'selected-alternative', {
      findings: [learningFinding('First conclusion.', [fixtureHash('a')]), learningFinding('Second conclusion.', [fixtureHash('b')])]
        .sort((left, right) => Buffer.compare(Buffer.from(right.findingIdentity), Buffer.from(left.findingIdentity))),
    }).review, /findings must be sorted by findingIdentity and duplicate-free/],
    ['nine alternatives', learningReview(evidence, 'no-progress', {
      alternatives: Array.from({ length: 9 }, (_, index) => rejectedAlternative(evidence, `excess-${index}`)),
    }).review, /must contain at most 8 alternatives/],
    ['an event over its byte bound', learningReview(evidence, 'selected-alternative', {
      findings: Array.from({ length: 16 }, (_, index) => tooLarge(index))
        .sort((left, right) => Buffer.compare(Buffer.from(left.findingIdentity), Buffer.from(right.findingIdentity))),
    }).review, /LearningReviewEventV2 must serialize to at most 16384 UTF-8 bytes/],
    // The response ceiling is dominated: complete validation refuses an
    // oversized result first, and nothing is truncated to fit.
    ['a result larger than the response ceiling', learningReview(evidence, 'selected-alternative', {
      findings: [learningFinding('x'.repeat(1_100_000), [fixtureHash('ceiling')])],
    }).review, /findings\[0\]\.statement must contain 1 through 512 UTF-8 bytes/],
  ];
  const notJson = path.join(fixture.io, 'not-json.json');
  fs.writeFileSync(notJson, 'not json\n');
  const refusals = await inBatches([
    ...contexts.map(([label, file, pattern]) => async () => ({ label, pattern, result: await respond(['--challenge', file, '--learning-review', reviewFile]) })),
    ...results.map(([label, value, pattern], index) => async () => ({
      label,
      pattern,
      result: await respond(['--challenge', learning.challenge, '--learning-review', writeJson(path.join(fixture.io, `refused-${index}.json`), value)]),
    })),
    async () => ({ label: 'a file that is not JSON', pattern: /learning review is not JSON/, result: await respond(['--challenge', learning.challenge, '--learning-review', notJson]) }),
  ]);
  assert.ok(fs.statSync(path.join(fixture.io, `refused-${results.length - 1}.json`)).size > 1_048_576, 'the oversized result exceeds the ceiling');
  for (const { label, pattern, result } of refusals) {
    const refused = expectExit(result, 1, label);
    assert.equal(refused.ok, false, label);
    assert.match(refused.refused, pattern, label);
  }
  for (const [label, file] of contexts) {
    assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.startsWith('response-')), false, `${label}: nothing published beside the copy`);
  }
  assert.deepEqual(tree(dir), exchangeBefore, 'no refusal published a response or touched the exchange');
  assert.equal(read(ws, TASKS), historyBefore, 'no refusal changed lane history');
  assert.equal(readJson(path.join(dir, 'status.json')).n, 5, 'the runner still waits on the learning challenge');

  // The actual result is published once, bound to its challenge and unchanged.
  const published = expectExit(await respond(['--challenge', learning.challenge, '--learning-review', reviewFile]), 0, 'learning review');
  assert.equal(published.kind, 'learning-review');
  assert.equal(published.outcome, 'selected-alternative');
  assert.equal(published.governanceIdentity, challenge.governanceIdentity);
  const responseBytes = fs.readFileSync(learning.response);
  assert.deepEqual(JSON.parse(responseBytes.toString('utf8')), {
    version: 1, type: 'challenge-response', challengeIdentity: challenge.challengeIdentity, kind: 'learning-review', review,
  }, 'the envelope copies the challenge identity and carries the result unchanged');
  assert.equal(published.responseBytes, responseBytes.length, 'the measured bytes are the published bytes');
  for (const [label, args] of /** @type {[string, string[]][]} */ ([
    ['a duplicate learning review', ['--learning-review', reviewFile]],
    ['a cancel after the answer', ['--cancel']],
  ])) {
    const refused = expectExit(await respond(['--challenge', learning.challenge, ...args]), 1, label);
    assert.match(refused.refused, /already exists; each challenge takes exactly one response/, label);
  }
  assert.deepEqual(fs.readFileSync(learning.response), responseBytes, 'the published response stays untouched');

  // A fresh post-learning Inspection binds the selected alternative before any attempt.
  const next = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 6, 'alternative assessment');
  assert.equal(next.kind, 'assessment');
  const nextChallenge = readJson(next.challenge);
  const inspected = challengeState(nextChallenge).learningGovernance;
  assert.equal(inspected.phase, 'alternative-inspected');
  assert.equal(inspected.selectedAlternativeIdentity, credible.alternativeIdentity);
  assert.equal(inspected.discriminatingCheckIdentity, credible.discriminatingCheck.identity);
  assert.notEqual(nextChallenge.inspection.evidenceHash, challenge.inspection.evidenceHash, 'a fresh Inspection follows learning');
  assert.equal(glyphOf(read(ws, TASKS), T1), '~', 'learning alone settles nothing');
  assert.ok(read(ws, TASKS).startsWith(historyBefore), 'retained learning only appended to the task file');
  const input = writeJson(path.join(fixture.io, 'assessment-6.json'), {
    action: 'retry-task',
    targets: ['src/demo.txt'],
    summary: 'Run the selected materially different alternative.',
    intent: 'unchanged',
    equivalence: 'distinct',
    retention: 'transient',
  });
  expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', next.challenge, '--input', input], driver), 0, 'assess 6');

  // Its attempt is separately authorized, verified, and reviewed before settlement.
  const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 7, 'alternative specialist pair');
  assert.equal(pair.kind, 'specialist-pair');
  const authorized = challengeState(readJson(pair.challenge)).learningGovernance;
  assert.equal(authorized.phase, 'alternative-authorized');
  assert.equal(authorized.selectedAlternativeIdentity, credible.alternativeIdentity);
  assert.match(authorized.consumedAttemptPermitHash, /^[0-9a-f]{64}$/);
  assert.equal(glyphOf(read(ws, TASKS), T1), '~', 'an authorized alternative is not a settled task');
  const baseline = path.join(fixture.io, 'baseline-7.json');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, 'snapshot 7');
  write(ws, 'src/demo.txt', 'alternative\n');
  const changed = path.join(fixture.io, 'changed-7.json');
  expectExit(await call(fixture, ['diff', '--root', ws, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed], driver), 0, 'diff 7');
  const verified = expectExit(await respond([
    '--challenge', pair.challenge,
    '--tester', writeJson(path.join(fixture.io, 'tester-7.json'), { checks: [check('repeat')] }),
    '--reviewer', writeJson(path.join(fixture.io, 'reviewer-7.json'), { verdict: 'accepted', findings: [] }),
    '--changed', changed,
  ]), 0, 'respond 7');
  assert.equal(verified.outcome, 'succeeded');

  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.outcome, 'ended');
  assert.equal(status.reason, 'task-settled');
  assert.equal(status.challenges, 7);
  assert.equal(glyphOf(read(ws, TASKS), T1), 'x');
  const { steps } = readJson(status.result);
  assert.equal(steps.filter((/** @type {any} */ step) => step.step === 'advance-governance:review-learning').length, 1, 'one learning response was received');
  const order = /** @type {[string, string, string][]} */ ([
    ['advance-governance:review-learning', 'effect-required', 'learning-reviewed'],
    ['learning-result:settle-effect', 'accepted', 'projection-verified'],
    ['post-learning:fresh-inspection', 'accepted', 'inspection-refreshed'],
    ['advance-governance:bind-alternative', 'accepted', 'post-learning-inspection-bound'],
    ['attempt:3:authorize-attempt', 'accepted', 'authorized'],
    ['attempt:3:settle-completion', 'accepted', 'completed'],
    ['commit-lane-receipt', 'accepted', 'lane-receipt-committed'],
  ]).map(([prefix, outcome, reason]) => {
    const { index, step } = stepOf(steps, prefix);
    assert.deepEqual([step.outcome, step.reason], [outcome, reason], prefix);
    return index;
  });
  assert.deepEqual(order, [...order].sort((left, right) => left - right), 'learning is retained and re-inspected before the verified alternative settles');

  // Exact ordered dual projection preserves every submitted row and all prior history.
  const lane = laneEvents(ws);
  assert.deepEqual(historyLines(ws).slice(0, priorEvents.length), priorEvents, 'every prior history line stays intact and first');
  assert.deepEqual(approachEvents(ws).map((event) => event.occurrence.disposition), ['review-rejected', 'review-rejected', 'accepted']);
  const learned = lane.filter((event) => event.type === 'learning-review' || (event.type === 'learning-governance' && event.phase === 'reviewed'));
  assert.deepEqual(learned.map((event) => event.type), ['learning-review', 'learning-governance']);
  const [reviewEvent, reviewedGovernance] = learned;
  assert.equal(reviewEvent.reviewIdentity, published.reviewIdentity, 'the fresh receiver derived the review the preflight prepared');
  assert.equal(reviewedGovernance.reviewIdentity, reviewEvent.reviewIdentity);
  assert.equal(reviewEvent.preLearningEvidenceHash, challenge.inspection.evidenceHash);
  assert.equal(reviewEvent.outcome, 'selected-alternative');
  assert.equal(reviewEvent.selectedAlternativeIdentity, credible.alternativeIdentity);
  assert.deepEqual(reviewEvent.findings, review.findings, 'every finding row is retained');
  assert.deepEqual(reviewEvent.alternatives, review.alternatives, 'the selected and rejected alternatives are retained in order');
  const current = currentRunEvents(readJson(status.retainedEvidence));
  assert.deepEqual(current.map((event) => canonicalJson(event)), lane.map((event) => canonicalJson(event)), 'both surfaces hold the same ordered events');
});

const MAX_EVENT_BYTES = 16_384; // the runtime's canonical event bound

/** Canonical bytes of the review event the shared preparation derives for a challenge. @param {any} challenge @param {unknown} review */
function preparedEventBytes(challenge, review) {
  const prepared = prepareLearningReviewV2(challengeState(challenge), challenge.inspection, review);
  assert.equal(prepared.prepared, true, String(prepared.reason));
  return Buffer.byteLength(canonicalJson(prepared.reviewEvent));
}

/**
 * A complete no-progress result whose review event serializes to exactly the
 * given byte count: sixteen findings whose statements grow one byte at a time.
 * @param {any} challenge @param {ReturnType<typeof governedEvidence>} evidence @param {number} bytes
 */
function boundaryReview(challenge, evidence, bytes) {
  for (let cited = 1; cited <= 16; cited += 1) {
    const statements = Array.from({ length: 16 }, (_, index) => `Bounded finding ${index + 1}.`);
    const build = () => learningReview(evidence, 'no-progress', {
      findings: statements
        .map((statement, index) => learningFinding(statement, Array.from({ length: cited }, (_, row) => fixtureHash(`bounded:${index}:${row}`))))
        .sort((left, right) => Buffer.compare(Buffer.from(left.findingIdentity), Buffer.from(right.findingIdentity))),
    }).review;
    let remaining = bytes - preparedEventBytes(challenge, build());
    if (remaining < 0) break;
    for (let index = 0; index < statements.length && remaining > 0; index += 1) {
      const grow = Math.min(512 - Buffer.byteLength(statements[index]), remaining);
      statements[index] += 'x'.repeat(grow);
      remaining -= grow;
    }
    if (remaining === 0) return build();
  }
  return assert.fail(`no complete fixture result serializes to ${bytes} event bytes`);
}

test('learning review, no progress: the live released runner verifies the retained conclusion and ends unresolved with no settlement or continuation', {
  timeout: 300_000,
}, async (t) => {
  const context = await reachLearningChallenge(t, {
    failedCheck: true,
    tasks: [`- [ ] ${T1} Change the demo product files.`, `- [ ] ${T2} Independent follow-up.`],
  });
  const { fixture, driver, ws, dir, runner, learning, challenge } = context;
  const evidence = assertCompleteLearningEvidence(context);
  assert.deepEqual(approachEvents(ws).map((event) => event.occurrence.disposition), ['verification-failed', 'verification-failed']);
  const respond = (/** @type {string[]} */ args) => call(fixture, ['respond', '--root', ws, ...args], driver);
  const priorEvents = historyLines(ws);

  // A complete result one byte over the event bound refuses whole; nothing is pruned to fit.
  const over = boundaryReview(challenge, evidence, MAX_EVENT_BYTES + 1);
  const refused = expectExit(await respond([
    '--challenge', learning.challenge, '--learning-review', writeJson(path.join(fixture.io, 'over-bound.json'), over),
  ]), 1, 'one byte over the event bound');
  assert.match(refused.refused, /LearningReviewEventV2 must serialize to at most 16384 UTF-8 bytes/);
  assert.equal(fs.existsSync(learning.response), false, 'the over-bound result published nothing');

  // The same complete result at exactly the bound crosses the live exchange.
  const review = boundaryReview(challenge, evidence, MAX_EVENT_BYTES);
  assert.equal(preparedEventBytes(challenge, review), MAX_EVENT_BYTES);
  assert.equal(review.findings.length, 16);
  const published = expectExit(await respond([
    '--challenge', learning.challenge, '--learning-review', writeJson(path.join(fixture.io, 'learning-review.json'), review),
  ]), 0, 'learning review');
  assert.equal(published.outcome, 'no-progress');
  assert.equal(published.responseBytes, fs.statSync(learning.response).size, 'the measured bytes are the published bytes');
  assert.ok(published.responseBytes < 1_048_576, 'the maximal result fits the response ceiling');
  t.diagnostic(`a ${MAX_EVENT_BYTES}-byte review event published as a ${published.responseBytes}-byte response`);

  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.outcome, 'ended');
  assert.equal(status.reason, 'controlled-unresolved-end');
  assert.equal(status.haltReport, null);
  assert.equal(status.challenges, 5, 'no attempt follows the no-progress conclusion');
  assert.equal(status.acceptedState, null, 'no reusable settled state');
  assert.equal(fs.existsSync(path.join(dir, 'accepted-state.json')), false);
  const result = readJson(status.result);
  const order = /** @type {[string, string, string][]} */ ([
    ['advance-governance:review-learning', 'effect-required', 'learning-reviewed'],
    ['learning-result:settle-effect', 'accepted', 'projection-verified'],
    ['post-learning:fresh-inspection', 'accepted', 'inspection-refreshed'],
    ['advance-governance:verify-no-progress', 'accepted', 'no-progress-verified'],
    ['advance-governance:controlled-end', 'ended', 'controlled-unresolved-end'],
  ]).map(([prefix, outcome, reason]) => {
    const { index, step } = stepOf(result.steps, prefix);
    assert.deepEqual([step.outcome, step.reason], [outcome, reason], prefix);
    return index;
  });
  assert.deepEqual(order, [...order].sort((left, right) => left - right), 'the conclusion is retained and verified before the controlled end');
  assert.equal(result.steps.some((/** @type {any} */ step) => step.step.startsWith('attempt:3')), false);

  // The task stays in progress; history keeps every prior line and the complete maximal event.
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
  assert.equal(readJson(path.join(ws, SNAPSHOT))[TASKS].glyphs[T1], '~');
  const lines = historyLines(ws);
  assert.deepEqual(lines.slice(0, priorEvents.length), priorEvents, 'every prior history line stays intact and first');
  const lane = laneEvents(ws);
  const learned = lane.filter((event) => event.type === 'learning-review' || (event.type === 'learning-governance' && event.phase === 'reviewed'));
  assert.deepEqual(learned.map((event) => event.type), ['learning-review', 'learning-governance']);
  const [reviewEvent] = learned;
  assert.equal(reviewEvent.reviewIdentity, published.reviewIdentity, 'the fresh receiver derived the review the preflight prepared');
  assert.equal(reviewEvent.outcome, 'no-progress');
  assert.deepEqual(reviewEvent.noProgressProof.credibleMaterialAlternativeIdentities, []);
  assert.deepEqual(reviewEvent.findings, review.findings, 'all sixteen findings are retained');
  assert.deepEqual(reviewEvent.alternatives, review.alternatives, 'the rejected alternative is retained');
  assert.equal(Buffer.byteLength(lines[lane.indexOf(reviewEvent)]), 16_402, 'the maximal event line is retained whole');
  const current = currentRunEvents(readJson(status.retainedEvidence));
  assert.deepEqual(current.map((event) => canonicalJson(event)), lane.map((event) => canonicalJson(event)), 'both surfaces hold the same ordered events');

  // The pair is gone, and neither the next task nor the returned state can continue.
  const probe = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 0, 'ownership');
  assert.equal(probe.status, 'absent');
  const wsAfter = tree(ws);
  const nextTask = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T2, '--', ...SHIP_ARGS], driver), 2, 'next task');
  assert.equal(nextTask.stage, 'task');
  assert.match(nextTask.detail, /in-progress task comes first: T001@aaaaaaaa/);
  writeJson(path.join(dir, 'accepted-state.json'), JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8')));
  const carriedOn = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T2, '--state', path.join(dir, 'accepted-state.json'), '--', ...SHIP_ARGS,
  ], driver), 2, 'continuation after a controlled end');
  assert.equal(carriedOn.stage, 'state');
  assert.match(carriedOn.detail, /task-settled/);
  assert.deepEqual(tree(ws), wsAfter, 'the refused claims wrote nothing');
});

test('learning review stops: cancellation ends the live run unsettled, and after supervisor loss a published result grants nothing', {
  timeout: 300_000,
}, async (t) => {
  const cancelled = async () => {
    const { fixture, driver, ws, dir, runner, learning } = await reachLearningChallenge(t);
    const priorEvents = historyLines(ws);
    expectExit(await call(fixture, ['respond', '--root', ws, '--challenge', learning.challenge, '--cancel'], driver), 0, 'cancel');
    const done = await runner.exit;
    assert.equal(done.code, 0, done.stderr);
    const status = readJson(path.join(dir, 'status.json'));
    assert.deepEqual([status.outcome, status.reason, status.acceptedState], ['ended', 'cancelled', null]);
    const result = readJson(status.result);
    const returned = JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8'));
    assert.equal(returned.learningGovernance.phase, 'required', 'the requirement stays unresolved evidence');
    assert.deepEqual(historyLines(ws), priorEvents, 'cancellation retains no learning result');
    assert.equal(glyphOf(read(ws, TASKS), T1), '~', 'the task is not reported complete');
    const probe = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 0, 'ownership');
    assert.equal(probe.status, 'absent');
    writeJson(path.join(dir, 'accepted-state.json'), returned);
    const carriedOn = expectExit(await call(fixture, [
      'claim', '--root', ws, '--spec', SPEC, '--task', T2, '--state', path.join(dir, 'accepted-state.json'), '--', ...SHIP_ARGS,
    ], driver), 2, 'continuation after cancel');
    assert.equal(carriedOn.stage, 'state');
  };

  const supervisorLost = async () => {
    const { fixture, driver, ws, dir, runner, learning, challenge, claimed } = await reachLearningChallenge(t);
    const evidence = governedEvidence(challenge, ws);
    const tasksBefore = read(ws, TASKS);
    runner.child.kill();
    const lost = await runner.exit;
    assert.notEqual(lost.code, 0, 'the live supervisor is gone');
    assert.equal(readJson(path.join(dir, 'status.json')).state, 'waiting', 'the saved status still names the old challenge');

    // Local consistency still holds, so the file is published, but nothing receives it.
    const { review } = learningReview(evidence, 'selected-alternative');
    expectExit(await call(fixture, [
      'respond', '--root', ws, '--challenge', learning.challenge,
      '--learning-review', writeJson(path.join(fixture.io, 'learning-review.json'), review),
    ], driver), 0, 'publication after supervisor loss');
    assert.equal(read(ws, TASKS), tasksBefore, 'no learning was retained');
    const present = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 1, 'retained pair');
    assert.equal(present.status, 'loaded');

    // The saved request, challenge, and response revive nothing.
    const revival = path.join(fixture.io, 'revival');
    const again = await start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', revival], driver).exit;
    assert.equal(again.code, 1, again.stderr);
    const revived = readJson(path.join(revival, 'status.json'));
    assert.equal(revived.outcome, 'hard-stop');
    assert.equal(revived.reason, 'evidence-incomplete', JSON.stringify(revived));
    assert.match(revived.detail, /retainedEvidence/, 'the lost run left no handoff that could admit a fresh request');
    assert.equal(revived.challenges, 0);
    const reclaimed = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 2, 'reclaim');
    assert.equal(reclaimed.stage, 'task');
    assert.equal(read(ws, TASKS), tasksBefore, 'nothing advanced the task');
    const still = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 1, 'pair after refusals');
    assert.equal(still.checkpointKey, present.checkpointKey, 'refusals keep the original pair for manual cleanup');
  };

  await Promise.all([cancelled(), supervisorLost()]);
});

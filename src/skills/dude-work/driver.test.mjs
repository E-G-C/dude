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
import { upsertTaskStateEntry } from '../dude-engine/lib/task-state.mjs';
import { glyphsOf, parseVisibleTasks } from '../dude-engine/lib/tasks.mjs';
import { prepareSpecialistResult, validateTerminalDispositionV1, validateTerminalEvidenceManifestV1 } from './host-adapter.mjs';
import { canonicalJson, currentRunCapture, modelPacket, prepareLearningReviewV2, runCommand, sha256 } from './recovery.mjs';

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
 * @param {Record<string, string>} [env] Extra environment for this child only.
 */
function start(fixture, args, driver = SOURCE_DRIVER, env = {}) {
  const child = spawn(process.execPath, [driver, ...args], {
    cwd: fixture.root,
    env: { ...childEnv(fixture), ...env },
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

const RETAINED_STREAMS = ['currentRun', 'verification', 'review', 'lint'];

/** The empty accepted state every fresh autonomous invocation starts from. @param {Record<string, unknown>} policy */
function freshState(policy) {
  return { policy, overallUsed: 0, recoveryUsed: [], pending: [], completed: [] };
}

/** The runtime input the claim's own first Inspection takes for one retained-evidence object. @param {string} ws @param {any} retained */
function retainedInput(ws, retained) {
  return {
    root: ws,
    specPath: SPEC,
    target: { specPath: SPEC, lane: 'lightweight', taskKey: T1 },
    lane: { kind: 'lightweight' },
    currentRun: retained.currentRun,
    review: retained.review,
    verification: retained.verification,
    lint: retained.lint,
    policyMode: 'autonomous',
  };
}

test('claim --retained-evidence restarts a pending task whose lane history already holds attempts', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws);
  const ws = fs.realpathSync(fixture.ws);
  const store = path.join(fixture.tmp, STORE);

  // History: one actual attempt fails verification under a rejected review, then its run is cancelled.
  const historyClaim = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS]), 0, 'history claim');
  const historyReport = readJson(historyClaim.report);
  assert.equal(Object.hasOwn(historyReport, 'retainedEvidence'), false, 'a claim without the option records no retained evidence');
  assert.equal(historyReport.steps.some((/** @type {any} */ row) => Object.hasOwn(row, 'capturesHash')), false);
  assert.equal(Object.hasOwn(readJson(historyClaim.runnerRequest), 'retainedEvidence'), false, 'and its request carries none');
  const historyDir = path.join(fixture.io, 'history');
  const history = start(fixture, ['run', '--request', historyClaim.runnerRequest, '--dir', historyDir]);
  const assessment = await waitForStatus(historyDir, (status) => status.state === 'waiting' && status.n === 1, 'history assessment');
  expectExit(await call(fixture, [
    'assess', '--root', ws, '--challenge', assessment.challenge, '--input', writeJson(path.join(fixture.io, 'history-assessment.json'), {
      action: 'execute-task',
      targets: ['src/demo.txt'],
      summary: 'Change the demo product file.',
      intent: 'unchanged',
      equivalence: 'none',
      retention: 'transient',
    }),
  ]), 0, 'history assess');
  const pair = await waitForStatus(historyDir, (status) => status.state === 'waiting' && status.n === 2, 'history specialist pair');
  const baseline = path.join(fixture.io, 'history-baseline.json');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline]), 0, 'history snapshot');
  write(ws, 'src/demo.txt', 'attempted\n');
  const changed = path.join(fixture.io, 'history-changed.json');
  expectExit(await call(fixture, ['diff', '--root', ws, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed]), 0, 'history diff');
  const failing = { checks: [check('first'), check('second', 'failed')] };
  const rejected = { verdict: 'rejected', findings: [finding('first')] };
  expectExit(await call(fixture, [
    'respond', '--root', ws, '--challenge', pair.challenge,
    '--tester', writeJson(path.join(fixture.io, 'history-tester.json'), failing),
    '--reviewer', writeJson(path.join(fixture.io, 'history-reviewer.json'), rejected),
    '--changed', changed,
  ]), 0, 'history respond');
  const recovery = await waitForStatus(historyDir, (status) => status.state === 'waiting' && status.n === 3, 'history recovery assessment');
  expectExit(await call(fixture, ['respond', '--root', ws, '--challenge', recovery.challenge, '--cancel']), 0, 'history cancel');
  assert.equal((await history.exit).code, 0);
  const ended = readJson(path.join(historyDir, 'status.json'));
  assert.deepEqual([ended.outcome, ended.reason], ['ended', 'cancelled']);
  const endedState = JSON.parse(Buffer.from(readJson(ended.result).stateBase64, 'base64').toString('utf8'));
  assert.equal(endedState.overallUsed, 1, 'the cancelled invocation spent one attempt');
  const [occurrence] = approachEvents(ws);
  assert.equal(occurrence.occurrence.disposition, 'verification-failed');
  const retainedFile = ended.retainedEvidence;
  const original = readJson(retainedFile);
  for (const field of ['currentRun', 'verification', 'review']) {
    assert.ok(original[field].length > 0, `the cancelled run retained its original ${field} captures`);
  }

  // The fixture coordinator's approved redefinition returns the same task key to
  // pending. Lane history and the cancelled run's captures stay exactly as recorded.
  const claimedTasks = read(ws, TASKS);
  const historyLines = claimedTasks.split('\n').filter((line) => line.startsWith('- dude-run-event: '));
  const pendingTasks = claimedTasks.replace(`- [~] ${T1} `, `- [ ] ${T1} `);
  assert.notEqual(pendingTasks, claimedTasks);
  write(ws, TASKS, pendingTasks);
  upsertTaskStateEntry(ws, TASKS, glyphsOf(parseVisibleTasks(Buffer.from(pendingTasks), { path: TASKS }).parsed));
  fs.appendFileSync(path.join(ws, ...IDEA.split('/')), `- 2026-10-18T00:00:00Z - define: Fixture approved redefinition returned ${T1} to pending.\n`);
  const absentBefore = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 0, 'no pair before the restart');
  assert.equal(absentBefore.status, 'absent');

  const before = tree(ws);
  const requests = () => Object.keys(tree(fixture.root)).filter((file) => file.endsWith('runner-request.json')).length;
  const requestCount = requests();
  /** @param {string} label */
  const unchanged = (label) => {
    assert.deepEqual(tree(ws), before, `${label}: no workspace byte changed`);
    assert.deepEqual(tree(store), {}, `${label}: no ownership pair`);
    assert.equal(requests(), requestCount, `${label}: no runner request`);
  };
  /** @param {string[]} options */
  const claimArgs = (options) => ['claim', '--root', ws, '--spec', SPEC, '--task', T1, ...options, '--', ...SHIP_ARGS];

  // The reported failure: without the original captures the retention check refuses before any claim.
  const without = expectExit(await call(fixture, claimArgs([])), 2, 'claim without the original captures');
  assert.equal(without.stage, 'inspection');
  assert.equal(without.detail, 'retained-occurrence evidence is missing or invalid');
  const withoutReport = readJson(without.report);
  assert.equal(withoutReport.blocker.subject, 'occurrence-retention');
  assert.equal(withoutReport.inspection.overflow, false);
  unchanged('claim without the original captures');

  // Missing, partial, wrong-target, malformed, and unexpected captures, and
  // unreadable sources, refuse at the Inspection before any claim.
  /** @param {(copy: any) => void} change */
  const variant = (change) => {
    const copy = JSON.parse(JSON.stringify(original));
    change(copy);
    return copy;
  };
  const otherTarget = { specPath: SPEC, lane: 'lightweight', taskKey: T2 };
  const foreign = currentRunCapture(otherTarget, []);
  const { lint: _lint, ...withoutLint } = original;
  const refusals = /** @type {[string, string, RegExp][]} */ ([
    ['no captures', { currentRun: [], verification: [], review: [], lint: [] }, /^retained-occurrence evidence is missing or invalid$/],
    ['no current-run capture', variant((copy) => { copy.currentRun = []; }), /^retained-occurrence evidence is missing or invalid$/],
    ['no verification capture', variant((copy) => { copy.verification = []; }), /must resolve the exact bound verification envelope/],
    ['no review capture', variant((copy) => { copy.review = []; }), /^retained-occurrence evidence is missing or invalid$/],
    ['captures relabeled for another target', variant((copy) => {
      for (const field of RETAINED_STREAMS) for (const entry of copy[field]) entry.target = otherTarget;
    }), /must match the complete outer target/],
    ['a coherent capture for another target', {
      currentRun: [{ ...foreign, bytes: { base64: foreign.bytes.toString('base64') } }], verification: [], review: [], lint: [],
    }, /^the Inspection has blockers$/],
    ['non-canonical base64', variant((copy) => {
      copy.verification[0].bytes.base64 = copy.verification[0].bytes.base64.slice(1);
    }), /base64/],
    ['an unexpected stream', { ...original, session: [] }, /^--retained-evidence has exactly these fields$/],
    ['a missing stream', withoutLint, /^--retained-evidence has exactly these fields$/],
    ['a stream that is no array', { ...original, lint: {} }, /must be an array/],
    ['an unexpected capture field', variant((copy) => { copy.review[0].extra = true; }), /unknown field 'extra'/],
    ['an unexpected byte field', variant((copy) => { copy.currentRun[0].bytes.encoding = 'base64'; }), /unknown field 'encoding'/],
  ].map(([label, value, pattern], index) => [label, writeJson(path.join(fixture.io, `refused-${index}.json`), value), pattern]));
  refusals.push(
    ['not JSON', write(fixture.io, 'refused-text.json', 'not json\n'), /is not JSON/],
    ['a directory', fixture.io, /is unreadable/],
    ['a missing file', path.join(fixture.io, 'missing.json'), /is unreadable/],
  );
  const refused = await Promise.all(refusals.map(([, file]) => call(fixture, claimArgs(['--retained-evidence', file]))));
  assert.deepEqual(
    refused.map((result, index) => {
      const [label, , pattern] = refusals[index];
      const cause = pattern.test(result.json?.detail ?? '') ? 'expected cause' : result.json?.detail ?? result.stderr;
      return [label, result.code, result.json?.stage, cause];
    }),
    refusals.map(([label]) => [label, 2, 'inspection', 'expected cause']),
    'every refused source stops at the Inspection with its own cause',
  );
  const twice = await call(fixture, claimArgs(['--retained-evidence', retainedFile, '--retained-evidence', retainedFile]));
  assert.equal(twice.code, 64, `two retained-evidence sources: ${twice.stdout}${twice.stderr}`);
  assert.match(twice.stderr, /option --retained-evidence is given twice/);
  unchanged('refused captures');

  // The claim's first Inspection receives exactly the validated original captures.
  const ownEvidence = runCommand('inspect', { trigger: 'explicit-inspection', input: retainedInput(ws, original) }).inspection.evidenceHash;
  assert.notEqual(ownEvidence, withoutReport.inspection.evidenceHash, 'the captures change the Inspection evidence');
  const claimed = expectExit(await call(fixture, claimArgs(['--retained-evidence', retainedFile])), 0, 'claim with the original captures');
  const report = readJson(claimed.report);
  assert.equal(report.inspection.evidenceHash, ownEvidence, 'the first Inspection carried exactly the original captures');
  const capturesHash = sha256(canonicalJson(Object.fromEntries(RETAINED_STREAMS.map((field) => [field, original[field]]))));
  assert.deepEqual(report.retainedEvidence, {
    file: retainedFile,
    entries: Object.fromEntries(RETAINED_STREAMS.map((field) => [field, original[field].length])),
    capturesHash,
  });
  assert.deepEqual(
    report.steps.map((row) => [row.operation, row.outcome, row.reason, row.capturesHash ?? null]),
    [
      ['fresh-inspection', 'accepted', 'inspection-refreshed', capturesHash],
      ['authorize-lane-effect', 'accepted', 'lane-permit-issued', capturesHash],
      ['apply-lane-effect', 'accepted', 'lane-mutation-applied', null],
      ['commit-lane-receipt', 'accepted', 'lane-receipt-committed', capturesHash],
    ],
    'the ordinary setup sequence, every runtime input carrying the same captures, and no governance, learning, or completion step',
  );
  assert.equal(report.pair.status, 'absent');
  const request = readJson(claimed.runnerRequest);
  assert.deepEqual(Object.keys(request), ['version', 'root', 'target', 'owner', 'state', 'retainedEvidence']);
  assert.deepEqual(request.retainedEvidence, original, 'the request embeds the validated original captures unchanged');
  assert.equal(
    canonicalJson(request.state),
    canonicalJson(freshState(SHIP_POLICY)),
    'history restores no counter: the new invocation starts from the empty state',
  );
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
  assert.equal(readJson(path.join(ws, SNAPSHOT))[TASKS].glyphs[T1], '~');
  assert.deepEqual(claimLines(ws).map((line) => CLAIM_LINE.exec(line)?.[1]), [T1, T1]);
  assert.deepEqual(
    read(ws, TASKS).split('\n').filter((line) => line.startsWith('- dude-run-event: ')),
    historyLines,
    'the claim keeps lane history exactly',
  );

  // The embedded copy is the only source: a second source is refused, and a
  // later change to the original file cannot reach the run.
  const duplicateDir = path.join(fixture.io, 'duplicate');
  const duplicate = expectExit(await call(fixture, [
    'run', '--request', claimed.runnerRequest, '--dir', duplicateDir, '--retained-evidence', retainedFile,
  ]), 2, 'a second retained-evidence source for run');
  assert.match(duplicate.refused, /already carries retainedEvidence/);
  assert.equal(fs.existsSync(duplicateDir), false);
  writeJson(retainedFile, { currentRun: [], verification: [], review: [], lint: [] });

  // The runner's own first Inspection reads the old attempt from the embedded captures.
  const dir = path.join(fixture.io, 'restart');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir]);
  const restarted = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'restart assessment');
  assert.equal(restarted.kind, 'assessment');
  const packet = fs.readFileSync(restarted.packet, 'utf8');
  assert.ok(packet.includes(failing.checks[1].evidence), 'the old attempt failed check reaches the first packet');
  assert.ok(packet.includes(rejected.findings[0].observation.evidence), 'the old review finding reaches the first packet');
  const challengeState = JSON.parse(Buffer.from(readJson(restarted.challenge).stateBase64, 'base64').toString('utf8'));
  assert.equal(canonicalJson(challengeState), canonicalJson(freshState(SHIP_POLICY)), 'the runner restores no counter either');
  expectExit(await call(fixture, ['respond', '--root', ws, '--challenge', restarted.challenge, '--cancel']), 0, 'restart cancel');
  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason], ['ended', 'cancelled']);
  const received = readJson(status.retainedEvidence);
  for (const field of ['verification', 'review', 'lint']) {
    assert.deepEqual(received[field], original[field], `the runner received the embedded ${field} captures unchanged`);
  }
  assert.deepEqual(received.currentRun.slice(0, original.currentRun.length), original.currentRun, 'embedded current-run captures come first');
  assert.equal(received.currentRun.length, original.currentRun.length + 1, 'followed only by the runner\'s own live capture');
  const absent = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 0, 'pair after the cancel');
  assert.equal(absent.status, 'absent');
  assert.deepEqual(tree(store), {});
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
});

test('claim derives retained-evidence source headroom from the runner\'s own admission input', { timeout: 120_000 }, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws);
  const ws = fs.realpathSync(fixture.ws);
  const store = path.join(fixture.tmp, STORE);
  const live = currentRunCapture({ specPath: SPEC, lane: 'lightweight', taskKey: T1 }, []);
  const capture = { ...live, bytes: { base64: live.bytes.toString('base64') } };
  /** @param {number} count */
  const seeded = (count) => ({ currentRun: Array.from({ length: count }, () => capture), verification: [], review: [], lint: [] });
  /** @param {any} input */
  const inspect = (input) => runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;

  // Sixty seeded captures fit the claim's own 64-source view, but the runner
  // pays for one more initially empty live current-run capture.
  const sixty = retainedInput(ws, seeded(60));
  assert.equal(inspect(sixty).blockers.length, 0);
  assert.throws(() => inspect({ ...sixty, currentRun: [...sixty.currentRun, capture] }), /exceeds the resource limit of 64 total source entries/);
  const before = tree(ws);
  const refused = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T1,
    '--retained-evidence', writeJson(path.join(fixture.io, 'sixty.json'), seeded(60)), '--', ...SHIP_ARGS,
  ]), 2, 'sixty seeded captures');
  assert.equal(refused.stage, 'inspection');
  assert.match(refused.detail, /runner's admission Inspection[\s\S]*exceeds the resource limit of 64 total source entries/);
  assert.deepEqual(readJson(refused.report).capacity, {
    budget: 'source-entries', limit: 64, required: 65, source: 'current-run', target: { specPath: SPEC, lane: 'lightweight', taskKey: T1 },
  });
  assert.deepEqual(tree(ws), before, 'no workspace byte changed');
  assert.deepEqual(tree(store), {}, 'no ownership pair');

  // Fifty-nine fit both views; the runner admits exactly what the claim embedded.
  const claimed = expectExit(await call(fixture, [
    'claim', '--root', ws, '--spec', SPEC, '--task', T1,
    '--retained-evidence', writeJson(path.join(fixture.io, 'fifty-nine.json'), seeded(59)), '--', ...SHIP_ARGS,
  ]), 0, 'fifty-nine seeded captures');
  assert.equal(readJson(claimed.runnerRequest).retainedEvidence.currentRun.length, 59);
  const dir = path.join(fixture.io, 'exchange');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir]);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'assessment');
  assert.equal(first.kind, 'assessment');
  expectExit(await call(fixture, ['respond', '--root', ws, '--challenge', first.challenge, '--cancel']), 0, 'cancel');
  assert.equal((await runner.exit).code, 0);
  assert.equal(readJson(path.join(dir, 'status.json')).reason, 'cancelled');
  const absent = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 0, 'pair after the cancel');
  assert.equal(absent.status, 'absent');
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

/**
 * Readable Tester text unique to one attempt, so no pooled representation can
 * hide its growth. @param {string} label @param {number} count @param {number} failed
 */
function uniqueTester(label, count, failed) {
  /** @param {string} prefix */
  const text = (prefix) => `${prefix}${'u'.repeat(8_000 - prefix.length)}`;
  return {
    checks: Array.from({ length: count }, (_, index) => ({
      definition: text(`${label} check ${index + 1}: `),
      outcome: index === failed ? 'failed' : 'passed',
      evidence: text(`${label} evidence ${index + 1}: `),
    })),
  };
}

test('terminal-work completion: the attached driver refuses a later known excess before capture acceptance and retains every original', {
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
   * @param {number} n @param {string} equivalence @param {string} content @param {{checks: Record<string, unknown>[]}} tester
   */
  const attempt = async (n, equivalence, content, tester) => {
    const assessment = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n, `assessment ${n}`);
    assert.equal(assessment.kind, 'assessment');
    const input = writeJson(path.join(fixture.io, `assessment-${n}.json`), {
      action: 'address-test',
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
    // Structural respond success is not a packet-fit claim.
    expectExit(await call(fixture, [
      'respond', '--root', ws, '--challenge', pair.challenge,
      '--tester', writeJson(path.join(fixture.io, `tester-${n + 1}.json`), tester),
      '--reviewer', writeJson(path.join(fixture.io, `reviewer-${n + 1}.json`), { verdict: 'accepted', findings: [] }),
      '--changed', changed,
    ], driver), 0, `respond ${n + 1}`);
    return pair;
  };
  // Each pair's own capture fits; the second completion's accumulated capture cannot.
  const firstPair = await attempt(1, 'none', 'after one\n', uniqueTester('first', 8, 1));
  const secondPair = await attempt(3, 'distinct', 'after two\n', uniqueTester('second', 9, -1));
  const tasksAtStop = read(ws, TASKS);

  const done = await runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.equal(status.outcome, 'hard-stop');
  assert.equal(status.reason, 'evidence-incomplete');
  assert.equal(status.challenges, 4, 'no model call follows the known excess');
  assert.equal(fs.existsSync(path.join(dir, 'challenge-5.json')), false);
  const result = readJson(status.result);
  assert.equal(result.steps.find((row) => row.step === 'attempt:1:settle-completion')?.reason, 'verification-failed');
  assert.deepEqual(
    [result.steps.at(-1).step, result.steps.at(-1).outcome],
    ['attempt:2:record-attempt-result', 'hard-stop'],
    'the refusal precedes acceptance of the later capture',
  );
  assert.equal(result.steps.some((row) => row.step.startsWith('attempt:2:completion')), false, 'no later lane operation');
  const stopped = JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8'));
  assert.equal(stopped.pending.length, 1, 'the second authorization stays pending');
  assert.equal(Object.hasOwn(stopped, 'pendingCompletion'), false);
  assert.equal(status.acceptedState, null);
  assert.equal(read(ws, TASKS), tasksAtStop, 'no predictable lane write after the refusal');
  const occurrences = approachEvents(ws);
  assert.equal(occurrences.length, 1, 'only the earlier attempt reached the lane');
  assert.equal(occurrences[0].occurrence.disposition, 'verification-failed');

  // The retained evidence keeps each earlier original, then the rejected pair, as built.
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
  for (const field of /** @type {const} */ (['verification', 'review', 'lint'])) {
    assert.equal(second[field].length, 1, `the rejected pair carries one ${field} capture`);
    assert.deepEqual(retained[field], [...first[field], ...second[field]], `${field}: earlier original, then rejected pair`);
  }
  // The rejected capture alone fit; only the complete accumulated evidence overflows.
  /** @param {Record<string, unknown[]>} streams */
  const inspectRetained = (streams) => runCommand('inspect', {
    trigger: 'explicit-inspection',
    input: {
      root: ws,
      specPath: SPEC,
      target: { specPath: SPEC, lane: 'lightweight', taskKey: T1 },
      lane: { kind: 'lightweight' },
      currentRun: retained.currentRun,
      ...streams,
      policyMode: 'autonomous',
    },
  }).inspection;
  const alone = inspectRetained(second);
  const accumulated = inspectRetained({ verification: retained.verification, review: retained.review, lint: retained.lint });
  assert.equal(alone.overflow, false);
  assert.equal(accumulated.overflow, true);
  t.diagnostic(canonicalJson({
    terminalDriverCompletion: {
      secondAssessmentPacket: Buffer.byteLength(canonicalJson(readJson(path.join(dir, 'packet-3.json')))),
      rejectedPairAlone: Buffer.byteLength(canonicalJson(modelPacket(alone))),
      accumulatedOverflow: accumulated.overflow,
      retainedCaptures: Object.fromEntries(RETAINED_STREAMS.map((field) => [field, retained[field].length])),
    },
  }));
});

test('terminal-work completion: the attached driver refuses a known required-learning excess before capture acceptance', {
  timeout: 240_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  // The claim line stays the only owner-log event, so no optional older event
  // can absorb growth near the limit.
  const seeded = '- 2026-10-17T00:00:00Z - define: Seeded the fixture.\n';
  assert.ok(ideaText().endsWith(seeded));
  const idea = ideaText().slice(0, -seeded.length);
  const target = { specPath: SPEC, lane: 'lightweight', taskKey: T1 };

  /**
   * Claim and run one workspace whose retained evidence holds one earlier lint
   * capture of `padding` characters, which every later acquisition carries once,
   * then drive two attempts whose reviews reject with the same finding, so the
   * second completion requires learning.
   * @param {string} label @param {number} padding
   */
  const repeatedRejection = async (label, padding) => {
    seed(path.join(fixture.root, label), { idea });
    const ws = fs.realpathSync(path.join(fixture.root, label));
    const records = [{ padding: 'x'.repeat(padding) }];
    const body = canonicalJson({ target, state: 'passed', records: records.map((substantive) => ({ substantive })) });
    const seededEvidence = {
      currentRun: [],
      verification: [],
      review: [],
      lint: [{
        target,
        state: 'passed',
        outcomeHash: sha256(canonicalJson({ target, state: 'passed', records })),
        bytes: { base64: Buffer.from(body).toString('base64') },
      }],
    };
    const claimed = expectExit(await call(fixture, [
      'claim', '--root', ws, '--spec', SPEC, '--task', T1,
      '--retained-evidence', writeJson(path.join(fixture.io, `${label}-retained.json`), seededEvidence), '--', ...SHIP_ARGS,
    ], driver), 0, `${label} claim`);
    const dir = path.join(fixture.io, label);
    const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
    /** @type {{pair:any, tasks:string}[]} */
    const attempts = [];
    for (const n of [1, 3]) {
      const assessment = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n, `${label} assessment ${n}`);
      assert.equal(assessment.kind, 'assessment');
      expectExit(await call(fixture, [
        'assess', '--root', ws, '--challenge', assessment.challenge, '--input', writeJson(path.join(fixture.io, `${label}-assessment-${n}.json`), {
          action: 'address-test',
          targets: ['src/demo.txt'],
          summary: `Change the demo product file (challenge ${n}).`,
          intent: 'unchanged',
          equivalence: n === 1 ? 'none' : 'distinct',
          retention: 'transient',
        }),
      ], driver), 0, `${label} assess ${n}`);
      const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n + 1, `${label} specialist pair ${n + 1}`);
      assert.equal(pair.kind, 'specialist-pair');
      const baseline = path.join(fixture.io, `${label}-baseline-${n + 1}.json`);
      expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, `${label} snapshot ${n + 1}`);
      write(ws, 'src/demo.txt', `after ${n}\n`);
      const changed = path.join(fixture.io, `${label}-changed-${n + 1}.json`);
      expectExit(await call(fixture, [
        'diff', '--root', ws, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed,
      ], driver), 0, `${label} diff ${n + 1}`);
      const tasks = read(ws, TASKS);
      // Structural respond success is not a packet-fit claim.
      expectExit(await call(fixture, [
        'respond', '--root', ws, '--challenge', pair.challenge,
        '--tester', writeJson(path.join(fixture.io, `${label}-tester-${n + 1}.json`), { checks: [check('repeated finding')] }),
        '--reviewer', writeJson(path.join(fixture.io, `${label}-reviewer-${n + 1}.json`), { verdict: 'rejected', findings: [finding('repeated')] }),
        '--changed', changed,
      ], driver), 0, `${label} respond ${n + 1}`);
      attempts.push({ pair, tasks });
    }
    return { ws, dir, runner, attempts, seededEvidence };
  };

  // Calibrate on an actual run that fits: both completions settle, required
  // learning is projected, and the learning review carries that receipt's packet.
  // Its padding already has the boundary's decimal width.
  const padding = 200_000;
  const calibration = await repeatedRejection('calibration', padding);
  const learning = await waitForStatus(calibration.dir, (status) => status.state === 'waiting' && status.n === 5, 'calibration learning review');
  assert.equal(learning.kind, 'learning-review');
  const learningReceipt = Buffer.byteLength(canonicalJson(readJson(learning.packet)));
  expectExit(await call(fixture, ['respond', '--root', calibration.ws, '--challenge', learning.challenge, '--cancel'], driver), 0, 'calibration cancel');
  assert.equal((await calibration.runner.exit).code, 0);
  assert.equal(readJson(path.join(calibration.dir, 'status.json')).reason, 'cancelled');
  assert.equal(approachEvents(calibration.ws).length, 2, 'both calibration completions settled');
  assert.ok(read(calibration.ws, TASKS).includes('"type":"learning-governance"'), 'required learning was projected');

  // The same records with the retained padding grown by exactly the remaining bytes.
  const shifted = padding + 262_145 - learningReceipt;
  const sized = await repeatedRejection('sized', shifted);
  const done = await sized.runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(sized.dir, 'status.json'));
  assert.equal(status.outcome, 'hard-stop');
  assert.equal(status.reason, 'evidence-incomplete');
  const result = readJson(status.result);
  assert.deepEqual(result.capacity, {
    budget: 'model-packet-bytes', limit: 262_144, required: 262_145,
    source: 'model-packet', target: { specPath: SPEC, lane: 'lightweight', taskKey: T1 },
  }, 'the shift lands exactly on the required-learning first excess, wherever it is refused');
  assert.equal(status.challenges, 4, 'no model call follows the known excess');
  assert.equal(fs.existsSync(path.join(sized.dir, 'challenge-5.json')), false);
  assert.equal(result.steps.find((row) => row.step === 'attempt:1:settle-completion')?.reason, 'review-rejected');
  assert.deepEqual(
    [result.steps.at(-1).step, result.steps.at(-1).outcome],
    ['attempt:2:record-attempt-result', 'hard-stop'],
    'the refusal precedes acceptance of the repeating capture',
  );
  assert.equal(result.steps.some((row) => row.step.startsWith('attempt:2:completion')), false, 'no later lane operation');
  assert.equal(read(sized.ws, TASKS), sized.attempts[1].tasks, 'no occurrence or learning write after the refusal');
  const occurrences = approachEvents(sized.ws);
  assert.equal(occurrences.length, 1, 'only the earlier completion reached the lane');
  assert.equal(occurrences[0].occurrence.disposition, 'review-rejected');
  const stopped = JSON.parse(Buffer.from(result.stateBase64, 'base64').toString('utf8'));
  assert.equal(stopped.overallUsed, 2);
  assert.equal(stopped.pending.length, 1, 'the second authorization stays pending');
  assert.equal(stopped.completed.length, 1, 'the earlier completion stays settled');
  assert.equal(Object.hasOwn(stopped, 'pendingCompletion'), false);
  assert.equal(Object.hasOwn(stopped, 'learningGovernance'), false);
  assert.equal(status.acceptedState, null);

  // The retained evidence keeps the seeded and earlier originals, then the rejected pair, as built.
  const [first, second] = sized.attempts.map(({ pair }) => {
    const challenge = readJson(pair.challenge);
    const state = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
    return prepareSpecialistResult(state, readJson(pair.response).specialistResult).streams;
  });
  const retained = readJson(status.retainedEvidence);
  assert.deepEqual(Object.keys(retained), ['currentRun', 'verification', 'review', 'lint']);
  for (const field of /** @type {const} */ (['verification', 'review', 'lint'])) {
    assert.deepEqual(retained[field], [...sized.seededEvidence[field], ...first[field], ...second[field]],
      `${field}: seeded and earlier originals, then rejected pair`);
  }
  t.diagnostic(canonicalJson({
    terminalDriverRequiredLearning: {
      calibrationPadding: padding, calibrationLearningReceipt: learningReceipt, sizedPadding: shifted,
      required: result.capacity.required, stopStep: result.steps.at(-1).step,
    },
  }));
});

const TERMINAL_MEMBERS = [
  'terminal-original.json', 'retained-evidence.json', 'terminal-controls.json',
  'terminal-fence.json', 'terminal-effects.json', 'terminal-evidence.json',
];

/**
 * A test-owned preload that acts only inside a `driver run` child. It traces the
 * run's terminal publications and pair removals, and injects at most one named
 * filesystem fault. With `umask` it sets the child's own creation mask, and with
 * `traceModes` it records the creation mode requested for each new directory
 * and temporary publication file, and every chmod. The production driver,
 * runner, adapter, and store run unchanged.
 * @param {ReturnType<typeof makeFixture>} fixture
 */
function terminalFaultPreload(fixture) {
  const preload = path.join(fixture.io, 'terminal-faults.cjs');
  fs.writeFileSync(preload, `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
if (process.env.DWT_FS_PLAN && process.argv.includes('run')) {
  const plan = JSON.parse(process.env.DWT_FS_PLAN);
  if (typeof plan.umask === 'number') process.umask(plan.umask);
  const real = {
    writeFileSync: fs.writeFileSync, renameSync: fs.renameSync, rmSync: fs.rmSync,
    readFileSync: fs.readFileSync, lstatSync: fs.lstatSync, appendFileSync: fs.appendFileSync,
    mkdirSync: fs.mkdirSync, chmodSync: fs.chmodSync,
  };
  const name = (file) => path.basename(String(file));
  const trace = (entry) => real.appendFileSync(plan.trace, entry + '\\n');
  const fault = (code, syscall, file) => Object.assign(
    new Error(code + ': fixture ' + syscall + ' fault on ' + name(file)), { code, syscall, path: String(file) });
  const modeOf = (options) => (options && typeof options === 'object' && typeof options.mode === 'number'
    ? options.mode.toString(8) : 'default');
  const canonical = (value) => value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  const reads = new Map();
  let checkpointRemoved = false;
  let claimRemoved = false;
  let observedAfterClaim = 0;
  fs.renameSync = function renameSync(source, destination, ...rest) {
    const result = real.renameSync.call(this, source, destination, ...rest);
    const target = name(destination);
    if (target.startsWith('terminal-') || target === 'retained-evidence.json') trace('publish:' + target);
    return result;
  };
  fs.writeFileSync = function writeFileSync(file, ...rest) {
    if (typeof file === 'string' && plan.failWrite && name(file).startsWith('.' + plan.failWrite + '.')) {
      throw fault('EIO', 'write', file);
    }
    const temporary = typeof file === 'string' ? /^\\.(.+)\\.[0-9a-f]+\\.tmp$/.exec(name(file)) : null;
    if (plan.traceModes && temporary) trace('create:' + temporary[1] + ':' + modeOf(rest[1]));
    return real.writeFileSync.call(this, file, ...rest);
  };
  if (plan.traceModes) {
    fs.mkdirSync = function mkdirSync(directory, options, ...rest) {
      trace('mkdir:' + name(directory) + ':' + modeOf(options));
      return real.mkdirSync.call(this, directory, options, ...rest);
    };
    fs.chmodSync = function chmodSync(target, mode, ...rest) {
      trace('chmod:' + name(target) + ':' + Number(mode).toString(8));
      return real.chmodSync.call(this, target, mode, ...rest);
    };
  }
  fs.readFileSync = function readFileSync(file, ...rest) {
    // After the store's own confirmed checkpoint unlink, every claim read fails with an I/O error.
    if (plan.failClaimRead && checkpointRemoved && /\\.claim$/.test(String(file))) {
      trace('fault:read:claim');
      throw fault('EIO', 'read', file);
    }
    const result = real.readFileSync.call(this, file, ...rest);
    if (typeof file === 'string' && plan.corruptRead === name(file)) {
      const ordinal = (reads.get(file) || 0) + 1;
      reads.set(file, ordinal);
      if (ordinal === plan.corruptReadOrdinal) return Buffer.concat([Buffer.from(result), Buffer.from(' ')]);
    }
    return result;
  };
  fs.rmSync = function rmSync(file, ...rest) {
    const target = name(file);
    const kind = target.endsWith('.checkpoint') ? 'checkpoint' : target.endsWith('.claim') ? 'claim' : null;
    if (kind === null) return real.rmSync.call(this, file, ...rest);
    trace('remove:' + kind);
    // The exact bytes this removal is about to delete, for comparison with the retained controls.
    if (plan.keepRemoved) real.writeFileSync(plan.trace + '.' + kind, real.readFileSync(file));
    if (plan.failRemove === kind) throw fault('EPERM', 'unlink', file);
    const original = kind === 'checkpoint' && plan.reappear ? real.readFileSync(file, 'utf8') : null;
    const result = real.rmSync.call(this, file, ...rest);
    if (original !== null) {
      // A valid, independently rehashed replacement reappears after removal.
      const record = JSON.parse(original);
      delete record.recordHash;
      record.updatedAt = '2000-01-01T00:00:00.000Z';
      record.recordHash = createHash('sha256').update(canonical(record)).digest('hex');
      real.writeFileSync(file, canonical(record));
      trace('reappear:checkpoint');
    }
    if (kind === 'checkpoint') checkpointRemoved = true;
    if (kind === 'claim') claimRemoved = true;
    return result;
  };
  fs.lstatSync = function lstatSync(file, ...rest) {
    // After the store's own final absence probes, the next pair observation is unavailable.
    if (plan.failFinalObservation && claimRemoved && /\\.(claim|checkpoint)$/.test(String(file))) {
      observedAfterClaim += 1;
      if (observedAfterClaim > 2) throw fault('EIO', 'lstat', file);
    }
    return real.lstatSync.call(this, file, ...rest);
  };
}
`);
  return preload;
}

/**
 * Claim and run one fresh workspace through the real driver, then answer the
 * first Assessment once: by default with a valid bound action `none`, which
 * stops at authorization without dispatch authority; with `respond: 'invalid'`,
 * a well-formed envelope whose payload the runner rejects, which nominates
 * Feature 056's first-Assessment release instead.
 * @param {ReturnType<typeof makeFixture>} fixture @param {string} driver @param {string} label
 * @param {{preload?:string, plan?:Record<string, unknown>, mutate?:(pair:{key:string, claim:string, checkpoint:string})=>void, respond?:'none'|'invalid', dir?:string}} [options]
 */
async function terminalProducerRun(fixture, driver, label, { preload, plan, mutate, respond = 'none', dir: runDirectory } = {}) {
  const ws = path.join(fixture.root, label);
  seed(ws);
  const root = fs.realpathSync(ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', root, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, `${label} claim`);
  const ownerAfterClaim = read(root, IDEA);
  const dir = runDirectory ?? path.join(fixture.io, label);
  const trace = path.join(fixture.io, `${label}.trace`);
  const env = plan === undefined ? {} : {
    NODE_OPTIONS: `--require "${String(preload).split(path.sep).join('/')}"`,
    DWT_FS_PLAN: JSON.stringify({ ...plan, trace }),
  };
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver, env);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, `${label} assessment`);
  const probe = expectExit(await call(fixture, ['ownership', '--root', root, '--spec', SPEC, '--task', T1], driver), 1, `${label} live pair`);
  const store = path.join(fixture.tmp, STORE);
  const pair = {
    key: probe.checkpointKey,
    claim: path.join(store, `${probe.checkpointKey}.claim`),
    checkpoint: path.join(store, `${probe.checkpointKey}.checkpoint`),
  };
  const original = { claim: fs.readFileSync(pair.claim), checkpoint: fs.readFileSync(pair.checkpoint) };
  mutate?.(pair);
  const temporary = `${first.response}.fixture`;
  writeJson(temporary, {
    version: 1,
    type: 'challenge-response',
    challengeIdentity: first.challengeIdentity,
    kind: 'assessment',
    assessment: respond === 'none' ? {
      evidenceHash: readJson(first.challenge).inspection.evidenceHash,
      intent: 'unchanged',
      action: 'none',
      materialInputs: { targets: [], operations: [], checks: [] },
      equivalence: 'none',
      retention: 'transient',
      summary: `terminal-work producer: ${label}`,
    } : { invalid: `terminal-work producer payload: ${label}` },
  });
  fs.renameSync(temporary, first.response);
  const done = await runner.exit;
  const status = readJson(path.join(dir, 'status.json'));
  const present = ['claim', 'checkpoint'].filter((kind) => fs.existsSync(pair[/** @type {'claim'|'checkpoint'} */ (kind)]));
  const resultFile = path.join(dir, 'result.json');
  /** @param {'claim'|'checkpoint'} kind */
  const removed = (kind) => (fs.existsSync(`${trace}.${kind}`) ? fs.readFileSync(`${trace}.${kind}`) : null);
  return {
    label, root, dir, done, status, pair, original, present, ownerAfterClaim,
    request: claimed.runnerRequest,
    // A run that fails after publishing its result has no finished status naming it.
    result: fs.existsSync(resultFile) ? readJson(resultFile) : null,
    files: fs.readdirSync(dir).sort(),
    trace: fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split('\n') : [],
    removed: { claim: removed('claim'), checkpoint: removed('checkpoint') },
  };
}

/**
 * Every producer outcome keeps the one original hard stop, publishes no
 * continuation or claim, and returns only auxiliary resource fields.
 * @param {Awaited<ReturnType<typeof terminalProducerRun>>} run @param {string} [reason]
 */
function assertOriginalProducerStop(run, reason = 'no-action') {
  const { label, done, status, result, dir, root } = run;
  assert.equal(done.code, 1, `${label}: one nonzero hard stop\n${done.stderr}`);
  assert.deepEqual([status.outcome, status.reason], ['hard-stop', reason], label);
  assert.equal(status.exitCode, 1, label);
  assert.equal(result.steps.filter((/** @type {any} */ step) => step.outcome === 'hard-stop').length, 1, `${label}: one stop`);
  const original = readJson(path.join(dir, 'terminal-original.json'));
  const { terminalDisposition, ...returned } = result;
  for (const field of ['cleanup', 'orphan']) {
    if (Object.hasOwn(original, field)) returned[field] = original[field];
    else delete returned[field];
  }
  assert.deepEqual(returned, original, `${label}: the original terminal is unchanged`);
  assert.deepEqual(status.terminalDisposition, terminalDisposition, `${label}: status carries only the auxiliary disposition`);
  assert.equal(status.acceptedState, null, `${label}: no continuation state`);
  assert.equal(fs.existsSync(path.join(dir, 'accepted-state.json')), false, label);
  assert.equal(status.haltReport.halted, true, label);
  assert.deepEqual(claimLines(root).map((line) => CLAIM_LINE.exec(line)?.[1]), [T1], `${label}: no new claim`);
  assert.equal(read(root, IDEA), run.ownerAfterClaim, `${label}: no owner-log write after the claim`);
  assert.equal(glyphOf(read(root, TASKS), T1), '~', `${label}: the task stays in progress`);
  return original;
}

/**
 * A refused producer disposition names one first missing proof and exact facts.
 * @param {Awaited<ReturnType<typeof terminalProducerRun>>} run @param {string} kind @param {string} subject
 * @param {{checkpoint:string,claim:string}} removal @param {string[]} present
 */
function assertProducerRefusal(run, kind, subject, removal, present) {
  const disposition = run.status.terminalDisposition;
  assert.equal(disposition.outcome, 'refused', run.label);
  assert.deepEqual(disposition.missingProof.kind, kind, run.label);
  assert.equal(disposition.missingProof.subject, subject, run.label);
  assert.deepEqual(disposition.removal, removal, run.label);
  assert.deepEqual(run.present, present, `${run.label}: remaining controls`);
  const { dispositionIdentity, ...record } = disposition;
  assert.doesNotThrow(() => validateTerminalDispositionV1(record), run.label);
  const file = path.join(run.dir, 'terminal-disposition.json');
  if (fs.existsSync(file)) {
    assert.deepEqual(readJson(file), record, `${run.label}: the published disposition is the returned one`);
    assert.equal(dispositionIdentity, sha256(canonicalJson(record)), run.label);
  } else {
    assert.equal(dispositionIdentity, null, `${run.label}: an unpublished disposition has no identity`);
  }
}

test('terminal-work producer: the actual driver fences, retains immutable evidence, then removes the exact pair once', {
  timeout: 240_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const preload = terminalFaultPreload(fixture);
  const [plain, traced] = await Promise.all([
    terminalProducerRun(fixture, driver, 'eligible'),
    terminalProducerRun(fixture, driver, 'eligible-traced', { preload, plan: { keepRemoved: true } }),
  ]);
  for (const run of [plain, traced]) {
    const original = assertOriginalProducerStop(run);
    assert.equal(Object.hasOwn(original, 'cleanup'), false, `${run.label}: an adapter stop carries no resource field of its own`);
    assert.deepEqual([run.status.cleanup, run.status.orphan], ['cleared', false], run.label);
    assert.deepEqual(run.present, [], `${run.label}: both controls removed`);
    const absent = expectExit(await call(fixture, ['ownership', '--root', run.root, '--spec', SPEC, '--task', T1], driver), 0, run.label);
    assert.equal(absent.status, 'absent');
    assert.deepEqual(run.files, [
      'challenge-1.json', 'packet-1.json', 'response-1.json', 'result.json', 'retained-evidence.json', 'status.json',
      'terminal-controls.json', 'terminal-disposition.json', 'terminal-effects.json', 'terminal-evidence.json',
      'terminal-fence.json', 'terminal-original.json',
    ], `${run.label}: run-local evidence only, with no continuation file`);
    const manifest = validateTerminalEvidenceManifestV1(readJson(run.status.terminalEvidence));
    assert.equal(run.status.terminalEvidence, path.join(run.dir, 'terminal-evidence.json'));
    for (const file of manifest.files) {
      const bytes = fs.readFileSync(path.join(run.dir, file.name));
      assert.deepEqual([sha256(bytes), bytes.byteLength], [file.sha256, file.byteLength], `${run.label}: ${file.name} reread exactly`);
    }
    const disposition = readJson(path.join(run.dir, 'terminal-disposition.json'));
    assert.deepEqual(disposition, {
      version: 1, manifestIdentity: sha256(canonicalJson(manifest)), outcome: 'disposed',
      removal: { checkpoint: 'absent', claim: 'absent' }, missingProof: null,
    });
    assert.deepEqual(run.status.terminalDisposition, { ...disposition, dispositionIdentity: sha256(canonicalJson(disposition)) });
    // The actual default ports produced the proof; no caller-supplied identity was involved.
    const effects = readJson(path.join(run.dir, 'terminal-effects.json'));
    assert.deepEqual(effects.ports, { runtime: 'built-in', laneOwner: 'built-in', observation: 'complete' });
    assert.deepEqual(effects.operations.map((/** @type {any} */ entry) => entry.operation), ['fresh-inspection', 'fresh-inspection', 'authorize-attempt']);
    assert.deepEqual([effects.correction, effects.recoveryNotice], [null, null], `${run.label}: no transient record was pending`);
    // The retained controls are the exact bytes the live owner held: its immutable
    // claim, and the checkpoint it last wrote itself while authorizing.
    const controls = readJson(path.join(run.dir, 'terminal-controls.json'));
    const retainedCheckpoint = Buffer.from(controls.checkpoint.base64, 'base64');
    assert.deepEqual(Buffer.from(controls.claim.base64, 'base64'), run.original.claim, `${run.label}: claim bytes`);
    const record = JSON.parse(retainedCheckpoint.toString('utf8'));
    const created = JSON.parse(run.original.checkpoint.toString('utf8'));
    for (const field of ['checkpointKey', 'invocationIdentity', 'workerToken', 'workerGeneration', 'createdAt']) {
      assert.equal(record[field], created[field], `${run.label}: the same owner's checkpoint ${field}`);
    }
    assert.ok(record.hostRevision > created.hostRevision, `${run.label}: the owner's own later checkpoint write`);
    assert.deepEqual([manifest.binding.checkpointKey, manifest.binding.checkpointHash], [run.pair.key, record.recordHash]);
    assert.equal(manifest.binding.checkpointHostRevision, record.hostRevision);
    assert.ok(manifest.binding.fenceHostRevision > manifest.binding.checkpointHostRevision);
    assert.equal(manifest.binding.terminalHash, sha256(canonicalJson(readJson(path.join(run.dir, 'terminal-original.json')))));
    for (const secret of [record.invocationIdentity, record.workerToken]) {
      assert.equal(fs.readFileSync(path.join(run.dir, 'status.json'), 'utf8').includes(secret), false, 'no raw token in status');
      assert.equal(run.done.stdout.includes(secret), false, 'no raw token on stdout');
    }
    const retained = readJson(run.status.retainedEvidence);
    assert.deepEqual(Object.keys(retained), ['currentRun', 'verification', 'review', 'lint']);
  }
  // Content first, manifest last, then the single guarded removal, then the separate disposition.
  assert.deepEqual(traced.trace, [
    ...TERMINAL_MEMBERS.map((name) => `publish:${name}`),
    'remove:checkpoint', 'remove:claim', 'publish:terminal-disposition.json',
  ]);
  // The removal deleted exactly the controls the evidence retained, byte for byte.
  const tracedControls = readJson(path.join(traced.dir, 'terminal-controls.json'));
  assert.deepEqual(traced.removed, {
    claim: Buffer.from(tracedControls.claim.base64, 'base64'),
    checkpoint: Buffer.from(tracedControls.checkpoint.base64, 'base64'),
  });
});

test('terminal-work producer: sink, readback, removal, reappearance, absence, publication, and pair faults keep exact facts and one first proof', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const preload = terminalFaultPreload(fixture);
  /** @param {string} file @param {(record:any)=>void} change */
  const rehash = (file, change) => {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete record.recordHash;
    change(record);
    fs.writeFileSync(file, canonicalJson({ ...record, recordHash: sha256(canonicalJson(record)) }));
  };
  const runs = await Promise.all([
    terminalProducerRun(fixture, driver, 'sink-failure', { preload, plan: { failWrite: 'terminal-controls.json' } }),
    terminalProducerRun(fixture, driver, 'readback-failure', { preload, plan: { corruptRead: 'terminal-fence.json', corruptReadOrdinal: 2 } }),
    terminalProducerRun(fixture, driver, 'checkpoint-unlink', { preload, plan: { failRemove: 'checkpoint' } }),
    terminalProducerRun(fixture, driver, 'claim-unlink', { preload, plan: { failRemove: 'claim' } }),
    terminalProducerRun(fixture, driver, 'reappearance', { preload, plan: { reappear: true } }),
    terminalProducerRun(fixture, driver, 'final-absence', { preload, plan: { failFinalObservation: true } }),
    terminalProducerRun(fixture, driver, 'publication', { preload, plan: { failWrite: 'terminal-disposition.json' } }),
    terminalProducerRun(fixture, driver, 'corrupt-pair', { mutate: (pair) => fs.writeFileSync(pair.checkpoint, '{"not":"a checkpoint"}') }),
    terminalProducerRun(fixture, driver, 'rehashed-pair', {
      mutate: (pair) => rehash(pair.checkpoint, (record) => { record.updatedAt = '2000-01-01T00:00:00.000Z'; }),
    }),
    terminalProducerRun(fixture, driver, 'partial-pair', { mutate: (pair) => fs.rmSync(pair.claim) }),
  ]);
  const byLabel = Object.fromEntries(runs.map((run) => [run.label, run]));
  // A pair changed before authorization already fails the owner's own checkpoint check.
  /** @type {Record<string, string>} */
  const pairStops = { 'corrupt-pair': 'checkpoint-corrupt', 'rehashed-pair': 'checkpoint-drift', 'partial-pair': 'checkpoint-corrupt' };
  for (const run of runs) assertOriginalProducerStop(run, pairStops[run.label]);
  const key = (/** @type {string} */ label) => byLabel[label].pair.key;
  const retained = { checkpoint: 'retained', claim: 'retained' };

  // Retention failures stop before removal; the fence stays and nothing is retried.
  assertProducerRefusal(byLabel['sink-failure'], 'retained-source', 'terminal-controls.json', retained, ['claim', 'checkpoint']);
  assert.equal(fs.existsSync(path.join(byLabel['sink-failure'].dir, 'terminal-evidence.json')), false, 'no manifest without its members');
  assertProducerRefusal(byLabel['readback-failure'], 'retained-source', 'terminal-fence.json', retained, ['claim', 'checkpoint']);
  for (const label of ['sink-failure', 'readback-failure']) {
    assert.equal(byLabel[label].trace.some((entry) => entry.startsWith('remove:')), false, `${label}: no removal`);
    assert.equal(Object.hasOwn(byLabel[label].status, 'cleanup'), false, `${label}: no resource field without a removal attempt`);
  }

  // Removal faults stop where they occur; remaining or replacement artifacts stay.
  assertProducerRefusal(byLabel['checkpoint-unlink'], 'removal-absence', key('checkpoint-unlink'), retained, ['claim', 'checkpoint']);
  assertProducerRefusal(byLabel['claim-unlink'], 'removal-absence', key('claim-unlink'), { checkpoint: 'removed', claim: 'retained' }, ['claim']);
  assertProducerRefusal(byLabel.reappearance, 'removal-absence', key('reappearance'), { checkpoint: 'unestablished', claim: 'retained' }, ['claim', 'checkpoint']);
  assert.notDeepEqual(fs.readFileSync(byLabel.reappearance.pair.checkpoint), byLabel.reappearance.original.checkpoint, 'the replacement is kept, not removed');
  assertProducerRefusal(byLabel['final-absence'], 'removal-absence', key('final-absence'), { checkpoint: 'removed', claim: 'removed' }, []);
  assertProducerRefusal(byLabel.publication, 'removal-absence', 'terminal-disposition.json', { checkpoint: 'removed', claim: 'removed' }, []);
  for (const label of ['checkpoint-unlink', 'claim-unlink', 'reappearance', 'final-absence']) {
    assert.equal(byLabel[label].status.cleanup, 'failed', `${label}: the attempted removal is reported`);
    assert.equal(byLabel[label].trace.filter((entry) => entry === 'remove:checkpoint').length, 1, `${label}: never retried`);
  }
  assert.deepEqual(byLabel['checkpoint-unlink'].trace.filter((entry) => entry.startsWith('remove:')), ['remove:checkpoint'], 'the claim is never removed first');
  assert.equal(byLabel.publication.status.cleanup, 'cleared', 'resources are reported separately from the unpublished disposition');

  // A changed, corrupt, or partial pair found at the seal is never removed.
  assertProducerRefusal(byLabel['corrupt-pair'], 'exact-control-pair', key('corrupt-pair'), retained, ['claim', 'checkpoint']);
  assertProducerRefusal(byLabel['rehashed-pair'], 'exact-control-pair', key('rehashed-pair'), retained, ['claim', 'checkpoint']);
  assertProducerRefusal(byLabel['partial-pair'], 'exact-control-pair', key('partial-pair'), { checkpoint: 'retained', claim: 'unestablished' }, ['checkpoint']);
  for (const label of ['corrupt-pair', 'rehashed-pair', 'partial-pair']) {
    assert.equal(Object.hasOwn(byLabel[label].status, 'cleanup'), false, `${label}: no removal was attempted`);
    const controls = readJson(path.join(byLabel[label].dir, 'terminal-controls.json'));
    assert.deepEqual(Buffer.from(controls.checkpoint.base64, 'base64'), byLabel[label].original.checkpoint, `${label}: original checkpoint bytes`);
    assert.deepEqual(Buffer.from(controls.claim.base64, 'base64'), byLabel[label].original.claim, `${label}: original claim bytes`);
  }
  t.diagnostic(canonicalJson(Object.fromEntries(runs.map((run) => [run.label, {
    outcome: run.status.terminalDisposition.outcome,
    proof: run.status.terminalDisposition.missingProof?.kind ?? null,
    removal: run.status.terminalDisposition.removal,
    present: run.present,
  }]))));
});

test('terminal-work producer: a claim read failure after the confirmed checkpoint removal keeps that removal, the remaining claim, and the fence, with no retry', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const preload = terminalFaultPreload(fixture);
  const run = await terminalProducerRun(fixture, driver, 'claim-read', { preload, plan: { failClaimRead: true, keepRemoved: true } });
  assertOriginalProducerStop(run);
  // The store unlinked the checkpoint and freshly observed its absence; every later claim read failed.
  assertProducerRefusal(run, 'removal-absence', run.pair.key, { checkpoint: 'removed', claim: 'unestablished' }, ['claim']);
  assert.equal(run.status.cleanup, 'failed', 'the attempted removal is reported');
  const faults = run.trace.filter((entry) => entry === 'fault:read:claim').length;
  assert.ok(faults >= 2, `the clear's claim read and the later pair load both failed: ${faults}`);
  assert.deepEqual(run.trace.filter((entry) => entry.startsWith('remove:')), ['remove:checkpoint'],
    'one checkpoint removal, never retried, and the claim is never removed');
  assert.deepEqual(fs.readFileSync(run.pair.claim), run.original.claim, 'the remaining claim is unchanged');
  const controls = readJson(path.join(run.dir, 'terminal-controls.json'));
  assert.deepEqual(Buffer.from(controls.claim.base64, 'base64'), run.original.claim, 'the retained original claim');
  assert.deepEqual(run.removed.checkpoint, Buffer.from(controls.checkpoint.base64, 'base64'), 'the removed checkpoint was the retained one');
  // The fence and its evidence were retained before the removal attempt.
  const manifest = validateTerminalEvidenceManifestV1(readJson(path.join(run.dir, 'terminal-evidence.json')));
  assert.equal(run.status.terminalDisposition.manifestIdentity, sha256(canonicalJson(manifest)));
  assert.equal(readJson(path.join(run.dir, 'terminal-fence.json')).kind, 'terminal-owner-fence');
  // Reusing the request restores nothing: the remaining claim blocks it, and no later caller supplies the fence.
  const reuseDir = path.join(fixture.io, 'claim-read-reuse');
  const reused = await call(fixture, ['run', '--request', run.request, '--dir', reuseDir], driver);
  assert.equal(reused.code, 1, reused.stderr);
  const reusedStatus = readJson(path.join(reuseDir, 'status.json'));
  assert.equal(reusedStatus.outcome, 'hard-stop');
  assert.equal(reusedStatus.terminalDisposition.missingProof.kind, 'owner-fence');
  assert.deepEqual(fs.readFileSync(run.pair.claim), run.original.claim, 'the claim stays exactly as it was');
  assert.equal(fs.existsSync(run.pair.checkpoint), false, 'the removed checkpoint is never recreated');
  t.diagnostic(canonicalJson({ removal: run.status.terminalDisposition.removal, faults, reuse: reusedStatus.reason }));
});

test('terminal-work producer: an explicit run directory under a traversable parent keeps raw control bytes private', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const preload = terminalFaultPreload(fixture);
  const posix = process.platform !== 'win32';
  // A traversable test-owned parent chain, so no private ancestor hides the run directory's own protection.
  const parent = path.join(fixture.io, 'shared');
  fs.mkdirSync(parent);
  if (posix) {
    for (const directory of [fixture.root, fixture.io, parent]) fs.chmodSync(directory, 0o755);
  }
  const dir = path.join(parent, 'explicit-run');
  const run = await terminalProducerRun(fixture, driver, 'explicit-dir', {
    preload, plan: { traceModes: true, umask: 0o022 }, dir,
  });
  assertOriginalProducerStop(run);
  assert.equal(run.status.terminalDisposition.outcome, 'disposed', 'the eligible owner still disposes');
  const controls = readJson(path.join(dir, 'terminal-controls.json'));
  assert.deepEqual(Buffer.from(controls.claim.base64, 'base64'), run.original.claim, 'raw original control bytes are retained here');
  const published = run.files.filter((name) => name !== 'response-1.json');
  assert.ok(published.includes('terminal-controls.json') && published.includes('terminal-evidence.json'));
  // The requested creation modes are observable on every platform.
  assert.ok(run.trace.includes('mkdir:explicit-run:700'), `the new run directory is created private: ${run.trace.join(' ')}`);
  const created = run.trace.filter((entry) => entry.startsWith('create:'));
  assert.deepEqual([...new Set(created.map((entry) => entry.split(':')[1]))].sort(), published,
    'every driver publication goes through one temporary file');
  assert.deepEqual(created.filter((entry) => !entry.endsWith(':600')), [], 'every temporary publication file is created private');
  // Only the new run directory is narrowed; no parent or unrelated user directory is changed.
  const chmods = run.trace.filter((entry) => entry.startsWith('chmod:'));
  for (const ancestor of [path.basename(parent), path.basename(fixture.io), path.basename(fixture.root)]) {
    assert.equal(chmods.some((entry) => entry.startsWith(`chmod:${ancestor}:`)), false, `${ancestor} is never changed`);
  }
  if (posix) {
    assert.ok(chmods.includes('chmod:explicit-run:700'), 'the store pattern sets the exact private mode');
    assert.equal(fs.statSync(parent).mode & 0o777, 0o755, 'the traversable parent is unchanged');
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700, 'the explicit run directory is private');
    for (const name of published) assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o600, `${name} is private`);
    return;
  }
  // Windows applies inherited ACLs rather than POSIX modes, so only the requests and ordinary file semantics are observable.
  assert.deepEqual(chmods.filter((entry) => entry.startsWith('chmod:explicit-run:')), [], 'no POSIX mode change is claimed on Windows');
  for (const name of published) assert.notEqual(fs.statSync(path.join(dir, name)).mode & 0o200, 0, `${name} stays owner-writable`);
  t.diagnostic('POSIX permission bits are not observable on Windows; this run asserted the requested private creation modes and Windows file semantics only');
});

test('terminal-work producer: the actual driver keeps the nominated 056 first-Assessment release and retains only ordinary captures', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const preload = terminalFaultPreload(fixture);
  const [released, unretained] = await Promise.all([
    terminalProducerRun(fixture, driver, '056-release', { respond: 'invalid', preload, plan: {} }),
    terminalProducerRun(fixture, driver, '056-capture-failure', { respond: 'invalid', preload, plan: { failWrite: 'retained-evidence.json' } }),
  ]);

  // The 056 end clears its own pair once, then ordinary captures publish; no owner seal follows.
  assert.equal(released.done.code, 1, released.done.stderr);
  assert.deepEqual([released.status.outcome, released.status.reason], ['hard-stop', 'challenge-response-invalid']);
  assert.deepEqual([released.status.cleanup, released.status.orphan], ['cleared', false]);
  assert.equal(Object.hasOwn(released.status, 'terminalDisposition'), false, 'no owner disposition');
  assert.equal(released.status.terminalEvidence, null, 'no fresh-admission evidence');
  assert.equal(released.result.hostRevision, readJson(path.join(released.dir, 'challenge-1.json')).hostRevision + 1);
  assert.deepEqual(released.present, []);
  assert.deepEqual(released.files, [
    'challenge-1.json', 'packet-1.json', 'response-1.json', 'result.json', 'retained-evidence.json', 'status.json',
  ]);
  assert.deepEqual(released.trace, ['remove:checkpoint', 'remove:claim', 'publish:retained-evidence.json']);
  assert.deepEqual(Object.keys(readJson(released.status.retainedEvidence)), ['currentRun', 'verification', 'review', 'lint']);
  assert.deepEqual(claimLines(released.root).map((line) => CLAIM_LINE.exec(line)?.[1]), [T1], 'no new claim');
  assert.equal(glyphOf(read(released.root, TASKS), T1), '~');

  // Without a disposition to report it, a capture publication failure stays an unexpected error, never a silent null.
  assert.equal(unretained.done.code, 70, unretained.done.stderr);
  assert.match(unretained.done.stderr, /fixture write fault on \.retained-evidence\.json\./);
  assert.notEqual(unretained.status.state, 'finished', 'no finished status claims a run whose captures were lost');
  assert.deepEqual([unretained.result.reason, unretained.result.cleanup], ['challenge-response-invalid', 'cleared']);
  assert.equal(Object.hasOwn(unretained.result, 'terminalDisposition'), false);
  assert.deepEqual(unretained.present, [], 'the 056 release had already ended its own pair');
  assert.equal(unretained.files.some((name) => name.startsWith('terminal-') || name === 'retained-evidence.json'), false);
});

test('terminal-work producer: a legacy PID, status, and checkpoint-only run is refused, never cleaned or fenced by a later caller', {
  timeout: 180_000,
}, async (t) => {
  const fixture = makeFixture(t);
  seed(fixture.ws);
  const ws = fs.realpathSync(fixture.ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS]), 0, 'claim');
  const legacyDir = path.join(fixture.io, 'legacy');
  const legacy = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', legacyDir]);
  await waitForStatus(legacyDir, (status) => status.state === 'waiting' && status.n === 1, 'legacy assessment');
  // The original host is lost without returning: only its PID, status, and pair remain.
  legacy.child.kill();
  await legacy.exit;
  const legacyStatus = readJson(path.join(legacyDir, 'status.json'));
  assert.equal(legacyStatus.state, 'waiting');
  assert.equal(typeof legacyStatus.pid, 'number');
  assert.deepEqual(fs.readdirSync(legacyDir).filter((name) => name.startsWith('terminal-')), [], 'no original fence was produced');
  const store = path.join(fixture.tmp, STORE);
  const pairBefore = tree(store);
  assert.equal(Object.keys(pairBefore).length, 2);
  const ownerBefore = read(ws, IDEA);

  // A later caller reusing the request cannot backfill the missing original fence.
  const laterDir = path.join(fixture.io, 'later');
  const later = await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', laterDir]);
  assert.equal(later.code, 1, later.stderr);
  const status = readJson(path.join(laterDir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason], ['hard-stop', 'checkpoint-ownership-unavailable']);
  const disposition = status.terminalDisposition;
  assert.deepEqual({ ...disposition, dispositionIdentity: null }, {
    version: 1,
    manifestIdentity: null,
    outcome: 'refused',
    removal: { checkpoint: 'retained', claim: 'retained' },
    missingProof: {
      kind: 'owner-fence',
      subject: Object.keys(pairBefore)[0].split('.')[0],
      required: disposition.missingProof.required,
      nextOwnerAction: disposition.missingProof.nextOwnerAction,
    },
    dispositionIdentity: null,
  });
  const { dispositionIdentity: _identity, ...record } = disposition;
  assert.doesNotThrow(() => validateTerminalDispositionV1(record));
  assert.equal(status.terminalEvidence, null, 'no evidence manifest without an original fence');
  assert.deepEqual(tree(store), pairBefore, 'the legacy pair is untouched');
  assert.deepEqual(readJson(path.join(legacyDir, 'status.json')), legacyStatus, 'legacy status and PID are not proof and stay unchanged');
  assert.equal(read(ws, IDEA), ownerBefore, 'no claim or owner-log write');
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
  assert.equal(fs.existsSync(path.join(laterDir, 'accepted-state.json')), false);
  const probe = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1]), 1, 'legacy pair');
  assert.equal(probe.status, 'loaded');

  // Test-owned disposal of this fixture's own bounded pair after its runner exited.
  for (const file of Object.keys(pairBefore)) fs.rmSync(path.join(store, file));
});

// --- Feature 094 T003: terminal-qualified fresh request ---------------------

const PLAN = '.dude/specs/001-demo/plan.md';
const FRESH_MARKER = /^- \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z - work: Freshly claimed (T\d{3}@[a-z0-9]{8}) for new explicit Work request ([0-9a-f]{64}) under admission ([0-9a-f]{64}), bound to terminal evidence ([0-9a-f]{64}) and disposition ([0-9a-f]{64}); the prior Work run remains terminal\.$/;

/** @param {string} ws */
function freshMarkers(ws) {
  return read(ws, IDEA).split('\n').filter((line) => FRESH_MARKER.test(line));
}

/** Every runner request a claim of this fixture published under its child TEMP. @param {ReturnType<typeof makeFixture>} fixture */
function runnerRequests(fixture) {
  return Object.keys(tree(fixture.tmp)).filter((file) => file.endsWith('runner-request.json')).sort();
}

/**
 * The actual producer's disposed handoff for T1 in its own workspace under the
 * source-built driver: one ordinary claim, one hard stop, and the owner's own
 * fence, retention, removal, and disposition.
 * @param {ReturnType<typeof makeFixture>} fixture @param {string} driver @param {string} label
 */
async function freshHandoff(fixture, driver, label) {
  const run = await terminalProducerRun(fixture, driver, label);
  assertOriginalProducerStop(run);
  assert.equal(run.status.terminalDisposition.outcome, 'disposed', label);
  assert.deepEqual(run.present, [], `${label}: the original owner removed its own pair`);
  return { ...run, manifest: /** @type {string} */ (run.status.terminalEvidence) };
}

/** @param {string} root @param {string} manifest @param {{task?:string, options?:string[], args?:string[]}} [options] */
function freshClaimArgs(root, manifest, { task = T1, options = [], args = SHIP_ARGS } = {}) {
  return ['claim', '--root', root, '--spec', SPEC, '--task', task, '--terminal-evidence', manifest, ...options, '--', ...args];
}

/**
 * A refused fresh admission: exit 2 at admission with exactly one first
 * missing proof, printed once, and no runner request.
 * @param {Exit & {json:any}} result @param {string} kind @param {string} subject @param {string} label
 */
function expectMissingProof(result, kind, subject, label) {
  const report = expectExit(result, 2, label);
  assert.equal(report.stage, 'admission', `${label}: ${report.detail}`);
  assert.deepEqual([report.missingProof?.kind, report.missingProof?.subject], [kind, subject], `${label}: ${JSON.stringify(report.missingProof)}`);
  assert.deepEqual(Object.keys(report.missingProof).sort(), ['kind', 'nextOwnerAction', 'required', 'subject'], label);
  assert.equal(result.stdout.split('"missingProof"').length - 1, 1, `${label}: the one proof is printed once`);
  assert.equal(Object.hasOwn(report, 'runnerRequest'), false, label);
  return report;
}

test('terminal-work fresh request: a producer-created handoff admits one new request that settles through normal setup, Assessment, and review', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const handoff = await freshHandoff(fixture, driver, 'fresh-journey');
  const ws = handoff.root;
  const store = path.join(fixture.tmp, STORE);
  const evidence = tree(handoff.dir);
  const manifest = readJson(handoff.manifest);
  const disposition = readJson(path.join(handoff.dir, 'terminal-disposition.json'));
  const before = { tasks: read(ws, TASKS), owner: read(ws, IDEA), tree: tree(ws) };

  // One option, never combined with a carried state or a separate capture source.
  for (const [label, options] of /** @type {[string, string[]][]} */ ([
    ['with --state', ['--state', writeJson(path.join(fixture.io, 'carried.json'), freshState(SHIP_POLICY))]],
    ['with --retained-evidence', ['--retained-evidence', path.join(handoff.dir, 'retained-evidence.json')]],
    ['twice', ['--terminal-evidence', handoff.manifest]],
  ])) {
    const conflict = await call(fixture, freshClaimArgs(ws, handoff.manifest, { options }), driver);
    assert.equal(conflict.code, 64, `option conflict ${label}: ${conflict.stdout}${conflict.stderr}`);
  }
  assert.deepEqual(tree(ws), before.tree, 'option conflicts write nothing');

  // Two stale readers of the same handoff: exactly one claims, the other writes nothing.
  const readers = await Promise.all([1, 2].map(() => call(fixture, freshClaimArgs(ws, handoff.manifest), driver)));
  const winners = readers.filter((result) => result.code === 0);
  const losers = readers.filter((result) => result.code !== 0);
  assert.equal(winners.length, 1, `exactly one stale reader claims:\n${readers.map((result) => result.stdout).join('\n')}`);
  assert.ok([2, 3, 4].includes(/** @type {number} */ (losers[0].code)), `the other refuses before any lane write: ${losers[0].stdout}${losers[0].stderr}`);
  assert.equal(Object.hasOwn(losers[0].json ?? {}, 'runnerRequest'), false);
  t.diagnostic(`the losing stale reader exited ${losers[0].code} at ${losers[0].json?.stage}: ${losers[0].json?.detail}`);
  const claimed = winners[0].json;
  const markers = freshMarkers(ws);
  assert.equal(markers.length, 1, 'one marker');
  assert.equal(read(ws, IDEA), `${before.owner}${markers[0]}\n`, 'the claim only appends its marker');
  assert.equal(read(ws, TASKS), before.tasks, 'tasks.md is byte-identical: same glyph and no event');
  assert.equal(readJson(path.join(ws, SNAPSHOT))[TASKS].glyphs[T1], '~');
  assert.deepEqual(tree(store), {}, 'the setup pair was released');

  const report = readJson(claimed.report);
  assert.deepEqual(
    report.steps.filter((/** @type {any} */ row) => row.outcome === 'accepted').map((/** @type {any} */ row) => [row.operation, row.reason]),
    [
      ['fresh-inspection', 'inspection-refreshed'],
      ['authorize-lane-effect', 'lane-permit-issued'],
      ['apply-lane-effect', 'lane-mutation-applied'],
      ['commit-lane-receipt', 'lane-receipt-committed'],
    ],
    'the official setup sequence',
  );
  assert.deepEqual([report.admission.outcome, report.admission.learningGate], ['eligible', 'assessment']);
  assert.deepEqual(report.terminalEvidence, {
    file: handoff.manifest,
    manifestIdentity: sha256(canonicalJson(manifest)),
    dispositionIdentity: sha256(canonicalJson(disposition)),
  });
  const [, task, requestIdentity, admissionIdentity, manifestIdentity, dispositionIdentity] = /** @type {RegExpExecArray} */ (FRESH_MARKER.exec(markers[0]));
  assert.deepEqual(
    [task, requestIdentity, admissionIdentity, manifestIdentity, dispositionIdentity],
    [T1, report.admission.requestIdentity, report.admission.admissionIdentity,
      report.terminalEvidence.manifestIdentity, report.terminalEvidence.dispositionIdentity],
    'the marker binds the new request and admission to the old manifest and disposition',
  );
  const request = readJson(claimed.runnerRequest);
  assert.deepEqual(Object.keys(request), ['version', 'root', 'target', 'owner', 'state', 'retainedEvidence', 'priorTerminal']);
  assert.equal(canonicalJson(request.state), canonicalJson(freshState(SHIP_POLICY)), 'fresh accounting from the current policy');
  assert.deepEqual(request.retainedEvidence, readJson(path.join(handoff.dir, 'retained-evidence.json')), 'the original captures, unchanged');
  assert.deepEqual(Object.keys(request.priorTerminal), ['manifestIdentity', 'dispositionIdentity', 'freshAdmissionIdentity', 'setupReceipt']);
  assert.deepEqual(
    [request.priorTerminal.manifestIdentity, request.priorTerminal.dispositionIdentity, request.priorTerminal.freshAdmissionIdentity],
    [manifestIdentity, dispositionIdentity, admissionIdentity],
  );
  assert.equal(request.priorTerminal.setupReceipt.receipt.receiptHash, report.receipt.receiptHash);
  const issuedBytes = fs.readFileSync(claimed.runnerRequest);
  assert.deepEqual(report.terminalRequest, {
    version: 1,
    path: fs.realpathSync(claimed.runnerRequest),
    sha256: sha256(issuedBytes),
    byteLength: issuedBytes.byteLength,
    requirements: manifest.binding.requirements,
  }, 'the claim binds the one request it issued to its canonical location, exact bytes, and admission-bound definition');

  // The marker is a lane change the old handoff never bound: a second claim from it is refused.
  expectMissingProof(await call(fixture, freshClaimArgs(ws, handoff.manifest), driver), 'current-target', IDEA, 'replay after the marker');
  // The request carries its own captures; a separate source is refused without consuming it.
  const usedFile = path.join(path.dirname(claimed.runnerRequest), 'runner-request-used.json');
  const separate = expectExit(await call(fixture, [
    'run', '--request', claimed.runnerRequest, '--dir', path.join(fixture.io, 'separate'),
    '--retained-evidence', path.join(handoff.dir, 'retained-evidence.json'),
  ], driver), 2, 'a separate capture source');
  assert.match(separate.refused, /carries its own original captures/);
  assert.equal(fs.existsSync(usedFile), false, 'a refused invocation does not consume the request');

  // The real run entry consumes the request once, then the ordinary journey follows.
  const dir = path.join(fixture.io, 'fresh-run');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'fresh assessment');
  assert.equal(first.kind, 'assessment', 'ordinary Assessment first');
  const requestBytes = fs.readFileSync(claimed.runnerRequest);
  assert.deepEqual(readJson(usedFile), {
    version: 1,
    kind: 'runner-request-used',
    request: 'runner-request.json',
    requestSha256: sha256(requestBytes),
    requestByteLength: requestBytes.byteLength,
    requestIdentity: sha256(canonicalJson(request)),
    freshAdmissionIdentity: admissionIdentity,
  }, 'the start record binds the exact request bytes and the fresh admission');
  const challengeState = JSON.parse(Buffer.from(readJson(first.challenge).stateBase64, 'base64').toString('utf8'));
  assert.equal(canonicalJson(challengeState), canonicalJson(freshState(SHIP_POLICY)), 'the runner starts from the fresh state');
  const live = expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 1, 'the fresh live pair');
  const setupIdentity = readJson(path.join(claimed.out, 'supervisor.json')).invocationIdentity;
  assert.notEqual(live.record.invocationIdentity, manifest.binding.invocationIdentity, 'not the original invocation');
  assert.notEqual(live.record.invocationIdentity, setupIdentity, 'not the setup invocation');
  const assessed = expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', first.challenge, '--input', writeJson(path.join(fixture.io, 'fresh-assessment.json'), {
    action: 'execute-task',
    targets: ['src/demo.txt'],
    summary: 'Change the demo product file.',
    intent: 'unchanged',
    equivalence: 'none',
    retention: 'transient',
  })], driver), 0, 'fresh assess');
  const second = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 2, 'fresh specialist pair');
  assert.equal(second.kind, 'specialist-pair');
  assert.equal(readJson(second.challenge).assessmentIdentity, assessed.assessmentIdentity, 'authorization binds the new Assessment');
  const baseline = path.join(fixture.io, 'fresh-baseline.json');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, 'fresh snapshot');
  write(ws, 'src/demo.txt', 'after\n');
  const changed = path.join(fixture.io, 'fresh-changed.json');
  expectExit(await call(fixture, ['diff', '--root', ws, '--baseline', baseline, '--challenge', second.challenge, '--out', changed], driver), 0, 'fresh diff');
  expectExit(await call(fixture, [
    'respond', '--root', ws, '--challenge', second.challenge,
    '--tester', writeJson(path.join(fixture.io, 'fresh-tester.json'), { checks: [check('fresh request')] }),
    '--reviewer', writeJson(path.join(fixture.io, 'fresh-reviewer.json'), { verdict: 'accepted', findings: [] }),
    '--changed', changed,
  ], driver), 0, 'fresh respond');
  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason], ['ended', 'task-settled']);
  assert.equal(glyphOf(read(ws, TASKS), T1), 'x');
  assert.equal(read(ws, IDEA), `${before.owner}${markers[0]}\n`, 'the runner adds no owner line');
  const [occurrence] = approachEvents(ws);
  assert.equal(occurrence.occurrence.disposition, 'accepted');
  assert.deepEqual(tree(handoff.dir), evidence, 'the original handoff stays byte-identical evidence');
  assert.deepEqual(tree(store), {});

  // The same request at the real run entry is refused: its start record exists.
  const again = path.join(fixture.io, 'fresh-again');
  const repeated = expectExit(await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', again], driver), 2, 'repeated runner start');
  assert.match(repeated.refused, /already used/);
  assert.equal(repeated.requestUsed, usedFile);
  assert.equal(fs.existsSync(again), false, 'the refused start removes only its own empty directory');
});

test('terminal-work fresh request: a cancelled, failed, or uncertain start never launches another claim or reruns its request', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const store = path.join(fixture.tmp, STORE);
  const handoffs = await Promise.all(['fresh-cancelled', 'fresh-failed', 'fresh-uncertain'].map((label) => freshHandoff(fixture, driver, label)));
  const claims = await Promise.all(handoffs.map((handoff) => call(fixture, freshClaimArgs(handoff.root, handoff.manifest), driver)));
  const [cancelled, failed, uncertain] = handoffs.map((handoff, index) => ({
    ...handoff, claimed: expectExit(claims[index], 0, `${handoff.label} claim`),
  }));
  /** @param {typeof cancelled} entry @param {string} label */
  const rerun = async (entry, label) => {
    const result = expectExit(await call(fixture, ['run', '--request', entry.claimed.runnerRequest, '--dir', path.join(fixture.io, `${label}-again`)], driver), 2, label);
    assert.match(result.refused, /already used/, label);
  };

  // Cancellation at the first Assessment ends the run; nothing claims or starts again.
  {
    const ws = cancelled.root;
    const owner = read(ws, IDEA);
    const tasks = read(ws, TASKS);
    const requests = runnerRequests(fixture);
    const dir = path.join(fixture.io, 'cancelled-run');
    const runner = start(fixture, ['run', '--request', cancelled.claimed.runnerRequest, '--dir', dir], driver);
    const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'cancelled assessment');
    expectExit(await call(fixture, ['respond', '--root', ws, '--challenge', first.challenge, '--cancel'], driver), 0, 'cancel');
    const done = await runner.exit;
    assert.equal(done.code, 0, done.stderr);
    const status = readJson(path.join(dir, 'status.json'));
    assert.deepEqual([status.outcome, status.reason], ['ended', 'cancelled']);
    assert.equal(read(ws, IDEA), owner, 'no new claim marker or owner line after the cancellation');
    assert.equal(freshMarkers(ws).length, 1);
    assert.equal(glyphOf(read(ws, TASKS), T1), '~', 'the task stays in progress for its owner');
    assert.deepEqual(runnerRequests(fixture), requests, 'no new request was published');
    assert.equal(expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 0, 'cancelled pair').status, 'absent');
    await rerun(cancelled, 'cancelled rerun');
    expectMissingProof(await call(fixture, freshClaimArgs(ws, cancelled.manifest), driver), 'current-target',
      read(ws, TASKS) === tasks ? IDEA : TASKS, 'a second claim from the old handoff');
  }

  // A start that fails its own verification stays consumed; restored bytes do not rerun it.
  {
    const ownerFile = path.join(failed.root, ...IDEA.split('/'));
    const owner = fs.readFileSync(ownerFile);
    fs.appendFileSync(ownerFile, '- 2026-11-03T00:00:01Z - define: A later coordinator note.\n');
    const dir = path.join(fixture.io, 'failed-run');
    const done = await call(fixture, ['run', '--request', failed.claimed.runnerRequest, '--dir', dir], driver);
    assert.equal(done.code, 1, done.stderr);
    const status = readJson(path.join(dir, 'status.json'));
    assert.deepEqual([status.outcome, status.reason], ['hard-stop', 'request-invalid']);
    assert.match(readJson(status.result).detail, /current lane surfaces differ from the authorized setup poststate/);
    assert.equal(expectExit(await call(fixture, ['ownership', '--root', failed.root, '--spec', SPEC, '--task', T1], driver), 0, 'failed pair').status, 'absent');
    fs.writeFileSync(ownerFile, owner);
    await rerun(failed, 'failed start rerun');
    assert.equal(freshMarkers(failed.root).length, 1, 'no automatic new claim');
  }

  // An uncertain start, lost after admission, also never reruns.
  {
    const dir = path.join(fixture.io, 'uncertain-run');
    const runner = start(fixture, ['run', '--request', uncertain.claimed.runnerRequest, '--dir', dir], driver);
    await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'uncertain assessment');
    const probe = expectExit(await call(fixture, ['ownership', '--root', uncertain.root, '--spec', SPEC, '--task', T1], driver), 1, 'uncertain pair');
    runner.child.kill();
    await runner.exit;
    await rerun(uncertain, 'uncertain start rerun');
    assert.equal(freshMarkers(uncertain.root).length, 1, 'no automatic new claim');
    // Test-owned disposal of this fixture's own bounded pair after its runner exited.
    for (const kind of ['claim', 'checkpoint']) fs.rmSync(path.join(store, `${probe.checkpointKey}.${kind}`));
  }
});

test('terminal-work fresh request: changed definitions, ineligible targets, guarded or tracked lanes, and missing sources or fences refuse before any write', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const handoff = await freshHandoff(fixture, driver, 'fresh-refusals');
  const ws = handoff.root;
  const store = path.join(fixture.tmp, STORE);
  const tasks = read(ws, TASKS);
  let baseline = tree(ws);
  const requests = runnerRequests(fixture);
  /** @param {string} label */
  const unchanged = (label) => {
    assert.deepEqual(tree(ws), baseline, `${label}: no workspace byte changed`);
    assert.deepEqual(tree(store), {}, `${label}: no ownership pair`);
    assert.deepEqual(runnerRequests(fixture), requests, `${label}: no runner request`);
  };
  /** @param {{task?:string, options?:string[], args?:string[]}} [options] @param {string} [manifest] */
  const claim = (options = {}, manifest = handoff.manifest) => call(fixture, freshClaimArgs(ws, manifest, options), driver);
  /**
   * One claim against one changed workspace file, then its exact bytes again.
   * @param {string} relative @param {string|null} text @param {() => Promise<Exit & {json:any}>} action
   */
  const changedFile = async (relative, text, action) => {
    const file = path.join(ws, ...relative.split('/'));
    const original = fs.readFileSync(file);
    if (text === null) fs.rmSync(file);
    else fs.writeFileSync(file, text);
    try {
      return await action();
    } finally {
      fs.writeFileSync(file, original);
    }
  };
  const T0 = 'T000@cccccccc';
  const claimedLine = `- [~] ${T1} Change the demo product files.`;
  assert.ok(tasks.includes(claimedLine));

  // Changed definitions and task mapping: nothing is remapped.
  /** @type {[string, string, string|null, {task?:string}, string][]} */
  const cases = [
    ['changed spec', SPEC, '# Spec\n\nA changed requirement.\n', {}, SPEC],
    ['changed plan', PLAN, '# Plan\n\nA changed design.\n', {}, PLAN],
    ['changed task unit', TASKS, tasks.replace(claimedLine, `${claimedLine} Now with another scope.`), {}, TASKS],
    ['blocked target', TASKS, tasks.replace(claimedLine, `${claimedLine}\n    blocked-by: waiting on review`), {}, T1],
    ['done target', TASKS, tasks.replace(`- [~] ${T1}`, `- [x] ${T1}`), {}, T1],
    ['unmet dependency', TASKS, tasks.replace(claimedLine, `- [ ] ${T0} A prerequisite.\n${claimedLine}\n    deps: ${T0}`), {}, T0],
    ['earlier in-progress task', TASKS, tasks.replace(claimedLine, `- [~] ${T0} Earlier claimed work.\n${claimedLine}`), {}, T0],
    ['wrong target', TASKS, tasks, { task: T2 }, T2],
  ];
  for (const [label, relative, text, options, subject] of cases) {
    expectMissingProof(await changedFile(relative, text, () => claim(options)), 'current-target', subject, label);
    unchanged(label);
  }
  const rekeyed = expectExit(await changedFile(TASKS, tasks.split(T1).join('T001@aaaaaaab'), () => claim()), 2, 'rekeyed target');
  assert.deepEqual([rekeyed.stage, rekeyed.missingProof], ['tasks', undefined], rekeyed.detail);
  assert.match(rekeyed.detail, /mapping-missing/);
  unchanged('rekeyed target');

  // Missing current and retained sources, and handoffs without the original fence.
  expectMissingProof(await changedFile(PLAN, null, () => claim()), 'current-target', 'definition-plan', 'missing current plan');
  unchanged('missing current plan');
  /** @param {string} label @param {string[]} omit */
  const copied = (label, omit) => {
    const directory = path.join(fixture.io, label);
    fs.mkdirSync(directory);
    for (const name of fs.readdirSync(handoff.dir)) {
      if (!omit.includes(name)) fs.copyFileSync(path.join(handoff.dir, name), path.join(directory, name));
    }
    return path.join(directory, 'terminal-evidence.json');
  };
  expectMissingProof(await claim({}, copied('missing-member', ['retained-evidence.json'])), 'retained-source', 'retained-evidence.json', 'a missing retained member');
  expectMissingProof(await claim({}, copied('missing-fence', ['terminal-evidence.json'])), 'owner-fence', 'terminal-evidence.json', 'a handoff without its manifest');
  const legacy = path.join(fixture.io, 'legacy-status-only');
  fs.mkdirSync(legacy);
  writeJson(path.join(legacy, 'status.json'), { version: 1, pid: 1, state: 'waiting' });
  expectMissingProof(await claim({}, path.join(legacy, 'terminal-evidence.json')), 'owner-fence', 'terminal-evidence.json', 'a legacy run without a fence');
  const named = expectExit(await claim({}, path.join(handoff.dir, 'terminal-original.json')), 2, 'another named file');
  assert.deepEqual([named.stage, named.missingProof], ['terminal-evidence', undefined]);
  assert.match(named.detail, /names the original owner's run-local terminal-evidence\.json/);
  unchanged('missing sources and fences');

  // Guarded policy, and the ordinary path never falls back to a terminal claim.
  const guarded = expectExit(await claim({ args: ['--policy', 'guarded'] }), 2, 'guarded policy');
  assert.equal(guarded.stage, 'policy');
  const ordinary = expectExit(await call(fixture, ['claim', '--root', ws, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 2, 'ordinary claim');
  assert.equal(ordinary.stage, 'task');
  assert.match(ordinary.detail, /is not an unblocked pending task/);
  unchanged('guarded and ordinary');

  // None of the refusals consumed anything: the same handoff still admits exactly one claim.
  expectExit(await claim(), 0, 'the eligible claim after every refusal');
  assert.equal(freshMarkers(ws).length, 1);
  assert.deepEqual(tree(store), {});

  // Imported tracked work refuses before any terminal admission or write.
  baseline = tree(ws);
  fixtureBeads(fixture);
  const tracked = expectExit(await call(fixture, freshClaimArgs(ws, handoff.manifest), driver), 2, 'tracked lane');
  assert.equal(tracked.stage, 'lane');
  assert.deepEqual(tree(ws), baseline, 'tracked lane: no workspace byte changed');
});

test('terminal-work fresh request: a partially committed setup is preserved and reported, never erased or retried', {
  timeout: 240_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const handoff = await freshHandoff(fixture, driver, 'fresh-partial');
  const ws = handoff.root;
  const store = path.join(fixture.tmp, STORE);
  // A test-owned preload that acts only inside a `driver claim` child: the runner
  // request publication fails after the setup committed its marker and ended.
  const preload = path.join(fixture.io, 'claim-faults.cjs');
  fs.writeFileSync(preload, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "if (process.env.DWT_CLAIM_FAIL && process.argv.includes('claim')) {",
    '  const real = fs.writeFileSync;',
    '  fs.writeFileSync = function writeFileSync(file, ...rest) {',
    "    if (typeof file === 'string' && path.basename(file).startsWith(`.${process.env.DWT_CLAIM_FAIL}.`)) {",
    "      throw Object.assign(new Error('EIO: fixture claim publication fault'), { code: 'EIO' });",
    '    }',
    '    return real.call(this, file, ...rest);',
    '  };',
    '}',
    '',
  ].join('\n'));
  const owner = read(ws, IDEA);
  const tasks = read(ws, TASKS);
  const requests = runnerRequests(fixture);
  const faulted = await start(fixture, freshClaimArgs(ws, handoff.manifest), driver, {
    NODE_OPTIONS: `--require "${preload.split(path.sep).join('/')}"`,
    DWT_CLAIM_FAIL: 'runner-request.json',
  }).exit;
  assert.equal(faulted.code, 5, `${faulted.stdout}${faulted.stderr}`);
  const printed = JSON.parse(faulted.stdout);
  assert.equal(printed.stage, 'exception');
  assert.match(printed.detail, /fixture claim publication fault/);
  assert.equal(Object.hasOwn(printed, 'missingProof'), false, 'not an admission refusal');
  const report = readJson(printed.report);
  assert.match(report.retained, /a lane write was entered/);
  assert.deepEqual(
    report.steps.filter((/** @type {any} */ row) => row.outcome === 'accepted').map((/** @type {any} */ row) => row.operation),
    ['fresh-inspection', 'authorize-lane-effect', 'apply-lane-effect', 'commit-lane-receipt'],
  );
  assert.equal(report.pair.status, 'absent', 'the setup ended its own pair before the failed publication');

  // The committed marker is preserved and reported; nothing is erased or published.
  const markers = freshMarkers(ws);
  assert.equal(markers.length, 1);
  assert.equal(read(ws, IDEA), `${owner}${markers[0]}\n`);
  assert.equal(read(ws, TASKS), tasks);
  assert.equal(glyphOf(read(ws, TASKS), T1), '~');
  assert.deepEqual(runnerRequests(fixture), requests, 'no runner request');
  assert.deepEqual(tree(store), {});

  // No retry from the same handoff: its basis no longer matches the preserved lane.
  const preserved = tree(ws);
  expectMissingProof(await call(fixture, freshClaimArgs(ws, handoff.manifest), driver), 'current-target', IDEA, 'retry after a partial setup');
  assert.deepEqual(tree(ws), preserved, 'the refusal erases and appends nothing');
});

/**
 * Answer one Assessment challenge directly with a valid bound action `none`,
 * which stops at authorization without dispatch authority or a lane event.
 * @param {any} waiting @param {string} summary
 */
function answerNone(waiting, summary) {
  const temporary = `${waiting.response}.fixture`;
  writeJson(temporary, {
    version: 1,
    type: 'challenge-response',
    challengeIdentity: waiting.challengeIdentity,
    kind: 'assessment',
    assessment: {
      evidenceHash: readJson(waiting.challenge).inspection.evidenceHash,
      intent: 'unchanged',
      action: 'none',
      materialInputs: { targets: [], operations: [], checks: [] },
      equivalence: 'none',
      retention: 'transient',
      summary,
    },
  });
  fs.renameSync(temporary, waiting.response);
}

/**
 * One run that must end before its runner reaches any challenge. A run that
 * reaches one fails the case at once and is stopped, instead of waiting for an
 * answer that never comes.
 * @param {ReturnType<typeof makeFixture>} fixture @param {string} driver @param {string} request @param {string} dir @param {string} label
 * @returns {Promise<Exit & {json:any}>}
 */
async function runWithoutChallenge(fixture, driver, request, dir, label) {
  const runner = start(fixture, ['run', '--request', request, '--dir', dir], driver);
  const ended = { /** @type {Exit|null} */ result: null };
  runner.exit.then((result) => { ended.result = result; }, (error) => { ended.result = { code: null, stdout: '', stderr: String(error) }; });
  while (ended.result === null) {
    let status = null;
    try {
      status = readJson(path.join(dir, 'status.json'));
    } catch {
      // No run status yet, or none at all.
    }
    if (status?.state === 'waiting') {
      runner.child.kill();
      await runner.exit;
      assert.fail(`${label}: the runner started and waits at challenge ${status.n} (${status.kind})`);
    }
    await sleep(25);
  }
  const result = /** @type {Exit} */ (ended.result);
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    // A started run prints event lines, not one report.
  }
  return { ...result, json };
}

test('terminal-work fresh request: after a disposed zero-event stop, a copy of the request elsewhere, with or without its claim files, never starts, and the original stays consumed', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const handoff = await freshHandoff(fixture, driver, 'fresh-copied');
  const ws = handoff.root;
  const store = path.join(fixture.tmp, STORE);
  const claimed = expectExit(await call(fixture, freshClaimArgs(ws, handoff.manifest), driver), 0, 'fresh claim');
  const claimDir = path.dirname(claimed.runnerRequest);
  // Copies taken right after the claim: the request alone, and the request with every claim file beside it.
  const claimFiles = fs.readdirSync(claimDir).sort();
  assert.deepEqual(claimFiles, ['runner-request.json', 'setup-report.json', 'supervisor.json']);
  /** @type {[string, string][]} */
  const copies = [['the request alone', path.join(fixture.io, 'copy-alone')], ['the request with its claim files', path.join(fixture.io, 'copy-claim-files')]];
  for (const [label, directory] of copies) {
    fs.mkdirSync(directory);
    for (const name of label === 'the request alone' ? ['runner-request.json'] : claimFiles) {
      fs.copyFileSync(path.join(claimDir, name), path.join(directory, name));
    }
  }

  // The original request starts once, then stops at authorization with no lane event,
  // and its own owner disposes of its pair: the lane bytes still equal the setup poststate.
  const afterClaim = tree(ws);
  const dir = path.join(fixture.io, 'original-run');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'original assessment');
  answerNone(first, 'terminal-work fresh request: a zero-event stop');
  const done = await runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason, status.terminalDisposition?.outcome], ['hard-stop', 'no-action', 'disposed']);
  assert.deepEqual(tree(ws), afterClaim, 'zero events: no workspace byte changed after the claim');
  assert.deepEqual(tree(store), {}, 'the fresh owner removed its own pair');
  const usedFile = path.join(claimDir, 'runner-request-used.json');
  assert.equal(fs.existsSync(usedFile), true, 'the original location is consumed');

  // Neither copy starts: no run directory, no use record of its own, no pair, and no workspace write.
  /** @type {Record<string, string>} */
  const mismatch = { 'the request alone': 'no-issuing-claim-report', 'the request with its claim files': 'issued-elsewhere' };
  for (const [label, directory] of copies) {
    const runDir = path.join(fixture.io, `${path.basename(directory)}-run`);
    const result = await runWithoutChallenge(fixture, driver, path.join(directory, 'runner-request.json'), runDir, label);
    const refused = expectExit(result, 2, label);
    assert.match(refused.refused, /runs only from the claim directory that issued it/, label);
    assert.equal(refused.mismatch, mismatch[label], label);
    assert.equal(fs.existsSync(runDir), false, `${label}: no run directory`);
    assert.equal(fs.existsSync(path.join(directory, 'runner-request-used.json')), false, `${label}: no use record of its own`);
    assert.deepEqual(tree(store), {}, `${label}: no ownership pair`);
    assert.deepEqual(tree(ws), afterClaim, `${label}: no workspace byte changed`);
  }

  // The original location stays consumed, and nothing claims again.
  const again = expectExit(await runWithoutChallenge(fixture, driver, claimed.runnerRequest, path.join(fixture.io, 'original-again'), 'the original again'), 2, 'the original again');
  assert.match(again.refused, /already used/);
  assert.equal(again.requestUsed, usedFile);
  assert.equal(freshMarkers(ws).length, 1, 'no new claim');
  assert.deepEqual(tree(store), {});
});

test('terminal-work fresh request: a spec-only or plan-only change between claim and run refuses at the real run entry before any ownership or Assessment', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  const driver = path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
  const store = path.join(fixture.tmp, STORE);
  /** @type {[string, string][]} */
  const cases = [['fresh-spec-change', SPEC], ['fresh-plan-change', PLAN]];
  const handoffs = await Promise.all(cases.map(([label]) => freshHandoff(fixture, driver, label)));
  for (const [index, [label, relative]] of cases.entries()) {
    const ws = handoffs[index].root;
    const claimed = expectExit(await call(fixture, freshClaimArgs(ws, handoffs[index].manifest), driver), 0, `${label} claim`);
    assert.equal(freshMarkers(ws).length, 1, `${label}: one claim marker`);
    // A well-formed definition change after the claim; every lane byte stays the setup poststate.
    fs.appendFileSync(path.join(ws, ...relative.split('/')), '\nA changed obligation after the claim.\n');
    const lane = { tasks: read(ws, TASKS), owner: read(ws, IDEA), snapshot: read(ws, SNAPSHOT) };
    const dir = path.join(fixture.io, `${label}-run`);
    const done = await runWithoutChallenge(fixture, driver, claimed.runnerRequest, dir, label);
    assert.equal(done.code, 1, `${label}: ${done.stdout}${done.stderr}`);
    const status = readJson(path.join(dir, 'status.json'));
    assert.deepEqual([status.outcome, status.reason, status.challenges], ['hard-stop', 'request-invalid', 0], label);
    assert.equal(readJson(status.result).detail,
      `HostAdapterRunnerRequest.priorTerminal current requirements differ from the admission-bound definition: ${relative}`, label);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['result.json', 'status.json'], `${label}: no challenge, packet, or evidence`);
    assert.equal(expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 0, `${label} pair`).status, 'absent');
    assert.deepEqual(tree(store), {}, `${label}: no ownership pair`);
    assert.deepEqual({ tasks: read(ws, TASKS), owner: read(ws, IDEA), snapshot: read(ws, SNAPSHOT) }, lane, `${label}: the claim marker and lane bytes are preserved`);
    assert.equal(freshMarkers(ws).length, 1, `${label}: the claim marker is preserved`);
    // The refused start stays consumed.
    const again = expectExit(await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', path.join(fixture.io, `${label}-again`)], driver), 2, `${label} rerun`);
    assert.match(again.refused, /already used/, label);
  }
});

// --- Feature 094 T004: installed terminal-work acceptance --------------------
//
// Every case below runs the driver of a core release built from source into a
// disposable fixture, so the driver, runner, adapter, reducer, lane, skills, and
// cookbook it exercises are the co-versioned installed files. Terminal handoffs
// come only from the original owner's own run; no helper writes a fence,
// manifest, disposition, or control file, and no case calls the runtime around
// the installed driver. The few response files written directly below stand in
// for the coordinator's own answers and are fixture data.

// The installed files a terminal-work journey depends on, by their `.github` path.
const INSTALLED_TERMINAL_WORK_FILES = [
  'skills/dude-engine/lib/lightweight-work-postimage.mjs',
  'skills/dude-lightweight-execution/SKILL.md',
  'skills/dude-lightweight-execution/board.mjs',
  'skills/dude-work-intake/SKILL.md',
  'skills/dude-work/COOKBOOK.md',
  'skills/dude-work/SKILL.md',
  'skills/dude-work/driver.mjs',
  'skills/dude-work/host-adapter-runner.mjs',
  'skills/dude-work/host-adapter.mjs',
  'skills/dude-work/recovery.mjs',
  'skills/dude-work/specialist-attestation.mjs',
];

/**
 * Build one core release into the fixture workspace and return its installed
 * driver after proving the journey's files are the co-versioned sources and the
 * release carries no test, fixture, or inverse helper.
 * @param {ReturnType<typeof makeFixture>} fixture
 */
function installedDriver(fixture) {
  const built = buildRelease({ repoRoot: REPO, outDir: fixture.ws });
  for (const relative of INSTALLED_TERMINAL_WORK_FILES) {
    assert.ok(built.files.includes(`.github/${relative}`), `the release ships ${relative}`);
    assert.deepEqual(
      fs.readFileSync(path.join(fixture.ws, '.github', ...relative.split('/'))),
      fs.readFileSync(path.join(REPO, 'src', ...relative.split('/'))),
      `${relative} is the co-versioned source`,
    );
  }
  assert.deepEqual(
    built.files.filter((file) => /\.test\.mjs$|(?:^|\/)fixtures\/|model-view-test-helpers|terminal-[a-z]+\.json$/.test(file)),
    [],
    'the release ships no test, fixture, inverse helper, or terminal evidence',
  );
  return path.join(fixture.ws, '.github', 'skills', 'dude-work', 'driver.mjs');
}

/**
 * Write one response file directly, as the coordinator's own answer, through a
 * sibling file and one rename like the driver's publication.
 * @param {any} waiting @param {string} field @param {unknown} value
 */
function answerDirectly(waiting, field, value) {
  const temporary = `${waiting.response}.fixture`;
  writeJson(temporary, {
    version: 1, type: 'challenge-response', challengeIdentity: waiting.challengeIdentity, kind: waiting.kind, [field]: value,
  });
  fs.renameSync(temporary, waiting.response);
}

/**
 * A complete fixture learning review for one waiting `learning-review`
 * challenge, bound to the exact failed-approach set its accepted state holds.
 * The driver has no learning-review maker; this stands in for the
 * coordinator's own reviewed answer.
 * @param {any} waiting @param {'selected-alternative'|'no-progress'} outcome
 */
function fixtureLearningReview(waiting, outcome) {
  const challenge = readJson(waiting.challenge);
  const state = JSON.parse(Buffer.from(challenge.stateBase64, 'base64').toString('utf8'));
  assert.equal(state.learningGovernance?.phase, 'required', 'the review answers required learning');
  const { approachBasisIdentities: failedBases, setIdentity } = state.learningGovernance.failedApproachSet;
  /** @param {string} label */
  const identity = (label) => sha256(`terminal-work installed learning review: ${label}`);
  /** @param {string} label */
  const approachBasis = (label) => ({
    version: 1,
    target: challenge.target,
    action: 'retry-task',
    materialInputs: { targets: [`src/${label}.txt`], operations: ['retry-task'], checks: ['verification'] },
    mechanismIdentities: [identity(`mechanism:${label}`)],
    assumptionIdentities: [],
    evidenceAcquisitionIdentities: [],
    validationPlanIdentities: [],
  });
  const crediblePlan = approachBasis('alternative');
  const credibleBasis = sha256(canonicalJson(crediblePlan));
  const checkBody = { definitionIdentity: identity('check-definition'), evidenceIdentities: [identity('check-evidence')] };
  const credibleBody = {
    version: 2,
    disposition: 'credible-material',
    approachBasisIdentity: credibleBasis,
    failedApproachSetIdentity: setIdentity,
    materialDifferences: failedBases.map((/** @type {string} */ failed) => ({
      failedApproachBasisIdentity: failed,
      changedDimensions: ['material-input', 'mechanism'],
      evidenceIdentities: [identity(`difference:${failed}`)],
    })),
    discriminatingCheck: { identity: sha256(canonicalJson(checkBody)), ...checkBody },
    semanticAssessmentIdentity: identity('assessment:alternative'),
  };
  const credible = {
    ...credibleBody, alternativeIdentity: sha256(canonicalJson(credibleBody)), approachBasis: crediblePlan,
  };
  const repeatedPlan = approachBasis('repetition');
  const repeatedBody = {
    version: 2,
    disposition: 'not-materially-different',
    approachBasisIdentity: sha256(canonicalJson(repeatedPlan)),
    failedApproachSetIdentity: setIdentity,
    comparisons: failedBases.map((/** @type {string} */ failed, /** @type {number} */ index) => ({
      failedApproachBasisIdentity: failed,
      outcome: index === 0 ? 'same' : 'different',
      ...(index === 0 ? {} : { changedDimensions: ['mechanism'] }),
      evidenceIdentities: [identity(`comparison:${failed}`)],
    })),
    semanticAssessmentIdentity: identity('assessment:repetition'),
    reason: 'disguised-repetition',
  };
  const repeated = {
    ...repeatedBody, alternativeIdentity: sha256(canonicalJson(repeatedBody)), approachBasis: repeatedPlan,
  };
  const alternatives = (outcome === 'selected-alternative' ? [credible, repeated] : [repeated])
    .sort((left, right) => Buffer.compare(Buffer.from(left.alternativeIdentity), Buffer.from(right.alternativeIdentity)));
  const findingBody = {
    version: 1,
    statement: `The repeated rejection needs the ${outcome} learning branch.`,
    evidenceIdentities: [identity(`finding:${outcome}`)],
    assumptionIdentities: [],
  };
  answerDirectly(waiting, 'review', {
    version: 2,
    target: challenge.target,
    assumptionIdentities: [identity(`assumption:${outcome}`)],
    findings: [{ ...findingBody, findingIdentity: sha256(canonicalJson(findingBody)) }],
    alternatives,
    outcome,
    ...(outcome === 'selected-alternative' ? { selectedAlternativeIdentity: credible.alternativeIdentity } : {}),
  });
}

/**
 * One ordinary run in its own workspace whose two attempts are rejected with
 * the same finding, so it proves a repeat, projects required learning, and
 * waits at its learning review.
 * @param {ReturnType<typeof makeFixture>} fixture @param {string} driver @param {string} label
 */
async function repeatedRejection(fixture, driver, label) {
  const ws = path.join(fixture.root, label);
  seed(ws);
  const root = fs.realpathSync(ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', root, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, `${label} claim`);
  const dir = path.join(fixture.io, label);
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  for (const n of [1, 3]) {
    const assessment = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n, `${label} assessment ${n}`);
    assert.equal(assessment.kind, 'assessment', label);
    expectExit(await call(fixture, [
      'assess', '--root', root, '--challenge', assessment.challenge, '--input', writeJson(path.join(fixture.io, `${label}-assessment-${n}.json`), {
        action: 'address-test',
        targets: ['src/demo.txt'],
        summary: `Change the demo product file (challenge ${n}).`,
        intent: 'unchanged',
        equivalence: n === 1 ? 'none' : 'distinct',
        retention: 'transient',
      }),
    ], driver), 0, `${label} assess ${n}`);
    const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n + 1, `${label} specialist pair ${n + 1}`);
    const baseline = path.join(fixture.io, `${label}-baseline-${n + 1}.json`);
    expectExit(await call(fixture, ['snapshot', '--root', root, '--out', baseline], driver), 0, `${label} snapshot ${n + 1}`);
    write(root, 'src/demo.txt', `after ${n}\n`);
    const changed = path.join(fixture.io, `${label}-changed-${n + 1}.json`);
    expectExit(await call(fixture, ['diff', '--root', root, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed], driver), 0, `${label} diff ${n + 1}`);
    expectExit(await call(fixture, [
      'respond', '--root', root, '--challenge', pair.challenge,
      '--tester', writeJson(path.join(fixture.io, `${label}-tester-${n + 1}.json`), { checks: [check('repeated finding')] }),
      '--reviewer', writeJson(path.join(fixture.io, `${label}-reviewer-${n + 1}.json`), { verdict: 'rejected', findings: [finding('repeated')] }),
      '--changed', changed,
    ], driver), 0, `${label} respond ${n + 1}`);
  }
  const learning = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 5, `${label} learning review`);
  assert.equal(learning.kind, 'learning-review', `${label}: the repeat requires learning`);
  return { label, root, dir, runner, learning };
}

/**
 * The fixture coordinator's approved redefinition returns T1 to pending, as an
 * explicit definition would; lane history and every retained capture stay as recorded.
 * @param {string} root @param {string} label
 */
function approvedReturnToPending(root, label) {
  const claimedTasks = read(root, TASKS);
  const pendingTasks = claimedTasks.replace(`- [~] ${T1} `, `- [ ] ${T1} `);
  assert.notEqual(pendingTasks, claimedTasks, `${label}: T1 was in progress`);
  write(root, TASKS, pendingTasks);
  upsertTaskStateEntry(root, TASKS, glyphsOf(parseVisibleTasks(Buffer.from(pendingTasks), { path: TASKS }).parsed));
  fs.appendFileSync(path.join(root, ...IDEA.split('/')), `- 2026-11-03T00:00:00Z - define: Fixture approved redefinition returned ${T1} to pending.\n`);
}

test('terminal-work installed: the release-built driver produces an eligible handoff and refuses a run whose dispatch authority escaped', {
  timeout: 240_000,
}, async (t) => {
  const fixture = makeFixture(t);
  const driver = installedDriver(fixture);
  const store = path.join(fixture.tmp, STORE);

  // Eligible: a stop at authorization with only built-in reads behind it.
  const eligible = await terminalProducerRun(fixture, driver, 'installed-eligible');
  assertOriginalProducerStop(eligible);
  assert.deepEqual([eligible.status.terminalDisposition.outcome, eligible.status.cleanup, eligible.status.orphan], ['disposed', 'cleared', false]);
  assert.deepEqual(eligible.present, [], 'the original owner removed its own exact pair');
  assert.equal(eligible.status.terminalEvidence, path.join(eligible.dir, 'terminal-evidence.json'));
  validateTerminalEvidenceManifestV1(readJson(eligible.status.terminalEvidence));

  // Refused: an authorized attempt reached its specialist pair before the stop.
  const ws = path.join(fixture.root, 'installed-dispatched');
  seed(ws);
  const root = fs.realpathSync(ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', root, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, 'dispatched claim');
  const dir = path.join(fixture.io, 'installed-dispatched');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'dispatched assessment');
  expectExit(await call(fixture, ['assess', '--root', root, '--challenge', first.challenge, '--input', writeJson(path.join(fixture.io, 'dispatched-assessment.json'), {
    action: 'execute-task', targets: ['src/demo.txt'], summary: 'Change the demo product file.',
    intent: 'unchanged', equivalence: 'none', retention: 'transient',
  })], driver), 0, 'dispatched assess');
  const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 2, 'dispatched specialist pair');
  const baseline = path.join(fixture.io, 'dispatched-baseline.json');
  expectExit(await call(fixture, ['snapshot', '--root', root, '--out', baseline], driver), 0, 'dispatched snapshot');
  write(root, 'src/demo.txt', 'dispatched\n');
  const changed = path.join(fixture.io, 'dispatched-changed.json');
  expectExit(await call(fixture, ['diff', '--root', root, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed], driver), 0, 'dispatched diff');
  expectExit(await call(fixture, [
    'respond', '--root', root, '--challenge', pair.challenge,
    '--tester', writeJson(path.join(fixture.io, 'dispatched-tester.json'), { checks: [check('dispatched', 'failed')] }),
    '--reviewer', writeJson(path.join(fixture.io, 'dispatched-reviewer.json'), { verdict: 'accepted', findings: [] }),
    '--changed', changed,
  ], driver), 0, 'dispatched respond');
  const recovery = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 3, 'dispatched recovery assessment');
  answerNone(recovery, 'terminal-work installed: a stop after dispatch');
  const done = await runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason], ['hard-stop', 'no-action']);
  const disposition = status.terminalDisposition;
  assert.deepEqual([disposition.outcome, disposition.missingProof.kind, disposition.missingProof.subject, disposition.removal],
    ['refused', 'effect-settlement', 'authorize-attempt', { checkpoint: 'retained', claim: 'retained' }]);
  assert.equal(Object.hasOwn(status, 'cleanup'), false, 'no removal was attempted');
  assert.equal(status.terminalEvidence, path.join(dir, 'terminal-evidence.json'), 'the refused owner still retained its evidence');
  const { dispositionIdentity, ...record } = disposition;
  assert.deepEqual(readJson(path.join(dir, 'terminal-disposition.json')), record);
  assert.equal(dispositionIdentity, sha256(canonicalJson(record)));
  const live = expectExit(await call(fixture, ['ownership', '--root', root, '--spec', SPEC, '--task', T1], driver), 1, 'the retained pair');
  assert.equal(live.status, 'loaded');

  // Its handoff admits nothing: the claim repeats the owner's one missing proof and writes nothing.
  const before = tree(root);
  const requests = runnerRequests(fixture);
  expectMissingProof(await call(fixture, freshClaimArgs(root, status.terminalEvidence), driver), 'effect-settlement', 'authorize-attempt', 'escaped dispatch authority');
  assert.deepEqual(tree(root), before, 'the refusal writes nothing to the workspace');
  assert.deepEqual(runnerRequests(fixture), requests, 'and publishes no runner request');
  t.diagnostic(canonicalJson({ installedRefusal: disposition.missingProof }));

  // Test-owned disposal of this fixture's own bounded pair after its runner exited.
  for (const kind of ['claim', 'checkpoint']) fs.rmSync(path.join(store, `${live.checkpointKey}.${kind}`));
});

test('terminal-work installed: a separately admitted request claims from the handoff, starts once, settles through Assessment, specialists, and receipt close, and leaves no ownership', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  const driver = installedDriver(fixture);
  const store = path.join(fixture.tmp, STORE);
  const handoff = await freshHandoff(fixture, driver, 'installed-journey');
  const ws = handoff.root;
  const evidence = tree(handoff.dir);
  const owner = read(ws, IDEA);
  const tasks = read(ws, TASKS);

  const conflict = await call(fixture, freshClaimArgs(ws, handoff.manifest, { options: ['--retained-evidence', path.join(handoff.dir, 'retained-evidence.json')] }), driver);
  assert.equal(conflict.code, 64, `the handoff supplies its own captures: ${conflict.stderr}`);
  assert.match(conflict.stderr, /--terminal-evidence excludes --state and --retained-evidence/);

  const claimed = expectExit(await call(fixture, freshClaimArgs(ws, handoff.manifest), driver), 0, 'installed fresh claim');
  const report = readJson(claimed.report);
  assert.deepEqual([report.admission.outcome, report.admission.learningGate], ['eligible', 'assessment']);
  const [marker] = freshMarkers(ws);
  assert.equal(read(ws, IDEA), `${owner}${marker}\n`, 'one appended marker');
  assert.equal(read(ws, TASKS), tasks, 'the task stays [~] with no event');
  const request = readJson(claimed.runnerRequest);
  assert.equal(canonicalJson(request.state), canonicalJson(freshState(SHIP_POLICY)), 'fresh accounting');
  assert.deepEqual(request.retainedEvidence, readJson(path.join(handoff.dir, 'retained-evidence.json')));
  assert.equal(report.terminalRequest.path, fs.realpathSync(claimed.runnerRequest));

  // Replaying the consumed handoff is refused before any write.
  const afterClaim = tree(ws);
  expectMissingProof(await call(fixture, freshClaimArgs(ws, handoff.manifest), driver), 'current-target', IDEA, 'handoff replay');
  assert.deepEqual(tree(ws), afterClaim);

  // One real start, then the ordinary journey.
  const dir = path.join(fixture.io, 'installed-fresh-run');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  const first = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'installed fresh assessment');
  assert.equal(first.kind, 'assessment');
  const used = readJson(path.join(path.dirname(claimed.runnerRequest), 'runner-request-used.json'));
  assert.deepEqual([used.kind, used.request, used.freshAdmissionIdentity], ['runner-request-used', 'runner-request.json', report.admission.admissionIdentity]);
  expectExit(await call(fixture, ['assess', '--root', ws, '--challenge', first.challenge, '--input', writeJson(path.join(fixture.io, 'installed-fresh-assessment.json'), {
    action: 'execute-task', targets: ['src/demo.txt'], summary: 'Change the demo product file.',
    intent: 'unchanged', equivalence: 'none', retention: 'transient',
  })], driver), 0, 'installed fresh assess');
  const second = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 2, 'installed fresh pair');
  assert.equal(second.kind, 'specialist-pair');
  const baseline = path.join(fixture.io, 'installed-fresh-baseline.json');
  expectExit(await call(fixture, ['snapshot', '--root', ws, '--out', baseline], driver), 0, 'installed fresh snapshot');
  write(ws, 'src/demo.txt', 'after\n');
  const changed = path.join(fixture.io, 'installed-fresh-changed.json');
  expectExit(await call(fixture, ['diff', '--root', ws, '--baseline', baseline, '--challenge', second.challenge, '--out', changed], driver), 0, 'installed fresh diff');
  expectExit(await call(fixture, [
    'respond', '--root', ws, '--challenge', second.challenge,
    '--tester', writeJson(path.join(fixture.io, 'installed-fresh-tester.json'), { checks: [check('installed fresh request')] }),
    '--reviewer', writeJson(path.join(fixture.io, 'installed-fresh-reviewer.json'), { verdict: 'accepted', findings: [] }),
    '--changed', changed,
  ], driver), 0, 'installed fresh respond');
  const done = await runner.exit;
  assert.equal(done.code, 0, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason], ['ended', 'task-settled']);
  const result = readJson(status.result);
  assert.ok(result.steps.some((/** @type {any} */ row) => row.step.endsWith('commit-lane-receipt') && row.reason === 'lane-receipt-committed'),
    'the completion receipt is committed');
  assert.equal(glyphOf(read(ws, TASKS), T1), 'x');
  assert.equal(readJson(path.join(ws, SNAPSHOT))[TASKS].glyphs[T1], 'x');
  const occurrences = approachEvents(ws);
  assert.deepEqual(occurrences.map((event) => event.occurrence.disposition), ['accepted']);
  assert.equal(read(ws, IDEA), `${owner}${marker}\n`, 'the runner adds no owner line; close is the coordinator\'s');
  const settled = readJson(status.acceptedState);
  assert.deepEqual([settled.overallUsed, settled.completed.length, settled.pending.length], [1, 1, 0], 'only the new invocation\'s accounting');

  // Final ownership: no pair, and the request can never start again.
  assert.equal(expectExit(await call(fixture, ['ownership', '--root', ws, '--spec', SPEC, '--task', T1], driver), 0, 'final ownership').status, 'absent');
  assert.deepEqual(tree(store), {});
  const again = expectExit(await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', path.join(fixture.io, 'installed-again')], driver), 2, 'second start');
  assert.match(again.refused, /already used/);
  assert.deepEqual(tree(handoff.dir), evidence, 'the original handoff stays byte-identical evidence');
  t.diagnostic(canonicalJson({ installedJourney: { learningGate: report.admission.learningGate, challenges: status.challenges } }));
});

test('terminal-work installed: a retained repeat is admitted through required learning before any Assessment, and later or resolved learning is refused', {
  timeout: 600_000,
}, async (t) => {
  const fixture = makeFixture(t);
  const driver = installedDriver(fixture);
  const store = path.join(fixture.tmp, STORE);
  const [required, later, resolved] = await Promise.all(
    ['installed-required', 'installed-later', 'installed-resolved'].map((label) => repeatedRejection(fixture, driver, label)),
  );

  // Each workspace ends its first run at or after learning without any dispatch afterwards.
  expectExit(await call(fixture, ['respond', '--root', required.root, '--challenge', required.learning.challenge, '--cancel'], driver), 0, 'required cancel');
  fixtureLearningReview(later.learning, 'selected-alternative');
  const alternative = await waitForStatus(later.dir, (status) => status.state === 'waiting' && status.n === 6, 'later alternative assessment');
  assert.equal(alternative.kind, 'assessment', 'the selected alternative waits for its Assessment');
  expectExit(await call(fixture, ['respond', '--root', later.root, '--challenge', alternative.challenge, '--cancel'], driver), 0, 'later cancel');
  fixtureLearningReview(resolved.learning, 'no-progress');
  /** @type {Record<string, string>} */
  const firstEnds = { 'installed-required': 'cancelled', 'installed-later': 'cancelled', 'installed-resolved': 'controlled-unresolved-end' };
  for (const run of [required, later, resolved]) {
    const done = await run.runner.exit;
    assert.equal(done.code, 0, `${run.label}: ${done.stderr}`);
    const status = readJson(path.join(run.dir, 'status.json'));
    assert.deepEqual([status.outcome, status.reason], ['ended', firstEnds[run.label]], run.label);
    assert.equal(expectExit(await call(fixture, ['ownership', '--root', run.root, '--spec', SPEC, '--task', T1], driver), 0, `${run.label} pair`).status, 'absent');
    approvedReturnToPending(run.root, run.label);
  }

  /**
   * Claim one workspace again with its first run's original captures.
   * @param {typeof required} run
   */
  const restart = async (run) => {
    const claimed = expectExit(await call(fixture, [
      'claim', '--root', run.root, '--spec', SPEC, '--task', T1, '--retained-evidence', path.join(run.dir, 'retained-evidence.json'), '--', ...SHIP_ARGS,
    ], driver), 0, `${run.label} restart claim`);
    return { claimed, dir: path.join(fixture.io, `${run.label}-restart`) };
  };

  // Required learning: the restarted owner restores it before any Assessment,
  // and an unusable review answer stops it with only built-in effects behind it.
  const requiredRestart = await restart(required);
  const requiredRunner = start(fixture, ['run', '--request', requiredRestart.claimed.runnerRequest, '--dir', requiredRestart.dir], driver);
  const restored = await waitForStatus(requiredRestart.dir, (status) => status.state === 'waiting' && status.n === 1, 'required restart');
  assert.equal(restored.kind, 'learning-review', 'learning precedes any Assessment');
  answerDirectly(restored, 'review', { invalid: 'terminal-work installed: an unusable review answer' });
  assert.equal((await requiredRunner.exit).code, 1);
  const requiredStop = readJson(path.join(requiredRestart.dir, 'status.json'));
  assert.deepEqual([requiredStop.outcome, requiredStop.reason, requiredStop.terminalDisposition?.outcome],
    ['hard-stop', 'challenge-response-invalid', 'disposed'], JSON.stringify(requiredStop.terminalDisposition));

  const owner = read(required.root, IDEA);
  const admitted = expectExit(await call(fixture, freshClaimArgs(required.root, requiredStop.terminalEvidence), driver), 0, 'required fresh claim');
  const admittedReport = readJson(admitted.report);
  assert.deepEqual([admittedReport.admission.outcome, admittedReport.admission.learningGate], ['eligible', 'resume-learning']);
  assert.equal(read(required.root, IDEA), `${owner}${freshMarkers(required.root)[0]}\n`);
  const freshDir = path.join(fixture.io, 'installed-required-fresh');
  const freshRunner = start(fixture, ['run', '--request', admitted.runnerRequest, '--dir', freshDir], driver);
  const freshLearning = await waitForStatus(freshDir, (status) => status.state === 'waiting' && status.n === 1, 'fresh learning review');
  assert.equal(freshLearning.kind, 'learning-review', 'the new invocation reaches required learning before any Assessment or authorization');
  const freshState0 = JSON.parse(Buffer.from(readJson(freshLearning.challenge).stateBase64, 'base64').toString('utf8'));
  assert.deepEqual([freshState0.overallUsed, freshState0.recoveryUsed, freshState0.pending, freshState0.completed, freshState0.learningGovernance.phase],
    [0, [], [], [], 'required'], 'fresh accounting with the restored required learning');
  expectExit(await call(fixture, ['respond', '--root', required.root, '--challenge', freshLearning.challenge, '--cancel'], driver), 0, 'fresh learning cancel');
  assert.equal((await freshRunner.exit).code, 0);
  assert.deepEqual([readJson(path.join(freshDir, 'status.json')).outcome, readJson(path.join(freshDir, 'status.json')).reason], ['ended', 'cancelled']);
  assert.deepEqual(tree(store), {}, 'no ownership pair remains');

  // Later and resolved learning: the restarted owner refuses to reopen it before
  // any challenge, disposes of its own pair, and its handoff admits no fresh request.
  for (const [run, label] of /** @type {[typeof later, string][]} */ ([[later, 'later'], [resolved, 'resolved']])) {
    const restarted = await restart(run);
    const done = await runWithoutChallenge(fixture, driver, restarted.claimed.runnerRequest, restarted.dir, `${label} restart`);
    assert.equal(done.code, 1, `${label} restart: ${done.stderr}`);
    const stop = readJson(path.join(restarted.dir, 'status.json'));
    assert.deepEqual([stop.outcome, stop.reason, stop.challenges, stop.terminalDisposition.outcome],
      ['hard-stop', 'governance-unresolved', 0, 'disposed'], `${label}: learning is never reopened`);
    const handoff = tree(restarted.dir);
    const before = tree(run.root);
    const refused = expectMissingProof(await call(fixture, freshClaimArgs(run.root, stop.terminalEvidence), driver), 'learning-authority', T1, `${label} learning`);
    assert.match(refused.missingProof.nextOwnerAction, /fresh admission never reopens it/);
    assert.deepEqual(tree(run.root), before, `${label}: refused before any marker or lane write`);
    assert.deepEqual(tree(restarted.dir), handoff, `${label}: the handoff stays unchanged evidence`);
  }
  assert.deepEqual(tree(store), {}, 'no ownership pair remains');
});

test('terminal-work installed: replay, a partial removal, a partial setup, and an uncertain start keep their facts and admit nothing again', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  const driver = installedDriver(fixture);
  const store = path.join(fixture.tmp, STORE);
  const preload = terminalFaultPreload(fixture);

  // A partial removal: the checkpoint went, the claim stayed, and the owner said so once.
  const partial = await terminalProducerRun(fixture, driver, 'installed-partial-removal', { preload, plan: { failRemove: 'claim' } });
  assertOriginalProducerStop(partial);
  assertProducerRefusal(partial, 'removal-absence', partial.pair.key, { checkpoint: 'removed', claim: 'retained' }, ['claim']);
  assert.equal(partial.status.cleanup, 'failed');
  const partialBefore = tree(partial.root);
  expectMissingProof(await call(fixture, freshClaimArgs(partial.root, partial.status.terminalEvidence), driver), 'removal-absence', partial.pair.key, 'partial removal');
  assert.deepEqual(tree(partial.root), partialBefore, 'partial removal: no marker or lane write');
  assert.deepEqual(fs.readFileSync(partial.pair.claim), partial.original.claim, 'the remaining claim is never removed or rewritten');
  assert.equal(fs.existsSync(partial.pair.checkpoint), false, 'the removed checkpoint is never restored');
  assert.equal(partial.trace.filter((entry) => entry === 'remove:checkpoint').length, 1, 'never retried');

  // A partially committed setup: the marker is kept and reported; the handoff is spent.
  const setup = await freshHandoff(fixture, driver, 'installed-partial-setup');
  const claimFaults = path.join(fixture.io, 'installed-claim-faults.cjs');
  fs.writeFileSync(claimFaults, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "if (process.env.DWT_CLAIM_FAIL && process.argv.includes('claim')) {",
    '  const real = fs.writeFileSync;',
    '  fs.writeFileSync = function writeFileSync(file, ...rest) {',
    "    if (typeof file === 'string' && path.basename(file).startsWith(`.${process.env.DWT_CLAIM_FAIL}.`)) {",
    "      throw Object.assign(new Error('EIO: fixture claim publication fault'), { code: 'EIO' });",
    '    }',
    '    return real.call(this, file, ...rest);',
    '  };',
    '}',
    '',
  ].join('\n'));
  const faulted = await start(fixture, freshClaimArgs(setup.root, setup.manifest), driver, {
    NODE_OPTIONS: `--require "${claimFaults.split(path.sep).join('/')}"`,
    DWT_CLAIM_FAIL: 'runner-request.json',
  }).exit;
  assert.equal(faulted.code, 5, `${faulted.stdout}${faulted.stderr}`);
  assert.equal(JSON.parse(faulted.stdout).stage, 'exception');
  assert.equal(freshMarkers(setup.root).length, 1, 'the committed marker stays');
  assert.equal(expectExit(await call(fixture, ['ownership', '--root', setup.root, '--spec', SPEC, '--task', T1], driver), 0, 'partial setup pair').status,
    'absent', 'the setup ended its own pair');
  const setupBefore = tree(setup.root);
  expectMissingProof(await call(fixture, freshClaimArgs(setup.root, setup.manifest), driver), 'current-target', IDEA, 'retry after a partial setup');
  assert.deepEqual(tree(setup.root), setupBefore, 'nothing is erased to retry');

  // An uncertain start: the request was consumed at its real start, so it never runs again.
  const uncertain = await freshHandoff(fixture, driver, 'installed-uncertain');
  const claimed = expectExit(await call(fixture, freshClaimArgs(uncertain.root, uncertain.manifest), driver), 0, 'uncertain claim');
  const dir = path.join(fixture.io, 'installed-uncertain-run');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === 1, 'uncertain assessment');
  const live = expectExit(await call(fixture, ['ownership', '--root', uncertain.root, '--spec', SPEC, '--task', T1], driver), 1, 'the new owner\'s pair');
  runner.child.kill();
  await runner.exit;
  const rerun = expectExit(await call(fixture, ['run', '--request', claimed.runnerRequest, '--dir', path.join(fixture.io, 'installed-uncertain-again')], driver), 2, 'rerun');
  assert.match(rerun.refused, /already used/);
  const uncertainBefore = tree(uncertain.root);
  expectMissingProof(await call(fixture, freshClaimArgs(uncertain.root, uncertain.manifest), driver), 'current-target', IDEA, 'replay after an uncertain start');
  assert.deepEqual(tree(uncertain.root), uncertainBefore);
  assert.equal(freshMarkers(uncertain.root).length, 1, 'no automatic new claim');
  assert.equal(expectExit(await call(fixture, ['ownership', '--root', uncertain.root, '--spec', SPEC, '--task', T1], driver), 1, 'the lost owner\'s pair').status, 'loaded',
    'a lost run leaves its pair to the existing manual rules');
  t.diagnostic(canonicalJson({ installedPartial: { removal: partial.status.terminalDisposition.removal, setupStage: JSON.parse(faulted.stdout).stage } }));

  // Test-owned disposal of this fixture's own bounded pairs after their runners exited.
  fs.rmSync(partial.pair.claim);
  for (const kind of ['claim', 'checkpoint']) fs.rmSync(path.join(store, `${live.checkpointKey}.${kind}`));
});

test('terminal-work installed: synthetic old Feature 089 facts stay refused with one missing proof and no recovery', {
  timeout: 300_000,
}, async (t) => {
  const fixture = makeFixture(t);
  const driver = installedDriver(fixture);
  const store = path.join(fixture.tmp, STORE);
  const ws = path.join(fixture.root, 'installed-089');
  seed(ws);
  const root = fs.realpathSync(ws);
  const claimed = expectExit(await call(fixture, ['claim', '--root', root, '--spec', SPEC, '--task', T1, '--', ...SHIP_ARGS], driver), 0, '089 claim');
  const dir = path.join(fixture.io, 'installed-089');
  const runner = start(fixture, ['run', '--request', claimed.runnerRequest, '--dir', dir], driver);
  // The reported shape: a later completion's capture overflows after dispatch, before it is retained.
  for (const [n, tester] of /** @type {[number, {checks: Record<string, unknown>[]}][]} */ ([[1, uniqueTester('first', 8, 1)], [3, uniqueTester('second', 9, -1)]])) {
    const assessment = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n, `089 assessment ${n}`);
    expectExit(await call(fixture, ['assess', '--root', root, '--challenge', assessment.challenge, '--input', writeJson(path.join(fixture.io, `089-assessment-${n}.json`), {
      action: 'address-test', targets: ['src/demo.txt'], summary: `Change the demo product file (challenge ${n}).`,
      intent: 'unchanged', equivalence: n === 1 ? 'none' : 'distinct', retention: 'transient',
    })], driver), 0, `089 assess ${n}`);
    const pair = await waitForStatus(dir, (status) => status.state === 'waiting' && status.n === n + 1, `089 pair ${n + 1}`);
    const baseline = path.join(fixture.io, `089-baseline-${n + 1}.json`);
    expectExit(await call(fixture, ['snapshot', '--root', root, '--out', baseline], driver), 0, `089 snapshot ${n + 1}`);
    write(root, 'src/demo.txt', `after ${n}\n`);
    const changed = path.join(fixture.io, `089-changed-${n + 1}.json`);
    expectExit(await call(fixture, ['diff', '--root', root, '--baseline', baseline, '--challenge', pair.challenge, '--out', changed], driver), 0, `089 diff ${n + 1}`);
    expectExit(await call(fixture, [
      'respond', '--root', root, '--challenge', pair.challenge,
      '--tester', writeJson(path.join(fixture.io, `089-tester-${n + 1}.json`), tester),
      '--reviewer', writeJson(path.join(fixture.io, `089-reviewer-${n + 1}.json`), { verdict: 'accepted', findings: [] }),
      '--changed', changed,
    ], driver), 0, `089 respond ${n + 1}`);
  }
  const done = await runner.exit;
  assert.equal(done.code, 1, done.stderr);
  const status = readJson(path.join(dir, 'status.json'));
  assert.deepEqual([status.outcome, status.reason], ['hard-stop', 'evidence-incomplete']);
  const stopped = JSON.parse(Buffer.from(readJson(status.result).stateBase64, 'base64').toString('utf8'));
  assert.equal(stopped.pending.length, 1, 'the later authorization stays pending, unsettled');
  assert.deepEqual([status.terminalDisposition.outcome, status.terminalDisposition.missingProof.kind, status.terminalDisposition.missingProof.subject],
    ['refused', 'effect-settlement', 'authorize-attempt'], 'escaped dispatch authority is never settled by disposition');
  const pairBefore = tree(store);
  assert.equal(Object.keys(pairBefore).length, 2, 'the original pair stays for the existing manual rules');

  // The same facts as the pre-handoff driver left them: a status, a result, and captures, but no fence.
  const legacy = path.join(fixture.io, 'installed-089-legacy');
  fs.mkdirSync(legacy);
  for (const name of ['result.json', 'retained-evidence.json']) fs.copyFileSync(path.join(dir, name), path.join(legacy, name));
  writeJson(path.join(legacy, 'status.json'), {
    version: 1, pid: 1, state: 'finished', outcome: 'hard-stop', reason: 'evidence-incomplete', orphan: true, cleanup: 'not-attempted',
  });

  const workspace = tree(root);
  const evidence = { run: tree(dir), legacy: tree(legacy) };
  const requests = runnerRequests(fixture);
  expectMissingProof(await call(fixture, freshClaimArgs(root, path.join(legacy, 'terminal-evidence.json')), driver), 'owner-fence', 'terminal-evidence.json', 'old run without a fence');
  expectMissingProof(await call(fixture, freshClaimArgs(root, status.terminalEvidence), driver), 'effect-settlement', 'authorize-attempt', 'old run after dispatch');
  for (const [label, options] of /** @type {[string, string[]][]} */ ([
    ['ordinary claim', []], ['claim with the old captures', ['--retained-evidence', path.join(legacy, 'retained-evidence.json')]],
  ])) {
    const refused = expectExit(await call(fixture, ['claim', '--root', root, '--spec', SPEC, '--task', T1, ...options, '--', ...SHIP_ARGS], driver), 2, label);
    assert.equal(refused.stage, 'task', `${label}: ${refused.detail}`);
    assert.equal(Object.hasOwn(refused, 'missingProof'), false, label);
  }
  assert.deepEqual(tree(root), workspace, 'no refusal writes to the workspace');
  assert.deepEqual(runnerRequests(fixture), requests, 'no runner request');
  assert.deepEqual({ run: tree(dir), legacy: tree(legacy) }, evidence, 'the old evidence stays unchanged');
  assert.deepEqual(tree(store), pairBefore, 'nothing is recovered or cleaned automatically');
  const probe = expectExit(await call(fixture, ['ownership', '--root', root, '--spec', SPEC, '--task', T1], driver), 1, 'the old pair');
  assert.equal(probe.status, 'loaded');
  t.diagnostic('Synthetic Feature 089-shaped facts only; this proves no recovery for the real old run.');

  // Test-owned disposal of this fixture's own bounded pair after its runner exited.
  for (const file of Object.keys(pairBefore)) fs.rmSync(path.join(store, file));
});

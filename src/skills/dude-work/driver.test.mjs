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
import { canonicalJson, sha256 } from './recovery.mjs';

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

/** @param {string} ws */
function approachEvents(ws) {
  return read(ws, TASKS).split('\n')
    .filter((line) => line.startsWith('- dude-run-event: '))
    .map((line) => JSON.parse(line.slice('- dude-run-event: '.length)))
    .filter((event) => event.type === 'approach-occurrence');
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

/** @param {string} label @param {'passed'|'failed'} outcome */
function check(label, outcome = 'passed') {
  return { definition: `fixture check: ${label}`, outcome, evidence: `fixture evidence: ${label} ${outcome}` };
}

/** @param {string} label */
function finding(label) {
  return {
    basis: {
      expectation: { kind: 'governing-rule', reference: `fixture rule: ${label}` },
      subjects: [T1],
      failureClass: 'review-rejection',
      checkDefinition: `fixture check: ${label}`,
    },
    observation: { kind: 'observed-evidence', evidence: `fixture observation: ${label}` },
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

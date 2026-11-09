// @ts-check
/**
 * Deterministic checks for the collaboration qualifier
 * (scripts/dude-a2a/qualify-collaboration.mjs): its version-1 and version-2
 * preview and the native branch's refusals before consent. Every fixture is a
 * disposable temporary folder holding a fake CLI file that nothing executes
 * and a fake SDK folder whose files would leave a marker if anything imported
 * them; credential and TLS paths name files that do not exist. These checks
 * establish the runner's refusals and its effect-free preview. They are not
 * native authorization, qualification, or host evidence, and they never start
 * the native branch past its terminal check.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { A2A_PROPOSAL_BYTES } from '../../src/extensions/dude/lib/a2a.mjs';
import { CONVERSATION_LIMITS } from '../../src/extensions/dude/lib/a2a-collaboration.mjs';
import {
  AFTER_VIEW_CONTROL, CANARIES, EXIT, PROGRESS_FIXTURES, QUALIFICATION_LIMITS, SIGN_IN_ENVIRONMENT, afterViewPrompt, fixtureManifest, main, nativeScope,
  previewQualification, readPlan, renderedCore,
} from './qualify-collaboration.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUALIFIER = path.join(HERE, 'qualify-collaboration.mjs');
const REPOSITORY = path.resolve(HERE, '..', '..');
const NOW = Date.parse('2026-11-01T10:00:00Z');
const WINDOWS = process.platform === 'win32';
const STAGE_IDS = ['prerequisite_qualification', 'exchange_and_main_progress', 'causal_capture', 'cancellation', 'teardown_and_retained_reread'];
const PROOF_IDS = ['native_permission', 'served_worker_observation', 'actual_sdk_use', 'ambient_feature_enforcement', 'owned_process_tree_cessation'];
const ANSWERED = ['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received', 'reply_validated', 'terminal', 'closed'];
const SECRET_IDS = ['credentials.a', 'credentials.b', 'credentials.worker', 'tls.a.certFile', 'tls.a.keyFile', 'tls.b.certFile', 'tls.b.keyFile'];
/**
 * What both native routes disclose before consent about the main relay they share, for a plan capturing `slug`: the step-scoped Dude
 * tool calls and the reads of each session's own workspace that this consent covers, which the relay approves itself, and everything
 * else still shown for a typed approve-once or refused.
 * @param {string} slug
 */
const mainRelayParts = (slug) => [
  'only for a tool call that session\'s own root model requested for its current step',
  'Under this consent the relay itself approves once each, without asking you, only that step\'s exact calls to Dude\'s own tools, from the '
    + 'step\'s admitted instruction until its turn ends',
  'in each proposal step, dude_a2a_propose with that session\'s a2a.json and profile',
  `in the advice exchange, dude_a2a_conversation begin_receive and read for B, and begin_ask (slug ${slug}, the fixed question, and an integer `
    + 'tentative number) and read for A',
  `in the cancellation exchange, the same for B, and begin_ask (slug ${slug}-cancel), cancel, and read for A.`,
  'Read and cancel need a well-formed operation ID, and the product checks which operation it names.',
  'In both exchanges and the capture step it also approves once each, the same way, a read that the session\'s own root model requests of '
    + 'its own workspace (a/w for A, b/w for B) or of anything below it while that step\'s turn is open; never a read of the other workspace '
    + 'or anywhere else, a subagent\'s read, or one after that turn ends.',
  'A call or read that managed policy marks as needing a person is rejected instead.',
  'The approval steps allow neither, and the capture step no Dude tool call.',
  'The report counts these approvals per session by tool and operation, and those reads as workspace.read.',
  'Every other request is shown for a freshly typed approve-once only when it is the pending progress file\'s exact edit, or in the capture '
    + 'step the exact inventory command, one fixed Get-FileHash of a staged ledger, the publisher command for this slug with staged files '
    + 'below a/t, new staging files below a/t, or a read of a/t itself or of anything below it.',
  'Everything else, including removing the staging folder, is rejected.',
  'Both dude a2a approve lines are still yours to type.',
  'Worker permissions stay denied by the product.',
];
/** @param {Buffer | string} value */
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** @param {string} prefix */
function tempDir(prefix) {
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  scratch.push(directory);
  return directory;
}

/**
 * A complete plan over disposable artifacts. `repo` stands in for this
 * repository's root, so containment checks are exercised without touching it.
 */
function fixture() {
  const base = tempDir('dude-qualify-');
  const repo = path.join(base, 'repository');
  const tools = path.join(base, 'tools');
  const sdk = path.join(tools, 'copilot-sdk');
  const marker = path.join(base, 'sdk-imported.marker');
  const cli = path.join(tools, WINDOWS ? 'copilot.exe' : 'copilot');
  const owners = path.join(base, 'owners');
  const fixtureParent = path.join(base, 'qualification');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(sdk, { recursive: true });
  fs.writeFileSync(cli, 'fixture launcher bytes; never executed\n', { mode: 0o755 });
  if (!WINDOWS) fs.chmodSync(cli, 0o755);
  for (const name of ['index.js', 'extension.js']) {
    // Importing either file would leave the marker; a preview must never do so.
    fs.writeFileSync(path.join(sdk, name), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(name)});\n`);
  }
  const plan = {
    version: 1,
    expiresAt: '2026-11-01T18:00:00Z',
    operator: 'Fixture Operator',
    coordinator: 'Fixture Coordinator',
    fixtureParent,
    artifacts: { cli, sdk, sdkAppliedAt: 'createSession' },
    models: { a: 'fixture-model-a', b: 'fixture-model-b', worker: 'fixture-model-worker' },
    credentials: {
      a: path.join(owners, 'a', 'copilot-token.txt'),
      b: path.join(owners, 'b', 'copilot-token.txt'),
      worker: path.join(owners, 'b', 'worker-token.txt'),
    },
    tls: {
      a: { certFile: path.join(owners, 'a', 'cert.pem'), keyFile: path.join(owners, 'a', 'key.pem') },
      b: { certFile: path.join(owners, 'b', 'cert.pem'), keyFile: path.join(owners, 'b', 'key.pem') },
    },
    transport: { port: 18_443, projectId: 'dude-number-poc' },
    progress: { a: 'Append one line to progress-a.md with the edit tool', b: 'Append one line to progress-b.md with the edit tool' },
    capture: { slug: 'delta' },
  };
  /** The same facts as a version-2 plan: an explicit runtime payload choice, the fixed progress fixtures, and the fixed observation. */
  const planV2 = {
    ...structuredClone(plan),
    version: 2,
    artifacts: { cli, runtimePayload: null, sdk, sdkAppliedAt: 'createSession' },
    progress: { a: { ...PROGRESS_FIXTURES.a }, b: { ...PROGRESS_FIXTURES.b } },
    observation: 'windows-etw',
  };
  return { base, repo, tools, sdk, marker, cli, owners, fixtureParent, plan, planV2 };
}
/** @typedef {ReturnType<typeof fixture>} Fixture */

/** @template T @param {T} value @returns {T} */
const clone = (value) => structuredClone(value);

/** @param {Fixture} f @param {unknown} plan @param {Record<string, unknown>} [extra] */
function preview(f, plan, extra = {}) {
  return previewQualification(plan, { now: NOW, repoRoot: f.repo, ...extra });
}

/** @param {any} report @param {string} id */
function checksFor(report, id) {
  return report.checks.filter((/** @type {any} */ entry) => entry.id === id);
}

/** @param {any} report @param {string} id */
function only(report, id) {
  const found = checksFor(report, id);
  assert.equal(found.length, 1, `exactly one ${id} check: ${JSON.stringify(report.checks)}`);
  return found[0];
}

/** Every file and folder below `root` with each file's digest. @param {string} root */
function tree(root) {
  /** @type {Record<string, string>} */
  const entries = {};
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full);
      if (entry.isDirectory()) {
        entries[relative] = 'folder';
        visit(full);
      } else {
        entries[relative] = sha256(fs.readFileSync(full));
      }
    }
  };
  visit(root);
  return entries;
}

/**
 * The invariants every preview report keeps, whatever the plan: no grant, no
 * pass, no observed proof source, and native stages that a preview never runs.
 * A version-1 report names the native branch as needing version 2; a
 * version-2 report names it implemented, with the strict qualification never
 * run natively.
 * @param {any} report
 */
function assertNothingQualified(report) {
  const v2 = report.version === 2;
  const branch = v2 ? ['native_run_not_started', 'implemented_unverified'] : ['native_branch_requires_v2', 'unavailable_for_plan_version'];
  assert.ok(['blocked', 'invalid'].includes(report.verdict), report.verdict);
  assert.ok(['preview', 'native_refused'].includes(report.mode), report.mode);
  assert.equal(report.permission.grant, 'missing');
  assert.deepEqual(report.stages.map((/** @type {any} */ stage) => stage.id), STAGE_IDS);
  for (const stage of report.stages) {
    assert.equal(stage.status, 'blocked', stage.id);
    assert.ok(stage.blockedBy.includes('native_permission'), `${stage.id} waits for a current human decision`);
    assert.equal(stage.blockedBy.at(-1), branch[0], `${stage.id} is never run by a preview`);
  }
  assert.deepEqual(report.proof.map((/** @type {any} */ entry) => [entry.id, entry.status]),
    PROOF_IDS.map((id) => [id, id === 'native_permission' ? 'missing' : 'unverified']));
  assert.deepEqual([report.nativeBranch.id, report.nativeBranch.status], branch);
  assert.match(report.effects, v2
    ? /^none: no SDK import or construction, runtime, session, model, listener, connection, credential or TLS read, observation, approval, write, kill, or deletion occurred$/
    : /^none: no SDK import or construction, runtime, session, model, listener, connection, credential or TLS read, approval, write, kill, or deletion occurred$/);
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /"status":"(?:pass|passed|qualified|success|granted|available|observed|verified)"/, 'no status is success-shaped');
  assert.doesNotMatch(text, /"(?:verdict|grant)":"(?:pass|passed|qualified|granted)"/);
}

test('importing the qualifier starts nothing, and its source has no route to a runtime, network, process, approval, or write', () => {
  const source = fs.readFileSync(QUALIFIER, 'utf8');
  const imports = [...source.matchAll(/^import [^;]*? from '([^']+)';$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(imports, [
    '../../src/extensions/dude/lib/a2a-collaboration.mjs',
    '../../src/extensions/dude/lib/a2a-peer-worker.mjs',
    '../../src/extensions/dude/lib/a2a-transcript.mjs',
    '../../src/extensions/dude/lib/a2a.mjs',
    '../../src/skills/dude-engine/lib/text.mjs',
    '../../src/skills/dude-engine/lib/workspace-paths.mjs',
    '../build-release.mjs',
    'node:crypto',
    'node:fs',
    'node:path',
    'node:url',
  ], 'product bounds, the release planner, and Node file reading only: no SDK, child process, network, TLS, or worker thread');
  assert.deepEqual([...source.matchAll(/\bimport\s*\(([^)]*)\)/g)].map((match) => match[1]), ['\'./native-collaboration.mjs\''],
    'the only dynamic import is the native branch, and the SDK is never imported here');
  const nativeImport = source.indexOf('import(\'./native-collaboration.mjs\')');
  assert.ok(source.lastIndexOf('if (!scoped.scope) {', nativeImport) > source.lastIndexOf('if (!native) {', nativeImport),
    'the native branch is imported only after --native and a complete, unexpired version-2 scope');
  assert.doesNotMatch(source, /\bfs\.(?:write|append|mkdir|mkdtemp|rm|rmdir|unlink|rename|copy|cp|symlink|link|chmod|chown|truncate|utimes)\w*\(/,
    'no file is written, moved, or deleted');
  assert.doesNotMatch(source, /\bprocess\.(?:kill|send|stdin)\b/, 'no process is signalled and no input is read here');
  for (const call of source.matchAll(/fs\.openSync\(([^)]*)\)/g)) assert.match(call[1], /, 'r'$/, 'files are opened read-only');
  // Version 3 binds the selected sign-in names' values into its scope, so the environment has exactly one reader: the default of
  // `signInEnvironment`, which reads only SIGN_IN_ENVIRONMENT. Versions 1 and 2 never read it (checked by behavior below).
  assert.deepEqual([...source.matchAll(/\bprocess\.env\b/g)].length, 1, 'no ambient credential or setting is read, except the selected version-3 names');
  assert.match(source, /signInEnvironment\(options\.environment \?\? process\.env\)/);
});

test('a complete version-1 plan previews as blocked: proof sources stay unverified, the grant stays missing, and no stage passes', () => {
  const f = fixture();
  const before = tree(f.base);
  const { report, exitCode } = /** @type {{report: any, exitCode: number}} */ (preview(f, f.plan));

  assert.equal(exitCode, EXIT.blocked);
  assert.equal(exitCode, 3);
  assert.equal(report.verdict, 'blocked');
  assertNothingQualified(report);
  assert.match(report.scopeSha256, /^[0-9a-f]{64}$/);
  assert.equal(report.checkedAt, '2026-11-01T10:00:00.000Z');
  assert.deepEqual([report.permission.requestedScope, report.permission.grant], ['complete', 'missing']);
  for (const entry of report.checks) assert.ok(['ok', 'not_inspected'].includes(entry.status), JSON.stringify(entry));
  for (const id of SECRET_IDS) {
    const secret = only(report, id);
    assert.equal(secret.status, 'not_inspected', id);
    assert.match(secret.detail, /never opens, reads, or hashes a secret file$/);
  }
  assert.equal(fs.existsSync(f.owners), false, 'the named secret files do not exist, and no check asked');
  for (const stage of report.stages) assert.equal(stage.blockedBy.includes('plan_invalid'), false, stage.id);
  assert.deepEqual(report.stages[0].blockedBy,
    ['native_permission', 'served_worker_observation', 'actual_sdk_use', 'ambient_feature_enforcement', 'native_branch_requires_v2']);
  assert.deepEqual(report.stages[4].blockedBy, ['native_permission', 'owned_process_tree_cessation', 'native_branch_requires_v2']);
  assert.match(report.proof.find((/** @type {any} */ entry) => entry.id === 'served_worker_observation').detail,
    /records its own public-SDK readiness[^.]*before its prompt[^.]*\. For a strict run, only fake SDKs have produced those records\.$/);
  assert.match(report.proof.find((/** @type {any} */ entry) => entry.id === 'actual_sdk_use').detail,
    /createSession silently falls back[^.]*joinSession ignores the setting/);
  assert.match(report.proof.find((/** @type {any} */ entry) => entry.id === 'actual_sdk_use').detail, /\. No native strict run has produced those records\.$/);
  assert.match(report.next.join('\n'), /Rewrite the plan as version 2[^.]*; a version-1 plan is preview-only\./);
  assert.equal(report.nativeBranch.detail, 'A version-1 plan can only be previewed. The native branch runs a version-2 plan for strict qualification, '
    + 'which adds the runtime payload, the fixed progress fixtures, and the fixed Windows observation. It also runs a version-3 plan for normal '
    + 'collaboration, which names each role\'s existing saved sign-in in place of credential files and adds the same progress fixtures, with no '
    + 'runtime payload or observation.', 'version 2 is the strict native route, not the only one, and the normal route needs neither strict artifact');

  const cliBytes = fs.readFileSync(f.cli);
  assert.deepEqual(report.artifacts.cli, { path: f.cli, bytes: cliBytes.length, sha256: sha256(cliBytes) });
  for (const [key, name] of [['index', 'index.js'], ['extension', 'extension.js']]) {
    const bytes = fs.readFileSync(path.join(f.sdk, name));
    assert.deepEqual(report.artifacts.sdk[key], { path: path.join(f.sdk, name), bytes: bytes.length, sha256: sha256(bytes) });
  }

  const effects = Object.fromEntries(report.plannedEffects.map((/** @type {any} */ entry) => [entry.scope, entry.detail]));
  assert.deepEqual(Object.keys(effects), ['preparation', 'native_startup', 'secret_reads', 'transport_and_approval', 'worker',
    'capture_and_progress', 'recording', 'observation_and_teardown']);
  assert.match(effects.preparation, /^Separately authorized, and not performed by this runner: create only /);
  assert.ok(effects.preparation.includes(path.join(f.fixtureParent, 'b', 'worker')));
  assert.match(effects.preparation, /A holds only 100; B holds 100 and 101, which A lacks/);
  assert.ok(effects.native_startup.includes(`${f.cli} (${cliBytes.length} bytes, sha256 ${sha256(cliBytes)})`));
  assert.ok(effects.native_startup.includes(`extensionSdkPath ${f.sdk} at createSession`));
  assert.match(effects.native_startup, /Models: A fixture-model-a, B fixture-model-b\. At most two exchanges/);
  for (const id of SECRET_IDS) {
    const [group, side, file] = id.split('.');
    const named = file ? f.plan.tls[/** @type {'a' | 'b'} */ (side)][/** @type {'certFile' | 'keyFile'} */ (file)]
      : f.plan.credentials[/** @type {'a' | 'b' | 'worker'} */ (side)];
    assert.ok(effects.secret_reads.includes(named), `${group} path ${id} is named for the decision`);
  }
  assert.match(effects.secret_reads, /this preview opened none of them\.$/);
  assert.match(effects.transport_and_approval, /^B alone listens on https:\/\/127\.0\.0\.1:18443\/ with mutual TLS/);
  assert.match(effects.transport_and_approval, /both profiles use contentBytes 32768;/);
  assert.ok(32_768 <= CONVERSATION_LIMITS.recordableContentBytes.receive, 'the planned profiles fit one journal on either side');
  assert.ok(effects.transport_and_approval.includes(`at most ${A2A_PROPOSAL_BYTES} bytes`));
  assert.match(effects.transport_and_approval, /never a summary, preview, rewritten copy, or annex/);
  assert.match(effects.transport_and_approval, /No approval is generated, prefilled, relayed from a log, or applied automatically\.$/);
  assert.match(effects.worker, /model fixture-model-worker[^;]*; only dude_a2a_evidence_inventory and dude_a2a_evidence_read/);
  assert.match(effects.worker, /worker at most 90000 ms, operation at most 120000 ms, cleanup wait 10000 ms/);
  assert.match(effects.capture_and_progress, /No new root prompt is sent while an operation is pending, and nothing given to A names B's records, B's maximum, or the expected number\./);
  assert.match(effects.capture_and_progress, /--number-advice for delta/);
  assert.ok(effects.recording.includes(`exactly its 8 records (${ANSWERED.join(', ')})`));
  assert.ok(effects.recording.includes(`go only to ${path.join(f.fixtureParent, 'proof')}, never into a journal`));
  assert.match(effects.observation_and_teardown, /^Operator Fixture Operator and coordinator Fixture Coordinator observe/);
  assert.match(effects.observation_and_teardown, /This runner kills no process and deletes no storage/);

  assert.deepEqual(tree(f.base), before, 'the preview created, changed, and removed nothing');
  assert.equal(fs.existsSync(f.fixtureParent), false, 'the fixture is named, not prepared');
  assert.equal(fs.existsSync(f.marker), false, 'the SDK was hashed, never imported');

  // The digest binds the exact scope: the same inputs repeat it, and any changed fact or artifact byte changes it.
  assert.equal(/** @type {any} */ (preview(f, f.plan)).report.scopeSha256, report.scopeSha256);
  const otherPort = clone(f.plan);
  otherPort.transport.port = 18_444;
  assert.notEqual(/** @type {any} */ (preview(f, otherPort)).report.scopeSha256, report.scopeSha256);
  fs.appendFileSync(f.cli, 'one more byte');
  assert.notEqual(/** @type {any} */ (preview(f, f.plan)).report.scopeSha256, report.scopeSha256);
  fs.writeFileSync(f.cli, cliBytes);
  fs.appendFileSync(path.join(f.sdk, 'extension.js'), '\n');
  assert.notEqual(/** @type {any} */ (preview(f, f.plan)).report.scopeSha256, report.scopeSha256);
});

test('missing, incomplete, or expired scope refuses and still grants nothing', () => {
  const f = fixture();
  /** @type {Array<[string, (plan: any) => unknown, string, Array<[string, string]>]>} */
  const cases = [
    ['no worker model', (plan) => { delete plan.models.worker; return plan; }, 'incomplete', [['models.worker', 'missing']]],
    ['no credentials at all', (plan) => { delete plan.credentials; return plan; }, 'incomplete',
      [['credentials.a', 'missing'], ['credentials.b', 'missing'], ['credentials.worker', 'missing']]],
    ['no operator', (plan) => { delete plan.operator; return plan; }, 'incomplete', [['operator', 'missing']]],
    ['an October grant window', (plan) => { plan.expiresAt = '2026-10-31T23:59:59Z'; return plan; }, 'expired', [['expiresAt', 'expired']]],
    ['expiring right now', (plan) => { plan.expiresAt = '2026-11-01T10:00:00Z'; return plan; }, 'expired', [['expiresAt', 'expired']]],
    ['an unparseable expiry', (plan) => { plan.expiresAt = 'tomorrow'; return plan; }, 'invalid', [['expiresAt', 'invalid']]],
    ['another plan version', (plan) => { plan.version = 4; return plan; }, 'invalid', [['version', 'invalid']]],
    ['credentials that are not an object', (plan) => { plan.credentials = 'token'; return plan; }, 'invalid', [['credentials', 'invalid']]],
    ['an array', () => [], 'invalid', [['plan', 'invalid']]],
    ['plain text', () => 'approved', 'invalid', [['plan', 'invalid']]],
  ];
  for (const [label, mutate, requestedScope, expected] of cases) {
    const { report, exitCode } = /** @type {{report: any, exitCode: number}} */ (preview(f, mutate(clone(f.plan))));
    assert.equal(exitCode, EXIT.invalid, label);
    assert.equal(report.verdict, 'invalid', label);
    assertNothingQualified(report);
    assert.equal(report.permission.requestedScope, requestedScope, label);
    assert.equal(report.scopeSha256, null, `${label}: an incomplete scope has no digest to approve`);
    assert.deepEqual(report.plannedEffects, [], `${label}: no effects are offered for a decision`);
    for (const stage of report.stages) assert.equal(stage.blockedBy[0], 'plan_invalid', `${label}: ${stage.id}`);
    for (const [id, status] of expected) assert.equal(only(report, id).status, status, `${label}: ${id}`);
    assert.match(report.next[0], /^Fix every check whose status is not ok or not_inspected/, label);
  }
  assert.match(only(preview(f, { ...clone(f.plan), expiresAt: '2026-10-31T23:59:59Z' }).report, 'expiresAt').detail,
    /an expired or earlier grant authorizes nothing/);
  assert.equal(fs.existsSync(f.marker), false);
});

test('SDK overrides that would silently fall back or be ignored refuse before anything could launch', () => {
  const f = fixture();
  const empty = path.join(f.tools, 'empty-sdk');
  const noExtension = path.join(f.tools, 'index-only-sdk');
  const noIndex = path.join(f.tools, 'extension-only-sdk');
  fs.mkdirSync(empty);
  fs.mkdirSync(noExtension);
  fs.mkdirSync(noIndex);
  fs.copyFileSync(path.join(f.sdk, 'index.js'), path.join(noExtension, 'index.js'));
  fs.copyFileSync(path.join(f.sdk, 'extension.js'), path.join(noIndex, 'extension.js'));
  fs.mkdirSync(path.join(empty, 'index.js'));
  fs.writeFileSync(path.join(empty, 'extension.js'), 'module.exports = {};\n');
  /** @type {Array<[string, (plan: any) => void, string, string, RegExp]>} */
  const cases = [
    ['a missing SDK folder', (plan) => { plan.artifacts.sdk = path.join(f.tools, 'absent-sdk'); }, 'artifacts.sdk', 'invalid',
      /does not exist: the runtime would silently use its bundled SDK instead/],
    ['a file, not a folder', (plan) => { plan.artifacts.sdk = f.cli; }, 'artifacts.sdk', 'invalid', /not a folder: the runtime would silently use its bundled SDK/],
    ['no extension.js', (plan) => { plan.artifacts.sdk = noExtension; }, 'artifacts.sdk', 'invalid', /has no extension\.js: the runtime would silently use its bundled SDK/],
    ['no index.js', (plan) => { plan.artifacts.sdk = noIndex; }, 'artifacts.sdk', 'invalid', /has no index\.js: the runtime would silently use its bundled SDK/],
    ['index.js as a folder', (plan) => { plan.artifacts.sdk = empty; }, 'artifacts.sdk', 'invalid', /index\.js must be a regular file, not a link or folder/],
    ['a relative path', (plan) => { plan.artifacts.sdk = 'copilot-sdk'; }, 'artifacts.sdk', 'invalid', /normalized absolute path/],
    ['an unnormalized path', (plan) => { plan.artifacts.sdk = `${f.sdk}${path.sep}`; }, 'artifacts.sdk', 'invalid', /normalized absolute path/],
    ['an override at join', (plan) => { plan.artifacts.sdkAppliedAt = 'joinSession'; }, 'artifacts.sdkAppliedAt', 'refused',
      /joinSession cannot override the SDK[^.]*would be silently ignored/],
    ['an override at resume', (plan) => { plan.artifacts.sdkAppliedAt = 'resumeSession'; }, 'artifacts.sdkAppliedAt', 'invalid', /must be "createSession"/],
    ['no SDK at all', (plan) => { delete plan.artifacts.sdk; }, 'artifacts.sdk', 'missing', /required; nothing is defaulted/],
  ];
  for (const [label, mutate, id, status, detail] of cases) {
    const plan = clone(f.plan);
    mutate(plan);
    const { report, exitCode } = /** @type {{report: any, exitCode: number}} */ (preview(f, plan));
    assert.equal(exitCode, EXIT.invalid, label);
    assertNothingQualified(report);
    assert.equal(only(report, id).status, status, label);
    assert.match(only(report, id).detail, detail, label);
    if (id === 'artifacts.sdk') assert.equal(report.artifacts.sdk, null, `${label}: no SDK identity is recorded`);
  }
  assert.equal(fs.existsSync(f.marker), false, 'no SDK file was ever imported');
});

test('mock substitutions and settings that would make worker restrictions ineffective refuse', () => {
  const f = fixture();
  const script = path.join(f.tools, WINDOWS ? 'copilot.cmd' : 'copilot.mjs');
  fs.writeFileSync(script, 'fixture shim\n', { mode: 0o755 });
  const unmarked = path.join(f.tools, 'copilot-without-extension');
  fs.writeFileSync(unmarked, 'fixture launcher bytes\n', { mode: 0o644 });
  if (!WINDOWS) fs.chmodSync(unmarked, 0o644);
  const insideRepoCli = path.join(f.repo, 'fakes', WINDOWS ? 'copilot.exe' : 'copilot');
  const insideRepoSdk = path.join(f.repo, 'fakes', 'copilot-sdk');
  fs.mkdirSync(insideRepoSdk, { recursive: true });
  fs.writeFileSync(insideRepoCli, 'fake launcher\n', { mode: 0o755 });
  if (!WINDOWS) fs.chmodSync(insideRepoCli, 0o755);
  for (const name of ['index.js', 'extension.js']) fs.copyFileSync(path.join(f.sdk, name), path.join(insideRepoSdk, name));
  const gitTree = path.join(f.base, 'some-checkout');
  fs.mkdirSync(path.join(gitTree, '.git'), { recursive: true });
  const used = path.join(f.base, 'used-fixture');
  fs.mkdirSync(used);
  fs.writeFileSync(path.join(used, 'leftover.txt'), 'state from an earlier run\n');
  /** @type {Array<[string, (plan: any) => void, Record<string, unknown>, string, string, RegExp]>} */
  const cases = [
    ['Node standing in for the CLI', (plan) => { plan.artifacts.cli = process.execPath; }, {}, 'artifacts.cli', 'refused', /this is the Node executable/],
    ['a script shim', (plan) => { plan.artifacts.cli = script; }, {}, 'artifacts.cli', 'refused', /a script or shim cannot stand in/],
    ['a fake CLI inside the repository', (plan) => { plan.artifacts.cli = insideRepoCli; }, {}, 'artifacts.cli', 'refused',
      /inside this repository, which ships no Copilot CLI/],
    ['a fake SDK inside the repository', (plan) => { plan.artifacts.sdk = insideRepoSdk; }, {}, 'artifacts.sdk', 'refused',
      /inside this repository, which ships no public Copilot SDK/],
    ['no .exe launcher on Windows', (plan) => { plan.artifacts.cli = unmarked; }, { platform: 'win32' }, 'artifacts.cli', 'invalid',
      /on Windows the CLI artifact must be the \.exe launcher/],
    ['no execute permission elsewhere', (plan) => { plan.artifacts.cli = unmarked; }, { platform: 'linux' }, 'artifacts.cli', 'invalid',
      /must be executable/],
    ['a fixture inside the repository', (plan) => { plan.fixtureParent = path.join(f.repo, 'qualification'); }, {}, 'fixtureParent', 'refused',
      /outside this repository[^:]*: project discovery would reach its real configuration and state/],
    ['a fixture containing the repository', (plan) => { plan.fixtureParent = f.base; }, {}, 'fixtureParent', 'refused', /must not contain it/],
    ['a fixture inside a Git work tree', (plan) => { plan.fixtureParent = path.join(gitTree, 'qualification'); }, {}, 'fixtureParent', 'refused',
      /inside a Git work tree[^:]*: host Git context and discovery would reach it, so worker restrictions could not be shown effective/],
    ['a reused fixture', (plan) => { plan.fixtureParent = used; }, {}, 'fixtureParent', 'invalid', /must be new or empty/],
    ['a token inside a fixture workspace', (plan) => { plan.credentials.worker = path.join(f.fixtureParent, 'b', 'workspace', 'token.txt'); }, {},
      'credentials.worker', 'refused', /readable through that session's ordinary tools/],
    ['a key inside the repository', (plan) => { plan.tls.b.keyFile = path.join(f.repo, 'key.pem'); }, {}, 'tls.b.keyFile', 'refused',
      /could be committed or read as project content/],
    ['one file for two secrets', (plan) => { plan.credentials.a = plan.credentials.b; }, {}, 'secrets.distinct', 'invalid', /must be distinct/],
  ];
  for (const [label, mutate, options, id, status, detail] of cases) {
    const plan = clone(f.plan);
    mutate(plan);
    const { report, exitCode } = /** @type {{report: any, exitCode: number}} */ (preview(f, plan, options));
    assert.equal(exitCode, EXIT.invalid, label);
    assertNothingQualified(report);
    assert.equal(only(report, id).status, status, label);
    assert.match(only(report, id).detail, detail, label);
  }

  // A reused but empty folder is acceptable: nothing in it can carry earlier state.
  const emptyParent = path.join(f.base, 'empty-fixture');
  fs.mkdirSync(emptyParent);
  const emptyReport = /** @type {any} */ (preview(f, { ...clone(f.plan), fixtureParent: emptyParent })).report;
  assert.equal(only(emptyReport, 'fixtureParent').status, 'ok');
  assert.match(only(emptyReport, 'fixtureParent').detail, /is an empty folder; this preview creates nothing there$/);

  // Model providers, fake AI, component evidence, and worker adapters have no place in a closed plan.
  const substituted = /** @type {any} */ (clone(f.plan));
  substituted.models.provider = { baseUrl: 'http://127.0.0.1:9/fake-model' };
  substituted.fakeAi = true;
  substituted.artifacts.workerAdapters = { loadSdk: 'component-fake' };
  substituted.componentEvidence = 'src/extensions/dude/a2a-collaboration-tls.test.mjs';
  const { report } = /** @type {{report: any}} */ (preview(f, substituted));
  assertNothingQualified(report);
  assert.deepEqual(checksFor(report, 'plan.unknown').map((/** @type {any} */ entry) => /^unknown key (\S+):/.exec(entry.detail)?.[1]).sort(),
    ['artifacts.workerAdapters', 'componentEvidence', 'fakeAi', 'models.provider']);
  for (const entry of checksFor(report, 'plan.unknown')) {
    assert.equal(entry.status, 'invalid');
    assert.match(entry.detail, /the plan is closed, so it cannot carry approvals, proof, stage results, model providers, fakes, or adapters$/);
  }
  assert.equal(JSON.stringify(report).includes('127.0.0.1:9'), false, 'an unknown value is never echoed');
  assert.equal(fs.existsSync(f.marker), false);
});

test('no option or plan field can grant authority, attest proof, or mark a stage passed', () => {
  const f = fixture();
  const attested = /** @type {any} */ (clone(f.plan));
  attested.approved = true;
  attested.permission = { granted: true, by: 'human', at: '2026-11-01T09:59:00Z' };
  attested.proof = { served_worker_observation: 'observed', actual_sdk_use: 'observed' };
  attested.stages = { prerequisite_qualification: 'passed', causal_capture: 'passed' };
  attested.nativeBranch = 'implemented';
  attested.transport.authorized = true;
  const { report, exitCode } = /** @type {{report: any, exitCode: number}} */ (preview(f, attested));
  assert.equal(exitCode, EXIT.invalid);
  assertNothingQualified(report);
  assert.deepEqual(checksFor(report, 'plan.unknown').map((/** @type {any} */ entry) => /^unknown key (\S+):/.exec(entry.detail)?.[1]).sort(),
    ['approved', 'nativeBranch', 'permission', 'proof', 'stages', 'transport.authorized']);
  assert.equal(report.permission.requestedScope, 'invalid');

  const planFile = path.join(f.base, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ ...clone(f.plan), expiresAt: new Date(Date.now() + 3_600_000).toISOString().slice(0, 19) + 'Z' }));
  const before = tree(f.base);
  for (const args of [
    [],
    ['--plan'],
    ['--plan', 'plan.json'],
    ['--native'],
    ['--native', '--plan'],
    ['--native', '--plan', 'plan.json'],
    ['--plan', planFile, '--native'],
    ['--native', '--native', '--plan', planFile],
    ['--plan', planFile, '--approve'],
    ['--plan', planFile, '--yes'],
    ['--native', '--plan', planFile, '--yes'],
    ['--authorized', 'true', '--plan', planFile],
    ['--plan', planFile, '--plan', planFile],
    ['--help'],
  ]) {
    const result = spawnSync(process.execPath, [QUALIFIER, ...args], { cwd: f.base, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, EXIT.usage, `${JSON.stringify(args)}: ${result.stderr}`);
    assert.equal(result.stdout, '', `${JSON.stringify(args)}: no report, no partial output`);
    assert.match(result.stderr, /^qualify-collaboration: usage: pass exactly --plan <absolute-plan\.json> to preview or --native --plan <absolute-v2-or-v3-plan\.json> to run natively; no other option exists, and none grants authority\nusage: /);
    assert.ok(Buffer.byteLength(result.stderr) < 1024, 'the refusal is bounded');
  }
  assert.deepEqual(tree(f.base), before, 'refused invocations changed nothing');
  assert.equal(fs.existsSync(f.marker), false);
});

test('the CLI prints only the bounded JSON report: 3 for a complete plan, 1 for an invalid one, 2 for an unreadable plan; it never exits 0', () => {
  const f = fixture();
  const planFile = path.join(f.base, 'plan.json');
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString().slice(0, 19) + 'Z';
  const planBytes = Buffer.from(JSON.stringify({ ...clone(f.plan), expiresAt }, null, 2));
  fs.writeFileSync(planFile, planBytes);
  const before = tree(f.base);
  /** @param {string[]} args */
  const run = (args) => spawnSync(process.execPath, [QUALIFIER, ...args], { cwd: f.base, encoding: 'utf8', timeout: 60_000 });

  const blocked = run(['--plan', planFile]);
  assert.equal(blocked.status, 3, blocked.stderr);
  assert.equal(blocked.stderr, '');
  assert.ok(Buffer.byteLength(blocked.stdout) <= QUALIFICATION_LIMITS.reportBytes, 'the report is within its bound');
  const report = JSON.parse(blocked.stdout);
  assert.equal(report.verdict, 'blocked');
  assertNothingQualified(report);
  assert.deepEqual(report.plan, { file: planFile, bytes: planBytes.length, sha256: sha256(planBytes) });
  assert.deepEqual(report.host, { platform: process.platform, node: process.versions.node });
  assert.match(report.scopeSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(tree(f.base), before, 'the CLI preview created, changed, and removed nothing');
  assert.equal(fs.existsSync(f.fixtureParent), false);
  assert.equal(fs.existsSync(f.marker), false, 'the CLI hashed the SDK and never imported it');

  const invalidFile = path.join(f.base, 'invalid-plan.json');
  fs.writeFileSync(invalidFile, JSON.stringify({ ...clone(f.plan), expiresAt: '2026-10-15T00:00:00Z' }));
  const invalid = run(['--plan', invalidFile]);
  assert.equal(invalid.status, 1, invalid.stderr);
  const refused = JSON.parse(invalid.stdout);
  assert.deepEqual([refused.verdict, refused.permission.requestedScope, refused.scopeSha256], ['invalid', 'expired', null]);
  assertNothingQualified(refused);

  const folder = path.join(f.base, 'plan-folder');
  fs.mkdirSync(folder);
  const oversized = path.join(f.base, 'oversized.json');
  fs.writeFileSync(oversized, `{"version":1,"padding":"${'x'.repeat(QUALIFICATION_LIMITS.planBytes)}"}`);
  const notJson = path.join(f.base, 'not-json.json');
  fs.writeFileSync(notJson, 'version: 1\n');
  const notUtf8 = path.join(f.base, 'not-utf8.json');
  fs.writeFileSync(notUtf8, Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]));
  for (const [file, code] of [
    [path.join(f.base, 'absent.json'), 'plan_unreadable'],
    [folder, 'plan_unsafe'],
    [oversized, 'plan_too_large'],
    [notJson, 'plan_not_json'],
    [notUtf8, 'plan_not_json'],
  ]) {
    const result = run(['--plan', file]);
    assert.equal(result.status, 2, `${code}: ${result.stderr}`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`^qualify-collaboration: ${code}: `));
    assert.equal(result.stderr.includes('x'.repeat(64)), false, 'plan content is never echoed');
  }
  let linked = '';
  try {
    linked = path.join(f.base, 'linked-plan.json');
    fs.symlinkSync(planFile, linked, 'file');
  } catch {
    linked = '';
  }
  if (linked) {
    const result = run(['--plan', linked]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^qualify-collaboration: plan_unsafe: /);
  }

  // The exported entry point behaves the same in process and reports its own failures as usage failures.
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const err = [];
  const io = { stdout: { write: (/** @type {string} */ text) => out.push(text) }, stderr: { write: (/** @type {string} */ text) => err.push(text) } };
  assert.equal(main(['--plan', planFile], io), 3);
  assert.equal(JSON.parse(out.join('')).verdict, 'blocked');
  assert.equal(main(['--plan', planFile], io, { repoRoot: f.base }), 1, 'a fixture inside the stated repository root is refused');
  assert.equal(err.length, 0);
  assert.equal(readPlan(planFile).sha256, sha256(planBytes));
});

test('reports stay bounded for maximal values and many unknown keys, and never echo a refused value', () => {
  const f = fixture();
  const longPath = (/** @type {string} */ label) => {
    const prefix = path.join(f.owners, label);
    return path.join(prefix, 'x'.repeat(QUALIFICATION_LIMITS.pathBytes - Buffer.byteLength(prefix) - 1));
  };
  const maximal = /** @type {any} */ (clone(f.plan));
  maximal.operator = 'o'.repeat(QUALIFICATION_LIMITS.labelBytes);
  maximal.coordinator = 'c'.repeat(QUALIFICATION_LIMITS.labelBytes);
  maximal.models = { a: 'a'.repeat(128), b: 'b'.repeat(128), worker: 'w'.repeat(128) };
  maximal.progress = { a: 'p'.repeat(QUALIFICATION_LIMITS.actionBytes), b: 'q'.repeat(QUALIFICATION_LIMITS.actionBytes) };
  maximal.credentials = { a: longPath('a1'), b: longPath('b1'), worker: longPath('w1') };
  maximal.tls = { a: { certFile: longPath('a2'), keyFile: longPath('a3') }, b: { certFile: longPath('b2'), keyFile: longPath('b3') } };
  for (const id of SECRET_IDS) {
    const [group, side, file] = id.split('.');
    const value = file ? maximal[group][side][file] : maximal[group][side];
    assert.equal(Buffer.byteLength(value), QUALIFICATION_LIMITS.pathBytes, id);
  }
  const big = /** @type {any} */ (preview(f, maximal)).report;
  assert.equal(big.verdict, 'blocked', JSON.stringify(big.checks.filter((/** @type {any} */ entry) => entry.status !== 'ok')));
  const bigBytes = Buffer.byteLength(`${JSON.stringify(big, null, 2)}\n`);
  assert.ok(bigBytes <= QUALIFICATION_LIMITS.reportBytes, `a maximal complete report is ${bigBytes} bytes`);

  const tooLong = /** @type {any} */ (clone(f.plan));
  tooLong.models.worker = `secret-like-${'m'.repeat(QUALIFICATION_LIMITS.labelBytes)}`;
  tooLong.progress.a = `line one\nline two`;
  tooLong.credentials.a = `${f.owners}${path.sep}..${path.sep}escape.txt`;
  const refused = /** @type {any} */ (preview(f, tooLong)).report;
  assert.equal(only(refused, 'models.worker').status, 'invalid');
  assert.equal(only(refused, 'progress.a').status, 'invalid');
  assert.equal(only(refused, 'credentials.a').status, 'invalid');
  const refusedText = JSON.stringify(refused);
  for (const value of [tooLong.models.worker, 'line two', 'escape.txt']) assert.equal(refusedText.includes(value), false, 'a refused value is never echoed');

  const flooded = /** @type {any} */ (clone(f.plan));
  for (let index = 0; index < 200; index += 1) flooded[`extra${index}`] = index;
  flooded[`${'k'.repeat(300)}\u0007`] = true;
  const many = /** @type {any} */ (preview(f, flooded)).report;
  const unknown = checksFor(many, 'plan.unknown');
  assert.equal(unknown.length, QUALIFICATION_LIMITS.unknownKeys + 1);
  assert.equal(unknown.at(-1).detail, `${201 - QUALIFICATION_LIMITS.unknownKeys} more unknown keys are not listed`);
  assertNothingQualified(many);

  const longKey = /** @type {any} */ ({ [`${'k'.repeat(300)}\u0007`]: true });
  const shown = /** @type {any} */ (preview(f, longKey)).report;
  const keyCheck = checksFor(shown, 'plan.unknown')[0];
  assert.match(keyCheck.detail, /^unknown key k{93}\.\.\.:/, 'long and control-character keys are cut and made safe');
});

test('a complete version-2 plan previews as blocked and binds this runner, the native branch, the observer, the rendered core, and the fixed fixture', () => {
  const f = fixture();
  const before = tree(f.base);
  const { report, exitCode, scope } = /** @type {{report: any, exitCode: number, scope: any}} */ (preview(f, f.planV2));
  assert.equal(exitCode, EXIT.blocked);
  assert.deepEqual([report.version, report.verdict], [2, 'blocked']);
  assertNothingQualified(report);
  assert.match(report.nativeBranch.detail, /It has never run this strict qualification natively, so nothing about that run's native behavior is known, and no preview result stands in for it\./);
  assert.doesNotMatch(JSON.stringify([report.proof, report.nativeBranch]),
    /Only fake SDKs have produced|No native run has produced|It has never run natively|nothing about native behavior is known from it|no native run has, so none/,
    'each never-run or fake-only statement in a strict report names the strict run, since version-3 attempts have run natively');
  for (const [name, file] of [['qualifier', 'qualify-collaboration.mjs'], ['native', 'native-collaboration.mjs'], ['observer', 'native-observer.ps1']]) {
    const bytes = fs.readFileSync(path.join(HERE, file));
    assert.deepEqual(report.scope.sources[name], { path: path.join(HERE, file), bytes: bytes.length, sha256: sha256(bytes) }, name);
  }
  const core = renderedCore(REPOSITORY);
  assert.deepEqual(report.scope.core, { files: core.files, bytes: core.bytes, sha256: core.sha256 }, 'the core rendered from this repository\'s source');
  assert.ok(core.rows.some((row) => row[0] === '.github/agents/dude.agent.md'), 'it holds the Dude agent a run selects');
  assert.ok(core.rows.some((row) => row[0] === '.github/extensions/dude/extension.mjs'), 'and the extension it joins');
  assert.deepEqual(report.scope.fixture, { manifestTemplateSha256: fixtureManifest('00000000-0000-0000-0000-000000000000').sha256,
    folders: ['a/w', 'a/h', 'a/c', 'a/t', 'b/w', 'b/h', 'b/c', 'b/t', 'k/w', 'k/h', 'k/c', 'k/t', 'q', 'p'] });
  assert.equal(report.artifacts.runtimePayload, null);
  assert.equal(only(report, 'observation').status, 'ok');
  for (const id of ['progress.a.path', 'progress.a.initial', 'progress.a.final', 'progress.b.path', 'progress.b.initial', 'progress.b.final']) {
    assert.equal(only(report, id).status, 'ok', id);
  }
  const effects = Object.fromEntries(report.plannedEffects.map((/** @type {any} */ entry) => [entry.scope, entry.detail]));
  assert.deepEqual(Object.keys(effects), ['preparation', 'observation', 'native_startup', 'after_view_control', 'secret_reads', 'transport_and_approval', 'worker',
    'progress_and_capture', 'permissions', 'cancellation_and_teardown', 'recording']);
  assert.ok(effects.preparation.includes(path.join(f.fixtureParent, 'k', 'w')));
  assert.match(effects.observation, /administrator or Performance Log Users rights and refuses without them; nothing elevates/);
  assert.match(effects.observation, /never contents, command lines, environments, or network data, and it kills, injects into, and deletes nothing/);
  assert.match(effects.observation, /Below each B worker's own folder in b\/t it also keeps, from its start, each file's path relative to that folder \(not in its temp area\)/);
  assert.match(effects.observation, /so every access the worker makes in its configuration and home storage, a read or open as well as a write, is classified by the documented purpose of the session workspace it recorded\./);
  assert.match(effects.observation, /A path there that is not one plain spelling \(a \. or \.\. segment, an empty or forward separator, a trailing dot or space, a stream name, or an 8\.3 short name\) keeps no name and is never classified/);
  assert.match(effects.observation, /an access it cannot classify fails the run as ambient_storage_unclassified/);
  assert.doesNotMatch(effects.observation, /the worker's writes are classified|a write it cannot classify/, 'no stale writes-only classification');
  assert.match(effects.native_startup, /one control runtime in empty mode that checks canary recognition through parsed public discovery results, then runs the after-view control below and stops, then A and B/);
  assert.ok(effects.transport_and_approval.includes(`at most ${A2A_PROPOSAL_BYTES} bytes`));
  assert.match(effects.transport_and_approval, /only that entered line, without surrounding spaces, is sent, the unchanged classifier must accept it/);
  assert.match(effects.worker, /worker at most 90000 ms, operation at most 120000 ms, cleanup 10000 ms/);
  assert.match(effects.worker, /a workspace that is still the same directory by path, device, and inode, or observed absence, which allows no session persistence/);
  assert.doesNotMatch(effects.worker, /ambient_state_unobservable|does not carry/, 'no stale claim that the storage is unobservable');
  assert.match(effects.progress_and_capture, /progress-a\.txt and progress-b\.txt appear holding pending/);
  assert.match(effects.progress_and_capture, /No root prompt is sent while an operation is pending, and nothing given to A names B's records or the expected number\./);
  for (const part of mainRelayParts('delta')) assert.ok(effects.permissions.includes(part), `permissions: ${part}`);
  assert.doesNotMatch(effects.permissions, /Each is shown and needs a freshly typed approve-once/, 'no stale claim that every main request is asked');
  assert.doesNotMatch(effects.permissions, /pending progress read|approval and capture steps allow no Dude tool call/,
    'no stale claim that the progress file\'s read is asked, or that the capture step allows nothing');
  assert.match(effects.permissions, /The after-view control session has its own fixed relay, only for its one view's reads of the files named there, asked the same way; it never answers for a main session or the worker\./);
  assert.match(effects.cancellation_and_teardown, /Nothing is killed, deleted, retried, or rerun/);
  assert.ok(effects.recording.includes(`qualification evidence goes only to ${path.join(f.fixtureParent, 'p')}, never into a journal`));
  assert.equal(scope.scopeSha256, report.scopeSha256, 'the in-process scope is the one the report names');
  assert.deepEqual([scope.values.slug, scope.values.port, scope.values.cli, scope.values.runtimePayload], ['delta', 18_443, f.cli, null]);
  assert.equal('scope' in report.permission || 'consent' in report, false, 'a preview carries no consent');

  assert.deepEqual(tree(f.base), before, 'the preview created, changed, and removed nothing');
  assert.equal(fs.existsSync(f.fixtureParent), false);
  assert.equal(fs.existsSync(f.marker), false, 'the SDK was hashed, never imported');

  const v1 = /** @type {any} */ (preview(f, f.plan)).report;
  assert.notEqual(v1.scopeSha256, report.scopeSha256, 'a version-1 digest never stands for a native scope');
  const otherSlug = clone(f.planV2);
  otherSlug.capture.slug = 'echo';
  assert.notEqual(/** @type {any} */ (preview(f, otherSlug)).report.scopeSha256, report.scopeSha256);
  const payload = path.join(f.tools, 'payload.js');
  fs.writeFileSync(payload, 'fixture payload bytes; never loaded\n');
  const withPayload = clone(f.planV2);
  withPayload.artifacts.runtimePayload = payload;
  const payloadReport = /** @type {any} */ (preview(f, withPayload)).report;
  assert.equal(payloadReport.verdict, 'blocked');
  assert.deepEqual(payloadReport.artifacts.runtimePayload, { path: payload, bytes: 36, sha256: sha256('fixture payload bytes; never loaded\n') });
  fs.appendFileSync(payload, 'x');
  assert.notEqual(/** @type {any} */ (preview(f, withPayload)).report.scopeSha256, payloadReport.scopeSha256, 'payload bytes are bound');
});

test('the one after-view control and the worker-relative path observation are defined only in effect-free source the scope digest binds, and disclosed whole before consent: A\'s model and credential route, the fixed session, prompt, view target, surfaced sources, relay, required facts, and bound', () => {
  const f = fixture();
  const before = tree(f.base);
  const { report, scope } = /** @type {{report: any, scope: any}} */ (preview(f, f.planV2));
  const project = path.join(f.fixtureParent, 'k', 'w');
  const target = path.join(project, 'dude-canary-denied-read.txt');

  // The fixed definition: frozen, closed, and made only of existing canaries and the fixed short layout.
  assert.ok(Object.isFrozen(AFTER_VIEW_CONTROL) && Object.isFrozen(AFTER_VIEW_CONTROL.session) && Object.isFrozen(AFTER_VIEW_CONTROL.session.availableTools));
  assert.deepEqual(structuredClone(AFTER_VIEW_CONTROL), {
    workingDirectory: 'k/t', project: 'k/w', target: 'dude-canary-denied-read.txt', source: 'AGENTS.md', tool: 'view', outputBytes: 4_096,
    session: { availableTools: ['builtin:view'], skipCustomInstructions: false, enableOnDemandInstructionDiscovery: true, enableConfigDiscovery: false,
      additionalDirectories: [], enableFileHooks: false, enableSkills: false, memory: { enabled: false }, enableSessionStore: false,
      enableHostGitOperations: false, requestExtensions: false, requestCanvasRenderer: false, mcpServers: {}, enableSessionTelemetry: false },
  });
  assert.deepEqual([CANARIES.find((canary) => canary.path === AFTER_VIEW_CONTROL.target)?.kind, CANARIES.find((canary) => canary.path === AFTER_VIEW_CONTROL.target)?.location],
    ['denied_read', 'work'], 'the view target is the existing synthetic denied-read canary');
  assert.deepEqual([CANARIES.find((canary) => canary.path === AFTER_VIEW_CONTROL.source)?.kind, CANARIES.find((canary) => canary.path === AFTER_VIEW_CONTROL.source)?.location],
    ['instructions', 'work'], 'the required source is the existing AGENTS.md canary');
  assert.ok(report.scope.fixture.folders.includes(AFTER_VIEW_CONTROL.project) && report.scope.fixture.folders.includes(AFTER_VIEW_CONTROL.workingDirectory));
  const prompt = afterViewPrompt(target);
  assert.equal(prompt, ['Feature 089 native qualification, after-view control.', `Use the view tool exactly once, with exactly the arguments ${JSON.stringify({ path: target })}.`,
    'Use no other tool and view no other path. Do not repeat, quote, or summarize what the file contains.', 'Then reply with one short sentence saying that you viewed it.']
    .join('\n'));
  const fixed = prompt.split(JSON.stringify({ path: target })).join('');
  for (const hidden of ['101', '102', 'peer', 'approve', 'AGENTS', 'lifecycle']) assert.equal(fixed.includes(hidden), false, `the prompt names no ${hidden}`);

  // The complete disclosure shown before consent.
  const disclosure = report.plannedEffects.find((/** @type {any} */ entry) => entry.scope === 'after_view_control')?.detail ?? '';
  for (const part of [`A's model ${f.planV2.models.a}`, `A's credential ${f.planV2.credentials.a}`, 'only builtin:view', 'custom and on-demand instructions on',
    'configuration discovery, hooks, skills, memory, the session store, host Git, extensions, and MCP off, no additional directories',
    `working directory ${path.join(f.fixtureParent, 'k', 't')}`, `It is sent this prompt once: ${JSON.stringify(prompt)}`, `That one view may read ${target}`,
    `surface and read AGENTS.md in ${project}`, 'may also surface .github/copilot-instructions.md and .github/instructions/dude-canary.instructions.md there',
    'each permission request for those reads is shown and needs a freshly typed approve-once', 'view arguments against the built-in view schema',
    'the public instruction-discovered notification for AGENTS.md', 'AGENTS.md among the loaded sources by digest',
    'the control runtime\'s observed reads of both files after the discovery checks', 'anything less stops the run as ambient_state_unobservable',
    'The whole control has one 60-second deadline and ends before either main starts; nothing from it reaches A\'s or B\'s sessions, prompts, or journals.',
    'needs a freshly typed approve-once before the control\'s deadline or the scope\'s expiry, whichever is earlier, and is withdrawn once that view\'s turn ends, '
      + 'aborts, or reports an error, or another operation appears in its session',
    'its successful model-facing output, at most 4,096 bytes, holding the synthetic file\'s text exactly once',
    'AGENTS.md among the loaded sources by digest with a documented repository type and location',
    'with every event of that session one its phase permits, in the form permitted (before the prompt, during its one turn, and after that turn '
      + 'only housekeeping or another normal idle, through its post-turn checks)',
    'The control runtime is then stopped, and its whole process tree must be seen to end within 10 seconds of that stop.',
    // T008 round 5: the accepted source labels at each stage, the identity and post-turn event rules, and a cessation snapshot that
    // lost coverage, each disclosed before consent.
    `The control runtime's discovery checks accept each fixed instruction canary only with its own documented type, as a repository or working-directory source of the scanned project ${project}.`,
    'AGENTS.md among the loaded sources by digest with a documented repository type and location (type repo or nested-agents, location repository)',
    'none stating another session, admission, or tool call than it established, no tool catalog naming another model than the checked one '
      + 'once the model check was asked, and no change of its model or working directory once the run asked for the matching check, even the '
      + 'same one restated (model names on its turn and usage events are telemetry labels and are not compared); anything less stops the run '
      + 'as ambient_state_unobservable. What the session sent before the prompt is judged just before the prompt would be sent, and a refused '
      + 'event there means the prompt is never sent.',
    // T008 round 6: the report's account of refused events, disclosed as local evidence without payload: one bounded entry per distinct
    // original type and class with its first safe ID, never an ID per event.
    'The report keeps, as local evidence only and never the event\'s data, at most 8 entries for the events of that session it refused, one '
      + 'per distinct original type and class, each with the type name, class, count, and the first such event\'s ID when that ID is safe to '
      + 'keep (otherwise null), and counts any further distinct entries as refusedEventsOmitted.',
    'A snapshot of that stop that lost, could not decode, or could not attribute events, missed a marker, had an identity gap, or overflowed confirms nothing and stops the run with that observer reason.',
    // The event judgment ends with the final post-turn judgment: what arrives during the owned stop is not judged, and the stop is still checked.
    'Events the session delivers during that stop come after its final judgment, so they are neither judged nor kept in the report; the '
      + 'stop is still checked as above, and an overflow of the session\'s event log still stops the run.']) {
    assert.ok(disclosure.includes(part), part);
  }
  assert.doesNotMatch(disclosure, /equal to the synthetic file/, 'the output is no longer promised to equal the file');
  assert.doesNotMatch(disclosure, /none stating another session, model, working directory|ID of each event/,
    'no claim that every stated model or working directory is compared, or that the report keeps an ID per event');
  assert.doesNotMatch(disclosure, /\b4096\b/, 'the bound is printed as the guide prints it');
  assert.doesNotMatch(fs.readFileSync(path.join(HERE, 'qualify-collaboration.mjs'), 'utf8'), /toLocaleString|Intl\./,
    'every number in the disclosure is formatted without the host\'s locale data, so the scope digest cannot depend on it');
  assert.doesNotMatch(JSON.stringify(report.plannedEffects), /persistenceProven|controlled_fixture|syntheticPrerequisites|stand in for an unobservable/,
    'no proof input, flag, or stand-in is offered');
  assert.equal(report.proof.find((/** @type {any} */ entry) => entry.id === 'ambient_feature_enforcement').status, 'unverified');
  assert.match(report.proof.find((/** @type {any} */ entry) => entry.id === 'ambient_feature_enforcement').detail,
    /Only controlled checks have exercised these observations; no native strict run has, so none of them is established\./);
  assert.match(report.nativeBranch.detail, /It runs one model-driven after-view control and classifies the session storage each served worker recorded; whether a native host passes either is unknown\./);

  // Bound by the scope digest: the scope carries exactly what is shown, and the bytes of the sources that define it.
  assert.deepEqual(scope.plannedEffects, report.plannedEffects);
  const sources = Object.fromEntries(['qualify-collaboration.mjs', 'native-collaboration.mjs', 'native-observer.ps1'].map((name) => [name,
    fs.readFileSync(path.join(HERE, name))]));
  assert.equal(report.scope.sources.qualifier.sha256, sha256(sources['qualify-collaboration.mjs']));
  assert.equal(report.scope.sources.native.sha256, sha256(sources['native-collaboration.mjs']));
  assert.equal(report.scope.sources.observer.sha256, sha256(sources['native-observer.ps1']));
  assert.match(sources['qualify-collaboration.mjs'].toString('utf8'), /^export const AFTER_VIEW_CONTROL = Object\.freeze\(\{$/m, 'the control is defined in the qualifier');
  assert.match(sources['native-collaboration.mjs'].toString('utf8'),
    /^import \{ AFTER_VIEW_CONTROL, CANARIES, PROGRESS_FIXTURES, afterViewPrompt, fixtureManifest, renderedCore, nativeScope \} from '\.\/qualify-collaboration\.mjs';\r?$/m,
    'the native branch runs exactly that definition');
  assert.match(sources['native-observer.ps1'].toString('utf8'), /WorkerDirFields = \{ "process", "dir", "area", "op", "path" \};/,
    'the worker-relative path observation is in the bound observer source');
  const otherModel = clone(f.planV2);
  otherModel.models.a = 'fixture-model-a2';
  const changed = /** @type {any} */ (preview(f, otherModel)).report;
  assert.notEqual(changed.scopeSha256, report.scopeSha256);
  assert.ok(changed.plannedEffects.find((/** @type {any} */ entry) => entry.scope === 'after_view_control').detail.includes('A\'s model fixture-model-a2'),
    'the disclosed control model is the plan\'s A model');
  assert.equal(/** @type {any} */ (preview(f, f.plan)).report.plannedEffects.some((/** @type {any} */ entry) => entry.scope === 'after_view_control'), false,
    'a version-1 plan, which can never run natively, offers no control');
  assert.deepEqual(tree(f.base), before, 'the preview created, changed, and removed nothing');
  assert.equal(fs.existsSync(f.marker), false, 'the SDK was never imported');
});

test('a version-2 plan is closed and fixed: no authority, proof, fake, provider, or adapter field, and only the fixed progress fixtures and observation', () => {
  const f = fixture();
  const folder = path.join(f.tools, 'payload-folder');
  fs.mkdirSync(folder);
  const insideRepo = path.join(f.repo, 'payload.js');
  fs.writeFileSync(insideRepo, 'fake payload\n');
  /** @type {Array<[string, (plan: any) => void, string, string]>} */
  const cases = [
    ['a version-1 progress action', (plan) => { plan.progress.a = 'Append one line with the edit tool'; }, 'progress.a', 'invalid'],
    ['a progress fixture without its line ending', (plan) => { plan.progress.a.initial = 'pending'; }, 'progress.a.initial', 'invalid'],
    ['the other main\'s progress file', (plan) => { plan.progress.b.path = 'progress-a.txt'; }, 'progress.b.path', 'invalid'],
    ['another final word', (plan) => { plan.progress.b.final = 'done\n'; }, 'progress.b.final', 'invalid'],
    ['another observation', (plan) => { plan.observation = 'none'; }, 'observation', 'invalid'],
    ['no observation', (plan) => { delete plan.observation; }, 'observation', 'missing'],
    ['no payload decision', (plan) => { delete plan.artifacts.runtimePayload; }, 'artifacts.runtimePayload', 'missing'],
    ['a payload folder', (plan) => { plan.artifacts.runtimePayload = folder; }, 'artifacts.runtimePayload', 'invalid'],
    ['a payload inside the repository', (plan) => { plan.artifacts.runtimePayload = insideRepo; }, 'artifacts.runtimePayload', 'refused'],
    ['a slug too long for its cancellation twin', (plan) => { plan.capture.slug = 's'.repeat(58); }, 'capture.slug', 'invalid'],
  ];
  for (const [label, mutate, id, status] of cases) {
    const plan = clone(f.planV2);
    mutate(plan);
    const { report, exitCode, scope } = /** @type {{report: any, exitCode: number, scope: any}} */ (preview(f, plan));
    assert.equal(exitCode, EXIT.invalid, label);
    assertNothingQualified(report);
    assert.equal(only(report, id).status, status, label);
    assert.deepEqual([report.scopeSha256, scope], [null, null], `${label}: nothing to consent to`);
  }
  const v1Slug = clone(f.plan);
  v1Slug.capture.slug = 's'.repeat(58);
  assert.equal(/** @type {any} */ (preview(f, v1Slug)).report.verdict, 'blocked', 'version 1 keeps its own slug bound');

  const attested = /** @type {any} */ (clone(f.planV2));
  attested.consent = 'approve native 0123456789abcdef';
  attested.authorization = { granted: true };
  attested.nativeProof = { observer: 'observed' };
  attested.fakeAi = true;
  attested.adapters = { loadSdk: 'component-fake' };
  attested.models.provider = { baseUrl: 'http://127.0.0.1:9/fake-model' };
  attested.artifacts.adapter = 'fake';
  attested.progress.a.command = 'echo complete > progress-a.txt';
  const { report } = /** @type {{report: any}} */ (preview(f, attested));
  assertNothingQualified(report);
  assert.deepEqual(checksFor(report, 'plan.unknown').map((/** @type {any} */ entry) => /^unknown key (\S+):/.exec(entry.detail)?.[1]).sort(),
    ['adapters', 'artifacts.adapter', 'authorization', 'consent', 'fakeAi', 'models.provider', 'nativeProof', 'progress.a.command']);
  const text = JSON.stringify(report);
  for (const value of ['0123456789abcdef', '127.0.0.1:9', 'echo complete']) assert.equal(text.includes(value), false, 'an unknown value is never echoed');
  assert.equal(fs.existsSync(f.marker), false);
});

test('the native branch refuses before any import or effect without a complete version-2 scope and an interactive terminal; it never exits 0 here', () => {
  const f = fixture();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString().slice(0, 19) + 'Z';
  const v1File = path.join(f.base, 'plan-v1.json');
  fs.writeFileSync(v1File, JSON.stringify({ ...clone(f.plan), expiresAt }));
  const v2File = path.join(f.base, 'plan-v2.json');
  const v2Bytes = Buffer.from(JSON.stringify({ ...clone(f.planV2), expiresAt }));
  fs.writeFileSync(v2File, v2Bytes);
  const expiredFile = path.join(f.base, 'plan-v2-expired.json');
  fs.writeFileSync(expiredFile, JSON.stringify({ ...clone(f.planV2), expiresAt: '2026-10-15T00:00:00Z' }));
  const before = tree(f.base);
  /** @param {string} file */
  const run = (file) => spawnSync(process.execPath, [QUALIFIER, '--native', '--plan', file], { cwd: f.base, encoding: 'utf8', timeout: 60_000, input: '' });

  for (const [file, branch] of [[v1File, 'native_branch_requires_v2'], [expiredFile, 'native_run_not_started']]) {
    const refused = run(file);
    assert.equal(refused.status, EXIT.invalid, refused.stderr);
    assert.equal(refused.stderr, '', 'no prompt was shown');
    const report = JSON.parse(refused.stdout);
    assert.deepEqual([report.mode, report.verdict], ['native_refused', 'invalid']);
    assert.equal(report.nativeBranch.id, branch);
    assertNothingQualified(report);
  }

  const redirected = run(v2File);
  assert.equal(redirected.status, EXIT.failed, redirected.stderr);
  assert.equal(redirected.stderr, '', 'a null runtime payload is refused before any scope prompt or consent');
  assert.ok(Buffer.byteLength(redirected.stdout) <= QUALIFICATION_LIMITS.reportBytes);
  const unproven = JSON.parse(redirected.stdout);
  assert.deepEqual([unproven.mode, unproven.verdict, unproven.consent.status], ['native', 'refused', 'not_given']);
  assert.equal(unproven.reason, process.platform === 'win32' ? 'runtime_identity_unobserved' : 'platform_unsupported');
  assert.equal(unproven.effects, 'none yet');
  assert.deepEqual(unproven.phases, [], 'nothing was asked or started');

  const payload = path.join(f.tools, 'payload.js');
  fs.writeFileSync(payload, 'fixture payload bytes; never loaded\n');
  const withPayloadFile = path.join(f.base, 'plan-v2-payload.json');
  const withPayloadBytes = Buffer.from(JSON.stringify({ ...clone(f.planV2), expiresAt, artifacts: { ...clone(f.planV2).artifacts, runtimePayload: payload } }));
  fs.writeFileSync(withPayloadFile, withPayloadBytes);
  const before2 = tree(f.base);
  const consentAsked = run(withPayloadFile);
  assert.equal(consentAsked.status, EXIT.failed, consentAsked.stderr);
  assert.equal(consentAsked.stderr, '', 'redirected input sees no scope prompt and is never asked for consent');
  assert.ok(Buffer.byteLength(consentAsked.stdout) <= QUALIFICATION_LIMITS.reportBytes);
  const report = JSON.parse(consentAsked.stdout);
  assert.deepEqual([report.mode, report.verdict, report.consent.status], ['native', 'refused', 'not_given']);
  assert.equal(report.reason, process.platform === 'win32' ? 'consent_not_interactive' : 'platform_unsupported');
  assert.equal(report.layer, 'native', 'no adapter was used, and still nothing qualified');
  assert.equal(report.effects, 'none yet');
  assert.deepEqual(report.plan, { file: withPayloadFile, bytes: withPayloadBytes.length, sha256: sha256(withPayloadBytes) });
  assert.match(report.scopeSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(report.checks, []);
  assert.deepEqual(tree(f.base), before2, 'nothing was created, changed, or removed');
  assert.equal(fs.existsSync(f.fixtureParent), false);
  assert.equal(fs.existsSync(f.marker), false, 'the SDK was never imported');
  assert.deepEqual(before, Object.fromEntries(Object.entries(before2).filter(([key]) => !key.endsWith('payload.js') && !key.endsWith('plan-v2-payload.json'))),
    'only this test\'s own payload and plan files were added between the runs');
});

// ---------------------------------------------------------------------------
// Version 3: normal collaboration through each role's existing saved sign-in.
// ---------------------------------------------------------------------------

const V3_STAGE_IDS = ['account_readiness', 'exchange_and_main_progress', 'causal_capture', 'cancellation', 'bounded_stop_and_retained_reread'];
const V3_PROOF_IDS = ['native_permission', 'account_observation', 'served_worker_observation', 'actual_sdk_use'];
const V3_EFFECTS = ['preparation', 'native_startup', 'normal_runtime_effects', 'accounts', 'tls_reads', 'transport_and_approval', 'model_calls', 'worker',
  'progress_and_capture', 'permissions', 'cancellation_and_teardown', 'recording', 'deferred_strict'];
const STRICT_CHECKS = ['ambient_feature_enforcement', 'canary_recognition', 'after_view_control', 'runtime_identity_observation',
  'worker_storage_classification', 'owned_process_tree_cessation'];
const ZERO_RUN = '00000000-0000-0000-0000-000000000000';
/** The approved selection, written out from the contract rather than taken from the module under test. */
const APPROVED_NAMES = ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA'];

/** Sorted-key JSON, as the scope digest is taken. @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(/** @type {any} */ (value)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * A complete version-3 plan over the same disposable artifacts: no credential,
 * runtime payload, or observation; each role names an existing empty base
 * directory outside the stand-in repository and the fixture, and an expected
 * account. `environment` stands in for this process's: made-up locations
 * below the test folder, without HOME, plus a credential-shaped and an
 * unselected variable that must never be read.
 */
function fixtureV3() {
  const f = fixture();
  const bases = /** @type {Record<'a' | 'b' | 'worker', string>} */ (Object.fromEntries(['a', 'b', 'worker'].map((role) => {
    const directory = path.join(f.base, 'sign-in', role);
    fs.mkdirSync(directory, { recursive: true });
    return [role, directory];
  })));
  const profile = path.join(f.base, 'profile');
  const environment = {
    SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATHEXT: '.COM;.EXE', PATH: 'C:\\Windows\\System32',
    USERPROFILE: profile, HOMEDRIVE: 'C:', HOMEPATH: '\\profile', APPDATA: path.join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(profile, 'AppData', 'Local'), GITHUB_TOKEN: 'fixture-credential-never-read', USERNAME: 'fixture-user-never-read',
  };
  /** @param {string} login */
  const signIn = (role, login) => ({ baseDirectory: bases[/** @type {'a' | 'b' | 'worker'} */ (role)], expectedAccount: { host: 'https://github.com', login } });
  const planV3 = {
    version: 3,
    expiresAt: f.plan.expiresAt,
    operator: f.plan.operator,
    coordinator: f.plan.coordinator,
    fixtureParent: f.fixtureParent,
    artifacts: { cli: f.cli, sdk: f.sdk, sdkAppliedAt: 'createSession' },
    models: { ...f.plan.models },
    auth: { kind: 'existing-sign-in', a: signIn('a', 'fixture-a'), b: signIn('b', 'Fixture-B'), worker: signIn('worker', 'fixture-w') },
    tls: structuredClone(f.plan.tls),
    transport: { ...f.plan.transport },
    progress: { a: { ...PROGRESS_FIXTURES.a }, b: { ...PROGRESS_FIXTURES.b } },
    capture: { slug: 'delta' },
  };
  return { ...f, planV3, bases, environment };
}

/** @param {ReturnType<typeof fixtureV3>} f @param {unknown} plan @param {Record<string, unknown>} [extra] */
function previewV3(f, plan, extra = {}) {
  return /** @type {{report: any, exitCode: number, scope: any}} */ (previewQualification(plan, { now: NOW, repoRoot: f.repo, platform: 'win32',
    environment: f.environment, ...extra }));
}

/** The selected values a preview binds from `environment`: the selected names it has, with HOME from USERPROFILE when absent. @param {Record<string, string>} environment */
function selectedValues(environment) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const name of APPROVED_NAMES) if (environment[name] !== undefined) values[name] = environment[name];
  values.HOME ??= values.USERPROFILE;
  return values;
}

/** Every version-3 preview keeps these: no grant, every stage blocked, nothing observed, strict isolation deferred. @param {any} report */
function assertNormalPreviewBlocked(report) {
  assert.equal(report.version, 3);
  assert.ok(['blocked', 'invalid'].includes(report.verdict), report.verdict);
  assert.equal(report.permission.grant, 'missing');
  assert.deepEqual(report.stages.map((/** @type {any} */ stage) => stage.id), V3_STAGE_IDS);
  for (const stage of report.stages) {
    assert.equal(stage.status, 'blocked', stage.id);
    assert.ok(stage.blockedBy.includes('native_permission'), stage.id);
    assert.equal(stage.blockedBy.at(-1), 'native_run_not_started', stage.id);
  }
  assert.deepEqual(report.proof.map((/** @type {any} */ entry) => [entry.id, entry.status]),
    V3_PROOF_IDS.map((id) => [id, id === 'native_permission' ? 'missing' : 'unverified']));
  assert.deepEqual([report.nativeBranch.id, report.nativeBranch.status], ['native_run_not_started', 'implemented_unverified']);
  assert.deepEqual({ ...report.strict, detail: undefined }, { status: 'deferred', executed: false, passed: false, checks: STRICT_CHECKS, detail: undefined },
    'strict isolation is deferred: not run and not passed');
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /"(?:status|verdict|grant)":"(?:pass|passed|qualified|collaboration_qualified|success|granted|available|observed|verified)"/);
  assert.equal(text.includes('fixture-credential-never-read') || text.includes('GITHUB_TOKEN') || text.includes('fixture-user-never-read'), false,
    'no unselected variable, credential-shaped or not, reaches the report');
}

test('a complete version-3 plan previews as blocked for normal collaboration only: it binds this runner and the native branch, the rendered core, the latch manifest, each resolved base directory and account, and the selected environment, and discloses every normal effect whole without the product cap', () => {
  const f = fixtureV3();
  const before = tree(f.base);
  const { report, exitCode, scope } = previewV3(f, f.planV3);
  assert.equal(exitCode, EXIT.blocked);
  assert.equal(report.verdict, 'blocked', JSON.stringify(report.checks.filter((/** @type {any} */ entry) => !['ok', 'not_inspected'].includes(entry.status))));
  assertNormalPreviewBlocked(report);
  for (const entry of report.checks) assert.ok(['ok', 'not_inspected'].includes(entry.status), JSON.stringify(entry));
  assert.deepEqual(report.checks.filter((/** @type {any} */ entry) => entry.status === 'not_inspected').map((/** @type {any} */ entry) => entry.id),
    ['tls.a.certFile', 'tls.a.keyFile', 'tls.b.certFile', 'tls.b.keyFile'], 'only TLS files are named; no credential file exists for this branch');
  assert.match(only(report, 'version').detail, /normal collaboration through each role's existing saved sign-in, with strict isolation deferred/);
  assert.deepEqual(Object.keys(report.artifacts), ['cli', 'sdk'], 'no runtime payload');
  assert.match(report.effects, /^none: no SDK import or construction, account lookup, runtime, session, model, listener, connection, credential or TLS read, approval, write, kill, or deletion occurred; /);

  // The digest binds this runner and the native branch (not the observer, which a normal run never starts), the rendered core, and the latch manifest.
  assert.deepEqual(Object.keys(report.scope.sources), ['qualifier', 'native']);
  for (const [name, file] of [['qualifier', 'qualify-collaboration.mjs'], ['native', 'native-collaboration.mjs']]) {
    const bytes = fs.readFileSync(path.join(HERE, file));
    assert.deepEqual(report.scope.sources[name], { path: path.join(HERE, file), bytes: bytes.length, sha256: sha256(bytes) }, name);
  }
  const core = renderedCore(REPOSITORY);
  assert.deepEqual(report.scope.core, { files: core.files, bytes: core.bytes, sha256: core.sha256 });
  const latch = fixtureManifest(ZERO_RUN, 2);
  assert.deepEqual(JSON.parse(latch.bytes.toString('utf8')), { version: 2, runId: ZERO_RUN }, 'the latch manifest is exactly {version: 2, runId}');
  assert.deepEqual([latch.sources, latch.canaries, latch.canaryBytes], [[], 0, 0], 'no canary is named or copied');
  assert.notEqual(latch.sha256, fixtureManifest(ZERO_RUN).sha256, 'the strict manifest is another fixture');
  assert.deepEqual(report.scope.fixture, { manifestTemplateSha256: latch.sha256, folders: ['a/w', 'a/t', 'b/w', 'b/t', 'q', 'p'] });
  const resolved = /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(f.bases).map(([role, dir]) => [role, fs.realpathSync.native(dir)])));
  assert.deepEqual(report.scope.signIn.auth, {
    a: { baseDirectory: resolved.a, expectedAccount: { host: 'https://github.com', login: 'fixture-a' } },
    b: { baseDirectory: resolved.b, expectedAccount: { host: 'https://github.com', login: 'Fixture-B' } },
    worker: { baseDirectory: resolved.worker, expectedAccount: { host: 'https://github.com', login: 'fixture-w' } },
  });
  const values = selectedValues(f.environment);
  assert.equal(values.HOME, f.environment.USERPROFILE, 'HOME, absent here, is USERPROFILE');
  assert.deepEqual(report.scope.signIn.environment, { names: APPROVED_NAMES, sha256: sha256(canonicalJson(values)) },
    'the selected values are bound by digest, never shown whole');

  // The in-process scope carries exactly what was shown, and no credential or strict field.
  assert.equal(scope.scopeSha256, report.scopeSha256);
  assert.equal(scope.version, 3);
  assert.deepEqual(scope.values.auth, { kind: 'existing-sign-in', ...report.scope.signIn.auth });
  assert.deepEqual(scope.values.environment, { names: APPROVED_NAMES, values });
  for (const absent of ['credentials', 'runtimePayload']) assert.equal(absent in scope.values, false, absent);
  assert.deepEqual(scope.strict, report.strict);
  assert.deepEqual(scope.plannedEffects, report.plannedEffects);

  // The complete normal-effects disclosure, shown before consent: every normal effect is named, never hidden behind the sign-in.
  const effects = Object.fromEntries(report.plannedEffects.map((/** @type {any} */ entry) => [entry.scope, entry.detail]));
  assert.deepEqual(Object.keys(effects), V3_EFFECTS);
  for (const [scopeId, parts] of /** @type {Array<[string, string[]]>} */ ([
    ['preparation', [path.join(f.fixtureParent, 'a', 't'), path.join(f.fixtureParent, 'q'), 'latch-only qualification manifest {"version":2,"runId":<this run>}',
      'must pass the product\'s own configuration parser', 'No canary, control runtime, Canvas preference file, home folder, or configuration folder is created',
      'this runner writes nothing to the real home or configuration']],
    ['native_startup', ['normal copilot-cli mode, with the logged-in user on and no token', `A with base directory (COPILOT_HOME) ${resolved.a}`,
      `B with ${resolved.b}`, `holds only ${APPROVED_NAMES.join(', ')} as this process holds them`, `HOME ${values.HOME}`, `APPDATA ${values.APPDATA}`,
      `LOCALAPPDATA ${values.LOCALAPPDATA}`, 'every value bound by the scope digest and rechecked before each runtime starts',
      'each other name Windows would supply blank', 'TEMP, TMP, and TMPDIR set to its own a/t or b/t', 'configured off, which nothing here certifies']],
    ['normal_runtime_effects', ['Normal mode is not isolation', 'resolves its own stored OAuth or GitHub CLI sign-in',
      'reads its normal home and configuration', 'writes its normal logs, configuration, and session storage there',
      'Each normal runtime may also start the owner\'s configured MCP servers and plugins',
      'B\'s worker model can still call only its two evidence tools, dude_a2a_evidence_inventory and dude_a2a_evidence_read',
      'reads, copies, shows, and stores no credential', 'kept, never deleted', 'real Canvas preferences', 'No observer runs']],
    ['accounts', ['Before any prompt, and again before every later prompt', 'getAuthStatus', 'gitHubAuth.getStatus', 'by user or gh-cli',
      'A fixture-a at https://github.com', 'B Fixture-B at https://github.com', 'fixture-w at https://github.com', 'auth_unavailable', 'auth_required',
      'auth_mismatch', 'Nothing logs in, switches accounts, retries in another session, or falls back', 'not an account lock']],
    ['tls_reads', ['No credential file is named or read']],
    ['transport_and_approval', [`at most ${A2A_PROPOSAL_BYTES} bytes`, 'WORKER with its existing sign-in and expected account', 'only that entered line, without surrounding spaces, is sent']],
    ['model_calls', ['fixture-model-a', 'fixture-model-b', 'fixture-model-worker', 'the lifecycle records it reads']],
    ['worker', [`base directory ${resolved.worker}`, 'every permission denied', 'version-2 readiness', 'both accounts', 'latch-only',
      'no canary, probe, or ambient count is run or reported', 'Product cessation stays unconfirmed and its storage is kept']],
    ['cancellation_and_teardown', ['its stop must report no errors', 'a stop that reports errors, fails, or overruns fails the run',
      'cessation is reported unconfirmed', 'the real home, configuration, logs, and session storage are never deleted']],
    ['permissions', mainRelayParts('delta')],
    ['deferred_strict', ['not run and not passed', 'collaboration_qualified only']],
  ])) {
    for (const part of parts) assert.ok(effects[scopeId].includes(part), `${scopeId}: ${part}`);
  }
  for (const [scopeId, detail] of Object.entries(effects)) {
    if (scopeId !== 'deferred_strict') assert.doesNotMatch(detail, /after-view|canary recognition through|windows-etw|explicit credential|logged-in user off/, scopeId);
  }
  const disclosed = Buffer.byteLength(report.plannedEffects.map((/** @type {any} */ entry) => entry.detail).join('\n'), 'utf8');
  assert.ok(disclosed > A2A_PROPOSAL_BYTES, `the qualifier's own complete disclosure (${disclosed} bytes) is separately authorized: no product cap cuts it`);
  assert.ok(Buffer.byteLength(`${JSON.stringify(report, null, 2)}\n`) <= QUALIFICATION_LIMITS.reportBytes, 'and the report stays within its own bound');

  // Effect-free: nothing created, changed, imported, or read beyond metadata.
  assert.deepEqual(tree(f.base), before, 'the preview created, changed, and removed nothing');
  assert.equal(fs.existsSync(f.fixtureParent), false);
  assert.equal(fs.existsSync(f.marker), false, 'the SDK was hashed, never imported');

  // At maximal values the complete disclosure still fits the report's own bound, and the plan its own; nothing is truncated to fit.
  /** @param {string} label */
  const longPath = (label) => {
    const prefix = path.join(f.owners, label);
    return path.join(prefix, 'x'.repeat(QUALIFICATION_LIMITS.pathBytes - Buffer.byteLength(prefix) - 1));
  };
  const maximal = clone(f.planV3);
  Object.assign(maximal, { operator: 'o'.repeat(QUALIFICATION_LIMITS.labelBytes), coordinator: 'c'.repeat(QUALIFICATION_LIMITS.labelBytes),
    models: { a: 'a'.repeat(128), b: 'b'.repeat(128), worker: 'w'.repeat(128) },
    tls: { a: { certFile: longPath('a2'), keyFile: longPath('a3') }, b: { certFile: longPath('b2'), keyFile: longPath('b3') } } });
  for (const role of /** @type {const} */ (['a', 'b', 'worker'])) maximal.auth[role].expectedAccount.login = 'l'.repeat(256);
  const maximalEnvironment = { ...f.environment, HOME: longPath('h'), USERPROFILE: longPath('u'), APPDATA: longPath('r'), LOCALAPPDATA: longPath('l') };
  const big = previewV3(f, maximal, { environment: maximalEnvironment }).report;
  assert.equal(big.verdict, 'blocked', JSON.stringify(big.checks.filter((/** @type {any} */ entry) => !['ok', 'not_inspected'].includes(entry.status))));
  const bigBytes = Buffer.byteLength(`${JSON.stringify(big, null, 2)}\n`);
  assert.ok(bigBytes <= QUALIFICATION_LIMITS.reportBytes, `a maximal complete version-3 report is ${bigBytes} bytes`);
  assert.ok(Buffer.byteLength(JSON.stringify(maximal, null, 2)) <= QUALIFICATION_LIMITS.planBytes, 'a maximal version-3 plan fits the plan bound');
  assert.ok(big.plannedEffects.find((/** @type {any} */ entry) => entry.scope === 'native_startup').detail.includes(`HOME ${maximalEnvironment.HOME}`),
    'each location is shown whole');

  // The digest binds each selected value, each resolved base directory, and each account; an unselected variable changes nothing.
  assert.equal(previewV3(f, f.planV3).report.scopeSha256, report.scopeSha256, 'the same inputs repeat the digest');
  for (const [label, environment] of /** @type {Array<[string, Record<string, string>]>} */ ([
    ['another PATH, whose value is never shown', { ...f.environment, PATH: 'C:\\Windows' }],
    ['another APPDATA', { ...f.environment, APPDATA: path.join(f.base, 'elsewhere') }],
    ['an explicit HOME', { ...f.environment, HOME: path.join(f.base, 'home') }],
  ])) {
    assert.notEqual(previewV3(f, f.planV3, { environment }).report.scopeSha256, report.scopeSha256, label);
  }
  assert.equal(previewV3(f, f.planV3, { environment: { ...f.environment, GITHUB_TOKEN: 'other', USERNAME: 'other', GH_TOKEN: 'x' } }).report.scopeSha256,
    report.scopeSha256, 'unselected and credential variables are never read, so they bind nothing');
  const otherLogin = clone(f.planV3);
  otherLogin.auth.worker.expectedAccount.login = 'fixture-w2';
  assert.notEqual(previewV3(f, otherLogin).report.scopeSha256, report.scopeSha256);
  const moved = path.join(f.base, 'sign-in', 'a2');
  fs.mkdirSync(moved);
  const otherBase = clone(f.planV3);
  otherBase.auth.a.baseDirectory = moved;
  assert.notEqual(previewV3(f, otherBase).report.scopeSha256, report.scopeSha256);
  const v2 = /** @type {any} */ (preview(f, f.planV2));
  assert.notEqual(v2.report.scopeSha256, report.scopeSha256, 'a strict digest never stands for a normal scope');
});

test('a version-3 preview states what native attempts reached, passes nothing, and keeps no never-run or fake-only claim', async (context) => {
  const f = fixtureV3();
  const { report } = previewV3(f, f.planV3);
  assertNormalPreviewBlocked(report);
  const proof = /** @type {Record<string, string>} */ (Object.fromEntries(report.proof.map((/** @type {any} */ entry) => [entry.id, entry.detail])));
  for (const [label, text, pattern] of /** @type {Array<[string, string, RegExp]>} */ ([
    ['account answers were observed natively, and no run passed', proof.account_observation,
      /Native attempts have observed these answers, host form included, for both mains and B's worker, but no run has passed; a pass would be a point-in-time observation, not an account lock\.$/],
    ['the served worker reached readiness and admission, never the held call', proof.served_worker_observation,
      /A native attempt's worker recorded its readiness, which matched those checks, and its admission, then ended with unexpected_native_effect before worker_evidence_pending\.$/],
    ['loader records matched natively, and that attempt did not pass', proof.actual_sdk_use,
      /A native attempt's records matched its plan's SDK files, but that attempt did not pass\.$/],
    ['the native branch has run natively and passed nothing', report.nativeBranch.detail,
      /Native attempts have reached both mains' account checks, both proposals and approvals, and B's worker readiness, but none has passed, and no preview result stands in for a run\./],
  ])) {
    await context.test(label, () => assert.match(text, pattern));
  }
  await context.test('no claim that only fake SDKs ran or that nothing ran natively', () => {
    assert.doesNotMatch(JSON.stringify([report.proof, report.nativeBranch]), /Only fake SDKs have produced|No native run has produced|It has never run natively|account answers, including its host form, are unobserved/);
  });
});

test('the preview reads only the selected environment names, and only for version 3; versions 1 and 2 read none, and their digests stay independent of it', () => {
  const f = fixtureV3();
  /** @type {string[]} */
  const reads = [];
  /** @param {Record<string, string>} values */
  const watched = (values) => new Proxy(values, {
    get(target, key) { reads.push(String(key)); return Reflect.get(target, key); },
    has(target, key) { reads.push(`has:${String(key)}`); return Reflect.has(target, key); },
    ownKeys(target) { reads.push('ownKeys'); return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { reads.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
  for (const plan of [f.plan, f.planV2]) {
    const first = /** @type {any} */ (preview(f, plan, { environment: watched(f.environment) })).report;
    const second = /** @type {any} */ (preview(f, plan, { environment: watched({ ...f.environment, PATH: 'other' }) })).report;
    assert.equal(first.scopeSha256, second.scopeSha256, `version ${plan.version}`);
  }
  assert.deepEqual(reads, [], 'a strict or version-1 preview never touches the environment');
  previewV3(f, f.planV3, { environment: watched(f.environment) });
  assert.deepEqual([...SIGN_IN_ENVIRONMENT], APPROVED_NAMES, 'the selection is exactly the approved names');
  assert.deepEqual([...new Set(reads)].sort(), [...APPROVED_NAMES].sort(), 'only the approved names are read, never enumerated');
});

test('a version-3 plan is closed: strict fields refuse as another branch\'s, unknown or misplaced sign-in fields refuse, each base directory, host, and login follows the product\'s rules, and an unusable environment or non-Windows host refuses', () => {
  const f = fixtureV3();
  const file = path.join(f.tools, 'not-a-directory.txt');
  fs.writeFileSync(file, 'x');
  const insideRepo = path.join(f.repo, 'copilot-home');
  fs.mkdirSync(insideRepo);
  const outer = path.join(f.base, 'outer');
  fs.mkdirSync(outer);
  let junction = '';
  try {
    junction = path.join(f.base, 'sign-in-link');
    fs.symlinkSync(f.bases.a, junction, 'junction');
  } catch {
    junction = '';
  }
  const longBase = path.join(f.base, 'x'.repeat(Math.max(1, QUALIFICATION_LIMITS.pathBytes + 1 - Buffer.byteLength(f.base) - 1)));
  /** @type {Array<[string, (plan: any) => void, string, string]>} */
  const cases = [
    ['credential files', (plan) => { plan.credentials = { a: path.join(f.owners, 'a.txt'), b: path.join(f.owners, 'b.txt'), worker: path.join(f.owners, 'w.txt') }; },
      'branch', 'refused'],
    ['the strict observation', (plan) => { plan.observation = 'windows-etw'; }, 'branch', 'refused'],
    ['a runtime payload', (plan) => { plan.artifacts.runtimePayload = null; }, 'branch', 'refused'],
    ['another sign-in kind', (plan) => { plan.auth.kind = 'token'; }, 'auth.kind', 'invalid'],
    ['no worker sign-in', (plan) => { delete plan.auth.worker; }, 'auth.worker.baseDirectory', 'missing'],
    ['no expected login', (plan) => { delete plan.auth.b.expectedAccount.login; }, 'auth.b.expectedAccount.login', 'missing'],
    ['a relative base directory', (plan) => { plan.auth.a.baseDirectory = 'sign-in/a'; }, 'auth.a.baseDirectory', 'invalid'],
    ['an unnormalized base directory', (plan) => { plan.auth.a.baseDirectory = `${f.bases.a}${path.sep}`; }, 'auth.a.baseDirectory', 'invalid'],
    ['an absent base directory', (plan) => { plan.auth.b.baseDirectory = path.join(f.base, 'absent'); }, 'auth.b.baseDirectory', 'invalid'],
    ['a file as base directory', (plan) => { plan.auth.b.baseDirectory = file; }, 'auth.b.baseDirectory', 'invalid'],
    ['a base directory inside the repository', (plan) => { plan.auth.worker.baseDirectory = insideRepo; }, 'auth.worker.baseDirectory', 'refused'],
    ['a base directory holding the repository', (plan) => { plan.auth.worker.baseDirectory = f.base; }, 'auth.worker.baseDirectory', 'refused'],
    ['a base directory holding the fixture', (plan) => {
      plan.fixtureParent = path.join(outer, 'qualification');
      plan.auth.worker.baseDirectory = outer;
    }, 'auth.worker.baseDirectory', 'refused'],
    ['an oversized base directory', (plan) => { plan.auth.a.baseDirectory = longBase; }, 'auth.a.baseDirectory', 'invalid'],
    ['plain HTTP', (plan) => { plan.auth.a.expectedAccount.host = 'http://github.com'; }, 'auth.a.expectedAccount.host', 'invalid'],
    ['a host with a path', (plan) => { plan.auth.a.expectedAccount.host = 'https://github.com/'; }, 'auth.a.expectedAccount.host', 'invalid'],
    ['a bare host name', (plan) => { plan.auth.a.expectedAccount.host = 'github.com'; }, 'auth.a.expectedAccount.host', 'invalid'],
    ['a host with a user', (plan) => { plan.auth.a.expectedAccount.host = 'https://someone@github.com'; }, 'auth.a.expectedAccount.host', 'invalid'],
    ['an uppercase host', (plan) => { plan.auth.a.expectedAccount.host = 'https://GitHub.com'; }, 'auth.a.expectedAccount.host', 'invalid'],
    ['an empty login', (plan) => { plan.auth.b.expectedAccount.login = ''; }, 'auth.b.expectedAccount.login', 'invalid'],
    ['a padded login', (plan) => { plan.auth.b.expectedAccount.login = ' fixture-b'; }, 'auth.b.expectedAccount.login', 'invalid'],
    ['a control character in a login', (plan) => { plan.auth.b.expectedAccount.login = 'fixture\u0007b'; }, 'auth.b.expectedAccount.login', 'invalid'],
    ['an oversized login', (plan) => { plan.auth.b.expectedAccount.login = 'l'.repeat(257); }, 'auth.b.expectedAccount.login', 'invalid'],
    ['a version-1 progress action', (plan) => { plan.progress.a = 'Append one line'; }, 'progress.a', 'invalid'],
  ];
  if (junction) cases.push(['a linked base directory', (plan) => { plan.auth.a.baseDirectory = junction; }, 'auth.a.baseDirectory', 'invalid']);
  for (const [label, mutate, id, status] of cases) {
    const plan = clone(f.planV3);
    mutate(plan);
    const { report, exitCode, scope } = previewV3(f, plan);
    assert.equal(exitCode, EXIT.invalid, label);
    assertNormalPreviewBlocked(report);
    assert.equal(only(report, id).status, status, `${label}: ${JSON.stringify(report.checks.filter((/** @type {any} */ entry) => entry.status !== 'ok'))}`);
    assert.deepEqual([report.scopeSha256, scope, report.plannedEffects], [null, null, []], `${label}: nothing to consent to`);
  }
  const mixed = previewV3(f, { ...clone(f.planV3), credentials: { a: 'x', b: 'y', worker: 'z' }, observation: 'windows-etw' }).report;
  assert.deepEqual(checksFor(mixed, 'plan.unknown').map((/** @type {any} */ entry) => /^unknown key (\S+):/.exec(entry.detail)?.[1]).sort(),
    ['credentials', 'observation'], 'strict fields are unknown in version 3');
  const nested = clone(f.planV3);
  /** @type {any} */ (nested.auth.a).token = 'x';
  /** @type {any} */ (nested.auth.worker.expectedAccount).provider = 'byok';
  /** @type {any} */ (nested.auth).fallback = 'token';
  assert.deepEqual(checksFor(previewV3(f, nested).report, 'plan.unknown').map((/** @type {any} */ entry) => /^unknown key (\S+):/.exec(entry.detail)?.[1]).sort(),
    ['auth.a.token', 'auth.fallback', 'auth.worker.expectedAccount.provider']);
  const refusedText = JSON.stringify(previewV3(f, { ...clone(f.planV3), auth: { ...clone(f.planV3).auth, a: { baseDirectory: f.bases.a,
    expectedAccount: { host: 'http://refused.example', login: 'fixture-a' } } } }).report);
  assert.equal(refusedText.includes('refused.example'), false, 'a refused host is never echoed');

  // The strict branches stay closed to the sign-in fields: a version-2 or version-1 plan carrying them refuses, unchanged.
  for (const plan of [{ ...clone(f.planV2), auth: clone(f.planV3.auth) }, { ...clone(f.plan), auth: clone(f.planV3.auth) }]) {
    const { report, scope } = /** @type {any} */ (preview(f, plan));
    assert.deepEqual(checksFor(report, 'plan.unknown').map((/** @type {any} */ entry) => /^unknown key (\S+):/.exec(entry.detail)?.[1]), ['auth'], `v${plan.version}`);
    assert.equal(scope ?? null, null);
    assertNothingQualified(report);
  }

  // The environment must hold usable locations, and the branch runs only on Windows.
  const { USERPROFILE: _profile, ...noProfile } = f.environment;
  for (const [label, environment] of /** @type {Array<[string, Record<string, string>]>} */ ([
    ['no USERPROFILE', noProfile],
    ['a relative APPDATA', { ...f.environment, APPDATA: 'AppData\\Roaming' }],
    ['no LOCALAPPDATA', Object.fromEntries(Object.entries(f.environment).filter(([name]) => name !== 'LOCALAPPDATA'))],
    ['a relative HOME', { ...f.environment, HOME: 'home' }],
  ])) {
    const { report, scope } = previewV3(f, f.planV3, { environment });
    assert.equal(only(report, 'environment').status, 'invalid', label);
    assert.equal(scope, null, label);
  }
  const linux = previewV3(f, f.planV3, { platform: 'linux' });
  assert.equal(only(linux.report, 'host.platform').status, 'refused');
  assert.equal(linux.scope, null);
  assert.equal(fs.existsSync(f.marker), false);
});

test('the native branch takes a complete version-3 scope, and without an interactive terminal refuses at consent: nothing is prepared, imported, read, or started, and it never exits 0 here', () => {
  const f = fixtureV3();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString().slice(0, 19) + 'Z';
  const planFile = path.join(f.base, 'plan-v3.json');
  const planBytes = Buffer.from(JSON.stringify({ ...clone(f.planV3), expiresAt }));
  fs.writeFileSync(planFile, planBytes);
  const incompleteFile = path.join(f.base, 'plan-v3-incomplete.json');
  const incomplete = clone(f.planV3);
  delete (/** @type {any} */ (incomplete.auth)).worker;
  fs.writeFileSync(incompleteFile, JSON.stringify({ ...incomplete, expiresAt }));
  // The child gets made-up locations below the test folder and only what Windows needs to start Node: no inherited credential or setting.
  const env = { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', windir: process.env.windir ?? 'C:\\Windows', PATH: path.dirname(process.execPath),
    USERPROFILE: f.environment.USERPROFILE, APPDATA: f.environment.APPDATA, LOCALAPPDATA: f.environment.LOCALAPPDATA,
    TEMP: os.tmpdir(), TMP: os.tmpdir() };
  const before = tree(f.base);
  /** @param {string[]} args */
  const run = (args) => spawnSync(process.execPath, [QUALIFIER, ...args], { cwd: f.base, encoding: 'utf8', timeout: 60_000, input: '', env });

  const previewed = run(['--plan', planFile]);
  assert.equal(previewed.status, process.platform === 'win32' ? EXIT.blocked : EXIT.invalid, previewed.stderr);
  const shown = JSON.parse(previewed.stdout);
  assert.equal(shown.version, 3);

  const refused = run(['--native', '--plan', incompleteFile]);
  assert.equal(refused.status, EXIT.invalid, refused.stderr);
  const refusedReport = JSON.parse(refused.stdout);
  assert.deepEqual([refusedReport.mode, refusedReport.verdict, refusedReport.nativeBranch.id], ['native_refused', 'invalid', 'native_run_not_started']);
  assertNormalPreviewBlocked(refusedReport);

  const consentAsked = run(['--native', '--plan', planFile]);
  assert.equal(consentAsked.status, process.platform === 'win32' ? EXIT.failed : EXIT.invalid, consentAsked.stderr);
  assert.equal(consentAsked.stderr, '', 'redirected input sees no scope prompt and is never asked for consent');
  if (process.platform === 'win32') {
    const report = JSON.parse(consentAsked.stdout);
    assert.deepEqual([report.version, report.mode, report.verdict, report.reason, report.consent.status], [3, 'native', 'refused', 'consent_not_interactive',
      'not_given']);
    assert.deepEqual([report.layer, report.effects, report.checks, report.accounts], ['native', 'none yet', [], {}]);
    assert.deepEqual(report.phases.map((/** @type {any} */ entry) => [entry.id, entry.status]), [['consent', 'failed']], 'only the consent ask, refused');
    assert.deepEqual([report.strict.status, report.strict.executed, report.strict.passed], ['deferred', false, false]);
    for (const absent of ['observer', 'canaries', 'control']) assert.equal(absent in report, false, `${absent}: a normal run starts no strict step`);
    assert.equal(report.scopeSha256, shown.scopeSha256, 'the native branch asks about exactly the previewed scope');
    assert.deepEqual(report.plan, { file: planFile, bytes: planBytes.length, sha256: sha256(planBytes) });
  }
  assert.deepEqual(tree(f.base), before, 'nothing was created, changed, or removed');
  assert.equal(fs.existsSync(f.fixtureParent), false);
  assert.equal(fs.existsSync(f.marker), false, 'the SDK was never imported');
  // The same scope through the exported entry: a version-3 plan is the only route to a normal run, and nativeScope binds it.
  const scoped = nativeScope({ file: planFile, repoRoot: f.repo, environment: f.environment, platform: 'win32' });
  assert.equal(scoped.scope?.version, 3);
});

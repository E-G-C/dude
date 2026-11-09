#!/usr/bin/env node
// @ts-check
/**
 * Work driver: host integration for autonomous Lightweight Work through the
 * official setup adapter and runner. It claims one pending task, or freshly
 * admits a new request for an unblocked in-progress task from its original
 * owner's own terminal handoff, bridges the runner's sequential challenges
 * through files outside the workspace, builds and preflights responses with the
 * official validators, captures attempt baselines, and probes one ownership pair.
 *
 * Every authority decision stays with the co-versioned runtime imported below.
 * The driver composes its exports, makes no model call, dispatches no
 * specialist, and adds no command grammar, lane, board, or project state.
 *
 * Exit codes: 0 success; 64 usage error; 70 unexpected failure.
 *   claim      2 refused before any claim, 3 admission refused, 4 refused before
 *              a lane write with its own pair released, 5 stopped with the pair
 *              retained or after a lane write
 *   run        1 runner hard stop, 2 refused before the runner started
 *   assess, respond, snapshot, diff
 *              1 refused; nothing was published
 *   ownership  1 pair present, 2 refused or probe failed
 */

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { resolveFeatureOwner, resolveIdeaSelector } from '../dude-engine/lib/feature.mjs';
import { readTaskState } from '../dude-engine/lib/task-state.mjs';
import { parseVisibleTasks, readyTasks } from '../dude-engine/lib/tasks.mjs';
import { isMainModule } from '../dude-engine/lib/text.mjs';
import { WORKSPACE_PATHS, resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import { runHostAdapter } from './host-adapter-runner.mjs';
import {
  createHostAdapter,
  createTemporaryCheckpointStore,
  prepareSpecialistResult,
  validateHostAdapterRequest,
  validateTerminalDispositionV1,
  validateTerminalEvidenceManifestV1,
} from './host-adapter.mjs';
import {
  TERMINAL_HANDOFF_FILES,
  assertDenseDataArrayLength,
  buildTerminalFreshClaimMutationV1,
  canonicalJson,
  canonicalTarget,
  capacityDiagnostic,
  capturedBytesV1,
  contentDescriptor,
  currentRunCapture,
  deriveFreshAdmissionV1,
  inspectRetainedOccurrencesV2,
  parseInvocation,
  prepareLearningReviewV2,
  requiredChecksForAction,
  runCommand,
  sha256,
  validateAssessment,
  validateInspection,
  validateMaterialInputsV1,
  validateRunState,
} from './recovery.mjs';

const USAGE = `usage:
  node driver.mjs claim --root <workspace> --spec <specPath> --task <taskKey> [--out <dir>] [--state <accepted-state.json>] [--retained-evidence <file>] [--terminal-evidence <terminal-evidence.json>] -- <work arguments>
  node driver.mjs run --request <runner-request.json> [--dir <dir>] [--retained-evidence <file>]
  node driver.mjs assess --root <workspace> --challenge <challenge-n.json> --input <file>
  node driver.mjs respond --root <workspace> --challenge <challenge-n.json> (--tester <file> --reviewer <file> --changed <file> | --learning-review <file> | --cancel)
  node driver.mjs snapshot --root <workspace> --out <file>
  node driver.mjs diff --root <workspace> --baseline <file> --challenge <challenge-n.json> --out <file>
  node driver.mjs ownership --root <workspace> --spec <specPath> --task <taskKey>
`;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CHALLENGE_KINDS = ['assessment', 'specialist-pair', 'learning-review'];
const ASSESSMENT_INPUT_FIELDS = ['action', 'targets', 'summary', 'intent', 'equivalence', 'retention'];
const RETAINED_STREAMS = ['currentRun', 'verification', 'review', 'lint'];
const TERMINAL_FIELDS = [
  'detail', 'target', 'blocker', 'capacity', 'cleanup', 'cleanupReason', 'orphan', 'ownership', 'terminalDisposition',
];
// The fixed run-local files the runner's terminal retention may publish through this driver's sink.
const RETAINED_FILES = new Set([
  'retained-evidence.json', 'terminal-original.json', 'terminal-controls.json', 'terminal-fence.json',
  'terminal-effects.json', 'terminal-evidence.json', 'terminal-disposition.json',
]);
const MAX_RESPONSE_BYTES = 1_048_576; // the runner CLI's own per-response ceiling
const POLL_MS = 250;
const RENAME_RETRY_MS = 60_000;
const SCAN_SKIP = new Set(['.git', 'node_modules']);
const EMPTY_TASK_STATE = Buffer.from('{}\n');
// The one immutable run-local record that consumes a terminal-qualified runner request.
const REQUEST_USED_FILE = 'runner-request-used.json';
// The issuing claim's report, beside its request, that binds a terminal-qualified request.
const CLAIM_REPORT_FILE = 'setup-report.json';

class UsageError extends Error {}

/** A refusal: the command validated its input and published nothing further. */
class Refusal extends Error {
  /** @param {string} message @param {Record<string, unknown>} [details] */
  constructor(message, details = {}) {
    super(message);
    this.details = details;
  }
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run an official validator; its rejection becomes a refusal that publishes nothing.
 * @template T @param {() => T} validate @param {string} [hint] @returns {T}
 */
function checked(validate, hint) {
  try {
    return validate();
  } catch (error) {
    throw new Refusal(messageOf(error), hint === undefined ? {} : { hint });
  }
}

/** @param {unknown} value */
function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** UTF-8 byte order, the order every path set uses. @param {string} left @param {string} right */
function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

/** Canonical UTC without milliseconds, as lane snapshots and log lines require. */
function canonicalTime() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randomHex() {
  return randomBytes(32).toString('hex');
}

/**
 * Closed `--name value` options and bare `--flag`s. Only claim accepts Work
 * arguments, which follow a literal `--` and pass unchanged to parseInvocation.
 * @param {string[]} argv
 * @param {{options?:string[], flags?:string[], required?:string[], rest?:boolean}} spec
 */
function parseArgs(argv, { options = [], flags = [], required = [], rest = false }) {
  const separator = argv.indexOf('--');
  if (separator !== -1 && !rest) throw new UsageError("only claim accepts Work arguments after '--'");
  const own = separator === -1 ? argv : argv.slice(0, separator);
  /** @type {Record<string, string>} */
  const values = {};
  for (let index = 0; index < own.length; index += 1) {
    const token = own[index];
    if (!token.startsWith('--')) throw new UsageError(`unexpected argument '${token}'`);
    const name = token.slice(2);
    if (Object.hasOwn(values, name)) throw new UsageError(`option --${name} is given twice`);
    if (flags.includes(name)) {
      values[name] = 'true';
    } else if (options.includes(name)) {
      const value = own[index + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`option --${name} needs a value`);
      values[name] = value;
      index += 1;
    } else {
      throw new UsageError(`unknown option --${name}`);
    }
  }
  for (const name of required) {
    if (!Object.hasOwn(values, name)) throw new UsageError(`missing required option --${name}`);
  }
  return { values, rest: separator === -1 ? [] : argv.slice(separator + 1) };
}

/** @param {string} value */
function workspaceRoot(value) {
  let root;
  try {
    // The same resolution the runner applies, so identities and keys agree.
    root = fs.realpathSync(path.resolve(value));
  } catch {
    throw new Refusal(`workspace root does not exist: ${value}`);
  }
  if (!fs.statSync(root).isDirectory()) throw new Refusal(`workspace root is not a directory: ${root}`);
  return root;
}

/** @param {string} parent @param {string} candidate */
function contains(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ''
    || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Refuse a destination at or beneath the workspace, checking the lexical path
 * and the real path of its nearest existing ancestor before anything is created.
 * @param {string} root @param {string} value @param {string} label
 */
function outsideWorkspace(root, value, label) {
  const lexical = path.resolve(value);
  let existing = lexical;
  /** @type {string[]} */
  const missing = [];
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) {
    missing.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  const resolved = path.join(fs.realpathSync(existing), ...missing);
  if (contains(root, lexical) || contains(root, resolved)) {
    throw new Refusal(`${label} must be outside the workspace: ${lexical}`);
  }
  return lexical;
}

/**
 * A caller-named run directory must be new; the default is a fresh short
 * `dw-XXXXXX` directory under the operating system temporary directory. Either
 * way the run directory is private to its owner, as the checkpoint store's root
 * is; only that new directory is narrowed, never a parent.
 * @param {string} root @param {string|undefined} value @param {string} label
 */
function freshRunDirectory(root, value, label) {
  if (value === undefined) {
    const parent = outsideWorkspace(root, os.tmpdir(), `${label} default parent (the temporary directory)`);
    return fs.mkdtempSync(path.join(parent, 'dw-'));
  }
  const directory = outsideWorkspace(root, value, label);
  if (fs.existsSync(directory)) throw new Refusal(`${label} already exists; give a new directory: ${directory}`);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  fs.mkdirSync(directory, { mode: 0o700 });
  if (process.platform !== 'win32') {
    // Windows relies on inherited ACLs; no POSIX mode or ownership claim is made there.
    fs.chmodSync(directory, 0o700);
  }
  return directory;
}

/** @param {string} root @param {string} value @param {string} label */
function freshOutputFile(root, value, label) {
  const file = outsideWorkspace(root, value, label);
  if (fs.existsSync(file)) throw new Refusal(`${label} already exists: ${file}`);
  return file;
}

/** @param {string} file @param {string} label @returns {any} */
function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Refusal(`${label} is unreadable: ${messageOf(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Refusal(`${label} is not JSON: ${file}`);
  }
}

/**
 * Rename with the conventional Windows retry, as graceful-fs does: antivirus,
 * indexers, and concurrent readers can briefly hold a file and block a rename.
 * Elsewhere a rename failure is final.
 * @param {string} source @param {string} destination
 */
function renameRetrying(source, destination) {
  const deadline = Date.now() + RENAME_RETRY_MS;
  for (let delay = 10; ; delay = Math.min(delay * 2, 100)) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code ?? '';
      if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code) || Date.now() >= deadline) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
  }
}

/** The exact bytes publishJson writes for one value. @param {unknown} value */
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Publish one complete JSON file through a sibling temporary file and one
 * rename, so a poller never observes a partial message. Unless replacement is
 * explicit, an existing file is refused and its bytes stay untouched. As in the
 * checkpoint store, the temporary file is created owner-only, and the rename
 * keeps that mode on the published file.
 * @param {string} file @param {unknown} value @param {boolean} [replace]
 */
function publishJson(file, value, replace = false) {
  if (!replace && fs.existsSync(file)) throw new Refusal(`refusing to replace existing ${file}`);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(temporary, jsonText(value), { flag: 'wx', mode: 0o600 });
  try {
    renameRetrying(temporary, file);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Report the rename failure; a stray temporary file outside the workspace is inert.
    }
    throw error;
  }
  return file;
}

/**
 * The runner's trusted synchronous retention sink for one run directory. It
 * publishes only fixed producer-named files, each once through the existing
 * atomic publication, and reads every one back before acknowledging its exact
 * bytes. Failures are recorded here and rethrown; nothing is retried, replaced,
 * or removed. No durability beyond that publication is claimed.
 * @param {string} dir
 */
function retentionSink(dir) {
  /** @type {Map<string, {file:string, sha256:string, byteLength:number}>} */
  const written = new Map();
  /** @type {Map<string, unknown>} */
  const failures = new Map();
  /** @param {unknown} name */
  const fileFor = (name) => {
    if (typeof name !== 'string' || !RETAINED_FILES.has(name)) throw new Error('retention sink name is not a fixed run-local file');
    return path.join(dir, name);
  };
  const port = Object.freeze({
    /** @param {string} name @param {unknown} value */
    write(name, value) {
      try {
        const file = fileFor(name);
        const expected = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
        publishJson(file, value);
        const actual = fs.readFileSync(file);
        if (!actual.equals(expected)) throw new Error(`${name} did not read back exactly as published`);
        const descriptor = { name, sha256: sha256(actual), byteLength: actual.byteLength };
        written.set(name, { file, sha256: descriptor.sha256, byteLength: descriptor.byteLength });
        return descriptor;
      } catch (error) {
        failures.set(String(name), error);
        throw error;
      }
    },
    /** @param {string} name */
    read(name) {
      return fs.readFileSync(fileFor(name));
    },
  });
  return { port, written, failures };
}

/**
 * Detect the lane as Work does: any imported Beads issue selects Tracked
 * Execution; missing, uninitialized, or empty Beads leaves Lightweight. Any
 * other unreadable inventory is ambiguous. Read-only.
 * @param {string} root
 */
function detectLane(root) {
  const listed = spawnSync('bd', ['list', '--all', '--limit', '0', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  });
  if (listed.error) {
    const code = /** @type {NodeJS.ErrnoException} */ (listed.error).code ?? 'error';
    return code === 'ENOENT'
      ? { lane: 'lightweight', beads: 'not-installed' }
      : { lane: 'ambiguous', beads: `unavailable:${code}` };
  }
  if (listed.status !== 0) return { lane: 'lightweight', beads: 'uninitialized' };
  let issues;
  try {
    issues = JSON.parse(listed.stdout);
  } catch {
    return { lane: 'ambiguous', beads: 'unparseable' };
  }
  return Array.isArray(issues) && issues.length > 0
    ? { lane: 'tracked', beads: 'populated', issues: issues.length }
    : { lane: 'lightweight', beads: 'empty' };
}

/** @param {string} specPath @param {string} taskKey */
function exactTarget(specPath, taskKey) {
  const raw = { specPath, lane: 'lightweight', taskKey };
  const target = /** @type {{specPath:string,lane:'lightweight',taskKey:string}} */ (
    checked(() => canonicalTarget(raw))
  );
  if (canonicalJson(target) !== canonicalJson(raw)) throw new Refusal('target is not one canonical Lightweight task');
  return target;
}

/** Exactly one defined owner by exact spec_path and no resolver diagnostic. @param {string} root @param {string} specPath */
function exactOwner(root, specPath) {
  const resolved = resolveFeatureOwner({ root, specPath });
  if (resolved.diagnostics.length !== 0 || resolved.owner === null) {
    throw new Refusal(`no exact defined owner for ${specPath}`, { diagnostics: resolved.diagnostics });
  }
  return { ideaPath: resolved.owner.ideaPath, specPath: resolved.owner.specPath };
}

/** @param {string} specPath */
function tasksPathFor(specPath) {
  return `${specPath.slice(0, -'spec.md'.length)}tasks.md`;
}

/** The runtime input the runner itself builds before any capture exists. @param {string} root @param {{specPath:string}} target */
function emptyRuntimeInput(root, target) {
  return {
    root,
    specPath: target.specPath,
    target: { ...target },
    lane: { kind: 'lightweight' },
    currentRun: [],
    review: [],
    verification: [],
    lint: [],
    policyMode: 'autonomous',
  };
}

/**
 * The claim's runtime input: the runner's empty input, or that input carrying
 * the retained original captures exactly as given, in order and with duplicates.
 * @param {string} root @param {{specPath:string}} target @param {Record<string, unknown[]>|null} retained
 */
function runtimeInput(root, target, retained) {
  const input = emptyRuntimeInput(root, target);
  if (retained === null) return input;
  return { ...input, ...Object.fromEntries(RETAINED_STREAMS.map((field) => [field, [...retained[field]]])) };
}

/** The identity of the four capture streams one input or retained-evidence object carries. @param {Record<string, unknown>} value */
function capturesHash(value) {
  return sha256(canonicalJson(Object.fromEntries(RETAINED_STREAMS.map((field) => [field, value[field]]))));
}

/**
 * Read the owner-selected original captures of a task whose lane history
 * already holds attempts: the closed four-stream object `run` and the runner
 * accept. Only that envelope is checked here; the runtime Inspection validates
 * every capture before any claim.
 * @param {string} file @returns {Record<string, unknown[]>}
 */
function readRetainedEvidence(file) {
  const value = readJson(file, '--retained-evidence');
  if (!isRecord(value)) throw new Refusal('--retained-evidence is one JSON object');
  const unknown = Object.keys(value).filter((field) => !RETAINED_STREAMS.includes(field));
  const missing = RETAINED_STREAMS.filter((field) => !Object.hasOwn(value, field));
  if (unknown.length !== 0 || missing.length !== 0) {
    throw new Refusal('--retained-evidence has exactly these fields', { fields: RETAINED_STREAMS, unknown, missing });
  }
  for (const field of RETAINED_STREAMS) {
    checked(() => assertDenseDataArrayLength(value[field], `retainedEvidence.${field}`));
  }
  return value;
}

/** Freeze one validated JSON value throughout. @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * The exact bytes of one fixed run-local handoff file, or null when it is
 * absent, not a regular file, or unreadable. Nothing else is searched.
 * @param {string} file
 */
function readHandoffFile(file) {
  try {
    return fs.lstatSync(file).isFile() ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

/**
 * The terminal-qualified claim's read-only admission for an unblocked
 * in-progress task. It reads only the exact named manifest and its fixed
 * sibling handoff files, applies the producer's closed validators, observes the
 * exact pair through the official store, and returns the recovery derivation's
 * one decision. A refusal names exactly one first missing proof.
 * @param {string} root @param {string} file @param {{specPath:string,lane:'lightweight',taskKey:string}} target
 * @param {Record<string, unknown>} policy @param {ReturnType<typeof laneBinding>} binding
 * @param {Record<string, any>} report @param {{stage:string}} progress
 */
function terminalAdmission(root, file, target, policy, binding, report, progress) {
  progress.stage = 'terminal-evidence';
  const manifestFile = path.resolve(file);
  if (path.basename(manifestFile) !== 'terminal-evidence.json') {
    throw new Refusal('--terminal-evidence names the original owner\'s run-local terminal-evidence.json');
  }
  const directory = path.dirname(manifestFile);
  /** @type {Record<string, Buffer|null>} */
  const handoff = Object.fromEntries(TERMINAL_HANDOFF_FILES.map((name) => [name, readHandoffFile(path.join(directory, name))]));
  // A manifest or disposition outside the producer's closed contract is unusable evidence.
  for (const [name, validate] of /** @type {[string, (value:unknown)=>unknown][]} */ ([
    ['terminal-evidence.json', validateTerminalEvidenceManifestV1],
    ['terminal-disposition.json', validateTerminalDispositionV1],
  ])) {
    const bytes = handoff[name];
    if (bytes === null) continue;
    try {
      validate(JSON.parse(bytes.toString('utf8')));
    } catch {
      handoff[name] = null;
    }
  }
  report.terminalEvidence = { file: manifestFile };

  progress.stage = 'ownership';
  const pair = createTemporaryCheckpointStore().load(checkpointBinding(binding.workspace, target));

  progress.stage = 'admission';
  // The newly authorized claim call mints the request identity this admission binds.
  const requestIdentity = randomHex();
  const admission = /** @type {Record<string, any>} */ (deriveFreshAdmissionV1({
    version: 1,
    root,
    target,
    requestIdentity,
    policy,
    binding: { targetMapping: binding.targetMapping, lanePrestate: binding.lanePrestate },
    controls: { checkpointKey: pair.checkpointKey, status: pair.status },
    handoff,
    operationTime: canonicalTime(),
  }));
  if (admission.outcome !== 'eligible') {
    report.admission = admission;
    const proof = admission.missingProof;
    throw new Refusal(`fresh admission refused: ${proof.kind} (${proof.subject})`, { missingProof: proof });
  }
  report.admission = {
    outcome: admission.outcome,
    requestIdentity,
    admissionIdentity: admission.admissionIdentity,
    learningGate: admission.learningGate,
    inspectionHash: admission.inspectionHash,
  };
  Object.assign(report.terminalEvidence, admission.evidence);
  /** @param {string} name */
  const json = (name) => JSON.parse(/** @type {Buffer} */ (handoff[name]).toString('utf8'));
  return {
    admission,
    requestIdentity,
    manifest: json('terminal-evidence.json'),
    disposition: json('terminal-disposition.json'),
    captures: json('retained-evidence.json'),
    capturesFile: path.join(directory, 'retained-evidence.json'),
  };
}

/**
 * The claim's read-only Inspection gate: no overflow, no blocker, and complete
 * retained-occurrence evidence.
 * @param {Record<string, any>} inspection @param {string} label
 */
function requireAdmissible(inspection, label) {
  if (inspection.overflow) throw new Refusal(`${label} overflowed its model packet (evidence-incomplete)`);
  if (inspection.blockers.length !== 0) throw new Refusal(`${label} has blockers`, { blockers: inspection.blockers });
  const retention = inspectRetainedOccurrencesV2(inspection);
  if (retention.blocker) {
    throw new Refusal('retained-occurrence evidence is missing or invalid', { blocker: retention.blocker });
  }
}

/**
 * Freshly bind the exact owner, task mapping, lane prestate, and lane-owner
 * application bytes for one Lightweight target. This composes the exported
 * primitives the runner's private binding uses; the adapter, the recovery
 * runtime, and the lane owner rederive and recheck every value.
 * @param {string} root
 * @param {{specPath:string,lane:'lightweight',taskKey:string}} target
 * @param {{ideaPath:string,specPath:string}} expectedOwner
 */
function laneBinding(root, target, expectedOwner) {
  const resolved = resolveFeatureOwner({ root, specPath: target.specPath });
  if (resolved.diagnostics.length !== 0 || resolved.owner === null
    || canonicalJson(resolved.owner) !== canonicalJson(expectedOwner)) {
    throw new Error('owner-resolution-failed');
  }
  /** @param {string} relative */
  const read = (relative) => fs.readFileSync(resolveMutationPath(root, relative));
  const tasksPath = tasksPathFor(target.specPath);
  const tasks = read(tasksPath);
  const owner = read(resolved.owner.ideaPath);
  const snapshot = readTaskState(root);
  if (snapshot.status === 'corrupt') throw new Error(`task-state snapshot is corrupt: ${snapshot.reason}`);
  const taskState = snapshot.status === 'absent' ? Buffer.from(EMPTY_TASK_STATE) : read(WORKSPACE_PATHS.TASK_STATE);
  const visible = parseVisibleTasks(tasks, { path: tasksPath, state: 'work driver binding' });
  const rows = visible.parsed.tasks.filter((task) => task.id === target.taskKey);
  if (visible.parsed.boardIssue || rows.length !== 1) throw new Error('mapping-missing: the task unit is not present exactly once');
  const task = rows[0];
  const ownerCapture = capturedBytesV1(owner);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: resolved.owner.ideaPath,
    specPath: target.specPath,
    ownerCapture: { sha256: ownerCapture.sha256, byteLength: ownerCapture.byteLength },
  }));
  const targetMapping = {
    version: 1,
    lane: 'lightweight',
    target: { ...target },
    ownerBindingHash,
    tasksPath,
    tasksDescriptor: contentDescriptor(tasks),
    taskStatePath: WORKSPACE_PATHS.TASK_STATE,
    taskStateDescriptor: contentDescriptor(taskState),
    taskKey: target.taskKey,
  };
  const lanePrestate = {
    version: 1,
    lane: 'lightweight',
    target: { ...target },
    glyph: task.glyph,
    blockedBy: task.blockedBy,
    tasksDescriptor: { ...targetMapping.tasksDescriptor },
    taskStateDescriptor: { ...targetMapping.taskStateDescriptor },
    ownerDescriptor: contentDescriptor(owner),
  };
  const application = {
    root,
    owner: { ideaPath: resolved.owner.ideaPath, specPath: target.specPath, ownerCapture, ownerBindingHash },
    mapping: JSON.parse(canonicalJson(targetMapping)),
    expected: {
      tasksPath,
      tasks: capturedBytesV1(tasks),
      taskStatePath: WORKSPACE_PATHS.TASK_STATE,
      taskState: capturedBytesV1(taskState),
    },
  };
  const workspace = {
    workspaceIdentity: sha256(canonicalJson({ version: 1, root })),
    ownerIdentity: sha256(canonicalJson({ version: 1, owner: application.owner })),
    taskPrestateIdentity: sha256(canonicalJson({
      version: 1, target, glyph: task.glyph, blockedBy: task.blockedBy, tasksDescriptor: targetMapping.tasksDescriptor,
    })),
    lanePrestateIdentity: sha256(canonicalJson(lanePrestate)),
  };
  return { task, parsed: visible.parsed, tasks, ownerBytes: owner, targetMapping, lanePrestate, application, workspace };
}

/** The binding the official store derives its workspace-target key from. @param {{workspaceIdentity:string,ownerIdentity:string}} workspace @param {Record<string, unknown>} target */
function checkpointBinding(workspace, target) {
  return { version: 1, workspaceIdentity: workspace.workspaceIdentity, target, ownerIdentity: workspace.ownerIdentity };
}

/**
 * One-shot admission of the identity this setup minted and retained outside
 * checkpoint bytes. The runner later admits its own fresh identity.
 * @param {{invocationIdentity:string,workerToken:string,workerGeneration:number,supervisorAuthorityIdentity:string}} material
 */
function supervisorPort(material) {
  let admitted = false;
  return {
    identity: material.supervisorAuthorityIdentity,
    /** @param {Record<string, unknown>} request */
    admit(request) {
      if (admitted || request.mode !== 'initial') throw new TypeError('supervisor admission is one-shot');
      admitted = true;
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        invocationIdentity: material.invocationIdentity,
        workerToken: material.workerToken,
        workerGeneration: material.workerGeneration,
        supervisorAuthorityIdentity: material.supervisorAuthorityIdentity,
      };
      return { ...body, admissionIdentity: sha256(canonicalJson({ request, response: body })) };
    },
  };
}

/**
 * The no-effect authority port, observing the authoritative lane surfaces the
 * way the runner's own port does.
 * @param {string} root
 * @param {{specPath:string,lane:'lightweight',taskKey:string}} target
 * @param {{ideaPath:string,specPath:string}} owner
 */
function noEffectAuthorityPort(root, target, owner) {
  const identity = randomHex();
  /** @type {Map<string, {complete:boolean, identity:string}>} */
  const probes = new Map();
  const observe = () => {
    try {
      const binding = laneBinding(root, target, owner);
      return {
        complete: true,
        identity: sha256(canonicalJson({
          version: 1, root, target, owner, lanePrestate: binding.lanePrestate, currentRun: [],
        })),
      };
    } catch (error) {
      return {
        complete: false,
        identity: sha256(canonicalJson({ version: 1, status: 'indeterminate', detail: messageOf(error) })),
      };
    }
  };
  return {
    identity,
    /** @param {Record<string, unknown>} request */
    capture(request) {
      const observation = observe();
      const body = {
        version: 1,
        requestIdentity: request.requestIdentity,
        operationIdentity: request.operationIdentity,
        authorityIdentity: identity,
        authoritativePreIdentity: observation.identity,
      };
      const result = { ...body, probeIdentity: sha256(canonicalJson({ request, response: body })) };
      probes.set(result.probeIdentity, observation);
      return result;
    },
    /** @param {Record<string, any>} request */
    classify(request) {
      const captured = probes.get(request.probeIdentity);
      const post = observe();
      const noEffect = captured?.complete === true && post.complete && captured.identity === post.identity;
      const body = {
        version: 1,
        probeIdentity: request.probeIdentity,
        operationIdentity: request.operationIdentity,
        authorityIdentity: identity,
        incidentIdentity: request.incidentIdentity,
        classification: noEffect ? 'no-effect' : 'indeterminate',
        authoritativePreIdentity: captured?.identity ?? post.identity,
        authoritativePostIdentity: post.identity,
        effectIdentity: null,
      };
      return { ...body, resultIdentity: sha256(canonicalJson({ request, response: body })) };
    },
  };
}

/** @param {string} file @param {string[]} kinds @returns {Record<string, any>} */
function readChallenge(file, kinds) {
  const challenge = readJson(file, 'challenge');
  if (!isRecord(challenge) || challenge.type !== 'input-required' || !kinds.includes(challenge.kind)
    || typeof challenge.challengeIdentity !== 'string' || !HASH_PATTERN.test(challenge.challengeIdentity)) {
    throw new Refusal(`not a runner ${kinds.join(' or ')} challenge: ${file}`);
  }
  return challenge;
}

/** The `n` of a file named challenge-<n>.json. @param {string} challengeFile */
function challengeNumber(challengeFile) {
  const match = /^challenge-([1-9][0-9]*)\.json$/.exec(path.basename(challengeFile));
  if (!match) throw new Refusal(`a challenge file is named challenge-<n>.json: ${challengeFile}`);
  return Number(match[1]);
}

/** The response destination beside its exact challenge. @param {string} root @param {string} challengeFile */
function responseFileFor(root, challengeFile) {
  const n = challengeNumber(challengeFile);
  const response = outsideWorkspace(root, path.join(path.dirname(challengeFile), `response-${n}.json`), 'response');
  if (fs.existsSync(response)) {
    throw new Refusal(`${response} already exists; each challenge takes exactly one response`);
  }
  return response;
}

/** Decode and validate the challenge's accepted RunState and its exact bytes. @param {Record<string, any>} challenge */
function challengeState(challenge) {
  const text = Buffer.from(String(challenge.stateBase64), 'base64').toString('utf8');
  if (sha256(text) !== challenge.stateHash) throw new Refusal('challenge stateBase64 does not match its stateHash');
  const state = /** @type {Record<string, any>} */ (checked(() => validateRunState(JSON.parse(text))));
  return { state, text };
}

/** Decode and validate the accepted RunState and its single pending authorization. @param {Record<string, any>} challenge */
function pendingAuthorization(challenge) {
  const { state } = challengeState(challenge);
  if (state.pending.length !== 1) throw new Refusal('the challenge state holds no single pending authorization');
  return { state, pending: state.pending[0] };
}

/** Content hash with bounded memory. @param {string} file */
function fileHash(file) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(65_536);
  const handle = fs.openSync(file, 'r');
  try {
    let read;
    while ((read = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest('hex');
}

/**
 * Authored and generated workspace content, excluding version-control internals
 * and installed dependencies. Links are recorded, never followed.
 * @param {string} root
 */
function scanWorkspace(root) {
  /** @type {[string, string][]} */
  const entries = [];
  /** @param {string} directory */
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (SCAN_SKIP.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) entries.push([relative, `link:${fs.readlinkSync(absolute)}`]);
      else if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) entries.push([relative, fileHash(absolute)]);
    }
  };
  walk(root);
  return Object.fromEntries(entries.sort(([left], [right]) => compareUtf8(left, right)));
}

/**
 * Continuation state: only the accepted state of a previous `ended/task-settled`
 * result, equal to that result's returned state and the parsed Work policy.
 * These files are transport evidence; they cannot establish that the
 * invocation is still authorized.
 * @param {string} file @param {Record<string, unknown>} policy
 */
function carriedState(file, policy) {
  const state = readJson(file, '--state');
  checked(() => validateRunState(state));
  const result = readJson(path.join(path.dirname(path.resolve(file)), 'result.json'), 'the sibling result.json of --state');
  if (!isRecord(result) || result.outcome !== 'ended' || result.reason !== 'task-settled') {
    throw new Refusal('continuation accepts only the state of an ended/task-settled result; cancellation and hard stops end Work');
  }
  const returned = typeof result.stateBase64 === 'string' ? Buffer.from(result.stateBase64, 'base64').toString('utf8') : '';
  if (sha256(returned) !== result.stateHash || returned !== canonicalJson(state)) {
    throw new Refusal('--state differs from the accepted state its result returned');
  }
  if (canonicalJson(state.policy) !== canonicalJson(policy)) {
    throw new Refusal('--state policy differs from the parsed Work policy', { carried: state.policy, parsed: policy });
  }
  if (state.pending.length !== 0 || Object.hasOwn(state, 'pendingCompletion') || Object.hasOwn(state, 'learningGovernance')) {
    throw new Refusal('--state still holds pending work, completion, or learning');
  }
  return state;
}

/**
 * Every read-only admission check, before any claim or lane mutation.
 * @param {string} root @param {Record<string, string>} values @param {string[]} workArguments
 * @param {Record<string, unknown>} report @param {{stage:string}} progress
 */
function claimPrerequisites(root, values, workArguments, report, progress) {
  /** @param {string} message @param {Record<string, unknown>} [details] @returns {never} */
  const refuse = (message, details) => {
    throw new Refusal(message, details);
  };
  progress.stage = 'invocation';
  const invocation = parseInvocation(workArguments);
  report.policy = invocation.policy;
  progress.stage = 'policy';
  if (invocation.policy.mode !== 'autonomous') {
    refuse(`the driver runs only --policy autonomous Work; the arguments parse to ${invocation.policy.mode}`);
  }

  progress.stage = 'target';
  const target = exactTarget(values.spec, values.task);
  report.target = target;
  progress.stage = 'lane';
  const lane = detectLane(root);
  report.lane = lane;
  if (lane.lane === 'tracked') refuse('imported tracked work exists; use Tracked Execution, never a Lightweight fallback');
  if (lane.lane !== 'lightweight') refuse(`ambiguous state: the Beads inventory is ${lane.beads}`);

  progress.stage = 'owner';
  const owner = exactOwner(root, target.specPath);
  report.owner = owner;
  if (invocation.feature !== undefined) {
    progress.stage = 'selector';
    const selector = invocation.feature;
    const selected = resolveIdeaSelector(selector.includes('/') ? { root, ideaPath: selector } : { root, slug: selector });
    if (selected.diagnostics.length !== 0 || selected.idea === null || selected.idea.status !== 'defined'
      || selected.idea.ideaPath !== owner.ideaPath || selected.idea.specPath !== owner.specPath) {
      refuse(`feature selector '${selector}' does not resolve to the exact owner ${owner.ideaPath}`, {
        diagnostics: selected.diagnostics,
      });
    }
  }

  progress.stage = 'state';
  const state = /** @type {Record<string, any>} */ (values.state === undefined
    ? validateRunState({ policy: invocation.policy, overallUsed: 0, recoveryUsed: [], pending: [], completed: [] })
    : carriedState(values.state, invocation.policy));
  report.initialStateHash = sha256(canonicalJson(state));

  progress.stage = 'tasks';
  const binding = laneBinding(root, target, owner);
  const { parsed, task } = binding;
  if (parsed.warnings.length !== 0) refuse('tasks.md has parser warnings', { warnings: parsed.warnings });
  const breadcrumb = `<!-- audit log: ${owner.ideaPath}#coordinator-log -->`;
  if (!binding.tasks.toString('utf8').split(/\r?\n/).some((line) => line.trim() === breadcrumb)) {
    refuse(`tasks.md lacks the exact owner breadcrumb ${breadcrumb}`);
  }

  const terminalFile = values['terminal-evidence'];
  if (terminalFile === undefined) {
    progress.stage = 'task';
    if (task.glyph !== ' ' || task.blockedBy !== null) {
      refuse(`${target.taskKey} is not an unblocked pending task: [${task.glyph}]${task.blockedBy ? ` blocked-by: ${task.blockedBy}` : ''}`);
    }
    const active = parsed.tasks.filter((entry) => entry.state === 'in-progress' && entry.blockedBy === null);
    if (active.length !== 0) refuse(`an unblocked in-progress task comes first: ${active.map((entry) => entry.id).join(', ')}`);
    const unfinished = task.deps.filter((dependency) => parsed.byId.get(dependency)?.state !== 'done');
    if (unfinished.length !== 0) refuse(`dependencies are not done: ${unfinished.join(', ')}`);
    const first = readyTasks(parsed)[0]?.id ?? null;
    if (first !== target.taskKey) refuse(`${target.taskKey} is not the first ready task; the first ready task is ${first ?? 'none'}`);
  }

  progress.stage = 'owner-log';
  if (!binding.ownerBytes.toString('utf8').endsWith('\n')) {
    refuse(`${owner.ideaPath} must end with LF for the exact claim-log append; the driver never repairs it`);
  }

  if (terminalFile !== undefined) {
    // The derivation owns the in-progress target, precedence, handoff, absence,
    // retained-source, learning, and capacity gates in its fixed order.
    const terminal = terminalAdmission(root, terminalFile, target, invocation.policy, binding, report, progress);
    progress.stage = 'inspection';
    const retained = /** @type {Record<string, unknown[]>} */ (terminal.captures);
    const inspection = runCommand('inspect', {
      trigger: 'explicit-inspection', input: runtimeInput(root, target, retained),
    }).inspection;
    report.inspection = { evidenceHash: inspection.evidenceHash, overflow: inspection.overflow, blockers: inspection.blockers };
    if (inspection.evidenceHash !== terminal.admission.inspectionHash) {
      refuse('the Inspection changed after fresh admission was derived; make a new request');
    }
    report.retainedEvidence = {
      file: terminal.capturesFile,
      entries: Object.fromEntries(RETAINED_STREAMS.map((field) => [field, retained[field].length])),
      capturesHash: capturesHash(retained),
    };
    const fresh = /** @type {Record<string, any>} */ (terminal.admission.state);
    report.initialStateHash = sha256(canonicalJson(fresh));
    return {
      target, owner, state: fresh, workspace: binding.workspace, inspection, retained: deepFreeze(retained), terminal,
    };
  }

  progress.stage = 'inspection';
  // A task whose lane history already holds attempts needs its original
  // captures; the explicit owner-selected file is their only source.
  const retained = values['retained-evidence'] === undefined ? null : readRetainedEvidence(values['retained-evidence']);
  /** @type {Record<string, unknown>} */
  const provenance = {};
  if (retained !== null) {
    report.retainedEvidence = Object.assign(provenance, {
      file: path.resolve(values['retained-evidence']),
      entries: Object.fromEntries(RETAINED_STREAMS.map((field) => [field, retained[field].length])),
    });
  }
  const input = runtimeInput(root, target, retained);
  const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input }).inspection;
  report.inspection = { evidenceHash: inspection.evidenceHash, overflow: inspection.overflow, blockers: inspection.blockers };
  requireAdmissible(inspection, 'the Inspection');
  if (retained !== null && retained.currentRun.length !== 0) {
    // The runner's own admission input adds one initially empty live current-run
    // capture after seeded current-run history. Inspect that exact input as well,
    // so the source headroom comes from the runtime and the runner cannot refuse
    // admission for what this claim accepted.
    const live = currentRunCapture(target, []);
    const admissionInput = {
      ...input,
      currentRun: [...input.currentRun, { ...live, bytes: { base64: live.bytes.toString('base64') } }],
    };
    const label = "the runner's admission Inspection, with its initially empty live current-run capture,";
    let admission;
    try {
      admission = runCommand('inspect', { trigger: 'explicit-inspection', input: admissionInput }).inspection;
    } catch (error) {
      const capacity = capacityDiagnostic(error);
      throw new Refusal(`${label} is refused: ${messageOf(error)}`, capacity === null ? {} : { capacity });
    }
    requireAdmissible(admission, label);
  }
  if (retained !== null) provenance.capturesHash = capturesHash(retained);
  // Every later reader, from setup to the published request, sees these exact rows.
  return { target, owner, state, workspace: binding.workspace, inspection, retained: deepFreeze(retained), terminal: null };
}

/** @param {string[]} argv */
async function claim(argv) {
  const { values, rest } = parseArgs(argv, {
    options: ['root', 'spec', 'task', 'out', 'state', 'retained-evidence', 'terminal-evidence'],
    required: ['root', 'spec', 'task'],
    rest: true,
  });
  if (Object.hasOwn(values, 'terminal-evidence')
    && (Object.hasOwn(values, 'state') || Object.hasOwn(values, 'retained-evidence'))) {
    throw new UsageError('--terminal-evidence excludes --state and --retained-evidence: a fresh admission imports no state, and its own handoff supplies the original captures');
  }
  const root = workspaceRoot(values.root);
  const out = freshRunDirectory(root, values.out, 'claim --out');
  /** @type {Record<string, any>} */
  const report = { version: 1, command: 'claim', startedAt: new Date().toISOString(), root, out, workArguments: rest };
  /** @param {number} code @param {string} stage @param {string} detail @param {Record<string, unknown>} [extra] */
  const finish = (code, stage, detail, extra = {}) => {
    Object.assign(report, { ok: code === 0, exitCode: code, stage, detail, ...extra, finishedAt: new Date().toISOString() });
    const reportFile = publishJson(path.join(out, CLAIM_REPORT_FILE), report);
    print({
      ok: code === 0,
      command: 'claim',
      exitCode: code,
      stage,
      detail,
      out,
      report: reportFile,
      // A refused fresh admission names its one first missing proof, once.
      ...(Object.hasOwn(extra, 'missingProof') ? { missingProof: extra.missingProof } : {}),
      ...(code === 0 ? { runnerRequest: report.runnerRequest } : {}),
    });
    return code;
  };

  const progress = { stage: 'invocation' };
  let context;
  try {
    context = claimPrerequisites(root, values, rest, report, progress);
  } catch (error) {
    return finish(2, progress.stage, messageOf(error), error instanceof Refusal ? error.details : {});
  }
  const { target, owner, state, workspace, inspection, retained, terminal } = context;
  // Every setup operation inspects the same frozen captures the claim validated.
  const setupInput = () => runtimeInput(root, target, retained);

  // Mint the setup supervisor identity and retain it outside checkpoint bytes
  // before adapter admission.
  const supervisor = {
    version: 1,
    purpose: 'one-shot setup adapter admission; the runner admits its own fresh identity',
    createdAt: new Date().toISOString(),
    root,
    target,
    invocationIdentity: randomHex(),
    workerToken: randomHex(),
    workerGeneration: 1,
    supervisorAuthorityIdentity: randomHex(),
  };
  publishJson(path.join(out, 'supervisor.json'), supervisor);
  const store = createTemporaryCheckpointStore();
  const pairBinding = checkpointBinding(workspace, target);
  const pairStatus = () => {
    const loaded = store.load(pairBinding);
    return { checkpointKey: loaded.checkpointKey, status: loaded.status };
  };
  let setup;
  try {
    setup = createHostAdapter({
      state,
      target,
      inspectionIdentity: sha256(canonicalJson(inspection)),
      workspace,
    }, {
      supervisorSession: supervisorPort(supervisor),
      noEffectAuthority: noEffectAuthorityPort(root, target, owner),
      checkpoint: store,
    });
  } catch (error) {
    return finish(3, 'admission', messageOf(error), { pair: pairStatus() });
  }
  const admitted = setup.snapshot();
  if (admitted.status !== 'active') {
    return finish(3, 'admission', `setup admission refused: ${admitted.disposition}`, { ownership: setup.ownership() });
  }
  const adapter = setup;

  /** @type {Record<string, unknown>[]} */
  const steps = [];
  report.steps = steps;
  let laneWriteEntered = false;
  /** @param {string} label @param {string} operation @param {Record<string, unknown>} payload @param {string} [correctionIdentity] */
  const step = (label, operation, payload, correctionIdentity) => {
    const current = adapter.snapshot();
    if (operation === 'apply-lane-effect') laneWriteEntered = true;
    const carried = /** @type {Record<string, any>} */ (payload);
    const input = carried.input ?? carried.laneEffect?.input ?? carried.laneReceipt?.input;
    const result = /** @type {Record<string, any>} */ (adapter.run({
      version: 1,
      operation,
      expectedSessionIdentity: current.sessionIdentity,
      expectedAcceptedRevision: current.acceptedRevision,
      expectedHostRevision: current.hostRevision,
      ...payload,
      ...(correctionIdentity === undefined ? {} : { correctionIdentity }),
    }));
    steps.push({
      step: label,
      operation,
      outcome: result.outcome,
      reason: result.reason,
      // With retained evidence, name the captures this step's runtime input carried.
      ...(retained !== null && input !== undefined ? { capturesHash: capturesHash(input) } : {}),
      ...(result.incidentClass ? { incidentClass: result.incidentClass } : {}),
      ...(result.next ? { next: result.next } : {}),
      ...(result.product ? { productKind: result.product.kind } : {}),
      acceptedRevision: result.session.acceptedRevision,
      hostRevision: result.session.hostRevision,
    });
    return result;
  };
  /** @param {Record<string, any>} result */
  const refused = (result) => result.outcome === 'closed-refusal' || result.outcome === 'reinspect-required';
  // The runner's discipline: one offered correction, then a fresh Inspection and one fresh retry.
  /** @param {string} label @param {string} operation @param {Record<string, unknown>} payload */
  const semantic = (label, operation, payload) => {
    let result = step(label, operation, payload);
    if (!refused(result)) return { result, reinspected: false };
    if (result.next?.kind === 'correction') {
      result = step(`${label}:correction`, operation, payload, result.next.correctionIdentity);
      if (!refused(result)) return { result, reinspected: false };
    }
    const fresh = step(`${label}:reinspect`, 'fresh-inspection', { input: setupInput() });
    const reinspected = fresh.outcome === 'accepted' && fresh.reason === 'inspection-refreshed';
    return { result: reinspected ? result : fresh, reinspected };
  };
  /** @param {string} label @param {string} operation @param {() => Record<string, unknown>} payload */
  const deterministic = (label, operation, payload) => {
    const first = semantic(label, operation, payload());
    return first.reinspected ? semantic(`${label}:fresh`, operation, payload()).result : first.result;
  };
  /** @param {Record<string, any>} result @param {string} reason */
  const accepted = (result, reason) => result.outcome === 'accepted' && result.reason === reason;
  /** @param {string} stage @param {{outcome:string, reason:string}} result */
  const stop = (stage, result) => {
    const detail = `${stage}: ${result.outcome}/${result.reason}`;
    if (!laneWriteEntered && adapter.snapshot().status === 'active') {
      // No lane write was entered: this owner may cancel only its own unchanged setup.
      const ended = adapter.end('cancelled');
      const pair = pairStatus();
      return finish(ended.outcome === 'ended' && pair.status === 'absent' ? 4 : 5, stage, detail, {
        release: { outcome: ended.outcome, reason: ended.reason },
        pair,
        ownership: adapter.ownership(),
      });
    }
    return finish(5, stage, detail, {
      pair: pairStatus(),
      ownership: adapter.ownership(),
      retained: 'a lane write was entered or the adapter stopped; existing stop and manual cleanup rules apply',
    });
  };

  const proceed = () => {
    const inspected = deterministic('fresh-inspection', 'fresh-inspection', () => ({ input: setupInput() }));
    if (!accepted(inspected, 'inspection-refreshed')) return stop('fresh-inspection', inspected);

    /** @type {Record<string, any>} */
    let mutation = {};
    /** @type {ReturnType<typeof laneBinding>|null} */
    let issuedBinding = null;
    const issued = deterministic('authorize-lane-effect', 'authorize-lane-effect', () => {
      const binding = laneBinding(root, target, owner);
      const time = canonicalTime();
      issuedBinding = binding;
      if (terminal !== null) {
        // The same-glyph claim alternative with its exact append-only marker; the
        // issuer rederives its admission binding and eligibility from fresh evidence.
        mutation = buildTerminalFreshClaimMutationV1({
          target,
          ownerPath: owner.ideaPath,
          expectedOwnerHash: binding.application.owner.ownerCapture.sha256,
          time,
          requestIdentity: terminal.requestIdentity,
          admissionIdentity: terminal.admission.admissionIdentity,
          manifestIdentity: terminal.admission.evidence.manifestIdentity,
          dispositionIdentity: terminal.admission.evidence.dispositionIdentity,
        });
        return {
          laneEffect: {
            input: setupInput(),
            mutation,
            lanePrestate: binding.lanePrestate,
            targetMapping: binding.targetMapping,
            terminalAdmission: {
              requestIdentity: terminal.requestIdentity, manifest: terminal.manifest, disposition: terminal.disposition,
            },
          },
        };
      }
      mutation = {
        version: 1,
        lane: 'lightweight',
        kind: 'claim',
        reason: 'initial-claim',
        target,
        fromGlyph: ' ',
        toGlyph: '~',
        blocker: { kind: 'unchanged', before: null, after: null },
        eventLines: { kind: 'none' },
        ownerLog: {
          kind: 'append-exact',
          ownerPath: owner.ideaPath,
          expectedOwnerHash: binding.application.owner.ownerCapture.sha256,
          exactLines: [`- ${time} - work: Claimed ${target.taskKey} for the user-authorized autonomous Work invocation; implementation has not started.`],
          terminator: 'LF',
          appendIfAbsent: true,
        },
        snapshotUpdatedAt: time,
      };
      return {
        laneEffect: {
          input: setupInput(),
          mutation,
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
        },
      };
    });
    if (!accepted(issued, 'lane-permit-issued')) return stop('authorize-lane-effect', issued);
    const permit = issued.product.permit;
    Object.assign(report, { mutation, permit: { permitHash: permit.permitHash, mutationIdentity: permit.mutationIdentity } });

    /** @type {Record<string, any>|null} */
    let appliedApplication = null;
    const applied = deterministic('apply-lane-effect', 'apply-lane-effect', () => {
      appliedApplication = laneBinding(root, target, owner).application;
      return { laneApplication: { ...appliedApplication, mutation, permit } };
    });
    if (!accepted(applied, 'lane-mutation-applied')) return stop('apply-lane-effect', applied);
    const receipt = applied.product.receipt;
    report.receipt = { receiptHash: receipt.receiptHash };

    const committed = deterministic('commit-lane-receipt', 'commit-lane-receipt', () => ({
      laneReceipt: { input: setupInput(), permit, receipt },
    }));
    if (!accepted(committed, 'lane-receipt-committed')) return stop('commit-lane-receipt', committed);
    // The committed receipt settled setup inside run(); settle-effect is never called for it.
    const settled = adapter.snapshot();
    if (settled.pendingEffect !== null || settled.acceptedStateBytes !== canonicalJson(state)
      || settled.acceptedRevision !== admitted.acceptedRevision) {
      return stop('settle', { outcome: 'hard-stop', reason: 'setup-settlement-mismatch' });
    }

    const ended = adapter.end('controlled-end');
    if (ended.outcome !== 'ended' || ended.reason !== 'controlled-end') {
      return finish(5, 'end', `setup end returned ${ended.outcome}/${ended.reason}`, {
        pair: pairStatus(), ownership: adapter.ownership(),
      });
    }
    const pair = pairStatus();
    if (pair.status !== 'absent') return finish(5, 'end', `the setup ownership pair is ${pair.status} after its end`, { pair });

    // Reacquire the exact owner, mapping, and unblocked [~] poststate before
    // publishing the request with the unchanged accepted state.
    const post = laneBinding(root, target, owner);
    if (post.task.glyph !== '~' || post.task.blockedBy !== null) {
      return finish(5, 'poststate', `the poststate is [${post.task.glyph}], not an unblocked [~]`, { pair });
    }
    const acceptedState = ended.session.acceptedState;
    if (canonicalJson(acceptedState) !== canonicalJson(state)) {
      return finish(5, 'poststate', 'the accepted state changed during setup', { pair });
    }
    // A terminal-qualified request carries its fresh admission and the complete
    // setup receipt, so the runner can rebuild and compare the exact poststate.
    const priorTerminal = terminal === null ? null : {
      manifestIdentity: terminal.admission.evidence.manifestIdentity,
      dispositionIdentity: terminal.admission.evidence.dispositionIdentity,
      freshAdmissionIdentity: terminal.admission.admissionIdentity,
      setupReceipt: {
        version: 1,
        mutation,
        permit,
        receipt,
        targetMapping: /** @type {ReturnType<typeof laneBinding>} */ (/** @type {unknown} */ (issuedBinding)).targetMapping,
        lanePrestate: /** @type {ReturnType<typeof laneBinding>} */ (/** @type {unknown} */ (issuedBinding)).lanePrestate,
        preimages: {
          tasks: /** @type {Record<string, any>} */ (appliedApplication).expected.tasks,
          owner: /** @type {Record<string, any>} */ (appliedApplication).owner.ownerCapture,
          taskState: /** @type {Record<string, any>} */ (appliedApplication).expected.taskState,
        },
      },
    };
    report.runnerRequest = publishJson(path.join(out, 'runner-request.json'), {
      version: 1, root, target, owner, state: acceptedState,
      // The validated captures travel with the request, so run never rereads their file.
      ...(retained === null ? {} : { retainedEvidence: retained }),
      ...(priorTerminal === null ? {} : { priorTerminal }),
    });
    if (priorTerminal !== null) {
      // Bind the one request this claim issued to its canonical location and exact
      // bytes: run consumes only that file, so a relocated copy can never start it
      // again. The admission-bound definition travels with it to the runner's start.
      const issuedBytes = fs.readFileSync(report.runnerRequest);
      report.terminalRequest = {
        version: 1,
        path: fs.realpathSync(report.runnerRequest),
        sha256: sha256(issuedBytes),
        byteLength: issuedBytes.byteLength,
        requirements: terminal.manifest.binding.requirements,
      };
    }
    return finish(0, 'claimed', `${target.taskKey} is in progress; run the request next`, {
      ownerLogLine: mutation.ownerLog.exactLines[0],
      acceptedStateHash: sha256(canonicalJson(acceptedState)),
      pair,
    });
  };
  try {
    return proceed();
  } catch (error) {
    return stop('exception', { outcome: 'exception', reason: messageOf(error).slice(0, 400) });
  }
}

/** @param {string} file */
function readResponse(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error('the response is not a regular file');
    if (stat.size < 1 || stat.size > MAX_RESPONSE_BYTES) {
      throw new Error(`a response holds 1 through ${MAX_RESPONSE_BYTES} bytes`);
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    // The runner owns this classification and its hard stop.
    throw Object.assign(new Error(`challenge response unreadable: ${messageOf(error)}`), { code: 'challenge-response-invalid' });
  }
}

/** @param {Record<string, any>} result */
function settledState(result) {
  const text = Buffer.from(String(result.stateBase64), 'base64').toString('utf8');
  if (sha256(text) !== result.stateHash) throw new Error('result stateBase64 does not match its stateHash');
  return validateRunState(JSON.parse(text));
}

/**
 * The issuing claim's binding of one terminal-qualified runner request. The
 * claim's own setup report beside the request's canonical location must name
 * that exact location and these exact bytes, so only the originally issued file
 * can be consumed. A copy elsewhere, with or without its sibling files, has no
 * such binding and is refused before anything is created. The binding also
 * carries the admission-bound requirement descriptors to the runner's start.
 * Under the cooperative host model this binds location and integrity; it is
 * not a registry.
 * @param {string} requestFile @param {Buffer} bytes
 */
function issuedTerminalRequest(requestFile, bytes) {
  let file;
  try {
    file = fs.realpathSync(requestFile);
  } catch (error) {
    throw new Refusal(`runner request is unreadable: ${messageOf(error)}`);
  }
  const reportFile = path.join(path.dirname(file), CLAIM_REPORT_FILE);
  /** @param {string} mismatch @returns {never} */
  const refuse = (mismatch) => {
    throw new Refusal('a terminal-qualified runner request runs only from the claim directory that issued it', {
      request: file, report: reportFile, mismatch,
    });
  };
  /** @type {unknown} */
  let report = null;
  try {
    if (fs.lstatSync(reportFile).isFile()) report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  } catch {
    // An absent, unreadable, or malformed report binds nothing.
  }
  if (!isRecord(report) || report.command !== 'claim' || report.ok !== true || report.exitCode !== 0
    || !isRecord(report.terminalRequest) || report.terminalRequest.version !== 1
    || !isRecord(report.terminalRequest.requirements)) {
    refuse('no-issuing-claim-report');
  }
  const binding = report.terminalRequest;
  if (binding.path !== file) refuse('issued-elsewhere');
  if (binding.sha256 !== sha256(bytes) || binding.byteLength !== bytes.byteLength) refuse('bytes-changed');
  return { file, requirements: /** @type {Record<string, unknown>} */ (binding.requirements) };
}

/**
 * Consume one terminal-qualified runner request at its real start, before the
 * runner is invoked: exclusively create the immutable run-local record beside
 * the originally issued request, binding its exact bytes and fresh admission.
 * Reuse finds that record and refuses; a failed or uncertain start stays
 * consumed and is never erased to retry. The record is neither a registry nor a lock.
 * @param {string} root @param {ReturnType<typeof issuedTerminalRequest>} issued
 * @param {Buffer} bytes @param {Record<string, any>} request
 */
function consumeTerminalRequest(root, issued, bytes, request) {
  const requestFile = issued.file;
  const prior = request.priorTerminal;
  const freshAdmissionIdentity = isRecord(prior) ? prior.freshAdmissionIdentity : undefined;
  if (typeof freshAdmissionIdentity !== 'string' || !HASH_PATTERN.test(freshAdmissionIdentity)) {
    throw new Refusal('priorTerminal binds no fresh admission identity');
  }
  let requestIdentity;
  try {
    requestIdentity = sha256(canonicalJson(request));
  } catch {
    throw new Refusal('the terminal-qualified runner request is not canonical JSON data');
  }
  const file = outsideWorkspace(root, path.join(path.dirname(requestFile), REQUEST_USED_FILE), REQUEST_USED_FILE);
  const text = `${JSON.stringify({
    version: 1,
    kind: 'runner-request-used',
    request: path.basename(requestFile),
    requestSha256: sha256(bytes),
    requestByteLength: bytes.byteLength,
    requestIdentity,
    freshAdmissionIdentity,
  }, null, 2)}\n`;
  try {
    fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
    throw new Refusal('this terminal-qualified runner request was already used; a new request needs the most recent terminal handoff and a new claim', {
      requestUsed: file,
    });
  }
  // The trusted start observation for this exact request, never a request field.
  return {
    file,
    start: Object.freeze({
      version: 1,
      kind: 'runner-request-start',
      requestIdentity,
      freshAdmissionIdentity,
      record: Object.freeze({ name: REQUEST_USED_FILE, sha256: sha256(text), byteLength: Buffer.byteLength(text) }),
      requirements: deepFreeze(JSON.parse(JSON.stringify(issued.requirements))),
    }),
  };
}

/**
 * Run the official runner in this process and bridge its sequential challenges
 * through files: one atomic challenge at a time, then wait for its response
 * with a fixed polling delay and no timeout.
 * @param {string[]} argv
 */
async function run(argv) {
  const { values } = parseArgs(argv, { options: ['request', 'dir', 'retained-evidence'], required: ['request'] });
  const requestFile = path.resolve(values.request);
  let requestBytes;
  try {
    requestBytes = fs.readFileSync(requestFile);
  } catch (error) {
    throw new Refusal(`runner request is unreadable: ${messageOf(error)}`);
  }
  let request;
  try {
    request = JSON.parse(requestBytes.toString('utf8'));
  } catch {
    throw new Refusal(`runner request is not JSON: ${requestFile}`);
  }
  if (!isRecord(request) || typeof request.root !== 'string') throw new Refusal('the runner request has no workspace root');
  const root = workspaceRoot(request.root);
  const terminalRequest = Object.hasOwn(request, 'priorTerminal');
  if (values['retained-evidence'] !== undefined) {
    if (terminalRequest) {
      throw new Refusal('a terminal-qualified runner request carries its own original captures; give no separate --retained-evidence');
    }
    if (Object.hasOwn(request, 'retainedEvidence')) {
      throw new Refusal('the runner request already carries retainedEvidence; give exactly one source');
    }
    request.retainedEvidence = readJson(values['retained-evidence'], '--retained-evidence');
  }
  // Only the originally issued request can be consumed; it is checked before anything is created.
  const issued = terminalRequest ? issuedTerminalRequest(requestFile, requestBytes) : null;
  const dir = freshRunDirectory(root, values.dir, 'run --dir');
  let used = null;
  if (issued !== null) {
    try {
      used = consumeTerminalRequest(root, issued, requestBytes, request);
    } catch (error) {
      // Only this call's own new, still empty run directory is removed.
      try {
        fs.rmdirSync(dir);
      } catch {
        // An inert empty directory outside the workspace may remain.
      }
      throw error;
    }
  }
  const statusFile = path.join(dir, 'status.json');
  /** @param {Record<string, unknown>} fields */
  const status = (fields) => publishJson(statusFile, {
    version: 1, pid: process.pid, updatedAt: new Date().toISOString(), ...fields,
  }, true);
  /** @param {Record<string, unknown>} event */
  const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
  status({ state: 'running', request: requestFile, ...(used === null ? {} : { requestUsed: used.file }) });
  emit({ event: 'started', pid: process.pid, dir, status: statusFile });

  // The runner observes the actual runtime boundary itself and publishes the
  // original captures and any terminal evidence through this run-local sink.
  const sink = retentionSink(dir);
  let challenges = 0;
  /** @param {Record<string, any>} challenge */
  const exchange = async (challenge) => {
    challenges += 1;
    const n = challenges;
    const challengeFile = publishJson(path.join(dir, `challenge-${n}.json`), challenge);
    const packetFile = challenge.modelPacket
      ? publishJson(path.join(dir, `packet-${n}.json`), challenge.modelPacket)
      : null;
    const responseFile = path.join(dir, `response-${n}.json`);
    const waiting = {
      n,
      kind: challenge.kind,
      challengeIdentity: challenge.challengeIdentity,
      challenge: challengeFile,
      packet: packetFile,
      response: responseFile,
    };
    status({ state: 'waiting', ...waiting });
    emit({ event: 'input-required', ...waiting });
    while (!fs.existsSync(responseFile)) await sleep(POLL_MS);
    const response = readResponse(responseFile);
    status({ state: 'running', n });
    return response;
  };

  /** @type {Record<string, any>} */
  let result;
  try {
    result = await runHostAdapter(request, {
      exchange,
      retentionSink: sink.port,
      ...(used === null ? {} : { requestStart: used.start }),
    });
  } catch (error) {
    // The refusal shape the official runner CLI emits for an unusable request.
    result = {
      type: 'result', step: 'request', outcome: 'hard-stop', reason: 'request-invalid',
      detail: messageOf(error), occurrenceIdentity: null, steps: [],
    };
  }
  const resultFile = publishJson(path.join(dir, 'result.json'), result);
  // Only a settled task offers reusable state; every other end stays evidence in result.json.
  const acceptedStateFile = result.outcome === 'ended' && result.reason === 'task-settled'
    ? publishJson(path.join(dir, 'accepted-state.json'), settledState(result))
    : null;
  // A disposition reports its own retention failures; any other end, including a
  // Feature 056 release, keeps the failure visible as an unexpected error, as it always has.
  const capturesFailure = sink.failures.get('retained-evidence.json');
  if (capturesFailure !== undefined && !Object.hasOwn(result, 'terminalDisposition')) throw capturesFailure;
  const retainedFile = sink.written.get('retained-evidence.json')?.file ?? null;
  const exitCode = result.outcome === 'ended' ? 0 : 1;
  const terminal = {
    outcome: result.outcome,
    reason: result.reason,
    ...Object.fromEntries(TERMINAL_FIELDS.filter((field) => Object.hasOwn(result, field)).map((field) => [field, result[field]])),
    haltReport: result.haltReport ?? null,
    occurrenceIdentity: result.occurrenceIdentity ?? null,
    acceptedRevision: result.acceptedRevision ?? null,
    stateHash: result.stateHash ?? null,
    challenges,
    exitCode,
    result: resultFile,
    acceptedState: acceptedStateFile,
    retainedEvidence: retainedFile,
    terminalEvidence: sink.written.get('terminal-evidence.json')?.file ?? null,
  };
  status({ state: 'finished', ...terminal });
  emit({ event: 'finished', ...terminal });
  return exitCode;
}

/** @param {string[]} argv */
async function assess(argv) {
  const { values } = parseArgs(argv, { options: ['root', 'challenge', 'input'], required: ['root', 'challenge', 'input'] });
  const root = workspaceRoot(values.root);
  const challengeFile = path.resolve(values.challenge);
  const responseFile = responseFileFor(root, challengeFile);
  const challenge = readChallenge(challengeFile, ['assessment']);
  if (!isRecord(challenge.inspection)) throw new Refusal('the challenge carries no Inspection');
  checked(() => validateInspection(challenge.inspection));
  if (challenge.inspection.overflow) throw new Refusal('the challenge Inspection overflowed; no Assessment can bind it');

  const input = readJson(values.input, 'Assessment input');
  if (!isRecord(input)) throw new Refusal('the Assessment input is one JSON object');
  const unknown = Object.keys(input).filter((field) => !ASSESSMENT_INPUT_FIELDS.includes(field));
  const missing = ASSESSMENT_INPUT_FIELDS.filter((field) => !Object.hasOwn(input, field));
  if (unknown.length !== 0 || missing.length !== 0) {
    throw new Refusal('the Assessment input has exactly these fields', {
      fields: ASSESSMENT_INPUT_FIELDS, unknown, missing,
    });
  }
  const { action } = input;
  if (action === 'none') {
    throw new Refusal('action none hard-stops at authorization; it never ends the task', {
      hint: 'to end this task, answer the challenge with respond --cancel',
    });
  }
  if (action === 'reconcile-derived-definition') {
    throw new Refusal('reconcile-derived-definition is unsupported through the autonomous attestation boundary', {
      hint: 'answer with respond --cancel and route the definition owner',
    });
  }
  if (typeof action !== 'string' || !Object.hasOwn(requiredChecksForAction, action)) {
    throw new Refusal(`unknown action '${String(action)}'`, { actions: Object.keys(requiredChecksForAction) });
  }
  if (input.intent !== 'unchanged') {
    throw new Refusal(`intent '${String(input.intent)}' stops autonomous authorization as clarification-required`, {
      hint: 'changed or ambiguous intent is a human stop; answer with respond --cancel and report it',
    });
  }
  if (input.equivalence === 'same' || input.equivalence === 'equivalent') {
    throw new Refusal(`equivalence '${input.equivalence}' is refused under autonomous policy (evidence-incomplete)`, {
      hint: 'use none for a first attempt or distinct for a materially different approach',
    });
  }
  const assessment = {
    evidenceHash: challenge.inspection.evidenceHash,
    intent: input.intent,
    action,
    materialInputs: {
      targets: input.targets,
      operations: [action],
      checks: [...requiredChecksForAction[/** @type {keyof typeof requiredChecksForAction} */ (action)]],
    },
    equivalence: input.equivalence,
    retention: input.retention,
    summary: input.summary,
  };
  const hint = 'list every intended writer path once: workspace-relative, forward slashes, UTF-8 sorted';
  checked(() => validateAssessment(challenge.target, challenge.inspection, assessment), hint);
  checked(() => validateMaterialInputsV1(assessment.materialInputs, 'Assessment.materialInputs'), hint);
  publishJson(responseFile, {
    version: 1,
    type: 'challenge-response',
    challengeIdentity: challenge.challengeIdentity,
    kind: 'assessment',
    assessment,
  });
  print({
    ok: true,
    command: 'assess',
    response: responseFile,
    action,
    evidenceHash: assessment.evidenceHash,
    targets: assessment.materialInputs.targets.length,
    checks: assessment.materialInputs.checks,
    assessmentIdentity: sha256(canonicalJson(assessment)),
  });
  return 0;
}

/**
 * Publish one actual learning review for its exchange's waiting `learning-review`
 * challenge. Local preflight binds the challenge body, its accepted state, the
 * required governance, and the Inspection, then runs the receiver's own pure
 * preparation. Waiting status and matching hashes show local consistency only;
 * the runner repeats every check against fresh evidence when it reads the file.
 * @param {string} challengeFile @param {string} responseFile @param {string} reviewFile
 */
function respondLearningReview(challengeFile, responseFile, reviewFile) {
  const challenge = readChallenge(challengeFile, ['learning-review']);
  const { challengeIdentity, bindingIdentity, ...body } = challenge;
  if (bindingIdentity !== checked(() => sha256(canonicalJson(body)))) {
    throw new Refusal('the challenge body does not match its bindingIdentity');
  }
  const status = readJson(path.join(path.dirname(challengeFile), 'status.json'), 'the exchange status.json');
  if (!isRecord(status) || status.state !== 'waiting' || status.n !== challengeNumber(challengeFile)
    || status.kind !== challenge.kind || status.challengeIdentity !== challengeIdentity) {
    throw new Refusal('the challenge is not the waiting challenge of its exchange', {
      hint: 'answer only the newest challenge, while status.json shows it waiting',
    });
  }
  const { state, text } = challengeState(challenge);
  if (canonicalJson(state) !== text) throw new Refusal('the challenge state is not canonical RunState bytes');
  const governance = state.learningGovernance;
  if (!isRecord(governance) || governance.governanceIdentity !== challenge.governanceIdentity
    || canonicalJson(governance.target) !== canonicalJson(challenge.target)) {
    throw new Refusal('the challenge does not bind the learning requirement of its accepted state');
  }

  // The actual result reaches the shared preparation untouched: nothing is cloned, repaired, or normalized.
  const review = readJson(reviewFile, 'learning review');
  const hint = 'have the learning-governance owner correct its result, or answer with respond --cancel';
  const prepared = checked(() => prepareLearningReviewV2(state, challenge.inspection, review), hint);
  if (!prepared.prepared) {
    throw new Refusal(`the learning review cannot answer this challenge: ${prepared.reason}`, {
      reason: prepared.reason, hint,
    });
  }
  const response = {
    version: 1, type: 'challenge-response', challengeIdentity, kind: 'learning-review', review,
  };
  const responseBytes = Buffer.byteLength(jsonText(response));
  if (responseBytes > MAX_RESPONSE_BYTES) {
    throw new Refusal(`the response holds ${responseBytes} bytes; the runner reads at most ${MAX_RESPONSE_BYTES}`, { hint });
  }
  publishJson(responseFile, response);
  print({
    ok: true,
    command: 'respond',
    response: responseFile,
    kind: 'learning-review',
    outcome: review.outcome,
    governanceIdentity: challenge.governanceIdentity,
    reviewIdentity: /** @type {Record<string, unknown>} */ (prepared.reviewEvent).reviewIdentity,
    findings: review.findings.length,
    alternatives: review.alternatives.length,
    responseBytes,
  });
  return 0;
}

/** @param {string[]} argv */
async function respond(argv) {
  const { values } = parseArgs(argv, {
    options: ['root', 'challenge', 'tester', 'reviewer', 'changed', 'learning-review'],
    flags: ['cancel'],
    required: ['root', 'challenge'],
  });
  const pair = ['tester', 'reviewer', 'changed'].filter((name) => Object.hasOwn(values, name));
  const learning = Object.hasOwn(values, 'learning-review');
  const forms = [pair.length !== 0, learning, Object.hasOwn(values, 'cancel')].filter(Boolean).length;
  if (forms !== 1 || (pair.length !== 0 && pair.length !== 3)) {
    throw new UsageError('respond takes --tester, --reviewer, and --changed; --learning-review alone; or --cancel alone');
  }
  const root = workspaceRoot(values.root);
  const challengeFile = path.resolve(values.challenge);
  const responseFile = responseFileFor(root, challengeFile);
  if (learning) return respondLearningReview(challengeFile, responseFile, values['learning-review']);
  if (values.cancel) {
    // Only the bound envelope: the runner performs its permitted cancellation.
    const challenge = readChallenge(challengeFile, CHALLENGE_KINDS);
    publishJson(responseFile, {
      version: 1, type: 'cancel', challengeIdentity: challenge.challengeIdentity, kind: challenge.kind,
    });
    print({ ok: true, command: 'respond', response: responseFile, type: 'cancel', kind: challenge.kind });
    return 0;
  }

  const challenge = readChallenge(challengeFile, ['specialist-pair']);
  const { state, pending } = pendingAuthorization(challenge);
  // The actual sole records reach the official preflight untouched: nothing is cloned, repaired, or normalized.
  const tester = readJson(values.tester, 'Tester result');
  const reviewer = readJson(values.reviewer, 'Reviewer result');
  const changedTargets = readJson(values.changed, 'changed paths');
  if (!Array.isArray(changedTargets)) throw new Refusal('changed paths are the JSON array diff --out wrote');
  const checks = Array.isArray(tester?.checks) ? tester.checks : [];
  // Failed verification takes precedence, then rejected review, then success.
  const outcome = checks.some((check) => check?.outcome === 'failed')
    ? 'failed'
    : reviewer?.verdict === 'rejected'
      ? 'blocked'
      : changedTargets.length === 0 ? 'no-change' : 'succeeded';
  const result = {
    outcome,
    operations: [...pending.materialInputs.operations],
    changedTargets,
    verification: tester,
    review: reviewer,
  };
  const prepared = checked(() => prepareSpecialistResult(state, result));
  checked(() => validateHostAdapterRequest({
    version: 1,
    operation: 'record-attempt-result',
    // Shape-only here: the adapter binds the live session and revisions at use.
    expectedSessionIdentity: challenge.stateHash,
    expectedAcceptedRevision: challenge.acceptedRevision,
    expectedHostRevision: challenge.hostRevision,
    attemptResult: {
      input: {
        root,
        specPath: pending.target.specPath,
        target: pending.target,
        lane: { kind: 'lightweight' },
        currentRun: [],
        policyMode: 'autonomous',
      },
      result,
    },
  }, state));
  publishJson(responseFile, {
    version: 1,
    type: 'challenge-response',
    challengeIdentity: challenge.challengeIdentity,
    kind: 'specialist-pair',
    specialistResult: result,
  });
  print({
    ok: true,
    command: 'respond',
    response: responseFile,
    outcome,
    operations: result.operations,
    changedTargets,
    checks: checks.length,
    findings: reviewer.findings.length,
    attemptIdentity: prepared.completion.attemptIdentity,
    resultIdentity: prepared.completion.resultIdentity,
  });
  return 0;
}

/** @param {string[]} argv */
async function snapshot(argv) {
  const { values } = parseArgs(argv, { options: ['root', 'out'], required: ['root', 'out'] });
  const root = workspaceRoot(values.root);
  const out = freshOutputFile(root, values.out, 'snapshot --out');
  const files = scanWorkspace(root);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  publishJson(out, { version: 1, root, takenAt: new Date().toISOString(), files });
  print({ ok: true, command: 'snapshot', root, files: Object.keys(files).length, out });
  return 0;
}

/** @param {string[]} argv */
async function diff(argv) {
  const { values } = parseArgs(argv, {
    options: ['root', 'baseline', 'challenge', 'out'],
    required: ['root', 'baseline', 'challenge', 'out'],
  });
  const root = workspaceRoot(values.root);
  const out = freshOutputFile(root, values.out, 'diff --out');
  const baseline = readJson(values.baseline, 'baseline');
  if (!isRecord(baseline) || baseline.version !== 1 || !isRecord(baseline.files)) {
    throw new Refusal('--baseline is not a snapshot baseline');
  }
  if (baseline.root !== root) throw new Refusal(`the baseline was taken for ${String(baseline.root)}, not ${root}`);
  const { pending } = pendingAuthorization(readChallenge(path.resolve(values.challenge), ['specialist-pair']));
  const authorized = new Set(pending.materialInputs.targets);
  const before = new Map(Object.entries(baseline.files));
  const after = new Map(Object.entries(scanWorkspace(root)));
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter((file) => before.get(file) !== after.get(file))
    .sort(compareUtf8);
  const changes = changed.map((file) => ({
    path: file,
    change: !before.has(file) ? 'added' : !after.has(file) ? 'deleted' : 'modified',
  }));
  const unauthorized = changed.filter((file) => !authorized.has(file));
  if (unauthorized.length !== 0) {
    throw new Refusal('changed paths fall outside the pending authorization', {
      unauthorized,
      changes,
      hint: 'route the scope issue through ordinary Work; never widen the authorization or hide a path',
    });
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  publishJson(out, changed);
  print({ ok: true, command: 'diff', changes, out });
  return 0;
}

/** Read-only: the official store's status for exactly one workspace-target pair. @param {string[]} argv */
async function ownership(argv) {
  const { values } = parseArgs(argv, { options: ['root', 'spec', 'task'], required: ['root', 'spec', 'task'] });
  const root = workspaceRoot(values.root);
  const target = exactTarget(values.spec, values.task);
  const owner = exactOwner(root, target.specPath);
  let binding;
  try {
    binding = laneBinding(root, target, owner);
  } catch (error) {
    throw new Refusal(`no exact task mapping forms the ownership binding: ${messageOf(error)}`);
  }
  const loaded = /** @type {Record<string, any>} */ (
    createTemporaryCheckpointStore().load(checkpointBinding(binding.workspace, target))
  );
  const record = loaded.record;
  print({
    ok: loaded.status !== 'failed',
    command: 'ownership',
    root,
    target,
    checkpointKey: loaded.checkpointKey,
    status: loaded.status,
    ...(loaded.diagnostic ? { diagnostic: loaded.diagnostic } : {}),
    ...(loaded.reason ? { reason: loaded.reason } : {}),
    ...(record ? {
      record: {
        invocationIdentity: record.invocationIdentity,
        workerGeneration: record.workerGeneration,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    } : {}),
  });
  if (loaded.status === 'absent') return 0;
  return loaded.status === 'failed' ? 2 : 1;
}

/** @type {Record<string, (argv: string[]) => Promise<number>>} */
const COMMANDS = { claim, run, assess, respond, snapshot, diff, ownership };
/** @type {Record<string, number>} */
const REFUSAL_EXIT = { claim: 2, run: 2, assess: 1, respond: 1, snapshot: 1, diff: 1, ownership: 2 };

async function main() {
  const [command = '', ...argv] = process.argv.slice(2);
  if (command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }
  try {
    if (!Object.hasOwn(COMMANDS, command)) throw new UsageError(`unknown or missing subcommand '${command}'`);
    process.exitCode = await COMMANDS[command](argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`driver: ${error.message}\n${USAGE}`);
      process.exitCode = 64;
    } else if (error instanceof Refusal) {
      print({ ok: false, command, refused: error.message, ...error.details });
      process.exitCode = REFUSAL_EXIT[command];
    } else {
      process.stderr.write(`driver ${command}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 70;
    }
  }
}

if (isMainModule(import.meta.url, process.argv[1])) await main();

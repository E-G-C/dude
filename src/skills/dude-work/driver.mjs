#!/usr/bin/env node
// @ts-check
/**
 * Work driver: host integration for autonomous Lightweight Work through the
 * official setup adapter and runner. It claims one pending task, bridges the
 * runner's sequential challenges through files outside the workspace, builds
 * and preflights responses with the official validators, captures attempt
 * baselines, and probes one ownership pair.
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
} from './host-adapter.mjs';
import {
  canonicalJson,
  canonicalTarget,
  capturedBytesV1,
  contentDescriptor,
  inspectRetainedOccurrencesV2,
  parseInvocation,
  requiredChecksForAction,
  runCommand,
  sha256,
  validateAssessment,
  validateInspection,
  validateMaterialInputsV1,
  validateRunState,
} from './recovery.mjs';

const USAGE = `usage:
  node driver.mjs claim --root <workspace> --spec <specPath> --task <taskKey> [--out <dir>] [--state <accepted-state.json>] -- <work arguments>
  node driver.mjs run --request <runner-request.json> [--dir <dir>] [--retained-evidence <file>]
  node driver.mjs assess --root <workspace> --challenge <challenge-n.json> --input <file>
  node driver.mjs respond --root <workspace> --challenge <challenge-n.json> (--tester <file> --reviewer <file> --changed <file> | --cancel)
  node driver.mjs snapshot --root <workspace> --out <file>
  node driver.mjs diff --root <workspace> --baseline <file> --challenge <challenge-n.json> --out <file>
  node driver.mjs ownership --root <workspace> --spec <specPath> --task <taskKey>
`;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CHALLENGE_KINDS = ['assessment', 'specialist-pair', 'learning-review'];
const ASSESSMENT_INPUT_FIELDS = ['action', 'targets', 'summary', 'intent', 'equivalence', 'retention'];
const RETAINED_STREAMS = ['currentRun', 'verification', 'review', 'lint'];
const ATTEMPT_STREAMS = ['verification', 'review', 'lint']; // the streams a completion capture carries for its attempt alone
const TERMINAL_FIELDS = ['detail', 'target', 'blocker', 'capacity', 'cleanup', 'cleanupReason', 'orphan', 'ownership'];
const RUNTIME_IDENTITY = sha256('dude-work/driver:recovery-runtime:v1');
const MAX_RESPONSE_BYTES = 1_048_576; // the runner CLI's own per-response ceiling
const POLL_MS = 250;
const RENAME_RETRY_MS = 60_000;
const SCAN_SKIP = new Set(['.git', 'node_modules']);
const EMPTY_TASK_STATE = Buffer.from('{}\n');

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
 * `dw-XXXXXX` directory under the operating system temporary directory.
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
  fs.mkdirSync(directory);
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

/**
 * Publish one complete JSON file through a sibling temporary file and one
 * rename, so a poller never observes a partial message. Unless replacement is
 * explicit, an existing file is refused and its bytes stay untouched.
 * @param {string} file @param {unknown} value @param {boolean} [replace]
 */
function publishJson(file, value, replace = false) {
  if (!replace && fs.existsSync(file)) throw new Refusal(`refusing to replace existing ${file}`);
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
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

/** The response destination beside its exact challenge. @param {string} root @param {string} challengeFile */
function responseFileFor(root, challengeFile) {
  const match = /^challenge-([1-9][0-9]*)\.json$/.exec(path.basename(challengeFile));
  if (!match) throw new Refusal(`a challenge file is named challenge-<n>.json: ${challengeFile}`);
  const response = outsideWorkspace(root, path.join(path.dirname(challengeFile), `response-${match[1]}.json`), 'response');
  if (fs.existsSync(response)) {
    throw new Refusal(`${response} already exists; each challenge takes exactly one response`);
  }
  return response;
}

/** Decode and validate the accepted RunState and its single pending authorization. @param {Record<string, any>} challenge */
function pendingAuthorization(challenge) {
  const text = Buffer.from(String(challenge.stateBase64), 'base64').toString('utf8');
  if (sha256(text) !== challenge.stateHash) throw new Refusal('challenge stateBase64 does not match its stateHash');
  const state = /** @type {Record<string, any>} */ (checked(() => validateRunState(JSON.parse(text))));
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

  progress.stage = 'owner-log';
  if (!binding.ownerBytes.toString('utf8').endsWith('\n')) {
    refuse(`${owner.ideaPath} must end with LF for the exact claim-log append; the driver never repairs it`);
  }

  progress.stage = 'inspection';
  const inspection = runCommand('inspect', { trigger: 'explicit-inspection', input: emptyRuntimeInput(root, target) }).inspection;
  report.inspection = { evidenceHash: inspection.evidenceHash, overflow: inspection.overflow, blockers: inspection.blockers };
  if (inspection.overflow) refuse('the Inspection overflowed its model packet (evidence-incomplete)');
  if (inspection.blockers.length !== 0) refuse('the Inspection has blockers', { blockers: inspection.blockers });
  const retention = inspectRetainedOccurrencesV2(inspection);
  if (retention.blocker) refuse('retained-occurrence evidence is missing or invalid', { blocker: retention.blocker });
  return { target, owner, state, workspace: binding.workspace, inspection };
}

/** @param {string[]} argv */
async function claim(argv) {
  const { values, rest } = parseArgs(argv, {
    options: ['root', 'spec', 'task', 'out', 'state'],
    required: ['root', 'spec', 'task'],
    rest: true,
  });
  const root = workspaceRoot(values.root);
  const out = freshRunDirectory(root, values.out, 'claim --out');
  /** @type {Record<string, any>} */
  const report = { version: 1, command: 'claim', startedAt: new Date().toISOString(), root, out, workArguments: rest };
  /** @param {number} code @param {string} stage @param {string} detail @param {Record<string, unknown>} [extra] */
  const finish = (code, stage, detail, extra = {}) => {
    Object.assign(report, { ok: code === 0, exitCode: code, stage, detail, ...extra, finishedAt: new Date().toISOString() });
    const reportFile = publishJson(path.join(out, 'setup-report.json'), report);
    print({
      ok: code === 0,
      command: 'claim',
      exitCode: code,
      stage,
      detail,
      out,
      report: reportFile,
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
  const { target, owner, state, workspace, inspection } = context;

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
    const fresh = step(`${label}:reinspect`, 'fresh-inspection', { input: emptyRuntimeInput(root, target) });
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
    const inspected = deterministic('fresh-inspection', 'fresh-inspection', () => ({ input: emptyRuntimeInput(root, target) }));
    if (!accepted(inspected, 'inspection-refreshed')) return stop('fresh-inspection', inspected);

    /** @type {Record<string, any>} */
    let mutation = {};
    const issued = deterministic('authorize-lane-effect', 'authorize-lane-effect', () => {
      const binding = laneBinding(root, target, owner);
      const time = canonicalTime();
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
          input: emptyRuntimeInput(root, target),
          mutation,
          lanePrestate: binding.lanePrestate,
          targetMapping: binding.targetMapping,
        },
      };
    });
    if (!accepted(issued, 'lane-permit-issued')) return stop('authorize-lane-effect', issued);
    const permit = issued.product.permit;
    Object.assign(report, { mutation, permit: { permitHash: permit.permitHash, mutationIdentity: permit.mutationIdentity } });

    const applied = deterministic('apply-lane-effect', 'apply-lane-effect', () => ({
      laneApplication: { ...laneBinding(root, target, owner).application, mutation, permit },
    }));
    if (!accepted(applied, 'lane-mutation-applied')) return stop('apply-lane-effect', applied);
    const receipt = applied.product.receipt;
    report.receipt = { receiptHash: receipt.receiptHash };

    const committed = deterministic('commit-lane-receipt', 'commit-lane-receipt', () => ({
      laneReceipt: { input: emptyRuntimeInput(root, target), permit, receipt },
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
    report.runnerRequest = publishJson(path.join(out, 'runner-request.json'), {
      version: 1, root, target, owner, state: acceptedState,
    });
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
 * Run the official runner in this process and bridge its sequential challenges
 * through files: one atomic challenge at a time, then wait for its response
 * with a fixed polling delay and no timeout.
 * @param {string[]} argv
 */
async function run(argv) {
  const { values } = parseArgs(argv, { options: ['request', 'dir', 'retained-evidence'], required: ['request'] });
  const requestFile = path.resolve(values.request);
  const request = readJson(requestFile, 'runner request');
  if (!isRecord(request) || typeof request.root !== 'string') throw new Refusal('the runner request has no workspace root');
  const root = workspaceRoot(request.root);
  if (values['retained-evidence'] !== undefined) {
    if (Object.hasOwn(request, 'retainedEvidence')) {
      throw new Refusal('the runner request already carries retainedEvidence; give exactly one source');
    }
    request.retainedEvidence = readJson(values['retained-evidence'], '--retained-evidence');
  }
  const dir = freshRunDirectory(root, values.dir, 'run --dir');
  const statusFile = path.join(dir, 'status.json');
  /** @param {Record<string, unknown>} fields */
  const status = (fields) => publishJson(statusFile, {
    version: 1, pid: process.pid, updatedAt: new Date().toISOString(), ...fields,
  }, true);
  /** @param {Record<string, unknown>} event */
  const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
  status({ state: 'running', request: requestFile });
  emit({ event: 'started', pid: process.pid, dir, status: statusFile });

  // The original capture streams the runtime received, in received order. Every
  // runtime input except a completion capture carries the runner's accumulated
  // streams, which replace these whole. A capture carries the accumulated current
  // run but only the current attempt's specialist streams; the runner adds each
  // of those rows to its accumulation once, and so does this copy. A stop during
  // a later capture therefore keeps every earlier attempt's captures. Rows are
  // copied as received, never rebuilt.
  /** @type {Record<string, unknown[]>|null} */
  let received = null;
  const runtime = {
    identity: RUNTIME_IDENTITY,
    /** @param {string} command @param {Record<string, any>} lowLevelRequest */
    invoke(command, lowLevelRequest) {
      const input = lowLevelRequest?.input;
      if (isRecord(input) && RETAINED_STREAMS.every((field) => Array.isArray(input[field]))) {
        /** @type {Record<string, unknown[]>} */
        const streams = Object.fromEntries(
          RETAINED_STREAMS.map((field) => [field, JSON.parse(JSON.stringify(input[field]))]),
        );
        const accumulated = received;
        if (lowLevelRequest.mode === 'capture' && accumulated !== null) {
          accumulated.currentRun = streams.currentRun;
          for (const field of ATTEMPT_STREAMS) {
            for (const row of streams[field]) {
              const bytes = canonicalJson(row);
              if (!accumulated[field].some((entry) => canonicalJson(entry) === bytes)) accumulated[field].push(row);
            }
          }
        } else {
          received = streams;
        }
      }
      return { status: 'returned', value: runCommand(command, lowLevelRequest) };
    },
  };
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
    result = await runHostAdapter(request, { runtime, exchange });
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
  const retained = /** @type {Record<string, unknown[]>|null} */ (received);
  const retainedFile = retained === null ? null : publishJson(path.join(dir, 'retained-evidence.json'), retained);
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
    throw new Refusal('action none hard-stops at authorization and keeps the ownership pair', {
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

/** @param {string[]} argv */
async function respond(argv) {
  const { values } = parseArgs(argv, {
    options: ['root', 'challenge', 'tester', 'reviewer', 'changed'],
    flags: ['cancel'],
    required: ['root', 'challenge'],
  });
  const pair = ['tester', 'reviewer', 'changed'].filter((name) => Object.hasOwn(values, name));
  if (values.cancel ? pair.length !== 0 : pair.length !== 3) {
    throw new UsageError('respond takes --tester, --reviewer, and --changed, or --cancel alone');
  }
  const root = workspaceRoot(values.root);
  const challengeFile = path.resolve(values.challenge);
  const responseFile = responseFileFor(root, challengeFile);
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

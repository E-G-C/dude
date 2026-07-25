#!/usr/bin/env node
// @ts-check
/**
 * board.mjs — thin CLI over the `tasks.md` engine (`dude-engine/lib/tasks.mjs`).
 *
 * Deterministic read/derive/mutate for the Lightweight Execution board. The
 * coordinator calls these subcommands instead of hand-parsing `tasks.md`.
 *
 *   parse  <tasks.md> [--json]                  structured parse (+ warnings)
 *   ready  <tasks.md> [--json]                  ready-now task list
 *   next   <tasks.md>                           the single top ready task id
 *   render <tasks.md> [--stdout|--check|--write] regenerate the fenced board
 *   set    <tasks.md> <id> <state> [--write] [--blocked-by "..."]
 *   apply-states <tasks.md> --from <map.json> [--write]   batch glyph sync
 *   diff   <tasks.md> [--json]                  human-applied [x] vs snapshot
 *
 * Non-mutating by default. `--write` rewrites the file AND refreshes the
 * coordinator-state snapshot at <root>/.dude/state/task-state.json.
 *
 * Flags: --root <dir> (default cwd; anchors the snapshot key), --json.
 * Exit codes: 0 ok, 1 usage, 2 operation error, 3 `render --check` found stale.
 *
 * `applyLightweightWorkRequest` is the separate autonomous-Work trust boundary
 * for the closed `work-project` / `work-set` wrapper requests. It never runs
 * from the CLI above and leaves every manual, guarded, non-Work, mirror, and
 * coordinator-maintenance path byte-compatible.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseTasks,
  readyTasks,
  nextTask,
  renderBoard,
  boardIsStale,
  setTaskState,
  applyStates,
  glyphsOf,
  diffAgainstSnapshot,
} from '../dude-engine/lib/tasks.mjs';
import {
  parseTaskState,
  readTaskState,
  upsertTaskStateEntry,
} from '../dude-engine/lib/task-state.mjs';
import {
  WORKSPACE_PATHS,
  resolveMutationPath,
} from '../dude-engine/lib/workspace-paths.mjs';
import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import {
  canonicalJson,
  sha256,
  validateRunState,
  validateProjectionPermitV1,
  validateLaneMutationPermitV1,
  validateLightweightAtomicReceiptV1,
} from '../dude-work/recovery.mjs';

/** @param {ReturnType<typeof parseTasks>} parsed @param {string} id @returns {string[]} */
function taskUnitLines(parsed, id) {
  const task = parsed.byId.get(id);
  if (!task) return [];
  let endLine = task.headerLine + 1;
  while (endLine < parsed.lines.length && /^\s+\S/.test(parsed.lines[endLine])) endLine++;
  return parsed.lines.slice(task.headerLine, endLine);
}

/** @param {string[]} before @param {string[]} after @returns {{before:string[],after:string[]}} */
function changedSpan(before, after) {
  let prefixLength = 0;
  while (
    prefixLength < before.length
    && prefixLength < after.length
    && before[prefixLength] === after[prefixLength]
  ) prefixLength++;

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength
    && suffixLength < after.length - prefixLength
    && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) suffixLength++;

  return {
    before: before.slice(prefixLength, before.length - suffixLength),
    after: after.slice(prefixLength, after.length - suffixLength),
  };
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), json: false, stdout: false, check: false, write: false, help: false };
  /** @type {string[]} */
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--stdout') out.stdout = true;
    else if (a === '--check') out.check = true;
    else if (a === '--write') out.write = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--from') out.fromPath = argv[++i];
    else if (a === '--blocked-by') out.blockedBy = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else pos.push(a);
  }
  out.cmd = pos[0];
  out.file = pos[1];
  out.id = pos[2];
  out.state = pos[3];
  return out;
}

const HELP = `board — tasks.md engine CLI

Usage:
  node board.mjs parse  <tasks.md> [--json]
  node board.mjs ready  <tasks.md> [--json]
  node board.mjs next   <tasks.md>
  node board.mjs render <tasks.md> [--stdout|--check|--write]
  node board.mjs set    <tasks.md> <id> <state> [--write] [--blocked-by "..."]
  node board.mjs apply-states <tasks.md> --from <map.json> [--write]
  node board.mjs diff   <tasks.md> [--json]

Flags: --root <dir> (snapshot anchor, default cwd), --json
`;

/** @param {any} args @returns {number} exit code */
function run(args) {
  if (args.help || !args.cmd || !args.file) {
    process.stdout.write(HELP);
    return args.help ? 0 : 1;
  }
  const file = path.resolve(args.file);
  if (!fs.existsSync(file)) {
    process.stderr.write(`[FAIL] file not found: ${args.file}\n`);
    return 2;
  }
  const root = path.resolve(args.root);
  const relKey = path.relative(root, file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');
  const parsed = parseTasks(content, { path: file });
  if (parsed.boardIssue) {
    if (args.cmd === 'parse' && args.json) {
      process.stdout.write(`${JSON.stringify({
        tasks: parsed.tasks,
        warnings: parsed.warnings,
        boardIssue: parsed.boardIssue,
        diagnosticTaskLines: parsed.diagnosticTaskLines,
      }, null, 2)}\n`);
    } else {
      process.stderr.write(`[FAIL] ${parsed.boardIssue}\n`);
      if (args.cmd === 'parse') {
        for (const diagnostic of parsed.diagnosticTaskLines) {
          process.stderr.write(`[DIAG] line ${diagnostic.line}: ${diagnostic.text}\n`);
        }
      }
    }
    return 2;
  }
  if (args.write && !/^\.dude\/specs\/[^/]+\/tasks\.md$/.test(relKey)) {
    process.stderr.write('[FAIL] writes require .dude/specs/<feature>/tasks.md\n');
    return 2;
  }
  if (args.write) {
    try {
      resolveMutationPath(root, relKey);
      resolveMutationPath(root, WORKSPACE_PATHS.TASK_STATE);
    } catch (error) {
      process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`);
      return 2;
    }
    const cur = readTaskState(root);
    if (cur.status === 'corrupt') {
      process.stderr.write(`[FAIL] corrupt task-state snapshot: ${cur.reason}\n`);
      return 2;
    }
  }

  switch (args.cmd) {
    case 'parse': {
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ tasks: parsed.tasks, warnings: parsed.warnings }, null, 2)}\n`);
      }
      else {
        for (const t of parsed.tasks) process.stdout.write(`[${t.glyph}] ${t.id} ${t.description}\n`);
        for (const w of parsed.warnings) process.stdout.write(`[WARN] ${w}\n`);
      }
      return 0;
    }
    case 'ready': {
      const ready = readyTasks(parsed);
      if (args.json) process.stdout.write(`${JSON.stringify(ready.map((t) => t.id), null, 2)}\n`);
      else if (ready.length === 0) process.stdout.write('(no ready tasks)\n');
      else for (const t of ready) process.stdout.write(`${t.id} ${t.description}\n`);
      return 0;
    }
    case 'next': {
      const t = nextTask(parsed);
      if (t) process.stdout.write(`${t.id}\n`);
      return 0;
    }
    case 'render': {
      const rendered = renderBoard(parsed);
      if (args.check) {
        const stale = boardIsStale(parsed);
        process.stdout.write(stale ? '[STALE] board differs from a fresh render\n' : '[OK] board up to date\n');
        return stale ? 3 : 0;
      }
      if (args.write) {
        fs.writeFileSync(file, rendered);
        upsertTaskStateEntry(root, relKey, glyphsOf(parseTasks(rendered)));
        process.stdout.write(`[OK] rendered board in ${args.file}\n`);
        return 0;
      }
      process.stdout.write(rendered); // default: --stdout
      return 0;
    }
    case 'set': {
      if (!args.id || !args.state) {
        process.stderr.write('[FAIL] set requires <id> <state>\n');
        return 1;
      }
      let result;
      try {
        result = setTaskState(parsed, args.id, args.state, args.blockedBy != null ? { blockedBy: args.blockedBy } : {});
      } catch (err) {
        process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
        return 2;
      }
      if (args.write) {
        fs.writeFileSync(file, result.content);
        upsertTaskStateEntry(root, relKey, glyphsOf(parseTasks(result.content)));
        process.stdout.write(`[OK] ${args.id} set to "${args.state}" in ${args.file}\n`);
        return 0;
      }
      const afterParsed = parseTasks(result.content, { path: file });
      const changed = changedSpan(
        taskUnitLines(parsed, result.task.id),
        taskUnitLines(afterParsed, result.task.id),
      );
      for (const line of changed.before) process.stdout.write(`- ${line}\n`);
      for (const line of changed.after) process.stdout.write(`+ ${line}\n`);
      process.stdout.write('(dry run; pass --write to apply)\n');
      return 0;
    }
    case 'apply-states': {
      if (!args.fromPath) {
        process.stderr.write('[FAIL] apply-states requires --from <map.json>\n');
        return 1;
      }
      /** @type {Record<string,string>} */
      let statesMap;
      try {
        statesMap = JSON.parse(fs.readFileSync(args.fromPath, 'utf8'));
      } catch (err) {
        process.stderr.write(`[FAIL] cannot read map: ${err instanceof Error ? err.message : String(err)}\n`);
        return 2;
      }
      const result = applyStates(parsed, statesMap);
      if (args.write) {
        fs.writeFileSync(file, result.content);
        upsertTaskStateEntry(root, relKey, glyphsOf(parseTasks(result.content)));
        process.stdout.write(`[OK] applied ${result.applied.length} state(s) in ${args.file}\n`);
      } else {
        process.stdout.write(`${result.applied.length} state(s) would change (dry run; pass --write)\n`);
      }
      for (const id of result.unknown) process.stdout.write(`[WARN] unknown task id in map: ${id}\n`);
      return 0;
    }
    case 'diff': {
      const cur = readTaskState(root);
      if (cur.status === 'corrupt') {
        process.stderr.write(`[FAIL] corrupt task-state snapshot: ${cur.reason}\n`);
        return 2;
      }
      const snap = cur.status === 'ok' ? cur.state[relKey]?.glyphs : undefined;
      const d = diffAgainstSnapshot(parsed, snap);
      if (args.json) process.stdout.write(`${JSON.stringify(d, null, 2)}\n`);
      else if (!d.baseline) process.stdout.write('(no snapshot baseline yet)\n');
      else if (d.unexpectedDone.length === 0) process.stdout.write('[OK] no human-applied [x] without a recorded baseline\n');
      else for (const id of d.unexpectedDone) process.stdout.write(`[UNVERIFIED-DONE] ${id}\n`);
      return 0;
    }
    default:
      process.stderr.write(`[FAIL] unknown command: ${args.cmd}\n`);
      return 1;
  }
}

// --- Autonomous v2 Lightweight lane trust boundary ---------------------------
//
// The closed `work-project` and `work-set` wrapper requests of the immutable
// Feature 009 schemas. Nothing caller-supplied is trusted where fresh bytes are
// obtainable: the owner binding, the target mapping, the lane prestate, every
// event parsed from `mutation.eventLines`, the mutation identity, and the
// receipt poststate are all re-derived from `readLightweightSurfaces`, the one
// fresh observation of the three authoritative surfaces. A caller supplies only
// identity references plus expected bytes; every decision is recomputed here.

const LANE_EVENT_PREFIX = '- dude-run-event: ';
const MAX_EVENT_BYTES = 16_384;
const MAX_EVENT_LINE_TEXT_BYTES = 16_402;
const LANE_GLYPHS = Object.freeze([' ', '~', '!', 'x']);
const LANE_KIND_REASONS = Object.freeze({
  'append-event': Object.freeze(['event-projection']),
  claim: Object.freeze(['initial-claim', 'resume-claim', 'post-learning-claim']),
  'task-blocked': Object.freeze(['task-blocked', 'no-progress']),
  'task-completed': Object.freeze(['task-completed']),
  'controlled-end': Object.freeze(['controlled-unresolved-end']),
  'incident-supersession': Object.freeze(['incident-supersession']),
});
const FEATURE_007_TARGET = Object.freeze({
  specPath: '.dude/specs/007-technical-docs-pack-remediation/spec.md',
  lane: 'lightweight',
  taskKey: 'T001@00709e37',
});
// The accepted outbound vocabulary: exactly `LaneRefusalReason` from the
// Feature 009 schemas. `permit-stale` is a member of that union with no lane
// condition assigned to it -- the Work host raises it -- so it stays declared
// here rather than narrowing what this boundary is allowed to return.
const LANE_REFUSAL_REASONS = new Set([
  'invalid-request-shape', 'unknown-field', 'invalid-canonical-value', 'unsafe-root-or-path',
  'expected-capture-mismatch', 'owner-resolution-failed', 'owner-prestate-mismatch',
  'target-mismatch', 'mapping-missing', 'mapping-ambiguous', 'mapping-mismatch',
  'run-state-mismatch', 'permit-hash-mismatch', 'permit-stale', 'permit-replayed',
  'permit-operation-mismatch', 'mutation-schema-mismatch', 'mutation-identity-mismatch',
  'transition-not-allowed', 'event-line-mismatch', 'event-conflict', 'lane-prestate-mismatch',
  'snapshot-corrupt', 'owner-log-conflict', 'atomic-apply-failed', 'tracked-operation-failed',
]);
const SPEC_PATH_RE = /^\.dude\/specs\/[^/]+\/spec\.md$/;
const IDEA_PATH_RE = /^\.dude\/ideas\/[^/]+\.md$/;
const DURABLE_TASK_KEY_RE = /^T\d{3,}@[a-z0-9]{8}$/;
const CANONICAL_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f-\u009f]/;
const UNOBSERVED_SURFACES_HASH = sha256(canonicalJson({ owner: null, taskState: null, tasks: null }));

/** A closed lane refusal. No validator throw escapes this boundary. */
class LaneRefusalError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** A closed lane indeterminate outcome: a run-wide hard stop. */
class LaneIndeterminateError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

/** @param {string} reason @returns {never} */
function refuse(reason) {
  throw new LaneRefusalError(reason);
}

/** @param {string} reason @returns {never} */
function indeterminate(reason) {
  throw new LaneIndeterminateError(reason);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Require exactly the closed field set. An extra key is `unknown-field`; a
 * missing key or non-record is `invalid-request-shape`.
 * @param {unknown} value @param {string[]} fields @returns {Record<string, unknown>}
 */
function exactRecord(value, fields) {
  if (!isPlainRecord(value)) refuse('invalid-request-shape');
  for (const key of Object.keys(value)) if (!fields.includes(key)) refuse('unknown-field');
  for (const field of fields) if (!Object.hasOwn(value, field)) refuse('invalid-request-shape');
  return value;
}

/** @param {unknown} value @returns {string} */
function requireHash(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) refuse('invalid-canonical-value');
  return /** @type {string} */ (value);
}

/** @param {unknown} value @returns {string} */
function requireShortText(value) {
  if (typeof value !== 'string') refuse('invalid-canonical-value');
  const text = /** @type {string} */ (value);
  const bytes = Buffer.byteLength(text);
  if (bytes < 1 || bytes > 1024 || CONTROL_CHARACTER_RE.test(text)) refuse('invalid-canonical-value');
  return text;
}

/** @param {unknown} value @returns {{sha256:string,byteLength:number}} */
function requireDescriptor(value) {
  const descriptor = exactRecord(value, ['sha256', 'byteLength']);
  requireHash(descriptor.sha256);
  if (!Number.isSafeInteger(descriptor.byteLength) || Number(descriptor.byteLength) < 0) {
    refuse('invalid-canonical-value');
  }
  return /** @type {{sha256:string,byteLength:number}} */ (descriptor);
}

/** Decode one exact `CapturedBytesV1` and recompute its complete descriptor. @param {unknown} value */
function requireCapturedBytes(value) {
  const capture = exactRecord(value, ['base64', 'sha256', 'byteLength']);
  if (typeof capture.base64 !== 'string' || !BASE64_RE.test(capture.base64)) {
    refuse('invalid-canonical-value');
  }
  const decoded = Buffer.from(/** @type {string} */ (capture.base64), 'base64');
  if (decoded.toString('base64') !== capture.base64) refuse('invalid-canonical-value');
  requireHash(capture.sha256);
  if (!Number.isSafeInteger(capture.byteLength) || Number(capture.byteLength) < 0) {
    refuse('invalid-canonical-value');
  }
  if (decoded.byteLength !== capture.byteLength || sha256(decoded) !== capture.sha256) {
    refuse('invalid-canonical-value');
  }
  return decoded;
}

/** @param {unknown} value @returns {{specPath:string,lane:'lightweight',taskKey:string}} */
function requireLightweightTarget(value) {
  const target = exactRecord(value, ['specPath', 'lane', 'taskKey']);
  if (typeof target.specPath !== 'string' || !SPEC_PATH_RE.test(target.specPath)) {
    refuse('invalid-canonical-value');
  }
  if (target.lane !== 'lightweight') refuse('invalid-canonical-value');
  if (typeof target.taskKey !== 'string' || !DURABLE_TASK_KEY_RE.test(target.taskKey)) {
    refuse('invalid-canonical-value');
  }
  return {
    specPath: /** @type {string} */ (target.specPath),
    lane: 'lightweight',
    taskKey: /** @type {string} */ (target.taskKey),
  };
}

/** @param {string} specPath */
function tasksPathForSpec(specPath) {
  return `${specPath.slice(0, -'spec.md'.length)}tasks.md`;
}

/** @param {string|Buffer} bytes */
function descriptorOf(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return { sha256: sha256(buffer), byteLength: buffer.byteLength };
}

/** @param {string} absolutePath @returns {fs.Stats | null} */
function lstatOrNull(absolutePath) {
  try {
    return fs.lstatSync(absolutePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Resolve the three mutation-safe Lightweight surface paths below one canonical
 * root. Any symlink, escape, or noncanonical root refuses before every read.
 * @param {unknown} rootValue @param {string} tasksPath @param {string} ideaPath
 */
function resolveLightweightSurfaces(rootValue, tasksPath, ideaPath) {
  if (typeof rootValue !== 'string' || !rootValue || !path.isAbsolute(rootValue)) {
    refuse('unsafe-root-or-path');
  }
  const root = /** @type {string} */ (rootValue);
  try {
    if (path.resolve(root) !== root) refuse('unsafe-root-or-path');
    const stat = lstatOrNull(root);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) refuse('unsafe-root-or-path');
    if (fs.realpathSync(root) !== root) refuse('unsafe-root-or-path');
    return {
      root,
      tasks: { key: tasksPath, absolutePath: resolveMutationPath(root, tasksPath) },
      taskState: {
        key: WORKSPACE_PATHS.TASK_STATE,
        absolutePath: resolveMutationPath(root, WORKSPACE_PATHS.TASK_STATE),
      },
      owner: { key: ideaPath, absolutePath: resolveMutationPath(root, ideaPath) },
    };
  } catch (error) {
    if (error instanceof LaneRefusalError) throw error;
    return refuse('unsafe-root-or-path');
  }
}

/**
 * The single fresh observation of every authoritative Lightweight surface.
 * Prestate derivation, refusal evidence, and the receipt poststate all call
 * this, so no path can drift from another.
 * @param {ReturnType<typeof resolveLightweightSurfaces>} surfaces
 */
function readLightweightSurfaces(surfaces) {
  /** @param {{key:string,absolutePath:string}} surface */
  const read = (surface) => {
    const stat = lstatOrNull(surface.absolutePath);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
      return { ...surface, bytes: null, descriptor: null };
    }
    const bytes = fs.readFileSync(surface.absolutePath);
    return { ...surface, bytes, descriptor: descriptorOf(bytes) };
  };
  return { tasks: read(surfaces.tasks), taskState: read(surfaces.taskState), owner: read(surfaces.owner) };
}

/** @param {ReturnType<typeof readLightweightSurfaces>} observation */
function observationHash(observation) {
  return sha256(canonicalJson({
    owner: observation.owner.descriptor,
    taskState: observation.taskState.descriptor,
    tasks: observation.tasks.descriptor,
  }));
}

/**
 * Best-effort early path binding so a refusal at any later step still reports
 * freshly observed bytes instead of the unobservable sentinel. It resolves
 * paths only and never refuses.
 * @param {unknown} requestValue @param {{surfaces: ReturnType<typeof resolveLightweightSurfaces>|null}} context
 */
function bindObservableSurfaces(requestValue, context) {
  if (!isPlainRecord(requestValue)) return;
  const target = requestValue.target;
  const owner = requestValue.owner;
  if (!isPlainRecord(target) || !isPlainRecord(owner)) return;
  if (typeof target.specPath !== 'string' || !SPEC_PATH_RE.test(target.specPath)) return;
  if (typeof owner.ideaPath !== 'string' || !IDEA_PATH_RE.test(owner.ideaPath)) return;
  try {
    context.surfaces = resolveLightweightSurfaces(
      requestValue.root,
      tasksPathForSpec(target.specPath),
      owner.ideaPath,
    );
  } catch {
    context.surfaces = null;
  }
}

/** @param {unknown} value @returns {{kind:string,before:string|null,after:string|null}} */
function requireBlockerEffect(value) {
  const effect = exactRecord(value, ['kind', 'before', 'after']);
  if (!['unchanged', 'add', 'remove', 'replace'].includes(/** @type {string} */ (effect.kind))) {
    refuse('mutation-schema-mismatch');
  }
  for (const field of ['before', 'after']) if (effect[field] !== null) requireShortText(effect[field]);
  const { kind, before, after } = effect;
  if (kind === 'unchanged' && before !== after) refuse('mutation-schema-mismatch');
  if (kind === 'add' && (before !== null || after === null)) refuse('mutation-schema-mismatch');
  if (kind === 'remove' && (before === null || after !== null)) refuse('mutation-schema-mismatch');
  if (kind === 'replace' && (before === null || after === null || before === after)) {
    refuse('mutation-schema-mismatch');
  }
  return /** @type {{kind:string,before:string|null,after:string|null}} */ (effect);
}

/**
 * Parse one exact `EventLineText`, recompute its event hash from the parsed
 * body, and derive the exact LF-terminated record.
 * @param {unknown} value
 */
function requireEventLine(value) {
  const line = exactRecord(value, ['eventHash', 'exactLine', 'terminator']);
  requireHash(line.eventHash);
  if (line.terminator !== 'LF') refuse('event-line-mismatch');
  const text = line.exactLine;
  if (typeof text !== 'string' || !text.startsWith(LANE_EVENT_PREFIX) || /[\r\n]/.test(text)) {
    refuse('event-line-mismatch');
  }
  if (Buffer.byteLength(/** @type {string} */ (text)) > MAX_EVENT_LINE_TEXT_BYTES) {
    refuse('event-line-mismatch');
  }
  const suffix = /** @type {string} */ (text).slice(LANE_EVENT_PREFIX.length);
  let parsed;
  try {
    parsed = JSON.parse(suffix);
  } catch {
    return refuse('event-line-mismatch');
  }
  if (!isPlainRecord(parsed)) refuse('event-line-mismatch');
  let canonical;
  try {
    canonical = canonicalJson(parsed);
  } catch {
    return refuse('event-line-mismatch');
  }
  if (canonical !== suffix) refuse('event-line-mismatch');
  if (Buffer.byteLength(canonical) > MAX_EVENT_BYTES) refuse('event-line-mismatch');
  const { eventHash, ...body } = /** @type {Record<string, unknown>} */ (parsed);
  if (eventHash !== line.eventHash) refuse('event-line-mismatch');
  if (sha256(canonicalJson(body)) !== eventHash) refuse('event-line-mismatch');
  return { eventHash: /** @type {string} */ (eventHash), exactLine: /** @type {string} */ (text) };
}

/** @param {unknown} value */
function requireEventLineEffect(value) {
  if (!isPlainRecord(value)) refuse('mutation-schema-mismatch');
  if (value.kind === 'none') {
    exactRecord(value, ['kind']);
    return { kind: 'none', lines: /** @type {{eventHash:string,exactLine:string}[]} */ ([]) };
  }
  const effect = exactRecord(value, ['kind', 'lines', 'appendIfAbsent']);
  if (effect.kind !== 'append-exact') refuse('mutation-schema-mismatch');
  if (effect.appendIfAbsent !== true) refuse('mutation-schema-mismatch');
  if (!Array.isArray(effect.lines) || Object.keys(effect.lines).length !== effect.lines.length) {
    refuse('mutation-schema-mismatch');
  }
  const rows = /** @type {unknown[]} */ (effect.lines);
  if (rows.length < 1 || rows.length > 4) refuse('mutation-schema-mismatch');
  const lines = rows.map(requireEventLine);
  if (new Set(lines.map((line) => line.eventHash)).size !== lines.length) refuse('event-conflict');
  return { kind: 'append-exact', lines };
}

/** @param {unknown} value */
function requireOwnerLogEffect(value) {
  if (!isPlainRecord(value)) refuse('mutation-schema-mismatch');
  if (value.kind === 'none') {
    exactRecord(value, ['kind']);
    return { kind: 'none', ownerPath: null, expectedOwnerHash: null, exactLines: /** @type {string[]} */ ([]) };
  }
  const effect = exactRecord(
    value,
    ['kind', 'ownerPath', 'expectedOwnerHash', 'exactLines', 'terminator', 'appendIfAbsent'],
  );
  if (effect.kind !== 'append-exact') refuse('mutation-schema-mismatch');
  if (typeof effect.ownerPath !== 'string' || !IDEA_PATH_RE.test(effect.ownerPath)) {
    refuse('invalid-canonical-value');
  }
  requireHash(effect.expectedOwnerHash);
  if (effect.terminator !== 'LF') refuse('mutation-schema-mismatch');
  if (effect.appendIfAbsent !== true) refuse('mutation-schema-mismatch');
  if (!Array.isArray(effect.exactLines) || Object.keys(effect.exactLines).length !== effect.exactLines.length) {
    refuse('mutation-schema-mismatch');
  }
  const lines = /** @type {unknown[]} */ (effect.exactLines);
  if (lines.length < 1 || lines.length > 4) refuse('mutation-schema-mismatch');
  return {
    kind: 'append-exact',
    ownerPath: /** @type {string} */ (effect.ownerPath),
    expectedOwnerHash: /** @type {string} */ (effect.expectedOwnerHash),
    exactLines: lines.map(requireShortText),
  };
}

/** The closed Lightweight transition matrix. @param {Record<string, unknown>} mutation @param {{kind:string,before:string|null,after:string|null}} blocker */
function requireClosedTransition(mutation, blocker) {
  const from = /** @type {string} */ (mutation.fromGlyph);
  const to = /** @type {string} */ (mutation.toGlyph);
  const nullBlocker = blocker.kind === 'unchanged' && blocker.before === null && blocker.after === null;
  const allowed = (() => {
    switch (mutation.kind) {
      case 'append-event':
        return from === to && blocker.kind === 'unchanged';
      case 'claim':
        return (from === ' ' && to === '~' && nullBlocker)
          || (from === '!' && to === '~' && blocker.kind === 'remove');
      case 'task-blocked':
        return ((from === ' ' || from === '~') && to === '!' && blocker.kind === 'add')
          || (from === '!' && to === '!' && blocker.kind === 'replace');
      case 'task-completed':
        return from === '~' && to === 'x' && nullBlocker;
      case 'controlled-end':
        return from === to && from !== 'x' && blocker.kind === 'unchanged';
      case 'incident-supersession':
        return from === '!'
          && ((to === '~' && blocker.kind === 'remove') || (to === '!' && blocker.kind === 'replace'));
      default:
        return false;
    }
  })();
  if (!allowed) refuse('transition-not-allowed');
}

/**
 * Validate one complete closed lane-specific mutation object and recompute its
 * whole-object identity. Never derived from an abstract kind, reason, target,
 * event hash, or prestate summary.
 * @param {unknown} value @param {'work-project'|'work-set'} operation
 * @param {{specPath:string,lane:'lightweight',taskKey:string}} target
 */
function requireLightweightMutation(value, operation, target) {
  if (!isPlainRecord(value)) refuse('mutation-schema-mismatch');
  const incident = value.kind === 'incident-supersession';
  if (operation === 'work-project' && value.kind !== 'append-event') refuse('mutation-schema-mismatch');
  if (operation === 'work-set' && value.kind === 'append-event') refuse('mutation-schema-mismatch');
  const mutation = exactRecord(value, incident
    ? ['version', 'lane', 'kind', 'reason', 'intentIdentity', 'previewIdentity', 'target',
      'fromGlyph', 'toGlyph', 'blocker', 'eventLines', 'ownerLog', 'snapshotUpdatedAt']
    : ['version', 'lane', 'kind', 'reason', 'target', 'fromGlyph', 'toGlyph',
      'blocker', 'eventLines', 'ownerLog', 'snapshotUpdatedAt']);
  if (mutation.version !== 1) refuse('mutation-schema-mismatch');
  if (mutation.lane !== 'lightweight') refuse('mutation-schema-mismatch');
  const kind = /** @type {string} */ (mutation.kind);
  if (!Object.hasOwn(LANE_KIND_REASONS, kind)) refuse('mutation-schema-mismatch');
  if (!LANE_KIND_REASONS[kind].includes(/** @type {string} */ (mutation.reason))) {
    refuse('mutation-schema-mismatch');
  }
  const mutationTarget = requireLightweightTarget(mutation.target);
  if (canonicalJson(mutationTarget) !== canonicalJson(target)) refuse('target-mismatch');
  if (incident) {
    requireHash(mutation.intentIdentity);
    requireHash(mutation.previewIdentity);
    if (canonicalJson(mutationTarget) !== canonicalJson(FEATURE_007_TARGET)) refuse('target-mismatch');
  }
  for (const field of ['fromGlyph', 'toGlyph']) {
    if (!LANE_GLYPHS.includes(/** @type {string} */ (mutation[field]))) refuse('mutation-schema-mismatch');
  }
  if (typeof mutation.snapshotUpdatedAt !== 'string' || !CANONICAL_UTC_RE.test(mutation.snapshotUpdatedAt)) {
    refuse('invalid-canonical-value');
  }
  const blocker = requireBlockerEffect(mutation.blocker);
  const eventLines = requireEventLineEffect(mutation.eventLines);
  const ownerLog = requireOwnerLogEffect(mutation.ownerLog);
  if (kind === 'append-event' && eventLines.lines.length !== 1) refuse('event-line-mismatch');
  requireClosedTransition(mutation, blocker);
  return { mutation, blocker, eventLines, ownerLog, mutationIdentity: sha256(canonicalJson(mutation)) };
}

/**
 * Index every existing autonomous v2 lane event record in the Lightweight
 * execution history so an exact copy stays idempotent and a same-hash body
 * conflict fails closed.
 * @param {string} historyText
 */
function laneHistoryIndex(historyText) {
  /** @type {Map<string,Set<string>>} */
  const byHash = new Map();
  for (const line of historyText.split('\n')) {
    if (!line.startsWith(LANE_EVENT_PREFIX)) continue;
    let parsed;
    try {
      parsed = JSON.parse(line.slice(LANE_EVENT_PREFIX.length));
    } catch {
      continue;
    }
    if (!isPlainRecord(parsed) || typeof parsed.eventHash !== 'string') continue;
    const bodies = byHash.get(parsed.eventHash) || new Set();
    bodies.add(line);
    byHash.set(parsed.eventHash, bodies);
  }
  return byHash;
}

/**
 * Build the exact `tasks.md` postimage with byte-precise edits over the fresh
 * source: only the glyph, the `blocked-by:` metadata line, and appended lane
 * event records may change.
 * @param {ReturnType<typeof parseTasks>} parsed
 * @param {import('../dude-engine/lib/tasks.mjs').Task} task
 * @param {Record<string, unknown>} mutation
 * @param {{kind:string,before:string|null,after:string|null}} blocker
 * @param {string[]} appendRecords
 */
function lightweightTasksPostimage(parsed, task, mutation, blocker, appendRecords) {
  /** @type {{start:number,end:number,text:string}[]} */
  const edits = [];
  const headerMeta = parsed.lineMeta[task.headerLine];
  const glyphMatch = /^- \[[^\]]*\]/.exec(parsed.lines[task.headerLine]);
  if (!glyphMatch) refuse('lane-prestate-mismatch');
  edits.push({
    start: headerMeta.startOffset,
    end: headerMeta.startOffset + glyphMatch[0].length,
    text: `- [${mutation.toGlyph}]`,
  });

  if (blocker.kind !== 'unchanged') {
    let blockedLine = -1;
    /** @type {string|null} */
    let firstMetaIndent = null;
    for (let i = task.headerLine + 1; i < parsed.lines.length && /^\s+\S/.test(parsed.lines[i]); i += 1) {
      if (firstMetaIndent === null) firstMetaIndent = /^(\s+)/.exec(parsed.lines[i])?.[1] ?? null;
      if (/^\s*blocked-by:/.test(parsed.lines[i])) {
        blockedLine = i;
        break;
      }
    }
    const indent = firstMetaIndent ?? '   ';
    if (blocker.kind === 'add') {
      if (blockedLine !== -1) refuse('lane-prestate-mismatch');
      const separator = headerMeta.separator || parsed.preferredSeparator;
      edits.push({
        start: headerMeta.endOffset,
        end: headerMeta.endOffset,
        text: `${indent}blocked-by: ${blocker.after}${separator}`,
      });
    } else {
      if (blockedLine === -1) refuse('lane-prestate-mismatch');
      const meta = parsed.lineMeta[blockedLine];
      edits.push(blocker.kind === 'remove'
        ? { start: meta.startOffset, end: meta.endOffset, text: '' }
        : { start: meta.startOffset, end: meta.contentEndOffset, text: `${indent}blocked-by: ${blocker.after}` });
    }
  }

  if (appendRecords.length > 0) {
    if (!parsed.history) refuse('lane-prestate-mismatch');
    if (!parsed.source.endsWith('\n')) refuse('lane-prestate-mismatch');
    edits.push({ start: parsed.source.length, end: parsed.source.length, text: appendRecords.join('') });
  }

  edits.sort((left, right) => left.start - right.start);
  let cursor = 0;
  let out = '';
  for (const edit of edits) {
    if (edit.start < cursor) refuse('lane-prestate-mismatch');
    out += parsed.source.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return `${out}${parsed.source.slice(cursor)}`;
}

/**
 * Write every changed surface, then restore all preimages if any write throws.
 * @param {{absolutePath:string,before:Buffer,after:Buffer}[]} files
 */
function applyAtomically(files) {
  /** @type {{absolutePath:string,before:Buffer,after:Buffer}[]} */
  const written = [];
  try {
    for (const file of files) {
      if (file.before.equals(file.after)) continue;
      // Enrolled BEFORE the write: an open that truncates and then fails to
      // land its data leaves this surface truncated, so it must already be in
      // the rollback set.
      written.push(file);
      fs.writeFileSync(file.absolutePath, file.after);
    }
  } catch {
    restorePreimages(written);
    refuse('atomic-apply-failed');
  }
}

/** @param {{absolutePath:string,before:Buffer}[]} files */
function restorePreimages(files) {
  for (const file of files) {
    try {
      // A surface still holding its preimage (a write that failed at open, or
      // an unchanged surface) is already restored, and rewriting it could fail
      // for the very reason the application failed.
      if (fs.readFileSync(file.absolutePath).equals(file.before)) continue;
      fs.writeFileSync(file.absolutePath, file.before);
      if (!fs.readFileSync(file.absolutePath).equals(file.before)) indeterminate('lightweight-rollback-incomplete');
    } catch (error) {
      if (error instanceof LaneIndeterminateError) throw error;
      indeterminate('lightweight-rollback-incomplete');
    }
  }
}

/**
 * Commit one closed Lightweight wrapper request. Every authoritative value is
 * re-derived here; the caller supplies identity references and expected bytes
 * only.
 * @param {unknown} requestValue @param {{surfaces: ReturnType<typeof resolveLightweightSurfaces>|null}} context
 */
function commitLightweightWorkRequest(requestValue, context) {
  bindObservableSurfaces(requestValue, context);
  if (!isPlainRecord(requestValue)) refuse('invalid-request-shape');
  const operation = requestValue.operation;
  if (operation !== 'work-project' && operation !== 'work-set') refuse('invalid-request-shape');
  const request = exactRecord(requestValue, [
    'version', 'operation', 'root', 'owner', 'target', 'state', 'permit', 'mapping', 'expected', 'mutation',
  ]);
  if (request.version !== 1) refuse('invalid-request-shape');

  const target = requireLightweightTarget(request.target);
  const tasksPath = tasksPathForSpec(target.specPath);
  const owner = exactRecord(request.owner, ['ideaPath', 'specPath', 'ownerCapture', 'ownerBindingHash']);
  if (typeof owner.ideaPath !== 'string' || !IDEA_PATH_RE.test(owner.ideaPath)) refuse('invalid-canonical-value');
  if (owner.specPath !== target.specPath) refuse('target-mismatch');
  const ownerCaptureBytes = requireCapturedBytes(owner.ownerCapture);
  requireHash(owner.ownerBindingHash);
  const ownerBindingHash = sha256(canonicalJson({
    ideaPath: owner.ideaPath,
    specPath: owner.specPath,
    ownerCapture: descriptorOf(ownerCaptureBytes),
  }));
  if (ownerBindingHash !== owner.ownerBindingHash) refuse('owner-resolution-failed');

  const expected = exactRecord(request.expected, ['tasksPath', 'tasks', 'taskStatePath', 'taskState']);
  if (expected.tasksPath !== tasksPath) refuse('invalid-canonical-value');
  if (expected.taskStatePath !== WORKSPACE_PATHS.TASK_STATE) refuse('invalid-canonical-value');
  const expectedTasks = requireCapturedBytes(expected.tasks);
  const expectedTaskState = requireCapturedBytes(expected.taskState);

  // Freshly reacquire every authoritative prestate before any semantic use.
  const surfaces = resolveLightweightSurfaces(request.root, tasksPath, /** @type {string} */ (owner.ideaPath));
  context.surfaces = surfaces;
  const fresh = readLightweightSurfaces(surfaces);
  if (!fresh.tasks.bytes || !fresh.taskState.bytes) refuse('expected-capture-mismatch');
  if (!fresh.owner.bytes) refuse('owner-resolution-failed');
  if (!fresh.tasks.bytes.equals(expectedTasks)) refuse('expected-capture-mismatch');
  if (!fresh.taskState.bytes.equals(expectedTaskState)) refuse('expected-capture-mismatch');
  if (!fresh.owner.bytes.equals(ownerCaptureBytes)) refuse('owner-prestate-mismatch');

  // The unique `status: defined` owner is resolved, never inferred from the
  // caller's idea path.
  const resolved = resolveFeatureOwner({ root: surfaces.root, specPath: target.specPath });
  if (resolved.diagnostics.length !== 0 || !resolved.owner) refuse('owner-resolution-failed');
  if (resolved.owner.ideaPath !== owner.ideaPath) refuse('owner-resolution-failed');

  const snapshot = parseTaskState(fresh.taskState.bytes.toString('utf8'));
  if (snapshot.status === 'corrupt') refuse('snapshot-corrupt');

  const parsed = parseTasks(fresh.tasks.bytes.toString('utf8'), { path: surfaces.tasks.absolutePath });
  if (parsed.boardIssue) refuse('mapping-missing');
  const rows = parsed.tasks.filter((row) => row.id === target.taskKey);
  if (rows.length === 0) refuse('mapping-missing');
  if (rows.length > 1) refuse('mapping-ambiguous');
  const task = rows[0];

  // D-4: the mapping descriptors are compared to real bytes, so
  // `targetMappingHash` can never be a caller-chosen value.
  const mapping = exactRecord(request.mapping, [
    'version', 'lane', 'target', 'ownerBindingHash', 'tasksPath', 'tasksDescriptor',
    'taskStatePath', 'taskStateDescriptor', 'taskKey',
  ]);
  if (mapping.version !== 1 || mapping.lane !== 'lightweight') refuse('mapping-mismatch');
  if (canonicalJson(requireLightweightTarget(mapping.target)) !== canonicalJson(target)) refuse('target-mismatch');
  if (mapping.ownerBindingHash !== ownerBindingHash) refuse('mapping-mismatch');
  if (mapping.tasksPath !== tasksPath) refuse('mapping-mismatch');
  if (mapping.taskStatePath !== WORKSPACE_PATHS.TASK_STATE) refuse('mapping-mismatch');
  if (mapping.taskKey !== target.taskKey) refuse('mapping-mismatch');
  if (canonicalJson(requireDescriptor(mapping.tasksDescriptor)) !== canonicalJson(fresh.tasks.descriptor)) {
    refuse('mapping-mismatch');
  }
  if (canonicalJson(requireDescriptor(mapping.taskStateDescriptor)) !== canonicalJson(fresh.taskState.descriptor)) {
    refuse('mapping-mismatch');
  }
  const targetMappingHash = sha256(canonicalJson(mapping));

  try {
    validateRunState(request.state);
  } catch {
    refuse('invalid-canonical-value');
  }
  const subjectRunStateHash = sha256(canonicalJson(request.state));

  // D-4: the lane prestate is derived from fresh bytes and fresh task facts,
  // never accepted from the caller.
  const prestate = {
    version: 1,
    lane: 'lightweight',
    target,
    glyph: task.glyph,
    blockedBy: task.blockedBy,
    tasksDescriptor: fresh.tasks.descriptor,
    taskStateDescriptor: fresh.taskState.descriptor,
    ownerDescriptor: fresh.owner.descriptor,
  };
  const lanePrestateHash = sha256(canonicalJson(prestate));

  let permit;
  try {
    permit = operation === 'work-project'
      ? validateProjectionPermitV1(request.permit)
      : validateLaneMutationPermitV1(request.permit);
  } catch {
    return refuse('permit-hash-mismatch');
  }
  if (permit.lane !== 'lightweight') refuse('permit-operation-mismatch');
  if (operation === 'work-set' && permit.operation !== 'work-set') refuse('permit-operation-mismatch');
  if (canonicalJson(requireLightweightTarget(permit.target)) !== canonicalJson(target)) refuse('target-mismatch');
  if (permit.subjectRunStateHash !== subjectRunStateHash) refuse('run-state-mismatch');
  if (permit.targetMappingHash !== targetMappingHash) refuse('mapping-mismatch');
  if (permit.lanePrestateHash !== lanePrestateHash) refuse('lane-prestate-mismatch');

  const derived = requireLightweightMutation(request.mutation, operation, target);
  if (permit.mutationIdentity !== derived.mutationIdentity) refuse('mutation-identity-mismatch');
  if (operation === 'work-project' && permit.eventHash !== derived.eventLines.lines[0].eventHash) {
    refuse('event-line-mismatch');
  }
  if (derived.mutation.fromGlyph !== task.glyph) refuse('lane-prestate-mismatch');
  if (derived.blocker.before !== task.blockedBy) refuse('lane-prestate-mismatch');

  const history = parsed.history ? parsed.history.suffix : '';
  const existing = laneHistoryIndex(history);
  /** @type {string[]} */
  const appendRecords = [];
  for (const line of derived.eventLines.lines) {
    const bodies = existing.get(line.eventHash);
    if (bodies && (bodies.size > 1 || !bodies.has(line.exactLine))) refuse('event-conflict');
    if (!bodies) appendRecords.push(`${line.exactLine}\n`);
  }

  const ownerText = fresh.owner.bytes.toString('utf8');
  let ownerNext = ownerText;
  if (derived.ownerLog.kind === 'append-exact') {
    if (derived.ownerLog.ownerPath !== owner.ideaPath) refuse('owner-log-conflict');
    if (derived.ownerLog.expectedOwnerHash !== fresh.owner.descriptor.sha256) refuse('owner-prestate-mismatch');
    if (!ownerText.endsWith('\n')) refuse('owner-log-conflict');
    const ownerLines = new Set(ownerText.split('\n'));
    for (const line of derived.ownerLog.exactLines) {
      if (!ownerLines.has(line)) ownerNext += `${line}\n`;
    }
  }

  const tasksNext = lightweightTasksPostimage(
    parsed,
    task,
    derived.mutation,
    derived.blocker,
    appendRecords,
  );
  const verify = parseTasks(tasksNext, { path: surfaces.tasks.absolutePath });
  const verifyTask = verify.byId.get(target.taskKey);
  if (verify.boardIssue
    || !verifyTask
    || verifyTask.glyph !== derived.mutation.toGlyph
    || verifyTask.blockedBy !== derived.blocker.after) {
    refuse('mutation-schema-mismatch');
  }

  // A permit that would change neither tasks nor owner bytes has already been
  // consumed; only the snapshot timestamp would move.
  if (tasksNext === parsed.source && ownerNext === ownerText) refuse('permit-replayed');

  const merged = { ...(snapshot.status === 'ok' ? snapshot.state : {}) };
  merged[tasksPath] = {
    glyphs: glyphsOf(verify),
    updated_at: `${/** @type {string} */ (derived.mutation.snapshotUpdatedAt).slice(0, -1)}.000Z`,
  };
  /** @type {Record<string, unknown>} */
  const ordered = {};
  for (const key of Object.keys(merged).sort()) ordered[key] = merged[key];
  const taskStateNext = `${JSON.stringify(ordered, null, 2)}\n`;

  const files = [
    { absolutePath: surfaces.tasks.absolutePath, before: fresh.tasks.bytes, after: Buffer.from(tasksNext) },
    { absolutePath: surfaces.taskState.absolutePath, before: fresh.taskState.bytes, after: Buffer.from(taskStateNext) },
    { absolutePath: surfaces.owner.absolutePath, before: fresh.owner.bytes, after: Buffer.from(ownerNext) },
  ];
  applyAtomically(files);

  try {
    // Reacquire the poststate before any receipt exists.
    const post = readLightweightSurfaces(surfaces);
    for (const [observed, file] of [[post.tasks, files[0]], [post.taskState, files[1]], [post.owner, files[2]]]) {
      if (!(/** @type {any} */ (observed).bytes)
        || !(/** @type {any} */ (observed).bytes).equals(/** @type {any} */ (file).after)) {
        refuse('atomic-apply-failed');
      }
    }
    const body = {
      version: 1,
      lane: 'lightweight',
      permitHash: permit.permitHash,
      mutationIdentity: derived.mutationIdentity,
      target,
      targetMappingHash,
      lanePrestateHash,
      tasksPoststateHash: /** @type {any} */ (post.tasks.descriptor).sha256,
      taskStatePoststateHash: /** @type {any} */ (post.taskState.descriptor).sha256,
      ownerPoststateHash: /** @type {any} */ (post.owner.descriptor).sha256,
      targetStateChanged: !['append-event', 'controlled-end'].includes(/** @type {string} */ (derived.mutation.kind)),
    };
    const receipt = { ...body, receiptHash: sha256(canonicalJson(body)) };
    validateLightweightAtomicReceiptV1(receipt);
    return { ok: true, phase: 'committed', receipt };
  } catch (error) {
    restorePreimages(files);
    if (error instanceof LaneIndeterminateError) throw error;
    return refuse('atomic-apply-failed');
  }
}

/**
 * The closed Lightweight `work-project` / `work-set` trust boundary. Returns
 * exactly one `LaneOperationResultV1`; no validator throw escapes, and a
 * refusal leaves every authoritative surface byte-for-byte unchanged.
 * @param {unknown} requestValue
 */
export function applyLightweightWorkRequest(requestValue) {
  /** @type {{surfaces: ReturnType<typeof resolveLightweightSurfaces>|null}} */
  const context = { surfaces: null };
  const observed = () => {
    try {
      return context.surfaces ? observationHash(readLightweightSurfaces(context.surfaces)) : UNOBSERVED_SURFACES_HASH;
    } catch {
      return UNOBSERVED_SURFACES_HASH;
    }
  };
  try {
    return commitLightweightWorkRequest(requestValue, context);
  } catch (error) {
    if (error instanceof LaneIndeterminateError) {
      return { ok: false, phase: 'indeterminate', reason: error.reason, observedEvidenceHash: observed() };
    }
    const reason = error instanceof LaneRefusalError && LANE_REFUSAL_REASONS.has(error.reason)
      ? error.reason
      : 'invalid-request-shape';
    return { ok: false, phase: 'refused', reason, unchangedPrestateHash: observed() };
  }
}

/** @param {string} metaUrl @param {string|undefined} argv1 @returns {boolean} */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}

export { run, parseArgs };

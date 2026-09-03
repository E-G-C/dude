// @ts-check
/**
 * Immutable read-only Now projection used by the Dude canvas.
 *
 * Selection and ownership come from the canonical feature engine, Lightweight
 * work comes from the canonical visible-task parser, and tracked work wins
 * globally when `bd list --all --limit 0 --json` contains any issue. Complete
 * reads retain content identities for focus checks and atomic refresh.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

import { normalizeBeadsIssue } from '../../../skills/dude-engine/lib/beads-issue.mjs';
import {
  CANONICAL_IDEA_KEYS,
  selectLifecycleIdeaSummary,
} from '../../../skills/dude-engine/lib/feature.mjs';
import {
  parseFrontmatterScalars,
  parseSpecIdentity,
} from '../../../skills/dude-engine/lib/feature-identity.mjs';
import {
  nextTask,
  parseVisibleTasks,
  scanMarkdownVisibility,
} from '../../../skills/dude-engine/lib/tasks.mjs';
import { resolveMutationPath } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

const BD_LIST_ARGS = Object.freeze(['list', '--all', '--limit', '0', '--json']);
const BD_READY_ARGS = Object.freeze(['ready', '--json']);
const TRACKED_COMMAND = `bd ${BD_LIST_ARGS.join(' ')}`;
const READY_COMMAND = `bd ${BD_READY_ARGS.join(' ')}`;
const PROJECTION_DEADLINE_MS = 5_000;
const MAX_BD_BUFFER = 8 * 1024 * 1024;
const REFRESH_ACTION = Object.freeze({
  kind: 'refresh',
  label: 'Refresh from repository',
  method: 'POST',
  path: '/api/refresh',
});

/** @param {unknown} value */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/** @param {string | Buffer} bytes */
function contentIdentity(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** @param {ReturnType<typeof selectLifecycleIdeaSummary>['inventory']} inventory */
function inventoryIdentity(inventory) {
  return contentIdentity(JSON.stringify({
    ideas: inventory.ideas,
    packages: inventory.packages,
    features: inventory.features,
    diagnostics: inventory.diagnostics,
  }));
}

/** @param {ReturnType<typeof selectLifecycleIdeaSummary>['inventory']} inventory */
function inventorySource(inventory) {
  return {
    kind: 'inventory',
    label: 'Feature inventory',
    paths: ['.dude/ideas', '.dude/specs'],
    role: 'selection',
    contentIdentity: inventoryIdentity(inventory),
  };
}

/**
 * @param {string} label
 * @param {string} inputPath
 * @param {string} role
 * @param {Buffer} bytes
 * @param {Record<string, unknown>} [details]
 */
function fileSource(label, inputPath, role, bytes, details) {
  return {
    kind: 'file',
    label,
    path: inputPath,
    role,
    contentIdentity: contentIdentity(bytes),
    ...(details ? { details } : {}),
  };
}

/**
 * @param {string} label
 * @param {string} command
 * @param {string} role
 * @param {string} identity
 */
function trackedSource(label, command, role, identity) {
  return {
    kind: 'tracked',
    label,
    command,
    role,
    contentIdentity: identity,
  };
}

class ProjectionInputError extends Error {
  /**
   * @param {string} code
   * @param {string} inputPath
   * @param {string} message
   */
  constructor(code, inputPath, message) {
    super(message);
    this.code = code;
    this.path = inputPath;
  }
}

class TrackedQueryError extends Error {
  /** @param {'TRACKED_AUTHORITY_UNAVAILABLE'|'TRACKED_READINESS_UNAVAILABLE'} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

class TrackedFactConflict extends Error {
  /** @param {'TRACKED_READINESS_CONFLICT'|'TRACKED_BLOCKER_CONFLICT'} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * @typedef {object} ProjectionOperationOptions
 * @property {AbortSignal} [signal]
 * @property {number} [timeoutMs]
 * @property {(args:string[], options:Record<string, unknown>) => Promise<{
 *   error?:unknown,status:number|null,stdout?:string|Buffer,stderr?:string|Buffer
 * }>|{
 *   error?:unknown,status:number|null,stdout?:string|Buffer,stderr?:string|Buffer
 * }} [runBd]
 */

/**
 * The callback fires only after the child has exited and its stdio has closed.
 * Abort, timeout, and max-buffer failures therefore do not settle acquisition
 * while an unreaped child remains.
 * @param {string[]} args
 * @param {Record<string, unknown>} options
 */
function runBdProcess(args, options) {
  return new Promise((resolve) => {
    let callbackResult = null;
    let closed = false;
    const settle = () => {
      if (callbackResult && closed) resolve(callbackResult);
    };
    try {
      const child = execFile('bd', args, options, (error, stdout, stderr) => {
        callbackResult = {
          error,
          status: error
            ? (typeof /** @type {NodeJS.ErrnoException} */ (error).code === 'number'
                ? /** @type {number} */ (/** @type {NodeJS.ErrnoException} */ (error).code)
                : null)
            : 0,
          stdout,
          stderr,
        };
        settle();
      });
      child.once('close', () => {
        closed = true;
        settle();
      });
    } catch (error) {
      resolve({ error, status: null, stdout: '', stderr: '' });
    }
  });
}

/**
 * One lazily-started deadline is shared by every Beads command in an operation.
 * @param {ProjectionOperationOptions} options
 */
function projectionOperation(options) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs === undefined
    ? PROJECTION_DEADLINE_MS
    : Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0
      ? options.timeoutMs
      : PROJECTION_DEADLINE_MS;
  let deadline = null;
  let timer = null;
  const cancel = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) cancel();
    else options.signal.addEventListener('abort', cancel, { once: true });
  }
  return {
    signal: controller.signal,
    runBd: options.runBd ?? runBdProcess,
    remaining() {
      if (deadline === null) {
        deadline = performance.now() + timeoutMs;
        if (timeoutMs === 0) {
          controller.abort();
        } else {
          timer = setTimeout(cancel, timeoutMs);
        }
      }
      return Math.max(0, deadline - performance.now());
    },
    dispose() {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    },
  };
}

/**
 * @param {ReturnType<typeof projectionOperation>} operation
 * @param {string} root
 * @param {string[]} args
 * @param {'TRACKED_AUTHORITY_UNAVAILABLE'|'TRACKED_READINESS_UNAVAILABLE'} unavailableCode
 */
async function invokeBd(operation, root, args, unavailableCode) {
  const remaining = operation.remaining();
  if (operation.signal.aborted || remaining <= 0) throw new TrackedQueryError(unavailableCode);

  let result;
  try {
    result = await operation.runBd(args, {
      cwd: root,
      detached: false,
      encoding: 'utf8',
      killSignal: 'SIGKILL',
      maxBuffer: MAX_BD_BUFFER,
      shell: false,
      signal: operation.signal,
      timeout: Math.max(1, Math.ceil(remaining)),
    });
  } catch {
    throw new TrackedQueryError(unavailableCode);
  }
  const stdout = result?.stdout ?? '';
  const stderr = result?.stderr ?? '';
  if (operation.signal.aborted
    || operation.remaining() <= 0
    || result?.error
    || result?.status !== 0
    || Buffer.byteLength(String(stdout)) > MAX_BD_BUFFER
    || Buffer.byteLength(String(stderr)) > MAX_BD_BUFFER) {
    throw new TrackedQueryError(unavailableCode);
  }
  return stdout;
}

/** @param {unknown} error */
function isMissing(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

/**
 * Keep canonical engine diagnostics useful without exposing the host's absolute
 * repository location.
 * @param {string} root
 * @param {Array<{code:string,severity:'error'|'warning',path:string,message:string}>} diagnostics
 */
function boundedDiagnostics(root, diagnostics) {
  const absoluteRoot = path.resolve(root);
  const hostForms = [absoluteRoot, absoluteRoot.replace(/\\/g, '/')];
  return diagnostics.map((diagnostic) => {
    const diagnosticPath = String(diagnostic.path).replace(/\\/g, '/');
    const boundedPath = diagnosticPath === '.'
      || (!path.posix.isAbsolute(diagnosticPath)
        && !path.win32.isAbsolute(diagnosticPath)
        && diagnosticPath.split('/').every((part) => part && part !== '.' && part !== '..'))
      ? diagnosticPath
      : '.';
    const exposesFilesystemDetail = hostForms.some((hostPath) => diagnostic.message.includes(hostPath))
      || /\b(?:EACCES|ELOOP|ENOENT|ENOTDIR|EPERM)\b/.test(diagnostic.message)
      || /(?:^|[\s'"])(?:\/[^/\s'"]|[A-Za-z]:[\\/])/.test(diagnostic.message);
    return {
      ...diagnostic,
      path: boundedPath,
      message: exposesFilesystemDetail
        ? `Canonical repository input failed validation (${diagnostic.code}).`
        : diagnostic.message,
    };
  });
}

/** @param {unknown} error */
function projectionErrorDiagnostic(error) {
  if (error instanceof ProjectionInputError) {
    return {
      code: error.code,
      severity: /** @type {'error'} */ ('error'),
      path: error.path,
      message: error.message,
    };
  }
  return {
    code: 'PROJECTION_UNAVAILABLE',
    severity: /** @type {'error'} */ ('error'),
    path: '.',
    message: 'The projection could not be read from canonical repository state.',
  };
}

/**
 * Read one existing regular file through the engine's repository-contained,
 * no-symbolic-link path boundary.
 * @param {string} root
 * @param {string} relativePath
 */
function readSafeFile(root, relativePath) {
  let absolutePath;
  try {
    absolutePath = resolveMutationPath(root, relativePath);
  } catch {
    throw new ProjectionInputError(
      'PROJECTION_INPUT_UNSAFE',
      relativePath,
      'Canonical input is outside the safe repository file boundary.',
    );
  }

  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
  } catch (error) {
    throw new ProjectionInputError(
      isMissing(error) ? 'PROJECTION_INPUT_MISSING' : 'PROJECTION_INPUT_UNREADABLE',
      relativePath,
      isMissing(error)
        ? 'Canonical input file is missing.'
        : 'Canonical input file could not be read.',
    );
  }
  if (!stat.isFile()) {
    throw new ProjectionInputError(
      'PROJECTION_INPUT_NOT_FILE',
      relativePath,
      'Canonical input is not a regular file.',
    );
  }
  try {
    return fs.readFileSync(absolutePath);
  } catch {
    throw new ProjectionInputError(
      'PROJECTION_INPUT_UNREADABLE',
      relativePath,
      'Canonical input file could not be read.',
    );
  }
}

/**
 * The Beads pack's canonical query shape is an array or `{ issues: [...] }`.
 * Require string descriptions because their first line is the exact feature
 * identity. Unknown shapes are never treated as empty authority.
 * @param {string | Buffer} bytes
 * @param {string} command
 */
function parseBeadsIssues(bytes, command) {
  let decoded;
  try {
    decoded = JSON.parse(String(bytes));
  } catch {
    throw new Error(`${command} returned malformed JSON`);
  }
  const issues = Array.isArray(decoded)
    ? decoded
    : decoded && typeof decoded === 'object' && !Array.isArray(decoded) && Array.isArray(decoded.issues)
      ? decoded.issues
      : null;
  if (!issues) throw new Error(`${command} returned an unrecognized JSON shape`);
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)
      || typeof issue.description !== 'string') {
      throw new Error(`${command} returned a malformed issue at index ${index}`);
    }
  }
  return /** @type {Record<string, unknown>[]} */ (issues);
}

/**
 * Validate the shared authority fields in the complete inventory. Any
 * executable issue that can become the projected next step or blocker must also
 * carry its own usable identity and title.
 * @param {string | Buffer} bytes
 */
function parseTrackedIssues(bytes) {
  const issues = parseBeadsIssues(bytes, TRACKED_COMMAND);
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    const normalized = normalizeBeadsIssue(issue);
    if (!normalized.isEpic
      && (normalized.status === 'open'
        || normalized.status === 'in_progress'
        || normalized.status === 'blocked')
      && (!issueId(issue) || !meaningfulString(issue.title))) {
      throw new Error(`${TRACKED_COMMAND} returned a malformed issue at index ${index}`);
    }
  }
  return issues;
}

/**
 * Query global tracked authority. Command and payload failures are authority
 * failures and must not fall through to markdown.
 * @param {string} root
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function queryTrackedIssues(root, operation) {
  const stdout = await invokeBd(operation, root, BD_LIST_ARGS, 'TRACKED_AUTHORITY_UNAVAILABLE');
  try {
    const issues = parseTrackedIssues(stdout);
    return { issues, identity: contentIdentity(JSON.stringify(issues)) };
  } catch {
    throw new TrackedQueryError('TRACKED_AUTHORITY_UNAVAILABLE');
  }
}

/**
 * Query the workflow's canonical readiness authority. Once the complete board
 * is populated, every readiness failure is an authority failure.
 * @param {string} root
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function queryReadyIssues(root, operation) {
  const stdout = await invokeBd(operation, root, BD_READY_ARGS, 'TRACKED_READINESS_UNAVAILABLE');
  try {
    const issues = parseBeadsIssues(stdout, READY_COMMAND);
    return { issues, identity: contentIdentity(JSON.stringify(issues)) };
  } catch {
    throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
  }
}

/**
 * @param {string} root
 * @param {Record<string, any>} source
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function currentTrackedIdentity(root, source, operation) {
  if (source.command === TRACKED_COMMAND) return (await queryTrackedIssues(root, operation)).identity;
  if (source.command === READY_COMMAND) return (await queryReadyIssues(root, operation)).identity;
  throw new Error('tracked projection source is unsupported');
}

/** @param {Record<string, unknown>} issue */
function exactIssueSpec(issue) {
  return String(issue.description).split(/\r?\n/, 1)[0];
}

/** @param {unknown} value */
function meaningfulString(value) {
  return typeof value === 'string' && value.trim() ? value : '';
}

/** Keep internal workflow notation out of primary orientation prose. */
function orientationText(value) {
  return String(value)
    .replace(/\bT\d{3,}@[a-z0-9]{8}\b/gi, 'task')
    .replace(/\bDefinition\s+Only\b/g, 'definition')
    .replace(/\bLightweight(?:\s+Execution)?\b/g, 'canonical task work')
    .replace(/\bTracked(?:\s+Execution)?\b/g, 'tracked board work')
    .replace(/\[(?: |~|!|x)\]/gi, '')
    .replace(/\bsha256:[a-f0-9]{64}\b/gi, 'content identity')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** @param {Record<string, unknown>} issue */
function issueId(issue) {
  return meaningfulString(issue.id) || meaningfulString(issue.issue_id);
}

/** @param {Record<string, unknown>} issue */
function issueTitle(issue) {
  return meaningfulString(issue.title);
}

/**
 * Count only confidently recognized unanswered entries in the canonical
 * user-owned Open Questions section. Unrecognized structure returns `null`.
 * @param {Buffer} bytes
 */
function countOpenQuestions(bytes) {
  let visible;
  try {
    visible = scanMarkdownVisibility(bytes, 'selected idea', 'generic').lines.map((line) => line.text);
  } catch {
    return null;
  }
  const starts = visible
    .map((line, index) => /^##[ \t]+Open Questions(?:[ \t]+#+)?[ \t]*$/.test(line) ? index : -1)
    .filter((index) => index >= 0);
  if (starts.length !== 1) return null;
  const start = starts[0] + 1;
  let end = visible.length;
  for (let index = start; index < visible.length; index += 1) {
    if (/^##[ \t]+\S/.test(visible[index])) {
      end = index;
      break;
    }
  }
  const section = visible.slice(start, end);
  const text = section.join('\n').trim();
  if (/^(?:-\s*)?None\.?$/i.test(text) || /^No current open questions\b/i.test(text)) return 0;

  const questions = [];
  for (let index = 0; index < section.length; index += 1) {
    if (/^\s*\d+\.\s+.+\?\s*$/.test(section[index])) questions.push(index);
  }
  if (questions.length === 0) return text ? null : 0;
  let unanswered = 0;
  for (let index = 0; index < questions.length; index += 1) {
    const body = section.slice(questions[index] + 1, questions[index + 1] ?? section.length);
    if (!body.some((line) => /^\s*Answer:\s*\S/.test(line))) unanswered += 1;
  }
  return unanswered;
}

/** @param {string | null} blockedBy */
function blockerParts(blockedBy) {
  const text = blockedBy || 'Blocked in the authoritative task board.';
  const match = /^([a-z][a-z-]+):\s*(.+)$/i.exec(text);
  return {
    classification: match ? match[1] : null,
    reason: match ? match[2] : text,
  };
}

/**
 * Ready output orders candidates but cannot supply their facts. A candidate is
 * usable only when its exact identity resolves to one agreeing complete-list
 * record.
 * @param {Record<string, unknown>[]} readyIssues
 * @param {Record<string, unknown>[]} listIssues
 * @param {string} specLine
 */
function correlateReadyIssues(readyIssues, listIssues, specLine) {
  const correlated = [];
  for (const readyIssue of readyIssues) {
    const id = issueId(readyIssue);
    if (!id) throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
    const matches = listIssues.filter((listIssue) => issueId(listIssue) === id);

    if (matches.length === 0) {
      let readyNormalized;
      try {
        readyNormalized = normalizeBeadsIssue(readyIssue);
      } catch {
        throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
      }
      const isCandidate = !readyNormalized.isEpic && readyNormalized.status === 'open';
      if (!isCandidate) continue;
      if (!issueTitle(readyIssue)) {
        throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
      }
      const readySpecLine = exactIssueSpec(readyIssue);
      if (readySpecLine === specLine) {
        throw new TrackedFactConflict('TRACKED_READINESS_CONFLICT');
      }
      const otherSpec = readySpecLine.startsWith('spec: ')
        ? parseSpecIdentity(readySpecLine.slice('spec: '.length))
        : null;
      if (otherSpec) continue;
      throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
    }
    if (matches.length > 1) {
      const selectedIdentityIsInvolved = exactIssueSpec(readyIssue) === specLine
        || matches.some((listIssue) => exactIssueSpec(listIssue) === specLine);
      if (selectedIdentityIsInvolved) {
        throw new TrackedFactConflict('TRACKED_READINESS_CONFLICT');
      }
      continue;
    }

    const listIssue = matches[0];
    let readyNormalized;
    try {
      readyNormalized = normalizeBeadsIssue(readyIssue);
    } catch {
      throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
    }
    const listNormalized = normalizeBeadsIssue(listIssue);
    if (readyIssue.title !== listIssue.title
      || readyIssue.description !== listIssue.description
      || readyNormalized.status !== listNormalized.status
      || readyNormalized.isEpic !== listNormalized.isEpic) {
      throw new TrackedFactConflict('TRACKED_READINESS_CONFLICT');
    }
    const isCandidate = !readyNormalized.isEpic && readyNormalized.status === 'open';
    if (exactIssueSpec(listIssue) !== specLine || !isCandidate) continue;
    correlated.push({ issue: listIssue, normalized: listNormalized });
  }
  return correlated;
}

/**
 * Imported blocker metadata is authoritative only as one exact, nonempty line.
 * @param {Record<string, unknown>} issue
 */
function trackedBlocker(issue) {
  const matches = String(issue.description).split(/\r?\n/)
    .map((line) => /^Blocked-by: (.+)$/.exec(line))
    .filter((match) => match && match[1].trim());
  if (matches.length > 1) throw new TrackedFactConflict('TRACKED_BLOCKER_CONFLICT');
  if (matches.length === 0) return null;
  return blockerParts(/** @type {RegExpExecArray} */ (matches[0])[1]);
}

/** @param {TrackedQueryError['code']} code */
function trackedUnavailableDiagnostic(code) {
  return {
    code,
    severity: /** @type {'error'} */ ('error'),
    path: '.',
    message: code === 'TRACKED_AUTHORITY_UNAVAILABLE'
      ? 'Tracked authority is unavailable or malformed.'
      : 'Tracked readiness authority is unavailable or malformed.',
  };
}

/** @param {TrackedFactConflict['code']} code */
function trackedConflictDiagnostic(code) {
  return {
    code,
    severity: /** @type {'error'} */ ('error'),
    path: '.',
    message: code === 'TRACKED_BLOCKER_CONFLICT'
      ? 'Tracked blocker metadata is conflicting.'
      : 'Tracked readiness disagrees with the complete tracked authority.',
  };
}

function projectionBase() {
  return {
    complete: false,
    status: 'unavailable',
    readAt: null,
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
    sources: [],
    action: null,
  };
}

/**
 * @param {Array<{code:string,severity:'error'|'warning',path:string,message:string}>} diagnostics
 */
function attentionFrom(diagnostics) {
  return diagnostics.map(({ code, severity, message }) => ({
    code,
    severity,
    message: orientationText(message),
  }));
}

/**
 * @param {Array<{code:string,severity:'error'|'warning',path:string,message:string}>} diagnostics
 */
function failedReadReason(diagnostics) {
  const codes = diagnostics.map((diagnostic) => diagnostic.code);
  if (codes.some((code) => /(?:CONFLICT|DUPLICATE|MISMATCH)/.test(code))) {
    return 'Canonical feature state is conflicting.';
  }
  if (codes.includes('TRACKED_AUTHORITY_UNAVAILABLE')
    || codes.includes('TRACKED_READINESS_UNAVAILABLE')) {
    return 'Tracked authority could not be read.';
  }
  if (codes.includes('TASKS_MALFORMED')) {
    return 'Canonical task state is malformed.';
  }
  if (codes.some((code) => code.startsWith('PROJECTION_INPUT_'))) {
    return 'A canonical projection input could not be read completely.';
  }
  return diagnostics[0]
    ? orientationText(diagnostics[0].message)
    : 'Canonical repository state could not be read completely.';
}

/**
 * @param {ReturnType<typeof projectionBase>} base
 * @param {Array<{code:string,severity:'error'|'warning',path:string,message:string}>} diagnostics
 * @param {Record<string, unknown>} [facts]
 */
function failedProjection(base, diagnostics, facts = {}) {
  return /** @type {ReturnType<typeof projectionBase>} */ (deepFreeze({
    ...base,
    ...facts,
    complete: false,
    status: 'unavailable',
    readAt: null,
    attemptedAt: new Date().toISOString(),
    next: null,
    nextReason: failedReadReason(diagnostics),
    blockers: [],
    tasks: null,
    phases: [],
    attention: attentionFrom(diagnostics),
    diagnostics,
    sources: [],
    action: REFRESH_ACTION,
  }));
}

/** @param {Buffer} ideaBytes */
function selectedTitle(ideaBytes) {
  try {
    const frontmatter = parseFrontmatterScalars(String(ideaBytes), {
      canonicalKeys: CANONICAL_IDEA_KEYS,
    });
    const title = frontmatter.scalars.get('title')?.value;
    return meaningfulString(title) ? orientationText(title) : null;
  } catch {
    return null;
  }
}

/** @param {string} value */
function eventInstant(value) {
  const date = /^(\d{4})-(\d{2})-(\d{2})(?: UTC)?$/.exec(value);
  const timestamp = date
    ? null
    : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value);
  const parts = date ?? timestamp;
  if (!parts) return null;

  const [year, month, day] = parts.slice(1, 4).map(Number);
  const hour = timestamp ? Number(timestamp[4]) : 0;
  const minute = timestamp ? Number(timestamp[5]) : 0;
  const second = timestamp ? Number(timestamp[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31
    || hour > 23 || minute > 59 || second > 59) return null;

  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  if (instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day) return null;
  return instant.getTime();
}

/**
 * Read exact dated list entries from one canonical Markdown section. No prose
 * is invented: recent entries are bounded, while the count names omitted rows.
 * @param {Buffer} bytes
 * @param {string} heading
 */
function sectionEvents(bytes, heading) {
  let lines;
  try {
    lines = scanMarkdownVisibility(bytes, 'selected feature', 'generic').lines.map((line) => line.text);
  } catch {
    return [];
  }
  const starts = lines
    .map((line, index) => line === `## ${heading}` ? index : -1)
    .filter((index) => index >= 0);
  if (starts.length !== 1) return [];
  const events = [];
  let current = null;
  for (let index = starts[0] + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##[ \t]+\S/.test(line)) break;
    const match = /^-\s+((?:\d{4}-\d{2}-\d{2}(?: UTC)?)|(?:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z))\s+-\s+(.+)$/.exec(line);
    const instant = match ? eventInstant(match[1]) : null;
    if (match && instant !== null) {
      current = { date: match[1], text: match[2], instant };
      events.push(current);
    } else if (current && /^\s{2,}\S/.test(line)) {
      current.text += ` ${line.trim()}`;
    } else if (line.trim()) {
      current = null;
    }
  }
  return events;
}

/**
 * Later document/source order breaks an exact-instant tie. Callers provide the
 * Coordinator Log before the Revision Log, preserving the prior Revision Log
 * preference only when timestamps are equal.
 * @param {Array<{events:ReturnType<typeof sectionEvents>,path:string,section:string}>} sections
 */
function latestSectionEvent(sections) {
  let latest = null;
  let order = 0;
  for (const section of sections) {
    for (const event of section.events) {
      const candidate = { event, source: section, order };
      order += 1;
      if (!latest
        || event.instant > latest.event.instant
        || (event.instant === latest.event.instant && candidate.order > latest.order)) {
        latest = candidate;
      }
    }
  }
  return latest
    ? {
        date: latest.event.date,
        text: orientationText(latest.event.text),
        source: { path: latest.source.path, section: latest.source.section },
      }
    : null;
}

/**
 * @param {ReturnType<typeof parseVisibleTasks>['parsed']} parsed
 */
function taskProjection(parsed) {
  const counts = { total: parsed.tasks.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const task of parsed.tasks) {
    if (task.state === 'todo') counts.open += 1;
    else if (task.state === 'in-progress') counts.inProgress += 1;
    else if (task.state === 'blocked') counts.blocked += 1;
    else if (task.state === 'done') counts.done += 1;
  }

  /** @type {Map<string, {name:string,heading:string,tasks:typeof parsed.tasks}>} */
  const grouped = new Map();
  let heading = 'Work';
  let taskIndex = 0;
  for (let line = 0; line < parsed.lines.length && taskIndex < parsed.tasks.length; line += 1) {
    const headingMatch = /^#{2,3}\s+(.+?)\s*$/.exec(parsed.lines[line]);
    if (headingMatch) heading = headingMatch[1];
    while (parsed.tasks[taskIndex]?.headerLine === line) {
      const name = orientationText(heading.replace(/^Phase\s+\d+\s*:\s*/i, '')) || 'Work';
      const group = grouped.get(heading) ?? { name, heading, tasks: [] };
      group.tasks.push(parsed.tasks[taskIndex]);
      grouped.set(heading, group);
      taskIndex += 1;
    }
  }

  const phases = [...grouped.values()].map((group) => {
    const phaseCounts = { total: group.tasks.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
    for (const task of group.tasks) {
      if (task.state === 'todo') phaseCounts.open += 1;
      else if (task.state === 'in-progress') phaseCounts.inProgress += 1;
      else if (task.state === 'blocked') phaseCounts.blocked += 1;
      else if (task.state === 'done') phaseCounts.done += 1;
    }
    const state = phaseCounts.done === phaseCounts.total
      ? 'done'
      : phaseCounts.inProgress > 0 || phaseCounts.blocked > 0
        ? 'current'
        : 'upcoming';
    return { name: group.name, ...phaseCounts, state };
  });
  const details = [...grouped.values()].map((group) => ({
    heading: group.heading,
    taskKeys: group.tasks.map((task) => task.id),
  }));
  return { counts, phases, details };
}

/** @param {Array<{normalized:ReturnType<typeof normalizeBeadsIssue>}>} executable */
function trackedTaskCounts(executable) {
  const counts = { total: executable.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const { normalized } of executable) {
    if (normalized.status === 'open') counts.open += 1;
    else if (normalized.status === 'in_progress') counts.inProgress += 1;
    else if (normalized.status === 'blocked') counts.blocked += 1;
    else if (normalized.status === 'closed') counts.done += 1;
  }
  return counts;
}

/**
 * Re-read selected files and tracked authority, then reselect from the bounded
 * lifecycle summary so inventory changes cannot publish a mixed projection.
 * Summary selection does not read unselected package documents.
 * @param {string} root
 * @param {Array<Record<string, any>>} sources
 * @param {string | undefined} target
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function verifySelectedSources(root, sources, target, operation) {
  for (const source of sources) {
    if (source.kind === 'inventory') continue;
    let current;
    if (source.kind === 'file') current = contentIdentity(readSafeFile(root, source.path));
    else if (source.kind === 'tracked') {
      try {
        current = await currentTrackedIdentity(root, source, operation);
      } catch (error) {
        if (error instanceof TrackedQueryError) return trackedUnavailableDiagnostic(error.code);
        throw error;
      }
    }
    else continue;
    if (current !== source.contentIdentity) {
      return {
        code: 'PROJECTION_READ_CONFLICT',
        severity: /** @type {'error'} */ ('error'),
        path: source.kind === 'file' ? source.path : '.',
        message: 'Canonical repository state changed while the projection was being read.',
      };
    }
  }
  const inventory = sources.find((source) => source.kind === 'inventory');
  if (inventory) {
    const current = inventoryIdentity(selectLifecycleIdeaSummary({ root, target }).inventory);
    if (current !== inventory.contentIdentity) {
      return {
        code: 'PROJECTION_READ_CONFLICT',
        severity: /** @type {'error'} */ ('error'),
        path: '.',
        message: 'Canonical repository state changed while the projection was being read.',
      };
    }
  }
  return null;
}

/**
 * @param {string} root
 * @param {ReturnType<typeof projectionBase> & Record<string, any>} projection
 * @param {Array<Record<string, any>>} sources
 * @param {string | undefined} target
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function completeProjection(root, projection, sources, target, operation) {
  try {
    const conflict = await verifySelectedSources(root, sources, target, operation);
    if (conflict) {
      const unavailable = conflict.code === 'TRACKED_AUTHORITY_UNAVAILABLE'
        || conflict.code === 'TRACKED_READINESS_UNAVAILABLE';
      return failedProjection(projectionBase(), [conflict], {
        selected: projection.selected,
        unansweredQuestions: projection.unansweredQuestions,
        ...(unavailable && conflict.code === 'TRACKED_READINESS_UNAVAILABLE'
          ? { authority: 'tracked' }
          : {}),
      });
    }
  } catch {
    return failedProjection(projectionBase(), [{
      code: 'PROJECTION_READ_CONFLICT',
      severity: 'error',
      path: '.',
      message: 'Canonical repository state changed or became unavailable while the projection was being read.',
    }], { selected: projection.selected });
  }
  return deepFreeze({
    ...projection,
    complete: true,
    status: projection.status,
    readAt: new Date().toISOString(),
    attemptedAt: null,
    sources,
  });
}

/** @param {unknown} projection */
function projectionReadAt(projection) {
  return projection && typeof projection === 'object'
    && 'readAt' in projection && typeof projection.readAt === 'string'
    ? projection.readAt
    : null;
}

/**
 * @param {'current'|'changed'|'stale'|'unavailable'|'conflict'} state
 * @param {unknown} projection
 * @param {string} message
 * @param {Array<Record<string, unknown>>} [diagnostics]
 */
function freshnessResult(state, projection, message, diagnostics = []) {
  return deepFreeze({
    state,
    checkedAt: new Date().toISOString(),
    readAt: projectionReadAt(projection),
    message,
    diagnostics,
    nextAction: REFRESH_ACTION,
  });
}

/** @param {unknown} projection */
export function initialProjectionFreshness(projection) {
  if (projection && typeof projection === 'object' && projection.complete === true) {
    return freshnessResult('current', projection, 'Every authoritative source matches the last complete read.');
  }
  return freshnessResult('unavailable', projection, 'No complete projection is available.');
}

/**
 * Compare current source identities without creating or replacing a projection.
 * @param {{root:string,projection:unknown}} input
 * @param {ProjectionOperationOptions} [options]
 */
export async function checkProjectionFreshness(input, options = {}) {
  const operation = projectionOperation(options);
  try {
    return await checkProjectionFreshnessWithOperation(input, operation);
  } finally {
    operation.dispose();
  }
}

/**
 * @param {{root:string,projection:unknown}} input
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function checkProjectionFreshnessWithOperation({ root, projection }, operation) {
  if (!projection || typeof projection !== 'object' || projection.complete !== true
    || !Array.isArray(projection.sources)) {
    return freshnessResult('unavailable', projection, 'No complete projection is available to check.');
  }
  try {
    for (const source of projection.sources) {
      let current;
      if (source.kind === 'inventory') {
        current = inventoryIdentity(selectLifecycleIdeaSummary({ root }).inventory);
      } else if (source.kind === 'file' && typeof source.path === 'string') {
        current = contentIdentity(readSafeFile(root, source.path));
      } else if (source.kind === 'tracked') {
        current = await currentTrackedIdentity(root, source, operation);
      } else {
        return freshnessResult('unavailable', projection, 'Projection source identities are unavailable.');
      }
      if (current !== source.contentIdentity) {
        return freshnessResult(
          'changed',
          projection,
          'Authoritative repository content changed after the last complete read.',
        );
      }
    }
    return freshnessResult('current', projection, 'Every authoritative source matches the last complete read.');
  } catch {
    return freshnessResult(
      'unavailable',
      projection,
      'Authoritative source identities could not be read safely.',
    );
  }
}

/** @param {Array<{code?:unknown}>} diagnostics */
function failedRefreshState(diagnostics) {
  const codes = diagnostics.map((diagnostic) => String(diagnostic.code ?? ''));
  if (codes.some((code) => /(?:CONFLICT|DUPLICATE|MISMATCH)/.test(code))) return 'conflict';
  if (codes.some((code) => (
    code === 'TRACKED_AUTHORITY_UNAVAILABLE'
    || code === 'TRACKED_READINESS_UNAVAILABLE'
    || code === 'PROJECTION_UNAVAILABLE'
    || code.includes('ROOT_UNSAFE')
    || code.includes('UNREADABLE')
  ))) return 'unavailable';
  return 'stale';
}

/**
 * Build one successor and return it only when the complete read succeeds.
 * @param {{root:string,target?:string,previous:unknown}} input
 * @param {ProjectionOperationOptions} [options]
 */
export async function refreshNowProjection(input, options = {}) {
  const operation = projectionOperation(options);
  try {
    const { root, target, previous } = input;
    const successor = await readNowProjectionWithOperation({ root, target }, operation);
    if (successor.complete === true) {
      return deepFreeze({
        replaced: true,
        projection: successor,
        freshness: freshnessResult('current', successor, 'Refresh completed from one complete read.'),
      });
    }
    const diagnostics = Array.isArray(successor.diagnostics) ? successor.diagnostics : [];
    const state = failedRefreshState(diagnostics);
    return deepFreeze({
      replaced: false,
      projection: previous,
      freshness: freshnessResult(
        state,
        previous,
        state === 'conflict'
          ? 'Refresh found conflicting canonical state; the last complete read was preserved.'
          : state === 'unavailable'
            ? 'Refresh could not read authoritative state; the last complete read was preserved.'
            : 'Refresh did not complete; the last complete read was preserved.',
        diagnostics,
      ),
    });
  } finally {
    operation.dispose();
  }
}

/**
 * @param {{root:string,target?:string}} input
 * @param {ProjectionOperationOptions} [options]
 */
export async function readNowProjection(input, options = {}) {
  const operation = projectionOperation(options);
  try {
    return await readNowProjectionWithOperation(input, operation);
  } finally {
    operation.dispose();
  }
}

/**
 * @param {{root:string,target?:string}} input
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function readNowProjectionWithOperation({ root, target }, operation) {
  const base = projectionBase();

  try {
    const lifecycle = selectLifecycleIdeaSummary({ root, target });
    const { inventory } = lifecycle;
    const inventoryDiagnostics = boundedDiagnostics(root, lifecycle.diagnostics);
    if (inventoryDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return failedProjection(base, inventoryDiagnostics);
    }
    /** @type {Array<Record<string, any>>} */
    const sources = [inventorySource(inventory)];

    const { idea, owner, explicit } = lifecycle;
    if (!idea) {
      const choices = lifecycle.choices.map((candidate) => ({
        ideaPath: candidate.ideaPath,
        slug: candidate.slug,
        specPath: candidate.status === 'defined' ? candidate.specPath : null,
      }));
      return await completeProjection(root, {
        ...base,
        status: 'choose',
        diagnostics: inventoryDiagnostics,
        attention: attentionFrom(inventoryDiagnostics),
        choices,
        action: choices.length > 0
          ? {
              kind: 'select-feature',
              label: 'Select a feature',
              method: 'POST',
              path: '/api/refresh',
            }
          : REFRESH_ACTION,
      }, sources, target, operation);
    }

    const ideaBytes = readSafeFile(root, idea.ideaPath);
    const coordinatorEvents = sectionEvents(ideaBytes, 'Coordinator Log');
    sources.push(fileSource('Idea', idea.ideaPath, 'identity', ideaBytes, {
      section: 'Coordinator Log',
      eventCount: coordinatorEvents.length,
      recentEvents: coordinatorEvents.slice(-5).reverse()
        .map(({ date, text }) => ({ date, text })),
    }));
    const eventSections = [{
      events: coordinatorEvents,
      path: idea.ideaPath,
      section: 'Coordinator Log',
    }];
    const selected = {
      title: selectedTitle(ideaBytes),
      ideaPath: idea.ideaPath,
      slug: idea.slug,
      specPath: owner?.specPath ?? null,
      explicit,
    };
    const questions = countOpenQuestions(ideaBytes);
    const activity = coordinatorEvents.length > 0
      ? {
          total: coordinatorEvents.length,
          recent: coordinatorEvents.slice(-5).reverse()
            .map((event) => ({ date: event.date, text: orientationText(event.text) })),
        }
      : null;
    let latestEvent = latestSectionEvent(eventSections);

    if (idea.status === 'resolved') {
      return await completeProjection(root, {
        ...base,
        status: 'ok',
        selected,
        authority: 'definition',
        stage: 'Completed without a package',
        nextReason: 'This idea is resolved.',
        unansweredQuestions: questions,
        activity,
        latestEvent,
        diagnostics: inventoryDiagnostics,
        attention: attentionFrom(inventoryDiagnostics),
      }, sources, target, operation);
    }

    if (owner) {
      const specBytes = readSafeFile(root, owner.specPath);
      const revisions = sectionEvents(specBytes, 'Revision Log');
      sources.push(fileSource('Specification', owner.specPath, 'definition', specBytes, {
        section: 'Revision Log',
        eventCount: revisions.length,
        recentEvents: revisions.slice(-5).reverse()
          .map(({ date, text }) => ({ date, text })),
      }));
      eventSections.push({
        events: revisions,
        path: owner.specPath,
        section: 'Revision Log',
      });
      latestEvent = latestSectionEvent(eventSections);
    }

    let tracked;
    try {
      tracked = await queryTrackedIssues(root, operation);
    } catch (error) {
      const diagnostic = error instanceof TrackedQueryError
        ? trackedUnavailableDiagnostic(error.code)
        : trackedUnavailableDiagnostic('TRACKED_AUTHORITY_UNAVAILABLE');
      return failedProjection(base, [diagnostic], {
        selected,
        unansweredQuestions: questions,
        activity,
        latestEvent,
      });
    }
    sources.push(trackedSource('Tracked board', TRACKED_COMMAND, 'authority', tracked.identity));
    const { issues } = tracked;

    if (issues.length > 0) {
      const exact = owner
        ? issues.filter((issue) => exactIssueSpec(issue) === `spec: ${owner.specPath}`)
        : [];
      if (exact.length === 0) {
        const diagnostics = [...inventoryDiagnostics, {
          code: 'TRACKED_FEATURE_NOT_FOUND',
          severity: /** @type {'warning'} */ ('warning'),
          path: '.',
          message: 'Selected feature is absent from the populated tracked board.',
        }];
        return await completeProjection(root, {
          ...base,
          status: 'ok',
          selected,
          authority: 'tracked',
          stage: idea.status === 'draft' ? 'Idea' : 'Defined',
          nextReason: 'Tracked work is authoritative, but it has no exact issue for this feature.',
          unansweredQuestions: questions,
          activity,
          latestEvent,
          diagnostics,
          attention: attentionFrom(diagnostics),
        }, sources, target, operation);
      }

      const executable = exact
        .map((issue) => ({ issue, normalized: normalizeBeadsIssue(issue) }))
        .filter(({ normalized }) => !normalized.isEpic);
      const unsupported = executable.find(({ normalized }) => normalized.status === null);
      if (unsupported) {
        const diagnostics = boundedDiagnostics(root, [{
          code: 'TRACKED_STATUS_UNSUPPORTED',
          severity: 'error',
          path: '.',
          message: `Tracked issue '${issueId(unsupported.issue)}' has unsupported status '${unsupported.normalized.statusToken}'.`,
        }]);
        return failedProjection(base, diagnostics, {
          selected,
          authority: 'tracked',
          unansweredQuestions: questions,
          activity,
          latestEvent,
        });
      }

      const ordered = executable.slice()
        .sort((left, right) => issueId(left.issue).localeCompare(issueId(right.issue)));
      const active = ordered.find(({ normalized }) => normalized.status === 'in_progress');
      let ready = null;
      if (!active) {
        let readiness;
        try {
          readiness = await queryReadyIssues(root, operation);
          [ready] = correlateReadyIssues(
            readiness.issues,
            issues,
            `spec: ${owner.specPath}`,
          );
        } catch (error) {
          const diagnostic = error instanceof TrackedFactConflict
            ? trackedConflictDiagnostic(error.code)
            : trackedUnavailableDiagnostic('TRACKED_READINESS_UNAVAILABLE');
          return failedProjection(base, [diagnostic], {
            selected,
            authority: 'tracked',
            unansweredQuestions: questions,
            activity,
            latestEvent,
          });
        }
        sources.push(trackedSource(
          'Tracked readiness',
          READY_COMMAND,
          'readiness',
          readiness.identity,
        ));
      }
      const nextIssue = active ?? ready;
      let blockers;
      try {
        blockers = ordered
          .filter(({ normalized }) => normalized.status === 'blocked')
          .map(({ issue }) => {
          const blocker = trackedBlocker(issue);
          if (!blocker) return null;
          const title = issueTitle(issue);
          return {
            classification: blocker.classification,
            reason: orientationText(blocker.reason),
            source: { kind: 'tracked', issueId: issueId(issue), title },
          };
          })
          .filter((blocker) => blocker !== null);
      } catch (error) {
        const diagnostic = error instanceof TrackedFactConflict
          ? trackedConflictDiagnostic(error.code)
          : trackedConflictDiagnostic('TRACKED_BLOCKER_CONFLICT');
        return failedProjection(base, [diagnostic], {
          selected,
          authority: 'tracked',
          unansweredQuestions: questions,
          activity,
          latestEvent,
        });
      }
      const tasks = trackedTaskCounts(ordered);
      const stage = tasks.blocked > 0
        ? 'Blocked'
        : nextIssue || tasks.open > 0
          ? 'In progress'
          : tasks.total > 0 && tasks.done === tasks.total
            ? 'Verified'
            : 'Defined';
      return await completeProjection(root, {
        ...base,
        status: 'ok',
        selected,
        authority: 'tracked',
        stage,
        next: nextIssue
          ? {
              description: orientationText(issueTitle(nextIssue.issue)),
              source: {
                kind: 'tracked',
                issueId: issueId(nextIssue.issue),
                title: issueTitle(nextIssue.issue),
              },
            }
          : null,
        nextReason: nextIssue ? null : 'No supported next tracked task is currently established.',
        blockers,
        unansweredQuestions: questions,
        tasks,
        activity,
        latestEvent,
        diagnostics: inventoryDiagnostics,
        attention: attentionFrom(inventoryDiagnostics),
      }, sources, target, operation);
    }

    if (!owner) {
      return await completeProjection(root, {
        ...base,
        status: 'ok',
        selected,
        authority: 'definition',
        stage: 'Idea',
        nextReason: 'This feature is still an idea.',
        unansweredQuestions: questions,
        activity,
        latestEvent,
        diagnostics: inventoryDiagnostics,
        attention: attentionFrom(inventoryDiagnostics),
      }, sources, target, operation);
    }

    const specIdentity = parseSpecIdentity(owner.specPath);
    if (!specIdentity) throw new Error(`invalid selected specification identity: ${owner.specPath}`);
    const tasksPath = `${specIdentity.directoryPath}/tasks.md`;
    const taskBytes = readSafeFile(root, tasksPath);
    const parsed = parseVisibleTasks(taskBytes, { path: tasksPath, state: 'selected feature' }).parsed;
    if (parsed.warnings.length !== 0) {
      const diagnostics = boundedDiagnostics(root, parsed.warnings.map((message) => ({
        code: 'TASKS_MALFORMED',
        severity: /** @type {'error'} */ ('error'),
        path: tasksPath,
        message,
      })));
      return failedProjection(base, diagnostics, {
        selected,
        unansweredQuestions: questions,
        activity,
        latestEvent,
      });
    }

    const taskData = taskProjection(parsed);
    const executionEvidence = parsed.tasks.some((task) => task.state !== 'todo');
    if (!executionEvidence) {
      sources.push(fileSource('Tasks', tasksPath, 'authority-check', taskBytes));
      return await completeProjection(root, {
        ...base,
        status: 'ok',
        selected,
        authority: 'definition',
        stage: 'Defined',
        nextReason: 'No canonical task execution evidence exists yet.',
        unansweredQuestions: questions,
        activity,
        latestEvent,
        diagnostics: inventoryDiagnostics,
        attention: attentionFrom(inventoryDiagnostics),
      }, sources, target, operation);
    }

    sources.push(fileSource('Tasks', tasksPath, 'authority', taskBytes, {
      phases: taskData.details,
    }));
    const active = parsed.tasks.find((task) => task.state === 'in-progress');
    const ready = active ?? nextTask(parsed);
    const blockers = parsed.tasks
      .filter((task) => task.state === 'blocked' || (task.state !== 'done' && task.blockedBy !== null))
      .map((task) => {
        const blocker = blockerParts(task.blockedBy);
        return {
          classification: blocker.classification,
          reason: orientationText(blocker.reason),
          source: {
            kind: 'file',
            path: tasksPath,
            taskKey: task.id,
            reason: blocker.reason,
          },
        };
      });
    const stage = blockers.length > 0
      ? 'Blocked'
      : taskData.counts.total > 0 && taskData.counts.done === taskData.counts.total
        ? 'Verified'
        : 'In progress';
    return await completeProjection(root, {
      ...base,
      status: 'ok',
      selected,
      authority: 'lightweight',
      stage,
      next: ready
        ? {
            description: orientationText(ready.description),
            source: {
              kind: 'file',
              path: tasksPath,
              taskKey: ready.id,
              description: ready.description,
            },
          }
        : null,
      nextReason: ready
        ? null
        : parsed.tasks.every((task) => task.state === 'done')
          ? 'All canonical tasks are complete.'
          : 'No canonical task is ready.',
      blockers,
      unansweredQuestions: questions,
      tasks: taskData.counts,
      phases: taskData.phases,
      activity,
      latestEvent,
      diagnostics: inventoryDiagnostics,
      attention: attentionFrom(inventoryDiagnostics),
    }, sources, target, operation);
  } catch (error) {
    return failedProjection(base, [projectionErrorDiagnostic(error)]);
  }
}

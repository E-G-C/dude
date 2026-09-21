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
  readyTasks,
  scanMarkdownVisibility,
  TASK_KEY_RE,
} from '../../../skills/dude-engine/lib/tasks.mjs';
import { resolveMutationPath } from '../../../skills/dude-engine/lib/workspace-paths.mjs';

const BD_LIST_ARGS = Object.freeze(['list', '--all', '--limit', '0', '--json']);
const BD_READY_ARGS = Object.freeze(['ready', '--json']);
const TRACKED_COMMAND = `bd ${BD_LIST_ARGS.join(' ')}`;
const READY_COMMAND = `bd ${BD_READY_ARGS.join(' ')}`;
const NO_BEADS_DATABASE = 'Error: no beads database found';
const PROJECTION_DEADLINE_MS = 5_000;
const MAX_BD_BUFFER = 8 * 1024 * 1024;
const EMPTY_TRACKED_IDENTITY = contentIdentity('[]');
const INTENT_EXCERPT_LIMIT = 1_200;
const DISPOSITION_EXCERPT_LIMIT = 4_000;
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
  /**
   * @param {'TRACKED_AUTHORITY_UNAVAILABLE'|'TRACKED_READINESS_UNAVAILABLE'} code
   * @param {unknown} [cause]
   */
  constructor(code, cause) {
    super(code, { cause });
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
 * @typedef {object} BdCommandResult
 * @property {unknown} [error]
 * @property {number|null} status
 * @property {string|Buffer} [stdout]
 * @property {string|Buffer} [stderr]
 * @property {unknown} [signal]
 * @property {unknown} [timeout]
 */

/**
 * @typedef {object} ProjectionOperationOptions
 * @property {AbortSignal} [signal]
 * @property {number} [timeoutMs]
 * @property {(args:string[], options:Record<string, unknown>) =>
 *   Promise<BdCommandResult>|BdCommandResult} [runBd]
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
        // execFile reports an ordinary nonzero exit as an Error with a numeric
        // code; retain other errors as acquisition failures.
        const status = error
          ? (typeof /** @type {NodeJS.ErrnoException} */ (error).code === 'number'
              ? /** @type {number} */ (/** @type {NodeJS.ErrnoException} */ (error).code)
              : null)
          : 0;
        callbackResult = {
          ...(error && status === null ? { error } : {}),
          status,
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
    // ENOENT can name cwd rather than bd. Do not classify a bad working root
    // as an optional missing executable, even with an injected command runner.
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe root');
    fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    throw new TrackedQueryError(unavailableCode);
  }
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
  } catch (error) {
    result = { error, status: null, stdout: '', stderr: '' };
  }
  const stdout = result?.stdout ?? '';
  const stderr = result?.stderr ?? '';
  if (operation.signal.aborted
    || operation.remaining() <= 0
    || result?.signal
    || result?.timeout
    || Buffer.byteLength(String(stdout)) > MAX_BD_BUFFER
    || Buffer.byteLength(String(stderr)) > MAX_BD_BUFFER) {
    throw new TrackedQueryError(unavailableCode);
  }
  if (result?.error || !Number.isInteger(result?.status)) {
    const missing = result?.status === null && String(stdout) === '' && String(stderr) === ''
      && isMissing(result?.error);
    throw new TrackedQueryError(unavailableCode, missing ? result.error : undefined);
  }
  return { status: result.status, stdout, stderr };
}

/** @param {BdCommandResult} result */
function isAbsentDatabaseResult(result) {
  if (typeof result.status !== 'number'
    || result.status === 0
    || String(result.stdout ?? '').trim() !== '') return false;
  const firstNonblankLine = String(result.stderr ?? '')
    .split(/\r\n|\n|\r/)
    .find((line) => line.trim() !== '');
  return firstNonblankLine === NO_BEADS_DATABASE;
}

/** @param {unknown} error */
function isMissing(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

/**
 * Establish absence only for default local discovery, not a replacement for
 * bd's database resolver. A footprint (including a dangling link) or uncertain
 * location requires a working authority read. Only hashes leave this check.
 * @param {string} root
 * @param {ReturnType<typeof projectionOperation>} operation
 */
function trackingAbsenceIdentity(root, operation) {
  const unavailable = () => new TrackedQueryError('TRACKED_AUTHORITY_UNAVAILABLE');
  // Git configuration overrides can also redirect core.worktree. Their
  // contents remain Git's responsibility; do not parse external configuration.
  if (Object.entries(process.env).some(([key, value]) => value
    && (/^BEADS_/i.test(key) || /^GIT_(?:DIR|COMMON_DIR|WORK_TREE|CONFIG(?:_.*)?)$/i.test(key)))) {
    throw unavailable();
  }
  /** @param {string} location */
  const statOrMissing = (location) => {
    try { return fs.lstatSync(location); } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  };
  /** @param {string} directory @param {string} relative */
  const metadata = (directory, relative) => {
    const bytes = readSafeFile(directory, relative, MAX_BD_BUFFER);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text).equals(bytes) || !/^[^\r\n\0]+\r?\n?$/.test(text)) throw unavailable();
    return text.replace(/\r?\n$/, '');
  };
  const pending = [path.resolve(root)];
  const visited = new Set();
  const evidence = [];
  try {
    while (pending.length) {
      let directory = pending.pop();
      while (!visited.has(directory)) {
        if (operation.signal.aborted || operation.remaining() <= 0) throw unavailable();
        visited.add(directory);
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()
          || path.relative(directory, fs.realpathSync(directory)) !== '') throw unavailable();
        if (statOrMissing(path.join(directory, '.beads'))) throw unavailable();
        const git = statOrMissing(path.join(directory, '.git'));
        let gitEvidence = null;
        if (git) {
          resolveMutationPath(directory, '.git');
          if (git.isDirectory()) {
            // A nonstandard common-dir layout cannot establish local absence.
            if (statOrMissing(path.join(directory, '.git', 'commondir'))) throw unavailable();
            gitEvidence = [git.dev, git.ino];
          } else if (git.isFile()) {
            const pointer = metadata(directory, '.git');
            const match = /^gitdir: (.+)$/.exec(pointer);
            // Do not turn ambiguous drive-relative or network indirection into
            // new filesystem probes outside the local discovery basis.
            if (!match || /^[\\/]{2}/.test(match[1]) || /^[A-Za-z]:(?:$|[^\\/])/.test(match[1])
              || (process.platform !== 'win32' && path.win32.isAbsolute(match[1]))) throw unavailable();
            const gitDirectory = path.resolve(directory, match[1]);
            const commonDirectory = path.dirname(path.dirname(gitDirectory));
            const mainRoot = path.dirname(commonDirectory);
            if (path.basename(path.dirname(gitDirectory)) !== 'worktrees'
              || path.basename(commonDirectory) !== '.git'
              || path.relative(mainRoot, fs.realpathSync(mainRoot)) !== '') throw unavailable();
            const relative = path.relative(mainRoot, gitDirectory).split(path.sep).join('/');
            const common = metadata(mainRoot, `${relative}/commondir`);
            const backlink = metadata(mainRoot, `${relative}/gitdir`);
            if (path.relative(commonDirectory, path.resolve(gitDirectory, common)) !== ''
              || path.relative(path.join(directory, '.git'), path.resolve(gitDirectory, backlink)) !== '') throw unavailable();
            gitEvidence = [pointer, common, backlink];
            pending.push(mainRoot);
          } else {
            throw unavailable();
          }
        }
        evidence.push([directory, stat.dev, stat.ino, gitEvidence]);
        directory = path.dirname(directory);
      }
    }
    if (operation.signal.aborted || operation.remaining() <= 0) throw unavailable();
    return contentIdentity(JSON.stringify({ missingExecutable: true, locations: evidence }));
  } catch {
    throw unavailable();
  }
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
 * @param {number} [maximumBytes]
 */
function readSafeFile(root, relativePath, maximumBytes) {
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
    if (maximumBytes === undefined) return fs.readFileSync(absolutePath);
    if (stat.size > maximumBytes) throw new Error('input exceeds the read bound');
    const descriptor = fs.openSync(absolutePath, 'r');
    try {
      // One extra byte detects growth after stat without an unbounded read or
      // a success-shaped truncated metadata line.
      const bytes = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = fs.readSync(descriptor, bytes, length, bytes.length - length, null);
        if (count === 0) return bytes.subarray(0, length);
        length += count;
      }
      throw new Error('input grew during the bounded read');
    } finally {
      fs.closeSync(descriptor);
    }
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
 * @param {Record<string, any>} [previousSource]
 * @param {boolean} [previouslyTracked]
 */
async function queryTrackedIssues(root, operation, previousSource, previouslyTracked = false) {
  const established = previouslyTracked || (previousSource?.role === 'authority'
    && previousSource.contentIdentity !== EMPTY_TRACKED_IDENTITY);
  let result;
  try {
    result = await invokeBd(operation, root, BD_LIST_ARGS, 'TRACKED_AUTHORITY_UNAVAILABLE');
  } catch (error) {
    if (!(error instanceof TrackedQueryError) || !isMissing(error.cause) || established) throw error;
    return { issues: [], identity: trackingAbsenceIdentity(root, operation), optionalAbsent: true };
  }
  if (result.status !== 0) {
    if (!isAbsentDatabaseResult(result) || established) throw new TrackedQueryError('TRACKED_AUTHORITY_UNAVAILABLE');
    trackingAbsenceIdentity(root, operation);
    // Preserve the existing semantic identity of exact no-database and [].
    return { issues: [], identity: EMPTY_TRACKED_IDENTITY };
  }
  try {
    const issues = parseTrackedIssues(result.stdout);
    return { issues, identity: contentIdentity(JSON.stringify(issues)) };
  } catch {
    throw new TrackedQueryError('TRACKED_AUTHORITY_UNAVAILABLE');
  }
}

/** @param {Awaited<ReturnType<typeof queryTrackedIssues>>} board */
function trackedBoardSource(board) {
  return trackedSource(
    board.optionalAbsent ? 'Optional tracker absence' : 'Tracked board',
    TRACKED_COMMAND,
    board.optionalAbsent ? 'authority-check' : 'authority',
    board.identity,
  );
}

/**
 * Query the workflow's canonical readiness authority. Once the complete board
 * is populated, every readiness failure is an authority failure.
 * @param {string} root
 * @param {ReturnType<typeof projectionOperation>} operation
 */
async function queryReadyIssues(root, operation) {
  const result = await invokeBd(operation, root, BD_READY_ARGS, 'TRACKED_READINESS_UNAVAILABLE');
  if (result.status !== 0) throw new TrackedQueryError('TRACKED_READINESS_UNAVAILABLE');
  try {
    const issues = parseBeadsIssues(result.stdout, READY_COMMAND);
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
  if (source.command === TRACKED_COMMAND) return (await queryTrackedIssues(root, operation, source)).identity;
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
 * Legacy Now orientation count, not current-request authority. A blank answer
 * can have an owner disposition; Needs You uses explicit live publications.
 * Unrecognized structure returns `null`.
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

/**
 * Read source excerpts, never pending questions or inferred dispositions.
 * Visibility and byte boundaries use the same Markdown scanner as the engine.
 * @param {Buffer} bytes
 * @param {string} ideaPath
 */
function ideaDiscovery(bytes, ideaPath) {
  const source = { path: ideaPath };
  const diagnostics = [];
  const dispositions = [];
  let intent = null;
  const diagnose = (code, message) => diagnostics.push({
    code, severity: /** @type {'warning'} */ ('warning'), path: ideaPath, message,
  });
  try {
    const { lines } = scanMarkdownVisibility(bytes, ideaPath, 'generic');
    const regions = [];
    let start = null;
    let managed = true;
    for (const line of lines) {
      if (line.text === '<!-- dude:managed:start -->') {
        if (start !== null) managed = false;
        else start = line.start;
      } else if (line.text === '<!-- dude:managed:end -->') {
        if (start === null) managed = false;
        else {
          regions.push({ start, end: line.start });
          start = null;
        }
      }
    }
    if (start !== null) managed = false;
    if (!managed) {
      diagnose('PROJECTION_MANAGED_REGION_MALFORMED', 'The idea has nested, unbalanced, or misordered managed regions.');
    }
    const headings = lines.flatMap((line) => {
      const heading = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line.text);
      return heading ? [{ ...line, section: heading[1] }] : [];
    });
    const excerpt = (heading, limit) => {
      const next = lines.find((line) => line.start > heading.start
        && (/^ {0,3}#{1,2}(?:[ \t]+|$)/.test(line.text) || /^<!-- dude:managed:(?:start|end) -->$/.test(line.text)));
      const text = bytes.subarray(heading.end, next?.start ?? bytes.length).toString('utf8').trim();
      return {
        text: text.slice(0, limit),
        truncated: text.length > limit,
        source: { ...source, section: heading.section },
      };
    };
    const ideaHeadings = headings.filter((heading) => heading.section === 'Idea');
    if (ideaHeadings.length === 1) intent = excerpt(ideaHeadings[0], INTENT_EXCERPT_LIMIT);
    if (!intent?.text) diagnose('PROJECTION_INTENT_UNAVAILABLE', 'The idea has no single nonempty Idea section.');

    for (const section of ['Definition Disposition', 'Re-definition Disposition']) {
      const matches = headings.filter((heading) => heading.section === section);
      if (matches.length === 0) continue;
      const verified = managed && matches.length === 1
        && regions.some((region) => matches[0].start > region.start && matches[0].start < region.end);
      if (!verified) {
        diagnose('PROJECTION_DISPOSITION_UNVERIFIED', `The ${section} section is not unique within a valid managed region.`);
        continue;
      }
      const disposition = excerpt(matches[0], DISPOSITION_EXCERPT_LIMIT);
      if (!disposition.text) {
        diagnose('PROJECTION_DISPOSITION_UNVERIFIED', `The ${section} section has no disposition evidence.`);
        continue;
      }
      dispositions.push({
        ...disposition,
        attribution: 'managed-source',
      });
    }
  } catch {
    diagnose('PROJECTION_IDEA_SECTIONS_MALFORMED', 'The idea sections could not be read completely.');
  }
  return { intent, dispositions, diagnostics };
}

/**
 * Inventory is independent of selected execution state and live handoffs.
 * Only ledgers are read here; unselected package documents remain deferred.
 * @param {string} root
 * @param {ReturnType<typeof selectLifecycleIdeaSummary>} lifecycle
 */
function discoveryProjection(root, lifecycle) {
  const diagnostics = boundedDiagnostics(root, lifecycle.inventory.diagnostics)
    .filter((diagnostic) => diagnostic.code !== 'FEATURE_IDEAS_ROOT_MISSING');
  const ideaBytes = new Map();
  const sources = [];
  const contexts = lifecycle.contexts.map(({ idea, owner, diagnostics: scoped }) => {
    const contextDiagnostics = boundedDiagnostics(root, scoped);
    let details = { intent: null, dispositions: [] };
    let source = null;
    try {
      const bytes = readSafeFile(root, idea.ideaPath);
      ideaBytes.set(idea.ideaPath, bytes);
      const discovery = ideaDiscovery(bytes, idea.ideaPath);
      details = { intent: discovery.intent, dispositions: discovery.dispositions };
      contextDiagnostics.push(...discovery.diagnostics);
      diagnostics.push(...discovery.diagnostics);
      source = { kind: 'file', path: idea.ideaPath };
      if (idea.ideaPath !== lifecycle.idea?.ideaPath) {
        sources.push(fileSource('Idea', idea.ideaPath, 'discovery', bytes));
      }
    } catch (error) {
      const diagnostic = projectionErrorDiagnostic(error);
      contextDiagnostics.push(diagnostic);
      diagnostics.push(diagnostic);
    }
    return {
      kind: idea.status === 'defined' ? 'feature' : 'idea',
      status: idea.status,
      ideaPath: idea.ideaPath,
      slug: idea.slug,
      specPath: owner?.specPath ?? null,
      title: ideaBytes.has(idea.ideaPath) ? selectedTitle(ideaBytes.get(idea.ideaPath)) : null,
      ...details,
      source,
      coverage: {
        scope: 'idea-ledger',
        state: contextDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
          ? 'unavailable' : contextDiagnostics.length ? 'partial' : 'current',
        diagnostics: contextDiagnostics,
      },
    };
  });
  const readable = contexts.filter((context) => context.source !== null).length;
  const uncertain = diagnostics.length > 0;
  return {
    ideaBytes,
    sources,
    contexts,
    workspace: contexts.length || lifecycle.inventory.packages.length
      ? 'populated' : uncertain ? 'unknown' : 'blank',
    coverage: {
      inventory: {
        state: uncertain ? readable ? 'partial' : 'unavailable' : 'current',
        ideas: contexts.length,
        readable,
        packages: lifecycle.inventory.packages.length,
        diagnostics,
      },
      selected: { state: 'not-selected', ideaPath: null, diagnostics: [] },
      // T009 supplies live availability through its provider; disk cannot prove
      // that there are zero current requests, even in a blank workspace.
      live: { state: 'unavailable', reason: 'Current requests require a live owner handoff.' },
    },
  };
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
    taskDetails: emptyTaskDetails('not-applicable', 'Select a feature to inspect task definitions.'),
    activity: null,
    latestEvent: null,
    attention: [],
    diagnostics: [],
    sources: [],
    choices: [],
    workspace: 'unknown',
    contexts: [],
    coverage: {
      inventory: { state: 'unavailable', ideas: 0, readable: 0, packages: 0, diagnostics: [] },
      selected: { state: 'not-selected', ideaPath: null, diagnostics: [] },
      live: { state: 'unavailable', reason: 'Current requests require a live owner handoff.' },
    },
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
  const conflicts = diagnostics.filter((diagnostic) => diagnostic.code === 'PROJECTION_READ_CONFLICT');
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
    taskDetails: emptyTaskDetails('unavailable', failedReadReason(diagnostics)),
    attention: attentionFrom(diagnostics),
    diagnostics,
    contexts: base.contexts.map((context) => {
      const affected = conflicts.filter((diagnostic) => (
        diagnostic.path === '.' || diagnostic.path === context.ideaPath || diagnostic.path === context.specPath
      ));
      return affected.length
        ? { ...context, coverage: { ...context.coverage, state: 'stale', diagnostics: [...context.coverage.diagnostics, ...affected] } }
        : context;
    }),
    coverage: {
      ...base.coverage,
      inventory: conflicts.length
        ? { ...base.coverage.inventory, state: 'partial', diagnostics: [...base.coverage.inventory.diagnostics, ...conflicts] }
        : base.coverage.inventory,
      selected: {
        state: 'unavailable',
        ideaPath: facts.selected?.ideaPath ?? base.selected?.ideaPath ?? null,
        diagnostics,
      },
    },
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
 * @param {'not-applicable'|'unavailable'} state
 * @param {string} reason
 */
function emptyTaskDetails(state, reason) {
  return { coverage: { state, reason }, items: null, resultCoverage: 'not-exposed' };
}

/** @param {ReturnType<typeof parseVisibleTasks>['parsed']['tasks']} tasks */
function canonicalTaskCounts(tasks) {
  const counts = { total: tasks.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const task of tasks) {
    if (task.state === 'todo') counts.open += 1;
    else if (task.state === 'in-progress') counts.inProgress += 1;
    else if (task.state === 'blocked') counts.blocked += 1;
    else if (task.state === 'done') counts.done += 1;
  }
  return counts;
}

/**
 * Membership and metadata come from the canonical parser. Only the unit's byte
 * boundaries use visible headings; its display text always uses original bytes.
 * @param {ReturnType<typeof parseVisibleTasks>} scan
 * @param {Buffer} bytes
 * @param {string} tasksPath
 */
function taskProjection(scan, bytes, tasksPath) {
  const { parsed } = scan;
  const counts = canonicalTaskCounts(parsed.tasks);

  /** @type {Map<string, {name:string,heading:string,order:number,tasks:typeof parsed.tasks}>} */
  const grouped = new Map();
  const taskPhases = new Map();
  const boundaries = [];
  let heading = 'Work';
  let hasHeading = false;
  let discoveredLine = null;
  let taskIndex = 0;
  for (let line = 0; line < scan.lines.length; line += 1) {
    const visible = scan.lines[line];
    if (parsed.board && line >= parsed.board.startLine && line <= parsed.board.endLine) {
      if (line === parsed.board.startLine) boundaries.push(visible.start);
      continue;
    }
    const headingMatch = /^#{2,3}\s+(.+?)\s*$/.exec(visible.text);
    if (headingMatch) {
      boundaries.push(visible.start);
      heading = headingMatch[1];
      hasHeading = true;
      if (/^##[ \t]+Discovered During Execution(?:[ \t]+#+)?[ \t]*$/.test(visible.text)
        && discoveredLine === null) discoveredLine = line;
    }
    while (parsed.tasks[taskIndex]?.headerLine === line) {
      const name = orientationText(heading.replace(/^Phase\s+\d+\s*:\s*/i, '')) || 'Work';
      const group = grouped.get(heading) ?? { name, heading, order: grouped.size, tasks: [] };
      group.tasks.push(parsed.tasks[taskIndex]);
      grouped.set(heading, group);
      taskPhases.set(parsed.tasks[taskIndex].id, hasHeading ? { heading, order: group.order } : null);
      boundaries.push(visible.start);
      taskIndex += 1;
    }
  }

  const phases = [...grouped.values()].map((group) => {
    const phaseCounts = canonicalTaskCounts(group.tasks);
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
  if (discoveredLine !== null && parsed.tasks.some((task) => task.headerLine > discoveredLine)) {
    return { counts, phases, details, taskDetails: emptyTaskDetails('unavailable',
      'The parsed totals include discovered mirror rows. A complete task-definition collection cannot be established.') };
  }

  boundaries.push(scan.activeEnd);
  const ready = new Set(readyTasks(parsed).map((task) => task.id));
  const source = { kind: 'file', path: tasksPath, contentIdentity: contentIdentity(bytes) };
  let boundary = 0;
  const items = parsed.tasks.map((task) => {
    const start = scan.lines[task.headerLine].start;
    while (boundaries[boundary] <= start && boundary < boundaries.length - 1) boundary += 1;
    return {
      taskKey: task.id,
      title: task.description,
      state: task.state,
      phase: taskPhases.get(task.id),
      source,
      instruction: { coverage: 'full-unit', text: bytes.subarray(start, boundaries[boundary]).toString('utf8') },
      deps: task.deps.length ? task.deps : null,
      blockedBy: task.blockedBy,
      readiness: task.state === 'todo'
        ? { state: ready.has(task.id) ? 'ready' : 'waiting', basis: 'recorded-deps' }
        : { state: 'not-applicable', basis: null },
    };
  });
  return { counts, phases, details, taskDetails: {
    coverage: { state: 'available', reason: null }, items, resultCoverage: 'not-exposed',
  } };
}

/**
 * Use only the explicit import carrier, never a task key mentioned in prose.
 * Board counts remain independent when this collection cannot be fully mapped.
 * @param {Array<{issue:Record<string, unknown>,normalized:ReturnType<typeof normalizeBeadsIssue>}>} executable
 * @param {Record<string, unknown>[]} issues
 * @param {typeof executable | null} ready
 * @param {string} identity
 */
function trackedTaskDetails(executable, issues, ready, identity) {
  const ids = new Map();
  for (const issue of issues) ids.set(issueId(issue), (ids.get(issueId(issue)) ?? 0) + 1);
  const keys = new Set();
  const readyIds = new Set(ready?.map(({ issue }) => issueId(issue)));
  const states = { open: 'todo', in_progress: 'in-progress', blocked: 'blocked', closed: 'done' };
  const items = [];
  for (const { issue, normalized } of executable) {
    const id = issueId(issue);
    let lines;
    try {
      lines = scanMarkdownVisibility(Buffer.from(String(issue.description)), 'tracked task description', 'generic')
        .lines.map((line) => line.text);
    } catch {
      return emptyTaskDetails('unavailable', 'The visible imported task metadata could not be established. No markdown backfill is used.');
    }
    const carriers = lines.filter((line) => line.startsWith('Task:'));
    const carrier = carriers.length === 1 ? /^Task: (\S+)(?:[ \t]+.*)?$/.exec(carriers[0]) : null;
    const key = carrier?.[1];
    if (!key || !TASK_KEY_RE.test(key) || keys.has(key) || !id || ids.get(id) !== 1
      || (meaningfulString(issue.id) && meaningfulString(issue.issue_id) && issue.id !== issue.issue_id)) {
      return emptyTaskDetails('unavailable',
        'Tracked task detail requires one explicit Task: key per issue and a unique issue/key mapping. No markdown backfill is used.');
    }
    keys.add(key);
    const declarations = lines.filter((line) => line.startsWith('Deps: '));
    const deps = declarations.length === 1
      ? declarations[0].slice('Deps: '.length).split(',').map((value) => value.trim()).filter(Boolean) : null;
    let blocker;
    try { blocker = trackedBlocker(issue); } catch {
      return emptyTaskDetails('unavailable', 'Imported task blocker metadata is conflicting.');
    }
    const extraText = Object.fromEntries(['acceptance_criteria', 'design', 'notes']
      .filter((field) => typeof issue[field] === 'string').map((field) => [field, issue[field]]));
    items.push({
      taskKey: key,
      title: issueTitle(issue),
      state: states[normalized.status],
      phase: null,
      issueId: id,
      source: { kind: 'tracked', command: TRACKED_COMMAND, contentIdentity: identity },
      instruction: {
        coverage: 'imported-description',
        text: issue.description,
        ...(Object.keys(extraText).length ? { extraText } : {}),
      },
      deps: deps?.every((dep) => TASK_KEY_RE.test(dep)) ? deps : null,
      blockedBy: blocker ? (blocker.classification ? `${blocker.classification}: ${blocker.reason}` : blocker.reason) : null,
      readiness: normalized.status !== 'open'
        ? { state: 'not-applicable', basis: null }
        : readyIds.has(id) ? { state: 'ready', basis: 'beads-ready' } : { state: 'not-exposed', basis: null },
    });
  }
  return { coverage: { state: 'available', reason: null }, items, resultCoverage: 'not-exposed' };
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
    if (source.kind === 'inventory' || source.role === 'discovery') continue;
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
  const failedBase = {
    ...projectionBase(),
    workspace: projection.workspace,
    contexts: projection.contexts,
    coverage: projection.coverage,
  };
  try {
    const conflict = await verifySelectedSources(root, sources, target, operation);
    if (conflict) {
      const unavailable = conflict.code === 'TRACKED_AUTHORITY_UNAVAILABLE'
        || conflict.code === 'TRACKED_READINESS_UNAVAILABLE';
      return failedProjection(failedBase, [conflict], {
        selected: projection.selected,
        unansweredQuestions: projection.unansweredQuestions,
        ...(unavailable && conflict.code === 'TRACKED_READINESS_UNAVAILABLE'
          ? { authority: 'tracked' }
          : {}),
      });
    }
  } catch {
    return failedProjection(failedBase, [{
      code: 'PROJECTION_READ_CONFLICT',
      severity: 'error',
      path: '.',
      message: 'Canonical repository state changed or became unavailable while the projection was being read.',
    }], { selected: projection.selected });
  }
  // A changed unselected ledger affects that excerpt, not selected execution.
  // Check after the final awaited capture, with no further async publication gap.
  // Structural inventory changes already reject the mixed read above.
  for (const source of sources.filter((candidate) => candidate.role === 'discovery')) {
    let diagnostic = null;
    try {
      if (contentIdentity(readSafeFile(root, source.path)) !== source.contentIdentity) {
        diagnostic = {
          code: 'PROJECTION_READ_CONFLICT', severity: 'error', path: source.path,
          message: 'The idea changed while discovery was being read.',
        };
      }
    } catch (error) {
      diagnostic = projectionErrorDiagnostic(error);
    }
    if (!diagnostic) continue;
    projection = {
      ...projection,
      contexts: projection.contexts.map((context) => context.ideaPath === source.path
        ? { ...context, coverage: { ...context.coverage, state: 'stale', diagnostics: [...context.coverage.diagnostics, diagnostic] } }
        : context),
      coverage: {
        ...projection.coverage,
        inventory: {
          ...projection.coverage.inventory, state: 'partial',
          diagnostics: [...projection.coverage.inventory.diagnostics, diagnostic],
        },
      },
    };
  }
  return deepFreeze({
    ...projection,
    complete: true,
    status: projection.status,
    readAt: new Date().toISOString(),
    attemptedAt: null,
    sources,
    coverage: {
      ...projection.coverage,
      selected: projection.selected
        ? { state: 'current', ideaPath: projection.selected.ideaPath, diagnostics: [] }
        : projection.coverage.selected,
    },
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
    if (projection.coverage?.inventory?.state !== 'current') {
      return freshnessResult('stale', projection, 'Discovery coverage is incomplete; readable contexts remain available.',
        projection.coverage?.inventory?.diagnostics ?? []);
    }
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
    // Finish all awaited acquisitions before checking local source identities.
    // Each source is still checked once, without an async gap after file reads.
    const sources = [
      ...projection.sources.filter((source) => source.kind === 'tracked'),
      ...projection.sources.filter((source) => source.kind !== 'tracked'),
    ];
    for (const source of sources) {
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
    return initialProjectionFreshness(projection);
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
    const previousSource = previous && typeof previous === 'object' && Array.isArray(previous.sources)
      ? previous.sources.find(source => source.kind === 'tracked' && source.command === TRACKED_COMMAND)
      : undefined;
    // Failed reads clear source captures but can still establish tracked authority.
    const previouslyTracked = Boolean(previous && typeof previous === 'object'
      && previous.authority === 'tracked');
    const successor = await readNowProjectionWithOperation(
      { root, target }, operation, previousSource, previouslyTracked,
    );
    if (successor.complete === true) {
      return deepFreeze({
        replaced: true,
        projection: successor,
        freshness: initialProjectionFreshness(successor),
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
 * Overview's private, read-only work index. This is deliberately NOT part of
 * readNowProjection/freshness/refresh: those callers read selected packages only.
 *
 * contexts/coverage.inventory are the captured base inventory, including resolved
 * ideas. items has one row per exact ideaPath + specPath, with lane, basis, group,
 * nullable taskCounts, counted sources and scoped availability. It is not a
 * backlog graph, a readiness authority, or a source of selected instructions.
 * A failed enrichment leaves the healthy base inventory discoverable.
 *
 * @param {{root:string}} input
 * @param {ProjectionOperationOptions} [options]
 */
export async function readWorkIndex({ root }, options = {}) {
  const operation = projectionOperation(options);
  const diagnostics = [];
  let base = null;
  let inventory = null;
  let rootIdentity = null;
  let sources = [];
  let items = [];
  const packageConsumers = new Map();
  const unavailable = (item, reason, state = 'unavailable') => ({
    ...item, group: null, taskCounts: null, availability: { state, reason },
  });
  try {
    operation.signal.throwIfAborted();
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe root');
    rootIdentity = contentIdentity(JSON.stringify([fs.realpathSync(root), rootStat.dev, rootStat.ino]));
    const lifecycle = selectLifecycleIdeaSummary({ root });
    inventory = inventorySource(lifecycle.inventory);
    base = discoveryProjection(root, lifecycle);
    sources = [inventory, ...[...base.ideaBytes].map(([name, bytes]) => fileSource('Idea', name, 'inventory', bytes))];
    items = base.contexts.map(context => ({
      ideaPath: context.ideaPath, specPath: context.specPath,
      lane: context.kind === 'idea' ? 'definition' : null,
      basis: 'not-established', group: null, taskCounts: null, sources: [],
      availability: { state: 'unavailable', reason: 'Work status has not been established.' },
    }));
    let board;
    try {
      board = await queryTrackedIssues(root, operation);
      sources.push(trackedBoardSource(board));
    } catch {
      diagnostics.push(trackedUnavailableDiagnostic('TRACKED_AUTHORITY_UNAVAILABLE'));
    }
    if (board?.issues.length) {
      items = items.map((item, index) => {
        const context = base.contexts[index];
        if (context.kind === 'idea') return item;
        const matched = board.issues.filter(issue => exactIssueSpec(issue) === `spec: ${item.specPath}`)
          .map(issue => ({ normalized: normalizeBeadsIssue(issue) }))
          .filter(({ normalized }) => !normalized.isEpic);
        const tracked = { ...item, lane: 'tracked', sources: [sources.at(-1)] };
        if (!item.specPath || !matched.length) return unavailable(tracked, 'No exact executable work is recorded on the populated tracked board.');
        if (matched.some(({ normalized }) => normalized.status === null)) {
          return unavailable(tracked, 'Tracked work has an unsupported status.');
        }
        const counts = trackedTaskCounts(matched);
        return { ...tracked, basis: 'tracked-board', taskCounts: counts,
          group: counts.done === counts.total ? 'completed' : counts.blocked ? 'blocked'
            : counts.inProgress ? 'active' : 'defined-awaiting-work',
          availability: { state: 'current', reason: null } };
      });
    } else if (board) {
      // Reuse the canonical backlog's metadata and grouping semantics, never its
      // generated report or chronology/order. Bound and capture every package
      // counted below before collection; verify the same bytes after acquisition.
      const metadata = new Map();
      let totalBytes = 0;
      let oversized = false;
      // The shared collector can also encounter a malformed claimant. Bound
      // the entire captured package inventory before allowing its rich read.
      for (const pkg of lifecycle.inventory.packages) {
        for (const name of [pkg.specPath, `${pkg.directoryPath}/tasks.md`]) {
          try {
            const stat = fs.lstatSync(resolveMutationPath(root, name));
            if (!stat.isFile()) continue;
            totalBytes += stat.size;
            oversized ||= stat.size > 8 * 1024 * 1024 || totalBytes > 32 * 1024 * 1024;
          } catch { /* The collector scopes missing/unsafe package files. */ }
        }
      }
      if (!oversized) {
        for (const context of base.contexts) {
          if (!context.specPath) continue;
          const files = [];
          let taskFacts = null;
          try {
            for (const name of [context.specPath, `${path.posix.dirname(context.specPath)}/tasks.md`]) {
              const stat = fs.lstatSync(resolveMutationPath(root, name));
              if (!stat.isFile() || stat.size > 8 * 1024 * 1024) {
                oversized ||= stat.isFile();
                throw new Error('bounded metadata unavailable');
              }
              const bytes = readSafeFile(root, name);
              if (name.endsWith('/tasks.md')) {
                // Reduce the same captured bytes used by fileSource below.
                // Only the selected reader builds units or retains task bodies.
                try {
                  const { parsed } = parseVisibleTasks(bytes, { path: name, state: 'work index' });
                  if (!parsed.warnings.length) taskFacts = {
                    counts: canonicalTaskCounts(parsed.tasks),
                    ownBlocked: parsed.tasks.some(task => task.state === 'blocked'
                      || (Boolean(task.blockedBy) && task.state !== 'done')),
                  };
                } catch { /* Invalid canonical visibility leaves task facts unavailable. */ }
              }
              files.push(fileSource(name.endsWith('/tasks.md') ? 'Tasks' : 'Specification', name, 'work', bytes));
            }
            metadata.set(context.ideaPath, { files, taskFacts });
          } catch { metadata.set(context.ideaPath, null); }
        }
      }
      // Missing/malformed packages are scoped by the canonical collector. An
      // oversized input must not enter its otherwise unbounded rich read.
      if (!oversized && !lifecycle.inventory.diagnostics.some(entry => entry.severity === 'error')) {
        try {
          const { collectLifecycleItems, deriveLifecycleModel } = await import('../../../skills/dude-lightweight-execution/backlog.mjs');
          for (const source of sources.filter(source => source.kind === 'file')) {
            if (contentIdentity(readSafeFile(root, source.path)) !== source.contentIdentity) throw new Error('base source changed');
          }
          const admitted = new Map(base.contexts.map(context => [context.ideaPath, context]));
          const taskUnavailable = 'Task state is unavailable because the tasks file is incomplete or ambiguous.';
          const collected = collectLifecycleItems({ root }).filter(item => {
            const context = admitted.get(item.ideaPath);
            return context && item.specPath === context.specPath;
          }).map(item => {
            if (!item.specPath) return item;
            const facts = metadata.get(item.ideaPath)?.taskFacts;
            const available = Boolean(facts);
            const { inProgress: active, ...counts } = facts?.counts ?? canonicalTaskCounts([]);
            return {
              ...item,
              taskCounts: { ...counts, active },
              tasksAvailable: available,
              packageComplete: available && counts.total > 0 && counts.done === counts.total,
              hasInProgress: available && active > 0,
              ownBlocked: facts?.ownBlocked ?? false,
              taskWarnings: available ? [] : item.taskWarnings,
              // Only the raw task parser's failure can be replaced. Ownership,
              // path, specification and lifecycle metadata failures still apply.
              unavailableDetail: available && item.unavailableDetail === taskUnavailable
                ? null : item.unavailableDetail ?? (available ? null : taskUnavailable),
            };
          });
          const model = deriveLifecycleModel({ items: collected });
          const byIdentity = new Map(model.items.map(item => [item.ideaPath, item]));
          for (const captured of metadata.values()) if (captured) sources.push(...captured.files);
          items = items.map(item => {
            const recorded = byIdentity.get(item.ideaPath);
            if (!recorded || recorded.unavailableDetail || recorded.authorityIssues.length
              || (item.specPath && !metadata.get(item.ideaPath))) return item;
            const counted = metadata.get(item.ideaPath)?.files ?? [];
            const current = { ...item, lane: recorded.defined && (recorded.taskCounts.done || recorded.taskCounts.active || recorded.taskCounts.blocked)
              ? 'lightweight' : 'definition',
              basis: 'canonical-lifecycle', group: recorded.group,
              taskCounts: recorded.tasksAvailable ? {
                total: recorded.taskCounts.total, open: recorded.taskCounts.open,
                inProgress: recorded.taskCounts.active, blocked: recorded.taskCounts.blocked,
                done: recorded.taskCounts.done,
              } : null,
              sources: counted, availability: { state: 'current', reason: null } };
            // Only dependency-sensitive feature groups consume prerequisite
            // package bytes. Model nodes already match exact admitted pairs;
            // resolved/completed and own-blocked groups take precedence.
            if (item.specPath && recorded.group !== 'completed' && !recorded.ownBlocked) {
              for (const { type, from, to } of model.relationships.declared) {
                if (type !== 'dependency' || to !== recorded || !from?.defined) continue;
                const required = metadata.get(from.ideaPath)?.files;
                if (!required) return unavailable(current, 'A prerequisite source could not be confirmed.', 'stale');
                for (const source of required) {
                  const consumers = packageConsumers.get(source.path) ?? new Set();
                  consumers.add(item.ideaPath);
                  packageConsumers.set(source.path, consumers);
                }
              }
            }
            return current;
          });
        } catch {
          diagnostics.push({ code: 'WORK_INDEX_METADATA_UNAVAILABLE', severity: 'warning', path: '.',
            message: 'Work metadata could not be read. The idea inventory is still available.' });
        }
      } else {
        diagnostics.push({ code: 'WORK_INDEX_METADATA_UNAVAILABLE', severity: 'warning', path: '.',
          message: 'The package inventory is unsafe or exceeds the bounded work read. Progress is unavailable.' });
      }
    }
    // Draft/resolved lifecycle does not need an execution board or fake counts.
    items = items.map((item, index) => {
      const context = base.contexts[index];
      if (context.coverage.state === 'unavailable') return unavailable(item, 'This record has unavailable source coverage.');
      if (context.kind !== 'idea') return item;
      return { ...item, lane: 'definition', basis: 'idea-ledger',
        group: context.status === 'resolved' ? 'completed' : 'awaiting-definition',
        taskCounts: null, availability: { state: 'current', reason: null } };
    });
    if (board) {
      try {
        if ((await queryTrackedIssues(root, operation, trackedBoardSource(board))).identity !== board.identity) throw new Error('lane changed');
      } catch {
        items = items.map((item, index) => base.contexts[index].kind === 'idea' ? item
          : unavailable(item, 'The execution authority changed during the read.', 'stale'));
        diagnostics.push({ code: 'WORK_INDEX_AUTHORITY_CHANGED', severity: 'warning', path: '.',
          message: 'Execution authority could not be confirmed. Work progress has been withheld.' });
      }
    }
    // No asynchronous publication gap after source/inventory reconciliation.
    for (const source of sources.filter(source => source.kind === 'file')) {
      let current = false;
      try { current = contentIdentity(readSafeFile(root, source.path)) === source.contentIdentity; } catch { /* scoped below */ }
      if (current) continue;
      // Open labels also consume incoming declarations from every idea ledger.
      items = items.map(item => item.ideaPath === source.path || item.sources.some(s => s.path === source.path)
        || packageConsumers.get(source.path)?.has(item.ideaPath)
        || (base.ideaBytes.has(source.path) && item.basis === 'canonical-lifecycle'
          && (item.group === 'next' || item.group === 'defined-awaiting-work'))
        ? unavailable(item, 'A counted source changed during the read.', 'stale') : item);
      if (base.ideaBytes.has(source.path)) {
        base.contexts = base.contexts.map(context => context.ideaPath === source.path
          ? { ...context, coverage: { ...context.coverage, state: 'stale' } } : context);
        base.coverage.inventory = { ...base.coverage.inventory, state: 'partial' };
      }
    }
    try {
      const finalRoot = fs.lstatSync(root);
      if (!finalRoot.isDirectory() || finalRoot.isSymbolicLink()
        || finalRoot.dev !== rootStat.dev || finalRoot.ino !== rootStat.ino
        || inventoryIdentity(selectLifecycleIdeaSummary({ root }).inventory) !== inventory.contentIdentity
        || options.signal?.aborted) {
        throw new Error('base inventory changed');
      }
    } catch {
      // Losing coverage is not an observed replacement of the captured root.
      // Enrichment failure alone does not invalidate a fresh base check.
      items = items.map(item => unavailable(item, 'The base inventory could not be confirmed during the read.', 'stale'));
      base.coverage.inventory = { ...base.coverage.inventory, state: 'stale' };
      diagnostics.push({ code: 'WORK_INDEX_UNAVAILABLE', severity: 'warning', path: '.',
        message: 'The base inventory could not be confirmed after the work read.' });
    }
  } catch {
    diagnostics.push({ code: 'WORK_INDEX_UNAVAILABLE', severity: 'warning', path: '.',
      message: 'The work index could not be read from this workspace.' });
    items = items.map(item => unavailable(item, 'Work status could not be confirmed.'));
  } finally { operation.dispose(); }
  const partial = items.some(item => item.availability.state !== 'current') || diagnostics.length > 0;
  return deepFreeze({
    workspaceId: contentIdentity(path.resolve(root)), rootIdentity,
    workspace: base?.workspace ?? 'unknown', inventoryIdentity: inventory?.contentIdentity ?? null,
    contexts: base?.contexts ?? [], items, sources,
    sourceIdentity: contentIdentity(JSON.stringify(sources)), readAt: new Date().toISOString(),
    coverage: {
      inventory: base?.coverage.inventory ?? { state: 'unavailable', diagnostics },
      work: { state: !base ? 'unavailable' : partial ? 'partial' : 'current', diagnostics },
    },
  });
}

/**
 * @param {{root:string,target?:string}} input
 * @param {ReturnType<typeof projectionOperation>} operation
 * @param {Record<string, any>} [previousSource]
 * @param {boolean} [previouslyTracked]
 */
async function readNowProjectionWithOperation({ root, target }, operation, previousSource, previouslyTracked) {
  let base = projectionBase();

  try {
    const lifecycle = selectLifecycleIdeaSummary({ root, target });
    const { inventory } = lifecycle;
    const inventoryDiagnostics = boundedDiagnostics(root, lifecycle.diagnostics)
      .filter((diagnostic) => diagnostic.code !== 'FEATURE_IDEAS_ROOT_MISSING');
    const discovery = discoveryProjection(root, lifecycle);
    const choices = lifecycle.choices.map((candidate) => ({
      ideaPath: candidate.ideaPath,
      slug: candidate.slug,
      specPath: candidate.status === 'defined' ? candidate.specPath : null,
    }));
    base = {
      ...base, choices,
      workspace: discovery.workspace,
      contexts: discovery.contexts,
      coverage: discovery.coverage,
    };
    const completeBase = base;
    /** @type {Array<Record<string, any>>} */
    const sources = [inventorySource(inventory), ...discovery.sources];

    const { idea, owner, explicit } = lifecycle;
    if (!idea) {
      if (explicit || (choices.length === 0 && inventoryDiagnostics.some((diagnostic) => diagnostic.severity === 'error'))) {
        return failedProjection(base, inventoryDiagnostics);
      }
      return await completeProjection(root, {
        ...completeBase,
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

    const ideaBytes = discovery.ideaBytes.get(idea.ideaPath) ?? readSafeFile(root, idea.ideaPath);
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
    // Later source reads can throw; retain the already-admitted identity.
    base = { ...base, selected };
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
        ...completeBase,
        status: 'ok',
        selected,
        authority: 'definition',
        stage: 'Completed without a package',
        taskDetails: emptyTaskDetails('not-applicable', 'This idea has no task definitions.'),
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
      tracked = await queryTrackedIssues(root, operation, previousSource, previouslyTracked);
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
    sources.push(trackedBoardSource(tracked));
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
          ...completeBase,
          status: 'ok',
          selected,
          authority: 'tracked',
          stage: idea.status === 'draft' ? 'Idea' : 'Defined',
          taskDetails: owner
            ? emptyTaskDetails('unavailable', 'The populated tracked board has no exact issue for this feature. No markdown backfill is used.')
            : emptyTaskDetails('not-applicable', 'This idea has no task definitions.'),
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
          ready = correlateReadyIssues(
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
      const nextIssue = active ?? ready?.[0];
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
        ...completeBase,
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
        taskDetails: trackedTaskDetails(ordered, issues, ready, tracked.identity),
        activity,
        latestEvent,
        diagnostics: inventoryDiagnostics,
        attention: attentionFrom(inventoryDiagnostics),
      }, sources, target, operation);
    }

    if (!owner) {
      return await completeProjection(root, {
        ...completeBase,
        status: 'ok',
        selected,
        authority: 'definition',
        stage: 'Idea',
        taskDetails: emptyTaskDetails('not-applicable', 'This idea has no task definitions.'),
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
    const scan = parseVisibleTasks(taskBytes, { path: tasksPath, state: 'selected feature' });
    const { parsed } = scan;
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

    const taskData = taskProjection(scan, taskBytes, tasksPath);
    const executionEvidence = parsed.tasks.some((task) => task.state !== 'todo');
    if (!executionEvidence) {
      sources.push(fileSource('Tasks', tasksPath, 'authority-check', taskBytes));
      return await completeProjection(root, {
        ...completeBase,
        status: 'ok',
        selected,
        authority: 'definition',
        stage: 'Defined',
        tasks: taskData.counts,
        phases: taskData.phases,
        taskDetails: taskData.taskDetails,
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
      ...completeBase,
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
      taskDetails: taskData.taskDetails,
      activity,
      latestEvent,
      diagnostics: inventoryDiagnostics,
      attention: attentionFrom(inventoryDiagnostics),
    }, sources, target, operation);
  } catch (error) {
    return failedProjection(base, [projectionErrorDiagnostic(error)]);
  }
}

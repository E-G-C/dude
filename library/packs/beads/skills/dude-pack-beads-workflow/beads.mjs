#!/usr/bin/env node
// @ts-check
/**
 * beads.mjs — deterministic prep for the Beads pack (installed at
 * `.github/skills/dude-pack-beads-workflow/`).
 *
 * Two mechanical transforms. `plan-import` queries the complete Beads inventory
 * before emitting any create commands; the coordinator runs those commands and
 * keeps the remaining judgment per the pack's SKILLs.
 *
 *   plan-import <tasks.md> --spec <spec_path> [--title "..."] [--json]
 *       Parse tasks.md and emit an import plan: one deferred epic + one issue
 *       per OPEN task (skips [x] history), the derived dependency edges among
 *       open tasks, and ready-to-run `bd create` / `bd dep` commands. Each issue
 *       description's first line equals `spec: <spec_path>` (the identity).
 *
 *   mirror <tasks.md> --from <bd-list.json> [--spec <spec_path>] [--write]
 *       Given a captured `bd list --all --limit 0 --json`, map each issue's task key + status back to a
 *       canonical glyph and apply the batch to tasks.md (the one-way mirror).
 *       Writes require --spec and an existing spec.md in the same canonical
 *       feature directory. A spec-less invocation is inspection-only.
 *
 * NOTE: this pack script imports the core engine at `../dude-engine/lib/...`,
 * which resolves only once installed under `.github/skills/`. It is validated
 * by the compose-install integration test (beads.test.mjs), not from source.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  parseTasks,
  deriveDependencies,
  applyStates,
  BOARD_START,
  BOARD_END,
} from '../dude-engine/lib/tasks.mjs';
import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import {
  authorizeAttempt as authorizeCoreRecoveryAttempt,
  collectEvidence as collectCoreRecoveryEvidence,
  inspect as inspectCoreRecovery,
  runCommand as runCoreRecoveryCommand,
} from '../dude-work/recovery.mjs';

/** bd issue status -> canonical task glyph. */
const BD_STATE_GLYPH = {
  open: ' ',
  in_progress: '~',
  'in-progress': '~',
  inprogress: '~',
  blocked: '!',
  closed: 'x',
  done: 'x',
};

const TASK_KEY_RE = /\bT\d{3,}@[a-z0-9]{8}\b/;
const SPEC_PATH_RE = /^\.dude\/specs\/([^/\\]+)\/spec\.md$/;
const TASKS_PATH_RE = /^\.dude\/specs\/([^/\\]+)\/tasks\.md$/;
const COMPLETE_BD_LIST_ARGS = Object.freeze(['list', '--all', '--limit', '0', '--json']);
const RECOVERY_SPEC_PATH_RE = /^\.dude\/specs\/\d{3,}-[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md$/;
const RECOVERY_DETAIL_FIELDS = ['design', 'acceptance_criteria', 'notes', 'priority', 'owner',
  'created_at', 'created_by', 'updated_at', 'metadata', 'labels'];
const SUPPORTED_RECOVERY_STATUSES = {
  open: 'open', in_progress: 'in_progress', 'in-progress': 'in_progress', inprogress: 'in_progress',
  blocked: 'blocked', closed: 'closed', done: 'closed',
};

/** @param {string} left @param {string} right */
function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
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

/** @param {string} segment @returns {boolean} */
function validFeatureSegment(segment) {
  return Boolean(segment) && segment !== '.' && segment !== '..';
}

/**
 * Require tasks.md and spec.md to identify the same canonical feature and,
 * when a spec identity is supplied, require its file to exist without symlinks.
 * @param {string} root
 * @param {string} tasksPath
 * @param {string} specPath
 * @returns {string}
 */
function validateFeatureIdentity(root, tasksPath, specPath) {
  const tasksMatch = TASKS_PATH_RE.exec(tasksPath);
  const specMatch = SPEC_PATH_RE.exec(specPath);
  if (!tasksMatch || !specMatch
    || !validFeatureSegment(tasksMatch[1])
    || !validFeatureSegment(specMatch[1])) {
    throw new Error('feature identity requires canonical .dude/specs/<feature>/{spec.md,tasks.md} paths');
  }
  if (tasksMatch[1] !== specMatch[1]) {
    throw new Error('tasks.md and --spec must use the same canonical feature directory');
  }

  const resolvedTasksPath = resolveMutationPath(root, tasksPath);
  const resolvedSpecPath = resolveMutationPath(root, specPath);
  for (const [label, relPath, absolutePath] of [
    ['tasks', tasksPath, resolvedTasksPath],
    ['spec', specPath, resolvedSpecPath],
  ]) {
    const stat = lstatOrNull(absolutePath);
    if (!stat) throw new Error(`canonical ${label} file not found: ${relPath}`);
    if (!stat.isFile()) throw new Error(`canonical ${label} target is not a regular file: ${relPath}`);
  }
  return resolvedTasksPath;
}

/**
 * Require one globally clean canonical feature owner. Beads rejects warnings as
 * well as errors because tracked execution must not proceed from partial
 * ownership inventory.
 * @param {string} root
 * @param {string} specPath
 * @returns {{ ideaPath: string, specPath: string }}
 */
function requireFeatureOwner(root, specPath) {
  const result = resolveFeatureOwner({ root, specPath });
  if (result.diagnostics.length !== 0 || !result.owner) {
    const details = result.diagnostics
      .map((diagnostic) => `${diagnostic.path}  ${diagnostic.message} [${diagnostic.code}]`)
      .join('\n  ');
    throw new Error(`feature owner resolution failed${details ? `:\n  ${details}` : ''}`);
  }
  return result.owner;
}

/** @param {import('../dude-engine/lib/tasks.mjs').Task} t @returns {number} bd priority */
function priorityOf(t) {
  if (t.order <= 1000) return 1; // setup / foundational
  if (t.order >= 4000) return 3; // polish
  return 2;
}

/**
 * POSIX single-quote a string so it is safe to embed in an emitted shell
 * command. Single quotes disable all shell interpretation; the only escape is
 * for a literal single quote (`'` -> `'\''`). Prevents command injection from
 * user-authored task text (finding: shell-safety).
 * @param {string} s
 * @returns {string}
 */
function shq(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

/**
 * The `bd create` status flag for a non-open glyph, so `[~]`/`[!]` import as
 * in-progress / blocked rather than silently coming in as open.
 * @param {string} glyph
 * @returns {string}
 */
function statusFlag(glyph) {
  if (glyph === '~') return ' --status=in_progress';
  if (glyph === '!') return ' --status=blocked';
  return '';
}

/**
 * Parse a complete `bd list` response without treating unknown envelopes as an
 * empty board.
 * @param {string | Buffer} content
 * @param {string} label
 * @returns {any[]}
 */
export function parseBdIssues(content, label = 'bd list --all --limit 0 --json') {
  let parsed;
  try {
    parsed = JSON.parse(String(content));
  } catch (error) {
    throw new Error(`${label} returned malformed JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const issues = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.issues)
      ? parsed.issues
      : null;
  if (!issues) throw new Error(`${label} returned an unrecognized JSON shape`);
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
      throw new Error(`${label} returned a malformed issue at index ${index}`);
    }
    if (typeof issue.description !== 'string') {
      throw new Error(`${label} issue at index ${index} is missing a string description`);
    }
  }
  return issues;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @param {string} label */
function recoveryCaptures(value, label) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) {
    throw new Error(`${label} must be a dense array`);
  }
  const captures = new Map();
  for (const entry of value) {
    if (!isPlainObject(entry) || Object.keys(entry).length !== 2
      || !Object.hasOwn(entry, 'id') || !Object.hasOwn(entry, 'bytes')) {
      throw new Error(`${label} entries must be exact {id,bytes} objects`);
    }
    if (typeof entry.id !== 'string' || !entry.id
      || (typeof entry.bytes !== 'string' && !Buffer.isBuffer(entry.bytes))) {
      throw new Error(`${label} contains an invalid capture`);
    }
    if (captures.has(entry.id)) throw new Error(`${label} contains duplicate issue ID '${entry.id}'`);
    captures.set(entry.id, entry.bytes);
  }
  return captures;
}

/** @param {unknown} value */
function isValidRecoveryIssueId(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) < 1 || Buffer.byteLength(value) > 256
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (++index >= value.length || value.charCodeAt(index) < 0xdc00 || value.charCodeAt(index) > 0xdfff) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** @param {unknown} value @returns {{specPath:string,lane:'tracked',issueId?:string,taskKey?:string}} */
function recoveryTarget(value) {
  if (!isPlainObject(value)
    || Object.keys(value).some((key) => !['specPath', 'lane', 'issueId', 'taskKey'].includes(key))) {
    throw new Error('target must contain only specPath, lane, issueId, and optional taskKey');
  }
  if (typeof value.specPath !== 'string' || !RECOVERY_SPEC_PATH_RE.test(value.specPath)) {
    throw new Error('target.specPath must be an exact canonical specification path');
  }
  if (value.lane !== 'tracked') throw new Error("target.lane must equal 'tracked'");
  if (Object.hasOwn(value, 'issueId') && !isValidRecoveryIssueId(value.issueId)) {
    throw new Error('target.issueId must be a valid 1-256 byte control-free Unicode string');
  }
  if (Object.hasOwn(value, 'taskKey')
    && (typeof value.taskKey !== 'string' || !new RegExp(`^${TASK_KEY_RE.source}$`).test(value.taskKey))) {
    throw new Error('target.taskKey must be a durable task key');
  }
  if (Object.hasOwn(value, 'taskKey') && !Object.hasOwn(value, 'issueId')) {
    throw new Error('target.taskKey requires target.issueId');
  }
  return /** @type {{specPath:string,lane:'tracked',issueId?:string,taskKey?:string}} */ (value);
}

/** @param {Record<string, unknown>} issue @param {string} label @param {string} specPath */
function recoveryIssueProjection(issue, label, specPath) {
  for (const field of ['id', 'title', 'description', 'status', 'issue_type']) {
    if (typeof issue[field] !== 'string' || !issue[field]) throw new Error(`${label} is missing string ${field}`);
  }
  if (!hasExactSpecIdentity(issue, specPath)) throw new Error(`${label} has the wrong target spec identity`);
  const id = issueId(issue);
  const rawStatus = issueStatus(issue);
  const status = Object.hasOwn(SUPPORTED_RECOVERY_STATUSES, rawStatus) ? SUPPORTED_RECOVERY_STATUSES[rawStatus] : null;
  if (!status) throw new Error(`unsupported executable Beads issue '${id}' status=${rawStatus}`);
  const projection = {
    issueId: id,
    status,
    type: issue.issue_type.toLowerCase(),
    title: issue.title,
    description: issue.description,
  };
  const taskKey = issueTaskKey(issue);
  if (taskKey) Object.assign(projection, { taskKey });
  const detail = Object.fromEntries(RECOVERY_DETAIL_FIELDS
    .filter((field) => Object.hasOwn(issue, field)).map((field) => [field, issue[field]]));
  return { ...projection, detail };
}

/** @param {string | Buffer} content @param {string} id @param {string} specPath */
function recoveryHistory(content, id, specPath) {
  const label = `history capture '${id}'`;
  let events;
  try {
    events = JSON.parse(String(content));
  } catch (error) {
    throw new Error(`${label} returned malformed JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!Array.isArray(events)) throw new Error(`${label} must be an array`);
  return events.map((event, index) => {
    const keys = isPlainObject(event) ? Object.keys(event).sort().join(',') : '';
    if (keys !== 'CommitDate,CommitHash,Committer,Issue'
      || typeof event.CommitHash !== 'string' || typeof event.Committer !== 'string'
      || typeof event.CommitDate !== 'string' || !isPlainObject(event.Issue)) {
      throw new Error(`${label} has a malformed event at index ${index}`);
    }
    const issue = recoveryIssueProjection(event.Issue, `${label} event ${index} Issue`, specPath);
    if (issue.issueId !== id) throw new Error(`${label} event ${index} has the wrong Issue id`);
    return { commitDate: event.CommitDate, issue };
  });
}

/** @param {unknown} value */
function recoveryEnvelopeCaptures(value) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) {
    throw new Error('issues must be a dense array');
  }
  return value.map((entry, index) => {
    if (!isPlainObject(entry) || Object.keys(entry).length !== 2
      || !Object.hasOwn(entry, 'detailBytes') || !Object.hasOwn(entry, 'historyBytes')) {
      throw new Error('issues entries must be exact {detailBytes,historyBytes} objects');
    }
    const shown = parseBdIssues(entry.detailBytes, `issues[${index}].detailBytes`);
    if (shown.length !== 1) throw new Error(`issues[${index}].detailBytes must contain exactly one issue`);
    const id = shown[0].id;
    if (!isValidRecoveryIssueId(id)) throw new Error(`issues[${index}].detailBytes has an invalid issue ID`);
    return {
      id,
      detailBytes: entry.detailBytes,
      historyBytes: entry.historyBytes,
    };
  });
}

/** Normalize complete captured Beads list/show/history evidence without I/O. @param {unknown} input */
export function normalizeRecoveryEvidence(input) {
  if (!isPlainObject(input)) {
    throw new Error('normalizeRecoveryEvidence requires a captured evidence object');
  }
  const internalFields = ['listBytes', 'detailBytesById', 'historyBytesById', 'target'];
  const envelopeFields = ['kind', 'listBytes', 'issues', 'target'];
  const internal = Object.keys(input).length === internalFields.length
    && internalFields.every((key) => Object.hasOwn(input, key));
  const envelope = Object.keys(input).length === envelopeFields.length
    && envelopeFields.every((key) => Object.hasOwn(input, key));
  if (!internal && !envelope) {
    throw new Error('normalizeRecoveryEvidence requires internal captures or a tracked capture envelope');
  }
  if (typeof input.listBytes !== 'string' && !Buffer.isBuffer(input.listBytes)) {
    throw new Error('listBytes must be captured bytes or a string');
  }
  const target = recoveryTarget(input.target);
  if (envelope && input.kind !== 'tracked') throw new Error("kind must equal 'tracked'");
  const envelopeCaptures = envelope ? recoveryEnvelopeCaptures(input.issues) : null;
  const listed = parseBdIssues(input.listBytes, 'bd --readonly list --all --limit 0 --json');
  const details = recoveryCaptures(
    envelopeCaptures
      ? envelopeCaptures.map(({ id, detailBytes: bytes }) => ({ id, bytes }))
      : input.detailBytesById,
    'detailBytesById',
  );
  const histories = recoveryCaptures(
    envelopeCaptures
      ? envelopeCaptures.map(({ id, historyBytes: bytes }) => ({ id, bytes }))
      : input.historyBytesById,
    'historyBytesById',
  );
  const seen = new Set();
  const exactFeature = listed.filter((issue) => {
    if (typeof issue.id !== 'string' || !issue.id) throw new Error('list issue is missing string id');
    const id = issueId(issue);
    if (seen.has(id)) throw new Error(`list contains duplicate issue ID '${id}'`);
    seen.add(id);
    return hasExactSpecIdentity(issue, target.specPath);
  });

  if (target.taskKey) {
    const owners = exactFeature.filter((issue) => !isEpicIssue(issue) && issueTaskKey(issue) === target.taskKey)
      .map(issueId).sort(compareUtf8);
    if (owners.length === 0) throw new Error(`target taskKey '${target.taskKey}' has no durable issue mapping`);
    if (owners.length > 1) {
      throw new Error(`target taskKey '${target.taskKey}' has duplicate/ambiguous mapping across issues: ${owners.join(', ')}`);
    }
    if (owners[0] !== target.issueId) throw new Error(`target taskKey '${target.taskKey}' does not map to issue '${target.issueId}'`);
  }

  let selected;
  if (target.issueId) {
    const issue = exactFeature.find((candidate) => issueId(candidate) === target.issueId);
    if (!issue) throw new Error(`target issue '${target.issueId}' is not in the exact-feature issue set`);
    if (isEpicIssue(issue)) throw new Error(`target issue '${target.issueId}' is a non-executable grouping epic`);
    selected = [issue];
  } else {
    selected = exactFeature.filter((issue) => !isEpicIssue(issue));
  }
  selected.sort((left, right) => compareUtf8(issueId(left), issueId(right)));
  const selectedIds = new Set(selected.map(issueId));
  for (const [label, captures] of [['detail', details], ['history', histories]]) {
    for (const id of captures.keys()) {
      if (!selectedIds.has(id)) throw new Error(`${label} capture has extra issue ID '${id}'`);
    }
    for (const id of selectedIds) {
      if (!captures.has(id)) throw new Error(`missing ${label} capture for issue '${id}'`);
    }
  }

  const records = selected.map((listIssue) => {
    const id = issueId(listIssue);
    const listedIssue = recoveryIssueProjection(listIssue, `list issue '${id}'`, target.specPath);
    const shown = parseBdIssues(/** @type {string | Buffer} */ (details.get(id)), `detail capture '${id}'`);
    if (shown.length !== 1) throw new Error(`detail capture '${id}' must contain exactly one issue`);
    const shownIssue = recoveryIssueProjection(shown[0], `detail capture '${id}' issue`, target.specPath);
    for (const field of ['issueId', 'status', 'type', 'title', 'description', 'taskKey']) {
      if (listedIssue[field] !== shownIssue[field]) throw new Error(`detail capture '${id}' has conflicting ${field}`);
    }
    for (const field of RECOVERY_DETAIL_FIELDS) {
      if (Object.hasOwn(listIssue, field) && Object.hasOwn(shown[0], field)
        && !isDeepStrictEqual(listIssue[field], shown[0][field])) {
        throw new Error(`detail capture '${id}' has conflicting ${field}`);
      }
    }
    const { detail: _listDetail, ...record } = listedIssue;
    return {
      ...record,
      detail: shownIssue.detail,
      history: recoveryHistory(/** @type {string | Buffer} */ (histories.get(id)), id, target.specPath),
    };
  });
  const canonicalTarget = { specPath: target.specPath, lane: /** @type {'tracked'} */ ('tracked') };
  if (target.issueId) Object.assign(canonicalTarget, { issueId: target.issueId });
  return { target: canonicalTarget, records };
}

/** @param {unknown} target @param {unknown} rawInputs */
export function collectRecoveryEvidence(target, rawInputs) {
  return collectCoreRecoveryEvidence(target, rawInputs, {
    normalizeTrackedEvidence: normalizeRecoveryEvidence,
  });
}

/** @param {unknown} value */
export function inspectRecovery(value) {
  return inspectCoreRecovery(value, {
    normalizeTrackedEvidence: normalizeRecoveryEvidence,
  });
}

/**
 * @param {unknown} state
 * @param {unknown} target
 * @param {unknown} rawInputs
 * @param {unknown} assessment
 * @param {unknown} mode
 */
export function authorizeRecoveryAttempt(state, target, rawInputs, assessment, mode) {
  return authorizeCoreRecoveryAttempt(state, target, rawInputs, assessment, mode, {
    normalizeTrackedEvidence: normalizeRecoveryEvidence,
  });
}

/** @param {unknown} command @param {unknown} request */
export function runRecoveryCommand(command, request) {
  return runCoreRecoveryCommand(command, request, {
    normalizeTrackedEvidence: normalizeRecoveryEvidence,
  });
}

/** @param {any} issue @returns {string} */
function issueId(issue) {
  return String(issue.id ?? issue.issue_id ?? '(unknown)');
}

/** @param {any} issue @returns {boolean} */
function isEpicIssue(issue) {
  return [issue.type, issue.issue_type]
    .some((value) => String(value ?? '').toLowerCase() === 'epic');
}

/** @param {any} issue @param {string} specPath @returns {boolean} */
function hasExactSpecIdentity(issue, specPath) {
  return String(issue.description).split(/\r?\n/, 1)[0] === `spec: ${specPath}`;
}

/**
 * Verify that a feature is safe to import against the complete Beads inventory.
 * @param {any[]} bdIssues
 * @param {{ specPath: string }} options
 * @returns {{ represented: boolean, matching_issue_ids: string[] }}
 */
export function inspectImportInventory(bdIssues, { specPath }) {
  const matching = bdIssues.filter((issue) => hasExactSpecIdentity(issue, specPath));
  const epics = matching.filter(isEpicIssue);
  if (epics.length > 1) {
    throw new Error(`duplicate feature identity '${specPath}' is claimed by epics: ${epics.map(issueId).join(', ')}`);
  }

  const taskOwners = new Map();
  for (const issue of matching) {
    if (isEpicIssue(issue)) continue;
    const text = `${issue.description}\n${String(issue.title || '')}`;
    const keys = [...new Set(text.match(new RegExp(TASK_KEY_RE.source, 'g')) || [])];
    if (keys.length > 1) {
      throw new Error(`Beads issue ${issueId(issue)} has conflicting durable task keys for '${specPath}': ${keys.join(', ')}`);
    }
    if (keys.length === 0) continue;
    const owners = taskOwners.get(keys[0]) || [];
    owners.push(issueId(issue));
    taskOwners.set(keys[0], owners);
  }
  for (const [taskKey, owners] of taskOwners) {
    if (owners.length > 1) {
      throw new Error(`duplicate durable task key ${taskKey} for '${specPath}' is claimed by issues: ${owners.join(', ')}`);
    }
  }
  return { represented: matching.length > 0, matching_issue_ids: matching.map(issueId) };
}

/**
 * Read complete existing issue state from a fixture or the Beads CLI.
 * @param {{ from?: string, bd?: string, root: string }} args
 * @returns {any[]}
 */
function loadImportIssues(args) {
  if (args.from) {
    return parseBdIssues(fs.readFileSync(args.from), args.from);
  }
  const command = args.bd || 'bd';
  const result = spawnSync(command, COMPLETE_BD_LIST_ARGS, { cwd: args.root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message
        || String(result.stderr || '').trim()
        || `${command} ${COMPLETE_BD_LIST_ARGS.join(' ')} failed`,
    );
  }
  return parseBdIssues(result.stdout, `${command} ${COMPLETE_BD_LIST_ARGS.join(' ')}`);
}

/**
 * Build an import plan from a parsed tasks.md.
 * @param {ReturnType<typeof parseTasks>} parsed
 * @param {{ specPath: string, ideaPath: string, title?: string, existingIssues?: any[] }} opts
 * @returns {{ spec_path: string, idea_path: string, discovery: {represented:boolean,matching_issue_ids:string[]}, epic: any, issues: any[], deps: {from:string,to:string}[], skipped_done: string[], commands: string[] }}
 */
export function planImport(parsed, { specPath, ideaPath, title, existingIssues = [] }) {
  if (!ideaPath) throw new Error('plan-import requires the exact owning idea_path');
  const duplicateWarnings = parsed.warnings.filter((warning) => /duplicate task id/.test(warning));
  if (duplicateWarnings.length > 0) {
    throw new Error(`duplicate durable task keys in tasks.md:\n  ${duplicateWarnings.join('\n  ')}`);
  }
  const discovery = inspectImportInventory(existingIssues, { specPath });
  if (discovery.represented) {
    throw new Error(
      `feature '${specPath}' is already represented in Beads by: ${discovery.matching_issue_ids.join(', ')}`,
    );
  }
  const open = parsed.tasks.filter((t) => t.state !== 'done');
  const openIds = new Set(open.map((t) => t.id));
  const skipped_done = parsed.tasks.filter((t) => t.state === 'done').map((t) => t.id);

  const epicTitle = title || `Feature ${specPath}`;
  const epic = {
    title: epicTitle,
    status: 'deferred',
    description: `spec: ${specPath}\nEpic: ${epicTitle}`,
  };

  const issues = open.map((t) => {
    const label = t.label ? ` [${t.label}]` : '';
    const titleLine = `${t.id}${label} ${t.description}`;
    const desc = [
      `spec: ${specPath}`,
      `Task: ${titleLine}`,
      `State: [${t.glyph}]`,
      t.label ? `Story: ${t.label}` : null,
      t.deps.length ? `Deps: ${t.deps.join(', ')}` : null,
      t.blockedBy ? `Blocked-by: ${t.blockedBy}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return { key: t.id, title: titleLine, priority: priorityOf(t), state: t.glyph, description: desc };
  });

  // dependency edges among OPEN issues only (deps satisfied by done tasks are dropped)
  const deps = deriveDependencies(parsed).filter((e) => openIds.has(e.from) && openIds.has(e.to));

  /** @type {string[]} */
  const commands = [];
  commands.push(`bd create ${shq(epic.title)} -t epic --status=deferred --description=${shq(epic.description)} --json`);
  for (const it of issues) {
    commands.push(
      `bd create ${shq(it.title)} -t task -p ${it.priority}${statusFlag(it.state)} --description=${shq(it.description)} --json`,
    );
  }
  // Dependencies cannot be wired until the created issues have Beads IDs, so
  // emit them as post-create notes (task-key edges) rather than broken
  // `bd dep <task-key> <task-key>` commands. The structured `deps` array below
  // carries the same edges for a follow-up tool.
  if (deps.length) {
    commands.push('# dependencies — after create, map each task key to its Beads id, then run bd dep:');
    for (const e of deps) commands.push(`#   ${e.from} depends on ${e.to}`);
  }

  return { spec_path: specPath, idea_path: ideaPath, discovery, epic, issues, deps, skipped_done, commands };
}

/**
 * Reject parser warnings and malformed exact board-fence sequences before a
 * mirror can derive or apply any state changes.
 * @param {string} content
 * @param {ReturnType<typeof parseTasks>} parsed
 */
function assertMirrorTaskStructure(content, parsed) {
  const lines = String(content).split('\n');
  const starts = [];
  const ends = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line === BOARD_START) starts.push(index);
    if (line === BOARD_END) ends.push(index);
  }

  const warnings = [...parsed.warnings];
  if (starts.length !== ends.length) {
    warnings.push(`unbalanced board fences (${starts.length} start / ${ends.length} end)`);
  } else if (starts.length > 1) {
    warnings.push(`multiple board fence pairs found (${starts.length}); expected 0 or 1`);
  } else if (starts.length === 1 && starts[0] > ends[0]) {
    warnings.push('board fence end appears before its start');
  }
  if (warnings.length > 0) {
    throw new Error(`tasks.md has structural issues; fix first:\n  ${warnings.join('\n  ')}`);
  }
}

/** @param {any} issue @returns {string | null} */
function issueTaskKey(issue) {
  const text = `${issue.description || ''}\n${issue.title || ''}`;
  const keys = [...new Set(text.match(new RegExp(TASK_KEY_RE.source, 'g')) || [])];
  if (keys.length === 0) return null;
  if (keys.length > 1) throw new Error(`Beads issue ${issueId(issue)} has conflicting task keys: ${keys.join(', ')}`);
  return keys[0];
}

/** @param {any} issue @returns {string} */
function issueStatus(issue) {
  return String(issue.status || issue.state || '').toLowerCase().replace(/\s+/g, '_');
}

/**
 * Extract the canonical task key + glyph from a bd issue object.
 * @param {any} issue
 * @returns {{ key: string, glyph: string } | null}
 */
export function issueToState(issue) {
  const key = issueTaskKey(issue);
  if (!key) return null;
  const status = issueStatus(issue);
  const glyph = BD_STATE_GLYPH[status];
  if (glyph === undefined) return null;
  return { key, glyph };
}

/** @param {any} issue @returns {string | null} */
function issueSpecIdentity(issue) {
  const firstLine = String(issue.description || '').split(/\r?\n/, 1)[0];
  const match = /^spec: (.+)$/.exec(firstLine);
  return match ? match[1] : null;
}

/**
 * Build a {taskId: glyph} map from a complete Beads issue array. When
 * `specPath` is given, only issues whose first description line equals
 * `spec: <specPath>` are considered, so a mirror never applies another
 * feature's state.
 * @param {any[]} bdIssues
 * @param {string} [specPath]
 * @returns {Record<string, string>}
 */
export function mirrorMap(bdIssues, specPath) {
  /** @type {Record<string,string>} */
  const map = {};
  /** @type {{ issue_id: string, key: string, status: string }[]} */
  const unsupported = [];
  /** @type {{ key: string, glyph: string }[]} */
  const representable = [];
  for (const issue of Array.isArray(bdIssues) ? bdIssues : []) {
    if (specPath && issueSpecIdentity(issue) !== specPath) continue;
    if (isEpicIssue(issue)) continue;
    const key = issueTaskKey(issue);
    if (!key) continue;
    const status = issueStatus(issue);
    const glyph = BD_STATE_GLYPH[status];
    if (glyph === undefined) {
      unsupported.push({ issue_id: issueId(issue), key, status });
      continue;
    }
    representable.push({ key, glyph });
  }
  if (unsupported.length > 0) {
    const feature = specPath ? ` for '${specPath}'` : '';
    const details = unsupported
      .map((item) => `${item.issue_id}: ${item.key} status=${item.status}`)
      .join('\n  ');
    throw new Error(
      `unsupported executable Beads issue(s)${feature}:\n  ${details}\n`
      + 'choose open, in_progress, blocked, or closed status before mirroring',
    );
  }
  for (const state of representable) {
    if (Object.hasOwn(map, state.key)) {
      const kind = map[state.key] === state.glyph ? 'duplicate' : 'conflicting';
      throw new Error(`${kind} Beads mappings for task key ${state.key}`);
    }
    map[state.key] = state.glyph;
  }
  return map;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {any} */
  const out = { json: false, write: false, root: process.cwd() };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--write') out.write = true;
    else if (a === '--spec') out.spec = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--bd') out.bd = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else pos.push(a);
  }
  out.cmd = pos[0];
  out.file = pos[1];
  return out;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const HELP =
    'usage:\n' +
    '  node beads.mjs plan-import <tasks.md> --spec <spec_path> [--title "..."] [--from <bd-list.json>|--bd <command>] [--json]\n' +
    '  node beads.mjs mirror <tasks.md> --from <bd-list.json> [--spec <spec_path>] [--write]\n';
  if (args.help || !args.cmd || !args.file) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }
  const relativeFile = path.relative(path.resolve(args.root), path.resolve(args.file)).split(path.sep).join('/');

  try {
    if (args.cmd === 'plan-import') {
      if (!args.spec) throw new Error('plan-import requires --spec <spec_path>');
      const resolvedTasksPath = validateFeatureIdentity(args.root, relativeFile, args.spec);
      const owner = requireFeatureOwner(args.root, args.spec);
      const parsed = parseTasks(fs.readFileSync(resolvedTasksPath, 'utf8'), { path: resolvedTasksPath });
      if (parsed.warnings.length) throw new Error(`tasks.md has structural issues; fix first:\n  ${parsed.warnings.join('\n  ')}`);
      const existingIssues = loadImportIssues(args);
      const plan = planImport(parsed, {
        specPath: args.spec,
        ideaPath: owner.ideaPath,
        title: args.title,
        existingIssues,
      });
      if (args.json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      else {
        process.stdout.write(`# import plan for ${args.spec} — ${plan.issues.length} open issue(s), ${plan.deps.length} dep(s), ${plan.skipped_done.length} done skipped\n`);
        process.stdout.write(`# idea_path: ${owner.ideaPath}\n`);
        for (const c of plan.commands) process.stdout.write(`${c}\n`);
      }
      return;
    }
    if (args.cmd === 'mirror') {
      if (!args.from) throw new Error('mirror requires --from <bd-list.json>');
      if (args.write && !args.spec) throw new Error('mirror --write requires --spec <spec_path>');
      const resolvedTasksPath = args.spec
        ? validateFeatureIdentity(args.root, relativeFile, args.spec)
        : path.resolve(args.file);
      const owner = args.write ? requireFeatureOwner(args.root, args.spec) : null;
      if (!lstatOrNull(resolvedTasksPath)?.isFile()) throw new Error(`file not found: ${args.file}`);
      const content = fs.readFileSync(resolvedTasksPath, 'utf8');
      const parsed = parseTasks(content, { path: resolvedTasksPath });
      assertMirrorTaskStructure(content, parsed);
      const bd = parseBdIssues(fs.readFileSync(args.from), args.from);
      const map = mirrorMap(bd, args.spec);
      const result = applyStates(parsed, map);
      if (args.write) {
        fs.writeFileSync(resolvedTasksPath, result.content);
        process.stdout.write(`[OK] mirrored ${result.applied.length} state(s) into ${resolvedTasksPath}\n`);
        process.stdout.write(`[INFO] idea_path: ${owner?.ideaPath}\n`);
      } else {
        process.stdout.write(`${result.applied.length} state(s) would change (dry run; pass --write)\n`);
      }
      for (const id of result.unknown) process.stdout.write(`[WARN] bd issue key not in tasks.md: ${id}\n`);
      return;
    }
    throw new Error(`unknown command: ${args.cmd}`);
  } catch (err) {
    process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}

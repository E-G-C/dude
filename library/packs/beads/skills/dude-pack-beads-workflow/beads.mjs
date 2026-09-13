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
import { normalizeBeadsIssue } from '../dude-engine/lib/beads-issue.mjs';
import { resolveFeatureOwner } from '../dude-engine/lib/feature.mjs';
import { resolveMutationPath } from '../dude-engine/lib/workspace-paths.mjs';
import {
  authorizeAttempt as authorizeCoreRecoveryAttempt,
  canonicalJson,
  collectEvidence as collectCoreRecoveryEvidence,
  inspect as inspectCoreRecovery,
  runCommand as runCoreRecoveryCommand,
  sha256,
  validateLaneMutationPermitV1,
  validateProjectionPermitV1,
  validateRunState,
  validateTrackedCompositeReceiptV1,
} from '../dude-work/recovery.mjs';

/** bd issue status -> canonical task glyph. */
const BD_STATE_GLYPH = {
  open: ' ',
  in_progress: '~',
  blocked: '!',
  closed: 'x',
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
  return normalizeBeadsIssue(issue).isEpic;
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
  const epics = matching.filter((issue) => normalizeBeadsIssue(issue).isEpic);
  if (epics.length > 1) {
    throw new Error(`duplicate feature identity '${specPath}' is claimed by epics: ${epics.map(issueId).join(', ')}`);
  }

  const taskOwners = new Map();
  for (const issue of matching) {
    if (normalizeBeadsIssue(issue).isEpic) continue;
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
  return normalizeBeadsIssue(issue).statusToken;
}

/**
 * Extract the canonical task key + glyph from a bd issue object.
 * @param {any} issue
 * @returns {{ key: string, glyph: string } | null}
 */
export function issueToState(issue) {
  const key = issueTaskKey(issue);
  if (!key) return null;
  const { status } = normalizeBeadsIssue(issue);
  const glyph = status === null ? undefined : BD_STATE_GLYPH[status];
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
    const normalized = normalizeBeadsIssue(issue);
    if (normalized.isEpic) continue;
    const key = issueTaskKey(issue);
    if (!key) continue;
    const glyph = normalized.status === null ? undefined : BD_STATE_GLYPH[normalized.status];
    if (glyph === undefined) {
      unsupported.push({ issue_id: issueId(issue), key, status: normalized.statusToken });
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

// --- Autonomous v2 tracked lane trust boundary -------------------------------
//
// The closed tracked `work-project`, `work-transition`, `work-prove-poststate`,
// and `work-reconcile-owner` wrapper requests of the immutable Feature 009
// schemas. Nothing caller-supplied is trusted where fresh evidence is
// obtainable: captures are reacquired through the injected authority port, the
// owner binding, mapping, prestate, mutation identity, every event parsed from
// `mutation.eventLines`, the poststate proof, and the receipt captures are all
// re-derived here. The wrapper accepts no command line, executable, shell
// fragment, or subprocess argument.

const LANE_EVENT_PREFIX = '- dude-run-event: ';
const MAX_EVENT_BYTES = 16_384;
const MAX_EVENT_LINE_TEXT_BYTES = 16_402;
const TRACKED_STATUSES = Object.freeze(['open', 'in_progress', 'blocked', 'closed']);
const TRACKED_KIND_REASONS = Object.freeze({
  'append-event': Object.freeze(['event-projection']),
  claim: Object.freeze(['initial-claim', 'resume-claim', 'post-learning-claim']),
  'task-blocked': Object.freeze(['task-blocked', 'no-progress']),
  'task-completed': Object.freeze(['task-completed']),
  'controlled-end': Object.freeze(['controlled-unresolved-end']),
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
const IDEA_PATH_RE = /^\.dude\/ideas\/[^/]+\.md$/;
const ANCHORED_TASK_KEY_RE = new RegExp(`^${TASK_KEY_RE.source}$`);
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f-\u009f]/;
const BLOCKED_BY_LINE_RE = /^Blocked-by: (.*)$/;
const TRACKED_CAPTURE_KINDS = Object.freeze(['list', 'detail', 'history']);
const UNOBSERVED_TRACKED_HASH = sha256(canonicalJson({ detail: null, history: null, list: null, owner: null }));

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

/**
 * Require exactly the closed field set. An extra key is `unknown-field`; a
 * missing key or non-record is `invalid-request-shape`.
 * @param {unknown} value @param {string[]} fields @returns {Record<string, unknown>}
 */
function exactRecord(value, fields) {
  if (!isPlainObject(value)) refuse('invalid-request-shape');
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

/** @param {unknown} value */
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

/** @param {Buffer|string} value */
function capturedBytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return { base64: bytes.toString('base64'), sha256: sha256(bytes), byteLength: bytes.byteLength };
}

/** @param {Buffer|string} value */
function descriptorOf(value) {
  const capture = capturedBytes(value);
  return { sha256: capture.sha256, byteLength: capture.byteLength };
}

/** @param {unknown} value @returns {{specPath:string,lane:'tracked',issueId:string}} */
function requireTrackedTarget(value) {
  const target = exactRecord(value, ['specPath', 'lane', 'issueId']);
  if (typeof target.specPath !== 'string' || !SPEC_PATH_RE.test(target.specPath)) {
    refuse('invalid-canonical-value');
  }
  if (target.lane !== 'tracked') refuse('invalid-canonical-value');
  if (!isValidRecoveryIssueId(target.issueId)) refuse('invalid-canonical-value');
  return {
    specPath: /** @type {string} */ (target.specPath),
    lane: 'tracked',
    issueId: /** @type {string} */ (target.issueId),
  };
}

/** @param {unknown} value */
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
  if (!isPlainObject(parsed)) refuse('event-line-mismatch');
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
  const record = `${text}\n`;
  return {
    eventHash: /** @type {string} */ (eventHash),
    exactLine: /** @type {string} */ (text),
    record,
    recordHash: sha256(record),
  };
}

/** @param {unknown} value */
function requireEventLineEffect(value) {
  if (!isPlainObject(value)) refuse('mutation-schema-mismatch');
  if (value.kind === 'none') {
    exactRecord(value, ['kind']);
    return { kind: 'none', lines: /** @type {ReturnType<typeof requireEventLine>[]} */ ([]) };
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
  if (!isPlainObject(value)) refuse('mutation-schema-mismatch');
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

/** The closed tracked transition matrix. @param {Record<string, unknown>} mutation @param {{kind:string,before:string|null,after:string|null}} blocker */
function requireClosedTrackedTransition(mutation, blocker) {
  const from = /** @type {string} */ (mutation.fromStatus);
  const to = /** @type {string} */ (mutation.toStatus);
  const nullBlocker = blocker.kind === 'unchanged' && blocker.before === null && blocker.after === null;
  const allowed = (() => {
    switch (mutation.kind) {
      case 'append-event':
        return from === to && blocker.kind === 'unchanged';
      case 'claim':
        return (from === 'open' && to === 'in_progress' && nullBlocker)
          || (from === 'blocked' && to === 'in_progress' && blocker.kind === 'remove');
      case 'task-blocked':
        return ((from === 'open' || from === 'in_progress') && to === 'blocked' && blocker.kind === 'add')
          || (from === 'blocked' && to === 'blocked' && blocker.kind === 'replace');
      case 'task-completed':
        return from === 'in_progress' && to === 'closed' && nullBlocker;
      case 'controlled-end':
        return from === to && from !== 'closed' && blocker.kind === 'unchanged';
      default:
        return false;
    }
  })();
  if (!allowed) refuse('transition-not-allowed');
}

/**
 * Validate one complete closed tracked mutation object and recompute its
 * whole-object identity.
 * @param {unknown} value @param {'work-project'|'work-transition'} operation
 * @param {{specPath:string,lane:'tracked',issueId:string}} target
 */
function requireTrackedMutation(value, operation, target) {
  if (!isPlainObject(value)) refuse('mutation-schema-mismatch');
  if (operation === 'work-project' && value.kind !== 'append-event') refuse('mutation-schema-mismatch');
  if (operation === 'work-transition' && value.kind === 'append-event') refuse('mutation-schema-mismatch');
  const mutation = exactRecord(value, [
    'version', 'lane', 'kind', 'reason', 'target', 'fromStatus', 'toStatus',
    'blocker', 'eventLines', 'ownerLog',
  ]);
  if (mutation.version !== 1) refuse('mutation-schema-mismatch');
  if (mutation.lane !== 'tracked') refuse('mutation-schema-mismatch');
  const kind = /** @type {string} */ (mutation.kind);
  if (!Object.hasOwn(TRACKED_KIND_REASONS, kind)) refuse('mutation-schema-mismatch');
  if (!TRACKED_KIND_REASONS[kind].includes(/** @type {string} */ (mutation.reason))) {
    refuse('mutation-schema-mismatch');
  }
  const mutationTarget = requireTrackedTarget(mutation.target);
  if (canonicalJson(mutationTarget) !== canonicalJson(target)) refuse('target-mismatch');
  for (const field of ['fromStatus', 'toStatus']) {
    if (!TRACKED_STATUSES.includes(/** @type {string} */ (mutation[field]))) refuse('mutation-schema-mismatch');
  }
  const blocker = requireBlockerEffect(mutation.blocker);
  const eventLines = requireEventLineEffect(mutation.eventLines);
  const ownerLog = requireOwnerLogEffect(mutation.ownerLog);
  if (kind === 'append-event' && eventLines.lines.length !== 1) refuse('event-line-mismatch');
  requireClosedTrackedTransition(mutation, blocker);
  return { mutation, blocker, eventLines, ownerLog, mutationIdentity: sha256(canonicalJson(mutation)) };
}

/** @param {string} absolutePath @returns {Buffer | null} */
function readFileOrNull(absolutePath) {
  const stat = lstatOrNull(absolutePath);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) return null;
  return fs.readFileSync(absolutePath);
}

/**
 * Resolve the one mutation-safe owner path below a canonical root. Any symlink,
 * escape, or noncanonical root refuses before every read.
 * @param {unknown} rootValue @param {string} ideaPath
 */
function resolveTrackedOwnerSurface(rootValue, ideaPath) {
  if (typeof rootValue !== 'string' || !rootValue || !path.isAbsolute(rootValue)) {
    refuse('unsafe-root-or-path');
  }
  const root = /** @type {string} */ (rootValue);
  try {
    if (path.resolve(root) !== root) refuse('unsafe-root-or-path');
    const stat = lstatOrNull(root);
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) refuse('unsafe-root-or-path');
    if (fs.realpathSync(root) !== root) refuse('unsafe-root-or-path');
    return { root, ownerPath: ideaPath, absolutePath: resolveMutationPath(root, ideaPath) };
  } catch (error) {
    if (error instanceof LaneRefusalError) throw error;
    return refuse('unsafe-root-or-path');
  }
}

/**
 * The single fresh acquisition of every authoritative tracked surface. The
 * prestate, the poststate proof, refusal evidence, and every receipt call this,
 * so no path can drift from another. The port receives only the closed capture
 * kind and the canonical target; never a command line.
 * @param {{capture:(kind:string,target:Record<string,unknown>)=>string|Buffer}} ports
 * @param {{specPath:string,lane:'tracked',issueId:string}} target
 * @param {{absolutePath:string}|null} ownerSurface
 */
function acquireTrackedSurfaces(ports, target, ownerSurface) {
  if (!ports || typeof ports.capture !== 'function') refuse('tracked-operation-failed');
  /** @type {Record<string, Buffer>} */
  const captures = {};
  for (const kind of TRACKED_CAPTURE_KINDS) {
    let bytes;
    try {
      bytes = ports.capture(kind, { ...target });
    } catch {
      return refuse('tracked-operation-failed');
    }
    if (typeof bytes !== 'string' && !Buffer.isBuffer(bytes)) refuse('tracked-operation-failed');
    captures[kind] = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  }
  return {
    list: captures.list,
    detail: captures.detail,
    history: captures.history,
    owner: ownerSurface ? readFileOrNull(ownerSurface.absolutePath) : null,
  };
}

/** @param {ReturnType<typeof acquireTrackedSurfaces>} observation */
function trackedObservationHash(observation) {
  return sha256(canonicalJson({
    detail: descriptorOf(observation.detail),
    history: descriptorOf(observation.history),
    list: descriptorOf(observation.list),
    owner: observation.owner ? descriptorOf(observation.owner) : null,
  }));
}

/** @param {ReturnType<typeof acquireTrackedSurfaces>} observation */
function trackedCaptureSet(observation) {
  return {
    list: capturedBytes(observation.list),
    detail: capturedBytes(observation.detail),
    history: capturedBytes(observation.history),
  };
}

/** @param {ReturnType<typeof acquireTrackedSurfaces>} observation */
function trackedCaptureDescriptorSet(observation) {
  return {
    list: descriptorOf(observation.list),
    detail: descriptorOf(observation.detail),
    history: descriptorOf(observation.history),
  };
}

/**
 * Normalize one complete fresh capture set into the exact-feature issue index,
 * the target detail issue, and the target history.
 * @param {ReturnType<typeof acquireTrackedSurfaces>} observation
 * @param {{specPath:string,lane:'tracked',issueId:string}} target
 */
function normalizeTrackedCaptures(observation, target) {
  let listed;
  let shown;
  let history;
  try {
    listed = parseBdIssues(observation.list, 'tracked list capture');
    shown = parseBdIssues(observation.detail, 'tracked detail capture');
    history = JSON.parse(observation.history.toString('utf8'));
  } catch {
    return refuse('tracked-operation-failed');
  }
  if (shown.length !== 1) refuse('tracked-operation-failed');
  if (!Array.isArray(history) || Object.keys(history).length !== history.length) {
    refuse('tracked-operation-failed');
  }
  for (const event of history) {
    const keys = isPlainObject(event) ? Object.keys(event).sort().join(',') : '';
    if (keys !== 'CommitDate,CommitHash,Committer,Issue' || !isPlainObject(event.Issue)) {
      refuse('tracked-operation-failed');
    }
    if (issueId(event.Issue) !== target.issueId) refuse('tracked-operation-failed');
  }
  const feature = listed.filter((issue) => hasExactSpecIdentity(issue, target.specPath));
  const executable = feature.filter((issue) => !isEpicIssue(issue));
  const matches = executable.filter((issue) => issueId(issue) === target.issueId);
  if (matches.length === 0) refuse('mapping-missing');
  if (matches.length > 1) refuse('mapping-ambiguous');
  if (issueId(shown[0]) !== target.issueId) refuse('target-mismatch');
  if (!hasExactSpecIdentity(shown[0], target.specPath)) refuse('target-mismatch');
  return { listed, feature, executable, detail: shown[0], history };
}

/**
 * Derive the unique durable task key for the target issue from the complete
 * fresh exact-feature inventory. Zero or multiple owners fail closed.
 * @param {ReturnType<typeof normalizeTrackedCaptures>} normalized
 * @param {{specPath:string,lane:'tracked',issueId:string}} target
 */
function uniqueTrackedTaskKey(normalized, target) {
  let taskKey;
  try {
    taskKey = issueTaskKey(normalized.detail);
  } catch {
    return refuse('mapping-ambiguous');
  }
  if (!taskKey) refuse('mapping-missing');
  /** @type {string[]} */
  const owners = [];
  for (const issue of normalized.executable) {
    let key;
    try {
      key = issueTaskKey(issue);
    } catch {
      return refuse('mapping-ambiguous');
    }
    if (key === taskKey) owners.push(issueId(issue));
  }
  if (owners.length === 0) refuse('mapping-missing');
  if (owners.length > 1) refuse('mapping-ambiguous');
  if (owners[0] !== target.issueId) refuse('mapping-mismatch');
  return taskKey;
}

/** @param {Record<string, unknown>} issue */
function trackedIssueBlocker(issue) {
  const description = typeof issue.description === 'string' ? issue.description : '';
  const matches = description.split('\n')
    .map((line) => BLOCKED_BY_LINE_RE.exec(line))
    .filter((match) => match !== null);
  if (matches.length === 0) return null;
  if (matches.length > 1) refuse('lane-prestate-mismatch');
  const text = /** @type {RegExpExecArray} */ (matches[0])[1];
  return text.length > 0 ? text : null;
}

/** @param {Record<string, unknown>} issue */
function trackedIssueStatus(issue) {
  const raw = issueStatus(issue);
  if (!Object.hasOwn(SUPPORTED_RECOVERY_STATUSES, raw)) refuse('lane-prestate-mismatch');
  return SUPPORTED_RECOVERY_STATUSES[raw];
}

/**
 * Apply one exact blocker effect to a Beads description.
 * @param {string} description @param {{kind:string,before:string|null,after:string|null}} blocker
 */
function trackedDescriptionPostimage(description, blocker) {
  if (blocker.kind === 'unchanged') return description;
  const lines = description.split('\n');
  const index = lines.findIndex((line) => BLOCKED_BY_LINE_RE.test(line));
  if (blocker.kind === 'add') {
    if (index !== -1) refuse('lane-prestate-mismatch');
    const body = description.endsWith('\n') ? description.slice(0, -1) : description;
    return `${body}\nBlocked-by: ${blocker.after}`;
  }
  if (index === -1) refuse('lane-prestate-mismatch');
  if (blocker.kind === 'remove') return lines.filter((_, position) => position !== index).join('\n');
  lines[index] = `Blocked-by: ${blocker.after}`;
  return lines.join('\n');
}

/**
 * Apply the exact LF-terminated lane event records to the Beads notes surface.
 * An exact existing record is idempotent; a same-hash different body conflicts.
 * @param {unknown} notes @param {ReturnType<typeof requireEventLine>[]} lines
 */
function trackedNotesPostimage(notes, lines) {
  if (lines.length === 0) return notes;
  if (notes !== undefined && typeof notes !== 'string') refuse('lane-prestate-mismatch');
  const current = typeof notes === 'string' ? notes : '';
  /** @type {Map<string,Set<string>>} */
  const byHash = new Map();
  for (const line of current.split('\n')) {
    if (!line.startsWith(LANE_EVENT_PREFIX)) continue;
    let parsed;
    try {
      parsed = JSON.parse(line.slice(LANE_EVENT_PREFIX.length));
    } catch {
      continue;
    }
    if (!isPlainObject(parsed) || typeof parsed.eventHash !== 'string') continue;
    const bodies = byHash.get(parsed.eventHash) || new Set();
    bodies.add(line);
    byHash.set(parsed.eventHash, bodies);
  }
  let next = current === '' || current.endsWith('\n') ? current : `${current}\n`;
  for (const line of lines) {
    const bodies = byHash.get(line.eventHash);
    if (bodies && (bodies.size > 1 || !bodies.has(line.exactLine))) refuse('event-conflict');
    if (!bodies) next += line.record;
  }
  return next;
}

/**
 * The canonical tracked projector: the complete expected postimage of the
 * target issue. Only mutation-authorized fields may change; every other field
 * must remain identical or be bound by the dispatch result.
 * @param {Record<string, unknown>} original
 * @param {{mutation:Record<string,unknown>,blocker:any,eventLines:any}} derived
 */
function trackedIssuePostimage(original, derived) {
  const authorized = {
    status: /** @type {string} */ (derived.mutation.toStatus),
    description: trackedDescriptionPostimage(
      typeof original.description === 'string' ? original.description : '',
      derived.blocker,
    ),
  };
  const notes = trackedNotesPostimage(original.notes, derived.eventLines.lines);
  if (notes !== undefined) Object.assign(authorized, { notes });
  return authorized;
}

/**
 * Compare one observed issue against the authorized postimage. Any field that
 * is neither authorized, identical, nor bound by `dispatchResult` is drift.
 * @param {Record<string, unknown>} original @param {Record<string, unknown>} observed
 * @param {Record<string, unknown>} authorized @param {Record<string, unknown>|null} dispatchBound
 */
function trackedIssueMatchesPostimage(original, observed, authorized, dispatchBound) {
  const keys = new Set([...Object.keys(original), ...Object.keys(observed), ...Object.keys(authorized)]);
  for (const key of keys) {
    if (Object.hasOwn(authorized, key)) {
      if (!isDeepStrictEqual(observed[key], authorized[key])) return false;
      continue;
    }
    if (Object.hasOwn(original, key) === Object.hasOwn(observed, key)
      && isDeepStrictEqual(observed[key], original[key])) continue;
    if (dispatchBound
      && Object.hasOwn(dispatchBound, key)
      && isDeepStrictEqual(observed[key], dispatchBound[key])) continue;
    return false;
  }
  return true;
}

/**
 * Prove one complete fresh tracked poststate against the projected postimage
 * without dispatching. Every dispatching and recovery path calls exactly this
 * helper, so issuance and proof cannot drift.
 * @param {{
 *   original: ReturnType<typeof normalizeTrackedCaptures>,
 *   observed: ReturnType<typeof acquireTrackedSurfaces>,
 *   derived: {mutation:Record<string,unknown>,blocker:any,eventLines:any},
 *   dispatchResult: Record<string, unknown>,
 *   target: {specPath:string,lane:'tracked',issueId:string},
 * }} input
 */
function trackedPoststateProven(input) {
  const observed = normalizeTrackedCaptures(input.observed, input.target);
  const authorized = trackedIssuePostimage(input.original.detail, input.derived);
  let dispatchBound = null;
  try {
    const decoded = JSON.parse(Buffer.from(
      /** @type {string} */ (/** @type {any} */ (input.dispatchResult.result).base64),
      'base64',
    ).toString('utf8'));
    const rows = Array.isArray(decoded) ? decoded : [decoded];
    const match = rows.filter((row) => isPlainObject(row) && issueId(row) === input.target.issueId);
    if (match.length === 1) dispatchBound = match[0];
  } catch {
    dispatchBound = null;
  }
  if (!trackedIssueMatchesPostimage(input.original.detail, observed.detail, authorized, dispatchBound)) {
    return false;
  }

  const originalById = new Map(input.original.listed.map((issue) => [issueId(issue), issue]));
  const observedById = new Map(observed.listed.map((issue) => [issueId(issue), issue]));
  if (originalById.size !== observedById.size) return false;
  for (const [id, issue] of originalById) {
    const row = observedById.get(id);
    if (!row) return false;
    if (id === input.target.issueId) {
      if (!trackedIssueMatchesPostimage(issue, row, authorized, dispatchBound)) return false;
      continue;
    }
    if (canonicalJson(issue) !== canonicalJson(row)) return false;
  }

  const originalHistory = input.original.history;
  const observedHistory = observed.history;
  if (observedHistory.length < originalHistory.length) return false;
  const added = observedHistory.length - originalHistory.length;
  for (let index = 0; index < originalHistory.length; index += 1) {
    if (canonicalJson(observedHistory[added + index]) !== canonicalJson(originalHistory[index])) return false;
  }
  for (let index = 0; index < added; index += 1) {
    const event = observedHistory[index];
    if (issueId(event.Issue) !== input.target.issueId) return false;
    if (!trackedIssueMatchesPostimage(input.original.detail, event.Issue, authorized, dispatchBound)) return false;
  }
  return true;
}

/** @param {Record<string, unknown>} body */
function withIdentity(body, field) {
  return { ...body, [field]: sha256(canonicalJson(body)) };
}

/**
 * @param {{operationEvidenceIdentity:string,payloadIdentity:string,mutationIdentity:string,target:Record<string,unknown>}} parts
 */
function dispatchRecoveryIdentity(parts) {
  return sha256(canonicalJson({
    version: 1,
    stage: 'tracked-operation-dispatched',
    operationEvidenceIdentity: parts.operationEvidenceIdentity,
    payloadIdentity: parts.payloadIdentity,
    mutationIdentity: parts.mutationIdentity,
    target: parts.target,
    expectedNextOperation: 'work-prove-poststate',
  }));
}

/**
 * @param {{laneReceiptHash:string,operationEvidenceIdentity:string,payloadIdentity:string,mutationIdentity:string,target:Record<string,unknown>}} parts
 */
function ownerRecoveryIdentity(parts) {
  return sha256(canonicalJson({
    version: 1,
    stage: 'tracked-lane-committed',
    laneReceiptHash: parts.laneReceiptHash,
    operationEvidenceIdentity: parts.operationEvidenceIdentity,
    payloadIdentity: parts.payloadIdentity,
    mutationIdentity: parts.mutationIdentity,
    target: parts.target,
    expectedNextOperation: 'work-reconcile-owner',
  }));
}

/**
 * Build the exact tracked lane receipt from a freshly reacquired poststate.
 * @param {{evidence:Record<string,unknown>,permitHash:string,derived:any,target:Record<string,unknown>,targetMappingHash:string,lanePrestateHash:string,observed:ReturnType<typeof acquireTrackedSurfaces>}} parts
 */
function trackedLaneReceipt(parts) {
  const poststateCaptures = trackedCaptureDescriptorSet(parts.observed);
  return withIdentity({
    version: 1,
    lane: 'tracked',
    operationEvidenceIdentity: parts.evidence.operationEvidenceIdentity,
    permitHash: parts.permitHash,
    mutationIdentity: parts.derived.mutationIdentity,
    target: parts.target,
    targetMappingHash: parts.targetMappingHash,
    lanePrestateHash: parts.lanePrestateHash,
    poststateCaptures,
    lanePoststateHash: sha256(canonicalJson(poststateCaptures)),
    eventLineRecordHashes: parts.derived.eventLines.lines.map((line) => line.recordHash),
  }, 'receiptHash');
}

/**
 * Apply the exact owner effect and prove it by fresh reacquisition. Only the
 * exact original preimage or the deterministic single-append postimage is
 * accepted, so reconciliation stays idempotent and never double-appends.
 * @param {{ownerSurface:{absolutePath:string,ownerPath:string},ownerLog:any,mutationIdentity:string,ownerBytes:Buffer}} parts
 */
function commitTrackedOwnerLog(parts) {
  const before = parts.ownerBytes;
  const prestateHash = sha256(before);
  // The mandatory `append-exact` cross-binding, enforced on the dispatching and
  // the reconciliation path alike: the envelope's expected owner hash must name
  // the exact preimage this call is about to compare-and-append against.
  if (parts.ownerLog.kind === 'append-exact' && parts.ownerLog.expectedOwnerHash !== prestateHash) {
    refuse('owner-prestate-mismatch');
  }
  if (parts.ownerLog.kind === 'none') {
    const fresh = readFileOrNull(parts.ownerSurface.absolutePath);
    if (!fresh || !fresh.equals(before)) indeterminate('owner-log-outcome-ambiguous');
    return withIdentity({
      version: 1,
      effect: 'unchanged',
      mutationIdentity: parts.mutationIdentity,
      ownerPath: parts.ownerSurface.ownerPath,
      ownerPrestateHash: prestateHash,
      ownerPoststateHash: sha256(/** @type {Buffer} */ (fresh)),
    }, 'receiptHash');
  }
  if (parts.ownerLog.ownerPath !== parts.ownerSurface.ownerPath) refuse('owner-log-conflict');
  const text = before.toString('utf8');
  if (!text.endsWith('\n')) refuse('owner-log-conflict');
  const present = new Set(text.split('\n'));
  let next = text;
  for (const line of parts.ownerLog.exactLines) {
    if (!present.has(line)) next += `${line}\n`;
  }
  const after = Buffer.from(next);
  const observed = readFileOrNull(parts.ownerSurface.absolutePath);
  if (!observed) indeterminate('owner-log-outcome-ambiguous');
  const current = /** @type {Buffer} */ (observed);
  if (!current.equals(before) && !current.equals(after)) indeterminate('owner-log-outcome-ambiguous');
  if (!current.equals(after)) {
    try {
      fs.writeFileSync(parts.ownerSurface.absolutePath, after);
    } catch {
      indeterminate('owner-log-outcome-ambiguous');
    }
  }
  const fresh = readFileOrNull(parts.ownerSurface.absolutePath);
  if (!fresh || !fresh.equals(after)) indeterminate('owner-log-outcome-ambiguous');
  return withIdentity({
    version: 1,
    effect: 'append-exact',
    mutationIdentity: parts.mutationIdentity,
    ownerPath: parts.ownerSurface.ownerPath,
    ownerPrestateHash: prestateHash,
    exactLineHashes: parts.ownerLog.exactLines.map((line) => sha256(`${line}\n`)),
    ownerPoststateHash: sha256(/** @type {Buffer} */ (fresh)),
  }, 'receiptHash');
}

/**
 * Bind one complete tracked request: fresh captures, owner, mapping, RunState,
 * prestate, permit, and mutation. Shared by every tracked operation so the
 * dispatching and recovery paths cannot enforce different rules.
 * @param {Record<string, unknown>} request
 * @param {'work-project'|'work-transition'|'work-prove-poststate'|'work-reconcile-owner'} operation
 * @param {any} ports @param {{observation:any}} context
 */
function bindTrackedBoundary(request, operation, ports, context) {
  const target = requireTrackedTarget(request.target);
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

  const ownerSurface = resolveTrackedOwnerSurface(request.root, /** @type {string} */ (owner.ideaPath));
  const observation = acquireTrackedSurfaces(ports, target, ownerSurface);
  context.observation = observation;
  if (!observation.owner) refuse('owner-resolution-failed');
  // `owner.ownerCapture` is the original dispatch preimage. Owner
  // reconciliation accepts the preimage or its deterministic single-append
  // postimage, so only that path defers the exact byte comparison.
  if (operation !== 'work-reconcile-owner' && !observation.owner.equals(ownerCaptureBytes)) {
    refuse('owner-prestate-mismatch');
  }
  let resolved;
  try {
    resolved = requireFeatureOwner(ownerSurface.root, target.specPath);
  } catch {
    return refuse('owner-resolution-failed');
  }
  if (resolved.ideaPath !== owner.ideaPath) refuse('owner-resolution-failed');

  const normalized = normalizeTrackedCaptures(observation, target);
  const taskKey = uniqueTrackedTaskKey(normalized, target);

  // D-4: mapping descriptors are compared to the freshly reacquired captures,
  // so `targetMappingHash` can never be a caller-chosen value.
  const mapping = exactRecord(request.mapping, [
    'version', 'lane', 'target', 'ownerBindingHash', 'taskKey',
    'listDescriptor', 'detailDescriptor', 'historyDescriptor',
  ]);
  if (mapping.version !== 1 || mapping.lane !== 'tracked') refuse('mapping-mismatch');
  if (canonicalJson(requireTrackedTarget(mapping.target)) !== canonicalJson(target)) refuse('target-mismatch');
  if (mapping.ownerBindingHash !== ownerBindingHash) refuse('mapping-mismatch');
  if (typeof mapping.taskKey !== 'string' || !ANCHORED_TASK_KEY_RE.test(mapping.taskKey)) {
    refuse('invalid-canonical-value');
  }
  if (mapping.taskKey !== taskKey) refuse('mapping-mismatch');
  const freshDescriptors = trackedCaptureDescriptorSet(observation);
  const dispatching = operation === 'work-project' || operation === 'work-transition';
  // A dispatching request maps the live prestate, so its descriptors must equal
  // the freshly reacquired captures. A recovery request maps the original
  // prestate, whose descriptors are re-derived from the payload originals in
  // `bindTrackedRecoveryEvidence`.
  if (dispatching) {
    for (const [field, kind] of [['listDescriptor', 'list'], ['detailDescriptor', 'detail'], ['historyDescriptor', 'history']]) {
      if (canonicalJson(requireDescriptor(mapping[field])) !== canonicalJson(freshDescriptors[kind])) {
        refuse('mapping-mismatch');
      }
    }
  } else {
    for (const field of ['listDescriptor', 'detailDescriptor', 'historyDescriptor']) {
      requireDescriptor(mapping[field]);
    }
  }
  const targetMappingHash = sha256(canonicalJson(mapping));

  try {
    validateRunState(request.state);
  } catch {
    refuse('invalid-canonical-value');
  }
  const subjectRunStateHash = sha256(canonicalJson(request.state));

  // The lane prestate is derived from the fresh captures, never accepted.
  const prestate = {
    version: 1,
    lane: 'tracked',
    target,
    taskKey,
    status: trackedIssueStatus(normalized.detail),
    blocker: trackedIssueBlocker(normalized.detail),
    listDescriptor: freshDescriptors.list,
    detailDescriptor: freshDescriptors.detail,
    historyDescriptor: freshDescriptors.history,
    ownerDescriptor: descriptorOf(ownerCaptureBytes),
  };
  const lanePrestateHash = sha256(canonicalJson(prestate));

  let permit;
  try {
    permit = /** @type {any} */ (request.permit)?.kind === 'lane-projection'
      ? validateProjectionPermitV1(request.permit)
      : validateLaneMutationPermitV1(request.permit);
  } catch {
    return refuse('permit-hash-mismatch');
  }
  if (permit.lane !== 'tracked') refuse('permit-operation-mismatch');
  if (operation === 'work-project' && permit.kind !== 'lane-projection') refuse('permit-operation-mismatch');
  if (operation === 'work-transition' && permit.kind !== 'lane-mutation') refuse('permit-operation-mismatch');
  if (canonicalJson(requireTrackedTarget(permit.target)) !== canonicalJson(target)) refuse('target-mismatch');
  if (permit.subjectRunStateHash !== subjectRunStateHash) refuse('run-state-mismatch');
  if (permit.targetMappingHash !== targetMappingHash) refuse('mapping-mismatch');

  return {
    target,
    owner,
    ownerSurface,
    ownerBindingHash,
    ownerCaptureBytes,
    observation,
    normalized,
    taskKey,
    mapping,
    targetMappingHash,
    prestate,
    lanePrestateHash,
    permit,
    dispatching,
  };
}

/** Bind and dispatch one tracked `work-project` / `work-transition` request. */
function commitTrackedDispatch(requestValue, operation, ports, context) {
  const request = exactRecord(requestValue, [
    'version', 'operation', 'root', 'owner', 'target', 'state', 'permit', 'mapping', 'expected', 'mutation',
  ]);
  if (request.version !== 1) refuse('invalid-request-shape');
  const expectedShape = exactRecord(request.expected, ['list', 'detail', 'history']);
  /** @type {Record<string, Buffer>} */
  const expected = {
    list: requireCapturedBytes(expectedShape.list),
    detail: requireCapturedBytes(expectedShape.detail),
    history: requireCapturedBytes(expectedShape.history),
  };
  const bound = bindTrackedBoundary(request, operation, ports, context);
  for (const kind of TRACKED_CAPTURE_KINDS) {
    if (!bound.observation[kind].equals(expected[kind])) refuse('expected-capture-mismatch');
  }
  if (bound.permit.lanePrestateHash !== bound.lanePrestateHash) refuse('lane-prestate-mismatch');

  const derived = requireTrackedMutation(request.mutation, operation, bound.target);
  if (bound.permit.mutationIdentity !== derived.mutationIdentity) refuse('mutation-identity-mismatch');
  if (operation === 'work-project' && bound.permit.eventHash !== derived.eventLines.lines[0].eventHash) {
    refuse('event-line-mismatch');
  }
  if (derived.mutation.fromStatus !== bound.prestate.status) refuse('lane-prestate-mismatch');
  if (derived.blocker.before !== bound.prestate.blocker) refuse('lane-prestate-mismatch');
  if (derived.ownerLog.kind === 'append-exact') {
    if (derived.ownerLog.ownerPath !== bound.owner.ideaPath) refuse('owner-log-conflict');
    if (derived.ownerLog.expectedOwnerHash !== sha256(bound.observation.owner)) refuse('owner-prestate-mismatch');
  }
  // Refuse before dispatch when the projected postimage already equals the
  // observed prestate: that permit was consumed.
  if (trackedPoststateProven({
    original: bound.normalized,
    observed: bound.observation,
    derived,
    dispatchResult: { result: capturedBytes('[]') },
    target: bound.target,
  })) refuse('permit-replayed');

  if (!ports || typeof ports.dispatch !== 'function') refuse('tracked-operation-failed');
  let dispatched;
  try {
    dispatched = ports.dispatch({ ...bound.target }, JSON.parse(canonicalJson(derived.mutation)));
  } catch {
    return indeterminate('tracked-lane-outcome-ambiguous');
  }
  if (typeof dispatched !== 'string' && !Buffer.isBuffer(dispatched)) indeterminate('tracked-lane-outcome-ambiguous');

  const dispatchResult = withIdentity({
    version: 1,
    authority: 'beads',
    operation,
    target: bound.target,
    invocationIdentity: sha256(canonicalJson({
      operation,
      target: bound.target,
      permitHash: bound.permit.permitHash,
      mutationIdentity: derived.mutationIdentity,
    })),
    result: capturedBytes(dispatched),
  }, 'dispatchResultIdentity');
  const evidence = withIdentity({
    version: 1,
    lane: 'tracked',
    operation,
    permitHash: bound.permit.permitHash,
    mutationIdentity: derived.mutationIdentity,
    target: bound.target,
    targetMappingHash: bound.targetMappingHash,
    lanePrestateHash: bound.lanePrestateHash,
    originalCaptures: trackedCaptureDescriptorSet(bound.observation),
    normalizedPrestate: bound.prestate,
    dispatchResultIdentity: dispatchResult.dispatchResultIdentity,
  }, 'operationEvidenceIdentity');
  const recoveryPayload = withIdentity({
    version: 1,
    operationEvidenceIdentity: evidence.operationEvidenceIdentity,
    original: trackedCaptureSet(bound.observation),
    dispatchResult,
    mutation: JSON.parse(canonicalJson(derived.mutation)),
  }, 'payloadIdentity');
  const stage = {
    operationEvidenceIdentity: evidence.operationEvidenceIdentity,
    payloadIdentity: recoveryPayload.payloadIdentity,
    mutationIdentity: derived.mutationIdentity,
    target: bound.target,
  };

  // Reacquire the poststate before any receipt exists; no redispatch. The
  // reacquisition and the proof can both refuse on the post-dispatch surfaces;
  // after `ports.dispatch` no refusal may claim an unchanged authority, so every
  // failure here becomes the pending phase with its stage-bound recovery
  // evidence and the Work host keeps its `work-prove-poststate` path.
  /** @type {ReturnType<typeof acquireTrackedSurfaces> | undefined} */
  let observed;
  let proven = false;
  try {
    observed = acquireTrackedSurfaces(ports, bound.target, bound.ownerSurface);
    context.observation = observed;
    proven = trackedPoststateProven({
      original: bound.normalized,
      observed,
      derived,
      dispatchResult,
      target: bound.target,
    });
  } catch {
    proven = false;
  }
  if (!proven) {
    return {
      ok: false,
      phase: 'tracked-operation-dispatched',
      reason: 'tracked-poststate-proof-pending',
      operationEvidence: evidence,
      recoveryPayload,
      recoveryIdentity: dispatchRecoveryIdentity(stage),
    };
  }
  const laneReceipt = trackedLaneReceipt({
    evidence,
    permitHash: bound.permit.permitHash,
    derived,
    target: bound.target,
    targetMappingHash: bound.targetMappingHash,
    lanePrestateHash: bound.lanePrestateHash,
    observed: /** @type {ReturnType<typeof acquireTrackedSurfaces>} */ (observed),
  });
  let ownerReceipt;
  try {
    ownerReceipt = commitTrackedOwnerLog({
      ownerSurface: bound.ownerSurface,
      ownerLog: derived.ownerLog,
      mutationIdentity: derived.mutationIdentity,
      ownerBytes: /** @type {Buffer} */ (bound.ownerCaptureBytes),
    });
  } catch {
    return {
      ok: false,
      phase: 'tracked-lane-committed',
      reason: 'owner-log-receipt-pending',
      laneReceipt,
      operationEvidence: evidence,
      recoveryPayload,
      recoveryIdentity: ownerRecoveryIdentity({ ...stage, laneReceiptHash: laneReceipt.receiptHash }),
    };
  }
  const receipt = withIdentity({
    version: 1,
    lane: 'tracked',
    mutationIdentity: derived.mutationIdentity,
    laneReceiptHash: laneReceipt.receiptHash,
    ownerLogReceiptHash: ownerReceipt.receiptHash,
  }, 'receiptHash');
  validateTrackedCompositeReceiptV1(receipt);
  return { ok: true, phase: 'committed', receipt };
}

/**
 * Re-validate the stage-bound recovery evidence a recovery request carries and
 * rebuild the exact original prestate it names.
 * @param {Record<string, unknown>} request @param {any} bound @param {'tracked-operation-dispatched'|'tracked-lane-committed'} stage
 */
function bindTrackedRecoveryEvidence(request, bound, stage) {
  const evidence = exactRecord(request.operationEvidence, [
    'version', 'lane', 'operation', 'permitHash', 'mutationIdentity', 'target', 'targetMappingHash',
    'lanePrestateHash', 'originalCaptures', 'normalizedPrestate', 'dispatchResultIdentity',
    'operationEvidenceIdentity',
  ]);
  const { operationEvidenceIdentity, ...evidenceBody } = evidence;
  if (operationEvidenceIdentity !== sha256(canonicalJson(evidenceBody))) refuse('invalid-canonical-value');
  const payload = exactRecord(request.recoveryPayload, [
    'version', 'operationEvidenceIdentity', 'original', 'dispatchResult', 'mutation', 'payloadIdentity',
  ]);
  const { payloadIdentity, ...payloadBody } = payload;
  if (payloadIdentity !== sha256(canonicalJson(payloadBody))) refuse('invalid-canonical-value');
  if (payload.operationEvidenceIdentity !== operationEvidenceIdentity) refuse('invalid-canonical-value');
  const dispatchResult = exactRecord(payload.dispatchResult, [
    'version', 'authority', 'operation', 'target', 'invocationIdentity', 'result', 'dispatchResultIdentity',
  ]);
  const { dispatchResultIdentity, ...dispatchBody } = dispatchResult;
  if (dispatchResultIdentity !== sha256(canonicalJson(dispatchBody))) refuse('invalid-canonical-value');
  if (evidence.dispatchResultIdentity !== dispatchResultIdentity) refuse('invalid-canonical-value');
  requireCapturedBytes(dispatchResult.result);

  const operation = /** @type {'work-project'|'work-transition'} */ (evidence.operation);
  if (operation !== 'work-project' && operation !== 'work-transition') refuse('invalid-canonical-value');
  const derived = requireTrackedMutation(payload.mutation, operation, bound.target);
  if (evidence.mutationIdentity !== derived.mutationIdentity) refuse('mutation-identity-mismatch');
  if (canonicalJson(requireTrackedTarget(evidence.target)) !== canonicalJson(bound.target)) refuse('target-mismatch');
  if (evidence.permitHash !== bound.permit.permitHash) refuse('permit-hash-mismatch');
  if (evidence.targetMappingHash !== bound.targetMappingHash) refuse('mapping-mismatch');
  if (bound.permit.mutationIdentity !== derived.mutationIdentity) refuse('mutation-identity-mismatch');

  // The exact originals the evidence names, revalidated and renormalized.
  const original = exactRecord(payload.original, ['list', 'detail', 'history']);
  const originalObservation = {
    list: requireCapturedBytes(original.list),
    detail: requireCapturedBytes(original.detail),
    history: requireCapturedBytes(original.history),
    owner: /** @type {Buffer|null} */ (null),
  };
  if (canonicalJson(trackedCaptureDescriptorSet(originalObservation))
    !== canonicalJson(evidence.originalCaptures)) refuse('expected-capture-mismatch');
  // The recovery mapping must describe the exact payload originals.
  for (const [field, kind] of [['listDescriptor', 'list'], ['detailDescriptor', 'detail'], ['historyDescriptor', 'history']]) {
    if (canonicalJson(bound.mapping[field]) !== canonicalJson(descriptorOf(originalObservation[kind]))) {
      refuse('mapping-mismatch');
    }
  }
  const normalizedOriginal = normalizeTrackedCaptures(originalObservation, bound.target);
  const rebuiltPrestate = {
    version: 1,
    lane: 'tracked',
    target: bound.target,
    taskKey: uniqueTrackedTaskKey(normalizedOriginal, bound.target),
    status: trackedIssueStatus(normalizedOriginal.detail),
    blocker: trackedIssueBlocker(normalizedOriginal.detail),
    listDescriptor: descriptorOf(originalObservation.list),
    detailDescriptor: descriptorOf(originalObservation.detail),
    historyDescriptor: descriptorOf(originalObservation.history),
    ownerDescriptor: bound.prestate.ownerDescriptor,
  };
  if (canonicalJson(rebuiltPrestate) !== canonicalJson(evidence.normalizedPrestate)) refuse('lane-prestate-mismatch');
  if (evidence.lanePrestateHash !== sha256(canonicalJson(rebuiltPrestate))) refuse('lane-prestate-mismatch');
  if (bound.permit.lanePrestateHash !== evidence.lanePrestateHash) refuse('lane-prestate-mismatch');

  const stageParts = {
    operationEvidenceIdentity: /** @type {string} */ (operationEvidenceIdentity),
    payloadIdentity: /** @type {string} */ (payloadIdentity),
    mutationIdentity: derived.mutationIdentity,
    target: bound.target,
  };
  return { evidence, payload, dispatchResult, derived, normalizedOriginal, stageParts, stage };
}

/** Prove one exact tracked poststate without dispatching. */
function commitTrackedPoststateProof(requestValue, ports, context) {
  const request = exactRecord(requestValue, [
    'version', 'operation', 'root', 'owner', 'target', 'state', 'permit', 'mapping',
    'operationEvidence', 'recoveryPayload', 'recoveryIdentity', 'observed',
  ]);
  if (request.version !== 1) refuse('invalid-request-shape');
  const observedShape = exactRecord(request.observed, ['list', 'detail', 'history']);
  /** @type {Record<string, Buffer>} */
  const claimed = {
    list: requireCapturedBytes(observedShape.list),
    detail: requireCapturedBytes(observedShape.detail),
    history: requireCapturedBytes(observedShape.history),
  };
  const bound = bindTrackedBoundary(request, 'work-prove-poststate', ports, context);
  const recovery = bindTrackedRecoveryEvidence(request, bound, 'tracked-operation-dispatched');
  if (request.recoveryIdentity !== dispatchRecoveryIdentity(recovery.stageParts)) {
    refuse('invalid-canonical-value');
  }
  // The caller's fresh evidence is immediately reacquired and compared exactly.
  for (const kind of TRACKED_CAPTURE_KINDS) {
    if (!bound.observation[kind].equals(claimed[kind])) refuse('expected-capture-mismatch');
  }
  const proven = trackedPoststateProven({
    original: recovery.normalizedOriginal,
    observed: bound.observation,
    derived: recovery.derived,
    dispatchResult: recovery.dispatchResult,
    target: bound.target,
  });
  if (!proven) indeterminate('tracked-lane-outcome-ambiguous');
  const laneReceipt = trackedLaneReceipt({
    evidence: recovery.evidence,
    permitHash: bound.permit.permitHash,
    derived: recovery.derived,
    target: bound.target,
    targetMappingHash: bound.targetMappingHash,
    lanePrestateHash: /** @type {string} */ (recovery.evidence.lanePrestateHash),
    observed: bound.observation,
  });
  return {
    ok: false,
    phase: 'tracked-lane-committed',
    reason: 'owner-log-receipt-pending',
    laneReceipt,
    operationEvidence: recovery.evidence,
    recoveryPayload: recovery.payload,
    recoveryIdentity: ownerRecoveryIdentity({ ...recovery.stageParts, laneReceiptHash: laneReceipt.receiptHash }),
  };
}

/** Reconcile the owner log for an already-committed tracked lane mutation. */
function commitTrackedOwnerReconciliation(requestValue, ports, context) {
  const request = exactRecord(requestValue, [
    'version', 'operation', 'root', 'owner', 'target', 'state', 'permit', 'mapping',
    'operationEvidence', 'recoveryPayload', 'laneReceipt', 'recoveryIdentity', 'observed',
  ]);
  if (request.version !== 1) refuse('invalid-request-shape');
  const observedShape = exactRecord(request.observed, ['list', 'detail', 'history', 'owner']);
  /** @type {Record<string, Buffer>} */
  const claimed = {
    list: requireCapturedBytes(observedShape.list),
    detail: requireCapturedBytes(observedShape.detail),
    history: requireCapturedBytes(observedShape.history),
    owner: requireCapturedBytes(observedShape.owner),
  };
  const bound = bindTrackedBoundary(request, 'work-reconcile-owner', ports, context);
  const recovery = bindTrackedRecoveryEvidence(request, bound, 'tracked-lane-committed');
  const laneReceipt = exactRecord(request.laneReceipt, [
    'version', 'lane', 'operationEvidenceIdentity', 'permitHash', 'mutationIdentity', 'target',
    'targetMappingHash', 'lanePrestateHash', 'poststateCaptures', 'lanePoststateHash',
    'eventLineRecordHashes', 'receiptHash',
  ]);
  const { receiptHash, ...laneReceiptBody } = laneReceipt;
  if (receiptHash !== sha256(canonicalJson(laneReceiptBody))) refuse('invalid-canonical-value');
  // The lane receipt is a caller-supplied record at the final trust gate, so
  // every one of its fields is re-derived from the values already bound here;
  // nothing is accepted on the strength of its own self-consistent hash.
  if (laneReceipt.version !== 1 || laneReceipt.lane !== 'tracked') refuse('invalid-canonical-value');
  if (laneReceipt.operationEvidenceIdentity !== recovery.evidence.operationEvidenceIdentity) {
    refuse('invalid-canonical-value');
  }
  if (laneReceipt.permitHash !== bound.permit.permitHash) refuse('permit-hash-mismatch');
  if (laneReceipt.mutationIdentity !== recovery.derived.mutationIdentity) refuse('mutation-identity-mismatch');
  if (canonicalJson(requireTrackedTarget(laneReceipt.target)) !== canonicalJson(bound.target)) {
    refuse('target-mismatch');
  }
  if (laneReceipt.targetMappingHash !== bound.targetMappingHash) refuse('mapping-mismatch');
  if (laneReceipt.lanePrestateHash !== recovery.evidence.lanePrestateHash) refuse('lane-prestate-mismatch');
  const poststateCaptures = exactRecord(laneReceipt.poststateCaptures, TRACKED_CAPTURE_KINDS);
  for (const kind of TRACKED_CAPTURE_KINDS) requireDescriptor(poststateCaptures[kind]);
  if (laneReceipt.lanePoststateHash !== sha256(canonicalJson(poststateCaptures))) {
    refuse('invalid-canonical-value');
  }
  const receiptRecordHashes = laneReceipt.eventLineRecordHashes;
  if (!Array.isArray(receiptRecordHashes)
    || Object.keys(receiptRecordHashes).length !== receiptRecordHashes.length
    || receiptRecordHashes.length > 4) refuse('invalid-canonical-value');
  for (const hash of /** @type {unknown[]} */ (receiptRecordHashes)) requireHash(hash);
  if (canonicalJson(receiptRecordHashes)
    !== canonicalJson(recovery.derived.eventLines.lines.map((line) => line.recordHash))) {
    refuse('event-line-mismatch');
  }
  if (request.recoveryIdentity !== ownerRecoveryIdentity({
    ...recovery.stageParts,
    laneReceiptHash: /** @type {string} */ (receiptHash),
  })) refuse('invalid-canonical-value');
  for (const kind of TRACKED_CAPTURE_KINDS) {
    if (!bound.observation[kind].equals(claimed[kind])) refuse('expected-capture-mismatch');
  }
  if (!(/** @type {Buffer} */ (bound.observation.owner)).equals(claimed.owner)) refuse('owner-prestate-mismatch');

  /** Independently repeat the lane proof before and after owner mutation. */
  const prove = () => trackedPoststateProven({
    original: recovery.normalizedOriginal,
    observed: acquireTrackedSurfaces(ports, bound.target, bound.ownerSurface),
    derived: recovery.derived,
    dispatchResult: recovery.dispatchResult,
    target: bound.target,
  });
  if (!prove()) indeterminate('owner-log-outcome-ambiguous');
  const ownerReceipt = commitTrackedOwnerLog({
    ownerSurface: bound.ownerSurface,
    ownerLog: recovery.derived.ownerLog,
    mutationIdentity: recovery.derived.mutationIdentity,
    ownerBytes: /** @type {Buffer} */ (bound.ownerCaptureBytes),
  });
  if (!prove()) indeterminate('owner-log-outcome-ambiguous');
  const receipt = withIdentity({
    version: 1,
    lane: 'tracked',
    mutationIdentity: recovery.derived.mutationIdentity,
    laneReceiptHash: receiptHash,
    ownerLogReceiptHash: ownerReceipt.receiptHash,
  }, 'receiptHash');
  validateTrackedCompositeReceiptV1(receipt);
  return { ok: true, phase: 'committed', ownerReceipt, receipt };
}

/**
 * The closed tracked lane trust boundary. Returns exactly one closed result for
 * the requested operation; no validator throw escapes, a dispatching refusal
 * leaves every authoritative surface unchanged, and neither recovery operation
 * can return `refused` because prior authoritative mutation is possible.
 * @param {unknown} requestValue
 * @param {{capture:Function,dispatch?:Function}} ports
 */
export function applyTrackedWorkRequest(requestValue, ports) {
  /** @type {unknown} */
  let operation;
  let recovery = false;
  let ambiguous = 'tracked-lane-outcome-ambiguous';
  /** @type {{observation: any}} */
  const context = { observation: null };
  const observed = () => {
    try {
      return context.observation ? trackedObservationHash(context.observation) : UNOBSERVED_TRACKED_HASH;
    } catch {
      return UNOBSERVED_TRACKED_HASH;
    }
  };
  try {
    // Read inside the `try`: a throwing accessor on the request must become a
    // closed refusal, never an open throw at the boundary.
    operation = isPlainObject(requestValue) ? requestValue.operation : undefined;
    recovery = operation === 'work-prove-poststate' || operation === 'work-reconcile-owner';
    ambiguous = operation === 'work-reconcile-owner'
      ? 'owner-log-outcome-ambiguous'
      : 'tracked-lane-outcome-ambiguous';
    if (operation === 'work-project' || operation === 'work-transition') {
      return commitTrackedDispatch(requestValue, operation, ports, context);
    }
    if (operation === 'work-prove-poststate') return commitTrackedPoststateProof(requestValue, ports, context);
    if (operation === 'work-reconcile-owner') return commitTrackedOwnerReconciliation(requestValue, ports, context);
    return refuse('invalid-request-shape');
  } catch (error) {
    if (recovery) {
      return { ok: false, phase: 'indeterminate', reason: ambiguous, observedEvidenceHash: observed() };
    }
    if (error instanceof LaneIndeterminateError) {
      return { ok: false, phase: 'indeterminate', reason: error.reason, observedEvidenceHash: observed() };
    }
    const reason = error instanceof LaneRefusalError && LANE_REFUSAL_REASONS.has(error.reason)
      ? error.reason
      : 'invalid-request-shape';
    return { ok: false, phase: 'refused', reason, unchangedPrestateHash: observed() };
  }
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

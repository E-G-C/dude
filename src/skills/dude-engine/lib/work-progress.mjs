// @ts-check
/** Pure, read-only work stages and progress from collected lifecycle evidence. */

import { CANONICAL_IDEA_KEYS, readWorkClassification } from './feature.mjs';
import { parseFrontmatterScalars } from './feature-identity.mjs';
import { parseTasks } from './tasks.mjs';

const TRACKED_REASON = 'Tracked work is authoritative and this view does not read it.';
const REQUESTS_REASON = 'This view cannot read current requests.';
const LIFECYCLE_REASON = 'Lifecycle details are unavailable because idea metadata is ambiguous.';
const TASKS_REASON = 'Task state is unavailable because the tasks file is incomplete or ambiguous.';
const WORDS = Object.freeze({
  fix: 'Fix',
  create: 'New',
  maintain: 'Maintenance',
  explore: 'Exploration',
  code: 'Code',
  design: 'Design',
  writing: 'Writing',
  video: 'Video',
});

/**
 * The subset of a backlog model item that carries progress evidence.
 * @typedef {{
 *   ideaPath: string, specPath: string | null, ownerSpecPath: string | null,
 *   number: string | null, slug: string, status: string,
 *   frontmatterAvailable: boolean, lifecycleAvailable: boolean,
 *   resolvedCandidate: boolean, resolved: boolean, tasksAvailable: boolean,
 *   taskCounts: { total: number, active: number, blocked: number, done: number },
 *   ownBlocked: boolean, unavailableDetail: string | null,
 * }} WorkItem
 */

/** @param {WorkItem} item */
function lifecycleUnavailable(item) {
  return !item.frontmatterAvailable || !item.lifecycleAvailable
    || ((item.resolvedCandidate || item.status === 'resolved') && !item.resolved);
}

/**
 * Apply the shared stage rule in authority order; dependencies never change it.
 * @param {WorkItem} item
 * @param {{ tracked?: boolean }} [options]
 * @returns {string | null}
 */
export function workStage(item, { tracked = false } = {}) {
  if (lifecycleUnavailable(item)) return null;
  if (item.resolved) return 'Closed';
  if (item.status === 'draft') return 'Captured';
  if (tracked) return null;
  if (item.unavailableDetail || !item.ownerSpecPath || !item.tasksAvailable) return null;
  if (item.ownBlocked || item.taskCounts.blocked > 0) return 'Blocked';
  if (item.taskCounts.total > 0 && item.taskCounts.done === item.taskCounts.total) return 'Completed';
  if (item.taskCounts.active > 0 || item.taskCounts.done > 0) return 'In progress';
  return 'Defined';
}

/** @param {WorkItem} item @param {boolean} tracked */
function stageReason(item, tracked) {
  if (lifecycleUnavailable(item)) return item.unavailableDetail ?? LIFECYCLE_REASON;
  if (tracked) return TRACKED_REASON;
  return item.unavailableDetail ?? 'The linked feature definition or task state is unavailable.';
}

/** @param {string | Buffer | null} ideaBytes */
function classificationWords(ideaBytes) {
  if (ideaBytes === null) return [];
  try {
    const { scalars } = parseFrontmatterScalars(ideaBytes, { canonicalKeys: CANONICAL_IDEA_KEYS });
    const { workIntent, workDomain } = readWorkClassification(scalars);
    return [workIntent, workDomain].filter((token) => token !== null).map((token) => WORDS[token]);
  } catch {
    // Unreadable ledger metadata supplies no advisory classification.
    return [];
  }
}

/** @param {ReturnType<typeof parseTasks>} parsed */
function currentPhases(parsed) {
  const currentLines = new Set(parsed.tasks
    .filter((task) => task.state === 'in-progress' || task.state === 'blocked')
    .map((task) => task.headerLine));
  const items = new Set();
  let heading = null;
  const end = parsed.history?.startLine ?? parsed.lines.length;
  for (let index = 0; index < end; index += 1) {
    if (parsed.board && index >= parsed.board.startLine && index <= parsed.board.endLine) continue;
    const match = /^#{2,3}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(parsed.lines[index]);
    if (match) heading = match[1];
    if (heading !== null && currentLines.has(index)) items.add(heading);
  }
  return [...items];
}

/** @param {WorkItem} item @param {string | Buffer | null} specBytes */
function designStatus(item, specBytes) {
  if (lifecycleUnavailable(item)) {
    return { status: 'unavailable', reason: item.unavailableDetail ?? LIFECYCLE_REASON, source: null };
  }
  if (item.status === 'draft' || item.resolved) return null;
  if (!item.ownerSpecPath || specBytes === null) {
    return {
      status: 'unavailable',
      reason: item.unavailableDetail ?? 'The linked feature specification is unavailable.',
      source: null,
    };
  }
  const text = String(specBytes);
  if (!/^---(?:\r\n|\n|\r)/.test(text)) return null;
  try {
    const { scalars } = parseFrontmatterScalars(text);
    if (scalars.get('work_type')?.value !== 'design') return null;
    const recorded = scalars.get('design_status')?.value;
    const status = ['exploring', 'proposed', 'approved'].includes(recorded ?? '')
      ? recorded
      : 'unrecognized';
    return { status, reason: null, source: item.specPath };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `Design metadata is unavailable (${error instanceof Error ? error.message : String(error)}).`,
      source: null,
    };
  }
}

/**
 * Assemble independent report parts without reading files or tracked state.
 * @param {{
 *   item: WorkItem, ideaBytes: string | Buffer | null,
 *   specBytes: string | Buffer | null, tasksBytes: string | Buffer | null,
 *   tracked?: boolean,
 * }} input
 */
export function workProgress({ item, ideaBytes, specBytes, tasksBytes, tracked = false }) {
  let evidence = item;
  let parsed = null;
  const taskBased = !lifecycleUnavailable(item) && !item.resolved && item.status !== 'draft';
  if (taskBased && !tracked && !item.unavailableDetail) {
    let reason = null;
    if (specBytes === null) reason = 'The linked feature specification is unavailable.';
    else if (tasksBytes === null) reason = 'The task file is unavailable.';
    else {
      parsed = parseTasks(String(tasksBytes));
      if (parsed.boardIssue || parsed.warnings.some((warning) => (
        warning.startsWith('duplicate task id ') || warning.startsWith('malformed task line ')
      ))) reason = TASKS_REASON;
    }
    if (reason) evidence = { ...item, tasksAvailable: false, unavailableDetail: reason };
  }

  const value = workStage(evidence, { tracked });
  const reason = value === null ? stageReason(evidence, tracked) : null;
  const tasksPath = item.specPath ? `${item.specPath.slice(0, -'spec.md'.length)}tasks.md` : null;
  let phases;
  if (lifecycleUnavailable(evidence)) {
    phases = { state: 'unavailable', reason, source: null, items: [] };
  } else if (item.resolved || item.status === 'draft') {
    phases = { state: 'none', reason: null, source: null, items: [] };
  } else if (tracked) {
    phases = { state: 'not-exposed', reason: TRACKED_REASON, source: null, items: [] };
  } else if (value === null) {
    phases = { state: 'unavailable', reason, source: null, items: [] };
  } else {
    const items = currentPhases(parsed ?? parseTasks(String(tasksBytes)));
    phases = { state: items.length ? 'current' : 'none', reason: null, source: tasksPath, items };
  }

  // Task availability does not suppress readable specification evidence.
  const design = designStatus(evidence, specBytes);
  const checkpoints = design && (design.status === 'proposed' || design.status === 'approved')
    ? [{ kind: `design-${design.status}`, source: design.source }]
    : [];
  const gates = design && design.status !== 'approved' && design.status !== 'unavailable'
    ? [{ kind: 'design-approval', source: design.source }]
    : [];
  const unknown = [];
  if (phases.state === 'none') unknown.push('phases');
  if (design === null) unknown.push('design');
  if ((!design || design.status !== 'unavailable') && gates.length === 0) unknown.push('gates');

  return {
    subject: { ideaPath: item.ideaPath, specPath: item.specPath, number: item.number, slug: item.slug },
    words: classificationWords(ideaBytes),
    stage: {
      value,
      reason,
      source: value === null ? null : value === 'Captured' || value === 'Closed' ? item.ideaPath : tasksPath,
    },
    phases,
    design,
    checkpoints,
    gates,
    requests: { state: 'unavailable', reason: REQUESTS_REASON, source: null },
    unknown,
  };
}

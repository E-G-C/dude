// Independent oracle for the 067 pre-approval verification. It re-derives expectations from the spec's stage rule
// (FR-020 / plan "Shared stage rule"), the spec vocabulary (FR-005, FR-006), and the fixture + snapshot DATA.
// It does not import or call the mock's own functions.
import fs from 'node:fs';
import path from 'node:path';

export const INTENT_WORD = { create: 'Create', fix: 'Fix', maintain: 'Maintain', explore: 'Explore' };
export const DOMAIN_WORD = { code: 'Code', design: 'Design', writing: 'Writing', video: 'Video', other: 'Other' };
export const STAGES = ['Captured', 'Defined', 'In progress', 'Blocked', 'Completed', 'Closed'];

export function loadData(packageDir) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(packageDir, 'design', 'source', relative), 'utf8'));
  return { fixtures: read('fixtures.json'), snapshot: read('repository-snapshot.json') };
}

const numberOf = ideaPath => ideaPath.match(/^\.dude\/ideas\/(\d{3})-/)?.[1] ?? '';

/** Plan "Shared stage rule", evaluated in the plan's order, on raw evidence. */
export function stageFromEvidence({ readable = true, status, counts, ownBlocked = false }) {
  if (!readable) return null;
  if (status === 'resolved') return 'Closed';
  if (status === 'draft') return 'Captured';
  if (!counts) return null;
  if (counts.blocked > 0 || ownBlocked) return 'Blocked';
  if (counts.total > 0 && counts.done === counts.total) return 'Completed';
  if (counts.inProgress > 0 || counts.done > 0) return 'In progress';
  return 'Defined';
}

function countsOf(tasks) {
  if (!tasks) return null;
  const counts = { total: tasks.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const task of tasks) {
    if (task.state === 'todo') counts.open += 1;
    else if (task.state === 'in-progress') counts.inProgress += 1;
    else if (task.state === 'blocked') counts.blocked += 1;
    else if (task.state === 'done') counts.done += 1;
  }
  return counts;
}

export function classificationExpectation(intent, domain) {
  const unavailable = intent.state === 'unavailable' || domain.state === 'unavailable';
  const parts = [];
  if (intent.state === 'set') parts.push(INTENT_WORD[intent.value]);
  if (domain.state === 'set') parts.push(DOMAIN_WORD[domain.value]);
  return {
    unavailable, parts, line: unavailable ? null : parts.length ? parts.join(' · ') : null,
    intentWord: intent.state === 'set' ? INTENT_WORD[intent.value] : intent.state, domainWord: domain.state === 'set' ? DOMAIN_WORD[domain.value] : domain.state,
    unrecognized: [intent.state === 'unrecognized' && 'intent', domain.state === 'unrecognized' && 'domain'].filter(Boolean),
  };
}

export function phaseNames(tasks) {
  const heading = new Map();
  for (const task of tasks ?? []) {
    if (!task.phase) continue;
    const entry = heading.get(task.phase) ?? { name: task.phase.replace(/^Phase\s+\d+\s*:\s*/i, ''), counts: [] };
    entry.counts.push(task);
    heading.set(task.phase, entry);
  }
  // current = holds work in progress or blocked (spec Key Entities: Phase)
  return [...heading.values()].filter(entry => entry.counts.some(task => task.state === 'in-progress' || task.state === 'blocked')).map(entry => entry.name);
}

export function fixtureExpectations(fixtures) {
  return fixtures.fixtureWorkspace.records.map(record => {
    const counts = countsOf(record.tasks);
    const readable = record.readable !== false;
    const ownBlocked = Boolean(record.tasks?.some(task => task.state === 'blocked' || (task.blockedBy && task.state !== 'done')));
    const stage = stageFromEvidence({ readable, status: record.status, counts, ownBlocked });
    const note = !stage ? null : record.group === 'next' ? 'Next by recorded dependencies' : record.group === 'prioritized-later' ? 'Recorded for later'
      : record.group === 'blocked' && stage !== 'Blocked' ? 'Waiting on a declared dependency' : null;
    return {
      id: record.id, ideaPath: record.ideaPath, specPath: record.specPath, number: numberOf(record.ideaPath), readable, status: record.status,
      title: record.title ?? 'Title unavailable', slug: record.slug, stage, stageText: stage ?? 'Stage unavailable', note, counts,
      progress: counts ? `${counts.done} of ${counts.total} tasks` : 'Progress not established',
      cls: classificationExpectation(record.workIntent, record.workDomain), intentState: record.workIntent.state, domainState: record.workDomain.state,
      lane: record.lane, design: record.design, phases: phaseNames(record.tasks), tracked: record.lane === 'tracked',
      blockers: (record.tasks ?? []).filter(task => task.state === 'blocked' || (task.blockedBy && task.state !== 'done')),
      unanswered: record.unansweredQuestions, tasks: record.tasks, intentText: record.intentText,
    };
  });
}

export function snapshotExpectations(snapshot) {
  return snapshot.records.map(record => {
    const readable = record.availability.state === 'current';
    const counts = record.taskCounts;
    const stage = stageFromEvidence({ readable, status: record.status, counts });
    const note = !stage ? null : record.group === 'next' ? 'Next by recorded dependencies' : record.group === 'prioritized-later' ? 'Recorded for later'
      : record.group === 'blocked' && stage !== 'Blocked' ? 'Waiting on a declared dependency' : null;
    return { ideaPath: record.ideaPath, number: numberOf(record.ideaPath), title: record.title ?? 'Title unavailable', stage, stageText: stage ?? 'Stage unavailable', note,
      progress: counts ? `${counts.done} of ${counts.total} tasks` : 'Progress not established', design: record.design, status: record.status, lane: record.lane,
      unanswered: snapshot.details[record.ideaPath]?.unansweredQuestions ?? null, counts };
  });
}

/** Search rule of today's Canvas (product app.jsx WorkResults): number, title, slug, ideaPath, specPath; case-insensitive substring. */
export function searchMatches(expectations, query) {
  const needle = query.trim().toLocaleLowerCase();
  return expectations.filter(row => !needle || [row.number, row.title === 'Title unavailable' ? null : row.title, row.slug, row.ideaPath, row.specPath]
    .some(value => value?.toLocaleLowerCase().includes(needle))).map(row => row.ideaPath);
}

export const sentenceCount = text => (text.match(/[.!?](\s|$)/g) ?? []).length;

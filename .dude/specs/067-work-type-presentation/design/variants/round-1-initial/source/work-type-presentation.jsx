/**
 * 067 Work Type Presentation: canonical design mock, round 1 (exploring, NOT approved).
 * Source of ../work-type-presentation.js. Primary artifact: ../work-type-presentation.html.
 *
 * Mock only. Nothing here fetches, joins a provider, sends a capture or response, writes
 * a ledger, or stores anything. Every transition is local and labeled in the mock strip.
 * The product composition mirrors src/extensions/dude/frontend/app.jsx and needs-you.jsx
 * (hashes in the HTML commentary). styles.js and theme.js beside this file are verbatim
 * copies of the product files, so Fluent tokens, geometry, and the 085 app-following
 * adapter are today's, not a new system. useMockStyles holds the few proposed additions.
 */
import React, { StrictMode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AriaLiveAnnouncer, Badge, Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader,
  DataGridHeaderCell, DataGridRow, Dropdown, Field, FluentProvider, Input, List, ListItem, makeStyles,
  MessageBar, MessageBarBody, MessageBarTitle, Option, ProgressBar, Tab, TabList, TableCellLayout, Text, Textarea,
  Toolbar, ToolbarButton, tokens,
} from '@fluentui/react-components';
import {
  AddRegular, ArrowClockwiseRegular, ArrowLeftRegular, CheckmarkRegular, CircleRegular, CommentRegular,
  DismissRegular, GridRegular, NavigationRegular, RecordRegular, SearchRegular, SettingsRegular, WarningRegular,
} from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { useCanvasTheme } from './theme.js';
import FIXTURES from './fixtures.json';
import SNAPSHOT from './repository-snapshot.json';

/* ------------------------------------------------------------------ Vocabulary (FR-005 to FR-007) */

// Stable tokens (plan section 1) kept apart from their on-screen words.
const INTENTS = [['create', 'Create'], ['fix', 'Fix'], ['maintain', 'Maintain'], ['explore', 'Explore']];
const DOMAINS = [['code', 'Code'], ['design', 'Design'], ['writing', 'Writing'], ['video', 'Video'], ['other', 'Other']];
const INTENT_LABEL = Object.fromEntries(INTENTS);
const DOMAIN_LABEL = Object.fromEntries(DOMAINS);
const NOT_SET = { state: 'not-set', value: null };

const TABS = [['overview', 'Overview'], ['context', 'Now'], ['needs', 'Needs you'], ['new', 'New work item'], ['settings', 'Settings']];
const TAB_ICONS = { overview: GridRegular, context: RecordRegular, needs: CommentRegular, new: AddRegular, settings: SettingsRegular };
const SCOPES = [['open', 'Open'], ['closed', 'Closed'], ['all', 'All']];
const DEFAULT_FINDER = { query: '', scope: 'open' };
const TASK_STATES = { todo: 'Pending', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' };
const TASK_FILTERS = [['all', 'All', 'total'], ['todo', 'Pending', 'open'],
  ['in-progress', 'In progress', 'inProgress'], ['blocked', 'Blocked', 'blocked'], ['done', 'Done', 'done']];
const CLASSES = {
  onboarding: 'Getting started', fact: 'Clarification', preview: 'Design review',
  manual_observation: 'Host observation', permission: 'Permission', scope_choice: 'Scope choice',
};
const BLOCKER_CLASSES = {
  'spec-gap': 'Spec gap', 'plan-gap': 'Plan gap', 'contract-mismatch': 'Contract mismatch',
  'test-failure': 'Test failure', 'external-dependency': 'External dependency',
};
const DESIGN_STATUS = { exploring: 'Exploring', proposed: 'Proposed', approved: 'Approved', unrecognized: 'Unrecognized' };
const TRACKED_COMMAND = 'bd list --all --limit 0 --json';
const GLYPH = { todo: ' ', 'in-progress': '~', blocked: '!', done: 'x' };
// 067 replaces the idea/feature orientation strings (plan section 3). Others stay as today.
const NEUTRAL_REASONS = {
  'This feature is still an idea.': 'This work item is captured but not defined yet.',
  'This idea is resolved.': 'This work item is closed.',
  'This idea has no task definitions.': 'No tasks are recorded for this work item.',
};
const neutral = text => NEUTRAL_REASONS[text] ?? text;

/* ------------------------------------------------------------------ Records */

const numberOf = path => path?.match(/^\.dude\/ideas\/(\d{3})-/)?.[1] || '';
const tasksPathOf = specPath => (specPath ? specPath.replace(/spec\.md$/, 'tasks.md') : null);
const baseName = path => path?.split('/').at(-1) || '';

function countTasks(tasks) {
  const counts = { total: tasks.length, open: 0, inProgress: 0, blocked: 0, done: 0 };
  for (const task of tasks) {
    if (task.state === 'todo') counts.open += 1;
    else if (task.state === 'in-progress') counts.inProgress += 1;
    else if (task.state === 'blocked') counts.blocked += 1;
    else if (task.state === 'done') counts.done += 1;
  }
  return counts;
}

// Mirrors projection.mjs taskProjection: recorded headings in order, "Phase N:" removed
// from the name, and a phase is current while it holds work in progress or blocked.
function phasesOf(tasks) {
  const groups = new Map();
  for (const task of tasks || []) {
    if (!task.phase?.heading) continue;
    const heading = task.phase.heading;
    const group = groups.get(heading) ?? { heading, name: heading.replace(/^Phase\s+\d+\s*:\s*/i, ''), tasks: [] };
    group.tasks.push(task);
    groups.set(heading, group);
  }
  return [...groups.values()].map(group => {
    const counts = countTasks(group.tasks);
    const state = counts.done === counts.total ? 'done' : counts.inProgress || counts.blocked ? 'current' : 'upcoming';
    return { heading: group.heading, name: group.name, counts, state };
  });
}

function blockerParts(text) {
  const match = /^([a-z]+(?:-[a-z]+)*):\s*(.+)$/s.exec(text || '');
  return match && BLOCKER_CLASSES[match[1]] ? { classification: match[1], reason: match[2] } : { classification: null, reason: text };
}

function fixtureRecord(fixture, readAt) {
  const tracked = fixture.lane === 'tracked';
  const tasksPath = tasksPathOf(fixture.specPath);
  const raw = fixture.tasks;
  const tasks = raw?.map(task => {
    const blockedBy = task.blockedBy ?? null;
    const depsDone = (task.deps || []).every(key => raw.find(other => other.taskKey === key)?.state === 'done');
    return {
      taskKey: task.taskKey, issueId: task.issueId ?? null, title: task.title, state: task.state,
      phase: task.phase ? { heading: task.phase } : null, deps: task.deps, blockedBy,
      readiness: task.state !== 'todo' ? { state: 'not-applicable', basis: null }
        : tracked ? { state: 'not-exposed', basis: null }
          : { state: depsDone ? 'ready' : 'waiting', basis: 'recorded-deps' },
      source: tracked ? { kind: 'tracked', command: TRACKED_COMMAND } : { kind: 'file', path: tasksPath },
      instruction: tracked
        ? { coverage: 'imported-description', text: `Task: ${task.taskKey}\n${task.title}.` }
        : { coverage: 'full-unit', text: `- [${GLYPH[task.state]}] ${task.taskKey} ${task.title}\n`
          + (task.deps ? `  deps: ${task.deps.join(', ')}\n` : '') + (blockedBy ? `  blocked-by: ${blockedBy}\n` : '') },
    };
  }) ?? null;
  const counts = tasks ? countTasks(tasks) : null;
  const active = tasks?.find(task => task.state === 'in-progress')
    ?? (fixture.lane === 'lightweight' ? tasks?.find(task => task.state === 'todo' && task.readiness.state === 'ready') : null);
  const nextReason = fixture.readable === false ? null : fixture.status === 'draft' ? 'This feature is still an idea.'
    : fixture.status === 'resolved' ? 'This idea is resolved.'
      : fixture.lane === 'definition' ? 'No canonical task execution evidence exists yet.'
        : counts && counts.total && counts.done === counts.total ? 'All canonical tasks are complete.' : active ? null : 'No canonical task is ready.';
  const sources = [{ label: 'Idea', path: fixture.ideaPath, contentIdentity: `fixture:${fixture.id}:idea` }];
  if (fixture.specPath) sources.push({ label: 'Specification', path: fixture.specPath, contentIdentity: `fixture:${fixture.id}:spec` });
  if (tasks) sources.push(tracked ? { label: 'Tracked board', path: TRACKED_COMMAND, contentIdentity: `fixture:${fixture.id}:board` }
    : { label: 'Tasks', path: tasksPath, contentIdentity: `fixture:${fixture.id}:tasks` });
  return {
    origin: 'fixture', id: fixture.id, trace: fixture.trace, ideaPath: fixture.ideaPath, specPath: fixture.specPath,
    number: numberOf(fixture.ideaPath), title: fixture.title, slug: fixture.slug, status: fixture.status,
    readable: fixture.readable !== false, workIntent: fixture.workIntent, workDomain: fixture.workDomain,
    lane: fixture.lane, group: fixture.group, taskCounts: counts, design: fixture.design, dependsOn: fixture.dependsOn ?? null,
    ownBlocked: Boolean(tasks?.some(task => task.state === 'blocked' || (task.blockedBy && task.state !== 'done'))),
    detail: {
      partial: false, readAt, tasks, phases: phasesOf(tasks),
      taskReason: tasks ? null : neutral('This idea has no task definitions.'),
      next: active ? { description: active.title, taskKey: active.taskKey } : null, nextReason: neutral(nextReason),
      blockers: (tasks || []).filter(task => task.state === 'blocked' || (task.blockedBy && task.state !== 'done'))
        .map(task => ({ ...blockerParts(task.blockedBy), source: { path: tasksPath, taskKey: task.taskKey } })),
      activity: fixture.activity, intentText: fixture.intentText, unansweredQuestions: fixture.unansweredQuestions, sources,
    },
  };
}

function repositoryRecord(record) {
  const captured = SNAPSHOT.details[record.ideaPath];
  const tasks = captured?.taskDetails?.items ?? null;
  const counts = record.taskCounts;
  const stageBefore = captured?.stageBefore ?? null;
  const ruleReason = record.status === 'draft' ? 'This feature is still an idea.' : record.status === 'resolved' ? 'This idea is resolved.'
    : counts && counts.total && counts.done === counts.total ? 'All canonical tasks are complete.'
      : 'No canonical task execution evidence exists yet.';
  return {
    origin: 'repository', id: null, trace: ['source/repository-snapshot.json'], ideaPath: record.ideaPath, specPath: record.specPath,
    number: numberOf(record.ideaPath), title: record.title, slug: record.slug, status: record.status,
    readable: record.availability.state === 'current', workIntent: NOT_SET, workDomain: NOT_SET,
    lane: record.lane, group: record.group, taskCounts: counts, design: record.design, dependsOn: null, ownBlocked: false,
    kindBefore: record.kindBefore, stageBefore,
    detail: captured ? {
      partial: false, readAt: captured.readAt, tasks, phases: phasesOf(tasks),
      taskReason: tasks ? null : neutral(captured.taskDetails?.coverage?.reason),
      next: captured.next, nextReason: neutral(captured.nextReasonBefore), blockers: captured.blockers || [],
      activity: captured.activity?.recent ?? [], intentText: captured.intent?.text ?? null, intentTruncated: captured.intent?.truncated,
      unansweredQuestions: captured.unansweredQuestions, sources: captured.sources,
    } : {
      partial: true, readAt: SNAPSHOT.workspace.readAt, tasks: null, phases: [], taskReason: null, next: null,
      nextReason: neutral(ruleReason), blockers: [], activity: null, intentText: null, unansweredQuestions: null,
      sources: [{ label: 'Idea', path: record.ideaPath }, ...(record.specPath
        ? [{ label: 'Specification', path: record.specPath }, { label: 'Tasks', path: tasksPathOf(record.specPath) }] : [])],
    },
  };
}

const FIXTURE_RECORDS = FIXTURES.fixtureWorkspace.records.map(record => fixtureRecord(record, FIXTURES.fixtureWorkspace.readAt));
const REPOSITORY_RECORDS = SNAPSHOT.records.map(repositoryRecord);

/* ------------------------------------------------------------------ Shared stage rule (FR-019 to FR-024) */

// One rule for the list and the details, evaluated in the plan's order.
function workStage(record) {
  if (!record.readable) return null;
  if (record.status === 'resolved') return 'Closed';
  if (record.status === 'draft') return 'Captured';
  const counts = record.taskCounts;
  if (!counts) return null;
  if (counts.blocked > 0 || record.ownBlocked) return 'Blocked';
  if (counts.total > 0 && counts.done === counts.total) return 'Completed';
  if (counts.inProgress > 0 || counts.done > 0) return 'In progress';
  return 'Defined';
}
// Existing dependency and order notes stay beside the stage and never change it.
function stageNote(record, stage) {
  if (record.group === 'next') return 'Next by recorded dependencies';
  if (record.group === 'prioritized-later') return 'Recorded for later';
  if (record.group === 'blocked' && stage !== 'Blocked') return 'Waiting on a declared dependency';
  return null;
}

/* ------------------------------------------------------------------ Classification text */

function fieldWord(field, labels) {
  if (!field || field.state === 'unavailable') return 'Unavailable';
  if (field.state === 'not-set') return 'Not set';
  if (field.state === 'unrecognized') return 'Unrecognized';
  return labels[field.value];
}
// The list's secondary line: recorded or unrecognized values only, never a Not set placeholder.
function classificationLine(record) {
  const { workIntent: intent, workDomain: domain } = record;
  if (intent.state === 'unavailable' || domain.state === 'unavailable') return 'Classification unavailable';
  const parts = [];
  if (intent.state === 'set') parts.push(INTENT_LABEL[intent.value]);
  else if (intent.state === 'unrecognized') parts.push('Unrecognized intent');
  if (domain.state === 'set') parts.push(DOMAIN_LABEL[domain.value]);
  else if (domain.state === 'unrecognized') parts.push('Unrecognized domain');
  return parts.length ? parts.join(' · ') : null;
}
// Accessible names always say all three, including Not set.
function classificationSpeech(record) {
  const { workIntent: intent, workDomain: domain } = record;
  if (intent.state === 'unavailable' || domain.state === 'unavailable') return 'Intent and domain unavailable';
  if (intent.state === 'not-set' && domain.state === 'not-set') return 'Intent and domain not set';
  const word = (field, labels, name) => (field.state === 'set' ? `${name} ${labels[field.value]}`
    : field.state === 'unrecognized' ? `${name} unrecognized` : `${name} not set`);
  return `${word(intent, INTENT_LABEL, 'Intent')}, ${word(domain, DOMAIN_LABEL, 'domain')}`;
}

/* ------------------------------------------------------------------ Request feed (fixture) */

const REQUESTS = new Map(FIXTURES.requests.map(record => [record.id, record]));
function buildFeed(key, data) {
  const preset = FIXTURES.feeds[key] ?? FIXTURES.feeds.idle;
  const ids = data === 'fixtures' ? preset.fixtureRequests : data === 'repository' ? preset.repositoryRequests : [];
  return { key, label: preset.label, coverage: preset.coverage, idle: preset.idle && data !== 'none',
    requests: ids.map(id => REQUESTS.get(id)) };
}
function matchesRequestScope(record, scope) {
  return Boolean(record && scope && scope.ideaPath === record.ideaPath
    && (scope.kind === 'idea' || (scope.kind === 'feature' && scope.specPath === record.specPath)));
}
// The existing Respond rule: pending, exact scope, and a feed that is not unavailable.
function currentRequests(record, feed) {
  if (!record?.readable || feed.coverage.state === 'unavailable') return [];
  return feed.requests.filter(item => item.phase === 'pending' && matchesRequestScope(record, item.request.scope));
}

/* ------------------------------------------------------------------ Progress report (FR-025 to FR-031) */

// One pure assembler, shaped like the plan's `progress` contract. Details format it as
// received and derive nothing from counts. `design` carries the recorded status the spec
// asks details to show; the plan's contract lists only its checkpoints (see commentary).
function progressReport(record, feed) {
  const stage = workStage(record);
  const ledger = { label: 'Idea ledger', path: record.ideaPath };
  const spec = record.specPath ? { label: 'Specification', path: record.specPath } : null;
  const work = record.lane === 'tracked' ? { label: 'Tracked board', path: TRACKED_COMMAND }
    : record.specPath ? { label: 'Tasks', path: tasksPathOf(record.specPath) } : ledger;
  const report = {
    subject: { ideaPath: record.ideaPath, specPath: record.specPath },
    stage: { value: stage, source: !record.readable ? null : ['draft', 'resolved'].includes(record.status) ? ledger : work },
  };
  if (!record.readable) report.phases = { state: 'unavailable', items: [] };
  else if (record.lane === 'tracked') report.phases = { state: 'not-exposed', items: [], source: work };
  else {
    const current = record.detail.phases.filter(phase => phase.state === 'current');
    report.phases = current.length ? { state: 'current', items: current.map(phase => ({ name: phase.name, source: work })) }
      : { state: 'none', items: [] };
  }
  const design = record.readable ? record.design : null;
  report.design = design ? { status: DESIGN_STATUS[design.status] ? design.status : 'unrecognized', source: spec } : null;
  report.checkpoints = design && ['proposed', 'approved'].includes(design.status) ? [{ kind: `design-${design.status}`, source: spec }] : [];
  report.gates = design && design.status !== 'approved' ? [{ kind: 'design-approval', source: spec }] : [];
  report.requests = feed.coverage.state === 'unavailable'
    ? { state: 'unavailable', reason: feed.coverage.reason, items: [] }
    : { state: feed.coverage.state, reason: feed.coverage.reason, items: currentRequests(record, feed).map(item => ({
      requestHandle: item.requestHandle, owner: item.request.owner, class: item.request.class })) };
  report.unknown = !record.readable ? [] : [
    ...(report.phases.state === 'none' ? ['phases'] : []), ...(report.design ? [] : ['design']),
    ...(report.gates.length ? [] : ['gates']),
  ];
  return report;
}

function unknownSentence(report) {
  if (report.stage.value === 'Captured') return 'No definition, phase, or required gate is recorded yet.';
  const words = { phases: 'current phase', design: 'design status', gates: 'required gate' };
  const parts = report.unknown.map(key => words[key]);
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} or ${parts[1]}`
    : `${parts.slice(0, -1).join(', ')}, or ${parts.at(-1)}`;
  return `No ${list} is recorded.`;
}
function sourceText(source) {
  if (!source) return null;
  if (source.label === 'Idea ledger') return 'the idea ledger';
  if (source.label === 'Tracked board') return 'the tracked board (bd list)';
  if (source.label === 'Needs you') return `Needs you, request ${source.path}`;
  return baseName(source.path);
}
function progressText(counts) {
  return counts ? `${counts.done} of ${counts.total} tasks` : 'Progress not established';
}

/* ------------------------------------------------------------------ Capture (FR-012 to FR-017) */

const CAPTURE_PRESETS = FIXTURES.capture.presets;
const choiceWord = (value, labels) => (value === 'not-set' ? 'Not set' : labels[value]);
// A simulated owner's title: the first sentence, kept whole up to 60 characters.
function titleFrom(text) {
  const sentence = text.trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '');
  let title = '';
  for (const word of sentence.split(/\s+/)) {
    if (`${title} ${word}`.trim().length > 60) break;
    title = `${title} ${word}`.trim();
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}
function slugFrom(text) {
  return titleFrom(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'work-item';
}
const matched = () => FIXTURE_RECORDS.find(record => record.ideaPath === FIXTURES.capture.matchedExisting);

// A simulated owner read-back. `saved` records the choices, `kept` reuses 901 and keeps
// its different values, `missing` records the intent but not the chosen domain.
function savedResult(outcome, text, intent, domain) {
  if (outcome === 'kept') {
    const existing = matched();
    const recorded = { workIntent: existing.workIntent, workDomain: existing.workDomain };
    const kept = [];
    if (intent !== 'not-set' && existing.workIntent.state === 'set' && existing.workIntent.value !== intent) kept.push(['intent', existing.workIntent.value, intent]);
    if (domain !== 'not-set' && existing.workDomain.state === 'set' && existing.workDomain.value !== domain) kept.push(['domain', existing.workDomain.value, domain]);
    return { ideaPath: existing.ideaPath, number: existing.number, title: existing.title, matched: true, recorded, kept, missing: [] };
  }
  const slug = slugFrom(text), title = titleFrom(text);
  const field = value => (value === 'not-set' ? NOT_SET : { state: 'set', value });
  const recorded = { workIntent: field(intent), workDomain: outcome === 'missing' ? NOT_SET : field(domain) };
  const missing = outcome === 'missing' && domain !== 'not-set' ? [['domain', domain]] : [];
  return { ideaPath: `.dude/ideas/${FIXTURES.capture.newRecordNumber}-${slug}.md`, number: FIXTURES.capture.newRecordNumber,
    title, slug, matched: false, recorded, kept: [], missing };
}
function captureFromPreset(key) {
  const preset = CAPTURE_PRESETS[key] ?? CAPTURE_PRESETS.default;
  const choices = { text: preset.text, intent: preset.intent, domain: preset.domain };
  const attempt = !preset.attempt ? null : {
    phase: preset.attempt, ...choices, retryable: preset.attempt === 'refused',
    result: preset.attempt === 'saved' ? savedResult(preset.outcome, preset.text, preset.intent, preset.domain) : null,
  };
  return { ...choices, validation: '', attempt };
}

/* ------------------------------------------------------------------ Proposed styles and mock-only styles */

const useMockStyles = makeStyles({
  // Proposed for styles.js (067). Fluent tokens only; no new color.
  classLine: {
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, color: tokens.colorNeutralForeground1,
    overflowWrap: 'anywhere',
  },
  facts: {
    display: 'flex', flexWrap: 'wrap', columnGap: tokens.spacingHorizontalXXL, rowGap: tokens.spacingVerticalS, margin: 0,
    '& > div': { display: 'flex', flexDirection: 'column', minWidth: 0 },
    '& dt': { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
    '& dd': {
      margin: 0, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300,
      fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere',
    },
    // Not set, Unrecognized, and Unavailable read as plain words, never by color alone.
    '& dd[data-quiet]': { fontWeight: tokens.fontWeightRegular },
  },
  report: { '& dd': { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS } },
  reportValue: { fontWeight: tokens.fontWeightSemibold },
  reportList: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  choices: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15em), 1fr))', alignItems: 'start',
    columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalM,
  },
  // Mock only: honest notes where this file does not reproduce an unchanged surface.
  mockNote: {
    margin: 0, padding: tokens.spacingHorizontalM, borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStrokeAccessible}`,
    color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
  },
  appInMock: { height: 'calc(100dvh - var(--mock-strip-h, 0px))', minHeight: 0 },
});

/* ------------------------------------------------------------------ Rows and shared parts */

function rowsFor(records) {
  return records.map(record => {
    const stage = workStage(record);
    return {
      record, ideaPath: record.ideaPath, number: record.number, title: record.title || 'Title unavailable', slug: record.slug,
      stage, stageText: stage || 'Stage unavailable', note: stage ? stageNote(record, stage) : null,
      open: stage ? !['Completed', 'Closed'].includes(stage) : null, tasks: record.taskCounts,
    };
  }).sort((a, b) => (a.number ? Number(a.number) : Infinity) - (b.number ? Number(b.number) : Infinity)
    || a.ideaPath.localeCompare(b.ideaPath));
}
const sameRecord = (left, right) => Boolean(left && right && left.ideaPath === right.ideaPath && left.specPath === right.specPath);
const rowLabel = row => `${row.number || 'Number unavailable'}. ${row.title}. ${classificationSpeech(row.record)}. `
  + `Stage: ${row.stageText}${row.note ? `, ${row.note}` : ''}. ${progressText(row.tasks)}. ${row.ideaPath}`;

function Notice({ title, children, intent = 'info' }) {
  const s = useCanvasStyles();
  return <MessageBar intent={intent} layout="multiline" className={s.notice}>
    <MessageBarBody>{title && <MessageBarTitle>{title}</MessageBarTitle>}{children}</MessageBarBody>
  </MessageBar>;
}
function MockNote({ children }) {
  const m = useMockStyles();
  return <p className={m.mockNote} role="note" data-mock-note>Mock note: {children}</p>;
}

function taskReadiness(task) {
  if (task.readiness.state === 'ready') return task.readiness.basis === 'recorded-deps'
    ? 'Ready by recorded task dependencies' : 'Ready in the captured Beads ready result';
  if (task.readiness.state === 'waiting') return 'Waiting on dependencies';
  if (task.readiness.state === 'not-exposed') return 'Readiness not exposed by this source';
  return null;
}
function TaskDetail({ task, items, dock, detailRef, id, onClose }) {
  const s = useCanvasStyles();
  return <section ref={detailRef} id={id} tabIndex={-1} data-task-detail={task.taskKey}
    className={mergeClasses(s.taskDetail, dock && s.taskDetailDock)} aria-labelledby={`${id}-heading`}>
    <div className={s.between}><h3 id={`${id}-heading`} className={s.taskLabel}>Task detail · read only</h3>
      <Button appearance="subtle" size="small" onClick={onClose} aria-label="Close task detail">Close</Button></div>
    <Text className={s.code}>{task.taskKey}{task.issueId ? ` · ${task.issueId}` : ''}</Text>
    <p className={s.lead}>{task.title || 'Title not exposed by this source'}</p>
    <div className={s.tight}><Text weight="semibold">Recorded status</Text>
      <Text>{TASK_STATES[task.state]}{taskReadiness(task) ? ` · ${taskReadiness(task)}` : ''}</Text>
      <Text className={s.eyebrow}>{task.state === 'in-progress'
        ? 'In progress is recorded state, not evidence that an agent is working now.'
        : task.state === 'done' ? 'Done is recorded state, not a verification or review result.'
          : task.state === 'blocked' ? 'Explicitly blocked is separate from waiting on dependencies.'
            : 'Dependency readiness is not Work admission or approval.'}</Text>
    </div>
    <div className={s.tight}><Text weight="semibold">Phase</Text>
      <Text>{task.phase?.heading || (task.source.kind === 'tracked' ? 'Phase not exposed' : 'No phase recorded; grouped under Work')}</Text></div>
    <div className={s.tight}><Text weight="semibold">Dependencies</Text>
      {task.deps === null ? <Text className={s.eyebrow}>Dependency declarations: Not exposed by this source.</Text>
        : !task.deps.length ? <Text className={s.eyebrow}>No dependencies are recorded in this declaration.</Text>
          : <ul className={s.taskDependencies}>{task.deps.map(key => <li key={key}>
            <Text className={s.code}>{key}</Text>
            <Text className={s.eyebrow}>{TASK_STATES[items.find(item => item.taskKey === key)?.state]
              || 'State not exposed by this source'}</Text>
          </li>)}</ul>}
    </div>
    <div className={s.tight}><Text weight="semibold">Explicit blocker</Text>
      <p className={s.prose}>{task.blockedBy || (task.state === 'blocked'
        ? 'Blocked; no explicit reason is exposed by this source.' : 'No explicit blocker reason is exposed by this source.')}</p></div>
    <div className={s.tight}><Text weight="semibold">Verification and review results</Text>
      <Text>Not exposed by this source.</Text>
      <Text className={s.eyebrow}>Acceptance wording, Done, work item Activity, and design-review history are not task results.
        Any result written inside the unit remains attributed source text, not a verdict from this view.</Text></div>
    <div className={s.tight}><Text weight="semibold">{task.instruction.coverage === 'full-unit' ? 'Recorded unit' : 'Only imported description available'}</Text>
      <p className={s.taskSource} data-task-instruction={task.taskKey} tabIndex={dock ? 0 : undefined}
        role={dock ? 'region' : undefined} aria-label={dock ? `Recorded instruction for ${task.taskKey}, scrollable` : undefined}>
        {task.instruction.text}
      </p>
      <Text className={s.eyebrow}>{task.instruction.coverage === 'full-unit'
        ? 'The complete canonical unit, including blank paragraphs and fenced examples, shown as inert source text.'
        : 'The captured issue does not expose the original full task unit or its phase.'}</Text>
      <Text className={s.code}>{task.source.path || task.source.command}</Text>
      <Text className={s.eyebrow}>Uses this work item’s complete read and source freshness.</Text>
    </div>
  </section>;
}

function WorkName({ row }) {
  const s = useCanvasStyles(), m = useMockStyles();
  const line = classificationLine(row.record);
  return <span className={s.workName}><Text className={s.workNumber} data-work-number>{row.number || 'No. unavailable'}</Text>
    <span className={s.tight}><Text weight="semibold">{row.title}</Text>
      {line && <Text className={m.classLine} data-work-classification>{line}</Text>}
      <Text className={s.eyebrow}>{row.slug}</Text></span></span>;
}
function WorkStatus({ row }) {
  const s = useCanvasStyles();
  return <span className={s.tight} data-work-stage={row.stageText}><Text>{row.stageText}</Text>
    {row.note && <Text className={s.eyebrow}>{row.note}</Text>}</span>;
}
function WorkProgress({ row }) {
  const s = useCanvasStyles();
  return <span className={s.progressCell}><Text>{progressText(row.tasks)}</Text>
    {row.tasks?.total > 0 && row.tasks.done < row.tasks.total
      && <ProgressBar value={row.tasks.done} max={row.tasks.total} aria-hidden="true" />}</span>;
}
const COLUMNS = [
  createTableColumn({ columnId: 'name', renderHeaderCell: () => 'Name',
    renderCell: row => <TableCellLayout><WorkName row={row} /></TableCellLayout> }),
  createTableColumn({ columnId: 'status', renderHeaderCell: () => 'Status',
    renderCell: row => <TableCellLayout><WorkStatus row={row} /></TableCellLayout> }),
  createTableColumn({ columnId: 'progress', renderHeaderCell: () => 'Progress',
    renderCell: row => <TableCellLayout><WorkProgress row={row} /></TableCellLayout> }),
];

function WorkFinder({ selection, row, finder, onFinder, onClear, search, onFocus, onSearch, onKeyDown, resultsId }) {
  const s = useCanvasStyles();
  return selection ? <div className={s.workingOn} role="group" aria-label="Working on">
    <div className={s.workingIdentity}>
      <Text className={s.workingCaption}>Working on</Text>
      <span className={s.workName}>
        <Text className={mergeClasses(s.workNumber, s.workingNumber)}>{numberOf(selection.ideaPath) || 'No. unavailable'}</Text>
        <Text weight="semibold" className={s.workingTitle} title={row?.title || selection.title || 'Title unavailable'}>
          {row?.title || selection.title || 'Title unavailable'}
        </Text>
      </span>
    </div>
    <Button appearance="subtle" size="small" onClick={onClear} aria-label="Clear work selection"
      title="Clear the work lookup to an empty search and All records. Requests, drafts, and Review work are retained.">Clear</Button>
  </div> : <div className={s.workControls}>
    <Field className={s.searchField} label={{ children: 'Search work', className: s.visuallyHidden }}>
      <Input ref={search} className={s.control} value={finder.query} contentBefore={<SearchRegular />}
        type="search" placeholder="Number, title, slug, or path" autoComplete="off"
        aria-controls={resultsId} onFocus={onFocus} onClick={onSearch} onKeyDown={onKeyDown}
        onChange={(_, input) => { onFinder({ ...finder, query: input.value }); onSearch(); }} />
    </Field>
    <Field className={s.scopeField} label="Show" orientation="horizontal">
      <Dropdown className={s.scopeSelect} inlinePopup value={SCOPES.find(([value]) => value === finder.scope)[1]}
        selectedOptions={[finder.scope]} onOptionSelect={(_, input) => {
          onFinder({ ...finder, scope: input.optionValue }); onSearch();
        }}>
        {SCOPES.map(([value, label]) => <Option key={value} value={value} text={label}>{label}</Option>)}
      </Dropdown>
    </Field>
  </div>;
}

function WorkResults({ rows, selection, finder, scroll, position, onOpen, resultsRef, resultsId }) {
  const s = useCanvasStyles(), id = useId();
  const size = useRef(null), list = useRef(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 620));
    observer.observe(size.current);
    return () => observer.disconnect();
  }, []);
  const fallback = !selection && finder.scope !== 'all' && rows.some(row => row.open === null);
  const scope = fallback ? 'all' : finder.scope;
  const query = finder.query.trim().toLocaleLowerCase();
  // Search matches the same fields as today. Intent and domain are not filters (out of scope).
  const visible = rows.filter(row => selection ? sameRecord(row.record, selection)
    : (scope === 'all' || row.open === (scope === 'open'))
    && (!query || [row.number, row.record.title, row.slug, row.ideaPath, row.record.specPath]
      .some(value => value?.toLocaleLowerCase().includes(query))));
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = selection ? 0 : scroll.current;
  }, [finder.scope, finder.query, selection, scroll, compact, visible.length]);
  const columns = { name: s.columnName, status: s.columnStatus, progress: s.columnProgress };
  const closed = rows.filter(row => row.stage === 'Closed').length;
  const completed = rows.filter(row => row.stage === 'Completed').length;
  return <section ref={size} className={s.workResults} aria-labelledby={id} data-work-layout={compact ? 'compact' : 'grid'}>
    <h2 id={id} className={s.visuallyHidden}>{selection ? 'Selected work' : 'Recorded work'}</h2>
    {fallback && <Notice title="Showing all records while work status is incomplete">
      Your {finder.scope === 'closed' ? 'Closed' : 'Open'} selection is retained. Unknown records are included so missing progress cannot hide work.
    </Notice>}
    <div className={s.workSummary}>
      <Text className={s.eyebrow} role="status">{selection
        ? visible.length ? `${visible.length} selected record` : 'Selected record unavailable'
        : `${visible.length} of ${rows.length} work items · capture order, oldest first`}</Text>
      {!selection && !!(closed || completed) && <Text className={s.eyebrow}>Closed includes {completed} completed and {closed} closed
        work items. Closing doesn’t mean the work was implemented.</Text>}
      <Text className={s.eyebrow}>{selection ? 'Open this row, or focus it and press Enter, to return to Now for this record.'
        : 'Choose a row, or focus it and press Enter, to open that exact record in Now.'}</Text>
    </div>
    <div ref={node => { list.current = node; if (resultsRef) resultsRef.current = node; }}
      id={resultsId} className={s.workScroll} data-work-scroll
      onFocusCapture={event => {
        if (!selection) {
          const path = event.target.closest('[data-work-path]')?.getAttribute('data-work-path');
          if (path) position.current = visible.find(row => row.ideaPath === path)?.record || null;
        }
      }}
      onScroll={event => { if (!selection) scroll.current = event.currentTarget.scrollTop; }}>
      {!visible.length ? <div className={s.empty}><Text weight="semibold">No matching work</Text>
        <Text>Change the search or Show selection. Nothing has been removed.</Text></div>
        : compact ? <List navigationMode="items" aria-label="Recorded work">
          {visible.map(row => <ListItem key={row.ideaPath} className={mergeClasses(s.workItem, selection && s.workSelected)} data-work-path={row.ideaPath}
            aria-label={rowLabel(row)} aria-current={selection ? 'true' : undefined} onAction={() => onOpen(row.record)}>
            <span className={s.workItemText}><WorkName row={row} />
              <Text className={s.eyebrow} data-work-stage={row.stageText}>{row.stageText}{row.note ? ` · ${row.note}` : ''} · {progressText(row.tasks)}</Text></span>
          </ListItem>)}
        </List> : <DataGrid items={visible} columns={COLUMNS} getRowId={row => row.ideaPath}
          focusMode="composite" aria-label="Recorded work">
          <DataGridHeader className={s.workHeader}><DataGridRow>
            {({ columnId, renderHeaderCell }) => <DataGridHeaderCell focusMode="none"
              className={mergeClasses(s.workCell, columns[columnId])}>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow></DataGridHeader>
          <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId} className={mergeClasses(s.workRow, selection && s.workSelected)}
            data-work-path={item.ideaPath} aria-label={rowLabel(item)} aria-current={selection ? 'true' : undefined}
            onClick={() => onOpen(item.record)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
              event.preventDefault(); onOpen(item.record);
            }}>
            {({ columnId, renderCell }) => <DataGridCell focusMode="none" className={mergeClasses(s.workCell, columns[columnId])}>
              <div className={s.cellLayout}>{renderCell(item)}</div>
            </DataGridCell>}
          </DataGridRow>}</DataGridBody>
        </DataGrid>}
    </div>
  </section>;
}

/* ------------------------------------------------------------------ Overview */

function Overview({ data, rows, selection, finder, scroll, position, onOpen, onNew, resultsRef, resultsId, finderControl }) {
  const s = useCanvasStyles();
  return <div className={s.overview}>
    <header className={s.overviewHeader}><div className={s.between}>
      <h1 className={s.title} tabIndex={-1}>Overview</h1>
      <Button icon={<AddRegular />} onClick={onNew}>New work item</Button>
    </div><p className={s.overviewIntro}>{selection
      ? 'Filtered to the work you are on. Use Clear in the work selector to find different work. Nothing is closed or discarded.'
      : 'Nothing is selected. Numbers show capture chronology, not priority, dependencies, or execution order.'}</p>
      {finderControl}</header>
    {selection ? <WorkResults rows={rows} selection={selection} finder={finder} scroll={scroll} position={position}
      onOpen={onOpen} resultsRef={resultsRef} resultsId={resultsId} />
      : data === 'blank' ? <section className={s.empty} data-blank-workspace>
        <h2 className={s.subheading}>Welcome to Dude</h2>
        <p className={s.lead}>Describe the work you want done. Dude can capture it as a work item for later, without a spec or task board.</p>
        <Button className={s.back} appearance="primary" onClick={onNew}>New work item</Button>
      </section> : <WorkResults rows={rows} finder={finder} scroll={scroll} position={position}
        onOpen={onOpen} resultsRef={resultsRef} resultsId={resultsId} />}
  </div>;
}

/* ------------------------------------------------------------------ Now: header and progress report */

function ReviewEntry({ record, feed, onReview }) {
  const s = useCanvasStyles();
  const records = feed.coverage.state === 'unavailable' ? [] : feed.requests.filter(item => item.phase === 'pending'
    && item.request.class === 'preview' && item.request.scope.kind === 'feature'
    && item.request.scope.ideaPath === record.ideaPath && item.request.scope.specPath === record.specPath);
  if (records.length) return <Button className={s.back} appearance="primary" icon={<CommentRegular />}
    data-review-entry={records.length === 1 ? records[0].requestHandle : 'choices'}
    onClick={() => onReview(records)}>Review design{records.length > 1 ? ' requests' : ''}</Button>;
  // FR-003: mock and Review guidance only for the design workflow or a current preview request.
  return record.design ? <Text className={s.eyebrow}>No current owner-qualified preview request is waiting for this record.</Text> : null;
}

function ReportRow({ label, value, detail, source, quiet = false }) {
  const s = useCanvasStyles(), m = useMockStyles();
  return <div className={s.aboutRow} data-report-row={label}><dt>{label}</dt><dd>
    <span className={quiet ? undefined : m.reportValue}>{value}</span>
    {detail && <Text className={s.eyebrow}>{detail}</Text>}
    {source && <Text className={s.eyebrow}>From {sourceText(source)}</Text>}
  </dd></div>;
}

function ProgressReport({ record, report, id }) {
  const s = useCanvasStyles(), m = useMockStyles();
  const stage = report.stage.value, counts = record.taskCounts;
  const note = stage ? stageNote(record, stage) : null;
  const sentence = unknownSentence(report);
  const checkpoint = report.checkpoints[0];
  return <section className={s.contextSection} aria-labelledby={`${id}-progress`} data-progress-report>
    <h2 id={`${id}-progress`} className={s.subheading}>Progress</h2>
    <dl className={mergeClasses(s.aboutFacts, m.report)}>
      <ReportRow label="Stage" value={stage || 'Unavailable'} quiet={!stage} source={report.stage.source}
        detail={!stage ? 'The record couldn’t be read, so its stage is unknown.' : note} />
      {report.phases.state === 'current' && <ReportRow label={report.phases.items.length > 1 ? 'Current phases' : 'Current phase'}
        value={report.phases.items.length > 1 ? <ul className={m.reportList}>
          {report.phases.items.map(item => <li key={item.name}>{item.name}</li>)}</ul> : report.phases.items[0].name}
        source={report.phases.items[0].source} />}
      {report.phases.state === 'not-exposed' && <ReportRow label="Phase" value="Not exposed" quiet source={report.phases.source}
        detail="The tracked board records no phases, and Canvas doesn’t fill them in from tasks.md." />}
      {report.design && <ReportRow label="Design status" value={DESIGN_STATUS[report.design.status]} source={report.design.source}
        detail={checkpoint ? `Checkpoint reached: design ${report.design.status}.` : 'No design checkpoint is recorded yet.'} />}
      {report.gates.map(gate => <ReportRow key={gate.kind} label="Required gate" value="Design approval" source={gate.source}
        detail="The design workflow needs your approval of the exact mock before implementation starts." />)}
      {report.requests.items.map(item => <ReportRow key={item.requestHandle} label="Waiting for you"
        value={`${CLASSES[item.class] || item.class} from ${item.owner}`} source={{ label: 'Needs you', path: item.requestHandle }}
        detail="A current request. It adds no gate and doesn’t change the stage." />)}
      {report.requests.state !== 'current' && <ReportRow label="Requests" quiet
        value={report.requests.state === 'partial' ? 'Status partial' : 'Status unavailable'}
        detail={`${report.requests.reason} ${report.requests.state === 'partial'
          ? 'Other requests for this work item may be missing.' : 'Canvas can’t tell whether anything is waiting for you.'}`} />}
    </dl>
    {sentence && <p className={s.prose} data-report-unknown>{sentence}</p>}
    {stage === 'Closed' && <p className={s.prose}>Closed without a definition package. Closing doesn’t mean the work was implemented.</p>}
    {stage === 'Completed' && <p className={s.prose}>Every recorded task is done. That isn’t a verification, review, or release result.</p>}
    {counts && counts.total > 0 && <div className={s.tight}>
      <div className={s.between}><Text>{progressText(counts)}</Text></div>
      <ProgressBar value={counts.done} max={counts.total} aria-label={`${counts.done} of ${counts.total} recorded tasks done`} />
      <Text className={s.eyebrow}>{counts.open} pending · {counts.inProgress} in progress · {counts.blocked} blocked · {counts.done} done</Text>
    </div>}
    {counts && counts.total === 0 && <Text>No tasks are recorded yet.</Text>}
    {record.readable && <Text className={s.eyebrow}>{!counts
      ? 'Recorded lifecycle state only. It doesn’t show live agent activity, verification, review, or release.'
      : `${record.lane === 'tracked' ? 'Recorded in the authoritative tracked board.'
        : record.lane === 'lightweight' ? 'Recorded canonical task work.' : 'Definition and captured description.'}`
        + ' Counts are recorded task states. They don’t show live agent activity, verification, review, or release.'}</Text>}
  </section>;
}

function Context({ selection, records, feed, taskKey, taskFilter, onTask, onTaskFilter, onBack, onRequest, onReview }) {
  const s = useCanvasStyles(), m = useMockStyles(), id = useId();
  const record = records.find(item => sameRecord(item, selection));
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1080px)').matches);
  const taskRows = useRef(new Map()), detail = useRef(null), focusDetail = useRef(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1080px)');
    const change = () => {
      focusDetail.current = Boolean(detail.current?.contains(document.activeElement));
      setWide(media.matches);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    if (focusDetail.current) {
      focusDetail.current = false;
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: 'nearest' });
    }
  });
  const back = <Button className={s.back} icon={<ArrowLeftRegular />} onClick={onBack}>Back to Overview</Button>;
  if (!selection) return <div className={s.contextView}>{back}
    <h1 className={s.title} tabIndex={-1}>No work item is selected</h1>
    <p className={s.lead}>Use Search work in the command bar or choose a row in Overview to open its Now view.</p></div>;
  if (!record) return <div className={s.contextView}>{back}
    <h1 className={s.title} tabIndex={-1}>{numberOf(selection.ideaPath)} {selection.title || 'Title unavailable'}</h1>
    <Notice intent="warning" title="The selected source is unavailable">Its exact identity is retained. No other record has been selected.</Notice></div>;
  const report = progressReport(record, feed);
  const stage = report.stage.value;
  const requests = currentRequests(record, feed);
  const d = record.detail;
  const items = d.tasks;
  const inspected = items?.find(task => task.taskKey === taskKey && (taskFilter === 'all' || taskFilter === task.state));
  const nextTask = d.next ? items?.find(task => task.taskKey === d.next.taskKey) : null;
  const groups = [];
  for (const task of items || []) {
    const heading = task.phase?.heading || (task.source.kind === 'tracked' ? 'Phase not exposed' : 'Work');
    let group = groups.find(entry => entry.heading === heading);
    if (!group) { group = { heading, tasks: [] }; groups.push(group); }
    group.tasks.push(task);
  }
  const openTask = key => { focusDetail.current = true; onTask(key); };
  const closeTask = () => {
    const key = inspected.taskKey;
    onTask(null);
    taskRows.current.get(key)?.focus({ preventScroll: true });
  };
  const inspector = inspected && <TaskDetail task={inspected} items={items} dock={wide}
    detailRef={detail} id={`${id}-detail`} onClose={closeTask} />;
  const intent = record.workIntent, domain = record.workDomain;
  const unrecognized = [intent.state === 'unrecognized' && 'intent', domain.state === 'unrecognized' && 'domain'].filter(Boolean);
  const correction = !record.readable
    ? 'This record couldn’t be read, so its intent, domain, and stage are unavailable rather than Not set. Refresh to read it again.'
    : `${unrecognized.length ? `The saved ${unrecognized.join(' and ')} isn’t a value Dude recognizes. ` : ''}`
      + 'Ask Dude in chat to set or change the intent or domain. Changing them doesn’t change the stage or start any work.';
  const quiet = field => (field.state !== 'set' ? '' : undefined);
  const reviewEntry = <ReviewEntry record={record} feed={feed} onReview={onReview} />;
  return <div className={s.contextView} data-now={record.ideaPath}>
    {back}
    <div className={s.contextGrid}>
      <div className={s.contextMain}>
        <header className={s.objectHeader}>
          <div className={s.detailHeader}>
            <Text className={s.eyebrow}>Work item</Text>
            <h1 className={s.objectTitle} tabIndex={-1}><span className={s.workNumber}>{record.number}</span>{' '}
              <span>{record.title || 'Title unavailable'}</span></h1>
            <dl className={m.facts} aria-label="Intent, domain, and stage" data-classification>
              <div><dt>Intent</dt><dd data-quiet={quiet(intent)}>{fieldWord(intent, INTENT_LABEL)}</dd></div>
              <div><dt>Domain</dt><dd data-quiet={quiet(domain)}>{fieldWord(domain, DOMAIN_LABEL)}</dd></div>
              <div><dt>Stage</dt><dd data-quiet={stage ? undefined : ''}>{stage || 'Unavailable'}</dd></div>
            </dl>
            <Text className={s.code}>{record.specPath || record.ideaPath}</Text>
            <Text className={s.eyebrow} data-correction>{correction}</Text>
          </div>
          {(!!requests.length || Boolean(record.design)) && <div className={s.tight}>
            {!!requests.length && <Button className={s.back} icon={<CommentRegular />}
              data-request-entry={requests.length === 1 ? requests[0].requestHandle : 'choices'}
              onClick={() => onRequest(requests)}>
              {requests.length === 1 ? 'Respond to request' : `Choose request (${requests.length})`}
            </Button>}
            {reviewEntry}
          </div>}
        </header>
        <section className={s.nextRegion} data-now-next aria-labelledby={`${id}-next`}>
          <h2 id={`${id}-next`} className={s.subheading}>{!record.readable ? 'Next step unavailable' : d.next ? 'Next step' : 'No next step'}</h2>
          {!record.readable ? <Notice title="Current instruction unavailable" intent="warning">
            This record couldn’t be read. Task progress and detail are withheld. Refresh to read it again.
          </Notice> : d.next ? <>
            <p className={s.lead}>{d.next.description}</p>
            {nextTask ? <div className={s.tight}>
              <h3 className={s.taskLabel}>Current task instruction</h3>
              <Text className={s.eyebrow}>{nextTask.instruction.coverage === 'full-unit' ? 'Full canonical unit' : 'Only imported description available'}</Text>
              <p className={s.instruction}>{nextTask.instruction.text}</p>
              <Text className={s.code}>{nextTask.taskKey} · {nextTask.source.path || nextTask.source.command}</Text>
            </div> : <Text className={s.eyebrow}>Full instruction unavailable.</Text>}
          </> : <p className={s.prose}>{d.nextReason || 'No next execution step is established.'}</p>}
          {record.lane === 'definition' && items?.length > 0 && <Text className={s.eyebrow}>
            Planned task definitions; execution has not started. Readiness by recorded dependencies is not Work admission or approval.
          </Text>}
        </section>
        {!!d.blockers.length && <section className={s.contextSection}><h2 className={s.subheading}>Recorded blockers</h2>
          {d.blockers.map((blocker, index) => <div className={s.tight} key={index}>
            {blocker.classification && <Text weight="semibold">{BLOCKER_CLASSES[blocker.classification]}</Text>}
            <p className={s.prose}>{blocker.reason}</p>
            <Text className={s.code}>{blocker.source.path || 'Tracked board'} · {blocker.source.taskKey || blocker.source.issueId}</Text>
          </div>)}
          <Text className={s.eyebrow}>These are recorded work blockers. Only a current owner-qualified request belongs in Needs you.</Text>
        </section>}
        <ProgressReport record={record} report={report} id={id} />
        <section className={s.contextSection} aria-labelledby={`${id}-tasks`}>
          <div className={s.between}><h2 id={`${id}-tasks`} className={s.subheading}>Tasks</h2><Text className={s.eyebrow}>Read only</Text></div>
          {items ? <>
            <div className={s.taskFilters} role="group" aria-label="Filter tasks by recorded status">
              {TASK_FILTERS.map(([value, label, count]) => <Button key={value} size="small"
                appearance={taskFilter === value ? 'primary' : 'secondary'} aria-pressed={taskFilter === value}
                data-task-filter={value} onClick={event => {
                  event.currentTarget.focus({ preventScroll: true }); onTaskFilter(value);
                }}>{label} <span className={s.taskCount}>{record.taskCounts[count]}</span></Button>)}
            </div>
            <Text className={s.eyebrow}>Recorded states, not live-agent activity. Filters affect only task rows; phase totals and Next stay unchanged.</Text>
            {!items.length && <Text>No canonical tasks are recorded in this source.</Text>}
            {groups.map(group => {
              const visible = group.tasks.filter(task => taskFilter === 'all' || task.state === taskFilter);
              const counts = countTasks(group.tasks);
              return <section className={s.taskPhase} key={group.heading} aria-label={group.heading} data-task-phase={group.heading}>
                <div className={s.between}><h3 className={s.taskLabel}>{group.heading}</h3>
                  <Text className={s.eyebrow}>{counts.done} of {counts.total} tasks complete</Text></div>
                {!visible.length ? <p className={s.taskEmpty}>No {TASK_STATES[taskFilter]?.toLowerCase()} tasks in this phase.</p>
                  : <ul className={s.taskRows}>{visible.map(task => {
                    const selected = inspected?.taskKey === task.taskKey;
                    const Icon = task.state === 'done' ? CheckmarkRegular : task.state === 'blocked' ? WarningRegular
                      : task.state === 'in-progress' ? RecordRegular : CircleRegular;
                    return <li key={task.taskKey}><Button appearance="transparent" ref={node => {
                      if (node) taskRows.current.set(task.taskKey, node); else taskRows.current.delete(task.taskKey);
                    }} className={mergeClasses(s.taskRow, task.state === 'in-progress' && s.taskDoing,
                      task.state === 'blocked' && s.taskBlocked, selected && s.taskInspected)}
                      data-task-key={task.taskKey} aria-expanded={selected} aria-controls={selected ? `${id}-detail` : undefined}
                      aria-label={`${task.taskKey}. ${task.title}. ${TASK_STATES[task.state]}. Inspect read-only task`}
                      onClick={() => openTask(task.taskKey)}>
                      <span className={s.taskMark} aria-hidden="true"><Icon /></span>
                      <span className={s.tight}><Text className={s.taskTitle}>{task.title || 'Title not exposed by this source'}</Text>
                        <span className={s.row}><Text weight="semibold">{TASK_STATES[task.state]}</Text>
                          <Text className={s.code}>{task.taskKey}</Text>{selected && <Text className={s.taskChip}>Inspecting</Text>}</span>
                        {taskReadiness(task) && <Text className={s.eyebrow}>{taskReadiness(task)}</Text>}
                      </span>
                    </Button>{!wide && selected && inspector}</li>;
                  })}</ul>}
              </section>;
            })}
          </> : d.partial && record.taskCounts?.total ? <MockNote>this repository snapshot carries this record’s task counts
            ({progressText(record.taskCounts)}) but not its task rows. Full rows were captured for 066, 067, 078, 085 (app theme), and 087.</MockNote>
            : <Text className={s.prose}>{d.taskReason || 'No tasks are recorded for this work item.'}</Text>}
        </section>
        <section className={s.contextSection} aria-labelledby={`${id}-activity`}>
          <h2 id={`${id}-activity`} className={s.subheading}>Activity</h2>
          {d.activity?.length ? d.activity.map((event, index) => <div className={s.tight} key={index}>
            <Text className={s.eyebrow}>{event.date}</Text><p className={s.prose}>{event.text}</p>
          </div>) : d.partial ? <MockNote>activity wasn’t captured for this record in the repository snapshot.</MockNote>
            : <Text className={s.eyebrow}>No dated activity is recorded for this work item.</Text>}
          <Text className={s.eyebrow}>Activity is separate from task verification and review results.</Text>
        </section>
      </div>
      <aside className={s.contextDock} aria-label="Selected work properties and evidence">
        {wide && inspector}
        <details className={s.propertySection} open><summary>Selected record</summary>
          <div className={s.tight}><Text>{record.number} · {record.title || 'Title unavailable'}</Text>
            <Text>{stage || 'Stage unavailable'} · {progressText(record.taskCounts)}</Text>
            <Text className={s.code}>{record.ideaPath}{record.specPath ? `\n${record.specPath}` : ''}</Text>
            <Text className={s.eyebrow}>Open questions: {d.unansweredQuestions ?? 'Not exposed'}. These are not current requests.</Text>
          </div>
        </details>
        <details className={s.propertySection} open><summary>Captured description</summary>
          {d.intentText ? <p className={s.prose}>{d.intentText}</p> : d.partial
            ? <MockNote>the captured description wasn’t included in the repository snapshot for this record.</MockNote>
            : <p className={s.prose}>The captured description could not be read.</p>}
          {d.intentTruncated && <Text className={s.eyebrow}>Excerpt only. The exact ledger holds the original.</Text>}
        </details>
        <details className={s.propertySection}><summary>Sources and freshness</summary>
          <div className={s.stack}>{d.sources.map((source, index) => <div className={s.tight} key={index}>
            <Text weight="semibold">{source.label}</Text><Text className={s.code}>{source.path}</Text>
            {source.contentIdentity && <Text className={s.code}>{source.contentIdentity}</Text>}
          </div>)}
            <Text className={s.eyebrow}>Selected read: {d.readAt}</Text>
            <Text className={s.eyebrow}>Source freshness: current</Text>
          </div>
        </details>
      </aside>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ New work item (capture) */

const labelOf = (field, value) => (field === 'intent' ? INTENT_LABEL : DOMAIN_LABEL)[value];

function ChoiceField({ label, hint, value, options, onChange, field }) {
  const s = useCanvasStyles();
  const all = [['not-set', 'Not set'], ...options];
  return <Field label={label} hint={hint}>
    <Dropdown className={s.control} value={all.find(([id]) => id === value)[1]} selectedOptions={[value]}
      data-capture-choice={field} onOptionSelect={(_, data) => onChange(data.optionValue)}>
      {all.map(([id, text]) => <Option key={id} value={id} text={text}>{text}</Option>)}
    </Dropdown>
  </Field>;
}

function CaptureStatus({ attempt }) {
  const s = useCanvasStyles();
  if (!attempt) return null;
  if (attempt.phase === 'responding') return <Notice title="Responding">Sending this capture. Don’t submit it again.</Notice>;
  if (attempt.phase === 'sending') return <Notice title="Awaiting capture delivery">
    Capture delivery is being reconciled. No saved result is confirmed yet. Your text and choices stay here.</Notice>;
  if (attempt.phase === 'uncertain') return <Notice intent="warning" title="Delivery uncertain">
    Canvas couldn’t confirm delivery, so it won’t send this again. Your text and choices stay here until the owner reconciles the capture.</Notice>;
  if (attempt.phase === 'refused') return <Notice intent="error" title="Not sent">
    Dude didn’t accept the chosen intent or domain, so nothing was captured. Your text and choices are still here.
    Try again with Not set, or ask Dude in chat to classify the work.</Notice>;
  const result = attempt.result;
  const recorded = result.recorded;
  return <>
    <Notice intent="success" title="Work item saved">
      <div className={s.tight} data-capture-saved>
        <Text>The owner acknowledged the capture, and Canvas read the saved work item back.</Text>
        {result.matched && <Text>It matched an existing work item: {result.number} {result.title}.</Text>}
        {recorded ? <Text weight="semibold">Recorded: Intent {fieldWord(recorded.workIntent, INTENT_LABEL)} · Domain {fieldWord(recorded.workDomain, DOMAIN_LABEL)}</Text>
          : <Text>No intent or domain was sent. To set them, ask Dude in chat.</Text>}
        <Text className={s.code}>{result.ideaPath}</Text>
      </div>
    </Notice>
    {result.kept.map(([field, kept, chosen]) => <Notice key={field} title={`Existing ${field} kept`}>
      {result.number} already had the {field} {labelOf(field, kept)}, so Dude kept it instead of {labelOf(field, chosen)}.
      To change it, ask Dude in chat.</Notice>)}
    {result.missing.map(([field, chosen]) => <Notice key={field} intent="warning" title={`${field === 'intent' ? 'Intent' : 'Domain'} not recorded`}>
      You chose {labelOf(field, chosen)}, but the saved work item has no {field}. To set it, ask Dude in chat.</Notice>)}
  </>;
}

function NewWorkItem({ capture, onChange, onSubmit, onCancel, feed }) {
  const s = useCanvasStyles(), m = useMockStyles();
  const { attempt } = capture;
  const idle = feed.idle && feed.coverage.state === 'current';
  // Locking stays keyed to the text: new choices alone never permit a second capture.
  const locked = Boolean(attempt && !attempt.retryable && (attempt.phase !== 'saved' || capture.text === attempt.text));
  const submit = continuation => {
    if (!capture.text.trim()) { onChange({ validation: 'Describe the work before submitting or saving.' }); return; }
    onChange({ validation: '' });
    onSubmit(continuation);
  };
  return <div className={s.measure} data-capture-form>
    <header className={s.detailHeader}>
      <h1 className={s.title} tabIndex={-1}>New work item</h1>
      <p className={s.lead}>What do you want done?</p>
      <p className={s.prose}>Describe the outcome in your own words. Submit captures it and continues brainstorming.
        Save captures it for later, without further discussion, definition, or execution.</p>
      <Text className={s.eyebrow}>New work item is unfiled. Your work selection is not attached to this draft.</Text>
    </header>
    <Field label="Describe the work" validationState={capture.validation ? 'error' : 'none'} validationMessage={capture.validation || undefined}>
      <Textarea value={capture.text} className={s.control} resize="vertical" rows={6}
        onChange={(_, input) => onChange({ text: input.value, validation: '' })} />
    </Field>
    <div className={m.choices} role="group" aria-label="Optional intent and domain">
      <ChoiceField field="intent" label="Intent (optional)" hint="What the work is trying to do." value={capture.intent}
        options={INTENTS} onChange={intent => onChange({ intent })} />
      <ChoiceField field="domain" label="Domain (optional)" hint="The kind of result you’ll accept. Other covers the rest."
        value={capture.domain} options={DOMAINS} onChange={domain => onChange({ domain })} />
    </div>
    <Text className={s.eyebrow}>Leave either one Not set if you’re unsure. Dude saves only what you choose here. To set or change it later, ask Dude in chat.</Text>
    <div className={s.actions}>
      <Button appearance="primary" disabled={!idle || locked} onClick={() => submit('brainstorm')}>Submit</Button>
      <Button disabled={!idle || locked} onClick={() => submit('capture_only')}>Save</Button>
      <Button onClick={onCancel}>Cancel</Button>
    </div>
    <CaptureStatus attempt={attempt} />
    {!idle && (!attempt || attempt.phase === 'saved' || attempt.retryable) && <Notice title="Waiting for the joined agent">
      {feed.coverage.state === 'unavailable' ? `${feed.coverage.reason} Your draft stays here.`
        : feed.requests.some(item => item.phase === 'pending')
          ? 'Another request is waiting. Respond in Needs you first; New work item won’t interrupt or bind itself to that request.'
          : 'Capture requires a current idle session with no unreconciled capture. Your draft stays here.'}
    </Notice>}
    <Text className={s.eyebrow}>Cancel returns to Needs you and keeps your text and choices in this tab. It does not undo a submission.
      Reloading clears the local draft.</Text>
  </div>;
}

/* ------------------------------------------------------------------ Needs you (capture action relabeled) */

function scopeLabel(scope) {
  return scope.kind === 'session' ? 'This session · no work item' : scope.kind === 'feature' ? scope.specPath : scope.ideaPath;
}

function NeedsYou({ feed, records, selected, onSelect, onNew, saveDrafts, onSaveDraft, onSave }) {
  const s = useCanvasStyles(), heading = useId();
  const unavailable = feed.coverage.state === 'unavailable';
  const uncertain = feed.coverage.state !== 'current';
  const pending = unavailable ? [] : feed.requests.filter(item => item.phase === 'pending');
  const record = pending.find(item => item.requestHandle === selected);
  if (record) {
    const request = record.request, handle = record.requestHandle;
    const scoped = request.scope.kind === 'session' ? null : records.find(item => matchesRequestScope(item, request.scope));
    const draft = saveDrafts[handle] || { open: false, text: '', attempt: null, error: '' };
    return <div className={s.measure} data-request={handle}>
      <Button className={s.back} icon={<ArrowLeftRegular />} onClick={() => onSelect(null)}>All requests</Button>
      <header className={s.detailHeader}>
        <div className={s.row}><Badge appearance="tint">{CLASSES[request.class]}</Badge>
          <Text className={s.eyebrow}>{request.blocking ? 'Blocking clarification in this context' : 'Advisory request'}</Text></div>
        <h1 className={s.title} tabIndex={-1}>Needs you</h1>
        <p className={s.lead}>{request.prompt}</p>
      </header>
      <section className={mergeClasses(s.scope, s.needsScope)} aria-label="Request scope">
        <Text className={s.eyebrow}>This request is about</Text>
        <div className={s.tight}><Text weight="semibold">{request.scope.kind === 'session' ? scopeLabel(request.scope)
          : scoped ? `${scoped.number} · ${scoped.title}` : scopeLabel(request.scope)}</Text>
          {request.scope.kind !== 'session' && <Text className={s.code}>
            {request.scope.ideaPath}{request.scope.kind === 'feature' ? `\n${request.scope.specPath}` : ''}</Text>}</div>
        <Text>Owner: {request.owner}</Text>
        <Text className={s.code}>Request: {request.requestRef} · Revision: {request.revision}</Text>
        <Text className={s.code}>Source: {request.source.kind === 'file' ? request.source.path : request.source.kind}{'\n'}{request.source.revision}</Text>
      </section>
      <section className={mergeClasses(s.scope, s.needsScope)}><Text weight="semibold">Why your input is needed</Text>
        <p className={s.prose}>{request.whyHuman}</p><Text weight="semibold">What this unblocks</Text>
        <p className={s.prose}>{request.unblocks}</p></section>
      <MockNote>this request’s response controls ({request.class === 'preview' ? 'Open Review and Approve this revision' : 'Send response'}
        {', and Defer'}) are unchanged by 067 and aren’t reproduced here. Nothing is sent from this file.</MockNote>
      {request.scope.kind === 'session' && <section className={s.stack} aria-label="Save as work item">
        <Button className={s.back} aria-expanded={draft.open} onClick={() => onSaveDraft(handle, { open: !draft.open })}>Save as work item</Button>
        {draft.open && <>
          <Notice title="Save only the text you choose">
            This asks Dude to save your text as a work item for later, through this unfiled request. It doesn’t answer the question,
            grant permission, or start definition or work. No intent or domain is sent; you can set them later in chat.
          </Notice>
          <Field label="Text to save" validationState={draft.error ? 'error' : 'none'} validationMessage={draft.error || undefined}>
            <Textarea value={draft.text} className={s.control} rows={4} resize="vertical"
              onChange={(_, input) => onSaveDraft(handle, { text: input.value, error: '' })} /></Field>
          <Button className={s.back} disabled={Boolean(draft.attempt && !draft.attempt.retryable)} onClick={() => {
            if (!draft.text.trim()) onSaveDraft(handle, { error: 'Enter the text to save.' });
            else onSave(handle, draft.text);
          }}>Save this text</Button>
          <CaptureStatus attempt={draft.attempt} />
        </>}
      </section>}
      {pending.some(item => item.requestHandle !== handle) && <section className={s.stack}>
        <h2 className={s.subheading}>Other current requests</h2>
        {pending.filter(item => item.requestHandle !== handle).map(item => <Button key={item.requestHandle}
          className={s.requestOption} onClick={() => onSelect(item.requestHandle)}>{item.request.prompt}</Button>)}
      </section>}
    </div>;
  }
  return <div className={s.measure}>
    <h1 className={s.title} id={heading} tabIndex={-1}>Needs you</h1>
    {uncertain && <Notice intent="warning" title={unavailable ? 'Current request coverage unavailable' : 'Some request coverage is unavailable'}>
      {feed.coverage.reason} Recorded work remains available in Overview.
    </Notice>}
    {pending.length ? <section className={s.stack} aria-labelledby={heading}>
      <p className={s.prose}>Choose the request you want to answer. Other contexts remain available.</p>
      {pending.map(item => <Button key={item.requestHandle} className={s.requestOption} data-request-option={item.requestHandle}
        onClick={() => onSelect(item.requestHandle)}>
        <span className={s.tight}><Text weight="semibold">{item.request.prompt}</Text>
          <Text className={s.eyebrow}>{CLASSES[item.request.class]} · {item.request.owner} · {scopeLabel(item.request.scope)}</Text></span>
      </Button>)}
    </section> : <section className={s.stack}>
      <h2 className={s.subheading}>{uncertain ? 'No current requests can be confirmed' : 'No current requests from the joined owner'}</h2>
      <p className={s.prose}>{uncertain ? 'Missing coverage is not an empty inbox.'
        : 'No admitted request is waiting in this provider. Captured work items and source-backed dispositions remain in Overview.'}</p>
      <Button className={s.back} onClick={onNew}>New work item</Button>
    </section>}
  </div>;
}

function SettingsStub() {
  const s = useCanvasStyles();
  return <div className={s.measure}><h1 className={s.title} tabIndex={-1}>Settings</h1>
    <MockNote>Settings is unchanged by 067 and isn’t reproduced here. Its approved design is the 085 mock,
      .dude/specs/085-dude-canvas-app-theme/design/app-theme.html. To see this proposal in the app-following theme, use Appearance in the mock strip.</MockNote>
  </div>;
}

/* ------------------------------------------------------------------ Rail (unchanged from app.jsx apart from the label) */

function ActivityRail({ tab, onNavigate, onExpand }) {
  const s = useCanvasStyles(), id = useId();
  const [expanded, setExpanded] = useState(false);
  const [narrow, setNarrow] = useState(() => !window.matchMedia('(min-width: 720px)').matches);
  const toggle = useRef(null), layer = useRef(null), pane = useRef(null), returnFocus = useRef(false);
  const modal = narrow && expanded;
  const dismiss = useCallback(destination => {
    setExpanded(false);
    if (destination) onNavigate(destination);
    else returnFocus.current = true;
  }, [onNavigate]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 720px)');
    const change = () => {
      if (expanded) dismiss();
      setNarrow(!media.matches);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [expanded, dismiss]);
  useLayoutEffect(() => {
    if (!modal) return;
    const previous = new Map();
    const coverBackground = () => {
      for (let node = layer.current; node && node !== document.body; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
          if (sibling !== node && !previous.has(sibling)) {
            previous.set(sibling, sibling.inert);
            sibling.inert = true;
          }
        }
      }
    };
    coverBackground();
    const observer = new MutationObserver(coverBackground);
    observer.observe(document.body, { childList: true, subtree: true });
    pane.current.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      for (const [node, inert] of previous) node.inert = inert;
    };
  }, [modal]);
  useLayoutEffect(() => {
    if (!expanded && returnFocus.current) {
      returnFocus.current = false;
      toggle.current?.focus({ preventScroll: true });
    }
  }, [expanded, narrow]);
  const destination = ([value, label]) => {
    const Icon = TAB_ICONS[value];
    return <Tab key={value} value={value} id={`dude-tab-${value}`} icon={<Icon />}
      className={mergeClasses(s.railTab, expanded && s.railTabExpanded)}
      aria-label={label} title={label} aria-current={tab === value ? 'page' : undefined}
      aria-controls={`dude-panel-${value}`}>
      <span className={expanded ? s.railLabel : s.visuallyHidden}>{label}</span>
    </Tab>;
  };
  return <nav className={mergeClasses(s.rail, expanded && !narrow && s.railExpanded)}
    aria-label="Workspace navigation" data-navigation-pane>
    <Button ref={toggle} className={s.railToggle} appearance="subtle" icon={<NavigationRegular />}
      aria-label={expanded ? 'Collapse navigation pane' : 'Expand navigation pane'}
      title={expanded ? 'Collapse navigation pane' : 'Expand navigation pane'}
      aria-expanded={expanded} aria-controls={id} onClick={() => {
        if (expanded) dismiss();
        else { onExpand(); setExpanded(true); }
      }} />
    <div ref={layer} className={modal ? s.navLayer : s.railContents} onKeyDownCapture={event => {
      if (!modal) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); dismiss();
      } else if (event.key === 'Tab') {
        const stops = [...pane.current.querySelectorAll('button:not(:disabled)')].filter(node => node.getClientRects().length);
        const index = stops.indexOf(document.activeElement);
        const next = (index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
        event.preventDefault(); event.stopPropagation(); stops[next]?.focus({ preventScroll: true });
      }
    }}>
      {modal && <div className={s.navDimmer} data-navigation-dimmer aria-hidden="true" onClick={() => dismiss()} />}
      <div ref={pane} id={id} className={modal ? s.navOverlay : s.railContents}
        role={modal ? 'dialog' : undefined} aria-modal={modal ? true : undefined}
        aria-label={modal ? 'Workspace navigation' : undefined} data-navigation-dialog={modal ? '' : undefined}>
        {modal && <div className={s.navHeading}><Text weight="semibold">Navigation</Text>
          <Button appearance="subtle" icon={<DismissRegular />} aria-label="Close navigation pane" onClick={() => dismiss()} />
        </div>}
        <TabList className={s.railList} aria-label="Workspace views" vertical
          size="small" selectedValue={tab} selectTabOnFocus={false}
          onTabSelect={(_, input) => (modal ? dismiss(input.value) : onNavigate(input.value))}>
          <div className={s.railDestinations}>{TABS.slice(0, -1).map(destination)}</div>
          <div className={s.railFooter}>{destination(TABS.at(-1))}</div>
        </TabList>
      </div>
    </div>
  </nav>;
}

/* ------------------------------------------------------------------ Mock strip (outside product chrome) */

const SCENARIOS = FIXTURES.scenarios;
const DATA_LABELS = { fixtures: 'Acceptance fixtures (901 to 913)', repository: 'This repository (read-only snapshot)', blank: 'Blank workspace (fixture)' };
const NEXT_LABELS = { saved: 'Saved as chosen', kept: 'Matched 901, existing values kept', missing: 'Saved, domain not recorded',
  uncertain: 'Delivery uncertain', refused: 'Refused as invalid input' };
const PARAMS = new URLSearchParams(window.location.search);
const APPEARANCE = PARAMS.get('appearance') === 'app' ? 'app' : 'ordinary';

function provenance(mock, record, tab) {
  if (tab === 'new') return 'New work item: the draft, choices, and every status are local fixture states (source/fixtures.json, capture presets). Nothing is sent.';
  if (tab === 'context' && record) {
    return record.origin === 'fixture'
      ? `Showing fixture ${record.id} (${record.number}), traced to: ${record.trace.join('; ')}. Every value on this record is fixture data.`
      : `Showing repository record ${record.number} from source/repository-snapshot.json, read ${SNAPSHOT.workspace.readAt} with projection.mjs.`
        + ' No ledger records an intent or domain, so both read Not set.';
  }
  if (mock.data === 'repository') return `This repository: ${SNAPSHOT.records.length} records read ${SNAPSHOT.workspace.readAt} with the product's own readers. No ledger records an intent or domain.`;
  if (mock.data === 'blank') return 'Blank fixture workspace with no records.';
  return 'Fixture workspace: 13 acceptance fixtures numbered 901 to 913, each traced in source/fixtures.json. None is a record of this repository.';
}

function MockStrip({ mock, scenario, record, tab, onScenario, onMock, onCapturePreset, onTone, stripRef }) {
  const select = (label, value, options, onChange, name) => <label className="mock-field">{label}
    <select value={value} data-mock-control={name} onChange={event => onChange(event.target.value)}>
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select></label>;
  const reload = changes => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    params.set('scenario', mock.scenario);
    window.location.search = params.toString();
  };
  return <div id="mock-strip" ref={stripRef} role="region" aria-label="Mock controls, not part of Canvas" data-hidden={mock.hidden ? '' : undefined}>
    <div className="mock-head">
      <strong>Mock controls</strong>
      <span>Not part of Canvas · 067 round 1, exploring, not approved · {mock.hidden ? `${mock.scenario} · ${DATA_LABELS[mock.data]}` : 'Values are fixtures or a read-only repository snapshot'}</span>
      <button type="button" data-mock-control="toggle" onClick={() => onMock({ hidden: !mock.hidden })}>{mock.hidden ? 'Show controls' : 'Hide controls'}</button>
    </div>
    {!mock.hidden && <>
      <div className="mock-row">
        {select('Scenario', mock.scenario, SCENARIOS.map(item => [item.id, item.label]), onScenario, 'scenario')}
        {select('Data', mock.data, Object.entries(DATA_LABELS), data => onMock({ data }), 'data')}
        {select('Request feed', mock.feed, Object.entries(FIXTURES.feeds).map(([key, feed]) => [key, feed.label]), feed => onMock({ feed }), 'feed')}
        {select('Capture state', mock.capturePreset, Object.entries(CAPTURE_PRESETS).map(([key, preset]) => [key, preset.label]), onCapturePreset, 'capture')}
        {select('Next capture result', mock.next, Object.entries(NEXT_LABELS), next => onMock({ next }), 'next')}
        {select('Appearance', APPEARANCE, [['ordinary', 'Ordinary Fluent'], ['app', 'Follow GitHub app (085 observed)']],
          appearance => reload({ appearance, tone: mock.tone }), 'appearance')}
        {select('Tone', mock.tone, [['light', 'Light'], ['dark', 'Dark']], onTone, 'tone')}
      </div>
      <p className="mock-note">{scenario?.note ? `${scenario.note} ` : ''}{provenance(mock, record, tab)}</p>
    </>}
    {mock.log && <p className="mock-log" role="status">{mock.log}</p>}
  </div>;
}

/* ------------------------------------------------------------------ App */

function recordsFor(data, saved) {
  return data === 'fixtures' ? [...FIXTURE_RECORDS, ...saved] : data === 'repository' ? REPOSITORY_RECORDS : [];
}
const toSelection = record => (record ? { ideaPath: record.ideaPath, specPath: record.specPath, title: record.title } : null);

function scenarioState(id) {
  const scenario = SCENARIOS.find(item => item.id === id) ?? SCENARIOS[0];
  const selection = toSelection(recordsFor(scenario.data, []).find(record => record.ideaPath === scenario.select));
  const preset = scenario.capture ? CAPTURE_PRESETS[scenario.capture] : null;
  return {
    scenario, data: scenario.data, feed: preset ? preset.feed : scenario.feed ?? 'requests', tab: scenario.view, selection,
    finder: { query: '', scope: scenario.scope || 'open' },
    taskView: { scope: selection?.ideaPath ?? null, taskKey: scenario.task ?? null, filter: 'all' },
    capture: scenario.capture ? captureFromPreset(scenario.capture) : null, capturePreset: scenario.capture ?? null,
    request: scenario.request ?? null,
    saveDrafts: scenario.saveOpen ? { [scenario.request]: { open: true, text: '', attempt: null, error: '' } } : {},
  };
}
function initialTone() {
  const tone = PARAMS.get('tone');
  return tone === 'light' || tone === 'dark' ? tone : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
// App-following fixture: the GitHub app's documented variables as 085 observed them.
function applyHostVars(tone) {
  const root = document.documentElement;
  root.setAttribute('data-theme-tone', tone);
  root.setAttribute('data-theme-source', 'github-app-fixture');
  let style = document.getElementById('mock-host-vars');
  if (!style) { style = document.createElement('style'); style.id = 'mock-host-vars'; document.head.append(style); }
  style.textContent = `:root{${Object.entries(FIXTURES.hostAppearance[`app-${tone}`]).map(([key, value]) => `${key}:${value}`).join(';')}}`;
}

function App() {
  const s = useCanvasStyles(), m = useMockStyles(), { theme } = useCanvasTheme();
  const first = useMemo(() => scenarioState(PARAMS.get('scenario') || 'M1'), []);
  const [mock, setMock] = useState(() => ({
    scenario: first.scenario.id, data: first.data, feed: PARAMS.get('feed') || first.feed, next: PARAMS.get('next') || 'saved',
    hidden: PARAMS.get('controls') === 'hide', tone: initialTone(), capturePreset: first.capturePreset || 'default', log: '',
  }));
  const [tab, setTab] = useState(PARAMS.get('view') || first.tab);
  const [selection, setSelection] = useState(first.selection);
  const [finder, setFinder] = useState(first.finder);
  const [taskView, setTaskView] = useState(first.taskView);
  const [capture, setCapture] = useState(() => first.capture ?? captureFromPreset('default'));
  const [saved, setSaved] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(first.request);
  const [saveDrafts, setSaveDrafts] = useState(first.saveDrafts);
  const [finderOpen, setFinderOpen] = useState(false);
  const [compactCommands, setCompactCommands] = useState(() => window.matchMedia('(max-width: 479px)').matches);
  const main = useRef(null), focusNext = useRef(null), scroll = useRef(0), position = useRef(null), strip = useRef(null);
  const search = useRef(null), selector = useRef(null), results = useRef(null), finderDismissed = useRef(false), focusResults = useRef(false);
  const timers = useRef([]), resultsId = useId();
  const records = recordsFor(mock.data, saved);
  const rows = rowsFor(records);
  const feed = buildFeed(mock.feed, mock.data);
  const selectedRow = rows.find(row => sameRecord(row.record, selection));
  const scopedTasks = taskView.scope === (selection?.ideaPath ?? null) ? taskView : { scope: selection?.ideaPath ?? null, taskKey: null, filter: 'all' };
  const overviewActive = tab === 'overview';
  const popupOpen = !compactCommands && !selection && !overviewActive && finderOpen;
  const scenario = SCENARIOS.find(item => item.id === mock.scenario);
  const log = useCallback(text => setMock(previous => ({ ...previous, log: text })), []);
  const later = (ms, run) => { timers.current.push(setTimeout(run, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);
  useLayoutEffect(() => {
    const node = strip.current;
    const measure = () => document.documentElement.style.setProperty('--mock-strip-h', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 479px)');
    const change = () => { setCompactCommands(media.matches); setFinderOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    const destination = focusNext.current;
    if (!destination) return;
    focusNext.current = null;
    const panel = main.current?.querySelector('[role="tabpanel"]:not([hidden])');
    const node = destination === 'search' ? search.current : destination === 'idea' ? panel?.querySelector('textarea')
      : destination === 'row' && selection ? panel?.querySelector(`[data-work-path="${CSS.escape(selection.ideaPath)}"]`) || panel?.querySelector('h1')
        : panel?.querySelector('h1');
    if (node) {
      if (node.tagName === 'H1') node.tabIndex = -1;
      node.focus({ preventScroll: true });
    }
  }, [tab, selection, selectedRequest]);
  const navigate = useCallback((destination, focus = destination === 'new' ? 'idea' : 'heading') => {
    setFinderOpen(false); focusResults.current = false;
    focusNext.current = focus; setTab(destination);
  }, []);
  const closeFinder = useCallback(() => { focusResults.current = false; setFinderOpen(false); }, []);
  const showFinder = () => { focusNext.current = null; finderDismissed.current = false; setFinderOpen(true); };
  const focusWorkResult = () => {
    const nodes = [...(results.current?.querySelectorAll('[data-work-path]') || [])];
    const node = nodes.find(item => item.getAttribute('data-work-path') === position.current?.ideaPath) || nodes[0];
    if (node) { node.focus(); focusResults.current = false; }
  };
  useLayoutEffect(() => { if (focusResults.current) focusWorkResult(); }, [popupOpen, rows.length]);
  useEffect(() => {
    if (!popupOpen) return;
    const outside = event => { if (!selector.current?.contains(event.target)) closeFinder(); };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); finderDismissed.current = true;
      closeFinder(); search.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    const current = selector.current;
    current?.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); current?.removeEventListener('keydown', escape); };
  }, [popupOpen, closeFinder]);

  const applyScenario = id => {
    clearTimers();
    const next = scenarioState(id);
    setMock(previous => ({ ...previous, scenario: next.scenario.id, data: next.data, feed: next.feed,
      capturePreset: next.capturePreset ?? previous.capturePreset, log: '' }));
    setSelection(next.selection); setFinder(next.finder); setTaskView(next.taskView);
    if (next.capture) setCapture(next.capture);
    setSelectedRequest(next.request); setSaveDrafts(next.saveDrafts); setSaved([]);
    scroll.current = 0; position.current = null;
    navigate(next.tab, null);
  };
  const changeMock = change => {
    if (change.data && change.data !== mock.data) {
      setSelection(null); setFinder({ query: '', scope: 'all' }); setSaved([]); setSelectedRequest(null);
      navigate('overview', null);
    }
    setMock(previous => ({ ...previous, ...change }));
  };
  const capturePreset = key => {
    clearTimers();
    setCapture(captureFromPreset(key));
    setMock(previous => ({ ...previous, capturePreset: key, feed: CAPTURE_PRESETS[key].feed, log: '' }));
    navigate('new', null);
  };
  const changeTone = tone => {
    window.__mockSetTone?.(tone);
    document.documentElement.dataset.mockTone = tone;
    if (APPEARANCE === 'app') applyHostVars(tone);
    setMock(previous => ({ ...previous, tone }));
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('tone', tone);
      window.history.replaceState(null, '', `?${params}`);
    } catch { /* A sandboxed preview may refuse URL updates; the tone still applies. */ }
  };
  const openWork = record => { setSelection(toSelection(record)); navigate('context'); };
  const clearWork = () => {
    setSelection(null); setFinder({ query: '', scope: 'all' });
    setTaskView({ scope: null, taskKey: null, filter: 'all' });
    scroll.current = 0; position.current = null; focusResults.current = false;
    navigate('overview', 'search');
  };
  const newWork = () => navigate('new', 'idea');
  const respond = requests => { setSelectedRequest(requests.length === 1 ? requests[0].requestHandle : null); navigate('needs'); };
  const review = records => log(`Mock action: Review design opens the existing Review workspace for ${records[0].requestHandle}.`
    + ' Review is unchanged by 067 and isn’t part of this mock, so nothing opened.');
  const refresh = () => log('Mock action: Refresh rereads repository files in Canvas. This mock’s data is fixed, so nothing changed.');
  const submitCapture = continuation => {
    clearTimers();
    const sent = { text: capture.text, intent: capture.intent, domain: capture.domain };
    const outcome = mock.next, data = mock.data;
    setCapture(previous => ({ ...previous, attempt: { phase: 'responding', ...sent, retryable: false, result: null } }));
    log(`Fixture transition: ${continuation === 'brainstorm' ? 'Submit' : 'Save'} handed this draft to a simulated owner.`
      + ` Next result: ${NEXT_LABELS[outcome]}. Nothing left this page.`);
    later(700, () => setCapture(previous => ({ ...previous, attempt: { ...previous.attempt, phase: 'sending' } })));
    later(1700, () => {
      if (outcome === 'uncertain' || outcome === 'refused') {
        setCapture(previous => ({ ...previous, attempt: { ...previous.attempt, phase: outcome, retryable: outcome === 'refused' } }));
        return;
      }
      const result = savedResult(outcome, sent.text, sent.intent, sent.domain);
      setCapture(previous => ({ ...previous, attempt: { ...previous.attempt, phase: 'saved', result } }));
      if (!result.matched && data === 'fixtures') {
        const record = fixtureRecord({ id: 'F14 (captured in this tab)', trace: ['spec M12: a capture saved in this tab'],
          ideaPath: result.ideaPath, specPath: null, title: result.title, slug: result.slug, status: 'draft',
          workIntent: result.recorded.workIntent, workDomain: result.recorded.workDomain, lane: 'definition',
          group: 'awaiting-definition', design: null, intentText: sent.text, unansweredQuestions: 0, tasks: null,
          activity: [{ date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), text: 'Captured from Canvas (fixture).' }] },
        FIXTURES.fixtureWorkspace.readAt);
        setSaved(previous => [...previous.filter(item => item.ideaPath !== record.ideaPath), record]);
      }
    });
  };
  const saveFromRequest = (handle, text) => {
    const update = change => setSaveDrafts(previous => ({ ...previous, [handle]: { ...previous[handle], ...change(previous[handle]) } }));
    update(() => ({ attempt: { phase: 'responding', text, retryable: false, result: null } }));
    log('Fixture transition: Save this text handed the text to a simulated owner. Nothing left this page.');
    later(700, () => update(previous => ({ attempt: { ...previous.attempt, phase: 'sending' } })));
    later(1700, () => update(previous => ({ attempt: { ...previous.attempt, phase: 'saved', result: {
      ideaPath: `.dude/ideas/${FIXTURES.capture.newRecordNumber}-${slugFrom(text)}.md`, number: FIXTURES.capture.newRecordNumber,
      title: titleFrom(text), matched: false, recorded: { workIntent: NOT_SET, workDomain: NOT_SET }, kept: [], missing: [] } } })));
  };
  const readAt = mock.data === 'repository' ? SNAPSHOT.workspace.readAt : FIXTURES.fixtureWorkspace.readAt;
  const finderControl = <WorkFinder selection={selection} row={selectedRow} finder={finder}
    onFinder={value => { scroll.current = 0; position.current = null; focusResults.current = false; setFinder(value); }}
    onClear={clearWork} search={search} onFocus={() => { if (!finderDismissed.current) showFinder(); }}
    onSearch={showFinder} onKeyDown={event => {
      if (!['ArrowDown', 'Enter'].includes(event.key)) return;
      event.preventDefault(); showFinder(); focusResults.current = true; focusWorkResult();
    }} resultsId={overviewActive || popupOpen ? resultsId : undefined} />;
  return <>
    <MockStrip mock={mock} scenario={scenario} tab={tab} stripRef={strip}
      record={tab === 'context' ? selectedRow?.record : null}
      onScenario={applyScenario} onMock={changeMock} onCapturePreset={capturePreset} onTone={changeTone} />
    <FluentProvider theme={theme}>
      <AriaLiveAnnouncer><div className={mergeClasses(s.page, s.app, m.appInMock)}>
        <header className={s.commands}>
          <div className={s.titlebar}><Text weight="semibold">Dude</Text>
            <Text className={s.workspaceLabel}>{feed.coverage.state === 'unavailable' ? 'Workspace' : 'Joined workspace'}</Text></div>
          <div ref={selector} className={s.selector} data-work-selector>
            {compactCommands ? <Button appearance="subtle" icon={<SearchRegular />} aria-label="Find work"
              title="Find work" className={s.railToggle} onClick={() => navigate('overview', selection ? 'heading' : 'search')} />
              : finderControl}
            {popupOpen && <div className={s.finderPopup}>
              <WorkResults rows={rows} finder={finder} scroll={scroll} position={position} onOpen={openWork}
                resultsRef={results} resultsId={resultsId} />
            </div>}
          </div>
          <Toolbar className={s.refresh} aria-label="Workspace actions"><ToolbarButton className={s.refreshButton}
            icon={<ArrowClockwiseRegular />} aria-label="Refresh" title="Refresh" onClick={refresh}>
            <span className={s.refreshLabel}>Refresh</span>
          </ToolbarButton></Toolbar>
        </header>
        <div className={s.shellBody}>
          <ActivityRail tab={tab} onNavigate={navigate} onExpand={closeFinder} />
          <main ref={main} className={s.product} aria-label="Workspace">
            {TABS.map(([value]) => <div key={value} id={`dude-panel-${value}`} role="tabpanel"
              aria-labelledby={`dude-tab-${value}`} hidden={value !== tab}
              className={mergeClasses(s.detail, value === 'overview' && s.overviewPanel, value === 'needs' && s.needsPanel)}>
              {value !== tab ? null : value === 'overview' ? <Overview data={mock.data} rows={rows} selection={selection}
                finder={finder} scroll={scroll} position={position} onOpen={openWork} onNew={newWork}
                resultsRef={results} resultsId={resultsId} finderControl={compactCommands ? finderControl : null} />
                : value === 'context' ? <Context selection={selection} records={records} feed={feed}
                  taskKey={scopedTasks.taskKey} taskFilter={scopedTasks.filter}
                  onTask={taskKey => setTaskView({ ...scopedTasks, taskKey })}
                  onTaskFilter={filter => {
                    const items = selectedRow?.record.detail.tasks;
                    setTaskView({ ...scopedTasks, filter, taskKey: items?.some(task => task.taskKey === scopedTasks.taskKey
                      && (filter === 'all' || task.state === filter)) ? scopedTasks.taskKey : null });
                  }}
                  onBack={() => navigate('overview', 'row')} onRequest={respond} onReview={review} />
                  : value === 'needs' ? <NeedsYou feed={feed} records={records} selected={selectedRequest}
                    onSelect={handle => { setSelectedRequest(handle); navigate('needs'); }} onNew={newWork}
                    saveDrafts={saveDrafts} onSaveDraft={(handle, change) => setSaveDrafts(previous => ({ ...previous,
                      [handle]: { open: false, text: '', attempt: null, error: '', ...previous[handle], ...change } }))}
                    onSave={saveFromRequest} />
                    : value === 'new' ? <NewWorkItem capture={capture} feed={feed}
                      onChange={change => setCapture(previous => ({ ...previous, ...change }))}
                      onSubmit={submitCapture} onCancel={() => navigate('needs')} />
                      : <SettingsStub />}
            </div>)}
          </main>
        </div>
        <footer className={s.footer} aria-label="Workspace status">
          <span>Work coverage: {mock.data === 'repository' ? SNAPSHOT.workspace.coverage.work : 'current'}</span>
          <span>{feed.coverage.state === 'unavailable' ? 'Current request coverage unavailable'
            : `Current request coverage: ${feed.coverage.state}`}</span>
          <span>Connected</span>
          <span>Source freshness: current</span>
          <span className={s.readTime}>Last complete read <time dateTime={readAt}>
            {new Date(readAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></span>
        </footer>
      </div></AriaLiveAnnouncer>
    </FluentProvider>
  </>;
}

if (APPEARANCE === 'app') applyHostVars(initialTone());
document.documentElement.dataset.mockTone = initialTone();
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

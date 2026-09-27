import React, { StrictMode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AriaLiveAnnouncer, Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader,
  DataGridHeaderCell, DataGridRow, Dropdown, Field, FluentProvider, Input, List, ListItem, Option,
  ProgressBar, Spinner, Tab, TabList, TableCellLayout, Text, Toolbar, ToolbarButton,
} from '@fluentui/react-components';
import {
  AddRegular, ArrowClockwiseRegular, ArrowLeftRegular, CheckmarkRegular, CircleRegular,
  CommentRegular, DismissRegular, GridRegular, NavigationRegular, RecordRegular, SearchRegular, SettingsRegular, WarningRegular,
} from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { darkTheme, lightTheme, useHostAppearance } from './theme.js';
import { currentRequests, matchesRequestScope, NeedsYou, NewIdea, Notice, previewEligibility } from './needs-you.jsx';
import { loadReviewEngine, ReviewHistory, ReviewWorkspace } from './review.jsx';
import { packPermission, requestKey, useCanvasData } from './use-canvas-data.js';
import { Settings } from './settings.jsx';

const TABS = [['overview', 'Overview'], ['context', 'Now'], ['needs', 'Needs you'], ['new', 'New idea'], ['settings', 'Settings']];
const TAB_ICONS = { overview: GridRegular, context: RecordRegular, needs: CommentRegular, new: AddRegular, settings: SettingsRegular };
const SCOPES = [['open', 'Open'], ['closed', 'Closed'], ['all', 'All']];
const GROUPS = {
  active: 'In progress', blocked: 'Blocked', next: 'Next by recorded dependencies',
  'awaiting-definition': 'Awaiting definition', 'defined-awaiting-work': 'Defined',
  'prioritized-later': 'Recorded for later', completed: 'Completed',
};
const DEFAULT_FINDER = { query: '', scope: 'open' };
const TASK_STATES = { todo: 'Pending', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' };
const TASK_FILTERS = [['all', 'All', 'total'], ['todo', 'Pending', 'open'],
  ['in-progress', 'In progress', 'inProgress'], ['blocked', 'Blocked', 'blocked'], ['done', 'Done', 'done']];

function contextTitle(context) { return context.title || 'Title unavailable'; }
// Contexts have already passed inventory admission. The number is presentation
// of that exact path, never a substitute for the idea/spec binding.
function captureNumber(context) { return context.ideaPath?.match(/^\.dude\/ideas\/(\d{3})-/)?.[1] || ''; }
function sameContext(left, right) {
  return Boolean(left && right && left.ideaPath === right.ideaPath && left.specPath === right.specPath);
}
function scopeTitle(scope, rows) {
  const context = rows.find(row => matchesRequestScope(row.context, scope))?.context;
  return context?.title ? `${captureNumber(context)} · ${context.title}` : null;
}
function progressText(row) {
  return row.tasks ? `${row.tasks.done} of ${row.tasks.total} tasks` : 'Progress not established';
}
function rowsFor(data) {
  const contexts = data.index?.contexts || data.projection?.contexts || [];
  const items = !data.issues.index && data.index
    ? new Map(data.index.items.map(item => [item.ideaPath, item])) : new Map();
  return contexts.map(context => {
    const candidate = items.get(context.ideaPath);
    const item = sameContext(context, candidate) && candidate.availability.state === 'current' ? candidate : null;
    return { context, ideaPath: context.ideaPath, number: captureNumber(context), title: contextTitle(context), group: item?.group,
      status: context.status === 'resolved' ? 'Resolved idea' : item ? GROUPS[item.group] || 'Status unavailable' : 'Work status unavailable',
      open: item?.group ? item.group !== 'completed' : null,
      tasks: item?.taskCounts || null, reason: candidate?.availability.reason,
      lane: item?.lane, sources: item?.sources || [] };
  }).sort((a, b) => (a.number ? Number(a.number) : Infinity) - (b.number ? Number(b.number) : Infinity)
    || a.ideaPath.localeCompare(b.ideaPath));
}
function currentOrientation(data, context) {
  const projection = data.projection;
  if (!sameContext(projection?.selected, context) || !projection.complete || data.selecting
    || data.issues.orientation || data.freshness?.state !== 'current') return null;
  // Never combine an old selected instruction with a newer counted task file.
  const row = data.index?.items.find(item => sameContext(item, context));
  if (data.issues.index || (row && row.availability.state !== 'current')) return null;
  if (row?.sources.some(source => !projection.sources.some(candidate => candidate.path === source.path
    && candidate.contentIdentity === source.contentIdentity))) return null;
  if (row?.lane === 'tracked' && !projection.sources.some(source => source.kind === 'tracked'
    && row.sources.some(candidate => candidate.command === source.command && candidate.contentIdentity === source.contentIdentity))) return null;
  // Both readers count canonical visible tasks. Compare when both expose counts;
  // an unavailable count is not a competing zero or a reason to hide definitions.
  if (row?.taskCounts && projection.tasks && ['total', 'open', 'inProgress', 'blocked', 'done']
    .some(key => row.taskCounts[key] !== projection.tasks[key])) return null;
  return projection;
}
function instruction(projection) {
  return nextTaskDetail(projection)?.instruction.text || null;
}
function nextTaskDetail(projection) {
  const source = projection?.next?.source;
  return projection?.taskDetails?.coverage.state === 'available'
    ? projection.taskDetails.items.find(task => source?.kind === 'file'
      ? task.taskKey === source.taskKey && task.source.path === source.path
      : source?.kind === 'tracked' && task.issueId === source.issueId) : null;
}
function taskReadiness(task) {
  if (task.readiness.state === 'ready') return task.readiness.basis === 'recorded-deps'
    ? 'Ready by recorded task dependencies' : 'Ready in the captured Beads ready result';
  if (task.readiness.state === 'waiting') return 'Waiting on dependencies';
  if (task.readiness.state === 'not-exposed') return 'Readiness not exposed by this source';
  return null;
}
function InstructionExtras({ instruction }) {
  const s = useCanvasStyles();
  return Object.entries(instruction.extraText || {}).map(([field, text]) => <div className={s.tight} key={field}>
    <Text weight="semibold">{field === 'acceptance_criteria' ? 'Acceptance criteria' : field === 'design' ? 'Design' : 'Notes'}</Text>
    <p className={s.prose}>{text}</p>
  </div>);
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
      <Text className={s.eyebrow}>Acceptance wording, Done, feature Activity, and design-review history are not task results.
        Any result written inside the unit remains attributed source text, not a verdict from this view.</Text></div>
    <div className={s.tight}><Text weight="semibold">{task.instruction.coverage === 'full-unit' ? 'Recorded unit' : 'Only imported description available'}</Text>
      <p className={s.taskSource} data-task-instruction={task.taskKey} tabIndex={dock ? 0 : undefined}
        role={dock ? 'region' : undefined} aria-label={dock ? `Recorded instruction for ${task.taskKey}, scrollable` : undefined}>
        {task.instruction.text}
      </p>
      <InstructionExtras instruction={task.instruction} />
      <Text className={s.eyebrow}>{task.instruction.coverage === 'full-unit'
        ? 'The complete canonical unit, including blank paragraphs and fenced examples, shown as inert source text.'
        : 'The captured issue does not expose the original full task unit or its phase.'}</Text>
      <Text className={s.code}>{task.source.path || task.source.command}</Text>
      <Text className={s.code}>{task.source.contentIdentity}</Text>
      <Text className={s.eyebrow}>Uses this selected feature’s complete read and source freshness.</Text>
    </div>
  </section>;
}

function WorkName({ row }) {
  const s = useCanvasStyles();
  return <span className={s.workName}><Text className={s.workNumber} data-work-number>{row.number || 'No. unavailable'}</Text>
    <span className={s.tight}><Text weight="semibold">{row.title}</Text>
      <Text className={s.eyebrow}>{row.context.slug}</Text></span></span>;
}
function WorkProgress({ row }) {
  const s = useCanvasStyles();
  return <span className={s.progressCell}><Text>{progressText(row)}</Text>
    {row.tasks?.total > 0 && row.tasks.done < row.tasks.total
      && <ProgressBar value={row.tasks.done} max={row.tasks.total} aria-hidden="true" />}</span>;
}
const COLUMNS = [
  createTableColumn({ columnId: 'name', renderHeaderCell: () => 'Name',
    renderCell: row => <TableCellLayout><WorkName row={row} /></TableCellLayout> }),
  createTableColumn({ columnId: 'status', renderHeaderCell: () => 'Status',
    renderCell: row => <TableCellLayout>{row.status}</TableCellLayout> }),
  createTableColumn({ columnId: 'progress', renderHeaderCell: () => 'Progress',
    renderCell: row => <TableCellLayout><WorkProgress row={row} /></TableCellLayout> }),
];

function WorkFinder({ selection, row, browsing, finder, onFinder, onClear, search, onFocus, onSearch, onKeyDown, resultsId }) {
  const s = useCanvasStyles();
  return selection ? <div className={s.workingOn} role="group" aria-label={browsing ? 'Browsing' : 'Working on'}>
    <div className={s.workingIdentity}>
      <Text className={s.workingCaption}>{browsing ? 'Browsing' : 'Working on'}</Text>
      <span className={s.workName}>
        <Text className={mergeClasses(s.workNumber, s.workingNumber)}>{captureNumber(selection) || 'No. unavailable'}</Text>
        <Text weight="semibold" className={s.workingTitle} title={row?.title || contextTitle(selection)}>
          {row?.title || contextTitle(selection)}
        </Text>
        {!row && <Text className={s.eyebrow}>Source unavailable</Text>}
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
  const visible = rows.filter(row => selection ? sameContext(row.context, selection)
    : (scope === 'all' || row.open === (scope === 'open'))
    && (!query || [row.number, row.context.title, row.context.slug, row.ideaPath, row.context.specPath]
      .some(value => value?.toLocaleLowerCase().includes(query))));
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = selection ? 0 : scroll.current;
  }, [finder.scope, finder.query, selection, scroll, compact, visible.length]);
  const columns = { name: s.columnName, status: s.columnStatus, progress: s.columnProgress };
  const label = row => `${row.number || 'Number unavailable'}. ${row.title}. ${row.status}. ${progressText(row)}. ${row.ideaPath}`;
  const resolved = rows.filter(row => row.open === false && row.context.status === 'resolved').length;
  const completed = rows.filter(row => row.open === false && row.context.kind === 'feature').length;
  return <section ref={size} className={s.workResults} aria-labelledby={id}>
    <h2 id={id} className={s.visuallyHidden}>{selection ? 'Selected work' : 'Recorded work'}</h2>
    {fallback && <Notice title="Showing all records while work status is incomplete">
      Your {finder.scope === 'closed' ? 'Closed' : 'Open'} selection is retained. Unknown records are included so missing progress cannot hide work.
    </Notice>}
    <div className={s.workSummary}>
      <Text className={s.eyebrow} role="status">{selection
        ? visible.length ? `${visible.length} selected record` : 'Selected record unavailable'
        : `${visible.length} of ${rows.length} recorded ideas and features · capture order, oldest first`}</Text>
      {!selection && !!(resolved || completed) && <Text className={s.eyebrow}>Closed records include {completed} completed features and {resolved} resolved ideas.
        Resolved ideas were not necessarily implemented.</Text>}
      <Text className={s.eyebrow}>{selection ? 'Open this row, or focus it and press Enter, to return to Now for this record.'
        : 'Choose a row, or focus it and press Enter, to open that exact record in Now.'}</Text>
    </div>
    <div ref={node => { list.current = node; if (resultsRef) resultsRef.current = node; }}
      id={resultsId} className={s.workScroll} data-work-scroll
      onFocusCapture={event => {
        if (!selection) {
          const path = event.target.closest('[data-work-path]')?.getAttribute('data-work-path');
          if (path) position.current = visible.find(row => row.ideaPath === path)?.context || null;
        }
      }}
      onScroll={event => { if (!selection) scroll.current = event.currentTarget.scrollTop; }}>
      {!visible.length && selection ? <div className={s.empty}>
        <h2 className={s.subheading}>{captureNumber(selection)} {contextTitle(selection)}</h2>
        <Text className={s.code}>{selection.ideaPath}{selection.specPath ? `\n${selection.specPath}` : ''}</Text>
        <Notice intent="warning" title="The selected source is unavailable">
          Its exact identity is retained. No other record has been selected. Clear returns to discovery without closing or deleting work.
        </Notice>
      </div> : !visible.length ? <div className={s.empty}><Text weight="semibold">No matching work</Text>
        <Text>Change the search or Show selection. Nothing has been removed.</Text></div>
        : compact ? <List navigationMode="items" aria-label="Recorded work">
          {visible.map(row => <ListItem key={row.ideaPath} className={mergeClasses(s.workItem, selection && s.workSelected)} data-work-path={row.ideaPath}
            aria-label={label(row)} aria-current={selection ? 'true' : undefined} onAction={() => onOpen(row.context)}>
            <span className={s.workItemText}><WorkName row={row} />
              <Text className={s.eyebrow}>{row.status} · {progressText(row)}</Text></span>
          </ListItem>)}
        </List> : <DataGrid items={visible} columns={COLUMNS} getRowId={row => row.ideaPath}
          focusMode="composite" aria-label="Recorded work">
          <DataGridHeader className={s.workHeader}><DataGridRow>
            {({ columnId, renderHeaderCell }) => <DataGridHeaderCell focusMode="none"
              className={mergeClasses(s.workCell, columns[columnId])}>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow></DataGridHeader>
          <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId} className={mergeClasses(s.workRow, selection && s.workSelected)}
            data-work-path={item.ideaPath} aria-label={label(item)} aria-current={selection ? 'true' : undefined}
            onClick={() => onOpen(item.context)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
              event.preventDefault(); onOpen(item.context);
            }}>
            {({ columnId, renderCell }) => <DataGridCell focusMode="none" className={mergeClasses(s.workCell, columns[columnId])}>
              <div className={s.cellLayout}>{renderCell(item)}</div>
            </DataGridCell>}
          </DataGridRow>}</DataGridBody>
        </DataGrid>}
    </div>
  </section>;
}

function ReviewEntry({ context, data, onReview }) {
  const s = useCanvasStyles(), eligible = previewEligibility(context, data);
  return eligible.records.length
    ? <Button className={s.back} appearance="primary" icon={<CommentRegular />}
      data-review-entry={eligible.records.length === 1 ? eligible.records[0].requestHandle : 'choices'}
      onClick={() => onReview(eligible.records)}>Review design{eligible.records.length > 1 ? ' requests' : ''}</Button>
    : <Text className={s.eyebrow}>{eligible.reason}</Text>;
}

function Overview({ data, rows, selection, finder, scroll, position, onOpen, onNew, resultsRef, resultsId, finderControl }) {
  const s = useCanvasStyles();
  const inventory = data.index?.coverage.inventory || data.projection?.coverage.inventory;
  const blank = data.index?.workspace === 'blank' && inventory?.state === 'current' && !rows.length;
  return <div className={s.overview}>
    <header className={s.overviewHeader}><div className={s.between}>
      <h1 className={s.title} tabIndex={-1}>Overview</h1>
      <Button icon={<AddRegular />} onClick={onNew}>New idea</Button>
    </div><p className={s.overviewIntro}>{selection
      ? 'Filtered to the work you are on. Use Clear in the work selector to find different work. Nothing is closed or discarded.'
      : 'Nothing is selected. Numbers show capture chronology, not priority, dependencies, or execution order.'}</p>
      {finderControl}</header>
    {selection ? <WorkResults rows={rows} selection={selection} finder={finder} scroll={scroll} position={position}
      onOpen={onOpen} resultsRef={resultsRef} resultsId={resultsId} />
      : data.loading ? <Spinner label="Reading repository state" /> : blank ? <section className={s.empty}>
      <h2 className={s.subheading}>Welcome to Dude</h2>
      <p className={s.lead}>Describe what you want to make. The coordinator can capture it as a draft idea without a spec or task board.</p>
      <Button className={s.back} appearance="primary" onClick={onNew}>Write a new idea</Button>
    </section> : !rows.length ? <Notice intent="warning" title="Workspace inventory is unavailable">
      This is not a confirmed blank workspace. No all-clear or missing-feature guess has been made.
    </Notice> : <>
      {(data.issues.index || inventory?.state !== 'current' || data.index?.coverage.work.state !== 'current')
        && <Notice intent="warning" title="Some recorded work could not be confirmed">
          {data.issues.index || 'Readable records remain available. Missing sources have no invented progress or closed-work status.'}
        </Notice>}
      <WorkResults rows={rows} finder={finder} scroll={scroll} position={position}
        onOpen={onOpen} resultsRef={resultsRef} resultsId={resultsId} />
    </>}
  </div>;
}

function Context({ selection, data, rows, orientation, taskKey, taskFilter, onTask, onTaskFilter, onBack, onRequest, onReview, onHistory, onHistoryReady }) {
  const s = useCanvasStyles(), id = useId();
  const row = rows.find(row => sameContext(row.context, selection));
  const context = row?.context;
  const requests = currentRequests(context, data);
  const [historyResult, setHistoryResult] = useState(null);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1080px)').matches);
  const taskRows = useRef(new Map()), detail = useRef(null), focusDetail = useRef(false);
  const items = orientation?.taskDetails?.coverage.state === 'available' ? orientation.taskDetails.items : null;
  const inspected = items?.find(task => task.taskKey === taskKey && (taskFilter === 'all' || taskFilter === task.state));
  const next = nextTaskDetail(orientation);
  const groups = [];
  for (const task of items || []) {
    const heading = task.phase?.heading || (task.source.kind === 'tracked' ? 'Phase not exposed' : 'Work');
    let group = groups.find(group => group.heading === heading);
    if (!group) { group = { heading, tasks: [], counts: orientation.phases[task.phase?.order ?? 0] || orientation.tasks }; groups.push(group); }
    group.tasks.push(task);
  }
  const openTask = key => { focusDetail.current = true; onTask(key); };
  const closeTask = () => {
    onTask(null);
    taskRows.current.get(inspected.taskKey)?.focus({ preventScroll: true });
  };
  const inspector = inspected && <TaskDetail task={inspected} items={items} dock={wide}
    detailRef={detail} id={`${id}-detail`} onClose={closeTask} />;
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
  const canReadHistory = Boolean(context?.specPath && context.coverage.state !== 'unavailable');
  const history = canReadHistory && sameContext(historyResult?.scope, context) ? historyResult : null;
  useLayoutEffect(() => {
    if (!canReadHistory || history) onHistoryReady();
  }, [canReadHistory, history, onHistoryReady]);
  useEffect(() => {
    // Keep same-owner choices mounted while a background reread is pending.
    if (!canReadHistory) { setHistoryResult(null); return; }
    const controller = new AbortController();
    const scope = { kind: 'feature', ideaPath: context.ideaPath, specPath: context.specPath };
    data.readHistory(scope, null, controller.signal)
      .then(value => { if (!controller.signal.aborted) setHistoryResult(value); })
      .catch(error => { if (!controller.signal.aborted) setHistoryResult({ scope, error: error.message }); });
    return () => controller.abort();
  }, [context?.ideaPath, context?.specPath, canReadHistory, data.index?.readAt, data.readHistory]);
  return <div className={s.contextView} data-history-loading={canReadHistory && !history ? '' : undefined}>
    <Button className={s.back} icon={<ArrowLeftRegular />} onClick={onBack}>Back to Overview</Button>
    {!selection ? <>
      <h1 className={s.title} tabIndex={-1}>No record is selected</h1>
      <p className={s.lead}>Use Search work in the command bar or choose a row in Overview to open its Now view.</p>
    </> : !context ? <>
      <h1 className={s.title} tabIndex={-1}>{captureNumber(selection)} {contextTitle(selection)}</h1>
      <Text className={s.code}>{selection.ideaPath}</Text>
      <Notice intent="warning" title="The selected source is unavailable">
        Its exact identity is retained. No other record has been selected and no previous feature's instruction is shown here.
      </Notice>
    </> : <div className={s.contextGrid}>
      <div className={s.contextMain}>
        <header className={s.objectHeader}>
          <div className={s.detailHeader}>
            <Text className={s.eyebrow}>{context.kind === 'feature' ? 'Defined feature' : context.status === 'resolved' ? 'Resolved idea' : 'Draft idea'}</Text>
            <h1 className={s.objectTitle} tabIndex={-1}><span className={s.workNumber}>{captureNumber(context)}</span>{' '}
              <span>{contextTitle(context)}</span></h1>
            <Text className={s.code}>{context.specPath || context.ideaPath}</Text>
          </div>
          <div className={s.tight}><Text weight="semibold">{orientation?.stage || 'Current work unavailable'}</Text>
            {!!requests.length && <Button className={s.back} icon={<CommentRegular />}
              data-request-entry={requests.length === 1 ? requests[0].requestHandle : 'choices'}
              onClick={() => onRequest(context)}>
              {requests.length === 1 ? 'Respond to request' : `Choose request (${requests.length})`}
            </Button>}
            <ReviewEntry context={context} data={data} onReview={onReview} /></div>
        </header>
        <section className={s.nextRegion} data-now-next aria-labelledby={`${id}-next`}>
          <h2 id={`${id}-next`} className={s.subheading}>{orientation?.next ? 'Next step' : orientation ? 'No next step' : 'Next step unavailable'}</h2>
          {data.selecting ? <Spinner label="Reading this exact context" /> : !orientation
            ? <Notice title="Current instruction unavailable" intent="warning">
              {data.issues.orientation || 'The selected read and work index could not be confirmed together, including source identities and task counts. Task progress and detail are withheld. Refresh to reread.'}
            </Notice> : orientation.next ? <>
              <p className={s.lead}>{orientation.next.description}</p>
              {instruction(orientation) ? <div className={s.tight}>
                <h3 className={s.taskLabel}>Current task instruction</h3>
                <Text className={s.eyebrow}>{next.instruction.coverage === 'full-unit' ? 'Full canonical unit' : 'Only imported description available'}</Text>
                <p className={s.instruction}>{instruction(orientation)}</p>
                <InstructionExtras instruction={next.instruction} />
                <Text className={s.code}>{next.taskKey} · {next.source.path || next.source.command}</Text>
              </div> : <Text className={s.eyebrow}>Full instruction unavailable. {orientation.taskDetails?.coverage.reason}</Text>}
            </> : <p className={s.prose}>{orientation.nextReason || 'No next execution step is established.'}</p>}
          {orientation?.authority === 'definition' && items?.length > 0 && <Text className={s.eyebrow}>
            Planned task definitions; execution has not started. Readiness by recorded dependencies is not Work admission or approval.
          </Text>}
        </section>
        {!!orientation?.blockers.length && <section className={s.contextSection}><h2 className={s.subheading}>Recorded blockers</h2>
          {orientation.blockers.map((blocker, index) => <div className={s.tight} key={index}>
            <p className={s.prose}>{blocker.reason}</p>
            <Text className={s.code}>{blocker.source.path || 'Tracked board'} · {blocker.source.taskKey || blocker.source.issueId}</Text>
          </div>)}
          <Text className={s.eyebrow}>These are recorded work blockers. Only a current owner-qualified request belongs in Needs you.</Text>
        </section>}
        <section className={s.contextSection} aria-labelledby={`${id}-lifecycle`}>
          <h2 id={`${id}-lifecycle`} className={s.subheading}>Lifecycle and progress</h2>
          <div className={s.between}><Text>{orientation?.stage || 'Stage unavailable'}</Text>
            <Text>{progressText({ tasks: orientation?.tasks })}</Text></div>
          {orientation?.tasks?.total > 0 && <ProgressBar value={orientation.tasks.done} max={orientation.tasks.total}
            aria-label={`${orientation.tasks.done} of ${orientation.tasks.total} recorded tasks done`} />}
          {orientation?.tasks && <Text className={s.eyebrow}>{orientation.tasks.open} pending · {orientation.tasks.inProgress} in progress
            {' · '}{orientation.tasks.blocked} blocked · {orientation.tasks.done} done</Text>}
          <Text className={s.eyebrow}>{orientation?.authority === 'tracked' ? 'Recorded in the authoritative tracked board.'
            : orientation?.authority === 'lightweight' ? 'Recorded canonical task work.' : 'Definition and captured intent.'}
            {' '}Recorded lifecycle and task states do not establish live-agent activity or task verification results.</Text>
          {context.status === 'resolved' && <Text className={s.prose}>This idea is resolved in the source. Resolution does not mean it was implemented.</Text>}
          {orientation?.tasks?.total > 0 && orientation.tasks.done === orientation.tasks.total
            && <Text>All recorded tasks are complete in the authoritative lane. No further task is invented.</Text>}
          {orientation?.tasks && !items && <Text className={s.eyebrow}>Source totals only; task detail cannot enumerate these totals.</Text>}
        </section>
        <section className={s.contextSection} aria-labelledby={`${id}-tasks`}>
          <div className={s.between}><h2 id={`${id}-tasks`} className={s.subheading}>Tasks</h2><Text className={s.eyebrow}>Read only</Text></div>
          {items ? <>
            <div className={s.taskFilters} role="group" aria-label="Filter tasks by recorded status">
              {TASK_FILTERS.map(([value, label, count]) => <Button key={value} size="small"
                appearance={taskFilter === value ? 'primary' : 'secondary'} aria-pressed={taskFilter === value}
                data-task-filter={value} onClick={event => {
                  event.currentTarget.focus({ preventScroll: true }); onTaskFilter(value);
                }}>{label} <span className={s.taskCount}>{orientation.tasks[count]}</span></Button>)}
            </div>
            <Text className={s.eyebrow}>Recorded states, not live-agent activity. Filters affect only task rows; phase totals and Next stay unchanged.</Text>
            {!items.length && <Text>No canonical tasks are recorded in this source.</Text>}
            {groups.map(group => {
              const visible = group.tasks.filter(task => taskFilter === 'all' || task.state === taskFilter);
              return <section className={s.taskPhase} key={group.heading} aria-label={group.heading} data-task-phase={group.heading}>
                <div className={s.between}><h3 className={s.taskLabel}>{group.heading}</h3>
                  <Text className={s.eyebrow}>{group.counts.done} of {group.counts.total} tasks complete</Text></div>
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
                      <span className={s.taskMark}><Icon /></span>
                      <span className={s.tight}><Text className={s.taskTitle}>{task.title || 'Title not exposed by this source'}</Text>
                        <span className={s.row}><Text weight="semibold">{TASK_STATES[task.state]}</Text>
                          <Text className={s.code}>{task.taskKey}</Text>{selected && <Text className={s.taskChip}>Inspecting</Text>}</span>
                        {taskReadiness(task) && <Text className={s.eyebrow}>{taskReadiness(task)}</Text>}
                      </span>
                    </Button>{!wide && selected && inspector}</li>;
                  })}</ul>}
              </section>;
            })}
          </> : <Text className={s.prose}>{orientation?.taskDetails?.coverage.reason || 'Task detail unavailable until the selected sources agree.'}</Text>}
        </section>
        <section className={s.contextSection} aria-labelledby={`${id}-activity`}>
          <h2 id={`${id}-activity`} className={s.subheading}>Activity</h2>
          {orientation?.activity?.recent.length ? orientation.activity.recent.map((event, index) => <div className={s.tight} key={index}>
            <Text className={s.eyebrow}>{event.date}</Text><p className={s.prose}>{event.text}</p>
          </div>) : <Text className={s.eyebrow}>No dated feature activity is exposed by this read.</Text>}
          <Text className={s.eyebrow}>Feature activity is separate from task verification and review results.</Text>
        </section>
      </div>
      <aside className={s.contextDock} aria-label="Selected work properties and evidence">
        {wide && inspector}
        <details className={s.propertySection} open><summary>Selected record</summary>
          <div className={s.tight}><Text>{captureNumber(context)} · {contextTitle(context)}</Text>
            <Text>{orientation?.stage || 'Stage unavailable'} · {progressText({ tasks: orientation?.tasks })}</Text>
            <Text className={s.code}>{context.ideaPath}{context.specPath ? `\n${context.specPath}` : ''}</Text>
            <Text className={s.eyebrow}>Open questions: {orientation?.unansweredQuestions ?? 'Not exposed'}. These are not current requests.</Text>
          </div>
        </details>
        <details className={s.propertySection} open><summary>{context.status === 'draft' ? 'What you wanted to do' : 'Captured intent'}</summary>
          <p className={s.prose}>{context.intent?.text || 'The captured intent could not be read.'}</p>
          {context.intent?.truncated && <Text className={s.eyebrow}>Excerpt only. The exact idea ledger holds the original.</Text>}
        </details>
        {!!context.dispositions.length && <details className={s.propertySection}><summary>Recorded owner dispositions</summary>
          <div className={s.stack}>{context.dispositions.map((disposition, index) => <div className={s.scope} key={index}>
            <Text weight="semibold">{disposition.source.section}</Text><p className={s.prose}>{disposition.text}</p>
            <Text className={s.code}>{disposition.source.path}</Text>
            <Text className={s.eyebrow}>Attributed source text, not an inferred current request.{disposition.truncated ? ' Excerpt only.' : ''}</Text>
          </div>)}</div>
        </details>}
        <details className={s.propertySection}><summary>Sources and freshness</summary>
          <div className={s.stack}>{orientation?.sources.filter(source => source.role !== 'discovery').map((source, index) => <div className={s.tight} key={index}>
            <Text weight="semibold">{source.label}</Text><Text className={s.code}>{source.path || source.command || source.paths?.join('\n')}</Text>
            <Text className={s.code}>{source.contentIdentity}</Text>
          </div>)}
            <Text className={s.eyebrow}>{orientation ? `Selected read: ${orientation.readAt}` : 'No agreeing selected read.'}</Text>
            <Text className={s.eyebrow}>Source freshness: {data.selecting ? 'reading selected work' : data.freshness?.state || 'unavailable'}</Text>
          </div>
        </details>
        {history?.error && <Notice intent="warning" title="Review history unavailable">{history.error}</Notice>}
        {history?.coverage?.state === 'partial' && <Notice intent="warning" title="Review history is partial">{history.coverage.reason}</Notice>}
        {!!history?.items?.length && <details className={s.propertySection} open><summary>Review history</summary>
          <div className={s.stack}>{history.items.map(item => <Button className={s.requestOption} key={item.submissionId}
            data-history-entry={item.submissionId}
            onClick={() => onHistory(history.scope, item.submissionId)}>
            <span className={s.tight}><Text>Open sealed feedback · {item.submissionId}</Text>
              <Text className={s.code}>{item.preview.artifact.revision}</Text></span>
          </Button>)}</div>
        </details>}
      </aside>
    </div>}
  </div>;
}

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
    // The narrow pane covers the whole workspace, including Fluent portals.
    // Inert the siblings of its ancestor chain, not just the main work body.
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
        const stops = [...pane.current.querySelectorAll('button:not(:disabled)')]
          .filter(node => node.getClientRects().length);
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
          onTabSelect={(_, input) => modal ? dismiss(input.value) : onNavigate(input.value)}>
          <div className={s.railDestinations}>{TABS.slice(0, -1).map(destination)}</div>
          <div className={s.railFooter}>{destination(TABS.at(-1))}</div>
        </TabList>
      </div>
    </div>
  </nav>;
}

function App() {
  const s = useCanvasStyles(), theme = useHostAppearance();
  const [tab, setTab] = useState('overview'), [selection, setSelection] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null), [finder, setFinder] = useState(DEFAULT_FINDER);
  const [idea, setIdea] = useState(''), [drafts, setDrafts] = useState({});
  const [review, setReview] = useState(null), [reviewActive, setReviewActive] = useState(false);
  const [reviewed, setReviewed] = useState(null), [history, setHistory] = useState(null), [message, setMessage] = useState('');
  const [finderOpen, setFinderOpen] = useState(false);
  const [compactCommands, setCompactCommands] = useState(() => window.matchMedia('(max-width: 479px)').matches);
  const [taskView, setTaskView] = useState({ scope: null, taskKey: null, filter: 'all' });
  const [packReturn, setPackReturn] = useState(null);
  // Settings' local section is tab state, separate from rail navigation: it
  // resets to Packs whenever Settings is left, not when Settings is reselected.
  const [settingsSection, setSettingsSection] = useState('packs');
  const settingsActive = tab === 'settings' && !reviewActive && !history;
  const aboutActive = settingsActive && settingsSection === 'about';
  const data = useCanvasData(selection, { packsActive: settingsActive || Boolean(packReturn) });
  const root = useRef(null), scroll = useRef(0), main = useRef(null), focusNext = useRef(null), opening = useRef(null);
  const reviewReturn = useRef(null), historyRead = useRef(null), latestData = useRef(data);
  const search = useRef(null), selector = useRef(null), results = useRef(null), position = useRef(null);
  const finderDismissed = useRef(false), focusResults = useRef(false), resultsId = useId();
  latestData.current = data;
  const rows = rowsFor(data);
  const selectedRow = rows.find(row => sameContext(row.context, selection));
  const displayedRequest = tab === 'needs' && !reviewActive && !history
    ? data.needs?.requests.find(record => requestKey(data.needs, record) === selectedRequest) : null;
  const displayedScope = history?.record.scope || (reviewActive ? review?.record.request.scope : displayedRequest?.request.scope);
  const browsing = Boolean(selection && displayedScope && !matchesRequestScope(selection, displayedScope));
  const browsingLabel = browsing ? `${captureNumber(selection)} · ${selectedRow?.context.title
    || selection.title || selection.specPath || selection.ideaPath}` : null;
  const taskScope = selection ? JSON.stringify([data.rootKey, selection.ideaPath, selection.specPath]) : null;
  const rootChanged = root.current && data.rootKey && root.current !== data.rootKey;
  const orientation = rootChanged ? null : currentOrientation(data, rows.find(row => sameContext(row.context, selection))?.context);
  const taskItems = orientation?.taskDetails?.coverage.state === 'available' ? orientation.taskDetails.items : null;
  const scopedTasks = taskView.scope === taskScope ? taskView : { scope: taskScope, taskKey: null, filter: 'all' };
  const visibleTask = taskItems?.find(task => task.taskKey === scopedTasks.taskKey
    && (scopedTasks.filter === 'all' || task.state === scopedTasks.filter));
  // Resolve from this render's agreed read, not an effect-delayed task object.
  // An unavailable read hides detail; a confirmed removal also forgets its key.
  if (taskView.scope !== taskScope || (taskItems && scopedTasks.taskKey && !visibleTask)) {
    setTaskView({ ...scopedTasks, taskKey: null });
  }
  const overviewActive = tab === 'overview' && !reviewActive && !history;
  const popupOpen = !compactCommands && !selection && !overviewActive && finderOpen;
  useEffect(() => {
    const media = window.matchMedia('(max-width: 479px)');
    const change = () => { setCompactCommands(media.matches); setFinderOpen(false); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const cancelHistory = useCallback(() => {
    historyRead.current?.abort();
    historyRead.current = null;
  }, []);
  useEffect(() => {
    if (root.current && data.rootKey && root.current !== data.rootKey) {
      cancelHistory();
      opening.current = null;
      setTab('overview'); setSelection(null); setSelectedRequest(null); setFinder(DEFAULT_FINDER);
      setIdea(''); setDrafts({}); setReview(null); setReviewActive(false); setReviewed(null); setHistory(null);
      setMessage('');
      setPackReturn(null);
      setSettingsSection('packs');
      reviewReturn.current = null;
      setFinderOpen(false); position.current = null; focusResults.current = false;
      scroll.current = 0; focusNext.current = 'heading';
    }
    if (data.rootKey) root.current = data.rootKey;
  }, [data.rootKey, cancelHistory]);
  useEffect(() => {
    const cancel = () => { opening.current = null; cancelHistory(); };
    window.addEventListener('pagehide', cancel);
    return () => {
      cancel();
      window.removeEventListener('pagehide', cancel);
    };
  }, [cancelHistory]);
  const rememberReturn = () => {
    const element = document.activeElement;
    return { tab, element, selector: element?.getAttribute('data-review-entry'),
      history: element?.getAttribute('data-history-entry'),
      scroll: main.current?.querySelector('[role="tabpanel"]:not([hidden])')?.scrollTop || 0 };
  };
  const restoreReturnFocus = useCallback(() => {
    const destination = focusNext.current;
    if (destination?.kind !== 'review-return') return;
    const returning = destination.returning;
    const panel = main.current?.querySelector(returning?.fromReview
      ? '[data-review-workspace]' : '[role="tabpanel"]:not([hidden])');
    const usable = node => node?.isConnected && !node.disabled && node.getClientRects().length && !node.closest('[inert]');
    const selector = returning?.selector ? `[data-review-entry="${CSS.escape(returning.selector)}"]`
      : returning?.history ? `[data-history-entry="${CSS.escape(returning.history)}"]` : null;
    const node = usable(returning?.element) ? returning.element
      : selector ? [...document.querySelectorAll(selector)].find(usable) : null;
    const heading = panel?.querySelector('h1');
    // Context's history list is reread after remount. Wait only for that read;
    // a new focus or navigation intent owns the foreground instead.
    if (destination.waiting && document.activeElement !== destination.waiting) {
      focusNext.current = null; return;
    }
    if (!node && returning?.history && panel?.querySelector('[data-history-loading]')) {
      if (heading && !destination.waiting) {
        heading.tabIndex = -1; heading.focus({ preventScroll: true }); destination.waiting = heading;
      }
      return;
    }
    focusNext.current = null;
    if (panel && !returning?.fromReview) panel.scrollTop = returning?.scroll || 0;
    if (node) node.focus({ preventScroll: true });
    else if (heading) { heading.tabIndex = -1; heading.focus(); }
    else document.getElementById(`dude-tab-${returning?.tab || 'needs'}`)?.focus();
  }, []);
  useLayoutEffect(() => {
    const destination = focusNext.current;
    if (!destination || history) return;
    if (destination.kind === 'review-return') {
      const frame = requestAnimationFrame(() => {
        if (focusNext.current === destination) restoreReturnFocus();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (reviewActive) return;
    focusNext.current = null;
    const panel = main.current?.querySelector('[role="tabpanel"]:not([hidden])');
    const node = destination === 'search' ? search.current : destination === 'idea' ? panel?.querySelector('textarea')
      : destination === 'row' && selection ? panel?.querySelector(`[data-work-path="${CSS.escape(selection.ideaPath)}"]`) || panel?.querySelector('h1')
        : panel?.querySelector('h1');
    if (node) { if (node.tagName === 'H1') node.tabIndex = -1; node.focus({ preventScroll: true }); }
  }, [tab, selection, selectedRequest, reviewActive, history, restoreReturnFocus]);
  const navigate = useCallback((destination, focus = destination === 'new' ? 'idea' : 'heading') => {
    cancelHistory();
    opening.current = null;
    // Navigation releases the focused child, never its retained entry object.
    focusResults.current = false;
    setPackReturn(null);
    if (destination !== 'settings') setSettingsSection('packs');
    setHistory(null); setReviewActive(false); setFinderOpen(false); setMessage('');
    focusNext.current = focus; setTab(destination);
  }, [cancelHistory]);
  const closeFinder = useCallback(() => { focusResults.current = false; setFinderOpen(false); }, []);
  const showFinder = () => {
    cancelHistory(); opening.current = null; focusNext.current = null;
    finderDismissed.current = false; setFinderOpen(true);
  };
  const focusWorkResult = () => {
    const nodes = [...(results.current?.querySelectorAll('[data-work-path]') || [])];
    const node = nodes.find(node => node.getAttribute('data-work-path') === position.current?.ideaPath) || nodes[0];
    if (node) { node.focus(); focusResults.current = false; }
  };
  useLayoutEffect(() => {
    if (focusResults.current) focusWorkResult();
  }, [popupOpen, rows.length]);
  useEffect(() => {
    if (!popupOpen) return;
    const outside = event => { if (!selector.current?.contains(event.target)) closeFinder(); };
    const escape = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finderDismissed.current = true;
      closeFinder(); search.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    selector.current?.addEventListener('keydown', escape);
    const current = selector.current;
    return () => {
      document.removeEventListener('pointerdown', outside);
      current?.removeEventListener('keydown', escape);
    };
  }, [popupOpen, closeFinder]);
  const openWork = context => {
    setSelection({ ideaPath: context.ideaPath, specPath: context.specPath, title: context.title });
    navigate('context');
  };
  const clearWork = () => {
    setSelection(null); setFinder({ query: '', scope: 'all' });
    setTaskView({ scope: null, taskKey: null, filter: 'all' });
    scroll.current = 0; position.current = null; focusResults.current = false;
    navigate('overview', 'search');
  };
  const newIdea = () => navigate('new', 'idea');
  const selectRequest = key => {
    setSelectedRequest(key);
    navigate('needs');
  };
  const openPackPermission = receipt => {
    const record = packPermission(latestData.current, receipt);
    if (!record) {
      setMessage('This pack permission is no longer current. Nothing was sent. Read the current request before responding.');
      data.reconcile();
      return;
    }
    const key = requestKey(latestData.current.needs, record);
    navigate('needs');
    setSelectedRequest(key);
    setPackReturn(key);
  };
  const requestEntry = context => {
    const records = currentRequests(context, latestData.current);
    if (records.length) selectRequest(records.length === 1 ? requestKey(latestData.current.needs, records[0]) : null);
  };
  const openReview = async (record, restore = false) => {
    cancelHistory();
    if (opening.current) {
      if (restore) throw new Error('A review is already opening. Your markup is retained.');
      return;
    }
    const key = requestKey(data.needs, record);
    const returning = restore ? reviewReturn.current : rememberReturn();
    const intent = {};
    opening.current = intent;
    if (!restore) setMessage('');
    const rootKey = data.rootKey;
    const ownsIntent = () => opening.current === intent && rootKey === latestData.current.rootKey;
    const isCurrent = () => ownsIntent() && !latestData.current.issues.needs
      && latestData.current.needs?.coverage.state !== 'unavailable'
      && latestData.current.needs?.requests.some(item =>
        requestKey(latestData.current.needs, item) === key && item.phase === 'pending');
    try {
      if (!isCurrent()) throw new Error('The request is no longer current. Your markup is retained.');
      if (!restore && review?.key === key) { reviewReturn.current = returning; setHistory(null); setReviewActive(true); return; }
      const [opened, module] = await Promise.all([data.openReview(record), loadReviewEngine()]);
      if (!ownsIntent()) return;
      if (!isCurrent()) {
        throw new Error('The request changed before Review could open. Return to the current owner context.');
      }
      if (restore && opened.submissionId !== review?.review.submissionId) {
        throw new Error('The saved submission did not match. Your original markup is retained.');
      }
      reviewReturn.current = returning;
      setSelectedRequest(key);
      setReview({ key, record, review: opened, module, restoreRequested: restore });
      setReviewed(null); setHistory(null); setReviewActive(true);
    } catch (error) {
      // Recovery errors belong to the existing Review notice, not a new row
      // above the frame. The old engine stays mounted if opening fails.
      if (!ownsIntent()) return;
      if (restore) throw error;
      setMessage(error.message);
    }
    finally {
      if (opening.current === intent) opening.current = null;
      data.reconcile();
    }
  };
  const reviewEntry = records => {
    cancelHistory();
    if (records.length === 1) void openReview(records[0]);
    else selectRequest(null);
  };
  const returnReview = () => {
    cancelHistory();
    opening.current = null;
    const returning = reviewReturn.current;
    focusNext.current = { kind: 'review-return', returning };
    setReviewActive(false); setTab(returning?.tab || 'needs');
  };
  const onReviewed = useCallback((key, valid) => {
    setReviewed(previous => valid ? key : previous === key ? null : previous);
    if (!valid) setDrafts(previous => previous[key]?.approval
      ? { ...previous, [key]: { ...previous[key], approval: false } } : previous);
  }, []);
  const openHistory = async (scope, submissionId) => {
    cancelHistory();
    opening.current = null;
    setMessage('');
    const controller = new AbortController();
    historyRead.current = controller;
    const rootKey = data.rootKey;
    const returning = { ...rememberReturn(), fromReview: reviewActive };
    const current = () => historyRead.current === controller && !controller.signal.aborted
      && rootKey === latestData.current.rootKey;
    try {
      const record = await data.readHistory(scope, submissionId, controller.signal);
      if (!current()) return;
      focusNext.current = null;
      setHistory({ record, returning });
      setReviewActive(false);
    } catch (error) {
      if (current()) setMessage(error.message);
    } finally {
      if (historyRead.current === controller) historyRead.current = null;
    }
  };
  const returnHistory = () => {
    cancelHistory();
    opening.current = null;
    const returning = history.returning;
    focusNext.current = { kind: 'review-return', returning };
    setHistory(null); setReviewActive(returning.fromReview);
  };
  const unavailable = data.issues.needs || data.needs?.coverage.state === 'unavailable';
  const readAt = data.projection?.complete ? data.projection.readAt : null;
  const finderControl = <WorkFinder selection={selection} row={selectedRow} browsing={browsing}
    finder={finder} onFinder={value => {
      scroll.current = 0; position.current = null; focusResults.current = false; setFinder(value);
    }} onClear={clearWork} search={search} onFocus={() => { if (!finderDismissed.current) showFinder(); }}
    onSearch={showFinder} onKeyDown={event => {
      if (!['ArrowDown', 'Enter'].includes(event.key)) return;
      event.preventDefault(); showFinder(); focusResults.current = true; focusWorkResult();
    }} resultsId={overviewActive || popupOpen ? resultsId : undefined} />;
  // Fluent forwards provider classes to portals. Keep viewport layout on the
  // child so dropdowns/drawers do not inherit a page-sized background or height.
  return <FluentProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
    <AriaLiveAnnouncer><div className={mergeClasses(s.page, s.app)}>
      <header className={s.commands}>
        <div className={s.titlebar}><Text weight="semibold">Dude</Text>
          <Text className={s.workspaceLabel}>{data.needs ? 'Joined workspace' : 'Workspace'}</Text></div>
        <div ref={selector} className={s.selector} data-work-selector>
          {compactCommands ? <Button appearance="subtle" icon={<SearchRegular />} aria-label="Find work"
            title="Find work" className={s.railToggle} onClick={() => navigate('overview', selection ? 'heading' : 'search')} />
            : finderControl}
          {popupOpen && <div className={s.finderPopup}>
            <WorkResults rows={rows} finder={finder} scroll={scroll} position={position} onOpen={openWork}
              resultsRef={results} resultsId={resultsId} />
          </div>}
        </div>
        {!aboutActive && <Toolbar className={s.refresh} aria-label="Workspace actions"><ToolbarButton className={s.refreshButton} icon={<ArrowClockwiseRegular />}
          aria-label={settingsActive ? 'Reload packs' : 'Refresh'} title={settingsActive ? 'Reload pack information' : 'Refresh'}
          aria-busy={settingsActive ? data.packsLoading : data.loading || data.selecting}
          onClick={settingsActive ? data.reloadPacks : data.refresh}>
          <span className={s.refreshLabel}>{settingsActive ? 'Reload packs' : 'Refresh'}</span>
        </ToolbarButton></Toolbar>}
      </header>
      {message && <Notice intent="warning" title="Action unavailable">{message}</Notice>}
      {data.authorityChanged && <Notice title="The joined provider changed">
        Earlier session receipts no longer establish current authority. Nothing was resent. Saved ideas and sealed feedback remain in their canonical sources.
      </Notice>}
      <div className={s.shellBody}>
      <ActivityRail tab={reviewActive || history ? 'needs' : tab} onNavigate={navigate} onExpand={closeFinder} />
      <main ref={main} className={s.product} aria-label="Workspace">
        {TABS.map(([value]) => <div key={value} id={`dude-panel-${value}`} role="tabpanel"
          aria-labelledby={`dude-tab-${value}`} hidden={reviewActive || Boolean(history) || value !== tab}
          className={mergeClasses(s.detail, value === 'overview' && s.overviewPanel, value === 'settings' && s.settingsPanel)}>
          {value === 'settings' ? (settingsActive || packReturn) && <Settings key={data.rootKey} data={data}
            active={settingsActive} section={settingsSection} onSection={setSettingsSection} onPermission={openPackPermission} />
            : reviewActive || history || value !== tab ? null : value === 'overview' ? <Overview data={data} rows={rows} selection={selection} finder={finder}
            scroll={scroll} position={position} onOpen={openWork} onNew={newIdea} resultsRef={results} resultsId={resultsId}
            finderControl={compactCommands ? finderControl : null} />
            : value === 'context' ? <Context key={data.rootKey} selection={selection} data={data} rows={rows}
              orientation={orientation} taskKey={visibleTask?.taskKey || null} taskFilter={scopedTasks.filter}
              onTask={taskKey => {
                cancelHistory(); opening.current = null; focusNext.current = null;
                setTaskView({ ...scopedTasks, taskKey });
              }}
              onTaskFilter={filter => {
                cancelHistory(); opening.current = null; focusNext.current = null;
                setTaskView({ ...scopedTasks, filter,
                  taskKey: taskItems?.some(task => task.taskKey === scopedTasks.taskKey && (filter === 'all' || task.state === filter))
                    ? scopedTasks.taskKey : null });
              }}
              onBack={() => navigate('overview', 'row')} onRequest={requestEntry} onReview={reviewEntry}
              onHistory={openHistory} onHistoryReady={restoreReturnFocus} />
              : value === 'needs' ? <NeedsYou data={data} selected={selectedRequest} drafts={drafts}
                onDraft={(key, value) => setDrafts(previous => ({ ...previous, [key]: value }))}
                onSelect={selectRequest} scopeTitle={scopeTitle(displayedRequest?.request.scope, rows)} browsingLabel={browsingLabel}
                onReview={openReview} reviewedKey={reviewed} onNew={newIdea}
                onReturn={packReturn ? () => navigate('settings') : null} />
                : <NewIdea value={idea} onChange={setIdea} data={data}
                  onCancel={() => navigate('needs')} />}
        </div>)}
        {review && <ReviewWorkspace key={review.review.submissionId} entry={review} active={reviewActive && !history}
          scopeTitle={scopeTitle(review.record.request.scope, rows)} browsingLabel={browsingLabel}
          theme={theme} data={data} onReturn={returnReview} onReviewed={onReviewed} onHistory={openHistory}
          onRestore={record => openReview(record, true)} />}
        {history && <ReviewHistory record={history.record} scopeTitle={scopeTitle(history.record.scope, rows)}
          browsingLabel={browsingLabel} onReturn={returnHistory} />}
      </main>
      </div>
      <footer className={mergeClasses(s.footer, reviewActive && s.focusedFooter, settingsActive && s.settingsFooter)}
        aria-label="Workspace status" tabIndex={reviewActive || settingsActive ? 0 : undefined}>
        {settingsActive ? <span>{aboutActive ? 'About · Read only' : data.packsLoading ? 'Reading packs…'
          : `Installed: ${data.packs?.coverage.installed.state || 'unavailable'} · Catalog: ${data.packs?.coverage.catalog.state || 'unavailable'}`}</span>
          : <><span>{data.loading ? 'Reading workspace…' : data.issues.index ? 'Work coverage unavailable'
          : `Work coverage: ${data.index?.coverage.work.state || 'unavailable'}`}</span>
        <span>{unavailable || !data.needs ? 'Current request coverage unavailable'
          : `Current request coverage: ${data.needs.coverage.state}`}</span>
        <span>{data.connected ? 'Connected' : 'Reconnecting; no automatic resend'}</span>
        <span title={data.freshness?.message}>Source freshness: {data.selecting ? 'reading selected work'
          : data.issues.orientation ? 'unavailable' : data.freshness?.state || 'unavailable'}</span>
        <span className={s.readTime}>{readAt ? <>Last complete read <time dateTime={readAt}>
          {new Date(readAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </time></> : 'No complete read'}</span></>}
      </footer>
    </div></AriaLiveAnnouncer>
  </FluentProvider>;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

import React, { StrictMode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AriaLiveAnnouncer, Badge, Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader,
  DataGridHeaderCell, DataGridRow, Field, FluentProvider, Input, List, ListItem,
  ProgressBar, Spinner, Tab, TabList, TableCellLayout, Text, Toolbar, ToolbarButton,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, ArrowLeftRegular, CommentRegular, SearchRegular } from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { darkTheme, lightTheme, useHostAppearance } from './theme.js';
import { NeedsYou, NewIdea, Notice, previewEligibility, SelectField } from './needs-you.jsx';
import { loadReviewEngine, ReviewHistory, ReviewWorkspace } from './review.jsx';
import { requestKey, useCanvasData } from './use-canvas-data.js';

const TABS = [['overview', 'Overview'], ['context', 'Context'], ['needs', 'Needs you'], ['new', 'New idea']];
const GROUPS = {
  active: 'In progress', blocked: 'Blocked', next: 'Next by recorded dependencies',
  'awaiting-definition': 'Awaiting definition', 'defined-awaiting-work': 'Defined',
  'prioritized-later': 'Recorded for later', completed: 'Completed',
};
const DEFAULT_FINDER = { query: '', scope: 'open' };

function contextTitle(context) { return context.title || 'Title unavailable'; }
function sameContext(left, right) {
  return Boolean(left && right && left.ideaPath === right.ideaPath && left.specPath === right.specPath);
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
    return { context, ideaPath: context.ideaPath, title: contextTitle(context), group: item?.group,
      status: context.status === 'resolved' ? 'Resolved idea' : item ? GROUPS[item.group] || 'Status unavailable' : 'Work status unavailable',
      open: item?.group ? item.group !== 'completed' : null,
      tasks: item?.taskCounts || null, reason: candidate?.availability.reason,
      lane: item?.lane, sources: item?.sources || [] };
  }).sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.ideaPath.localeCompare(b.ideaPath));
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
  return projection;
}
function instruction(projection) {
  return projection?.next?.source?.description || projection?.next?.description || null;
}

function WorkName({ row }) {
  const s = useCanvasStyles();
  return <span className={s.tight}><Text weight="semibold">{row.title}</Text>
    <Text className={s.eyebrow}>{row.context.slug}</Text></span>;
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

function WorkFinder({ rows, finder, onFinder, scroll, onOpen }) {
  const s = useCanvasStyles(), id = useId();
  const size = useRef(null), list = useRef(null), applied = useRef(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 620));
    observer.observe(size.current);
    return () => observer.disconnect();
  }, []);
  const fallback = finder.scope !== 'all' && rows.some(row => row.open === null);
  const scope = fallback ? 'all' : finder.scope;
  const query = finder.query.trim().toLocaleLowerCase();
  const visible = rows.filter(row => (scope === 'all' || row.open === (scope === 'open'))
    && (!query || [row.context.title, row.context.slug, row.ideaPath, row.context.specPath]
      .some(value => value?.toLocaleLowerCase().includes(query))));
  const result = `${finder.scope}|${finder.query}`;
  useLayoutEffect(() => {
    if (!list.current) return;
    if (applied.current === null) list.current.scrollTop = scroll.current;
    else if (applied.current !== result) { list.current.scrollTop = 0; scroll.current = 0; }
    applied.current = result;
  }, [result, scroll, compact, visible.length]);
  const columns = { name: s.columnName, status: s.columnStatus, progress: s.columnProgress };
  const label = row => `${row.title}. ${row.status}. ${progressText(row)}. ${row.ideaPath}`;
  const resolved = rows.filter(row => row.open === false && row.context.status === 'resolved').length;
  const completed = rows.filter(row => row.open === false && row.context.kind === 'feature').length;
  return <section ref={size} className={s.stack} aria-labelledby={id}>
    <h2 id={id} className={s.subheading}>Work</h2>
    <div className={s.workControls}>
      <Field label="Search work"><Input className={s.control} value={finder.query} contentBefore={<SearchRegular />}
        placeholder="Title, slug, or source path" onChange={(_, input) => onFinder({ ...finder, query: input.value })} /></Field>
      <SelectField label="Show" value={finder.scope} options={[[ 'open', 'Open' ], [ 'closed', 'Closed' ], [ 'all', 'All' ]]}
        onChange={scope => onFinder({ ...finder, scope })} />
    </div>
    {fallback && <Notice title="Showing all records while work status is incomplete">
      Your {finder.scope === 'closed' ? 'Closed' : 'Open'} selection is retained. Unknown records are included so missing progress cannot hide work.
    </Notice>}
    <div className={s.tight}>
      <Text className={s.eyebrow} role="status">{visible.length} of {rows.length} recorded ideas and features · alphabetical, not priority order</Text>
      {!!(resolved || completed) && <Text className={s.eyebrow}>Closed records include {completed} completed features and {resolved} resolved ideas.
        Resolved ideas were not necessarily implemented.</Text>}
      <Text className={s.eyebrow}>Click a row or focus it and press Enter to open its exact record in Context.</Text>
    </div>
    <div ref={list} className={s.workScroll} data-work-scroll onScroll={event => { scroll.current = event.currentTarget.scrollTop; }}>
      {!visible.length ? <div className={s.empty}><Text weight="semibold">No matching work</Text>
        <Text>Change the search or Show selection. Nothing has been removed.</Text></div>
        : compact ? <List navigationMode="items" aria-label="Recorded work">
          {visible.map(row => <ListItem key={row.ideaPath} className={s.workItem} data-work-path={row.ideaPath}
            aria-label={label(row)} onAction={() => onOpen(row.context)}>
            <span className={s.workItemText}><WorkName row={row} />
              <Text className={s.eyebrow}>{row.status} · {progressText(row)}</Text></span>
          </ListItem>)}
        </List> : <DataGrid items={visible} columns={COLUMNS} getRowId={row => row.ideaPath}
          focusMode="composite" aria-label="Recorded work">
          <DataGridHeader className={s.workHeader}><DataGridRow>
            {({ columnId, renderHeaderCell }) => <DataGridHeaderCell focusMode="none"
              className={mergeClasses(s.workCell, columns[columnId])}>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow></DataGridHeader>
          <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId} className={s.workRow}
            data-work-path={item.ideaPath} aria-label={label(item)} onClick={() => onOpen(item.context)}
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

function Overview({ data, rows, finder, onFinder, scroll, onOpen, onNew, onReview }) {
  const s = useCanvasStyles();
  const inventory = data.index?.coverage.inventory || data.projection?.coverage.inventory;
  const blank = data.index?.workspace === 'blank' && inventory?.state === 'current' && !rows.length;
  const current = rows.filter(row => ['active', 'blocked', 'next'].includes(row.group));
  return <div className={s.overview}>
    <header className={s.between}><div className={s.detailHeader}>
      <h1 className={s.title} tabIndex={-1}>Overview</h1>
      {data.index?.readAt && <Text className={s.eyebrow}>Recorded work · read <time dateTime={data.index.readAt}>
        {new Date(data.index.readAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </time></Text>}
    </div><Button onClick={onNew}>New idea</Button></header>
    {data.loading ? <Spinner label="Reading repository state" /> : blank ? <section className={s.stack}>
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
      {current.length ? <div className={s.stack}>
        {current.slice(0, 3).map(row => {
          const orientation = currentOrientation(data, row.context);
          return <section className={s.focal} key={row.ideaPath} aria-label={`Current work: ${row.title}`}>
            <div className={s.between}><Text className={s.eyebrow}>Current work</Text>
              <Badge appearance="tint" color={row.group === 'blocked' ? 'warning' : 'informative'}>{row.status}</Badge></div>
            <h2 className={s.title}>{row.title}</h2>
            <div className={s.focalProgress}><Text>{progressText(row)}{row.tasks ? ' complete' : ''}</Text>
              {row.tasks?.total > 0 && <ProgressBar value={row.tasks.done} max={row.tasks.total}
                aria-label={`${row.title}: ${row.tasks.done} of ${row.tasks.total} recorded tasks complete`} />}</div>
            <div className={s.focalStep}>
              {instruction(orientation) ? <><Text weight="semibold">Current task instruction</Text>
                <p className={s.prose}>{instruction(orientation)}</p></>
                : <p className={s.prose}>Open this record in Context for its captured intent and current task instructions.</p>}
              <ReviewEntry context={row.context} data={data} onReview={onReview} />
              <Button className={s.back} onClick={() => onOpen(row.context)}>Open in Context</Button>
            </div>
          </section>;
        })}
        {current.length > 3 && <Text className={s.eyebrow}>Other current records appear in Work below.</Text>}
      </div> : data.index?.coverage.work.state === 'current' && <Notice title="No recorded work is in progress">
        Ideas and defined work remain available in the finder below. This is not a statement about current human requests.
      </Notice>}
      <WorkFinder rows={rows} finder={finder} onFinder={onFinder} scroll={scroll} onOpen={onOpen} />
    </>}
  </div>;
}

function Context({ selection, data, rows, onBack, onReview, onHistory }) {
  const s = useCanvasStyles();
  const row = rows.find(row => sameContext(row.context, selection));
  const context = row?.context;
  const orientation = currentOrientation(data, context);
  const [historyResult, setHistoryResult] = useState(null);
  const canReadHistory = Boolean(context?.specPath && context.coverage.state !== 'unavailable');
  const history = canReadHistory && sameContext(historyResult?.scope, context) ? historyResult : null;
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
  return <div className={s.measure}>
    <Button className={s.back} icon={<ArrowLeftRegular />} onClick={onBack}>Back to Overview</Button>
    {!selection ? <>
      <h1 className={s.title} tabIndex={-1}>No record is selected</h1>
      <p className={s.lead}>Open a recorded idea or feature in Overview to see its context.</p>
    </> : !context ? <>
      <h1 className={s.title} tabIndex={-1}>{contextTitle(selection)}</h1>
      <Text className={s.code}>{selection.ideaPath}</Text>
      <Notice intent="warning" title="The selected source is unavailable">
        Its exact identity is retained. No other record has been selected and no previous feature's instruction is shown here.
      </Notice>
    </> : <>
      <header className={s.detailHeader}>
        <Text className={s.eyebrow}>{context.kind === 'feature' ? 'Defined feature' : context.status === 'resolved' ? 'Resolved idea' : 'Draft idea'}</Text>
        <h1 className={s.title} tabIndex={-1}>{contextTitle(context)}</h1>
        <Text className={s.code}>{context.ideaPath}{context.specPath ? `\n${context.specPath}` : ''}</Text>
      </header>
      <div className={s.row}><Text weight="semibold">{row.status}</Text><Text>{progressText(row)}</Text></div>
      {context.status === 'resolved' && <Notice title="Resolved in the source" intent="success">
        This idea is retained for discovery. Resolution does not mean it was implemented, and browsing it does not reopen work.
      </Notice>}
      {row.group === 'completed' && context.kind === 'feature' && <Notice title="Recorded feature work is complete" intent="success">
        All recorded tasks are complete in the authoritative lane. No further task is invented.
      </Notice>}
      {data.selecting ? <Spinner label="Reading this exact context" /> : !orientation && context.kind === 'feature'
        ? <Notice title="Current instruction unavailable" intent="warning">
          {data.issues.orientation || 'The selected source and execution authority could not be confirmed together. Refresh to reread; unrelated records remain available.'}
        </Notice> : instruction(orientation) ? <section className={s.stack}>
          <h2 className={s.subheading}>Current task instruction</h2><p className={s.instruction}>{instruction(orientation)}</p>
        </section> : orientation?.nextReason && <p className={s.prose}>{orientation.nextReason}</p>}
      <ReviewEntry context={context} data={data} onReview={onReview} />
      <section className={s.stack}><h2 className={s.subheading}>{context.status === 'draft' ? 'What you wanted to do' : 'Captured intent'}</h2>
        <p className={s.prose}>{context.intent?.text || 'The captured intent could not be read.'}</p>
        {context.intent?.truncated && <Text className={s.eyebrow}>Excerpt only. The exact idea ledger holds the original.</Text>}
      </section>
      {!!context.dispositions.length && <section className={s.stack}><h2 className={s.subheading}>Recorded owner dispositions</h2>
        {context.dispositions.map((disposition, index) => <div className={s.scope} key={index}>
          <Text weight="semibold">{disposition.source.section}</Text><p className={s.prose}>{disposition.text}</p>
          <Text className={s.code}>{disposition.source.path}</Text>
          <Text className={s.eyebrow}>Attributed source text, not an inferred current request.{disposition.truncated ? ' Excerpt only.' : ''}</Text>
        </div>)}
      </section>}
      {!!orientation?.blockers.length && <section className={s.stack}><h2 className={s.subheading}>Recorded blockers</h2>
        {orientation.blockers.map((blocker, index) => <p className={s.prose} key={index}>{blocker.reason}</p>)}
        <Text className={s.eyebrow}>These are recorded work blockers. Only a current owner-qualified request belongs in Needs you.</Text>
      </section>}
      {!!orientation?.phases.length && <section className={s.stack}><h2 className={s.subheading}>Recorded task progress</h2>
        {orientation.phases.map((phase, index) => <div className={s.row} key={index}><Text>{phase.name}</Text>
          <Text className={s.eyebrow}>{phase.done} of {phase.total} tasks complete</Text></div>)}
      </section>}
      {history?.error && <Notice intent="warning" title="Review history unavailable">{history.error}</Notice>}
      {history?.coverage?.state === 'partial' && <Notice intent="warning" title="Review history is partial">{history.coverage.reason}</Notice>}
      {!!history?.items?.length && <section className={s.stack}><h2 className={s.subheading}>Review history</h2>
        {history.items.map(item => <Button className={s.requestOption} key={item.submissionId}
          onClick={() => onHistory(history.scope, item.submissionId)}>
          <span className={s.tight}><Text>Open sealed feedback · {item.submissionId}</Text>
            <Text className={s.code}>{item.preview.artifact.revision}</Text></span>
        </Button>)}
      </section>}
      {!!orientation?.activity?.recent.length && <section className={s.stack}><h2 className={s.subheading}>Recorded activity</h2>
        {orientation.activity.recent.map((event, index) => <div className={s.tight} key={index}>
          <Text className={s.eyebrow}>{event.date}</Text><p className={s.prose}>{event.text}</p>
        </div>)}
      </section>}
    </>}
  </div>;
}

function App() {
  const s = useCanvasStyles(), theme = useHostAppearance();
  const [tab, setTab] = useState('overview'), [selection, setSelection] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null), [finder, setFinder] = useState(DEFAULT_FINDER);
  const [idea, setIdea] = useState(''), [drafts, setDrafts] = useState({});
  const [review, setReview] = useState(null), [reviewActive, setReviewActive] = useState(false);
  const [reviewed, setReviewed] = useState(null), [history, setHistory] = useState(null), [message, setMessage] = useState('');
  const data = useCanvasData(selection);
  const root = useRef(null), scroll = useRef(0), main = useRef(null), focusNext = useRef(null), opening = useRef(false);
  const reviewReturn = useRef(null), historyRead = useRef(null), latestData = useRef(data);
  latestData.current = data;
  const rows = rowsFor(data);
  const cancelHistory = useCallback(() => {
    historyRead.current?.abort();
    historyRead.current = null;
  }, []);
  useEffect(() => {
    if (root.current && data.rootKey && root.current !== data.rootKey) {
      cancelHistory();
      setTab('overview'); setSelection(null); setSelectedRequest(null); setFinder(DEFAULT_FINDER);
      setIdea(''); setDrafts({}); setReview(null); setReviewActive(false); setReviewed(null); setHistory(null);
      reviewReturn.current = null;
      scroll.current = 0; focusNext.current = 'heading';
    }
    if (data.rootKey) root.current = data.rootKey;
  }, [data.rootKey, cancelHistory]);
  useEffect(() => {
    window.addEventListener('pagehide', cancelHistory);
    return () => {
      cancelHistory();
      window.removeEventListener('pagehide', cancelHistory);
    };
  }, [cancelHistory]);
  useLayoutEffect(() => {
    const destination = focusNext.current;
    if (!destination || reviewActive || history) return;
    focusNext.current = null;
    const panel = main.current?.querySelector('[role="tabpanel"]:not([hidden])');
    if (destination.kind === 'review-return') {
      const returning = destination.returning;
      if (panel) panel.scrollTop = returning?.scroll || 0;
      const node = returning?.selector ? panel?.querySelector(`[data-review-entry="${CSS.escape(returning.selector)}"]`) : returning?.element;
      if (node?.isConnected && !node.disabled) node.focus({ preventScroll: true });
      else document.getElementById(`dude-tab-${returning?.tab || 'needs'}`)?.focus();
      return;
    }
    const node = destination === 'idea' ? panel?.querySelector('textarea')
      : destination === 'row' && selection ? panel?.querySelector(`[data-work-path="${CSS.escape(selection.ideaPath)}"]`)
        : panel?.querySelector('h1');
    if (node) { if (node.tagName === 'H1') node.tabIndex = -1; node.focus({ preventScroll: true }); }
  }, [tab, selection, selectedRequest, reviewActive, history]);
  const openWork = context => {
    cancelHistory();
    setSelection({ ideaPath: context.ideaPath, specPath: context.specPath, title: context.title });
    focusNext.current = 'heading'; setTab('context');
  };
  const newIdea = () => { cancelHistory(); focusNext.current = 'idea'; setTab('new'); };
  const openReview = async (record, restore = false) => {
    cancelHistory();
    if (opening.current) {
      if (restore) throw new Error('A review is already opening. Your markup is retained.');
      return;
    }
    const key = requestKey(data.needs, record);
    const returnElement = document.activeElement;
    const returning = restore ? reviewReturn.current : { tab, selector: returnElement?.getAttribute('data-review-entry'),
      element: returnElement, scroll: main.current?.querySelector('[role="tabpanel"]:not([hidden])')?.scrollTop || 0 };
    if (!restore && review?.key === key) { reviewReturn.current = returning; setHistory(null); setReviewActive(true); return; }
    opening.current = true;
    if (!restore) setMessage('');
    const rootKey = data.rootKey;
    const isCurrent = () => rootKey === latestData.current.rootKey && !latestData.current.issues.needs
      && latestData.current.needs?.coverage.state !== 'unavailable'
      && latestData.current.needs?.requests.some(item =>
        requestKey(latestData.current.needs, item) === key && item.phase === 'pending');
    try {
      if (!isCurrent()) throw new Error('The request is no longer current. Your markup is retained.');
      const [opened, module] = await Promise.all([data.openReview(record), loadReviewEngine()]);
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
      if (restore) throw error;
      setMessage(error.message);
    }
    finally { opening.current = false; data.reconcile(); }
  };
  const reviewEntry = records => {
    cancelHistory();
    if (records.length === 1) void openReview(records[0]);
    else { setSelectedRequest(null); focusNext.current = 'heading'; setTab('needs'); }
  };
  const returnReview = () => {
    cancelHistory();
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
    const controller = new AbortController();
    historyRead.current = controller;
    const rootKey = data.rootKey;
    const returning = { fromReview: reviewActive, returnElement: document.activeElement };
    const current = () => historyRead.current === controller && !controller.signal.aborted
      && rootKey === latestData.current.rootKey;
    try {
      const record = await data.readHistory(scope, submissionId, controller.signal);
      if (!current()) return;
      setHistory({ record, ...returning });
      setReviewActive(false);
    } catch (error) {
      if (current()) setMessage(error.message);
    } finally {
      if (historyRead.current === controller) historyRead.current = null;
    }
  };
  const returnHistory = () => {
    cancelHistory();
    const prior = history; setHistory(null); setReviewActive(prior.fromReview);
    requestAnimationFrame(() => prior.returnElement?.isConnected && prior.returnElement.focus({ preventScroll: true }));
  };
  const unavailable = data.issues.needs || data.needs?.coverage.state === 'unavailable';
  // Fluent forwards provider classes to portals. Keep viewport layout on the
  // child so dropdowns/drawers do not inherit a page-sized background or height.
  return <FluentProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
    <AriaLiveAnnouncer><div className={mergeClasses(s.page, s.app)}>
      <header><div className={s.titlebar}><Text weight="semibold">Dude</Text>
        <Text className={s.eyebrow}>{data.needs ? 'Joined workspace' : 'Workspace'}</Text></div>
      {!reviewActive && !history && <nav className={s.commands} aria-label="Workspace navigation">
        <TabList className={s.viewTabs} aria-label="Workspace views" size="small" selectedValue={tab} selectTabOnFocus={false}
          onTabSelect={(_, input) => { cancelHistory(); setTab(input.value); }}>
          {TABS.map(([value, label]) => <Tab key={value} value={value} id={`dude-tab-${value}`}
            aria-controls={`dude-panel-${value}`}>{label}</Tab>)}
        </TabList>
        <Toolbar aria-label="Workspace actions"><ToolbarButton icon={<ArrowClockwiseRegular />}
          aria-busy={data.loading || data.selecting} onClick={data.refresh}>Refresh</ToolbarButton></Toolbar>
      </nav>}</header>
      {message && <Notice intent="warning" title="Action unavailable">{message}</Notice>}
      {data.authorityChanged && <Notice title="The joined provider changed">
        Earlier session receipts no longer establish current authority. Nothing was resent. Saved ideas and sealed feedback remain in their canonical sources.
      </Notice>}
      <main ref={main} className={s.product}>
        {!reviewActive && !history && TABS.map(([value]) => <div key={value} id={`dude-panel-${value}`} role="tabpanel"
          aria-labelledby={`dude-tab-${value}`} hidden={value !== tab} className={s.detail}>
          {value !== tab ? null : value === 'overview' ? <Overview data={data} rows={rows} finder={finder}
            onFinder={setFinder} scroll={scroll} onOpen={openWork} onNew={newIdea} onReview={reviewEntry} />
            : value === 'context' ? <Context key={data.rootKey} selection={selection} data={data} rows={rows}
              onBack={() => { cancelHistory(); focusNext.current = 'row'; setTab('overview'); }} onReview={reviewEntry} onHistory={openHistory} />
              : value === 'needs' ? <NeedsYou data={data} selected={selectedRequest} drafts={drafts}
                onDraft={(key, value) => setDrafts(previous => ({ ...previous, [key]: value }))}
                onSelect={key => { cancelHistory(); setSelectedRequest(key); focusNext.current = 'heading'; }}
                onReview={openReview} reviewedKey={reviewed} onNew={newIdea} />
                : <NewIdea value={idea} onChange={setIdea} data={data}
                  onCancel={() => { cancelHistory(); focusNext.current = 'heading'; setTab('needs'); }} />}
        </div>)}
        {review && <ReviewWorkspace key={review.review.submissionId} entry={review} active={reviewActive && !history}
          theme={theme} data={data} onReturn={returnReview} onReviewed={onReviewed} onHistory={openHistory}
          onRestore={record => openReview(record, true)} />}
        {history && <ReviewHistory record={history.record} onReturn={returnHistory} />}
      </main>
      <footer className={s.footer}>
        <span>{data.loading ? 'Reading workspace…' : data.issues.index ? 'Work coverage unavailable'
          : `Work coverage: ${data.index?.coverage.work.state || 'unavailable'}`}</span>
        <span>{unavailable || !data.needs ? 'Current request coverage unavailable'
          : `Current request coverage: ${data.needs.coverage.state}`}</span>
        <span>{data.connected ? 'Connected' : 'Reconnecting; no automatic resend'}</span>
      </footer>
    </div></AriaLiveAnnouncer>
  </FluentProvider>;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

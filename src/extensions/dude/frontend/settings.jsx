import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader,
  DataGridHeaderCell, DataGridRow, Dropdown, Field, Option, Tab, TabList, Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, ChevronLeftRegular, ChevronRightRegular, DismissRegular, bundleIcon, Info20Filled, Info20Regular,
  PuzzlePiece20Filled, PuzzlePiece20Regular } from '@fluentui/react-icons';
import { AboutPanel } from './about.jsx';
import { ArtifactImport, NEW_SESSION } from './artifact-import.jsx';
import { catalogCoverageText, RemoveSourceDialog, removalRefusal, blockersOf, SourceBody, sourceLabel, SourcesPanel,
  sourceStatus, sourceWriteReason } from './pack-sources.jsx';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { importRequestStatus, packActionReason, packPermission, packRequestStatus } from './use-canvas-data.js';

// Installed and Available list 25 rows per page. Filtering always runs first.
const PAGE_SIZE = 25;
const INITIAL_VIEW = { context: 'installed', tag: '', source: '', page: 1, selected: null };
const SECTIONS = [['packs', 'Packs', bundleIcon(PuzzlePiece20Filled, PuzzlePiece20Regular)],
  ['about', 'About', bundleIcon(Info20Filled, Info20Regular)]];
const CONTEXTS = [['installed', 'Installed'], ['available', 'Available']];
// The Packs views: the two lists, the import view beside them, then Sources.
const SUBS = [...CONTEXTS, ['import', 'Add/import'], ['sources', 'Sources']];
const OPERATIONS = { install: 'Install', remove: 'Remove', refresh: 'Refresh pack' };
const TYPES = { pack: 'Pack', agent: 'Agent', skill: 'Skill' };
const PROJECT_NOTE = 'Read only. Project agents and skills are project files, not packs: Canvas offers no install, refresh, or remove for them here.';
const PHASES = {
  preparing: ['Preparing request', 'Checking the exact pack and joined session. This does not grant permission.'],
  prepared: ['Request prepared', 'Nothing has been sent. This receipt will not be submitted automatically on reload or return.'],
  submitting: ['Requesting owner action', 'Submitting this receipt once. Delivery and application are not yet confirmed.'],
  admitted: ['Admitted; delivery unconfirmed', 'The provider admitted this request. Delivery is not confirmed; nothing will be resent.'],
  delivered: ['Delivered to Dude', 'Waiting for the owner to preview the impact and request permission. No application is confirmed.'],
  waiting_permission: ['Permission requested', 'Inspect the actual impact and respond to this exact request in Needs you.'],
  waiting_owner: ['Waiting for owner result', 'A permission response is not an applied result. The owner must check, apply, and verify the operation.'],
  reading_result: ['Reading current pack facts', 'The owner reported success. Waiting for the current installed authority before displaying the result.'],
  applied: ['Applied', 'The provider validated the exact owner result and a fresh installed-state read. Current pack facts agree.'],
  declined: ['Declined', 'The owner recorded a decline. This request will not be repeated.'],
  failed: ['Failed', 'The owner did not establish a successful result. This request will not be repeated.'],
  unavailable: ['Unavailable', 'Current request authority is unavailable. Nothing will be retried automatically.'],
  stale: ['Stale request or result', 'The reviewed authority changed. A changed impact requires a fresh preview and confirmation.'],
  uncertain: ['Uncertain', 'Delivery or the resulting state is uncertain. Wait for owner reconciliation; do not repeat this request.'],
};
const MUTATIONS = {
  none: 'The owner reports no pack change.',
  restored: 'The owner verified restoration after a caught failure. This is not a crash-recovery guarantee.',
  uncertain: 'The owner could not establish the resulting state or restoration.',
  applied: 'The engine changed files; the owner did not establish a successful verified outcome.',
};
const isCurrent = coverage => ['current', 'empty'].includes(coverage?.state);
// A catalog the last discovery read, even in part: a partial read lists what its readable sources found.
const isReadable = coverage => ['current', 'empty', 'partial'].includes(coverage?.state);
const tagsText = (pack, unread) => unread ? 'Not read' : pack.use_cases === null ? 'Use cases unavailable'
  : pack.use_cases.length ? pack.use_cases.join(', ') : 'No use cases declared';

// A list row's identity is an opaque key, never its name: an agent and a skill
// may share a name, two sources may list one pack name, and a pack's name is also
// its operation target and its installed-membership key. The server derives every
// key (an installed pack's from its name, an Available one's from its name and
// its source, a project row's from its type and name). Nothing here parses a key,
// no identity map is kept, and the pack operations keep using the pack's name.
//
// Each row also carries the Source column's group and its written-out label:
// the source the server matched, or Unlisted with the recorded type, or Unknown,
// or This project. A row never claims a source by its name.
function recordedKind(source) {
  if (source?.type === 'local') return ['local', 'Local folder'];
  return /^https:\/\/github\.com\//i.test(source?.repository ?? '') ? ['github', 'GitHub'] : ['git', 'Git repository'];
}
function packSource(pack, sources) {
  const source = pack.sourceKey ? sources.get(pack.sourceKey) : null;
  if (source) return { group: source.key, label: sourceLabel(source) };
  if (pack.installed && pack.provenance === 'unlisted') {
    const [slug, type] = recordedKind(pack.source);
    return { group: `unlisted-${slug}`, label: `Unlisted - ${type}` };
  }
  return { group: 'unknown', label: 'Unknown' };
}
const packRow = (pack, sources, unread) => ({ key: pack.key ?? `pack:${pack.name}`, kind: 'pack', name: pack.name, pack,
  project: null, note: null, ...packSource(pack, sources), tags: tagsText(pack, unread) });
const projectRow = item => ({ key: item.key, kind: item.type, name: item.name, pack: null, project: item,
  group: 'project', label: 'This project', tags: 'Not applicable',
  note: item.files.state === 'withheld' && item.files.reason === 'linked' ? item.files.message : null });
// Code-unit order, as the server sorts, so the same rows order the same everywhere.
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// A project row's use cases are "Not applicable": it matches no use-case filter.
const matchesTag = (row, tag) => !tag || Boolean(row.pack?.use_cases?.includes(tag));
const matchesSource = (row, source) => !source || row.group === source;
const matchesFilters = (row, { tag, source }) => matchesTag(row, tag) && matchesSource(row, source);

// Show in Installed: why it is unavailable, in the order a person can act on it.
const SHOW_REASONS = {
  pending: 'Reading Installed...',
  unavailable: 'Project agents and skills could not be read',
  absent: 'Not in Installed now',
};
// The first artifact an Applied result names: an agent entrypoint or a file
// under its `.support/` folder is that agent, a file under a skill folder is
// that skill. This only names a key to look for among the rows already listed.
// It builds no row, so a path the project does not list proves nothing.
const ARTIFACT_PATHS = [
  ['agent', /^\.github\/agents\/(dude-local-[^/]+?)(?:\.agent\.md|\.support\/.+)$/],
  ['skill', /^\.github\/skills\/(dude-local-[^/]+)\/.+$/],
];
function firstArtifactKey(written) {
  const first = written?.[0] ?? '';
  for (const [type, pattern] of ARTIFACT_PATHS) {
    const name = pattern.exec(first)?.[1];
    if (name) return `project:${type}:${name}`;
  }
  return null;
}

/**
 * The rows of one list in display order, from whatever snapshot is held, and
 * whether that list may be shown. Installed is the packs in profile order, then
 * the project agents and skills by name and type. A retained read stays listed
 * for inspection, but a last empty read cannot establish that the current
 * installed authority is still empty. Available is pack-only and needs a current
 * installed read and a catalog some discovery read, because installed membership
 * excludes its rows; it lists same-named packs from several sources side by side,
 * each its own row, ordered by name and then by source. Its retained rows still
 * count when a refresh asks whether a selection survives.
 */
function listRows(packs, context) {
  const items = packs?.items ?? [];
  const sources = new Map((packs?.sources?.items ?? []).map(item => [item.key, item]));
  const unread = packs?.coverage?.catalog?.state === 'not_read';
  if (context === 'available') {
    const order = new Map([...sources.keys()].map((key, index) => [key, index]));
    const rows = items.filter(pack => pack.installed === false).map(pack => packRow(pack, sources, unread))
      .sort((a, b) => compare(a.name, b.name) || (order.get(a.pack.sourceKey) ?? 0) - (order.get(b.pack.sourceKey) ?? 0));
    return { rows, shown: Boolean(packs?.items) && isCurrent(packs.coverage.installed) && isReadable(packs.coverage.catalog) };
  }
  if (!packs?.installed || !packs.items) return { rows: [], shown: false };
  const installed = items.filter(pack => pack.installed === true).map(pack => packRow(pack, sources, unread));
  const projects = (packs.project?.items ?? []).map(projectRow).sort((a, b) => compare(a.name, b.name) || compare(a.kind, b.kind));
  return { rows: [...installed, ...projects], shown: isCurrent(packs.coverage.installed) || installed.length > 0 };
}

/**
 * The Source filter's options for one list: every source (built-ins first, then
 * the ones this project added), the failed ones marked, then a group for
 * Unlisted, Unknown or This project only when a row of this list carries it.
 */
function sourceOptions(packs, rows, context) {
  const options = (packs?.sources?.items ?? []).map(item => [item.key,
    `${sourceLabel(item)}${item.status === 'unavailable' ? ' (unavailable)' : ''}`]);
  if (context === 'installed') {
    const present = new Map(rows.map(row => [row.group, row.label]));
    for (const group of [...present.keys()].filter(group => group.startsWith('unlisted-')).sort()) options.push([group, present.get(group)]);
    for (const group of ['unknown', 'project']) if (present.has(group)) options.push([group, present.get(group)]);
  }
  return options;
}

function CellLabel({ children }) {
  const s = useCanvasStyles();
  return <span className={s.packCellLabel}>{children}</span>;
}
function NameCell({ row }) {
  const s = useCanvasStyles();
  return <><Text weight="semibold">{row.name}</Text>{row.note && <Text className={s.packRowNote}>{row.note}</Text>}</>;
}
const NAME_COLUMN = createTableColumn({ columnId: 'name', renderHeaderCell: () => 'Name',
  renderCell: row => <NameCell row={row} /> });
const TYPE_COLUMN = createTableColumn({ columnId: 'type', renderHeaderCell: () => 'Type',
  renderCell: row => <><CellLabel>Type</CellLabel><Text>{TYPES[row.kind]}</Text></> });
const SOURCE_COLUMN = createTableColumn({ columnId: 'source', renderHeaderCell: () => 'Source',
  renderCell: row => <><CellLabel>Source</CellLabel><Text>{row.label}</Text></> });
const TAGS_COLUMN = createTableColumn({ columnId: 'tags', renderHeaderCell: () => 'Use cases',
  renderCell: row => <><CellLabel>Use cases</CellLabel><Text>{row.tags}</Text></> });
// Installed adds the written-out Type after Name; both lists then name each row's source.
const COLUMNS = { installed: [NAME_COLUMN, TYPE_COLUMN, SOURCE_COLUMN, TAGS_COLUMN],
  available: [NAME_COLUMN, SOURCE_COLUMN, TAGS_COLUMN] };
const rowLabel = (row, context) => `${row.name}. ${context === 'installed' ? `${TYPES[row.kind]}. ` : ''}${row.label}. ${row.tags}${row.note ? `. ${row.note}` : ''}`;

// Why a recorded source is shown the way it is, in the words of what the server
// matched: the source that also supplies the pack's metadata, or an Unlisted or
// Unknown record, which never claims a match it did not make.
function sourceExplanation(row, packs, sourcesByKey) {
  if (row.group === 'unknown') return 'The recorded source could not be read, so Source shows Unknown. Recorded files still govern Remove.';
  if (row.group.startsWith('unlisted-')) {
    const fallback = sourcesByKey.get(packs?.sources?.defaultKey)?.name;
    return `The recorded ${row.pack.source?.type === 'local' ? 'folder' : 'repository'} matches no current source on this computer, so Source shows Unlisted. `
      + `Description and use cases come from the default catalog${fallback ? ` (${fallback})` : ''} by pack name. A confirmed refresh records a current source.`;
  }
  return `The recorded source matches ${sourcesByKey.get(row.group)?.name ?? 'a current source'}, which also supplies this pack's description and use cases.`;
}

function RecordedSource({ source }) {
  const s = useCanvasStyles();
  if (!source) return <Text>Recorded source unavailable.</Text>;
  const fields = source.type === 'local'
    ? [['Type', source.type], ['Location', source.location]]
    : [['Type', source.type], ['Repository', source.repository],
      ['Requested ref', source.requested_ref], ['Resolved commit', source.resolved_commit]];
  return <dl className={s.packMetadata}>{fields.map(([label, value]) => <React.Fragment key={label}>
    <dt>{label}</dt><dd className={s.code}>{value || 'Unavailable'}</dd>
  </React.Fragment>)}</dl>;
}

// The facts a project row's file read supports, never more: a complete list
// counts its files, a partial one says what was and was not read, and a
// withheld one has no count at all, only its reason.
const fileCount = files => files.state === 'complete' ? `${files.count} ${files.count === 1 ? 'file' : 'files'}`
  : files.state === 'partial' ? `${files.count} read; ${files.notRead.length} not read` : `Unavailable. ${files.message}`;

/**
 * Project agent or skill details after the heading (FR-075, FR-086): coverage
 * notices, the description, a read-only note, facts, Files, and the new-session
 * caveat. Every value and path is a text child, so nothing here is a link, HTML,
 * an action, or the project's own documentation. The Documentation position sits
 * between the facts and Files and renders nothing in this feature.
 */
function ProjectBody({ row, coverage }) {
  const s = useCanvasStyles();
  const { description, declaredName, files } = row.project;
  // A linked root is listed by its directory entry and nothing inside it is read.
  const linked = files.state === 'withheld' && files.reason === 'linked';
  const notice = files.state === 'complete' ? null : linked
    ? [files.message, 'This artifact\'s root is a link. Canvas follows no links, so it did not read its description, declared name, or files.']
    : [files.state === 'withheld' ? 'Files withheld' : 'Files partly read', files.message];
  return <>
    {!isCurrent(coverage) && <Text className={s.packReadNotice} data-pack-project-notice>
      Project agents and skills: {coverage?.state || 'unavailable'}. Retained facts are for inspection only.
      {coverage?.message ? ` ${coverage.message}` : ''}
    </Text>}
    {notice && <div className={s.packReadNotice} data-pack-project-files-notice>
      <Text weight="semibold">{notice[0]}</Text><Text>{notice[1]}</Text>
    </div>}
    <p className={s.prose} data-pack-description>{description.state === 'read' ? description.value : description.message}</p>
    <Text className={s.eyebrow} data-pack-readonly>{PROJECT_NOTE}</Text>
    <dl className={s.packMetadata}>
      <dt>Type</dt><dd>{TYPES[row.kind]}</dd>
      <dt>Location</dt><dd className={s.code}>{row.project.location}</dd>
      <dt>Declared name</dt><dd>{declaredName.state === 'read' ? declaredName.value : `Unavailable. ${declaredName.message}`}</dd>
      <dt>File count</dt><dd>{fileCount(files)}</dd>
    </dl>
    {files.state === 'withheld' ? <div className={s.tight}>
      <h3 className={s.packMetadataHeading}>Files</h3><Text>Not listed. {files.message}</Text>
    </div> : <details open className={s.packFiles}>
      <summary>Files ({files.count}{files.notRead.length ? `; ${files.notRead.length} not read` : ''})</summary>
      {files.paths.length || files.notRead.length ? <ul>
        {files.paths.map(path => <li key={`file:${path}`}><code className={s.code}>{path}</code></li>)}
        {files.notRead.map(entry => <li key={`skipped:${entry.path}`}>
          <code className={s.code}>{entry.path}</code><Text className={s.packRowNote}>{entry.message}</Text>
        </li>)}
      </ul> : <Text>No files.</Text>}
    </details>}
    <Text className={s.eyebrow}>{NEW_SESSION}</Text>
  </>;
}

function trapTab(event, dialog) {
  if (event.key !== 'Tab') return;
  const stops = [...dialog.querySelectorAll('button:not(:disabled), summary, [tabindex="0"]')]
    .filter(node => node.getClientRects().length);
  const first = stops[0], last = stops.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/**
 * Settings holds two local sections. Packs stays mounted while About is shown,
 * so its view, selection, and request survive a section switch; only its
 * dialogs close, and they reopen on return under the existing focus rules.
 * The Packs view (sub: Installed, Available, or Add/import) belongs to the
 * shell, which names it in the footer and header, and clears it with the section.
 * Add/import keeps its typed Source here; the list view is kept beside it, so a
 * trip to Add/import and back keeps the filters, page, and selection.
 */
export function Settings({ data, active, section, onSection, sub, onSub, onPermission }) {
  const { packs, packsLoading: loading, issues: { packs: issue } } = data;
  const s = useCanvasStyles(), id = useId();
  const packsShown = active && section === 'packs';
  const onSources = sub === 'sources';
  // The open list or Sources owns the one shared details pane and, for a list,
  // the request dialog. Add/import owns neither.
  const listShown = packsShown && sub !== 'import';
  const [view, setView] = useState(() => ({ ...INITIAL_VIEW, snapshot: packs }));
  const [requestView, setRequestView] = useState(null);
  // Sources keeps its own selection beside the list view, so a trip to Sources
  // and back keeps the filters, page, and selected pack, and the reverse.
  const [sourceKey, setSourceKey] = useState(null);
  const [sourceNote, setSourceNote] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [learned, setLearned] = useState({});
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1099px)').matches);
  const heading = useRef(null), results = useRef(null), panel = useRef(null), filter = useRef(null), detail = useRef(null);
  const closeButton = useRef(null), returnToRow = useRef(false), reveal = useRef(null), strip = useRef(null);
  const last = useRef({ list: null, sources: null });
  const requestDialog = useRef(null), requestClose = useRef(null), requestTrigger = useRef(null);
  const sourcesScroll = useRef(null), sourcesHeading = useRef(null), addSource = useRef(null), noteRef = useRef(null);
  const removeRef = useRef(null), reasonRef = useRef(null), focusAvailable = useRef(false);
  const noteFocus = useRef(false), removeReturn = useRef(false), latest = useRef(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1099px)');
    const change = () => setNarrow(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  // Both lists, from this snapshot. `rows` is the open list's rows, held even
  // while that list is not shown (a pending reload keeps its last read), so a
  // selection can still ask whether its row survives. `shown` says whether the
  // list may be listed as the current authority.
  const lists = useMemo(() => ({ installed: listRows(packs, 'installed'), available: listRows(packs, 'available') }), [packs]);
  const { rows, shown } = lists[view.context];
  const sourceItems = packs?.sources?.items;
  const sourcesByKey = useMemo(() => new Map((sourceItems ?? []).map(item => [item.key, item])), [sourceItems]);
  const options = useMemo(() => sourceOptions(packs, rows, view.context), [packs, rows, view.context]);
  // A source that is no longer an option (removed, or a group no row carries) filters nothing.
  const knownSource = value => options.some(([option]) => option === value) ? value : '';
  // A replacement (including a pending reload) keeps this browser's filters,
  // page, and selection while the selected row is still among the rows it holds
  // and the filters still list it (FR-090). With no selection, or a removed one,
  // the existing reset applies, still keeping the context. Do it before
  // committing detail, so no removed row or old-snapshot row owns a pane.
  let current = view;
  if (view.snapshot !== packs) {
    const kept = view.selected !== null
      && rows.some(row => row.key === view.selected && matchesFilters(row, { tag: view.tag, source: knownSource(view.source) }));
    current = kept ? { ...view, snapshot: packs } : { ...INITIAL_VIEW, context: view.context, snapshot: packs };
  }
  const filters = { tag: current.tag, source: knownSource(current.source) };
  const installedCurrent = isCurrent(packs?.coverage.installed);
  const catalogCurrent = isCurrent(packs?.coverage.catalog);
  const catalogReadable = isReadable(packs?.coverage.catalog);
  const catalogState = packs?.coverage.catalog?.state;
  const projectCoverage = packs?.project?.coverage;
  const projectCurrent = isCurrent(projectCoverage);
  // Every use case a read catalog declares, from the rows themselves (installed
  // rows keep the metadata of the source they match), so several sources and a
  // partial read still offer the use cases they did read.
  const tags = useMemo(() => catalogReadable
    ? [...new Set((packs?.items ?? []).flatMap(item => item.use_cases ?? []))].sort() : [], [packs, catalogReadable]);
  // Filtering precedes paging, over the whole list. The selected row is found
  // there, not only on the page being shown, and owns its page: a refresh that
  // moved the row moved the page with it, so closing its details always
  // returns focus to a row on the page that is showing.
  const matches = useMemo(() => rows.filter(row => matchesFilters(row, filters)), [rows, filters.tag, filters.source]);
  const selectedAt = current.selected === null ? -1 : matches.findIndex(row => row.key === current.selected);
  const pages = Math.ceil(matches.length / PAGE_SIZE);
  const followed = selectedAt >= 0 ? Math.floor(selectedAt / PAGE_SIZE) + 1 : null;
  const page = followed ?? Math.min(current.page, Math.max(1, pages));
  if (followed !== null && followed !== current.page) current = { ...current, page: followed };
  if (current !== view) setView(current);
  const offset = (page - 1) * PAGE_SIZE;
  const visible = shown ? matches.slice(offset, offset + PAGE_SIZE) : [];
  const selected = selectedAt >= 0 ? matches[selectedAt] : null;
  // Sources: the selected source row, and the one key the details pane is for.
  const sourceRows = sourceItems ?? [];
  if (sourceKey !== null && sourceItems && !sourcesByKey.has(sourceKey)) setSourceKey(null);
  const selectedSource = onSources && sourceKey !== null ? sourcesByKey.get(sourceKey) ?? null : null;
  const detailKey = onSources ? selectedSource?.key ?? null : selected?.key ?? null;
  const owner = onSources ? 'sources' : 'list';
  // The confirmation is for one source: if the next read no longer lists it, there is nothing left to confirm.
  const removing = removal && sourceItems ? sourcesByKey.get(removal.key) ?? null : null;
  if (removal && sourceItems && !removing) setRemoval(null);
  const unknownTags = current.context === 'installed' ? rows.filter(row => row.pack?.use_cases === null).length : 0;
  const partialTags = current.context === 'installed' && Boolean(current.tag) && unknownTags > 0;
  const staleInstalled = current.context === 'installed' && shown && !installedCurrent;
  // Project rows join the Installed count only while both reads are current or
  // known empty; otherwise the count is unknown, and a failed project read says
  // "known" instead of presenting a partial total. A partial catalog read lists
  // only what its readable sources found, so Available says "known" too.
  const projectKnown = current.context === 'installed' && shown && installedCurrent && !projectCurrent;
  const partialCatalog = current.context === 'available' && catalogState === 'partial';
  const known = partialTags || projectKnown || partialCatalog;
  const totals = {
    installed: installedCurrent && projectCurrent && packs?.installed && packs.items ? lists.installed.rows.length : null,
    available: lists.available.shown ? lists.available.rows.length : null,
  };
  const coverage = key => packs?.coverage[key]?.state || (loading ? 'loading' : 'unavailable');
  const catalogText = catalogCoverageText(packs) === 'unavailable' ? coverage('catalog') : catalogCoverageText(packs);
  const contextLabel = current.context === 'installed' ? 'Installed' : 'Available';
  const filtered = Boolean(filters.tag || filters.source);
  const count = !shown ? 'Count unavailable' : !matches.length ? `0${known ? ' known' : ''} matches`
    : `${offset + 1}–${offset + visible.length} of ${matches.length}${known ? (filtered ? ' known matches' : ' known')
      : staleInstalled ? ' last read' : filtered ? ' matches' : ''}`;
  const pageLabel = !shown ? 'Unavailable' : !pages ? 'No pages' : `Page ${page} of ${pages}`;
  const viewLabel = value => value === 'import' ? 'Add/import' : value === 'sources' ? 'Sources'
    : `${CONTEXTS.find(([context]) => context === value)[1]} ${totals[value] ?? '?'}`;
  const latestRequest = packRequestStatus(data);
  const shownRequest = requestView ? packRequestStatus(data, requestView) : null;
  const permission = shownRequest && packPermission(data, shownRequest.record?.packReceipt);
  const outcome = shownRequest?.record?.receipt.acknowledgment;
  // The saved source a request is bound to, by the key this tab chose or the
  // provider's own echo; its words come from the source rows, else the echo.
  const requestSourceOf = status => {
    const bound = status?.catalogSource ?? null, key = bound?.key ?? status?.binding?.source ?? null;
    if (!key) return null;
    const item = sourcesByKey.get(key);
    if (item) return { name: item.name, label: sourceLabel(item) };
    const where = bound ? bound.source.repository ?? bound.source.location : null;
    return where ? { name: where, label: where } : null;
  };
  // Only a pack row owns operations, and each is keyed by the pack's name. An
  // install from a source this project added names that source's key; the
  // default catalog's rows, a refresh and a removal name none.
  const actions = selected?.pack ? selected.pack.installed ? ['refresh', 'remove'] : ['install'] : [];
  const actionReasons = Object.fromEntries(actions.map(operation =>
    [operation, packActionReason(data, operation, selected.name, selected.key)]));
  const installSource = selected?.pack && !selected.pack.installed && sourcesByKey.get(selected.pack.sourceKey)?.scope === 'project'
    ? selected.pack.sourceKey : null;
  // Add/import's Show in Installed. Only an Applied result offers it, and only
  // for a project row the Installed list holds right now: the project read must
  // be current, and a pending or failed one says so instead of guessing.
  const importStatus = importRequestStatus(data);
  const importResult = importStatus?.phase === 'applied' ? importStatus.acknowledgment : null;
  const projectReading = loading || projectCoverage?.reason === 'read_pending'
    || (projectCoverage?.state === 'stale' && !projectCoverage.message);
  const showKey = firstArtifactKey(importResult?.written);
  const show = !importResult ? null : projectReading ? { reason: SHOW_REASONS.pending }
    : !projectCurrent ? { reason: SHOW_REASONS.unavailable }
      : showKey && lists.installed.shown && lists.installed.rows.some(row => row.key === showKey) ? { key: showKey }
        : { reason: SHOW_REASONS.absent };

  // A row is found by its opaque key in whichever table is open: a list or Sources.
  const rowsRoot = () => (onSources ? sourcesScroll : results).current;
  const rowFor = key => [...(rowsRoot()?.querySelectorAll(onSources ? '[data-source-row]' : '[data-pack-row]') || [])]
    .find(node => node.getAttribute(onSources ? 'data-source-row' : 'data-pack-row') === key);
  // The scroller is the rows, or the whole panel where the panel scrolls as one
  // column (its rows are then not a scroll container), so a page or filter
  // change resets whichever one the user is scrolling.
  const resetScroll = () => {
    const rowsScroll = results.current && getComputedStyle(results.current).overflowY !== 'visible';
    const scroller = rowsScroll ? results.current : panel.current;
    if (scroller) scroller.scrollTop = 0;
  };
  // Focus a row and bring it into view below the sticky header (the row's own
  // scroll margin), whether the rows or the whole panel scroll.
  const focusRow = key => {
    const row = key === null ? undefined : rowFor(key);
    if (!row) return false;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest' });
    return true;
  };
  // The grid commits a page's rows after this render, so a row that is not in
  // the DOM yet is brought into view when it arrives.
  const revealRow = key => {
    const row = rowFor(key);
    if (row) { row.scrollIntoView({ block: 'nearest' }); return; }
    const watch = new MutationObserver(() => {
      const arrived = rowFor(key);
      if (!arrived) return;
      watch.disconnect();
      arrived.scrollIntoView({ block: 'nearest' });
    });
    watch.observe(rowsRoot(), { childList: true, subtree: true });
    setTimeout(() => watch.disconnect(), 1000);
  };
  const close = () => {
    returnToRow.current = true;
    if (onSources) setSourceKey(null);
    else setView(previous => ({ ...previous, selected: null }));
  };
  const showRequest = binding => {
    requestTrigger.current = document.activeElement;
    setRequestView(binding);
  };
  // The one details pane serves the lists and Sources, each with its own last
  // selection, so a trip to the other keeps this one's focus rules intact.
  useLayoutEffect(() => {
    const dialog = detail.current, request = requestDialog.current;
    const focused = document.activeElement;
    if (!listShown) {
      if (request.open) request.close();
      if (dialog.open) dialog.close();
      return;
    }
    // The request is the top layer. Keep the native detail mode underneath it
    // until it closes; CSS removes a retained wide pane from narrow grid flow.
    if (requestView) {
      if (!request.open) {
        request.showModal();
        requestClose.current.focus({ preventScroll: true });
      }
      return;
    }
    const closingRequest = request.open;
    if (closingRequest) request.close();
    if (!detailKey) {
      const restore = closingRequest || returnToRow.current || (last.current[owner]
        && (dialog.contains(focused) || focused === document.body));
      // Native modal inertness ends before restoring a surviving row/heading.
      if (dialog.open) dialog.close();
      if (restore) { if (!focusRow(last.current[owner])) (onSources ? sourcesHeading : heading).current?.focus({ preventScroll: true }); }
      else if (focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
      last.current[owner] = null;
      returnToRow.current = false;
      reveal.current = null;
      return;
    }
    const changedMode = dialog.open && dialog.matches(':modal') !== narrow;
    if (changedMode) dialog.close();
    if (!dialog.open) {
      if (narrow) dialog.showModal();
      else dialog.show();
    }
    const trigger = requestTrigger.current;
    // Show in Installed, or a source just added: Close takes focus, and the row
    // is brought into view below the sticky header, whichever page and scroller hold it.
    if (reveal.current === detailKey) {
      reveal.current = null;
      closeButton.current?.focus({ preventScroll: true });
      revealRow(detailKey);
    } else if (closingRequest && trigger?.isConnected && trigger.getClientRects().length && !trigger.disabled
      && (!narrow || dialog.contains(trigger))) trigger.focus({ preventScroll: true });
    else if (closingRequest || last.current[owner] !== detailKey || changedMode) closeButton.current?.focus({ preventScroll: true });
    // A retained wide pane reopens beside the results without taking focus
    // from the section tab that revealed it; show() alone would move focus in.
    else if (!narrow && focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    last.current[owner] = detailKey;
  }, [listShown, detailKey, onSources, narrow, current.snapshot, requestView]);

  const changeFilters = patch => {
    setView(previous => {
      const next = { ...previous, ...patch, page: 1 };
      const firstPage = (shown ? rows : []).filter(row => matchesFilters(row, { tag: next.tag, source: knownSource(next.source) }))
        .slice(0, PAGE_SIZE);
      return { ...next, selected: firstPage.some(row => row.key === previous.selected) ? previous.selected : null };
    });
    resetScroll();
  };
  const changePage = next => {
    setView(previous => ({ ...previous, page: next, selected: null }));
    resetScroll();
    heading.current.focus({ preventScroll: true });
  };
  // Changing between the two lists starts the new list afresh (063). Add/import
  // and Sources keep the list view as it was, so returning to the same list
  // finds its filters, page, and selection unchanged.
  const selectSub = value => {
    if (value === sub) return;
    if ((value === 'installed' || value === 'available') && value !== current.context) {
      setView({ ...INITIAL_VIEW, context: value, snapshot: packs });
      resetScroll();
    }
    if (sub === 'sources') setSourceNote(null);
    onSub(value);
  };
  // A local view change that requests nothing: Installed opens with its filters
  // reset on the page that holds the row, which is selected and revealed, and
  // details Close takes focus (see the layout effect).
  const showInstalled = key => {
    const at = lists.installed.rows.findIndex(row => row.key === key);
    if (at < 0) return;
    reveal.current = key;
    setView({ ...INITIAL_VIEW, context: 'installed', selected: key, page: Math.floor(at / PAGE_SIZE) + 1, snapshot: packs });
    onSub('installed');
  };
  // Show packs in Available: the same local view change as choosing that Source
  // in Available's filter by hand, with the Use case and page reset and nothing
  // selected. No read and no request. Focus lands on the Available tab, or on
  // the View Dropdown where the tabs give way to it.
  const showPacks = key => {
    setView({ ...INITIAL_VIEW, context: 'available', source: key, snapshot: packs });
    focusAvailable.current = true;
    onSub('available');
  };
  useLayoutEffect(() => {
    if (!focusAvailable.current || sub !== 'available') return;
    focusAvailable.current = false;
    const tab = strip.current?.querySelector('[data-pack-context="available"]');
    (tab?.getClientRects().length ? tab : strip.current?.querySelector('[data-pack-view] [role="combobox"]'))
      ?.focus({ preventScroll: true });
  }, [sub]);
  const cellClass = columnId => columnId === 'name' ? mergeClasses(s.packNameCell, current.context === 'installed' && s.packNameCellTyped)
    : columnId === 'type' ? s.packTypeCell : columnId === 'source' ? s.packSourceCell : s.packTagsCell;
  // The project read is its own coverage: while it is pending or failed the
  // packs stay listed and the notice says why Installed shows a known count.
  const projectPending = projectCoverage?.reason === 'read_pending';

  // What this tab already knows uses a source: the installed packs the server
  // matched to it, the live pack requests bound to its key, this tab's own
  // attempt, and every blocker an earlier refusal named. It is advisory; the
  // server decides again at the write, and no state feed makes it authoritative.
  const usesOf = item => {
    const requests = [];
    const text = (operation, name, phase) => `${OPERATIONS[operation] ?? operation} ${name} (${phase})`;
    for (const record of data.needs?.packRequests ?? []) {
      if (record.receipt?.catalogSource?.key !== item.key || record.receipt.acknowledgment
        || ['unavailable', 'stale'].includes(record.phase)) continue;
      requests.push(text(record.operation, record.name, (PHASES[record.phase]?.[0] ?? record.phase).toLowerCase()));
    }
    const attempt = data.packAttempt;
    if (attempt?.source === item.key && ['preparing', 'submitting', 'uncertain'].includes(attempt.phase)) {
      const own = text(attempt.operation, attempt.name, (PHASES[attempt.phase]?.[0] ?? attempt.phase).toLowerCase());
      if (!requests.some(entry => entry.startsWith(`${OPERATIONS[attempt.operation]} ${attempt.name} (`))) requests.push(own);
    }
    // A refusal's blockers hold only until the next snapshot: a fresh read is the better authority.
    const named = learned[item.key]?.at === packs ? learned[item.key] : null;
    return { installed: [...new Set([...(item.installedNames ?? []), ...(named?.installed ?? [])])],
      requests: [...new Set([...requests, ...(named?.requests ?? [])])] };
  };
  const selectSource = key => setSourceKey(key);
  const askRemove = (item, trigger) => {
    setSourceNote(null);
    setRemoval({ key: item.key, trigger, busy: false, refusal: null });
  };
  const closeRemoval = () => { removeReturn.current = true; setRemoval(null); };
  const confirmRemove = async source => {
    setRemoval(previous => ({ ...previous, busy: true, refusal: null }));
    const result = await data.removeSource(source.key);
    if (!latest.current.mounted) return;
    if (result.ok) {
      // Only the entry is gone: no pack, file or other source was touched. The one
      // read that follows is the hook's; the details close with their row.
      setRemoval(null);
      setSourceKey(null);
      setSourceNote({ intent: 'success', title: 'Removed',
        text: `${source.name} was removed from this project's source list. Installed packs and files were not changed.` });
      noteFocus.current = true;
      return;
    }
    if (result.code === 'source_in_use' && result.blockers) {
      const named = blockersOf(result.blockers);
      setLearned(previous => ({ ...previous, [source.key]: { ...named, at: latest.current.packs } }));
    }
    setRemoval(previous => previous && ({ ...previous, busy: false, refusal: removalRefusal(result) }));
  };
  // After the dialog closes, focus returns to Remove, or to the reason that now
  // explains why it is disabled, or to the view's heading; a success moves to its status.
  useLayoutEffect(() => {
    if (removal) return;
    if (noteFocus.current) {
      noteFocus.current = false;
      removeReturn.current = false;
      (noteRef.current ?? sourcesHeading.current)?.focus({ preventScroll: true });
    } else if (removeReturn.current) {
      removeReturn.current = false;
      const button = removeRef.current;
      (button?.isConnected && !button.disabled && button.getClientRects().length ? button
        : reasonRef.current?.isConnected ? reasonRef.current : sourcesHeading.current)?.focus({ preventScroll: true });
    }
  }, [removal, sourceNote, sourceKey]);
  // A saved source opens in details only after the one read that follows the save
  // has committed its snapshot, and only while Sources is still the open view with
  // no dialog on top and the row still there. Below 1100px that opens the details
  // overlay, so it must never cover Add, Remove, or a hidden view.
  const sourceAdded = async result => {
    const committed = await result.read;
    const now = latest.current;
    if (!now.mounted || !now.onSources || !now.packsShown || !committed?.sources?.items.some(item => item.key === result.key)) return;
    if (document.querySelector('[data-source-add-dialog][open], [data-source-remove-dialog][open]')) return;
    reveal.current = result.key;
    setSourceKey(result.key);
  };
  latest.current = { ...(latest.current ?? {}), onSources, packsShown, packs, mounted: latest.current?.mounted ?? true };
  useEffect(() => {
    latest.current.mounted = true;
    return () => { latest.current.mounted = false; };
  }, []);
  const pane = onSources ? selectedSource && {
    eyebrow: `Pack source · ${selectedSource.scope === 'builtin' ? 'Built in' : 'This project'}`, title: selectedSource.name,
    closeLabel: 'Close source details', bodyLabel: 'Source details' }
    : selected && {
      eyebrow: selected.project ? 'Installed · This project' : `${contextLabel} · Workspace scope`,
      title: !selected.pack || selected.pack.installed || !sourcesByKey.has(selected.pack.sourceKey) ? selected.name
        : `${selected.name} - ${sourcesByKey.get(selected.pack.sourceKey).name}`,
      closeLabel: selected.project ? 'Close project details' : 'Close pack details',
      bodyLabel: selected.project ? 'Project agent or skill details' : 'Pack metadata, source, and files' };

  return <div className={s.settings} data-settings>
    <header className={s.settingsHeader}>
      <h1 ref={heading} id={`${id}-heading`} className={s.title} tabIndex={-1}>Settings</h1>
      <TabList className={s.settingsSections} aria-label="Settings sections" selectedValue={section} selectTabOnFocus
        onTabSelect={(_, input) => { if (input.value !== section) onSection(input.value); }}>
        {SECTIONS.map(([value, label, Icon]) => <Tab key={value} value={value} id={`${id}-section-${value}`}
          icon={<Icon />} className={s.sectionTab} data-settings-section={value} aria-controls={`${id}-${value}`}>
          {label}
        </Tab>)}
      </TabList>
    </header>
    <div role="tabpanel" id={`${id}-packs`} aria-labelledby={`${id}-section-packs`} hidden={section !== 'packs'}
      className={mergeClasses(s.packLayout, detailKey && !narrow && listShown && s.packLayoutSelected)}>
    <section className={s.packBrowser} aria-labelledby={`${id}-section-packs`}>
      <div ref={strip} className={s.packStrip}>
        <TabList className={s.packTabs} aria-label="Pack context" selectedValue={sub} selectTabOnFocus
          onTabSelect={(_, input) => selectSub(input.value)}>
          {SUBS.map(([value, label]) => value === 'import' || value === 'sources'
            ? <Tab key={value} value={value} id={`${id}-${value}`} className={s.packTab} data-pack-context={value}
              aria-controls={`${id}-${value}-panel`}>{label}</Tab>
            : <Tab key={value} value={value} id={`${id}-${value}`}
              className={s.packTab} data-pack-context={value} aria-controls={`${id}-results`}
              aria-label={`${label} (${totals[value] ?? 'unknown'}${value === 'available' && catalogState === 'partial'
                && totals.available !== null ? ' known' : ''})`}>
              {label} <span className={s.packTabCount} data-pack-total={value}>{totals[value] ?? '?'}</span>
            </Tab>)}
        </TabList>
        <Field className={s.packView} label="View" data-pack-view>
          <Dropdown className={s.packFilter} inlinePopup value={viewLabel(sub)} selectedOptions={[sub]}
            onOptionSelect={(_, input) => selectSub(input.optionValue)}>
            {SUBS.map(([value]) => <Option key={value} value={value} text={viewLabel(value)}>{viewLabel(value)}</Option>)}
          </Dropdown>
        </Field>
      </div>
      <div ref={panel} className={s.packPanel} role="tabpanel" id={`${id}-results`} hidden={sub === 'import' || onSources}
        aria-labelledby={`${id}-${current.context}`}>
        <div className={s.packToolbar} data-pack-toolbar>
          <Field className={mergeClasses(s.packFilterField, s.packFilterFirst)} label="Use case">
            <Dropdown ref={filter} className={s.packFilter} inlinePopup
              disabled={!catalogReadable} value={filters.tag || 'All use cases'} selectedOptions={[filters.tag]}
              onOptionSelect={(_, input) => changeFilters({ tag: input.optionValue })}>
              <Option value="" text="All use cases">All use cases</Option>
              {tags.map(tag => <Option key={tag} value={tag} text={tag}>{tag}</Option>)}
            </Dropdown>
          </Field>
          <Field className={s.packFilterField} label="Source">
            <Dropdown className={s.packFilter} inlinePopup data-pack-source-filter
              value={options.find(([value]) => value === filters.source)?.[1] ?? 'All sources'} selectedOptions={[filters.source]}
              onOptionSelect={(_, input) => changeFilters({ source: input.optionValue })}>
              <Option value="" text="All sources">All sources</Option>
              {options.map(([value, text]) => <Option key={value} value={value} text={text}>{text}</Option>)}
            </Dropdown>
          </Field>
          <Button className={s.packClear} onClick={() => { changeFilters({ tag: '', source: '' }); filter.current?.focus(); }}>Clear</Button>
        </div>
        <div ref={results} className={s.packScroll} data-pack-scroll aria-busy={loading}>
          {latestRequest && <div className={s.packReadNotice} data-pack-request-summary>
            <Text role="status" aria-live="polite" aria-atomic="true">
              {OPERATIONS[latestRequest.operation]} {latestRequest.name}{requestSourceOf(latestRequest)
                ? ` from ${requestSourceOf(latestRequest).name}` : ''}: {PHASES[latestRequest.phase][0]}
            </Text>
            <Button className={s.back} onClick={() => showRequest(latestRequest.binding)}>View pack request</Button>
          </div>}
          {(issue || !installedCurrent || !catalogCurrent) && <div className={s.packReadNotice} role="status" data-pack-coverage>
            <Text weight="semibold">Installed: {coverage('installed')} · Catalog: {catalogText}</Text>
            <Text>{issue || (loading ? 'Reading pack information. Retained records are for inspection only.'
              : catalogState === 'not_read' && installedCurrent
                ? 'Nothing is read until you choose Reload packs, so use cases and Available are unknown.'
                : catalogState === 'partial' && packs.sources?.state === 'unavailable'
                  ? 'The saved source list could not be read, so added sources are unavailable. Built-in sources are still listed. This is not a confirmed empty list.'
                  : catalogState === 'partial' ? 'Some sources could not be read. Packs from them are not listed.'
                    : packs?.coverage.installed.message || packs?.coverage.catalog.message
                      || 'Pack information is unavailable. Reload packs to try again.')}</Text>
            {catalogState === 'partial' && !loading && sourceRows.filter(item => item.status === 'unavailable').map(item =>
              <Text key={item.key} data-pack-source-failure>{sourceLabel(item)}: {sourceStatus(item).text}</Text>)}
            {catalogState === 'partial' && !loading && <Text>Packs from unavailable sources are not listed. Counts are known counts,
              not totals, and an empty result is not a confirmed empty list.</Text>}
            {!catalogReadable && catalogState !== 'not_read' && <Text>Use-case filtering and Available need a current catalog.
              {lists.installed.rows.some(row => row.pack) && ' Recorded installed files and source remain inspectable.'}</Text>}
          </div>}
          {current.context === 'installed' && shown && !projectCurrent && <div className={s.packReadNotice} role="status" data-pack-project-coverage>
            <Text weight="semibold">{projectPending ? 'Reading Installed...'
              : `Project agents and skills: ${projectCoverage?.state || 'unavailable'}`}</Text>
            <Text>{projectPending
              ? `Project agents and skills are being read again. Counts show ? until the read finishes.${packs?.project?.items?.length
                ? ' Rows from the last read stay for inspection only.' : ''}`
              : projectCoverage?.message || 'Project agents and skills could not be read.'}</Text>
            {!projectPending && <Text>{installedCurrent ? 'Installed packs are listed and unchanged. ' : ''}Counts are known
              counts, not totals, and this is not a confirmed empty list of project agents and skills.</Text>}
          </div>}
          {partialTags && <p className={s.packReadNotice} data-pack-tag-coverage>
            Incomplete tag coverage: {unknownTags} installed {unknownTags === 1 ? 'pack has' : 'packs have'} unavailable use cases.
            {' '}Only known matches are shown; All use cases includes them.
          </p>}
          {visible.length ? <DataGrid items={visible} columns={COLUMNS[current.context]} getRowId={row => row.key}
            focusMode="composite" aria-label={current.context === 'installed' ? 'Installed' : 'Available packs'}>
            <DataGridHeader className={s.packTableHeader}><DataGridRow>
              {({ columnId, renderHeaderCell }) => <DataGridHeaderCell focusMode="none"
                className={mergeClasses(s.packCell, cellClass(columnId))}>{renderHeaderCell()}</DataGridHeaderCell>}
            </DataGridRow></DataGridHeader>
            <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId} data-pack-row={item.key}
              aria-label={rowLabel(item, current.context)} aria-selected={selected?.key === item.key}
              className={mergeClasses(s.packRow, selected?.key === item.key && s.workSelected)}
              onClick={() => setView(previous => ({ ...previous, selected: item.key }))}
              onKeyDown={event => {
                if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
                event.preventDefault(); setView(previous => ({ ...previous, selected: item.key }));
              }}>
              {({ columnId, renderCell }) => <DataGridCell focusMode="none"
                className={mergeClasses(s.packCell, cellClass(columnId))}>
                {renderCell(item)}
              </DataGridCell>}
            </DataGridRow>}</DataGridBody>
          </DataGrid> : <div className={s.empty} data-pack-empty>
            {current.context === 'available' && catalogState === 'not_read' && !loading ? <>
              <Text weight="semibold">Catalog not read yet</Text>
              <Text>Available packs come from your sources, so this list is empty and its count is unknown until they are read.</Text>
              <Button appearance="primary" icon={<ArrowClockwiseRegular />} data-pack-reload onClick={() => data.reloadPacks()}>Reload packs</Button>
            </> : <>
              <Text weight="semibold">{!shown ? `${contextLabel} ${loading ? 'loading' : 'unavailable'}`
                : filtered && partialCatalog ? 'No known matching packs'
                  : filtered ? 'No matching packs' : current.context === 'installed' ? 'No installed packs' : 'No available packs'}</Text>
              <Text>{!shown ? 'This is not a confirmed empty list.'
                : filtered && partialCatalog ? (filters.source && sourcesByKey.get(filters.source)?.status === 'unavailable'
                  ? `${sourceLabel(sourcesByKey.get(filters.source))}: ${sourceStatus(sourcesByKey.get(filters.source)).text.replace(/[.\s]+$/, '')}. Its packs are not listed, so this is not a confirmed empty list.`
                  : 'This is not a confirmed empty list: some sources could not be read. Clear the filters to see every known pack in this context.')
                  : filtered ? `${filters.source && sourcesByKey.get(filters.source)?.reason === 'not_read_by_design'
                    ? 'Bundle upstream is not read while library/packs exists. ' : ''}Clear the filters to see all packs in this context.`
                    : current.context === 'installed' ? 'The installed profile contains no packs.' : 'No catalog packs are outside installed membership.'}</Text>
            </>}
          </div>}
        </div>
        <div className={s.packPager} data-pack-pager>
          <Button className={s.packPageButton} icon={<ChevronLeftRegular />} aria-label="Previous pack page"
            disabled={!shown || page <= 1} onClick={() => changePage(page - 1)}>
            <span className={s.packPageLabel}>Previous</span>
          </Button>
          <div className={s.packMetrics} role="status" aria-live="polite" aria-atomic="true">
            <span data-pack-count>{count}</span><span data-pack-page>{pageLabel}</span>
          </div>
          <Button className={s.packPageButton} icon={<ChevronRightRegular />} iconPosition="after" aria-label="Next pack page"
            disabled={!shown || page >= pages} onClick={() => changePage(page + 1)}>
            <span className={s.packPageLabel}>Next</span>
          </Button>
        </div>
      </div>
      <ArtifactImport id={`${id}-import-panel`} labelledBy={`${id}-import`} shown={packsShown && sub === 'import'}
        data={data} show={show} onShow={showInstalled} onPermission={onPermission} />
      <SourcesPanel id={`${id}-sources-panel`} labelledBy={`${id}-sources`} shown={packsShown && onSources} data={data}
        packs={packs} loading={loading} rows={sourceRows} selectedKey={sourceKey} onSelect={selectSource}
        note={sourceNote} onNote={setSourceNote} onAdded={sourceAdded} noteRef={noteRef} scrollRef={sourcesScroll}
        headingRef={sourcesHeading} addRef={addSource} />
    </section>
    <dialog ref={detail} className={s.packDetail} aria-labelledby={`${id}-detail-heading`}
      aria-modal={detailKey && narrow ? true : undefined} data-pack-detail={detailKey}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => {
        if (narrow && event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        }
      }}
      onKeyDown={event => {
        if (requestDialog.current.open) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
        if (narrow) trapTab(event, detail.current);
      }}>
      {pane && <>
        <header className={s.packDetailHeader}>
          <div className={s.grow}><Text className={s.eyebrow}>{pane.eyebrow}</Text>
            <h2 id={`${id}-detail-heading`} className={s.subheading}>{pane.title}</h2></div>
          <Button ref={closeButton} appearance="subtle" icon={<DismissRegular />} aria-label={pane.closeLabel} onClick={close} />
        </header>
        <div className={s.packDetailBody} tabIndex={0} role="region" data-pack-detail-body aria-label={pane.bodyLabel}>
          {onSources ? <SourceBody item={selectedSource} sources={packs?.sources} shown={lists.available.shown} uses={usesOf(selectedSource)}
            reason={sourceWriteReason(data, packs, loading)} onShow={showPacks} onRemove={askRemove} removeRef={removeRef} reasonRef={reasonRef} />
            : selected.project ? <ProjectBody row={selected} coverage={projectCoverage} /> : <>
          {(!installedCurrent || !(catalogReadable || catalogState === 'not_read')) && <Text className={s.packReadNotice}>
            Installed: {coverage('installed')} · Catalog: {catalogText}. Retained facts are for inspection only.
          </Text>}
          <p className={s.prose} data-pack-description>{selected.pack.description === null
            ? catalogState === 'not_read' ? 'Description not read. Choose Reload packs to read catalogs.'
              : 'Description unavailable; no readable catalog record.'
            : selected.pack.description || 'No description declared.'}</p>
          <div className={s.tight}>
            <div className={s.actions} data-pack-actions>
              {actions.map(operation => <Button key={operation} data-pack-operation={operation}
                appearance={operation === 'install' ? 'primary' : 'secondary'}
                disabled={Boolean(actionReasons[operation])} aria-describedby={`${id}-action-reason`}
                onClick={() => {
                  const attempt = operation === 'install'
                    ? data.requestPack(operation, selected.name, packs, installSource, selected.key)
                    : data.requestPack(operation, selected.name, packs);
                  if (attempt) showRequest(attempt);
                }}>{OPERATIONS[operation]}</Button>)}
            </div>
            <Text id={`${id}-action-reason`} className={s.eyebrow}>
              {[...new Set(Object.values(actionReasons).filter(Boolean))].join(' ')
                || 'Request this exact operation from Dude. The owner previews its impact and asks for literal permission before changing files.'}
            </Text>
          </div>
          <dl className={s.packMetadata}>
            <dt>Use cases</dt><dd>{selected.tags}</dd>
            <dt>Source</dt><dd data-pack-source>{selected.label}</dd>
            {!selected.pack.installed && sourcesByKey.has(selected.pack.sourceKey) && <>
              <dt>Location</dt>
              <dd className={s.code} data-pack-origin>{sourcesByKey.get(selected.pack.sourceKey).repository
                ?? sourcesByKey.get(selected.pack.sourceKey).location}</dd>
              {sourcesByKey.get(selected.pack.sourceKey).type === 'remote' && <>
                <dt>Tracked ref</dt><dd className={s.code}>{sourcesByKey.get(selected.pack.sourceKey).ref}</dd></>}
            </>}
            <dt>Declared tools</dt><dd>Not acquired in this snapshot.</dd>
          </dl>
          {selected.pack.installed ? <>
            <h3 className={s.packMetadataHeading}>Recorded installed source</h3>
            <RecordedSource source={selected.pack.source} />
            <p className={s.prose} data-pack-source-explanation>{sourceExplanation(selected, packs, sourcesByKey)}</p>
            <details open className={s.packFiles}>
              <summary>Recorded files ({selected.pack.files?.length ?? 'unknown'})</summary>
              {selected.pack.files ? selected.pack.files.length ? <ul>{selected.pack.files.map(file =>
                <li key={file}><code className={s.code}>{file}</code></li>)}</ul> : <Text>No files recorded.</Text>
                : <Text>Recorded files unavailable.</Text>}
            </details>
            <Text className={s.eyebrow}>Membership and files: .dude/metadata/profile.md. Recorded source does not verify installed bytes.</Text>
          </> : <div className={s.tight}><h3 className={s.packMetadataHeading}>Projected files</h3>
            <Text>Not acquired in this snapshot.</Text></div>}
          </>}
        </div>
        <footer className={s.packDetailFooter}><Button onClick={close}>Back to results</Button></footer>
      </>}
    </dialog>
    <dialog ref={requestDialog} className={s.packRequestDialog} aria-labelledby={`${id}-request-heading`}
      aria-describedby={`${id}-request-status`} data-pack-request-dialog
      onCancel={event => { event.preventDefault(); setRequestView(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRequestView(null); }
        else trapTab(event, requestDialog.current);
      }}>
      {shownRequest && <>
        <header className={s.packDetailHeader}>
          <div className={s.grow}><Text className={s.eyebrow}>Workspace pack request</Text>
            <h2 id={`${id}-request-heading`} className={s.subheading}>
              {OPERATIONS[shownRequest.operation]} {shownRequest.name}
            </h2></div>
          <Button ref={requestClose} appearance="subtle" icon={<DismissRegular />} aria-label="Close pack request"
            onClick={() => setRequestView(null)} />
        </header>
        <div className={s.packDetailBody} tabIndex={0} role="region" aria-label="Pack request outcome">
          {requestSourceOf(shownRequest) && <dl className={s.packMetadata} data-pack-request-source>
            <dt>{shownRequest.operation === 'install' ? 'Requested from' : 'Source'}</dt>
            <dd>{requestSourceOf(shownRequest).label}</dd>
          </dl>}
          <div id={`${id}-request-status`} role="status" aria-live="polite" aria-atomic="true"
            className={s.tight} data-pack-request-phase={shownRequest.phase}>
            <Text weight="semibold">{PHASES[shownRequest.phase][0]}</Text>
            <p className={s.prose}>{shownRequest.message || PHASES[shownRequest.phase][1]}</p>
            {outcome && <p className={s.prose}>{outcome.note}</p>}
            {outcome?.result?.ok === false && <p className={s.prose}>{outcome.result.error}</p>}
            {outcome && outcome.outcome !== 'applied' && <Text>{MUTATIONS[outcome.mutation]}</Text>}
          </div>
          {permission && <Button className={s.back} appearance="primary" data-pack-permission={permission.requestHandle}
            onClick={() => onPermission('pack', shownRequest.record.packReceipt)}>Open Needs you</Button>}
          {shownRequest.record && <Text className={s.code}>Receipt: {shownRequest.record.packReceipt}</Text>}
          <Text className={s.eyebrow}>Closing or navigating away does not cancel an admitted request. Reading pack information never repeats it.</Text>
        </div>
        <footer className={s.packDetailFooter}><Button onClick={() => setRequestView(null)}>Return to packs</Button></footer>
      </>}
    </dialog>
    <RemoveSourceDialog source={removing} busy={Boolean(removal?.busy)} refusal={removal?.refusal ?? null}
      onConfirm={confirmRemove} onClose={closeRemoval} onReload={() => { data.reloadPacks(); closeRemoval(); }} />
    </div>
    <AboutPanel id={`${id}-about`} labelledBy={`${id}-section-about`} shown={active && section === 'about'}
      readAbout={data.readAbout} />
  </div>;
}

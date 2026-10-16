import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader,
  DataGridHeaderCell, DataGridRow, Dropdown, Field, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Option, Spinner,
  Switch, Tab, TabList, Text,
} from '@fluentui/react-components';
import { ArrowClockwiseRegular, ChevronLeftRegular, ChevronRightRegular, DismissRegular, bundleIcon, Info20Filled, Info20Regular,
  PaintBrush20Filled, PaintBrush20Regular, PuzzlePiece20Filled, PuzzlePiece20Regular } from '@fluentui/react-icons';
import { AboutPanel } from './about.jsx';
import { ArtifactImport, NEW_SESSION } from './artifact-import.jsx';
import { besideLibrary, catalogCoverageText, RemoveSourceDialog, removalRefusal, blockersOf, SourceBody, sourceLabel, sourcePlace,
  SourcesPanel, sourceStatus, sourceWriteReason } from './pack-sources.jsx';
import { Markdown } from './markdown.jsx';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { rereadPreference, retryPreferenceRead, toggleFollowAppTheme, useAppearanceSettings } from './theme.js';
import { importRequestStatus, packActionReason } from './use-canvas-data.js';

// Installed and Available list 25 rows per page. Filtering always runs first.
const PAGE_SIZE = 25;
const INITIAL_VIEW = { context: 'installed', tag: '', source: '', page: 1, selected: null };
// Packs stays first, as the entry section; Appearance follows GitHub's and macOS Settings; About stays last.
const SECTIONS = [['packs', 'Packs', bundleIcon(PuzzlePiece20Filled, PuzzlePiece20Regular)],
  ['appearance', 'Appearance', bundleIcon(PaintBrush20Filled, PaintBrush20Regular)],
  ['about', 'About', bundleIcon(Info20Filled, Info20Regular)]];
const CONTEXTS = [['installed', 'Installed'], ['available', 'Available']];
// The Packs views: the two lists, the import view beside them, then Sources.
const SUBS = [...CONTEXTS, ['import', 'Add/import'], ['sources', 'Sources']];
const OPERATIONS = { install: 'Install', remove: 'Remove', refresh: 'Refresh pack' };
const TYPES = { pack: 'Pack', agent: 'Agent', skill: 'Skill' };
const PROJECT_NOTE = 'Read only. Project agents and skills are project files, not packs: Canvas offers no install, refresh, or remove for them here.';
// Details (080): the section's fixed wording.
const DETAILS_NONE = 'No details found.';
const DETAILS_TOO_LARGE = 'Not shown: larger than 64 KiB';
const DETAILS_GITHUB_NOTE = 'Member READMEs are not read from GitHub before installation.';
// 084: Bundle upstream beside a local library. Before the first Reload, Available says what Reload packs adds;
// filtered to that source with nothing listed, it says where the packs Local library also has are listed.
const upstreamNote = upstream => `Reload packs also reads Bundle upstream (${sourcePlace(upstream)}) and adds the packs that Local library does not have.`;
const LOCAL_WINS = 'Packs that Local library also has are listed from Local library.';
// 083: the pack action dialog's words, as the approved mock gives them.
const VERBS = { install: 'Install', remove: 'Remove', refresh: 'Refresh' };
const DOING = { install: 'Installing...', remove: 'Removing...', refresh: 'Refreshing...' };
const DONE = { install: 'Installed', remove: 'Removed', refresh: 'Refreshed' };
// FR-019: exactly one of these follows "<Verb> failed", which states the failure in words.
const FAILURES = { none: 'Nothing changed', restored: 'Failed; your files were restored',
  uncertain: 'Failed; restoration unconfirmed. Check Installed.' };
const CHANGED = 'Installed packs or sources changed since this preview.';
const NOTHING = 'Nothing changed.';
const CANCELLING = 'Cancelling...';
const REMOVE_RETURN = 'Returns to Available after Reload packs.';
const THIRD_PARTY = 'This pack is not part of the Dude bundle. It can add agents and instructions to this project.';
const OVERWRITE = "Refresh replaces the files below with the source's copies. Keep lasting changes in dude-local-* files.";
// Where focus goes when a phase starts: the safe Cancel first, the body while an action runs, the result's own button.
const ACTION_FOCUS = { loading: 'cancel', ready: 'cancel', blocked: 'cancel', applying: 'body', cancelling: 'body',
  success: 'primary', failed: 'cancel', cancelled: 'cancel', changed: 'primary' };
// An installed file names its item the way Compose's preview does: `.github/<kind>/<entry>`, less the kind's suffix.
const ITEM_KINDS = { agents: ['Agent', '.agent.md'], skills: ['Skill', ''], prompts: ['Prompt', '.prompt.md'],
  instructions: ['Instructions', '.instructions.md'] };
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
      + `Description, use cases, and details come from the default catalog${fallback ? ` (${fallback})` : ''} by pack name. A confirmed refresh records a current source.`;
  }
  return `The recorded source matches ${sourcesByKey.get(row.group)?.name ?? 'a current source'}, which also supplies this pack's description, use cases, and details.`;
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

/**
 * A pack's documents: its pack.md, then each member skill's README. An
 * installed pack's pack.md follows its description, so until a catalog read
 * supplies it, the description's not-read or unavailable reason takes its place.
 */
function packDocuments(pack, catalogState) {
  if (!pack.installed || pack.description !== null) return pack.documents;
  return [{ path: 'pack.md', reason: catalogState === 'not_read' ? 'pack.md not read. Choose Reload packs to read catalogs.'
    : 'pack.md unavailable; no readable catalog record.' }, ...pack.documents];
}

// Withheld files, or an entrypoint that is unreadable or has an unclosed
// metadata header, give the row's own reason instead of documents (FR-013).
const projectDetailsReason = project => project.files.state === 'withheld'
  ? `Not shown. ${project.files.message}` : project.declaredName.message;

/**
 * Details (080), directly after the facts at the position 073 reserves: one
 * button per document, labeled with its path, that opens it in the reader. A
 * document over 64 KiB is listed by its path alone. Documents arrive with the
 * row, so nothing here reads or waits.
 */
function DetailsSection({ documents, reason = null, note = null, onRead }) {
  const s = useCanvasStyles();
  return <div className={s.tight} data-pack-details>
    <h3 className={s.packMetadataHeading}>Details</h3>
    {reason ? <Text>{reason}</Text> : documents.length ? <ul className={s.packDocuments}>
      {documents.map(doc => <li key={doc.path}>
        {doc.reason ? <Text>{doc.reason}</Text> : doc.tooLarge ? <>
          <Text>{doc.path}</Text><Text className={s.eyebrow}>{DETAILS_TOO_LARGE}</Text>
        </> : <Button className={s.packDocument} aria-haspopup="dialog" data-pack-document={doc.path}
          onClick={event => onRead(doc, event.currentTarget)}>{doc.path}</Button>}
      </li>)}
    </ul> : <Text>{DETAILS_NONE}</Text>}
    {note && <Text className={s.eyebrow}>{note}</Text>}
  </div>;
}

// The facts a project row's file read supports, never more: a complete list
// counts its files, a partial one says what was and was not read, and a
// withheld one has no count at all, only its reason.
const fileCount = files => files.state === 'complete' ? `${files.count} ${files.count === 1 ? 'file' : 'files'}`
  : files.state === 'partial' ? `${files.count} read; ${files.notRead.length} not read` : `Unavailable. ${files.message}`;

/**
 * Project agent or skill details after the heading (FR-075, FR-086): coverage
 * notices, the description, a read-only note, facts, Details, Files, and the
 * new-session caveat. Every value and path is a text child, so nothing here is
 * a link, HTML, or an action; a Details button only opens its document.
 */
function ProjectBody({ row, coverage, onRead }) {
  const s = useCanvasStyles();
  const { description, declaredName, files, documents } = row.project;
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
    <DetailsSection documents={documents} reason={documents ? null : projectDetailsReason(row.project)} onRead={onRead} />
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
  const stops = [...dialog.querySelectorAll('button:not(:disabled), summary, a[href], [tabindex="0"]')]
    .filter(node => node.getClientRects().length);
  const first = stops[0], last = stops.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/* ---------------------------------------------------------- 083: the pack action dialog */

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const listWords = words => (words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')}, and ${words.at(-1)}`);
/** @param {string} file */
function fileItem(file) {
  const [, kind = '', entry = file] = /^\.github\/([^/]+)\/(.+)$/.exec(file) ?? [];
  const [word = '', suffix = ''] = ITEM_KINDS[kind] ?? [];
  return { kind: word, name: suffix && entry.endsWith(suffix) ? entry.slice(0, -suffix.length) : entry };
}
// The recorded source in words: its folder, or its repository at the recorded ref.
const recordedText = source => !source ? 'an unreadable record'
  : source.type === 'local' ? source.location : `${source.repository} @ ${source.requested_ref}`;

/**
 * Why a preview cannot be applied, in the order a person can act on it: a
 * missing tool, a conflicting file, or Compose's own reason when it could make
 * no preview at all (an unreachable source, a pack no longer listed or installed).
 */
function blockedReason(name, value) {
  if (!value.preview) return value.message || 'Compose could not preview this action. Nothing changed.';
  const missing = (value.preview.tools ?? []).filter(tool => !tool.found).map(tool => tool.name);
  if (missing.length) return `${name} needs ${listWords(missing)}, which ${missing.length === 1 ? 'is' : 'are'} not on PATH.`;
  const conflicts = value.preview.conflicts ?? [];
  if (conflicts.length) {
    return conflicts.length === 1 ? `A file this pack adds already exists: ${conflicts[0]}`
      : `Files this pack adds already exist: ${conflicts.join(', ')}`;
  }
  return value.message || 'This preview cannot be applied. Nothing changed.';
}

/** Why the route answered without a preview or a Compose result. `applying` says whether a write may have begun. */
function routeProblem(code, applying) {
  if (code === 'connection_lost') {
    return applying ? 'The connection to Canvas was interrupted before the result arrived.'
      : 'The connection to Canvas was interrupted. Nothing changed.';
  }
  if (code === 'busy') return 'Another pack action is running in this Canvas. Nothing changed.';
  if (code === 'identity_mismatch') return 'The workspace changed or this Canvas closed. Nothing changed.';
  return 'Canvas could not run this action. Nothing changed.';
}

// The mock's bar: the title, then its lines 4px apart, with no gap between title and lines.
function ActionBar({ intent, title, lines = [] }) {
  const s = useCanvasStyles();
  return <MessageBar intent={intent} layout="multiline" className={mergeClasses(s.notice, s.packActionBar)}>
    <MessageBarBody>
      <MessageBarTitle>{title}</MessageBarTitle>
      {lines.length > 0 && <div className={s.tight}>{lines.map((line, index) => <span key={index}>{line}</span>)}</div>}
    </MessageBarBody>
  </MessageBar>;
}

// FR-009: a source the project added, named in words with its commit, or its folder and "no commit".
function ThirdPartyBar({ source }) {
  const s = useCanvasStyles();
  const remote = source?.type === 'remote';
  return <ActionBar intent="warning" title="Third-party source" lines={[THIRD_PARTY, ...(remote
    ? [<>Repository: <code className={s.code}>{source.repository}</code></>,
      <>Commit: <code className={s.code}>{source.resolved_commit}</code></>]
    : [<>Folder: <code className={s.code}>{source?.location}</code> (no commit)</>])]} />;
}

function ItemList({ items }) {
  const s = useCanvasStyles();
  return <ul className={s.packActionItems}>{items.map((item, index) => <li key={`${index}:${item.kind}:${item.name}`}>
    <span className={s.packActionItemName}>{item.name}</span><span className={s.packActionItemKind}>{item.kind}</span>
  </li>)}</ul>;
}

function FileList({ files }) {
  const s = useCanvasStyles();
  return <ul>{files.map(file => <li key={file}><code className={s.code}>{file}</code></li>)}</ul>;
}

function FileGroup({ heading, files }) {
  const s = useCanvasStyles();
  return <div className={mergeClasses(s.tight, s.packFiles)}>
    <h3 className={s.packMetadataHeading}>{heading}</h3>
    {files.length > 0 && <FileList files={files} />}
  </div>;
}

/**
 * The source a preview read when the action named no source the project added
 * (084, FR-026): Compose's default resolution reads Local library when it has
 * the pack, else Bundle upstream, so a folder is the default row and a
 * repository is the Bundle upstream row. Null before a preview, or when the
 * action's own source is the one read.
 */
function resolvedSource(action, preview) {
  if (!action.resolves || !preview?.source) return null;
  return (preview.source.type === 'remote' ? action.resolves.upstream : action.resolves.fallback) ?? null;
}

/** What a ready or blocked preview shows (FR-004 to FR-006, FR-009); a preview Compose could not make shows only the source. */
function PreviewBody({ action, step }) {
  const s = useCanvasStyles();
  const { preview } = step;
  const third = step.thirdParty && preview ? <ThirdPartyBar source={preview.source} /> : null;
  if (action.operation === 'remove') {
    return preview ? <FileGroup heading={`Deletes ${plural(preview.files.length, 'recorded file')}`} files={preview.files} />
      : <p className={s.prose}>No recorded files to delete.</p>;
  }
  // 084: the ready view names the source the preview read, with the full commit for Bundle upstream beside a local
  // library (FR-021), and Source changes compares that source with the recorded one (FR-027).
  const resolved = resolvedSource(action, preview);
  const label = resolved ? sourceLabel(resolved) : action.label;
  const commit = besideLibrary(resolved) ? preview.source.resolved_commit : null;
  const changes = !resolved ? action.changes : resolved.key === action.resolves.recordedKey ? null
    : `${recordedText(action.resolves.recorded)} -> ${resolved.name} (${resolved.repository ?? resolved.location})`;
  const commitFact = commit && <><dt>Commit</dt><dd><code className={s.code}>{commit}</code></dd></>;
  if (action.operation === 'install') {
    const tools = preview?.tools ?? [];
    return <>
      {third}
      {preview && <div className={s.tight}>
        <h3 className={s.packMetadataHeading}>{`Adds ${plural(preview.items.length, 'item')}`}</h3>
        <ItemList items={preview.items} />
      </div>}
      <dl className={s.packMetadata}>
        {preview && <><dt>Required tools</dt><dd>{tools.length
          ? tools.map(tool => `${tool.name}: ${tool.found ? 'found' : 'missing'}`).join(', ') : 'None'}</dd></>}
        <dt>Source</dt><dd>{label}</dd>
        {commitFact}
      </dl>
      {preview && <>
        <Text className={s.eyebrow}>{NEW_SESSION}</Text>
        <details className={s.packFiles}>
          <summary>{`Show files (${preview.files.length})`}</summary>
          <FileList files={preview.files} />
        </details>
      </>}
    </>;
  }
  return <>
    {third}
    <dl className={s.packMetadata}>
      <dt>Source</dt><dd>{label}</dd>
      {commitFact}
      {preview && changes && <><dt>Source changes</dt><dd>{changes}</dd></>}
    </dl>
    {preview && <>
      <ActionBar intent="warning" title="Local edits are overwritten" lines={[OVERWRITE]} />
      <FileGroup heading={`Replaced (${preview.replaced.length})`} files={preview.replaced} />
      <FileGroup heading={`Added (${preview.added.length})`} files={preview.added} />
      <FileGroup heading={`Removed (${preview.removed.length})`} files={preview.removed} />
      <Text className={s.eyebrow}>{NEW_SESSION}</Text>
    </>}
  </>;
}

/** What an apply ended in: what Compose installed, removed, or refreshed, or why nothing or not everything changed. */
function ResultBody({ action, step }) {
  const s = useCanvasStyles();
  const { operation, name } = action;
  if (step.phase === 'cancelled') return <ActionBar intent="info" title={NOTHING} />;
  if (step.phase === 'changed') return <ActionBar intent="warning" title={CHANGED} lines={[NOTHING]} />;
  if (step.phase === 'failed') {
    return <>
      <ActionBar intent="error" title={`${VERBS[operation]} failed`} lines={[FAILURES[step.failure]]} />
      {step.message && <details className={s.packFiles}>
        <summary>Compose&apos;s message</summary>
        <p className={mergeClasses(s.code, s.packActionMessage)}>{step.message}</p>
      </details>}
    </>;
  }
  const result = step.result ?? {};
  if (operation === 'install') {
    // The files Compose actually installed, which a folder changed since the preview may have changed (FR-018).
    const items = Array.isArray(result.files) ? result.files.map(fileItem) : step.preview?.items ?? [];
    return <>
      <ActionBar intent="success" title={`Installed ${name}`} lines={[NEW_SESSION]} />
      <div className={s.tight}>
        <h3 className={s.packMetadataHeading}>{`Added ${plural(items.length, 'item')}`}</h3>
        <ItemList items={items} />
      </div>
    </>;
  }
  if (operation === 'remove') {
    const files = result.files ?? step.preview?.files ?? [];
    return <ActionBar intent="success" title={`Removed ${name}`}
      lines={[`Deleted ${plural(files.length, 'recorded file')}.`, REMOVE_RETURN]} />;
  }
  const replaced = result.replaced ?? [], added = result.added ?? [], removed = result.removed ?? [];
  const summary = listWords([`replaced ${plural(replaced.length, 'file')}`,
    ...(added.length ? [`added ${added.length}`] : []), ...(removed.length ? [`removed ${removed.length}`] : [])]);
  return <ActionBar intent="success" title={`Refreshed ${name}`}
    lines={[`${summary[0].toUpperCase()}${summary.slice(1)}.`, NEW_SESSION]} />;
}

/**
 * The pack action dialog (FR-001 to FR-020): Install, Remove, or Refresh pack in
 * one native modal over the pack's details. It is the 080 reader's surface,
 * header, and body, with the Remove source dialog's footer, so the title and
 * buttons stay in place and only the body scrolls. Compose previews the change,
 * one click on the verb applies that preview, and Compose's own result shows in
 * place. No request, receipt, Needs you, or chat message is involved.
 *
 * `action` is what the details' button asked for, or null when closed. Escape
 * is Cancel, Close, or Done where the state offers one, and does nothing while
 * Removing or Cancelling. `onClose()` and `onShow(key)` belong to Settings,
 * which owns the details the focus returns to.
 */
function PackActionDialog({ action, shown, data, showKey, showReason, onClose, onShow }) {
  const s = useCanvasStyles(), ids = useId();
  const dialog = useRef(null), body = useRef(null), cancelButton = useRef(null), primaryButton = useRef(null);
  const [step, setStep] = useState({ id: null, phase: 'loading' });
  // The live run: its preview's abort, and the token its one apply and Cancel use.
  const run = useRef(null), focusNext = useRef(null);
  const current = action && step.id === action.id ? step : { id: action?.id ?? null, phase: 'loading' };
  const { phase } = current;

  // Each change names where focus goes, or keeps it where it is while that control still works.
  const go = (change, focus = null) => {
    focusNext.current = focus ?? 'keep';
    setStep(previous => ({ ...(previous.id === change.id ? previous : {}), ...change }));
  };
  // Loading shows at once with Cancel, and nothing changes while Compose checks (FR-002). Preview again starts here too.
  const preview = () => {
    run.current?.controller.abort();
    const live = { controller: new AbortController(), token: null };
    run.current = live;
    const { id, operation, name, source } = action;
    go({ id, phase: 'loading', preview: null, thirdParty: false, reason: null, result: null, failure: null, message: null }, 'cancel');
    void data.packAction({ op: 'preview', operation, name, ...(source ? { source } : {}) }, live.controller.signal).then(answer => {
      if (run.current !== live || live.controller.signal.aborted) return;
      if (!answer.ok) { go({ id, phase: 'blocked', reason: routeProblem(answer.code, false) }); return; }
      const value = answer.value;
      live.token = value.token;
      go(value.token ? { id, phase: 'ready', preview: value.preview, thirdParty: value.thirdParty }
        : { id, phase: 'blocked', preview: value.preview, thirdParty: value.thirdParty, reason: blockedReason(name, value) });
    });
  };
  // One click on the verb is the only confirmation (FR-011), and it applies this preview once (FR-012).
  const apply = () => {
    const live = run.current;
    if (phase !== 'ready' || !live?.token) return;
    const { id } = action;
    go({ id, phase: 'applying' }, 'body');
    void data.packAction({ op: 'apply', token: live.token }).then(answer => {
      if (run.current !== live) return;
      const outcome = answer.ok ? answer.value : null;
      if (outcome?.ok) go({ id, phase: 'success', result: outcome.result }, 'primary');
      else if (outcome) {
        go({ id, phase: 'failed', failure: FAILURES[outcome.mutation] ? outcome.mutation : 'uncertain',
          message: outcome.error }, 'cancel');
      } else if (answer.code === 'changed') go({ id, phase: 'changed' }, 'primary');
      else if (answer.code === 'cancelled') go({ id, phase: 'cancelled' }, 'cancel');
      // A lost answer may follow a write; every other refusal came before one.
      else {
        go({ id, phase: 'failed', failure: answer.code === 'connection_lost' ? 'uncertain' : 'none',
          message: routeProblem(answer.code, true) }, 'cancel');
      }
    });
  };
  // Cancel while Install or Refresh applies (FR-017). The apply answers either way: cancelled, or, once
  // writing has started, its real result. Remove offers no Cancel.
  const cancelApply = () => {
    if (phase !== 'applying' || action.operation === 'remove' || !run.current?.token) return;
    go({ id: action.id, phase: 'cancelling' }, 'body');
    void data.packAction({ op: 'cancel', token: run.current.token });
  };
  const dismiss = () => {
    if (phase === 'applying' || phase === 'cancelling') return;
    run.current?.controller.abort();   // a preview still loading is cancelled with its request
    onClose();
  };
  const escape = () => { if (phase === 'applying') cancelApply(); else dismiss(); };

  useLayoutEffect(() => {
    const node = dialog.current;
    if (action && shown) { if (!node.open) node.showModal(); }
    else if (node.open) node.close();
  }, [action, shown]);
  useLayoutEffect(() => {
    if (!action) return undefined;
    preview();
    return () => { run.current?.controller.abort(); run.current = null; };
  }, [action]);
  useLayoutEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (!target || !dialog.current?.open) return;
    const usable = node => Boolean(node?.isConnected && !node.disabled && node.getClientRects().length);
    if (target === 'keep' && dialog.current.contains(document.activeElement) && usable(document.activeElement)) return;
    const node = { cancel: cancelButton, primary: primaryButton, body }[target === 'keep' ? ACTION_FOCUS[phase] : target]?.current;
    (usable(node) ? node : body.current)?.focus({ preventScroll: true });
  }, [step]);

  const op = action?.operation;
  const verb = op ? VERBS[op] : '';
  const title = action ? `${verb} ${action.name}` : '';
  const running = phase === 'applying' || phase === 'cancelling';
  const cancelText = { loading: 'Cancel', ready: 'Cancel', changed: 'Cancel', applying: 'Cancel', blocked: 'Close',
    failed: 'Close', cancelled: 'Close' }[phase];
  const cancelShown = Boolean(cancelText) && !(phase === 'applying' && op === 'remove');
  const primaryText = { ready: verb, blocked: verb, changed: 'Preview again', success: 'Done' }[phase];
  const showShown = phase === 'success' && op === 'install';
  // The reason for a disabled button sits beside it (FR-008), tied to it for assistive technology.
  const reason = phase === 'blocked' ? current.reason : showShown && !showKey ? showReason : '';
  const status = phase === 'loading' ? action?.checking : phase === 'applying' ? DOING[op] : phase === 'cancelling' ? CANCELLING : null;
  const live = !action ? '' : {
    loading: action.checking, ready: `${title}: preview ready.`, blocked: `${verb} is not available. ${current.reason}`,
    applying: DOING[op], cancelling: CANCELLING, cancelled: NOTHING, changed: `${CHANGED} ${NOTHING}`,
    failed: `${verb} failed. ${FAILURES[current.failure]}`,
    success: `${DONE[op]} ${action.name}.${showShown && !showKey ? ` ${showReason}` : ''}`,
  }[phase];

  return <dialog ref={dialog} className={mergeClasses(s.packDialog, s.packActionDialog)} aria-labelledby={`${ids}-title`}
    data-pack-action-dialog="" data-pack-action={action ? op : undefined} data-pack-action-phase={action ? phase : undefined}
    onCancel={event => { event.preventDefault(); escape(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); escape(); }
      else trapTab(event, dialog.current);
    }}>
    {action && <>
      <header className={s.packDetailHeader}>
        <h2 id={`${ids}-title`} className={mergeClasses(s.subheading, s.grow)}>{title}</h2>
        <Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" title="Close" disabled={running}
          data-pack-action-close onClick={() => dismiss()} />
      </header>
      <div ref={body} className={mergeClasses(s.packDetailBody, s.packActionBody)} tabIndex={0} role="region"
        aria-labelledby={`${ids}-title`} data-pack-action-body>
        {status ? <div className={s.packActionStatus}><Spinner size="extra-tiny" aria-hidden="true" /><Text>{status}</Text></div>
          : phase === 'ready' || phase === 'blocked' ? <PreviewBody action={action} step={current} />
            : <ResultBody action={action} step={current} />}
      </div>
      {(cancelShown || primaryText) && <footer className={mergeClasses(s.packDetailFooter, s.sourceDialogFooter, s.packActionFooter)}>
        {reason && <Text id={`${ids}-reason`} className={mergeClasses(s.eyebrow, s.packActionNote)} data-pack-action-reason>{reason}</Text>}
        {cancelShown && <Button ref={cancelButton} data-pack-action-cancel
          onClick={() => (phase === 'applying' ? cancelApply() : dismiss())}>{cancelText}</Button>}
        {showShown && <Button disabled={!showKey} aria-describedby={showKey ? undefined : `${ids}-reason`}
          data-pack-action-show onClick={() => { if (showKey) onShow(showKey); }}>Show in Installed</Button>}
        {primaryText && <Button ref={primaryButton} appearance="primary" disabled={phase === 'blocked'}
          aria-describedby={phase === 'blocked' ? `${ids}-reason` : undefined} data-pack-action-primary
          onClick={() => (phase === 'changed' ? preview() : phase === 'success' ? dismiss() : apply())}>{primaryText}</Button>}
      </footer>}
      <p className={s.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{live}</p>
    </>}
  </dialog>;
}

/*
 * Settings > Appearance (085): one Fluent Switch for the one saved choice. It
 * shows the confirmed choice only; a save or read in flight keeps it
 * focusable but inert, and its outcome is announced, with no visible "Saved".
 */
const APPEARANCE_HINT = "Uses the GitHub app's colors, fonts, and text sizes. Controls and layout stay the same. "
  + "Applies to all your projects on this computer. Turn off to use Dude's own look.";
const APPEARANCE_PENDING = { saving: 'Saving...', checking: 'Checking whether it was saved...', reading: 'Reading the saved choice...' };
const APPEARANCE_NO_HOST = "The GitHub app's theme isn't available here, so Canvas uses Dude's own look. Your choice stays on.";
/** @param {string|null} message @param {boolean} confirmed */
function appearanceMessage(message, confirmed) {
  const choice = confirmed ? 'on' : 'off';
  return {
    'save-failed': { intent: 'error', title: 'Not saved', text: `Canvas couldn't save your choice on this computer. Follow GitHub app theme is still ${choice}, and the look hasn't changed. Use the switch to try again.` },
    'not-saved': { intent: 'error', title: 'Not saved', text: `The save didn't finish. Canvas read the saved choice again: Follow GitHub app theme is still ${choice}, and the look hasn't changed. Use the switch to try again.` },
    'read-failed': { intent: 'warning', title: 'Saved choice not read', retry: true, text: "Canvas couldn't read your appearance choice on this computer, so it uses Dude's own look for now. Nothing was changed." },
    'read-failed-later': { intent: 'warning', title: 'Saved choice not read', retry: true, text: `Canvas couldn't read your appearance choice just now, so it keeps the last choice it confirmed: ${choice}. Nothing was changed.` },
  }[message] ?? null;
}

/**
 * The Appearance section panel, About's sheet with one field. Entering it
 * reads the saved choice again; it reads no pack and sends nothing else. It is
 * a focus stop only while it has something to scroll.
 */
function AppearancePanel({ id, labelledBy, shown }) {
  const s = useCanvasStyles();
  const state = useAppearanceSettings();
  const panel = useRef(null), toggle = useRef(null), focusRequest = useRef(state.focusSwitch);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => { if (shown) void rereadPreference(); }, [shown]);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!shown) return;
    const measure = () => setScrolls(node.scrollHeight > node.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [shown]);
  // A successful Retry moves focus to the switch it confirmed.
  useEffect(() => {
    if (state.focusSwitch === focusRequest.current) return;
    focusRequest.current = state.focusSwitch;
    if (shown) toggle.current?.focus();
  }, [state.focusSwitch, shown]);
  const pending = Boolean(state.pending);
  const message = appearanceMessage(state.message, state.confirmed);
  return <div ref={panel} role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={!shown}
    tabIndex={shown && scrolls ? 0 : undefined} className={s.aboutPanel} data-appearance-panel>
    {shown && <div className={s.aboutBody}>
      <Field hint={APPEARANCE_HINT}>
        <Switch ref={toggle} checked={state.confirmed} disabledFocusable={pending} label="Follow GitHub app theme"
          className={s.followSwitch} onChange={() => void toggleFollowAppTheme()} data-follow-app-theme />
      </Field>
      {pending && <Spinner size="extra-tiny" label={APPEARANCE_PENDING[state.pending]} className={s.appearancePending}
        data-appearance-pending={state.pending} />}
      {message && <MessageBar intent={message.intent} layout="multiline" className={mergeClasses(s.notice, s.narrowBar)}
        data-appearance-message={state.message}>
        <MessageBarBody>
          <MessageBarTitle>{message.title}</MessageBarTitle>
          <div>{message.text}</div>
        </MessageBarBody>
        {message.retry && <MessageBarActions className={s.narrowBarActions}>
          <Button appearance="primary" size="medium" disabledFocusable={pending} onClick={() => void retryPreferenceRead()}
            data-appearance-retry>Retry</Button>
        </MessageBarActions>}
      </MessageBar>}
      {state.confirmed && !state.hostSupplied && <MessageBar intent="info" layout="multiline" role="note"
        aria-label="GitHub app theme not available" className={mergeClasses(s.notice, s.narrowBar)} data-appearance-note>
        <MessageBarBody><div>{APPEARANCE_NO_HOST}</div></MessageBarBody>
      </MessageBar>}
      <p className={s.visuallyHidden} role="status" aria-live="polite" aria-atomic="true" data-appearance-status>{state.status}</p>
      <p className={s.visuallyHidden} role="alert" aria-atomic="true" data-appearance-alert>{state.alert}</p>
    </div>}
  </div>;
}

/**
 * Settings holds three local sections. Packs stays mounted while Appearance
 * or About is shown, so its view, selection, and pack action survive a section
 * switch; only its dialogs close, and they reopen on return under the existing
 * focus rules. The saved appearance choice lives outside this workspace-keyed
 * component. The Packs view (sub: Installed, Available, or Add/import) belongs
 * to the shell, which names it in the footer and header, and clears it with the section.
 * Add/import keeps its typed Source here; the list view is kept beside it, so a
 * trip to Add/import and back keeps the filters, page, and selection.
 */
export function Settings({ data, active, section, onSection, sub, onSub, onPermission }) {
  const { packs, packsLoading: loading, issues: { packs: issue } } = data;
  const s = useCanvasStyles(), id = useId();
  const packsShown = active && section === 'packs';
  const onSources = sub === 'sources';
  // The open list or Sources owns the one shared details pane and, for a list,
  // the pack action dialog. Add/import owns neither.
  const listShown = packsShown && sub !== 'import';
  const [view, setView] = useState(() => ({ ...INITIAL_VIEW, snapshot: packs }));
  // The open pack action: what a details button asked for, until its dialog closes.
  const [action, setAction] = useState(null);
  // Sources keeps its own selection beside the list view, so a trip to Sources
  // and back keeps the filters, page, and selected pack, and the reverse.
  const [sourceKey, setSourceKey] = useState(null);
  const [sourceNote, setSourceNote] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [learned, setLearned] = useState({});
  // The document the reader shows: { key, title, doc } for the details item that opened it.
  const [reading, setReading] = useState(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1099px)').matches);
  const heading = useRef(null), results = useRef(null), panel = useRef(null), filter = useRef(null), detail = useRef(null);
  const closeButton = useRef(null), returnToRow = useRef(false), reveal = useRef(null), strip = useRef(null);
  const last = useRef({ list: null, sources: null });
  const actionSequence = useRef(0), actionReturn = useRef(null);
  const reader = useRef(null), readerBody = useRef(null), readerTrigger = useRef(null), readerReturn = useRef(false);
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
  // The reader belongs to one details item: it closes with its details, or when they show another item.
  if (reading && (!listShown || reading.key !== detailKey)) setReading(null);
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
  // 084: Bundle upstream beside a local library. Before the first Reload, Available says what Reload packs adds
  // (FR-009, FR-010); filtered to that source after a read that left it no Available row, it says why (FR-016).
  const upstream = sourceRows.find(item => besideLibrary(item)) ?? null;
  const filteredSource = filters.source ? sourcesByKey.get(filters.source) : null;
  const localWins = current.context === 'available' && besideLibrary(filteredSource) && filteredSource.status === 'read';
  const count = !shown ? 'Count unavailable' : !matches.length ? `0${known ? ' known' : ''} matches`
    : `${offset + 1}–${offset + visible.length} of ${matches.length}${known ? (filtered ? ' known matches' : ' known')
      : staleInstalled ? ' last read' : filtered ? ' matches' : ''}`;
  const pageLabel = !shown ? 'Unavailable' : !pages ? 'No pages' : `Page ${page} of ${pages}`;
  const viewLabel = value => value === 'import' ? 'Add/import' : value === 'sources' ? 'Sources'
    : `${CONTEXTS.find(([context]) => context === value)[1]} ${totals[value] ?? '?'}`;
  // Only a pack row owns operations, and each is keyed by the pack's name.
  const actions = selected?.pack ? selected.pack.installed ? ['refresh', 'remove'] : ['install'] : [];
  const actionReasons = Object.fromEntries(actions.map(operation => [operation, packActionReason(data, operation)]));
  const actionWhy = [...new Set(Object.values(actionReasons).filter(Boolean))].join(' ');
  // A pack action reads what the action itself reads: an install, its row's source (naming it only when the
  // project added it); a refresh, the source its record matches, added or built in, else the default catalog
  // (084 FR-025; the server matches only added sources, and Compose's default resolution reads the built-ins);
  // a removal, only the installed record. `changes` says when the refresh's source is not the recorded one, as
  // the server matched them by type and repository or folder, never by a ref. Without a source the project
  // added, `resolves` lets the ready view name the source the preview actually read (084 FR-026, FR-027).
  const openAction = (operation, trigger) => {
    const pack = selected.pack;
    const key = operation === 'install' ? pack.sourceKey : operation === 'remove' ? null
      : sourcesByKey.has(pack.sourceKey) ? pack.sourceKey : packs?.sources?.defaultKey ?? null;
    const source = key ? sourcesByKey.get(key) ?? null : null;
    const added = source?.scope === 'project';
    setAction({
      id: ++actionSequence.current, operation, name: selected.name, trigger,
      source: operation === 'install' && added ? key : null,
      checking: operation === 'remove' ? 'Checking installed files...' : `Checking ${source?.name ?? 'the default catalog'}...`,
      label: source ? sourceLabel(source) : operation === 'install' ? selected.label : 'Default catalog',
      changes: operation === 'refresh' && key !== pack.sourceKey
        ? `${recordedText(pack.source)} -> ${source ? `${source.name} (${source.repository ?? source.location})` : 'the default catalog'}`
        : null,
      resolves: operation === 'remove' || added ? null : {
        upstream: sourceRows.find(item => item.builtin === 'bundle-upstream') ?? null,
        fallback: sourcesByKey.get(packs?.sources?.defaultKey) ?? null,
        recordedKey: pack.sourceKey ?? null, recorded: pack.source ?? null,
      },
    });
  };
  // Closing returns focus to the button that opened the dialog, else the view's heading (see the effect below).
  const closeAction = () => {
    actionReturn.current = action && { trigger: action.trigger, operation: action.operation };
    setAction(null);
  };
  // Show in Installed after an install: the same local view change as Add/import's, which focuses the details' Close.
  const showActionPack = key => {
    actionReturn.current = null;
    setAction(null);
    showInstalled(key);
  };
  const actionShowKey = action?.operation === 'install' && !loading
    ? lists.installed.rows.find(row => row.pack && row.name === action.name)?.key ?? null : null;
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
  // scroll margin), whether the rows or the whole panel scroll. Only a row this
  // render still lists counts: the grid drops a gone row's node one render
  // later, so focusing that node would leave focus on nothing.
  const focusRow = key => {
    const row = (onSources ? sourceRows : visible).some(item => item.key === key) ? rowFor(key) : undefined;
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
  const closeReader = () => {
    readerReturn.current = true;
    setReading(null);
  };
  // The reader is a second native modal, stacked over the details at any
  // width, that opens on its scrolling body. Closing it by Escape or Close
  // returns focus to the button that opened it, or to the details' Close if
  // that button is gone (the pack action dialog's rule). It runs before the
  // details effect, so details closing with it still find focus inside them.
  useLayoutEffect(() => {
    const dialog = reader.current;
    if (reading) {
      if (!dialog.open) dialog.showModal();
      readerBody.current.scrollTop = 0;
      readerBody.current.focus({ preventScroll: true });
      return;
    }
    if (dialog.open) dialog.close();
    if (!readerReturn.current) return;
    readerReturn.current = false;
    const trigger = readerTrigger.current;
    (trigger?.isConnected && trigger.getClientRects().length ? trigger : closeButton.current)?.focus({ preventScroll: true });
  }, [reading]);
  // The one details pane serves the lists and Sources, each with its own last
  // selection, so a trip to the other keeps this one's focus rules intact.
  useLayoutEffect(() => {
    const dialog = detail.current;
    const focused = document.activeElement;
    if (!listShown) {
      if (dialog.open) dialog.close();
      return;
    }
    // The pack action dialog is the top layer. Keep the native detail mode
    // underneath it until it closes, and never reopen the details over it;
    // details whose row left the list (after an install or a removal) close now.
    if (action) {
      if (!detailKey && dialog.open) dialog.close();
      return;
    }
    // So is an open reader, which belongs to these details.
    if (reading) return;
    // A pack action dialog that just closed returns focus to the button that
    // opened it, else that button re-rendered, else the view's heading.
    const closing = actionReturn.current;
    actionReturn.current = null;
    if (!detailKey) {
      const restore = Boolean(closing) || returnToRow.current || (last.current[owner]
        && (dialog.contains(focused) || focused === document.body));
      // Native modal inertness ends before restoring a surviving row/heading.
      if (dialog.open) dialog.close();
      if (closing) heading.current?.focus({ preventScroll: true });
      else if (restore) { if (!focusRow(last.current[owner])) (onSources ? sourcesHeading : heading).current?.focus({ preventScroll: true }); }
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
    const usable = node => Boolean(node?.isConnected && node.getClientRects().length && !node.disabled);
    const trigger = closing && [closing.trigger, dialog.querySelector(`[data-pack-operation="${closing.operation}"]`)].find(usable);
    // Show in Installed, or a source just added: Close takes focus, and the row
    // is brought into view below the sticky header, whichever page and scroller hold it.
    if (reveal.current === detailKey) {
      reveal.current = null;
      closeButton.current?.focus({ preventScroll: true });
      revealRow(detailKey);
    } else if (trigger) trigger.focus({ preventScroll: true });
    else if (closing || last.current[owner] !== detailKey || changedMode) closeButton.current?.focus({ preventScroll: true });
    // A retained wide pane reopens beside the results without taking focus
    // from the section tab that revealed it; show() alone would move focus in.
    else if (!narrow && focused?.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
    last.current[owner] = detailKey;
  }, [listShown, detailKey, onSources, narrow, current.snapshot, action, reading]);

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
  // matched to it, and every installed pack an earlier refusal named. It is
  // advisory; the server decides again at the write, and no state feed makes it
  // authoritative.
  const usesOf = item => {
    // A refusal's blockers hold only until the next snapshot: a fresh read is the better authority.
    const named = learned[item.key]?.at === packs ? learned[item.key] : null;
    return { installed: [...new Set([...(item.installedNames ?? []), ...(named?.installed ?? [])])] };
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
  // A Details button opens its document in the reader, which reads nothing.
  const readDocument = (doc, trigger) => {
    readerTrigger.current = trigger;
    setReading({ key: detailKey, title: pane.title, doc });
  };

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
              {upstream && <Text>{upstreamNote(upstream)}</Text>}
              <Button appearance="primary" icon={<ArrowClockwiseRegular />} data-pack-reload onClick={() => data.reloadPacks()}>Reload packs</Button>
            </> : <>
              <Text weight="semibold">{!shown ? `${contextLabel} ${loading ? 'loading' : 'unavailable'}`
                : filtered && partialCatalog ? 'No known matching packs'
                  : filtered ? 'No matching packs' : current.context === 'installed' ? 'No installed packs' : 'No available packs'}</Text>
              <Text>{!shown ? 'This is not a confirmed empty list.'
                : filtered && partialCatalog ? (filters.source && sourcesByKey.get(filters.source)?.status === 'unavailable'
                  ? `${sourceLabel(sourcesByKey.get(filters.source))}: ${sourceStatus(sourcesByKey.get(filters.source)).text.replace(/[.\s]+$/, '')}. Its packs are not listed, so this is not a confirmed empty list.`
                  : 'This is not a confirmed empty list: some sources could not be read. Clear the filters to see every known pack in this context.')
                  : filtered ? `${localWins ? `${LOCAL_WINS} ` : ''}Clear the filters to see all packs in this context.`
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
            : selected.project ? <ProjectBody row={selected} coverage={projectCoverage} onRead={readDocument} /> : <>
          {(!installedCurrent || !(catalogReadable || catalogState === 'not_read')) && <Text className={s.packReadNotice}>
            Installed: {coverage('installed')} · Catalog: {catalogText}. Retained facts are for inspection only.
          </Text>}
          <p className={s.prose} data-pack-description>{selected.pack.description === null
            ? catalogState === 'not_read' ? 'Description not read. Choose Reload packs to read catalogs.'
              : 'Description unavailable; no readable catalog record.'
            : selected.pack.description || 'No description declared.'}</p>
          <div className={s.tight}>
            <div className={s.actions} data-pack-actions>
              {actions.map(operation => <Button key={operation} data-pack-operation={operation} aria-haspopup="dialog"
                appearance={operation === 'install' ? 'primary' : 'secondary'}
                disabled={Boolean(actionReasons[operation])} aria-describedby={actionWhy ? `${id}-action-reason` : undefined}
                onClick={event => openAction(operation, event.currentTarget)}>{OPERATIONS[operation]}</Button>)}
            </div>
            {actionWhy && <Text id={`${id}-action-reason`} className={s.eyebrow} data-pack-action-why>{actionWhy}</Text>}
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
          <DetailsSection documents={packDocuments(selected.pack, catalogState)}
            note={selected.pack.fromGitHub ? DETAILS_GITHUB_NOTE : null} onRead={readDocument} />
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
    <PackActionDialog action={action} shown={listShown && !onSources} data={data} showKey={actionShowKey}
      showReason={loading ? SHOW_REASONS.pending : SHOW_REASONS.absent} onClose={closeAction} onShow={showActionPack} />
    <dialog ref={reader} className={mergeClasses(s.packDialog, s.packReader)} aria-labelledby={`${id}-reader-heading`}
      data-pack-reader onCancel={event => { event.preventDefault(); closeReader(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeReader(); }
        else trapTab(event, reader.current);
      }}>
      {reading && <>
        <header className={s.packDetailHeader}>
          <div className={s.grow}><Text block className={s.eyebrow}>{reading.title} details</Text>
            <h2 id={`${id}-reader-heading`} className={s.subheading}>{reading.doc.path}</h2></div>
          <Button appearance="subtle" icon={<DismissRegular />} aria-label="Close details" onClick={closeReader} />
        </header>
        <div ref={readerBody} className={s.packDetailBody} tabIndex={0} role="region" aria-labelledby={`${id}-reader-heading`}>
          <Markdown text={reading.doc.text} />
        </div>
      </>}
    </dialog>
    <RemoveSourceDialog source={removing} busy={Boolean(removal?.busy)} refusal={removal?.refusal ?? null}
      onConfirm={confirmRemove} onClose={closeRemoval} onReload={() => { data.reloadPacks(); closeRemoval(); }} />
    </div>
    <AppearancePanel id={`${id}-appearance`} labelledBy={`${id}-section-appearance`} shown={active && section === 'appearance'} />
    <AboutPanel id={`${id}-about`} labelledBy={`${id}-section-about`} shown={active && section === 'about'}
      readAbout={data.readAbout} />
  </div>;
}

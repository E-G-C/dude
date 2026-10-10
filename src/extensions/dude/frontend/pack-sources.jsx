import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Button, createTableColumn, DataGrid, DataGridBody, DataGridCell, DataGridHeader, DataGridHeaderCell, DataGridRow,
  Field, Input, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Spinner, Text,
} from '@fluentui/react-components';
import { AddRegular, CheckmarkCircleFilled, DismissRegular, InfoRegular, WarningFilled } from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';

/* ---------------------------------------------------------------- words and labels */

const SOURCES_INTRO = 'Sources are where Dude finds packs. Adding one installs nothing.';
const ADD_NOTE = 'Canvas reads the source once to check its pack catalog before saving it. Nothing is installed.';
const ADD_REASONS = {
  unavailable: 'The current workspace must be available to save a source. Nothing is sent.',
  disconnected: 'Canvas is reconnecting to the workspace. Nothing is saved until the connection is current.',
  config: 'The saved source list could not be read, so it cannot be changed here. Nothing was reset.',
  loading: 'Canvas is reading the saved source list. Add source becomes available when it has been read.',
};
const ADD_FIELD_NOTES = [
  'Public GitHub repositories only. Canvas never asks for credentials.',
  'The source must be a folder that contains library/packs, the layout Dude reads.',
  'Adding a source installs nothing. Installed packs can add agents and instructions, so add only sources you trust; every install asks for your permission first.',
  'Sources are saved with the project in .dude/metadata/pack-sources.md, so they can be committed and shared.',
];
const SHOW_NOTE = 'Show packs in Available lists this source\'s packs that are not installed.';
const REMOVE_NOTE = 'Remove takes this entry out of the saved list. It installs and uninstalls nothing.';
const READ_ONLY_NOTE = 'Read only. Built-in sources are derived from this installation and cannot be removed or edited here.';
const SAVED_FILE = '.dude/metadata/pack-sources.md';
const DEFAULT_LIMIT = 8;
const NOT_READ_BY_DESIGN = 'Not read while library/packs exists';

const packsWord = count => `${count} ${count === 1 ? 'pack' : 'packs'}`;
/**
 * How long the server reads a source Add names before it stops: a GitHub
 * repository's catalog within 30 seconds, and a folder within 5.
 */
const readingSeconds = location => (/^https:/i.test(location) ? 30 : 5);
/** The written-out type of a source: never an icon or a color alone. */
const sourceType = item => item.type === 'remote' ? 'GitHub' : 'Local folder';
/** `Local library - Local folder`, `owner/repo - GitHub`, `Bundle upstream - GitHub E-G-C/dude`. */
export const sourceLabel = item => item.builtin === 'bundle-upstream' && item.repositoryName
  ? `Bundle upstream - GitHub ${item.repositoryName}` : `${item.name} - ${sourceType(item)}`;
const whereOf = item => item.type === 'remote' ? item.repository : item.location;
const scopeOf = item => item.scope === 'builtin' ? 'Built in' : 'This project';

/**
 * What a source row says about its last read, from what the server projected:
 * read with a count, not read yet, not read by design, or unavailable with the
 * server's own reason. Never a count it does not have.
 */
export function sourceStatus(item) {
  if (item.status === 'read') return { kind: 'read', text: `Read - ${packsWord(item.count)}` };
  if (item.status === 'unavailable') {
    return { kind: 'unavailable', text: `Unavailable - ${item.message || 'The source could not be read.'}`,
      reason: item.message || 'The source could not be read.' };
  }
  if (item.reason === 'not_read_by_design') return { kind: 'skipped', text: NOT_READ_BY_DESIGN };
  return { kind: 'unread', text: 'Not read' };
}

/** The Catalog word of the footer and the coverage notices: honest about partial and unread. */
export function catalogCoverageText(packs) {
  const state = packs?.coverage?.catalog?.state;
  if (state === 'not_read') return 'not read';
  if (state !== 'partial') return state || 'unavailable';
  const items = packs.sources?.items ?? [];
  const attempted = items.filter(item => item.status !== 'not_read').length;
  const failed = items.filter(item => item.status === 'unavailable').length;
  return packs.sources?.state === 'unavailable' ? 'partial (added sources unavailable)'
    : `partial (${failed} of ${attempted} sources unavailable)`;
}

/** Why Add source and Remove are unavailable under the normal guards, or null. */
export function sourceWriteReason(data, packs, loading) {
  const feed = data.needs;
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable') return ADD_REASONS.unavailable;
  if (!data.connected) return ADD_REASONS.disconnected;
  if (!packs?.sources) return loading ? ADD_REASONS.loading : ADD_REASONS.config;
  return packs.sources.state === 'current' ? null : ADD_REASONS.config;
}

/** The name a person would give the location they typed, for the announcement. */
function typedName(location) {
  const repository = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(location);
  if (repository) return `${repository[1]}/${repository[2]}`;
  return location.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || location;
}

/** The blockers a server refusal named, in the words of the advisory reason. */
export function blockersOf(list) {
  const installed = list.filter(blocker => blocker.kind === 'installed').map(blocker => blocker.name);
  const requests = list.filter(blocker => blocker.kind === 'request')
    .map(blocker => `${blocker.operation === 'refresh' ? 'Refresh' : blocker.operation === 'remove' ? 'Remove' : 'Install'} ${blocker.name} (${String(blocker.phase).replaceAll('_', ' ')})`);
  return { installed, requests };
}
const inUse = uses => Boolean(uses.installed.length || uses.requests.length);
/** Why Remove is disabled while a source is in use: advisory, since the server decides at the write. */
function inUseReason(uses) {
  const parts = [];
  if (uses.installed.length) parts.push(`Installed from it: ${uses.installed.join(', ')}.`);
  if (uses.requests.length) parts.push(`Pack request in progress: ${uses.requests.join('; ')}.`);
  const fix = uses.installed.length && uses.requests.length ? 'Remove those installed packs and finish the request first.'
    : uses.installed.length ? 'Remove those installed packs first.' : 'Finish the request first.';
  return `Cannot remove while in use. ${parts.join(' ')} ${fix}`;
}

/**
 * Whether Show packs in Available can open this source's packs: only a source
 * that was read and still has a pack outside installed membership. Any other
 * state says why, so the disabled control is never a dead end.
 */
function showPacksState(item, shown) {
  const status = sourceStatus(item);
  if (status.kind === 'unread') return { ok: false, why: 'Not read yet - choose Reload packs.' };
  if (status.kind === 'skipped') return { ok: false, why: `${NOT_READ_BY_DESIGN}.` };
  if (status.kind === 'unavailable') return { ok: false, why: 'Unavailable - its packs are not listed.' };
  if (!item.count) return { ok: false, why: 'This source has no packs.' };
  if (!item.uninstalled) return { ok: false, why: 'All packs from this source are installed.' };
  if (!shown) return { ok: false, why: 'Available is not current. Choose Reload packs.' };
  return { ok: true };
}

/* ----------------------------------------------------------------- Add: input checks */

// The same refusals the route makes of the typed text, with the reason a person
// can act on. The typed text is never changed, and the server remains the validator.
function locationProblem(raw) {
  const value = raw.trim();
  if (!value) return 'Enter a GitHub repository URL or a local folder.';
  if (/[\p{Cc}\u2028\u2029]/u.test(value)) return 'Remove line breaks, tabs, and other control characters. The location must be a single line.';
  if (typeof value.isWellFormed === 'function' && !value.isWellFormed()) return 'Remove characters that are not valid text.';
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > 2048) return `This location is ${bytes.toLocaleString('en-US')} UTF-8 bytes. The limit is 2,048, and nothing was shortened.`;
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:/.test(value) || /^ssh:/i.test(value)) return 'SSH addresses are not supported. Use an https://github.com/<owner>/<repo> URL.';
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]+):/.exec(value);
  if (!scheme) return '';
  const name = scheme[1].toLowerCase();
  if (name === 'file') return 'Enter the folder path itself, without file://.';
  if (name !== 'https') return name === 'http' ? 'Use an https:// URL. http:// is not supported.' : 'Use an https://github.com/<owner>/<repo> URL. Other transports are not supported.';
  const rest = value.slice(scheme[0].length);
  if (!rest.startsWith('//')) return 'Enter the complete https:// GitHub URL.';
  const authority = rest.slice(2).split(/[/?#\\]/)[0];
  if (authority.includes('@')) return 'Remove the user name or password from the URL. Canvas never sends credentials.';
  if (authority.includes(':')) return 'Remove the port number from the URL.';
  if (authority.toLowerCase() !== 'github.com') return 'Use a github.com repository URL. Other hosts are not supported.';
  if (/\\|%2f|%5c/i.test(value)) return 'Remove backslashes and encoded slashes (%2F or %5C) from the URL.';
  if (value.includes('?')) return 'Remove the query, the part that starts with ?.';
  if (value.includes('#')) return 'Remove the fragment, the part that starts with #.';
  const path = rest.slice(2 + authority.length).split('/').filter(Boolean);
  if (path.length !== 2) return 'Use the repository address only: https://github.com/<owner>/<repo>. A branch, file, or folder is not part of it.';
  return '';
}
function refProblem(ref, location) {
  if (!ref) return '';
  if (!/^https:/i.test(location.trim())) return 'A local folder has no ref. Clear this field.';
  if (ref.length > 128) return 'A ref can have at most 128 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) return 'Start the ref with a letter or digit, and use only letters, digits, periods, underscores, slashes, and hyphens.';
  if (ref.includes('..')) return 'A ref cannot contain two periods in a row (..).';
  return '';
}

/**
 * How the route's refusal of an Add is shown. Every one leaves the saved list
 * unchanged and stays inside the dialog with what was typed. The two that need a
 * fresh read offer it as an action, never a replay of the write.
 */
function refusalOf({ code, message }, sources, key, location) {
  const nothing = 'Nothing was saved.';
  switch (code) {
    case 'invalid_location': case 'credentials': return { field: 'location', message };
    case 'invalid_ref': case 'ref_not_applicable': return { field: 'ref', message };
    case 'local_missing': return { intent: 'error', title: 'Folder not found',
      text: `No folder was found at this location. Check the path, and choose the folder that contains library/packs. ${nothing}` };
    case 'bare_packs_folder': return { intent: 'error', title: 'No pack catalog found',
      text: `Choose the folder that contains library/packs. This location is the packs folder itself, so choose its parent. ${nothing}` };
    case 'local_layout': case 'missing_catalog': return { intent: 'error', title: 'No pack catalog found',
      text: `This source has no library/packs folder. Choose a repository or folder whose root contains library/packs. ${nothing}` };
    case 'bad_metadata': return { intent: 'error', title: 'A pack\'s metadata could not be read', text: `${message} ${nothing}` };
    case 'unreachable': return { intent: 'error', title: 'Could not read the repository',
      text: `It may be private, may not exist, or could not be reached. Canvas reads public GitHub repositories only and never asks for credentials. ${nothing}` };
    case 'own_library': return { intent: 'warning', title: 'Already listed',
      text: 'This is this workspace\'s own library, already listed as Local library. Built-in sources are not added twice.' };
    case 'duplicate': {
      const existing = sources?.items.find(item => item.key === key);
      return { intent: 'warning', title: 'Already listed', text: !existing ? `This source is already configured. ${nothing}`
        : existing.scope === 'builtin' ? `This is the ${existing.name}, a built-in source that bundle upgrade manages. Built-in sources are not added twice.`
          : `${existing.name} is already added to this project. A source is identified by its repository or folder, so a different ref is not a second source. ${nothing}` };
    }
    case 'limit': return { intent: 'warning', title: 'Source limit reached',
      text: `This project has ${sources?.limit ?? DEFAULT_LIMIT} of ${sources?.limit ?? DEFAULT_LIMIT} sources. Remove one before adding another. ${nothing}` };
    case 'timeout': return { intent: 'error', title: 'Reading timed out',
      text: `Reading took longer than ${readingSeconds(location)} seconds, so it was stopped. ${nothing} Try again when the source responds faster.` };
    case 'cleanup_unconfirmed': return { intent: 'error', title: 'Reading could not be stopped cleanly', text: `${message} ${nothing}` };
    case 'sources_changed': return { intent: 'warning', title: 'The source list changed', reload: true,
      text: `Another tab or person changed the saved source list after Canvas last read it. ${nothing} Choose Reload packs to read the current list, then add the source again.` };
    case 'sources_unavailable': return { intent: 'error', title: 'Saved sources unavailable', text: `${message} ${ADD_REASONS.config}` };
    case 'workspace_changed': case 'identity_mismatch': return { intent: 'error', title: 'The workspace changed',
      text: `${message} ${nothing} Reload packs, then add the source again.` };
    case 'write_failed': return { intent: 'error', title: 'The source could not be saved', text: `${message} ${nothing}` };
    case 'connection_lost': return { intent: 'warning', title: 'The response was lost', lost: true,
      text: 'Canvas cannot tell whether the source was saved. Read again to check the saved list before adding it again. Nothing is retried automatically.' };
    default: return { intent: 'error', title: 'The source was not added', text: `${message || 'The provider could not complete this operation.'} ${nothing}` };
  }
}

/* ------------------------------------------------------------------ shared pieces */

// A native modal keeps focus inside, but a wrap makes Tab behave the same in
// every host, as the pack request dialog does; inputs are stops too.
function trapFocus(event, dialog) {
  if (event.key !== 'Tab') return;
  const stops = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')]
    .filter(node => node.getClientRects().length);
  if (!stops.length) { event.preventDefault(); return; }
  const first = stops[0], last = stops.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

/**
 * Backdrop dismissal needs a full press and release on the backdrop. A press that
 * began inside the dialog, such as selecting text in an input and releasing
 * outside, must never close it or lose what was typed. `blocked` is true while a
 * source is being read.
 */
function backdropHandlers(dialog, blocked, dismiss) {
  const outside = event => {
    const box = dialog.current.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  const pressed = { current: false };
  return {
    onPointerDown: event => { pressed.current = event.target === dialog.current && outside(event); },
    onClick: event => {
      const started = pressed.current;
      pressed.current = false;
      if (started && !blocked && event.target === dialog.current && outside(event)) dismiss();
    },
  };
}

function Glyph({ kind }) {
  const s = useCanvasStyles();
  return kind === 'read' ? <CheckmarkCircleFilled className={s.sourceGlyph} aria-hidden="true" />
    : kind === 'unavailable' ? <WarningFilled className={mergeClasses(s.sourceGlyph, s.sourceGlyphWarn)} aria-hidden="true" />
      : <InfoRegular className={s.sourceGlyph} aria-hidden="true" />;
}

function CellLabel({ children }) {
  const s = useCanvasStyles();
  return <span className={s.packCellLabel}>{children}</span>;
}

// A location wraps between path segments instead of inside one when it can.
function Breakable({ text }) {
  const parts = text.split(/(?<=[/\\])/);
  return <>{parts.map((part, index) => <React.Fragment key={index}>{index > 0 && <wbr />}{part}</React.Fragment>)}</>;
}

function SourceCell({ item }) {
  const s = useCanvasStyles();
  return <span className={s.sourceStack}><Text weight="semibold">{item.name}</Text>
    <Text className={s.packRowNote}>{sourceType(item)}</Text></span>;
}
function WhereCell({ item }) {
  const s = useCanvasStyles();
  const ref = item.type === 'remote' ? item.ref : null;
  return <span className={s.sourceStack}><span><CellLabel>Location</CellLabel>{' '}<code className={s.sourceWhere}><Breakable text={whereOf(item)} /></code>
    {ref && <code className={mergeClasses(s.sourceWhere, s.sourceRef)}>Ref {ref}</code>}</span></span>;
}
function StatusCell({ item }) {
  const s = useCanvasStyles(), status = sourceStatus(item);
  return <><CellLabel>Status</CellLabel>{' '}<span className={s.sourceStatus}><Glyph kind={status.kind} />
    <span>{status.text}</span></span></>;
}
function ScopeCell({ item }) {
  return <><CellLabel>Scope</CellLabel>{' '}<Text>{scopeOf(item)}</Text></>;
}
const SOURCE_COLUMNS = [
  createTableColumn({ columnId: 'source', renderHeaderCell: () => 'Source', renderCell: item => <SourceCell item={item} /> }),
  createTableColumn({ columnId: 'where', renderHeaderCell: () => 'Location and ref', renderCell: item => <WhereCell item={item} /> }),
  createTableColumn({ columnId: 'status', renderHeaderCell: () => 'Status', renderCell: item => <StatusCell item={item} /> }),
  createTableColumn({ columnId: 'scope', renderHeaderCell: () => 'Scope', renderCell: item => <ScopeCell item={item} /> }),
];
const sourceRowLabel = item => {
  const ref = item.type === 'remote' ? item.ref : null;
  return `${item.name}. ${sourceType(item)}. ${whereOf(item)}${ref ? `, ref ${ref}` : ''}. ${sourceStatus(item).text}. ${scopeOf(item)}.`;
};

/**
 * One MessageBar for an outcome: its title and words are one live announcement,
 * and a source's outcome is never conveyed by color or an icon alone.
 */
function Outcome({ barRef, intent, title, text, children, actions, reading = false, ...rest }) {
  const s = useCanvasStyles(), ids = useId();
  return <MessageBar ref={barRef} tabIndex={-1} layout="multiline" intent={intent} className={mergeClasses(s.notice, s.sourceOutcome)}
    icon={reading ? <Spinner size="extra-tiny" /> : undefined} aria-labelledby={`${ids}-title`} aria-describedby={`${ids}-text`} {...rest}>
    <MessageBarBody>
      <div role="status" aria-live="polite" aria-atomic="true" className={s.tight}>
        <MessageBarTitle id={`${ids}-title`}>{title}</MessageBarTitle>
        <div id={`${ids}-text`} className={s.tight}><span>{text}</span>{children}</div>
      </div>
    </MessageBarBody>
    {actions && <MessageBarActions className={s.sourceOutcomeActions}>{actions}</MessageBarActions>}
  </MessageBar>;
}

/* --------------------------------------------------------------------- Add source */

/**
 * The form, mounted only while the dialog is open, so what was typed lives and
 * dies with the dialog. Every refusal stays here with the typed Location and Ref.
 */
function AddSourceForm({ data, packs, reason, onReading, onSaved, onReload, locationRef, ids }) {
  const s = useCanvasStyles();
  const [location, setLocation] = useState(''), [ref, setRef] = useState('');
  const [errors, setErrors] = useState({ location: '', ref: '' });
  const [status, setStatus] = useState(null);
  const refInput = useRef(null), bar = useRef(null);
  const reading = status?.phase === 'reading';
  const sources = packs?.sources;
  // The saved list revision the last submit used: a lost response is compared to it after a fresh read.
  const submittedRevision = useRef(null);
  useLayoutEffect(() => { if (status) bar.current?.focus({ preventScroll: true }); }, [status]);

  const submit = async event => {
    event.preventDefault();
    if (reason || reading || status?.phase === 'rereading') return;
    const where = location.trim(), tracked = ref.trim();
    const problems = { location: locationProblem(where), ref: refProblem(tracked, where) };
    setErrors(problems);
    if (problems.location || problems.ref) { (problems.location ? locationRef : refInput).current?.focus(); return; }
    submittedRevision.current = sources?.sourcesRevision ?? null;
    setStatus({ phase: 'reading', intent: 'info', title: 'Reading the source',
      text: `Checking that its pack catalog can be read. Nothing is installed, and nothing is saved until the read succeeds. Reading stops after ${readingSeconds(where)} seconds.` });
    onReading(true);
    const result = await data.addSource({ location: where, ref: tracked });
    onReading(false);
    if (result.ok) { onSaved({ ...result, location: where, name: typedName(where) }); return; }
    const refused = refusalOf(result, sources, result.key, where);
    if (refused.field) { setStatus(null); setErrors({ location: '', ref: '', [refused.field]: refused.message });
      (refused.field === 'ref' ? refInput : locationRef).current?.focus(); return; }
    setStatus({ phase: 'refused', ...refused });
  };
  // Both recovery actions read current state through an explicit Reload; neither replays the save.
  const reread = async lost => {
    setStatus(previous => ({ ...previous, phase: 'rereading', actions: undefined }));
    const committed = await onReload();
    if (!committed) {
      setStatus({ phase: 'refused', intent: 'error', title: 'The saved sources could not be read again',
        text: 'Pack information could not be read. Nothing was saved or changed. Choose Reload packs to try again.' });
      return;
    }
    const changed = committed.sources?.sourcesRevision !== submittedRevision.current;
    setStatus({ phase: 'info', intent: 'info', title: lost ? 'Read again' : 'Reloaded',
      text: lost ? (changed ? 'The saved source list was read again, and it has changed since this request. Check the Sources table for this source before adding it again. Nothing is retried automatically.'
        : 'The saved source list was read again and has not changed, so this source was not added. You can add it again.')
        : 'Pack sources were read again. Add the source again if it is still missing.' });
  };
  const clear = which => { setErrors(previous => ({ ...previous, [which]: '' })); };

  const actions = status?.phase === 'refused' && (status.reload || status.lost)
    ? <Button appearance="primary" onClick={() => reread(Boolean(status.lost))}>{status.lost ? 'Read again' : 'Reload packs'}</Button> : null;

  return <form id={ids.form} className={s.importForm} onSubmit={submit} noValidate data-source-form>
    {status && <Outcome barRef={bar} intent={status.phase === 'rereading' ? 'info' : status.intent} reading={status.phase === 'reading' || status.phase === 'rereading'}
      title={status.phase === 'rereading' ? 'Reading pack sources' : status.title}
      text={status.phase === 'rereading' ? 'Reading the saved source list again. Nothing is saved or replayed.' : status.text}
      actions={actions} data-source-add-status data-source-add-phase={status.phase} />}
    <Field label={{ children: 'Location', weight: 'semibold' }} validationState={errors.location ? 'error' : 'none'}
      validationMessage={errors.location || undefined}
      hint="A public GitHub repository, or a folder on this computer, whose root contains library/packs.">
      <Input ref={locationRef} className={s.control} value={location} placeholder="GitHub repository URL or local folder" autoComplete="off"
        autoCapitalize="off" spellCheck={false} readOnly={reading} data-source-location
        onChange={(_, next) => { setLocation(next.value); clear('location'); }} />
    </Field>
    <dl className={s.sourceForms} aria-label="Accepted source forms">
      <dt>GitHub repository</dt><dd>https://github.com/&lt;owner&gt;/&lt;repo&gt;</dd>
      <dt>Local folder</dt><dd>&lt;path to a folder that contains library/packs&gt;</dd>
    </dl>
    <Field label={{ children: 'Ref (optional)', weight: 'semibold' }} validationState={errors.ref ? 'error' : 'none'}
      validationMessage={errors.ref || undefined}
      hint="A branch or tag of a GitHub repository. Defaults to main. A local folder has no ref.">
      <Input ref={refInput} className={mergeClasses(s.control, s.shortControl)} value={ref} placeholder="main" autoComplete="off"
        autoCapitalize="off" spellCheck={false} readOnly={reading} data-source-ref
        onChange={(_, next) => { setRef(next.value); clear('ref'); }} />
    </Field>
  </form>;
}

function AddSourceDialog({ open, reading, reason, onClose, ...form }) {
  const s = useCanvasStyles(), ids = useId();
  const dialog = useRef(null), locationRef = useRef(null);
  const names = { heading: `${ids}-heading`, note: `${ids}-note`, form: `${ids}-form` };
  const sources = form.packs?.sources;
  useLayoutEffect(() => {
    const node = dialog.current;
    if (open && !node.open) { node.showModal(); locationRef.current?.focus({ preventScroll: true }); }
    else if (!open && node.open) node.close();
  }, [open]);
  const dismiss = () => { if (!reading) onClose(); };
  return <dialog ref={dialog} className={mergeClasses(s.packRequestDialog, s.sourceDialog)} aria-labelledby={names.heading}
    aria-describedby={names.note} data-source-add-dialog
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
      else trapFocus(event, dialog.current);
    }}
    {...backdropHandlers(dialog, reading, dismiss)}>
    {open && <>
      <header className={s.packDetailHeader}>
        <div className={s.grow}><Text className={s.eyebrow}>Pack sources</Text>
          <h2 id={names.heading} className={s.subheading}>Add source</h2></div>
        <Button appearance="subtle" icon={<DismissRegular />} aria-label="Close without adding" aria-describedby={names.note}
          disabled={reading} data-source-add-close onClick={dismiss} />
      </header>
      <div className={s.packDetailBody} tabIndex={0} role="region" aria-label="Add source form">
        <AddSourceForm {...form} reason={reason} locationRef={locationRef} ids={names} />
        <Text id={names.note} className={s.eyebrow} data-source-add-note>{reason || ADD_NOTE}</Text>
        <ul className={s.formNotes}>
          {ADD_FIELD_NOTES.map(note => <li key={note}>{note}</li>)}
          <li>{`You can add up to ${sources?.limit ?? DEFAULT_LIMIT} sources. ${sources?.state === 'current'
            ? `${sources.items.filter(item => item.scope === 'project').length} added.` : 'The saved list could not be read.'}`}</li>
        </ul>
      </div>
      <footer className={mergeClasses(s.packDetailFooter, s.sourceDialogFooter)}>
        <Button disabled={reading} aria-describedby={names.note} data-source-add-cancel onClick={dismiss}>Cancel</Button>
        <Button type="submit" form={names.form} appearance="primary" disabled={Boolean(reason) || reading}
          aria-describedby={names.note} data-source-add-submit>Add source</Button>
      </footer>
    </>}
  </dialog>;
}

/* ---------------------------------------------------------------------- the panel */

/**
 * The Sources view: built-ins, then the sources this project added, in the
 * Installed/Available table pattern, with no filters and no pager. The
 * server's opaque keys are the row identity, selection and focus-return keys,
 * so two folders with one name stay two rows. Add source opens a native
 * modal; selection, details and removal belong to Settings, which owns the one
 * shared details pane.
 */
export function SourcesPanel({ id, labelledBy, shown, data, packs, loading, rows, selectedKey, onSelect, note, onNote,
  onAdded, noteRef, scrollRef, headingRef, addRef }) {
  const s = useCanvasStyles(), ids = useId();
  const [adding, setAdding] = useState(false), [reading, setReading] = useState(false);
  const returnFocus = useRef(false);
  const sources = packs?.sources;
  const reason = sourceWriteReason(data, packs, loading);
  const added = rows.filter(item => item.scope === 'project');
  const unreadable = sources?.state === 'unavailable';
  const unread = packs?.coverage?.catalog?.state === 'not_read';
  const limit = sources?.limit ?? DEFAULT_LIMIT;

  // Closing returns focus to the trigger once the modal has gone and Add source is enabled again.
  useLayoutEffect(() => {
    if (adding || !returnFocus.current) return;
    returnFocus.current = false;
    const trigger = addRef.current;
    if (trigger?.isConnected && !trigger.disabled && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    else headingRef.current?.focus({ preventScroll: true });
  }, [adding, addRef, headingRef]);

  const close = () => { returnFocus.current = true; setAdding(false); setReading(false); };
  const saved = result => {
    onNote({ intent: 'success', title: 'Added',
      text: `${result.name} was saved with this project. Found ${packsWord(result.count)}. Nothing was installed; its packs now appear under Available.` });
    close();
    onAdded(result);
  };

  return <>
    <div role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={!shown} className={s.packPanel} data-sources-panel>
      <div className={mergeClasses(s.packToolbar, s.sourcesToolbar)} data-sources-toolbar>
        <Button ref={addRef} appearance="primary" icon={<AddRegular />} disabled={Boolean(reason)} aria-haspopup="dialog"
          aria-describedby={`${ids}-note`} data-sources-add onClick={() => setAdding(true)}>Add source</Button>
        <Text id={`${ids}-note`} className={s.eyebrow} data-sources-note>{reason || SOURCES_INTRO}</Text>
      </div>
      <h2 ref={headingRef} className={s.visuallyHidden} tabIndex={-1}>Pack sources</h2>
      <div ref={scrollRef} className={s.packScroll} data-sources-scroll aria-busy={loading}>
        {note && <div className={s.sourceNote}>
          <Outcome barRef={noteRef} intent={note.intent} title={note.title} text={note.text} data-source-status
            data-source-status-title={note.title} />
        </div>}
        {unreadable && <div className={s.packReadNotice} role="status" data-sources-coverage>
          <Text weight="semibold">Added sources are unavailable</Text>
          <Text>The saved source list, {SAVED_FILE}, could not be read. It is not treated as empty, and nothing was reset.
            {sources.message ? ` ${sources.message}.` : ''} Fix or restore the file, then choose Reload packs.</Text>
        </div>}
        {!unreadable && unread && <div className={s.packReadNotice} role="status" data-sources-coverage>
          <Text weight="semibold">Catalog: not read</Text>
          <Text>Nothing is read until you choose Reload packs, so no source shows a pack count yet.</Text>
        </div>}
        {shown && (rows.length ? <DataGrid items={rows} columns={SOURCE_COLUMNS} getRowId={item => item.key} focusMode="composite"
          aria-label="Pack sources">
          <DataGridHeader className={s.packTableHeader}><DataGridRow>
            {({ columnId, renderHeaderCell }) => <DataGridHeaderCell focusMode="none"
              className={mergeClasses(s.packCell, s[`source_${columnId}`])}>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow></DataGridHeader>
          <DataGridBody>{({ item, rowId }) => <DataGridRow key={rowId} data-source-row={item.key}
            aria-label={sourceRowLabel(item)} aria-selected={selectedKey === item.key}
            className={mergeClasses(s.packRow, selectedKey === item.key && s.workSelected)}
            onClick={() => onSelect(item.key)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
              event.preventDefault(); onSelect(item.key);
            }}>
            {({ columnId, renderCell }) => <DataGridCell focusMode="none"
              className={mergeClasses(s.packCell, s[`source_${columnId}`])}>{renderCell(item)}</DataGridCell>}
          </DataGridRow>}</DataGridBody>
        </DataGrid> : <div className={s.empty} data-sources-empty>
          <Text weight="semibold">{loading ? 'Pack sources loading' : 'Pack sources unavailable'}</Text>
          <Text>This is not a confirmed empty list.</Text>
        </div>)}
        {shown && !unreadable && rows.length > 0 && !added.length && <div className={s.empty} data-sources-no-added>
          <Text weight="semibold">No sources added yet</Text>
          <Text>Choose Add source to add a public GitHub repository or a local folder. Nothing is listed here until you do.</Text>
        </div>}
      </div>
      <div className={s.sourcesFoot}>
        <p className={s.packMetrics} data-sources-count>
          {rows.length ? `${rows.length} ${rows.length === 1 ? 'source' : 'sources'} · ${rows.length - added.length} built in · ${
            unreadable ? 'added sources unavailable' : `${added.length} of ${limit} added`}` : 'Count unavailable'}
        </p>
      </div>
    </div>
    <AddSourceDialog open={adding} reading={reading} reason={reason} data={data} packs={packs} onReading={setReading}
      onSaved={saved} onClose={close} onReload={() => data.reloadPacks()} />
  </>;
}

/* ---------------------------------------------------------------- source details */

const PACKS_FOUND_NOTE = 'Counts include names you already have installed. Available lists only names that are not installed.';

/**
 * The details after the heading, in the one order every details view keeps
 * (FR-075): a coverage notice when present, the description, the actions with
 * their reason or a read-only note, then the facts. Nothing follows the facts: a
 * source has no provenance, files, or documents, and no link to its repository.
 */
export function SourceBody({ item, sources, shown, uses, reason: writeReason, onShow, onRemove, removeRef, reasonRef }) {
  const s = useCanvasStyles(), ids = useId();
  const status = sourceStatus(item), show = showPacksState(item, shown), builtin = item.scope === 'builtin';
  const blocked = builtin ? null : writeReason || (inUse(uses) ? inUseReason(uses) : null);
  const reasons = [...new Set([show.ok ? '' : show.why, blocked || ''].filter(Boolean))];
  const open = item.uninstalled;
  const installed = item.installedNames;
  const unlisted = sources?.unmatched?.unlisted ?? 0, unknown = sources?.unmatched?.unknown ?? 0;
  const ref = item.type === 'remote' ? item.ref : null;
  return <>
    {(status.kind === 'unread' || status.kind === 'unavailable') && <div className={s.packReadNotice} data-source-notice>
      <Text weight="semibold">{status.kind === 'unread' ? 'Status: not read' : 'Status: unavailable'}</Text>
      <Text>{status.kind === 'unread' ? 'Choose Reload packs to read this source. Until then its packs are unknown.'
        : `This source could not be read: ${status.reason} Its packs are not listed under Available.`}</Text>
    </div>}
    <p className={s.prose} data-source-description>
      {item.builtin === 'local-library' ? <>The folder <code className={s.code}>{item.location}</code> in this development bundle. It is derived from this installation each time, so it cannot be edited here.</>
        : builtin ? <>The public GitHub repository <code className={s.code}>{item.repository}</code> at ref <code className={s.code}>{ref}</code>. It is derived from this
          installation each time and managed by bundle upgrade, so it cannot be edited here.{item.default
            ? ' This installation has no local library, so Bundle upstream supplies the default catalog.'
            : ' This development bundle has a local library, so Bundle upstream is not read.'}</>
          : item.type === 'remote' ? <>The public GitHub repository <code className={s.code}>{item.repository}</code>, tracked at ref <code className={s.code}>{ref}</code>.
            Added to this project, so it is saved with the project and can be committed and shared.</>
            : <>The folder <code className={s.code}>{item.location}</code> on this computer, whose root contains <code className={s.code}>library/packs</code>.
              Added to this project, so it is saved with the project and can be committed and shared.</>}
    </p>
    <div className={s.tight}>
      <div className={s.actions} data-source-actions>
        <Button disabled={!show.ok} aria-describedby={`${ids}-reason`} data-source-show onClick={() => onShow(item.key)}>Show packs in Available</Button>
        {!builtin && <Button ref={removeRef} disabled={Boolean(blocked)} aria-label={`Remove ${item.name}`}
          aria-describedby={`${ids}-reason`} data-source-remove onClick={event => onRemove(item, event.currentTarget)}>Remove</Button>}
      </div>
      <Text id={`${ids}-reason`} ref={reasonRef} tabIndex={-1} className={s.eyebrow} data-source-reason>
        {reasons.join(' ') || (builtin ? SHOW_NOTE : `${SHOW_NOTE} ${REMOVE_NOTE}`)}
      </Text>
      {builtin && <Text className={s.eyebrow} data-source-readonly>{READ_ONLY_NOTE}</Text>}
    </div>
    <dl className={s.packMetadata}>
      <dt>Status</dt><dd>{status.text}</dd>
      <dt>Packs found</dt>
      <dd className={s.tight}>{item.status === 'read' ? <>
        <span>{!item.count ? '0' : open === item.count ? `${item.count} (none installed)` : open === 0 ? `${item.count} (all installed)`
          : `${item.count} (${open} not installed)`}</span>
        {item.count > 0 && <Text className={s.eyebrow}>{PACKS_FOUND_NOTE}</Text>}</> : 'Unknown'}</dd>
      <dt>Installed from this source</dt>
      <dd className={s.tight}>{installed === null ? 'Unavailable' : <span>{installed.length ? `${installed.length}: ${installed.join(', ')}` : '0'}</span>}
        {unlisted > 0 && <Text className={s.eyebrow}>{`${unlisted} installed ${unlisted === 1 ? 'pack records' : 'packs record'} an unlisted source.`}</Text>}
        {unknown > 0 && <Text className={s.eyebrow}>{`${unknown} installed ${unknown === 1 ? 'pack has' : 'packs have'} a source record that could not be matched.`}</Text>}</dd>
      <dt>Saved in</dt>
      <dd>{builtin ? `Not saved. Derived from this installation each time.${item.builtin === 'bundle-upstream' ? ' Managed by bundle upgrade.' : ''}${item.default ? ' Default catalog.' : ''}`
        : <code className={s.code}>{SAVED_FILE}</code>}</dd>
    </dl>
  </>;
}

/* ------------------------------------------------------------------ source removal */

/**
 * The Remove confirmation. A removal the server refuses stays here, naming every
 * blocker; nothing was changed, and the same answer is shown behind it as the
 * advisory reason. The dialog keeps its state in Settings, which owns the details
 * it returns focus to.
 */
export function RemoveSourceDialog({ source, busy, refusal, onConfirm, onClose, onReload }) {
  const s = useCanvasStyles(), ids = useId();
  const dialog = useRef(null), bar = useRef(null), cancel = useRef(null);
  const open = Boolean(source);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (open && !node.open) { node.showModal(); cancel.current?.focus({ preventScroll: true }); }
    else if (!open && node.open) node.close();
  }, [open]);
  useLayoutEffect(() => { if (refusal) bar.current?.focus({ preventScroll: true }); }, [refusal]);
  const dismiss = () => { if (!busy) onClose(); };
  const ref = source?.type === 'remote' ? source.ref : null;
  return <dialog ref={dialog} className={mergeClasses(s.packRequestDialog, s.sourceDialog)} aria-labelledby={`${ids}-title`}
    aria-describedby={`${ids}-text`} data-source-remove-dialog
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
      else trapFocus(event, dialog.current);
    }}
    {...backdropHandlers(dialog, busy, dismiss)}>
    {source && <>
      <header className={s.packDetailHeader}>
        <div className={s.grow}><Text className={s.eyebrow}>Remove source</Text>
          <h2 id={`${ids}-title`} className={s.subheading}>Remove {source.name}?</h2></div>
        <Button appearance="subtle" icon={<DismissRegular />} aria-label="Close without removing" disabled={busy} onClick={dismiss} />
      </header>
      <div className={s.packDetailBody} tabIndex={0} role="region" aria-label="Remove source">
        {refusal && <Outcome barRef={bar} intent="error" title={refusal.title} text={refusal.text}
          actions={refusal.reload ? <Button appearance="primary" onClick={onReload}>{refusal.lost ? 'Read again' : 'Reload packs'}</Button> : null}
          data-source-remove-status>
          {refusal.blockers && <div className={s.tight}>
            {refusal.blockers.installed.length > 0 && <div className={s.tight}>
              <Text weight="semibold">Installed packs recorded from this source ({refusal.blockers.installed.length})</Text>
              <ul className={s.formNotes}>{refusal.blockers.installed.map(name => <li key={name}>{name}</li>)}</ul></div>}
            {refusal.blockers.requests.length > 0 && <div className={s.tight}>
              <Text weight="semibold">Pack requests in progress ({refusal.blockers.requests.length})</Text>
              <ul className={s.formNotes}>{refusal.blockers.requests.map(text => <li key={text}>{text}</li>)}</ul></div>}
          </div>}
        </Outcome>}
        {!refusal?.blockers && <p id={`${ids}-text`} className={s.prose}>
          This removes the source from this project's saved source list. Packs already installed from it stay installed, no files are deleted,
          and its packs no longer appear under Available. You can add it again later.</p>}
        {refusal?.blockers && <span id={`${ids}-text`} hidden>Nothing was changed.</span>}
        <dl className={s.packMetadata}>
          <dt>Type</dt><dd>{sourceType(source)}</dd>
          <dt>Location</dt><dd><code className={s.code}>{whereOf(source)}</code></dd>
          {ref && <><dt>Ref</dt><dd><code className={s.code}>{ref}</code></dd></>}
        </dl>
      </div>
      <footer className={mergeClasses(s.packDetailFooter, s.sourceDialogFooter)}>
        <Button ref={cancel} disabled={busy} data-source-remove-cancel onClick={dismiss}>{refusal ? 'Close' : 'Cancel'}</Button>
        <Button appearance="primary" disabled={busy || Boolean(refusal)} data-source-remove-confirm
          onClick={() => onConfirm(source)}>{busy ? 'Removing…' : 'Remove source'}</Button>
      </footer>
    </>}
  </dialog>;
}

/** How a refused removal is shown inside its confirmation. */
export function removalRefusal(result) {
  if (result.code === 'source_in_use' && Array.isArray(result.blockers)) {
    return { title: 'Not removed: this source is in use', blockers: blockersOf(result.blockers),
      text: 'Nothing was changed. A source stays while an installed pack records it or a pack request uses it.' };
  }
  const lost = result.code === 'connection_lost';
  return { title: lost ? 'The response was lost' : 'The source was not removed', reload: lost || result.code === 'sources_changed', lost,
    text: lost ? 'Canvas cannot tell whether the source was removed. Read again to check the saved list. Nothing is retried automatically.'
      : `${result.message || 'The provider could not complete this operation.'} Nothing was changed.` };
}

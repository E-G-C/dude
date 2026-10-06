import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Button, Field, Input, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Spinner, Text,
} from '@fluentui/react-components';
import { CommentRegular } from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { importActionReason, importPermission, importRequestStatus } from './use-canvas-data.js';

export const NEW_SESSION = 'New agents or skills may not be available until you start a new session.';
const READY_NOTE = 'Dude previews the import and asks for your permission in Needs you before changing any file.';
const SHOW_READY = 'Opens Installed on the first imported agent or skill. This changes only the view and requests nothing.';
const FORMS = [
  ['Local file or directory', '<path to the file or directory>'],
  ['GitHub file', 'https://github.com/<owner>/<repo>/blob/<ref>/<file>'],
  ['GitHub directory', 'https://github.com/<owner>/<repo>/tree/<ref>/<directory>'],
  ['Raw GitHub file', 'https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<file>'],
];
const PHASES = {
  preparing: ['Preparing request', 'Checking the source text and the joined session. Nothing is read from the source, and this does not grant permission.'],
  prepared: ['Request prepared', 'Nothing has been sent. This request will not be submitted automatically on reload or return.'],
  submitting: ['Requesting owner action', 'Sending this request to Dude once. Delivery is not yet confirmed.'],
  admitted: ['Admitted; delivery unconfirmed', 'The provider accepted this request, but delivery to Dude is not confirmed. Nothing will be resent.'],
  delivered: ['Delivered to Dude', 'Dude previews the import and asks for permission in Needs you before changing any file.'],
  waiting_permission: ['Permission requested', 'Review the exact files and respond to this request in Needs you.'],
  waiting_owner: ['Waiting for owner result', 'Dude is working on this request. No file change is confirmed until Dude reports a verified result here.'],
  applied: ['Applied', 'Dude verified the import. When the result arrived, Canvas confirmed each written path was a regular file in a local artifact folder.'],
  declined: ['Declined', 'The permission was declined. This request will not be repeated.'],
  failed: ['Failed', 'Dude did not complete this import. This request will not be repeated.'],
  unavailable: ['Unavailable', 'Dude could not offer this import here. Nothing will be retried automatically.'],
  stale: ['Stale request or result', 'The reviewed source, destination, or plan changed. A new request needs a fresh preview and permission.'],
  uncertain: ['Uncertain', 'Dude could not establish the resulting files. Check the paths below before you request another import.'],
};
// One distinction per kind of file change, never inferred from the outcome word alone.
const FILE_CHANGES = {
  none: ['No change.', 'Dude reports that no files changed.'],
  applied: ['Applied.', 'The files below were written and then verified.'],
  partial: ['Partial change.', 'Dude wrote the files below before the import failed. The import is incomplete.'],
  restored: ['Restored.', 'Dude verified that changed files were restored after a caught failure. This is not a crash-recovery guarantee.'],
  uncertain: ['Uncertain.', 'Dude could not establish the resulting files or their restoration.'],
};
const IN_FLIGHT = ['preparing', 'prepared', 'submitting', 'admitted', 'delivered', 'waiting_owner'];
const INTENTS = { applied: 'success', failed: 'error', unavailable: 'warning', stale: 'warning', uncertain: 'warning' };

/**
 * The same refusals the provider makes of a literal Source, with the reason a
 * person can act on, or '' when the text is acceptable. The typed text is never
 * changed: the provider and the importer stay the real validators, and a local
 * path (a single letter before a colon is a drive) is opaque here.
 */
export function importSourceProblem(raw) {
  const value = raw.trim();
  if (!value) return 'Enter a local path or a GitHub URL.';
  if (/[\p{Cc}\u2028\u2029]/u.test(value)) return 'Remove line breaks, tabs, and other control characters. The source must be a single line.';
  if (typeof value.isWellFormed === 'function' && !value.isWellFormed()) return 'Remove characters that are not valid text.';
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > 2048) return `This source is ${bytes.toLocaleString('en-US')} UTF-8 bytes. The limit is 2,048, and nothing was shortened.`;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]+):/.exec(value);
  if (!scheme) return '';
  const name = scheme[1].toLowerCase();
  if (name === 'file') return 'Enter the local path itself, without file://.';
  if (name !== 'https') return 'Use an https:// URL. Canvas accepts public GitHub URLs only.';
  const rest = value.slice(scheme[0].length);
  if (!rest.startsWith('//')) return 'Enter the complete https:// GitHub URL.';
  const authority = rest.slice(2).split(/[/?#\\]/)[0];
  if (authority.includes('@')) return 'Remove the user name or password from the URL. Canvas never sends credentials.';
  if (authority.includes(':')) return 'Remove the port number from the URL.';
  if (!['github.com', 'raw.githubusercontent.com'].includes(authority)) return 'Use a github.com or raw.githubusercontent.com URL.';
  if (value.includes('?')) return 'Remove the query, the part that starts with ?.';
  if (value.includes('#')) return 'Remove the fragment, the part that starts with #.';
  if (/\\|%2f|%5c/i.test(value)) return 'Remove backslashes and encoded slashes (%2F or %5C) from the URL.';
  return '';
}

function PathList({ paths }) {
  const s = useCanvasStyles();
  return <ul className={s.pathList}>{paths.map(path => <li key={path}><code className={s.code}>{path}</code></li>)}</ul>;
}

function Row({ label, children, paths = false }) {
  const s = useCanvasStyles();
  return <div className={mergeClasses(s.aboutRow, paths && s.pathsRow)}><dt>{label}</dt><dd>{children}</dd></div>;
}

/**
 * The Add/import view. The typed Source is local to this panel, which Settings
 * keeps mounted through Packs and About changes and discards with Settings. The
 * request's status is not: it comes from the shared hook, bound to its exact
 * receipt, so it outlives both. `show` says whether Applied may offer Show in
 * Installed, and why not; the panel never reads rows or paths itself.
 */
export function ArtifactImport({ id, labelledBy, shown, data, show, onShow, onPermission }) {
  const s = useCanvasStyles(), ids = useId();
  const [source, setSource] = useState('');
  const [problem, setProblem] = useState('');
  const [scrolls, setScrolls] = useState(false);
  const panel = useRef(null), input = useRef(null), statusNode = useRef(null), focusStatus = useRef(false);
  const status = importRequestStatus(data);
  const reason = importActionReason(data);
  const ack = status?.acknowledgment ?? null;
  const permission = status?.phase === 'waiting_permission' ? importPermission(data, status.receipt) : null;
  const phase = status ? PHASES[status.phase] ?? PHASES.unavailable : null;
  const notSent = Boolean(status && !ack && ['unavailable', 'stale'].includes(status.phase) && !status.record?.sendStarted);
  const change = ack ? FILE_CHANGES[ack.outcome === 'applied' ? 'applied' : ack.mutation === 'applied' ? 'partial' : ack.mutation] : null;

  // Like About, the panel is a focus stop only while it has something to scroll.
  useLayoutEffect(() => {
    const node = panel.current;
    if (!shown) return undefined;
    const measure = () => setScrolls(node.scrollHeight > node.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [shown]);
  // A new request moves focus to its status, which replaces the disabled button.
  useLayoutEffect(() => {
    if (!focusStatus.current || !statusNode.current) return;
    focusStatus.current = false;
    statusNode.current.focus({ preventScroll: true });
    statusNode.current.scrollIntoView({ block: 'nearest' });
  });

  const submit = event => {
    event.preventDefault();
    if (reason) return;
    const found = importSourceProblem(source);
    setProblem(found);
    if (found) { input.current?.focus(); return; }
    // The exact trimmed text, never normalized, is both bodies' and the receipt's binding.
    if (data.requestImport(source.trim())) focusStatus.current = true;
  };
  const noteId = `${ids}-note`, titleId = `${ids}-title`, textId = `${ids}-text`, showNote = `${ids}-show`;

  return <div ref={panel} role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={!shown}
    tabIndex={shown && scrolls ? 0 : undefined} className={s.aboutPanel} data-import-panel>
    <div className={s.importBody}>
      <div className={s.importIntro}>
        <h2 className={s.subheading} data-import-heading>Import an agent or skill</h2>
        <p className={s.prose}>Imported agents and skills become project files named <code className={s.code}>dude-local-*</code> in{' '}
          <code className={s.code}>.github/agents</code> and <code className={s.code}>.github/skills</code>. They belong to this
          project, appear in Installed, and are not packs. This tab adds no packs: packs are added from Available.</p>
      </div>
      <form className={s.importForm} onSubmit={submit} noValidate>
        <Field label={{ children: 'Source', weight: 'semibold' }} validationState={problem ? 'error' : 'none'}
          validationMessage={problem || undefined}
          hint="One local file or directory path, or a public GitHub file, directory, or raw file URL. Canvas never asks for credentials.">
          <Input ref={input} className={s.control} value={source} placeholder="Local path or GitHub URL" autoComplete="off" autoCapitalize="off"
            spellCheck={false} data-import-source onChange={(_, next) => { setSource(next.value); setProblem(''); }} />
        </Field>
        <dl className={s.sourceForms} aria-label="Accepted source forms">
          {FORMS.map(([label, form]) => <React.Fragment key={label}><dt>{label}</dt><dd>{form}</dd></React.Fragment>)}
        </dl>
        <div className={s.importAction}>
          <Button type="submit" appearance="primary" disabled={Boolean(reason)} aria-describedby={noteId}
            data-import-request>Request import</Button>
          <Text id={noteId} className={s.eyebrow} data-import-note>{reason || READY_NOTE}</Text>
        </div>
      </form>
      {status && <section className={s.importRequest} aria-labelledby={`${ids}-heading`} data-import-request-status>
        <h3 id={`${ids}-heading`} className={s.importRequestHeading}>Import request</h3>
        <MessageBar ref={statusNode} tabIndex={-1} layout="multiline" intent={INTENTS[status.phase] ?? 'info'}
          icon={IN_FLIGHT.includes(status.phase) ? <Spinner size="extra-tiny" />
            : status.phase === 'waiting_permission' ? <CommentRegular /> : undefined}
          className={mergeClasses(s.notice, s.importStatus)} aria-labelledby={titleId} aria-describedby={textId}
          data-import-status data-import-phase={status.phase}>
          <MessageBarBody>
            <div role="status" aria-live="polite" aria-atomic="true" className={s.tight}>
              <MessageBarTitle id={titleId}>{phase[0]}</MessageBarTitle>
              <div id={textId} className={s.tight}>
                <span>{status.message || phase[1]}</span>
                {status.phase === 'applied' && <span>{NEW_SESSION}</span>}
              </div>
            </div>
          </MessageBarBody>
          {permission && <MessageBarActions className={s.importStatusActions}>
            <Button appearance="primary" data-import-permission={permission.requestHandle}
              onClick={() => onPermission('import', status.receipt)}>Open Needs you</Button>
          </MessageBarActions>}
        </MessageBar>
        {status.phase === 'applied' && ack?.outcome === 'applied' && <div className={s.importAction} data-import-show>
          <Button appearance="primary" disabled={!show?.key} aria-describedby={showNote}
            onClick={() => show?.key && onShow(show.key)} data-import-show-button>Show in Installed</Button>
          <Text id={showNote} className={s.eyebrow} role="status" aria-live="polite" data-import-show-note>
            {show?.key ? SHOW_READY : show?.reason}
          </Text>
        </div>}
        <dl className={s.aboutFacts}>
          <Row label="Requested source"><code className={s.code}>{status.source}</code></Row>
          {status.receipt && <Row label="Receipt"><code className={s.code}>{status.receipt}</code></Row>}
          {ack && <>
            <Row label="Dude's note"><span className={s.prose}>{ack.note}</span></Row>
            <Row label="File changes"><span><Text weight="semibold">{change[0]}</Text> {change[1]}</span></Row>
            {ack.written.length > 0 && <Row label={`Written files (${ack.written.length})`} paths><PathList paths={ack.written} /></Row>}
            {ack.uncertain.length > 0 && <Row label={`Uncertain paths (${ack.uncertain.length})`} paths><PathList paths={ack.uncertain} /></Row>}
          </>}
        </dl>
        {(ack || !notSent) && <Text className={s.eyebrow}>
          {ack ? 'Checked when Dude reported this result. Canvas does not watch these files afterward.'
            : 'Leaving Settings does not cancel this request, and nothing is sent again automatically.'}
        </Text>}
      </section>}
    </div>
  </div>;
}

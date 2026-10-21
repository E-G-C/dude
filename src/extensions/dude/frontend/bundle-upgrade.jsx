import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Button, Checkbox, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Spinner, Text,
} from '@fluentui/react-components';
import { ArrowRight20Regular, DismissRegular } from '@fluentui/react-icons';
import { KeptFolders, releasePage, sentence, WhatsNew } from './about.jsx';
import { mergeClasses, useCanvasStyles } from './styles.js';

/*
 * 072: updating Dude from Canvas. A quiet notice in Needs you, one dialog that
 * prepares, shows, and applies one exact result on OK, and the old-session page
 * once an update has started writing. Every value shown comes from the update
 * state the server answers (GET /api/updates and its closed actions): the
 * recorded installation, this session's check, the prepared difference with its
 * branch and dirty paths, and the engine's outcome. Nothing here polls, sends a
 * chat message, or opens a Needs you request.
 */

/** Code-unit order, as the server sorts. */
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
/** Whether stable release `left` is older than `right`, numerically. @param {unknown} left @param {unknown} right */
const olderRelease = (left, right) => {
  const parts = value => /^v(\d+)\.(\d+)\.(\d+)$/.exec(String(value))?.slice(1).map(Number) ?? null;
  const [a, b] = [parts(left), parts(right)];
  if (!a || !b) return false;
  const index = a.findIndex((value, at) => value !== b[at]);
  return index >= 0 && a[index] < b[index];
};
const OP_WORDS = { add: 'Added', replace: 'Replaced', remove: 'Removed' };
const COUNT_KEYS = ['added', 'replaced', 'removed'];
/** @param {{ added: number, replaced: number, removed: number }} counts */
const countText = counts => COUNT_KEYS.filter(key => counts[key] > 0).map(key => `${counts[key]} ${key}`).join(', ') || 'No changes';

/**
 * The reviewed difference in the dialog's groups: Dude core, Metadata, then each
 * affected pack by name, each with its counts and its files in the server's order.
 */
function groupsOf(update) {
  const packs = Object.keys(update.counts.packs).sort(compare);
  return [
    { key: 'core', label: 'Dude core', counts: update.counts.core, pack: null },
    { key: 'metadata', label: 'Metadata', counts: update.counts.metadata, pack: null },
    ...packs.map(name => ({ key: `pack:${name}`, label: `${name} pack`, counts: update.counts.packs[name], pack: name })),
  ].map(group => ({ ...group, files: update.changes.filter(change => (group.pack === null
    ? change.group === group.key : change.group === 'pack' && change.pack === group.pack)) }));
}

/**
 * Place children right after the Needs you page title, inside the page's own
 * column: the title belongs to the Needs you view, so the notice joins it as
 * its next sibling and keeps the reading and Tab order of what is shown.
 */
function UnderTitle({ panel, children }) {
  const s = useCanvasStyles();
  const [slot] = useState(() => document.createElement('div'));
  const [placed, setPlaced] = useState(false);
  useLayoutEffect(() => {
    slot.className = s.noticeSlot;
    const title = panel.current?.querySelector(':scope > div > h1');
    if (title && title.nextSibling !== slot) title.after(slot);
    else if (!title) slot.remove();
    if (Boolean(title) !== placed) setPlaced(Boolean(title));
  });
  useLayoutEffect(() => () => slot.remove(), [slot]);
  return placed ? createPortal(children, slot) : null;
}

/**
 * The Needs you notice: Fluent's informational MessageBar under the page
 * title, outside the request cards and their counts. It shows exactly while
 * the server's notice does, which Later ends for this session. Review update
 * opens the update dialog.
 */
function UpdateNotice({ notice, onReview, onLater }) {
  const s = useCanvasStyles(), id = useId();
  const link = releasePage(notice.releaseUrl);
  return <MessageBar intent="info" layout="multiline" role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`}
    className={mergeClasses(s.notice, s.narrowBar)} data-update-notice>
    <MessageBarBody>
      <MessageBarTitle id={`${id}-title`}>Dude {notice.availableRef} is available</MessageBarTitle>
      <div id={`${id}-text`}>You have {notice.installedRef}.{link && <> <WhatsNew url={link} tag={notice.availableRef} /></>}</div>
    </MessageBarBody>
    <MessageBarActions className={mergeClasses(s.narrowBarActions, s.noticeActions)}>
      <Button appearance="primary" size="medium" aria-haspopup="dialog" data-update-review
        onClick={event => onReview(event.currentTarget)}>Review update</Button>
      <Button size="medium" data-update-later onClick={onLater}>Later</Button>
    </MessageBarActions>
  </MessageBar>;
}

/**
 * What Needs you shows about updating Dude, under its title and in this order:
 * the notice while the server has one, then the temporary folders this
 * session kept, which stay after Later because the notice's slot holds them.
 * `notice` is null when it is not shown; `kept` is the server's list.
 */
export function NeedsUpdates({ panel, notice, kept, onReview, onLater }) {
  return <UnderTitle panel={panel}>
    {notice && <UpdateNotice notice={notice} onReview={onReview} onLater={onLater} />}
    {kept.length > 0 && <KeptFolders kept={kept} />}
  </UnderTitle>;
}

/* ------------------------------------------------------------------ The dialog */

// The mock's bar: a title, then lines 4px apart. A line is a sentence or a node such as a path list.
function Bar({ intent, title, lines = [] }) {
  const s = useCanvasStyles();
  return <MessageBar intent={intent} layout="multiline" className={mergeClasses(s.notice, s.packActionBar)}>
    <MessageBarBody>
      <MessageBarTitle>{title}</MessageBarTitle>
      {lines.length > 0 && <div className={s.tight}>{lines.map((line, index) => (typeof line === 'string'
        ? <span key={index}>{line}</span> : <React.Fragment key={index}>{line}</React.Fragment>))}</div>}
    </MessageBarBody>
  </MessageBar>;
}

function PathList({ paths }) {
  const s = useCanvasStyles();
  return <ul className={mergeClasses(s.pathList, s.updatePaths)}>
    {paths.map(file => <li key={file}><code className={s.code}>{file}</code></li>)}
  </ul>;
}

/** The engine's or Git's own words, collapsed, as 083 shows Compose's. */
function Details({ summary, text }) {
  const s = useCanvasStyles();
  return <details className={s.packFiles}>
    <summary>{summary}</summary>
    <p className={mergeClasses(s.code, s.packActionMessage)}>{text}</p>
  </details>;
}

function Counts({ heading, groups }) {
  const s = useCanvasStyles(), id = useId();
  return <section className={s.updateSection} aria-labelledby={id} data-update-counts>
    <h3 id={id} className={s.packMetadataHeading}>{heading}</h3>
    <dl className={s.updateCounts}>
      {groups.map(group => <React.Fragment key={group.key}><dt>{group.label}</dt><dd>{countText(group.counts)}</dd></React.Fragment>)}
    </dl>
  </section>;
}

/** Show files: every reviewed path with its operation, and a pill on those with uncommitted edits. */
function Files({ groups, dirty, open, onToggle }) {
  const s = useCanvasStyles();
  const total = groups.reduce((sum, group) => sum + group.files.length, 0);
  return <details className={mergeClasses(s.packFiles, s.updateFiles)} open={open}
    onToggle={event => onToggle(event.currentTarget.open)} data-update-files>
    <summary>Show files ({total})</summary>
    {groups.filter(group => group.files.length).map(group => <React.Fragment key={group.key}>
      <h4 className={s.updateFilesGroup}>{group.label}</h4>
      <ul className={s.updateFileList}>{group.files.map(change => <li key={change.path}>
        <span className={s.updateOp}>{OP_WORDS[change.op]}</span>
        <span className={s.updateFilePath}><code className={s.code}>{change.path}</code>
          {dirty.has(change.path) && <span className={s.pill}>Uncommitted edits</span>}</span>
      </li>)}</ul>
    </React.Fragment>)}
  </details>;
}

function Branch({ name }) {
  const s = useCanvasStyles();
  return <code className={s.code}>{name}</code>;
}

/**
 * The truthful activity of a running preparation: the engine's own steps, with
 * completed and total packs, and no percentage. Before the helper reports, it
 * says only that the update is being prepared.
 */
function activity(update, to) {
  if (update?.phase !== 'preparing' || !update.step) return 'Preparing the update...';
  if (update.step === 'fetching') return to ? `Fetching release ${to}...` : 'Fetching the release...';
  if (update.step === 'staging-core') return 'Staging core...';
  if (update.step === 'preparing-pack') return `Preparing pack ${update.pack} (${update.completed + 1} of ${update.total})...`;
  return 'Comparing files...';
}

// Refusals of a route answer, in words. The update state itself is read again after each.
const PREVIEW_REFUSALS = {
  connection_lost: 'The connection to Canvas was interrupted. Prepare again, or close this dialog.',
  no_update: "This session's check no longer finds a newer release to prepare.",
  not_eligible: "This installation's update channel doesn't take release updates.",
};
// OK that was not applied, as a title and words: by the server's own refusal, or by a state read that began after
// OK's answer was lost and still found the same ready preview. Only these say that nothing changed.
const APPLY_REFUSALS = {
  busy: ['OK was not accepted', 'Another change in Canvas is still finishing, so OK was not accepted. Nothing changed. Select OK again when it finishes.'],
  stale: ['OK was not accepted', 'OK was for a preview that is no longer the current one, so it was not accepted. Nothing changed.'],
  not_received: ['OK was not received', 'The connection was interrupted before Dude received OK. Nothing changed. Select OK to apply this preview.'],
};
// The engine's freshness refusals before writing name what changed and ask for a new preview.
const FRESHNESS = /; prepare the upgrade again$/;
const CHANGED_FILE = /^(\S.*?) changed since the preview; prepare the upgrade again$/;

/** Where focus goes when a phase starts by itself: the safe button first, the body while files are written, the result's own button. */
const PHASE_FOCUS = { preparing: 'cancel', ready: 'cancel', packfail: 'cancel', failed: 'cancel', refused: 'cancel', noop: 'cancel',
  applying: 'body', checking: 'body', uncertain: 'body', working: 'body', unknown: 'primary', success: 'primary', stale: 'primary',
  restored: 'cancel', unconfirmed: 'cancel' };
const WRITTEN = ['success', 'restored', 'unconfirmed'];
// From OK until an outcome, or until a read settles a lost answer: busy, and nothing in the dialog stops or closes it.
const AFTER_OK = ['applying', 'checking', 'uncertain', 'working'];
// Neither may the unsettled answer whose read failed: the update may be writing, so only Read again is offered.
const LOCKED = [...AFTER_OK, 'unknown'];
const BUSY = ['preparing', ...AFTER_OK];

/**
 * The dialog's phase, from the update state, this dialog's own request in
 * flight, and an OK whose answer was lost. Applying and Checking come from the
 * server's phase, which moves to Checking only when the engine reports that
 * its bundle check after writing has started; nothing here infers one from
 * time. A lost answer stays uncertain until a state read that began after it
 * settles what happened, and a phase this Canvas does not know is a neutral
 * busy state, never an outcome.
 */
function phaseOf(update, sent, refusal, lost) {
  if (lost) return lost.reading ? 'uncertain' : 'unknown';
  if (sent?.op === 'apply') return 'applying';
  if (sent?.op === 'preview') return 'preparing';
  if (!update) return refusal ? 'refused' : null;
  switch (update.phase) {
    case 'preparing': return 'preparing';
    case 'ready': return 'ready';
    case 'failed': return update.reason === 'pack-failed' && update.packChoice ? 'packfail' : 'failed';
    case 'nothing_to_update': return 'noop';
    case 'applying': return 'applying';
    case 'checking': return 'checking';
    case 'applied': return 'success';
    case 'nothing_changed': return 'stale';
    case 'restored': return 'restored';
    case 'restoration_unconfirmed': return 'unconfirmed';
    default: return 'working';
  }
}

/** A Tab or Shift+Tab at either end wraps inside the dialog, as 083's dialogs do. */
function trapTab(event, dialog) {
  if (event.key !== 'Tab') return;
  const stops = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex="0"]')]
    .filter(node => node.getClientRects().length);
  const first = stops[0], last = stops.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/**
 * The one update dialog (072), 083's native modal dialog: a title and Close, a
 * body that alone scrolls, and a footer. Review update or Update to <tag>
 * opens it at once and prepares the newest release, with Cancel. The ready
 * preview shows the version change, the affected-pack choice, grouped counts,
 * the overwrite, branch and new-session warnings, and Show files; OK applies
 * exactly that preview, once. Changing the pack choice prepares again, and OK
 * waits for the new preview. After OK nothing in the dialog can stop the
 * application: it is Applying, then Checking once the server says the bundle
 * check after writing started, until the outcome. An OK whose answer was lost
 * is never sent again and never called unchanged: the dialog reads the state
 * first and shows what that read found, keeping OK until the same preview is
 * shown still waiting for it. Cancel or Close before writing discards the
 * preparation; Done or Close after a write leads to the old-session page, and
 * sends nothing.
 *
 * `request` is `{ id, trigger }` while open, else null. `onReread()` is one
 * fresh state read. `onClose(written)` belongs to the shell, which shows the
 * old-session page after a write.
 */
export function UpdateDialog({ request, updates, onAction, onReread, onClose }) {
  const s = useCanvasStyles(), ids = useId();
  const dialog = useRef(null), body = useRef(null), cancelButton = useRef(null), primaryButton = useRef(null), box = useRef(null);
  const [opened, setOpened] = useState(null);
  const [sent, setSent] = useState(null);
  const [refusal, setRefusal] = useState(null);
  // An OK whose answer did not say whether the update started: `{ id, reading }` until a state read settles it.
  const [lost, setLost] = useState(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const session = useRef(0), inflight = useRef(Promise.resolve()), choice = useRef(true), returnTo = useRef(null);
  const focusNext = useRef(null), shownPhase = useRef(null), settling = useRef(null);
  // A new opening starts preparing at once, before any answer arrives.
  if ((request?.id ?? null) !== opened) {
    setOpened(request?.id ?? null);
    setSent(request ? { op: 'preview', includePacks: true } : null);
    setRefusal(null);
    setLost(null);
    setFilesOpen(false);
  }
  const update = updates?.update ?? null;
  // A state whose write gate is no longer open settles a lost answer by itself: an update is writing or has written.
  const gateMoved = Boolean(lost && updates && updates.gate !== 'open');
  const unsettled = gateMoved ? null : lost;
  const phase = request ? phaseOf(update, sent, refusal, unsettled) : null;
  // The server refused OK for this preview as no longer current: OK waits for the state that replaces it.
  const blocked = phase === 'ready' && refusal?.during === 'apply' && refusal.code === 'stale' && refusal.id === update?.id;

  /** One preparation for the chosen pack group; it replaces any live one, and OK waits for it. */
  const prepare = (includePacks, focus = null) => {
    const mine = { op: 'preview', includePacks }, turn = session.current;
    choice.current = includePacks;
    focusNext.current = focus;
    setSent(mine);
    setRefusal(null);
    setFilesOpen(false);
    inflight.current = onAction({ op: 'preview', includePacks }).then(answer => {
      if (session.current !== turn) return;
      setSent(current => (current === mine ? null : current));
      if (!answer.ok) setRefusal({ code: answer.code, during: 'preview' });
    });
  };
  /**
   * OK's answer was lost, or did not say whether the update started: read the
   * state before saying anything. Only the same ready preview, still waiting
   * for OK, shows that OK never arrived; a failed read stays uncertain, with
   * Read again. OK is never sent again from here.
   */
  const settle = (id, focus = null) => {
    const mine = { id, reading: true }, turn = session.current;
    settling.current = mine;
    if (focus) focusNext.current = focus;
    setRefusal(null);
    setLost(mine);
    void onReread().then(answer => {
      if (session.current !== turn || settling.current !== mine) return;
      if (!answer.ok) {
        const unread = { id, reading: false };
        settling.current = unread;
        setLost(unread);
        return;
      }
      settling.current = null;
      setLost(null);
      const now = answer.value;
      if (now.gate === 'open' && now.update?.phase === 'ready' && now.update.id === id) setRefusal({ code: 'not_received', during: 'apply', id });
    });
  };
  // One OK applies exactly this ready result, once; from here nothing cancels it.
  const apply = () => {
    if (phase !== 'ready' || !update?.id || blocked) return;
    const id = update.id, mine = { op: 'apply', id }, turn = session.current;
    focusNext.current = 'body';
    setSent(mine);
    setRefusal(null);
    void onAction({ op: 'apply', id }).then(answer => {
      if (session.current !== turn) return;
      // The server's own answers that OK was not applied keep the preview; any other answer, or none, is read first.
      if (!answer.ok && (answer.code === 'busy' || answer.code === 'stale')) setRefusal({ code: answer.code, during: 'apply', id });
      else if (!answer.ok) settle(id);
      setSent(current => (current === mine ? null : current));
    });
  };
  // Cancel or Close before writing: the preparation is discarded, after the request that started it answers. The
  // cancellation belongs to this opening only: if the dialog opens again before that answer, the new opening's own
  // preview has already replaced this one on the server, and a cancel sent then would discard the new preview instead.
  const dismiss = () => {
    const pending = inflight.current, closed = ++session.current;
    returnTo.current = request?.trigger ?? null;
    onClose(false);
    void pending.then(() => (session.current === closed ? onAction({ op: 'cancel' }) : undefined));
  };
  // Done or Close after a write: nothing to cancel, and the old Canvas is finished.
  const finish = () => { session.current += 1; onClose(true); };
  const close = () => {
    if (!phase || LOCKED.includes(phase)) return;
    if (WRITTEN.includes(phase)) finish();
    else dismiss();
  };

  useLayoutEffect(() => {
    if (!request) return;
    session.current += 1;
    prepare(true, 'cancel');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  // The gate settled a lost answer: forget it, so a gate that opens again later cannot revive it.
  useEffect(() => {
    if (!gateMoved) return;
    settling.current = null;
    setLost(null);
  }, [gateMoved]);
  // The native modal opens with the request and closes without one. A dismissal returns focus to
  // the control that opened the dialog, or the same action where its control rendered again (the
  // notice leaves while an application runs), or else to the page's heading.
  useLayoutEffect(() => {
    const node = dialog.current;
    if (request && phase) { if (!node.open) node.showModal(); return; }
    if (node.open) node.close();
    const trigger = returnTo.current;
    returnTo.current = null;
    if (!trigger) return;
    const usable = target => Boolean(target?.isConnected && !target.disabled && target.getClientRects().length && !target.closest('[inert]'));
    const marker = ['data-update-review', 'data-update-open'].find(name => trigger.hasAttribute(name));
    const again = marker ? document.querySelector(`[${marker}]`) : null;
    const heading = document.querySelector('main [role="tabpanel"]:not([hidden]) h1');
    const target = usable(trigger) ? trigger : usable(again) ? again : heading;
    if (target === heading && heading) heading.tabIndex = -1;
    target?.focus({ preventScroll: true });
  });
  // The update ended elsewhere, as when another Canvas cancelled it: nothing is left to show.
  useEffect(() => {
    if (!request || phase) return;
    returnTo.current = request.trigger;
    onClose(false);
  });
  // Each phase shows from its top; focus stays on a usable control unless the step names where it goes. Leaving the
  // busy time after OK for a result moves focus to that result's own button.
  useLayoutEffect(() => {
    if (!phase || !dialog.current?.open) { shownPhase.current = phase; return; }
    const settled = AFTER_OK.includes(shownPhase.current) && !AFTER_OK.includes(phase);
    const target = focusNext.current ?? (settled ? PHASE_FOCUS[phase] : null);
    if (shownPhase.current !== phase && body.current) body.current.scrollTop = 0;
    shownPhase.current = phase;
    focusNext.current = null;
    const active = document.activeElement;
    const usable = node => Boolean(node?.isConnected && !node.disabled && node.getClientRects().length);
    if (!target && dialog.current.contains(active) && active !== dialog.current && usable(active)) return;
    const node = { cancel: cancelButton, primary: primaryButton, body, box }[target ?? PHASE_FOCUS[phase]]?.current;
    (usable(node) ? node : body.current)?.focus({ preventScroll: true });
  }, [phase, request]);

  const check = updates?.check ?? null;
  const from = update?.fromRef ?? updates?.installation?.installedRef ?? null;
  const to = update?.toRef ?? check?.availableRef ?? null;
  const link = releasePage(update?.releaseUrl ?? (to && to === check?.availableRef ? check.releaseUrl : null));
  const includes = sent?.op === 'preview' ? sent.includePacks : update?.includePacks ?? choice.current;
  const packChoice = update?.packChoice ?? null;
  const reviewed = update && ['ready', 'applying', 'checking', 'applied', 'nothing_changed', 'restored', 'restoration_unconfirmed']
    .includes(update.phase) && update.counts ? update : null;
  const groups = reviewed ? groupsOf(reviewed) : [];
  const total = reviewed ? reviewed.changes.length : 0;
  const dirty = new Set(reviewed?.dirtyPaths ?? []);
  const showBox = Boolean(packChoice) && ['preparing', 'ready', 'packfail'].includes(phase);
  const busy = BUSY.includes(phase);
  // Why OK was not applied, shown over the preview it concerns; a preview replaced as no longer current says so over its successor.
  const said = phase === 'ready' && refusal?.during === 'apply' && (refusal.code === 'stale' || refusal.id === update.id)
    ? APPLY_REFUSALS[refusal.code] : null;

  const choiceLine = packChoice && phase === 'preparing'
    ? (includes ? 'Preparing a new preview that includes packs.' : 'Preparing a new preview without packs.') : null;
  const failedPack = update?.pack ?? null;
  const boxDescription = phase === 'packfail' ? `The ${failedPack ?? 'selected'} pack couldn't be prepared.`
    : phase !== 'ready' ? '' : includes ? groups.filter(group => group.pack).map(group => `${group.pack}: ${countText(group.counts)}.`).join(' ')
      : 'Not included in this preview.';

  let content = null;
  if (phase === 'preparing') {
    content = <>
      {choiceLine && <p className={s.updateLine}>{choiceLine}</p>}
      <div className={s.packActionStatus}><Spinner size="extra-tiny" aria-hidden="true" /><Text>{activity(sent ? null : update, to)}</Text></div>
      <Text className={s.eyebrow}>Nothing in your project changes until you select OK.</Text>
    </>;
  } else if (phase === 'ready') {
    const dirtyTouched = reviewed.changes.filter(change => dirty.has(change.path)).map(change => change.path);
    content = <>
      {said && <Bar intent="warning" title={said[0]} lines={[said[1]]} />}
      <Counts heading="Changes" groups={groups} />
      <Bar intent="warning" title="Customizations may be overwritten" lines={[
        "Uncommitted edits to the files this update changes can't be recovered afterward.",
        ...(dirtyTouched.length ? ['These files have uncommitted edits:', <PathList paths={dirtyTouched} />] : [])]} />
      <p className={s.updateLine}>Changes stay uncommitted on <Branch name={reviewed.branch} />. Start a new session afterward to use {reviewed.toRef}.</p>
      <Files groups={groups} dirty={dirty} open={filesOpen} onToggle={setFilesOpen} />
    </>;
  } else if (phase === 'packfail') {
    content = <>
      <Bar intent="warning" title="Packs can't be included" lines={[`Dude couldn't prepare the ${failedPack ?? 'selected'} pack, so this update can't include packs. Untick "Also update installed packs" to update Dude without them.`]} />
      {update.message && <Details summary="Compose's message" text={update.message} />}
    </>;
  } else if (phase === 'failed') {
    const offline = update.reason === 'unavailable';
    // The release's GitHub repository, only as its validated release page names it; other sources stay unnamed.
    const source = link ? link.slice('https://'.length, link.indexOf('/releases/tag/')) : null;
    content = <>
      <Bar intent="error" title="Couldn't prepare the update" lines={[offline
        ? `Nothing changed. Dude couldn't download ${to ?? 'the release'}${source ? ` from ${source}` : ''}. Check your connection, then prepare again.`
        : `Nothing changed. Dude couldn't prepare ${to ?? 'the update'}. Prepare again, or cancel.`]} />
      {update.message && <Details summary={offline ? "Git's message" : 'Error message'} text={update.message} />}
      {update.cleanup && <Text className={s.eyebrow}>{update.cleanup}</Text>}
    </>;
  } else if (phase === 'refused') {
    content = <Bar intent="error" title="Couldn't prepare the update" lines={['Nothing changed.',
      PREVIEW_REFUSALS[refusal.code] ?? "Canvas can't reach this workspace's update state."]} />;
  } else if (phase === 'noop') {
    // A release that moved behind the installed version since the check is never offered as a downgrade,
    // and files that already are the running version need no new session.
    const running = updates?.runningRef ?? update.fromRef;
    content = <Bar intent="info" title="Nothing to update" lines={[olderRelease(update.toRef, update.fromRef) ? sentence(update.message)
      : update.toRef === running ? `This project already has the Dude ${update.toRef} files, so nothing changes.`
        : `This project already has the Dude ${update.toRef} files, so nothing changes. Start a new session to use them.`]} />;
  } else if (phase === 'applying') {
    content = <>
      <div className={s.packActionStatus}><Spinner size="extra-tiny" aria-hidden="true" /><Text>Applying the update...</Text></div>
      {reviewed && <Text className={s.eyebrow}>Writing {plural(total, 'file')} on <Branch name={reviewed.branch} />. This can&apos;t be canceled.</Text>}
    </>;
  } else if (phase === 'checking') {
    content = <>
      <div className={s.packActionStatus}><Spinner size="extra-tiny" aria-hidden="true" /><Text>Checking the updated files...</Text></div>
      <Text className={s.eyebrow}>If the check finds a new problem, Dude puts the previous files back.</Text>
    </>;
  } else if (phase === 'uncertain') {
    // OK may or may not have started the update: no outcome, no OK, and nothing sent again until a read shows which.
    content = <>
      <div className={s.packActionStatus}><Spinner size="extra-tiny" aria-hidden="true" /><Text>Checking whether the update started...</Text></div>
      <Text className={s.eyebrow}>The connection was interrupted after OK. Nothing is sent again.</Text>
    </>;
  } else if (phase === 'unknown') {
    content = <Bar intent="warning" title="The response was lost" lines={[
      "Canvas can't tell whether the update started. Nothing is sent again. Read again to check."]} />;
  } else if (phase === 'working') {
    content = <div className={s.packActionStatus}><Spinner size="extra-tiny" aria-hidden="true" /><Text>Working on the update...</Text></div>;
  } else if (phase === 'success') {
    const existing = update.existingFailures ?? [];
    content = <>
      <Bar intent="success" title={`Dude ${update.toRef} is installed`}
        lines={[`This session still runs ${updates.runningRef ?? update.fromRef}. Start a new session to use ${update.toRef}.`]} />
      <Counts heading="Changes applied" groups={groups} />
      <p className={s.updateLine}>Changes are uncommitted on <Branch name={update.branch} />. Review and commit them when you&apos;re ready.</p>
      {existing.length > 0 && <>
        <Bar intent="info" title={`The check still reports ${plural(existing.length, 'problem')}`}
          lines={['They were in this project before the update, which added none.']} />
        <Details summary="Check output" text={existing.join('\n')} />
      </>}
      {update.cleanup && <Text className={s.eyebrow}>{update.cleanup}</Text>}
    </>;
  } else if (phase === 'stale') {
    const file = CHANGED_FILE.exec(update.message ?? '')?.[1];
    content = FRESHNESS.test(update.message ?? '') ? <Bar intent="warning" title="The preview is out of date" lines={[
      ...(file && file !== 'the prepared upgrade' ? ['Nothing changed. This file changed after the preview was prepared:', <PathList paths={[file]} />]
        : [`Nothing changed. ${sentence(update.message.replace(FRESHNESS, ''))}`]),
      'Prepare again to review the current changes.']} />
      : <>
        <Bar intent="error" title="Update failed" lines={['Nothing changed. Dude stopped before writing any file.',
          'Prepare again to try once more.']} />
        {update.message && <Details summary="Error message" text={update.message} />}
      </>;
  } else if (phase === 'restored') {
    const found = update.newFailures ?? [];
    content = <>
      <Bar intent="error" title="Update failed" lines={[found.length
        ? 'Files restored. The check after writing found a new problem, so Dude put the previous files back.'
        : "Files restored. The update didn't finish, so Dude put the previous files back.",
      'Start a new session to keep using Canvas.']} />
      {found.length ? <Details summary="Check output" text={found.join('\n')} />
        : update.message && <Details summary="Error message" text={update.message} />}
    </>;
  } else if (phase === 'unconfirmed') {
    const paths = update.paths ?? [];
    content = <>
      <Bar intent="error" title="Update failed" lines={[
        ...(paths.length ? ["Restoration unconfirmed. Dude couldn't confirm that these files were put back:", <PathList paths={paths} />]
          : ["Restoration unconfirmed. Dude couldn't confirm that your files were put back."]),
        "Inspect them before you start a new session, for example with git status. Dude won't repeat the update on its own."]} />
      {update.message && <Details summary="Error message" text={[update.message, ...(update.newFailures ?? [])].join('\n')} />}
    </>;
  }

  const cancelText = { preparing: 'Cancel', ready: 'Cancel', packfail: 'Cancel', failed: 'Cancel', refused: 'Close', noop: 'Close',
    stale: 'Close', restored: 'Close', unconfirmed: 'Close' }[phase];
  const primaryText = { ready: 'OK', packfail: 'OK', failed: 'Prepare again', stale: 'Prepare again', success: 'Done', unknown: 'Read again',
    ...(refusal?.code === 'connection_lost' ? { refused: 'Prepare again' } : {}) }[phase];
  // Blocked: OK is disabled with its reason beside it (083's footer rule).
  const reason = phase === 'packfail' ? "Packs can't be included" : blocked ? 'This preview is no longer the current one' : '';
  const hint = phase === 'ready' ? `Applies this preview: ${plural(total, 'file')}, uncommitted on ${reviewed.branch}.` : '';
  const live = !phase ? '' : phase === 'preparing' ? (choiceLine && !update?.step ? choiceLine : activity(sent ? null : update, to))
    : said ? `${said[0]}. Nothing changed.` : {
      ready: `Preview ready. ${plural(total, 'file')} change${total === 1 ? 's' : ''}.`,
      packfail: 'Packs can\'t be included. Untick "Also update installed packs" to continue without them.',
      failed: "Couldn't prepare the update. Nothing changed.", refused: "Couldn't prepare the update. Nothing changed.",
      noop: 'Nothing to update.', applying: 'Applying the update.', checking: 'Checking the updated files.',
      uncertain: 'Checking whether the update started.', unknown: "The response was lost. Canvas can't tell whether the update started.",
      working: 'Working on the update.',
      success: `Dude ${update?.toRef} is installed. Start a new session to use it.`,
      stale: FRESHNESS.test(update?.message ?? '') ? 'The preview is out of date. Nothing changed.' : 'Update failed. Nothing changed.',
      restored: 'Update failed. Files restored.', unconfirmed: 'Update failed. Restoration unconfirmed.',
    }[phase];
  const primary = () => {
    if (phase === 'ready') apply();
    else if (phase === 'success') finish();
    else if (phase === 'unknown') settle(unsettled.id, 'body');
    else if (['failed', 'stale', 'refused'].includes(phase)) prepare(update?.includePacks ?? choice.current, 'cancel');
  };

  return <dialog ref={dialog} className={mergeClasses(s.packDialog, s.packActionDialog)} aria-labelledby={`${ids}-title`}
    data-update-dialog="" data-update-phase={phase ?? undefined}
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else trapTab(event, dialog.current);
    }}>
    {phase && <>
      <header className={s.packDetailHeader}>
        <h2 id={`${ids}-title`} className={mergeClasses(s.subheading, s.grow)}>Update Dude</h2>
        <Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" title="Close" disabled={LOCKED.includes(phase)}
          data-update-close onClick={close} />
      </header>
      <div ref={body} className={mergeClasses(s.packDetailBody, s.packActionBody)} tabIndex={0} role="region"
        aria-labelledby={`${ids}-title`} aria-busy={busy} data-update-body>
        {phase !== 'noop' && phase !== 'success' && from && to && <p className={s.updateVersion} data-update-version>
          <span className={s.updateFrom}>{from}</span><ArrowRight20Regular className={s.updateArrow} aria-hidden="true" />
          <span className={s.visuallyHidden}> to </span><span className={s.updateTo}>{to}</span>
          {link && <span className={s.updateVersionLink}><WhatsNew url={link} tag={to} /></span>}
        </p>}
        {showBox && <Checkbox ref={box} checked={includes} className={s.updatePacks} data-update-packs
          label={`Also update installed packs: ${packChoice.names.join(', ')}`} aria-describedby={`${ids}-packs`}
          onChange={(_, input) => prepare(Boolean(input.checked))} />}
        {showBox && <span id={`${ids}-packs`} className={s.visuallyHidden}>{boxDescription}</span>}
        {content}
      </div>
      {(cancelText || primaryText) && <footer className={mergeClasses(s.packDetailFooter, s.sourceDialogFooter, s.packActionFooter)}>
        {reason && <Text id={`${ids}-reason`} className={mergeClasses(s.eyebrow, s.packActionNote)} data-update-reason>{reason}</Text>}
        <span id={`${ids}-hint`} className={s.visuallyHidden}>{hint}</span>
        {cancelText && <Button ref={cancelButton} data-update-cancel onClick={close}>{cancelText}</Button>}
        {primaryText && <Button ref={primaryButton} appearance="primary" disabled={phase === 'packfail' || blocked} data-update-primary
          aria-describedby={reason ? `${ids}-reason` : phase === 'ready' ? `${ids}-hint` : undefined}
          onClick={primary}>{primaryText}</Button>}
      </footer>}
      <p className={s.visuallyHidden} role="status" aria-live="polite" aria-atomic="true" data-update-live>{live}</p>
    </>}
  </dialog>;
}

/* ---------------------------------------------------------- The old-session page */

/**
 * What the old Canvas shows once an update has started writing (FR-048): only
 * words, no control. Its server serves the same words on a reload: the
 * outcome, then the outcome's cleanup sentence and every temporary folder this
 * session kept, with why. The session keeps running its old Dude until a new
 * session starts.
 */
export function Handoff({ updates }) {
  const s = useCanvasStyles(), id = useId(), heading = useRef(null);
  const update = updates.update ?? {};
  const kept = updates.kept ?? [];
  useLayoutEffect(() => { heading.current?.focus(); }, []);
  let title, text;
  if (update.phase === 'applied') {
    title = `Start a new session to use Dude ${update.toRef}`;
    text = <>
      <p>Dude {update.toRef} is installed in this project, but this session still runs {updates.runningRef ?? update.fromRef}. Canvas can&apos;t be used in this session anymore.</p>
      <p>The changes are uncommitted on <Branch name={update.branch} />. Review and commit them when you&apos;re ready.</p>
    </>;
  } else if (update.phase === 'restored') {
    title = 'Start a new session to keep using Canvas';
    text = <p>The update didn&apos;t finish, and Dude restored your files. Canvas stops in a session once an update starts writing files.</p>;
  } else if (update.phase === 'restoration_unconfirmed') {
    const paths = update.paths ?? [];
    title = 'Start a new session to keep using Canvas';
    text = paths.length ? <>
      <p>The update didn&apos;t finish, and Dude couldn&apos;t confirm that these files were put back:</p>
      <PathList paths={paths} />
      <p>Inspect them before you start a new session, for example with git status.</p>
    </> : <p>The update didn&apos;t finish, and Dude couldn&apos;t confirm that your files were put back. Inspect them before you start a new session, for example with git status.</p>;
  } else {
    title = 'Dude is updating this project';
    text = <p>Canvas can&apos;t be used while the update writes and checks files. Reload this page to see the result.</p>;
  }
  return <main className={s.handoff} aria-labelledby={`${id}-title`} data-update-handoff={update.phase ?? 'applying'}>
    <div className={s.handoffBody}>
      <p className={s.eyebrow}>Dude</p>
      <h1 ref={heading} id={`${id}-title`} className={s.title} tabIndex={-1}>{title}</h1>
      <div className={s.handoffText}>
        {text}
        {update.cleanup && <p data-update-cleanup>{update.cleanup}</p>}
        {kept.length > 0 && <>
          <p>Dude kept these temporary folders because it couldn&apos;t confirm that they were cleaned up:</p>
          <ul className={mergeClasses(s.pathList, s.updatePaths)} data-update-kept-list>
            {kept.map(entry => <li key={entry.root}><code className={s.code}>{entry.root}</code>: {entry.reason}</li>)}
          </ul>
          <p>Remove them yourself once nothing uses them.</p>
        </>}
      </div>
    </div>
  </main>;
}

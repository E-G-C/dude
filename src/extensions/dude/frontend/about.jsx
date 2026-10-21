import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Field, Link, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Spinner, Switch } from '@fluentui/react-components';
import { CheckmarkCircle20Filled, Info20Filled, Open16Regular, Warning20Filled } from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { rereadPreference, retryPreferenceRead, toggleUpdateCheck, useUpdateCheckSetting } from './theme.js';

// Product identity comes from the accepted idea, not the installation record,
// so credit and the repository stay visible while that record loads or fails.
const REPOSITORY = 'https://github.com/E-G-C/dude';
const NOTE = 'Recorded installation metadata; installed files are not verified.';
const UNAVAILABLE_NOTE = 'Recorded installation metadata is unavailable, so no version is shown.';
const RELEASE = /^v\d+\.\d+\.\d+$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/+-]*$/;
const READING = Object.freeze({ state: 'reading' });
const UNAVAILABLE = Object.freeze({ state: 'unavailable' });

// The read boundary's ref rules, checked again before anything is displayed.
function usableRef(value) {
  return typeof value === 'string' && REF.test(value) && !value.includes('..')
    && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));
}

// Exactly { installedRef, sourceRef, baseRelease }: each ref a usable ref or
// null, and a base only as a stable release recorded beside the development
// ref. Any other shape is an unreadable result, never a partial record.
const FIELDS = ['installedRef', 'sourceRef', 'baseRelease'];
function installationRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== FIELDS.length || !FIELDS.every(key => keys.includes(key))) return null;
  const { installedRef, sourceRef, baseRelease } = value;
  if (![installedRef, sourceRef].every(ref => ref === null || usableRef(ref))) return null;
  return baseRelease === null || (typeof baseRelease === 'string' && RELEASE.test(baseRelease)
    && installedRef === 'main') ? value : null;
}

// Classify only the recorded values: no tag lookup, remote release, or claim
// about installed bytes. The version reads installedRef, supplemented only for
// development by its recorded base; the update channel (072) reads sourceRef.
const versionText = (ref, base) => RELEASE.test(ref) ? ref
  : ref === 'main' ? (base ? `Development (main), based on ${base}` : 'Development (main)') : `Recorded ref (${ref})`;
const channelText = ref => RELEASE.test(ref) ? `Pinned to ${ref}` : ref === 'main' ? 'Development (main)'
  : ref === 'latest' ? 'Latest release' : `Recorded ref (${ref})`;

/**
 * The Settings footer while About is shown (072): the recorded installed
 * version, which About's actions can change, in place of 074's "Read only".
 * @param {{ state: string, record?: { installedRef: string|null, baseRelease: string|null } } | null} read
 */
export function aboutFooter(read) {
  if (!read || read.state === 'reading') return 'About · Reading…';
  const record = read.state === 'current' ? read.record : null;
  const version = record?.installedRef ? versionText(record.installedRef, record.baseRelease) : null;
  if (!version) return 'About · Installation information unavailable';
  return `About · ${RELEASE.test(version) ? `Installed ${version}` : version}`;
}

/* --------------------------------------------------------------- 072: updates */

const onOff = value => (value ? 'on' : 'off');
// The engine's release page for a validated GitHub repository and stable tag, and nothing else.
const RELEASE_PAGE = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/releases\/tag\/v\d+\.\d+\.\d+$/;
/** A What's new destination the server built, checked again, or null. @param {unknown} url */
export const releasePage = url => (typeof url === 'string' && RELEASE_PAGE.test(url) ? url : null);
/** A check's completion time, as this computer shows a time of day. @param {string} iso */
export const checkedTime = iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
/** The engine's lower-case reason as a sentence. @param {string|null|undefined} text */
export const sentence = text => {
  const value = String(text ?? '').trim().replace(/[.\s]+$/, '');
  return value ? `${value[0].toUpperCase()}${value.slice(1)}.` : '';
};

/** What's new: the selected release's page, in a new tab. @param {{ url: string, tag: string }} props */
export function WhatsNew({ url, tag }) {
  const s = useCanvasStyles();
  return <Link inline href={url} target="_blank" rel="noopener noreferrer" className={s.aboutLink}
    aria-label={`What's new in ${tag} (opens in a new tab)`} data-whats-new>
    What&apos;s new<Open16Regular className={s.updateLinkIcon} aria-hidden="true" />
  </Link>;
}

/**
 * The temporary folders this session kept (072): when Dude cannot confirm that
 * a process an update started has stopped, or cannot remove that update's
 * folder, the server keeps the folder and lists it, with why, for the rest of
 * the session, also after Cancel or a replacement has closed that update. One
 * warning names each folder and its reason, in About's Updates section and
 * under the Needs you title, so it is shown wherever the update was started.
 * The words only disclose: nothing is removed or repeated on its own.
 * @param {{ kept: { root: string, reason: string }[] }} props
 */
export function KeptFolders({ kept }) {
  const s = useCanvasStyles();
  const one = kept.length === 1;
  return <MessageBar intent="warning" layout="multiline" politeness="polite" className={mergeClasses(s.notice, s.narrowBar)}
    data-update-kept={kept.length}>
    <MessageBarBody>
      <MessageBarTitle>{one ? 'Temporary folder kept' : `${kept.length} temporary folders kept`}</MessageBarTitle>
      <div className={s.tight}>
        <span>{one ? "Dude couldn't confirm that an update it started is done with this folder, so it left the folder in place:"
          : "Dude couldn't confirm that the updates it started are done with these folders, so it left them in place:"}</span>
        <ul className={mergeClasses(s.pathList, s.updatePaths, s.updateKept)}>
          {kept.map(entry => <li key={entry.root}><code className={s.code}>{entry.root}</code><span>{entry.reason}</span></li>)}
        </ul>
        <span>{one ? "Dude won't remove it or repeat the update on its own." : "Dude won't remove them or repeat an update on its own."}</span>
      </div>
    </MessageBarBody>
  </MessageBar>;
}

/** A polite announcement that repeats even when its words do. */
function useAnnouncement() {
  const [words, setWords] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [words, next => {
    clearTimeout(timer.current);
    setWords('');
    timer.current = setTimeout(() => setWords(next), 30);
  }];
}

/**
 * The Updates status line: one sentence, a detail with this session's check
 * time, and the actions it offers. Every part comes from the update state: the
 * recorded channel, this session's check, and whether one is running.
 */
function updateModel(updates, updatesError, choice) {
  if (!updates) {
    return updatesError ? { tone: 'warning', text: 'Update status is unavailable in this Canvas.' } : { spinner: true, text: 'Reading…' };
  }
  const { installation, check, checking } = updates;
  if (installation.channel === 'unavailable') {
    return { tone: 'warning', text: "Installation information is unavailable, so Dude can't check for updates." };
  }
  if (installation.channel === 'pinned') return { text: `Pinned to ${installation.sourceRef}, so Dude doesn't check for newer releases.` };
  if (installation.channel === 'development') return { text: "Release checks don't apply to development installs." };
  if (checking) return { spinner: true, text: 'Checking for updates...', check: true };
  if (!check) {
    return { text: choice === false ? 'Automatic checks are off.' : 'Not checked in this session.',
      detail: 'Use Check for updates to check now.', check: true };
  }
  const at = { iso: check.checkedAt, time: checkedTime(check.checkedAt) };
  if (check.status === 'update_available') {
    return { tone: 'available', text: `Dude ${check.availableRef} is available.`, link: releasePage(check.releaseUrl),
      tag: check.availableRef, at, update: updates.gate === 'open', check: true };
  }
  if (check.status === 'up_to_date') return { tone: 'current', text: 'Dude is up to date.', at, check: true };
  if (check.status === 'no_stable_releases') return { text: 'No stable releases found.', at, check: true };
  return { tone: 'warning', text: "Couldn't check for updates.", reason: sentence(check.message), at, tried: true, check: true };
}

const UPDATE_SWITCH = 'Check for updates when a session starts';
const UPDATE_HINT = 'Dude looks for a newer release once when each session starts. Applies to all your projects on this computer.';
const UPDATE_PENDING = { saving: 'Saving...', checking: 'Checking whether it was saved...', reading: 'Reading the saved choice...' };
const RETRY_FIRST = 'Use Retry before you change the switch.';
/**
 * The switch's one bar. A first read that fails says the session-start check
 * did not run only while this session has no check result.
 */
function updateCheckMessage(message, choice, checked) {
  return {
    'save-failed': { intent: 'error', title: 'Not saved', text: `Canvas couldn't save your choice on this computer. ${UPDATE_SWITCH} is still ${onOff(choice)}. Use the switch to try again.` },
    'not-saved': { intent: 'error', title: 'Not saved', text: `The save didn't finish. Canvas read the saved choice again: ${UPDATE_SWITCH} is still ${onOff(choice)}. Use the switch to try again.` },
    'read-failed': { intent: 'warning', title: 'Saved choice not read', retry: true, text: checked
      ? `Canvas couldn't read your update-check choice on this computer. Nothing was changed. ${RETRY_FIRST}`
      : `Canvas couldn't read your update-check choice on this computer, so Dude didn't check for updates when this session started. Nothing was changed. ${RETRY_FIRST}` },
    'read-failed-later': { intent: 'warning', title: 'Saved choice not read', retry: true, text: `Canvas couldn't read your update-check choice just now, so it keeps the last choice it confirmed: ${onOff(choice)}. Nothing was changed. ${RETRY_FIRST}` },
  }[message] ?? null;
}

/**
 * About's Updates section (072): the status line, Check for updates and
 * Update to the available release where the installation is eligible, any
 * temporary folders this session kept, and the saved session-start switch.
 * Check for updates works with the switch off, and saving the switch checks
 * nothing. Update opens the one update dialog.
 */
function Updates({ updates, updatesError, onAction, onUpdate, shown }) {
  const s = useCanvasStyles(), id = useId();
  const choice = useUpdateCheckSetting();
  const toggle = useRef(null), focusRequest = useRef(choice.focusSwitch);
  const [said, say] = useAnnouncement();
  const model = updateModel(updates, updatesError, choice.updateCheck);
  const checking = Boolean(updates?.checking);
  const wasChecking = useRef(checking);
  // A check that finishes while About is shown says what it found.
  useEffect(() => {
    if (wasChecking.current && !checking) say(model.text);
    wasChecking.current = checking;
  });
  // A successful Retry moves focus to the switch it confirmed.
  useEffect(() => {
    if (choice.focusSwitch === focusRequest.current) return;
    focusRequest.current = choice.focusSwitch;
    if (shown && choice.focusKey === 'checkForUpdatesOnSessionStart') toggle.current?.focus();
  }, [choice.focusSwitch, choice.focusKey, shown]);
  const check = async () => {
    if (checking) return;
    say('Checking for updates.');
    const answer = await onAction({ op: 'check' });
    if (!answer.ok) say("Couldn't start a check for updates. Nothing changed.");
  };
  const unknown = choice.updateCheck === null;
  const pendingText = choice.pending && choice.pendingKey === 'checkForUpdatesOnSessionStart' ? UPDATE_PENDING[choice.pending]
    : unknown && choice.readable ? UPDATE_PENDING.reading : null;
  const message = updateCheckMessage(choice.updateMessage, Boolean(choice.updateCheck),
    Boolean(updates?.check || updates?.checking));
  const Icon = model.tone === 'current' ? CheckmarkCircle20Filled : model.tone === 'warning' ? Warning20Filled : Info20Filled;
  return <section className={s.aboutUpdates} aria-labelledby={`${id}-updates`} data-about-updates>
    <h3 id={`${id}-updates`} className={s.subheading} tabIndex={-1}>Updates</h3>
    <div className={s.updateStatus} data-update-status={model.tone ?? (model.spinner ? 'busy' : 'info')}>
      <span className={mergeClasses(s.updateStatusIcon, model.tone === 'available' && s.updateStatusAvailable,
        model.tone === 'current' && s.updateStatusCurrent, model.tone === 'warning' && s.updateStatusWarning)} aria-hidden="true">
        {model.spinner ? <Spinner size="extra-tiny" /> : <Icon />}
      </span>
      <div className={s.updateStatusText}>
        <p data-update-line>{model.text}{model.link && <> <WhatsNew url={model.link} tag={model.tag} /></>}</p>
        {(model.detail || model.at) && <p className={s.eyebrow} data-update-detail>{model.detail ?? <>
          {model.reason && `${model.reason} `}{model.tried ? 'Tried' : 'Checked'} at <time dateTime={model.at.iso}>{model.at.time}</time>.
        </>}</p>}
      </div>
    </div>
    {(model.update || model.check) && <div className={mergeClasses(s.actions, s.updateActions)} data-update-actions>
      {model.update && <Button appearance="primary" aria-haspopup="dialog" data-update-open
        onClick={event => onUpdate(event.currentTarget)}>Update to {model.tag}</Button>}
      {model.check && <Button disabledFocusable={checking} data-update-check onClick={() => void check()}>Check for updates</Button>}
    </div>}
    {updates?.kept?.length > 0 && <KeptFolders kept={updates.kept} />}
    <Field hint={UPDATE_HINT}>
      <Switch ref={toggle} checked={Boolean(choice.updateCheck)} label={UPDATE_SWITCH} className={s.followSwitch}
        disabledFocusable={Boolean(choice.pending) || !choice.readable || unknown}
        onChange={() => void toggleUpdateCheck()} data-update-switch />
    </Field>
    {pendingText && <Spinner size="extra-tiny" label={pendingText} className={s.appearancePending}
      data-update-pending={choice.pending ?? 'reading'} />}
    {message && <MessageBar intent={message.intent} layout="multiline" className={mergeClasses(s.notice, s.narrowBar)}
      data-update-message={choice.updateMessage}>
      <MessageBarBody>
        <MessageBarTitle>{message.title}</MessageBarTitle>
        <div>{message.text}</div>
      </MessageBarBody>
      {message.retry && <MessageBarActions className={s.narrowBarActions}>
        <Button appearance="primary" size="medium" disabledFocusable={Boolean(choice.pending)} data-update-retry
          onClick={() => void retryPreferenceRead('checkForUpdatesOnSessionStart')}>Retry</Button>
      </MessageBarActions>}
    </MessageBar>}
    <p className={s.visuallyHidden} role="status" aria-live="polite" aria-atomic="true" data-update-said>{said}</p>
    <p className={s.visuallyHidden} role="status" aria-live="polite" aria-atomic="true" data-update-switch-status>{choice.updateStatus}</p>
    <p className={s.visuallyHidden} role="alert" aria-atomic="true" data-update-switch-alert>{choice.updateAlert}</p>
  </section>;
}

function RecordedValue({ label, text, reading }) {
  const s = useCanvasStyles();
  // The label, not the text-less ring, sets the value's baseline, so a reading
  // row keeps the same height as a recorded one.
  return <div className={s.aboutRow}><dt>{label}</dt>
    <dd className={!reading && !text ? s.aboutUnavailable : undefined}>
      {reading ? <Spinner size="extra-tiny" label={{ children: 'Reading…', className: s.aboutReadingLabel }}
        className={s.aboutReading} /> : text || 'Unavailable'}
    </dd></div>;
}

// Mounted once per About entry: it reads fresh, starts from Reading with no
// earlier values, and aborts on exit so a late result has nowhere to land.
function AboutFacts({ readAbout, onRead, updates }) {
  const s = useCanvasStyles();
  const [read, setRead] = useState(READING);
  useEffect(() => {
    const controller = new AbortController();
    readAbout({ signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      const record = installationRecord(value);
      setRead(record ? { state: 'current', record } : UNAVAILABLE);
    }, error => {
      if (controller.signal.aborted) return;
      // The shared helper codes every transport and provider failure. Anything
      // else is a defect to surface, not an unavailable installation record.
      if (!error?.code) throw error;
      setRead(UNAVAILABLE);
    });
    return () => controller.abort();
  }, [readAbout]);
  useEffect(() => { onRead?.(read); }, [read, onRead]);
  // Each entry reads the saved choices again, as Appearance does.
  useEffect(() => { void rereadPreference(); }, []);
  const reading = read.state === 'reading';
  const record = read.state === 'current' ? read.record : null;
  return <div className={s.aboutBody}>
    <h2 className={s.aboutIdentity}>Dude</h2>
    <dl className={s.aboutFacts} aria-busy={reading} data-about-facts>
      <RecordedValue label="Dude version" reading={reading}
        text={record?.installedRef ? versionText(record.installedRef, record.baseRelease) : null} />
      <div className={s.aboutRow}><dt>Author</dt><dd>Enrique Gonzalez</dd></div>
      <div className={s.aboutRow}><dt>Repository</dt><dd>
        <Link inline href={REPOSITORY} target="_blank" rel="noopener noreferrer" className={s.aboutLink}
          aria-label={`${REPOSITORY} (opens in a new tab)`} data-about-repository>
          https://<wbr />github.com/<wbr /><span className={s.nowrap}>E-G-C/dude<Open16Regular
            className={s.aboutLinkIcon} aria-hidden="true" /></span>
        </Link>
      </dd></div>
      <RecordedValue label="Update channel" reading={reading}
        text={record?.sourceRef ? channelText(record.sourceRef) : null} />
    </dl>
    <p className={mergeClasses(s.eyebrow, s.aboutNote)} data-about-note>
      {read.state === 'unavailable' ? UNAVAILABLE_NOTE : NOTE}
    </p>
    <p className={s.visuallyHidden} role="status" aria-live="polite">
      {reading ? 'Reading recorded installation metadata.'
        : read.state === 'unavailable' ? 'Recorded installation metadata is unavailable.' : ''}
    </p>
    <Updates {...updates} shown />
  </div>;
}

/**
 * The Settings About section panel. It stays in the tree for its tab, but only
 * a shown panel reads. It is a focus stop only while it has something to
 * scroll, so keyboard users can reach every row at any reflow. `updates` is
 * the update state with its action and the dialog opener (072); `onRead`
 * receives each entry's installation read for the footer.
 */
export function AboutPanel({ id, labelledBy, shown, readAbout, onRead, updates }) {
  const s = useCanvasStyles(), panel = useRef(null);
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!shown) return;
    const measure = () => setScrolls(node.scrollHeight > node.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, [shown]);
  return <div ref={panel} role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={!shown}
    tabIndex={shown && scrolls ? 0 : undefined} className={s.aboutPanel} data-about-panel>
    {shown && <AboutFacts readAbout={readAbout} onRead={onRead} updates={updates} />}
  </div>;
}

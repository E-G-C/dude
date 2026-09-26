import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Spinner } from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';

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

// Exactly { installedRef, sourceRef }, each a usable ref or null. Any other
// shape is an unreadable result, never a partial record.
function installationRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('installedRef') || !keys.includes('sourceRef')) return null;
  return keys.every(key => value[key] === null || usableRef(value[key])) ? value : null;
}

// Classify only the recorded value: no tag lookup, remote release, or claim
// about installed bytes. The version reads installedRef; the channel sourceRef.
const versionText = ref => RELEASE.test(ref) ? ref : ref === 'main' ? 'Development (main)' : `Recorded ref (${ref})`;
const channelText = ref => RELEASE.test(ref) ? `Pinned release (${ref})` : ref === 'main' ? 'Development (main)'
  : ref === 'latest' ? 'Stable releases (latest)' : `Recorded ref (${ref})`;

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
function AboutFacts({ readAbout }) {
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
  const reading = read.state === 'reading';
  const record = read.state === 'current' ? read.record : null;
  return <div className={s.aboutBody}>
    <h2 className={s.aboutIdentity}>Dude</h2>
    <dl className={s.aboutFacts} aria-busy={reading} data-about-facts>
      <RecordedValue label="Dude version" reading={reading}
        text={record?.installedRef ? versionText(record.installedRef) : null} />
      <div className={s.aboutRow}><dt>Author</dt><dd>Enrique Gonzalez</dd></div>
      <div className={s.aboutRow}><dt>Repository</dt><dd>
        <Link inline href={REPOSITORY} target="_blank" rel="noopener noreferrer" className={s.aboutLink}
          aria-label={`${REPOSITORY} (opens in a new tab)`} data-about-repository>
          https://<wbr />github.com/<wbr /><span className={s.nowrap}>E-G-C/dude<Open16Regular
            className={s.aboutLinkIcon} aria-hidden="true" /></span>
        </Link>
      </dd></div>
      <RecordedValue label="Recorded channel/ref" reading={reading}
        text={record?.sourceRef ? channelText(record.sourceRef) : null} />
    </dl>
    <p className={mergeClasses(s.eyebrow, s.aboutNote)} data-about-note>
      {read.state === 'unavailable' ? UNAVAILABLE_NOTE : NOTE}
    </p>
    <p className={s.visuallyHidden} role="status" aria-live="polite">
      {reading ? 'Reading recorded installation metadata.'
        : read.state === 'unavailable' ? 'Recorded installation metadata is unavailable.' : ''}
    </p>
  </div>;
}

/**
 * The Settings About section panel. It stays in the tree for its tab, but only
 * a shown panel reads. It is a focus stop only while it has something to
 * scroll, so keyboard users can reach every row at any reflow.
 */
export function AboutPanel({ id, labelledBy, shown, readAbout }) {
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
    {shown && <AboutFacts readAbout={readAbout} />}
  </div>;
}

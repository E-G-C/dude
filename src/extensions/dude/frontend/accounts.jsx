import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { AnnounceProvider, Button, Link, MessageBar, MessageBarBody, MessageBarTitle, Spinner } from '@fluentui/react-components';
import { CheckmarkCircleFilled, Open16Regular } from '@fluentui/react-icons';
import { checkedTime } from './about.jsx';
import { mergeClasses, useCanvasStyles } from './styles.js';

/*
 * Settings > Accounts (089): the session's optional GitHub sign-in, in the
 * approved round-4 words. It explains before Sign in starts anything, shows
 * GitHub's own code with its expiry as a time of day, names the account in
 * use, and says how to stop. Its words depend only on the sign-in session,
 * never on source rows or pack refusals, which stay on the pack surfaces.
 * GitHub's two pages are fixed addresses, never ones the page was sent.
 */
const GITHUB_DEVICE = 'https://github.com/login/device';
const GITHUB_APPS = 'https://github.com/settings/applications';
const SIGN_IN_WHY = [
  "Optional. Without sign-in, pack reads count against GitHub's anonymous limit: 60 requests an hour, shared with everything else on your network address. Sign in to use your own GitHub allowance instead.",
  "Dude asks only for read-only access to public information, so it can't read private repositories. You approve on github.com with a short code; Dude never sees your password. The access lasts for this session only and isn't saved.",
];
const STILL_OUT = "You're still signed out, and pack reads stay anonymous.";
/**
 * One bar for each closed outcome the session reports while signed out (see
 * github-session.mjs), a title and words, never color alone. Each leaves pack
 * reads anonymous and offers Sign in again. `unavailable` also covers a Dude
 * with no Client ID, which asks GitHub nothing, so its words claim no answer
 * from GitHub; `failed` is any other answer that could not sign in.
 */
const SIGN_IN_OUTCOMES = {
  cancelled: { intent: 'info', title: 'Sign-in cancelled', text: () => `${STILL_OUT} If you approve the code on GitHub now, Dude won't use it.` },
  denied: { intent: 'info', title: 'Sign-in declined on GitHub', text: () => `The request was declined on GitHub. ${STILL_OUT}` },
  expired: { intent: 'warning', title: 'Code expired', text: () => `The code expired before it was approved. ${STILL_OUT} Choose Sign in for a new code.` },
  unreachable: { intent: 'error', title: "Couldn't reach GitHub",
    text: () => `Sign-in didn't finish because Dude couldn't connect to GitHub. ${STILL_OUT} Check your connection, then choose Sign in to try again.` },
  unavailable: { intent: 'warning', title: 'Sign-in unavailable',
    text: () => "Dude's OAuth App registration isn't set up for device sign-in, so sign-in can't start. Dude's maintainers need to set it up. Pack reads stay anonymous, and local folders work as before." },
  failed: { intent: 'error', title: "Sign-in didn't finish",
    text: () => `GitHub's answer couldn't be used, so Dude kept no access. ${STILL_OUT} Choose Sign in to try again.` },
  signed_out: { intent: 'info', title: 'Signed out', text: () => <>Dude forgot the access, and pack reads are anonymous again. GitHub keeps the
    authorization until you revoke it in GitHub&apos;s Applications settings at <GitHubLink url={GITHUB_APPS} data-github-revoke />, under
    Authorized OAuth Apps.</> },
  rejected: { intent: 'warning', title: 'Signed out: GitHub rejected the access',
    text: () => 'GitHub no longer accepts the access Dude was using, for example because it was revoked on GitHub. Dude forgot it, so pack reads are anonymous again.' },
};
// What the polite status, or the alert, says as each outcome arrives.
const SIGN_IN_SAID = {
  cancelled: { text: "Sign-in cancelled. You're still signed out." },
  denied: { text: "Sign-in declined on GitHub. You're still signed out." },
  expired: { text: "Code expired. You're still signed out.", alert: true },
  unreachable: { text: "Couldn't reach GitHub. You're still signed out.", alert: true },
  unavailable: { text: "Sign-in unavailable. You're still signed out.", alert: true },
  failed: { text: "Sign-in didn't finish. You're still signed out.", alert: true },
  signed_out: { text: 'Signed out. Pack reads are anonymous again.' },
  rejected: { text: 'Signed out: GitHub rejected the access. Pack reads are anonymous again.', alert: true },
};
/** What a sign-in state shows, as one comparable value. */
const sessionKey = view => [view.state, view.outcome, view.userCode, view.login].join('|');
// The outcome bar's words are announced from the shell (see githubSessionSaid), not again as it mounts.
const SILENT = { announce: () => {} };

/**
 * What a change of the session's GitHub sign-in says, or null. The shell
 * announces it outside Settings > Accounts, so a result is heard from any view.
 * A tab's first read says nothing; this tab's own action says its result even
 * when nothing changed, as Sign in does again while sign-in is unavailable.
 * @param {any} before @param {any} after @param {boolean} acted
 * @returns {{ text: string, alert?: boolean } | null}
 */
export function githubSessionSaid(before, after, acted) {
  if (!before || !after || (!acted && sessionKey(before) === sessionKey(after))) return null;
  if (after.state === 'requesting') return { text: 'Getting a code from GitHub.' };
  if (after.state === 'waiting') {
    return { text: `Your code is ${[...after.userCode].join(' ')}. Go to github.com/login/device and enter it to approve. Waiting for your approval.` };
  }
  if (after.state === 'signed_in') return { text: `Signed in as @${after.login}.` };
  return SIGN_IN_SAID[after.outcome] ?? null;
}

/**
 * A fixed GitHub page in a new tab, as About's repository link: its address is
 * the visible, selectable text. Each line of it is a target at least 24px tall
 * while the focus ring stays on the text, and pressed keeps the hover color
 * (see `paddedLink` in styles.js).
 */
function GitHubLink({ url, ...rest }) {
  const s = useCanvasStyles();
  const parts = url.replace(/^https:\/\//, '').split(/(?<=\/)/), last = parts.pop();
  return <Link inline href={url} target="_blank" rel="noopener noreferrer" className={mergeClasses(s.aboutLink, s.paddedLink)}
    aria-label={`${url} (opens in a new tab)`} {...rest}>
    <span className={s.paddedLinkTarget}>https://{parts.map((part, index) => <React.Fragment key={index}><wbr />{part}</React.Fragment>)}<wbr />
      <span className={s.githubLinkTail}>{last}<Open16Regular className={s.aboutLinkIcon} aria-hidden="true" /></span></span>
  </Link>;
}

function Progress({ children }) {
  const s = useCanvasStyles();
  return <div className={s.githubProgress} data-github-progress>
    <Spinner size="extra-tiny" className={s.githubSpinner} aria-hidden="true" /><span>{children}</span></div>;
}

/**
 * The one GitHub sign-in of the session. Every panel shows the sign-in the
 * server holds, from the page's safe state alone. Its one button is Sign in,
 * Cancel, or Sign out, and stays the same element, so focus stays on it as the
 * phase changes. A result that arrives while focus is in the section moves
 * focus to that result: the outcome bar, or the account once signed in; Cancel
 * keeps it on Sign in. A result never moves focus from anywhere else: not after
 * Tab or a click elsewhere, even on words that take no focus, and not while
 * Accounts is hidden. The one exception keeps focus from being lost: when the
 * focused control itself goes with the change, such as the verification link
 * once GitHub approves, its result takes focus. Nothing here reads packs.
 */
function GitHubSignIn({ view, acted, onAction }) {
  const s = useCanvasStyles(), ids = useId();
  const section = useRef(null), action = useRef(null), bar = useRef(null), account = useRef(null);
  // Focus is in the section, or was until rendering removed the control that had it.
  const inside = useRef(false);
  const seen = useRef({ view, acted });
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = { view, acted };
    if (before.acted === acted && sessionKey(before.view) === sessionKey(view)) return;
    const at = document.activeElement;
    if (!section.current?.contains(at) && !(inside.current && (!at || at === document.body))) return;
    const result = view.state === 'signed_in' ? account.current
      : view.state === 'signed_out' && view.outcome && view.outcome !== 'cancelled' ? bar.current : action.current;
    if (result && result !== document.activeElement) result.focus();
  }, [view, acted]);
  const outcome = view.state === 'signed_out' ? SIGN_IN_OUTCOMES[view.outcome] : null;
  const [label, op] = view.state === 'signed_out' ? ['Sign in', 'start'] : view.state === 'signed_in' ? ['Sign out', 'sign-out'] : ['Cancel', 'cancel'];
  const why = SIGN_IN_WHY.map(text => <p key={text}>{text}</p>);
  return <section ref={section} className={s.githubSignIn} aria-labelledby={`${ids}-title`} data-github-signin={view.state}
    onFocus={() => { inside.current = true; }}
    onBlur={event => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      // Focus went to another control outside: the person moved it.
      if (event.relatedTarget) { inside.current = false; return; }
      // Focus went nowhere: a click on words that take no focus, leaving the
      // page, or a blur call, unless rendering removed the focused control,
      // which is gone from the page once this task's rendering is over.
      const node = event.target;
      queueMicrotask(() => { if (node.isConnected) inside.current = false; });
    }}>
    <h2 id={`${ids}-title`} className={s.githubSignInTitle}>GitHub sign-in</h2>
    {outcome && <AnnounceProvider value={SILENT}>
      <MessageBar ref={bar} tabIndex={-1} intent={outcome.intent} layout="multiline" className={mergeClasses(s.notice, s.narrowBar, s.githubOutcome)}
        aria-labelledby={`${ids}-outcome`} aria-describedby={`${ids}-outcome-text`} data-github-outcome={view.outcome}>
        <MessageBarBody>
          <MessageBarTitle id={`${ids}-outcome`}>{outcome.title}</MessageBarTitle>
          <div id={`${ids}-outcome-text`}>{outcome.text()}</div>
        </MessageBarBody>
      </MessageBar>
    </AnnounceProvider>}
    <div className={s.githubSignInBody} data-github-body>
      {view.state === 'signed_out' && why}
      {view.state === 'requesting' && <>{why}<Progress>Getting a code from GitHub...</Progress></>}
      {view.state === 'waiting' && <>
        <p>Go to <GitHubLink url={GITHUB_DEVICE} data-github-device /> and enter this code:</p>
        <p className={s.githubCode} data-github-code>{view.userCode}</p>
        <p>It expires at <time dateTime={view.expiresAt} data-github-expiry>{checkedTime(view.expiresAt)}</time>. Approving gives Dude
          read-only access to public information.</p>
        <Progress>Waiting for your approval on GitHub. This updates on its own a few seconds after you approve.</Progress>
      </>}
      {view.state === 'signed_in' && <>
        <p ref={account} tabIndex={-1} className={s.githubAccount} data-github-account>
          <CheckmarkCircleFilled className={s.githubAccountGlyph} aria-hidden="true" /><span>Signed in as @{view.login}</span></p>
        <p>Pack reads from GitHub use this account&apos;s allowance until this session ends.</p>
        <p>Sign out makes Dude forget this access. GitHub keeps the authorization until you revoke it in GitHub&apos;s Applications
          settings at <GitHubLink url={GITHUB_APPS} data-github-revoke />, under Authorized OAuth Apps.</p>
      </>}
    </div>
    <div className={s.githubSignInActions}>
      <Button ref={action} aria-label={op === 'cancel' ? 'Cancel sign-in' : undefined} data-github-action={op}
        onClick={() => onAction(op)}>{label}</Button>
    </div>
  </section>;
}

/**
 * The Accounts section panel: About's scrolling sheet, widened by the sign-in
 * box's padding and border so its words keep the 76ch measure. It renders only
 * while shown, from the session state the hook already holds, so opening it
 * reads nothing and starts nothing. Until this tab has read the session's
 * sign-in once, it says so instead of guessing a state. It is a focus stop only
 * while it has something to scroll.
 */
export function AccountsPanel({ id, labelledBy, shown, data }) {
  const s = useCanvasStyles(), ids = useId(), panel = useRef(null);
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
  const view = data.githubSession;
  return <div ref={panel} role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={!shown}
    tabIndex={shown && scrolls ? 0 : undefined} className={s.aboutPanel} data-accounts-panel>
    {shown && <div className={mergeClasses(s.aboutBody, s.accountsBody)}>
      {view ? <GitHubSignIn view={view} acted={data.githubActed} onAction={data.githubAction} />
        : <section className={s.githubSignIn} aria-labelledby={`${ids}-title`} aria-busy="true" data-github-signin="unknown">
          <h2 id={`${ids}-title`} className={s.githubSignInTitle}>GitHub sign-in</h2>
          <Spinner size="extra-tiny" label="Reading…" className={s.appearancePending} />
        </section>}
    </div>}
  </div>;
}

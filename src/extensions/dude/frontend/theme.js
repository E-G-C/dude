import { useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { webDarkTheme, webLightTheme } from '@fluentui/react-components';

const DARK_APPEARANCE_QUERY = '(prefers-color-scheme: dark)';

function accessibleInteractiveTheme(theme) {
  return Object.freeze({
    ...theme,
    colorNeutralStroke1: theme.colorNeutralStrokeAccessible,
    colorNeutralStroke1Hover: theme.colorNeutralStrokeAccessibleHover,
    colorNeutralStroke1Pressed: theme.colorNeutralStrokeAccessiblePressed,
    colorNeutralStroke1Selected: theme.colorNeutralStrokeAccessibleSelected,
  });
}

export const lightTheme = accessibleInteractiveTheme(webLightTheme);
export const darkTheme = accessibleInteractiveTheme(webDarkTheme);

/* ------------------------------------------------------------------ The saved choices */

// The Canvas preference document holds two choices for this user on this
// computer: whether Canvas follows the GitHub app theme (085), and whether Dude
// checks for updates when a session starts (072). The server reads the first
// while serving the page, so the first render already uses it; Canvas reads the
// whole document once it starts. Both live here, outside every workspace-keyed
// component, so neither a root change nor Settings leaving and returning resets
// them. Each confirmed value is always the last one a read or save confirmed,
// never an unconfirmed write. A switch saves only its own choice, and the
// server keeps the other. While the document cannot be read, neither switch
// saves, since a save could not keep the other choice: both wait until a read
// succeeds, through Retry or a later reread.
const PREFERENCE_ROUTE = '/api/canvas-preferences';
const READ_ERROR = 'preference_unreadable';
const FOLLOW = 'followAppTheme', UPDATE_CHECK = 'checkForUpdatesOnSessionStart';
const DOCUMENT_KEYS = [UPDATE_CHECK, FOLLOW].join();
const UNREAD = Object.freeze(['read-failed', 'read-failed-later']);
// Each switch: its name, the confirmed value it shows, and the store keys of its own words.
const SWITCHES = Object.freeze({
  [FOLLOW]: Object.freeze({ name: 'Follow GitHub app theme', value: 'confirmed', message: 'message', status: 'status', alert: 'alert' }),
  [UPDATE_CHECK]: Object.freeze({ name: 'Check for updates when a session starts', value: 'updateCheck',
    message: 'updateMessage', status: 'updateStatus', alert: 'updateAlert' }),
});
const onOff = value => (value ? 'on' : 'off');

function bootstrapChoice() {
  try {
    const value = JSON.parse(document.getElementById('dude-canvas-bootstrap')?.textContent ?? 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).sort().join() === 'followAppTheme,preferenceError'
      && typeof value.followAppTheme === 'boolean' && [null, READ_ERROR].includes(value.preferenceError)) return value;
  } catch { /* An unreadable slot is a failed read, below. */ }
  return { followAppTheme: false, preferenceError: READ_ERROR };
}

// `known` says a read or save confirmed the appearance choice; `updateCheck` is
// null until one confirms that choice. `pending` is the read or save in flight,
// and `pendingKey` the switch it belongs to: its save, or Retry in its panel.
let preference = (() => {
  const { followAppTheme, preferenceError } = bootstrapChoice();
  const unread = preferenceError !== null;
  return Object.freeze({
    confirmed: !unread && followAppTheme, known: !unread, updateCheck: null, readable: !unread,
    pending: null, pendingKey: null, message: unread ? 'read-failed' : null, updateMessage: unread ? 'read-failed' : null,
    status: '', alert: '', updateStatus: '', updateAlert: '', focusSwitch: 0, focusKey: null,
  });
})();
const preferenceListeners = new Set();
// Each read or save owns the answer until a later one starts.
let preferenceTurn = 0;

function setPreference(change) {
  preference = Object.freeze({ ...preference, ...change });
  preferenceListeners.forEach(listener => listener());
}
function subscribePreference(listener) {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}
const getPreference = () => preference;

/** One request to the fixed preference route: a read, or a save of exactly one choice. */
async function preferenceRequest(patch) {
  const response = await fetch(PREFERENCE_ROUTE, patch === undefined ? { cache: 'no-store' } : {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  let value = null;
  try { value = await response.json(); } catch { /* Answered without a readable body. */ }
  return { status: response.status, value };
}
/** The complete saved document of a 200 answer, or null: exactly both choices, each a boolean. */
const confirmedDocument = answer => {
  const value = answer?.status === 200 ? answer.value : null;
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === DOCUMENT_KEYS
    && typeof value[FOLLOW] === 'boolean' && typeof value[UPDATE_CHECK] === 'boolean' ? value : null;
};
async function readDocument() {
  try { return confirmedDocument(await preferenceRequest()); } catch { return null; }
}
/** What a confirmed document establishes: both choices, and a readable document. */
const confirmedFrom = saved => ({ confirmed: saved[FOLLOW], updateCheck: saved[UPDATE_CHECK], known: true, readable: true });
/** An unread document: no saving, and each switch's warning, the first-open kind until its choice was confirmed. */
const unreadState = () => ({ readable: false, message: preference.known ? 'read-failed-later' : 'read-failed',
  updateMessage: preference.updateCheck === null ? 'read-failed' : 'read-failed-later' });

/**
 * One switch action saves the opposite of that switch's confirmed choice. The
 * look or the choice changes only after the save is confirmed. A refused or
 * failed save keeps the confirmed choice; a lost answer is settled by reading
 * the choice again, never by sending the save again. While the document is
 * unread, nothing is sent.
 */
async function saveChoice(key) {
  const own = SWITCHES[key];
  if (preference.pending || !preference.readable || preference[own.value] === null) return;
  const turn = ++preferenceTurn, target = !preference[own.value];
  const settled = { pending: null, pendingKey: null };
  setPreference({ pending: 'saving', pendingKey: key, [own.message]: null, [own.status]: 'Saving.', [own.alert]: '' });
  let answer = null;
  try { answer = await preferenceRequest({ [key]: target }); } catch { /* The answer was lost. */ }
  if (turn !== preferenceTurn) return;
  const saved = confirmedDocument(answer);
  if (saved?.[key] === target) {
    setPreference({ ...confirmedFrom(saved), ...settled, [own.status]: `Saved. ${own.name} is ${onOff(target)}.` });
    return;
  }
  // The stored document cannot be read: nothing was saved, and neither switch saves until a read succeeds.
  if (answer?.status === 503 && answer.value?.error === READ_ERROR) {
    setPreference({ ...unreadState(), ...settled, [own.status]: '',
      [own.alert]: `Not saved. ${own.name} is still ${onOff(preference[own.value])}.` });
    return;
  }
  // The server answered that nothing was saved: a refusal, or a write it could not make.
  if (answer && (answer.status === 500 && answer.value?.error === 'preference_write_failed'
    || (answer.status >= 400 && answer.status < 500))) {
    setPreference({ ...settled, [own.message]: 'save-failed', [own.status]: '',
      [own.alert]: `Not saved. ${own.name} is still ${onOff(preference[own.value])}.` });
    return;
  }
  setPreference({ pending: 'checking', [own.status]: 'Checking whether it was saved.' });
  const reread = await readDocument();
  if (turn !== preferenceTurn) return;
  if (reread?.[key] === target) {
    setPreference({ ...confirmedFrom(reread), ...settled, [own.status]: `Saved. ${own.name} is ${onOff(target)}.` });
  } else if (!reread) {
    setPreference({ ...unreadState(), ...settled, [own.status]: '',
      [own.alert]: `Saved choice not read. Canvas keeps the last choice it confirmed: ${onOff(preference[own.value])}.` });
  } else {
    setPreference({ ...confirmedFrom(reread), ...settled, [own.message]: 'not-saved', [own.status]: '',
      [own.alert]: `Not saved. ${own.name} is still ${onOff(reread[key])}.` });
  }
}
export const toggleFollowAppTheme = () => saveChoice(FOLLOW);
export const toggleUpdateCheck = () => saveChoice(UPDATE_CHECK);

/** Retry repeats only the fixed preference read. Success moves focus to the switch whose Retry was used. */
export async function retryPreferenceRead(key = FOLLOW) {
  const own = SWITCHES[key];
  if (preference.pending) return;
  const turn = ++preferenceTurn;
  setPreference({ pending: 'reading', pendingKey: key, [own.status]: 'Reading the saved choice.', [own.alert]: '' });
  const saved = await readDocument();
  if (turn !== preferenceTurn) return;
  if (!saved) {
    setPreference({ ...unreadState(), pending: null, pendingKey: null, [own.status]: '',
      [own.alert]: 'Still not read. Nothing was changed.' });
    return;
  }
  setPreference({ ...confirmedFrom(saved), pending: null, pendingKey: null, message: null, updateMessage: null,
    [own.status]: `Read. ${own.name} is ${onOff(saved[key])}.`, focusSwitch: preference.focusSwitch + 1, focusKey: key });
}

/**
 * Starting Canvas, visible focus, and Appearance or About entry read the
 * document again, so a choice saved in another project is adopted here. A read
 * that fails keeps the confirmed choices and says so; one that finds the same
 * choices changes nothing.
 */
export async function rereadPreference() {
  if (preference.pending) return;
  const turn = ++preferenceTurn;
  const saved = await readDocument();
  if (turn !== preferenceTurn || preference.pending) return;
  if (!saved) {
    const unread = unreadState();
    if (preference.readable || preference.message !== unread.message || preference.updateMessage !== unread.updateMessage) {
      setPreference(unread);
    }
    return;
  }
  const change = {};
  for (const [key, own] of Object.entries(SWITCHES)) {
    const was = preference[own.value];
    if (saved[key] !== was || UNREAD.includes(preference[own.message])) change[own.message] = null;
    if (was !== null && saved[key] !== was) change[own.status] = `${own.name} is ${onOff(saved[key])}.`;
  }
  if (!Object.keys(change).length && saved[FOLLOW] === preference.confirmed && saved[UPDATE_CHECK] === preference.updateCheck
    && preference.known && preference.readable) return;
  setPreference({ ...confirmedFrom(saved), ...change });
}

/* ------------------------------------------------------------- The host appearance */

// The documented host contract, the only host values Canvas reads. Canvas
// never writes them, and reads no other host variable or style identifier.
const HOST = Object.freeze({
  background: '--background-color-default', border: '--border-color-default', text: '--text-color-default',
  muted: '--text-color-muted', accent: '--color-focus-outline', white: '--color-white',
  sans: '--font-sans', display: '--font-sans-display', mono: '--font-mono', semibold: '--font-weight-semibold',
  body: '--text-body-medium', leading: '--leading-body-medium', code: '--text-code-inline',
});
const TONE_ATTRIBUTES = Object.freeze(['data-theme-tone', 'data-color-mode']);
const WATCHED_ATTRIBUTES = Object.freeze([...TONE_ATTRIBUTES, 'data-theme-source', 'class', 'style']);

function documentedTone(attribute) {
  for (const node of [document.documentElement, document.body]) {
    const value = node?.getAttribute(attribute);
    if (value === 'light' || value === 'dark') return value;
  }
  return null;
}

/** The host tone and every documented value, as the document has them now. */
function readHost() {
  const deviceDark = window.matchMedia(DARK_APPEARANCE_QUERY).matches;
  const computed = getComputedStyle(document.body ?? document.documentElement);
  return {
    hostTone: documentedTone(TONE_ATTRIBUTES[0]) ?? documentedTone(TONE_ATTRIBUTES[1]) ?? (deviceDark ? 'dark' : 'light'),
    deviceDark,
    values: Object.fromEntries(Object.entries(HOST).map(([key, name]) => [key, computed.getPropertyValue(name).trim()])),
  };
}

let host = null, hostKey = '';
const hostListeners = new Set();
let stopWatching = null;

function refreshHost() {
  const next = readHost(), key = JSON.stringify(next);
  if (key === hostKey) return false;
  host = Object.freeze({ ...next, supplied: Object.values(next.values).some(Boolean) });
  hostKey = key;
  return true;
}
function getHost() {
  if (!host) refreshHost();
  return host;
}

/**
 * Watch the documented tone attributes, stylesheet changes in head, and the
 * device preference. Bursts coalesce into one comparison, and only a change in
 * a value Canvas reads notifies, so repeated unchanged mutations do nothing.
 */
function subscribeHost(listener) {
  hostListeners.add(listener);
  if (!stopWatching) {
    let scheduled = false;
    const check = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (refreshHost()) hostListeners.forEach(notify => notify());
      });
    };
    const observer = new MutationObserver(check);
    const attributes = { attributes: true, attributeFilter: [...WATCHED_ATTRIBUTES] };
    observer.observe(document.documentElement, attributes);
    if (document.body) observer.observe(document.body, attributes);
    if (document.head) observer.observe(document.head, { attributes: true, characterData: true, childList: true, subtree: true });
    const media = window.matchMedia(DARK_APPEARANCE_QUERY);
    media.addEventListener('change', check);
    stopWatching = () => { observer.disconnect(); media.removeEventListener('change', check); };
    check();
  }
  return () => {
    hostListeners.delete(listener);
    if (!hostListeners.size && stopWatching) { stopWatching(); stopWatching = null; }
  };
}

/* ------------------------------------------------------------- Following the app */

// WCAG 2.2 AA: 4.5:1 for text, 3:1 for essential boundaries and focus. The
// browser rounds mixed and composited colors, so each check keeps a hair spare.
const TEXT = 4.5, BOUNDARY = 3, SPARE = 0.02;
const BLACK = Object.freeze([0, 0, 0]), WHITE = Object.freeze([255, 255, 255]);
const channel = value => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = c => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const worst = (color, surfaces) => Math.min(...surfaces.map(surface => contrast(color, surface)));
const mix = (from, to, amount) => from.slice(0, 3).map((value, index) => value + (to[index] - value) * amount);
const rounded = color => color.slice(0, 3).map(value => Math.min(255, Math.max(0, Math.round(value))));
const over = (top, under) => (top[3] >= 1 ? top.slice(0, 3) : top.slice(0, 3).map((value, index) => value * top[3] + under[index] * (1 - top[3])));
const hex = color => `#${rounded(color).map(value => value.toString(16).padStart(2, '0')).join('')}`;
const round2 = value => Math.round(value * 100) / 100;

/**
 * Nothing when `color` already reaches `min` on every surface. Otherwise the
 * smallest step toward `toward`, or toward whichever of black and white the
 * surfaces favor, that reaches it: the replacement is computed from the
 * colors actually supplied, never taken from a named theme.
 */
function replacementFor(color, surfaces, min, toward = null) {
  const need = min + SPARE;
  if (worst(color, surfaces) >= need) return null;
  const extreme = worst(WHITE, surfaces) >= worst(BLACK, surfaces) ? WHITE : BLACK;
  for (const target of toward && worst(toward, surfaces) >= need ? [toward, extreme] : [extreme]) {
    for (let step = 1; step <= 100; step += 1) {
      const candidate = rounded(mix(color, target, step / 100));
      if (worst(candidate, surfaces) >= need) return candidate;
    }
  }
  return extreme;
}

/** Browser color resolution: any CSS color the document accepts, as sRGB [r, g, b, alpha]. */
function colorReader() {
  const probe = document.createElement('span');
  probe.hidden = true;
  const measure = document.createElement('div');
  measure.setAttribute('aria-hidden', 'true');
  measure.textContent = 'Ag';
  measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;inset-inline-start:-9999px;top:0';
  (document.body ?? document.documentElement).append(probe, measure);
  let paint = null;
  const alpha = value => (value === undefined ? 1 : value.endsWith('%') ? parseFloat(value) / 100 : Number(value));
  const unit = value => Math.min(255, Math.max(0, value));
  return {
    color(value) {
      if (!value || !CSS.supports('color', value)) return null;
      probe.style.color = '';
      probe.style.color = value;
      const text = getComputedStyle(probe).color;
      let match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
      if (match) return [+match[1], +match[2], +match[3], alpha(match[4])];
      match = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(text);
      if (match) return [unit(match[1] * 255), unit(match[2] * 255), unit(match[3] * 255), alpha(match[4])];
      // Other color spaces are painted once and read back in sRGB.
      paint ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      paint.clearRect(0, 0, 1, 1);
      paint.fillStyle = '#000';
      paint.fillStyle = text;
      paint.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    },
    /** A body text size in px, or null. Relative to this document, as text would use it. */
    fontSize(value) {
      if (!value || !CSS.supports('font-size', value)) return null;
      measure.style.fontSize = value;
      const px = parseFloat(getComputedStyle(measure).fontSize);
      measure.style.fontSize = '';
      return px > 0 ? px : null;
    },
    /** A line height measured at `size` px and returned as a length in px, or null. */
    lineHeight(value, size) {
      if (!value || !CSS.supports('line-height', value)) return null;
      measure.style.fontSize = `${size}px`;
      measure.style.lineHeight = value;
      const computed = getComputedStyle(measure).lineHeight;
      const px = computed.endsWith('px') ? parseFloat(computed) : measure.getBoundingClientRect().height;
      measure.style.lineHeight = '';
      return px > 0 ? px : null;
    },
    close() { probe.remove(); measure.remove(); },
  };
}

const SIZE_STEPS = Object.freeze(['Base100', 'Base200', 'Base300', 'Base400', 'Base500', 'Base600',
  'Hero700', 'Hero800', 'Hero900', 'Hero1000']);

/**
 * The host-adapted Fluent theme for the host tone. Each documented value maps
 * only onto its own Fluent roles: as is, as `var(<documented>, <each token's
 * Fluent value>)`; as a `color-mix()` of the supplied values a derived state
 * starts from; and as a computed color where a pairing with a supplied color
 * would miss its WCAG minimum against the surfaces the role actually sits on.
 * A role whose value is missing or unusable, or a derived state missing one
 * of its seeds, keeps each of its tokens' own Fluent values, so a host that
 * supplies only type changes no color, and one that supplies only colors
 * changes no type. Spacing, radii, strokes, motion, and component geometry
 * stay Fluent's.
 */
function followTheme({ hostTone, values }) {
  const base = hostTone === 'dark' ? darkTheme : lightTheme;
  const reader = colorReader();
  try {
    const mixes = CSS.supports('color', 'color-mix(in srgb, red, blue)');
    const own = token => over(reader.color(base[token]) ?? [0, 0, 0, 1], WHITE);
    // A role is the color one or more Fluent tokens take. A supplied role paints every one of its tokens with
    // its one color; any other leaves each token its own Fluent value. `color(token)` is what a token paints.
    const fluent = tokens => ({ tokens, supplied: false, css: token => base[token], color: own });
    const supplied = (tokens, color, css) => ({ tokens, supplied: true, css, color: () => color });
    const fixed = (tokens, color) => supplied(tokens, color, () => hex(color));
    const main = role => role.color(role.tokens[0]);
    /** A documented color, a reference with each token's Fluent value as its fallback. A translucent one is composited on `under` once. */
    const documented = (key, tokens, under = null) => {
      const color = reader.color(values[key]);
      if (!color || color[3] === 0) return fluent(tokens);
      if (color[3] >= 1) return supplied(tokens, color.slice(0, 3), token => `var(${HOST[key]}, ${base[token]})`);
      return under ? fixed(tokens, over(color, under)) : fluent(tokens);
    };
    /** A derived state: `percent` of `to` mixed into `from` when both are supplied, else each token's own Fluent state. */
    const mixed = (tokens, from, to, percent) => (mixes && from.supplied && to.supplied
      ? supplied(tokens, mix(main(from), main(to), percent / 100),
        token => `color-mix(in srgb, ${from.css(token)}, ${to.css(token)} ${percent}%)`)
      : fluent(tokens));
    /** Every color the roles paint, each marked with whether a supplied value set it. */
    const painted = (...roles) => roles.flatMap(role => role.tokens.map(token => ({ color: role.color(token), supplied: role.supplied })));
    /**
     * `role`, with a computed replacement wherever it misses `min` on `surfaces`. Only a pairing that
     * involves a supplied color is judged: two Fluent values keep the pairing Fluent designed, and a
     * Fluent token judged against a supplied surface is replaced on its own.
     */
    const enforce = (role, surfaces, min, toward = null) => {
      if (role.supplied) {
        const replacement = replacementFor(main(role), surfaces.map(surface => surface.color), min, toward);
        return replacement ? fixed(role.tokens, replacement) : role;
      }
      const against = surfaces.filter(surface => surface.supplied).map(surface => surface.color);
      if (!against.length) return role;
      const replaced = new Map(role.tokens.map(token => [token, replacementFor(role.color(token), against, min, toward)]));
      return { ...role, replaced: token => Boolean(replaced.get(token)),
        css: token => (replaced.get(token) ? hex(replaced.get(token)) : role.css(token)), color: token => replaced.get(token) ?? role.color(token) };
    };
    /** The first role that reaches `min` on every fill for each of its tokens. */
    const pairedOn = (fills, min, candidates) => candidates.find(role => role.tokens.every(token => worst(role.color(token), fills) >= min + SPARE));
    /** A supplied role's color for other tokens, keeping its reference and their own fallbacks. */
    const as = (tokens, role) => supplied(tokens, main(role), role.css);

    const page = documented('background', ['colorNeutralBackground1', 'colorNeutralBackground2', 'colorNeutralCardBackground']);
    const text = documented('text', ['colorNeutralForeground1', 'colorNeutralForeground1Hover', 'colorNeutralForeground1Pressed',
      'colorNeutralForeground1Selected', 'colorNeutralForeground2Hover', 'colorNeutralForeground2Pressed',
      'colorNeutralForeground2Selected', 'colorNeutralForeground3Hover', 'colorNeutralForeground3Pressed',
      'colorNeutralForeground3Selected'], main(page));
    const surface = (tokens, percent) => mixed(tokens, page, text, percent);
    const hover = surface(['colorNeutralBackground1Hover', 'colorNeutralBackground2Hover', 'colorSubtleBackgroundHover'], 6);
    const pressed = surface(['colorNeutralBackground1Pressed', 'colorNeutralBackground2Pressed', 'colorSubtleBackgroundPressed'], 10);
    const selected = surface(['colorNeutralBackground1Selected', 'colorNeutralBackground2Selected', 'colorSubtleBackgroundSelected'], 12);
    const inset3 = surface(['colorNeutralBackground3'], 4), inset4 = surface(['colorNeutralBackground4'], 6);
    const neutral = painted(page, hover, pressed, selected, inset3, inset4);
    const status = painted(fluent(['colorStatusSuccessBackground1', 'colorStatusWarningBackground1', 'colorStatusDangerBackground1']));

    const foreground = enforce(text, [...neutral, ...status], TEXT);
    const strong = main(foreground);
    const muted = enforce(documented('muted', ['colorNeutralForeground2', 'colorNeutralForeground3', 'colorNeutralForeground4'], main(page)),
      neutral, TEXT, strong);
    // Control borders take the muted text color, as Fluent pairs its accessible stroke with its muted text.
    const stroke = enforce(documented('muted', ['colorNeutralStroke1', 'colorNeutralStroke1Selected', 'colorNeutralStroke4',
      'colorNeutralStroke4Selected', 'colorNeutralStrokeAccessible', 'colorNeutralStrokeAccessibleSelected'], main(page)), neutral, BOUNDARY, strong);
    const strokeHover = enforce(mixed(['colorNeutralStroke1Hover', 'colorNeutralStroke4Hover', 'colorNeutralStrokeAccessibleHover'],
      stroke, foreground, 15), neutral, BOUNDARY, strong);
    const strokePressed = enforce(mixed(['colorNeutralStroke1Pressed', 'colorNeutralStroke4Pressed', 'colorNeutralStrokeAccessiblePressed'],
      stroke, foreground, 30), neutral, BOUNDARY, strong);
    const accent = tokens => documented('accent', tokens, main(page));
    const focus = enforce(accent(['colorStrokeFocus2', 'colorBrandStroke1', 'colorCompoundBrandStroke']), neutral, BOUNDARY);
    const tint = mixed(['colorBrandBackground2'], page, accent(['colorBrandBackground2']), 15);
    const tinted = [...neutral, ...painted(tint)];
    const brandText = enforce(accent(['colorBrandForeground1', 'colorBrandForeground2', 'colorBrandForegroundLink',
      'colorBrandForegroundLinkSelected', 'colorCompoundBrandForeground1', 'colorNeutralForeground2BrandHover',
      'colorNeutralForeground2BrandSelected']), tinted, TEXT);
    const brandTextHover = enforce(mixed(['colorBrandForeground2Hover', 'colorBrandForegroundLinkHover', 'colorCompoundBrandForeground1Hover'],
      brandText, foreground, 15), tinted, TEXT);
    const brandTextPressed = enforce(mixed(['colorBrandForeground2Pressed', 'colorBrandForegroundLinkPressed',
      'colorCompoundBrandForeground1Pressed', 'colorNeutralForeground2BrandPressed'], brandText, foreground, 30), tinted, TEXT);
    const fill = enforce(accent(['colorBrandBackground', 'colorCompoundBrandBackground']), painted(page, hover, inset3), BOUNDARY);
    const fillHover = mixed(['colorBrandBackgroundHover', 'colorBrandBackgroundSelected', 'colorCompoundBrandBackgroundHover'],
      fill, foreground, 10);
    const fillPressed = mixed(['colorBrandBackgroundPressed', 'colorCompoundBrandBackgroundPressed'], fill, foreground, 20);
    const fills = painted(fill, fillHover, fillPressed).map(surface => surface.color);
    // Text and the checked switch thumb on the app's accent fills: --color-white only where it passes on
    // every fill, else a supplied neutral or black or white that does. Fluent's own fills keep Fluent's pairs.
    const neutrals = tokens => [page, foreground].filter(role => role.supplied).map(role => as(tokens, role));
    const onBrand = ['colorNeutralForegroundOnBrand', 'colorNeutralForegroundInverted'];
    const onFill = !fill.supplied ? fluent(onBrand) : pairedOn(fills, TEXT,
      [documented('white', onBrand, main(page)), ...neutrals(onBrand), fixed(onBrand, BLACK), fixed(onBrand, WHITE)]) ?? fixed(onBrand, BLACK);
    const innerFocus = !fill.supplied ? fluent(['colorStrokeFocus1']) : pairedOn(fills, BOUNDARY,
      [...neutrals(['colorStrokeFocus1']), fluent(['colorStrokeFocus1']), fixed(['colorStrokeFocus1'], BLACK),
        fixed(['colorStrokeFocus1'], WHITE)]) ?? fluent(['colorStrokeFocus1']);
    const focusHover = enforce(mixed(['colorCompoundBrandStrokeHover'], focus, foreground, 15), neutral, BOUNDARY);
    const focusPressed = enforce(mixed(['colorCompoundBrandStrokePressed'], focus, foreground, 30), neutral, BOUNDARY);
    // Fluent's tone-matched status hues stay; only exposed text, borders, and icons are strengthened.
    const red = enforce(fluent(['colorPaletteRedForeground1']), neutral, TEXT);
    const redBorder = enforce(fluent(['colorPaletteRedBorder2']), neutral, BOUNDARY);
    const warningIcon = enforce(fluent(['colorStatusWarningForeground3']),
      [...neutral, ...painted(fluent(['colorStatusWarningBackground1']))], BOUNDARY);
    const warningGlyph = enforce(fluent(['colorStatusWarningForeground1']), neutral, BOUNDARY);
    const successGlyph = enforce(fluent(['colorStatusSuccessForeground1']), neutral, BOUNDARY);

    const theme = {};
    for (const role of [page, hover, pressed, selected, inset3, inset4, surface(['colorNeutralBackground5'], 8),
      surface(['colorNeutralBackground6'], 10), surface(['colorNeutralBackgroundDisabled'], 5), foreground, muted,
      surface(['colorNeutralForegroundDisabled'], 38), onFill, stroke, strokeHover, strokePressed, surface(['colorNeutralStrokeDisabled'], 18),
      focus, innerFocus, focusHover, focusPressed, mixed(['colorBrandStroke2'], page, accent(['colorBrandStroke2']), 40), brandText,
      brandTextHover, brandTextPressed, fill, fillHover, fillPressed, tint, red, redBorder, warningIcon, warningGlyph, successGlyph]) {
      for (const token of role.tokens) if (role.supplied || role.replaced?.(token)) theme[token] = role.css(token);
    }
    // The supplied border is decorative only: faint rules, never an essential control boundary.
    if (reader.color(values.border)?.[3] > 0) {
      for (const token of ['colorNeutralStroke2', 'colorNeutralStroke3', 'colorNeutralStrokeSubtle']) {
        theme[token] = `var(${HOST.border}, ${base[token]})`;
      }
    }
    // The rail, table header, and pager share the app's page background, so its faint rules separate them.
    if (page.supplied) theme['dude-separator-style'] = 'solid';

    // Type: families and semibold as supplied; Base300 from the body size, and
    // every other size and line height by its Fluent ratio to Base300. Line
    // heights are lengths, since layout adds them in height calculations.
    if (CSS.supports('font-family', values.sans)) {
      theme.fontFamilyBase = `var(${HOST.sans}, ${base.fontFamilyBase})`;
      theme.fontFamilyNumeric = `var(${HOST.sans}, ${base.fontFamilyNumeric})`;
    }
    if (CSS.supports('font-family', values.mono)) theme.fontFamilyMonospace = `var(${HOST.mono}, ${base.fontFamilyMonospace})`;
    if (CSS.supports('font-weight', values.semibold)) theme.fontWeightSemibold = `var(${HOST.semibold}, ${base.fontWeightSemibold})`;
    // Page titles take the display face at Dude's own title sizes.
    if (CSS.supports('font-family', values.display)) {
      theme['dude-font-display'] = `var(${HOST.display}, ${theme.fontFamilyBase ?? base.fontFamilyBase})`;
    }
    // Inline code keeps the supplied size's relative meaning: a share of the surrounding text.
    if (/^\d*\.?\d+em$/.test(values.code)) theme['dude-code-inline'] = `var(${HOST.code}, var(--fontSizeBase200))`;
    const fluentBody = parseFloat(base.fontSizeBase300), fluentLine = parseFloat(base.lineHeightBase300);
    const body = reader.fontSize(values.body);
    const line = reader.lineHeight(values.leading, body ?? fluentBody);
    if (body || line) {
      const scale = (body ?? fluentBody) / fluentBody, lineScale = (line ?? fluentLine * scale) / fluentLine;
      for (const step of SIZE_STEPS) {
        theme[`fontSize${step}`] = `${round2(parseFloat(base[`fontSize${step}`]) * scale)}px`;
        theme[`lineHeight${step}`] = `${round2(parseFloat(base[`lineHeight${step}`]) * lineScale)}px`;
      }
    }
    return Object.freeze({ ...base, ...theme });
  } finally {
    reader.close();
  }
}

/**
 * The one Canvas appearance, for the App's single FluentProvider. Off keeps
 * today's Fluent theme for the device preference. On follows the host tone
 * and the documented values, or stays ordinary Fluent when none is supplied.
 * Review gets only the truthful host tone, whatever the choice. The saved
 * choice is read again on visible focus; live host changes never read or
 * save it.
 */
export function useCanvasTheme() {
  const { confirmed } = useSyncExternalStore(subscribePreference, getPreference);
  const current = useSyncExternalStore(subscribeHost, getHost);
  const theme = useMemo(() => (confirmed ? current.supplied ? followTheme(current)
    : current.hostTone === 'dark' ? darkTheme : lightTheme
    : current.deviceDark ? darkTheme : lightTheme), [confirmed, current]);
  const tone = confirmed ? current.hostTone : current.deviceDark ? 'dark' : 'light';
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-dude-follow-app-theme', String(confirmed));
    // Native controls and scrollbars use the tone Canvas paints in.
    if (confirmed) root.style.setProperty('color-scheme', tone);
    else root.style.removeProperty('color-scheme');
  }, [confirmed, tone]);
  useEffect(() => {
    const reread = () => { if (document.visibilityState !== 'hidden') void rereadPreference(); };
    // The page carries only the appearance choice; the update-check choice comes with this first read.
    void rereadPreference();
    window.addEventListener('focus', reread);
    document.addEventListener('visibilitychange', reread);
    return () => {
      window.removeEventListener('focus', reread);
      document.removeEventListener('visibilitychange', reread);
    };
  }, []);
  return { theme, hostTone: current.hostTone };
}

/** What Settings > Appearance shows: the confirmed choice, its pending work and messages, and whether the host supplies anything. */
export function useAppearanceSettings() {
  const state = useSyncExternalStore(subscribePreference, getPreference);
  const { supplied } = useSyncExternalStore(subscribeHost, getHost);
  return { ...state, hostSupplied: supplied };
}

/** What About's update-check switch shows (072): the same saved document, its pending work and messages. */
export function useUpdateCheckSetting() {
  return useSyncExternalStore(subscribePreference, getPreference);
}

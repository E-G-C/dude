// Annotation/history/keyboard fragments adapted from Sharpie.
// Copyright (c) 2026 Enrique Gonzalez. MIT; see NOTICE.txt.
import {
  TOOLS, BOX_TOOLS, SEGMENT_TOOLS, bounds, handlesFor, hitTest, hitBoundary, cursorForHandle, withinClip, moveBy,
  resizeBy, constrainBox, constrainSegment, probePoint, projectAnnotation, anchorMatches, insideClip, clipHidesAnchor, paintClip,
} from './geometry.mjs';
import { validScrolls } from './inspector.mjs';
import { el, markerSvg, renderAnnotation, renderSelection } from './shapes.mjs';
export { rememberCaret, restoreCaret } from './panel.mjs';

const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SHORTCUTS = Object.freeze({ KeyV: 'select', KeyC: 'comment', KeyB: 'box',
  KeyO: 'circle', KeyA: 'arrow', KeyL: 'line', KeyH: 'highlight' });
const MESSAGES = Object.freeze({
  // Three different conditions refuse the same work, so each names its own
  // cause. The inspector's readiness refusal is the only one that is loading.
  review_not_ready: 'The mock has not settled. Wait for its fonts, images, animations, and layout.',
  review_frame_unresponsive: 'The mock did not answer in time. Keep it visible on screen, then try again.',
  review_view_unsettled: 'The mock kept changing while its view was read. Your markup is retained; try again.',
  review_unavailable: 'The review is unavailable. Your markup stays in this tab.',
  review_anchor_invalid: 'Choose one visible, unique element. Changed anchors are not retargeted.',
  review_element_too_large: 'Choose a smaller element to capture its text and styles.',
  review_document_too_large: 'This document exceeds the bounded review size.',
  review_transient_unsupported: 'This view contains content that a fresh capture cannot verify.',
  review_source_changed: 'The source, theme, or viewport changed. Old markup is retained and cannot be sent.',
  review_capture_mismatch: 'The retained view could not be reproduced. Old markup is retained and cannot be sent.',
  review_outside_viewport: 'Keep all annotations inside the reviewed viewport before sending.',
  review_drawing_outside: 'Annotation not added. Draw fully inside the visible review area, away from its edges.',
  review_invalid_input: 'That annotation change is invalid.',
  review_historical: 'This is saved evidence, not a live review or permission to send.',
  review_conflict: 'Working markup changed elsewhere. Reopen the review before saving again.',
  review_busy: 'Finish the current annotation or scroll before sending.',
  already_consumed: 'This request is no longer waiting. A seal does not mean feedback was delivered.',
  provider_unavailable: 'The provider is unavailable. Nothing will be resent automatically.',
});

function fail(code) { throw Object.assign(new Error(MESSAGES[code] ?? code), { code }); }
function requireValue(value) { if (!value) fail('review_invalid_input'); }
// A refresh that is only transiently refused still retries and stays silent;
// the reported cause is the one the retries kept hitting.
const TRANSIENT_VIEW = Object.freeze(['review_not_ready', 'review_frame_unresponsive', 'review_view_unsettled']);

/**
 * T011 mounts this in its drawing container after POST review/open. Fluent owns
 * toolbar/picker/list/fields/status/return/send. No widgets or private authority
 * are placed in the mock. The caller retains requestHandle; files never do.
 *
 * update({active,theme,requestHandle,revision,preview,unavailable}) invalidates,
 * never retargets. Inactive != disposed.
 * command is closed: tool/select/element/addComment/addAtCenter/edit/delete,
 * undo/redo/caret/notes/scroll/save/seal. Coordinates are document CSS pixels.
 * seal returns a response for the EXISTING needs-you/respond route; it does not
 * send, approve, infer delivery, or clear markup. The shell owns that receipt.
 * handleKeyDown may also be attached to the surrounding Fluent review section.
 */
export function mountReview(container, { review, requestHandle, revision, theme, onChange = () => {}, onMessage = () => {} }) {
  requireValue(container instanceof HTMLElement && review?.working && typeof requestHandle === 'string'
    && typeof revision === 'string' && ['light', 'dark'].includes(theme)
    && review.framePath?.startsWith(`/review-source/${review.submissionId}/`));
  const identity = { requestHandle, revision, preview: clone(review.preview) };
  const lifetime = new AbortController(), channel = crypto.randomUUID();
  let state = clone(review.working), workingRevision = review.workingRevision;
  let active = true, disposed = false, ready = false, stale = false, status = review.status;
  let editable = review.editable, sealing = false, saving = null, lastError = null, staleReason = null;
  let targets = [], target = null, drag = null, draft = null, pointerBusy = false;
  let past = [], future = [], saveTimer = null, scrollFrame = null, resizeFrame = null;
  let changeRevision = 0, savedRevision = 0, nextId = 0, scrollDelta = { x: 0, y: 0 };
  let inactiveView = null, resuming = null;
  let viewportPinned = false;
  let frameLoaded = false, initializing = null, readinessTimer = null;
  let scrolling = null, refreshFrame = null, externalScroll = false, epoch = 0, pointed = null;
  let lastPress = null, hovered = null;
  let nativeDescriptionMap = new Map();
  const pending = new Map();
  const root = document.createElement('div');
  root.className = 'dude-review-engine';
  root.tabIndex = 0;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Review viewport');
  root.setAttribute('aria-description', 'Use arrow keys to pan when the panel is smaller than the recorded mock. Scrolling on the mock scrolls its content instead.');
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = '/review/styles.css';
  const frame = document.createElement('div');
  frame.className = 'dude-review-frame';
  const iframe = document.createElement('iframe');
  iframe.title = 'Canonical HTML mock';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.tabIndex = -1;
  iframe.style.colorScheme = theme;
  iframe.setAttribute('aria-hidden', 'true');
  const overlay = el('svg', { tabindex: 0, role: 'group',
    'aria-label': 'Reviewed HTML document. Use drawing tools or Choose an element to annotate.' });
  overlay.setAttribute('aria-description', 'With the Select tool, double-click an annotation or its number to write its comment. With a drawing tool, the selected annotation keeps its handles for resizing and its border for moving, and two presses on that border write its comment. Enter does the same for the selected annotation.');
  overlay.classList.add('dude-review-overlay');
  frame.append(iframe, overlay); root.append(css, frame); container.append(root);

  function pinViewport(viewport) {
    if (viewportPinned) return;
    viewportPinned = true;
    frame.style.width = `${viewport.width}px`;
    frame.style.height = `${viewport.height}px`;
    frame.classList.add('dude-review-frame-pinned');
    // Panel resizing may pan this frame, never resize or rebase it. A real
    // display-scale change still invalidates the evidence, even without reflow.
    const scale = matchMedia(`(resolution: ${viewport.deviceScale}dppx)`);
    scale.addEventListener('change', () => {
      if (window.devicePixelRatio !== viewport.deviceScale) markStale();
    }, { signal: lifetime.signal });
  }
  // Restore geometry before the inspector's existing viewport, scroll,
  // signature, and anchor checks. This is the same submission, not new work.
  if (state.view) pinViewport(state.view.viewport);

  function colors() {
    const computed = getComputedStyle(container);
    const keys = { stroke: 'colorPaletteRedBorder2', background: 'colorNeutralBackground1',
      foreground: 'colorNeutralForeground1', highlightFill: 'colorPaletteYellowBackground2',
      highlightStroke: 'colorPaletteYellowBorder2', selection: 'colorBrandStroke1', fontFamily: 'fontFamilyBase' };
    const result = Object.fromEntries(Object.entries(keys).map(([k, token]) => [k, computed.getPropertyValue(`--${token}`).trim()]));
    requireValue(Object.values(result).every(Boolean));
    return result;
  }
  const projected = () => state.annotations.map(a => projectAnnotation(a, state.view?.scrolls));
  /**
   * Which annotations cannot be shown against the current view, and the anchor
   * clip each survivor answers to. The renderer needs the same clip this check
   * admits the shape against, so a badge cannot leave the region its shape fits.
   *
   * An anchor clip that hides no part of its own target admits nothing and is
   * not carried: the reviewer sees the whole target, so a marker on it answers
   * to the reviewed viewport exactly like a free drawing. Marker footprints
   * only become meaningful once the target is itself partly clipped, and a
   * marker that then leaves the region is hidden by the same predicate that
   * keeps it out of a submission, so hidden and blocking stay one answer.
   */
  function visibility(annotations, anchor = null) {
    const hidden = new Set();
    const clips = new Map();
    const clip = paintClip(state.view.viewport);
    for (const a of annotations) {
      if (!insideClip(a, clip)) hidden.add(a.id);
      if (a.element) {
        const current = anchor?.element.selector === a.element.selector
          ? anchor : nativeDescriptionMap.get(a.element.selector);
        if (!anchorMatches(a.element, a.scrollBasis, current, state.view.scrolls)
          || !current.visible) hidden.add(a.id);
        else if (clipHidesAnchor(current.element.rect, current.clip)) {
          clips.set(a.id, current.clip);
          if (!insideClip(a, current.clip)) hidden.add(a.id);
        }
      }
    }
    return { hidden, clips };
  }
  function getState() {
    const annotations = ready ? projected() : state.annotations;
    return { ...clone(state), annotations: clone(annotations),
      hiddenIds: ready && !stale ? [...visibility(annotations).hidden] : [],
      submissionId: review.submissionId, workingRevision, active, ready: ready && !resuming,
      stale, staleReason, status, editable: editable && !stale, canSave: editable && !sealing,
      saving: Boolean(saving), sealing,
      busy: Boolean(drag || pointerBusy || scrolling || scrollFrame !== null || refreshFrame !== null),
      dirty: changeRevision !== savedRevision, canUndo: Boolean(past.length) && editable && !stale,
      canRedo: Boolean(future.length) && editable && !stale, targets: clone(targets), target: clone(target?.element ?? null),
      capture: review.capture, error: lastError };
  }
  function emit() { if (!disposed) onChange(getState()); }
  function message(text, error = false, code = null) {
    if (disposed) return;
    if (error) lastError = { code, message: text };
    onMessage({ message: text, error, code }); emit();
  }
  function markStale(code = 'review_source_changed', reason = MESSAGES[code] ?? MESSAGES.review_source_changed) {
    if (stale) return;
    staleReason = reason;
    stale = true; supersede(); clearTimeout(saveTimer); cancelDrag();
    render();
    message(reason, true, code);
  }
  function reportError(error) {
    if (disposed || lifetime.signal.aborted || error.code === 'review_superseded') return;
    if (['source_changed', 'owner_unavailable', 'identity_mismatch', 'review_source_changed'].includes(error.code)) markStale();
    if (['already_consumed', 'provider_unavailable', 'unknown_request', 'review_historical'].includes(error.code)) {
      editable = false; status = 'unavailable'; clearTimeout(saveTimer); cancelDrag();
    }
    message(error.message || MESSAGES.review_unavailable, true, error.code ?? 'review_unavailable');
  }
  function writable() {
    requireValue(!disposed);
    if (!editable) fail('review_historical');
    if (stale) fail('review_source_changed');
    if (!active || !ready || resuming) fail('review_not_ready');
    requireValue(!sealing);
  }
  function changed() {
    changeRevision++; lastError = null;
    render(); emit();
    clearTimeout(saveTimer);
    if (editable && !stale && !sealing) saveTimer = setTimeout(() => { void save().catch(reportError); }, 700);
  }
  function pushHistory(before = clone(state.annotations)) {
    past.push(before); if (past.length > 60) past.shift();
    future = [];
  }
  function repairSelection() {
    if (!state.annotations.some(a => a.id === state.selectedId)) state.selectedId = null;
    if (state.caret && !state.annotations.some(a => a.id === state.caret.id)) state.caret = null;
    if (state.caret) {
      const length = state.annotations.find(a => a.id === state.caret.id)[state.caret.field].length;
      state.caret.start = Math.min(state.caret.start, length);
      state.caret.end = Math.min(state.caret.end, length);
    }
  }
  function commit(mutator, before) {
    pushHistory(before);
    mutator(); repairSelection(); changed();
  }
  function render() {
    overlay.dataset.tool = state.tool;
    // 059 exploration. The transient action cursor answers to the same state
    // the next press would use, so every render refreshes or clears it.
    refreshAction();
    // Keep the original evidence, but never paint it against changed geometry.
    // cancelDrag can be a no-op, so invalidation must clear the live SVG too.
    if (stale) { overlay.replaceChildren(); return; }
    const view = state.view?.viewport;
    if (!view || !state.palette) return;
    overlay.setAttribute('viewBox', `0 0 ${view.width} ${view.height}`);
    const annotations = projected(), { hidden, clips } = visibility(annotations);
    for (const a of annotations) if (clips.has(a.id)) a.clip = clips.get(a.id);
    overlay.replaceChildren(...markerSvg(annotations, view, state.palette, hidden).children);
    const layer = el('g', { transform: `translate(${-view.scrollX},${-view.scrollY})` });
    if (target?.visible && !stale) layer.append(el('rect', { x: target.element.rect.x, y: target.element.rect.y,
      width: target.element.rect.width, height: target.element.rect.height, fill: 'none',
      stroke: state.palette.selection, 'stroke-width': 2, 'stroke-dasharray': '6 3' }));
    const selected = annotations.find(a => a.id === state.selectedId);
    // Selection chrome reaches further than the paint envelope its annotation
    // was admitted against, so it answers to the same region as its marker
    // rather than outlining over a neighbouring element.
    if (selected && !stale && !hidden.has(selected.id)) {
      const outline = renderSelection(selected, state.palette);
      outline.setAttribute('clip-path', `url(#dude-review-clip-${selected.id})`);
      layer.append(outline);
    }
    if (draft) layer.append(renderAnnotation(draft, state.annotations.length, state.palette, paintClip(view)));
    overlay.append(layer);
  }
  function onResult(event) {
    const data = event.data;
    if (event.source !== iframe.contentWindow || event.origin !== 'null' || !data || data.channel !== channel) return;
    if (data.type === 'dude-review-scrolled' && Object.keys(data).length === 2) {
      if (active && ready && !stale) { externalScroll = true; scheduleRefresh(); }
      return;
    }
    if (data.type !== 'dude-review-result' || !pending.has(data.id)) return;
    const p = pending.get(data.id);
    pending.delete(data.id); clearTimeout(p.timer);
    try {
      checkEpoch(p.epoch);
      requireValue(Object.keys(data).length === 4 && new TextEncoder().encode(JSON.stringify(data)).length <= 512 * 1024);
      if (Object.hasOwn(data, 'error')) fail(Object.hasOwn(MESSAGES, data.error) ? data.error : 'review_unavailable');
      requireValue(Object.hasOwn(data, 'result'));
      p.resolve(data.result);
    } catch (error) { p.reject(error); }
  }
  function checkEpoch(value, view) {
    if (value !== epoch || !active || disposed || view && view !== state.view) {
      throw Object.assign(new Error('Review view superseded.'), { code: 'review_superseded' });
    }
    // Awaited admissions must still belong to the same settled, adopted view.
    if (view && (scrolling || scrollFrame !== null || refreshFrame !== null || externalScroll)) fail('review_busy');
  }
  function supersede() {
    epoch++;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Object.assign(new Error('Review view superseded.'), { code: 'review_superseded' }));
    }
    pending.clear();
  }
  function query(op, fields = {}) {
    if (disposed || !iframe.contentWindow) return Promise.reject(new Error(MESSAGES.review_unavailable));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      // An opaque frame that is not being rendered never answers a scroll or
      // restore: its rAF turns stop. That is silence, not loading.
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error(MESSAGES.review_frame_unresponsive), { code: 'review_frame_unresponsive' })); }, 4000);
      pending.set(id, { resolve, reject, timer, epoch });
      // Opaque sandbox targets require '*'; source+origin+channel are checked on
      // reply. The channel only correlates geometry, never a privileged action.
      iframe.contentWindow.postMessage({ type: 'dude-review-query', channel, id, op, ...fields }, '*');
    });
  }
  function checkView(result) {
    requireValue(result && typeof result.signature === 'string' && /^sha256:[a-f0-9]{64}$/.test(result.signature)
      && result.viewport && validScrolls(result.scrolls) && Array.isArray(result.targets) && result.targets.length <= 300);
    const v = result.viewport;
    requireValue(['width', 'height', 'scrollX', 'scrollY', 'deviceScale', 'documentWidth', 'documentHeight'].every(k => Number.isFinite(v[k]))
      && v.width > 0 && v.height > 0 && ['light', 'dark'].includes(v.theme));
    if (v.width !== frame.clientWidth || v.height !== frame.clientHeight) fail('review_not_ready');
    // A restored frame must also belong to the recorded display scale. The
    // opaque child can still report its old scale while the parent has changed.
    if (viewportPinned && v.deviceScale !== window.devicePixelRatio) {
      markStale('review_capture_mismatch');
      fail('review_capture_mismatch');
    }
  }
  function adoptView(result, anchors) {
    checkView(result);
    const v = result.viewport;
    const previous = state.view?.viewport;
    if (viewportPinned && previous
      && ['width', 'height', 'deviceScale', 'theme'].some(k => previous[k] !== v[k])) markStale();
    const palette = colors();
    if (viewportPinned && state.palette && !same(state.palette, palette)) markStale();
    if (!stale) {
      const legacy = state.annotations.length && state.view && state.view.scrolls === undefined && !result.scrolls.length;
      state.view = { viewport: clone(v), signature: result.signature, ...(!legacy ? { scrolls: clone(result.scrolls) } : {}) };
      state.palette = palette;
      targets = result.targets;
      nativeDescriptionMap = anchors.current; target = anchors.target;
    }
    render(); emit();
    return result;
  }
  async function refreshView(op = 'view', fields = {}) {
    const currentEpoch = epoch;
    while (scrolling) {
      try { await scrolling; }
      catch (error) { if (error.code !== 'review_superseded') throw error; }
    }
    checkEpoch(currentEpoch);
    cancelAnimationFrame(refreshFrame); refreshFrame = null;
    externalScroll = false;
    const work = (async () => {
      const result = await query(op, fields);
      checkEpoch(currentEpoch); checkView(result);
      const anchors = await validateAnchors(result, currentEpoch);
      checkEpoch(currentEpoch);
      // A scroll arriving during the bounded anchor read supersedes the view;
      // never call that race a changed target or adopt a partial port snapshot.
      const after = await query('view');
      checkEpoch(currentEpoch);
      // A complete document that will not hold still between the two reads is
      // unsettled, not unloaded. The same refusal stands; only the cause differs.
      if (!anchors || result.signature !== after.signature || !same(result.scrolls, after.scrolls)
        || !same(result.viewport, after.viewport)) {
        fail('review_view_unsettled');
      }
      if (op === 'restore' && result.signature !== fields.view.signature) {
        fail(ready ? 'review_capture_mismatch' : 'review_not_ready');
      }
      cancelDrag();
      externalScroll = false;
      const prior = clone(state.view);
      adoptView(result, anchors);
      if (ready && !stale && !same(prior, state.view)) changed();
      return result;
    })();
    scrolling = work; emit();
    try { return await work; }
    finally {
      if (scrolling === work) scrolling = null;
      emit(); scheduleWheel(); scheduleRefresh();
    }
  }
  async function inspected(op, fields, requireVisible = true) {
    const result = await query(op, fields);
    const e = result?.element;
    requireValue(e?.selectorMatches === 1 && typeof e.selector === 'string'
      && typeof e.text === 'string' && e.rect && Number.isFinite(e.rect.width) && Number.isFinite(e.rect.height)
      && validScrolls(result.scrollBasis) && typeof result.visible === 'boolean'
      && result.clip && ['left', 'top', 'right', 'bottom'].every(k => Number.isFinite(result.clip[k])));
    if (requireVisible && !result.visible) fail('review_anchor_invalid');
    return clone(result);
  }
  async function validateAnchors(view, currentEpoch) {
    const deadline = Date.now() + 8000;
    const current = new Map();
    try {
      for (const a of state.annotations) if (a.element) {
        if (Date.now() > deadline) fail('review_not_ready');
        const description = current.get(a.element.selector)
          ?? await inspected('selector', { selector: a.element.selector }, false);
        checkEpoch(currentEpoch);
        current.set(a.element.selector, description);
        if (description.scrollBasis.some(s => view.scrolls.some(v => v.selector === s.selector
          && (v.scrollLeft !== s.scrollLeft || v.scrollTop !== s.scrollTop)))) return null;
        if (!anchorMatches(a.element, a.scrollBasis, description, view.scrolls)) fail('review_anchor_invalid');
      }
    } catch (error) {
      checkEpoch(currentEpoch);
      if (error.code === 'review_anchor_invalid') markStale('review_anchor_invalid');
      throw error;
    }
    let nextTarget = null;
    if (target) {
      try {
        const description = current.get(target.element.selector)
          ?? await inspected('selector', { selector: target.element.selector }, false);
        if (anchorMatches(target.element, target.scrollBasis, description, view.scrolls)) {
          current.set(target.element.selector, description);
          nextTarget = description;
        }
      } catch (error) { if (error.code !== 'review_anchor_invalid') throw error; }
    }
    return { current, target: nextTarget };
  }
  function scheduleRefresh() {
    if (!externalScroll || refreshFrame !== null || !active || !ready || disposed || stale
      || scrolling || resuming || sealing || pointerBusy) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = null;
      if (!active || disposed || stale || sealing) return;
      void refreshView().catch(error => { if (!TRANSIENT_VIEW.includes(error.code)) reportError(error); });
    });
  }
  async function post(action, body) {
    const response = await fetch(`/api/needs-you/review/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: lifetime.signal,
      body: JSON.stringify({ requestHandle, revision, ...body }),
    });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.message || MESSAGES[payload.error] || 'Review action failed.'), { code: payload.error });
    return payload;
  }
  async function save() {
    clearTimeout(saveTimer);
    while (saving) await saving;
    if (changeRevision === savedRevision) return { status: 'saved', workingRevision };
    if (!editable) fail('review_historical');
    // Explicit saving may preserve stale evidence, never edit or rebase it.
    // The existing adapter still rechecks exact source and request authority.
    // Pointer movement is only a preview until pointerUp validates it. Metadata
    // can autosave meanwhile, using the last committed annotation snapshot.
    const frozen = clone({ ...state, annotations: drag?.before ?? state.annotations }), version = changeRevision;
    saving = post('save', { submissionId: review.submissionId, workingRevision, working: frozen });
    emit();
    try {
      const result = await saving;
      requireValue(result.status === 'saved' && result.submissionId === review.submissionId);
      workingRevision = result.workingRevision; savedRevision = version; lastError = null;
      if (changeRevision !== version && editable && !stale && !sealing) {
        saveTimer = setTimeout(() => { void save().catch(reportError); }, 700);
      }
      return result;
    } finally { saving = null; emit(); }
  }
  async function seal(text) {
    writable();
    if (drag || pointerBusy || scrolling || scrollFrame !== null || refreshFrame !== null) fail('review_busy');
    requireValue(state.annotations.length > 0 && (text === undefined || typeof text === 'string'));
    const currentEpoch = epoch;
    sealing = true; clearTimeout(saveTimer); cancelDrag(); emit();
    try {
      while (saving) await saving;
      checkEpoch(currentEpoch);
      await refreshView();
      if (stale) fail('review_source_changed');
      if (visibility(projected()).hidden.size) fail('review_outside_viewport');
      changeRevision++;
      await save();
      checkEpoch(currentEpoch);
      const result = await post('seal', { submissionId: review.submissionId, workingRevision,
        ...(text === undefined || text === '' ? {} : { revisionText: text }) });
      checkEpoch(currentEpoch);
      requireValue(result.status === 'sealed' && result.submissionId === review.submissionId);
      status = 'sealed'; editable = false;
      if (stale) fail('review_source_changed');
      message('Report and image sealed. They have not been sent or applied.');
      return { ...result, response: { class: 'preview', action: 'annotations', submissionId: review.submissionId,
        ...(text === undefined || text === '' ? {} : { text }) } };
    } finally { sealing = false; emit(); scheduleRefresh(); }
  }
  function annotation(tool, start, end, anchor = null) {
    return { id: crypto.randomUUID(), tool, x1: start.x, y1: start.y, x2: end.x, y2: end.y,
      comment: '', replacement: '', styleNote: '', element: anchor?.element ?? null,
      ...(anchor ? { scrollBasis: clone(anchor.scrollBasis) } : {}) };
  }
  async function add(a, inspect = false, anchor = null) {
    writable();
    requireValue(state.annotations.length < 300);
    const currentEpoch = epoch, currentView = state.view;
    checkEpoch(currentEpoch, currentView);
    if (inspect) {
      const p = probePoint(a);
      try {
        anchor = await inspected('at', { x: p.x, y: p.y });
      }
      catch (error) {
        if (error.code !== 'review_element_too_large' || a.tool === 'comment') throw error;
        // A free drawing need not target a large container. No admitted anchor
        // is changed or silently retargeted by this fallback.
      }
    }
    checkEpoch(currentEpoch, currentView);
    writable();
    if (anchor) {
      if (!anchorMatches(anchor.element, anchor.scrollBasis, anchor, state.view.scrolls)) fail('review_anchor_invalid');
      a.element = anchor.element; a.scrollBasis = anchor.scrollBasis;
    }
    // Admission uses the same complete paint/anchor check as rendering and
    // Send, before pinning, history, or autosave. Saved edits remain recoverable.
    if (visibility([projectAnnotation(a, state.view.scrolls)], anchor).hidden.size) fail('review_drawing_outside');
    if (!viewportPinned) {
      const v = state.view.viewport;
      // An admission that raced a resize cannot freeze the older geometry.
      if (v.width !== frame.clientWidth || v.height !== frame.clientHeight
        || v.deviceScale !== window.devicePixelRatio) fail('review_not_ready');
      pinViewport(v);
    }
    if (a.scrollBasis !== undefined && state.view.scrolls === undefined) state.view.scrolls = [];
    if (anchor) nativeDescriptionMap.set(anchor.element.selector, anchor);
    commit(() => { state.annotations.push(a); state.selectedId = a.id; state.caret = null; });
    if (a.tool === 'comment') message('Comment marker added.', false, 'review_comment_added');
    else message(`${a.tool} added. The drawing tool stays selected.`);
    return a.id;
  }
  async function scroll(input) {
    writable();
    requireValue(!drag);
    return refreshView('scroll', input);
  }
  function withinFrame(event) {
    const r = iframe.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX < r.right
      && event.clientY >= r.top && event.clientY < r.bottom;
  }
  function point(event) {
    const r = iframe.getBoundingClientRect(), v = state.view.viewport;
    return { x: Math.max(0, Math.min(v.width, (event.clientX - r.left) * v.width / r.width)) + v.scrollX,
      y: Math.max(0, Math.min(v.height, (event.clientY - r.top) * v.height / r.height)) + v.scrollY };
  }
  function cancelDrag() {
    if (!drag && !draft) return;
    // A cancelled press never completed, so it cannot be half of a double press.
    lastPress = null;
    if (drag?.before) state.annotations = drag.before;
    const pointer = drag?.pointerId;
    drag = null; draft = null;
    if (pointer !== undefined && overlay.hasPointerCapture(pointer)) overlay.releasePointerCapture(pointer);
    render(); emit();
  }
  /**
   * The visible annotations a pointer answers to, and the marker that lands
   * under one point. Topmost wins, so a drawing made inside an earlier one
   * still takes its own press, and each candidate is tested against the same
   * clip its marker was painted with, so a badge is only pressable where the
   * reviewer can see it.
   */
  function pointable() {
    const current = projected(), { hidden, clips } = visibility(current);
    return { annotations: current.filter(a => !hidden.has(a.id)), clips };
  }
  function markerAt(annotations, clips, p) {
    return annotations.slice().reverse()
      .find(a => hitTest(a, p, paintClip(state.view.viewport, clips.get(a.id))));
  }
  /**
   * 059 exploration. One classification for hover and for the next press, so
   * the cursor can never promise an action the press would not perform.
   *
   * Snagit's selected-object convention: the object already showing handles
   * keeps answering to them while a drawing tool stays armed, its border moves
   * it, and everywhere else still draws. Only the current visible selection is
   * eligible -- there is no scan of unselected marks for a drawing-mode grab,
   * and no recency rule -- while Select keeps its existing whole-face, badge,
   * and topmost behavior unchanged.
   */
  function targetAt(p) {
    const { annotations, clips } = pointable();
    const selected = annotations.find(a => a.id === state.selectedId);
    const drawing = BOX_TOOLS.has(state.tool) || SEGMENT_TOOLS.has(state.tool);
    // Select keeps its existing predicate. A drawing-mode grab must also land
    // in the region its selected affordance is actually painted in, so a
    // clipped-away handle or border cannot be reached from a visible pixel.
    const reachable = Boolean(selected) && (state.tool === 'select'
      || (drawing && withinClip(p, paintClip(state.view.viewport, clips.get(selected.id)))));
    const handle = reachable
      ? handlesFor(selected).find(h => Math.hypot(h.x - p.x, h.y - p.y) <= 9) : null;
    if (handle) return { kind: 'resize', id: selected.id, handle: handle.name,
      cursor: cursorForHandle(selected, handle.name) };
    if (state.tool === 'select') {
      const hit = markerAt(annotations, clips, p);
      return hit ? { kind: 'move', id: hit.id, cursor: 'move' } : { kind: 'pick', cursor: null };
    }
    if (state.tool === 'comment') return { kind: 'pick', cursor: null };
    if (reachable && hitBoundary(selected, p)) return { kind: 'move', id: selected.id, cursor: 'move' };
    return { kind: 'create', cursor: null };
  }
  /**
   * 059 exploration. Paint the transient action cursor from that same answer.
   * It is overlay presentation only: nothing is stored on an annotation, and a
   * state that cannot be edited keeps the plain tool cursor rather than a
   * misleading resize or move cue. render() refreshes it, so a tool, selection,
   * visibility, or availability change cannot leave a stale promise behind.
   */
  function refreshAction() {
    let action = null;
    if (drag && (drag.kind === 'move' || drag.kind === 'resize')) {
      const held = projected().find(a => a.id === drag.id);
      action = drag.kind === 'move' ? 'move' : held ? cursorForHandle(held, drag.handle) : null;
    } else if (hovered && !drag && !draft && active && ready && !resuming && editable && !stale && !sealing
      && !pointerBusy && !scrolling && refreshFrame === null && !externalScroll
      && state.view && withinFrame(hovered)) {
      action = targetAt(point(hovered)).cursor;
    }
    if (action) overlay.dataset.action = action;
    else delete overlay.dataset.action;
  }
  /**
   * Reveal one annotation's comment. Comments is the panel's surface, so the
   * engine names the annotation the way an added comment marker already does
   * instead of reaching into it. Selection is the engine's own answer; nothing
   * here moves the pinned view or takes focus.
   */
  function revealComment(id) {
    const index = state.annotations.findIndex(a => a.id === id);
    if (index < 0) return;
    if (state.selectedId !== id) { state.selectedId = id; changed(); }
    message(`Annotation ${index + 1} opened in Comments.`, false, 'review_comment_open');
  }
  /**
   * Double-press opens the pressed annotation's comment: the ordinary "open
   * this item" gesture a list row, a file, or a shape in a drawing tool answers
   * to. The DOM's own dblclick cannot carry it, because every press repaints
   * this overlay and a removed press target cancels the browser's click. The
   * engine already owns the whole pointer stream, so the second press on the
   * same marker, in the same place, inside the platform's usual 500 ms, is the
   * gesture. It is answered on release, and only when nothing was dragged, so a
   * drag that begins on the second press still moves the annotation, and a
   * press that dragged never primes the press after it.
   */
  function doublePressed(id, p, event) {
    const previous = lastPress;
    lastPress = id ? { id, at: event.timeStamp, x: p.x, y: p.y } : null;
    return Boolean(id && previous && previous.id === id
      && event.timeStamp - previous.at <= 500 && Math.hypot(p.x - previous.x, p.y - previous.y) <= 4);
  }
  function pointerDown(event) {
    if (!active || !ready || resuming || !editable || stale || sealing || pointerBusy || scrolling
      || refreshFrame !== null || externalScroll || event.button !== 0 || !event.isPrimary) return;
    // Never turn an outside press into a border point, including after outer
    // panning. CSS client coordinates already account for the display scale.
    if (!withinFrame(event)) {
      if (state.tool !== 'select') message(MESSAGES.review_drawing_outside, true, 'review_drawing_outside');
      return;
    }
    overlay.focus({ preventScroll: true });
    const previousSelectedId = state.selectedId;
    const p = point(event);
    pointed = { x: p.x - state.view.viewport.scrollX, y: p.y - state.view.viewport.scrollY };
    hovered = event;
    const found = targetAt(p);
    // A handle grab and a drawing-only press are not halves of a double press;
    // only a press on an annotation's own body or border can pair.
    const doubled = doublePressed(found.kind === 'move' ? found.id : null, p, event);
    const base = { pointerId: event.pointerId, start: p, before: clone(state.annotations) };
    if (found.kind === 'move' || found.kind === 'resize') {
      state.selectedId = found.id;
      drag = { ...base, kind: found.kind, handle: found.handle, id: found.id, doubled, manipulated: false,
        origin: clone(state.annotations.find(original => original.id === found.id)) };
    } else if (found.kind === 'pick') drag = { ...base, kind: 'pick', tool: state.tool };
    else {
      // ZoomIt order for arrows: the head anchors where the user pressed and the
      // tail follows the cursor. Stored geometry is unchanged -- the head is
      // still the (x2,y2) end -- so saved arrows keep pointing where they did.
      draft = annotation(state.tool, p, p);
      drag = { ...base, kind: 'create', tail: state.tool === 'arrow' };
    }
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    if (state.selectedId !== previousSelectedId) changed();
    else { render(); emit(); }
  }
  function pointerMove(event) {
    if (!active || !ready || !state.view) return;
    let p = point(event);
    pointed = { x: p.x - state.view.viewport.scrollX, y: p.y - state.view.viewport.scrollY };
    hovered = event;
    if (!drag || drag.pointerId !== event.pointerId || stale) { refreshAction(); return; }
    if (drag.kind === 'create') {
      if (event.shiftKey) p = SEGMENT_TOOLS.has(draft.tool) ? constrainSegment(drag.start, p) : constrainBox(drag.start, p);
      if (drag.tail) { draft.x1 = p.x; draft.y1 = p.y; }
      else { draft.x2 = p.x; draft.y2 = p.y; }
    } else if (drag.kind === 'move' || drag.kind === 'resize') {
      const a = state.annotations.find(a => a.id === drag.id);
      const current = projectAnnotation(clone(drag.origin), state.view.scrolls);
      if (drag.kind === 'move') moveBy(current, p.x - drag.start.x, p.y - drag.start.y);
      else resizeBy(current, drag.handle, p);
      Object.assign(a, projectAnnotation(current, state.view.scrolls, true));
      // 059 exploration. Monotonic: once this press actually changed the mark's
      // coordinates it stays manipulated, including a return to its origin.
      if (!drag.manipulated && ['x1', 'y1', 'x2', 'y2'].some(k => a[k] !== drag.origin[k])) drag.manipulated = true;
    }
    render();
  }
  async function pointerUp(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const currentEpoch = epoch;
    let currentView = state.view;
    const current = drag, shape = draft, p = point(event);
    drag = null; draft = null; pointerBusy = true;
    // 059 exploration. Comment candidacy ends where manipulation begins, so a
    // cancelled, refused, or net-equal adjustment cannot prime the next press.
    if (current.manipulated) lastPress = null;
    if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
    try {
      // Captured movement may show a bounded draft. Reject known-bad viewport
      // paint before even refreshing (and potentially saving) an unpinned view.
      // The complete anchor check still runs in add; the head is never moved.
      if ((current.kind === 'create' || current.kind === 'pick' && current.tool === 'comment')
        && (!withinFrame(event) || visibility([shape || annotation('comment', p, p)]).hidden.size)) fail('review_drawing_outside');
      if (!viewportPinned) {
        // Keyboard admission already refreshes before building an annotation.
        // The first pointer admission must also pin the now-settled signature,
        // without carrying its drawing coordinates across a changed viewport.
        await refreshView();
        checkEpoch(currentEpoch);
        if (!same(currentView.viewport, state.view.viewport) || !same(currentView.scrolls, state.view.scrolls)) fail('review_not_ready');
        currentView = state.view;
      }
      if (current.kind === 'create') {
        const box = bounds(shape);
        if (Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) >= 4
          && (!BOX_TOOLS.has(shape.tool) || box.width >= 4 && box.height >= 4)) await add(shape, true);
      } else if (current.kind === 'pick' && Math.hypot(p.x - current.start.x, p.y - current.start.y) <= 8) {
        const picked = await inspected('at', { x: p.x, y: p.y });
        checkEpoch(currentEpoch, currentView); writable();
        target = picked;
        if (current.tool === 'comment') await add(annotation('comment', p, p, picked), false, picked);
        else { state.selectedId = null; changed(); }
      } else if (current.kind === 'move' || current.kind === 'resize') {
        if (!same(state.annotations, current.before)) {
          const moved = projectAnnotation(state.annotations.find(a => a.id === current.id), state.view.scrolls);
          requireValue([moved.x1, moved.x2, moved.y1, moved.y2].every(n => n >= 0 && n <= 1000000 && Number.isFinite(n)));
          requireValue(state.annotations.every(a => {
            const b = bounds(a);
            return a.tool === 'comment' || (BOX_TOOLS.has(a.tool)
              ? b.width >= 4 && b.height >= 4 : Math.hypot(b.width, b.height) >= 4);
          }));
          pushHistory(current.before); changed();
        // 059 exploration. Final equality still decides whether there is any
        // geometry to record; manipulation decides, separately, whether this
        // press may still open a comment.
        } else if (current.doubled && !current.manipulated) revealComment(current.id);
      }
    } catch (error) {
      if (current.kind === 'move' || current.kind === 'resize') state.annotations = current.before;
      reportError(error);
    } finally { pointerBusy = false; render(); emit(); scheduleRefresh(); }
  }
  function handleKeyDown(event) {
    if (event.defaultPrevented || !active || !editable || stale || sealing || !ready || resuming) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="combobox"]')) return;
    const code = /^Key[A-Z]$/.test(event.code) ? event.code
      : event.key?.length === 1 ? `Key${event.key.toUpperCase()}` : event.code || event.key;
    let action;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && code === 'KeyZ') action = { type: event.shiftKey ? 'redo' : 'undo' };
    else if ((event.ctrlKey || event.metaKey) && !event.altKey && code === 'KeyY') action = { type: 'redo' };
    else if (event.ctrlKey || event.metaKey || event.altKey) return;
    else if (event.key === 'Escape') {
      event.preventDefault(); cancelDrag();
      if (state.tool !== 'select') { state.tool = 'select'; changed(); }
      return;
    } else if (['Delete', 'Backspace'].includes(event.key) && state.selectedId) action = { type: 'delete', id: state.selectedId };
    else if (event.target.closest?.('button,[role="listbox"],[role="option"],[role="menuitem"]')) return;
    else if (SHORTCUTS[code]) action = { type: 'tool', tool: SHORTCUTS[code] };
    else if (event.key === 'Enter' && event.target === overlay && state.selectedId) {
      // Enter opens the selected item, the keyboard twin of double-click. It
      // answers only on the drawing surface, so the comment list, the tool
      // palette, and every other control keep their own Enter.
      event.preventDefault();
      revealComment(state.selectedId);
      return;
    } else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key) && event.target === overlay) {
      event.preventDefault();
      const v = state.view.viewport;
      const selector = state.annotations.find(a => a.id === state.selectedId)?.element?.selector ?? target?.element.selector ?? null;
      void scroll({ point: pointed ?? { x: v.width / 2, y: v.height / 2 }, key: event.key, selector }).catch(reportError);
      return;
    }
    if (action) { event.preventDefault(); void command(action).catch(() => {}); }
  }
  function wheel(event) {
    if (!active || !ready || resuming || !editable || stale || sealing || drag
      || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const p = point(event), v = state.view.viewport;
    pointed = { x: p.x - v.scrollX, y: p.y - v.scrollY };
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.view.viewport.height : 1;
    scrollDelta.x += event.deltaX * scale; scrollDelta.y += event.deltaY * scale;
    scheduleWheel();
  }
  function scheduleWheel() {
    if (scrollFrame !== null || scrolling || disposed || !active || sealing || stale
      || (!scrollDelta.x && !scrollDelta.y)) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      const d = scrollDelta; scrollDelta = { x: 0, y: 0 };
      if (!active || disposed || sealing || stale) return;
      const v = state.view.viewport;
      void scroll({ point: pointed ?? { x: v.width / 2, y: v.height / 2 },
        delta: { x: Math.max(-1000000, Math.min(1000000, d.x)), y: Math.max(-1000000, Math.min(1000000, d.y)) } }).catch(reportError);
    });
  }
  async function command(action) {
    try {
      requireValue(action && typeof action === 'object');
      if (action.type === 'save') return await save();
      if (action.type === 'seal') return await seal(action.text);
      const currentEpoch = epoch;
      if (resuming) await resuming;
      while (scrolling) {
        try { await scrolling; }
        catch (error) { if (error.code !== 'review_superseded') throw error; }
      }
      checkEpoch(currentEpoch);
      if (externalScroll) await refreshView();
      writable();
      // A committed edit must not land in the pointer preview that cancel discards.
      if (['addComment', 'addAtCenter', 'edit', 'delete'].includes(action.type)) cancelDrag();
      switch (action.type) {
        case 'tool':
          requireValue(TOOLS.includes(action.tool)); cancelDrag();
          if (state.tool !== action.tool) { state.tool = action.tool; changed(); }
          break;
        case 'select':
          requireValue(action.id === null || state.annotations.some(a => a.id === action.id));
          state.selectedId = action.id; changed(); break;
        case 'element': {
          await refreshView();
          const currentView = state.view;
          const current = await inspected('selector', { selector: action.selector });
          checkEpoch(currentEpoch, currentView); writable();
          target = current; render(); emit(); break;
        }
        case 'addComment': {
          requireValue(target); await refreshView();
          requireValue(target);
          const currentView = state.view;
          const current = await inspected('selector', { selector: target.element.selector });
          checkEpoch(currentEpoch, currentView);
          if (!anchorMatches(target.element, target.scrollBasis, current, state.view.scrolls)) fail('review_anchor_invalid');
          const r = current.element.rect;
          const p = { x: r.x + Math.min(16, r.width / 2), y: r.y + Math.min(16, r.height / 2) };
          return await add(annotation('comment', p, p, current), false, current);
        }
        case 'addAtCenter': {
          requireValue(BOX_TOOLS.has(state.tool) || SEGMENT_TOOLS.has(state.tool)); await refreshView();
          const v = state.view.viewport;
          return await add(annotation(state.tool, { x: v.scrollX + v.width / 4, y: v.scrollY + v.height / 3 },
            { x: v.scrollX + v.width * 3 / 4, y: v.scrollY + v.height * 0.6 }));
        }
        case 'edit': {
          const a = state.annotations.find(a => a.id === action.id);
          requireValue(a && action.changes && Object.keys(action.changes).length);
          for (const [key, value] of Object.entries(action.changes)) {
            requireValue(['comment', 'replacement', 'styleNote', 'x1', 'y1', 'x2', 'y2'].includes(key));
            if (['comment', 'replacement', 'styleNote'].includes(key)) requireValue(typeof value === 'string' && new TextEncoder().encode(value).length <= 8192);
            else requireValue(Number.isFinite(value) && value >= 0 && value <= 1000000);
          }
          const next = { ...projectAnnotation(a, state.view.scrolls), ...action.changes }, box = bounds(next);
          if (a.tool === 'comment') { next.x2 = next.x1; next.y2 = next.y1; }
          if (BOX_TOOLS.has(next.tool)) requireValue(box.width >= 4 && box.height >= 4);
          if (SEGMENT_TOOLS.has(next.tool)) requireValue(Math.hypot(next.x2 - next.x1, next.y2 - next.y1) >= 4);
          const original = projectAnnotation(next, state.view.scrolls, true);
          requireValue([original.x1, original.y1, original.x2, original.y2].every(n => Number.isFinite(n)
            && n >= (a.scrollBasis === undefined ? 0 : -1000000) && n <= 1000000));
          commit(() => {
            Object.assign(a, original);
            if (state.caret?.id === a.id) {
              const n = a[state.caret.field].length;
              state.caret.start = Math.min(state.caret.start, n); state.caret.end = Math.min(state.caret.end, n);
            }
          }); break;
        }
        case 'delete':
          requireValue(state.annotations.some(a => a.id === action.id));
          commit(() => { state.annotations = state.annotations.filter(a => a.id !== action.id); }); break;
        case 'undo':
          cancelDrag();
          if (past.length) { future.push(clone(state.annotations)); state.annotations = past.pop(); repairSelection(); changed(); }
          break;
        case 'redo':
          cancelDrag();
          if (future.length) { past.push(clone(state.annotations)); state.annotations = future.pop(); repairSelection(); changed(); }
          break;
        case 'caret':
          requireValue(action.caret === null || state.annotations.some(a => a.id === action.caret.id));
          state.caret = clone(action.caret); changed(); break;
        case 'notes':
          requireValue(typeof action.text === 'string' && new TextEncoder().encode(action.text).length <= 32768);
          state.notes = action.text; changed(); break;
        case 'scroll':
          requireValue(Number.isFinite(action.x) && Number.isFinite(action.y));
          return await scroll({ x: Math.max(0, Math.min(1000000, action.x)), y: Math.max(0, Math.min(1000000, action.y)) });
        default: fail('review_invalid_input');
      }
      return getState();
    } catch (error) { reportError(error); throw error; }
  }
  function update(next) {
    if (disposed) return;
    if ((next.requestHandle !== undefined && next.requestHandle !== identity.requestHandle)
      || (next.revision !== undefined && next.revision !== identity.revision)
      || (next.preview !== undefined && !same(next.preview, identity.preview))) markStale();
    if (next.unavailable) {
      if (editable) supersede();
      editable = false; status = 'unavailable'; clearTimeout(saveTimer); cancelDrag();
    }
    if (next.theme !== undefined && next.theme !== theme) {
      requireValue(['light', 'dark'].includes(next.theme));
      if (viewportPinned) markStale();
      else { supersede(); theme = next.theme; iframe.style.colorScheme = theme; void refreshView().catch(reportError); }
    }
    if (next.active !== undefined) {
      requireValue(typeof next.active === 'boolean');
      if (active !== next.active) {
        if (!next.active) inactiveView = clone(state.view);
        supersede();
        active = next.active; root.hidden = !active;
        if (!active) {
          cancelDrag();
          clearTimeout(readinessTimer); cancelAnimationFrame(scrollFrame); cancelAnimationFrame(refreshFrame);
          scrollFrame = null; refreshFrame = null; externalScroll = false; scrollDelta = { x: 0, y: 0 };
        }
        else if (!ready) { readinessDeadline(); initialize(); }
        if (active && ready && inactiveView) {
          // The native inspector restores the complete port set and verifies
          // readback/signature before a ResizeObserver can adopt hidden layout.
          const restore = refreshView('restore', { view: clone(inactiveView) })
            .catch(error => {
              if (error.code === 'review_capture_mismatch') markStale('review_capture_mismatch');
              reportError(error);
            }).finally(() => {
              if (resuming === restore) resuming = null;
              emit(); scheduleRefresh();
            });
          resuming = restore;
        } else if (active && ready) void refreshView().catch(reportError);
      }
    }
    emit();
  }
  function readinessDeadline() {
    clearTimeout(readinessTimer);
    readinessTimer = setTimeout(() => {
      if (active && !ready && !disposed) reportError(Object.assign(new Error(MESSAGES.review_not_ready), { code: 'review_not_ready' }));
    }, 12000);
  }
  function initialize() {
    if (disposed || stale || ready || !active || !frameLoaded || initializing || !frame.clientWidth || !frame.clientHeight) return;
    const currentEpoch = epoch;
    initializing = (async () => {
      const deadline = Date.now() + 8000;
      let cause = 'review_not_ready';
      while (Date.now() < deadline && !disposed) {
        if (!active || !frame.clientWidth || !frame.clientHeight) return;
        try {
          checkEpoch(currentEpoch);
          if (state.view) await refreshView('restore', { view: clone(state.view) });
          else await refreshView();
          checkEpoch(currentEpoch);
          if (!active || !state.view) return;
          ready = true; clearTimeout(readinessTimer); emit(); return;
        } catch (error) {
          if (!TRANSIENT_VIEW.includes(error.code)) throw error;
          cause = error.code;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      // Report the condition the retries actually kept hitting, not a loading
      // state the retried refusals may never have been.
      if (!disposed && active) fail(cause);
    })().catch(error => {
      if (error.code !== 'review_superseded') clearTimeout(readinessTimer);
      if (['review_anchor_invalid', 'review_capture_mismatch'].includes(error.code)) markStale(error.code);
      else reportError(error);
    }).finally(() => {
      initializing = null;
      if (epoch !== currentEpoch && active && !stale) initialize();
    });
  }
  function dispose() {
    if (disposed) return;
    cancelDrag(); supersede(); disposed = true; lifetime.abort(); observer.disconnect();
    clearTimeout(saveTimer); clearTimeout(readinessTimer);
    cancelAnimationFrame(scrollFrame); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(refreshFrame);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(MESSAGES.review_unavailable)); }
    pending.clear(); iframe.src = 'about:blank'; root.remove();
  }
  const events = { signal: lifetime.signal };
  window.addEventListener('message', onResult, events);
  window.addEventListener('blur', cancelDrag, events);
  container.addEventListener('keydown', handleKeyDown, events);
  overlay.addEventListener('blur', cancelDrag, events);
  overlay.addEventListener('pointerdown', pointerDown, events);
  overlay.addEventListener('pointermove', pointerMove, events);
  overlay.addEventListener('pointerleave', () => { hovered = null; refreshAction(); }, events);
  overlay.addEventListener('pointerup', event => { void pointerUp(event); }, events);
  overlay.addEventListener('pointercancel', cancelDrag, events);
  overlay.addEventListener('wheel', wheel, { ...events, passive: false });
  const observer = new ResizeObserver(() => {
    if (!active || resuming || !frame.clientWidth || !frame.clientHeight || disposed) return;
    if (!ready) { initialize(); return; }
    const v = state.view?.viewport;
    if (viewportPinned && v && (v.width !== frame.clientWidth || v.height !== frame.clientHeight)) {
      markStale('review_source_changed', 'The review size changed. Marker positions no longer match this view.');
    }
    else if (!sealing && resizeFrame === null) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null; void refreshView().catch(reportError);
    });
  });
  observer.observe(frame);
  iframe.addEventListener('load', () => {
    if (disposed) return;
    if (ready) { markStale(); return; }
    frameLoaded = true; initialize();
  }, events);
  iframe.src = new URL(review.framePath, location.origin).href;
  readinessDeadline();
  emit();
  return { update, getState, command, handleKeyDown, dispose };
}

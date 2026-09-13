import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Badge, Button, Field, Input, List, ListItem, Menu, MenuDivider, MenuItem, MenuList,
  MenuPopover, MenuTrigger, OverlayDrawer, DrawerHeader,
  DrawerHeaderTitle, DrawerBody, DrawerFooter, Popover, PopoverSurface, PopoverTrigger, Text, Textarea,
  Toolbar, ToolbarButton, ToolbarDivider, ToolbarToggleButton, Tooltip,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular, ArrowUpRightRegular, ArrowUndoRegular, ArrowRedoRegular,
  CheckmarkCircleFilled, CircleRegular, CommentRegular, CursorRegular, DismissRegular, DocumentRegular,
  HighlightRegular, InfoRegular, LineRegular, PanelBottomRegular, PanelLeftRegular,
  ReOrderDotsHorizontalRegular, ReOrderDotsVerticalRegular,
  SaveRegular, SquareRegular, WarningRegular,
} from '@fluentui/react-icons';
import { mergeClasses, useCanvasStyles } from './styles.js';
import { Notice, ResponseStatus, SelectField } from './needs-you.jsx';
import { requestKey } from './use-canvas-data.js';

export function loadReviewEngine() {
  // This fixed same-origin expression stays a runtime import in the single
  // esbuild bundle. The nine adopted static files remain separately shipped.
  const entry = '/review/engine.mjs';
  return import(entry);
}

const TOOLS = [
  ['select', 'Select', CursorRegular, 'V'], ['comment', 'Comment', CommentRegular, 'C'],
  ['box', 'Box', SquareRegular, 'B'], ['circle', 'Circle', CircleRegular, 'O'],
  ['arrow', 'Arrow', ArrowUpRightRegular, 'A'], ['line', 'Line', LineRegular, 'L'],
  ['highlight', 'Highlight', HighlightRegular, 'H'],
];

// Where the palette is parked, as an offset from the current placement's home
// corner. Presentation only, for this open workspace: nothing is stored, and a
// transform keeps the palette out of flow, so parking it never reflows the stage.
const TOOLS_HOME = Object.freeze({ x: 0, y: 0 });
const TOOLS_HOME_SPOT = 'Tools at the default spot.';
const TOOLS_STEP = 16;
const TOOLS_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const TOOLS_CORNERS = [
  ['Top left', 'minX', 'minY'], ['Top right', 'maxX', 'minY'],
  ['Bottom left', 'minX', 'maxY'], ['Bottom right', 'maxX', 'maxY'],
];

/**
 * Keep the palette wholly inside its stage. `offsetLeft`/`offsetTop` are layout
 * positions inside that stage, so the home box stays exact while a move is in
 * flight, and the range always contains zero, so a palette parked over the
 * element being marked can always be brought back.
 */
function toolsLimits(palette, band) {
  if (!palette || !band) return null;
  const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = palette;
  const room = { width: band.clientWidth, height: band.clientHeight };
  if (!offsetWidth || !offsetHeight || !room.width || !room.height) return null;
  return {
    minX: Math.ceil(Math.min(-offsetLeft, 0)), maxX: Math.floor(Math.max(room.width - offsetLeft - offsetWidth, 0)),
    minY: Math.ceil(Math.min(-offsetTop, 0)), maxY: Math.floor(Math.max(room.height - offsetTop - offsetHeight, 0)),
  };
}

function clampToolsOffset(offset, limits) {
  if (!limits) return { ...offset, limits };
  return {
    x: Math.min(Math.max(Math.round(offset.x), limits.minX), limits.maxX),
    y: Math.min(Math.max(Math.round(offset.y), limits.minY), limits.maxY),
    limits,
  };
}

/** Say where the palette landed, and which edge stopped it. */
function describeToolsSpot({ x, y, limits }) {
  const distance = [];
  if (x) distance.push(`${Math.abs(x)} px ${x > 0 ? 'right' : 'left'}`);
  if (y) distance.push(`${Math.abs(y)} px ${y > 0 ? 'down' : 'up'}`);
  const edges = [];
  if (limits) {
    if (y === limits.minY) edges.push('top');
    if (x === limits.maxX) edges.push('right');
    if (y === limits.maxY) edges.push('bottom');
    if (x === limits.minX) edges.push('left');
  }
  const spot = distance.length ? `Tools ${distance.join(' and ')} from the default spot.` : TOOLS_HOME_SPOT;
  return edges.length ? `${spot} At the ${edges.join(' and ')} edge${edges.length > 1 ? 's' : ''}.` : spot;
}

function captureUnavailableReason(capture) {
  if (capture.reason === 'review_browser_missing') return 'No supported browser was found for image capture.';
  const stages = {
    launch: 'A browser was found, but it could not be launched for capture.',
    pipe_read: 'The capture browser response pipe failed.',
    pipe_write: 'The capture browser command pipe failed.',
    protocol: 'The capture browser returned an invalid or failed protocol response.',
    child_exit: 'The capture browser exited before the operation completed.',
    command_timeout: 'The capture browser did not answer a command before its deadline.',
    cleanup: 'Cleanup of the capture browser or its temporary profile could not be confirmed.',
  };
  const stage = capture.detail?.stage;
  const reason = Object.hasOwn(stages, stage) ? stages[stage]
    : capture.reason === 'review_capture_timeout' ? 'Image capture timed out; the failure stage is unknown.'
    : 'Image capture is unavailable; the failure stage is unknown.';
  return capture.detail?.cleanupUncertain === true && stage !== 'cleanup'
    ? `${reason} ${stages.cleanup}` : reason;
}

export function ReviewHistory({ record, onReturn }) {
  const s = useCanvasStyles();
  return <section className={mergeClasses(s.detail, s.stack)} aria-label="Sealed review history">
    <Button className={s.back} icon={<ArrowLeftRegular />} onClick={onReturn}>Back</Button>
    <div className={s.measure}>
      <h1 className={s.title}>Sealed review history</h1>
      <Notice title="Recorded feedback only">
        This report and image belong to the recorded source revision. They do not show the current mock,
        restore a waiting request, or grant permission to send or approve.
      </Notice>
      <Text className={s.code}>{record.preview.artifact.path}{'\n'}{record.preview.artifact.revision}</Text>
      <Text className={s.code}>Submission: {record.submissionId}</Text>
      <img className={s.historyImage} alt={`Annotated mock from sealed submission ${record.submissionId}`}
        src={`data:image/png;base64,${record.image.base64}`} width={record.image.width} height={record.image.height} />
      <h2 className={s.subheading}>Recorded report</h2>
      <pre className={s.prose}>{record.report}</pre>
      <Text className={s.code}>Report: {record.provenance.reportRevision}{'\n'}Image: {record.provenance.imageRevision}</Text>
    </div>
  </section>;
}

/**
 * Fluent chrome around T010's single imperative state/history owner. Back hides
 * this workspace; only replacement/root disposal ends the engine lifetime.
 * review/open is performed by the explicit entry handler, never by this effect.
 */
export function ReviewWorkspace({ entry, active, theme, data, onReturn, onReviewed, onHistory, onRestore }) {
  const s = useCanvasStyles();
  const host = useRef(null), section = useRef(null), engine = useRef(null);
  const [state, setState] = useState(null);
  const [inspector, setInspector] = useState(false);
  const [source, setSource] = useState(false);
  const [details, setDetails] = useState(false);
  // Presentation only, for this open workspace. Nothing is stored, and the
  // palette is out of flow, so neither placement changes the frame geometry.
  const [toolsVertical, setToolsVertical] = useState(true);
  const [toolsSpot, setToolsSpot] = useState(TOOLS_HOME_SPOT);
  const [toolsMenu, setToolsMenu] = useState(false);
  const band = useRef(null), palette = useRef(null);
  const toolsAt = useRef(TOOLS_HOME), toolsDrag = useRef(null), toolsDragged = useRef(false);
  const toolsFrame = useRef(null);
  const moveHint = useId(), reviewHint = useId(), saveHint = useId(), detailsHint = useId(), sendHint = useId();
  const [message, setMessage] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [savedEvidence, setSavedEvidence] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const restoring = useRef(false);
  const sending = useRef(false);
  const commentFields = useRef({});
  const pendingCaret = useRef(null);
  const commentIntent = useRef(false);
  const annotationList = useRef(null), closeComments = useRef(null), commentsAction = useRef(null);
  const retainedFocus = useRef(null);
  const restoredEntryFocus = useRef(false);
  const callbacks = useRef({ onReviewed });
  callbacks.current = { onReviewed };
  const record = data.needs?.requests.find(item => requestKey(data.needs, item) === entry.key);
  const current = record?.phase === 'pending' && !data.issues.needs && data.needs.coverage.state !== 'unavailable';
  const delivered = record?.responseAction === 'annotations' && record.receipt?.current
    && ['awaiting_acknowledgment', 'accepted', 'applied'].includes(record.phase);
  const actionable = Boolean(state?.ready && state.editable && !state.stale && !state.sealing && current && !recovering);
  const restored = entry.restoreRequested && actionable;
  const busy = !actionable || state.busy;
  const saveBlocked = !current || !state?.canSave || state.busy || state.saving || recovering;
  const selected = state?.annotations.find(item => item.id === state.selectedId);
  const currentMessage = message?.error && message.code ? state?.error : message;
  const showMessage = Boolean(currentMessage && (currentMessage.error || state?.error || (!delivered && !data.attempts[entry.key])));
  const messageError = Boolean(currentMessage && (currentMessage.error || state?.error));
  const captureBlocked = Boolean(state?.capture && !state.capture.available);
  const authorityNotice = delivered ? record.phase === 'applied' ? 'Feedback applied' : record.phase === 'accepted'
    ? 'Feedback accepted' : 'Feedback sent; awaiting acknowledgment' : 'This review has no current response authority';
  const noticeTitle = state?.stale ? 'Markup retained' : showMessage && messageError ? 'Review needs attention' : !current ? authorityNotice
    : captureBlocked ? 'Image capture unavailable' : showMessage ? 'Review update' : restored ? 'Recorded view restored' : null;
  const disabledReason = state?.stale ? 'This view changed. Markup is retained; restore the recorded view to check whether editing can resume.'
    : !current ? 'This request is no longer current. Return to the owner context.'
      : state?.sealing ? 'Report and image capture is in progress.'
        : !state?.ready ? 'The exact mock is still loading.' : 'Finish the current annotation or scroll.';
  const saveStatus = state?.saving ? 'Saving working markup…'
    : state?.dirty ? 'Working changes are retained in this tab.' : state?.ready
      ? 'Working markup matches the saved revision.' : 'Waiting for the exact mock.';
  // Office's enhanced ScreenTip: one tip per command that names what the command
  // does and, when it cannot run, says why. The reason has to reach a reviewer
  // who never touches a mouse, so it is tooltip content rather than a native
  // `title`, which Chromium shows on hover only.
  const saveInactive = saveBlocked || !state?.dirty;
  const saveReason = saveBlocked ? disabledReason
    : !state?.dirty ? 'Markup is already saved. Your work is kept as you go, so there is nothing waiting to save.'
      : 'Save markup with its original view. This does not send feedback.';
  const detailsContents = 'Overall review notes, choosing an element to comment on, '
    + "scrolling the mock, the drawing shortcuts, and this request's status.";
  // What this drawer can honestly confirm, split the way review tools split it.
  // GitHub and Gerrit mark each unsent review comment "Pending" beside the
  // comment; Google Docs keeps one save status in persistent chrome. Both facts
  // are true here and neither is "sent": every keystroke commits the text onto
  // the annotation, and the same autosave that Save markup forces writes the
  // working file. The workspace save strip sits behind this drawer's overlay,
  // so a reviewer typing a comment cannot read it. This is that missing answer.
  const selectedNumber = selected ? state.annotations.findIndex(item => item.id === selected.id) + 1 : 0;
  const commentKept = Boolean(selected && actionable && selected.comment.trim());
  const commentStatus = !selected ? ''
    : !actionable ? 'Editing is paused. Your markup is retained.'
      : !commentKept ? `Annotation ${selectedNumber} has no comment.`
        : state.dirty ? `Comment kept on annotation ${selectedNumber}. Markup not saved yet.`
          : `Comment kept on annotation ${selectedNumber}. Markup saved.`;
  const hiddenIds = state?.hiddenIds || [];
  const blockers = (state?.annotations || []).flatMap((annotation, index) =>
    hiddenIds.includes(annotation.id)
      ? [{ id: annotation.id, number: index + 1 }] : []);
  const sendingNow = submission?.phase === 'capturing' || submission?.phase === 'sending';
  const annotationBlocked = submission?.code === 'review_outside_viewport';
  const attempt = data.attempts[entry.key];
  const actionError = messageError ? currentMessage : submission?.phase === 'failed' && !annotationBlocked
    ? { message: attempt?.message || submission.message } : null;
  // Local delivery is a past fact; the current receipt still owns its outcome.
  const receiptOutcome = record?.receipt?.acknowledgment?.outcome;
  const sentStale = state?.stale || record?.phase === 'source_changed' || record?.receipt?.freshness === 'stale';
  const sentUnavailable = !record || data.issues.needs || data.needs?.coverage.state === 'unavailable'
    || record?.receipt?.current === false || record?.phase === 'unavailable';
  // Form validation: explain the failed action beside it, identify the current
  // invalid entries, and link to their existing editor. Never freeze row numbers
  // in an error string; correcting or deleting a mark changes this answer.
  const feedback = sendingNow ? {
    title: submission.phase === 'capturing' ? 'Preparing annotations' : 'Sending annotations',
    text: submission.phase === 'capturing' ? 'Checking the view and capturing the annotated image…'
      : 'Delivering the report and image to the waiting owner…',
  } : submission?.phase === 'sent' ? {
    title: sentStale ? 'Feedback sent; context changed' : sentUnavailable ? 'Feedback sent; current authority unavailable'
      : receiptOutcome === 'declined' ? 'Feedback sent; declined' : receiptOutcome === 'deferred' ? 'Feedback sent; deferred'
        : delivered ? authorityNotice : 'Feedback sent; awaiting acknowledgment',
    text: [
      'The report and image were delivered. Sending feedback did not approve the design.',
      sentStale ? `${state?.stale ? state.staleReason : 'The source changed.'} Your markup and sealed evidence are retained; return to the owner context.`
        : sentUnavailable ? `${receiptOutcome === 'unavailable' ? 'The owner reported this response as unavailable. ' : ''}Your markup and sealed evidence are retained. Return to the owner context to check the request; nothing will be resent automatically.`
          : receiptOutcome === 'declined' ? 'The owner declined this response. Your markup and sealed evidence are retained. A fresh request is needed before responding again.'
            : receiptOutcome === 'deferred' ? 'The owner recorded a source-backed deferral. It remains discoverable in the recorded context. Your markup and sealed evidence are retained.'
              : null,
    ].filter(Boolean).join(' '),
    error: sentStale || sentUnavailable || receiptOutcome === 'declined',
  } : state?.stale ? {
    title: 'Send unavailable', text: state.staleReason, error: true,
  } : !current && !delivered ? {
    title: 'Send unavailable',
    text: 'This request is no longer waiting. Your markup is retained; return to the owner context.', error: true,
  } : actionError && actionError.code !== 'review_outside_viewport' ? {
    title: actionError.code === 'review_drawing_outside' ? 'Drawing needs more room'
      : submission?.phase === 'failed' && !submission.code ? 'Delivery not confirmed' : 'Annotations not sent',
    text: actionError.message, error: true,
  } : annotationBlocked && blockers.length ? {
    title: 'Send blocked',
    text: `Annotation${blockers.length === 1 ? '' : 's'} ${blockers.map(item => item.number).join(', ')} ${blockers.length === 1 ? 'is' : 'are'} not fully visible and cannot be captured. Edit their coordinates or delete them in Comments.`,
    error: true, inspect: true,
  } : captureBlocked ? {
    title: 'Annotations not sent',
    text: `${captureUnavailableReason(state.capture)} The report requires an annotated image. Your markup is retained.`, error: true,
  } : null;

  // One way in to the comment editor, shared by everything that reveals an
  // annotation there: a new comment marker, the engine's double-press and Enter
  // gesture, and Inspect annotations. The existing caret effects then focus the
  // selected annotation's field and bring its row into view. Only the explicit
  // "open this comment" gesture names the comment field itself, because that is
  // what it asked for; every other way in returns to the remembered field.
  const revealComments = (forComment = false) => {
    if (forComment) commentIntent.current = true;
    setDetails(false);
    setInspector(true);
  };

  useLayoutEffect(() => {
    setMessage(null);
    setSubmission(null);
    restoredEntryFocus.current = false;
    const mounted = entry.module.mountReview(host.current, {
      review: entry.review, requestHandle: entry.record.requestHandle,
      revision: entry.record.request.revision, theme,
      onChange: value => {
        setState(value);
        callbacks.current.onReviewed(entry.key, Boolean(value.ready && !value.stale && value.editable));
      },
      onMessage: value => {
        setMessage(value);
        // The engine has already selected the annotation it names, so opening
        // this list is the whole answer for both codes. Only the gesture that
        // asked for a comment claims the comment field.
        if (['review_comment_added', 'review_comment_open'].includes(value.code)) {
          revealComments(value.code === 'review_comment_open');
        }
      },
    });
    engine.current = mounted;
    return () => { mounted.dispose(); engine.current = null; };
  }, [entry]);

  useEffect(() => {
    engine.current?.update({
      active, theme, unavailable: !current,
      requestHandle: record?.requestHandle || entry.record.requestHandle,
      revision: record?.request.revision || entry.record.request.revision,
      preview: record?.request.fields || entry.record.request.fields,
    });
    if (!current) callbacks.current.onReviewed(entry.key, false);
  }, [active, theme, current, record?.requestHandle, record?.request.revision, record?.request.fields, entry]);

  useEffect(() => {
    if (!active) { restoredEntryFocus.current = false; return; }
    if (!state?.ready || restoredEntryFocus.current) return;
    restoredEntryFocus.current = true;
    if (inspector) return;
    const node = retainedFocus.current;
    if (node?.isConnected && !node.disabled) {
      node.focus({ preventScroll: true });
      if (selected && node instanceof HTMLTextAreaElement) {
        entry.module.restoreCaret(node, state.caret, selected.id, state.caret?.field);
      }
    } else section.current?.querySelector('[data-review-return]')?.focus({ preventScroll: true });
    // Restore on explicit return to Review, not after each annotation render.
  }, [active, Boolean(state?.ready)]);

  useEffect(() => {
    if (!active || actionable) return;
    const focused = document.activeElement;
    if (section.current?.contains(focused) && focused?.disabled) {
      section.current.querySelector('[data-review-return]')?.focus({ preventScroll: true });
    }
  }, [active, actionable]);

  useEffect(() => {
    if (!inspector || !active) { pendingCaret.current = null; commentIntent.current = false; return; }
    // Record the intent when the drawer opens, from the engine's canonical
    // caret. Selecting or deleting through the annotation list must keep
    // keyboard focus on that list, so nothing re-arms while it stays open.
    // A caret left in a suggested replacement or style field belongs to that
    // field on every ordinary reopen, but never to the gesture that asked for
    // this annotation's comment. Its stored range still applies in place.
    const comment = commentIntent.current;
    commentIntent.current = false;
    pendingCaret.current = selected
      ? { id: selected.id, caret: state.caret,
        field: !comment && state.caret?.id === selected.id ? state.caret.field : 'comment' }
      : null;
  }, [inspector, active, entry]);

  useEffect(() => {
    const pending = pendingCaret.current;
    if (!pending || !inspector || !active) return;
    if (pending.id !== selected?.id) { pendingCaret.current = null; return; }
    const node = commentFields.current[pending.field];
    if (!node?.isConnected) return;
    // A reopened workspace re-reads its source, so Fluent can mount this exact
    // field disabled before the engine reports ready again. A range needs no
    // editable field, so restore it as soon as the field exists and keep the
    // intent until that field can take focus, instead of timing the drawer.
    entry.module.restoreCaret(node, pending.caret, pending.id, pending.field);
    if (node.disabled) return;
    pendingCaret.current = null;
    node.focus({ preventScroll: true });
  }, [inspector, active, actionable, selected?.id]);

  // Keep the marked row in view, the way a mail list or a layers panel reveals
  // the item its detail pane is describing. The list owns its own scrollport,
  // so this never moves the editor, and `nearest` leaves a visible row alone.
  useEffect(() => {
    if (!inspector || !active || !selected) return;
    annotationList.current?.querySelector(`[data-annotation-id="${selected.id}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [inspector, active, selected?.id]);

  // Recover a parked palette if the stage itself gets shorter or narrower. This
  // only reads geometry and rewrites a transform; it never sizes the frame.
  useEffect(() => {
    const stage = band.current;
    if (!stage) return undefined;
    const observer = new ResizeObserver(() => {
      const current = toolsAt.current;
      const limits = toolsLimits(palette.current, stage);
      if (toolsDrag.current) toolsDrag.current.limits = limits;
      if (!current.x && !current.y) return;
      const next = clampToolsOffset(current, limits);
      if (next.x === current.x && next.y === current.y) return;
      paintTools(next);
      setToolsSpot(describeToolsSpot(next));
    });
    observer.observe(stage);
    return () => { observer.disconnect(); cancelAnimationFrame(toolsFrame.current); };
  }, []);

  const paintTools = next => {
    toolsAt.current = { x: next.x, y: next.y };
    if (!palette.current) return;
    // The drag owns just this transform. No inherited CSS variables, React
    // renders, layout reads, or live-region text changes on pointer movement.
    palette.current.style.transform = `translate(${next.x}px, ${next.y}px)`;
    palette.current.dataset.reviewToolsOffset = `${next.x},${next.y}`;
  };
  const parkTools = desired => {
    const next = clampToolsOffset(desired, toolsLimits(palette.current, band.current));
    paintTools(next);
    setToolsSpot(describeToolsSpot(next));
  };
  const parkToolsAtCorner = (x, y) => {
    // Use the actual layout limits, not guessed destinations that the clamp
    // would override. Each named corner is reachable in either orientation.
    const limits = toolsLimits(palette.current, band.current);
    if (limits) parkTools({ x: limits[x], y: limits[y] });
  };
  const startToolsMove = event => {
    if (event.button !== 0 || !event.isPrimary || !palette.current || !band.current) return;
    // Capture on the grip itself. The engine draws from its own overlay, so a
    // captured palette drag can never reach the annotation surface.
    event.currentTarget.setPointerCapture(event.pointerId);
    toolsDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      origin: toolsAt.current, desired: toolsAt.current, limits: toolsLimits(palette.current, band.current), moved: false };
  };
  const continueToolsMove = event => {
    const drag = toolsDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.moved && toolsMenu) setToolsMenu(false);
    drag.moved = true;
    drag.desired = { x: drag.origin.x + dx, y: drag.origin.y + dy };
    if (toolsFrame.current === null) toolsFrame.current = requestAnimationFrame(() => {
      toolsFrame.current = null;
      if (toolsDrag.current) paintTools(clampToolsOffset(toolsDrag.current.desired, toolsDrag.current.limits));
    });
  };
  const endToolsMove = event => {
    const drag = toolsDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    cancelAnimationFrame(toolsFrame.current); toolsFrame.current = null;
    if (drag.moved) {
      const next = clampToolsOffset(drag.desired, drag.limits);
      paintTools(next);
      setToolsSpot(describeToolsSpot(next));
    }
    toolsDrag.current = null;
    toolsDragged.current = drag.moved;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const moveToolsByKey = event => {
    const step = TOOLS_KEYS[event.key];
    const reset = ['Home', 'Enter', ' '].includes(event.key);
    if (!step && !reset) return;
    // Stop here: arrow and Home keys move the palette, they never reach the
    // engine's shortcuts or scroll the mock.
    event.preventDefault();
    event.stopPropagation();
    const scale = event.shiftKey ? TOOLS_STEP * 3 : TOOLS_STEP;
    parkTools(step ? { x: toolsAt.current.x + step[0] * scale, y: toolsAt.current.y + step[1] * scale } : TOOLS_HOME);
  };

  const command = async action => {
    try { return await engine.current.command(action); }
    catch (error) { setMessage({ error: true, message: error.message, code: error.code }); return null; }
  };
  const inspectBlockers = async () => {
    const issue = blockers.find(item => item.id === state.selectedId) || blockers[0];
    // Leave an already-selected issue and its caret alone. Opening Comments
    // then follows the same focus restoration as its ordinary toolbar action.
    if (issue && issue.id !== state.selectedId) await command({ type: 'select', id: issue.id });
    revealComments();
  };

  const remember = (element, id, field) => {
    if (!actionable) return;
    // A field that mounts before its pending restore reports the browser's own
    // empty range; that must never replace the remembered caret.
    const pending = pendingCaret.current;
    if (pending?.id === id && pending.field === field) return;
    void command({ type: 'caret', caret: entry.module.rememberCaret(element, id, field) });
  };
  const returnToWork = () => {
    retainedFocus.current = document.activeElement;
    setToolsMenu(false);
    setInspector(false);
    setSource(false);
    setDetails(false);
    engine.current.update({ active: false });
    onReturn();
  };
  // Finishing with the comment list is not a commit: the text is already on
  // the annotation. Fluent restores focus to whatever the overlay took it
  // from, so claim it back on the next frame for the control that reopens
  // this list. No caret is touched, and no field is focused here.
  const finishComments = () => {
    setInspector(false);
    requestAnimationFrame(() => commentsAction.current?.focus({ preventScroll: true }));
  };
  const restoreRecordedView = async () => {
    if (restoring.current || !current || !state?.stale || state.busy || state.sealing) return;
    restoring.current = true; setRecovering(true);
    try {
      // Save the original state, including its viewport and scroll bases, before
      // the guarded opening can replace this engine. Failure keeps this tab.
      await engine.current.command({ type: 'save' });
      await onRestore(record);
    } catch (error) {
      setMessage({ error: true, message: `${error.message} The recorded view was not restored. Your markup remains in this tab.` });
      setDetails(true);
    } finally {
      restoring.current = false; setRecovering(false);
    }
  };
  const send = async () => {
    if (sending.current || busy || !state.capture?.available || !state.annotations.length) return;
    sending.current = true;
    setSubmission({ phase: 'capturing' });
    try {
      // seal returns the exact adapter-validated response; never manufacture
      // annotations from the prototype schema or call the owner's ack tool.
      const sealed = await engine.current.command({ type: 'seal' });
      setSavedEvidence(sealed.submissionId);
      setSubmission({ phase: 'sending' });
      const result = await data.respond(entry.record, sealed.response);
      setSubmission(result?.receipt ? { phase: 'sent' } : {
        phase: 'failed', message: 'Delivery was not confirmed. Return to the owner context to check the request. Nothing will be resent automatically.',
      });
    } catch (error) {
      setSubmission({ phase: 'failed', code: error.code, message: error.message });
    } finally {
      sending.current = false;
      data.reconcile();
    }
  };
  const commentField = (field, label) => <Field label={label} key={`${selected.id}-${field}`}>
    <Textarea ref={node => { commentFields.current[field] = node; }} className={s.control} rows={field === 'comment' ? 4 : 2}
      value={selected[field]} disabled={!actionable}
      onChange={(_, input) => void command({ type: 'edit', id: selected.id, changes: { [field]: input.value } })}
      onSelect={event => remember(event.target, selected.id, field)}
      onBlur={event => remember(event.target, selected.id, field)}
      onFocus={event => entry.module.restoreCaret(event.target, state.caret, selected.id, field)} />
  </Field>;

  return <section ref={section} className={mergeClasses(s.review, !active && s.hidden)}
    aria-label="Review workspace" data-review-workspace
    onKeyDown={event => engine.current?.handleKeyDown(event)}>
    <header className={s.reviewBar}>
      <Button data-review-return className={s.reviewBarItem} icon={<ArrowLeftRegular />} onClick={returnToWork}>Back</Button>
      <h1 className={s.reviewPrompt} title={entry.record.request.prompt}>{entry.record.request.prompt}</h1>
      <Badge className={s.reviewBarItem} appearance="tint" color={state?.stale ? 'warning' : 'informative'}>
        {state?.stale ? 'Stale source' : savedEvidence || state?.status === 'sealed' ? 'Sealed evidence' : state?.ready ? 'Review' : 'Loading mock'}
      </Badge>
      <Popover open={source} onOpenChange={(_, input) => setSource(input.open)}>
        <PopoverTrigger disableButtonEnhancement>
          <Button appearance="subtle" className={s.reviewBarItem} icon={<DocumentRegular />}>Source</Button>
        </PopoverTrigger>
        <PopoverSurface>
          <div className={s.sourceDetails}>
            <Text weight="semibold">Reviewed source</Text>
            <Text className={s.code}>{entry.review.preview.artifact.path}{'\n'}{entry.review.preview.artifact.revision}</Text>
          </div>
        </PopoverSurface>
      </Popover>
    </header>
    <div className={s.workspace}>
      <div className={s.reviewActions}>
        {/* The reason travels with the command, not with the status strip, so a
            notice occupying that strip cannot displace it. `relationship`
            "description" keeps the same sentence in the accessible description
            whether or not the tip is on screen; an explicit description wins
            over `title` anyway, which is how the reason went missing before. */}
        <Tooltip withArrow relationship="description" positioning="below"
          content={{ id: saveHint, children: saveReason }}>
          <Button size="small" icon={<SaveRegular />} disabledFocusable={saveInactive}
            aria-describedby={saveHint}
            onClick={() => void command({ type: 'save' })}>Save markup</Button>
        </Tooltip>
        <Button size="small" icon={<CommentRegular />} ref={commentsAction}
          onClick={() => setInspector(true)}>Comments ({state?.annotations.length || 0})</Button>
        <Popover open={details && active} onOpenChange={(_, input) => setDetails(input.open)}
          positioning={{ position: 'below', align: 'start', autoSize: 'height', overflowBoundaryPadding: 8 }}>
          {/* Named after the one thing kept here that exists nowhere else, plus
              the overflow wording Edge uses for "Settings and more". The tip
              lists the rest, which costs this popover no height: growing it
              pushes the element picker out of a short panel. Same enhanced
              ScreenTip treatment as Save, so the contents preview reaches a
              keyboard reviewer too. */}
          <PopoverTrigger disableButtonEnhancement>
            <Tooltip withArrow relationship="description" positioning="below"
              content={{ id: detailsHint, children: detailsContents }}>
              <Button size="small" aria-describedby={detailsHint}>Notes and more</Button>
            </Tooltip>
          </PopoverTrigger>
          <PopoverSurface className={s.reviewDetails} tabIndex={-1} aria-label="Notes and more">
            <div className={s.stage}>
              {state?.stale && <Notice intent="warning" title="Review changed">
                {state.staleReason} Markers are hidden. Your markup and notes are retained with their original view;
                nothing was moved or sent. Restore the recorded view to check whether editing can resume.
                Your work is saved first, in the same submission. The original source, theme, display scale, and anchors must still match.
              </Notice>}
              {showMessage && <Notice intent={messageError ? 'warning' : 'info'}
                title={messageError ? 'Review needs attention' : 'Review update'}>{currentMessage.message}</Notice>}
              {restored && <Notice title="Recorded view restored">
                Your annotations match their recorded viewport, source, and anchors. You can edit this same submission again.
                Nothing was sent or approved.
              </Notice>}
              {!current && <Notice intent={delivered ? record.phase === 'applied' ? 'success' : 'info' : 'warning'}
                title={authorityNotice}>
                {delivered ? 'The original owner received this sealed submission. Its receipt is below. The evidence is read-only; sending feedback did not approve the design.'
                  : 'The request was consumed, changed, or became unavailable. Your markup remains here; it will not be retargeted or resent.'}
              </Notice>}
              {captureBlocked && <Notice intent="warning" title="Image capture unavailable">
                {captureUnavailableReason(state.capture)}{' '}
                Review cannot send report-only feedback. Working annotations are retained.
              </Notice>}
              <div className={s.picker}>
                <div className={s.pickerField}>
                  <SelectField label="Choose an element" value={state?.target?.selector}
                    disabled={busy} options={(state?.targets || []).map(target => [target.selector, target.label || target.selector])}
                    onChange={selector => void command({ type: 'element', selector })} />
                </div>
                <Button disabled={busy || !state?.target} onClick={async () => {
                  const result = await command({ type: 'addComment' });
                  if (result) revealComments();
                }}>Add comment</Button>
                <Button disabled={busy || !['box', 'circle', 'arrow', 'line', 'highlight'].includes(state?.tool)}
                  onClick={() => void command({ type: 'addAtCenter' })}>Add at center</Button>
                <Button disabled={busy || !state?.view || state.view.viewport.scrollY === 0}
                  onClick={() => void command({ type: 'scroll', x: state.view.viewport.scrollX,
                    y: Math.max(0, state.view.viewport.scrollY - state.view.viewport.height * 0.8) })}>Scroll mock up</Button>
                <Button disabled={busy || !state?.view
                  || state.view.viewport.scrollY + state.view.viewport.height >= state.view.viewport.documentHeight}
                  onClick={() => void command({ type: 'scroll', x: state.view.viewport.scrollX,
                    y: state.view.viewport.scrollY + state.view.viewport.height * 0.8 })}>Scroll mock down</Button>
              </div>
              <Text className={s.eyebrow}>{saveStatus}</Text>
              <Text className={s.eyebrow}>Draw on the mock, or choose an element and add a comment. Comments holds keyboard-editable geometry.
                With Select, double-click an annotation or its number to write its comment; with one selected, Enter on the mock does the same.
                V select · C comment · B box · O circle · A arrow · L line · H highlight · Ctrl/⌘ Z undo.</Text>
              <Text className={s.eyebrow}>The Move tools grip parks the palette clear of the element you are marking.
                Drag it, click it to choose a corner, or focus it and press the arrow keys.</Text>
              <Text className={s.eyebrow}>The mock keeps its size after the first annotation.
                In a smaller panel, focus Review viewport and use arrow keys to pan.
                Scrolling on the mock still scrolls its content.</Text>
              <Field label="Overall review notes">
                <Textarea value={state?.notes || ''} className={s.control} rows={3} disabled={!actionable}
                  onChange={(_, input) => void command({ type: 'notes', text: input.value })} />
              </Field>
              {record && <ResponseStatus record={record} attempt={data.attempts[entry.key]} />}
              {(savedEvidence || state?.status === 'sealed') && <div className={s.stack}>
                <Notice title="Immutable feedback evidence">
                  Sealing alone is not delivery or approval. The request receipt above records delivery and the owner's acknowledgment.
                </Notice>
                <Button className={s.back} onClick={() => onHistory(entry.record.request.scope, savedEvidence || entry.review.submissionId)}>
                  View sealed feedback
                </Button>
              </div>}
            </div>
          </PopoverSurface>
        </Popover>
        <Button appearance="primary" size="small" className={s.sendAction}
          disabled={busy || sendingNow || !state?.capture?.available || !state?.annotations.length}
          title={busy ? disabledReason : !state?.capture?.available ? 'Image capture is unavailable. Markup is retained.'
            : !state?.annotations.length ? 'Add an annotation before sending.' : 'Send the checked report and annotated image. This does not approve the design.'}
          aria-describedby={`${reviewHint} ${sendHint}`}
          onClick={() => void send()}>Send annotations</Button>
        {/* Out of flow, so an error or progress update never changes the
            reviewed viewport. This live region stays mounted at the action. */}
        <div className={s.reviewFeedback} id={sendHint} data-review-feedback role="status" aria-atomic="true">
          {feedback && <Notice intent={feedback.error ? 'warning' : 'info'} title={feedback.title}>
            <div className={s.reviewFeedbackBody}>
              <div className={s.tight}>
                <Text>{feedback.text}</Text>
                {feedback.inspect && <Button size="small" className={s.back} onClick={() => void inspectBlockers()}>
                  Inspect annotations
                </Button>}
              </div>
              {!sendingNow && (actionable || submission?.phase === 'sent') && <Button
                appearance="subtle" size="small" icon={<DismissRegular />} aria-label="Dismiss message"
                onClick={() => {
                  setMessage(null); setSubmission(null);
                  (actionable ? host.current?.querySelector('.dude-review-overlay') : commentsAction.current)
                    ?.focus({ preventScroll: true });
                }} />}
            </div>
          </Notice>}
        </div>
      </div>
      <div ref={band} className={s.canvasBand}>
        <div ref={host} className={s.engineHost} data-review-engine-host />
        {/* A click outside the menu dismisses it without starting a mark.
            This stage-only layer is out of flow and below the palette. */}
        {toolsMenu && active && <div className={s.toolsMenuDismiss} data-review-tools-dismiss aria-hidden="true"
          onPointerDown={event => event.preventDefault()} onClick={() => setToolsMenu(false)} />}
        <div ref={palette} data-review-tools data-review-tools-offset="0,0"
          className={mergeClasses(s.drawingToolbar, toolsVertical ? s.drawingToolbarVertical : s.drawingToolbarHorizontal)}>
          {/* A grab strip, not a tool slot. It stays outside the scroller with
              the orientation switch, so tools parked over the element being
              marked are always reachable again by pointer or keyboard. */}
          {/* Beside the grip, Fluent can shift the whole menu up in a short
              pane; above/below can both lack room when tools are near the top. */}
          <Menu open={toolsMenu && active} onOpenChange={(event, input) => {
            if (!event.defaultPrevented) setToolsMenu(input.open);
          }} positioning={{ position: 'after', align: 'top', overflowBoundaryPadding: 8 }}>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" size="small" data-review-tools-grip
                className={mergeClasses(s.toolGrip, toolsVertical ? s.toolGripVertical : s.toolGripHorizontal)}
                icon={toolsVertical ? <ReOrderDotsHorizontalRegular /> : <ReOrderDotsVerticalRegular />}
                aria-label="Move tools" aria-describedby={moveHint}
                title="Move tools. Click for positions, drag, or use arrow keys. Hold Shift for a longer step. Enter, Space, or Home resets."
                onPointerDown={startToolsMove} onPointerMove={continueToolsMove}
                onPointerUp={endToolsMove} onPointerCancel={endToolsMove} onLostPointerCapture={endToolsMove}
                onKeyDown={moveToolsByKey}
                onClick={event => {
                  if (toolsDragged.current) {
                    toolsDragged.current = false;
                    event.preventDefault();
                  }
                }} />
            </MenuTrigger>
            <MenuPopover data-review-tools-menu onKeyDown={event => event.stopPropagation()}
              onClick={event => event.stopPropagation()}>
              <MenuList aria-label="Tool positions">
                {TOOLS_CORNERS.map(([label, x, y]) => <MenuItem key={label}
                  onClick={() => parkToolsAtCorner(x, y)}>{label}</MenuItem>)}
                <MenuDivider />
                <MenuItem onClick={() => parkTools(TOOLS_HOME)}>Reset to default spot</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Toolbar vertical={toolsVertical} aria-label="Annotation tools" checkedValues={{ tool: [state?.tool || 'select'] }}
            className={mergeClasses(s.drawingTools, toolsVertical ? s.drawingToolsVertical : s.drawingToolsHorizontal)}>
            {TOOLS.map(([tool, label, Icon, shortcut]) => <ToolbarToggleButton key={tool}
              className={s.toolButton} name="tool" value={tool} icon={<Icon />} disabled={busy}
              aria-label={`${label} (${shortcut})`} title={busy ? disabledReason : `${label} (${shortcut})`}
              aria-describedby={busy ? reviewHint : undefined}
              onClick={() => void command({ type: 'tool', tool })} />)}
            <ToolbarDivider />
            <ToolbarButton className={s.toolButton} icon={<ArrowUndoRegular />} aria-label="Undo annotation" disabled={busy || !state?.canUndo}
              onClick={() => void command({ type: 'undo' })} />
            <ToolbarButton className={s.toolButton} icon={<ArrowRedoRegular />} aria-label="Redo annotation" disabled={busy || !state?.canRedo}
              onClick={() => void command({ type: 'redo' })} />
          </Toolbar>
          {/* Keep the presentation switch outside the tool scroller. It remains
              reachable at either scroll end, even while the engine is busy. */}
          <Button appearance="subtle" className={s.toolButton} icon={toolsVertical ? <PanelBottomRegular /> : <PanelLeftRegular />}
            aria-label={toolsVertical ? 'Switch tools to horizontal' : 'Switch tools to vertical'}
            title={toolsVertical ? 'Switch tools to horizontal' : 'Switch tools to vertical'}
            onClick={() => {
              // Each placement anchors to its own corner, so start it there.
              setToolsMenu(false);
              setToolsVertical(value => !value);
              paintTools(TOOLS_HOME);
              setToolsSpot(TOOLS_HOME_SPOT);
            }} />
          <span id={moveHint} className={s.visuallyHidden}>
            Click or tap to choose a corner or reset the tools. Drag to park them elsewhere.
            Arrow keys move 16 px; hold Shift for 48 px. Enter, Space, or Home returns them to the default spot.
          </span>
          <span role="status" className={s.visuallyHidden}>{toolsSpot}</span>
        </div>
      </div>
      <div className={s.reviewStatus} role="status" id={reviewHint}>
        {noticeTitle ? <Button size="small" appearance="subtle" className={s.reviewNotice}
          icon={state?.stale || captureBlocked || (showMessage && messageError) || (!current && !delivered) ? <WarningRegular /> : <InfoRegular />}
          aria-label={`Read review notice: ${noticeTitle}`} onClick={() => setDetails(true)}>
          <span className={s.statusText}>{state?.stale ? noticeTitle : `${noticeTitle}. Read notice`}</span>
        </Button> : <Text className={mergeClasses(s.eyebrow, s.statusText)}>{saveStatus}</Text>}
        {state?.stale && current && <Button size="small" className={s.back}
          disabled={recovering || state.busy || state.sealing}
          title="Save the original markup, then restore and check its recorded view in the same submission. Nothing is sent."
          onClick={() => void restoreRecordedView()}>{recovering ? 'Restoring…' : 'Restore recorded view'}</Button>}
      </div>
    </div>
    <OverlayDrawer open={inspector && active} position="end" className={s.drawer}
      onOpenChange={(_, input) => setInspector(input.open)}>
      <DrawerHeader><DrawerHeaderTitle action={<Button ref={closeComments} appearance="subtle" icon={<DismissRegular />}
        aria-label="Close comments" title="Close this list. Your comments stay on their annotations."
        onClick={() => setInspector(false)} />}>Comments and geometry</DrawerHeaderTitle></DrawerHeader>
      <DrawerBody className={s.drawerBody}>
        <Text>Each annotation can be selected and edited here without dragging a small handle.
          Comments are kept as you type. Sending them is a separate action.</Text>
        <List ref={annotationList} className={s.annotationList} navigationMode="items" aria-label="Annotations">
          {(state?.annotations || []).map((annotation, index) => {
            const marked = annotation.id === selected?.id;
            const hidden = hiddenIds.includes(annotation.id);
            return <ListItem key={annotation.id}
              className={mergeClasses(s.workItem, s.annotationItem, marked && s.annotationItemSelected)}
              data-annotation-id={annotation.id} aria-current={marked ? 'true' : undefined}
              onAction={actionable ? () => void command({ type: 'select', id: annotation.id }) : undefined}
              aria-label={`Annotation ${index + 1}: ${annotation.tool}${annotation.comment ? `. ${annotation.comment}` : ''}${hidden ? '. Outside view; blocks Send' : ''}`}>
              <span className={s.tight}>
                <Text weight="semibold" className={marked ? s.annotationSelectedLabel : undefined}>
                  {index + 1}. {annotation.tool}</Text>
                <Text className={s.prose}>{annotation.comment || 'No comment'}</Text>
                {hidden && <Text>Outside view; blocks Send</Text>}</span>
            </ListItem>;
          })}
        </List>
        {selected ? <div className={s.commentEditor} key={selected.id}>
          {/* The pending marker review tools put beside the comment itself.
              It names the fact that "saved" alone could be misread as: this is
              held here and has gone nowhere. It shares the existing heading
              row, so it adds no line to a short panel. */}
          <div className={s.selectionHeading}>
            <Text weight="semibold">Selected annotation</Text>
            {actionable && <Badge className={s.selectionState} size="small" appearance="tint" color="informative">Not sent</Badge>}
          </div>
          {hiddenIds.includes(selected.id) && <Text>
            This annotation cannot be captured in this view. Edit its coordinates below or delete it.
          </Text>}
          {commentField('comment', 'Comment (optional)')}
          {selected.element && <>
            <Text className={s.code}>{selected.element.selector}</Text>
            <p className={s.prose}>{selected.element.text}</p>
            {commentField('replacement', 'Suggested replacement text')}
            {commentField('styleNote', 'Suggested style change')}
          </>}
          <div className={s.geometry}>
            {['x1', 'y1', ...(selected.tool === 'comment' ? [] : ['x2', 'y2'])].map(field => <Field label={field.toUpperCase()} key={field}>
              <Input className={s.control} key={`${selected.id}-${field}-${selected[field]}`} type="number" min={0} step={1}
                defaultValue={String(selected[field])} disabled={!actionable}
                onBlur={event => {
                  if (event.target.value !== '' && Number(event.target.value) !== selected[field]) {
                    void command({ type: 'edit', id: selected.id, changes: { [field]: Number(event.target.value) } });
                  }
                }} />
            </Field>)}
          </div>
          <Button disabled={busy} onClick={async () => {
            await command({ type: 'delete', id: selected.id });
            requestAnimationFrame(() => {
              const target = annotationList.current?.querySelector('[data-annotation-id]') || closeComments.current;
              target?.focus({ preventScroll: true });
            });
          }}>Delete annotation</Button>
        </div> : <Text>Choose an annotation, or add one on the mock.</Text>}
      </DrawerBody>
      {/* Out of the scroller, so a short panel can never bury the answer or the
          way out. The dismiss stays in the header for a quick exit. */}
      <DrawerFooter className={s.drawerFooter}>
        <Button appearance="primary" data-review-comments-done
          title="Close this list. Comments stay on their annotations. Sending them is a separate action."
          onClick={finishComments}>Done</Button>
        {/* Mounted for the whole drawer, so its wording changes in place and a
            screen reader hears the answer instead of an inserted region. */}
        <div className={s.commentStatus} role="status" data-review-comment-status>
          {commentKept && <CheckmarkCircleFilled className={s.commentStatusMark} aria-hidden="true" />}
          <Text className={s.eyebrow}>{commentStatus}</Text>
        </div>
      </DrawerFooter>
    </OverlayDrawer>
  </section>;
}

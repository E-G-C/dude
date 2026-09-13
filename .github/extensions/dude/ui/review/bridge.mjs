// The sandbox has no parent DOM, credentials, or mutation authority.
// This bridge answers bounded READ/geometry commands. Its messages are data,
// not proof of fidelity; capture independently inspects an isolated DOM world.
import { createInspector } from './inspector.mjs';

const inspector = createInspector(document, window);
let channel = null, origin = null, notification = null, work = Promise.resolve();
const lifetime = new AbortController();
const pair = (value, signed = false) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 2 && [value.x, value.y].every(n => Number.isFinite(n)
    && n >= (signed ? -1000000 : 0) && n <= 1000000);
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin === 'null') return;
  const data = event.data;
  if (!data || data.type !== 'dude-review-query' || typeof data.channel !== 'string'
    || !/^[a-f0-9-]{36}$/.test(data.channel) || !Number.isSafeInteger(data.id) || data.id < 1
    || channel && (data.channel !== channel || event.origin !== origin)) return;
  try {
    if (new TextEncoder().encode(JSON.stringify(data)).length > (data.op === 'restore' ? 512 * 1024 : 4096)) return;
  } catch { return; }
  const keys = Object.keys(data).length;
  const selector = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
  if (!(data.op === 'view' && keys === 4
    || data.op === 'at' && keys === 6 && pair({ x: data.x, y: data.y })
    || data.op === 'selector' && keys === 5 && selector(data.selector)
    || data.op === 'restore' && keys === 5 && data.view
    || data.op === 'scroll' && (
      keys === 6 && pair({ x: data.x, y: data.y })
      || keys === 6 && pair(data.point) && pair(data.delta, true)
      || keys === 7 && pair(data.point) && (data.selector === null || selector(data.selector))
        && ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(data.key)
    ))) return;
  channel = data.channel; origin = event.origin;
  // Serialize geometry reads with the two layout turns needed by scroll/restore.
  work = work.then(async () => {
    if (lifetime.signal.aborted) return;
    let result, error;
    try {
      if (data.op === 'view') result = await inspector.readView();
      else if (data.op === 'at') result = inspector.describeAt(data.x, data.y);
      else if (data.op === 'selector') result = inspector.describeSelector(data.selector);
      else if (data.op === 'restore') result = await inspector.restoreView(data.view);
      else result = await inspector.scroll(data);
    } catch (cause) {
      const allowed = ['review_not_ready', 'review_anchor_invalid', 'review_element_too_large',
        'review_document_too_large', 'review_transient_unsupported', 'review_capture_mismatch', 'review_invalid_input'];
      error = allowed.includes(cause.message) ? cause.message : 'review_unavailable';
    }
    if (!lifetime.signal.aborted) parent.postMessage({
      type: 'dude-review-result', channel, id: data.id, ...(error ? { error } : { result }),
    }, origin);
  });
}, { signal: lifetime.signal });
window.addEventListener('scroll', () => {
  if (!channel || notification !== null) return;
  notification = requestAnimationFrame(() => {
    notification = null;
    parent.postMessage({ type: 'dude-review-scrolled', channel }, origin);
  });
}, { capture: true, passive: true, signal: lifetime.signal });
window.addEventListener('pagehide', () => {
  lifetime.abort(); cancelAnimationFrame(notification);
}, { once: true });

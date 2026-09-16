import { useCallback, useEffect, useRef, useState } from 'react';

// All state is tab-local. These keys separate browsing from current authority;
// a successor request never inherits a response, consent, or reviewed revision.
export function authorityKey(feed) {
  return feed ? [feed.workspaceId, feed.providerGeneration, feed.sessionId].join('|') : '';
}
export function requestKey(feed, record) {
  return `${authorityKey(feed)}|${record.requestHandle}|${record.request.revision}`;
}

const MESSAGES = {
  idle_required: 'New idea is available when the joined agent is idle with no waiting request. Your draft is retained.',
  capture_unreconciled: 'A previous capture still needs owner reconciliation. Nothing will be resent.',
  capture_send_uncertain: 'Delivery is uncertain. Keep this draft and wait for owner reconciliation; do not send it again.',
  already_consumed: 'This request is no longer waiting. A fresh owner request is needed.',
  source_changed: 'The source changed. Your input is retained; the owner must publish current context.',
  owner_unavailable: 'The exact owner could not be confirmed. Your input is retained.',
  response_in_progress: 'This request already has an operation in progress.',
  provider_unavailable: 'The joined provider is unavailable. Your input stays in this tab.',
  identity_mismatch: 'The workspace or request identity changed. Nothing will be retried automatically.',
};

async function json(path, { body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw Object.assign(new Error('The connection was interrupted. Delivery may be uncertain; nothing will be resent.'),
      { code: 'connection_lost', cause: error });
  }
  let result;
  try { result = await response.json(); }
  catch { throw Object.assign(new Error('The provider returned an unreadable result. Reconcile before sending again.'), { code: 'connection_lost' }); }
  if (!response.ok) {
    throw Object.assign(new Error(MESSAGES[result.error] || result.message || 'The provider could not complete this operation. Your input is retained.'),
      { code: result.error || 'provider_unavailable' });
  }
  return result;
}

const initial = {
  projection: null, freshness: null, index: null, needs: null,
  rootKey: null, loading: true, selecting: false, connected: false,
  issues: {}, attempts: {}, authorityChanged: false,
};

/**
 * Closed API ownership for the one Canvas. A serial, coalesced read loop adopts
 * complete snapshots, not tool prose. Epochs fence old GETs across selection,
 * mutation, reconnect and lifetime changes. No polling or persisted send queue.
 */
export function useCanvasData(selection) {
  const [data, setData] = useState(initial);
  const current = useRef(data);
  const lifetime = useRef(null);
  const target = useRef(selection?.ideaPath);
  const work = useRef({ epoch: 0, running: false, workspace: false, needs: false, timer: null });
  const locks = useRef(new Set());
  const update = useCallback(change => {
    const previous = current.current;
    const next = typeof change === 'function' ? change(previous) : { ...previous, ...change };
    current.current = next;
    setData(next);
  }, []);

  const queue = useCallback((workspace = false) => {
    const owner = lifetime.current;
    if (!owner || owner.signal.aborted) return;
    const pending = work.current;
    pending.epoch += 1;
    pending.workspace ||= workspace;
    pending.needs = true;
    if (pending.running || pending.timer) return;
    pending.timer = setTimeout(async () => {
      pending.timer = null;
      pending.running = true;
      try {
        while ((pending.workspace || pending.needs) && !owner.signal.aborted) {
          const full = pending.workspace, epoch = pending.epoch, selected = target.current;
          pending.workspace = false; pending.needs = false;
          const requests = {
            needs: json('/api/needs-you', { signal: owner.signal }),
            ...(full ? {
              orientation: json('/api/refresh', { body: selected === undefined ? {} : { target: selected }, signal: owner.signal }),
              index: json('/api/work-index', { signal: owner.signal }),
            } : {}),
          };
          const entries = await Promise.all(Object.entries(requests).map(async ([key, promise]) => {
            try { return [key, { value: await promise }]; }
            catch (error) { return [key, { error }]; }
          }));
          if (owner.signal.aborted) return;
          if (pending.epoch !== epoch) {
            // A hint/action arriving mid-read must also reissue any full read
            // that was discarded, rather than lose ordinary-chat publication.
            pending.workspace ||= full;
            continue;
          }
          update(previous => {
            const next = { ...previous, issues: { ...previous.issues }, loading: false, selecting: false };
            for (const [key, result] of entries) {
              if (result.error) { next.issues[key] = result.error.message; continue; }
              delete next.issues[key];
              const value = result.value;
              if (key === 'orientation') {
                next.projection = value.projection;
                next.freshness = value.freshness;
              } else if (key === 'index') {
                // Missing coverage is not proof of root replacement. Establish
                // an inode identity when it first becomes readable; reset local
                // presentation only on a known workspace/root identity change.
                const rootChanged = previous.index && (previous.index.workspaceId !== value.workspaceId
                  || (previous.index.rootIdentity && value.rootIdentity && previous.index.rootIdentity !== value.rootIdentity));
                const rootKey = rootChanged ? value.rootIdentity || value.workspaceId
                  : previous.rootKey || value.rootIdentity || value.workspaceId;
                if (rootChanged) {
                  next.needs = null; next.projection = null; next.attempts = {}; next.authorityChanged = false;
                }
                if (['current', 'partial'].includes(value.coverage?.inventory?.state)
                  || !previous.index || rootKey !== previous.rootKey) {
                  next.index = value; next.rootKey = rootKey;
                } else {
                  next.issues.index = 'The inventory changed or became unavailable. The last readable records are retained, without current work claims.';
                }
              } else {
                if (previous.needs && authorityKey(previous.needs) !== authorityKey(value)) next.authorityChanged = true;
                if (previous.needs?.workspaceId && previous.needs.workspaceId !== value.workspaceId) {
                  next.index = null; next.projection = null; next.rootKey = value.workspaceId; next.attempts = {};
                }
                next.needs = value;
              }
            }
            return next;
          });
        }
      } finally {
        pending.running = false;
      }
    }, 40);
  }, [update]);

  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    // StrictMode cleanup must not share an in-flight loop with its successor.
    work.current = { epoch: 0, running: false, workspace: false, needs: false, timer: null };
    const events = new EventSource('/events');
    const complete = () => { update({ connected: true }); queue(true); };
    events.addEventListener('open', complete);
    events.addEventListener('workspace', () => queue(true));
    events.addEventListener('needs-you', () => queue());
    events.addEventListener('error', () => update({ connected: false }));
    const focus = async () => {
      if (document.visibilityState === 'hidden') return;
      const epoch = work.current.epoch;
      try {
        const value = await json('/api/freshness', { signal: owner.signal });
        if (owner.signal.aborted || epoch !== work.current.epoch) return;
        update({ freshness: value.freshness });
        queue(value.freshness?.state !== 'current');
      } catch {
        if (!owner.signal.aborted) queue(true);
      }
    };
    const close = () => events.close();
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('pagehide', close);
    queue(true);
    return () => {
      owner.abort();
      clearTimeout(work.current.timer);
      events.close();
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('pagehide', close);
    };
  }, [queue, update]);

  useEffect(() => {
    if (target.current === selection?.ideaPath) return;
    target.current = selection?.ideaPath;
    update({ selecting: Boolean(selection) });
    queue(true);
  }, [selection?.ideaPath, selection?.specPath, queue, update]);

  const markAttempt = useCallback((key, value) => {
    update(previous => ({ ...previous, attempts: { ...previous.attempts, [key]: value } }));
  }, [update]);

  const respond = useCallback(async (record, response) => {
    const feed = current.current.needs, key = requestKey(feed, record);
    const live = feed?.requests.find(item => item.requestHandle === record.requestHandle
      && item.request.revision === record.request.revision);
    if (!live || live.phase !== 'pending' || current.current.issues.needs
      || feed.coverage.state === 'unavailable' || locks.current.has(key)
      || (current.current.attempts[key] && !current.current.attempts[key].retryable)) return null;
    locks.current.add(key); // Synchronous guard before fetch or React's next render.
    work.current.epoch += 1;
    markAttempt(key, { phase: 'responding' });
    try {
      const result = await json('/api/needs-you/respond', {
        body: { requestHandle: record.requestHandle, revision: record.request.revision, response },
        signal: lifetime.current.signal,
      });
      markAttempt(key, { phase: 'awaiting_acknowledgment', receipt: result.receipt });
      return result;
    } catch (error) {
      markAttempt(key, { phase: error.code === 'connection_lost' ? 'uncertain' : 'unavailable',
        message: error.message, retryable: error.code === 'invalid_input' });
      return null;
    } finally {
      locks.current.delete(key);
      queue();
    }
  }, [markAttempt, queue]);

  const capture = useCallback(async (intent, continuation, record = null) => {
    const feed = current.current.needs;
    const key = `${authorityKey(feed)}|capture|${record?.requestHandle || 'new'}`;
    if (!intent.trim() || locks.current.has('capture') || !feed || current.current.issues.needs) return;
    const previous = current.current.attempts[key];
    const priorReceipt = feed.captures.find(item => item.captureReceipt === previous?.captureReceipt);
    const differentCapture = priorReceipt && (priorReceipt.intent !== previous?.intent || priorReceipt.continuation !== previous?.continuation);
    const refusedBeforeSend = priorReceipt?.phase === 'unavailable' && priorReceipt.reason === 'idle_required';
    if (previous && !previous.retryable && !refusedBeforeSend
      && !(differentCapture && priorReceipt.receipt.acknowledgment)
      && (!priorReceipt?.saved || previous.intent === intent)) return;
    locks.current.add('capture');
    work.current.epoch += 1;
    markAttempt(key, { phase: 'responding', intent, continuation });
    let captureReceipt = null;
    try {
      const intended = record?.requestHandle ?? null;
      const prepared = await json('/api/needs-you/capture-receipt', {
        body: { requestHandle: intended }, signal: lifetime.current.signal,
      });
      captureReceipt = prepared.captureReceipt;
      if (prepared.throughRequest !== intended) throw new Error('Capture context did not match the explicit selection. Nothing was sent.');
      const result = await json('/api/needs-you/capture', {
        body: { captureReceipt, intent, continuation }, signal: lifetime.current.signal,
      });
      markAttempt(key, { phase: result.status === 'delivered' ? 'awaiting_acknowledgment' : 'uncertain',
        intent, continuation, captureReceipt, receipt: result.receipt });
    } catch (error) {
      markAttempt(key, { phase: error.code === 'connection_lost' || error.code === 'capture_send_uncertain'
        ? 'uncertain' : 'unavailable', intent, continuation, captureReceipt, message: error.message,
        retryable: error.code === 'invalid_input' || (captureReceipt === null && error.code !== 'connection_lost') });
    } finally {
      locks.current.delete('capture');
      queue(true);
    }
  }, [markAttempt, queue]);

  const openReview = useCallback(async record => {
    return json('/api/needs-you/review/open', {
      body: { requestHandle: record.requestHandle, revision: record.request.revision },
      signal: lifetime.current.signal,
    });
  }, []);
  const readHistory = useCallback((scope, submissionId, signal) => {
    const query = new URLSearchParams({ ideaPath: scope.ideaPath, specPath: scope.specPath });
    if (submissionId) query.set('submissionId', submissionId);
    return json(`/api/needs-you/review/history?${query}`, { signal });
  }, []);

  return { ...data, refresh: () => queue(true), reconcile: () => queue(),
    respond, capture, openReview, readHistory };
}

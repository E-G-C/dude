import { useCallback, useEffect, useRef, useState } from 'react';

// All state is tab-local. These keys separate browsing from current authority;
// a successor request never inherits a response, consent, or reviewed revision.
export function authorityKey(feed) {
  return feed ? [feed.workspaceId, feed.providerGeneration, feed.sessionId].join('|') : '';
}
export function requestKey(feed, record) {
  return `${authorityKey(feed)}|${record.requestHandle}|${record.request.revision}`;
}

const PACK_MESSAGES = {
  idle_required: 'The joined agent must be idle, with no waiting request or queued input. This request was not sent.',
  pack_unreconciled: 'Another pack request needs owner reconciliation. Nothing will be resent.',
  capture_unreconciled: 'An idea capture needs owner reconciliation before a pack request can be sent.',
  pack_ineligible: 'This pack is no longer eligible for this operation. Reload packs before making a new request.',
  source_changed: 'The pack authority changed. Reload packs; any changed impact needs fresh confirmation.',
  source_unavailable: 'The required pack authority is unavailable. No change is confirmed.',
  identity_mismatch: 'The workspace or joined provider changed. This request will not be sent again.',
  pack_send_uncertain: 'Delivery is uncertain. Wait for owner reconciliation; do not repeat this request.',
  already_consumed: 'This receipt has already been used. It will not be sent again.',
  not_sent: 'The connection failed before this request was submitted. Nothing was sent; you can request it again.',
  pack_receipt_expired: 'This prepared request was never submitted and has expired. Nothing was sent.',
};
const currentCoverage = value => ['current', 'empty'].includes(value?.state);
const packBindingMatches = (record, feed) => Boolean(record?.packReceipt
  && record.receipt?.receiptId === record.packReceipt && record.receipt.owner === 'dude'
  && record.operation === record.receipt.operation && record.name === record.receipt.name
  && authorityKey(record.receipt) === authorityKey(feed));

// A prepared feed record was never sent. The provider excludes other idle
// actions while it is fresh and retires it lazily; a tab that lost its receipt
// must not wait for that retirement before it can ask again.
export function packRequestPending(data) {
  const attempt = data.packAttempt, feed = data.needs;
  const own = feed?.packRequests?.find(record => record.packReceipt === attempt?.packReceipt);
  // Only a receipt that never left prepared is retired, so this exact record
  // proves that a lost submit was never sent. Any other state, or no record,
  // keeps an uncertain attempt pending. Nothing is resent in either case.
  const expired = attempt?.phase === 'uncertain' && packBindingMatches(own, feed)
    && own.operation === attempt.operation && own.name === attempt.name
    && own.phase === 'stale' && own.reason === 'pack_receipt_expired';
  return Boolean(attempt && !own?.receipt.acknowledgment && !expired
    && ['preparing', 'submitting', 'uncertain'].includes(attempt.phase)
    && attempt.authority === authorityKey(feed))
    || Boolean(feed?.packRequests?.some(record => !record.receipt.acknowledgment
      && !['prepared', 'unavailable', 'stale'].includes(record.phase)));
}

export function packActionReason(data, operation, name) {
  const packs = data.packs, feed = data.needs;
  if (!['install', 'remove', 'refresh'].includes(operation)) return 'This pack operation is unavailable.';
  if (!packs?.rootIdentity || !packs.profileRevision || !packs.installed || !currentCoverage(packs.coverage.installed)) {
    return 'Current installed authority is required. Reload packs before requesting a change.';
  }
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable' || !data.connected
    || packs.workspaceId !== feed.workspaceId
    || (data.index?.rootIdentity && data.index.rootIdentity !== packs.rootIdentity)) {
    return 'The current workspace and joined provider must be available before requesting a change.';
  }
  const installed = packs.installed?.installed;
  const member = installed && Object.hasOwn(installed, name);
  if ((operation === 'install' && member) || (operation !== 'install' && !member)) return PACK_MESSAGES.pack_ineligible;
  if (operation !== 'remove' && (!currentCoverage(packs.coverage.catalog)
    || !packs.catalog?.packs.some(pack => pack.name === name))) {
    return 'This operation needs a current catalog entry. Recorded installed files can still be removed.';
  }
  if (operation === 'install' && Object.keys(installed).some(other => name.startsWith(`${other}-`) || other.startsWith(`${name}-`))) {
    return 'This pack overlaps an installed pack namespace and cannot be installed.';
  }
  if (packRequestPending(data)) return PACK_MESSAGES.pack_unreconciled;
  if (feed.captures.some(record => !record.receipt.acknowledgment && record.phase !== 'unavailable')
    || Object.entries(data.attempts).some(([key, attempt]) => key.startsWith(`${authorityKey(feed)}|capture|`)
      && attempt.phase === 'responding')) {
    return PACK_MESSAGES.capture_unreconciled;
  }
  if (!feed.capture.idle || feed.capture.waitingRequests.length) return PACK_MESSAGES.idle_required;
  return null;
}

// A local attempt is joined only by its exact receipt, never by pack membership
// or the latest similarly named request from another tab.
export function packRequestStatus(data, binding = null) {
  const feed = data.needs;
  const attempt = data.packAttempt && (!binding || binding.attemptId === data.packAttempt.attemptId)
    ? data.packAttempt : null;
  const receiptId = binding?.packReceipt || attempt?.packReceipt;
  const record = receiptId ? feed?.packRequests?.find(item => item.packReceipt === receiptId)
    : !binding && !attempt ? feed?.packRequests?.at(-1) : null;
  const target = binding || attempt || record;
  if (!target) return null;
  const result = record && packBindingMatches(record, feed)
    && record.name === target.name && record.operation === target.operation ? record : null;
  const authority = attempt?.authority || binding?.authority || authorityKey(result?.receipt);
  const identityChanged = authority !== authorityKey(feed)
    || (attempt?.rootKey && attempt.rootKey !== data.rootKey);
  let phase = result?.phase || attempt?.phase || 'unavailable';
  if (attempt && (result?.phase === 'prepared' && attempt.phase !== 'preparing'
    || result?.phase === 'admitted' && ['delivered', 'uncertain'].includes(attempt.phase))) phase = attempt.phase;
  let message = result?.reason ? PACK_MESSAGES[result.reason] || `The provider refused this request: ${result.reason}.`
    : !result || phase === attempt?.phase ? attempt?.message : null;
  if (identityChanged || !feed || data.issues.needs || feed.coverage.state === 'unavailable' || !data.connected) {
    phase = 'unavailable';
    message = identityChanged ? PACK_MESSAGES.identity_mismatch
      : 'Current request authority is unavailable. Nothing will be retried or replayed.';
  } else if (result?.phase === 'applied') {
    const reread = result.receipt.reread;
    if (!result.applied || !result.receipt.current || result.receipt.acknowledgment?.outcome !== 'applied'
      || reread?.state !== 'current' || reread.workspaceId !== feed.workspaceId
      || (data.index?.rootIdentity && reread.rootIdentity !== data.index.rootIdentity)) {
      phase = 'stale';
      message = 'This receipt no longer establishes a current applied result.';
    } else if (data.packsLoading) {
      phase = 'reading_result';
    } else if (!currentCoverage(data.packs?.coverage.installed)) {
      phase = 'unavailable';
      message = 'The owner reported a result, but current pack information is unavailable. Reload packs to read it; no operation will be repeated.';
    } else if (data.packs.rootIdentity !== reread.rootIdentity || data.packs.profileRevision !== reread.profileRevision) {
      phase = 'stale';
      message = 'The installed authority no longer agrees with this result. Reloading does not repeat the operation.';
    }
  }
  return {
    name: target.name, operation: target.operation, phase, message,
    record: identityChanged ? null : result,
    binding: attempt ? { attemptId: attempt.attemptId, name: attempt.name, operation: attempt.operation, authority }
      : binding || { packReceipt: record.packReceipt, name: record.name, operation: record.operation, authority },
  };
}

export function packPermission(data, packReceipt) {
  const feed = data.needs;
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable' || !data.connected) return null;
  const pack = feed.packRequests?.find(item => item.packReceipt === packReceipt);
  if (!packBindingMatches(pack, feed) || !pack.receipt.current || pack.phase !== 'waiting_permission') return null;
  return feed.requests.find(item => item.requestHandle === pack.permissionRequest && item.phase === 'pending'
    && item.request.owner === 'dude' && item.request.class === 'permission' && item.request.scope.kind === 'session'
    && item.request.requestRef === `pack:${packReceipt}` && item.request.source.kind === 'session'
    && item.request.source.revision === feed.providerGeneration
    && item.request.fields.operation === `pack:${pack.operation}`) || null;
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
  packs: null, packsLoading: false, packAttempt: null,
  rootKey: null, loading: true, selecting: false, connected: false,
  issues: {}, attempts: {}, authorityChanged: false,
};

// Last readable pack facts may remain inspectable, but never current/actionable
// while a replacement read is pending or unavailable. Null is unknown, not empty.
function invalidatePacks(snapshot, state, message = null) {
  const value = snapshot || { workspaceId: null, rootIdentity: null, profileRevision: null,
    readAt: null, installed: null, catalog: null, items: null };
  return { ...value, coverage: Object.fromEntries(['installed', 'catalog'].map(key => [
    key, { state: value[key] ? 'stale' : state,
      reason: state === 'loading' ? 'read_pending' : 'read_unavailable', message },
  ])) };
}

/**
 * Closed API ownership for the one Canvas. A serial, coalesced read loop adopts
 * complete snapshots, not tool prose. Epochs fence old GETs across selection,
 * mutation, reconnect and lifetime changes. No polling or persisted send queue.
 * Settings opts in with { packsActive: true }; ordinary work views acquire no
 * catalog. packs retains the complete read and independent coverage, while
 * packsLoading and issues.packs describe acquisition/transport, not pack changes.
 */
export function useCanvasData(selection, { packsActive = false } = {}) {
  const [data, setData] = useState(initial);
  const current = useRef(data);
  const lifetime = useRef(null);
  const target = useRef(selection?.ideaPath);
  const packsWanted = useRef(false);
  const work = useRef({ epoch: 0, running: false, workspace: false, needs: false,
    packs: false, packController: null, timer: null });
  const locks = useRef(new Set());
  const packSequence = useRef(0);
  const update = useCallback(change => {
    const previous = current.current;
    const next = typeof change === 'function' ? change(previous) : { ...previous, ...change };
    current.current = next;
    setData(next);
  }, []);

  const queue = useCallback((workspace = false, packs = packsWanted.current) => {
    const owner = lifetime.current;
    if (!owner || owner.signal.aborted) return;
    const pending = work.current;
    pending.epoch += 1;
    pending.workspace ||= workspace;
    pending.needs = true;
    pending.packs ||= packs && packsWanted.current;
    pending.packController?.abort();
    if (packs && packsWanted.current) update(previous => ({ ...previous, packsLoading: true,
      packs: invalidatePacks(previous.packs, 'loading') }));
    if (pending.running || pending.timer) return;
    pending.timer = setTimeout(async () => {
      pending.timer = null;
      pending.running = true;
      try {
        while ((pending.workspace || pending.needs || pending.packs) && !owner.signal.aborted) {
          const full = pending.workspace, epoch = pending.epoch, selected = target.current;
          const includePacks = pending.packs && packsWanted.current;
          const packAuthority = authorityKey(current.current.needs);
          const packController = includePacks ? new AbortController() : null;
          pending.packController = packController;
          pending.workspace = false; pending.needs = false; pending.packs = false;
          const requests = {
            needs: json('/api/needs-you', { signal: owner.signal }),
            ...(full ? {
              orientation: json('/api/refresh', { body: selected === undefined ? {} : { target: selected }, signal: owner.signal }),
              index: json('/api/work-index', { signal: owner.signal }),
            } : {}),
            ...(includePacks ? { packs: json('/api/packs', { signal: packController.signal }) } : {}),
          };
          const entries = await Promise.all(Object.entries(requests).map(async ([key, promise]) => {
            try { return [key, { value: await promise }]; }
            catch (error) { return [key, { error }]; }
          }));
          if (pending.packController === packController) pending.packController = null;
          if (owner.signal.aborted || lifetime.current !== owner) return;
          if (pending.epoch !== epoch) {
            // A hint/action arriving mid-read must also reissue any full read
            // that was discarded, rather than lose ordinary-chat publication.
            pending.workspace ||= full;
            pending.packs ||= includePacks && packsWanted.current;
            continue;
          }
          update(previous => {
            const next = { ...previous, issues: { ...previous.issues }, loading: false, selecting: false };
            for (const [key, result] of entries) {
              if (key === 'packs') continue; // Adopt after workspace/provider identities.
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
                  next.packs = null; next.packAttempt = null;
                }
                if (['current', 'partial'].includes(value.coverage?.inventory?.state)
                  || !previous.index || rootKey !== previous.rootKey) {
                  next.index = value; next.rootKey = rootKey;
                } else {
                  next.issues.index = 'The inventory changed or became unavailable. The last readable records are retained, without current work claims.';
                }
              } else {
                const changed = previous.needs && authorityKey(previous.needs) !== authorityKey(value);
                if (changed) next.authorityChanged = true;
                if (changed || (previous.needs?.coverage.state !== 'unavailable' && value.coverage.state === 'unavailable')) {
                  next.packs = next.packs ? invalidatePacks(next.packs, 'unavailable') : null;
                  next.packsLoading = packsWanted.current;
                  pending.workspace ||= changed || value.coverage.reason === 'workspace_changed';
                  pending.needs ||= pending.workspace || packsWanted.current;
                  pending.packs ||= packsWanted.current;
                }
                if (previous.needs?.workspaceId && previous.needs.workspaceId !== value.workspaceId) {
                  next.index = null; next.projection = null; next.rootKey = value.workspaceId; next.attempts = {};
                  next.packs = null; next.packAttempt = null;
                }
                next.needs = value;
              }
            }
            const packResult = entries.find(([key]) => key === 'packs')?.[1];
            if (packResult && packsWanted.current) {
              next.packsLoading = false;
              if (packResult.error) {
                const message = packResult.error.code === 'connection_lost'
                  ? 'Pack information could not be read. No pack change was requested. Reload to try again.'
                  : packResult.error.message;
                next.issues.packs = message;
                next.packs = invalidatePacks(next.packs, 'unavailable', message);
              } else {
                const value = packResult.value;
                const wrongWorkspace = [next.index?.workspaceId, next.needs?.workspaceId]
                  .some(id => id && id !== value.workspaceId);
                const wrongRoot = next.index?.rootIdentity && value.rootIdentity
                  && next.index.rootIdentity !== value.rootIdentity;
                if (wrongWorkspace || wrongRoot || (packAuthority && packAuthority !== authorityKey(next.needs))) {
                  const message = 'The workspace or joined provider changed during the pack read. Reload to read current packs.';
                  next.packs = invalidatePacks(null, 'unavailable', message);
                  next.issues.packs = message;
                } else {
                  next.packs = value;
                  delete next.issues.packs;
                }
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
    work.current = { epoch: 0, running: false, workspace: false, needs: false,
      packs: false, packController: null, timer: null };
    const events = new EventSource('/events');
    const complete = () => { update({ connected: true }); queue(true); };
    events.addEventListener('open', complete);
    events.addEventListener('workspace', () => queue(true));
    // Permission/delivery phases do not change pack facts. Workspace/result
    // events still reread them; provider replacement invalidates them above.
    events.addEventListener('needs-you', () => queue(false, false));
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
      work.current.packController?.abort();
      clearTimeout(work.current.timer);
      events.close();
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('pagehide', close);
    };
  }, [queue, update]);

  useEffect(() => {
    if (packsWanted.current === packsActive) return;
    packsWanted.current = packsActive;
    if (packsActive) queue(true);
    else {
      work.current.epoch += 1;
      work.current.packs = false;
      work.current.packController?.abort();
      update(previous => ({ ...previous, packsLoading: false,
        packs: previous.packs ? invalidatePacks(previous.packs, 'unavailable') : null }));
    }
  }, [packsActive, queue, update]);

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
      queue(false, !record.request.requestRef.startsWith('pack:'));
    }
  }, [markAttempt, queue]);

  const capture = useCallback(async (intent, continuation, record = null) => {
    const feed = current.current.needs;
    const key = `${authorityKey(feed)}|capture|${record?.requestHandle || 'new'}`;
    if (!intent.trim() || locks.current.has('capture') || !feed || current.current.issues.needs) return;
    if (locks.current.has('pack') || packRequestPending(current.current)) {
      markAttempt(key, { phase: 'unavailable', intent, continuation,
        message: PACK_MESSAGES.pack_unreconciled, retryable: true });
      return;
    }
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

  const requestPack = useCallback((operation, name, snapshot) => {
    if (locks.current.has('pack')) return null;
    const before = current.current, owner = lifetime.current;
    const attempt = { attemptId: ++packSequence.current, name, operation,
      authority: authorityKey(before.needs), rootKey: before.rootKey, packReceipt: null, phase: 'preparing' };
    const reason = locks.current.has('capture') ? PACK_MESSAGES.capture_unreconciled
      : snapshot !== before.packs ? 'The displayed pack read changed. Reload packs before requesting a change.'
        : packActionReason(before, operation, name);
    update({ packAttempt: reason ? { ...attempt, phase: 'unavailable', message: reason } : attempt });
    if (reason) return attempt;
    locks.current.add('pack');
    work.current.epoch += 1;
    const mark = change => update(previous => previous.packAttempt?.attemptId === attempt.attemptId
      ? { ...previous, packAttempt: { ...previous.packAttempt, ...change } } : previous);
    let submitted = false;
    void (async () => {
      try {
        const prepared = await json('/api/packs/request', {
          body: { op: 'prepare', operation, name }, signal: owner.signal,
        });
        if (lifetime.current !== owner || before.rootKey !== current.current.rootKey
          || attempt.authority !== authorityKey(current.current.needs)
          || current.current.needs?.coverage.state === 'unavailable' || current.current.issues.needs
          || !packBindingMatches(prepared, before.needs) || prepared.phase !== 'prepared'
          || prepared.operation !== operation || prepared.name !== name) {
          throw Object.assign(new Error(PACK_MESSAGES.identity_mismatch), { code: 'identity_mismatch' });
        }
        mark({ packReceipt: prepared.packReceipt, phase: 'submitting' });
        submitted = true;
        const result = await json('/api/packs/request', {
          body: { op: 'submit', operation, name, packReceipt: prepared.packReceipt }, signal: owner.signal,
        });
        if (!packBindingMatches(result, before.needs) || result.packReceipt !== prepared.packReceipt
          || result.operation !== operation || result.name !== name) {
          throw Object.assign(new Error(PACK_MESSAGES.pack_send_uncertain), { code: 'pack_send_uncertain' });
        }
        mark({ phase: result.phase });
      } catch (error) {
        // Only submit can send. A lost prepare is known-unsent, never uncertain.
        const unsent = error.code === 'connection_lost' && !submitted;
        mark({ phase: unsent ? 'unavailable'
          : ['connection_lost', 'pack_send_uncertain'].includes(error.code) ? 'uncertain'
            : ['identity_mismatch', 'source_changed'].includes(error.code) ? 'stale' : 'unavailable',
        message: unsent ? PACK_MESSAGES.not_sent : PACK_MESSAGES[error.code] || error.message });
      } finally {
        locks.current.delete('pack');
        queue(false, false);
      }
    })();
    return attempt;
  }, [queue, update]);

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
  // One fixed read per About entry, outside the refresh loop and pack reads:
  // never polled, retried, or cached. The hook lifetime and the caller's exit
  // each abort it. They are linked by hand because the embedded host's engine
  // is not established to support AbortSignal.any.
  const readAbout = useCallback(({ signal }) => {
    const read = new AbortController(), abort = () => read.abort();
    const owners = [lifetime.current.signal, signal];
    for (const owner of owners) {
      if (owner.aborted) abort();
      else owner.addEventListener('abort', abort, { once: true });
    }
    return json('/api/about', { signal: read.signal })
      .finally(() => owners.forEach(owner => owner.removeEventListener('abort', abort)));
  }, []);

  return { ...data, refresh: () => queue(true), reconcile: () => queue(),
    reloadPacks: () => { if (packsWanted.current) queue(true); },
    respond, capture, requestPack, openReview, readHistory, readAbout };
}

import { useCallback, useEffect, useRef, useState } from 'react';

// All state is tab-local. These keys separate browsing from current authority;
// a successor request never inherits a response, consent, or reviewed revision.
export function authorityKey(feed) {
  return feed ? [feed.workspaceId, feed.providerGeneration, feed.sessionId].join('|') : '';
}
export function requestKey(feed, record) {
  return `${authorityKey(feed)}|${record.requestHandle}|${record.request.revision}`;
}

// Why Install, Remove, or Refresh pack is unavailable in a pack's details. They
// wait only for the workspace, in the words Sources uses, and Refresh also for a
// readable saved source list. No joined session, idle agent, or request is involved.
const PACK_REASONS = {
  unavailable: 'The current workspace must be available to change packs. Nothing is sent.',
  disconnected: 'Canvas is reconnecting to the workspace. Nothing changes until the connection is current.',
  config: 'The saved source list is unreadable, so Refresh cannot choose a source. Remove does not need it.',
};
// Add/import wording. Every refusal before a send says so ("not sent"); only an
// uncertain delivery is ever described as possibly sent.
const IMPORT_MESSAGES = {
  idle_required: 'The joined agent must be idle, with no waiting request or queued input. This request was not sent.',
  import_unreconciled: 'Another artifact import needs owner reconciliation. Nothing will be resent.',
  capture_unreconciled: 'An idea capture needs owner reconciliation before an import can be requested.',
  import_send_uncertain: 'Delivery could not be confirmed. Wait for Dude to reconcile this request, and do not repeat it.',
  identity_mismatch: 'The workspace or joined provider changed. This request will not be sent again.',
  already_consumed: 'This receipt has already been used. It will not be sent again.',
  not_sent: 'The connection failed before this request was submitted. Nothing was sent; you can request it again.',
  import_receipt_expired: 'This prepared request was never submitted and has expired. Nothing was sent.',
  invalid_input: 'The provider did not accept this source. Nothing was sent.',
};
export const IMPORT_REASONS = {
  unavailable: 'The current workspace and joined provider must be available before requesting an import.',
  disconnected: 'Canvas is reconnecting to the joined session. Nothing is sent until the connection is current.',
  open: 'This import request is still open. Wait for its result; nothing will be resent.',
  permission: 'This import request is waiting for your permission response in Needs you.',
  uncertain: 'Delivery of this import request is uncertain. Wait for Dude to reconcile it; nothing will be resent.',
  capture: 'An idea capture needs owner reconciliation before an import can be requested.',
  waiter: 'A request is waiting in Needs you. Respond to it before requesting an import.',
  busy: 'The joined agent is busy. Request import becomes available when the session is idle.',
};
// The New idea reason, and the refusal of a capture sent while an import is open.
export const IMPORT_IN_PROGRESS = 'An artifact import is in progress or needs owner reconciliation. Your idea draft stays here.';

/**
 * Why Install, Remove, or Refresh pack is unavailable, or null. Compose's own
 * preview decides everything about the pack itself (FR-003), so only the
 * workspace, and for Refresh a readable saved source list, are judged here.
 */
export function packActionReason(data, operation) {
  const feed = data.needs;
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable') return PACK_REASONS.unavailable;
  if (!data.connected) return PACK_REASONS.disconnected;
  if (operation === 'refresh' && data.packs?.sources?.state === 'unavailable') return PACK_REASONS.config;
  return null;
}

// A prepared or sent capture the owner has not reconciled, or a response this
// tab is sending, excludes every other send. An unsent draft is neither.
function captureUnreconciled(data) {
  const feed = data.needs;
  return Boolean(feed?.captures.some(record => !record.receipt.acknowledgment && record.phase !== 'unavailable')
    || Object.entries(data.attempts).some(([key, attempt]) => key.startsWith(`${authorityKey(feed)}|capture|`)
      && attempt.phase === 'responding'));
}

const importBindingMatches = (record, feed) => Boolean(record?.importReceipt
  && record.receipt?.receiptId === record.importReceipt && record.receipt.owner === 'dude'
  && record.importSource === record.receipt.importSource
  && authorityKey(record.receipt) === authorityKey(feed));

// Only the provider's own record proves that nothing was sent: a receipt it
// refused or expired before any send. Everything else may have been delivered.
const importKnownUnsent = record => Boolean(record && record.sendStarted === false
  && ['stale', 'unavailable'].includes(record.phase));

/**
 * Whether an import still excludes other sends: this tab's attempt before the
 * provider has answered, or any unacknowledged provider record that was sent or
 * is not already refused. A prepared feed record was never sent, and the
 * provider retires it lazily, so a tab that lost its receipt may ask again
 * rather than wait for that retirement.
 */
export function importRequestPending(data) {
  const attempt = data.importAttempt, feed = data.needs;
  const own = feed?.importRequests?.find(record => record.importReceipt === attempt?.importReceipt);
  // A lost submit stays uncertain unless this exact receipt's record proves it
  // was refused or expired unsent. Nothing is resent in either case.
  const unsent = attempt?.phase === 'uncertain' && importBindingMatches(own, feed)
    && own.importSource === attempt.source && importKnownUnsent(own);
  return Boolean(attempt && !own?.receipt.acknowledgment && !unsent
    && ['preparing', 'submitting', 'admitted', 'delivered', 'uncertain'].includes(attempt.phase)
    && attempt.authority === authorityKey(feed))
    || Boolean(feed?.importRequests?.some(record => !record.receipt.acknowledgment
      && !['prepared', 'unavailable', 'stale'].includes(record.phase)));
}

/**
 * The reason Request import is unavailable, in the order a person can act on
 * it, or null. Queued input is deliberately absent: only the provider can see
 * it, so a request it refuses for that is reported after the click, not sent.
 */
export function importActionReason(data) {
  const feed = data.needs;
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable') return IMPORT_REASONS.unavailable;
  if (!data.connected) return IMPORT_REASONS.disconnected;
  if (importRequestPending(data)) {
    const phase = importRequestStatus(data)?.phase;
    return phase === 'waiting_permission' ? IMPORT_REASONS.permission
      : phase === 'uncertain' ? IMPORT_REASONS.uncertain : IMPORT_REASONS.open;
  }
  if (captureUnreconciled(data)) return IMPORT_REASONS.capture;
  if (feed.capture.waitingRequests.length) return IMPORT_REASONS.waiter;
  if (!feed.capture.idle) return IMPORT_REASONS.busy;
  return null;
}

/**
 * The one import status Add/import shows: this tab's attempt, joined to the
 * provider's record only by the exact receipt, never by source text; or, with no
 * attempt, the provider's latest record. A result is frozen evidence. It stays
 * visible through a reconnect, but the provider replacing or ending its
 * authority leaves no Applied claim behind.
 */
export function importRequestStatus(data) {
  const feed = data.needs, attempt = data.importAttempt;
  const record = attempt ? attempt.importReceipt
    ? feed?.importRequests?.find(item => item.importReceipt === attempt.importReceipt) ?? null : null
    : feed?.importRequests?.at(-1) ?? null;
  if (!attempt && !record) return null;
  const source = attempt ? attempt.source : record.importSource;
  const result = record && importBindingMatches(record, feed) && record.importSource === source ? record : null;
  const authority = attempt?.authority || authorityKey(result?.receipt);
  const identityChanged = authority !== authorityKey(feed) || Boolean(attempt?.rootKey && attempt.rootKey !== data.rootKey);
  const acknowledgment = !identityChanged ? result?.receipt.acknowledgment ?? null : null;
  let phase = result?.phase || attempt?.phase || 'unavailable';
  if (attempt && (result?.phase === 'prepared' && attempt.phase !== 'preparing'
    || result?.phase === 'admitted' && ['delivered', 'uncertain'].includes(attempt.phase))) phase = attempt.phase;
  let message = result?.reason ? IMPORT_MESSAGES[result.reason] || `The provider refused this request: ${result.reason}.`
    : !result || phase === attempt?.phase ? attempt?.message ?? null : null;
  if (identityChanged || (!acknowledgment && (!feed || data.issues.needs
    || feed.coverage.state === 'unavailable' || !data.connected))) {
    phase = 'unavailable';
    message = identityChanged ? IMPORT_MESSAGES.identity_mismatch
      : 'Current request authority is unavailable. Nothing will be retried or replayed.';
  } else if (result?.phase === 'applied' && (!result.applied || !result.receipt.current
    || acknowledgment?.outcome !== 'applied' || acknowledgment.mutation !== 'applied' || !acknowledgment.written.length)) {
    phase = 'stale';
    message = 'This receipt no longer establishes a current applied result.';
  }
  return {
    source, phase, message, receipt: result?.importReceipt ?? attempt?.importReceipt ?? null,
    record: identityChanged ? null : result, acknowledgment,
  };
}

export function importPermission(data, importReceipt) {
  const feed = data.needs;
  if (!feed || data.issues.needs || feed.coverage.state === 'unavailable' || !data.connected) return null;
  const record = feed.importRequests?.find(item => item.importReceipt === importReceipt);
  if (!importBindingMatches(record, feed) || !record.receipt.current || record.phase !== 'waiting_permission') return null;
  return feed.requests.find(item => item.requestHandle === record.permissionRequest && item.phase === 'pending'
    && item.request.owner === 'dude' && item.request.class === 'permission' && item.request.scope.kind === 'session'
    && item.request.requestRef === `import:${importReceipt}` && item.request.source.kind === 'session'
    && item.request.source.revision === feed.providerGeneration
    && ['import:file', 'import:directory'].includes(item.request.fields.operation)) || null;
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
      { code: result.error || 'provider_unavailable', details: result });
  }
  return result;
}

const initial = {
  projection: null, freshness: null, index: null, needs: null,
  packs: null, packsLoading: false, discovering: false, importAttempt: null,
  rootKey: null, loading: true, selecting: false, connected: false,
  issues: {}, attempts: {}, authorityChanged: false,
};

// Last readable pack and project facts may remain inspectable, but never
// current/actionable while a replacement read is pending or unavailable. Null
// is unknown, not empty. The project read has its own coverage beside the pack
// coverages and is invalidated with them: its retained rows are last-read
// inspection only, so neither a count nor a navigation target may treat them as
// the current project folders.
function invalidatePacks(snapshot, state, message = null) {
  const value = snapshot || { workspaceId: null, rootIdentity: null, profileRevision: null,
    readAt: null, installed: null, catalog: null, items: null, project: null };
  const reason = state === 'loading' ? 'read_pending' : 'read_unavailable';
  const retained = value.project?.items ?? null;
  return { ...value,
    coverage: Object.fromEntries(['installed', 'catalog'].map(key => [
      key, { state: value[key] ? 'stale' : state, reason, message },
    ])),
    project: { coverage: { state: retained ? 'stale' : state, reason, message }, items: retained } };
}

/**
 * An automatic read describes installed packs, project rows and the saved
 * sources, and reads no catalog. After a discovery this tab keeps what that read
 * found, so an event, a focus change or a permission reply does not undo it: the
 * Available rows, each source's status and count, and the metadata of installed
 * packs. It keeps only what the fresh read can still stand behind. A source that
 * is no longer saved keeps no row, a pack that is now installed leaves Available,
 * and an installed pack keeps its description only while it still matches the
 * same source, with the pack.md Details that came with that description. Its
 * member READMEs are the fresh read's own. Nothing here reads or stores a
 * catalog; the next Reload replaces it.
 */
function retainCatalog(fresh, discovery) {
  if (!discovery?.sources || !fresh.sources || !fresh.installed || !fresh.items
    || fresh.coverage.catalog?.state !== 'not_read'
    || discovery.workspaceId !== fresh.workspaceId || discovery.rootIdentity !== fresh.rootIdentity) return fresh;
  const saved = new Set(fresh.sources.items.map(item => item.key));
  const installed = new Set(Object.keys(fresh.installed.installed));
  const available = discovery.items.filter(row => !row.installed && saved.has(row.sourceKey) && !installed.has(row.name));
  const metadata = row => {
    const known = discovery.items.find(old => old.name === row.name && old.sourceKey === row.sourceKey
      && (old.installed ? old.provenance === row.provenance : row.provenance === 'source'));
    return { description: known ? known.description : null, use_cases: known ? known.use_cases : null,
      documents: [...(known?.documents ?? []).filter(entry => entry.path === 'pack.md'), ...row.documents] };
  };
  const sources = { ...fresh.sources, items: fresh.sources.items.map(item => {
    const read = discovery.sources.items.find(old => old.key === item.key);
    if (!read || read.status === 'not_read') return item;
    return { ...item, status: read.status, reason: read.reason, message: read.message, count: read.count,
      uninstalled: read.status === 'read' ? available.filter(row => row.sourceKey === item.key).length : null };
  }) };
  return { ...fresh, sources, catalog: discovery.catalog, discovery,
    coverage: { ...fresh.coverage, catalog: discovery.coverage.catalog },
    items: [...fresh.items.map(row => row.installed ? { ...row, ...metadata(row) } : row), ...available] };
}

/**
 * Adopt one finished pack read. The workspace and provider checks are the same
 * for the automatic read and the explicit one; only an explicit discovery
 * replaces the retained catalog, and an automatic read that lands while one is
 * still running stays pending, since that discovery is about to replace it.
 */
function adoptPacks(next, result, authority, explicit) {
  if (result.error) {
    const message = result.error.code === 'connection_lost'
      ? 'Pack information could not be read. No pack change was requested. Reload to try again.'
      : result.error.message;
    next.issues.packs = message;
    next.packs = invalidatePacks(next.packs, 'unavailable', message);
    return;
  }
  const value = result.value;
  const wrongWorkspace = [next.index?.workspaceId, next.needs?.workspaceId].some(id => id && id !== value.workspaceId);
  const wrongRoot = next.index?.rootIdentity && value.rootIdentity && next.index.rootIdentity !== value.rootIdentity;
  if (wrongWorkspace || wrongRoot || (authority && authority !== authorityKey(next.needs))) {
    const message = 'The workspace or joined provider changed during the pack read. Reload to read current packs.';
    next.packs = invalidatePacks(null, 'unavailable', message);
    next.issues.packs = message;
    return;
  }
  const adopted = explicit ? { ...value, discovery: value } : retainCatalog(value, next.packs?.discovery ?? null);
  next.packs = !explicit && next.discovering ? invalidatePacks(adopted, 'loading') : adopted;
  delete next.issues.packs;
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
    packs: false, packController: null, timer: null, discoverController: null, discoverWaiters: [] });
  const locks = useRef(new Set());
  const importSequence = useRef(0);
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
            // The automatic read: installed packs, project rows and saved sources, never a catalog.
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
                  next.packs = null; next.importAttempt = null;
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
                  next.packs = null; next.importAttempt = null;
                }
                next.needs = value;
              }
            }
            const packResult = entries.find(([key]) => key === 'packs')?.[1];
            if (packResult && packsWanted.current) {
              next.packsLoading = false;
              adoptPacks(next, packResult, packAuthority, false);
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
      packs: false, packController: null, timer: null, discoverController: null, discoverWaiters: [] };
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
      work.current.discoverController?.abort();
      work.current.discoverWaiters.splice(0).forEach(resolve => resolve(null));
      clearTimeout(work.current.timer);
      events.close();
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('pagehide', close);
    };
  }, [queue, update]);

  // One explicit discovery, the only read that acquires catalogs: the default
  // plus each saved source, once. It is not part of the automatic loop, so an
  // event, a focus change or a permission reply never starts, restarts or aborts
  // one; only a newer explicit read replaces it, and leaving Settings or ending
  // the lifetime stops it (the server then stops its readers). The returned
  // promise settles after the snapshot is committed, with that snapshot, or with
  // null when the read did not commit.
  const discover = useCallback(() => {
    const owner = lifetime.current, pending = work.current;
    if (!owner || owner.signal.aborted || !packsWanted.current) return Promise.resolve(null);
    pending.discoverController?.abort();
    const controller = new AbortController();
    pending.discoverController = controller;
    const stop = () => controller.abort();
    owner.signal.addEventListener('abort', stop, { once: true });
    const authority = authorityKey(current.current.needs);
    const settled = new Promise(resolve => pending.discoverWaiters.push(resolve));
    update(previous => ({ ...previous, discovering: true, packs: invalidatePacks(previous.packs, 'loading') }));
    void (async () => {
      let result;
      try { result = { value: await json('/api/packs?discover=1', { signal: controller.signal }) }; }
      catch (error) { result = { error }; }
      owner.signal.removeEventListener('abort', stop);
      // A newer Reload, leaving Settings, or the lifetime's end owns what happens next.
      if (owner.signal.aborted || lifetime.current !== owner || pending.discoverController !== controller) return;
      pending.discoverController = null;
      let committed = null;
      update(previous => {
        const next = { ...previous, issues: { ...previous.issues }, discovering: false };
        if (packsWanted.current) {
          adoptPacks(next, result, authority, true);
          committed = next.issues.packs ? null : next.packs;
        }
        return next;
      });
      pending.discoverWaiters.splice(0).forEach(resolve => resolve(committed));
    })();
    return settled;
  }, [update]);

  useEffect(() => {
    if (packsWanted.current === packsActive) return;
    packsWanted.current = packsActive;
    if (packsActive) queue(true);
    else {
      work.current.epoch += 1;
      work.current.packs = false;
      work.current.packController?.abort();
      work.current.discoverController?.abort();
      work.current.discoverController = null;
      work.current.discoverWaiters.splice(0).forEach(resolve => resolve(null));
      update(previous => ({ ...previous, packsLoading: false, discovering: false,
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
      // An import permission reply changes no workspace fact. Only the
      // provider's own result hint rereads packs, never a catalog acquisition here.
      queue(false, !/^import:/.test(record.request.requestRef));
    }
  }, [markAttempt, queue]);

  const capture = useCallback(async (intent, continuation, record = null) => {
    const feed = current.current.needs;
    const key = `${authorityKey(feed)}|capture|${record?.requestHandle || 'new'}`;
    if (!intent.trim() || locks.current.has('capture') || !feed || current.current.issues.needs) return;
    if (locks.current.has('import') || importRequestPending(current.current)) {
      markAttempt(key, { phase: 'unavailable', intent, continuation,
        message: IMPORT_IN_PROGRESS, retryable: true });
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

  /**
   * One closed body of the pack action route: a preview, the one apply its
   * token allows, or Cancel (see canvas-server.mjs). It never throws and never
   * retries: the answer is `{ ok: true, value }`, or `{ ok: false, code }` with
   * the route's refusal code, `connection_lost` when no answer arrived. Any
   * apply answer is followed by the automatic pack read, which reads no catalog,
   * so Installed and Available show what Compose did (FR-020). `signal`, and
   * the hook's lifetime, abort the request; they are linked by hand, as
   * readAbout's are.
   */
  const packAction = useCallback(async (body, signal = null) => {
    const owner = lifetime.current, request = new AbortController(), abort = () => request.abort();
    const owners = [owner.signal, ...(signal ? [signal] : [])];
    for (const each of owners) {
      if (each.aborted) abort();
      else each.addEventListener('abort', abort, { once: true });
    }
    try {
      return { ok: true, value: await json('/api/packs/action', { body, signal: request.signal }) };
    } catch (error) {
      return { ok: false, code: error.code || 'connection_lost' };
    } finally {
      owners.forEach(each => each.removeEventListener('abort', abort));
      if (body.op === 'apply' && lifetime.current === owner) queue();
    }
  }, [queue]);

  /**
   * Prepare then submit one explicit import, once. `source` is the exact
   * trimmed text the person typed: it is the binding of both bodies and of the
   * receipt, never normalized, and a result is joined to this attempt only by
   * the provider's receipt. A refusal before submit, or the provider's own
   * refusal of the submitted receipt, is known-unsent; only a lost or
   * unconfirmed submit is uncertain. Nothing is ever resent or replayed.
   */
  const requestImport = useCallback(source => {
    if (locks.current.has('import')) return null;
    const before = current.current, owner = lifetime.current;
    const attempt = { attemptId: ++importSequence.current, source,
      authority: authorityKey(before.needs), rootKey: before.rootKey, importReceipt: null, phase: 'preparing' };
    const reason = locks.current.has('capture') ? IMPORT_MESSAGES.capture_unreconciled : importActionReason(before);
    update({ importAttempt: reason ? { ...attempt, phase: 'unavailable', message: reason } : attempt });
    if (reason) return attempt;
    locks.current.add('import');
    work.current.epoch += 1;
    const mark = change => update(previous => previous.importAttempt?.attemptId === attempt.attemptId
      ? { ...previous, importAttempt: { ...previous.importAttempt, ...change } } : previous);
    let submitted = false;
    void (async () => {
      try {
        const prepared = await json('/api/imports/request', {
          body: { op: 'prepare', importSource: source }, signal: owner.signal,
        });
        if (lifetime.current !== owner || before.rootKey !== current.current.rootKey
          || attempt.authority !== authorityKey(current.current.needs)
          || current.current.needs?.coverage.state === 'unavailable' || current.current.issues.needs
          || !importBindingMatches(prepared, before.needs) || prepared.phase !== 'prepared'
          || prepared.importSource !== source) {
          throw Object.assign(new Error(IMPORT_MESSAGES.identity_mismatch), { code: 'identity_mismatch' });
        }
        mark({ importReceipt: prepared.importReceipt, phase: 'submitting' });
        submitted = true;
        const result = await json('/api/imports/request', {
          body: { op: 'submit', importSource: source, importReceipt: prepared.importReceipt }, signal: owner.signal,
        });
        if (!importBindingMatches(result, before.needs) || result.importReceipt !== prepared.importReceipt
          || result.importSource !== source) {
          throw Object.assign(new Error(IMPORT_MESSAGES.import_send_uncertain), { code: 'import_send_uncertain' });
        }
        mark({ phase: result.phase });
      } catch (error) {
        // Only submit can send. A lost prepare, and every refusal the provider
        // returns before sending, are known-unsent; the rest may have been delivered.
        const unsent = error.code === 'connection_lost' && !submitted;
        const uncertain = ['connection_lost', 'import_send_uncertain'].includes(error.code);
        mark({ phase: unsent ? 'unavailable' : uncertain ? 'uncertain'
          : error.code === 'identity_mismatch' ? 'stale' : 'unavailable',
        message: unsent ? IMPORT_MESSAGES.not_sent : IMPORT_MESSAGES[error.code] || error.message });
      } finally {
        locks.current.delete('import');
        queue(false, false);
      }
    })();
    return attempt;
  }, [queue, update]);

  /**
   * Save or remove one pack source: the one direct configuration write. The body
   * is closed (the route refuses every other field) and carries the revision of
   * the saved list this tab last read, so a list changed elsewhere is refused
   * rather than overwritten. Nothing is retried or replayed. A refusal says why
   * nothing was saved; a lost response (`connection_lost`) is unconfirmed until a
   * fresh read. A saved change is followed by exactly one explicit discovery, and
   * `read` settles with the snapshot that read committed, or null.
   */
  const writeSource = useCallback(async fields => {
    if (locks.current.has('sources')) {
      return { ok: false, code: 'source_busy', message: 'Another source change is still in progress. Nothing was changed.' };
    }
    const sources = current.current.packs?.sources;
    if (sources?.state !== 'current' || !sources.sourcesRevision) {
      return { ok: false, code: 'sources_unavailable',
        message: 'The saved source list could not be read, so it cannot be changed here. Nothing was reset.' };
    }
    locks.current.add('sources');
    try {
      const saved = await json('/api/packs/sources', {
        body: { ...fields, sourcesRevision: sources.sourcesRevision }, signal: lifetime.current.signal,
      });
      // Reads that began before the save describe the old list: discard them.
      work.current.epoch += 1;
      work.current.packController?.abort();
      return { ok: true, ...saved, read: discover() };
    } catch (error) {
      return { ok: false, code: error.code, message: error.message,
        ...(typeof error.details?.key === 'string' ? { key: error.details.key } : {}),
        ...(Array.isArray(error.details?.blockers) ? { blockers: error.details.blockers } : {}) };
    } finally {
      locks.current.delete('sources');
    }
  }, [discover]);
  const addSource = useCallback(({ location, ref }) => writeSource({ op: 'add', location, ...(ref ? { ref } : {}) }), [writeSource]);
  const removeSource = useCallback(key => writeSource({ op: 'remove', key }), [writeSource]);

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

  return { ...data, packsLoading: data.packsLoading || data.discovering,
    refresh: () => queue(true), reconcile: () => queue(),
    // Reload packs is the existing full workspace refresh plus the one explicit catalog discovery.
    reloadPacks: () => { if (!packsWanted.current) return Promise.resolve(null); queue(true, false); return discover(); }, addSource, removeSource,
    respond, capture, packAction, requestImport, openReview, readHistory, readAbout };
}

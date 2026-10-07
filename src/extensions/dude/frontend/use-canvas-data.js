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
  import_unreconciled: 'An artifact import needs owner reconciliation before a pack request can be sent.',
};
// Add/import wording. Every refusal before a send says so ("not sent"); only an
// uncertain delivery is ever described as possibly sent.
const IMPORT_MESSAGES = {
  idle_required: 'The joined agent must be idle, with no waiting request or queued input. This request was not sent.',
  import_unreconciled: 'Another artifact import needs owner reconciliation. Nothing will be resent.',
  pack_unreconciled: 'A pack request needs owner reconciliation before an import can be requested.',
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
  pack: 'A pack request needs owner reconciliation before an import can be requested.',
  capture: 'An idea capture needs owner reconciliation before an import can be requested.',
  waiter: 'A request is waiting in Needs you. Respond to it before requesting an import.',
  busy: 'The joined agent is busy. Request import becomes available when the session is idle.',
};
// The New idea reason, and the refusal of a capture sent while an import is open.
export const IMPORT_IN_PROGRESS = 'An artifact import is in progress or needs owner reconciliation. Your idea draft stays here.';
const currentCoverage = value => ['current', 'empty'].includes(value?.state);
// A catalog the last discovery read, even in part: its rows may be browsed and
// requested, because each request is checked against a fresh read of its source.
const readableCatalog = value => ['current', 'empty', 'partial'].includes(value?.state);
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

const CATALOG_ENTRY_REASON = 'This operation needs a current catalog entry. Recorded installed files can still be removed.';
const CATALOG_NOT_READ_REASON = 'This operation needs a catalog entry, and no catalog has been read yet. Choose Reload packs, then try again. Recorded installed files can still be removed.';
// Whether the displayed read holds the catalog entry an install or refresh
// needs. An install is chosen from one Available row, so that exact row must
// still be listed. A refresh needs the pack in the catalog of the source its
// record matches, and the metadata the read matched to that source proves it.
function catalogEntry(packs, operation, name, key) {
  if (!readableCatalog(packs.coverage.catalog) || !packs.items) return false;
  if (operation === 'install') return packs.items.some(item => item.key === key && item.name === name && item.installed === false);
  return typeof packs.items.find(item => item.installed && item.name === name)?.description === 'string';
}

// `name` is a pack's name: the operation target and the installed-membership
// vocabulary. It is never a list row key, which is only UI identity: a project
// row's key is no member and no catalog entry, so no operation can be asked
// of it, and the checks below stay exactly the name-keyed pack authority. An
// install also names the Available row it was chosen from (`key`), because two
// sources may list the same pack name.
export function packActionReason(data, operation, name, key = null) {
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
  if (operation !== 'remove' && !catalogEntry(packs, operation, name, key)) {
    return packs.coverage.catalog?.state === 'not_read' ? CATALOG_NOT_READ_REASON : CATALOG_ENTRY_REASON;
  }
  if (operation === 'install' && Object.keys(installed).some(other => name.startsWith(`${other}-`) || other.startsWith(`${name}-`))) {
    return 'This pack overlaps an installed pack namespace and cannot be installed.';
  }
  if (importRequestPending(data)) return PACK_MESSAGES.import_unreconciled;
  if (packRequestPending(data)) return PACK_MESSAGES.pack_unreconciled;
  if (captureUnreconciled(data)) return PACK_MESSAGES.capture_unreconciled;
  if (!feed.capture.idle || feed.capture.waitingRequests.length) return PACK_MESSAGES.idle_required;
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
  if (packRequestPending(data)) return IMPORT_REASONS.pack;
  if (captureUnreconciled(data)) return IMPORT_REASONS.capture;
  if (feed.capture.waitingRequests.length) return IMPORT_REASONS.waiter;
  if (!feed.capture.idle) return IMPORT_REASONS.busy;
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
  // The source an install was bound to (a saved source's key), or none for the
  // default catalog. Two sources may list one pack name, so an install is joined
  // to its record by the exact source as well as by name and operation. A refresh
  // and a removal name no source: the provider selects it from the installed
  // record, so their join is the receipt, name and operation alone.
  const recordSource = value => value?.receipt?.catalogSource?.key ?? null;
  const source = target === record ? recordSource(record) : target.source ?? null;
  const result = record && packBindingMatches(record, feed)
    && record.name === target.name && record.operation === target.operation
    && (target.operation !== 'install' || recordSource(record) === source) ? record : null;
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
    // The saved source this request is bound to, echoed by the provider's own
    // receipt, or null for the default catalog. It names nothing this tab chose.
    catalogSource: identityChanged ? null : result?.receipt.catalogSource ?? null,
    binding: attempt ? { attemptId: attempt.attemptId, name: attempt.name, operation: attempt.operation, authority,
      source: attempt.source ?? null }
      : binding || { packReceipt: record.packReceipt, name: record.name, operation: record.operation, authority,
        source: recordSource(record) },
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
  packs: null, packsLoading: false, discovering: false, packAttempt: null, importAttempt: null,
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
 * same source. Nothing here reads or stores a catalog; the next Reload replaces it.
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
    return { description: known ? known.description : null, use_cases: known ? known.use_cases : null };
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
  const packSequence = useRef(0);
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
                  next.packs = null; next.packAttempt = null; next.importAttempt = null;
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
                  next.packs = null; next.packAttempt = null; next.importAttempt = null;
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
      // A pack or import permission reply changes no workspace fact. Only the
      // provider's own result hint rereads packs, never a catalog acquisition here.
      queue(false, !/^(?:pack|import):/.test(record.request.requestRef));
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

  // `name` is the pack's name (see packActionReason), never a row key: the
  // prepare/submit bodies and every receipt binding keep the operation's name.
  // `source` is a saved source's key, only for an install from a source the
  // project added: it is the one choice a browser can make, it binds both bodies
  // and the receipt, and a default-catalog request carries no source at all.
  const requestPack = useCallback((operation, name, snapshot, source = null, key = null) => {
    if (locks.current.has('pack')) return null;
    const before = current.current, owner = lifetime.current;
    const attempt = { attemptId: ++packSequence.current, name, operation, source,
      authority: authorityKey(before.needs), rootKey: before.rootKey, packReceipt: null, phase: 'preparing' };
    const reason = locks.current.has('capture') ? PACK_MESSAGES.capture_unreconciled
      : locks.current.has('import') ? PACK_MESSAGES.import_unreconciled
      : snapshot !== before.packs ? 'The displayed pack read changed. Reload packs before requesting a change.'
        : packActionReason(before, operation, name, key);
    update({ packAttempt: reason ? { ...attempt, phase: 'unavailable', message: reason } : attempt });
    if (reason) return attempt;
    locks.current.add('pack');
    work.current.epoch += 1;
    const mark = change => update(previous => previous.packAttempt?.attemptId === attempt.attemptId
      ? { ...previous, packAttempt: { ...previous.packAttempt, ...change } } : previous);
    const chosen = source ? { source } : {};
    // The saved source a receipt must be bound to. An install names it, so it is the chosen key. A refresh
    // never names one: the provider takes the added source that matches the installed record, so the
    // expected binding is the one the displayed read matched, and none for a built-in, unlisted or unknown record.
    // Nothing else is bound, and a receipt that names another source is not this request's.
    const expected = (() => {
      if (operation === 'install') return source;
      if (operation !== 'refresh') return null;
      const row = before.packs?.items?.find(item => item.installed && item.name === name);
      return before.packs?.sources?.items?.find(item => item.scope === 'project' && item.key === row?.sourceKey)?.key ?? null;
    })();
    const boundTo = record => (record.receipt?.catalogSource?.key ?? null) === expected;
    let submitted = false;
    void (async () => {
      try {
        const prepared = await json('/api/packs/request', {
          body: { op: 'prepare', operation, name, ...chosen }, signal: owner.signal,
        });
        if (lifetime.current !== owner || before.rootKey !== current.current.rootKey
          || attempt.authority !== authorityKey(current.current.needs)
          || current.current.needs?.coverage.state === 'unavailable' || current.current.issues.needs
          || !packBindingMatches(prepared, before.needs) || prepared.phase !== 'prepared'
          || prepared.operation !== operation || prepared.name !== name || !boundTo(prepared)) {
          throw Object.assign(new Error(PACK_MESSAGES.identity_mismatch), { code: 'identity_mismatch' });
        }
        mark({ packReceipt: prepared.packReceipt, phase: 'submitting' });
        submitted = true;
        const result = await json('/api/packs/request', {
          body: { op: 'submit', operation, name, ...chosen, packReceipt: prepared.packReceipt }, signal: owner.signal,
        });
        if (!packBindingMatches(result, before.needs) || result.packReceipt !== prepared.packReceipt
          || result.operation !== operation || result.name !== name || !boundTo(result)) {
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
    const reason = locks.current.has('pack') ? IMPORT_MESSAGES.pack_unreconciled
      : locks.current.has('capture') ? IMPORT_MESSAGES.capture_unreconciled : importActionReason(before);
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
    respond, capture, requestPack, requestImport, openReview, readHistory, readAbout };
}

// @ts-check
/**
 * Direct A2A v1.0.0 JSON-RPC Message transport for one local Dude activation.
 *
 * Serving binds exactly one configured loopback or private-LAN literal with
 * mutual TLS and a pinned peer certificate. An admitted question's response
 * stays open while the serving session answers it; the handle passed to
 * `onQuestion` measures the exact encoded reply, reports client loss from
 * the response lifecycle, and reports whether the reply was written. Asking
 * connects to exactly one configured endpoint, verifies the pinned server
 * certificate, and rechecks the approved binding before any request byte is
 * written. An answer is accepted only in its exact envelope: excerpt hashes
 * and complete, untruncated run output digests are recomputed, and run
 * records must match the exchange and their own revision policy. Both sides
 * refuse v0.3, Tasks, streaming, push, redirects, and wire messages over the
 * profile's `contentBytes`.
 *
 * Importing this module loads no SDK code. The bundled runtime
 * (`./a2a-runtime.mjs`) is imported only by `startServer` and `prepareClient`,
 * which `a2a.mjs` calls only after a local activation. `prepareClient().send`
 * is called only by the `dude_a2a_ask` tool in `a2a.mjs`.
 */
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

export const ENVELOPE_VERSION = 1;
const MESSAGE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const REASON = /^[a-z][a-z0-9_]{0,63}$/;
const DISALLOWED_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const QUESTION_OUTPUT_MODES = new Set(['application/json', 'text/plain']);
const REPLY_OUTCOMES = new Set(['unavailable', 'refused']);
const EXCHANGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const COMMIT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const COMMAND_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RUN_OUTCOMES = new Set(['exited', 'spawn_failed', 'timed_out', 'cancelled']);
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */
/** @typedef {(error?: unknown) => void} Next */
/** @typedef {(request: IncomingMessage, response: ServerResponse, next: Next) => void} Handler */
/**
 * @typedef {((request: IncomingMessage, response: ServerResponse) => void) & {
 *   use: (...handlers: Array<string | Handler | ((error: unknown, request: IncomingMessage, response: ServerResponse, next: Next) => void)>) => unknown,
 *   post: (path: string, ...handlers: Handler[]) => unknown,
 *   disable: (setting: string) => unknown,
 *   set: (setting: string, value: unknown) => unknown,
 * }} ExpressApp
 */
/**
 * @typedef {object} JsonRpcClient
 * @property {(params: object, options: {serviceParameters: Record<string, string>, signal: AbortSignal}) => Promise<unknown>} sendMessage
 */
/** @typedef {new (message?: string) => Error} ErrorClass */
/**
 * The bundled runtime surface this adapter uses; see scripts/dude-a2a/entry.mjs.
 * @typedef {object} A2aRuntime
 * @property {() => ExpressApp} express
 * @property {(options: {agentCardProvider: () => Promise<object>, cache: {maxAge: number}}) => Handler} agentCardHandler
 * @property {(options: {requestHandler: object, userBuilder: (request: unknown) => Promise<{isAuthenticated: boolean, userName: string}>}) => Handler} jsonRpcHandler
 * @property {new (options: {fetchImpl: typeof fetch}) => {create: (url: string, card: object) => Promise<JsonRpcClient>}} JsonRpcTransportFactory
 * @property {string} A2A_PROTOCOL_VERSION
 * @property {string} A2A_VERSION_HEADER
 * @property {string} AGENT_CARD_PATH
 * @property {{ROLE_USER: number, ROLE_AGENT: number}} Role
 * @property {ErrorClass} A2AError
 * @property {ErrorClass} ContentTypeNotSupportedError
 * @property {ErrorClass} ExtendedAgentCardNotConfiguredError
 * @property {ErrorClass} PushNotificationNotSupportedError
 * @property {ErrorClass} RequestMalformedError
 * @property {ErrorClass} UnsupportedOperationError
 * @property {ErrorClass} VersionNotSupportedError
 * @property {(error: unknown) => {code: number, message: string}} toJsonRpcError
 */
/** @typedef {{address: string, port: number}} Endpoint */
/** @typedef {{cert: Buffer, key: Buffer}} TlsMaterial */
/** @typedef {{outcome: 'unavailable' | 'refused', reason: string}} PeerReply A definite non-answer. */
/**
 * One existing file the serving adapter read for a reply. `bytes` and
 * `sha256` cover exactly `text`, so the asker can recompute them; the file
 * fields are the serving adapter's observation of the whole file.
 * @typedef {object} FileEvidence
 * @property {'file'} kind
 * @property {string} reference Evidence-root label and relative path; never an absolute path.
 * @property {{start: number, end: number} | null} lines Null means the whole file.
 * @property {string} text
 * @property {number} bytes
 * @property {string} sha256
 * @property {number} fileBytes
 * @property {string} fileSha256
 * @property {string} readAt When the serving adapter read the file.
 * @property {string} mtime Filesystem modification time; metadata only.
 * @property {string} claimedProvenance The serving model's account of what the file itself claims.
 */
/**
 * A model-authored answer and the adapter-created evidence it cites.
 * @typedef {object} Answer
 * @property {'answer'} outcome
 * @property {string} exchangeId The serving side's exchange ID.
 * @property {string} conclusion
 * @property {string} limitations
 * @property {Array<FileEvidence | RunEvidence>} evidence
 */
/**
 * One output stream of a run, as the serving adapter observed it.
 * @typedef {object} StreamRecord
 * @property {number} bytes Total bytes observed.
 * @property {boolean} complete The stream reached its end while observed.
 * @property {string | null} sha256 Full-stream digest, present only when complete.
 * @property {number} retained Bytes kept: a prefix within the approved bound, cut at a UTF-8 boundary.
 * @property {string} text The kept bytes as text.
 * @property {boolean} lossy The kept bytes were not valid UTF-8, so `text` is not byte-exact.
 */
/**
 * One Git observation of the serving workspace, or why none exists.
 * @typedef {object} RevisionObservation
 * @property {string | null} head
 * @property {number | null} statusBytes Bytes of `status --porcelain=v1 -z` output.
 * @property {string | null} statusSha256
 * @property {boolean | null} clean
 * @property {string | null} unknown Why nothing was observed; null when observed.
 */
/**
 * Non-secret environment facts of a run: declared names, never values.
 * @typedef {object} RunEnvironment
 * @property {string} platform
 * @property {string} arch
 * @property {Array<{name: string, present: boolean}>} inherited
 * @property {string[]} fixed
 * @property {string[]} blanked Windows-supplied names passed blank because they were not declared.
 * @property {'hidden'} values
 */
/**
 * A termination request for a run and what was observed of it. None of it
 * proves that the process tree stopped.
 * @typedef {object} TerminationRecord
 * @property {string} reason Why termination was requested: timeout, or the cancellation cause.
 * @property {string} method
 * @property {string} result `requested` when issued; `failed`, `unavailable`, or `no_such_group` when it could not be.
 * @property {string | null} error The error code when issuing failed, including a helper that failed to launch.
 * @property {{started: boolean, exit: {code: number | null, signal: string | null} | null} | null} helper
 *   The Windows taskkill helper's observed start and exit; null when no helper process is used.
 */
/**
 * One run the serving adapter started for this exchange. Every field is
 * adapter-recorded; the serving model can only cite it by `runId`.
 * @typedef {object} RunEvidence
 * @property {'run'} kind
 * @property {string} runId
 * @property {string} exchangeId
 * @property {string} commandId
 * @property {string} commandDigest
 * @property {Record<string, string>} params
 * @property {string} executable
 * @property {string[]} argv
 * @property {string} cwd
 * @property {string} workspace
 * @property {{policy: 'commit' | 'worktree', pin: string | null, before: RevisionObservation, after: RevisionObservation,
 *   changedDuringRun: boolean | 'unknown'}} revision
 * @property {RunEnvironment} environment
 * @property {string | null} startedAt
 * @property {string} endedAt
 * @property {'exited' | 'spawn_failed' | 'timed_out' | 'cancelled'} outcome
 * @property {{code: number | null, signal: string | null} | null} exit The observed direct exit, if any.
 * @property {TerminationRecord | null} termination
 * @property {StreamRecord} stdout
 * @property {StreamRecord} stderr
 */
/** @typedef {{commandId: string, params: Record<string, string>}} RequestedOperation An operation the asker requests; never approval. */
/** @typedef {PeerReply | Answer} ServeReply */
/** @typedef {ServeReply & {questionId: string}} AskReply The reply plus this question's message ID. */
/**
 * The serving side's handle on one admitted question's still-open response.
 * @typedef {object} Delivery
 * @property {AbortSignal} signal Aborts when the response closes before it finished: the asker can no longer receive a reply.
 * @property {(reply: ServeReply) => number} measure Exact encoded size of the response body that would carry `reply`.
 * @property {Promise<'sent' | 'too_large' | 'lost' | 'failed'>} written Settles when the response finishes or closes early.
 */
/**
 * @typedef {'ok'|'encryption_required'|'certificate_required'|'certificate_mismatch'|
 *   'certificate_not_current'|'unexpected_address'} PeerCheck
 */
/**
 * @typedef {object} ServeOptions
 * @property {string} label Local participant label, shown only as the card name.
 * @property {Endpoint} listen
 * @property {{label: string, address: string, certSha256: string}} peer
 * @property {TlsMaterial} tls
 * @property {number} contentBytes
 * @property {readonly string[]} commandIds Selected catalog IDs; the card lists IDs only.
 * @property {() => boolean} checkBinding Rechecks the activation; false has ended it.
 * @property {(question: {messageId: string, text: string, requested: RequestedOperation[]}, delivery: Delivery) => ServeReply | null | Promise<ServeReply | null>} onQuestion
 *   Null withdraws the reply: the response is destroyed and nothing is written.
 * @property {(reason: string) => void} onRefused Metadata-only refusal notice.
 * @property {() => number} [now]
 */
/**
 * @typedef {object} AskOptions
 * @property {Endpoint & {label: string, certSha256: string}} peer
 * @property {TlsMaterial} tls
 * @property {number} contentBytes
 * @property {() => boolean} checkBinding Called after each pinned handshake,
 *   with no await before the first request byte; false or a throw closes the
 *   socket and refuses the ask unsent.
 * @property {() => number} [now]
 */

/**
 * `sent` is false only when no request byte can have reached the peer.
 */
export class A2aTransportError extends Error {
  /** @param {string} code @param {{sent?: boolean, status?: number | null}} [details] */
  constructor(code, { sent = false, status = null } = {}) {
    super(code);
    this.code = code;
    this.sent = sent;
    this.status = status;
  }
}

/** Lazily load the bundled SDK runtime. */
export async function loadRuntime() {
  return /** @type {A2aRuntime} */ (/** @type {unknown} */ (await import('./a2a-runtime.mjs')));
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value @param {readonly string[]} required @param {readonly string[]} [optional]
 * @returns {Record<string, unknown> | null}
 */
function closed(value, required, optional = []) {
  if (!isRecord(value)) return null;
  if (!required.every((key) => Object.hasOwn(value, key))) return null;
  return Object.keys(value).every((key) => required.includes(key) || optional.includes(key)) ? value : null;
}

/** @param {Buffer | Uint8Array} bytes */
export function certificateFingerprint(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Normalize an IP literal for comparison: IPv4-mapped IPv6 becomes IPv4 and
 * IPv6 uses its canonical compressed form. Anything else returns null.
 * @param {unknown} value
 */
export function normalizeAddress(value) {
  if (typeof value !== 'string') return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value);
  const candidate = mapped ? mapped[1] : value;
  if (net.isIPv4(candidate)) return candidate;
  if (net.isIPv6(candidate)) return new URL(`https://[${candidate}]/`).hostname.slice(1, -1);
  return null;
}

/**
 * Same-computer or private-LAN literals only: IPv4 loopback and RFC 1918
 * ranges, IPv6 loopback and unique-local addresses. Wildcards, hostnames,
 * link-local, mapped, and public addresses are refused.
 * @param {unknown} value
 * @returns {null | 'not_ip_literal' | 'not_canonical' | 'wildcard' | 'not_private'}
 */
export function endpointAddressError(value) {
  if (typeof value !== 'string' || net.isIP(value) === 0) return 'not_ip_literal';
  if (normalizeAddress(value) !== value) return 'not_canonical';
  if (value === '0.0.0.0' || value === '::') return 'wildcard';
  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      ? null : 'not_private';
  }
  return value === '::1' || /^f[cd][0-9a-f]{2}:/.test(value) ? null : 'not_private';
}

/** @param {Endpoint} endpoint */
export function endpointUrl({ address, port }) {
  return `https://${address.includes(':') ? `[${address}]` : address}:${port}/`;
}

/**
 * Authenticate one TLS socket against the owner-pinned peer. The pin is the
 * SHA-256 of the DER certificate; a self-signed peer is expected, so CA
 * validation is not the trust decision.
 * @param {unknown} socket
 * @param {{certSha256: string, address?: string}} peer `address` also checks the remote literal.
 * @param {number} now
 * @returns {PeerCheck}
 */
export function checkPeer(socket, peer, now) {
  if (!isRecord(socket) || socket.encrypted !== true || typeof socket.getPeerCertificate !== 'function') {
    return 'encryption_required';
  }
  const certificate = socket.getPeerCertificate();
  if (!isRecord(certificate) || !Buffer.isBuffer(certificate.raw) || certificate.raw.length === 0) {
    return 'certificate_required';
  }
  if (certificateFingerprint(certificate.raw) !== peer.certSha256) return 'certificate_mismatch';
  const from = Date.parse(String(certificate.valid_from));
  const to = Date.parse(String(certificate.valid_to));
  if (!Number.isFinite(from) || !Number.isFinite(to) || now < from || now > to) return 'certificate_not_current';
  if (peer.address !== undefined && normalizeAddress(socket.remoteAddress) !== peer.address) return 'unexpected_address';
  return 'ok';
}

/**
 * Questions and model prose on the wire: non-empty, well-formed, and free of
 * control characters other than tab and line breaks.
 * @param {unknown} text @returns {text is string}
 */
export function isMessageText(text) {
  return typeof text === 'string' && text.trim().length > 0 && !DISALLOWED_TEXT.test(text)
    && Buffer.from(text, 'utf8').toString('utf8') === text;
}

/** Any well-formed text, including empty text and control characters: file excerpts. @param {unknown} text @returns {text is string} */
function isWellFormed(text) {
  return typeof text === 'string' && Buffer.from(text, 'utf8').toString('utf8') === text;
}

/** @param {unknown} value @returns {value is number} */
function isCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value @returns {value is string} */
function isTime(value) {
  return typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
}

/** A root label and relative path; never absolute, `.`, `..`, empty-segment, or control text. @param {unknown} value @returns {value is string} */
function isReference(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !CONTROL_CHARACTER.test(value)
    && !value.startsWith('/') && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** @param {unknown} value @returns {FileEvidence | null} */
function readFileEvidence(value) {
  const item = closed(value, ['kind', 'reference', 'lines', 'text', 'bytes', 'sha256', 'fileBytes', 'fileSha256', 'readAt', 'mtime', 'claimedProvenance']);
  if (!item || item.kind !== 'file' || !isReference(item.reference) || !isWellFormed(item.text) || !isCount(item.bytes)
    || typeof item.sha256 !== 'string' || !isCount(item.fileBytes) || typeof item.fileSha256 !== 'string'
    || !SHA256_HEX.test(item.fileSha256) || !isTime(item.readAt) || !isTime(item.mtime) || !isMessageText(item.claimedProvenance)) {
    return null;
  }
  /** @type {{start: number, end: number} | null} */
  let lines = null;
  if (item.lines !== null) {
    const range = closed(item.lines, ['start', 'end']);
    if (!range || !isCount(range.start) || !isCount(range.end) || range.start < 1 || range.end < range.start) return null;
    lines = { start: range.start, end: range.end };
  }
  // Recompute what the received text proves; a whole-file excerpt must also match the file fields.
  const exact = Buffer.from(item.text, 'utf8');
  if (item.bytes !== exact.length || item.sha256 !== createHash('sha256').update(exact).digest('hex') || item.fileBytes < item.bytes
    || (lines === null && (item.fileBytes !== item.bytes || item.fileSha256 !== item.sha256))) {
    return null;
  }
  return {
    kind: 'file',
    reference: item.reference,
    lines,
    text: item.text,
    bytes: item.bytes,
    sha256: item.sha256,
    fileBytes: item.fileBytes,
    fileSha256: item.fileSha256,
    readAt: item.readAt,
    mtime: item.mtime,
    claimedProvenance: item.claimedProvenance,
  };
}

/**
 * The exact answer envelope, or null. The serving side checks its own reply
 * with this before sending; the asking side checks the reply it received and
 * so recomputes each excerpt's size and hash and each complete, untruncated
 * run output digest.
 * @param {unknown} value
 * @returns {Answer | null}
 */
export function readAnswer(value) {
  const data = closed(value, ['outcome', 'exchangeId', 'conclusion', 'limitations', 'evidence']);
  if (!data || data.outcome !== 'answer' || typeof data.exchangeId !== 'string' || !EXCHANGE_ID.test(data.exchangeId)
    || !isMessageText(data.conclusion) || !isMessageText(data.limitations) || !Array.isArray(data.evidence)) {
    return null;
  }
  const exchangeId = data.exchangeId;
  /** @type {Array<FileEvidence | RunEvidence>} */
  const evidence = [];
  for (const entry of data.evidence) {
    const item = isRecord(entry) && entry.kind === 'run' ? readRunEvidence(entry, exchangeId) : readFileEvidence(entry);
    if (!item) return null;
    evidence.push(item);
  }
  return { outcome: 'answer', exchangeId, conclusion: data.conclusion, limitations: data.limitations, evidence };
}

/** An argument element or other single-line field: well-formed, without control characters. @param {unknown} value @returns {value is string} */
function isArgument(value) {
  return typeof value === 'string' && !CONTROL_CHARACTER.test(value) && isWellFormed(value);
}

/** @param {unknown} value @returns {value is string} */
function isField(value) {
  return isArgument(value) && value.length > 0;
}

/** @param {unknown} value @returns {Record<string, string> | null} */
function readParams(value) {
  if (!isRecord(value)) return null;
  /** @type {Record<string, string>} */
  const params = {};
  for (const [name, param] of Object.entries(value)) {
    if (!PARAM_NAME.test(name) || !isArgument(param)) return null;
    params[name] = param;
  }
  return params;
}

/**
 * Requested operations: command IDs and parameter values only, never an
 * executable, arguments, or approval.
 * @param {unknown} value @returns {RequestedOperation[] | null}
 */
export function readRequested(value) {
  if (!Array.isArray(value)) return null;
  /** @type {RequestedOperation[]} */
  const operations = [];
  for (const entry of value) {
    const operation = closed(entry, ['commandId', 'params']);
    const params = operation && readParams(operation.params);
    if (!operation || typeof operation.commandId !== 'string' || !COMMAND_ID.test(operation.commandId) || !params) return null;
    operations.push({ commandId: operation.commandId, params });
  }
  return operations;
}

/** @param {unknown} value @returns {RevisionObservation | null} */
function readObservation(value) {
  const seen = closed(value, ['head', 'statusBytes', 'statusSha256', 'clean', 'unknown']);
  if (!seen) return null;
  if (seen.unknown !== null) {
    return typeof seen.unknown === 'string' && REASON.test(seen.unknown) && seen.head === null && seen.statusBytes === null
      && seen.statusSha256 === null && seen.clean === null
      ? { head: null, statusBytes: null, statusSha256: null, clean: null, unknown: seen.unknown } : null;
  }
  if (typeof seen.head !== 'string' || !COMMIT_ID.test(seen.head) || !isCount(seen.statusBytes) || typeof seen.statusSha256 !== 'string'
    || !SHA256_HEX.test(seen.statusSha256) || seen.clean !== (seen.statusBytes === 0)) {
    return null;
  }
  return { head: seen.head, statusBytes: seen.statusBytes, statusSha256: seen.statusSha256, clean: seen.clean, unknown: null };
}

/**
 * One captured stream. A digest is claimed only for a complete stream, and a
 * complete, untruncated, byte-exact stream is recomputed from its text.
 * @param {unknown} value @returns {StreamRecord | null}
 */
function readStream(value) {
  const stream = closed(value, ['bytes', 'complete', 'sha256', 'retained', 'text', 'lossy']);
  if (!stream || !isCount(stream.bytes) || typeof stream.complete !== 'boolean' || !isCount(stream.retained) || stream.retained > stream.bytes
    || !isWellFormed(stream.text) || typeof stream.lossy !== 'boolean') {
    return null;
  }
  const sha256 = stream.sha256;
  if (stream.complete ? typeof sha256 !== 'string' || !SHA256_HEX.test(sha256) : sha256 !== null) return null;
  const exact = Buffer.from(stream.text, 'utf8');
  if (!stream.lossy && exact.length !== stream.retained) return null;
  if (stream.complete && !stream.lossy && stream.retained === stream.bytes && createHash('sha256').update(exact).digest('hex') !== sha256) return null;
  return { bytes: stream.bytes, complete: stream.complete, sha256, retained: stream.retained, text: stream.text, lossy: stream.lossy };
}

/** @param {unknown} value @returns {RunEnvironment | null} */
function readEnvironment(value) {
  const facts = closed(value, ['platform', 'arch', 'inherited', 'fixed', 'blanked', 'values']);
  if (!facts || !isField(facts.platform) || !isField(facts.arch) || facts.values !== 'hidden' || !Array.isArray(facts.inherited)
    || !Array.isArray(facts.fixed) || !Array.isArray(facts.blanked)) {
    return null;
  }
  /** @type {Array<{name: string, present: boolean}>} */
  const inherited = [];
  for (const entry of facts.inherited) {
    const name = closed(entry, ['name', 'present']);
    if (!name || typeof name.name !== 'string' || !ENV_NAME.test(name.name) || typeof name.present !== 'boolean') return null;
    inherited.push({ name: name.name, present: name.present });
  }
  const names = (/** @type {unknown[]} */ list) => (list.every((name) => typeof name === 'string' && ENV_NAME.test(name)) ? list.map(String) : null);
  const fixed = names(facts.fixed);
  const blanked = names(facts.blanked);
  if (!fixed || !blanked) return null;
  return { platform: facts.platform, arch: facts.arch, inherited, fixed, blanked, values: 'hidden' };
}

/**
 * One run record, consistent with this exchange, its revision policy, and its
 * outcome: a commit-pinned run started only on the pinned, clean revision; a
 * change flag follows from the two observations; an unstarted run has no exit.
 * @param {Record<string, unknown>} value @param {string} exchangeId @returns {RunEvidence | null}
 */
function readRunEvidence(value, exchangeId) {
  const run = closed(value, ['kind', 'runId', 'exchangeId', 'commandId', 'commandDigest', 'params', 'executable', 'argv', 'cwd',
    'workspace', 'revision', 'environment', 'startedAt', 'endedAt', 'outcome', 'exit', 'termination', 'stdout', 'stderr']);
  if (!run || run.kind !== 'run' || typeof run.runId !== 'string' || !EXCHANGE_ID.test(run.runId) || run.exchangeId !== exchangeId
    || typeof run.commandId !== 'string' || !COMMAND_ID.test(run.commandId) || typeof run.commandDigest !== 'string'
    || !SHA256_HEX.test(run.commandDigest) || !isField(run.executable) || !isField(run.cwd) || !isField(run.workspace)
    || !Array.isArray(run.argv) || !run.argv.every(isArgument) || typeof run.outcome !== 'string' || !RUN_OUTCOMES.has(run.outcome)
    || !isTime(run.endedAt) || !(run.startedAt === null || isTime(run.startedAt))) {
    return null;
  }
  const params = readParams(run.params);
  const environment = readEnvironment(run.environment);
  const stdout = readStream(run.stdout);
  const stderr = readStream(run.stderr);
  const revision = closed(run.revision, ['policy', 'pin', 'before', 'after', 'changedDuringRun']);
  const before = revision && readObservation(revision.before);
  const after = revision && readObservation(revision.after);
  if (!params || !environment || !stdout || !stderr || !revision || !before || !after) return null;
  if (revision.policy === 'commit') {
    if (typeof revision.pin !== 'string' || !COMMIT_ID.test(revision.pin) || before.head !== revision.pin || before.clean !== true) return null;
  } else if (revision.policy !== 'worktree' || revision.pin !== null) {
    return null;
  }
  const changed = before.unknown !== null || after.unknown !== null ? 'unknown'
    : before.head !== after.head || before.statusSha256 !== after.statusSha256;
  if (revision.changedDuringRun !== changed) return null;
  const exit = run.exit === null ? null : readExit(run.exit);
  const termination = run.termination === null ? null : readTermination(run.termination);
  if ((run.exit !== null && !exit) || (run.termination !== null && !termination)) return null;
  if ((run.outcome === 'spawn_failed' && (run.startedAt !== null || exit !== null || termination !== null))
    || (run.outcome === 'exited' && (run.startedAt === null || exit === null || termination !== null))
    || ((run.outcome === 'timed_out' || run.outcome === 'cancelled') && run.startedAt !== null && termination === null)) {
    return null;
  }
  return {
    kind: 'run',
    runId: run.runId,
    exchangeId,
    commandId: run.commandId,
    commandDigest: run.commandDigest,
    params,
    executable: run.executable,
    argv: run.argv.map(String),
    cwd: run.cwd,
    workspace: run.workspace,
    revision: { policy: revision.policy, pin: revision.pin, before, after, changedDuringRun: changed },
    environment,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    outcome: /** @type {RunEvidence['outcome']} */ (run.outcome),
    exit,
    termination,
    stdout,
    stderr,
  };
}

/** @param {unknown} value @returns {{code: number | null, signal: string | null} | null} */
function readExit(value) {
  const exit = closed(value, ['code', 'signal']);
  if (!exit || !(exit.code === null || Number.isSafeInteger(exit.code)) || !(exit.signal === null || isField(exit.signal))) return null;
  return { code: exit.code === null ? null : Number(exit.code), signal: exit.signal === null ? null : String(exit.signal) };
}

/**
 * A termination record whose parts agree: an error code exactly when issuing
 * failed, and a helper exit only after the helper was seen to start.
 * @param {unknown} value @returns {TerminationRecord | null}
 */
function readTermination(value) {
  const termination = closed(value, ['reason', 'method', 'result', 'error', 'helper']);
  if (!termination || !isField(termination.reason) || !isField(termination.method) || !isField(termination.result)
    || !(termination.error === null || isField(termination.error)) || (termination.result === 'failed') !== (termination.error !== null)) {
    return null;
  }
  /** @type {TerminationRecord['helper']} */
  let helper = null;
  if (termination.helper !== null) {
    const seen = closed(termination.helper, ['started', 'exit']);
    const exit = seen && seen.exit !== null ? readExit(seen.exit) : null;
    if (!seen || typeof seen.started !== 'boolean' || (seen.exit !== null && (!exit || !seen.started))) return null;
    helper = { started: seen.started, exit };
  }
  return {
    reason: String(termination.reason),
    method: String(termination.method),
    result: String(termination.result),
    error: termination.error === null ? null : String(termination.error),
    helper,
  };
}

/**
 * @param {unknown} metadata @param {readonly string[]} [required] @param {readonly string[]} [optional]
 */
function envelope(metadata, required = [], optional = []) {
  const outer = closed(metadata, ['dudeA2a']);
  const inner = outer && closed(outer.dudeA2a, ['version', ...required], optional);
  return inner && inner.version === ENVELOPE_VERSION ? inner : null;
}

/**
 * Exact wire shape of one question. The SDK codecs accept aliases and drop
 * unknown fields, so the raw body is checked before the SDK parses it.
 * @param {unknown} params
 * @returns {string | null} a refusal reason, or null when admissible
 */
function questionShapeError(params) {
  const body = closed(params, ['message'], ['configuration']);
  if (!body) return 'invalid_params';
  const message = closed(body.message, ['messageId', 'role', 'parts', 'metadata']);
  if (!message) return 'invalid_message';
  if (typeof message.messageId !== 'string' || !MESSAGE_ID.test(message.messageId)) return 'invalid_message_id';
  if (message.role !== 'ROLE_USER') return 'invalid_role';
  if (!Array.isArray(message.parts) || message.parts.length !== 1) return 'invalid_parts';
  const part = closed(message.parts[0], ['text'], ['mediaType']);
  if (!part || !isMessageText(part.text) || (part.mediaType !== undefined && part.mediaType !== 'text/plain')) {
    return 'invalid_text_part';
  }
  const inner = envelope(message.metadata, [], ['requested']);
  if (!inner) return 'invalid_envelope';
  if (inner.requested !== undefined && !readRequested(inner.requested)) return 'invalid_requested';
  if (body.configuration === undefined) return null;
  const configuration = closed(body.configuration, [], ['acceptedOutputModes', 'returnImmediately']);
  const modes = configuration?.acceptedOutputModes;
  if (!configuration || (configuration.returnImmediately !== undefined && configuration.returnImmediately !== false)
    || (modes !== undefined && !(Array.isArray(modes) && modes.every((mode) => QUESTION_OUTPUT_MODES.has(String(mode)))))) {
    return 'unsupported_configuration';
  }
  return null;
}

/** @param {unknown} id */
function isRpcId(id) {
  return (typeof id === 'string' && id.length > 0 && id.length <= 128) || Number.isSafeInteger(id);
}

/**
 * @param {IncomingMessage} request @param {number} limit
 * @returns {Promise<Buffer>}
 */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let total = 0;
    let settled = false;
    request.on('data', (/** @type {Buffer} */ chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        settled = true;
        reject(new A2aTransportError('content_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    request.once('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    request.once('error', () => {
      if (!settled) {
        settled = true;
        reject(new A2aTransportError('request_aborted'));
      }
    });
  });
}

/** @param {ServeOptions} options */
function serveCard(options) {
  return {
    name: `Dude ${options.label}`,
    description: 'Dude confirmation peer for owner-approved evidence questions. Declared capabilities grant no approval.',
    supportedInterfaces: [{ url: endpointUrl(options.listen), protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    version: String(ENVELOPE_VERSION),
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    securitySchemes: { mtls: { mtlsSecurityScheme: { description: 'Mutual TLS with an owner-pinned certificate.' } } },
    securityRequirements: [{ schemes: { mtls: {} } }],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'confirmation',
        name: 'Evidence confirmation',
        description: 'Answers owner-approved evidence questions while this session is receiving.',
        tags: ['confirmation'],
      },
      ...options.commandIds.map((id) => ({
        id: `command:${id}`,
        name: id,
        description: 'Owner-selected verification command ID; its definition is not advertised.',
        tags: ['verification'],
      })),
    ],
  };
}

/** @typedef {{messageId: string, contextId: string, replyTo: string}} ReplyIds */

/**
 * The direct Message carrying one reply, in the SDK's internal form.
 * @param {A2aRuntime} runtime @param {ReplyIds} ids @param {ServeReply} reply
 */
function replyMessage(runtime, ids, reply) {
  return {
    messageId: ids.messageId,
    contextId: ids.contextId,
    taskId: '',
    role: runtime.Role.ROLE_AGENT,
    parts: [{ content: { $case: 'data', value: reply }, metadata: undefined, filename: '', mediaType: 'application/json' }],
    metadata: { dudeA2a: { version: ENVELOPE_VERSION, replyTo: ids.replyTo } },
    extensions: [],
    referenceTaskIds: [],
  };
}

/**
 * The exact JSON-RPC body the SDK writes for `replyMessage`: its
 * Message.toJSON omits the empty task ID, filename, extensions, and task
 * references, and Express serializes with plain JSON.stringify. Tests compare
 * this with the bytes the real stack writes.
 * @param {unknown} rpcId @param {ReplyIds} ids @param {ServeReply} reply
 */
function replyBody(rpcId, ids, reply) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: rpcId,
    result: {
      message: {
        messageId: ids.messageId,
        contextId: ids.contextId,
        role: 'ROLE_AGENT',
        parts: [{ data: reply, mediaType: 'application/json' }],
        metadata: { dudeA2a: { version: ENVELOPE_VERSION, replyTo: ids.replyTo } },
      },
    },
  });
}

/**
 * Track one admitted question's open response. The request stream has
 * already ended when the handler runs and a completed request body also
 * emits `close`, so only the response closing before it finished means the
 * asker can no longer receive a reply.
 * @param {ServerResponse} response @param {unknown} rpcId @param {ReplyIds} ids
 * @param {WeakSet<ServerResponse>} overBudget Responses whose body limitResponse withheld.
 * @returns {Delivery}
 */
function createDelivery(response, rpcId, ids, overBudget) {
  const lost = new AbortController();
  /** @type {(outcome: 'sent' | 'too_large' | 'lost' | 'failed') => void} */
  let settle = () => undefined;
  /** @type {Promise<'sent' | 'too_large' | 'lost' | 'failed'>} */
  const written = new Promise((resolve) => { settle = resolve; });
  const onFinish = () => {
    response.removeListener('finish', onFinish);
    response.removeListener('close', onClose);
    settle(overBudget.has(response) ? 'too_large' : response.statusCode === 200 ? 'sent' : 'failed');
  };
  const onClose = () => {
    if (response.writableFinished) {
      onFinish();
      return;
    }
    response.removeListener('finish', onFinish);
    response.removeListener('close', onClose);
    lost.abort();
    settle('lost');
  };
  if (response.destroyed || response.closed) {
    lost.abort();
    settle('lost');
  } else {
    response.on('finish', onFinish);
    response.on('close', onClose);
  }
  return {
    signal: lost.signal,
    measure: (reply) => Buffer.byteLength(replyBody(rpcId, ids, reply), 'utf8'),
    written,
  };
}

/**
 * The SDK request handler for one serving activation. Only blocking
 * SendMessage with a direct Message result exists; every Task, streaming,
 * push, and extended-card operation is refused.
 * @param {A2aRuntime} runtime @param {ServeOptions} options @param {object} card
 * @param {WeakMap<object, {response: ServerResponse, rpcId: unknown}>} admitted
 * @param {WeakSet<ServerResponse>} overBudget
 */
function createRequestHandler(runtime, options, card, admitted, overBudget) {
  const unsupported = async () => {
    throw new runtime.UnsupportedOperationError('This Dude peer supports only direct SendMessage.');
  };
  const noPush = async () => {
    throw new runtime.PushNotificationNotSupportedError('This Dude peer does not send push notifications.');
  };
  return {
    getAgentCard: async () => card,
    getAuthenticatedExtendedAgentCard: async () => {
      throw new runtime.ExtendedAgentCardNotConfiguredError('This Dude peer has no extended card.');
    },
    /**
     * @param {{message?: {messageId: string, parts: Array<{content?: {$case: string, value: unknown}}>, metadata?: unknown}}} params
     * @param {{state: Map<string, unknown>}} context
     */
    async sendMessage(params, context) {
      const headers = context.state.get('headers');
      const admission = isRecord(headers) ? admitted.get(headers) : undefined;
      if (!isRecord(headers) || !admission) {
        throw new runtime.RequestMalformedError('The request did not pass admission.');
      }
      admitted.delete(headers);
      const message = params.message;
      const content = message?.parts[0]?.content;
      if (!message || content?.$case !== 'text' || typeof content.value !== 'string') {
        throw new runtime.RequestMalformedError('A question needs exactly one text part.');
      }
      const ids = { messageId: randomUUID(), contextId: randomUUID(), replyTo: message.messageId };
      // The body arrived after the first check; recheck before handing it over.
      if (!options.checkBinding()) return replyMessage(runtime, ids, { outcome: 'unavailable', reason: 'activation_ended' });
      const delivery = createDelivery(admission.response, admission.rpcId, ids, overBudget);
      // The raw envelope was validated before the SDK parsed it.
      const inner = envelope(message.metadata, [], ['requested']);
      const requested = (inner && inner.requested !== undefined && readRequested(inner.requested)) || [];
      const reply = await options.onQuestion({ messageId: message.messageId, text: content.value, requested }, delivery);
      if (reply === null) {
        // Withdrawn: drop the connection. limitResponse writes nothing to a destroyed response.
        admission.response.destroy();
        return replyMessage(runtime, ids, { outcome: 'unavailable', reason: 'exchange_ended' });
      }
      return replyMessage(runtime, ids, reply);
    },
    sendMessageStream: async function* sendMessageStream() {
      yield* [];
      throw new runtime.UnsupportedOperationError('Streaming is not supported.');
    },
    resubscribe: async function* resubscribe() {
      yield* [];
      throw new runtime.UnsupportedOperationError('Task subscriptions are not supported.');
    },
    getTask: unsupported,
    cancelTask: unsupported,
    listTasks: unsupported,
    createTaskPushNotificationConfig: noPush,
    getTaskPushNotificationConfig: noPush,
    listTaskPushNotificationConfigs: noPush,
    deleteTaskPushNotificationConfig: noPush,
  };
}

/**
 * Enforce `contentBytes` on the encoded body of one serving response. Every
 * serving response is written by a single end() call: Express send/json, the
 * SDK card and JSON-RPC handlers, and the refusals below; streaming methods
 * are refused before they could write. An over-budget body is replaced by an
 * explicit, bounded 500 failure (empty when even that cannot fit); it is never
 * truncated or sent. Nothing is written to a destroyed response: a withdrawn
 * reply or a lost client.
 * @param {A2aRuntime} runtime @param {ServerResponse} response @param {number} limit
 * @param {() => unknown} requestId The JSON-RPC id, once known, for the failure envelope.
 * @param {(reason: string) => void} onRefused
 * @param {WeakSet<ServerResponse>} overBudget Records responses whose body was withheld.
 */
function limitResponse(runtime, response, limit, requestId, onRefused, overBudget) {
  const end = response.end;
  Object.defineProperty(response, 'end', {
    configurable: true,
    writable: true,
    value: (/** @type {unknown[]} */ ...args) => {
      if (response.destroyed) return response;
      const [chunk, encoding] = args;
      const size = typeof chunk === 'string'
        ? Buffer.byteLength(chunk, typeof encoding === 'string' && Buffer.isEncoding(encoding) ? encoding : 'utf8')
        : chunk instanceof Uint8Array ? chunk.length : 0;
      if (size <= limit) return Reflect.apply(end, response, args);
      overBudget.add(response);
      onRefused('response_over_budget');
      if (response.headersSent) {
        response.destroy();
        return response;
      }
      const id = requestId();
      const failure = Buffer.from(JSON.stringify(id === undefined ? { error: 'response_over_budget' } : {
        jsonrpc: '2.0',
        id,
        error: runtime.toJsonRpcError(new Error('The reply exceeds this peer\'s contentBytes and was withheld.')),
      }), 'utf8');
      const body = failure.length <= limit ? failure : Buffer.alloc(0);
      for (const name of response.getHeaderNames()) response.removeHeader(name);
      response.statusCode = 500;
      if (body.length) response.setHeader('content-type', 'application/json');
      response.setHeader('content-length', String(body.length));
      response.setHeader('connection', 'close');
      return Reflect.apply(end, response, [body]);
    },
  });
}

/**
 * Build the serving HTTP application without binding anything. Every
 * request is authenticated and rechecked against the activation before it
 * reaches the card or the SDK JSON-RPC handler, and every response body is
 * held to `contentBytes`.
 * @param {A2aRuntime} runtime @param {ServeOptions} options
 * @returns {ExpressApp}
 */
export function createServeApp(runtime, options) {
  const now = options.now ?? Date.now;
  const card = serveCard(options);
  /** @type {WeakMap<object, {response: ServerResponse, rpcId: unknown}>} */
  const admitted = new WeakMap();
  /** @type {WeakMap<ServerResponse, unknown>} */
  const rpcIds = new WeakMap();
  /** @type {WeakSet<ServerResponse>} */
  const overBudget = new WeakSet();
  /** @param {ServerResponse} response @param {number} status @param {string} reason */
  const refuse = (response, status, reason) => {
    options.onRefused(reason);
    response.statusCode = status;
    response.setHeader('content-type', 'application/json');
    response.setHeader('connection', 'close');
    response.end(JSON.stringify({ error: reason }));
  };
  /**
   * @param {ServerResponse} response @param {number} status @param {string} reason
   * @param {Error} error @param {unknown} [id]
   */
  const rpcRefuse = (response, status, reason, error, id = null) => {
    options.onRefused(reason);
    response.statusCode = status;
    response.setHeader('content-type', 'application/json');
    response.setHeader('connection', 'close');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: isRpcId(id) ? id : null, error: runtime.toJsonRpcError(error) }));
  };
  const app = runtime.express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use((_request, response, next) => {
    limitResponse(runtime, response, options.contentBytes, () => rpcIds.get(response), options.onRefused, overBudget);
    next();
  });
  app.use((request, response, next) => {
    const verdict = checkPeer(request.socket, options.peer, now());
    if (verdict !== 'ok') refuse(response, 403, verdict);
    else if (!options.checkBinding()) refuse(response, 503, 'activation_ended');
    else next();
  });
  app.use(`/${runtime.AGENT_CARD_PATH}`, runtime.agentCardHandler({
    agentCardProvider: async () => card,
    cache: { maxAge: 0 },
  }));
  app.post('/', (request, response, next) => {
    if (request.headers[runtime.A2A_VERSION_HEADER.toLowerCase()] !== runtime.A2A_PROTOCOL_VERSION) {
      rpcRefuse(response, 400, 'unsupported_version',
        new runtime.VersionNotSupportedError(`Only A2A ${runtime.A2A_PROTOCOL_VERSION} is supported.`));
      return;
    }
    const mediaType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      rpcRefuse(response, 415, 'unsupported_content_type', new runtime.ContentTypeNotSupportedError('Use application/json.'));
      return;
    }
    const declared = Number(request.headers['content-length']);
    if (request.headers['content-length'] !== undefined && !(declared <= options.contentBytes)) {
      rpcRefuse(response, 413, 'content_too_large', new runtime.RequestMalformedError('The request exceeds this peer\'s contentBytes.'));
      return;
    }
    readBody(request, options.contentBytes).then((bytes) => {
      /** @type {unknown} */
      let json;
      try {
        json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        options.onRefused('invalid_json');
        response.statusCode = 400;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON payload.' } }));
        return;
      }
      const rpc = closed(json, ['jsonrpc', 'method', 'id'], ['params']);
      if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || !isRpcId(rpc.id)) {
        rpcRefuse(response, 400, 'invalid_json_rpc', new runtime.RequestMalformedError('Invalid JSON-RPC request.'));
        return;
      }
      rpcIds.set(response, rpc.id);
      if (rpc.method === 'SendMessage') {
        const reason = questionShapeError(rpc.params);
        if (reason) {
          rpcRefuse(response, 400, reason, new runtime.RequestMalformedError('The question does not match the Dude envelope.'), rpc.id);
          return;
        }
        admitted.set(request.headers, { response, rpcId: rpc.id });
      }
      Object.defineProperty(request, 'body', { value: json, writable: true, configurable: true });
      next();
    }, (/** @type {unknown} */ error) => {
      const code = error instanceof A2aTransportError ? error.code : 'request_aborted';
      if (code === 'content_too_large') {
        rpcRefuse(response, 413, code, new runtime.RequestMalformedError('The request exceeds this peer\'s contentBytes.'));
      } else {
        options.onRefused(code);
        request.socket.destroy();
      }
    });
  }, runtime.jsonRpcHandler({
    requestHandler: createRequestHandler(runtime, options, card, admitted, overBudget),
    userBuilder: async () => ({ isAuthenticated: true, userName: options.peer.label }),
  }));
  app.use((_request, response) => refuse(response, 404, 'not_found'));
  app.use((/** @type {unknown} */ _error, /** @type {IncomingMessage} */ _request, /** @type {ServerResponse} */ response,
    /** @type {Next} */ _next) => {
    if (response.headersSent) response.destroy();
    else refuse(response, 500, 'internal_error');
  });
  return app;
}

/** @param {unknown} error */
function listenErrorCode(error) {
  const code = isRecord(error) ? error.code : undefined;
  if (code === 'EADDRINUSE') return 'listen_address_in_use';
  if (code === 'EADDRNOTAVAIL') return 'listen_address_unavailable';
  if (code === 'EACCES') return 'listen_permission_denied';
  return 'listen_failed';
}

/**
 * Start the one mutual-TLS listener for a serving activation.
 * @param {ServeOptions} options
 * @param {{loadRuntime?: () => Promise<A2aRuntime>, createServer?: typeof https.createServer}} [adapters]
 *   Tests supply a non-listening server double; production uses the defaults.
 */
export async function startServer(options, adapters = {}) {
  const runtime = await (adapters.loadRuntime ?? loadRuntime)();
  const createServer = adapters.createServer ?? https.createServer;
  const now = options.now ?? Date.now;
  const app = createServeApp(runtime, options);
  let server;
  try {
    server = createServer({
      cert: options.tls.cert,
      key: options.tls.key,
      requestCert: true,
      // Self-signed peers are expected; checkPeer's certificate pin decides trust.
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    }, app);
  } catch {
    throw new A2aTransportError('tls_material_invalid');
  }
  server.on('secureConnection', (/** @type {import('node:tls').TLSSocket} */ socket) => {
    const verdict = checkPeer(socket, options.peer, now());
    if (verdict !== 'ok') {
      options.onRefused(verdict);
      socket.destroy();
    }
  });
  server.on('tlsClientError', () => options.onRefused('tls_handshake_failed'));
  const listening = server;
  await new Promise((resolve, reject) => {
    /** @param {unknown} error */
    const onError = (error) => {
      listening.removeListener('listening', onListening);
      reject(new A2aTransportError(listenErrorCode(error)));
    };
    const onListening = () => {
      listening.removeListener('error', onError);
      resolve(undefined);
    };
    listening.once('error', onError);
    listening.once('listening', onListening);
    listening.listen({ host: options.listen.address, port: options.listen.port, exclusive: true });
  });
  const close = () => new Promise((resolve) => {
    listening.close(() => resolve(undefined));
    listening.closeAllConnections();
  });
  const bound = listening.address();
  if (!isRecord(bound) || normalizeAddress(bound.address) !== options.listen.address || bound.port !== options.listen.port) {
    await close();
    throw new A2aTransportError('listen_mismatch');
  }
  listening.on('error', () => options.onRefused('listener_error'));
  return { url: endpointUrl(options.listen), close };
}

/** @param {AbortSignal | undefined} signal @param {boolean} sent */
function abortError(signal, sent) {
  const reason = signal?.reason;
  const timedOut = isRecord(reason) && reason.name === 'TimeoutError';
  return new A2aTransportError(timedOut ? 'timeout' : 'cancelled', { sent });
}

/**
 * @param {AskOptions & {now: () => number, connect: typeof tls.connect}} context
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<import('node:tls').TLSSocket>}
 */
function connectPinned(context, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal, false));
      return;
    }
    let socket;
    try {
      socket = context.connect({
        host: context.peer.address,
        port: context.peer.port,
        cert: context.tls.cert,
        key: context.tls.key,
        // Self-signed peers are expected; the certificate pin decides trust.
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined,
        minVersion: 'TLSv1.2',
        ALPNProtocols: ['http/1.1'],
      });
    } catch {
      reject(new A2aTransportError('connection_failed'));
      return;
    }
    const connecting = socket;
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      connecting.removeListener('error', onError);
      connecting.removeListener('secureConnect', onSecure);
    };
    const onAbort = () => {
      cleanup();
      connecting.destroy();
      reject(abortError(signal, false));
    };
    const onError = () => {
      cleanup();
      connecting.destroy();
      reject(new A2aTransportError('connection_failed'));
    };
    const onSecure = () => {
      cleanup();
      const verdict = checkPeer(connecting, { certSha256: context.peer.certSha256 }, context.now());
      if (verdict !== 'ok') {
        connecting.destroy();
        reject(new A2aTransportError(verdict));
        return;
      }
      resolve(connecting);
    };
    connecting.once('secureConnect', onSecure);
    connecting.once('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * One POST over an already pinned socket, with a bounded response body.
 * @param {AskOptions} context @param {import('node:tls').TLSSocket} socket
 * @param {Record<string, string>} headers @param {Buffer} body
 * @param {AbortSignal | undefined} signal @param {{sent: boolean, status: number | null}} state
 * @returns {Promise<Response>}
 */
function postPinned(context, socket, headers, body, signal, state) {
  return new Promise((resolve, reject) => {
    let settled = false;
    /** @param {() => void} action */
    const settle = (action) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      action();
    };
    const request = http.request({
      createConnection: () => socket,
      host: context.peer.address,
      port: context.peer.port,
      method: 'POST',
      path: '/',
      headers: { ...headers, 'content-length': String(body.length) },
    });
    const onAbort = () => settle(() => {
      request.destroy();
      reject(abortError(signal, true));
    });
    request.once('response', (response) => {
      state.status = response.statusCode ?? null;
      /** @type {Buffer[]} */
      const chunks = [];
      let total = 0;
      response.on('data', (/** @type {Buffer} */ chunk) => {
        total += chunk.length;
        if (total > context.contentBytes) {
          settle(() => {
            request.destroy();
            reject(new A2aTransportError('reply_too_large', { sent: true, status: state.status }));
          });
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => settle(() => {
        socket.destroy();
        /** @type {Record<string, string>} */
        const responseHeaders = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (value !== undefined) responseHeaders[name] = Array.isArray(value) ? value.join(', ') : value;
        }
        try {
          resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: responseHeaders }));
        } catch {
          reject(new A2aTransportError('invalid_reply', { sent: true, status: state.status }));
        }
      }));
      response.once('error', () => settle(() => reject(new A2aTransportError('connection_lost', { sent: true, status: state.status }))));
    });
    request.once('error', () => settle(() => reject(new A2aTransportError('connection_lost', { sent: true, status: state.status }))));
    signal?.addEventListener('abort', onAbort, { once: true });
    // From here request bytes may reach the peer.
    state.sent = true;
    request.end(body);
  });
}

/**
 * Read the peer's direct Message reply: a definite non-answer, or an answer
 * whose exact envelope and excerpt hashes check out.
 * @param {A2aRuntime} runtime @param {unknown} result @param {string} questionId
 * @returns {AskReply}
 */
function readReply(runtime, result, questionId) {
  const message = closed(result, ['messageId', 'contextId', 'taskId', 'role', 'parts', 'metadata', 'extensions', 'referenceTaskIds']);
  const correlation = message && envelope(message.metadata, ['replyTo']);
  const parts = message?.parts;
  const part = Array.isArray(parts) && parts.length === 1 && isRecord(parts[0]) ? parts[0] : null;
  const content = part && isRecord(part.content) && part.content.$case === 'data' ? part.content.value : null;
  const data = closed(content, ['outcome', 'reason']);
  /** @type {ServeReply | null} */
  const reply = data && REPLY_OUTCOMES.has(String(data.outcome)) && typeof data.reason === 'string' && REASON.test(data.reason)
    ? { outcome: /** @type {PeerReply['outcome']} */ (data.outcome), reason: data.reason }
    : readAnswer(content);
  if (!message || !correlation || correlation.replyTo !== questionId || message.role !== runtime.Role.ROLE_AGENT
    || message.taskId !== '' || !Array.isArray(message.referenceTaskIds) || message.referenceTaskIds.length !== 0 || !reply) {
    throw new A2aTransportError('invalid_reply', { sent: true });
  }
  return { ...reply, questionId };
}

/**
 * Prepare the asking side of one activation. This validates the local TLS
 * material and builds the SDK JSON-RPC client; it performs no network I/O.
 * @param {AskOptions} options
 * @param {{
 *   loadRuntime?: () => Promise<A2aRuntime>,
 *   connect?: typeof tls.connect,
 *   createSecureContext?: typeof tls.createSecureContext,
 * }} [adapters] Tests supply an in-memory connection and PEM check; production uses node:tls.
 */
export async function prepareClient(options, adapters = {}) {
  const runtime = await (adapters.loadRuntime ?? loadRuntime)();
  try {
    (adapters.createSecureContext ?? tls.createSecureContext)({ cert: options.tls.cert, key: options.tls.key });
  } catch {
    throw new A2aTransportError('tls_material_invalid');
  }
  const url = endpointUrl(options.peer);
  const context = { ...options, now: options.now ?? Date.now, connect: adapters.connect ?? tls.connect };
  const card = {
    name: options.peer.label,
    supportedInterfaces: [{ url, protocolBinding: 'JSONRPC', protocolVersion: runtime.A2A_PROTOCOL_VERSION }],
  };
  return {
    url,
    /**
     * Send one question and read its correlated reply. The caller's signal
     * bounds the whole send, including its deadline; the caller owns outcome
     * mapping, and `A2aTransportError.sent` says whether delivery is uncertain.
     * @param {string} question @param {{signal: AbortSignal, requested?: RequestedOperation[]}} call
     * @returns {Promise<AskReply>}
     */
    async send(question, { signal, requested = [] }) {
      if (!isMessageText(question) || !readRequested(requested)) throw new A2aTransportError('invalid_question');
      const state = { sent: false, status: /** @type {number | null} */ (null) };
      /** @type {typeof fetch} */
      const fetchImpl = async (input, init = {}) => {
        if (String(input) !== url) throw new A2aTransportError('endpoint_mismatch');
        if (init.method !== 'POST' || typeof init.body !== 'string') throw new A2aTransportError('unsupported_request');
        const body = Buffer.from(init.body, 'utf8');
        if (body.length > options.contentBytes) throw new A2aTransportError('content_too_large');
        /** @type {Record<string, string>} */
        const headers = {};
        new Headers(init.headers).forEach((value, name) => { headers[name] = value; });
        const socket = await connectPinned(context, init.signal ?? undefined);
        // The binding may have changed during the handshake. This is the last
        // check: nothing awaits between it and the first request byte.
        let bound;
        try {
          bound = options.checkBinding() === true;
        } catch {
          bound = false;
        }
        // The check itself may stop the activation or abort this ask.
        if (!bound || init.signal?.aborted) {
          socket.destroy();
          throw bound ? abortError(init.signal ?? undefined, false) : new A2aTransportError('activation_ended');
        }
        return postPinned(context, socket, headers, body, init.signal ?? undefined, state);
      };
      const client = await new runtime.JsonRpcTransportFactory({ fetchImpl }).create(url, card);
      const messageId = randomUUID();
      const params = {
        tenant: '',
        message: {
          messageId,
          contextId: '',
          taskId: '',
          role: runtime.Role.ROLE_USER,
          parts: [{ content: { $case: 'text', value: question }, metadata: undefined, filename: '', mediaType: 'text/plain' }],
          metadata: { dudeA2a: requested.length ? { version: ENVELOPE_VERSION, requested } : { version: ENVELOPE_VERSION } },
          extensions: [],
          referenceTaskIds: [],
        },
        configuration: {
          acceptedOutputModes: ['application/json'],
          taskPushNotificationConfig: undefined,
          historyLength: undefined,
          returnImmediately: false,
        },
        metadata: undefined,
      };
      let result;
      try {
        result = await client.sendMessage(params, {
          serviceParameters: { [runtime.A2A_VERSION_HEADER]: runtime.A2A_PROTOCOL_VERSION },
          signal,
        });
      } catch (error) {
        if (error instanceof A2aTransportError) throw error;
        // A JSON-RPC error or HTTP refusal from the peer is a definitive answer
        // that the question was not admitted; anything else is uncertain.
        const refused = error instanceof runtime.A2AError || (state.status !== null && state.status >= 400);
        throw new A2aTransportError(refused ? 'peer_refused' : 'invalid_reply', { sent: state.sent, status: state.status });
      }
      return readReply(runtime, result, messageId);
    },
  };
}

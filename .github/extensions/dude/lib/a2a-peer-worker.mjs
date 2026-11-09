// @ts-check
/**
 * One restricted evidence worker for a serving A2A peer.
 *
 * `startEvidenceWorker(request)` returns `{workerId, startup, result, cancel,
 * closed}` at once; everything else runs in work this module owns. Only after
 * a request passes validation does it load the public `@github/copilot-sdk`,
 * through the fixed worker loader (./a2a-sdk-loader.mjs): no install,
 * executable search, SDK path, fallback, or machine-specific location. A test
 * may inject `loadSdk`; such a worker records its loader as `test_adapter`,
 * never as production provenance. Missing SDK functions refuse before any
 * runtime starts.
 *
 * Storage and runtime. The worker creates its own temporary directory with
 * `work`, `config`, `home`, and `temp` folders, points HOME and USERPROFILE at
 * `home` and TEMP, TMP, and TMPDIR at `temp`, and starts one runtime from
 * exactly the caller's approved executable, arguments, environment (which
 * replaces inheritance), credential, and model. The caller's environment may
 * name those variables, and the other per-user location variables, only as
 * empty. The client runs in `empty` mode with runtime logging off and the
 * logged-in user disabled. The session turns off configuration discovery,
 * custom and on-demand instructions, file hooks, skills, memory, the session
 * store, host Git context, extensions, Canvas tools, and MCP servers; its tool
 * filters admit only `dude_a2a_evidence_inventory` and
 * `dude_a2a_evidence_read`, whose handlers the provider bound to its approved
 * evidence, and every permission request is rejected. This module reads no
 * evidence and imports no provider code.
 *
 * Readiness, before any model prompt. Its event handler registered at
 * creation and its real session ID installed, the worker first observes the
 * session's own storage: the session's public metadata snapshot must name
 * that session, local and not already in use, working in the owned `work`
 * folder, and the public `workspacePath` getter must agree with the
 * snapshot's workspace path. A path must name an existing directory, reached
 * through no link, strictly inside the owned `config` or `home` folder; a
 * snapshot `null` with a getter `undefined` is observed absence only, never
 * proof that the session persists nothing. It then reads the runtime's
 * status and the session's own model, initializes and reads the tool catalog
 * (exactly the two tools with their closed schemas, nothing deferred or
 * MCP-backed), and requires zero instruction sources, skills, configured MCP
 * servers, extensions, and custom or selected agents, keeping counts only. It
 * then sends the fixed invalid inventory call through the session's own tool
 * pipeline, which must reach this worker's handler and return exactly
 * `invalid_arguments`. A qualification run, whose sole caller is the native
 * qualifier, first copies its hash-bound fixture's synthetic canaries into the
 * worker's own folders, then adds a fixed probe set: unknown-tool controls
 * before and after, an unlisted evidence read, and native `view`, `create`,
 * `powershell`, and one canary MCP name, each of which must be rejected as
 * the controls were, with no execution, permission, or observed effect.
 * Only one answer counts as a name-lookup rejection: a JSON-RPC error with
 * code -32602 whose message is exactly `Tool '<name>' is not available in
 * this session.` for the name asked for. The public SDK declares no lookup
 * code, text, or result, so this is the worker's own closed contract: any
 * other answer is an unrecognized cause even when every lookup gives it, and
 * a host that rejects unoffered names another way cannot qualify.
 * Startup ends within 10 seconds. The storage observation is repeated last
 * and must not have changed. The bounded observation (at most 8 KiB, and
 * charged to `contentBytes`) is recorded through the caller's `checkpoint` as
 * `worker_preflight`, and readiness counts only if neither that bound nor the
 * deadline had passed once it was recorded. A qualification run then waits
 * for its exact startup release file, which must be read before the deadline.
 * The getter, and a workspace's directory identity, are rechecked right
 * before `worker_ready` is recorded and again right before the prompt, the
 * deadline is rechecked, and only then is the one prompt sent. A missing
 * API, mismatch, changed storage, unrecognized cause, overflow, or failed
 * checkpoint refuses; nothing falls back to an unrestricted worker.
 *
 * Correlation. The prompt's admission ID is what `send` returns, recorded as
 * `worker_request_admitted`. Root events count only when their originating
 * message is that ID, and a model evidence call is served only once a root
 * `assistant.message` of that admission requested its `toolCallId`; an early
 * call waits within the deadline. A qualification run records
 * `worker_evidence_pending` and holds its first such call, before any
 * evidence is read, until its exact evidence release. Hook, skill, subagent,
 * and materialized MCP events, and a notification that an instruction file
 * was discovered, are unexpected at any time until the result settles. The
 * result's `detail` then names the trigger from the closed
 * `WORKER_EFFECT_TRIGGERS` list, and keeps nothing the trigger carried.
 * Settings and these observations are not proof of native enforcement; that
 * needs native qualification.
 *
 * Existing sign-in. A request whose runtime names `auth` instead of
 * `gitHubToken` reuses the runtime's own saved sign-in. The worker owns only
 * `work` and `temp` folders and points TEMP, TMP, and TMPDIR at `temp`; home
 * and app data stay the owner's. Its client runs in `copilot-cli` mode with
 * the logged-in user on, the approved real base directory, normal runtime
 * logging, and no token. Its session keeps the same tools, permission
 * handler, and disabled features, without an owned configuration folder.
 * Readiness observes the session's normal storage (its snapshot and getter
 * must agree on this session, the owned `work` folder, and a bounded
 * absolute workspace path or none), the runtime status, the session's model
 * and exact catalog, and the account of the owned client
 * (`getAuthStatus`) and of the actual session (`gitHubAuth.getStatus`).
 * Each must be authenticated as the expected login (ignoring case) at the
 * expected canonical host, by `user` or `gh-cli`. It runs no ambient counts
 * or probes and records `worker_preflight` version 2, which omits them. The
 * storage and account pair are observed again after the latch, and the
 * account pair before the provider is asked for each evidence text (so its
 * own operation and approval checks follow that wait) and before an answer
 * counts; each check, and every recheck after its wait, holds the current
 * deadline, cancellation, session, and admission. A missing, throwing, or
 * malformed account answer refuses or fails as `auth_unavailable`, an
 * unauthenticated one as `auth_required`, and another account or kind as
 * `auth_mismatch`; nothing logs in, switches, or falls back, and no status
 * text is kept. These are point-in-time observations, not an account lock,
 * entitlement, or revocation check. An instruction-discovery notice is not
 * an error here, and neither are the runtime's MCP server load and status
 * notices: a normal runtime may start its owner's configured MCP servers and
 * plugins, while the session's tool filters still offer the model only the
 * two evidence tools. Hook, skill, and subagent events, an evidence tool
 * call outside the run, and a permission request or model output before the
 * prompt still end the worker. A version 2
 * qualification binds a manifest of exactly `{version: 2, runId}`, copies
 * nothing, and uses only the two release latches.
 *
 * `result` settles once: with the admitted prompt's final root reply at normal
 * completion, or with a closed non-answer. Cancellation, the deadline, and an
 * exhausted budget settle it at once and reject any later reply or tool
 * result; a completion seen once the deadline passed is `timed_out` even
 * while the deadline's timer has not yet run. A model evidence call checks the
 * deadline that way before the provider's handler runs and again before the
 * provider's answer is returned: past it, the worker times out, and the call
 * reads or returns nothing. A handler's signal ends with its tool call or with
 * the worker, whichever ends first; a call the runtime ends first is recorded
 * as abandoned, and its handler's later result is never returned. Room for
 * every observation, buffered event identifier, and the readiness observation
 * is charged to `contentBytes` before it is kept.
 *
 * `closed` settles within `stopMs + forceStopMs` once cleanup begins:
 * `session.abort()` for a run still in progress, `client.stop()` with its
 * errors checked, then `forceStop()` when stop reports errors or overruns.
 * None of these confirms that the runtime and every process it started have
 * exited: `stop()` skips the runtime's shutdown once its connection has
 * closed, and the SDK exposes no view of descendant processes. So once a
 * runtime may have started, its cessation is reported `unconfirmed` and its
 * temporary directory is kept and reported, never deleted. Storage that no
 * runtime used is removed within the same bound; a removal still running
 * when the bound ends is reported as pending, not as deleted or kept.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadWorkerSdk } from './a2a-sdk-loader.mjs';

/** Worker deadline ceiling, its startup bound, then the normal-stop and force-stop cleanup windows. */
export const WORKER_LIMITS = Object.freeze({ maxMs: 90_000, startupMs: 10_000, stopMs: 5_000, forceStopMs: 5_000 });
/** The only tools a worker session offers. */
export const WORKER_TOOLS = Object.freeze({ inventory: 'dude_a2a_evidence_inventory', read: 'dude_a2a_evidence_read' });
/**
 * UTF-8 bounds: the readiness observation; a qualification run's fixture
 * manifest, its canaries together, and each release file. Then the UTF-16
 * length of each identifier a runtime or peer supplies that the worker keeps:
 * session, admission, tool call, main session, and question.
 */
export const WORKER_BOUNDS = Object.freeze({
  startupBytes: 8_192, manifestBytes: 16_384, canaryBytes: 65_536, releaseBytes: 1_024, identifierLength: 256,
});
/**
 * What ended a worker as `unexpected_native_effect`, as its result's `detail`
 * names it: the session event's type, or what the worker itself saw (an
 * evidence tool call outside the run, a permission request before the prompt,
 * or model output before it). A closed list; nothing of the event's payload,
 * and no path or name from it, is ever kept.
 */
export const WORKER_EFFECT_TRIGGERS = Object.freeze(/** @type {const} */ ([
  'hook.start', 'skill.invoked', 'subagent.started', 'session.mcp_server_status_changed', 'session.mcp_servers_loaded', 'system.notification',
  'tool.execution_start', 'permission.requested', 'tool_call', 'permission_request', 'model_output_before_prompt',
]));
/** @typedef {typeof WORKER_EFFECT_TRIGGERS[number]} EffectTrigger */

const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REASON = /^[a-z][a-z0-9_]{0,63}$/;
const PERMISSION_KIND = /^[a-z][a-z0-9_-]{0,31}$/;
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
/** One fixture-relative path segment: no `.` or `..`, and no trailing dot, which Windows would strip. */
const FIXTURE_SEGMENT = /^[A-Za-z0-9._-]{0,63}[A-Za-z0-9_-]$/;
const REQUEST_KEYS = Object.freeze(['binding', 'qualification', 'extension', 'runtime', 'model', 'prompt', 'contentBytes', 'timeoutMs', 'evidence',
  'checkpoint']);
const BINDING_KEYS = Object.freeze(['operationId', 'permitId', 'mainSessionId', 'providerGeneration', 'configDigest', 'projectId', 'conversationId',
  'questionId', 'exchangeId']);
const QUALIFICATION_KEYS = Object.freeze(['version', 'runId', 'fixtureRoot', 'fixtureSha256']);
const PROVENANCE_KEYS = Object.freeze(['source', 'resolvedUrl', 'path', 'bytes', 'sha256']);
const RUNTIME_KEYS = Object.freeze(['path', 'args', 'env', 'gitHubToken']);
const SIGN_IN_RUNTIME_KEYS = Object.freeze(['path', 'args', 'env', 'auth']);
const SIGN_IN_KEYS = Object.freeze(['kind', 'baseDirectory', 'expectedAccount']);
/** Names an existing-sign-in runtime environment may carry values for; any other name only empty, as Windows blanks it. */
const SIGN_IN_ENV = new Set(['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA',
  'LOCALAPPDATA']);
/** The owner locations an existing-sign-in runtime needs as absolute paths. */
const SIGN_IN_LOCATIONS = Object.freeze(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']);
/** The temp variables an existing-sign-in worker points at its own folder; home stays the owner's. */
const SIGN_IN_OWNED_ENV = Object.freeze({ TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp' });
const SIGN_IN_FOLDERS = Object.freeze(['work', 'temp']);
/** The account kinds a saved sign-in reports: an interactive sign-in or the GitHub CLI's. */
const SIGN_IN_AUTH_TYPES = new Set(['user', 'gh-cli']);
/** UTF-8 bound of an expected or observed host and login. */
const ACCOUNT_BYTES = 256;
const SIGN_IN_MANIFEST_KEYS = Object.freeze(['version', 'runId']);
// The runtime's own process file logging switch, which empty mode leaves unset.
const FILE_LOGGING = 'COPILOT_RUNTIME_PROCESS_FILE_LOGGING';
/** Home and temp variables the worker points at its own folders. */
const OWNED_ENV = Object.freeze({ HOME: 'home', USERPROFILE: 'home', TEMP: 'temp', TMP: 'temp', TMPDIR: 'temp' });
/** Location variables a caller may pass only empty: a value would name the owner's own locations. */
const LOCATION_ENV = new Set(['HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME',
  'XDG_CACHE_HOME', ...Object.keys(OWNED_ENV)]);
const FOLDERS = Object.freeze(['work', 'config', 'home', 'temp']);
// Bounds for model- and runtime-supplied strings kept in observations.
const REFERENCE_BYTES = 4_096;
const WORKSPACE_PATH_BYTES = 1_024;
/** The owned folders a session's workspace directory may lie strictly inside: its configuration and home storage. */
const WORKSPACE_FOLDERS = Object.freeze(['config', 'home']);
const IDENTIFIER_LENGTH = WORKER_BOUNDS.identifierLength;
const TEMP_PREFIX = 'dude-a2a-w-';
const DENY_FEEDBACK = 'This evidence worker grants no permissions.';
// The widest sequence, longest outcome and reason (REASON's limit), and a
// digest: with a call's own fields, the largest record it can leave.
const RECORD_CEILING = Object.freeze({
  sequence: Number.MAX_SAFE_INTEGER,
  outcome: 'abandoned',
  reason: 'x'.repeat(64),
  sha256: '0'.repeat(64),
});
/** Budget room one root message and one requested tool call take beyond their identifiers' own bytes. */
const MESSAGE_ROOM = 64;
const REQUEST_ROOM = 16;
/**
 * The one answer recognized as a name-lookup rejection. The public SDK
 * declares no code, text, or result for a name `tools.execute` does not offer
 * (its `name` is "the currently offered tool"), so this is this module's own
 * closed contract, not a host's: a JSON-RPC error with code -32602 (invalid
 * params) whose message is exactly `template` with `{name}` replaced by the
 * name asked for. Accepting another form needs source evidence of that exact
 * form, never a broader pattern.
 */
const LOOKUP_REJECTION = Object.freeze({ code: -32602, template: "Tool '{name}' is not available in this session." });
const RELEASE_POLL_MS = 100;
const MANIFEST_FILE = 'manifest.json';
const MAX_CANARIES = 32;
const MANIFEST_KEYS = Object.freeze(['version', 'runId', 'canaries']);
const CANARY_KEYS = Object.freeze(['kind', 'location', 'path', 'source', 'sha256']);
const CANARY_KINDS = new Set(['agents', 'instructions', 'on_demand_instructions', 'hooks', 'skills', 'mcp', 'git', 'denied_read', 'denied_write']);
const CANARY_LOCATIONS = new Set(['work', 'config', 'home']);
const CHECKPOINT_REFUSALS = new Set(['operation_ended', 'activation_ended', 'recording_failed']);
/** The public session calls readiness uses; a qualification run also reads the built-in tool descriptors. */
const READINESS_CALLS = Object.freeze([['metadata', 'snapshot'], ['tools', 'initializeAndValidate'], ['tools', 'getCurrentMetadata'],
  ['tools', 'execute'], ['instructions', 'getSources'], ['skills', 'list'], ['mcp', 'listConfigured'], ['extensions', 'list'], ['agent', 'list'],
  ['agent', 'getCurrent'], ['model', 'getCurrent']]);
/** The public session calls an existing-sign-in worker's readiness and account checks use. */
const SIGN_IN_READINESS_CALLS = Object.freeze([['metadata', 'snapshot'], ['tools', 'initializeAndValidate'], ['tools', 'getCurrentMetadata'],
  ['model', 'getCurrent'], ['gitHubAuth', 'getStatus']]);
/** Fixed preflight tool-call IDs; no request, fixture, or model can add one. */
const PROBE = Object.freeze({
  inventory: 'dude-a2a-preflight-inventory',
  controlBefore: 'dude-a2a-preflight-control-before',
  read: 'dude-a2a-preflight-read',
  view: 'dude-a2a-preflight-view',
  create: 'dude-a2a-preflight-create',
  shell: 'dude-a2a-preflight-shell',
  mcp: 'dude-a2a-preflight-mcp',
  controlAfter: 'dude-a2a-preflight-control-after',
  inventoryAfter: 'dude-a2a-preflight-inventory-after',
});
/** Fixed names a qualification run asks the session to look up: two unknown controls, three built-in tools, one canary MCP wire name. */
const UNKNOWN_CONTROLS = Object.freeze({ before: 'dude_a2a_unknown_control_before', after: 'dude_a2a_unknown_control_after' });
const NATIVE_PROBES = Object.freeze({ view: 'view', create: 'create', shell: 'powershell', mcp: 'dude-canary-probe' });
const INVALID_PROBE_ARGUMENTS = Object.freeze({ qualificationProbe: true });
const CREATE_MARKER = 'dude-a2a-qualification-marker\n';
const SHELL_PROBE = Object.freeze({ command: 'exit 0', description: 'Dude A2A qualification probe' });

/**
 * The caller's request. Every field is required; nothing is defaulted.
 * @typedef {object} EvidenceWorkerRequest
 * @property {WorkerBinding} binding Correlation only, never authority.
 * @property {Qualification | null} qualification Only the native qualifier sets this.
 * @property {ExtensionIdentity} extension The joined extension's loader record and process ID, as its provider reports them.
 * @property {RuntimeSpec} runtime
 * @property {string} model The approved model ID.
 * @property {string} prompt The worker's one message.
 * @property {number} contentBytes UTF-8 bound for each tool result and the answer, and for the observations, buffered event
 *   identifiers, and readiness observation together.
 * @property {number} timeoutMs Deadline from the start call, 1 to `WORKER_LIMITS.maxMs`.
 * @property {EvidenceHandlers} evidence Provider-bound handlers; the worker reaches no files itself.
 * @property {Checkpoint} checkpoint The caller's recording of each readiness boundary.
 */
/**
 * The admitted exchange and activation this worker serves.
 * @typedef {object} WorkerBinding
 * @property {string} operationId
 * @property {string} permitId The separate worker permit.
 * @property {string} mainSessionId The serving provider's joined session.
 * @property {string} providerGeneration
 * @property {string} configDigest SHA-256 of the approved configuration.
 * @property {string} projectId
 * @property {string} conversationId
 * @property {string} questionId The admitted A2A message.
 * @property {string} exchangeId
 */
/**
 * A native qualification run's fixture binding. Version 1 (token runtime only) holds `manifest.json`, the canary
 * sources, and the two release files; version 2 (existing-sign-in runtime only) holds a manifest of exactly
 * `{version: 2, runId}` and the two release files.
 * @typedef {object} Qualification
 * @property {1 | 2} version
 * @property {string} runId
 * @property {string} fixtureRoot Absolute; holds `manifest.json` and the two release files, and for version 1 the canary sources.
 * @property {string} fixtureSha256 SHA-256 of `manifest.json`.
 */
/**
 * Where an SDK came from. `fixed_loader` is the production loader's record; `test_adapter` marks an injected loader.
 * @typedef {{source: 'fixed_loader', resolvedUrl: string, path: string, bytes: number, sha256: string}
 *   | {source: 'test_adapter'} | {source: 'unavailable'}} LoaderRecord
 */
/** @typedef {{loader: LoaderRecord, pid: number | null}} ExtensionIdentity */
/**
 * Records one readiness boundary synchronously, after checking the operation, deadline, grant, binding, and worker.
 * @typedef {(entry: {kind: 'worker_preflight' | 'worker_ready' | 'worker_request_admitted' | 'worker_evidence_pending',
 *   workerId: string, data: Record<string, unknown>}) => {ok: true} | {ok: false, reason: string}} Checkpoint
 */
/**
 * @typedef {object} RuntimeSpec
 * @property {string} path Absolute runtime executable path.
 * @property {string[]} args Runtime arguments, placed before the SDK's own; empty with `auth`.
 * @property {Record<string, string>} env The complete runtime environment; nothing is inherited. It must not set
 *   COPILOT_RUNTIME_PROCESS_FILE_LOGGING. With `gitHubToken`, it may name home, temp, and per-user location variables
 *   only as empty. With `auth`, it carries values only for the existing-sign-in names, including HOME, USERPROFILE,
 *   APPDATA, and LOCALAPPDATA as absolute paths, and any other name only empty.
 * @property {string} [gitHubToken] The approved explicit credential; never returned. Exactly one of this and `auth`.
 * @property {SignIn} [auth] The runtime's own existing saved sign-in.
 */
/**
 * The existing-sign-in branch: the approved real base directory and the account each actual runtime and session
 * must report. It names no credential.
 * @typedef {{kind: 'existing-sign-in', baseDirectory: string, expectedAccount: {host: string, login: string}}} SignIn
 */
/**
 * One account status as the owned client or the actual session reported it, kept only once it matched: the
 * canonical host and the login as reported. A status message, plan, or error is never kept.
 * @typedef {{isAuthenticated: true, authType: string, host: string, login: string}} AccountObservation
 */
/**
 * Identity of one tool call, checked before a handler sees it.
 * @typedef {object} EvidenceCall
 * @property {string} workerId
 * @property {string} operationId
 * @property {string} permitId
 * @property {string} sessionId The worker's own session.
 * @property {string} toolCallId Unique within the worker.
 * @property {AbortSignal} signal Aborts when this call ends: its outcome is taken, the runtime
 *   ends the call, or the worker's result settles. A later handler result is discarded.
 */
/**
 * `text` is exactly what the worker model sees; `reason` is a closed
 * lowercase code shown to the model as a refusal.
 * @typedef {{ok: true, text: string} | {ok: false, reason: string}} EvidenceOutcome
 */
/**
 * @typedef {{reference: string, lines: {start: number, end: number} | null}} ReadRequest
 */
/**
 * Handlers bound by the provider to its approved evidence. A throw or a
 * malformed outcome becomes `provider_error`; its message is never shown.
 * @typedef {object} EvidenceHandlers
 * @property {(call: EvidenceCall) => EvidenceOutcome | Promise<EvidenceOutcome>} inventory
 * @property {(request: ReadRequest, call: EvidenceCall) => EvidenceOutcome | Promise<EvidenceOutcome>} read
 */
/**
 * One evidence call the worker answered, or the runtime abandoned, before
 * the worker's result settled.
 * @typedef {object} ToolObservation
 * @property {number} sequence 1-based order.
 * @property {'inventory' | 'read'} tool
 * @property {string | null} toolCallId Null when the runtime supplied no usable ID.
 * @property {ReadRequest | null} request Validated read arguments; null otherwise.
 * @property {'returned' | 'refused' | 'abandoned'} outcome `abandoned` when the runtime ended the
 *   call before its handler answered: nothing was returned, and a later handler result was discarded.
 * @property {string | null} reason Closed code when refused, or `call_ended` when abandoned.
 * @property {number | null} bytes UTF-8 bytes returned to the model.
 * @property {string | null} sha256 Of exactly those bytes.
 */
/**
 * @typedef {object} WorkerAnswer
 * @property {string} admissionId The prompt's message ID, from the reply's originating message.
 * @property {string} text Content of the final root assistant message.
 * @property {number} bytes
 * @property {string} sha256
 */
/**
 * One fixed preflight call: its tool-call ID, the tool name asked for, a digest of its fixed arguments, the observed
 * result shape, code, and text digest (for a recognized lookup, of the one recognized template), and the classified cause.
 * @typedef {{id: string, name: string, argumentsSha256: string, shape: 'result' | 'rpc_error', code: string | number | null,
 *   templateSha256: string | null, cause: string}} ProbeRecord
 */
/**
 * The bounded readiness observation recorded as `worker_preflight` before any prompt.
 * @typedef {object} PreflightObservation
 * @property {1} version
 * @property {string} workerId
 * @property {WorkerBinding} binding
 * @property {string} sessionId
 * @property {{version: 1, runId: string, fixtureSha256: string, canaries: number, canaryBytes: number} | null} qualification
 * @property {{joined: LoaderRecord, worker: LoaderRecord}} loaders
 * @property {number | null} extensionPid
 * @property {{version: string, protocolVersion: number}} runtime From the client's public status.
 * @property {string} model The session's own current model, equal to the approved one.
 * @property {string} storage The worker's own directory, holding work, config, home, and temp.
 * @property {SessionStorage} sessionStorage What the session itself reported about its own storage.
 * @property {Array<{name: string, schemaSha256: string}>} catalog
 * @property {{instructionSources: number, skills: number, enabledSkills: number, mcpServers: number, extensions: number,
 *   customAgents: number, selectedAgent: boolean}} ambient Counts only, all zero.
 * @property {ProbeRecord[]} probes
 * @property {string} startedAt
 * @property {string} completedAt
 */
/**
 * The actual session's storage as its public metadata snapshot and `workspacePath` getter reported it, alike at both
 * storage observations: a workspace directory inside the worker's own folders, its device and inode as exact decimal
 * strings, or `none`, which is observed absence only, never proof that the session persists nothing. Worker-observed
 * state, not a configured path or an approval.
 * @typedef {{kind: 'workspace', metadataSessionId: string, workspacePath: string, directory: {dev: string, ino: string}}
 *   | {kind: 'none', metadataSessionId: string}} SessionStorage
 */
/** An owned workspace directory: its normalized path, device, and inode. @typedef {{path: string, dev: string, ino: string}} Workspace */
/**
 * The bounded readiness observation an existing-sign-in worker records as `worker_preflight` before any prompt. It
 * omits the strict worker's ambient counts and probes, which it does not run, rather than reporting them passed.
 * @typedef {object} SignInPreflightObservation
 * @property {2} version
 * @property {string} workerId
 * @property {WorkerBinding} binding
 * @property {string} sessionId
 * @property {{version: 2, runId: string, fixtureSha256: string} | null} qualification
 * @property {{joined: LoaderRecord, worker: LoaderRecord}} loaders
 * @property {number | null} extensionPid
 * @property {{version: string, protocolVersion: number}} runtime From the client's public status.
 * @property {string} model The session's own current model, equal to the approved one.
 * @property {string} storage The worker's own directory, holding work and temp.
 * @property {{runtime: AccountObservation, session: AccountObservation}} auth The owned client's and the actual session's
 *   account, each matching the expected one when observed.
 * @property {NormalStorage} sessionStorage What the session itself reported about its normal storage.
 * @property {Array<{name: string, schemaSha256: string}>} catalog
 * @property {string} startedAt
 * @property {string} completedAt
 */
/**
 * The actual session's normal storage as its public metadata snapshot and `workspacePath` getter reported it, alike at
 * both observations and again after the latch: this session, its working directory (the owned `work` folder), and a
 * bounded absolute workspace path, or null when it reported none. Observed, not inspected, and not fresh owned storage.
 * @typedef {{kind: 'normal', metadataSessionId: string, workingDirectory: string, workspacePath: string | null}} NormalStorage
 */
/**
 * Settles once: the recorded readiness observation and its SHA-256, or why the worker ended first.
 * @typedef {{ok: true, observation: PreflightObservation | SignInPreflightObservation, sha256: string}
 *   | {ok: false, outcome: WorkerResult['outcome'], reason: string | null}} WorkerStartup
 */
/**
 * Closed outcomes and reasons:
 * `answered`; `refused` (invalid_request, sdk_unavailable, sdk_provenance_unavailable, sdk_artifact_changed,
 * sdk_unsupported, storage_unavailable, qualification_fixture_invalid, preflight_unsupported, model_mismatch,
 * tool_catalog_uninitialized, tool_catalog_mismatch, probe_cause_unrecognized, unexpected_native_effect,
 * startup_observation_too_large, observation_budget_exhausted, qualification_release_mismatch, auth_unavailable,
 * auth_required, auth_mismatch);
 * `failed` (client_failed, session_failed, run_failed, no_answer, uncorrelated_answer, answer_too_large,
 * observation_budget_exhausted, unexpected_native_effect, qualification_release_mismatch, recording_failed,
 * auth_unavailable, auth_required, auth_mismatch, internal_error); `timed_out` (deadline, startup_deadline);
 * `cancelled` (cancelled, operation_ended, activation_ended).
 * @typedef {object} WorkerResult
 * @property {string} workerId
 * @property {'answered' | 'refused' | 'failed' | 'timed_out' | 'cancelled'} outcome
 * @property {string | null} reason Null only when answered.
 * @property {string | null} detail The failed request field and rule for `invalid_request`; for `unexpected_native_effect`,
 *   its trigger from `WORKER_EFFECT_TRIGGERS`; otherwise null. Never a value.
 * @property {WorkerBinding | null} binding Null only for an invalid request.
 * @property {string | null} sessionId The worker's session, once created.
 * @property {string | null} admissionId What `send` returned for the prompt, once it did.
 * @property {'not_sent' | 'possibly_sent'} delivery Whether the prompt can have reached the runtime.
 * @property {WorkerAnswer | null} answer
 * @property {readonly ToolObservation[]} observations In order, none dropped. A call whose handler was
 *   still pending when the result settled has none.
 * @property {Readonly<Record<string, number>>} permissionDenials Rejected permission requests by kind.
 */
/**
 * What cleanup observed. A runtime may have started once session creation
 * began; from then on `runtime` is `unconfirmed` whatever `stop()` and
 * `forceStop()` report, because neither confirms that the runtime and every
 * process it started have exited, and the storage is kept.
 * @typedef {object} WorkerClosed
 * @property {string} workerId
 * @property {'not_started' | 'unconfirmed'} runtime
 * @property {'not_needed' | 'acknowledged' | 'failed' | 'timed_out'} abort
 * @property {'not_needed' | 'clean' | 'errors' | 'failed' | 'timed_out' | 'skipped'} stop
 *   `clean` when `stop()` returned no errors, which does not show that the runtime stopped;
 *   `skipped` when session creation did not settle within the stop window.
 * @property {number} stopErrors How many errors `stop()` returned; their text is not kept.
 * @property {'not_needed' | 'completed' | 'failed' | 'timed_out'} forceStop
 * @property {'none' | 'deleted' | 'retained' | 'delete_failed' | 'delete_pending'} storage
 *   `retained` whenever a runtime may have started; `delete_pending` when removing storage
 *   no runtime used had not finished when the cleanup bound ended.
 * @property {string | null} retainedPath The owned temporary directory whenever it may remain:
 *   `retained`, `delete_failed`, or `delete_pending`.
 */
/**
 * @typedef {object} EvidenceWorker
 * @property {string} workerId
 * @property {Promise<WorkerStartup>} startup Settles once; never rejects.
 * @property {Promise<WorkerResult>} result Settles once; never rejects.
 * @property {() => boolean} cancel True when this call ended a pending worker.
 * @property {Promise<WorkerClosed>} closed Settles after bounded cleanup; never rejects.
 */
/**
 * The public SDK surface this worker uses.
 * @typedef {object} WorkerSdk
 * @property {new (options: object) => WorkerClient} CopilotClient
 * @property {{forStdio: (options: {path: string, args: string[], env: Record<string, string>}) => unknown}} RuntimeConnection
 * @property {(name: string, config: object) => unknown} defineTool
 */
/**
 * @typedef {object} WorkerClient
 * @property {(config: object) => Promise<unknown>} createSession
 * @property {() => Promise<unknown>} getStatus
 * @property {() => Promise<unknown>} [getAuthStatus] The runtime's account status; an existing-sign-in worker requires it.
 * @property {() => Promise<unknown>} stop
 * @property {() => Promise<unknown>} forceStop
 */
/**
 * @typedef {object} WorkerSession
 * @property {string} sessionId
 * @property {(options: {prompt: string}) => Promise<unknown>} send Resolves with the prompt's admission ID.
 * @property {() => Promise<unknown>} abort
 * @property {any} rpc The public session RPC namespaces; readiness checks each method it calls.
 * @property {string | undefined} [workspacePath] The public getter: the session's workspace directory, or undefined
 *   without one. Readiness requires it present.
 */
/** @typedef {{set: (callback: () => void, ms: number) => () => void}} Timers */
/**
 * Test seams; production callers pass none.
 * @typedef {object} WorkerAdapters
 * @property {() => Promise<unknown>} [loadSdk] Replaces the fixed loader; the worker then records `test_adapter`.
 * @property {string} [tempParent] Parent of the worker's temporary directory; default `os.tmpdir()`.
 * @property {Timers} [timers]
 * @property {() => number} [now] The clock its deadline rechecks read; default `Date.now`.
 * @property {(directory: string) => Promise<unknown>} [removeTree] Removes the worker's own
 *   unused temporary directory; default a recursive `fs.promises.rm`.
 */
/**
 * A qualification run's prepared fixture: the denied read target it copied and the absent destination it must keep absent.
 * @typedef {{deniedRead: string, deniedWrite: string, canaries: number, canaryBytes: number}} Fixture
 */
/**
 * One fixed preflight call before it runs.
 * @typedef {{id: string, kind: 'custom', tool: 'inventory' | 'read', name: string, args: Record<string, unknown>,
 *   expect: string, reached: boolean, providerReason: string | null}
 *   | {id: string, kind: 'control' | 'native', name: string, args: Record<string, unknown>, descriptor: boolean}} Probe
 */
/** @typedef {{shape: 'rpc_error', code: number, templateSha256: string}} LookupSignature */

/** Timer adapter; `set` returns its own cancel function. */
const DEFAULT_TIMERS = Object.freeze({
  /** @param {() => void} callback @param {number} ms */
  set(callback, ms) {
    const handle = setTimeout(callback, ms);
    handle.unref();
    return () => clearTimeout(handle);
  },
});

/** Remove the worker's own temporary directory. @param {string} directory */
function removeOwnedTree(directory) {
  return fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {readonly string[]} keys @returns {value is Record<string, unknown>} */
function exactKeys(value, keys) {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** @param {unknown} value @returns {value is string} */
function singleLine(value) {
  return typeof value === 'string' && value.length > 0 && !CONTROL.test(value);
}

/** A bounded single-line identifier a runtime or peer supplied. @param {unknown} value @returns {value is string} */
function identifier(value) {
  return singleLine(value) && value.length <= IDENTIFIER_LENGTH;
}

/** @param {unknown} value @returns {value is string} */
function isId(value) {
  return typeof value === 'string' && ID.test(value);
}

/** @param {unknown} value @param {number} max @returns {value is number} */
function boundedInteger(value, max) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max;
}

/** @param {string | Buffer} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * UTF-8 bytes one record adds to a JSON array: its text and the comma or
 * closing bracket after it.
 * @param {object} value
 */
function encodedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8') + 1;
}

/** @param {unknown} value @param {readonly string[]} names */
function hasMethods(value, names) {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && names.every((name) => typeof (/** @type {Record<string, unknown>} */ (value))[name] === 'function');
}

/**
 * JSON with object keys sorted, so equal values compare equal whatever their key order.
 * @param {unknown} value @returns {string}
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** @param {unknown} left @param {unknown} right */
function sameJson(left, right) {
  return canonical(left) === canonical(right);
}

/** @param {number} ms */
function isoTime(ms) {
  return new Date(ms).toISOString();
}

/**
 * @template T
 * @returns {{promise: Promise<T>, resolve: (value: T) => void}}
 */
function deferred() {
  /** @type {(value: T) => void} */
  let resolve = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/**
 * Run `fn` so a synchronous throw becomes a rejection.
 * @param {() => unknown} fn @returns {Promise<unknown>}
 */
function attempt(fn) {
  return new Promise((resolve) => {
    resolve(fn());
  });
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<{kind: 'value', value: unknown} | {kind: 'error', error: unknown}>}
 */
function settleOf(promise) {
  return promise.then(
    (value) => ({ kind: /** @type {const} */ ('value'), value }),
    (error) => ({ kind: /** @type {const} */ ('error'), error }),
  );
}

/**
 * The whole file when it is a plain regular file of at most `limit` bytes,
 * reached through no link and unchanged while read; otherwise null.
 * @param {string} file @param {number} limit
 */
function readBounded(file, limit) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > limit || fs.realpathSync(file) !== file) return null;
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const before = fs.fstatSync(fd);
      if (!before.isFile() || before.size > limit || before.dev !== stat.dev || before.ino !== stat.ino) return null;
      const buffer = Buffer.alloc(before.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = fs.readSync(fd, buffer, count, buffer.length - count, null);
        if (!read) break;
        count += read;
      }
      return count === before.size ? buffer.subarray(0, count) : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** @param {Buffer} bytes */
function utf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** @param {string} file */
function present(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    return !(isRecord(error) && error.code === 'ENOENT');
  }
}

/** Whether two paths name the same location once resolved, ignoring case on Windows. @param {string} left @param {string} right */
function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Whether `child` lies strictly inside `parent` once both are resolved. @param {string} parent @param {string} child */
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** A fixture-relative path of one to eight plain segments. @param {unknown} value @returns {value is string} */
function fixturePath(value) {
  if (typeof value !== 'string') return false;
  const segments = value.split('/');
  return segments.length <= 8 && segments.every((segment) => FIXTURE_SEGMENT.test(segment));
}

/** @param {unknown} value @returns {WorkerBinding | null} */
function parseBinding(value) {
  if (!exactKeys(value, BINDING_KEYS)) return null;
  const { operationId, permitId, mainSessionId, providerGeneration, configDigest, projectId, conversationId, questionId, exchangeId } = value;
  if (!isId(operationId) || !isId(permitId) || !identifier(mainSessionId) || typeof providerGeneration !== 'string' || !UUID.test(providerGeneration)
    || typeof configDigest !== 'string' || !SHA256.test(configDigest) || !isId(projectId) || typeof conversationId !== 'string'
    || !UUID.test(conversationId) || !identifier(questionId) || typeof exchangeId !== 'string' || !UUID.test(exchangeId)) {
    return null;
  }
  return Object.freeze({ operationId, permitId, mainSessionId, providerGeneration, configDigest, projectId, conversationId, questionId, exchangeId });
}

/** @param {unknown} value @returns {Qualification | null | undefined} Undefined when invalid. */
function parseQualification(value) {
  if (value === null) return null;
  if (!exactKeys(value, QUALIFICATION_KEYS) || (value.version !== 1 && value.version !== 2) || typeof value.runId !== 'string'
    || !UUID.test(value.runId) || !singleLine(value.fixtureRoot) || !path.isAbsolute(value.fixtureRoot)
    || path.resolve(value.fixtureRoot) !== value.fixtureRoot || typeof value.fixtureSha256 !== 'string' || !SHA256.test(value.fixtureSha256)) {
    return undefined;
  }
  return Object.freeze({ version: value.version, runId: value.runId, fixtureRoot: value.fixtureRoot, fixtureSha256: value.fixtureSha256 });
}

/** The origin of a bare HTTPS origin URL, or null for anything else. @param {unknown} value */
function httpsOrigin(value) {
  if (typeof value !== 'string' || !singleLine(value) || Buffer.byteLength(value, 'utf8') > ACCOUNT_BYTES) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
}

/** A bounded single-line login. @param {unknown} value @returns {value is string} */
function accountLogin(value) {
  return singleLine(value) && value.trim() !== '' && Buffer.byteLength(value, 'utf8') <= ACCOUNT_BYTES;
}

/**
 * An existing-sign-in runtime's environment and account, validated and
 * copied. The environment carries values only for `SIGN_IN_ENV` names, any
 * other name only empty, and no name twice in any letter case; HOME,
 * USERPROFILE, APPDATA, and LOCALAPPDATA are absolute paths, and the temp
 * variables are dropped for the worker to point at its own folder. The base
 * directory is a resolved absolute path, and the expected account a canonical
 * HTTPS host and a single-line login. A refusal never names a value.
 * @param {Record<string, unknown>} runtime
 * @returns {{ok: true, env: Record<string, string>, auth: SignIn} | {ok: false, detail: string}}
 */
function parseSignInRuntime(runtime) {
  /** @param {string} detail */
  const fail = (detail) => ({ ok: /** @type {const} */ (false), detail });
  if (!isRecord(runtime.env)) return fail('runtime.env must be an object of names to string values');
  /** @type {Array<[string, string]>} */
  const env = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const [name, setting] of Object.entries(runtime.env)) {
    if (!name || name.includes('=') || name.includes('\0')) return fail('runtime.env names must be non-empty without = or NUL');
    const upper = name.toUpperCase();
    if (upper === FILE_LOGGING) return fail(`runtime.env must not set ${FILE_LOGGING}`);
    if (typeof setting !== 'string' || setting.includes('\0')) return fail('runtime.env values must be strings without NUL');
    if (seen.has(upper)) return fail('runtime.env must not repeat a name in any letter case');
    seen.add(upper);
    if (!SIGN_IN_ENV.has(upper) && setting !== '') return fail('runtime.env may carry values only for the existing-sign-in names');
    if (!Object.hasOwn(SIGN_IN_OWNED_ENV, upper)) env.push([name, setting]);
  }
  for (const location of SIGN_IN_LOCATIONS) {
    const value = env.find(([name]) => name.toUpperCase() === location)?.[1];
    if (!singleLine(value) || !path.isAbsolute(value) || Buffer.byteLength(value, 'utf8') > WORKSPACE_PATH_BYTES) {
      return fail(`runtime.env must carry ${SIGN_IN_LOCATIONS.join(', ')} as absolute paths`);
    }
  }
  const auth = runtime.auth;
  if (!exactKeys(auth, SIGN_IN_KEYS) || auth.kind !== 'existing-sign-in') {
    return fail(`runtime.auth must have exactly ${SIGN_IN_KEYS.join(', ')}, with kind existing-sign-in`);
  }
  const base = auth.baseDirectory;
  if (!singleLine(base) || !path.isAbsolute(base) || path.resolve(base) !== base || Buffer.byteLength(base, 'utf8') > WORKSPACE_PATH_BYTES) {
    return fail(`runtime.auth.baseDirectory must be a resolved absolute path of at most ${WORKSPACE_PATH_BYTES} UTF-8 bytes`);
  }
  const account = auth.expectedAccount;
  if (!exactKeys(account, ['host', 'login']) || httpsOrigin(account.host) !== account.host || !accountLogin(account.login)) {
    return fail(`runtime.auth.expectedAccount must have exactly a canonical HTTPS host and a single-line login, each at most ${ACCOUNT_BYTES} UTF-8 bytes`);
  }
  return {
    ok: true,
    // fromEntries keeps every approved name as an own property, including `__proto__`.
    env: Object.fromEntries(env),
    auth: Object.freeze({
      kind: 'existing-sign-in', baseDirectory: base, expectedAccount: Object.freeze({ host: /** @type {string} */ (account.host), login: account.login }),
    }),
  };
}

/** The joined extension's loader record and process ID. @param {unknown} value @returns {ExtensionIdentity | null} */
function parseExtension(value) {
  if (!exactKeys(value, ['loader', 'pid'])) return null;
  const { loader, pid } = value;
  if (pid !== null && !boundedInteger(pid, Number.MAX_SAFE_INTEGER)) return null;
  if (exactKeys(loader, ['source']) && loader.source === 'unavailable') return Object.freeze({ loader: Object.freeze({ source: 'unavailable' }), pid });
  if (!exactKeys(loader, PROVENANCE_KEYS) || loader.source !== 'fixed_loader' || !singleLine(loader.resolvedUrl) || !singleLine(loader.path)
    || !boundedInteger(loader.bytes, Number.MAX_SAFE_INTEGER) || typeof loader.sha256 !== 'string' || !SHA256.test(loader.sha256)) {
    return null;
  }
  return Object.freeze({
    loader: Object.freeze({ source: 'fixed_loader', resolvedUrl: loader.resolvedUrl, path: loader.path, bytes: loader.bytes, sha256: loader.sha256 }),
    pid,
  });
}

/**
 * Validate and copy the caller's request, so later changes to the caller's
 * objects cannot change this worker. A refusal names the field and rule,
 * never a value.
 * @param {unknown} value
 * @returns {{ok: true, request: EvidenceWorkerRequest} | {ok: false, detail: string}}
 */
function parseRequest(value) {
  /** @param {string} detail */
  const fail = (detail) => ({ ok: /** @type {const} */ (false), detail });
  if (!exactKeys(value, REQUEST_KEYS)) return fail(`the request must have exactly ${REQUEST_KEYS.join(', ')}`);
  const { runtime, model, prompt, contentBytes, timeoutMs, evidence, checkpoint } = value;
  const binding = parseBinding(value.binding);
  if (!binding) return fail(`binding must have exactly ${BINDING_KEYS.join(', ')}, each a bounded identifier of its kind`);
  const qualification = parseQualification(value.qualification);
  if (qualification === undefined) {
    return fail('qualification must be null or exactly version 1 or 2, a UUID runId, an absolute fixtureRoot, and a SHA-256 fixtureSha256');
  }
  const extension = parseExtension(value.extension);
  if (!extension) return fail('extension must have exactly a loader record and a pid or null');
  // Exactly one branch: an explicit credential, or the runtime's own existing saved sign-in.
  const signIn = exactKeys(runtime, SIGN_IN_RUNTIME_KEYS);
  if (!signIn && !exactKeys(runtime, RUNTIME_KEYS)) {
    return fail(`runtime must have exactly ${RUNTIME_KEYS.join(', ')}, or exactly ${SIGN_IN_RUNTIME_KEYS.join(', ')}`);
  }
  if (qualification && qualification.version !== (signIn ? 2 : 1)) {
    return fail('qualification must be version 1 for a gitHubToken runtime or version 2 for an auth runtime');
  }
  if (!singleLine(runtime.path) || !path.isAbsolute(runtime.path)) return fail('runtime.path must be an absolute single-line path');
  const args = runtime.args;
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string' && !arg.includes('\0'))) {
    return fail('runtime.args must be an array of strings without NUL');
  }
  /** @type {RuntimeSpec} */
  let spec;
  if (signIn) {
    if (args.length) return fail('runtime.args must be empty with auth');
    const parsed = parseSignInRuntime(runtime);
    if (!parsed.ok) return fail(parsed.detail);
    spec = { path: runtime.path, args: [], env: parsed.env, auth: parsed.auth };
  } else {
    if (!isRecord(runtime.env)) return fail('runtime.env must be an object of names to string values');
    /** @type {Array<[string, string]>} */
    const env = [];
    for (const [name, setting] of Object.entries(runtime.env)) {
      if (!name || name.includes('=') || name.includes('\0')) return fail('runtime.env names must be non-empty without = or NUL');
      const upper = name.toUpperCase();
      if (upper === FILE_LOGGING) return fail(`runtime.env must not set ${FILE_LOGGING}`);
      if (typeof setting !== 'string' || setting.includes('\0')) return fail('runtime.env values must be strings without NUL');
      if (LOCATION_ENV.has(upper) && setting !== '') return fail('runtime.env may name home, temp, and per-user location variables only as empty');
      // The worker sets its own home and temp variables below.
      if (!Object.hasOwn(OWNED_ENV, upper)) env.push([name, setting]);
    }
    if (!singleLine(runtime.gitHubToken)) return fail('runtime.gitHubToken must be a non-empty single-line string');
    spec = {
      path: runtime.path,
      args: [...args],
      // fromEntries keeps every approved name as an own property, including `__proto__`.
      env: Object.fromEntries(env),
      gitHubToken: runtime.gitHubToken,
    };
  }
  if (!singleLine(model)) return fail('model must be a non-empty single-line string');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.includes('\0')) return fail('prompt must be non-empty text without NUL');
  if (!boundedInteger(contentBytes, Number.MAX_SAFE_INTEGER)) return fail('contentBytes must be a positive integer');
  if (!boundedInteger(timeoutMs, WORKER_LIMITS.maxMs)) return fail(`timeoutMs must be an integer from 1 to ${WORKER_LIMITS.maxMs}`);
  if (!exactKeys(evidence, ['inventory', 'read']) || typeof evidence.inventory !== 'function' || typeof evidence.read !== 'function') {
    return fail('evidence must have exactly inventory and read handler functions');
  }
  if (typeof checkpoint !== 'function') return fail('checkpoint must be a function');
  return {
    ok: true,
    request: {
      binding,
      qualification,
      extension,
      runtime: spec,
      model,
      prompt,
      contentBytes,
      timeoutMs,
      evidence: {
        inventory: /** @type {EvidenceHandlers['inventory']} */ (evidence.inventory),
        read: /** @type {EvidenceHandlers['read']} */ (evidence.read),
      },
      checkpoint: /** @type {Checkpoint} */ (checkpoint),
    },
  };
}

/** @param {unknown} sdk @returns {sdk is WorkerSdk} */
function supportsSdk(sdk) {
  return isRecord(sdk) && typeof sdk.CopilotClient === 'function' && typeof sdk.defineTool === 'function'
    && isRecord(sdk.RuntimeConnection) && typeof sdk.RuntimeConnection.forStdio === 'function';
}

/**
 * Inventory takes no arguments; an absent or empty object is accepted.
 * @param {unknown} args
 * @returns {{ok: true, request: null} | {ok: false}}
 */
function parseInventoryArguments(args) {
  return args === undefined || args === null || (isRecord(args) && Object.keys(args).length === 0)
    ? { ok: true, request: null } : { ok: false };
}

/**
 * Exactly `reference` and an optional 1-based inclusive `lines` range.
 * @param {unknown} args
 * @returns {{ok: true, request: ReadRequest} | {ok: false}}
 */
function parseReadArguments(args) {
  if (!isRecord(args) || !Object.hasOwn(args, 'reference')) return { ok: false };
  if (Object.keys(args).some((key) => key !== 'reference' && key !== 'lines')) return { ok: false };
  const { reference, lines } = args;
  if (!singleLine(reference) || Buffer.byteLength(reference, 'utf8') > REFERENCE_BYTES) return { ok: false };
  if (lines === undefined || lines === null) return { ok: true, request: Object.freeze({ reference, lines: null }) };
  if (!exactKeys(lines, ['start', 'end'])) return { ok: false };
  const { start, end } = lines;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 1 || end < start) {
    return { ok: false };
  }
  return { ok: true, request: Object.freeze({ reference, lines: Object.freeze({ start, end }) }) };
}

/** Closed JSON Schemas for the two tools, fresh for each worker. */
function toolParameters() {
  return {
    inventory: { type: 'object', additionalProperties: false, properties: {} },
    read: {
      type: 'object',
      additionalProperties: false,
      required: ['reference'],
      properties: {
        reference: { type: 'string', minLength: 1, description: 'A reference exactly as the inventory listed it.' },
        lines: {
          type: 'object',
          additionalProperties: false,
          required: ['start', 'end'],
          properties: { start: { type: 'integer', minimum: 1 }, end: { type: 'integer', minimum: 1 } },
          description: 'Optional 1-based inclusive line range.',
        },
      },
    },
  };
}

/**
 * The session's initialized catalog: exactly the two evidence tools with
 * their closed schemas, neither deferred nor MCP-backed. Names and schema
 * digests are kept; descriptions are not.
 * @param {unknown} metadata
 * @returns {{ok: true, catalog: Array<{name: string, schemaSha256: string}>} | {ok: false, reason: string}}
 */
function readCatalog(metadata) {
  if (!isRecord(metadata) || !Object.hasOwn(metadata, 'tools')) return { ok: false, reason: 'preflight_unsupported' };
  const tools = metadata.tools;
  if (tools === null) return { ok: false, reason: 'tool_catalog_uninitialized' };
  if (!Array.isArray(tools)) return { ok: false, reason: 'preflight_unsupported' };
  const expected = toolParameters();
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const entry of tools) {
    const key = isRecord(entry) && entry.name === WORKER_TOOLS.inventory ? 'inventory' : isRecord(entry) && entry.name === WORKER_TOOLS.read ? 'read' : null;
    if (!key || !isRecord(entry) || seen.has(key) || entry.mcpServerName !== undefined || entry.mcpToolName !== undefined
      || entry.deferLoading === true || !sameJson(entry.input_schema, expected[key])) {
      return { ok: false, reason: 'tool_catalog_mismatch' };
    }
    seen.set(key, sha256(canonical(entry.input_schema)));
  }
  if (seen.size !== 2) return { ok: false, reason: 'tool_catalog_mismatch' };
  return {
    ok: true,
    catalog: [
      { name: WORKER_TOOLS.inventory, schemaSha256: /** @type {string} */ (seen.get('inventory')) },
      { name: WORKER_TOOLS.read, schemaSha256: /** @type {string} */ (seen.get('read')) },
    ],
  };
}

/** The runtime's public version and protocol, or null. @param {unknown} status */
function runtimeStatus(status) {
  if (!isRecord(status) || !identifier(status.version) || status.version.length > 64 || typeof status.protocolVersion !== 'number'
    || !Number.isSafeInteger(status.protocolVersion) || status.protocolVersion < 0) {
    return null;
  }
  return Object.freeze({ version: status.version, protocolVersion: status.protocolVersion });
}

/**
 * One account status, as the owned client or the actual session answered,
 * against the expected account. An answer that is not a status, or lacks a
 * value it needs, is `auth_unavailable`; an unauthenticated one is
 * `auth_required`; an authenticated one must be the expected canonical host,
 * login (ignoring case), and a saved sign-in (`user` or `gh-cli`), or it is
 * `auth_mismatch`. Public values can be absent, so absence never passes, and
 * an expected value is never taken for an observed one. Only the matched
 * host and login are kept; a status message or plan never is.
 * @param {unknown} status @param {SignIn['expectedAccount']} expected
 * @returns {{ok: true, account: AccountObservation} | {ok: false, reason: 'auth_unavailable' | 'auth_required' | 'auth_mismatch'}}
 */
function readAccount(status, expected) {
  if (!isRecord(status) || typeof status.isAuthenticated !== 'boolean') return { ok: false, reason: 'auth_unavailable' };
  if (!status.isAuthenticated) return { ok: false, reason: 'auth_required' };
  const { authType, host, login } = status;
  if (!identifier(authType) || typeof host !== 'string' || !accountLogin(login)) return { ok: false, reason: 'auth_unavailable' };
  let url = null;
  try {
    url = singleLine(host) && Buffer.byteLength(host, 'utf8') <= ACCOUNT_BYTES ? new URL(host) : null;
  } catch {
    url = null;
  }
  if (!url) return { ok: false, reason: 'auth_unavailable' };
  const origin = httpsOrigin(host);
  if (!SIGN_IN_AUTH_TYPES.has(authType) || origin !== expected.host || login.toLowerCase() !== expected.login.toLowerCase()) {
    return { ok: false, reason: 'auth_mismatch' };
  }
  return { ok: true, account: Object.freeze({ isAuthenticated: /** @type {const} */ (true), authType, host: origin, login }) };
}

/**
 * The length of one public list field, or null when the answer has another shape.
 * @param {unknown} value @param {string} key
 */
function listLength(value, key) {
  return isRecord(value) && Array.isArray(value[key]) ? /** @type {unknown[]} */ (value[key]).length : null;
}

/**
 * The workspace path a public metadata snapshot reports, null for none; undefined when the snapshot is malformed or
 * describes anything but this worker's own session, local and not already in use, working in the owned `work` folder.
 * @param {unknown} snapshot @param {string} sessionId @param {string} workDir @returns {string | null | undefined}
 */
function snapshotWorkspace(snapshot, sessionId, workDir) {
  if (!isRecord(snapshot) || snapshot.sessionId !== sessionId || snapshot.isRemote !== false || snapshot.alreadyInUse !== false
    || !singleLine(snapshot.workingDirectory) || !path.isAbsolute(snapshot.workingDirectory) || !samePath(snapshot.workingDirectory, workDir)
    || (snapshot.workspacePath !== null && typeof snapshot.workspacePath !== 'string')) {
    return undefined;
  }
  return snapshot.workspacePath;
}

/**
 * What the session's public `workspacePath` getter returned, `undefined` included; not ok when the session has no
 * such member or reading it throws, which is never absence.
 * @param {WorkerSession} session @returns {{ok: true, value: unknown} | {ok: false}}
 */
function readWorkspacePath(session) {
  try {
    return 'workspacePath' in session ? { ok: true, value: session.workspacePath } : { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * The owned directory a reported workspace path names: an absolute path of at most `WORKSPACE_PATH_BYTES` UTF-8 bytes,
 * strictly inside the worker's own `config` or `home` folder, naming an existing directory reached through no link
 * from the worker's root down. Its device and inode are read as bigints, so they stay exact; a session-like name
 * proves nothing. Null for anything else, including a path that cannot be inspected.
 * @param {string} reported @param {string} root The worker's own directory. @returns {Workspace | null}
 */
function ownedWorkspace(reported, root) {
  if (!singleLine(reported) || Buffer.byteLength(reported, 'utf8') > WORKSPACE_PATH_BYTES || !path.isAbsolute(reported)) return null;
  // Resolving can add a drive to a rooted Windows path, so the path kept is bounded as well.
  const workspace = path.resolve(reported);
  if (Buffer.byteLength(workspace, 'utf8') > WORKSPACE_PATH_BYTES || !WORKSPACE_FOLDERS.some((folder) => inside(path.join(root, folder), workspace))) {
    return null;
  }
  try {
    const stat = fs.lstatSync(workspace, { bigint: true });
    // A link below the root moves the real path away from the reported one; a link above it moves both alike.
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || !samePath(fs.realpathSync(workspace), path.join(fs.realpathSync(root), path.relative(root, workspace)))) {
      return null;
    }
    return { path: workspace, dev: stat.dev.toString(), ino: stat.ino.toString() };
  } catch {
    return null;
  }
}

/** @param {Workspace} left @param {Workspace} right */
function sameWorkspace(left, right) {
  return samePath(left.path, right.path) && left.dev === right.dev && left.ino === right.ino;
}

/**
 * A name-lookup rejection's signature, or null. Only the one closed
 * `LOOKUP_REJECTION` form is recognized, exactly. Another code or text, a
 * result instead of an error, and a generic, transport, or argument failure
 * are unrecognized even when every lookup answers alike, so no calibration
 * can rest on them.
 * @param {{kind: 'value', value: unknown} | {kind: 'error', error: unknown}} answer @param {string} name
 * @returns {LookupSignature | null}
 */
function lookupSignature(answer, name) {
  if (answer.kind !== 'error' || !isRecord(answer.error)) return null;
  const { code, message } = answer.error;
  if (code !== LOOKUP_REJECTION.code || message !== LOOKUP_REJECTION.template.split('{name}').join(name)) return null;
  return { shape: 'rpc_error', code: LOOKUP_REJECTION.code, templateSha256: sha256(LOOKUP_REJECTION.template) };
}

/** @param {LookupSignature} left @param {LookupSignature} right */
function sameSignature(left, right) {
  return left.shape === right.shape && left.code === right.code && left.templateSha256 === right.templateSha256;
}

/**
 * Whether each built-in probe's fixed arguments fit the installed public
 * descriptor of that tool: an object schema declaring each argument as a
 * string and requiring nothing else.
 * @param {unknown} descriptors @param {Probe[]} plan
 */
function descriptorsFit(descriptors, plan) {
  if (!isRecord(descriptors) || !Array.isArray(descriptors.tools)) return false;
  const tools = /** @type {unknown[]} */ (descriptors.tools);
  return plan.every((probe) => {
    if (probe.kind !== 'native' || !probe.descriptor) return true;
    const descriptor = tools.find((entry) => isRecord(entry) && entry.name === probe.name);
    const schema = isRecord(descriptor) ? descriptor.inputSchema : null;
    if (!isRecord(schema) || schema.type !== 'object' || !isRecord(schema.properties)) return false;
    const properties = schema.properties;
    const required = schema.required === undefined ? [] : schema.required;
    return Object.keys(probe.args).every((key) => isRecord(properties[key]) && properties[key].type === 'string')
      && Array.isArray(required) && required.every((key) => typeof key === 'string' && Object.hasOwn(probe.args, key));
  });
}

/**
 * Validate a qualification run's hash-bound manifest and copy its synthetic
 * canaries into the worker's own folders, before any client exists. Only
 * regular files without links are read, within the manifest and canary
 * bounds; nothing in the manifest is a command, tool, RPC, or approval.
 * @param {Qualification} qualification @param {Record<string, string>} folders
 * @returns {Fixture | null}
 */
function prepareFixture(qualification, folders) {
  try {
    const root = qualification.fixtureRoot;
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(root) !== root) return null;
    const bytes = readBounded(path.join(root, MANIFEST_FILE), WORKER_BOUNDS.manifestBytes);
    if (!bytes || sha256(bytes) !== qualification.fixtureSha256) return null;
    const manifest = JSON.parse(utf8(bytes));
    if (!exactKeys(manifest, MANIFEST_KEYS) || manifest.version !== 1 || manifest.runId !== qualification.runId
      || !Array.isArray(manifest.canaries) || manifest.canaries.length === 0 || manifest.canaries.length > MAX_CANARIES) {
      return null;
    }
    /** @type {Set<string>} */
    const destinations = new Set();
    let total = 0;
    let deniedRead = '';
    let deniedWrite = '';
    for (const entry of /** @type {unknown[]} */ (manifest.canaries)) {
      if (!exactKeys(entry, CANARY_KEYS) || typeof entry.kind !== 'string' || !CANARY_KINDS.has(entry.kind) || typeof entry.location !== 'string'
        || !CANARY_LOCATIONS.has(entry.location) || !fixturePath(entry.path)) {
        return null;
      }
      const key = `${entry.location}/${entry.path}`.toLowerCase();
      if (destinations.has(key)) return null;
      destinations.add(key);
      const destination = path.join(folders[entry.location], ...entry.path.split('/'));
      if (entry.kind === 'denied_write') {
        if (entry.source !== null || entry.sha256 !== null || deniedWrite) return null;
        deniedWrite = destination;
        continue;
      }
      if (!fixturePath(entry.source) || typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) {
        return null;
      }
      const content = readBounded(path.join(root, ...entry.source.split('/')), WORKER_BOUNDS.canaryBytes - total);
      if (!content || sha256(content) !== entry.sha256) return null;
      total += content.length;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content, { flag: 'wx' });
      if (entry.kind === 'denied_read') {
        if (deniedRead) return null;
        deniedRead = destination;
      }
    }
    if (!deniedRead || !deniedWrite || present(deniedWrite)) return null;
    return { deniedRead, deniedWrite, canaries: manifest.canaries.length, canaryBytes: total };
  } catch {
    return null;
  }
}

/**
 * Whether a version 2 qualification's fixture binds this run: a plain
 * fixture root reached through no link, holding a hash-bound manifest of
 * exactly `{version: 2, runId}` for this run. It copies and reads nothing
 * else; the root only holds the two release latches.
 * @param {Qualification} qualification
 */
function latchFixtureBound(qualification) {
  try {
    const root = qualification.fixtureRoot;
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(root) !== root) return false;
    const bytes = readBounded(path.join(root, MANIFEST_FILE), WORKER_BOUNDS.manifestBytes);
    if (!bytes || sha256(bytes) !== qualification.fixtureSha256) return false;
    const manifest = JSON.parse(utf8(bytes));
    return exactKeys(manifest, SIGN_IN_MANIFEST_KEYS) && manifest.version === 2 && manifest.runId === qualification.runId;
  } catch {
    return false;
  }
}

/**
 * One exact release file: absent, invalid (not a plain bounded file, or not
 * JSON), or present with its bytes and value.
 * @param {string} file
 * @returns {{state: 'absent'} | {state: 'invalid'} | {state: 'present', bytes: Buffer, value: unknown}}
 */
function readRelease(file) {
  if (!present(file)) return { state: 'absent' };
  const bytes = readBounded(file, WORKER_BOUNDS.releaseBytes);
  if (!bytes) return { state: 'invalid' };
  try {
    return { state: 'present', bytes, value: JSON.parse(utf8(bytes)) };
  } catch {
    return { state: 'invalid' };
  }
}

const NOT_RUNNING = Object.freeze({ resultType: 'failure', textResultForLlm: 'Evidence request refused: worker_not_running.' });
// For a call the runtime already ended; the SDK discards a handler's result then.
const CALL_ENDED = Object.freeze({ resultType: 'failure', textResultForLlm: 'Evidence request refused: call_ended.' });

/** @param {string} workerId @returns {WorkerClosed} */
function nothingToClose(workerId) {
  return Object.freeze({
    workerId,
    runtime: 'not_started',
    abort: 'not_needed',
    stop: 'not_needed',
    stopErrors: 0,
    forceStop: 'not_needed',
    storage: 'none',
    retainedPath: null,
  });
}

/**
 * Start one evidence worker. It returns at once; `startup` settles once with
 * the recorded readiness observation or why it ended first, `result` settles
 * once with the answer or a closed non-answer, and `closed` settles once after
 * bounded cleanup. None of them rejects. An invalid request is refused before
 * anything loads, is created, or is timed.
 * @param {EvidenceWorkerRequest} request
 * @param {WorkerAdapters} [adapters] Tests replace the SDK loader, temporary parent, timers, clock, and storage removal.
 * @returns {EvidenceWorker}
 */
export function startEvidenceWorker(request, adapters = {}) {
  const { tempParent = os.tmpdir(), timers = DEFAULT_TIMERS, now = Date.now, removeTree = removeOwnedTree } = adapters;
  // An injected loader is a test seam: it can never supply production provenance.
  const injected = adapters.loadSdk !== undefined;
  const loadSdk = adapters.loadSdk ?? loadWorkerSdk;
  const workerId = randomUUID();
  const parsed = parseRequest(request);
  if (!parsed.ok) {
    /** @type {WorkerResult} */
    const refused = Object.freeze({
      workerId,
      outcome: 'refused',
      reason: 'invalid_request',
      detail: parsed.detail,
      binding: null,
      sessionId: null,
      admissionId: null,
      delivery: 'not_sent',
      answer: null,
      observations: Object.freeze([]),
      permissionDenials: Object.freeze({}),
    });
    return Object.freeze({
      workerId,
      startup: Promise.resolve(/** @type {WorkerStartup} */ (Object.freeze({ ok: false, outcome: 'refused', reason: 'invalid_request' }))),
      result: Promise.resolve(refused),
      cancel: () => false,
      closed: Promise.resolve(nothingToClose(workerId)),
    });
  }
  const input = parsed.request;
  const startedAt = now();
  const deadlineAt = startedAt + input.timeoutMs;
  // The startup bound as an instant too: a timer still pending at that instant does not mean time remains.
  const startupAt = startedAt + WORKER_LIMITS.startupMs;
  /** @type {{promise: Promise<WorkerResult>, resolve: (value: WorkerResult) => void}} */
  const resultGate = deferred();
  /** @type {{promise: Promise<WorkerStartup>, resolve: (value: WorkerStartup) => void}} */
  const startupGate = deferred();
  /** @type {{promise: Promise<WorkerClosed>, resolve: (value: WorkerClosed) => void}} */
  const closedGate = deferred();
  /** @type {{promise: Promise<void>, resolve: (value: void) => void}} */
  const ended = deferred();
  const workerSignal = new AbortController();
  /** @type {ToolObservation[]} */
  const observations = [];
  /** @type {Map<string, number>} */
  const denials = new Map();
  /** @type {Set<string>} */
  const seenCalls = new Set();
  // UTF-8 bytes charged to contentBytes: the opening bracket of the
  // observations' JSON, each kept record with the comma or bracket after it,
  // the room still reserved for calls whose handlers have not answered, the
  // readiness observation, and each buffered root message's identifiers.
  let budgetUsed = 1;
  let settled = false;
  let startupSettled = false;
  /** @type {WorkerResult['delivery']} */
  let delivery = 'not_sent';
  /** @type {string | null} */
  let sessionId = null;
  /**
   * `preflight` admits only the fixed probe calls; `latched` (waiting to send) admits none; `running` admits model calls.
   * @type {'loading' | 'starting' | 'preflight' | 'latched' | 'running'}
   */
  let phase = 'loading';
  /** The fixed preflight calls, by tool-call ID, while readiness runs. @type {Map<string, Probe>} */
  const probes = new Map();
  /** Tool-call IDs of the lookups the session must reject; executing one is an effect at any time. @type {Set<string>} */
  const lookupIds = new Set();
  /**
   * Root assistant messages and completion. Before the admission ID is known,
   * messages wait in `pending` with their identifiers only; only the latest
   * message keeps its content, the one a completion can answer with.
   * @type {{sent: boolean, admission: string | null, pending: Array<{origin: string | null, calls: Array<[string, string]>}>,
   *   requested: Map<string, string>, last: {text: string | null, bytes: number} | null, idle: '' | 'normal' | 'aborted'}}
   */
  const events = { sent: false, admission: null, pending: [], requested: new Map(), last: null, idle: '' };
  /** Calls waiting for the root request that names them. @type {Set<{id: string, name: string, resolve: (state: 'ok' | 'uncorrelated') => void}>} */
  const correlating = new Set();
  /** A qualification run's one evidence hold, shared by every model call. @type {Promise<boolean> | null} */
  let evidenceGate = null;
  /** The existing sign-in this worker reuses; null for an explicit credential. */
  const signIn = input.runtime.auth ?? null;
  /**
   * An existing-sign-in worker's account sources, set once readiness found both: its owned client and the actual
   * session's public RPC. Every account check queries exactly these.
   * @type {{client: WorkerClient, rpc: any} | null}
   */
  let accountSources = null;
  /** Set once a completed run's answer waits on its account check, so it is checked and accepted at most once. */
  let answering = false;
  /**
   * What this worker created or started, for cleanup.
   * @type {{root: string | null, client: WorkerClient | null, started: boolean, creating: Promise<unknown> | null,
   *   session: WorkerSession | null, running: boolean, removing: boolean}}
   */
  const owned = { root: null, client: null, started: false, creating: null, session: null, running: false, removing: false };
  let cancelDeadline = () => {};
  let cancelStartup = () => {};
  let cancelPause = () => {};

  /** @param {WorkerStartup} value */
  function settleStartup(value) {
    if (startupSettled) return;
    startupSettled = true;
    startupGate.resolve(Object.freeze(value));
  }

  /**
   * Settle the result once. Later replies, tool results, permission
   * requests, and events cannot change it.
   * @param {WorkerResult['outcome']} outcome @param {string | null} reason
   * @param {WorkerAnswer | null} [answer] @param {EffectTrigger | null} [detail] An unexpected native effect's trigger.
   */
  function settle(outcome, reason, answer = null, detail = null) {
    if (settled) return false;
    settled = true;
    cancelDeadline();
    cancelStartup();
    cancelPause();
    resultGate.resolve(Object.freeze({
      workerId,
      outcome,
      reason,
      detail,
      binding: input.binding,
      sessionId,
      admissionId: events.admission,
      delivery,
      answer,
      observations: Object.freeze([...observations]),
      permissionDenials: Object.freeze(Object.fromEntries(denials)),
    }));
    settleStartup({ ok: false, outcome, reason });
    correlating.clear();
    workerSignal.abort();
    ended.resolve();
    return true;
  }
  cancelDeadline = timers.set(() => {
    settle('timed_out', 'deadline');
  }, input.timeoutMs);
  cancelStartup = timers.set(() => {
    settle('timed_out', 'startup_deadline');
  }, WORKER_LIMITS.startupMs);

  /**
   * Whether the worker deadline has passed, though its timer may not have run
   * yet; a passed deadline ends the worker now, as the timer would have.
   */
  function overdue() {
    if (now() < deadlineAt) return false;
    settle('timed_out', 'deadline');
    return true;
  }

  /**
   * A forbidden native effect: before the prompt the worker refuses, after it the run fails. Its result names the
   * trigger, from the closed list, and nothing of what the trigger carried.
   * @param {EffectTrigger} trigger
   */
  function unexpected(trigger) {
    settle(events.sent ? 'failed' : 'refused', 'unexpected_native_effect', null, trigger);
  }

  /** @param {Promise<unknown>} promise */
  function untilEnded(promise) {
    return Promise.race([settleOf(promise), ended.promise.then(() => ({ kind: /** @type {const} */ ('ended') }))]);
  }

  /**
   * The existing-sign-in account pair: the owned client's status, then the
   * actual session's, each awaited only while the worker lives, so a hung
   * answer cannot outlast the deadline or cancellation. Each answer must
   * match the expected account (`readAccount`); otherwise the worker ends
   * with that closed reason, refused before the prompt and failed after it.
   * Null once the worker settled for any reason.
   * @returns {Promise<{runtime: AccountObservation, session: AccountObservation} | null>}
   */
  async function observeAccounts() {
    const sources = /** @type {{client: WorkerClient, rpc: any}} */ (accountSources);
    const expected = /** @type {SignIn} */ (signIn).expectedAccount;
    /** @type {Record<string, AccountObservation>} */
    const accounts = {};
    for (const [name, call] of /** @type {Array<[string, () => unknown]>} */ ([
      ['runtime', () => /** @type {Required<WorkerClient>} */ (sources.client).getAuthStatus()],
      ['session', () => sources.rpc.gitHubAuth.getStatus()],
    ])) {
      const answer = await untilEnded(attempt(call));
      if (answer.kind === 'ended' || settled) return null;
      const read = answer.kind === 'value' ? readAccount(answer.value, expected) : { ok: /** @type {const} */ (false), reason: 'auth_unavailable' };
      if (!read.ok) {
        settle(events.sent ? 'failed' : 'refused', read.reason);
        return null;
      }
      accounts[name] = read.account;
    }
    return { runtime: accounts.runtime, session: accounts.session };
  }

  /**
   * An existing-sign-in recheck at a later boundary: the account pair again,
   * then, after its waits, the worker still unsettled, its deadline not passed
   * though its timer may not have run, and its session and admission the ones
   * it had. A stale answer revives nothing.
   */
  async function accountsHold() {
    const session = owned.session;
    const admission = events.admission;
    if (!(await observeAccounts()) || settled || overdue()) return false;
    if (owned.session !== session || sessionId !== session?.sessionId || events.admission !== admission) {
      settle(events.sent ? 'failed' : 'refused', 'uncorrelated_answer');
      return false;
    }
    return true;
  }

  /** One poll interval, cancelled when the worker settles. @param {number} ms @returns {Promise<void>} */
  function pause(ms) {
    return new Promise((resolve) => {
      cancelPause = timers.set(() => {
        cancelPause = () => {};
        resolve();
      }, ms);
    });
  }

  /**
   * Set room aside in the budget, or end the worker when the budget cannot
   * hold it: what was kept stays whole, and nothing more is admitted.
   * @param {number} bytes
   */
  function reserve(bytes) {
    if (budgetUsed + bytes > input.contentBytes) {
      settle(events.sent ? 'failed' : 'refused', 'observation_budget_exhausted');
      return false;
    }
    budgetUsed += bytes;
    return true;
  }

  /**
   * Keep one observation. `reserved` is the room its call set aside when it
   * was admitted, and the kept record gives back what it does not use; a
   * record with no reservation is charged now.
   * @param {Omit<ToolObservation, 'sequence'>} entry @param {number} reserved
   * @returns {boolean} Whether the record was kept.
   */
  function record(entry, reserved) {
    if (settled) return false;
    const observation = Object.freeze({ sequence: observations.length + 1, ...entry });
    const extra = encodedBytes(observation) - reserved;
    if (extra > 0 && !reserve(extra)) return false;
    if (extra < 0) budgetUsed += extra;
    observations.push(observation);
    return true;
  }

  /**
   * @param {'inventory' | 'read'} tool @param {string | null} toolCallId
   * @param {ReadRequest | null} readRequest @param {string} reason @param {number} [reserved]
   */
  function refuse(tool, toolCallId, readRequest, reason, reserved = 0) {
    if (!record({ tool, toolCallId, request: readRequest, outcome: 'refused', reason, bytes: null, sha256: null }, reserved)) {
      return NOT_RUNNING;
    }
    return { resultType: 'failure', textResultForLlm: `Evidence request refused: ${reason}.` };
  }

  /**
   * Record one readiness boundary through the caller. Anything but `{ok: true}`
   * ends the worker with the caller's closed reason; a recording failure is
   * never reported as the operation or activation ending.
   * @param {'worker_preflight' | 'worker_ready' | 'worker_request_admitted' | 'worker_evidence_pending'} kind
   * @param {Record<string, unknown>} data
   */
  function checkpoint(kind, data) {
    /** @type {unknown} */
    let answer = null;
    try {
      answer = input.checkpoint(Object.freeze({ kind, workerId, data }));
    } catch {
      answer = null;
    }
    if (settled) return false;
    if (isRecord(answer) && answer.ok === true) return true;
    const reason = isRecord(answer) && typeof answer.reason === 'string' && CHECKPOINT_REFUSALS.has(answer.reason) ? answer.reason : 'recording_failed';
    settle(reason === 'recording_failed' ? 'failed' : 'cancelled', reason);
    return false;
  }

  /**
   * One admitted call's signal. It aborts when the runtime ends the call (the
   * SDK aborts the invocation's signal on completion, cancellation, or
   * disconnect), when the worker's result settles, or at `finish`, which also
   * detaches it from both: the abort the SDK sends after every completed
   * call then reaches neither this call nor the worker.
   * @param {AbortSignal} invocationSignal
   */
  function callLifetime(invocationSignal) {
    const controller = new AbortController();
    /** @type {Promise<{kind: 'ended'}>} */
    const finished = new Promise((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ kind: /** @type {const} */ ('ended') }), { once: true });
    });
    const end = () => controller.abort();
    const sources = [workerSignal.signal, invocationSignal];
    for (const source of sources) source.addEventListener('abort', end, { once: true });
    if (sources.some((source) => source.aborted)) end();
    return {
      signal: controller.signal,
      ended: finished,
      finish() {
        for (const source of sources) source.removeEventListener('abort', end);
        end();
      },
    };
  }

  /**
   * Whether a root request of the admitted prompt named this call: `ok`,
   * `uncorrelated` (another tool, or the run completed without it), or
   * `pending` until the admission ID and the request are known.
   * @param {string} id @param {string} name
   */
  function correlationOf(id, name) {
    if (events.admission === null) return 'pending';
    const requested = events.requested.get(id);
    if (requested === undefined) return events.idle ? 'uncorrelated' : 'pending';
    return requested === name ? 'ok' : 'uncorrelated';
  }

  /** @param {string} id @param {string} name @returns {Promise<'ok' | 'uncorrelated'>} */
  function correlation(id, name) {
    const state = correlationOf(id, name);
    if (state !== 'pending') return Promise.resolve(state);
    return new Promise((resolve) => {
      correlating.add({ id, name, resolve });
    });
  }

  function wakeCorrelated() {
    for (const waiter of [...correlating]) {
      const state = correlationOf(waiter.id, waiter.name);
      if (state === 'pending') continue;
      correlating.delete(waiter);
      waiter.resolve(state);
    }
  }

  /**
   * The admitted prompt's final root reply at normal completion, once both the
   * admission ID and the completion are known, and only before the deadline.
   * An existing-sign-in worker accepts it only once the account pair still
   * matches, checked once; nothing the run sends meanwhile changes the answer.
   */
  function finishRun() {
    if (settled || answering || events.admission === null || !events.idle) return;
    owned.running = false;
    // A completion seen once the deadline passed is no answer, though the deadline's timer may not have run yet.
    if (now() >= deadlineAt) return void settle('timed_out', 'deadline');
    if (events.idle === 'aborted') return void settle('failed', 'run_failed');
    const last = events.last;
    if (!last) return void settle('failed', 'no_answer');
    // Content over contentBytes was never kept, and is never truncated into an answer.
    if (last.text === null) return void settle('failed', 'answer_too_large');
    if (!last.text.trim()) return void settle('failed', 'no_answer');
    const answer = Object.freeze({ admissionId: events.admission, text: last.text, bytes: last.bytes, sha256: sha256(last.text) });
    if (!signIn) return void settle('answered', null, answer);
    answering = true;
    void accountsHold().then((held) => {
      if (held) settle('answered', null, answer);
    }, () => settle('failed', 'internal_error'));
  }

  /**
   * Accept one root message once the admission ID is known: its originating
   * message must be that ID, and its tool requests become servable.
   * @param {{origin: string | null, calls: Array<[string, string]>}} message
   */
  function admitMessage(message) {
    if (message.origin !== events.admission) return void settle('failed', 'uncorrelated_answer');
    for (const [id, name] of message.calls) {
      if (events.requested.has(id)) return void settle('failed', 'uncorrelated_answer');
      events.requested.set(id, name);
    }
  }

  /**
   * One root `assistant.message`. Only identifiers are buffered, charged to
   * the budget; only the latest message keeps its content, at most
   * `contentBytes`. Reasoning and every other field are never read.
   * @param {Record<string, unknown>} event @param {Record<string, unknown>} data
   */
  function observeMessage(event, data) {
    // Before the prompt no model output is expected; a subagent's output is never an answer.
    if (!events.sent) return void unexpected('model_output_before_prompt');
    if (event.agentId !== undefined && event.agentId !== null) return void settle('failed', 'uncorrelated_answer');
    const origin = identifier(data.originatingMessageId) ? data.originatingMessageId : null;
    const requests = data.toolRequests === undefined || data.toolRequests === null ? [] : data.toolRequests;
    if (!Array.isArray(requests)) return void settle('failed', 'uncorrelated_answer');
    /** @type {Array<[string, string]>} */
    const calls = [];
    let room = MESSAGE_ROOM + Buffer.byteLength(origin ?? '', 'utf8');
    for (const entry of requests) {
      if (!isRecord(entry) || !identifier(entry.toolCallId) || !identifier(entry.name)) return void settle('failed', 'uncorrelated_answer');
      calls.push([entry.toolCallId, entry.name]);
      room += REQUEST_ROOM + Buffer.byteLength(entry.toolCallId, 'utf8') + Buffer.byteLength(entry.name, 'utf8');
    }
    if (!reserve(room)) return;
    const content = typeof data.content === 'string' ? data.content : '';
    const bytes = Buffer.byteLength(content, 'utf8');
    events.last = { text: bytes <= input.contentBytes ? content : null, bytes };
    const message = { origin, calls };
    if (events.admission === null) {
      events.pending.push(message);
      return;
    }
    admitMessage(message);
    if (settled) return;
    wakeCorrelated();
    finishRun();
  }

  /**
   * Every session event, from creation on. Hook, skill, and subagent events
   * are unexpected at any time, as is executing or asking permission for a
   * rejected lookup. On a token session so are materialized MCP events and a
   * notification that an instruction file was discovered; an
   * existing-sign-in session's normal runtime may load its owner's MCP
   * servers and plugins and discover instructions, so those notices are not
   * errors there, while its tool filters still keep every MCP tool from the
   * model. Only identifiers, discriminators, and the latest root content are
   * kept; an unexpected effect keeps only its event type.
   * @param {unknown} event
   */
  function observeEvent(event) {
    if (settled || !isRecord(event) || typeof event.type !== 'string') return;
    const data = isRecord(event.data) ? event.data : {};
    switch (event.type) {
      case 'hook.start':
      case 'skill.invoked':
      case 'subagent.started':
        return void unexpected(event.type);
      case 'session.mcp_server_status_changed':
        if (!signIn) unexpected('session.mcp_server_status_changed');
        return;
      case 'system.notification':
        // A discovered instruction file joins the session's instructions, which must stay empty; other kinds are ignored.
        // An existing-sign-in session claims no such isolation, so there the notice is not an error; actions still are.
        if (!signIn && isRecord(data.kind) && data.kind.type === 'instruction_discovered') unexpected('system.notification');
        return;
      case 'session.mcp_servers_loaded':
        // A token session loads no MCP server; a normal runtime's load notice, whatever it lists, is not an action.
        if (!signIn && (!Array.isArray(data.servers) || data.servers.length > 0)) unexpected('session.mcp_servers_loaded');
        return;
      case 'tool.execution_start':
        if (typeof data.toolCallId === 'string' && lookupIds.has(data.toolCallId)) unexpected('tool.execution_start');
        return;
      case 'permission.requested':
        // A model-phase request reaches the permission handler, which rejects and counts it.
        if (phase !== 'running') unexpected('permission.requested');
        return;
      case 'assistant.message':
        return void observeMessage(event, data);
      case 'session.idle':
        if (!events.sent) return;
        events.idle = data.aborted === true ? 'aborted' : 'normal';
        wakeCorrelated();
        return void finishRun();
      case 'session.error':
      case 'abort':
        return void settle('failed', events.sent ? 'run_failed' : 'session_failed');
      default:
    }
  }

  /**
   * One fixed preflight call reaching this worker's handler through the
   * session's own tool pipeline. Only a pending probe's exact identity and
   * arguments are accepted. The invalid inventory is refused before any
   * handler runs; the unlisted read goes to the provider's read handler, and
   * only its closed refusal is passed back. No evidence is ever returned here.
   * @param {Probe | undefined} probe @param {'inventory' | 'read'} tool @param {unknown} args
   * @param {Record<string, unknown>} call @param {AbortSignal | null} callSignal
   */
  async function answerProbe(probe, tool, args, call, callSignal) {
    if (!probe || probe.kind !== 'custom' || probe.tool !== tool || probe.reached || call.sessionId !== sessionId
      || call.toolName !== WORKER_TOOLS[tool] || call.agentId || callSignal === null || !sameJson(args, probe.args)) {
      settle('refused', 'probe_cause_unrecognized');
      return NOT_RUNNING;
    }
    probe.reached = true;
    const parsedArgs = tool === 'read' ? parseReadArguments(args) : parseInventoryArguments(args);
    if (!parsedArgs.ok || !parsedArgs.request) return { resultType: 'failure', textResultForLlm: 'Evidence request refused: invalid_arguments.' };
    const readRequest = /** @type {ReadRequest} */ (parsedArgs.request);
    const lifetime = callLifetime(callSignal);
    /** @type {EvidenceCall} */
    const context = Object.freeze({
      workerId, operationId: input.binding.operationId, permitId: input.binding.permitId, sessionId, toolCallId: probe.id, signal: lifetime.signal,
    });
    /** @type {{kind: 'value', value: unknown} | {kind: 'error', error: unknown} | {kind: 'ended'}} */
    let answered = { kind: 'ended' };
    if (!lifetime.signal.aborted) answered = await Promise.race([settleOf(attempt(() => input.evidence.read(readRequest, context))), lifetime.ended]);
    lifetime.finish();
    if (settled) return NOT_RUNNING;
    const outcome = answered.kind === 'value' ? answered.value : null;
    probe.providerReason = exactKeys(outcome, ['ok', 'reason']) && outcome.ok === false && typeof outcome.reason === 'string'
      && REASON.test(outcome.reason) ? outcome.reason : 'provider_error';
    return { resultType: 'failure', textResultForLlm: `Evidence request refused: ${probe.providerReason}.` };
  }

  /**
   * A qualification run holds its first legitimate model evidence call before
   * any evidence is read: it records `worker_evidence_pending`, then waits for
   * the exact evidence release. Every call shares that one hold.
   * @param {string} toolCallId @param {'inventory' | 'read'} tool
   */
  function evidenceRelease(toolCallId, tool) {
    const qualification = input.qualification;
    if (!qualification) return Promise.resolve(true);
    if (!evidenceGate) {
      evidenceGate = (async () => {
        const data = { workerId, sessionId, admissionId: events.admission, toolCallId, tool: WORKER_TOOLS[tool] };
        if (!checkpoint('worker_evidence_pending', data)) return false;
        const released = await awaitRelease('evidence', {
          version: 1, release: 'evidence', runId: qualification.runId, workerId, operationId: input.binding.operationId,
          permitId: input.binding.permitId, sessionId, admissionId: events.admission, toolCallId, observationSha256: sha256(JSON.stringify(data)),
        });
        return released !== null;
      })();
    }
    return evidenceGate;
  }

  /**
   * Answer one model call from this worker's own session. Identity and
   * arguments are checked, and room for the call's record reserved, before a
   * handler sees anything; the call must then match a root request of the
   * admitted prompt, a qualification run's evidence hold must release, and
   * an existing-sign-in worker's account pair must still match: the last
   * wait before the handler runs, so the handler's own checks follow it.
   * Once the result settles, no handler runs and no evidence is returned; nor
   * is it once the runtime has ended the call. Those waits and the provider's
   * own work count against the deadline, whose timer can still be pending
   * once it passed, so the clock is read before the handler runs and again
   * before its answer is returned.
   * @param {'inventory' | 'read'} tool @param {unknown} args @param {unknown} invocation
   */
  async function answerCall(tool, args, invocation) {
    if (settled || sessionId === null) return NOT_RUNNING;
    const call = isRecord(invocation) ? invocation : {};
    const toolCallId = identifier(call.toolCallId) ? call.toolCallId : null;
    // Without the SDK's per-call signal, a call the runtime ends would go unseen.
    const callSignal = call.signal instanceof AbortSignal ? call.signal : null;
    if (phase === 'preflight' && !signIn) return answerProbe(toolCallId === null ? undefined : probes.get(toolCallId), tool, args, call, callSignal);
    // Nothing calls a tool between readiness and the prompt, and an existing-sign-in worker runs no probes.
    if (phase !== 'running') {
      unexpected('tool_call');
      return NOT_RUNNING;
    }
    const identity = call.sessionId !== sessionId ? 'session_mismatch'
      : call.toolName !== WORKER_TOOLS[tool] ? 'tool_mismatch'
        : call.agentId ? 'unexpected_caller'
          : toolCallId === null || callSignal === null ? 'invalid_call'
            : seenCalls.has(toolCallId) || probes.has(toolCallId) ? 'duplicate_call' : '';
    if (identity || toolCallId === null || callSignal === null) return refuse(tool, toolCallId, null, identity || 'invalid_call');
    const parsedArgs = tool === 'read' ? parseReadArguments(args) : parseInventoryArguments(args);
    const readRequest = parsedArgs.ok ? parsedArgs.request : null;
    // The largest record this call can leave, which also holds its ID.
    const reserved = encodedBytes({ ...RECORD_CEILING, tool, toolCallId, request: readRequest, bytes: input.contentBytes });
    if (!reserve(reserved)) return NOT_RUNNING;
    seenCalls.add(toolCallId);
    if (!parsedArgs.ok) return refuse(tool, toolCallId, null, 'invalid_arguments', reserved);
    const lifetime = callLifetime(callSignal);
    /** @type {EvidenceCall} */
    const context = Object.freeze({
      workerId,
      operationId: input.binding.operationId,
      permitId: input.binding.permitId,
      sessionId,
      toolCallId,
      signal: lifetime.signal,
    });
    /** @type {'ok' | 'uncorrelated' | 'held' | 'ended'} */
    let gate = 'ended';
    if (!lifetime.signal.aborted) gate = await Promise.race([correlation(toolCallId, WORKER_TOOLS[tool]), lifetime.ended.then(() => 'ended')]);
    if (gate === 'ok') {
      const released = await Promise.race([evidenceRelease(toolCallId, tool), lifetime.ended.then(() => null)]);
      gate = released === true ? 'ok' : released === false ? 'held' : 'ended';
    }
    // An existing-sign-in worker checks its account pair before the provider is asked for any evidence text, so the
    // provider's own operation, deadline, and approval checks come after that wait. A pair that fails has ended the worker.
    if (gate === 'ok' && signIn && !lifetime.signal.aborted && !overdue() && !(await accountsHold())) gate = 'ended';
    /** @type {{kind: 'value', value: unknown} | {kind: 'error', error: unknown} | {kind: 'ended'}} */
    let answered = { kind: 'ended' };
    if (gate === 'ok' && !lifetime.signal.aborted && !overdue()) {
      const pending = attempt(() => (readRequest ? input.evidence.read(readRequest, context) : input.evidence.inventory(context)));
      answered = await Promise.race([settleOf(pending), lifetime.ended]);
    }
    lifetime.finish();
    if (settled) return NOT_RUNNING;
    if (callSignal.aborted) {
      // The SDK discards whatever a handler returns after the runtime ended its call.
      record({ tool, toolCallId, request: readRequest, outcome: 'abandoned', reason: 'call_ended', bytes: null, sha256: null }, reserved);
      return CALL_ENDED;
    }
    if (gate === 'uncorrelated') return refuse(tool, toolCallId, readRequest, 'uncorrelated_call', reserved);
    if (gate !== 'ok' || overdue()) return NOT_RUNNING;
    const outcome = answered.kind === 'value' ? answered.value : null;
    if (exactKeys(outcome, ['ok', 'text']) && outcome.ok === true && typeof outcome.text === 'string') {
      const bytes = Buffer.byteLength(outcome.text, 'utf8');
      if (bytes > input.contentBytes) return refuse(tool, toolCallId, readRequest, 'output_too_large', reserved);
      // No further await after unwrapping the provider result.
      const kept = record({ tool, toolCallId, request: readRequest, outcome: 'returned', reason: null, bytes, sha256: sha256(outcome.text) }, reserved);
      return kept ? { resultType: 'success', textResultForLlm: outcome.text } : NOT_RUNNING;
    }
    if (exactKeys(outcome, ['ok', 'reason']) && outcome.ok === false && typeof outcome.reason === 'string' && REASON.test(outcome.reason)) {
      return refuse(tool, toolCallId, readRequest, outcome.reason, reserved);
    }
    return refuse(tool, toolCallId, readRequest, 'provider_error', reserved);
  }

  /**
   * Reject every permission request; the two evidence tools need none. Before
   * the prompt, any request is an unexpected native effect.
   * @param {unknown} permission
   */
  function denyPermission(permission) {
    const kind = isRecord(permission) && typeof permission.kind === 'string' && PERMISSION_KIND.test(permission.kind)
      ? permission.kind : 'other';
    if (!settled) {
      denials.set(kind, (denials.get(kind) ?? 0) + 1);
      if (phase !== 'running') unexpected('permission_request');
    }
    return { kind: 'reject', feedback: DENY_FEEDBACK };
  }

  /**
   * The fresh session: same owned directories as the client, no discovery
   * or ambient features, only the two evidence tools, and this worker's event
   * handler registered before creation. An existing-sign-in session names no
   * owned configuration folder: it keeps the runtime's normal storage under
   * the approved base directory.
   * @param {WorkerSdk} sdk @param {string} workDir @param {string | null} configDir
   */
  function sessionConfig(sdk, workDir, configDir) {
    const parameters = toolParameters();
    return {
      model: input.model,
      workingDirectory: workDir,
      ...(configDir === null ? {} : { configDirectory: configDir }),
      additionalDirectories: [],
      enableConfigDiscovery: false,
      skipCustomInstructions: true,
      enableOnDemandInstructionDiscovery: false,
      enableFileHooks: false,
      enableSkills: false,
      memory: { enabled: false },
      enableSessionStore: false,
      enableHostGitOperations: false,
      requestExtensions: false,
      requestCanvasRenderer: false,
      mcpServers: {},
      tools: [
        sdk.defineTool(WORKER_TOOLS.inventory, {
          description: 'List the approved lifecycle records this worker may inspect. Takes no arguments.',
          parameters: parameters.inventory,
          skipPermission: true,
          defer: 'never',
          handler: (/** @type {unknown} */ args, /** @type {unknown} */ invocation) => answerCall('inventory', args, invocation),
        }),
        sdk.defineTool(WORKER_TOOLS.read, {
          description: 'Read one approved evidence reference from the inventory, optionally only lines start through end.',
          parameters: parameters.read,
          skipPermission: true,
          defer: 'never',
          handler: (/** @type {unknown} */ args, /** @type {unknown} */ invocation) => answerCall('read', args, invocation),
        }),
      ],
      availableTools: [`custom:${WORKER_TOOLS.inventory}`, `custom:${WORKER_TOOLS.read}`],
      excludedTools: ['builtin:*', 'mcp:*'],
      onPermissionRequest: denyPermission,
      onEvent: observeEvent,
    };
  }

  /**
   * Poll one exact release file under the fixture root until it matches the
   * expected closed record. A present file that is not exactly that record
   * (stale or wrong identities, a digest mismatch, malformed, oversized, or
   * not a plain file) refuses at once; the worker deadline or cancellation
   * ends the wait. A release is an observation, never a permission.
   * @param {'startup' | 'evidence'} kind @param {Record<string, unknown>} expected
   * @returns {Promise<string | null>} The release file's SHA-256, or null once the worker settled.
   */
  async function awaitRelease(kind, expected) {
    const qualification = /** @type {Qualification} */ (input.qualification);
    const file = path.join(qualification.fixtureRoot, `${workerId}.${kind}-release.json`);
    for (;;) {
      if (settled) return null;
      const read = readRelease(file);
      if (read.state === 'present' && sameJson(read.value, expected)) return sha256(read.bytes);
      if (read.state !== 'absent') {
        settle(kind === 'startup' ? 'refused' : 'failed', 'qualification_release_mismatch');
        return null;
      }
      const waited = await untilEnded(pause(RELEASE_POLL_MS));
      if (waited.kind === 'ended') return null;
    }
  }

  /**
   * The fixed preflight calls: the invalid inventory, and in a qualification
   * run the unknown-tool controls, the unlisted read, the built-in lookups on
   * the fixture's synthetic targets, and the inventory again.
   * @param {Fixture | null} fixture @returns {Probe[]}
   */
  function probePlan(fixture) {
    /** @param {string} id @returns {Probe} */
    const inventory = (id) => ({
      id, kind: 'custom', tool: 'inventory', name: WORKER_TOOLS.inventory, args: { ...INVALID_PROBE_ARGUMENTS }, expect: 'invalid_arguments',
      reached: false, providerReason: null,
    });
    if (!fixture) return [inventory(PROBE.inventory)];
    return [
      inventory(PROBE.inventory),
      { id: PROBE.controlBefore, kind: 'control', name: UNKNOWN_CONTROLS.before, args: {}, descriptor: false },
      {
        id: PROBE.read, kind: 'custom', tool: 'read', name: WORKER_TOOLS.read, args: { reference: fixture.deniedRead }, expect: 'not_listed',
        reached: false, providerReason: null,
      },
      { id: PROBE.view, kind: 'native', name: NATIVE_PROBES.view, args: { path: fixture.deniedRead }, descriptor: true },
      { id: PROBE.create, kind: 'native', name: NATIVE_PROBES.create, args: { path: fixture.deniedWrite, file_text: CREATE_MARKER }, descriptor: true },
      { id: PROBE.shell, kind: 'native', name: NATIVE_PROBES.shell, args: { ...SHELL_PROBE }, descriptor: true },
      { id: PROBE.mcp, kind: 'native', name: NATIVE_PROBES.mcp, args: {}, descriptor: false },
      { id: PROBE.controlAfter, kind: 'control', name: UNKNOWN_CONTROLS.after, args: {}, descriptor: false },
      inventory(PROBE.inventoryAfter),
    ];
  }

  /**
   * Classify one probe's answer. A custom probe must have reached this
   * worker's handler and come back exactly as expected; a lookup must be the
   * one recognized name-lookup rejection, with the signature the first
   * control calibrated.
   * @param {Probe} probe @param {{kind: 'value', value: unknown} | {kind: 'error', error: unknown}} answer
   * @param {LookupSignature | null} calibration
   * @returns {{record: ProbeRecord, signature: LookupSignature | null}}
   */
  function classify(probe, answer, calibration) {
    const base = { id: probe.id, name: probe.name, argumentsSha256: sha256(canonical(probe.args)) };
    if (probe.kind === 'custom') {
      const value = answer.kind === 'value' ? answer.value : null;
      const code = isRecord(value) && typeof value.resultType === 'string' && ERROR_CODE.test(value.resultType) ? value.resultType : null;
      const text = isRecord(value) && typeof value.textResultForLlm === 'string' ? value.textResultForLlm : null;
      const cause = probe.tool === 'inventory' ? (probe.reached ? 'invalid_arguments' : null) : probe.providerReason;
      const exact = code === 'failure' && text === `Evidence request refused: ${probe.expect}.` && cause === probe.expect;
      return {
        signature: null,
        record: {
          ...base, shape: answer.kind === 'error' ? 'rpc_error' : 'result', code, templateSha256: text === null ? null : sha256(text),
          cause: exact ? probe.expect : 'unrecognized',
        },
      };
    }
    const signature = lookupSignature(answer, probe.name);
    const calibrating = probe.id === PROBE.controlBefore;
    const recognized = signature !== null && (calibrating || (calibration !== null && sameSignature(signature, calibration)));
    return {
      signature,
      record: {
        ...base,
        shape: signature?.shape ?? (answer.kind === 'error' ? 'rpc_error' : 'result'),
        code: signature?.code ?? null,
        templateSha256: signature?.templateSha256 ?? null,
        cause: !recognized ? 'unrecognized' : probe.kind === 'control' ? 'unknown_tool_lookup' : 'unoffered_tool_lookup',
      },
    };
  }

  /**
   * One public readiness call within the startup bound and the worker's life.
   * An error refuses as unsupported.
   * @param {() => unknown} call @returns {Promise<{ok: true, value: unknown} | {ok: false}>}
   */
  async function readinessQuery(call) {
    const answer = await untilEnded(attempt(call));
    if (answer.kind === 'ended' || settled) return { ok: false };
    if (answer.kind === 'error') {
      settle('refused', 'preflight_unsupported');
      return { ok: false };
    }
    return { ok: true, value: answer.value };
  }

  /**
   * Readiness on the actual session, before any prompt, within the startup
   * bound: a first storage observation right after creation, runtime status
   * and the session's own model, the initialized tool catalog, the ambient
   * counts, the fixed probes, and a second storage observation that must
   * agree with the first, then one bounded observation charged to the budget
   * and recorded as `worker_preflight`.
   * @param {WorkerClient} client @param {WorkerSession} session @param {Fixture | null} fixture @param {LoaderRecord} loader
   * @param {Record<string, string>} folders The worker's own folders.
   * @returns {Promise<{observation: PreflightObservation, sha256: string, workspace: Workspace | null} | null>} Null once the
   *   worker settled; `workspace` is the observed workspace directory, null for observed absence.
   */
  async function preflight(client, session, fixture, loader, folders) {
    /** @type {any} */
    let rpc = null;
    try {
      rpc = session.rpc;
    } catch {
      rpc = null;
    }
    const calls = fixture ? [...READINESS_CALLS, ['tools', 'getBuiltinDescriptors']] : READINESS_CALLS;
    /** @param {string} reason */
    const refused = (reason) => {
      settle('refused', reason);
      return null;
    };
    if (!isRecord(rpc) || !calls.every(([space, name]) => hasMethods(rpc[space], [name]))) return refused('preflight_unsupported');
    const query = readinessQuery;
    /**
     * One storage observation: the session's own metadata snapshot, then its
     * `workspacePath` getter, which must agree with the snapshot, then the
     * owned directory a path names. A missing, throwing, malformed, or
     * mismatched answer refuses as unsupported, and an unsafe, unavailable,
     * or oversized path as `storage_unavailable`; neither is ever absence.
     * @returns {Promise<{workspace: Workspace | null} | null>} Null once the worker settled.
     */
    const observeStorage = async () => {
      const snapshot = await query(() => rpc.metadata.snapshot());
      if (!snapshot.ok) return null;
      const reported = snapshotWorkspace(snapshot.value, /** @type {string} */ (sessionId), folders.work);
      const getter = readWorkspacePath(session);
      if (reported === undefined || !getter.ok
        || (reported === null ? getter.value !== undefined : typeof getter.value !== 'string' || !samePath(getter.value, reported))) {
        return refused('preflight_unsupported');
      }
      if (reported === null) return { workspace: null };
      const workspace = ownedWorkspace(/** @type {string} */ (getter.value), /** @type {string} */ (owned.root));
      return workspace ? { workspace } : refused('storage_unavailable');
    };
    const first = await observeStorage();
    if (!first) return null;
    const status = await query(() => client.getStatus());
    if (!status.ok) return null;
    const runtime = runtimeStatus(status.value);
    if (!runtime) return refused('preflight_unsupported');
    const model = await query(() => rpc.model.getCurrent());
    if (!model.ok) return null;
    const modelId = isRecord(model.value) ? model.value.modelId : undefined;
    if (!identifier(modelId)) return refused('preflight_unsupported');
    if (modelId !== input.model) return refused('model_mismatch');
    // Initialization answering at all is not proof; the catalog read after it must hold exactly the two tools.
    if (!(await query(() => rpc.tools.initializeAndValidate())).ok) return null;
    const metadata = await query(() => rpc.tools.getCurrentMetadata());
    if (!metadata.ok) return null;
    const catalog = readCatalog(metadata.value);
    if (!catalog.ok) return refused(catalog.reason);
    const sources = await query(() => rpc.instructions.getSources());
    if (!sources.ok) return null;
    const skills = await query(() => rpc.skills.list());
    if (!skills.ok) return null;
    const servers = await query(() => rpc.mcp.listConfigured());
    if (!servers.ok) return null;
    const extensions = await query(() => rpc.extensions.list());
    if (!extensions.ok) return null;
    const agents = await query(() => rpc.agent.list({ includePrompt: false }));
    if (!agents.ok) return null;
    const selected = await query(() => rpc.agent.getCurrent());
    if (!selected.ok) return null;
    const skillList = isRecord(skills.value) && Array.isArray(skills.value.skills) ? /** @type {unknown[]} */ (skills.value.skills) : null;
    const counts = {
      instructionSources: listLength(sources.value, 'sources'),
      skills: skillList ? skillList.length : null,
      enabledSkills: skillList ? skillList.filter((entry) => isRecord(entry) && entry.enabled === true).length : null,
      mcpServers: listLength(servers.value, 'servers'),
      extensions: listLength(extensions.value, 'extensions'),
      customAgents: listLength(agents.value, 'agents'),
    };
    if (Object.values(counts).some((count) => count === null) || !isRecord(selected.value)) return refused('preflight_unsupported');
    const selectedAgent = selected.value.agent !== undefined && selected.value.agent !== null;
    if (Object.values(counts).some((count) => count !== 0) || selectedAgent) return refused('unexpected_native_effect');
    const plan = probePlan(fixture);
    if (fixture) {
      const descriptors = await query(() => rpc.tools.getBuiltinDescriptors({}));
      if (!descriptors.ok) return null;
      if (!descriptorsFit(descriptors.value, plan)) return refused('preflight_unsupported');
    }
    for (const probe of plan) {
      probes.set(probe.id, probe);
      if (probe.kind !== 'custom') lookupIds.add(probe.id);
    }
    /** @type {ProbeRecord[]} */
    const records = [];
    /** @type {LookupSignature | null} */
    let calibration = null;
    for (const probe of plan) {
      const answer = await untilEnded(attempt(() => rpc.tools.execute({ name: probe.name, arguments: probe.args, toolCallId: probe.id })));
      if (answer.kind === 'ended' || settled) return null;
      const classified = classify(probe, answer, calibration);
      if (probe.id === PROBE.controlBefore) calibration = classified.signature;
      records.push(classified.record);
    }
    if (records.some((entry) => entry.cause === 'unrecognized')) return refused('probe_cause_unrecognized');
    if (fixture && present(fixture.deniedWrite)) return refused('unexpected_native_effect');
    const second = await observeStorage();
    if (!second) return null;
    // Absence must stay absence, and a workspace must keep its path and directory.
    const workspace = second.workspace;
    if (first.workspace === null ? workspace !== null : workspace === null || !sameWorkspace(first.workspace, workspace)) {
      return refused('storage_unavailable');
    }
    // Both snapshots named exactly the actual session, so its ID is the metadata's.
    const metadataSessionId = /** @type {string} */ (sessionId);
    /** @type {PreflightObservation} */
    const observation = {
      version: 1,
      workerId,
      binding: input.binding,
      sessionId: /** @type {string} */ (sessionId),
      qualification: input.qualification && fixture ? {
        version: 1, runId: input.qualification.runId, fixtureSha256: input.qualification.fixtureSha256, canaries: fixture.canaries,
        canaryBytes: fixture.canaryBytes,
      } : null,
      loaders: { joined: input.extension.loader, worker: loader },
      extensionPid: input.extension.pid,
      runtime,
      model: modelId,
      storage: /** @type {string} */ (owned.root),
      sessionStorage: workspace === null ? { kind: 'none', metadataSessionId } : {
        kind: 'workspace', metadataSessionId, workspacePath: workspace.path, directory: { dev: workspace.dev, ino: workspace.ino },
      },
      catalog: catalog.catalog,
      ambient: { ...counts, selectedAgent: false },
      probes: records,
      startedAt: isoTime(startedAt),
      completedAt: isoTime(now()),
    };
    const text = JSON.stringify(observation);
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > WORKER_BOUNDS.startupBytes) return refused('startup_observation_too_large');
    if (!reserve(bytes + 1)) return null;
    return { observation, sha256: sha256(text), workspace };
  }

  /**
   * After the startup latch, with no wait of its own: the public getter must
   * still report the recorded storage, and a workspace must still be the same
   * owned directory. A missing, throwing, or malformed getter refuses as
   * unsupported; any change, from or to absence included, refuses as
   * `storage_unavailable`.
   * @param {WorkerSession} session @param {Workspace | null} workspace The recorded workspace, null for absence.
   */
  function storageHolds(session, workspace) {
    const getter = readWorkspacePath(session);
    if (!getter.ok || (getter.value !== undefined && typeof getter.value !== 'string')) {
      settle('refused', 'preflight_unsupported');
      return false;
    }
    const current = typeof getter.value === 'string' ? ownedWorkspace(getter.value, /** @type {string} */ (owned.root)) : null;
    const holds = workspace === null ? getter.value === undefined : current !== null && sameWorkspace(current, workspace);
    if (!holds) settle('refused', 'storage_unavailable');
    return holds;
  }

  /**
   * One normal storage observation of an existing-sign-in session: its public
   * metadata snapshot must name this session, local and not already in use,
   * working in the owned `work` folder, and its getter must agree; the
   * working directory and any workspace path are bounded absolute paths. The
   * workspace is the runtime's normal storage, so it is neither required to
   * be owned nor opened. A missing, throwing, malformed, or mismatched answer
   * refuses as unsupported, and an unbounded or relative path as
   * `storage_unavailable`; neither is ever absence.
   * @param {any} rpc @param {WorkerSession} session @param {string} workDir
   * @returns {Promise<{workingDirectory: string, workspacePath: string | null} | null>} Null once the worker settled.
   */
  async function observeNormalStorage(rpc, session, workDir) {
    const snapshot = await readinessQuery(() => rpc.metadata.snapshot());
    if (!snapshot.ok) return null;
    const reported = snapshotWorkspace(snapshot.value, /** @type {string} */ (sessionId), workDir);
    const getter = readWorkspacePath(session);
    if (reported === undefined || !getter.ok
      || (reported === null ? getter.value !== undefined : typeof getter.value !== 'string' || !samePath(getter.value, reported))) {
      settle('refused', 'preflight_unsupported');
      return null;
    }
    const workingDirectory = /** @type {string} */ (/** @type {Record<string, unknown>} */ (snapshot.value).workingDirectory);
    const bounded = (/** @type {string} */ value) => singleLine(value) && path.isAbsolute(value) && Buffer.byteLength(value, 'utf8') <= WORKSPACE_PATH_BYTES;
    if (!bounded(workingDirectory) || (reported !== null && !bounded(reported))) {
      settle('refused', 'storage_unavailable');
      return null;
    }
    return { workingDirectory, workspacePath: reported };
  }

  /**
   * Readiness of an existing-sign-in session, before any prompt, within the
   * startup bound: normal storage right after creation, runtime status, the
   * owned client's and the actual session's account, the session's own model
   * and initialized catalog, and normal storage again, which must not have
   * changed; then the version 2 observation, charged to the budget and
   * recorded as `worker_preflight`. No ambient counts or probes run, and none
   * is reported; the latch-only qualification is bound already.
   * @param {WorkerClient} client @param {WorkerSession} session @param {LoaderRecord} loader
   * @param {Record<string, string>} folders The worker's own folders.
   * @returns {Promise<{observation: SignInPreflightObservation, sha256: string,
   *   storage: {workingDirectory: string, workspacePath: string | null}} | null>} Null once the worker settled.
   */
  async function signInPreflight(client, session, loader, folders) {
    /** @type {any} */
    let rpc = null;
    try {
      rpc = session.rpc;
    } catch {
      rpc = null;
    }
    /** @param {string} reason */
    const refused = (reason) => {
      settle('refused', reason);
      return null;
    };
    if (!isRecord(rpc) || !SIGN_IN_READINESS_CALLS.every(([space, name]) => hasMethods(rpc[space], [name]))) return refused('preflight_unsupported');
    accountSources = { client, rpc };
    const first = await observeNormalStorage(rpc, session, folders.work);
    if (!first) return null;
    const status = await readinessQuery(() => client.getStatus());
    if (!status.ok) return null;
    const runtime = runtimeStatus(status.value);
    if (!runtime) return refused('preflight_unsupported');
    const accounts = await observeAccounts();
    if (!accounts) return null;
    const model = await readinessQuery(() => rpc.model.getCurrent());
    if (!model.ok) return null;
    const modelId = isRecord(model.value) ? model.value.modelId : undefined;
    if (!identifier(modelId)) return refused('preflight_unsupported');
    if (modelId !== input.model) return refused('model_mismatch');
    // Initialization answering at all is not proof; the catalog read after it must hold exactly the two tools.
    if (!(await readinessQuery(() => rpc.tools.initializeAndValidate())).ok) return null;
    const metadata = await readinessQuery(() => rpc.tools.getCurrentMetadata());
    if (!metadata.ok) return null;
    const catalog = readCatalog(metadata.value);
    if (!catalog.ok) return refused(catalog.reason);
    const second = await observeNormalStorage(rpc, session, folders.work);
    if (!second) return null;
    if (second.workingDirectory !== first.workingDirectory || second.workspacePath !== first.workspacePath) return refused('storage_unavailable');
    const qualification = input.qualification;
    /** @type {SignInPreflightObservation} */
    const observation = {
      version: 2,
      workerId,
      binding: input.binding,
      sessionId: /** @type {string} */ (sessionId),
      qualification: qualification ? { version: 2, runId: qualification.runId, fixtureSha256: qualification.fixtureSha256 } : null,
      loaders: { joined: input.extension.loader, worker: loader },
      extensionPid: input.extension.pid,
      runtime,
      model: modelId,
      storage: /** @type {string} */ (owned.root),
      auth: accounts,
      // Both snapshots named exactly the actual session, so its ID is the metadata's.
      sessionStorage: { kind: 'normal', metadataSessionId: /** @type {string} */ (sessionId), ...first },
      catalog: catalog.catalog,
      startedAt: isoTime(startedAt),
      completedAt: isoTime(now()),
    };
    const text = JSON.stringify(observation);
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > WORKER_BOUNDS.startupBytes) return refused('startup_observation_too_large');
    if (!reserve(bytes + 1)) return null;
    return { observation, sha256: sha256(text), storage: first };
  }

  /**
   * After the startup latch, an existing-sign-in session's normal storage and
   * account pair are observed again, before `worker_ready` is recorded: the
   * storage must be exactly what was recorded, and the accounts must still
   * match. Each wait holds the worker's life; afterward its deadline and
   * session are checked again.
   * @param {WorkerSession} session @param {{workingDirectory: string, workspacePath: string | null}} recorded @param {string} workDir
   */
  async function signInHolds(session, recorded, workDir) {
    const storage = await observeNormalStorage(/** @type {{rpc: any}} */ (accountSources).rpc, session, workDir);
    if (!storage || settled) return false;
    if (storage.workingDirectory !== recorded.workingDirectory || storage.workspacePath !== recorded.workspacePath) {
      settle('refused', 'storage_unavailable');
      return false;
    }
    return accountsHold();
  }

  /**
   * Right before the prompt, with no wait of its own: an existing-sign-in
   * session's public getter must still report the recorded workspace path, or
   * nothing for none. A missing, throwing, or malformed getter refuses as
   * unsupported; any change refuses as `storage_unavailable`.
   * @param {WorkerSession} session @param {string | null} workspacePath
   */
  function normalGetterHolds(session, workspacePath) {
    const getter = readWorkspacePath(session);
    if (!getter.ok || (getter.value !== undefined && typeof getter.value !== 'string')) {
      settle('refused', 'preflight_unsupported');
      return false;
    }
    const holds = workspacePath === null ? getter.value === undefined : typeof getter.value === 'string' && samePath(getter.value, workspacePath);
    if (!holds) settle('refused', 'storage_unavailable');
    return holds;
  }

  /**
   * Load, prepare, create, check readiness, release, and ask, stopping at the
   * first refusal, failure, or end. Each wait also ends when the result
   * settles first. The prompt can reach the runtime only after `worker_ready`.
   */
  async function work() {
    const loaded = await untilEnded(attempt(loadSdk));
    // A value can win the race in the same turn as cancellation; start nothing then.
    if (loaded.kind === 'ended' || settled) return;
    if (loaded.kind === 'error') {
      const code = !injected && isRecord(loaded.error) ? loaded.error.code : undefined;
      return void settle('refused', code === 'sdk_provenance_unavailable' || code === 'sdk_artifact_changed' ? code : 'sdk_unavailable');
    }
    /** @type {unknown} */
    let sdk = loaded.value;
    /** @type {LoaderRecord} */
    let loader = Object.freeze({ source: 'test_adapter' });
    if (!injected) {
      const value = /** @type {{api: unknown, provenance: Omit<Extract<LoaderRecord, {source: 'fixed_loader'}>, 'source'>}} */ (loaded.value);
      sdk = value.api;
      loader = Object.freeze({ source: 'fixed_loader', ...value.provenance });
    }
    if (!supportsSdk(sdk)) return void settle('refused', 'sdk_unsupported');
    phase = 'starting';
    /** @type {Record<string, string>} */
    const folders = {};
    try {
      owned.root = fs.mkdtempSync(path.join(tempParent, TEMP_PREFIX));
      for (const name of signIn ? SIGN_IN_FOLDERS : FOLDERS) {
        folders[name] = path.join(owned.root, name);
        fs.mkdirSync(folders[name]);
      }
    } catch {
      return void settle('refused', 'storage_unavailable');
    }
    /** @type {Fixture | null} */
    let fixture = null;
    if (input.qualification) {
      // A version 2 run is latch-only: its manifest is checked, and nothing is copied.
      if (signIn ? !latchFixtureBound(input.qualification) : !(fixture = prepareFixture(input.qualification, folders))) {
        return void settle('refused', 'qualification_fixture_invalid');
      }
    }
    if (settled) return;
    /** @type {Record<string, string>} */
    const ownedEnv = {};
    for (const [name, folder] of Object.entries(signIn ? SIGN_IN_OWNED_ENV : OWNED_ENV)) ownedEnv[name] = folders[folder];
    /** @type {unknown} */
    let constructed;
    try {
      const connection = sdk.RuntimeConnection.forStdio({
        path: input.runtime.path,
        args: [...input.runtime.args],
        env: { ...input.runtime.env, ...ownedEnv },
      });
      // The existing-sign-in client: normal mode and logging, the runtime's own saved sign-in, the approved real
      // base directory, and no token. The token client: empty mode, owned base directory, no logging, no logged-in user.
      constructed = new sdk.CopilotClient(signIn ? {
        mode: 'copilot-cli',
        workingDirectory: folders.work,
        baseDirectory: signIn.baseDirectory,
        useLoggedInUser: true,
        connection,
      } : {
        mode: 'empty',
        workingDirectory: folders.work,
        baseDirectory: folders.config,
        logLevel: 'none',
        useLoggedInUser: false,
        gitHubToken: input.runtime.gitHubToken,
        connection,
      });
    } catch {
      return void settle('failed', 'client_failed');
    }
    if (!hasMethods(constructed, ['createSession', 'getStatus', 'stop', 'forceStop', ...(signIn ? ['getAuthStatus'] : [])])) {
      return void settle('refused', 'sdk_unsupported');
    }
    const client = /** @type {WorkerClient} */ (constructed);
    owned.client = client;
    owned.started = true;
    owned.creating = attempt(() => client.createSession(sessionConfig(sdk, folders.work, signIn ? null : folders.config)));
    const created = await untilEnded(owned.creating);
    if (created.kind === 'ended' || settled) return;
    owned.creating = null;
    if (created.kind === 'error') return void settle('failed', 'session_failed');
    const candidate = /** @type {Record<string, unknown>} */ (created.value);
    if (!hasMethods(candidate, ['send', 'abort']) || !identifier(candidate.sessionId)) return void settle('refused', 'sdk_unsupported');
    const session = /** @type {WorkerSession} */ (/** @type {unknown} */ (candidate));
    owned.session = session;
    sessionId = session.sessionId;
    phase = 'preflight';
    const ready = signIn ? await signInPreflight(client, session, loader, folders) : await preflight(client, session, fixture, loader, folders);
    if (!ready || settled) return;
    phase = 'latched';
    if (!checkpoint('worker_preflight', /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (ready.observation)))) return;
    // Recording takes time while no timer can run, so both bounds are read before readiness counts: one that passed
    // meanwhile ends the worker as its timer would have, the earlier bound first.
    if (now() >= Math.min(deadlineAt, startupAt)) return void settle('timed_out', deadlineAt <= startupAt ? 'deadline' : 'startup_deadline');
    cancelStartup();
    settleStartup({ ok: true, observation: ready.observation, sha256: ready.sha256 });
    /** @type {string | null} */
    let startupRelease = null;
    const qualification = input.qualification;
    if (qualification) {
      startupRelease = await awaitRelease('startup', {
        version: 1, release: 'startup', runId: qualification.runId, workerId, operationId: input.binding.operationId,
        permitId: input.binding.permitId, sessionId, observationSha256: ready.sha256,
      });
      if (startupRelease === null) return;
      // The wait counts against the deadline, which can pass while its timer is still pending: no readiness is recorded then.
      if (now() >= deadlineAt) return void settle('timed_out', 'deadline');
    }
    // The recorded storage must still hold after the latch: right before readiness is recorded, and again before the prompt.
    // An existing-sign-in session's normal storage and account pair are observed again first, each wait within its bounds.
    if (signIn) {
      if (!(await signInHolds(session, /** @type {{storage: {workingDirectory: string, workspacePath: string | null}}} */ (ready).storage, folders.work))) {
        return;
      }
    } else if (!storageHolds(session, /** @type {{workspace: Workspace | null}} */ (ready).workspace)) {
      return;
    }
    if (!checkpoint('worker_ready', { workerId, sessionId, observationSha256: ready.sha256, startupRelease })) return;
    // The last check before the first prompt: a timer can fire late, so the deadline is read here too.
    if (settled) return;
    if (signIn ? !normalGetterHolds(session, /** @type {{storage: {workspacePath: string | null}}} */ (ready).storage.workspacePath)
      : !storageHolds(session, /** @type {{workspace: Workspace | null}} */ (ready).workspace)) {
      return;
    }
    if (now() >= deadlineAt) return void settle('timed_out', 'deadline');
    phase = 'running';
    delivery = 'possibly_sent';
    events.sent = true;
    owned.running = true;
    const sent = await untilEnded(attempt(() => session.send({ prompt: input.prompt })));
    if (sent.kind === 'ended' || settled) return;
    if (sent.kind === 'error') {
      owned.running = false;
      return void settle('failed', 'run_failed');
    }
    if (!identifier(sent.value)) return void settle('failed', 'uncorrelated_answer');
    const admissionId = sent.value;
    if (!checkpoint('worker_request_admitted', { workerId, sessionId, admissionId })) return;
    events.admission = admissionId;
    for (const message of events.pending.splice(0)) {
      admitMessage(message);
      if (settled) return;
    }
    wakeCorrelated();
    finishRun();
  }

  /**
   * One bounded cleanup window shared by its steps. A step still pending when
   * the window ends keeps running, and its later outcome is ignored.
   * @param {number} ms
   */
  function cleanupWindow(ms) {
    /** @type {{promise: Promise<void>, resolve: (value: void) => void}} */
    const expired = deferred();
    let open = true;
    const cancel = timers.set(() => {
      open = false;
      expired.resolve();
    }, ms);
    return {
      isOpen: () => open,
      /** @param {Promise<unknown>} promise */
      race: (promise) => Promise.race([
        settleOf(promise),
        expired.promise.then(() => ({ kind: /** @type {const} */ ('timed_out') })),
      ]),
      cancel,
    };
  }

  /**
   * Abort a run still in progress, stop the client and check its errors,
   * then force-stop when stop reports errors or overruns. No step confirms
   * that the runtime and every process it started have exited, so storage a
   * runtime may have used is kept; storage no runtime used is removed. The
   * waits together stay within `stopMs + forceStopMs`.
   * @returns {Promise<WorkerClosed>}
   */
  async function cleanup() {
    /** @type {WorkerClosed['runtime']} */
    let runtime = 'not_started';
    /** @type {WorkerClosed['abort']} */
    let abort = 'not_needed';
    /** @type {WorkerClosed['stop']} */
    let stop = 'not_needed';
    let stopErrors = 0;
    /** @type {WorkerClosed['forceStop']} */
    let forceStop = 'not_needed';
    const client = owned.client;
    if (client && owned.started) {
      runtime = 'unconfirmed';
      const window = cleanupWindow(WORKER_LIMITS.stopMs);
      try {
        // A client whose session creation has not settled is not stopped:
        // stop() could race the runtime's own startup.
        const ready = owned.creating ? (await window.race(owned.creating)).kind !== 'timed_out' : true;
        const session = owned.session;
        if (ready && owned.running && session) {
          const aborted = await window.race(attempt(() => session.abort()));
          abort = aborted.kind === 'value' ? 'acknowledged' : aborted.kind === 'error' ? 'failed' : 'timed_out';
        }
        if (!ready || !window.isOpen()) {
          stop = 'skipped';
        } else {
          const stopped = await window.race(attempt(() => client.stop()));
          if (stopped.kind === 'value' && Array.isArray(stopped.value)) {
            stopErrors = stopped.value.length;
            stop = stopErrors === 0 ? 'clean' : 'errors';
          } else {
            stop = stopped.kind === 'timed_out' ? 'timed_out' : 'failed';
          }
        }
      } finally {
        window.cancel();
      }
      if (stop !== 'clean') {
        const forced = cleanupWindow(WORKER_LIMITS.forceStopMs);
        const outcome = await forced.race(attempt(() => client.forceStop()));
        forced.cancel();
        forceStop = outcome.kind === 'value' ? 'completed' : outcome.kind === 'error' ? 'failed' : 'timed_out';
      }
    }
    /** @type {WorkerClosed['storage']} */
    const storage = owned.root === null ? 'none' : owned.started ? 'retained' : await removeUnused(owned.root);
    return Object.freeze({
      workerId,
      runtime,
      abort,
      stop,
      stopErrors,
      forceStop,
      storage,
      retainedPath: storage === 'none' || storage === 'deleted' ? null : owned.root,
    });
  }

  /**
   * Remove storage no runtime used, within the whole cleanup bound. A
   * removal still running when the bound ends is reported pending; it is
   * neither awaited further nor started again.
   * @param {string} root
   * @returns {Promise<WorkerClosed['storage']>}
   */
  async function removeUnused(root) {
    owned.removing = true;
    const window = cleanupWindow(WORKER_LIMITS.stopMs + WORKER_LIMITS.forceStopMs);
    const removed = await window.race(attempt(() => removeTree(root)));
    window.cancel();
    return removed.kind === 'value' ? 'deleted' : removed.kind === 'error' ? 'delete_failed' : 'delete_pending';
  }

  async function run() {
    try {
      await work();
    } catch {
      settle('failed', 'internal_error');
    }
    // A sent prompt's run continues through events; cleanup starts only once the result settled.
    await ended.promise;
    try {
      closedGate.resolve(await cleanup());
    } catch {
      // Nothing about the runtime or storage is known here, so claim neither.
      closedGate.resolve(Object.freeze({
        ...nothingToClose(workerId),
        runtime: owned.started ? 'unconfirmed' : 'not_started',
        storage: owned.root === null ? 'none' : owned.removing ? 'delete_pending' : 'retained',
        retainedPath: owned.root,
      }));
    }
  }

  void run();
  return Object.freeze({
    workerId,
    startup: startupGate.promise,
    result: resultGate.promise,
    cancel: () => settle('cancelled', 'cancelled'),
    closed: closedGate.promise,
  });
}

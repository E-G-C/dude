// @ts-check
/**
 * Feature 089's native qualification branch. Its only caller is
 *
 *   node scripts/dude-a2a/qualify-collaboration.mjs --native --plan <absolute-v2-or-v3-plan.json>
 *
 * after that runner validated a complete, unexpired version-2 plan (strict
 * qualification) or version-3 plan (normal collaboration; see Version 3 below)
 * and computed its scope digest (./qualify-collaboration.mjs). Nothing here
 * runs at import.
 *
 * Consent. Before any effect, the scope and its planned effects are shown on an
 * interactive terminal, then an action block naming the exact literal
 * `approve native <first 16 hex of the scope digest>`, which the human types or
 * pastes as one line (`readLiteralLine`). Input and the prompt's output must be
 * terminals. Type-ahead and input sooner than a person could react never count:
 * they are dropped with one notice while the prompt keeps waiting. A multi-line
 * paste, EOF, Ctrl+C, or anything else refuses. The block only shows the line:
 * nothing is entered for the human, and only an exact match consents. Plan
 * values, files, receipts, and flags never consent. The scope is recomputed
 * afterwards and must be unchanged. A plan whose runtime payload is null is
 * refused before consent: no public evidence shows that a launcher alone is
 * the complete runtime.
 *
 * Lifetime. Every effect, every public SDK call, and every wait runs against
 * an absolute deadline on the run clock and the consented scope's expiry,
 * checked before it starts and again when it settles; a late answer is
 * discarded, never assumed cancelled. A session event log that overflowed ends
 * the proof wherever it is next consulted. Only owned shutdown runs after the
 * scope expires, and it has its own shared 10-second stop budget.
 *
 * Run. Fresh short roots below the plan's fixture parent: A and B workspaces
 * (each the actual core bundle rendered from this repository's source, with
 * synthetic lifecycle records: A holds 100; B holds 100 and 101), homes,
 * configuration and temp folders, a canary control root, the qualification
 * fixture, and a proof folder. The fixed Windows observer
 * (./native-observer.ps1) starts first, owned by this run before it is ready,
 * and is calibrated with a fixed helper that writes, reads, and exits. A
 * control runtime in the SDK's empty mode then establishes, through parsed
 * public discovery results only, that each synthetic canary form is
 * recognized at its exact location; a file access is never recognition. Its
 * discovery session is then disconnected, and one fresh session there, with
 * A's model and A's credential and only the built-in view, gets the fixed
 * after-view prompt: its own model's one view of the control's denied-read
 * canary must surface and load the control's `AGENTS.md`, shown by the public
 * discovery notification, the passively loaded source's digest, and the
 * observed reads of both files, within one 60-second phase that ends before
 * either main starts. Every public event of that session must be one its
 * phase permits, in the form permitted (`CONTROL_PHASES`, `permittedForm`):
 * before its prompt, during its one turn, or after that turn ended, while its
 * post-turn observations run. Every other event refuses, an undeclared,
 * malformed, or sub-agent's one included, a change of its model or working
 * directory once the run asked for that check, and one stating another
 * session, model, admission, or tool call than the control established
 * (`controlRefusals`); what its session sent before its prompt is
 * judged before the prompt is sent. The report keeps each refused event's
 * type and class only, bounded (`refusedEvents`). A host that shows
 * less stops the run as
 * `ambient_state_unobservable`. The control runtime is then stopped, and its
 * whole process tree must be seen, with complete coverage, to end within 10
 * seconds of that stop before either main starts. Two native runtimes start under explicit
 * credentials and isolated environments; each must be observed as this run's
 * new pinned CLI process loading the plan's runtime payload. Each main
 * session is created with project discovery, extensions, and
 * `extensionSdkPath`, and must show one running `project:dude` extension, the
 * rendered Dude agent (selected by its stable ID), the planned model, and the
 * Dude tools.
 *
 * Each main's complete `dude_a2a_propose` result is shown, then an action
 * block naming the approval line it holds (`approvalAction`); the human types
 * or pastes that session's approval, and only that line, without its
 * surrounding spaces, is sent. The unchanged
 * production classifier must accept the resulting root event, and the
 * activation notice must follow; an attributed or refused relay stops the run.
 * Both mains are then sent their whole exchange instructions together, and no
 * root prompt follows while either operation is pending. The runtimes' own
 * event times must show both instructions admitted before the earliest begin
 * request, and B waiting before A asks: an acceptance condition this runner
 * checks, not an order it can enforce. B's actual served worker records its
 * readiness in B's journal; this runner checks it against the actual
 * operation, session, permit, loaders, SDK files, extension process, and
 * observer, rechecks the session workspace it recorded by path, device, and
 * inode (observed absence allows no persistence), and classifies every file
 * access the observer accumulated, before as well as after that, by role,
 * area, and documented purpose before the startup release, and again at each
 * later observation and the final drain. When the worker's first model
 * evidence call is held, the progress fixtures appear; each main's own model
 * must change its file from `pending` to `complete` through a native tool
 * call that it requested for its current instruction, executed and completed
 * inside that interval. Only then is the evidence release written. The
 * answering worker's whole process tree must end within 10 seconds of its
 * recorded finish, checked before A's capture. A's explicit use of the answer
 * goes through its normal capture, whose staging A's root model delegates to
 * the installed Spec Lead in two direct synchronous tasks, to the actual
 * publisher that A's root model runs. One more exchange
 * is cancelled through the conversation tool while a fresh worker's model
 * call is held; that worker's tree must end within 10 seconds of B's terminal
 * record. Teardown uses only SDK lifecycle stops; the observer then stops its
 * session, drains it, and its final summary must show every owned process
 * ended within 10 seconds, no forbidden or unclassified effect, and complete
 * coverage. The human reviews the live journals and a retained reread after
 * the sessions end.
 *
 * Main-session permission requests go to a fixed relay, and only for a tool
 * call that session's own root model requested for its current instruction,
 * or, in A's capture step alone, one that the installed Spec Lead requested
 * inside a direct synchronous task call A's root model made for that
 * instruction, while that task runs (`specLeadRequest`).
 * In normal mode Dude's own tools ask permission, and so does a view even of
 * a path inside the session's own working directory. The typed consent
 * covers exactly the requests below, which the relay approves once each
 * without asking anyone (`permissionRelay`). From the step instruction's
 * admission until its turn ends, it covers the current step's exact calls
 * of Dude's tools: in each proposal step, `dude_a2a_propose` with that side's
 * configuration and profile; in each exchange, `dude_a2a_conversation`
 * `begin_receive` and `read` for B, and `begin_ask` for that exchange's slug
 * with the fixed question and `read` for A, with `cancel` too in the cancel
 * exchange; and, in the exchange and capture steps, reads inside that
 * session's own workspace (in the capture step the Spec Lead's too). While
 * its phase is open, it also covers the exact pending progress edit, and in
 * the capture step: from A's root model, the exact inventory command, one
 * fixed `Get-FileHash` of a staged ledger, and the publisher command for the
 * plan's slug with literal staged paths under A's temp folder; from the Spec
 * Lead, each new staging file there as its own complete creation; and from
 * either, a read of that folder itself or of anything in it. The approval
 * steps allow none of these, and the capture step no Dude tool call. The
 * Spec Lead runs no command, and A's root model stages nothing itself. Right
 * before each answer the request must still be pending, unchanged, in the
 * same step or phase, and within the scope, or it is rejected; one that
 * managed policy marks as needing a person is never approved. Everything
 * else is rejected. The after-view control session has its own fixed relay,
 * the only one that asks the human about a permission, and only for its one
 * view's reads: each needs a freshly entered `approve-once` within its bound,
 * and after the answer it must still be pending, unchanged, in the same
 * phase, and within the scope, or it is rejected. That request is withdrawn
 * as soon as the view's turn ends, aborts, or errs, or its session shows any
 * event the control refuses: another operation, an activation, or an event
 * it cannot recognize. Worker permissions stay denied by the product.
 * Nothing here kills, deletes, retries, or reruns.
 *
 * A run with injected adapters is a controlled test, labeled as such, and can
 * never report native success, however far it runs. The real branch has never
 * run this strict qualification natively; version-3 attempts have run
 * natively, and none has passed.
 *
 * Version 3: normal collaboration. A version-3 scope selects this branch
 * before any effect; a strict scope never falls through to it. It starts no
 * observer, control runtime, or canary, and copies no credential: preparation
 * writes only the workspaces, their temp folders, the latch-only manifest
 * `{version: 2, runId}`, the proof folder, and the two owner configurations,
 * which must pass the product's own parser with B's worker on its
 * existing-sign-in branch (`auth`, qualification version 2). Each main runtime
 * starts in the SDK's normal `copilot-cli` mode with the logged-in user on, no
 * token, its role's approved real base directory, its own workspace as working
 * directory, and an environment of only the selected names the scope bound
 * (each other name Windows would supply blank, TEMP, TMP, and TMPDIR its own
 * temp folder), rechecked against the current process and base directory
 * before it starts. Before any prompt, and again before every later root
 * prompt, the main's own client (`getAuthStatus`) and its actual session
 * (`gitHubAuth.getStatus`) must each report authenticated as its expected
 * login at its exact expected host by `user` or `gh-cli`; a missing,
 * throwing, malformed, or late answer stops the run as `auth_unavailable`, an
 * unauthenticated one as `auth_required`, and any other account or kind as
 * `auth_mismatch`, and nothing logs in, switches, retries, or falls back.
 * After each awaited answer the run, scope, logs, and pending operations are
 * checked again before the prompt is sent. B's served worker must record
 * `worker_preflight` version 2 (`checkNormalPreflight`): both of its own
 * accounts, its normal session storage in its owned working folder, the
 * latch-only qualification, and no ambient counts or probes, which never
 * pass here. The same releases, progress, conversation, transcript, capture,
 * cancellation, and stop helpers run as in version 2. Each worker's bounded
 * cleanup is read from B's journal and must report a stop without errors;
 * each main's SDK stop must report none either, by its own stop deadline in
 * the shared cleanup budget. Process-tree cessation is
 * reported unconfirmed, storage is kept, and the real home and configuration
 * are never deleted. Strict isolation stays deferred, not run and not passed:
 * a native pass is `collaboration_qualified`, never `qualified`, and a
 * controlled run is still only `controlled_only`.
 */
import { spawn } from 'node:child_process';
import { createHash, randomUUID, X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRelease } from '../build-release.mjs';
import { A2A_PROPOSAL_BYTES, classifyInput, parseA2aConfig } from '../../src/extensions/dude/lib/a2a.mjs';
import { CONVERSATION_LIMITS } from '../../src/extensions/dude/lib/a2a-collaboration.mjs';
import { WORKER_BOUNDS, WORKER_EFFECT_TRIGGERS, WORKER_LIMITS, WORKER_TOOLS } from '../../src/extensions/dude/lib/a2a-peer-worker.mjs';
import { TRANSCRIPT_DIR, TRANSCRIPT_LIMITS, readTranscript } from '../../src/extensions/dude/lib/a2a-transcript.mjs';
import { AFTER_VIEW_CONTROL, CANARIES, PROGRESS_FIXTURES, afterViewPrompt, fixtureManifest, renderedCore, nativeScope } from './qualify-collaboration.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OBSERVER_SCRIPT = path.join(HERE, 'native-observer.ps1');

/** Bounds. Larger input or output is refused, never truncated. */
export const NATIVE_LIMITS = Object.freeze({
  reportBytes: 65_536,
  lineChars: 256,
  humanGapMs: 150,
  humanQueue: 8,
  consentMs: 600_000,
  approvalMs: 300_000,
  permissionMs: 60_000,
  acknowledgeMs: 600_000,
  runtimeMs: 60_000,
  turnMs: 240_000,
  /**
   * A's capture turn alone (`capture`): one turn holds its three commands and two Spec Lead tasks, each of which reads its definition
   * skill before it stages its file, so it keeps a longer bound than every other turn.
   */
  captureTurnMs: 600_000,
  immediateMs: 1_000,
  operationMs: CONVERSATION_LIMITS.operationMs,
  workerMs: CONVERSATION_LIMITS.workerMs,
  startupMs: WORKER_LIMITS.startupMs,
  cleanupMs: CONVERSATION_LIMITS.cleanupMs,
  settleMs: 5_000,
  observerMs: 15_000,
  observerExitMs: 5_000,
  events: 8_192,
  eventBytes: 4_194_304,
  toolRequests: 64,
  /** The after-view control report names at most this many distinct refused event types and classes, and counts the rest (`refusedEvents`). */
  refusedEvents: 8,
  /**
   * The report keeps an entry for at most this many permission requests no person was asked about, refused or approved under the
   * consent, and counts each further refusal (`permissionEntry`).
   */
  permissionEntries: 50,
  /** Each permission entry's `target` is at most this many UTF-8 bytes (`permissionTarget`). */
  targetBytes: 256,
  /** The after-view control's one model-facing view result; a completed call's model-facing result is kept only up to this. */
  viewOutputBytes: AFTER_VIEW_CONTROL.outputBytes,
  liveBytes: 4_194_304,
  processes: 128,
  observerBytes: 65_536,
  tokenBytes: 4_096,
  certificateBytes: 65_536,
  stagedBytes: 16_384,
  requestMs: 2_000,
  pollMs: 100,
});

/** Closed reasons a native run can end with. */
export const NATIVE_REASONS = Object.freeze([
  'consent_not_interactive', 'consent_refused', 'scope_stale', 'scope_expired', 'platform_unsupported',
  'fixture_unavailable', 'fixture_render_mismatch', 'credential_unreadable', 'certificate_unreadable', 'sdk_artifact_changed',
  'sdk_unsupported', 'observer_unavailable', 'observer_privilege_missing', 'observer_refused', 'observer_calibration_failed',
  'observer_coverage_lost', 'observer_overflow', 'observer_identity_uncertain', 'runtime_start_failed', 'runtime_identity_unobserved',
  'ambient_state_unobservable', 'ambient_storage_unclassified', 'unexpected_native_effect', 'extension_not_running',
  'agent_unverified', 'model_mismatch', 'tool_offering_mismatch', 'sdk_provenance_mismatch', 'proposal_unavailable',
  'proposal_too_large', 'approval_input_refused', 'approval_attribution_refused', 'activation_not_observed', 'operation_not_started',
  'instruction_order_unproven', 'worker_refused', 'preflight_mismatch', 'qualification_release_mismatch', 'progress_missed',
  'answer_invalid', 'journal_mismatch', 'capture_not_completed', 'capture_mismatch', 'cancellation_mismatch', 'late_revival',
  'bound_exceeded', 'cessation_unconfirmed', 'retained_mismatch', 'reread_not_acknowledged', 'observation_overflow', 'internal_error',
  'auth_unavailable', 'auth_required', 'auth_mismatch', 'stop_failed',
]);

/** The fixed instruction canaries in the control workspace that its one view may surface: AGENTS.md and the two others. */
const INSTRUCTION_CANARIES = Object.freeze(CANARIES.filter((canary) => canary.location === 'work'
  && (canary.kind === 'instructions' || canary.kind === 'on_demand_instructions')));
/**
 * The documented category and place each fixed instruction canary may be
 * reported with, at each stage that reads it, from the public SDK's closed
 * `InstructionSourceType` (generated/rpc.d.ts:2927-2941) and
 * `InstructionSourceLocation` (:2949-2957): the fields of every
 * `InstructionSource` (:15191-15226) that both the model-less scan's
 * sessionless `instructions.discover` (:24885-24890) and the after-view
 * session's `getSources()` (:15178-15183) return. `documentedKind` accepts a
 * value only by explicit equality with one listed here for that file and
 * stage; any other, missing, or empty value is a mismatch, never a pass.
 *
 * Location: the canaries are the control project's own repository files. The
 * model-less scan names that project as its one project path, and the SDK
 * documents what such a scan returns as "repository/working-directory
 * instruction sources" (:15141-15144), setting `projectPath` on both
 * (:15222-15225); the project is the scan's own working directory and its own
 * repository root, and nothing says which of the two it gets, so the scan
 * accepts `repository` and `working-directory` (:2949-2957), each still bound
 * to the canary's exact path and digest. The after-view session works outside
 * that project, in `k/t`, so there `working-directory` cannot describe it and
 * only `repository` is accepted.
 *
 * Type: the repository instructions are a repository-scoped file (`repo`) and
 * the path-specific instructions a VS Code instruction file (`vscode`) at both
 * stages. Before any view (`scan`), `AGENTS.md` at the project's root is a
 * repository-scoped file, not one discovered from a nested agent file. Once an
 * on-demand view surfaced it (`afterView`), the SDK does not say which of
 * `repo` and `nested-agents` it gets, so either is accepted there.
 */
const CONTROL_SOURCE_KINDS = Object.freeze({
  'AGENTS.md': Object.freeze({
    scan: Object.freeze({ types: Object.freeze(['repo']), locations: Object.freeze(['repository', 'working-directory']) }),
    afterView: Object.freeze({ types: Object.freeze(['repo', 'nested-agents']), locations: Object.freeze(['repository']) }),
  }),
  '.github/copilot-instructions.md': Object.freeze({
    scan: Object.freeze({ types: Object.freeze(['repo']), locations: Object.freeze(['repository', 'working-directory']) }),
    afterView: Object.freeze({ types: Object.freeze(['repo']), locations: Object.freeze(['repository']) }),
  }),
  '.github/instructions/dude-canary.instructions.md': Object.freeze({
    scan: Object.freeze({ types: Object.freeze(['vscode']), locations: Object.freeze(['repository', 'working-directory']) }),
    afterView: Object.freeze({ types: Object.freeze(['vscode']), locations: Object.freeze(['repository']) }),
  }),
});

/**
 * Every session event type the installed public SDK declares, by name only:
 * the 148 members of `SessionEvent` (copilot-sdk 1.0.102
 * generated/session-events.d.ts:12), in that order. Membership never permits
 * an event. It only tells, in the after-view control's report, a declared
 * type the control does not permit where it arrived (`competing`) from a type
 * the SDK does not declare at all (`undeclared`).
 */
export const SDK_EVENT_TYPES = Object.freeze([
  'session.start', 'session.resume', 'session.remote_steerable_changed', 'session.error', 'session.idle', 'session.autopilot_stopped',
  'session.title_changed', 'session.schedule_created', 'session.schedule_cancelled', 'session.schedule_rearmed', 'session.autopilot_objective_changed',
  'session.info', 'session.indexed_search', 'session.warning', 'session.model_change', 'session.model_deselected', 'session.auto_tier_recommendation',
  'session.auto_tier_switch_failed', 'session.mode_changed', 'session.mode_notice_delivered', 'session.session_limits_changed', 'session.permissions_changed',
  'session.plan_changed', 'session.todos_changed', 'session.workspace_file_changed', 'session.handoff', 'session.truncation', 'session.snapshot_rewind',
  'session.shutdown', 'session.usage_checkpoint', 'session.quota_observation', 'session.context_changed', 'session.usage_info', 'session.context_cleared',
  'session.compaction_start', 'session.compaction_complete', 'session.task_complete', 'session.completion_receipt', 'session.fusion_route_started',
  'session.fusion_route_failed', 'session.fusion_resolved', 'session.fusion_completed', 'session.permission_recovery', 'user.message',
  'pending_messages.modified', 'assistant.turn_start', 'assistant.intent', 'assistant.fusion_phase_started', 'assistant.fusion_phase_activity',
  'assistant.fusion_phase_completed', 'assistant.fusion_phase_failed', 'assistant.server_tool_progress', 'assistant.reasoning', 'assistant.reasoning_delta',
  'assistant.tool_call_delta', 'assistant.streaming_delta', 'assistant.message', 'assistant.message_start', 'assistant.message_delta', 'assistant.turn_end',
  'assistant.idle', 'assistant.usage', 'model.call_failure', 'model.call_finished', 'abort', 'tool.user_requested', 'tool.execution_start',
  'tool.execution_partial_result', 'tool.shell_output', 'tool.execution_progress', 'tool.execution_complete', 'tool_search.activated', 'skill.invoked',
  'subagent.started', 'subagent.configured', 'subagent.completed', 'subagent.failed', 'subagent.selected', 'subagent.deselected', 'hook.start', 'hook.end',
  'hook.progress', 'session.binary_asset', 'system.message', 'system.notification', 'permission.requested', 'permission.completed',
  'permission.carriedForward', 'permission.messageAuthorization', 'permission.messageAuthorizationRead', 'permission.messageAuthorizationDegraded',
  'permission.assentDetected', 'permission.contextualAuthorization', 'user_input.requested', 'user_input.completed', 'elicitation.requested',
  'elicitation.completed', 'sampling.requested', 'sampling.completed', 'mcp.oauth_required', 'mcp.oauth_completed', 'mcp.oauth_recovery_completed',
  'mcp.headers_refresh_required', 'mcp.headers_refresh_completed', 'session.custom_notification', 'ui.ephemeral_query', 'external_tool.requested',
  'external_tool.completed', 'command.queued', 'command.execute', 'command.completed', 'auto_mode_switch.requested', 'auto_mode_switch.completed',
  'session_limits_exhausted.requested', 'session_limits_exhausted.completed', 'session.auto_mode_resolved', 'session.managed_plugin_progress',
  'session.managed_settings_resolved', 'session.managed_settings_enforced', 'commands.changed', 'capabilities.changed', 'exit_plan_mode.requested',
  'exit_plan_mode.completed', 'human_response.recorded', 'session.tools_updated', 'session.background_tasks_changed', 'workflow.run_updated',
  'workflow.run_started', 'workflow.run_settled', 'session.skills_loaded', 'session.custom_agents_updated', 'session.mcp_servers_loaded',
  'session.mcp_server_status_changed', 'session.mcp_server_tools_loaded', 'session.mcp_server_removed', 'session.mcp_server_needs_reconnect',
  'mcp.tools.list_changed', 'mcp.resources.list_changed', 'mcp.prompts.list_changed', 'session.extensions_loaded', 'session.canvas.opened',
  'session.canvas.registry_changed', 'session.canvas.closed', 'session.canvas.unavailable', 'session.canvas.recorded', 'session.canvas.removed',
  'session.extensions.attachments_pushed', 'mcp_app.tool_call_complete',
]);
const DECLARED = new Set(SDK_EVENT_TYPES);

/** Display and accounting events every phase of the after-view control permits (:2092-2129, :3592-3810, :3842-3904); none is ever proof. */
const HOUSEKEEPING = Object.freeze(['session.title_changed', 'session.usage_info', 'session.usage_checkpoint', 'session.quota_observation']);
/**
 * What the after-view control's one session may send in each phase. The lists
 * are exhaustive: every other event, in every phase, refuses
 * (`controlRefusals`), and each listed type only in the one form permitted
 * (`permittedForm`). Housekeeping (`HOUSEKEEPING`) may come in every phase.
 *
 * - `preSend`, from its creation until its one prompt is sent: its own start,
 *   once, while it is created (:1610-1711), an idle (:2009-2045), the system
 *   message (:9033-9082), its tool catalog (:13077-13112), and, only before
 *   the run asks for that check, the startup or SDK selection of its model
 *   (:2459-2548) and its working directory (:3812-3838).
 * - `inTurn`, from that send through its turn's end (`turnEnd`): the six
 *   events its proof reads, the admission (:4929-5007), the model's messages
 *   (:6111-6245), the view's start and completion (:7330-7420, :7624-7731),
 *   the discovery notification (:9118-9155, :9277-9299), and the idle that
 *   ends the turn; and the model's normal processing: its turns, intent,
 *   reasoning, streaming, and usage (:5484-5569, :5934-6245, :6522-6907), a
 *   finished dispatch (:7191-7243), the view's progress (:7575-7620), its
 *   read's permission request and completion (:9362-9427, :10673-10724), and
 *   the system message. A turn may take several model iterations: the control
 *   needs one admission and one tool operation, not one turn start.
 * - `postTurn`, after that end until both post-turn observations are done: a
 *   repeated normal idle only.
 */
const CONTROL_PHASES = Object.freeze({
  preSend: new Set([...HOUSEKEEPING, 'session.start', 'session.idle', 'system.message', 'session.tools_updated', 'session.model_change',
    'session.context_changed']),
  inTurn: new Set([...HOUSEKEEPING, 'user.message', 'assistant.message', 'tool.execution_start', 'tool.execution_complete', 'system.notification',
    'session.idle', 'assistant.turn_start', 'assistant.turn_end', 'assistant.intent', 'assistant.reasoning', 'assistant.reasoning_delta',
    'assistant.tool_call_delta', 'assistant.streaming_delta', 'assistant.message_start', 'assistant.message_delta', 'assistant.idle', 'assistant.usage',
    'model.call_finished', 'tool.execution_progress', 'permission.requested', 'permission.completed', 'system.message']),
  postTurn: new Set([...HOUSEKEEPING, 'session.idle']),
});
const PERMITTED = new Set([...CONTROL_PHASES.preSend, ...CONTROL_PHASES.inTurn, ...CONTROL_PHASES.postTurn]);
/** The documented permission results (:1235, :10728-11011) of a decision on that one request alone, never a hook's or a kept grant. */
const ONE_TIME_RESULTS = Object.freeze(['approved', 'cancelled', 'denied-by-rules', 'denied-no-approval-rule-and-could-not-request-from-user',
  'denied-interactively-by-user', 'denied-by-content-exclusion-policy']);

/** A documented optional flag left unraised: absent, or exactly false. @param {unknown} value */
function unraised(value) {
  return value === undefined || value === false;
}

/** A documented optional list left empty: absent, or a list that holds nothing. @param {unknown} value */
function empty(value) {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

/**
 * Whether one root event of a type some phase of the after-view control
 * permits (`CONTROL_PHASES`) is in the one form permitted, read from its raw
 * data before anything is summarized: each field the control reads present in
 * its documented type and bound, and each documented field that would show
 * another operation or an activation in its inactive form; an unknown value
 * is never inactive. A permitted type with no such field has no other form.
 * The payload of a type no phase permits is never read.
 * @param {string} type @param {Record<string, any>} data
 */
function permittedForm(type, data) {
  switch (type) {
    case 'session.start': {
      // :1640-1711, built from the session's own options (cli-main.js:1689:83471): no remote steering, no other client, no parent
      // session's context, and the built-in GitHub MCP server asked for nothing (:1753-1770).
      const github = data.githubMcpToolConfig;
      return presentText(data.sessionId, 256) && optionalText(data.selectedModel, 256)
        && (data.context === undefined || (isRecord(data.context) && presentText(data.context.cwd, 1_024))) && unraised(data.remoteSteerable)
        && unraised(data.alreadyInUse) && data.detachedFromSpawningParentSessionId === undefined
        && (github === undefined || (isRecord(github) && empty(github.additionalTools) && empty(github.additionalToolsets) && unraised(github.enableAllTools)
          && unraised(github.enableInsidersMode)));
    }
    case 'session.model_change':
      // :2489-2548: only the startup or the SDK's own selection (:279-305), never a custom agent's, plan mode's, settings', or the runtime's.
      return presentText(data.newModel, 256) && [undefined, 'startup', 'sdk'].includes(data.source);
    case 'session.context_changed':
      return presentText(data.cwd, 1_024); // :1715-1749
    case 'session.tools_updated':
      return presentText(data.model, 256); // :13107-13112
    case 'session.idle':
      // :2039-2045: a normal end, not an aborted loop, in the interactive mode (:80-86).
      return unraised(data.aborted) && [undefined, 'interactive'].includes(data.mode);
    case 'user.message':
      // :4959-5007: a typed prompt starting its own run (:720-726) in the interactive mode (:686-694), with no attachment, autopilot
      // continuation, or background agent's task.
      return typeof data.content === 'string' && optionalText(data.messageId, 256) && optionalText(data.source, 128) && unraised(data.isAutopilotContinuation)
        && data.parentAgentTaskId === undefined && [undefined, 'interactive'].includes(data.agentMode) && [undefined, 'idle'].includes(data.delivery)
        && empty(data.attachments);
    case 'assistant.message': {
      // :6141-6245, requests :6477-6508: no HydraFusion attribution (:6177) or provider-hosted server tool (:6232, :6450-6473), and each
      // request one of the session's own model, of no tool an MCP server hosts, made by no hosted program.
      const requests = data.toolRequests;
      const server = data.serverTools;
      return optionalText(data.originatingMessageId, 256) && data.fusion === undefined
        && (requests === undefined || (Array.isArray(requests) && requests.length <= NATIVE_LIMITS.toolRequests && requests.every((entry) => isRecord(entry)
          && presentText(entry.toolCallId, 256) && presentText(entry.name, 128) && entry.mcpServerName === undefined && entry.mcpToolName === undefined
          && entry.caller === undefined)))
        && (server === undefined || (isRecord(server) && empty(server.items) && empty(server.rawContentBlocks) && server.advisorModel === undefined
          && (server.functionCallNamespaces === undefined || (isRecord(server.functionCallNamespaces) && !Object.keys(server.functionCallNamespaces).length))));
    }
    case 'tool.execution_start':
      // :7360-7420: no MCP tool (:7378-7388), HydraFusion attribution (:7374), or shell (:7402, :7424-7439).
      return presentText(data.toolCallId, 256) && presentText(data.toolName, 128) && ['mcpServerName', 'mcpToolName', 'mcpConfigServerName',
        'mcpConfigSource', 'mcpTransport', 'fusion', 'shellToolInfo'].every((key) => data[key] === undefined);
    case 'tool.execution_complete': {
      // :7654-7731, result :7760-7796: the model-facing result, and no call the user requested (:7675), HydraFusion attribution (:7667),
      // file edit (:7661), shell (:7705), MCP structured output, or app resource (:8106-8124).
      const result = data.result;
      return presentText(data.toolCallId, 256) && typeof data.success === 'boolean' && unraised(data.isUserRequested) && data.fusion === undefined
        && data.shellExecution === undefined && empty(data.fileEdits) && (result === undefined || (isRecord(result) && typeof result.content === 'string'
          && result.uiResource === undefined && result.structuredContent === undefined));
    }
    case 'system.notification': {
      // :9148-9155, kinds :1084: only an instruction discovery (:9277-9299), with its source, trigger file, and trigger tool.
      const kind = data.kind;
      return isRecord(kind) && kind.type === 'instruction_discovered' && presentText(kind.sourcePath, 1_024) && presentText(kind.triggerFile, 1_024)
        && presentText(kind.triggerTool, 64);
    }
    case 'assistant.tool_call_delta':
    case 'tool.execution_progress':
      return presentText(data.toolCallId, 256); // :6062, :7619
    case 'assistant.idle':
      return unraised(data.aborted); // :6690-6694
    case 'assistant.usage':
      // :6729-6907: a call of the session's own conversation, started by the human or its main agent (:6785; the 1.0.102 runtime labels
      // them `user` or `agent`, cli-main.js:1537:86144), of the user or agent interaction class (:6791-6793), with no HydraFusion
      // attribution (:6781). Any other class, compaction included, or an unknown one refuses.
      return [undefined, 'user', 'agent'].includes(data.initiator) && [undefined, 'conversation-user', 'conversation-agent'].includes(data.interactionType)
        && data.fusion === undefined;
    case 'model.call_finished':
      // :7221-7243, outcomes :894-902: an accepted dispatch that requested no built-in file edit.
      return data.outcome === 'success' && unraised(data.containsBuiltInFileEditRequest);
    case 'permission.requested': {
      // :9392-9427, read :9653-9694: a read the human relay answers, with no hook's resolution (:9422), delegated owner (:9403), HydraFusion
      // attribution (:9399), Autopilot recovery (:9414), assisted or allow-all mode (:9408, :338-344), plan or autopilot mode (:9393), or
      // assisted-approval judgment of its prompt (:9410, :9817-9833).
      const request = data.permissionRequest;
      const prompt = data.promptRequest;
      return isRecord(request) && request.kind === 'read' && optionalText(request.toolCallId, 256) && optionalText(data.ownerSessionId, 256)
        && unraised(data.resolvedByHook) && data.ownerAgentId === undefined && data.fusion === undefined && data.recoveryEpisodeId === undefined
        && [undefined, 'manual'].includes(data.permissionMode) && [undefined, 'interactive'].includes(data.agentMode)
        && (prompt === undefined || (isRecord(prompt) && prompt.assistedApproval === undefined));
    }
    case 'permission.completed': {
      // :10703-10724: a decision on that one request (`ONE_TIME_RESULTS`), by the human, a host policy, or an unattended denial
      // (:1221-1231), never the assisted-approval judge or a carried-forward grant, managed policy's, or one settling Autopilot recovery.
      const result = data.result;
      return isRecord(result) && ONE_TIME_RESULTS.includes(result.kind) && unraised(result.managedApprovalHandled) && optionalText(data.toolCallId, 256)
        && [undefined, 'human_response', 'host_policy', 'unattended_fallback'].includes(data.decisionSource) && data.recoveryEpisodeId === undefined
        && data.blocker === undefined;
    }
    default:
      return true;
  }
}

/** The fixed short layout below the fixture parent; short paths keep the complete proposals under the fixed cap. */
const LAYOUT = Object.freeze({ a: 'a', b: 'b', control: 'k', fixture: 'q', proof: 'p', workspace: 'w', home: 'h', config: 'c', temp: 't' });
/** Synthetic lifecycle records. A holds only 100; B holds 100 and 101, which A lacks. */
const SEEDS = Object.freeze({
  a: [{ number: 100, slug: 'local-seed' }],
  b: [{ number: 100, slug: 'peer-seed' }, { number: 101, slug: 'peer-latest' }],
});
const QUESTION = 'Which is the highest lifecycle number in your approved records?';
const IDEA_TEXT = 'Record one synthetic qualification idea; it has no product meaning.';
const CANCEL_CUE = Object.freeze({ path: 'cancel-a.txt', content: 'cancel\n' });
const CONSENT_PREFIX = 'approve native ';
const ACKNOWLEDGE = 'reread reviewed';
const PERMISSION_ANSWERS = Object.freeze({ approve: 'approve-once', reject: 'reject' });
/** The answer a main permission entry keeps for a request the relay approved itself under the typed consent: no person answered it. */
const CONSENTED = 'consented';
/** Every human prompt is only this; the action block right above it says what to enter (`actionBlock`). */
const ANSWER_PROMPT = '> ';
/** Written once per prompt when input that came too early to answer it is dropped (`readLiteralLine`). */
const EARLY_INPUT_NOTICE = '(Input received before this prompt was ignored. Enter the line now.)';
/** The plain-ASCII rule above and below each action block. */
const ACTION_RULE = '='.repeat(60);
const APPROVAL_SHAPE = /^dude a2a (?:approve \S+|stop)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu;
const TOKEN = /^[\x21-\x7e]+$/;
const CONVERSATION = 'dude_a2a_conversation';
const PROPOSE = 'dude_a2a_propose';
const DUDE_TOOLS = Object.freeze([PROPOSE, CONVERSATION]);
/** The preflight probes a qualification worker must record, in order, with their only accepted causes. */
const PROBE_CAUSES = Object.freeze([
  ['dude-a2a-preflight-inventory', 'invalid_arguments'],
  ['dude-a2a-preflight-control-before', 'unknown_tool_lookup'],
  ['dude-a2a-preflight-read', 'not_listed'],
  ['dude-a2a-preflight-view', 'unoffered_tool_lookup'],
  ['dude-a2a-preflight-create', 'unoffered_tool_lookup'],
  ['dude-a2a-preflight-shell', 'unoffered_tool_lookup'],
  ['dude-a2a-preflight-mcp', 'unoffered_tool_lookup'],
  ['dude-a2a-preflight-control-after', 'unknown_tool_lookup'],
  ['dude-a2a-preflight-inventory-after', 'invalid_arguments'],
]);
/** Records of one complete answered asking journal, in order; qualification never appends to it. */
const ANSWERED = Object.freeze(['opened', 'accepted', 'request_prepared', 'request_write_started', 'reply_received', 'reply_validated',
  'terminal', 'closed']);
/** Read-only path classes every owned process may read. */
const SHARED_READ = Object.freeze(['system', 'runtime', 'payload', 'node', 'sdk', 'device']);
/** Devices (pipes including stdio, the console, sockets, and the null device) every owned process may also write; only counts are kept. */
const SHARED_WRITE = Object.freeze(['device']);
/**
 * Shell and script hosts a worker process may never start, by image name.
 * They are named so a refusal says why; every other image not in the
 * worker's verified list is refused too, whatever folder it is in.
 */
const SHELL_IMAGES = Object.freeze(['cmd.exe', 'powershell.exe', 'pwsh.exe', 'powershell_ise.exe', 'wsl.exe', 'bash.exe', 'sh.exe', 'wscript.exe',
  'cscript.exe', 'mshta.exe']);
/**
 * Names Windows supplies to a child of this process when its environment
 * lacks them; a version-3 runtime gets each one it does not select as blank,
 * as the product composes its existing-sign-in worker's, so nothing outside
 * the selected names is inherited. Its own TEMP is set instead.
 */
const NORMAL_BLANK = Object.freeze(['LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME']);
/** The temp variables a version-3 runtime points at its own temp folder. */
const NORMAL_TEMP = Object.freeze(['TEMP', 'TMP', 'TMPDIR']);
/** The account kinds a saved sign-in reports: an interactive sign-in or the GitHub CLI's. */
const SIGN_IN_AUTH_TYPES = Object.freeze(['user', 'gh-cli']);
/** UTF-8 bound of an observed host and login, as the product bounds them. */
const ACCOUNT_BYTES = 256;
/** UTF-8 bound of a session storage path a normal worker records. */
const STORAGE_PATH_BYTES = 1_024;
/** Exactly the fields of a normal worker's `worker_preflight` version 2: no ambient counts or probes. */
const NORMAL_PREFLIGHT_KEYS = Object.freeze(['version', 'workerId', 'binding', 'sessionId', 'qualification', 'loaders', 'extensionPid', 'runtime',
  'model', 'storage', 'auth', 'sessionStorage', 'catalog', 'startedAt', 'completedAt']);

/** A closed refusal or failure; `reason` is one of NATIVE_REASONS. */
export class NativeStop extends Error {
  /** @param {string} reason @param {string} detail */
  constructor(reason, detail) {
    super(detail);
    this.reason = NATIVE_REASONS.includes(reason) ? reason : 'internal_error';
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Buffer | string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value @returns {string} */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });
}

/** Terminal-safe text: every control and bidirectional character escaped. @param {string} text */
export function terminalSafe(text) {
  return text.replace(CONTROL, (character) => `\\u${/** @type {number} */ (character.codePointAt(0)).toString(16).padStart(4, '0')}`);
}

/**
 * Terminal-safe multi-line text for reading: each line feed stays a line
 * break; every other control and bidirectional character, CR included, is
 * escaped as in `terminalSafe`.
 * @param {string} text
 */
export function terminalLines(text) {
  return text.split('\n').map(terminalSafe).join('\n');
}

/** @param {string} base @param {string} candidate */
function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Case-insensitive path equality on Windows. @param {string} left @param {string} right */
function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** @param {string} reason @param {string} detail @returns {never} */
function stop(reason, detail) {
  throw new NativeStop(reason, detail);
}

// ---------------------------------------------------------------------------
// The human terminal: fresh literal lines only.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Terminal
 * @property {NodeJS.ReadStream | any} input Must be an interactive terminal.
 * @property {NodeJS.WriteStream | any} output Where prompts and live views are shown; must be an interactive terminal.
 * @property {() => number} [clock] Milliseconds; default `Date.now`.
 */

/**
 * Read one fresh line that the human typed or pasted. Input and output must be
 * terminals. Input entered before the prompt, or sooner than
 * `NATIVE_LIMITS.humanGapMs` after it is shown, never counts but does not end
 * the read: whatever already waits in the stream is read out and dropped before
 * the prompt is shown, and every chunk arriving before that gap has passed,
 * such as keystrokes or a paste that a console held until the read started, is
 * dropped too. The first drop writes one notice line, with the prompt shown
 * again below it if it was already on screen, and the read keeps waiting for
 * fresh input. Dropped text is never echoed and never becomes part of the line,
 * so a line entered only early ends at the time limit (`input_timeout`). Each
 * chunk that counts is read character by character: printable ASCII is added
 * and echoed, backspace edits, and CR or LF ends the line, a CRLF counting
 * once. Ctrl+C or Ctrl+D cancels (`input_cancelled`). Any other control
 * character or escape sequence (`input_unsupported`), more text after the
 * line's end in the same chunk, as a multi-line paste brings
 * (`input_multiline`), overlength input (`input_too_long`), EOF (`input_eof`),
 * and the time limit (`input_timeout`) refuse the whole line; no part of it is
 * ever accepted. `signal`, when given, is the caller's own deadline: once it
 * aborts, the read ends as `input_timeout`, exactly as at the time limit, and
 * releases the terminal. The finished line loses only its leading and trailing
 * spaces, which a copy often adds; nothing else is changed, completed,
 * computed, or inferred for the human.
 * @param {Terminal} terminal @param {string} prompt @param {{timeoutMs: number, maxChars?: number, signal?: AbortSignal}} options
 * @returns {Promise<{ok: true, line: string} | {ok: false, reason: string}>}
 */
export function readLiteralLine(terminal, prompt, { timeoutMs, maxChars = NATIVE_LIMITS.lineChars, signal }) {
  const { input, output } = terminal;
  const clock = terminal.clock ?? Date.now;
  if (!input || !output || input.isTTY !== true || output.isTTY !== true || typeof input.setRawMode !== 'function') {
    return Promise.resolve({ ok: false, reason: 'not_interactive' });
  }
  if (input.readableEnded || input.destroyed) return Promise.resolve({ ok: false, reason: 'input_eof' });
  if (signal?.aborted) return Promise.resolve({ ok: false, reason: 'input_timeout' });
  let dropped = false;
  while ((input.readableLength ?? 0) > 0 && input.read() !== null) dropped = true;
  if (dropped) output.write(`${EARLY_INPUT_NOTICE}\n`);
  output.write(prompt);
  const shownAt = clock();
  return new Promise((resolve) => {
    let line = '';
    let fresh = false;
    let done = false;
    const timer = setTimeout(() => finish({ ok: false, reason: 'input_timeout' }), timeoutMs);
    const onAbort = () => finish({ ok: false, reason: 'input_timeout' });
    /** @param {Buffer | string} chunk */
    const onData = (chunk) => {
      // Until the gap has passed, input is what was entered before the prompt: dropped whole, ending nothing. Once fresh input
      // has counted, every later chunk counts too.
      if (!fresh && clock() - shownAt < NATIVE_LIMITS.humanGapMs) {
        if (!dropped) output.write(`\n${EARLY_INPUT_NOTICE}\n${prompt}`);
        dropped = true;
        return undefined;
      }
      fresh = true;
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      let offset = 0;
      for (const character of text) {
        offset += character.length;
        if (character === '\r' || character === '\n') {
          // Only further line ends may follow in this chunk: more text is a multi-line paste, refused whole rather than taken in part.
          if (/[^\r\n]/.test(text.slice(offset))) return finish({ ok: false, reason: 'input_multiline' });
          output.write('\n');
          return finish({ ok: true, line: line.replace(/^ +| +$/g, '') });
        }
        if (character === '\u0003' || character === '\u0004') return finish({ ok: false, reason: 'input_cancelled' });
        if (character === '\u007f' || character === '\b') {
          if (line) {
            line = line.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        if (!/^[\x20-\x7e]$/.test(character)) return finish({ ok: false, reason: 'input_unsupported' });
        if (line.length >= maxChars) return finish({ ok: false, reason: 'input_too_long' });
        line += character;
        output.write(character);
      }
      return undefined;
    };
    const onEnd = () => finish({ ok: false, reason: 'input_eof' });
    /** @param {{ok: true, line: string} | {ok: false, reason: string}} result */
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('close', onEnd);
      try {
        input.setRawMode(false);
      } catch {
        // The terminal may already be gone; the result stands.
      }
      input.pause();
      if (!result.ok) output.write('\n');
      resolve(result);
    }
    input.setRawMode(true);
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('close', onEnd);
    signal?.addEventListener('abort', onAbort, { once: true });
    input.resume();
  });
}

/** The exact consent literal for one scope. @param {string} scopeSha256 */
export function consentLiteral(scopeSha256) {
  return `${CONSENT_PREFIX}${scopeSha256.slice(0, 16)}`;
}

/**
 * The plain-ASCII block written right above a human prompt (`> `): what is
 * asked, the exact line to enter or, when no single line can be named, where
 * to find it, the one alternative, and the time left before the prompt's
 * deadline, counting any wait in line. It only guides: the human still enters
 * the line, and every caller still requires an exact match.
 * @param {{title: string, line: string | null, find?: readonly string[], alternative?: string, note: string}} action
 * @param {number} remainingMs
 */
export function actionBlock(action, remainingMs) {
  const seconds = Math.max(1, Math.round(remainingMs / 1_000));
  /** @param {number} amount @param {string} unit */
  const count = (amount, unit) => `${amount} ${unit}${amount === 1 ? '' : 's'}`;
  const time = seconds < 120 ? count(seconds, 'second')
    : [count(Math.floor(seconds / 60), 'minute'), ...(seconds % 60 ? [count(seconds % 60, 'second')] : [])].join(' ');
  const enter = action.line === null ? [...(action.find ?? [])] : ['Type or paste this line, then press Enter:', '', `    ${action.line}`];
  return [ACTION_RULE, `ACTION NEEDED: ${action.title}`, ...enter, '', ...(action.alternative ? [action.alternative] : []),
    `${action.note} Time limit: ${time}.`, ACTION_RULE, ''].map(terminalSafe).join('\n');
}

/** A proposal's one `Approval:` line as the product renders it (a2a.mjs `renderProposal`): its code is one plain token before `;`. */
const APPROVAL_LINE = /^Approval: dude a2a approve ([\x21-\x3a\x3c-\x7e]+);/;

/**
 * The action block of one main's approval prompt: the exact
 * `dude a2a approve <code>` of the proposal's one `Approval:` line, or, when
 * the proposal holds no such line, more than one, or a code that is not one
 * plain token, how to find the proposal's own line, never a code picked or
 * made up here; `dude a2a stop` declines. Only the line the human enters is
 * relayed, and it is checked exactly as before.
 * @param {'a' | 'b'} side @param {string} text The complete proposal, as shown.
 */
export function approvalAction(side, text) {
  const approvals = text.split('\n').filter((line) => line.startsWith('Approval:'));
  const code = approvals.length === 1 ? APPROVAL_LINE.exec(approvals[0])?.[1] : undefined;
  return {
    title: `Approve session ${side.toUpperCase()}'s proposal above`,
    line: code ? `dude a2a approve ${code}` : null,
    ...(code ? {} : { find: ['Its approval line could not be picked out exactly once, so it',
      'is not repeated here. To approve, type or paste the proposal\'s', 'own "dude a2a approve ..." line (from its Approval: line, up to',
      'the ";"), then press Enter.'] }),
    alternative: 'To decline, enter instead: dude a2a stop',
    note: 'Any other line stops the run.',
  };
}

/** The action block of the after-view control's permission ask, the only permission a run asks the human about. */
const CONTROL_PERMISSION_ACTION = Object.freeze({ title: 'Approve or reject the CONTROL request above', line: PERMISSION_ANSWERS.approve,
  alternative: `To reject it instead, enter: ${PERMISSION_ANSWERS.reject}`, note: 'Any other line also rejects it.' });

/**
 * One prompt at a time on the shared terminal, so prompts that could overlap
 * are asked separately and each answer is fresh.
 * Each ask has one absolute deadline on `clock` covering both its wait in the
 * queue and the typing; at most `NATIVE_LIMITS.humanQueue` asks wait at once.
 * A request that is no longer `valid` when its turn comes is never shown, and
 * an answer finished after the deadline does not count. A shown prompt is
 * released at that deadline as the run's clock reads it, polled like every
 * other wait, so its terminal read never outlives its bound.
 * @param {Terminal} terminal @param {() => number} clock
 */
export function humanQueue(terminal, clock) {
  /** @type {Promise<unknown>} */
  let tail = Promise.resolve();
  let waiting = 0;
  return {
    /** @param {string} text */
    show(text) {
      terminal.output.write(text.endsWith('\n') ? text : `${text}\n`);
    },
    /**
     * @param {string} prompt
     * @param {{deadlineAt: number, valid?: () => boolean, preface?: string, action?: Parameters<typeof actionBlock>[0]}} options
     *   `action`, when given, is shown as its block right after `preface` and right before the prompt, with the time then left
     *   until `deadlineAt`.
     * @returns {Promise<{ok: true, line: string} | {ok: false, reason: string}>}
     */
    ask(prompt, { deadlineAt, valid = () => true, preface, action }) {
      if (waiting >= NATIVE_LIMITS.humanQueue) return Promise.resolve({ ok: false, reason: 'queue_full' });
      waiting += 1;
      const next = tail.then(async () => {
        if (!valid()) return { ok: false, reason: 'request_withdrawn' };
        const remaining = deadlineAt - clock();
        if (remaining <= 0) return { ok: false, reason: 'input_timeout' };
        if (preface) terminal.output.write(preface.endsWith('\n') ? preface : `${preface}\n`);
        if (action) terminal.output.write(actionBlock(action, remaining));
        // The read's own timer follows real time, not the run's clock: a watch on that clock ends it at the deadline too.
        const reached = new AbortController();
        const watch = setInterval(() => { if (!(clock() < deadlineAt)) reached.abort(); }, NATIVE_LIMITS.pollMs);
        try {
          const answer = await readLiteralLine(terminal, prompt, { timeoutMs: remaining, signal: reached.signal });
          return answer.ok && clock() > deadlineAt ? { ok: false, reason: 'input_timeout' } : answer;
        } finally {
          clearInterval(watch);
        }
      }).finally(() => { waiting -= 1; });
      tail = next.catch(() => undefined);
      return /** @type {Promise<{ok: true, line: string} | {ok: false, reason: string}>} */ (next);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture preparation: fresh, short, exclusively created roots.
// ---------------------------------------------------------------------------

/**
 * The fixed short folders below the fixture parent.
 * @param {string} parent
 */
export function layoutOf(parent) {
  /** @param {string} name */
  const side = (name) => ({
    root: path.join(parent, name),
    workspace: path.join(parent, name, LAYOUT.workspace),
    home: path.join(parent, name, LAYOUT.home),
    config: path.join(parent, name, LAYOUT.config),
    temp: path.join(parent, name, LAYOUT.temp),
  });
  return {
    parent,
    a: { ...side(LAYOUT.a), a2aConfig: path.join(parent, LAYOUT.a, 'a2a.json') },
    b: { ...side(LAYOUT.b), a2aConfig: path.join(parent, LAYOUT.b, 'a2a.json') },
    control: side(LAYOUT.control),
    fixture: path.join(parent, LAYOUT.fixture),
    proof: path.join(parent, LAYOUT.proof),
  };
}
/** @typedef {ReturnType<typeof layoutOf>} Layout */

/** Create one file that must not exist yet, with its folders. @param {string} file @param {string | Buffer} bytes */
function writeNew(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx' });
}

/** A lint-clean synthetic draft ledger. @param {string} slug */
export function seedLedger(slug) {
  return ['---', `title: ${slug}`, `slug: ${slug}`, 'status: draft', 'spec_path: ', '---', '', '## Idea', '',
    'Synthetic qualification record; it has no product meaning.', '', '## Open Questions', '', '- None.', '', '## Assumptions', '',
    '- None.', '', '## Coordinator Log', '', '- 2026-11-01 Captured.', ''].join('\n');
}

/**
 * One whole owner file of at most `limit` bytes, read once through no link.
 * @param {string} file @param {number} limit @param {string} reason
 */
function readOwnerFile(file, limit, reason) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return stop(reason, 'a named owner file cannot be inspected');
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > limit) return stop(reason, 'a named owner file is not a bounded regular file');
  const bytes = fs.readFileSync(file);
  if (bytes.length !== stat.size) return stop(reason, 'a named owner file changed while it was read');
  return bytes;
}

/** The SHA-256 pin of one PEM certificate's DER bytes. Only the certificate is read, never a key. @param {string} file */
export function certificatePin(file) {
  const bytes = readOwnerFile(file, NATIVE_LIMITS.certificateBytes, 'certificate_unreadable');
  try {
    return sha256(new X509Certificate(bytes).raw);
  } catch {
    return stop('certificate_unreadable', 'a named certificate is not one PEM or DER certificate');
  }
}

/** One credential line, never shown or recorded. @param {string} file */
export function readToken(file) {
  const bytes = readOwnerFile(file, NATIVE_LIMITS.tokenBytes, 'credential_unreadable');
  const text = bytes.toString('utf8').replace(/\r?\n$/, '');
  if (!TOKEN.test(text)) return stop('credential_unreadable', 'a credential file must hold exactly one token line');
  return text;
}

/**
 * The two owner configurations this run writes outside both workspaces. Both
 * profiles use 32 KiB messages and allow two exchanges: the advice exchange and
 * the cancellation exchange. B's worker is the plan's CLI with the plan's
 * worker model and token file, and carries this run's qualification fixture.
 * A version-3 scope (`values.auth`) gives the worker the product's
 * existing-sign-in branch instead: empty arguments, only the selected
 * environment names inherited and nothing fixed, the worker's approved base
 * directory and expected account, no token file, and the latch-only
 * qualification version 2.
 * @param {{values: any, layout: Layout, runId: string, fixtureSha256: string, pins: {a: string, b: string}}} input
 */
export function a2aConfigs({ values, layout, runId, fixtureSha256, pins }) {
  const sharing = { allowed: 'Lifecycle record numbers', excluded: 'Everything else', purpose: 'Number advice' };
  const ask = {
    role: 'ask',
    label: 'A',
    workspace: layout.a.workspace,
    peer: { label: 'B', address: '127.0.0.1', port: values.port, certSha256: pins.b },
    tls: { certFile: values.tls.a.certFile, keyFile: values.tls.a.keyFile },
    sharing,
    contentBytes: 32_768,
    askTimeoutMs: CONVERSATION_LIMITS.operationMs,
    repeatUse: 2,
    expiresAt: values.expiresAt,
    collaboration: { projectId: values.projectId },
  };
  const serve = {
    role: 'serve',
    label: 'B',
    workspace: layout.b.workspace,
    peer: { label: 'A', address: '127.0.0.1', certSha256: pins.a },
    tls: { certFile: values.tls.b.certFile, keyFile: values.tls.b.keyFile },
    sharing,
    contentBytes: 32_768,
    repeatUse: 2,
    expiresAt: values.expiresAt,
    listen: { address: '127.0.0.1', port: values.port },
    evidenceRoots: [layout.b.workspace],
    collaboration: {
      projectId: values.projectId,
      worker: values.auth ? {
        model: values.models.worker,
        runtime: {
          path: values.cli,
          args: [],
          env: { inherit: [...values.environment.names], set: {} },
          auth: { kind: 'existing-sign-in', baseDirectory: values.auth.worker.baseDirectory, expectedAccount: { ...values.auth.worker.expectedAccount } },
        },
        roots: [layout.b.workspace],
        qualification: { version: 2, runId, fixtureRoot: layout.fixture, fixtureSha256 },
      } : {
        model: values.models.worker,
        runtime: {
          path: values.cli,
          args: [],
          env: { inherit: ['SystemRoot', 'windir', 'ComSpec', 'PATHEXT', 'PATH'], set: {} },
          tokenFile: values.credentials.worker,
        },
        roots: [layout.b.workspace],
        qualification: { version: 1, runId, fixtureRoot: layout.fixture, fixtureSha256 },
      },
    },
  };
  return {
    a: Buffer.from(`${JSON.stringify({ profiles: { a: ask } }, null, 2)}\n`),
    b: Buffer.from(`${JSON.stringify({ profiles: { b: serve } }, null, 2)}\n`),
  };
}

/**
 * The complete environment of one version-3 main runtime: exactly the
 * selected names with the values the consented scope bound (HOME already
 * USERPROFILE when it was absent), each other name Windows would supply
 * blank, and TEMP, TMP, and TMPDIR naming that side's own temp folder. The
 * real home and app data stay the owner's, so the runtime finds its own saved
 * sign-in; nothing else is inherited, so no credential or provider variable is.
 * @param {{names: string[], values: Record<string, string>}} environment The scope's bound selection. @param {string} temp
 */
export function normalEnvironment(environment, temp) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const name of environment.names) if (Object.hasOwn(environment.values, name)) env[name] = environment.values[name];
  for (const name of NORMAL_BLANK) env[name] = '';
  for (const name of NORMAL_TEMP) env[name] = temp;
  return env;
}

/**
 * The complete environment of one main runtime; nothing is inherited. Home,
 * per-user, and temp variables name that side's own folders; PATH holds only
 * the system folders and this Node, so its shell can run the publisher.
 * @param {{home: string, temp: string}} side @param {NodeJS.ProcessEnv} [source]
 */
export function runtimeEnvironment(side, source = process.env) {
  const system = source.SystemRoot || source.windir || 'C:\\Windows';
  const drive = path.parse(side.home).root.replace(/\\$/, '');
  /** @type {Record<string, string>} */
  const env = {
    SystemRoot: system,
    windir: system,
    ComSpec: path.join(system, 'System32', 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [path.join(system, 'System32'), system, path.join(system, 'System32', 'WindowsPowerShell', 'v1.0'), path.dirname(process.execPath)].join(';'),
    HOME: side.home,
    USERPROFILE: side.home,
    HOMEDRIVE: drive,
    HOMEPATH: side.home.slice(drive.length),
    APPDATA: path.join(side.home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(side.home, 'AppData', 'Local'),
    TEMP: side.temp,
    TMP: side.temp,
    TMPDIR: side.temp,
  };
  for (const name of ['NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS']) {
    const value = source[name];
    if (typeof value === 'string' && value && !value.includes('\0')) env[name] = value;
  }
  return env;
}

/** Every file below `root` as sorted [relative path, bytes, SHA-256] rows. @param {string} root */
function treeRows(root) {
  /** @type {Array<[string, number, string]>} */
  const rows = [];
  /** @param {string} directory */
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) stop('fixture_render_mismatch', 'the rendered workspace holds a link');
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(full);
        rows.push([path.relative(root, full).split(path.sep).join('/'), bytes.length, sha256(bytes)]);
      }
    }
  };
  visit(root);
  return rows.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
}

/**
 * Prepare every fresh root: rendered workspaces, synthetic records, Canvas
 * preferences that turn the session-start update check off, owner
 * configurations, the qualification fixture, and the canary control folders.
 * Every file is created exclusively; an existing one refuses. A version-3
 * scope prepares only the workspaces, their temp folders, the proof folder,
 * the latch-only manifest, and the owner configurations, which the product's
 * own parser must accept as the scope bound them (`productAccepts`): its
 * runtimes' home and configuration are real, so nothing is written there and
 * no canary or control root exists.
 * @param {{scope: any, layout: Layout, runId: string, pins: {a: string, b: string}}} input
 */
export function prepareFixtures({ scope, layout, runId, pins }) {
  const { values } = scope;
  const normal = scope.version === 3;
  try {
    if (normal) {
      for (const folder of [layout.a.temp, layout.b.temp, layout.proof]) fs.mkdirSync(folder, { recursive: true });
    } else {
      for (const side of [layout.a, layout.b, layout.control]) {
        for (const folder of [side.home, side.config, side.temp, path.join(side.home, 'AppData', 'Roaming'), path.join(side.home, 'AppData', 'Local')]) {
          fs.mkdirSync(folder, { recursive: true });
        }
      }
      fs.mkdirSync(layout.proof, { recursive: true });
      fs.mkdirSync(layout.control.workspace, { recursive: true });
    }
  } catch {
    return stop('fixture_unavailable', 'the fixture folders cannot be created');
  }
  for (const side of [layout.a, layout.b]) {
    try {
      buildRelease({ repoRoot: scope.repoRoot, outDir: side.workspace });
    } catch {
      return stop('fixture_unavailable', 'the core bundle cannot be rendered into a fixture workspace');
    }
    const rendered = renderedCoreRows(side.workspace);
    if (rendered.sha256 !== scope.core.sha256 || rendered.files !== scope.core.files) {
      return stop('fixture_render_mismatch', 'a rendered workspace differs from the core bundle the scope bound');
    }
    // A normal runtime reads the owner's real Canvas preferences; this run writes none there.
    if (normal) continue;
    const preference = Buffer.from(`${JSON.stringify({ followAppTheme: false, checkForUpdatesOnSessionStart: false })}\n`);
    writeNew(path.join(side.config, 'extensions', 'dude', 'artifacts', 'canvas-preferences.json'), preference);
    writeNew(path.join(side.home, '.copilot', 'extensions', 'dude', 'artifacts', 'canvas-preferences.json'), preference);
  }
  for (const [side, seeds] of /** @type {Array<[any, Array<{number: number, slug: string}>]>} */ ([[layout.a, SEEDS.a], [layout.b, SEEDS.b]])) {
    for (const seed of seeds) writeNew(path.join(side.workspace, '.dude', 'ideas', `${seed.number}-${seed.slug}.md`), seedLedger(seed.slug));
  }
  const manifest = fixtureManifest(runId, normal ? 2 : 1);
  writeNew(path.join(layout.fixture, 'manifest.json'), manifest.bytes);
  for (const source of manifest.sources) writeNew(path.join(layout.fixture, ...source.path.split('/')), source.bytes);
  if (!normal) {
    const folders = { work: layout.control.workspace, config: layout.control.config, home: layout.control.home };
    for (const canary of CANARIES) {
      if (canary.content === null) continue;
      writeNew(path.join(folders[/** @type {'work' | 'config' | 'home'} */ (canary.location)], ...canary.path.split('/')), canary.content);
    }
  }
  const configs = a2aConfigs({ values, layout, runId, fixtureSha256: manifest.sha256, pins });
  if (normal) productAccepts(configs, { values, layout, runId, fixtureSha256: manifest.sha256 });
  writeNew(layout.a.a2aConfig, configs.a);
  writeNew(layout.b.a2aConfig, configs.b);
  return { manifest, configDigests: { a: sha256(configs.a), b: sha256(configs.b) } };
}

/**
 * The product's own configuration parser must accept both generated version-3
 * configurations, and parse B's worker as exactly the existing-sign-in branch
 * the scope bound: the plan's runtime with no arguments, only the selected
 * environment names and nothing fixed, the worker's base directory and
 * expected account, no token file, and this run's latch-only qualification.
 * A's profile has no worker. Anything else refuses before a file is written.
 * @param {{a: Buffer, b: Buffer}} configs
 * @param {{values: any, layout: Layout, runId: string, fixtureSha256: string}} expected
 */
function productAccepts(configs, { values, layout, runId, fixtureSha256 }) {
  /** @type {{a: any, b: any}} */
  let parsed;
  try {
    parsed = { a: parseA2aConfig(JSON.parse(configs.a.toString('utf8'))), b: parseA2aConfig(JSON.parse(configs.b.toString('utf8'))) };
  } catch {
    return stop('fixture_unavailable', 'the product\'s configuration parser refused a generated owner configuration');
  }
  const worker = parsed.b.profiles.get('b')?.collaboration?.worker;
  const matches = parsed.a.profiles.get('a')?.collaboration?.worker === null && isRecord(worker) && worker.tokenFile === undefined
    && worker.path === values.cli && Array.isArray(worker.args) && worker.args.length === 0 && worker.model === values.models.worker
    && canonical(worker.env) === canonical({ inherit: values.environment.names, set: [] })
    && canonical(worker.auth) === canonical({ kind: 'existing-sign-in', ...values.auth.worker })
    && canonical(worker.qualification) === canonical({ version: 2, runId, fixtureRoot: layout.fixture, fixtureSha256 });
  if (!matches) return stop('fixture_unavailable', 'the product parsed a generated owner configuration other than the one the scope bound');
  return undefined;
}

/** The rendered workspace's core rows, excluding nothing it should not hold. @param {string} root */
function renderedCoreRows(root) {
  const rows = treeRows(root);
  return { files: rows.length, bytes: rows.reduce((sum, row) => sum + row[1], 0), sha256: sha256(JSON.stringify(rows)) };
}

// ---------------------------------------------------------------------------
// Journals and release latches: read-only views of the actual records.
// ---------------------------------------------------------------------------

/** The journal of one operation in one workspace. @param {string} workspace @param {string} operationId */
export function journalPathOf(workspace, operationId) {
  return path.join(workspace, ...TRANSCRIPT_DIR.split('/'), `${operationId}.jsonl`);
}

/**
 * Every complete record of one journal, read once within the journal bound.
 * A partial final line is left for a later read; an unreadable complete line
 * refuses, because it would hide a record.
 * @param {string} file @returns {any[]}
 */
export function readJournal(file) {
  /** @type {Buffer} */
  let bytes;
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > TRANSCRIPT_LIMITS.journalBytes) return stop('journal_mismatch', 'a journal is not a bounded regular file');
    bytes = fs.readFileSync(file);
  } catch (error) {
    if (error instanceof NativeStop) throw error;
    return [];
  }
  const text = bytes.toString('utf8');
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  return complete.split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return stop('journal_mismatch', 'a journal holds an unreadable record');
    }
  });
}

/** @param {any[]} records @param {string} kind */
function recordsOf(records, kind) {
  return records.filter((record) => record.kind === kind);
}

/** The observation digest a release binds: SHA-256 of the record's data exactly as the worker serialized it. @param {unknown} data */
export function observationDigest(data) {
  return sha256(JSON.stringify(data));
}

/**
 * The exact startup release for one worker's recorded preflight.
 * @param {{runId: string, operationId: string, preflight: any}} input
 */
export function startupReleaseOf({ runId, operationId, preflight }) {
  return {
    version: 1, release: 'startup', runId, workerId: preflight.workerId, operationId, permitId: preflight.binding.permitId,
    sessionId: preflight.sessionId, observationSha256: observationDigest(preflight),
  };
}

/**
 * The exact evidence release for one worker's recorded held call.
 * @param {{runId: string, operationId: string, preflight: any, pending: any}} input
 */
export function evidenceReleaseOf({ runId, operationId, preflight, pending }) {
  return {
    version: 1, release: 'evidence', runId, workerId: preflight.workerId, operationId, permitId: preflight.binding.permitId,
    sessionId: preflight.sessionId, admissionId: pending.admissionId, toolCallId: pending.toolCallId, observationSha256: observationDigest(pending),
  };
}

/**
 * Publish one release file atomically under its exact name: written beside it
 * under another name, then renamed, so the worker never reads a partial file.
 * @param {string} fixtureRoot @param {'startup' | 'evidence'} kind @param {Record<string, unknown>} release
 */
export function writeRelease(fixtureRoot, kind, release) {
  const bytes = Buffer.from(JSON.stringify(release));
  if (bytes.length > WORKER_BOUNDS.releaseBytes) return stop('qualification_release_mismatch', 'a release would exceed its bound');
  const target = path.join(fixtureRoot, `${release.workerId}.${kind}-release.json`);
  const staging = path.join(fixtureRoot, `.staging-${randomUUID()}`);
  fs.writeFileSync(staging, bytes, { flag: 'wx' });
  fs.renameSync(staging, target);
  return { path: target, sha256: sha256(bytes) };
}

/** A device or inode number as the worker records it: the exact decimal digits of a bigint, never a rounded number. */
const DECIMAL = /^(?:0|[1-9][0-9]{0,39})$/;
/** The worker storage areas a session workspace may lie strictly inside, as the worker requires. */
const WORKSPACE_AREAS = Object.freeze(['config', 'home']);
/** The files a session workspace holds for its documented per-session purposes. */
const WORKSPACE_FILES = Object.freeze(['events.jsonl', 'workspace.yaml', 'plan.md']);
/** The folders a session workspace holds for its documented per-session purposes, with what is inside them. */
const WORKSPACE_FOLDERS = Object.freeze(['checkpoints', 'files']);
/** What a documented per-session file or folder may have done to it: never a delete or rename. */
const DOCUMENTED_OPS = Object.freeze(['create', 'open', 'read', 'write']);
/** What the session workspace and each folder above it inside its area may have done to them: directory operations only. */
const DIRECTORY_OPS = Object.freeze(['create', 'open']);

/** A `/`-separated relative path as one platform compares it: without case on Windows. @param {string} value */
function foldPath(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

/**
 * The session workspace one worker's recorded `sessionStorage` names, as a
 * `/`-separated path relative to the worker's own folder; null for its
 * observed absence; undefined for anything else: a malformed or extra field,
 * another session, a device or inode that is not exact decimal text, or a
 * workspace path that is not a normalized absolute path of at most 1,024
 * UTF-8 bytes strictly inside that folder's configuration or home storage.
 * Absence names no path, and nothing here is invented or defaulted.
 * @param {unknown} storage @param {unknown} sessionId @param {string} root The worker's own folder. @returns {string | null | undefined}
 */
export function recordedWorkspace(storage, sessionId, root) {
  if (!isRecord(storage) || typeof sessionId !== 'string' || !sessionId || storage.metadataSessionId !== sessionId) return undefined;
  const keys = canonical(Object.keys(storage).sort());
  if (storage.kind === 'none') return keys === canonical(['kind', 'metadataSessionId']) ? null : undefined;
  if (storage.kind !== 'workspace' || keys !== canonical(['directory', 'kind', 'metadataSessionId', 'workspacePath'])) return undefined;
  const { directory, workspacePath } = storage;
  if (!isRecord(directory) || canonical(Object.keys(directory).sort()) !== canonical(['dev', 'ino'])
    || typeof directory.dev !== 'string' || !DECIMAL.test(directory.dev) || typeof directory.ino !== 'string' || !DECIMAL.test(directory.ino)) {
    return undefined;
  }
  if (typeof workspacePath !== 'string' || /[\u0000-\u001f\u007f]/u.test(workspacePath) || Buffer.byteLength(workspacePath, 'utf8') > 1_024
    || !path.isAbsolute(workspacePath) || path.resolve(workspacePath) !== workspacePath) {
    return undefined;
  }
  const area = WORKSPACE_AREAS.find((name) => isWithin(path.join(root, name), workspacePath) && !samePath(path.join(root, name), workspacePath));
  return area ? path.relative(root, workspacePath).split(path.sep).join('/') : undefined;
}

/**
 * The served worker's recorded session storage as it is now, checked when its
 * startup release is decided: a recorded workspace must still be a directory,
 * reached through no link from the worker's own folder down, with exactly the
 * device and inode the worker recorded. Each returned string names one
 * problem; observed absence has none and allows no session persistence.
 * @param {any} observation A `worker_preflight` record that `checkPreflight` accepted.
 * @returns {{workspace: string | null, problems: string[]}}
 */
export function currentWorkspace(observation) {
  const root = String(observation?.storage ?? '');
  const workspace = recordedWorkspace(observation?.sessionStorage, observation?.sessionId, root);
  if (workspace === undefined) return { workspace: null, problems: ['record'] };
  if (workspace === null) return { workspace: null, problems: [] };
  const { workspacePath, directory } = observation.sessionStorage;
  /** @type {string[]} */
  const problems = [];
  try {
    const stat = fs.lstatSync(workspacePath, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) problems.push('not_directory');
    else if (stat.dev.toString() !== directory.dev || stat.ino.toString() !== directory.ino) problems.push('identity_changed');
    else if (!samePath(fs.realpathSync.native(workspacePath), path.join(fs.realpathSync.native(root), path.relative(root, workspacePath)))) problems.push('linked');
  } catch {
    problems.push('unavailable');
  }
  return { workspace, problems };
}

/**
 * Whether one access of a worker process in its own configuration or home
 * storage serves a documented per-session purpose of the session workspace
 * that worker recorded (`workspace`, relative to its folder). Reads and opens
 * are judged exactly as writes are. Only these are: creating or opening that
 * folder or one of the folders above it inside the area, which the release
 * already found to be real directories; and creating, opening, reading, or
 * writing `events.jsonl`, `workspace.yaml`, or `plan.md` directly in it, or
 * its `checkpoints` or `files` folder or anything in them. The path must lie
 * in the row's own area. Nothing else is: another session, a sibling file or
 * folder, the runtime's own settings or any other configuration or home file,
 * an undocumented sidecar or staging name, a delete or rename, or any access
 * at all without a recorded workspace. No allowance is learned from what a
 * runtime happens to touch.
 * @param {{area?: unknown, op?: unknown, path?: unknown}} row @param {string | null | undefined} workspace
 */
export function documentedSessionAccess(row, workspace) {
  const area = String(row.area);
  if (typeof workspace !== 'string' || typeof row.path !== 'string' || !WORKSPACE_AREAS.includes(area)) return false;
  const target = foldPath(row.path);
  if (target !== area && !target.startsWith(`${area}/`)) return false;
  if (target.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  const own = foldPath(workspace);
  const segments = own.split('/');
  if (segments.some((_, index) => segments.slice(0, index + 1).join('/') === target)) return DIRECTORY_OPS.includes(String(row.op));
  if (!target.startsWith(`${own}/`) || !DOCUMENTED_OPS.includes(String(row.op))) return false;
  const inner = target.slice(own.length + 1).split('/');
  return (inner.length === 1 && WORKSPACE_FILES.includes(inner[0])) || WORKSPACE_FOLDERS.includes(inner[0]);
}

/**
 * Whether one access of a worker process below its own folder, outside its
 * working folder, has a purpose this run can name: anything in its approved
 * temporary area, whose names the observer keeps none of and which grants no
 * persistence; a directory open of the folder itself, the structural parent
 * of every approved area; or a documented per-session access in its
 * configuration or home storage (`documentedSessionAccess`). Any other area,
 * including a path the observer could not read as one plain spelling
 * (`invalid`), has none.
 * @param {{area?: unknown, op?: unknown, path?: unknown}} row @param {string | null | undefined} workspace
 */
function workerStorageAllowed(row, workspace) {
  if (row.area === 'temp') return (row.path ?? null) === null;
  if (row.area === 'root') return row.op === 'open' && row.path === '';
  return documentedSessionAccess(row, workspace);
}

/**
 * Check one served worker's `worker_preflight` observation against what this
 * run started and observed. Each returned string names one mismatch; an empty
 * list means the observation describes this worker. Hashes and records are
 * compared, never trusted as authority. Its recorded session storage must be
 * one exact closed form for this session and folder (`recordedWorkspace`);
 * whether a recorded workspace is still that directory is checked apart.
 * @param {unknown} observation
 * @param {{workerId: string, binding: Record<string, string>, runId: string, fixtureSha256: string, canaries: number, canaryBytes: number,
 *   sdk: {index: {path: string, bytes: number, sha256: string}, extension: {path: string, bytes: number, sha256: string}},
 *   extensionPid: number, runtime: {version: string, protocolVersion: number}, model: string, storageParent: string}} expected
 * @returns {string[]}
 */
export function checkPreflight(observation, expected) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(observation)) return ['observation'];
  if (Buffer.byteLength(JSON.stringify(observation), 'utf8') > WORKER_BOUNDS.startupBytes) problems.push('size');
  if (observation.version !== 1) problems.push('version');
  if (observation.workerId !== expected.workerId) problems.push('workerId');
  const binding = isRecord(observation.binding) ? observation.binding : {};
  for (const [key, value] of Object.entries(expected.binding)) if (binding[key] !== value) problems.push(`binding.${key}`);
  if (typeof binding.permitId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(binding.permitId)) problems.push('binding.permitId');
  if (Object.keys(binding).length !== Object.keys(expected.binding).length + 1) problems.push('binding.keys');
  if (typeof observation.sessionId !== 'string' || !observation.sessionId || observation.sessionId.length > WORKER_BOUNDS.identifierLength) {
    problems.push('sessionId');
  }
  if (canonical(observation.qualification) !== canonical({
    version: 1, runId: expected.runId, fixtureSha256: expected.fixtureSha256, canaries: expected.canaries, canaryBytes: expected.canaryBytes,
  })) problems.push('qualification');
  const loaders = isRecord(observation.loaders) ? observation.loaders : {};
  for (const [name, artifact] of /** @type {Array<['joined' | 'worker', {path: string, bytes: number, sha256: string}]>} */ ([
    ['joined', expected.sdk.extension], ['worker', expected.sdk.index]])) {
    const loader = isRecord(loaders[name]) ? loaders[name] : {};
    let resolvedPath = '';
    try {
      resolvedPath = typeof loader.resolvedUrl === 'string' ? fileURLToPath(loader.resolvedUrl) : '';
    } catch {
      resolvedPath = '';
    }
    if (loader.source !== 'fixed_loader' || typeof loader.path !== 'string' || !samePath(loader.path, artifact.path)
      || !resolvedPath || !samePath(resolvedPath, artifact.path) || loader.bytes !== artifact.bytes || loader.sha256 !== artifact.sha256) {
      problems.push(`loaders.${name}`);
    }
  }
  if (observation.extensionPid !== expected.extensionPid) problems.push('extensionPid');
  if (canonical(observation.runtime) !== canonical(expected.runtime)) problems.push('runtime');
  if (observation.model !== expected.model) problems.push('model');
  const storage = typeof observation.storage === 'string' ? observation.storage : '';
  if (!storage || !samePath(path.dirname(storage), expected.storageParent) || !path.basename(storage).startsWith('dude-a2a-w-')) problems.push('storage');
  if (!storage || recordedWorkspace(observation.sessionStorage, observation.sessionId, storage) === undefined) problems.push('sessionStorage');
  const catalog = Array.isArray(observation.catalog) ? observation.catalog : [];
  if (catalog.length !== 2 || catalog[0]?.name !== WORKER_TOOLS.inventory || catalog[1]?.name !== WORKER_TOOLS.read
    || !catalog.every((entry) => isRecord(entry) && typeof entry.schemaSha256 === 'string' && SHA256.test(entry.schemaSha256))) {
    problems.push('catalog');
  }
  if (canonical(observation.ambient) !== canonical({
    instructionSources: 0, skills: 0, enabledSkills: 0, mcpServers: 0, extensions: 0, customAgents: 0, selectedAgent: false,
  })) problems.push('ambient');
  const probes = Array.isArray(observation.probes) ? observation.probes : [];
  if (probes.length !== PROBE_CAUSES.length || probes.some((probe, index) => !isRecord(probe) || probe.id !== PROBE_CAUSES[index][0]
    || probe.cause !== PROBE_CAUSES[index][1] || (PROBE_CAUSES[index][1].endsWith('_lookup') && probe.code !== -32602))) {
    problems.push('probes');
  }
  const started = typeof observation.startedAt === 'string' ? Date.parse(observation.startedAt) : Number.NaN;
  const completed = typeof observation.completedAt === 'string' ? Date.parse(observation.completedAt) : Number.NaN;
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started || completed - started > NATIVE_LIMITS.startupMs) {
    problems.push('startup_time');
  }
  return problems;
}

/** One line of text without control characters. */
const LINE_CONTROL = /[\u0000-\u001f\u007f]/u;

/** A nonempty single line. @param {unknown} value @returns {value is string} */
function singleLine(value) {
  return typeof value === 'string' && value.length > 0 && !LINE_CONTROL.test(value);
}

/** An absolute single-line path of at most `STORAGE_PATH_BYTES` UTF-8 bytes. @param {unknown} value @returns {value is string} */
function storagePath(value) {
  return singleLine(value) && path.isAbsolute(value) && Buffer.byteLength(value, 'utf8') <= STORAGE_PATH_BYTES;
}

/** The origin of a bare HTTPS origin URL, or null for anything else. @param {string} value */
function httpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
}

/**
 * One account status, as a main's own client or its actual session answered
 * or as a normal worker recorded it, against the expected account, by the
 * product's existing-sign-in rule: an answer that is not a status, or lacks a
 * value it needs, is `auth_unavailable`; an unauthenticated one is
 * `auth_required`; an authenticated one must name exactly the expected
 * canonical HTTPS host, the expected login (ignoring case), and a saved
 * sign-in (`user` or `gh-cli`), or it is `auth_mismatch`. Absence never
 * passes, and an expected value never stands in for an observed one. Only the
 * matched host and login are kept, never a status message or plan.
 * @param {unknown} status @param {{host: string, login: string}} expected
 * @returns {{ok: true, account: {isAuthenticated: true, authType: string, host: string, login: string}}
 *   | {ok: false, reason: 'auth_unavailable' | 'auth_required' | 'auth_mismatch'}}
 */
export function readAccount(status, expected) {
  if (!isRecord(status) || typeof status.isAuthenticated !== 'boolean') return { ok: false, reason: 'auth_unavailable' };
  if (!status.isAuthenticated) return { ok: false, reason: 'auth_required' };
  const { authType, host, login } = status;
  if (!singleLine(authType) || authType.length > WORKER_BOUNDS.identifierLength || !singleLine(host) || Buffer.byteLength(host, 'utf8') > ACCOUNT_BYTES
    || !singleLine(login) || !login.trim() || Buffer.byteLength(login, 'utf8') > ACCOUNT_BYTES) {
    return { ok: false, reason: 'auth_unavailable' };
  }
  if (!URL.canParse(host)) return { ok: false, reason: 'auth_unavailable' };
  const origin = httpsOrigin(host);
  if (!SIGN_IN_AUTH_TYPES.includes(authType) || origin !== expected.host || login.toLowerCase() !== expected.login.toLowerCase()) {
    return { ok: false, reason: 'auth_mismatch' };
  }
  return { ok: true, account: { isAuthenticated: true, authType, host: origin, login } };
}

/**
 * Check one normal served worker's `worker_preflight` version 2 against what
 * this run started and expects. Its fields are exactly those the product's
 * existing-sign-in worker records, so a strict version 1 record, or one
 * carrying ambient counts or probes as if a strict check had passed, never
 * passes here. Each account it recorded, for its own runtime and its actual
 * session, must be exactly an authenticated `user` or `gh-cli` account at the
 * expected canonical host with the expected login (letter case ignored). Its
 * normal session storage must name this session, the owned `work` folder of
 * its own storage directory as its working directory, and a bounded absolute
 * workspace path or none; it is observed normal storage, not fresh owned
 * storage. Its loaders must be the fixed production loaders on this plan's SDK
 * files: an injected test loader is never production provenance. Each
 * returned string names one mismatch; an empty list means the observation
 * describes this worker. Records are compared, never trusted as authority.
 * @param {unknown} observation
 * @param {{workerId: string, binding: Record<string, string>, runId: string, fixtureSha256: string,
 *   sdk: {index: {path: string, bytes: number, sha256: string}, extension: {path: string, bytes: number, sha256: string}},
 *   extensionPid: number, runtime: {version: string, protocolVersion: number}, model: string, storageParent: string,
 *   account: {host: string, login: string}}} expected
 * @returns {string[]}
 */
export function checkNormalPreflight(observation, expected) {
  if (!isRecord(observation)) return ['observation'];
  /** @type {string[]} */
  const problems = [];
  if (Buffer.byteLength(JSON.stringify(observation), 'utf8') > WORKER_BOUNDS.startupBytes) problems.push('size');
  if (canonical(Object.keys(observation).sort()) !== canonical([...NORMAL_PREFLIGHT_KEYS].sort())) problems.push('keys');
  if (observation.version !== 2) problems.push('version');
  if (observation.workerId !== expected.workerId) problems.push('workerId');
  const binding = isRecord(observation.binding) ? observation.binding : {};
  for (const [key, value] of Object.entries(expected.binding)) if (binding[key] !== value) problems.push(`binding.${key}`);
  if (typeof binding.permitId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(binding.permitId)) problems.push('binding.permitId');
  if (Object.keys(binding).length !== Object.keys(expected.binding).length + 1) problems.push('binding.keys');
  const sessionId = typeof observation.sessionId === 'string' && singleLine(observation.sessionId)
    && observation.sessionId.length <= WORKER_BOUNDS.identifierLength ? observation.sessionId : null;
  if (!sessionId) problems.push('sessionId');
  if (canonical(observation.qualification) !== canonical({ version: 2, runId: expected.runId, fixtureSha256: expected.fixtureSha256 })) {
    problems.push('qualification');
  }
  const loaders = isRecord(observation.loaders) ? observation.loaders : {};
  for (const [name, artifact] of /** @type {Array<['joined' | 'worker', {path: string, bytes: number, sha256: string}]>} */ ([
    ['joined', expected.sdk.extension], ['worker', expected.sdk.index]])) {
    const loader = isRecord(loaders[name]) ? loaders[name] : {};
    let resolvedPath = '';
    try {
      resolvedPath = typeof loader.resolvedUrl === 'string' ? fileURLToPath(loader.resolvedUrl) : '';
    } catch {
      resolvedPath = '';
    }
    if (loader.source !== 'fixed_loader' || typeof loader.path !== 'string' || !samePath(loader.path, artifact.path)
      || !resolvedPath || !samePath(resolvedPath, artifact.path) || loader.bytes !== artifact.bytes || loader.sha256 !== artifact.sha256) {
      problems.push(`loaders.${name}`);
    }
  }
  if (observation.extensionPid !== expected.extensionPid) problems.push('extensionPid');
  if (canonical(observation.runtime) !== canonical(expected.runtime)) problems.push('runtime');
  if (observation.model !== expected.model) problems.push('model');
  const storage = typeof observation.storage === 'string' ? observation.storage : '';
  if (!storage || !samePath(path.dirname(storage), expected.storageParent) || !path.basename(storage).startsWith('dude-a2a-w-')) problems.push('storage');
  const auth = isRecord(observation.auth) ? observation.auth : null;
  if (!auth || canonical(Object.keys(auth).sort()) !== canonical(['runtime', 'session'])) {
    problems.push('auth');
  } else {
    for (const name of /** @type {const} */ (['runtime', 'session'])) {
      const entry = auth[name];
      const read = readAccount(entry, expected.account);
      if (!isRecord(entry) || canonical(Object.keys(entry).sort()) !== canonical(['authType', 'host', 'isAuthenticated', 'login']) || !read.ok
        || entry.host !== expected.account.host) {
        problems.push(`auth.${name}`);
      }
    }
  }
  const stored = isRecord(observation.sessionStorage) ? observation.sessionStorage : null;
  if (!stored || canonical(Object.keys(stored).sort()) !== canonical(['kind', 'metadataSessionId', 'workingDirectory', 'workspacePath'])
    || stored.kind !== 'normal' || !sessionId || stored.metadataSessionId !== sessionId || !storagePath(stored.workingDirectory) || !storage
    || !samePath(stored.workingDirectory, path.join(storage, 'work')) || (stored.workspacePath !== null && !storagePath(stored.workspacePath))) {
    problems.push('sessionStorage');
  }
  const catalog = Array.isArray(observation.catalog) ? observation.catalog : [];
  if (catalog.length !== 2 || catalog[0]?.name !== WORKER_TOOLS.inventory || catalog[1]?.name !== WORKER_TOOLS.read
    || !catalog.every((entry) => isRecord(entry) && typeof entry.schemaSha256 === 'string' && SHA256.test(entry.schemaSha256))) {
    problems.push('catalog');
  }
  const started = typeof observation.startedAt === 'string' ? Date.parse(observation.startedAt) : Number.NaN;
  const completed = typeof observation.completedAt === 'string' ? Date.parse(observation.completedAt) : Number.NaN;
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started || completed - started > NATIVE_LIMITS.startupMs) {
    problems.push('startup_time');
  }
  return problems;
}

/**
 * One normal served worker's bounded cleanup as B's journal recorded it: the
 * product observed it within its bound, the worker's runtime cessation stays
 * unconfirmed (as it always is once a runtime may have started), its stop
 * reported no errors and needed no force-stop, and its own storage directory
 * was kept. A stop without errors is not process-tree cessation. Each
 * returned string names one problem.
 * @param {unknown} cleanup The `cleanup` record's data. @param {{workerId: string, storage: string}} expected
 * @returns {string[]}
 */
export function checkWorkerCleanup(cleanup, expected) {
  if (!isRecord(cleanup)) return ['record'];
  if (cleanup.observed === false) return ['unobserved'];
  /** @type {string[]} */
  const problems = [];
  if (cleanup.workerId !== expected.workerId) problems.push('workerId');
  if (cleanup.runtime !== 'unconfirmed') problems.push('runtime');
  if (cleanup.stop !== 'clean' || cleanup.stopErrors !== 0) problems.push('stop');
  if (cleanup.forceStop !== 'not_needed') problems.push('forceStop');
  if (cleanup.storage !== 'retained' || typeof cleanup.retainedPath !== 'string' || !samePath(cleanup.retainedPath, expected.storage)) {
    problems.push('storage');
  }
  return problems;
}

/**
 * Check one recorded held call against its worker.
 * @param {unknown} pending @param {{workerId: string, sessionId: string, admissionId: string}} expected @returns {string[]}
 */
export function checkPending(pending, expected) {
  if (!isRecord(pending) || canonical(Object.keys(pending)) !== canonical(['workerId', 'sessionId', 'admissionId', 'toolCallId', 'tool'])) {
    return ['shape'];
  }
  /** @type {string[]} */
  const problems = [];
  for (const key of /** @type {const} */ (['workerId', 'sessionId', 'admissionId'])) if (pending[key] !== expected[key]) problems.push(key);
  if (pending.tool !== WORKER_TOOLS.inventory && pending.tool !== WORKER_TOOLS.read) problems.push('tool');
  if (typeof pending.toolCallId !== 'string' || !pending.toolCallId || pending.toolCallId.length > WORKER_BOUNDS.identifierLength) {
    problems.push('toolCallId');
  }
  return problems;
}

/** A's answered journal: exactly the eight records, in order, for this operation. @param {any[]} records @param {string} operationId */
export function checkAnsweredJournal(records, operationId) {
  /** @type {string[]} */
  const problems = [];
  if (canonical(records.map((record) => record.kind)) !== canonical(ANSWERED)) problems.push('kinds');
  if (records.some((record, index) => record.operationId !== operationId || record.sequence !== index + 1)) problems.push('sequence');
  const terminal = recordsOf(records, 'terminal')[0];
  if (terminal?.data?.outcome !== 'answer') problems.push('terminal');
  if (recordsOf(records, 'closed')[0]?.data?.gaps !== 0) problems.push('gaps');
  return problems;
}

/**
 * B's served journal for the advice exchange: every readiness record, the held
 * call, the model's own evidence reads, a reasoned answer citing the 101
 * record, the reply written, and honest cleanup, with no gap.
 * @param {any[]} records @param {{operationId: string, workerId: string, record101: string}} expected
 */
export function checkServedJournal(records, expected) {
  /** @type {string[]} */
  const problems = [];
  const kinds = records.map((record) => record.kind);
  const head = ['opened', 'accepted', 'request_admitted', 'worker_started', 'worker_preflight', 'worker_ready', 'worker_request_admitted',
    'worker_evidence_pending'];
  const tail = ['worker_finished', 'reply_prepared', 'reply_write_started', 'reply_written', 'terminal', 'cleanup', 'closed'];
  const middle = kinds.slice(head.length, kinds.length - tail.length);
  if (canonical(kinds.slice(0, head.length)) !== canonical(head) || canonical(kinds.slice(-tail.length)) !== canonical(tail)
    || middle.length === 0 || middle.some((kind) => kind !== 'evidence_returned')) {
    problems.push('kinds');
  }
  if (records.some((record) => record.operationId !== expected.operationId)) problems.push('operationId');
  const finished = recordsOf(records, 'worker_finished')[0]?.data;
  const admitted = recordsOf(records, 'worker_request_admitted')[0]?.data;
  if (!isRecord(finished) || finished.workerId !== expected.workerId || finished.outcome !== 'answered'
    || finished.admissionId !== admitted?.admissionId || canonical(finished.permissionDenials) !== canonical({})) {
    problems.push('worker_finished');
  }
  const observations = Array.isArray(finished?.observations) ? finished.observations : [];
  if (!observations.some((entry) => entry.tool === 'inventory' && entry.outcome === 'returned')
    || !observations.some((entry) => entry.tool === 'read' && entry.outcome === 'returned' && entry.reference === expected.record101)) {
    problems.push('evidence_reads');
  }
  /** @type {any} */
  let answer = null;
  try {
    const text = String(finished?.answer?.text ?? '').trim().replace(/^```(?:json)?\r?\n([\s\S]*)\r?\n```$/, '$1');
    answer = JSON.parse(text);
  } catch {
    answer = null;
  }
  if (!isRecord(answer) || answer.observedMaximum !== 101 || typeof answer.explanation !== 'string' || !answer.explanation.trim()
    || !Array.isArray(answer.citations) || !answer.citations.some((citation) => isRecord(citation) && citation.reference === expected.record101)) {
    problems.push('answer');
  }
  if (recordsOf(records, 'terminal')[0]?.data?.outcome !== 'sent') problems.push('terminal');
  if (recordsOf(records, 'reply_written')[0]?.data?.written !== 'sent') problems.push('reply_written');
  if (recordsOf(records, 'closed')[0]?.data?.gaps !== 0) problems.push('gaps');
  return problems;
}

/**
 * The bounds a journal shows, in milliseconds from its own record times.
 * @param {any[]} records
 */
export function journalTimings(records) {
  /** @param {string} kind */
  const at = (kind) => {
    const record = recordsOf(records, kind)[0];
    return record ? Date.parse(record.time) : Number.NaN;
  };
  return {
    operationMs: at('terminal') - at('accepted'),
    startupMs: at('worker_preflight') - at('worker_started'),
    workerMs: (Number.isFinite(at('worker_finished')) ? at('worker_finished') : at('terminal')) - at('worker_started'),
  };
}

/**
 * The publisher's receipt for A's advised capture: local 100, peer 101,
 * choice 102 raised, the exact path, and the conversation it names.
 * @param {unknown} receipt @param {{slug: string, capture: any, ideaPath: string, ledgerSha256: string}} expected
 */
export function checkReceipt(receipt, expected) {
  /** @type {string[]} */
  const problems = [];
  if (!isRecord(receipt) || receipt.version !== 1 || receipt.kind !== 'number_advice_receipt') return ['shape'];
  if (receipt.ideaPath !== expected.ideaPath) problems.push('ideaPath');
  if (receipt.slug !== expected.slug) problems.push('slug');
  if (receipt.ledgerSha256 !== expected.ledgerSha256) problems.push('ledgerSha256');
  const conversation = isRecord(receipt.conversation) ? receipt.conversation : {};
  for (const key of ['projectId', 'operationId', 'conversationId', 'questionId', 'exchangeId', 'peerCertSha256']) {
    if (conversation[key] !== expected.capture[key]) problems.push(`conversation.${key}`);
  }
  if (canonical(conversation.reply) !== canonical(expected.capture.reply)) problems.push('conversation.reply');
  const selection = isRecord(receipt.selection) ? receipt.selection : {};
  if (selection.freshLocalMaximum !== 100) problems.push('selection.freshLocalMaximum');
  if (selection.peerObservedMaximum !== 101) problems.push('selection.peerObservedMaximum');
  if (selection.localOnlyNumber !== 101) problems.push('selection.localOnlyNumber');
  if (selection.chosenNumber !== 102) problems.push('selection.chosenNumber');
  if (selection.influence !== 'raised') problems.push('selection.influence');
  return problems;
}

/**
 * The `capture_publisher` judgment of A's publisher call: it completed
 * successfully, and its printed output ends with the captured idea's path
 * once the native shell tool's one status line for exit code 0 is set aside.
 * That tool ends a command's result with such a line: in run
 * 056b7f4c-eaa3-4cd5-bdfa-70d89edb1a72 the publisher's was its idea path,
 * then `<shellId: 2 completed with exit code 0>`. A failure's detail names
 * the condition that failed, and output ending otherwise is shown only by
 * its last 120 characters at most, JSON-quoted.
 * @param {any} publisher The publisher call's summarized start, when one was observed.
 * @param {any} output That call's summarized completion, when one was observed.
 * @param {string} ideaPath
 * @returns {{passed: boolean, detail: string}}
 */
export function publisherCheck(publisher, output, ideaPath) {
  if (!publisher) return { passed: false, detail: 'no publisher command requested for this instruction was observed' };
  if (!output?.success) return { passed: false, detail: 'the publisher call did not complete successfully' };
  const printed = String(output.content ?? '').replace(/\r?\n<shellId: \d+ completed with exit code 0>\s*$/, '').trim();
  if (printed.replace(/\\/g, '/').endsWith(ideaPath)) return { passed: true, detail: 'the actual publisher ran with --number-advice' };
  const end = printed.length > 120 ? `...${printed.slice(-120)}` : printed;
  return { passed: false, detail: `the publisher's printed output, its native status line set aside, did not end with ${ideaPath}`
    + (printed ? `; it ended with ${JSON.stringify(end)}` : '') };
}

// ---------------------------------------------------------------------------
// Main sessions: bounded event logs, proposals, progress, and the permission relay.
// ---------------------------------------------------------------------------

const INVENTORY_COMMAND = 'node .github/skills/dude-engine/feature.mjs ideas --root . --json';
const QUOTED_PATH = String.raw`("[^"]+"|'[^']+'|[^\s"']+)`;
const PUBLISHER_COMMAND = new RegExp(String.raw`^node \.github/skills/dude-feature-definition/publish-first-capture\.mjs --root \. --slug (\S+) --stage ${QUOTED_PATH} --number-advice ${QUOTED_PATH}$`);
/** The one fixed read-only command that hashes a staged ledger; the capture prompt names it exactly. */
const HASH_COMMAND = /^\(Get-FileHash -Algorithm SHA256 -LiteralPath ('[^']+')\)\.Hash\.ToLowerInvariant\(\)$/;
const ADVICE_ADDED = Object.freeze(['ledgerSha256', 'workspace', 'reason']);
/**
 * The runtime's built-in task tool and the two of its arguments the capture's
 * delegation is judged by: which agent it starts, and that it waits for that
 * agent (`mode` `sync`), as an installed-host acceptance drives it
 * (scripts/dude-canvas-ui/t012-installed-host.mjs). A's own initialized
 * catalog must declare both (`specLeadOf`); nothing else of the call is kept.
 */
const TASK = Object.freeze({ tool: 'task', agent: 'agent_type', mode: 'mode', sync: 'sync' });
/** The installed Spec Lead, by its path in the rendered core: the one agent A's capture may delegate staging to (`specLeadRequest`). */
const SPEC_LEAD = '.github/agents/dude-spec-lead.agent.md';

/** @param {unknown} value @param {number} limit */
function boundedText(value, limit) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= limit ? value : null;
}

/** Whether a documented string field is present: nonempty and at most `limit` UTF-8 bytes. @param {unknown} value @param {number} limit */
function presentText(value, limit) {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= limit;
}

/** Whether a documented optional string field is absent, or present as `presentText` requires. @param {unknown} value @param {number} limit */
function optionalText(value, limit) {
  return value === undefined || presentText(value, limit);
}

/**
 * A documented optional identifier as a session log keeps it: null when it is
 * absent, the value when `presentText` accepts it, and false when it is
 * present in any other form, so a malformed one is never read as absent.
 * @param {unknown} value @param {number} limit @returns {string | null | false}
 */
function marker(value, limit) {
  return value === undefined ? null : presentText(value, limit) ? /** @type {string} */ (value) : false;
}

/**
 * The after-view control's bounded raw validation of one delivered session
 * event, before anything is summarized: `malformed` when its envelope is not
 * the documented one (an object with a string type and an object `data`, a
 * nonempty event `id` of at most 128 bytes, :2019-2022, and an `agentId` and a
 * `parentToolCallId` each absent or a nonempty string); `undeclared` for a type
 * the SDK does not declare (`SDK_EVENT_TYPES`); `subagent` for an event a
 * sub-agent sent, by its documented `agentId` (absent for the root,
 * :2010-2013 and alike on every event) or the `parentToolCallId` the SDK
 * documents on a sub-agent's events (:5524, :6200, :7395, :7688, :8847);
 * `permitted` for a root event of a type some phase permits, in the form
 * permitted (`permittedForm`); and `refused` for every other. Main sessions
 * keep it too but never read it.
 * @param {unknown} event @returns {'malformed' | 'undeclared' | 'subagent' | 'permitted' | 'refused'}
 */
function controlForm(event) {
  if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data) || !presentText(event.id, 128)
    || !optionalText(event.agentId, 128) || !optionalText(event.data.parentToolCallId, 256)) return 'malformed';
  if (!DECLARED.has(event.type)) return 'undeclared';
  if (event.agentId !== undefined || event.data.parentToolCallId !== undefined) return 'subagent';
  return PERMITTED.has(event.type) && permittedForm(event.type, event.data) ? 'permitted' : 'refused';
}

/**
 * What the after-view control has established about its session, which every
 * event of it is judged against (`controlRefusals`); null is not yet
 * established, and judges nothing. `sessionId` is the session's own ID;
 * `modelFrom` and `cwdFrom` are the log positions at which the run asked for
 * its model and working-directory checks (`modelFrom` the moment its creation
 * returned), and `model` what the model check accepted; `sentAt` is the log
 * position at which its one prompt was sent, `admission` the ID `send`
 * returned for it, and `argumentsSha256` the digest of its view's fixed
 * arguments.
 */
const UNVALIDATED = Object.freeze({ sessionId: null, model: null, modelFrom: null, cwdFrom: null, sentAt: null, admission: null, argumentsSha256: null });

/**
 * The log position at which an admission's turn ended in its session's log:
 * its first root idle, aborted or not, after the first evidence of that
 * admission (its root user message, or a root assistant message it
 * originated, :6191-6193), or -1 while there is none. The log only grows, so
 * once found it never moves. For the after-view control, what the session
 * sends after it is post-turn (`controlRefusals`) and never read as the
 * turn's evidence (`checkAfterViewControl`); for a main session, it ends the
 * step's allowance (`stepOpen`) and its phase's consented actions
 * (`phaseOpen`). An idle before that evidence, such as the session's startup
 * idle or an earlier turn's, ends nothing.
 * @param {any[]} events @param {string | null} admission
 */
function turnEnd(events, admission) {
  if (!admission) return -1;
  const begun = events.findIndex((event) => event.root && ((event.type === 'user.message' && event.messageId === admission)
    || (event.type === 'assistant.message' && event.originatingMessageId === admission)));
  return begun < 0 ? -1 : events.findIndex((event, index) => index > begun && event.root && event.type === 'session.idle');
}

/**
 * The after-view control's one judgment of its session's events, shared by
 * the check just before its prompt is sent, its permission relay
 * (`controlTurnOver`), its final judgment (`checkAfterViewControl`), and its
 * report (`refusedEvents`): for each event in log order, null when it is
 * permitted, or the class it refuses with. An event whose envelope is not the
 * documented one is `malformed`, one of a type the SDK does not declare
 * `undeclared`, and a sub-agent's `subagent` (`controlForm`). Every other
 * event must be of a type its phase permits (`CONTROL_PHASES`: before
 * `sentAt`, through `turnEnd`, or after it), in the form permitted
 * (`permittedForm`), or it refuses as `competing`, or after the turn as
 * `after_turn`. Before the prompt the session starts once, while it is
 * created (before `modelFrom`), and a change of its model or working
 * directory is permitted only before the run asked for that check
 * (`modelFrom`, `cwdFrom`); from then on even a restatement of the same one
 * refuses. A permitted event refuses as `contradicting` when it states
 * another identity than the control established: another session; another
 * model, as its tool catalog's, from the model check on; another admission,
 * as a user message's own ID or an assistant message's originating message,
 * text-only messages included (never its own message ID or a provider's
 * request ID); or another tool call than its turn's sole view
 * (`soleViewRequest`), as the progress, streamed request, or permission of a
 * call.
 * @param {any[]} events @param {typeof UNVALIDATED} bound
 * @returns {Array<'malformed' | 'undeclared' | 'subagent' | 'competing' | 'after_turn' | 'contradicting' | null>}
 */
function controlRefusals(events, bound) {
  const end = turnEnd(events, bound.admission);
  const call = bound.argumentsSha256 ? soleViewRequest(end < 0 ? events : events.slice(0, end + 1), bound.admission, bound.argumentsSha256) : null;
  const start = events.findIndex((event) => event.type === 'session.start');
  /** Whether a statement at `index` comes at or after the check asked at log position `from`. @param {number} index @param {number | null} from */
  const checked = (index, from) => from !== null && index >= from;
  return events.map((event, index) => {
    if (event.form === 'malformed' || event.form === 'undeclared' || event.form === 'subagent') return event.form;
    const phase = bound.sentAt === null || index < bound.sentAt ? 'preSend' : end < 0 || index <= end ? 'inTurn' : 'postTurn';
    if (event.form !== 'permitted' || !CONTROL_PHASES[phase].has(event.type)
      || (event.type === 'session.start' && (index !== start || checked(index, bound.modelFrom)))
      || (event.type === 'session.model_change' && checked(index, bound.modelFrom))
      || (event.type === 'session.context_changed' && checked(index, bound.cwdFrom))) return phase === 'postTurn' ? 'after_turn' : 'competing';
    const stated = isRecord(event.identity) ? event.identity : {};
    const otherAdmission = bound.admission !== null && ((event.type === 'user.message' && event.messageId !== bound.admission)
      || (event.type === 'assistant.message' && event.originatingMessageId !== null && event.originatingMessageId !== bound.admission));
    return otherAdmission || (Object.hasOwn(stated, 'session') && bound.sessionId !== null && stated.session !== bound.sessionId)
      || (Object.hasOwn(stated, 'model') && bound.model !== null && checked(index, bound.modelFrom) && stated.model !== bound.model)
      || (Object.hasOwn(stated, 'call') && call !== null && stated.call !== call) ? 'contradicting' : null;
  });
}

/** An event type the report may name: safe characters only, at most 64. */
const SAFE_EVENT_TYPE = /^[A-Za-z0-9_.-]{1,64}$/;
/** An event ID the report may keep. */
const SAFE_EVENT_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * The after-view control report's account of the events of its session it
 * refused (`controlRefusals`), kept on every path that ran its session, a
 * failed wait or an early stop as well as its final judgment: `refusedEvents`,
 * one entry per distinct event type and class in the order first seen, at
 * most `NATIVE_LIMITS.refusedEvents`, and `refusedEventsOmitted`, how many
 * further distinct entries there were, so nothing is dropped silently. Types
 * are told apart by a digest of each event's original type (`typeSha256` for
 * one too long to keep), never by what the report shows, so two types it
 * cannot name stay two entries. Each entry has `type` (the event's type when
 * it is at most 64 safe characters; otherwise `(unavailable: N bytes)` with
 * its UTF-8 length, or `(unavailable: no type)`), `class`, `count`, and `id`,
 * the first such event's ID when that is a safe identifier, else null. No
 * event data, prompt, model text, or reasoning is kept.
 * @param {any[]} events The session's summarized events. @param {Partial<typeof UNVALIDATED>} bound What the control established.
 * @returns {{refusedEvents: Array<{type: string, class: string, count: number, id: string | null}>, refusedEventsOmitted: number}}
 */
export function refusedEvents(events, bound) {
  const classes = controlRefusals(events, { ...UNVALIDATED, ...bound });
  /** @type {Map<string, {type: string, class: string, count: number, id: string | null}>} */
  const entries = new Map();
  events.forEach((event, index) => {
    const kind = classes[index];
    if (kind === null) return;
    const bytes = typeof event.type === 'string' ? Buffer.byteLength(event.type, 'utf8') : event.typeBytes;
    const type = typeof event.type === 'string' && SAFE_EVENT_TYPE.test(event.type) ? event.type
      : Number.isSafeInteger(bytes) ? `(unavailable: ${bytes} bytes)` : '(unavailable: no type)';
    const key = `${kind} ${typeof event.type === 'string' ? sha256(event.type) : event.typeSha256 ?? 'none'}`;
    const entry = entries.get(key) ?? { type, class: kind, count: 0, id: typeof event.id === 'string' && SAFE_EVENT_ID.test(event.id) ? event.id : null };
    entry.count += 1;
    entries.set(key, entry);
  });
  const all = [...entries.values()];
  return { refusedEvents: all.slice(0, NATIVE_LIMITS.refusedEvents), refusedEventsOmitted: Math.max(0, all.length - NATIVE_LIMITS.refusedEvents) };
}

/** The refused entries as a check or stop detail names them. @param {ReturnType<typeof refusedEvents>} account */
function refusedNames(account) {
  return account.refusedEvents.map((entry) => `${entry.type} (${entry.class})`).join(', ');
}

/** @param {string} value */
function unquote(value) {
  return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')) ? value.slice(1, -1) : value;
}

/**
 * An `apply_patch` header line: a file operation (an added, updated, or
 * deleted file) or an updated file's move. Only a line's start opens one;
 * the same text later in a line is that patch line's own.
 */
const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to):/;
/** The one header whose file may count as an `apply_patch` call's path: an added or updated file. */
const PATCH_TARGET = /^\*\*\* (?:Add|Update) File: /;

/**
 * The one file an `apply_patch` patch adds or updates, or null. The patch is
 * read only while it is at most 2,048 characters, the bound a shell
 * command's kept text has, and counts only when its one header
 * (`PATCH_HEADER`) adds or updates a file: a patch with no header, several
 * file operations, a deletion, or a move names no file. The file is the rest
 * of that header line, without a trailing carriage return or whitespace, so
 * CRLF line ends name the same file, and is kept only while it is at most
 * 1,024 characters, as a file tool's path is.
 * @param {string} patch
 */
function patchTarget(patch) {
  if (patch.length > 2_048) return null;
  const headers = patch.split('\n').filter((line) => PATCH_HEADER.test(line));
  const target = headers.length === 1 ? PATCH_TARGET.exec(headers[0]) : null;
  const file = target ? headers[0].slice(target[0].length).trimEnd() : '';
  return file && file.length <= 1_024 ? file : null;
}

/**
 * The bounded part of one tool call's arguments this run keeps: conversation
 * and proposal arguments whole, a file tool's path, with an `apply_patch`
 * patch's one added or updated file counting as its path (`patchTarget`),
 * a shell command's text, and a task call's agent and mode only, never its
 * prompt or description.
 * @param {unknown} name @param {unknown} args
 */
function keptArguments(name, args) {
  if (name === 'apply_patch' && typeof args === 'string') {
    const file = patchTarget(args);
    return file === null ? null : { path: file };
  }
  if (!isRecord(args)) return null;
  if (name === CONVERSATION || name === PROPOSE) {
    const text = JSON.stringify(args);
    return text.length <= 2_048 ? JSON.parse(text) : { oversized: true };
  }
  if (name === TASK.tool) return { [TASK.agent]: boundedText(args[TASK.agent], 128), [TASK.mode]: boundedText(args[TASK.mode], 32) };
  if (typeof args.path === 'string' && args.path.length <= 1_024) return { path: args.path };
  if (typeof args.command === 'string' && args.command.length <= 2_048) return { command: args.command };
  return null;
}

/** The SHA-256 of one tool call's exact arguments as sorted-key JSON, so exactness is checked without keeping them. @param {unknown} args */
function argumentsDigest(args) {
  return args === undefined ? null : sha256(canonical(args));
}

/**
 * One session event reduced to the identifiers, discriminators, and bounded
 * fields this run checks. Prompts, model text, reasoning, and history are
 * never kept; a root user message keeps only its classification and digest,
 * a tool call its arguments' digest beside the bounded part kept, a completed
 * call the digest and size of its complete model-facing result too, and that
 * result itself only while it is at most `NATIVE_LIMITS.viewOutputBytes`, and
 * a discovery notification only its bounded source, trigger file, and
 * trigger tool. Each also keeps `form`, the after-view control's raw
 * validation of it (`controlForm`), which decides whether the fields kept here
 * may be read as that control's evidence at all: a lossy field (an oversized
 * attribution, a null agent ID, a non-boolean abort flag, a missing ID) is
 * never a permitted form, never a passing default. Its type is kept only
 * whole: one over 64 bytes is kept as its byte length and digest, never as a
 * prefix. An event of a type the control permits that states the session's
 * ID, the model its tool catalog was resolved for, the session owning a
 * permission, or the tool call it belongs to keeps that statement, bounded, as
 * `identity`, for `controlRefusals`. A completed call that states an error
 * message also keeps it, as `error`, under its content's bound: the native
 * runtime reports a product's non-success result, such as a cancelled
 * conversation, as `success: false` with no result and the product's text in
 * `error.message` (run eed11bf5-4871-4337-a1ef-1be3d5c41fe9).
 *
 * Every event also keeps who sent it, for the capture step's Spec Lead
 * attribution (`specLeadRequest`): `agent`, its own agent ID, and
 * `parentToolCallId`, as `marker` keeps each (null when absent, false when
 * malformed). A sub-agent's start keeps the call that started it, any
 * spawning sub-agent, its name and type, and its execution mode; its end,
 * that call and whether it was torn down by cancellation; a permission
 * request, its request ID, tool call, the digest of its exact request, any
 * agent stated as its owner, and whether a hook resolved it; a permission's
 * completion, its request ID. Never a task's prompt or the agent's
 * description.
 * @param {Record<string, any>} event @param {number} at
 */
export function summarizeEvent(event, at) {
  const data = isRecord(event.data) ? event.data : {};
  const ts = typeof event.timestamp === 'string' ? Date.parse(event.timestamp) : Number.NaN;
  const typeBytes = typeof event.type === 'string' ? Buffer.byteLength(event.type, 'utf8') : null;
  const base = { type: typeBytes !== null && typeBytes <= 64 ? event.type : null,
    ...(typeBytes !== null && typeBytes > 64 ? { typeBytes, typeSha256: sha256(event.type) } : {}), id: boundedText(event.id, 128), at,
    ts: Number.isFinite(ts) ? ts : null, root: event.agentId === undefined || event.agentId === null, form: controlForm(event),
    agent: marker(event.agentId, 128), parentToolCallId: marker(data.parentToolCallId, 256) };
  /** @param {Record<string, unknown>} identity */
  const stating = (identity) => ({ ...base, identity });
  switch (event.type) {
    case 'user.message': {
      const content = typeof data.content === 'string' ? data.content : '';
      return {
        ...base, messageId: boundedText(data.messageId, 256), source: boundedText(data.source, 128), classified: classifyInput(event).kind,
        contentSha256: sha256(content),
      };
    }
    case 'assistant.message': {
      const requests = Array.isArray(data.toolRequests) ? data.toolRequests : [];
      // More requests than the bound is an overflow of the whole log, never a silently shortened list.
      if (requests.length > NATIVE_LIMITS.toolRequests) return { ...base, tooManyRequests: true };
      return {
        ...base, messageId: boundedText(data.messageId, 256), originatingMessageId: boundedText(data.originatingMessageId, 256),
        toolRequests: requests.map((entry) => ({
          toolCallId: boundedText(entry?.toolCallId, 256), name: boundedText(entry?.name, 128), arguments: keptArguments(entry?.name, entry?.arguments),
          argumentsSha256: argumentsDigest(entry?.arguments),
        })),
      };
    }
    case 'tool.execution_start':
      return { ...base, toolCallId: boundedText(data.toolCallId, 256), toolName: boundedText(data.toolName, 128),
        arguments: keptArguments(data.toolName, data.arguments), argumentsSha256: argumentsDigest(data.arguments) };
    case 'tool.execution_complete': {
      const result = isRecord(data.result) ? data.result : {};
      const text = typeof result.detailedContent === 'string' ? result.detailedContent : typeof result.content === 'string' ? result.content : '';
      const model = typeof result.content === 'string' ? result.content : null;
      const failure = isRecord(data.error) && typeof data.error.message === 'string' ? { error: boundedText(data.error.message, 16_384) } : {};
      return { ...base, toolCallId: boundedText(data.toolCallId, 256), success: data.success === true, content: boundedText(text, 16_384),
        contentSha256: sha256(text), resultBytes: model === null ? null : Buffer.byteLength(model, 'utf8'), resultSha256: model === null ? null : sha256(model),
        result: boundedText(model, NATIVE_LIMITS.viewOutputBytes), ...failure };
    }
    case 'system.notification': {
      const kind = isRecord(data.kind) ? data.kind : {};
      return { ...base, kind: boundedText(kind.type, 64), sourcePath: boundedText(kind.sourcePath, 1_024), triggerFile: boundedText(kind.triggerFile, 1_024),
        triggerTool: boundedText(kind.triggerTool, 64) };
    }
    case 'session.idle':
      return { ...base, aborted: data.aborted === true };
    case 'session.info':
    case 'session.warning': {
      const message = typeof data.message === 'string' ? data.message : '';
      const relevant = /^(?:Activation:|Status: conversation |A2A )/.test(message);
      return { ...base, message: relevant ? boundedText(message, 2_048) : null };
    }
    case 'session.start':
      // Its selected model and working directory are startup statements the checks supersede; a start after its creation refuses.
      return stating({ session: boundedText(data.sessionId, 256) });
    case 'session.tools_updated':
      return stating({ model: boundedText(data.model, 256) });
    case 'tool.execution_progress':
    case 'assistant.tool_call_delta':
      return stating({ call: boundedText(data.toolCallId, 256) });
    case 'permission.completed':
      return { ...stating(data.toolCallId !== undefined ? { call: boundedText(data.toolCallId, 256) } : {}), requestId: boundedText(data.requestId, 256) };
    case 'permission.requested': {
      const request = isRecord(data.permissionRequest) ? data.permissionRequest : {};
      return { ...stating({ ...(data.ownerSessionId !== undefined ? { session: boundedText(data.ownerSessionId, 256) } : {}),
        ...(request.toolCallId !== undefined ? { call: boundedText(request.toolCallId, 256) } : {}) }),
      requestId: boundedText(data.requestId, 256), toolCallId: marker(request.toolCallId, 256),
      requestSha256: isRecord(data.permissionRequest) ? sha256(canonical(data.permissionRequest)) : null, ownerAgentId: marker(data.ownerAgentId, 128),
      resolvedByHook: data.resolvedByHook === true };
    }
    case 'subagent.started':
      return { ...base, toolCallId: boundedText(data.toolCallId, 256), spawner: marker(data.parentId, 256), agentName: marker(data.agentName, 128),
        agentType: marker(data.agentType, 128), executionMode: marker(data.executionMode, 32) };
    case 'subagent.completed':
    case 'subagent.failed':
      return { ...base, toolCallId: boundedText(data.toolCallId, 256), cancelled: data.cancelled === true };
    default:
      return base;
  }
}

/**
 * A bounded event log for one session, registered at creation so no early
 * event is missed. Overflow (too many events or bytes, or one message with
 * more tool requests than the bound) is sticky: nothing more is kept, and the
 * run consumes the flag before it uses any evidence, so what was kept earlier
 * can never stand in for what was dropped. A delivered value that is no event
 * with a string type is kept as one `malformed` entry of no type, so the
 * after-view control never takes its absence for silence.
 * @param {'a' | 'b' | 'control'} side @param {() => number} clock
 */
export function createSessionLog(side, clock = Date.now) {
  /** @type {{side: string, events: any[], bytes: number, overflow: boolean}} */
  const state = { side, events: [], bytes: 0, overflow: false };
  return {
    state,
    /** @param {unknown} event */
    onEvent(event) {
      if (state.overflow) return;
      try {
        const entry = isRecord(event) && typeof event.type === 'string' ? summarizeEvent(event, clock())
          : { type: null, id: null, at: clock(), ts: null, root: false, form: 'malformed' };
        const size = Buffer.byteLength(JSON.stringify(entry), 'utf8');
        if (entry.tooManyRequests || state.events.length >= NATIVE_LIMITS.events || state.bytes + size > NATIVE_LIMITS.eventBytes) {
          state.overflow = true;
          return;
        }
        state.events.push(entry);
        state.bytes += size;
      } catch {
        state.overflow = true;
      }
    },
  };
}

/**
 * Whether a summarized event is the root agent's own: it states no agent ID
 * at all. A null, empty, or otherwise malformed one is never the root's.
 * @param {any} event
 */
function rootEvent(event) {
  return event.root === true && event.agent === null;
}

/**
 * Whether a root assistant message that the given admission started requested
 * this tool call. `originatingMessageId` is the ID `send` returned for that
 * admission; a message without it, from a subagent, or with a malformed agent
 * ID (`rootEvent`) matches nothing.
 * @param {any[]} events @param {string} toolCallId @param {string | null | undefined} admission
 */
export function requestedBy(events, toolCallId, admission) {
  return typeof admission === 'string' && admission.length > 0 && events.some((event) => event.type === 'assistant.message' && rootEvent(event)
    && event.originatingMessageId === admission && (event.toolRequests ?? []).some((/** @type {any} */ entry) => entry.toolCallId === toolCallId));
}

/**
 * The Spec Lead A's capture may delegate staging to, as `specLeadOf` found it
 * in A's own session: `names`, every name the runtime lists it by that no
 * other listed agent uses, and `selectors`, those of them its task tool may
 * select it by.
 * @typedef {Readonly<{names: readonly string[], selectors: readonly string[]}>} SpecLeadNames
 */

/**
 * Whether one call is a direct synchronous Spec Lead task of an admission,
 * from the session's own events: the root model requested it exactly once,
 * for that admission, as the `task` tool selecting the Spec Lead (`agent_type`
 * one of `selectors`) in `sync` mode; its one root start has exactly the
 * requested arguments (`argumentsSha256`); and exactly one `subagent.started`
 * names it, after that start, for a sub-agent of its own that no other start
 * names, with no spawning sub-agent (`parentId`), only the Spec Lead's own
 * `names` as its name (`agentName`, and `agentType` where stated), and `sync`
 * execution where stated. Its display name is a label and decides nothing.
 * @param {any[]} events @param {string} taskCallId @param {SpecLeadNames & {admission: string}} delegate
 * @returns {{ok: true, agentId: string, at: number} | {ok: false, reason: 'unspawned' | 'nested' | 'not_spec_lead' | 'not_sync'}}
 */
function specLeadTask(events, taskCallId, { admission, names, selectors }) {
  const requests = events.flatMap((event, index) => (event.type === 'assistant.message' ? (event.toolRequests ?? [])
    .filter((/** @type {any} */ entry) => entry.toolCallId === taskCallId).map((/** @type {any} */ entry) => ({ event, entry, index })) : []));
  if (requests.length !== 1 || !rootEvent(requests[0].event) || requests[0].event.originatingMessageId !== admission) {
    return { ok: false, reason: 'unspawned' };
  }
  const [{ entry: task, index: askedAt }] = requests;
  if (task.name !== TASK.tool || !selectors.includes(task.arguments?.[TASK.agent])) return { ok: false, reason: 'not_spec_lead' };
  if (task.arguments[TASK.mode] !== TASK.sync) return { ok: false, reason: 'not_sync' };
  const starts = events.filter((event) => event.type === 'tool.execution_start' && event.toolCallId === taskCallId);
  const start = starts.length === 1 ? starts[0] : null;
  if (!start || !(askedAt < events.indexOf(start)) || !rootEvent(start) || start.toolName !== TASK.tool
    || start.argumentsSha256 !== task.argumentsSha256) return { ok: false, reason: 'unspawned' };
  const spawns = events.filter((event) => event.type === 'subagent.started' && event.toolCallId === taskCallId);
  const spawn = spawns.length === 1 ? spawns[0] : null;
  if (!spawn || !(events.indexOf(start) < events.indexOf(spawn)) || typeof spawn.agent !== 'string'
    || events.filter((event) => event.type === 'subagent.started' && event.agent === spawn.agent).length !== 1) return { ok: false, reason: 'unspawned' };
  if (spawn.spawner !== null) return { ok: false, reason: 'nested' };
  if (!names.includes(spawn.agentName) || (spawn.agentType !== null && !names.includes(spawn.agentType))) return { ok: false, reason: 'not_spec_lead' };
  if (spawn.executionMode !== null && spawn.executionMode !== TASK.sync) return { ok: false, reason: 'not_sync' };
  return { ok: true, agentId: spawn.agent, at: events.indexOf(spawn) };
}

/**
 * The capture step's one exception to root-only attribution, at the relay
 * (`permissionRelay`): whether one permission request of A's session comes
 * from the installed Spec Lead, started for the current capture admission
 * through a direct synchronous task (`specLeadTask`), and is still live. The
 * callback names a session, never an agent, so each fact comes from the
 * session's own events:
 * - exactly one assistant message requested the call, a sub-agent's, and any
 *   `parentToolCallId` it states is that sub-agent's task call (its
 *   `originatingMessageId` is its own and is never read);
 * - exactly one `subagent.started` names that sub-agent, with no spawning
 *   sub-agent, for a Spec Lead task of the admission, before that request;
 * - nothing ended it: no root idle or later root prompt after the
 *   admission's own message, no completion or failure of the task or its
 *   sub-agent, no idle of that sub-agent, and no completion of the call; and
 * - exactly one pending `permission.requested` (no `permission.completed` of
 *   its request ID) has this call and this request's exact digest, no hook
 *   resolved it, and any agent it states, as sender or as owner, is that
 *   sub-agent. Its owner session is routing metadata and decides nothing.
 * A malformed agent ID is never the root's or a sub-agent's.
 * @param {any[]} events A's summarized events. @param {string} toolCallId
 * @param {string} requestSha256 The digest of the callback's exact request, `sha256(canonical(request))`.
 * @param {SpecLeadNames & {admission: string | null | undefined}} delegate
 * @returns {{ok: true, agentId: string, taskCallId: string}
 *   | {ok: false, reason: 'unrequested' | 'contradictory' | 'unspawned' | 'nested' | 'not_spec_lead' | 'not_sync' | 'ended' | 'permission_unmatched'}}
 */
export function specLeadRequest(events, toolCallId, requestSha256, delegate) {
  const { admission } = delegate;
  if (!toolCallId || typeof admission !== 'string' || !admission) return { ok: false, reason: 'unrequested' };
  const claims = events.filter((event) => event.type === 'assistant.message'
    && (event.toolRequests ?? []).some((/** @type {any} */ entry) => entry.toolCallId === toolCallId));
  if (claims.length === 0) return { ok: false, reason: 'unrequested' };
  const [message] = claims;
  const agentId = message.agent;
  if (claims.length !== 1 || typeof agentId !== 'string'
    || message.toolRequests.filter((/** @type {any} */ entry) => entry.toolCallId === toolCallId).length !== 1) return { ok: false, reason: 'contradictory' };
  const spawns = events.filter((event) => event.type === 'subagent.started' && event.agent === agentId);
  if (spawns.length !== 1 || typeof spawns[0].toolCallId !== 'string' || !spawns[0].toolCallId) return { ok: false, reason: 'unspawned' };
  if (spawns[0].spawner !== null) return { ok: false, reason: 'nested' };
  const taskCallId = spawns[0].toolCallId;
  const task = specLeadTask(events, taskCallId, { ...delegate, admission });
  if (!task.ok) return task;
  if (message.parentToolCallId !== null && message.parentToolCallId !== taskCallId) return { ok: false, reason: 'contradictory' };
  const admitted = events.findIndex((event) => event.type === 'user.message' && rootEvent(event) && event.messageId === admission);
  if (admitted < 0 || !(task.at < events.indexOf(message))) return { ok: false, reason: 'unspawned' };
  if (events.some((event, index) => (index > admitted && (event.type === 'user.message' || event.type === 'session.idle') && typeof event.agent !== 'string')
    || ((event.type === 'tool.execution_complete' || event.type === 'subagent.completed' || event.type === 'subagent.failed') && event.toolCallId === taskCallId)
    || (event.type === 'tool.execution_complete' && event.toolCallId === toolCallId) || (event.type === 'session.idle' && event.agent === agentId))) {
    return { ok: false, reason: 'ended' };
  }
  const settled = new Set(events.filter((event) => event.type === 'permission.completed' && typeof event.requestId === 'string')
    .map((event) => event.requestId));
  const pending = events.filter((event) => event.type === 'permission.requested' && event.toolCallId === toolCallId && event.requestSha256 === requestSha256
    && typeof event.requestId === 'string' && !settled.has(event.requestId));
  if (pending.length !== 1 || pending[0].resolvedByHook) return { ok: false, reason: 'permission_unmatched' };
  if ([pending[0].agent, pending[0].ownerAgentId].some((value) => value !== null && value !== agentId)) return { ok: false, reason: 'contradictory' };
  return { ok: true, agentId, taskCallId };
}

/**
 * The two Spec Lead tasks of A's capture admission that staged what its
 * publisher read, in order: of the root task calls of that admission, the
 * one whose sub-agent created the staged ledger, by exactly one successful
 * call of its own of a tool that always changes a file (`FILE_CHANGE_TOOLS`),
 * and a later one whose sub-agent created the staged advice the same way,
 * each a Spec Lead task (`specLeadTask`) that its root call completed
 * successfully and its sub-agent completed, neither failed nor torn down by
 * cancellation. A read of a staged file, such as a view of it after its
 * creation, names the file too but stages nothing. Each string names one
 * problem; an empty list shows the delegation. Other task calls of the
 * admission are only counted.
 * @param {any[]} events @param {SpecLeadNames & {admission: string, ledger: string, advice: string}} expected
 * @returns {{problems: string[], tasks: Array<{toolCallId: string, agentId: string}>, others: number}}
 */
export function checkStaging(events, { admission, names, selectors, ledger, advice }) {
  const calls = events.filter((event) => event.type === 'assistant.message' && rootEvent(event) && event.originatingMessageId === admission)
    .flatMap((event) => (event.toolRequests ?? []).filter((/** @type {any} */ entry) => entry.name === TASK.tool && typeof entry.toolCallId === 'string'))
    .map((/** @type {any} */ entry) => entry.toolCallId);
  /** @param {string} taskCallId @param {string} file */
  const staged = (taskCallId, file) => {
    const task = specLeadTask(events, taskCallId, { admission, names, selectors });
    if (!task.ok) return null;
    const ended = (/** @type {string} */ type) => events.filter((event) => event.type === type && event.toolCallId === taskCallId);
    const done = ended('tool.execution_complete');
    const completed = ended('subagent.completed');
    if (done.length !== 1 || !done[0].success || completed.length !== 1 || completed[0].cancelled || ended('subagent.failed').length) return null;
    // A read-back names the staged file too. Only a successful call of a tool that always changes its file counts, and on a staging path
    // the relay allows no change but a new file's creation (`matchPermission`).
    const created = events.filter((event) => event.type === 'tool.execution_start' && event.agent === task.agentId
      && FILE_CHANGE_TOOLS.includes(String(event.toolName)) && event.toolName !== 'str_replace_editor' && typeof event.arguments?.path === 'string'
      && samePath(event.arguments.path, file) && events.some((complete) => complete.type === 'tool.execution_complete' && complete.toolCallId === event.toolCallId
        && complete.success));
    return created.length === 1 ? { toolCallId: taskCallId, agentId: task.agentId } : null;
  };
  const first = calls.findIndex((call) => staged(call, ledger));
  const second = first < 0 ? -1 : calls.findIndex((call, index) => index > first && staged(call, advice));
  /** @type {string[]} */
  const problems = [];
  if (first < 0) problems.push('ledger_not_staged_by_spec_lead');
  if (second < 0) problems.push('advice_not_staged_by_spec_lead');
  const tasks = [first, second].filter((index) => index >= 0).map((index) => /** @type {{toolCallId: string, agentId: string}} */ (
    staged(calls[index], index === first ? ledger : advice)));
  return { problems, tasks, others: calls.length - tasks.length };
}

/** The conversation tool's success outcomes; the product returns every other outcome as a failure. */
const SUCCESS_OUTCOMES = Object.freeze(['accepted', 'pending', 'answer', 'sent']);

/**
 * Whether `value` is the product's own non-success conversation result: an
 * object whose `outcome` is none of the success outcomes and that has the
 * `reason`, `next`, and `notice` texts every failure body has (`refusal` and
 * `view` in src/extensions/dude/lib/a2a-collaboration.mjs).
 * @param {unknown} value
 */
function productFailure(value) {
  return isRecord(value) && typeof value.outcome === 'string' && !SUCCESS_OUTCOMES.includes(value.outcome)
    && typeof value.reason === 'string' && typeof value.next === 'string' && typeof value.notice === 'string';
}

/**
 * The parsed JSON result of each completed conversation call that the
 * session's own root model requested for one admission, in order:
 * `{op, operationId, start, complete, result}`. Calls requested for an earlier
 * instruction, by a subagent, or by no model are not this admission's. A call
 * with content is parsed from that content. The native runtime completes a
 * product non-success outcome, such as `cancelled`, with `success: false`, no
 * content, and its JSON in `error.message` (run
 * eed11bf5-4871-4337-a1ef-1be3d5c41fe9), so a failed call with no content is
 * parsed from that kept failure text (`summarizeEvent`), but only when the
 * text is such a result (`productFailure`). Any other failure text,
 * success-shaped or not, failure text on a successful call, and a call with
 * neither content nor failure text have a null result; `complete.success`
 * still shows whether the call failed.
 * @param {any[]} events @param {string} admission
 */
export function conversationCalls(events, admission) {
  /** @type {Map<string, any>} */
  const starts = new Map();
  /** @type {any[]} */
  const calls = [];
  for (const event of events) {
    if (event.type === 'tool.execution_start' && event.toolName === CONVERSATION && event.root && requestedBy(events, event.toolCallId, admission)) {
      starts.set(event.toolCallId, event);
    }
    if (event.type === 'tool.execution_complete' && starts.has(event.toolCallId)) {
      const start = starts.get(event.toolCallId);
      const failure = event.success === false && event.content === '' && typeof event.error === 'string';
      /** @type {any} */
      let result = null;
      try {
        result = JSON.parse(failure ? event.error : event.content ?? '');
      } catch {
        result = null;
      }
      if (failure && !productFailure(result)) result = null;
      calls.push({ op: start.arguments?.op ?? null, operationId: start.arguments?.operationId ?? result?.operationId ?? null, start, complete: event, result });
    }
  }
  return calls;
}

/**
 * Whether both whole root instructions were admitted before either main's
 * operation began, judged from the runtimes' own event stamps and each
 * session's own event order: each `send` ID names exactly one unattributed
 * root user message carrying exactly that prompt; that session's single
 * begin request (correlated to the admission) and its execution follow it;
 * both admissions are stamped strictly before the earlier of the two begin
 * requests; B's exact waiting status is stamped strictly before A's ask
 * request; and no other root prompt arrives in either session meanwhile.
 * Callback arrival order across two sessions proves nothing, so a missing
 * stamp, a tie, or an uncorrelated request fails. Each string names one
 * problem; an empty list means the order is shown.
 * @param {{a: any[], b: any[]}} events
 * @param {{a: {id: string, prompt: string}, b: {id: string, prompt: string}}} sent
 * @param {{a: string, b: string}} ops The begin operation each side's instruction names.
 * @param {string | null} waiting B's exact waiting status text, or null when B has no operation.
 * @returns {string[]}
 */
export function checkInstructionOrder(events, sent, ops, waiting) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Record<string, {admitted: any, request: any} | null>} */
  const seen = {};
  for (const side of /** @type {const} */ (['a', 'b'])) {
    const list = events[side];
    const admissions = list.filter((event) => event.type === 'user.message' && event.messageId === sent[side].id);
    const index = list.indexOf(admissions[0]);
    const admitted = admissions[0];
    if (admissions.length !== 1 || !admitted.root || admitted.source !== null || admitted.contentSha256 !== sha256(sent[side].prompt)
      || typeof admitted.ts !== 'number') {
      problems.push(`${side}_admission`);
      seen[side] = null;
      continue;
    }
    const requests = list.filter((event) => event.type === 'assistant.message' && event.root && event.originatingMessageId === sent[side].id
      && (event.toolRequests ?? []).some((/** @type {any} */ entry) => entry.name === CONVERSATION && String(entry.arguments?.op ?? '').startsWith('begin_')));
    const beginRequests = requests.flatMap((event) => event.toolRequests.filter((/** @type {any} */ entry) => entry.name === CONVERSATION
      && String(entry.arguments?.op ?? '').startsWith('begin_')).map((/** @type {any} */ entry) => ({ event, entry })));
    if (beginRequests.length !== 1 || beginRequests[0].entry.arguments?.op !== ops[side]) {
      problems.push(`${side}_begin_request`);
      seen[side] = null;
      continue;
    }
    const { event: request, entry } = beginRequests[0];
    const start = list.find((event) => event.type === 'tool.execution_start' && event.toolCallId === entry.toolCallId);
    if (typeof request.ts !== 'number' || !start || typeof start.ts !== 'number' || !(index < list.indexOf(request) && list.indexOf(request) < list.indexOf(start))
      || !(admitted.ts < request.ts && request.ts <= start.ts)) {
      problems.push(`${side}_begin_order`);
    }
    if (list.slice(index + 1).some((event) => event.type === 'user.message' && event.root)) problems.push(`${side}_later_prompt`);
    seen[side] = { admitted, request };
  }
  const a = seen.a;
  const b = seen.b;
  // A missing stamp is already that side's `begin_order` problem; never compare it as a number.
  if (a && b && typeof a.request.ts === 'number' && typeof b.request.ts === 'number') {
    const earliestBegin = Math.min(a.request.ts, b.request.ts);
    if (!(a.admitted.ts < earliestBegin && b.admitted.ts < earliestBegin)) problems.push('admission_after_begin');
    const status = waiting === null ? undefined : events.b.find((event) => (event.type === 'session.info' || event.type === 'session.warning')
      && event.message === waiting);
    if (!status || typeof status.ts !== 'number' || !(status.ts < a.request.ts)) problems.push('b_not_waiting_before_ask');
  }
  return problems;
}

/**
 * The immediate-call bound: every begin, read, and cancel returned within one
 * second by the runtime's own start and completion stamps.
 * @param {any[]} calls @returns {{maxMs: number, over: number}}
 */
export function immediateTimings(calls) {
  let maxMs = 0;
  let over = 0;
  for (const call of calls) {
    const ms = call.complete.ts !== null && call.start.ts !== null ? call.complete.ts - call.start.ts : Number.POSITIVE_INFINITY;
    maxMs = Math.max(maxMs, ms);
    if (!(ms <= NATIVE_LIMITS.immediateMs)) over += 1;
  }
  return { maxMs, over };
}

/**
 * One main's complete proposal from its actual native tool result: within the
 * fixed cap, ending in the closed approval guidance, and for B with separate
 * SHARING, WORKER, and QUALIFICATION lines. The text is shown whole. With
 * `signIn` (a version-3 run), B's proposal must also disclose the worker's
 * existing saved sign-in with that expected account, and a latch-only
 * qualification: a token worker's or a canary qualification's proposal is
 * another branch's.
 * @param {any[]} events @param {{sessionId: string, worker: boolean, runId: string, signIn?: {host: string, login: string}}} expected
 * @returns {{text: string, providerGeneration: string}}
 */
export function proposalOf(events, expected) {
  const start = events.find((event) => event.type === 'tool.execution_start' && event.toolName === PROPOSE && event.root);
  const complete = start && events.find((event) => event.type === 'tool.execution_complete' && event.toolCallId === start.toolCallId);
  if (!complete || !complete.success || typeof complete.content !== 'string') return stop('proposal_unavailable', 'no complete proposal result was observed');
  const text = complete.content;
  if (Buffer.byteLength(text, 'utf8') > A2A_PROPOSAL_BYTES) return stop('proposal_too_large', 'the observed proposal exceeds the fixed cap');
  const lines = text.split('\n');
  const local = /^Local: (\S+); provider ([0-9a-f-]{36}); workspace /.exec(lines.find((line) => line.startsWith('Local: ')) ?? '');
  const signIn = expected.signIn;
  if (!lines[0]?.startsWith('Proposal only: nothing is activated.') || !lines.some((line) => line.startsWith('SHARING: '))
    || !lines.some((line) => /^Approval: dude a2a approve \S+;/.test(line)) || !text.endsWith('To decline or cancel, use dude a2a stop.')
    || !local || local[1] !== expected.sessionId || !UUID.test(local[2])
    || (expected.worker && (!lines.some((line) => line.startsWith('WORKER: '))
      || !lines.some((line) => line.startsWith(`QUALIFICATION: run ${expected.runId}; `))))
    || (expected.worker && signIn && (!lines.some((line) => line.startsWith(`Worker sign-in and model: existing saved sign-in, expected ${signIn.login} `
      + `at ${signIn.host} on the runtime and its session`))
      || !lines.some((line) => line.startsWith(`QUALIFICATION: run ${expected.runId}; `) && line.endsWith('; latches only, with no canaries or probes'))))) {
    return stop('proposal_unavailable', 'the observed result is not one complete proposal for this session');
  }
  return { text, providerGeneration: local[2] };
}

/**
 * The file tools whose call can change the file its kept path names (`keptArguments`); a view names a file as well and changes
 * nothing. Each always changes it except `str_replace_editor`, whose view command keeps the same bare path as its create.
 */
const FILE_CHANGE_TOOLS = Object.freeze(['edit', 'create', 'str_replace_editor', 'apply_patch', 'write', 'str_replace']);

/**
 * Whether one main made its own model progress inside the hold interval: a
 * root assistant message of that session's current instruction (its
 * `originatingMessageId` is the admission `send` returned) requested a tool
 * call on its progress file (an `apply_patch` call through the one file its
 * patch adds or updates, `keptArguments`), and that call's native start and
 * successful completion follow it, all stamped inside [start, end] by the
 * runtime and received before the release. Direct qualifier calls, counters,
 * requests for an earlier instruction, and later or earlier edits do not
 * count.
 * @param {any[]} events @param {{file: string, start: number, end: number, admission: string}} interval
 * @returns {{ok: true, toolCallId: string, requestedAt: number, completedAt: number} | {ok: false, reason: string}}
 */
export function checkProgress(events, { file, start, end, admission }) {
  /** @type {Map<string, any>} */
  const requested = new Map();
  for (const event of events) {
    if (event.type !== 'assistant.message' || !event.root || typeof admission !== 'string' || event.originatingMessageId !== admission) continue;
    for (const request of event.toolRequests ?? []) {
      if (request.toolCallId && typeof request.arguments?.path === 'string' && samePath(request.arguments.path, file)) requested.set(request.toolCallId, event);
    }
  }
  let reason = 'not_requested';
  for (const [toolCallId, message] of requested) {
    const started = events.find((event) => event.type === 'tool.execution_start' && event.toolCallId === toolCallId);
    const completed = events.find((event) => event.type === 'tool.execution_complete' && event.toolCallId === toolCallId);
    if (!started || !completed) {
      reason = 'not_executed';
      continue;
    }
    if (!completed.success) {
      reason = 'not_successful';
      continue;
    }
    const stamps = [message.ts, started.ts, completed.ts];
    if (stamps.some((stamp) => typeof stamp !== 'number' || stamp < start || stamp > end) || completed.at > end) {
      reason = 'outside_interval';
      continue;
    }
    if (!(message.ts <= started.ts && started.ts <= completed.ts)) {
      reason = 'out_of_order';
      continue;
    }
    // A view of a file that exists counts as a request on it too; only a completed change of the file counts as progress.
    if (!FILE_CHANGE_TOOLS.includes(String(started.toolName))) {
      reason = 'not_an_edit';
      continue;
    }
    return { ok: true, toolCallId, requestedAt: message.ts, completedAt: completed.ts };
  }
  return { ok: false, reason };
}

/**
 * One step's allowance under the typed consent, kept as
 * `run.allow[side].tools` from right after that step's instruction is
 * admitted as `admission` until its turn ends, and null in every other step,
 * the approval steps included. It names Dude's own tool calls: in a proposal
 * step `dude_a2a_propose` with exactly `propose` as its arguments; in an
 * exchange `dude_a2a_conversation` with only `conversation.ops`, and
 * `begin_ask` only for `conversation.slug`. In an exchange and in the capture
 * step, which allows no Dude tool call, it also names the session's own
 * fixture `workspace`, whose reads the relay approves (`WORKSPACE_READ`): by
 * the layout's `path`, and by its `canonical` real path, which the capture
 * instruction names. The relay compares it by identity, so a new one is a
 * new step (`toolAllowance`).
 * @typedef {Readonly<{admission: string, propose: Readonly<{configPath: string, profileId: string}> | null,
 *   conversation: Readonly<{ops: readonly string[], slug: string | null}> | null,
 *   workspace: Readonly<{path: string, canonical: string}> | null}>} ToolAllowance
 */

/** The one `toolApprovals` key under which the relay counts the reads inside a session's own workspace that it approves. */
const WORKSPACE_READ = 'workspace.read';
/** The `toolApprovals` key under which the relay counts the reads inside A's workspace that it approves for the capture's Spec Lead. */
const SPEC_LEAD_READ = 'spec_lead.workspace.read';
/**
 * The closed `toolApprovals` keys of the open phase's exact actions, which the relay approves under the typed consent as it does a step's
 * calls and reads (`matchPermission`), each named by its phase and, as `spec_lead.` names the Spec Lead's reads, by its requester: the
 * progress file's edit; A's root model's inventory, hash, and publisher commands and its reads of A's temp folder; and the Spec Lead's
 * reads of that folder and its new staging files there.
 */
const PHASE_ACTIONS = Object.freeze({
  progressEdit: 'progress.edit',
  command: 'capture.command',
  read: 'capture.read',
  specLeadRead: 'spec_lead.capture.read',
  specLeadStaging: 'spec_lead.capture.staging',
});

/**
 * The argument fields each conversation operation takes, sorted: the closed
 * shapes of the product's own tool (`SHAPES` in
 * src/extensions/dude/lib/a2a-collaboration.mjs). No other shape is approved.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const CONVERSATION_FIELDS = Object.freeze({
  begin_receive: Object.freeze(['op']),
  begin_ask: Object.freeze(['op', 'question', 'slug', 'tentativeNumber']),
  read: Object.freeze(['op', 'operationId']),
  cancel: Object.freeze(['op', 'operationId']),
});

/**
 * Each side's conversation operations in each exchange: B begins receiving
 * and reads; A begins asking and reads, and in the cancel exchange also
 * cancels.
 */
const EXCHANGE_OPS = Object.freeze({
  advice: Object.freeze({ b: Object.freeze(['begin_receive', 'read']), a: Object.freeze(['begin_ask', 'read']) }),
  cancel: Object.freeze({ b: Object.freeze(['begin_receive', 'read']), a: Object.freeze(['begin_ask', 'cancel', 'read']) }),
});

/**
 * A frozen `ToolAllowance` for the instruction admitted as `admission`.
 * @param {string} admission
 * @param {{propose?: {configPath: string, profileId: string}, ops?: readonly string[], slug?: string, workspace?: string}} calls
 *   `workspace` is the session's own fixture workspace folder, which exists by then.
 * @returns {ToolAllowance}
 */
function toolAllowance(admission, { propose, ops, slug, workspace }) {
  return Object.freeze({
    admission,
    propose: propose ? Object.freeze({ configPath: propose.configPath, profileId: propose.profileId }) : null,
    conversation: ops ? Object.freeze({ ops: Object.freeze([...ops]), slug: slug ?? null }) : null,
    workspace: workspace ? Object.freeze({ path: workspace, canonical: canonicalFolder(workspace) }) : null,
  });
}

/** A folder's real path, or the folder as named when it cannot be resolved, which only narrows what counts as inside it. @param {string} folder */
function canonicalFolder(folder) {
  try {
    return fs.realpathSync.native(folder);
  } catch {
    return folder;
  }
}

/**
 * Whether a read request's path names a session's own workspace folder or
 * something below it: an absolute path that resolves there by either of its
 * spellings, compared as Windows compares paths. A relative path, or any other
 * spelling of the same place (a device or 8.3 form), is never inside.
 * @param {Readonly<{path: string, canonical: string}>} workspace @param {unknown} value
 */
function inWorkspace(workspace, value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return false;
  const target = path.resolve(value);
  return isWithin(workspace.path, target) || isWithin(workspace.canonical, target);
}

/**
 * Whether managed policy marks a request as needing a person's response, on
 * itself or on its prompt, as the SDK's own approval helper reads the marker:
 * anything but absent or false. The SDK forbids a host's own approval of such
 * a request, so the relay never approves one itself.
 * @param {Record<string, unknown>} request @param {Record<string, unknown>} invocation
 */
function needsPerson(request, invocation) {
  const prompted = isRecord(invocation.promptRequest) ? invocation.promptRequest : {};
  const marked = (/** @type {unknown} */ value) => value !== undefined && value !== false;
  return marked(request.managedApprovalRequired) || marked(prompted.managedApprovalRequired);
}

/**
 * The rule for one custom-tool request that passed `matchPermission`'s
 * session, request, and sandbox checks. Dude's own extension tools ask
 * permission in normal mode because neither sets `skipPermission`, and of
 * them the typed consent covers only the current step's exact calls
 * (`tools`), which the relay approves itself without asking; `relay` names
 * the call's count.
 * Exact means the operation's own fields only: `dude_a2a_propose` with the
 * step's configuration and profile; `begin_receive` alone; `begin_ask` with
 * the step's slug, the fixed question, and a safe-integer tentative number;
 * and `read` or `cancel` with a well-formed operation ID, whose operation the
 * product checks. A request that managed policy marks as needing a human
 * response, on itself or on its prompt, is refused, because the SDK forbids a
 * host's own approval of it. Every other tool, operation, or argument is
 * refused.
 * @param {Record<string, unknown>} request @param {Record<string, unknown>} invocation @param {ToolAllowance | null} tools
 * @returns {{relay: string} | {reason: string}}
 */
function matchToolCall(request, invocation, tools) {
  if (needsPerson(request, invocation)) return { reason: 'managed_approval_required' };
  if (!tools) return { reason: 'tool_not_allowed' };
  const args = isRecord(request.args) ? request.args : null;
  if (request.toolName === PROPOSE && tools.propose) {
    return args && canonical(args) === canonical(tools.propose) ? { relay: PROPOSE } : { reason: 'tool_args_not_allowed' };
  }
  if (request.toolName === CONVERSATION && tools.conversation) {
    const op = args && typeof args.op === 'string' ? args.op : '';
    if (!args || !tools.conversation.ops.includes(op)) return { reason: 'tool_op_not_allowed' };
    const exact = canonical(Object.keys(args).sort()) === canonical(CONVERSATION_FIELDS[op])
      && (op === 'begin_receive'
        || (op === 'begin_ask' && args.slug === tools.conversation.slug && args.question === QUESTION && Number.isSafeInteger(args.tentativeNumber))
        || ((op === 'read' || op === 'cancel') && typeof args.operationId === 'string' && UUID.test(args.operationId)));
    return exact ? { relay: `${CONVERSATION}.${op}` } : { reason: 'tool_args_not_allowed' };
  }
  return { reason: 'tool_not_allowed' };
}

/**
 * Decide one main-session permission request: an action the typed consent
 * covers, which the relay approves itself without asking anyone, or a
 * refusal with its reason. The consent covers the current step's exact Dude
 * tool calls (`matchToolCall`), and, while that step allows its session's own
 * workspace, a read of an absolute path that resolves to that folder itself
 * or below it (`inWorkspace`), counted as `WORKSPACE_READ`; each lives as long
 * as its step. It also covers the open phase's exact actions, each returned
 * with the `summary` of its exact effect, to which the relay binds its
 * approval while that phase is open (`PHASE_ACTIONS`). In the progress phase
 * that is only the progress file's exact edit, since its reads are the
 * workspace's. In the capture phase, by who requested it: A's root model may
 * run the inventory, hash, and publisher commands and read its temp folder,
 * and stages nothing itself (`staging_not_delegated`); the live Spec Lead
 * that the relay proved (`child`, `specLeadRequest`) may read the workspace
 * as `SPEC_LEAD_READ`, read that temp folder, or make one staging write, a
 * new file whose one complete preview (`fileEdits`) creates it, bound by its
 * text's size and SHA-256 (`newFileContents` must be that text, or become it
 * once its line ends are CRLF), and nothing else (`spec_lead_not_allowed`):
 * no command, Dude or other tool, or other kind. A request that managed
 * policy marks as needing a person is refused, never approved. Everything
 * else is refused: another session; a call neither the session's own root
 * model requested for the current admission nor that proved Spec Lead, any
 * other subagent's included; another kind, tool, operation, path, or
 * command; a broader or changed request; a sandbox bypass; a read outside the
 * allowed workspace that no phase covers (`outside_workspace`); or no open
 * phase or step.
 * @param {unknown} request @param {unknown} invocation
 * @param {{sessionId: string, requested: readonly string[], phase: 'progress' | 'capture' | 'closed', admission?: string | null,
 *   progress: {file: string, initial: string, final: string} | null,
 *   capture: {tempRoot: string, slug: string, advice: Record<string, unknown> | null, delegate?: SpecLeadNames} | null,
 *   tools?: ToolAllowance | null, child?: {agentId: string, taskCallId: string} | null}} allow
 *   `requested` holds the tool-call IDs the session's root model requested for the current admission, as its own events show: that of
 *   the step's allowance when one is set, and otherwise the phase's. `child` is the live Spec Lead the relay proved made the request;
 *   it counts only in the capture phase.
 * @returns {{relay: string, summary?: string} | {reason: string}} `relay` is the approval's `toolApprovals` key; a phase's action
 *   also has the `summary` of its exact effect.
 */
export function matchPermission(request, invocation, allow) {
  if (!isRecord(invocation) || invocation.sessionId !== allow.sessionId) return { reason: 'session_mismatch' };
  if (!isRecord(request) || typeof request.toolCallId !== 'string' || !request.toolCallId) return { reason: 'unidentified' };
  const child = allow.phase === 'capture' && allow.capture && allow.child ? allow.child : null;
  if (!child && !allow.requested.includes(request.toolCallId)) return { reason: 'not_model_requested' };
  if (request.requestSandboxBypass === true) return { reason: 'sandbox_bypass' };
  // The Spec Lead only reads and stages: it runs no command and calls no Dude or other tool.
  if (child && request.kind !== 'read' && request.kind !== 'write') return { reason: 'spec_lead_not_allowed' };
  const tools = allow.tools ?? null;
  if (request.kind === 'custom-tool') return matchToolCall(request, invocation, tools);
  const person = needsPerson(request, invocation);
  const workspace = request.kind === 'read' ? tools?.workspace ?? null : null;
  if (workspace && inWorkspace(workspace, request.path)) {
    return person ? { reason: 'managed_approval_required' } : { relay: child ? SPEC_LEAD_READ : WORKSPACE_READ };
  }
  /** A read outside the allowed workspace refuses as such; any other request with the phase's or the closed relay's own reason. @param {string} reason */
  const refused = (reason) => ({ reason: workspace ? 'outside_workspace' : reason });
  /**
   * One exact action of the open phase, bound to its effect, unless managed policy marks it as needing a person: the SDK forbids a host's
   * own approval of such a request. @param {string} relay @param {string} summary
   */
  const phaseAction = (relay, summary) => (person ? { reason: 'managed_approval_required' } : { relay, summary });
  if (allow.phase === 'progress' && allow.progress) {
    const { file, initial, final } = allow.progress;
    if (request.kind === 'write' && typeof request.fileName === 'string' && samePath(request.fileName, file)) {
      const edits = Array.isArray(request.fileEdits) ? request.fileEdits : [];
      const exact = edits.length === 1 && isRecord(edits[0]) && isRecord(edits[0].before) && isRecord(edits[0].after)
        && samePath(String(edits[0].before.path), file) && samePath(String(edits[0].after.path), file)
        && edits[0].before.content === initial && edits[0].after.content === final;
      return exact ? phaseAction(PHASE_ACTIONS.progressEdit, `edit ${file}: ${JSON.stringify(initial)} -> ${JSON.stringify(final)}`)
        : { reason: 'edit_not_exact' };
    }
    return refused('not_progress');
  }
  if (allow.phase === 'capture' && allow.capture) {
    const { tempRoot, slug, advice } = allow.capture;
    /**
     * A literal absolute path strictly inside the staging root. Only plain path
     * characters are accepted, so no shell expansion can change what runs.
     * @param {string} file
     */
    const staged = (file) => {
      const value = unquote(file);
      return /^[A-Za-z0-9:\\/._ -]+$/.test(value) && path.isAbsolute(value) && isWithin(tempRoot, path.resolve(value)) && !samePath(value, tempRoot);
    };
    if (request.kind === 'shell') {
      const command = typeof request.fullCommandText === 'string' ? request.fullCommandText.trim() : '';
      if (request.hasWriteFileRedirection === true || (Array.isArray(request.possibleUrls) && request.possibleUrls.length)) {
        return { reason: 'command_effects' };
      }
      if (command === INVENTORY_COMMAND) return phaseAction(PHASE_ACTIONS.command, `run ${command}`);
      const hash = HASH_COMMAND.exec(command);
      if (hash && staged(hash[1])) return phaseAction(PHASE_ACTIONS.command, `run ${command}`);
      const publish = PUBLISHER_COMMAND.exec(command);
      if (publish && unquote(publish[1]) === slug && staged(publish[2]) && staged(publish[3])) return phaseAction(PHASE_ACTIONS.command, `run ${command}`);
      return { reason: 'command_not_allowed' };
    }
    if (request.kind === 'write' && typeof request.fileName === 'string') {
      // Staging is the Spec Lead's alone: A's root model stages nothing itself.
      if (!child) return { reason: 'staging_not_delegated' };
      const target = path.resolve(request.fileName);
      // The approval names only this one file, but one request can write several (one `apply_patch` call can add many files): only a
      // complete preview (`fileEdits`) of exactly this file's creation is approved, and its text, which the runtime writes, is what is
      // bounded, checked, and bound to the approval. `newFileContents` must equal that text, or become it once its line ends are CRLF: native
      // run be16d55a-639b-4c7f-8606-9c345faadcf5's request for the ledger, which an earlier relay rule refused, previewed CRLF while
      // `newFileContents` kept the patch's LF text, and separate observations on the same host showed `apply_patch` Add File writing CRLF to disk.
      const edits = Array.isArray(request.fileEdits) ? request.fileEdits : [];
      const created = edits.length === 1 && isRecord(edits[0]) && edits[0].before === undefined && isRecord(edits[0].after)
        && typeof edits[0].after.path === 'string' && samePath(edits[0].after.path, request.fileName) && typeof edits[0].after.content === 'string';
      /** @type {string | null} */
      const content = created ? edits[0].after.content : null;
      const stated = request.newFileContents;
      if (!isWithin(tempRoot, target) || samePath(target, tempRoot) || content === null || typeof stated !== 'string'
        || (stated !== content && stated.replace(/\r?\n/g, '\r\n') !== content) || fs.existsSync(target)
        || Buffer.byteLength(content, 'utf8') > NATIVE_LIMITS.stagedBytes) {
        return { reason: 'staging_not_allowed' };
      }
      /** @type {unknown} */
      let staged = null;
      try {
        staged = JSON.parse(content);
      } catch {
        staged = null;
      }
      if (isRecord(staged) && Object.hasOwn(staged, 'operationId')) {
        const keys = Object.keys(staged).sort();
        const expected = advice ? [...Object.keys(advice), ...ADVICE_ADDED].sort() : [];
        const unchanged = advice && canonical(keys) === canonical(expected)
          && Object.keys(advice).every((key) => canonical(staged[key]) === canonical(advice[key]));
        if (!unchanged) return { reason: 'advice_changed' };
      }
      return phaseAction(PHASE_ACTIONS.specLeadStaging, `create ${target} (${Buffer.byteLength(content, 'utf8')} bytes, sha256 ${sha256(content)})`);
    }
    if (request.kind === 'read' && typeof request.path === 'string' && isWithin(tempRoot, path.resolve(request.path))) {
      return phaseAction(child ? PHASE_ACTIONS.specLeadRead : PHASE_ACTIONS.read, `read ${path.resolve(request.path)}`);
    }
    return refused('not_capture');
  }
  return refused('not_pending');
}

/**
 * The cancellation exchange: A's model cancelled after the cue, within one
 * second, with possible prior delivery reported; A's journal ended cancelled
 * with no reply; B's worker was held, read no evidence, wrote no reply, and
 * recorded cleanup.
 * @param {{call: any, cueAt: number, aRecords: any[], bRecords: any[]}} input
 */
export function checkCancellation({ call, cueAt, aRecords, bRecords }) {
  /** @type {string[]} */
  const problems = [];
  if (!call) return ['cancel_not_called'];
  if (call.start.ts === null || call.start.ts < cueAt) problems.push('cancel_before_cue');
  if (!(call.complete.ts - call.start.ts <= NATIVE_LIMITS.immediateMs)) problems.push('cancel_slow');
  const result = call.result;
  if (!isRecord(result) || result.outcome !== 'cancelled' || result.reason !== 'cancelled' || result.delivery !== 'may_have_occurred'
    || result.cancelled !== true) {
    problems.push('cancel_result');
  }
  const aKinds = aRecords.map((record) => record.kind);
  if (canonical(aKinds) !== canonical(['opened', 'accepted', 'request_prepared', 'request_write_started', 'terminal', 'closed'])) problems.push('a_kinds');
  const aTerminal = recordsOf(aRecords, 'terminal')[0]?.data;
  if (aTerminal?.outcome !== 'cancelled' || aTerminal?.delivery !== 'may_have_occurred') problems.push('a_terminal');
  const bKinds = bRecords.map((record) => record.kind);
  if (!bKinds.includes('worker_evidence_pending') || bKinds.includes('evidence_returned') || bKinds.includes('reply_write_started')
    || !bKinds.includes('cleanup') || bKinds.at(-1) !== 'closed') {
    problems.push('b_kinds');
  }
  if (!['cancelled', 'failed', 'timeout'].includes(recordsOf(bRecords, 'terminal')[0]?.data?.outcome)) problems.push('b_terminal');
  return problems;
}

// ---------------------------------------------------------------------------
// The fixed Windows observer: its client and the analysis of its bounded summaries.
// ---------------------------------------------------------------------------

/** The closed path-class names the observer accepts. `payload` is the plan's one runtime payload file. */
export const OBSERVER_CLASSES = Object.freeze(['system', 'runtime', 'payload', 'node', 'sdk', 'repository', 'real_home', 'owner', 'fixture', 'proof',
  'a_side', 'a_workspace', 'a_home', 'a_config', 'a_temp', 'b_side', 'b_workspace', 'b_home', 'b_config', 'b_temp',
  'k_side', 'k_workspace', 'k_home', 'k_config', 'k_temp']);
const WRITE_OPS = new Set(['create', 'write', 'delete', 'rename']);
/**
 * What each process role may touch by path class. The worker gets nothing
 * beyond shared reads and devices here; its own storage folder is judged by
 * area and documented session purpose in `accessViolations`.
 */
const ROLE_ACCESS = Object.freeze({
  helper: { read: [...SHARED_READ, 'proof'], write: [...SHARED_WRITE, 'proof'] },
  control: { read: [...SHARED_READ, 'k_side', 'k_workspace', 'k_home', 'k_config', 'k_temp'],
    write: [...SHARED_WRITE, 'k_side', 'k_workspace', 'k_home', 'k_config', 'k_temp'] },
  a: { read: [...SHARED_READ, 'owner', 'a_side', 'a_workspace', 'a_home', 'a_config', 'a_temp'],
    write: [...SHARED_WRITE, 'a_side', 'a_workspace', 'a_home', 'a_config', 'a_temp'] },
  b: { read: [...SHARED_READ, 'owner', 'fixture', 'b_side', 'b_workspace', 'b_home', 'b_config', 'b_temp'],
    write: [...SHARED_WRITE, 'b_side', 'b_workspace', 'b_home', 'b_config', 'b_temp'] },
  worker: { read: [...SHARED_READ], write: [...SHARED_WRITE] },
});

/**
 * The observer's closed input for this run.
 * @param {{runId: string, rootPid: number, layout: Layout, scope: any, repoRoot: string, homeDir: string, systemRoot: string, output: string}} input
 */
export function observerInput({ runId, rootPid, layout, scope, repoRoot, homeDir, systemRoot, output }) {
  const { values } = scope;
  /** @type {Record<string, string[]>} */
  const roots = {
    system: [systemRoot],
    runtime: [...new Set([path.dirname(values.cli), path.dirname(values.runtimePayload)])],
    // A file root: the longest match wins, so the payload is told apart from the rest of its folder.
    payload: [values.runtimePayload],
    node: [path.dirname(process.execPath)],
    sdk: [values.sdk],
    repository: [repoRoot],
    real_home: [homeDir],
    owner: [values.tls.a.certFile, values.tls.a.keyFile, values.tls.b.certFile, values.tls.b.keyFile, values.credentials.a, values.credentials.b,
      values.credentials.worker],
    fixture: [layout.fixture],
    proof: [layout.proof],
    a_side: [layout.a.root], a_workspace: [layout.a.workspace], a_home: [layout.a.home], a_config: [layout.a.config], a_temp: [layout.a.temp],
    b_side: [layout.b.root], b_workspace: [layout.b.workspace], b_home: [layout.b.home], b_config: [layout.b.config], b_temp: [layout.b.temp],
    k_side: [layout.control.root], k_workspace: [layout.control.workspace], k_home: [layout.control.home], k_config: [layout.control.config],
    k_temp: [layout.control.temp],
  };
  return {
    version: 1,
    runId,
    rootPid,
    output,
    classes: OBSERVER_CLASSES.map((name) => ({ name, roots: roots[name] })),
    canaries: CANARIES.map((canary) => `${canary.location}/${canary.path}`),
    workerParent: layout.b.temp,
    controlRoots: { work: layout.control.workspace, config: layout.control.config, home: layout.control.home },
    limits: { processes: NATIVE_LIMITS.processes, summaryBytes: NATIVE_LIMITS.observerBytes },
  };
}

/**
 * @typedef {object} ObserverHandle
 * @property {number | null} pid
 * @property {Promise<{ok: true} | {ok: false, reason: string}>} ready Settles within `NATIVE_LIMITS.observerMs` on the clock.
 * @property {() => Promise<any>} snapshot One synchronized summary; stops the run when the observer does not answer.
 * @property {() => Promise<{summary: any, reason: string | null, exit: {exited: boolean, code: number | null}}>} stop
 *   The final stop: the drained final summary (or why there is none) and the helper's actual exit. Never throws.
 * @property {(ms: number) => Promise<{exited: boolean, code: number | null}>} close
 *   End the protocol with EOF, which makes the helper end its session and exit, and wait up to `ms` for that exit.
 */

/**
 * Start the fixed observer under Windows PowerShell with one closed input
 * file. The handle is returned at once, before readiness, so this run owns the
 * helper and its pipes from the moment it exists: a missing or late `ready`
 * line, a refusal, or a later failure all end with `close` or `stop`, an EOF
 * and a bounded wait for the helper's actual exit. Nothing here kills it; an
 * exit not seen within the bound is reported unconfirmed. Replies are bounded
 * JSON lines, and every wait polls `clock`.
 * @param {{inputFile: string, proof: string, systemRoot: string, spawnProcess?: typeof spawn, clock?: () => number}} options
 * @returns {ObserverHandle}
 */
export function startObserver({ inputFile, proof, systemRoot, spawnProcess = spawn, clock = Date.now }) {
  const executable = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const temp = path.join(proof, 'observer-temp');
  fs.mkdirSync(temp, { recursive: true });
  const child = spawnProcess(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', OBSERVER_SCRIPT,
    '-InputFile', inputFile], {
    env: { SystemRoot: systemRoot, windir: systemRoot, TEMP: temp, TMP: temp, PATH: path.join(systemRoot, 'System32') },
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  /** @type {any[]} */
  const replies = [];
  let buffered = '';
  /** @type {{code: number | null} | null} */
  let exit = null;
  let inputEnded = false;
  /** @type {'starting' | 'ready' | 'refused' | 'stopping'} */
  let state = 'starting';
  let marker = 0;
  child.stdout?.setEncoding('utf8').on('data', (/** @type {string} */ chunk) => {
    buffered += chunk;
    if (buffered.length > NATIVE_LIMITS.observerBytes * 2) {
      buffered = '';
      replies.push({ event: 'refused', reason: 'observer_overflow' });
      return;
    }
    for (let index = buffered.indexOf('\n'); index >= 0; index = buffered.indexOf('\n')) {
      const line = buffered.slice(0, index).trim();
      buffered = buffered.slice(index + 1);
      if (!line) continue;
      try {
        replies.push(JSON.parse(line));
      } catch {
        replies.push({ event: 'refused', reason: 'observer_unavailable' });
      }
    }
  });
  child.once('error', () => { exit ??= { code: null }; });
  child.once('close', (/** @type {unknown} */ code) => { exit ??= { code: typeof code === 'number' ? code : null }; });
  /** The next reply within `ms`, `exited` once the helper ended, or `timeout`. @param {number} ms @returns {Promise<any>} */
  const next = async (ms) => {
    const until = clock() + ms;
    for (;;) {
      if (replies.length) return replies.shift();
      if (exit) return { event: 'exited' };
      if (clock() >= until) return { event: 'timeout' };
      await delay(NATIVE_LIMITS.pollMs);
    }
  };
  /** @param {number} ms */
  const close = async (ms) => {
    if (!inputEnded) {
      inputEnded = true;
      try {
        child.stdin?.end();
      } catch {
        // The pipe may already be gone; the exit wait below still decides.
      }
    }
    const until = clock() + ms;
    while (!exit && clock() < until) await delay(NATIVE_LIMITS.pollMs);
    return exit ? { exited: true, code: /** @type {{code: number | null}} */ (exit).code } : { exited: false, code: null };
  };
  const ready = next(NATIVE_LIMITS.observerMs).then((reply) => {
    if (reply?.event === 'ready') {
      state = 'ready';
      return /** @type {const} */ ({ ok: true });
    }
    state = 'refused';
    const reason = reply?.event === 'refused' && typeof reply.reason === 'string' && NATIVE_REASONS.includes(reply.reason)
      ? reply.reason : 'observer_unavailable';
    return /** @type {const} */ ({ ok: false, reason });
  });
  /**
   * One synchronized request: a fresh marker file is created by this process,
   * and the observer answers once it has seen that create, so every earlier
   * event of this process is in the reply.
   * @param {'snapshot' | 'stop'} op @param {number} ms
   */
  const request = async (op, ms) => {
    marker += 1;
    writeNew(path.join(proof, `m${marker}.txt`), `${marker}\n`);
    child.stdin?.write(`${JSON.stringify({ op, marker })}\n`);
    return next(ms);
  };
  const snapshot = async () => {
    if (state !== 'ready') return stop('observer_coverage_lost', 'the observer is not ready');
    const reply = await request('snapshot', NATIVE_LIMITS.observerMs);
    if (reply?.event !== 'snapshot' || !isRecord(reply.summary)) {
      return stop(reply?.reason === 'observer_overflow' ? 'observer_overflow' : 'observer_coverage_lost', 'the observer did not answer snapshot');
    }
    return reply.summary;
  };
  const stopObserver = async () => {
    /** @type {any} */
    let reply = null;
    if (state === 'ready') {
      state = 'stopping';
      try {
        // The helper waits for the marker, stops its session, and drains it within its own bounds before it answers.
        reply = await request('stop', NATIVE_LIMITS.observerMs + NATIVE_LIMITS.cleanupMs);
      } catch {
        reply = null;
      }
    }
    const exited = await close(NATIVE_LIMITS.observerExitMs);
    const summary = reply?.event === 'stopped' && isRecord(reply.summary) ? reply.summary : null;
    return { summary, reason: summary ? null : reply?.reason === 'observer_overflow' ? 'observer_overflow' : 'observer_coverage_lost', exit: exited };
  };
  return { pid: child.pid ?? null, ready, snapshot, stop: stopObserver, close };
}

/**
 * The observer's process identities as a tree. Identity is (pid, creation
 * time); lineage is fixed at creation, so orphaned or reparented descendants
 * stay where they started.
 * @param {any} summary
 */
export function processTree(summary) {
  /** @type {Map<string, {key: string, pid: number, parent: string | null, image: string, createdAt: number, exitedAt: number | null, exitCode: number | null, pinned: boolean, children: string[]}>} */
  const nodes = new Map();
  for (const entry of Array.isArray(summary?.processes) ? summary.processes : []) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.pid !== 'number') continue;
    nodes.set(entry.key, {
      key: entry.key,
      pid: entry.pid,
      parent: typeof entry.parent === 'string' ? entry.parent : null,
      image: typeof entry.image === 'string' ? entry.image : '',
      createdAt: typeof entry.created === 'string' ? Date.parse(entry.created) : Number.NaN,
      exitedAt: typeof entry.exited === 'string' ? Date.parse(entry.exited) : null,
      exitCode: typeof entry.exitCode === 'number' ? entry.exitCode : null,
      pinned: entry.pinned === true,
      children: [],
    });
  }
  for (const node of nodes.values()) if (node.parent && nodes.has(node.parent)) nodes.get(node.parent)?.children.push(node.key);
  return nodes;
}
/** @typedef {ReturnType<typeof processTree>} ProcessTree */

/** Every identity descended from `key`, itself included. @param {ProcessTree} tree @param {string} key */
export function descendantsOf(tree, key) {
  /** @type {Set<string>} */
  const found = new Set();
  const stack = [key];
  while (stack.length) {
    const current = /** @type {string} */ (stack.pop());
    if (found.has(current) || !tree.has(current)) continue;
    found.add(current);
    stack.push(...(tree.get(current)?.children ?? []));
  }
  return found;
}

/** The one live identity with this pid, or null when none or several match. @param {ProcessTree} tree @param {number} pid */
export function liveByPid(tree, pid) {
  const live = [...tree.values()].filter((node) => node.pid === pid && node.exitedAt === null);
  return live.length === 1 ? live[0] : null;
}

/**
 * Whether a runtime's own process subtree opened or read the `payload` class:
 * the plan's runtime payload file, which its scope hashed.
 * @param {any} summary @param {ProcessTree} tree @param {string} runtimeKey
 */
export function payloadObserved(summary, tree, runtimeKey) {
  const members = descendantsOf(tree, runtimeKey);
  return (Array.isArray(summary?.files) ? summary.files : []).some((/** @type {any} */ row) => row.class === 'payload' && members.has(row.process)
    && (row.op === 'open' || row.op === 'read') && row.count > 0);
}

/**
 * Health problems that invalidate an observation: lost, undecodable, or
 * unattributed events, identity gaps (an unpinned identity among them), missed
 * markers, and overflow. The root's own unattributed I/O is not checked,
 * because nothing about the root is. A final summary must also show that the
 * session stopped, its consumer returned, and every buffered event drained.
 * @param {any} summary @param {{final?: boolean}} [options] @returns {string[]}
 */
export function observerHealth(summary, { final = false } = {}) {
  const health = isRecord(summary?.health) ? summary.health : null;
  if (!health) return ['health_missing'];
  /** @type {string[]} */
  const problems = [];
  for (const key of ['eventsLost', 'buffersLost', 'realTimeBuffersLost', 'decodeFailures', 'identityGaps', 'unattributed', 'markersMissed']) {
    if (health[key] !== 0) problems.push(key);
  }
  if (health.overflow !== false) problems.push('overflow');
  if (final) {
    const end = isRecord(summary.final) ? summary.final : null;
    if (!end || end.stopStatus !== 0 || end.joined !== true || end.consumerStatus !== 0 || end.drained !== true) problems.push('drain_incomplete');
  }
  return problems;
}

/**
 * The calibration helper must appear as this process's child with its image,
 * pinned like the root, write and read the calibration file in the proof
 * folder, and exit.
 * @param {any} summary @param {{rootKey: string, helperPid: number, image: string}} expected @returns {string[]}
 */
export function checkCalibration(summary, { rootKey, helperPid, image }) {
  const tree = processTree(summary);
  const helper = [...tree.values()].find((node) => node.pid === helperPid && node.parent === rootKey);
  if (!helper) return ['helper_not_observed'];
  /** @type {string[]} */
  const problems = [...observerHealth(summary)];
  if (!tree.get(rootKey)?.pinned) problems.push('root_unpinned');
  if (!helper.pinned) problems.push('helper_unpinned');
  if (!samePath(helper.image, image)) problems.push('helper_image');
  if (helper.exitedAt === null) problems.push('helper_exit');
  const ops = new Set((summary.files ?? []).filter((/** @type {any} */ row) => row.process === helper.key && row.class === 'proof' && row.count > 0)
    .map((/** @type {any} */ row) => row.op));
  if (!ops.has('create') && !ops.has('write')) problems.push('helper_write');
  if (!ops.has('read')) problems.push('helper_read');
  return problems;
}

/**
 * Every access, identity, and child image of the owned processes that their
 * role does not allow. Roles map identity keys to `helper`, `control`, `a`,
 * `b`, `worker`, or `root` (this runner, which is not checked). Below its own
 * folder, a worker's every access is judged, reads and opens as well as
 * writes: it may read its working folder, never write it; it may do anything
 * in its approved temporary area, the one its TEMP, TMP, and TMPDIR name,
 * which grants no persistence; it may open the folder itself; and in its
 * configuration and home storage every access must serve a documented
 * per-session purpose of the session workspace that worker recorded, which
 * `workspaces` holds by folder name once its startup release validated it
 * (`documentedSessionAccess`); with observed absence, or before that, there is
 * none. A worker's own folder is the one `workerDirs` names for its process,
 * compared without case on Windows; any other is foreign. Any other access
 * there, including one to the runtime's own settings
 * or to a path the observer could not read as one plain spelling, is storage
 * this run cannot classify by purpose; a write to its working folder, any
 * canary, or another folder is a forbidden effect. Every worker process image
 * must be exactly one of `workerImages`; a shell is named as such, and folder
 * membership never verifies an image. An identity that is not pinned proves
 * nothing.
 * @param {any} summary @param {Map<string, string>} roles
 * @param {{workerDirs: Map<string, string>, workerImages: readonly string[], workspaces?: Map<string, string | null>}} worker
 * @returns {{forbidden: string[], unclassified: string[], canary: string[], identity: string[]}}
 */
export function accessViolations(summary, roles, { workerDirs, workerImages, workspaces = new Map() }) {
  /** @type {{forbidden: string[], unclassified: string[], canary: string[], identity: string[]}} */
  const found = { forbidden: [], unclassified: [], canary: [], identity: [] };
  for (const node of processTree(summary).values()) {
    const role = roles.get(node.key);
    if (!role) {
      found.forbidden.push(`${node.key}:unassigned_process`);
      continue;
    }
    if (!node.pinned) found.identity.push(`${role}:unpinned_process`);
    if (role !== 'worker') continue;
    const image = path.win32.basename(node.image).toLowerCase();
    if (SHELL_IMAGES.includes(image)) found.forbidden.push(`worker:shell_child:${image}`);
    else if (!node.image || !workerImages.some((allowed) => samePath(allowed, node.image))) found.forbidden.push('worker:unverified_image');
  }
  for (const row of Array.isArray(summary?.files) ? summary.files : []) {
    const role = roles.get(row.process);
    if (!role || role === 'root') continue;
    const access = ROLE_ACCESS[/** @type {keyof typeof ROLE_ACCESS} */ (role)];
    const allowed = WRITE_OPS.has(row.op) ? access.write : access.read;
    if (!allowed.includes(row.class)) found.forbidden.push(`${role}:${row.class}:${row.op}`);
  }
  for (const row of Array.isArray(summary?.workerDirs) ? summary.workerDirs : []) {
    const role = roles.get(row.process);
    // B's extension creates each worker's folder and copies its fixture there.
    if (!role || role === 'root' || role === 'b') continue;
    if (role !== 'worker') {
      found.forbidden.push(`${role}:worker_storage:${row.op}`);
      continue;
    }
    // The observer names a worker folder in whatever case the accessing path spelled it; Windows folder names compare without case.
    const own = workerDirs.get(row.process);
    if (typeof own !== 'string' || typeof row.dir !== 'string' || foldPath(own) !== foldPath(row.dir)) {
      found.forbidden.push(`worker:foreign_storage:${row.op}`);
      continue;
    }
    if (row.area === 'work') {
      if (WRITE_OPS.has(row.op)) found.forbidden.push(`worker:work_write:${row.op}`);
    } else if (!workerStorageAllowed(row, workspaces.get(own))) {
      found.unclassified.push(`worker:${row.area}:${row.op}`);
    }
  }
  for (const row of Array.isArray(summary?.canaries) ? summary.canaries : []) {
    const role = roles.get(row.process);
    if (role === 'worker' || (row.scope === 'control' && role !== 'control' && role !== 'root')) found.canary.push(`${role}:${row.path}:${row.op}`);
  }
  for (const row of Array.isArray(summary?.unclassified) ? summary.unclassified : []) {
    const role = roles.get(row.process);
    if (!role || role === 'root') continue;
    if (role === 'worker' || WRITE_OPS.has(row.op)) found.unclassified.push(`${role}:${row.op}`);
  }
  return found;
}

/**
 * Whether every identity in `keys` is present, pinned, and exited no later
 * than `windowMs` after `since`, the cleanup start this window belongs to. An
 * exit before `since` ended before that cleanup began and is within it. A
 * survivor, a late exit, a missing or unpinned identity, or no valid `since`
 * leaves cessation unconfirmed; parent exit alone never stands for its tree.
 * @param {ProcessTree} tree @param {Iterable<string>} keys @param {{since: number, windowMs: number}} bound
 */
export function checkCessation(tree, keys, { since, windowMs }) {
  let running = 0;
  let late = 0;
  let unpinned = 0;
  let missing = 0;
  let maxMs = 0;
  for (const key of keys) {
    const node = tree.get(key);
    if (!node) {
      missing += 1;
      continue;
    }
    if (!node.pinned) unpinned += 1;
    if (node.exitedAt === null || !Number.isFinite(node.exitedAt)) {
      running += 1;
      continue;
    }
    const ms = node.exitedAt - since;
    if (ms > maxMs) maxMs = ms;
    if (!(ms <= windowMs)) late += 1;
  }
  const ok = Number.isFinite(since) && running === 0 && late === 0 && unpinned === 0 && missing === 0;
  return { ok, running, late, unpinned, missing, maxMs };
}

// ---------------------------------------------------------------------------
// The native run: fixed prompts and the phases that use the public SDK.
// ---------------------------------------------------------------------------

/** @param {string} configPath @param {string} profileId */
export function proposePrompt(configPath, profileId) {
  return [
    'Feature 089 native qualification, proposal step.',
    `Call dude_a2a_propose exactly once with configPath ${JSON.stringify(configPath)} and profileId ${JSON.stringify(profileId)}.`,
    'Then stop. The human operator reviews the complete native result and types any approval; do not approve, repeat the approval line, '
      + 'or call any other tool.',
  ].join('\n');
}

/**
 * The whole instruction for one main's exchange, given before its operation
 * begins; no root prompt follows while the operation is pending.
 * @param {'receive' | 'ask' | 'receive-cancel' | 'ask-cancel'} kind @param {{slug: string, progressFile: string}} values
 */
export function exchangePrompt(kind, { slug, progressFile }) {
  const intro = 'Feature 089 native qualification. Do every step below in this one turn, in order, and nothing else. '
    + 'Do not ask questions or wait for new chat input.';
  const poll = (file, word) => `Repeat this pair up to 60 times: call dude_a2a_conversation with {"op":"read","operationId":"<that operationId>"}; `
    + `then use the view tool on ${file} in this workspace. Stop repeating as soon as ${file} exists and contains exactly the line ${word}.`;
  const progress = `Maintain your own synthetic progress fixture: use your file edit tool on ${progressFile} to replace the word pending with the `
    + 'word complete, keeping the line ending. Do this exactly once; it is unrelated to the conversation.';
  const finish = 'Then call read with the same operationId until its outcome is no longer pending, up to 60 more times.';
  const tentative = 'Your tentative number is one more than the highest lifecycle number among the files in this workspace\'s .dude/ideas folder; '
    + 'view that folder to find it.';
  const ask = (askSlug) => `Call dude_a2a_conversation once with {"op":"begin_ask","slug":"${askSlug}","tentativeNumber":<your tentative number>,`
    + `"question":"${QUESTION}"}. Keep its operationId.`;
  /** @type {string[]} */
  const steps = kind === 'receive' ? [
    'Call dude_a2a_conversation with {"op":"begin_receive"} once. Keep its operationId.', poll(progressFile, 'pending'), progress, finish,
    'Finish with one sentence naming the final outcome. Never call cancel, begin another operation, or use any other tool.',
  ] : kind === 'ask' ? [
    tentative, ask(slug), poll(progressFile, 'pending'), progress, finish,
    'Finish with one sentence naming the final outcome. Do not capture, stage, or publish anything yet; do not cancel or begin another operation.',
  ] : kind === 'receive-cancel' ? [
    'Call dude_a2a_conversation with {"op":"begin_receive"} once. Keep its operationId.',
    'Call read with that operationId until its outcome is no longer pending, up to 90 times.',
    'Finish with one sentence naming the final outcome. Never call cancel, begin another operation, or use any other tool.',
  ] : [
    tentative, ask(slug), poll(CANCEL_CUE.path, 'cancel'),
    'Then call dude_a2a_conversation with {"op":"cancel","operationId":"<that operationId>"} once.',
    'Then call read with the same operationId once.',
    'Finish with one sentence naming the final outcome. Do not begin another operation.',
  ];
  return [intro, ...steps.map((step, index) => `${index + 1}. ${step}`)].join('\n');
}

/**
 * The capture instruction: A's normal first capture with the owner
 * separation its procedure gives it (.github/skills/dude-feature-definition
 * SKILL.md, `## Brainstorm`). A's root model decides whether to use the
 * advice and runs the inventory, the one fixed hash, and the publisher; the
 * installed Spec Lead stages the ledger in one direct synchronous task and the
 * advice in a second, each as its own new file in one new folder in this
 * session's temporary directory, and runs nothing. It names that folder, the
 * canonical workspace, the exact commands, and the name A's task tool selects
 * the Spec Lead by, because the relay approves no other command and
 * attributes no other agent's request (`specLeadRequest`); it never names the
 * peer's records or a number. It says that the relay itself approves reads
 * of this workspace, by A or by the Spec Lead, so that A lets the Spec Lead
 * read its definition skill, project memory, and conventions before it
 * stages, as its procedure requires, and which other requests it approves.
 * @param {string} operationId @param {string} slug
 * @param {{tempRoot: string, workspace: string, specLead: string, named?: boolean}} where
 *   `specLead` is the Spec Lead's name for the task tool, and `named` whether that tool takes a `name` argument (`specLeadOf`), which
 *   the native task tool requires: only then is each task given its fixed short name, "stage-ledger" or "stage-advice".
 */
export function capturePrompt(operationId, slug, { tempRoot, workspace, specLead, named = false }) {
  const agent = `agent_type ${JSON.stringify(specLead)}`;
  /** The task call of one staging step. @param {string} name */
  const task = (name) => `your task tool, with ${named ? `name ${JSON.stringify(name)}, ${agent}, and` : `${agent} and`} mode "sync"`;
  return [
    'Feature 089 native qualification, capture step.',
    `Operation ${operationId} ended with peer number advice for the slug ${slug}.`,
    `Decide explicitly whether to use that advice for the first capture of a new idea with slug ${slug} and this idea text: "${IDEA_TEXT}"`,
    'If you decide not to use it, capture nothing and give the reason. If you decide to use it, capture that idea now through your normal '
      + 'first-capture procedure, passing that operation\'s advice.capture as the number advice, in this order, and report the captured path:',
    `1. Run the inventory command exactly: ${INVENTORY_COMMAND}`,
    `2. Delegate staging the ledger to the installed Spec Lead with one synchronous call of ${task('stage-ledger')}. It creates the draft ledger as `
      + `one new UTF-8 file in one new folder directly under this session's temporary directory ${tempRoot}, with its own file creation call; it `
      + 'writes nothing in the workspace and runs no command.',
    `3. This workspace's canonical root is ${workspace}, and the reason for using the advice is yours to write. Hash the staged ledger yourself `
      + 'by running exactly (Get-FileHash -Algorithm SHA256 -LiteralPath \'<absolute staged ledger path>\').Hash.ToLowerInvariant()',
    `4. Delegate staging the advice to the Spec Lead with a second synchronous call of ${task('stage-advice')}, giving it advice.capture unchanged `
      + 'with that ledgerSha256, that workspace, and your reason. It creates the advice JSON as a second new file in the same folder, with its own '
      + 'file creation call, and runs no command.',
    `5. Run the publisher yourself: node .github/skills/dude-feature-definition/publish-first-capture.mjs --root . --slug ${slug} `
      + '--stage <absolute staged ledger path> --number-advice <absolute staged advice path>',
    'Only you run commands, and you stage nothing yourself; the Spec Lead only stages and starts no agent of its own, and nothing runs in the '
      + 'background or in parallel.',
    'Reads of this workspace, by you or by the Spec Lead (for example, its definition skill, project memory, and conventions), are approved '
      + 'automatically.',
    'So are the inventory command, that hash command, the publisher command, the Spec Lead\'s two new staging files, and reads of the staging '
      + 'folder; anything else, including removing the staging folder, is refused, so leave the folder in place.',
    'Each Spec Lead task must let the Spec Lead follow its normal procedure, including those workspace reads, before it stages; do not restrict '
      + 'the Spec Lead\'s reads to the staging folder.',
    'Do not begin, read, or cancel any A2A operation.',
  ].join('\n');
}

/**
 * Inspect and import the plan's public SDK entry, unchanged since the scope
 * bound its bytes. The qualifier's own import proves nothing about what the
 * extension or worker loaded; their records and the observer do.
 * @param {any} scope
 */
export async function loadPlanSdk(scope) {
  const entry = scope.artifacts.sdk.index;
  const check = () => {
    const stat = fs.lstatSync(entry.path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== entry.bytes || sha256(fs.readFileSync(entry.path)) !== entry.sha256) {
      stop('sdk_artifact_changed', 'the SDK entry changed after the scope bound it');
    }
  };
  check();
  /** @type {any} */
  const api = await import(pathToFileURL(entry.path).href);
  check();
  if (typeof api.CopilotClient !== 'function' || typeof api.RuntimeConnection?.forStdio !== 'function') {
    return stop('sdk_unsupported', 'the SDK has no CopilotClient or RuntimeConnection.forStdio');
  }
  return api;
}

/**
 * Run the fixed calibration helper: this Node, a fixed inline program that
 * creates, writes, and reads one control file and exits.
 * @param {string} file @returns {Promise<{pid: number}>}
 */
export function runCalibrationHelper(file) {
  const program = 'const fs=require("node:fs");const f=process.argv[1];fs.writeFileSync(f,"dude-a2a-calibration\\n",{flag:"wx"});'
    + 'process.exitCode=fs.readFileSync(f,"utf8")==="dude-a2a-calibration\\n"?0:3;';
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', program, file],
      { cwd: path.dirname(file), stdio: 'ignore', windowsHide: true, env: { SystemRoot: process.env.SystemRoot ?? '' } });
    const timer = setTimeout(() => reject(new NativeStop('observer_calibration_failed', 'the calibration helper did not exit')), 10_000);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new NativeStop('observer_calibration_failed', 'the calibration helper did not start'));
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0 && typeof child.pid === 'number') resolve({ pid: child.pid });
      else reject(new NativeStop('observer_calibration_failed', 'the calibration helper failed'));
    });
  });
}

/**
 * Whether one reported instruction source shows a documented type and
 * location for the fixed instruction canary at `relative` at this stage
 * (`CONTROL_SOURCE_KINDS`): `scan` for the model-less discovery before any
 * view, `afterView` for the after-view session's loaded sources. Only explicit
 * equality with a value listed for that file and stage counts, so a missing,
 * empty, unknown, or other file's value never does, nor does any value for a
 * file that is no fixed instruction canary.
 * @param {string} relative @param {Record<string, unknown>} entry @param {'scan' | 'afterView'} stage
 */
function documentedKind(relative, entry, stage) {
  const kinds = Object.hasOwn(CONTROL_SOURCE_KINDS, relative) ? CONTROL_SOURCE_KINDS[/** @type {keyof typeof CONTROL_SOURCE_KINDS} */ (relative)][stage] : null;
  return kinds !== null && kinds.locations.includes(/** @type {any} */ (entry.location)) && kinds.types.includes(/** @type {any} */ (entry.type));
}

/**
 * Recognition of every required synthetic canary form, from parsed public
 * discovery answers only. Each form is matched at its exact canonical
 * location with its own parsed identity: an agent's stable ID, name, and
 * source; an instruction source's content digest (computed here, never kept),
 * the type and location documented for that file before any view
 * (`documentedKind`), and, for the path-specific form, its `applyTo`;
 * a hook's origin, type, project, and enabled state with no load errors; a
 * skill's name, source, and enabled state with no load errors; an MCP
 * declaration's effective source file and source in each of its two contexts;
 * and the control session's own Git context. A file access, a name alone, or a
 * source-label suffix is never recognition, and no form stands in for another
 * of the same kind. On-demand discovery after a successful view is not a
 * model-less form; the after-view control establishes it separately.
 * @param {Record<string, any>} results Each discovery answer, or null when its call failed.
 * @param {{work: string, config: string, home: string, temp: string}} folders The control side's folders.
 * @param {{sessionId: string}} context
 * @returns {{rows: Array<{form: string, path: string | null, status: string, reason: string | null}>, failed: string[]}}
 */
export function canaryRecognition(results, folders, { sessionId }) {
  /** @type {Array<{form: string, path: string | null, status: string, reason: string | null}>} */
  const rows = [];
  /** @param {string} form @param {string | null} where @param {string | null} problem */
  const add = (form, where, problem) => rows.push({ form, path: where, status: problem ? 'unrecognized' : 'recognized', reason: problem });
  /** @param {string} relative */
  const canaryOf = (relative) => /** @type {any} */ (CANARIES.find((canary) => canary.path === relative));
  /** @param {any} canary */
  const fileOf = (canary) => path.join(folders[/** @type {'work' | 'config' | 'home'} */ (canary.location)], ...canary.path.split('/'));
  /** @param {unknown} value @param {string} key @returns {any[] | null} */
  const list = (value, key) => (isRecord(value) && Array.isArray(value[key]) ? value[key] : null);
  /** @param {unknown} value @param {string} file */
  const isFile = (value, file) => typeof value === 'string' && path.isAbsolute(value) && samePath(value, file);
  /**
   * The rows of one answer naming exactly `file`, or why there is no single parsed match.
   * @param {any[] | null} entries @param {(entry: any) => boolean} matches @returns {{entry: any} | {problem: string}}
   */
  const single = (entries, matches) => {
    if (!entries) return { problem: 'query_failed' };
    const found = entries.filter((entry) => isRecord(entry) && matches(entry));
    return found.length === 1 ? { entry: found[0] } : { problem: found.length ? 'ambiguous' : 'not_found' };
  };

  for (const [form, relative, source] of /** @type {Array<[string, string, string]>} */ ([
    ['agent:project', '.github/agents/dude-canary.agent.md', 'project'], ['agent:user', 'agents/dude-canary-user.agent.md', 'user']])) {
    const canary = canaryOf(relative);
    const file = fileOf(canary);
    const name = /^name: (\S+)$/m.exec(canary.content)?.[1];
    const match = single(list(results.agents, 'agents'), (entry) => isFile(entry.path, file));
    add(form, `${canary.location}/${relative}`, 'problem' in match ? match.problem
      : match.entry.source === source && match.entry.name === name && typeof match.entry.id === 'string' && match.entry.id ? null : 'mismatch');
  }

  const sources = list(results.instructions, 'sources');
  for (const [form, relative, applyTo] of /** @type {Array<[string, string, string[] | null]>} */ ([
    ['instructions:copilot', '.github/copilot-instructions.md', null], ['instructions:agents', 'AGENTS.md', null],
    ['instructions:path_specific', '.github/instructions/dude-canary.instructions.md', ['**']]])) {
    const canary = canaryOf(relative);
    const file = fileOf(canary);
    const named = sources?.filter((entry) => isRecord(entry) && typeof entry.sourcePath === 'string'
      && samePath(path.resolve(typeof entry.projectPath === 'string' ? entry.projectPath : folders.work, entry.sourcePath), file)) ?? null;
    /** @param {any} entry */
    const valid = (entry) => documentedKind(relative, entry, 'scan') && typeof entry.content === 'string' && sha256(entry.content) === sha256(canary.content)
      && (applyTo ? canonical(entry.applyTo) === canonical(applyTo) : entry.applyTo === undefined || (Array.isArray(entry.applyTo) && !entry.applyTo.length));
    add(form, `${canary.location}/${relative}`, !named ? 'query_failed' : !named.length ? 'not_found' : named.every(valid) ? null : 'mismatch');
  }

  {
    const canary = canaryOf('.github/hooks/dude-canary.json');
    const file = fileOf(canary);
    const errors = list(results.hooks, 'errors');
    const match = !errors ? { problem: 'query_failed' } : errors.length ? { problem: 'discovery_errors' } : single(list(results.hooks, 'hooks'), (entry) => typeof entry.source === 'string'
      && samePath(path.resolve(typeof entry.projectPath === 'string' ? entry.projectPath : folders.work, entry.source), file));
    add('hooks:repository', `${canary.location}/${canary.path}`, 'problem' in match ? match.problem
      : match.entry.origin === 'repository' && match.entry.hookType === 'preToolUse' && match.entry.enabled === true
        && typeof match.entry.projectPath === 'string' && samePath(match.entry.projectPath, folders.work) ? null : 'mismatch');
  }

  const skillErrors = isRecord(results.skills) && Array.isArray(results.skills.errors) && results.skills.errors.length > 0;
  for (const [form, relative, source] of /** @type {Array<[string, string, string]>} */ ([
    ['skills:project', '.github/skills/dude-canary/SKILL.md', 'project'], ['skills:user', 'skills/dude-canary-user/SKILL.md', 'personal-copilot']])) {
    const canary = canaryOf(relative);
    const file = fileOf(canary);
    const name = /^name: (\S+)$/m.exec(canary.content)?.[1];
    const match = skillErrors ? { problem: 'discovery_errors' } : single(list(results.skills, 'skills'), (entry) => isFile(entry.path, file));
    add(form, `${canary.location}/${relative}`, 'problem' in match ? match.problem
      : match.entry.name === name && match.entry.source === source && match.entry.enabled === true ? null : 'mismatch');
  }

  for (const [form, relative, answer, source] of /** @type {Array<[string, string, string, string]>} */ ([
    ['mcp:workspace', '.mcp.json', 'mcpWorkspace', 'workspace'], ['mcp:user', 'mcp-config.json', 'mcpUser', 'user']])) {
    const canary = canaryOf(relative);
    const file = fileOf(canary);
    const match = single(list(results[answer], 'servers'), (entry) => entry.name === 'dude-canary-probe');
    let declared = '';
    try {
      declared = 'entry' in match && typeof match.entry.effectiveSource?.file?.uri === 'string' ? fileURLToPath(match.entry.effectiveSource.file.uri) : '';
    } catch {
      declared = '';
    }
    const pointer = 'entry' in match ? match.entry.effectiveSource?.file?.jsonPointer : undefined;
    add(form, `${canary.location}/${relative}`, 'problem' in match ? match.problem
      : match.entry.source === source && declared && samePath(declared, file) && (pointer === undefined || pointer === '/mcpServers/dude-canary-probe')
        ? null : 'mismatch');
  }

  {
    const metadata = results.metadata;
    const context = isRecord(metadata) && isRecord(metadata.context) ? metadata.context : null;
    add('git', 'work/.git', !metadata ? 'query_failed' : metadata.sessionId === sessionId && context && typeof context.workingDirectory === 'string'
      && samePath(context.workingDirectory, folders.work) && typeof context.gitRoot === 'string' && samePath(context.gitRoot, folders.work)
      && context.branch === 'main' ? null : 'mismatch');
  }
  return { rows, failed: rows.filter((row) => row.status !== 'recognized').map((row) => row.form) };
}

/**
 * Whether a path one event or answer reports names exactly `file`: an
 * absolute path to it, or a relative one that resolves to it from one of
 * `bases`, the folders such a path may be relative to.
 * @param {unknown} value @param {string} file @param {readonly string[]} bases
 */
function namesFile(value, file, bases) {
  if (typeof value !== 'string' || !value || value.length > 1_024) return false;
  return path.isAbsolute(value) ? samePath(value, file) : bases.some((base) => samePath(path.resolve(base, value), file));
}

/**
 * Whether the installed public descriptor of the built-in tool accepts exactly
 * these arguments: an object schema declaring each as a string and requiring
 * nothing else, as the worker checks its own built-in probes.
 * @param {unknown} descriptors @param {string} name @param {Record<string, string>} args
 */
function descriptorAccepts(descriptors, name, args) {
  const tools = isRecord(descriptors) && Array.isArray(descriptors.tools) ? descriptors.tools : [];
  const found = tools.filter((entry) => isRecord(entry) && entry.name === name);
  const schema = found.length === 1 ? found[0].inputSchema : null;
  if (!isRecord(schema) || schema.type !== 'object' || !isRecord(schema.properties)) return false;
  const properties = schema.properties;
  const required = schema.required === undefined ? [] : schema.required;
  return Object.keys(args).every((key) => isRecord(properties[key]) && properties[key].type === 'string')
    && Array.isArray(required) && required.every((key) => typeof key === 'string' && Object.hasOwn(args, key));
}

/**
 * The tool-call ID of the after-view control's one pending view, or null: the
 * only tool request the given events hold at all, a root request of its own
 * admission in the form the control permits (`form`), for the view with
 * exactly the fixed arguments.
 * @param {any[]} events @param {string | null} admission @param {string} argumentsSha256
 */
function soleViewRequest(events, admission, argumentsSha256) {
  const requests = events.filter((event) => event.type === 'assistant.message').flatMap((event) => (event.toolRequests ?? [])
    .map((/** @type {any} */ request) => ({ event, request })));
  if (requests.length !== 1 || !admission) return null;
  const [{ event, request }] = requests;
  return event.form === 'permitted' && event.originatingMessageId === admission && request.name === AFTER_VIEW_CONTROL.tool
    && request.argumentsSha256 === argumentsSha256 && typeof request.toolCallId === 'string' && request.toolCallId ? request.toolCallId : null;
}

/**
 * Whether one completed view's model-facing result shows the fixed target text
 * exactly once: its result was kept, so it is a string of at most
 * `NATIVE_LIMITS.viewOutputBytes` (`summarizeEvent`), and it holds the target
 * file's one line of text once and only once, whatever line number, heading,
 * or line break the view puts around it. An opaque, oversized, altered,
 * absent, or repeated text shows nothing.
 * @param {any} completion A summarized `tool.execution_complete`. @param {string} target The target file's text: one line and its line break.
 */
function showsOnce(completion, target) {
  const line = target.replace(/\r?\n$/, '');
  const result = completion.result;
  if (!line || typeof result !== 'string') return false;
  const first = result.indexOf(line);
  return first >= 0 && result.indexOf(line, first + 1) < 0;
}

/**
 * Whether the after-view control's own session events show its one fixed
 * activation, and the bounded proof they give. Each of these is required
 * alone: exactly one unattributed root user message with `send`'s admission
 * ID and exactly the fixed prompt, and no other root prompt; exactly one tool
 * request in the whole turn, a root request of that admission, for `view`
 * with exactly `{path: target}`; exactly one root start of that call with the
 * same arguments; exactly one root completion of it, successful, whose
 * bounded model-facing content shows the synthetic target text exactly once
 * (`showsOnce`); the public instruction-discovered notification for the fixed
 * source, triggered by that file and `view`, after the start and before the
 * turn ends, whether before or after the completion, with any other discovery
 * notification also for a fixed instruction canary; and the admission's
 * normal turn end after the completion. These facts are read only from the
 * turn, through its end (`turnEnd`), so nothing the session sends later ever
 * supplies one, and only from an event in the form the control permits
 * (`form`), so an oversized attribution, a null agent ID, a non-boolean abort
 * flag, or a missing event ID refuses its fact rather than passing as a
 * default, and each retained event ID is present and bounded. Every event of
 * the session, later ones included, is also judged by the control's one
 * judgment (`controlRefusals`) against what it established before its prompt
 * (`expected.bound`): a sub-agent's event refuses as `subagent`, and any other
 * refused event as `competing_event`; the proof the turn gave is still kept
 * beside a refusal of what came after it. A model's own words, a static
 * discovery result, or a direct tool execution never stands in for any of
 * these. The proof keeps the byte count and digest of the complete
 * model-facing result.
 * @param {any[]} events The control session's summarized events, as they stand once both post-turn observations are done.
 * @param {{admission: string, prompt: string, target: string, output: string, source: string, instructions: readonly string[],
 *   bases: readonly string[], bound?: Partial<typeof UNVALIDATED>}} expected `instructions` are the fixed instruction canaries the view may
 *   surface, `source` among them; `bases` are the folders a relative path may be relative to; `bound` is what the control established
 *   (`UNVALIDATED`; the admission and the arguments' digest come from `admission` and `target`).
 * @returns {{problems: string[], proof: Record<string, any> | null}}
 */
export function checkAfterViewControl(events, expected) {
  /** @type {string[]} */
  const problems = [];
  const argumentsSha256 = sha256(canonical({ path: expected.target }));
  const refused = controlRefusals(events, { ...UNVALIDATED, ...expected.bound, admission: expected.admission, argumentsSha256 });
  const endAt = turnEnd(events, expected.admission);
  const turn = endAt < 0 ? events : events.slice(0, endAt + 1);
  /** @param {any} event */
  const at = (event) => turn.indexOf(event);
  /** Whether a fact may be read from this event: the root's, in the form the control permits. @param {any} event */
  const sound = (event) => event.form === 'permitted';
  const admitted = turn.filter((event) => event.type === 'user.message' && event.messageId === expected.admission);
  const first = admitted.length === 1 ? admitted[0] : null;
  const user = first && sound(first) && first.source === null && first.contentSha256 === sha256(expected.prompt) ? first : null;
  if (!user) problems.push('admission');
  if (turn.some((event) => event.type === 'user.message' && event.root && event !== first)) problems.push('other_prompt');
  /** The refusals of the turn's own events, through its end, and of the events after it. */
  const during = refused.slice(0, turn.length);
  const after = refused.slice(turn.length);
  if (during.includes('subagent')) problems.push('subagent');
  if (during.some((kind) => kind !== null && kind !== 'subagent')) problems.push('competing_event');
  const requests = turn.filter((event) => event.type === 'assistant.message').flatMap((event) => (event.toolRequests ?? [])
    .map((/** @type {any} */ request) => ({ event, request })));
  /** @type {{event: any, request: any} | null} */
  let call = null;
  if (requests.length !== 1) problems.push('tool_requests');
  else if (!requests[0].event.root || requests[0].event.originatingMessageId !== expected.admission) problems.push('request_admission');
  else if (!sound(requests[0].event) || requests[0].request.name !== AFTER_VIEW_CONTROL.tool || requests[0].request.argumentsSha256 !== argumentsSha256
    || typeof requests[0].request.toolCallId !== 'string' || !requests[0].request.toolCallId) problems.push('request_arguments');
  else call = requests[0];
  const end = endAt < 0 ? null : events[endAt];
  /** @type {any} */
  let start = null;
  /** @type {any} */
  let completion = null;
  /** @type {any} */
  let notification = null;
  if (call) {
    const id = call.request.toolCallId;
    const starts = turn.filter((event) => event.type === 'tool.execution_start');
    if (starts.length !== 1 || starts[0].toolCallId !== id || !sound(starts[0]) || starts[0].toolName !== AFTER_VIEW_CONTROL.tool
      || starts[0].argumentsSha256 !== call.request.argumentsSha256 || at(starts[0]) < at(call.event)) problems.push('start');
    else start = starts[0];
    const completions = turn.filter((event) => event.type === 'tool.execution_complete');
    if (completions.length !== 1 || completions[0].toolCallId !== id || !sound(completions[0]) || !completions[0].success
      || (start && at(completions[0]) < at(start))) problems.push('completion');
    else if (!showsOnce(completions[0], expected.output)) problems.push('output');
    else completion = completions[0];
    if (start) {
      const discovered = turn.filter((event) => event.type === 'system.notification' && event.kind === 'instruction_discovered');
      /** @param {any} entry */
      const proper = (entry) => sound(entry) && entry.triggerTool === AFTER_VIEW_CONTROL.tool && namesFile(entry.triggerFile, expected.target, expected.bases)
        && expected.instructions.some((file) => namesFile(entry.sourcePath, file, expected.bases)) && at(entry) > at(start);
      const forSource = discovered.filter((entry) => namesFile(entry.sourcePath, expected.source, expected.bases));
      if (forSource.length !== 1 || !discovered.every(proper)) problems.push('notification');
      else notification = forSource[0];
    }
  }
  if (!end || !sound(end) || end.aborted || !first || (completion && at(end) < at(completion))) problems.push('turn_end');
  const proof = problems.length || !user || !call || !start || !completion || !notification || !end ? null : {
    admissionId: expected.admission, toolCallId: call.request.toolCallId,
    eventIds: { admission: user.id, request: call.event.id, start: start.id, completion: completion.id, notification: notification.id, turnEnd: end.id },
    arguments: { sha256: argumentsSha256 },
    output: { bytes: completion.resultBytes, sha256: completion.resultSha256 },
    notification: { sourcePath: notification.sourcePath, triggerFile: notification.triggerFile, triggerTool: notification.triggerTool },
  };
  // Nothing after the turn's end is its evidence, yet anything there but housekeeping or another normal idle refuses all the same; the
  // turn's own proof is kept beside that refusal.
  if (after.includes('subagent') && !problems.includes('subagent')) problems.push('subagent');
  if (after.some((kind) => kind !== null && kind !== 'subagent') && !problems.includes('competing_event')) problems.push('competing_event');
  return { problems, proof };
}

/**
 * The after-view control session's loaded instruction sources from passive
 * `getSources()` after its turn: the fixed source must be loaded exactly once
 * with exactly its own content digest and a type and location documented for
 * that canary after the view (`documentedKind`), and any other source may
 * only be another fixed instruction canary with its own digest and documented
 * type and location. Content is hashed here and never kept.
 * @param {unknown} answer
 * @param {{source: string, instructions: ReadonlyArray<{path: string, file: string, content: string}>, bases: readonly string[]}} expected
 *   `instructions` name each canary by its fixed relative `path` and its `file` in the control project.
 * @returns {{problems: string[], source: Record<string, any> | null}}
 */
export function controlSources(answer, expected) {
  const sources = isRecord(answer) && Array.isArray(answer.sources) ? answer.sources : null;
  if (!sources) return { problems: ['sources_unreadable'], source: null };
  /** @type {Set<string>} */
  const problems = new Set();
  /** @type {Record<string, any> | null} */
  let found = null;
  let named = 0;
  for (const entry of sources) {
    const canary = isRecord(entry) ? expected.instructions.find((candidate) => namesFile(entry.sourcePath, candidate.file, expected.bases)) : undefined;
    if (!canary || !isRecord(entry)) {
      problems.add('unexpected_source');
      continue;
    }
    const isSource = samePath(canary.file, expected.source);
    if (isSource) named += 1;
    const valid = documentedKind(canary.path, entry, 'afterView') && typeof entry.content === 'string' && sha256(entry.content) === sha256(canary.content);
    if (!valid) problems.add('source_mismatch');
    else if (isSource) {
      found = { path: boundedText(entry.sourcePath, 1_024), type: boundedText(entry.type, 64), location: boundedText(entry.location, 64),
        bytes: Buffer.byteLength(entry.content, 'utf8'), sha256: sha256(entry.content) };
    }
  }
  if (named === 0) problems.add('source_missing');
  if (named > 1) problems.add('source_repeated');
  return { problems: [...problems], source: problems.size ? null : found };
}

/**
 * How many reads of one control canary (`work/<path>`) the given processes
 * made, by one observer summary. A matching row whose count is not a
 * non-negative whole number makes the whole count unknown (`NaN`), which no
 * comparison passes, never zero: a garbled baseline must not make a later read
 * look new.
 * @param {any} summary @param {Set<string>} members @param {string} canary
 */
export function canaryReads(summary, members, canary) {
  return (Array.isArray(summary?.canaries) ? summary.canaries : []).filter((/** @type {any} */ row) => row.scope === 'control' && row.path === canary
    && row.op === 'read' && members.has(row.process)).reduce((/** @type {number} */ sum, /** @type {any} */ row) => sum
    + (Number.isSafeInteger(row.count) && row.count >= 0 ? row.count : Number.NaN), 0);
}

/**
 * Decide whether one after-view control permission request is the pending
 * read the human may be asked about: from the control session, for its sole
 * pending model-requested view, a read of exactly that view's target or of a
 * fixed instruction canary it may surface, under no managed policy and with
 * no sandbox bypass. Each of those markers is a documented optional boolean
 * (types.d.ts:1041-1042 and :1089; generated/session-events.d.ts:9662-9673),
 * so only its absence or an explicit `false` leaves it unraised; any other
 * value is unknown and refuses as if raised. Everything else is rejected
 * without asking.
 * @param {unknown} request @param {unknown} invocation
 * @param {{sessionId: string | null, pending: string | null, files: readonly string[]}} allow
 * @returns {{ask: true, summary: string} | {ask: false, reason: string}}
 */
export function matchControlPermission(request, invocation, allow) {
  if (!isRecord(invocation) || !allow.sessionId || invocation.sessionId !== allow.sessionId) return { ask: false, reason: 'session_mismatch' };
  if (!isRecord(request) || typeof request.toolCallId !== 'string' || !request.toolCallId) return { ask: false, reason: 'unidentified' };
  if (!allow.pending || request.toolCallId !== allow.pending) return { ask: false, reason: 'not_model_requested' };
  /** @param {unknown} marker */
  const raised = (marker) => marker !== undefined && marker !== false;
  if (raised(invocation.managedSettingsEnabled) || raised(request.managedApprovalRequired)) return { ask: false, reason: 'managed_policy' };
  if (raised(request.requestSandboxBypass)) return { ask: false, reason: 'sandbox_bypass' };
  const file = request.kind === 'read' && typeof request.path === 'string' ? allow.files.find((entry) => samePath(String(request.path), entry)) : undefined;
  return file ? { ask: true, summary: `read ${file}` } : { ask: false, reason: 'not_control_read' };
}

/**
 * Controlled-test seams. Passing any of them marks the run `controlled_test`,
 * which can never report native success.
 * @typedef {object} NativeAdapters
 * @property {Terminal} [terminal]
 * @property {(scope: any) => Promise<any>} [loadSdk]
 * @property {(options: {inputFile: string, proof: string, systemRoot: string, clock: () => number}) => ObserverHandle | Promise<ObserverHandle>} [startObserver]
 * @property {(file: string) => Promise<{pid: number}>} [runHelper]
 * @property {() => number} [clock]
 * @property {NodeJS.Platform} [platform]
 * @property {() => any} [rescope] Recomputes the scope after consent.
 * @property {Record<string, string | undefined>} [environment] Stands in for this process's environment when a version-3 run rechecks
 *   the selected names its scope bound.
 */

/**
 * Run the native qualification for one validated scope. Resolves with the
 * bounded report and exit status from `nativeResult`: 0 only for a native run
 * with every check passed whose bounded report still says so; 4 for every
 * refusal or failure. Never rejects.
 *
 * The invocation holds its process open from its start until it has that
 * result. The run's waits poll on unref'd timers (`delay`), so that no wait
 * alone holds a process open, and a run can be left with nothing else: once
 * its prompt has paused the terminal, an observer that refuses and exits, or
 * runtimes that have all ended, leave only those polls, and the process would
 * end before the report exists, printing nothing, with status 0. The hold
 * ends with the invocation on every path, so a poll still pending after it
 * returns holds nothing open.
 * @param {{scope: any, plan: {file: string, bytes: number, sha256: string}, io?: {stdin: any, stderr: any}, adapters?: NativeAdapters}} input
 * @returns {Promise<{report: Record<string, any>, exitCode: number}>}
 */
export async function runNativeQualification(input) {
  const hold = setInterval(() => {}, 2 ** 30);
  try {
    return await qualifyNatively(input);
  } finally {
    clearInterval(hold);
  }
}

/** The run itself, inside the hold its invocation owns (`runNativeQualification`). @param {Parameters<typeof runNativeQualification>[0]} input */
async function qualifyNatively({ scope, plan, io = process, adapters }) {
  const controlled = adapters !== undefined;
  // The branch is the scope's own, fixed before anything happens: a version-3 scope never runs a strict step, and a strict run
  // that fails never continues as a normal one.
  const normal = scope.version === 3;
  const clock = adapters?.clock ?? Date.now;
  const terminal = adapters?.terminal ?? { input: io.stdin, output: io.stderr, clock };
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  /** @type {Record<string, any>} */
  const report = {
    tool: 'qualify-collaboration',
    version: normal ? 3 : 2,
    mode: 'native',
    layer: controlled ? 'controlled_test: injected adapters; never native evidence' : 'native',
    verdict: 'refused',
    reason: null,
    detail: null,
    runId: randomUUID(),
    scopeSha256: scope.scopeSha256,
    plan,
    startedAt: new Date(clock()).toISOString(),
    host: { platform: adapters?.platform ?? process.platform, node: process.versions.node, runtime: null },
    consent: { status: 'not_given' },
    phases: [],
    checks: [],
    measurements: {},
    // A normal run starts no observer, canary, or control: what it defers is stated, never reported as run or passed.
    ...(normal ? { accounts: {}, strict: structuredClone(scope.strict ?? null) } : { observer: null, canaries: null, control: null }),
    operations: {},
    capture: null,
    cancellation: null,
    cleanup: null,
    retained: null,
    effects: 'none yet',
  };
  const run = {
    scope, report, clock, controlled, normal, terminal, human: humanQueue(terminal, clock), adapters: adapters ?? {}, runId: report.runId, systemRoot,
    expiresAtMs: Date.parse(scope.values.expiresAt),
    // The worker's verified images: the plan's runtime, and the console host Windows starts for a console process.
    workerImages: [scope.values.cli, path.join(systemRoot, 'System32', 'conhost.exe')],
    closing: false,
    tornDown: false,
    /** @type {Layout | null} */ layout: null,
    /** @type {ObserverHandle | null} */ observer: null,
    observerReady: false,
    /** @type {any} */ sdk: null,
    /** @type {Array<{side: string, client: any, session: any | null, log: ReturnType<typeof createSessionLog>, stopped: boolean}>} */ clients: [],
    /** @type {Record<string, any>} */ mains: {},
    /** @type {Record<string, any>} */ keys: {},
    /** @type {Array<{side: string, root: string, operationId: string, lines: string[], done: Promise<unknown>, controller: AbortController}>} */ followers: [],
    /** @type {Record<string, any>} */ allow: {},
    /** @type {Record<string, string>} */ admissions: {},
    /** @type {Set<string>} */ pending: new Set(),
    /** @type {Record<string, string>} */ tokens: {},
    /** @type {any} */ prepared: null,
    /** @type {Map<string, string>} */ workerDirs: new Map(),
    /** Each validated worker's recorded session workspace by folder name, relative to it; null for observed absence. @type {Map<string, string | null>} */
    workspaces: new Map(),
    /** @type {string[]} */ workerKeys: [],
    /** Each owned subtree's own cleanup window, the control runtime's and each worker's: its tree key and the anchor its 10 seconds run from. @type {Array<{label: string, key: string, anchorMs: number}>} */
    windows: [],
  };
  let failed = false;
  try {
    if (report.host.platform !== 'win32') {
      stop('platform_unsupported', normal ? 'the normal-collaboration branch runs only on Windows, as the product\'s existing-sign-in worker does'
        : 'native qualification runs only on Windows with the fixed ETW observer');
    }
    if (!normal && scope.values.runtimePayload === null) {
      stop('runtime_identity_unobserved', 'the plan names no runtime payload, and no public evidence shows that a launcher alone is the complete '
        + 'runtime; a native run could not prove its runtime identity, so nothing is asked or started');
    }
    await phase(run, 'consent', () => consent(run));
    await phase(run, 'revalidate', () => revalidate(run));
    report.effects = normal ? 'fixture preparation, normal signed-in runtimes, model calls, A2A exchanges, and capture as consented'
      : 'fixture preparation, observation, native runtimes, model calls, A2A exchanges, and capture as consented';
    await phase(run, 'prepare', () => prepare(run), true);
    if (!normal) {
      await phase(run, 'observe', () => observe(run), true);
      await phase(run, 'canary_control', () => canaryControl(run), true);
    }
    await phase(run, 'start_mains', () => startMains(run), true);
    await phase(run, 'approve_b', () => approveProposal(run, 'b'), true);
    await phase(run, 'approve_a', () => approveProposal(run, 'a'), true);
    await phase(run, 'advice_exchange', () => adviceExchange(run), true);
    await phase(run, 'capture', () => capture(run), true);
    await phase(run, 'cancel_exchange', () => cancelExchange(run), true);
    await phase(run, 'teardown', () => teardown(run, true));
    await phase(run, 'retained_reread', () => reread(run));
    assertLogs(run);
  } catch (error) {
    failed = true;
    const known = error instanceof NativeStop;
    report.reason = known ? error.reason : 'internal_error';
    report.detail = terminalSafe(error instanceof Error ? error.message : 'unexpected failure').slice(0, 512);
  }
  try {
    await teardown(run, false);
  } catch {
    failed = true;
    report.reason ??= 'internal_error';
  }
  report.endedAt = new Date(clock()).toISOString();
  const passed = !failed && !controlled && report.checks.length > 0 && report.checks.every((/** @type {any} */ entry) => entry.status === 'passed');
  report.verdict = passed ? qualifiedVerdict(report) : controlled ? 'controlled_only' : report.consent.status !== 'granted' ? 'refused' : 'failed';
  if (!passed && !controlled && !report.reason) report.reason = 'internal_error';
  const result = nativeResult(report);
  if (run.layout) {
    try {
      writeNew(path.join(run.layout.proof, 'report.json'), `${JSON.stringify(result.report, null, 2)}\n`);
    } catch {
      // The report still goes to stdout; the proof folder may be unavailable.
    }
  }
  return result;
}

/**
 * The only passing verdict a report's own version can carry: `qualified` for
 * the strict version 2, `collaboration_qualified` for the normal version 3,
 * whose strict isolation stays deferred. Neither stands for the other.
 * @param {Record<string, any>} report
 */
function qualifiedVerdict(report) {
  return report.version === 3 ? 'collaboration_qualified' : 'qualified';
}

/**
 * The one place a native result is produced. The report is bounded first, and
 * the exit status comes only from that bounded report: 0 only while its
 * verdict is still its version's passing verdict (`qualifiedVerdict`). A
 * report the bound replaced with an overflow refusal, and every controlled
 * run, exits 4.
 * @param {Record<string, any>} report
 */
export function nativeResult(report) {
  const bounded = boundReport(report);
  return { report: bounded, exitCode: bounded.verdict === qualifiedVerdict(bounded) ? 0 : 4 };
}

/** The report within its bound, or a closed overflow refusal; never truncated. @param {Record<string, any>} report */
export function boundReport(report) {
  if (Buffer.byteLength(`${JSON.stringify(report, null, 2)}\n`, 'utf8') <= NATIVE_LIMITS.reportBytes) return report;
  return {
    tool: report.tool, version: report.version, mode: report.mode, layer: report.layer,
    verdict: report.verdict === 'qualified' || report.verdict === 'collaboration_qualified' ? 'failed' : report.verdict,
    reason: 'observation_overflow', detail: `the complete report would exceed ${NATIVE_LIMITS.reportBytes} bytes; nothing was truncated into a pass`,
    runId: report.runId, scopeSha256: report.scopeSha256,
  };
}

/**
 * One ordered phase. A phase that starts native effects needs the consented
 * scope still current when it begins; every phase ends by consuming any
 * session-log overflow, so later phases never build on a partial view.
 * @param {any} run @param {string} id @param {() => Promise<unknown> | unknown} body @param {boolean} [effects]
 */
async function phase(run, id, body, effects = false) {
  const entry = { id, status: 'running', startedAt: new Date(run.clock()).toISOString(), endedAt: /** @type {string | null} */ (null) };
  run.report.phases.push(entry);
  try {
    if (effects) assertCurrent(run, `the ${id} phase`);
    await body();
    assertLogs(run);
    entry.status = 'passed';
  } catch (error) {
    entry.status = 'failed';
    throw error;
  } finally {
    entry.endedAt = new Date(run.clock()).toISOString();
  }
}

/** @param {any} run @param {string} id @param {boolean} passed @param {string} detail */
function recordCheck(run, id, passed, detail) {
  run.report.checks.push({ id, status: passed ? 'passed' : 'failed', detail: terminalSafe(detail).slice(0, 1_024) });
}

/** @param {any} run @param {string} id @param {boolean} passed @param {string} detail @param {string} reason */
function check(run, id, passed, detail, reason) {
  recordCheck(run, id, passed, detail);
  if (!passed) stop(reason, `${id}: ${detail}`);
}

/** An absolute deadline `ms` from now on the run clock. @param {any} run @param {number} ms */
function deadline(run, ms) {
  return run.clock() + ms;
}

/** Whether the consented scope has expired on the run clock. @param {any} run */
function expired(run) {
  return !(run.clock() < run.expiresAtMs);
}

/** The side of the first session log that overflowed, or null. Each log is kept on its client from construction. @param {any} run */
function overflowedLog(run) {
  return run.clients.find((/** @type {any} */ entry) => entry.log?.state.overflow)?.side ?? null;
}

/** Stop once any session log overflowed: evidence kept before it cannot stand in for what was dropped. @param {any} run */
function assertLogs(run) {
  const side = overflowedLog(run);
  if (side) stop('observation_overflow', `${side}'s session event log overflowed; evidence kept earlier cannot stand in for what was dropped`);
}

/** Effects need the run still open, the consented scope current, and every session log intact. @param {any} run @param {string} what */
function assertCurrent(run, what) {
  if (run.closing) stop('internal_error', `${what} was requested after the run began closing`);
  if (expired(run)) stop('scope_expired', `the consented scope expired before ${what}`);
  assertLogs(run);
}

/**
 * How one promise settled by an absolute deadline on the run clock: its value,
 * its error, `timed_out`, or (when `scoped`) `expired` once the consented scope
 * ends first. The clock is polled, so nothing depends on a long timer, and
 * nothing is cancelled: a later answer is simply never used.
 * @param {any} run @param {Promise<unknown>} promise @param {number} deadlineAt @param {boolean} scoped
 * @returns {Promise<{kind: 'value', value: any} | {kind: 'error', error: unknown} | {kind: 'timed_out'} | {kind: 'expired'}>}
 */
async function settleBy(run, promise, deadlineAt, scoped) {
  /** @type {Promise<{kind: 'value', value: any} | {kind: 'error', error: unknown}>} */
  const settled = promise.then((value) => ({ kind: /** @type {const} */ ('value'), value }), (error) => ({ kind: /** @type {const} */ ('error'), error }));
  for (;;) {
    const outcome = await Promise.race([settled, delay(NATIVE_LIMITS.pollMs).then(() => null)]);
    if (outcome) return outcome;
    if (!(run.clock() < deadlineAt)) return { kind: 'timed_out' };
    if (scoped && expired(run)) return { kind: 'expired' };
  }
}

/**
 * Run one effectful public SDK call within an absolute deadline: the scope,
 * the run, and the logs are checked before it is invoked and again once it
 * settles, and an answer that arrives after the deadline is discarded. A
 * timed-out call is not assumed cancelled; owned cleanup still stops its client.
 * @template T @param {any} run @param {() => T | Promise<T>} call @param {number} deadlineAt @param {string} reason @param {string} detail
 * @returns {Promise<T>}
 */
async function bounded(run, call, deadlineAt, reason, detail) {
  assertCurrent(run, detail);
  if (!(run.clock() < deadlineAt)) return stop(reason, `${detail} (no time was left)`);
  const outcome = await settleBy(run, Promise.resolve().then(call), deadlineAt, true);
  if (outcome.kind === 'expired') return stop('scope_expired', `the consented scope expired while waiting: ${detail}`);
  if (outcome.kind === 'timed_out') return stop(reason, `${detail} (timed out; a late answer is discarded, not assumed cancelled)`);
  if (!(run.clock() <= deadlineAt)) return stop(reason, `${detail} (it answered after its deadline; the answer is discarded)`);
  assertCurrent(run, detail);
  if (outcome.kind === 'error') {
    if (outcome.error instanceof NativeStop) throw outcome.error;
    return stop(reason, detail);
  }
  return outcome.value;
}

/**
 * Poll until `probe` returns a value, or stop with `reason` at the absolute
 * deadline. The probe itself, even an RPC that never answers, is bounded by
 * the same deadline; a value it returns after the deadline does not count;
 * and the scope and logs are checked before each probe and before any value
 * is used.
 * @template T @param {any} run @param {() => T | null | undefined | false | Promise<T | null | undefined | false>} probe
 * @param {number} deadlineAt @param {string} reason @param {string} detail @returns {Promise<T>}
 */
async function waitUntil(run, probe, deadlineAt, reason, detail) {
  for (;;) {
    assertCurrent(run, detail);
    if (!(run.clock() < deadlineAt)) return stop(reason, detail);
    const outcome = await settleBy(run, Promise.resolve().then(probe), deadlineAt, true);
    if (outcome.kind === 'expired') return stop('scope_expired', `the consented scope expired while waiting: ${detail}`);
    if (outcome.kind === 'timed_out') return stop(reason, `${detail} (a check did not answer in time)`);
    if (outcome.kind === 'error') {
      if (outcome.error instanceof NativeStop) throw outcome.error;
      return stop(reason, detail);
    }
    if (!(run.clock() <= deadlineAt)) return stop(reason, detail);
    assertCurrent(run, detail);
    if (outcome.value) return /** @type {T} */ (outcome.value);
    await delay(NATIVE_LIMITS.pollMs);
  }
}

/** Wait `ms` on the run clock; no effect and no scope requirement. @param {any} run @param {number} ms */
async function pause(run, ms) {
  const until = run.clock() + ms;
  while (run.clock() < until) await delay(NATIVE_LIMITS.pollMs);
}

/** @param {any} run */
function scopeLines(run) {
  const { scope } = run;
  const effects = Array.isArray(scope.plannedEffects) ? scope.plannedEffects : [];
  return [
    '',
    '=== Feature 089 native qualification: requested scope ===',
    `Scope digest: ${scope.scopeSha256}`,
    `Run: ${run.runId}; operator ${scope.values.operator}; coordinator ${scope.values.coordinator}; valid until ${scope.values.expiresAt}`,
    ...effects.map((/** @type {any} */ entry) => `- ${entry.scope}: ${entry.detail}`),
    'Nothing has run yet. Entering the line shown under ACTION NEEDED below authorizes exactly this scope; anything else refuses and changes nothing.',
    '',
  ].map(terminalSafe).join('\n');
}

/** @param {any} run */
async function consent(run) {
  const literal = consentLiteral(run.scope.scopeSha256);
  if (run.terminal.input?.isTTY !== true || run.terminal.output?.isTTY !== true) {
    return stop('consent_not_interactive', 'input and the prompt output must be an interactive terminal; redirected input never consents');
  }
  run.human.show(scopeLines(run));
  const answer = await run.human.ask(ANSWER_PROMPT, { deadlineAt: deadline(run, NATIVE_LIMITS.consentMs),
    action: { title: 'Approve this run\'s scope', line: literal, note: 'Anything else refuses; nothing has run yet.' } });
  if (!answer.ok) return stop(answer.reason === 'not_interactive' ? 'consent_not_interactive' : 'consent_refused', `no fresh consent: ${answer.reason}`);
  if (answer.line !== literal) return stop('consent_refused', 'the typed line is not the consent literal for this exact scope');
  run.report.consent = { status: 'granted', at: new Date(run.clock()).toISOString(), literalSha256: sha256(answer.line) };
  return undefined;
}

/**
 * The full post-consent revalidation, once, before anything is prepared: the
 * plan must still preview complete and unexpired with the same digest. Later
 * checks compare the run clock with the scope's expiry instead, because the
 * now legitimately nonempty fixture folder would fail a fresh preview.
 * @param {any} run
 */
function revalidate(run) {
  const again = run.adapters.rescope ? run.adapters.rescope() : nativeScope({ file: run.report.plan.file, now: run.clock() });
  if (!again?.scope) return stop(again?.expired ? 'scope_expired' : 'scope_stale', 'the plan no longer validates after consent');
  if (again.scope.scopeSha256 !== run.scope.scopeSha256 || again.plan?.sha256 !== run.report.plan.sha256) {
    return stop('scope_stale', 'the plan, artifacts, sources, rendered core, or fixture changed after consent');
  }
  return undefined;
}

/**
 * Prepare the fixture after consent: each certificate's pin, and for a strict
 * run each main runtime's credential. A version-3 run reads no credential:
 * each runtime finds its own saved sign-in, which nothing here reads.
 * @param {any} run
 */
function prepare(run) {
  const { values } = run.scope;
  run.layout = layoutOf(values.fixtureParent);
  const pins = { a: certificatePin(values.tls.a.certFile), b: certificatePin(values.tls.b.certFile) };
  if (!run.normal) run.tokens = { a: readToken(values.credentials.a), b: readToken(values.credentials.b) };
  run.prepared = prepareFixtures({ scope: run.scope, layout: run.layout, runId: run.runId, pins });
  run.report.fixture = {
    parent: values.fixtureParent,
    manifestSha256: run.prepared.manifest.sha256,
    configDigests: run.prepared.configDigests,
    pins,
  };
}

/** @param {any} run */
async function observe(run) {
  const layout = /** @type {Layout} */ (run.layout);
  const inputFile = path.join(layout.proof, 'observer-input.json');
  const output = path.join(layout.proof, 'observer.json');
  const input = observerInput({
    runId: run.runId, rootPid: process.pid, layout, scope: run.scope, repoRoot: run.scope.repoRoot,
    homeDir: path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? layout.parent), systemRoot: run.systemRoot, output,
  });
  writeNew(inputFile, `${JSON.stringify(input, null, 2)}\n`);
  // The helper is this run's from the moment it exists: teardown ends it however readiness turns out.
  run.observer = await (run.adapters.startObserver ?? startObserver)({ inputFile, proof: layout.proof, systemRoot: run.systemRoot, clock: run.clock });
  const ready = await run.observer.ready;
  if (!ready?.ok) return stop(ready?.reason ?? 'observer_unavailable', 'the fixed observer did not become ready; nothing native started');
  run.observerReady = true;
  const helper = await bounded(run, () => (run.adapters.runHelper ?? runCalibrationHelper)(path.join(layout.proof, 'calibration.txt')),
    deadline(run, NATIVE_LIMITS.observerMs), 'observer_calibration_failed', 'the calibration helper did not finish');
  const summary = await run.observer.snapshot();
  run.keys.root = typeof summary?.root === 'string' ? summary.root : null;
  const problems = run.keys.root ? checkCalibration(summary, { rootKey: run.keys.root, helperPid: helper.pid, image: process.execPath }) : ['root'];
  run.keys.helper = [...processTree(summary).values()].find((node) => node.pid === helper.pid && node.parent === run.keys.root)?.key ?? null;
  run.report.observer = { calibration: problems.length ? problems : 'calibrated', health: summary?.health ?? null };
  check(run, 'observer_calibration', problems.length === 0, problems.join(', ') || 'pinned helper start, write, read, and exit observed',
    'observer_calibration_failed');
}

/**
 * Start one runtime and identify its process: the one new pinned child of this
 * process with the plan's CLI image between two synchronized snapshots, whose
 * own subtree opened or read the plan's runtime payload. The client and its
 * session log belong to the run from construction, so cleanup and overflow
 * checks reach a runtime whose start never finished. The control's client
 * uses the SDK's empty mode, so nothing optional is on unless a session asks.
 * A version-3 runtime instead starts in the SDK's normal `copilot-cli` mode
 * with the logged-in user on, no token, its role's approved real base
 * directory, and only the bound selected environment (`normalEnvironment`),
 * once that environment and base directory are rechecked as unchanged
 * (`normalBasisHolds`). No observer runs, so its process identity is not
 * observed; nothing claims it was.
 * @param {any} run @param {'a' | 'b' | 'control'} side @param {{workspace: string, config: string, home: string, temp: string}} folders
 */
async function startRuntime(run, side, folders) {
  const { values } = run.scope;
  run.sdk ??= await bounded(run, () => (run.adapters.loadSdk ?? loadPlanSdk)(run.scope), deadline(run, NATIVE_LIMITS.runtimeMs), 'sdk_unsupported',
    'the plan SDK did not load');
  if (run.normal) normalBasisHolds(run, /** @type {'a' | 'b'} */ (side));
  const before = run.normal ? null : new Set(processTree(await run.observer.snapshot()).keys());
  /** @type {any} */
  let client;
  try {
    client = new run.sdk.CopilotClient(run.normal ? {
      mode: 'copilot-cli',
      connection: run.sdk.RuntimeConnection.forStdio({ path: values.cli, args: [], env: normalEnvironment(values.environment, folders.temp) }),
      workingDirectory: folders.workspace,
      baseDirectory: values.auth[side].baseDirectory,
      useLoggedInUser: true,
    } : {
      ...(side === 'control' ? { mode: 'empty' } : {}),
      connection: run.sdk.RuntimeConnection.forStdio({ path: values.cli, args: [], env: runtimeEnvironment(folders) }),
      workingDirectory: folders.workspace,
      baseDirectory: folders.config,
      logLevel: 'none',
      gitHubToken: side === 'b' ? run.tokens.b : run.tokens.a,
      useLoggedInUser: false,
    });
  } catch {
    return stop('runtime_start_failed', `the ${side} client could not be constructed`);
  }
  const log = createSessionLog(side, run.clock);
  const entry = { side, client, session: null, log, stopped: false };
  run.clients.push(entry);
  await bounded(run, () => client.start(), deadline(run, NATIVE_LIMITS.runtimeMs), 'runtime_start_failed', `the ${side} runtime did not start`);
  const status = await bounded(run, () => client.getStatus(), deadline(run, NATIVE_LIMITS.runtimeMs), 'runtime_start_failed',
    `the ${side} runtime reported no status`);
  if (!isRecord(status) || typeof status.version !== 'string' || typeof status.protocolVersion !== 'number') {
    return stop('runtime_start_failed', `the ${side} runtime status is unreadable`);
  }
  if (!before) return { client, entry, log, status: { version: status.version, protocolVersion: status.protocolVersion } };
  const summary = await run.observer.snapshot();
  const tree = processTree(summary);
  const fresh = [...tree.values()].filter((node) => !before.has(node.key) && node.parent === run.keys.root && samePath(node.image, values.cli));
  if (fresh.length !== 1) return stop('runtime_identity_unobserved', `the ${side} runtime process was not observed as this run's one new CLI child`);
  if (!fresh[0].pinned) return stop('runtime_identity_unobserved', `the ${side} runtime process could not be pinned by handle, creation time, and image`);
  run.keys[side] = fresh[0].key;
  check(run, `${side}_runtime_payload`, payloadObserved(summary, tree, fresh[0].key),
    payloadObserved(summary, tree, fresh[0].key) ? 'the runtime opened or read its declared payload' : 'the runtime never opened or read its declared payload',
    'runtime_identity_unobserved');
  return { client, entry, log, status: { version: status.version, protocolVersion: status.protocolVersion } };
}

/**
 * Right before a version-3 runtime starts, its basis must still be what the
 * consented scope bound: the selected environment as this process holds it
 * now (HOME from USERPROFILE when absent, as the preview composed it), and the
 * side's base directory, by its metadata alone, still an existing directory,
 * not a link, resolving to the bound path. Drift refuses as `scope_stale`
 * before anything starts.
 * @param {any} run @param {'a' | 'b'} side
 */
function normalBasisHolds(run, side) {
  const { environment, auth } = run.scope.values;
  /** @type {Record<string, string | undefined>} */
  const source = run.adapters.environment ?? process.env;
  /** @type {Record<string, string>} */
  const current = {};
  for (const name of environment.names) {
    const value = source[name];
    if (typeof value === 'string') current[name] = value;
  }
  if (current.HOME === undefined && current.USERPROFILE !== undefined) current.HOME = current.USERPROFILE;
  /** @type {string | null} */
  let base = null;
  try {
    const stat = fs.lstatSync(auth[side].baseDirectory);
    base = stat.isDirectory() && !stat.isSymbolicLink() ? fs.realpathSync.native(auth[side].baseDirectory) : null;
  } catch {
    base = null;
  }
  if (canonical(current) !== canonical(environment.values) || base !== auth[side].baseDirectory) {
    stop('scope_stale', `the selected environment or ${side}'s base directory changed after consent; nothing for ${side} started`);
  }
}

/**
 * The account pair of one version-3 main, before a prompt: its own client's
 * status, then its actual session's, each one bounded public SDK call
 * (`bounded`: the run, scope, and logs are checked before it is asked and
 * again once it answers, and a hung, late, missing, or throwing call is
 * `auth_unavailable`), and each read by `readAccount` against that side's
 * expected account. Any failure records a failed check and stops the run
 * with its closed reason; nothing logs in, switches, retries, or falls back,
 * and no status text or error is kept. The first pair of each side is its
 * `<side>_account` check; later pairs are counted as rechecks and recorded as
 * checks only when they fail. A passing pair is a point-in-time observation.
 * @param {any} run @param {'a' | 'b'} side @param {any} client @param {any} session
 */
async function mainAccounts(run, side, client, session) {
  const expected = run.scope.values.auth[side].expectedAccount;
  const first = !run.report.accounts[side];
  const id = first ? `${side}_account` : `${side}_account_recheck`;
  /** @type {Record<string, any>} */
  const accounts = {};
  for (const [name, call] of /** @type {Array<['runtime' | 'session', () => Promise<unknown>]>} */ ([
    ['runtime', () => client.getAuthStatus()], ['session', () => session.rpc.gitHubAuth.getStatus()]])) {
    /** @type {unknown} */
    let answer;
    try {
      answer = await bounded(run, call, deadline(run, NATIVE_LIMITS.runtimeMs), 'auth_unavailable', `${side}'s ${name} account status did not answer`);
    } catch (error) {
      if (error instanceof NativeStop && error.reason === 'auth_unavailable') recordCheck(run, id, false, `${name}: no usable account status`);
      throw error;
    }
    const read = readAccount(answer, expected);
    if (!read.ok) return check(run, id, false, `${name}: ${read.reason}`, read.reason);
    accounts[name] = read.account;
  }
  if (first) {
    run.report.accounts[side] = { ...accounts, rechecks: 0 };
    check(run, id, true, `runtime ${accounts.runtime.authType} and session ${accounts.session.authType}: ${accounts.session.login} at `
      + `${accounts.session.host}`, 'auth_mismatch');
  } else {
    run.report.accounts[side].rechecks += 1;
  }
}

/**
 * The model-less control, then the one model-driven after-view control, in
 * one owned control runtime whose client uses empty mode. The discovery-only
 * session offers no tool and runs only server-side discovery queries, which
 * activate, install, start, and run nothing; a failed or late discovery
 * answer is recorded as such, and an expired scope or overflowed log still
 * stops the run. Once every canary form is recognized, that session is
 * disconnected without stopping or replacing the runtime, and the after-view
 * control runs in exactly one fresh session there. The runtime is stopped by
 * its owned lifecycle stops either way, and the stop's outcome is kept. SDK
 * stop is not tree exit: before either main starts, the whole pinned control
 * subtree must be observed to have ended within its own 10-second cleanup
 * window from that stop (`subtreeCessation`), by a snapshot whose own
 * coverage is complete, and the drained final summary judges that window
 * again, so a descendant whose start was still buffered counts too.
 * @param {any} run
 */
async function canaryControl(run) {
  const layout = /** @type {Layout} */ (run.layout);
  const started = await startRuntime(run, 'control', layout.control);
  let stoppedAt = Number.NaN;
  try {
    const session = await bounded(run, () => started.client.createSession({
      workingDirectory: layout.control.workspace,
      availableTools: [],
      enableConfigDiscovery: false,
      skipCustomInstructions: true,
      enableOnDemandInstructionDiscovery: false,
      enableFileHooks: false,
      enableSkills: false,
      enableHostGitOperations: true,
      requestExtensions: false,
      mcpServers: {},
      enableSessionTelemetry: false,
      onPermissionRequest: () => ({ kind: 'reject', feedback: 'The model-less control approves nothing.' }),
      onEvent: started.log.onEvent,
    }), deadline(run, NATIVE_LIMITS.runtimeMs), 'runtime_start_failed', 'the control session was not created');
    started.entry.session = session;
    const work = layout.control.workspace;
    const projectPaths = [work];
    const client = started.client;
    /** @param {() => Promise<unknown>} call */
    const query = async (call) => {
      try {
        return await bounded(run, call, deadline(run, NATIVE_LIMITS.observerMs), 'ambient_state_unobservable', 'a discovery call did not answer');
      } catch (error) {
        if (error instanceof NativeStop && (error.reason === 'scope_expired' || error.reason === 'observation_overflow')) throw error;
        return null;
      }
    };
    const results = {
      agents: await query(() => client.rpc.agents.discover({ projectPaths })),
      instructions: await query(() => client.rpc.instructions.discover({ projectPaths })),
      hooks: await query(() => client.rpc.hooks.discover({ projectPaths })),
      skills: await query(() => client.rpc.skills.discover({ projectPaths })),
      mcpWorkspace: await query(() => client.rpc.mcp.discover({ workingDirectory: work, includeEffectiveSource: true })),
      mcpUser: await query(() => client.rpc.mcp.discover({ workingDirectory: layout.control.temp, includeEffectiveSource: true })),
      metadata: await query(() => client.getSessionMetadata(session.sessionId)),
    };
    const recognized = canaryRecognition(results, { work, config: layout.control.config, home: layout.control.home, temp: layout.control.temp },
      { sessionId: session.sessionId });
    run.report.canaries = recognized;
    check(run, 'canary_recognition', recognized.failed.length === 0,
      recognized.failed.length ? `not established: ${recognized.failed.join(', ')}` : 'every required canary form is recognized at its exact location',
      'ambient_state_unobservable');
    await bounded(run, () => session.disconnect(), deadline(run, NATIVE_LIMITS.runtimeMs), 'ambient_state_unobservable',
      'the discovery session did not disconnect');
    started.entry.session = null;
    await afterViewControl(run, started);
  } finally {
    stoppedAt = run.clock();
    const stopped = await stopClient(run, started.entry, { stopBy: stoppedAt + NATIVE_LIMITS.cleanupMs / 2, forceBy: stoppedAt + NATIVE_LIMITS.cleanupMs });
    // The control runtime's own cleanup window runs from this stop, and the drained final summary judges it again.
    run.windows.push({ label: 'control', key: run.keys.control, anchorMs: stoppedAt });
    run.report.control = { ...run.report.control, cleanup: { stop: stopped.stop, errors: stopped.errors, forced: stopped.forced } };
  }
  // SDK stop is not tree exit: no main starts until the whole pinned control subtree is seen to have ended within that window, by a
  // snapshot whose own coverage is complete.
  const cessation = await subtreeCessation(run, run.keys.control, stoppedAt, 'control');
  run.report.control.cleanup.cessation = cessation;
  check(run, 'control_cessation', cessation.ok, cessationDetail(cessation, 'its owned stop'), 'cessation_unconfirmed');
}

/**
 * The one model-driven after-view positive control, in the owned control
 * runtime after its model-less checks: one fresh session with A's model and
 * A's control-runtime credential, offering only the built-in view, with
 * custom and on-demand instructions on and everything else off, working in
 * the control's temp folder outside the canary project. One absolute deadline,
 * `NATIVE_LIMITS.runtimeMs` from the start of that session's creation, binds
 * every SDK call, event wait, permission wait, and post-turn observation,
 * beside the scope's expiry and each call's own shorter bound; nothing resets
 * it, borrows time, or retries. The public event callback is registered at
 * creation. Before its one prompt the session must show its actual ID, model,
 * tool catalog, view arguments the installed descriptor accepts, working
 * directory, and no loaded instruction source; a synchronized observer
 * baseline then follows every static discovery read. Just before the prompt
 * is sent, everything its session has sent so far must be what it may send
 * before its prompt (`controlRefusals`), and the prompt is sent with nothing
 * awaited in between, so no event goes unjudged; otherwise nothing is sent.
 * Once the admission's turn ends (`turnEnd`), a second synchronized snapshot
 * must show the control runtime reading both the target and the source since
 * that baseline with complete coverage, and passive `getSources()` must show
 * the fixed source loaded by digest (`controlSources`). Only then is the
 * whole session judged (`checkAfterViewControl`), its proof read from the
 * turn alone, and every event, those delivered while the post-turn
 * observations ran included, judged by the phase it arrived in against what
 * the control established (`control.bound`). Anything less is
 * `ambient_state_unobservable`, including a host that sends no matching
 * notification or loads no matching source after a genuine view. Its bounded
 * evidence goes only to this report's `control` record, never to a main
 * session, prompt, journal, or advice; on every path that ran its session,
 * that record also names each event it refused by type and class only
 * (`refusedEvents`).
 * @param {any} run @param {{client: any, entry: any}} started
 */
async function afterViewControl(run, started) {
  const layout = /** @type {Layout} */ (run.layout);
  const { values } = run.scope;
  const project = layout.control.workspace;
  const target = path.join(project, ...AFTER_VIEW_CONTROL.target.split('/'));
  const source = path.join(project, ...AFTER_VIEW_CONTROL.source.split('/'));
  const instructions = INSTRUCTION_CANARIES.map((canary) => ({ path: canary.path, file: path.join(project, ...canary.path.split('/')),
    content: String(canary.content) }));
  const output = String(CANARIES.find((canary) => canary.location === 'work' && canary.path === AFTER_VIEW_CONTROL.target)?.content);
  const bases = [project, layout.control.temp];
  const prompt = afterViewPrompt(target);
  assertLogs(run);
  const log = createSessionLog('control', run.clock);
  // The discovery session is over; from here the run watches the fresh session's own log for overflow.
  started.entry.log = log;
  const deadlineAt = deadline(run, NATIVE_LIMITS.runtimeMs);
  /**
   * The relay's view of the control: its phase, log, readable files, and `bound`, what it has established so far (`UNVALIDATED`), which
   * every event of its session is judged against (`controlRefusals`).
   * @type {{open: boolean, deadlineAt: number, log: any, files: string[], bound: {sessionId: string | null, model: string | null,
   *   modelFrom: number | null, cwdFrom: number | null, sentAt: number | null, admission: string | null, argumentsSha256: string | null}}}
   */
  const control = { open: true, deadlineAt, log, files: [target, ...instructions.map((entry) => entry.file)],
    bound: { ...UNVALIDATED, argumentsSha256: sha256(canonical({ path: target })) } };
  /** @param {() => unknown} call @param {string} what */
  const ask = (call, what) => bounded(run, call, deadlineAt, 'ambient_state_unobservable', `the after-view control's ${what} did not answer within its phase`);
  /** The control runtime's reads of one control canary in one snapshot. @param {any} summary @param {string} file */
  const reads = (summary, file) => canaryReads(summary, descendantsOf(processTree(summary), run.keys.control),
    `work/${path.relative(project, file).split(path.sep).join('/')}`);
  try {
    const session = await bounded(run, () => started.client.createSession({
      ...structuredClone(AFTER_VIEW_CONTROL.session), model: values.models.a, workingDirectory: layout.control.temp,
      onPermissionRequest: controlPermissionRelay(run, control), onEvent: log.onEvent,
    }), deadlineAt, 'runtime_start_failed', 'the after-view control session was not created');
    started.entry.session = session;
    control.bound.sessionId = isRecord(session) && typeof session.sessionId === 'string' && session.sessionId ? session.sessionId : null;
    // Its creation is over: from here a start refuses, and from the moment the model check is asked, a model change refuses, even a
    // restatement of the same model, and a model the session states must be the checked one; one stated before it, such as its startup
    // selection, is superseded by the check itself.
    control.bound.modelFrom = log.state.events.length;
    const model = await ask(() => session.rpc.model.getCurrent(), 'current model');
    check(run, 'control_model', model?.modelId === values.models.a && model?.planBaseModelId === undefined,
      `current model ${String(model?.modelId).slice(0, 128)}${model?.planBaseModelId === undefined ? '' : ', in plan mode'}`, 'model_mismatch');
    control.bound.model = values.models.a;
    await ask(() => session.rpc.tools.initializeAndValidate(), 'tool initialization');
    const metadata = await ask(() => session.rpc.tools.getCurrentMetadata(), 'tool catalog');
    const descriptors = await ask(() => session.rpc.tools.getBuiltinDescriptors({}), 'built-in tool descriptors');
    const names = isRecord(metadata) && Array.isArray(metadata.tools) ? metadata.tools.map((/** @type {any} */ tool) => (isRecord(tool) ? tool.name : null)) : null;
    const accepted = descriptorAccepts(descriptors, AFTER_VIEW_CONTROL.tool, { path: target });
    check(run, 'control_tools', canonical(names) === canonical([AFTER_VIEW_CONTROL.tool]) && accepted,
      `${names ? names.length : 'no'} tool(s) offered; the installed view descriptor ${accepted ? 'accepts' : 'does not accept'} the fixed arguments`,
      'tool_offering_mismatch');
    // From the moment its check is asked, a working-directory change refuses too, even a restatement of the same one.
    control.bound.cwdFrom = log.state.events.length;
    const snapshot = await ask(() => session.rpc.metadata.snapshot(), 'metadata snapshot');
    check(run, 'control_session', Boolean(control.bound.sessionId) && isRecord(snapshot) && snapshot.sessionId === control.bound.sessionId
      && snapshot.isRemote === false && snapshot.alreadyInUse === false && typeof snapshot.workingDirectory === 'string'
      && samePath(snapshot.workingDirectory, layout.control.temp) && snapshot.currentMode === 'interactive'
      && (snapshot.selectedModel === undefined || snapshot.selectedModel === values.models.a),
    'a fresh local interactive session of the checked model working in the control\'s temp folder', 'ambient_state_unobservable');
    const initial = await ask(() => session.rpc.instructions.getSources(), 'loaded instruction sources');
    const preloaded = isRecord(initial) && Array.isArray(initial.sources) ? initial.sources.length : null;
    check(run, 'control_initial_sources', preloaded === 0, preloaded === null ? 'no readable source list' : `${preloaded} source(s) loaded before its prompt`,
      'ambient_state_unobservable');
    const before = await bounded(run, () => run.observer.snapshot(), deadlineAt, 'ambient_state_unobservable', 'the observer did not give the control baseline');
    // Everything the session sent before its prompt is judged at the last moment, and its turn begins with the send itself, with nothing
    // awaited in between: an event delivered at any point before, during the source query or the baseline wait included, stops the run
    // before anything is sent.
    const admission = await bounded(run, () => {
      const early = refusedEvents(log.state.events, control.bound);
      if (early.refusedEvents.length) {
        return stop('ambient_state_unobservable', `the after-view control session sent what it may not before its prompt; refused events: ${refusedNames(early)}`);
      }
      control.bound.sentAt = log.state.events.length;
      return session.send({ prompt });
    }, deadlineAt, 'ambient_state_unobservable', 'the after-view control prompt was not admitted');
    if (typeof admission !== 'string' || !admission) return stop('ambient_state_unobservable', 'send returned no admission ID for the after-view control');
    control.bound.admission = admission;
    await waitUntil(run, () => turnEnd(log.state.events, admission) >= 0, deadlineAt, 'ambient_state_unobservable',
      'the after-view control turn did not end within its phase');
    // No permission is asked once the turn ended; what the session sends from its end on is post-turn, whenever it is delivered.
    control.open = false;
    const after = await bounded(run, () => run.observer.snapshot(), deadlineAt, 'ambient_state_unobservable', 'the observer did not give the control reads');
    const loaded = await ask(() => session.rpc.instructions.getSources(), 'loaded instruction sources after its turn');
    const activation = checkAfterViewControl(log.state.events, { admission, prompt, target, output, source, instructions: instructions.map((entry) => entry.file),
      bases, bound: control.bound });
    const sources = controlSources(loaded, { source, instructions, bases });
    const os = { baselineMarker: before?.marker ?? null, marker: after?.marker ?? null, target: { before: reads(before, target), after: reads(after, target) },
      source: { before: reads(before, source), after: reads(after, source) } };
    const problems = [...new Set([...activation.problems, ...sources.problems,
      ...(observerHealth(before).length || observerHealth(after).length ? ['os_coverage'] : []),
      ...(os.target.after > os.target.before ? [] : ['os_target_read']), ...(os.source.after > os.source.before ? [] : ['os_source_read'])])];
    const account = refusedEvents(log.state.events, control.bound);
    run.report.control = { sessionId: control.bound.sessionId, ...(activation.proof ?? { admissionId: admission }), source: sources.source, os, problems,
      ...account };
    check(run, 'after_view_control', problems.length === 0, problems.length
      ? `${problems.join(', ')}${account.refusedEvents.length ? `; refused events: ${refusedNames(account)}` : ''}`
      : 'one model-requested view surfaced and loaded the fixed AGENTS.md canary: notification, source digest, output digest, and observed reads',
    'ambient_state_unobservable');
    return undefined;
  } finally {
    control.open = false;
    // Whatever ended the phase, its report names the events it refused, by type and class only, judged as its relay and final judgment
    // judge them.
    run.report.control = { ...run.report.control, ...refusedEvents(log.state.events, control.bound) };
  }
}

/**
 * Whether the after-view control's one admission can no longer be the one
 * running, read from its own session's events as they arrive, so a request
 * is withdrawn the moment such an event is delivered rather than when the
 * run next polls: its turn ended (`turnEnd`), or any event of its session
 * refuses (`controlRefusals`: a sub-agent's event, an abort, an error, another
 * prompt or operation, an activation, an undeclared or malformed event, a
 * change of its model or working directory after its check, or one stating
 * another session, model, admission, or tool call than the control
 * established). An idle before the admission, such as the session's startup
 * idle, ends nothing.
 * @param {any[]} events The control session's summarized events.
 * @param {Partial<typeof UNVALIDATED>} bound What the control has established (`UNVALIDATED`), its admission and view arguments' digest included.
 */
export function controlTurnOver(events, bound) {
  const established = { ...UNVALIDATED, ...bound };
  return turnEnd(events, established.admission) >= 0 || controlRefusals(events, established).some((kind) => kind !== null);
}

/**
 * The bounded, non-secret target one main-session permission request names,
 * kept in its report entry so a refusal can be read without the request: a
 * read's path,
 * a write's file name, a custom, MCP, or hook tool's name, a shell request's
 * parsed command names, or an extension request's extension name; null for
 * any other kind or a missing value. It is never a command's text, a tool's
 * arguments, file contents, a URL, or an environment value. Control and
 * bidirectional characters are escaped as on the terminal (`terminalSafe`).
 * A target over `NATIVE_LIMITS.targetBytes` UTF-8 bytes keeps only its first
 * characters, then `... (<N> bytes)` with the original's length, all within
 * that bound.
 * @param {unknown} request @returns {string | null}
 */
export function permissionTarget(request) {
  if (!isRecord(request)) return null;
  /** @type {unknown} */
  let value = null;
  if (request.kind === 'read') value = request.path;
  else if (request.kind === 'write') value = request.fileName;
  else if (request.kind === 'custom-tool' || request.kind === 'mcp' || request.kind === 'hook') value = request.toolName;
  else if (request.kind === 'shell' && Array.isArray(request.commands)) {
    value = request.commands.map((command) => (isRecord(command) && typeof command.identifier === 'string' ? command.identifier : '')).filter(Boolean).join(' ');
  } else if (typeof request.kind === 'string' && request.kind.startsWith('extension-')) value = request.extensionName;
  if (typeof value !== 'string' || !value) return null;
  const safe = terminalSafe(value);
  if (Buffer.byteLength(safe, 'utf8') <= NATIVE_LIMITS.targetBytes) return safe;
  const suffix = `... (${Buffer.byteLength(value, 'utf8')} bytes)`;
  let head = '';
  let used = Buffer.byteLength(suffix, 'utf8');
  for (const character of safe) {
    used += Buffer.byteLength(character, 'utf8');
    if (used > NATIVE_LIMITS.targetBytes) break;
    head += character;
  }
  return `${head}${suffix}`;
}

/**
 * One permission request's report entry, `{side, kind, asked, reason, answer,
 * target}`, which keeps a refusal's first reason. Only a main session's entry
 * names its `target` (`permissionTarget`): the after-view control's paths are
 * control evidence, which no report field but `control` carries. The report
 * keeps an entry for every request the human is asked about (`asked`), and
 * for at most `NATIVE_LIMITS.permissionEntries` others, refused or approved
 * under the consent alike, counting each further refusal only in
 * `permissionsOmitted`, so a model that repeats a request cannot push the
 * report past its bound. The main relay asks nothing. It keeps no entry for
 * a step's call or read that it approves itself, which `toolApprovals` only
 * counts; it keeps one, once decided, for a phase's exact action that it
 * approves itself (`consented`, never `asked`) and for a refused request. An
 * approval beyond the bound keeps no entry and is still counted in
 * `toolApprovals`. The control relay, which approves nothing itself, keeps
 * its entry from the request's arrival (`pending`), within the same bound.
 * @param {any} run @param {string} side @param {unknown} request
 */
function permissionEntry(run, side, request) {
  const kind = isRecord(request) && typeof request.kind === 'string' ? request.kind.slice(0, 32) : 'unknown';
  const entry = { side, kind, asked: false, reason: /** @type {string | null} */ (null), answer: /** @type {string | null} */ (null),
    ...(side === 'control' ? {} : { target: permissionTarget(request) }) };
  /** @type {'none' | 'kept' | 'counted'} */
  let state = 'none';
  /** Keep the entry once, if it was asked or the bound leaves room; otherwise count it once it is refused. @param {boolean} refused */
  const keep = (refused) => {
    if (state !== 'none') return;
    const permissions = (run.report.permissions ??= []);
    if (entry.asked || permissions.filter((/** @type {any} */ kept) => !kept.asked).length < NATIVE_LIMITS.permissionEntries) {
      permissions.push(entry);
      state = 'kept';
    } else if (refused) {
      run.report.permissionsOmitted = (run.report.permissionsOmitted ?? 0) + 1;
      state = 'counted';
    }
  };
  return {
    entry,
    /** Keep the entry while the request is still undecided, within the bound. */
    pending: () => keep(false),
    /** The human is now asked about the request. */
    asked: () => {
      entry.asked = true;
      keep(false);
    },
    /** The main relay approves the request itself, once, under the typed consent; no person answered it. */
    consented: () => {
      entry.answer = CONSENTED;
      keep(false);
      return { kind: 'approve-once' };
    },
    /** @param {string} reason */
    refuse: (reason) => {
      entry.reason ??= reason;
      keep(true);
      return { kind: 'reject', feedback: 'This action is not part of the authorized qualification run.' };
    },
  };
}

/**
 * The fixed control-only permission relay over the existing human queue. It
 * asks the human only about a read the after-view control session's sole
 * pending model-requested view needs (`matchControlPermission`). Before the
 * request is shown and again after the answer, that call must still be the
 * sole pending model request and incomplete, the request unchanged, the
 * control phase open before its deadline, its admission's turn neither ended
 * nor interfered with by its session's own events (`controlTurnOver`), the
 * consent current, the run open, the scope current, and every log intact;
 * the prompt is released by the earliest of the permission bound, the phase
 * deadline, and the scope's expiry. Only a freshly entered
 * `approve-once` approves it, once. It is registered only on that session:
 * it never answers for a main session or the worker, and it computes no
 * approval. Each request keeps a bounded entry (`permissionEntry`).
 * @param {any} run
 * @param {{open: boolean, deadlineAt: number, log: {state: {events: any[]}}, files: readonly string[], bound: Partial<typeof UNVALIDATED>}} control
 *   `bound` is what the control has established so far (`UNVALIDATED`): its session, admission, and view arguments' digest among it.
 */
export function controlPermissionRelay(run, control) {
  /** @param {unknown} request @param {unknown} invocation */
  return async (request, invocation) => {
    const toolCallId = isRecord(request) && typeof request.toolCallId === 'string' ? request.toolCallId : '';
    const record = permissionEntry(run, 'control', request);
    record.pending();
    const { entry, refuse } = record;
    const kind = entry.kind;
    const open = () => control.open && !run.closing && run.report.consent?.status === 'granted' && run.clock() < control.deadlineAt && !expired(run)
      && !overflowedLog(run) && !controlTurnOver(control.log.state.events, control.bound);
    const pending = () => soleViewRequest(control.log.state.events, control.bound.admission ?? null, control.bound.argumentsSha256 ?? '');
    /** @param {string | null} current */
    const decide = (current) => matchControlPermission(request, invocation, { sessionId: control.bound.sessionId ?? null, pending: current,
      files: control.files });
    // The model's request event can trail the callback: wait for it within a short bound that the phase deadline also ends.
    const requestBy = Math.min(control.deadlineAt, deadline(run, NATIVE_LIMITS.requestMs));
    while (toolCallId && pending() !== toolCallId && run.clock() < requestBy && open()) await delay(NATIVE_LIMITS.pollMs);
    const decision = decide(pending());
    if (!decision.ask) return refuse(decision.reason);
    if (!open()) return refuse('not_pending');
    record.asked();
    const fingerprint = sha256(canonical({ toolCallId, kind, summary: decision.summary }));
    const valid = () => {
      if (!open() || pending() !== toolCallId) return false;
      if (control.log.state.events.some((event) => event.type === 'tool.execution_complete' && event.toolCallId === toolCallId)) return false;
      const again = decide(toolCallId);
      return again.ask && sha256(canonical({ toolCallId, kind, summary: again.summary })) === fingerprint;
    };
    const answer = await run.human.ask(ANSWER_PROMPT, {
      deadlineAt: Math.min(control.deadlineAt, deadline(run, NATIVE_LIMITS.permissionMs), run.expiresAtMs), valid,
      preface: `\n[CONTROL permission] ${terminalLines(decision.summary)}`, action: CONTROL_PERMISSION_ACTION,
    });
    entry.answer = answer.ok ? answer.line : answer.reason;
    if (!answer.ok) return refuse(answer.reason);
    if (answer.line !== PERMISSION_ANSWERS.approve) return refuse('operator_rejected');
    if (!valid()) {
      entry.answer = 'approval_withdrawn';
      return refuse('approval_withdrawn');
    }
    return { kind: 'approve-once', approvedInteractively: true };
  };
}

/**
 * Whether `asked` is still the session's current open phase, within an open run, the scope, and intact logs, with its admission's turn
 * not yet ended as this session's own events show it (`turnEnd`); that end can arrive before the run closes the phase. A capture phase
 * also ends at a later root prompt (`laterPrompt`).
 * @param {any} run @param {string} side @param {any} asked @param {{state: {events: any[]}}} log The session's own event log.
 */
function phaseOpen(run, side, asked, log) {
  return !run.closing && run.allow[side] === asked && asked.phase !== 'closed' && turnEnd(log.state.events, asked.admission) < 0
    && (asked.phase !== 'capture' || !laterPrompt(log.state.events, asked.admission)) && !expired(run) && !overflowedLog(run);
}

/**
 * Whether a user message other than a sub-agent's came after an admission's own: a later root prompt, or one whose agent ID is
 * malformed, which is never a sub-agent's.
 * @param {any[]} events @param {string | null | undefined} admission
 */
function laterPrompt(events, admission) {
  const admitted = events.findIndex((event) => event.type === 'user.message' && event.messageId === admission);
  return admitted >= 0 && events.some((event, index) => index > admitted && event.type === 'user.message' && typeof event.agent !== 'string');
}

/**
 * Whether `tools` is still the side's current step allowance, within an open run with consent granted, the scope, and intact logs, with
 * its admission's turn not yet ended as this session's own events show it (`turnEnd`); that end can arrive before the run clears it.
 * @param {any} run @param {string} side @param {ToolAllowance | null} tools @param {{state: {events: any[]}}} log The session's own event log.
 */
function stepOpen(run, side, tools, log) {
  return tools !== null && !run.closing && run.report.consent?.status === 'granted' && !expired(run) && !overflowedLog(run)
    && (run.allow[side]?.tools ?? null) === tools && turnEnd(log.state.events, tools.admission) < 0;
}

/** A main session's permission state while nothing is pending: no open phase and no step allowance. */
const CLOSED_ALLOW = Object.freeze({ sessionId: '', phase: 'closed', admission: null, progress: null, capture: null, tools: null });

/**
 * The fixed main-session permission relay. The allow object current when a
 * request arrives is its phase and step identity; the current admission is
 * the step allowance's while one is set, and otherwise the phase's (a step
 * that opens a phase sets its allowance for the same admission first). After
 * a short bounded wait for this session's own model request event, which can
 * trail the callback, while the phase or the step's allowance is open, the
 * request is decided (`matchPermission`). The relay asks no one: what the
 * typed consent covers is approved once by the relay itself, never claimed as
 * a person's approval, and everything else is refused.
 *
 * One of the step's exact Dude tool calls, or a read inside the session's own
 * workspace that the step allows, is approved while its step is open. Right
 * before that answer, the run must still be open with consent granted, the
 * scope current, and every log intact, the allowance must still be the side's
 * current one with its turn not ended (`stepOpen`: this session's own root
 * idle, aborted or not, ends it even before the run clears it), and the call
 * must still be requested by its admission and not completed; otherwise it is
 * refused as `approval_withdrawn`. Each such approval is only counted, per
 * side, in the report's `toolApprovals`, by tool and operation or as
 * `workspace.read`, a closed set of keys that keeps it bounded.
 *
 * One of the open phase's exact actions is approved while that phase is open,
 * bound to its exact effect. Right before that answer, consent must still be
 * granted, the phase must still be the side's current open one, within an
 * open run, the scope, and intact logs, with its admission's turn not ended
 * (`phaseOpen`), the call must still be requested by its admission, or still
 * be the same live Spec Lead's, and not completed, and the request, matched
 * again, must still be the same action with the same effect; otherwise it is
 * refused as `approval_withdrawn`. Each such approval is counted under its own
 * closed key (`PHASE_ACTIONS`) and keeps a bounded entry answered `consented`.
 *
 * Everything else is refused. `not_pending` means that no open phase or step
 * allows the request: `matchPermission` found none that does, or, while
 * neither is open, its model did not request it, which is then refused as
 * `not_pending` rather than as one its model did not request. A request that
 * matched, but whose phase or step closed, or that otherwise stopped being
 * allowed, before the answer is refused as `approval_withdrawn` (above), even
 * when neither is open by then. Each refused request keeps a bounded entry
 * (`permissionEntry`).
 *
 * In the capture phase alone, a request that the root model did not make may
 * be the installed Spec Lead's: the callback names A's session, never an
 * agent, and the runtime hands it to the relay before it delivers the
 * request's own events, so the relay waits within the same bound for the
 * events that prove it (`specLeadRequest`) and refuses it with that proof's
 * reason, as `spec_lead_<reason>`, when they never do. The proof is computed
 * again right before the answer, and any other sub-agent, a change of
 * sub-agent or task, the end of that task, its sub-agent, or the call, the
 * request's own permission completing, a root idle or later root prompt, a
 * closed phase, the run closing, an overflowed log, or the scope expiring
 * refuses it. The approval is bound to the admission, the sub-agent and its
 * task call, the request's exact digest, and the effect.
 * @param {any} run @param {'a' | 'b'} side @param {{state: {events: any[]}}} log The session's own event log.
 */
export function permissionRelay(run, side, log) {
  /** @param {unknown} request @param {unknown} invocation */
  return async (request, invocation) => {
    const asked = run.allow[side] ?? CLOSED_ALLOW;
    /** @type {ToolAllowance | null} */
    const tools = asked.tools ?? null;
    const admission = tools ? tools.admission : asked.admission;
    const toolCallId = isRecord(request) && typeof request.toolCallId === 'string' ? request.toolCallId : '';
    const record = permissionEntry(run, side, request);
    const { entry, refuse } = record;
    const kind = entry.kind;
    const requestSha256 = isRecord(request) ? sha256(canonical(request)) : null;
    const requested = () => Boolean(toolCallId) && requestedBy(log.state.events, toolCallId, admission);
    /** @type {SpecLeadNames | null} */
    const delegate = asked.phase === 'capture' && isRecord(asked.capture?.delegate) ? asked.capture.delegate : null;
    const delegated = () => (delegate && toolCallId && requestSha256
      ? specLeadRequest(log.state.events, toolCallId, requestSha256, { ...delegate, admission: asked.admission }) : null);
    const open = () => phaseOpen(run, side, asked, log) || stepOpen(run, side, tools, log);
    const completed = () => log.state.events.some((event) => event.type === 'tool.execution_complete' && event.toolCallId === toolCallId);
    // The model's request event can trail the callback, and a sub-agent's events always do: wait for them within a short bound on the run
    // clock, while the phase or the step's allowance is open (an exchange step opens no phase until its progress interval).
    const requestBy = deadline(run, NATIVE_LIMITS.requestMs);
    while (toolCallId && !requested() && !delegated()?.ok && run.clock() < requestBy && open()) await delay(NATIVE_LIMITS.pollMs);
    const proof = requested() ? null : delegated();
    const child = proof?.ok ? { agentId: proof.agentId, taskCallId: proof.taskCallId } : null;
    // Still made by whom it was: the root model for this admission, or the same live Spec Lead in the same task.
    const still = () => {
      if (!child) return requested();
      const now = delegated();
      return Boolean(now?.ok) && now?.agentId === child.agentId && now?.taskCallId === child.taskCallId;
    };
    const decision = matchPermission(request, invocation, { ...asked, tools, requested: requested() ? [toolCallId] : [], child });
    if ('reason' in decision) {
      if (!open() && decision.reason === 'not_model_requested') return refuse('not_pending');
      return refuse(decision.reason === 'not_model_requested' && proof && !proof.ok && proof.reason !== 'unrequested' ? `spec_lead_${proof.reason}` : decision.reason);
    }
    /** Count one approval, per side, under its closed key. @param {string} key */
    const count = (key) => {
      const counts = ((run.report.toolApprovals ??= {})[side] ??= {});
      counts[key] = (counts[key] ?? 0) + 1;
    };
    if (decision.summary === undefined) {
      if (!stepOpen(run, side, tools, log) || !still() || completed()) return refuse('approval_withdrawn');
      count(decision.relay);
      return { kind: 'approve-once' };
    }
    // One of the open phase's exact actions: its approval is bound to the admission, its requester, the request's digest, and its effect.
    const actor = child ?? 'root';
    const fingerprint = sha256(canonical({ toolCallId, kind, relay: decision.relay, summary: decision.summary, admission, actor, requestSha256 }));
    const valid = () => {
      if (run.report.consent?.status !== 'granted' || !phaseOpen(run, side, asked, log) || !still() || completed()) return false;
      const again = matchPermission(request, invocation, { ...asked, tools, requested: child ? [] : [toolCallId], child });
      return 'relay' in again && again.summary !== undefined
        && sha256(canonical({ toolCallId, kind, relay: again.relay, summary: again.summary, admission, actor, requestSha256 })) === fingerprint;
    };
    if (!valid()) return refuse('approval_withdrawn');
    count(decision.relay);
    return record.consented();
  };
}

/**
 * Set one main's step allowance (`ToolAllowance`), or clear it with null.
 * Only the allowance changes; the open phase, if any, is unchanged.
 * @param {any} run @param {'a' | 'b'} side @param {ToolAllowance | null} tools
 */
function allowTools(run, side, tools) {
  run.allow[side] = { ...run.allow[side], tools };
}

/** @param {any} run */
async function startMains(run) {
  const layout = /** @type {Layout} */ (run.layout);
  const { values } = run.scope;
  const core = renderedCore(run.scope.repoRoot);
  const agentRow = core.rows.find((row) => row[0] === '.github/agents/dude.agent.md');
  for (const side of /** @type {const} */ (['b', 'a'])) {
    const folders = layout[side];
    const started = await startRuntime(run, side, folders);
    const log = started.log;
    run.allow[side] = { ...CLOSED_ALLOW };
    const session = await bounded(run, () => started.client.createSession({
      model: values.models[side],
      workingDirectory: folders.workspace,
      enableConfigDiscovery: true,
      requestExtensions: true,
      extensionSdkPath: values.sdk,
      enableHostGitOperations: false,
      enableSessionStore: false,
      memory: { enabled: false },
      enableSessionTelemetry: false,
      onPermissionRequest: permissionRelay(run, side, log),
      onEvent: log.onEvent,
    }), deadline(run, NATIVE_LIMITS.runtimeMs), 'runtime_start_failed', `the ${side} session was not created`);
    started.entry.session = session;
    run.allow[side] = { ...run.allow[side], sessionId: session.sessionId };
    // A normal main's own runtime and its actual new session must report the expected account before anything else is asked of it.
    if (run.normal) await mainAccounts(run, side, started.client, session);
    const extension = await waitUntil(run, async () => {
      const listed = await session.rpc.extensions.list().catch(() => null);
      const found = isRecord(listed) && Array.isArray(listed.extensions) ? listed.extensions.filter((/** @type {any} */ item) => item?.id === 'project:dude') : [];
      return found.length === 1 && found[0].status === 'running' && Number.isSafeInteger(found[0].pid) ? found[0] : null;
    }, deadline(run, NATIVE_LIMITS.runtimeMs), 'extension_not_running', `the ${side} session has no running project:dude extension`);
    // No observer runs for a normal main, so its extension's process is not observed: only the pid the session lists is kept.
    const tree = run.normal ? null : processTree(await run.observer.snapshot());
    const extensionNode = tree ? liveByPid(tree, extension.pid) : null;
    if (tree) {
      check(run, `${side}_extension_process`, Boolean(extensionNode?.pinned && descendantsOf(tree, run.keys[side]).has(extensionNode.key)),
        `project:dude pid ${extension.pid} ${extensionNode?.pinned ? 'is' : 'is not'} a pinned observed live descendant of the ${side} runtime`,
        'runtime_identity_unobserved');
    }
    /** @param {() => Promise<any>} call @param {string} what @param {string} reason */
    const ask = (call, what, reason) => bounded(run, call, deadline(run, NATIVE_LIMITS.runtimeMs), reason, `the ${side} session's ${what} did not answer`);
    const dudeFile = path.join(folders.workspace, '.github', 'agents', 'dude.agent.md');
    const agents = await ask(() => session.rpc.agent.list({ includePrompt: false }), 'agent list', 'agent_unverified');
    const candidates = (agents?.agents ?? []).filter((/** @type {any} */ agent) => agent?.source === 'project' && typeof agent.path === 'string'
      && samePath(agent.path, dudeFile));
    const agentSha = fs.existsSync(dudeFile) ? sha256(fs.readFileSync(dudeFile)) : '';
    check(run, `${side}_agent_source`, candidates.length === 1 && Boolean(agentRow) && agentSha === agentRow?.[2],
      `${candidates.length} project agent(s) at the rendered dude.agent.md; file sha256 ${agentSha.slice(0, 16)}`, 'agent_unverified');
    const agent = candidates[0];
    const selected = await ask(() => session.rpc.agent.select({ name: agent.id }), 'agent selection', 'agent_unverified');
    const current = await ask(() => session.rpc.agent.getCurrent(), 'current agent', 'agent_unverified');
    check(run, `${side}_agent_selected`, selected?.agent?.id === agent.id && current?.agent?.id === agent.id,
      `selected stable ID ${agent.id}`, 'agent_unverified');
    const model = await ask(() => session.rpc.model.getCurrent(), 'current model', 'model_mismatch');
    check(run, `${side}_model`, model?.modelId === values.models[side], `current model ${String(model?.modelId).slice(0, 128)}`, 'model_mismatch');
    // The catalog lists only the session's initialized tools (null before initialization), so they are initialized first.
    await ask(() => session.rpc.tools.initializeAndValidate(), 'tool initialization', 'tool_offering_mismatch');
    const metadata = await ask(() => session.rpc.tools.getCurrentMetadata(), 'tool metadata', 'tool_offering_mismatch');
    const names = Array.isArray(metadata?.tools) ? metadata.tools.map((/** @type {any} */ tool) => tool?.name) : [];
    check(run, `${side}_tool_offering`, DUDE_TOOLS.every((name) => names.includes(name)), `${names.length} tools offered`, 'tool_offering_mismatch');
    // A's capture delegates its staging to the installed Spec Lead, which A's own session must list and its task tool select.
    const delegate = side === 'a' ? specLeadOf(run, folders.workspace, core, agents, metadata) : null;
    run.mains[side] = { client: started.client, session, log, status: started.status, extension: { pid: extension.pid, key: extensionNode?.key },
      agent: { id: agent.id, sha256: agentSha }, delegate };
    run.report.host.runtime ??= started.status;
  }
}

/**
 * The installed Spec Lead that A's capture may delegate staging to, checked
 * in A's own session as `a_spec_lead` and `a_task_tool` before any prompt:
 * exactly one project agent at the rendered `SPEC_LEAD` path, whose file
 * holds the rendered bytes, and of the names the runtime lists it by (its
 * stable ID, name, and display name), those no other listed agent uses; and
 * exactly one initialized `task` tool whose input schema declares the agent
 * and mode arguments (`TASK`), with `sync` and at least one of those names
 * among the values each accepts where it lists them. Only names checked here
 * select the Spec Lead or identify it once started (`specLeadRequest`), so a
 * free-text description or a display name some other agent shares never
 * does. `invoke` is the one the capture instruction names: its listed name
 * when the task tool accepts it, else the first that tool accepts. `named`
 * is whether that schema declares a `name` argument or requires one, as the
 * native task tool requires one (a call without it failed with
 * `"name": Required`, run e9b8ef84-357e-44e6-8c38-9ee5de7970c3); it only has
 * the capture instruction give each task a name, and selects or attributes
 * nothing.
 * @param {any} run @param {string} workspace @param {ReturnType<typeof renderedCore>} core @param {any} agents @param {any} metadata
 * @returns {SpecLeadNames & {invoke: string, named: boolean}}
 */
function specLeadOf(run, workspace, core, agents, metadata) {
  const file = path.join(workspace, ...SPEC_LEAD.split('/'));
  const row = core.rows.find((entry) => entry[0] === SPEC_LEAD);
  const listed = Array.isArray(agents?.agents) ? agents.agents.filter(isRecord) : [];
  const found = listed.filter((agent) => agent.source === 'project' && typeof agent.path === 'string' && samePath(agent.path, file));
  const digest = fs.existsSync(file) ? sha256(fs.readFileSync(file)) : '';
  const lead = found.length === 1 && row && digest === row[2] ? found[0] : null;
  /** @param {Record<string, unknown>} agent */
  const labels = (agent) => [agent.id, agent.name, agent.displayName];
  const names = lead ? [...new Set(labels(lead))].filter((value) => presentText(value, 128)
    && listed.every((agent) => agent === lead || !labels(agent).includes(value))).map(String) : [];
  check(run, 'a_spec_lead', names.length > 0, `${found.length} project agent(s) at the rendered dude-spec-lead.agent.md; file sha256 `
    + `${digest.slice(0, 16)}; ${names.length} name(s) no other listed agent uses`, 'agent_unverified');
  const tools = Array.isArray(metadata?.tools) ? metadata.tools.filter((/** @type {any} */ tool) => isRecord(tool) && tool.name === TASK.tool) : [];
  const schema = tools.length === 1 && isRecord(tools[0].input_schema) ? tools[0].input_schema : {};
  const properties = isRecord(schema.properties) ? schema.properties : {};
  /** @param {unknown} property @param {string} value */
  const accepts = (property, value) => isRecord(property) && (!Array.isArray(property.enum) || property.enum.includes(value));
  const selectors = names.filter((value) => accepts(properties[TASK.agent], value));
  const sync = accepts(properties[TASK.mode], TASK.sync);
  check(run, 'a_task_tool', tools.length === 1 && selectors.length > 0 && sync, `${tools.length} ${TASK.tool} tool(s); ${selectors.length} of its `
    + `${TASK.agent} value(s) select the Spec Lead; ${TASK.mode} ${sync ? 'accepts' : 'does not accept'} ${TASK.sync}`, 'tool_offering_mismatch');
  const invoke = selectors.includes(String(lead?.name)) ? String(lead?.name) : selectors[0];
  const named = Object.hasOwn(properties, 'name') || (Array.isArray(schema.required) && schema.required.includes('name'));
  return Object.freeze({ names: Object.freeze(names), selectors: Object.freeze(selectors), invoke, named });
}

/**
 * Send one root prompt within its bound and return the admission ID `send`
 * gave it, which correlates every later root event of that instruction.
 * Refused while that session's operation is pending: a new root prompt would end it.
 * A version-3 main's account pair is observed first (`mainAccounts`); once
 * that wait settles, the pending operations, run, scope, and logs are checked
 * again before the prompt is sent, with no other wait between them.
 * @param {any} run @param {'a' | 'b'} side @param {string} prompt @param {string} reason
 */
async function sendPrompt(run, side, prompt, reason) {
  if (run.pending.has(side)) return stop('internal_error', `a root prompt was requested while ${side}'s operation is pending`);
  if (run.normal) {
    await mainAccounts(run, side, run.mains[side].client, run.mains[side].session);
    if (run.pending.has(side)) return stop('internal_error', `a root prompt was requested while ${side}'s operation is pending`);
  }
  const id = await bounded(run, () => run.mains[side].session.send({ prompt }), deadline(run, NATIVE_LIMITS.runtimeMs), reason,
    `${side}'s prompt was not admitted`);
  if (typeof id !== 'string' || !id) return stop(reason, 'send returned no message ID');
  run.admissions[side] = id;
  return id;
}

/**
 * Wait for the turn a message started to end: a root user message with that
 * ID, then the root's own later idle (`turnEnd`), with no other root prompt
 * between them; a sub-agent's idle, aborted or not, ends nothing here. An
 * aborted turn stops the run. The turn has `turnMs` on the run clock; the
 * consented scope's expiry ends it sooner when that comes first.
 * @param {any} run @param {'a' | 'b'} side @param {string} messageId @param {string} reason
 * @param {number} [turnMs] Only A's capture passes its own, `NATIVE_LIMITS.captureTurnMs`.
 */
async function waitForTurn(run, side, messageId, reason, turnMs = NATIVE_LIMITS.turnMs) {
  const events = run.mains[side].log.state.events;
  const turn = await waitUntil(run, () => {
    const start = events.findIndex((/** @type {any} */ event) => event.type === 'user.message' && event.messageId === messageId);
    const end = start < 0 ? -1 : turnEnd(events, messageId);
    if (end < 0) return null;
    return { idle: events[end], later: events.slice(start + 1, end).some((/** @type {any} */ event) => event.type === 'user.message' && event.root) };
  }, deadline(run, turnMs), reason, `${side}'s turn did not end`);
  if (turn.later) stop(reason, `another root prompt reached ${side} during this instruction`);
  if (turn.idle.aborted) stop(reason, `${side}'s turn was aborted`);
}

/** @param {any} run @param {'a' | 'b'} side */
async function approveProposal(run, side) {
  const main = run.mains[side];
  const layout = /** @type {Layout} */ (run.layout);
  const propose = { configPath: layout[side].a2aConfig, profileId: side };
  const message = await sendPrompt(run, side, proposePrompt(propose.configPath, propose.profileId), 'proposal_unavailable');
  // Under the typed consent, this step's exact proposal call is the one Dude tool call its relay approves, until its turn ends.
  allowTools(run, side, toolAllowance(message, { propose }));
  await waitForTurn(run, side, message, 'proposal_unavailable');
  allowTools(run, side, null);
  const proposal = proposalOf(main.log.state.events, { sessionId: main.session.sessionId, worker: side === 'b', runId: run.runId,
    ...(run.normal && side === 'b' ? { signIn: run.scope.values.auth.worker.expectedAccount } : {}) });
  main.providerGeneration = proposal.providerGeneration;
  run.report.operations[`proposal_${side}`] = { bytes: Buffer.byteLength(proposal.text, 'utf8'), sha256: sha256(proposal.text) };
  run.human.show(`\n=== Session ${side.toUpperCase()}: complete native dude_a2a_propose result (${Buffer.byteLength(proposal.text, 'utf8')} bytes) ===\n`
    + `${terminalLines(proposal.text)}\n=== end of session ${side.toUpperCase()} result ===`);
  const answer = await run.human.ask(ANSWER_PROMPT, { deadlineAt: deadline(run, NATIVE_LIMITS.approvalMs), action: approvalAction(side, proposal.text) });
  if (!answer.ok || !APPROVAL_SHAPE.test(answer.line)) return stop('approval_input_refused', `no fresh approval line for ${side}`);
  if (answer.line === 'dude a2a stop') return stop('approval_input_refused', `the operator declined session ${side}'s proposal`);
  const relayed = await sendPrompt(run, side, answer.line, 'approval_attribution_refused');
  const event = await waitUntil(run, () => main.log.state.events.find((/** @type {any} */ entry) => entry.type === 'user.message' && entry.messageId === relayed),
    deadline(run, 15_000), 'approval_attribution_refused', 'the relayed line produced no root user message');
  check(run, `${side}_approval_event`, event.root && event.source === null && event.classified === 'approve' && event.contentSha256 === sha256(answer.line),
    `classifier ${event.classified}; source ${event.source ?? 'none'}`, 'approval_attribution_refused');
  const role = side === 'b' ? 'serve' : 'ask';
  await waitUntil(run, () => main.log.state.events.some((/** @type {any} */ entry) => typeof entry.message === 'string'
    && entry.message.startsWith(`Activation: active; ${role} profile ${side}`)), deadline(run, 30_000), 'activation_not_observed', `no ${role} activation notice`);
  await waitForTurn(run, side, relayed, 'activation_not_observed');
}

/**
 * Follow one journal live through the shipped read-only tail, showing each
 * escaped line to the human and keeping it for the retained comparison.
 * @param {any} run @param {'a' | 'b'} side @param {string} root @param {string} operationId
 */
function follow(run, side, root, operationId) {
  const controller = new AbortController();
  /** @type {string[]} */
  const lines = [];
  let bytes = 0;
  const done = readTranscript({
    root, operationId, follow: true, signal: controller.signal,
    write: (line) => {
      bytes += Buffer.byteLength(line, 'utf8');
      if (bytes > NATIVE_LIMITS.liveBytes) {
        controller.abort();
        return;
      }
      lines.push(line);
      run.human.show(`[${side.toUpperCase()} live] ${line.replace(/\n$/, '')}`);
    },
  }).catch(() => null);
  run.followers.push({ side, root, operationId, lines, done, controller });
}

/**
 * How a journal's worker ended, from its `worker_finished` record, for a
 * stop's detail: its outcome and reason, each only as a closed token, and an
 * unexpected native effect's trigger only from the product's closed list.
 * Empty when the journal has no such record.
 * @param {any[]} records
 */
function workerEnding(records) {
  const data = recordsOf(records, 'worker_finished')[0]?.data;
  if (!isRecord(data)) return '';
  /** @param {unknown} value */
  const token = (value) => (typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : 'unknown');
  const trigger = /** @type {readonly unknown[]} */ (WORKER_EFFECT_TRIGGERS).includes(data.detail) ? `, ${data.detail}` : '';
  return `; its worker ended ${token(data.outcome)} (${token(data.reason)}${trigger})`;
}

/**
 * Wait for one record kind in a journal by an absolute deadline. A terminal
 * record before it means the operation ended first; its outcome and reason
 * are reported, with how its worker ended when the journal recorded that.
 * @param {any} run @param {string} file @param {string} kind @param {number} deadlineAt
 */
async function waitForRecord(run, file, kind, deadlineAt) {
  return waitUntil(run, () => {
    const records = readJournal(file);
    const found = records.find((record) => record.kind === kind);
    if (found) return found;
    const terminal = records.find((record) => record.kind === 'terminal');
    if (terminal && !['terminal', 'cleanup', 'closed'].includes(kind)) {
      stop('worker_refused', `the operation ended ${terminal.data?.outcome} (${terminal.data?.reason}) before ${kind}${workerEnding(records)}`);
    }
    return null;
  }, deadlineAt, 'journal_mismatch', `no ${kind} record appeared`);
}

/**
 * Process roles from the observed tree: this process, the calibration
 * helper, the control runtime, each main runtime's subtree, and each served
 * worker's runtime subtree inside B's.
 * @param {any} run @param {ProcessTree} tree
 */
function rolesOf(run, tree) {
  /** @type {Map<string, any>} */
  const roles = new Map([[run.keys.root, 'root']]);
  if (run.keys.helper) roles.set(run.keys.helper, 'helper');
  for (const [key, role] of /** @type {Array<[string, string]>} */ ([['control', 'control'], ['a', 'a'], ['b', 'b']])) {
    if (run.keys[key]) for (const member of descendantsOf(tree, run.keys[key])) roles.set(member, role);
  }
  for (const worker of run.workerKeys) for (const member of descendantsOf(tree, worker)) roles.set(member, 'worker');
  return roles;
}

/**
 * The coverage check row `[id, passed, detail, reason]` of one summary: the
 * observer's own health (`observerHealth`), mapped to its closed reason, an
 * overflow first, then an identity gap, else lost coverage. A final summary
 * must also show a complete drain.
 * @param {any} summary @param {boolean} final @returns {[string, boolean, string, string]}
 */
function coverageRow(summary, final) {
  const health = observerHealth(summary, { final });
  return ['coverage', health.length === 0, health.join(', ') || (final ? 'continuous to the end, and drained' : 'continuous'),
    health.includes('overflow') ? 'observer_overflow' : health.includes('identityGaps') ? 'observer_identity_uncertain' : 'observer_coverage_lost'];
}

/**
 * The coverage, identity, storage, and effect findings of one summary, as
 * check rows `[id, passed, detail, reason]`. A final summary must also show a
 * complete drain. Nothing throws here.
 * @param {any} run @param {any} summary @param {ProcessTree} tree @param {boolean} final
 * @returns {Array<[string, boolean, string, string]>}
 */
function summaryChecks(run, summary, tree, final) {
  /** @type {Map<string, string>} */
  const dirs = new Map();
  for (const [worker, dir] of run.workerDirs) for (const member of descendantsOf(tree, worker)) dirs.set(member, dir);
  const found = accessViolations(summary, rolesOf(run, tree), { workerDirs: dirs, workerImages: run.workerImages, workspaces: run.workspaces });
  return [
    coverageRow(summary, final),
    ['identity', found.identity.length === 0, found.identity.slice(0, 8).join(', ') || 'every owned identity pinned', 'observer_identity_uncertain'],
    ['storage', found.unclassified.length === 0, found.unclassified.slice(0, 8).join(', ') || 'classified', 'ambient_storage_unclassified'],
    ['effects', found.forbidden.length === 0 && found.canary.length === 0, [...found.forbidden, ...found.canary].slice(0, 8).join(', ') || 'none',
      'unexpected_native_effect'],
  ];
}

/**
 * One synchronized observation of everything so far: complete coverage,
 * pinned identities, no forbidden or unclassified access, no canary touched by
 * a worker, and no unverified worker image.
 * @param {any} run @param {string} label
 */
async function observedClean(run, label) {
  const summary = await run.observer.snapshot();
  const tree = processTree(summary);
  for (const [id, passed, detail, reason] of summaryChecks(run, summary, tree, false)) check(run, `${label}_${id}`, passed, detail, reason);
  return { summary, tree };
}

/**
 * Validate a served worker's startup and release its first prompt: the
 * recorded preflight must describe this operation, session, permit, loaders,
 * SDK files, extension process, runtime, fixture, and its own session storage;
 * the observer must show its runtime as one new pinned CLI process inside B's
 * extension that loaded the payload. A recorded session workspace must still
 * be that directory, by path, device, and inode, before it is associated with
 * that pinned process tree; observed absence associates none and grants no
 * persistence. Only then is every file access the observer accumulated since
 * it started, including what happened before this association, classified
 * by role, area, and documented purpose, and the release written.
 * @param {any} run @param {string} journal @param {string} operationId
 */
async function releaseStartup(run, journal, operationId) {
  const layout = /** @type {Layout} */ (run.layout);
  const b = run.mains.b;
  const label = operationId.slice(0, 8);
  const started = await waitForRecord(run, journal, 'worker_started', deadline(run, 30_000));
  const startedAt = Date.parse(started.time);
  const preflight = await waitForRecord(run, journal, 'worker_preflight', deadline(run, NATIVE_LIMITS.startupMs + 5_000));
  const records = readJournal(journal);
  const admitted = records.find((record) => record.kind === 'request_admitted')?.data ?? {};
  /** @type {any} */
  let request = {};
  try {
    request = JSON.parse(admitted.text);
  } catch {
    request = {};
  }
  const binding = {
    operationId, mainSessionId: b.session.sessionId, providerGeneration: b.providerGeneration, configDigest: run.prepared.configDigests.b,
    projectId: run.scope.values.projectId, conversationId: request.conversationId, questionId: admitted.messageId, exchangeId: admitted.exchangeId,
  };
  if (run.normal) return releaseNormalStartup(run, { journal: started, preflight: preflight.data, binding, operationId, label });
  const problems = checkPreflight(preflight.data, {
    workerId: started.data?.workerId,
    binding,
    runId: run.runId,
    fixtureSha256: run.prepared.manifest.sha256,
    canaries: run.prepared.manifest.canaries,
    canaryBytes: run.prepared.manifest.canaryBytes,
    sdk: run.scope.artifacts.sdk,
    extensionPid: b.extension.pid,
    runtime: b.status,
    model: run.scope.values.models.worker,
    storageParent: layout.b.temp,
  });
  check(run, `preflight_${label}`, problems.length === 0, problems.join(', ') || 'matches this worker', 'preflight_mismatch');
  const summary = await run.observer.snapshot();
  const tree = processTree(summary);
  const extension = liveByPid(tree, b.extension.pid);
  // The worker's runtime is the one live CLI process strictly inside B's extension created once this worker started.
  const workers = extension ? [...descendantsOf(tree, extension.key)].filter((key) => key !== extension.key).map((key) => /** @type {any} */ (tree.get(key)))
    .filter((node) => !run.workerKeys.includes(node.key) && node.exitedAt === null && node.createdAt >= startedAt - 1_000
      && samePath(node.image, run.scope.values.cli)) : [];
  check(run, `worker_process_${label}`, workers.length === 1 && workers[0].pinned,
    `${workers.length} new live worker runtime process(es) inside B's extension${workers.length === 1 && !workers[0].pinned ? ', not pinned' : ''}`,
    'runtime_identity_unobserved');
  check(run, `worker_payload_${label}`, payloadObserved(summary, tree, workers[0].key), 'the worker runtime opened or read the declared payload',
    'runtime_identity_unobserved');
  const dir = path.basename(preflight.data.storage);
  run.workerKeys.push(workers[0].key);
  run.workerDirs.set(workers[0].key, dir);
  const storage = currentWorkspace(preflight.data);
  check(run, `worker_storage_${label}`, storage.problems.length === 0, storage.problems.join(', ')
    || (storage.workspace === null ? 'observed absence: no session persistence is allowed'
      : `session workspace ${storage.workspace}: the same directory by path, device, and inode`), 'preflight_mismatch');
  run.workspaces.set(dir, storage.workspace);
  await observedClean(run, `startup_${label}`);
  assertCurrent(run, 'the startup release');
  writeRelease(layout.fixture, 'startup', startupReleaseOf({ runId: run.runId, operationId, preflight: preflight.data }));
  return { preflight: preflight.data, worker: workers[0].key };
}

/**
 * A version-3 served worker's startup release: its recorded readiness must be
 * the normal worker's version 2 for this operation, session, permit, loaders,
 * SDK files, extension process ID, runtime, model, catalog, latch-only
 * qualification, both accounts, and normal storage in its own working folder
 * (`checkNormalPreflight`), and that working folder must still be a directory
 * under B's temp folder, not a link, by its metadata alone. No observer runs,
 * so no process identity or file access is claimed. Only then is the release
 * written, in the existing release-record shape.
 * @param {any} run
 * @param {{journal: any, preflight: any, binding: Record<string, string>, operationId: string, label: string}} input
 */
function releaseNormalStartup(run, { journal, preflight, binding, operationId, label }) {
  const layout = /** @type {Layout} */ (run.layout);
  const b = run.mains.b;
  const problems = checkNormalPreflight(preflight, {
    workerId: journal.data?.workerId,
    binding,
    runId: run.runId,
    fixtureSha256: run.prepared.manifest.sha256,
    sdk: run.scope.artifacts.sdk,
    extensionPid: b.extension.pid,
    runtime: b.status,
    model: run.scope.values.models.worker,
    storageParent: layout.b.temp,
    account: run.scope.values.auth.worker.expectedAccount,
  });
  check(run, `preflight_${label}`, problems.length === 0, problems.join(', ')
    || 'matches this worker: version 2, both accounts as expected, normal storage in its own working folder', 'preflight_mismatch');
  let owned = false;
  try {
    const stat = fs.lstatSync(path.join(preflight.storage, 'work'));
    owned = stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    owned = false;
  }
  check(run, `worker_workdir_${label}`, owned, owned ? 'its own working folder is a directory, not a link' : 'its own working folder is missing or a link',
    'preflight_mismatch');
  assertCurrent(run, 'the startup release');
  writeRelease(layout.fixture, 'startup', startupReleaseOf({ runId: run.runId, operationId, preflight }));
  return { preflight, worker: null };
}

/**
 * Wait for the worker's first model evidence call to be held, and check it.
 * @param {any} run @param {string} journal @param {any} preflight
 */
async function heldCall(run, journal, preflight) {
  const admitted = await waitForRecord(run, journal, 'worker_request_admitted', deadline(run, NATIVE_LIMITS.workerMs));
  const pending = await waitForRecord(run, journal, 'worker_evidence_pending', deadline(run, NATIVE_LIMITS.workerMs));
  const problems = checkPending(pending.data, { workerId: preflight.workerId, sessionId: preflight.sessionId, admissionId: admitted.data?.admissionId });
  check(run, `held_call_${preflight.workerId.slice(0, 8)}`, problems.length === 0, problems.join(', ') || 'held before any evidence was read',
    'qualification_release_mismatch');
  return pending.data;
}

/**
 * Send both mains their whole exchange instructions together; neither send
 * waits for the other's begin. Right after each instruction is admitted, that
 * side's Dude conversation calls for this exchange (`EXCHANGE_OPS`, with A's
 * `begin_ask` only for `askSlug`) and reads inside its own workspace become
 * its step allowance, which its caller clears when that side's turn ends.
 * Then wait for both begin calls of
 * exactly those admissions and B's waiting status, and require the observed
 * order: both instructions admitted before the earliest begin request, and B
 * waiting before A asked. That order is an acceptance condition read from the
 * runtimes' own stamps, not one this runner can enforce.
 * @param {any} run @param {{a: string, b: string}} prompts @param {'advice' | 'cancel'} label @param {string} askSlug
 */
async function beginBoth(run, prompts, label, askSlug) {
  const a = run.mains.a;
  const b = run.mains.b;
  const layout = /** @type {Layout} */ (run.layout);
  /** @param {'a' | 'b'} side */
  const admit = async (side) => {
    const id = await sendPrompt(run, side, prompts[side], 'operation_not_started');
    allowTools(run, side, toolAllowance(id, { ops: EXCHANGE_OPS[label][side], ...(side === 'a' ? { slug: askSlug } : {}), workspace: layout[side].workspace }));
    return id;
  };
  const [bId, aId] = await Promise.all([admit('b'), admit('a')]);
  run.pending.add('a');
  run.pending.add('b');
  const begins = await waitUntil(run, () => {
    const bBegin = conversationCalls(b.log.state.events, bId).find((call) => call.op === 'begin_receive');
    const aBegin = conversationCalls(a.log.state.events, aId).find((call) => call.op === 'begin_ask');
    return bBegin && aBegin ? { a: aBegin, b: bBegin } : null;
  }, deadline(run, 90_000), 'operation_not_started', `both mains did not begin their ${label} operations`);
  const suffix = label === 'advice' ? '' : `_${label}`;
  check(run, `b_begin${suffix}`, begins.b.result?.outcome === 'accepted' && UUID.test(String(begins.b.result?.operationId)),
    `B begin ${begins.b.result?.outcome}`, 'operation_not_started');
  check(run, `a_begin${suffix}`, begins.a.result?.outcome === 'accepted' && UUID.test(String(begins.a.result?.operationId)),
    `A begin ${begins.a.result?.outcome}`, 'operation_not_started');
  const waiting = `Status: conversation ${begins.b.result.operationId} waiting for one project question`;
  await waitUntil(run, () => b.log.state.events.some((/** @type {any} */ event) => event.message === waiting), deadline(run, 15_000),
    'operation_not_started', 'B is not waiting for a question');
  const order = checkInstructionOrder({ a: a.log.state.events, b: b.log.state.events },
    { a: { id: aId, prompt: prompts.a }, b: { id: bId, prompt: prompts.b } }, { a: 'begin_ask', b: 'begin_receive' }, waiting);
  check(run, `${label}_instruction_order`, order.length === 0,
    order.join(', ') || 'both whole instructions were admitted before either begin request, and B waited before A asked', 'instruction_order_unproven');
  return { admissions: { a: aId, b: bId }, operations: { a: begins.a.result.operationId, b: begins.b.result.operationId } };
}

/**
 * Wait until one owned subtree, a worker's or the control runtime's, has
 * wholly ended or its own 10-second cleanup window from `anchorMs` has
 * passed, then judge one synchronized snapshot against that window
 * (`checkCessation`). A later, broader window never stands in for it. That
 * snapshot's own coverage is checked first, as `<label>_cessation_coverage`
 * (`coverageRow`): a snapshot that lost, could not decode, or could not
 * attribute events, missed a marker, or overflowed may show every known
 * identity exited while one it never saw lives on, so it confirms nothing,
 * and the run stops with that closed coverage reason.
 * @param {any} run @param {string} rootKey @param {number} anchorMs @param {string} label
 */
async function subtreeCessation(run, rootKey, anchorMs, label) {
  const windowEnd = anchorMs + NATIVE_LIMITS.cleanupMs;
  for (;;) {
    const summary = await run.observer.snapshot();
    const tree = processTree(summary);
    const members = descendantsOf(tree, rootKey);
    const ended = members.size > 0 && [...members].every((key) => tree.get(key)?.exitedAt !== null);
    if (ended || !(run.clock() < windowEnd)) {
      const [id, passed, detail, reason] = coverageRow(summary, false);
      check(run, `${label}_cessation_${id}`, passed, detail, reason);
      return checkCessation(tree, members.size ? members : [rootKey], { since: anchorMs, windowMs: NATIVE_LIMITS.cleanupMs });
    }
    await delay(NATIVE_LIMITS.pollMs * 5);
  }
}

/** @param {{running: number, late: number, unpinned: number, missing: number, maxMs: number}} result @param {string} anchor */
function cessationDetail(result, anchor) {
  return `${result.running} running, ${result.late} late, ${result.unpinned} unpinned, ${result.missing} missing; slowest ${result.maxMs} ms after ${anchor}`;
}

/**
 * A version-3 served worker's bounded cleanup, as B's journal recorded it
 * (`checkWorkerCleanup`), checked as `<label>_worker_stop`: a stop that
 * reported errors, needed a force-stop, or was not observed within its bound
 * fails as `stop_failed`, never a green result. Its runtime cessation is
 * reported unconfirmed whatever the stop said, because no observer runs and
 * an SDK stop is not process-tree exit; its storage stays where it was kept.
 * @param {any} run @param {string} journal @param {any} preflight @param {string} label
 */
function normalWorkerCleanup(run, journal, preflight, label) {
  const data = readJournal(journal).find((record) => record.kind === 'cleanup')?.data;
  const problems = checkWorkerCleanup(data, { workerId: preflight.workerId, storage: preflight.storage });
  const kept = isRecord(data) ? { stop: boundedText(data.stop, 32), stopErrors: Number.isSafeInteger(data.stopErrors) ? data.stopErrors : null,
    forceStop: boundedText(data.forceStop, 32), storage: boundedText(data.storage, 32), retainedPath: boundedText(data.retainedPath, STORAGE_PATH_BYTES) } : null;
  return {
    cleanup: { ...kept, cessation: 'unconfirmed' },
    record: () => check(run, `${label}_worker_stop`, problems.length === 0, problems.join(', ')
      || 'the product\'s bounded stop reported no errors and kept its storage; runtime cessation unconfirmed', 'stop_failed'),
  };
}

/** @param {any} run */
async function adviceExchange(run) {
  const layout = /** @type {Layout} */ (run.layout);
  const { values } = run.scope;
  const a = run.mains.a;
  const b = run.mains.b;
  const { admissions, operations } = await beginBoth(run, {
    b: exchangePrompt('receive', { slug: values.slug, progressFile: PROGRESS_FIXTURES.b.path }),
    a: exchangePrompt('ask', { slug: values.slug, progressFile: PROGRESS_FIXTURES.a.path }),
  }, 'advice', values.slug);
  const bOperation = operations.b;
  const aOperation = operations.a;
  const bJournal = journalPathOf(layout.b.workspace, bOperation);
  const aJournal = journalPathOf(layout.a.workspace, aOperation);
  follow(run, 'b', layout.b.workspace, bOperation);
  follow(run, 'a', layout.a.workspace, aOperation);
  const { preflight, worker } = await releaseStartup(run, bJournal, bOperation);
  const pending = await heldCall(run, bJournal, preflight);

  // The pending interval: the fixtures appear now, and each main's own model must complete its own for its current instruction.
  assertCurrent(run, 'the progress fixtures');
  const files = { a: path.join(layout.a.workspace, PROGRESS_FIXTURES.a.path), b: path.join(layout.b.workspace, PROGRESS_FIXTURES.b.path) };
  const start = run.clock();
  for (const side of /** @type {const} */ (['a', 'b'])) {
    writeNew(files[side], PROGRESS_FIXTURES[side].initial);
    run.allow[side] = { ...run.allow[side], phase: 'progress', admission: admissions[side], progress: { file: files[side], ...PROGRESS_FIXTURES[side] } };
  }
  const workerStarted = Date.parse(readJournal(bJournal).find((record) => record.kind === 'worker_started')?.time ?? '');
  /** @type {Record<string, any>} */
  const progress = {};
  await waitUntil(run, () => {
    for (const side of /** @type {const} */ (['a', 'b'])) {
      if (progress[side]) continue;
      const result = checkProgress(run.mains[side].log.state.events, { file: files[side], start, end: run.clock(), admission: admissions[side] });
      if (result.ok && fs.readFileSync(files[side], 'utf8') === PROGRESS_FIXTURES[side].final) progress[side] = result;
    }
    return progress.a && progress.b;
  }, workerStarted + NATIVE_LIMITS.workerMs - 25_000, 'progress_missed', 'both mains did not complete their own progress while the evidence call was held');
  const end = run.clock();
  for (const side of /** @type {const} */ (['a', 'b'])) {
    run.allow[side] = { ...run.allow[side], phase: 'closed', progress: null };
    const result = checkProgress(run.mains[side].log.state.events, { file: files[side], start, end, admission: admissions[side] });
    const content = fs.readFileSync(files[side], 'utf8');
    check(run, `${side}_progress`, result.ok && content === PROGRESS_FIXTURES[side].final,
      result.ok ? `model tool call completed ${result.completedAt - start} ms into a ${end - start} ms hold` : result.reason, 'progress_missed');
  }
  run.report.measurements.progress = { holdMs: end - start, a: progress.a?.completedAt - start, b: progress.b?.completedAt - start };
  assertCurrent(run, 'the evidence release');
  writeRelease(layout.fixture, 'evidence', evidenceReleaseOf({ runId: run.runId, operationId: bOperation, preflight, pending }));

  await waitForRecord(run, bJournal, 'closed', deadline(run, NATIVE_LIMITS.operationMs));
  await waitForRecord(run, aJournal, 'closed', deadline(run, NATIVE_LIMITS.operationMs));
  await waitForTurn(run, 'b', admissions.b, 'answer_invalid');
  allowTools(run, 'b', null);
  await waitForTurn(run, 'a', admissions.a, 'answer_invalid');
  allowTools(run, 'a', null);
  run.pending.clear();
  const aRecords = readJournal(aJournal);
  const bRecords = readJournal(bJournal);
  const answered = checkAnsweredJournal(aRecords, aOperation);
  check(run, 'a_answered_journal', answered.length === 0, answered.join(', ') || 'exactly the eight answered records', 'journal_mismatch');
  const record101 = `${path.basename(layout.b.workspace)}/.dude/ideas/101-${SEEDS.b[1].slug}.md`;
  const served = checkServedJournal(bRecords, { operationId: bOperation, workerId: preflight.workerId, record101 });
  check(run, 'b_served_journal', served.length === 0, served.join(', ') || 'held call, model reads, reasoned answer, and reply', 'answer_invalid');
  const aRead = conversationCalls(a.log.state.events, admissions.a).filter((call) => call.op === 'read' && call.result?.outcome === 'answer').at(-1);
  const capture = aRead?.result?.advice?.capture;
  check(run, 'a_answer', isRecord(capture) && capture.operationId === aOperation && capture.observedMaximum === 101,
    `A read ${aRead?.result?.outcome ?? 'no answer'}`, 'answer_invalid');
  run.advice = { capture, operationId: aOperation, journalBytes: fs.readFileSync(aJournal) };
  const timings = { a: journalTimings(aRecords), b: journalTimings(bRecords) };
  const immediate = immediateTimings([...conversationCalls(a.log.state.events, admissions.a), ...conversationCalls(b.log.state.events, admissions.b)]);
  run.report.measurements.advice = { ...timings, immediateMaxMs: immediate.maxMs };
  check(run, 'advice_bounds', timings.a.operationMs <= NATIVE_LIMITS.operationMs && timings.b.operationMs <= NATIVE_LIMITS.operationMs
    && timings.b.startupMs <= NATIVE_LIMITS.startupMs && timings.b.workerMs <= NATIVE_LIMITS.workerMs && immediate.over === 0,
  `startup ${timings.b.startupMs} ms; worker ${timings.b.workerMs} ms; operations ${timings.a.operationMs}/${timings.b.operationMs} ms; `
    + `slowest begin/read ${immediate.maxMs} ms`, 'bound_exceeded');
  // The answering worker's own cleanup window: 10 seconds from its recorded finish, after which the product's owned cleanup
  // proceeds; it is judged now, before capture or another exchange starts.
  const finished = readJournal(bJournal).find((record) => record.kind === 'worker_finished');
  const finishedAt = Date.parse(finished?.time ?? '');
  if (run.normal) {
    // No observer runs: the answering worker's bounded stop is read from B's journal, and its cessation stays unconfirmed.
    const stopped = normalWorkerCleanup(run, bJournal, preflight, 'advice');
    run.report.operations.advice = { a: aOperation, b: bOperation, worker: preflight.workerId, workerSession: preflight.sessionId,
      workerFinishedAt: finished?.time ?? null, workerCleanup: stopped.cleanup };
    stopped.record();
    return;
  }
  const cessation = await subtreeCessation(run, worker, finishedAt, 'advice_worker');
  run.windows.push({ label: 'advice_worker', key: worker, anchorMs: finishedAt });
  run.report.operations.advice = { a: aOperation, b: bOperation, worker: preflight.workerId, workerSession: preflight.sessionId,
    workerFinishedAt: finished?.time ?? null, workerCleanup: cessation };
  check(run, 'advice_worker_cessation', cessation.ok, cessationDetail(cessation, 'its recorded finish'), 'cessation_unconfirmed');
}

/** @param {any} run */
async function capture(run) {
  const layout = /** @type {Layout} */ (run.layout);
  const { values } = run.scope;
  const a = run.mains.a;
  /** @type {SpecLeadNames & {invoke: string, named: boolean}} */
  const delegate = a.delegate;
  const prompt = capturePrompt(run.advice.operationId, values.slug, { tempRoot: layout.a.temp,
    workspace: fs.realpathSync.native(layout.a.workspace), specLead: delegate.invoke, named: delegate.named });
  const message = await sendPrompt(run, 'a', prompt, 'capture_not_completed');
  // Under the typed consent, this step's reads inside A's own workspace are the relay's to approve until its turn ends; it allows no
  // Dude tool call, and the capture phase's exact actions, the Spec Lead's staging among them (`specLeadRequest`), are the relay's to
  // approve while that phase is open.
  allowTools(run, 'a', toolAllowance(message, { workspace: layout.a.workspace }));
  run.allow.a = { ...run.allow.a, phase: 'capture', admission: message, capture: { tempRoot: layout.a.temp, slug: values.slug, advice: run.advice.capture,
    delegate: Object.freeze({ names: delegate.names, selectors: delegate.selectors }) } };
  await waitForTurn(run, 'a', message, 'capture_not_completed', NATIVE_LIMITS.captureTurnMs);
  run.allow.a = { ...run.allow.a, phase: 'closed', capture: null };
  allowTools(run, 'a', null);
  const ideaPath = `.dude/ideas/102-${values.slug}.md`;
  const ledger = path.join(layout.a.workspace, ...ideaPath.split('/'));
  const receiptFile = path.join(layout.a.workspace, ...TRANSCRIPT_DIR.split('/'), 'captures', `${run.advice.operationId}.json`);
  check(run, 'capture_files', fs.existsSync(ledger) && fs.existsSync(receiptFile), `ledger ${fs.existsSync(ledger)}; receipt ${fs.existsSync(receiptFile)}`,
    'capture_not_completed');
  /** @type {any} */
  let receipt = null;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  } catch {
    receipt = null;
  }
  const problems = checkReceipt(receipt, { slug: values.slug, capture: run.advice.capture, ideaPath, ledgerSha256: sha256(fs.readFileSync(ledger)) });
  check(run, 'capture_receipt', problems.length === 0, problems.join(', ') || 'local 100, peer 101, chosen 102, raised', 'capture_mismatch');
  const publisher = a.log.state.events.find((/** @type {any} */ event) => event.type === 'tool.execution_start' && rootEvent(event)
    && PUBLISHER_COMMAND.test(String(event.arguments?.command ?? '').trim()) && requestedBy(a.log.state.events, event.toolCallId, message));
  const output = publisher && a.log.state.events.find((/** @type {any} */ event) => event.type === 'tool.execution_complete'
    && event.toolCallId === publisher.toolCallId);
  const published = publisherCheck(publisher, output, ideaPath);
  check(run, 'capture_publisher', published.passed, published.detail, 'capture_mismatch');
  // The publisher read files the installed Spec Lead staged in two tasks of this instruction, never the root model's own.
  const files = /** @type {RegExpExecArray} */ (PUBLISHER_COMMAND.exec(String(publisher.arguments.command).trim()));
  const staging = checkStaging(a.log.state.events, { admission: message, names: delegate.names, selectors: delegate.selectors, ledger: unquote(files[2]),
    advice: unquote(files[3]) });
  check(run, 'capture_staging', staging.problems.length === 0, staging.problems.join(', ')
    || `the Spec Lead staged the ledger and the advice in two synchronous tasks; ${staging.others} other task call(s)`, 'capture_mismatch');
  const journal = fs.readFileSync(journalPathOf(layout.a.workspace, run.advice.operationId));
  check(run, 'a_journal_unchanged', journal.equals(run.advice.journalBytes), 'A\'s answered journal kept exactly its eight records', 'journal_mismatch');
  run.report.capture = { ideaPath, receipt: receipt?.selection ?? null, staging: staging.tasks };
}

/** @param {any} run */
async function cancelExchange(run) {
  const layout = /** @type {Layout} */ (run.layout);
  const { values } = run.scope;
  const a = run.mains.a;
  const b = run.mains.b;
  const askSlug = `${values.slug}-cancel`;
  const { admissions, operations } = await beginBoth(run, {
    b: exchangePrompt('receive-cancel', { slug: values.slug, progressFile: PROGRESS_FIXTURES.b.path }),
    a: exchangePrompt('ask-cancel', { slug: askSlug, progressFile: PROGRESS_FIXTURES.a.path }),
  }, 'cancel', askSlug);
  const bOperation = operations.b;
  const aOperation = operations.a;
  const bJournal = journalPathOf(layout.b.workspace, bOperation);
  const aJournal = journalPathOf(layout.a.workspace, aOperation);
  follow(run, 'b', layout.b.workspace, bOperation);
  follow(run, 'a', layout.a.workspace, aOperation);
  const { preflight, worker } = await releaseStartup(run, bJournal, bOperation);
  await heldCall(run, bJournal, preflight);
  // The fresh worker's model call is held, and its evidence is never released: A's model cancels now.
  assertCurrent(run, 'the cancellation cue');
  const cueAt = run.clock();
  writeNew(path.join(layout.a.workspace, CANCEL_CUE.path), CANCEL_CUE.content);
  const call = await waitUntil(run, () => conversationCalls(a.log.state.events, admissions.a).find((entry) => entry.op === 'cancel'),
    deadline(run, NATIVE_LIMITS.workerMs), 'cancellation_mismatch', 'A did not cancel while the worker was held');
  await waitForRecord(run, aJournal, 'closed', deadline(run, NATIVE_LIMITS.cleanupMs + 5_000));
  await waitForRecord(run, bJournal, 'closed', deadline(run, NATIVE_LIMITS.cleanupMs + 5_000));
  await waitForTurn(run, 'a', admissions.a, 'cancellation_mismatch');
  allowTools(run, 'a', null);
  await waitForTurn(run, 'b', admissions.b, 'cancellation_mismatch');
  allowTools(run, 'b', null);
  run.pending.clear();
  const settled = { a: fs.readFileSync(aJournal), b: fs.readFileSync(bJournal) };
  const problems = checkCancellation({ call, cueAt, aRecords: readJournal(aJournal), bRecords: readJournal(bJournal) });
  check(run, 'cancellation', problems.length === 0, problems.join(', ') || 'acceptance ended at once with possible prior delivery reported',
    'cancellation_mismatch');
  await pause(run, NATIVE_LIMITS.settleMs);
  check(run, 'no_late_revival', fs.readFileSync(aJournal).equals(settled.a) && fs.readFileSync(bJournal).equals(settled.b),
    'neither journal changed after it closed', 'late_revival');
  if (!run.normal) await observedClean(run, 'cancel');
  // That worker's own cleanup window runs from B's terminal record: B's actual cancellation boundary, where its worker
  // is cancelled, not A's later receipt of the cancel result.
  const terminal = readJournal(bJournal).find((record) => record.kind === 'terminal');
  const terminalAt = Date.parse(terminal?.time ?? '');
  /** @type {any} */
  let cessation;
  if (run.normal) {
    // No observer runs: the cancelled worker's bounded stop is read from B's journal, and its cessation stays unconfirmed.
    const stopped = normalWorkerCleanup(run, bJournal, preflight, 'cancelled');
    cessation = stopped.cleanup;
    stopped.record();
  } else {
    cessation = await subtreeCessation(run, worker, terminalAt, 'cancelled_worker');
    run.windows.push({ label: 'cancelled_worker', key: worker, anchorMs: terminalAt });
    check(run, 'cancelled_worker_cessation', cessation.ok, cessationDetail(cessation, 'B\'s terminal record'), 'cessation_unconfirmed');
  }
  const immediate = immediateTimings([...conversationCalls(a.log.state.events, admissions.a), ...conversationCalls(b.log.state.events, admissions.b)]);
  check(run, 'cancel_bounds', immediate.over === 0, `slowest begin, read, or cancel ${immediate.maxMs} ms`, 'bound_exceeded');
  run.report.cancellation = { a: aOperation, b: bOperation, cancelMs: call.complete.ts - call.start.ts, terminalAt: terminal?.time ?? null,
    workerCleanup: cessation, immediateMaxMs: immediate.maxMs };
}

/**
 * Stop one client with only the SDK's own lifecycle calls, inside the shared
 * cleanup budget: disconnect and stop by `stopBy`, then force-stop by
 * `forceBy` only when stop failed, reported errors, or overran. A late answer
 * is not awaited further, and nothing is killed. The scope's expiry never
 * prevents this owned shutdown.
 * @param {any} run @param {{side: string, client: any, session: any, stopped: boolean}} entry @param {{stopBy: number, forceBy: number}} budget
 */
async function stopClient(run, entry, { stopBy, forceBy }) {
  if (entry.stopped) return { side: entry.side, stop: 'already', errors: 0, forced: 'not_needed' };
  entry.stopped = true;
  if (entry.session) await settleBy(run, Promise.resolve().then(() => entry.session.disconnect()), stopBy, false);
  const stopped = await settleBy(run, Promise.resolve().then(() => entry.client.stop()), stopBy, false);
  const errors = stopped.kind === 'value' && Array.isArray(stopped.value) ? stopped.value.length : null;
  const clean = errors === 0;
  let forced = 'not_needed';
  if (!clean) {
    const outcome = await settleBy(run, Promise.resolve().then(() => entry.client.forceStop()), forceBy, false);
    forced = outcome.kind === 'value' ? 'completed' : outcome.kind === 'error' ? 'failed' : 'timed_out';
  }
  const stop = clean ? 'clean' : errors !== null ? 'errors' : stopped.kind === 'value' ? 'unrecognized' : stopped.kind === 'error' ? 'failed' : 'timed_out';
  return { side: entry.side, stop, errors, forced };
}

/** Every owned identity in the tree: all of this process's descendants, itself excluded. @param {any} run @param {ProcessTree} tree */
function ownedKeys(run, tree) {
  return run.keys.root ? [...descendantsOf(tree, run.keys.root)].filter((key) => key !== run.keys.root) : [];
}

/** Close every permission phase and tool allowance and mark the run closing, so a queued or answered relay request is withdrawn. @param {any} run */
function closePermissions(run) {
  run.closing = true;
  for (const side of Object.keys(run.allow)) run.allow[side] = { ...run.allow[side], phase: 'closed', progress: null, capture: null, tools: null };
}

/**
 * Every final check, as rows `[id, passed, detail, reason]`, judged on the
 * drained final summary: coverage including the drain, pinned identities,
 * every access, storage, canary, and worker-image rule, the control runtime's
 * and each worker's own cleanup window recomputed on the final tree (so
 * children whose start was still buffered count), the whole owned tree ended
 * within the shared window from `since`, and last, the helper's actual exit.
 * @param {any} run @param {{summary: any, reason: string | null, exit: {exited: boolean}}} final @param {number} since
 * @returns {Array<[string, boolean, string, string]>}
 */
function finalChecks(run, final, since) {
  /** @type {Array<[string, boolean, string, string]>} */
  const rows = [];
  if (!final.summary) {
    rows.push(['coverage', false, `no drained final summary (${final.reason})`, final.reason === 'observer_overflow' ? 'observer_overflow' : 'observer_coverage_lost']);
  } else {
    const tree = processTree(final.summary);
    rows.push(...summaryChecks(run, final.summary, tree, true));
    for (const window of run.windows) {
      const result = checkCessation(tree, descendantsOf(tree, window.key), { since: window.anchorMs, windowMs: NATIVE_LIMITS.cleanupMs });
      rows.push([`${window.label}_cessation`, result.ok, cessationDetail(result, 'its own cleanup anchor'), 'cessation_unconfirmed']);
    }
    const owned = checkCessation(tree, ownedKeys(run, tree), { since, windowMs: NATIVE_LIMITS.cleanupMs });
    rows.push(['owned_tree_cessation', owned.ok, cessationDetail(owned, 'teardown began'), 'cessation_unconfirmed']);
  }
  rows.push(['observer_exit', final.exit.exited, final.exit.exited ? 'the observer helper exited after its final summary'
    : 'the observer helper did not exit within its bound; its end is unconfirmed, and nothing was killed', 'cessation_unconfirmed']);
  return rows;
}

/**
 * Owned shutdown, on every path, and also after the scope expired. Permissions
 * close first; then every client stops concurrently inside one shared
 * 10-second stop-and-force budget; then, with no fixed extra wait, the
 * observer is polled until every owned process ended or that window passed,
 * and stopped. Its drained final summary gets every final check, and its
 * helper's actual exit is awaited. A helper that never became ready is closed
 * with EOF and its exit awaited. On the success path a failed check fails the
 * run once everything is released; on a failure path the checks are recorded
 * beside the earlier reason. Idempotent; never kills or deletes. A version-3
 * run has no observer: each client's own stop is its final check, passing
 * only as a stop that reported no errors by its absolute stop deadline, the
 * first half of the shared budget. `stopClient` takes an answer once it
 * settles, so when each stop ended is read on the run clock right after it:
 * a clean answer that came late fails as an overrun, as an error, failure, or
 * force-stop does, as `stop_failed`, and nothing more is attempted for it.
 * Process-tree cessation is reported unconfirmed and all storage is kept,
 * the real home and configuration included.
 * @param {any} run @param {boolean} required
 */
async function teardown(run, required) {
  if (run.tornDown) return;
  run.tornDown = true;
  closePermissions(run);
  if (required) for (const follower of run.followers) await Promise.race([follower.done, delay(2_000)]);
  for (const follower of run.followers) follower.controller.abort();
  const since = run.clock();
  const budget = { stopBy: since + NATIVE_LIMITS.cleanupMs / 2, forceBy: since + NATIVE_LIMITS.cleanupMs };
  /** @type {Array<[string, boolean, string, string]>} */
  let rows = [];
  if (run.normal) {
    // `stopClient` takes an answer as soon as it settles, before any look at the clock, so when each client's stop ended is read
    // right after it here: with no observer to judge cessation, a clean answer that came after its absolute deadline is an overrun.
    const stops = await Promise.all(run.clients.map(async (entry) => {
      const stopped = await stopClient(run, entry, budget);
      return { ...stopped, elapsedMs: run.clock() - since };
    }));
    rows = stops.map((entry) => {
      const late = entry.stop === 'clean' && !(since + entry.elapsedMs <= budget.stopBy);
      return [`${entry.side}_stop`, entry.stop === 'clean' && !late, `stop ${entry.stop}, ${entry.errors ?? 'unknown'} errors, force-stop ${entry.forced}`
        + `${late ? `, answered ${entry.elapsedMs} ms after teardown began, past its ${budget.stopBy - since} ms stop deadline` : ''}; process-tree cessation `
        + 'unconfirmed', 'stop_failed'];
    });
    run.report.cleanup = { since: new Date(since).toISOString(), stops, checks: rows.length, cessation: 'unconfirmed',
      retained: 'all run and normal runtime storage and logs are kept; nothing was killed or deleted' };
    for (const [id, passed, detail] of rows) recordCheck(run, `final_${id}`, passed, detail);
    const failedStop = rows.find((row) => !row[1]);
    if (required && failedStop) stop(failedStop[3], `final_${failedStop[0]}: ${failedStop[2]}`);
    return;
  }
  const stops = await Promise.all(run.clients.map((entry) => stopClient(run, entry, budget)));
  const observer = run.observer;
  run.observer = null;
  if (observer && run.observerReady) {
    try {
      for (;;) {
        const tree = processTree(await observer.snapshot());
        if (ownedKeys(run, tree).every((key) => tree.get(key)?.exitedAt !== null) || !(run.clock() < since + NATIVE_LIMITS.cleanupMs)) break;
        await delay(NATIVE_LIMITS.pollMs * 5);
      }
    } catch {
      // The final stop below still decides coverage.
    }
    const final = await observer.stop();
    rows = finalChecks(run, final, since);
    run.report.observer = { ...run.report.observer, final: final.summary ? { health: final.summary.health, drain: final.summary.final ?? null } : final.reason,
      exit: final.exit };
  } else if (observer) {
    const exit = await observer.close(NATIVE_LIMITS.observerExitMs);
    rows.push(['observer_exit', exit.exited, exit.exited ? 'the observer helper exited after its startup ended'
      : 'the observer helper did not exit within its bound; its end is unconfirmed, and nothing was killed', 'cessation_unconfirmed']);
    run.report.observer = { ...run.report.observer, startup: 'not_ready', exit };
  }
  run.report.cleanup = { since: new Date(since).toISOString(), stops, checks: rows.length };
  for (const [id, passed, detail] of rows) recordCheck(run, `final_${id}`, passed, detail);
  const failedRow = rows.find((row) => !row[1]);
  if (required && failedRow) stop(failedRow[3], `final_${failedRow[0]}: ${failedRow[2]}`);
}

/** @param {any} run */
async function reread(run) {
  const rows = [];
  for (const follower of run.followers) {
    /** @type {string[]} */
    const lines = [];
    await readTranscript({ root: follower.root, operationId: follower.operationId, write: (line) => { lines.push(line); } });
    const same = lines.join('') === follower.lines.join('');
    rows.push({ side: follower.side, operationId: follower.operationId, records: lines.length, matches: same });
    run.human.show(`\n=== Retained ${follower.side.toUpperCase()} journal ${follower.operationId} (after session end) ===\n${lines.join('').replace(/\n$/, '')}`);
  }
  run.report.retained = rows;
  check(run, 'retained_matches_live', rows.length === 4 && rows.every((row) => row.matches), `${rows.filter((row) => row.matches).length} of 4 match`,
    'retained_mismatch');
  const answer = await run.human.ask(ANSWER_PROMPT, { deadlineAt: deadline(run, NATIVE_LIMITS.acknowledgeMs),
    action: { title: 'Compare the journals above with what you saw live', line: ACKNOWLEDGE, note: 'Any other line fails the run.' } });
  check(run, 'human_reread', answer.ok && answer.line === ACKNOWLEDGE, answer.ok ? 'acknowledged' : answer.reason, 'reread_not_acknowledged');
}

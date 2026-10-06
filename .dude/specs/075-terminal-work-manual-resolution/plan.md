# Implementation Plan: Terminal Work Manual Resolution

**Feature identity**: `.dude/specs/075-terminal-work-manual-resolution/spec.md`
**Owner**: `.dude/ideas/075-terminal-work-manual-resolution.md`
**Definition basis**: Explicit re-definition after the brainstorm refresh recorded
at `2026-10-03T20:36:54Z`. Original tasks and history remain unchanged.

## Chosen Approach

Extend `src/skills/dude-work/SKILL.md` under its existing
`## Explicit Manual Terminal Resolution`. Keep the four original procedural
subsections and their overflow contract. Add one clearly scoped
`### Post-Terminal Administrative Reconciliation` subsection for FR-015 through
FR-030. The existing two skill consumers and coordinator carry concise pointers;
they do not repeat the procedure.

Use the familiar preview-and-confirm administrative-action pattern. The existing
manual board writer already supplies the task-state mutation. The new capability
is instruction-level authority to use ordinary administrative handling for this
bounded case, not a new runtime admission or recovery route. Scope the original
path's unchanged-task, retained-control, and literal-confirmation rules explicitly
to that path; do not weaken them or accidentally apply them to the new path.

T001@m075rule, T002@a075link, and T003@v075test remain completed, exact surviving
units. Three new serial units author the skill extension, coordinator routing,
and tests. They inherit no completion. This plan authorizes no actual Feature 068
or Feature 074 resolution.

References inside the kept units retain their original scope: the original
Manual Procedure, original four focused cases, original current-format/board/
build suite, and lint. The additional procedure, new selector, and focused runner
regressions belong only to T004-T006; no revised plan reference expands a completed
unit's obligation.

## Technical Context

**Language/Version**: Markdown instructions; existing dependency-free JavaScript
ESM tests and generation on Node.js 20 or later.
**Dependencies**: Existing roster routing, exact-owner resolver, canonical task
parser, manual board writer, task snapshot, backlog refresh, lint, `node:test`,
and selected core-output generation.
**Storage**: Existing owner Coordinator Log, canonical task file, optional task
snapshot, and derived backlog pair. Retained evidence and control preimages are
read-only. No new store, consent object, schema, or ObjectiveRegistry.
**Platform**: Current core bundle and generated Copilot profiles; disposable tests
retain the repository's Windows-compatible Node patterns.
**Limits**: The original manual failure class remains the historical 131,072-byte
overflow. Current Work's `{items:64,bytes:262144}`, both independent 64-entry
budgets, 16 checks per attestation, and all other limits remain unchanged.
**Testing**: Existing original manual contracts, additional section-scoped
contracts, isolated four-output parity, actual disposable administrative close,
unchanged runner refusal cases, and current board/build regressions.

### Source Diagnosis And Supplied Case

Source inspection confirms the deliberate normal-Work boundary:

- `src/skills/dude-work/host-adapter-runner.mjs:1180-1183` requires an unblocked
  `[~]` target. Its fresh no-governance repeat path at `1364-1377` calls
  `resume-learning`.
- `resumeGovernanceV2` in `src/skills/dude-work/recovery.mjs:13200-13332` re-derives
  only required learning and refuses later reviewed history without its accepted
  branch state. The existing `Work recovery admission: unsupported or inconsistent
  governance history cannot reopen learning` test preserves that refusal.
- `setTaskState` in `src/skills/dude-engine/lib/tasks.mjs` changes a glyph but
  does not remove existing `blocked-by:` metadata. `board.mjs set --write` writes
  the task and snapshot and refreshes backlog; it does not authenticate manual
  permission or supply coordinator log entries.

These are existing contracts, not runtime defects selected for repair.

The coordinator supplied the following case evidence; definition did not execute
the probe or establish live admission. Feature 068 `T019@b068e019` remains `[!]`
with obsolete external-dependency metadata and completed dependency
`T028@d068g028`. Its current canonical body and spec/plan supersede the historical
full-LAN header: current acceptance is local Windows CLI plus three retained
physical-LAN sharing records. All current acceptance evidence is reported
independently approved. T020 remains a separate final-review task.

Actual old acquisitions are retained under the supplied session evidence reference
`ship-068-cap256-20260928-0046/T019`. The read-only probe reused actual runtime16
input and an empty live-current-run capture: 216,436 of 262,144 bytes, no overflow
or Inspection/retention blocker, six occurrences establishing a repeat, and exact
dual retention. Authoritative history retains required/revision 1, learning-review,
and reviewed/revision 1. Runtime15's returned alternative-inspected state has zero
counters and no pending attempt; runtime16's returned alternative-authorized state
has one pending address-review attempt. Those returned states are historical
evidence only. No Work operation ran in that probe.

The coordinator reports the original supervisor absent and the exact old control
pair preserved and removed under separate user authorization, with current
controls absent. Use actual retained preimages and results at any later admission;
this report alone proves neither effect disposition nor eligibility. Do not
assume an original terminal row exists. Unexecuted wire-busy, broader concurrency,
physical-LAN, macOS, App, and descendant limits remain explicit. No native rerun,
new test question, extra busy token, T020 action, or Git action belongs to 075.

## Manual Procedure

This section preserves the original procedure for US1/US2, FR-001 through FR-014,
and SC-001 through SC-005. T001-T003 retain that meaning and their existing tests.

### 1. Establish Original Overflow Eligibility

Require the live Lightweight lane, one defined owner by exact `spec_path`, and
one unblocked `[~]` task whose durable key, meaning, requirements, and obligations
match the failed attempt. The already-present implementation comes from its
pending `address-review` attempt.

Require the actual autonomous runner's `hard-stop` / `evidence-incomplete` return
from the first completion projection exceeding the then-active 131,072-byte
`model-packet-bytes` limit before `apply-lane-effect` or any completion writer
entry. The retained accepted state stays `alternative-authorized` with that
pending attempt. Its reviewed alternative and required learning projection are
complete and match on current-run and authoritative lane history.

Correlate the original terminal row, accepted bytes/hash/revision, invocation,
workspace-target key, and actual operation evidence. Independently establish
current absence of its supervisor, workers, and pending handoffs through host
lifecycle observations or an operator's actual independent checks. Worker exit,
PID, age, an orphan flag, a checkpoint, or a model conclusion is insufficient.

Prove no completion effect both from the original pre-writer rejection and fresh
comparison with relevant task, snapshot, owner/lane-history, and current-run
preimages. No completion projection, lane write, or receipt may have occurred.
Earlier authorized implementation edits are separate and still need acceptance.
Possible writer entry, missing or one-sided evidence, or unknown effects refuses.

Retain the original exclusions: tracked or guarded targets, active Work, changed
requirements, blocked tasks, new implementation or definition repair, missing
learning projection, pending evaluation sequence, cancellation, supervisor/context
loss, first-Assessment rejection, source/descriptor exhaustion, post-writer or
receipt failure, and other terminal classes. They do not enter this original path.

### 2. Preserve Original Exact Human Confirmation

Preview exact workspace, owner, feature/task, task prestate, unchanged obligations,
terminal and accepted-state evidence references/hashes/revision, owner-absence and
two-part no-effect findings, and current material hashes including dirty and
untracked content. A commit alone is insufficient. Preview only fresh acceptance
and conditional same-task manual close with retained controls and old obligations.

Require the original literal confirmation, with the preview's exact values:

```text
Authorize MANUAL acceptance and close for <spec_path> <taskKey> at <currentRevision> using <terminalEvidence>, accepted revision <N>; retain ownership records.
```

`currentRevision` identifies the complete displayed revision/content-hash list;
`terminalEvidence` identifies the original terminal reference/hash and linked
evidence. Preserve the preview in the existing interaction. Generic assent,
ordinary `accept T0NN`, prior Work/Ship permission, and retrospective questions
do not substitute. Drift requires a new preview and literal confirmation.

### 3. Preserve Original Fresh Acceptance

Use a matching verifier who did not author the implementation and an independent
Reviewer. Supply exact commands, selectors, current bytes, every unchanged
obligation, and complete relevant terminal/learning evidence. Require fresh
passing verification and review; keep failures, rejections, and required skips
visible. Historical output and author reports replace neither role.

Do not revise the failed pair, reconstruct trusted attestations, call
`specialist-attestation.mjs` for a dead attempt, submit a replacement Work packet,
or shorten or regroup history to evade limits. Failure, unavailable proof, or an
applicable capacity limit stops acceptance without implementation, repair, or retry.

### 4. Preserve Original MANUAL Close And Retention

Recheck every confirmed binding and the complete retained claim/checkpoint
bytes/hashes before writing. Missing, partial, corrupt, mismatched, or changed
controls refuse. Append one plain UTC MANUAL owner-log disposition with the
actual basis, permission, fresh acceptance, retained controls, and limited close
authority. It is not a Work event, receipt, audit, learning resolution, or advance
proof of success.

Only the coordinator uses ordinary `board.mjs set ... done --write`, render,
snapshot, state/render/close logging, backlog refresh, and lint. It does not
clear blockers, alter requirements, call a Work adapter, issue permits, restore
state, or claim `ended` / `task-settled` for the old run. Keep all controls, run
bytes, history, failures, learning, accounting, and pending obligations unchanged.
Cleanup remains separately authorized under the existing cleanup owner.

Report partial effects at their actual boundary; ordinary close is not an atomic
multi-surface transaction. Make no rollback, retry, automatic next-task, or future
Work-admission promise.

## Additional Administrative Procedure

Implement the following inside the new subsection of the same Work owner.
Consumer pointers identify which path applies; they supply no alternative gate.

### 1. Reconcile The Current Target Without Writing

For FR-015 through FR-017, require the exact current defined owner, live
Lightweight authority, one already-worked non-done task, canonical task grammar,
and satisfied current dependencies. Inspect its current spec, plan, task body,
implementation/evidence revision, and authorized definition/reconciliation history.
Any resolver diagnostic, resolved owner, tracked authority, ambiguous target,
unreviewed amendment, split, merge, rekey, or changed task purpose refuses.

A genuine one-to-one mapping may preserve a residual acceptance task after an
explicit scope amendment. Do not require obsolete failed-attempt obligations or
byte-equality between superseded and current task prose. Instead verify the actual
accepted mapping and all current obligations. Matching a key, title, or lifecycle
number does not prove semantic continuity, and old completion evidence does not
become current acceptance.

Identify the exact `blocked-by:` line and its actual cause. A matching independent
verifier must establish that cause is resolved under the current definition.
Completed dependencies and stale wording alone are insufficient. An unresolved
dependency or blocker stops before permission can lead to mutation.

### 2. Establish Historical Disposition, Absence, And Effects

For FR-018 through FR-021, inspect actual original acquisitions and both complete
retention surfaces, including ordered occurrences, reviewed learning, bindings,
failures, and pending/accounting evidence. Preserve required/reviewed revisions
and their full records. Do not substitute normalized summaries, an Inspection
packet, lane history alone, a checkpoint, or reconstructed captures for actual
sources. All existing inspectability and resource limits remain in force.

Correlate an actual terminal return when available. If no original terminal row
exists, use genuine retained invocation, session/lifecycle, and operation evidence
that establishes abandonment of that exact invocation. Report the unavailable
row and the actual observed basis; invent no terminal result or stop reason.
Fresh host observations, or an operator's independently established checks, must
prove that no supervisor, worker, or pending handoff can still act for the exact
target. A dead worker, elapsed time, old returned state, or model assertion is not
that proof. Current cancellation or pause is not administrative permission.

Treat control disposition separately:

- A complete retained claim/checkpoint pair stays byte-identical and confers no
  ownership.
- A previously removed pair needs its actual preserved preimages/hashes, exact
  separate cleanup authorization and removal results, and fresh absence checks
  for both controls. Partial, corrupt, unexplained, changed, or reappearing
  controls refuse. Never recreate the pair to satisfy admission.

Prove effects independently of owner absence and cleanup. Compare actual
operation requests/results and relevant pre-completion surfaces with current
canonical tasks, snapshot, owner/lane-history prefix, and retained current-run
history. Account for every intervening authorized definition and lane write from
its actual evidence; legitimate scope amendment is not unexplained drift.
Known earlier occurrence/learning projections or blocker writes may remain
accounted historical effects. The old completion must not have closed the task
or left a possibly applied completion projection, lane write, or receipt.
Missing preimages, partial or one-sided retention, contradictory records, possible
completion writer entry, or any unknown lane/completion effect refuses.

A historical pending attempt may remain untouched when actual evidence proves
its completion effects were not applied. That proof does not settle the attempt.
Product qualification limits, such as unknown descendant behavior, must not be
used to excuse an unaccounted workflow writer. Never invoke an adapter against
old returned state to establish any of these facts.

### 3. Bind Current Permission And Acceptance

For FR-022 through FR-024, present one ordinary current preview naming the exact
workspace, owner, spec/task, canonical prestate and blocker line, dependencies,
current obligations and semantic mapping, current material hashes including dirty
and untracked bytes, actual terminal/abandonment evidence, and the absence,
effect, and control-disposition findings. Use safe evidence references with
inspectable preimages and hashes, not raw private session paths or secrets.

Obtain a literal current human reply that unambiguously authorizes acceptance,
removal of that proved-resolved blocker metadata, and conditional same-task
administrative close on this basis. Ordinary natural language may refer to this
one preview; add no prescribed phrase, parser, flag, token, or stored consent
object. A vague assent without its bound preview is insufficient.

The current direction to implement 075 is not the original MANUAL confirmation
and supplies no administrative close or native-operation permission. Previous
Work/Ship permission, cleanup consent, an old token, native approval, a
retrospective question, or a model-generated confirmation supplies no new-path
authority. The original literal remains required only for the original path.
Use the existing Needs You handoff/chat fallback if actual permission is missing
at later use; definition creates no artificial clarification now.

Obtain current independent Tester and Reviewer judgments on every currently
defined obligation, current blocker resolution, and exact material. Retain
still-matching current acceptance and freshly inspect its source/binding
applicability. Where the current definition explicitly accepts retained
observations, verifying those exact observations now is the relevant check;
do not repeat native work merely because the old Work run failed.

Historical green output against superseded scope, self-report, and proxy evidence
outside its accepted boundary remain insufficient. Any missing or invalidated
required check, required skip, failure, or rejection prevents close. Route a real
proof gap to its existing owner without inventing evidence, expanding scope,
acquiring native consent, or launching a hidden retry. For T019, retain the exact
three LAN records and current limits; do not add native questions or a busy token.

### 4. Recheck And Apply Only The Administrative Delta

For FR-025 through FR-030, freshly recheck all preview bindings and accepted
evidence before the first write. Use existing owner/task and mutation-path
preflights and the normal task-state reader; a corrupt snapshot or unsafe path
refuses before the MANUAL or metadata write. Snapshot absence remains valid.
Recheck control disposition and owner absence. Unrelated drift stops; changed
material needs new permission and affected acceptance.

Append one plain UTC owner-log MANUAL disposition explicitly described as
post-terminal administrative reconciliation. Record the current obligations and
one-to-one mapping, actual terminal/abandonment basis and unavailable terminal row
if applicable, human permission, independent acceptance, exact resolved blocker,
no-owner/effect findings, and retained or separately cleaned control disposition.
The old run, learning, pending attempt, and accounting remain as recorded.
Use existing log prose, not a new `dude-run-event`, learning event, audit,
status, or permission record.

Only after that gate and append, the coordinator removes exactly the obsolete
`blocked-by:` line from that canonical task under its existing metadata authority.
Preserve the original line in the retained preimage and identify its disposition
in the ordinary log. Do not change the task key, body, dependencies, other
metadata, or any history. This narrow edit is necessary because `setTaskState`
does not remove a blocker; do not pretend the CLI does so, add a removal flag,
pass an empty replacement, or change the parser/writer.

Then use the existing same-task `board.mjs set <tasks.md> <taskKey> done --write`,
render, snapshot, ordinary blocker/state/render/close logs, final backlog
refresh, and lint. Do not insert a `[~]` claim, call `applyLightweightWorkRequest`
or any adapter, restore old state/counters/identity, issue a permit or receipt,
settle learning, or select T020 or another task.

The metadata edit, log appends, board, snapshot, and backlog are ordinary
multi-surface operations, not a new transaction. Recheck expected intervening
bytes and stop on drift. If any step fails, report exactly which log, metadata,
glyph, snapshot, render, or backlog effects committed and what remains undone;
claim neither rollback nor successful close and do not automatically retry.
Successful closeout names only the current administrative task outcome and
qualified scope, leaving old Work history and all unqualified limits explicit.

## Source, Test, And Generation Scope

These are the complete implementation material targets. Discovered identities
name this repository's owners; shipped core still routes generically by roster.

| Source | Generated material | Owner and change |
| --- | --- | --- |
| `src/skills/dude-work/SKILL.md` | `.github/skills/dude-work/SKILL.md` | `dude-pack-authoring-skill-smith`: own the additional procedure, discovery trigger, and branch scoping; add only concise local pointers at adapter-only, continuity, refusal-reporting, and learning-seal clauses. All normal Work rules stay binding. |
| `src/skills/dude-lightweight-execution/SKILL.md` | `.github/skills/dude-lightweight-execution/SKILL.md` | Skill Smith: qualify Manual `[x]` Drift and Close pointers for both outside-Work paths, including proved blocker metadata and actual control disposition. Ordinary acceptance supplies no bypass. |
| `src/skills/dude-verification-before-completion/SKILL.md` | `.github/skills/dude-verification-before-completion/SKILL.md` | Skill Smith: keep the capacity/no-bypass pointer; briefly defer the new path's current inspection of definition-permitted retained evidence to Work. Do not relax ordinary freshness or original overflow acceptance. |
| `src/agents/dude.agent.md` | `.github/agents/dude.agent.md` | `dude-pack-authoring-agent-smith`: route an explicit administrative request and gate Close through the Work owner. Preserve original MANUAL routing, governance deferral, Ship/Work stops, role boundaries, and metadata/models. |
| `scripts/current-format-contract.test.mjs` | None | `dude-pack-coding-tester`: add three focused instruction/parity tests using existing helpers. Preserve all original manual assertions. |
| `src/skills/dude-lightweight-execution/board.test.mjs` | None | Tester: add one disposable blocked/current-scope/cleaned-control close fixture. Preserve the original manual-close fixture and other writer tests. |

No command documentation change is needed: there is no new command and current
command guidance retains ordinary Work's boundary. No change is planned to
`board.mjs`, `tasks.mjs`, runner/adapter/recovery/attestation modules, their schemas,
model configuration, installed packs, other packages, or actual controls.
`src/skills/dude-work/host-adapter.test.mjs` is an unchanged regression input,
not an authoring target. If implementation requires a runtime change or wider
scope, stop and return that boundary rather than broadening this delivery.

### Selected-Output Generation

Reuse `listCoreOutputs(repoRoot)` and `writeCoreOutput(destRoot, output)` from
`scripts/build-release.mjs`, with no new wrapper or generator:

1. Enumerate once, then filter by exact `relPath`. T004 selects only the three
   skill outputs above; T005 selects only the agent output. Require exactly one
   record per selected path before writing.
2. Check destination preimages for unrelated edits and preflight every selected
   path with existing `resolveMutationPath` from
   `src/skills/dude-engine/lib/workspace-paths.mjs`. An unsafe path, unrelated
   edit, enumeration failure, or mismatch stops without a broad-build fallback.
3. The coordinator calls `writeCoreOutput` only for those selected records.
   Skills remain source copies; the agent uses the existing Copilot projection.
   Preserve every other WIP, profile, model-config, pack, and generated byte.
4. For parity, use an empty disposable destination, select exactly all four
   outputs, and compare against committed generated bytes and existing
   `materializedSourceBytes` expectations. Assert the emitted file set is exactly
   those four paths.

Do not call `buildDev`, `buildRelease`, `build-dev.mjs`, `build-release.mjs` as a
CLI, or core cleanup against the live root. Existing build tests may exercise
broad builders only with disposable mutation destinations. Tests never repair
unrelated generated drift or hand-edit generated output.

## Phases And Verification

| Unit | Slice | Trace |
| --- | --- | --- |
| T001@m075rule | Preserved completed original skills | US1/US2; FR-001–FR-014; SC-001–SC-005 |
| T002@a075link | Preserved completed original coordinator routing | US1/US2; FR-004, FR-007–FR-014 |
| T003@v075test | Preserved completed original tests and acceptance | US1/US2; SC-001–SC-005 |
| T004@s075reco | Skill Smith authors the three skill sources; coordinator projects only their outputs | US3/US4; FR-015–FR-030; preserve FR-001–FR-014 |
| T005@a075reco | Agent Smith authors coordinator routing; coordinator projects its one output | US3/US4; FR-015, FR-022–FR-030 |
| T006@v075reco | Tester authors and executes additional coverage; independent Reviewer judges final meaning and evidence | All stories; SC-001–SC-010 |

T004 depends on completed T003; T005 depends on T004; T006 depends on T005.
No parallel flags or independent review task are needed. Each author returns
verification needs, not acceptance. Before T006's tests are authored, use the
existing original manual selector and current source/generated checks for the
authored slices, with independent review of the new prose. T006 supplies final additional tests;
zero matching tests never counts as success.

### Instruction Contracts

Keep these existing top-level tests and their original assertions:

- `terminal manual resolution: owning rules reject deletions and misplaced replacements`
- `terminal manual resolution: consumers preserve ordinary Work boundaries`
- `terminal manual resolution: generated instruction parity`
- `terminal manual resolution: manual close preserves retained fixture bytes`

Add these three top-level tests in `scripts/current-format-contract.test.mjs`:

- `terminal administrative reconciliation: owning rules reject deletions and misplaced replacements`
- `terminal administrative reconciliation: consumers preserve both manual paths`
- `terminal administrative reconciliation: generated instruction parity`

Use existing visible-section, normalized rule-block, deletion-falsifier, and
materialized-source helpers. Anchor new requirements to their actual owning
subsection and consumer pointers. Check current semantic mapping, resolved
blocker, retained evidence, genuine provenance without an invented terminal row,
no owner, known effects, cleaned controls, permission, current acceptance, exact
administrative delta, and unchanged Work authority.

Delete each governing block or meaningful required clause while other inputs
remain valid and require the intended assertion to fail. Fenced, commented,
duplicated, or irrelevant-section replacements must not mask deletion; harmless
soft wrapping must pass. Keep the original literal and original refusal
assertions intact. Check explicit branch scoping, not merely the presence of
both a broad refusal and an unrelated permission sentence.

The parity test uses Selected-Output Generation into a disposable root and checks
both paths in all applicable outputs. Static contracts establish delivered
guidance; they neither implement a test-side admission engine nor prove semantic
interpretation, human authenticity, or actual close behavior.

### Executed Administrative-Close Fixture

Add one top-level test in `src/skills/dude-lightweight-execution/board.test.mjs`:

`terminal administrative reconciliation: blocked same-task close preserves retained fixture bytes`

Reuse `scaffoldBacklogHookFeature`, `boardCli`, `loadTaskStateLib`, `parseTasks`,
`renderBoard`, and the existing backlog/full-tree comparison patterns. Keep
fixtures inline. All authority, permission, mapping, and acceptance are explicitly
modeled already-satisfied inputs; they supply no real task authority.

1. In a short disposable root, seed one exact defined owner, a done prerequisite,
   one `[!]` target with a specific obsolete `blocked-by:` line and current
   explicitly amended acceptance body, and an open dependent sibling. Include
   an ordinary recorded one-to-one definition mapping, prior owner log, discovered
   work and archived/history bytes, and a valid snapshot with an unrelated
   feature entry.
2. Retain synthetic old-run, failure, pending/accounting, complete dual learning
   histories, claim/checkpoint preimages, and separate cleanup authorization/result
   bytes. Model actual abandonment provenance with no original terminal row.
   The two synthetic live control locations start absent. No real state,
   attestation, private session, or host-control path enters the fixture.
3. Seed backlog and capture full tree buffers. Append one modeled administrative
   MANUAL line. Perform the coordinator-modeled exact blocker-line removal with
   no glyph claim or other task edit. Execute the actual CLI:
   `boardCli(['set', file, taskKey, 'done', '--write', '--root', root])`, then
   `boardCli(['render', file, '--write', '--root', root])`. Require successful
   exit and no signal from both calls.
4. Append modeled ordinary blocker/state/render/close events in the existing
   owner log and call existing `refreshCommittedBacklog({ root })` after the
   final log append. The fixture supplies log and metadata edits; the CLI does
   not authorize or create them.
5. Compare the entire task postimage with the explicit one-line blocker removal,
   same-key `[!]` to `[x]` change, and expected `renderBoard` result. Assert stable
   current obligations, labels, bodies, dependencies, other metadata, all other
   task states, discovered work, and the complete immutable history/archive suffix.
   The now-ready sibling remains open and unclaimed.
6. Compare complete snapshot bytes against an independently serialized expected
   glyph map and unchanged unrelated entries. Permit only the target feature's
   serializer-produced `updated_at`, validated against the actual final-render
   call interval before using it in the expected postimage.
7. Require owner bytes to equal the original prefix plus exactly the modeled
   MANUAL and ordinary event appends, in order. Buffer-compare every retained
   synthetic evidence and cleanup file, and require both live control locations
   still absent. Compare final backlog bytes with `renderArtifacts({ root })`.
   The complete tree delta may contain only the task, snapshot, owner-log appends,
   and derived backlog pair. No new Work event, permit, receipt, state, or
   learning-resolution record may appear.

Return observed CLI results and full postimage/preservation evidence for SC-008.
Do not call a Work adapter or `applyLightweightWorkRequest`, replay a real failed
run, add a permission validator, or claim the model authenticated an operator.
The original SC-001/SC-003 fixture remains separate and unchanged.

### Independent Reviewer Walkthrough

The independent `dude-reviewer` records facts, owning rule, required decision,
and concise rationale for every case and every listed variant below. Hold other
facts valid when removing one necessary fact. Keep this in the existing review
return; add no checklist or decision store. Judge the Tester's executed postimage
evidence separately from policy interpretation.

Retain the original matrix:

| Case | Required instruction-level decision |
| --- | --- |
| Complete pre-writer byte-overflow basis, retained reviewed alternative, independently established owner absence, current permission, fresh passing acceptance | One MANUAL disposition and ordinary same-task close; old run and controls preserved. |
| Dead worker only or unaccounted-for supervisor/handoff | Refuse before disposition or lane write. |
| Equal accepted bytes but missing preimages, possible writer entry, or one-sided completion evidence | Refuse; approval cannot resolve the possible effect. |
| Wrong target, changed material/evidence, old green results, required skip, or Reviewer rejection | No close, automatic repair, or reused approval. |
| Active Work, tracked authority, or a different terminal class | No manual exception; current behavior remains. |
| Manual writer or later refresh/lint fails after a write | Report actual partial effects; no rollback or successful-close claim. |

The last original unsupported-class row judges the original overflow route; the
new route must independently satisfy every new gate. No automatic fallback exists.

| Additional case and variants | Required instruction-level decision |
| --- | --- |
| Complete T019-shaped synthetic case: `[!]`, completed prerequisite, approved current local CLI plus three retained LAN obligations, true one-to-one mapping, complete reviewed learning, verified blocker resolution, no owner, proved effects, separately cleaned controls, current permission and acceptance | Admit only separate same-task administrative handling. This judges a synthetic case, not actual T019 eligibility. |
| No original terminal row with genuine independently checked abandonment and complete effect proof; then remove the genuine abandonment proof | First case may qualify with accurate missing-row reporting; second refuses. Never invent a terminal return. |
| Blocker still real; blocker merely asserted stale; only prerequisite completion supplied; dependency still open or missing | Each refuses before MANUAL or metadata change. |
| Unreviewed scope change; same key with changed purpose; split, merge, rekey, or missing semantic mapping; old obligations or old greens substituted for current acceptance | Each refuses. Explicit amendment permits only its reviewed current scope, not inherited acceptance. |
| Missing defined owner, multiple defined owners, resolver diagnostic, wrong exact task/spec, resolved ledger, tracked lane, or never-worked task | Each refuses; number/slug/title and board availability give no fallback. |
| Retained complete controls with all other new gates met; separately cleaned pair with actual proof; then missing preimage, missing cleanup authority/result, partial/corrupt pair, or reappearance | First two may qualify without changing/restoring controls; each incomplete or drifting variant refuses. |
| Active supervisor, worker, or pending handoff; unknown owner; worker-exit/PID/age/model assertion alone | Each refuses regardless of user permission. |
| Missing effect preimage, possible completion writer entry, one-sided completion/receipt, contradictory lane records, or merely absent terminal row/control pair offered as no-effect proof | Each refuses. Known earlier authorized learning projections need complete accounting, not erasure. |
| Missing, partial, stale, conflicting, wrong-target, wrong-authority, hash-only, reconstructed, or uninspectable retained evidence | Each refuses without state restoration, history truncation, wider limits, or another Work run. |
| Exact current natural-language permission bound to one preview; then implementation-only direction, unbound generic assent, prior Work/Ship permission, original-path token alone, native approval, cleanup permission, retrospective question, or model-authored approval | First may qualify for the displayed new-path action only; every unsupported authority variant refuses. Original path still requires its literal confirmation. |
| Current definition/material/evidence/prestate drifts after preview; retained observation does not cover a current obligation; required failure/skip; independent review rejection | Each prevents close. Obtain only legitimately missing authority or evidence through its owner; no hidden rerun or invented native consent. |
| Successful administrative report; then MANUAL append, metadata removal, writer, snapshot, render, backlog, or lint failure after any earlier write | Success reports only current accepted scope and distinct administrative outcome. Every partial variant reports actual effects, leaves old learning/pending/accounting intact, and permits no automatic retry or next task. |

Successful-report examples must retain the stated native wire-busy and broader
concurrency/LAN/macOS/App/descendant limits. They cannot treat current acceptance
as Work settlement, learning resolution, future admission, T020 completion, or
Git permission.

### Exact Future Verification Commands

Run from the repository root after the selected generated outputs are current.
These commands are for the Tester/coordinator during implementation, not this
definition invocation.

```text
node --test --test-name-pattern="^terminal manual resolution:" scripts/current-format-contract.test.mjs src/skills/dude-lightweight-execution/board.test.mjs
node --test --test-name-pattern="^terminal administrative reconciliation:" scripts/current-format-contract.test.mjs src/skills/dude-lightweight-execution/board.test.mjs
node --test --test-name-pattern="^Work recovery admission: (learning history without its repeat evidence refuses before admission|unsupported or inconsistent governance history cannot reopen learning|only a freshly governed alternative can charge the new run)$" src/skills/dude-work/host-adapter.test.mjs
node --test scripts/current-format-contract.test.mjs src/skills/dude-lightweight-execution/board.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs
node .github/skills/dude-lint/lint.mjs .
```

The first selector must execute and pass the four original top-level cases; the
second must execute and pass the four additional cases. The runner selector must
execute and pass all three named existing tests and their 15 reported subtests,
including the reviewed-history refusal and its missing-retention and
permitted-fresh-governance neighbors. Preserve those tests without weakening,
replacing, or adding a new runtime path. The final suite retains instruction,
board, and disposable dev/release coverage. Selected four-output parity and both
separate executed fixtures must pass with all listed assertions intact.

Execute the complete full-suite command above against the final selected generated
revision. Tester returns exact commands, directory, actual exit statuses, selected
cases, pass/fail/skip counts, failure output, full postimage assertions, byte
comparisons, and coverage limits. Preserve the original failed runs and report
the full-suite result without filtering failures or turning its exit into success.
Distinguish nonmatching selector exclusions from required skips; a wrapper pass
is not coverage. Zero matches, required skipped cases, or new, in-scope, changed,
or unexplained failures block acceptance.

For this administrative increment's T006 only, the seven failure identities below
may support a separate qualified no-introduced-regression finding. Each must be
attributable solely to the unchanged unrelated WIP in
`.github/agents/dude-reviewer.agent.md` (the intentional host-model override) and
`.github/instructions/dude.instructions.md` (three preexisting prose lines).
Names alone do not establish that cause or excuse any other failure:

- `checked-in dev core is a byte-identical non-mutating projection of authoritative source`
- `T024 native proposal delivery matches every validated core output without rewriting dogfood`
- `T024 source/dogfood whole-core parity`
- `T018 release ships the lazy A2A runtime and notice byte-for-byte, and its delivered extension stays off without the optional A2A pack`
- `persisted datetimes: shared instructions keep new agent values canonical and preserve existing evidence`
- `plain-language writing reaches definitions and replies without replacing existing contracts`
- `T007 generated core carries no governance content outside a complete materialization`

That finding requires an independent controlled pre-change comparison using all
ten actual preimages from Source, Test, And Generation Scope, with every other
input byte identical, including both unrelated WIP files and userModels WIP.
Require the same seven failure identities in the same order and byte-identical
six leaf assertions after normalizing only temporary-root values and durations;
the remaining parent failure must be the same propagated child failure. Preserve
raw results unchanged. Require unchanged skip identities and reasons, no loss of
passed coverage, and no Feature 075 observable coverage gap. A new or changed skip,
missing comparison evidence, or any other failure prevents this qualified finding.

The coordinator-supplied retained comparison reports a 3,526-file input identical
except for those ten actual preimages: the current full run has 261 tests,
251 passes, 7 failures, and 3 Windows skips; the controlled pre-change run has
257 tests, 247 passes, the same 7 failures, and the same 3 skips. The difference is
exactly four added cases and four passes, with no new failure or skip. These are
supplied execution observations, not checks run during definition. Independent
Reviewer judgment of the retained comparison and current applicability is still
required.

Keep both unrelated WIP generated files, userModels WIP, and original failed runs
unchanged. Repair or regeneration outside the four selected outputs is not
authorized. This disposition does not make the full suite pass, cover the three
Windows-skipped behaviors, excuse any Feature 075 acceptance failure, permit test
assertion changes, or change ordinary Work acceptance. Use retained executions
that still match the final tested material; this wording-only refresh requires no
new test execution merely to chase green. Missing or invalidated evidence still
requires its existing check.

Coordinator owns lint and live generated writes. Reviewer independently judges
scope, both procedures, all semantic variants, prose, actual writer evidence, and
the bounded regression comparison. Coordinator lint must still report zero
failures before any definition-readiness claim.

## Guardrails, Reconciliation, And Risks

Existing project guardrails suffice; add none. Exact ownership, coordinator-only
state mutation, source-generated parity, independent acceptance, and unchanged
history remain required. There is no UI/design gate or new supporting artifact.

Re-definition keeps the three existing task units, glyphs, metadata, dependencies,
and history exactly; adds T004-T006 as new open serial proposals; and drops,
changes, rekeys, or archives no unit. Preserve the idea's protected sections and
complete Coordinator Log prefix, the existing retrospective, and any discovered
or archived material. The separate temporary reconciliation handoff is not a
product registry or runtime input.

The coordinator must re-resolve ownership, compare protected bytes and staged
mapping, compose its execution-state/log half, and validate the exact final
re-definition before publication under the existing coordinated all-or-restored
workflow. This is not first definition; do not allocate a ledger or invoke the
first-definition publisher. Stage-only authoring, earlier lint results, and
content checks do not establish definition readiness. Coordinator lint must
report zero failures for the composed current revision.

Actual terminal/abandonment and effect proof may remain unavailable. That is a
target admission refusal, not an implementation task or invented clarification.
The instruction policy cannot authenticate a human or prevent a malicious
coordinator. Ordinary administrative close can partially commit, and no new
transaction or recovery capability is promised. Any need to relax the existing
runner, reviewed-history refusal, runtime schema, cap, or old branch is outside
this implementation boundary.

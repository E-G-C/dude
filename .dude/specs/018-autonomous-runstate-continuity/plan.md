# Implementation Plan: Autonomous RunState Continuity

## Summary

Add one high-level Work host adapter beside the existing recovery runtime. The adapter becomes the only ordinary coordinator entry point for runtime operations, imports the existing public `runCommand`, `validateRunState`, canonicalization, hashing, governance-request derivation, and recovery-result validation boundaries, and deterministically composes compatibility completion, trusted completion, learning, authoritative projection preparation, lane-effect authorization, lane-owner application, lane-receipt settlement, and read-only audit from validated state plus typed authoritative inputs. It owns immutable last-accepted state, provisional effect handling, successor validation, explicit nonterminal refusal outcomes, the one-correction limit, checkpoint lifecycle, and typed one-shot recovery notices.

The current runtime inspection supports this composition: `src/skills/dude-work/recovery.mjs` already exports strict RunState validation, a closed `runCommand` protocol, legacy `completeAttempt`, trusted `captureCompletionV2` and `finalizeCompletionV2`, and all learning and transition routes. Its closed `action-mismatch` refusal already returns the exact predecessor unchanged. The smallest design is therefore a new `src/skills/dude-work/host-adapter.mjs` with focused tests plus only the FR-028 through FR-030 recovery-semantic exception and the two pure directly tested helper exports.

The active coordinator turn is the surviving invocation supervisor. It creates and retains a random invocation identity before launching any adapter worker, serializes one worker token and generation at a time, and explicitly hands authority to one replacement only after observing the exact prior worker exit. Adapter workers and persistent shells are replaceable children; loss of the supervisor or its independently retained identity is outside v1 and hard-stops.

The same module defines a narrow injected checkpoint interface and a dependency-free default backed by a bounded operating-system temporary location outside the workspace. One exclusive per-workspace-target ownership claim provides single-writer serialization; separate `acceptedRevision` and `hostRevision` values detect stale or incorrect updates but do not provide synchronization. This avoids an editor storage service, identity service, process monitor, database, daemon, project-state path, or second ledger. `src/` remains authoritative; `node scripts/build-dev.mjs` projects the new module and prompt changes into `.github/`.

Definition reconciliation keeps completed T001@62726964, T002@63686b70, and T003@696e7467 with unchanged meanings and durable keys, archives blocked T004@76616c69 after its confirmed durable-key reconciliation defect, and introduces fresh T004@72756e72. The fresh task adds one adjacent `host-adapter-runner.mjs` to supply the bounded foreground challenge sequence missing from the shipped adapter without moving or copying adapter semantics. Later reconciliation kept completed T004@72756e72 byte-identical, archived defective T005@6173736d after its user-confirmed fresh-authorization failure, and introduced T006@61737376 for producing-host prevalidation coverage and fresh verification and review. This re-definition retains T007@6d726b72 one-to-one for the already-delivered test-only acceptance coverage: two separate hostile Proxy trap-error marker cases and the inert-snapshot revalidation regression, followed only by fresh reverification and independent review; no production or generated change is planned.

This feature has no progress objective and no active ObjectiveRegistry region.

Current reconciliation keeps completed T001@62726964 through T004@72756e72 and T007@6d726b72 unchanged; archives blocked T008@6d756c74 as dropped-defective after its settled verification-failed occurrence and missing lint Inspection source made fresh authorization impossible; and introduces open T009@6c696e74, dependent on T007 rather than archived T008, to preserve and reverify T008's landed finding-set correction while adding the missing lint stream support. T009 inherits no task state or evidence.

Current redefinition keeps completed T001@62726964 through T004@72756e72 and T007@6d726b72 unchanged, retains blocked T009@6c696e74 one-to-one with its exact scope and blocker unchanged, and introduces independent open T010@7061636b, dependent only on T007, for the bounded recovery-packet correction. No task is changed or dropped, and no archive or execution history changes.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`; Markdown prompt and documentation contracts
**Primary Dependencies**: Node built-ins for cryptographic hashing, filesystem, operating-system temporary paths, and path handling; exported `runCommand`, `validateRunState`, `canonicalJson`, `sha256`, `deriveGovernanceRuntimeRequestV1`, and `validateRecoveryRuntimeResultV1` from `src/skills/dude-work/recovery.mjs`; existing authoritative lane owners and receipts
**Storage**: one exclusive ownership claim and one size-bounded invocation-scoped checkpoint per exact workspace and canonical target under a canonical trusted OS temporary root, accessed only through an injected checkpoint interface; one active worker generation; separate accepted-state and host metadata revisions; no project-local state, database, editor-specific API, durable ledger, time-based lease, TTL, or expiry cleanup
**Testing**: `node:test` unit, failure-injection, and child-process worker-handoff fixtures; existing recovery regression tests; static prompt contracts; source/generated projection tests; full discovered suite; independent Tester and Code Reviewer evidence
**Target Platform**: supported macOS, Linux, and Windows local Dude workspaces in VS Code or equivalent local hosts
**Project Type**: reusable coordination runtime, internal CLI/module adapter, generated core projection, and concise user documentation
**Performance Goals**: constant one-claim and one-checkpoint active footprint per workspace-target pair; linear work in bounded checkpoint and RunState byte size; no polling, process monitor, daemon, background scheduler, or network call
**Constraints**: all recovery semantics remain unchanged except the ordinary accepted-completion bridge defined by FR-028 through FR-030; qualifying unchanged-state refusals are nonterminal; one immediate same-class correction only; one active invocation and worker generation per exact workspace-target pair; handoff only after exact prior-worker exit; fail closed on uncertain side effects or observed storage-operation failure; shell environment and checkpoint bytes never establish caller identity; `src/` is authoritative and generated `.github/` files are never hand-edited

## Spec Quality Validation

- The specification is technology-neutral and contains six independently testable stories: nonterminal unchanged-state refusal handling, trusted review and accepted-completion routing, surviving-supervisor worker recovery, stale or corrupt refusal, authority boundaries outside the named exception, and checkpoint lifecycle/collision/reporting.
- FR-001 through FR-033 cover the sole adapter boundary, supervisor-supplied identity, exclusive worker serialization and handoff, immutable acceptance, dual revisions, deterministic route selection and complete lane-effect composition, exact zero-charge classification, the one-correction rule, trusted failure governance, checkpoint authority and resume binding, lifecycle cleanup, stale-orphan refusal, typed one-shot notices, the named ordinary accepted-completion bridge, independent Assessment validation, stale-versus-invalid challenge classification, unchanged boundaries outside those contracts, and explicit non-goals.
- SC-001 through SC-018 provide measurable oracles for nontermination, byte identity, counters, trusted routing, worker recovery and handoff, supervisor loss, drift refusal, correction caps, dual revisions, evidence integrity, lifecycle, collision, portable storage behavior, one-shot reporting, the positive bridge, exhaustive bridge refusal, Assessment response classification and safe diagnostics, scope, and regression safety.
- Edge cases distinguish closed no-effect incidents from indeterminate side effects and cover failures before, during, and after provisional successor and receipt handling.
- The specification contains no implementation paths, APIs, storage mechanism, or unresolved clarification marker; named fields are limited to the existing semantic recovery-notice and Assessment contracts.

The specification passed its definition-time document gate before this plan was written. This is not a lint or execution-readiness claim; coordinator validation remains pending.

## Guardrail Check

- Compose the strict existing runtime instead of duplicating completion, learning, transition, budget, or governance semantics.
- Keep deterministic route selection, state identity, worker generation, accepted and host revisions, collision, correction count, and cleanup decisions in code; model reasoning remains outside the authority boundary.
- Keep the existing adapter as the semantic owner and its adjacent foreground runner bounded by existing budgets with no framework, model call, service, REPL, or checkpoint expansion. Preserve T004's three completed protocol groups and add only one focused Assessment classification matrix.
- Keep the checkpoint outside the project tree and out of existing audit/history surfaces.
- Keep prompt changes concise: `dude-work` owns the detailed adapter contract and `dude.agent.md` carries only the ordinary-use pointer.

No new durable guardrail is proposed. Existing deterministic and smallest-design guardrails cover the feature.

## Accepted Authority And Non-Overlap

- Feature 005 continues to own autonomous policy, budgets, recovery authorization, verification, review, and optional objective semantics.
- Feature 009 continues to own trusted completion retention, repeated finding or approach learning, projections, permits, receipts, and governed transitions.
- Feature 013 continues to own unattended stop discipline and actionable named halt reporting. This feature adds only the narrower inline recovery notice after successful host recovery.
- Feature 014 continues to own repeated-review escalation wording and precedence.
- Feature 017 remains incident evidence only. No Ship-specific route, test condition, or package mutation is introduced.
- Feature 019 remains the sole owner of the production specialist-attestation producer that turns actual Tester and Code Reviewer results into trusted captures. The adjacent runner invokes that shipped producer-backed path and passes its capture streams unchanged into the existing adapter; it does not recreate producer, capture, or trust semantics and mutates no Feature 019 package. Fresh T004@72756e72 closes through that path while naming its new valid `occurrenceIdentity`, with no throwaway driver, backfill, forged permit, deletion, re-mint, or supersession of the four preserved prior T001 through T004 occurrence rows.
- The existing low-level runtime remains the owner of RunState validation and state-transition semantics except for the FR-028 through FR-030 ordinary accepted-completion bridge; the adapter owns host composition, continuity, and that narrowly bound lane-effect transaction.

## Architecture

Raise only the recovery Inspection model-packet byte bound, `MAX_PACKET_BYTES`, from 65,536 to the fixed conventional bound of 131,072 bytes. Keep `MAX_PACKET_ITEMS=16`, `MAX_SOURCE_BODY_BYTES=1_048_576`, and `MAX_INSPECTION_BODY_BYTES=4_194_304` unchanged. Existing owner-log projection continues to retain the maximal suffix of complete whole events; all admitted non-owner evidence remains complete. After owner-log suffix trimming, any packet still above 131,072 bytes remains a hard descriptor-only Inspection with `modelPacket: null` and no completion, recovery, or state charge.

This is one pragmatic fixed increase for the unusually history-heavy and nearly finished Feature 018, not a repeated-growth policy. Implement it only in authoritative `src/skills/dude-work/recovery.mjs`, project the generated counterpart through `build-dev`, and add focused boundary coverage. After T009 closes, Feature 018 receives no further extensions; future runtime defects belong in new small features.

### 1. Existing host adapter and one adjacent coordinator runner

Keep `src/skills/dude-work/host-adapter.mjs` as the existing semantic owner and add adjacent `src/skills/dude-work/host-adapter-runner.mjs` as the bounded foreground coordinator host. The runner exposes one public module function, `runHostAdapter`, plus a CLI and invokes the existing adapter rather than copying its validators, route implementations, check sets, budgets, governance rules, runtime, lane owner, checkpoint store, or Feature 019 producer-backed specialist-attestation path. It adds no exposed route or mode, model call, daemon, service, REPL, registry, editor integration, database, framework, new persistent state, checkpoint field, or second ledger.

The runner establishes supervisor admission, invocation identity, and worker token; derives conservative no-effect authority; acquires fresh Inspection and bound typed inputs; passes adapter-produced capture streams through exactly; maintains dual current-run and lane projections; reestablishes fresh lane binding; optionally integrates the existing checkpoint without expanding it; and emits the accepted RunState as base64 plus hash. It continues under the same live supervisor until an allowed terminal outcome and fails closed on supervisor loss, with no blind retry, fallback, direct board CLI, direct edit, hand-minted capture, or copied semantics.

The active coordinator turn calls the runner as the invocation supervisor. Before the first worker launch, the supervisor generates a cryptographically random invocation identity and a fresh worker token and generation, retains both outside checkpoint bytes, and passes them explicitly to the worker. A persistent shell or adapter worker may be replaced while the supervisor survives. The checkpoint binds the supplied identity but is never allowed to tell a caller who it is.

#### Foreground challenge sequence

The runner alone selects a bounded foreground sequence of exactly three challenge kinds: `assessment`, `specialist-pair`, and `learning-review`. An `assessment` challenge binds one fresh Inspection and the current accepted RunState and revisions; a `specialist-pair` challenge binds the authorized attempt and its accepted Assessment and requires one actual Tester result plus one actual Code Reviewer result from the Feature 019 producer; a `learning-review` challenge binds the settled rejected result, its projection receipt, one fresh Inspection, and the exact governance request. Every response repeats the outstanding challenge identity and bindings. A foreign, mismatched, duplicate, or replayed response is rejected before adapter progress.

The sequence is bounded by the existing overall and recovery budgets in accepted RunState. Exactly one challenge may be outstanding and exactly one bound response may be accepted at a time. `cancel` is valid while any challenge is outstanding and follows the existing explicit-cancellation cleanup boundary. The runner exposes no route or transition mode, performs no model call, and creates no queue, timeout, background listener, daemon, service, REPL, registry, or checkpoint expansion.

#### Tagged Assessment validation and classification

The runner already imports `validateAssessment` from `recovery.mjs`, but `boundAssessment()` currently collapses every validator rejection to `null`, and `requestAssessment()` then maps every `null` to `challenge-response-stale`. Replace that nullable helper with one closed tagged internal result: valid with the validated cloned Assessment, stale, or invalid with one bounded safe detail token. Apply it to both an initial Assessment and every exchanged Assessment response; identity, foreign, replay, and ordering checks still run before semantic response validation.

Validation remains owned by `validateAssessment`. First call it unchanged with the outstanding canonical target and current Inspection. If it rejects, classify the candidate as stale only when it is a structurally recognizable Assessment with a 64-hex `evidenceHash` unequal to the current Inspection and the otherwise-unchanged candidate passes `validateAssessment` when tested against that current hash. This proves that binding staleness is the sole defect without reimplementing the Assessment schema. Every other rejection is invalid.

Every malformed Assessment uses the single fixed runner-owned detail `Assessment: invalid-contract`, including the trailing-slash case. The runner performs no validator-message parsing, exception inspection, field-location extraction, or diagnostic mapping, and interpolates no rejected target text, evidence body, hash, arbitrary message or value, credential, or rejected-field path. Keep `orphan()` and the existing terminal result shape: stale and invalid both remain fail-closed with `cleanup: not-attempted`, unchanged accepted state and counters, no lane mutation, and no authorization or implementation. Add no retry or same-challenge correction.

In `src/skills/dude-work/SKILL.md`, add one concise host-facing rule requiring the producer of a model Assessment challenge response to call the existing Assessment validator against the outstanding target and Inspection before returning the response. The runner still validates independently. Do not add prompt-level field checks or a duplicate manual validator. `node scripts/build-dev.mjs` produces the `.github/` counterpart; extend static prose contracts only if the current section-bound contract pattern requires the new sentence.

The adapter accepts semantic Work operations rather than low-level route names. Its closed operation set is:

- `begin`: under the supervisor-supplied invocation identity and initial worker generation, validate the initial RunState and exact workspace, target, owner, lane, and authoritative prestate, then create the exclusive ownership claim and checkpoint.
- `inspect`: invoke fresh Inspection and refresh only proven prestate bindings.
- `authorize-attempt`: invoke existing authorization from current accepted state and typed assessment or permit evidence.
- `record-attempt-result`: select the completion flow from current policy, pending authorization, and trusted result evidence.
- `advance-governance`: select the applicable learning or transition route from the validated governance phase and typed authoritative evidence or receipt.
- `prepare-authoritative-projection`: derive and validate the required projection from the retained trusted completion and current governance state.
- `authorize-lane-effect`: issue the one replay-sealed ordinary accepted-completion permit only from the complete FR-028 predicate set.
- `apply-lane-effect`: invoke the authoritative lane owner with the exact permit-bound mutation and prestate.
- `commit-lane-receipt`: freshly revalidate and commit the receipt and final poststate before settlement.
- `audit-run`: read and validate the final run state and lane evidence without mutation.
- `settle-effect`: verify a required projection or lane effect and its receipt before accepting the provisional successor.
- `handoff-worker`: after the supervisor observes the exact active-worker exit, replace the prior token and generation with one fresh token and generation under the same independently supplied invocation identity.
- `end`: clear only for a named natural end, controlled end, cancellation, safely recorded hard stop, or successful task settlement.
- `resume`: load and freshly validate a same-invocation checkpoint after explicit worker handoff and before any other replacement-worker operation.

The request envelope is closed and always carries a version, supervisor-supplied invocation identity, active worker token and generation, canonical target binding, semantic operation, expected `acceptedRevision` and `hostRevision`, and the operation's typed authoritative inputs. `begin` additionally carries the initial validated state and exact owner/lane prestate. Later calls never supply a replacement accepted state. Callers cannot submit `completeAttempt`, `complete.capture`, `complete.finalize`, `learn`, a transition mode, or any other low-level route name as an ordinary routing choice. Incident correction remains exceptional internal adapter behavior and is never exposed as an ordinary semantic operation.

Route selection is deterministic:

1. Guarded compatibility completion uses the existing legacy completion route.
2. Autonomous completion with trusted verification or review evidence uses trusted capture, required authoritative projection preparation, and trusted finalize. An ordinary accepted Lightweight completion may then use only the FR-028 through FR-030 bridge.
3. A rejected `specialist-pair` is captured and finalized as its real rejected result, and its required projection is prepared, applied, receipted, and settled before fresh Inspection establishes the binding for a `learning-review` challenge. Accepted learning governance may select a materially different alternative before a new `assessment` and `specialist-pair`. The runner never reclassifies the rejection as a host incident or requests a later attempt before rejection settlement.

The retained projection keeps the approach event first and sorts only finding events by `occurrenceIdentity`; the host comparison maps those projected finding events to `findingIdentity` and sorts only that mapped projected list with the existing UTF-8 comparator before exact comparison with normalized trusted finding identities.

4. Governance, projection, lane-effect, receipt, and audit operations derive their low-level transition from the validated current phase, semantic request, exact authority, and receipt type. A caller-supplied low-level route token or transition mode is rejected before invocation.

In the production topology, `src/skills/dude-work/host-adapter.mjs` remains the semantic owner: `specialistAttestation` receives the runner-transported structured specialist result, constructs the single actual Tester capture, normalizes it, derives its state, and constructs its trusted source streams; Reviewer capture construction remains unchanged. For `address-test` and `retain-learning` only, it reuses that exact Tester capture and exact derived stream row in both existing `verification` and `lint` categories. `execute-task`, `retry-task`, and `address-review` emit no lint stream, and `reconcile-derived-definition` remains refused before capture. `src/skills/dude-work/host-adapter-runner.mjs` adds no attestation semantics: it transports specialist results, retains adapter-observed verification, review, and lint rows, and supplies those rows unchanged in later `runtimeInput`; it does not construct a capture, derive state, select a category, or copy the action matrix. This adds no schema, field, identity, store, or dispatch.

### 2. Closed adapter outcomes

The adapter returns one of five typed outcomes:

- `accepted`: a validated successor has become the accepted state; `acceptedRevision` advances only if its canonical bytes differ, and `hostRevision` reflects the serialized host update.
- `effect-required`: a validated provisional successor exists, but the predecessor remains accepted until the named authoritative effect and receipt are supplied through `settle-effect`.
- `closed-refusal`: no successor or side effect was accepted; exact predecessor bytes, hash, `acceptedRevision`, and task counters remain authoritative. This outcome is nonterminal and carries a mandatory `next` value of either one deterministic `correction` or `inspect`; the supervisor must take that next step unless a separately identified existing hard stop applies. It never maps to process exit, Work termination, shell termination, or worker termination.
- `hard-stop`: an existing irreducible stop, checkpoint conflict, corruption, collision, uncertain side effect, supervisor identity loss, stale worker, or failed storage guarantee prevents continuation.
- `ended`: an allowed terminal boundary and checkpoint cleanup both completed.

Every outcome includes the accepted-state hash, `acceptedRevision`, `hostRevision`, worker generation, and active ownership identity where a checkpoint still exists. After an eligible incident, recovery notice data appears only when correction or resumption first produces an `accepted` outcome and semantically contains `{ incidentClassification, statePreserved: true, resumedAction }`. It is presentation data, not a new event, report, audit, or ledger record.

### Ordinary Completion Bridge And One-Shot Notice

The bridge is available only for autonomous Lightweight ordinary accepted completion after finalized dual-retained trusted completion, exact fresh authority, no conflicting pending completion, governance, projection, evaluation, or lane-effect state, exactly one final accepted occurrence matching exactly one final completion tuple, and no repeat evidence. These predicates are revalidated as one set immediately before issuing one replay-sealed permit bound to the accepted state, exact owner and specification, task, lane, retained completion, occurrence, completion tuple, expected lane prestate, and one mutation. A null permit or generic fallback permit is forbidden.

The adapter supplies that permit and exact prestate to `applyLightweightWorkRequest`; ordinary orchestration never invokes a board CLI or edits the board directly. After the lane owner applies exactly one bound mutation, the adapter freshly revalidates authority and final poststate, then commits one receipt binding the permit, prestate, mutation, and poststate before settlement. Missing, stale, duplicated, repeated, replayed, drifted, or mismatched predicates, bindings, mutation, receipt, or poststate refuse without settlement, fabricated governance, caller close authority, or tracked-lane expansion.

An eligible incident creates pending typed notice data. Projection, permit, lane mutation, receipt, and other intermediate effects carry it forward without exposure or consumption. The next successful outcome after correction or resumption returns and atomically consumes the notice; prompt integration renders it once, and later outcomes omit it. No notice is written to a ledger, event, report, or audit record.

The adapter and prompt integration reproduce the motivating sequence as a contract test: legacy completion selection produces exact `action-mismatch`; a fake wrapper then requests exit; the adapter returns `closed-refusal.next`, and spies prove that no exit or termination function was invoked before the required correction or Inspection. Genuine implementation, test, and review failures never enter this outcome merely because continuation is available; they remain admitted task outcomes under existing budgets.

### 3. Immutable accepted-state handoff

At operation entry, load the checkpoint under the exclusive ownership claim, validate the active worker token and generation, validate RunState, canonicalize it, and require its bytes and hash to match the adapter's last accepted state. Before any external or tool call, serialize an in-flight operation identity into host metadata. A shell variable may mirror those bytes for transport but is never read as fallback authority.

The adapter invokes the selected low-level route, parses its closed result, validates any returned RunState, and compares canonical bytes. It keeps a successor provisional while an authoritative projection, lane mutation, or settlement receipt remains outstanding. Only after the effect owner and fresh evidence establish the exact effect does one serialized checkpoint update under active ownership replace the predecessor. A malformed successor, failed receipt, or unknown effect leaves the predecessor accepted; an indeterminate side effect is a hard stop rather than a rollback or reconstruction claim.

Closed low-level refusals such as `action-mismatch` must return the exact predecessor bytes. Equal semantic content with different canonical bytes does not meet the zero-charge rule.

### 4. Narrow checkpoint interface and exclusive ownership

Keep checkpoint storage behind this injected interface:

```text
claim(binding, initialCheckpoint)
load(binding)
update(binding, activeWorker, expectedRevisions, nextCheckpoint)
handoff(binding, priorWorker, replacementWorker, expectedRevisions, nextCheckpoint)
clear(binding, activeWorker, expectedHostRevision, reason)
```

Tests use an in-memory implementation and faulting implementations. The production default lives in the same adapter module and uses only Node built-ins.

`claim` creates one exclusive ownership record for the canonical workspace-target key. `update` accepts writes only from the currently recorded worker token and generation. Expected revisions reject stale or incorrect requests; they are validation guards, not synchronization. `handoff` is the only worker replacement path and succeeds only when the supervisor has already observed the exact prior-worker exit and supplies the matching prior identity plus one fresh token and next generation. There is no timeout, PID inference, lock stealing, automatic takeover, or concurrent writer path.

Each checkpoint contains only bounded host authority: format version; supervisor-supplied invocation identity; real workspace identity; canonical target; exact owner/spec and lane; canonical accepted RunState bytes and hash; authoritative task/lane prestate descriptors; active worker token and generation; `acceptedRevision`; `hostRevision`; optional in-flight semantic operation, expected effect/receipt identity, and provisional successor hash; fresh Inspection identity; correction identity and consumed state; and diagnostic creation and update times. It stores no project file payloads, model packet, credentials, review body, audit body, or reconstructed counter.

`acceptedRevision` advances only when different validated canonical RunState bytes become accepted. Same-byte accepted outcomes do not advance it. `hostRevision` advances on every serialized host-record mutation, including in-flight operation registration, incident classification, correction consumption, worker handoff, provisional-effect metadata, and cleanup preparation. A qualifying closed refusal preserves RunState bytes and hash, `acceptedRevision`, and attempt and recovery counters even when recording the incident advances `hostRevision`.

The correction identity binds canonical accepted bytes and hash, `acceptedRevision`, semantic operation, incident class, fresh Inspection identity, originating `hostRevision`, and worker generation. Its consumed state is carried forward across subsequent host revisions and worker handoff. Metadata churn therefore cannot mint another correction; only a new fresh Inspection and reclassification can establish a new eligible identity.

### 5. Portable default backend

The default root is a Dude-specific directory below `os.tmpdir()`, never the workspace. The per-target key is a SHA-256 digest of canonical real-workspace and target identities, so caller text cannot choose a path. The backend must:

- canonicalize a trusted temporary root, prove hashed-path containment, and reject symlinks and unexpected types for controlled path components;
- bound and strictly decode one canonical UTF-8 checkpoint record, recompute its integrity hash, and reject unknown fields or trailing data;
- create the per-workspace-target ownership claim with portable exclusive filesystem creation before any worker write;
- request restrictive root and file modes where the platform supports them and rely on inherited Windows ACLs rather than claiming POSIX ownership or mode verification there;
- serialize checkpoint updates beneath the active ownership claim, use a same-directory temporary file and rename where supported, sync the file where supported, and fail closed on any observed creation, write, sync, rename, validation, or cleanup-operation failure;
- treat directory synchronization as platform-dependent and never claim it is uniformly available or verifiable on Windows;
- remove temporary files after successful replacement or report cleanup failure without claiming success; and
- keep creation and update time diagnostic only; age never authorizes resume, cleanup, ownership transfer, or replacement work.

The portable minimum is canonical trusted-root derivation, hashed path derivation, containment, controlled-component symlink and unexpected-type rejection, bounded canonical bytes, exclusive ownership creation, restrictive mode requests where supported, file synchronization and same-directory temporary rename where supported, and visible fail-closed behavior on observed operation failure. Platform differences in crash durability, inherited ACLs, POSIX ownership and mode checks, and directory synchronization are residual implementation risks, not promises of identical guarantees.

Invocation identity correlates and binds cooperative supervisor-worker authority. It is not a security boundary against a hostile process running as the same user. The exclusive claim is a local single-writer ownership record, not a distributed lock, lease, or hostile-process defense.

### 6. Surviving-supervisor resume and worker handoff

The supervisor retains invocation identity and current worker identity outside the checkpoint. If the persistent shell or replaceable adapter worker exits while the active coordinator supervisor and its independently retained invocation identity survive, the supervisor records the exact observed exit before calling `handoff` with the old token and generation and a fresh token and next generation. Handoff updates host metadata while preserving accepted bytes, hash, `acceptedRevision`, counters, and correction consumption. Only then may one replacement call `resume`.

The replacement receives the original invocation identity explicitly from the supervisor. It derives the same workspace-target key, loads the checkpoint, validates canonical bytes and integrity, verifies its fresh worker token and generation, then performs fresh Inspection through the adapter. Resume compares all of these before any route runs:

1. independently supplied invocation identity, active worker token and generation, `acceptedRevision`, and `hostRevision`;
2. real workspace and canonical target;
3. exact defined owner and specification identity;
4. active lane and exact authoritative task or issue prestate descriptors;
5. canonical RunState bytes and hash; and
6. any in-flight effect identity and authoritative receipt or unchanged-prestate proof.

An exact unchanged prestate resumes from the predecessor. An already established effect resumes only when its exact receipt and poststate are freshly verified, allowing the provisional successor to be accepted. Drift, corruption, conflicting revision, stale worker, unknown effect, or missing identity returns `hard-stop`; the adapter never infers RunState from lane state or history.

Loss of the active coordinator turn, its supervisor context, or its independently retained invocation identity is outside v1 and always hard-stops. Checkpoint bytes cannot bootstrap a new supervisor. This deliberately matches the user-approved deferral of context compaction without preserved identity and conversation or session restart.

### 7. Incident classification and one-correction cap

The zero-charge class is closed:

| Incident | Required proof | Required observable outcome |
|---|---|---|
| Wrong adapter/action or runtime `action-mismatch` | Exact predecessor returned; no authoritative effect | Preserve state and accepted revision; return nonterminal correction or Inspection data; never terminate |
| Malformed request rejected before mutation | Rejection occurs before any effect owner runs | Preserve state; one correction eligible; never terminate |
| Evidence drift or stale permit | Exact predecessor and fresh reacquisition required | Preserve state; require corrected fresh inputs or Inspection |
| Malformed, empty, or nonzero host/tool result | No successor accepted and fresh prestate proves no authoritative effect | Preserve state; one correction eligible; never terminate |
| Genuine implementation, test, or review failure | Authorized attempt and trusted evidence | Admit through existing recovery/learning budgets; no silent retry |
| Unknown or unverifiable side effect | No exact receipt or unchanged-prestate proof | Existing irreducible hard stop |

On `closed-refusal`, the runner executes the exact `next.correction` at most once when present. If correction is absent, consumed, fails, or returns another qualifying refusal, it performs fresh Inspection and selects only the next challenge justified by the newly bound state. It never returns a nonterminal refusal, retries blindly, or asks for unbound input. A distinct existing hard stop still wins and is reported separately.

Host incidents remain transient adapter diagnostics plus the one inline recovery notice. They do not enter trusted verification, review, approach, finding, or learning records. Existing final audit continues to describe genuine task and governance outcomes.

### 8. Checkpoint lifecycle, stale orphan refusal, and cleanup

Initial `begin` uses portable exclusive creation for the workspace-target ownership claim. Any existing claim fails closed at claim or load. A same-identity caller still must present the supervisor-retained active worker token and generation; checkpoint contents alone grant nothing.

Keep the checkpoint and claim across closed refusals, eligible host/tool incidents, review rejection, required projections, and replaceable-worker death. Clear both only after:

- successful task settlement and exact lane receipt;
- ordinary natural or controlled Work end;
- explicit cancellation; or
- an irreducible hard stop whose required result or audit is safely recorded.

Parent EOF or exchange-context loss before an allowed terminal outcome is supervisor loss, not cancellation. The runner fails closed, performs no opportunistic clear, and leaves the ownership-claim/checkpoint pair for the existing stale-orphan manual-cleanup protocol. An explicit `cancel` response remains an allowed cleanup boundary from every outstanding challenge.

A failed clear never returns `ended`; it reports a cleanup hard stop, leaves the ownership collision visible, and blocks replacement work. Starting another task after successful settlement creates a fresh ownership claim rather than carrying prior authority forward.

An orphan claim or checkpoint refuses lazily when a later `claim` or `load` encounters it. Creation and update age may appear in diagnostics, but age never authorizes cleanup, takeover, resume, or worker handoff.

#### Manual stale-orphan cleanup protocol

1. The refusal derives the workspace-target key itself and reports that safe canonical identifier plus the two controlled artifacts, the ownership claim and checkpoint. It states that manual cleanup is next and never accepts caller-chosen cleanup paths.
2. Before removal, the user or operator independently confirms that no invocation or coordinator supervisor remains for that workspace-target key.
3. Manual removal targets only that bounded ownership-claim/checkpoint pair.
4. Before a fresh exclusive claim, the adapter performs a post-clean `load`/`claim` preflight that proves both artifacts absent and finds no partial or reappeared artifact.
5. Partial cleanup, a changed artifact, operation failure, failed absence validation, or reappearance is a hard stop and continues to block replacement work.
6. The protocol adds no cleanup command, TTL, timer, background sweep, automatic takeover, or other automatic removal path.

### 9. Prompt, static contract, documentation, and projection

Update `src/skills/dude-work/SKILL.md` as the sole detailed prompt owner so ordinary Work uses the host adapter and never manually selects low-level completion or transition routes. It must identify the active coordinator turn as supervisor, create identity before worker launch, enforce required nonterminal correction-or-Inspection handling, and prohibit termination on a qualifying unchanged-state refusal. Update `src/agents/dude.agent.md` with one terse coordinator pointer to the adapter. Preserve low-level APIs and their direct tests as internal compatibility surfaces.

Extend `scripts/current-format-contract.test.mjs` to pin:

- the adapter as the sole ordinary Work runtime boundary;
- the coordinator turn as supervisor and checkpoint identity as non-self-authenticating;
- exclusive ownership, one active worker generation, and exact-exit handoff;
- separate accepted-state and host revisions, with revisions used only for stale-write detection;
- no prompt-level manual selection of legacy, trusted, learning, or transition routes;
- shell environment as mirror only;
- mandatory nonterminal correction-or-Inspection behavior and no exit on qualifying unchanged state;
- the accepted recovery boundary of persistent-shell and replaceable adapter-worker death only under a surviving coordinator supervisor and independently retained invocation identity;
- no time- or age-authorized takeover or cleanup, plus the safe stale-orphan diagnostic, confirmation-gated bounded-pair manual cleanup, and post-clean absence validation;
- generated inventory and source parity for the new module; and
- hard-stop, review, verification, owner, lane, and governance pointers unchanged outside FR-028 through FR-030.

Add concise continuity details, the accepted supervisor/worker recovery boundary, and the manual stale-orphan cleanup protocol to `docs/workflow.md` and `docs/reference.md`. No command grammar changes, so `docs/commands.md` and the README do not need feature prose.

Run `node scripts/build-dev.mjs` after every `src/` edit. The generated files include `.github/skills/dude-work/host-adapter.mjs` and the new `.github/skills/dude-work/host-adapter-runner.mjs`; prompt projection updates `.github/skills/dude-work/SKILL.md` and `.github/agents/dude.agent.md`. `scripts/build-dev.mjs` itself needs no change because it already discovers and projects non-test core source files. Generated files are never edited directly.

## Failure-Injection Coverage

T004 added exactly three focused table-driven adapter groups to the existing `src/skills/dude-work/host-adapter.test.mjs`:

- **Table A - Sequential challenge protocol**: runner-selected challenge ordering, exactly one outstanding challenge and one bound response, foreign or replayed responses, parent EOF or exchange-context loss, and explicit cancellation from every challenge.
- **Table B - Rejection and learning review**: typed `learning-review` challenges and responses, real rejected `specialist-pair` capture and finalization, projection and receipt settlement before fresh Inspection and learning review, and accepted governance before any later assessment or specialist pair.
- **Table C - Projection receipt and resume**: authoritative projection preparation, exact projection receipt and settlement, provisional-successor retention, same-supervisor worker resume, and stale, mismatched, duplicated, replayed, or drifted receipt and poststate refusal.

For T007@6d726b72, preserve the already-delivered test-only coverage in the same module: one hostile Assessment Proxy trap case throws an ordinary outer Error whose message retains `assessment-proxy-trap-outer-message-attacker-marker`; a separate case throws an Error with a throwing `message` accessor whose thrown Error carries `assessment-proxy-trap-accessor-message-attacker-marker`. Check each marker across the complete result, keep message-accessor invocation at zero, and retain the separate inert-snapshot regression that fails when exact-snapshot revalidation is removed. Freshly reverify and independently review the producer-side validation, production runner, Work guidance, generated projection, stale-versus-invalid classification, fixed safe detail, state preservation, and no-retry behavior. No production or generated change is planned.

For T009@6c696e74, preserve the complete T008 coverage: the deterministic five-finding regression leaves projection events in their existing order, maps each projected `findingIdentity`, sorts only that mapped list with the existing UTF-8 comparator, changes no other binding, and reaches `effect-required` / `occurrence-retention-required` rather than `effect-contract-mismatch`; retain the single-finding success and every tamper refusal. Add an action-matrix regression proving that one host-adapter-built Tester capture is reused exactly in both verification and lint for `address-test` and `retain-learning` only; `execute-task`, `retry-task`, and `address-review` carry no lint, while `reconcile-derived-definition` refuses before capture. Prove separately that the runner only retains the adapter-observed lint row and returns it unchanged through `runtimeInput`, with no copied capture construction, state derivation, category selection, or action semantics.

Preserve the existing focused coverage below as regression coverage:

- exact `action-mismatch` followed by attempted host exit, proving no exit, Work termination, shell termination, or worker termination is invoked and the required correction or fresh Inspection follows;
- wrong action and route mismatch returning exact predecessor plus typed nonterminal next-action data;
- malformed request before runtime mutation;
- malformed and empty adapter output;
- nonzero runtime, child, or tool result with proven unchanged prestate;
- nonzero or interrupted result with unverifiable side effects;
- trusted review rejection selecting capture/projection/finalize and reaching existing governance;
- every FR-028 bridge predicate independently missing, duplicated, stale, drifted, repeated, or mismatched, plus the complete positive predicate set;
- exact permit binding to state, owner, specification, task, lane, retained completion, final occurrence, completion tuple, lane prestate, and mutation;
- lane-owner prestate and mutation drift, receipt absence, duplication, staleness, mismatch, and final-poststate disagreement;
- permit and receipt replay, repeat evidence, wrong final occurrence, and wrong completion tuple;
- rejection of ordinary board CLI mutation, direct edit, null or generic fallback permit, caller close authority, fabricated governance, and tracked-lane expansion;
- complete adapter routing for projection preparation, lane-permit issuance, `applyLightweightWorkRequest` lane-owner application, lane-receipt settlement, and read-only audit, with every caller-supplied low-level route name or transition mode rejected;
- supervisor-created random identity supplied before initial worker launch;
- checkpoint identity rejected as proof of caller identity;
- persistent-shell and adapter-worker exit while the supervisor survives;
- exact prior-worker exit followed by handoff with matching prior token and generation and one fresh replacement token and generation;
- missing or inexact prior-worker exit, stale worker return, duplicate worker, concurrent update, incorrect generation, and attempted automatic takeover;
- loss of supervisor context or independently retained invocation identity as a hard stop;
- checkpoint exclusive claim, initial write, read, temporary write, file synchronization, rename, serialized update, handoff, and clear failures;
- symlink, path escape, wrong type, permission, ownership where verifiable, truncation, unknown-field, and hash failures;
- Windows inherited-ACL behavior and explicit nonclaims for POSIX ownership, mode, and directory synchronization;
- supported-platform operations that either meet the portable minimum or visibly fail closed when an operation reports failure;
- replacement adapter-worker process start with the same surviving supervisor-supplied invocation identity and a valid checkpoint;
- replaceable-worker death after a provisional successor and before or after an authoritative receipt;
- stale owner, specification, lane, target, task/issue prestate, state hash, `acceptedRevision`, `hostRevision`, worker token, and generation;
- corrupt checkpoint and conflicting successor revisions;
- same workspace-target collision, including duplicate same-invocation processes;
- `acceptedRevision` advancing only for different validated accepted bytes and `hostRevision` advancing for host metadata, incident, correction, handoff, and cleanup changes;
- closed refusals preserving bytes and hash, `acceptedRevision`, and attempt and recovery counters while allowing `hostRevision` to advance;
- correction identity bound to accepted bytes and hash and revision, operation, incident class, fresh Inspection identity, originating host revision, and worker generation across later metadata updates;
- one-correction success, failure, repeated-class refusal, mandatory fresh Inspection, and metadata changes that cannot reset the cap;
- cleanup timing for settlement, natural end, controlled end, cancellation, safely recorded hard stop, and clear failure;
- stale-orphan refusal at claim or load with a safe bounded-pair diagnostic, age-only diagnostics, independent no-invocation confirmation, bounded-pair manual removal, post-clean proof that both artifacts are absent, partial cleanup, changed artifact, reappearance, failed validation, and no automatic expiry, cleanup, or takeover;
- notice omission before success, pending notice through every intermediate effect, exact typed data in the earliest successful outcome after correction or resumption, atomic consumption, exactly-once prompt rendering, and omission from later outcomes and all ledgers, events, reports, and audits;
- direct compatibility tests for `deriveGovernanceRuntimeRequestV1` and `validateRecoveryRuntimeResultV1`, with no exported ordinary-completion authority helper;
- no attempt/recovery charge and no approach, verification, review, finding, or learning pollution for host incidents; and
- every existing safety, budget, verification, review, owner, lane, permit, close, and governance boundary outside FR-028 through FR-030.

Use child-process fixtures only for the process-loss boundary. All storage and runtime ports remain injectable so ordinary unit cases are deterministic and do not depend on editor APIs or the real user temp directory.

## Source Layout

### New minimal coordinator runner

```text
src/skills/dude-work/host-adapter-runner.mjs
```

### Existing authoritative adapter and test module

```text
src/skills/dude-work/host-adapter.mjs
src/skills/dude-work/host-adapter.test.mjs
```

### Existing runtime compatibility surfaces

```text
src/skills/dude-work/recovery.mjs
src/skills/dude-work/recovery.test.mjs
```

All recovery semantics remain unchanged except the ordinary accepted-completion bridge defined by FR-028 through FR-030. The only added exports are the pure `deriveGovernanceRuntimeRequestV1` and `validateRecoveryRuntimeResultV1`; each is directly covered in `recovery.test.mjs`, and no ordinary-completion authority helper is exported.

### Prompt, static contract, and concise docs

```text
src/skills/dude-work/SKILL.md
src/agents/dude.agent.md
scripts/current-format-contract.test.mjs
docs/workflow.md
docs/reference.md
```

### Generated through build-dev only

```text
.github/skills/dude-work/host-adapter.mjs
.github/skills/dude-work/host-adapter-runner.mjs
.github/skills/dude-work/SKILL.md
.github/agents/dude.agent.md
```

`scripts/build-dev.mjs` and `scripts/build-dev.test.mjs` are verification surfaces, not expected implementation edits. No feature definition package, project state, migration, manifest, pack, or lane owner is an implementation write target.

T007@6d726b72 remains test-only: preserve the two separate hostile Assessment Proxy trap-error cases carrying `assessment-proxy-trap-outer-message-attacker-marker` and `assessment-proxy-trap-accessor-message-attacker-marker`, their result-wide leakage checks and zero accessor invocation, and the separate inert-snapshot revalidation regression. The producer-boundary instrumentation, production runner, concise producer-boundary rule, generated projection, and `src/skills/dude-work/recovery.mjs` validator ownership are reverification and review surfaces, not planned edits. No production or generated-file modification is planned.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` are needed. The adapter contract is small enough to define in this plan, the checkpoint has no project-domain data model, and focused automated failure injection replaces separate API, schema, quickstart, test-checklist, or security-checklist files.

## Phases

- **Phase 1 - Adapter core, bridge, and route composition (T001@62726964)**: implement explicit nonterminal outcomes, deterministic complete adapter composition, immutable accepted-state handoff, dual-revision and correction semantics, trusted rejection routing, the replay-sealed FR-028 through FR-030 bridge, typed one-shot notice behavior, direct coverage of both pure recovery helpers, and focused no-budget/no-evidence-pollution tests.
- **Phase 2 - Supervisor identity, exclusive checkpoint, and worker continuity (T002@63686b70)**: implement supervisor-supplied invocation identity, the injected checkpoint interface, exclusive ownership, serialized worker generations and exact-exit handoff, portable bounded temp backend, fresh resume validation, lifecycle cleanup, safe stale-orphan diagnostics, confirmed bounded-pair manual cleanup, post-clean absence validation, and storage/security fault tests.
- **Phase 3 - Ordinary Work integration and parity (T003@696e7467)**: make the adapter the sole ordinary prompt boundary for the complete semantic operation set, pin the accepted supervisor/worker boundary, bridge prohibitions, exactly-once notice rendering, nonterminal handling, and manual stale-orphan cleanup protocol in static contracts and concise docs, rebuild generated core, and preserve internal low-level compatibility.
- **Phase 4 - Bounded foreground runner, full acceptance, and independent evidence (T004@72756e72)**: Ship the minimal foreground `runHostAdapter` module/CLI and generated projection, reusing the existing adapter, runtime, lane owner, checkpoint store, and Feature 019 producer without copied semantics or new state. Continue under one live supervisor through a bounded sequence of runner-selected `assessment`, `specialist-pair`, and `learning-review` challenges, exactly one outstanding and one bound response at a time, with no exposed route/mode, model call, service/REPL, or checkpoint expansion; emit accepted RunState base64/hash and fail closed on supervisor loss. Add exactly three table groups: A for sequential ordering, foreign/replay responses, EOF, and cancel; B for typed learning review and rejection ordering; C for projection receipt and resume. Reprove the positive bridge, complete routing, one-shot notice timing, focused/full/build/lint/compose/pristine-release/parity/whitespace gates, and no regression outside FR-028 through FR-030; obtain actual independent Tester and Code Reviewer results; then self-close through this runner and Feature 019 with a new valid `occurrenceIdentity`, preserving all prior history without a throwaway driver, backfill, forged permit, deletion, re-mint, or supersession (US1 through US6; FR-001 through FR-030; SC-001 through SC-016).
- **Phase 5 - Producing-host prevalidation coverage and fresh review (T007@6d726b72)**: preserve the already-delivered test-only acceptance coverage: two separate hostile Assessment Proxy trap-error cases, one retaining `assessment-proxy-trap-outer-message-attacker-marker` in an ordinary outer Error message and one carrying `assessment-proxy-trap-accessor-message-attacker-marker` through a throwing `message` accessor, with result-wide leakage checks and zero accessor invocation; also preserve the separate inert-snapshot regression that fails when exact-snapshot revalidation is removed. Freshly reverify and independently review producer-side validation, the production runner, Work guidance, generated projection, stale-versus-invalid classification, fixed `Assessment: invalid-contract` detail, state preservation, and no-retry behavior. Plan no production or generated modification.
- **Phase 6 - Multi-Finding Trusted Capture Settlement (T008@6d756c74)**: in `src/skills/dude-work/host-adapter.mjs`, sort mapped projected finding identities with the existing UTF-8 comparator before exact comparison to trusted finding identities, without reordering projection events or altering another binding; add a focused deterministic multi-finding regression in `src/skills/dude-work/host-adapter.test.mjs` whose `occurrenceIdentity` order differs from `findingIdentity` order; prove `effect-required` / `occurrence-retention-required`, not `effect-contract-mismatch`; preserve single-finding and tamper refusal; rebuild generated core and complete the full gates and independent Tester and Reviewer review.
- **Phase 7 - Same-Capture Lint Transport And Complete T008 Equivalence (T009@6c696e74)**: modify `src/skills/dude-work/host-adapter.mjs` so `specialistAttestation` constructs and derives the actual Tester capture once and reuses its exact stream row in verification and lint for `address-test` and `retain-learning` only; keep `execute-task`, `retry-task`, and `address-review` lint-free and keep reconciliation refused before capture. Modify `src/skills/dude-work/host-adapter-runner.mjs` only to retain adapter-observed lint rows and carry them unchanged through `runtimeInput`. Preserve T008’s mapped-`findingIdentity` UTF-8 sort, projection-event order, every other binding, `effect-required` / `occurrence-retention-required` result rather than `effect-contract-mismatch`, single-finding behavior, tamper refusals, and deterministic five-finding regression; rebuild generated core and complete the existing full gates and independent Tester and Code Reviewer evidence without a new schema, field, identity, store, dispatch, or copied semantics.
- **Phase 8 - Fixed Recovery Packet Headroom (T010@7061636b)**: raise only `MAX_PACKET_BYTES` from 65,536 to 131,072 in the authoritative recovery source and generated projection; add focused boundary tests proving the real T009 base-plus-compact-capture packet and both exact byte boundaries; preserve owner-log whole-event suffix trimming, complete non-owner evidence, descriptor-only overflow, every other limit, and all completion, recovery, and state-charge semantics; complete the full repository gates and independent review.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@62726964 | US1, US2, US5, US6 | FR-001, FR-002, FR-007 through FR-013, FR-016, FR-019, FR-025 through FR-030 | Complete adapter route matrix, nonterminal action-mismatch fixture, immutable handoff and dual-revision tests, replay-sealed bridge matrix, typed one-shot notice, direct helper compatibility, correction fault injection, trusted rejection fixture |
| T002@63686b70 | US3, US4, US6 | FR-003 through FR-006, FR-014 through FR-024, FR-027 | In-memory and temp backend tests, exclusive claim, child-process handoff, dual revisions, portable behavior, drift/corruption/collision/cleanup, safe stale-pair diagnostics, and post-clean absence fixtures |
| T003@696e7467 | US1, US2, US5, US6 | FR-001 through FR-013, FR-025 through FR-030 | Prompt contracts, complete semantic adapter routing, exactly-once notice rendering, supervisor/worker and manual-cleanup docs assertions, generated source parity, low-level compatibility checks |
| T004@72756e72 | US1 through US6 | FR-001 through FR-030 | Bounded foreground `runHostAdapter` module/CLI and generated projection; one live supervisor; runner-selected `assessment`, `specialist-pair`, and `learning-review` challenges with one outstanding bound response; Tables A through C for sequential protocol, rejection and learning-review ordering, and projection receipt and resume; accepted RunState base64/hash; positive bridge, complete routing, notice timing, focused/full/build/lint/compose/pristine-release/parity/whitespace gates, actual independent Tester and Code Reviewer results, and producer-backed self-close naming a new valid `occurrenceIdentity` without changing prior history |
| T007@6d726b72 | US1 | FR-031 through FR-033 | Two separate hostile Assessment Proxy trap-error cases carrying `assessment-proxy-trap-outer-message-attacker-marker` and `assessment-proxy-trap-accessor-message-attacker-marker`, each checked across the complete result with zero accessor invocation; a separate inert-snapshot revalidation regression that fails if exact-snapshot revalidation is removed; producer-side and independent runner validation; fixed `challenge-response-invalid` and `Assessment: invalid-contract`; fresh verification and independent review with no production or generated modification |
| T008@6d756c74 | US1, US2 | FR-001, FR-002, FR-007, FR-012, FR-013, FR-026; SC-002, SC-008, SC-014 | Deterministic multi-finding rejection with differing `occurrenceIdentity` and `findingIdentity` order; `effect-required` / `occurrence-retention-required` rather than `effect-contract-mismatch`; preserved single-finding and tamper refusal; generated-core parity, full gates, and independent Tester and Reviewer evidence |
| T009@6c696e74 | US1, US2 | FR-001, FR-002, FR-007, FR-012, FR-013, FR-026; SC-002, SC-008, SC-014 | Host-adapter-owned same-capture verification/lint action matrix; runner-only lint-row retention and `runtimeInput` transport; mapped-`findingIdentity` UTF-8 sorting without projection-event reordering or another binding change; `effect-required` / `occurrence-retention-required` rather than `effect-contract-mismatch`; preserved single-finding and tamper refusals; deterministic five-finding regression; generated-core parity, full gates, and independent Tester and Code Reviewer evidence |
| T010@7061636b | US1, US2 | FR-001, FR-002, FR-007, FR-010, FR-012, FR-026; SC-001, SC-002, SC-008, SC-014 | Actual T009 60,475-byte fresh base Inspection plus compact mandatory verification/review captures admitted below 131,072 bytes; exact 131,072-byte canonical packet admitted; 131,073-byte non-owner packet descriptor-only with `modelPacket: null` and zero completion, recovery, or state charge; maximal whole-event owner-log suffix; unchanged item, source-body, and Inspection aggregate bounds |

## Validation Strategy

Focused checks during implementation:

```bash
node --test src/skills/dude-work/host-adapter.test.mjs
node --test src/skills/dude-work/recovery.test.mjs
node scripts/build-dev.mjs
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs
```

Full acceptance:

```bash
node scripts/build-dev.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
RELEASE_ROOT="$(mktemp -d)"
node scripts/build-release.mjs --out "$RELEASE_ROOT/bundle" --tag v0.0.0
node "$RELEASE_ROOT/bundle/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/bundle"
git diff --check
```

Every task that edits `src/` runs `node scripts/build-dev.mjs` before parity-sensitive checks. The coordinator supplies one unchanged fresh evidence set to the independent Tester and Code Reviewer. Definition-time work does not run or claim these commands.

For T007@6d726b72, preserve the already-delivered two separate hostile-marker cases and inert-snapshot revalidation regression in `src/skills/dude-work/host-adapter.test.mjs`. Final evidence freshly verifies and independently reviews producer-side validation, the production runner, Work guidance, generated projection, stale-versus-invalid classification, fixed diagnostics, state preservation, and no-retry behavior through the focused and full discovered suites, workspace lint, pristine release build and release lint, source/generated parity, and `git diff --check`; compose verification remains required only because it is part of this repository's established release gate. No production or generated-file change is planned.

For T008@6d756c74, add the focused deterministic multi-finding regression while preserving single-finding behavior and tamper refusal. Fresh evidence must cover the focused and full discovered suites, build-dev source/generated parity, workspace lint, compose verification, pristine release build and release lint, and `git diff --check`, followed by independent Tester and Code Reviewer evidence.

For T009@6c696e74, fresh evidence must prove the complete six-action matrix, exact same-capture verification/lint reuse in `host-adapter.mjs`, and unchanged lint-row carriage through `host-adapter-runner.mjs`; preserve mapped-`findingIdentity` UTF-8 sorting, projection-event order, every other binding, `effect-required` / `occurrence-retention-required` rather than `effect-contract-mismatch`, single-finding behavior, every tamper refusal, and the deterministic five-finding regression. Run the focused host-adapter and recovery suites, build-dev and current-format contracts, the full discovered suite, exact source/generated parity, workspace lint, compose verification, pristine release build and release lint, and `git diff --check`, then route one unchanged fresh evidence set to the independent Tester and Code Reviewer.

For T010@7061636b, focused recovery tests must prove that the actual T009 fresh base Inspection source bodies totaling 60,475 bytes plus the compact mandatory verification and review captures produce an admitted canonical packet within 131,072 bytes; an exact 131,072-byte canonical packet is admitted; and a 131,073-byte packet whose non-owner evidence cannot be truncated returns only descriptor metadata with `modelPacket: null`, no completion capture, and unchanged recovery counters and accepted state. Prove that owner-log projection retains the maximal suffix of complete whole events and that `MAX_PACKET_ITEMS=16`, `MAX_SOURCE_BODY_BYTES=1_048_576`, and `MAX_INSPECTION_BODY_BYTES=4_194_304` remain unchanged. Add no host or runner production change; add a host/runner assertion only if needed to pin the already-existing descriptor-only surfacing. Then run the focused recovery suite, build-dev and current-format contracts, full discovered suite, exact source/generated parity, workspace lint, compose verification, pristine release build and lint, `git diff --check`, and independent Tester and Code Reviewer review.

## Complexity Rejected

- No project-local checkpoint or portable RunState.
- No recovery, learning, budget, review, or transition semantic change beyond the single FR-028 through FR-030 ordinary accepted-completion bridge and its two pure directly tested helper exports.
- No identity service, PID monitor, timeout handoff, lock stealing, automatic ownership takeover, cleanup command, database, editor storage dependency, daemon, scheduler, distributed lock, or multi-session merge.
- No workflow engine, generic transaction framework, event-sourcing layer, or second audit ledger.
- No generic retry utility, exponential retry, hidden retry, or cross-target concurrency.
- No same-challenge correction, Assessment retry budget, path normalization, validator weakening, new challenge route, or duplicate Assessment validator.
- No field-location diagnostic parser or mapping for a single malformed-input case.
- No time-based ownership lease or age-authorized cleanup.
- No schema file, checklist, or supporting artifact.
- No Ship-specific branch, migration, compatibility state, or new user command.
- No lint result field, identity, schema, store, second specialist dispatch, or caller semantic, and no claim of independent lint provenance.
- No dynamic or unbounded packet sizing, repeated limit increases, evidence truncation, batching, compression, new compaction system, or new state; exact over-bound packets remain descriptor-only.

## Risks

- **Provisional side effect outlives the host**: retain predecessor plus expected effect identity and accept a successor only after a fresh exact receipt; unknown effects hard-stop.
- **Supervisor loss cannot recover**: this is deliberate; parent EOF or exchange-context loss fails closed as supervisor loss with no opportunistic cleanup, and only persistent-shell and adapter-worker death are recoverable while the coordinator turn and independently retained identity survive.
- **Temp storage is less portable than project state**: this is deliberate; supervisor identity, exclusive ownership, and fresh authority bind same-invocation resume, while editor, machine, and cross-session restart remain out of scope.
- **Filesystem behavior varies by platform**: enforce the portable Node built-in minimum, use inherited ACLs on Windows, make stronger platform checks only where supported, and fail closed on observed operation failure without claiming identical POSIX guarantees.
- **A stale orphan blocks future work**: report the safe bounded-pair identity and require confirmed manual cleanup of only that pair; age never enables automatic takeover or removal, and partial cleanup, changed or reappeared artifacts, or failed post-clean absence validation hard-stop.
- **A worker dies during handoff**: preserve the old active generation until exact exit and a serialized handoff succeed; any ambiguity hard-stops rather than authorizing two writers.
- **Revision checks are mistaken for synchronization**: exclusive ownership plus one active worker generation provide serialization; tests and docs describe revisions only as stale or incorrect write detection.
- **The adapter becomes a second runtime**: prohibit copied semantics; it may only validate host envelopes, select and invoke existing routes, manage accepted-state handoff and checkpoint lifecycle, and compose the narrowly bound FR-028 through FR-030 bridge.
- **Prompt callers bypass the adapter**: static contracts pin it as the sole ordinary entry point while preserving direct low-level tests only as internal compatibility coverage.
- **Host incidents pollute learning evidence**: typed classification and tests require zero approach, verification, review, finding, or learning admission until a genuine authorized result exists.
- **Invalid Assessment diagnostics disclose rejected input**: emit only the fixed runner-owned `Assessment: invalid-contract` detail without parsing validator messages, inspecting exceptions, extracting field locations, or mapping diagnostics, and test that target text, evidence, hashes, arbitrary messages and values, credentials, and rejected paths are absent.
- **One cooperative Tester capture appears in two source categories**: `address-test` and `retain-learning` intentionally label the same capture and state as `verification` and `lint`, not independent lint provenance; account for both category references within existing evidence-size bounds and fail closed rather than truncate or falsely pass.
- **The fixed packet headroom can eventually be exhausted**: 131,072 bytes intentionally covers the measured T009 packet without fitting an exact minimum or creating growth machinery. Above-bound packets still fail descriptor-only; after T009 closes, any future runtime defect is scoped to a new small feature rather than another Feature 018 limit increase.

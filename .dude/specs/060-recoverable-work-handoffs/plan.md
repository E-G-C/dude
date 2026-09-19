# Implementation Plan: Recoverable Work Handoffs

Spec: `.dude/specs/060-recoverable-work-handoffs/spec.md`
Owner: `.dude/ideas/060-recoverable-work-handoffs.md`

## Technical Context

- Language/version: dependency-free JavaScript ESM, Node.js 20 or newer.
- Primary dependencies: existing Work recovery, host adapter, attestation,
  exact-owner resolver, task parser, and Lightweight permit/receipt interfaces.
- Storage: existing workspace authorities and transient host memory/checkpoint
  only. Historical inputs must already exist at the supplying host; no new store.
- Testing: `node:test`, current in-process adapter fixtures, real runtime and
  lane-owner integration, and the foreground runner CLI harness.
- Target platform: the existing Node-based local Work host and generated
  dogfood bundle; no platform-specific process inspection.
- Project type: reusable bundle runtime plus its coordinator guidance.
- Performance goals: deterministic bounded checks before effects; unchanged
  16-check, 64-source, 64-descriptor, and 131072-byte packet ceilings. Keep all
  existing transport/body limits too.
- Constraints: preserve exact bindings, complete history, receiver validation,
  independent review, settlement, and close. No extra operation, runtime, lane,
  state version, evidence database, retry engine, or cleanup authority.

## Chosen Structure And Evidence

Extend the existing caller/receiver boundary, using validation before effects
and fresh validation at use. No separate handoff subsystem or supporting
artifact is needed.

| Existing surface | Relevant behavior and planned use |
| --- | --- |
| `src/skills/dude-work/host-adapter-runner.mjs` | `runHostAdapter` has closed initial fields, empty `currentRun`/`observedStreams`, a strict `~` prestate, and a pre-claim inspection. Add historical-input transport and retention preflight here; keep the prestate. |
| `src/skills/dude-work/host-adapter.mjs` | Ten semantic operations already cover permit-bound lane effects and completion; correction is existing internal behavior. Reuse `validateHostAdapterRequest`, `specialistAttestation`, `closedIncident`, no-effect authority, and permit/receipt handling. |
| `src/skills/dude-work/specialist-attestation.mjs` | `buildSpecialistAttestation` owns the actual sole Tester/Reviewer contracts and the 16-row limit. Reuse it rather than copying its schema into the runner. |
| `src/skills/dude-work/recovery.mjs` | `runCommand` decodes existing capture transport; `dualRetainedOccurrenceEventsV2` and `validateRetainedOccurrenceAuthorityV2` enforce historical bindings. `authorizeInspectedAttempt` already refuses with `occurrence-retention`; share that check without changing its authorization precedence. |
| Existing tests | `host-adapter.test.mjs` covers runtime-port capture inputs, no-effect correction, lane receipts, sequential challenges, and real CLI output. `recovery.test.mjs` and `specialist-attestation.test.mjs` cover authoritative captures and capacity. Extend these files, not a new harness. |

The source and generated runner both currently omit a historical-input field.
The source and generated adapter both drop `authorization.blocker` while
carrying capacity. The current runtime already permits an ungoverned
`initial-claim` through `issueLanePermitV2`/`requiredLanePermitPhaseV2`; the
pending-task incident is a caller-order defect.

## 1. Admission And Historical Input

### Source And Entry Contract

Add one optional `retainedEvidence` field to the existing version-1
`HostAdapterRunnerRequest`, shared by `runHostAdapter` and its foreground JSON
entry. It is a closed object with exactly four arrays: `currentRun`,
`verification`, `review`, and `lint`. Their entries are the existing recovery
input capture entries, including the existing target/state/outcome bindings
and canonical `{base64}` transport bytes; do not create a new capture format.
Omission means no supplied history, not permission to infer it. Reject unknown
fields and malformed transport using the existing input validators and limits.

The supported supplier is the current coordinator/host integration with actual
retained raw capture inputs from the existing runtime boundary. In particular,
the runner already passes exact inputs to `dependencies.runtime.invoke`:
completion capture supplies the adapter-built verification/review streams, and
subsequent projection/settlement inputs contain the published current-run
records and accumulated streams. An observing host can retain those original
inputs through that existing port. Its fresh request supplies the complete
matching captures unchanged. The current `host-adapter.test.mjs` trusted
completion helpers already observe the real `complete` capture request this way.

This is an entry integration, not an installed historical loader. The default
CLI currently exports no complete historical capture archive. A CLI caller may
supply captures only if its host already retained the raw inputs; stdout
summaries, model packets, normalized Inspection text, lane history alone,
checkpoints, or guessed session files are not substitutes. Do not add a scan,
export command, persistence callback, or automatic archive. If a host never
retained the required captures, report the missing-source refusal. Nothing in
this definition establishes that the historical 062 incident has a complete
usable source.

### Validation And Lifetime

1. Resolve the exact owner, canonical target, lane, task mapping, and safe
   workspace inputs first. Preserve current refusal precedence for unsafe or
   ambiguous authority.
2. Keep supplied capture arrays immutable and separate from newly generated
   records. Build each runtime input from the supplied captures plus the
   current invocation's observations. Preserve original bytes, ordering, and
   multiplicity; do not decode and rebuild old event bodies as new proof or
   deduplicate supplied sources to gain capacity. New current-run records still
   use `currentRunCapture`; historical records are not inserted into its mutable
   list or assigned new ordinals.
3. For the runner's existing pre-claim inspection, use the recovery transport
   decoder through `runCommand('inspect', {trigger:'explicit-inspection',
   input})` internally, so the exact supplied bytes reach the same receiver.
   Factor the existing occurrence-retention/authority check into one read-only
   helper used here and at its existing position in authorization. It validates
   both retained surfaces and the matching trusted verification/review captures,
   including cross-review bindings. It must not become a global Inspection
   invariant: legitimate lane-first projection prefixes can be one-sided.
4. Refuse missing current-run captures, missing trusted captures, or conflicting
   bindings before `createHostAdapter` when already knowable. Keep
   `evidence-incomplete` and the bound `occurrence-retention` blocker; provide a
   bounded runner-owned detail identifying the missing or invalid source class,
   not a raw validator message. No checkpoint claim, attempt, or writer dispatch
   occurs on this path. Source absence and an omitted available source have the
   same evidence requirement but different remedies in coordinator guidance.
5. Continue fresh authorization, mandatory-completion headroom, projection
   footprint, and settlement checks. Count every supplied original acquisition
   and descriptor before decoding/sharing; a fitting admission does not promise
   that future bytes will fit. Do not restore old RunState or permits. Each new
   attempt requires its own actual Tester and Reviewer results.

Passing historical preflight establishes input completeness only. The existing
repeat and learning-governance gates can still refuse a subsequent attempt.

For seeded current-run history, include a separate final live capture of this
invocation's actual `currentRun` array, initially empty, using the existing
`currentRunCapture` representation. Charge that real empty capture at admission
and replace only that final live capture as new records arrive. It supplies no
historical proof or task completion. This keeps `completionEntryDemand` and
`preflightLightweightWorkV2` aligned with delivery: the latter appends to the last
current-run capture today. It must never predict a rewritten historical capture
while the runner actually appends another source. Test predicted lane-first and
receipt footprints against this exact seeded layout. No reservation field or
new accounting state is needed; unseeded runs keep their existing absent-stream
headroom behavior.

Keep `record-attempt-result`'s prohibition on caller-selected trusted captures:
the adapter builds the pair for the current pending attempt. Historical
captures feed admission and subsequent full retained-evidence checks, never
that current result's trusted identities. Newly built captures join the
runner's existing observations without overwriting the supplied history.

### Existing Initial-Claim Ordering

Update the Work caller guidance in `src/skills/dude-work/SKILL.md` and the
focused Work documentation in `docs/commands.md`. After normal selection and
read-only prerequisites, an eligible pending task uses the existing adapter:
`fresh-inspection`, `authorize-lane-effect` for the existing `initial-claim`
mutation, `apply-lane-effect`, and `commit-lane-receipt`. Reacquire exact owner,
task, mapping, and poststate before runner entry. The read-only historical
preflight also applies before this claim when history is required and known.

Keep claim setup and execution ownership separate under the existing lifecycle:
settle the claim receipt and end its setup adapter through its permitted normal
end before starting the runner with fresh in-progress bindings and the
unchanged accepted state/policy. A failed setup or cleanup is a stop, not a
second claim. Do not change `runHostAdapter` to accept pending tasks, add an
initial-claim operation, use the board CLI, or edit glyphs directly.
This ordering is usable for 060 itself with today's permit capability; it does
not depend on implementing a new claimant first.

## 2. Complete Payload Preflight And Conditional Correction

Use one state-bound preparation/validation path in `host-adapter.mjs` for the
actual semantic result, reachable from its request validator and the runner's
specialist-result handling. Reuse `buildSpecialistAttestation` and existing
completion validators for the pending action, operations, changed targets, and
trusted envelope bindings. Remove shallow duplicate checks only when the
authoritative path covers them. Do not add a second hand-maintained schema.
Validate inert raw input before cloning; preflight returns no permit and grants
no acceptance.

Before dispatch, the coordinator includes every intended writer path in
`Assessment.materialInputs.targets`, including Tester edits and generated
files, and validates the Assessment against the exact Inspection. Compare the
declared dispatch scope to that set. Before completion, compare the actual
attempt-specific changed paths and sole specialist result with the same set,
using the captured dirty-work baseline to avoid attributing unrelated edits.
This is a caller obligation plus receiver-enforced binding checks, not a new
repository-wide diff scanner or write-scope registry.

The receiver still rejects a changed file absent from authorization, more than
16 checks, wrong operations, and invalid attestations. Move pure, fully knowable
attestation validation before effectful invocation, and route the local
malformed-attestation rejection through existing incident handling only after
proving the exact original authority and no effect. Reuse the existing
no-effect capture/classification machinery where a port has been entered;
local validation can establish no effect only for an inert path that invokes
no runtime or lane writer, with fresh authority checks. Do not merely replace
the catch with an unconditional `closedIncident`.

Keep accepted bytes/hash/revision, counters, pending entries, and authoritative
task/definition bytes exact across the rejected operation. Check the live
supervisor/worker and checkpoint binding before offering or consuming
correction. Unknown or observed effects, lost authority, pending effects, and
unsupported definition-reconciliation attestations retain their existing
stops. No-effect evidence covers the rejection interval, not earlier
authorized implementation writes.

The existing correction identity remains the only allowance. The runner may
resubmit a deterministically corrected payload once when the change is purely
mechanical and its meaning and authorization are unchanged. It must not spend
that allowance replaying an unchanged known-invalid payload. When correction
needs the actual result owner, use the existing fresh-inspection and bound
`specialist-pair` exchange, without another attempt authorization. Preserve
challenge identity/replay checks and existing challenge bounds; failed or
consumed correction requires reinspection, not a new retry budget.

Do not automatically group checks. The actual Tester can return a valid result
that preserves every obligation, and any changed review binding requires the
actual independent Reviewer. No valid complete representation means refusal.
A missing authorized path cannot be corrected by expanding a pending attempt;
return through the existing scope/authorization owner before further writing.

## 3. Preserve Diagnostic Facts

Extend the existing adapter result's closed optional diagnostic fields to carry
a runtime-validated `blocker` on its matching hard stop. Reuse `validateBlocker`,
require its code to match the refusal, and bind its evidence hash to the
validated Inspection returned for that operation. Preserve capacity diagnostics
independently. Do not add fields to RunState, sessions, checkpoints, or logs.

In `handleAuthorization`, retain `fields.blocker` rather than dropping it.
In runner `recordStep`/`finish`, revalidate and carry that blocker using the
current operation's Inspection. Reset per-operation attribution so a later
refusal cannot borrow an older hash. Continue using `describeUnattendedHalt`,
its closed reason classifications, and `HALT_NEXT_ACTIONS`; untrusted messages
remain sanitized and facts that are genuinely unavailable remain unresolved.
Coordinator prose names the responsible next owner without manufacturing a
human approval or claiming a repair is underway.

For `advance-governance`/`resume-learning`, preserve the runtime's refusal and
any condition it can deterministically establish through its existing
validators. The retained 131020-byte, `overflow=false` incident proves neither
capacity exhaustion nor safe correction. Exercise the refusal/reporting path
without changing `resumeGovernanceV2`, repeat derivation, phase eligibility, or
the production runner's four existing governance intents to force progress.
If a complete historical reproducer is unavailable, use a clearly synthetic
contract case and report the attribution limit.

## Validation Cases And Phases

| Phase / task | Contract cases and acceptance |
| --- | --- |
| Admission / `T001@d060a101` | Real permit-based pending-to-in-progress caller order; direct pending runner still refuses. Complete host-observed historical inputs reach a fresh run; 21 retained events with absent streams refuse before claim. Wrong target/attempt/hash/provenance, incomplete or duplicate/conflicting captures, absent optional session, repeated invocation-local ordinals, and source/descriptor/byte boundaries keep their existing semantics. Assert no claim or charge on an early source refusal. |
| Completion / `T002@d060b202` | Actual receiver preflight accepts 16 checks and rejects 17/18, preserves every submitted row, and detects an omitted changed file. Prove a same-authority no-effect correction without extra charge, plus consumed correction/reinspection, stale identity, effectful/indeterminate rejection, cancellation, and supervisor-loss refusals. Keep trusted-capture selection prohibited. |
| Diagnostics / `T003@d060c303` | Runtime -> adapter -> runner -> real CLI terminal preserves `evidence-incomplete` / `occurrence-retention` and the current evidence hash. Missing-source detail distinguishes unavailable inputs from integration omission. A valid non-overflow governance refusal remains a hard stop with truthful known/unknown facts. Forged blockers and stale hashes do not gain attribution. |
| Integration / `T004@d060d404` | Source/generated parity, all relevant existing suites, exact history/limit preservation, and a real valid completion through verification, independent review, projection, receipt, settlement, audit, and close in disposable fixtures. No live incident is resumed. |

These are sequential units because they share runtime and test files. There is
no optimization objective or new ObjectiveRegistry; acceptance is the contract
matrix above. No UI, design-approval stage, research artifact, or schema file
is needed.

## Delivery And Preservation

Authoritative implementation edits stay in the named `src/skills/dude-work/`
files and tests, with focused guidance in its `SKILL.md` and `docs/commands.md`.
Use existing Lightweight test coverage as a regression dependency; changing its
permit semantics is not part of this plan.

Generate changed `.github/skills/dude-work/` counterparts with the existing
`scripts/build-dev.mjs` pipeline in a disposable projection root using
`--repo <disposable-root>`, then copy only reviewed matching Work outputs.
Never run an unconditional build-dev over this dirty checkout: it rewrites core
instructions and unrelated Canvas output. No new build system is needed.

Before implementation, preserve the coordinator's dirty-work baseline at
`main` / `85fe22df354006422d5b3dfbea99a50f293143fd`. Protect local
`.github/instructions/dude.instructions.md`, profile/pack instruction changes,
Canvas source/generated/test changes, and every unrelated diff. Limit any
`docs/commands.md` edit to the Work guidance without rewriting existing changes.
Keep prior packages 018/039/040/056/057/061/062/064/065 and their histories
untouched. This plan authorizes no commit, branch change, reset, staging, push,
or live claim/checkpoint/process inspection.

Verification handoff, to be executed by the coordinator or its authorized
testing owner, not by definition:

```bash
node --test src/skills/dude-work/recovery.test.mjs src/skills/dude-work/host-adapter.test.mjs src/skills/dude-work/specialist-attestation.test.mjs src/skills/dude-lightweight-execution/board.test.mjs
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs scripts/current-format-contract.test.mjs
node .github/skills/dude-lint/lint.mjs .
git diff --check -- src/skills/dude-work .github/skills/dude-work docs/commands.md
```

Run projection checks in the disposable root where necessary. Report actual
passed/failed/skipped counts and any baseline conflicts; do not repair unrelated
failures to obtain a clean report. Independent review and coordinator-owned
publication, task state, and closure remain separate gates.

## Guardrails And Residual Risks

Existing project guardrails suffice; none are proposed or persisted. The
design reuses current production boundaries and introduces only the missing
input and validation wiring. It preserves deterministic accounting and leaves
semantic diagnosis, authority, and acceptance with their existing owners.

Available captures may still be incomplete or exceed existing limits, so a
fresh invocation can correctly refuse. Cooperative provenance is not a
malicious-host security guarantee. Preflight does not remove drift or establish
supervisor liveness; fresh checks remain mandatory. The particular governance
cause is unisolated, and this plan supplies no orphan or 062 continuation
authority.

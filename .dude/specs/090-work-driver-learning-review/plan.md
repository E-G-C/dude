# Plan: Work Driver Learning Review

Spec: `.dude/specs/090-work-driver-learning-review/spec.md`
Owner: `.dude/ideas/090-work-driver-learning-review.md`

Extend the existing `respond` subcommand with one learning-result input. Reuse the runner's closed response envelope and the receiver's Inspection-bound learning calculation. Keep the driver deterministic and leave all runtime effects with the existing adapter and runner.

The accepted outcome is live-run learning support. The command form and helper extraction below are the chosen technical plan, not additional user-supplied requirements or permission to recover 089.

## Technical Context

| Field | Choice |
| --- | --- |
| Language/Version | JavaScript ES modules, Node.js 20 or later, matching the core's existing requirement. |
| Primary Dependencies | Node built-ins and existing core modules only; no dependency or manifest change. |
| Storage | Existing outside-workspace challenge, response, and retained-capture files; unchanged temporary ownership store and canonical lane history. No new persistent state. |
| Testing | Node's built-in test runner; real released-core driver exchanges, focused recovery tests, existing adapter regressions, and prose/build contracts. |
| Target Platform | Existing supported Node hosts, with separate per-file acceptance processes and short fixture roots on Windows. |
| Project Type | Reusable core bundle with generated installed files under `.github/`. |
| Performance Goals | No extra runtime operation or model call for response construction; retain existing evidence, transport, event, comparison, and execution budgets. No new latency target. |
| Constraints | Sequential autonomous Lightweight Work; exact ownership; complete evidence; same live supervisor; existing learning, review, projection, cancellation, and close gates. |

## Source Evidence And Consumers

| Current source | Consequence for this change |
| --- | --- |
| `src/skills/dude-work/driver.mjs`: `responseFileFor`, `readChallenge`, `run` at lines 983-1068, and `respond` at lines 1187-1267 | The file bridge already transports learning challenges. `respond` currently builds only a specialist result or cancellation. Extend it without adding a subcommand, loop, or response destination. |
| `src/skills/dude-work/host-adapter-runner.mjs:818-939,1383-1469` | The runner already accepts `kind: 'learning-review'` with a `review` field and owns review, dual projection, fresh inspection, alternative binding, and no-progress verification. Its response protocol and semantic operation set need no extension. |
| `src/skills/dude-work/recovery.mjs`: `validateLearningFindingV1`, `validateAlternativeV2`, `requireCompleteFailedSetComparisonV2`, `reboundGovernanceEvidenceV2`, and `learnGovernanceV2:11904-12051` | Raw review validation and full failed-set comparison exist, but their contextual preparation is embedded in an acquiring/effect-producing handler. Extract that preparation for two real callers instead of copying validation into the driver. |
| `src/skills/dude-work/driver.test.mjs`; `recovery.test.mjs`; `host-adapter.test.mjs` | Driver tests already build a core release and drive public commands. Runtime tests already exercise both learning branches, rejection, retention, and supervisor boundaries. Add missing driver coverage and helper/receiver parity; reuse the adapter regressions instead of duplicating their full matrix. |
| `src/skills/dude-work/COOKBOOK.md:262,315`; `scripts/current-format-contract.test.mjs:7500-7629` | The cookbook currently requires cancellation and the contract test bans a learning-response maker. Change those coupled surfaces together. Keep the other retired-guidance checks. |
| `docs/commands.md:2155`; `src/skills/dude-work/SKILL.md`; `scripts/build-release.mjs:337-414`; `scripts/build-dev.mjs` | The command table and Work skill already point to the cookbook and do not prohibit the new form. Leave those pointers unchanged. The shared core-output functions generate the three affected installed copies; tests are not projected. |

The receiver remains reachable through the adapter's existing `advance-governance` operation. Its direct recovery route and internal tests are not an ordinary Work workaround. Earlier 086 definition artifacts document the original exclusion; preserve them and their history. Change the current implementation, guidance, tests, and generated counterparts, not those historical definitions.

## Work And Ownership Checks

First definition uses the selected exact draft and prospective spec path above. The coordinator supplied a clean selection and lifecycle inventory, no Beads database, and an absent target package. Publication must still use the existing first-definition transaction and fresh preimage checks. These facts do not establish later Work admission.

Before execution, the coordinator must resolve exactly one defined owner by the exact `spec_path:`, detect the lane again, validate canonical task grammar and dependencies, and use the ordinary claim and runner path. A resolver diagnostic or tracked precedence stops the applicable path; a matching lifecycle number or slug never substitutes for ownership.

There is one new task, `T001@5b7c2d90`, with no dependencies or inherited state. The number 090 records capture chronology, not priority or execution order. No dependency on 089 is introduced. Its stopped task, original captures, administrative eligibility, and current authority remain outside this package.

For the implementation attempt, include every intended writer from `tasks.md`, including Tester edits and generated outputs, in `Assessment.materialInputs.targets` before dispatch. Compare the actual delta with the attempt baseline. Do not edit definition sources while a claim is held, widen a pending authorization, or attribute pre-existing dirty work to this task. Ordinary coordinator-owned lane effects remain separate.

## Chosen Structure

### 1. Extend the existing response form

Add this mutually exclusive form to `respond`:

```text
node .github/skills/dude-work/driver.mjs respond --root . --challenge <exchange>/challenge-<n>.json --learning-review <scratch>/learning-review.json
```

The existing complete specialist trio and `--cancel` remain the other two forms. Mixing forms, supplying a partial trio, or omitting the selected form is a usage error. Keep the seven existing subcommands and existing exit-code conventions.

The new file contains the actual complete raw learning-review v2 result already consumed by `learnGovernanceV2`:

- Required: `version`, `target`, `assumptionIdentities`, `findings`, `alternatives`, and `outcome`.
- `selectedAlternativeIdentity` is required only for `selected-alternative` and forbidden for `no-progress`.
- An optional `sequenceIdentity` retains its existing already-valid, uniquely matched compatibility rule. This feature creates no sequence or objective.

Accept no caller-authored response envelope, challenge identity override, governance override, trusted capture, projection, or runtime action. The driver derives the expected target and context from the exact challenge and rejects a different `review.target`; it does not rewrite it. Existing review identities must validate against their actual bodies and evidence. Do not fill missing identities with placeholders or hashes of invented content.

For the learning form only, use the existing exchange files to check that the named challenge is the current waiting challenge with the same number, kind, and challenge identity. Validate its existing body binding, canonical accepted-state bytes/hash, Inspection, target, and required governance binding. Reuse existing validators and canonical hashing, with small local transport checks; add no general challenge framework or new status fields.

The captured state and waiting status can establish local consistency, not live authority. A copied or recomputed hash cannot prove supervisor liveness. The original runner still owns freshness, replay, and authority checks when it receives the result.

After contextual preflight, build only the existing envelope:

```text
version: 1
type: challenge-response
challengeIdentity: copied from the exact challenge
kind: learning-review
review: the validated raw result, unchanged
```

Measure the exact serialized response, including envelope, escaping, indentation, and final newline, against the existing 1,048,576-byte transport ceiling before publication. Use the existing outside-workspace destination and atomic publication helper. Refuse an existing response without overwriting it. Report publication using the existing success/refusal style; do not report accepted learning or completion from a successful write.

### 2. Share the existing Inspection-bound preparation

Extract one pure exported `prepareLearningReviewV2(state, inspection, review)` from the current `learnGovernanceV2` calculation. Its only production callers will be the new driver preflight and the existing receiver.

The preparation validates the supplied accepted state and Inspection, required governance phase, exact target, complete dual-retained occurrence authority, repeat, and failed-approach set. It then applies the existing raw review, finding, alternative, complete comparison, branch, optional sequence, and review-event validation. It returns the prepared calculation or the existing refusal information without acquiring evidence, advancing accepted state, publishing a projection, or issuing a permit.

`learnGovernanceV2` continues to acquire fresh evidence first, then calls the same preparation and constructs its existing governance successor and projection batch. Preserve its refusal precedence, returned behavior, event identities, ordering, and accepted predecessor on failure. The driver uses preparation only as preflight and sends the unchanged raw review, not a prepared event or state successor.

Keep semantic judgments with the learning owner. Deterministic identity and complete-set comparison stay in their existing validators; add no semantic equivalence detector, plausibility heuristic, general validator registry, or new low-level runtime route. Do not invoke `learn`, `transition`, `runCommand`, or another acquiring runtime path from `respond` to simulate preflight.

### 3. Keep the runner's branch order and budgets

No runner or adapter implementation change is planned. The existing runner handles the response through `advance-governance` with `review-learning`, prepares and applies the exact learning projection, verifies both retained surfaces, and obtains a fresh Inspection.

- For `selected-alternative`, existing alternative binding and attempt authorization precede further work. A later successful attempt still needs its own fresh Tester evidence, independent Reviewer result, settlement, and close.
- For `no-progress`, existing fresh verification precedes `ended` / `controlled-unresolved-end`. The task remains non-complete; there is no next-task claim or reusable settled continuation state.

Keep cancellation and every hard stop unchanged. Driver preflight failure publishes nothing and leaves the outstanding exchange waiting; only the existing owner may correct its result or choose the permitted cancellation path. Preflight introduces no automatic retry, recovery, or cleanup.

Preserve all current limits, including the 64-source and 64-retained-descriptor budgets, the 262,144-byte model packet, completion headroom, event limits, finding/comparison limits, the eight-alternative limit, challenge capacity, and execution accounting. Do not increase a limit to fit a fixture or reduce one to simplify validation. Missing evidence and byte overflow remain distinct refusals. Preserve original captures, duplicates, failed rows, and metadata.

### 4. Update the operating reference and projections

Update the cookbook's response-purpose table, learning step, cancellation-only paragraph, and stop table. Document the new command form, the existing v2 input fields and branch conditions, how the learning owner obtains complete evidence from the exact challenge, and how response publication differs from receiver acceptance. Use source-backed field guidance rather than a canned review that could be mistaken for an actual learning judgment.

Keep Work's detailed governance policy in `SKILL.md`; point to it rather than duplicating its full contract. Preserve the existing cancellation, lost-supervisor, retained-capture, and stopped-run restrictions. Remove the claim that every learning challenge must be cancelled solely because no builder exists. Do not promise that this command can admit or resume an old in-progress task.

In `scripts/current-format-contract.test.mjs`, replace only the obsolete learning-maker prohibition with positive coverage for the new form and its owner/safety guidance. Keep the seven-subcommand check, current-only guidance checks, and source/generated parity. Give the new assertions deletion or contradiction falsifiers so they test the intended prose rather than unrelated words.

Generate these exact outputs using the existing `listCoreOutputs` and `writeCoreOutput` functions shared by the dev and release builders, filtered to these three paths:

- `.github/skills/dude-work/driver.mjs`
- `.github/skills/dude-work/recovery.mjs`
- `.github/skills/dude-work/COOKBOOK.md`

Do not hand-edit them. A full workspace `build-dev` deletes and rebuilds unrelated core output and can change development-base-release metadata; it is not within this task's writer set. Use a disposable copy if a full rebuild is needed. Leave `docs/commands.md` unchanged because its cookbook pointer already remains correct; a newly discovered conflict needs the existing scope owner before another path is written.

### 5. Avoid unsafe mixed-version self-hosting

This task changes the driver used by its own Work invocation. Prefer keeping that live invocation on a complete, unchanged pre-change core module tree, retained outside the workspace before implementation, for its remaining response commands. The same still-live supervisor and ordinary Work path remain necessary; the saved modules confer no authority. Test the candidate only in disposable released-core fixtures until the active run ends normally.

If the coordinator will instead use the candidate responder with the already-loaded pre-change runner, first test that exact executable pairing in a disposable fixture. Use the pre-change driver's real claim/run path and the candidate responder, establish a repeat through actual exchanges, and exercise both learning branches plus ordinary specialist/cancel compatibility. Equal protocol version numbers or source inspection are insufficient evidence.

Do not replace the live runner, restart a dead supervisor, reclaim the task, or load old returned state to get past a stop. If learning is reached before a compatible responder is available, retain the current Work outcome. These are execution-time precautions, not a new version selector, compatibility framework, checkpoint, or persistence feature.

## Verification

### Production-path acceptance

Extend `src/skills/dude-work/driver.test.mjs` using its existing released-core fixture and public-command helpers. The primary evidence must come from the installed fixture driver, not a hand-written challenge or direct recovery call:

1. Build the actual core into a short disposable root, with one defined owner, one pending task, exact breadcrumb, and no optional packs. Isolate its temporary ownership store and Beads behavior from the host.
2. Invoke real `claim`, attached `run`, and `assess`. Submit the actual test-owned Tester and Reviewer records through `respond` twice to establish a proven repeat. Use complete records with stable repeated finding evidence; do not seed a required-governance state in place of these exchanges.
3. Read the resulting learning challenge and its complete evidence. Submit one complete fixture learning result through `respond --learning-review` while that same runner remains live.
4. On the selected-alternative branch, assert accepted learning, exact ordered dual projection, verified retention, fresh post-learning inspection, and the next correctly bound alternative exchange. Complete a successful alternative through a fresh specialist exchange to prove that learning alone did not settle the task.
5. In a separate no-progress run, assert the complete projected review, fresh no-progress verification, `controlled-unresolved-end`, unchanged non-complete task disposition, preserved prior history, and absence of reusable settled continuation state.

Fixture semantic records prove transport and receiver behavior only. The real task's verification and independent review remain separate routed work.

### Refusal and regression coverage

| Coverage | Expected evidence |
| --- | --- |
| Command forms, wrong kind, stale waiting challenge, foreign identity, duplicate/replayed submission, and wrong target/state/governance/Inspection binding | Driver refusal before a response appears where locally detectable; existing response bytes and accepted Work evidence unchanged. Receiver tests remain the final authority for drift after publication. |
| Malformed raw review, missing evidence, incomplete comparison with an older failed approach, duplicate comparisons, invalid selected alternative, and invalid no-progress branch | The intended existing validation rejects; no manufactured review, narrowed failed set, or alternate route reaches acceptance. Keep other prerequisites valid so each test exercises its stated guard. |
| Current finding, alternative, event, packet, and response transport limits | Reachable boundary and over-capacity cases refuse without pruning. Measure encoded bytes. Keep dominating validation intact and identify an earlier refusal honestly rather than weakening a guard to reach another. |
| Preflight versus fresh receiver calculation | Focused `recovery.test.mjs` cases prove identical validated review/event calculations and refusal semantics for both branches, with immutable state, Inspection, and review inputs. A changed fresh Inspection cannot inherit the earlier preflight. |
| Cancellation, receiver-side stale/foreign/replayed envelopes, projection failure, and supervisor loss | Existing `host-adapter.test.mjs` regressions plus driver-facing cases preserve terminal outcomes, accounting, history, and ownership disposition. Saved files grant no authority after supervisor loss. |
| Existing driver and documentation contracts | Existing claim, assessment, specialist, retained-evidence, and cancellation tests still pass. The new form is documented and generated copies match their authoritative sources. |

Do not duplicate the full adapter test suite in the driver file or add test-only production hooks. Extend `host-adapter.test.mjs` only through a newly authorized writer scope if a concrete uncovered receiver defect requires it; no edit to that file is anticipated.

### Execution checks

The execution owner runs each of these in a separate Node process from the repository root, against a per-file pre-change baseline scheduled the same way:

```text
node --test src/skills/dude-work/driver.test.mjs
node --test src/skills/dude-work/recovery.test.mjs
node --test src/skills/dude-work/host-adapter.test.mjs
node --test scripts/current-format-contract.test.mjs
node --test scripts/build-dev.test.mjs
node --test scripts/build-release.test.mjs
node .github/skills/dude-lint/lint.mjs .
```

Require zero new or unexplained affected failures and no skipped required learning cases. Report actual executed, failed, skipped, and cancelled counts; a wrapper exit alone is not evidence. Do not run every file in one Node process on Windows. Keep roots short, keep evidence outside the workspace, and confirm the owned children have stopped before deleting their fixtures.

Also build a core-only release into a fresh short outside-workspace directory with `node scripts/build-release.mjs --out <release-root>`, run the existing lint against that directory, and inspect its driver, recovery module, and cookbook. Require no test-file or optional-pack dependency. This is disposable acceptance, not a release or Git action.

Compare exact source/generated bytes and the complete implementation delta against the task baseline. Keep 089, all historical ledgers/packages, memory, unrelated dirty files, and development metadata unchanged. Record the self-hosting precaution or actual mixed-pair evidence in the ordinary verification handoff, not in a new project artifact.

## Phases And Task Traceability

One independently verifiable unit covers the whole new response path. Splitting the helper, responder, and cookbook would leave an intermediate unsupported or contradicted operating procedure, so there is no separate setup, framework, or polish task.

| Phase within T001@5b7c2d90 | Spec obligations | Verification |
| --- | --- | --- |
| Establish the unchanged-runtime baseline and shared pure preparation | FR-003-FR-005, FR-008-FR-011, FR-014; US1-US2 | Helper/receiver parity and existing recovery/adapter regressions |
| Add the learning form and prove both real exchanges | FR-001, FR-003-FR-007, FR-011-FR-017; US1-US2 | Released-core selected-alternative/no-progress flows and refusal cases; SC-001-SC-005, SC-007 |
| Update the cookbook and coupled prose contract, then generate exact outputs | FR-002, FR-018; US3 | Command/guidance falsifiers, source/generated parity, release acceptance; SC-006-SC-007 |

## Guardrails And Complexity

Existing project and bundle guardrails cover this change; there are no new guardrail candidates. The design follows the existing CLI request/response pattern and pure-preflight pattern used by `prepareSpecialistResult`: one result input, one bound envelope, and authoritative validation again at use.

The shared function serves the two in-scope production callers and prevents duplicate semantic validation. No new dependency, persistent schema, runtime operation, or generalized transport layer is justified. No separate research, schema, data-model, checklist, or quickstart artifact is needed; the existing contracts, this plan, tests, and cookbook cover the change. There is no objective-evaluation requirement, so the plan has no ObjectiveRegistry region.

Material risks are accidental receiver drift during extraction, omitted evidence or generated writer paths, late capacity refusal despite a valid local preflight, and unsafe old-runner/new-responder mixing. The verification and self-hosting checks above address those risks without granting continuation. 089's eligibility remains unproved and outside scope.

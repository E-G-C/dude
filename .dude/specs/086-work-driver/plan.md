# Plan: Work Driver In Core

Spec: `.dude/specs/086-work-driver/spec.md`
Owner: `.dude/ideas/086-work-driver.md`

Port the kit's required path into one dependency-free driver beside the official Work runtime. Keep the proven file exchange for later coordinator tool calls, use the existing selection readers, and keep all authority in the co-versioned official components. Deliver the complete driver and its tests first, then the cookbook and the coupled guidance contract.

## Technical Context

| Field | Value |
| --- | --- |
| Language/Version | JavaScript ES modules on Node >= 20; acceptance commands use Windows PowerShell. |
| Dependencies | Node built-ins and existing core exports only. No library, package, manifest, dependency, or build-rule changes. |
| Runtime | Autonomous Lightweight `runHostAdapter`, invoked in process by the driver. The coordinator launches the driver asynchronously and attached. |
| Storage | Fresh short run directories outside the workspace. The existing temporary claim/checkpoint store stays unchanged. |
| Testing | One actual release-bundle integration test plus focused driver-boundary cases in `driver.test.mjs`; existing prose/build tests and a per-file full-suite comparison. |
| Authoring | Core changes under `src/`, docs directly, generated `.github/` copies only through `scripts/build-dev.mjs`. |

Source to port: `C:\Users\EG\.copilot\session-state\33afe027-6a42-458c-a1fd-2913ef3670da\files\work-kit\`. This is implementation reference material, not a runtime, test, or installed-documentation dependency. The Architect's 2026-10-17 recommendation is the chosen basis; no conflicting runtime contract was found.

## Chosen Structure

### 1. One driver with seven subcommands (FR-001, FR-003)

Author `src/skills/dude-work/driver.mjs`, `driver.test.mjs`, and `COOKBOOK.md`. The installed entry point is `node .github/skills/dude-work/driver.mjs <subcommand>`.

| Subcommand | Required behavior and bounded inputs | Kit source |
| --- | --- | --- |
| `claim` | Recheck admission and claim one pending task; accept `--root`, exact `--spec` and `--task`, optional outside `--out`, and same-invocation `--state`. Forward Work arguments after `--`. | `setup-claim.mjs` and its used local helpers |
| `run` | Accept `--request`, optional fresh outside `--dir`, and existing `--retained-evidence`; call `runHostAdapter` and bridge its sequential challenges. | `bridge-run.mjs` |
| `assess` | Accept `--root`, `--challenge`, and the small `--input`; build and validate an Assessment before publishing the matching response. | `make-assessment.mjs` |
| `respond` | Accept `--root`, `--challenge`, actual `--tester` and `--reviewer` files, and `--changed`; alternatively, `--cancel` publishes only the bound cancel envelope. | `make-specialist-response.mjs`, `make-cancel.mjs` |
| `snapshot` | Accept `--root` and outside `--out`; capture the attempt baseline at the specialist-pair challenge, before implementation. | `changed-paths.mjs snapshot` |
| `diff` | Accept `--root`, `--baseline`, `--challenge`, and outside `--out`; report actual changed paths and refuse any outside the pending authorization. | `changed-paths.mjs diff` |
| `ownership` | Accept one existing `--root`, exact `--spec`, and `--task`; ask the official store about only that pair and print its result without writes. | Narrowed `check-ownership.mjs` |

Use a simple subcommand dispatch and local helpers, following the existing core Node CLI convention. Do not introduce a reusable driver library or export setup internals for tests. Use static relative imports from `./host-adapter-runner.mjs`, `./host-adapter.mjs`, `./recovery.mjs`, and the needed `../dude-engine/lib/` readers. A release then uses its own matching runtime rather than dynamically loading modules from another workspace.

Keep the setup-binding composition local, using the kit's small combinations of existing exports. Do not widen the runner's closed exports, copy validators, add a protocol schema, or retain helpers without a kept caller. The driver makes no model call and dispatches no specialist.

### 2. Selection, policy, and pending-task setup (FR-004 through FR-010)

Do not port `select-next`. The cookbook uses the existing lane check, `bd list --all --limit 0 --json`, followed by `feature.mjs select` and `resolve`, and `board.mjs parse --json`, `ready`, or `next`. Use their current arguments and returned exact identities. An imported tracked issue stops this driver; there is no Lightweight fallback.

`claim` independently checks the lane, exact defined owner with zero resolver diagnostics, canonical target, parsed task file and warnings, exact owner breadcrumb, pending and unblocked prestate, completed dependencies, absence of another unblocked `[~]`, and first-ready order. Use `resolveFeatureOwner`, `parseVisibleTasks`, and `readyTasks`; do not duplicate their parsers or ranking. Require the owner bytes to support the exact LF log append. Inspection blockers, overflow, or failed `inspectRetainedOccurrencesV2` checks refuse before lane mutation.

Pass the tokens after `--` unchanged to `parseInvocation`. Require `policy.mode === 'autonomous'`; do not embed a Ship policy constant or replace the caller's limits. If the forwarded invocation includes a feature selector, resolve it through the existing reader and require the same exact owner/spec binding. Preserve the parser's invalid-combination refusals. Ship's existing coordinator normalization remains outside this script.

For the first task, initialize the ordinary validated empty RunState with that parsed policy. For continuation, use only a previous `ended/task-settled` result from the same still-authorized invocation. Validate the supplied `accepted-state.json`, require its sibling `result.json` to report that terminal pair, and require equality with its returned accepted state and the parsed policy. Reject pending work, unfinished completion or learning, policy mismatch, or a non-settled result. These existing files are transport evidence; they cannot establish that the invocation is still authorized.

Keep setup in the required order:

1. Mint real, fresh setup supervisor and worker identities and retain the supervisor material outside checkpoint bytes before adapter admission. Use the official temporary checkpoint store and the kit's one-shot supervisor and no-effect ports.
2. Through `createHostAdapter`, run `fresh-inspection`, then `authorize-lane-effect` for `initial-claim`, `apply-lane-effect`, and `commit-lane-receipt`.
3. Confirm the committed receipt settled setup: no pending effect, unchanged canonical accepted-state bytes, and unchanged accepted revision. Do not call `settle-effect` after the claim receipt.
4. Call `end('controlled-end')` and require the official store to report the pair absent.
5. Reacquire the exact owner, mapping, and unblocked `[~]` poststate. Only then publish `runner-request.json` with the unchanged state.

Keep the adapter's existing bounded correction and fresh-inspection handling. Before any entered lane write, a refused setup may use only its own permitted cancellation and prove pair absence. After a lane write, uncertain effect, or hard stop, retain and report the existing outcome; do not repair glyphs, use the board write CLI, or clean up files directly.

The claim mutation appends one neutral autonomous Work claim line, applicable both to direct Work and Work inside Ship, through the official exact owner-log append. It states that implementation has not started. There is no log bypass or caller-selected attribution. The runner continues to own its ordinary receipts and approach history; the driver adds no task-close log.

### 3. File exchange, results, and continuation (FR-011 through FR-015, FR-022 through FR-026)

Launch `run` asynchronously and attached through the coordinator's shell tool. Inside that process, call `runHostAdapter(request, { runtime, exchange })`; do not spawn a second runner or emulate its loop. The small runtime port delegates to the existing `runCommand` and retains the original capture inputs needed for the kit's existing retained-evidence handoff.

The exchange writes one `challenge-<n>.json`, plus `packet-<n>.json` when the challenge carries a model packet, and waits for the matching `response-<n>.json`. Keep a fixed polling delay and no response timeout. Publish complete message and status values through a sibling temporary file and rename. Refuse duplicate responses and an existing caller-named exchange directory instead of trying to recover or quarantine its contents. There is no polling configuration, response repair loop, or background process.

If `claim --out` or `run --dir` is omitted, create and report a fresh short `dw-XXXXXX` directory under `os.tmpdir()`. A caller-named destination must be outside the workspace and fresh. All other outputs live in the chosen run directories. Check ordinary resolved paths, including the existing parent of a new destination, before creating files; reject the workspace root and descendants. Do not add concurrent-folder-swap defenses or unusual-path compatibility.

Keep only run files that the procedure consumes:

| Step | Files outside the workspace |
| --- | --- |
| Claim | `supervisor.json`, `setup-report.json` with step/receipt evidence, and the successful `runner-request.json` |
| Exchange | Atomic `status.json`, numbered challenges, model-packet sidecars when present, and one response per challenge |
| Terminal result | The complete `result.json`; reusable `accepted-state.json` only for `ended/task-settled`; original `retained-evidence.json` when runtime capture inputs exist |
| Attempt scope | The requested baseline and successfully checked changed-path array |

Preserve the full runner result, including `haltReport`, `blocker`, `capacity`, `cleanup`, `cleanupReason`, `orphan`, and ownership diagnostics. Keep these fields available in the terminal status rather than reducing a hard stop to a process exit code. An ended runner can exit zero, but continuation requires both `outcome: 'ended'` and `reason: 'task-settled'`. Cancellation, other ends, and every hard stop remain stops. Returned state on those results stays evidence in `result.json`, not reusable continuation state.

Retain the four existing raw streams, `currentRun`, `verification`, `review`, and `lint`, from the actual runtime inputs without changing their capture bytes, order, or duplicates. Pass `--retained-evidence` through the existing request field before runner admission; reject competing duplicate sources. Add no history loader, proof reconstruction, capture normalization, authority restoration, or new resume command. The runner still validates provenance and all current limits.

`ownership` requires a current exact owner and mapping to form its real binding, then uses `createTemporaryCheckpointStore().load`. Report only that derived pair and its official status/diagnostic. Remove deleted-workspace support, `--modules`, fallback owner identities, and directory-wide counts. Keep the probe read-only. Failed ownership resolution is a refusal, not permission to manufacture a binding.

### 4. Assessment, specialist input, and attempt scope (FR-016 through FR-021)

Keep the kit's compact Assessment input: `action`, `targets`, `summary`, `intent`, `equivalence`, and `retention`. Require the caller's semantic values. Derive only the challenge's `evidenceHash`, the action's `operations`, and `requiredChecksForAction`. Validate the exact built Assessment with `validateAssessment(target, inspection, assessment)` and the existing material-input validator before writing the response. Preserve the kit's unsupported-action stops, including `none` and `reconcile-derived-definition`; direct the coordinator to the existing stop/cancel path. Do not normalize model fields or silently repair paths.

At a `specialist-pair` challenge, decode and validate its accepted state and identify the single pending authorization. Capture `snapshot` now, before any implementation or specialist edit. Reuse the kit's content comparison: skip `.git` and `node_modules`, include authored and generated files and link entries without following links, and compare the same workspace against the baseline. The delta includes additions, changes, and deletions in UTF-8 byte order. Unchanged pre-existing dirt is not attributed to the attempt.

Require `diff --challenge`; remove the unchecked diff mode. Compare the complete delta with the pending `materialInputs.targets`. On an unauthorized path, return nonzero with every offending path and publish no successful changed-path file. Route the scope issue through ordinary Work; never widen the pending authorization or omit the file.

`respond` reads the actual raw Tester and independent Reviewer records and the checked changed-path array. Derive `failed` for any failed check, otherwise `blocked` for rejected review, otherwise `succeeded` when paths changed or `no-change` when none did. Derive operations from the pending authorization. Keep every check, finding, and readable evidence row; a zero-change array needs no separate mode.

Call `prepareSpecialistResult(acceptedState, result)` and `validateHostAdapterRequest` for the actual `record-attempt-result` request before publication. Do not clone or normalize unvalidated specialist records, add semantic overrides, truncate rows, group away obligations, or precompute trusted identities. Local preflight failure writes no response; the authoritative receiver repeats validation at use.

`respond --cancel` writes only the existing bound cancel envelope and lets the runner perform permitted cancellation. It neither deletes the pair nor starts another task. For `learning-review`, document the existing stop/cancel path only; do not port the kit's illustrative learning payload into a supported maker.

### 5. Cookbook and guidance (FR-002, FR-027, FR-028)

Put the full operating procedure and compact input examples in `src/skills/dude-work/COOKBOOK.md`. Follow the familiar CLI/reference split: the frequently loaded skill locates the tool, while the reference carries flags, examples, and detailed operating steps.

Keep the selection procedure, claim order, attached asynchronous launch, authorization-before-implementation rule, complete writer set, baseline timing, canonical paths, actual specialist results and failed rows, derived outcomes, preflight, cancellation, retained-evidence provenance, terminal-outcome and mutation tables, same-invocation continuation, and ordinary closeout. Explain that independent supervisor-absence confirmation and the existing exact-pair manual procedure precede any manual cleanup. A PID, age, or an ownership probe does not grant that permission. Refer to the skill's current cleanup procedure rather than supplying a cleanup command.

Remove historical dry runs, machine/session paths, feature-specific examples and close recipes, timings, and every backlog-report generation or freshness claim. The report is retired; claim and completion effects no longer include it. Keep closeout with the existing coordinator, outside held claims, rather than creating a driver close command.

In `src/skills/dude-work/SKILL.md`, add one short pointer to the bundled driver and `COOKBOOK.md`. Replace only this boundary sentence:

`This boundary adds no command, grammar, lane, board, or project state surface.`

with:

```text
The bundled driver is host integration for the existing adapter and runner; it adds no `@dude` command, Work grammar, lane, board, or project state surface.
```

Keep the following checkpoint sentence and all other authority and safety clauses. Preserve the existing Needs You reference line; the new pointer must not add another line naming both `dude-work-intake` and `## Needs You Handoff`.

Update the matching boundary expectation in `scripts/current-format-contract.test.mjs` in the same task. Extend that existing prose contract only enough to check the pointer, the seven documented forms, cookbook source/generated parity, and the absence of retired kit instructions. Add one `dude-work/driver.mjs` row to the engine-script table in `docs/commands.md`, pointing readers to the cookbook rather than duplicating flags.

## YAGNI Cuts

The seven subcommands preserve the accepted kit steps without preserving its file layout. Merge the used `lib.mjs` helpers and scripts into the CLI; drop `select-next`, all three templates, dynamic `loadOfficial`, deleted-workspace probing, `--modules`, placeholder identities, and unrelated-store counts as the Architect recommended.

Further cuts keep one path for each operation:

- Drop `--claim-note` and `--no-owner-log`; the single required claim line covers direct Work and Ship.
- Drop `--fix-paths`, `--outcome`, and `--no-changes`; callers supply canonical paths, outcome follows evidence, and an empty changed array covers no change.
- Drop response destination overrides and maker `--dry-run` modes; responses belong beside their exact challenge, and failed preflight publishes nothing.
- Drop configurable polling, `--no-record-runtime`, per-call runtime request dumps, and duplicate bridge/step logs. The consumed status, result, capture, and setup-report files retain the needed evidence.
- Drop the recursive template-placeholder scanner and redundant Assessment clone/round-trip validation passes. File inputs are inert data, templates are not shipped, and official validation remains at both submission and use.

Add no automatic dispatch, Git, cleanup command, service, sweep, general debug framework, or additional execution mode. These cuts remove redundant affordances, not safety checks or accepted outcomes.

## Tests

Keep all new driver tests in `src/skills/dude-work/driver.test.mjs`. They invoke the CLI and public core exports, not a second driver implementation or new production test hooks. Private helpers in `host-adapter.test.mjs` are not importable; borrow only their small fixture patterns.

### Release-bundle integration

Use the exported `buildRelease({ repoRoot, outDir })` from `scripts/build-release.mjs` to install the actual core into a short temporary fixture workspace. Seed one defined owner with LF bytes, sibling spec and plan, and one pending task with its exact audit breadcrumb. Install no packs and read no session kit.

Run `claim`, launch `run` asynchronously, and wait for published status/challenge predicates rather than timing-based sleeps. Run `assess`. At the `specialist-pair` challenge, take the baseline, make one fixture product change, supply controlled test-owned Tester and Reviewer results, run `diff`, and submit with `respond`.

Assert `ended/task-settled`, `[x]`, snapshot agreement, exactly one claim log entry, the expected target-bound approach occurrence, committed claim and completion receipts, and official pair absence. Check retained capture provenance and the reusable final-state output. Compare semantic properties and relationships, not random identities, timestamps, total runtime calls, or arbitrary step counts. The test establishes integration only; real Work still requires fresh Tester evidence and independent review.

### Kept boundary cases

| Case | Why it belongs here |
| --- | --- |
| Claim refuses unfinished dependencies, another unblocked `[~]`, ownership ambiguity, and tracked lane before mutation | The driver composes these admission checks; SC-002 requires them. |
| Malformed tasks/breadcrumb, a later ready task, invalid or guarded Work arguments, selector conflict, and carried policy/non-settlement mismatch | These are additional driver admission conditions, not new runtime capabilities. Use a small table-driven fixture, not a parser matrix. |
| Invalid Assessment and invalid specialist pair publish no response | Proves the driver's preflight-before-publication boundary, SC-003. |
| Failed check, rejected review, and no-change records retain every row and derive the right outcome | Proves driver-owned outcome derivation, SC-004, without replaying the runtime's recovery suite. |
| Baseline additions/modifications/deletions, unchanged dirt, and an unauthorized changed path | Proves driver-owned delta and scope checks, SC-005. |
| Workspace-root/descendant output, reused exchange directory, and duplicate response | Proves the ordinary file-boundary refusals, SC-006. |
| Cancellation clears the pair through the runner and leaves `[~]`, with no reusable continuation state | Proves the cancel bridge and stop distinction, SC-007. |
| One foreign response returns the runner's hard stop without driver cleanup | Proves terminal-result and ownership pass-through, SC-007; do not duplicate every protocol rejection variant. |
| Nonzero carried accounting and policy remain byte-identical through claim; exercise finite autonomous controls as well as Ship's forwarded unlimited controls | Proves the driver has no hard-coded Ship policy or counter reset, SC-008. |
| Absent and present exact-pair ownership queries make no writes | Proves the narrowed read-only probe, SC-009. |

No named minimum negative from the Architect is cut: each proves a driver refusal or a required observable outcome. Cut duplicate runner/validator rejection matrices, deleted-workspace and custom-module cases, unrelated-store behavior, concurrent-swap defenses, and timing tests for hypothetical deadlines. The existing runtime suites retain their coverage.

Keep test outputs and fixtures outside the repository. Isolate the fixture's Beads response from this host's real `bd.exe`; do not skip lane coverage or add a production module/command injection flag. Wait for spawned processes to finish before fixture disposal. A foreign-response fixture may remove only its own bounded test pair after its supervisor has ended; that test cleanup must not become driver behavior.

## Files, Phases, And Traceability

| Unit | Exact authored writer paths | Generated writer paths | Coverage |
| --- | --- | --- | --- |
| `T001@e7c66e22` | `src/skills/dude-work/driver.mjs`; `src/skills/dude-work/driver.test.mjs` | `.github/skills/dude-work/driver.mjs` | Chosen Structure 1-4 and Tests; FR-001, FR-003 through FR-026; SC-001 through SC-009; US1, US2, and US3's runtime/probe behavior |
| `T002@ae927870`, depends on `T001@e7c66e22` | `src/skills/dude-work/COOKBOOK.md`; `src/skills/dude-work/SKILL.md`; `scripts/current-format-contract.test.mjs`; `docs/commands.md` | `.github/skills/dude-work/COOKBOOK.md`; `.github/skills/dude-work/SKILL.md` | Chosen Structure 5 and final release/full-suite acceptance; FR-001, FR-002, FR-027, FR-028; SC-010 and cumulative regression checks |

Two phases are enough: the complete executable slice and its tests, then the operating reference and coupled prose contract. T001's integration test does not require the not-yet-added cookbook; T002 adds those checks to the existing format contract and leaves `driver.test.mjs` unchanged. There is no half-migrated test at either task boundary, parallel candidate, setup-only task, design phase, supporting artifact, or runtime objective registry.

Run `node scripts/build-dev.mjs` to project the named generated files. Do not hand-edit them. Release projection already includes ordinary skill files and excludes `*.test.mjs`; no build-rule or file-list pin needs modification. The coordinator verified that build-dev will not change `.dude/metadata/development-base-release.md` on this branch. An unexpected projection or metadata delta remains outside the nine total writer paths and must be reported through ordinary Work.

Leave the runner, adapter, recovery runtime, engine readers, existing runtime tests, build scripts, manifests, packs, UI source/assets, memory, other ledgers/packages, and historical exports unchanged. Definition publication and coordinator-owned execution state are separate from these implementation writer sets.

## Verification

These are planned checks for implementation and testing owners; definition executes none. Run commands from the repository root in Windows PowerShell. Build dev copies before tests that read them. Use a fresh short owned release directory outside the repository, substituting the same absolute path for both release placeholders.

For each task:

1. `node scripts/build-dev.mjs`, then `node --test scripts/build-dev.test.mjs`.
2. `node --test src/skills/dude-work/driver.test.mjs`.
3. `node --test scripts/current-format-contract.test.mjs`.
4. `node .github/skills/dude-lint/lint.mjs .` with 0 failures.
5. `node .github/skills/dude-compose/compose.mjs verify`.
6. `node scripts/build-release.mjs --out <short temporary directory>`, then `node .github/skills/dude-lint/lint.mjs <that directory>` with 0 failures. Confirm the staged driver exists and `driver.test.mjs` does not; T002 also requires the staged cookbook and working pointer.
7. Compare the implementation delta with that task's exact writer set. No scratch file, unrelated projection, metadata change, or hand-written task-state mutation is allowed.

T002 additionally runs `node --test src/extensions/dude/needs-you.test.mjs` without changing that file, and the full suite with CI-equivalent discovery. Discover test paths with `Get-ChildItem -Recurse -File -Filter *.test.mjs | Where-Object { $_.FullName -notmatch '\\(node_modules|dist|\.git)\\' }`. Run one `node --test <path>` process per file, at most six in parallel. Run `node --test src/extensions/dude/canvas-server.test.mjs` alone, with no other test process active. A single process over all files exhausts the heap on this host and is not acceptance evidence.

The coordinator supplied the pre-change results for the byte-identical code in:

`C:\Users\EG\.copilot\session-state\33afe027-6a42-458c-a1fd-2913ef3670da\files\ship-work\1-T001-f6a0c58a\tester-evidence\check09-comparison.json`

Use each file's `now` result as this feature's pre-change comparison, not that report's older `base` or its historical comparison labels. The report includes a concurrent Canvas-server failure; the coordinator reports that it passed alone, so require a fresh isolated run rather than treating that failure as allowed. Its projection label also reflects incomplete older failure-name capture, not a changed count. The eleven other pre-existing failing files are environment limits involving Beads stubs, Windows symlinks, missing `gzip`, upgrade, scaffold, bundle-import, and projection cases.

Record each file's exit code, tests, passed, failed, skipped, and cancelled counts, plus changed failing test names and supported causes. The new driver suite has no old baseline and must pass. Expected test-count changes need an explanation; a baseline failure does not excuse a new or worsened affected failure, and a skipped check is not coverage. Keep the comparison in ordinary external Tester evidence, not a new repository report or test runner.

## Guardrails And Risks

Existing project guardrails apply unchanged; no new candidate rules arose. The design uses deterministic parsing, validation, and file comparison while leaving semantics with the coordinator. It follows the accepted YAGNI direction by reusing official exports and deleting unused kit affordances. No UI is involved, so no design gate or mock applies.

- Losing the attached runner or supervisor can leave an ownership pair. The driver reports the official stop and diagnostics; it cannot resume, take over, or clean up that authority.
- Temporary capture files can contain workspace evidence and can be lost outside the invocation. They remain outside the workspace and outside checkpoint bytes; their presence grants no authority, and missing proof keeps the existing stop.
- The local setup composition must stay aligned with the official co-versioned modules. The release integration checks that path without exporting private runner helpers or adding a compatibility layer.
- Windows process resolution can let a real `bd.exe` shadow fixture stubs. Test isolation must prove both lane outcomes; do not widen production command configuration to make a test pass.
- The recipe supports only existing autonomous Lightweight exchanges. A learning-review challenge still needs the existing owner disposition or cancellation; this delivery does not manufacture an answer or promise every invocation will settle.
- The two-task sequence makes the driver testable before its reference is delivered. Feature acceptance requires T002's guidance, release membership, and full-suite evidence as well as T001's executable slice.

Reverting the added product files and guidance needs no state migration; old session kits are left intact. Already recorded Work receipts and history remain evidence and are not reverted. Work's normal authorization, verification, independent review, audit, close, and stop rules stay unchanged.

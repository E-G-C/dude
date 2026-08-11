# Implementation Plan: Backlog Lifecycle Sync

## Summary

Implement two bounded corrections in the existing lifecycle and Lightweight execution topology.

First, extend the idea lifecycle matrix with terminal package-less `resolved`. The shared feature inventory remains the single metadata and exact-owner authority: resolved is valid only when the parsed status scalar is exact `resolved`, the unnormalized `spec_path:` scalar value is empty before path normalization, no owner path exists, and no item-specific owner or metadata diagnostic exists. Only that valid shape enters Completed. Every invalid resolved candidate remains unavailable or ambiguous and never becomes an owner or Completed item. Ordinary brainstorm refresh preserves valid resolved metadata; an explicit user request to reopen through brainstorm changes it back to draft before definition can proceed.

Second, export `refreshCommittedBacklog({root})` from the existing backlog module. It synchronously renders both outputs before writing, captures both preimages, and restores the pair if writing fails. Existing `generate --write` delegates to it. Guarded `set --write` and `apply-states --write` invoke it only after their canonical task and snapshot writes succeed. The `applyLightweightWorkRequest` boundary invokes it only after canonical atomic application, poststate verification, and receipt construction have returned committed success.

Backlog failure is outside every canonical rollback boundary. Guarded callers use their existing CLI exit/output channel: exit `2` and write exactly `[FAIL] canonical state committed; backlog refresh failed\n`. Autonomous application has no compatible end-to-end warning channel in the current closed contracts, so it catches only the derived refresh failure and returns the original exact `{ok:true, phase:"committed", receipt}` result. Existing backlog checking, its test/CI coverage, and the next successful coordinator refresh detect or repair the stale pair.

## Technical Context

- **Language/Version**: JavaScript ECMAScript modules with `// @ts-check`, Node.js 20 or newer
- **Primary Dependencies**: Node.js synchronous filesystem APIs; existing feature inventory, identity, task, task-state, workspace-path, backlog model/rendering, and Lightweight atomic application helpers
- **Storage**: Existing idea ledgers, canonical task files, task-state snapshot, and the two existing committed backlog artifacts; no new state or metadata
- **Testing**: `node:test` focused engine, lint, first-definition, backlog, board, host-boundary, and current-format contracts; full recursively discovered suite; artifact freshness; build parity; lint; compose and release verification; independent review
- **Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces
- **Project Type**: Dependency-free coordination runtime with source under `src/` and generated Copilot core under `.github/`
- **Constraints**: Synchronous only; preserve canonical authority; no broad writer interception; generated core only through `node scripts/build-dev.mjs`

## Specification Quality Validation

- The specification separates stale derived projections from false package-less lifecycle classification.
- Three P1 stories independently cover resolved lifecycle, immediate covered-path freshness, and post-commit failure authority.
- Acceptance scenarios include the lifecycle matrix, migration, claim and close through all three mutation families, excluded paths, pair rollback, and exact diagnostics.
- FR-001 through FR-020 state observable behavior without selecting source modules or filesystem implementation details.
- SC-001 through SC-010 are measurable, and no clarification marker remains.

The technology-agnostic specification passes its definition-time document gate by inspection. This is not a lint, execution, or readiness claim.

## Verified Current Topology

1. `src/skills/dude-engine/lib/feature.mjs` owns direct idea enumeration, frontmatter lifecycle validation, canonical `spec_path:` checks, exact defined-feature inventory, duplicate-owner diagnostics, and owner resolution. It currently accepts only draft and defined and pushes only valid defined records into `features`.
2. `src/skills/dude-lint/lint.mjs` does not need a second lifecycle parser. It imports `inventoryDefinedFeatures`, reports its diagnostics, and builds task audit ownership from returned defined features. Lifecycle production behavior should remain centralized in the engine; `src/skills/dude-lint/lint.test.mjs` pins lint-visible outcomes.
3. `src/skills/dude-feature-definition/publish-first-definition.mjs` validates a first-definition preimage and currently requires current draft plus empty path before any batch write. It should retain that closed transition and diagnose resolved input as requiring explicit reopen; it must not publish from resolved.
4. `src/skills/dude-feature-definition/SKILL.md`, `src/skills/dude-work-intake/SKILL.md`, `src/agents/dude-spec-lead.agent.md`, and `src/agents/dude.agent.md` currently describe first/still-draft and defined preservation but no package-less terminal state or reopen route.
5. `src/skills/dude-lightweight-execution/backlog.mjs` calls shared feature inventory, then independently marks lifecycle metadata available only for draft or defined. `collectLifecycleItems` derives owner-bound package detail; `deriveLifecycleModel` currently completes only defined packages whose tasks are all done.
6. The same backlog module already has the needed single derivation. `renderArtifacts({root})` returns the complete model, Markdown, and HTML in memory. `runGenerate` currently writes Markdown and then HTML directly with no pair rollback.
7. `src/skills/dude-lightweight-execution/board.mjs` owns guarded `set --write` and `apply-states --write`; each currently writes canonical `tasks.md`, updates `.dude/state/task-state.json`, prints success, and returns without refreshing backlog. `render --write` writes the board and snapshot but is explicitly excluded from this feature's refresh hooks.
8. The same board module owns `applyLightweightWorkRequest`. `commitLightweightWorkRequest` validates one closed request, atomically applies tasks, snapshot, and optional owner bytes, reacquires and verifies canonical poststate, validates `LightweightAtomicReceiptV1`, and currently returns exactly `{ok:true, phase:'committed', receipt}`. Its receipt-building `try` catches failures by restoring canonical preimages, so derived refresh cannot run inside that block.
9. `src/skills/dude-work/host-adapter-runner.mjs` drives both projection applications and the final task mutation through the semantic `apply-lane-effect` operation. `src/skills/dude-work/host-adapter.mjs` constructs the lane request, then calls `ports.laneOwner.apply`. The default trusted lane-owner port is exactly `applyLightweightWorkRequest`.
10. On successful lane application, `host-adapter.mjs` reads and validates only `laneResult.receipt`, stores only that receipt in its lane ledger, and returns the closed host product `{kind:'lane-receipt', receipt}`. `PRODUCT_FIELDS` and `validateAdapterProduct` allow no warning or diagnostic on that product.
11. The runner records only `productKind` in step summaries, extracts only `product.receipt`, commits that receipt, and later requests a separate closed `run-audit` product derived by the recovery runtime. The audit path does not inspect the backlog pair, and the CLI strips internal steps before emitting its final result. No lane refresh warning reaches runner output.
12. The accepted Feature 009 `LaneOperationResultV1` success schema contains exactly `ok`, `phase`, and `receipt`. The board boundary also documents that it returns exactly one such result. Adding `projectionDiagnostic` would extend a closed schema even though the host immediately discards it.
13. `.dude/ideas/core-dogfood-preview.md` is currently draft with an empty path, explicitly says no package is needed, and records that Feature 012 owns its documentation outcome. Its protected user sections end before the managed definition region and are migration invariants.
14. `scripts/current-format-contract.test.mjs` pins current source/generated ownership, lifecycle guidance, backlog behavior, and canonical command wording. Existing user documentation describes lifecycle and backlog generation across `README.md`, `docs/commands.md`, `docs/reference.md`, and `docs/workflow.md`.
15. Generated `.github/**` core is a projection of `src/**`. No generated core file is an authoritative edit target.

## Topology-First Reset Evidence

- **Production entry and call path**: `runHostAdapter` issues `apply-lane-effect` -> `createHostAdapter().run` dispatches to `applyLaneEffect` -> `ports.laneOwner.apply(laneRequest)` -> the default trusted port calls `applyLightweightWorkRequest` -> `commitLightweightWorkRequest` commits and validates canonical poststate plus receipt -> the host adapter keeps only the receipt -> the runner commits it, audits through the recovery runtime, and emits its closed final result.
- **Actors and controlled inputs**: the runner reacquires owner/task bindings and supplies the application; the host adapter controls permit/session binding and the trusted lane-owner port; the Lightweight lane owner alone controls canonical files and receipt construction; the backlog module alone derives and writes the non-authoritative pair.
- **Reachable failure**: after a valid canonical commit and receipt, either backlog write can fail. Canonical state must remain committed, while pair rollback leaves the older pair stale. No safety or authority failure occurs merely because that derived snapshot is stale.
- **Narrowest enforcement point**: the successful return from `commitLightweightWorkRequest`, inside the exported `applyLightweightWorkRequest` boundary, is the first point that both proves canonical commitment and still has the validated workspace root. Invoke refresh there in a separate local `try/catch`. Guarded commands use their existing post-write CLI branch as the narrowest reporting point.
- **No autonomous reporting point**: `LaneOperationResultV1`, the `lane-receipt` host product, runner step/result rows, and `run-audit` are all closed and carry no compatible lane warning. Extending them would cross four boundaries solely for a derived snapshot and is rejected under YAGNI.
- **Existing detection and repair**: `backlog.mjs check` byte-compares both committed artifacts with a fresh render and exits `3` for stale or missing output. `backlog.test.mjs` pins committed-repository freshness and CI runs every `*.test.mjs`; bundle lint validates lifecycle metadata but does not itself compare backlog bytes. The next successful coordinator projection refresh repairs the pair.
- **Focused falsifier**: force the second backlog write to fail after an autonomous commit; require exact canonical poststate and receipt, exact result keys `ok`, `phase`, and `receipt`, a normally accepted host receipt path, restored pair preimages, and `backlog.mjs check` exit `3`. Any current warning that survives this complete path into runner output would disprove the no-channel conclusion; source inspection shows none.
- **Stateful mechanism check**: no gate, store, checkpoint, journal, retry queue, or cross-session state covers an additional reachable need. Existing deterministic checking and the next refresh cover stale projection discovery and repair.

## Chosen Design

### 1. Closed lifecycle matrix

Use one exact matrix in shared feature inventory:

| Status | Valid `spec_path:` | Exact owner | Package lifecycle |
|---|---|---|---|
| `draft` | empty | no | eligible for explicit first definition |
| `defined` | one safe existing canonical specification path | yes | package-backed |
| `resolved` | empty unnormalized scalar value, with no owner or metadata diagnostic | no | terminal, intentionally package-less |

Add `resolved` to the accepted-status diagnostic text. Retain `frontmatter.scalars.get("spec_path")?.value` as `rawSpecPath` before `parseSpecIdentity` can collapse malformed nonempty text to null. Require `rawSpecPath === ""`. If a resolved ledger has any nonempty raw value, emit the dedicated resolved-path error without resolving that value into an owner. Malformed frontmatter retains the existing metadata diagnostic. Continue returning only valid defined records from `inventoryDefinedFeatures`; resolved never enters `features`, and every existing owner resolver therefore excludes it without a second branch.

The backlog's valid-resolved predicate is deliberately stricter than a status check:

```text
status === "resolved"
&& rawSpecPath === ""
&& ownerSpecPath === null
&& item-specific owner/metadata diagnostics are empty
```

An item that says `resolved` but fails any term is an invalid resolved candidate. It is lifecycle-unavailable/ambiguous and is barred from both the resolved-completion branch and the package-completion branch, even if a synthetic or contradictory owner/package signal is present. This prevents malformed nonempty path text from becoming false empty after normalization and prevents an ownership leak from becoming Completed.

Do not add `resolution:`, a reason object, a status alias, or another state file. The Coordinator Log remains the append-only provenance source.

Focused engine tests cover valid resolved; nonempty canonical, dangling, malformed, unsafe, and quoted-nonempty path text; non-exact status; malformed frontmatter; exact diagnostic behavior; mixed draft/defined/resolved inventory; duplicate defined owners with a resolved bystander; and zero resolved owners. Lint tests prove that delegated inventory accepts one canonical resolved ledger and rejects invalid resolved metadata without changing lint production code.

### 2. Preservation, explicit reopen, and first-definition refusal

Current lifecycle guidance gains exactly one supported reopen mechanism, not a new command: an explicit user request in the `brainstorm <slug>` lifecycle route that names reopening.

- An ordinary brainstorm refresh of resolved preserves `status: resolved` and the empty path, even when user-controlled prose is refreshed.
- An explicit brainstorm reopen changes resolved to draft, keeps the path empty, preserves user-controlled sections under ordinary brainstorm rules, updates managed definition content, and appends one lifecycle event.
- `define <slug>`, first-definition publication, redefinition, and Ship refuse a resolved target that has not first been reopened. They do not infer that new intent implies reopen.
- Draft-to-defined and defined preservation behavior remains unchanged.

Make the first-definition preflight's status failure explicit enough to distinguish a valid terminal resolved ledger from malformed metadata: resolved requires explicit reopen before first definition. Add a no-write test using a resolved current preimage and otherwise valid five-file stage.

Update only the current guidance surfaces that own this behavior:

- `src/skills/dude-feature-definition/SKILL.md`
- `src/skills/dude-work-intake/SKILL.md`
- `src/agents/dude-spec-lead.agent.md`
- `src/agents/dude.agent.md`

Ship target selection treats resolved as terminal and not a live package candidate. It points to explicit brainstorm reopen rather than silently selecting Work or definition.

### 3. Resolved backlog semantics

In `collectLifecycleItems`:

- retain the unnormalized `spec_path` scalar as `rawSpecPath`;
- derive `resolvedCandidate` from exact status alone and `resolved` only from the complete valid-resolved predicate above;
- make invalid resolved candidates lifecycle-unavailable/ambiguous and carry their existing item-specific diagnostics;
- leave `defined`, `specPath`, `tasksPath`, and package reads false or null for valid resolved;
- retain Coordinator Log, excerpt, display identity, and existing relationship evidence.

In `deriveLifecycleModel`, classify only `item.resolved === true` into Completed before blocked, active, ordered, or awaiting-definition checks. The package-completion branch additionally excludes every `resolvedCandidate`, so a contradictory owner or `packageComplete` fixture cannot bypass the guard. Invalid candidates flow through the existing unavailable/ambiguous presentation and never Completed. Do not create synthetic tasks or a package-complete surrogate.

Adapt both renderers through the shared model:

- summary and section membership count resolved once under Completed;
- Markdown uses the existing compact Completed entry;
- HTML uses package-less resolved wording, omits task counts, and never emits awaiting-definition text for the item;
- lifecycle detail marks definition and tasks not applicable while Done is reached;
- specification and task sections state that the outcome was resolved without a package rather than pretending source data is unavailable.

No current declared dependency exists on the migration target, so this feature does not invent new dependency-satisfaction semantics for resolved items. Existing display-only relationship and optional order handling remains unchanged.

Backlog regressions cover one valid resolved shape plus invalid nonempty canonical, malformed nonempty, leaked owner path, item-diagnostic, malformed-frontmatter, and non-exact-status shapes. Every invalid shape remains outside Completed in both Markdown and HTML; the leaked-owner fixture also sets `packageComplete: true` to prove the package branch cannot bypass the resolved-candidate guard.

### 4. Ordered migration of `core-dogfood-preview`

Migration is part of lifecycle delivery, not a package definition:

1. Land shared lifecycle validation, backlog model/rendering, first-definition refusal, and current lifecycle guidance in authoritative source.
2. Pass focused engine, lint, first-definition, backlog, and current-format tests.
3. Run `node scripts/build-dev.mjs` so the active generated engine and guidance understand resolved before the ledger changes.
4. Through the user-authorized Spec Lead lifecycle refresh, change only lifecycle metadata and managed definition content in `.dude/ideas/core-dogfood-preview.md`; preserve complete `## Idea`, `## Open Questions`, and `## Assumptions` bytes.
5. Set `status: resolved`, leave `spec_path:` empty, and append exactly one event such as `- <UTC date> - lifecycle resolved without a package; Feature 012 consumed and delivered the contributor-documentation outcome`.
6. Create no `.dude/specs/**` package for this ledger.
7. Procedurally regenerate both backlog artifacts after the lifecycle write, because lifecycle-refresh auto-hooking is deliberately outside this feature.

Add a current-format regression over the real migrated ledger that captures the protected sections, status/path, sole new resolution event, absent package, and absence from awaiting-definition output.

### 5. One synchronous pair-safe refresh

Export this one production API from `src/skills/dude-lightweight-execution/backlog.mjs`:

```js
refreshCommittedBacklog({ root })
```

It is synchronous and succeeds by returning normally or fails by throwing. No new result schema or persisted transaction record is needed.

Algorithm:

1. Call existing `renderArtifacts({root})` and complete both Markdown and HTML strings before resolving a write sequence.
2. Resolve the two canonical mutation paths using existing workspace safety helpers.
3. Capture each preimage as either exact bytes or missing. Reject unsafe or symlinked output paths through existing path rules.
4. Write `.dude/backlog.md`, then `.dude/backlog.html`.
5. If either write throws or post-write completion cannot be established, restore both surfaces: rewrite exact prior bytes for present preimages and remove only an artifact whose preimage was missing.
6. Rethrow the refresh failure after restoration. Never touch canonical task, snapshot, or owner surfaces in this rollback.

The implementation stays local to `backlog.mjs`; do not introduce a generic transaction framework. `runGenerate(root, {write:true})` delegates to the helper and retains the existing success message. Generate without write and `check` remain read-only.

Focused `backlog.test.mjs` coverage:

- both outputs are fully rendered before the first write;
- explicit generation delegates to the helper's pair behavior;
- present and missing preimages are handled;
- injected second-write truncation/failure restores both preimages exactly;
- a first-write or render failure does not leave an advanced pair;
- successful output equals `renderArtifacts` exactly.

### 6. Guarded post-commit hooks

Import the refresh helper into `src/skills/dude-lightweight-execution/board.mjs`.

For `set --write` and `apply-states --write`:

1. Keep existing canonical task and snapshot writes in their current authority order.
2. After both canonical writes succeed, call `refreshCommittedBacklog({root})` synchronously.
3. Print ordinary success and return zero only when refresh succeeds.
4. If refresh throws, do not restore canonical files and do not print the ordinary success line. Write exactly `[FAIL] canonical state committed; backlog refresh failed\n` to stderr and return the existing operation-error code `2`.

Do not add the call to `render --write`, `parse`, `ready`, `next`, `diff`, non-write `set`, non-write `apply-states`, or any failure path. A successful `apply-states --write` invokes refresh even when its applied count is zero, because the command is one of the explicitly covered successful write boundaries.

Board integration tests scaffold a defined owner and both backlog artifacts, then:

- claim an open task and require both artifacts to show Active;
- complete the final task and require both to show Completed;
- repeat equivalent classification checks through `apply-states --write`;
- inject the second backlog write failure and require exit `2`, the exact stderr line with no success line, restored pair, and committed tasks/snapshot;
- prove render writes, reads, dry runs, and rejected writes do not touch the pair.

### 7. Autonomous post-commit attempt and bounded observability

Keep backlog refresh outside `applyAtomically`, canonical poststate verification, receipt validation, and the `try` block whose catch calls `restorePreimages(files)`. Do not alter `LaneOperationResultV1`.

The exported `applyLightweightWorkRequest` boundary becomes the narrow hook:

1. Let `commitLightweightWorkRequest` validate the request, bind trusted surfaces, commit canonical tasks/snapshot/owner, verify postimages, and return its existing closed result.
2. If that result is refused or indeterminate, return it unchanged and make no backlog attempt.
3. If it is committed success, call `refreshCommittedBacklog({root: context.surfaces.root})` synchronously in a separate local `try/catch`; use the validated bound root, never the raw caller value.
4. If refresh succeeds, return the original result object.
5. If refresh fails after restoring the pair preimages, catch only that derived failure and still return the original result object.

The returned success remains exactly:

```js
{ ok: true, phase: "committed", receipt }
```

Do not add `projectionDiagnostic`, `warning`, `reason`, `unchangedPrestateHash`, a second receipt, console output, or another callback. Do not change `host-adapter.mjs`, `host-adapter-runner.mjs`, recovery audit schemas, or Feature 009 contracts. The result truthfully reports the authoritative lane commit; it makes no claim that every derived projection is current.

`src/skills/dude-lightweight-execution/board.test.mjs` covers autonomous initial claim and final completion with both artifacts matching a fresh poststate render. A second-write failure fixture proves pair restoration, committed task/snapshot/owner poststate, a still-valid receipt, and the exact three result keys with no refusal or unchanged-prestate fields. Existing refusal and atomic-apply failure tests continue to prove that no refresh occurs before canonical commit.

`src/skills/dude-work/host-adapter.test.mjs` adds one end-to-end regression over the unchanged production adapter/runner path: induce the derived refresh failure, require normal receipt application, commit, and audit rather than false refusal, then require `backlog.mjs check` to report the stale pair. This test proves the bounded limitation; it does not add an adapter channel.

### 8. Procedural limits and documentation

Automatic refresh in this feature covers only:

- guarded `board set --write`;
- guarded `apply-states --write`; and
- successful `applyLightweightWorkRequest`.

Coordinator Log-only writes outside that autonomous boundary, brainstorm/define/resolve/reopen writes, and `.dude/state/backlog-order.md` changes still require the existing procedural backlog generation step. Document this limitation explicitly. Do not hook every writer or imply continuously live artifacts.

Update minimal applicable text in:

- `src/skills/dude-lightweight-execution/SKILL.md`
- `README.md`
- `docs/commands.md`
- `docs/reference.md`
- `docs/workflow.md`
- `scripts/current-format-contract.test.mjs`

The current-format contract pins three statuses, the strict valid-resolved predicate, explicit reopen, the three automatic attempts, exact guarded stderr, unchanged autonomous result contracts, bounded observability, procedural exceptions, and source/generated ownership.

### 9. Generated core

After focused authoritative-source tests pass, run only `node scripts/build-dev.mjs` to refresh these nine generated counterparts:

- `.github/agents/dude-spec-lead.agent.md`
- `.github/agents/dude.agent.md`
- `.github/skills/dude-engine/lib/feature.mjs`
- `.github/skills/dude-feature-definition/publish-first-definition.mjs`
- `.github/skills/dude-feature-definition/SKILL.md`
- `.github/skills/dude-work-intake/SKILL.md`
- `.github/skills/dude-lightweight-execution/backlog.mjs`
- `.github/skills/dude-lightweight-execution/board.mjs`
- `.github/skills/dude-lightweight-execution/SKILL.md`

No `dude-work` production change is planned: the closed lane result, host product, runner result, and audit remain unchanged. The narrow end-to-end regression belongs in its source test only, and tests are not projected. Never hand-edit `.github/**` core. Run the development build twice over unchanged source and require the second run to produce no byte changes.

## Exact Source And Test Layout

### Production source

- `src/skills/dude-engine/lib/feature.mjs`
- `src/skills/dude-feature-definition/publish-first-definition.mjs`
- `src/skills/dude-lightweight-execution/backlog.mjs`
- `src/skills/dude-lightweight-execution/board.mjs`
- `src/skills/dude-feature-definition/SKILL.md`
- `src/skills/dude-work-intake/SKILL.md`
- `src/skills/dude-lightweight-execution/SKILL.md`
- `src/agents/dude-spec-lead.agent.md`
- `src/agents/dude.agent.md`

### Focused tests and contracts

- `src/skills/dude-engine/lib/feature.test.mjs`
- `src/skills/dude-lint/lint.test.mjs`
- `src/skills/dude-feature-definition/publish-first-definition.test.mjs`
- `src/skills/dude-lightweight-execution/backlog.test.mjs`
- `src/skills/dude-lightweight-execution/board.test.mjs`
- `src/skills/dude-work/host-adapter.test.mjs`
- `scripts/current-format-contract.test.mjs`

### Lifecycle and generated artifacts

- `.dude/ideas/core-dogfood-preview.md`
- `.dude/backlog.md`
- `.dude/backlog.html`
- the nine generated counterparts listed in Chosen Design section 9, produced only by `node scripts/build-dev.mjs`

### User documentation

- `README.md`
- `docs/commands.md`
- `docs/reference.md`
- `docs/workflow.md`

No new source module, documentation page, state file, definition supporting artifact, or migration package is planned.

The planned tracked scope is exactly 32 paths: 9 authoritative production/guidance sources, 7 focused test/contract files, 3 lifecycle/derived project artifacts, 4 user-documentation files, and 9 generated counterparts. `src/skills/dude-work/host-adapter.mjs`, `src/skills/dude-work/host-adapter-runner.mjs`, recovery/audit production, and Feature 009 contracts are evidence-only and remain unchanged.

## Verification Strategy

### Lifecycle and migration

1. Exercise the exact status/path matrix in `feature.test.mjs`, including raw nonempty and malformed paths, non-exact status, owner inventory, and resolver behavior.
2. Exercise lint over valid resolved and invalid nonempty-path or malformed-metadata ledgers.
3. Exercise first-definition publication with a resolved current preimage and prove no repository bytes change.
4. Exercise ordinary resolved preservation and explicit reopen wording through current-format contracts.
5. Classify valid and invalid synthetic resolved items in both renderers; require only the valid shape in Completed, no task count or awaiting-definition wording for it, and no Completed bypass for an invalid owner/package fixture.
6. After migration, compare protected-section bytes for the real `core-dogfood-preview` ledger, assert one Feature 012 event and no package, and assert exact Completed membership.

### Pair refresh and guarded mutations

1. Compare successful helper output byte-for-byte with `renderArtifacts`.
2. Inject a second HTML write failure after real truncation and compare both pair preimages.
3. Run guarded claim and final close; after each, compare both committed outputs to a fresh render and inspect Active or Completed membership.
4. Repeat with `apply-states --write`.
5. Inject pair failure after guarded canonical commit and assert canonical tasks and snapshot are poststate, pair is prestate, exit is `2`, stderr is the exact required line, and no success line is visible.
6. Instrument excluded paths and prove zero refresh writes.

### Autonomous mutations

1. Drive existing valid wrapper requests for initial claim and final completion through `applyLightweightWorkRequest`.
2. Require committed success, valid receipt, and both backlog artifacts equal to a fresh render after each commit.
3. Inject the second backlog write failure; require exact pair restoration and canonical poststate.
4. Require exactly the existing `ok`, `phase`, and `receipt` keys, with committed success and the original valid receipt and without any diagnostic or warning key.
5. Confirm existing atomic canonical failures still restore canonical preimages and never attempt backlog refresh.
6. Drive the failure through the unchanged host adapter and runner; require normal receipt application, commit, and audit, no false refusal or rollback, and `backlog.mjs check` exit `3` for the stale restored pair.

### Integrated acceptance

Over one unchanged integrated revision:

1. Run focused engine, lint, first-definition, backlog, board, host-adapter, and current-format tests.
2. Run the full recursively discovered `*.test.mjs` suite using the project-standard discovery that excludes `dist`.
3. Run `node scripts/build-dev.mjs` twice and require source/generated parity plus an idempotent second run.
4. Regenerate `.dude/backlog.md` and `.dude/backlog.html`, then require the backlog freshness check to pass.
5. Run `node .github/skills/dude-lint/lint.mjs .`.
6. Run compose verification, pristine release build and release lint, and `git diff --check` under existing project conventions.
7. Recheck the real migration: resolved status, empty path, byte-preserved protected sections, one Feature 012 event, absent package, Completed membership, no task counts, and absence from Ideas awaiting definition.
8. Inspect source for one pair writer, exactly three post-commit hooks, no refresh inside canonical rollback, and none of the prohibited extra machinery.
9. Route the unchanged diff and same evidence to an independent reviewer for lifecycle ownership, strict invalid-resolved exclusion, pair restoration, post-commit authority, exact guarded reporting, bounded autonomous observability, migration preservation, documentation limits, and YAGNI.

## Objective Registry

None. The feature adds one terminal scalar value and refreshes two existing derived artifacts at three existing boundaries; no long-lived objective or state machine applies.

## Supporting Artifacts

None. The specification, plan, and canonical tasks fully define the change.

## YAGNI And Complexity Check

| Reachable need | Selected mechanism | Rejected addition |
|---|---|---|
| Represent an outcome completed without its own package | One `resolved` scalar plus empty path and existing log provenance | Resolution object, package stub, state file, fourth status |
| Keep exact ownership unambiguous | Shared inventory returns only defined owners | Slug inference, special owner fallback, compatibility parser |
| Reopen only on user intent | Explicit request within existing brainstorm route | New command, automatic demotion, hidden transition |
| Keep two committed views together | Local two-preimage rollback in the existing backlog module | Generic transaction framework, store, journal |
| Refresh proven stale mutation paths | Three direct synchronous hooks | Watcher, event bus, interception of every writer |
| Preserve canonical success | Refresh after canonical commit and outside rollback | Coupled rollback or backlog authority |
| Handle autonomous projection failure without changing authority | Return the exact committed receipt; use existing freshness check/test/CI and next refresh for the derived pair | Lane-result, host-product, runner, audit, receipt, callback, or persistent incident extension |
| Keep Activity and lifecycle freshness honest | Document procedural regeneration | Speculative hooks for every log, definition, and order writer |

## Build And Migration Order

1. Add failing lifecycle, ownership, lint, publication, resolved rendering, and current-contract tests.
2. Implement shared resolved validation and backlog classification; update current lifecycle guidance.
3. Pass focused lifecycle tests, then run the development build so generated runtime accepts resolved.
4. Perform the authorized `core-dogfood-preview` lifecycle refresh with byte-preserved user sections and no package; procedurally regenerate the backlog pair.
5. Add pair-safety and covered/excluded hook tests.
6. Implement `refreshCommittedBacklog({root})`, delegate generate-with-write, and add guarded post-commit hooks and failure semantics.
7. Add the autonomous best-effort refresh attempt strictly after canonical receipt construction; pin the exact unchanged lane result and unchanged host/runner receipt path.
8. Refresh generated core through the development build and regenerate committed backlog artifacts.
9. Run integrated acceptance and independent review over one unchanged revision.

Rollback during implementation is by coherent source change, generated projection, migration ledger, and backlog artifact group. Runtime pair failure restores only the pair; it never rolls back canonical mutation state.

## Risks

- **Rollback-boundary inversion**: Calling backlog refresh inside the current autonomous receipt `try` would cause its catch to restore canonical state. Keep refresh after receipt validation and outside that catch.
- **Split pair after write failure**: A second write can truncate before throwing. Capture both preimages first and restore both, including prior absence.
- **False resolved completion**: Normalizing a malformed nonempty path to null, or trusting a contradictory owner/package signal, could classify an invalid resolved ledger as Completed. Retain the raw scalar, require the full valid-resolved predicate, and bar every resolved candidate from package completion.
- **Silent terminal demotion**: Reusing draft-default brainstorm wording could reopen resolved ideas unintentionally. Pin preservation and explicit reopen in guidance and contracts.
- **Migration before runtime support**: Generated lint currently rejects resolved. Build authoritative support into generated core before refreshing the real ledger.
- **Misleading resolved detail**: Existing HTML treats every non-defined item as awaiting definition. Add explicit package-less resolved branches for ribbon, counts, definition, and task detail.
- **Overbroad freshness promise**: Coordinator Activity, lifecycle, and order writers remain outside automatic hooks. State that limitation in runtime guidance and docs.
- **Invented autonomous channel**: Adding a field at the lane boundary would still be discarded by the closed host product and runner path unless several accepted schemas changed. Keep those files unchanged and document the bounded limitation.
- **Generated drift**: Multiple authoritative source surfaces project into `.github/`. Use only build-dev and prove an idempotent second build.

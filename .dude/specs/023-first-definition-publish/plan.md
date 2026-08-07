# Implementation Plan: First-Definition Publish

## Summary

Add one coordinator-only executable at `src/skills/dude-feature-definition/publish-first-definition.mjs`. It is the missing production edge from the first-definition procedure to the existing `applyAtomicFileBatch` transaction.

The executable consumes one fixed coordinator-owned temporary stage, validates only the reachable first-owner transition, constructs exactly four changes, and delegates destination containment, missing-parent creation, expected-state races, writes, and rollback to `applyAtomicFileBatch`. Its fixed synchronous `afterApply` closure runs the sibling definition linter against the workspace root. No caller-supplied function can mutate a fifth path.

Update the authoritative first-definition procedure, pin its executable and cleanup contract, and project the source changes through `scripts/build-dev.mjs`. Feature 023 itself uses a one-time coordinator bootstrap because the executable does not exist until after this package is published.

The canonical feature identity is `.dude/specs/023-first-definition-publish/spec.md`, prospectively owned by `.dude/ideas/first-definition-publish.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM, synchronous filesystem and child-process operations, and `node:test`.

**Primary Dependencies**: Existing `applyAtomicFileBatch`, shared frontmatter and Markdown-visibility primitives, the sibling `dude-lint/lint.mjs`, and source-to-`.github/` projection through `scripts/build-dev.mjs`.

**Storage**: One coordinator-owned operating-system temporary directory, the selected idea ledger, and the three new package-core files. The temporary stage is always deleted and no receipt or transaction state remains.

**Testing**: A new spawned-executable test at `src/skills/dude-feature-definition/publish-first-definition.test.mjs`; section-bound procedure assertions in `scripts/current-format-contract.test.mjs`; projection parity through `scripts/build-dev.test.mjs`; the full discovered suite; lint; and independent review.

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces.

**Project Type**: Reusable coordination bundle core.
**Performance Goals**: Complete exactly one local four-file publication transaction per invocation; no latency or throughput target applies beyond ordinary local CLI completion.

**Constraints**: `src/` is authoritative. Generated `.github/` core files come only from `node scripts/build-dev.mjs`. The existing atomic helper remains the transaction owner and is not duplicated.

## Spec Quality Validation

- The specification defines three independently testable P1 stories: successful first publication, pre-mutation refusal, and exact rollback after final validation failure.
- Acceptance scenarios cover the fixed four-artifact result, owner transition, expected-missing package state, protected intent, append-only definition event, final validation, and restoration.
- FR-001 through FR-010 state observable behavior without naming implementation modules, commands, data structures, or generated paths.
- SC-001 through SC-006 are measurable, and no clarification markers remain.
- Exclusions are limited to generalized or arbitrary publication surfaces.

The specification satisfies its definition-time document gate by inspection. This is not a lint or readiness claim.

## Guardrail And Smallest-Design Check

The binding guardrail is to choose the smallest design satisfying proven requirements and reject speculative capability without a current production caller.

| Kept | Reachable need | Proof |
|---|---|---|
| One coordinator-only executable | The current first-definition path is procedural and has no executable edge to the existing atomic transaction. | SC-001 |
| Narrow owner-transition preflight | A stale draft or malformed staged owner can establish the wrong first owner. | SC-002 |
| Existing atomic transaction | Parent creation, expected-missing races, exact writes, and rollback already exist. | SC-001, SC-003 |
| Fixed rollback-bound lint | Global package defects become visible only after the prospective owner and package coexist. | SC-003, SC-006 |
| Spawned executable and section-contract coverage | The production edge and coordinator cleanup procedure must fail if removed or weakened. | SC-006 |

Rejected designs:

- A reusable publication helper added to the atomic module or any generalized publication API.
- Subcommands, arbitrary path arrays, additional supporting artifacts, `--force`, or caller-selected validation.
- Caller-supplied callbacks or any extension point capable of mutating a fifth path.
- A second transaction engine, receipt, manifest, registry, hash ledger, persistent stage, or workflow state.
- Package-to-idea slug matching or duplicate global owner, task, breadcrumb, or managed-fence parsers.
- Redefinition, changed-intent recovery, tracked execution, or another execution lane.
- New generic atomic-helper tests for behavior already covered by the existing helper suite.

## Chosen Design

### 1. Coordinator-only executable

Create:

`src/skills/dude-feature-definition/publish-first-definition.mjs`

The coordinator invokes its generated projection only in this form:

```text
node .github/skills/dude-feature-definition/publish-first-definition.mjs --root . --idea .dude/ideas/<slug>.md --spec .dude/specs/<NNN>-<package>/spec.md --stage <absolute-temporary-directory>
```

The parser accepts exactly the four named options once and rejects missing, repeated, or additional arguments before reading or writing. The stage path must be absolute. The idea and specification arguments must have their direct current-format path shapes, but their slug segments are never compared.

The executable exposes no reusable publication function. It writes nothing to standard output until the transaction and lint have succeeded, then writes the exact specification path followed by one newline.

### 2. Fixed temporary stage and byte reads

The coordinator creates one operating-system temporary directory containing exactly these five regular entries and no nested content:

- `current-idea.md`
- `staged-idea.md`
- `spec.md`
- `plan.md`
- `tasks.md`

The executable reads all five with `fs.readFileSync` and retains their exact `Buffer` values. It does not decode and reconstruct artifact content; decoding is limited to the narrow frontmatter and visible-heading slices needed for transition checks.

`current-idea.md` is the expected preimage for the selected idea. The other four entries are the exact staged destination bytes.

### 3. Narrow transition validation

Before atomic application, validate only the first-definition conditions reachable through this command:

1. `current-idea.md` is a direct current-format draft with an empty `spec_path:`.
2. `staged-idea.md` changes to `status: defined` and the exact `--spec` value.
3. Title and slug are unchanged.
4. The complete byte ranges for `## Idea`, `## Open Questions`, and `## Assumptions` are unchanged.
5. The staged Coordinator Log preserves the exact current prefix and adds exactly one complete definition event.

The actual workspace idea must still equal `current-idea.md`; that exact expected-state check is performed by `applyAtomicFileBatch` before mutation and again before each rename.

Do not validate package-to-idea slug equality. Do not parse package ownership, the task breadcrumb, task grammar, or managed-fence validity here. The fixed linter owns global owner uniqueness, exact breadcrumb validation, canonical task grammar, and managed regions after the four destinations coexist.

### 4. Atomic application and fixed lint

Construct exactly these four changes:

- `--idea`: expected `current-idea.md`, staged `staged-idea.md`.
- `--spec`: expected missing, staged `spec.md`.
- The specification path's sibling `plan.md`: expected missing, staged `plan.md`.
- The specification path's sibling `tasks.md`: expected missing, staged `tasks.md`.

Pass them to `applyAtomicFileBatch`. The existing helper owns destination containment, safe parent creation, expected-missing checks and races, temporary sibling writes, exact renames, restoration, temporary cleanup, and removal of helper-created empty directories.

Supply one fixed synchronous `afterApply` closure as the helper's second argument. The closure invokes the sibling `dude-lint/lint.mjs` with the workspace root using the active Node executable and no shell. A launch error, signal, or nonzero exit throws inside the atomic boundary. Lint output is captured so successful standard output remains the exact specification path only.

The closure is defined by the executable and accepts no caller input. The atomic helper's return value is ignored, and no receipt or state is emitted.

### 5. Coordinator procedure and cleanup

Update only `## First Definition Transaction` in `src/skills/dude-feature-definition/SKILL.md` as needed:

1. The Spec Lead returns the complete five-entry stage without writing.
2. The coordinator rechecks prospective selection and creates the operating-system temporary directory.
3. The coordinator writes the five exact stage entries and invokes the command in section 1.
4. The executable applies the owner plus core trio and runs lint inside rollback.
5. A `finally` path deletes the temporary directory recursively on success and failure.
6. Only the exact specification path printed after successful lint may be treated as publication success.

The procedure must not preserve the stage or run a second publication path.

### 6. Verification design

#### Spawned executable success

In `src/skills/dude-feature-definition/publish-first-definition.test.mjs`, spawn the real executable as a child process against an isolated lint-clean workspace. Assert:

- zero exit status and standard output equal to the exact specification path plus one newline;
- exact bytes at the owner and three package destinations;
- the new package contains only the core trio;
- an unrelated sentinel and every other workspace artifact remain unchanged.

#### Rollback after lint failure

Use an otherwise valid stage whose task ownership breadcrumb is malformed. Assert that lint fails after application and causes:

- nonzero exit with no success path on standard output;
- exact restoration of the draft;
- absence of all three package files and the package directory;
- an unchanged unrelated sentinel.

This proves global task validation is delegated to lint and lint remains inside rollback.

#### Preflight mutation table

Derive each row from one valid stage and snapshot the complete workspace before invocation. Cover stale preimage, an existing target, invalid current draft state, wrong staged status, wrong staged path, changed title, changed slug, a change to each protected section, rewritten prior log bytes, a missing append, and an incomplete or additional append. Every row must exit nonzero and leave the snapshot unchanged.

These are transition-gate mutation checks, not generic atomic-helper tests.

#### Section-bound procedure contract

Extend `scripts/current-format-contract.test.mjs` to bind `## First Definition Transaction` to:

- the exact generated command;
- the exact five-entry operating-system stage;
- cleanup on success and failure;
- exactly the owner plus `spec.md`, `plan.md`, and `tasks.md`;
- fixed lint inside the rollback boundary.

Each obligation must have a focused deletion or relocation mutation that makes its owning assertion fail. Inventory the new source executable where the existing active-source contract requires it.

### 7. Build projection

Run `node scripts/build-dev.mjs`. Existing source discovery must produce byte-identical projections at:

- `.github/skills/dude-feature-definition/publish-first-definition.mjs`
- `.github/skills/dude-feature-definition/SKILL.md`

Tests remain source-only. No edit to `scripts/build-dev.mjs` is expected unless its existing source discovery fails to project the new executable.

### 8. One-time Feature 023 bootstrap

The shipped executable cannot publish the package that defines it. After accepting this four-path stage, the coordinator performs one operational bootstrap:

1. Create a coordinator-owned operating-system temporary directory using the section 2 layout.
2. Reverify the prospective owner and exact staged bytes.
3. Invoke `applyAtomicFileBatch` directly once with the same fixed four changes and a fixed synchronous lint invocation inside `afterApply`.
4. Delete the temporary directory in `finally`, whether application succeeds or fails.

This bootstrap is a handoff operation only. It adds no repository script, reusable capability, receipt, state, or persistent stage.

## Objective Registry

This feature has no measurable task-keyed runtime objective. Zero active registry regions is the applicable `none` case.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No additional supporting artifact is created.

## Source Layout

Authoritative source:

- `src/skills/dude-feature-definition/publish-first-definition.mjs`
- `src/skills/dude-feature-definition/publish-first-definition.test.mjs`
- `src/skills/dude-feature-definition/SKILL.md`
- `scripts/current-format-contract.test.mjs`

Existing dependency, reused without a new publication API:

- `src/skills/dude-feature-definition/atomic-file-batch.mjs`

Generated only through `node scripts/build-dev.mjs`:

- `.github/skills/dude-feature-definition/publish-first-definition.mjs`
- `.github/skills/dude-feature-definition/SKILL.md`

The one-time Feature 023 bootstrap is not a source artifact.

## Phases

- **Phase 1 - Executable and focused tests (T001@65786563)**: add the coordinator-only executable and spawned success, rollback, and preflight-mutation coverage.
- **Phase 2 - Procedure, contract, and projection (T002@77697265)**: update the first-definition procedure, add section-bound contract mutations, and project source through `build-dev`.
- **Phase 3 - Acceptance (T003@61637074)**: run integrated validation, inspect the bounded surface and bootstrap absence, and obtain independent review.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@65786563 | US1, US2, US3 | FR-001 through FR-010 | Spawned executable success, transition mutation table, and lint-failure rollback |
| T002@77697265 | US1, US3 | FR-001, FR-002, FR-008, FR-009, FR-010 | Section-bound procedure mutations and source-built projection |
| T003@61637074 | US1, US2, US3 | FR-001 through FR-010 | Full suite, lint, exact-surface inspection, and independent review |

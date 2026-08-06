# Implementation Plan: Runner Reason-Code And Coverage Fix

## Summary

Two small, localized edits to the deterministic unattended runner, plus two runner tests that prove them through the real production path. No new subsystem, artifact, or state.

First, the host-exchange failure path currently reuses whatever reason code the failure carried as the runner's own halt reason. Constrain it with a frozen runner-owned exchange-reason allow-list so a caller-supplied foreign code can never become the halt reason, while the runner's three legitimate exchange-failure codes still pass through.

Second, the fallback terminal the runner emits when it cannot continue omits the target it orphaned. Add the already-bound target to that fallback row. It is a row field, distinct from the evidence-derived halt report, so the Feature 013 halt-report contract is untouched.

Both edits sit on the single production path `runHostAdapter -> exchange -> orphan -> finish`. `src/` is authoritative; `node scripts/build-dev.mjs` projects the runtime edit into `.github/skills/dude-work/host-adapter-runner.mjs`.

The canonical feature identity is `.dude/specs/022-runner-reason-code-coverage-fix/spec.md`, owned exactly by `.dude/ideas/runner-reason-code-coverage-fix.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM, `node:test`. A localized runtime change plus tests; no new dependency.

**Primary Dependencies**: Node built-ins and the existing `build-dev` projection. No new module, package, or tool.

**Storage**: None. No file, state surface, board, or record is added or read.

**Testing**: Two added runner tests in `src/skills/dude-work/host-adapter.test.mjs`, both driven through `runHostAdapter`; projection parity via `scripts/build-dev.test.mjs`; the full discovered suite `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`; `dude-lint`; one fresh independent review.

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces.

**Project Type**: Reusable coordination bundle core (the unattended-work runner).

**Performance Goals**: None affected. The change adds a set membership check and one cloned field on an already-terminal path.

**Constraints**: `src/` is authoritative and `.github/` core comes only from `node scripts/build-dev.mjs`; generated files are never hand-edited. Preserve the runner's "owns the stop and its attribution" contract and the Feature 013 evidence-derived halt-report contract exactly.

## Spec Quality Validation

- The specification is technology-neutral and carries three independently testable stories: runner-owned attribution on exchange failure, the fallback terminal identifying its target, and the covering regression plus integration evidence.
- Acceptance scenarios cover a foreign code replaced by the runner-owned default, a legitimate runner-owned code passing through, the no-usable-code default, the fallback naming its target, and the evidence-derived halt report staying unchanged.
- FR-001 through FR-006 define runner-owned-only attribution, the legitimate-code passthrough, the target on the fallback distinct from the report, the regression check, the integration check from the real writer, and the preservation of the halt-report contract without reopening Feature 013.
- SC-001 through SC-006 are measurable without naming an implementation.
- Edge cases, key entities, assumptions, and out-of-scope items are complete. There are no unresolved clarification markers and no implementation detail in the specification.

The specification passed its definition-time document gate before this plan was written. That is a document gate, not a lint or execution-readiness claim; coordinator lint remains pending.

## Guardrail And Smallest-Design Check

The binding project guardrail is: "Choose the smallest design that satisfies proven requirements; reject speculative abstractions, state, schemas, or safeguards without a concrete failure mode or acceptance test."

This fix complies by construction. Each of the two defects is a concrete reachable failure through the production entry point, and each edit is the smallest change that closes it and is paired with a covering test.

| Kept | Concrete reachable failure it prevents | Acceptance proof |
|---|---|---|
| Frozen runner-owned exchange-reason allow-list in the exchange-failure catch | A caller-supplied `exchange` throws an error whose foreign `code` becomes the runner's terminal halt reason, corrupting the attribution the runner owns. | SC-001, SC-002; regression test (T002) |
| `target: clone(target)` added to the `orphan()` fallback row | The fallback terminal omits the target it orphaned, so a coordinator cannot attribute the unfinished run. | SC-003; integration test (T002) |
| Regression + integration tests via `runHostAdapter` | Both defects are silently reversible without standing coverage from the real terminal writer. | SC-004, SC-005 |

Rejected as speculative, with the reason:

- **A broader recovery or attribution refactor.** Out of scope; only the two named defects have a demonstrated reachable failure here.
- **Sanitizing or namespacing arbitrary caller codes.** A closed allow-list with a runner-owned default is smaller and strictly safer than any transform of untrusted input.
- **Propagating the target into the evidence-derived halt report.** The report is evidence-derived and contract-frozen by Feature 013; the target belongs on the fallback row only.
- **A new fixture or harness for the integration test.** The production entry point is directly drivable, so a real integration test needs no new artifact.

No new durable project guardrail is proposed. No new persistent workflow artifact is created.

## No-New-Artifact Justification

The implementation edits one existing runtime module and one existing test file, then regenerates that module's `.github/` projection. It adds no new skill file, agent file, state file, board, command, execution lane, or registry, and introduces no stored form. The "no new artifact" criterion (SC-006) holds by construction.

## The Fix

### 1. Runner-owned exchange-reason allow-list (attribution)

In `src/skills/dude-work/host-adapter-runner.mjs`, define a frozen module-level set of the runner's own exchange-failure reason codes:

`{ supervisor-context-lost, challenge-response-invalid, exchange-context-lost }`

These are exactly the codes the runner itself raises: `supervisor-context-lost` on standard-input EOF while a challenge is outstanding, `challenge-response-invalid` on a malformed or over-length response, and `exchange-context-lost` as the default. In the exchange-failure catch (around lines 592-601), replace the current `typeof code === 'string' ? code : 'exchange-context-lost'` with a check that uses the caught code only when it is a string and a member of the allow-list, otherwise the runner-owned default `exchange-context-lost`. This closes the leak of a caller-supplied foreign code while the three legitimate codes still pass through unchanged.

### 2. Target on the fallback row (attribution of what was orphaned)

Add `target: clone(target)` to the `orphan()` row fields in `src/skills/dude-work/host-adapter-runner.mjs` (around lines 440-453), in both the `adapter === null` (`initialStateResult`) branch and the adapter-snapshot (`stateResult`) branch, so every fallback terminal carries the target. `target` is bound once at line 327 and is always in scope; `stateResult`/`initialStateResult` spread `...fields` with no field allow-list, so the addition is safe. `finish` derives `haltReport` from `describeUnattendedHalt({ state, reason }, currentInspection)` and never reads the row's `target`, so the evidence-derived report — including Feature 013 T006 A's assertion that an unresolvable target is named unresolved with no top-level `haltReport.target` — is unchanged.

## Topology Confirmation

Production entry point `runHostAdapter` -> `exchange()` -> `orphan()` -> `finish(row)`, the single terminal safety writer through which every terminal result flows. Both edits sit on that path. The controlling untrusted input is the caller-supplied `dependencies.exchange`. The integration test drives `runHostAdapter(request, { exchange })` directly — the existing suite already exercises this exact pattern (for example the Feature 013 T006 A orphan case) — so the real terminal writer is reachable and a genuine integration test is used. No documented-boundary fallback is needed; the idea's fallback was conditional on unreachability, which does not hold.

## Objective Registry

This feature has no measurable, task-keyed runtime objective. A localized attribution bug fix exposes nothing a runtime evaluator reads. Per `dude-feature-definition`, zero markers is the valid `none` case, so this plan carries no active `dude:objective-registry` region.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No research, data model, API or schema contract, quickstart, or checklist is materially useful for this bounded fix. No supporting artifact is created.

## Source Layout

Core source (authoritative edit surface):

- `src/skills/dude-work/host-adapter-runner.mjs`

Tests:

- `src/skills/dude-work/host-adapter.test.mjs`

Generated only (produced by `node scripts/build-dev.mjs`, never hand-edited):

- `.github/skills/dude-work/host-adapter-runner.mjs`

No feature package, `.dude/state`, agent file, command parser, pack, or other execution surface is an implementation write target.

## Phases

- **Phase 1 - Code fixes (T001@636f6465)**: apply the runner-owned exchange-reason allow-list and add the target to the fallback row in the runner module.
- **Phase 2 - Coverage (T002@74657374)**: add the arbitrary-error-code regression test and the integration test from the real terminal writer, project with `build-dev`, and run the full suite.
- **Phase 3 - Acceptance (T003@67617465)**: run the full validation set, prove no new artifact and an unchanged halt-report contract, and obtain fresh independent review.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@636f6465 | US1, US2 | FR-001, FR-002, FR-003, FR-006 | Allow-list + target edits on the `orphan`/`exchange` path; projection parity |
| T002@74657374 | US1, US2, US3 | FR-001 through FR-006 | Regression + integration tests via `runHostAdapter`; full suite |
| T003@67617465 | US1, US2, US3 | FR-001 through FR-006 | Full suite, lint, no-new-artifact diff, unchanged halt-report contract, independent review |

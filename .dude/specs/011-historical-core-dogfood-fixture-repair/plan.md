# Implementation Plan: Historical Core Dogfood Fixture Repair

## Summary

Repair the existing transient packet repository fixture in `scripts/current-format-contract.test.mjs` so it explicitly reconstructs the accepted historical pre-materialization T009 repository identity and generated projection inside its disposable clone. Keep current policy, state, and test inputs only where the permanent assertions need them, and reuse the file's existing Git, materializer, projection, mutation, and cleanup helpers.

The implementation changes one test file. It creates no reusable framework or persistent fixture, changes no production or generated source, and derives no Core Dogfood terminal.

Canonical feature identity is `.dude/specs/011-historical-core-dogfood-fixture-repair/spec.md`.

## Technical Context

**Language/Version**: Dependency-free JavaScript ES modules on Node.js >= 20.

**Primary Dependencies**: Node built-ins, Git invoked through the test file's existing helper, and the existing materializer/projection functions already imported by `scripts/current-format-contract.test.mjs`. No package or module is added.

**Storage**: None. Every repository and reconstruction artifact remains under the existing operating-system temporary directory lifecycle and is removed after each test.

**Testing**: Node's built-in test runner against the six exact names in `scripts/current-format-contract.test.mjs`, followed by the repository's recursively discovered full suite.

**Target Platform**: Maintainer worktrees and CI runners supported by the repository, with Git history available to the transient clone.

**Project Type**: Reusable bundle repository with a test-only contract repair. No production or generated source is changed.

**Performance Goals**: Preserve the current test shape and bounded temporary-repository lifecycle. Add no extra persistent setup and no repository-wide framework; one explicit historical reconstruction per fixture construction is acceptable.

## Guardrail Check

| Guardrail | Plan response |
|---|---|
| Prefer deterministic scripts for reproducible validation | Historical identity and projection are reconstructed and compared through existing deterministic Git and projection helpers; focused selection uses six exact anchored names. |
| Keep model-facing instructions concise and non-redundant | No instruction, agent, policy, or skill file changes. |
| Choose the smallest design that satisfies proven requirements | Change only the controlling fixture or its immediate in-file helper, retain the six tests and mutation matrix, and add no framework, module, command, state, or persistent artifact. |

No new guardrail is proposed.

## Implementation Boundary

The sole implementation write path is:

- `scripts/current-format-contract.test.mjs`

The implementation must not write `.github/**`, `src/**`, production policy, generated output, the materializer, commands, schemas, runtime code, `.dude/state/**`, or any Feature 008, Feature 009, or Feature 010 idea, package, task, log, or state artifact.

No active ObjectiveRegistry is needed. This feature has no runtime progress objective.

## Selected Design

1. **Repair the controlling fixture in place.** Modify `createTransientPacketRepositoryFixture()` or only its immediate test-local helpers. Do not add a module or another fixture system.
2. **Make event phase explicit.** Inside the disposable clone, reconstruct the accepted historical pre-materialization T009 repository identity and generated projection before deriving packet facts. Ambient current head and current green parity must not define the event under test.
3. **Keep permanent assertion inputs current where required.** Continue to overlay the live Feature 008 policy, workflow state, and test bytes needed to execute the current six assertions, while keeping the reconstructed historical identity/projection as the event authority. The overlay executes the permanent contract; it does not redefine event chronology or generated prestate.
4. **Reuse existing mechanics.** Use the file's existing Git checkout/object, fixture write, materializer, source-to-generated mapping, projection, identity, mutation, clone, and cleanup helpers. Add only the smallest immediate helper if the controlling function would otherwise become unclear.
5. **Preserve the assertion surface.** Keep all six exact test declarations and every existing positive and invalid-case assertion. Do not change expected rejection codes merely to obtain green results. Ordinary and later-feature packet checks remain unchanged.
6. **Prove non-vacuity with a disposable control.** After the repaired focused run passes 6/6, use a temporary copy or controlled fixture mutation that removes the explicit reconstruction or substitutes ambient current head and green parity. Run the same exact six-name selection and require 0/6 to pass. Discard the control; do not commit a bypass mode, waiver, skip, or expected-failure path.
7. **Leave no residue.** Preserve `try/finally` cleanup and verify no fixture repository, packet, workflow mutation, accepted evidence, or generated output survives the test process.

## Focused Verification

Select exactly the six protected tests with one anchored expression:

```bash
FOCUSED_PATTERN='^(?:T007 Core Dogfood valid live 20-path event passes every transient packet gate|T007 Core Dogfood requires exact main checkout baseline continuity and terminal readiness|T007 Core Dogfood derives current authority and rejects generic approval interruption and drift|T007 Core Dogfood compares the complete temp-materializer projection and cleanup inventory|T007 Core Dogfood pre-materialization verification isolates one exact parity delta|T007 Core Dogfood appends rechecks selects latest accepted evidence and blocks every close drift)$'
node --test --test-name-pattern="$FOCUSED_PATTERN" scripts/current-format-contract.test.mjs
```

The normal repaired fixture must report six selected passes. The disposable ambient-current control must report six selected failures. A selector that finds any other count is invalid evidence.

## Full Validation

After focused verification and the disposable non-vacuity control:

```bash
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
git diff --check
```

Inspect the complete diff and require the feature implementation write set to contain only `scripts/current-format-contract.test.mjs`. Preserve unrelated pre-existing user changes without adopting or reverting them. Obtain independent review of the six exact tests, invalid mutation matrix, ordinary/later-feature gates, transient cleanup, non-vacuity evidence, and prohibited-boundary preservation.

Feature 010 remains separately owned and is neither mutated nor closed by any validation step. A green full suite only removes its external test-suite blocker.

## Phases

| Phase | Outcome | Task |
|---|---|---|
| 1 | The existing valid-event fixture explicitly reconstructs the historical pre-materialization event; all six exact tests pass and the ambient-current control fails 0/6. | T001@66697874 |
| 2 | The recursively discovered suite, Dude lint, diff checks, scope inspection, and independent review all pass without mutating Feature 010. | T002@76616c69 |

## Traceability

| Requirement | Design decision | Task |
|---|---|---|
| FR-001, FR-003, FR-006 | 5 and focused exact-name selection | T001@66697874 |
| FR-002, FR-007, FR-008 | 1 through 4 and 7 | T001@66697874 |
| FR-004, FR-005, FR-012 | 3 through 5 | T001@66697874, T002@76616c69 |
| FR-009 | 6 | T001@66697874 |
| FR-010, FR-011 | Full validation and separate ownership boundary | T002@76616c69 |
| SC-001 through SC-003 | Focused pass, disposable control, and retained mutation matrix | T001@66697874 |
| SC-004 through SC-006 | Full suite, scope checks, and independent review | T002@76616c69 |

## Complexity Tracking

No complexity exception is claimed. A reusable historical-fixture framework, new module, persistent fixture store, command, schema, migration, or production change would exceed the proven need and is rejected.

## Omitted Artifacts

- `research.md`: root cause and controlled evidence are already settled in the owner idea and specification assumptions.
- `data-model.md`: no production or persistent data shape changes.
- `contracts/api.md` and `contracts/schemas.md`: no API, command, event, or schema contract changes.
- `quickstart.md`: no user workflow or setup changes.
- Test, security, UX, and OWASP checklists: this is one bounded test fixture repair with verification fully carried by the two canonical tasks.

## Out Of Plan

- Any edit to `.dude/specs/008-*`, `.dude/specs/009-*`, their owners, logs, tasks, or state.
- Any edit to Feature 010 state, tasks, promoted source, generated core, or close evidence.
- Any edit to `.github/**`, `src/**`, production policy, materializer code, commands, schemas, runtime, or generated output.
- Any assertion deletion, weakening, skip, filter, retry, or expected-failure waiver.
- Any rewrite of historical audit evidence or persistence of reconstructed authority.
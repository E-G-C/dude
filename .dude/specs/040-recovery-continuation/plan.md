# Implementation Plan: Recovery Continuation

## Summary

Clarify the existing autonomous Work contract at its current prompt-owned
iteration boundary. A clean per-task `ended` result with reason `task-settled`
means that one task completed; while the original autonomous coordinator
invocation remains live, it is progress rather than a whole-Work stop. The
coordinator selects the next ready task in the lane detected at Work start,
retains the original target and normalized policy, and obtains a fresh claim for
that task.

The clarification applies after bounded manual assistance only when the original
supervisor, context, and independently retained invocation identity survive
through completion of the recovered task. Existing verification, independent
review, settlement, closure, stops, budgets, learning governance, and continuity
rules remain unchanged. The implementation is one authoritative Work-skill
refinement plus focused current-format contracts and generated projection. It
adds no runtime or public-documentation change.

The canonical feature identity is
`.dude/specs/040-recovery-continuation/spec.md`, prospectively and exactly owned
by `.dude/ideas/recovery-continuation.md`.

This feature has no task-keyed runtime objective and no active ObjectiveRegistry
region.

## Technical Context

**Language/Version**: Markdown skill authority and dependency-free ECMAScript
module contract tests under Node.js 20 or newer

**Primary Dependencies**: Existing `dude-work` iteration, stop, supervisor
continuity, and checkpoint-cleanup contracts; existing Ship-to-Work policy
handoff; section-aware current-format contract helpers; source-to-dev projection

**Storage**: N/A. Reuse existing transient invocation and task-claim authority.
Add no project state, checkpoint type, registry, ledger, or audit carrier.

**Testing**: Focused section-bounded prose contracts with labeled deletion and
weakening falsifiers; complete current-format contract file; development-build
projection and idempotence; source/generated parity; workspace lint and diff
hygiene; the ordinary broader repository gate later in feature completion

**Target Platform**: GitHub Copilot in supported Dude workspaces, with Node.js
maintenance checks on macOS, Linux, and Windows

**Project Type**: Reusable Markdown multi-agent coordination bundle with
authoritative core under `src/` and generated dogfood core under `.github/`

**Performance Goals**: No runtime performance target applies. The change adds no
runtime loop, model call, background process, or persistent read/write.

**Constraints**: Keep Work sequential; preserve one-time lane detection and the
original target and normalized policy; require a fresh claim for each next task;
leave guarded Work and Feature 039's pre-Work boundary unchanged; generate
`.github/` only with `node scripts/build-dev.mjs`

## Specification Quality Validation

- Three prioritized, independently testable stories cover successful
  same-invocation continuation, unchanged stops and completion gates, and the
  surviving authority boundary.
- Acceptance scenarios explicitly cover direct and Ship-originated autonomous
  Work; bounded manual assistance; fresh verification, independent review,
  exact settlement, and closure; next-ready selection under the original target
  and policy; and a fresh next-task claim.
- Negative scenarios cover guarded Work; verification and review failure;
  unresolved blockage; explicit pause and cancellation; no ready work; budget
  exhaustion; tool error; every hard stop; supervisor, context, or identity
  loss; post-hard-stop, orphan, takeover, cross-invocation, and cross-session
  continuation; and silent retry.
- FR-001 through FR-019 state observable WHAT and WHY without selecting source
  files, test helpers, or projection commands.
- SC-001 through SC-006 are measurable through success, exclusion, stop,
  continuity-loss, and prohibited-surface fixtures.
- Feature 039's pre-Work answerability boundary is explicit and unchanged.
- No unresolved clarification or `[NEEDS CLARIFICATION]` marker remains.

The specification satisfies its WHAT/WHY gate by inspection. This is not a lint,
publication, execution, or definition-readiness claim.

## Accepted Current Topology

1. `src/skills/dude-work/recovery.mjs` parses direct Work policy and owns the
   existing recovery, budget, evidence, and stop mechanics. The accepted
   topology evidence found no defect in that parser requiring this feature.
2. `src/skills/dude-work-intake/SKILL.md` normalizes Ship to the same autonomous
   Work policy, then ends its pre-Work authority. Feature 039 and its current
   contracts require every later Work outcome to pass through unchanged.
3. `src/skills/dude-work/host-adapter-runner.mjs` exposes a one-task
   `runHostAdapter`. After exact closure it intentionally returns
   `{outcome:'ended', reason:'task-settled'}` with no halt report. The Architect's
   production-call-path review found no executable whole-Work scheduler or outer
   caller that converts this clean per-task result into termination of the
   entire Work request.
4. `src/skills/dude-work/SKILL.md` is the narrow control point for the
   coordinator-owned outer iteration. Its current `## Stops` says progress does
   not end autonomous Work, and its cleanup contract already requires a fresh
   claim for the next task, but `## Iterate` does not explicitly connect a
   successful per-task settlement to next-ready selection after bounded manual
   assistance.
5. The existing continuity contract already requires the original coordinator
   supervisor, context, and independently retained invocation identity to
   survive; loss is a hard stop. The cleanup contract already prohibits timeout,
   takeover, and lock stealing and permits a later claim only after bounded
   manual orphan cleanup and clean preflight.
6. `scripts/current-format-contract.test.mjs` already owns section-aware Work
   prose contracts, named natural-stop coverage, and deletion-sensitive rule
   helpers. The focused regression belongs there rather than in a new test
   module.
7. `node scripts/build-dev.mjs` projects
   `src/skills/dude-work/SKILL.md` to
   `.github/skills/dude-work/SKILL.md`. Existing build tests own projection
   parity.

## Guardrail And Smallest-Design Check

Existing project guardrails already require deterministic checks, authoritative
`src/` edits, generated-core discipline, concise model-facing instructions, and
the smallest design with a reachable caller. No new durable guardrail candidate
is needed.

| Kept surface | Reachable need | Specification proof |
|---|---|---|
| Existing Work iteration and stop guidance | The production outer loop is coordinator/prompt-owned and needs an explicit per-task-settlement bridge. | FR-001, FR-007 through FR-009; SC-001, SC-002 |
| Existing continuity and cleanup rules | Same-invocation recovery must fail closed on authority loss and must not turn cleanup into resume. | FR-004, FR-005, FR-014 through FR-016; SC-004 |
| Existing current-format contract suite | The prose-owned behavior and all exclusions need focused deletion-sensitive coverage. | All FR; all SC |
| Existing development projection | The installed dogfood Work skill must equal authoritative source. | FR-017 through FR-019; SC-005, SC-006 |

Rejected designs:

- A runtime loop, scheduler, daemon, continuation service, or new caller. No
  current production caller requires one, and the observed per-task result is
  intentional.
- A change to `recovery.mjs`, `host-adapter-runner.mjs`, host adapter state, or
  the `task-settled` result. No reachable runtime defect was reproduced.
- A new mode, command, stop reason, claim type, persistent flag, checkpoint
  field, registry, or audit record.
- Automatic fresh Work, takeover, or cross-session resume after continuity loss.
- A Ship-specific continuation path. Ship's authority ends when Work begins.
- Public-documentation changes. The proven mismatch is in authoritative
  model-facing Work guidance, and no separate public behavior or command
  changed.
- A new test file, supporting definition artifact, or ObjectiveRegistry. The
  existing owners cover the complete change.

## Artifact Ownership And Sequence

| Ordered outcome | Exact specialist owner | Artifact boundary |
|---|---|---|
| Focused contract specification | Tester | `scripts/current-format-contract.test.mjs` |
| Authoritative Work guidance | Skill Smith | `src/skills/dude-work/SKILL.md` |
| Projection and integrated evidence | Tester | generated `.github/skills/dude-work/SKILL.md` plus read-only verification evidence |

The tasks are sequential. The contract tests establish the expected bridge and
exclusions before prose changes; the Skill Smith then changes the sole
authoritative guidance; the final Tester pass regenerates the installed
projection and validates the integrated result. Independent review remains part
of the existing Work gate for each task and is not duplicated as an
artifact-authoring task.

## Chosen Design

### 1. Pin the continuation contract in the existing test suite

Extend `scripts/current-format-contract.test.mjs` near the existing Work
iteration, stop, continuity, cleanup, and Ship-boundary contracts. Use its
section-aware helpers rather than adding a parser or test module.

Add focused requirements that bind:

- direct and Ship-originated autonomous Work to the same post-start behavior;
- manual assistance to the same still-active coordinator invocation with its
  original supervisor, context, and retained invocation identity;
- fresh verification, independent review, exact settlement, and closure before
  continuation;
- clean per-task `ended`/`task-settled` as progress, followed by automatic
  next-ready selection in the already-detected lane under the original target
  and normalized policy;
- a fresh claim for the next task;
- guarded Work exclusion;
- unchanged verification failure, review rejection, unresolved blocker,
  explicit pause or cancellation, no-ready result, budget exhaustion, tool
  error, every existing hard stop, and no-silent-retry behavior;
- continuity loss as a hard stop with no automatic fresh invocation;
- cleanup as authority only for a later user-authorized clean claim, never
  takeover, orphan resume, or cross-session continuation;
- no new stop reason, command, mode, runtime, or persistent surface; and
- Feature 039's distinct pre-Work boundary.

Each required behavior gets a labeled deletion or weakening falsifier. Keep the
checks paragraph- or section-bound; do not infer broad semantic contradiction
from arbitrary prose. The tests may report the expected missing source contract
before the Skill Smith task, but their own helper and falsifier behavior must be
demonstrably valid.

### 2. Refine the authoritative Work iteration and stop guidance

Update only `src/skills/dude-work/SKILL.md`, primarily `## Iterate` and
`## Stops`.

In `## Iterate`, state that autonomous Work entered directly or through Ship
retains one coordinator-owned outer invocation. If bounded manual assistance
resolves the current blocker while the original supervisor, context, and
retained invocation identity survive, the current task still completes through
fresh verification, independent review, exact settlement, and closure. A clean
per-task `task-settled` result then returns control to the active coordinator
loop, which selects the next ready task in the already-detected lane under the
original target and policy. The next task receives a fresh claim; prior
task-scoped authority does not carry forward.

In `## Stops`, make explicit that successful per-task settlement is progress and
is not a whole-Work stop. Preserve the closed stop set and precedence for
verification or review failure, unresolved blockage, explicit pause or
cancellation, no ready work, exhausted budgets, tool errors, and every hard
stop. Retain the no-silent-retry rule.

Keep the existing supervisor-continuity and cleanup sections authoritative:
loss of supervisor, context, or invocation identity remains a hard stop; no
fresh Work starts automatically; manual cleanup permits only a later
user-authorized clean claim. State the guarded exclusion and the post-Work
separation from Ship's pre-Work answerability without copying Feature 039 or
using feature-local identifiers in shipped guidance.

Do not change runtime JavaScript, Work grammar, policy parsing, adapter result
shapes, public docs, agents, instructions, memory, or any other skill.

### 3. Regenerate and verify the bounded projection

After the authoritative source and focused contracts agree, run:

```bash
node scripts/build-dev.mjs
```

The sole intended generated semantic change is
`.github/skills/dude-work/SKILL.md`. Do not hand-edit it. Run the build a second
time and require no further change.

Run the focused recovery-continuation contract, the complete current-format
contract file, the existing source/generated development-build test, workspace
lint with zero failures, and `git diff --check`. Inspect changed paths and
source/generated bytes to confirm that no runtime module, public doc, agent,
instruction, memory file, state, metadata, Feature 039 artifact, or unrelated
generated file changed.

The repository's ordinary final broad verification remains a later
feature-completion gate. It is not another implementation task and does not
justify expanding this package.

## Test Strategy

### Contract authoring

The Tester adds one focused recovery-continuation contract group to
`scripts/current-format-contract.test.mjs`. It should use
`markdownSection`, paragraph requirements, and deletion or weakening
falsifiers already present in that file. The test group must distinguish a
per-task clean settlement from a whole-Work stop and bind every inclusion and
exclusion listed in Chosen Design 1.

### Focused integration

After the Skill Smith change and development projection, the Tester runs:

```bash
node --test --test-name-pattern='recovery continuation' scripts/current-format-contract.test.mjs
node --test scripts/current-format-contract.test.mjs
node --test --test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' scripts/build-dev.test.mjs
node .github/skills/dude-lint/lint.mjs .
git diff --check
```

The Tester also checks exact source/generated equality and a second
`build-dev` no-change result. Failed checks return to the owning test or skill
task; assertions are not weakened to accept missing behavior.

### Later broad gate

Before feature completion, the existing Work verification process runs the
repository-wide recursive suite and the other currently applicable bundle,
Compose, build, release, lint, and changed-path checks over one unchanged
revision. This existing gate is outside the three lean implementation units.

## Phases

- **Phase 1 - Focused contracts (T001)**: Tester authors the section-bounded,
  deletion-sensitive recovery-continuation contract.
- **Phase 2 - Authoritative guidance (T002)**: Skill Smith refines only the Work
  skill's iteration and stop contract.
- **Phase 3 - Projection and relevant verification (T003)**: Tester regenerates
  the installed Work skill and verifies the focused, current-format, projection,
  lint, and diff boundaries.

## Requirements Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-009 / SC-001, SC-002 | Autonomous per-task settlement bridge, original target/policy, and fresh next-task claim | T001@74657374, T002@736b696c, T003@76657269 |
| FR-010 through FR-013, FR-017 / SC-003 | Unchanged completion gates, stops, budgets, and no-silent-retry behavior | T001@74657374, T002@736b696c, T003@76657269 |
| FR-014 through FR-016 / SC-004 | Continuity-loss hard stop, cleanup boundary, and no takeover or cross-session resume | T001@74657374, T002@736b696c, T003@76657269 |
| FR-003, FR-018, FR-019 / SC-005, SC-006 | Guarded exclusion, prohibited surfaces, and unchanged Feature 039 boundary | T001@74657374, T002@736b696c, T003@76657269 |

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No research record, data model,
API contract, schema, quickstart, quality checklist, or ObjectiveRegistry would
add value to this bounded prompt-contract clarification.

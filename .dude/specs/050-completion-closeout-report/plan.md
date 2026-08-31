# Implementation Plan: Completion Closeout Report

## Technical Context

Dude's coordinator behavior is authored in `src/agents/dude.agent.md`, with execution-specific procedure in core skills under `src/skills/`. Development bundle files under `.github/` are generated projections and must be rebuilt rather than hand-edited. This feature is a prompt and documentation contract: existing owners already establish close success and existing coordinator tools already provide read-only repository and delivery evidence.

No runtime helper, response parser, hook, report artifact, state schema, cleanup executor, or optional-pack integration is warranted. The detailed closeout contract will have one core owner, with narrow execution pointers where successful closes are finalized.

## Chosen Structure

### Authoritative core behavior

- Add one `## Completion Closeout` section to `src/agents/dude.agent.md`.
- Define the trigger as at least one successful close in the current invocation, exactly one closeout in the same final response, and no closeout for an invocation with no successful close.
- Require post-close read-only observation for mutable worktree and branch state.
- Define deterministic category order and omission: repository state; observed delivery identities and links; exact optional cleanup; retained or proposed learning.
- Cover mixed-result invocations by limiting success claims to closed targets while retaining existing `Blockers:` and stop semantics.
- Make the section explicitly non-mutating and independent of optional packs.
- Point the existing `## Response` contract at this section rather than creating a second response format.

### Execution consumers

- Update `src/skills/dude-work/SKILL.md` `## Report` so a final Work response that closed one or more tasks applies the coordinator-owned closeout once, including when later work stops.
- Update `src/skills/dude-lightweight-execution/SKILL.md` `## Lightweight Close Protocol` with a concise pointer for a bounded task close.
- Do not modify Work runtime JavaScript, board state transitions, learning governance, or tracked-pack code. Those surfaces establish outcomes and evidence but do not need another state transition.
- Do not modify the optional release or retrospective packs. A release specialist may return observed release facts through its existing handoff, while the core coordinator owns final rendering regardless of pack installation.

### Generated development bundle

Run the existing development build after source edits so these projections update from authoritative source:

- `.github/agents/dude.agent.md`
- `.github/skills/dude-work/SKILL.md`
- `.github/skills/dude-lightweight-execution/SKILL.md`

No `.github/` core file is edited directly.

### Documentation

- Add a concise user-facing closeout description and bounded-task example to `docs/commands.md`.
- Explain successful-close timing, applicable-category omission, and non-mutating behavior in `docs/workflow.md`.
- Add a short first-user summary to `README.md`, including that optional packs are not required.
- Keep release-specific mechanics in the optional release pack; core docs describe only the universal observed-evidence result.

### Contract verification

- Extend `scripts/current-format-contract.test.mjs` with section-scoped checks for the authoritative coordinator contract and its two execution pointers.
- Pin trigger, one-response cardinality, post-close observation, deterministic order, omission, mixed-result scoping, read-only behavior, learning authority, and optional-pack independence.
- Add labeled deletion falsifiers for the owning coordinator rule blocks so broad nearby prose cannot mask a removed obligation.
- Rely on the existing `scripts/build-dev.test.mjs` projection check to prove generated core output matches `src/`.
- Use existing full-suite and lint gates; create no bespoke test runner.

## Evidence Flow

1. An existing workflow owner establishes one or more successful closes under its unchanged verification, review, ownership, and close rules.
2. Before the final response, the coordinator reads current worktree and branch state. It retains only response-local evidence and reports an unavailable observation honestly if the read fails.
3. The coordinator reuses observed delivery identities and canonical links already returned by applicable delivery work. It never derives a URL from a recognizable name.
4. The coordinator includes exact optional cleanup only when evidence identifies both the action and target; it does not execute the action.
5. The coordinator includes learning only when existing governance already records a retained item or proposed candidate.
6. The coordinator renders one closeout in the existing final response, omitting unsupported categories and preserving any normal blocker or stop report.

## Guardrail Checks

- **Source authority:** Edit core only under `src/`; regenerate `.github/` with the existing build.
- **Spec/plan separation:** Product behavior remains in `spec.md`; repository paths and implementation choices remain here.
- **Evidence safety:** Never infer cleanliness, branch identity, delivery identity, or URL. Mutable repository claims require post-close observation.
- **No mutation:** Reporting performs no cleanup, Git change, release action, workflow transition, reopening, lesson persistence, or learning promotion.
- **Core independence:** Core reads no optional-pack projection and has no runtime dependency on a release or retrospective pack.
- **YAGNI:** Add prompt contract, focused tests, generated projection, and user docs only. No helper, parser, hook, schema, registry, report file, or new state.
- **Existing authority:** Close, review, tracked state, task glyphs, learning, and memory ownership remain unchanged.

## Requirement Traceability

| Requirements | Implementation surface | Verification |
|---|---|---|
| FR-001–FR-004 | Coordinator `## Completion Closeout` and existing `## Response` | Section-scoped cardinality, timing, same-response, and non-mutation checks |
| FR-005–FR-009 | Coordinator evidence and repository/delivery rules | Evidence, post-close observation, unavailable-state, and no-synthesized-link checks |
| FR-010–FR-013 | Coordinator category rules | Exact optional cleanup, learning disposition, omission, and order checks |
| FR-014 | Coordinator mixed-result rule; Work report pointer | Mixed successful/blocked invocation contract check |
| FR-015–FR-016 | Coordinator optional-advisory boundary | No dependency/authority/delay checks and core projection verification |
| FR-001–FR-002, FR-014 | Work and Lightweight pointers | Consumer presence checks tied to the coordinator-owned section |
| SC-001–SC-006 | Contract fixtures, deletion falsifiers, existing build/full-suite/lint gates | Focused contract test plus repository validation gates |

## Implementation Phases

### Phase 1: Core contract

Author the sole detailed closeout rules in the coordinator and add narrow Work and Lightweight references.

### Phase 2: Tests and documentation

Pin each material behavior in the current-format contract suite while updating the three public documentation surfaces.

### Phase 3: Projection and verification

Rebuild the development bundle, inspect intended generated changes, and run focused and repository-wide validation.

## ObjectiveRegistry

No ObjectiveRegistry is created. This feature has no production objective-evaluation caller and introduces no candidate execution or runtime objective flow; ordinary acceptance tests and contract traceability are sufficient.

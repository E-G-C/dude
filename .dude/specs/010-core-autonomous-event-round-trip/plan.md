# Implementation Plan: Core Autonomous Event Round Trip

## Summary

Give the lane-history event vocabulary one owner and make both the writer and reader paths consume it, so the writer can no longer emit a type the reader does not accept. Each declared type states whether it is retention-relevant or audit-only. The reader validates every declared record strictly, ignores declared audit-only records for retention only, and keeps failing closed on anything undeclared. One executable check compares the independently exercised writer-emittable and reader-accepted surfaces, so the vocabulary cannot silently re-diverge.

The existing per-type validator for the observed audit-only type is reused. No lane-history record is edited, migrated, or deleted; already-affected features recover because the reader changes, not the data.

Canonical feature identity is `.dude/specs/010-core-autonomous-event-round-trip/spec.md`.

## Technical Context

**Language/Version**: Dependency-free JavaScript ES modules on Node.js >= 20.

**Primary Dependencies**: Node built-ins only. The change stays inside the existing `src/skills/dude-work/recovery.mjs` writer and reader runtime. No new module, package, command, schema version, state store, or board-layer dependency.

**Storage**: None added. Feature lane history remains the append-only `## Lightweight Execution History` section of each feature's `tasks.md` and is not written by this feature.

**Testing**: Node's built-in test runner against the existing focused suite, `src/skills/dude-work/recovery.test.mjs`. The round-trip invariant is an assertion in that suite, not documentation.

**Target Platform**: Maintainer worktrees on supported desktop platforms and CI runners on Node 20 and 22.

**Project Type**: Reusable bundle repository. Authoritative core lives under `src/`; `.github/` is base-owned generated output.

**Performance Goals**: Unchanged. Type recognition stays a constant-time lookup per parsed record, and no new pass over lane history is added.

## Guardrail Check

| Guardrail | Plan response |
|---|---|
| Prefer deterministic checks over reviewer diligence | The round-trip invariant is an executable assertion over the declared writer-emittable set, not a convention or a review note. |
| Keep model-facing instructions concise | No instruction, agent, or skill text changes; this is a runtime correctness fix. |
| Choose the smallest design that satisfies proven requirements | Reuse the existing shared module, existing per-type validators, and existing focused recovery suite. Add no envelope marker, no stream split, no migration, and no new state. |

No new guardrail is proposed.

## Current State

Facts confirmed in the source at re-definition time:

- `src/skills/dude-work/recovery.mjs` now owns `LANE_EVENT_TYPES`, and reader recognition, validator dispatch, and retention relevance derive from it. The declaration includes `incident-supersession` as audit-only and reuses `validateIncidentSupersessionEventV1`.
- `validateEventCommitmentV1` still carries an independent five-member event-type literal. This is the surviving writer-side duplicate and leaves the writer commitment boundary able to diverge from `LANE_EVENT_TYPES`.
- `validateIncidentSupersessionEventV1` binds that event to the exact Feature 007 target, so a round-trip fixture for this type must use that target to exercise event-type compatibility rather than fail target validation.
- `validateOccurrenceSurfaceV2` ignores every type outside `approach-occurrence` and `finding-occurrence`, so retention and repeat detection do not depend on audit records.
- `parseV2EventLines` keeps unknown event types fail-closed and skips only its existing wrapped legacy audit lines.
- `src/skills/dude-lightweight-execution/board.mjs` does not parse or dispatch on event `type` and carries no event-type vocabulary. Its `LANE_KIND_REASONS` declaration governs lane mutation kind/reason pairs, which is a separate concern and is outside this feature's implementation boundary.

## Design Decisions

1. **One shared declaration** of lane-history event types, each carrying its retention relevance, defined once in the module the writer and reader paths already share and consumed by both. This is the class fix: the writer's emittable set and the reader's accepted set stop being two independent literals. Satisfies FR-001 and FR-002. Constant names, field names, and signatures are chosen during implementation, not here.
2. **Reader recognition derives from that declaration** instead of its own list, and per-type validator dispatch covers every declared type, reusing `validateIncidentSupersessionEventV1` for the observed type. Satisfies FR-001 and FR-003.
3. **Retention consumers exclude audit-only types by the declared relevance flag**, not by name, after the record has already been validated. Strict first, ignore second. Satisfies FR-003 and FR-008.
4. **Undeclared types keep the current hard failure**, with the existing refusal text and hard-stop classification unchanged. Satisfies FR-004 and preserves the governance blindness guarantee.
5. **The writer commitment boundary consumes the shared declaration.** `validateEventCommitmentV1` derives its accepted event-type set from `LANE_EVENT_TYPES` instead of retaining an independent literal. This does not touch or conflate the board layer's separate lane kind/reason vocabulary. Existing commitment acceptance and refusal outcomes remain unchanged. Satisfies FR-001 and FR-002.
6. **The round-trip invariant compares two independently exercised behavioral surfaces.** The writer-emittable set is derived through actual `validateEventCommitmentV1` behavior, while the reader-accepted set is derived through the real parse-and-validate path; neither set is inferred from the other or jointly enumerated from `LANE_EVENT_TYPES`. The assertion compares those observed sets, separately checks that every member has exactly one declared retention relevance, and must fail when either surface accepts a type the other rejects. The `incident-supersession` reader fixture uses the exact Feature 007 target required by its validator. Satisfies FR-006.
7. **No lane-history data is touched.** Feature 007 recovers as an observed side effect of decision 2, verified by reading its existing history unchanged. Satisfies FR-007 and SC-006.

## Generated Projection

`.github/` is base-owned generated output, not authoritative source, and is never a declared source path. After the `src/**` change lands, the projection must be rebuilt with:

```bash
node scripts/build-dev.mjs
```

That rebuild belongs to the terminal core dogfood close task, together with exact parity proof and protected-boundary preservation.

## Phases

| Phase | Outcome | Task |
|---|---|---|
| 1 | Shared declaration exists and the reader consumes it, strictly validating declared audit-only records and still failing closed on undeclared ones. | T001@766f6361 |
| 2 | The writer commitment validator consumes the shared declaration instead of its independent event-type literal. | T002@77726974 |
| 3 | Independently exercised writer and reader surfaces are compared by an invariant that fails on divergence in either direction. | T003@74726970 |
| 4 | Core dogfood close: rebuild the projection, prove parity, run full verification, accept. | T004@636c6f73 |

## Traceability

| Requirement | Decision | Task |
|---|---|---|
| FR-001 | 1, 2, 5, 6 | T001@766f6361, T002@77726974, T003@74726970 |
| FR-002 | 1, 5 | T001@766f6361, T002@77726974 |
| FR-003 | 2, 3 | T001@766f6361 |
| FR-004 | 4 | T001@766f6361 |
| FR-005 | 2, 3 | T001@766f6361 |
| FR-006 | 6 | T003@74726970 |
| FR-007 | 7 | T001@766f6361, T004@636c6f73 |
| FR-008 | 3, 4 | T001@766f6361, T002@77726974 |

## Complexity Tracking

No complexity exception is claimed. The envelope criticality marker and the lane-history stream split recorded as candidates in the owning idea are both rejected here: the selected direction does not need either, and both cost more than the defect warrants.

## Out Of Plan

- No diagnosability or continuity behavior. Those belong to `.dude/ideas/unattended-work-continuity.md`.
- No migration, rewrite, or deletion of existing lane history.
- No relaxation of fail-closed behavior for records that could affect authorization.
- No instruction, agent, skill, pack, or documentation change.

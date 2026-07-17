---
name: "dude-feature-definition"
description: "Use for brainstorm idea capture, explicit feature definition, spec and plan gates, task derivation, reconciliation, and definition lint."
---

# Feature Definition

`brainstorm` and `define` are separate actions. Maintain one flat idea ledger, then create a lean definition package only on explicit definition.

## Ownership

- `## Idea`, answers in `## Open Questions`, and `## Assumptions` are user-controlled. Preserve meaning, tone, uncertainty, incomplete thought, creative intent, answered questions, assumptions, and user edits.
- During explicit `brainstorm` or `define`, the coordinator delegates definition writes to the Spec Lead: idea/package artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events. Other specialists do not mutate workflow state; execution state and close events remain coordinator-only. Never rewrite prior log entries.
- A defined feature's identity is the workspace-relative `.dude/specs/<feature>/spec.md` path, not its slug, directory, title, or another artifact.
- For re-definition, rendered task validation, and execution handoff, require exactly one `status: defined` owner by exact `spec_path:`. Any resolver diagnostic, no owner, or multiple owners stops before mutation. Never infer or fall back from slug, directory, or name.

## Brainstorm

`brainstorm <idea>` creates or refreshes exactly one direct `.dude/ideas/<slug>.md`; brainstorm does not create or write `.dude/specs/`.

On first capture, only clear language or transcription errors may be corrected. On rerun, re-normalize managed content without opportunistically rewriting user text. Keep active questions immediately after `## Idea`, preserve resolved questions, answers, assumptions, and user edits, and add only focused questions introduced by new ambiguity. Set `status: draft` and empty `spec_path:` only for a first or still-undefined draft. A rerun of a defined ledger preserves `status: defined` and its exact `spec_path:`; never demote it or orphan its package.

If one ledger contains distinct outcomes with separate success tests, ask one narrow split question before definition. Do not create nested or duplicate intake ledgers.

## Guardrail And Spec Gates

Read project memory and conventions. If only bundle guardrails exist, infer a minimal project-specific candidate set. When candidates exist, pause and say `This is a normal checkpoint, not an error.` `accept` persists the proposed rules to `.dude/memory/guardrails.md`, then resumes definition. `edit` persists only the user-edited accepted rules, then resumes. `reject` persists none and continues with existing project/bundle guardrails. `skip` persists none and continues with bundle defaults only. Only ratified rules persist. With no new guardrails, continue without pausing.

Write and validate the technology-agnostic `spec.md` before `plan.md`. The spec covers WHAT and WHY with prioritized, independently testable user scenarios, edge cases, numbered requirements, applicable entities, measurable success criteria, and assumptions. Allow at most three `[NEEDS CLARIFICATION: ...]` markers, ordered scope, security/privacy, UX, then technical; keep overflow visible as deferred clarification. Resolve all markers before planning or task derivation.

The spec gate requires complete sections, testable requirements, measurable technology-agnostic criteria, acceptance scenarios, edge cases, and no implementation details. `plan.md` owns HOW: technical context, one chosen structure, guardrail checks, justified complexity, and phases. Create only materially useful supporting artifacts.

## First Definition Transaction

Initial definition has a prospective owner because no defined owner exists yet:

1. Select exactly one explicit direct draft idea by the requested slug or idea path; never use a same-name, recursive, or retired-path fallback.
2. Derive the next monotonic package number and future exact `spec_path:`. Preflight all direct ideas; identity collisions or ambiguous prospective selection stop before writes.
3. Stage the complete package, exact task audit breadcrumb, owner transition, and definition log event without mutating.
4. Return the complete stage to the coordinator. After it verifies the prospective owner and snapshots every affected path, commit the staged package artifacts, that same idea's `status: defined` plus exact `spec_path:`, and the definition event as one delegated atomic transaction. If any write or validation fails, the coordinator restores every pre-write byte and removes every newly created path; neither package nor owner transition may survive alone, and never report a half-transition as defined.
5. The coordinator runs `node .github/skills/dude-lint/lint.mjs .`; definition readiness requires its reported zero failures.

## Re-definition

Resolve the exact current defined owner before any write. Refresh from user-controlled intent, not from generated spec or plan prose. Preserve `status: defined`, exact `spec_path:`, append-only history, still-applicable supporting artifacts, and preserved task-history sections.

The Spec Lead computes and stages `kept`, `changed`, `dropped`, and `new` rows by durable task key, proposed canonical task units, and exact preservation of archives, `## Discovered During Execution`, and `## Lightweight Execution History`. It may write definition artifacts, metadata, and definition log events only through the explicit `define` delegation; it must not apply task glyphs, task metadata, generated boards, archive/discovered/execution-history state, or execution-reconciliation log events. Preserve state only for a true one-to-one surviving task. Splits, merges, scope changes, missing keys, or different keys remain open unless the mapping is explicit.

Dropping any non-open task is a hard pause for user confirmation. The user may confirm, reject, force keep/drop, or archive dropped rows. Archived rows go in terminal `## Lightweight Execution History`, remain read-only evidence, and are never parsed or regenerated. Preserve any `## Discovered During Execution` section verbatim immediately before history; its synced `T9001`-`T9999` rows are outside spec-derived reconciliation.

Return the complete staged definition and reconciliation to the coordinator before either actor writes. The coordinator re-verifies the exact owner and staged mapping, then delegates definition artifact/metadata/definition-log writes to the Spec Lead and exclusively applies glyphs, task metadata, board, archive/discovered/history state, and the execution-reconciliation log event. Pre-write snapshots cover both halves; if either half or lint fails, restore every changed byte and remove every new path. Never leave or report a half-applied re-definition.

## Task Contract

Canonical task units live below any generated board and use:

```markdown
- [ ] T001@a1b2c3d4 [P] [US1|Shared] Description with paths
    deps: T000@e4f5g6h7
    blocked-by: spec-gap: concise reason
```

States are `[ ]`, `[~]`, `[!]`, and `[x]`. Durable keys survive only while task meaning survives. `[P]` is only a parallel candidate signal; actual fan-out still requires no dependency or blocker relation and known disjoint implementation write sets. `deps:` adds real durable-key blockers; `blocked-by:` explains `[!]`. Spec-derived IDs stay below `T9000`.

`tasks.md` carries the exact owner breadcrumb. An optional balanced Dude board fence is a complete regenerated view of canonical units, never canonical state. Supporting checklists are advisory, not another board. Phases normally progress Setup, Foundational, prioritized User Stories, then Polish; every task traces to the plan and every plan decision to the spec.

## Validation And Handoff

Before handoff, verify exact ownership, no unresolved clarification, task grammar and unique durable IDs, balanced fences, requirement/plan/task traceability, independent story tests, and no invented scope. Return the staged definition artifacts, reconciliation when applicable, and risks to the coordinator without claiming terminal or lint execution. The coordinator runs:

```bash
node .github/skills/dude-lint/lint.mjs .
```

No definition readiness claim is allowed until the coordinator reports zero failures. Before tracked import, `tasks.md` may be the sole Lightweight live board. After import, Beads is authoritative and markdown updates are only a one-way non-authoritative mirror. Return changed artifacts, exact `spec_path`, clarification or reconciliation state, readiness, and risks to the coordinator.

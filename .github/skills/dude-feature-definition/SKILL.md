---
name: "dude-feature-definition"
description: "Use for brainstorm idea capture, explicit feature definition, spec and plan gates, task derivation, reconciliation, and definition lint. Do NOT use to select, execute, close, or report tasks (dude-lightweight-execution or the installed tracked-execution skill)."
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

A rerun of a resolved ledger preserves exact `status: resolved` and its empty `spec_path:`. Only an explicit user request to reopen through `brainstorm <slug>` changes a resolved ledger to draft with an empty path and one appended lifecycle event; never infer reopen from refreshed prose.

If one ledger contains distinct outcomes with separate success tests, ask one narrow split question before definition. Do not create nested or duplicate intake ledgers.

## Guardrail And Spec Gates

Read project memory and conventions. If only bundle guardrails exist, infer a minimal project-specific candidate set. With no new guardrails, continue without pausing. Outside explicit Ship, when candidates exist, pause and say `This is a normal checkpoint, not an error.` `accept` persists the proposed rules to `.dude/memory/guardrails.md`, then resumes definition. `edit` persists only the user-edited accepted rules, then resumes. `reject` persists none and continues with existing project/bundle guardrails. `skip` persists none and continues with bundle defaults only. Outside explicit Ship, only ratified rules persist.

### Explicit Ship

During an existing explicit Ship lifecycle subaction and before Work begins, definition first applies every normal eligibility, prerequisite, authority, and safety gate. A failed gate returns its existing refusal before answerability. Only then may the definition owner apply the qualitative owner-first rule in `dude-work-intake`; a checkpoint label alone does not stop.

Resolve a clarification only when accepted intent or material evidence already supplies the answer. Do not edit a user-controlled question answer merely to manufacture completion, invent a fact, choice, permission, or assumption, or claim the user supplied a new answer.

| Candidate set after definition gates | Definition-owner disposition under Ship | Continuing guardrails | Attribution |
| --- | --- | --- | --- |
| Wholly protective: every candidate is clearly protective, applicable, consistent with accepted intent, and within existing definition authority | Adopt the set through the existing definition-owner guardrail write path | Existing project and bundle guardrails plus adopted entries | Ship-authorized definition-owner action |
| Mixed, with an unchanged qualifying remainder and only clearly irrelevant, speculative, or contrary-to-accepted-intent candidates removable | Remove only those candidates and adopt the unchanged qualifying remainder | Existing project and bundle guardrails plus adopted entries | Ship-authorized definition-owner action |
| Every candidate clearly irrelevant | Reject the whole set and continue | Applicable existing project and bundle guardrails | Ship-authorized definition-owner action, never a user `reject` |
| Material rewrite, tradeoff, conflict, user-owned authority, or consequential uncertainty | Stop for the outcome-changing user choice | Applicable existing project and bundle guardrails remain in force | No autonomous disposition |
| `skip` would discard applicable project guardrails | Do not choose `skip`; use another qualifying row or stop | Applicable existing project and bundle guardrails remain in force | Never a user `skip` |

Never materially rewrite a candidate under autonomous authority. For a stop, state the missing basis, why bounded delegation is insufficient, and the user choice that changes the outcome. Identify every autonomous adoption, narrowing, or reject-all result as a Ship-authorized definition-owner action, never direct user ratification or a user `accept`, `edit`, `reject`, or `skip`. The coordinator reports it in the same Ship invocation's existing final or stop response; add no durable attribution or disposition record.

Write and validate the technology-agnostic `spec.md` before `plan.md`. The spec covers WHAT and WHY with prioritized, independently testable user scenarios, edge cases, numbered requirements, applicable entities, measurable success criteria, and assumptions. Allow at most three `[NEEDS CLARIFICATION: ...]` markers, ordered scope, security/privacy, UX, then technical; keep overflow visible as deferred clarification. Resolve all markers before planning or task derivation.

The spec gate requires complete sections, testable requirements, measurable technology-agnostic criteria, acceptance scenarios, edge cases, and no implementation details. `plan.md` owns HOW: technical context, one chosen structure, guardrail checks, justified complexity, and phases. Create only materially useful supporting artifacts.

## First Definition Transaction

Initial definition has a prospective owner because no defined owner exists yet. This transaction is first-definition only; supporting artifacts, re-definition, and tracked recovery do not route through it:

1. Select exactly one explicit direct draft idea by the requested slug or idea path; never use a same-name, recursive, or retired-path fallback. A resolved ledger is terminal until explicitly reopened through `brainstorm <slug>`; first definition refuses it before any write.
2. Derive the next monotonic package number and future exact `spec_path:`. Preflight all direct ideas; identity collisions or ambiguous prospective selection stop before writes.
3. The Spec Lead stages and approves the core trio, exact task audit breadcrumb, owner transition, and definition log event without writing, then returns those exact bytes to the coordinator. The Spec Lead retains staging authority; the coordinator retains execution and lane authority.
4. After rechecking the prospective selection, the coordinator creates one operating-system temporary directory containing exactly `current-idea.md`, `staged-idea.md`, `spec.md`, `plan.md`, and `tasks.md`. `current-idea.md` is the exact selected draft preimage; the other four files are the Spec Lead-approved stage.

   Invoke exactly: `node .github/skills/dude-feature-definition/publish-first-definition.mjs --root . --idea .dude/ideas/<slug>.md --spec .dude/specs/<NNN>-<package>/spec.md --stage <absolute-temporary-directory>`

   The command applies only the selected owner plus the core trio through the existing `applyAtomicFileBatch` transaction and runs fixed `dude-lint` inside its rollback boundary; on failure, it restores every pre-write byte and removes every newly created path.
5. The coordinator deletes the temporary directory on success or failure. It makes no publication-success or definition-readiness claim unless the command succeeds and the reported lint result is zero failures.

## Re-definition

Resolve the exact current defined owner before any write. Refresh from user-controlled intent, not from generated spec or plan prose. Preserve `status: defined`, exact `spec_path:`, append-only history, still-applicable supporting artifacts, and preserved task-history sections.

Explicit `brainstorm` is the sole route for user-intent changes and explicit resolved-to-draft reopen; explicit `define` is the sole route for package creation or refresh after a draft exists. `define` and re-definition never turn a resolved ledger into a package owner; `flag` delegates no definition writes and is no-write for definition artifacts.

Work-authorized unchanged-intent derived-artifact repair in an existing Lightweight package is the sole exception to explicit-define-only definition writes. `dude-work` (`## Automatic Unchanged-Intent Redefinition`) owns its eligibility, ordering, rollback-bound lint and verification, and resume; this skill owns the definition half. After the exact-owner gate, the Spec Lead stages only the definition-artifact, metadata, and definition-log half plus its semantic mappings; the coordinator owns the reconciliation and execution-state half and composes the exact final bytes. Before any write, deterministically prove exact ownership, one balanced active managed region, an append-only complete coordinator-log prefix, byte-identical `## Idea`, `## Open Questions`, and `## Assumptions`, valid canonical tasks, and preserved discovered-work and history bytes; that proof never establishes semantic equivalence. Only bytes an independent review has already approved may reach `atomic-file-batch.mjs`, which applies them as one atomic/all-or-restored four-path batch guarding fresh lint and verification. Tracked definition recovery refuses before writes.

The Spec Lead computes and stages `kept`, `changed`, `dropped`, and `new` rows by durable task key, proposed canonical task units, and exact preservation of archives, `## Discovered During Execution`, and `## Lightweight Execution History`. It may write definition artifacts, metadata, and definition log events only through the explicit `define` delegation, except for the sole Work-authorized unchanged-intent derived-artifact repair in an existing Lightweight package above; it must not apply task glyphs, task metadata, generated boards, archive/discovered/execution-history state, or execution-reconciliation log events. Preserve state only for a true one-to-one surviving task. Splits, merges, scope changes, missing keys, or different keys remain open unless the mapping is explicit.

Dropping any non-open task is a hard pause for user confirmation, except for the single case below. The user may confirm, reject, force keep/drop, or archive dropped rows. Archived rows go in terminal `## Lightweight Execution History`, remain read-only evidence, and are never parsed or regenerated. Preserve any `## Discovered During Execution` section verbatim immediately before history; its synced `T9001`-`T9999` rows are outside spec-derived reconciliation.

That sole exception is a `dropped-defective` task inside Work-authorized autonomous Lightweight repair, and only with exact ownership, byte-unchanged intent, trusted defect evidence, complete equal-or-stronger obligation and check successors, independent approval of the defect classification, successor obligations and checks, task-scope and decomposition equivalence, and archive mapping, open successors inheriting no state or completion evidence, byte-preserved prior history plus one append-only archive record of the prior task identity and state, defect reason, trigger evidence, and successor mapping. Such a task is never marked complete. Any missing condition, guarded Work, a non-Work flow, ordinary explicit redefinition, and every other non-open drop keep the pause.

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

## Objective Registry

`brainstorm` and `define` are the sole compiler of measurable objectives, and they compile into exactly one plan-owned `ObjectiveRegistry` region in the feature's `plan.md`, keyed by durable task keys. Runtime only reads this region; it never authors, infers, or repairs an objective.

Build the active start marker by concatenating `<`, `!-- dude:objective-registry:start --`, and `>`; the end marker replaces `start` with `end`. A marker is active only as a complete logical line with no surrounding bytes, outside inline code spans and fenced code blocks. The only valid region is exactly one start line, one canonical-JSON `ObjectiveRegistry` line, then one end line. Zero markers is `none` (no objectives); a lone, duplicate, reversed, or misordered marker, a missing or extra body line, or a noncanonical or invalid body is `malformed`; a valid registry that disagrees with the exact owner, sibling plan path, selected task, or freshly verified tracked mapping is `conflict`.

Illustrate the closed root with placeholders only, never a literal active marker:

```text
<OBJECTIVE_REGISTRY_START>
{"version":1,"owner":{"ideaPath":"…","specPath":"…"},"entries":[{"taskKey":"…","provenance":{…},"contract":{…}}]}
<OBJECTIVE_REGISTRY_END>
```

Each entry binds one durable `taskKey` to definition-compiled `provenance` and a frozen `EvaluationContract`. Feature 005's own `plan.md` keeps zero active registry regions.

## Validation And Handoff

Before handoff, verify exact ownership, no unresolved clarification, task grammar and unique durable IDs, balanced fences, requirement/plan/task traceability, independent story tests, and no invented scope. Return the staged definition artifacts, reconciliation when applicable, and risks to the coordinator without claiming terminal or lint execution. The coordinator runs:

```bash
node .github/skills/dude-lint/lint.mjs .
```

No definition readiness claim is allowed until the coordinator reports zero failures. Before tracked import, `tasks.md` may be the sole Lightweight live board. After import, Beads is authoritative and markdown updates are only a one-way non-authoritative mirror. Return changed artifacts, exact `spec_path`, clarification or reconciliation state, readiness, and risks to the coordinator.

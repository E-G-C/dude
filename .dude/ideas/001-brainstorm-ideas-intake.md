---
title: Brainstorm ideas intake
slug: brainstorm-ideas-intake
status: defined
spec_path: .dude/specs/001-brainstorm-ideas-intake/spec.md
---

# Brief: Brainstorm Ideas Intake

## Idea

Perform feature-definition work only; do not implement source code. The user has asked to plan a coordinated Dude bundle change in /Users/eg/work/AI/dude. Author a complete, lean definition package using the CURRENT workflow (because the feature itself will change that workflow): create/update `.dude/brief/brainstorm-ideas-intake.md`, then define it into the next sequential `.dude/specs/<NNN>-brainstorm-ideas-intake/` package. At minimum write `spec.md`, `plan.md`, and `tasks.md`; add `research.md`, `quickstart.md`, or a focused test checklist only if materially useful. Update the current brief metadata and append-only Coordinator Log as required. Do not edit `src/`, `library/`, `docs/`, `scripts/`, or generated `.github/` files. Run the focused definition validation and `node .github/skills/dude-lint/lint.mjs .` after writes.

Use these settled requirements and do not ask the user to repeat them:
1. One bounded feature, definition/planning only now, no Beads and no implementation.
2. Introduce primary coordinator verb `@dude brainstorm <idea>` with the behavior currently owned by `@dude draft`: create or refresh the pre-spec collaboration ledger, normalize intent, add focused open questions/assumptions, and stop before producing spec artifacts unless `define` is requested.
3. `brainstorm` is a first-class peer of `define`, but not an alias for `define`. Lifecycle: brainstorm -> idea -> define -> spec -> work.
4. Replace canonical `.dude/brief/<slug>.md` with `.dude/ideas/<slug>.md`. Use “idea” for the artifact/ledger and “brainstorm” for the action. `@dude define <slug>` consumes the idea and writes `.dude/specs/<feature>/`.
5. Replace the user-facing section heading `## User Draft` with `## Idea`. New brainstorm input may be lightly edited while capturing it: correct clear spelling, grammar, punctuation, speech-to-text transcription errors, filler, and accidental repetition. Preserve meaning, tone, uncertainty, unfinished/creative intent, and user edits. Do not silently resolve ambiguous wording; preserve it or create an open question. Users must not need to polish input first. On rerun, preserve the existing `## Idea` content unless the user edits or explicitly asks to revise it.
6. Keep frontmatter `status: draft|defined` and `spec_path:` semantics unchanged. The idea ledger remains the canonical companion/audit source for the feature and execution mirrors.
7. Keep `@dude draft` as a deprecated compatibility alias that performs brainstorm behavior and writes only `.dude/ideas/`; removal is out of scope for this feature. Documentation should lead with `brainstorm` and identify `draft` as deprecated.
8. Existing `.dude/brief/` is legacy after this change and must migrate explicitly, conflict-safely, to `.dude/ideas/`; do not silently move it during ordinary commands. Existing root `brief/` legacy input should migrate directly to `.dude/ideas/`. Migration must preserve frontmatter, content, Coordinator Log history, and body text; rename `## User Draft` to `## Idea` without editorial rewriting. If source/destination or headings conflict, plan/apply must stop with an actionable conflict. Audit references such as `brief/...#coordinator-log` and `.dude/brief/...` must become `.dude/ideas/...`.
9. If `.dude/brief/` and `.dude/ideas/` both contain state, ordinary mutations must remain blocked pending explicit migration/reconciliation; never create parallel ledgers.
10. Update all controlling surfaces, not just prose: core coordinator/spec-lead/instructions/skills, workspace path and feature identity terminology, lint, workspace migration, lightweight work and Beads pack import/mirror code, portability/upgrade preservation rules, status/self-check/diff behavior, authoring/build/release behavior where relevant, tests, generated dogfood `.github/` via `node scripts/build-dev.mjs`, and user docs/diagrams/examples. Keep unrelated uses of the generic English noun “brief” (for example a design or site brief that is not the Dude ledger) unchanged.
11. Backward-compatibility must be covered by tests: `draft` alias, canonical `.dude/ideas`, explicit `.dude/brief` migration including content heading/audit-link rewrite, collision and symlink safety, lint acceptance/rejection and duplicate `spec_path`, Beads import/mirror against ideas, status and self-check path recognition where executable, build-dev parity, release contents, and docs/reference consistency.
12. Project conventions: source of truth is `src/`, pack catalog is `library/packs/`, `.github/` is generated dogfood output rebuilt with `node scripts/build-dev.mjs`; release excludes tests and project state. Preserve unrelated dirty worktree changes.
13. Record assumptions rather than introducing clarification markers unless a truly blocking ambiguity remains. No new durable guardrail is needed: compatibility is feature scope, not a project-wide guardrail.

Repository evidence already gathered: exact terminology/path search found about 350 matches in 39 files; controlling code includes `src/skills/dude-engine/lib/workspace-paths.mjs` (`WORKSPACE_PATHS.BRIEF_DIR`), `src/skills/dude-lint/lint.mjs`, `src/skills/dude-workspace-migration/migrate.mjs`, `library/packs/beads/skills/dude-pack-beads-workflow/beads.mjs`, core agent/instructions/feature-definition/work-intake/lightweight/work/portability/upgrade skills, docs, and tests. Existing `.dude/` has memory and metadata only; no active brief/spec package. Root legacy brief/spec and `.github/dudestuff` are absent.

Return a report with: exact artifacts created, concise plan phase summary, assumptions/decisions, validation command and result, and any blocker. Do not claim implementation is complete.

<!-- dude:managed:start -->
## Normalized Intent

- Establish `brainstorm` as the primary intake action and `.dude/ideas/` as the sole canonical pre-spec ledger while preserving `define`, `spec_path`, and status semantics.
- Retain `draft` as a deprecated behavior-compatible alias without allowing it to write the legacy path.
- Keep canonical ideas flat and provide an explicit conflict-safe migration from direct Markdown children of both legacy brief locations, rejecting nested or unsupported entries.
- Bind apply to the exact reviewed deterministic migration plan through `plan_digest`, the existing literal confirmation token, and a fresh pre-mutation comparison covering sources, destinations, task audits, symlink/file types, and the complete Beads issue inventory.
- Use one pure CommonMark-fence-aware ledger transform that preserves bytes outside exact heading, machine-pointer, and one idempotent Coordinator Log event edits.
- Distinguish non-mutating legacy-only warnings from conflicting mixed-state failures while blocking every ordinary mutation on non-empty legacy intake, and validate each task breadcrumb against its unique exact `spec_path` owner.
- Change every executable, generated, packaged, and documented surface that controls or exposes the workflow, with focused compatibility and regression coverage.
- Cut this repository's live package over with the new source migrator as a coordinator-owned rollout after core support passes and before generated-core or Beads installed-layout validation.
- Reconcile this source repository's preserved dogfood memory and project-local ledger convention during that rollout so active guidance names `brainstorm`, `.dude/ideas/`, `## Idea`, and deprecated `draft`, without disturbing unrelated knowledge or memory history.

## Constraints

- Definition and planning only in this change; do not implement product code, import into Beads, or mutate live execution state.
- Use the current `.dude/brief/` workflow for this package because the feature itself changes that workflow.
- Preserve `status: draft|defined` and exact-file `spec_path` identity semantics.
- Do not silently migrate legacy state or create parallel ledgers.
- Preserve user-authored meaning and migration bytes outside the exact permitted heading/machine-pointer edits and one fixed idempotent migration event; do not claim total byte identity after appending that event.
- Require flat `.dude/ideas/<slug>.md` destinations, root/ancestor symlink preflight, and digest comparison before any tracker or filesystem mutation.
- Keep this brief and package audit breadcrumb at their current legacy paths until the future coordinator-owned cutover task; do not migrate them during re-definition.
- Keep `src/` and `library/packs/` authoritative, regenerate `.github/`, and retain release exclusions.
- Treat `.dude/memory/decisions.md`, `.dude/memory/context.md`, and `.github/skills/project/SKILL.md` as coordinator-owned dogfood state preserved by build-dev, not generated core or generic release input; generic release behavior remains unchanged.
- Preserve unrelated dirty worktree changes.
<!-- dude:managed:end -->

## Assumptions

- The broad file surface is one bounded feature because all changes enforce one atomic intake-ledger identity transition and share one compatibility gate.
- `brainstorm` accepts either inline idea text or a slug/reference resolvable by existing coordinator conventions; exact parser syntax remains consistent with current verb dispatch patterns.
- Light editing applies only during initial capture or an explicit user-requested revision, never as an incidental side effect of rerunning `brainstorm`.
- Canonical ideas intentionally support only direct `.md` children; nested legacy intake is an actionable conflict requiring manual flattening rather than a preserved relative destination.
- Migration rewrites only one real ledger heading when needed, the exact canonical first-line task audit comment, and the migrator's already enumerated structured machine forms; all other body prose, including generic uses of "brief", remains untouched.
- The fixed migration event is `- migrated intake ledger: canonical location is .dude/ideas/`, appended once at the end of the existing Coordinator Log using the source newline convention and included in the transformed output hash.
- `plan_digest` follows the local profile-reconciliation pattern: deterministic plan serialization excludes only the digest field, while apply freshly binds versioned sorted operations, typed source/destination and transformed hashes, full canonical destination inventory, relevant task-audit hashes, and every Beads issue id/full description.
- Valid legacy-only state produces a read-only warning with migration guidance; canonical-plus-legacy, nested, unsupported, colliding, or malformed state fails diagnostics; every ordinary mutation blocks on any non-empty legacy root.
- Bundle import, compose, skill scaffold, and team expansion inherit the shared mutation assertion, so they receive regression fixtures and production edits only if those fixtures expose a real gap. Upgrade and portability still require explicit terminology and preservation changes.
- Existing `.dude/brief/` is accepted only as explicit migration input after rollout, while `.dude/ideas/` is canonical for all ordinary operations.
- The future dogfood cutover is coordinator-owned, uses the new source migrator with deliberate `--allow-dirty`, and reconciles active ledger-specific project memory and project-skill guidance before the first live build-dev command and Beads installed-layout suite; memory consolidation preserves unrelated entries and history.
- No new project guardrail is warranted because compatibility and migration safety are acceptance requirements for this feature.

<!-- dude:managed:start -->
## Definition Checklist

- [x] Outcome is clear
- [x] Scope is bounded
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-10 - defined -> .dude/specs/001-brainstorm-ideas-intake/spec.md
- 2026-07-10 UTC - re-defined after Architect rejection; reconciliation: kept 7, changed 5, dropped 0, new 1
- 2026-07-10 UTC - re-defined after dogfood knowledge omission; reconciliation: kept 10, changed 3 in place, dropped 0, new 0; all task keys and dependencies preserved
- 2026-07-10 16:04 UTC - completed T001@7c9e1a2b: canonical ideas and dual legacy-brief path contract; 13 focused tests passed; board region regenerated
- 2026-07-10 17:13 UTC - completed T002@4f8d3c10: digest-bound flat ideas migration, structure-aware transforms, collision safety, and bounded cleanup; 49 tests passed, 0 failed, 1 platform skip; board region regenerated
- 2026-07-10 18:12 UTC - T003@a61b2e7d remains in progress after reviewer rejection: align migration and lint on rendered first-canonical-line audit rewrites; reject malformed non-empty draft spec_path values
- 2026-07-10 18:32 UTC - reopened T002@4f8d3c10 remains in progress after reviewer rejection: rendered audit locator must reject duplicate board starts and stray board ends to match lint fence cardinality; T003@a61b2e7d remains blocked on the migration/lint contract
- 2026-07-10 18:49 UTC - re-completed T002@4f8d3c10: rendered first-canonical-line audit snapshot/rewrite now matches lint fence cardinality; 58 tests passed, 0 failed, 1 platform skip; independent review approved
- 2026-07-10 19:08 UTC - completed T003@a61b2e7d: canonical idea and legacy intake validation, exact package ownership, rendered audit alignment, and draft spec_path validation; 60 tests passed; independent review approved
- 2026-07-10 19:38 UTC - completed T004@3d90f6ab: primary brainstorm-to-idea workflow, relaxed capture, managed normalized intent, stable reruns, and explicit define boundary; 35 tests passed; independent review approved
- 2026-07-10 20:03 UTC - completed T005@8b2c4e71: deprecated draft alias delegates to brainstorm with idea-only storage, explicit legacy migration gate, and normalized Action: brainstorm; 43 tests passed; independent review approved
- 2026-07-10 20:34 UTC - T006@5ea13d9c blocked after reviewer rejection: keep status diagnosis-only, restore the legacy-only warning versus mixed/malformed failure matrix, and define prospective first-definition ownership before task writes
- 2026-07-10 20:58 UTC - completed T006@5ea13d9c after revision: status-only diagnosis, legacy diagnostic matrix, prospective first-definition ownership, exact companion audits, and Work/parallel lifecycle integration; 87 tests passed; independent review approved
- 2026-07-10 21:25 UTC - T007@c47f20b8 blocked after reviewer rejection: upgrade legacyWorkspacePaths must classify root brief and .dude/brief symbolic-link issue forms before status cache work
- 2026-07-10 21:50 UTC - completed T007@c47f20b8 after revision: canonical idea preservation, dual legacy-root mutation gates, portability boundaries, inherited consumer fixtures, and symlink-safe upgrade diagnostics; 163 tests passed; independent review approved
- 2026-07-10 21:52 UTC - started T008@d4a7c930: coordinator-owned dogfood migration plan and cutover; awaiting reviewed digest confirmation before apply
- migrated intake ledger: canonical location is .dude/ideas/
- 2026-07-10 22:16 UTC - T008@d4a7c930 cutover verification passed: reviewed migration applied, source plan noop, dogfood knowledge reconciled, 44 generated core files matched source, and source/generated lint were clean; independent review pending after reviewer tool error
- 2026-07-10 22:26 UTC - completed T008@d4a7c930: canonical dogfood migration, memory/project guidance reconciliation, and regenerated source-identical .github core approved; 59 focused tests passed, migration remained noop, lint/compose were clean; final-newline hygiene deferred to T012
- 2026-07-10 23:01 UTC - T009@1d6a9e35 blocked after reviewer rejection: mirror must filter epics and surface deferred executable tasks, reject malformed or duplicate task structures, and strictly parse complete Beads inventory before writes
- 2026-07-10 23:43 UTC - completed T009@1d6a9e35 after revision: exact idea-owned Beads import/mirror, strict complete inventory parsing, executable issue filtering, deferred-task diagnostics, and structural no-write gates; 41 tests passed; independent review approved
- 2026-07-10 23:58 UTC - completed T010@e82c7a14: design workflow now uses exact idea ownership and canonical idea logs while preserving unrelated design/site brief terminology; 4 focused tests passed and all packs verified; independent review approved
- 2026-07-11 00:39 UTC - T011@6f31bd90 blocked after reviewer rejection: workflow must keep any nonempty Beads board authoritative after import, and the documentation classifier must reject active root brief or companion-brief ledger wording
- 2026-07-11 01:00 UTC - completed T011@6f31bd90 after revision: public brainstorm/ideas lifecycle, deprecated alias, exact execution authority, digest-bound migration, upgrade preservation, and expanded stale-term classifier; 57 contracts passed; independent review approved
- 2026-07-11 01:30 UTC - completed T012@b59e02c6: canonical project-state preservation, 44-file source/generated parity, final-newline normalization, and pristine 47-file release exclusions; 88 tests passed; independent review approved
- 2026-07-11 01:40 UTC - T013@2a7d84f1 blocked after final verification: noop migration still emits a no-marker Beads warning and five feature test files lack terminal LF; full suite otherwise passed 495 with one platform skip, and the stale board projection was regenerated
- 2026-07-11 02:20 UTC - canceled T013@2a7d84f1 at the user's direction: remaining migration verification was abandoned, not verified complete; `.dude/ideas/remove-legacy-compatibility.md` now takes precedence and this package has no remaining executable work
- 2026-07-11 02:20 UTC - regenerated the derived board after cancellation; Ready, In Progress, and Blocked are empty and T013 is retained in Done as explicitly canceled
<!-- dude:managed:end -->

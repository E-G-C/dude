<!-- audit log: .dude/ideas/038-bulk-pack-refresh.md#coordinator-log -->

# Tasks: Bulk Pack Refresh

Eight all-open canonical units implement
`.dude/specs/038-bulk-pack-refresh/spec.md`, prospectively and exactly owned by
`.dude/ideas/bulk-pack-refresh.md`.

The binding outcome is an explicit `@dude upgrade --all` flow: ordinary upgrade
stays core-only; reviewed core is applied and committed first; the upgraded
engine previews only profile-installed packs through Compose; pack mutation has
its own confirmation; remote packs bind to the core-selected concrete revision
while local targets keep precedence; the first pack failure stops later work;
and successful pack output lands in at most one aggregate commit before success
or partial-failure return. Core and pack mutations are separate boundaries.

Core source lives under `src/`; generated `.github/**` core is refreshed only
through `node scripts/build-dev.mjs` and is never hand-edited. No task may add a
lane, registry, scheduler, daemon, second board, second persistent state,
speculative renderer, duplicate projection/ownership/transaction path, global
atomicity claim, auto-push, or auto-merge. A required behavior outside the
defined boundaries stops as `contract-mismatch: redefine-required`.

No generated board is needed.

## Phase 1: Architecture Handoff

**Goal**: Confirm the smallest module boundaries and commit protocol before code
or tests choose interfaces.

- [x] T001@61726368 [Shared] Dispatch Architect with `dude-bundle-upgrade`, `dude-compose`, `dude-generic-routing`, and `project` to inspect the current `src/skills/dude-bundle-upgrade/upgrade.mjs` and `src/skills/dude-compose/compose.mjs` topology and return a concrete read-only architecture handoff for `plan.md` Chosen Design sections 2 through 5: one shared Compose refresh-preparation seam used by preview and mutation; dynamically loading the installed upgraded Compose engine after the committed core apply; post-core evidence binding to the existing reviewed plan and upgrade-log `plan_id` without new state; sorted installed-map membership; local target precedence; remote `resolved_commit` binding; exact successful-path union plus profile staging; one hook-disabled aggregate commit after all success or first failure; lint and commit failure classification; and clean rollback usability. Reject any duplicate renderer, projection, ownership, transaction, pack-plan artifact, resume state, per-pack commit, parallel mutation, or generalized framework. Report decisions to the coordinator without editing definition artifacts. (US1, US2, US3, US4 -> FR-003 through FR-013, FR-016 through FR-018; SC-001 through SC-009, SC-011)

## Phase 2: Implementation And Focused Coverage

**Goal**: Implement the core/Compose behavior and direct user documentation, then
pin every required boundary with deterministic focused tests.

- [x] T002@696d706c [Shared] Dispatch Coder with `dude-bundle-upgrade`, `dude-compose`, and `project` to implement the approved T001@61726368 handoff and `plan.md` Chosen Design sections 2 through 5 in authoritative source. In `src/skills/dude-compose/compose.mjs`, extract only the existing refresh preparation needed by both callers, add read-only `refresh <name> --dry-run` reporting, and keep ordinary refresh's canonical projection, ownership, profile reread, transaction, rollback, and cleanup. In `src/skills/dude-bundle-upgrade/upgrade.mjs`, add only `packs-preview` and confirmation-gated `packs-apply`, validate the matching committed core result and clean branch, use sorted installed membership, pass the core plan's source and concrete commit while preserving local target precedence, stop on the first pack refusal, run lint, stage only successful old/new pack paths plus profile, make at most one hook-disabled aggregate commit, verify clean success/partial return, and retain safety tag, rollback, no-push, and no-auto-merge behavior. Keep status/plan/apply/rollback, schema-v1 core plans, plain upgrade, dry-run, source/ref, skip-removals, and core confirmation unchanged. Update `docs/upgrading.md` and the applicable upgrade command reference in `docs/commands.md`; update project memory only if a live statement becomes false. Do not hand-edit `.github/` or author tests. (US1, US2, US3, US4 -> FR-001 through FR-018; SC-001 through SC-011)
    deps: T001@61726368

- [x] T003@74657374 [P] [Shared] Dispatch Tester with `dude-bundle-upgrade`, `dude-compose`, `project`, and the installed testing/verification skills applicable at execution time to author the focused regressions from `plan.md` Chosen Design section 7 in `src/skills/dude-compose/compose.test.mjs` and `src/skills/dude-bundle-upgrade/upgrade.test.mjs`, plus only directly applicable existing prose/build contracts. Cover read-only preview parity and cleanup; all-success ordering and one aggregate commit; first-pack refusal; partial progress with successful output committed; no installed packs; local precedence; remote concrete-revision binding after a moving selector advances; plain upgrade unchanged; explicit pack-confirmation refusal and wrong-token refusal; a released bundle without `library/`; dirty-tree refusal before core and pack phases; and retained status/dry-run/rollback/source/ref/skip-removals/safety/no-push/no-auto-merge behavior. Use local filesystem and `file://` Git fixtures, exact mutation/commit snapshots, and deletion-sensitive assertions. Do not add external-network, scheduler, persistence, renderer, exhaustive-matrix, or hypothetical crash tests. Run the two focused suites and report failures without implementing product fixes or mutating task state. (US1, US2, US3, US4 -> all FR; all SC)
    deps: T001@61726368

- [x] T004@736b696c [P] [Shared] Dispatch Skill Smith with `dude-skill-authoring`, `dude-bundle-upgrade`, `dude-compose`, `dude-pack-writing-avoid-ai-tropes`, `dude-pack-writing-style`, and `project` to update authoritative `src/skills/dude-bundle-upgrade/SKILL.md` for the `--all` grammar, unchanged plain/dry-run/status/rollback behavior, core-first commit, upgraded-engine pack preview, separate `confirm packs` gate, installed-only membership, exact remote revision, local precedence, empty profile, first-failure reporting, one aggregate pack commit, clean branch, rollback, and no push/merge; and update `src/skills/dude-compose/SKILL.md` only for the read-only refresh preview contract while retaining ordinary refresh as canonical. Keep trigger frontmatter accurate and self-contained without feature-local identifiers. Do not edit generated `.github/` or broaden either skill. (US1, US2, US3, US4 -> FR-001 through FR-018; SC-001 through SC-011)
    deps: T001@61726368

## Phase 3: Integration And Generated Parity

**Goal**: Resolve focused findings, align authoritative surfaces, and generate the
dogfood core exactly once from source.

- [x] T005@696e7467 [Shared] Dispatch Coder with `dude-bundle-upgrade`, `dude-compose`, `dude-receiving-code-review`, and `project` to integrate the unchanged-intent outputs of T002@696d706c, T003@74657374, and T004@736b696c. Reproduce and fix focused failures in their owning source without weakening assertions; ensure direct docs are `src/skills/dude-bundle-upgrade/SKILL.md`, `docs/upgrading.md`, and `docs/commands.md` as applicable, with Compose source guidance changed only for its new preview caller; leave project memory untouched unless existing guidance is demonstrably stale. Run `node scripts/build-dev.mjs`, inspect generated changes as projection only, run it a second time with no further change, and require exact source/generated parity for every changed core module and skill. Do not mark tasks, edit definition artifacts, or create another state surface. (US1, US2, US3, US4 -> all FR; all SC)
    deps: T002@696d706c, T003@74657374, T004@736b696c

## Phase 4: Independent Verification And Acceptance

**Goal**: Obtain fresh verification, software review, and requirements acceptance
over one unchanged integrated revision.

- [x] T006@76657269 [Shared] Dispatch Tester with `dude-verification-before-completion`, `dude-bundle-upgrade`, `dude-compose`, and `project` to independently verify the unchanged T005@696e7467 revision. Run focused Compose and upgrade suites; build-dev and build-release tests; all-success, one-pack refusal, partial progress, no installed packs, local precedence, remote revision binding, ordinary upgrade unchanged, explicit pack-confirmation refusal, released bundle without `library/`, and dirty-branch prevention fixtures; `node scripts/build-dev.mjs` twice with idempotent second run and exact source/generated parity; the recursive suite `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`; `node .github/skills/dude-lint/lint.mjs .` with zero failures; `node .github/skills/dude-compose/compose.mjs verify`; a pristine external release build followed by release lint against only the documented warning baseline; backlog freshness when coordinator-owned task/log changes make it applicable, otherwise record not applicable; and `git diff --check`. Record commands, outputs, revision, and findings only. Any failure returns to its owning task and requires a fresh complete Tester pass. (US1, US2, US3, US4 -> all FR; all SC)
    blocked-by: test-failure: current-format refresh guidance passes alone but fails in concurrent recursive suite
    deps: T005@696e7467

- [x] T007@63726576 [Shared] Dispatch Code Reviewer with `dude-bundle-upgrade`, `dude-compose`, `dude-reviewer-protocol`, and `project` to review the unchanged T006@76657269 software diff and evidence for correctness, maintainability, security, and performance: shared Compose preparation rather than duplication; no preview mutation; exact installed-map scope; local/remote source authority; upgraded-engine loading; post-core plan binding; first-failure stop; Compose rollback preservation; exact successful-path staging; hook-disabled aggregate commit; clean success/partial return; lint/commit failure truthfulness; unchanged ordinary commands and safety; released-bundle operation; and every YAGNI prohibition. Report findings only. A rejection returns to Architect, Coder, Tester, or Skill Smith as appropriate and requires fresh T006 evidence before re-review. (US1, US2, US3, US4 -> all FR; all SC)
    deps: T006@76657269

- [x] T008@72657677 [Shared] Dispatch Reviewer with `dude-reviewer-protocol`, `dude-bundle-upgrade`, `dude-compose`, and `project` to decide independent requirements acceptance on the unchanged T007@63726576 revision and the same fresh Tester evidence. Check every FR-001 through FR-018 and SC-001 through SC-011; all required direct coverage; core-first and separate transaction boundaries; authoritative upgraded-engine preview and explicit pack confirmation; installed-only/no-install authority; local precedence and remote concrete revision; release bundles without `library/`; successful/failed/not-attempted reporting; one aggregate successful-pack commit and clean branch; rollback/no-push/no-auto-merge; ordinary upgrade/dry-run/status/rollback/flags unchanged; source/generated parity; pristine release; backlog applicability; and absence of prohibited state or framework. Return only an approval, rejection, or escalation with concrete findings; do not mutate artifacts or task state. (US1, US2, US3, US4 -> all FR; all SC)
    deps: T007@63726576

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002, FR-015, FR-016 / SC-004, SC-009 | User grammar, core flow, direct guidance, ordinary-regression preservation | T002@696d706c, T003@74657374, T004@736b696c, T006@76657269, T008@72657677 |
| FR-003 through FR-005 / SC-001, SC-005 | Core-first postcondition, upgraded preview, separate confirmation | T001@61726368, T002@696d706c, T003@74657374, T006@76657269, T008@72657677 |
| FR-006 / SC-002 through SC-004 | Sorted installed-map membership and no installation | T001@61726368, T002@696d706c, T003@74657374, T006@76657269, T008@72657677 |
| FR-007, FR-010 / SC-001 through SC-003, SC-011 | Shared Compose preparation and retained per-pack transaction | T001@61726368, T002@696d706c, T003@74657374, T007@63726576, T008@72657677 |
| FR-008, FR-009 / SC-006 through SC-008 | Local precedence and concrete remote revision | T001@61726368, T002@696d706c, T003@74657374, T006@76657269, T008@72657677 |
| FR-011 through FR-014 / SC-001 through SC-005 | First-failure stop, aggregate commit, clean report, empty set | T001@61726368, T002@696d706c, T003@74657374, T006@76657269, T007@63726576, T008@72657677 |
| FR-017, FR-018 / SC-009, SC-011 | Separate boundaries, rollback, and prohibited-surface checks | T001@61726368, T002@696d706c, T004@736b696c, T006@76657269, T007@63726576, T008@72657677 |
| All FR / all SC | Generated parity, full verification, Code Reviewer, independent Reviewer | T005@696e7467, T006@76657269, T007@63726576, T008@72657677 |

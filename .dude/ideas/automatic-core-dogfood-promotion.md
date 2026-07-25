---
title: Automatic Core Dogfood Promotion
slug: automatic-core-dogfood-promotion
status: defined
spec_path: .dude/specs/008-automatic-core-dogfood-promotion/spec.md
---

# Idea: Automatic Core Dogfood Promotion

## Idea

Automate this repository's internal dogfood promotion for the main Dude core developed in `src/`. This does not apply to optional packs under `library/packs/` or to technical-docs work. Dogfood promotion means projecting accepted core source changes into generated `.github/` core as a final feature-close requirement; it is distinct from release promotion such as merging, tagging, or publishing.

The reusable promotion procedure lives in `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`. Dude discovers and loads this project-local skill only when the canonical terminal promotion task becomes ready, after every source-contributing task and all acceptance prerequisites, including fresh verification and independent review, are satisfied. Completing a spec alone never makes the terminal task ready, loads the skill, or materializes anything.

When the terminal task is ready, the skill promotes an accepted feature that changed core `src/` by running the existing `node scripts/build-dev.mjs` before final feature close. The resulting generated `.github/` core changes become part of the same feature delivery. If the feature changed no core source, promotion is a verified no-op.

After materialization, verify exact source/generated parity; verify that installed packs, the project skill, workflows, and `.dude` data were not overwritten; run focused and full tests as required; run Dude lint; and validate a pristine release build and lint. Any promotion or validation failure leaves the feature open or blocked, and Dude must not claim delivery.

CI reruns `build-dev` and fails if it produces a diff. CI is a verification backstop only: it must not auto-commit, push, tag, publish, or otherwise mutate the developer branch. This is project-local dogfood and CI process for this repository, not a user-facing command or capability, a release or publish flow, downstream `@dude upgrade`, or behavior shipped to end users.

Keep `.github/skills/project/SKILL.md` as concise project routing and convention authority; it may identify the terminal-task rule and route to the local skill, but it must not carry a large permanent promotion procedure. The local skill is repository-specific workflow support, not a shipped core skill or an end-user skill.

Integrate the rule into the existing project-local close process and current build-dev and CI authorities. Do not create a promotion framework, version ledger, state store, command, release flow, or general user-facing capability.

## Assumptions

- The trigger is settled: Dude discovers and loads `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` when the canonical terminal promotion task becomes ready after all source-contributing tasks and acceptance prerequisites, not when a spec is completed.
- Procedure ownership is settled: the project-local skill carries the reusable promotion procedure, while `.github/skills/project/SKILL.md` stays concise routing and convention authority. The local skill is not shipped as core or exposed as an end-user skill.
- The coordinator-before-close plus CI-verification model is settled: the local procedure materializes accepted, independently reviewed `src/` changes before close, while CI independently checks that materialization is current.
- Project-local scope and no CI auto-commit are settled. This feature does not alter downstream bundle behavior or grant CI release authority.
- The existing `build-dev` materializer and current project-local close and CI surfaces remain the integration points.
- Dogfood promotion ends at accepted `src/` to generated `.github/` projection and validation. Release promotion remains a separate merge, tag, and publish concern.

<!-- dude:managed:start -->
## Normalized Intent

### Load The Local Procedure At Terminal Readiness

- Keep the reusable promotion procedure in `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`.
- Discover and load the project-local skill only when the canonical terminal promotion task becomes ready after every source-contributing task and all acceptance prerequisites, including fresh verification and independent review, are satisfied.
- Treat spec completion alone as neither a skill trigger nor authorization to materialize generated core.

### Promote Accepted Core Changes Before Close

- For an accepted feature that changed core `src/`, run the existing `node scripts/build-dev.mjs` from the ready terminal task before close and include generated `.github/` core changes in the same feature delivery.
- Treat a feature with no core source changes as a verified promotion no-op.

### Verify Materialization Before Delivery

- Require exact source/generated parity after materialization and prove that installed packs, the project skill, workflows, and `.dude` data were not overwritten.
- Require the applicable focused and full tests, Dude lint, and pristine release build and lint before final feature close.
- Leave the feature open or blocked after any promotion or validation failure, without claiming delivery.

### Keep Project, CI, And Release Authority Separate

- Keep `.github/skills/project/SKILL.md` concise as routing and convention authority, with the reusable procedure owned by the project-local skill.
- Keep the local skill repository-specific; do not ship it as core or expose it as an end-user skill.
- Have CI rerun `build-dev` and fail when it produces a diff, as an independent verification backstop.
- Prohibit CI from auto-committing, pushing, tagging, publishing, or mutating the developer branch.
- Keep dogfood promotion separate from release promotion and keep this repository-local process out of user-facing commands, downstream `@dude upgrade`, and shipped end-user behavior.

## Constraints

- Scope is limited to the main Dude core developed in `src/`; optional packs under `library/packs/` and technical-docs work are excluded.
- Promotion begins only when the canonical terminal promotion task is ready after all contributing tasks and acceptance prerequisites; completing a spec never triggers the local skill or materialization.
- The reusable procedure belongs in `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`; `.github/skills/project/SKILL.md` remains concise routing and convention authority.
- The local skill is project-only, not a shipped core skill or general end-user skill.
- Use the existing project-local close process, `build-dev` materializer, and CI authorities.
- Generated `.github/` core changes produced from accepted `src/` changes belong to the same feature delivery.
- Do not overwrite installed packs, the project skill, workflows, or `.dude` data during materialization.
- CI is verification-only and must not commit, push, tag, publish, or otherwise mutate a remote or developer branch.
- Do not create a promotion framework, version ledger, state store, command, release flow, or general user-facing capability.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-22 UTC - brainstorm captured
- 2026-07-22 UTC - defined -> .dude/specs/008-automatic-core-dogfood-promotion/spec.md
- 2026-07-22 UTC - definition-review rejected: accepted lifecycle-test, evidence-carrier, and CI-boundary gaps
- 2026-07-22 UTC - definition-revised -> .dude/specs/008-automatic-core-dogfood-promotion/spec.md
- 2026-07-22 UTC - execution reconciliation applied after definition review: changed open T001@8f2c1a47 and T003@c4e6812d in place, kept open T002@5b7d930e, dropped 0, added 0, and transferred no task state, board, archive, discovered work, or execution history
- 2026-07-22 UTC - Work iteration 1 claimed T001@8f2c1a47 under autonomous policy; pre-start Inspection 9b22dda8ccdbb61b5c510404e92e67e7fb3cf821220a1c0850eded14ee1e576f had no blockers and no ObjectiveRegistry entry; existing `scripts/current-format-contract.test.mjs` retirement edits were baselined at 5b8f9665840fc4de1f5f5488baca011f0ffa984f0245381abab989ac02a80ad2 for preservation
- 2026-07-22 UTC - Work iteration 1 recovery cycle 1 authorized after Code Reviewer rejection: post-review Inspection 03fa3f77b9d2e4741ecc1ff0dd8954335a43213feadc01e3308a1bcd91ed5afc accepted underspecified canonical evidence encoding and a pipefail-prone ignored-entry guard; remediation is limited to the project skill, CI workflow, and current-format test with fresh verification and re-review
- 2026-07-22 UTC - Work iteration 1 closed T001@8f2c1a47: tests-first contract moved from 45/47 to 48/48 passing; exact canonical evidence encoding and both actual Bash ignored-entry guards were verified; Code Reviewer re-review APPROVE; no shipped core, remote mutation, or prior context-footprint contract was introduced
- 2026-07-22 UTC - Work iteration 2 claimed T002@5b7d930e under autonomous policy; pre-start Inspection 54fb6498c86aba0228b395e3b1b24b66540eddfb5a8019b28ffb5a0487cb4d86 had no blockers and no ObjectiveRegistry entry; clean baselines were `scripts/build-dev.test.mjs` df685c8b79ccb9952e83835fb66caf255384b1c4e5ab91d75cc06f10678bbe0f and conditional `scripts/build-dev.mjs` aa1e09d676d858c46569a39ec37a17d491604c1a7adf1ad9b105eb4c2077d4ff
- 2026-07-22 UTC - Work iteration 2 stopped on T002@5b7d930e as external-dependency: the new protected-boundary fixture passed and `scripts/build-dev.mjs` remained aa1e09d676d858c46569a39ec37a17d491604c1a7adf1ad9b105eb4c2077d4ff, but pre-existing `.github/agents/dude.agent.md` a97a436370321e2831e8d9f05f1e37e41b0c3ab9af73a71656acc3c25b0c7b34 differs from authoritative `src/agents/dude.agent.md` d08e9dcb87d1674f709d99e06aa542aec8e8af7a034adfcf2aedd83772aaf43f; post-failure Inspection 3c32eb2cab7b219c0db1fe5d6cd9227aa2ee9f001b46e708575f57a1e0d6df98 refused autonomous recovery
- 2026-07-23 UTC - user-directed discard resolved the experimental `.github/agents/dude.agent.md` tool-list drift; generated/source bytes now both equal d08e9dcb87d1674f709d99e06aa542aec8e8af7a034adfcf2aedd83772aaf43f. T002@5b7d930e remains blocked by Feature 003 T004@9e1b6d43 source `directory-risk.mjs` pending accepted dogfood materialization; fresh Inspection cfe5376d48f67123a35f183b935f41ea55d488ca096da53b3a4c96d34bd279eb classified it as external-dependency
- 2026-07-24 UTC - brainstorm refresh: intent updated to load the project-local promotion skill when the canonical terminal promotion task becomes ready, never on spec completion
- 2026-07-24 UTC - definition-revised -> .dude/specs/008-automatic-core-dogfood-promotion/spec.md
- 2026-07-24 UTC - execution reconciliation applied after definition revision: kept T001@8f2c1a47 done and T002@5b7d930e in progress one-to-one, changed open T003@c4e6812d in place, added open T004@e2a91f6c with no state transfer, dropped 0, removed T002's resolved external-dependency blocker, and preserved no board, archive, discovered work, or execution history
<!-- dude:managed:end -->
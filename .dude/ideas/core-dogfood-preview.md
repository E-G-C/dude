---
title: Core Dogfood Preview
slug: core-dogfood-preview
status: draft
spec_path:
---

# Idea: Core Dogfood Preview

## Idea

> it seems this feature is too rigid. It needs to be more flexible to allow turn around scenarios. I thought this feature would be something small, but has become a headache.

> We're looking for a quick way to test our own implementation, but the current gates are too rigid while we are in the middle of features and stuff. There might be other things in motion and they won't pass because the dog food promotions constraints.

> I want simplification as much as possible. I'm about even considering removing the whole feature altogether

The selected decision rejects the proposed temporary-worktree preview command with focused checks. Direct canonical `node scripts/build-dev.mjs` is sufficient preview, even though it projects all current `src/**` edits together. The outcome is no new preview product: use the repository's existing explicit development loop and document it clearly.

This preview requires no separate definition package. Its developer-documentation requirement is consumed by the Core Dogfood Close Simplification retirement feature.

The selected loop is:

1. Edit authoritative `src/**`.
2. Run focused tests for the change.
3. Run `node scripts/build-dev.mjs` to sync the complete current `src/**` worktree into the generated `.github/` core projection.
4. Reload or restart the active VS Code agent session when discovery or frontmatter changes require it.
5. Exercise one named behavior against `.github/`.
6. Continue iterating without claiming acceptance or close.

`scripts/build-dev.mjs` already exports `buildDev({ repoRoot })` and exposes `node scripts/build-dev.mjs [--repo .]`. It removes stale core outputs, preserves packs, local and project-owned customization, workflows, and `.dude`, and is covered by byte-parity tests and CI's dev-bundle drift check.

This loop previews all current `src/**` edits together, not a feature-isolated patch. It is intentionally non-authoritative. Concurrent `.dude`, documentation, pack, script, and other non-`src` work can coexist. Concurrent unrelated `src/**` changes are included in the projection and cannot be attributed separately. That may be acceptable for implementation-time testing, but the documentation must disclose it.

Preview needs no baseline, declaration digest, accepted line, task-state mutation, review envelope, or full-suite run. A disposable checkout or worktree remains an optional manual technique for a contributor who rarely needs isolation; it must not become required preview machinery.

The motivating scenario remains Feature 010 being projected so Feature 007 could exercise authorization through the generated runtime before Feature 007 was complete. The existing `build-dev` loop satisfies that need. This draft requires no separate definition package or preview implementation; its documentation is delivered by the close-retirement feature. A new command must not be invented merely to create an implementation artifact.

Generated `.github/` core remains non-authoritative, dogfood must derive from authoritative `src/**`, and a hand-edited generated file must never be blessed. Clean full-suite runs observed during the motivating work took roughly 463-471 seconds, about 7.7-7.9 minutes, so final-close verification is not the mandatory implementation-time loop.

### Earlier Captured Context

The following text is preserved verbatim from the earlier brainstorm. The latest maximum-simplification direction above supersedes it where it assumes a new preview product or feature-isolated projection.

This is the primary, low-effort/high-return outcome: a fast, non-authoritative way to exercise an in-progress authoritative `src/**` change through a source-derived dogfood projection while other legitimate feature work remains in motion.

Preview is for testing only. It does not append accepted evidence, close a terminal, mutate durable task state, or claim final acceptance. Final accepted core promotion remains a distinct later operation.

The motivating scenario is Feature 010 being promoted so Feature 007 could authorize through the generated runtime before Feature 007 was complete. The desired implementation-time loop is to exercise a targeted core behavior through dogfood without requiring every concurrent feature or repository concern to be ready for final close.

Concurrent changes are normal. Preview should isolate the targeted core change instead of requiring the entire repository to be globally quiet, but this draft does not choose exact paths, a patch, a worktree, canonical generated output, or another isolation mechanism.

The source-of-truth and parity guarantee remains. Generated `.github/` core is non-authoritative, dogfood must derive from authoritative `src/**`, and a hand-edited generated file must never be blessed. Clean full-suite runs observed during the motivating work took roughly 463-471 seconds, about 7.7-7.9 minutes, so final-close verification cannot be the mandatory preview loop.

The product should favor low effort, high return, and flexibility. It should not introduce a broad framework, generalized environment manager, or second workflow system.

## Required Developer Workflow Documentation

Updating existing developer documentation is part of the user-visible outcome. The audience is a contributor who has pulled or cloned the Dude repository and needs to understand the development path without already knowing its ownership tiers. Exact documentation files are intentionally left for definition and planning.

The final documentation must:

- Show how to identify whether a proposed change belongs to core source, pack source, project-local customization, or docs only.
- Show the pack path for work under `library/packs/<name>/`: author or change the pack, run pack-focused verification, use a disposable install for live pack validation, and do not use core `src/**` to `.github/**` promotion.
- Show the simplest core path exactly: edit `src/**`, run focused tests, run `node scripts/build-dev.mjs`, reload or restart the active VS Code agent session when discovery or frontmatter requires it, exercise one named behavior against `.github/`, and continue iterating.
- Explain that this projects the complete current `src/**` worktree, includes unrelated concurrent `src/**` edits without separate attribution, preserves non-core project work, and remains informational and non-authoritative.
- Keep final accepted core work visibly separate and later: run fresh normal verification and independent review, ensure source-to-generated parity, and commit authoritative `src/**` with generated `.github/` core.
- Explain that a disposable checkout or worktree is optional manual isolation, not a required subsystem.
- Include at least one concise end-to-end pack-change example and one concise end-to-end core-change example.
- Avoid duplicate ownership: if direct `build-dev` preview needs no separate definition, the close-retirement or simplification work consumes this documentation requirement.

## Open Questions

1. Is direct canonical `build-dev` preview sufficient, accepting that all current `src/**` edits are previewed together and cannot be attributed separately?
   Answer: Direct canonical `node scripts/build-dev.mjs` is sufficient preview; it previews all current `src/**` edits together.
2. Is an optional manually created disposable checkout or worktree enough for rare isolation needs, with no new preview tooling?
   Answer: Optional manually-created disposable checkout or worktree is sufficient for rare isolation; no new preview tooling.
3. What is the minimum preview check set: focused tests plus byte parity plus one named behavior, or even less?
   Answer: The default preview check set is focused tests, source/generated parity, and one named behavior against `.github/`; contributors may run less while iterating, but documentation presents this as the trustworthy loop.
4. What target wall-clock time should a small preview meet? Is under 2 minutes the right low-effort goal?
   Answer: Target under 2 minutes for a small preview, excluding manual reload and the named behavior's own external latency.
5. Should successful preview remain informational only, with final acceptance always based on fresh verification?
   Answer: Preview evidence is informational only; final acceptance always uses fresh normal verification.

## Assumptions

These are the Spec Lead's assumptions, not the user's, and any of them can be overturned.

- Direct canonical `build-dev` is the selected preview path.
- Preview is an implementation-time testing loop, not a weaker form of accepted promotion or close.
- Successful preview remains informational and final acceptance uses fresh normal verification.
- Multiple features and unrelated project work may legitimately coexist. Non-`src` work is outside the projection, while every current `src/**` edit is projected together without feature-level attribution.
- No new preview subsystem, command, helper, worktree manager, evidence form, framework, state store, ledger, or persistent report is needed under the minimal candidate.
- A manually created disposable checkout or worktree is optional for rare isolation needs.
- The preview draft requires no separate definition package; its documentation is delivered by the close-retirement work.
- The project-local dogfood workflow remains distinct from shipped bundle behavior and from pack development.
- The technical-docs pack and broader technical-docs work are out of scope; only the contributor workflow documentation required by this feature is included.

### Earlier Captured Assumptions

The following assumptions are preserved verbatim from the earlier brainstorm. The current assumptions above supersede them where the latest answer changed direction.

- Preview is an implementation-time testing product, not a weaker form of accepted promotion or close.
- Final accepted promotion continues to require fresh final evidence even if preview succeeds, unless the user later resolves the evidence-reuse question differently.
- Multiple features and unrelated project work may legitimately coexist; preview should bound its target without adopting unrelated work.
- No projection, isolation, invocation, output, cleanup, or evidence mechanism is selected yet.
- The existing prohibition on a new compiler, runtime, helper, command, framework, state store, ledger, or persistent report remains in force unless explicitly lifted. Question 8 calls out the smallest interface case rather than assuming permission.
- The project-local dogfood workflow remains distinct from shipped bundle behavior and from pack development.
- The technical-docs pack and broader technical-docs work are out of scope; only the contributor workflow documentation required by this feature is included.

<!-- dude:managed:start -->
## Normalized Intent

- Maximize simplification by selecting the existing canonical `build-dev` loop as the complete preview path, with no new product feature or separate definition package.
- Make the exact implementation-time loop visible: edit `src/**`, run focused tests, run `node scripts/build-dev.mjs`, reload or restart when discovery or frontmatter requires it, exercise one named behavior against `.github/`, and iterate.
- Present focused tests, source/generated parity, and one named behavior against `.github/` as the trustworthy default preview loop while allowing less during iteration.
- Target under two minutes for a small preview, excluding manual reload and the named behavior's external latency.
- Make preview explicitly non-authoritative and informational, with no baseline, declaration digest, accepted line, review envelope, terminal close, durable task-state mutation, full suite, or final-acceptance claim; final acceptance always uses fresh normal verification.
- Disclose that preview projects the complete current `src/**` worktree. Unrelated non-`src` work can coexist, while unrelated `src/**` edits are included and cannot be attributed separately.
- Preserve authoritative `src/**` ownership, generated `.github/` non-authority, byte-parity protection, and rejection of hand-edited generated core.
- Keep manual disposable isolation optional and avoid any new preview command, helper, manager, evidence form, framework, or workflow system.
- Assign contributor documentation for ownership classification, pack work, the exact core loop, and later normal final verification to the Core Dogfood Close Simplification retirement feature.

## Constraints

- Decision refresh only. Keep this ledger `status: draft` with an empty `spec_path:` and do not create a preview definition package under `.dude/specs/**`.
- Generated `.github/` core remains non-authoritative and must never be blessed when hand-edited; preview output must remain source-derived.
- The minimal candidate uses existing `build-dev`; do not assume or invent a preview subsystem, command, helper, worktree manager, evidence form, framework, state store, ledger, or persistent report.
- Preview must not record a baseline, declaration digest, accepted line, or review envelope; close a terminal; mutate durable task state; or claim final acceptance.
- Preview covers the complete current `src/**` worktree rather than an isolated feature patch. This limitation must be disclosed.
- Concurrent `.dude`, docs, packs, scripts, and other non-`src` work may coexist. Concurrent unrelated `src/**` edits are included in preview and are not separately attributable.
- A disposable checkout or worktree may be documented only as an optional manual isolation technique.
- Final-close verification cannot be mandatory on every preview attempt; observed clean full-suite runs took roughly 463-471 seconds.
- Keep CI repair, the technical-docs pack and broader technical-docs work, pack-agent Scope conformance, and release tagging out of scope.
- Pack development must remain on its own author, focused-verify, and disposable-install path; it does not use core promotion.
- Updating existing contributor documentation with the ownership classification, pack path, exact core `build-dev` loop, normal final verification path, and two worked examples is required, whether owned here or consumed by close-retirement or simplification work.
- The Core Dogfood Close Simplification retirement feature is the sole owner of that documentation requirement.

## Definition Checklist

- [x] Latest maximum-simplification language and rejection of new preview machinery are preserved
- [x] Existing canonical `build-dev` loop is captured as the minimal candidate
- [x] Complete-worktree scope, concurrency limits, and non-authoritative boundaries are explicit
- [x] Required contributor workflow documentation and ownership handoff are captured
- [x] Five material decisions about sufficiency, optional isolation, checks, timing, and final evidence are answered
- [x] Full retirement is selected, so preview requires no separate definition package

## Coordinator Log

- 2026-07-29 UTC - brainstorm created by splitting `core-dogfood-promotion-flexibility`
- 2026-07-29 UTC - brainstorm refreshed; maximum-simplification direction added, with existing build-dev as the minimal preview candidate and full policy retirement as a final-close option
- 2026-07-29 UTC - brainstorm/decision refreshed; direct canonical build-dev preview selected, all five questions answered, and the retirement feature assigned the developer-documentation requirement
<!-- dude:managed:end -->
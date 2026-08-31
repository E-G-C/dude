---
title: Backlog Lifecycle Sync
slug: backlog-lifecycle-sync
status: defined
spec_path: .dude/specs/030-backlog-lifecycle-sync/spec.md
---

# Idea: Backlog Lifecycle Sync

## Idea

The backlog sometimes fails to show active work because committed `.dude/backlog.md` and `.dude/backlog.html` are not refreshed after task-state mutations.

`core-dogfood-preview` is also falsely listed as “awaiting definition” even though its own ledger says no separate definition package is needed and Feature 012 consumed and completed its documentation outcome.

Fix the status for `core-dogfood-preview` and fix the backlog rather than redesigning the dashboard.

### Verified topology and selected minimal change

- Live backlog rendering is correct. A temporary `board set ... in-progress --write` immediately appears in `backlog.mjs --root <tmp>`, while the committed Markdown and HTML remain stale until a separate generate command runs.
- `board.mjs set --write`, `apply-states --write`, and autonomous `applyLightweightWorkRequest` mutate authoritative task inputs but do not invoke the backlog writer.
- `.dude/backlog.md` and `.dude/backlog.html` remain derived, non-authoritative snapshots.
- Export one synchronous, pair-safe backlog artifact refresh helper from `src/skills/dude-lightweight-execution/backlog.mjs`; existing `generate --write` delegates to it.
- Invoke the helper after successful `board set --write`, `apply-states --write`, and autonomous `applyLightweightWorkRequest`.
- Do not invoke it after `render --write` or dry/read commands.

### No-package idea resolution

- Add one terminal idea lifecycle value, `status: resolved`, for an idea intentionally completed without owning a definition package.
- A resolved idea has an empty `spec_path:` and no exact-owner role. Its Coordinator Log records why and how it was resolved; add no extra resolution metadata unless definition proves it necessary.
- Backlog places a valid resolved idea in Completed rather than awaiting definition.
- Feature resolution and lint accept a resolved idea without treating it as a defined owner.
- First-definition publication and brainstorm/definition behavior must fail closed or preserve terminal status appropriately. A resolved idea cannot accidentally become an owner without an explicit supported lifecycle transition.
- After implementation, use the authorized brainstorm/lifecycle writer to refresh `core-dogfood-preview` to `status: resolved` with an empty `spec_path:`, preserve its user-controlled sections, and append a resolution event naming Feature 012.

### Failure semantics

- Canonical task, owner, and snapshot state remains authoritative. A derived backlog refresh failure must not roll back a valid canonical mutation.
- The backlog Markdown/HTML pair restores its preimages if the second artifact write fails.
- A guarded CLI returns nonzero with a clear “canonical task state committed; backlog refresh failed” diagnostic.
- The autonomous boundary retains its committed result and receipt and exposes a separate non-authoritative projection diagnostic. It must not report refusal or unchanged state after a canonical mutation committed.

### Bounded scope

- Add no watcher, server, event bus, new state, second board, or UI rewrite.
- Coordinator Log-only Activity changes and other definition-lifecycle changes may remain procedural unless a concrete test proves they must join this task-state fix. The core complaint is Active-task visibility.
- Refresh generated `.github/` core only through `build-dev`.

## Open Questions

No open questions remain. The verified topology, lifecycle outcome, failure behavior, and simplicity constraints are sufficient for definition.

## Assumptions

- Proceed to implementation after explicit definition; this action is brainstorm intake only.
- Use Lightweight Execution by default; no tracked-work import is requested.

<!-- dude:managed:start -->
## Normalized Intent

- Correct two independent defects without redesigning the backlog: stale committed projections after canonical task mutations, and false awaiting-definition classification for completed ideas that intentionally have no package.
- Add only terminal `status: resolved`. Treat it as valid only with an empty unnormalized `spec_path:` scalar value, no owner claim, and no owner or metadata diagnostic; invalid resolved shapes stay unavailable/ambiguous and never enter Completed.
- Preserve resolved lifecycle metadata on ordinary brainstorm refresh. Require an explicit brainstorm lifecycle request to reopen it to a draft before definition or Ship may create a package.
- Render only valid resolved ideas in Completed, without task counts or awaiting-definition language.
- Reuse one synchronous pair-safe backlog refresh operation for existing explicit generation and the three proven post-commit mutation paths.
- Supersede the requested separate autonomous projection diagnostic with the verified closed-result topology: preserve and return the exact existing autonomous committed result and receipt with no diagnostic field. The existing freshness check and its test/CI coverage detect a stale backlog pair, and the next successful coordinator refresh repairs it; guarded CLI writes still fail nonzero with the exact required diagnostic.
- Migrate `core-dogfood-preview` only after lifecycle support exists, preserving its user-controlled sections and recording that Feature 012 consumed and delivered its outcome.

## Constraints

- This definition creates only the lean core package at `.dude/specs/030-backlog-lifecycle-sync/`; no supporting definition artifact applies.
- Keep `.dude/backlog.md` and `.dude/backlog.html` derived and non-authoritative.
- Add no watcher, service, server, event bus, persistent state, second board, dashboard redesign, compatibility lifecycle, or extra resolution metadata.
- Refresh only after successful `board set --write`, `apply-states --write`, and autonomous `applyLightweightWorkRequest`; exclude `render --write`, reads, dry runs, and failed or refused mutations.
- Never roll back committed canonical task, snapshot, or owner state because a derived refresh fails.
- Render both backlog artifacts before writes and restore both preimages when the pair write fails.
- Preserve the exact existing autonomous committed result and receipt. Do not add a lane-result field, host-adapter product, runner warning, audit field, or result-schema extension solely for backlog refresh failure.
- Keep standalone Coordinator Log-only Activity refresh and brainstorm, definition, resolution, reopen, and order changes procedural.
- Preserve `core-dogfood-preview` user-controlled sections byte-for-byte and create no package for it.
- Rebuild generated `.github/` core only through `build-dev`.

## Definition Checklist

- [x] The two independent defects and their authority boundaries are explicit
- [x] Valid and invalid resolved metadata, preservation, reopen, ownership, and backlog behavior are testable
- [x] Covered and excluded refresh paths are closed and specific
- [x] Pair rollback, exact guarded diagnostics, and bounded autonomous observability are defined
- [x] Migration order and protected-section preservation are explicit
- [x] Specification, implementation plan, and three sequential task units are staged
- [x] No supporting artifact, guardrail checkpoint, or outcome-changing open question applies

## Coordinator Log

- 2026-08-11 UTC - brainstorm captured
- 2026-08-11 UTC - first definition staged after independent revision for closed-result topology and strict resolved-validity corrections
- 2026-08-11 14:25 UTC - T001@6c696665 closed and T002@72656672 claimed: terminal `status: resolved` now exists with a strict validity gate requiring exact status, an exactly empty unnormalized `spec_path`, no owner claim, and no owner or metadata diagnostic, so every invalid resolved shape stays unavailable rather than entering the resolved or package-complete branch, resolved ideas never resolve as defined owners, first-definition publication refuses them before any write, and guidance states preservation plus explicit brainstorm reopen; the user-authorized Spec Lead migration moved `.dude/ideas/core-dogfood-preview.md` to resolved with an empty path, byte-identical `## Idea`, `## Open Questions`, and `## Assumptions` sections, an append-only log gaining exactly one Feature 012 resolution event, and no package, which moved it out of Ideas awaiting definition into Completed; a mandated real-ledger regression now pins those three protected sections by exact byte length and heading-inclusive SHA-256, proven by falsification probes that failed on both a reverted status and an indented heading; the full source and scripts suites passed 1997 with zero failures, lint reported zero findings, and independent review approved after the user chose the heading-inclusive fix at the third-cycle escalation
- 2026-08-11 15:31 UTC - T002@72656672 closed and T003@61636365 claimed: `refreshCommittedBacklog({root})` now renders both projections from one poststate before either write, retains byte-or-missing preimages, restores both on pair failure, and backs the existing explicit generation, while exactly three hooks refresh after successful guarded `set --write`, guarded `apply-states --write`, and `applyLightweightWorkRequest`, leaving render, reads, dry runs, refusals, and failed mutations untouched; a derived refresh failure never rolls back committed canonical state, guarded writes exit 2 with the exact committed-state diagnostic and no success line, and the autonomous path keeps its unchanged `ok`/`phase`/`receipt` result with host, runner, receipt, audit, and schema surfaces untouched; independent review first rejected stale two-value lifecycle wording in the four public documents and lint guidance, which was corrected to `draft|defined|resolved` with preservation, explicit reopen, define and Ship refusal, and the strict Completed gate, then pinned by contract assertions proven through a falsification probe; the full suites reached 2008 passing with zero failures, lint reported zero findings, and a temporary-root reproduction of the original symptom now leaves both committed artifacts current with the claimed feature visible under Active
- 2026-08-11 16:39 UTC - T003@61636365 closed and Feature 030 reached full task completion: the recursive suite passed 2295 of 2299 with zero failures and four skips, lint reported zero findings, build-dev left the tree unchanged across repeated runs, compose verified 16 packs with zero failures and leftovers, a pristine 64-file release lint passed, and both committed projections stayed current through every state change without a manual regenerate; integrated acceptance first failed on a live production defect where `recovery.mjs` still accepted only draft and defined, which made real inspection return a malformed owner log once `core-dogfood-preview` became resolved, and independent review then found the same parser omitted the canonical `depends-on` key, so both parser sites now consume one exported frozen canonical key set that cannot drift from `feature.mjs`, each proven by falsification probes that failed on reverted predicates and passed after byte-exact restoration; the first defect was judged in-scope completion of the lifecycle requirement rather than a redefinition, the second was pre-existing at HEAD and latent here yet fixed under the same invariant, and independent review approved while recording one honest residual limitation, that `publish-first-definition.mjs` still separately rejects `depends-on` as a documented fail-closed authoring caveat deserving separate follow-up
<!-- dude:managed:end -->

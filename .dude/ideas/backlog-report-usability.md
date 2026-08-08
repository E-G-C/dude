---
title: Backlog Report Usability
slug: backlog-report-usability
status: draft
spec_path:
---

# Idea: Backlog Report Usability

## Idea

We think the Kanban backlogs still have usability problems. We need a better design.

The current report makes it difficult to follow the full lifecycle from the original idea through definition, tasks, completion, and history. At any time, a reader should be able to understand where work is now, what comes next, and what happened in the past. They need to zoom out to see feature dependencies and order, then drill down through idea -> feature/spec -> tasks -> each task status -> completion/history.

Everything should be visual and glanceable. Pictures communicate more than prose.

Speech-to-text correction: “chip feature is a huge list” meant **Shipped is a huge list**. Shipped should become a compact selection or library that supports drill-down, not remain a peer lane containing dozens of repetitive cards.

Independent review rejected Feature 025's presentation and trust model. The strongest contract mismatch was that pre-commit Git revision stamps become stale immediately while regeneration is only procedurally requested rather than mechanically enforced. The wall-clock timestamp contradicts byte-determinism, and the checkout basename makes output location-dependent. Activity is lexically misordered and sourced only from idea logs despite being labeled generically.

The review also found that six equal lanes mix execution state, priority or order, unprioritized work, and history. Empty lanes dominate, the distinction between Later and Backlog is opaque, Shipped overwhelms current status, and an all-history percentage rollup answers the wrong question. Completed task detail appears before current activity. Markdown and HTML need shared semantics, not identical layouts.

Implementation defects included nested-scroll clipping, missing scroll cues and focus behavior, mobile overflow, and misuse of Strata decorative boundaries.

Feature 025 remains closed and unchanged. This is a separate follow-up that explicitly supersedes the affected presentation and trust requirements without rewriting history.

### Approved Lifecycle Explorer direction

The user reviewed and explicitly said: **“approve the Lifecycle Explorer direction.”** Do not ask for visual-direction approval again.

1. **Where are we?** Show Current work, Ready/Next, Ideas awaiting definition, Defined features awaiting work, and Completed features. Do not show an all-history percentage rollup.
2. **Delivery map (zoomed out).** Visualize feature dependencies and order. Solid lines mean declared relationships; dashed lines mean relationships stated in idea text but not authoritative; no line means there is no order signal. Say “No explicit feature order declared” when order data is absent.
3. **Current work first.** Present Blocked, Active, and Next. Suppress empty subsections while retaining their counts.
4. **Planned work separate.** Show draft or unprioritized ideas as a compact list. Show “Prioritized for later” only when actual ordering exists.
5. **Completed library separate.** Use one collapsed native `<details>` section with compact one-line completed rows. Do not repeat 100% progress bars, Done chips, or nested scrolling.
6. **Feature drill-down.** Use native `<details>/<summary>` for each idea or feature. Its summary contains stable identity, title, the lifecycle ribbon Idea -> Defined -> Tasks -> Done, task-state counts, and its dependency signal. Expanded detail contains the real original idea excerpt and path, coordinator milestones, dependencies or order, spec user stories, and phases or tasks with glyph statuses and `deps:`. Drafts say “Awaiting definition - no tasks exist yet.”
7. Open `backlog-canvas` by default and show its real provisional body-stated dependency on completed `backlog-report` as dashed and non-authoritative.
8. **Markdown adapts.** Preserve the same Current / Planned / Completed semantics as a concise textual outline. Use Mermaid only for current work; do not mirror every HTML detail.
9. **Static functional realism.** Use no JavaScript, fake tabs, filters, search, network, server, external references, or remote fonts. Use native details and in-page anchors only. Provide normal page scrolling, responsive stacking, print-safe output, and meaningful accessible boundaries.
10. **Strata spectrum.** Use white or near-white planes, rules, 4px radii, no shadows, monospace only for metadata, deep variants for colored text, and meaningful 3:1 boundaries.

### Trust and freshness direction

- Remove wall-clock generation timestamps, checkout basenames, and pre-commit Git revisions from output.
- Output must be byte-identical for unchanged authoritative inputs and across checkout locations.
- If provenance is useful, use a deterministic source-input fingerprint rather than a commit revision or wall clock.
- Freshness must be mechanically checked through an existing validation or integration point, not left as procedural guidance and not implemented through a new service, watcher, or store.
- Name activity honestly and state its scope. The minimal approved default is **Coordinator activity**, parsed by date from idea Coordinator Logs, with same-date entries grouped and stably ordered.
- Do not aggregate Git history unless that scope is explicitly selected. Git aggregation could expose otherwise invisible ad-hoc work, but it is not required for the minimal first version.

### Scratch evidence

The approved prototype remains outside the repository:

- Generator: `/Users/eg/.copilot/session-state/dba9e5c0-ebf6-4e64-b964-2ec0d6ad20de/files/backlog-lifecycle-explorer.mjs`
- Preview: `/Users/eg/.copilot/session-state/dba9e5c0-ebf6-4e64-b964-2ec0d6ad20de/files/backlog-lifecycle-explorer.html`
- SHA-256: `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`

The prototype was deterministic across two runs and represented all 30 ideas exactly once. It used no JavaScript, external loads, remote fonts, fake controls, nested scrolling, or box shadows. The repository was untouched.

### Current data limitations

- No `.dude/state/backlog-order.md` currently exists.
- No idea currently declares `depends-on:` in frontmatter.
- The only known relationship is `backlog-canvas` body text stating a dependency on `backlog-report`. It is intentionally non-authoritative before first definition.
- The report must expose missing order and dependency data honestly and must not invent a roadmap.

## Open Questions

1. Should repository Git commits be added now as a separate activity source, or should the first version honestly show Coordinator activity only?
   Working assumption: keep the first version Coordinator-only under YAGNI. Git-history aggregation remains deferred unless the user explicitly expands scope.

## Assumptions

These are coordinator working assumptions, not user decisions. Correct any that are wrong.

- The approved Lifecycle Explorer direction is settled and does not need another visual-approval checkpoint.
- Coordinator-only activity is sufficient for the first version despite its explicit limitation that ad-hoc work outside Coordinator Logs is not shown.
- The exact existing integration point for mechanical freshness checking is a planning decision. Definition may require that such a point be selected and verified without prescribing it in user intent.
- No feature order or authoritative dependency may be inferred from titles, numbering, directory names, or prose.
- The external scratch files are design evidence, not repository artifacts or implementation inputs.
- Feature 025 remains immutable historical evidence. This follow-up supersedes only the affected current presentation and trust requirements.
- A deterministic source-input fingerprint is optional and should exist only if it provides concrete provenance value.

<!-- dude:managed:start -->
## Normalized Intent

- Replace the six-peer-lane backlog presentation with an approved Lifecycle Explorer that answers where work is now, what is next, and what happened previously.
- Make the complete idea-to-completion lifecycle visual and glanceable while supporting progressive drill-down into real source material, specifications, tasks, status, dependencies, and milestones.
- Separate Current, Planned, and Completed semantics rather than mixing execution state, prioritization, unprioritized work, and history into equal lanes.
- Put current work first, ordered as Blocked, Active, and Next, suppressing empty subsections while preserving truthful counts.
- Present draft and unprioritized ideas compactly, and present prioritized-later work only when authoritative ordering actually exists.
- Replace the oversized Shipped lane with one collapsed completed-feature library of compact rows and drill-down details.
- Provide a zoomed-out delivery map that distinguishes declared relationships, provisional body-stated relationships, and absent order signals without inventing a roadmap.
- Default-open `backlog-canvas` and show its body-stated dependency on `backlog-report` as dashed and explicitly non-authoritative.
- Give every idea or feature a native details-based drill-down with stable identity, lifecycle ribbon, task-state counts, dependency signal, source idea excerpt and path, coordinator milestones, applicable user stories, and canonical task details.
- Represent drafts honestly as awaiting definition with no tasks.
- Keep HTML and Markdown semantically aligned while allowing each format to use the layout appropriate to it.
- Keep HTML static, self-contained, accessible, responsive, print-safe, and usable through ordinary page scrolling, native details, and in-page anchors.
- Apply the approved Strata spectrum without shadows or decorative boundary misuse.
- Remove wall-clock timestamps, checkout basenames, and pre-commit revision stamps.
- Produce byte-identical output for unchanged authoritative inputs across repeated runs and checkout locations.
- Use a deterministic source-input fingerprint only if provenance is materially useful.
- Make freshness mechanically checked through an existing validation or integration point instead of relying on procedural regeneration guidance.
- Label the minimal activity view “Coordinator activity,” derive it only from idea Coordinator Logs, parse it by date, group same-date entries, preserve stable ordering, and state its scope explicitly.
- Keep Git-history activity aggregation outside the minimal first version unless the user explicitly expands scope.
- Preserve Feature 025 unchanged as closed history while this follow-up supersedes its affected presentation and trust requirements.
- Preserve one-to-one representation of discovered ideas without pinning the design to the prototype's current count of 30.

## Constraints

- Keep this as brainstorm intake only. Do not create or modify `.dude/specs/` and do not implement anything.
- Do not reopen, rewrite, or mutate Feature 025.
- Do not invent feature order, dependencies, roadmap relationships, activity, or task state.
- Add no new service, watcher, daemon, persistent store, second board, or execution authority.
- Use an existing validation or integration point for mechanical freshness enforcement.
- Keep generation deterministic and location-independent for unchanged authoritative inputs.
- Do not emit wall-clock generation time, checkout basename, or pre-commit Git revision as provenance.
- Add Git-history aggregation only after an explicit scope decision.
- Use no browser JavaScript, network access, server, external references, remote fonts, fake controls, or nested scrolling.
- Use normal document scrolling and provide visible, keyboard-usable, responsive, and print-safe interaction.
- Keep Markdown and HTML semantics shared without requiring identical layouts or duplicated detail.
- Use Mermaid only for current work in Markdown.
- Do not show an all-history percentage rollup.
- Do not show Later or dependency/order relationships without real authoritative data.
- Treat body-stated relationships as provisional and visibly non-authoritative.
- Use meaningful accessible boundaries and Strata-compliant contrast; do not use decorative boundaries as structural substitutes.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one follow-up idea ledger
- [x] Speech-to-text correction is preserved
- [x] Lifecycle Explorer visual direction is approved
- [x] Current, Planned, and Completed information architecture is recorded
- [x] Delivery-map authority semantics are recorded
- [x] Completed-library and feature-drill-down behavior are recorded
- [x] Markdown adaptation is recorded
- [x] Determinism, provenance, and freshness direction is recorded
- [x] Current order and dependency data limitations are recorded
- [x] Feature 025 historical treatment is recorded
- [x] Remaining activity-source question is consciously assumed Coordinator-only for the minimal first version
- [x] Definition can proceed without another user decision

## Coordinator Log

- 2026-08-08 UTC - brainstorm captured as a separate follow-up to closed Feature 025
- 2026-08-08 UTC - Lifecycle Explorer direction recorded as user-approved; external scratch evidence SHA-256 `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`
<!-- dude:managed:end -->

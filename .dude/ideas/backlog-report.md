---
title: Backlog Report
slug: backlog-report
status: defined
spec_path: .dude/specs/025-backlog-report/spec.md
---

# Idea: Backlog Report

## Idea

Feature 024 shipped a read-only cross-idea view, but the only way to reach it is running a Node command in a terminal and reading its output. My own users are not all technical enough for that. They need something high level and easy: a file they can just open and check.

I also think "focus" is a poor name for this.

Three things this feature should deliver:

1. Rename the shipped `focus` surface to `backlog`. My users already understand the word backlog, so "go check the backlog" needs no explanation. In scope: the script (`focus.mjs` -> `backlog.mjs`), the not-yet-created tie-break file (`.dude/state/focus-order.md` -> `.dude/state/backlog-order.md`), the SKILL subsection, and the contract needles. Explicitly not in scope: renaming the closed, shipped Feature 024 spec directory or its idea ledger. That history keeps its name.
2. A generated markdown file I can open directly, containing the buckets and the Mermaid kanban.
3. A generated, fully self-contained offline HTML report. It should be richer than the markdown: a report rather than just a board. I want to prototype first and decide later exactly what it includes.

My key constraint from the start still holds: do not spend model tokens regenerating markup. A deterministic script generates everything, and no model reasoning is involved in producing either artifact.

A Copilot app canvas extension carrying the same information was split out into a separate `backlog-canvas` idea. It depends on the HTML renderer this feature builds, so it cannot start until this ships. This ledger does not carry it.

### Decisions I have already made

- The approach is option C: a committed HTML/CSS skeleton template with placeholder slots that the generator script fills when it runs. The alternatives considered were (A) shipping a data blob plus browser JavaScript that builds the page when opened, and (B) keeping all markup inside the script as template strings. B and C produce identical output; I chose C because the markup stays editable as real HTML and diffs as HTML in review. A is rejected because it requires JavaScript in the browser. No option involves a server; the script runs once and writes a file.
- The bucket currently called `Unordered` should be renamed `Backlog`. That pool is the actual backlog: things that exist but are not prioritized yet. "Unordered" describes the data; "Backlog" describes what it means to the reader.
- Lanes must not grow unbounded down the page. They need a bounded height with a scrollable area.

### Coordinator findings from a working prototype

A throwaway prototype was built outside the repository and run against real repository data. It is not committed and is not part of this scope. What it showed:

- The HTML needs no Mermaid at all. A kanban board is CSS columns and a task chain is an ordered list, so the report is fully self-contained at roughly 16 KB with zero external references, no network, and no JavaScript. Vendoring `mermaid.js` for offline use would have added roughly a megabyte. Mermaid stays in the markdown, where GitHub renders it without any bundled dependency.
- Adding a sixth lane, `Shipped`, derived from the already-computed "every task done" condition, collapsed the noisy pool from 27 entries to 3. Those 3 are exactly the real drafts in flight. This resolves the known Feature 024 finding that fully-done ideas crowd the unprioritized pool. Feature 024's specification fixes exactly five buckets (FR-003, SC-004), so adding `Shipped` changes that contract and must be handled deliberately.
- The prototype's report sections were summary counts, the lane board with a per-feature task progress bar, sample task-order chains, and recent activity read from idea Coordinator Logs. These are candidates, not settled scope.
- A separate known Feature 024 wrinkle to carry: a done feature that another idea names in `depends-on:` has an ordering signal but no tie-break position, so it currently lands in `Next` rather than the unprioritized pool. A `Shipped` bucket evaluated before the ordering buckets would also resolve this.
- Writing a file is a new capability for this surface. Feature 024 shipped a read-only guarantee (FR-010, SC-006) and pinned it with a section-bound contract test, so adding a write path changes a contract that is currently enforced. It needs explicit definition rather than an incidental edit.

## Open Questions

1. Where do the two generated artifacts live, and what are they named?
   Answer: `.dude/backlog.md` and `.dude/backlog.html`, beside the state they describe.
2. When are they regenerated: at every coordinator state change, at the moment the task board is already re-rendered, or only on explicit request?
   Answer: Regenerate at every coordinator state change, at the same moment the task board is already re-rendered, so the artifacts cannot silently rot.
3. Do the markdown file and the HTML report share one bucket derivation and one generation pipeline? The working assumption is that they do, as two renderers over a single derived result.
   Answer: Yes. One bucket derivation and one generation pipeline feed both renderers.
4. Is the HTML skeleton one template file, or several partials such as one per report section?
   Answer: One template file. Split into partials only if it genuinely becomes unwieldy.
5. Which report sections ship first, given the prototype's four candidates: summary counts, the lane board with per-feature task progress, sample task-order chains, and recent activity?
   Answer: All four prototype sections ship first: summary counts, the lane board with per-feature task progress, task-order chains, and recent activity. They are already proven in the prototype and cost nothing more.
6. Is `Shipped` added as a sixth bucket to the shipped text view as well? That changes Feature 024's five-bucket contract, so it would need an explicit redefinition of 024 rather than a silent change here.
   Answer: Yes. `Shipped` is added as a sixth bucket to the text view as well, through an explicit `define feature-focus-order` re-definition of Feature 024 rather than a silent change here.
7. Does the `Later` bucket still earn its place once `Backlog` and `Shipped` exist?
   Answer: Keep `Later`. It is already shipped and tested; removing it is a separate decision.
8. Are the generated artifacts committed to the repository, or ignored?
   Answer: Commit both generated artifacts, because the whole point is that a non-technical reader can open the file in GitHub without running anything.
9. How does a reader tell that the report is stale?
   Answer: Stamp the generation time and the source revision into both artifacts so staleness is visible on the page.

## Assumptions

These are the coordinator's working assumptions, not user decisions. Correct any that are wrong.

- Assumption: both artifacts are generated and never authoritative, so either can be deleted and regenerated at will without losing anything.
- Assumption: a generated file rewritten at every state change is a projection, in the same sense as the existing task board fence and the generated `.github/` output, not a second source of truth.
- Assumption: no server, daemon, or service exists in any part of this. The script runs, writes a file, and exits.
- Assumption: no network request and no model call is involved in generating either artifact.
- Assumption: the existing read-only guarantee on the status surface still holds. Any writing is a distinct generation step that has to be defined rather than added silently alongside the read-only view.

<!-- dude:managed:start -->
## Normalized Intent

- Make the backlog readable by opening a file, so a non-technical reader does not need a terminal to see what is in flight.
- Rename the shipped `focus` surface to `backlog`: the script (`focus.mjs` -> `backlog.mjs`), the not-yet-created tie-break file (`.dude/state/focus-order.md` -> `.dude/state/backlog-order.md`), the SKILL subsection, and the contract needles.
- Leave Feature 024's closed spec directory and its idea ledger named as they are; shipped history keeps its name.
- Rename the `Unordered` bucket to `Backlog`, because that pool is the unprioritized backlog and the new name says what it means to the reader.
- Generate a markdown file carrying the buckets and the Mermaid kanban, openable directly.
- Generate a self-contained offline HTML report that is richer than the markdown, with no external references, no network, and no browser JavaScript.
- Fill a committed HTML/CSS skeleton template with placeholder slots at generation time (option C), so the markup stays editable and reviewable as HTML.
- Generate both artifacts deterministically from a script, spending no model tokens on markup.
- Give lanes a bounded height with a scrollable area so they do not grow unbounded down the page.
- Carry the prototype's `Shipped` lane, which collapses the crowded pool and also resolves the done-feature-named-as-a-dependency wrinkle, and change Feature 024's five-bucket contract through an explicit re-definition of 024 rather than silently here.
- Treat the write path as a deliberate change to Feature 024's pinned read-only guarantee, defined rather than edited in incidentally.
- Write both artifacts to `.dude/backlog.md` and `.dude/backlog.html`, commit them, and regenerate them at every coordinator state change alongside the existing task board re-render.
- Ship all four prototype report sections: summary counts, the lane board with per-feature task progress, task-order chains, and recent activity.
- Stamp the generation time and the source revision into both artifacts so a reader can see staleness on the page.
- Present six buckets (Active, Next, Blocked, Later, Backlog, Shipped) with Shipped evaluated first, keeping the derivation faithful to the shipped five-bucket logic and resolving the done-idea-named-as-a-dependency wrinkle.
- Colour each lane by a consistent traffic-light meaning: Shipped reads as done, Blocked as blocked, Later as deferred, Active as in progress, Next as upcoming, and Backlog as unprioritized, so done and next never share a colour.
- Render both artifacts from one bucket derivation through two renderers, keeping the portfolio rollup, work-item cards, state pills, task-order chains, and recent activity, all carrying real derived data.
- Make the report self-contained by baking a validated copy of the chosen visual language into the committed template and reading no installed pack at generation time, so it renders identically whether or not that pack is installed.
- Present one look in the report and only honest chrome (title, snapshot stamp, and factual counts), dropping any navigation or switch that cannot function in a static offline file.
- Supersede Feature 024's five-bucket contract (FR-003, SC-004) and read-only guarantee (FR-010, SC-006) for this surface only, without reopening or editing the closed Feature 024 package.

## Constraints

- Keep this as brainstorm intake only; do not create a definition package or begin implementation.
- Do not spend model tokens regenerating markup. A deterministic script produces both artifacts.
- Involve no model call, no network request, and no server or daemon in generating either artifact or in viewing the report.
- Keep the HTML report fully self-contained offline: no external references, no vendored Mermaid, no browser JavaScript.
- Keep Mermaid in the markdown only, where GitHub renders it without a bundled dependency.
- Do not rename `.dude/specs/024-feature-focus-order/` or `.dude/ideas/feature-focus-order.md`.
- Do not change Feature 024's five-bucket contract silently. Adding `Shipped` to the shipped text view requires an explicit redefinition of 024.
- Keep generated artifacts derived and never authoritative. Idea frontmatter stays authoritative for lifecycle, `tasks.md` for execution, and `depends-on:` plus the tie-break file for order.
- Add no second board, no second store, and no execution authority.
- Do not weaken the read-only guarantee on the existing text and Mermaid surfaces. Define the write path as a distinct generation step instead.
- Do not remove the `Later` bucket in this feature. It is already shipped and tested, so removing it is a separate decision.
- Do not carry the Copilot app canvas extension here. It lives in the `backlog-canvas` idea and depends on this feature's HTML renderer.
- Do not couple the report to an optional visual pack at generation time: bake validated token values and component styling into the committed template and update them deliberately if that pack changes.
- Do not present a palette or theme switcher, embed more than one palette, or render any non-functioning chrome such as navigation that leads nowhere in a static offline file.
- Confine the write path to exactly `.dude/backlog.md` and `.dude/backlog.html`, adding no other persistent state, second board, or execution authority, and superseding Feature 024's guarantees for this surface only without editing its closed package.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Template approach is selected
- [x] Rename scope and its exclusions are recorded
- [x] `Unordered` to `Backlog` bucket rename is decided
- [x] Location, naming, and commit status of the generated artifacts are decided
- [x] Regeneration trigger is decided
- [x] First set of report sections is selected
- [x] Treatment of a sixth `Shipped` bucket, and its effect on Feature 024, is decided
- [x] Staleness signal for the report is decided
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-07 UTC - brainstorm captured
- 2026-08-07 UTC - brainstorm rerun: Copilot app canvas extension as a third surface
- 2026-08-07 UTC - brainstorm rerun: canvas surface split out to backlog-canvas; questions 1-9 answered
- 2026-08-07 UTC - defined as feature 025 (.dude/specs/025-backlog-report/spec.md): spec/plan/tasks staged; focus->backlog rename, sixth Shipped bucket and Backlog rename superseding Feature 024 FR-003/SC-004, write path superseding FR-010/SC-006, two committed self-contained artifacts
- 2026-08-07 UTC - feature 025 complete: all 7 tasks [x] across rename, six-bucket derivation, Markdown + self-contained HTML renderers over one derivation, committed baked spectrum template, and regeneration/staleness wiring; Coder implemented, Tester acceptance PASS (full suite 2320/0, determinism modulo timestamp proven, membership parity 29=29=29 across derivation/backlog.md/backlog.html, write path confined, 024 untouched), Reviewer APPROVE; generated .dude/backlog.md + .dude/backlog.html committed; 2 pre-existing design->ms-brand orphan lint warnings remain out of scope (debrand follow-up), no failures
<!-- dude:managed:end -->

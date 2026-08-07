---
title: Feature Focus Order
slug: feature-focus-order
status: draft
spec_path:
---

# Idea: Feature Focus Order

## Idea

When ideas are in draft state before becoming specs, the only reference is the name. Context gets long, and I often work across two or three ideas at once because of dependencies between them. I lose track of which idea is next to develop and of the logical order between ideas.

Specs are numbered, so chronology is easy to read: the highest number is the most recent. Ideas have no number and no meaningful ordering, and alphabetical is not the working order.

The same confusion happens once two or three specs are also in flight: which one is active, which is being worked on, which is next.

I want a way to know what idea is being worked on, what is pending, and what is in progress, and the same for specs.

### Starting proposal from the coordinator

Recorded as a starting point, not as settled scope:

- One optional coordinator-owned ordered list under `.dude/state/`.
- It references idea ledgers only. The idea ledger stays the stable owner even after it becomes a numbered spec, so references never need rewriting when a package is created.
- Store order only. No copied statuses, no task glyphs, no second board, and no stored dependency graph beyond a declared `depends-on:` field. Live state stays where it already lives: idea frontmatter for lifecycle and dependencies, `tasks.md` for execution.
- `@dude status` derives and displays buckets: Active, Next, Later, Blocked, Unordered.
- If no order exists, report ambiguity rather than guessing an order.
- One explicit action sets or reorders focus. New ideas stay Unordered until intentionally placed.
- Accepted tradeoff for a first version: dependencies between drafts stay informal. A dependency engine would be premature.

### Visual aids to explore

I want to get creative here:

- Explore Mermaid diagrams as visual aids.
- Possibly an HTML page, but it must be token-smart: do not spend model tokens regenerating markup. My idea is a template that is populated on the client side by injecting feature and task state data.
- Mermaid has kanban boards, flow diagrams, and others. Which type fits the purpose?

### Coordinator's response on the visual aids

- The recommended Mermaid type is `kanban` (Mermaid v11.3.0 and later). Its lanes map directly to the focus buckets: Active, Next, Later, Blocked, Unordered. Kanban node metadata (`@{ ticket: ..., priority: ..., assigned: ... }`) can carry the spec number when a package exists.
- Types considered and set aside: `gantt` needs dates and durations this workflow does not have and would require inventing schedule data; `timeline` mostly repeats what spec numbering already conveys; `flowchart` fits dependency topology rather than focus order, so it is a candidate only if draft dependencies later become explicit; `stateDiagram-v2` describes the lifecycle as a type rather than where each item currently sits, which suits documentation more than a live board.
- The token-efficiency principle for the HTML: the markup is authored once and committed as a static template in the bundle. The only thing ever generated is a small data payload. A deterministic script emits the data, and the page renders it in the browser. That matches the existing project guardrail preferring deterministic scripts for rendering over model reasoning, and it means adding or removing a view is cheap.
- Architectural note worth preserving: text status, Mermaid kanban, and an HTML page are all derived views over the same small ordered list. If the stored data stays minimal and correct, each view is independently cheap to add or delete.

### Order and interconnection, raised after the kanban recommendation

Kanban represents status. But there is probably also a logical order or an interconnection between tasks, and maybe between features too, that has to hold for the final goal to be reached. Status says nothing about that.

So I think there are two dimensions here, and they should stay separate:

1. Status and focus: which item is active, which is next, which is later, which is blocked. Kanban fits this.
2. Logical order and interconnection: what has to happen before what, to reach the goal. Kanban does not express this.

### Coordinator's findings on order and interconnection

The two levels are not symmetric, and that asymmetry should drive the design.

- Task-level dependencies already exist as real structured data. As of this rerun, there are 128 `deps:` metadata lines across 23 `tasks.md` files, using durable keys such as `deps: T001@65786563`. The board tooling (`board.mjs` over the shared tasks engine) already parses those lines and uses them to compute the ready and blocked sets. Nothing renders that data as a graph today. A Mermaid `flowchart` of task dependencies inside one feature would therefore be a pure derived view over data you already maintain, and it would add no new state.
- Feature-level and idea-level dependencies do not exist anywhere as structured data. The only cross-feature links today are prose sentences inside Coordinator Log entries. A dependency graph between features would mean new hand-maintained state, and that state goes stale whenever scope changes.
- A flat ordered list is already a degenerate dependency chain. If ideas sit in a total order, "what is next" is answered without any graph. A real dependency graph earns its place only when work is genuinely parallel and converges, for example when two ideas independently block a third and a flat order cannot express the actual situation.
- Recommendation to weigh, not a decision: the task-level dependency flowchart is cheap and justified now because it renders data that already exists, while feature-level dependencies should wait until there is evidence that the flat order fails to express real work.
- Diagram types: `flowchart` covers dependency and prerequisite structure, `kanban` covers status buckets. They answer different questions, so if both ship they are two views rather than one merged diagram.

### Past inter-feature dependencies, raised after the deferral recommendation

I remember dependencies between features existing before, so deferring them because nothing structured holds them today does not sit right with me.

There is also a possible extended version of the `ship` command that implements several features at a time, with dependencies between them. Something would have to know that order.

### Coordinator's findings: the deferral recommendation is reversed on evidence

The challenge above was investigated and upheld. Feature-level dependencies belong in a first version.

- Inter-feature dependencies recur in this project's own history rather than being hypothetical. Recorded prerequisite language includes "Allow T009 to materialize under accepted Feature 008 `T006@62726964` before Feature 008 completes", "Feature 009 `T009@696e6369` alone owns materialization and acceptance before Feature 008 T002 resumes", and "a new, small feature rather than a refinement of 005 — sequenced after Feature 009 closes".
- Some of those constraints sat at task granularity across features. Features 008 and 009 were genuinely interleaved rather than merely ordered, which is a stronger relationship than plain feature-to-feature sequencing.
- The existing `deps:` field cannot be reused for cross-feature references. `depsSatisfied` in the shared tasks engine resolves a dependency key only within the same parsed file, and the parser deliberately does not throw on a dangling target. A foreign key placed in `deps:` today would evaluate as unsatisfied forever and silently block that task with no diagnostic. That is a footgun to guard against later, not a mechanism to build on.
- Accepting feature-level dependencies simplifies the earlier proposal instead of growing it. Hard ordering comes from `depends-on:`, and the manual ordered list shrinks to a tie-break among unblocked items. `tasks.md` already proves that shape one level down, where `deps:` carries hard order and file order carries sequence. Same mental model one level up, no new concept.
- On a possible extended `ship` that implements several features at once: a hypothetical caller justifies no capability on its own under the project's governing rule. It is recorded only because a topological order over `depends-on:` is what such a command would need anyway, so the shape above costs nothing extra now.
- The earlier line "Store order only. No copied statuses, no task glyphs, no dependency graph, no second board." is now partly superseded. Its "no dependency graph" clause no longer holds for declared feature-level dependencies, which live in idea frontmatter as `depends-on:`. The rest of that line still holds: no second store, and no duplication of state that can be derived.
- The 128 `deps:` lines across 23 `tasks.md` files recorded in the previous subsection were counted at that rerun and are not re-verified here.
- Still deferred: cross-feature task-level dependencies, since the Features 008 and 009 interleave is rare, and an explicit guard or lint rule against foreign keys in `deps:`.

## Open Questions

1. Which surfaces belong in a first version: text `status` output only, text plus a Mermaid kanban, or text plus Mermaid plus the HTML page?
   Answer: Text `status` output plus a Mermaid kanban. The HTML page comes later.
2. Where does the ordered list live, and what is the minimum shape it needs? Is an ordered sequence of idea slugs enough, or does an entry need anything else?
   Answer: An ordered list of idea slugs. Its job narrows to breaking ties among items that are not blocked; hard ordering comes from declared dependencies instead.
3. Should generated Mermaid appear on demand in a reply only, or also be written into a file? The existing preference is to add no new persistent artifact.
   Answer: On demand in the reply only. No new persistent file.
4. Should the HTML template ship in the core bundle or in an optional pack?
   Answer: Deferred with the HTML page itself, per question 1.
5. Is Blocked derived from existing evidence, such as `[!]` tasks or `blocked-by:` lines in the owning package, or set explicitly when you place an item?
   Answer: Derived, not hand-set. Blocked comes from existing evidence: `[!]` tasks and `blocked-by:` lines in the owning package, plus unmet declared feature dependencies.
6. Do specs need their own ordering at all, given that a spec is always reached through its owning idea?
   Answer: No separate spec ordering. A spec is always reached through its owning idea.
7. How many items can sit in Active at once? You work across two or three at a time, so a single-focus model and a small multi-item model produce different designs.
   Answer: Several items may sit in Active at once. No enforced cap.
8. Does a task dependency flowchart belong in a first version, given that it only renders `deps:` data that already exists and stores nothing new?
   Answer: Yes. It only renders `deps:` data that already exists and stores nothing new.
9. Should feature-level or idea-level dependencies be captured at all in a first version, or deferred until a flat order demonstrably fails to express real work?
   Answer: Yes, capture feature-level dependencies in the first version. I challenged the earlier recommendation to defer, and inspection of the repository upheld the challenge. Use a `depends-on:` list of idea slugs in the idea ledger frontmatter, mirroring how `deps:` works one level down.
10. If feature-level dependencies are eventually captured, where would they live and who maintains them, given that nothing structured holds them today?
    Answer: In the idea ledger frontmatter, maintained during brainstorm and define, under the same discipline that maintains `deps:` in `tasks.md`.
11. Is the task dependency view scoped to one feature at a time, or does it ever need to span features?
    Answer: Per feature only.

## Assumptions

These are the coordinator's working assumptions, not user decisions. Correct any that are wrong.

- Assumption: the idea ledger is the stable identity for a feature across its whole life, so the ordered list references idea slugs and never needs rewriting when a numbered spec package is created.
- Assumption: order is user intent and cannot be inferred. File timestamps, alphabetical order, and spec numbering do not express which idea to develop next.
- Assumption: this adds no second board and no execution authority. Idea frontmatter stays authoritative for lifecycle, and `tasks.md` (or Beads after import) stays authoritative for execution.
- Assumption: the ordered list is optional. When it is absent, everything reports as Unordered and nothing else breaks.
- Assumption: hard dependencies between drafts are declared explicitly with a `depends-on:` field in idea frontmatter; only finer-grained cross-feature task-level dependencies stay informal in a first version.
- Assumption: every view is derived and regenerable from the stored order, so a view can be added or removed without touching stored state.
- Assumption: task `deps:` in `tasks.md` stays the single source of truth for task order, and this feature adds no second dependency store.
- Assumption: any dependency view is derived and never authoritative, so deleting a rendered graph loses nothing that cannot be recomputed.

<!-- dude:managed:start -->
## Normalized Intent

- Make the working order of ideas visible so the next idea to develop is unambiguous when several are in flight.
- Show what is being worked on, what is pending, and what is in progress, for ideas and for specs, without duplicating lifecycle or execution state.
- Take hard ordering from declared feature-level dependencies: a `depends-on:` list of idea slugs in idea ledger frontmatter, maintained during brainstorm and define.
- Keep one optional coordinator-owned ordered list of idea slugs under `.dude/state/`, whose only job is breaking ties among items that are not blocked.
- Derive Active, Next, Later, Blocked, and Unordered buckets for `@dude status` from declared dependencies plus state that already exists.
- Derive Blocked rather than setting it by hand, from `[!]` tasks and `blocked-by:` lines in the owning package plus unmet `depends-on:` entries.
- Allow several items in Active at once, with no enforced cap.
- Report ambiguity instead of inventing an order when none is stored, and keep new ideas Unordered until one explicit action places or reorders them.
- Ship two surfaces first: text `@dude status` output and a Mermaid `kanban` board, both rendered on demand in a reply with no new persistent file.
- Include a Mermaid `flowchart` over existing task `deps:`, scoped to one feature at a time, since it renders data that already exists and stores nothing new.
- Order specs only through their owning idea; specs need no ordering of their own.
- Defer the static HTML page, and the question of which bundle or pack ships its template, to a later version.
- Keep two dimensions separate: status and focus, which the kanban answers, and logical order, which `depends-on:` and the task flowchart answer.

## Constraints

- Keep this as brainstorm intake only; do not create a definition package or begin implementation.
- Keep every view derived and regenerable. Store no copied statuses, no task glyphs, and no second board.
- Record feature-level dependencies only as `depends-on:` in idea ledger frontmatter. Store no dependency graph beyond that declared field; graph views are rendered from it and are never authoritative.
- Add no second dependency store. Task `deps:` in `tasks.md` stays the only place task order is recorded.
- Never place another feature's task key in `deps:`. `depsSatisfied` resolves keys only within one parsed file and reports nothing for a dangling target, so a foreign key blocks its task silently and permanently.
- Keep cross-feature task-level dependencies out of scope.
- Keep idea frontmatter authoritative for lifecycle and `tasks.md`, or Beads after import, authoritative for execution.
- Keep `@dude status` read-only; it must not import or mutate work.
- Keep the ordered list optional so that its absence breaks nothing.
- Do not spend model tokens regenerating markup. Whenever the HTML page ships, it is a committed static template fed by a deterministically generated data payload, consistent with the existing guardrail preferring deterministic scripts for rendering.
- Do not build a dependency engine, a scheduler, a queue, or any new execution authority. `depends-on:` is declared data plus a derived reading of it.
- Do not design for a future extended `ship` that implements several features at once; no such caller exists today.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Surfaces for a first version are selected
- [x] Stored location and minimum shape of the ordered list are selected
- [x] Source of the Blocked bucket is selected
- [x] Need for separate spec ordering is resolved
- [x] Inclusion of a task dependency view in a first version is decided
- [x] Treatment of feature-level dependencies in a first version is decided
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-08-07 UTC - brainstorm captured
- 2026-08-07 UTC - brainstorm rerun: task and feature dependency order
- 2026-08-07 UTC - brainstorm rerun: open questions answered, feature-level dependencies accepted
<!-- dude:managed:end -->

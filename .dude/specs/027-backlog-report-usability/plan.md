# Implementation Plan: Backlog Report Usability

## Summary

Refactor the existing `src/skills/dude-lightweight-execution/backlog.mjs` collector, model, and renderers into one lifecycle presentation pipeline. Preserve one direct-idea inventory and existing authority parsers, then enrich each lifecycle item with real idea excerpts, Coordinator Log dates, owner-resolved stories, phases, tasks, and separately typed declared and provisional relationships.

Replace `backlog-template.html` with the approved Lifecycle Explorer structure and baked Strata spectrum tokens. Adapt Markdown to a concise Current, Planned, and Completed outline with Mermaid limited to current work. Remove wall-clock, checkout-name, and Git-revision provenance. Add a read-only `check --root .` command that renders both artifacts in memory and compares exact committed bytes. Exercise that command through the existing test suite already run by CI. Keep `generate --root . --write` as the sole write path to exactly `.dude/backlog.md` and `.dude/backlog.html`.

Feature 025 remains closed and untouched. Its historical package is read-only evidence; only current source, tests, documentation, generated core projection, and the two generated backlog artifacts change.

## Technical Context

- **Authoritative core source**: `src/skills/dude-lightweight-execution/`.
- **Existing implementation**: `backlog.mjs`, `backlog-template.html`, and `backlog.test.mjs`.
- **Existing parsers/helpers**: frontmatter parsing, exact feature ownership inventory, specification identity parsing, task parsing, and workspace/mutation-path safety.
- **Current generated projection**: `.github/skills/dude-lightweight-execution/`, rebuilt only through `node scripts/build-dev.mjs`.
- **Current fixed artifacts**: `.dude/backlog.md` and `.dude/backlog.html`.
- **Current contract suite**: `scripts/current-format-contract.test.mjs`.
- **Existing CI integration**: `.github/workflows/ci.yml` runs every `*.test.mjs`; no new workflow or CI job is needed.
- **Approved evidence**: `.dude/specs/027-backlog-report-usability/design/preview.html`, copied after first-definition publication and used only for comparison.
- **Historical evidence**: `.dude/specs/025-backlog-report/**` and `.dude/ideas/backlog-report.md`, read-only throughout implementation.

## Spec Quality Validation

The specification contains five prioritized independently testable user stories, explicit acceptance scenarios, edge cases, 27 numbered functional requirements, applicable entities, measurable cross-checkout determinism and freshness criteria, responsive and print checks, one-to-one inventory tests, assumptions, out-of-scope boundaries, and an exact Feature 025 supersession statement. It has no unresolved clarification marker. Presentation and trust outcomes remain in the specification; implementation structure and command shape are selected here. Gate: PASS.

## Chosen Structure

### 1. Retain one collector and one inventory

Keep `backlog.mjs` as the only backlog implementation. Continue enumerating only safe direct `.dude/ideas/*.md` files and resolving defined packages through the existing exact-owner inventory.

Rename internal `FocusInputs` and `FocusBuckets` terminology only where doing so makes the lifecycle model clearer; do not add a parallel generator or compatibility layer. The collected inventory remains one row per direct idea, sorted by stable workspace-relative identity.

Each collected row gains only fields required by current presentation:

- slug, title, idea path, and real `## Idea` excerpt;
- lifecycle and owner-resolved specification path;
- canonical task-state counts and task rows;
- specification user-story headings;
- task phase headings and literal task metadata;
- Coordinator Log entries with parsed calendar dates;
- authoritative dependency and optional order evidence;
- separately labeled provisional body-stated relationships.

No new persistent schema or intermediate file is created.

### 2. Build one lifecycle presentation model

Derive one model containing:

- `summary`: Current work, Ready/Next, Ideas awaiting definition, Defined awaiting work, and Completed counts;
- `current`: Blocked, Active, and Next arrays;
- `planned`: ideas awaiting definition, defined awaiting work, and an optional prioritized-later array;
- `completed`: the completed-library array;
- `relationships`: declared, provisional, and missing-signal facts;
- `activityByDate`: Coordinator Log events grouped by date;
- `items`: the one-to-one stable drill-down records.

Preserve existing authoritative execution semantics for completed, blocked, active, dependencies, and explicit order. Provisional body evidence is presentation-only and never participates in classification.

A direct idea is emitted exactly once:

1. Completed when its clean owner-resolved package has at least one task and every task is done.
2. Otherwise Current when authoritative evidence makes it Blocked, Active, or Next.
3. Otherwise Planned, split into awaiting definition, defined awaiting work, or prioritized later when real order places it later.

Derive every count from those arrays rather than maintaining separate counters.

### 3. Parse only conservative provisional evidence

Add one local deterministic body-evidence parser, not model reasoning or a new general prose parser. It scans only the user-controlled `## Idea` body and recognizes explicit dependency statements that bind a canonical backticked slug to phrases such as “depends on,” “dependency on,” or “has to ship first.” Ambiguous mentions produce no relationship.

Record the matched source text and target slug. Render provisional relationships with dashed treatment and explicit non-authoritative wording. Do not convert them to `depends-on:`, backlog order, blocking, Next, or Later.

Pin `backlog-canvas` as the required real fixture: its body-stated `backlog-report` relationship is provisional, its HTML details element is open by default, and Feature 025 remains completed context.

### 4. Extend presentation detail with existing Markdown structure

Use small local section extractors over already-read bytes:

- idea excerpt: text from `## Idea`, truncated only at a deterministic content boundary and with the exact source path shown;
- milestones: valid Coordinator Log bullets in append order;
- stories: visible `### User Story ...` headings from the owner-resolved `spec.md`;
- phases: visible `## Phase ...` headings from `tasks.md`;
- tasks: existing `parseTasks` output joined to its containing phase, preserving glyph state, durable ID, description, `deps:`, and applicable `blocked-by:`.

Missing or malformed optional detail degrades visibly for that item and never removes it from the inventory or fabricates data.

### 5. Parse and group Coordinator activity honestly

Replace lexical full-line sorting with date parsing:

- accept a leading `YYYY-MM-DD` date field, with optional time or `UTC` text after it;
- group by calendar date;
- order date groups descending;
- within a date, order by stable idea path or slug and then original append order;
- do not claim chronology among entries sharing a date;
- exclude entries without a valid date from dated activity;
- label the section “Coordinator activity” and state that Git history and ad-hoc work outside idea Coordinator Logs are excluded.

Do not add Git reads or a second activity source.

### 6. Remove nondeterministic provenance

Delete generation-time creation, Git revision reads, checkout basename titles, and their template slots. Remove the child-process dependency used only for Git provenance.

Use a fixed report title and derive bytes solely from:

- admitted direct idea bytes;
- exact owner-resolved spec and task bytes;
- optional authoritative order bytes;
- the committed runtime template;
- deterministic sorting and escaping rules.

Do not add a source fingerprint unless a concrete reader need appears during implementation; the current plan omits it.

### 7. Replace the HTML template with the approved structure

Replace `backlog-template.html` rather than layering the new design over the six-lane template. Bake the approved Lifecycle Explorer structure and spectrum token values into the runtime template; generation never reads the approved preview or installed Strata pack.

Required structure:

- where-are-we metric strip with no percentage rollup;
- delivery map and accessible legend;
- Current work before Planned work;
- compact Planned groups;
- one collapsed Completed library;
- native per-item `<details>/<summary>` drill-down;
- stable in-page anchors;
- lifecycle ribbon, counts, dependency signal, source evidence, milestones, stories, phases, and tasks;
- `backlog-canvas` open by default;
- normal page scrolling and no fixed-height or nested scroll regions.

Retain self-containment: one inline stylesheet, no script, no external URL, no asset source, no remote font, no shadow, and no runtime optional-pack read. Include meaningful landmarks, heading relationships, SVG title/description where a map is graphical, visible focus, responsive stacking, and print rules that expose content without overflow clipping.

### 8. Adapt Markdown rather than mirroring HTML

Render:

- title and concise where-are-we counts;
- Current with Blocked, Active, and Next;
- a Mermaid view containing current work only;
- Planned with compact awaiting-definition, defined-awaiting-work, and conditional prioritized-later lists;
- Completed as a compact index;
- concise dependency/order and Coordinator activity notes only where useful.

Do not reproduce every HTML drill-down, the completed task corpus, or a full portfolio Mermaid diagram. Both formats consume the same lifecycle model, so inventory and classification cannot drift.

### 9. Add deterministic freshness checking

Choose a separate read-only command:

`node .github/skills/dude-lightweight-execution/backlog.mjs check --root .`

`check`:

1. collects and renders both artifacts in memory through the same pipeline as generation;
2. reads the committed `.dude/backlog.md` and `.dude/backlog.html`;
3. compares exact bytes;
4. reports each missing or stale artifact;
5. exits nonzero when either differs and zero only when both match;
6. writes nothing and rejects `--write`.

Keep:

`node .github/skills/dude-lightweight-execution/backlog.mjs generate --root . --write`

as the sole mutation path, still confined through existing mutation-path safety to the two fixed files.

Add a committed-artifact freshness test to the existing backlog/current-contract suite. The repository's existing CI already runs all `*.test.mjs`, so no workflow or service is added.

## Verification Design

Focused tests cover:

- one-to-one classification over the current 30-idea fixture and synthetic arbitrary counts;
- zero-count summary behavior and suppressed empty Current subsections;
- conditional prioritized-later behavior;
- declared, provisional, and missing relationship treatments;
- provisional evidence not changing authoritative classification;
- exact `backlog-canvas` provisional relationship and default-open state;
- draft, defined, active, blocked, and completed drill-down fields;
- completed-library compactness and initial collapsed state;
- same lifecycle inventory in Markdown and HTML;
- Mermaid nodes limited to current work;
- self-containment and banned HTML features;
- visible semantic boundaries, focus rules, narrow-width structure, and print overflow rules;
- date-grouped stable Coordinator activity and stated exclusions;
- generation repeated in differently named roots with exact bytes and SHA equality;
- stale and missing artifact check failures, fresh pass, and no-write snapshots;
- generation writing exactly the two fixed artifacts;
- current-format prose and command contracts;
- Feature 025 historical files remaining untouched.

Post-implementation visual acceptance compares rendered output with the approved preview at desktop, tablet, mobile, and print contexts. This is implementation-match review, not a new direction-approval checkpoint.

## Objective Registry

None. This feature has no long-lived objective or evaluation state. Its measurable outcomes are ordinary task verification contracts.

## Supporting Artifacts

- `.dude/specs/027-backlog-report-usability/design/preview.html`: approved design evidence only.
- Expected SHA-256: `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`.

No data-model, API, schema, security, migration, or additional design artifact applies.

## Source Layout

Expected authoritative edits:

- `src/skills/dude-lightweight-execution/backlog.mjs`
- `src/skills/dude-lightweight-execution/backlog-template.html`
- `src/skills/dude-lightweight-execution/backlog.test.mjs`
- `src/skills/dude-lightweight-execution/SKILL.md`
- `scripts/current-format-contract.test.mjs`
- applicable user documentation only where the current six-lane or procedural-freshness contract is described

Generated outputs:

- `.github/skills/dude-lightweight-execution/backlog.mjs`
- `.github/skills/dude-lightweight-execution/backlog-template.html`
- `.github/skills/dude-lightweight-execution/SKILL.md`
- `.dude/backlog.md`
- `.dude/backlog.html`

Read-only historical evidence:

- `.dude/ideas/backlog-report.md`
- `.dude/specs/025-backlog-report/**`

## Complexity Check

The implementation reuses one existing collector, one model pipeline, one template, two renderers, existing parsers, and the existing CI test path. It adds no parallel generator, schema, cache, store, service, watcher, workflow, browser script, activity source, or execution authority.

The deterministic source fingerprint, Git activity aggregation, interactive filters, search, theme controls, and canvas integration are omitted under YAGNI.

## Phases

1. **Approved foundation**: verify the approved preview, establish the lifecycle model and deterministic provenance boundary, and pin one-to-one fixture behavior.
2. **Lifecycle evidence and freshness**: add drill-down data, declared/provisional relationships, date-grouped activity, and read-only `check`.
3. **Approved HTML**: replace the six-lane template with the Lifecycle Explorer and verify accessibility, responsiveness, print, and self-containment.
4. **Adapted Markdown**: render concise Current, Planned, and Completed semantics with current-only Mermaid.
5. **Integration**: update commands, current contracts, generated core, committed artifacts, documentation, and the existing CI freshness test.
6. **Acceptance**: run full deterministic, visual, accessibility, inventory, write-boundary, history-preservation, and independent review gates.

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-005, FR-010 / SC-001, SC-002, SC-005 | One lifecycle model, summary, Current/Planned/Completed classification, compact completed library | T001@6d6f646c, T003@68746d6c, T004@6d6b646e, T006@61637074 |
| FR-006 through FR-009 / SC-003 | Declared/provisional/missing relationship model and required `backlog-canvas` behavior | T002@65766964, T003@68746d6c, T006@61637074 |
| FR-011 through FR-013 / SC-004 | Real idea, milestone, story, phase, task, and draft detail | T002@65766964, T003@68746d6c, T006@61637074 |
| FR-014 / SC-011 | Concise Markdown and current-only Mermaid over the shared model | T004@6d6b646e, T006@61637074 |
| FR-015 through FR-017 / SC-006, SC-007, SC-012 | Approved static HTML, Strata, accessibility, responsive, print, and visual comparison | T003@68746d6c, T006@61637074 |
| FR-018 through FR-022 / SC-008, SC-009 | Nondeterministic provenance removal, exact-byte check, existing CI integration, two-file write boundary | T001@6d6f646c, T002@65766964, T005@66726573, T006@61637074 |
| FR-023, FR-024 / SC-010 | Date-grouped honestly scoped Coordinator activity | T002@65766964, T006@61637074 |
| FR-025 through FR-027 / SC-013 | Derived-only authority, preview separation, and Feature 025 supersession without mutation | T001@6d6f646c, T005@66726573, T006@61637074 |

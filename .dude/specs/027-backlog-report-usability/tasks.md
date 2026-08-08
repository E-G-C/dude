<!-- audit log: .dude/ideas/backlog-report-usability.md#coordinator-log -->

# Tasks: Backlog Report Usability

Six all-open canonical units implement the contract at `.dude/specs/027-backlog-report-usability/spec.md`, owned prospectively and exactly by `.dude/ideas/backlog-report-usability.md`.

The approved Lifecycle Explorer at `.dude/specs/027-backlog-report-usability/design/preview.html` is design evidence, not runtime input. Its required SHA-256 is `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`. No task may request another visual-direction approval; the final visual gate checks implementation fidelity to the approved direction.

No task carries `[P]`. Model, evidence, HTML, Markdown, integration, and acceptance build sequentially on one existing `backlog.mjs` pipeline.

Core source lives under `src/`; `.github/` is generated only through `node scripts/build-dev.mjs` and is never hand-edited. Generation may write only `.dude/backlog.md` and `.dude/backlog.html`; `check` writes nothing.

Execution may read but must not write `.dude/ideas/backlog-report.md` or `.dude/specs/025-backlog-report/**`. Feature 025 remains closed history. No task may add a parallel generator, board, store, schema, API, service, watcher, workflow, browser script, external reference, Git activity source, source fingerprint without a concrete need, or execution authority. A required change outside this boundary stops as `contract-mismatch: redefine-required`.

## Phase 1: Approved Foundation And Lifecycle Model

**Goal**: Lock the approved evidence, establish one lifecycle inventory, and remove nondeterministic provenance without creating a parallel renderer.

- [x] T001@6d6f646c [US1] Verify `.dude/specs/027-backlog-report-usability/design/preview.html` exists and has SHA-256 `fdfa1b3f517bc721898d3bfd16d75075c75181f84b88d914f89765861bc40573`; treat it only as visual comparison evidence. Refactor the existing collector and model in `src/skills/dude-lightweight-execution/backlog.mjs` so every safe direct idea produces exactly one lifecycle item classified under Current, Planned, or Completed, with Current split into Blocked, Active, and Next, Planned split into awaiting definition, defined awaiting work, and conditional prioritized later, and Completed represented once. Derive the five summary counts from those arrays, preserve existing authoritative lifecycle/task/dependency/order semantics, suppress empty Current subsection bodies while retaining zero counts, and remove wall-clock time, checkout basename, Git revision reads, and their model/template slots. Extend `backlog.test.mjs` with one-to-one partition, arbitrary-count, zero-count, conditional-later, repeated-generation, and differently named root fixtures; require exact Markdown and HTML byte equality and matching SHA-256 values for byte-identical authoritative inputs. Add no fingerprint unless a concrete reader need is demonstrated. (US1, US5 -> FR-001 through FR-005, FR-010, FR-018, FR-019, FR-025, FR-026)
 
## Phase 2: Evidence, Drill-Down, Activity, And Check

**Goal**: Enrich the shared lifecycle model with real source evidence and add read-only mechanical freshness checking.

- [x] T002@65766964 [Shared] Extend the same `backlog.mjs` model using existing parsers and small local Markdown section extractors: real `## Idea` excerpt and exact path; exact-owner specification path and user-story headings; task phase headings and parsed canonical task rows with glyph state, durable ID, `deps:`, and applicable `blocked-by:`; Coordinator Log milestones; declared dependencies and explicit order; and separately labeled provisional body relationships. Keep provisional parsing conservative and deterministic, admitting only explicit recognizable dependency statements with canonical slug evidence, never using them for blocking, Next, Later, or authority. Pin `backlog-canvas` as default-open with its body-stated `backlog-report` relationship dashed and non-authoritative. Parse leading calendar dates from idea Coordinator Logs, group descending by date, order same-date rows stably by idea identity and append order, label the section “Coordinator activity,” and state that Git and ad-hoc work are excluded. Add `check --root .` to render both artifacts in memory, compare exact committed bytes, fail on either missing or stale path, report each mismatch, reject `--write`, and write nothing. Cover declared/provisional/missing relationships, ambiguous prose, drafts with no tasks, unavailable package detail, date grouping, same-date stability, stale/missing/fresh check outcomes, and whole-tree no-write snapshots. (US2, US3, US5 -> FR-006 through FR-013, FR-020, FR-023, FR-024)
    deps: T001@6d6f646c

## Phase 3: Approved HTML Lifecycle Explorer

**Goal**: Replace the six-peer-lane report with the approved static Lifecycle Explorer.

- [x] T003@68746d6c [Shared] Replace `src/skills/dude-lightweight-execution/backlog-template.html` with the approved Lifecycle Explorer structure and baked Strata spectrum tokens, without reading the approved preview or installed pack at runtime. Render the where-are-we summary with no percentage; accessible delivery map and legend; Current work in Blocked, Active, Next order; compact Planned groups; one initially collapsed Completed library; and native per-item details with stable anchors, identity/title, lifecycle ribbon, task counts, dependency signal, idea excerpt/path, milestones, order/dependency facts, stories, phases, and task metadata. Open `backlog-canvas` by default. Use native details/summary and anchors only, normal page scrolling, no fixed-height or nested scroll region, no script, fake control, external URL, asset source, network, remote font, shadow, or optional-pack dependency. Add semantic landmarks, heading and map descriptions, visible focus, meaningful 3:1 boundaries, deep text colors, responsive rules for 1180px/800px/320px, and print rules that expose content without overflow clipping. Extend focused tests for compact completion treatment, one drill-down per inventory item, self-containment, accessibility hooks, responsive structure, print safety, and absence of all banned presentation features. (US1, US2, US3, US4 -> FR-001 through FR-017)
    deps: T002@65766964

## Phase 4: Adapted Markdown

**Goal**: Give Markdown the same lifecycle semantics in a concise medium-appropriate form.

- [x] T004@6d6b646e [Shared] Rewrite the Markdown renderer in `backlog.mjs` over the shared lifecycle model. Emit concise where-are-we counts; Current with Blocked, Active, and Next; a Mermaid diagram containing current work only; Planned with awaiting-definition, defined-awaiting-work, and conditional prioritized-later lists; a compact Completed index; and brief truthful dependency/order and Coordinator activity scope notes. Do not mirror HTML drill-down detail or render a full-history Mermaid diagram. Extend `backlog.test.mjs` to prove Markdown and HTML have identical one-to-one inventory and lifecycle classification for the same model, all Mermaid nodes belong to current work, empty Current groups remain concise, and arbitrary inventory counts do not change the structure contract. (US1, US4 -> FR-001 through FR-005, FR-010, FR-014)
    deps: T003@68746d6c

## Phase 5: Freshness Integration And Current Contracts

**Goal**: Publish the deterministic artifacts through the existing build and CI topology and supersede only affected current Feature 025 contracts.

- [x] T005@66726573 [Shared] Update `src/skills/dude-lightweight-execution/SKILL.md` and `scripts/current-format-contract.test.mjs` to document Current/Planned/Completed semantics, honestly scoped Coordinator activity, `check --root .`, and `generate --root . --write` as the only two-file mutation path. Add a committed-artifact freshness test to the existing `*.test.mjs` suite already run by `.github/workflows/ci.yml`; do not add or modify a workflow merely to create another integration point. Update applicable current user documentation where it still promises six peer lanes, timestamps, checkout names, Git revision provenance, generic recent activity, nested lane scrolling, or procedural-only freshness. Run the source build so only intended `.github/` core projections are generated, then regenerate `.dude/backlog.md` and `.dude/backlog.html` from the deterministic pipeline. Confirm check mode performs no write, generate mode writes exactly those two files, the approved preview is not read at runtime, no second authority exists, and `.dude/ideas/backlog-report.md` plus `.dude/specs/025-backlog-report/**` remain byte-unchanged. (US4, US5 -> FR-018 through FR-027)
    deps: T004@6d6b646e

## Phase 6: Full Acceptance And Independent Review

**Goal**: Prove deterministic freshness, visual fidelity, accessibility, inventory integrity, and historical preservation over the integrated revision.

- [x] T006@61637074 [Shared] Run full acceptance over the unchanged integrated revision. Prove the current repository inventory and synthetic zero/one/arbitrary-count fixtures contain every direct idea exactly once and every entry is drillable; independently verify all five summary counts, Current/Planned/Completed membership, conditional prioritized later, completed-library compactness, exact `backlog-canvas` provisional relationship, declared/provisional/missing map semantics, draft no-task wording, drill-down source evidence, date-grouped Coordinator activity, and current-only Mermaid. Generate from two differently named roots with byte-identical authoritative inputs and require exact Markdown and HTML byte equality plus equal SHA-256 values; mutate an authoritative input and require `check --root .` to fail without writes, regenerate through the two-file write path, and require check to pass. Inspect HTML at 1180px, 800px, and 320px and in print preview for no horizontal overflow, clipping, nested scrolling, hidden print content, fake controls, script, external reference, shadow, or inaccessible focus; compare the implementation with the approved Lifecycle Explorer preview and route fresh visual evidence for independent design judgment and the complete evidence set for independent reviewer approval. Run the full discovered test suite, build-dev parity, current-format contracts, Dude lint, compose verification, pristine release build and release lint, generated-core diff inspection, artifact freshness check, and `git diff --check`. Confirm Feature 025 history is untouched and no board, store, schema, API, service, watcher, workflow, browser script, Git activity source, or execution authority was added. Do not mutate this package or any task state while obtaining independent judgments. (US1, US2, US3, US4, US5 -> FR-001 through FR-027)
    deps: T005@66726573

## Requirements And Success Traceability

| Specification coverage | Tasks |
|---|---|
| FR-001 through FR-005, FR-010 / SC-001, SC-002, SC-005 | T001@6d6f646c, T003@68746d6c, T004@6d6b646e, T006@61637074 |
| FR-006 through FR-009 / SC-003 | T002@65766964, T003@68746d6c, T006@61637074 |
| FR-011 through FR-013 / SC-004 | T002@65766964, T003@68746d6c, T006@61637074 |
| FR-014 / SC-011 | T004@6d6b646e, T006@61637074 |
| FR-015 through FR-017 / SC-006, SC-007, SC-012 | T003@68746d6c, T006@61637074 |
| FR-018 through FR-022 / SC-008, SC-009 | T001@6d6f646c, T002@65766964, T005@66726573, T006@61637074 |
| FR-023, FR-024 / SC-010 | T002@65766964, T006@61637074 |
| FR-025 through FR-027 / SC-013 | T001@6d6f646c, T005@66726573, T006@61637074 |

<!-- audit log: .dude/ideas/025-backlog-report.md#coordinator-log -->

# Tasks: Backlog Report

Seven all-open canonical units implement the contract at `.dude/specs/025-backlog-report/spec.md`, owned exactly by `.dude/ideas/backlog-report.md`.

The design renames one shipped read-only surface and extends it into two committed generated projections over a single derivation. If any task starts to add a second board, a second store, an execution authority, a run-time read of an optional pack, a bundled diagram runtime in the report, browser scripting, a network or service dependency, a write path beyond `.dude/backlog.md` and `.dude/backlog.html`, or any edit to Feature 024's closed package, stop with `plan-gap` instead of building it. The plan's YAGNI and topology list is the implementation boundary.

No task carries `[P]`. Each phase builds on the one before, so the tasks are intentionally sequential. Durable suffixes are fixed lowercase hexadecimal encodings of `name`, `sixb`, `mkdn`, `tmpl`, `html`, `wire`, and `acpt`.

Core source lives under `src/`; `.github/` core is generated only by `node scripts/build-dev.mjs` and is never hand-edited. Both generated artifacts are committed projections and never authoritative.

Execution may read but must not write any `.dude/specs/024-feature-focus-order/**` artifact, and must not rename or edit `.dude/ideas/feature-focus-order.md`. No task may set task glyphs or mutate another feature's package, task state, board, mirror, execution history, or Coordinator Log. A required normative change beyond this feature's scope stops as `contract-mismatch: redefine-required`.

## Phase 1: Rename Focus To Backlog

**Goal**: Rename the shipped cross-idea surface from focus to backlog with no behaviour change and every existing test green.

- [x] T001@6e616d65 [US1] Rename the shipped cross-idea `focus` surface to `backlog` without changing behaviour: `src/skills/dude-lightweight-execution/focus.mjs` -> `backlog.mjs` and `focus.test.mjs` -> `backlog.test.mjs`; `FOCUS_ORDER_PATH` and its `.dude/state/focus-order.md` target -> `BACKLOG_ORDER_PATH` and `.dude/state/backlog-order.md`; `parseFocusOrder` -> `parseBacklogOrder` and `readFocusOrder` -> `readBacklogOrder`; and the `### Cross-Idea Focus` subsection in `src/skills/dude-lightweight-execution/SKILL.md` -> `### Cross-Idea Backlog` with its command lines renamed. Move the "focus" needles in `scripts/current-format-contract.test.mjs` to "backlog", keeping every other assertion intact. Do not rename `.dude/specs/024-feature-focus-order/` or `.dude/ideas/feature-focus-order.md`. Run `node scripts/build-dev.mjs` and confirm the generated `.github/` projection replaces `focus.mjs` with `backlog.mjs` byte-for-byte, the test file remains source-only, and the renamed suite stays green. (US1 -> FR-001, FR-002)

## Phase 2: Six-Bucket Derivation

**Goal**: Add the Shipped bucket evaluated first and the Backlog rename while keeping the five-bucket membership faithful, and record Feature 024's supersession in the contract test.

- [x] T002@73697862 [US2] Extend the single derivation in `backlog.mjs` to six buckets. Add the `Shipped` bucket from the already-computed every-task-done condition and evaluate it first, ahead of every ordering bucket; rename the former `Unordered` bucket to `Backlog` with its membership rule unchanged; and keep Active, Next, Blocked, and Later faithful to the shipped logic so that setting `Shipped` aside reproduces the prior five-bucket membership, including `Later` staying empty until `.dude/state/backlog-order.md` exists. Extend `backlog.test.mjs`: `Shipped` is first and captures a completed idea named as another idea's dependency; every idea lands in exactly one of the six buckets; the `Backlog` rename preserves membership; and a Shipped-set-aside run equals the previously shipped five-bucket result. Update the contract assertion in `scripts/current-format-contract.test.mjs` to bind the six buckets and to record that Feature 024's five-bucket contract (FR-003, SC-004) is deliberately superseded here, each with a focused mutation that fails its owning assertion. (US2 -> FR-003, FR-004, FR-005, FR-006, FR-018)
    deps: T001@6e616d65

## Phase 3: Markdown Renderer

**Goal**: Render the six buckets and an inline board diagram to the Markdown artifact from the single derivation.

- [x] T003@6d6b646e [US3] Add the Markdown renderer over the single derivation, producing the `.dude/backlog.md` content: the six buckets and a fenced board diagram the repository host renders inline, with per-idea membership identical to the derivation. Keep the diagram in Markdown only. Extend `backlog.test.mjs`: the rendered buckets and membership equal the derivation for the same inputs, and the renderer is a pure, deterministic function of the derived result that writes nothing on its own. (US3 -> FR-007, FR-009, FR-017)
    deps: T002@73697862

## Phase 4: Self-Contained Report

**Goal**: Deliver the committed baked template and the report renderer that fills it, over the same derivation.

- [x] T004@746d706c [US4] Add the committed, self-contained report template as a source file under `dude-lightweight-execution`, carrying a validated baked copy of the chosen spectrum token values and component styling: plane-and-rule elevation with no drop shadow, 4px radius, monospace for metadata only, role-based tokens, traffic-light lane tones (Shipped success, Blocked danger, Later warning, Active primary, Next info, Backlog muted), and height-bounded, internally scrollable lanes with compact empties. The template embeds no external reference and no in-file scripting and reads no installed pack. Add a focused test asserting the template is self-contained (no external reference, no in-file script, no drop shadow) and that generation does not read the optional pack. (US4 -> FR-008, FR-012, FR-013)
    deps: T003@6d6b646e
- [x] T005@68746d6c [US4] Add the report renderer that fills the committed template from the single derivation and writes `.dude/backlog.html` through the symlink-refusing mutation-path helper, producing the four views — summary counts, the lane board with per-feature task progress, per-feature task-order chains, and recent activity from idea coordinator logs — plus the portfolio rollup and work-item cards. Add a `generate` command that produces both artifacts and prints unless a write flag is present, writing only `.dude/backlog.md` and `.dude/backlog.html`. Extend `backlog.test.mjs`: the report opens with no network, service, in-file script, or external reference; the four views render; and per-idea bucket membership is identical across the derivation, `.dude/backlog.md`, and `.dude/backlog.html`. (US4 -> FR-009, FR-010, FR-011, FR-016)
    deps: T004@746d706c

## Phase 5: Regeneration And Acceptance

**Goal**: Regenerate both artifacts at every coordinator state change with a visible staleness stamp, then prove the integrated feature and route independent review.

- [x] T006@77697265 [US5] Wire regeneration and the staleness stamp. Document in `src/skills/dude-lightweight-execution/SKILL.md` that at every coordinator state change — the same moment the coordinator re-renders the task board with `board.mjs render --write` — the coordinator also runs the deterministic `backlog.mjs generate --root . --write` to rewrite both artifacts and commits `.dude/backlog.md` and `.dude/backlog.html`, spending no model tokens on markup. Stamp the generation time and a short source revision into both artifacts, recording a plain `unknown` when no revision is available. Document that both artifacts are derived projections and never authoritative — idea frontmatter for lifecycle, `tasks.md` for execution, `depends-on:` plus `.dude/state/backlog-order.md` for order — and that this supersedes Feature 024's read-only guarantee (FR-010, SC-006) with the write path confined to exactly the two artifacts. Update the assertion in `scripts/current-format-contract.test.mjs` to bind the regeneration hook and the write path to exactly the two targets. Run `node scripts/build-dev.mjs` and confirm the `.github/` projection is byte-identical to source. (US5 -> FR-014, FR-015)
    deps: T005@68746d6c
- [x] T007@61637074 [Shared] Run acceptance over the integrated feature: the full discovered suite `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test` green; confirm both artifacts regenerate deterministically at a simulated coordinator state change and each carries its generation time and source revision; confirm `.dude/backlog.html` opens with no network, no service, and no in-file script and contains no external reference and no drop shadow; confirm per-idea bucket membership is identical across the derivation, `.dude/backlog.md`, and `.dude/backlog.html`; confirm the six buckets, the `Shipped`-first rule, and the `Backlog` rename, and that setting `Shipped` aside reproduces the prior five-bucket membership; confirm the only writes are `.dude/backlog.md` and `.dude/backlog.html` with no second board, store, or execution authority; confirm `.dude/specs/024-feature-focus-order/**` and `.dude/ideas/feature-focus-order.md` are untouched; confirm `git status --porcelain` shows only the intended `src/` changes, the two committed artifacts, and the single generated `.github/` projection set with no stray `focus.mjs`, and `git diff --check` is clean; and confirm `node .github/skills/dude-lint/lint.mjs .` reports zero warnings and zero failures with the two new committed artifacts present. Route one fresh evidence set for independent review without modifying this or any other feature's package or execution state. (US1, US2, US3, US4, US5 -> FR-001 through FR-018)
    deps: T006@77697265

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002 | Rename the cross-idea surface to backlog; leave Feature 024 named and untouched | T001@6e616d65, T007@61637074 |
| FR-003, FR-004, FR-005, FR-006, FR-018 / SC-001, SC-002, SC-003 | Six buckets, Shipped first, Backlog rename, faithful five-bucket, 024 supersession | T002@73697862, T007@61637074 |
| FR-007, FR-009, FR-017 / SC-001, SC-005 | Single-derivation Markdown renderer | T003@6d6b646e, T007@61637074 |
| FR-008, FR-012, FR-013 / SC-004, SC-008 | Committed self-contained baked template with traffic-light bounded lanes | T004@746d706c, T007@61637074 |
| FR-009, FR-010, FR-011, FR-016 / SC-004, SC-005, SC-007 | Report renderer, four views, write path confined to the two artifacts | T005@68746d6c, T007@61637074 |
| FR-014, FR-015 / SC-006 | Regeneration hook and staleness stamp | T006@77697265, T007@61637074 |

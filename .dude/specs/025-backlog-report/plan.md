# Implementation Plan: Backlog Report

## Summary

Rename the shipped cross-idea "focus" surface to "backlog", extend its derivation with a sixth "Shipped" bucket evaluated first and a "Backlog" rename of the former "Unordered" pool, and add two committed generated artifacts — `.dude/backlog.md` and `.dude/backlog.html` — produced by one derivation and two renderers. The report is self-contained by baking a validated copy of the chosen visual language into a committed template rather than reading any optional pack at run time. Both artifacts are regenerated at every coordinator state change alongside the existing task board render, and both carry a generation-time and source-revision stamp. The feature deliberately supersedes Feature 024's five-bucket and read-only guarantees for this surface without reopening Feature 024.

## Technical Context

- **Core lane**: `dude-lightweight-execution`. The existing read-only `focus.mjs` is the rename-and-extend target; its tests are `focus.test.mjs`.
- **Reused engine helpers (unchanged)**: `parseFrontmatterScalars`, `parseSpecIdentity` / `resolveSpecIdentity`, `resolveFeatureOwner` / `inventoryDefinedFeatures`, `parseTasks`, and `WORKSPACE_PATHS` / `resolveWorkspacePath` / `resolveMutationPath`. `depends-on` is already a canonical idea key in `src/skills/dude-engine/lib/feature.mjs`, so no engine change is needed (unlike Feature 024, which added it).
- **Projection**: core lives under `src/` and is projected to `.github/` only by `node scripts/build-dev.mjs`; `.github/` core is never hand-edited and CI fails on drift.
- **Contract surface**: `scripts/current-format-contract.test.mjs` binds the cross-idea status surface to its script and to its documented field, ordering file, and footgun; its needles move from "focus" to "backlog" and gain the sixth bucket and the write path.
- **Design input only**: a session prototype demonstrated the visual direction and confirmed a roughly 16 KB self-contained report with no external references. It is not repository source and is not copied verbatim.

## Spec Quality Validation

The spec is testable, technology-agnostic, and free of open clarifications: every functional requirement has an owning task and at least one success criterion; the six buckets, the Shipped-first rule, the Backlog rename, the two artifacts, the colour semantics, the bounded lanes, the regeneration hook, the staleness stamp, the non-authority guarantee, and the explicit Feature 024 supersession are all stated as WHAT/WHY with HOW deferred to this plan. Gate: PASS.

## Two Architectural Decisions

### Decision 1 - Core must not depend on an optional pack at run time (ADOPTED)

The report generator lives in core (`dude-lightweight-execution`), and the chosen visual language ships in an optional pack. Reading the installed pack at generation time would couple core to an optional install and could break the offline, self-contained guarantee.

**Resolution**: the committed template (option C) embeds a validated, baked copy of the needed token values and component styling. Generation reads only the template, never the installed pack, so the report renders identically whether or not the pack is installed and stays fully self-contained with no external reference. The shared visual language is maintained by deliberately copying validated values; if the pack's tokens change, the template is updated as a conscious step, and a self-containment test asserts the template pulls in nothing external. The session prototype inlined the installed tokens only because it was a throwaway; the real template carries its own validated copy. This also honours the ratified pack-lifecycle guardrail that core must not runtime-couple to an optional pack.

### Decision 2 - Feature 024 is superseded, not reopened (ADOPTED)

Feature 024 fixed exactly five buckets (FR-003, SC-004) and a read-only, non-persistent guarantee (FR-010, SC-006), each pinned by the contract test.

**Resolution**: Feature 025 supersedes both, for this surface only. The rename, the sixth Shipped bucket, the Backlog rename, the two generated artifacts, the write path, and the contract-test updates all live in 025's scope. 025 modifies files that 024 shipped but does not reopen or edit 024's closed package or its idea ledger. The write path is confined to exactly `.dude/backlog.md` and `.dude/backlog.html`; no other surface gains a write path, and the acceptance criteria treat the write path as a deliberate, tested change to the former read-only guarantee.

## YAGNI And Topology

Trimmed from the session prototype because no current reader needs them:

| Prototype affordance | Decision | Reason |
|---|---|---|
| Palette / theme switcher | Drop | The report is one artifact with one look (the chosen spectrum palette); a switcher serves no current reader. |
| Inert navigation tabs (Board / Backlog / Timeline / Activity) | Drop | In a static offline file they navigate nowhere; mocking a control that cannot work violates functional realism. |
| Run-time read of the installed pack tokens | Drop | Replaced by the baked template copy; keeps core independent of the optional pack. |
| Bundled diagram runtime in the report | Drop | A board is columns and a chain is an ordered list; bundling a diagram runtime would add roughly a megabyte for no reader benefit. Diagrams stay in the Markdown only, where the host renders them. |

Kept because they carry real derived data: the portfolio rollup, work-item cards, state pills, traffic-light lanes, task-order chains, and recent activity.

## Chosen Design

1. **Rename mechanics.** `src/skills/dude-lightweight-execution/focus.mjs` -> `backlog.mjs`; `focus.test.mjs` -> `backlog.test.mjs`; `FOCUS_ORDER_PATH` and `.dude/state/focus-order.md` -> `BACKLOG_ORDER_PATH` and `.dude/state/backlog-order.md`; `parseFocusOrder` -> `parseBacklogOrder`; `readFocusOrder` -> `readBacklogOrder`; the SKILL subsection `### Cross-Idea Focus` -> `### Cross-Idea Backlog` with its command lines renamed; and the contract needles. The closed `.dude/specs/024-feature-focus-order/` directory and `.dude/ideas/feature-focus-order.md` are not renamed.

2. **One derivation.** A single bucket derivation over `.dude/ideas/*.md` reuses the existing frontmatter, spec-identity, owner, and task parsers and the existing no-symlink enumeration. It computes, per idea: every-task-done (Shipped), in-progress evidence (Active), unmet declared dependency or in-package blocking evidence (Blocked), presence or absence of an ordering signal (Backlog when absent), and the ordered Next / Later split by the tie-break file.

3. **Six buckets, Shipped first.** First-match-wins order: Shipped -> Blocked -> Active -> Backlog -> Next -> Later, with Shipped evaluated ahead of every ordering bucket. Setting Shipped aside reproduces the shipped five-bucket membership exactly, including that Later stays empty until `.dude/state/backlog-order.md` exists.

4. **Two renderers.** The Markdown renderer emits the six buckets and a fenced diagram the host renders inline (kept in Markdown only). The report renderer fills the committed self-contained template with the four views.

5. **Committed baked template.** One template file carries a validated, baked copy of the chosen spectrum token values and component styling: plane-and-rule elevation (no drop shadow), 4px radius, monospace for metadata only, role-based tokens. It embeds no external reference and no in-file scripting and reads no installed pack.

6. **Traffic-light lanes.** Fixed lane tones: Shipped as success / green, Blocked as danger / red, Later as warning / amber, Active as primary / blue, Next as info / teal, Backlog as muted / grey — done and next never share a tone.

7. **Bounded lanes.** Each lane has a bounded height with an internal scroll and card-top snap; empty lanes stay compact.

8. **Board conventions kept.** A portfolio rollup stacked by state with a counted legend, work-item cards (identity chip, state pill, tone stripe, progress bar, dependency tags), and a per-feature task-order chain.

9. **Write path.** Both artifacts are written with the symlink-refusing mutation-path helper to exactly `.dude/backlog.md` and `.dude/backlog.html`. A `generate` command runs deterministically and prints unless a write flag is present.

10. **Regeneration and staleness.** At every coordinator state change — the same moment the task board is re-rendered with `board.mjs render --write` — the coordinator runs `backlog.mjs generate --root . --write` and commits both artifacts. Each artifact is stamped with the generation time and a short source revision, degrading to a plain `unknown` outside a checkout. No model tokens are spent on markup.

## Objective Registry

None. This feature introduces no new long-lived objective or state machine; it reuses the existing derivation, ownership, and task engines and adds two derived artifacts.

## Supporting Artifacts

None beyond the core trio. The committed report template is a source file delivered under the core skill, not a separate definition artifact.

## Source Layout

- `src/skills/dude-lightweight-execution/backlog.mjs` (renamed from `focus.mjs`; extended with the sixth bucket, the two renderers, and the write path)
- `src/skills/dude-lightweight-execution/backlog.test.mjs` (renamed from `focus.test.mjs`; extended)
- the committed self-contained report template under the same skill
- `src/skills/dude-lightweight-execution/SKILL.md` (subsection rename and regeneration / write documentation)
- `scripts/current-format-contract.test.mjs` (needles moved to "backlog", six buckets, write path)
- generated `.github/...` projections via `node scripts/build-dev.mjs`
- generated artifacts `.dude/backlog.md` and `.dude/backlog.html`

## Phases

1. **Rename focus to backlog** with the existing tests green and the contract needles updated.
2. **Six-bucket derivation**: add Shipped-first and the Backlog rename, keep the five-bucket membership faithful, and supersede Feature 024's five-bucket contract in the contract test.
3. **Markdown renderer** over the single derivation.
4. **Self-contained report renderer** and the committed baked template.
5. **Regeneration wiring and staleness stamp**, then acceptance.

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001, FR-002 | Rename the cross-idea surface to backlog; leave Feature 024 named and untouched | T001@6e616d65, T007@61637074 |
| FR-003, FR-004, FR-005, FR-006, FR-018 / SC-001, SC-002, SC-003 | Six buckets, Shipped first, Backlog rename, faithful five-bucket, 024 supersession | T002@73697862, T007@61637074 |
| FR-007, FR-009, FR-017 / SC-001, SC-005 | Single-derivation Markdown renderer | T003@6d6b646e, T007@61637074 |
| FR-008, FR-012, FR-013 / SC-004, SC-008 | Committed self-contained baked template with traffic-light bounded lanes | T004@746d706c, T007@61637074 |
| FR-009, FR-010, FR-011, FR-016 / SC-004, SC-005, SC-007 | Report renderer, four views, write path confined to the two artifacts | T005@68746d6c, T007@61637074 |
| FR-014, FR-015 / SC-006 | Regeneration hook and staleness stamp | T006@77697265, T007@61637074 |

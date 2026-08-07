# Implementation Plan: Feature Focus Order

## Summary

The one structure this feature adds is a single new read-only deterministic script at `src/skills/dude-lightweight-execution/focus.mjs` inside the existing Lightweight Execution skill. There is no new skill directory, no new `SKILL.md`, no second board, and no writer. The sole production caller is the read-only `@dude status` command, which invokes the script for text focus buckets by default and for two on-demand Mermaid views on request.

The script derives five focus buckets from `depends-on:` declarations plus lifecycle and task state that already exists, and it renders a Mermaid `kanban` of those buckets and a per-feature Mermaid `flowchart` of one feature's existing task `deps:`. It reuses the existing frontmatter, identity, ownership, and tasks engines and writes nothing. One enabling change adds `depends-on` to the canonical idea-frontmatter key set in `src/skills/dude-engine/lib/feature.mjs` so a declared dependency validates cleanly instead of tripping strict frontmatter validation.

The canonical feature identity is `.dude/specs/024-feature-focus-order/spec.md`, prospectively owned by `.dude/ideas/feature-focus-order.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM, synchronous filesystem reads, and `node:test`.

**Primary Dependencies**: existing engine helpers `parseFrontmatterScalars`, `parseSpecIdentity`/`resolveSpecIdentity`, `resolveFeatureOwner`/`inventoryDefinedFeatures`, and `parseTasks`; source-to-`.github/` projection through `scripts/build-dev.mjs`.

**Storage**: reads only. The script reads `.dude/ideas/*.md`, each defined package's `.dude/specs/<feature>/tasks.md`, and the optional `.dude/state/focus-order.md`. It creates and mutates nothing.

**Testing**: a new `src/skills/dude-lightweight-execution/focus.test.mjs`; new `depends-on` cases in the existing feature-identity/feature test suite; a section-bound assertion in `scripts/current-format-contract.test.mjs`; projection parity through `scripts/build-dev.test.mjs`; the full discovered suite; lint; and independent review.

**Target Platform**: supported macOS, Linux, and Windows local Dude workspaces.

**Project Type**: reusable coordination bundle core.

**Performance Goals**: one deterministic read-only pass per invocation over the current ideas and, for the flowchart, the requested feature's single task file. No latency or throughput target applies beyond ordinary local CLI completion. No caching, snapshot, or persisted state is added, so repeated runs recompute from the current workspace.

**Constraints**: `src/` is authoritative. Generated `.github/` core files come only from `node scripts/build-dev.mjs` and are never hand-edited. The reused engine helpers are called unchanged; `feature.mjs` is edited only to widen its canonical key set.

## Spec Quality Validation

- The specification defines four prioritized, independently testable stories: focus buckets, dependency-derived order and Blocked, an on-demand status board visual, and an on-demand per-feature task-order visual.
- Acceptance scenarios cover exactly-one-bucket assignment, the four dependency conditions, cycles, several-Active, the no-signal Unordered case, board lane parity, and per-feature nodes and edges including an unresolved target.
- FR-001 through FR-013 state observable behavior without naming modules, files, commands, fields, or diagram technologies.
- SC-001 through SC-007 are measurable, and no clarification markers remain.
- Exclusions are limited to the HTML page, cross-feature task-level dependencies, multi-feature shipping, and a foreign-key guard recorded as a documented non-goal.

The specification satisfies its definition-time document gate by inspection. This is not a lint or readiness claim.

## Guardrail And Topology Justification

The binding guardrail is YAGNI: choose the smallest design that satisfies proven requirements, and add no capability without a current production caller. Every surface below names its current caller and the reachable failure it prevents.

| Surface | Current caller | Reachable failure it prevents | Proof |
|---|---|---|---|
| `depends-on` canonical-key recognition | `inventoryDefinedFeatures` (invoked by `dude-lint/lint.mjs` and by `resolveFeatureOwner`) | Without it, an idea that declares a dependency throws `frontmatter key 'depends-on' is not a canonical owner key`, which lint reports as malformed frontmatter and which blocks owner resolution for that idea. | SC-007 |
| Focus bucket derivation | read-only `@dude status` | The next idea to develop stays ambiguous whenever several ideas are open. | SC-001 |
| Optional ordering reader | `@dude status`, through the bucket derivation | Unblocked ideas that declared dependencies leave equal are shown in an arbitrary order, reintroducing the ambiguity this feature removes. | SC-001 |
| Mermaid kanban renderer | `@dude status` on request | There is no at-a-glance status board over the same buckets. | SC-004 |
| Mermaid flowchart renderer | `@dude status` on request | One feature's existing task order stays invisible even though the data exists. | SC-005 |
| Guarded CLI entry | `@dude status` invokes the script | The derivation has no production edge and `@dude status` falls back to hand-parsing. | SC-006 |

Rejected because no current caller justifies them:

- A dependency engine, scheduler, or queue over `depends-on:`.
- A second board or any persisted focus or order store.
- A writer for the optional ordering; the tie-break file stays hand-maintained.
- The static HTML page and its template pack decision.
- A guard or lint rule against foreign task-dependency keys.
- Cross-feature task-level dependencies.
- Any multi-feature shipping action, including a future extended ship command that has no caller today.

## Chosen Design

### 1. One read-only script inside the existing skill

Create `src/skills/dude-lightweight-execution/focus.mjs` inside the existing Lightweight Execution skill. No new skill directory and no new `SKILL.md` file are created. The module exposes its derivation and rendering logic as pure named exports and guards its CLI entry, so importing it runs nothing. The sole production caller is `@dude status`, which invokes the generated projection read-only in these forms:

```text
node .github/skills/dude-lightweight-execution/focus.mjs --root .
node .github/skills/dude-lightweight-execution/focus.mjs kanban --root .
node .github/skills/dude-lightweight-execution/focus.mjs flowchart <idea-slug> --root .
```

The default form prints the text focus buckets. The `kanban` subcommand prints the status board visual, and the `flowchart` subcommand prints one feature's task-order visual. The script writes nothing and emits no receipt or state.

### 2. Declared-dependency recognition

The only change outside the new script is in `src/skills/dude-engine/lib/feature.mjs`. Add `depends-on` to the canonical idea-frontmatter key set passed to `parseFrontmatterScalars` at its inventory call, defining the set once and reusing it. A plain space- or comma-separated scalar of idea slugs then parses and lints cleanly, while the strict canonical mode still rejects a YAML flow value such as `[a, b]` and a block-list value, which is not a scalar line. This edit must not change how `status:` or `spec_path:` are resolved.

A plain scalar is the required shape because the strict canonical-owner mode of `parseFrontmatterScalars` accepts only scalar lines and rejects flow and block collections. A plain scalar of slugs both records the dependencies and passes the existing strict validation, so it needs no new parser and no relaxation of the flow-and-block rejection.

### 3. Focus bucket derivation

This section defines bucket assignment; tasks refer to it as section 3.

The derivation reads only signals that already exist:

- Each idea's frontmatter through `parseFrontmatterScalars`: lifecycle status, `spec_path:`, and the declared `depends-on:` slugs.
- Each defined idea's package through `resolveFeatureOwner` then `parseTasks`: task completion, `[!]` and `blocked-by:` blocking evidence, and `[~]` in-progress state.
- The optional tie-break ordering from section 4.

Unmet-dependency rule (single, concrete, local, non-transitive): a declared `depends-on:` slug is met only when it names a defined idea whose package resolves through `resolveFeatureOwner`, parses through `parseTasks`, has at least one task, and has every task done. A slug that names no idea is unmet. Each named dependency is judged on its own package state and is never followed transitively, so a dependency cycle terminates with both endpoints unmet instead of looping.

Own-package blocking evidence: an idea is blocked by its own package when that package carries a `[!]` task or a `blocked-by:` line.

Bucket assignment, evaluated per in-flight idea with the first match winning so that exactly one bucket always applies:

1. **Blocked** — the idea has an unmet declared dependency by the rule above, or own-package blocking evidence.
2. **Active** — not blocked, and the idea's own package has an in-progress (`[~]`) task. There is no cap; any number of ideas may be Active.
3. **Unordered** — not blocked, not active, and no ordering signal: the idea declares no dependency, is not named in the tie-break order, and is not named as a dependency by any other idea.
4. **Next** — not blocked, not active, has an ordering signal, and nothing unfinished is ordered ahead of it, so it is ready to start next.
5. **Later** — the remaining in-flight ideas: not blocked, not active, ordered, but positioned behind a Next item by the tie-break order.

Effective order among the unblocked, non-active ideas comes from the declared dependencies first and the tie-break order second. Because unmet dependencies have already moved an idea to Blocked, the declared prerequisites among the remaining ideas are satisfied, so the tie-break order distinguishes Next from Later: the front of the order is Next and the rest are Later.

### 4. Optional tie-break reader

Add a reader for the optional `.dude/state/focus-order.md` file, a hand-maintained ordered list of idea slugs. The reader parses it into an ordered slug sequence and uses it only to break ties among unblocked, non-active items that the declared dependencies leave equal. Absence changes nothing: with no file, no item gains a tie-break position and the rest of the derivation is unaffected. This feature never writes the file, and lint does not scan it, because lint reads only the specific `.dude/state/task-state.json` snapshot rather than arbitrary `.dude/state/` files. A slug in the file that names no known idea is ignored rather than fatal.

### 5. Mermaid kanban renderer

The `kanban` subcommand emits a fenced Mermaid `kanban` diagram whose five lanes correspond exactly to the focus buckets from section 3. Each idea is one card keyed by its slug and, when the idea is defined, annotated with its specification number derived by `parseSpecIdentity` over the resolved `spec_path:`. Lanes and membership equal the text view for the same input. It writes nothing.

### 6. Mermaid flowchart renderer

The `flowchart` subcommand takes one idea slug, resolves its exact owner with `resolveFeatureOwner`, reads that package's `tasks.md` with `parseTasks`, and emits a fenced Mermaid `flowchart` with one node per task and one edge per literal `deps:` entry that targets a known task in the same file. A `deps:` target that does not resolve is noted rather than drawn, mirroring `parseTasks`, which records a dangling target as a warning and never throws. When the slug has no defined package, the subcommand reports plainly and writes nothing. Scope is one feature at a time; the renderer never spans features.

### 7. Status wiring, documentation, and projection

Update only `## Status And Handoff` in `src/skills/dude-lightweight-execution/SKILL.md` so `@dude status` invokes `focus.mjs` read-only: text buckets by default, and the Mermaid kanban and per-feature flowchart on request. Document the `depends-on:` idea field, the optional hand-maintained `.dude/state/focus-order.md` ordering, and the foreign-key-in-`deps:` footgun as a non-goal. Add a section-bound assertion in `scripts/current-format-contract.test.mjs` that binds the status surface to the script and to the documented field, ordering file, and footgun, each with a focused mutation that fails its owning assertion. Run `node scripts/build-dev.mjs` and confirm the generated `.github/skills/dude-lightweight-execution/focus.mjs`, the SKILL projection, and the generated `.github/skills/dude-engine/lib/feature.mjs` are byte-identical to source, with the test file remaining source-only.

### 8. Verification design

- `src/skills/dude-lightweight-execution/focus.test.mjs`: exactly-one-bucket assignment; the unmet rule across not-defined, not-done, all-done, and dangling targets; a dependency cycle leaving both endpoints Blocked without looping; several-Active with no cap; the no-signal Unordered case; kanban lanes equal to the text buckets for the same input; flowchart nodes and edges equal to the feature's literal `deps:`; a dangling `deps:` target and a draft-without-package request handled without crashing; and both renderers writing nothing.
- Feature-identity/feature suite: an idea carrying `depends-on: <slug> <slug>` inventories and validates clean; a structured-flow value is still rejected; ideas without the field are unaffected.
- `scripts/current-format-contract.test.mjs`: the status surface is bound to the script and to the documented field, ordering file, and footgun, each with a focused mutation that fails its owning assertion.
- Acceptance: the full discovered suite is green; `node .github/skills/dude-lint/lint.mjs .` reports zero warnings and zero failures, including with an idea that carries `depends-on:`; every focus surface writes nothing and leaves the workspace byte-unchanged; `git status --porcelain` shows only the intended `src/` additions and the single generated `.github/` projection set with no new skill directory; and `git diff --check` is clean. One fresh evidence set goes to independent review.

## Objective Registry

This feature has no measurable task-keyed runtime objective. Zero active registry regions is the applicable `none` case.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No additional supporting artifact is created.

## Source Layout

Authoritative source (new or edited):

- `src/skills/dude-lightweight-execution/focus.mjs` (new)
- `src/skills/dude-lightweight-execution/focus.test.mjs` (new)
- `src/skills/dude-lightweight-execution/SKILL.md` (edit `## Status And Handoff` only)
- `src/skills/dude-engine/lib/feature.mjs` (widen the canonical key set only)
- the existing feature-identity/feature test suite (extend with the `depends-on` cases)
- `scripts/current-format-contract.test.mjs` (extend with the status-surface assertion)

Reused without change:

- `src/skills/dude-engine/lib/feature-identity.mjs` (`parseFrontmatterScalars`, `parseSpecIdentity`, `resolveSpecIdentity`)
- `src/skills/dude-engine/lib/feature.mjs` (`resolveFeatureOwner`, `inventoryDefinedFeatures` behavior; only the key set widens)
- `src/skills/dude-engine/lib/tasks.mjs` (`parseTasks`)

Generated only through `node scripts/build-dev.mjs`:

- `.github/skills/dude-lightweight-execution/focus.mjs`
- `.github/skills/dude-lightweight-execution/SKILL.md`
- `.github/skills/dude-engine/lib/feature.mjs`

## Phases

- **Phase 1 - Declared-dependency recognition (T001@6b657973)**: add `depends-on` to the canonical key set and cover clean recognition and structured-form rejection.
- **Phase 2 - Focus derivation (T002@6275636b)**: derive the five buckets and the unmet rule read-only, reusing the engines.
- **Phase 3 - Visual views (T003@64726177)**: add the Mermaid kanban and per-feature flowchart subcommands.
- **Phase 4 - Wire and project (T004@6c696e6b)**: point `@dude status` at the script, document the data and footgun, and project source into `.github/`.
- **Phase 5 - Acceptance (T005@67617465)**: run acceptance, prove zero writes and no new persistent artifact, and route independent review.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@6b657973 | US1 | FR-002, FR-005, FR-013 | Declared-dependency recognition tests: clean inventory and validation, structured-flow rejection |
| T002@6275636b | US1, US2 | FR-001, FR-003, FR-004, FR-005, FR-006, FR-007, FR-011, FR-012 | Bucket-derivation tests: exactly-one-bucket, unmet rule, cycle terminates, several-Active, no-signal Unordered |
| T003@64726177 | US3, US4 | FR-008, FR-009, FR-010, FR-011 | Renderer tests: kanban lanes equal buckets, flowchart edges equal literal `deps:`, dangling and draft handled, no writes |
| T004@6c696e6b | US1, US3, US4 | FR-008, FR-009, FR-010 | Section-bound status-surface contract and byte-identical projection |
| T005@67617465 | US1, US2, US3, US4 | FR-001 through FR-013 | Full suite, lint including a `depends-on` idea, zero-write proof, clean git status, independent review |

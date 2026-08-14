# Implementation Plan: Theme-Agnostic And Technology-Independent Design Workflow

## Summary

Remove all implementation-technology and visual-system coupling from the `design` pack, and make the `strata` pack a fully independent, explicit-only visual system. The work is almost entirely pack-content and pack-test, plus one tiny directly-caused core doc correction: the genericized `design` pack no longer references `strata`, so the now-false `design -> strata` sibling-warning example in `src/skills/dude-compose/SKILL.md` is removed and reprojected.

Concretely:

1. Rewrite `library/packs/design/skills/dude-pack-design-workflow/SKILL.md` and `library/packs/design/pack.md` to a generic visual-design proposal workflow — dropping Hugo/Docsy activation and surfaces, the Microsoft/Brand Central handling, the SCSS/template examples, the required `strata-check` close step, and the `@dude-pack-strata-stylist` routing — while preserving every lane/ownership/lifecycle phrase the existing tests pin. Make Functional Realism target-capability-aware and route implementation to whichever installed specialist owns the actual target, naming no default.
2. Delete the ambient `library/packs/strata/instructions/dude-pack-strata-visual-system.instructions.md` artifact, drop it from `library/packs/strata/pack.md` `provides`, and narrow the `dude-pack-strata-stylist` agent and `dude-pack-strata-visual` skill descriptions to explicit-Strata-only triggers.
3. Refresh both installed packs with `compose refresh design` and `compose refresh strata`, which re-projects the design skill and transactionally deletes the old-only installed Strata instruction while updating `.dude/metadata/profile.md`. Correct the one now-false `design -> strata` sibling-warning example in `src/skills/dude-compose/SKILL.md` and reproject core with `node scripts/build-dev.mjs`. Run integrated acceptance and route fresh evidence to independent review.

The two edits are independent (disjoint pack subtrees) and both land before the shared refresh-and-acceptance step. New independence regressions live in pack-root test files (not projected), so the existing colocated design test stays byte-for-byte unchanged.

The canonical feature identity is `.dude/specs/032-theme-agnostic-design-workflow/spec.md`, prospectively owned by `.dude/ideas/theme-agnostic-design-workflow.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Markdown pack sources (`pack.md`, `SKILL.md`, `.agent.md`, `.instructions.md`); Node.js >= 20 `node:test` for pack regressions. No application runtime language. The only core `src/` change is one documentation line in `src/skills/dude-compose/SKILL.md` (no core logic changes).

**Primary Dependencies**: The `design` and `strata` pack sources under `library/packs/`; the core skill source `src/skills/dude-compose/SKILL.md` and the dev-bundle projection `node scripts/build-dev.mjs`; the shipped `compose refresh <pack>` operation (`.github/skills/dude-compose/compose.mjs`); `dude-lint` (`.github/skills/dude-lint/lint.mjs`); `compose verify`; the release build (`scripts/build-release.mjs`).

**Storage**: Authoritative pack source under `library/packs/` and authoritative core source under `src/`. Installed pack projections under `.github/{agents,skills,instructions,prompts}`; the core dev-bundle projection at `.github/skills/dude-compose/SKILL.md` (built from `src/` by `build-dev`). The install record at `.dude/metadata/profile.md`.

**Testing**: `node --test` on the design and strata pack tests (the unchanged `library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs` plus the new pack-root independence tests); the full recursively discovered suite; `node .github/skills/dude-lint/lint.mjs .`; `node .github/skills/dude-compose/compose.mjs verify`; `node scripts/build-dev.mjs` with a generated-source parity (dev-bundle drift) check confirming `.github/` matches `src/`; a pristine release build and release lint; and `git diff --check`.

**Target Platform**: Local Dude workspaces (macOS, Linux, Windows).

**Project Type**: Reusable coordination bundle; optional catalog packs under `library/packs/` projected into `.github/` by `dude-compose`.

**Performance Goals**: None applicable; this is documentation-shaped pack content plus static regressions.

**Constraints**: `library/packs/` is authoritative pack source and `src/` is authoritative core source. Installed `.github/` pack projections and `.dude/metadata/profile.md` are updated only through `compose refresh`, never hand-edited; the core dev-bundle projection under `.github/` is regenerated only through `node scripts/build-dev.mjs`, never hand-edited. The one `src/` change is a single documentation line in `src/skills/dude-compose/SKILL.md` (dropping the now-false `design -> strata` sibling-warning example); it adds no core logic. The accepted guardrail binds: a pack that claims to be standalone must not name, route to, validate through, or ambiently activate another pack; optional themes/visual systems activate only by explicit identity or existing system evidence.

## Specification Quality Validation

- The specification defines four prioritized, independently testable stories: a generic design proposal with no visual system installed, target-capability-aware functional realism, an opt-in visual system that never activates ambiently, and naming a chosen system without new machinery.
- Acceptance scenarios cover the full generic loop, generic-quality ownership, no-default routing, in- and out-of-envelope affordances, missing-envelope pause, absence of an ambient artifact, explicit-only activation, mutual non-reference, and no new infrastructure.
- FR-001 through FR-015 state observable behavior without naming packs, files, or handles; SC-001 through SC-008 are measurable and technology-agnostic.
- No `[NEEDS CLARIFICATION]` marker remains.

The specification satisfies its definition-time document gate by inspection. This is not a lint or readiness claim.

## Verified Current Topology

1. `library/packs/design/pack.md` claims standalone independence yet its "Independence" section cites "a hand-authored Hugo site," an "Its visual-system steps are optional and conditional" block names `strata`, `dude-pack-strata-visual`, and `@dude-pack-strata-stylist` (and `hugo` / `docsy`), and a "Related packs" section names `strata`, `hugo`, and `docsy`.
2. `library/packs/design/skills/dude-pack-design-workflow/SKILL.md` carries the normative coupling: the frontmatter `description` and "When This Activates" name Hugo/Docsy and Microsoft visual-brand; "Functional Realism" declares "a static Hugo/Docsy site with no backend"; "Design-Shaped `spec.md`" cites Hugo templates/partials/shortcodes/SCSS; "Task Generation" shows a Hugo `layouts/_shortcodes/news-card.html` + `assets/scss/_styles_project.scss` example; "Design Close Protocol" prefers the Hugo/Docsy build/server, runs `strata-check.ps1`/`.sh`, and routes to `@dude-pack-strata-stylist`; "Routing" names the "owning Hugo/Docsy specialist" and the Strata stylist; and "Avoid" carries static-only affordance examples and a "Microsoft Brand Central" redirect.
3. `library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs` pins only lane authority, ownership, and lifecycle logs and reads exclusively its own `./SKILL.md`. It does not assert technology/theme independence. Because the design skill directory is projected into `.github/skills/dude-pack-design-workflow/` (where `pack.md` and sibling packs are absent), this test can safely read only skill-local files.
4. `library/packs/strata/instructions/dude-pack-strata-visual-system.instructions.md` uses `applyTo: '**/*.{html,css,scss,jsx,tsx,vue,svelte,md,mdx,astro}'` with "When working on any visual surface" default rules — the ambient artifact. It is declared in `library/packs/strata/pack.md` `provides.instructions` and described in that file's "### Instructions" section, and it is installed at `.github/instructions/dude-pack-strata-visual-system.instructions.md` and recorded in the `strata` inventory in `.dude/metadata/profile.md`.
5. `library/packs/strata/agents/dude-pack-strata-stylist.agent.md` and `library/packs/strata/skills/dude-pack-strata-visual/SKILL.md` descriptions list generic triggers ("theme this app," "style this chart," "pick colours for these data series," "add a dark theme," "fix contrast," "fix focus rings," "put this on the spacing scale," "make this less rounded," "remove/get rid of drop shadows") alongside the explicit-Strata triggers ("apply Strata," "use the Strata tokens," "wire up --strata-*," "switch to the spectrum palette," "use the pigment palette").
6. `library/packs/strata/prompts/dude-pack-strata-apply-visual-system.prompt.md` is explicit-invocation only ("Apply the Strata visual system to the current file/selection") and carries no ambient trigger prose. It is unchanged; it stays a provided prompt.
7. `library/packs/strata/pack.md` already assumes no implementation technology and does not reference `design`; strata needs no realignment beyond dropping the instruction artifact and narrowing the two descriptions.
8. The `strata` inventory in `.dude/metadata/profile.md` currently lists four artifacts (stylist agent, the instruction, the apply prompt, the visual skill). Removing the instruction is a single old-only removal for `compose refresh strata`; the shipped Transactional Pack Refresh (feature 031) deletes it and updates `files`, hashes, and inventory digest as one all-or-restored transaction.
9. `scripts/build-release.mjs` ships core-tier files only and excludes packs and `*.test.mjs`; pack changes and pack-root tests never enter the core release. The release build is therefore a core-integrity regression, and the proof that the ambient artifact ships nowhere is the catalog deletion plus `compose verify` plus source-installed parity.
10. `src/skills/dude-compose/SKILL.md` (projected to `.github/skills/dude-compose/SKILL.md` by `build-dev`) documents the expected sibling-pack warnings `hugo` -> docsy/ms-brand, `design` -> strata, `fluent-ui` -> web. Once the `design` pack no longer references `strata`, the `design -> strata` entry is false; only that one entry is removed, leaving `hugo` -> docsy/ms-brand and `fluent-ui` -> web intact. This is human guidance prose, not asserted by `compose.test.mjs` (which uses synthetic fixture packs), so the correction stays one line plus its reprojection.

## Guardrail And Smallest-Design Check

Binding rules: the accepted standalone-pack guardrail; YAGNI (no capability without a current caller); and keeping `spec.md` intent separate from this plan's HOW. The named callers are the dogfood design lane and the dogfood Strata pack, both installed.

| Kept | Reachable need | Proof |
|---|---|---|
| Genericize the design SKILL.md and pack.md | The pack claims standalone but couples to Hugo/Docsy/Microsoft/Strata. | FR-001, FR-003; SC-001, SC-006 |
| Preserve every lane/ownership/lifecycle phrase the current test pins | Genericization must not regress the proven lane, ownership, and lifecycle guarantees. | FR-002, FR-014; SC-002 |
| Target-capability-aware Functional Realism, no default owner | A fixed static premise is wrong on any non-static target and names a default. | FR-005, FR-006, FR-007; SC-003 |
| Delete the ambient Strata instruction artifact | Installing Strata must not apply it to nearly every visual file. | FR-009, FR-015; SC-004 |
| Narrow the Strata agent + skill triggers to explicit identity | Generic visual phrases must not select Strata. | FR-010; SC-005 |
| Keep the Strata prompt, skill, and agent as the explicit path | Strata rules must stay available on explicit activation. | FR-011 |
| New pack-root independence regressions | Independence and explicit-only activation must be pinned, without touching the existing colocated test. | FR-003, FR-008, FR-010, FR-014; SC-001, SC-005, SC-006 |
| `compose refresh` for both packs | Installed projections and the install record must match the changed source transactionally. | FR-015; SC-008 |
| Drop the stale `design -> strata` compose example and reproject core | The genericized `design` no longer references `strata`, so core guidance and `compose verify` output must agree; directly-caused cleanup, not new capability. | SC-002, SC-006 |

Rejected designs (YAGNI):

- A shared theme registry, adapter interface, theme-discovery layer, or new workflow system for future visual systems. There is no current caller; future systems stay independent peer packs, and a chosen system is named in ordinary approved-direction and task prose. (FR-012, FR-013; SC-007)
- A new persistent metadata field or schema to record the selected system. Ordinary prose already carries it. (FR-013)
- A conditional "if Strata is installed" branch inside the design lane. The guardrail forbids conditional activation of another pack; design references no visual system at all. (FR-003)

## Chosen Design

### 1. Genericize `library/packs/design/skills/dude-pack-design-workflow/SKILL.md` (Skill/Agent/Instruction Smith)

- Frontmatter `description` and "When This Activates": replace "Hugo/Docsy surface design" and "Microsoft visual-brand application" with generic rendered-surface direction (mood, layout, look and feel, tokens, typography, spacing, colour system) with no named technology or brand.
- "Functional Realism": replace the "static Hugo/Docsy site with no backend" premise and its fixed not-buildable list with a target-capability-aware check: the actual target's implementation owner declares the capability envelope; each actionable element is validated against that envelope; out-of-envelope affordances are replaced with a real equivalent, dropped and recorded under scope/assumptions, or flagged `design-gap` and routed back before approval. Keep "fail fast on the page."
- "Design-Shaped `spec.md`": change the optional `plan.md` note from Hugo templates/partials/shortcodes/SCSS to generic "concrete surfaces, components, or style sources."
- "Task Generation": replace the Hugo `layouts/_shortcodes/news-card.html` + `assets/scss/_styles_project.scss` example with a generic surface-path example.
- "Design Close Protocol": generalize the render/build step to "the target owner's build or preview mechanism" with no default; remove the `strata-check` validator step and the "route visual quality judgment to `@dude-pack-strata-stylist`" step entirely; keep provenance, functional-realism, accessibility/contrast, and compare-to-approved-preview checks; keep the lane-aware close (Lightweight Execution `[x]`, tracked `bd close`, mirror) verbatim.
- "Routing": replace "owning Hugo/Docsy specialist" with "the installed specialist that owns the actual target surface" (no default); remove the Strata stylist authority line; keep `@dude-spec-lead` and `@dude-reviewer`.
- "Avoid": generalize the static-only affordance example to "affordances the target cannot deliver"; remove the Microsoft Brand Central redirect; keep the generic "reuse existing tokens/patterns" guidance.
- Preserve verbatim every phrase the existing test asserts: the Purpose lane sentences; the Avoid lane sentences; the Approval Gate active-lane lines; the Task Generation Beads-mirror line; the Close Protocol Lightweight/Beads/`bd close`/mirror tokens; the refinement active-lane/`bd update --status blocked`/`design-gap` lines; the Core Model idea→spec→design→tasks graph; the Mutation Preconditions ownership sentences; the four Coordinator Log ownership sentences; and the "Do not create a separate `design-brief.md`…" line. Keep the section headings the test slices on unchanged.

### 2. Genericize `library/packs/design/pack.md` (Pack Smith)

- "Independence": drop "a hand-authored Hugo site"; state the lane stands alone in any project, its only required handoffs are to core (`@dude-spec-lead`, `@dude-reviewer`), and implementation routes to whichever installed specialist owns the actual target.
- Remove the "Its visual-system steps are optional and conditional" block naming `strata` / `dude-pack-strata-visual` / `@dude-pack-strata-stylist` / `hugo` / `docsy`. Replace with a generic statement that a chosen visual system, when one is selected, is applied by that system's own pack and named only in the approved direction; the design lane references none.
- "Related packs": remove the section naming `strata` / `hugo` / `docsy`, or replace it with pack-name-free prose to the same effect.
- Keep the generic Provides, install/remove, and `design-gap`/`VSC-…` descriptions.

### 3. Add `library/packs/design/independence.test.mjs` (Tester) — new pack-root regression, not projected

Reads `./pack.md` and `./skills/dude-pack-design-workflow/SKILL.md` and asserts, using section-level and targeted-handle checks rather than a fragile exhaustive word ban:

- Neither file contains the specific coupling handles/names being removed: `Hugo`, `Docsy`, `Strata`/`strata`, `strata-check`, `dude-pack-strata-stylist`, `dude-pack-strata-visual`, `Brand Central`, `Microsoft`, `React`, `SCSS`/`.scss`.
- The Functional Realism section is target-capability-aware (mentions the implementation owner's declared capability envelope) and no longer contains "static Hugo/Docsy site with no backend."
- Generic design quality remains in the workflow: accessibility, contrast, provenance, and functional realism are all present.
- Implementation routing names no default specialist and routes to the installed owner of the actual target.

Leaving `design-workflow.test.mjs` byte-for-byte unchanged keeps all five existing lane/ownership/lifecycle tests intact.

### 4. Remove the ambient Strata instruction (Skill/Agent/Instruction Smith + Pack Smith)

- Delete `library/packs/strata/instructions/dude-pack-strata-visual-system.instructions.md` and, if it becomes empty, the `library/packs/strata/instructions/` directory.
- In `library/packs/strata/pack.md`, remove the `instructions:` entry from `provides` and the "### Instructions" description subsection. Leave `provides.prompts` and the prompt intact.

### 5. Narrow Strata activation triggers (Agent Smith + Skill/Agent/Instruction Smith)

- In `library/packs/strata/agents/dude-pack-strata-stylist.agent.md`, rewrite the `description` "Use when" list to explicit-Strata triggers only: apply Strata, use the Strata tokens, wire up `--strata-*`, switch to the spectrum palette, use the pigment palette, work on an existing Strata surface. Remove "theme this app," "style this chart," "pick colours for these data series," "add a dark theme," "fix contrast," "fix focus rings," "put this on the spacing scale," "make this less rounded," and "remove these drop shadows." Keep the not-a-branding-service note.
- In `library/packs/strata/skills/dude-pack-strata-visual/SKILL.md`, apply the same narrowing to the frontmatter `description` "USE WHEN" list and align the "## When to use this skill" body so it advertises explicit-Strata intent and existing-Strata surfaces only, not generic visual phrasing. Keep the DO NOT USE branding carve-out and all downstream reference/token/validator content unchanged.

### 6. Add `library/packs/strata/independence.test.mjs` (Tester) — new pack-root regression, not projected

Reads `./pack.md`, `./agents/dude-pack-strata-stylist.agent.md`, and `./skills/dude-pack-strata-visual/SKILL.md` and asserts:

- `library/packs/strata/instructions/dude-pack-strata-visual-system.instructions.md` does not exist, and `pack.md` `provides` no longer lists an `instructions:` entry.
- The agent and skill frontmatter `description` and the skill's "## When to use this skill" section contain the explicit-Strata triggers (apply Strata, use the Strata tokens, wire up `--strata-*`, switch to the spectrum palette, use the pigment palette, an existing Strata surface) and contain none of the full generic routing phrases: "theme this app", "style this chart", "pick colours for these data series", "add a dark theme"/"give this a dark theme", "put this on the spacing scale", "fix contrast"/"fix the contrast", "fix focus rings"/"fix the focus rings", "make this less rounded", and "get rid of these drop shadows"/"remove these drop shadows". The absence check targets those full routing phrases in the `description` and the When-to-use guidance only; it must not ban the bare tokens spacing, contrast, focus, radius, or drop shadows, which stay legitimate in the substantive Strata rules/reference/token/validator body — and that body stays intact and unchecked.
- Neither the pack nor its agent/skill references the design lane by identity: none contains `dude-pack-design-workflow`, an `@dude-pack-design` / `dude-pack-design-` handle, or the phrases "design lane", "design pack", or "design workflow". Generic `design` / `design system` prose (for example the "unaffiliated with any … design system" disclaimer) is explicitly allowed and must not fail the check.

### 7. Refresh installed packs, correct the stale core compose example, and update generated output (Shared / coordinator authority)

- `node .github/skills/dude-compose/compose.mjs refresh design` re-projects `.github/skills/dude-pack-design-workflow/` (the genericized SKILL.md and the unchanged colocated test) and updates the `design` inventory in `.dude/metadata/profile.md`.
- `node .github/skills/dude-compose/compose.mjs refresh strata` re-projects the narrowed agent and skill, deletes the old-only `.github/instructions/dude-pack-strata-visual-system.instructions.md` destination, and updates the `strata` `files`, per-artifact hashes, and inventory digest — all as one all-or-restored transaction.
- Core doc correction: in `src/skills/dude-compose/SKILL.md`, remove only the `design -> strata` item from the expected sibling-pack warnings list, leaving `hugo` -> docsy/ms-brand and `fluent-ui` -> web unchanged; touch no other pack warning. Then run `node scripts/build-dev.mjs` to reproject core into `.github/skills/dude-compose/SKILL.md`. This is the single directly-caused core change; it adds no logic and no capability, and is regenerated only through `build-dev`, never hand-edited.
- The pack-root independence tests are not in either pack's `provides`, so `compose refresh` does not project them; they remain catalog-only and run via `node --test` discovery.

### 8. Integrated acceptance and review (Shared)

Run over one unchanged revision and route the evidence to independent review (below). Acceptance includes the generated-source parity (dev-bundle drift) check: after `build-dev`, re-running it is a no-op and `.github/skills/dude-compose/SKILL.md` matches its `src/` source, with the `design -> strata` example absent in both and the other sibling warnings intact.

## Test Strategy

- Preserve `library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs` unchanged; its five existing tests continue to pin lane authority, ownership, and lifecycle logs.
- Add `library/packs/design/independence.test.mjs` and `library/packs/strata/independence.test.mjs` as pack-root tests (not projected), so they may read `pack.md`, agent, skill, and the absent instruction path across each pack.
- Prefer section-level and target-handle assertions over exhaustive word bans; the denylists are limited to the exact handles/names this feature removes. The strata trigger-absence check targets the full generic routing phrases scoped to the agent/skill frontmatter `description` and the skill's "## When to use this skill" section only, never the bare tokens spacing/contrast/focus/radius/drop shadows that remain legitimate in the substantive Strata body; the strata design-reference check targets design-lane identity (`dude-pack-design-workflow`, `@dude-pack-design` / `dude-pack-design-` handles, and the phrases "design lane"/"design pack"/"design workflow") and explicitly allows generic `design` / `design system` prose.
- Verification commands: `node --test` on the three pack tests; the full recursively discovered suite; `node .github/skills/dude-lint/lint.mjs .` (zero failures; confirms no orphaned `@dude-pack-strata-stylist` handle or `.github/skills/dude-pack-strata-visual/` path remains in the genericized design skill); `node .github/skills/dude-compose/compose.mjs verify` (both packs project and lint cleanly; the former `design -> strata` sibling warning no longer occurs); source-installed parity plus profile-inventory checks after refresh (installed bytes equal projected source, the removed instruction is absent on disk and in the record); `node scripts/build-dev.mjs` plus a generated-source parity (dev-bundle drift) check (the projected `.github/skills/dude-compose/SKILL.md` equals its `src/` source, the `design -> strata` example is absent in both, and `hugo` -> docsy/ms-brand and `fluent-ui` -> web remain); a pristine release build and release lint (core integrity; packs and tests are excluded, so the removed artifact ships nowhere); and `git diff --check`.
- `node scripts/build-dev.mjs` reprojects the one corrected core file (`src/skills/dude-compose/SKILL.md`) into `.github/`; pack projections remain handled separately by `compose refresh`. The dev-bundle drift check confirms `.github/` matches `src/` with no unintended core change.

## Phases

- **Phase 1 — Genericize the design pack** (Chosen Design 1–3): rewrite the design SKILL.md and pack.md, add the design independence regression, leave the colocated test unchanged; prove with `node --test` on both design tests.
- **Phase 2 — Make Strata explicit-only** (Chosen Design 4–6): delete the ambient instruction, drop it from `provides`, narrow the agent and skill triggers, add the strata independence regression; prove with `node --test` on the strata test. Independent of Phase 1 (disjoint pack subtrees).
- **Phase 3 — Refresh and integrated acceptance** (Chosen Design 7–8): `compose refresh` both packs, make the one directly-caused core `dude-compose` doc correction and reproject it with `node scripts/build-dev.mjs`, run the full acceptance set (including the generated-source parity check), and route fresh evidence to independent review. Depends on Phases 1 and 2.

## Requirements Traceability

| Specification coverage | Plan ownership | Phase |
|---|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-014 / SC-001, SC-002, SC-006 | Genericize design SKILL.md + pack.md; independence regression (sections 1–3) | Phase 1 |
| FR-005, FR-006, FR-007 / SC-003 | Target-capability-aware Functional Realism and no-default routing (section 1) | Phase 1 |
| FR-008, FR-009, FR-011, FR-015 / SC-004 | Remove ambient instruction; drop from provides (sections 4, 7) | Phase 2, Phase 3 |
| FR-010 / SC-005 | Narrow Strata agent + skill triggers; strata independence regression (sections 5, 6) | Phase 2 |
| FR-012, FR-013 / SC-007 | No registry/adapter/schema; naming in ordinary prose (Guardrail check; sections 1, 2) | Phase 1, Phase 2 |
| FR-015 / SC-008 | Transactional `compose refresh` of both packs and the profile (section 7) | Phase 3 |
| All FR / all SC | Integrated acceptance over one unchanged revision, routed to review (section 8) | Phase 3 |

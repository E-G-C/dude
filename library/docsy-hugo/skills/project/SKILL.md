---
name: 'project'
description:
  'Project-specific domain knowledge, conventions, and patterns. Update this
  skill as the project evolves so Dude and specialists can use it as shared
  context.'
---

# Project Knowledge

## Project Shape

- **Domain**: reusable Dude Coder bundle for markdown-based multi-agent feature
  definition plus optional lightweight or Beads-tracked execution
- **Primary artifacts**: user-facing docs in `README.md`, agent and skill
  definitions under `.github/`, and bundle memory files
- **Coordinator**: `@dude` owns routing, memory, skills, and team management
- **Current roster**: `@dude-spec-lead`, `@dude-lead`, `@dude-tester`,
  `@dude-reviewer`, `@dude-local-docsy-expert`,
  `@dude-local-hugo-docs-researcher`, `@dude-local-hugo-site-architect`,
  `@dude-local-hugo-template-specialist`, `@dude-local-hugo-troubleshooter`,
  `@dude-local-hugo-migration-specialist`, and `@dude-local-ms-brand-stylist`
  alongside the coordinator
- **Default first-run path**: ask whether the user wants to implement now or
  just define; if they want implementation and do not explicitly ask for Beads,
  default to Lightweight Execution, otherwise start with Definition Only

## Working Conventions

- The human decides desired outcome, hard constraints, and approvals; Dude owns
  normalization, routing, metadata bookkeeping, and handoff.
- If the user's first substantive request already answers the three onboarding
  questions, treat onboarding as satisfied and move directly to the next
  workflow step.
- `brainstorm/<slug>.md` is the working ledger before definition.
- Refresh `specs/<feature>/` artifacts via `@dude define` instead of
  hand-maintaining generated state.
- `@dude status` is a read-only orientation command across definition,
  Lightweight Execution, and Tracked Execution; it must not import or mutate
  work.
- `status:`, `spec_path:`, and `## Coordinator Log` are Dude-maintained workflow
  metadata.
- `@dude track` means import or resume tracked execution in Beads; it does not
  compile the app.
- When Beads is unavailable or intentionally not used,
  `specs/<feature>/tasks.md` is the first-class markdown execution board.
- Supporting checklist files are advisory during Lightweight Execution;
  `tasks.md` remains the single live execution board before import, and any
  Dude-generated board region inside that file is derived guidance rather than a
  second board.
- In Lightweight Execution, canonical task headers may use `[ ]`, `[~]`, `[!]`,
  and `[x]`, with optional indented `deps:` and `blocked-by:` metadata lines.
- In Lightweight Execution, only the coordinator mutates task-state glyphs or
  task metadata after routed workflow changes and fresh verification evidence.
- Lightweight task lines use durable task IDs such as `T001@a1b2c3d4`.
- One bounded task may combine closely related code, tests, and docs when one
  fresh verification step proves the slice.
- Once imported, Beads is the only live execution board and source of truth.
  `tasks.md` may be kept updated only as a one-way, non-authoritative Beads
  mirror for portability and fallback.
- After Dude closes Beads work, mirror the Beads result back to the matching
  canonical task unit in `tasks.md` when the durable task key maps cleanly.
  Regenerate any derived board region, record the write-back in the brainstorm
  Coordinator Log, and run `dude-lint`.
- Use explicit `@dude sync Beads to tasks.md` for stale mirrors, manual Beads
  changes, or planned fallback from Tracked Execution to Lightweight Execution.
- Typed `@dude flag` prefixes are preferred, but plain-language blocker reports
  should still be classified when the intended type is clear.
- Guardrail ratification accepts `accept`, `edit`, `reject`, or `skip`; `skip`
  means continue with bundle defaults only.
- For clearly solo, exploratory, or hobby-style repos, inferred candidate
  guardrails should stay minimal.
- If guardrail inference yields no new project-specific entries beyond bundle
  defaults, continue definition without a separate guardrail pause.
- Surface the Windows Dolt server-mode path early whenever tracked execution is
  being enabled.
- Users may not know when worktrees would help; if a risky/high-churn change or
  truly independent parallel work would materially reduce risk or checkout
  contention, Dude may suggest them briefly with the concrete benefit and a
  simpler fallback instead of waiting for the user to ask.
- Ask the smallest set of questions that materially change scope, constraints,
  approvals, or routing.

## Domain Knowledge

- This repository's primary deliverable is the reusable Dude Coder bundle
  itself, so most changes target `.github/` and `README.md` rather than product
  code.
- This repository is also a **Docsy Hugo documentation site** (`hugo.yaml`,
  `content/`, `assets/scss/`, `layouts/`). Route any Docsy/Hugo task — install,
  config, shortcodes, content authoring, SCSS theming, search/i18n/versioning,
  deployment, or build troubleshooting — to `@dude-local-docsy-expert`, backed
  by the `.github/skills/dude-local-docsy/` reference skill and the
  `/install-site`, `/new-docs-page`, `/new-blog-post`, `/add-shortcode`,
  `/customize-theme`, `/setup-search`, `/setup-i18n`, `/setup-versioning`,
  `/setup-deployment`, `/enable-agent-support`, `/troubleshoot-build`, and
  `/update-docsy` prompts.
- Docsy authoring rules are auto-applied by file type via
  `.github/instructions/docsy-config.instructions.md` (Hugo config),
  `docsy-content.instructions.md` (content Markdown), and
  `docsy-scss.instructions.md` (`assets/scss/**`); these load automatically and
  do not need to be merged into the always-on `dude.instructions.md`.
- Generic Hugo work is routed by specialty: documentation and reference lookups
  to `@dude-local-hugo-docs-researcher`, site
  architecture/config/content-model/deployment to
  `@dude-local-hugo-site-architect`, templates/shortcodes/render hooks/Hugo
  Pipes to `@dude-local-hugo-template-specialist`,
  build/server/missing-page/performance diagnostics to
  `@dude-local-hugo-troubleshooter`, and migrations/upgrades to
  `@dude-local-hugo-migration-specialist`. These are backed by
  `.github/skills/dude-local-hugo-docs-reference/`,
  `dude-local-hugo-site-builder/`, `dude-local-hugo-template-authoring/`,
  `dude-local-hugo-asset-pipeline/`, `dude-local-hugo-functions-and-methods/`,
  `dude-local-hugo-troubleshooting/`, and `dude-local-hugo-migration/`.
- Hugo authoring rules are auto-applied by file type via
  `.github/instructions/hugo-project.instructions.md` (config/project
  structure), `hugo-content.instructions.md` (content),
  `hugo-templates.instructions.md` (layouts/templates), and
  `hugo-assets-modules.instructions.md` (assets/modules). Keep Docsy-specific
  guidance narrower than generic Hugo guidance when both apply.
- **Microsoft visual brand is enforced in two automatic layers, not by running
  an agent per page.** (1) Build layer: `assets/scss/_variables_project.scss`
  imports `.github/skills/dude-local-ms-visual-brand/tokens/ms-brand.scss` and
  wires the palette, Segoe UI fonts, and spacing into Docsy/Bootstrap variables,
  so every page Hugo renders inherits the brand. (2) Edit layer:
  `.github/instructions/ms-visual-brand.instructions.md`,
  `ms-typography.instructions.md`, and `ms-logo-usage.instructions.md` auto-load
  whenever an agent edits a matching content/template/SCSS file. On top of
  those, when work produces or edits a rendered Hugo surface (page, layout,
  partial, shortcode, SCSS), pair the Hugo/Docsy owner with a
  `@dude-local-ms-brand-stylist` brand check before close. Use
  `bash .github/skills/dude-local-ms-visual-brand/scripts/brand-check.sh` (or
  `pwsh .github/skills/dude-local-ms-visual-brand/scripts/brand-check.ps1`) as a
  fast drift guard that fails when raw Microsoft brand hex codes leak into
  content/templates/SCSS or the token import is missing.
- First-time users are often unfamiliar with Beads, guardrails, `spec_path`,
  when `tasks.md` is live versus mirrored, what `[ ]` / `[~]` / `[!]` / `[x]`
  mean, and why a generated board region may appear there; prefer plain
  language, short examples, and explicit file ownership.
- Guardrail ratification is a normal pause point in definition, not a failure
  state.
- A lean definition package is valid; omit placeholder artifacts for domains
  that do not materially apply.
- If a draft clearly spans several bounded outcomes, split or narrow it before
  definition instead of letting one brainstorm file become a roadmap.

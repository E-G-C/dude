# Focused Test Checklist

## Brainstorm Intake

- [ ] A fresh `brainstorm` request creates exactly one direct-child `.dude/ideas/<slug>.md` with `## Idea` and creates no spec package or nested idea path.
- [ ] Initial light cleanup corrects only clear mechanical defects and preserves tone, uncertainty, incomplete thoughts, creative intent, and user edits.
- [ ] Ambiguous wording remains visible or becomes an open question rather than being silently resolved.
- [ ] Rerunning `brainstorm` without an explicit revision preserves the existing `## Idea` content.
- [ ] `define` consumes the idea, writes the package, preserves status semantics, records exact `spec_path`, and appends the idea Coordinator Log.

## Deprecated Alias

- [ ] `@dude draft` performs brainstorm behavior, emits deprecation guidance, and writes only `.dude/ideas/`.
- [ ] Rerunning `draft` refreshes an existing idea without creating `.dude/brief/`.
- [ ] Primary command lists, status guidance, and lifecycle diagrams lead with `brainstorm`; every retained command-level `draft` mention is explicitly compatibility or deprecation context.

## Workspace And Migration

- [ ] Shared path tests classify only direct `.dude/ideas/*.md` children as canonical and root `brief/` plus `.dude/brief/` as distinct legacy inputs.
- [ ] Ordinary mutations accept valid canonical ideas, block either non-empty legacy root even when it is the only intake state, and block every mixed legacy/canonical layout before writes.
- [ ] Empty legacy directories remain harmless.
- [ ] Preflight rejects a symbolic link at the workspace root, either legacy root, the canonical ideas root, or any existing source/destination ancestor before recursive inventory begins.
- [ ] Replacing a previously checked regular source, destination, or ancestor with a symbolic link after plan changes the recomputed digest and blocks apply before tracker or filesystem mutation.
- [ ] Root `brief/<slug>.md` and `.dude/brief/<slug>.md` map directly by basename to `.dude/ideas/<slug>.md`.
- [ ] A nested directory, nested Markdown file, non-Markdown file, symbolic link, or non-regular entry in either legacy intake root is an actionable conflict and is never copied as nested canonical state.
- [ ] Equivalent ready plans built from the same bytes in different creation/enumeration order produce the same `plan_digest`.
- [ ] The digest binds the plan schema/version; sorted operations; source/destination path and file type; source and transformed-output hashes; complete canonical destination inventory; relevant first-line task-audit values/hashes; complete Beads issue id/full-description inventory; and every other mutation-relevant plan field.
- [ ] `apply` rejects a missing `--plan-digest`, a wrong digest, or a wrong/missing literal `--confirm migrate-dude-layout` token with zero tracker calls and zero filesystem writes, including for a no-op plan.
- [ ] `--allow-dirty` is required for a deliberately dirty worktree but cannot bypass a missing or mismatched reviewed digest.
- [ ] Editing a legacy source after plan changes the recomputed digest and blocks apply before mutation.
- [ ] Creating a destination, deleting one, changing its bytes, or changing its file type after plan changes the recomputed digest and blocks apply before mutation.
- [ ] Editing the exact first-line audit breadcrumb of any relevant `tasks.md` after plan changes the recomputed digest and blocks apply before mutation.
- [ ] Adding or removing a Beads issue, changing an issue id, or changing any full issue description after plan changes the recomputed digest and blocks apply before mutation, including drift in an issue with no planned rewrite.
- [ ] The pure ledger transform preserves source newline convention and every byte outside exact permitted edits.
- [ ] Backtick-fenced and tilde-fenced CommonMark examples containing `## User Draft` or `## Idea` remain untouched and do not count as ledger headings.
- [ ] Exactly one real `## User Draft` becomes `## Idea`; exactly one existing real `## Idea` is accepted; missing, duplicate, and mixed real headings are actionable conflicts.
- [ ] Migration preserves frontmatter quoting, body text, assumptions, questions, and all prior Coordinator Log entries, then appends exactly one fixed `- migrated intake ledger: canonical location is .dude/ideas/` event at the end of the existing log using the source newline convention.
- [ ] Rerunning the transform when the fixed migration event already exists does not append it again.
- [ ] Only the exact first line of `tasks.md` in a supported root or `.dude` legacy audit-comment form rewrites to `.dude/ideas/<slug>.md#coordinator-log`; audit-like comments elsewhere and generic prose remain byte-identical.
- [ ] Existing explicitly parsed `spec_path:`, `preview_path:`, task-state key, manifest JSON, and first-line Beads `spec:` migrations remain covered without introducing generic Markdown replacement.
- [ ] Root and `.dude` legacy sources converging on one destination deduplicate only when transformed bytes match and otherwise conflict before mutation.
- [ ] Apply rollback restores prior files, directory shape, and exact tracker descriptions after injected filesystem or tracker failure.
- [ ] A successful apply is followed by clean lint and a newly recomputed source migration plan with `status: noop`.

## Lint And Identity

- [ ] Lint accepts valid draft and defined ideas, quoted scalars, CRLF content, managed fences, `## Idea`, Coordinator Log, and canonical task audit links.
- [ ] Lint rejects malformed status or frontmatter, missing or invalid idea headings, dangling spec targets, unsafe paths, and invalid audit links.
- [ ] Lint rejects duplicate defined `spec_path` ownership across idea files and names every conflicting owner.
- [ ] Lint and other read-only diagnostics warn, without failing solely for path age, when valid direct-child intake exists only in root `brief/`, only in `.dude/brief/`, or non-conflictingly in both, and name the exact migration action.
- [ ] Lint fails canonical `.dude/ideas/` combined with either non-empty legacy root, and fails legacy-only nested, unsupported, colliding, or malformed intake with actionable paths.
- [ ] Every `tasks.md` must begin with the exact canonical idea audit breadcrumb whose target is a defined idea with `spec_path` equal to that package's `spec.md`.
- [ ] Missing audit owners, breadcrumbs pointing to another package's owner, and duplicate exact `spec_path` owners produce distinct actionable errors naming the package and candidate idea paths.

## Lifecycle Integrations

- [ ] Definition status, diff, and self-check recognize ideas as canonical, preserve append-only logs, warn for migratable legacy-only state, and fail conflicting mixed state without mutation.
- [ ] Lightweight task breadcrumbs, close logs, reconciliation logs, and work-loop updates target the companion idea.
- [ ] Upgrade and portability preserve `.dude/ideas/` and route legacy brief state through explicit migration.
- [ ] Bundle import, compose, skill scaffold, and team expansion focused fixtures prove their inherited shared mutation assertion accepts canonical ideas and blocks legacy/mixed state.
- [ ] Bundle import, compose, skill scaffold, and team expansion production files change only if a focused fixture first exposes a real bypass, stale path assumption, or incorrect guidance.
- [ ] Beads import planning finds exactly one defined idea by exact `spec_path`, rejects missing or duplicate owners, and never scans `.dude/brief/` as canonical.
- [ ] Beads mirror and sync update task state and append the companion idea log without changing Beads authority.
- [ ] Design workflow references to the Dude ledger use idea terminology while unrelated design-brief language remains unchanged.

## Dogfood Cutover

- [ ] The definition artifacts remain at `.dude/brief/brainstorm-ideas-intake.md` with the matching first-line task audit breadcrumb throughout definition and all pre-cutover source work.
- [ ] After required core `src/` consumers and migration/lint support pass, the coordinator runs `node src/skills/dude-workspace-migration/migrate.mjs plan --root . --json`; no stale generated `.github` migrator is used.
- [ ] The coordinator reviews the complete plan and applies its literal digest with `--plan-digest <reviewed-digest> --confirm migrate-dude-layout --allow-dirty`.
- [ ] Cutover moves the brief to `.dude/ideas/brainstorm-ideas-intake.md`, changes exactly one real `## User Draft` to `## Idea`, rewrites the exact first-line task audit breadcrumb, preserves frontmatter and all prior Coordinator Log entries, and appends only the fixed idempotent migration event.
- [ ] After successful migration verification and before build-dev, `.dude/memory/decisions.md` and `.dude/memory/context.md` supersede or consolidate stale active brief-first, onboarding, and empty/missing-directory statements, record the durable `brainstorm`, `.dude/ideas/`, `## Idea`, and deprecated-`draft` contract, and preserve unrelated entries plus memory history.
- [ ] The same coordinator step changes only ledger-specific working conventions in `.github/skills/project/SKILL.md`; the memory files and project skill are treated as project-owned dogfood state, not generated core or release source.
- [ ] Immediately after cutover, `node scripts/build-dev.mjs` runs, the newly generated `.github/skills/dude-lint/lint.mjs` reports a clean canonical workspace, and a new source migration plan reports `noop`.
- [ ] Build-dev preserves the reconciled memory and project skill exactly; generated lint and the final static audit fail if any active contradictory dogfood ledger guidance remains.
- [ ] No live `node scripts/build-dev.mjs` and no Beads installed-layout suite runs before the cutover; the Beads suite runs only against regenerated core.

## Build, Release, And Documentation

- [ ] Focused source/docs consistency tests cover canonical path, heading, primary verb, deprecated alias, and the intentional legacy/generic allowlist.
- [ ] The first live `node scripts/build-dev.mjs` occurs inside the coordinator-owned cutover; a later parity rerun remains idempotent, preserves project state and installed packs, and changes only intended generated core.
- [ ] Generated coordinator, spec-lead, instructions, engine, lint, migration, and workflow skills match authoritative source behavior.
- [ ] Release tests find updated brainstorm/ideas behavior, no `*.test.mjs`, no project `.dude/ideas`, `.dude/brief`, specs, memory, or execution state, and only the existing generic project-skill stub rather than this repository's project-local skill content.
- [ ] README and command, PRD, reference, setup, upgrade, walkthrough, and workflow docs agree on `brainstorm -> idea -> define -> spec -> work`.
- [ ] A scoped terminology audit classifies every remaining `brief`, `draft`, old heading, and old path occurrence as legacy, deprecated, historical, or unrelated generic usage.

## Final Gates

- [ ] Focused path, digest/drift/transform migration, lint/audit identity, inherited mutation-consumer, brainstorm, draft alias, lightweight, Beads, consistency, build-dev, and build-release suites pass.
- [ ] The complete repository test suite passes with `dist/` excluded from test discovery.
- [ ] A final new-source migration plan remains `noop`.
- [ ] Workspace lint reports zero warnings and zero failures after generated output is refreshed.
- [ ] The final terminology/consistency audit scans `.dude/memory/*.md` and `.github/skills/project/SKILL.md`, allowlists intentional legacy references in migration specifications and fixtures, permits old memory wording only when explicitly superseded and non-active, and fails every active contradictory dogfood statement.
- [ ] Compose verification, fresh release lint, `git diff --check`, and generated-output status inspection pass.

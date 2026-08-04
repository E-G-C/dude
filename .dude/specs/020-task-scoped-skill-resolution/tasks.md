<!-- audit log: .dude/ideas/task-scoped-skill-resolution.md#coordinator-log -->

<!-- canonical task units — edit task descriptions here, but let @dude mutate state glyphs -->

# Tasks: Task-Scoped Skill Resolution

Three all-open canonical units implement the contract at `.dude/specs/020-task-scoped-skill-resolution/spec.md`, owned exactly by `.dude/ideas/task-scoped-skill-resolution.md`.

The change is deliberately small: two prompt edits, one deterministic report, and one acceptance pass. If any task starts growing a registry, tag set, obligation vocabulary, applicability score, activation tier, or stored resolution state, stop with `plan-gap` instead of building it.

No task carries `[P]`. T001 and T002 both touch `scripts/current-format-contract.test.mjs`, and T003 validates the integrated result, so their write and proof surfaces are intentionally sequential. Durable suffixes are fixed lowercase hexadecimal encodings of `bind`, `chek`, and `acpt`.

Core source lives under `src/`; `.github/` core is generated only by `node scripts/build-dev.mjs` and is never hand-edited. Writing-pack source is edited only under `library/packs/writing/`, and its installed projection is refreshed through the compose lifecycle so the profile inventory and artifact hashes stay current.

Execution may read but must not write any `.dude/specs/020-task-scoped-skill-resolution/**` artifact. `README.md`, `docs/setup.md`, `docs/commands.md`, `docs/workflow.md`, and `docs/walkthrough.md` are read-only Feature 017 evidence; repairing them is out of scope. No task may mutate another feature's package or execution state. A required normative change stops as `contract-mismatch: redefine-required`.

## Phase 1: Dispatch And Review Binding

**Goal**: Make applicable installed guidance explicit where the task is dispatched and where it is accepted, without touching agent routing.

- [x] T001@62696e64 [Shared] Add one short `## Applicable Skills` section to `src/skills/dude-generic-routing/SKILL.md` after the routing algorithm: once the agent is resolved, select installed `.github/skills/*/SKILL.md` entries whose frontmatter descriptions match the task's stated outcome and target artifacts, name them in the dispatch by installed identity, carry the same names into acceptance for that task, never change or manufacture an agent, never activate an opt-in, destructive, or authority-bearing procedure from a description match alone, and emit nothing when no skill matches. Extend that skill's frontmatter `description` with one clause so it loads for this purpose. Add one sentence to `src/skills/dude-reviewer-protocol/SKILL.md` requiring the verdict to cover the dispatch-named skills and to state an explicit prose-quality judgment when the artifacts under review are human-facing prose, routed through the existing rejection procedure. Leave `src/agents/dude-reviewer.agent.md` untouched unless the projection shows the reviewer would have no pointer. Pin both prompt changes and the no-match neutrality in `scripts/current-format-contract.test.mjs`, run `node scripts/build-dev.mjs`, and verify with `node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs` plus a read-only check that `.github/skills/dude-generic-routing/SKILL.md` and `.github/skills/dude-reviewer-protocol/SKILL.md` are the only generated core changes.

## Phase 2: Deterministic Repetition Report

**Goal**: Detect the one templating symptom that content-presence tests cannot observe, and report it for reviewer judgment.

- [x] T002@6368656b [US3] Add `library/packs/writing/skills/dude-pack-writing-avoid-ai-tropes/repetition.mjs`: accept an explicit file list, strip fenced code blocks and inline code spans, normalize whitespace and case, slide a fixed word window over the remaining prose, report each maximal contiguous phrase appearing verbatim in at least the file threshold once with every containing file, collapse overlapping windows into the longest shared phrase, exit non-zero on findings and zero when clean, and support `--min-words` (default 8) and `--min-files` (default 3) with no configuration file, allowance list, or stored state. Add `repetition.test.mjs` in the same directory building fixtures in a temporary directory, covering a clause in five files, a phrase in six, a clean control, code-fence and inline-code exclusion, overlapping-window collapse, threshold overrides, and single-file and empty inputs; the tests must not read the live `docs/` files. Document the command in a short section of that skill's `SKILL.md` and add one line to `library/packs/writing/pack.md`, leaving the `provides` map unchanged. Refresh the installed projection with `@dude remove pack writing` then `@dude add pack writing`, and verify with `node --test library/packs/writing/skills/dude-pack-writing-avoid-ai-tropes/repetition.test.mjs scripts/current-format-contract.test.mjs` plus `node .github/skills/dude-compose/compose.mjs verify`.
    deps: T001@62696e64

## Phase 3: Acceptance

**Goal**: Prove the integrated result against the specification's success criteria and confirm the rejected machinery is absent.

- [x] T003@61637074 [Shared] Run acceptance over the unchanged integrated revision: rehearse one documentation-prose dispatch showing both prose-quality skills named and one acceptance record carrying a prose judgment with a rejection possible on prose grounds alone; rehearse a no-match task showing unchanged dispatch and review output with no added step; confirm the agent roster and routing outcomes are unchanged and that no opt-in, destructive, or authority-bearing procedure activates from a description match alone; run the repetition report manually against `README.md`, `docs/setup.md`, `docs/commands.md`, `docs/workflow.md`, `docs/walkthrough.md`, and `docs/reference.md` and record the findings as evidence without editing those files; inspect the complete diff for zero new commands, lanes, workflows, agents, state surfaces, registries, tag sets, metadata schemas, scoring models, obligation vocabularies, and persisted resolution state; run the full discovered suite with `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`, `node .github/skills/dude-lint/lint.mjs .` at zero warnings and zero failures, `node .github/skills/dude-compose/compose.mjs verify`, a pristine-directory release build linted at zero and zero, `git status --porcelain -- .github` showing only intended files, and `git diff --check` clean; then route one fresh unchanged evidence set independently for review.
    deps: T002@6368656b

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-006 / SC-001, SC-004, SC-005 | Dispatch-time applicability from existing descriptions, activation carve-out, no-match neutrality | T001@62696e64, T003@61637074 |
| FR-003, FR-007 / SC-001, SC-002 | Review verdict obligation and concrete prose binding | T001@62696e64, T003@61637074 |
| FR-008 through FR-010 / SC-003, SC-007 | Deterministic repetition report, reporting-only role, preserved content tests | T002@6368656b, T003@61637074 |
| FR-011 / SC-006 | Rejected machinery absent from the change | T001@62696e64, T002@6368656b, T003@61637074 |
| FR-012 / SC-008 | Cross-feature non-mutation, full validation, independent acceptance | T003@61637074 |

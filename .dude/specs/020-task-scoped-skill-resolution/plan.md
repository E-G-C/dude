# Implementation Plan: Task-Scoped Skill Resolution

## Summary

Three small changes, no new subsystem.

First, `dude-generic-routing` already discovers the roster and composes the dispatch line. Give it one short section that also names the installed skills whose descriptions match the task's outcome and target artifacts, with an explicit carve-out so opt-in, destructive, and authority-bearing procedures are never activated by a loose match. Applicability is computed there and nowhere else, and it is not stored.

Second, `dude-reviewer-protocol` already defines the verdict. Give it one sentence requiring the verdict to cover the skills named in dispatch, and to state a prose-quality judgment when the artifacts under review are human-facing prose.

Third, add one deterministic repetition report to the installed writing pack. It takes a document set, ignores fenced code and inline code, and lists each contiguous phrase repeated verbatim across three or more files. It reports; the reviewer decides.

The canonical feature identity is `.dude/specs/020-task-scoped-skill-resolution/spec.md`, owned exactly by `.dude/ideas/task-scoped-skill-resolution.md`.

This feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`; Markdown prompt and skill contracts

**Primary Dependencies**: Node built-ins only (`node:fs`, `node:path`, `node:test`). No new runtime module is imported by core.

**Storage**: None. Applicability is computed at dispatch and discarded. No file, cache, snapshot, or project state surface is added or read.

**Testing**: `node:test` unit matrix for the repetition report over temporary fixture directories; static prompt pins in `scripts/current-format-contract.test.mjs`; existing build-dev projection tests; `dude-lint`; `dude-compose verify`; pristine release validation; one manual acceptance run of the report against the live Feature 017 document set, recorded as evidence only.

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces

**Project Type**: Reusable coordination bundle plus an installed optional pack

**Performance Goals**: The report is linear in total prose word count over a bounded, caller-supplied file list, runs in well under a second on this repository's documentation set, and makes no network call. Dispatch-time applicability adds no file scan beyond the skill discovery that routing already performs.

**Constraints**: `src/` is authoritative and generated `.github/` core comes only from `node scripts/build-dev.mjs`. Pack source is edited only under `library/packs/writing/` and its installed projection is refreshed through `dude-compose`, never hand-edited. No new dependency, agent, command, lane, or state surface. The Feature 017 documents are read-only evidence for this feature.

## Spec Quality Validation

- The specification is technology-neutral and carries three independently testable stories: guidance reaching the performer, guidance reaching acceptance, and deterministic detection of the measurable symptom.
- Acceptance scenarios cover the agentless skill, the no-match case, the opt-in and authority-bearing carve-out, late installation, prose rejection routing, code-fence exclusion, deliberate contract wording, and degenerate document sets.
- FR-001 through FR-012 define dispatch-time determination from existing descriptions, explicit naming, review obligation and rejection routing, routing and roster non-interference, the activation carve-out, no-match neutrality, the concrete prose binding, the deterministic report and its reporting-only role, preservation of existing content tests, the rejected-machinery list, and cross-feature non-mutation.
- SC-001 through SC-008 are measurable without naming an implementation: dispatch and acceptance coverage, the five-file and six-file detection targets against a clean control, unchanged no-match behavior, unchanged routing, an inspectable zero-machinery result, code-span exclusion, and independent acceptance.
- Edge cases, key entities, assumptions, and out-of-scope items are complete. There are no unresolved clarification markers and no implementation detail in the specification.

The specification passed its definition-time document gate before this plan was written. That is a document gate, not a lint or execution-readiness claim; coordinator lint remains pending.

## Guardrail And Smallest-Design Check

The binding guardrail is: choose the smallest design that satisfies proven requirements, and reject speculative abstractions, state, schemas, or safeguards without a concrete failure mode or acceptance test. Each surviving piece is justified against a concrete failure below, and everything else was cut.

| Kept | Concrete failure it prevents | Acceptance test |
|---|---|---|
| Applicability section in `dude-generic-routing` | Installed guidance that matches the task is never named, so the specialist works without it. This is exactly what happened with two agentless writing skills. | SC-001, SC-004, SC-005 |
| Verdict sentence in `dude-reviewer-protocol` | Ignored guidance survives review because no one is obliged to check it. Feature 017 prose passed review. | SC-002 |
| Deterministic repetition report | Content-presence tests are green on templated prose. Nothing in the repository can currently observe a clause repeated in five files. | SC-003, SC-007 |
| Static prompt pins | The two prompt edits are prose and silently reversible by an unrelated rewrite. | Contract test in the full suite |

Rejected as speculative, with the reason:

- **Obligation or capability vocabulary and a runtime mapper.** Every installed skill already carries a description written to be matched. A second naming layer would need its own authoring rules, drift handling, and tests, and no observed failure requires it.
- **Skill registry, tags, or metadata schema.** Discovery already works by reading installed skill frontmatter. A registry would add an artifact that can go stale against the installation it describes.
- **Applicability scoring or activation tiers.** The requirement is that matching skills are named. Ranking them solves no observed failure and creates a tunable with no ground truth.
- **Persistent resolution state or a definition-time record of required skills.** A stored set would be wrong the moment a pack is installed or removed, and would reintroduce the staleness the current description-driven match avoids.
- **A new agent for the writing skills, or a writing-pack agent binding line.** The roster is closed and FR-004 forbids manufacturing an agent. The generic applicability section reaches an agentless skill without one, which is the cheaper fix.
- **An allowance file or per-phrase suppression list for the report.** Legitimate repetition is resolved by the reviewer's recorded judgment. A suppression file would become a maintained artifact with its own review burden.
- **Wiring the report into the default validation gate.** That would make an optional style concern an unconditional blocker on unrelated work and would break on legitimate contract wording, which FR-009 forbids.
- **Extending scope to prompts, PR and commit text, release content, UI copy, or design, branding, accessibility, and security surfaces.** No concrete failure exists for any of them. Each is a deferred non-goal in the specification.
- **A `docs/` narrative section.** The behavior is internal coordination, not a user command. One sentence in the reference is the whole documentation surface, and even that is optional if the reference already covers dispatch composition.

No new durable project guardrail is proposed. The existing smallest-design, deterministic-script, concise-prompt, and pack-lifecycle guardrails already cover this work.

## What Is Deliberately Not Diagnosed

The idea lists candidate causes for the Feature 017 miss: an agentless pack, documentation work routed to a code specialist, generated task text omitting the skills, intake-time rather than task-time applicability, and a specialist seeing only what the coordinator supplied. None is established, so none is treated as the fix target.

The design instead makes the miss non-silent regardless of which cause held. If the dispatch omitted the skills, the applicability section names them. If the specialist had them and ignored them, the reviewer must now state a judgment against them. If both failed, the repetition report surfaces the measurable symptom before a completion claim.

The correction is falsified if a documentation-prose task can still be dispatched with the prose-quality skills installed and unnamed; if a verdict on such a task can omit a prose judgment; if the report misses a phrase repeated verbatim across the threshold number of files or fires on code-fenced text; if any of the rejected machinery above appears in the change; if routing outcomes or the roster move; or if a task with no matching skill acquires extra dispatch ceremony.

## Architecture

### 1. Dispatch-time applicability in `dude-generic-routing`

Add one short `## Applicable Skills` section to `src/skills/dude-generic-routing/SKILL.md`, placed after the routing algorithm so agent selection is visibly settled first. It states:

1. after the agent is resolved, read the installed `.github/skills/*/SKILL.md` frontmatter descriptions and select those matching the task's stated outcome and target artifacts;
2. name the selected skills in the dispatch by their installed identity so the specialist loads them, and carry the same names into acceptance for that task;
3. never let applicability change the agent, create an agent, or imply that a skill needs one;
4. never activate an opt-in discipline, a destructive procedure, or an authority-bearing procedure from a description match alone, since those require explicit user intent or an explicit contract; and
5. emit nothing when no skill matches.

The frontmatter `description` gains one clause so the skill is loaded for this purpose as well as for agent matching. No other core skill changes. `dude-work-intake`, `dude-lightweight-execution`, and `dude-work` already route through this skill and need no edit.

Expected size is roughly ten added lines. If the change grows past a short section, stop as `plan-gap` rather than expanding into a resolution procedure.

### 2. Review obligation in `dude-reviewer-protocol`

Add one sentence to `src/skills/dude-reviewer-protocol/SKILL.md` requiring the verdict to cover the skills named in the dispatch, and requiring an explicit prose-quality judgment when the artifacts under review are human-facing prose. Rejection on that basis uses the existing rejection procedure with no new path.

`src/agents/dude-reviewer.agent.md` already says the reviewer loads `dude-reviewer-protocol` plus any domain review skill that applies. Extend that line with the dispatch-named skills only if the projection shows the reviewer would otherwise have no pointer; prefer leaving it untouched.

### 3. Deterministic repetition report in the writing pack

Add `repetition.mjs` beside the existing `SKILL.md` in `library/packs/writing/skills/dude-pack-writing-avoid-ai-tropes/`, following the precedent of `beads.mjs` inside `dude-pack-beads-workflow`. Behavior:

```bash
node .github/skills/dude-pack-writing-avoid-ai-tropes/repetition.mjs <file> <file> [...]
```

- Accept an explicit list of files. The tool never walks a directory and never guesses a document set.
- Strip fenced code blocks and inline code spans before comparison, then normalize whitespace and case.
- Slide a fixed-length word window over each file's remaining prose and record the distinct files each window appears in.
- Report each maximal phrase present in at least the file threshold, once, with its containing files, and collapse overlapping windows into the longest shared phrase.
- Exit non-zero when findings exist and zero when the set is clean, so a task can use it as a step without it becoming a repository-wide gate.
- Defaults are eight words and three files, overridable by `--min-words` and `--min-files`. No configuration file, allowance list, or state.

Tests live in `repetition.test.mjs` in the same directory and build their fixtures in a temporary directory. They must not read the live `docs/` files, because those may be repaired later under separate work and the Feature 017 bytes are evidence rather than a fixture. The matrix covers the five-file clause, the six-file phrase, a clean control, code-fence and inline-code exclusion, overlapping-window collapse, threshold overrides, and single-file and empty inputs.

Document the command in a short section of that skill's `SKILL.md` and add one line to `library/packs/writing/pack.md` describing what the pack now provides. The `provides` map is unchanged, since no skill is added or removed.

### 4. Static pins and projection

Extend `scripts/current-format-contract.test.mjs` to pin the applicability section in the routing skill, the verdict obligation in the reviewer protocol, the presence and reporting-only role of the repetition tool, and the absence of a registry, tag, score, or persisted-state surface in the change.

Run `node scripts/build-dev.mjs` after the `src/` edits. Expected generated changes:

```text
.github/skills/dude-generic-routing/SKILL.md
.github/skills/dude-reviewer-protocol/SKILL.md
```

Refresh the installed writing-pack projection through the compose lifecycle (`@dude remove pack writing` then `@dude add pack writing`) so the profile inventory and artifact hashes stay current, producing:

```text
.github/skills/dude-pack-writing-avoid-ai-tropes/repetition.mjs
.github/skills/dude-pack-writing-avoid-ai-tropes/repetition.test.mjs
.github/skills/dude-pack-writing-avoid-ai-tropes/SKILL.md
```

Generated and installed files are never hand-edited.

Add at most one sentence to `docs/reference.md` if it already describes dispatch composition. Command grammar, lanes, and workflow documentation do not change.

## Source Layout

### Core source

```text
src/skills/dude-generic-routing/SKILL.md
src/skills/dude-reviewer-protocol/SKILL.md
```

### Pack source

```text
library/packs/writing/skills/dude-pack-writing-avoid-ai-tropes/SKILL.md
library/packs/writing/skills/dude-pack-writing-avoid-ai-tropes/repetition.mjs
library/packs/writing/skills/dude-pack-writing-avoid-ai-tropes/repetition.test.mjs
library/packs/writing/pack.md
```

### Static contract and reference

```text
scripts/current-format-contract.test.mjs
docs/reference.md
```

### Generated or installed only

```text
.github/skills/dude-generic-routing/SKILL.md
.github/skills/dude-reviewer-protocol/SKILL.md
.github/skills/dude-pack-writing-avoid-ai-tropes/
.dude/metadata/profile.md
```

No feature package, `.dude/state`, agent file, command parser, manifest, or execution surface is an implementation write target. `README.md`, `docs/setup.md`, `docs/commands.md`, `docs/workflow.md`, and `docs/walkthrough.md` are read-only evidence.

## Phases

- **Phase 1 - Dispatch and review binding (T001@62696e64)**: add the applicability section and the verdict obligation, pin both statically, and project them into `.github/`.
- **Phase 2 - Deterministic repetition report (T002@6368656b)**: add the tool, its fixture-based tests, and its documentation to the writing pack, then refresh the installed projection through compose.
- **Phase 3 - Acceptance (T003@61637074)**: run the full validation set, prove the rejected machinery is absent, record the manual report run against the Feature 017 document set as evidence, and obtain fresh independent review.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@62696e64 | US1, US2 | FR-001 through FR-007, FR-011 | Static prompt pins, projection parity, no-match neutrality inspection |
| T002@6368656b | US3 | FR-008, FR-009, FR-010, FR-011 | `repetition.test.mjs` fixture matrix, compose verify |
| T003@61637074 | US1, US2, US3 | FR-001 through FR-012 | Full suite, lint, compose verify, release check, zero-machinery inspection, independent review |

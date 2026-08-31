# Implementation Plan: Retrospective Rubber Duck Pack

**Spec:** `.dude/specs/051-retrospective-rubber-duck-pack/spec.md`
**Implementation strategy:** One optional pack agent plus one conditional
coordinator rule; no runtime extension mechanism.

## Settled Design

| Decision | Disposition |
|---|---|
| Pack name | `rubber-duck` |
| Pack source | `library/packs/rubber-duck/` |
| Agent provider | `dude-pack-rubber-duck-retrospective` |
| Agent source | `library/packs/rubber-duck/agents/dude-pack-rubber-duck-retrospective.agent.md` |
| Procedural skill | None. The role is one bounded read-only analysis prompt; a skill would duplicate rather than encapsulate procedure. |
| Model class | `balanced`; the task needs bounded synthesis, not reviewer-grade authority or deep architecture reasoning. |
| Agent tools | Exactly `["read", "search"]` |
| Durable artifact | `.dude/specs/<NNN>-<slug>/retrospective.md` |
| Writer | Coordinator only |
| Activation | Presence of the exact provider in the direct installed-agent roster |
| Universal closeout citation | Omitted; the stable package path is the discovery surface |

No ObjectiveRegistry or supporting objective artifact applies. There is no
objective-runtime caller and no new runtime state.

## Manifest And Pack Shape

Create `library/packs/rubber-duck/pack.md` with this frontmatter shape:

```yaml
---
name: rubber-duck
description: "Read-only, non-authoritative retrospective for successful feature and Ship completion."
use-cases: [retrospective]
provides:
  agents:
    - dude-pack-rubber-duck-retrospective
  skills: []
requires:
  tools: []
hooks: []
---
```

The body documents the one provided agent, its eligible completion timing,
advisory boundary, stable artifact path, and existing install/remove commands.
`hooks: []` is declarative inert metadata only. No source reads it and no task
adds an interpreter.

Create
`library/packs/rubber-duck/agents/dude-pack-rubber-duck-retrospective.agent.md`
with:

- frontmatter name `Rubber Duck Retrospective`;
- `tools: ["read", "search"]`, `user-invocable: false`, and
  `model-class: balanced`;
- the canonical coordinator-only artifact boundary paragraph;
- a read-only scope covering the selected idea/spec/plan/tasks, relevant changed
  files, and supplied verification/review evidence;
- a concise return contract for observed strengths, friction, improvement ideas,
  and evidence paths;
- explicit language that findings are not verdicts, accepted learnings, tasks,
  or authority to revise, rerun, persist, or close;
- no scripts, mutable tools, lifecycle logic, or skill load.

The coordinator supplies the exact feature identity, completion mode, package
path, changed scope, and available review/verification evidence. The agent
returns observations only. It does not choose the artifact path or format.

## Core Coordinator Integration

Edit only the authoritative core source `src/agents/dude.agent.md`.

Add one bounded `## Optional Rubber Duck Retrospective` contract near `## Close`
and `## Completion Closeout`:

1. At a pending successful feature close, after the final required Reviewer
   approval, inspect the already-discovered direct agent roster for the exact
   provider stem `dude-pack-rubber-duck-retrospective`.
2. If absent, do nothing and continue the unchanged close path.
3. If present, dispatch it once with the bounded evidence described above.
   Explicit Ship uses the same step and labels it `Ship completion`; it is not a
   second feature trigger.
4. The dispatch is the last agent dispatch. Findings, no findings, silence, and
   failure cannot trigger review, revision, rerun, a task, or a stop.
5. The coordinator creates or append-preserves the exact `retrospective.md`
   contract from the spec. If dispatch is unavailable, append one unavailable
   outcome when writable. If persistence itself fails, report the observed
   failure outside `Completion Closeout:` and continue without retry.
6. Explicitly exclude ordinary task-only closes, releases, and every
   unsuccessful ending.

Add one sentence to the existing `## Completion Closeout` independence block:
the universal block neither cites `retrospective.md` nor adds a retrospective
category. Do not alter its successful-close triggers, four category anchors,
evidence rules, or same-response rendering.

This is the smallest honest activation mechanism. Compose already installs pack
agents as direct `.github/agents/*.agent.md` roster entries, and the coordinator
already discovers that roster. Core contains only a conditional check for a
known optional provider; it does not import, require, emulate, or configure the
pack. No change is needed in `src/skills/dude-compose/`, Work skills, close
skills, model configuration, profile metadata, or an engine.

## Artifact Write Behavior

For the first eligible installed-pack completion, the coordinator creates:

```markdown
# Retrospective: <feature title>

## <UTC ISO-8601 timestamp> — <Feature|Ship> completion
- **Target:** <exact feature identity>
- **Dispatch:** completed | unavailable

### Observations
<concise result>
```

For later eligible completions, preserve the existing file bytes and append one
blank line plus one new dated entry. Do not rewrite, sort, summarize, or promote
older entries. The path is not added to task state, package ownership metadata,
the universal closeout block, memory, or a generated board.

## Source And Generated Paths

### Authoritative changes

- `library/packs/rubber-duck/pack.md`
- `library/packs/rubber-duck/agents/dude-pack-rubber-duck-retrospective.agent.md`
- `src/agents/dude.agent.md`
- `scripts/current-format-contract.test.mjs`
- `README.md`
- `library/packs/README.md`
- `docs/workflow.md`

`docs/commands.md` does not need a new command or example: existing Compose
commands install, remove, and refresh the pack, and Ship syntax is unchanged.

### Generated or temporary expectations

- `node scripts/build-dev.mjs` projects the core source change to the committed
  `.github/agents/dude.agent.md`.
- The optional pack is not part of the repository's installed dogfood profile,
  so implementation MUST NOT commit
  `.github/agents/dude-pack-rubber-duck-retrospective.agent.md` or alter
  `.dude/metadata/profile.md`.
- Compose installation or `compose verify` temporarily projects the pack agent
  to `.github/agents/dude-pack-rubber-duck-retrospective.agent.md`; removal must
  remove it.
- No `.github/skills/` projection is created because the pack has no skill.
- Existing manifest discovery adds `rubber-duck` to the catalog without Compose
  source changes.

## Documentation

- In `library/packs/README.md`, add `rubber-duck` to the complete pack catalog and
  describe its one agent, zero dependencies, inert hooks metadata, timing,
  exclusions, and artifact path.
- In `README.md`, update the catalog count from 17 to 18, add the pack to the
  summary table, and add a concise optional-retrospective note near completion
  closeout guidance.
- In `docs/workflow.md`, document the post-final-review/pre-close timing,
  installed-roster condition, excluded endings, non-blocking behavior, and
  coordinator-owned artifact. State that `Completion Closeout:` never needs or
  links the artifact.

Do not add a new command, configuration option, hook guide, event model, or
standalone retrospective document.

## Verification Design

Extend `scripts/current-format-contract.test.mjs` with a Feature 051
section-scoped contract suite. It should read authoritative source, not require
the pack to be installed.

The focused checks cover:

- manifest provider, empty skill list, empty required tools, and exact
  `hooks: []`;
- agent `read`/`search` tools, `balanced` model class, non-user-invocable status,
  coordinator-only boundary, advisory output, and absence of mutation authority;
- one roster-presence condition in the coordinator;
- post-final-review and pre-close ordering, exact-once/final-dispatch semantics,
  and one-trigger treatment of Ship completion;
- ordinary task, release, failed, blocked, cancelled, and abandoned exclusions;
- no abort, revision, approval, extra review, rerun, task, or state effects;
- coordinator-owned stable path, UTC-dated append-only entries, and dispatch or
  persistence failure behavior;
- pack-absence independence and no universal-closeout citation/category;
- absence of any newly interpreted hook, event, callback, listener,
  subscription, scheduler, registry, or generic extension contract.

Use named anchors within the new coordinator and agent sections, normalize soft
wraps, and add labeled in-memory deletion falsifiers for every material trigger,
exclusion, authority boundary, and persistence clause. Preserve and rerun the
Feature 050 closeout tests to prove its fixed categories and independence
contract remain intact.

Implementation validation then runs:

1. the focused Feature 051 current-format test pattern;
2. all `scripts/current-format-contract.test.mjs` tests;
3. pack manifest and Compose tests;
4. `node .github/skills/dude-compose/compose.mjs verify` for temporary
   install/lint/remove validation of every pack;
5. `node scripts/build-dev.mjs`;
6. the named non-mutating source/generated parity test;
7. workspace Dude lint;
8. the repository's full test suite and final diff consistency check.

The implementation owner records actual commands and results during Work. This
definition does not claim that any validation has run.

## Guardrail Checks

- **YAGNI:** one agent and one conditional prose contract; no skill, script,
  registry, state machine, or extension mechanism.
- **Source authority:** edit pack sources under `library/packs/` and core under
  `src/`; generated `.github/` changes come only from their owning build/install
  path.
- **Optional independence:** an absent provider makes the entire step disappear;
  core close and Feature 050 reporting remain sufficient.
- **Read-only delegation:** the agent has no mutable tool and no coordinator
  authority; only the coordinator writes the retrospective.
- **Prompt economy:** pass the selected package and bounded evidence rather than
  asking the agent to inspect unrelated history.
- **No hook activation:** retain `hooks: []` without adding a consumer.

No new project-wide guardrail candidate is needed; existing project and bundle
guardrails fully cover the design.

## Requirement Traceability

| Requirements | Implementation | Tasks | Verification |
|---|---|---|---|
| FR-001, FR-014 | `pack.md`; existing Compose lifecycle | T001, T005 | Manifest checks and Compose verify |
| FR-002, FR-007 | Read-only agent frontmatter and boundaries | T001, T003 | Agent section/frontmatter checks |
| FR-003–FR-006 | Coordinator optional-retrospective section | T002, T003 | Trigger, ordering, exact-once, and exclusion falsifiers |
| FR-008–FR-010 | Coordinator artifact contract | T002, T003 | Stable-path, writer, append, date, and failure checks |
| FR-011–FR-013 | Roster absence behavior and closeout sentence | T002, T003 | Independence, no-citation, and prohibited-mechanism checks |
| SC-001–SC-007 | Tests, Compose verification, projection, and docs | T003–T005 | Focused/full tests, lint, parity, docs, and diff review |

## Phases

### Phase 1 — Optional pack and coordinator contract

Author the pack manifest and read-only agent in parallel with the conditional
coordinator source rule. Keep their shared provider stem exact.

### Phase 2 — Contract verification and user documentation

Pin the complete behavior with deletion-falsifiable checks while documenting the
catalog entry, lifecycle timing, stable artifact, and optional boundary.

### Phase 3 — Projection and final validation

Build only the core projection, verify the uninstalled pack through Compose,
then run focused, parity, lint, full-suite, and diff checks before independent
review.

## Risks

- The integration is a natural-language coordinator contract, so semantic tests
  can pin required clauses but cannot prove every model execution. A runtime
  engine would add more risk and no current caller justifies it.
- The exact provider stem is a deliberate small coupling point. A future rename
  must update the manifest, agent filename, coordinator condition, tests, and
  docs together.
- A repository write failure can prevent the durable entry. The safer behavior
  is honest reporting and successful close, not retry or optional-pack control
  over core workflow.
- The pack is intentionally absent from the dogfood profile. Compose verify is
  therefore required to exercise its generated projection and cleanup.

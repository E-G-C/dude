# Implementation Plan: Ship Command

**Idea owner**: `.dude/ideas/ship-command.md`

## Summary

Add Ship as a thin lifecycle resolver and fixed Work preset in the existing coordinator prompt authority. The detailed Ship resolution contract belongs in `dude-work-intake`; the coordinator exposes the verb, invokes the existing brainstorm and definition routes only when required, and then delegates to Work's existing semantics. No Ship-specific skill, parser, runtime, state machine, lane, or persisted state is warranted.

The current Work authority already owns the accepted fixed policy, one-time lane detection, tracked precedence, recovery incompatibilities, stops, verification, review, close, reporting, and learning governance. Ship passes the normalized policy internally rather than expanding a literal command string or reproducing those rules.

## Technical Context

**Language/Version**: Markdown agent and skill authority plus Node.js >= 20 dependency-free ESM static-contract tests
**Primary Dependencies**: Existing Dude coordinator, `dude-work-intake`, `dude-feature-definition`, `dude-work`, build-dev projection, `node:test`, and current static-contract helpers; no external package
**Storage**: Existing idea ledgers, definition packages, Lightweight task state, and optional Beads state only; no new persistent state, default, profile, report, or compatibility record
**Testing**: Focused `node:test` static contracts, build-dev source/generated parity tests, full discovered test suite, workspace lint, pack-source verification, pristine release build and lint, and diff/whitespace inspection
**Target Platform**: Cross-platform GitHub Copilot use in VS Code or CLI, with Node.js maintenance checks on macOS, Linux, and Windows
**Project Type**: Markdown multi-agent command contract, generated core projection, and user documentation
**Performance Goals**: Add no daemon or execution loop; perform one bounded lifecycle-resolution pass before delegating to the existing sequential Work loop, with no extra per-task state or scheduling overhead
**Constraints**: Optional target only; reject every flag before mutation; preserve exact lifecycle, ownership, tracked precedence, checkpoints, Work policy, stops, and authorities; `src/` is authoritative and `.github/` is generated; choose the smallest design and avoid speculative abstractions

## Spec Quality Validation

- Four independently testable stories cover lifecycle resolution, fail-closed selection, unchanged Work semantics, and simple-versus-advanced positioning.
- FR-001 through FR-025 capture the complete settled behavior, including the exact lifecycle matrix, pre-mutation ambiguity and tracked precedence, fixed normalized Work policy, no flags, preserved checkpoints, and explicit non-goals.
- SC-001 through SC-008 are measurable through lifecycle and invalid-input matrices, exact policy assertions, tracked fixtures, inherited-stop regressions, static artifact inventories, and documentation contracts.
- Edge cases cover malformed input, ambiguous identity, raw-idea clarification, stale-looking packages, no-ready tracked work, Work hard stops, optional Git isolation, and future release naming.
- The specification contains WHAT and WHY only, no source paths or implementation mechanism, and no unresolved clarification marker.

The specification passed its document quality gate before this plan was derived. Coordinator lint remains pending.

## Guardrail Check

- Deterministic static contracts will pin command shape, lifecycle order, policy values, generated parity, and documentation coverage.
- The design extends two existing prompt-authority surfaces and reuses current lifecycle and Work behavior instead of adding a module, parser, state machine, or skill.
- Model-facing instructions will keep one detailed Ship resolver owner and concise coordinator delegation, avoiding duplicate Work policy prose.
- `spec.md` owns observable behavior; this plan owns files, projection order, and verification commands.
- `src/` remains authoritative and `.github/` remains generated through `node scripts/build-dev.mjs`.

No new project guardrail is needed. Existing guardrails already require deterministic checks and the smallest design that satisfies proven requirements.

## Verified Existing Surface

### Coordinator and intake authority

`src/agents/dude.agent.md` currently owns lifecycle routing, canonical ownership, lane authority, Work delegation, mode-to-skill mapping, and coordinator response shape. It has no Ship verb. A concise `## Ship` section and a Ship mode mapping can expose the new entry point without transferring authority or duplicating Work internals.

`src/skills/dude-work-intake/SKILL.md` currently distinguishes direct requests, raw brainstorm input, and explicit definition. It is the nearest existing authority that decides which lifecycle path runs, so it should own Ship's complete optional-target grammar, lifecycle matrix, ambiguity behavior, tracked-conflict preflight, and fixed handoff policy.

The shared rules in `src/instructions/dude.instructions.md` already protect definition authority, canonical ownership, lane state, verification, review, close, current-only behavior, and autonomous learning governance. Ship does not require a new universal rule.

### Existing Work semantics

`src/skills/dude-work/SKILL.md` already owns:

- the normalized controls equivalent to unlimited overall authorization, recovery enabled, unlimited exact-target recovery cycles, and autonomous policy;
- rejection of recovery combined with until-blocked;
- one-time lane detection with imported tracked work taking precedence and no tracked-to-Lightweight fallback;
- canonical ownership, inspection, recovery, unchanged-intent Lightweight repair, tracked repair refusal, verification, review, close, audit, reporting, and learning governance; and
- sequential execution with no automatic import, Git mutation, new lane, board, or state.

Neither `src/skills/dude-work/SKILL.md` nor `src/skills/dude-work/recovery.mjs` needs a semantic change. Ship delegates policy values to Work; it does not invoke a shell expansion or add a second parser.

### Static contracts and projection

`scripts/current-format-contract.test.mjs` already inventories both proposed source files and provides section-aware helpers such as `markdownSection`, `visibleMarkdown`, `assertSectionMatchesAll`, and `missingParagraphRequirements`. It also pins Work grammar, source/generated parity, primary command examples, coordinator authority, and documentation sections. Ship coverage belongs in this existing suite rather than a new test module.

`node scripts/build-dev.mjs` projects the two authoritative source edits to:

- `.github/agents/dude.agent.md`
- `.github/skills/dude-work-intake/SKILL.md`

No generated file is edited by hand. `scripts/build-dev.test.mjs` already owns byte-identical source/generated inventory and parity checks.

### Current user guidance

The primary lifecycle and command surfaces are:

- `README.md`
- `docs/setup.md`
- `docs/commands.md`
- `docs/workflow.md`
- `docs/walkthrough.md`
- `docs/reference.md`

They currently teach explicit brainstorm, define, and Work. These files need concise Ship guidance while preserving the explicit verbs for intent changes and Work for custom controls. `docs/README.md` is only an index and needs no Ship-specific expansion.

No current `@dude ship` command exists in core, packs, tests, or user guidance. The release pack routes release capabilities without claiming a core Ship verb, so no verb collision requires a pack change.

## Implementation Design

### 1. Make Work Intake the detailed Ship resolver owner

Add a `## Ship` section to `src/skills/dude-work-intake/SKILL.md` that:

1. validates one optional target and rejects every flag or extra target before any read-to-write transition;
2. checks imported tracked precedence before mutating an explicit conflicting lifecycle target;
3. resolves unmatched raw input to existing brainstorm, a draft ledger to existing define, and a defined package directly to Work;
4. resolves bare Ship only when one live target is unambiguous;
5. asks one exact-candidate question for selection ambiguity, then restarts resolution from the answer without a default;
6. leaves other resolver and ownership diagnostics as hard refusals;
7. preserves explicit brainstorm for changed intent and explicit define for deliberate refresh; and
8. emits the fixed normalized Work policy with unlimited overall authorization, recovery enabled, unlimited exact-target recovery cycles, autonomous policy, and until-blocked absent.

The section points to the existing brainstorm, definition, and Work owners for all stage behavior. It does not restate their detailed gates or execution machinery.

### 2. Add concise coordinator orchestration

In `src/agents/dude.agent.md`:

- add Ship to the lifecycle/mode routing so the coordinator loads `dude-work-intake`, conditionally uses `dude-feature-definition`, and then uses `dude-work`;
- add a concise `## Ship` procedure that follows the intake-owned resolver, retains coordinator and Spec Lead boundaries, and delegates the normalized policy to Work;
- make tracked conflict, ambiguity, and unsupported input pre-mutation stops visible in the response; and
- retain the existing lane banner and `Action / Updated / Next / Blockers` response conventions once execution begins.

Do not duplicate Work's detailed grammar, recovery transitions, stop taxonomy, or learning governance in the coordinator. Do not modify shared instructions because their current authority rules already govern every composed stage.

### 3. Pin the source behavior in existing static contracts

Extend `scripts/current-format-contract.test.mjs` with focused Ship contracts that prove:

- exactly one optional target and no flags;
- the raw/draft/defined/bare lifecycle matrix and no proactive redefinition;
- one pre-mutation exact-candidate question followed by fresh resolution;
- hard refusal for non-selection diagnostics;
- imported tracked precedence and explicit-target conflict before mutation;
- the exact normalized Work policy and explicit absence of until-blocked;
- preserved clarification, guardrail, review, verification, ownership, close, reporting, Git, and no-new-state boundaries;
- coordinator delegation to existing intake, definition, and Work owners; and
- absence of a `src/skills/dude-ship/` or `.github/skills/dude-ship/` artifact.

Use the existing section-aware helpers and mutation-resistant assertion style. Keep the existing Work grammar line unchanged. The source-focused checks must pass before documentation is changed.

### 4. Project only authoritative source changes

Run `node scripts/build-dev.mjs` after the source edits. The intended generated semantic changes are limited to `.github/agents/dude.agent.md` and `.github/skills/dude-work-intake/SKILL.md`. Inspect the generated diff because the build projects all concurrent source edits in the checkout; do not overwrite or revert unrelated user work.

### 5. Present Ship as the usual path

Update the six primary guidance files with one consistent model:

- Ship accepts an optional target and no flags, resolves only missing lifecycle stages, and advances until done or an existing Work stop.
- Explicit brainstorm remains required for new or changed intent on an existing target, and explicit define remains required for deliberate package refresh.
- Ship preserves clarification and guardrail checkpoints and never chooses an answer.
- Work remains the advanced form for custom controls.
- Tracked work retains precedence; Ship never tracks or imports.
- Ship performs no automatic Git or release action and guarantees no unconditional completion.

Add a dedicated `@dude ship` section and concise-list row to `docs/commands.md`. Update the README quick start and command table, the setup default path, the workflow lifecycle diagram/text, the walkthrough's normal implementation path, and the reference's lifecycle and execution authority. Keep explicit lifecycle examples where they teach intent editing and checkpoints; do not erase the underlying verbs.

Extend the static suite with documentation assertions for command shape, lifecycle wording, Work positioning, tracked precedence, preserved checkpoints, and absence of aliases or release semantics.

## Test Strategy

### Focused source and projection checks

After the first implementation slice, run:

```bash
node scripts/build-dev.mjs
node --test --test-name-pattern='Ship' scripts/current-format-contract.test.mjs
node --test --test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' scripts/build-dev.test.mjs
```

The Ship tests should use in-memory mutations to prove that deleting or moving required lifecycle, pre-mutation, policy, or authority clauses fails the contract. Inspect the `.github/` diff and require only the expected generated counterparts for this feature, while preserving unrelated concurrent changes.

### Documentation checks

After documentation and its static contracts are aligned, run:

```bash
node --test scripts/current-format-contract.test.mjs
git diff --check -- README.md docs scripts/current-format-contract.test.mjs
```

Confirm the first Ship examples are flag-free, Work's exact advanced grammar is unchanged, explicit brainstorm/define controls remain documented, and no guide promises unconditional completion or release publication.

### Full acceptance

Run fresh integrated acceptance:

```bash
node scripts/build-dev.mjs
node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
node scripts/build-release.mjs --out <fresh-temp-dir> --tag v0.0.0
node .github/skills/dude-lint/lint.mjs <fresh-temp-dir>
git diff --check
git status --porcelain --untracked-files=all
```

Inspect source/generated diffs and the pristine release inventory. Confirm the release contains the projected Ship authority and no Ship-specific skill, runtime, state, test artifact, or project definition package. Route the same fresh evidence independently to the installed Tester and Code Reviewer; neither reviewer mutates task state or approves its own work.

## Source And Generated Parity

`src/` is authoritative. `.github/` is the committed development projection. Every source-editing task runs `node scripts/build-dev.mjs` before parity-sensitive checks, and no task hand-edits generated core. Final acceptance reruns the non-mutating byte-parity test after all source changes.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` are needed. No research, data model, API contract, schema contract, quickstart, UX checklist, test checklist, or security checklist is materially useful for this bounded prompt-contract feature.

## Objective Registry

This feature has no progress objective and contains zero active ObjectiveRegistry regions.

## Complexity Tracking

No guardrail deviation is required. The design adds two small prompt-authority sections, static assertions, generated projections, and concise documentation. It adds no skill, parser, runtime, state machine, storage, configuration, migration, alias, lane, scheduler, or compatibility path.

## Phases

- **Phase 1 - Ship authority and projection (T001)**: add the intake-owned resolver and concise coordinator delegation, pin source behavior, and project generated core.
- **Phase 2 - Guidance and documentation contracts (T002)**: make Ship the usual convenience path while retaining explicit lifecycle controls and advanced Work.
- **Phase 3 - Integrated acceptance (T003)**: run full tests, lint, pack verification, source/generated and release parity, diff checks, and independent acceptance.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@73686970 | US1, US2, US3 | FR-001 through FR-020, FR-023, FR-024 | Source section contracts, lifecycle and invalid-input matrices, tracked-precedence checks, exact policy assertions, generated parity |
| T002@646f6373 | US1, US3, US4 | FR-002 through FR-004, FR-011 through FR-025 | Command and lifecycle documentation contracts, preserved explicit-control guidance, advanced Work grammar checks |
| T003@76616c69 | US1 through US4 | FR-001 through FR-025 | Full regression, lint, pack verification, release build, diff inspection, and independent Tester/Code Reviewer evidence |
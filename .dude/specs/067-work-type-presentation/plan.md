# Plan: Work Type Presentation

Spec: `.dude/specs/067-work-type-presentation/spec.md`
Owner: `.dude/ideas/067-work-type-presentation.md`

Admit two optional internal scalars in the existing idea ledger frontmatter, and let the existing brainstorm writer record them when the work is clear. Then add one pure engine module that owns the shared stage rule, the read-only progress report, and the classification words, and wire it into the read-only backlog views that `@dude status` already runs: the overview gains each record's stage, and a new read-only `progress <slug>` form prints one item's report. Canvas changes nothing, and the projection and work-index suites prove it. Add no route, capture field, store, state file, classifier, checkpoint writer, poller, or dependency.

The re-defined spec passed the definition gate before this plan was revised: its sections are complete, every requirement is testable, its criteria are measurable, and it has no unresolved clarification. No user interface changes, so the design workflow and its mock gate do not apply; Canvas presentation of these concepts belongs to `.dude/ideas/089-dude-canvas-redesign.md`. This plan has no ObjectiveRegistry region.

## Technical Context

| Field | Choice |
| --- | --- |
| Language and runtime | Existing JavaScript ES modules on the current Node 20 or later baseline, with CI on Node 20 and 22. |
| Dependencies | None new. The new engine module imports only engine siblings. |
| Storage | Two optional scalars in the existing idea ledger frontmatter. No other store. |
| Platform | Dude core engine, skill scripts, and guidance on Windows, macOS, and Linux. |
| Project type | Dude core bundle: an engine library, one skill script, agent and skill guidance, and docs. |
| Testing | Existing `node --test` suites, one new engine test file, the projection and work-index suites as Canvas regressions, and installed-host chat acceptance for model behavior. No browser suite. |
| Performance | The overview reads no new files, because the stage uses facts the backlog collector already gathers. The `progress` form rereads only the selected item's ledger, specification, and task file. |
| Constraints | No Canvas source, UI asset, mock, hash pin, or browser runner change. No new HTTP route or capture field, no classifier or classification state, and no persisted report, polling, or tracker read. |

## Chosen Structure

### 1. Internal keys and admission

In `src\skills\dude-engine\lib\feature.mjs`, export only these names, each with a caller in this plan:

- `IDEA_CLASSIFICATION_KEYS = ['work_intent', 'work_domain']`, read by both publishers' preservation checks and the lint warning.
- `WORK_INTENTS = ['create', 'fix', 'maintain', 'explore']` and `WORK_DOMAINS = ['code', 'design', 'writing', 'video']`, read by the lint warning for the allowed tokens it names.
- `readWorkClassification(scalars)`, returning `{ workIntent, workDomain }`, each an allowed token or `null`. An absent, empty, or unrecognized value is `null`. Lint reads it in unit 1, and the progress module in section 4 reads it in unit 2.

`CANONICAL_IDEA_KEYS` gains the two keys after `depends-on`. The inventory adds no diagnostic for classification values, so identity parsing, ownership resolution, and every existing diagnostic stay unchanged. The keys deliberately avoid the existing `intent`, `type`, `kind`, and `work_type` names; specifications keep `work_type: design` as the design-workflow marker.

Every strict parser of idea frontmatter must accept the keys:

- `src\skills\dude-lightweight-execution\backlog.mjs`: replace its identical local `IDEA_KEYS` with `CANONICAL_IDEA_KEYS`, so `@dude status` and the backlog-backed work index keep reading classified ledgers.
- `src\skills\dude-feature-definition\publish-first-definition.mjs`: set `OWNER_KEYS` to `CANONICAL_IDEA_KEYS`, and extend the byte-preservation loop from `title`, `slug`, and `depends-on` to both classification keys, with the existing both-absent allowance applied to every optional key.
- `src\skills\dude-feature-definition\atomic-file-batch.mjs`: let `assertDefinitionOwner` admit the two keys, and refuse a staged owner whose classification lines differ from the current owner's. Leave its `depends-on` handling unchanged.
- `publish-first-capture.mjs`, `src\skills\dude-work\recovery.mjs`, and the projection already parse with `CANONICAL_IDEA_KEYS`; they need no code change.

Ordering is a hard constraint. Until these admissions and their generated projections land, a ledger carrying either key makes the whole inventory fail with `FEATURE_FRONTMATTER_MALFORMED`, which would block lint, capture, definition, Canvas, and Work. No ledger, including this one, carries the keys during definition.

### 2. Maintainer check

`src\skills\dude-lint\lint.mjs` parses each ledger's frontmatter in its existing ledger-structure pass and warns once per empty or unrecognized classification value, naming the path, key, and allowed tokens. It skips ledgers the inventory already reports as malformed. A warning keeps one bad scalar visible without failing the lint that both publishers run inside their rollback boundaries. No publisher adds a refusal of its own.

### 3. Who records the values

No code records a classification. The Spec Lead's existing brainstorm staging, which serves chat brainstorm and both Canvas capture actions alike, writes the keys under the guidance in section 5, and the existing publishers apply them. Canvas sends no classification, and nothing in the browser, the Canvas server, or the provider infers one. There is no confidence value, provenance record, suggestion state, or approval queue. Definition, re-definition, Work, and Ship preserve the keys byte for byte through the admissions in section 1.

### 4. Progress module and status wiring

Add `src\skills\dude-engine\lib\work-progress.mjs`. It is pure: it reads no file, clock, environment, or process, imports only `feature.mjs`, `feature-identity.mjs`, and `tasks.mjs`, and never imports Canvas code or reads a tracker or optional pack. It exports only the two functions that `backlog.mjs` calls:

- `workStage(item, { tracked })` applies the stage rule under Contracts to one backlog model item. It uses facts the collector already gathers: lifecycle status and availability, the valid-resolved check, the owner's task availability and counts, own blockers, and the unavailable detail. It returns one of the six stage words or `null`.
- `workProgress({ item, ideaBytes, specBytes, tasksBytes, tracked })` assembles the report under Contracts for one item. It reads the classification with `readWorkClassification` from the ledger frontmatter, the design workflow and status from the specification frontmatter in the default parse mode, and the current phases from the task file. A current phase is the recorded text of the nearest `##` or `###` heading above a task in progress or blocked, outside the generated board and history; a task under no heading adds no phase. One word table keyed by the engine tokens turns a classification into plain words, intent first.

The request part has no input. Status cannot read current Needs you requests, so `requests` is always `unavailable`, with a fixed reason and a `null` source. The module takes no request feed until a caller can supply one.

In `src\skills\dude-lightweight-execution\backlog.mjs`, keep `collectLifecycleItems` and `deriveLifecycleModel` exactly as unit 1 leaves them, because the Canvas work index imports both. Change only the command line and the text output:

- The default form appends ` · <stage>` to each record line, or ` · stage unavailable` when `workStage` returns `null`. The summary, groups, group order, record order, and notes stay the same. With `--tracked`, one line after the summary says that defined work shows stage unavailable because tracked work is authoritative and this view does not read it.
- A new `progress <slug>` form selects exactly one item whose authoritative frontmatter slug equals `<slug>`. It reads that item's ledger and, for a defined owner, its specification and task file, passes the bytes to `workProgress`, and prints the report in the format under Contracts. An unknown, duplicate, or unreadable selector prints `[FAIL] no single work item has slug <slug>` and exits 1, with no fallback to a number, file name, or title. The name `progress` keeps the form distinct from the retired backlog report.
- `--tracked` is valid only with the default and `progress` forms; `kanban` and `flowchart` refuse it as an unknown option. The coordinator passes it when its Status precedence finds tracked execution. It changes only stage and phase output.
- `--help` lists four forms. `kanban` and `flowchart` output stays the same, and every form still writes nothing.

Status guidance and documentation:

- `src\skills\dude-lightweight-execution\SKILL.md`, `### Cross-Idea Backlog`: say that the default form shows each record's stage from the shared rule, that `@dude status` invokes four forms, adding `progress <slug>` for a feature-scoped request, and that `--tracked` applies when the active lane is Tracked Execution. Keep every existing clause, including the groups, the notes, and the statement that these views are derived and never authoritative.
- `src\agents\dude.agent.md`, `## Status`: add one sentence after the existing rule line: for a feature-scoped request, also print that item's progress report with the `progress` form in `dude-lightweight-execution`, passing `--tracked` when precedence (1) applies. Leave the rule line that `scripts\current-format-contract.test.mjs` asserts byte-identical.
- `docs\commands.md`: in `@dude status`, describe the stage beside each record, the six stage meanings, and the one-item report with its unavailable request part; in the engine-script table row and the `backlog.mjs` paragraph, add `progress <slug>` and `--tracked`.
- `scripts\current-format-contract.test.mjs`: change the T005 three-forms sentence to four forms, add the `progress` form, and update the `docs\commands.md` row pattern. Add only these lines and keep the file's two private hunks.

New wording must avoid the retired backlog phrases that the format contract rejects, such as "derived backlog" and "backlog generation".

### 5. Guidance and documentation

- `src\skills\dude-feature-definition\SKILL.md`, Brainstorm: when the Spec Lead stages a first capture or an explicit brainstorm refresh, it may write `work_intent` and `work_domain` from the user's unchanged description and the actual project context when a value is clear, and it omits a key otherwise. It never asks a question only to fill them, writes an empty or unrecognized value, changes the user's text to fit them, or backfills records in bulk. It may add a missing value, but it replaces a recorded one only when the user says it is wrong. Neither change touches `status:` or `spec_path:`, and definition preserves the keys.
- `src\skills\dude-work-intake\SKILL.md`, `## Brainstorm`: add one bullet saying that Dude never asks a question only to classify work and that the delegated Spec Lead may record the internal classification under the definition skill's rule. The capture sections and labels stay as they are; their Canvas wording belongs to 089.
- `docs\reference.md`, Definition Rules: list the optional internal keys and their tokens.
- `docs\commands.md`, `@dude brainstorm`: describe the internal keys and how to change them by telling Dude in chat.

Unit 1 adds these sentences without editing a line that `scripts\current-format-contract.test.mjs` asserts. If that proves impossible, stop and report a plan gap. Section 4 lists unit 2's status guidance and documentation.

## Contracts

Ledger frontmatter, both keys optional, internal, and unquoted when written:

```yaml
work_intent: fix    # create | fix | maintain | explore
work_domain: code   # code | design | writing | video
```

Engine exports this plan adds:

```text
feature.mjs        IDEA_CLASSIFICATION_KEYS, WORK_INTENTS, WORK_DOMAINS, readWorkClassification(scalars) -> { workIntent, workDomain }
work-progress.mjs  workStage(item, { tracked }) -> stage | null
                   workProgress({ item, ideaBytes, specBytes, tasksBytes, tracked }) -> progress    pure; reads no files
```

Shared stage rule, `workStage`, evaluated in order:

| Evidence | Stage |
| --- | --- |
| Lifecycle metadata unavailable, or a resolved-shaped ledger that is not a valid resolved ledger | `null` |
| Valid resolved ledger | Closed |
| Draft | Captured |
| `tracked` is true | `null` |
| The collector reports the owner, specification, or task file unavailable | `null` |
| Any unfinished task is blocked or carries a blocker reason | Blocked |
| At least one task, and all are done | Completed |
| Any task is in progress or done | In progress |
| Otherwise, including zero tasks | Defined |

Progress report, `workProgress`:

```text
progress.subject       { ideaPath, specPath | null, number, slug }
progress.words         string[]    plain classification words, intent first; [] when nothing is recorded or recognized
progress.stage         { value: stage | null, reason: string | null, source: path | null }
progress.phases        { state: current | none | not-exposed | unavailable, reason: string | null, source: path | null, items: string[] }
progress.design        null | { status: exploring | proposed | approved | unrecognized | unavailable, reason: string | null, source: path | null }
progress.checkpoints   [{ kind: design-proposed | design-approved, source: path }]
progress.gates         [{ kind: design-approval, source: path }]    required gates only
progress.requests      { state: 'unavailable', reason: string, source: null }
progress.unknown       [phases | design | gates]    parts that were read and hold nothing; never an unavailable part
```

- `stage.source` is the ledger for Captured and Closed and the task file for the four task-based stages. A `null` stage carries its reason: the tracked reason or the collector's unavailable detail.
- `phases` is `current` with each current phase, or `none`, with the task file as its source. It is `not-exposed` with a `null` source when `tracked` is true. Drafts and resolved ledgers have `none` with a `null` source.
- `design` is `null` for drafts and resolved ledgers, which have no specification, and when a readable specification does not record `work_type: design`. When it does, `design.status` is the recorded `design_status` if that is `exploring`, `proposed`, or `approved`, and `unrecognized` otherwise, with a `null` reason and the specification as the source. The one checkpoint is a recorded `proposed` or `approved` status. The design-approval gate is present while `design` has any status other than `approved` or `unavailable`.
- When the collector reports the item's lifecycle or package unavailable, `stage` is `null` with that reason and `phases` is `unavailable` with the same reason. An unavailable or ambiguous task file affects only those two parts: `design`, `checkpoints`, and `gates` still come from the readable specification, so a specification recording `work_type: design` with `design_status: proposed` still yields that status, the `design-proposed` checkpoint, and the `design-approval` gate.
- When the collector reports the item unavailable and no specification bytes were read, because the lifecycle, the owner, or the specification cannot be read, `design` is `unavailable` with the collector's reason and a `null` source. It is never `null` then, which would claim that the item has no design workflow, and `checkpoints` and `gates` are empty. `unknown` never lists an unavailable part, so the report never presents unreadable evidence as unrecorded.
- Task counts never become a phase, checkpoint, gate, or request.

Classification words, from one table:

| Token | Words |
| --- | --- |
| `fix` | Fix |
| `create` | New |
| `maintain` | Maintenance |
| `explore` | Exploration |
| `code`, `design`, `writing`, `video` | Code, Design, Writing, Video |

Backlog forms; every form writes nothing:

```text
node backlog.mjs [--tracked] [--root <dir>]                        overview, now with each record's stage
node backlog.mjs kanban [--root <dir>]                             unchanged
node backlog.mjs flowchart <idea-slug> [--root <dir>]              unchanged
node backlog.mjs progress <idea-slug> [--tracked] [--root <dir>]   one item's report
```

Illustrative output for one overview line and one report about a classified fixture; tests fix the exact wording:

```text
  901 login-timeout-fix · In progress

901 login-timeout-fix · Fix · Code
Stage: In progress (.dude/specs/901-login-timeout-fix/tasks.md)
Current phase: Phase 2: User Story 1 - Keep the session (.dude/specs/901-login-timeout-fix/tasks.md)
Requests for you: unavailable. This view cannot read current requests.
No design status or required gate is recorded.
```

A Closed report adds that closing does not mean the work was implemented. With `--tracked`, a defined item's report says that its stage is unavailable and its phases are not exposed because tracked work is authoritative and this view does not read it. When `design` is unavailable, the report says that the design status and required gates cannot be read and gives the reason.

## Error And Authority Behavior

| Case | Behavior |
| --- | --- |
| Unclear classification | Nothing is recorded or shown, and no question is asked only to classify. |
| Empty or unrecognized stored value | Read as unrecorded on that record; one lint warning; nothing else is blocked. |
| Structured or duplicate key | Existing inventory error, unchanged. |
| `progress` selector unknown, duplicate, or unreadable | `[FAIL] no single work item has slug <slug>`, exit 1, nothing written, and no fallback to a number, file name, or title. |
| Task file unavailable or ambiguous | The stage is `null` with the collector's reason, and phases are `unavailable` with the same reason. The design status, checkpoint, and gate still come from the readable specification. |
| Lifecycle, owner, or specification unreadable | The stage and phases are unavailable the same way, and `design` is `unavailable` with that reason, never `null`. |
| Tracked work authoritative (`--tracked`) | A defined item's stage is `null` with the tracked reason, and its phases are `not-exposed`; nothing is taken from `tasks.md`. |
| Requests | Always `unavailable` with its reason and a `null` source; never an empty list or None. |
| Authority | No routing, Work, recovery, Ship, or definition gate reads classification values, stages, or reports. Those paths only admit and preserve the keys. A report grants nothing and changes nothing. |

## Guardrail Checks

| Guardrail | Application |
| --- | --- |
| UI mockup approval is mandatory | Does not apply, because this package changes no user interface. Every Canvas change, including today's stage words, belongs to 089, which carries the design gate. 067's mocks approve nothing. |
| Keep it simple | Two optional internal scalars, one reader, one pure module with one stage rule, one report assembler, and one word table, plus one read-only command form and one flag. No capture field, classifier, confidence or provenance record, approval queue, request feed, registry, gate engine, polling, persisted report, Canvas wiring, or 087 infrastructure. Unused exports are omitted. |
| Core stays runtime-independent of optional packs | The module and `backlog.mjs` read no tracker and no pack. Tracked authority enters only through the coordinator's `--tracked` flag. |
| Deterministic scripts | Admission, preservation, word formatting, stage, the report, and the lint warning are code. Model judgment is limited to the brainstorm writer deciding whether a value is clear and the coordinator applying its existing lane precedence. |
| Lifecycle numbers mean chronology | Numbers and capture order stay; stage adds no ordering. |
| Beads authority | While tracked work is authoritative, stage is unavailable and phase is not exposed, with no Markdown backfill. |
| Draw on established knowledge | GitHub Issues keeps type separate from status. GitHub check runs pair one common status with tool-specific detail, a split the report follows without adopting that API or its values. Gmail's automatic inbox categories, which people never pick, fit a classification Dude records itself. |
| Canvas continuity | Canvas output stays the same, which the projection and work-index suites prove; 089 carries every Canvas change. |
| UI verification handoff | No UI changes. The installed-host chat observation runs only after the automated checks, for model behavior they cannot establish. |

Existing project and bundle guardrails cover this feature. No guardrail candidate arose, so nothing is adopted, narrowed, rejected, or skipped.

## Change Surface

Paths are planned implementation surfaces, not changes made during definition.

| Surface | Change |
| --- | --- |
| `src\skills\dude-engine\lib\feature.mjs` | Unit 1: keys, vocabularies, and `readWorkClassification`. |
| `src\skills\dude-lightweight-execution\backlog.mjs` | Unit 1: reuse `CANONICAL_IDEA_KEYS`. Unit 2: the stage in the overview, the `progress` form, and `--tracked`; the collector and model stay unchanged. |
| `src\skills\dude-feature-definition\publish-first-definition.mjs`, `atomic-file-batch.mjs` | Unit 1: admission and preservation. |
| `src\skills\dude-lint\lint.mjs` | Unit 1: empty or unrecognized value warning. |
| `src\skills\dude-engine\lib\work-progress.mjs` (new) | Unit 2: stage rule, report, and word table. |
| `src\skills\dude-feature-definition\SKILL.md`, `src\skills\dude-work-intake\SKILL.md`, `docs\reference.md` | Unit 1: classification guidance and the key reference. |
| `src\skills\dude-lightweight-execution\SKILL.md`, `src\agents\dude.agent.md` | Unit 2: status guidance. |
| `docs\commands.md` | Unit 1: `@dude brainstorm`. Unit 2: `@dude status`, the `backlog.mjs` engine-script row, and the `backlog.mjs` paragraph. |
| `scripts\current-format-contract.test.mjs` | Unit 2: the four-forms sentence and the engine-script row pattern, keeping the file's private hunks. |
| Tests | Unit 1: `src\skills\dude-engine\lib\feature.test.mjs`, `chronological-identity.test.mjs`, `publish-first-definition.test.mjs`, `atomic-file-batch.test.mjs`, `backlog.test.mjs`, `lint.test.mjs`, `recovery.test.mjs` (classified owner), and classified-ledger regressions in `src\extensions\dude\projection.test.mjs` and `work-index.test.mjs`. Unit 2: the new `src\skills\dude-engine\lib\work-progress.test.mjs` and `backlog.test.mjs`. |
| Generated `.github` mirrors | The projected counterpart of every changed engine, skill, and agent file. Tests are source-only. |

`publish-first-capture.mjs`, `recovery.mjs`, `board.mjs`, and every file under `src\extensions\` other than the two unit 1 test files need no change. No UI asset is rebuilt, and no hash pin changes.

### Build, generated mirror, and private local bytes

`node scripts\build-dev.mjs` projects all of core. This plan rebuilds no UI bundle and changes no hash pin.

When this plan was first written on 2026-10-20, this working tree held private local bytes: the modified `.dude\metadata\profile.md`; four `.github` agent model overrides; local edits to `dude.instructions.md` and `agent-models.json` in both `src` and `.github`; `scripts\current-format-contract.test.mjs`, now known to carry two private hunks; the refreshed installed writing skill; and the untracked technical-docs and Copilot SDK projections, animation pack, and 075 `working.json`. Unit 2 must edit `scripts\current-format-contract.test.mjs`, and a generated agent file may carry a private model override. Running `build-dev` here would regenerate core from privately modified sources. Instead, for each unit:

1. Re-inventory the private paths and record the SHA-256 of each before the first implementation write.
2. Build and run full acceptance in a clean export containing HEAD plus only the 067 source changes so far, with every private path at its HEAD bytes.
3. Integrate into this working tree only the unit's source files and the exact generated outputs selected through `listCoreOutputs` and `writeCoreOutput` from `scripts\build-release.mjs`. Refuse missing or duplicate matches, and never regenerate core in bulk here.
4. Where a writer path also holds private bytes, as `scripts\current-format-contract.test.mjs` does and `.github\agents\dude.agent.md` might, add only the feature's lines and keep every private hunk.
5. Re-hash the private paths. Stop on any difference other than the feature's own lines in a shared writer path.

No Git action is part of this plan.

## Verification

These are planned checks for implementation and testing owners. No terminal command, build, test, or lint ran during this definition. Name new cases `067 Work type:`. On Windows, run one `node --test` process per file, at most six in parallel and `canvas-server.test.mjs` alone. Compare against a per-file baseline scheduled the same way before implementation. Record executed, failed, and skipped counts; a skip or zero selected tests is not coverage. Browser suites are not acceptance coverage for this package; the projection and work-index suites establish that Canvas output is unchanged.

| Trace | Required evidence | Runner | Unit |
| --- | --- | --- | --- |
| FR-004 to FR-011; SC-004; the warning in SC-007 | Classified ledgers pass inventory, first capture, first definition, the atomic re-definition batch, backlog collection, and the Work owner check; changed classification lines are refused where preservation applies; empty and unrecognized values read as unrecorded with one lint warning and no failure; unclassified fixtures stay byte-identical. | `feature.test.mjs`, `chronological-identity.test.mjs`, `publish-first-definition.test.mjs`, `atomic-file-batch.test.mjs`, `backlog.test.mjs`, `lint.test.mjs`, `recovery.test.mjs` | 1 |
| FR-042; SC-012 | A ledger with classification lines yields the same projection and work-index output as the same ledger without them, apart from read times and content identities computed from file bytes; every existing case passes unchanged. | `projection.test.mjs`, `work-index.test.mjs` | 1 adds the cases; 2 reruns both files unchanged |
| FR-019 to FR-024, FR-038, FR-041; SC-002, SC-011, SC-013 | `workStage` for every rule row, including both unavailable rows and `tracked`; each overview line carries the stage its report shows; the summary, groups, order, notes, `kanban`, and `flowchart` output are otherwise unchanged; an unmet dependency leaves the stage unchanged; `kanban` and `flowchart` refuse `--tracked`; no workspace file changes. | `work-progress.test.mjs`, `backlog.test.mjs`, `board.test.mjs` | 2 |
| FR-025 to FR-031, FR-039 to FR-041; SC-006, the report in SC-007, SC-013 | `workProgress` fixtures: draft; defined with no started tasks; one and two current phases; a task under no heading; blocked; completed; closed; design exploring, proposed, approved, and unrecognized; design proposed with an unreadable task file, which still yields that status, the `design-proposed` checkpoint, and the `design-approval` gate while stage and phases are unavailable; an unreadable specification, whose design part is `unavailable` with the collector's reason, not `null`; tracked. Requests are always unavailable with the reason and a `null` source. Words for every token, each value alone, neither, and an unrecognized value. `progress <slug>` prints the report, refuses unknown and duplicate slugs, and writes nothing. | `work-progress.test.mjs`, `backlog.test.mjs` | 2 |
| FR-032 | A search of the change shows that only the listed callers import `readWorkClassification`, `workStage`, and `workProgress`, and that no routing, Work, recovery, Ship, or definition gate reads them. | Reviewer, with the change delta | 1 and 2 |
| FR-015, FR-017, FR-018, FR-038, FR-039 guidance | The definition and intake Brainstorm guidance carries the recording rule; the status guidance carries the four forms and `--tracked`; the format contract passes. | `scripts\current-format-contract.test.mjs` | 1 unchanged; 2 updated |
| FR-008, FR-009, FR-015; SC-010 | In a disposable installed project, brainstorm one clearly described defect and one vague description through chat. Record the keys each ledger holds and any question Dude asked. This observes model behavior; it is not a deterministic test. | Installed-host chat acceptance with read-only ledger inspection | 1 |
| FR-017, FR-018, FR-040; SC-005 | In the same kind of project, change one recorded value by telling Dude in chat, then ask for the item's report. Record the bytes the change touched and the words the report shows. | Installed-host chat acceptance | 2 |
| Delivery parity and private bytes | Source and generated mirrors agree; the release build ships the new engine file and no test file; lint has zero failures; private-path hashes are unchanged apart from feature lines in shared writer paths. | `build-dev.test.mjs` projection check, `build-release.mjs` with lint on its output, `lint.mjs` | 1 and 2 |

Complete the automated checks before the installed-host chat observation, and limit that observation to model behavior the tests cannot establish.

## Intended Slices And Handoff

1. Classification foundation, `T001`: sections 1 to 3, the section 5 guidance and documentation, their tests, the classified-ledger Canvas regressions, and their generated mirrors. No UI change. The admissions land with or before the guidance that lets the writer record the keys.
2. Status-backed progress, `T002`, after `T001`: section 4, its tests, the format-contract update, and the generated mirrors, with the projection and work-index suites passing unchanged.

Each unit gets one Tester and one independent Reviewer through ordinary Work. Task state, claims, and closure stay with the coordinator. Execution defaults to Lightweight. Canvas presentation of these concepts waits for 089.

## Risks And Reversibility

- Admission order: writing the keys before every strict parser accepts them breaks the whole inventory. The serial units and the no-keys-during-definition rule prevent this.
- Mixed runtimes: an older installed core or another branch without admission rejects classified ledgers, and a running Canvas or Work process keeps its loaded code until restart. Do not classify real ledgers until the admitting core is what Canvas and Work run, after a restart.
- Wrong inference: a recorded value can be wrong. It changes only plain words in a report, nothing routes or gates on it, and the user changes it by telling Dude in chat.
- Sparse classification: many items, including every existing one, will show no classification words. That is intended.
- Vocabulary drift: adding a token later is backward compatible; removing or renaming one requires explicit edits to the affected records, never bulk inference.
- Two stage vocabularies until 089: Canvas keeps Idea, Verified, and Completed without a package, while status shows the FR-020 stages. The status documentation names the stages it uses, and 089 aligns Canvas.
- Concepts out of sight: until 089 ships, people meet these concepts only through `@dude status` and chat, as Dude's recommendation to the user already said.
- Tracked lane: the coordinator must pass `--tracked`; without it, a tracked feature's stage would come from the Markdown mirror. The status guidance and the format contract carry the rule. In tracked mode, the overview's groups still come from the mirror, as they do today; only the new stage refuses it.
- Private bytes: unit 2 edits a file with private hunks. The splice and re-hash steps above guard it.
- Reverting the feature requires removing any written classification lines first, because older strict parsers reject them. No other migration exists.

# Plan: Epic And Multi-Feature Ship

Spec: `.dude/specs/088-multi-feature-ship/spec.md`
Owner: `.dude/ideas/088-multi-feature-ship.md`

Add one read-only `ship-plan` form to the existing lifecycle view script, `backlog.mjs`, built from the collector, idea selector, and stage rule that already exist. Then teach Ship to use it: build the plan after target resolution, ask before adding any prerequisite the user did not name, carry the approved features one at a time through Ship's existing single-target stages and a fresh Work invocation each, rebuild the plan between features, and end at the first stop. Work, its driver, the runner, `@dude status`, and Canvas do not change. The feature adds no file, module, state, store, or dependency.

The spec passed the definition gate before this plan was written: its sections are complete, every requirement is testable, its criteria are measurable, and no clarification is open. The feature changes no user interface, so the design workflow and its mock gate do not apply to this package; a planned feature that has a user interface still meets its own gate during a run. The Epic part lives in `.dude/ideas/094-epic-continuity.md`. This plan has no ObjectiveRegistry region.

## Technical Context

| Field | Choice |
| --- | --- |
| Language/Version | Existing JavaScript ES modules on the current Node 20 or later baseline, with CI on Node 20 and 22. |
| Primary Dependencies | None new. `backlog.mjs` adds an import of `resolveIdeaSelector` from the engine's `feature.mjs`; everything else it needs is already imported. |
| Storage | None. The form reads idea ledgers, specifications, and task files and writes nothing. The approved plan exists only in the coordinator's context for the current Ship invocation. |
| Testing | `node --test`, one process per file: new `088 Ship plan:` cases in `backlog.test.mjs`, new `088 Ship:` section-bound cases in `scripts\current-format-contract.test.mjs`, the existing Work, driver, status, and Canvas suites as regressions, and one installed-host chat observation for model behavior. |
| Target Platform | Dude core skill script and guidance on Windows, macOS, and Linux. |
| Project Type | Dude core bundle: one skill script form, two guidance sections, and command documentation. |
| Performance Goals | One plan costs one lifecycle collection, the same reads as the `@dude status` overview, plus one inventory read for the selector. A run rebuilds it once before each feature. |
| Constraints | No change to Work, `driver.mjs`, the runner, the adapter, `recovery.mjs`, the status forms, the collector, the lifecycle model, or Canvas. No new path, so the Ship prohibited-surface inventory stays clean. No Beads, tracker, or pack import. |

## Chosen Structure

### 1. The `ship-plan` form

In `src\skills\dude-lightweight-execution\backlog.mjs`, export `planShipRun({ root, target })` and add the CLI form `ship-plan <target>`. Its callers are the form, which the Ship guidance runs, and `backlog.test.mjs`. Nothing else in the file changes behavior: `collectLifecycleItems`, `deriveLifecycleModel`, and the default, `kanban`, `flowchart`, and `progress` forms keep their output, because Canvas imports the first two and the status guidance runs the forms.

`planShipRun` works in this order:

1. Resolve the target with `resolveIdeaSelector`. A value that starts with `.dude/` is an exact numbered idea path; anything else is an exact frontmatter slug. Any `error` diagnostic from the selector or the lifecycle inventory refuses the plan and is passed through unchanged. Warnings, such as a missing specs folder in a project that has only drafts, do not refuse it.
2. Collect items once with `collectLifecycleItems({ root })`, take the target item by its exact idea path, and index all items by authoritative slug with the file's existing `uniqueItemsBySlug`.
3. Refuse the target when its status is `resolved` or its dependency data is unavailable. The target's own stage never refuses the plan: a target whose task file cannot be read still reaches Work at its turn, which reports the problem as it does today.
4. Walk depth-first from the target through each item's `dependsOn`, in declaration order. For each declared slug, check in this order: no unique authoritative item is a missing prerequisite; status `resolved` is a resolved member; an item already on the walk's stack is a cycle, named from that item; an item already visited is passed over; a `null` result from `workStage(item)` or unavailable dependency data is an unavailable member; stage `Completed` adds the item once to `skipped` without following its prerequisites; any other item is visited and appended to `order` after all of its own prerequisites.
5. Append the target last. Each diagnostic is recorded once per code and path. The plan is runnable only when no diagnostic was recorded, and a refused plan carries empty `order` and `skipped`.

The walk never reads lifecycle numbers, titles, or file names for order; declaration order is the only tie-break. It writes nothing.

The form refuses `--tracked` as an unknown option, as `kanban` and `flowchart` do, because Ship builds a plan only when no imported tracked work exists. The planner takes no Beads input: Ship's existing tracked-precedence check runs first, which is simpler than passing a tracker inventory into a Lightweight-only view. `--help` lists five forms.

### 2. Ship guidance

Append `### Declared Prerequisites` to `## Ship` in `src\skills\dude-work-intake\SKILL.md`, after `### Pre-Work Answerability`. It carries the run procedure under Contracts as short rules that cite existing ones instead of restating them. Keep every existing line of `## Ship` byte-identical, including the grammar, the six resolution rules, the normalized policy, and the sentence that begins `Ship creates no resolver, workflow`. That sentence stays true in its established sense: the plan is a read-only view in an existing script, rebuilt on demand, and a run keeps no state, queue, or background process.

The rules must say what the reply shows, not only what to run. The 067 retrospective found that telling the model to "print" output did not deliver it, while an explicit user-visible output rule did.

### 3. Coordinator

In `src\agents\dude.agent.md`, `## Ship`, add one paragraph after the paragraph that passes the resolved target to `dude-work`. When the target declares prerequisites, follow `### Declared Prerequisites` in `dude-work-intake`; the approval question is a pre-mutation stop that no pre-Work disposition answers; keep only the approved plan for the current invocation; hand each feature to `dude-work` as its own target with fresh admission; and report each feature's result. The existing Completion Closeout rule already gives one closeout for several closed targets, and the Rubber Duck retrospective rule already applies once per completed feature, so neither changes.

### 4. Documentation

In `docs\commands.md`, add one paragraph and one illustrative approval reply to the `@dude ship` section, add `ship-plan <target>` to the `backlog.mjs` engine-script row, and add one sentence about the form to the `backlog.mjs` paragraph. README, `docs\workflow.md`, and `docs\reference.md` describe the single-target path, stay accurate, and are unchanged.

### 5. Format contract

In `scripts\current-format-contract.test.mjs`, add `088 Ship:` tests that bind each new rule to its section with a deletion falsifier, using the file's existing `assertShipParagraphRequirements`, and update the engine-script row pattern to the new row. Every other assertion stays as it is. The new prose must pass the existing Ship authority denials, prohibited-capability grants, overclaim, concurrency, and invocation-line checks unchanged: for example, write no clause in which Ship "schedules" Work, imports work, or answers a checkpoint, and name no Ship scheduler, release, or guaranteed completion without a denial.

## Contracts

### `ship-plan` form

```text
node backlog.mjs ship-plan <idea-slug | .dude/ideas/<NNN>-<slug>.md> [--root <dir>]
```

The form prints one JSON object with two-space indentation and a final newline to stdout, and writes nothing. Exit 0 means the plan is runnable. Exit 1 with JSON on stdout means it is refused. A usage error, such as a missing target, an extra argument, an unknown option, or `--tracked`, prints only `[FAIL] <reason>` to stderr and exits 1.

```text
plan.target         string | null                    exact numbered idea path of the target; null when the selector resolves nothing
plan.runnable       boolean
plan.order          entry[]                          prerequisites first, target last; [] when refused
  entry.ideaPath        string                       exact numbered idea path
  entry.specPath        string | null                exact package path when defined
  entry.slug            string
  entry.stage           Captured | Defined | In progress | Blocked | Completed | null    null only for the target
  entry.requested       boolean                      true only for the target
  entry.prerequisites   string[]                     exact idea paths the entry declares, in declaration order
plan.skipped        { ideaPath, specPath, slug }[]   complete prerequisites, in the order the walk reached them; [] when refused
plan.diagnostics    { code, path, message }[]        empty exactly when runnable
```

| Code | Raised when | `path` |
| --- | --- | --- |
| Existing `FEATURE_*` codes, unchanged | The selector or the lifecycle inventory reports an `error`. | The diagnostic's own path. |
| `SHIP_PLAN_PREREQUISITE_MISSING` | A declared prerequisite slug has no unique authoritative idea. | The declaring idea. |
| `SHIP_PLAN_MEMBER_RESOLVED` | The target, or a prerequisite the walk reaches, has status `resolved`. | That idea. |
| `SHIP_PLAN_MEMBER_UNAVAILABLE` | The target's dependency data is unavailable, or a reached prerequisite has a `null` stage or unavailable dependency data. | That idea. |
| `SHIP_PLAN_DEPENDENCY_CYCLE` | The walk reaches an idea already on its stack, including an idea that declares itself. | The first idea in the cycle; the message names each slug in walk order. |

Tests fix the exact message wording. The message for a resolved prerequisite tells the user to reopen it through an explicit brainstorm or to change the declared prerequisites.

Illustrative runnable output for draft `order-checkout`, which declares draft `payment-api` and then complete `user-accounts`:

```json
{
  "target": ".dude/ideas/012-order-checkout.md",
  "runnable": true,
  "order": [
    {
      "ideaPath": ".dude/ideas/011-payment-api.md",
      "specPath": null,
      "slug": "payment-api",
      "stage": "Captured",
      "requested": false,
      "prerequisites": []
    },
    {
      "ideaPath": ".dude/ideas/012-order-checkout.md",
      "specPath": null,
      "slug": "order-checkout",
      "stage": "Captured",
      "requested": true,
      "prerequisites": [".dude/ideas/011-payment-api.md", ".dude/ideas/009-user-accounts.md"]
    }
  ],
  "skipped": [
    {
      "ideaPath": ".dude/ideas/009-user-accounts.md",
      "specPath": ".dude/specs/009-user-accounts/spec.md",
      "slug": "user-accounts"
    }
  ],
  "diagnostics": []
}
```

### Run procedure

`### Declared Prerequisites` carries these rules. Steps 1 to 3 run once per Ship request, and steps 4 to 6 run once per planned feature.

1. After Ship's existing resolution settles one target and its tracked-precedence check finds no imported tracked work, run `node .github/skills/dude-lightweight-execution/backlog.mjs ship-plan <exact ideaPath> --root .` before any definition or Work. For a raw idea, the existing brainstorm capture runs first. With imported tracked work, keep Ship's existing tracked behavior and build no plan.
2. On a non-zero exit, stop before any definition or Work, and report the diagnostics or the `[FAIL]` reason with the next action.
3. When `order` holds only the target, continue on Ship's existing single-target path with nothing added: no question and no plan in the reply. Otherwise, show the plan in the reply: each `order` entry in sequence with its slug, stage, and whether the user named it; the `skipped` prerequisites; and that drafts will be defined and every feature worked under Ship's usual rules. Then ask one question that approves exactly this plan or stops. Only the user's explicit approval in reply authorizes the run, and no pre-Work disposition answers it. Any other reply ends the run with nothing started, and the question is not asked again in that request. Keep the approved `order`, as exact idea paths, for this invocation only.
4. Before each feature, run the form again. Continue only when it exits 0, its `order` equals the approved order minus the features completed in this run, and, after the first feature, the feature just run appears in `skipped`. Otherwise, end the run and report what changed.
5. Take the feature through Ship's existing single-target stages as its own target. A draft goes through the explicit `define` route with its exact idea path, and the definition receives, as read-only context, the `specPath` from `skipped` of each idea in the feature's `prerequisites`. A defined package goes to Work as-is. `### Pre-Work Answerability` applies to this feature's own stages and ends when its Work begins. Then start a Work invocation for that exact feature with the normalized Ship policy and fresh admission. Never pass accepted state from another feature to the driver's `claim --state`.
6. If definition stops, or Work ends with any stop other than `no ready task`, end the run and report that stop unchanged. After `no ready task`, return to step 4 for the next feature, which decides whether the feature just run is complete. After the target's Work, the run ends.
7. In the final response, give each planned feature's result, including features that did not start, and where and why the run ended, together with any pre-Work dispositions and the closeout, as Ship reports them today. Claim no combined outcome. Ship's no-Git rule covers the whole run.

An illustrative approval reply, which tests do not pin:

```text
Action: ship
Plan for order-checkout, in run order:
1. payment-api: draft, not requested by you. Ship would define it, then work it.
2. order-checkout: your target, draft. Ship would define it, then work it.
Already complete, skipped: user-accounts.
Nothing has changed.
Next: Reply yes to run exactly this plan in this order, or no to stop.
```

## Error And Authority Behavior

| Case | Behavior |
| --- | --- |
| Imported tracked work | Ship's existing tracked precedence applies, and no plan is built. |
| Refused plan | Stop before any definition or Work, report the diagnostics and the next action, and write nothing. |
| Plan holds only the target | Existing single-target Ship, unchanged, with no question. |
| Decline, partial approval, or any other reply | The run ends with nothing defined, worked, or written, and no second approval question. |
| Rebuilt plan differs from the approved plan | The run ends before the next feature and reports the difference. |
| Feature not complete after `no ready task` | The run ends and reports Work's outcome unchanged. |
| Definition stop, human-only gate, or any other Work stop | The run ends with that stop unchanged, and later features do not start. |
| Cancellation, supervisor loss, or a hard stop | Work's existing stop and ownership rules apply. The run adds no retry, resume, or cleanup. |
| Authority | The plan grants nothing. Approval authorizes only the listed features for the current request. Each feature's definition, Work, verification, review, and close keep their owners. Ship never imports, switches lanes, or takes a Git action. |

## Guardrail Checks

| Guardrail | Application |
| --- | --- |
| Keep it simple | One function and one CLI form in an existing script, guidance in two existing sections, and no new file, state, store, queue, Epic record, Beads input, or Work change. Considered and rejected: a new module, a stored run record, an approved-list flag on the form, a per-feature tracked recheck, and continuing past a stop. |
| Deterministic scripts | Code computes the order, skips, refusals, and the data each recheck compares. Model judgment is limited to presenting the plan, reading the user's reply, and comparing the rebuilt order with the approved list. |
| Lifecycle numbers mean chronology | The walk never reads numbers; declaration order is the only tie-break. |
| Beads authority | A plan is built only when no imported tracked work exists. |
| UI mockup approval is mandatory | Does not apply to this package, which changes no user interface. During a run, a feature with a user interface stops at its own design gate. |
| Core stays runtime-independent of optional packs | The form imports only engine siblings and reads no pack. |
| Concise model-facing instructions | One short subsection and one coordinator paragraph that cite existing rules. |
| Draw on established knowledge | Build tools such as Gradle and Bazel run a target's dependencies before the target and refuse dependency cycles. Package managers such as apt list the additional packages a request needs and ask once before installing them, which is the pattern the approval question follows. Unlike parallel builds, the run is sequential, because Work processes one task at a time. |
| Response handoff | The approval question and every stop report end with a plain `Next:` line, as Ship replies already do. |
| UI verification handoff | No user interface changes. The installed-host chat observation runs after the automated checks and covers only model behavior. |

Existing project and bundle guardrails cover this feature. No guardrail candidate arose, so nothing is adopted, narrowed, rejected, or skipped.

## Change Surface

Paths are planned implementation surfaces, not changes made during definition.

| Surface | Change |
| --- | --- |
| `src\skills\dude-lightweight-execution\backlog.mjs` | T001: `planShipRun`, the `ship-plan` branch, its argument handling, and the help text. |
| `src\skills\dude-lightweight-execution\backlog.test.mjs` | T001: `088 Ship plan:` cases, and the help-lines assertion updated to five forms. |
| `src\skills\dude-work-intake\SKILL.md` | T002: `### Declared Prerequisites` at the end of `## Ship`. |
| `src\agents\dude.agent.md` | T002: one paragraph in `## Ship`. |
| `docs\commands.md` | T002: the `@dude ship` section, the `backlog.mjs` engine-script row, and the `backlog.mjs` paragraph. |
| `scripts\current-format-contract.test.mjs` | T002: `088 Ship:` tests and the updated engine-script row pattern, keeping the file's private hunks. |
| Generated `.github` mirrors | `.github\skills\dude-lightweight-execution\backlog.mjs` in T001; `.github\skills\dude-work-intake\SKILL.md` and `.github\agents\dude.agent.md` in T002. Tests are source-only. |

Unchanged: the Work skill, `COOKBOOK.md`, `driver.mjs`, the runner, the adapter, `recovery.mjs`, the Spec Lead agent, the definition skill and its publishers, the Lightweight execution skill, `board.mjs`, `work-progress.mjs`, `feature.mjs`, lint, README, `docs\workflow.md`, `docs\reference.md`, and every Canvas source and test.

Consumers of the changed bytes: Canvas imports `collectLifecycleItems` and `deriveLifecycleModel`, which stay unchanged; `board.test.mjs`, `chronological-identity.test.mjs`, and the format contract import the backlog module or compare its mirror; `host-adapter.test.mjs` lists the path only. The format contract also forbids `new Date`, `node:child_process`, `rev-parse`, `path.basename`, `GENERATED_AT`, and `SOURCE_REV` in `backlog.mjs`, so the new code uses none of them. No test pins the bytes of `backlog.mjs`, the intake skill, or the coordinator agent.

### Build, generated mirror, and private local bytes

`node scripts\build-dev.mjs` projects all of core. This plan rebuilds no UI bundle and changes no hash pin.

This working tree holds private local bytes. The 067 plan recorded a modified `.dude\metadata\profile.md`, `.github` agent model overrides, local edits to `dude.instructions.md` and `agent-models.json` in both `src` and `.github`, two private hunks in `scripts\current-format-contract.test.mjs`, and untracked pack projections. Re-inventory them at each task start instead of trusting that list. T002 edits `scripts\current-format-contract.test.mjs`, and `.github\agents\dude.agent.md` is rendered with the model configuration, so it may carry a private override. For each unit:

1. Record the SHA-256 of every private path before the first implementation write.
2. Build and run full acceptance in a clean export that holds HEAD plus only the 088 source changes so far, with every private path at its HEAD bytes.
3. Integrate into this working tree only the unit's source files and the exact generated outputs selected through `listCoreOutputs` and `writeCoreOutput` from `scripts\build-release.mjs`. Refuse missing or duplicate matches, and never regenerate core in bulk here.
4. Where a writer path also holds private bytes, add only the feature's lines and keep every private hunk.
5. Re-hash the private paths, and stop on any difference other than the feature's own lines in a shared writer path.

No Git action is part of this plan.

## Verification

These are planned checks for the implementation and testing owners; no terminal command, build, test, or lint ran during this definition. Name new cases `088 Ship plan:` in `backlog.test.mjs` and `088 Ship:` in the format contract. On Windows, run one `node --test` process per file, at most six in parallel, with `src\extensions\dude\canvas-server.test.mjs` alone, and compare each file against a per-file baseline scheduled the same way before implementation. Record executed, failed, and skipped counts; a skip or zero selected tests is not coverage. Fixture roots are short temporary directories outside the repository.

Each check has a stated comparison boundary. Implementation scope compares the implementer's writes with the attempt baseline that the driver's `snapshot` captures at the specialist request, before implementation, through the driver's `diff`. The runner's own Work-state writes for this package, meaning task glyphs and history lines in `.dude/specs/088-multi-feature-ship/tasks.md` and claim and close lines in the owner's Coordinator Log, are accounted for separately by their exact provenance and never count as implementation scope. Private-path hashes compare with the inventory taken at task start. Zero-write checks compare a snapshot taken just before the command with one taken just after.

| Trace | Required evidence | Runner | Kind | Unit |
| --- | --- | --- | --- | --- |
| FR-002 to FR-008; SC-001 | Plan fixtures: a chain; a diamond with the declaration-order tie-break; a complete prerequisite whose own prerequisite is unfinished; draft, in-progress, and blocked prerequisites; no prerequisites; only complete prerequisites; and a project with draft ideas only and no specs folder. Two runs, and runs in two differently named roots, print identical output, and every fixture root is byte-identical before and after. | `backlog.test.mjs` | Deterministic | T001 |
| FR-009 to FR-012; SC-002 | Refusal fixtures: a missing prerequisite, a two-feature cycle, a self-declared prerequisite, a resolved prerequisite, a resolved target, an unreadable prerequisite task file, malformed declared prerequisites on the target and on a prerequisite, a duplicate slug, conflicting ownership, and an invalid selector. Each exits 1 with `runnable: false`, empty `order` and `skipped`, the expected code and path, and zero writes. A target whose own task file cannot be read still plans. | `backlog.test.mjs` | Deterministic | T001 |
| Data for FR-021 and FR-022; SC-003 | Recheck fixtures: completing every task of the first planned feature moves it to `skipped` and leaves the remaining order unchanged; one blocked task keeps it in `order`; a newly declared prerequisite appears in `order`. | `backlog.test.mjs` | Deterministic | T001 |
| Form contract | Usage errors and `--tracked` exit 1 with `[FAIL]` and empty stdout; `--help` lists five forms; the default, `kanban`, `flowchart`, and `progress` output is unchanged. | `backlog.test.mjs`, `board.test.mjs` | Deterministic | T001 |
| Status and Canvas unchanged; SC-007 | `projection.test.mjs`, `work-index.test.mjs`, and `chronological-identity.test.mjs` pass with those files unchanged, and `canvas-server.test.mjs` runs alone. | Those suites | Deterministic | T001, rerun in T002 |
| FR-001, FR-013 to FR-031; SC-005 | `088 Ship:` tests bind each rule to its section in the intake `## Ship`, the coordinator `## Ship`, or the command reference's `@dude ship` section, each with a deletion falsifier that fails for that rule alone. They prove the written rules, not model compliance. | `current-format-contract.test.mjs` | Deterministic | T002 |
| FR-018, FR-019, FR-026; SC-004, SC-007 | Every existing Ship assertion passes unchanged: grammar, resolution, tracked precedence, normalized policy, authority denials, prohibited surfaces, overclaims, and documentation. `driver.test.mjs` and the other Work suites match their baselines, so claim admission, `--state` continuation, and stops are unchanged. | `current-format-contract.test.mjs`, `driver.test.mjs`, full suite | Deterministic | T002 |
| FR-014 to FR-016; SC-006 | In a disposable installed project, drafts `payment-api` and `order-checkout`, the second declaring the first. Snapshot, send `@dude ship order-checkout`, and record the order shown, the not-requested mark, the number of questions, and whether any definition or Work started. Compare the order with the form's read-only output there, reply `no`, snapshot again, and confirm the two snapshots match. No implementation runs in that project. | Installed-host chat with read-only inspection | Model behavior | T002 |
| Delivery parity and private bytes | Mirrors equal their sources; the release build ships the changed form and guidance and no test file; lint has zero failures; private-path hashes are unchanged apart from feature lines in shared writer paths. | `build-dev.test.mjs` projection check in a clean export, `build-release.mjs` with lint on its output, `lint.mjs`, hashing | Deterministic | T001, T002 |

Delivering several features end to end in one run is not exercised by these checks, because it depends on a live coordinator, the host, and real specialist dispatches. Three rows bound it instead: the recheck data is deterministic, the written run rules are section-bound, and Work and its driver are unchanged. Complete the automated checks before the installed-host observation, and limit that observation to model behavior the tests cannot establish.

## Intended Slices And Handoff

1. Plan form, `T001`: section 1, its tests, and its generated mirror. It changes no guidance, so Ship behaves as before until T002 lands.
2. Ship wiring, `T002`, after `T001`: sections 2 to 5, the format contract, the generated mirrors, and the installed-host observation.

Each unit gets one Tester and one independent Reviewer through ordinary Work. Task state, claims, and closure stay with the coordinator, and execution defaults to Lightweight.

## Risks And Reversibility

- Plan drift: declarations can change after approval. The check before each feature ends the run instead of widening it.
- Downstream contract mismatch: a dependent feature can find that a prerequisite delivered a different contract than its definition expected. Work then stops with its existing classification, and changed intent goes through explicit brainstorm or define. Defining drafts after their prerequisites, with those packages as context, reduces this risk without removing it.
- Model compliance: the approval question, the recheck comparison, and the end-at-first-stop rule are guidance. The installed-host check samples only the approval and decline path, once.
- Per-feature pre-Work scope: the existing sentences that end pre-Work answerability when Work begins read per feature during a run, and the new intake and coordinator text says so. The Work skill and the Spec Lead agent are unchanged.
- Lost supervisor or retained claims: Work's existing hard stop and manual cleanup rules apply. A retained claim blocks a later run of that feature until it is resolved under those rules.
- Long runs: an approved plan with several features can run for a long time. Work's existing stops and cancellation are the only bounds, and the user sees every feature before approving.
- Ship's denial sentence: `Ship creates no resolver, workflow, ... scheduler, report` stays as written, and the plan is a read-only view in an existing script. If a reviewer reads that sentence as forbidding any ordering, revising it needs an explicit definition change, not an implementation edit.
- Shared private bytes: T002 edits a file with private hunks and a rendered agent file that may carry a model override. The splice and re-hash steps guard both.
- No combined outcome: completed features are reported separately, and `.dude/ideas/094-epic-continuity.md` holds the combined check.
- Reversibility: removing the subsection, the coordinator paragraph, the documentation lines, the contract tests, and the form restores single-target behavior. Nothing persistent is written, so no migration exists.

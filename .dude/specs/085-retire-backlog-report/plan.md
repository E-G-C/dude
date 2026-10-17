# Plan: Retire Backlog Report

Spec: `.dude/specs/085-retire-backlog-report/spec.md`
Owner: `.dude/ideas/085-retire-backlog-report.md`

Remove the committed-report pipeline from the existing backlog module and remove its three post-commit callers. Keep the shared lifecycle model and read-only commands, adding the old Dependency and order notes directly to the default text view. Deliver the code, tests, guidance, and generated copies in one unit so no intermediate task leaves the contract half-migrated.

## Technical Context

| Field | Value |
| --- | --- |
| Language/Version | JavaScript ES modules on Node >= 20; acceptance commands use Windows PowerShell. |
| Dependencies | None new. Keep the existing lifecycle inventory, identity, task, and workspace readers. |
| Storage | Delete this repository's two derived report files. No new state, schema, setting, cache, or migration. |
| Testing | Existing Node test suites for backlog, board, Work, prose contracts, builds, chronological identity, and the Canvas work index; full-suite comparison with the coordinator's baseline. |
| Target Platform | Existing Dude command-line and Work environments; the Canvas consumer stays unchanged. |
| Constraints | Author core in `src/`, generate `.github/` only with `scripts/build-dev.mjs`, preserve canonical write results, and leave other projects and historical evidence untouched. |

## Chosen Structure

### 1. Keep the model and printed views (FR-007 through FR-016)

Retain `collectLifecycleItems`, `deriveLifecycleModel`, `collectLifecycleModel`, `renderText`, `renderCurrentMermaid`, `renderFlowchart`, `parseArgs`, and `run` in `src/skills/dude-lightweight-execution/backlog.mjs`. Keep the helpers and inputs those functions and the Canvas actually use. Follow the ordinary read-only command convention of `git status`: compute the current view to standard output rather than maintain another stored snapshot.

After its existing group lists, `renderText` prints a `Dependency and order notes` section using the same facts and conditions as the old `renderMarkdown` section:

- Use `relationships.hasExplicitOrder` to state whether valid explicit order exists, naming `.dude/state/backlog-order.md` when it does. Do not replace that test with mere file existence.
- List the `relationships.declared` entries of type `dependency`, with the dependent and prerequisite slugs. Print the no-dependencies sentence only when that list and `relationships.unavailable` are both empty.
- Name each feature in `relationships.unavailable` and retain the statement that no negative dependency fact is inferred.
- List each `relationships.provisional` entry as provisional and non-authoritative, retaining its lack of effect on classification. Print the existing no-evidence sentence when the list is empty.

Move these statements into the one remaining text renderer; do not introduce another rendering layer. Preserve current enumeration order and the existing recognition of provisional evidence. The kept summary, groups, chronological ordering, `kanban`, and `flowchart` behavior stay unchanged. Output remains independent of wall-clock time, checkout name, and Git revision.

### 2. Remove post-commit refresh (FR-001 through FR-003)

In `src/skills/dude-lightweight-execution/board.mjs`, delete the `refreshCommittedBacklog` import and all three calls:

- Guarded `set --write` returns its existing success after writing canonical task state and its snapshot. Remove only the refresh-specific catch, failure message, and exit-2 path.
- Guarded `apply-states --write` likewise keeps its success and unknown-ID warnings after the canonical writes.
- `applyLightweightWorkRequest` returns the existing `commitLightweightWorkRequest` result without a derived-report step. Preserve refused, indeterminate, and committed result shapes and the canonical receipt.

Do not change board rendering, ownership checks, snapshots, Work permits, audit, recovery, settlement, or stop rules. Successful canonical work no longer depends on report generation.

### 3. Replace current report duties (FR-017 through FR-019)

Update the Lightweight skill's Cross-Idea Backlog section to describe only the three read-only commands and the default view's notes. Keep its lifecycle, exact-identity, chronology, and declared-versus-provisional authority rules. Remove the report-specific generation, freshness, and activity-rendering contract; Canvas activity stays as shipped.

In the Work skill's manual-close and post-terminal administrative-reconciliation prose, remove only backlog-refresh duties and report effects from the lists of partial commits. Preserve the remaining close duties, admission limits, historical records, and failure reporting.

Update the engine-script table and related guidance in `docs/commands.md`, `docs/reference.md`, `docs/workflow.md`, and `README.md`. The README's current pair paragraph becomes short guidance toward the Canvas and printed views, with exactly one notice: Dude no longer updates `.dude/backlog.md` or `.dude/backlog.html`, and users can delete copies from earlier versions. Do not repeat that notice in the other guides or add an upgrade cleanup action.

### One phase, one unit

`T001@f6a0c58a` covers US1 through US3. `scripts/current-format-contract.test.mjs` reads the skill prose, source and generated backlog modules, and the template together; separate code and prose tasks would leave that test half-migrated. No setup task, design phase, supporting artifact, or later cleanup task is needed.

## Files

These are the authored writer paths. Deletions and generated outputs follow.

| File | Change |
| --- | --- |
| `src/skills/dude-lightweight-execution/backlog.mjs` | Retain the shared model and printed views, move the notes, and remove report-only code and CLI forms. |
| `src/skills/dude-lightweight-execution/board.mjs` | Remove the import and three refresh calls without changing canonical write results. |
| `src/skills/dude-lightweight-execution/SKILL.md` | Current read-only view contract; remove report duties, including the manual-close failure list. |
| `src/skills/dude-work/SKILL.md` | Remove report-refresh duties from both manual-close paths without relaxing their other rules. |
| `src/skills/dude-lightweight-execution/backlog.test.mjs` | Remove report/template/freshness tests and imports; cover notes, retained views, determinism, read-only behavior, and removed-form refusals. Remove the repository-level `check` test. |
| `src/skills/dude-lightweight-execution/board.test.mjs` | Replace refresh and pair-rollback expectations with no-report-write checks for the three canonical mutation paths. |
| `src/skills/dude-work/host-adapter.test.mjs` | Remove the template from the generated-file inventory; replace T030's refresh-failure injection with unchanged-report assertions while preserving receipt, canonical commit, and audit checks. |
| `src/skills/dude-work/recovery.test.mjs` | Remove the pair from expected moving surfaces; retain exact canonical-surface and receipt assertions. |
| `scripts/current-format-contract.test.mjs` | Replace retired report obligations with the current read-only and notes contract; retain source/generated parity, authority, and the remaining manual-close clauses, including administrative reconciliation. |
| `scripts/model-mapping-falsifier.test.mjs` | Move the existing authored-HTML injection probe to the existing Canvas entry HTML in its disposable fixture. |
| `docs/commands.md` | Engine-script purpose and retained read-only commands, including notes; remove refresh guidance. |
| `docs/reference.md` | Replace the report-maintenance paragraph with the retained views. |
| `docs/workflow.md` | Remove report-generation steps from workflow guidance. |
| `README.md` | Current views and the single earlier-version deletion notice. |

## Deletions

FR-003 and FR-005 remove these files:

- `src/skills/dude-lightweight-execution/backlog-template.html`
- `.dude/backlog.md`
- `.dude/backlog.html`

In `backlog.mjs`, delete `BACKLOG_MD_PATH`, `BACKLOG_HTML_PATH`, the HTML helpers from `featureKind` through `renderActivity`, `renderReport`, `renderMarkdown`, `markdownInline`, `markdownItem`, `readTemplate`, `renderArtifacts`, the preimage helpers, `refreshCommittedBacklog`, `readCommittedArtifact`, `runCheck`, and `runGenerate`. Delete the `check` and `generate` dispatches, the `--write` parser option and result field, and their HELP lines. Let the ordinary unsupported-command/option path refuse the removed forms with exit 1 (FR-004); add no stub, alias, or deprecation mode.

Trace each remaining helper, export, import, and model field to a kept production reader. Remove anything used only by the deleted renderers, including now-unused collection work. A test import is not a reason to preserve a dead capability.

Preserve every value used for grouping, the kept views, or Canvas. In addition to `group`, `defined`, `taskCounts`, `tasksAvailable`, `unavailableDetail`, `authorityIssues`, and identity fields, the current Canvas projection reads `ownBlocked` and `model.relationships.declared` for prerequisite-source freshness. That loop consumes `type`, `from`, and `to`, compares `to` with the model item by object identity, and reads the prerequisite's `defined` and `ideaPath`. Keep those relationships and shared node identities intact. The Canvas also supplies task facts to the model, so its grouping inputs and `taskWarnings` use must survive. This extends the coordinator's initial consumer inventory without changing `src/extensions/dude/lib/projection.mjs`.

The new text notes keep the needed order, declared, provisional, and unavailable relationship facts alive. Remove other report-only fields only after checking all kept readers; do not retain or redesign the whole rich report model for hypothetical callers.

## Generated Outputs And Pins

Run `node scripts/build-dev.mjs` after the authored changes. It alone writes these generated changes:

| Generated path | Result |
| --- | --- |
| `.github/skills/dude-lightweight-execution/backlog.mjs` | Project the changed source. |
| `.github/skills/dude-lightweight-execution/board.mjs` | Project the changed source. |
| `.github/skills/dude-lightweight-execution/SKILL.md` | Project the changed skill. |
| `.github/skills/dude-work/SKILL.md` | Project the changed skill. |
| `.github/skills/dude-lightweight-execution/backlog-template.html` | Remove the retired projection. |

Do not hand-edit these files or run the Canvas UI build. Inspect the build delta against the task-start snapshot: an unrelated projection or development-base-release metadata change is outside this task's writer set and must be reported through ordinary Work, not silently included.

Set the falsifier's `nonJavaScriptProbe` to `src/extensions/dude/ui/index.html`. It is an existing authored `.html` file under the scan's `src` root. Keep the same injection and findings assertions, only inside the disposable repository copy. The real entry HTML is unchanged and is not a writer path.

The coordinator's hash search found no test pin for `backlog.mjs`, `board.mjs`, either changed skill, or the template. The unchanged chronological-identity suite checks backlog source/generated parity, and the unchanged work-index suite records the backlog hash as review evidence rather than a fixed pin. Preserve both suites.

Leave `.dude/metadata/continuation-2026-09-20/**` byte-identical (FR-019). Its `canonical-file-identities.json` stores old hashes for the template and board module as frozen export evidence; no current validator reads it. Do not update that archive or the ledgers and packages of 025, 027, 030, 048, or 052.

## Verification

These are planned checks for implementation and testing owners; definition runs none. Use Windows PowerShell from the repository root and the per-file pre-change baseline supplied by the coordinator. Generate the dev copies before any test that reads them, so the build command in item 5 may run first. Replace both release-directory placeholders below with the same short, owned absolute temporary directory outside the repository.

| Coverage | Required evidence |
| --- | --- |
| US1; FR-001 through FR-006; SC-001, SC-002, SC-006 | Missing-report and existing-copy fixtures for guarded single writes, guarded batch writes, and autonomous application. Canonical successes and receipts stay exact; old copies stay byte-identical; removed commands refuse without writes. Current instruction contracts require no lifecycle regeneration. |
| US2; FR-007 through FR-009, FR-016; SC-003, SC-005 | Retained summaries, groups, chronology, and task graphs; repeat output in differently named roots with no writes. Keep chronological-identity and Canvas work-index regressions, especially direct-dependency freshness and own-blocked/completed precedence. Do not weaken them to accept unavailable data after accidental model deletion. |
| US2; FR-010 through FR-015; SC-004 | Match every old note fact for valid order, absent order, declared dependencies, unavailable dependency data, provisional evidence, and no evidence. Include the repository's current provisional relationship. Preserve the no-dependencies condition and non-authoritative meaning. |
| US3; FR-017, FR-018; SC-007 | Source/generated prose parity, no report-maintenance duties or removed HELP forms, and exactly one earlier-version notice in current guides, in README. Keep the unaffected manual-close authority and partial-failure assertions. |
| FR-003, FR-019; SC-001, SC-008 | Development and pristine release builds omit the template; this repository omits the pair; the implementation delta is exactly the 22 writer paths, with other packages, archives, and Canvas source unchanged. |

Acceptance commands and checks:

1. `node --test src/skills/dude-lightweight-execution/backlog.test.mjs src/skills/dude-lightweight-execution/board.test.mjs`
2. `node --test src/skills/dude-work/host-adapter.test.mjs src/skills/dude-work/recovery.test.mjs`
3. `node --test scripts/current-format-contract.test.mjs scripts/model-mapping-falsifier.test.mjs`
4. `node --test src/skills/dude-engine/lib/chronological-identity.test.mjs src/extensions/dude/work-index.test.mjs`
5. `node scripts/build-dev.mjs`, then `node --test scripts/build-dev.test.mjs`
6. `node .github/skills/dude-lint/lint.mjs .` with 0 failures.
7. `node .github/skills/dude-compose/compose.mjs verify`
8. `node scripts/build-release.mjs --out <temporary directory>`, then `node .github/skills/dude-lint/lint.mjs <that directory>` with 0 failures.
9. Run the full suite with CI-equivalent discovery, one process per file: for each path from `Get-ChildItem -Recurse -File -Filter *.test.mjs | Where-Object { $_.FullName -notmatch '\\(node_modules|dist|\.git)\\' }`, run `node --test <that path>` and record its exit code and test, pass, fail, and skipped counts. Compare each file's result with the coordinator's per-file pre-change baseline. A single `node --test` process over every file exhausted the runner's heap on this host before finishing, so it is not evidence here.
10. `node .github/skills/dude-lightweight-execution/backlog.mjs --root .` prints the groups and dependency and order notes; `node .github/skills/dude-lightweight-execution/backlog.mjs kanban --root .` and `node .github/skills/dude-lightweight-execution/backlog.mjs flowchart retire-backlog-report --root .` retain their behavior. `node .github/skills/dude-lightweight-execution/backlog.mjs check --root .`, `node .github/skills/dude-lightweight-execution/backlog.mjs generate --root .`, and `node .github/skills/dude-lightweight-execution/backlog.mjs --write --root .` each exit 1 without writes; the former `generate --root . --write` invocation is likewise refused. HELP lists only the retained forms.
11. `.dude/backlog.md` and `.dude/backlog.html` are absent. The implementation changed-path set, measured against the coordinator's task-start snapshot, equals the exact 22-path list in `tasks.md`, including deletions and generated outputs. Definition publication and coordinator-owned execution state are not implementation writes.

Record executed, failed, and skipped counts and compare each file's result with the supplied per-file pre-change baseline. A skipped check is not coverage, and a baseline failure does not excuse a new affected failure. Report evidence through ordinary Work; do not treat planned checks as results.

## Guardrails And Risks

Existing project guardrails apply unchanged; no new candidate rule arose.

- Keep it simple/YAGNI: remove the unused report capability and its dead code instead of adding another refresh safeguard. Reuse the current model and one printed view; add no background job, compatibility layer, state, or cross-project cleanup.
- Deterministic scripts: keep parsing, classification, ordering, and output in the existing script, with input-derived notes and repeat-byte checks. No model-authored regeneration or time/revision stamps.
- UI mockup rule: this feature deletes a report template but writes no production UI source. Canvas layout, projection, and assets stay unchanged, so no mock or visual approval is required. The falsifier's temporary HTML comment is test data, not a UI change.

Delivery risks:

- The running Work invocation may already have loaded the old generated modules into memory. After template deletion, that old code may try one final refresh; its autonomous path swallows refresh failure and preserves the committed receipt. Report any observed effect under existing Work rules. Add no hot-reload, refresh stub, or recovery exception to handle this one delivery.
- `host-adapter.test.mjs` is large and can take substantial time. Focused runs can help diagnosis but do not replace its planned full run or the full-suite baseline comparison. Keep temporary test roots short on Windows.
- The single-process full suite exhausts the runner heap on this Windows host, so verification runs one process per file; CI on Linux keeps its existing single command.
- Removing model fields too broadly can make Canvas dependency-derived groups unavailable even while simple printed fixtures pass. The live-reader check and unchanged work-index regressions cover that concrete risk.
- Source, generated modules, prose, and contract tests must change together. The single unit prevents a half-migrated task boundary; unexpected build writes still fail the scope check.
- Readers lose the GitHub Markdown view and the visual relationship report. The notes remain available as text, and other projects retain stale copies until their users delete them. The one README notice explains this current-only boundary; Dude adds no detection or deletion mechanism.

Only derived files and their implementation are retired. Reverting the product change would restore that code and the derived artifacts; no canonical work data needs reconstruction. Work's normal verification, review, audit, and stop behavior remains unchanged.

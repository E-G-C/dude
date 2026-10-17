---
title: Retire Backlog Report
slug: retire-backlog-report
status: defined
spec_path: .dude/specs/085-retire-backlog-report/spec.md
---

# Idea: Retire Backlog Report

## Idea

> I thought we decided to replace .dude/backlog.html, with the Dude canvas functionality and we were not using anymore, check on this

The user sent this at 2026-10-15T14:50:40Z, after a brainstorm regenerated `.dude/backlog.html`. Dude corrected only clear spelling slips (tohught, decied, rplace, nto). In a separate message the user added:

> the process needs to be as deterministic as possible

Dude's reply applied that to the backlog files, which stay current only when the agent remembers to regenerate them, and proposed this capture. The user confirmed with "yes" at 2026-10-15T15:12:30Z.

### Earlier decision recorded in 052

On 2026-08-31 the user said, as recorded in `.dude/ideas/052-dude-canvas-ui.md`:

> the backlog report will be absorbed by this new feature as well, we can leave it there for now and retire it once the UI realted functionality replaces it.

On 2026-09-01 the user confirmed: "Yes, retiring backlog after replacement."

## Open Questions

For later definition; no answer is needed to capture this intention. Each question names Dude's recommendation first; the reasons are under Dude's Analysis.

1. Should `.dude/backlog.md` be retired along with `.dude/backlog.html`? Dude recommends retiring both. The Markdown file needs the same regenerate-and-commit step, and the printed `backlog.mjs` views show the lifecycle groups in any session without writing a file.
   Answer:
2. 052 says to retire the report only after the Canvas replacement is delivered and verified. Should definition first compare the report with the Canvas and list what is missing, or do you already consider the Canvas a complete replacement? Dude recommends a short comparison. The Canvas shows no task-graph diagram, declared feature order, or feature-level dependencies, although this repository declares no feature order or dependencies today.
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Intent And Scope

One bounded outcome: Dude stops generating and committing the backlog report, and the Canvas becomes the visual backlog, as the user decided in 052.

- Stop generating and committing `.dude/backlog.html`, and `.dude/backlog.md` unless question 1 keeps it. Delete this repository's copies.
- For each retired file, remove its rendering code (for the HTML file, also `backlog-template.html`), the procedural regeneration rule, the automatic refresh after task-state changes, the repository freshness test, and the documentation.
- Keep the lifecycle functions the Canvas imports from `backlog.mjs`, and the read-only printed views (`backlog.mjs`, `kanban`, and `flowchart`), which compute from `.dude` and write nothing.

Success test: after a brainstorm, a definition, or a Work task close, no backlog file changes and no step regenerates one; tests and lint pass in CI; the Canvas shows the same work; and `node .github/skills/dude-lightweight-execution/backlog.mjs --root .` still prints the lifecycle groups.

Out of scope:

- New Canvas content, unless question 2's comparison finds a gap the user wants filled before retirement.
- Deleting backlog files in other projects. Under the current-only rule Dude does not scan or delete retired state, so the release notes tell users they can delete the files.
- Rewriting the ledgers or packages of 025, 027, and 030, which stay as completed history.

This capture creates no package, tasks, or mock and authorizes no change.

## Dude's Analysis

The user asked Dude to check the earlier decision and said the process should be as deterministic as possible. This section is Dude's recommendation, based on the facts under Current Context And Investigation. It is not a user answer or an accepted requirement.

- The decision exists but was never carried out. 052 recorded it as a future constraint, and no idea, task, or memory entry followed, so the shipped skill and CI still require both files.
- The files stay current only when the agent remembers to regenerate them after six kinds of writes. Feature 030 added an automatic refresh after task-state changes because the files fell behind. Removing the files removes the step rather than adding another safeguard.
- The Canvas computes the lifecycle model in code from `.dude` each time it reads, through the functions it imports from `backlog.mjs`, so it cannot go stale.
- `.dude/backlog.html` is about 1.4 MB and was rewritten in 67 commits, so feature diffs keep carrying a large generated file.
- The printed views cost little to keep and cover sessions without the Canvas: the agent can print the backlog in chat on request.

Risks to resolve in definition:

- The automatic refresh is part of Work's tested runtime (`applyLightweightWorkRequest`; `src/skills/dude-work/host-adapter.test.mjs` and `recovery.test.mjs` mention the files), so removing it needs careful scoping.
- Other projects keep their last committed backlog files, which stop updating until the user deletes them.

## Current Context And Investigation

Coordinator-verified facts from 2026-10-15, not user answers:

1. On 2026-08-31, 052 recorded the deferred absorption and retirement of idea 025, the backlog report. On 2026-09-01 it recorded the user's confirmation and a settled future constraint: 025 "remains untouched and operational until the corresponding UI functionality has actually replaced it", and it is retired "only after that replacement is delivered and verified, not when it is merely planned or mocked."
2. No idea, spec, plan, task, or memory entry plans the retirement. Ideas 025, 027, and 030 are completed, defined features.
3. The shipped `dude-lightweight-execution` skill fixes the committed pair at `.dude/backlog.md` and `.dude/backlog.html`, and `backlog.mjs generate --root . --write` is the only way to write them. The skill requires that step after brainstorm, definition, resolution, reopen, backlog-order changes, and Coordinator Log-only writes outside the autonomous boundary. A pair-safe refresh also runs automatically after guarded `board.mjs set --write`, guarded `apply-states --write`, and autonomous `applyLightweightWorkRequest`.
4. `src/skills/dude-lightweight-execution/backlog.test.mjs` runs `backlog.mjs check` against the repository and requires both files to be current, and CI runs every `*.test.mjs` file. In a test today, `check` exited 3 and reported the HTML file as STALE while it differed, and exited 0 after the file was restored.
5. The Canvas imports `collectLifecycleItems` and `deriveLifecycleModel` from `backlog.mjs` in `src/extensions/dude/lib/projection.mjs`, and its comment says it reuses the backlog's grouping, "never its generated report or chronology/order". A search of the Canvas UI found lifecycle groups, task dependencies and readiness, and recent feature activity. It found no task-graph diagram, no declared feature order from `.dude/state/backlog-order.md`, and no feature-level `depends-on:` display. This repository declares neither today.
6. `.dude/backlog.html` is 1,375,828 bytes and `.dude/backlog.md` is 11,384 bytes. 67 commits in this branch's history touched the HTML file. The skill folder also holds `backlog-template.html` (24,929 bytes).
7. Other files that mention the pair: `src/skills/dude-lightweight-execution/{SKILL.md,backlog.mjs,backlog.test.mjs,board.test.mjs}`, `src/skills/dude-work/{host-adapter.test.mjs,recovery.test.mjs}`, `scripts/current-format-contract.test.mjs`, `docs/commands.md`, `docs/reference.md`, `docs/workflow.md`, and `README.md`, plus the generated copies under `.github/`.

## Related References

- Decision and Canvas vision: `.dude/ideas/052-dude-canvas-ui.md`.
- The report to retire: `.dude/ideas/025-backlog-report.md`.
- Usability and lifecycle sync built on the report: `.dude/ideas/027-backlog-report-usability.md` and `.dude/ideas/030-backlog-lifecycle-sync.md`.
- Earlier backlog canvas idea, resolved as superseded by 052: `.dude/ideas/048-backlog-canvas.md`.

These references establish product continuity, not execution dependencies or order. Lifecycle numbers record capture chronology only.

## Definition Package

Definition package: `.dude/specs/085-retire-backlog-report/spec.md`, with `plan.md` and one proposed open task, `T001@f6a0c58a`. The package removes the report pair and its maintenance steps, keeps the Canvas unchanged, and preserves the three read-only printed views.

During the user's explicit `ship retire-backlog-report`, the Spec Lead applied these two Ship-authorized definition-owner dispositions. They are not user answers; both answer slots above remain blank.

- Question 1: retire both `.dude/backlog.md` and `.dude/backlog.html`. Basis: 052's accepted retirement concerns "the backlog report", and 025's answer to question 1 defines that report as the pair. Both files require the same regenerate-and-commit step, which conflicts with the user's request to remove that procedural burden. The Canvas remains the visual view, and the printed views remain available without it. Readers lose the committed Markdown view on GitHub; other projects keep their last copies until their users delete them.
- Question 2: use the coordinator's comparison of 2026-10-17 and require the remaining notes to be delivered and verified in the default printed view in the same task as retirement. The existing Canvas and printed views cover the report's counts, lifecycle groups, current-work map, task graph, feature details, definition artifacts, milestones, and activity. The uncovered information is the Dependency and order notes: explicit feature order, declared dependencies, unavailable dependency data, and provisional body-stated relationships. Moving those same facts into the existing default printed view preserves them without new Canvas content or a new report. This repository currently has no declared order or feature dependencies, but its provisional `backlog-canvas` relationship to `backlog-report` must remain visible. Retirement is not accepted merely because the notes are planned. The remaining presentation cost is that these relationship notes are text-only rather than part of a visual report.

Existing project guardrails apply unchanged; no new candidate rule arose. No UI source changes, so no mock is required. Only derived report files are deleted: canonical work records, the historical ledgers and packages, and the frozen continuation export stay unchanged. Reversing retirement would require restoring the removed implementation and derived files, not recovering canonical work data.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-10-15T15:17:05Z - brainstorm: Captured the user's confirmed request to retire the committed backlog report in favor of the Canvas, as decided in 052, with Dude's analysis, coordinator-verified facts, and two open questions for later definition. Capture only, with no package, tasks, mock, or implementation.
- 2026-10-17T01:49:27Z - define: Staged first definition at .dude/specs/085-retire-backlog-report/spec.md with spec, plan, and one proposed open unit T001@f6a0c58a; Ship-authorized definition-owner dispositions retire both report files and preserve their dependency and order notes in the default printed view, without changing user answers. Publication and lint remain with the coordinator.
- 2026-10-17T02:19:58Z - work: Claimed T001@f6a0c58a for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-10-17T05:11:52Z - work: Closed Retire Backlog Report: the one live canonical task, T001@f6a0c58a, is done through autonomous Work in the Ship invocation, settled on its first attempt with fresh independent Tester verification (16 checks passed against a per-file pre-change baseline) and independent Code Reviewer acceptance with no findings. The committed backlog report and its generation, check, and refresh steps are retired; the default printed view now carries the dependency and order notes. Recorded limits: the six-way full-suite run had a Canvas-server failure that passed alone and loads no changed module, and six Canvas dependency-freshness regressions skip on Windows and remain for POSIX CI. The one Rubber Duck retrospective dispatch completed and is recorded in retrospective.md. Nothing is committed; Git delivery awaits the user's decision.

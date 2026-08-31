---
title: Bounded Owner Log Projection
slug: bounded-owner-log-projection
status: defined
spec_path: .dude/specs/029-bounded-owner-log-projection/spec.md
---

# Idea: Bounded Owner Log Projection

## Idea

Now, let's work on the log for the continuity work. We need to address the autonomous Work/continuity failure where a complete append-only `## Coordinator Log` makes the fixed 65,536-byte model evidence packet overflow before or during settlement.

Keep the persisted Coordinator Log complete and append-only. Do not rotate, truncate, rewrite, or move stored history. Bound only the model-facing `owner-log` evidence projection so cumulative log growth cannot consume the whole packet. Keep the fixed packet ceiling and leave enough room for required Tester and Reviewer captures and other evidence.

The bounded projection must preserve deterministic owner identity and an honest binding to the complete stored log. Complete-log metadata and a digest are a likely way to preserve that binding, but the exact projection shape, byte allocation, and selection policy belong to definition. Handle a newest oversized entry explicitly and fail closed rather than silently pretending omitted history was inspected.

Keep the solution pragmatic and simple. Use the current log structure as a whole where practical, and avoid speculative Markdown machinery when a simpler deterministic bound satisfies the actual call graph. Do not increase the global limit or add compression, multi-batch analysis, a new store, checkpoint, archive, cross-session state, configuration surface, compatibility path, or runtime migration.

Direct call-graph review found no deterministic authority path that needs all historical log prose. Owner authority comes from frontmatter and complete owner captures, definition recovery separately retains owner bytes, and learning, current-run, review, and verification paths use structured evidence. The model-visible history may therefore be narrowed honestly, with no claim that omitted history was inspected.

Use the existing large logs as regression inputs: Feature 028 has an `owner-log` around 55 KB, and `remove-legacy-compatibility` has a log around 124 KB with 405 entries.

This deliberately changes Feature 004's complete-admitted-text/no-truncation contract and Feature 009's incident `owner-log` binding. It requires a new explicit feature definition rather than an opportunistic patch. A previous independent review rejected an arbitrary fixed 16 KiB recommendation as unjustified, so preserve the desired bounded outcome and simplicity constraint without prematurely fixing that number or a maximal-suffix algorithm.

## Open Questions

No outcome-changing question remains for brainstorm capture. Definition may choose the narrowest deterministic projection policy supported by the current topology and acceptance evidence.

## Assumptions

- The user wants implementation to follow explicit definition now.
- No Beads import was requested, so later execution defaults to Lightweight Execution.

<!-- dude:managed:start -->
## Normalized Intent

- Keep every owner ledger and extracted Coordinator Log complete and append-only while bounding only the model-facing `owner-log` evidence body.
- Recompute one exact projection for every fresh Inspection from the other evidence currently present; use no fixed owner-log budget or speculative reservation.
- Preserve the fixed 16-item and 65,536-byte packet limits.
- Project owner identity, complete-log binding metadata, and the largest chronological suffix of whole events that fits the exact canonical packet.
- Count only top-level dated Coordinator Log events; keep multiline and Unicode event content whole and treat managed comments as framing.
- Always retain the newest event when an owner projection can be admitted; otherwise use the existing descriptor-only fail-closed overflow behavior.
- Keep deterministic owner resolution, complete definition-recovery capture, and structured learning, current-run, review, and verification authority unchanged.
- Bind Feature 007/Feature 009 incident prestate to the complete-log digest rather than the visible event suffix.
- Use the existing Feature 028 and 405-event owner ledgers as immutable regression inputs and exercise fresh settlement through the actual host capture path.
- Supersede only the affected current Feature 004 complete-owner-log packet clause and Feature 009 incident binding behavior; preserve their remaining safety contracts and historical artifacts.

## Constraints

- Do not truncate, rotate, rewrite, archive, move, compress, batch, or migrate stored Coordinator Log history.
- Add no configuration, fixed reservation, generic budgeting framework, renderer registry, store, checkpoint, cross-session state, or compatibility parser.
- Select against exact canonical packet bytes, including escaping and evidence descriptors, rather than raw log size.
- Admit only one exact current `owner-log` body shape; do not support the superseded complete-text shape in parallel.
- Preserve the owner-log EvidenceItem descriptor as the binding for the complete projected body; carry complete-log binding inside that body.
- Keep `.github/skills/dude-work/**` generated from `src/` through `build-dev`; never hand-edit generated core.
- Do not rewrite Feature 004, Feature 009, either oversized regression ledger, or any other historical idea or specification.
- Create only the lean core trio for this definition; add no supporting artifact, task-state change, backlog change, profile change, board mutation, or generated output.

## Definition Checklist

- [x] User-controlled Idea, Open Questions, and Assumptions are preserved byte-for-byte
- [x] Prospective owner is exactly `.dude/ideas/bounded-owner-log-projection.md`
- [x] Exact prospective specification path is `.dude/specs/029-bounded-owner-log-projection/spec.md`
- [x] Direct-idea preflight found no competing owner or identity collision
- [x] Package number 029 follows the existing maximum prefix 028
- [x] No outcome-changing open question or clarification marker remains
- [x] Existing YAGNI and safety guardrails are sufficient; no new checkpoint is needed
- [x] Technology-agnostic specification has three independently testable stories, fourteen functional requirements, and ten measurable success criteria
- [x] Plan selects the verified current recovery topology, one exact body shape, and exact fresh-packet fitting
- [x] Three sequential all-open task units cover runtime, real settlement integration, and final acceptance
- [x] No supporting artifact materially applies

## Coordinator Log

- 2026-08-10 UTC - brainstorm captured
- 2026-08-10 UTC - first definition staged for .dude/specs/029-bounded-owner-log-projection/spec.md
- 2026-08-10 23:17 UTC - definition published atomically with zero lint failures and T001@70726f6a claimed as the first ready unit: implementation is limited to `src/skills/dude-work/recovery.mjs` and its focused tests, replacing the complete-text model body with the exact closed owner-log projection, parsing whole dated Coordinator Log events, selecting the maximal chronological suffix against each fresh canonical packet, retaining the newest event or existing descriptor-only overflow, routing every direct consumer through one validator, and binding Feature 007 incident prestate to `fullLogSha256`; the live authority is `.dude/specs/029-bounded-owner-log-projection/tasks.md`, execution runs in the guarded Lightweight lane because autonomous settlement is exactly the defect under repair, and both oversized owner ledgers remain read-only regression inputs
- 2026-08-11 00:02 UTC - T001@70726f6a closed and T002@73657474 claimed: `recovery.mjs` now emits the exact closed owner-log body with complete-log digest, byte length, event counts, ordinal range, and a maximal chronological suffix selected against each fresh canonical packet, whole dated events survive Unicode and multiline content while headings and managed comments stay framing, oversized-newest and non-owner overflow keep the descriptor-only fail-closed path, every direct consumer shares one validator, and Feature 007 incident prestate binds `fullLogSha256`; the Feature 028 ledger projected 40 of 45 events at 64,024 bytes and the 405-event ledger 118 events at 65,410 bytes with both files byte-unchanged, recovery tests moved from 157 pass/225 fail to 389 pass/0 fail, a mechanical date prefix repaired 49 undated `atomic-file-batch` fixture literals to 99 pass/0 fail, and independent review approved readiness; the 35 residual failures are the T002-owned undated `host-adapter.test.mjs` fixture and the intentionally stale generated bundle
- 2026-08-11 00:29 UTC - T002@73657474 closed and T003@61637074 claimed: the shared host-adapter fixture now carries a dated owner event, a new regression drives real `runHostAdapter` settlement through the production attestation and safety-writer path with two materially different Tester and Reviewer capture sizes, proving post-capture Inspection rebuilding, strict suffix shrinkage, exact maximality, packets within the ceiling, and byte-identical owner content; guidance in the Work skill and the command, reference, and workflow documents now separates complete non-owner evidence from bounded owner history and names omitted events as uninspected, contract assertions pin the exact body, sole validator, absent compatibility read, and generated parity, and `build-dev` refreshed only the two intended generated `dude-work` files with an identical second-build hash; the host-adapter suite moved from 35 failures to 98 pass, scripts reached 122 pass, the full source suite reached 1868 pass with zero failures after the coordinator regenerated the backlog, and independent review approved both implementation and prose
- 2026-08-11 00:50 UTC - T003@61637074 closed and Feature 029 reached full task completion: the recursive suite passed 2274 of 2278 with zero failures and four skips, build-dev ran twice with zero workspace drift against snapshot 69c4c1da63372e4faf5ec5ae0380599765b3f84401c7c6a974b058ad3f56d1ab, lint reported zero findings, compose verified 16 packs with zero failures and leftovers, a 64-file release lint passed, maximality was independently confirmed at 56,106 selected bytes against a 74,169-byte next candidate, descriptor-only overflow and real production settlement reachability held, five consumer routes shared the closed validator, incident prestate bound the complete digest, and all Feature 004, Feature 009, Feature 028, and oversized-ledger bytes stayed unchanged; two undated fixture regressions in the Beads pack and the stale coordinator backlog were repaired mechanically without weakening any assertion; independent review approved and recorded one honest residual limitation, that only `owner-log` growth is bounded while complete `task-history`, `lane-history`, and other non-owner evidence can still independently exceed the item or byte ceiling and produce descriptor-only overflow, with the 405-event `remove-legacy-compatibility` target as the current concrete example and any further bounding reserved for a separate follow-up
<!-- dude:managed:end -->

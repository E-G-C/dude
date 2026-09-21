# Retrospective: Canvas Without Beads

## 2026-09-21T03:21:53.687Z — Ship completion

Target: `.dude/specs/066-canvas-without-beads/spec.md`, task `T001@c066b7a1`.
Owner: `.dude/ideas/066-canvas-without-beads.md`.
Dispatch outcome: `completed`; one read-only Rubber Duck Retrospective dispatch.

### What worked

- Real default-process `ENOENT` coverage verified source/generated Lightweight behavior without substituting an injected empty board.
- The first failed attempt and review finding remained auditable. The focused readiness-failure correction gained six source/generated regression cases.
- Independent evidence distinguished 117 passing focused tests from four reproduced baseline documentation failures. Bounded generation and preservation audits avoided unrelated cleanup.

### Advisory: Major

The advisor identified another possible loss of known tracked authority during final validation. After a populated first list, a failed final list revalidation can enter `completeProjection`, clear sources, and retain `authority: 'tracked'` only for readiness failures. A subsequent missing-executable or exact-no-database refresh could then admit a markdown mirror as current Lightweight work.

Recommended follow-up: preserve already-established tracked authority in failed final-validation results using the existing authority field, and extend the current `finalFailures` cases through refresh with a successful-`[]` positive control.

Evidence cited by the advisor: `completeProjection`, `failedProjection`, `refreshNowProjection`, and `queryTrackedIssues` in `src/extensions/dude/lib/projection.mjs` and its generated counterpart, plus `finalFailures` in `src/extensions/dude/work-index.test.mjs`.

This is read-only source analysis, not an executed reproduction. It remains advisory and unaddressed in this completion; it created no task, approval gate, or additional review. No other advisory issues were reported.

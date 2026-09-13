---
name: "dude-verification-before-completion"
description: "Use before any completion, fixed, passing, ready, task-done, tracked-close, committed, pushed, or merged claim."
---

# Verification Before Completion

## Purpose

Support each completion or delivery claim with fresh evidence that reaches the
boundary relevant to that claim.

No completion claim without fresh verification evidence.

## Gate

1. Identify the exact claim and its relevant production boundary, such as the
   actual receiver, runtime, renderer, transport, or delivery surface. Exercise
   that boundary when available. A same-engine, mock, or proxy check proves only
   its own path unless equivalence is separately established.
2. Run it now; prior output and specialist self-report are not fresh evidence.
3. Read the complete result, exit code, and failure count.
4. When verifying a fix, isolate the expected failure. A negative oracle is
   confounded if a stale or invalid companion input, or an earlier guard, can
   make it fail first. Keep unrelated inputs valid, then use a focused negative
   or temporary mutation when needed to prove the regression check detects
   removal of the fix for the intended reason. This is targeted evidence, not a
   universal mutation-coverage requirement; never weaken an invariant merely to
   make a test reach a branch.
5. Before submitting a structured result, use the actual receiver's existing
   validator when accessible against the exact payload. Check its schema and
   bounds, and verify that the authorized file scope includes every legitimately
   changed file without silently broadening authority.
6. Preserve every obligation when grouping evidence. Do not omit a required
   check or changed file, collapse distinct obligations to fit a limit, or
   truncate a result. If the validator is inaccessible or the complete result
   cannot fit an existing receiver limit, report the specific validator,
   capacity, obligation, or file-scope gap. The gap grants no recovery authority
   and does not permit a schema or runtime-limit change or bypass an existing
   stop.
7. Match the claim to the evidence scope. Partial checks support only partial
   claims. Distinguish `implemented` and `verified` from `committed`, `pushed`,
   and `merged`; each delivery claim requires its own observed repository or
   remote evidence.
8. Report the observed result. If it failed, report failure rather than
   smoothing it over.

Fresh evidence is required before `[x]`. Fresh evidence is required before `bd close`. Implementation, review, or an earlier green run alone cannot authorize either mutation.

Return the check used, observed result, supported claim, and any residual gap.
The coordinator's existing completion closeout owns the full response format;
do not create another closeout here.

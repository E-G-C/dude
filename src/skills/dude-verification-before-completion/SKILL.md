---
name: "dude-verification-before-completion"
description: "Use before any completion, fixed, passing, ready, task-done, or tracked-close claim."
---

# Verification Before Completion

No completion claim without fresh verification evidence.

## Gate

1. Identify the command or behavior check that proves the exact claim.
2. Run it now; prior output and specialist self-report are not fresh evidence.
3. Read the complete result, exit code, and failure count.
4. Match the claim to the evidence scope. Partial checks support only partial claims.
5. Report the observed result. If it failed, report failure rather than smoothing it over.

Fresh evidence is required before `[x]`. Fresh evidence is required before `bd close`. Implementation, review, or an earlier green run alone cannot authorize either mutation.

Return the check used, observed result, supported claim, and any residual gap.

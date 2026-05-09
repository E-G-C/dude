---
name: verification-before-completion
description: "Use when about to say work is complete, fixed, passing, or ready, especially before closing a Beads issue or reporting success."
---

# Verification Before Completion

## Purpose

Require fresh evidence before any success claim.

## Iron Law

No completion claim without fresh verification evidence.

## Gate

Before saying a task is done, a fix works, or tests pass:

1. Identify the command or check that proves the claim.
2. Run it now.
3. Read the output fully, including the exit code or failure count.
4. State the actual result, not the hoped-for result.
5. Only then make the completion claim or close the Beads issue.

## Applies To

- "tests pass"
- "build succeeds"
- "bug fixed"
- "review findings addressed"
- "ready to close"
- "ready to merge"

## Guardrails

- Previous successful output does not count.
- Partial verification does not justify a broader claim.
- Specialist self-report does not replace independent verification.
- If verification fails, report the failure state with evidence instead of smoothing it over.
- If Beads is in use, do not close the issue until the relevant verification has been run.

## Return Pattern

State:

- what was verified
- the exact command or check used
- the observed result
- whether the claim is supported

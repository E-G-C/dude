---
name: "dude-systematic-debugging"
description: "Use when encountering a bug, failing test, unexpected behavior, or repeated unsuccessful fixes, before proposing or implementing a change."
---

# Systematic Debugging

## Purpose

Find root cause before changing code.

## Iron Law

No fixes without root cause investigation first.

## Workflow

1. Reproduce the issue.
   - Identify the exact failing behavior, command, or scenario.
   - If it is not reproducible, gather more data instead of guessing.
2. Gather evidence.
   - Read errors completely.
   - Note file paths, line numbers, stack traces, and exit codes.
   - Check recent changes, config differences, and boundary inputs when multiple components are involved.
3. Compare against a working pattern.
   - Find a similar working path in the codebase or reference docs.
   - List concrete differences between the working and broken paths.
4. Form one hypothesis.
   - State the suspected root cause clearly.
   - Test the smallest possible change or experiment that can confirm or reject it.
5. Fix the source, not the symptom.
   - Identify or create a failing verification path.
   - Make one focused fix.
   - Re-run the verification.
6. Escalate if the pattern is not converging.
   - If two focused fix attempts fail, stop stacking patches and re-check assumptions, architecture, or task decomposition.

## Guardrails

- Do not bundle multiple speculative fixes together.
- Do not call a cause "obvious" without evidence.
- Do not hide uncertainty behind retries, sleeps, or broader conditionals unless the evidence supports them.
- Do not claim the issue is fixed without running fresh verification; use `dude-verification-before-completion`.
- If multiple failures are truly independent, use `dude-parallel-dispatch` only after confirming they do not share a root cause.

## Useful Outputs

Return:

- reproduction steps
- evidence gathered
- suspected root cause
- smallest next experiment or fix

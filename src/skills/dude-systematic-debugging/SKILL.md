---
name: "dude-systematic-debugging"
description: "Use when encountering a bug, failing test, intermittent or environment-sensitive behavior, suite-only failure, or repeated unsuccessful fixes, before proposing or implementing a change."
---

# Systematic Debugging

## Purpose

Find root cause before changing code.

## Iron Law

No fixes without root cause investigation first.

## Workflow

1. Reproduce the issue.
   - Identify the exact failing behavior, command, or scenario.
   - Record the actual runtime or platform, boundary inputs, and input sequence
     when they can affect the result.
   - If it is not reproducible, gather more data instead of guessing.
   - A synthetic reproduction can establish a mechanism, but does not identify
     a specific historic user incident without incident-bound evidence.
2. Gather evidence.
   - Read errors completely.
   - Note file paths, line numbers, stack traces, and exit codes.
   - Check recent changes, config differences, and boundary inputs when multiple components are involved.
   - Confirm exact input delivery to the intended receiver. For browser or UI
     automation, distinguish a responsive control channel from a progressing
     target frame; inspect the frame's focus, visibility, occlusion, and
     timeline state when relevant.
3. Compare against a working pattern.
   - Find a similar working path in the codebase or reference docs.
   - List concrete differences between the working and broken paths.
   - Make controlled comparisons in the relevant runtime and vary one material
     factor at a time. An isolated pass, retry, or pass in another runtime is a
     data point, not a control.
4. Form one hypothesis.
   - State the suspected root cause clearly.
   - Test the smallest possible change or experiment that can confirm or reject it.
5. Fix the source, not the symptom.
   - Identify or create a failing verification path.
   - Fix the cause established by the experiment, with scope no broader than the
     evidence supports.
   - Re-run the verification.
6. Escalate if the pattern is not converging.
   - If two focused fix attempts fail, stop stacking patches and re-check assumptions, architecture, or task decomposition.

## Guardrails

- Do not bundle multiple speculative fixes together.
- Do not call a cause "obvious" without evidence.
- Do not call a failure "flaky" or "environmental" from isolated passes. Require
  a repeatable controlled difference tied to the proposed cause.
- Do not hide uncertainty behind retries, sleeps, or broader conditionals unless the evidence supports them.
- Do not claim the issue is fixed without running fresh verification; use `dude-verification-before-completion`.
- If multiple failures are truly independent, use `dude-parallel-dispatch` only after confirming they do not share a root cause.

## Useful Outputs

Return:

- reproduction steps
- evidence gathered
- suspected root cause
- smallest next experiment or fix

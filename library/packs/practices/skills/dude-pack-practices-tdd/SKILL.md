---
name: "dude-pack-practices-tdd"
description: "Use when implementing a feature or bugfix with a tests-first workflow, especially when the user requests TDD or a bugfix needs a regression-first fix."
---

# Test-Driven Development

## Purpose

Use a tests-first workflow when the project or user wants stronger implementation rigor.

## Status In Dude

This skill is optional, not mandatory.

Use it when:

- the user explicitly asks for TDD or tests-first work
- the project already follows a strong tests-first culture
- a bugfix benefits from proving the regression before touching implementation

Do not force it when:

- the user explicitly wants a lighter workflow
- the change is primarily documentation, configuration, or non-executable definition work

## Core Cycle

1. Write one failing test for the next behavior.
2. Run it and confirm it fails for the expected reason.
3. Write the smallest implementation change that can make it pass.
4. Run the test again and confirm it passes.
5. Refactor only while keeping the test green.
6. Repeat for the next behavior.

## Bugfix Pattern

For bugfixes:

1. Reproduce the bug first.
2. Add or identify a regression test that fails because of the bug.
3. Fix the underlying cause.
4. Re-run the regression test and broader verification.

Pair this with `dude-systematic-debugging` when the root cause is not yet clear.

## Guardrails

- Do not call it TDD if the test was written only after the implementation was already finished.
- Do not keep expanding scope while trying to get to green.
- Do not skip the failing-test step unless the user explicitly overrode tests-first discipline.
- Do not apply this skill to feature-definition artifacts under `.dude/specs/<feature>/`.

## Return Pattern

State:

- failing test added or identified
- implementation change made
- verification run after green
- residual gaps or follow-up tests

---
name: practices
description: "Engineering-practice workflows. Currently: tests-first (TDD) implementation discipline."
provides:
  agents: []
  skills: [dude-pack-practices-tdd]
hooks:
  - definition-exception
---

# Practices Pack

Optional engineering-practice workflows that some teams want as a default
discipline.

## Provides

- `dude-pack-practices-tdd` — tests-first (red / green / refactor)
  implementation and regression-first bugfixing.

## When installed

The coordinator may load `dude-pack-practices-tdd` for tests-first work when the
user requests it, project conventions require it, or a bugfix benefits from a
regression-first workflow.

## Install / remove

```bash
@dude add pack practices
@dude remove pack practices
```

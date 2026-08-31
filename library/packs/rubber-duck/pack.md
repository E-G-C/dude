---
name: rubber-duck
description: "Read-only, non-authoritative retrospective for successful feature and Ship completion."
use-cases: [retrospective]
provides:
  agents:
    - dude-pack-rubber-duck-retrospective
  skills: []
requires:
  tools: []
hooks: []
---

# Rubber Duck Pack

Adds one optional, read-only retrospective teammate for a successful feature or
explicit Ship feature completion. It has no external dependencies and ships no
skills.

## Provides

- `dude-pack-rubber-duck-retrospective` — returns concise advisory observations
  after final Reviewer approval and before the coordinator closes an eligible
  feature or Ship completion.

## When installed

The coordinator may use the provided agent only once as the final agent dispatch
for an eligible successful feature or Ship completion. The agent's observations
are advisory, not review verdicts or close authority. The coordinator alone may
persist them at `.dude/specs/<NNN>-<slug>/retrospective.md`; the agent never
writes that artifact.

The agent does not run for ordinary task closes, successful release runs, or
failed, blocked, cancelled, or abandoned endings. `hooks: []` is inert manifest
metadata only; it is never an activation mechanism.

## Install / remove

```bash
@dude add pack rubber-duck
@dude remove pack rubber-duck
```

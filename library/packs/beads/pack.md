---
name: beads
description: "Tracked execution via Beads — a live issue board with import, claim/close, and a one-way mirror back to tasks.md."
provides:
  agents: []
  skills: [dude-pack-beads-workflow, dude-pack-beads-spec-import]
requires:
  tools: [bd]
hooks:
  - execution-lane
  - definition-exception
---

# Beads Pack

Adds **Tracked Execution**: a Beads-backed live board as an alternative to the
core `tasks.md` Lightweight Execution lane.

## Provides

- `dude-pack-beads-workflow` — claim / execute / close discipline, the ready
  loop, and the one-way Beads → `tasks.md` mirror.
- `dude-pack-beads-spec-import` — the Import Algorithm that converts a defined
  `specs/<feature>/tasks.md` into Beads issues, with canonical-identity mapping.

## Requires

- The `bd` (Beads) CLI on PATH. On Windows, prefer Dolt server mode for `bd init`
  rather than retrying embedded-Dolt after a CGO failure.

## When installed

`@dude track` becomes the handoff into Beads. The coordinator loads the pack's
tracked-execution skills for import, claiming, dispatch, close, and mirror. When
the pack is absent, the core default is Lightweight Execution from
`specs/<feature>/tasks.md`.

## Install / remove

```bash
@dude add pack beads
@dude remove pack beads
```

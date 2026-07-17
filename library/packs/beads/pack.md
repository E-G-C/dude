---
name: beads
description: "Current-only tracked execution via Beads for canonical .dude/specs features, with exact-owner import, Beads-authoritative work, and a one-way tasks.md mirror."
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

Adds **Tracked Execution** for current-format packages at
`.dude/specs/<feature>/`.

## Provides

- `dude-pack-beads-workflow` — claim / execute / close discipline, the ready
  loop, and the one-way Beads → `tasks.md` mirror. The mirror accepts only the
  supported executable status set (`open`, the in-progress spellings, `blocked`,
  `closed`, `done`) and rejects every other executable status — `deferred` on a
  non-epic issue, `paused`, any future or unknown value, or a missing status —
  before any dry-run report or write, naming the issue id, task key, and
  normalized status and leaving `tasks.md` and its owner ledger unchanged.
- `dude-pack-beads-spec-import` — the Import Algorithm that converts a defined
  `.dude/specs/<feature>/tasks.md` into Beads issues, with canonical-identity mapping.

## Requires

- The `bd` (Beads) CLI on PATH. On Windows, prefer Dolt server mode for `bd init`
  rather than retrying embedded-Dolt after a CGO failure.

## Tracking a feature

`@dude track` accepts only a package owned by exactly one defined flat
`.dude/ideas/*.md` ledger whose exact `spec_path` points to that package. It
does not translate retired paths or identities.

After `@dude track` imports or resumes the feature, Tracked Execution is the
active lane. Beads is the sole live board and authority for readiness, state,
and completion. `tasks.md` remains reference and portability evidence and may
receive only one-way, non-authoritative Beads-derived mirror updates.

Exact-owner validation is fail-closed; resolver implementation changes may
replace only the mechanism, never the ownership semantics.

## Install / remove

```bash
@dude add pack beads
@dude remove pack beads
```

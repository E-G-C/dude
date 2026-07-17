---
name: "dude-engine"
description: "Internal engine library shared by dude-lint and dude-bundle-upgrade (namespace/ownership classification for the core/pack/local tiers). This is engine plumbing, not a user-facing workflow skill — do not load it to perform project work."
---

# Dude Engine (internal)

This skill directory is a home for shared Node engine code used by the
maintenance tools `dude-lint` and `dude-bundle-upgrade`. It exists as a skill
directory only so the shared library has a base-owned location that satisfies
bundle linting (every `.github/skills/<dir>/` must contain a `SKILL.md`).

It is **not** a workflow skill. The coordinator should never load it to handle a
user request; routing and execution behavior live in the other `dude-*` skills.

## Contents

- `lib/ownership.mjs` — namespace/ownership classifier. Maps any repo-relative
  path to one of three engine tiers:
  - **core** — upstream-owned base files (`dude.agent.md`,
    `dude-<slug>.agent.md`, `dude-<slug>/**` skills, `dude.instructions.md`).
  - **pack** — installed capability packs (`dude-pack-<pack>-*`).
  - **local** — project-owned customizations (`dude-local-*`).
  - everything else classifies as **project** (never overwritten by upgrade).
- `lib/feature.mjs` — read-only canonical feature inventory and owner
  resolution. Call `inventoryDefinedFeatures({ root })` to inspect all direct
  `.dude/ideas/*.md` ledgers, or `resolveFeatureOwner({ root, specPath })` to
  require one exact, globally unambiguous defined owner. Both APIs return
  structured diagnostics and never mutate project state.
- `feature.mjs` — thin JSON CLI over that library:
  `inventory --root <path> --json` and
  `resolve --root <path> --spec <specPath> --json`.

## Feature Boundary

Feature inventory is a mechanical, read-only engine boundary. It validates
canonical identity and filesystem safety but does not mutate ledgers, allocate
feature names or numbers, route work, approve readiness, or infer ownership
from filenames and directory names. Consumers must import `lib/feature.mjs`
directly; the CLI adds argument parsing and JSON output only.

## Runtime

These scripts target Node.js (>= 20 LTS). Node is a documented maintenance-time
dependency: it is only required to run `dude-lint` and `dude-bundle-upgrade`,
not for normal project work.

## Tests

```bash
node --test .github/skills/dude-engine/lib/
```

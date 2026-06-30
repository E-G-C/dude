---
name: release
description: "Release engineering specialist + skills for tag-driven versioning, GitHub Actions / Azure Pipelines parity, and protected-branch version write-back."
provides:
  agents: [dude-pack-release-manager]
  skills:
    - dude-pack-release-tag-driven-versioning
    - dude-pack-release-pipeline-parity
    - dude-pack-release-writeback-via-pr
routing_hints:
  release: "@dude-pack-release-manager"
  versioning: "@dude-pack-release-manager"
  pipeline: "@dude-pack-release-manager"
hooks:
  - routing
---

# Release Pack

Adds a release-engineering specialist and its reference skills for projects that
ship versioned releases.

## Provides

- `@dude-pack-release-manager` — the release specialist agent.
- `dude-pack-release-tag-driven-versioning` — keep `package.json` in sync with a
  git tag; when a version bump must be manual.
- `dude-pack-release-pipeline-parity` — keep GitHub Actions and Azure Pipelines
  release behavior identical (version normalization, asset upload, publish).
- `dude-pack-release-writeback-via-pr` — sync version files back to a protected
  default branch when a direct workflow push is blocked.

## When installed

Release, versioning, and pipeline-parity requests route to
`@dude-pack-release-manager`, which loads the reference skills as needed.

## Install / remove

```bash
@dude add pack release
@dude remove pack release
```

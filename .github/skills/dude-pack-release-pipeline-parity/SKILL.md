---
name: "dude-pack-release-pipeline-parity"
description: "Use when GitHub Actions and Azure Pipelines should behave the same for releases, when one pipeline normalizes versions or publishes assets differently than another, or when comparing release packaging, signing, asset upload, and publish behavior across release systems."
---

## Purpose

Keep parallel release systems behaviorally aligned without forcing line-by-line YAML duplication.

## Workflow

1. Map the release sequence in each system:
   - trigger conditions
   - checkout and dependency install
   - validation gates
   - version normalization
   - packaging and signing
   - artifact filtering and publication
   - optional write-back to the repository
2. Compare the outputs and release semantics, not just the YAML shape.
3. Identify mismatches that materially change the release result:
   - one pipeline derives version from the tag and another does not
   - asset filters publish different files
   - signing happens at a different stage with different consequences
   - one pipeline mutates repository state and the other only mutates the runner workspace
4. Normalize behavior at the narrowest layer that fixes the mismatch.
5. Preserve intentional divergence only when it is documented and justified.
6. Validate one focused release slice after the change, such as workflow syntax, a tag-derived version step, or artifact selection.

## Rules

- Prefer a shared source of truth such as the git tag for release versioning.
- Treat permissions, token scope, and branch protection as first-class release constraints.
- Explain workflow-local mutation versus committed repo state whenever version sync is involved.
- Keep asset selection equivalent unless a specific release channel intentionally differs.
- Do not chase line-for-line parity when the systems have different mechanics but the same outcome.

## Parity Checklist

- tag trigger pattern matches the intended release policy
- version derivation strips the leading `v` consistently
- release packaging reads the normalized package version
- signing occurs at the correct stage for the platform
- published assets match the intended release files
- release title and tag naming are consistent
- repo write-back behavior is explicit and validated

## Anti-Patterns

- assuming matching file names mean matching release behavior
- fixing only the publish step while leaving version derivation inconsistent
- adding a bot push-back step without checking branch-protection policy
- documenting parity informally while the workflows continue to diverge
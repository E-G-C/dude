---
name: "dude-pack-release-tag-driven-versioning"
description: "Use when a release is triggered from a git tag, when `package.json` should match the tag version, when deciding whether a version bump must be manual, or when implementing tag-based version sync in GitHub Actions or Azure Pipelines."
---

## Purpose

Make tag-driven releases produce the correct package version and make the persistence model explicit.

## Workflow

1. Decide which problem needs solving:
   - build artifacts need the right version during the release job
   - the repository must also persist the new version after the release finishes
2. Treat the release tag as the source of truth in tag-driven flows.
3. Derive the package version from the tag by stripping a leading `v` and validating that a non-empty version remains.
4. Before packaging, set the package version with:

   ```bash
   npm version <version> --no-git-tag-version --allow-same-version
   ```

   In this repo's GitHub Actions and Azure Pipelines, the same step is expressed in PowerShell:

   ```pwsh
   $version = $env:RELEASE_TAG -replace '^v', ''

   if (-not $version) {
     throw "Unable to derive a package version from tag '$env:RELEASE_TAG'."
   }

   npm version $version --no-git-tag-version --allow-same-version
   ```

5. Explain the behavior clearly:
   - this updates `package.json` and `package-lock.json` in the runner workspace
   - it fixes the version embedded in the release build
   - it does not update the repository unless a later commit or PR writes those files back
6. If persistent repo sync is required, add a follow-up step or job that:
   - checks out the target branch
   - reruns the same `npm version` command from the release tag
   - stages `package.json` and `package-lock.json` together
   - commits or opens a PR according to repository policy
7. Validate the narrowest release slice available:
   - workflow syntax
   - manifest files changed as expected
   - release packaging still runs from the normalized version

## Rules

- Never update only `package.json` when `package-lock.json` is tracked.
- Prefer tag-derived versioning over manual pre-bumps for tag-triggered release automation.
- Keep GitHub Actions and Azure Pipelines semantically aligned when both publish the same release.
- If branch protection blocks workflow pushes, prefer a PR-based sync instead of weakening protections.
- Be explicit about the difference between build-time mutation and committed repository state.

## Decision Guide

- "Do I need to bump manually?" No, not for the release artifact, if the workflow normalizes version from the tag before packaging.
- "Do I need the repo files to change too?" Yes, add a write-back commit or PR step after the release succeeds.
- "Which files should be updated?" `package.json` and `package-lock.json` together.

## Common Pitfalls

- Normalizing the version in Azure Pipelines but not in GitHub Actions, or vice versa
- Assuming `npm version --no-git-tag-version` persists changes after the workflow ends
- Forgetting that branch protection may block an automated push-back step
- Updating release artifacts correctly but leaving the default branch on the old version
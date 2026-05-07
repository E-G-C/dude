---
name: "release-writeback-via-pr"
description: "Use when a release workflow needs to sync `package.json` and `package-lock.json` back to a protected default branch, when a direct workflow push is blocked by branch protection, or when choosing between a direct push and a pull-request-based version write-back."
---

## Purpose

Provide a safe write-back path for tag-driven release version sync when the default branch cannot accept a direct workflow push.

## When To Use

- branch protection on the default branch blocks the workflow token
- repository policy requires PR review for any change to `package.json`
- the release pipeline previously failed at the push step with a permissions or required-status-check error

## Workflow

1. Confirm the direct push path is actually blocked. Do not switch to PR mode preemptively if the simpler push works.
2. In the write-back job, after running `npm version <version> --no-git-tag-version --allow-same-version`:
   - create a short-lived branch named for the release tag, for example `release/sync-<version>`
   - commit `package.json` and `package-lock.json` together
   - push the branch
   - open a PR against the default branch with a clear title and body
3. Use the GitHub CLI from inside the workflow:

   ```pwsh
   git checkout -b "release/sync-$version"
   git add package.json package-lock.json
   git commit -m "chore: sync package version to $version"
   git push origin "release/sync-$version"

   gh pr create `
     --base $env:DEFAULT_BRANCH `
     --head "release/sync-$version" `
     --title "chore: sync package version to $version" `
     --body  "Automated version sync after release tag $env:RELEASE_TAG."
   ```

4. Decide auto-merge policy explicitly:
   - if branch protection allows it and the team accepts auto-merge, enable it with `gh pr merge --auto --squash`
   - otherwise leave the PR for human review and surface the PR URL in the workflow log
5. Validate the narrowest slice:
   - workflow syntax
   - PR is created on a real test tag
   - PR contains exactly `package.json` and `package-lock.json`

## Rules

- Never weaken branch protection to make a release workflow pass.
- Always update `package.json` and `package-lock.json` in the same commit.
- Use a deterministic branch name derived from the version so retries are idempotent.
- Do not open a new PR if an open PR for the same release branch already exists; update it instead.
- Keep the PR scope limited to version sync; do not bundle unrelated changes.
- Record the chosen path (direct push vs PR) in the release pipeline so future contributors know which mode this repo uses.

## Decision Guide

- "Push works and is allowed?" Use direct push from `tag-driven-release-versioning`.
- "Push is blocked by protection?" Use this PR path.
- "Team requires review of every version bump?" Use this PR path even if push would succeed.

## Common Pitfalls

- Falling back to PR mode without first checking why the direct push failed
- Creating a fresh branch on every retry instead of reusing or updating the existing one
- Forgetting to grant the workflow `pull-requests: write` in addition to `contents: write`
- Letting the PR sit indefinitely so the default branch keeps drifting from the released version

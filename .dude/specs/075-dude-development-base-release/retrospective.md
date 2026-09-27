# Retrospective: Dude Development Base Release

## 2026-09-27T02:59:12Z — Ship completion

Target: `.dude/specs/075-dude-development-base-release/spec.md`

Owner: `.dude/ideas/075-dude-development-base-release.md`

Dispatch outcome: `completed` (`dude-pack-rubber-duck-retrospective`, one advisory dispatch).

No major issues found.

One minor issue: T001's upgrade procedure change broke an existing contract
test (`scripts/current-format-contract.test.mjs`) that neither task's Check
ran. Strong feature-specific results still left this repository-level
regression undetected. The advisor recommends fixing it without weakening
the assertion's coverage, and including consuming contract tests when choosing
verification for future procedure edits.

One suggestion: committed build output now depends on the local tag
inventory, so a newly reachable stable tag can make unchanged source fail the
dev-bundle drift check. The advisor suggests making post-tag record
regeneration an explicit maintainer release step rather than letting a later
unrelated CI failure reveal it.

The advisor noted what worked: the optional record kept the manifest closed,
the unknown-base fallback honest, and About's read local-only; metadata-only
upgrades kept confirmation, no-op, and rollback protections; verification
separated baseline platform failures from new ones; and the autosave race was
reproduced before the shared test helper changed, instead of raising timeouts
or retrying to green. These observations are advisory; they add no approval,
task, revision, or learning-retention decision.

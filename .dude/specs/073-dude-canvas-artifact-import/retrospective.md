# Retrospective: Dude Canvas Artifact Import

## 2026-10-05T03:26:36Z — Ship completion

- Target: Feature 073, `dude-canvas-artifact-import`, `.dude/specs/073-dude-canvas-artifact-import/`
- Dispatch outcome: completed
- The installed-host harness let the shipped owner perform the writes, then checked disk bytes and recorded sources. With the source-substitution regression, this tested the permission-to-result boundary rather than a successful UI message.
- The costliest recoveries exposed shared caller and runtime assumptions. Two boundaries came out of them: upgrade preview and apply both keep ref-only Compose calls, and the Git-home redirect starts only after the CLI bootstrap.
- Minor: after a failed Reload, an installed-only read can restore the retained catalog's "current" coverage and clear the failure notice, so old availability looks freshly verified. Request-time checks limit the mutation risk. Suggested fix: keep the catalog failure notice and stale coverage until discovery succeeds (`use-canvas-data.js`, `retainCatalog` and `adoptPacks`).
- Minor: the cancellation test at `canvas-server.test.mjs:7122` requires an empty scratch folder, although an unconfirmed shutdown deliberately keeps reader roots. The routed test repair should use `assertRetainedRoots` and keep the no-save assertion; it does not resolve the separate Windows descendant-termination risk.

No major issues found.

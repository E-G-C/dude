# Retrospective: Upstream Packs In A Checkout

## 2026-10-14T07:45:42Z — Ship completion

- Target: Feature 084, `upstream-packs-in-checkout`, `.dude/specs/084-upstream-packs-in-checkout/`
- Dispatch outcome: completed
- Worked well: the local-wins read and the commit-pinned install were exercised end to end. Both tasks passed on their first attempt with independent testing and review, private edits stayed protected, and the real-host checks and reproducible builds held. Tracing changed data to its consumers and comparing the full viewport and theme matrix from the start applied the 080 and 083 lessons.
- Suggestion: no test pins that an installed pack keeps its upstream description after a pull, and a mutation of that behavior survived. Add one Reload-before-Refresh assertion with different local and upstream descriptions. Evidence: `src/extensions/dude/canvas-server.test.mjs` and the T001 mutation probe in `files/084-work-6bd52070/T001@d92bcd4b/tester-result.json` in the session state.
- Suggestion: VSC-004 parity evidence should name the two inherited styling exceptions (the full-width Reload button and the borderless notice) in the acceptance summary, without expanding UI scope. Evidence: `.dude/specs/084-upstream-packs-in-checkout/spec.md` and the T002 findings.

No major issues found.

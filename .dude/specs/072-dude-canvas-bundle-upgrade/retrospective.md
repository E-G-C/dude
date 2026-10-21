# Retrospective: Dude Canvas Bundle Upgrade

## 2026-10-21T10:30:22Z — Ship completion

- Target: Feature 072, `dude-canvas-bundle-upgrade`, `.dude/specs/072-dude-canvas-bundle-upgrade/`
- Dispatch outcome: completed
- Worked well: independent review found consequential defects that passing checks missed (T002 passed 16 checks yet had four findings), and refreshed final-byte verification after each in-attempt fix kept the evidence honest. Evidence: the owner Coordinator Log and the T005 Tester record retained outside the workspace.
- Worked well: real installed-host testing proved self-replacement, Applying then Checking, the inert old-session handoff, next-session version reporting, unchanged Git state, and zero model requests, rather than fixture-engine equivalence alone. Evidence: the T003 Tester record.
- Minor: writer sets missed dependencies across task boundaries (callers of the deleted upgrade contract, the engine signal behind the approved Checking state, and a copied test fixture's new import), so three plan-gap interruptions needed cancellation and re-definition, one after expensive verification. Recommended: before freezing writer sets, trace approved states and changed contracts through their producers, callers, generated copies, and fixture-copy dependencies, and include file-permission preservation in replacement invariants.
- Minor: authentication channels surfaced one rejection at a time (SSH, inherited HTTP headers, ambient Negotiate), and two retries kept the same recovery approach until the driver reached a learning review it cannot answer. Recommended: for a boundary failure, settle one explicit transport and authentication policy with its negative-test matrix before another broad recovery attempt, and keep the driver's learning-review limit explicit without disguising repetition.
- Suggestion: PATH and Windows motion-setting differences, and the harness's own 5 ms status polling, cost investigation time; the final required-browser run alone took 58.7 minutes. Recommended: capture and recheck Git and PATH, browser motion preference, and fixture permissions at baseline and final verification; prefer passive, event-driven progress observation; report verification reruns and elapsed time separately from attempt counts.

No major issues found.
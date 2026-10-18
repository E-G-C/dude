# Retrospective: Work Driver In Core

## 2026-10-18T04:08:13Z — Ship completion

- Target: Feature 086, `work-driver`, `.dude/specs/086-work-driver/`
- Dispatch outcome: completed
- Worked well: testing the actual release build and running the cookbook literally made portability and operator usability testable instead of assumed. Worth keeping for future CLI features. Evidence: `src/skills/dude-work/driver.test.mjs:304-452` and the T002 walkthrough.
- Minor: `docs/commands.md:2062-2063` states a blanket 0/1/2 exit contract for engine scripts that the newly listed driver does not follow, so a reader could misclassify a refusal or take a zero-exit cancellation for settlement. Recommended: exempt the driver explicitly, link the cookbook's exit and outcome tables, and cover the exception in the existing documentation contract test.
- Suggestion: a working Windows lane probe stayed outside the suite until review, so passing counts hid required skipped coverage. Promote successful platform probes straight into executable fixtures, report required scenarios by name next to executed and skipped counts, and reuse the isolated `bd.exe` plus preload technique. Evidence: the T001 attempt-1 findings and `src/skills/dude-work/driver.test.mjs:188-213,549-557`.
- Suggestion: reviewer JSON needed a coordinator-side case change before the official validator admitted it. Include the cookbook's rejected-review schema excerpt in reviewer handoffs, and route a preflight refusal back to the emitting specialist while keeping the original. Reuse the existing validation; do not add automatic normalization. Evidence: the T001 review preflight and `src/skills/dude-work/COOKBOOK.md:213-250`.

No major issues found.
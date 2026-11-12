# Retrospective: Terminal Work disposition and fresh admission

## 2026-11-04T02:00:44Z — Ship completion

- Target: Feature 094, `terminal-work-fresh-admission`, `.dude/specs/094-terminal-work-fresh-admission/`
- Dispatch outcome: completed
- Worked well: independent semantic review caught a policy and runtime contradiction (`fence-effect-proof-conflation`) that green contract pins had locked in. Keep reviewing owning prose against the runtime, separately from text pins. Evidence: the T004 attempt-1 Code Reviewer and Reviewer findings.
- Worked well: a frozen copy of the pre-T004 toolchain protected the active self-hosting run, while disposable release-driver journeys exercised the newly generated consumer path. Evidence: the `terminal-work installed:` tests in `src/skills/dude-work/driver.test.mjs` and the T004 Tester records.
- Minor: actual POSIX enforcement of the private retention modes was not observed; only the Windows path ran. This is a coverage gap, not a demonstrated leak. Recommended: run the existing producer-privacy case in ordinary POSIX CI, keeping its permissive-umask and kernel-mode assertions. Evidence: the T005 Tester record.
- Suggestion: abrupt owner loss stays outside supported recovery by design. Archiving T002 and adding successor T005 restored progress but established neither effect settlement nor disposal of the orphan T002 controls. Keep that separation explicit, and never present task replacement as disposal proof or cooperative fencing as crash recovery.
- Suggestion: ask for compact, receiver-valid Tester evidence from the first dispatch. The 33 KB attempt-1 T004 record roughly doubled the next Assessment packet, from 47.9 KB to 98.6 KB. Keep every obligation, count, skip, and limit, drop repeated narrative, and keep exact log references.

No major issues found.

# Retrospective: Work Type Presentation

## 2026-11-02T21:33:24Z — Ship completion

- Target: Feature 067, `work-type-presentation`, `.dude/specs/067-work-type-presentation/`
- Dispatch outcome: completed
- Worked well: separating deterministic checks from installed-host chat observations caught two model-behavior failures that code review alone missed. A held-out vague prompt and a richer report fixture strengthened verification beyond replaying a known example. Explicit abstention rules and a user-visible output rule worked in the sampled chats, whereas telling the model only to "print" the report did not deliver it. Name-by-name comparison with the HEAD baseline and the clean-export proofs for private hunks kept the regression signal intact without widening scope.
- Suggestion: before dispatch, state the comparison boundary of every scope check, meaning the snapshot epoch and the actor whose writes it judges. Compare implementation writes against each challenge's baseline, and account for the runner's own cumulative Work-state writes separately by exact provenance. A cumulative check that mixed the two produced a false failure. Evidence: `.dude/specs/067-work-type-presentation/tasks.md` and row E2b of `files/067-ship-8f6d5508/tester-T001-attempt2.json` in the session state.
- Suggestion: background completion notices did not reliably resume the supervising turn, so finished specialist results sat unread until the user asked for status. Keep a roster of outstanding dispatches, wait through the supported blocking mechanism, and read completed results before yielding, treating notices as supplementary. Evidence: the coordinator's timing account and the completed result files in `files/067-ship-8f6d5508/`; no notice-delivery log was available, so this concerns supervision, not a diagnosed notification defect.

No major issues found.

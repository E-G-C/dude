# Retrospective: Dude Canvas Settings

## 2026-09-23T14:31:44Z — Ship completion

- Target: `.dude/specs/063-dude-canvas-settings/spec.md` (owner `.dude/ideas/063-dude-canvas-settings.md`), completing T006@f8c2e5a7 and the feature.
- Dispatch outcome: completed
- Observations (advisory):
  - No major or minor issues observed. The Settings request/acknowledgment boundary held, HEAD-versus-candidate diagnosis isolated the regression, review caught a misleading cleanup verdict, and the evidence limits (macOS unverified, embedded desktop panel not covered) stayed explicit.
  - Suggestion: map each required acceptance case to an observed host, SDK/CLI, browser, and prerequisite during planning, so unavailable execution paths surface before integrated acceptance.
  - Suggestion: in count-sensitive browser tests, establish observable save completion or fixture quiescence before measuring the action under test, rather than fixed delays or weakened counts.
  - Suggestion: keep the injected cleanup-fault cases as repeatable falsifiers for later installed-host driver changes, asserting both the reported result and the process exit status.

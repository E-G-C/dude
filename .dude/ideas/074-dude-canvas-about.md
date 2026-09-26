---
title: Dude Canvas About
slug: dude-canvas-about
status: defined
spec_path: .dude/specs/074-dude-canvas-about/spec.md
---

# Idea: Dude Canvas About

## Idea

> In Settings, we need an About section, as in most software, showing the Dude version, the author (Enrique Gonzalez), the GitHub repository, and any other useful metadata.

## Open Questions

1. Which proposed extras, if any, belong in the first About section?
   Answer:

## Assumptions

No additional user assumptions supplied.

<!-- dude:managed:start -->
## Scope And Proposals

The first definition adds one compact, read-only About section inside existing Dude Canvas Settings. Required fields are the recorded Dude version, author Enrique Gonzalez, and https://github.com/E-G-C/dude. Packs remains a separate Settings section; the five main-rail destinations and working Canvas surfaces stay intact.

Include recorded installation channel/ref as the only optional metadata addition. The current installation records `source_ref: main` and `installed_ref: main`, so its version is development, not a numbered release. Other refs remain honestly labeled recorded refs; missing or unusable metadata is unavailable. Recorded provenance never establishes installed-byte integrity.

Omit unrecorded build revision/date and product license/copyright claims, separate documentation/support links without an established destination, and a new third-party-notices link. Preserve the existing notices. Exclude update checks/upgrades, diagnostics, telemetry, copy controls, secrets or host filesystem disclosures, pack behavior changes, and new protocols, skills, or governance.

Definition package: `.dude/specs/074-dude-canvas-about/spec.md`, with a narrow implementation plan and three derived, sequential implementation units in `tasks.md`. Design is `approved`: Classic Settings About, at the unchanged canonical preview `.dude/specs/074-dude-canvas-about/design/about.html`. It retains the main rail and Packs body, with a shared Settings heading, compact inline Packs/About tabs, and a plain Dude heading over a ruled label/value list. The user's explicit chat approval is bound to the reviewed artifact in the spec Revision Log. Tasks are newly proposed open units with no inherited completion evidence; implementation and acceptance still follow the existing execution lane.

## Related References

- Broader Canvas: `.dude/ideas/052-dude-canvas-ui.md`.
- Shared Settings: `.dude/ideas/063-dude-canvas-settings.md`.
- Separate upgrades: `.dude/ideas/072-dude-canvas-bundle-upgrade.md`.
- Workspace design baseline: `.dude/specs/052-dude-canvas-ui/design/fluent-desktop-workspace.html`.
- Settings design baseline: `.dude/specs/063-dude-canvas-settings/design/pack-management.html`.

Continuity references, not dependencies or priority. Preserve the baselines and feature 063 unchanged.
<!-- dude:managed:end -->

## Coordinator Log

- 2026-09-25T21:50:30Z - brainstorm: Staged the About idea for first-capture publication; extras remain proposals and the scope question is non-blocking. No package, tasks, mock, implementation, or feature 063 changes.
- 2026-09-25T22:23:51Z - define: Staged first definition at .dude/specs/074-dude-canvas-about/spec.md with spec, plan, and header-only tasks; design is exploring, canonical mock creation and explicit user visual approval remain pending. No product implementation or task-state change.
- 2026-09-25T22:42:36Z - route: Assigned the canonical About mock at .dude/specs/074-dude-canvas-about/design/about.html to FluentUI, using the published exploring specification, existing Canvas baselines, and the implementation owner's read-only capability declaration. Product implementation remains gated on explicit user visual approval.
- 2026-09-25T23:54:05Z - define: Settled the initial Classic Settings About design to proposed at .dude/specs/074-dude-canvas-about/design/about.html; the reviewed artifact hash and proposal evidence are bound in the spec Revision Log. Explicit user visual approval remains pending. No product implementation, plan/task changes, or implementation-task derivation.
- 2026-09-26T01:11:26Z - define: Staged approval of Classic Settings About from the user's explicit chat reply `approve the About design`, bound to .dude/specs/074-dude-canvas-about/design/about.html at SHA256 `46c7e0d7c96885b19c4bd5453fe7cf8b81968d7f2ceb36ae262a6addbc91df9e`; the coordinator's fresh hash matches the reviewed artifact. Derived three new sequential implementation units, T001@c47e1b20, T002@a932d6f4, and T003@e8b71c05, with no inherited completion evidence. The earlier Canvas preview waiter timed out/cancelled without a receipt; this is direct chat approval, not a Canvas response or acknowledgment. The approved mock, references, and feature 063 remain unchanged. No execution or task completion is claimed.
- 2026-09-26T01:30:00Z - execution-reconciliation: Applied the checked definition stage and three new open task units with no inherited state; kept 0, changed 0, dropped 0, new 3. Preserved user sections and append-only history, retained the approved mock bytes, rendered the derived task view, and observed zero lint failures. Definition is ready for the existing Ship execution path; no implementation or completion is claimed.
- 2026-09-26T01:34:11Z - work: Claimed T001@c47e1b20 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-09-26T02:28:32Z - work: Claimed T002@a932d6f4 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-09-26T06:08:47Z - work: Claimed T003@e8b71c05 for the user-authorized autonomous Ship invocation; implementation has not started.
- 2026-09-26T15:56:07Z - work: Closed T003@e8b71c05 in a fresh user-authorized autonomous Work invocation; the earlier Ship run ended at an app restart, and its orphan checkpoint pair was removed after the user confirmed no other run. Attempt 3's fresh verification (real copilot.exe T012 from a short artifacts path, lint, byte-identical retained Edge and Linux checks, and the user's confirmed embedded-host link round trip) received independent review approval. Attempts 1 and 2 failed because T012's host temp root crossed the Windows 260-character path limit. T001-T003 are done.
- 2026-09-26T15:56:42Z - render: Rendered the derived task board; T001-T003 are Done and no task is ready, in progress, or blocked.

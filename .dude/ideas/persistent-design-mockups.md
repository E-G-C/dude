---
title: Persistent Design Mockups
slug: persistent-design-mockups
status: defined
spec_path: .dude/specs/044-persistent-design-mockups/spec.md
---

# Idea: Persistent Design Mockups

## Idea

During visual-design and mockup brainstorming, intermediate work must not live
in an operating-system temporary directory, an external tool session, or
another session-only location where a process, session, or computer restart
makes it disappear.

Once actual mock creation begins, keep its durable live artifact or artifacts
in the same canonical design package directory used by the accepted or final
design proposal:

```text
.dude/specs/<feature>/design/
  <primary mock artifact>
  <required supporting files>
  screenshots/
  references/
```

The mock format is chosen for the target and intended output. It may be HTML,
PDF, PNG or JPEG, SVG, another image or document, a slide or deck, a canvas
export, or another file generated through Model Context Protocol (MCP) or other
tools. These examples are illustrative, not an allowlist.

`preview_path:` identifies the primary current mock artifact by its exact
workspace-relative filename and actual extension throughout `design_status:
exploring`, `proposed`, and `approved`. Every create, update, or resume response
states that exact path rather than a hard-coded HTML path.

Some mocks inherently require several files, such as an HTML entrypoint with
assets, document source with an exported PDF, image variants, or multi-page
artifacts. Keep the primary artifact and every required supporting file
together under `design/`. The one primary `preview_path` remains the orientation
entrypoint, and no second live authority is maintained.

Export or save output created through MCP or other tools into the package's
`design/` directory. An external tool or session reference alone is not a
durable mock. Record useful references under `design/references/`, but do not
treat them as the live artifact.

Intermediate and approved artifacts use this same canonical directory. On
restart or resume, inspect and continue the existing `preview_path` artifact
and its required supporting files from disk instead of silently recreating,
abandoning, or superseding them.

“Same directory as final” means the canonical design proposal package, not the
product's source directory. Final application or source implementation still
belongs in the normal target directory after approval.

Preserve the brainstorm/define boundary. A raw or draft idea gets a flat
brainstorm ledger first when needed. Before the first render or export, require
an explicit `define` that establishes a minimal package with `design_status:
exploring`; brainstorm alone creates no package or mock. An exploring design
spec may stay lean while visual direction develops through the live loop, then
backfill the settled direction when the design moves to `design_status:
proposed`.

Preserve the current edit → render → screenshot → user correction → repeat
loop, with ungated refinement tweaks, settle to proposed, and explicit
approval before implementation. Preserve functional realism, provenance,
accessibility, post-implementation refinement, exact ownership, and active
execution-lane behavior.

Keep this deliberately simple: one canonical primary orientation path, with
only the supporting artifacts the mock requires, plus screenshots and useful
references. Keep no temporary or session-only live mock. Add no mock registry,
revision database, cache, state store, daemon, autosave service, background
process, duplicate workflow, new command, or automatic Git commit. Persistence
means ordinary repository/worktree persistence across process, session, or
computer restart, not protection from disk loss or deletion of uncommitted
work.

If an accepted current mock arrives from an external or scratch location,
export, save, copy, or move its current artifact and required supporting files
into the canonical package directory before continuing. After that handoff,
the canonical `preview_path` artifact is the sole primary live authority.

Keep core status lean. Design-workflow resume and orientation should report
`preview_path`; change core status only if a concrete existing caller or test
proves that it is necessary.

This feature changes workflow prose and its contract. It is not itself a
rendered-surface design task, so implementing it requires no design approval
gate. Keep it as one coherent feature; do not split it.

Feature 044 execution must not resume against the earlier HTML-only definition.
Run an explicit redefinition from this refreshed intent first.

## Open Questions

None. The accepted intent fixes the durable location, format-neutral artifact
contract, primary-path semantics, multi-file handling, lifecycle boundary,
resume behavior, retained design-loop guarantees, and smallest-design limits.

## Assumptions

No additional assumptions. No default mock format or filename extension is
assumed; the target and intended output determine the primary artifact.

<!-- dude:managed:start -->
## Normalized Intent

- Replace temporary, external-session-only, or otherwise ephemeral mock storage
  with durable live mock artifacts under
  `.dude/specs/<feature>/design/`.
- Keep the artifact contract format-neutral. A mock may be HTML, PDF, PNG or
  JPEG, SVG, another image or document, a slide or deck, a canvas export, or
  another file generated through MCP or other tools; these are examples, not
  an allowlist.
- Bind `preview_path:` to the one primary current mock artifact using its exact
  workspace-relative filename and actual extension, selected for the target
  and intended output, through `design_status: exploring`, `proposed`, and
  `approved`.
- State the exact actual `preview_path` in every response that creates, updates,
  or resumes the mock. Do not report a hard-coded HTML path.
- Keep inherently multi-file mocks together under `design/`, including the
  primary artifact and required assets, sources, exports, variants, or pages.
  Use the primary `preview_path` as the orientation entrypoint without creating
  a second live authority.
- Export or save MCP and tool output into the canonical package directory.
  External tool or session references alone are not durable.
- Allow useful external references to be recorded under `design/references/`
  for context while never treating them as the primary mock, required
  supporting files, or another live authority.
- On restart or resume, inspect and continue the existing primary artifact and
  its required supporting files from disk. Never silently recreate, abandon,
  or supersede them.
- Treat the canonical design proposal package as the meaning of “same directory
  as final.” Keep final product implementation in its normal target directory.
- Preserve brainstorm as flat-ledger-only intake. Before the first rendered
  or exported mock for a raw or draft idea, require explicit definition of a
  minimal `design_status: exploring` package; brainstorm alone creates no
  package or mock.
- Allow the exploring design spec to remain lean while the live loop develops
  the visual direction, then backfill settled intent when it becomes proposed.
- Preserve edit/render/screenshot/correct/repeat, ungated refinement tweaks,
  settle-before-approval, explicit approval before implementation, functional
  realism, provenance, accessibility, post-implementation refinement, exact
  ownership, and active-lane semantics.
- Preserve screenshot evidence wherever it applies. This binding accepted
  intent does not require a separate redundant image screenshot of every
  inherently viewable artifact; direct inspection may establish its visible
  output only when no applicable screenshot evidence is omitted.
- When accepted current content comes from an external or scratch mock, export,
  save, move, or copy its artifacts into the canonical directory before
  continuing and retain one primary live authority.
- Keep status behavior lean: resume and orientation for design work report
  `preview_path`; change core status only for a proven current caller or test.
- Change workflow prose and its contract without treating this feature itself
  as a rendered-surface design task or imposing a design-approval gate on its
  implementation.
- Keep one coherent feature and one canonical primary orientation path. Keep no
  temporary or session-only live mock, and add no registry, revision database,
  cache, state store, daemon, autosave service, background process, duplicate
  workflow, command, or automatic Git commit.
- Define persistence only as repository/worktree survival across process,
  session, or computer restart, not protection from disk loss or deletion of
  uncommitted work.
- Refresh Feature 044 from this format-neutral intent before its execution
  resumes.

## Current Evidence

- The authoritative design workflow keeps exploration under the canonical
  package but hard-codes `.dude/specs/<feature>/design/preview.html` as the
  first mock, `preview_path`, response path, asset example, and resume target.
- The focused workflow contract also asserts the HTML-only filename directly,
  so both prose and checks require a format-neutral refresh.
- The workflow already defines `.dude/specs/<feature>/design/` as the proposal
  asset directory and carries `preview_path:` as the orientation field.
  Generalizing the field changes no storage authority and requires no new
  state.
- The existing package shape already provides `screenshots/` and `references/`.
  Recording useful references there requires no new authority or persistence
  mechanism.
- The correction loop is currently phrased as a fixed
  edit/render/screenshot/correct sequence. It must retain applicable screenshot
  evidence while accommodating directly viewable artifact formats without
  manufacturing duplicative screenshots.
- Exact-owner, coordinator-only lifecycle state, approval, active-lane,
  capability-relative realism, provenance, accessibility, close, and
  refinement contracts already exist and remain in scope.
- Existing completion and execution history applies to the earlier HTML-only
  task meanings. It remains preserved history but does not prove the broadened
  format-neutral obligations complete.

## Constraints

- Preserve exact package identity
  `.dude/specs/044-persistent-design-mockups/spec.md` and its one defined owner.
- Store every managed exploration's durable live artifact set under its
  canonical `.dude/specs/<feature>/design/` directory.
- Keep one canonical primary orientation path using the artifact's actual
  filename and extension. Allow required supporting files in the same directory
  without introducing a parallel live authority.
- Treat format examples as illustrative rather than an allowlist, and do not
  hard-code HTML or `preview.html`.
- Save or export tool-generated output into `design/`; an external reference
  alone cannot serve as the durable mock.
- Record useful external references only under `design/references/` and never
  promote them to live authority.
- Preserve screenshot evidence wherever applicable. Do not require a redundant
  image screenshot solely to duplicate an inherently viewable artifact, and do
  not use direct inspection to waive otherwise applicable screenshot evidence.
- Keep product or source implementation in its normal target location; the
  design package contains proposal and mock artifacts only.
- Preserve existing feedback, settle, approval, functional-realism,
  provenance, accessibility, refinement, ownership, and active-lane behavior.
- Introduce no temporary or session-only live mock and no persistence
  subsystem.
- Do not broaden core status without proof from a concrete current caller or
  test.
- Do not apply a design-approval gate to implementation of this workflow-prose
  feature.
- Do not split the outcome.
- Preserve execution history exactly and let the coordinator compose reopened
  task state before Work resumes.

## Definition Checklist

- [x] One coherent outcome is captured
- [x] The durable directory and format-neutral artifact contract are explicit
- [x] Primary-path and required multi-file semantics are explicit
- [x] Tool export and external-reference limits are explicit
- [x] Brainstorm and definition authority remain separate
- [x] Resume, external-input, and sole-authority behavior are explicit
- [x] Applicable screenshot evidence and nonredundant direct inspection are both explicit
- [x] Existing design-loop guarantees are preserved
- [x] Complexity exclusions and persistence limits are explicit
- [x] The refreshed definition reopens broadened work without using prior HTML-only history as generalized completion evidence
- [x] No unresolved clarification blocks definition

## Coordinator Log

- 2026-08-30 UTC - brainstorm captured during explicit Ship lifecycle; definition deferred to explicit `define persistent-design-mockups`
- 2026-08-30 UTC - defined -> .dude/specs/044-persistent-design-mockups/spec.md (via ship)
- 2026-08-30 UTC - Ship entered autonomous Lightweight Execution and claimed T001@c4a91e72 `[~]` for the authoritative design-workflow prose
- 2026-08-30 UTC - T001@c4a91e72 closed after fresh Tester verification and independent Reviewer approval; T002@6f38b2d5 claimed `[~]` for deletion-sensitive workflow contracts
- 2026-08-30 UTC - T002@6f38b2d5 closed after 11 focused checks, 4 independence checks, deletion probes, and independent Reviewer approval; T003@a17d5c84 claimed `[~]` for Compose refresh and integrated verification
- 2026-08-30 UTC - definition-owner brainstorm-refresh broadened the durable mock artifact contract from HTML-only to format-neutral; explicit redefinition required before Feature 044 execution resumes
- 2026-08-30 UTC - redefined -> .dude/specs/044-persistent-design-mockups/spec.md (via ship)
- 2026-08-30 UTC - execution reconciliation after explicit redefinition: changed T001@c4a91e72, T002@6f38b2d5, T003@a17d5c84, and T004@e92b704f one-to-one under their existing durable keys; reopened all four tasks, cleared T003's prior in-progress state, dropped and added no tasks, and preserved prior HTML-specific completion evidence as history only; the previously stale Feature 044 T003 challenge/checkpoint pair had already been independently removed with no in-flight or stale ownership remaining
- 2026-08-30 UTC - execution-history reconciliation archived the two superseded HTML-specific completion records as non-authoritative history after fresh autonomous authorization proved they otherwise blocked generalized work as incomplete occurrence retention
- 2026-08-30 UTC - T001@c4a91e72 closed through the host-adapter permit and receipt path after Skill Smith generalized the authoritative workflow; fresh Tester evidence passed 24/24 bounded checks and file-scoped whitespace validation, independent Reviewer verdict APPROVE; occurrence b6148741c5472a3742ba28500afaa48111037716a0b2a69595027e4aa63cd496
- 2026-08-30 UTC - T002@6f38b2d5 closed through the host-adapter permit and receipt path after Tester generalized the existing focused contract; fresh evidence passed 12/12 workflow tests, 41 labeled deletion probes, 4/4 unchanged independence tests, and file-scoped whitespace validation, independent Reviewer verdict APPROVE; occurrence 0ef2d8012cd4b360ab8924a03ac969ee4f8a7b0f4d609fb332e65d272630924b
- 2026-08-30 UTC - T003@a17d5c84 closed through the host-adapter permit and receipt path after the coordinator previewed and applied Compose refresh design; fresh Tester evidence passed focused 12/12, independence 4/4, exact authoritative/installed parity, Compose verify for 17 packs with 0 failures and 0 leftovers, recursive 2395 tests with 2391 passed and 4 skipped, lint 0/0, repetition 0 findings, current backlog, clean diff, and bounded paths; independent Reviewer verdict APPROVE; occurrence 5cec0b42a9b790c85e0ae323f55433adccdebba75323ee2e6d26d89596a63bc6
- 2026-08-30 UTC - T004@e92b704f closed through the host-adapter permit and receipt path after a fresh unchanged-revision verification pass and independent final Reviewer APPROVE; focused 12/12, independence 4/4, 41 deletion falsifiers, exact source/projection parity, Compose verify 17 packs with 0 failures and 0 leftovers, recursive 2395 tests with 2391 passed and 4 skipped, lint 0/0, repetition 0 findings, current backlog, clean diff, and bounded paths; occurrence f9dab222afb6bd7be36e6db090837eacc74b6ca2755e99330ecd63f05ba3794e
<!-- dude:managed:end -->

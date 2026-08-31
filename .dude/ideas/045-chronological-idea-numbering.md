---
title: Chronological Idea Numbering
slug: chronological-idea-numbering
status: defined
spec_path: .dude/specs/045-chronological-idea-numbering/spec.md
---

# Idea: Chronological Idea Numbering

## Idea

Existing idea files are unnumbered, and their inventory is effectively
alphabetical. That makes it hard to tell where a newly captured idea landed or
to browse ideas in capture order.

Assign every idea a permanent three-digit lifecycle number when the idea is
first captured. Put that number in the idea filename and display or list ideas
by number so their capture order is visible. If an idea becomes a feature, reuse
the same number for its feature package. For example:

```text
.dude/ideas/027-backlog-report-usability.md
.dude/specs/027-backlog-report-usability/
```

Existing defined ideas inherit their existing feature numbers; do not renumber
feature packages. Existing package-less current-format ideas receive a
deterministic, collision-free assignment after the existing range while
retaining their status and content.

The number identifies lifecycle and capture order only. It must not imply
priority, dependency, or implementation order.

This is one bounded outcome, and I explicitly want it shipped.

Use the current pre-feature capture convention for this feature's own initial
ledger, `.dude/ideas/chronological-idea-numbering.md`. Once Feature 045 exists,
its later implementation and migration may rename this ledger consistently.
The existing direct idea and spec inventories remain authoritative. Do not add
a second registry, counter file, database, or state store.

## Open Questions

None. The lifecycle identity, migration boundary, ordering semantics, and
single-authority constraint are settled. Definition may derive the exact
deterministic assignment order for existing package-less current-format ideas
from the direct inventories and their evidence. If that evidence forces an
outcome-changing choice, definition must ask rather than invent another
authority.

## Assumptions

- Existing numbered feature packages retain their current numbers and paths.
- Existing package-less current-format idea ledgers retain their status,
  user-controlled content, managed history, and lifecycle meaning when renamed.
- Feature 045 is the prospective package for this idea because the current
  package range ends at 044; this initial capture does not create that package.
- Numbered idea filenames and feature package directories remain the direct
  inventory. No separate allocation authority is needed.

<!-- dude:managed:start -->
## Normalized Intent

- Give every newly captured idea one canonical lifecycle identity in the form
  `001` through `999`, prefix its direct ledger filename with that identity, and
  retain it through draft, defined, resolved, reopen, and refresh behavior.
- Derive a first capture's next identity from the valid direct idea and feature
  package inventories, never fill a lower gap, and stop before writing on an
  unsafe, malformed, duplicate, colliding, or exhausted inventory.
- Make first definition reuse the selected idea's number for its package rather
  than allocate another number.
- Keep the unnumbered frontmatter `slug:` as the semantic command selector and
  exact `spec_path:` as the sole ownership link. A filename, directory, number,
  or slug resemblance never becomes an ownership fallback.
- Sort and display idea inventory by lifecycle number while leaving priority,
  dependency, scheduling, task phase, and execution order unchanged.
- Migrate this repository's current direct ledgers deterministically: existing
  defined ideas inherit package numbers `001` through `045`; the remaining
  package-less ledgers become `046-good-enough-delivery`,
  `047-core-dogfood-preview`, `048-backlog-canvas`, and
  `049-visual-systems-pack`.
- Preserve every migrated idea ledger's bytes, metadata, status, user content,
  managed content, and Coordinator Log. Preserve every existing package
  directory and exact `spec_path:` value.
- Update only active exact owner references, including task audit breadcrumbs
  and active ObjectiveRegistry owner paths, then regenerate derived backlog
  output. Do not rewrite protected content or historical log prose merely
  because it mentions an old path.
- Add no registry, counter file, database, service, alternate state, recycled
  identity, general migration framework, or widened number format.

## Definition Outcome

- **Specification**:
  `.dude/specs/045-chronological-idea-numbering/spec.md`
- **Package**: lean `spec.md`, `plan.md`, and `tasks.md`; no supporting artifact
  or ObjectiveRegistry region applies.
- **Implementation boundary**: authoritative core changes remain under `src/`;
  committed `.github/` core files are refreshed only through the existing
  development build.
- **Migration boundary**: Feature 045 is published against this current
  unnumbered owner path. Its implementation later renames the ledger and updates
  this package's audit breadcrumb in the same coordinator-owned bounded
  migration as the other current ledgers.

## Constraints

- A lifecycle number is exactly three ASCII digits from `001` through `999`.
  `000`, malformed widths, and values above `999` are invalid; exhaustion stops
  capture rather than wrapping, recycling, or widening the format.
- A supported lifecycle action never deletes its numbered ledger. Resolution
  retains the ledger, and existing gaps below the observed maximum are never
  reused. Manual destruction of all direct evidence is outside the supported
  lifecycle and does not justify another authority.
- New mutation stops on any direct-inventory diagnostic. Read-only status and
  self-check behavior reports the diagnostic without guessing.
- A slug selector resolves only an exact frontmatter `slug:` and an explicit
  idea path resolves only that exact direct file. Do not strip a numeric-looking
  prefix or fall back among slug, filename, directory, title, or package name.
- Exact `status: defined` plus exact canonical `spec_path:` remains the only
  owner relation. Numeric alignment is validated but never used to infer an
  owner.
- Existing feature packages are never renamed or renumbered.
- Lifecycle order is never a priority, dependency, roadmap, readiness, phase,
  dispatch, or execution signal.
- Preserve unrelated dirty work and all coordinator-owned execution state.

## Definition Checklist

- [x] Feature 045 remains collision-free in the inspected direct package and
  idea inventories
- [x] First capture, refresh, reopen, first definition, and exact-owner behavior
  are specified
- [x] Selector behavior has no ambiguous numeric or path fallback
- [x] Malformed, duplicate, gap, deletion, exhaustion, and above-999 behavior
  are bounded
- [x] Lint, backlog, audit, ObjectiveRegistry, Work, Ship, status, diff,
  self-check, and optional tracked-owner callers are covered
- [x] The complete current dogfood migration and package-less assignment are
  deterministic
- [x] Idea bytes, package identities, historical prose, and active references
  have distinct preservation rules
- [x] Source, generated projection, docs, focused verification, and independent
  acceptance obligations are planned
- [x] No clarification, supporting artifact, ObjectiveRegistry, or new durable
  guardrail is required

## Coordinator Log

- 2026-08-31 UTC - brainstorm captured via Ship; definition deferred to explicit `define chronological-idea-numbering`
- 2026-08-31 UTC - defined -> .dude/specs/045-chronological-idea-numbering/spec.md
<!-- dude:managed:end -->
- 2026-08-31 UTC - Ship entered autonomous Lightweight Execution; claimed T001@6964656e [~]
- 2026-08-31 UTC - Ship continued autonomous Lightweight Execution; claimed T002@6d696772 [~] for bounded idea migration
- 2026-08-31 UTC - Work resumed autonomous Lightweight Execution; claimed T003@67756964 [~] for guidance and generated projection
- 2026-08-31 UTC - Work continued autonomous Lightweight Execution; claimed T004@74657374 [~] for integrated verification
- 2026-08-31 UTC - Work-authorized unchanged-intent definition repair distinguished T002 migration-boundary preservation from later valid append-only Feature 045 execution state
- 2026-08-31 UTC - execution reconciliation after Work-authorized definition repair: kept T001 through T003, changed T004 and T005 one-to-one under their existing durable keys, preserved T001 through T003 done state and T004 in-progress state, and dropped or added no task
- 2026-08-31 UTC - Spec Lead staged Work-authorized unchanged-intent definition repair binding later Feature 045 verification to the latest independently reviewed T004/T005 definition baseline before coordinator-owned state normalization
- 2026-08-31 UTC - execution reconciliation after stable Work-authorized definition repair: kept T001 through T003, changed T004 and T005 one-to-one under their existing durable keys, preserved states x/x/x/~/open and all task history, dropped or added no task, and bound final tasks postimage d60bb4e5642de78ac33da8f69044b88d050ad754c89a671a1d0eff576ffaadbf
- 2026-08-31 UTC - Work continued autonomous Lightweight Execution; claimed T005@61636370 [~] for final independent acceptance
- 2026-08-31 UTC - close: T001 through T005 settled through autonomous Lightweight Work after fresh Tester evidence and final independent Reviewer APPROVE; numbered idea inventory is 001 through 049 with next allocation 050

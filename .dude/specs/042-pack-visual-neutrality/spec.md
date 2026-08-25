# Feature Specification: Pack Visual Neutrality

## Overview

Domain and technology packs may render project surfaces, but they must not
choose a visual provider for those surfaces. A project's own path-scoped visual
selection remains authoritative. This correction removes one fixed-provider
route and purges live guidance that presents an absent provider pack as real,
while preserving legitimate technology routing and meaningful generic fixtures.

## Problem

Hugo's coordination guidance currently requires an unavailable visual-provider
specialist before rendered work can close. Catalog, related-pack, and warning
guidance also describes that absent provider as though it were available. The
result is both a dead route and a false catalog promise.

The cleanup must not confuse a visual provider with Docsy, which is legitimate
domain and technology expertise. It also must not churn arbitrary hyphenated-name
examples that exercise generic parsing or ranking and make no pack-existence
claim.

## Goals

- Let project-owned visual-system selection govern rendered domain surfaces
  without a fixed provider imposed by a domain pack.
- Remove live claims and routes that imply the absent `ms-brand` pack exists.
- Preserve Hugo's Docsy technology routes and still-valid sibling-warning
  guidance.
- Preserve inert arbitrary-name examples whose generic coverage is unrelated to
  pack availability.
- Keep the correction bounded to existing content and projection paths.

## Non-Goals

- Restoring or recreating the absent provider pack.
- Adding a visual-provider route, fallback, registry, adapter, handshake,
  capability negotiation, activation state, or pack-to-pack protocol.
- Changing project-owned, path-scoped visual-system selection.
- Reclassifying Docsy as a visual provider or removing its technology routes.
- Renaming generic parser or ranking examples merely to eliminate a token.

## User Stories

### US1 - Rendered domain work remains visually neutral (Priority: P1)

As a project owner, I want a domain pack to coordinate its own technology
without requiring a particular visual provider, so that the visual system I
selected for each surface remains in control.

**Independent test**: Inspect the complete Hugo coordination flow after the
correction and verify that it contains no fixed or generic visual-provider close
route, retains every Docsy technology route, and has an unambiguous remaining
sequence.

**Acceptance scenarios**:

1. **Given** a rendered Hugo or Docsy surface, **when** Hugo coordination reaches
   its close path, **then** it does not require or route to a named visual
   provider.
2. **Given** a Docsy theme, content, shortcode, search, internationalization,
   versioning, deployment, or troubleshooting concern, **when** specialist
   routing is evaluated, **then** the Docsy expert remains available as
   technology expertise.
3. **Given** no visual system is selected for a surface, **when** it is rendered,
   **then** the domain technology's ordinary baseline remains valid rather than
   triggering a provider fallback.
4. **Given** a project-owned visual selection for one or more path scopes,
   **when** those surfaces are changed, **then** the project selection remains
   authoritative without a new domain-pack indirection.

### US2 - Live pack guidance is truthful (Priority: P1)

As a pack user, I want catalogs, related-pack guidance, routes, and verification
examples to name only packs that actually exist or currently produce a valid
sibling warning, so that I do not follow an unavailable capability.

**Independent test**: Audit live catalog, related-pack, routing, command, and
Compose guidance and confirm that no surface presents `ms-brand` as an available
pack or expected sibling dependency, while the valid Docsy and web sibling
examples remain.

**Acceptance scenarios**:

1. **Given** the pack catalog, **when** a user reads available packs, **then** no
   `ms-brand` entry appears.
2. **Given** Hugo and Docsy related-pack guidance, **when** it is read, **then**
   neither pack recommends or describes `ms-brand`.
3. **Given** pack-source verification guidance, **when** expected sibling
   warnings are described, **then** Hugo-to-Docsy and Fluent-UI-to-web remain and
   no `ms-brand` warning is claimed.
4. **Given** all corrected live guidance, **when** it is searched for the absent
   pack identity, **then** no match remains.

### US3 - Generic fixture coverage survives the cleanup (Priority: P2)

As a maintainer, I want inert examples of multi-token hyphenated names to remain
stable, so that a semantic pack cleanup does not weaken unrelated parsing and
ranking coverage for cosmetic consistency.

**Independent test**: Compare the existing lint explanation, import
normalization documentation and assertion, and text-ranking fixture before and
after the correction; confirm their bytes are unchanged and that none is exposed
as catalog, install, routing, related-pack, or warning guidance.

**Acceptance scenarios**:

1. **Given** an arbitrary multi-token pack-like name in parser documentation and
   normalization coverage, **when** live pack references are purged, **then** the
   example remains unchanged because it tests lossless name handling.
2. **Given** an arbitrary candidate identifier in ranking coverage, **when** the
   cleanup is complete, **then** the fixture remains unchanged because it tests
   ranking rather than pack availability.
3. **Given** a remaining inert example, **when** its context is inspected,
   **then** it does not advertise, install, route to, recommend, or expect the
   absent pack.

## Functional Requirements

- **FR-001**: A domain or technology pack MUST NOT name, require, route to, or
  assume a particular visual provider for a rendered surface.
- **FR-002**: Removing the fixed-provider route MUST leave the remaining
  coordination flow complete and unambiguous and MUST NOT add a generic
  visual-system replacement step.
- **FR-003**: Hugo's Docsy routes MUST remain intact as legitimate technology
  routing.
- **FR-004**: Project-owned, path-scoped visual-system selection MUST remain
  unrestricted and authoritative; this correction MUST add no selection or
  activation mechanism.
- **FR-005**: Live catalog, related-pack, routing, command, and Compose guidance
  MUST contain no reference that presents `ms-brand` as an existing pack,
  specialist, or expected sibling warning.
- **FR-006**: Expected sibling-warning guidance MUST retain the currently valid
  Hugo-to-Docsy and Fluent-UI-to-web examples.
- **FR-007**: The existing inert lint explanation, import normalization
  documentation and assertion, and ranking fixture that use arbitrary
  `ms-brand`-based names MUST remain unchanged because they make no pack
  availability claim.
- **FR-008**: Authoritative changed guidance and every maintained generated or
  installed representation that currently applies MUST agree after their normal
  projection lifecycle.
- **FR-009**: The absent `ms-brand` pack MUST NOT be restored, recreated, or
  replaced by another provider-specific capability.
- **FR-010**: The correction MUST NOT add a registry, adapter, handshake,
  contract, capability negotiation, activation state, generic visual-system
  indirection, or other pack-to-pack protocol.
- **FR-011**: Content unrelated to the live existence claims, fixed-provider
  route, and directly affected warning guidance MUST remain unchanged.

## Key Entities

- **Domain or technology pack**: A pack that owns subject-matter behavior and may
  render a project surface without choosing its visual authority.
- **Visual provider**: A named look-and-feel authority selected by the project,
  never imposed by a domain pack.
- **Project-owned visual selection**: Path-scoped project guidance that chooses
  which visual system governs each surface.
- **Live pack reference**: Catalog, routing, related-pack, install, or warning
  guidance that communicates a pack's present availability or relationship.
- **Inert arbitrary-name example**: A parser, normalization, or ranking fixture
  whose identifier is test data and carries no availability or routing meaning.

## Edge Cases

- A surface has no selected visual system. Its normal domain baseline remains
  valid; no provider fallback is introduced.
- Several visual systems coexist in different project path scopes. The domain
  pack does not choose among them.
- Docsy appears in a Hugo route. It remains because the route is technological,
  not visual-provider selection.
- A broad text search still finds `ms-brand` in definition history or inert
  generic examples. Those matches are not live pack claims; context, not token
  presence alone, determines the purge boundary.
- Removing one numbered routing action leaves later actions. Their order remains
  contiguous and no dangling reference to the removed action survives.
- An affected pack is not installed in the current workspace. No install or
  fabricated refresh authority is introduced merely to create a projection.

## Success Criteria

- **SC-001**: The Hugo coordination flow contains zero named or generic visual
  provider close routes, retains all existing Docsy technology routes, and has
  one fewer action with a contiguous remaining sequence.
- **SC-002**: The live pack catalog, Hugo and Docsy related-pack guidance, Hugo
  route, command guidance, and Compose warning guidance contain zero
  `ms-brand` references.
- **SC-003**: The four identified authoritative inert contexts remain
  byte-for-byte unchanged, and no new inert or live occurrence is introduced.
- **SC-004**: `compose verify` reports aggregate per-pack warning totals, not
  sibling-only counts. After the purge, it reports `hugo`=2 total warnings (one
  baseline warning plus one orphan sibling handle, Docsy) and `fluent-ui`=3
  total warnings, unchanged by this feature (one baseline warning plus two
  orphan sibling handles, web backend and web frontend), with zero pack failures
  and zero leftovers. A focused source audit, rather than either aggregate
  total, proves the sibling subset: Hugo retains Docsy and no `ms-brand`, while
  Fluent UI retains both web handles.
- **SC-005**: The changed core guidance and its generated development projection
  are byte-identical after the normal build; the install profile remains
  unchanged because neither edited catalog pack is installed.
- **SC-006**: Changed-path inspection finds no restored provider pack, generic
  provider route, registry, adapter, protocol, activation state, or unrelated
  fixture churn.

## Assumptions

- `ms-brand` is absent from the current catalog and has no current production
  caller.
- Docsy is a domain and technology pack, not a visual provider.
- `compose verify` reports aggregate per-pack warning totals rather than
  sibling-only counts. The coordinator-verified current totals are `docsy`=1,
  `strata`=1, `hugo`=3, and `fluent-ui`=3. Each total includes one baseline
  warning; focused source audit identifies Hugo's current sibling subset as
  Docsy and `ms-brand`, and Fluent UI's as web backend and web frontend. Those
  sibling identities cannot be inferred from the aggregate totals.
- The current install profile excludes Hugo and Docsy, so no edited pack source
  has an installed projection in this workspace.
- Existing project guardrails and pack-authoring conventions already govern
  standalone visual neutrality and minimal design; this feature corrects
  violations rather than adding policy.

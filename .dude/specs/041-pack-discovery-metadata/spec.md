# Feature Specification: Pack Discovery Metadata

## Overview

Pack catalogs need one stable, user-centered discovery signal before a future
onboarding UI exists. Add optional `use-cases` metadata, expose it in Compose
list results, and support one exact filter. Keep the feature descriptive and
backward compatible.

## Problem

People and tools must currently infer pack relevance from names and prose.
Free-text inference cannot support a predictable CLI query or reusable
machine-readable result, while making new metadata mandatory for every external
manifest would break existing catalogs.

## Goals

- Describe current pack uses with stable lowercase/kebab-case identifiers.
- Make all 16 maintained bundled packs discoverable and keep that catalog
  complete through automated repository coverage.
- Add `use_cases` to list objects and provide one exact `--use-case` filter in
  human and JSON modes.
- Preserve external compatibility, routing authority, and pack lifecycle safety.

## Non-Goals

- A registry, taxonomy service, aliases, hierarchy, labels, localization,
  scoring, ranking, multi-filter expressions, catalog API, UI schema, or
  onboarding UI.
- Installation, activation, compatibility, selection, or routing behavior based
  on use cases.
- `cmdVerify` source-selection behavior and metadata enforcement are unchanged
  and out of scope.
- The absent `ms-brand` pack is deferred: create no manifest or metadata for it,
  and preserve every existing reference, row, warning, handle, and document line
  byte-for-byte.

## User Stories

### US1 - Read structured discovery metadata (Priority: P1)

As a user or tool listing packs, I want every result to carry a use-case list so
that discovery does not depend on parsing descriptions.

**Independent test**: List a local catalog and an external catalog containing
both declared and omitted metadata.

**Acceptance scenarios**:

1. **Given** a declared list, **when** the pack is listed, **then** the result
   contains those values in `use_cases`.
2. **Given** an omitted field, **when** the pack is listed, **then** listing
   succeeds with `use_cases: []` and all existing result fields retain their
   values.

### US2 - Filter by one use case (Priority: P1)

As a user with one kind of work in mind, I want an exact use-case filter so that
I see only packs that declare that value.

**Independent test**: Apply one valid filter to a catalog with overlapping
declarations in human and JSON modes.

**Acceptance scenarios**:

1. **Given** a valid identifier, **when** the list is filtered, **then** both
   modes return exactly the matching packs in catalog order.
2. **Given** a valid identifier with no matches, **when** filtering completes,
   **then** it succeeds with an empty result; malformed, missing, or repeated
   filter input is a usage error.

### US3 - Maintain trustworthy bundled metadata (Priority: P1)

As a catalog maintainer, I want every maintained manifest checked in one focused
repository test so that bundled discovery data cannot silently become absent or
invalid.

**Independent test**: Run the catalog check over the actual
`library/packs/*/pack.md` files, then remove one declaration in a fixture or
isolated copy and confirm the check fails for that pack.

**Acceptance scenarios**:

1. **Given** the maintained catalog, **when** the check runs, **then** all 16
   actual manifests have at least one accepted identifier.
2. **Given** an omitted, empty, malformed, or duplicate declaration in that
   catalog, **when** the check runs, **then** it fails with the pack and cause.

### US4 - Preserve ordinary Compose behavior (Priority: P2)

As a pack user, I want discovery metadata to remain optional and informational
so that existing external packs and lifecycle operations keep working.

**Independent test**: Exercise list, add, refresh preview, and refresh with
omitted metadata, repeat those metadata consumers with an invalid present
declaration, and confirm remove remains source-independent.

**Acceptance scenarios**:

1. **Given** an otherwise valid external manifest that omits the field,
   **when** list, add, refresh preview, or refresh consumes it, **then** the
   operation keeps its established outcome.
2. **Given** invalid present metadata, **when** list or add/refresh starts,
   **then** it is rejected before projection or profile mutation; remove remains
   governed only by its installed-profile authority.

## Functional Requirements

- **FR-001**: `use-cases` MUST be an optional top-level manifest list. Omission
  MUST normalize to `[]` for list, add, refresh preview, and refresh.
- **FR-002**: A present declaration MUST be non-empty and unique. Each value
  MUST start with a lowercase letter and contain only lowercase letters, digits,
  and single hyphens between non-empty segments. Non-list values, repeated keys,
  empty items, malformed identifiers, and duplicates MUST be rejected.
- **FR-003**: The 16 actual bundled manifests MUST each declare at least one
  value using only `api`, `bundle-authoring`, `documentation`,
  `release-management`, `software-development`, `ui`, `visual-design`,
  `web-development`, `work-tracking`, and `writing`. A focused repository test
  MUST enumerate the maintained manifests and enforce this rule.
- **FR-004**: Every Compose list pack object MUST retain `name`, `installed`,
  and `description` and add `use_cases`. Without a filter, existing ordering,
  source selection, installed-state calculation, and human lines MUST remain
  unchanged.
- **FR-005**: List MUST accept at most one `--use-case <id>` using the manifest
  identifier rule and filter by exact membership. Human and JSON modes MUST
  represent the same set; a valid no-match query MUST succeed empty.
- **FR-006**: List, add, refresh preview, and refresh MUST apply the same
  omission and present-value rules and report malformed declarations with
  pack-specific context before any add/refresh mutation.
- **FR-007**: Use cases MUST remain read-only discovery metadata, separate from
  `routing_hints`, and MUST create no profile, routing, activation, ranking,
  compatibility, or selection state.
- **FR-008**: Existing source resolution, preview, confirmation, projection,
  profile authority, rollback, add, refresh, and remove contracts MUST remain
  intact.
- **FR-009**: Pack-authoring and Compose user guidance MUST document the field,
  validation rule, additive list result, exact filter, and discovery-only
  meaning.

## Edge Cases

- Omission is valid and produces `[]`; an explicitly empty list is a present
  invalid declaration.
- A pack with `[]` after omission remains visible without a filter and never
  matches a valid filter.
- Exact matching performs no case folding, substring, alias, hierarchy, or fuzzy
  expansion; filtering never reorders matches.
- An external catalog selected through normal list, add, or refresh source
  options may omit the field; malformed present metadata is rejected by those
  consumers.
- Remove does not read a source manifest and remains valid when source metadata
  is absent, changed, or unavailable.

## Success Criteria

- **SC-001**: Focused fixtures prove omission yields `[]` across list, add,
  refresh preview, and refresh, while each invalid present form fails in list or
  add/refresh staging with actionable context.
- **SC-002**: The repository check finds exactly 16 maintained manifests, all
  seeded with the accepted assignments and identifiers; deleting any one
  declaration makes that check fail.
- **SC-003**: Local and external list fixtures retain every prior field and
  ordering while adding exact `use_cases`; human and JSON filters return the
  same exact-match set, including a successful empty set.
- **SC-004**: Existing lifecycle, source-resolution, profile, projection,
  rollback, routing, and read-only-list regressions pass with no discovery state
  added to the profile, and the authoring and user documentation agrees.
- **SC-005**: A pre/post byte comparison finds no change to any existing
  `ms-brand` surface and no new pack directory or manifest.

## Assumptions

- The maintained catalog is the 16 current directories that actually contain a
  manifest; the accepted assignments reflect their current descriptions and
  install guidance.
- One exact filter is the only current consumer requirement.
- Released cores may consume catalogs that predate this field, so omission must
  remain compatible without a migration or registry.

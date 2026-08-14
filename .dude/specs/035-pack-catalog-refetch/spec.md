# Feature Specification: Pack Catalog Re-fetch

## Purpose

A remote catalog operation can reuse a previously fetched checkout. For a
branch or tag, that can expose old bytes after the ref moves and report success
even though the publisher's correction is available upstream. For a full SHA,
the bytes remain exact, but reuse still violates the accepted requirement to
obtain upstream bytes on every invocation.

This feature makes every remote catalog-consuming invocation obtain upstream
bytes during that invocation, including when the requested ref is an immutable
full commit SHA. A full SHA still selects exact immutable content, but it does
not permit reuse of an earlier checkout. Branches, concrete tags, and moving
release selectors are all mutable. If the current bytes cannot be obtained, the
operation refuses rather than falling back to a stale or empty success.

The change preserves the existing authority of local catalogs and local target
packs, explicit source and ref selection, manifest fallback, local-only
operation, pack safety rules, and transactional installed-pack refresh. It adds
no distribution system, freshness state, persistent pack identity, or revision
display.

## User Scenarios & Testing

### User Story 1 - Receive a published correction on the next remote operation (Priority: P1)

As a pack consumer using a remote catalog, I want each operation to fetch its
selected upstream catalog again, so that a publisher's correction at a mutable
ref reaches my next list, installation, or refresh and an exact SHA still
selects its exact content without relying on an earlier checkout.

**Why this priority**: This is the correctness defect. Without fresh remote
resolution, a successful operation can silently project obsolete pack bytes.

**Independent Test**: Consume a remote catalog through a branch, then publish a
new commit at that branch between invocations. Confirm the next remote `list`
sees the changed catalog, the next remote `add` installs the changed pack, and
the next remote `refresh` projects the changed pack.

**Acceptance Scenarios**:

1. **Given** a remote branch whose catalog changes after an earlier fetch,
   **When** `list` next consumes that remote catalog, **Then** it enumerates the
   current upstream catalog rather than the prior fetched tree.
2. **Given** a missing local target pack and a remote branch that changed after
   an earlier fetch, **When** the pack is added, **Then** the installed
   projection comes from the branch's current upstream bytes.
3. **Given** an installed pack whose local target source is absent and whose
   remote branch changed after an earlier fetch, **When** the pack is refreshed,
   **Then** the existing transactional refresh uses the current upstream bytes.
4. **Given** a concrete remote tag that is moved to corrected pack bytes,
   **When** a later remote catalog operation uses that tag, **Then** it obtains
   the corrected bytes rather than treating the tag as immutable.
5. **Given** a moving release selector whose selected release changes,
   **When** a later remote operation uses that selector, **Then** the selector is
   resolved again and the newly selected catalog is consumed.
6. **Given** a full commit SHA, **When** the same remote source and SHA are used
   again, **Then** the operation fetches again and consumes the exact content
   selected by that SHA rather than reusing the earlier checkout.

### User Story 2 - Preserve established source selection and local authority (Priority: P1)

As a consumer with local packs or explicit source options, I want freshness to
change only remote fetching, so that existing local precedence and source
selection continue to mean the same thing.

**Why this priority**: Re-fetching the wrong source would fix staleness by
breaking established authority. The operation must refresh only when remote
resolution already participates.

**Independent Test**: Exercise whole-local-catalog listing, local target-pack
add and refresh, a missing local target alongside other local content, explicit
source and ref overrides, manifest fallback, local-only operation, and a released
bundle without `library/`. Confirm the same source wins as before and only the
selected remote path is re-fetched.

**Acceptance Scenarios**:

1. **Given** a local pack catalog, **When** packs are listed, **Then** the whole
   local catalog retains precedence and no remote fetch is required.
2. **Given** the requested target pack exists in the local catalog, **When** it
   is added or refreshed, **Then** that local target retains precedence even
   when remote source options are present.
3. **Given** the requested target pack is absent locally while other local packs
   or library content exists, **When** fetching is enabled, **Then** remote
   resolution still supplies that target.
4. **Given** remote resolution inputs, **When** source and ref are selected,
   **Then** explicit `--source` and `--ref` remain authoritative; with no
   explicit source, the manifest supplies the source and, unless `--ref` is
   explicit, its ref; with an explicit source and no explicit ref, the existing
   `main` default remains in effect.
5. **Given** local-only operation, **When** the required local catalog or target
   is absent, **Then** the operation refuses without contacting an upstream
   source.
6. **Given** a selected remote catalog, **When** freshness is applied, **Then**
   pack opt-in, namespace, ownership, release-channel selection, and installed
   refresh transaction behavior remain unchanged.
7. **Given** a released bundle that does not contain `library/`, **When**
   `list`, `add`, or `refresh` needs the configured remote catalog, **Then** the
   selected explicit or manifest source is fetched under the same freshness and
   failure rules.

### User Story 3 - Refuse when freshness cannot be established (Priority: P1)

As a consumer updating from a remote catalog, I want a failed or offline fetch
to stop clearly, so that stale cached bytes are never presented as a successful
current update.

**Why this priority**: A fallback to old bytes recreates the original defect and
makes the command's success report misleading.

**Independent Test**: Seed a fetched tree, make the selected remote unavailable,
and invoke each remote catalog-consuming operation again for mutable refs and a
full SHA. Confirm each operation fails clearly, no stale pack bytes are reported
as current, and add or refresh leaves installed state unchanged.

**Acceptance Scenarios**:

1. **Given** a prior fetched tree for a remote ref and an unavailable upstream,
   **When** remote `list` is invoked, **Then** it reports failure rather than a
   successful stale or empty list.
2. **Given** a prior fetched tree for a remote ref and an unavailable upstream,
   **When** remote `add` is invoked, **Then** it refuses and installs nothing.
3. **Given** a prior fetched tree for a remote ref and an unavailable upstream,
   **When** remote `refresh` is invoked, **Then** it refuses before the refresh
   transaction and leaves installed artifacts and their record unchanged.
4. **Given** a remote fetch that fails after freshness begins, **When** the
   operation returns, **Then** no prior cached tree is used as fallback and no
   success result claims current upstream bytes.

## Edge Cases

- A concrete published tag moves without changing its name. It is fetched again
  because only a full commit SHA is treated as immutable.
- `latest` resolves to a newly published stable release. The selector is
  resolved on the new invocation before its catalog is consumed.
- `latest` still resolves to the same tag, but that tag moved. The tag's catalog
  is still fetched again because the requested selector is not a SHA.
- A remote branch changes after `list` seeded the fetched tree and before `add`
  or `refresh`. Each later operation obtains its own current upstream tree.
- The local catalog directory exists but the requested target pack does not.
  `add` and `refresh` may still use the selected remote source, while `list`
  continues to prefer the whole local catalog.
- A stale fetched tree exists and the consumer is offline. Remote operations
  refuse; stale bytes are not a success fallback.
- The same full commit SHA is requested repeatedly. Each invocation fetches
  again and consumes that exact immutable object; an earlier checkout is never
  reused.
- A full SHA was fetched successfully and the upstream later becomes
  unavailable. The next invocation refuses despite the earlier checkout.
- A released bundle contains no `library/`. Its selected remote catalog remains
  available through explicit source/ref inputs or manifest fallback.

## Requirements

### Functional Requirements

- **FR-001**: Every `list`, `add`, or `refresh` invocation that consumes a remote
  catalog MUST obtain upstream bytes during that invocation for every ref form,
  including a full commit SHA.
- **FR-002**: Branches, concrete tags, and moving release selectors MUST be
  treated as mutable remote refs; a published tag MUST NOT be assumed immutable.
- **FR-003**: A moving release selector MUST be resolved on every invocation
  that consumes a remote catalog.
- **FR-004**: A full commit SHA MUST select its exact immutable content and MUST
  be fetched again on every remote invocation rather than reusing an earlier
  checkout.
- **FR-005**: When upstream bytes for any selected remote ref cannot be obtained
  during the current invocation, the operation MUST refuse clearly and MUST NOT
  use a previously fetched tree or report stale or empty success.
- **FR-006**: A refused `add` MUST install nothing, and a refused `refresh` MUST
  leave installed artifacts and their install record unchanged.
- **FR-007**: `list` MUST preserve whole-local-catalog precedence whenever the
  local catalog exists.
- **FR-008**: `add` and `refresh` MUST preserve local target-pack precedence and
  MUST continue to use remote resolution for a missing local target when
  fetching is enabled, even if other local catalog content exists.
- **FR-009**: Explicit source and ref values MUST remain authoritative. With no
  explicit source, the bundle manifest MUST supply the source and, unless a ref
  is explicit, its ref. With an explicit source and no explicit ref, the
  existing `main` default MUST remain in effect.
- **FR-010**: Local-only operation MUST continue to avoid remote access and
  refuse when the required local catalog or target is absent.
- **FR-011**: Pack opt-in, namespace, ownership, projection, inventory, and
  release-channel selection behavior MUST remain unchanged except for obtaining
  fresh bytes from the already-selected remote source.
- **FR-012**: Installed-pack refresh MUST preserve Feature 031's installed-side
  authority checks, source staging, destination-set difference, profile update,
  and all-or-restored transaction.
- **FR-013**: The feature MUST NOT add a freshness window, database, registry,
  persistent cache metadata, cache format, configuration surface, daemon,
  scheduler, workflow lane, revision display, persistent pack identity, or
  distribution infrastructure.
- **FR-014**: A released bundle without `library/` MUST retain remote `list`,
  `add`, and `refresh` through explicit source/ref selection or manifest
  fallback, subject to the same per-invocation fetch and refusal requirements.

### Key Entities

- **Remote catalog invocation**: One `list`, `add`, or `refresh` operation whose
  established source-selection rules choose an upstream repository.
- **Mutable remote ref**: Any remote ref other than a full commit SHA, including
  a branch, concrete tag, or moving release selector.
- **Immutable commit SHA**: A full Git object identifier whose selected content
  cannot change while the identifier remains the same, but that is still
  fetched during every remote invocation.
- **Fetched tree**: The invocation's local checkout used to read one selected
  remote catalog; it is not reused by a later remote invocation.
- **Current upstream bytes**: The bytes obtained from the selected remote source
  and ref during the present invocation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In a remote branch fixture, a catalog change published between two
  invocations is visible on the immediately following `list`, `add`, and
  `refresh`, with zero stale successful projections.
- **SC-002**: A force-moved concrete tag supplies its new pack bytes on the next
  remote operation, and a newly selected stable release is visible on the next
  invocation of a moving release selector.
- **SC-003**: Repeating an operation against one full commit SHA fetches again
  and selects exactly that commit's catalog after the source branch or tags
  move; making the upstream unavailable after the first invocation causes the
  repeat to fail rather than reuse the earlier checkout.
- **SC-004**: For a prior checkout plus an unavailable remote, `list`, `add`,
  and `refresh` each return failure for mutable refs and full SHAs; add creates
  zero installed artifacts and refresh leaves all installed artifacts and the
  install record byte-identical.
- **SC-005**: Local catalog listing and local target-pack add and refresh require
  zero remote fetches, while a missing local target still resolves remotely when
  fetching is enabled.
- **SC-006**: Explicit source/ref, manifest fallback, and local-only acceptance
  fixtures retain their prior source-selection outcomes: an explicit source
  with no explicit ref uses `main`, while manifest ref fallback applies only
  when source is not explicit. This includes a released bundle without
  `library/`.
- **SC-007**: All existing pack namespace, ownership, projection, inventory,
  add, remove, and transactional refresh regressions pass unchanged.
- **SC-008**: Inspection finds zero new freshness database, registry, persistent
  cache metadata, cache format, configuration surface, daemon, scheduler,
  workflow lane, revision display, persistent pack identity, distribution
  infrastructure, or conditional remote-checkout reuse capability.

## Assumptions

- Git remains available whenever a remote pack source is used.
- A full commit SHA is an immutable content selector, while abbreviated SHAs
  are not. Neither form permits reuse of an earlier remote checkout.
- Existing local-catalog and local-target precedence already represent accepted
  user authority and remain outside remote freshness behavior.
- `simplify-pack-updates` owns persistent pack identity and bookkeeping
  simplification; this feature adds neither.
- Feature 031 already owns safe installed-pack refresh and remains unchanged
  except that its selected remote source tree is current.

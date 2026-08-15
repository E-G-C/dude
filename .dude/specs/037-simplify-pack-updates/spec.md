# Feature Specification: Simplify Pack Updates

## Purpose

Installed-pack records currently retain source hashes, installed-output hashes,
a pack-manifest hash, and an aggregate inventory digest. Those fields support
source-tamper checks, installed-output drift refusal, and internal evidence
consistency, but they make ordinary publisher-to-consumer updates carry more
authority and bookkeeping than the accepted workflow needs.

This feature makes installed pack artifacts explicitly replaceable generated
projections. Refresh may overwrite them from the selected pack source, and
project customizations belong under the separate `dude-local-*` namespace.
The authoritative pack record keeps only opt-in membership, the exact installed
file list needed for ownership and uninstall, and an honest source identity.

The change deliberately gives up source-byte evidence, installed-output drift
refusal, pack-manifest hashes, inventory digests, rendered-output identity, and
unchanged-output optimization. It preserves pack lifecycle operations, source
selection, namespace and path safety, collision refusal, exact uninstall, and
rollback after a caught application failure. Remote catalog freshness remains a
separate feature.

## User Scenarios & Testing

### User Story 1 - Refresh a published pack without output-drift refusal (Priority: P1)

As a pack consumer, I want refresh to replace an installed pack projection with
the currently selected published projection, so that a publisher's correction
is applied directly instead of being blocked by stale output evidence.

**Why this priority**: This is the requested simplification. Installed pack
artifacts are generated output, not the supported place for project
customization.

**Independent Test**: Install a pack, change both its selected source and one
installed artifact, then refresh. Confirm the selected source is projected,
dropped files are removed, new files are added, and the local installed edit is
replaced rather than treated as drift.

**Acceptance Scenarios**:

1. **Given** an installed pack and a newer selected source, **When** the pack is
   refreshed, **Then** its recorded destinations are re-projected from that
   source without comparing prior source bytes or installed output hashes.
2. **Given** a hand edit inside an installed pack destination, **When** the pack
   is refreshed, **Then** the generated projection replaces that edit.
3. **Given** a source that adds and drops destinations, **When** refresh
   succeeds, **Then** the exact new file list is installed and no dropped
   pack-owned destination remains.
4. **Given** a source whose projection is observably unchanged, **When** refresh
   is requested, **Then** refresh still performs its normal projection path and
   does not claim an unchanged optimization.
5. **Given** a desired project-specific customization, **When** the user follows
   the documented ownership model, **Then** the customization is placed under
   `dude-local-*` rather than in replaceable installed pack output.

### User Story 2 - Keep lifecycle safety without persistent byte evidence (Priority: P1)

As a pack user, I want add, remove, refresh, status, and verification to retain
their established purposes and filesystem safety, so that simplifying the
record does not permit cross-pack deletion, traversal, collisions, or partial
caught-failure updates.

**Why this priority**: Removing hashes must not remove the concrete guards that
still protect owned paths and transactional lifecycle changes.

**Independent Test**: Exercise add, exact uninstall, refresh, status, and pack
verification against valid packs, cross-pack claims, occupied additions,
unsafe paths, symbolic links, and injected application failures. Confirm only
the deliberate hash-based refusals disappear.

**Acceptance Scenarios**:

1. **Given** a pack is added, **When** installation succeeds, **Then** it remains
   opt-in and records the exact destinations it owns.
2. **Given** an installed pack is removed, **When** uninstall succeeds, **Then**
   it deletes only that pack's exact recorded destinations and removes its
   membership record without requiring source or installed byte parity.
3. **Given** a refresh proposes a new destination already occupied or claimed
   by another pack, **When** preflight runs, **Then** refresh refuses before
   changing artifacts or the pack record.
4. **Given** any recorded or proposed destination escapes approved roots,
   violates the pack namespace, traverses a path, or encounters an unsafe
   symbolic link, **When** a lifecycle operation validates it, **Then** the
   operation refuses before mutation.
5. **Given** a caught artifact or record-write failure after application begins,
   **When** rollback completes, **Then** prior artifacts and the prior pack
   record are restored and transaction residue is removed.
6. **Given** status or verification is requested, **When** it runs, **Then** it
   reports or validates the supported pack state without reconstructing removed
   hashes or output identity.

### User Story 3 - Record honest source identity and transition current profiles once (Priority: P1)

As an existing user, I want my valid current pack profile to remain usable
without reinstalling packs, while new remote operations record the concrete
source revision they actually fetched.

**Why this priority**: A smaller record is not viable if current installations
must be discarded, and a source identity must not claim a commit that was never
known.

**Independent Test**: Start from the immediately preceding complete hash-rich
profile, exercise read and lifecycle operations, and confirm it deterministically
normalizes to the simplified model on the next successful profile write.
Separately install or refresh from a remote ref and from local Git and non-Git
sources, then inspect the resulting source identities.

**Acceptance Scenarios**:

1. **Given** a pack fetched from a remote repository, **When** add or refresh
   succeeds, **Then** its source identity contains the repository, the requested
   ref, and the concrete commit resolved by that fetch.
2. **Given** a local catalog or local-path source, whether Git-backed,
   uncommitted, or non-Git, **When** add or refresh succeeds, **Then** its source
   identity describes the local source honestly and does not invent a commit.
3. **Given** a complete valid profile in the immediately preceding hash-rich
   shape, **When** it is read and later successfully rewritten by an existing
   lifecycle operation, **Then** one deterministic transition removes the hash
   evidence while preserving pack membership, exact file lists, and honest
   source information.
4. **Given** a predecessor remote record that never persisted its resolved
   commit, **When** it transitions, **Then** the simplified record represents
   that commit as unknown rather than attributing an unproven revision; the next
   successful remote-backed refresh replaces the unknown value with its actual
   resolved commit.
5. **Given** a malformed, partial, older, mixed, or otherwise ambiguous profile
   shape, **When** it is read, **Then** it is rejected clearly without mutation
   rather than guessed, repaired, or migrated.

### User Story 4 - Understand the intentionally smaller authority (Priority: P2)

As a maintainer or pack user, I want the documentation and project guidance to
describe replaceable pack projections and the reduced record accurately, so
that I do not expect removed drift or tamper checks to protect custom edits.

**Why this priority**: Stale guidance would make the deliberate safety tradeoff
look like a defect and could direct users to customize generated output.

**Independent Test**: Inspect shipped pack guidance, release/setup guidance, and
project memory. Confirm they describe exact file-list authority, remote and
local source identity, replaceable projections, `dude-local-*` customization,
and caught-failure rollback without claiming any removed hash guard.

**Acceptance Scenarios**:

1. **Given** the shipped pack lifecycle guidance, **When** refresh and remove are
   described, **Then** it does not claim source-byte checking, installed-output
   drift refusal, a pack-manifest hash, or an inventory digest.
2. **Given** customization guidance, **When** a user wants to preserve a local
   change, **Then** it points to `dude-local-*` rather than editing installed pack
   output.
3. **Given** transaction guidance, **When** failure behavior is described,
   **Then** it promises restoration for caught application failures without
   claiming crash-proof atomicity.

## Edge Cases

- A user edits an installed agent or skill and then refreshes. The edit is
  overwritten because the destination is a replaceable projection.
- A user edits an installed artifact and then uninstalls. The exact recorded
  file list, not prior byte parity, determines what pack-owned destination is
  removed.
- A listed destination is missing. The operation must not infer another path or
  expand its deletion scope.
- A recorded destination has become a symbolic link or its ownership/path is
  unsafe. The operation refuses rather than following it.
- Two packs claim the same destination, or a proposed new destination is already
  occupied. Collision refusal remains pre-mutation.
- A remote branch, tag, moving release selector, or full commit is fetched. The
  recorded requested ref remains the caller-selected ref, while the resolved
  commit records the fetched revision.
- A `file://` Git source is fetched through the remote path. It receives remote
  repository/ref/commit identity; a directory read directly in place receives
  local identity.
- A local Git working tree contains uncommitted bytes. Its local identity does
  not imply that those bytes equal a commit.
- A predecessor remote record has a requested ref but no historical resolved
  commit. Transition records that absence honestly; it does not use the current
  ref target as proof of the older installed projection.
- A caught write failure occurs after several files change. Existing rollback
  restores the prior state; process termination or machine failure remains
  outside the guarantee.
- Catalog bytes change upstream. The separate catalog freshness behavior decides
  which source tree is selected; this feature only records identity and manages
  installed projections.

## Requirements

### Functional Requirements

- **FR-001**: The authoritative installed-pack profile MUST retain only the
  smallest state needed for opt-in pack membership, exact file-list ownership,
  and honest source identity; duplicate enabled-state and unused install-time
  bookkeeping MUST NOT remain.
- **FR-002**: The profile MUST NOT persist source-artifact hashes,
  installed-output hashes, a pack-manifest hash, an aggregate inventory digest,
  rendered-output identity, renderer identity, or model identity.
- **FR-003**: Installed pack artifacts MUST be treated as replaceable generated
  projections. Refresh MUST NOT refuse because a recorded destination's bytes
  differ from its prior generated bytes.
- **FR-004**: The supported location for persistent project customization MUST
  remain the `dude-local-*` ownership namespace, not installed pack output.
- **FR-005**: A newly fetched remote pack identity MUST contain the selected
  repository, the requested ref, and the concrete resolved commit from that
  fetch.
- **FR-006**: A local or non-Git source identity MUST describe the local source
  without inventing a commit or implying that uncommitted bytes equal a Git
  revision.
- **FR-007**: Source identity MUST NOT be presented as rendered-output identity
  or as proof that two projections are byte-identical.
- **FR-008**: Refresh MUST use its normal projection path on every request and
  MUST NOT add a source-, commit-, or output-based unchanged optimization.
- **FR-009**: Add, remove, refresh, status, and pack verification MUST preserve
  their existing purposes, invocation outcomes, local and released-bundle source
  support, and source-selection precedence except for the deliberately removed
  evidence checks.
- **FR-010**: Exact uninstall MUST derive deletion authority only from the
  installed pack's exact recorded file list plus current namespace, ownership,
  containment, and symbolic-link validation; it MUST NOT require source or
  installed byte parity and MUST NOT delete an unlisted destination.
- **FR-011**: Add and refresh MUST preserve pack namespace checks, path
  containment, cross-pack ownership checks, occupied-destination collision
  refusal, and the existing install overwrite semantics.
- **FR-012**: Add, remove, and refresh MUST preserve their all-or-restored
  behavior for caught application and profile-write failures, including exact
  prior profile restoration and transaction-residue cleanup, without claiming
  crash safety.
- **FR-013**: Status MUST remain read-only and MUST report the simplified pack
  state without calculating removed evidence or mutating a predecessor profile.
- **FR-014**: Pack verification MUST continue to validate catalog packs through
  the established temporary install, lint, exact uninstall, and leftover checks.
- **FR-015**: The system MUST support exactly one deterministic transition from
  the immediately preceding complete hash-rich profile shape to the simplified
  shape, preserving installed pack membership and exact file lists without
  requiring reinstall.
- **FR-016**: The predecessor transition MUST validate that complete predecessor
  shape before discarding its evidence, MUST preserve unknown historical remote
  commit state without invention, and MUST reject malformed, partial, older,
  mixed, or ambiguous shapes before mutation.
- **FR-017**: A successful profile-writing lifecycle operation MUST emit only
  the simplified profile shape; no duplicate old/new authority or general
  migration framework may remain.
- **FR-018**: Remote catalog freshness MUST remain owned by its existing separate
  behavior; this feature MUST NOT add a cache, freshness policy, re-fetch mode,
  or alternate source resolver.
- **FR-019**: Helpers, normalizers, compatibility branches, tests, docs, and
  project-memory rules whose only purpose is a removed hash or drift guard MUST
  be deleted or corrected rather than retained as dead machinery.
- **FR-020**: The feature MUST NOT add a new workflow lane, command, profile
  authority, state store, daemon, scheduler, background process, speculative
  framework, or crash-safety claim.

### Key Entities

- **Installed pack record**: One opt-in pack entry containing its exact installed
  file list and source identity.
- **Exact file list**: The complete set of top-level pack destinations and the
  sole persisted deletion set, constrained by current ownership and path safety.
- **Remote source identity**: Repository, requested ref, and resolved commit for
  a newly fetched remote source. A transitioned predecessor may honestly carry
  an unknown historical commit until the next remote-backed refresh.
- **Local source identity**: The location read directly as a local source,
  without a claimed commit.
- **Replaceable generated projection**: Installed pack output that may be
  overwritten or removed by pack lifecycle operations and is not a supported
  customization surface.
- **Predecessor profile**: The one immediately preceding complete profile shape
  containing versioned hash-rich inventories; it is the only accepted conversion
  input.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A newly written profile contains zero source-artifact hashes,
  installed-output hashes, pack-manifest hashes, aggregate inventory digests,
  rendered-output identities, renderer identities, model identities, duplicate
  enabled-state lists, or unused install timestamps.
- **SC-002**: Refresh replaces a hand-edited installed artifact, applies
  additions and removals, and records the exact resulting file list with zero
  output-drift refusals.
- **SC-003**: Exact uninstall removes every existing listed pack destination,
  removes zero unlisted destinations, and succeeds without source or installed
  byte comparison when all ownership and path checks pass.
- **SC-004**: Traversal, namespace violations, symbolic links, cross-pack claims,
  and occupied new destinations are all refused before mutation.
- **SC-005**: Injected caught failures during add, remove, refresh, or profile
  write restore the prior artifacts and profile bytes and leave zero transaction
  residue.
- **SC-006**: Remote branch, tag, release-selector, and full-commit fixtures
  record the exact requested ref and fetched commit; direct local Git and non-Git
  fixtures record no invented commit.
- **SC-007**: One valid immediately preceding profile transitions without pack
  reinstall and preserves all pack names and exact file lists; malformed,
  partial, older, mixed, and ambiguous fixtures all refuse with zero mutation.
- **SC-008**: Existing local catalog, remote released-bundle, explicit source/ref,
  manifest fallback, local-only, add, remove, refresh, status, and verify
  regressions retain their established outcomes apart from removed evidence
  refusals.
- **SC-009**: A refresh with the same source identity and same projected bytes
  still follows the normal refresh path, with no unchanged shortcut.
- **SC-010**: Inspection finds zero live helpers, normalizers, tests, docs, or
  project-memory rules that assert the removed source-byte, output-drift,
  pack-manifest-hash, or inventory-digest guards.
- **SC-011**: The implementation introduces zero new command, workflow lane,
  profile authority, state store, daemon, scheduler, background process,
  freshness mechanism, speculative framework, or crash-safety guarantee.

## Assumptions

- The exact file list and reserved pack namespace are sufficient persisted
  authority for installed pack removal under the accepted model.
- Hand-editing the profile remains unsupported; path and ownership validation,
  not a profile digest, bounds the damage an invalid record can request.
- An unknown historical resolved commit in a converted predecessor record is
  more honest than resolving its mutable ref later and attributing that newer
  commit to older installed bytes.
- Existing remote fetch behavior can expose the concrete fetched commit to the
  profile writer without changing catalog freshness policy.
- Direct local sources may be Git-backed but can contain uncommitted bytes, so a
  local path is the honest identity and no commit is recorded.
- Feature 031's caught-failure transaction remains the lifecycle foundation, but
  its hash-based installed-side and source guards are intentionally superseded
  by this feature.

## Out of Scope

- Reopening or extending remote catalog freshness.
- A rendered-output, renderer, model-map, or reproducible-build identity.
- Preserving hand edits made inside installed pack output.
- An unchanged-pack or unchanged-output optimization.
- Migration from any profile shape older than the immediately preceding complete
  hash-rich shape.
- Automatic repair of malformed, partial, mixed, or ambiguous profiles.
- Crash-proof transactions, locking, background updates, or cross-machine state.

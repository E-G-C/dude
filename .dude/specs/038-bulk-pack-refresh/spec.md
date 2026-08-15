# Feature Specification: Bulk Pack Refresh

## Purpose

People who upgrade Dude currently receive the new core while every installed
capability pack remains at its prior projection. They must remember and refresh
each pack separately. This feature adds an explicit `@dude upgrade --all` path
that completes the reviewed core upgrade first and then refreshes only the packs
the person already chose to install.

The sequence deliberately has two transaction boundaries. The reviewed core
upgrade is applied and committed before the upgraded engine describes any pack
changes. The person then receives an authoritative preview of installed-pack
additions, replacements, and removals and decides separately whether pack
mutation may begin. A pack refusal does not undo committed core or earlier
successful packs, and the operation never claims global atomicity.

Plain `@dude upgrade` remains core-only. The outcome preserves existing upgrade
safety, rollback, dry-run, status, source override, removal-deferment, no-push,
and no-auto-merge behavior while avoiding a second pack renderer, another source
of installed-pack authority, or speculative pre-upgrade pack rendering.

## User Scenarios & Testing

### User Story 1 - Explicitly upgrade core and all installed packs (Priority: P1)

As a Dude user, I want `@dude upgrade --all` to refresh the packs I have already
installed after upgrading core, so that one explicit workflow brings my selected
bundle capabilities up to date.

**Why this priority**: This is the requested outcome. Without an opt-in bulk
path, users still have to remember every per-pack refresh.

**Independent Test**: Start with several installed packs and reviewed core
changes. Invoke `@dude upgrade --all`, confirm the existing core upgrade, verify
that core is committed first, inspect the post-core pack preview, confirm packs
separately, and verify every installed pack refreshes and all successful output
is committed on the upgrade branch.

**Acceptance Scenarios**:

1. **Given** a reviewed core upgrade and two installed packs, **When** the user
   confirms core and later confirms the authoritative pack preview, **Then** core
   is committed first, both packs refresh, successful pack output is committed,
   and the branch is clean.
2. **Given** installed packs whose desired projections add, replace, and remove
   destinations, **When** the post-core preview is shown, **Then** it identifies
   those additions, replacements, and removals for each installed pack before
   pack mutation.
3. **Given** no installed packs, **When** `@dude upgrade --all` completes its
   core phase, **Then** it reports that there are no packs to refresh, requests no
   pack-mutation confirmation, creates no pack commit, and leaves the committed
   core result clean.
4. **Given** a successful pack preview, **When** the user declines or does not
   provide the explicit pack confirmation, **Then** no pack is mutated, committed
   core remains, and the upgrade branch remains clean.

### User Story 2 - Preserve installed-pack and source authority (Priority: P1)

As a Dude user, I want the bulk path to refresh exactly my installed packs from
the right source, so that it neither installs an unselected capability nor
changes local-development precedence.

**Why this priority**: Pack membership and source selection are authority
boundaries. A convenient bulk operation cannot weaken either one.

**Independent Test**: Use a profile containing selected and unselected packs,
provide one installed pack locally, and run another from a released bundle with
no local catalog. Confirm only profile members are considered, the local target
wins for local development, and the remote target uses the exact upstream
revision selected by the core upgrade.

**Acceptance Scenarios**:

1. **Given** installed and merely available packs, **When** the bulk path builds
   its preview and refresh set, **Then** it includes only membership in the
   canonical installed-pack map and never installs another pack.
2. **Given** an installed pack with an available local target source, **When** it
   is previewed and refreshed, **Then** the local target remains authoritative.
3. **Given** an installed pack that requires a remote source, **When** it is
   previewed and refreshed, **Then** it uses the same concrete upstream revision
   selected by the core upgrade rather than independently following a moving
   selector.
4. **Given** a released bundle without a local pack catalog, **When** a remote
   installed pack is included in `--all`, **Then** its preview and refresh succeed
   through the selected upstream revision without requiring a vendored catalog.

### User Story 3 - Retain safe partial progress (Priority: P1)

As a Dude user, I want bulk refresh to stop predictably on the first pack failure
while retaining and committing valid progress, so that a failed pack does not
erase the core upgrade or strand a dirty upgrade branch.

**Why this priority**: Several independent pack transactions cannot honestly be
presented as globally atomic. The useful and recoverable behavior is to retain
proven progress and report exactly where processing stopped.

**Independent Test**: Arrange three installed packs in deterministic order, make
the first refresh succeed and the second refuse, and confirm the third is not
attempted, the successful first-pack output is committed once, core remains
committed, the branch is clean, and the result distinguishes successful, failed,
and not-attempted packs.

**Acceptance Scenarios**:

1. **Given** the first pack refuses before any pack succeeds, **When** bulk
   refresh stops, **Then** core remains committed, no later pack is attempted,
   no pack commit is created, and the branch remains clean.
2. **Given** one successful pack followed by one failed pack, **When** bulk
   refresh stops, **Then** successful pack output is committed before return,
   later packs are not attempted, core is retained, and the branch is clean.
3. **Given** every installed pack succeeds, **When** the pack phase completes,
   **Then** all successful pack output is preserved in one coherent pack commit
   when there is a net change, rather than requiring one commit per pack.
4. **Given** a partial failure, **When** the result is reported, **Then** it names
   successful, failed, and not-attempted packs and makes no global-atomicity or
   automatic-core-rollback claim.

### User Story 4 - Keep ordinary upgrade behavior unchanged (Priority: P1)

As a Dude user, I want pack refresh to occur only when I explicitly select
`--all`, so that existing core upgrades, previews, status checks, rollback, and
safety controls behave as before.

**Why this priority**: Opt-in behavior is only safe if the established default
and recovery workflows remain stable.

**Independent Test**: Exercise plain upgrade, dry-run, rollback, status, source
and ref overrides, and deferred removals with and without `--all`. Confirm the
existing core-only paths are unchanged, no pre-core pack mutation or
authoritative pack preview occurs, and rollback can still operate from a clean
upgrade branch.

**Acceptance Scenarios**:

1. **Given** plain `@dude upgrade`, **When** it is previewed and applied, **Then**
   only core is considered and no pack preview, confirmation, refresh, or pack
   commit occurs.
2. **Given** a dry run with `--all`, **When** the reviewed core plan is shown,
   **Then** nothing is written and the result explains that an authoritative pack
   preview is available only after core is applied; it does not render a
   speculative pack plan.
3. **Given** an existing status or rollback request, **When** it runs, **Then**
   its established behavior and supported flags remain unchanged and `--all`
   creates no alternate rollback semantics.
4. **Given** a bulk upgrade, **When** either mutation phase begins, **Then** the
   existing clean-working-tree requirement, safety branch and tag, explicit core
   confirmation, rollback path, no-push rule, and no-auto-merge rule remain in
   force.

## Edge Cases

- **No installed packs**: finish after committed core without a pack confirmation
  or pack commit.
- **Pack confirmation refused**: retain committed core and mutate no packs.
- **First pack fails**: report it as failed, report every later pack as
  not-attempted, and keep the branch clean with no pack commit.
- **Later pack fails**: retain successful earlier pack transactions, commit their
  aggregate net output, stop, and report the remaining packs as not-attempted.
- **No net pack diff**: successful refreshes may require no pack commit; the
  branch still ends clean.
- **Local target and remote override both exist**: local target precedence wins.
- **Remote moving selector**: remote pack work binds to the concrete revision
  selected by core, not to the selector's later value.
- **Released bundle lacks the catalog**: remote resolution remains sufficient.
- **Rollback after pack success or partial failure**: the original safety tag
  remains the recovery boundary for the core and subsequent pack commit because
  no dirty output is left behind.
- **Commit failure**: do not misreport success or partial-failure completion; name
  the operational failure and recovery state instead.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST support `@dude upgrade --all` as the explicit
  opt-in path for a reviewed core upgrade followed by refresh of installed packs.
- **FR-002**: Plain `@dude upgrade` MUST remain core-only and MUST NOT preview,
  confirm, refresh, or commit pack output.
- **FR-003**: The reviewed core upgrade MUST use its existing explicit
  confirmation, apply, verification, safety branch and tag, and commit behavior,
  and MUST be committed before any authoritative pack preview or pack mutation.
- **FR-004**: After core is committed, the bulk path MUST use the upgraded engine
  to produce an authoritative per-pack preview of additions, replacements, and
  removals.
- **FR-005**: Pack mutation MUST require a separate explicit confirmation after
  the pack preview; declining or omitting that confirmation MUST mutate no packs.
- **FR-006**: The bulk pack set MUST be derived only from the canonical installed
  map, MUST use deterministic ordering, and MUST never install or enable a pack.
- **FR-007**: Pack preview and refresh MUST use the same canonical per-pack
  projection, ownership, source-selection, and transaction behavior as ordinary
  pack refresh and MUST NOT duplicate those mechanisms.
- **FR-008**: Local target-pack precedence MUST remain authoritative for local
  development.
- **FR-009**: A remotely resolved pack MUST use the concrete upstream revision
  selected by the core upgrade for both preview and refresh, including from a
  released bundle without a local catalog.
- **FR-010**: Each pack refresh MUST remain its own all-or-restored caught-failure
  transaction, separate from the core transaction and from every other pack.
- **FR-011**: On the first pack failure, the system MUST stop, retain committed
  core and earlier successful pack transactions, and MUST NOT attempt later
  packs or automatically roll back core.
- **FR-012**: Before a successful or partial-failure result returns, all
  successful pack output with a net change MUST be committed in one aggregate
  pack commit; per-pack commits MUST NOT be required.
- **FR-013**: A success or partial-failure result MUST leave the upgrade branch
  clean and MUST report successful, failed, and not-attempted packs.
- **FR-014**: With no installed packs, the system MUST skip pack confirmation and
  pack mutation and MUST report a core-only completion.
- **FR-015**: Dry-run with `--all` MUST remain write-free, MUST show the ordinary
  reviewed core plan, and MUST defer authoritative pack preview until after core
  application rather than introducing a speculative renderer.
- **FR-016**: Existing status, rollback, source/ref override, removal-deferment,
  lint, safety, no-push, no-auto-merge, and manual review behavior MUST remain
  unchanged except for the explicit post-core pack phase selected by `--all`.
- **FR-017**: The system MUST make no global atomicity or crash-proof claim
  across core and pack mutation.
- **FR-018**: The feature MUST add no workflow lane, registry, scheduler, daemon,
  second board, second persistent state, alternate renderer, or general
  orchestration framework.

### Key Entities

- **Core upgrade plan**: The reviewed core change set and selected upstream
  revision that authorizes the existing core transaction and supplies the
  concrete remote revision for later pack work.
- **Installed pack set**: The sorted membership of the canonical installed map;
  it is the complete bulk scope and never an installation request.
- **Authoritative pack preview**: The post-core description of one installed
  pack's additions, replacements, and removals produced by the upgraded engine's
  ordinary projection path.
- **Pack refresh transaction**: One installed pack's existing all-or-restored
  mutation boundary.
- **Aggregate pack commit**: At most one post-core commit containing the net
  output of all pack refreshes that succeeded before normal completion or the
  first pack failure.
- **Bulk result**: The outcome that distinguishes successful, failed, and
  not-attempted packs while retaining the committed core result.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In an all-success fixture with at least two installed packs, one
  `--all` flow commits core before preview, requires a second confirmation,
  refreshes both packs, creates at most one pack-output commit, and ends clean.
- **SC-002**: In a one-pack-refusal fixture, zero later packs are attempted, core
  remains committed, and the branch ends clean.
- **SC-003**: In a partial-progress fixture, every earlier successful pack's net
  output is present in one aggregate commit before return, while failed and
  not-attempted packs are reported separately.
- **SC-004**: With an empty installed map, zero pack previews requiring
  confirmation, mutations, installations, or pack commits occur.
- **SC-005**: A declined pack confirmation produces zero pack mutation while
  preserving committed core on a clean branch.
- **SC-006**: A local installed target uses local source bytes even when an
  upstream source and revision are supplied.
- **SC-007**: A remote installed target uses the exact concrete core-selected
  upstream revision, not a later moving selector value.
- **SC-008**: The bulk path previews and refreshes an installed remote pack from
  a released-bundle fixture with no `library/`.
- **SC-009**: Plain upgrade, dry-run, status, rollback, source/ref overrides,
  deferred removals, safety branch/tag, lint, no-push, and no-auto-merge
  regressions retain their established results.
- **SC-010**: Success, first-pack refusal, partial progress, no-installed-pack,
  confirmation-refusal, local-precedence, remote-binding, released-bundle, and
  dirty-worktree prevention cases all have direct focused coverage.
- **SC-011**: Inspection and regression checks find no duplicate projection,
  ownership, transaction, or installed-pack authority and no new lane, registry,
  scheduler, daemon, second persistent state, renderer, or framework.

## Assumptions

- Features 035 and 037 are complete and their behavior is the starting point.
- The installed map is valid when bulk processing begins; malformed profile
  behavior remains the existing Compose refusal path.
- Pack processing order is deterministic so successful, failed, and
  not-attempted reporting is reproducible.
- One aggregate post-core commit is the leanest grouping that preserves all
  successful pack output and leaves success or partial failure clean.
- A commit failure is an operational failure, not a successful or partial-failure
  completion, and must be reported without a false clean-branch claim.

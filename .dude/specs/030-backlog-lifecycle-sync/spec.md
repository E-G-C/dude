# Feature Specification: Backlog Lifecycle Sync

## Purpose

Correct two independent lifecycle defects while preserving the existing backlog design and authority model.

The first defect is projection freshness: a canonical task mutation can commit successfully while the two committed backlog artifacts continue to show the earlier task state. The second defect is lifecycle classification: an idea whose outcome was intentionally delivered by another feature, with no package of its own, has no valid terminal status and is therefore shown as awaiting definition.

The correction adds one package-less terminal lifecycle value and refreshes the existing derived backlog pair at the three proven post-commit boundaries. Canonical task, snapshot, and owner state remains authoritative. The backlog pair remains derived, and a projection failure never rewrites the meaning of a successful canonical commit.

## Scope And Supersession

This feature supersedes current lifecycle guidance that recognizes only draft and defined ideas, and current procedural-only backlog freshness for the three covered task mutation paths. It does not reopen or rewrite historical feature definitions.

Only `status: resolved` is added. A resolved idea intentionally owns no definition package. Existing draft and defined ownership semantics remain otherwise unchanged.

## User Scenarios & Testing

### User Story 1 - Record a completed outcome that needs no package (Priority: P1)

As a coordinator, I want an intentionally package-less completed idea to have a valid terminal lifecycle state so that it is not presented as work awaiting definition and cannot accidentally claim a package.

**Why this priority**: The current two-value lifecycle cannot truthfully represent an outcome already consumed and delivered elsewhere.

**Independent Test**: Validate draft, defined, and resolved ledgers; resolve a no-package idea; then inspect exact ownership and both backlog formats without creating a package.

**Acceptance Scenarios**:

1. **Given** an idea with exact `status: resolved`, an empty unnormalized `spec_path:` scalar value, no owner claim, and no owner or metadata diagnostic, **When** lifecycle inventory and lint inspect it, **Then** it is valid and contributes no exact package owner.
2. **Given** a resolved candidate with a nonempty or malformed path, an owner claim, malformed metadata, a metadata diagnostic, or any status spelling other than exact `resolved`, **When** validation and backlog derivation run, **Then** it is unavailable or ambiguous, contributes no owner, and is never classified Completed.
3. **Given** a valid resolved idea, **When** the backlog is derived, **Then** it appears exactly once in Completed, carries no task counts, and is absent from every awaiting-definition group and label.
4. **Given** an ordinary brainstorm refresh of a resolved ledger, **When** no explicit reopen is requested, **Then** resolved status and the empty path are preserved.
5. **Given** a user explicitly requests reopening through the supported brainstorm lifecycle route, **When** the refresh is accepted, **Then** the ledger returns to draft with an empty path and records the transition in its existing Coordinator Log.
6. **Given** a resolved ledger that has not been reopened, **When** definition or Ship attempts to create or select a package for it, **Then** the attempt stops before package or ownership mutation and points to explicit reopen.
7. **Given** runtime support for resolved ideas, **When** `core-dogfood-preview` is refreshed by the authorized lifecycle writer, **Then** its protected user sections are byte-identical, its status is resolved, its path is empty, no package is created, and one appended event records that Feature 012 consumed and delivered the outcome.

### User Story 2 - See committed task state in both backlog artifacts immediately (Priority: P1)

As a maintainer, I want covered canonical task mutations to refresh both committed backlog artifacts before the mutation command returns so that Active and Completed classifications do not lag behind authoritative state.

**Why this priority**: The live renderer is already correct; the reachable defect is that committed projections are not refreshed at the mutation boundary.

**Independent Test**: Claim and complete a task through each covered mutation route and compare both committed artifacts with a fresh derivation after every successful commit.

**Acceptance Scenarios**:

1. **Given** an open task, **When** a guarded state mutation successfully claims it, **Then** both committed artifacts immediately show the owning feature in Active.
2. **Given** an active final task, **When** a guarded state mutation successfully completes it, **Then** both committed artifacts immediately show the owning feature in Completed.
3. **Given** a successful batch state application, **When** it changes task lifecycle classification, **Then** both artifacts immediately match the complete post-commit state.
4. **Given** autonomous claim and completion mutations whose post-commit refresh succeeds, **When** each committed result returns, **Then** both artifacts are current and classify the feature correctly.
5. **Given** explicit backlog generation with writing enabled, **When** it succeeds, **Then** it uses the same pair refresh behavior as post-commit refresh.
6. **Given** a board-only render, a read, a dry run, or a failed or refused mutation, **When** it ends, **Then** it does not invoke the post-commit backlog refresh.

### User Story 3 - Preserve canonical success when projection refresh fails (Priority: P1)

As a maintainer, I want projection failures handled without undoing authoritative work, changing closed result meaning, or leaving a mismatched Markdown/HTML pair.

**Why this priority**: Treating a derived write as authoritative would corrupt successful task history, while allowing only one backlog artifact to advance would make the projection internally inconsistent.

**Independent Test**: Inject a failure during the second backlog write at guarded and autonomous boundaries; compare canonical poststate and backlog preimages, inspect the guarded exit and exact message, verify the autonomous result remains the existing exact committed receipt, and run the existing freshness check.

**Acceptance Scenarios**:

1. **Given** both backlog outputs can be rendered, **When** refresh starts, **Then** the complete Markdown and HTML postimages are prepared before either committed artifact is written.
2. **Given** a failure on the second artifact write, **When** refresh fails, **Then** both backlog artifacts are restored to their exact preimages, including prior absence.
3. **Given** a guarded canonical mutation has committed and backlog refresh then fails, **When** the command returns, **Then** canonical state remains committed, the exit is nonzero, and stderr is exactly `[FAIL] canonical state committed; backlog refresh failed` followed by one newline.
4. **Given** an autonomous canonical mutation has committed and backlog refresh then fails, **When** its boundary returns, **Then** it returns the unchanged closed committed-success result containing only `ok`, `phase`, and the original receipt; it adds no diagnostic or warning field.
5. **Given** that autonomous result and the restored backlog preimages, **When** existing freshness validation runs or the coordinator next refreshes the projection, **Then** the stale pair is mechanically detected or repaired without changing receipt meaning.
6. **Given** a projection failure after an autonomous commit, **When** downstream Work handling interprets the result, **Then** it is never represented as refusal, unchanged prestate, or rollback of canonical state.

## Edge Cases

- A resolved ledger has a valid-looking, dangling, unsafe, malformed, quoted-nonempty, or otherwise nonempty raw package path.
- A resolved candidate has an empty path but an owner claim, malformed frontmatter, an item-specific owner or metadata diagnostic, or non-exact status spelling.
- A resolved ledger is encountered by first-definition publication without a prior explicit reopen.
- An ordinary brainstorm refresh includes content edits but no explicit request to reopen.
- A resolved item has no specification, task file, task rows, or task-state snapshot.
- A resolved item appears in the optional order input or in non-authoritative relationship prose.
- One or both backlog artifacts are absent before refresh.
- Rendering fails before either backlog write.
- The first backlog write fails, or the second write truncates its target before failing.
- A covered batch application succeeds while changing zero task glyphs.
- An authoritative guarded or autonomous mutation fails before commit.
- An autonomous projection-only or owner-log mutation succeeds through the same authoritative boundary.
- Re-rendered output is byte-identical to the committed pair.
- A standalone Coordinator Log append, lifecycle refresh, or order change occurs outside a covered task mutation.

## Functional Requirements

- **FR-001:** Current idea metadata MUST accept exactly `draft`, `defined`, and `resolved` as lifecycle values; no fourth lifecycle value or compatibility alias MAY be added.
- **FR-002:** A valid resolved idea MUST have exact `status: resolved`, an empty unnormalized `spec_path:` scalar value checked before path normalization, no owner path or ownership claim, and no item-specific owner or metadata diagnostic. Any resolved candidate that fails one of those conditions MUST be unavailable or ambiguous, MUST contribute no owner, and MUST never be classified Completed.
- **FR-003:** Resolution reason and provenance MUST remain in the existing append-only Coordinator Log. No `resolution:` frontmatter, package, state file, registry, or parallel ledger MAY be introduced.
- **FR-004:** Ordinary brainstorm refresh MUST preserve resolved status and its empty path, just as it preserves defined ownership metadata. Reopening MUST require an explicit user lifecycle request through brainstorm and MUST return the idea to draft with an empty path and an appended lifecycle event.
- **FR-005:** First definition, redefinition, and Ship MUST NOT silently convert a resolved idea into a package owner. A resolved target MUST be explicitly reopened before definition.
- **FR-006:** Only a valid resolved idea as defined by FR-002 MUST appear exactly once in Completed. It MUST have no task counts or awaiting-definition language and MUST remain absent from Ideas awaiting definition.
- **FR-007:** `core-dogfood-preview` MUST be migrated only after resolved lifecycle support is active. Its complete `## Idea`, `## Open Questions`, and `## Assumptions` sections MUST remain byte-identical; it MUST become resolved with an empty path, gain exactly one lifecycle event naming Feature 012 as the consumer and deliverer, and gain no package.
- **FR-008:** One synchronous backlog-pair refresh operation MUST own committed Markdown and HTML writing, and existing explicit generate-with-write behavior MUST delegate to it.
- **FR-009:** Pair refresh MUST derive and fully render both outputs from one poststate before either write, retain both preimages including missing state, and restore both preimages if the pair write fails.
- **FR-010:** Pair refresh MUST run synchronously after successful guarded single-task writes, successful guarded batch-state writes, and successful autonomous lightweight applications.
- **FR-011:** Post-commit refresh MUST NOT run after board-only render writes, read commands, dry runs, or failed or refused canonical mutations.
- **FR-012:** Canonical task, task-state snapshot, and owner state MUST remain authoritative. Backlog failure MUST NOT roll back or alter any successfully committed canonical surface.
- **FR-013:** A guarded mutation followed by backlog failure MUST use the existing nonzero operation-error exit and write exactly `[FAIL] canonical state committed; backlog refresh failed` plus one newline to stderr, with no ordinary success line.
- **FR-014:** After an autonomous canonical mutation has committed and its existing receipt is valid, the autonomous lane boundary MUST synchronously attempt the backlog refresh. If refresh fails, it MUST preserve the restored pair preimages and return the unchanged closed committed-success result containing only `ok: true`, committed phase, and that receipt.
- **FR-015:** No autonomous post-commit backlog failure MAY return refusal, unchanged-prestate evidence, rollback, a second receipt, or a new lane-result, host-product, runner-result, audit, warning, or diagnostic field. This bounded observability limitation MUST be explicit: the existing backlog freshness check and its test/CI coverage detect the stale pair, and the next successful coordinator projection refresh repairs it.
- **FR-016:** Coordinator Activity refresh after standalone log-only writes, and refresh after brainstorm, definition, resolution, reopen, or order changes, MUST remain documented procedural steps in this feature rather than new automatic writer hooks.
- **FR-017:** Current lifecycle, backlog, and command guidance MUST describe resolved preservation, explicit reopen, covered post-commit freshness, failure authority, and the procedural limitation without promising broader synchronization.
- **FR-018:** Authoritative core source MUST be changed first; generated `.github` core MUST be refreshed only through the existing development build and MUST remain byte-equivalent to its source projection.
- **FR-019:** Focused and integrated tests MUST cover valid resolved metadata and invalid nonempty, malformed, owner-claiming, and diagnostic-bearing resolved shapes; migration preservation; correct claim and close classification for guarded single, guarded batch, and autonomous mutations; pair rollback on an injected second-write failure; the exact guarded stderr and exit; the exact unchanged autonomous result keys and receipt; stale-pair detection; and excluded paths.
- **FR-020:** The feature MUST NOT add a watcher, server, service, event bus, UI redesign, second board, new persistent state, generalized transaction framework, extra lifecycle metadata, autonomous result-schema or adapter machinery, or an automatic hook for every writer.

## Key Entities

- **Resolved Idea**: A terminal idea whose intended outcome is complete without a definition package, represented by exact `status: resolved`, an empty unnormalized `spec_path:` scalar value, no owner claim, and no item-specific owner or metadata diagnostic.
- **Canonical Mutation**: An accepted change to task, task-state snapshot, or owner state that remains authoritative regardless of derived backlog outcome.
- **Backlog Pair**: The committed Markdown and HTML lifecycle projections derived from the same authoritative workspace state.
- **Pair Preimage**: The exact prior bytes or prior absence of each backlog artifact.
- **Bounded Autonomous Observability**: The deliberate absence of a new autonomous result channel for a failed non-authoritative refresh; canonical success remains exact, while existing freshness validation and a later refresh expose or repair the stale pair.
- **Explicit Reopen**: A user-requested brainstorm lifecycle transition from resolved back to draft before any package definition.

## Success Criteria

- **SC-001:** Lifecycle matrix tests accept 100% of valid draft, defined, and resolved fixtures; every resolved fixture with a nonempty or malformed raw path value, owner claim, malformed metadata, item-specific owner or metadata diagnostic, or non-exact status fails valid-resolved classification; and zero resolved fixtures enter owner inventory.
- **SC-002:** The migrated `core-dogfood-preview` ledger has resolved status, an empty path, no package, one new Feature 012 resolution event, and byte-identical protected user sections.
- **SC-003:** Both committed backlog artifacts place `core-dogfood-preview` in Completed exactly once, show no task counts for it, and contain zero awaiting-definition occurrences for that idea.
- **SC-004:** Guarded claim, guarded close, batch claim/close, and autonomous claim/close fixtures each leave both committed artifacts byte-equal to a fresh render of the canonical poststate.
- **SC-005:** An injected second-write failure restores both backlog preimages byte-for-byte or restores their prior absence in every focused pair-safety fixture.
- **SC-006:** In every post-commit failure fixture, canonical task, snapshot, and applicable owner bytes remain at the committed poststate rather than the prestate.
- **SC-007:** Guarded failure fixtures use the existing operation-error exit and exact required stderr line; autonomous fixtures return exactly the existing three-field committed result with the original receipt and no added field, produce zero refusal or unchanged-prestate fields, and leave a stale pair that the existing freshness check reports.
- **SC-008:** Board render writes, reads, dry runs, and failed or refused mutations produce zero backlog refresh writes in focused fixtures.
- **SC-009:** Current source guidance and generated core agree on the three lifecycle values, strict valid-resolved predicate, explicit reopen, three covered hooks, authority split, bounded autonomous observability, and procedural limitation; no new lifecycle metadata, autonomous result or adapter field, or broad writer hook exists.
- **SC-010:** Focused tests, the full recursively discovered suite, development-build parity and idempotence, Dude lint, compose verification, pristine release build and release lint, repository diff checks, backlog freshness checks, and independent review all pass over one unchanged integrated revision.

## Assumptions

- Synchronous rendering and two local artifact writes are proportionate at the existing mutation boundaries.
- The existing Coordinator Log is sufficient resolution provenance.
- Feature 012 consumed and delivered the contributor-documentation outcome recorded by `core-dogfood-preview`.
- No current production caller needs a generic artifact transaction abstraction or automatic synchronization after every possible writer.
- No current accepted autonomous lane, host, runner, or audit result shape carries a compatible non-authoritative warning from lane application to user-visible Work output.
- The existing backlog presentation remains suitable once lifecycle membership, package-less detail, and freshness are corrected.

## Out Of Scope

- A dashboard redesign, new backlog view, second task board, or new lifecycle UI.
- Watchers, daemons, services, servers, event buses, background jobs, or repository-wide writer interception.
- Automatic refresh after every Coordinator Log, brainstorm, definition, lifecycle, order, import, or unrelated state write.
- A `resolution:` field, resolution object, package stub, migration state, compatibility status, or additional terminal value.
- Changing canonical task authority, tracked-work authority, owner identity, task transition rules, or receipt meaning.
- Extending autonomous lane results, host-adapter products, runner results, audits, or receipts solely to report a derived backlog refresh failure.
- Retrofitting other historical package-less ideas without a separate explicit lifecycle decision.

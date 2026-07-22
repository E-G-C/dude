# Feature Specification: Remove Legacy Compatibility

## User Scenarios & Testing

### User Story 1 - Establish a reproducible static footprint proxy (Priority: P1)

A bundle maintainer can compare a deterministic bundle-controlled static prompt/context source footprint proxy before and after each optimization checkpoint.

**Why this priority**: A frozen proxy and proven input parity are required before any reduction claim is meaningful.

**Independent Test**: Audit an unchanged checkout twice using the same ordered profile membership and prerequisites, persist the canonical baseline evidence, then compare identities and counts.

**Acceptance Scenarios**:

1. **Given** source/generated and source/installed parity, **When** a named profile is audited twice unchanged, **Then** its ordered inputs, identity, character count, and UTF-8 byte count are identical.
2. **Given** an unmet parity, readability, safety, or membership prerequisite, **When** baseline capture is attempted, **Then** that profile fails explicitly and no valid baseline is recorded for it.
3. **Given** release/source profiles and project-owned dogfood guidance, **When** both are audited, **Then** their inventories and totals remain separate.
4. **Given** an externally produced tokenizer-result data file pinned by its own SHA-256 and declaring tokenizer name, version, encoding, exact input hashes, and counts, **When** every audited input has one matching valid result, **Then** proxy token counts may be reported without executing tokenizer code; when no file is supplied token status is unavailable, and when supplied data is invalid the audit fails.
5. **Given** no host prompt trace or equivalent capture, **When** results are reported, **Then** they make no claim about actual runtime prompt membership, active context, or runtime token use.
6. **Given** an accepted checkpoint audit, **When** it is recorded, **Then** the complete machine-readable report is preserved at that checkpoint's one canonical evidence location and its hash is recorded in the human summary.
7. **Given** a report with an unknown field, missing field, invalid prerequisite detail, contradictory tokenizer state, inconsistent subtotal or aggregate, or unchanged content hash with changed counts, **When** it is compared, **Then** comparison fails rather than normalizing or trusting the report.
8. **Given** a profile whose source and installed artifacts were produced through supported normalization, **When** parity is checked, **Then** the persisted source identity and the separately recorded source and installed hashes are honored without requiring those two hashes to equal.
9. **Given** repeated or command-inapplicable options, **When** an audit or comparison is requested, **Then** the request fails as a usage error rather than ignoring an option.

### User Story 2 - Support only the current canonical format (Priority: P1)

A current-format user encounters no shipped command, fallback, diagnostic, or machinery whose sole purpose is recognizing or migrating retired formats.

**Why this priority**: Removing compatibility behavior is the primary reduction and simplifies every later checkpoint.

**Independent Test**: Exercise supported current-format workflows and stale-contract checks after each independently green deletion slice.

**Acceptance Scenarios**:

1. **Given** canonical project state, **When** supported definition, execution, maintenance, generation, and release workflows run, **Then** current data and active work remain usable and unchanged except for the requested operation.
2. **Given** a retired command or path, **When** it is explicitly requested, **Then** it is rejected as unsupported without translation, scanning, migration, or deletion.
3. **Given** a current destructive maintenance operation, **When** confirmation or expected state is missing or wrong, **Then** the operation refuses safely with actionable guidance.
4. **Given** historical ideas, prior feature packages, or append-only Coordinator Log entries containing retired terms, **When** active-contract checks run, **Then** that evidence is preserved and classified separately.

### User Story 3 - Resolve canonical feature ownership deterministically (Priority: P2)

A current workflow can list defined features or resolve one exact specification to its unique idea owner through one shared, read-only, fail-closed mechanic.

**Why this priority**: Exact ownership is repeated current-format behavior and is the one bounded extraction justified by this package.

**Independent Test**: Resolve valid owners and reject malformed, missing, dangling, unsafe, noncanonical, or duplicate ownership without mutation.

**Acceptance Scenarios**:

1. **Given** valid unique owners, **When** features are inventoried, **Then** results are deterministic, sorted, and machine-readable.
2. **Given** one exact canonical specification identity, **When** ownership is resolved, **Then** the exact owner is returned without guessing from names.
3. **Given** any ownership error, **When** inventory or resolution runs, **Then** structured diagnostics identify the problem and mutation-oriented consumers fail closed.
4. **Given** a current consumer of ownership data, **When** the shared resolver is available, **Then** the consumer calls its library boundary rather than importing or spawning its command adapter or retaining a second scanner.

### User Story 4 - Reduce wording without overstating preservation (Priority: P2)

A bundle user receives shorter common-workflow guidance while preserved authority, routing, safety, ownership, source-of-truth, and completion-evidence outcomes remain demonstrable.

**Why this priority**: Smaller static sources are useful only when their observable workflow contracts remain intact.

**Independent Test**: Run structural contract checks and the same dogfood scenario matrix at baseline, post-deletion, and post-reduction, then strictly compare the three canonical checkpoint reports for the frozen proxy profiles.

**Acceptance Scenarios**:

1. **Given** unchanged profile membership and prerequisites, **When** common guidance is reduced, **Then** the aggregate static character and byte footprint is lower than at the post-deletion checkpoint.
2. **Given** a canonical rule owner guaranteed to load for a workflow, **When** duplicate wording is removed, **Then** references remain unambiguous; otherwise essential behavior stays locally explicit.
3. **Given** reproducible host invocation, **When** checkpoint scenarios run, **Then** outcomes are captured and classified without requiring identical generated prose.
4. **Given** no reproducible host invocation, **When** preservation is assessed, **Then** automated claims are limited to structural contracts and documented manual dogfood evidence is required before claiming behavioral preservation.

### User Story 5 - Fail closed at reviewed-state boundaries (Priority: P1)

A bundle maintainer can rely on destructive, normalization, import, ownership, mirror, audit, and task-state operations to use the exact evidence they reviewed and to refuse safely when that evidence is incomplete, unsupported, or changed.

**Why this priority**: Green aggregate tests do not justify acceptance when a stale plan, incomplete inventory, unsafe path, malformed identity, unsupported status, or corrupt snapshot can authorize mutation or suppress a required diagnostic.

**Independent Test**: For each boundary, first reproduce the accepted failure in an isolated fixture, then require the repaired operation to return its documented failure classification with every protected byte and external sentinel unchanged.

**Acceptance Scenarios**:

1. **Given** a reviewed upgrade plan, **When** its persisted buckets, source or resolved ref, cached bytes, local expected state, or bundle manifest changes before apply, **Then** apply refuses before creating a tag, branch, log entry, or file mutation.
2. **Given** an installed pack, **When** destructive removal lacks a complete current inventory or exact installed-artifact hashes, **Then** removal refuses without deleting an artifact or rewriting the profile; a later write failure restores every prior byte.
3. **Given** installed agent normalization, **When** the agent root, category, or target is symbolic-link-backed, escapes containment, or carries duplicate or mixed semantic `model:` metadata, **Then** normalization refuses before any rewrite and preserves every external target.
4. **Given** feature-owner metadata, **When** top-level metadata is unsupported or semantically duplicated, or a draft carries a non-empty specification path, **Then** inventory reports a diagnostic and every mutation-oriented consumer stops before query or write.
5. **Given** a remote import, **When** the source is outside the documented HTTPS GitHub hosts, contains credentials or a nonstandard port, redirects outside the policy, exceeds the byte limit, or produces a noncanonical skill name, **Then** import refuses before destination creation or replacement.
6. **Given** two audit reports, **When** a counted enabled-pack input changes without its linked inventory evidence, **Then** comparison fails rather than accepting the evidence.
7. **Given** an exact-feature executable Beads issue, **When** its status is missing or outside the supported markdown mapping, **Then** inspection and write modes both report it as unsupported and leave the mirror unchanged.
8. **Given** a task-state snapshot, **When** it is unreadable, malformed, or wrong-schema, **Then** the operation distinguishes corruption from legitimate absence, fails closed on corruption before any mutation, and preserves every unrelated feature's entries when it writes.

## Edge Cases

- Profile membership, order, parity, or tokenizer identity drifts between checkpoints.
- A counted input is missing, duplicated, unreadable, unsafe, or changes during inspection.
- A root, ancestor, or input identity changes and remains changed long enough to be observed during a read.
- A hostile concurrent process performs a transient hierarchy swap that a dependency-free cross-platform reader cannot guarantee it will observe.
- A tokenizer-result file is missing an input, repeats an input, names the wrong content hash, contains an unsafe token count, or changes from the hash supplied by the caller.
- A report is structurally valid JSON but has extra keys, contradictory prerequisite details, invalid token nullability, inconsistent subtotals or aggregates, or count drift under an unchanged content hash.
- A persisted pack source is unavailable or mismatched, or supported installation normalization makes source and installed hashes intentionally different.
- An installable skill accidentally includes its test suite.
- A command repeats an option or supplies an option that belongs to a different command.
- Project-owned guidance changes while release/source profiles do not.
- Generic noncanonical directories exist as ordinary project content.
- A canonical owner is malformed, dangling, unsafe, missing, or duplicated.
- Consumer cleanup leaves a transitional provider present but unreachable until its verified deletion slice.
- Wording reduction creates a reference to guidance not guaranteed to load.
- A current guarded write encounters input drift, interruption, or rollback failure.
- Historical evidence contains retired terms that active-contract checks must not rewrite.
- A persisted upgrade plan is structurally valid but its source/ref identity, cached file bytes, local mutation target, or manifest has drifted.
- A legacy or partially populated install profile is readable for diagnosis but lacks enough current inventory evidence to authorize deletion.
- An agent carries two valid injected `model:` keys, or one valid key plus a malformed or quoted semantic duplicate.
- Feature metadata uses a quoted key, alternate key spelling, duplicate semantic key, unsupported top-level data, or `status: draft` with a live non-empty `spec_path`.
- A remote source uses HTTP, credentials, a nonstandard port, an internal host, a cross-host redirect, an oversized body, or a skill name containing separators or control characters.
- A counted enabled/profiled-pack input changes while its linked inventory digest remains unchanged.
- An executable Beads issue uses `paused`, a future status, or no status.
- Task-state is absent, unreadable, malformed, or wrong-schema.

## Functional Requirements

- **FR-001**: The audit MUST describe its output as a deterministic bundle-controlled static prompt/context source footprint proxy, never as actual active context.
- **FR-002**: Each proxy profile MUST have stable ordered membership, explicit activation assumptions, and parity/readability/path-safety prerequisites that fail closed before checkpoint acceptance.
- **FR-003**: Release/source workflow profiles and project-owned dogfood guidance MUST be inventoried and reported separately.
- **FR-004**: Every valid report MUST contain internally consistent per-input, profile-total, and aggregate character and UTF-8 byte counts; proxy token counts require one unchanged pinned tokenizer-result identity and configuration.
- **FR-005**: Actual runtime prompt or token claims MUST require a host prompt trace or equivalent capture identifying the runtime inputs.
- **FR-006**: Baseline, post-deletion, and post-reduction comparisons MUST use unchanged profile membership and order and MUST consume the complete canonical report retained for each checkpoint.
- **FR-007**: Retired command, layout, profile, identity, upgrade, bootstrap-cleanup, test, documentation, and packaging behavior MUST be removed without a hidden fallback or replacement migration path.
- **FR-008**: Current-format definition, execution, maintenance, generation, release, confirmation, integrity, atomicity, rollback, and user-readable failure contracts MUST remain supported.
- **FR-009**: Consumer cleanup MUST precede deletion of transitional providers, and every implementation task MUST end with its focused checks green.
- **FR-010**: Current project guidance MUST be updated during execution before post-deletion dogfood validation, while prior ideas, specifications, and Coordinator Log entries remain immutable evidence.
- **FR-011**: Active stale-contract checks MUST cover shipped sources, generated and installed artifacts, public documentation, and current project-owned guidance while distinguishing historical evidence.
- **FR-012**: The same dogfood scenario matrix MUST capture baseline, post-deletion, and post-reduction outcomes for routing, exact-owner ambiguity, retired input rejection, destructive confirmation refusal, execution source-of-truth, and completion evidence.
- **FR-013**: Source-contract tests are necessary but MUST NOT alone justify a behavioral-preservation claim.
- **FR-014**: One shared read-only resolver MUST return sorted feature inventory or one exact owner plus structured diagnostics and MUST never mutate, allocate, route, approve, or infer an owner.
- **FR-015**: Lint MUST be able to aggregate resolver diagnostics, while Beads and other mutation-oriented consumers MUST fail closed on any error.
- **FR-016**: The resolver is the only automation extraction in this package; the six larger candidates recorded in research MUST remain deferred.
- **FR-017**: Wording reduction MUST preserve required local semantics where runtime discovery does not guarantee loading of a canonical owner.
- **FR-018**: Final verification MUST cover focused and full tests, source/generated/installed parity, current-profile integrity, stale active contracts, proxy consistency, fresh release contents, and unrelated-change hygiene.
- **FR-019**: Token counts MUST come only from an optional read-only tokenizer-result data file whose supplied SHA-256, exact schema, tokenizer name/version/encoding, complete input coverage, content hashes, and non-negative safe-integer counts validate; the audit MUST NOT import, spawn, evaluate, or otherwise execute tokenizer code. No supplied file MUST produce an explicit unavailable token status, while a supplied invalid file MUST fail the audit.
- **FR-020**: Complete machine-readable reports MUST be retained only as `baseline`, `post-deletion`, and `post-reduction` evidence in one canonical snapshot collection; each report MUST be replaced only by its owning checkpoint and MUST match the hash documented in the human summary, with no hidden or second snapshot store.
- **FR-021**: Audit and comparison inputs MUST satisfy exact top-level and nested schemas, prerequisite status/detail rules, tokenizer status/count nullability, per-input/profile/aggregate arithmetic, and unchanged-content count invariants; comparison MUST reject every inconsistency.
- **FR-022**: File inspection MUST reject static symbolic links and containment violations, use a no-follow final-open safeguard where the platform provides one, and compare root, ancestor, and input identities before and after reading. It MUST detect observed hierarchy or input drift but MUST NOT claim race-free protection from adversarial transient replacement; accepted evidence assumes a locally controlled workspace without concurrent hostile mutation.
- **FR-023**: Enabled-pack parity MUST resolve a persisted source identity when present, validate source and installed artifacts against their respective recorded hashes, and validate the inventory digest using canonical composition ordering; supported normalization MUST NOT be rejected merely because source and installed hashes differ.
- **FR-024**: Installable audit artifacts MUST contain runtime guidance and tooling only; their test suites MUST remain outside installable skill directories and MUST be absent from installed artifacts.
- **FR-025**: Audit and comparison commands MUST reject duplicate options, unknown options, missing option values, and options inapplicable to the selected command as usage errors.
- **FR-026**: Upgrade apply MUST require a clean working tree and MUST NOT provide a dirty-tree override. It MUST consume exact persisted reviewed operation buckets bound to source identity, requested and resolved ref, the resolved concrete source commit, a cache path/type/content inventory and bytes, each mutation target's expected content hash or missing state, and current bundle-manifest bytes, and MUST execute those buckets directly without deriving a replacement plan. Any bound-evidence drift, any pre-versioned plan format, or a local-path `latest` request MUST return the documented operation failure before any safety tag, branch, checkout, log, manifest, or file mutation. Git hooks MUST be disabled only for the upgrade's own checkout and commit commands; recovery after a post-mutation failure relies on the safety tag and upgrade branch and MUST NOT promise byte-perfect restoration of arbitrary dirty or untracked state. Metadata-only manifest transitions and collision-safe exclusive plan creation remain, and shipped `@dude migrate layout` guidance MUST be removed in favor of current-only external or manual recovery.
- **FR-027**: Destructive pack removal MUST require a complete current inventory and exact installed-artifact hash verification before deleting any artifact or rewriting the profile; inventory-less or incomplete-inventory removal MUST refuse, while legacy or partial profile evidence MAY remain readable for status and diagnosis only. The existing transactional artifact and profile backup MUST restore every prior byte on a failed write. No separate removal-plan artifact, digest-bound plan stage, or literal confirmation token is required.
- **FR-028**: Agent normalization MUST accept at most one well-formed host-injected `model:` key, treat duplicates or mixed semantic forms as drift, reject symbolic-link-backed roots, categories, or targets, preflight the complete write set, and preserve workspace containment.
- **FR-029**: Feature ownership inventory MUST diagnose unsupported top-level metadata, semantic duplicate owner fields, and `draft` with a non-empty specification path. Supported quoted scalar values MUST remain unambiguous and canonical, and mutation-oriented consumers MUST stop on every diagnostic.
- **FR-030**: Remote import MUST accept only documented HTTPS GitHub file hosts without credentials or nonstandard ports, MUST disable HTTP redirects rather than following them, and MUST cap response bytes before complete buffering. Imported skill names MUST be one canonical discoverable path segment with no separator or control character.
- **FR-031**: Audit comparison MUST require a changed counted input for an enabled or profiled pack to advance its linked inventory evidence, failing a report whose counted input changed while its linked inventory digest did not.
- **FR-032**: Beads mirroring MUST reject every exact-feature executable issue whose status is absent or outside the supported status-to-glyph mapping before dry-run reporting or mutation.
- **FR-033**: Task-state reading MUST distinguish legitimate absence from unreadable, malformed, or wrong-schema corruption, MUST validate the exact schema, and MUST fail closed on corruption before any mutation. A validated task-state write MUST preserve every unrelated feature's entries.

## Key Entities

- **Static Footprint Proxy Profile**: A named, ordered set of bundle-controlled source inputs plus explicit prerequisites and activation assumptions.
- **Dogfood Guidance Inventory**: Project-owned guidance counted separately from distributable bundle sources.
- **Audit Report**: A complete non-mutating checkpoint record containing exact schema identity, inventory, counts, prerequisites, and optional pinned tokenizer-result metadata.
- **Tokenizer Result Manifest**: Externally produced read-only data pinned by its own content hash, declaring one tokenizer configuration and exact per-input content hashes and token counts.
- **Checkpoint Evidence Collection**: The sole three-report machine-readable record for baseline, post-deletion, and post-reduction, paired with hashes in the human summary but not used as a live execution ledger.
- **Canonical Feature Owner**: One defined flat idea whose exact specification identity points to an existing canonical specification.
- **Structured Diagnostic**: A deterministic issue with code, severity, path, and message.
- **Historical Evidence**: Prior project-state content retained for audit history but excluded from active contracts.
- **Reviewed Operation Plan**: A persisted upgrade record of exact source identity, resolved concrete commit, expected local state, and selected operation buckets consumed directly without reclassification.
- **Current Pack Removal Evidence**: A complete versioned inventory whose exact profile, artifact paths, and installed hashes authorize a destructive removal.
- **Task-State Snapshot**: A strictly validated coordinator-owned map from canonical task-file identities to glyph records and update timestamps; absence is valid, corruption is not.

## Success Criteria

- **SC-001**: Every profile accepted in the canonical baseline report reproduces identical ordered inventory and character/byte totals across two unchanged runs; unmet prerequisites produce no accepted baseline.
- **SC-002**: Active-source, generated, installed, documentation, project-guidance, and release checks find zero unallowlisted retired contracts after deletion.
- **SC-003**: All six dogfood scenarios have baseline, post-deletion, and post-reduction evidence; intentional retired-input changes are identified, and every preserved outcome matches its expected classification.
- **SC-004**: Strict comparison of the three canonical reports shows that the aggregate static character and byte proxy is lower after deletion than at baseline and lower after wording reduction than after deletion; token deltas are reported only under FR-004 and FR-019.
- **SC-005**: Resolver tests accept all valid unique-owner fixtures and reject every malformed, missing, dangling, unsafe, noncanonical, or duplicate case before mutation.
- **SC-006**: Every task checkpoint is green, final repository and fresh-release gates pass, installed audit artifacts contain no test file, and unrelated dirty work plus historical evidence remain unchanged.
- **SC-007**: Adversarial report, tokenizer-result, path-drift, persisted-source, normalization, and command-option fixtures all fail or pass according to FR-019 through FR-025 without mutation.
- **SC-008**: Cache, local-target, manifest, and source/ref upgrade drift fixtures on a clean working tree, and profile, artifact, and inventory compose-removal drift fixtures, all refuse before mutation, and a compose-removal write failure restores every protected artifact and profile byte.
- **SC-009**: Symlink/external-sentinel, duplicate-model, strict-owner, remote-source, oversized-response, and invalid-skill-name fixtures all fail closed with zero destination mutation.
- **SC-010**: Forged audit linkage, unsupported Beads status, and corrupt task-state snapshot fixtures preserve all protected evidence, and a validated task-state write preserves every unrelated feature's entries.
- **SC-011**: After counted guidance is repaired, only the post-reduction report is recaptured with the accepted audit runtime; after audit hardening and authoring refresh, both historical comparisons, all three documented report hashes, the full repository/release gate, and the six-scenario read-only matrix remain valid.

## Assumptions

- Retired formats are unsupported inputs after this feature and are neither detected nor repaired automatically.
- Static source membership is only a proxy for what a host may load; project guidance is counted because dogfood workflows direct agents to inspect it, not because runtime inclusion is proven.
- The current runtime remains dependency-free; optional token information is externally produced JSON data pinned by SHA-256, never executable adapter code.
- Canonical machine-readable checkpoint reports are reviewed evidence under `docs/context-footprint-snapshots/`, while `docs/context-footprint.md` remains their human summary and hash index.
- Audit callers run in a locally controlled workspace without concurrent hostile hierarchy mutation; the tool reports observed drift and does not promise an impossible cross-platform race-free read.
- This remains one package because deletion, one resolver extraction, and wording reduction share one frozen comparison chain and an ordered dependency. The larger automation candidates remain deferred, and each phase must be independently green and reversible.
- No new project-specific guardrail is needed; these constraints are feature acceptance requirements.

## Out of Scope

- Migrating or repairing retired state.
- Rewriting prior ideas, prior feature packages, or earlier Coordinator Log entries.
- Implementing workflow collection, ledger editing, task reconciliation, definition allocation, Beads mirror automation, or roster ranking.
- Automating semantic deduplication, ambiguity resolution, guardrail inference, review, or approval.
- Loading or executing tokenizer adapters, tokenizer packages, or any other code supplied as token-count input.
- Maintaining raw audit reports anywhere outside the canonical checkpoint evidence collection.
- Claiming actual runtime prompt/token reduction without a host trace or equivalent capture.
- Implementing product code, importing tasks into Beads, or changing live execution state during this definition.
- Inspecting, deleting, translating, or otherwise acting on the inert zero-byte `.github/dudestuff/bundle-manifest.md` tombstone.
- Removing read-only support for diagnosing historical install-profile shapes; only their use as destructive authorization is prohibited.
- Build-development or scaffolder transactionality, unused `deriveImportTarget` cleanup, cosmetic footprint-document edits, new automation candidates, and opportunistic refactors.
- Threat-model defenses beyond the locally-controlled workspace: hostile Git-hook containment through commit, dirty-index or untracked-file byte restoration, hard-link or inode-alias refusal in upgrade apply, a two-stage removal-plan artifact with a literal confirmation token, post-final-descriptor path or hierarchy race re-verification, and mandatory atomic-paired task-file and snapshot rollback.
- Rewriting `baseline.json` or `post-deletion.json`, or treating the current three reports as known-corrupt evidence.
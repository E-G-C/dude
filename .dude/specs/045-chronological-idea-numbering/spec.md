# Feature Specification: Chronological Idea Numbering

## Purpose

Idea ledgers currently sort by an unnumbered filename, so an inventory presents
alphabetical identity rather than capture chronology. A person cannot readily
see where a new idea landed or follow one stable identity from brainstorm
through definition.

This feature assigns one permanent, zero-padded lifecycle number when an idea is
first captured. The number appears in the direct idea filename, orders and
labels idea inventory, and is reused by the feature package if that idea is
defined.

The number means lifecycle identity and capture order only. It conveys no
priority, dependency, readiness, scheduling, task phase, or execution order.
Direct idea ledgers and direct feature packages remain the only allocation
evidence; no registry or counter becomes a second authority.

## User Scenarios & Testing

### User Story 1 - Capture a new idea at the chronological end (Priority: P1)

As a person brainstorming work, I want a new idea to receive the next permanent
lifecycle number at first capture, so that I can find it in chronological
inventory without maintaining another index.

**Independent Test**: Begin with clean direct idea and package inventories whose
highest valid number is `044`, including a lower gap. Capture a new slug and
confirm that exactly one `045-<slug>.md` ledger is created, the gap is not
filled, and a refresh, resolution, or reopen retains `045`.

**Acceptance Scenarios**:

1. **Given** valid direct inventories with an observed maximum below `999`,
   **when** a previously uncaptured slug is brainstormed, **then** the new ledger
   receives the observed maximum plus one as an exactly three-digit prefix.
2. **Given** lower gaps in otherwise valid inventories, **when** a new idea is
   captured, **then** allocation ignores the gaps and advances beyond the
   maximum.
3. **Given** an existing draft, defined, or resolved ledger, **when** it is
   refreshed or explicitly reopened through allowed lifecycle behavior, **then**
   its filename number is retained and no new number is allocated.
4. **Given** a malformed, duplicate, colliding, unreadable, or unsafe direct
   inventory, **when** capture is requested, **then** the mutation stops before
   creating or changing a ledger and reports the exact conflicting evidence.
5. **Given** `999` as the valid observed maximum, **when** another first capture
   is requested, **then** capture reports exhaustion and creates neither `000`,
   a reused gap, nor a value wider than three digits.

### User Story 2 - Define an idea without changing its identity (Priority: P1)

As a person defining a captured idea, I want its feature package to reuse the
idea's lifecycle number, so that brainstorm and feature artifacts remain one
recognizable lifecycle.

**Independent Test**: Select one numbered draft by its exact slug, define it,
and confirm that its package uses the same prefix, no next feature number is
allocated, and exact `spec_path:` ownership is the only owner relation.

**Acceptance Scenarios**:

1. **Given** `.dude/ideas/045-example.md` with exact `slug: example`,
   `status: draft`, and an empty `spec_path:`, **when** first definition
   succeeds, **then** the package is
   `.dude/specs/045-example/` and the ledger points exactly to its `spec.md`.
2. **Given** a higher-numbered package or idea is created after the selected
   draft, **when** that earlier draft is defined, **then** definition still uses
   the selected draft's permanent number rather than the current maximum.
3. **Given** an existing artifact already claims the selected number
   inconsistently, **when** first definition is requested, **then** definition
   stops before writing instead of allocating a replacement number or inferring
   ownership.
4. **Given** a redefinition, Work operation, tracked operation, or audit append,
   **when** the owner is resolved, **then** exactly one defined ledger whose
   exact `spec_path:` equals the package spec is required; number, filename,
   slug, title, and package-directory resemblance are not fallbacks.

### User Story 3 - Select and inspect numbered ideas without ambiguity (Priority: P1)

As a workflow user, I want commands and reports to understand numbered
filenames while preserving semantic slugs and exact owner paths, so that the
new physical identity does not introduce selector guesses.

**Independent Test**: Exercise brainstorm, define, Ship, Work, status, diff,
self-check, lint, backlog, Lightweight, and available tracked-owner paths with
numbered draft, defined, and resolved ledgers. Confirm exact selection,
chronological display, and fail-closed ambiguity.

**Acceptance Scenarios**:

1. **Given** a numbered ledger with `slug: example`, **when** `example` is used
   as a semantic selector, **then** it resolves that exact frontmatter slug only.
2. **Given** an exact workspace-relative idea path, **when** it is used as a
   path selector, **then** it resolves only that direct regular file.
3. **Given** a number, numbered-looking stem, title, package name, or mismatched
   path that is not an exact accepted selector, **when** selection is attempted,
   **then** the workflow reports no exact match and does not strip, translate,
   or fall back to another identity form.
4. **Given** duplicate slugs, duplicate numeric claims, a filename whose suffix
   differs from its exact `slug:`, or multiple exact owners, **when** a mutating
   workflow starts, **then** it stops before mutation and names every conflicting
   direct path.
5. **Given** a valid inventory, **when** idea inventory is rendered, **then**
   lifecycle numbers are visible and records are ordered numerically within the
   relevant lifecycle view.
6. **Given** declared dependency, explicit backlog order, task state, or
   execution readiness, **when** work is presented or selected, **then** those
   authorities remain controlling and lifecycle number does not reorder them.

### User Story 4 - Migrate the current workspace without changing history (Priority: P1)

As a maintainer of the current dogfood workspace, I want every current idea
renamed deterministically and every active exact path reference reconciled, so
that the new contract starts from a complete, trustworthy inventory.

**Independent Test**: Publish Feature 045 and perform the bounded migration.
At the migration checkpoint, confirm all 49 mapped idea files equal their
preimages byte-for-byte, all 45 package task files reverse to their preimages by
replacing only the audit breadcrumb, package directories and `spec_path:` values
are unchanged, and package-keyed task state equals its pre-migration bytes.
During later integrated and final verification, retain that checkpoint evidence
and normalize Feature 045 tasks through the latest independently reviewed
definition-repair baseline before classifying only later coordinator-owned
execution state.

**Acceptance Scenarios**:

1. **Given** the current defined owners for packages `001` through `045`,
   **when** migration runs, **then** each owning idea filename inherits its
   package prefix and no package path or `spec_path:` changes.
2. **Given** the current package-less ledgers and their capture evidence,
   **when** migration assigns the remaining identities, **then** the exact
   results are:
   - `046-good-enough-delivery.md`;
   - `047-core-dogfood-preview.md`;
   - `048-backlog-canvas.md`; and
   - `049-visual-systems-pack.md`.
3. **Given** a draft or resolved package-less ledger, **when** it is renamed,
   **then** its status, empty `spec_path:`, user-controlled content, managed
   content, and complete Coordinator Log bytes remain unchanged.
4. **Given** task audit breadcrumbs and active ObjectiveRegistry owner paths,
   **when** their owning ledgers move, **then** those structured active
   references change to the exact new path in the same bounded migration.
5. **Given** old path text inside protected idea content, Coordinator Log
   history, execution archives, or other historical prose, **when** migration
   runs, **then** that history is not rewritten merely to modernize a path.
6. **Given** any source-byte drift, target collision, ownership ambiguity, or
   unclassified active reference, **when** migration is prepared, **then** it
   stops before partial publication and retains a rollback path.
7. **Given** retained evidence proving the complete migration transaction,
   **when** later Work has produced independently approved definition-owned
   T004/T005 canonical-unit replacements plus coordinator reconciliation and
   final descriptors, and then appended Feature 045 state, **then** verification
   starts from the retained T002 task preimage, applies only the breadcrumb
   migration and those exact reviewed replacements, requires the current
   canonical definitions to match the latest reviewed repair baseline, and
   classifies only coordinator-owned glyph, history, and lane-state changes
   recorded after that baseline. No other task prose change is accepted, no
   intent change is treated as execution drift, and no migration defect is
   waived.

### User Story 5 - Keep one small lifecycle model across shipped surfaces (Priority: P2)

As a maintainer, I want all current workflow surfaces to use one validated
lifecycle identity model, so that generated guidance, reports, and execution
callers cannot drift into competing numbering rules.

**Independent Test**: Compare authoritative and distributed workflow surfaces,
exercise focused current-format regressions, and confirm one number grammar,
one allocation rule, one selector rule, and one exact-owner rule with no
additional state.

**Acceptance Scenarios**:

1. **Given** authoritative workflow behavior and its distributed projections,
   **when** they are compared after the normal build, **then** both expose the
   same numbered idea convention.
2. **Given** documentation and examples, **when** a user follows brainstorm,
   define, status, Ship, or Work guidance, **then** examples use numbered direct
   ledgers, unnumbered semantic slugs, and exact `spec_path:` ownership
   consistently.
3. **Given** direct callers that already resolve exact owner paths, **when**
   numbered fixtures replace unnumbered fixtures, **then** they continue to bind
   the returned exact path and never reconstruct one from a slug or package.
4. **Given** the completed feature, **when** its state carriers are inspected,
   **then** there is no lifecycle registry, counter file, database, service,
   tombstone store, alternate identity, or general migration subsystem.

## Requirements

### Functional Requirements

- **FR-001**: Every newly captured idea MUST receive exactly one lifecycle
  number from `001` through `999` before its direct ledger is created.
- **FR-002**: A canonical direct idea filename MUST be
  `.dude/ideas/<NNN>-<slug>.md`, where `<NNN>` is exactly three ASCII digits,
  is not `000`, and `<slug>` exactly equals the ledger's canonical frontmatter
  `slug:` value.
- **FR-003**: First-capture allocation MUST use one plus the greatest valid
  lifecycle prefix observed across both direct idea ledgers and direct feature
  package directories. It MUST NOT fill a lower gap.
- **FR-004**: Allocation MUST re-read the authoritative direct inventories
  immediately before creation and MUST stop without mutation on malformed
  entries, duplicate idea numbers, duplicate package numbers, conflicting
  cross-inventory claims, unsafe entries, unreadable entries, or a target
  collision.
- **FR-005**: Refresh, definition, resolution, explicit reopen, Work, Ship, and
  other supported lifecycle actions MUST retain an existing ledger's number.
  Resolution MUST retain the ledger rather than free its number.
- **FR-006**: If the valid observed maximum is `999`, first capture MUST report
  exhaustion and MUST NOT wrap, recycle, emit `1000`, widen the grammar, or
  create an alternate identity.
- **FR-007**: First definition MUST derive the new package's numeric prefix from
  the selected numbered draft. It MUST NOT allocate from the current feature
  maximum.
- **FR-008**: A first-defined package MUST use
  `.dude/specs/<NNN>-<slug>/spec.md` for the selected ledger's exact number and
  slug, and publication MUST stop if that target or numeric identity collides.
- **FR-009**: Redefinition and every package-bound mutation MUST continue to
  require exactly one direct `status: defined` ledger whose exact canonical
  `spec_path:` equals the selected specification path.
- **FR-010**: Filename number, filename suffix, frontmatter slug, package
  directory, title, and number alignment MUST be validated for consistency but
  MUST NOT substitute for exact `spec_path:` when ownership is resolved.
- **FR-011**: Semantic command selection MUST accept an exact unnumbered
  frontmatter slug and MAY accept an explicit exact workspace-relative idea
  path. It MUST NOT silently strip a numeric prefix or fall back among slug,
  path, stem, filename, title, package, or number.
- **FR-012**: Duplicate semantic slugs, duplicate number claims, malformed
  numeric prefixes, filename/slug mismatch, missing exact owners, and multiple
  exact owners MUST produce deterministic diagnostics and stop mutation.
- **FR-013**: Draft, defined, and resolved ledgers MUST all participate in
  lifecycle-number reservation and chronological inventory.
- **FR-014**: Read-only inventory, status, diff, self-check, and backlog behavior
  MUST recognize numbered direct paths, report lifecycle number visibly, and
  order generic idea inventory numerically rather than alphabetically by slug.
- **FR-015**: Lifecycle number MUST NOT be interpreted as priority, dependency,
  explicit backlog order, roadmap order, task phase, readiness, dispatch order,
  execution order, or completion order.
- **FR-016**: Lint MUST reject unnumbered current-format ledgers after the
  bounded migration, malformed or out-of-range prefixes, duplicate numeric or
  slug identities, filename/slug mismatch, package-prefix mismatch for a
  defined owner, and stale structured owner references.
- **FR-017**: Task audit breadcrumbs MUST continue to point to the exact current
  owner path and `#coordinator-log`; no breadcrumb may be reconstructed from a
  slug or package name.
- **FR-018**: Active ObjectiveRegistry `owner.ideaPath` values, where present,
  MUST point to the exact current numbered owner and remain subject to their
  existing exact-owner and task-binding rules.
- **FR-019**: Backlog parsing and rendering MUST carry the parsed lifecycle
  number as idea identity, display it, and use it for chronological inventory
  ordering while preserving all existing lifecycle bucket, dependency,
  explicit-order, task-state, and history semantics.
- **FR-020**: Work, Ship, Lightweight, first-definition publication, status,
  diff, self-check, audit append, and any installed tracked-owner integration
  MUST bind the exact numbered path returned by the canonical inventory rather
  than derive a path from another identity.
- **FR-021**: At the migration transaction boundary, the current workspace
  migration MUST rename every current direct idea according to the settled
  mapping while preserving each of all 49 idea files' complete bytes.
- **FR-022**: The migration MUST leave all existing feature package directories
  and every existing `spec_path:` value byte-for-byte unchanged.
- **FR-023**: The migration MUST update only structured active path references
  whose semantics require the current owner path, including canonical task
  breadcrumbs and active ObjectiveRegistry owner paths, and MUST regenerate
  derived backlog outputs.
- **FR-024**: The migration MUST NOT rewrite user-controlled sections,
  Coordinator Log history, archived execution evidence, or incidental
  historical prose solely because it contains a previous path.
- **FR-025**: The migration MUST preflight all source bytes, target absence,
  exact owner mappings, and active reference classes before mutation; any
  collision, ambiguity, drift, or incomplete rollback MUST stop and be reported.
- **FR-026**: All shipped workflow guidance and generated core projections MUST
  expose the same numbered filename, selector, allocation, and exact-owner
  contract.
- **FR-027**: The feature MUST use direct idea and package inventories as its
  sole durable allocation authority and MUST add no registry, counter file,
  database, service, tombstone store, alternate state, recycled identifier, or
  general migration framework.
- **FR-028**: The migration checkpoint evidence MUST remain retained and bound
  to the T002 transaction and MUST prove all 49 migrated idea files equal their
  preimages byte-for-byte, all 45 package task files reverse to their preimages
  by replacing only the authorized audit breadcrumb, and package directories,
  `spec_path:` values, and package-keyed task-state bytes are unchanged at that
  boundary.
- **FR-029**: Later integrated and final verification MUST retain FR-028
  unchanged and mandatory. For Feature 045 tasks, verification MUST start from
  the retained T002 preimage, apply the one authorized breadcrumb migration,
  then apply only exact definition-owned T004/T005 canonical-unit replacements
  bound to an independently approved Work-authorized repair and its coordinator
  reconciliation event and final descriptors. The latest such reviewed
  replacement is the definition-owned baseline: current canonical definitions
  MUST match it, after which only coordinator-owned glyph, exact history-prefix,
  and lane-state changes recorded after that baseline are permitted. T004/T005
  verification MUST establish the retained repair review identity and final
  descriptors or the exact coordinator-recorded task postimage hash, unchanged
  durable keys and dependencies, and exact prior history-prefix preservation.
  These replacements are not generic definition drift, permit no other task
  prose change, and waive no migration defect. A later intent or definition
  change requires normal redefinition and MUST NOT pass as execution drift.

### Key Entities

- **Lifecycle number**: The permanent three-digit identity `001` through `999`
  assigned to an idea at first capture.
- **Numbered idea ledger**: One direct regular Markdown child of
  `.dude/ideas/` whose filename is `<NNN>-<slug>.md`.
- **Feature package**: The direct `.dude/specs/<NNN>-<slug>/` package created
  when a numbered draft is first defined.
- **Direct inventory**: The current direct idea files and direct feature package
  directories used as the only allocation evidence.
- **Semantic slug**: The unnumbered canonical `slug:` value used for ordinary
  command selection.
- **Exact owner**: The sole defined ledger whose exact `spec_path:` equals a
  package's canonical `spec.md` path.
- **Active owner reference**: Structured current metadata, such as a canonical
  task audit breadcrumb or active ObjectiveRegistry `owner.ideaPath`, that must
  follow an owner's current direct path.
- **Historical path text**: Preserved user content, log history, or execution
  evidence that describes a path at the time of an earlier event and is not a
  current owner pointer.

## Edge Cases

- The direct inventories are empty. The first valid capture receives `001`.
- A lower number is absent while a higher number exists. The allocator advances
  beyond the higher number and leaves the gap unused.
- A resolved ledger is the highest idea number. It remains in inventory and the
  next capture advances beyond it.
- A draft is captured, later packages advance beyond it, and the draft is then
  defined. Its package reuses the draft's earlier number.
- Two ideas carry the same number under different slugs. The inventory is
  invalid and mutation stops.
- Two packages carry the same numeric prefix under different names. The
  inventory is invalid and mutation stops.
- One idea and one package share a number. That pairing is valid only when the
  idea is defined and its exact `spec_path:` points to that package; otherwise
  the claim is conflicting.
- A filename is `000-example.md`, `01-example.md`, `1000-example.md`, or lacks
  a numeric prefix. It is malformed current-format identity.
- A selector is `045-example` but no frontmatter slug has that exact value. The
  prefix is not stripped; the user must use `example` or the exact direct path.
- A user manually destroys the sole direct evidence of the latest package-less
  identity. No supported workflow does this, and the remaining direct inventory
  cannot reconstruct destroyed authority. The system makes no automatic
  recovery guarantee and adds no tombstone store; explicit restoration or
  reconciliation is required before relying on the lost identity.
- The inventory reaches `999`. Capture stops pending a separately defined
  contract change; four-digit paths are not accepted opportunistically.
- An old path occurs inside an idea's protected text or Coordinator Log. It
  remains historical text unless it is also a separately structured active
  pointer.
- An active tracked integration stores feature identity by exact `spec_path:`
  rather than idea path. Its feature identity remains unchanged; only paths it
  actually binds as current owners are reconciled.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Across clean allocation fixtures with no ideas, contiguous
  inventories, lower gaps, resolved maxima, and mixed idea/package maxima, 100%
  of first captures select exactly `max + 1`, and zero select a lower gap.
- **SC-002**: Across refresh, resolve, reopen, first-definition, redefinition,
  Work, and Ship fixtures, 100% of existing lifecycle identities remain
  unchanged and every first-defined package reuses its selected idea number.
- **SC-003**: Every malformed-width, `000`, above-`999`, duplicate-number,
  duplicate-slug, filename/slug mismatch, cross-inventory conflict, unsafe-path,
  missing-owner, and multiple-owner fixture stops mutation with deterministic
  path-specific diagnostics.
- **SC-004**: Every supported idea inventory presentation displays the
  lifecycle number and orders generic idea records numerically; zero tests show
  lifecycle number overriding dependency, explicit backlog order, task state,
  priority, or execution readiness.
- **SC-005**: After the dogfood migration, exactly 49 direct idea ledgers occupy
  the settled `001` through `049` identities, with defined owners through `045`
  and the exact `046` through `049` package-less mapping stated above.
- **SC-006**: At T002 close, byte comparison reports 49 of 49 migrated idea
  ledgers equal their preimages, 45 of 45 package task files reverse to their
  preimages by replacing only the breadcrumb, and package directories,
  `spec_path:` values, and package-keyed task state equal their pre-migration
  bytes.
- **SC-007**: Every canonical task audit breadcrumb and every active
  ObjectiveRegistry owner path resolves to its exact numbered owner after
  migration, with zero stale active unnumbered references.
- **SC-008**: Backlog outputs regenerated from unchanged authoritative meaning
  are deterministic, contain every current idea exactly once, and expose
  lifecycle numbers without changing declared work ordering semantics.
- **SC-009**: Focused caller coverage passes for first capture, first
  definition, lint, backlog, Lightweight, Work, Ship, status, diff, self-check,
  audit breadcrumbs, ObjectiveRegistry validation, and any available
  tracked-owner integration using numbered paths.
- **SC-010**: Authoritative and generated core workflow surfaces are byte-aligned
  through the normal build, documentation examples use the same convention, and
  final inspection finds zero registry, counter, database, service, tombstone
  store, alternate identity state, general migration framework, or four-digit
  extension.
- **SC-011**: Later verification retains the exact T002 proof; reports 48 of 48
  unaffected idea ledgers and 44 of 44 unaffected package task files matching
  their required migration comparisons; and reconstructs Feature 045 tasks by
  applying, in order, the breadcrumb migration and only the exact independently
  reviewed T004/T005 definition-repair replacements to the retained T002
  preimage. The current canonical definitions equal the latest reviewed repair
  baseline, whose review identity and final descriptors or exact
  coordinator-recorded task postimage hash are verified; all five durable keys
  and dependencies are unchanged; the prior history prefix is exact; and only
  later coordinator-owned glyph, history, and Feature 045 lane-state changes
  remain. Zero other task prose or unrelated package state differs, and no
  migration defect is waived.

## Assumptions

- Feature 045 is published before implementation against
  `.dude/ideas/chronological-idea-numbering.md`, then joins the migration as the
  defined owner of package `045`.
- Existing defined ideas inherit package identity even when historical capture
  dates do not form a global chronological sequence. The remaining package-less
  legacy ledgers use their earliest valid capture milestone and then bytewise
  path as the deterministic tie-breaker.
- The current package-less capture evidence orders
  `good-enough-delivery`, `core-dogfood-preview`, `backlog-canvas`, and
  `visual-systems-pack` as `046` through `049`.
- Supported lifecycle behavior retains ledgers; arbitrary manual deletion of
  all identity evidence is filesystem damage rather than a feature capability.
- Existing project and bundle guardrails are sufficient.

## Out of Scope

- Renumbering or renaming an existing feature package.
- Using lifecycle identity as priority, dependency, roadmap, or execution order.
- A registry, counter, database, service, tombstone store, or alternate state.
- A reusable migration framework for hypothetical external legacy layouts.
- Automatic recovery from manual deletion or disk loss.
- Four-digit or unbounded lifecycle identities.
- Nested idea ledgers, slug-renaming behavior, or a new command family.

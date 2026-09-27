# Feature Specification: Duplicate Feature Number Prefixes

Source idea: `.dude/ideas/076-duplicate-feature-number-prefixes.md`

Distinct features created independently can share a numeric prefix. Accept those features without renumbering them, so their existing paths and path-bound Work evidence remain intact. The complete canonical `spec_path` continues to identify a defined feature; the unnumbered slug continues to select its idea.

This removes numeric-prefix uniqueness only. It does not introduce another identity scheme, cross-worktree coordination, migration, or recovery behavior. There is no rendered-surface design change.

## User Scenarios & Testing

### User Story 1 - Keep distinct same-prefix features usable (Priority: P1)

As a maintainer combining independently captured work, I can retain distinct features with the same prefix and define the intended draft without changing either feature's identity.

**Why this priority:** Renumbering would break the paths to which existing work and evidence are bound.

**Independent test:** In a disposable workspace, inventory valid same-prefix ideas and packages, select each exact target, and define a draft beside another same-prefix package.

**Acceptance scenarios:**

1. **Given** two otherwise valid defined features with different slugs and the same prefix, **when** their inventory and ownership are checked, **then** both remain valid and each resolves only to its exact owner.
2. **Given** otherwise valid draft, defined, and resolved ideas sharing a prefix across different slugs, **when** lifecycle readers inspect them, **then** all remain separate records with their existing lifecycle meanings; draft and resolved ideas gain no package ownership.
3. **Given** a selected draft and another valid package with the same prefix but a different slug, **when** first definition publishes the selected draft, **then** its package uses that draft's exact number and slug and leaves the other feature unchanged.
4. **Given** a resolved same-prefix idea, **when** definition or Ship targets it without an explicit brainstorm reopen, **then** the existing terminal-state refusal still applies.

### User Story 2 - Keep ownership and Work evidence isolated (Priority: P1)

As a maintainer with retained Work evidence, I can rely on full target identity even when another feature has the same numeric prefix or durable task key.

**Why this priority:** Accepting a shared prefix must not transfer ownership, completion evidence, or continuation authority between features.

**Independent test:** Give two valid same-prefix features distinct histories and evidence, including the same task key. Check each exact target, then substitute the peer's owner or evidence while keeping unrelated inputs valid.

**Acceptance scenarios:**

1. **Given** two same-prefix features with different complete paths, **when** Work identifies their targets, **then** the targets remain distinct; unchanged exact targets retain their existing identity calculations.
2. **Given** evidence bound to one complete target, **when** it is presented for the other same-prefix target, **then** the existing wrong-target rejection applies and no histories are joined.
3. **Given** malformed identity, unsafe paths, duplicate slugs, a mismatched idea/package pair, or missing or ambiguous ownership, **when** an operation checks eligibility, **then** it still refuses before mutation.
4. **Given** an earlier stopped Work invocation, **when** duplicate-prefix support becomes available, **then** that change neither resumes the invocation nor certifies its retained evidence.

### User Story 3 - Keep local capture and chronological display predictable (Priority: P2)

As a maintainer, I can capture the next idea from my local inventory and distinguish tied lifecycle numbers in existing lists.

**Why this priority:** The compatibility change must preserve the familiar allocation and display behavior without introducing global coordination.

**Independent test:** Use local inventories with repeated prefixes and gaps, including the upper boundary, and compare repeated list reads with different input enumeration orders.

**Acceptance scenarios:**

1. **Given** a valid local inventory whose greatest idea or package prefix is `075`, including duplicates and lower gaps, **when** a new slug is captured, **then** it receives `076`; no lower gap is reused.
2. **Given** a valid local inventory containing `999`, **when** a new capture is requested, **then** allocation reports exhaustion and writes nothing.
3. **Given** same-prefix records in an existing chronologically ordered list, **when** the list is read repeatedly, **then** it retains every record and its numeric display, with deterministic full-identity tie-breaking.
4. **Given** declared priority, dependencies, or execution state, **when** records share a prefix, **then** that similarity changes none of those facts.

## Edge Cases

- Repeated prefixes among drafts, among defined features, among resolved ideas, and in mixed inventories are valid when all other rules hold.
- The reported `074-work-readable-evidence-handoff` / `074-dude-canvas-about` and `075-terminal-work-manual-resolution` / `075-dude-development-base-release` pairs are regression examples. Their actual ledgers and packages are not repair targets.
- Reusing a slug under another number remains invalid, including across lifecycle statuses. Reusing an existing full target path remains a conflict.
- A package without a defined owner, two ideas claiming the same exact package, or a defined owner whose number or slug differs from its package remains invalid.
- A draft or resolved ledger cannot claim a package merely because its prefix matches. Existing nonempty-path and terminal-state restrictions remain in force.
- Zero, non-ASCII digits, unsupported prefix widths, invalid slugs, nested identities, symbolic links, traversal, unreadable inputs, and malformed metadata retain their existing rejection behavior.
- Empty inventories still allocate `001`. A highest valid prefix of `998` permits `999`; duplicates at `999` do not extend the supported range.
- Inventory diagnostics and publication preimage or target conflicts still block writes. Duplicate-prefix support supplies no fallback on an incomplete or unsafe inventory.
- Identical task keys in different packages do not join their histories. Normal source-drift and stale-evidence checks still apply even when a target's path is unchanged.

## Functional Requirements

- **FR-001:** Lifecycle inventory must accept otherwise valid records with distinct slugs that share a numeric prefix, across draft, defined, resolved, and mixed idea/package inventories.
- **FR-002:** Package-bound operations must require exactly one defined idea owner whose exact `spec_path:` equals the selected complete canonical specification path.
- **FR-003:** Ownership validation must continue to require both the number and slug of an idea to match those of its own package.
- **FR-004:** Identity validation must continue to reject duplicate semantic slugs and conflicting claims to a complete target path.
- **FR-005:** Eligibility checks must retain existing refusals for malformed identities or metadata, unsupported or unsafe paths, and missing or ambiguous owners.
- **FR-006:** First definition must reuse the selected draft's number and exact slug even when another valid, distinct package has that number.
- **FR-007:** First capture must allocate one above the greatest valid prefix in the current workspace's direct idea and package inventories, starting at `001` for an empty inventory.
- **FR-008:** Capture must refuse without writes when the existing inventory gates fail or the supported `001`-`999` range is exhausted.
- **FR-009:** Lifecycle readers must retain distinct same-prefix records without withholding their otherwise valid ownership, dependency, or status information because of the shared number.
- **FR-010:** Existing chronological displays must preserve their numeric labels and ordering, resolving numeric ties deterministically by complete identity.
- **FR-011:** No operation may infer priority, dependency, readiness, dispatch, or execution order from a shared lifecycle number.
- **FR-012:** Work target identity and evidence checks must continue to bind to the complete exact target and reject evidence supplied for a different same-prefix target.
- **FR-013:** Adopting this compatibility change must not rewrite existing feature paths, historical task IDs or states, histories, claims, checkpoints, hashes, or retained evidence.
- **FR-014:** Duplicate-prefix support must grant no continuation or completion authority to an earlier stopped Work invocation.
- **FR-015:** Active instructions, documentation, and shipped runtime variants must agree on the relaxed prefix rule and the retained identity rules.

## Key Entities

- **Lifecycle number:** The existing zero-padded `001`-`999` capture-chronology value. It is reusable across independently created, distinct features and is not an identity or scheduling key.
- **Idea ledger:** One exact direct numbered path, one unique unnumbered slug, and its lifecycle status. Draft and resolved ledgers are package-less under their existing rules.
- **Defined feature:** A complete canonical `spec_path` with exactly one defined idea owner whose number and slug match that package.
- **Work target and retained evidence:** Existing path-bound target and evidence records. Shared prefixes establish no relationship between them.

## Success Criteria

- **SC-001:** Every otherwise valid duplicate-prefix case in the three stories remains individually discoverable and correctly classified, with no number-only error or loss of authority.
- **SC-002:** Every invalid case listed above remains refused, and no same-prefix owner, task, or evidence substitution is accepted for another complete target.
- **SC-003:** First definition preserves the selected draft's number; every successful new capture uses local maximum plus one, and exhaustion produces zero writes.
- **SC-004:** Repeated inventory and list reads produce the same full-identity order for numeric ties without changing numeric display or scheduling semantics.
- **SC-005:** Existing identity, history, and retained-evidence bytes remain unchanged by adopting the feature, and all shipped variants implement the same compatibility rule.

## Assumptions

No additional user assumptions are needed. Existing lifecycle, filesystem-safety, evidence, and resource-limit contracts continue to apply except for numeric-prefix uniqueness.

Cross-worktree scanning or reservation, aliases, renumbering or migrations, new identity or state stores, budget changes, and historical evidence repair are excluded. The other worktree's `T004` hard-stop/evidence-incomplete condition is expressly outside this feature. Commit and push are separate actions and are not part of this definition or automatic delivery.

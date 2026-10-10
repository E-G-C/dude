# Feature Specification: Targeted Pack Acquisition

**Owner:** `.dude/ideas/082-targeted-pack-acquisition.md`

## Purpose And Scope

Make pack browsing, installation, and refresh usable when a source repository contains much more than its packs. For GitHub sources, browsing needs catalog metadata, and installation or refresh needs only the selected pack. Other remote hosts may still require a full clone, but that work must not freeze Dude or prevent cancellation.

This feature changes acquisition for the existing `library/packs/<name>/pack.md` catalog. It preserves pack identities, nested content, source selection, consent, projection, and caught-failure rollback. It also preserves the separately approved Windows bootstrap repair associated with [issue 40](https://github.com/E-G-C/dude/issues/40).

## User Scenarios & Testing

### US1 - Browse a GitHub catalog without acquiring the repository (P1)

As a user browsing available packs, I need every eligible pack in the selected GitHub catalog without downloading unrelated repository content.

Independent test: browse a source with several direct pack directories, nested companion files, a directory without a manifest, and large unrelated content. Observe the acquired content and compare the complete result with the source's manifests at the selected revision.

Acceptance scenarios:

1. Given a GitHub source in the current catalog layout, when the user reloads available packs, then Dude acquires only direct pack manifests and the metadata needed to find and identify them, without a repository clone.
2. Given several direct packs, when discovery completes, then names, descriptions, use cases, ordering, installed flags, and source distinctions retain their existing meaning.
3. Given an inaccessible, incomplete, or invalid catalog, when discovery fails, then Dude reports that source as unavailable instead of returning an empty or incomplete success.
4. Given a changing requested revision, when acquisition cannot establish a consistent revision, then Dude reports the change instead of combining content from different commits.

### US2 - Install or refresh the complete selected GitHub pack (P1)

As a user installing or refreshing a pack, I need all of that pack's nested content and the same installed projection I would obtain from its local source.

Independent test: install and refresh one pack from a multi-pack source. Compare its projected artifacts with the same revision read locally, record acquired content, and inject application failures.

Acceptance scenarios:

1. Given a selected GitHub pack, when installation acquires it, then acquisition includes its complete supported subtree, including nested skills, scripts, assets, and shipped notices, but no unrelated pack or repository file content.
2. Given an installed pack whose selected revision changes files, when a consented refresh succeeds, then the existing projection and exact installed-file membership reflect that revision without a catalog-format or naming change.
3. Given an acquisition failure or cancellation before application, when the operation ends, then installed files and profile bytes remain unchanged.
4. Given a caught application failure, when restoration succeeds, then prior files and profile bytes are restored through the existing transaction behavior. An uncertain restoration is reported honestly.
5. Given an installed-profile change while acquisition is pending, when the stale operation tries to apply, then it refuses without erasing the intervening membership change.

### US3 - Keep remote acquisition responsive and cancellable (P1)

As a user waiting for a remote catalog, I need Dude to keep answering unrelated requests and to stop acquisition safely when it is canceled or exceeds its bounds.

Independent test: hold a non-GitHub clone pending, request installed-only Canvas data, and then cancel or let acquisition reach its declared deadline. Observe process termination, temporary material, and the reported outcome.

Acceptance scenarios:

1. Given a slow non-GitHub remote source, when discovery performs its retained full clone, then unrelated Canvas requests respond while acquisition remains pending.
2. Given cancellation, a resource limit, or a deadline, when the operation stops, then Dude reports the affected source's failure within the declared acquisition and stop-confirmation bounds.
3. Given confirmed process cleanup, when the failed or canceled acquisition settles, then its owned temporary material is removed.
4. Given cleanup that cannot be confirmed, when the operation settles, then Dude reports unconfirmed cleanup, retains the affected material, and does not describe the stop as successful cleanup.
5. Given several sources and one failed source, when discovery settles, then complete successful sources remain usable and failed sources remain visibly unavailable.

## Edge Cases

- A verified catalog with no eligible manifests may be empty; missing catalogs and unsuccessful reads may not masquerade as empty catalogs.
- Direct pack directories may contain nested content or lack `pack.md`; discovery does not need those companion files.
- Branches, stable release selection, annotated tags, and explicit commits must identify a consistent acquisition revision.
- Rate limits, authorization failures, moved refs, incomplete source inventories, unsafe entries, and resource exhaustion require explicit failure rather than fallback.
- Concurrent operations must not delete each other's acquisition material or silently overwrite newer installed membership.
- A local source may be a relative folder, a Windows drive, or a network share; its existing meaning is not replaced by remote-source interpretation.
- An explicit source may be missing the selected pack even when another catalog contains a pack with the same name.
- Cancellation during a non-GitHub shallow-clone failure must not allow a replacement full clone to escape the stop.
- Delivered core-only installations have no vendored catalog and must still discover the configured upstream.

## Functional Requirements

- **FR-001:** GitHub discovery must acquire only direct pack manifest content and the source metadata needed to enumerate and identify the selected catalog.
- **FR-002:** GitHub pack operations must never clone the repository, including after an acquisition failure.
- **FR-003:** Discovery must account for every eligible direct pack directory before reporting a complete source result.
- **FR-004:** Discovery must preserve existing pack metadata, ordering, exact use-case filtering, installed flags, and source distinctions.
- **FR-005:** GitHub installation and refresh must acquire the selected pack's complete supported subtree without acquiring unrelated file content.
- **FR-006:** Each GitHub acquisition must use one resolved commit for all content and refuse observed revision drift.
- **FR-007:** Installation and refresh must retain the existing pack format, identity, namespace checks, projection, and installed-file membership rules.
- **FR-008:** Pack operations must retain existing source-bound previews, literal consent, freshness checks, and result acknowledgment.
- **FR-009:** Installed remote provenance must continue to identify the configured repository, requested ref, and resolved commit rather than temporary acquisition locations.
- **FR-010:** Local sources must remain read in place without remote acquisition.
- **FR-011:** An explicit source must remain exclusive, including when it fails or lacks the selected pack.
- **FR-012:** `--no-fetch` must perform no remote lookup or acquisition.
- **FR-013:** Without an explicit source, Compose must retain its current local-first selection and configured default-source fallback, including ref-only callers.
- **FR-014:** Other remote hosts must retain full-repository acquisition and their existing supported ref behavior.
- **FR-015:** Canvas must remain responsive to unrelated requests while remote acquisition is pending.
- **FR-016:** Remote acquisition must support cancellation and bounded failure without treating incomplete source results as successful.
- **FR-017:** Failed or canceled acquisition must leave installed files and profile bytes unchanged before application.
- **FR-018:** Application must refuse a changed installed-profile basis and retain existing all-or-restored behavior for caught application failures.
- **FR-019:** An acquisition owner must confirm process termination before deleting process-owned temporary material and must report and retain material when cleanup is unconfirmed.
- **FR-020:** Delivered core must support these journeys without optional packs or changes to existing source-admission contracts.

## Key Entities

- **Catalog source:** The selected local folder or remote repository and its configured ref, with existing default or added-source identity.
- **Catalog result:** One source's complete manifest-derived pack listing, or an explicit unavailable result.
- **Pack subtree:** The selected pack directory and its complete supported nested contents at one revision.
- **Acquisition:** One bounded read that owns any temporary material until disposal; it does not authorize installation.
- **Installed profile:** Existing membership, exact installed files, and source provenance used to authorize and verify pack changes.

## Success Criteria

- **SC-001:** Recorded GitHub discovery acquires only direct `pack.md` files and necessary metadata, invokes no Git clone, and returns the complete expected fixture catalog with unchanged metadata and filtering.
- **SC-002:** Recorded GitHub install and refresh acquire only the selected subtree. Their installed artifacts match local-source projection at the same revision, including nested binary and text companions, notices, and supported executable behavior.
- **SC-003:** Fault and concurrency tests establish unchanged pre-application files/profile, caught-failure restoration, stale-profile refusal, and unchanged remote provenance. No adverse acquisition case succeeds through a clone, another source, or an empty-result substitution.
- **SC-004:** A deliberately pending non-GitHub clone allows an installed-only Canvas response to complete before that clone finishes. Deadline and cancellation cases settle within the declared bounds with either confirmed tree cleanup or explicit retained-material reporting.
- **SC-005:** Regression evidence preserves local reads, offline behavior, explicit-source exclusivity, default-source selection, ref-only refresh callers, source-bound consent, and independently reported multi-source coverage.
- **SC-006:** In an owned, core-only installation on the actual supported Copilot host, ordinary installed-pack reads cause no catalog acquisition. Explicit default-source Reload returns the complete catalog at the currently resolved stable release, within its bounded acquisition window and without a GitHub clone. Record the observed release, commit, pack set, elapsed time, and cleanup; do not hardcode a permanent pack count.
- **SC-007:** Fresh distribution checks establish that the required acquisition modules ship together, source and affected generated runtime agree, and the original bootstrap repair and unrelated private work remain intact.

## Assumptions And Exclusions

The captured five-second timeout and isolated clone measurements establish the acquisition problem, not a reproduced crash or a measured performance target. The previously observed 19 packs at `v1.5.0` are historical evidence, not a permanent catalog requirement.

Existing project and bundle guardrails apply. Canvas's added remote sources remain public GitHub repositories; this feature adds no private-source authentication capability. Local/offline semantics and consent are not relaxed to make acquisition succeed.

There is no UI redesign, new control, new catalog format, registry, persistent cache, durable queue, daemon, provider framework, dependency resolver, or crash-recovery guarantee. Core bundle upgrade acquisition is outside this change. Existing loading, stale-data, and error presentation may be reused, with factual timeout wording corrected inside the approved layout.

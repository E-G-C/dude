# Feature Specification: Agent Orchestration Metadata

## Purpose

Dude has 32 authoritative core and optional-pack agent sources. Each source needs a deliberate logical model class, while concrete model choices and class effort remain centralized. The bundle currently contains work for three generated target families even though only Copilot file profiles have a production consumer.

This feature establishes one source and configuration authority, ships one deterministic Copilot representation per agent, and removes the unconsumed Claude and Copilot SDK output capabilities. Configuration travels inside the existing core engine distribution boundary so an already-installed upgrader delivers it with the code that consumes it. The source shape remains neutral enough for a future adapter, but future targets exist only as documented contracts until a production caller requires them.

## User Scenarios & Testing

### User Story 1 - Change a model in one authoritative configuration (Priority: P1)

As a bundle maintainer, I want each agent to declare a logical class while one configuration owns concrete models and class effort, so a model change is one source edit followed by regeneration.

**Why this priority**: Central ownership is the main reason for introducing model classes. Scattered values would leave the original maintenance problem intact.

**Independent Test**: Build and install a baseline, change one class model in the canonical configuration, regenerate base profiles, remove and add the installed pack, and confirm that only applicable profiles receive the change while no agent source changes.

**Acceptance Scenarios**:

1. **Given** the 32 authoritative agent sources, **When** their model classes are collected, **Then** every source appears exactly once in the approved assignment and contains no concrete model or effort value.
2. **Given** the canonical configuration, **When** it is inspected, **Then** it contains dated model provenance, every declared class, class-level effort for each non-inheriting class, and the emitted settings and model coverage for the Copilot target.
3. **Given** a configuration consumer, **When** it loads configuration, **Then** the caller supplies the one exact location and loading performs no defaulting, search, fallback, environment override, or embedded-map substitution.
4. **Given** one changed class model and unchanged agent sources, **When** base generation and the documented pack remove/add refresh run, **Then** every applicable Copilot profile in that class changes and profiles in other classes do not.
5. **Given** an unchanged configuration and unchanged sources, **When** generation runs twice, **Then** the second result is byte-identical.
6. **Given** class effort and a Copilot target that declares no effort emission, **When** a profile is generated, **Then** effort is validated as declared intent but is not written to the profile or described as exercised host behavior.
7. **Given** a development or release build, **When** canonical configuration is invalid, **Then** it fails before cleanup, staging, or any output write.

### User Story 2 - Install an optional pack through the same Copilot adapter (Priority: P1)

As a Dude user, I want optional-pack agents installed from their canonical pack sources through the shipped adapter and configuration, so pack agents obey the same class, identity, and lifecycle rules as core agents.

**Why this priority**: Optional packs contain 29 of the 32 in-scope agents and are reachable production input to composition.

**Independent Test**: Install a representative multi-agent pack into a clean bundle, verify its complete incoming agent set before any write, inspect one Copilot profile per source, then delete or corrupt packaged configuration and remove the pack with no installed artifact left.

**Acceptance Scenarios**:

1. **Given** an optional pack with several agent sources, **When** composition begins, **Then** the complete incoming pack agent set is validated together before any destination or install record is written.
2. **Given** an omitted delegation roster, **When** the source is validated, **Then** the role is a leaf; given a present roster, it is the explicit composite declaration and must be non-empty.
3. **Given** duplicate stable identities, duplicate display identities, an invalid composite roster, or an unresolved delegation target within that incoming pack set, **When** composition runs, **Then** installation fails with a named diagnostic and leaves the bundle unchanged.
4. **Given** a valid pack agent source, **When** the pack is installed, **Then** exactly one Copilot profile is created from that source and its install record binds that source to that destination.
5. **Given** absent or invalid configuration or rendering code, **When** add or verify is selected, **Then** it fails before profile or artifact mutation; when remove, list, or status is selected, command dispatch does not load those dependencies.
6. **Given** deleted or corrupt packaged configuration, an absent renderer, or a model mapping changed after installation, **When** the pack is removed, **Then** removal uses valid recorded evidence and leaves no artifact behind.
7. **Given** the same pack is added again after a mapping change, **When** composition completes, **Then** the new profile contains the current mapped model.

### User Story 3 - Own exactly one generated target topology (Priority: P1)

As a maintainer or upgrading user, I want builds, composition, upgrade, lint, and continuous integration to own only the Copilot profile topology, so no dead target machinery or stale generated tree remains.

**Why this priority**: Unconsumed output trees create misleading compatibility claims, extra state, and destructive lifecycle branches without a production benefit.

**Independent Test**: Build development and release bundles, install and remove a pack, and exercise both current-upgrade and bounded historical release-bootstrap fixtures. Confirm that only Copilot profiles are generated or owned, the last pre-feature installed upgrader delivers all new engine files plus packaged configuration, compose can then render a pack, obsolete owned profiles are removed, and unrelated pack and project-local files remain untouched.

**Acceptance Scenarios**:

1. **Given** the authoritative core sources, **When** development and release builds run, **Then** each source produces one Copilot profile and no Claude or SDK agent artifact.
2. **Given** a removed or renamed core source, **When** its base owner runs, **Then** the obsolete Copilot profile is removed without touching pack or project-local profiles.
3. **Given** an upgrade, **When** upstream differs, **Then** ordinary one-tree ownership determines adds, replacements, and removals while pack and project-local namespaces remain preserved.
4. **Given** a candidate release, **When** the last pre-feature installed upgrader applies it, **Then** its existing core ownership enumeration installs the new loader and engine files together with the packaged configuration, after which pack composition can render an agent.
5. **Given** any ignored and untracked destination root that the existing rollback cannot restore, **When** an upgrade would write there, **Then** it refuses before the first write and names the root without using target-specific adoption state.
6. **Given** the repository and a release artifact, **When** generated-output drift checks run, **Then** they inspect the configured Copilot output and packaged configuration without authoring a commit or pull request.

### User Story 4 - Keep invocation, delegation, and extension guidance honest (Priority: P2)

As an agent author, I want source metadata, authoring guidance, and adapter documentation to describe what the shipped target actually does, so future agents remain valid and future targets can be added without pretending they already execute.

**Why this priority**: The runtime behavior is established by the first three stories; this story prevents its contracts from drifting.

**Independent Test**: Scaffold and validate a pack agent, inspect the visible roster and delegation references, and review the adapter documentation for the current Copilot contract plus documentation-only Claude and SDK correspondences.

**Acceptance Scenarios**:

1. **Given** the shipped roster, **When** user-invocation metadata is inspected, **Then** only Dude is user-visible while specialists remain directly invocable and delegatable under their existing authority boundaries.
2. **Given** a delegation roster, **When** it is validated, **Then** its presence declares the role composite, every entry is a unique stable stem, no entry is a display name or self-reference, and every explicit stem resolves in the applicable complete set.
3. **Given** a new pack agent scaffold, **When** it is created, **Then** it declares a valid logical class and specialist visibility without a concrete model or effort value.
4. **Given** an owned generated Copilot profile that declares the source-only class key, **When** mechanical validation runs, **Then** it fails and names the profile.
5. **Given** the adapter documentation, **When** a maintainer reads it, **Then** it distinguishes canonical source, canonical configuration, packaged configuration, generated output, and documentation-only future target contracts.
6. **Given** the Technical Docs Writer's existing extractor, planner, drafter, and reviewer orchestration, **When** its source metadata is inspected, **Then** its present non-empty roster declares it composite and names exactly the four corresponding stable stems, with no other Technical Docs pack behavior changed by this feature.

## Edge Cases

- The canonical configuration is missing, malformed, incomplete, or contains an unknown field or setting name: loading fails before any profile is emitted.
- A caller omits the configuration location or supplies a relative location: loading refuses rather than selecting or searching for a file.
- A target model map does not cover exactly the declared class set: loading fails and names the target and class mismatch.
- A class or target identifier is malformed, a model is empty, or a declared emitted setting is unknown: loading fails without a fallback or partial result.
- A source omits its class, declares an unknown class, includes a concrete model or effort value, or adds an unconsumed source field: parsing fails and names the source.
- Two core sources or two sources in one incoming pack use the same stable identity or display identity: their set validation fails before output.
- An `agents` key is present with an empty roster: validation fails because presence itself declares a composite.
- A composite roster repeats a stem, uses a display name, references itself, or names a stem absent from the applicable complete core or incoming pack set: validation fails before staging.
- A wildcard roster is declared by a role other than Dude or mixes `"*"` with explicit stems: validation fails before staging.
- Packaged configuration is missing or corrupt, or the Copilot renderer is absent: add and verify fail before profile or artifact mutation, while remove, list, and status remain dispatchable without either dependency.
- A host replaces the single seeded model line in an installed Copilot profile: parity measurement ignores that one host-owned value.
- A host or user adds a duplicate, malformed, quoted, or structured model line: normalization is a byte-for-byte no-op and the change remains visible as drift.
- An installed model literal differs from the current configuration: validation does not reject it solely for that difference because the host may rewrite the value.
- A mapping changes while a pack is installed: removal remains possible from recorded evidence, and the new value reaches that pack only after remove and add.
- The last pre-feature installed upgrader sees a candidate release containing the new configuration: its existing core-skill enumeration must install the packaged file without a new ownership root or runtime compatibility branch.
- A concrete model identifier is copied into unrelated authored code or a pack or agent source: the test-local authority check fails; generic effort words are not searched as literals.
- A stale generated Claude or SDK artifact exists in the implementation working tree: implementation removes it, but the product gains no migration, compatibility reader, dormant renderer, lint rule, or ownership claim for that artifact family.
- A future target is described in the adapter contract: no output is generated until that target has a production caller and a separately implemented adapter.

## Functional Requirements

- **FR-001:** Each of the 32 authoritative agent sources MUST declare exactly one logical class from `inherit`, `fast`, `balanced`, and `reasoning`, matching the assignment in this specification.
- **FR-002:** Core agent sources and catalog-pack agent sources MUST remain the single per-agent authority for stable identity, description, tools, visibility, delegation, class, and instructions; the catalog-pack authoring source MUST NOT become generated output.
- **FR-003:** Concrete model identifiers MUST occur only in the canonical configuration, its byte-identical packaged copy, and generated profiles proven equivalent to the current source and configuration projection. Independently authored product code, tests, documentation, and pack or agent sources MUST reject those identifiers, generated profiles MUST NOT contain the logical class key, and effort MUST be validated structurally rather than by scanning generic words.
- **FR-004:** One canonical high-level source configuration MUST be the sole authority for concrete model values, dated provenance, class-level effort, target model coverage, and each target's emitted settings.
- **FR-005:** Configuration loading MUST read exactly one caller-supplied absolute location, validate and freeze the result, and fail closed on a missing or malformed file, unknown root or nested fields, unknown setting names, malformed identifiers or values, incomplete class coverage, and emitted settings unsupported by the configuration shape. It MUST NOT define a default path, search, fallback, environment override, embedded map, partial load, or silently skipped entry.
- **FR-006:** The configuration MUST support exactly three structural changes without a schema redesign: adding or removing a class with exact target coverage, adding a target with its own model map and emitted-settings declaration, and changing a target's emitted-settings declaration. This extensibility MUST NOT create a plugin system or dormant renderer.
- **FR-007:** Every non-inheriting class MUST declare effort at class level. The shipped Copilot target MUST declare that it emits model but not effort, and documentation MUST state that un-emitted effort is validated intent rather than exercised behavior.
- **FR-008:** The bundle MUST generate, ship, own, lint, and drift-check exactly one agent target family: Copilot file profiles.
- **FR-009:** The system MUST NOT generate, ship, track, own, lint, or drift-check Claude subagent files or Copilot SDK agent files, and MUST NOT retain a gated or dormant renderer for either.
- **FR-010:** Agent processing MUST keep a neutral source parser and a separate Copilot renderer. Callers MUST pass validated configuration explicitly to parsing and rendering. Rendering MUST be deterministic, preserve the instruction body, emit only the Copilot-supported source subset plus the resolved model, and omit the model for the inheriting class.
- **FR-011:** Development and release builds MUST copy canonical configuration bytes unchanged into the existing upgrade-owned core engine distribution root. The packaged copy MUST be generated, drift-checked output, MUST NOT become a hand-edited authority, and MUST NOT introduce another configuration or ownership root.
- **FR-012:** Development and release builds MUST validate canonical configuration and the complete core agent set before cleanup, staging, or output writes and MUST leave unrelated non-agent parity checks unchanged.
- **FR-013:** Pack composition MUST project each canonical pack agent source into exactly one Copilot profile at install time through the packaged adapter and configuration. Add and verify MUST acquire configuration and rendering only after command dispatch and MUST fail before profile or artifact mutation when either dependency is absent or invalid.
- **FR-014:** Before pack installation writes anything, composition MUST parse and validate all agent sources in that incoming pack as one set. Omitted `agents` means leaf; present `agents` means composite and MUST be non-empty, unique, stable-stem-only, free of self-reference, and resolvable in that set. The Technical Docs Writer's existing four-subagent orchestration MUST declare exactly `dude-pack-technical-docs-extractor`, `dude-pack-technical-docs-planner`, `dude-pack-technical-docs-drafter`, and `dude-pack-technical-docs-reviewer`. `["*"]` MUST be reserved to Dude and MUST NOT mix with explicit stems. Validation MUST reject duplicate stable or display identities and MUST make no repository-wide cross-pack claim.
- **FR-015:** Base builds and upgrade MUST own base Copilot profiles; composition MUST own pack-installed Copilot profiles. Each owner MUST cover creation, refresh, stale removal, and uninstall where applicable and MUST NOT mutate another tier's profiles. A bounded historical fixture MUST prove that the last pre-feature installed upgrader's existing core ownership enumeration installs a candidate release's new engine files and packaged configuration and that compose can then render a pack, without adding migration machinery or a runtime compatibility branch.
- **FR-016:** A class-model change MUST reach base profiles through regeneration and installed pack profiles through the documented remove-then-add lifecycle. Upgrade MUST NOT reproject pack agents.
- **FR-017:** Pack install evidence MUST remain profile version 1, preserve the existing one-source-to-one-destination relationship, bind the exact installed bytes, and keep files and inventory congruent. Remove MUST use only valid profile evidence, recorded paths, installed hashes, and an optional raw-source digest comparison when source is available; it MUST NOT load configuration, mapping, or rendering and MUST work when any of them is missing, corrupt, absent, or changed. List and status MUST share that dependency-independent dispatch boundary.
- **FR-018:** Upgrade MUST use direct one-tree namespace ownership for Copilot profiles, preserve pack and project-local tiers, and contain no target-adoption capability marker, derived-root exception, or first-adoption preservation state.
- **FR-019:** Upgrade MUST retain its generic preflight that refuses any ignored, untracked destination the existing rollback cannot restore. Its behavior and examples MUST remain independent of any removed agent target.
- **FR-020:** Installed-profile parity MUST normalize only one well-formed host-owned Copilot `model` line. It MUST never rewrite an installed profile, strip `model-class` from an authoritative source, or mask duplicate or malformed model declarations.
- **FR-021:** Mechanical validation MUST reject an owned generated Copilot profile that declares `model-class`, but MUST NOT validate an installed profile's model literal against the configuration.
- **FR-022:** Only Dude MUST be user-visible where the host supports selector visibility. Specialists MUST remain directly invocable and delegatable, omission of `agents` MUST declare a leaf, presence of a valid non-empty `agents` roster MUST declare a composite, and existing coordinator-only authority boundaries MUST remain unchanged. No separate composite key, registry, or cycle framework is permitted.
- **FR-023:** Missing or invalid classes, missing model mappings, absent or invalid explicitly selected configuration, absent rendering, identity collisions, invalid composite rosters, unresolved delegation references, unknown source fields, and unmappable source tools MUST produce named failures before affected output is written.
- **FR-024:** Agent scaffolding, Agent Smith, and relevant authoring and lint guidance MUST teach the canonical source fields, centralized configuration, explicit composite declaration through `agents`, Copilot-only generated boundary, visibility and stable-stem delegation rules, concrete-model authority, and documentation-only future adapter contracts.
- **FR-025:** Developer documentation MUST explain canonical versus generated boundaries, the canonical and skill-local packaged configuration locations, explicit caller-selected loading, configuration packaging in development and release builds, bootstrap delivery by the existing core-skill owner, compose's install-time need for the packaged copy, dependency-independent removal, regeneration after source or configuration changes, remove-then-add refresh for installed packs, and how a future adapter consumes the neutral source shape without concrete model examples outside configuration.
- **FR-026:** Continuous integration MUST verify development and release drift for the Copilot profiles and packaged configuration without authoring commits or pull requests. A deterministic temporary-workspace falsifier MUST prove the model-authority and remove/add lifecycle boundaries, including rejection after injecting a concrete model identifier into unrelated authored code, without adding a production scanner, persisted manifest, or generated pack catalog.
- **FR-027:** The obsolete installed-agent canonicalizer MUST remain absent; normalized comparison is the only parity mechanism for a host-rewritten Copilot model line.

## Model Class Assignment

Classes only. Concrete model identifiers and effort values do not belong in this table.

| Class | Count | Agents |
|---|---:|---|
| `inherit` | 1 | `dude` |
| `fast` | 3 | `dude-pack-hugo-docs-researcher`, `dude-pack-technical-docs-extractor`, `dude-pack-newsroom-event-deep-fetcher` |
| `balanced` | 19 | `dude-pack-coding-coder`, `dude-pack-coding-tester`, `dude-pack-web-backend`, `dude-pack-web-frontend`, `dude-pack-rust-specialist`, `dude-pack-copilot-sdk-specialist`, `dude-pack-fluent-ui-specialist`, `dude-pack-strata-stylist`, `dude-pack-docsy-expert`, `dude-pack-hugo-template-specialist`, `dude-pack-hugo-troubleshooter`, `dude-pack-technical-docs-planner`, `dude-pack-technical-docs-drafter`, `dude-pack-technical-docs-reviewer`, `dude-pack-newsroom-writer`, `dude-pack-authoring-pack-smith`, `dude-pack-authoring-skill-smith`, `dude-pack-authoring-prompt-smith`, `dude-pack-authoring-instruction-smith` |
| `reasoning` | 9 | `dude-spec-lead`, `dude-reviewer`, `dude-pack-coding-architect`, `dude-pack-coding-reviewer`, `dude-pack-release-manager`, `dude-pack-hugo-site-architect`, `dude-pack-hugo-migration-specialist`, `dude-pack-technical-docs-writer`, `dude-pack-authoring-agent-smith` |

The counts total 32, with each in-scope stem assigned exactly once.

## Key Entities

- **Agent source**: The canonical per-agent record for identity, supported source metadata, logical class, and instructions.
- **Logical model class**: The portable intent assigned to an agent without naming a host model.
- **Canonical model configuration**: The sole high-level source for concrete models, class effort, emitted settings, and dated provenance.
- **Packaged configuration**: A generated copy shipped with the engine for build-time and install-time consumers.
- **Copilot adapter**: The renderer that converts a neutral parsed agent source and resolved model into one Copilot file profile.
- **Incoming pack agent set**: All authoritative agent sources shipped by one pack and validated together before that pack is installed.
- **Composite declaration**: Presence of a non-empty `agents` roster on a source. Omission declares a leaf; no second declaration exists.
- **Install evidence**: The one-source-to-one-destination record and exact hashes used to verify and remove a pack artifact.
- **Adapter contract**: Developer documentation for the shipped Copilot mapping and the field correspondence a future Claude or SDK adapter would implement.

## Success Criteria

- **SC-001:** All 32 authoritative sources match the class assignment exactly, and no source contains a concrete model or effort value.
- **SC-002:** Exactly one canonical source file contains the concrete model values and class effort, with dated provenance; its skill-local packaged copy is byte-identical, and no independently authored code or pack or agent source duplicates a concrete model identifier.
- **SC-003:** One class-model edit plus base regeneration and pack remove/add changes every applicable Copilot profile in that class, changes no other class or agent source, and a test-local authority scan fails after the changed identifier is injected into unrelated authored code.
- **SC-004:** Development and release builds validate configuration before mutation, produce one Copilot profile per core source, package unchanged configuration bytes inside the engine skill, produce no Claude or SDK agent artifacts, and are byte-stable on a second run.
- **SC-005:** Installing a representative multi-agent pack validates its complete incoming agent set and composite declarations, writes one profile and one version 1 install row per source, and uninstall leaves zero pack artifacts.
- **SC-006:** Duplicate identities, empty or invalid composite rosters, self-reference, disallowed wildcard use, and unresolved delegation in an incoming pack each fail before any destination or profile write. The Technical Docs Writer roster contains exactly its extractor, planner, drafter, and reviewer stable stems, while its existing orchestration behavior remains unchanged.
- **SC-007:** Remove leaves zero leftovers when packaged configuration is deleted or corrupt, rendering is absent, or mapping changed; add and verify fail before mutation under missing or invalid projection dependencies; remove then add installs profiles using the new mapping.
- **SC-008:** Upgrade add, replace, and remove fixtures cover the direct Copilot topology, preserve pack and project-local profiles, and retain the generic unrestorable-destination refusal without any first-adoption branch. A bounded historical fixture also proves the last pre-feature installed upgrader installs the candidate engine and skill-local configuration and that compose add renders a pack afterward.
- **SC-009:** Mechanical validation fails on `model-class` declared in an owned generated Copilot profile, while a host-rewritten installed model value is not compared against the canonical configuration.
- **SC-010:** Repository source, generated dogfood, release output, skills, and documentation contain no executable or claimed Claude/SDK generation, inventory, lint, ownership, or drift behavior.
- **SC-011:** Documentation identifies canonical and generated files, explicit configuration loading, skill-local build and release packaging, historical bootstrap coverage, dependency-independent removal, regeneration, installed-pack refresh, composite declaration, concrete-model authority, and the future-adapter contract without claiming live Claude or SDK output.
- **SC-012:** The complete automated suite, development build drift check, release build, pack verification, and bundle lint report zero failures, followed by independent review of the one-target topology and deletion boundaries.

## Assumptions

- The authoritative inventory remains 3 core sources and 29 catalog-pack sources across the 12 packs that ship agents.
- The current source keys already contain everything needed for the documented future Claude and SDK correspondences; this feature adds no source frontmatter key.
- Current pack composites delegate only within their own pack. Composition therefore validates the incoming pack set without claiming global cross-pack delegation validation.
- Concrete Copilot model identifiers remain runtime-observed rather than an officially enumerated static list, so dated provenance travels with the values.
- Class effort is retained because it is accepted product intent, but no shipped adapter exercises it yet.
- Project-local agents remain outside canonical-source projection and keep their existing user-owned representation.
- Existing role authority, review, verification, and task-state ownership do not change.
- The specification, plan, and tasks are sufficient; no supporting artifact is essential.

## Out of Scope

- Claude or Copilot SDK generated output, executable renderer, ownership, lint, drift check, compatibility reader, migration, or dormant feature flag.
- A runtime settings service, environment override, per-user or per-project merge, plugin framework, registry, daemon, watcher, database, or new project state.
- A default or searched configuration path, `.github/config` root, new config ownership rule, or runtime compatibility branch for configuration packaging.
- Per-agent model overrides, per-target effort overrides, and pack-specific model values.
- A separate composite key, composite registry, cycle framework, or global cross-pack validation claim.
- A production concrete-model scanner or persisted authority manifest.
- A second writable metadata catalog, aggregate generated agent index, or generated pack catalog.
- Moving optional-pack canonical sources into the core source tree.
- Validating installed model literals against the source configuration.
- Projecting project-local agents or treating selector visibility as a security boundary.
- Combining agent, Agent Skill, or agentic-workflow schemas.
- Any Technical Docs pack redesign or refactor beyond adding the missing Technical Docs Writer roster.

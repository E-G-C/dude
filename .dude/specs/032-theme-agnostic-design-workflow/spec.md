# Feature Specification: Theme-Agnostic And Technology-Independent Design Workflow

## Purpose

The design lane advertises itself as a standalone, technology-independent visual-design workflow, but in practice it is wired to specific implementation technologies and to one visual system. Its guidance names a particular static site generator and documentation theme as the assumed target, declares every target to be a static site with no backend, routes brand questions to one company's brand process, and makes one visual system's validator and stylist a required part of closing design work. At the same time that visual system is imposed ambiently: merely installing it applies its rules to nearly every visual file, and its specialist and skill answer generic visual requests that never asked for it.

This feature makes the design lane genuinely generic. Design becomes a visual-design proposal workflow only — explore, mock, preview, approve, apply — with no dependency on, reference to, or conditional activation of any implementation technology, brand, or visual system. Design quality that belongs to every visual surface — accessibility, contrast, provenance, and functional realism — stays inside the generic workflow. Functional realism stops assuming a fixed static target and instead validates each affordance against the capability envelope the actual target's implementation owner declares.

It also makes the one existing visual system a fully independent, opt-in peer. Installing it no longer imposes it on generic visual work; it activates only on explicit identity or existing evidence of that system. Future visual systems remain independent peers with no shared registry, adapter, discovery layer, or new persistent state; a chosen system is named only in ordinary approved-direction and task prose.

The outcome is bounded to the two existing packs and their installed representations. It adds no new workflow lane, no cross-pack contract, and no new schema.

## User Scenarios & Testing

### User Story 1 - A generic design proposal with no visual system installed (Priority: P1)

As someone deciding what a surface should look like in a project with no visual-system pack installed, I want the full propose, approve, and apply design loop with real design-quality gates, so that I can agree a visual direction and apply it without any theme or implementation technology being assumed on my behalf.

**Why this priority**: This is the core promise the pack already advertises but does not keep. If the generic loop or its quality gates depend on a specific technology or visual system, the pack is not standalone.

**Independent Test**: In a project with only the design lane and the core roster, run the loop end to end and confirm the design guidance nowhere names or requires a specific site generator, documentation theme, web framework, styling language, company brand process, or visual-system pack, while the explore-to-apply lifecycle, the approval and re-approval gates, exact-owner and coordinator-only state, active-lane authority, provenance, accessibility and contrast, and rendered-evidence close checks all remain present and usable.

**Acceptance Scenarios**:

1. **Given** the design lane installed with no visual-system pack, **When** a visual direction is proposed and approved, **Then** the workflow completes explore, mock, preview, approve, and apply using only generic design-quality gates, and no step references or requires a visual-system validator, stylist, or theme.
2. **Given** a design proposal, **When** design quality is evaluated, **Then** accessibility, contrast, provenance, and functional realism are checked by the generic workflow itself and are not delegated to any theme.
3. **Given** implementation of an approved design, **When** the workflow routes the build, **Then** it routes to whichever installed specialist owns the actual target surface and names no specialist, technology, or theme as a default.

### User Story 2 - Functional realism validated against the real target's capabilities (Priority: P1)

As someone proposing an interactive surface, I want every actionable element checked against what the actual target can really deliver, so that a mock never approves an affordance the target cannot build, whether the target is static or dynamic.

**Why this priority**: Functional realism currently hard-codes one static target with no backend. On any other target that premise is wrong in both directions — it forbids affordances a dynamic target could build and permits none that need a server — so realism must follow the real target.

**Independent Test**: Provide a target whose implementation owner declares a capability envelope, propose affordances inside and outside that envelope, and confirm each out-of-envelope affordance is replaced with a real equivalent, dropped and recorded, or flagged as a design gap before approval, with no fixed static-target assumption applied.

**Acceptance Scenarios**:

1. **Given** a target whose implementation owner has declared its capability envelope, **When** an affordance is proposed, **Then** it is validated against that declared envelope rather than a fixed static assumption.
2. **Given** an affordance the target cannot deliver, **When** it is caught, **Then** it is replaced with a real equivalent, dropped and recorded in scope or assumptions, or flagged as a design gap and routed back before approval.
3. **Given** no declared envelope from an implementation owner, **When** realism cannot be evaluated, **Then** the workflow requests the envelope from the target's owner rather than assuming a default technology.

### User Story 3 - An opt-in visual system that never activates ambiently (Priority: P1)

As someone who has installed one visual-system pack, I want it to apply only when I explicitly ask for it or when the surface already uses it, so that generic visual requests are not silently captured by a system I did not choose.

**Why this priority**: Ambient activation defeats explicit theme choice and blocks future peer systems. A generic "style this" or "fix contrast" must remain generic.

**Independent Test**: With the visual-system pack installed, confirm it ships no always-on rules artifact, and that its specialist and skill are selected only by explicit identity — its name, its option flags, its named palettes — or existing evidence of that system, while generic phrasing such as theme, style, chart colours, dark theme, contrast, focus, spacing, radius, or shadow does not select it, and the pack neither references nor depends on the design lane.

**Acceptance Scenarios**:

1. **Given** the visual-system pack installed, **When** any visual file is edited, **Then** no always-on instruction artifact applies the system's rules ambiently.
2. **Given** a generic visual request that does not name the system, **When** activation is considered, **Then** the system's specialist and skill are not selected.
3. **Given** a request that explicitly names the system, its option flags, or its named palettes, or that targets a surface already using the system, **When** activation is considered, **Then** the system's specialist and skill are selected.
4. **Given** the visual-system pack, **When** its content is inspected, **Then** it neither references nor depends on the design lane, and its rules remain available through its explicitly activated specialist, skill, and prompt.

### User Story 4 - Naming a chosen visual system without new machinery (Priority: P2)

As someone who has chosen a specific visual system for a design, I want to record that choice in the ordinary approved direction and task wording, so that the decision is captured without any new registry, adapter, or schema.

**Why this priority**: Recording a choice is useful, but building shared theme infrastructure for hypothetical future systems is unwarranted now.

**Independent Test**: Record a chosen visual system in a design's approved-direction and task prose and confirm no shared registry, adapter interface, discovery layer, workflow lane, or persistent schema is introduced anywhere to support it.

**Acceptance Scenarios**:

1. **Given** a design that selects a specific visual system, **When** the choice is recorded, **Then** it appears only in ordinary approved-direction and task wording.
2. **Given** the need to accommodate future visual systems, **When** this feature is delivered, **Then** no shared registry, adapter interface, discovery layer, new workflow lane, or new persistent schema is created.

## Edge Cases

- A project with the design lane and no visual-system pack completes the full loop with all generic quality gates and no inert theme references left behind.
- A project with both the design lane and a visual-system pack keeps them independent: the design lane still names no visual system, and the visual system still activates only on explicit identity or existing evidence.
- A generic request that happens to concern colour, contrast, focus, spacing, radius, or shadow stays generic and is not captured by the installed visual system.
- A dynamic target declares capabilities a static target cannot provide; realism validates affordances against that richer envelope rather than forbidding them.
- A target whose implementation owner declares no envelope pauses realism to request one instead of assuming a default technology.
- A surface already using the visual system remains eligible for that system on the strength of existing evidence.
- Removing the always-on rules artifact leaves the visual system fully usable through its explicitly activated specialist, skill, and prompt.

## Requirements

### Functional Requirements

- **FR-001**: The design lane MUST present a visual-design proposal workflow — explore, mock, preview, approve, apply — that is independent of any site generator, documentation theme, web framework, styling language, brand, or visual system.
- **FR-002**: The design lane MUST preserve its existing behavior and gates: the design-status lifecycle, approval and re-approval gates, exact-owner resolution, coordinator-only workflow state, active execution-lane authority, provenance, accessibility and contrast, rendered-evidence close checks, and post-implementation refinement classification.
- **FR-003**: The design lane MUST NOT name, depend on, route to, validate through, or conditionally activate any implementation-technology, brand, or visual-system pack, and MUST contain none of their specific references, validators, routes, authority, assumptions, or conditional behavior.
- **FR-004**: The design lane MUST keep generic design quality — accessibility, contrast, provenance, and functional realism — inside the generic workflow and MUST NOT delegate it exclusively to any visual-system pack.
- **FR-005**: Functional realism MUST validate each actionable affordance against the capability envelope declared by the actual target's implementation owner, and MUST NOT assume a fixed static, backend-free, or otherwise specific target.
- **FR-006**: When an affordance falls outside the declared envelope, the workflow MUST resolve it before approval by replacing it with a real equivalent, dropping and recording it, or flagging it as a design gap and routing it back.
- **FR-007**: The design lane MUST route implementation of an approved design to whichever installed specialist owns the actual target surface and MUST name no specialist, technology, or theme as a default.
- **FR-008**: The visual-system pack MUST remain a standalone system that neither references nor depends on the design lane or any other pack.
- **FR-009**: Installing the visual-system pack alone MUST NOT impose it on generic visual work; it MUST ship no always-on rules artifact that applies its rules ambiently to matching visual files.
- **FR-010**: The visual-system pack's specialist and skill MUST activate only on explicit identity — its name, its option flags, its named palettes — or existing evidence of that system, and MUST NOT be selected by generic visual phrasing such as theme, style, chart colours, dark theme, contrast, focus, spacing, radius, or shadow.
- **FR-011**: The visual-system pack's rules MUST remain fully available through its explicitly activated specialist, skill, and prompt after the always-on artifact is removed.
- **FR-012**: Future visual systems MUST remain independent peer packs; this feature MUST NOT introduce a shared theme registry, adapter interface, discovery layer, new workflow lane, or new persistent schema.
- **FR-013**: A chosen visual system MUST be recordable in ordinary approved-direction and task wording, with no new persistent field, state, or schema required.
- **FR-014**: The design lane's existing lane, ownership, and lifecycle guarantees MUST remain covered by their current checks, and new checks MUST add technology- and theme-independence coverage without weakening those guarantees.
- **FR-015**: Both packs' installed representations and the install record MUST be updated to match their changed source — including deleting the removed always-on artifact — as one consistent transaction, with no hand-editing of any installed representation.

### Key Entities

- **Design proposal lane**: The generic visual-design workflow (explore, mock, preview, approve, apply) and its quality gates, independent of technology and theme.
- **Target capability envelope**: The set of capabilities the actual target's implementation owner declares, against which functional realism validates affordances.
- **Implementation owner**: The installed specialist that owns the actual target surface and to whom implementation is routed; no default.
- **Visual-system pack**: A standalone, opt-in visual language activated only by explicit identity or existing evidence.
- **Always-on rules artifact**: The removed ambient instruction that previously applied one visual system's rules to matching visual files by default.
- **Approved-direction wording**: The ordinary prose in a design's approved direction and tasks where a chosen visual system may be named without new schema.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The design pack and its workflow contain zero references to any specific site generator, documentation theme, web framework, styling language, company brand process, or visual-system pack, confirmed by inspection and by regression checks.
- **SC-002**: The full propose, approve, and apply loop and every preserved gate — design-status lifecycle, approval and re-approval, exact-owner and coordinator-only state, active-lane authority, provenance, accessibility, rendered evidence, and refinement classification — remain present and pass their existing checks unchanged.
- **SC-003**: Functional realism validates affordances against a declared target capability envelope for at least one static and one non-static example, with out-of-envelope affordances replaced, dropped and recorded, or flagged, and no fixed static assumption applied.
- **SC-004**: The visual-system pack ships no always-on rules artifact; its installed representation and the install record no longer contain that artifact, confirmed on disk and in the record.
- **SC-005**: The visual-system specialist and skill are selected only by explicit identity or existing evidence, and no generic visual phrase in the enumerated set selects them, confirmed by regression checks.
- **SC-006**: The design lane and the visual-system pack contain no reference to each other, confirmed by inspection and regression checks.
- **SC-007**: No shared registry, adapter interface, discovery layer, new workflow lane, or new persistent schema is introduced, and a chosen visual system is expressible in ordinary approved-direction and task wording.
- **SC-008**: Both packs' installed representations and the install record match their changed source after refresh, with the removed artifact absent and every other artifact parity-verified, and no installed representation hand-edited.

## Assumptions

- The actual target's implementation owner authoritatively declares the target capability envelope; the design lane validates affordances against it and does not itself decide implementation capability.
- The retained design workflow stays behaviorally intact; only its technology and theme coupling is removed.
- Generic design quality stays owned by the generic design workflow, never by a visual-system pack.
- No new persistent schema, registry, adapter, or discovery layer is warranted now; a selected visual system is named in ordinary approved-direction and task wording.
- Both packs are installed in this workspace, so after their source changes their installed representations and the install record are refreshed through the sanctioned pack-refresh operation rather than hand-edited.
- This is one coherent outcome spanning the design pack and the one existing visual-system pack; it neither reopens another feature nor creates a cross-pack contract.

---
title: Theme-Agnostic And Technology-Independent Design Workflow
slug: theme-agnostic-design-workflow
status: defined
spec_path: .dude/specs/032-theme-agnostic-design-workflow/spec.md
---

# Idea: Theme-Agnostic And Technology-Independent Design Workflow

## Idea

Trying the `design` pack revealed that, despite its `pack.md` manifest claiming standalone, technology-independent behavior, its actual workflow is still tied to Hugo and Docsy. Make the design pack genuinely:

- generic and independent;
- theme-agnostic;
- agnostic to implementation approach, including static versus dynamic web and any specific framework or site generator;
- a workflow for **visual elements and visual design** — not an implementation workflow for Hugo, Docsy, Web, React, CSS/SCSS, Microsoft branding, or any other technology.

The generic design workflow should retain:

- explore → mock → preview → approve → apply;
- the `design_status` lifecycle and the approval / re-approval gates;
- exact owner resolution, coordinator-only workflow state, and active execution-lane semantics;
- provenance: displayed content maps to real content / data;
- functional realism: each affordance maps to a capability the actual target can deliver;
- accessibility and visual verification;
- rendered-evidence close checks and post-implementation refinement classification.

Functional realism must become **target-capability-aware** rather than declaring every target to be a static Hugo/Docsy site with no backend. The implementation owner establishes the target capability envelope; design validates affordances against it and replaces, drops, or flags anything that is not buildable.

Technology-specific constraints belong to their own implementation packs. Hugo/Docsy own static-site constraints; Web (or another owner) may support dynamic, server, or per-user behavior. The generic design pack routes implementation to whichever installed specialist owns the actual target, and names none as a default.

### Theme / visual-system decoupling

Strata must be **optional, totally unrelated, and decoupled from design and every other pack**. More themes / visual systems are expected in the future, with Strata only one selectable option. Therefore:

- `design` must contain **zero** Strata-specific references, validators, routes, authority, assumptions, or conditional behavior.
- Strata must not depend on or reference `design`.
- Merely installing Strata must not automatically impose Strata on generic visual work.
- The current broad Strata `.instructions.md` applies Strata rules to nearly every visual file; that ambient behavior conflicts with explicit theme choice and must be removed or otherwise cease to auto-apply globally.
- Strata agent / skill triggers must be narrowed to explicit Strata intent or existing Strata identity — for example "apply Strata," `--strata-*`, pigment / spectrum palettes, or already-Strata surfaces. Generic "theme this app," "style this chart," "fix contrast," "fix focus," spacing, radius, or shadow requests must not automatically select Strata.
- Future themes / visual systems remain independent packs. Do not create a shared theme registry, adapter interface, new workflow layer, or theme-discovery system without a current caller (YAGNI).
- A selected theme / visual system may be named in the ordinary approved direction and task wording; no new persistent schema is needed now.
- Generic design quality — accessibility, contrast, provenance, realism — remains generic and must not be delegated exclusively to any theme pack.

## Open Questions

No open questions remain. The outcome-shaping decisions were made explicitly, so none block a later `define`:

1. RESOLVED — Should `design` keep any Strata-specific behavior? No. `design` carries zero Strata references, validators, routes, authority, assumptions, or conditional behavior, and Strata is one optional, decoupled theme among future peers.
2. RESOLVED — Should installing Strata keep applying it to generic visual work? No. The broad ambient rules and the generic visual-task triggers must stop auto-selecting Strata; only explicit Strata intent or an existing Strata surface selects it.
3. RESOLVED — Should functional realism keep assuming a static Hugo/Docsy target with no backend? No. It becomes target-capability-aware: the implementation owner sets the capability envelope and design validates affordances against it.
4. RESOLVED — Should a shared theme registry, adapter, or discovery layer be built for future themes? No (YAGNI). Future themes stay independent packs; a selected theme is simply named in the approved direction and task wording, with no new persistent schema now.

## Assumptions

- The implementation owner authoritatively establishes the target capability envelope — Hugo/Docsy for static-site constraints, Web or another owner for dynamic, server, or per-user behavior — and design validates each affordance against that envelope.
- The retained workflow (explore → mock → preview → approve → apply, `design_status`, approval / re-approval gates, exact-owner resolution, coordinator-only workflow state, active-lane semantics, provenance, functional realism, accessibility and visual verification, rendered-evidence close, and refinement classification) stays behaviorally intact; only its Hugo/Docsy/Microsoft/Strata coupling is removed.
- Generic design quality (accessibility, contrast, provenance, realism) stays owned by the generic design workflow, never by a theme pack.
- No new persistent schema, registry, adapter, or discovery layer is warranted now; a selected theme / visual system is named in ordinary approved-direction and task wording.
- This is one coherent outcome that spans coordinated changes to the `design` pack and the `strata` pack; how it is packaged is a define-time decision.

<!-- dude:managed:start -->
## Normalized Intent

- Make the `design` pack a generic, theme-agnostic, technology-agnostic visual-design proposal workflow that is independent of any site generator, framework, static-vs-dynamic choice, brand, or visual system.
- Preserve the workflow's behavior and gates: explore → mock → preview → approve → apply; the `design_status` lifecycle and approval / re-approval gates; exact-owner resolution; coordinator-only workflow state; active execution-lane semantics; provenance; functional realism; accessibility and visual verification; rendered-evidence close checks; and post-implementation refinement classification.
- Replace Functional Realism's hard-coded "static Hugo/Docsy site with no backend" premise with a target-capability-aware check: the implementation owner declares the target capability envelope, and design validates each affordance against it, then substitutes a real equivalent, drops it, or flags a `design-gap`.
- Route implementation to whichever installed specialist owns the actual target — Hugo/Docsy for static-site constraints, Web or another owner for dynamic / server / per-user behavior — and name no specialist or theme as a default.
- Fully decouple `design` and `strata`: `design` carries zero Strata references, validators, routes, authority, assumptions, or conditional behavior, and `strata` neither depends on nor references `design`.
- Stop Strata from being ambient when installed: the broad default-rules instructions must no longer auto-apply to nearly every visual file, and Strata agent / skill triggers narrow to explicit Strata intent or existing Strata identity.
- Keep future themes / visual systems as independent, peer packs with no shared registry, adapter interface, workflow layer, discovery system, or new persistent schema (YAGNI); a selected theme is named only in ordinary approved-direction and task wording.
- Keep generic design quality (accessibility, contrast, provenance, realism) in the generic workflow, never delegated exclusively to a theme pack.
- Treat this as one coherent outcome spanning the `design` and `strata` packs; leave packaging (one feature or coordinated separate features) and any pack theme/technology-independence guardrail candidate to define-time — neither blocks this capture.

## Current Evidence

Observed in current pack source; grounding for definition, not user intent:

- `library/packs/design/pack.md` advertises a standalone, technology-independent lane (its "Independence" section says `design` can be installed alone in a hand-authored Hugo site).
- `library/packs/design/skills/dude-pack-design-workflow/SKILL.md` contradicts that independence with normative coupling: Hugo/Docsy activation and surfaces, a Functional Realism section that declares the target "a static Hugo/Docsy site with no backend," Microsoft visual-brand handling with Brand Central routing, Hugo template / SCSS `plan.md` and task examples, a Hugo/Docsy build/server close step, a required Strata validator (`strata-check`) close step, and routing of visual-quality authority to the Strata stylist agent (`dude-pack-strata-stylist`).
- `library/packs/design/skills/dude-pack-design-workflow/design-workflow.test.mjs` pins lane, ownership, and lifecycle semantics but does not pin technology- or theme-independence, so genericization must add that coverage without regressing the lane / ownership / lifecycle guarantees.
- `library/packs/strata/instructions/dude-pack-strata-visual-system.instructions.md` uses a broad `applyTo` (`**/*.{html,css,scss,jsx,tsx,vue,svelte,md,mdx,astro}`) with "when working on any visual surface" default rules, making Strata ambient whenever it is installed.
- The Strata stylist agent (`dude-pack-strata-stylist.agent.md`) and the `dude-pack-strata-visual` skill descriptions carry generic visual-task triggers ("theme this app," "style this chart," "fix the contrast," "fix the focus rings," "make this less rounded," "get rid of these drop shadows") beyond explicit Strata selection.

## Constraints

- This turn is brainstorm intake only: create or modify nothing under `.dude/specs/`, run no implementation or tests, and touch no other idea, memory, docs, backlog projection, execution state, installed `.github/` file, or pack source. Definition requires an explicit `define theme-agnostic-design-workflow`.
- Keep the design `spec.md` intent technology-agnostic and theme-agnostic; technology and theme "how" belongs to the owning implementation pack (Hugo/Docsy, Web, …) and to each theme pack, never to `design`.
- `design` must contain zero Strata-specific references, validators, routes, authority, assumptions, or conditional behavior; `strata` must not reference or depend on `design`.
- Do not add a shared theme registry, adapter interface, new workflow layer, theme-discovery system, or new persistent schema — no current caller (YAGNI).
- Preserve the design lane / ownership / lifecycle contracts the current tests pin; add technology- and theme-independence coverage rather than weakening them.
- Do not name any implementation specialist or theme as a default; route to the installed owner of the actual target.
- Implementation detail for later normalization (not user intent): both `design` and `strata` are installed in this dogfood repo, so after editing pack source the installed projections and inventory are refreshed with the shipped `compose refresh` operation during implementation.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger (coordinated `design` genericization plus `design` / `strata` decoupling)
- [x] Open questions are resolved or consciously assumed
- [x] Definition requires an explicit `define theme-agnostic-design-workflow`

## Coordinator Log

- 2026-08-13 UTC - brainstorm captured; definition deferred to explicit `define`
- 2026-08-13 UTC - defined as feature 032 (via ship)
- 2026-08-14 UTC - feature 032 closed through autonomous Work: T001@6465736e, T002@73747261, and T003@72667368 settled with accepted verification and independent review; the design workflow is technology- and theme-independent, Strata activates only from explicit Strata identity or existing Strata evidence, the ambient Strata instruction was removed from source and installed inventory, and both installed packs were refreshed transactionally; fresh acceptance passed 15/15 focused tests, 2,318 repository tests with 2,314 pass / 0 fail / 4 pre-existing skips, lint 0 warnings / 0 failures, all 16 packs with 0 failures / 0 leftovers, source-installed and generated-core parity, release build/lint, and `git diff --check`
<!-- dude:managed:end -->

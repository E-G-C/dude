---
title: Pack Visual Neutrality
slug: pack-visual-neutrality
status: defined
spec_path: .dude/specs/042-pack-visual-neutrality/spec.md
---

# Idea: Pack Visual Neutrality

## Idea

Origin: https://github.com/E-G-C/dude/issues/20

“Hugo has nothing to do with this. Hugo is just another pack that I use and
shouldn't enforce any pack in particular. It should use whatever visual system
I pick in any project, counting that it has been added.”

A domain pack renders surfaces; whichever visual system the project selected
governs their appearance. A domain pack must not name, route to, or assume a
specific visual provider.

Projects select a visual system per surface through their own project-owned
`dude-local-*` instructions, because `applyTo` accepts glob lists. Several
visual systems may therefore coexist in one repository at different paths.
That selection mechanism is user-owned and must stay unrestricted.

This is about correcting existing packs that violate the established
visual-neutrality boundary. It is not a request for new visual-system
architecture. The clear current violation is the Hugo routing instruction that
requires `@dude-pack-ms-brand-stylist` for rendered surfaces even though the
`ms-brand` pack is absent. Docsy is a domain/technology pack, so Hugo's
`@dude-pack-docsy-expert` references are legitimate technology routing rather
than visual-provider violations.

### How theme and visual-system packs integrate

They do not communicate with each other. Both integrate through project-owned
files:

- `library/packs/docsy/instructions/dude-pack-docsy-docsy-scss.instructions.md`
  documents three project-owned extension points:
  `assets/scss/_variables_project.scss` before Bootstrap,
  `assets/scss/_variables_project_after_bs.scss` after Bootstrap, and
  `assets/scss/_styles_project.scss` after all imports. It marks
  `assets/scss/td/` as internal and not covered by SemVer.
- `library/packs/strata/skills/dude-pack-strata-visual/tokens/` ships portable
  `strata.css`, `strata.scss`, `strata-tokens.json`, and
  `tailwind.preset.js`.
- `library/packs/strata/pack.md` says the tokens drop in like any other
  stylesheet and that `tokens/strata.css` or `tokens/strata.scss` can be
  imported from the theme's own variables file. It explicitly calls this an
  integration detail, not a dependency.

The theme pack exposes an extension point, the visual system ships importable
tokens, and the project's own file is the joint. This has the same shape as
project-owned `dude-local-*` selection: each pack integrates with the project,
never with a sibling pack. No handshake, contract, registry, capability
negotiation, adapter, or other pack-to-pack protocol is required or should be
introduced.

## Open Questions

Questions 1 and 2 are resolved. Only question 3 remains open.

1. RESOLVED — Is `docsy` a visual provider or a domain/technology pack? Docsy
   is a domain/technology pack, not a visual provider.

   > "Hugo is a theme, but out of the box that theme looks horrible. That's why
   > sometimes we customize that theme with the visual packs that we add.
   > Therefore it cannot itself enforce any reference to any other particular
   > pack. By default it will look like out of the box, but then when we enforce
   > a visual system, as we'd called it in the past, it should follow it."

   Normalized: a theme pack supplies the out-of-the-box baseline, which is a
   legitimate default rather than a degraded state. When a project selects a
   visual system, the surface follows that system instead. Because a theme pack
   is customized by whichever visual system the project adds, it must never
   reference a particular visual provider.

   Consequence: Docsy expertise is legitimate technology routing, so Hugo's
   `@dude-pack-docsy-expert` references are not visual-provider violations. The
   clear violation is the `@dude-pack-ms-brand-stylist` route.
2. RESOLVED — Should the absent `ms-brand` pack be restored or should its
   existing references be purged? Purge the references. Do not restore the
   absent pack. This includes the Hugo routing dead end and stale catalog and
   documentation mentions. Purging removes an unresolvable handle rather than
   deleting a working capability.
3. Does this bounded correction need a definition package at all, or should it
   remain a direct bug or chore?

## Assumptions

- The resolved Visual System Pack Convention remains the working architecture:
  concrete visual systems are independent packs, not children of an umbrella
  pack.
- A selected visual system is already available to the project; this correction
  adds no provider registry, activation state, or selection mechanism.
- Existing project guardrails and pack-authoring conventions already own the
  governing rule. This work corrects violations rather than duplicating or
  replacing that rule.
- Current repository evidence may be rechecked before remediation if the pack
  catalog or referenced files change.

<!-- dude:managed:start -->
## Normalized Intent

- Remove the fixed visual-provider close route from Hugo's coordination
  guidance. Leave its Docsy technology routes intact and keep the remaining
  workflow sequence coherent without adding a generic visual-system step.
- Purge live catalog, related-pack, routing, and warning-guidance references that
  imply the absent `ms-brand` pack exists. Do not restore the pack.
- Keep project-owned, path-scoped `dude-local-*` selection as the only visual
  authority for a surface; a domain or theme pack exposes extension points but
  never communicates with or selects a visual-system pack.
- Preserve four inert arbitrary-name examples used by lint explanation, import
  normalization, and text-ranking coverage. They exercise generic hyphenated
  names and do not advertise, install, route to, or otherwise imply a real pack.
- Use this explicit Ship definition subaction to create one lean package for the
  bounded correction. Add no registry, adapter, protocol, capability
  negotiation, activation state, or generic visual-system indirection.

## Current Project Context

- The Hugo routing instruction has six valid technology-specialist routes,
  followed by a numbered fixed-provider step and a synthesis step. Removing the
  provider step leaves the synthesis step to be renumbered from 4 to 3. The four
  sibling Hugo instruction files contain no cross-reference to that numbered
  step.
- Live `ms-brand` existence references occur in
  `library/packs/README.md`, `library/packs/hugo/pack.md`,
  `library/packs/docsy/pack.md`,
  `library/packs/hugo/instructions/dude-pack-hugo-hugo-dude-routing.instructions.md`,
  `docs/commands.md`, and `src/skills/dude-compose/SKILL.md`.
- Compose verification temp-installs one catalog pack at a time. The current
  Hugo pack therefore produces sibling warnings for the absent Docsy and
  `ms-brand` agents, while Fluent UI produces still-valid warnings for absent
  web agents. After this correction, Hugo's Docsy warning and Fluent UI's web
  warnings remain valid; only the `ms-brand` warning disappears.
- `.dude/metadata/profile.md` currently installs `authoring`, `coding`,
  `design`, `release`, `strata`, and `writing`, not `hugo` or `docsy`.
  Therefore no edited pack has an installed projection to refresh in this
  workspace.
- `scripts/build-dev.mjs` projects authoritative `src/` core into `.github/`
  while preserving installed packs and `.dude/` data. The Compose guidance edit
  therefore projects to `.github/skills/dude-compose/SKILL.md`.

## Definition Resolutions

- The explicit `ship pack-visual-neutrality` invocation on this draft routes
  through definition, so this correction receives a package rather than
  remaining direct work. This resolves question 3 from accepted lifecycle
  intent without rewriting the user-controlled question.
- Docsy remains classified as a domain/technology pack. All
  `@dude-pack-docsy-expert` routes in Hugo remain.
- The absent `ms-brand` pack is not restored. Every live reference that presents
  it as a catalog entry, related pack, route, or expected sibling warning is
  removed.
- The lint comment, bundle-import documentation and normalization assertion,
  and text-analysis ranking fixture retain their existing arbitrary
  `ms-brand`-based names. These are inert parser or ranking examples, not pack
  existence claims; renaming them would add cosmetic churn without improving
  the accepted outcome.
- Warning guidance drops only `ms-brand`: it keeps the observed Hugo-to-Docsy
  and Fluent-UI-to-web sibling-warning examples.

## Constraints

- Do not replace the removed provider route with a generic visual-system route.
  The coordinator's closed roster already owns visual work when a current
  specialist applies.
- Do not remove or weaken Hugo's Docsy technology routing.
- Do not restore `ms-brand` or add an umbrella pack, provider registry,
  activation state, adapter, handshake, contract, capability negotiation, or
  pack-to-pack protocol.
- Do not constrain project-owned, path-scoped visual-system selection.
- Edit authoritative pack and core source only. Do not hand-edit installed pack
  projections, generated core, or the install profile.
- Keep only `spec.md`, `plan.md`, and `tasks.md`; no supporting artifact or
  active ObjectiveRegistry region applies.

## Definition Checklist

- [x] The explicit Ship route resolves the package-versus-direct-correction
      question without inventing a user answer
- [x] Three prioritized, independently testable stories cover routing neutrality,
      truthful live references, and fixture preservation
- [x] Requirements and success criteria distinguish live pack claims from inert
      arbitrary-name examples
- [x] Docsy technology routes and project-owned visual selection remain intact
- [x] Exact source, generated projection, profile, and verification consequences
      are planned
- [x] Existing project and bundle guardrails are sufficient; no new durable
      candidate exists
- [x] The specification has no unresolved clarification marker
- [x] Only the lean core trio applies
- [x] First-definition ownership is staged for the exact prospective path

## Coordinator Log

- 2026-08-25 UTC - brainstorm captured from GitHub issue #20; definition deferred to explicit `define pack-visual-neutrality` if a package is warranted
- 2026-08-25 UTC - brainstorm refreshed; Docsy classified as domain/technology routing, all absent `ms-brand` references set to purge, and project-owned SCSS/token integration recorded; whether a definition package is needed remains open
- 2026-08-25 UTC - defined -> .dude/specs/042-pack-visual-neutrality/spec.md (via ship)
- 2026-08-25T18:50:15Z - Ship completed `.dude/specs/042-pack-visual-neutrality/spec.md` in Lightweight Execution with both canonical tasks closed. The Hugo brand-check route was removed and its actions renumbered 1-3, live `ms-brand` claims were purged from the catalog, Hugo and Docsy sibling notes, command guidance, and the Compose skill, both Docsy technology routes were preserved, and the four inert parser and ranking fixtures were left byte-identical. Fresh evidence: recursive suite 2360 tests with 2356 passed, 4 skipped, and 0 failed; lint 0 warnings and 0 failures; compose verify across 16 packs with `hugo=2`, `fluent-ui=3`, zero failures, and zero leftovers; build-dev idempotent with exact source and generated parity and an unchanged install profile; pristine 63-file release with only the documented warning; independent review approved both tasks.
<!-- dude:managed:end -->

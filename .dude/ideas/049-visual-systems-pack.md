---
title: Visual Systems Pack
slug: visual-systems-pack
status: resolved
spec_path:
---

# Idea: Visual Systems Pack

## Idea

Let's create a pack that will contain visual themes where Strata is probably the first in there. Should I call it themes or styles? I don't know, something like that. Open to any suggestion.

The working recommendation is **Visual Systems Pack** (`visual-systems-pack`). “Themes” can imply surface skinning only, while “styles” is ambiguous with writing style and code style. “Visual systems” is broad enough to cover palettes, typography, spacing, tokens, materials, motion, component treatments, and other coherent visual languages. This is a working recommendation, not a finalized name.

The core intent is one outcome: create an optional pack or pack-family boundary for selectable visual systems or themes, with Strata likely the first system included or represented.

After discussing concrete examples, I accept the recommendation to normalize this concept as **Visual System Pack Convention**. The wording above preserves how the brainstorm started; the settled direction is a convention for independent packs, not a pack that contains visual systems.

- `visual systems` is a conceptual category or domain. Each concrete visual system is an ordinary, independently installable Dude pack and a direct child of `library/packs/`.
- There is no installable umbrella `visual-systems` pack and no nested `library/packs/visual-systems/<system>/` topology.
- Strata remains the independent `strata` pack. A future company-brand system, editorial system, or other concrete visual system would receive its own independent pack directory.
- Reuse the existing pack lifecycle operations: list, add, refresh, and remove. Do not add `add style`, `remove style`, a visual-system registry, global `active-theme` state, or another Compose engine path.
- Installation means availability, not activation. A visual system applies only when it is explicitly selected in the user request or approved direction. Multiple systems may be installed, and Dude must not guess between them.
- Removing a provider pack removes that pack's Dude artifacts, not project UI, CSS, tokens, assets, or other output already implemented with its guidance.
- Visual-system packs provide guidance, specialist agents and skills, and reference material. Runtime component libraries and assets remain ordinary project dependencies or source; Compose does not inject them into the project.

### Separate future onboarding UI context

I may later want a Dude onboarding UI that discovers or recommends packs by use case, such as UI work. That is a separate future feature with separate success criteria and is not part of this brainstorm.

- Any future machine-readable use-case tags or catalog classification should be designed for all packs when that cross-pack UI is defined, not introduced only for visual-system packs now.
- This convention adds no `tags:` field, category registry, UI schema, recommendation engine, or catalog API.
- Independent visual-system packs remain naturally compatible with that future UI because each has one stable pack identity and description that can later be classified.

## Open Questions

No material open questions remain for brainstorm. The two prior topology questions are answered:

1. RESOLVED — What packaging topology should “visual systems” use? It is a conceptual category with independently installable provider packs, each directly under `library/packs/`; there is no installable umbrella pack or nested visual-systems directory.
2. RESOLVED — Should the existing `strata` pack be moved or renamed? No. It remains the independent `strata` provider pack.

## Assumptions

- The accepted concept name is **Visual System Pack Convention**. The existing ledger title, slug metadata, and file path remain unchanged to avoid introducing draft identity drift.
- The generic `design` pack remains theme-agnostic. Visual systems are optional and decoupled, and installing one must not silently impose it on unrelated visual work.
- The existing flat pack layout and list, add, refresh, and remove lifecycle are sufficient; the convention needs no separate lifecycle, registry, activation state, or Compose path.
- Pack installation and removal govern Dude-provided artifacts, not runtime project dependencies, source, or already-implemented project output.
- A future cross-pack onboarding UI may classify stable pack identities and descriptions, but its metadata and behavior remain a separate future decision.

<!-- dude:managed:start -->
## Normalized Intent

- Adopt **Visual System Pack Convention** as the accepted normalized concept name while retaining the existing ledger title, slug, and path for identity stability.
- Treat `visual systems` as a conceptual category or domain, not a new installable umbrella capability.
- Represent every concrete visual system as an ordinary, independently installable direct child of `library/packs/`; do not create an umbrella `visual-systems` pack or nested provider topology.
- Keep Strata as the independent `strata` pack. Give each future company-brand, editorial, or other visual system its own peer pack identity and directory.
- Reuse list, add, refresh, and remove. Add no style-specific verbs, visual-system registry, global active-theme state, or alternate Compose engine path.
- Treat installation as availability only. Apply a system only from explicit user selection or approved direction, allow several systems to be installed, and never guess between them.
- Limit provider removal to the pack's Dude artifacts. Preserve project UI, CSS, tokens, assets, and other output already implemented from its guidance.
- Keep Dude packs focused on guidance, specialist agents and skills, and references. Runtime libraries and assets remain ordinary project dependencies or source and are not automatically injected by Compose.
- Preserve the generic `design` pack's theme-agnostic boundary.
- Keep the possible cross-pack onboarding UI separate. Defer any shared tags, classification, UI schema, recommendation engine, or catalog API until that feature is defined for all packs; stable independent pack identities and descriptions provide sufficient compatibility now.

## Current Project Context

- `.dude/ideas/theme-agnostic-design-workflow.md` establishes the binding separation between generic design work and optional visual systems.
- `library/packs/` already uses one direct directory per ordinary pack, and `library/packs/strata/` is the existing visual-system provider.
- The existing Compose lifecycle already lists, adds, refreshes, and removes packs and records exact installed Dude artifacts for removal.
- Independent pack identity and description are enough to leave room for later cross-pack discovery without adding speculative catalog metadata now.

## Constraints

- Keep provider packs flat under `library/packs/`; create neither an installable umbrella nor a nested visual-systems topology.
- Do not add style-specific lifecycle verbs, a visual-system registry, global activation state, or another Compose path.
- Do not infer activation from installation or choose among installed systems without explicit user selection or approved direction.
- Do not make pack removal delete implemented project output, and do not make Compose inject runtime dependencies or assets.
- Do not couple the generic `design` pack to Strata or any other visual system.
- Keep the future onboarding UI and any cross-pack classification metadata outside this brainstorm.
- This refresh modifies only this draft idea ledger. Definition, planning, tasks, and implementation require a later explicit workflow action.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one visual-system pack convention
- [x] Original naming uncertainty and brainstorm history are preserved
- [x] Packaging topology and the Strata consequence are resolved
- [x] Future onboarding UI context is bounded as a separate feature
- [x] Definition requires an explicit `define visual-systems-pack`

## Coordinator Log

- 2026-08-24 UTC - brainstorm captured; definition deferred to explicit `define visual-systems-pack`
- 2026-08-25 UTC - brainstorm refreshed; accepted Visual System Pack Convention with independent direct-child provider packs and bounded future onboarding UI context; definition deferred to explicit `define visual-systems-pack`
- 2026-08-25 UTC - idea resolved without a package because the accepted convention is already the working architecture and its one reachable gap was closed directly: a throwaway-bundle probe installed a second visual-system pack beside `strata` with no code change, discovery listed both providers, the pack's `model-class: visual` resolved automatically, and lint and `compose verify` reported zero failures and zero leftovers; per-path coexistence already works through project-owned `dude-local-*` instructions because `applyTo` accepts glob lists; the missing explicit-selection rule was added to `dude-pack-authoring-pack-conventions` with the theme/style/design-system/brand vocabulary named so a future provider cannot claim exemption; the remaining violation, where domain packs hardcode visual providers and `ms-brand` is referenced but absent, is tracked as issue #20; an umbrella pack, provider registry, activation state, or separate Compose path would add machinery no caller needs
<!-- dude:managed:end -->

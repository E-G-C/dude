---
title: Pack Discovery Metadata
slug: pack-discovery-metadata
status: defined
spec_path: .dude/specs/041-pack-discovery-metadata/spec.md
---

# Idea: Pack Discovery Metadata

## Idea

I need something usable now because the onboarding UI may take a while, and I want this work to become that UI's data source later rather than be discarded.

The accepted outcome is one cross-pack feature:

1. Add structured `use-cases:` metadata to pack manifests at `library/packs/<name>/pack.md` for user-centered discovery. Values use stable lowercase identifiers such as `ui`, `visual-design`, `writing`, `documentation`, `web-development`, `api`, and `security`.
2. Seed the metadata across the current catalog rather than limiting it to visual packs.
3. Extend the existing Compose list JSON result so every pack includes `use_cases` alongside its current stable fields: `name`, `installed`, and `description`. This is the reusable machine-readable contract for the future onboarding UI.
4. Add a useful consumer before that UI exists: `compose list --use-case <id>` filters pack discovery by one use case, including in JSON mode.
5. Validate malformed identifiers and duplicate values. Identifiers are stable, lowercase, and kebab-case. Do not add display-label localization, aliases, hierarchy, scoring, or a separate registry in this first slice.
6. Keep existing `routing_hints` separate. They map execution or task vocabulary to agents; `use-cases` support pack discovery and recommendations.
7. Treat use cases as recommendations only. They do not install, activate, select, or rank packs, and they do not imply compatibility between packs.
8. Preserve the existing add, remove, and refresh lifecycle and its preview and confirmation rules.
9. Defer categories, recommendation scores, automatic installation, compatibility inference, mutual exclusion, selection groups, a UI schema, a catalog API, and the onboarding UI itself. Add any of them compatibly only when a concrete UI requirement needs them.
10. Update documentation and tests, and preserve current list behavior when no `--use-case` filter is supplied.

### Relationship to Visual System Pack Convention

**Pack Discovery Metadata** and **Visual System Pack Convention** are complementary, separate outcomes. Discovery metadata answers which packs may help a user; the visual-system convention answers how competing visual providers are packaged and selected.

Visual systems remain ordinary independent packs, including `strata` and future brand or editorial systems, and may declare `ui` or `visual-design` use cases like any other pack. This feature introduces no umbrella `visual-systems` pack, visual-system registry, or activation state.

The existing `.dude/ideas/visual-systems-pack.md` ledger is not abandoned, absorbed, or replaced. It remains related context until its convention is documented and enforced or deliberately resolved later.

## Open Questions

1. Should `use-cases` remain schema-optional for backward compatibility even though every bundled catalog pack is expected to declare at least one? The conservative working assumption below is yes.
2. What is the exact initial controlled vocabulary for the current catalog? The accepted identifiers are a starting set, but the smallest catalog-grounded set can be finalized during definition.

## Assumptions

- `use-cases` is optional at the manifest schema boundary for backward compatibility, while every pack in the bundled current catalog is expected to declare at least one value.
- The initial controlled vocabulary will be the smallest set needed to describe the current catalog. It starts from identifiers such as `ui`, `visual-design`, `writing`, `documentation`, `web-development`, `api`, and `security`, without introducing a separate registry or speculative taxonomy.
- The two open details can be settled conservatively during definition and do not block this brainstorm.

<!-- dude:managed:start -->
## Normalized Intent

Define one small discovery contract. A pack manifest may declare stable
user-facing `use-cases`; omission normalizes to an empty list for listing and
add/refresh staging, while a present declaration must be non-empty, valid, and
unique. Every current bundled manifest is seeded and covered by a focused
repository test.

Compose list objects add `use_cases`, and one exact `--use-case` filter consumes
the field in human and JSON modes. The metadata stays read-only and separate
from routing and pack lifecycle authority.

## Current Project Context

- The catalog has 16 actual `library/packs/*/pack.md` manifests. Compose list
  supports local and external catalogs and currently returns `name`,
  `installed`, and `description`.
- `src/skills/dude-engine/lib/pack-manifest.mjs` is the existing bounded
  frontmatter helper. Add and refresh share `stagePackFromSource`.
- `.dude/metadata/profile.md` records `authoring` as installed. Its authoritative
  source changes must be previewed and refreshed through normal Compose so the
  installed authoring projections and profile stay current.
- Core source is authoritative under `src/` and projects to generated
  `.github/` core through `scripts/build-dev.mjs`; pack source is authoritative
  under `library/packs/`.

## Definition Resolutions

- Omission normalizes to `[]` for list, add, refresh preview, and refresh.
  Bundled completeness is enforced only by focused repository coverage over the
  maintained manifests.
- Seed exactly `api`, `bundle-authoring`, `documentation`,
  `release-management`, `software-development`, `ui`, `visual-design`,
  `web-development`, `work-tracking`, and `writing`.

## Constraints

- Use one bounded shared helper; add no registry, general YAML layer, service,
  cache, API, hierarchy, aliases, labels, localization, or scoring.
- Preserve list ordering and existing fields, source selection, routing
  semantics, read-only listing, and all add/remove/refresh safety rules.
- Seed only actual manifests. The absent `ms-brand` pack remains deferred, and
  every existing reference, row, warning, handle, and document line stays
  byte-for-byte unchanged.
- Change authoritative source first. Generate core with build-dev and refresh
  the installed authoring pack through Compose; hand-edit neither projection.
- Keep only the lean definition trio; no supporting artifact or active
  ObjectiveRegistry applies.

## Definition Checklist

- [x] Four independently testable stories cover metadata, filtering, maintained
      catalog quality, and lifecycle compatibility
- [x] Optional omission, present-value validation, and repository-only bundled
      completeness are explicit
- [x] The ten accepted identifiers cover all 16 actual manifests
- [x] Authoring-pack preview, refresh, projections, profile update, and lint are
      planned through the existing lifecycle
- [x] Existing project guardrails are sufficient; no new candidate is needed
- [x] The specification remains technology-agnostic and has no unresolved
      clarification
- [x] Only `spec.md`, `plan.md`, and `tasks.md` apply
- [x] First-definition ownership is staged for the exact prospective path

## Coordinator Log

- 2026-08-25 UTC - brainstorm captured; definition deferred to explicit `define pack-discovery-metadata`
- 2026-08-25 UTC - defined -> .dude/specs/041-pack-discovery-metadata/spec.md
- 2026-08-25T12:45:41Z - Ship completed `.dude/specs/041-pack-discovery-metadata/spec.md` in Lightweight Execution with all four canonical tasks closed. Fresh evidence: 85 focused checks passed, the recursive suite passed 2,356 tests with 4 skipped and 0 failed, build checks passed 25/25, all 16 packs verified with 0 failures and 0 leftovers, lint reported 0 warnings and 0 failures, the pristine 63-file release smoke passed, and independent review approved the final revision.
<!-- dude:managed:end -->

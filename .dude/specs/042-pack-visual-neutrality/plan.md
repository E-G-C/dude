# Implementation Plan: Pack Visual Neutrality

## Summary

Apply one bounded content correction across existing pack and core guidance.
Delete Hugo's fixed `@dude-pack-ms-brand-stylist` close action, renumber the
remaining synthesis action, and retain every `@dude-pack-docsy-expert` route.
Remove the absent pack's catalog row, related-pack notes, and expected-warning
mentions.

Keep the four arbitrary-name source examples unchanged: they exercise inline
reference extraction, lossless multi-token import normalization, and text
ranking rather than claiming a pack exists. This is the smallest semantic purge
that satisfies the accepted intent without weakening unrelated coverage.

Project the one changed core skill from `src/` through `scripts/build-dev.mjs`.
The current install profile contains neither Hugo nor Docsy, so no pack refresh
is applicable and the profile remains unchanged. Add no supporting artifact,
test module, ObjectiveRegistry region, or new architecture.

The exact prospective feature identity is
`.dude/specs/042-pack-visual-neutrality/spec.md`, prospectively owned by
`.dude/ideas/pack-visual-neutrality.md`.

## Technical Context

**Language/Version**: Markdown pack, skill, and user guidance; Node.js 20+ for
existing build, lint, Compose verification, and test tooling.

**Primary Dependencies**: Authoritative pack source under `library/packs/`,
authoritative core source under `src/`, `scripts/build-dev.mjs`, the existing
`dude-compose` verifier, and `dude-lint`.

**Storage**: Existing static source and its generated development projection
only. No registry, profile field, state file, cache, receipt, schema, or service
is added.

**Testing**: Focused semantic reference audit, routing-sequence inspection,
byte-preservation checks for the four inert contexts, source/generated parity,
pack-source Compose verification, workspace lint, existing build tests, the
recursive suite, pristine release validation, and diff hygiene.

**Target Platform**: Supported Dude workspaces on macOS, Linux, and Windows.

**Project Type**: Reusable coordination bundle with optional catalog packs,
generated dogfood core, and repository documentation.

**Performance Goals**: Not applicable; this is static guidance cleanup with no
runtime path or new processing.

**Constraints**: Keep `library/packs/` and `src/` authoritative. Never hand-edit
installed pack projections, generated core, or `.dude/metadata/profile.md`.
Preserve Docsy technology routing and project-owned visual selection. Add no
generic visual-provider step or speculative visual-system machinery.

## Specification Quality Validation

- Three prioritized, independently testable stories cover neutral domain
  routing, truthful live references, and preservation of generic fixture
  coverage.
- Acceptance scenarios distinguish Docsy technology expertise from visual
  selection, cover the no-system and multi-system cases, and define the semantic
  boundary between live references and inert examples.
- FR-001 through FR-011 state observable behavior without prescribing editing or
  projection commands.
- SC-001 through SC-006 are measurable through routing inspection, scoped source
  audits, verification warning counts, projection parity, and changed-path
  review.
- No unresolved clarification marker remains.

The specification satisfies its WHAT/WHY gate by inspection. This is not a
lint, publication, execution, or readiness claim.

## Verified Current Topology

1. `library/packs/hugo/instructions/dude-pack-hugo-hugo-dude-routing.instructions.md`
   has one numbered `## What to do` sequence. Steps 1 and 2 triage and route.
   Step 2 retains the Docsy route at lines 50-51. Step 3 at lines 64-65 requires
   `@dude-pack-ms-brand-stylist`. Step 4 at lines 66-67 synthesizes and reports.
   The direct-specialist escape-hatch example at line 74 also correctly uses
   `@dude-pack-docsy-expert`.
2. The other four files under `library/packs/hugo/instructions/` contain no
   numbered-step or brand-check cross-reference. Removing step 3 therefore
   requires only renumbering the current step 4 to step 3.
3. `library/packs/hugo/pack.md` `## Related packs` has valid Docsy guidance at
   lines 99-100 and one stale `ms-brand` bullet at line 101.
   `library/packs/docsy/pack.md` has valid Hugo guidance at lines 87-88 and one
   stale `ms-brand` bullet at line 89.
4. `library/packs/README.md` has the stale catalog row at line 30 and an
   expected-warning note at lines 120-121 naming Docsy and `ms-brand`.
   `docs/commands.md` has the same warning example at lines 837-838.
5. `src/skills/dude-compose/SKILL.md` lines 209-211 name current expected sibling
   warnings as Hugo-to-Docsy/`ms-brand` and Fluent-UI-to-web. Its generated
   counterpart at `.github/skills/dude-compose/SKILL.md` carries the same text.
6. `cmdVerify` in `src/skills/dude-compose/compose.mjs` copies the current bundle
   into a throwaway root, temp-installs each pack, runs lint, and reports
   aggregate per-pack warning/failure/leftover counts; it does not expose
   sibling-only warning counts. The coordinator-verified current warning totals
   are `docsy`=1, `strata`=1, `hugo`=3, and `fluent-ui`=3. Each total includes
   one baseline warning. Focused source audit identifies Hugo's two current
   orphan sibling handles as Docsy and `ms-brand`, and Fluent UI's two as web
   backend and web frontend. After the purge, `hugo` must report 2 total
   warnings (one baseline plus one Docsy orphan), while `fluent-ui` remains
   unchanged at 3 total warnings (one baseline plus two web orphans). The
   focused audit, not either aggregate total, proves those sibling subsets and
   the absence of `ms-brand`.
7. `.dude/metadata/profile.md` installs only `authoring`, `coding`, `design`,
   `release`, `strata`, and `writing`. Hugo and Docsy are absent. Their edited
   authoritative pack source has no installed projection to refresh; attempting
   to install or fabricate profile authority is out of scope.
8. `scripts/build-dev.mjs` enumerates core outputs from `src/`, maps
   `src/skills/dude-compose/SKILL.md` to
   `.github/skills/dude-compose/SKILL.md`, and preserves installed
   `dude-pack-*` paths and all `.dude/` data. The Compose skill is the only
   expected semantic generated-core change.

## Fixture-Versus-Reference Decision

Retain all four arbitrary-name contexts byte-for-byte:

- `src/skills/dude-lint/lint.mjs:305` explains that inline code parsing keeps a
  real Dude skill reference while discarding surrounding SCSS syntax. The name
  is illustrative and the comment is not catalog, routing, or install guidance.
- `src/skills/dude-bundle-import/import.mjs:236-237` and
  `src/skills/dude-bundle-import/import.test.mjs:121` form one documentation and
  assertion pair proving that stripping the literal `dude-pack-` prefix does not
  discard a multi-token pack-name segment.
- `src/skills/dude-engine/lib/text-analysis.test.mjs:27,31` uses `ms-brand` as an
  opaque ranking candidate whose words intentionally overlap “microsoft brand
  logo typography.”

Changing these names could preserve coverage with careful replacement, but it
would not remove a live capability claim. It would create cosmetic code and test
churn, obscure the bounded semantic rule, and provide no current caller or
acceptance benefit. The purge therefore targets only surfaces that advertise,
recommend, route to, install, or describe expected verification behavior for a
real pack. Generated copies of retained core comments remain ordinary build
projections and are not hand-edited.

## Chosen Design

### 1. Correct authoritative pack guidance

Edit only:

- `library/packs/hugo/instructions/dude-pack-hugo-hugo-dude-routing.instructions.md`
  - delete the complete two-line step 3 that pairs the brand check;
  - renumber the current “Synthesize and report” step from 4 to 3;
  - add no replacement visual-system step;
  - leave every Docsy route and direct-specialist example unchanged.
- `library/packs/hugo/pack.md`
  - remove only the `ms-brand` related-pack bullet;
  - retain the Docsy bullet unchanged.
- `library/packs/docsy/pack.md`
  - remove only the `ms-brand` related-pack bullet;
  - retain the Hugo bullet unchanged.
- `library/packs/README.md`
  - remove the `ms-brand` catalog row;
  - change the expected-warning example from Hugo referencing
    Docsy/`ms-brand` to Hugo referencing Docsy.

No new pack, route, provider abstraction, or test file is created.

### 2. Correct direct and core warning guidance

Edit only:

- `docs/commands.md`
  - drop `/ms-brand` from the Hugo expected-warning example and retain Docsy.
- `src/skills/dude-compose/SKILL.md`
  - change the expected-warning list to Hugo-to-Docsy and Fluent-UI-to-web;
  - preserve the surrounding verify contract.

After all authoritative edits, the coordinator runs
`node scripts/build-dev.mjs`. The expected semantic generated change is only
`.github/skills/dude-compose/SKILL.md`. Do not hand-edit that projection.

### 3. Apply projection and refresh consequences

The current installed map is authoritative and excludes both edited catalog
packs. Therefore:

- run no `compose refresh hugo` or `compose refresh docsy`;
- install neither pack merely to create refresh authority;
- leave `.dude/metadata/profile.md` byte-for-byte unchanged; and
- use `compose verify`, not a dogfood install, to validate their edited source.

If the installed map changes before implementation, stop and re-evaluate the
projection consequence before any pack mutation rather than guessing profile
authority.

## Test Strategy

### Focused content checks

1. Inspect the complete Hugo routing instruction and assert:
   - no `ms-brand` or brand-check action remains;
   - the numbered actions are 1, 2, and 3;
   - all six technology routes and both
     `@dude-pack-docsy-expert` occurrences remain; and
   - no generic visual-system action was added.
2. Search `library/packs/`, `docs/commands.md`, and
   `src/skills/dude-compose/SKILL.md` for `ms-brand`; expect no match.
3. Compare the four retained authoritative contexts against their pre-change
   bytes and require no diff. Search them contextually to confirm they remain
   parser, normalization, or ranking data rather than live pack guidance.
4. Inspect warning prose in all three documentation surfaces: Hugo-to-Docsy
   remains, Fluent-UI-to-web remains where currently documented, and no
   `ms-brand` example survives.

### Projection and pack-source checks

1. Confirm the install profile still excludes Hugo and Docsy before projection
   and remains byte-identical afterward; no Compose refresh is expected.
2. Run `node scripts/build-dev.mjs`, then require
   `.github/skills/dude-compose/SKILL.md` to be byte-identical to its `src/`
   source. Run the build a second time and require no further change.
3. Run `node --test scripts/build-dev.test.mjs` to exercise the core projection
   and preservation boundary.
4. Run `node .github/skills/dude-compose/compose.mjs verify --json`. Require all
   catalog packs to have zero failures and zero leftovers. Treat its warning
   counts as aggregate per-pack totals, not sibling-only counts: require
   `hugo`=2 total warnings (one baseline plus one Docsy orphan) and
   `fluent-ui`=3 total warnings, unchanged by this feature (one baseline plus
   web backend and web frontend orphans). Pair those totals with the focused
   source audit; the audit, not the aggregate output, must prove that Hugo's
   sibling subset is exactly Docsy with no `ms-brand` and that Fluent UI's
   sibling subset remains both web handles.

### Integrated acceptance

- Run the recursively discovered Node.js suite using the repository's canonical
  exclusion of `dist/`.
- Run `node .github/skills/dude-lint/lint.mjs .` and require zero failures.
- Build a pristine release, lint it against only the documented release-warning
  baseline, and confirm the projected Compose guidance contains no live
  `ms-brand` warning example.
- Inspect `.github/` changes after build-dev, require only intended projection
  effects, and run `git diff --check`.
- Route the unchanged revision and the same fresh evidence to independent review.

No new regression module is justified: existing Compose verification catches the
dead orphan route, existing build coverage owns projection parity, and a focused
semantic source audit proves the bounded documentation cleanup without encoding
a permanent fixture allowlist.

## Phases And Task Mapping

| Phase | Deliverable | Task |
|---|---|---|
| 1 | Authoritative routing, catalog, related-pack, and warning-guidance correction | `T001@70757267` |
| 2 | Core projection, source verification, integrated acceptance, and review | `T002@76657266` |

## Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-004 / SC-001 | Chosen Design section 1; focused routing checks | `T001@70757267`, `T002@76657266` |
| FR-005, FR-006 / SC-002, SC-004 | Chosen Design sections 1 and 2; source audit and Compose verification | `T001@70757267`, `T002@76657266` |
| FR-007, FR-011 / SC-003 | Fixture-versus-reference decision; byte-preservation and changed-path checks | `T001@70757267`, `T002@76657266` |
| FR-008 / SC-005 | Chosen Design section 3; build-dev parity and profile inspection | `T002@76657266` |
| FR-009, FR-010 / SC-006 | Bounded chosen design and integrated changed-path review | `T001@70757267`, `T002@76657266` |

## Risks

- A token-only search will find legitimate definition history and retained inert
  examples. Verification must preserve the semantic live-reference boundary
  rather than broadening the purge.
- Build-dev regenerates the core output set. Generated diff inspection is needed
  to distinguish the intended Compose skill projection from unrelated drift.
- Compose verification reports aggregate per-pack warning totals, not warning
  identities or sibling-only counts. The `hugo`=2 and unchanged `fluent-ui`=3
  checks must be paired with the focused route and Fluent UI source audit so a
  changed sibling mix cannot pass on totals alone.
- A profile change before implementation could make a pack refresh applicable.
  The installed map must be rechecked rather than inferred from pack presence in
  the catalog.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. No supporting artifact and no
active ObjectiveRegistry region is created.

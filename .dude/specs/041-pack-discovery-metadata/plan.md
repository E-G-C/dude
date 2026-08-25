# Implementation Plan: Pack Discovery Metadata

## Summary

Extend the existing bounded pack-manifest helper with one metadata parser and
identifier rule. Compose will use it for listing and for the existing
add/refresh staging path. Omission remains valid at those consumers, while
malformed present metadata fails consistently before add/refresh mutation.

Add `use_cases` to list objects and one exact `--use-case` filter. Seed the 16
maintained manifests, enforce their completeness in a focused repository test,
update only the authoring and user guidance that consumes the contract, refresh
the installed authoring pack through normal Compose, and project core source
with build-dev. YAGNI limits the design to those reachable callers.

The exact prospective identity is
`.dude/specs/041-pack-discovery-metadata/spec.md`.

## Technical Context

**Language/Version**: Dependency-free ECMAScript modules with `// @ts-check`,
Node.js 20+, and Markdown frontmatter.

**Primary Dependencies**: Existing filesystem APIs,
`src/skills/dude-engine/lib/pack-manifest.mjs`, and
`src/skills/dude-compose/compose.mjs`.

**Storage**: Authoritative metadata stays in `library/packs/*/pack.md`; no new
state, cache, registry, profile field, or service.

**Testing**: `node:test` in the existing manifest and Compose suites, one
repository-catalog check, recursive tests, build-dev parity, Dude lint, and
existing release checks.

**Target Platform**: Supported macOS, Linux, and Windows workspaces on Node.js
20+; existing Git-backed catalog behavior is unchanged.

**Project Type**: Core source under `src/`, generated dogfood core under
`.github/`, pack source under `library/packs/`, and repository documentation.

**Performance**: Keep one catalog resolution and one linear manifest scan per
list; filtering is an in-memory exact membership check.

**Constraints**: Preserve source selection, profile and lifecycle authority,
catalog order, unfiltered human output, and generated/source boundaries.

## Current Topology Evidence

- `pack-manifest.mjs` is a small frontmatter helper. Compose currently duplicates
  name and description reads, so one bounded metadata parser removes duplication
  without adding a YAML dependency.
- `stagePackFromSource` is shared by add and refresh, so one metadata check covers
  both lifecycle consumers before mutation.
- The repository has 16 directories containing `pack.md`. CI recursively runs
  all `*.test.mjs` files, making a focused repository test the narrow enforcement
  point for maintained-catalog completeness.
- `.dude/metadata/profile.md` records `authoring` with eight installed
  destinations and a source in another worktree. Refresh preview is read-only;
  refresh reprojects same-path files and updates artifacts plus profile through
  one all-or-restored transaction.
- `scripts/build-dev.mjs` projects `src/` to generated `.github/` core while
  preserving installed `dude-pack-*` artifacts and `.dude/` data.

## Chosen Design

### 1. One bounded manifest parser

Extend `src/skills/dude-engine/lib/pack-manifest.mjs` with a shared identifier
rule and `parsePackManifestMetadata(content)`, returning:

```js
{ name: string | null, description: string, useCases: string[] }
```

The parser reads only the first closed frontmatter block and the existing simple
scalar forms plus top-level inline or block `use-cases` lists. It:

- returns `[]` when the key is absent;
- preserves declaration order;
- requires a present list to contain at least one unique identifier matching
  `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`; and
- rejects repeated keys, non-list or empty forms, malformed items, and duplicate
  decoded values with an actionable error.

Keep `addProvide` and `listProvide` behavior unchanged and prove that editing
`provides` preserves adjacent use-case bytes. Do not grow a general YAML model or
serializer.

### 2. Compose list, filter, and staging

In `src/skills/dude-compose/compose.mjs`:

1. Import the parser and identifier rule.
2. Replace the private name reader in `stagePackFromSource` with one manifest
   parse before artifact staging. Add, refresh preview, and refresh then accept
   omission and reject malformed present metadata before projection.
3. Have `cmdList` parse each manifest, add `use_cases` to
   `{ name, installed, description }`, and optionally retain exact members of
   one validated `useCase`. Preserve catalog resolution, order, origin, enabled
   packs, installed-state authority, and unfiltered human lines.
4. Wire one `--use-case <id>` through argument parsing, help, main, and reporting.
   Missing, invalid, repeated, or non-list use is a usage error. JSON keeps full
   pack objects; human output uses one clear filtered-empty message.

List remains read-only, use cases are not written to the profile, and remove
remains source-independent.

`cmdVerify` remains unchanged: add no metadata-specific parser call, preflight,
branch, policy, fixture matrix, or behavior, and add no metadata assertion to
verify tests. Existing Compose verify runs only as broad no-regression evidence,
not as metadata acceptance.

### 3. Catalog, guidance, and projections

Add one inline declaration after `description` in each maintained manifest:

| Manifest | `use-cases` |
|---|---|
| `authoring` | `[bundle-authoring]` |
| `beads` | `[work-tracking]` |
| `coding` | `[software-development]` |
| `copilot-sdk` | `[software-development]` |
| `design` | `[ui, visual-design]` |
| `docsy` | `[documentation, web-development]` |
| `fluent-ui` | `[ui]` |
| `hugo` | `[web-development]` |
| `newsroom` | `[web-development, writing]` |
| `practices` | `[software-development]` |
| `release` | `[release-management]` |
| `rust` | `[software-development]` |
| `strata` | `[ui, visual-design]` |
| `technical-docs` | `[documentation, writing]` |
| `web` | `[api, ui, web-development]` |
| `writing` | `[writing]` |

The absent `ms-brand` pack remains deferred; preserve every existing reference,
row, warning, handle, and document line byte-for-byte.

Add the maintained-catalog check to
`src/skills/dude-engine/lib/pack-manifest.test.mjs`. It enumerates actual
`library/packs/*/pack.md` files, expects the 16 assignments above, and uses the
shared parser. This is test-only repository policy, not a production Compose
mode.

Update only these guidance surfaces:

- `library/packs/README.md` for manifest syntax and catalog authoring;
- `library/packs/authoring/skills/dude-pack-authoring-pack-conventions/SKILL.md`
  and
  `library/packs/authoring/agents/dude-pack-authoring-pack-smith.agent.md`;
- `src/skills/dude-compose/SKILL.md` for runtime behavior and result shape; and
- `README.md` plus `docs/commands.md` for the user-facing filter.

After editing authoring source, use the installed lifecycle:

1. Run
   `node .github/skills/dude-compose/compose.mjs refresh authoring --dry-run --json`
   and review the same eight recorded destinations as replacements with no
   additions or removals.
2. Run
   `node .github/skills/dude-compose/compose.mjs refresh authoring --json`.
   The expected semantic projection changes are
   `.github/skills/dude-pack-authoring-pack-conventions/SKILL.md` and
   `.github/agents/dude-pack-authoring-pack-smith.agent.md`; normal refresh
   replaces all eight recorded projections. The profile keeps the exact file list
   and updates `authoring.source.location` to the current local catalog realpath.
3. Run Dude lint after refresh. Do not refresh another pack or hand-edit an
   installed projection or profile.

Finally run `node scripts/build-dev.mjs` so the changed helper, Compose engine,
and Compose skill project to generated `.github/` core. Build-dev must preserve
the refreshed authoring projections and profile.

## Test Strategy

### Focused helper and catalog tests

- Cover omitted, valid inline/block, empty, non-list, malformed, repeated-key,
  and duplicate metadata.
- Preserve declaration order and existing `provides` editor behavior.
- Enumerate the real catalog, assert the exact 16 assignments, and prove a
  missing declaration fails the repository policy.

### Focused Compose tests

- Keep ordinary fixture manifests omitted by default and prove list, add,
  refresh preview, and refresh accept them.
- Cover additive local and external list objects, exact filtering, no matches,
  usage errors, human/JSON parity, and unchanged order/source fields.
- Prove malformed present declarations fail list and add/refresh staging before
  mutation.
- Retain existing remove, profile, preview, transaction, rollback, remote-source,
  and released-root regression coverage.

### Projection and integrated checks

- Review and apply the authoring refresh, inspect the two expected semantic
  projections and profile source update, then lint.
- Run build-dev and its parity/idempotency coverage; inspect that generated core
  changed only through the build and retained installed pack files.
- Run focused tests, the recursive suite, generated list filters, Dude lint,
  existing build/release tests, pristine release smoke, and diff hygiene over
  one unchanged revision.

## Phases And Task Mapping

| Phase | Deliverable | Task |
|---|---|---|
| 1 | Shared parser and focused tests | `T001@6d616e69` |
| 2 | Compose list/filter/staging and tests | `T002@6c697374` |
| 3 | Catalog, repository policy, docs, and authoring refresh | `T003@63617461` |
| 4 | Build-dev projection and integrated acceptance | `T004@70726f6a` |

## Risks

- The bounded parser intentionally accepts only documented simple frontmatter
  forms. A more complex external YAML form will fail rather than be guessed.
- Refresh will replace all eight recorded authoring destinations and change its
  stale source identity. The dry-run must show no unexpected addition or removal
  before applying the transaction.
- `use_cases` is additive, but strict object-shape consumers may need assertion
  updates; exact list tests constrain all unrelated fields and ordering.

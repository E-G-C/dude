# Implementation Plan: Guarded Directory Artifact Import

## Summary

Extend `dude-bundle-import` with a separate guarded directory workflow while leaving the existing single-file importer unchanged. Dependency-free Node scripts own fixed-provider acquisition, bounded inventory, whole-subtree ownership, strict canonical coordinator-boundary validation for agent entrypoints, hashing, conservative static evidence, complete-file review batches, reviewed-plan construction, overlap and drift refusal, and rollback-backed apply.

The public directory workflow is exactly:

```text
analyze-directory <source>
plan-directory --analysis <file> [--review <file>]
apply-directory <source> --plan <file> --confirm <literal>
```

It generates exactly two persisted artifacts: one directory analysis and one final reviewed directory plan. Planning is read-only and accepts no confirmation. The optional language-model review file and apply-time confirmation are bounded inputs. There is no finalize command, report artifact, plugin system, generic parser framework, selective-file UI, reference-rewrite layer, or hidden state store.

## Technical Context

**Language/Version**: Node.js >= 20 ESM with `// @ts-check`; strict JSON exchange records and Markdown guidance  
**Dependencies**: Node standard library and built-in `fetch`; no new package, Git executable, GitHub application, parser framework, or runtime installer  
**Storage**: Runtime under `src/skills/dude-bundle-import/`; generated dogfood under `.github/skills/dude-bundle-import/`; user-saved analysis, optional review, and plan JSON; apply-only private staging and backups  
**Testing**: `node:test`, temporary local fixtures, mocked GitHub API/raw responses, failure injection, existing single-file regressions, canonical agent-boundary and focused Dude lint agent/skill frontmatter regressions, projection tests, full repository gates, and independent review  
**Target Platform**: Cross-platform local workspaces supported by Node >= 20 and unauthenticated public GitHub over HTTPS  
**Project Type**: Dependency-free CLI/library within the reusable Dude bundle  
**Performance Goals**: Linear bounded acquisition, hashing, ownership, scanning, and planning plus stable lexical sorting  
**Source Limits**: depth 12, 256 entries, 128 regular files, 1,048,576 bytes per file, and 4,194,304 aggregate regular-file bytes  
**Review Limits**: 16 complete strict-UTF-8 text files and 262,144 decoded bytes per batch; files are never split  
**Network Limits**: at most 16 GitHub metadata requests and 128 raw requests; 1 MiB per metadata/raw response, 4 MiB aggregate metadata bytes, 4 MiB aggregate raw bytes, and 30 seconds per request  
**Constraints**: Project-local `dude-local-*` outputs only; no imported execution, dependency install, hook activation, transitive fetch, source-overlapping transaction material, plugins, authentication, or arbitrary hosts

The v1 source limits have no caller overrides. Network bounds apply while streaming, regardless of `Content-Length`.

## Spec Quality Validation

- Four prioritized stories have independent tests and observable acceptance scenarios.
- Twenty-nine requirements cover the exact commands and artifacts, fixed providers and limits, complete ownership, exact output bytes, canonical coordinator-only agent boundaries, LF/CRLF Dude lint compatibility, scanner and review boundaries, strict non-content blocking diagnostics, apply-time confirmation, replacements, overlap refusal, recovery, and compatibility.
- Ten measurable criteria cover determinism, fixed bounds, ownership completeness, exact transforms, evidence precedence, honest batch coverage, plan-bound literals, simple destination states, pre-mutation refusal, rollback, and single-file compatibility.
- The specification owns WHAT and WHY; Node, modules, JSON fields, HTTP mechanics, and staging live here and in `contracts/schemas.md`.
- No clarification remains.

Result: the specification passes the definition gate before technical planning.

## Guardrail Check

- Source remains authoritative under `src/`; generated `.github` runtime is rebuilt rather than hand-edited.
- This revision changes only definition artifacts. Runtime, tests, generated output, `tasks.md`, task state, and tracked execution remain untouched.
- Deterministic discovery, ownership, scanning, validation, and mutation stay in scripts. Language-model review is optional advisory evidence.
- Existing single-file commands and safety behavior remain a separate unchanged path.
- One fixed dispatcher and three focused modules avoid a provider or parser framework.

No project guardrail conflict or new durable guardrail is introduced.

## Responsibility Map

**Deterministic code owns** source authorization; no-follow local traversal and bounded GitHub metadata/raw acquisition; path, case, Git, SHA-256, alias, and identity validation; canonical ordering and hashing; strict entrypoint parsing and canonical agent-boundary validation; nearest-root ownership; fixed outputs and the skill-name-only rewrite; output collision and broken-literal-reference checks; static rules and retained evidence; complete-file batch generation; decision aggregation; canonical preview rendering; destination and replacement inventory; exact apply-time confirmation validation; source/destination drift revalidation; safe transaction-parent selection; staging, apply, verification, rollback, and recovery reporting.

**Language-model review owns only** advisory purpose, indirect-intent, cross-file, and prompt-manipulation review of the exact generated batches. It emits the minimal reviewed-batch IDs and advisory findings contract. It never authorizes an import, normalizes a plan, changes deterministic output, Blocks, or downgrades or erases static evidence.

**The user owns** selecting the root or a narrower retry, inspecting the final plan with findings and the complete replacement set, then confirming or cancelling apply.

**Always out of scope** are executing imported artifacts, installing packages or dependencies, activating hooks, and transitive fetching.

## Architecture

### 1. Commands, artifacts, and modules

Keep existing single-file entry points unchanged:

```text
analyze <file-url|file-path>
apply <file-url|file-path> --plan <plan.json>
```

Add only the three directory commands in Summary. `analyze-directory` and `plan-directory` write canonical JSON to stdout and never mutate an import destination. `apply-directory` is the only new mutator. Reject unknown or duplicate options, extra positionals, missing values, and directory flags on focused commands.

Keep `import.mjs` as the CLI adapter and public export surface. Add three modules:

```text
lib/directory-source.mjs  # fixed providers, bounds, exact bytes, manifest
lib/directory-risk.mjs    # published byte/text indicators and evidence
lib/directory-import.mjs  # ownership, analysis, review/plan, preflight, transaction
```

Each has one colocated test file. Existing `import-frontmatter.mjs` remains the strict entrypoint parser. Extract a shared single-file helper only behind existing regressions.

### 2. Fixed source dispatcher

Use one private contract:

```text
resolveDirectorySource(input, limits)
  -> { provenance, entries, readBytes(path), revalidate() }
```

A closed conditional selects `local-directory` or `github-tree`. Downstream code receives normalized entries and exact bytes, never provider callbacks or response-provided URLs. V1 has no registration API, plugin loading, arbitrary host, authentication, or generic VCS model.

### 3. Local bounded inventory

Resolve the source to an existing non-link directory. Traverse with directory entries and `lstat`; never follow links. Normalize selected-root-relative paths to POSIX form and reject empty, dot, control-character, backslash, duplicate, case-colliding, or escaping segments.

Inventory directories, regular files, links, and non-regular entries. Links and non-regular entries stay visible and Block. For each regular file:

1. enforce file and aggregate bounds before and while reading;
2. use final-component no-follow where available;
3. record exact byte count and SHA-256;
4. classify strict UTF-8 without NUL as text and all other bytes as opaque;
5. retain device/inode identity internally for drift and aliases; and
6. recheck root, ancestors, type, size, identity, and hash after reading.

This detects observed drift in a locally controlled workspace without claiming hostile race freedom.

### 4. GitHub metadata and commit-pinned raw bytes

Accept only:

```text
https://github.com/<owner>/<repo>/tree/<ref>/<subtree...>
```

Require HTTPS, literal `github.com`, default port, no credentials, query, fragment, backslash, empty/dot segment, or encoded separator. `<ref>` is one segment and the subtree is non-empty; slash-bearing refs are rejected rather than guessed.

Use GitHub API calls only to resolve the requested ref to an immutable commit and root tree, walk to the selected subtree, and retrieve bounded tree metadata. Reject truncated/malformed trees, unsupported modes, duplicate/case-colliding paths, missing sizes, and any local v1 bound violation. Never fetch blob content through the API or follow response-provided content/download/HTML URLs.

Construct each file URL from validated components:

```text
https://raw.githubusercontent.com/<owner>/<repo>/<commit>/<subtree/path>
```

Use `redirect: 'error'`, stream-enforce limits, and reject partial or unexpected responses. Verify SHA-1 over `blob <byte-length>\0` plus exact bytes against tree metadata and compute SHA-256 for the manifest. Planning and apply re-resolve the requested ref, require the same commit, and reconstruct the same raw URLs.

### 5. Entries, ownership, and exact outputs

Sort one canonical entries array lexically and hash it as `manifest_sha256`; provider provenance wraps rather than changes provider-independent records. Counts and fixed limits are derived from entries and schema version rather than serialized twice.

Use `parseImportFrontmatter` as the strict compatibility boundary. A valid `SKILL.md` or `*.agent.md` has present canonical frontmatter with scalar `name` and `description`; a skill name must pass the current `normalizeSkillDir`. Malformed candidates, missing required scalars, invalid skill names, or multiple entrypoints in one root Block.

Directory v1 is deliberately a clean-source path, not a batch version of focused adaptation. If an entrypoint has `compatibility`, `model`, `tools`, `license`, or any other metadata that the focused importer classifies for stripping, remapping, license disposition, or user judgment, Block that file with guidance to use focused single-file import or prepare a clean directory source. Do not normalize line endings, insert agent text, strip metadata, remap tools, materialize licenses, or make an adaptation judgment.

For each agent entrypoint, pin one local constant to the exact one-line paragraph emitted by the current team-expansion template and scaffolder:

```text
**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.
```

Validate it with a bounded physical-line check in `directory-import.mjs`, not a new parser, module, or semantic review step. After the existing strict frontmatter parser establishes the body and accepted LF or CRLF separators, scan without changing the source buffer: count the literal `**Coordinator-only artifacts:**` heading across the complete decoded entrypoint; walk body lines with only enough backtick/tilde fence state to exclude fenced examples; and recognize a valid block only when one unfenced, unprefixed body line equals the complete constant byte-for-byte and is bounded by blank body lines or a body edge. Accept only one heading occurrence and one valid block. Classify zero heading occurrences as `agent-boundary-missing`, more than one as `agent-boundary-duplicated`, one altered, incomplete, or split canonical sentence as `agent-boundary-malformed`, and one complete occurrence that is prefixed, prose-wrapped, fenced, or not standalone as `agent-boundary-noncanonical`. Each is an existing-shape non-content blocking diagnostic whose `path` is the agent entrypoint and whose guidance says to use focused single-file import/adaptation or prepare a clean source with exactly the canonical block. Never insert, move, normalize, or rewrite the block.

Ownership is simple:

1. One artifact root owns every regular descendant.
2. With multiple roots, each regular file belongs to its unique nearest ancestor root.
3. Only selected-root `LICENSE`, `LICENSE.*`, `NOTICE`, and `NOTICE.*`, case-insensitively, may be shared.
4. Equal claims, ambiguous roots, or files outside every root Block and name narrower roots the user can select.

There is no excluded-unassociated state, reference-derived ownership, broad reference parsing, rewriting, or repair.

Map skills under `.github/skills/dude-local-<name>/`, preserving root-relative descendants. Map an agent entrypoint to `.github/agents/dude-local-<stem>.agent.md` and other descendants under `.github/agents/dude-local-<stem>.support/`. Shared root notices retain their basenames per group. Duplicate/case-fold outputs and unsafe ancestors Block.

Preserve every output byte and line ending exactly except one transformation: use the parsed entry offsets to replace only a skill entrypoint's `name` scalar token with its final `dude-local-*` destination directory name. Preserve plain versus single-quoted versus double-quoted style and both quote bytes; the normalized name needs no escaping. Retain the key, colon, spacing, comments, delimiters, separators, body, and every other byte. Record `rewrite-skill-name` as that output's sole `transform_ids` value; all agent, support, example, script, license, notice, and other outputs have empty `transform_ids`.

Treat current Dude lint acceptance as an integration invariant on those exact output bytes. In `src/skills/dude-lint/lint.mjs`, replace the separate `content.split('\n')` behavior in `hasFrontmatter` and `readFrontmatter` with one lint-local physical-line helper shared by agent and skill checks. The helper first rejects any `\r` not immediately followed by `\n`, then splits only on LF or CRLF; callers continue to require delimiter lines exactly equal to `---` and retain the current narrow scalar regex, unquoting, skill-name equality, diagnostics, and other lint behavior. Agent validation uses the same delimiter boundary but does not compare its display `name` with its filename.

Do not import the bundle importer's strict parser into lint: that would introduce a sibling-skill dependency and more parsing semantics than lint needs. Do not reuse the feature-identity scalar parser because its current contract accepts bare CR for canonical idea metadata. A small lint-local separator primitive is the dependency-correct change; it must not normalize bytes, rewrite output, or grow into a general YAML parser.

Use one finite lexical grammar over strict text. Recognize exactly `](RELATIVE_PATH)`, `'RELATIVE_PATH'`, `"RELATIVE_PATH"`, and `` `RELATIVE_PATH` ``, where `RELATIVE_PATH` is `./TOKEN` or `../TOKEN`; no optional whitespace is permitted. `TOKEN` is a nonempty POSIX relative path using `/` and contains no whitespace, backslash, escape syntax, query `?`, fragment `#`, or recognized-form delimiter (`(`, `)`, `[`, `]`, single quote, double quote, or backtick). Quoted and backticked forms require exactly one matching delimiter on each side. Exclude reference-style Markdown, HTML or angle-bracket forms, prose outside these forms, escaped, nested, multi-backtick, or language-specific forms, and percent decoding. Resolve the captured source target lexically relative to its containing source file. Only when that target exists in the selected subtree as a regular file or directory, compare the unchanged token's lexical resolution from the corresponding output file with that target's fixed output mapping. Block with file/reference evidence and clean-source guidance if fixed mapping makes the output reference resolve elsewhere, escape the artifact output, or become absent. Never rewrite a mapping or reference.

### 6. Conservative static scanner

`directory-risk.mjs` scans every byte of every regular file. Strict-text rules include line locations; opaque files are scanned for exact byte signatures and printable ASCII evidence and Warn when no stronger rule Blocks. The eight risk categories are labels on findings, not modules or passes.

Publish a small versioned table:

| Category label | Broad indicators: Warn | Tightly bound high-confidence constructs: Block |
|---|---|---|
| Destructive action | recursive delete, broad overwrite, disk/permission tools | destructive operation with a root, home, workspace, or device target in one expression/command |
| Credential/data access | environment, key, token, credential, private-file reads | credential source joined to an outbound sink in one expression/command |
| Network/exfiltration | URL, client, upload, webhook, socket terms | sensitive source joined to disclosure/upload or a remote command sink |
| Dynamic/unsafe execution | shell, process, eval, interpreter, generated command | downloaded or decoded payload immediately executed with concealment |
| Privilege/bypass | elevation or protection-setting terms | boundary disabling joined to a dangerous mutation or execution in one command |
| Persistence/activation | startup, profile, hook, scheduler, service terms | persistence install plus activation in one command or expression |
| Obfuscation/evasion | long encoded payload or concealment terms | concealed decode immediately joined to execution |
| Prompt override | ignore-authority, hide-warning, skip-confirmation terms | authority override plus warning suppression plus dangerous action/tool use |

Rules are exact regex/byte patterns. Hard Block requires a complete published construct with dangerous operands captured inside one bounded expression or command; mere same-file coincidence cannot satisfy it. Every broader indicator Warns. There is no Markdown, JavaScript, shell, or other context parser, no context-based reduction, no AST, no domain or filename allowlist, and no semantic suppression.

### 7. Analysis and review batches

`analyze-directory` combines source provenance, one canonical entries array plus `manifest_sha256`, minimal groups, exact outputs and destination states, static evidence, non-content blocking diagnostics, complete-file review batches, and `analysis_sha256`. The schema version implies fixed limits and renderer guidance; neither is serialized. Public destination state is only:

```json
{ "type": "missing" }
```

or:

```json
{ "type": "regular-file", "sha256": "64-lowercase-hex" }
```

Before serialization, compute candidate mappings and evidence in internal nonserialized `destination_facts`. Canonical `outputs` serializes only candidates that are exact- and case-unique and whose destination state is `missing` or safe `regular-file`. Omit exact collisions, case collisions, unsafe ancestors or destinations, links, non-regular or multi-link destinations, unplanned conflicts, source/output identity aliases, and all other illegal candidates, while retaining their sources in canonical `entries`, their exact reasons and paths in blocking diagnostics, and their mappings and evidence in `destination_facts` for consistency checks. Every such diagnostic forces Blocked and prevents planning and apply. Never serialize an illegal destination-state variant or placeholder.

Construct every mandatory non-content Block as exactly `{code, path, related_paths, message, guidance}`. Use a stable versioned non-empty code; one normalized source-relative or workspace-relative principal path or `null`; sorted unique normalized related paths; a concise non-empty explanation; and concise remediation or narrower-root guidance, empty only when no user action is possible. This represents ambiguous or unowned ownership, malformed or adaptation-sensitive entrypoints, missing/malformed/duplicated/noncanonical agent coordinator boundaries, broken literal references, unsafe outputs or ancestors, destination collisions, source/output overlap, path aliases, and source/destination file-identity overlap without exposing internal identity metadata.

Validate diagnostic references against the bound entries, ownership, output, destination, and ancestor facts. Reject unknown or missing fields, invalid paths, a principal path repeated in that diagnostic's related paths, unsorted or duplicate related paths, duplicate (`code`, `path`, `related_paths`) identities, and code/reference inconsistencies. Sort diagnostics by code, path with null last, the complete related-path array, then message. Reconstruct `static_decision` from static findings and blocking diagnostics; any diagnostic forces Blocked, is rendered in the complete human preview, and prevents plan and apply.

Pack complete strict-UTF-8 files in entry order into batches of at most 16 files and 262,144 bytes. Never chunk or truncate a file. Each generated ordinal `batch_id` denotes its exact complete ordered `{path, content}` files inside the analysis identified by `analysis_sha256`; hashes and byte counts derive from entries and content rather than repeat in each batch. Text files too large for one batch and opaque files remain derivably uncovered and force Warned.

The analysis renderer may preview replacement paths by deriving them from output states. The final plan records the exact sorted `replace_paths`; there is no replacement-choice artifact or per-file selection.

### 8. Small review input and decision merge

The optional review input has exactly `schema_version`, `kind`, `analysis_sha256`, sorted unique `reviewed_batch_ids`, and `findings`. Listing one batch ID means the language model reviewed that exact complete generated batch tied by the analysis hash; there are no repeated path/hash lists, per-batch status rows, or failure records.

Each advisory finding has `batch_id`, a valid path within that reviewed batch, category, severity (`info` or `warn`), evidence, and explanation. Reject unknown fields, stale analysis hashes, unsorted or duplicate reviewed IDs, unknown IDs, findings for uncovered batches or paths, invalid categories or severities, empty evidence or explanations, and duplicate canonical finding tuples. Do not normalize malformed input into coverage.

The review may cover any subset of generated batches. Generated IDs absent from `reviewed_batch_ids` remain derivably uncovered, their paths appear in the preview, and they force Warned. Over-budget text, opaque files, deterministic warnings, or advisory warnings also force Warned. Language-model review cannot Block, authorize, normalize a plan, erase evidence, or lower deterministic severity. Clean requires no warning and coverage of every generated batch.

### 9. One reviewed plan and exact literal

`plan-directory` validates inputs, reacquires the source, and recomputes entries and manifest hash, ownership, scanner records, output bytes, destination states, replacements, and source/output overlap. All facts must equal the analysis. It accepts no confirmation and performs no write or transaction creation.

Aggregate the final decision, then serialize only source provenance, `analysis_sha256`, `manifest_sha256`, minimal groups, exact outputs, static and advisory findings in separate arrays, sorted `reviewed_batch_ids`, decision, complete `replace_paths`, and `plan_sha256`. Do not serialize fixed limits, claim text, repeated entries, review file lists, review failures, a transaction parent, or a required confirmation.

Compute `plan_sha256` over canonical plan JSON with only its own field omitted. After hashing, the renderer derives the required apply literal without inserting it into the hashed payload:

- Clean: `confirm-import`
- Warned: literal `confirm-warned-import:` plus `plan_sha256`
- Blocked: none

This construction is non-circular because the derived literal is not a plan field. There is no acknowledgement array, report digest, replace-all phrase, per-output selection, force field, override, or confirmation during planning.

### 10. Nonmutating overlap and apply preflight

Planning checks source/output and source/destination identity boundaries but neither chooses nor persists a transaction parent.

For local sources, planning and apply compare lexical paths, canonical existing ancestors, relevant case-normalized paths, and regular-file device/inode identities. Planning rejects source/output and output/output conflicts. Apply deterministically selects a safe disjoint transaction parent: prefer `.dude/state/import-transactions/` when it is outside the source and outputs and on the destination filesystem; otherwise use a private disjoint parent beneath `.github/` only when it satisfies the same checks. If neither is safe, refuse before creating transaction material.

Apply preflight rejects before mutation:

1. equality or ancestor/descendant overlap among source, any output, and transaction paths;
2. symbolic-link, mount, or case aliases resolving one boundary into another;
3. an existing destination sharing identity with any source file;
4. pairwise output path or existing-file identity aliases; and
5. transaction material aliasing an output or lying inside the source.

`apply-directory` parses and validates the plan digest, derives the one allowed literal from decision plus `plan_sha256`, and compares `--confirm` exactly once. It then repeats acquisition, commit binding, entries/manifest, ownership, scan, output, destination, replacement, transaction-parent selection, containment, alias, and identity checks. This recomputation/preflight is a separately tested nonmutating function. Any mismatch returns before transaction creation or destination writes.

### 11. Staged mutation and rollback

After preflight, create one private nonce directory beneath the apply-derived parent. It remains outside the source, disjoint from outputs, and on the destination filesystem when feasible. Refuse before mutation if safe staging cannot be established.

Stage all output and back up all replacements before the first destination mutation. Verify hashes and rerun cheap source/destination/overlap preflight. Write in sorted order with create-only or reviewed-replacement semantics, then verify outputs.

On failure, roll back in reverse order, remove transaction-created files, restore exact backups, and verify every touched path against pre-apply state. Remove transaction material only after success or verified rollback. On unverified restoration/cleanup, retain recovery material and report each path as restored, unchanged, or uncertain. Only verified complete installation succeeds.

### 12. Single-file compatibility

Do not route current `analyze` or `apply` through directory dispatch. Preserve local-file, GitHub blob, and raw GitHub forms; limits and redirects; frontmatter/license behavior; naming; destination binding; public exports; and honest partial-write semantics.

Run focused-import tests before and after shared-helper extraction. Directory rollback does not retroactively change single-file behavior.

### 13. Tests, guidance, and projection

Provider tests cover local paths/types/drift/aliases/bounds and GitHub URL/ref/commit/tree/raw/redirect/blob/hash/response/timeout behavior. Ownership/output tests cover one and many roots, nested nearest roots, root-only shared notices, ambiguous/unowned files, malformed or adaptation-sensitive entrypoints, exact support and agent bytes, one accepted canonical agent boundary plus missing/malformed/duplicated/noncanonical boundary diagnostics, skill-name-only rewriting, empty transform lists, every positive inline Markdown/image, quoted, and single-backtick grammar form, negative reference-style Markdown, HTML/angle, prose, whitespace, escaped, nested, multi-backtick, language-specific, and percent-encoded exclusions, mapping breaks for existing regular-file and directory source targets, including destination escape or destination absence caused by fixed mapping, canonical `outputs` limited to exact- and case-unique `missing` or safe `regular-file` candidates, omitted illegal candidates retained in canonical `entries`, exact blocking diagnostics, and internal `destination_facts`, collisions, unsafe ancestors, and narrower-root guidance.

Add focused regressions in `src/skills/dude-lint/{lint.mjs,lint.test.mjs}` for valid LF and CRLF agent and skill frontmatter, including a CRLF `dude-local-*` skill whose `name` equals its destination directory after `rewrite-skill-name`. Retain a namespaced skill-name mismatch failure and cover malformed delimiter variants and bare CR for both artifact kinds so the new acceptance does not broaden the delimiter contract or change existing lint outcomes.

Add end-to-end directory/lint regressions proving that an unchanged agent with the exact canonical block is accepted and passes current Dude lint under LF and CRLF, while agents with a missing or malformed block produce the file-specific blocking diagnostic and never reach installation. Keep duplicated and structurally noncanonical block classification in the focused ownership/output tests so integration coverage does not create another workflow stage.

Scanner tests are table-driven for every tightly bound hard construct, broad indicator, same-file false-positive counterexample, opaque-byte evidence, and precedence rule, with no context reduction. Analysis tests cover the compact entries/groups/outputs shape, canonical hashes, every non-content diagnostic family, exact fields and order, preview reconstruction, batch content/packing, and Blocked plan/apply refusal. Review/plan tests cover sorted complete-batch IDs, malformed/unknown/duplicate IDs and findings, omitted/stale review, advisory precedence, all decisions and plan-bound literals, non-circular hashing, complete replacements, simple states, overlap, and zero planning writes.

Apply tests separate nonmutating preflight from mutation. Drift and alias fixtures assert zero transaction/destination writes. Transaction fixtures inject failures at staging, backup, final preflight, each write, verification, rollback, and cleanup.

Update `src/skills/dude-bundle-import/SKILL.md`, `docs/commands.md`, `docs/setup.md`, and only applicable import text in `docs/upgrading.md`. Document commands, two artifacts, sources, fixed limits, ownership, exact bytes/transforms, the canonical coordinator-only agent boundary and no-insertion policy, adaptation-sensitive metadata and broken-reference blocks, indicator boundary without context reduction, review truth, plan-bound literals and complete replacements, overlap, rollback, no-safety-proof claim, and unchanged single-file behavior.

Run `node scripts/build-dev.mjs` after source changes so `.github/skills/dude-lint/lint.mjs` is regenerated from the corrected source alongside directory-import runtime projection. Extend projection assertions only to prove the three directory runtime modules and corrected generated lint ship while tests and project state do not.

## Complexity Record

Justified complexity:

- two fixed source branches for the two required v1 inputs;
- three modules for acquisition, deterministic evidence, and plan/apply invariants;
- Git blob SHA plus SHA-256 to bind raw bytes to tree metadata and the analysis;
- one analysis and one plan to bind optional review without a report layer;
- one finite static rule table with tightly bound Block constructs; and
- private rollback material for portable multi-file recovery.

Rejected complexity: plugins, arbitrary hosts, authentication, slash-ref guessing, API blob content, Markdown/JavaScript context parsers, universal ASTs, dynamic analysis, sandboxing, package management, dependency resolution, interactive adaptation, selective UI, inferred ownership, broad rewriting, automatic repair, directory identity graphs, extra reports, repeated review/failure records, and hidden stores.

## Project Structure

```text
.dude/specs/003-guarded-directory-artifact-import/
|- spec.md
|- plan.md
|- tasks.md
|- contracts/schemas.md
`- checklists/security.md

src/skills/dude-bundle-import/
|- SKILL.md
|- import.mjs
|- import.test.mjs
`- lib/
   |- import-frontmatter.mjs
   |- import-frontmatter.test.mjs
   |- directory-source.mjs
   |- directory-source.test.mjs
   |- directory-risk.mjs
   |- directory-risk.test.mjs
   |- directory-import.mjs
   `- directory-import.test.mjs

src/skills/dude-lint/
|- lint.mjs
`- lint.test.mjs

.github/skills/dude-lint/
`- lint.mjs  # generated by scripts/build-dev.mjs
```

No data model, service API, quickstart, UX artifact, generic test checklist, report schema, or provider artifact is needed. The schema contract and advisory security checklist are sufficient.

## Phases

### Phase 1: Bounded providers and entries

Implement local entries and manifest hashing, then GitHub commit/tree metadata and commit-pinned raw-byte verification. This phase is read-only.

### Phase 2: Ownership, outputs, and static evidence

Implement strict clean entrypoints, deterministic canonical coordinator-boundary validation for agents, nearest-root ownership, fixed outputs, exact skill-name-only transformation, broken-reference refusal, and deterministic scanning as separate test surfaces.

### Phase 3: Review merge and planning

First implement the compact analysis schema, blocking-diagnostic construction and validation, canonical hashing, complete-file batches, and canonical preview data. Then implement minimal review validation, decision aggregation, plan construction, destination/source revalidation, overlap checks, and the complete replacement set. Planning remains nonmutating and confirmation-free.

### Phase 4: Apply preflight, then mutation

Implement and independently prove nonmutating apply recomputation/preflight before staged writes, backups, rollback, and recovery reporting.

### Phase 5: CLI, compatibility, guidance, and projection

Expose exactly three directory commands, retain focused import, prove accepted canonical agents and blocked missing/malformed boundaries end to end, make Dude lint's shared agent/skill frontmatter boundary accept exact LF and CRLF while refusing bare CR and malformed delimiters, update guidance, regenerate dogfood, and prove development/release projection.

### Phase 6: Verification and independent review

Run focused and full gates, complete the advisory security checklist with evidence, and return implementation to independent Tester and Code Reviewer roles. Definition supplies neither approval nor execution evidence.

## Verification Strategy

Focused checks:

```text
node --test src/skills/dude-bundle-import/lib/directory-source.test.mjs
node --test src/skills/dude-bundle-import/lib/directory-risk.test.mjs
node --test src/skills/dude-bundle-import/lib/directory-import.test.mjs
node --test src/skills/dude-bundle-import/import.test.mjs src/skills/dude-bundle-import/lib/import-frontmatter.test.mjs
node --test src/skills/dude-lint/lint.test.mjs
```

Repository gate after implementation:

```text
node scripts/build-dev.mjs
node --test scripts/build-dev.test.mjs scripts/current-format-contract.test.mjs scripts/build-release.test.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node scripts/build-release.mjs --out <fresh-temporary-directory>
node <fresh-temporary-directory>/.github/skills/dude-lint/lint.mjs <fresh-temporary-directory>
git diff --check
```

Bare `node --test` is insufficient in this repository. Fresh executable evidence and independent re-review are required before completion or approval.




# Implementation Plan: Remove Legacy Compatibility

## Summary

The original 23 canonical tasks remain completed units with their recorded verification, review, reconciliation, and terminal-history evidence unchanged. A fresh independent implementation review rejected overall acceptance after reproducing eight fail-closed contract gaps despite the prior 708/708 tests, lint 0/0, and compose 15/15 results. This re-definition re-scopes the sequential repair chain to the project's stated locally-controlled-workspace threat model: it keeps every genuine correctness and security fix but drops defenses that exceed that boundary (hostile Git-hook containment, dirty/untracked byte restoration, hard-link/inode aliasing in upgrade apply, the two-stage removal-plan and confirmation token, post-descriptor race re-verification, and the mandatory atomic-paired task-state transaction). The consolidated chain is T029, T030, T032-T042; redundant open T031 is dropped and no completed unit is reopened or demoted.

Repair order is contract-sensitive. First repair every counted guidance source and non-audit runtime, regenerate `.github`, and run focused plus full gates. Next canonicalize installed agents and replace only `post-reduction.json` with the still-current accepted prompt-audit runtime, strictly comparing post-deletion to post-reduction and updating only that report's hash, measurements, and human summary. Only then remove authoring through the inventory- and hash-verified compose removal, harden the prompt-audit runtime and tests, reinstall authoring through compose, and prove the hardened comparator accepts both historical comparisons and all three exact documented report hashes. Finish with a pristine release/repository gate, a fresh six-scenario read-only host matrix, and independent Tester and Code Reviewer acceptance.

## Technical Context

**Language/Version**: Node.js ECMAScript modules with `// @ts-check`, Node >= 20; Markdown agents, instructions, skills, documentation, and project guidance  
**Primary Dependencies**: Node.js standard library only for shipped tooling; optional token counts come from externally produced JSON data pinned by its own SHA-256, never executable adapter code  
**Storage**: Authoritative core and pack source, generated dogfood, installed pack inventory, project-owned guidance, `docs/context-footprint.md`, and exactly `docs/context-footprint-snapshots/{baseline,post-deletion,post-reduction}.json`; audit output itself remains non-mutating JSON written to stdout  
**Testing**: `node:test` from a non-installable authoring test directory, exact JSON-schema and arithmetic fixtures, root/ancestor/input drift fixtures, compose-normalization parity fixtures, source/generated checks, installed inventory verification, current-contract tests, manual or reproducible-host dogfood scenarios, Dude lint, compose verification, and fresh release inspection  
**Target Platform**: Dependency-free maintainer CLIs on supported Node platforms, with final-component no-follow protection where available and an explicit locally controlled workspace precondition  
**Project Type**: Dependency-free reusable agent bundle with file-backed workflow CLIs, optional packs, generated dogfood, and staged core releases  
**Performance Goals**: Static inventory and owner resolution remain linear in managed content plus deterministic sorting by inventory size; no network or background work is added to the new readers  
**Constraints**: The audit never executes tokenizer code or writes evidence files; baseline follows prerequisite binding, inventory/source reconciliation, path hardening, parity proof, and a compose-aware authoring refresh only if runtime bytes differ from installed inventory; persisted pack source identity governs source verification; consumers precede provider deletion; every task closes green; generated core precedes installed-layout tests; project history is immutable; no runtime prompt-membership or runtime-token claim without host capture

## Spec Quality Validation

- All five stories are independently testable and use observable acceptance scenarios.
- The specification names the measurement as a static source-footprint proxy and separates runtime claims from static counts.
- Requirements cover data-only tokenizer results, durable evidence, exact report consistency, honest path limits, compose-compatible parity, non-shipped tests, CLI usage rejection, project guidance, scenario evidence, resolver behavior, and independently green deletion slices without prescribing repository commands.
- Success criteria are measurable and technology-agnostic.
- No unresolved clarification markers remain.

Result: passed before this revised technical plan.

## Guardrail Check

- `spec.md` remains technology-agnostic; implementation mechanics stay here, in research, and in tasks.
- No implementation, Beads import, or live task-state mutation occurs during definition.
- Core source, pack source, generated dogfood, and project state retain their existing ownership boundaries.
- The coordinator, not an implementation specialist, owns future project-skill and memory reconciliation.
- Existing optional disciplines remain optional, and no second execution ledger is introduced.

No guardrail is violated. Re-check after design: the audit and resolver are read-only, current writers retain their guards, historical project state is not rewritten, and every destructive source edit has a green checkpoint.

## Architecture

### 1. Static proxy, trust boundaries, and durable evidence

Keep the installable authoring skill limited to `SKILL.md` and `prompt-audit.mjs`. Place its source-layout and installed-layout suite at `library/packs/authoring/tests/dude-pack-authoring-prompt-audit.test.mjs`, outside every provided artifact directory. Keep repository-specific profile selection in `scripts/prompt-audit.mjs` and `scripts/prompt-audit-profiles.json`. The generic audit validates and reads inputs, computes hashes and static counts, validates optional tokenizer-result data, validates compose parity, and compares reports; it never writes a snapshot or any other state. Callers create or replace the owning checkpoint file by redirecting stdout.

The only machine-readable evidence store is:

```text
docs/context-footprint-snapshots/
├── baseline.json       # immutable after T015
├── post-deletion.json  # immutable after T006
└── post-reduction.json # T009 evidence; one repair recapture by T039
```

`baseline.json` and `post-deletion.json` are immutable historical reports throughout repair. T039 alone may replace `post-reduction.json`, after every counted guidance and non-audit runtime repair is present and before any authoring prompt-audit runtime, authoring manifest, installed authoring inventory, or profile refresh. The accepted pre-hardening audit runtime produces that replacement. `docs/context-footprint.md` updates only the post-reduction hash, affected measurements, and corresponding explanatory rows. No second report store is created.

Treat the six release/source workflow profiles as source metrics, not host prompt captures. Keep project dogfood guidance separate from release/source totals. Generated core and installed packs are parity prerequisites rather than duplicate counted contributions. Freeze profile membership and order at the accepted baseline.

### 2. Data-only tokenizer result contract

Replace all adapter paths, imports, subprocesses, evaluation, and executable hooks with an optional JSON tokenizer-result manifest. The CLI accepts the pair `--tokenizer-results <results.json>` and `--tokenizer-results-sha256 <lowercase-sha256>` only on `audit`; both or neither are required. The audit reads the file through the same stable-read boundary and verifies its exact bytes against the supplied hash before parsing.

The exact manifest shape is:

- top level: `schema_version`, `kind`, `tokenizer`, `inputs` only;
- `schema_version`: `1`;
- `kind`: `prompt-audit-tokenizer-results`;
- `tokenizer`: exactly `name`, `version`, and `encoding`, each a non-empty trimmed string;
- `inputs`: a lexically path-sorted array with exactly `path`, `content_sha256`, and `tokens` per entry;
- `path`: one unique normalized workspace-relative path;
- `content_sha256`: one lowercase SHA-256 matching the audited input bytes;
- `tokens`: one non-negative safe integer.

Coverage must equal the distinct audited input paths across all release/source profiles and dogfood guidance, with no missing, duplicate, or extra record. The available tokenizer record is exactly `{status, results_sha256, identity_sha256, name, version, encoding}`: `results_sha256` pins that checkpoint's complete data file, while `identity_sha256` is the hash of the canonical `{name,version,encoding}` identity. The unavailable record is exactly `{status, reason}` with all input and total token fields `null`. Comparison requires the same availability and exact `identity_sha256`, name, version, and encoding; it does not require equal `results_sha256` because changed source content requires a newly pinned result file. The audit does not trust the token counts as runtime truth: they remain externally produced static-source proxy data.

### 3. Exact report and comparison contract

Canonical checkpoint files have exactly `ok`, `command`, and `report` at the envelope level, with `ok: true` and `command: audit`. Bare reports, failure envelopes, and unknown envelope fields are rejected by `compare`.

The report has exactly `schema_version`, `metric`, `claim_limits`, `profile_manifest`, `profile_order`, `prerequisites`, `tokenizer`, `profiles`, `aggregate`, and `dogfood_guidance`. Validation recursively requires these exact nested key sets:

- `claim_limits`: `describes`, `does_not_measure`; the description is fixed and the exclusion array is exactly actual host prompt membership, active runtime context, and runtime token use;
- `profile_manifest`: `path`, `sha256`;
- `prerequisites`: `status`, `core_source_generated`, `enabled_pack_source_installed`, `profile_source_packs`;
- `core_source_generated`: `status`, `checks`; each check is exactly `source`, `generated`, `sha256`;
- `enabled_pack_source_installed`: `status`, `profile_path`, `profile_sha256`, `enabled_packs`, `packs`; each pack is exactly `name`, `source_identity`, `inventory_digest`, `manifest_sha256`, `artifact_count`, `source_status`, `installed_status`, and `source_identity` is exactly `type`, `location`, `ref`;
- each `profile_source_packs` entry: `name`, `source_status`, `manifest_sha256`, `artifact_count`, `installed_parity`;
- each release/source and dogfood record: `name`, `kind`, `activation_assumption`, `definition_sha256`, `accepted`, `prerequisites`, `inputs`, `totals`;
- each record `prerequisites`: `enabled_pack_source_installed`, `core_source_generated`, `source_packs`; each `source_packs` entry is exactly `name`, `source`, `installed`;
- each input: `path`, `sha256`, `code_points`, `utf8_bytes`, `tokens`;
- each total and aggregate: `input_count`, `code_points`, `utf8_bytes`, `tokens`;
- tokenizer unavailable: exactly `status`, `reason`; tokenizer available: exactly `status`, `results_sha256`, `identity_sha256`, `name`, `version`, `encoding`.

All counts and sums must be non-negative safe integers. Definition hashes, member order, repeated-path observations, profile totals, release/source aggregate totals, and dogfood totals are recomputed. Available tokenizer status requires every input and total token count to be a safe integer; unavailable status requires every token field to be `null`. Aggregate prerequisite `pass` is valid only when every applicable child passes and every non-applicable child is explicitly classified. Comparison rejects profile identity/order drift, prerequisite inconsistency, tokenizer-result identity drift, and any unknown or malformed field. If a release/source or dogfood input keeps the same content SHA-256 across reports, its character, byte, and token counts must also remain unchanged. This invariant applies to dogfood as well as release profiles.

Comparison success output is exactly `{ok, command, comparison}` with `ok: true`, `command: compare`, and comparison keys `schema_version`, `metric`, `comparable`, `profile_manifest_sha256`, `tokenizer`, `profiles`, `aggregate`, and `dogfood_guidance`. Each profile/dogfood delta is exactly `name`, `before`, `current`, `delta`, `changed_inputs`; each total is the four-field total above and each delta is exactly `code_points`, `utf8_bytes`, `tokens`.

For each linked enabled/profiled pack, comparison derives manifest drift `M`, inventory-digest drift `I`, and containing profile-hash drift `P`. Valid states are `000`, `011`, and `111`; `001`, `010`, `100`, `101`, and `110` fail closed. Enforce `M => I` per pack and `any(I) => P` plus `P => any(I)` across enabled packs, without inferring `I => M`.

CLI parsing records every supplied option and rejects a second occurrence, including `--json` and help. `audit` accepts only `--root`, `--profiles`, `--tokenizer-results`, `--tokenizer-results-sha256`, and `--json`; `compare` accepts only `--baseline`, `--current`, and `--json`. Help is accepted once without command-only options. Unknown options, missing values, extra commands/positionals, partial tokenizer-result pairs, and any option from the other command return exit `1` with `E_USAGE`; data or contract failures return exit `2`.

### 4. Honest local path threat model

For every workspace root, resolved persisted-source root, ancestor, directory, and file, capture stable identity before use and verify it after the read and again before report acceptance. Reject lexical containment violations and any statically observed symbolic link. Open final files with read-only plus `O_NOFOLLOW` where Node exposes it, compare descriptor identity before/after the read, and re-walk root and ancestor identities after the read. A persistent root, ancestor, final-path, type, metadata, or content replacement observed during those checks fails with input drift.

This dependency-free cross-platform design detects observed hierarchy and input drift; it does not claim to eliminate a hostile transient swap between checks on every platform. Reports state the precondition that callers run the audit in a locally controlled workspace and resolved source tree without concurrent hostile mutation. Tests cover static links, containment, final-file drift, and detectable persistent root and ancestor replacement. They do not present those tests as proof of race-free semantics.

### 5. Compose-compatible pack parity

For each enabled pack, parse the current inventory exactly and resolve source from persisted `inventory.source`, never from the profile manifest's convenient catalog root when the identities differ. A `library` source resolves `<location>/<pack>`; a locally available `source` identity resolves `<location>/library/packs/<pack>`. An unavailable persisted source fails the audit rather than falling back to another catalog. Validate the source manifest against `manifest_sha256`, each raw source artifact tree against its own `source_sha256`, each installed artifact tree against its own `installed_sha256`, exact artifact/file sets, and the inventory digest using compose's path ordering and payload fields. Do not require `source_sha256 === installed_sha256`: fetched/source-origin installs may normalize line endings, trailing whitespace, and final newlines before installation.

The runtime keeps no source-layout-dependent import of compose. Its inventory digest and artifact-tree encoding must exactly match the canonical compose definitions, and the external test suite imports the canonical engine helper to cross-check representative inventories. Regression fixtures include local-library parity; a persisted `source` fixture with raw CRLF/trailing whitespace and compose-normalized installed bytes; different but separately correct source/installed hashes; unavailable persisted source; mismatched source identity, manifest, artifact, installed artifact, artifact set, and inventory digest. This avoids a brittle pack-to-source-layout dependency while making semantic parity executable rather than aspirational.

### 6. Accepted authoring-pack and baseline state

T015 is complete. The accepted state is baseline `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f`, profile `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7`, authoring inventory `f117da0bbfe3b12bd45d9deb79e6d1ddf68bd5b3ba8b41e55acdbda2d02215ea`, and byte-identical prompt-audit source/installed tree `e5924c44207dc4d9964f5a2e9330105246cec620654ce4b7d141734592071f22`. Phase 2 must not refresh, rewrite, or regenerate these artifacts. The compose transaction and recovery evidence remain historical evidence in research and the owner log.

### 7. Strict importer frontmatter and consumer-first compatibility deletion

Archive T020 after two failed classifier attempts. Its implementation bytes remain working-tree input, but T023-T025 are fresh open work and inherit no completion, blocker, or review state.

Use a strict import-private lexical validator in `src/skills/dude-bundle-import/lib/import-frontmatter.mjs`, with pure parse/strip operations and source spans rather than a general YAML parser. Frontmatter may be absent or use exact column-zero `---` delimiters. Present frontmatter allows blank/comment-only lines and requires every data-bearing top-level entry to start at column zero with an unquoted ASCII plain key immediately followed by `:`. Ordinary values are one-line plain or quoted scalars or scalar-only flow sequences; `tools` alone may additionally use a scalar-only block sequence or balanced multiline scalar-only flow sequence. Reject malformed delimiters, tabs, anchors, aliases, tags, merges, explicit keys, directives, block scalars, flow mappings, nested mappings, duplicate top-level keys, and every other indented data-bearing line. Mixed-indentation license candidates therefore cannot mean absence.

A present license is exactly one canonical `license: VALUE` using the documented positive scalar grammar, with the value captured and preserved exactly. Noncanonical or semantic license candidates reject. License is absent only after the complete frontmatter validates and no license candidate exists. `mechanicalFacts` parses once for name, description, tools, license, and stripping spans; `applyPlan` reparses current source before authorization. Do not add general YAML, SPDX validation, automatic rewriting, arbitrary nested metadata, transactionality, or a race-free hostile-filesystem claim.

Keep legacy engine exports and the migration provider temporarily available while consumers are removed in focused slices:

1. T023 freshly reviews current non-classifier importer authorization: source/destination binding, exact create/replace decisions, link-count and hard-link safety, structured dispositions, complete write-set preflight, containment/symlink safety, and CLI all-written-path reporting. It excludes frontmatter classification and related documentation claims.
2. T024 implements and tests the pure strict frontmatter parser and span rewriter after T023, avoiding overlapping importer test ownership.
3. T025 integrates the parser into importer facts, apply authorization, and stripping; adds agent and skill apply-level zero-write regressions; aligns skill guidance; regenerates dogfood; and runs the complete former T020 gates.
4. T021 closes exact current-profile metadata and unsafe-root traversal safety after T025.
5. T022 freshly reviews the already-present core routing, mutation-gate, diagnostic, writer, current-format, and staged-release cleanup formerly carried by T004.
6. T003 removes compose, upgrade, and build-dev maintenance consumers.
7. T011 reconciles current project guidance.
8. T005 removes optional-pack, documentation, remaining release, and public-reference consumers while extending the existing current-format contract.
9. T002 deletes providers only after those slices are green.

Each slice runs its source-focused checks. Any slice that changes core source regenerates `.github/` before generated or installed-layout lint, compose, pack, or dogfood checks. No task is allowed to defer a known red repository state to the next task.

The final deletion slice records the post-deletion proxy and scenario checkpoint only after focused tests, development generation, generated lint, and relevant installed parity pass.

### 8. Project-owned dogfood reconciliation

The project skill is not generated core, and the memory ledgers are coordinator-owned project state. During execution the coordinator updates current project guidance from deprecated aliases and migration instructions to canonical-only conventions, then appends superseding entries to the decisions ledger. Existing entries remain as history.

The stale-contract check treats the project skill and current memory ledgers as active project-owned surfaces. Prior ideas, prior specification packages, and all earlier Coordinator Log entries are exact historical evidence and are never rewritten or used as an active-contract allowlist precedent.

### 9. Canonical owner resolver boundary

Keep strict frontmatter and canonical path primitives in the engine library. Add direct library exports and make `feature.mjs` only a thin argument/JSON/exit-code adapter over them:

```text
inventoryDefinedFeatures({ root })
    -> { features: FeatureRecord[], diagnostics: Diagnostic[] }

resolveFeatureOwner({ root, specPath })
    -> { owner: FeatureRecord | null, diagnostics: Diagnostic[] }

FeatureRecord = { ideaPath, specPath }
Diagnostic = { code, severity, path, message }
severity = "error" | "warning"
```

Feature records sort by `specPath`, then `ideaPath`; diagnostics sort by `path`, then `code`, then `message`. Inventory reports all detectable diagnostics. Resolution returns an owner only when the global inventory has no error and exact equality yields one owner.

Lint imports the library and aggregates diagnostics. The optional Beads helper imports the shared core library API directly through the installed-layout relative path and fails closed on any error or absent owner. Neither consumer imports nor spawns the CLI. The allowed dependency points from the optional Beads pack to the core engine library; core never imports Beads, and any core-to-Beads back-edge or core/Beads cycle is forbidden.

The resolver never edits a ledger, allocates a feature, mutates task state, appends a log, infers from a slug or directory, routes work, or approves a decision. Prospective draft selection and coordinated initial definition remain with Spec Lead.

### 10. Wording reduction and evidence

Reduce always-loaded and common-workflow source wording only after deletion and resolver integration are green. Consolidate a rule under its real authority when that owner is guaranteed to load; otherwise retain the essential local rule.

The six baseline scenario observations are already complete in the current VS Code Copilot Dude subagent session: all 6 matched their expected classifications and no mutation was observed. T015 retains these as manual/current-session behavioral observations, separately from structural and CLI fixtures, when it closes the baseline package. No host prompt trace exists, so they support classification evidence only, not actual runtime prompt membership or token use.

At post-deletion and post-reduction, run the same research-owned scenario matrix. Compare observable classifications such as route, refuse, no-write, source-of-truth, and evidence-required; generated wording need not match byte-for-byte. Record intentional retired-input behavior changes separately from preserved semantics. A host trace is required only for actual runtime prompt-membership or runtime-token claims, not for manual behavioral classification.

Source-contract tests remain required. When reproducible host invocation is unavailable, automated evidence proves only structural contracts, and documented manual dogfood scenario evidence is required before any behavioral-preservation claim.

### 11. Repair rollout and reversibility

The historical implementation spine through T010 is complete and remains evidence; none of its 23 canonical units is reopened or rewritten. The repair spine is:

`T010 -> T029 -> T030 -> T032 -> T033 -> T034 -> T035 -> T036 -> T037 -> T038 -> T039 -> T040 -> T041 -> T042`.

Every implementation task begins with a regression that discriminates its accepted finding, then performs the smallest bounded fix and reruns that check. No task relies on a later task to repair a knowingly red focused checkpoint. Generated `.github` output is refreshed only from authoritative source. The inert `.github/dudestuff/bundle-manifest.md` tombstone remains uninspected and untouched.

T039 is the measurement barrier: authoring prompt-audit source, authoring pack manifest, installed authoring artifacts, profile inventory, `baseline.json`, and `post-deletion.json` remain unchanged through that task. T040 removes the inventory-matching authoring revision through the inventory- and hash-verified compose removal before editing authoring source, then installs the hardened revision normally. Failure recovery restores the captured source, profile, inventory, enabled set, and installed bytes through the same compose removal and add path.

### 12. Regression-first repair protocol

Coordinator reproductions are accepted evidence for scope, not completion. Each repair task first adds an isolated regression that fails for the reported reason and asserts the complete protected-byte or external-sentinel set. The implementation then makes that same regression pass. Cache/local/manifest/ref drift, incomplete inventory, symlink escape, semantic metadata duplicates, remote redirects, oversized responses, forged reports, unsupported issue statuses, and corrupt snapshots must all be tested as zero-mutation outcomes.

No repair scans retired state, broadens profile migration, adds a second workflow system, or performs unrelated cleanup. `[P]` is omitted because the repair chain shares generated `.github`, current-format contracts, profile state, or measurement evidence.

### 13. Plan-bound upgrade apply

Apply requires a clean working tree; there is no `--allow-dirty` override. Persist an exact versioned upgrade-plan envelope containing:

- plan kind/schema, ID, timestamps, source identity, requested ref, resolved ref/commit, `from_ref`, and `to_ref`;
- exact sorted Replace, Add, Remove, Advisory, and up-to-date buckets;
- a cache inventory containing every upstream-owned path, path type, and content SHA-256 plus the upstream manifest hash;
- expected local state for every mutation path as missing or exact regular-file identity and content hash;
- exact local bundle-manifest path, bytes hash, and parsed source/ref/installed values.

Apply validates the complete schema, cache root/manifest/inventory/bytes, source/ref identity, resolved concrete source commit, local manifest, and every expected local mutation state before creating a safety tag or branch. It rejects every pre-versioned plan format and refuses a local-path `latest` request, requiring an explicit branch or tag consistent with the shared release resolver's local literal behavior. It executes the persisted buckets directly and never calls `classifyPlan` to derive a replacement plan; `classifyPlan` stays planning-only. Any mismatch exits 40 before tag, branch, checkout, log, manifest, or content mutation. Git hooks are disabled only for the upgrade-owned checkout and commit commands. Metadata-only manifest transitions and collision-safe exclusive (`wx`) plan creation remain.

The apply contract does not attempt hostile-hook containment through commit, dirty-index preservation, hard-link or inode-alias refusal, or exact untracked-file restoration. On failure after mutation it relies on the safety tag and upgrade branch and does not promise byte-perfect recovery of arbitrary dirty or untracked state.

Remove the shipped `@dude migrate layout` recovery sentence from source and generated upgrade guidance. Current-format contract tests cover both copies and require current-engine reinstall/manual external recovery wording only.

### 14. Destructive compose removal

Retain historical profile parsing only for read-only status and diagnosis. Destructive removal authorizes deletion only from a complete current inventory with exact equality between `files` and inventory artifacts, exact installed-artifact hash verification, valid inventory digest and source/manifest evidence, and a stable profile hash. Bare destructive removal with no inventory, old-profile-only evidence, and incomplete inventories refuse before any artifact deletion or profile rewrite.

Removal keeps compose's existing transactional safety: it backs up all present artifacts and prior profile bytes before deletion, writes the next profile atomically, and restores both on any artifact or profile failure. Incomplete-inventory refusal, artifact-removal failure, and profile-write failure tests prove zero write or complete restoration. Internal compose verification uses the same inventory- and hash-verified removal boundary. No separate `plan-remove` stage, digest-bound removal-plan artifact, or `confirm-remove-pack` literal token is introduced; the existing coordinator preview plus this exact-hash verification and transactional restore are sufficient.

### 15. Agent normalization and canonicalizer containment

`normalizeAgentFrontmatter` normalizes exactly one well-formed host-injected `model:` key. Zero matching keys is a byte-identical no-op. Multiple matching keys, or a matching key combined with malformed, quoted, or otherwise semantic `model` metadata, is drift and must fail rather than stripping several lines.

The installed-agent canonicalizer rejects a symbolic-link workspace root, `.github`, `.github/agents`, target, or target ancestor. It inventories only direct regular `*.agent.md` targets, resolves and verifies containment, reads and computes the complete prospective write set, then revalidates every target before the first replacement. Symlink-root/category/target fixtures retain an external sentinel and prove no earlier target was rewritten.

### 16. Strict canonical owner metadata

The owner parser accepts one leading canonical frontmatter block with unquoted canonical keys `title`, `slug`, `status`, and `spec_path`; scalar values may be plain or one matched single/double-quoted scalar without escape or trailing semantic content. It diagnoses quoted or alternate key syntax, unsupported data-bearing top-level entries, semantic duplicates, malformed values, and duplicate keys.

`status` is exactly `draft` or `defined`. Draft requires an empty `spec_path`; defined requires one canonical existing `.dude/specs/<feature>/spec.md`. Inventory may retain valid records while aggregating diagnostics, but resolution returns no owner on any diagnostic. Lint reports the diagnostics and Beads stops before its inventory query, dry-run, or write.

### 17. Remote import and skill identity boundary

Local-path imports remain supported. Remote imports accept only:

- `https://github.com/<owner>/<repo>/blob/<ref>/<path>` rewritten once to raw form; and
- `https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>`.

Both forms reject credentials, fragments, non-default ports, empty owner/repository/ref/path segments, and every other scheme or host. The GitHub host allowlist itself blocks internal SSRF. Fetch disables HTTP redirects rather than following them, so any redirect response fails closed instead of being revalidated per hop. A fixed documented byte ceiling is enforced while streaming, before complete buffering, regardless of `Content-Length`.

A skill frontmatter name must be one canonical lowercase segment accepted by the local skill namespace grammar after removing one supported Dude prefix. `/`, `\`, dot segments, encoded separators, control characters, empty stems, and nested destinations reject before destination snapshots or writes. Network-policy, disabled-redirect, oversize, and name fixtures preserve destination sentinels.

### 18. Beads status completeness

For an exact-feature non-epic issue carrying a durable task key, status is mandatory and must map through the supported status table. `open`, the accepted in-progress spellings, `blocked`, `closed`, and `done` remain representable. Every other value, including `deferred`, `paused`, future values, and missing status, is reported with issue ID, key, and normalized status before map construction. Dry-run and write modes share this validation and leave `tasks.md` and its owner ledger unchanged.

### 19. Task-state schema and validated write

Introduce one shared exact task-state parser/serializer used by board and lint. Legitimate absence is represented separately from a present snapshot. A present snapshot must be an exact object whose keys are canonical `.dude/specs/<feature>/tasks.md` identities and whose values contain exactly `glyphs` and an ISO timestamp; glyph maps contain unique durable task keys and only ` `, `~`, `!`, or `x`. Unreadable, malformed, wrong-schema, unsafe, or symbolic-link-backed state is corruption and blocks mutation; legitimate absence does not.

Render, set, and apply-states compute the complete next task bytes and next full snapshot while preserving every unrelated feature entry, then write the validated snapshot. Tests cover malformed, unreadable, and wrong-schema corruption, legitimate absence, and cross-feature entry preservation on write. The mandatory atomic-paired task-file plus snapshot transaction, injected snapshot-replacement failure, and rollback-failure reporting are not required; a validated write that preserves other features' entries is sufficient.

### 20. Audit hardening after recapture

After T039 has recaptured post-reduction evidence with the accepted runtime, T040 adds only:

- `linkedInputChanged => inventoryChanged` for every enabled/profiled pack, complementing the existing manifest/inventory/profile implications.

Forged-report tests reject a changed counted input carried with stale linked inventory evidence. Consistent with FR-022's locally-controlled-workspace assumption, T040 does not add a post-final-descriptor path/type/hierarchy re-verification; the existing before/after identity checks in the read path remain the honest drift boundary. Before source edits, remove the installed authoring pack using its exact current inventory and the inventory- and hash-verified compose removal; after source tests pass, update the authoring manifest as required and reinstall through compose. Preserve `baseline.json`, `post-deletion.json`, and the T039 `post-reduction.json` bytes.

### 21. Final repair acceptance

The hardened comparator must accept baseline-to-post-deletion and post-deletion-to-post-reduction using the three stored historical reports. Their exact SHA-256 values must match `docs/context-footprint.md`; no report is regenerated after audit hardening. Final acceptance then runs focused and full tests, generated parity, lint, compose status/verify, a pristine release build and release lint, stale-contract checks, whitespace/unrelated-change checks, and a fresh six-scenario read-only host matrix. Independent Tester and Code Reviewer decisions are required; green automation alone is insufficient.

## Package Boundary

Keep one package. Deletion and reduction share one frozen proxy chain and one ordered behavioral evidence chain; the resolver is the sole bounded extraction needed between them. Consumer-first tasks and explicit checkpoints make each phase independently green with an explicit recovery boundary. Splitting now would duplicate baseline, profile, project-guidance, and scenario contracts without creating an independently executable outcome.

Implemented by this package:

- read-only static footprint proxy, data-only optional token results, strict comparison, and three durable caller-owned evidence reports;
- canonical-only compatibility deletion;
- one read-only canonical owner resolver;
- common-workflow wording reduction.

Deferred to later packages:

- workflow collector;
- idea-ledger editor/log appender;
- task reconciliation engine;
- definition allocation/owner-binding transaction;
- Beads mirror automation;
- roster advisory ranking.

Guardrail inference and independent review/approval remain judgment and are not scripting candidates.

## Project Structure

The implementation touches existing core, pack, scripts, docs, generated dogfood, and project-guidance ownership areas. The audit-specific structure is fixed as follows:

```text
library/packs/authoring/
├── pack.md
├── skills/dude-pack-authoring-prompt-audit/
│   ├── SKILL.md
│   └── prompt-audit.mjs
└── tests/dude-pack-authoring-prompt-audit.test.mjs
scripts/
├── prompt-audit.mjs
└── prompt-audit-profiles.json
docs/
├── context-footprint.md
└── context-footprint-snapshots/
    ├── baseline.json
    ├── post-deletion.json
    └── post-reduction.json
```

The installed `.github/skills/dude-pack-authoring-prompt-audit/` contains only `SKILL.md` and `prompt-audit.mjs`. The package also adds the current-format contract test and engine resolver library/CLI/tests already described. Research owns exact deletion/profile inventories and contract rationale; tasks own exact paths and commands.

No data model, service API, separate schema artifact, quickstart, checklist, or second execution board is needed. This definition package remains exactly `spec.md`, `plan.md`, `research.md`, and `tasks.md`.

## Phases

### Phase 1: Audit Closure and Durable Baseline (T016, T019, T018, T013-T015)

1. **T016 - distinct declared core roots**: require schema-v2 `core_source_root` and `core_generated_root` evidence to resolve to distinct roots; reject equality while preserving valid alternate manifest-declared roots and the established membership and evidence checks; finish with the focused suite green.
2. **T019 - linked drift truth table**: replace bidirectional manifest/inventory coupling with `M => I`, `any(I) => P`, and `P => any(I)` without `I => M`; cover every valid and invalid three-bit state plus multi-pack aggregation; finish with the focused suite green.
3. **T018 - profiled-but-uninstalled applicability**: accept coherent fresh source drift for a profiled but uninstalled pack by marking installed parity not applicable, while preserving profile/source identity, inventory coherence, applicability, and fail-closed evidence invariants; finish with the focused suite green.
4. **T013 - persisted source and installed inventory identity**: require every profile source pack to match the enabled pack's persisted source identity; derive installed artifacts from actual `.github/*/dude-pack-<name>-*` entries; reject extra, missing, or differently sourced entries; finish with the focused suite green.
5. **T014 - pre-canonicalization path rejection**: reject supplied static symbolic-link ancestors before canonicalization while retaining containment, no-follow, descriptor, and before/after identity checks; cover alias, root, and ancestor regressions; finish with the focused suite green.
6. **T015 - package and baseline closure**: refresh authoring through compose only if final runtime bytes differ from the installed inventory; run complete focused and repository suites, two unchanged audits and a strict comparison, replace and hash `baseline.json`, update the summary, and obtain independent Tester and Code Reviewer acceptance.

### Phase 2: Green Consumer Cleanup (T023-T025, T021-T022, T003, T011, T005)

Close importer authorization, strict frontmatter parsing, and parser integration first; then remove core, maintenance, project-guidance, optional-pack, documentation, test, and release consumers while transitional providers remain available.

### Phase 3: Final Provider Deletion and Checkpoint (T002, T006)

Delete only now-unused compatibility providers, regenerate dogfood, replace `post-deletion.json`, compare it strictly to `baseline.json`, and capture post-deletion scenario evidence.

### Phase 4: Canonical Resolver (T007)

Add direct library exports plus a thin CLI and integrate lint and Beads without a dependency cycle.

### Phase 5: Wording Reduction and Comparison (T008-T009)

Reduce source wording behind structural and dogfood gates, then replace `post-reduction.json` and run strict baseline/post-deletion/post-reduction comparisons.

### Phase 6: Repository and Release Verification (T010)

Run focused, complete, generated, installed, scenario, stale-contract, and fresh-release checks without claiming implementation during definition.

### Phase 7: Fail-closed Runtime And Guidance Repair (T029-T038)

Repair upgrade, compose, normalization, canonicalization, ownership, import, Beads, and task-state boundaries one regression-first task at a time. Regenerate `.github` and run the complete non-audit gate only after all counted guidance and non-audit runtime fixes are present.

### Phase 8: Accepted-runtime Post-reduction Recapture (T039)

Canonicalize installed agents, replace only `post-reduction.json` with the still-current accepted prompt-audit runtime, strictly compare post-deletion to post-reduction, and update only its hash, measurements, and corresponding summary text.

### Phase 9: Prompt-audit Hardening And Authoring Refresh (T040-T041)

Remove the inventory-matching authoring pack before source edits through the inventory- and hash-verified compose removal, harden the comparator's `linkedInputChanged => inventoryChanged` implication, reinstall authoring through compose, then validate both historical comparisons and all three exact report hashes without rewriting a report.

### Phase 10: Final Repair Acceptance (T042)

Run the pristine repository/release gate and fresh six-scenario read-only host matrix, then obtain independent Tester and Code Reviewer judgments.

## Verification Strategy

Each task names its focused executable check in `tasks.md`. The first failing check blocks that task; later tasks are not used to repair a knowingly red checkpoint. Audit tests exercise both source and installed layouts from `library/packs/authoring/tests/`, assert the installed artifact excludes `*.test.mjs`, and include adversarial exact-schema, arithmetic, tokenizer-result, path replacement, persisted-source, normalization, and duplicate/inapplicable-option probes.

Historical execution evidence shows the data-only tokenizer boundary, exact schema/arithmetic and CLI contracts, external test placement, snapshot/scenario handling, and compose-aware source/installed hashing are accepted regression obligations. T016, T019, T018, T013, T014, and T015 are independently complete. The canonical baseline is `cce7dc8c5ee66f884c74e5a10260b72b73e0227bc00fdc7f25b2b9d83ab9ce0f` and the installed profile is `b3d4e5d4ff319dbb2dab6c6f587e0db06abde1d62b0f92bf47312e681223b1f7`. T004's green implementation and Tester evidence remain historical because two Code Reviewer cycles rejected the combined task. T020 is archived after two failed classifier attempts; its implementation bytes are inputs to fresh work, not inherited acceptance. T023 is the sole ready task, followed by pure parser T024 and integration closure T025.

The final gate covers:

- exact-schema canonical baseline and both same-profile checkpoint comparisons, with all three report hashes matching `docs/context-footprint.md`;
- tokenizer unavailable semantics or one exact tokenizer-result identity with complete content-hash coverage, never executable code;
- root/ancestor/input drift detection under the documented locally controlled threat boundary;
- compose-compatible persisted-source and separately hashed source/installed parity, including normalized source-origin fixtures;
- duplicate and command-inapplicable CLI option rejection;
- source-layout and installed-layout audit tests from the non-installable test directory, with no installed test file;
- baseline, post-deletion, and post-reduction scenario evidence with claim scope recorded;
- focused tests and full repository test discovery;
- source/generated byte parity and installed-pack inventory parity;
- workspace lint and compose verification;
- stale active-contract classification including project guidance and excluding immutable history;
- fresh release build, release lint, and release-content exclusions;
- generated-file scope, unrelated dirty work, and whitespace hygiene.

Repair adds explicit zero-mutation probes for upgrade cache/local/manifest/ref drift on a clean working tree; compose incomplete-inventory, hash-mismatch, artifact, and profile-write failures with transactional restore; canonicalizer symlinks and duplicate model metadata; strict owner metadata; remote import policy, disabled-redirect, size, and name failures; forged audit linkage; unsupported Beads statuses; and corrupt task-state snapshots with cross-feature entry preservation. T039 must precede every authoring audit-runtime/profile change. T041 validates historical reports with the hardened runtime, and T042 repeats the complete release and behavioral gate under independent review.
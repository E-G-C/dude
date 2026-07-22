# Feature Specification: Guarded Directory Artifact Import

## Purpose

Allow a user to import one bounded local or public GitHub directory of Dude agents, skills, and their complete related subtree after a deterministic inventory, proportionate risk review, and exact confirmation. Directory import preserves the existing single-file importer, never silently omits a bounded file, and does not claim that static or language-model review proves safety.

## User Scenarios & Testing

### User Story 1 - Preview an entire bounded artifact subtree (Priority: P1)

A user can point Dude at a local directory or supported GitHub tree URL and receive one deterministic preview of the complete bounded subtree that would be considered for import.

**Why this priority**: Complete discovery and an honest inventory are prerequisites for both informed consent and safe multi-file installation.

**Independent Test**: Analyze representative local and GitHub directory sources containing skills, agents, scripts, examples, support files, licenses, unsupported files, and nested directories; verify that the same unchanged source produces the same ordered inventory and no writes.

**Acceptance Scenarios**:

1. **Given** a local directory within all configured bounds, **When** the user requests analysis, **Then** the preview lists every discovered entry under the selected root in stable path order, identifies its artifact role and proposed disposition, and writes nothing.
2. **Given** a canonical GitHub `tree/<ref>/<path>` URL within all configured bounds, **When** the user requests analysis, **Then** the preview identifies the repository, requested reference, resolved immutable source revision, selected subtree, and every discovered entry without traversing outside that subtree.
3. **Given** an unchanged source analyzed more than once, **When** the inventories are compared, **Then** their normalized paths, byte identities, artifact groupings, dispositions, and aggregate measurements are identical.
4. **Given** a source that exceeds any depth, entry-count, per-file-size, or total-byte bound, **When** analysis reaches that bound, **Then** analysis fails with the exceeded bound identified, produces no importable plan, and writes nothing.
5. **Given** a link, non-regular entry, path escape, duplicate normalized path, case-colliding path, malformed entrypoint, agent entrypoint with a missing, malformed, duplicated, or noncanonical coordinator-only boundary, ambiguous owner, or unowned regular file, **When** it is inventoried, **Then** analysis identifies the exact path, blocks planning, and gives narrower-root guidance when ownership is the problem.

### User Story 2 - Make a proportionate risk decision (Priority: P1)

A user receives file-specific evidence for deterministic and semantic risk findings, with a decision state that distinguishes blocked, warned, and clean imports.

**Why this priority**: Importing prompts and executable support files expands the trust boundary; risk findings must change what confirmation, if any, can authorize.

**Independent Test**: Analyze fixtures for every risk category in both clearly dangerous and plausibly benign forms, then verify the resulting evidence, severity, decision state, and available confirmation path.

**Acceptance Scenarios**:

1. **Given** clear high-risk evidence, **When** analysis completes, **Then** the import is hard-blocked, each finding names the affected file and evidence, and no confirmation can authorize apply.
2. **Given** suspicious or ambiguous evidence without a hard-blocking finding, **When** analysis completes, **Then** the import is warned, each finding names the affected file and concern, and normal confirmation is insufficient.
3. **Given** a warned final plan, **When** the user provides the distinct warned-import acknowledgement bound to that plan's SHA-256, **Then** apply may proceed only if every deterministic revalidation still passes.
4. **Given** optional language-model review, **When** a generated batch ID is reported as reviewed, **Then** it covers that exact complete batch tied to the analysis hash and may add information or warnings without erasing deterministic evidence.
5. **Given** a broad shell, network, evaluation, credential, elevation, persistence, obfuscation, or prompt-override indicator, **When** static scanning finds it, **Then** the evidence remains visible and Warns without context-based severity reduction.
6. **Given** a high-confidence destructive, exfiltration, concealed-execution, activated-persistence, or dangerous authority-override construct, **When** its required operands are tightly bound in one expression or command, **Then** it Blocks; mere same-file coincidence does not Block.
7. **Given** any generated batch ID absent from otherwise valid optional review input, **When** the final decision is computed, **Then** the exact batch paths remain visibly uncovered and the decision is at least Warned.

### User Story 3 - Apply exactly the reviewed artifact set (Priority: P1)

A user can install a clean or explicitly acknowledged warned import only when the source bytes, artifact grouping, destination decisions, and destination state still match the reviewed preview.

**Why this priority**: A safe preview is ineffective if apply can install different bytes, write different destinations, or leave an unreported partial installation.

**Independent Test**: Review a multi-file import, vary each bound source and destination fact before apply, and inject failures during installation; verify refusal or complete restoration and preservation of unrelated files.

**Acceptance Scenarios**:

1. **Given** a current non-blocked analysis and any valid optional review, **When** planning recomputes matching source and destination facts, **Then** it writes nothing and emits one final reviewed plan bound to the analysis, review coverage, findings, outputs, destination states, decision, and complete replacement set without requesting confirmation.
2. **Given** a final Clean or Warned plan, **When** the user has inspected it, **Then** apply accepts only `confirm-import` for Clean or `confirm-warned-import:<plan_sha256>` for Warned and validates that literal once before mutation preflight proceeds.
3. **Given** a hard-blocked import, **When** any confirmation or acknowledgement is supplied, **Then** apply remains unavailable and no destination is changed.
4. **Given** source content, inventory membership, resolved remote revision, grouping, destination mapping, collision decision, or destination state has changed since analysis, **When** apply is requested, **Then** apply refuses before the first installation write.
5. **Given** a failure while installing a reviewed multi-file set, **When** apply cannot complete, **Then** every destination is restored to its exact pre-apply state or the operation reports a recovery failure with the affected paths and does not claim success.
6. **Given** a local source or output that overlaps or aliases another prohibited location, or an existing destination with the same file identity as a source file, **When** planning or apply preflight runs, **Then** it refuses and identifies the conflict.
7. **Given** an accepted final plan, **When** apply preflight begins, **Then** it derives a safe disjoint transaction parent on the destination filesystem where feasible, rechecks transaction overlap, and refuses before mutation when none is safe.

### User Story 4 - Preserve focused import and the fixed provider boundary (Priority: P2)

A user can continue importing one supported file through the existing workflow, while directory import remains limited to local directories and canonical public GitHub trees through one fixed dispatcher.

**Why this priority**: Directory support must remain a bounded extension, not a regression or a generalized version-control framework.

**Independent Test**: Run existing single-file scenarios unchanged, then run equivalent local-directory and GitHub-tree fixtures through the fixed directory contract and compare their provider-independent inventory and decision outputs.

**Acceptance Scenarios**:

1. **Given** an existing supported single-file import, **When** it is analyzed and applied, **Then** its accepted source forms, preview, confirmation, naming, and safety behavior remain supported.
2. **Given** equivalent local and GitHub directory contents, **When** each is analyzed, **Then** provider-specific provenance differs but normalized inventory, ownership, findings, decision state, and destination planning are equivalent.
3. **Given** an unsupported host, repository URL shape, or arbitrary version-control source, **When** directory analysis is requested, **Then** it is rejected with the supported local-directory and canonical GitHub-tree forms identified.
4. **Given** documentation and installed bundle output, **When** the feature is delivered, **Then** source guidance and generated guidance describe the same bounds, risk states, confirmation rules, and compatibility behavior.
5. **Given** an accepted directory output whose agent or skill frontmatter uses exact LF or CRLF separators, **When** current Dude lint validates the installed output, **Then** it accepts both forms without line-ending normalization, while bare CR and malformed delimiter shapes remain invalid.

## Public Workflow

Directory import adds exactly three public commands:

```text
analyze-directory <source>
plan-directory --analysis <file> [--review <file>]
apply-directory <source> --plan <file> --confirm <literal>
```

It produces exactly two persisted machine artifacts:

1. **Directory Analysis**: deterministic source provenance, one canonical complete entry list, ownership, exact outputs, static findings, required sorted non-content blocking diagnostics, complete-file review batches, and `analysis_sha256`.
2. **Reviewed Directory Plan**: the validated analysis identity, minimal optional review coverage and advisory findings, final decision, sorted complete replacement set, apply-bound outputs, and `plan_sha256`.

The optional review file and confirmation literal are inputs, not generated workflow artifacts. Planning is read-only and emits the final reviewed plan without asking for consent. Apply emits ordinary command output and does not create a third report artifact.

Confirmation is exact:

- Clean: `confirm-import`
- Warned: `confirm-warned-import:<plan_sha256>`
- Blocked: no confirmation and no plan

`plan_sha256` is computed over canonical plan data with its own digest field omitted. The warned literal is rendered and validated as the fixed prefix plus that computed digest; it is not embedded in the hashed plan payload, so digest construction is non-circular. The final plan displays sorted `replace_paths` containing every output whose destination is an existing regular file. The applicable literal authorizes that complete list. V1 has no per-file selection or partial replacement; a user who does not accept the complete set cancels or selects a narrower source and analyzes again.

## Risk Categories And Decision States

Every finding has one of these category labels:

1. **Destructive action**: deletion, corruption, destructive replacement, or broad modification of user, project, or system data.
2. **Credential or sensitive-data access**: collection, reading, disclosure, or transmission of credentials, secrets, private files, tokens, or sensitive environment data.
3. **Network retrieval or exfiltration**: unexpected outbound communication, data upload, remote control, or downloading content for execution.
4. **Dynamic or unsafe execution**: shell, process, evaluation, interpreter, generated-code, or command behavior whose effect is not safely bounded by the artifact's declared purpose.
5. **Privilege escalation or boundary bypass**: attempts to elevate privileges, weaken protections, escape intended containment, or bypass authorization.
6. **Persistence or automatic activation**: startup hooks, scheduled execution, background services, hidden recurring behavior, or other persistence mechanisms.
7. **Obfuscation or evasion**: encoded, concealed, staged, self-modifying, or misleading behavior intended or likely to frustrate review.
8. **Prompt injection or authority override**: instructions that attempt to override higher-authority rules, suppress disclosure or confirmation, impersonate authority, manipulate reviewers, or induce unsafe tool use.

The eight categories are finding labels, not separate scanning subsystems. One small published static rule set scans bytes and strict text, retains file-specific evidence, and assigns every rule either a broad indicator that Warns or a tightly bound high-confidence construct that Blocks. Content Block requires operands joined in one expression or command, such as a destructive operation targeting root/home/workspace/device data; a credential source joined to an outbound sink; a downloaded or decoded payload immediately executed with concealment; persistence installation plus activation; or authority override plus warning suppression plus dangerous action or tool use. Mere same-file coincidence never Blocks. There is no Markdown, JavaScript, or other context parser and no context-based severity reduction.

The aggregate decision state is exact:

- **Blocked**: at least one tightly bound high-confidence dangerous content construct, mandatory source or ownership safety failure, unsafe output, or prohibited overlap exists. Apply is unavailable and there is no override.
- **Warned**: no block exists, but at least one broad static indicator, advisory warning, opaque regular file, over-budget text file, or generated batch absent from valid review coverage remains. Apply requires `confirm-warned-import:<plan_sha256>`.
- **Clean**: no block or warning remains and every generated complete-file batch is covered by valid optional review. Apply requires `confirm-import`.

The analysis static decision reconstructs from static findings and its required sorted blocking diagnostics. Each mandatory non-content block reason is represented by a stable code, one normalized principal path or null, sorted unique related paths, a user-readable message, and remediation or narrower-root guidance when user action is possible. Any such diagnostic forces Blocked, appears in the complete human preview, and prevents both planning and apply.

Risk review is evidence-based triage, not malware detection or a guarantee of safety. A lower-severity finding cannot reduce or cancel a higher-severity state.

## Whole-Subtree Ownership

- A valid skill or agent entrypoint defines an artifact root.
- With one artifact root, that root owns every regular descendant beneath it.
- With multiple roots, each regular file belongs to its unique nearest ancestor root.
- Only `LICENSE`, `LICENSE.*`, `NOTICE`, and `NOTICE.*` files at the selected source root may be shared across artifact roots.
- A regular file outside every root, equally near multiple roots, or under an ambiguous entrypoint root blocks analysis and identifies narrower source roots the user can select.
- Every bounded entry remains visible. There is no silent exclusion, inferred ownership from references, broad reference rewriting, or automatic content repair.

## Exact Output-Byte Policy

- Every support, example, script, license, notice, and agent entrypoint byte is preserved exactly, including line endings. A skill entrypoint is also preserved exactly except for one parsed scalar replacement described below.
- Every entrypoint MUST have present frontmatter accepted by the existing strict import parser with scalar `name` and `description`. A skill name MUST also be accepted by the current `normalizeSkillDir` contract.
- Every agent entrypoint MUST contain exactly one standalone top-level body paragraph whose complete logical-line text is the current team-expansion canonical block:

	```text
	**Coordinator-only artifacts:** do not edit `## Coordinator Log`, task-state glyphs in `tasks.md`, fenced regions (`<!-- dude:managed:* -->`, `<!-- dude:board:* -->`), or `status:` / `spec_path:` frontmatter. Report changes back to `@dude` instead.
	```

	The paragraph MUST be one unprefixed physical body line, outside fenced content, and bounded by blank body lines or a body edge. A heading-only mention, altered or split text, quote or list prefix, prose-wrapped occurrence, fenced example, or repeated occurrence is not canonical. A missing, malformed, duplicated, or noncanonical block MUST produce a file-specific non-content blocking diagnostic with guidance to use focused single-file import/adaptation or prepare a clean source. Directory import MUST NOT insert or rewrite this block.
- The only directory-v1 transformation is replacing a skill entrypoint's canonical frontmatter `name` scalar with its final `dude-local-*` destination directory name. The parser locates the exact scalar token; plain scalars remain plain, and single- or double-quoted scalars retain the same quote bytes. The normalized destination name needs no escaping, so the key, colon, spacing, comments, delimiters, line endings, and every body byte remain unchanged. That output records only `rewrite-skill-name`; every other output has an empty `transform_ids` list.
- Every accepted agent or skill output MUST also satisfy current Dude lint's narrow frontmatter checks with either exact LF or CRLF separators. Lint compatibility does not authorize an output rewrite or line-ending normalization; bare CR and noncanonical delimiter shapes remain invalid.
- An entrypoint containing `model`, `compatibility`, `tools`, `license`, or any other metadata that the focused importer classifies for stripping, remapping, license disposition, or user judgment Blocks with file-specific guidance to use focused single-file import or prepare a clean directory source. Directory import does not reproduce interactive adaptation.
- If fixed output mapping breaks a detected literal relative link or reference, analysis Blocks with the source path and reference evidence. It never rewrites the reference.
- Directory rules do not alter the focused single-file importer's transformations, judgment gates, or behavior.

## Edge Cases

- The local source is missing, is not a directory, is link-backed, changes during a bounded read, or is inside a planned output location.
- A GitHub URL contains credentials, a query, fragment, non-default port, encoded separator, empty or dot segment, unsupported host, private access requirement, or ambiguous slash-bearing reference.
- GitHub commit resolution moves, tree metadata is truncated or oversized, raw content redirects, or fetched bytes do not match both the tree Git blob identity and SHA-256.
- The subtree is empty or contains no valid agent or skill entrypoint.
- Multiple agent entrypoints share one root, nested roots claim the same file, or files above or between roots have no unique nearest owner.
- An agent entrypoint omits, alters, splits, fences, prefixes, prose-wraps, or duplicates the canonical coordinator-only boundary paragraph.
- A selected-root license or notice collides after sharing, an output collides after `dude-local-*` namespacing, or two paths differ only by destination case rules.
- A broad indicator appears in documentation, an example, a comment, or executable content; it remains a Warn because v1 performs no context parsing or severity reduction.
- A text file is larger than one 256 KiB semantic batch, a batch would exceed 16 complete files, review omits a generated batch ID, or a review references a stale analysis, unknown batch, duplicate batch, or invalid path.
- A destination is a directory, link, non-regular file, multi-link file, or alias of a source file; only missing and safe existing regular-file states are plannable.
- Source, destination, or transaction paths have lexical, canonical, case, ancestor/descendant, or file-identity overlap.
- Staging or backup fails before mutation, a destination write fails, rollback fails, or recovery material cannot be removed.
- Existing single-file import remains usable when directory import rejects a directory-specific source.

## Functional Requirements

- **FR-001**: V1 directory import MUST accept one local directory or canonical public GitHub `tree/<ref>/<path>` URL through a fixed two-provider dispatcher and MUST reject arbitrary hosts, authenticated or private repositories, and other source forms.
- **FR-002**: Directory import MUST expose exactly the three commands in Public Workflow and MUST produce exactly one analysis artifact and one reviewed plan artifact.
- **FR-003**: Analysis MUST consider the complete selected subtree and inventory every discovered entry in stable normalized path order without destination mutation.
- **FR-004**: V1 MUST enforce depth 12, 256 discovered entries, 128 regular files, 1 MiB per regular file, 4 MiB aggregate regular-file bytes, bounded metadata and raw responses, and a 30-second request timeout.
- **FR-005**: Discovery MUST reject path escape, duplicate normalized paths, case collisions, links, non-regular entries, observed source drift, and every limit violation before a plannable analysis exists.
- **FR-006**: GitHub acquisition MUST use the API only to resolve an immutable commit and bounded tree metadata, construct commit-pinned `raw.githubusercontent.com` URLs, refuse redirects and response-provided URLs, and verify Git blob SHA plus SHA-256 for every fetched file.
- **FR-007**: Analysis MUST identify valid skill and agent roots and assign every regular file by Whole-Subtree Ownership or block with file-specific narrower-root guidance.
- **FR-008**: Only selected-root license and notice files MAY be shared; every other regular file MUST have exactly one owner and none may be silently excluded.
- **FR-009**: Every planned agent and skill MUST map to a project-local `dude-local-*` destination and preserve every output byte exactly except that a skill entrypoint's parsed scalar `name` MUST be rewritten to the final destination directory name and record `rewrite-skill-name` as its sole transform; every other output MUST have empty `transform_ids`.
- **FR-010**: Every entrypoint MUST have strict present frontmatter with scalar `name` and `description`; skill names MUST satisfy the current `normalizeSkillDir` contract. Every agent entrypoint MUST also contain exactly one standalone canonical coordinator-only boundary paragraph as defined in Exact Output-Byte Policy; a missing, malformed, duplicated, or noncanonical block MUST produce a file-specific non-content blocking diagnostic with focused-import/adaptation or clean-source guidance. Adaptation-sensitive metadata MUST Block with focused-import or clean-source guidance, and directory import MUST NOT insert or rewrite agent boundary text, normalize line endings, infer ownership from references, broadly rewrite references or code, automatically repair content, silently merge directories, auto-rename collisions, or omit unsupported files.
- **FR-011**: In strict-text files, fixed output mapping MUST detect only inline Markdown or image destinations exactly `](./TOKEN)` or `](../TOKEN)` and exact single-quoted, double-quoted, or single-backtick tokens whose path starts `./` or `../`. `TOKEN` MUST be a nonempty POSIX relative path using `/`, with no whitespace, backslash, escape syntax, query `?`, fragment `#`, or recognized-form delimiter (`(`, `)`, `[`, `]`, single quote, double quote, or backtick). Paths with any extension, no extension, or a directory target are eligible. Reference-style Markdown, HTML, prose outside these forms, language parsing, and percent decoding MUST be excluded. Targets MUST be resolved lexically. Any detected reference broken by fixed mapping MUST Block with file-specific evidence; mappings and references MUST NOT be rewritten.
- **FR-012**: Deterministic static scanning MUST inspect every bounded regular file as bytes or strict text with one small published indicator set and retain path, rule, location, evidence, severity, category label, and explanation for every finding.
- **FR-013**: Only tightly bound high-confidence constructs with dangerous operands joined in one expression or command MAY hard-block for content risk; mere same-file coincidence and every broader shell, network, evaluation, credential, elevation, persistence, obfuscation, or prompt-override indicator MUST Warn. V1 MUST perform no Markdown, JavaScript, or other context parsing or context-based severity reduction.
- **FR-014**: Optional language-model review MUST use generated batches of at most 16 complete files and 256 KiB, tie every batch to the analysis digest, and never split or truncate a file.
- **FR-015**: Optional review input MUST contain only its schema identity, exact `analysis_sha256`, sorted unique `reviewed_batch_ids`, and advisory findings naming one reviewed batch ID and a valid path in that exact batch with category, `info` or `warn` severity, evidence, and explanation. A reviewed batch ID means its complete generated batch was reviewed.
- **FR-016**: Planning MUST reject malformed, stale, duplicate, partial, or unknown batch IDs and findings rather than normalize or invent coverage. Any generated batch ID absent from valid review input, any over-budget text, and any opaque file MUST force at least Warned; advisory review MUST NOT Block, authorize, normalize, erase, or downgrade deterministic findings.
- **FR-017**: Directory analysis MUST contain a required sorted blocking-diagnostic set for every mandatory non-content Block, including ownership, entrypoint frontmatter or coordinator-boundary, output or ancestor, collision, overlap, alias, and source/destination file-identity failures. Each diagnostic MUST contain exactly a stable non-empty code, one normalized source-relative or workspace-relative principal path or null, sorted unique normalized related paths, a concise non-empty message, and concise guidance that is empty only when no user action is possible. Missing or unknown fields, invalid paths, duplicate identities, unsorted or duplicate related paths, and references inconsistent with the analyzed facts MUST invalidate the analysis. The static decision MUST reconstruct from static findings and these diagnostics, any diagnostic MUST force Blocked and appear in the complete preview, and the final decision MUST be exactly Blocked, Warned, or Clean with confirmation behavior exactly as defined in Public Workflow.
- **FR-018**: A Blocked analysis MUST have no plan, force option, or override. Planning for a non-blocked analysis MUST be read-only, accept no confirmation, and emit the final reviewed plan.
- **FR-019**: Canonical analysis `outputs` MUST contain only unique records whose public destination state is `missing` or safe `regular-file`. Exact- or case-colliding, unsafe-ancestor or unsafe-destination, or otherwise illegal candidates MUST be omitted from `outputs` but retained through canonical `entries` and exact blocking diagnostics; these diagnostics MUST force Blocked and prevent planning and apply. The final plan MUST continue to show outputs sorted by destination with the complete sorted `replace_paths` set, and analysis MAY render the same replacement preview by deriving it from output states.
- **FR-020**: The applicable confirmation literal MUST authorize the complete displayed replacement set; V1 MUST NOT support selective file import, partial replacement, implicit overwrite, merge, or rename-on-collision.
- **FR-021**: Planning MUST reacquire and recompute source, ownership, scanner records, output bytes, destination states, replacement set, and source/output overlap checks before emitting one final reviewed plan without mutation.
- **FR-022**: Planning and apply MUST reject every local source/output overlap or alias and every source/destination regular-file identity overlap before mutation.
- **FR-023**: Apply MUST validate the plan digest and accept exactly once either `confirm-import` for Clean or the literal `confirm-warned-import:` plus the final `plan_sha256` for Warned, then recompute every deterministic source, output, and destination fact and refuse any mismatch before the first destination mutation.
- **FR-024**: Apply MUST derive, without relying on a persisted plan field, a safe disjoint transaction parent on the destination filesystem where feasible, recheck transaction/source/output overlap before mutation, and verify staged output and backups before destination mutation.
- **FR-025**: Apply MUST install only exact reviewed bytes and paths and provide verified rollback or an explicit recovery-failure result naming every uncertain path without claiming success.
- **FR-026**: Analysis, planning, and apply MUST NOT execute imported content, install packages or dependencies, activate hooks, perform transitive fetches, or claim sandboxing.
- **FR-027**: Existing single-file import MUST remain unchanged in accepted source forms, command behavior, preview, confirmation, naming, security checks, destination protection, and result semantics.
- **FR-028**: Guidance MUST state the exact sources, limits, ownership and byte-preservation rules, canonical coordinator-only agent boundary and no-rewrite policy, adaptation-sensitive metadata and broken-reference blocks, indicator boundary without context reduction, review coverage semantics, decisions, plan-bound literals, complete replacement behavior, overlap refusal, rollback boundary, and unchanged single-file workflow.
- **FR-029**: Every accepted agent or skill output with strict frontmatter using exact LF or CRLF separators MUST pass current Dude lint after output mapping and any `rewrite-skill-name` transform. Lint MUST use one consistent narrow agent/skill frontmatter boundary that accepts only literal `---` delimiters over LF or CRLF, rejects bare CR and malformed delimiter shapes, preserves existing skill-name equality and other lint behavior, and MUST NOT normalize output bytes or become a general YAML parser.

## Key Entities

- **Directory Source**: One selected local directory or canonical public GitHub tree subtree.
- **Inventory Entry**: One discovered directory, regular file, link, or non-regular path with normalized identity and disposition.
- **Artifact Root**: A valid skill or agent entrypoint root used for whole-subtree ownership.
- **Static Finding**: Published deterministic file evidence that contributes information, warning, or blocking severity.
- **Blocking Diagnostic**: One deterministic non-content reason that forces Blocked, with exact path references, explanation, and actionable guidance when possible.
- **Semantic Batch**: At most 16 complete text files and 256 KiB whose generated ID denotes its exact ordered contents under one analysis digest.
- **Directory Analysis**: The first and only deterministic generated artifact, bound by `analysis_sha256`.
- **Review Input**: Optional sorted complete-batch coverage IDs and advisory findings tied to one analysis; it is not a generated workflow artifact.
- **Reviewed Directory Plan**: The second and final generated artifact, bound by `plan_sha256` and sufficient for apply recomputation.
- **Destination State**: Per output, either missing or one safe existing regular file with its reviewed content hash.
- **Replacement Set**: The exact sorted paths whose reviewed state requires replacement.

## Assumptions

- The user wants the complete bounded subtree imported together and will select a narrower root rather than selectively omit files.
- The local workspace and source are locally controlled; identity and hash rechecks detect observed drift but do not claim race-free operation against a hostile concurrent filesystem actor.
- Canonical GitHub v1 URLs use a single URL-segment reference; slash-bearing references are rejected rather than guessed.
- Opaque regular files may be legitimate support files but remain Warned unless a stronger static signature Blocks.
- Directory import is for clean, already-portable artifact trees; an entrypoint needing focused-import adaptation is rejected rather than interactively normalized.
- Imported content remains inert during this workflow; later user invocation is outside import-time behavior.
- No new project-wide guardrail is required; the accepted reviewer cuts are feature requirements.

## Out Of Scope

- Arbitrary Git hosts or URLs, authenticated or private repositories, slash-bearing ref disambiguation, provider plugins, or a generalized VCS framework.
- Interactive selection, selective UI, partial subtree import, partial replacement, or inferred ownership from prose, code, or references.
- Markdown/JavaScript context parsers, language-wide parsers, AST frameworks, dynamic analysis, sandboxing, malware guarantees, or executing content for inspection.
- Code or reference rewriting, automatic repair, dependency resolution, package installation, transitive fetching, hook activation, or imported execution.
- Additional finalization or report artifacts, hidden review stores, directory identity graphs, or a separate apply artifact.
- Any change to the existing single-file importer.
- Implementation, test execution, task-state mutation, tracked import, or approval during definition.

## Success Criteria

- **SC-001**: Repeated unchanged local and GitHub fixtures produce identical provider-independent ordered entries, ownership, outputs, static findings, semantic batches, and analysis digests apart from documented source provenance.
- **SC-002**: Fixtures at and beyond every fixed depth, entry, file-count, per-file, aggregate-byte, response, and timeout boundary produce the documented result with zero destination writes.
- **SC-003**: Every discovered entry appears exactly once in accepted inventories, and every regular file is owned once or blocks; only selected-root license and notice files may appear in multiple groups.
- **SC-004**: Every published tightly bound hard construct Blocks, every broader indicator Warns without context reduction, mere same-file coincidence never Blocks, and all fixtures retain exact evidence.
- **SC-005**: Every valid reviewed batch ID covers exactly its generated complete batch; omitted IDs remain visibly derivable as uncovered, and any stale, malformed, unknown, duplicate, over-budget, opaque, or uncovered review condition prevents Clean.
- **SC-006**: Every mandatory non-content failure fixture produces the exact unique sorted diagnostic and a reconstructed Blocked static decision in the complete preview; planning requests no confirmation, Clean apply accepts only `confirm-import`, Warned apply accepts only `confirm-warned-import:<plan_sha256>`, and Blocked produces no plan.
- **SC-007**: Every output preserves exact source bytes except the sole `rewrite-skill-name` transform on skill entrypoints; every accepted agent contains exactly one canonical coordinator-only boundary paragraph, and accepted LF and CRLF agent/skill outputs pass current Dude lint after transformation. Missing, malformed, duplicated, or noncanonical agent boundaries Block with the exact agent path and focused-import/adaptation or clean-source guidance and no rewrite; malformed or bare-CR frontmatter remains refused; every adaptation-sensitive entrypoint Blocks. Strict-text fixtures detect all eligible extension, extensionless, and directory paths in the exact inline Markdown/image, single-quoted, double-quoted, and single-backtick forms, exclude reference-style Markdown, HTML, prose outside those forms, malformed delimiters or tokens, language parsing, and percent decoding, and Block every lexical fixed-mapping break with file evidence and no rewrite. Canonical analysis `outputs` contains only unique `missing` or safe `regular-file` candidates; every omitted illegal candidate remains represented by its canonical entry and exact blocking diagnostic, forces Blocked, and cannot reach plan or apply. Every plan contains destination-sorted outputs with `replace_paths` equal to all existing regular-file outputs.
- **SC-008**: Every tested source, output, and transaction containment, alias, file-identity, source-drift, destination-drift, and confirmation mismatch refuses before the first destination mutation.
- **SC-009**: Failure injection at each staged mutation and rollback point yields exact planned installation, verified restoration, or explicit recovery failure with every uncertain path and no false success.
- **SC-010**: The existing single-file importer regression suite remains unchanged in meaning, and source and generated guidance consistently describe the three commands, two artifacts, fixed limits, risk boundary, and compatibility cut line.

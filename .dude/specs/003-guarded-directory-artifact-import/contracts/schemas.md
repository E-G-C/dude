# Directory Import Schemas

This contract defines the exact v1 directory analysis, optional review input, and reviewed plan. These are the only persisted workflow records. The confirmation is a CLI literal, and apply emits ordinary command output rather than a third artifact. Implementations reject unknown fields, missing fields, duplicate records, unsafe integers, invalid enum values, noncanonical paths, and inconsistent hashes.

## Canonical Encoding And Digests

- JSON text is UTF-8.
- A canonical value sorts object keys lexically, preserves schema-defined array order, uses JSON scalar encoding, and contains no insignificant whitespace.
- Paths are normalized selected-root-relative or workspace-relative POSIX paths as identified by the field; absolute paths and `.` / `..` segments are invalid.
- SHA-256 values are 64 lowercase hexadecimal characters. Git commit and tree/blob identities use their separately named Git identity fields.
- Byte counts are non-negative safe integers.
- `manifest_sha256` is SHA-256 over the canonical `entries` array. `analysis_sha256` and `plan_sha256` are each SHA-256 over their canonical record with only that record's own digest field omitted.
- Nested digests remain present. A digest mismatch is an operation failure, not a warning.
- The apply confirmation is derived after plan hashing and is not serialized: Clean uses `confirm-import`; Warned uses literal prefix `confirm-warned-import:` plus `plan_sha256`. This keeps digest construction non-circular.

## Shared Enums

```text
provider = local-directory | github-tree
entry_type = directory | regular-file | symbolic-link | non-regular
content_class = none | text | opaque
artifact_kind = agent | skill
risk_category = destructive-action | credential-data-access | network-exfiltration |
                dynamic-unsafe-execution | privilege-boundary-bypass |
                persistence-automatic-activation | obfuscation-evasion |
                prompt-injection-authority-override
severity = info | warn | block
decision_state = clean | warned | blocked
```

## Source Provenance

`source` has exactly `provider`, `input`, and `identity`.

For `local-directory`, `identity` has exactly:

```json
{
  "root_path": "/absolute/canonical/path"
}
```

For `github-tree`, `identity` has exactly:

```json
{
  "owner": "owner",
  "repository": "repository",
  "requested_ref": "main",
  "resolved_commit": "40-lowercase-hex",
  "subtree": "path/under/repository",
  "tree_sha": "git-object-id"
}
```

`input` is the reviewed local input string or canonical GitHub tree URL. GitHub credentials, query, fragment, non-default port, encoded separators, and unaccepted authority spellings are rejected before serialization rather than stripped or normalized into authority. Internal filesystem identity used for drift and alias checks is not serialized. Provider provenance remains bound by analysis and plan digests.

## Versioned Constants

Schema version 1 fixes these source and transport limits; they are renderer and validator constants, not serialized fields:

```json
{
  "max_depth": 12,
  "max_entries": 256,
  "max_regular_files": 128,
  "max_file_bytes": 1048576,
  "max_total_bytes": 4194304,
  "max_metadata_requests": 16,
  "max_raw_requests": 128,
  "max_metadata_response_bytes": 1048576,
  "max_raw_response_bytes": 1048576,
  "max_metadata_total_bytes": 4194304,
  "max_raw_total_bytes": 4194304,
  "request_timeout_ms": 30000
}
```

Review batches are likewise fixed at no more than 16 complete strict-UTF-8 files and 262,144 decoded bytes. Version 1 accepts no caller override. The renderer always states that static and language-model review do not prove safety and that import does not execute content; these fixed claim limits are not serialized. A later constant change requires a schema revision or a deliberately compatible contract change with tests.

## Canonical Entries

An analysis has exactly one inventory representation, `entries`:

```json
[{
  "path": "skills/example/SKILL.md",
  "entry_type": "regular-file",
  "byte_count": 1234,
  "sha256": "lowercase-sha256-or-null",
  "content_class": "text"
}]
```

Entries sort lexically by normalized `path`. A regular file has its exact byte count, SHA-256, and `text` or `opaque` content class. Every non-file entry has `byte_count: 0`, `sha256: null`, and `content_class: none`. Directory, link, and non-regular entries remain present; no discovered entry may be omitted. Regular-file count, total bytes, ownership, entrypoint/content/license/notice role, installability, and finding associations all derive from entries, minimal groups, fixed ownership rules, findings, and blocking diagnostics, so they are not repeated. `manifest_sha256` appears beside `entries` in the analysis and hashes this complete array.

## Artifact Group And Output

An artifact group has exactly:

```json
{
  "kind": "skill",
  "entrypoint": "skills/example/SKILL.md"
}
```

Groups sort by `entrypoint`; entrypoints are unique. Group identity is the pair (`kind`, `entrypoint`), source root is the entrypoint's parent, members derive by unique nearest-ancestor ownership, shared notices derive from selected-root names, and destinations derive from kind plus fixed output rules. Those values are not serialized twice.

An output has exactly:

```json
{
  "source_path": "skills/example/SKILL.md",
  "destination_path": ".github/skills/dude-local-example/SKILL.md",
  "output_sha256": "lowercase-sha256",
  "transform_ids": ["rewrite-skill-name"],
  "destination_state": { "type": "missing" }
}
```

Outputs sort by `destination_path`; source paths are unique except a selected-root license or notice may produce one output per owning group. Source SHA-256 derives from `entries`; group, role, and byte count derive from groups, paths, source/output bytes, and fixed mapping. `transform_ids` is exactly `[]` for every output except a skill entrypoint, where it is exactly `["rewrite-skill-name"]`. `destination_state` is exactly one of:

Line-ending style is not a schema field and is never canonicalized. Exact accepted agent and skill output bytes using LF or CRLF frontmatter separators must pass current Dude lint after fixed mapping and, for a skill entrypoint, the required `rewrite-skill-name` transform. This is an integration invariant over `output_sha256`, not an added record field or permission to normalize output; bare CR and malformed delimiter shapes remain invalid.

Agent coordinator-boundary conformance is also an invariant over exact entrypoint bytes, not an output field or transform. An accepted agent contains exactly one standalone canonical paragraph from the current team-expansion template. Missing, malformed, duplicated, or structurally noncanonical blocks prevent planning and use the existing `blocking_diagnostics` container; analysis never inserts or rewrites the paragraph.

```json
{ "type": "missing" }
```

```json
{
  "type": "regular-file",
  "sha256": "lowercase-sha256"
}
```

Internal nonserialized `destination_facts` precede serialization. Canonical `outputs` contains only candidates that are exact- and case-unique and whose public destination state is `missing` or safe `regular-file`. Candidates with an exact collision, case collision, unsafe ancestor or destination, link, non-regular or multi-link destination, unplanned conflict, source/output identity alias, or any other illegal condition are omitted from `outputs`; their source remains in canonical `entries`, their exact reason and paths remain in blocking diagnostics, and their mapping and evidence remain in internal `destination_facts` for consistency checks. Any blocking diagnostic yields Blocked and no plan or apply. Illegal destination-state variants and placeholders are never serialized.

## Risk Finding

A finding has exactly:

```json
{
  "rule_id": "DIR-DYNAMIC-001",
  "path": "skills/example/scripts/check.mjs",
  "category": "dynamic-unsafe-execution",
  "severity": "warn",
  "line_start": 12,
  "line_end": 12,
  "evidence": "exec(command)",
  "explanation": "Executes a dynamically constructed command."
}
```

The `static_findings` container determines that these records are static; file SHA-256 derives from `entries`, and canonical tuple identity makes a synthetic `id` unnecessary. Line fields are both null for opaque or whole-file evidence. Static findings may be `info`, `warn`, or `block`. Evidence is never omitted. V1 records no parsed context and performs no context-based severity reduction. Finding tuples are unique and arrays sort by `path`, severity precedence (`block`, `warn`, `info`), `rule_id`, line positions with null last, `evidence`, then `explanation`.

## Blocking Diagnostic

A blocking diagnostic records one mandatory non-content reason that analysis cannot be planned or applied. It has exactly:

```json
{
  "code": "ownership-ambiguous",
  "path": "skills/example/support.mjs",
  "related_paths": ["skills/other/SKILL.md"],
  "message": "The file has more than one equally near artifact owner.",
  "guidance": "Select and analyze one narrower artifact root."
}
```

- `code` is a stable, non-empty deterministic code from the published versioned diagnostic set; the same condition produces the same code.
- `path` is one normalized source-relative or workspace-relative path when the condition has one principal path, and is otherwise `null`.
- `related_paths` contains the remaining normalized source-relative or workspace-relative paths needed to explain the condition. It is lexically sorted, unique, may be empty, and does not repeat `path`.
- `message` is a concise non-empty user-readable explanation.
- `guidance` is concise remediation or narrower-root guidance. It may be empty only when no user action can resolve the condition.

The diagnostic set represents every mandatory non-content Block, including ambiguous or unowned ownership, malformed or adaptation-sensitive entrypoints, missing/malformed/duplicated/noncanonical agent coordinator boundaries, broken literal relative references, unsafe outputs or ancestors, destination collisions, source/output overlap, path aliases, and source/destination regular-file identity overlap. Boundary failures use stable codes `agent-boundary-missing`, `agent-boundary-malformed`, `agent-boundary-duplicated`, or `agent-boundary-noncanonical`, set `path` to the agent entrypoint, and provide focused single-file import/adaptation or clean-source guidance; they add no fields. A diagnostic identity is the tuple (`code`, `path`, `related_paths`); identities are unique even when messages differ. Diagnostics sort lexically by `code`, then by `path` with `null` last, then lexicographically by the complete `related_paths` array, then by `message`.

Every source-relative reference must resolve to the bound source, entries, or ownership facts, and every workspace-relative reference must resolve to the output, ancestor, or destination fact named by the code. Overlap, alias, collision, and file-identity codes must reference the paths that participated in that deterministic check. Unknown or missing fields, invalid or noncanonical paths, a path repeated in `related_paths`, unsorted or duplicate related paths, duplicate diagnostic identities, empty required strings, actionable empty guidance, and references inconsistent with the code or bound analysis reject the analysis record.

## Review Batches And Optional Review Input

An analysis `review_batches` item has exactly:

```json
{
  "batch_id": "batch-001",
  "files": [
    {
      "path": "skills/example/SKILL.md",
      "content": "complete decoded file content"
    }
  ]
}
```

Batches and files follow entry order. Each batch contains at most 16 complete text files and 262,144 decoded UTF-8 bytes. A file is never split or truncated. File hashes and byte counts derive by matching `path` and exact `content` to `entries`; batch byte count derives from its complete contents. Batch IDs are unique stable ordinals within the analysis, and each ID means the exact full generated batch bound by `analysis_sha256`. Text files too large for one batch and opaque files remain derivably uncovered by comparing entries with batch paths, so no separate `unreviewable_text` array is required.

The optional review input has exactly:

```json
{
  "schema_version": 1,
  "kind": "dude-directory-review",
  "analysis_sha256": "lowercase-sha256",
  "reviewed_batch_ids": ["batch-001"],
  "findings": [{
    "batch_id": "batch-001",
    "path": "skills/example/SKILL.md",
    "category": "prompt-injection-authority-override",
    "severity": "warn",
    "evidence": "Ignore prior safeguards",
    "explanation": "The entrypoint asks a later agent to disregard authority."
  }]
}
```

`reviewed_batch_ids` is lexically sorted and unique and may cover any subset of generated batches. A listed ID claims review of that exact full generated batch, so no file/hash list or status row repeats it. Each finding references one listed batch ID and a path in that batch, uses a valid category and `info` or `warn`, and has non-empty evidence and explanation. Finding tuples are unique and sort by `batch_id`, `path`, severity precedence (`warn`, `info`), category, evidence, then explanation.

Unknown fields, stale analysis hashes, unsorted, duplicate, or unknown batch IDs, findings for an uncovered batch or invalid path, invalid categories or severities, duplicate findings, and empty evidence or explanations reject the complete review input. They are not normalized into coverage. Missing batch IDs, over-budget text, and opaque files force at least Warned. Review findings cannot Block, authorize, normalize a plan, erase static evidence, or reduce static severity.

## Directory Analysis

`analyze-directory` emits one analysis with exactly:

```json
{
  "schema_version": 1,
  "kind": "dude-directory-import-analysis",
  "source": {},
  "entries": [],
  "manifest_sha256": "lowercase-sha256",
  "groups": [],
  "outputs": [],
  "static_findings": [],
  "blocking_diagnostics": [],
  "static_decision": "warned",
  "review_batches": [],
  "analysis_sha256": "lowercase-sha256"
}
```

`entries`, `groups`, `outputs`, `static_findings`, `blocking_diagnostics`, and `review_batches` follow their canonical order above. `blocking_diagnostics` is required and follows Blocking Diagnostic exactly. The renderer derives fixed limits and safety claims from schema version, derives ownership and roles from entries/groups, derives uncovered paths by comparing text/opaque entries with batch files, and may preview replacement paths from output destination states. Analysis and every batch content can contain sensitive source material and must be handled accordingly.

`static_decision` reconstructs only from `static_findings` and `blocking_diagnostics`: it is `blocked` when any static finding has `block` severity or any blocking diagnostic exists, `warned` when no Block exists and at least one static finding has `warn` severity, and `clean` otherwise. Every blocking diagnostic appears in the complete human preview. A Blocked analysis cannot produce a plan or reach apply. The analysis is the first persisted artifact and is also the complete human-preview source.

## Reviewed Directory Plan

`plan-directory` emits one plan with exactly:

```json
{
  "schema_version": 1,
  "kind": "dude-directory-import-plan",
  "analysis_sha256": "lowercase-sha256",
  "source": {},
  "manifest_sha256": "lowercase-sha256",
  "groups": [],
  "outputs": [],
  "static_findings": [],
  "reviewed_batch_ids": ["batch-001"],
  "advisory_findings": [],
  "decision": "warned",
  "replace_paths": [],
  "plan_sha256": "lowercase-sha256"
}
```

`source`, `manifest_sha256`, minimal `groups`, exact `outputs`, and `static_findings` are copied only where apply requires a self-contained expected value for deterministic recomputation; they must equal the recomputed analysis facts used during planning. `reviewed_batch_ids` and `advisory_findings` are the validated review values without repeated file lists or failure rows; each advisory finding retains the exact optional-review finding shape defined above. `decision` is the deterministic aggregate of static facts, advisory findings, complete-batch coverage, over-budget text, and opaque files during planning. A review record cannot alter a static record.

`replace_paths` is the exact sorted set of outputs whose `destination_state` is `regular-file`; no duplicate analysis-level array is persisted. The applicable apply literal authorizes this complete set. The plan does not persist fixed limits, entries already bound by `manifest_sha256`, blocking diagnostics that must be empty for any plan, review batch contents already bound by `analysis_sha256`, uncovered paths derivable during planning, a transaction parent, or a required confirmation.

Confirmation is a CLI input, not a JSON record:

- Clean accepts only `confirm-import`.
- Warned accepts only the literal concatenation `confirm-warned-import:` plus the plan's 64-character `plan_sha256`.
- Blocked accepts nothing and emits no plan.

`plan_sha256` hashes the canonical plan with only its own field omitted. The renderer derives the required literal only after this digest exists and never inserts that literal into the hashed payload. Apply derives and compares the exact literal once before deterministic preflight. There is no per-path choice, acknowledgement array, replace-all alias, force, override, report digest, or additional confirmation artifact. Planning reacquires and recomputes every deterministic fact before emitting the final plan and performs no mutation. Apply derives a safe disjoint transaction parent and rechecks its overlap before creating transaction material.

## Apply Command Output

Apply emits ordinary command output in this shape; it is not a persisted workflow artifact:

```json
{
  "schema_version": 1,
  "kind": "dude-directory-import-result",
  "status": "installed",
  "plan_sha256": "lowercase-sha256",
  "written_paths": [],
  "restored_paths": [],
  "unchanged_paths": [],
  "uncertain_paths": [],
  "recovery_directory": null,
  "message": ""
}
```

`status` is one of:

- `installed`: `written_paths` is the complete output set and all recovery arrays are empty.
- `rolled-back`: installation failed, every touched destination matches its pre-apply snapshot, `written_paths` and `uncertain_paths` are empty, and restored/unchanged paths account for the transaction.
- `recovery-failed`: installation and complete restoration did not succeed; `uncertain_paths` is non-empty and `recovery_directory` identifies preserved recovery material.

All path arrays are unique and lexically sorted. Only `installed` is success. Refusal before mutation is an operation error and does not emit an installed result.

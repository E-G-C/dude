---
name: dude-pack-technical-docs-evidence-ledger
description: "Use when a technical-docs pipeline step needs the shared evidence-ledger data contracts: the ledger.jsonl entry schema and stable chunk-prefixed ids, the type taxonomy, the source-kind and source-ref provenance that records where each entry came from across repository, document, transcript, notes, and draft sources, the outline.md coverage contract, or the consumed.jsonl manifest. Load it before the extractor, planner, drafter, or coverage step reads or writes these schemas."
---

# Evidence Ledger — Intermediate Representation

The **evidence ledger** is the durable, compact memory that lets the pipeline process sources larger than the context window and prove that no detail was lost. Every traceable item in a source becomes one atomic ledger entry. Once a work unit is distilled into a result, its raw text is no longer needed.

Five data contracts are defined here: the per-unit extraction result, the result index, `ledger.jsonl`, the Outline, and `consumed.jsonl`. They are the single source of truth for the extractor, planner, drafter, and gates. Source identity, unit manifests, and the `C*` / `E*` / `R*` prefixes are owned by `dude-pack-technical-docs-source-intake`.

Common rules:

- Every structured artifact carries `schemaVersion: 2`. An unversioned artifact is rejected, not normalized.
- JSON uses UTF-8, fixed field order, two-space indentation, LF endings, and one terminal newline.
- JSONL is one compact JSON object per nonblank line. A scalar, an array, a bare id, a comment, a blank required file, an unknown field, and a malformed line are all invalid.
- Hashes are lowercase SHA-256 over exact file bytes.
- Persisted paths are normalized workspace-relative POSIX paths.
- Duplicate source, unit, evidence, decision, action, or consumed identities fail before authorization.

## 1. Extraction result — produced by the extractor

The extractor writes exactly one result per expected work unit, at the exact conventional path `<workdir>/results/<UnitId>.json`. The filename is derived from the unit id; it is never chosen freely.

```json
{
  "schemaVersion": 2,
  "unitId": "C012",
  "sourceId": "S001",
  "unitDigest": "<sha256 of the unit as recorded in its manifest>",
  "status": "evidence",
  "examined": [
    { "sourceRef": "notes/kickoff.txt#L120-L164", "sha256": "<digest>" }
  ],
  "fragment": {
    "path": "parts/C012.jsonl",
    "bytes": 2481,
    "sha256": "<digest>",
    "entryCount": 9
  }
}
```

| Field | Required | Description |
|---|---|---|
| `unitId` | Yes | The one unit this result describes. |
| `sourceId` | Yes | The Source that unit belongs to. |
| `unitDigest` | Yes | The unit digest recorded in the unit manifest. |
| `status` | Yes | `evidence` or `no-documentable-evidence`. |
| `examined` | Yes | Nonempty `{sourceRef, sha256}` list that must cover the unit's members **exactly** — no missing member, no extra, no duplicate. |
| `fragment` | evidence only | `{path, bytes, sha256, entryCount}` with `entryCount > 0`. The path is declared here and is never inferred from a filename convention. |
| `reason` | no-evidence only | Nonempty explanation. A no-evidence result must not declare a fragment. |

`no-documentable-evidence` is a legitimate outcome for a unit that genuinely carries nothing documentable, such as a lockfile slice. Never invent an entry to avoid it, and never omit the result for a unit.

The fragment file itself is JSONL evidence records (section 3) in canonical evidence-id order.

## 2. Result index (`results.json`) — produced by `merge-ledger.mjs --mode index`

The index is script-authored. Nothing else writes it, and merge consumes nothing else.

```json
{
  "schemaVersion": 2,
  "sourceRegistry": { "path": "sources.json", "bytes": 1842, "sha256": "<digest>" },
  "unitManifests": [
    { "sourceId": "S001", "path": "units/chunks.json", "bytes": 9214, "sha256": "<digest>" }
  ],
  "results": [
    { "unitId": "C001", "sourceId": "S001", "sourceKind": "transcript", "path": "results/C001.json", "bytes": 612, "sha256": "<digest>" }
  ]
}
```

- `unitManifests` holds exactly one complete manifest per registered Source, in Source Registry order.
- `results` holds exactly one validated result per expected unit, ordered by prefix rank `C`, `E`, `R`, then numeric ordinal.
- Every path is relative to the directory containing `results.json` and must resolve to a contained, non-symlink regular file.
- Index mode validates each result's expected unit, source, source kind, unit digest, schema, bytes, and digest, plus every evidence fragment's containment, bytes, digest, record count, schema, and canonical order.
- The results directory must contain exactly the expected per-unit files. Missing, duplicate, unexpected, stale, aliased, malformed, or changed files fail.
- Merge mode verifies each indexed result and fragment again and never enumerates a directory, expands a glob, or rereads a unit manifest.

## 3. Ledger (`ledger.jsonl`) — produced by `merge-ledger.mjs --mode merge`

One JSON object per line, ordered by index unit order and then numeric `F` ordinal. Fields, in this exact order:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | `<unitId>-F<NNN>`, with a three-digit positive ordinal local to the unit (e.g. `C012-F003`, `R004-F001`). Never reuse or renumber an id. |
| `text` | Yes | Exactly one atomic item. Paraphrase for clarity, but keep it strictly traceable and self-contained. |
| `type` | Yes | One of the type taxonomy values below. |
| `tag` | Yes | Short lowercase kebab-case theme slug used to group entries into sections (e.g. `profile-section`, `auth`). |
| `source-id` | Yes | The `S*` id of the Source the entry came from. Must match the unit's Source. |
| `source-kind` | Yes | `transcript`, `notes`, `draft`, `document`, or `repo`. Must match the Source's kind. |
| `source-chunk` | Yes | The `C*` / `E*` / `R*` unit id this entry came from. |
| `source-ref` | Yes | A validated locator ending in `#L<start>-L<end>`. Its prefix must equal one of the unit's own locator prefixes and its line span must fall inside that locator. No entry may omit it. |
| `importance` | No | `high`, `medium`, or `low`. Omitted means `medium`. |
| `refs` | No | Unique array of other evidence ids. An entry may not reference itself or repeat a reference. |

### Locator forms

| Source kind | `source-ref` form |
|---|---|
| `transcript`, `notes`, `draft` | `<source.ref>#L<start>-L<end>` |
| `document` | `<source.ref>:<Heading > Path>#L<start>-L<end>` |
| `repo` | `<repo ref>:<path>#L<start>-L<end>` |

### Type taxonomy

- **fact** — A descriptive statement about the system, feature, or process.
- **decision** — A choice that was made, with rationale if stated.
- **action** — A task, next step, assignment, or owner-bound item.
- **parameter** — A concrete value, setting, threshold, name, or configuration detail.
- **example** — A code snippet, payload, runnable command, or worked example.
- **constraint** — A rule, limit, requirement, or precondition.
- **behavior** — What the system does at runtime: an observable effect, response, or state change.
- **interface** — A public or exported surface: a symbol, endpoint, CLI command, flag, or config key.
- **schema** — A data shape or model: a type, record, table, payload, or message format.
- **open-question** — An unresolved point. Put the gap in `text` as `[NEEDS CLARIFICATION: ...]`.

### Atomicity and traceability rules

- One idea per entry. Split compound statements into separate entries.
- Every entry must be supported by its own unit. Apply `dude-pack-technical-docs-traceability`: zero fabrication. If a detail is uncertain or missing, record it as an `open-question` with a `[NEEDS CLARIFICATION: ...]` marker rather than inventing it.
- Extraction is unit-local. Repeated mentions of the same point across units each get their own entry; consolidation happens later, at the planner's reduce step.
- `C*` ids come from new prose material, `E*` ids from the existing document in update mode, and `R*` ids from repository evidence. One ledger holds any mix, and coverage spans the union.

### Example

```jsonl
{"id":"C001-F001","text":"The onboarding portal has three areas: profile, tasks, and settings.","type":"fact","tag":"portal-overview","source-id":"S001","source-kind":"transcript","source-chunk":"C001","source-ref":"sources/kickoff.vtt#L14-L21","importance":"high"}
{"id":"C002-F001","text":"Notification frequency can be immediate, daily digest, or weekly summary.","type":"parameter","tag":"notifications","source-id":"S001","source-kind":"transcript","source-chunk":"C002","source-ref":"sources/kickoff.vtt#L188-L194","importance":"high"}
{"id":"E004-F002","text":"Retries use exponential backoff with a ceiling of five attempts.","type":"behavior","tag":"retries","source-id":"S004","source-kind":"document","source-chunk":"E004","source-ref":"docs/platform.md:Configuration > Retries#L212-L219"}
{"id":"R004-F001","text":"createSession issues a signed session token and sets an httpOnly cookie named sid.","type":"behavior","tag":"auth","source-id":"S007","source-kind":"repo","source-chunk":"R004","source-ref":"@root:src/auth/session.ts#L42-L88","importance":"high"}
{"id":"R007-F002","text":"A Session record has the fields id, userId, createdAt, and expiresAt.","type":"schema","tag":"auth","source-id":"S007","source-kind":"repo","source-chunk":"R007","source-ref":"@root:src/models/session.ts#L9-L18"}
```

## 4. Outline (`outline.md`) — produced by the planner

The Outline is the **exact-once coverage contract**. Its grammar is strict: `coverage.mjs --mode outline` rejects any line it does not recognize.

```markdown
# Outline: <document title>
ledger-sha256: <64-hex digest of the ledger this outline was planned against>

## <Section heading>
covers: C001-F001, C001-F002
diagram: <flow name> | C002-F001, C002-F003
notes: <optional grouping or cross-section note>

## <Next section heading>
covers: R004-F001, R004-F002, R007-F001
```

Rules:

- Line 1 must be `# Outline: <title>` and line 2 must be `ledger-sha256: <digest>`. A digest that does not match the supplied ledger fails as a stale Outline.
- Only `## <heading>`, `covers:`, `diagram:`, and `notes:` lines are permitted outside fenced content. Blank lines are allowed. There is no `terminology:` line.
- Every section requires exactly one `covers:` line, and no section may repeat a field.
- Ids on a `covers:` line are separated by a comma and exactly one space.
- Every ledger id appears on exactly one `covers:` line. An unknown, missing, or duplicated id fails the gate. When the planner merges duplicates, it lists the merged ids on the surviving section's line so they are still counted once each.
- `diagram:` flags a qualifying non-linear flow (decision branches, alternate paths, retries, exceptions, loops, parallel routing, branching state lifecycles, or multi-actor interactions with non-linear control flow) and the ids that compose it. Use it to mark cross-section flows so the reviewer builds one coherent diagram. Do not flag a taxonomy, field list, straight-line procedure, pure request/response chain, or anything that is really a table.
- Regenerating the ledger invalidates the Outline: replan it and rerun outline coverage.

## 5. Consumed manifest (`consumed.jsonl`) — produced by the drafter

While writing each section, the drafter appends one line per ledger id it represented:

```jsonl
{"id":"C001-F001","section":"Portal overview"}
{"id":"R004-F001","section":"Sessions"}
{"id":"E004-F002","section":"Notifications","resolution":"superseded"}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | The ledger id the drafter represented. |
| `section` | Yes | The exact heading text of a section that exists in the evaluated document. |
| `resolution` | No | Only `superseded`: an `E*` id whose content was replaced by newer `C*` or `R*` material covering the same point. No other value is accepted. |

Rules:

- Coverage is **exact-once**: every ledger id appears in exactly one record. A second record for the same id is a duplicate violation, so one id cannot be split across sections. When an id's content spans sections, record it in the section that carries the point and cross-reference in prose.
- `section` must name a heading the document actually contains; a name the document does not have is a missing-section violation.
- A record for an id that is not in the ledger is a dangling violation; a ledger id with no record is uncovered.
- Record an id as consumed even when it is represented as `[NEEDS CLARIFICATION: ...]`; the point is preserved, not dropped.
- **Never** place ledger ids or audit metadata inside the document Markdown. The manifest is a separate sidecar that `coverage.mjs --mode document` reads.

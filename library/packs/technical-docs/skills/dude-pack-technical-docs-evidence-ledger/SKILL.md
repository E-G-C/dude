---
name: dude-pack-technical-docs-evidence-ledger
description: "Use when a technical-docs pipeline step needs the shared evidence-ledger data contracts: the ledger.jsonl entry schema and stable chunk-prefixed ids, the type taxonomy, the source-kind and source-ref provenance that records where each entry came from across repository, document, transcript, notes, and draft sources, the outline.md coverage contract, or the consumed.jsonl manifest. Load it before the extractor, planner, drafter, or coverage step reads or writes these schemas."
---

# Evidence Ledger — Intermediate Representation

The **evidence ledger** is the durable, compact memory that lets the pipeline process sources larger than the context window and prove that no detail was lost. Every traceable item in a source becomes one atomic ledger entry. Once a chunk has been distilled into ledger entries, the raw chunk can be dropped from context. The ledger carries its meaning forward.

Three shared data contracts are defined here. They are the single source of truth for the extractor, planner, drafter, and coverage steps.

## 1. Ledger (`ledger.jsonl`) — produced by the extractor

One JSON object per line (JSONL), appended as each chunk is processed. Fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Stable unique id, **chunk-prefixed**: `<chunkId>-F<NNN>` (e.g. `C012-F003` or `R004-F001`). The chunk prefix guarantees uniqueness even when chunks are extracted in parallel. Zero-pad `<NNN>` within the chunk. Never reuse or renumber an id. |
| `text` | Yes | Exactly one atomic item: a fact, step, decision, parameter, example, behavior, interface, schema, or constraint. Paraphrase for clarity, but keep it strictly traceable to its source. Make it self-contained, understandable without the original source. |
| `type` | Yes | One of the type taxonomy values below. |
| `tag` | Yes | Short lowercase kebab-case theme slug used to group entries into sections (e.g. `profile-section`, `notifications`, `auth`). |
| `source-chunk` | Yes | The chunk id this entry came from (e.g. `C012` or `R004`). |
| `source-kind` | When known | The kind of source behind the entry: `repo`, `document`, `transcript`, `notes`, or `draft`. Set it whenever intake knows the kind, which in practice is every run, so downstream steps can treat repository evidence and prose differently. |
| `source-ref` | repo / document | A precise pointer into the source. For `repo`, a repository path with an optional `#L<start>-L<end>` line range or a trailing `:<symbol>` name (e.g. `src/auth/session.ts#L42-L88` or `src/auth/session.ts:createSession`). For `document`, a heading path (e.g. `Configuration > Retries`). For prose sources (`transcript`, `notes`, `draft`) the `source-chunk` is already the pointer, so omit `source-ref`. |
| `importance` | No | `high` \| `medium` \| `low`. Drives prioritization when coverage gaps are found. Default `medium`. |
| `refs` | No | Array of related ledger ids (e.g. a `parameter` that belongs to a `decision`). |

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
- Every entry must be supported by its source. Apply `dude-pack-technical-docs-traceability`: zero fabrication. If a detail is uncertain or missing, record it as an `open-question` with a `[NEEDS CLARIFICATION: ...]` marker rather than inventing it.
- Repeated mentions of the same point across different chunks each get their own entry at extraction time (extraction is parallel and chunk-local). Consolidation happens later, at the planner's reduce step.

### Chunk-id provenance (prose, prior document, and repository)

The orchestrator assigns chunk ids by **prefix** to encode provenance directly in the ledger; downstream agents read the prefix to tell new prose, prior document, and repository evidence apart.

- `C*` (e.g. `C001`, `C012`) — chunks of **new prose source material**: transcripts, rough notes, and drafts. Default for all runs.
- `E*` (e.g. `E001`, `E003`) — chunks of the **existing technical document** in *update mode*. The extractor processes these chunks the same way, but the prefix tells the planner to map ids onto the existing section structure and tells the drafter to treat the ids as prior content, preserved unless the new ledger contradicts them.
- `R*` (e.g. `R001`, `R012`) — **repository-derived evidence** produced by the repository intake path (see `dude-pack-technical-docs-source-intake`): code, configuration, tests, and schemas. The extractor emits `R*` entries exactly as it emits prose entries, and they enter the same ledger under the same coverage guarantee. The prefix lets the planner and drafter tell repository evidence from prose material, so a repository-only run, a prose-only run, and a mixed run all share one ledger and one coverage gate.

A prose-only fresh run holds only `C*` ids. Repository intake adds `R*` ids. Update mode adds `E*` ids for the existing document. One ledger file can hold any mix, and coverage spans the union, so the coverage gate proves no detail was lost from any source.

### Example

```jsonl
{"id":"C001-F001","text":"The onboarding portal has three areas: profile, tasks, and settings.","type":"fact","tag":"portal-overview","source-chunk":"C001","source-kind":"transcript","importance":"high"}
{"id":"C001-F002","text":"The profile section shows a progress bar for onboarding completion percentage.","type":"fact","tag":"profile-section","source-chunk":"C001","source-kind":"transcript"}
{"id":"C002-F001","text":"Notification frequency can be immediate, daily digest, or weekly summary.","type":"parameter","tag":"notifications","source-chunk":"C002","source-kind":"transcript","importance":"high"}
{"id":"C003-F001","text":"An FAQ section was proposed but not implemented.","type":"decision","tag":"future-work","source-chunk":"C003","source-kind":"notes"}
{"id":"R004-F001","text":"createSession issues a signed session token and sets an httpOnly cookie named sid.","type":"behavior","tag":"auth","source-chunk":"R004","source-kind":"repo","source-ref":"src/auth/session.ts:createSession","importance":"high"}
{"id":"R004-F002","text":"SESSION_TTL_SECONDS sets the session lifetime and defaults to 3600.","type":"parameter","tag":"auth","source-chunk":"R004","source-kind":"repo","source-ref":"src/auth/config.ts#L12-L14"}
{"id":"R007-F001","text":"POST /sessions creates a session and returns 201 with the new session id.","type":"interface","tag":"auth","source-chunk":"R007","source-kind":"repo","source-ref":"src/routes/sessions.ts:POST /sessions"}
{"id":"R007-F002","text":"A Session record has the fields id, userId, createdAt, and expiresAt.","type":"schema","tag":"auth","source-chunk":"R007","source-kind":"repo","source-ref":"src/models/session.ts:Session"}
```

## 2. Outline (`outline.md`) — produced by the planner

The outline is the **coverage contract**: it names every section and assigns the ledger ids that section must represent. Every ledger id must be assigned to exactly one section (consolidated duplicates are listed together). Format:

```markdown
# Outline: <document title>
terminology: <CanonicalName> (also: <variant>, <variant>)   (optional; one line per normalized entity, placed under the title)

## <Section heading>
covers: C001-F001, C001-F002
diagram: <flow name> | C002-F001, C002-F003   (optional; omit if no qualifying non-linear flow)
notes: <optional grouping or cross-section note>

## <Next section heading>
covers: R004-F001, R004-F002, R007-F001
```

Rules:
- `covers:` lists the ledger ids the section is responsible for. The union of all `covers:` lines must equal the full set of ledger ids, counting `C*`, `R*`, and `E*` alike (minus ids explicitly merged as duplicates, which are recorded on the surviving id's line). That equality is what proves no evidence was dropped.
- When the planner merges duplicate entries, it keeps one surviving id and lists the merged ids on the same `covers:` line so coverage still counts them.
- `diagram:` flags a qualifying non-linear flow (decision branches, alternate paths, retries, exceptions, loops, parallel routing, branching state lifecycles, or multi-actor interactions with non-linear control flow) and the ids that compose it. Use it to mark **cross-section flows** so the reviewer can build one coherent diagram from the ledger rather than from split prose. Do not flag a diagram for a taxonomy, field list, straight-line procedure, pure request/response chain, or anything that is really a table.
- `terminology:` (optional, document-level, placed directly under the title) records a canonical name for an entity that appears under variant spellings in the ledger, so the drafter uses one consistent term. It carries no ids and does not affect coverage.

## 3. Consumed manifest (`consumed.jsonl`) — produced by the drafter

While writing each section, the drafter appends one line per ledger id it represented:

```jsonl
{"id":"C001-F001","section":"Portal overview"}
{"id":"R004-F001","section":"Sessions"}
{"id":"E004-F002","section":"Notifications","resolution":"superseded"}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | The ledger id the drafter represented in this section. |
| `section` | Yes | The section heading the id was represented in. |
| `resolution` | No | Lifecycle marker for prior content in update mode. Allowed values: `superseded` (an `E*` id whose content was replaced by newer `C*` or `R*` material covering the same point — record both as consumed) and `split` (one id whose content was distributed across more than one section — also record it consumed in each section). Omit for the normal case. |

This is the audit trail that the runtime coverage check (`node .github/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs`) verifies against the ledger. Record an id as consumed even when it is represented as an open issue (`[NEEDS CLARIFICATION: ...]`); the point is preserved, not dropped. The `resolution` field is informational and does not affect the gate; the gate cares only that every ledger id appears at least once. **Never** place these ids or any audit metadata inside the document Markdown; the manifest is a separate sidecar file.

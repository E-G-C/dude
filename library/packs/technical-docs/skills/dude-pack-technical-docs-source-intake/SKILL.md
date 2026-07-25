---
name: dude-pack-technical-docs-source-intake
description: "Use when a technical-docs run needs to classify the provided source material and preprocess it into evidence-ledger entries. Covers the source kinds (`repo`, `document`, `transcript`, `notes`, `draft`, or `mixed`), the front-door runtime script and chunk-id prefix (`C*`, `E*`, `R*`) each kind carries, and the read-only, bounded repository intake path. Load it before the extractor turns any source unit into ledger entries."
---

# Source Intake and Classification

## Purpose

Classify the source material the writer was given, then run the right intake for
each kind so every source becomes atomic evidence-ledger entries.

A repository is a first-class source, but it is only one of several. Whatever the
mix, all kinds converge on one `ledger.jsonl` and one coverage gate, so the
planner, drafter, and audit steps do not care where a given fact originated. The
ledger schema, `source-kind`, `source-ref`, and the `C*` / `E*` / `R*` chunk-id
prefixes are defined in `dude-pack-technical-docs-evidence-ledger`; the front-door
scripts live in `dude-pack-technical-docs-runtime`.

## Classify the source

Read what was provided and assign one or more source kinds:

- `repo` — a repository or source tree: code, configuration, tests, schemas.
- `document` — an existing Markdown technical document to update in place.
- `transcript` — an audio transcript, WEBVTT/SRT or plain text.
- `notes` — rough or scratch notes, bulleted or free-form.
- `draft` — an in-progress Markdown draft of the document.
- `mixed` — any combination of the above.

A single run is often `mixed`. Set each entry's `source-kind` at intake so
downstream steps can tell repository evidence from prose.

## Front door by kind

| Source kind | Front-door script | Chunk prefix | `source-ref` |
|---|---|---|---|
| `transcript` | `preprocess` → `chunk` | `C*` | omit (the chunk is the pointer) |
| `notes` | `preprocess` → `chunk` | `C*` | omit |
| `draft` | `preprocess` → `chunk` | `C*` | omit |
| `document` | `chunk` (no preprocess) + `headings` | `E*` | heading path |
| `repo` | `repo-inventory` | `R*` | path + line range or symbol |
| `mixed` | each applicable front door, then `merge-ledger` | `C*` / `E*` / `R*` | per kind |

Invoke every script as
`node .github/skills/dude-pack-technical-docs-runtime/scripts/<script>.mjs ...`
(see `dude-pack-technical-docs-runtime`).

## Prose intake (`transcript` / `notes` / `draft`)

Preprocess to strip transcript markup, then segment into token-budgeted chunks
with the `C` prefix:

```bash
node .github/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs <input...> --out clean.txt
node .github/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs clean.txt --outdir chunks/ --prefix C
```

Apply these source rules while preprocessing:

- **Genuine WEBVTT only.** Strip the `WEBVTT` header and the `NOTE` / `STYLE` /
  `REGION` blocks only when the input is real WEBVTT. In rough notes or Markdown a
  line such as `NOTE: ...` is content and is preserved.
- **Timestamps and speaker tags are not content.** Ignore cue timestamps and
  speaker labels (for example `<v Speaker 2>`) when reading meaning. A transcript
  with no timestamps is continuous conversation text.
- **Notes and drafts are content line by line.** They carry no timestamps or
  speaker tags, so treat every line as source of record.

Each chunk then becomes `C*` entries through `dude-pack-technical-docs-extractor`.

## Existing document intake (update mode)

An existing `document` is the base to merge into. It is already clean Markdown, so
do NOT re-preprocess it. Chunk it with the `E` prefix and capture its heading
outline:

```bash
node .github/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs existing-doc.md --outdir doc-chunks/ --prefix E
node .github/skills/dude-pack-technical-docs-runtime/scripts/headings.mjs existing-doc.md --out headings.txt
```

The extractor turns its chunks into `E*` entries under the same coverage guarantee
as new material. The heading outline lets the planner reuse the existing section
structure instead of reinventing it. `E*` content is preserved unless newer `C*`
or `R*` material contradicts the same point.

## Repository intake (`repo`)

Repository intake is evidence-first, read-only, and bounded. Never run a
state-changing command, and never infer behavior the code does not show. Apply
`dude-pack-technical-docs-traceability`: a behavior claim traces to code, tests,
configuration, or a schema, never to assumption.

Run the inventory against the repository root:

```bash
node .github/skills/dude-pack-technical-docs-runtime/scripts/repo-inventory.mjs <repoRoot> --out inventory.json
```

`repo-inventory` produces a compact, read-only JSON inventory: languages, package
manifests, entry points, configuration, test directories, schema files, and docs.
The extractor consumes that inventory and reads the specific files it points to,
following this order:

1. **Inventory the tree.** Start from `inventory.json`; it bounds the scan and
   names where to look.
2. **Map the interface surface.** Record exported or public symbols, endpoints,
   the CLI surface, environment variables, and configuration keys.
3. **Gather behavior evidence.** Read tests, schemas, and existing in-repo docs
   for what the system actually does.
4. **Optionally capture a read-only command's output.** With user approval, run a
   non-mutating command such as a `--help` surface and treat its output as source.
   Never run a state-changing command.
5. **Emit atomic `R*` entries.** Each entry carries a precise `source-ref`: a
   repository path with a `#L<start>-L<end>` line range or a trailing `:<symbol>`
   name.

The `R*` entries enter the same ledger as prose and fall under the same coverage
gate.

## Mixed intake

For a `mixed` source, run each applicable intake above, then merge the ledger
fragments into one file:

```bash
node .github/skills/dude-pack-technical-docs-runtime/scripts/merge-ledger.mjs <fragments...> --out ledger.jsonl
```

`C*`, `E*`, and `R*` ids coexist in that one ledger, and coverage spans their
union. A repository-only run, a prose-only run, and a mixed run all share the same
ledger and the same coverage gate.

## Diagrams and fenced code in sources

When source material contains a fenced diagram such as a ` ```mermaid ` block
(common in an existing `document` or a hand-authored `draft`), do not atomize its
internal syntax into many ledger entries. Capture at most one entry naming what
the diagram depicts. The diagram is preserved or regenerated downstream, so its
node-by-node markup is not separately traceable content.

## Cross-references

- `dude-pack-technical-docs-evidence-ledger` — the ledger schema, `source-kind`,
  `source-ref`, and the `C*` / `E*` / `R*` prefixes.
- `dude-pack-technical-docs-runtime` — the front-door scripts, invoked as
  `node .github/skills/dude-pack-technical-docs-runtime/scripts/<script>.mjs ...`.
- `dude-pack-technical-docs-traceability` — the zero-fabrication rule for every
  source kind.
- `dude-pack-technical-docs-extractor` — the agent that turns each source unit into
  ledger entries.
- `dude-pack-writing-style` and `dude-pack-writing-avoid-ai-tropes` — defer to
  these for prose style when they are installed.

# Data Model: Technical Docs Pack Remediation

## Identity Conventions

- A run has exactly one Source Registry.
- Source IDs are deterministic `S*` identities.
- Source-unit IDs are deterministic `C*`, `E*`, or `R*` identities allocated in registry order.
- Evidence IDs are `<unit-id>-F<three-digit-positive-ordinal>`.
- SHA-256 digests identify exact bytes. Paths alone never establish freshness.
- All persisted paths are normalized, workspace-relative POSIX paths.

## Entities

| Entity | Identity and state | Required relationships |
|---|---|---|
| Source Registry | One `sources.json` with `schemaVersion: 2`, root, work directory, output authorization, limits, and ordered Sources. | Owns every Source. Is referenced by every intake, extraction, gate, review, and finalization operation. |
| Source | `S*`; kind `transcript`, `notes`, `draft`, `document`, or `repo`; role `input` or `update-target`; stable source reference and path. File sources carry size and digest. | Belongs to one Source Registry. Produces zero or more units of exactly one applicable prefix. |
| `C*` Source Unit | A bounded unit from one independently normalized transcript, notes, or draft source. Carries original-source and cleaned-source ranges, source reference, digest, budget, and optional overlap ancestry. | Belongs to one file Source. Has exactly one Extraction Result. May support zero or more Evidence Entries. |
| `E*` Source Unit | A bounded unit from an existing document. It never crosses a heading boundary and carries an unambiguous heading path and source line span. | Belongs to one document Source. Has exactly one Extraction Result. May support zero or more Evidence Entries. |
| `R*` Source Unit | A bounded repository work unit containing one or more non-overlapping file-member slices in deterministic path and line order. | Belongs to one Repository Accounting result and its repository Source. Has exactly one Extraction Result. |
| Repository Accounting | One inventory per repository Source, with complete path dispositions, effective limits, totals, admitted-file hashes, deterministic `R*` units, limit hits, and repository digest. | Accounts for every encountered path. Defines the expected `R*` unit set used by extraction and completeness gates. |
| Extraction Result | One result per expected `C*`, `E*`, or `R*` unit. Status is `evidence` or `no-documentable-evidence`; it records examined members and optionally one evidence fragment. | References exactly one Source Unit and Source. An evidence result references one nonempty evidence fragment; a no-evidence result supplies a reason. |
| Evidence Entry | Unique evidence ID, text, classification, routing tag, source identity, source kind, source unit, exact source locator, optional importance, and optional evidence references. | Belongs to one Source Unit and Source. May be assigned to exactly one Outline section and consumed exactly once. |
| Outline | Markdown plan bound to one exact evidence-ledger digest. Sections contain exact-once `covers` assignments and optional evidence-bound diagram intent. | Assigns every Evidence Entry exactly once. Supplies section destinations for drafting and Consumed Entries. |
| Consumed Entry | One object-only JSONL record mapping an Evidence Entry to an exact final-document heading, with optional `superseded` resolution. | References one ledger entry and one heading in the evaluated document. Each ledger entry has exactly one Consumed Entry. |
| Gate Evidence | A schema-version-2 report with gate, stage, pass state, exact input hashes, effective configuration, counts, and deterministic violations. | Binds intake/extraction/outline/document/lint evidence to exact artifacts. May authorize only its declared stage. |
| Semantic Review Evidence | One report from `dude-pack-technical-docs-reviewer`, binding the pre-review reports, input draft, resulting document, consumed ledger, touched sections, and findings. | Depends on current pre-review coverage and lint. Its output digest must equal the document used by both final gates. |
| Final Document | The exact Markdown bytes published to the Source Registry's authorized output after finalization. | Depends on current passing extraction, outline, pre-review, semantic-review, final-coverage, and final-lint evidence. |

## Relationships

1. A Source Registry owns one or more Sources.
2. Each file Source produces `C*` or `E*` units; each repository Source produces one Repository Accounting result containing `R*` units.
3. Every expected Source Unit has exactly one Extraction Result.
4. Evidence fragments contribute Evidence Entries only through their declared Extraction Results.
5. Strict merge forms one nonempty Evidence Ledger from all validated evidence results.
6. One Outline assigns every ledger entry exactly once.
7. One Consumed Entry maps every ledger entry to one real final-document section.
8. Gate Evidence forms a directed freshness chain over exact artifact hashes.
9. Semantic Review Evidence connects pre-review diagnostics to one resulting document revision.
10. Finalization publishes only that reviewed revision after current final gates.

## Lifecycle

1. **Registered:** Validate sources, aliases, containment, output mode, work directory, and bounds; persist the Source Registry.
2. **Admitted:** Independently preprocess and chunk `C*` sources, heading-chunk `E*` sources, and fully inventory repository Sources into `R*` units.
3. **Extracted:** Produce exactly one Extraction Result for every expected unit.
4. **Merged:** Validate results and fragments, then atomically create a nonempty strict Evidence Ledger.
5. **Audited:** Reconcile sources, expected units, examined members, results, fragments, evidence provenance, and recall diagnostics.
6. **Planned:** Produce a ledger-bound digest and Outline; prove exact-once outline coverage.
7. **Drafted:** Produce a document and one strict Consumed Entry per ledger entry.
8. **Pre-reviewed:** Run document coverage and lint against the same draft digest.
9. **Reviewed:** Perform semantic review and emit Semantic Review Evidence for the resulting document.
10. **Final-gated:** Run final coverage and lint against the semantic-review output digest.
11. **Finalized:** Recheck sources, repository members, report hashes, update authorization, and containment; atomically publish the Final Document.
12. **Invalidated:** Any mutation returns the changed artifact and all descendants to a non-authorizing state.

## Invariants

- Source identity is never inferred from a filename, content match, or merged file.
- Different source kinds remain distinguishable even when names or bytes match.
- No unit crosses its source boundary; `E*` units also never cross heading boundaries.
- Repository accounting is complete only when every encountered path has one disposition, all admitted content is represented once, and no blocking rejection or limit hit remains.
- Unit, source, evidence, decision, action, and consumed identities are unique.
- Every expected unit has exactly one result; semantic absence is explicit and never represented by fabricated evidence.
- Every Evidence Entry has valid provenance agreeing with its Source and Source Unit.
- Every ledger entry is assigned once in the Outline and consumed once in the evaluated document.
- Pre-review Gate Evidence cannot authorize finalization.
- Both final gates and Semantic Review Evidence refer to the same reviewed-document digest.
- Only the Source Registry authorizes the final output. Update mode may alias only its declared update-target Source.
- A failed operation leaves prior valid output unchanged and no partial replacement.

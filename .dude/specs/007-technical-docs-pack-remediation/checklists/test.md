# Test Checklist

## Source Registry And Provenance

- [ ] Identical admitted inputs and limits produce byte-identical Source Registry ordering, `S*` identities, and deterministic artifacts.
- [ ] Source ordering follows kind rank, role, and UTF-8 bytewise normalized path.
- [ ] Duplicate canonical paths, duplicate file identities, source symlinks, unsafe roots, and unauthorized input/output aliases fail before dependent work.
- [ ] Update mode permits exactly one declared document update-target alias and rejects every other alias.
- [ ] Transcript, notes, draft, document, and repository Sources retain distinct IDs, kinds, references, and unit ownership through final traceability.
- [ ] Multi-source prose is processed independently and never concatenated into an anonymous combined input.
- [ ] `C*`, `E*`, and `R*` evidence agrees with its Source, Source Unit, manifest range, and exact source locator.
- [ ] Existing-document evidence retains hierarchical heading path and line provenance for repeated and nested headings.
- [ ] Same-named or byte-identical Sources remain distinct.

## Repository Accounting

- [ ] Every encountered repository path has exactly one admitted, skipped, or rejected disposition.
- [ ] Every skipped or rejected path has an explicit deterministic reason.
- [ ] Ordinary implementation, configuration, test, schema, and documentation files admitted by policy appear in accounting.
- [ ] Every admitted ordinary file is hashed and represented by non-overlapping `R*` member slices exactly once.
- [ ] `R*` identities, membership, ordering, and repository digest are independent of filesystem creation order.
- [ ] Small adjacent slices may share a bounded unit and large files split deterministically without omitting content.
- [ ] Accounting totals, admitted-file `unitIds`, work-unit members, and candidate bytes reconcile.
- [ ] Work directories, generated output, and prior output are explicitly skipped and never re-ingested.
- [ ] Repository output succeeds in a fresh contained destination whose parent does not yet exist.
- [ ] A traversal bound hit persists `complete: false`, identifies every hit, exits `1`, and cannot authorize extraction or finalization.
- [ ] An unreadable, escaping, rejected, or changed-during-read path prevents `complete: true`.

## Runtime And Interchange

- [ ] Object-only evidence JSONL rejects malformed JSON, scalars, arrays, comments, unknown fields, blank records, and bare IDs.
- [ ] Object-only consumed JSONL rejects malformed records, bare IDs, duplicate IDs, unknown fields, and missing sections.
- [ ] A missing or empty required Source, expected-unit set, result set, ledger, or consumed set cannot produce a passing gate.
- [ ] A ledger record such as `{"text":"missing id"}` fails schema validation and cannot reproduce the prior false pass.
- [ ] Duplicate Source, unit, evidence, decision, action, or consumed identities fail before authorization.
- [ ] Exactly one Extraction Result is required for every expected unit; missing, duplicate, and extra results fail.
- [ ] Evidence results require a nonempty digest-matching fragment and positive entry count.
- [ ] No-evidence results require a nonempty reason, forbid a fragment, and prove examination of every member.
- [ ] Merge rejects missing or unreadable result inputs instead of silently skipping them.
- [ ] Merge rejects direct, canonical-path, symlink, and hard-link aliases, including self-ingestion of its prior output.
- [ ] Strict merge ordering and output are repeatable for identical declared results.
- [ ] Invalid integer, ratio, threshold, and unsupported CLI options fail before dependent reads or writes.
- [ ] Exact-bound fixtures succeed where otherwise valid; one-over hard inputs exit `2` without replacing prior output.
- [ ] Source, JSON, JSONL line, JSONL record, directory-child, depth, encountered-entry, admitted-file, byte, and unit bounds each have exact and one-over coverage.
- [ ] Every failed write preserves prior valid output and leaves no temporary artifact.
- [ ] Deterministic outputs contain no timestamps, random IDs, absolute host paths, or locale-dependent ordering.

## Parser And Routing Regression

- [ ] Actual WEBVTT `NOTE`, `STYLE`, and `REGION` blocks are recognized and removed as structure.
- [ ] Valid WEBVTT cue text beginning with `NOTE`, `STYLE`, or `REGION` is preserved.
- [ ] SRT and WEBVTT cue IDs, timestamps, tags, line mapping, and removal counts remain consistent.
- [ ] Non-BMP Unicode characters at split and overlap boundaries remain intact.
- [ ] Every chunk, including overlap, stays within the 3,000 approximate-token default budget.
- [ ] CommonMark fences require matching marker type, sufficient closer length, and valid indentation.
- [ ] Mismatched and unclosed fences do not expose fenced heading-like content.
- [ ] Closing ATX hashes are removed only when whitespace-delimited and headings containing `C#` survive.
- [ ] `E*` chunks never cross heading boundaries.
- [ ] Every decision and action ID routes to one selected Outline destination exactly once and is not duplicated through tag grouping.

## Gates And Freshness

- [ ] Extraction audit reconciles every Source, expected unit, result, examined member, fragment, ledger entry, and repository member.
- [ ] Recall-density diagnostics cannot override incomplete accounting or missing evidence structure.
- [ ] Outline coverage rejects missing, unknown, and duplicate IDs and proves every ledger ID is assigned exactly once.
- [ ] Document coverage proves every ledger ID has one consumed record and names an existing exact document heading.
- [ ] `resolution: superseded` is accepted only for a valid consumed ledger entry.
- [ ] Coverage and lint reports bind exact input paths and hashes and deterministically order violations.
- [ ] Pre-review coverage and lint cannot substitute for final reports.
- [ ] Semantic review is accepted only from `dude-pack-technical-docs-reviewer` and binds both pre-review reports, input draft, output document, and consumed data.
- [ ] Final coverage and final lint bind the same document digest as semantic-review output.
- [ ] A mutation to a Source, unit, result, fragment, ledger, Outline, consumed ledger, draft, review report, or final report invalidates every dependent gate.
- [ ] A reviewer mutation after pre-review gates requires a new semantic report and both final gates.
- [ ] Stage substitution, stale report hashes, source mutation, and admitted repository-member mutation are rejected by finalization.
- [ ] Finalization reads its destination only from the Source Registry and rejects any unauthorized output or update target.
- [ ] Failed finalization leaves the prior final document unchanged and no partial publication.
- [ ] The canonical sequence is consistent across the manifest, 5 agents, 6 affected skills, and 2 prompts.

## Four Live Modes

- [ ] Transcript-only live mode produces only `C*` units, preserves reserved-word cue text, and retains transcript references through the final document.
- [ ] Repository-only live mode starts in a fresh workspace, accounts for every encountered path, assigns every admitted slice to `R*`, and creates the contained output parent safely.
- [ ] Mixed-source live mode keeps repository, transcript, notes, and draft identities separate and preserves source-specific sentinels without ID collisions.
- [ ] Existing-document update live mode produces heading-bound `E*` evidence, preserves unchanged content, records superseded evidence, verifies the update-source hash, and atomically replaces only the authorized target.
- [ ] Each live mode records Source Registry, unit, ledger, review, final-coverage, final-lint, and final-output hashes.
- [ ] Checked-in fixtures or simulated prose are not treated as substitutes for the four actual writer-agent runs.

## Pack And Lifecycle

- [ ] Manifest inspection reports exactly 5 agents, 7 skills, 2 prompts, the intended namespace, and `requires.tools: []`.
- [ ] Every pack-local agent and skill reference resolves and no retired skill name remains.
- [ ] Optional-writing wording is consistent across manifest, agents, skills, and prompts.
- [ ] Standalone technical-docs completes the same functional contract using local writing guidance.
- [ ] Writing-first and technical-docs-first composition both work without adding a required sibling-pack schema.
- [ ] Removing technical-docs from a combined install preserves writing-owned artifacts and profile state.
- [ ] Installation includes all declared agents, skills, prompts, 11 runtime CLIs, and the nested shared module, while excluding authoring-only tests.
- [ ] Removal leaves no technical-docs-owned artifact, profile entry, hook, or stale reference.
- [ ] Focused pack tests, full repository test discovery excluding `dist`, compose verification, and project lint complete without failures.
- [ ] A pristine core-only release build and lint complete without failures before any pack is installed into it.
- [ ] A separate disposable copy of that pristine release receives the complete technical-docs installed surface and returns to zero technical-docs artifacts or stale references after removal.
- [ ] Whitespace and diff validation identify no unintended or unrelated change, including no Feature 006 mutation.
- [ ] Fresh independent review evaluates the complete post-verification evidence set, and any later mutation invalidates that approval.

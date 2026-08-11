# Implementation Plan: Bounded Owner Log Projection

## Summary

Implement the change at the existing evidence chokepoint in `src/skills/dude-work/recovery.mjs`. Owner acquisition continues to read the complete owner file and extract the complete Coordinator Log. It parses that extracted section into whole append-only events and constructs one exact owner-log body. `buildInspection` then selects the largest chronological event suffix that fits the complete canonical packet beside all other evidence already normalized for that fresh Inspection.

There is no fixed owner budget or reservation. The same projection step runs whenever Inspection is rebuilt, including settlement after trusted Tester and Reviewer captures are present. The fixed 16-item and 65,536-byte limits, descriptor-only overflow, no-model-call behavior, complete definition-recovery capture, structured authority evidence, and exact owner resolution remain unchanged.

One exact current body shape replaces the complete-text shape. Its EvidenceItem descriptor binds the projected body; `fullLogSha256` and `fullLogByteLength` inside that body bind the complete extracted section. Feature 007/Feature 009 incident prestate keeps its existing `ownerLogTailHash` field but assigns the new full-log digest, not a hash of visible events.

## Technical Context

**Language/Version**: JavaScript ECMAScript modules with `// @ts-check`, Node.js 20 or newer  
**Primary Dependencies**: Node.js `Buffer` and `node:crypto`; existing `logicalLines`, `extractCoordinatorLog`, `canonicalJson`, `contentDescriptor`, EvidenceItem validation, feature identity resolution, Inspection construction, host adapter, and specialist attestation  
**Storage**: Existing Markdown owner ledgers only; no new persisted state, cache, archive, migration record, or configuration  
**Testing**: `node:test`; focused recovery fixtures; read-only real-ledger regressions; host-adapter runner settlement integration; current-format contracts; recursive suite; development-build parity and idempotence; Dude lint; independent review  
**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces  
**Project Type**: Dependency-free coordination runtime and generated Copilot bundle  
**Performance Goals**: Test at most one additional suffix candidate per parsed event under the existing 1,048,576-byte idea-file ceiling; keep the fixed model packet at no more than 16 items and 65,536 canonical UTF-8 bytes; add no index, cache, worker, or extra process  
**Constraints**: `src/` is authoritative; `.github/skills/dude-work/**` is generated only through `node scripts/build-dev.mjs`; preserve complete stored logs; no fixed 16 KiB or other reservation, generic budgeting framework, compatibility parser, compression, batching, migration, or new state

## Spec Quality Validation

- The specification defines three independently testable P1 stories: bounded growth, fresh settlement fitting, and downstream safety.
- Acceptance scenarios cover small and oversized logs, fresh Tester/Reviewer captures, exact maximality, Unicode and multiline records, framing, oversized newest events, non-owner overflow, exact consumers, and incident binding.
- FR-001 through FR-014 state observable behavior without naming implementation modules, helper functions, serialization APIs, or generated file locations.
- SC-001 through SC-010 are measurable, and no clarification marker remains.
- The supersession is limited to the affected current Feature 004 owner-log text clause and Feature 009 incident binding; historical artifacts and all other safety contracts remain intact.

The technology-agnostic specification passes its definition-time document gate by inspection. This is not a lint, execution, or readiness claim.

## Verified Current Topology

- `src/skills/dude-work/recovery.mjs` is the production evidence owner. `normalizeOwnerLog` resolves the exact defined owner from all direct ideas, extracts the complete Coordinator Log, and currently places that complete text in `coordinatorLog`.
- `collectEvidenceInternal` normalizes owner, task, optional definition-plan, lane, current-run, review, verification, lint, and session evidence. `acquireInspection` passes the complete normalized list to `buildInspection`.
- `buildInspection` runs after current evidence values exist. It orders and deduplicates EvidenceItems, constructs the exact canonical packet projection, enforces the fixed 16-item and 65,536-byte limits, and converts overflow to the existing descriptor-only Inspection.
- `validateEvidenceItem` requires each descriptor to bind its complete `text`; `modelPacket` returns only a non-overflow packet. These contracts already provide the projected-body binding and fail-closed output needed here.
- Fresh Inspection acquisition is invoked again during trusted autonomous completion and settlement. Tester and Reviewer captures therefore already reach `buildInspection` before the packet is admitted; no pre-reserved owner capacity is needed.
- Exact owner authority comes from idea/spec identity. Autonomous definition recovery separately captures complete owner-file bytes and does not need model-visible historical prose.
- Learning, current-run, review, verification, and lint are separate structured evidence sources. They do not derive authority from the complete Coordinator Log text.
- The Feature 007/Feature 009 incident-correction path currently derives `ownerLogTailHash` from `owner.coordinatorLog`. That direct parser must instead consume the new body and assign its `fullLogSha256`.
- `host-adapter-runner.mjs` and `host-adapter.mjs` already route actual specialist results through `specialist-attestation.mjs`, trusted capture construction, fresh Inspection, and settlement. Production code changes are not expected in those files; their existing path is the integration boundary.
- Current Work guidance in `src/skills/dude-work/SKILL.md`, `docs/commands.md`, `docs/reference.md`, and `docs/workflow.md` describes all available history or a complete packet without distinguishing a bounded owner-log projection.
- Historical Feature 004 and Feature 009 specifications are evidence, not write targets. Generated `.github/skills/dude-work/**` files are build output and are never edited directly.

## Chosen Design

### 1. One exact owner-log body

For a present owner-log EvidenceItem, `text` is the canonical JSON serialization of exactly this closed shape, with no `version`, extension, or legacy field:

```text
{
  ideaPath: DirectIdeaPath,
  specPath: CanonicalSpecPath,
  fullLogSha256: LowercaseSha256,
  fullLogByteLength: NonnegativeSafeInteger,
  totalEventCount: NonnegativeSafeInteger,
  includedEventCount: NonnegativeSafeInteger,
  omittedEventCount: NonnegativeSafeInteger,
  firstIncludedEventOrdinal: PositiveSafeInteger | null,
  lastIncludedEventOrdinal: PositiveSafeInteger | null,
  events: UnicodeScalarString[]
}
```

The invariants are:

1. `fullLogSha256 = SHA256(UTF8(complete extracted Coordinator Log section))`.
2. `fullLogByteLength = byteLength(UTF8(complete extracted Coordinator Log section))`.
3. `includedEventCount = events.length`.
4. `omittedEventCount + includedEventCount = totalEventCount`.
5. `events` is chronological and contiguous through the newest event.
6. For a nonempty log, ordinals are one-based, `firstIncludedEventOrdinal = omittedEventCount + 1`, `lastIncludedEventOrdinal = totalEventCount`, and the inclusive range length equals `includedEventCount`.
7. For a zero-event log, both ordinal fields are `null`, all three counts are zero, and `events` is empty.

`normalizeOwnerLog` computes the complete-section digest and length before discarding no stored bytes. It initially creates the all-events candidate. A small exact validator in the same module owns this closed body and its invariants. Every direct owner-log parser uses that validator; the old `{ideaPath,specPath,coordinatorLog}` body and every hybrid are rejected.

The EvidenceItem descriptor remains unchanged in shape. It hashes and measures the complete canonical projected-body string. It does not hash the stored log directly. Complete-log binding is explicit inside that string through `fullLogSha256` and `fullLogByteLength`.

### 2. Whole-event parsing

Reuse the existing strict UTF-8 acquisition, Unicode-scalar checks, `logicalLines`, and `extractCoordinatorLog`. Add one local event parser beside owner normalization; do not introduce a Markdown framework.

Parsing rules:

1. Input is the exact string returned by `extractCoordinatorLog`, including the accepted `## Coordinator Log` heading and section framing.
2. A countable event starts only at column zero and matches `^- \d{4}-\d{2}-\d{2}(?:[ \t]|$)`.
3. The accepted Coordinator Log heading, blank framing before the first event, and standalone HTML comment lines such as managed markers are framing. They are never events and are omitted from `events`, while remaining covered by the full-section digest and length.
4. After an event starts, every non-framing line through the line before the next countable event belongs to that event. Preserve its exact Unicode scalar content, continuation indentation, and source line terminators.
5. A standalone framing comment does not become an event or continuation. The current event continues after it until the next event start, but the framing comment itself remains represented only by the complete-log binding.
6. Nonblank, noncomment content before the first event is malformed owner-log evidence rather than an invented event.
7. A section containing only heading, blank lines, and comments is a valid zero-event log.

The parser returns an ordered array of complete event strings. Selection uses array boundaries only, so it cannot split a multiline record or surrogate pair.

### 3. Exact fresh-packet suffix selection

Keep the specialized logic inside `buildInspection`; add no generic budget allocator or renderer registry.

After ordinary evidence normalization and canonical ordering:

1. Find the sole present owner-log item and validate its exact body. Missing, malformed, conflicting, nontext, or acquisition-overflow owner evidence retains current handling.
2. Keep all non-owner items exactly as normalized. Item-count overflow cannot be repaired by shortening one body and proceeds through the existing path.
3. Construct the exact non-owner packet projection. If it already exceeds 65,536 bytes, do not omit or alter evidence; let existing overflow classification run.
4. For a zero-event log, test the metadata-only body once.
5. For a nonempty log, begin with the newest whole event. Build the candidate body, recreate the owner EvidenceItem so its descriptor binds that candidate, replace it in the complete ordered item list, and measure `Buffer.byteLength(canonicalJson(packetProjection(target, candidateItems)))`.
6. If the newest candidate does not fit, retain that candidate and let normal descriptor-only overflow run. Never retry with an empty event list.
7. If it fits, prepend exactly one preceding event at a time. Rebuild the body, descriptor, and complete packet for every candidate. Keep advancing while the packet remains at most 65,536 bytes; stop at the first crossing. The last admitted candidate is the maximal suffix.
8. If every event fits, emit the all-events candidate with zero omitted.
9. Pass the selected item list through the existing crossing, blocker, Inspection validation, evidence-hash, and `modelPacket` logic.

This is one backward linear candidate scan over the currently bounded idea file. Exact packet measurement naturally counts target identity, every current evidence body, canonical key ordering, JSON escaping at both body and packet levels, descriptors, count digits, and the projected body itself. No raw-log estimate or reservation constant participates.

Because every call to `acquireInspection` reaches `buildInspection` after its current captures are normalized, a fresh settlement Inspection automatically shrinks or expands the suffix for the exact evidence then present.

### 4. Direct consumers and incident binding

Route every present owner-log body read in `recovery.mjs` through the one exact validator.

- Owner and projection resolution read `ideaPath` and `specPath`.
- Definition reconciliation continues to derive complete owner state from its separately acquired owner-file capture and definition prestate, not from `events`.
- Learning presence checks only the exact owner identity and admitted evidence status it currently needs.
- Current-run, review, verification, and lint parsers remain unchanged.
- Feature 007/Feature 009 incident-correction prestate assigns `ownerLogTailHash = ownerLog.fullLogSha256`. Do not hash `events`, rehash the digest, rename the existing field, or add compatibility state.

Add a focused safety regression with two complete logs that have the same selected suffix but different omitted prefixes. Their visible `events` may match, but `fullLogSha256` and `ownerLogTailHash` must differ.

### 5. Guidance and current-format contract

Update only current guidance that describes Inspection completeness:

- `src/skills/dude-work/SKILL.md`
- `docs/commands.md`
- `docs/reference.md`
- `docs/workflow.md`

State that all non-owner admitted evidence remains complete, while owner-log evidence contains exact owner identity, complete-log digest/length/count metadata, and the maximal whole-event suffix for that fresh packet. Omitted owner events are not represented as inspected text. Preserve descriptor-only overflow, no batching, and no model call.

Extend `scripts/current-format-contract.test.mjs` only where needed to pin:

- the bounded owner-log guidance in current source;
- the absence of a current promise that all owner-log prose is present;
- the single new body and absence of a production `coordinatorLog` compatibility read; and
- source/generated ownership of `dude-work`.

Do not edit `.dude/specs/004-pre-work-log-learning/**`, `.dude/specs/009-autonomous-learning-governance/**`, or their owner ledgers.

### 6. Generated bundle integration

After focused source and integration tests pass, run `node scripts/build-dev.mjs`. Intended generated changes are:

- `.github/skills/dude-work/recovery.mjs`
- `.github/skills/dude-work/SKILL.md`

No generated test file is added. Do not hand-edit any `.github/skills/dude-work/**` path. A second development build over unchanged source must produce no diff.

## Verification Strategy

### Focused recovery coverage

Extend `src/skills/dude-work/recovery.test.mjs` through existing public functions rather than adding a test-only production export.

1. **Small logs**: zero, one, and several events; all fit; metadata and ordinal invariants; descriptor binds the canonical body.
2. **Real oversized ledgers**: read `.dude/ideas/agent-orchestration-metadata.md` and `.dude/ideas/remove-legacy-compatibility.md` as immutable inputs. Build packets from their real complete sections, assert bounded output, and compare file descriptors before and after.
3. **Maximality**: independently reconstruct the immediately larger candidate from a known fixture and prove the complete canonical packet exceeds 65,536 bytes while the selected packet does not.
4. **Event integrity**: Unicode, emoji, combining marks, escaped punctuation, multiline continuations, indented bullets, blank lines, accepted headings, and managed comments. Assert exact included event strings and counts.
5. **Overflow**: make the newest event exceed remaining capacity while staying below the existing source-file limit; separately overflow with non-owner evidence. Require descriptor-only Inspection, `modelPacket(...) === null`, and the current model-packet blocker.
6. **Consumers**: exercise exact owner resolution, definition-plan/reconciliation presence, learning and projection owner reads, and Feature 007 incident correction. Reject the old complete-text and hybrid shapes.
7. **Complete-log safety**: use equal visible suffixes with different omitted prefixes and require different full digests and incident prestate.

No test writes either real ledger or any historical feature package.

### Actual host-adapter settlement regression

Extend `src/skills/dude-work/host-adapter.test.mjs` with one temporary-workspace integration that drives the existing `runHostAdapter`/adapter settlement path using actual structured Tester and Reviewer results. Let the production specialist-attestation and safety writer create trusted captures; do not fabricate `rawInputs.review`, `rawInputs.verification`, trusted capture bytes, or a raw Inspection.

Use two valid result pairs with materially different evidence sizes against the same oversized temporary owner log. At the fresh settlement boundary, assert:

- the Inspector rebuilt the packet after the captures were present;
- both packets remain within 65,536 bytes;
- the larger capture set admits a smaller or equal suffix and the smaller set admits a larger or equal suffix, with a strict difference in the selected fixture;
- each selected suffix is maximal; and
- the owner file remains byte-identical.

First prove that the end-to-end settlement route is structurally reachable from this test surface. If a production guard makes the requested terminal route unreachable, record that exact dominating boundary in the test and exercise the real reachable safety-writer/capture-to-fresh-Inspection boundary instead. Do not bypass the guard or fabricate downstream reachability.

### Integrated acceptance

Over one unchanged integrated revision:

1. Run focused recovery and host-adapter tests.
2. Run `scripts/current-format-contract.test.mjs`.
3. Run the full recursively discovered `*.test.mjs` suite using the project-standard discovery that excludes `dist`.
4. Run `node scripts/build-dev.mjs` twice and require the second run to be byte-idempotent; inspect intended `.github` parity.
5. Run `node .github/skills/dude-lint/lint.mjs .`.
6. Run compose verification, a pristine release build and release lint, and `git diff --check` under the existing bundle-change gate.
7. Inspect production source for one owner-log shape and no `coordinatorLog` compatibility parser, fixed reservation, config, archive, migration, compression, batch, store, or generic budgeting framework.
8. Recheck that both real oversized ledgers and all Feature 004/Feature 009 historical definition bytes are unchanged.
9. Route the same evidence and unchanged diff to an independent reviewer for packet safety, maximality, host-boundary reachability, incident binding, guidance honesty, and YAGNI compliance.

## Guardrail And Complexity Check

| Decision | Reachable need | Rejected alternative |
|---|---|---|
| Project only the model-facing owner-log body | Append-only log growth currently overflows the packet | Stored truncation, rotation, archive, migration, or compression |
| Fit against each complete fresh packet | Settlement changes the exact available capacity | Arbitrary 16 KiB budget, configuration, or speculative reservation |
| Array of whole dated events | The append-only convention already supplies stable event boundaries | General Markdown AST or summarizer |
| Complete digest and length inside the body | Omitted prose still needs an honest complete-log binding | Altering the generic EvidenceItem descriptor |
| One local validator and projector in `recovery.mjs` | All current production owner-log reads are in the same runtime | Generic renderer registry or budgeting framework |
| Reuse current descriptor-only overflow | Newest-event and non-owner overflow already have a safe result | Silent omission, metadata-only success, or multi-batch fallback |
| Reuse actual host capture path in integration | Settlement is where current evidence size changes | Fabricated trusted-capture fixture |
| Reject the old body | Current-only project policy and no production caller need compatibility | Dual shape or migration reader |

The design adds no state, configuration, service, cache, index, new packet phase, generic parser, or new runtime module.

## Build And Rollback Order

1. Add focused failing tests for the exact body, event boundaries, real large ledgers, maximality, overflows, consumers, and incident binding.
2. Implement the local parser, body validator, projection, and direct-consumer changes in `recovery.mjs`.
3. Pass focused recovery tests before changing guidance or generated output.
4. Add and pass the real host-adapter settlement regression.
5. Update current guidance and current-format contracts.
6. Run the development build once to refresh generated core, then prove a second build is idempotent.
7. Run integrated acceptance and independent review over the unchanged result.

Rollback requires no data migration or stored-log repair because production writes no owner ledger. Revert the authoritative source, tests, guidance, and contract changes, then run `build-dev` to restore generated core from source. Never roll back by editing `.github` or either oversized ledger.

## Objective Registry

None. This feature has no runtime evaluation objective that warrants a task-keyed registry; its outcomes are deterministic packet and integration checks.

## Supporting Artifacts

None. The core `spec.md`, `plan.md`, and `tasks.md` are sufficient. The exact body contract belongs in this plan and focused tests rather than a second schema artifact.

## Source Layout

Authoritative production source:

- `src/skills/dude-work/recovery.mjs`
- `src/skills/dude-work/SKILL.md`

Authoritative tests and static contract:

- `src/skills/dude-work/recovery.test.mjs`
- `src/skills/dude-work/host-adapter.test.mjs`
- `scripts/current-format-contract.test.mjs`

Current human-facing documentation:

- `docs/commands.md`
- `docs/reference.md`
- `docs/workflow.md`

Read-only regression evidence:

- `.dude/ideas/agent-orchestration-metadata.md`
- `.dude/ideas/remove-legacy-compatibility.md`
- `.dude/specs/004-pre-work-log-learning/**`
- `.dude/specs/009-autonomous-learning-governance/**`

Generated only through `node scripts/build-dev.mjs`:

- `.github/skills/dude-work/recovery.mjs`
- `.github/skills/dude-work/SKILL.md`

No production edit is expected in `host-adapter.mjs`, `host-adapter-runner.mjs`, or `specialist-attestation.mjs`.

## Phases

1. **Runtime projection and focused safety (T001@70726f6a)**: implement the exact body, parser, fresh-packet selection, direct consumers, incident binding, and focused regressions.
2. **Real settlement and bundle integration (T002@73657474)**: prove actual trusted-capture settlement, update honest current guidance and static contracts, and refresh generated core through `build-dev`.
3. **Integrated acceptance (T003@61637074)**: run the full repository and generated-output gates and obtain independent review without changing the revision or historical ledgers.

## Requirements And Success Traceability

| Specification coverage | Plan ownership | Canonical tasks |
|---|---|---|
| FR-001 through FR-008 / SC-001 through SC-007 | Exact body, whole-event parser, exact fresh-packet suffix selection, current overflow | T001@70726f6a, T002@73657474, T003@61637074 |
| FR-009 through FR-011 / SC-008, SC-009 | One exact parser, unchanged authority paths, complete-digest incident binding | T001@70726f6a, T003@61637074 |
| FR-012, FR-013 / SC-009 | Narrow supersession and honest current guidance without historical rewrites | T002@73657474, T003@61637074 |
| FR-014 / SC-003 through SC-010 | Real-ledger fixtures, actual settlement, generated parity, complete gates, independent review | T001@70726f6a, T002@73657474, T003@61637074 |

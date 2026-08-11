# Feature Specification: Bounded Owner Log Projection

## Purpose

Work Inspections currently admit the complete extracted Coordinator Log as owner evidence. Because that log is append-only, normal history growth can eventually consume the fixed model packet before a task starts or while fresh Tester and Reviewer evidence is added during settlement.

This feature keeps the stored owner ledger and Coordinator Log complete while replacing only the model-facing owner-log text with an honest bounded projection. Each fresh Inspection carries exact owner identity, binding metadata for the complete extracted log, and the largest chronological suffix of whole log events that fits beside the other evidence currently present.

The fixed packet limits remain 16 items and 65,536 bytes. No fixed owner-log allowance is introduced: the projection adapts to the exact current packet, keeps the newest event whenever admission is possible, and otherwise retains the existing descriptor-only fail-closed overflow behavior.

## Scope And Supersession

This feature supersedes only two affected current contracts:

1. Feature 004's requirement that admitted `owner-log` text contain the complete Coordinator Log without truncation is replaced by a complete-log-bound, whole-event suffix for that one evidence source. Feature 004's exact acquisition, ownership, packet ceiling, descriptor-only overflow, no-model-call, no batching, recovery, and safety requirements remain in force.
2. Feature 009's Feature 007 incident prestate binding is changed from the visible complete owner-log text to the complete-log digest carried by the new projection. Feature 009's verification, independent review, append-only history, projection, permit, receipt, correction, and audit requirements remain in force.

The historical Feature 004 and Feature 009 definition artifacts remain unchanged. No other evidence source is narrowed, and no claim is made that omitted owner-log events were inspected.

## User Scenarios & Testing

### User Story 1 - Inspect work with a growing append-only owner log (Priority: P1)

As a Work user, I want long owner history to fit honestly beside current evidence so that cumulative Coordinator Log growth does not prevent inspection while the complete stored history remains available to its existing owners.

**Why this priority**: This is the reachable continuity failure. Without a bounded owner projection, normal append-only growth can permanently block work that otherwise has valid evidence.

**Independent Test**: Inspect a small owner log and the two existing oversized owner ledgers, compare stored bytes before and after, and verify packet size, event coverage, owner identity, complete-log metadata, and the projected-body descriptor.

**Acceptance Scenarios**:

1. **Given** a small well-formed Coordinator Log whose events all fit, **When** an Inspection is built, **Then** every event is included in chronological order and the metadata reports zero omitted events.
2. **Given** the existing Feature 028 owner ledger or the existing 405-event owner ledger, **When** an Inspection is built, **Then** the packet remains within the fixed limits without changing either stored file.
3. **Given** a projected owner log, **When** its metadata is inspected, **Then** it identifies the exact owner, binds the complete extracted log, and reports total, included, omitted, and included-range facts that agree.
4. **Given** omitted historical events, **When** the packet is presented, **Then** it exposes the omission count and range and does not imply that omitted prose was inspected.
5. **Given** an admitted owner-log item, **When** its evidence descriptor is verified, **Then** that descriptor binds the complete projected body while the body separately binds the complete extracted log.

### User Story 2 - Recompute the largest safe suffix for fresh settlement evidence (Priority: P1)

As an autonomous Work user, I want each fresh Inspection to resize owner history around the exact Tester, Reviewer, and other evidence then present so that required current evidence is not displaced by an arbitrary reservation.

**Why this priority**: Settlement rebuilds the Inspection after trusted captures arrive. A static owner budget would either waste available capacity or still fail for a different evidence mix.

**Independent Test**: Drive actual settlement with structurally valid Tester and Reviewer results of different sizes and verify that each fresh Inspection selects its own exact suffix, stays within the ceiling, and is maximal.

**Acceptance Scenarios**:

1. **Given** two fresh Inspections with different current non-owner evidence, **When** each packet is built, **Then** the owner suffix is recomputed and may grow or shrink without changing stored history.
2. **Given** an admitted projected suffix, **When** the immediately preceding whole event is added, **Then** the exact complete packet crosses the byte ceiling.
3. **Given** one or more parsed events and enough packet capacity for the newest event, **When** a projection is admitted, **Then** the newest event is included.
4. **Given** complete-log metadata plus the newest whole event cannot fit with the other evidence, **When** Inspection is built, **Then** normal descriptor-only packet overflow occurs with no model call or success-shaped fallback.
5. **Given** non-owner evidence alone cannot fit, **When** Inspection is built, **Then** the existing descriptor-only overflow behavior occurs without omitting required evidence.

### User Story 3 - Preserve ownership, recovery, and incident safety (Priority: P1)

As a maintainer, I want every owner-log consumer to use one exact projection contract while deterministic ownership and complete-log safety bindings remain intact.

**Why this priority**: A bounded display is safe only if downstream consumers neither mistake the suffix for the complete log nor silently accept incompatible body shapes.

**Independent Test**: Exercise event parsing, owner resolution, definition reconciliation, learning presence, incident correction, and current guidance with the new shape; use logs that share a visible suffix but differ in omitted history to prove complete-log binding.

**Acceptance Scenarios**:

1. **Given** Unicode or multiline events, **When** a suffix boundary is selected, **Then** no event or Unicode scalar is split.
2. **Given** a well-formed older log with the Coordinator Log heading, blank lines, and managed comments, **When** events are counted, **Then** framing is excluded and only top-level dated event records count.
3. **Given** owner resolution or definition recovery, **When** the owner projection is bounded, **Then** identity still resolves from the exact owner relationship and definition recovery still uses its separate complete owner capture.
4. **Given** learning, current-run, review, or verification evidence, **When** owner projection changes, **Then** those structured authorities and their semantics remain unchanged.
5. **Given** two complete logs with the same visible suffix but different omitted prefixes, **When** incident prestate is derived, **Then** the complete-log bindings differ.
6. **Given** the superseded complete-text owner-log body, **When** a current direct consumer receives it, **Then** it is rejected rather than compatibility-parsed.

## Edge Cases

- A Coordinator Log contains no countable event, only its accepted heading, blank lines, or framing comments.
- A Coordinator Log contains exactly one event.
- All events fit, or exactly one oldest event must be omitted.
- The packet is exactly 65,536 bytes after projection.
- Adding the immediately preceding whole event produces byte 65,537 or later because the complete serialized packet, escaping, and descriptors are counted.
- An event contains non-ASCII Unicode, combining characters, emoji, embedded punctuation requiring escaping, or multiline continuation text.
- A top-level dated event is followed by indented bullets, paragraphs, or blank continuation lines.
- A managed marker or standalone framing comment appears before, after, or between event records.
- The newest event by itself is too large for the remaining packet.
- Complete-log metadata with an empty event set fits, but a real newest event does not; the real event is not silently dropped.
- Non-owner evidence exceeds the byte ceiling or available item count without any owner-log text.
- Trusted Tester or Reviewer evidence added during settlement causes fewer owner events to fit; a later smaller evidence mix permits more.
- Two complete logs have the same included suffix, length, and event counts but different omitted bytes.
- The visible suffix changes while the complete-log digest remains bound to the same unchanged stored section.
- Owner evidence is missing, malformed, stale, conflicting, nontext, or already beyond an existing acquisition limit.
- A current consumer receives the superseded complete-text body or a hybrid of old and new fields.

## Functional Requirements

- **FR-001:** The complete owner ledger and complete extracted Coordinator Log MUST remain stored and append-only. The feature MUST NOT truncate, rotate, rewrite, relocate, archive, compress, batch, or migrate stored history.
- **FR-002:** Every fresh Inspection MUST derive the model-facing owner-log projection from the complete extracted log and the exact other evidence present in that Inspection; no fixed owner-log byte allowance or reserved capacity MAY determine the result.
- **FR-003:** An admitted owner-log projection MUST carry exact owner identity plus the full lowercase SHA-256 digest and UTF-8 byte length of the complete extracted log, total, included, and omitted event counts, the included event ordinal range, and the included events.
- **FR-004:** Included events MUST form one chronological suffix of whole top-level dated Coordinator Log records. Continuation lines and Unicode scalars MUST remain intact, and accepted headings, blank framing, managed markers, and standalone framing comments MUST NOT count as events.
- **FR-005:** The selected suffix MUST be the largest suffix whose complete serialized packet, including the target, every currently admitted evidence item, escaping, and descriptors, fits the byte ceiling. If all events fit, none MAY be omitted.
- **FR-006:** When at least one event exists, every admitted owner projection MUST include the newest event. If complete-log metadata plus that event cannot fit, the Inspection MUST fail closed through the existing descriptor-only overflow behavior rather than omit the event.
- **FR-007:** The global packet limits MUST remain exactly 16 evidence items and 65,536 canonical bytes. If non-owner evidence alone cannot fit, existing overflow behavior MUST remain unchanged.
- **FR-008:** The owner-log EvidenceItem descriptor MUST bind the complete projected body. The complete stored-log binding MUST be carried inside that projected body and MUST NOT be substituted for the projected-body descriptor.
- **FR-009:** Every direct owner-log consumer MUST accept one exact current projection shape and MUST reject the superseded complete-text shape, a hybrid shape, unknown fields, inconsistent counts, or an invalid ordinal range. No compatibility or dual-shape parser MAY be added.
- **FR-010:** Deterministic owner resolution MUST continue to use exact idea/specification identity. Definition recovery MUST continue to use its separate complete owner-file capture, and learning, current-run, review, and verification authority MUST remain structured and unchanged.
- **FR-011:** Feature 007/Feature 009 incident prestate MUST bind the complete-log digest carried by the projection rather than the visible suffix, so different omitted history cannot share that safety binding merely because the visible suffix matches.
- **FR-012:** This feature MUST supersede only the affected current Feature 004 complete-owner-log packet clause and Feature 009 incident owner-log binding. All remaining fixed-ceiling, overflow, verification, review, append-only, ownership, correction, and audit requirements MUST remain in force, and historical definitions MUST remain unchanged.
- **FR-013:** Current human-facing and runtime guidance MUST describe the bounded suffix and complete-log metadata honestly and MUST NOT promise that the packet includes or inspects omitted owner-log prose.
- **FR-014:** Acceptance MUST exercise the two existing oversized owner ledgers without mutation, actual settlement through the production capture boundary, exact maximality, fail-closed overflow, every direct consumer, generated-output parity, complete repository verification, and independent review.

## Key Entities

- **Complete Coordinator Log**: The exact extracted `## Coordinator Log` section retained in the owner ledger, including its framing.
- **Coordinator Log Event**: One top-level dated append-only record plus all of its continuation lines.
- **Owner-Log Projection**: Exact owner identity, complete-log binding metadata, and one chronological suffix of whole events.
- **Complete-Log Binding**: The full lowercase SHA-256 digest and UTF-8 byte length of the complete extracted section, independent of which events are visible.
- **Included Ordinal Range**: The one-based first and last event positions represented by the suffix, or an empty range when no event exists.
- **Evidence Packet**: The canonical target and currently admitted evidence items subject to the fixed item and byte limits.
- **Fresh Inspection**: A newly acquired evidence set whose owner suffix is recomputed against the evidence present at that moment.

## Success Criteria

- **SC-001:** Every focused and integration fixture leaves the complete owner-ledger bytes unchanged; no test writes either oversized regression ledger.
- **SC-002:** For every small-log fixture, 100% of events are included in chronological order, included count equals total count, omitted count is zero, and the ordinal range is exact.
- **SC-003:** The current Feature 028 owner ledger and current 405-event owner ledger each produce a packet of at most 16 items and 65,536 bytes without stored-file changes.
- **SC-004:** Fresh settlement Inspections using two different valid Tester/Reviewer evidence sizes produce appropriately different exact suffixes when capacity differs, and every resulting packet remains within 65,536 bytes.
- **SC-005:** For every nonempty truncated projection accepted in maximality tests, adding exactly the immediately preceding whole event makes the complete canonical packet exceed 65,536 bytes.
- **SC-006:** Unicode, multiline, heading, blank-line, marker, and comment fixtures retain every included scalar and continuation line, split zero events, and count zero framing lines as events.
- **SC-007:** Oversized-newest-event and non-owner-only overflow fixtures return descriptor-only overflow, expose no model packet, make no model assessment, and produce no success-shaped fallback.
- **SC-008:** Owner resolution, definition reconciliation, learning presence, and incident-correction fixtures accept the new shape; incident prestate changes when omitted complete-log bytes change even if the visible suffix is identical.
- **SC-009:** Current source and guidance contain one production owner-log shape and no concrete compatibility path, while historical Feature 004, Feature 009, and oversized-ledger bytes remain unchanged.
- **SC-010:** Focused tests, actual host-boundary integration, the full recursively discovered suite, deterministic generated-output checks, Dude lint, and independent review all pass over one unchanged integrated revision.

## Assumptions

- Current owner ledgers remain below the existing individual workspace-file acquisition ceiling.
- Current and older well-formed Coordinator Logs use one accepted `## Coordinator Log` heading and top-level dated `- ...` event records; continuation lines belong to the preceding record.
- A log with no countable event may project complete-log metadata with an empty event list and an empty ordinal range.
- Existing exact owner frontmatter and complete owner-file capture remain sufficient for ownership and definition recovery.
- No current production authority path requires every historical owner-log prose event in the model packet.
- The fixed source-file bound makes one backward pass over current events proportionate; no index, cache, or persistent projection state is needed.

## Out Of Scope

- Changing the global packet ceiling, item limit, workspace acquisition limits, or any non-owner evidence contract.
- Stored-log truncation, rotation, rewriting, archival, compression, pagination, multi-batch analysis, summarization, or migration.
- A configurable budget, reserved owner allocation, generic packet-budgeting framework, renderer registry, cache, store, checkpoint, or cross-session state.
- A compatibility reader, dual body shape, historical feature rewrite, or mutation of an oversized regression ledger.

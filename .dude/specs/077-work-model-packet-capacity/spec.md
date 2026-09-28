# Feature Specification: Work Model Packet Capacity

**Owner:** `.dude/ideas/077-work-model-packet-capacity.md`

## Purpose And Scope

Let the existing Work caller carry its complete evidence through a fixed 262,144-byte model-packet budget. The locally retained 062 T004 incident needed a smallest packet of 132,430 bytes, exceeding the current 131,072-byte limit by 1,358 bytes despite working evidence sharing.

This feature has one outcome: revise that fixed capacity without changing evidence meaning, history, format, or authority. It includes directly affected checks, current guidance, and delivered copies. It does not authorize continuation of the stopped incident.

## User Scenarios & Testing

### US1 - Carry complete Work evidence within the revised bound (P1)

As a Work user, I need an otherwise eligible packet that exceeds the old bound but fits the revised bound to remain usable without removing evidence or weakening a stop.

Independent test: exercise complete canonical packets around the new byte boundary, replay the saved incident in isolation, and measure every fully known pending postimage. Check full evidence reconstruction, refusal state, and preserved earlier effects.

Acceptance scenarios:

1. Given otherwise admissible complete packets of 262,143 or 262,144 bytes, when Work checks packet capacity, then the byte check passes without relaxing any other gate.
2. Given evidence whose smallest permitted packet is 262,145 bytes, when Work projects it, then only the existing descriptor-only overflow report is available, with no model call or recovery.
3. Given a larger owner-log suffix now fits, when fresh inspection changes its evidence hash, then an Assessment bound to the old hash refuses as `evidence-drift` without spending counters or changing accepted state.
4. Given pending lane effects and receipts, when their fully known postimages are checked, then the same byte bound applies throughout. A later refusal preserves every earlier established write or receipt.

## Edge Cases

- The byte count includes the complete canonical packet and multibyte text, not just evidence payloads.
- A claimed admitted packet above the limit is invalid even if its caller supplies a matching-looking admission flag.
- Owner-log projection still selects only a maximal whole-event suffix; one oversized next event is not split, summarized, or omitted from stored history.
- Independent source, descriptor, attestation, event, or authority failures still refuse even when packet bytes fit.
- Old Assessments, failed historical outcomes, duplicate occurrences, and stopped invocation records do not become fresh authority because capacity increased.

## Functional Requirements

- **FR-001:** Work must enforce exactly 262,144 bytes for the entire canonical model packet, including its format, target, items, payloads, frames, descriptors, mappings, and other metadata.
- **FR-002:** Work must preserve `dude-work-model-view-v1` and the complete reconstructible admitted evidence, including original descriptors, hashes, trusted bindings, occurrence order, duplicates, and failed outcomes.
- **FR-003:** Owner-log projection must retain exact owner identity and complete-log digest, byte length, and event count while choosing the maximal whole-event suffix that fits the fresh packet; omitted owner events remain stored history, not inspected text.
- **FR-004:** If no permitted packet fits, Work must retain descriptor-only overflow, no model packet, no model call, and no recovery. A forged admitted over-limit packet must also refuse before model use.
- **FR-005:** Inspection, authoritative projection preparation, lane-permit admission, application, and receipt checks must use the same 262,144-byte bound, including every fully known lane-first and receipt postimage and existing fresh rechecks.
- **FR-006:** Capacity and stale-evidence refusals must preserve accepted state, accepted revision, attempt/recovery counters, pending entries, and completed tuples without a new task or lane write. Previously established effects and receipts remain intact; refusal does not imply whole-operation rollback.
- **FR-007:** Work must keep every other resource and authority limit unchanged, including 64 sources, 64 retained descriptors, derived item capacity 64, raw-body and transport bounds, attestation and event bounds, exact ownership, capture validation, independent review, and stop rules.
- **FR-008:** Current guidance and delivered copies must agree on the revised capacity without rewriting historical measurements, captured evidence, feature intent/history, or stopped invocation records.

## Key Entities

- **Model packet:** The bounded, self-contained evidence projection supplied for one model Assessment.
- **Inspection:** The authoritative evidence capture and hash, including complete-source bindings and the permitted owner-log suffix.
- **Known postimage:** The fully determined evidence after a pending lane effect or receipt, checked before the corresponding authority becomes usable.

## Success Criteria

- **SC-001:** Complete canonical packets at 262,143 and 262,144 bytes pass the byte gate; the first excess and forged admitted excess refuse. Boundary checks include packet overhead and multibyte content, preserve refusal state, and establish no model call on overflow.
- **SC-002:** Isolated replay of the saved incident yields complete-owner inspections with fresh hashes; old-hash authorization still refuses unchanged. The pending preparation and all six known lane-first/receipt postimages measure at most 262,144 bytes using the revised runtime. Exact reconstruction preserves every original occurrence, binding, and failed outcome.
- **SC-003:** Focused regression evidence confirms unchanged count/resource/authority gates, maximal whole-event owner suffix selection, the shared byte bound at projection/application/receipt, and preservation of both refusal prestate and earlier effects.
- **SC-004:** Current capacity statements and source/generated delivery agree. Historical measurements, immutable capture bytes and hash pins, original 062 state/history/orphan files, and unrelated user edits remain unchanged. Fresh checks report actual coverage; skips or zero matched tests do not establish acceptance.

## Assumptions And Exclusions

The supplied diagnosis establishes the existing blocker, not successful verification of this revision. Complete-owner postimages are expected near 165 KB and still require measurement. The larger fixed cap permits greater model-context demand; it does not promise unlimited history or prevent future capacity stops.

Existing guardrails suffice. There is no UI change, new format, compactor, pruning, splitting, configurable/adaptive budget, added state, or new execution capability. The stopped 062 Ship remains stopped; cleanup, retry, resume, and Git actions need separate authority. Windows `bd.cmd` fixture and POSIX coverage failures remain separate and unfixed.

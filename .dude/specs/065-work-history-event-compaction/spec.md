# Feature Specification: Work History Event Compaction

**Owner:** `.dude/ideas/065-work-history-event-compaction.md`  
**Spec path:** `.dude/specs/065-work-history-event-compaction/spec.md`

## Outcome And Scope

Reduce redundant event content in Work's model-facing task history and current-run history without losing evidence. Share only complete, byte-identical event bodies. Keep every original occurrence, its order and bindings, and the ability to reconstruct the original available evidence exactly.

This is one model-view extension of completed feature 064. It does not change authoritative history, capture, state, hash derivation, or resource limits. Distinct content and occurrence metadata still grow; there is no unlimited-growth promise.

Definition and later fixture simulations do not resume 062 or change 064. Historical session-transport hash attribution, browser/wheel behavior, unfinished browser acceptance, cleanup, and Ship restart are outside this feature. Add no summary, history cutoff, external lookup, store, cache, registry, workflow, or lane.

## User Scenarios & Testing

### US1 - Inspect repeated events without losing their occurrences (P1)

A Work user receives complete evidence even when the same event appears in both retained histories or in several captures.

Independent test: render a complete evidence set with exact repeats, distinct records containing the same event, and events differing in one substantive or binding field. Reconstruct the available evidence from the model view alone.

Acceptance: every original available body, descriptor, source occurrence, capture distinction, and order is recovered exactly. Similarity or a matching identifier never substitutes for complete byte equality.

### US2 - Retain the incident's full result and recovery growth (P1)

A maintainer can retain the measured incident's complete evidence and new growth during a reachable recovery episode through its actual failure settlement, without deleting earlier failures to make room.

Independent test: preserve the full retained 062 incident in a portable fixture, then exercise the corresponding supported path in a fresh, independently owned test context. Cover new bound captures and learning/event growth, both retained surfaces, all required receipts, the actual settlement, and the sealed-continuation refusals in SC-003.

Acceptance: the complete specified path fits the unchanged limits and shows measured net representation savings. Passing only the first reported 547-byte excess, omitting accumulated captures, or stopping before required effects does not pass.

### US3 - Keep honest refusals and finite capacity (P2)

A user still receives the existing refusal when evidence is invalid, authority is missing, or complete evidence genuinely exceeds a limit.

Independent test: use ineligible history shapes, inconsistent retained surfaces, an excessive known postimage, and newly acquired excessive evidence.

Acceptance: sharing does not repair evidence or grant authority. Known excess stops before affected writes; later excess preserves the accepted predecessor and all earlier writes and receipts.

## Key Entities

- **Event body:** the complete recorded event, including its identities and substantive fields. Sharing a body does not merge its appearances.
- **Occurrence:** an original evidence-source position or an ordered record within a capture. Equal bodies may belong to distinct occurrences.
- **Available projection:** the complete normalized evidence available to the existing model view, after only the existing allowed owner-log suffix selection. Raw sources remain separately authoritative.

## Functional Requirements

- **FR-001:** Share only complete, exact event bodies between the two specified history views. Retain all other content and all occurrences, including duplicate appearances and separate captures. Do not share by hash alone, similarity, or a reduced semantic representation.
- **FR-002:** Make each emitted model view self-contained and independently reversible to the original available projection, byte-for-byte, with identical descriptors, ordering, multiplicity, and authority/capture bindings. No reference may depend on an omitted source, another packet, or external evidence.
- **FR-003:** Leave complete machine Inspection evidence, acquired captures, append-only audits, state transitions, and source/evidence-hash derivation unchanged. Preserve the maximal whole-event owner-log suffix rule as the sole existing history-projection exception; task and current-run history gain no omission policy.
- **FR-004:** Use deterministic representation and exact accounting consistently at existing inspection, validation, model-delivery, and capacity boundaries. Charge all emitted content and framing, including sharing overhead and character escaping. A representation that costs at least as much as the existing form keeps that form.
- **FR-005:** Assess every fully known intermediate and complete post-write state using complete acquisition and all accumulated captures. Keep fresh prestate and authority checks at application. Earlier measurements cannot authorize unknown later growth or replace observed evidence.
- **FR-006:** Keep every current resource ceiling and admission obligation. Sharing cannot reduce acquired-source or original-descriptor demand, evade mandatory capture headroom, enlarge diagnostic output, or bundle unrelated evidence to avoid counting.
- **FR-007:** Meet SC-002 and SC-003 using the full retained incident, including contradictory and failed checks, prior learning/governance evidence, and both event surfaces. Demonstrate net bytes and complete-path fit rather than extrapolating from repeated-body totals.
- **FR-008:** Preserve existing treatment of unsupported or ineligible shapes and existing validation/refusal semantics. Retained-surface disagreement, stale evidence, wrong targets, and missing or invalid authority remain failures at their existing boundaries. A refused step grants no model call, accepted-state change, receipt, task completion, retry, or cleanup authority.

## Fixed Limits

These are unchanged ceilings, not new capabilities. Equality satisfies only the named budget; all other gates still apply.

| Resource | Ceiling |
| --- | ---: |
| Complete model-view bytes | 131,072 |
| Acquired source entries / original retained descriptors | 64 / 64 |
| Checks per attestation | 16 |
| Individual source / aggregate acquired bytes | 1,048,576 / 4,194,304 |
| Encoded request bytes | 6,291,456 |
| Diagnostic bytes | 8,192 |
| Structured graph depth / entries | 32 / 4,096 |

Physical model items remain bounded by available original occurrences, which remain bounded by original descriptors. Unavailable descriptors still count. The separate 999-entry idea inventory and all other existing limits also remain unchanged.

## Edge Cases

- Identical bodies appear more than once in a history, under distinct captures, or in a different order. Preserve the distinctions; do not turn sharing into deduplication or reconciliation.
- Event text contains quotes, backslashes, escaped control characters, or multibyte characters. History line framing and normalized body bytes must reconstruct exactly.
- Only one surface contains a new event, a body differs despite a matching identifier, or the available projection lacks a potential sharing source. Retain the unmatched evidence without inventing a counterpart.
- A body is empty, noncanonical, malformed, or outside the supported shape. Preserve its established treatment rather than silently normalizing it into a sharable event.
- An owner suffix changes, a measured prefix excludes a source, or evidence changes before application. Recompute a self-contained view without stale references or hidden omitted content.

## Success Criteria

- **SC-001:** An independent test-owned inverse reconstructs every available source body and descriptor exactly for the incident and focused edge cases. Ordered source occurrences and per-capture record sequences match; raw captures and canonical files remain unchanged by rendering. Repeated evaluation of identical selected inputs produces identical output.
- **SC-002:** Reproduce the supplied pre-change incident baseline with all retained inputs, then measure the actual new complete packets. Compare each history-bearing packet against the existing literal-history representation of the *same selected available projection*, including the same owner suffix and unchanged other sharing. The incident demonstrates a strict net byte reduction after all overhead; no percentage or savings amount is assumed. Also report actual maximal-suffix output sizes and suffix counts so restored owner evidence cannot be mistaken for worse compression or hidden savings.
- **SC-003:** In fresh disposable integration, retain the full incident and add genuinely new bound verification/review evidence, lint when required, and learning/governance and approach/finding event growth during a reachable recovery episode. Carry all prior captures and actual returned successors through both retained surfaces, every required receipt, and the episode's actual verification-failed settlement. Mere reinspection is not growth. Every acquisition, intermediate-surface, receipt, and settlement packet, including later growth within that episode, must fit the fixed limits and satisfy SC-001/SC-002. From the sealed failed successor, verify that direct re-review and the current supported resume route refuse without changing accepted-state bytes or earlier receipts, authorizing another attempt, closing a task, or granting cleanup authority. Do not reset state/phase, omit governance, or turn the failure into a pass. Report the failure terminal and any independently allowed fixture cleanup as observed, not as success or evidence-capacity failure. New fixture results remain synthetic assertions, not verdicts on 062.
- **SC-004:** History-bearing controls exercise actual 131,071/131,072/131,073-byte model views without lowering limits. Existing source/descriptor, capture, and other resource-boundary regressions continue to pass. Known excess refuses before affected writes; unknown later overflow retains descriptor-only reporting and no model call. Invalid or inconsistent evidence fails for its intended existing reason, with rejected-step prestate and earlier committed evidence preserved.

## Assumptions

The supplied forensic report establishes redundancy and a pre-change refusal, not savings or implementation feasibility for the new representation. The plan fixes the representation; later execution must establish SC-001 through SC-004.

Existing project and bundle guardrails apply. No new project-wide rule, UI design gate, or outcome-changing clarification is needed. Only this spec, its plan/tasks, and the selected idea transition belong to the definition package.

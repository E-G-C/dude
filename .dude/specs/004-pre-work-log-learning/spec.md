# Feature Specification: Pre-work Log Learning

## Purpose

Before starting or resuming a task, after a block or failure, and on explicit request, Dude inspects all available history exactly relevant to the identified task or feature before deciding what to do next.

"All available" means supported current-format evidence that can be exactly bound to the target; it does not mean invented or fuzzy-matched evidence. Optional exact-bound session history is used only when available; unavailable session history alone is not a blocker.

## User Stories & Testing

### User Story 1 - Inspect relevant history before acting (Priority: P1)

A user can trust Dude to learn from the exact feature or task history before work continues.

**Independent Test**: Exercise the public inspection path for start, resume, post-block, post-failure, task inspection, feature-only inspection, and tracked issues with absent, valid, or conflicting durable-task mappings, using an exact owner alongside unrelated valid defined ledgers and relevant, unrelated, duplicated, missing, malformed, and optional session evidence.

**Acceptance Scenarios**:

1. **Given** an exact task is starting, resuming, blocked, or failed, **When** Dude evaluates the next action, **Then** it first acquires and inspects every expected available source exactly related to that task and feature.
2. **Given** only an exact feature is identified, **When** inspection is requested, **Then** Dude returns a read-only report without authorizing recovery, consuming task counters, or mutating workflow state.

### User Story 2 - Use bounded opt-in recovery (Priority: P1)

A user can keep ordinary stop-on-block behavior or explicitly authorize guarded sequential recovery with independent limits.

**Independent Test**: Exercise ordinary work, zero or one optional feature selector and a rejected second selector, every finite/unlimited combination of overall and per-target recovery budgets, accepted and invalid `--parallel` values under the effective sequential policy, Lightweight task-key completion, mapped tracked pending authorization followed by issue-only completion and interruption, issue-only tracked pending authorization followed by issue-only completion, rejection of a tracked completion target that supplies `taskKey`, accepted interruption of every pending action, simultaneous budget exhaustion, authorization blockers, recoverable test, lint, and review failures, stale assessments, and repeated attempts.

**Acceptance Scenarios**:

1. **Given** ordinary work without `--recover-on-block`, **When** work blocks, **Then** Dude performs the post-block inspection, reports its finding, and stops without retrying or revising definition artifacts.
2. **Given** historical or current test, lint, or review failure evidence, **When** a matching repair is considered, **Then** the evidence remains eligible for `address-test` or `address-review` and does not automatically block the next matching repair authorization.
3. **Given** a repair attempt has a fresh verification or lint failure or review rejection, **When** completion is considered, **Then** completion stops and that result becomes evidence for a later recovery decision.
4. **Given** one ordinary or recovery attempt has been authorized, including a tracked pending target whose optional `taskKey` was verified during authorization, **When** completion or interruption is reported for the same canonical target, **Then** Lightweight completion uses exact `{specPath,lane:"lightweight",taskKey}`, while tracked completion uses exact `{specPath,lane:"tracked",issueId}` and selects either an issue-only or authorization-verified mapped pending target by `targetKey` using the exact same `specPath + issueId`; acceptance clears that one pending authorization, retains the charged counters without increment or refund, and records exactly one completed-attempt tuple. Any tracked completion target containing `taskKey` is conditionally forbidden and leaves state and counters unchanged.
5. **Given** any positive `--parallel` value, **When** the invocation is normalized, **Then** it is accepted only for compatibility, effective parallel capacity is one, and it grants no concurrent recovery authority.

### User Story 3 - Repair derived definitions without changing intent (Priority: P1)

A user can allow recovery of derived specification, plan, or task defects while preserving user intent, ownership, and history.

**Independent Test**: Compare unchanged-intent, changed-intent, expected-state drift, injected transaction failure, out-of-scope path, user-owned section drift, and tracked-definition fixtures.

**Acceptance Scenarios**:

1. **Given** unchanged user intent and a derived definition defect, **When** runtime recovery is authorized, **Then** the guarded transaction is limited to the exact owner ledger and its sibling `spec.md`, `plan.md`, and `tasks.md`, independently preserves the complete bytes of `## Idea`, `## Open Questions`, and `## Assumptions`, and applies one all-or-restored change against the expected prior state.
2. **Given** changed or ambiguous intent, a path outside the runtime recovery scope, changed user-owned section bytes, unsupported tracked definition recovery, or an unresolved identity, authority, reconciliation, approval, or external-dependency stop, **When** recovery is considered, **Then** Dude refuses before writes and identifies the required escalation.
3. **Given** an explicit definition workflow rather than runtime recovery, **When** supporting contracts materially require revision, **Then** the existing definition transaction may separately update `contracts/schemas.md` under its normal authority and validation gates.

### User Story 4 - Retain learning proportionally (Priority: P2)

A user receives useful learning without turning every observation into durable context or trusting caller-asserted owner state.

**Independent Test**: Classify transient, project-reusable, and broadly reusable findings, including duplicates, superseded knowledge, stale caller claims, destination collisions, and owner-inspected current state.

**Acceptance Scenarios**:

1. **Given** a finding needed only for the current attempt, **When** retention is assessed, **Then** it remains transient and creates no durable artifact.
2. **Given** reusable project or workflow learning, **When** retention is assessed, **Then** existing memory or skill owners inspect their current artifacts and collisions before accepting a concise, deduplicated proposal; caller assertions cannot establish ownership, absence, overlap, or write authority.

## Edge Cases

- A new task has no prior execution history.
- Authoritative history and a mirror contain the same event.
- Similar names exist under different canonical feature identities.
- A required source is missing, malformed, stale, or changes during acquisition.
- Optional session history is unavailable, unbound, stale, or bound to another target.
- A feature is identified without an individual task, or a tracked issue is identified before a durable task key exists or with a conflicting supplied key.
- Equal durable task keys occur under different canonical feature identities.
- A second feature selector is supplied, or a selector appears after flag parsing has begun.
- A positive `--parallel` value greater than one is accepted for compatibility but normalizes to effective capacity one; zero, signed, unsafe, `unlimited`, or symbolic values are invalid.
- Evidence contains exactly 16 items and its complete canonical serialized packet projection is exactly 65,536 bytes.
- Any available evidence item, including optional exact-bound session evidence, would exceed the item or complete-projection byte boundary.
- A canonical JSON CLI request is exactly 6,291,456 encoded bytes or contains encoded byte 6,291,457.
- A workspace file or individual decoded captured byte body is exactly 1,048,576 bytes or contains byte 1,048,577.
- Aggregate workspace and decoded captured evidence bodies total exactly 4,194,304 bytes or the next body byte would make the total 4,194,305.
- An inspection has exactly 64 total source entries or attempts source entry 65, and exactly 64 total retained evidence descriptors or attempts descriptor 65; members of every per-source array count toward the same totals.
- JSON at the CLI wire or a JSON captured-source boundary contains duplicate keys, insignificant whitespace, reordered keys, malformed UTF-8, or another noncanonical representation.
- A deterministic error response is exactly 8,192 UTF-8 bytes or would require byte 8,193.
- The single pending attempt completes or reports an exact-bound interruption. A mapped or issue-only tracked pending authorization is selected through the exact same issue-only completion target; a tracked completion target carrying `taskKey` is rejected with state unchanged, while Lightweight completion retains its task-key identity.
- Overall and per-task recovery limits are reached together.
- Historical or current test, lint, or review failure evidence exists before a matching repair authorization.
- An assessment was created from one inspection but evidence changes before authorization.
- A designated presentation-only field changes while substantive evidence is unchanged.
- Any substantive evidence changes, including a nested `id` or `summary`.
- A byte-bearing CLI request contains empty or nonempty canonical base64, malformed padding, whitespace, a nonstandard alphabet, or a noncanonical encoding.
- Expected definition state drifts, a staged runtime batch names a path outside the exact owner plus sibling `spec.md`, `plan.md`, and `tasks.md`, user-owned section bytes differ, or atomic application fails.
- Definition recovery is requested while tracked execution is active.
- A retention request claims current owner state, absence, overlap, or destination availability that owner inspection does not confirm.

## Functional Requirements

- **FR-001**: Dude MUST inspect exactly relevant history before every task start or resume, after every block or failure, and on explicit request; feature-only inspection, meaning no Lightweight task key or tracked issue is identified, MUST remain read-only. A tracked issue MUST remain an exact task target before a durable task key exists; when a key is present, its mapping MUST verify exactly. Every public inspection path MUST perform exact-owner acquisition and include the resulting owner-log evidence rather than accepting a caller-assembled owner result.
- **FR-002**: Deterministic acquisition MUST cover expected ownership, idea audit, canonical task and history, active-lane history, current-run outcomes, review, verification, and optional exact-bound session evidence; caller or model assertions MUST NOT establish relevance, availability, or authority.
- **FR-003**: Recovery MUST admit only the exact canonical serialized model-facing packet projection: canonical target identity plus every available evidence item, each with complete admitted text and descriptors. Every available evidence item, including optional exact-bound session evidence, MUST fit in one packet of at most 16 items and 65,536 bytes for that complete projection. Any available overflow MUST produce a descriptor-only read-only report, make no model call, refuse recovery, and MUST NOT be truncated or analyzed in multiple batches.
- **FR-004**: Authorization blockers MUST be distinguished from recoverable failure evidence. Exact identity or required-evidence failure, clarification or intent change, required approval, unavailable external dependency, safety or authority failure, reconciliation ambiguity, and unsupported tracked definition recovery MUST block authorization. Historical or current test, lint, and review failures MUST remain evidence eligible for `address-test` or `address-review` and MUST NOT automatically block the next matching repair authorization. A fresh verification or lint failure or review rejection MUST stop completion and become evidence for a later recovery decision.
- **FR-005**: Work MUST accept zero or one optional feature selector before flags, use it only for Lightweight disambiguation, and ignore it when Tracked Execution is active; a second selector or any selector after flags MUST be rejected. Ordinary work MUST stop on block. Only `--recover-on-block` MAY authorize recovery; the ordinary default max is 3, but `--until blocked` keeps its existing implicit max 25 when no explicit max is supplied; `--recovery-cycles <N|unlimited>` MUST default to 1. `--parallel <N>` MUST accept only positive ASCII safe integers for compatibility, but every accepted value MUST normalize to effective parallel capacity one, MUST grant no concurrent recovery authority, and MUST NOT be retained as requested authority in transient run state. Invalid or symbolic parallel values and recovery cycles without recovery opt-in MUST be rejected before mutation.
- **FR-006**: Authorization MUST charge each ordinary attempt once to the run total and each recovery attempt once to both the run total and the recovery total for its full canonical target identity. Recovery v1 MUST permit at most one pending authorization per invocation; another authorization MUST be refused until completion or interruption removes the existing authorization. A tracked pending Target MAY retain optional `taskKey` metadata only when authorization verified its exact mapping, but that metadata MUST NOT split authorization, counters, pending selection, or no-progress identity. Completion and interruption MUST select pending work by equality of `targetKey`. A Lightweight completion target MUST retain its exact `taskKey`; a tracked completion target MUST be exactly `{specPath,lane:"tracked",issueId}` and MUST reject any supplied `taskKey` as conditionally forbidden, with state and counters unchanged and without completion-time mapping verification or tracker acquisition. Every accepted completion or interruption MUST retain charged counters without increment or refund and append exactly one completed-attempt tuple.
- **FR-007**: Numeric budgets MUST remain independent, per-run recovery use MUST remain isolated by full canonical target identity, including feature path and lane-specific issue or task identity, so equal task keys in different features never share use; `unlimited` MUST remove only its numeric cap without bypassing authorization, dispatchability, or no-progress stops.
- **FR-008**: Every model Assessment used for authorization MUST carry the exact `evidenceHash` of the Inspection it assessed. Authorization MUST freshly recompute Inspection, require exact Assessment `evidenceHash` equality, and return `evidence-drift` with unchanged state and counters when they differ. A completed recovery attempt MUST record exactly `{evidenceHash,approachHash,resultHash}` with no target field and only after action-bound completion; until then, its exact authorization MUST retain the validated canonical action and material inputs. Designated source-specific presentation-only changes MUST preserve evidence identity, while every substantive change, including nested `id` or `summary` changes, MUST change it. Substantively repeated evidence and approach or evidence and result MUST stop further recovery.
- **FR-009**: Recovery findings MUST report the inspected evidence, diagnosis, proposed action, outcome or stop reason, and next permitted action without presenting recovery as guaranteed success.
- **FR-010**: Runtime unchanged-intent definition recovery MUST resolve one exact owner and limit its guarded batch to that owner ledger plus the sibling `spec.md`, `plan.md`, and `tasks.md`. It MUST independently compare and preserve the complete pre-image bytes of the owner’s `## Idea`, `## Open Questions`, and `## Assumptions`; any mismatch or out-of-scope path MUST refuse before writes. Explicit definition may separately update `contracts/schemas.md` through the normal definition transaction. Failure MUST leave prior artifacts unchanged and create no partial new artifact. Tracked definition recovery is unsupported in v1 and MUST be refused only after fresh inspection and assessment validation but before any helper or write path.
- **FR-011**: Findings MUST be retained as transient context, project memory, or skill learning according to reuse value. Durable retention MUST pass through existing owners, which MUST inspect current artifacts, duplicates, overlaps, and destinations themselves; caller or model assertions MUST NOT establish current owner state, absence, collision freedom, or write authority.
- **FR-012**: Exact acquisition, source-envelope validation, canonical base64 CLI decoding, hashing, limits, blockers, counters, and transitions MUST be deterministic. At the JSON CLI wire and every captured-source boundary whose contract declares JSON, accepted bytes MUST already be duplicate-key-free canonical JSON; duplicate keys, insignificant whitespace, reordered keys, malformed UTF-8, and alternate representations MUST be refused rather than normalized. This requirement MUST NOT alter non-JSON evidence bodies. Model reasoning MUST be limited to semantic diagnosis, intent assessment, proposals, and retention advice using concise prompts. The feature MUST create no new lane, live board, authority, persisted run state, generic JSON parser framework, generic wrapper registry, or additional top-level record.
- **FR-013**: Before unbounded allocation or source processing, Dude MUST enforce fixed non-configurable ceilings of 6,291,456 encoded bytes for the complete CLI request, 1,048,576 bytes for each workspace file or individual captured byte body, 4,194,304 aggregate decoded evidence-body bytes per inspection, 64 total source entries per inspection, 64 total retained evidence descriptors per inspection, and 8,192 UTF-8 bytes for deterministic valid error JSON. Every exact ceiling MUST be accepted when all other requirements hold; encoded or body byte `limit + 1`, source entry 65, descriptor 65, or error byte 8,193 MUST be refused before further allocation, processing, retention, or output. These ceilings MUST remain separate from the model packet’s existing maximum of 16 items and 65,536 canonical UTF-8 bytes.

## Success Criteria

- **SC-001**: In 100% of start, resume, post-block, post-failure, and explicit-request fixtures, inspection finishes or reports a blocking exact-identity or required-source problem before further execution.
- **SC-002**: Expected-source fixtures, including tracked issue targets before durable mapping exists and tracked targets with supplied mappings, acquire all and only exactly bound evidence; every supplied mapping verifies exactly, the omitted-versus-supplied verified tracked `taskKey` same-hash fixture produces the same evidence identity and hash and therefore cannot evade no-progress, unrelated or fuzzy-matched records never enter the inspection, and unavailable optional session history alone never blocks it. A fixture invoking the public inspection path with the exact owner and unrelated valid defined ledgers acquires only the exact owner-log evidence and does not depend on a pre-normalized private owner result.
- **SC-003**: Boundary fixtures apply the limit to the exact canonical serialized model-facing packet projection containing canonical target identity plus every available evidence item, including optional exact-bound session evidence, with complete admitted text and descriptors: 16 items and 65,536 bytes are accepted only when that complete projection fits; item 17 or byte 65,537 produces a descriptor-only read-only report, makes no model call, refuses recovery, and performs no truncation or multi-batch analysis.
- **SC-004**: Ordinary, recovery, interrupted, simultaneous-cap, multi-target-over-time, finite, unlimited, and equal-task-key-across-feature fixtures produce exact canonical-target counter values with no attempt counted twice. Pending authorization count never exceeds one; accepted positive `--parallel` values produce the same effective `policy.parallel: 1`, state authority, and sequential behavior as `--parallel 1`. A mapped tracked pending authorization completes and interrupts through an issue-only completion target carrying the exact same `specPath + issueId`; an issue-only tracked pending authorization completes through that same issue-only shape; and any tracked completion target carrying `taskKey` rejects with byte-equivalent state and unchanged counters without a mapping witness or tracker call. Lightweight completion continues to use its exact task-key identity. Optional authorization-verified tracked mapping metadata cannot split counters, pending selection, or no-progress identity, and every accepted interruption clears the same pending entry without reporting successful task completion.
- **SC-005**: Every true authorization blocker refuses authorization with both budgets set to `unlimited`; every historical or current test, lint, or review failure remains eligible for matching `address-test` or `address-review`, while each fresh verification or lint failure or review rejection stops completion and enters later recovery evidence.
- **SC-006**: Every authorization assessment exactly matches the freshly recomputed Inspection `evidenceHash`; stale advice returns `evidence-drift` with byte-equivalent state and unchanged counters. No completed-attempt tuple exists before action-bound completion; each concrete result is accepted only by the stored action and route normalizer for the exact pending authorization. Every completed tuple is exactly `{evidenceHash,approachHash,resultHash}`, and designated presentation-only changes cannot create a new evidence identity while any substantive change does.
- **SC-007**: Every accepted runtime definition recovery names exactly the resolved owner ledger and sibling `spec.md`, `plan.md`, and `tasks.md`, independently preserves the complete bytes of `## Idea`, `## Open Questions`, and `## Assumptions`, and preserves applicable identity, state, and history atomically. Out-of-scope paths, user-owned byte drift, expected-state drift, and injected failures leave prior artifacts unchanged and no partial new artifacts; tracked fixtures inspect first and perform zero writes.
- **SC-008**: Every feature-only inspection returns a report while leaving counters, task state, definition artifacts, memory, and trackers unchanged.
- **SC-009**: Transient, memory, and skill fixtures route to the expected retention level with no contradictory duplicate. Stale or false caller claims about owner state, overlap, or destination availability cannot bypass fresh owner inspection, and all admitted model-facing packets and prompts satisfy their deterministic limits.
- **SC-010**: Boundary fixtures accept an otherwise valid 6,291,456-byte encoded CLI request, 1,048,576-byte workspace or captured body, 4,194,304-byte aggregate decoded evidence set, 64 total source entries, 64 total retained descriptors, and 8,192-byte valid error JSON. The corresponding `+1` fixtures refuse before excess buffering, body processing, aggregate retention, descriptor retention, or output. Duplicate-key, whitespace-varied, and reordered-key JSON fixtures fail at the applicable wire or captured-source boundary, while non-JSON evidence remains unaffected. The separate 16-item and 65,536-byte model-packet boundaries retain their existing exact acceptance and overflow behavior.

## Assumptions

- Supported evidence comes from authoritative current-format workflow surfaces; an absent event may be valid, but failure to acquire a required source is blocking.
- The active execution lane determines authoritative execution history; mirrors do not become a second authority.
- Semantic diagnosis and unchanged-intent assessment remain model judgments enforced by deterministic guards and existing independent review.
- Run counters and pending or completed attempt tracking are transient to one invocation; durable work history remains eligible evidence in later runs.
- Inspection and reporting do not consume an attempt; authorization performs the sole counter transition.
- `evidenceHash` binds both canonical target identity and the admitted evidence used for the completed attempt.
- The canonical serialized model-facing packet projection is the byte-limit basis; 65,536 bytes is not a body-text subtotal.
- Recovery v1 is sequential: `RunState.policy.parallel` remains present for compatibility but is always the literal safe integer `1`, and `pending` contains zero or one entry.
- Model advice is produced from one Inspection and carries that Inspection’s `evidenceHash`; authorization treats freshly recomputed mismatch as drift rather than authority.
- Presentation exclusion is limited to the fixed source-specific presentation envelopes; no recursive field-name stripping occurs inside substantive evidence.
- Runtime definition recovery has a narrower artifact scope than explicit definition and cannot update `contracts/schemas.md`.
- Durable retention proposals remain advisory until the existing owner freshly inspects its authoritative state.
- Resource accounting counts each workspace file’s raw bytes and each captured body’s decoded bytes once before normalization or deduplication. Source-entry and retained-descriptor limits are aggregate per inspection, not separate limits for each source.
- The fixed ingress, acquisition, descriptor, and error ceilings do not replace or reduce the separate 16-item and 65,536-byte canonical model-packet limits.

## Out of Scope

- Guaranteeing that recovery resolves every blocker.
- Autonomously changing or resolving ambiguous user-owned intent.
- Tracked definition recovery in v1.
- Truncating evidence, multi-batch model analysis, or model analysis of any available overflow.
- Bypassing fresh completion gates or treating historical test, lint, or review failures as permanent authorization blockers.
- Creating a new workflow lane, tracker, live board, hidden learning store, generic source registry, or persisted recovery state.
- Migrating or interpreting retired Dude state.
- Concurrent or multi-pending recovery authorization in v1, even when `--parallel` is accepted.
- A generic presentation-wrapper registry or recursive removal of fields named `id`, `summary`, `timestamp`, or `rationale`.
- Runtime recovery mutation of `contracts/schemas.md` or any path outside the exact owner ledger and sibling `spec.md`, `plan.md`, and `tasks.md`.
- Trusting caller-supplied retention ownership, overlap, destination, or absence assertions.
- Configurable resource policies, limit objects, registries, manifests, or persisted limit state.
- A generic JSON parser or canonicalization framework beyond strict validation at the bounded CLI wire and declared JSON captured-source boundaries.
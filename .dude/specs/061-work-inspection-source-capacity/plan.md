# Implementation Plan: Work Inspection Source Capacity

**Specification:** `.dude/specs/061-work-inspection-source-capacity/spec.md`  
**Date basis:** 2026-09-15T10:09:21Z

## Technical Context

**Language/Version:** JavaScript ESM, `// @ts-check`, Node.js 20+; coordinator reproduction on Node 26.8.1  
**Primary Dependencies:** Node built-ins and existing Work, identity, attestation, and lane helpers  
**Storage:** Existing transient RunState and canonical lane surfaces; no new persisted data  
**Testing:** `node:test`, CLI boundary tests, production host-adapter fixtures, scoped generated-output comparison  
**Target Platform:** Supported local macOS, Linux, and Windows workspaces  
**Project Type:** Dependency-free coordination runtime and generated bundle  
**Performance Goals:** At most 999 retained direct-entry candidates; stop on entry 1,000 before bodies; retain all existing byte and packet ceilings  
**Constraints:** Non-rendered repair; no new dependencies, commands, configuration, state versions, reservations, or objective machinery

## Definition Basis

The spec was written and checked before this plan: prioritized independent scenarios, numbered requirements, entities, boundary criteria, and exclusions are present; no clarification marker remains. This document check is not coordinator lint or independent acceptance.

The coordinator's fresh, read-only reproduction against `.dude/specs/062-dude-canvas-workspace-integration/spec.md`, task `T001@a062c1d4`, failed with empty streams at 63 ideas. The earlier 60-idea control passed at `60 + 2 + 1 = 63`, then failed at 65 after valid verification/review. Source reading confirms that `assertSourceEntryLimit`, `readDirectIdeas`, and `collectEvidenceInternal` charge every inventory entry although normalization emits one owner item. This establishes the accounting defect without another live Work attempt.

The following are definition-owner technical choices for the three historical questions, not user-supplied answers.

## 1. Separate Inventory Acquisition From Evidence Entries

Change the existing accounting chokepoints in `src/skills/dude-work/recovery.mjs` (FR-001/002/004/005).

Use a fixed inventory ceiling of 999, because a canonical lifecycle can contain at most that many numbered ideas. Keep streamed enumeration, including unsupported children. At the 1,000th non-null directory result, refuse before reading its name, retaining it, classifying candidates, opening bodies, or reading later entries; close the directory without masking the refusal. Apply the same length guard to raw `directIdeas` before traversing entries. Complete enumeration and all eligible bodies/ownership diagnostics still precede acceptance.

For source accounting, absent arrays have length zero:

```text
S = 3 + autonomousPlan + trackedIssueCount
      + currentRun.length + verification.length + review.length + lint.length
      + suppliedSession
```

The three base slots are owner-log, task-history, and lane-history; the two indicators are zero or one. Preserve tracked acquisition charges. Thus empty-stream Lightweight inspection costs 3 guarded or 4 autonomous slots, regardless of 60, 63, or 999 ideas; all five supplied stream classes with one entry each cost 9 autonomous slots.

Keep the source limit at 64 and count before capture access, decoding, parsing, or deduplication. Share the rule across raw collection, acquisition, and transport preflight. All inventory bodies, tasks, autonomous plan/spec bodies, and captures still pay existing individual/aggregate byte charges exactly once. Do not alter normalization, complete-log bindings, suffix selection, race checks, or packet projection.

## 2. Derive Completion Headroom At Authorization

Pass only call-local counts to the shared `authorizeInspectedAttempt` path used by raw `authorizeAttempt` and CLI `authorize`. After existing eligibility/authority/drift/learning/budget gates, but before constructing counter, pending, or permit-consumption successors, check the minimum next-completion entry demand (FR-003/007/008).

The current callers determine the rule:

| Completion path | Additional source demand |
| --- | --- |
| Autonomous | One new verification and one new independent-review capture per attempt; one lint capture when `requiredChecksForAction[action]` includes lint; one current-run slot only if none exists |
| Guarded | Zero new inspection captures: `recordAttemptResult` uses `completeAttempt`'s inline checks. Keep that exact action-check contract and the lane's review obligations |
| Session | No absent-session reservation: no current completion caller requires or emits it. A supplied session already costs one slot |

For autonomous attempts, `H = 2 + requiresLint + (currentRun.length === 0 ? 1 : 0)`; require `S + H <= 64`. `specialistAttestation` creates the pair and optional lint; the runner retains prior pairs in `observedStreams`, so reserve a new pair even when those classes are populated. The runner already repacks complete current-run records into one capture; do not change that mechanism or coalesce supplied results.

Also check the projected 16-model-item count. Derive deltas from the fresh normalized Inspection: replacing a present empty `[]` placeholder with its first capture adds no item; appending a fresh result to a populated class adds one. Existing missing-required-source gates still win. Assume no deduplication of future specialist results. Preserve the 64-descriptor acquisition guard; add no separate descriptor-headroom mechanism, since the model-item bound already dominates it at eligible authorization.

This is minimum entry admission, not a byte reservation or a guarantee about later optional captures. Every completion/projection acquisition still checks actual bytes and recomputes the owner suffix. Guarded completion emits no new captures merely to satisfy this repair. The unsupported ordinary definition-reconciliation attestation route remains unsupported.

## 3. Carry Only Runtime-Owned Capacity Diagnostics

Use a private-branded `TypeError` at existing acquisition resource guards, with one bounded diagnostic projection (FR-006/007). Keep its construction private; expose only the reader/validator needed by the host caller:

```text
capacity = {budget, limit, required, source, target}
```

`budget` is exactly one of `idea-inventory-entries`, `source-entries`, `source-body-bytes`, `inspection-body-bytes`, `cli-request-bytes`, `retained-descriptors`, or `model-packet-items`. `limit` must equal the corresponding fixed ceiling. `required` is a safe integer giving measured/projected demand, or the first-crossing lower bound where acquisition stops. `source` is an existing source category or the fixed `.dude/ideas`, `definition-spec`, `cli-request`, or `model-packet` subject, never an unchecked filename. `target` is the exact validated canonical target, or null before one can be established. Bound the complete diagnostic by the existing error ceiling; never truncate an identity into a different valid identity.

- Direct acquisition still throws a capacity `TypeError`. CLI failure keeps stdout empty, exit 1, and exactly `{error:{code,message}}` on stderr. `fixedCliError` recognizes only the private brand; `boundedErrorJson` emits code `recovery-resource-limit` and fixed-template prose containing budget, demand/limit, source, safe target, and next action. Never promote a matching error message or `.code` lookalike into trusted details.
- Headroom refusal keeps `{inspection,authorization}`; authorization is exactly `{authorized:false,reason:"evidence-incomplete",state,blocker,capacity}`. The blocker binds the fresh Inspection hash and a bounded capacity subject. All other authorization shapes stay unchanged.
- In `host-adapter.mjs`, preserve that diagnostic from authorization or recognized acquisition failure instead of converting it to `runtime-threw`. Admit optional `capacity` only on a matching `evidence-incomplete` hard-stop result, not in session/RunState/checkpoint data. For injected runtime ports, rederive the refusal from the exact frozen request through the existing runtime-result authority check before trusting it; preserve the existing no-effect proof boundary. Unverifiable effects and unknown exceptions retain their existing hard stops and sanitization, not capacity attribution or automatic correction.
- `host-adapter-runner.mjs` carries the diagnostic through `recordStep` and `finish`, including initial inspection failure before adapter creation. Reuse the resolved halt fields with reason `evidence-incomplete`, class `hard-stop`, the bound target, and a budget/source/demand subject. The sole report extension permits `evidenceHash: null` for a recognized pre-Inspection capacity failure; never borrow an older hash. Without an established target, retain an unresolved report alongside the bounded diagnostic.

The fixed next-action prose asks the source owner to correct the input within existing limits before fresh inspection, retaining required evidence and inventory. Keep the existing `request-human-input` halt action; this grants no cleanup, continuation, or budget increase. Ordinary packet-byte overflow remains descriptor-only with `overflow: true` and `modelPacket(inspection) === null`; do not replace that established mechanism with exceptions.

## One Repair And Verification Phase

Deliver one cohesive task. Separating accounting, admission, and reporting would leave Work able to dispatch attempts it still cannot finish or diagnose. Tests and generated delivery belong to that same repair, not separate layer tasks.

Extend `recovery.test.mjs` and `host-adapter.test.mjs`; retain attestation and lane regressions:

| Criteria | Required proof |
| --- | --- |
| SC-001/002 | Historical 60-plus-pair control; 63 and 999 small canonical ideas; late duplicate owner; 999/1,000 directory and raw boundaries; mixed/unsupported-only stream traps and close-failure precedence |
| SC-002/003 | Source 64/65 before body access/copy/read; descriptor 64/65; packet items 16/17 and bytes 131,072/131,073; individual, aggregate, CLI, transport, deduplication, malformed, symlink, unreadable, and race boundaries under both policies |
| SC-004 | With current-run present and no lint requirement, source totals 62/63 plus two new results admit/refuse at 64/65. Populated verification/review with model counts 14/15 similarly admit/refuse at 16/17. Cover empty placeholders, lint-required actions, prior pairs, optional sessions, and unchanged state/counters/pending with zero dispatch/lane calls |
| SC-005/006 | Exact CLI/host shapes, forged/secret-bearing exceptions, initial and post-result refusals, and byte-identical preimages; valid production completion through capture, dual projection, settlement, audit, and receipt in a disposable realistic workspace |

Update inventory-consuming-64 test expectations intentionally to 999/1,000; keep the separate source 64/65 tests and before-body traps. No weakened bounds or skipped assertions.

Read-only verification against actual 062 uses its exact task above and valid fixture streams for all five classes, with before/after idea/spec/tasks/task-state hashes. Preserve genuine blockers and never submit these captures for authorization or represent them as real 062 results.

Run fresh focused suites, including `node --test src/skills/dude-work/*.test.mjs scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs`, plus affected existing identity/lane regressions. No full UI/browser work is needed. Correct the directly related budget passage in `docs/commands.md`, including its stale 65,536 packet-byte value, and the applicable Work skill guidance; do not rewrite historical definitions.

## Lightweight Bootstrap And Output Safety

After first-definition publication and coordinator zero-failure lint, the coordinator uses normal **non-Work Lightweight Execution** for `T001@61c8a4e2`. The supplied exact no-database Beads result supports that lane; do not invoke Work to admit its own repair, import Beads, or revive/clean an old claim. Require fresh Tester evidence and an independent Reviewer before coordinator close, with normal ownership, state, and lint gates.

Edit authoritative core only in `src/skills/dude-work/` and docs directly. Generate with the existing `node scripts/build-dev.mjs --repo <temporary-fixture>` in isolated filesystem copies of the required source, builder, and manifest inputs. Compare pre/post source-derived output there; apply only verified repair-owned changed core outputs after checking live preimages. Stop on an overlapping user edit rather than overwriting it. Do not run the full builder against the live root.

Preserve dirty `.dude/backlog*`, memory/guardrails, 062/063 packages, frozen 062 mock, `.github/instructions/dude.instructions.md` user prose, and the Fluent UI specialist's model edit. Report scoped generated parity and pre-existing exclusions, never whole-tree parity. No reset, stash, branch, worktree, commit, push, or release. No supporting artifacts or ObjectiveRegistry are needed. Remaining risks are future byte growth and output collisions; neither warrants a new capability.

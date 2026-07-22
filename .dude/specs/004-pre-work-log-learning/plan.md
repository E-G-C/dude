# Implementation Plan: Pre-work Log Learning

## Summary

Add deterministic, exact-target history inspection and explicit bounded sequential recovery to `@dude work` without creating a lane, board, authority, or persisted recovery state. Ordinary work continues to stop on block; only `--recover-on-block` enables recovery. Exact feature-only inspection is always read-only.

Recovery v1 permits at most one pending authorization per invocation. `--parallel <positive-ASCII-safe-integer>` remains accepted for compatibility and optional host warnings, but `parseInvocation` always returns effective `policy.parallel: 1`; the requested value grants no authority and is not persisted in `RunState`.

Keep implementation to exactly three modules: the recovery runtime in `dude-work`, one captured-Beads normalizer in the existing pack, and one mechanical atomic file-batch helper. Existing execution, definition/reconciliation, retention, verification, review, build, and release owners remain in force.

`contracts/schemas.md` is the sole exact field authority for the six records `Target`, `EvidenceItem`, `Inspection`, `Assessment`, `Blocker`, and `RunState`. Fixed source-specific presentation envelopes, the canonical CLI byte envelope, pending entries, and completed tuples are nested value shapes, not additional records.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`  
**Primary Dependencies**: Node standard library; existing exact-owner and canonical-task helpers; optional installed Beads pack  
**Storage**: No new persisted state; counters, pending attempts, and completed tuples remain transient to one invocation  
**Testing**: `node:test`, table fixtures, captured lane evidence, filesystem fault injection, prompt-contract tests, build projections, full discovered suite, Tester, and Code Reviewer  
**Target Platform**: Cross-platform local Dude workspaces with Lightweight or optional Beads-tracked execution  
**Project Type**: Reusable coordination workflow with deterministic read-only CLI and mechanical file helper  
**Performance Goals**: Bounded streaming reads and linear validation, hashing, ordering, and deduplication under fixed ingress ceilings; one packet remains limited separately to 16 items and 65,536 canonical UTF-8 bytes  
**Constraints**: Exact current-format identity; exactly three modules, six top-level records, and one packet; sequential recovery with at most one pending authorization; six fixed module-local resource constants in the existing recovery runtime; canonical base64 transport and duplicate-free canonical JSON at wire and declared captured-source boundaries; fixed non-recursive source presentation envelopes; no configurable limit subsystem, generic parser framework, runtime write, spawn, tracker invocation, model call, fuzzy matching, persisted recovery state, multi-batch analysis, generic wrapper registry, or new authority

## Spec Quality Validation

- The specification keeps user outcomes and policy separate from implementation mechanics.
- Prioritized stories are independently testable across inspection, recovery, definition repair, and retention.
- Requirements define deterministic boundaries, authority, budgets, stops, and measurable outcomes.
- Edge cases cover missing evidence, overflow, interruption, no progress, byte drift, and tracked refusal.
- Success criteria are measurable without prescribing an implementation structure.
- User intent and command choices are settled.

The specification passed its quality gate before planning. Definition readiness still depends on coordinator-applied staging and a zero-failure Dude lint result.

## Guardrail Check

- Use exactly the three justified implementation modules and their companion tests.
- Keep deterministic parsing, acquisition, hashing, limits, blockers, and transitions in scripts.
- Reserve model judgment for the schema-bound `Assessment`; it never establishes authority or performs mutation.
- Preserve exact owner resolution, active-lane authority, coordinator-only execution mutation, and independent review.
- Keep `src/` authoritative and regenerate core `.github/` files only through `build-dev`.
- Keep `dude-work` as the detailed prompt owner and all other prompt surfaces terse.
- Add no supporting definition artifact beyond the compact `contracts/schemas.md`.

No new durable guardrail is proposed; the existing anti-overengineering guardrail directly governs this design.

## Fixed Resource Contract And Enforcement Order

Define only these module-local constants in `src/skills/dude-work/recovery.mjs`:

```text
MAX_CLI_REQUEST_BYTES = 6_291_456
MAX_SOURCE_BODY_BYTES = 1_048_576
MAX_INSPECTION_BODY_BYTES = 4_194_304
MAX_SOURCE_ENTRIES = 64
MAX_RETAINED_DESCRIPTORS = 64
MAX_ERROR_JSON_BYTES = 8_192
```

Keep the separate model constants at 16 items and 65,536 bytes. Do not collect any ceiling into a policy, options object, registry, manifest, additional record, or persisted state.

Enforce limits in this exact order:

1. Read CLI stdin as raw encoded bytes. Buffer at most 6,291,456 bytes; as soon as incoming length proves encoded byte 6,291,457 exists, stop consuming input, retain none of the excess, and return the bounded resource error.
2. Strictly decode the bounded request as UTF-8, parse one JSON value, validate the JSON value domain, canonicalize it with the existing canonical serializer, and require byte-for-byte equality with the original request. This rejects duplicate object keys, insignificant whitespace, reordered keys, malformed UTF-8, and alternate JSON spellings without introducing another parser framework.
3. Validate the closed request shape and compute one aggregate source-entry count before decoding captured bodies or reading workspace-file bodies. Every member of every per-source array contributes to the same total; source entry 65 refuses before its body is decoded, read, or processed.
4. Acquire workspace files and decode captures in canonical source order. Each body reader enforces both the 1,048,576-byte individual ceiling and the remaining aggregate allowance. Exactly 1,048,576 body bytes are accepted; observing body byte 1,048,577 refuses immediately. For canonical base64, derive decoded length before allocation and refuse an oversized body without decoding it.
5. Charge every accepted workspace body’s raw byte length and every captured body’s decoded byte length once before JSON validation, normalization, or deduplication. Keep the aggregate at or below 4,194,304; the byte that would produce 4,194,305 is observed only to refuse and is never added to the aggregate or retained for processing. If the same byte crosses both body and aggregate ceilings, the individual-body refusal has precedence.
6. For tracked list/detail/history and current-run, review, verification, and lint JSON captures, apply the same strict UTF-8 parse and canonical byte-equality check before source-specific normalization. Session text and Markdown workspace files are not treated as JSON.
7. Count retained evidence descriptors after source normalization and exact duplicate collapse but before packet construction. Descriptor 64 is accepted; descriptor 65 refuses before append and produces no partial authoritative Inspection or model call.
8. Apply the existing model-packet admission separately: at most 16 available items and at most 65,536 canonical UTF-8 bytes. Its descriptor-only overflow behavior remains unchanged when no earlier resource ceiling failed.
9. Serialize every CLI error canonically as exactly `{"error":{"code":code,"message":message}}`. `code` is an implementation-owned ASCII token matching `^[a-z0-9-]{1,64}$`; no stack, input echo, or additional field is emitted. If canonical output would exceed 8,192 UTF-8 bytes, replace `message` with the longest whole-Unicode-scalar prefix that fits with the ASCII suffix `...`. Exactly 8,192 bytes is allowed; byte 8,193 is never emitted.

## Architecture

### 1. Recovery Runtime

Use `src/skills/dude-work/recovery.mjs` and its focused test for six-record validation, strict invocation parsing, lane-specific target normalization, concrete evidence acquisition, one-packet construction, normalized blockers, canonical hashes, sequential transient attempt transitions, retention-owner inspection routing, and the closed CLI.

Acquisition remains hardcoded in deterministic source order:

1. Exact defined owner and its `## Coordinator Log`, acquired by the exported inspection entry point and CLI `inspect` path from the bounded direct-ledger inventory; unrelated valid defined ledgers do not block the exact match and callers cannot inject a pre-normalized owner result.
2. Canonical task unit, discovered work, and execution history.
3. Active authoritative lane evidence for the exact target.
4. Current-run attempts and outcomes.
5. Review evidence.
6. Verification and lint evidence.
7. Optional session evidence only when supplied with exact target binding.

Required missing, malformed, stale, contradictory, or unbound evidence produces a normalized blocker. Unavailable optional session evidence alone does not block. Caller data, model output, and captured records cannot assign authority; trusted acquisition derives it from the exact target and active lane.

Each decoded current-run, review, verification, and lint record uses the exact envelope `{substantive,presentation?}`. `substantive` is validated by its source-specific normalizer and remains fully canonical and hash-significant, including every nested `id` and `summary`. `presentation` is validated only against the fixed source allowlist and excluded from normalized evidence: current-run permits `eventId`, `timestamp`, `summary`, and `rationale`; review permits `reviewId`, `timestamp`, `summary`, and `rationale`; verification and lint permit `runId`, `timestamp`, `summary`, and `rationale`. All are optional Unicode scalar strings. Unknown envelope or presentation fields reject. No recursive field-name stripping or extensible wrapper registry is introduced.

`Inspection` remains the sole model-facing packet. The 65,536-byte limit applies to the exact canonical serialized model-facing packet projection, using `canonicalTarget(target)` plus descriptors and complete normalized substantive text for every available `EvidenceItem`. Deduplicated bodies retain every source and authority descriptor, and the projection contains at most 16 available items.

An exact-boundary projection is admitted. Every available overflow, including exact-bound session evidence or a seventeenth item, yields a descriptor-only read-only report, makes no model call, refuses recovery, and is never truncated or divided into multiple batches.

Canonical no-progress projections remain:

- Evidence hash: `canonicalTarget(target)` plus ordered normalized substantive evidence and overflow status. It excludes only the fixed presentation envelopes and optional verified tracked `taskKey` mapping metadata.
- Approach hash: closed action and material inputs, excluding Assessment `evidenceHash`, summary, intent, equivalence, and retention advice.
- Result hash: normalized outcome, changed targets, completion stops, and blockers, excluding presentation prose and event identifiers.

A required `Assessment.evidenceHash` carries the exact Inspection identity assessed by the model. `authorizeAttempt(state,target,rawInputs,assessment,mode)` always rebuilds Inspection first and validates the closed Assessment against it. An exact mismatch returns `evidence-drift` with unchanged state, counters, pending entries, and completed tuples. There is no separate caller-supplied expected hash parameter or CLI field.

Canonical target identity uses the exact feature path and lane plus the Lightweight task key or tracked issue ID. A tracked `taskKey` may be supplied for inspection and authorization and may remain as metadata on the pending Target only after authorization verifies its exact mapping. It cannot split packet identity, counters, pending identity, or no-progress identity. Completion does not acquire or verify mapping metadata: its tracked `target` is exact `{specPath,lane:"tracked",issueId}`, and any supplied completion `taskKey` is conditionally forbidden.

The hardcoded action check sets remain:

| Action | Exact required checks |
|---|---|
| `execute-task` | `verification` |
| `retry-task` | `verification` |
| `address-test` | `lint`, `verification` |
| `address-review` | `review`, `verification` |
| `reconcile-derived-definition` | `lint`, `review`, `verification` |
| `retain-learning` | `lint` |
| `none` | none |

Each pending entry remains exactly `{target,evidenceHash,approachHash,action,materialInputs,mode}`. Authorization refuses whenever any pending entry already exists. It increments the overall count once and increments the canonical target’s recovery count once only for recovery. Completion or interruption removes that one exact entry and refunds nothing.

`completeAttempt(state,{target,evidenceHash,approachHash,result})` remains pure and accepts no dependency, mapping witness, captured evidence, tracker capability, or additional field. For a Lightweight pending entry, `target` must be exact `{specPath,lane:"lightweight",taskKey}`. For a tracked pending entry, `target` must be exact `{specPath,lane:"tracked",issueId}`; `taskKey` is conditionally forbidden on the completion target even when the pending Target retains authorization-verified mapping metadata. Completion selects the pending authorization by equality of `targetKey(target)`, together with exact `evidenceHash` and `approachHash` equality, rather than raw Target object equality. A mapped tracked pending authorization and an issue-only tracked pending authorization therefore both complete or interrupt through the same issue-only completion target. Any tracked completion target containing `taskKey` rejects before result normalization with the complete state unchanged; completion performs no mapping verification or tracker call.

The stored action still chooses the hardcoded action-specific result normalizer. An exact-bound `interrupted` result is valid for every stored action after canonical target, route, operation, and changed-target validation. It does not require success-only checks, does not complete or close the task, appends exactly `{evidenceHash,approachHash,resultHash}`, clears the sole pending entry, and increments or refunds no counter. Non-interrupted successful completion continues to require the action’s exact hardcoded checks.

Work invocation parsing remains `parseInvocation(argv) -> {feature?,policy}`. It accepts zero or one feature selector before flags. A positive `--parallel` value is parsed for compatibility and may cause a host warning, but the returned policy always contains `parallel: 1`; the requested value is discarded and never enters `RunState`. Zero, signed, unsafe, `unlimited`, symbolic, malformed, missing, or duplicate parallel values reject.

The CLI commands remain `inspect`, `authorize`, and `complete`. Their complete stdin request is bounded and must already be duplicate-key-free canonical JSON. Every byte-bearing request field uses the exact canonical envelope `{base64}` with standard padded RFC 4648 encoding, no whitespace, and decode/re-encode equality. For `complete`, a Lightweight target retains exact `taskKey`, while a tracked target must be exact `{specPath,lane:"tracked",issueId}` and rejects `taskKey` as conditionally forbidden. The CLI validates aggregate source-entry count before decoding, enforces individual and aggregate body ceilings during bounded acquisition, and validates canonical JSON bytes only for captured sources whose schema declares JSON. Unknown fields, duplicate keys, noncanonical request bytes, unknown envelope fields, noncanonical base64, any conditionally forbidden tracked completion `taskKey`, or any resource overflow reject before source processing.

The CLI performs bounded reads and reuses exact owner/task helpers, but performs no write, process spawn, tracker invocation, scheduling, or model call. Every failure uses the fixed canonical two-field error payload and remains at or below 8,192 UTF-8 bytes.

### 2. Captured Beads Normalizer

Extend `library/packs/beads/skills/dude-pack-beads-workflow/beads.mjs` and its existing test with one normalizer for captured list, exact detail, and history JSON.

Tracked acquisition requires the complete list/detail/history set for the exact issue and `spec:` identity. A tracked target may omit its durable task key; when the key is supplied, the normalizer must verify its exact issue mapping. Missing, malformed, conflicting, partial, or mismapped captures fail closed. The normalizer neither invokes nor mutates Beads, and its output cannot declare itself authoritative; the recovery runtime assigns authority only after exact target and lane validation.

Captured list, detail, and history bodies must already be duplicate-key-free canonical JSON bytes. The recovery runtime applies the fixed individual and aggregate body ceilings before calling the existing normalizer; the normalizer performs its existing closed projection without adding a parser abstraction, policy object, or registry.

### 3. Atomic Definition File Batch

Keep `src/skills/dude-feature-definition/atomic-file-batch.mjs` and its focused test as the sole mechanical expected-byte batch helper. The generic helper accepts expected bytes or expected absence, staged bytes, and validator callbacks; stages sibling temporary files; rechecks every expectation before application; and removes temporary files on every caught failure.

Runtime recovery composition in `recovery.mjs` must independently resolve exactly one owner and derive the exact four-path batch scope:

1. The exact direct owner idea ledger.
2. The sibling `spec.md`.
3. The sibling `plan.md`.
4. The sibling `tasks.md`.

All four paths participate in expected-state validation, even when staged bytes for one path are unchanged. Runtime recovery rejects every additional or substituted path, including `contracts/schemas.md`. Explicit `define` may separately update supporting contracts through its normal broader transaction; runtime recovery cannot.

Before helper invocation, a recovery-specific validator extracts the complete top-level `## Idea`, `## Open Questions`, and `## Assumptions` sections from both expected and staged owner bytes and compares each section byte-for-byte, including heading, content, blank lines, and trailing bytes up to the next top-level section. Missing, duplicated, malformed, reordered, or changed user-owned sections refuse before writes. Owner `status: defined` and exact `spec_path:` must also remain unchanged.

A write, rename, expected-byte drift, validator failure, or retained helper-created directory restores all prior bytes, removes every newly created path and temporary file, and reports incomplete rollback distinctly when cleanup cannot finish. The helper remains mechanical: it defines no seventh record, reconciliation policy, ownership rule, approval, or persisted crash journal.

Tracked definition recovery is evaluated only after fresh Inspection and Assessment evidence binding, then refused before this helper or any write path.

### 4. Existing Workflow And Model Boundary

- The coordinator detects the lane, maintains transient `RunState`, calls the model when needed, and routes the single authorized attempt through existing owners.
- The model supplies only semantic diagnosis, unchanged-intent judgment, semantic equivalence, proposed action/material inputs, retention advice, and the exact Inspection `evidenceHash` through `Assessment`.
- Lightweight and Beads workflows retain claim, block, verification, close, mirror, and history authority.
- `reconcile-derived-definition` is limited by the runtime four-path scope above; explicit definition retains its separate package authority.
- Retention advice cannot establish current owner state. Transient and none require no owner. Memory proposals cause the memory owner to inspect authoritative memory and duplicates; skill proposals cause learning-promotion and skill-authoring owners to inspect the destination and overlaps. Caller-supplied `destinationExists`, `overlaps`, owner state, or absence claims reject.
- Existing memory-ledger, learning-promotion, and skill-authoring workflows own durable retention, deduplication, validation, and writes.
- Definition recovery does not edit `.dude/memory/decisions.md`; a later execution may supersede a memory decision only after verified behavior.

## Lifecycle

1. Parse the complete `work` invocation into zero or one pre-flag feature selector and one normalized policy before any claim or mutation; parse any positive `--parallel` value for compatibility but return effective `policy.parallel: 1`.
2. Bound and canonically validate the complete CLI request, validate the total source-entry count, then detect the active lane once, apply the selector only to Lightweight disambiguation, resolve the exact owner through the public inspection path, and construct the exact target. A tracked issue may omit a task key, while a supplied key must map exactly and never changes identity.
3. Initialize transient state with `policy.parallel: 1`; loss of that state stops the run rather than reconstructing counters.
4. Inspect before each start or resume, after every block or failure, and on explicit request.
5. Return feature-only inspection without authorization, counters, task mutation, or recovery.
6. Enforce per-body, aggregate-body, retained-descriptor, and one-packet boundaries in that order before any model call, then obtain one closed Assessment carrying the Inspection `evidenceHash`.
7. Rebuild Inspection inside `authorizeAttempt`, validate Assessment including exact hash equality, and return `evidence-drift` unchanged when evidence changed.
8. Refuse authorization while one pending entry exists; recovery v1 performs no concurrent fan-out or dispatchability inference.
9. After an ordinary block, rebuild current-run evidence and stop unless recovery was explicitly enabled.
10. Consume authorization when the single pending entry is inserted. Completion selects it by canonical `targetKey`; optional verified tracked mapping metadata may remain only on the pending Target. Lightweight completion supplies its exact task key, while tracked completion supplies exact issue-only `{specPath,lane:"tracked",issueId}`. A tracked completion `taskKey` rejects with state unchanged and no mapping verification or tracker call. Normalized completion or accepted interruption removes the entry, appends one three-field tuple, and refunds no counter.
11. Route unchanged-intent definition repair only through the exact owner plus sibling `spec.md`, `plan.md`, and `tasks.md`, independently preserve complete user-owned section bytes, and refuse tracked repair after inspection but before helper invocation.
12. Call `completeAttempt` only after a concrete result or exact-bound interruption exists. Pass no dependency, mapping witness, captured evidence, tracker capability, or additional field. Use the stored pending action to select its route-specific normalizer. Successful completion enforces the hardcoded checks; interruption validates binding, records the attempt, clears pending state, and cannot report task completion.
13. Route durable retention advice through fresh inspection by the existing memory or skill owner.
14. Require fresh completion verification, lint, and review according to the hardcoded action set; failure stops completion and enters the next inspection as recoverable evidence.

## Command Matrix

Every row accepts zero or one optional `<feature>` immediately after `work` and before flags. The selector disambiguates Lightweight work and is ignored by current tracked-lane behavior.

`--parallel <positive-ASCII-safe-integer>` may accompany any row for compatibility. Every accepted value produces effective `policy.parallel: 1`, grants no concurrent recovery authority, and is not retained as a requested value in `RunState`.

| Invocation | Overall budget | Per-task recovery budget | Behavior |
|---|---:|---:|---|
| `work` | Default `3` | Disabled | Inspect, attempt ordinary work, stop on block |
| `work --max <N\|unlimited>` | Explicit | Disabled | Existing ordinary behavior; unlimited removes only the numeric cap |
| `work --until blocked` | `25` unless max supplied | Disabled | Stop at the first natural block |
| `work --recover-on-block` | Default `3` | Default `1` | Permit sequential guarded recovery after post-block inspection |
| `work --recover-on-block --recovery-cycles <N\|unlimited>` | Default or explicit | Explicit per task/run | Preserve all hard and no-progress stops; one pending authorization maximum |
| `work --max unlimited --recover-on-block --recovery-cycles unlimited` | Unlimited | Unlimited | Experimental sequential recovery; nonnumeric stops remain mandatory |

The ordinary default remains 3. `--until blocked` keeps an implicit overall max of 25 when no explicit `--max` is supplied.

`parseInvocation(argv)` returns exactly `{feature?,policy}` with `policy.parallel: 1`. `parseOptions` may remain internal, but neither function may expose or persist the requested parallel number as authority. Finite budget and parallel values are positive ASCII safe integers. Reject a second selector, a selector after flag parsing begins, duplicate or unknown flags, missing or malformed values, `--parallel unlimited`, other symbolic parallel values, recovery cycles without recovery opt-in, and recovery combined with `--until blocked`.

## Prompt Economy

`src/skills/dude-work/SKILL.md` owns detailed triggers, command grammar, acquisition, transitions, reporting, and recovery rules. Coordinator, shared instruction, definition, Spec Lead, Lightweight, and Beads prompt surfaces receive terse authority pointers only.

Recovery-specific additions to always-loaded coordinator and instruction sources must total no more than 1,200 UTF-8 bytes. Extend `scripts/current-format-contract.test.mjs` to enforce that budget, the single detailed owner, and absence of duplicated normative recovery paragraphs.

## Source Layout

The implementation comprises exactly three modules:

    src/skills/dude-work/recovery.mjs
    library/packs/beads/skills/dude-pack-beads-workflow/beads.mjs
    src/skills/dude-feature-definition/atomic-file-batch.mjs

Companion tests and integration surfaces are:

    .dude/specs/004-pre-work-log-learning/{spec.md,plan.md,tasks.md,contracts/schemas.md}
    src/skills/dude-work/{SKILL.md,recovery.test.mjs}
    src/skills/dude-feature-definition/{SKILL.md,atomic-file-batch.test.mjs}
    library/packs/beads/skills/dude-pack-beads-workflow/{SKILL.md,beads.test.mjs}
    src/skills/dude-lightweight-execution/SKILL.md
    src/agents/{dude.agent.md,dude-spec-lead.agent.md}
    src/instructions/dude.instructions.md
    scripts/{current-format-contract.test.mjs,build-dev.test.mjs,build-release.test.mjs}
    docs/{commands.md,workflow.md,reference.md}
    .github/  # generated core and installed-pack projections; never hand-edited

## Phases

**Phase 1 - Contract And Runtime**: Revise the six exact records for fixed ingress, body, aggregate, source-entry, retained-descriptor, error, and existing model-packet boundaries; required Assessment evidence binding; effective sequential policy; zero-or-one pending state; fixed source presentation envelopes; canonical base64 CLI transport; duplicate-free canonical JSON at wire and declared captured-source boundaries; authorization-verified optional tracked mapping metadata; issue-only tracked completion input; action-bound completion; and accepted interruption. Implement fixed constants in `recovery.mjs` without another module, record, limit object, registry, parser framework, completion dependency, mapping witness, or captured-evidence input.

**Phase 2 - Evidence And Lane Acquisition**: Keep concrete bounded workspace/current-run/review/verification/session collectors, normalized blockers, and the captured Beads list/detail/history normalizer. Enforce total source-entry and aggregate decoded-body ceilings before normalization, require canonical JSON bytes for declared JSON captures, exercise exact owner acquisition through the public inspect path, and keep issue-only tracked identity plus optional authorization-verified task mapping hash-, counter-, and no-progress-identical. Completion remains issue-only and performs no mapping acquisition.

**Phase 3 - Attempt Lifecycle**: Integrate pre-start, resume, post-block, post-failure, and explicit inspection into `dude-work`; bind every Assessment to fresh Inspection evidence, enforce sequential authorization regardless of accepted `--parallel`, preserve hardcoded action checks, match completion by canonical `targetKey`, require exact issue-only tracked completion and interruption targets, reject a newly supplied tracked completion `taskKey` unchanged, accept exact-bound interruption for every pending action, keep exact counters and three-field tuples, and preserve inspection-first tracked refusal.

**Phase 4 - Definition And Retention**: Enforce the exact runtime owner plus sibling `spec.md`, `plan.md`, and `tasks.md` scope; byte-compare all three user-owned idea sections independently; fault-test atomic application and rollback; and replace caller-asserted retention state with owner inspection. Explicit definition remains the separate route for schema changes.

**Phase 5 - Prompts, Docs, And Projection**: Add terse pointers, enforce the 1,200-byte limit, update command/workflow/reference docs with compatibility-only `--parallel`, required Assessment evidence binding, canonical CLI byte envelopes, and runtime recovery scope, then rebuild generated core and refresh installed Beads content through compose when its source changes.

**Phase 6 - Verification And Review**: Run exact-boundary and `+1` resource fixtures, canonical/duplicate-key JSON fixtures, mapped-pending-to-issue-only tracked completion and interruption, issue-only-pending-to-issue-only completion, rejection of every tracked completion target carrying `taskKey`, interrupted completion, and public inspect owner-acquisition regressions before the existing focused and full gates. Prove completion uses no mapping witness or tracker call. Then lint the workspace and pristine release and route the same fresh evidence independently to the Tester and Code Reviewer.

## Validation Strategy

Each implementation task owns focused validation and the applicable broader gates; this plan prescribes no ordering around the initial code change.

Focused commands:

    node --test src/skills/dude-work/recovery.test.mjs
    node --test src/skills/dude-feature-definition/atomic-file-batch.test.mjs
    node --test library/packs/beads/skills/dude-pack-beads-workflow/beads.test.mjs
    node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs scripts/build-release.test.mjs

Focused coverage includes six-record exactness; required Assessment `evidenceHash`; fresh-match and stale `evidence-drift` authorization with unchanged state and counters; zero/one/second feature selectors; accepted positive `--parallel` values always returning and persisting effective one; rejected zero, signed, unsafe, `unlimited`, symbolic, missing, and duplicate parallel values; zero-or-one pending state; tracked issue-only targets and optional exact mappings; omitted-versus-supplied verified tracked `taskKey` same-hash identity; exact 16-item and 65,536-byte packet boundaries; canonical and malformed base64 CLI envelopes; fixed source-specific presentation envelopes; presentation-only same-hash and nested substantive `id`/`summary` changed-hash fixtures; descriptor-only overflow refusal with zero model calls; recoverable `address-test` and `address-review` evidence; exact hardcoded action checks; action-bound completion and interruption; exact completed tuples; repeated evidence/approach and evidence/result stops; Lightweight versus Beads authority; inspection-first tracked refusal; exact four-path runtime definition scope; independent byte preservation of `## Idea`, `## Open Questions`, and `## Assumptions`; explicit-definition-only schema updates; atomic rollback; owner-inspected retention; prompt economy; public documentation; and generated projections.

T008 additionally covers complete CLI requests at 6,291,456 and 6,291,457 encoded bytes; workspace and capture bodies at 1,048,576 and 1,048,577 bytes; aggregate decoded bodies at 4,194,304 and 4,194,305 bytes; total source entries and retained descriptors at 64 and 65; valid error JSON at or below 8,192 bytes; duplicate-key, whitespace-varied, and reordered-key wire and captured JSON; mapped tracked pending authorization followed by issue-only completion and interruption; issue-only tracked pending authorization followed by issue-only completion; rejection with byte-equivalent state of any tracked completion target carrying `taskKey`; unchanged Lightweight task-key completion; no completion mapping witness or tracker call; interruption for every pending action with unchanged charged counters and one tuple; and public `inspect` owner acquisition with unrelated valid defined ledgers.

Full repository gates:

    node scripts/build-dev.mjs
    find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
    node .github/skills/dude-lint/lint.mjs .
    git diff --quiet HEAD -- library/packs/beads || node .github/skills/dude-compose/compose.mjs verify
    RELEASE_ROOT="$(mktemp -d)"
    node scripts/build-release.mjs --out "$RELEASE_ROOT/bundle" --tag v0.0.0
    node "$RELEASE_ROOT/bundle/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/bundle"
    git status --porcelain -- .github
    git diff --check

Bare `node --test` is insufficient because it under-discovers nested tests. Tester and Code Reviewer receive the same fresh focused, full-suite, lint, compose, projection, and release evidence independently.

## Risks

- Semantic diagnosis, unchanged intent, and equivalence remain model judgments; deterministic enforcement and independent review must fail conservatively.
- The single-packet cap intentionally trades large-history autonomy for bounded behavior; overflow requires reporting and manual narrowing.
- Lost transient state cannot safely resume, so an interrupted host process stops even when durable task history remains available.
- Byte rollback covers caught failures, not process termination or power loss; crash recovery would require prohibited persisted transaction state.
- Beads output changes may invalidate captured fixtures; malformed or incomplete tracked evidence must fail closed.
- Accepting `--parallel` while discarding its requested capacity requires explicit documentation and regression coverage so compatibility is not mistaken for authority.
- Exact source envelopes intentionally reject previously tolerated wrapper shapes; fixtures and producers must change together without adding a generic compatibility registry.
- Byte-preserving user-owned sections requires top-level Markdown boundary detection that fails closed on duplicate or malformed sections.
- Assessment evidence binding may reject advice after any fresh evidence change; callers must obtain a new Assessment rather than retry stale advice.
- Strict canonical wire and captured-source validation intentionally rejects JSON previously accepted after whitespace removal, key reordering, or duplicate-key collapse; CLI producers, fixtures, and public documentation must change together.
- Stream and base64 enforcement must keep application-owned buffers within the fixed ceilings even when host stream chunks are larger; tests must distinguish observed excess from retained excess.
- Aggregate accounting occurs before normalization and deduplication, so repeated or malformed bodies cannot bypass the 4,194,304-byte ceiling.
- Completion-specific Target validation must reject tracked `taskKey` before pending selection or result normalization, while `targetKey` matching still lets a pending authorization retain an already-verified key; conflating authorization and completion shapes would either split identity or reintroduce prohibited completion-time mapping verification.
- UTF-8 error-message truncation must measure canonical serialized bytes and cut only at Unicode scalar boundaries so every emitted error remains valid JSON.

## Rejected Complexity

- No source manifest, slot, producer, gate, proposal, decision, transaction, host-capability, presentation-wrapper, or other generic record beyond the six-record contract.
- No plugin registry, generic scheduler, parallel recovery dispatcher, extensible wrapper registry, recursive presentation-field stripper, separate recovery engine, multi-batch aggregation, truncation, embedded model call, fuzzy session search, or Beads invocation.
- No recovery lane, live board, persisted run state, requested parallel-capacity state, transaction journal, hidden learning store, replacement definition workflow, or tracked definition recovery in v1.
- No seventh record for CLI bytes, source envelopes, pending entries, completion tuples, definition scope, or retention inspection.
- No configurable limit object, resource-policy subsystem, source-limit registry, manifest, persisted counters, generic JSON parser, or reusable canonical-input framework.
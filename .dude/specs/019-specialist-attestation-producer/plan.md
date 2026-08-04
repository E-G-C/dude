# Implementation Plan: Specialist Attestation Producer

## Summary

Add one dependency-free production builder beside the existing Work host adapter. Host integration acquires the sole admitted structured result from an actual Tester or independent Reviewer dispatch and supplies its authoritative target, attempt, source-revision, dispatch, and chronology context. The builder accepts only that closed inert result and context, preserves the complete semantic sets of check definitions, findings, and subjects and every row's exact semantic fields, emits set-like collections in Feature 009's required canonical order, derives the identities required by the existing capture shape, validates the finished capture with Feature 009's current validators, and returns only validator-accepted output. It rejects every duplicate check definition, finding, and subject, including byte-identical duplicates, before sorting or construction so none can be silently dropped or deduplicated. It also refuses separate semantic overrides, caller-precomputed identities, malformed or incomplete data, context mismatches, cycles, arrays with extra own keys, and behavior-bearing containers.

Integrate the builder into the autonomous `record-attempt-result` path in the existing host adapter. Ordinary requests do not provide trusted envelope identities, low-level route choices, or a verification capture. The host adapter acquires actual specialist result records, derives authoritative context from accepted host state, builds the compatible verification capture, and passes that exact builder output into review construction before entering the unchanged trusted completion flow. All existing projection, finalization, permit, receipt, close, recovery, and learning-governance checks remain authoritative.

The guarantee is cooperative, coordinator-recorded specialist attestation. A different otherwise-valid sole result is a different cooperative assertion. Neither the builder nor host integration claims to detect malicious or pre-boundary rewriting of that source. This plan adds no source-byte or source-hash comparison theater, cryptography, keys, authority registry, transcript parser, service, state, store, lane, workflow, or malicious-coordinator defense.

The canonical feature identity is `.dude/specs/019-specialist-attestation-producer/spec.md`, owned exactly by `.dude/ideas/specialist-attestation-producer.md`.

This corrective feature has no progress objective and no active ObjectiveRegistry region.

## Technical Context

**Language/Version**: Node.js >= 20, dependency-free ESM with `// @ts-check`; Markdown prompt and reference contracts

**Primary Dependencies**: Existing trusted-capture, verification-envelope, independent-review-envelope, Inspection, trusted completion, projection, permit, receipt, and host-adapter validators and constructors from `src/skills/dude-work/recovery.mjs` and `src/skills/dude-work/host-adapter.mjs`; Node built-ins already required by those existing capture formats only

**Storage**: Existing transient host-adapter session and authoritative current-run and lane-history surfaces only; no new project state, checkpoint field, persistent store, registry, or ledger

**Testing**: `node:test` unit matrices for complete semantic-set and exact row-field preservation under canonical and noncanonical input orders; equal, conflicting, and byte-identical duplicate refusal; focused cyclic-data and extra-key-array refusal; host-adapter production-path integration; existing recovery and continuity regressions; static contracts; generated projection tests; full discovered repository suite; Dude lint; compose verification; pristine release validation; and fresh independent Tester and Code Reviewer evidence

**Target Platform**: Supported macOS, Linux, and Windows local Dude workspaces

**Project Type**: Reusable coordination runtime and generated core projection

**Performance Goals**: Linear work over the existing bounded maximum of sixteen checks and sixteen findings; one verification capture and at most one bound review capture per recorded attempt result; no network call, polling, background process, or unbounded collection

**Constraints**: `src/` is authoritative; generated `.github/` core is produced only by `node scripts/build-dev.mjs`; keep Node ESM dependency-free; reuse current validators; preserve guarded behavior and all Feature 009 and Feature 018 authorities; do not mutate Feature 017 or Feature 018 package or execution state

## Spec Quality Validation

- The specification is technology-neutral and contains three independently testable P1 stories covering actual Tester capture, actual independent-review capture, and ordinary autonomous close.
- Its acceptance scenarios cover valid production flow, complete semantic-set and exact row-field preservation under validator-required canonical ordering, refusal of every duplicate including byte-identical duplicates, malformed and incomplete data, cycles, extra-key arrays, separate semantic overrides, caller-precomputed identities, hostile containers, context mismatches, host-owned acquisition and verification threading, guarded compatibility, and no low-level route selection.
- FR-001 through FR-011 define one producer, one sole structured semantic source, internal capture-identity derivation, canonical duplicate-free transformation without silent deduplication, exact row semantics, closed-data refusal rules, existing-validator authority, host-owned integration, unchanged governance and lane boundaries, the cooperative trust statement and limit, end-to-end proof, and cross-feature non-mutation.
- SC-001 through SC-007 provide measurable canonical-order and complete-set valid matrices plus duplicate, cycle, extra-key-array, and other negative matrices without impossible source-authenticity claims, one end-to-end close, regression preservation, architecture non-goals, full validation, and independent acceptance.
- Edge cases, assumptions, key entities, and Out of Scope are complete, and there are no unresolved clarification markers or implementation paths in the specification.

The specification passed its definition-time document gate before this plan was written. This is not a lint or execution-readiness claim; coordinator lint remains pending.

## Guardrail And Compatibility Check

- Use the smallest design: one builder module, one focused test module, and one adapter integration rather than a trust framework.
- Keep deterministic closed-shape validation, context matching, exact semantic transformation, identity derivation required by existing formats, and output validation in code; model reasoning supplies no identity, outcome, verdict, finding, or chronology authority.
- Reuse the existing Feature 009 validators as the final capture authority. Do not copy or fork their schema logic.
- Keep the Feature 018 host adapter as the sole ordinary runtime entry point and preserve its immutable accepted-state, continuity, refusal, and lane-effect behavior.
- Keep source prompts concise and generated core derived from `src/`; do not hand-edit `.github/`.
- Document the cooperative trust limitation without claiming cryptographic, byte/hash, source-authenticity, pre-boundary-rewrite, or malicious-coordinator protection.

No new durable project guardrail is proposed. Existing smallest-design, deterministic-authority, source-projection, and specialist-visibility guardrails cover the feature.

## Root Cause And Falsifiable Correction

Feature 009 can normalize and consume trusted verification and review captures, and Feature 018 can route trusted completion through the ordinary host adapter. The missing link is a production function that transforms the sole admitted structured specialist result into Feature 009's canonical duplicate-free set representation without losing a semantic member or changing any row field, plus host integration that acquires that result from actual dispatch, supplies authoritative context, and threads the exact built verification capture into review. Current focused tests construct identity-bearing captures directly, so they prove neither production acquisition, complete canonical-set preservation, duplicate refusal before normalization, nor exact host-owned threading.

The correction is falsified if transformation omits or adds any check definition, finding, or subject; changes, coerces, or upgrades any row's semantic field; emits a set-like collection outside Feature 009's canonical order; accepts any equal, conflicting, or byte-identical duplicate; or silently drops or deduplicates one. It is also falsified if the builder accepts a separate semantic override, precomputed identity, malformed or incomplete result, context mismatch, cycle, array with an extra own key, or behavior-bearing container; if host integration does not own actual dispatch acquisition and authoritative context; if review construction receives anything other than the exact prior builder-produced verification capture; or if an ordinary request can choose a verification capture, low-level route, or throwaway driver. It is not falsified merely because valid input order is changed to the validator-required canonical order, or because a different otherwise-valid sole result produces a different cooperative assertion: input-order preservation and malicious or pre-boundary substitution detection are outside the design.

## Architecture

### 1. One closed specialist-attestation builder

Create `src/skills/dude-work/specialist-attestation.mjs` with one public builder over a closed `verification` or `independent-review` input union. The input carries host-owned authoritative dispatch context and exactly one inert structured specialist result as the exclusive semantic source, never a second semantic source, separate override, or precomputed capture identity.

For verification, the builder:

1. admits only an own-data, closed, inert record and rejects inherited, accessor-backed, executable, custom-prototype, or otherwise behavior-bearing containers;
2. validates result completeness, internal consistency, the bounded complete check set, and exact agreement with the host-owned target, authorized attempt, source revision, resolved Tester dispatch, and chronology context;
3. rejects cycles, arrays with extra own keys, unknown fields, separate semantic overrides, caller-precomputed identities, structurally missing semantic data, and every equal, conflicting, or byte-identical duplicate check definition before any canonical sort or capture construction;
4. copies the complete check set and every row's exact semantic fields into the current verification envelope, orders checks by Feature 009's canonical identity rule without preserving input order, and derives only the identities required by the existing shape from the sole result and authoritative context; and
5. calls the existing trusted-capture and verification-envelope validators before returning.

For independent review, the same builder:

1. admits only an own-data, closed, inert result record and validates completeness, internal consistency, reviewer independence, and exact agreement with the host-owned target, attempt, source revision, Reviewer dispatch, and chronology context;
2. accepts the exact prior builder-produced verification capture from host integration, not from an ordinary request, and uses it as the review binding;
3. rejects accepted-with-findings, rejected-without-findings, cycles, arrays with extra own keys, unknown fields, separate semantic overrides, caller-precomputed identities, invalid check observations, behavior-bearing containers, every context mismatch, and every equal, conflicting, or byte-identical duplicate finding or subject before any canonical sort or capture construction;
4. copies the exact verdict, complete finding and subject sets, every row's exact semantic fields and observation bindings, orders set-like arrays by Feature 009's canonical identity rules without preserving input order, and derives only identities required by the existing review shape; and
5. calls the existing trusted-capture and independent-review-envelope validators before returning.

The builder is deterministic and stateless. It does not inspect transcripts, select or dispatch a specialist, acquire a result, compare source bytes or hashes, accept a caller-selected verification capture, call a model, persist a result, or authorize completion. It cannot determine whether an otherwise-valid sole result was changed before reaching the boundary.

### 2. Ordinary host-adapter integration

Update `src/skills/dude-work/host-adapter.mjs` so host integration acquires the sole structured Tester and Reviewer results from their actual dispatches. The autonomous `record-attempt-result` request does not accept caller-precomputed trusted identities, semantic overrides, dispatch context, or a verification capture. The adapter derives target, pending attempt, source revision, resolved specialist dispatch, action, attempt ordinal, chronology, and current authority from its validated accepted host state, then invokes the builder.

The adapter retains the exact verification capture returned by the builder and passes that object unchanged into review construction; there is no ordinary request field or lookup choice for substituting another valid capture. It then converts the builder outputs into the existing internal trusted-completion input and invokes the unchanged recovery route internally. Existing response binding, occurrence retention, projection settlement, finalization, lane permit, lane application, receipt commitment, close, rejection recovery, and learning-governance behavior remain authoritative.

Guarded completion keeps its current input and behavior. A caller-supplied route, trusted envelope body, identity-bearing capture field, or direct close request remains invalid.

No adapter checkpoint schema or persistent state changes are planned. If implementation shows that production dispatch context cannot be retained within the existing typed request and accepted session without a new persistent authority surface, stop as `plan-gap` rather than adding one speculatively.

### 3. Prompt, static contract, concise reference, and projection

Update `src/skills/dude-work/SKILL.md` as the detailed owner: after visible real Tester and Reviewer dispatch, host integration acquires each sole structured result, supplies authoritative context, preserves its complete semantic sets and every row's exact fields under existing canonical ordering, rejects all duplicate checks, findings, and subjects without silent deduplication, and threads the exact prior builder verification output into review. Ordinary requests never author semantic overrides or trusted identities, select verification captures, or choose low-level routes. State the cooperative trust limitation and pre-boundary rewrite exclusion.

Add one concise coordinator pointer in `src/agents/dude.agent.md`. Extend `scripts/current-format-contract.test.mjs` to pin the production builder, host-owned actual-dispatch acquisition and authoritative context, complete semantic-set and exact row-field preservation under existing canonical ordering, refusal of every duplicate without silent deduplication, cyclic and extra-key-array refusal, hostile-container refusal, exact verification-output threading, no caller-precomputed identities or semantic overrides, no caller-selected verification capture or low-level route, existing-validator reuse, and the cooperative non-cryptographic and pre-boundary limitation.

Add only the materially necessary trust-boundary paragraph to `docs/reference.md`; command grammar and workflow lanes do not change. Run `node scripts/build-dev.mjs` to generate the core projection. Expected generated changes are:

```text
.github/agents/dude.agent.md
.github/skills/dude-work/SKILL.md
.github/skills/dude-work/host-adapter.mjs
.github/skills/dude-work/specialist-attestation.mjs
```

Generated files are never edited directly.

## Source Layout

### New authoritative source and focused tests

```text
src/skills/dude-work/specialist-attestation.mjs
src/skills/dude-work/specialist-attestation.test.mjs
```

### Existing host integration and tests

```text
src/skills/dude-work/host-adapter.mjs
src/skills/dude-work/host-adapter.test.mjs
src/skills/dude-work/recovery.mjs
src/skills/dude-work/recovery.test.mjs
```

`recovery.mjs` is a validator and trusted-consumer dependency, not an expected semantic rewrite. Change it only if a minimal export of an existing validator or canonical helper is required; do not duplicate that helper in the producer.

### Prompt, static contract, and concise reference

```text
src/skills/dude-work/SKILL.md
src/agents/dude.agent.md
scripts/current-format-contract.test.mjs
docs/reference.md
```

### Generated through build-dev only

```text
.github/skills/dude-work/specialist-attestation.mjs
.github/skills/dude-work/host-adapter.mjs
.github/skills/dude-work/SKILL.md
.github/agents/dude.agent.md
```

No feature package, `.dude/state`, pack source, lane owner, command parser, manifest, or other documentation file is an implementation write target.

## Phases

- **Phase 1 - Production builder (T001@70726f64)**: implement complete semantic-set and exact row-field preservation over the sole inert verification/review source, apply Feature 009 canonical ordering without promising input-order preservation, reject every equal, conflicting, or byte-identical duplicate before sorting or construction, refuse cycles, arrays with extra own keys, hostile containers, separate overrides, precomputed identities, malformed or incomplete data, and context mismatch, and prove compatible output with focused tests against existing validators.
- **Phase 2 - Ordinary Work integration (T002@696e7467)**: make host integration own actual dispatch-result acquisition and authoritative context, thread the exact prior builder verification output into review, exclude verification selection and low-level routes from ordinary requests, add production-path close and refusal tests, update concise prompt/static/reference contracts, and generate the core projection.
- **Phase 3 - Acceptance (T003@76616c69)**: prove host-owned actual Tester and Reviewer dispatch-result close, exact semantic preservation and the corrected negative matrix, guarded and Feature 009/018 regressions, generated parity, repository gates, and fresh independent acceptance without impossible pre-boundary rewrite detection.

## Traceability

| Task | Stories | Requirements | Primary proof |
|---|---|---|---|
| T001@70726f64 | US1, US2 | FR-001 through FR-005, FR-009 | Builder unit matrix, existing-validator acceptance, complete semantic-set and exact row-field preservation under canonical ordering, equal/conflicting/byte-identical duplicate refusal without deduplication, focused cycle and extra-key-array refusal, hostile-container, separate-override, precomputed-identity, malformed, incomplete, and context-mismatch refusal |
| T002@696e7467 | US1 through US3 | FR-001 through FR-010 | Host-owned dispatch acquisition and context, exact verification-output threading, production-flow close fixture, verification-selection and low-level-route refusal, prompt/static/reference contracts, generated projection |
| T003@76616c69 | US1 through US3 | FR-001 through FR-011 | End-to-end actual specialist records, corrected negative proof, explicit cooperative limit, regression and full gates, independent Tester and Code Reviewer evidence, cross-feature non-mutation inspection |

## Validation Strategy

Focused checks during implementation:

- valid duplicate-free checks, findings, and subjects in canonical and noncanonical input orders produce the same complete canonically ordered semantic sets with every row field unchanged;
- equal, conflicting, and byte-identical duplicate check definitions, findings, and subjects each refuse before sorting or construction and are never silently dropped or deduplicated;
- dedicated cyclic-record and array-with-extra-own-key fixtures refuse for both verification and independent-review inputs; and
- malformed, incomplete, unknown-field, inherited, accessor-backed, executable, custom-prototype, separate-override, precomputed-identity, and context-mismatch fixtures retain their focused refusal coverage.

```bash
node --test src/skills/dude-work/specialist-attestation.test.mjs
node --test src/skills/dude-work/host-adapter.test.mjs
node --test src/skills/dude-work/recovery.test.mjs
node scripts/build-dev.mjs
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs
```

Full acceptance:

```bash
node scripts/build-dev.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
RELEASE_ROOT="$(mktemp -d)"
node scripts/build-release.mjs --out "$RELEASE_ROOT/bundle" --tag v0.0.0
node "$RELEASE_ROOT/bundle/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/bundle"
git status --porcelain -- .github
git diff --check
```

Acceptance uses one unchanged fresh evidence set for independent Tester and Code Reviewer review. Definition-time work does not run or claim these commands.

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` are needed. The result union and integration are small enough to define in this plan, current Feature 009 schemas remain authoritative, and focused automated matrices replace separate schemas, data models, quickstarts, or checklists.

## Complexity Rejected

- No cryptographic signing, keys, certificates, or proof system.
- No source-byte snapshot, source-result hash, or compare-and-hash mechanism presented as authenticity proof.
- No authority registry, identity service, external service, or remote attestation.
- No transcript parser or semantic inference from free-form output.
- No editor integration, daemon, database, queue, or background worker.
- No new lane, workflow, policy, command, store, ledger, board, or checkpoint field.
- No new session, dispatch, chronology, verification-selection, or attestation state.
- No second capture schema, validator fork, alternate consumer, or trust framework.
- No low-level route selection, direct lane edit, caller close authority, or throwaway acceptance driver.
- No Feature 017 or Feature 018 definition, task, blocker, history, or state mutation.

## Risks

- **Specialist output lacks complete structured semantics**: refuse incomplete data; do not parse transcripts, infer omitted checks, verdicts, or findings, or seek a second semantic source.
- **Transformation changes the sole source**: compare the resulting canonical semantic projection with the admitted duplicate-free source as sets, require complete member equality and exact row-field equality, and allow only Feature 009's canonical ordering change; do not claim input-order preservation or comparison with pre-dispatch bytes or another authoritative original.
- **Normalization hides duplicates**: detect and reject equal, conflicting, and byte-identical duplicate checks, findings, and subjects before sorting, identity-map construction, or any operation that could collapse them; mutation-pin each duplicate class.
- **Caller smuggles semantics, identities, or behavior**: use closed inert input records, reject cycles, arrays with extra own keys, separate overrides, unknown and forbidden fields, inherited or accessor-backed values, custom prototypes, and executable or otherwise behavior-bearing containers, and prove each refusal in the negative matrix.
- **Producer drifts from Feature 009 schemas**: construct the existing shape and require the existing validators before returning; avoid copied validation logic.
- **Review binds the wrong verification**: let host integration retain and pass the exact prior builder output; expose no ordinary request field that can supply or choose an alternative, and test that such input is refused.
- **Source revision drifts after dispatch**: bind dispatch context, result, and adapter accepted attempt to one source revision and refuse on mismatch.
- **A sole result is changed before the boundary**: acknowledge that a different otherwise-valid result is a different cooperative assertion; do not add bytes, source hashes, signatures, keys, registries, or false detection claims.
- **Cooperative attestation is overstated**: pin exact prompt, static, and reference wording that denies cryptographic, source-authenticity, pre-boundary rewrite, or malicious-coordinator guarantees.
- **Adapter integration broadens authority**: keep all projection, finalization, permit, receipt, close, recovery, learning, safety, budget, ownership, and review-independence gates unchanged.
- **Cross-feature blockage is cleared prematurely**: this package records no authority to unblock Feature 018 T004 or Feature 017 T003; only later coordinator-owned reconciliation may change them after acceptance.

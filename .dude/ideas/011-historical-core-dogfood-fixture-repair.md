---
title: Historical Core Dogfood Fixture Repair
slug: historical-core-dogfood-fixture-repair
status: defined
spec_path: .dude/specs/011-historical-core-dogfood-fixture-repair/spec.md
---

# Idea: Historical Core Dogfood Fixture Repair

## Idea

Repair the Feature 008-owned first-adopter test fixture so it reconstructs the historical pre-materialization T009 event inside its temporary repository instead of inheriting current repository HEAD and generated parity.

Keep all six Feature 008 T007 assertions strict and permanent, including the ordinary and later-feature rejection gates. This is a small test-contract repair, not a product-policy change, history rewrite, migration, or framework. No assertion may be weakened, skipped, filtered out, or treated as an expected failure.

Implement this as a separate small feature package. Do not re-open or rewrite Feature 008's completed package, do not absorb it into Feature 010, and do not touch Feature 010 state or its promoted core bytes. Be pragmatic and do not over-engineer the repair.

## Open Questions

No open questions remain. The desired outcome, strictness, ownership, and scope boundaries are settled.

## Assumptions

- The six failures share the independently proven phase-stale fixture root cause described below.
- Reconstructing the accepted historical pre-materialization event in the transient fixture is sufficient to restore the intended test contract without changing production behavior or policy.
- The smallest suitable repair remains local to the existing test fixture and reuses its transient Git and projection capabilities unless definition uncovers unavoidable contrary evidence.

<!-- dude:managed:start -->
## Normalized Intent

- Deterministically reconstruct the historical one-time pre-materialization T009 event inside the temporary valid-event fixture, independent of the current repository HEAD and current generated parity.
- Preserve all six named Feature 008 T007 assertions as present, executable, and strict. Delete, weaken, skip, filter, or mark none of them as expected failures.
- Preserve strict ordinary and later-feature gates unchanged. Historical fixture reconstruction must grant no authority and create no exception for current or future features.
- Keep the fixture transient and test-local. It must write no workflow state or persistent packet and change no production runtime or user-facing behavior.
- Prove the focused six tests pass when run from a later green-parity HEAD while retaining their existing rejection coverage for mutated continuity, declaration, generated prestate, parity delta, protected boundaries, approvals, and close evidence.
- Restore the recursively discovered full suite to green so Feature 010's already-valid promotion terminal can resume and close through Feature 010's own authority.
- Permit no expected-failure waiver.

## Verified Evidence

- Feature 010 successfully implemented and dogfood-promoted the autonomous event round-trip correction. Its focused tests, source/generated parity, Dude lint, compose verification, release build and lint, protected-boundary checks, and whitespace checks pass.
- Feature 010's terminal remains unable to close because the recursively discovered full suite reports 1858 tests: 1848 pass, 6 fail, and 4 are skipped. No policy permits expected failures, so Feature 010 T004 correctly remains blocked.
- All six failures are in `scripts/current-format-contract.test.mjs` and belong to the Feature 008 T007 first-adopter fixture:
  1. `T007 Core Dogfood valid live 20-path event passes every transient packet gate`
  2. `T007 Core Dogfood requires exact main checkout baseline continuity and terminal readiness`
  3. `T007 Core Dogfood derives current authority and rejects generic approval interruption and drift`
  4. `T007 Core Dogfood compares the complete temp-materializer projection and cleanup inventory`
  5. `T007 Core Dogfood pre-materialization verification isolates one exact parity delta`
  6. `T007 Core Dogfood appends rechecks selects latest accepted evidence and blocks every close drift`
- A clean checkout at `c7e36d7` with no Feature 010 source or generated overlay fails the same six tests, 0/6, proving the failures predate Feature 010.
- A controlled reconstruction placing the current Feature 008 test, policy, and state inputs over `HEAD=21f9dc5` with its pre-materialization generated projection passes all six tests, 6/6.
- A clean `c7e36d7` checkout overlaid with Feature 010 source and generated files still fails the same six tests with identical failure codes, proving Feature 010 does not alter the failure signature.
- Raw `21f9dc5` does not contain these six tests, so the controlled reconstruction is the meaningful proof rather than a filtered run that discovers zero matching tests.
- The immediate child `0170ce2` fails all six tests in a clean checkout. There was no durable post-materialization green commit for these live fixtures.
- Root cause is phase-stale fixture construction: `createTransientPacketRepositoryFixture()` clones current repository `HEAD`, overlays live `.dude`, policy, and test bytes, and then asserts that the clone still represents the exact one-time T009 pre-materialization event. Once T009 closed and generated parity became green, current HEAD and generated state could no longer satisfy that historical packet. This is a test-contract defect, not a product regression.
- Feature 008 defines the route as one-time and exclusive to the current T009 event, grants no authority to later features, and requires transient temporary-Git test fixtures. Its strict tests remain valid; only their valid-event fixture has inherited the wrong phase.

## Scope And Relationships

- This defect is semantically owned by Feature 008's one-time T007/T009 first-adopter fixture, but implementation belongs to a separate small feature package.
- Do not re-open, rewrite, or change acceptance for the completed Feature 008 package.
- Do not rewrite Feature 009 history, ownership, acceptance, or state.
- Do not absorb this repair into Feature 010. Feature 010 supplied the full-suite discovery context and remains blocked under its own authority until the suite is green, but it did not cause the six failures.
- Do not mutate Feature 010 task state, promoted source, or generated core bytes through this repair.

## Likely Implementation Boundary

- The proven defect and current fixture are in `scripts/current-format-contract.test.mjs`.
- The expected smallest implementation is test-only in that file and reuses its existing temporary Git and projection helpers.
- This boundary is evidence and a proportionality constraint, not frozen mechanics. Definition may depart from it only if unavoidable evidence shows the repair cannot satisfy the accepted outcome there.
- Do not propose changes to `src/**`, `.github/**`, Feature 008's package, Feature 009's package, production policy, commands, schemas, state, or the materializer without such evidence.

## Constraints

- Brainstorm intake only; create no definition package and perform no implementation.
- Keep scope to one historical valid-event fixture repair, not a framework or migration.
- Allow no expected-failure waiver, skip, assertion deletion, test filtering, or policy relaxation.
- Preserve every strict future-feature gate and the one-time event's exclusivity.
- Do not rewrite Feature 008 or Feature 009 history, mutate their state, re-open them, or revise their acceptance.
- Add no command, runtime, ledger, persistent fixture store, or generated artifact.
- Keep the fixture transient and test-local, with no workflow-state, production-runtime, or user-facing effects.
- Do not touch Feature 010 state or promoted core bytes.
- Choose the smallest design that satisfies the proven contract defect and its regression checks.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-28 UTC - brainstorm captured
- 2026-07-28 UTC - defined -> .dude/specs/011-historical-core-dogfood-fixture-repair/spec.md
- 2026-07-28T19:25:02Z - T001@66697874 first attempt implemented a seven-line historical checkout reset in `createTransientPacketRepositoryFixture()` and preserved every named test and assertion; exact focused verification passed 6/6, all T007 contracts passed 18/18, current-format passed 87/87, Dude lint reported 0 warnings and 0 failures, and git diff --check was clean. Independent Tester rejected readiness because default depth-one CI does not contain commit `21f9dc5e3a4725891412d28fcb6d27464573a22b`, causing setup failure, and setup/close-preparation exceptions can leak disposable roots
- 2026-07-28T19:25:02Z - T001@66697874 blocked as test-failure pending a shallow-safe synthetic reconstruction of the historical pre-materialization event using existing test-local Git/materialization helpers plus guaranteed exception cleanup; Feature 010 T004 remains separately blocked and no Feature 008, Feature 009, Feature 010, production, source, generated, or policy state was changed by this feature
- 2026-07-28T19:25:02Z - Lightweight board rendered after T001@66697874 block; no Feature 011 task is ready
- 2026-07-28 UTC - autonomous Work recovery cycle 1 authorized `address-test` for T001@66697874 from Inspection `8d056de1e216934d7e3da6511e3716f06adf0067cc8fec2c8a7757076bb033ec`; claimed the task and cleared the superseded blocker for one shallow-safe synthetic-history and guaranteed-cleanup revision
- 2026-07-28T21:57:50Z - T001@66697874 closed after autonomous recovery cycle 1: replaced the historical-OID checkout with a shallow-safe synthetic baseline and descendant 20-path 10/9/1 pre-materialization event, reconstructed the exact eight-stale/five-current/five-no-output generated prestate, rebound clone-only baseline/continuity/policy/T008 evidence to synthetic identities, and added guaranteed cleanup for setup, clone-stage, and close-preparation failures. Fresh coordinator verification passed the exact six tests 6/6 with zero skip/todo, Dude lint 0/0, and git diff --check clean; independent Tester additionally passed T007 19/19, current-format 88/88, outer depth-one 6/6 with the historical object absent, ambient control 0/6, cleanup and invariant probes 1/1, and independent Code Reviewer returned APPROVE with no blocking findings
- 2026-07-28T21:57:50Z - Lightweight board rendered after T001@66697874 close; T002@76616c69 is ready for ordinary full validation
- 2026-07-28T23:10:45Z - T002@76616c69 closed: exact focused verification passed 6/6, disposable ambient control passed 0/6 and reproduced the six root failure codes, all T007 contracts passed 19/19, current-format passed 88/88 with identical transient-root inventories, recursively discovered repository verification passed 1,855 of 1,859 tests with 0 failures and 4 existing skips, Dude lint reported 0 warnings and 0 failures, git diff --check was clean, implementation scope was exactly `scripts/current-format-contract.test.mjs`, Feature 008/009 bytes remained clean, Feature 010 state and promoted three-file core delta remained unchanged, and final independent Reviewer returned APPROVE with no findings
- 2026-07-28T23:10:45Z - Feature 011 complete: both canonical tasks are `[x]`, the coordinator snapshot agrees, no task is ready, and the final Lightweight board was rendered. The repair contains no expected-failure waiver, skip, assertion weakening, production or policy mutation, persistent historical fixture, or authority leakage to ordinary/later features
<!-- dude:managed:end -->

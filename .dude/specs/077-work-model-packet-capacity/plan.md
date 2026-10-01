# Implementation Plan: Work Model Packet Capacity

**Specification:** `.dude/specs/077-work-model-packet-capacity/spec.md`

## Technical Context

**Language/Version:** Dependency-free JavaScript ESM, Node.js 20+  
**Primary Dependencies:** Node built-ins and existing Work/fixture helpers; no additions  
**Storage:** Existing evidence and transient runtime state only; no added storage  
**Testing:** Focused `node:test` checks, isolated saved-incident replay, existing postimage measurement, and scoped generated parity  
**Target Platform:** Supported local Windows, macOS, and Linux workspaces  
**Project Type:** Coordination runtime and generated bundle; no UI  
**Performance Goals:** One complete canonical packet at most 262,144 bytes; all other bounds unchanged  
**Constraints:** One production constant change; no new format, compactor, configuration, state, dependency, or harness

## Chosen Change

In `src/skills/dude-work/recovery.mjs`, change only `MAX_PACKET_BYTES = 131_072` to `MAX_PACKET_BYTES = 262_144`. The existing derived export becomes exactly `{items:64,bytes:262144}`. Do not change item accounting or any other production logic or constant, including unrelated limits that also contain `131_072` (FR-001 through FR-007).

All existing consumers keep using that one constant: packet construction/validation, owner-suffix selection, known-postimage preflight, application, and receipt rechecks. Exact sharing already works. Preserve `dude-work-model-view-v1`, complete raw evidence and histories, trusted bindings, order, duplicates, and descriptor-only overflow. A higher fixed cap is the approved bounded change, not a new history-management capability.

## Saved Incident And Postimages

The supplied diagnosis reports a smallest packet of 132,430 bytes against 131,072, a new pair of 7,891 bytes against 6,533 bytes of headroom, and current non-owner content of 131,577 bytes. Sources use 25/64 and descriptors 26/64. Three pending lane events add 5,593 bytes. Expected complete-owner postimages near 165 KB are estimates, not acceptance evidence.

Read the original `runtime-1` through `runtime-5` request/result pairs only from:

```text
C:\Users\EG\.copilot\session-state\da1e3c19-53bc-4d31-a49a-e4c6dac53255\files\062-ship-1977c51a\T004@d062f4a7\
```

Existing diagnosis and reproduction tools are under:

```text
C:\Users\EG\.copilot\session-state\da1e3c19-53bc-4d31-a49a-e4c6dac53255\files\062-evidence-capacity-repair\
```

Treat those locations as read-only evidence. Replay only in disposable canonical roots with fixture-owned authority; never start an adapter with the original invocation/supervisor key or reuse its checkpoint. Compare original file preimages afterward. Preserve raw captures and their historical failures rather than editing inputs to produce success.

| Saved operation | Expected revised-runtime result |
| --- | --- |
| Runtime 1 and 2 inspections | The complete owner log now fits; report actual canonical packet bytes and fresh evidence hashes. A changed hash is expected when the admitted owner suffix grows. |
| Runtime 3 authorization with its old Assessment | `evidence-drift`, with unchanged accepted state, counters, pending entries, and completed tuples. Do not replace the Assessment to call this a successful replay. |
| Runtime 4 with its old Assessment | The same unchanged-state `evidence-drift` refusal. |
| Runtime 5 preparation | The known pending projection fits the revised cap. A separate genuine over-limit control still reports `model-packet-bytes` with limit 262144. |

Reuse `measurePrivatePreflight` in `scripts/fixtures/064-work-receipt-overflow-handling/model-view-test-helpers.mjs` to measure all six fully known postimages: each of the three lane-first event prefixes and each of the three receipt postimages. Report actual complete-owner packet bytes, each at most 262,144; do not add a fixed offset to old measurements. Use the existing test-only inverse to prove complete reconstruction, bindings, descriptors, occurrence order, duplicates, and failed outcomes (FR-002 through FR-006; SC-002/003).

## Tests And Current Guidance

Update current fixed-cap test pins to derive from `limits.bytes`, while explicitly checking the revised export. Exercise 262,143/262,144/262,145 canonical bytes, multibyte text and packet overhead, forged admitted excess, maximal whole-event owner suffixes, unchanged refusal counters, and preservation of earlier effects. Grow synthetic boundary-fixture padding to reach the new ceiling instead of editing historical raw captures (SC-001/003).

Preserve these files and their existing hash pins byte-for-byte:

- `scripts/fixtures/064-work-receipt-overflow-handling/reference.json`
- `scripts/fixtures/064-work-receipt-overflow-handling/retention-episode.json`
- `scripts/fixtures/065-work-history-event-compaction/retained-incident.json`

Change the two current-limit statements in `src/skills/dude-work/SKILL.md`: the exported `{items,bytes}` limit and the exact-known `model-packet-bytes` limit. Update current capacity guidance in `docs/commands.md` and current pins in `scripts/current-format-contract.test.mjs`. Preserve the historical 131020-byte measurement. Touch `docs/workflow.md` or `docs/reference.md` only if a current-limit pin needs correction. The existing 064 helper and README may change only if current-limit-derived padding or its explanation needs adjustment (FR-008; SC-004).

## Guardrails And Delivery

Existing project and bundle guardrails apply; no new rule or UI approval is needed. Use authoritative source and preserve unrelated dirty files. The runtime change remains one constant; tests and current guidance prove and explain it. No supporting markdown, ObjectiveRegistry, or new reproduction harness is needed.

Use an isolated validation copy with the existing fixture README's required source, fixture, and complete static `.dude/{ideas,specs,state,memory,metadata}` inputs. Keep host identities, workers, permission files, and original checkpoints out of that copy. Generate core there with `node scripts/build-dev.mjs --repo <validation-copy>`, not against the live root.

Compare source-derived output and carry only `.github/skills/dude-work/recovery.mjs` and `.github/skills/dude-work/SKILL.md` after checking live preimages for overlap. Carry no manifest, profile, or other metadata change. Prove parity for those two files without claiming whole-tree parity.

Preserve all original 062 files, intent/history, stopped RunState, checkpoint/orphan artifacts, and unrelated user edits; leave the 061/064/065 definition packages unchanged. Do not resume, retry, clean up, or otherwise operate the stopped invocation. No Git action is authorized. Windows `bd.cmd` fixture/POSIX coverage failures remain separately reportable and unfixed.

## Focused Checks

The implementation handoff requires fresh results for these exact focused commands:

```sh
node --check src/skills/dude-work/recovery.mjs
node --test --test-reporter=tap --test-name-pattern="^(model-packet ceiling:|Feature 064 T00[12]:|Feature 065 T001:|Feature 065 T002 SC004:)" src/skills/dude-work/recovery.test.mjs
node --test --test-reporter=tap --test-name-pattern="^(model-packet ceiling:|descriptor-only overflow:|T002 known growth:|T002 application prechecks|Feature 064 T003:|Feature 065 T002 SC003:)" src/skills/dude-work/host-adapter.test.mjs
node --test --test-reporter=tap --test-name-pattern="^Work (capacity guidance|delivery)" scripts/current-format-contract.test.mjs
```

Also require the saved-incident isolated replay, all six known-postimage measurements and evidence/preimage integrity checks above, two-file generated parity, and coordinator `node .github/skills/dude-lint/lint.mjs .` with zero failures. Report actual executed/passed/failed/skipped counts; skipped or zero-match selections are not coverage.

Only if those focused checks cannot establish the stated obligations, extend to the existing three Work suites:

```sh
node --test --test-reporter=tap src/skills/dude-work/recovery.test.mjs src/skills/dude-work/host-adapter.test.mjs src/skills/dude-work/specialist-attestation.test.mjs
```

Do not run repository-wide or browser suites for this non-UI cap revision. No check or replay has been executed by this definition stage.

## Single Implementation Phase

Deliver `T001@b7c9e2a4` as one ordinary non-Work Lightweight slice after first-definition publication and coordinator zero-failure lint. It combines the constant, affected tests, current guidance, and verified generated copies because one focused acceptance result proves the single outcome. Fresh Tester evidence, independent review, task-state changes, and closure remain with their normal owners.

The residual risks are higher model-context demand and eventual exhaustion of the larger fixed limit. Neither warrants another capability or permission.

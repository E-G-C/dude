---
name: "dude-local-core-dogfood-promotion"
description: "Use when a canonical terminal core dogfood promotion task becomes ready after all source-contributing dependencies and pre-promotion acceptance prerequisites have cleared."
---

# Core Dogfood Promotion

## Purpose

Run this repository's post-readiness core dogfood promotion policy. This skill is project-owned and non-shipped: it does not belong in `src/**`, a pack manifest, the bundle manifest, or release output. Static contract tests cover policy text only and do not prove future model behavior, review, promotion, or close decisions.

## Entry Gate

Refuse before the canonical terminal core dogfood promotion task is ready after every source-contributing dependency and pre-promotion acceptance prerequisite has cleared. Specification completion alone is not a trigger.

Re-resolve the exact owner and declaration authority from the active lane. In Lightweight execution, use the canonical task and its canonical header. In Tracked execution, use the corresponding live Beads issue text; `tasks.md` is a non-authoritative mirror and is ignored as live authority.

Validate and consume the existing, already-recorded baseline from the exact owner's `## Coordinator Log`. Revalidate its durable terminal key, `HEAD`, `HEAD:src`, active declaration, source and generated boundaries, and serialized interval. This skill must never invent, construct, create, record, append, repair, replace, or retroactively establish a baseline or baseline line; it only validates and consumes the one already recorded by project guidance. A stale, missing, or mismatched baseline blocks.

## One-Time Feature 009 First Adopter

- Resolve the original valid pre-source baseline for `T009@696e6369` from the exact Feature 009 owner's `## Coordinator Log`. Require that same baseline was established before source mutation and is bound by accepted Feature 009 lifecycle history. Never choose the latest or most recent merely syntactically matching line.
- Parse every baseline candidate in owner-log order. Require exactly one original candidate before the T008 claim, require its `src_tree` to name a Git tree exactly equal to `<baseline-head>:src`, and reject an absent or duplicate original. Reject replacement, repaired, transplanted, post-source, stale, and explicitly void baselines; they authorize nothing. The known existing explicitly void Feature 009 replacement remains non-authorizing history and authorizes nothing, and must never become the selected candidate.
- Take `ORIGINAL_BASE_HEAD` from the selected original baseline evidence. In the fresh checkout, overwrite `CURRENT_HEAD` from `HEAD` and trust no caller or injected value. Require current `HEAD` in the fresh checkout to be a descendant of the original baseline; command failure, a missing commit, or non-descendant status blocks.

```bash
set -eu
ORIGINAL_BASE_HEAD="$(git rev-parse --verify "${ORIGINAL_BASE_HEAD}^{commit}")"
CURRENT_HEAD="$(git rev-parse --verify 'HEAD^{commit}')"
git merge-base --is-ancestor "$ORIGINAL_BASE_HEAD" "$CURRENT_HEAD"
```

- In addition to ancestry, derive the complete ordered revision sequence from the original baseline through fresh current `HEAD` and require the one current user authorization to name that full sequence in exact order, including current `HEAD`, bound to the original owner, terminal, and interval. That one exact explicit authorization must be current and must cover every intervening commit and merge from the original baseline through current `HEAD`. Ancestry alone blocks. A missing, extra, reordered, substituted, or truncated revision blocks. Authorization for another revision, owner, terminal, or interval, or stale or ambiguous authorization, blocks.
- Compute the complete changed set against the original baseline source tree. Outside the exact current transient event defined below, require exact equality to `T009@696e6369` live declaration coverage and reject undeclared or missing, duplicate, directory, glob, or unsorted entries. For the exact current transient event only, enter the T007 packet branch below; do not waive any other first-adopter gate.
- Before the first-adopter decision, reuse the `ordinary ten-command preflight` from project guidance for the `source` and `base-owned generated core` boundaries; source or generated `assume-unchanged`, `skip-worktree`, and `ignored entries` block.
- Before materialization, outside the exact current transient event, the current base-owned generated core inventory, types, and bytes must exactly match the original baseline projection; any hand edit, early materialization, or unrelated generated drift blocks. The current transient event instead proves its generated prestate and exact expected projection through the packet below.
- Re-resolve the current exact owner, terminal, lane authority, completed dependencies, the exact T008 evidence that exists, T006 acceptance, T007 acceptance, protected boundaries, and pre-promotion acceptance. In Lightweight execution, require canonical task bytes and the task-state snapshot to agree; in Tracked execution, require the live Beads issue and ignore the mirror. Require exactly one non-`[P]`, `[Shared]` T009 terminal, all eight T009 dependencies done, and no blocker except the exact T007 acceptance dependency that this packet resolves. T007 itself must depend only on completed T006, have current focused verification plus independent Tester and Code Reviewer acceptance, and leave no unrelated blocker. Any missing, stale, multiple, or mismatched authority blocks.
- Observed or suspected overlapping or concurrent source or base-owned generated activity blocks without actor attribution.
- Any failed, stale, or mismatched gate does not append or record evidence and does not select a new baseline, another baseline, or a replacement baseline.
- This remains one uninterrupted original serialized interval and never creates a new interval or rebases after source change or modification.
- Feature 009 `T009@696e6369` alone owns actual repository materialization and its live declaration; parity and protected-boundary verification; focused, full, lint, compose, and release verification; fresh final independent review; accepted Feature 008 evidence; the Feature 007 correction; and terminal state.
- Every later feature receives zero first-adopter bridge authority and still requires exact recorded ordinary baseline `HEAD`, `HEAD:src`, and every existing lifecycle gate. For every later feature, descendant ancestry or authorized commit or merge continuity never substitutes for, weakens, or generalizes exact future baseline equality.
- `T006@62726964` is policy-only and performs policy interpretation only. It does not run `node scripts/build-dev.mjs` or materialize; change, write, or mutate authoritative source under `src/**` or base-owned generated core; append or record a baseline or accepted evidence; mutate any Feature 009 artifact, owner log, board, snapshot, or task state; close Feature 008 or any task; or copy, duplicate, or list the T009 source declaration, source paths, declared source set, implementation steps, or runbook.

### Current T007 Transient Fresh Packet

This branch is available only for the current Feature 009 first-adopter event in the current main checkout without isolation, with exact owner `.dude/ideas/autonomous-learning-governance.md`, exact spec `.dude/specs/009-autonomous-learning-governance/spec.md`, and terminal `T009@696e6369`, after current focused evidence and independent acceptance for both `T006@62726964` and `T007@9a4e7c12`. No other checkout, adopter, event, owner, spec, terminal, or later feature receives this authority.

Preserve T009's exact accepted ten-path live declaration. T008 supplies only the declaration and changed identity recorded by its claim plus the later close statement that independent source acceptance bound the same frozen identity and reverified it unchanged. Use only the exact T008 evidence that actually exists in the current owner log. Reconcile those exact current owner-log records and current ten-path Git rows; do not manufacture `terminal=`, `declared=`, `changed=`, accepted-`HEAD`, complete-source, or dual-review fields that T008 did not record. The fresh transient packet does not require, reconstruct, or claim historical accepted `HEAD`, complete source identity, or dual-review identity fields from Feature 003, Feature 006, or T008.

Resolve `.dude/specs/003-guarded-directory-artifact-import/spec.md` and `.dude/specs/006-simplify-context-footprint-audit/spec.md` through exact `spec_path` ownership with zero diagnostics, then read current task attribution where available. These Feature 003 and Feature 006 facts are attribution context only: historical terminal, close, source, or review records do not authorize materialization and are not a prerequisite. Missing, ambiguous, or contradictory current attribution blocks without inference.

Freshly derive current `HEAD`, the current source tree, and the complete original-baseline delta from Git. Require exactly 20 path rows with exact status, path, type, mode, object or content identity, and bytes, partitioned disjointly into exactly ten T009 paths, nine Feature 003 paths, and one Feature 006 path. A count error, gap, overlap, duplicate, unsupported type, conflict, path outside the delta, or byte mismatch blocks.

Bind source and base-owned generated inventories independently across index, worktree, untracked, ignored, and hidden-index layers, with file-mode sensitivity and fail-closed ownership classification. A command failure, malformed row, concealed path, non-normal index tag, offsetting dirt, or unexpected source or generated entry blocks. Capture protected-boundary prestate as exact current path, type, mode, content identity, and bytes for installed packs, project and local guidance, workflows, `.dude/**`, and every existing protected boundary.

Evaluate the existing deterministic source-to-generated mapping live over current source. Derive the complete generated inventory, every stale-output cleanup, final type, mode, content identity, and bytes. Independently derive the complete cleanup-root inventory, then require the existing materializer's exact `written` and `removed` arrays, observed delta, and final inventory to match; tracked and untracked stale core roots must both be removed and reported. Preserve source type and mode: regular files use exact bytes and executable mode, symlinks use exact target bytes, unsupported types block, a type change retains its current supported type, and a rename remains one absent row plus one current row. T009 retains its eight listed owned output effects; the ten contributor paths must derive exactly five contributor-owned generated destinations and five explicit no-output results. The disjoint eight plus five projection, unchanged inventory, and cleanup must equal the complete expected projection. Do not freeze contributor destination paths or infer them from suffixes, commit membership, or caller input.

Before materialization, execute focused source, policy, and runtime tests that do not depend on current generated parity. Bind each exact argv, normalized substantive stdout and stderr, exit code, selected test name, failure list, and TAP counts; each command must select exactly its intended test and pass 1/1 with no failure, cancellation, skip, or todo. Include Dude lint or another ancillary check only when it truthfully passes in the unmaterialized state; do not require the recursively discovered full suite, exact parity, compose, or pristine release gates before projection. Separately invoke only `checked-in dev core is a byte-identical non-mutating projection of authoritative source` with an anchored exact-name filter. Bind the actual command output and require exactly that one selected failure, zero other failed or cancelled tests, and independently derive its complete observed path, type, mode, and byte delta. The observed delta must exactly equal the expected projection delta; any other failure, unrelated diagnostic, missing row, extra row, or generic expected-failure allowance blocks.

Send the complete packet to the installed Tester and Code Reviewer authorities. Each must independently reacquire authoritative Git identities and bytes, mapping and cleanup results, ownership and task facts, every dirt layer, protected prestate, and command results, or independently verify every supplied value against those authorities. The substantive Tester record must begin `Tester PASS`; the separate substantive Code Reviewer record must begin `Code Reviewer APPROVE`. Each record binds its own installed-agent authority identity and invocation identity plus the same current lane, `HEAD` and trees, original baseline and full ordered continuity, T006/T007 acceptance, T009 task and declaration, T008 records actually used, all 20 source rows, the disjoint 9/1 contributor partition, generated prestate, complete projection, materializer write/removal/final-inventory result, protected prestate, and pre-materialization verification. A missing, generic, echoed, role-swapped, partial, stale, or mismatched approval blocks.

After both approvals, perform an immediate unchanged recheck of every packet input, including lane and snapshot, exact acceptance records, full continuity, command outputs, materializer result, and both approval authority and invocation identities. If unchanged, the approvals are sufficient materialization only authority for one immediate existing-materializer invocation by T009, without historical accepted identities. Any interruption, context loss, or drift in revision, tree, byte, mode, declaration, authority, dirt, mapping, projection, protected prestate, verification, materializer result, or approval invalidates the packet and requires complete fresh reacquisition and both new approvals from the Tester and Code Reviewer.

The packet is transient. Do not persist or write the packet, approval body, inventory, snapshot, digest, ledger, schema, helper output, state, command contract, API, framework, ObjectiveRegistry, or report, and never reconstruct an invalidated packet. It must not transfer ownership, expand T009's declaration, re-accept or reopen contributor work, or close Feature 003, Feature 006, Feature 008, Feature 009, or any task.

For every ordinary future or later feature, strict behavior requires exact recorded baseline `HEAD` and `HEAD:src` equality and every existing lifecycle gate. Descendant ancestry, authorized continuity, T006, T007, or transient contributor evidence must never substitute for, weaken, or generalize ordinary declaration-equals-changed or baseline equality.

`T007@9a4e7c12` is policy-and-evidence-only. It does not run `node scripts/build-dev.mjs`, materialize, mutate `src/**` or base-owned generated core, mutate Feature 009 or contributor artifacts or state, or close any task. It writes no baseline or accepted evidence and adds no helper, runtime, command, API, schema, state, ledger, framework, ObjectiveRegistry, or persistent report.

### One-Time Final Evidence And Close

For this exact current T009 event, the accepted line textual shape stays unchanged. `declared` hashes only T009's unchanged ten-path declaration, `source` hashes the complete current source inventory, and `changed` hashes all 20 original-baseline rows. The ten `changed` rows outside `declared` must exactly equal the disjoint nine-path Feature 003 plus one-path Feature 006 attribution partition and match current bytes and live mapping evidence.

The canonical `review` record must bind the declared, source, and changed identities; the contributor partition identity and evidence; the complete projection and generated ownership split; post-materialization verification; and ownership boundaries. This adds no accepted-line field and persists none of the transient packet.

Apply this event-only interpretation consistently during changed-set validation, materialization authorization, post-materialization acceptance, the immediate pre-materialization and post-append identity rechecks, latest-match evidence selection, and close. Missing or different 10/20 identities, partition, projection, verification, review, or ownership evidence blocks without corrective mutation.

Every ordinary or later feature retains declaration-equals-changed validation and normal evidence behavior. This one-time interpretation grants no precedent, baseline replacement, ownership transfer, or contributor reacceptance.

## Canonical Evidence

Compute canonical `declared`, `source`, `changed`, and `review` identities. First validate each value against the closed data shapes below, then construct fresh arrays and objects in the exact key insertion order prescribed below. Serialize each value with native Node `JSON.stringify`, passing the value as its sole argument with no replacer and no `space` argument; perform no Unicode normalization, encode that exact result as UTF-8, and compute lowercase hexadecimal SHA-256 over those bytes. Alternate escapes, whitespace, or key orders are not accepted as canonical input. Evidence paths are workspace-relative POSIX paths; duplicate paths, invalid UTF-8 path representations, unsupported path types, incomplete inventories, or noncanonical ordering block.

The `declared`, `source`, and `changed` inventories all sort paths in UTF-8 bytewise lexical order before their closed shapes are constructed and serialized.

### Declared

`declared` is the exact JSON array of all unique terminal-declared file paths, sorted in UTF-8 bytewise lexical order:

```json
["src/agents/dude.agent.md","src/skills/dude-work/SKILL.md"]
```

The Feature 008 bootstrap empty declaration is `[]`. A directory, glob, duplicate, unsorted path, or `none` for a source-writing terminal blocks.

### Source

`source` is one complete JSON array of all current `src/**` file rows sorted by path in UTF-8 bytewise lexical order; omit directories. Every row uses keys in this exact order:

```json
{"path":"src/example.mjs","type":"100644","content":"<base64-exact-bytes>"}
```

Supported types are `100644`, `100755`, and `120000`. Content is the base64 encoding of a regular file's exact bytes or a symlink's exact target bytes. Source tests are included, and unsupported types block.

### Changed

`changed` is one complete JSON array, sorted by path in UTF-8 bytewise lexical order, of every row that differs from the baseline `HEAD:src` tree. Added, modified, and type-changed paths use the current source-row form. A deletion uses exactly:

```json
{"path":"src/removed.mjs","type":"absent"}
```

A rename is one absent row plus one current row. Ordinarily every changed source path must be present in `declared`, and the active declaration must equal the declaration being hashed. Only the exact current T009 event uses the `### One-Time Final Evidence And Close` interpretation: `declared` remains its ten live paths while `changed` contains all 20 original-baseline rows with the exact disjoint 9/1 attribution partition.

### Review

`review` is not a hash of an informal verdict. It hashes this fixed-key-order canonical envelope containing the exact transient substantive independent Reviewer response:

```json
{"version":1,"terminal":"T004@1234abcd","head":"<gitOid>","declared":"<sha256>","source":"<sha256>","changed":"<sha256>","verdict":"APPROVE","record":"<exact substantive Reviewer response>"}
```

The response must bind the durable terminal key, immutable `HEAD`, `declared`, `source`, `changed`, generated parity, fresh verification, and leading `APPROVE` verdict. Keep the response and envelope transient; if the exact response is unavailable after interruption, obtain a fresh independent review.

The accepted evidence line is append-only, contains no source, generated, or review bytes, and must remain under 512 UTF-8 bytes:

```text
- <UTC> - core-dogfood-accepted v1 terminal=<taskKey> head=<gitOid> declared=<sha256> source=<sha256> changed=<sha256> review=<sha256>
```

Use the durable task key, exact `HEAD` OID, and lowercase 64-character digests. Existing lines remain audit history and are not independently sufficient to authorize close.

## Source Acceptance And Materialization

At terminal readiness, re-resolve the exact owner and live terminal, validate completed source dependencies and the transient pre-promotion acceptance, and consume the matching baseline. Compute the complete `declared`, `source`, and `changed` inputs. Ordinarily require every changed path to be declared. For the exact current T009 event, require instead its unchanged ten-path declaration plus the complete 20-row changed set and exact disjoint 9/1 attribution under `### One-Time Final Evidence And Close`. In either branch require the live declaration to match. Immediately before materialization, recheck `HEAD`, `HEAD:src`, owner, terminal, declaration, source, changed rows, the serialized interval, and generated preflight; all previously accepted identities must still match.

After legitimate coordinator mutations, capture transient sorted path, type, and content evidence for installed `dude-pack-*` artifacts, `.github/skills/dude-local-core-dogfood-promotion/**`, `.github/skills/project/**`, `.github/workflows/**`, and `.dude/**`. Materialization must preserve every one of those boundaries exactly; compare the transient evidence afterward and do not persist it.

Run `node scripts/build-dev.mjs` only when `changed` is nonempty, then prove the exact expected generated inventory and bytes and confirm the protected boundaries are unchanged. A source test under `src/**/*.test.mjs` keeps `changed` nonempty even when it has no generated destination.

When `changed` is empty, do not run `node scripts/build-dev.mjs`; perform read-only parity instead and make no materialization mutation.

## Verification And Close

After materialization, require focused tests, the recursively discovered full repository suite, exact parity, Dude lint, compose verification, a pristine release build and release lint in an external directory, intended-scope and whitespace checks, all terminal gates, and fresh final independent review. Any command failure or worktree mutation outside the accepted feature diff blocks.

The independent final review must substantively bind the current terminal, `HEAD`, `declared`, `source`, `changed`, generated parity, and fresh verification. Only after it returns `APPROVE` may the coordinator append the accepted line. Immediately after that append, recompute every bound identity and require all identities, evidence, parity, and the exact review envelope to remain identical; drift leaves the new line as stale audit history.

After the append and immediate recheck, derive the existing runtime `AcceptedFeatureEvidenceV1` in `core-close` mode from the exact definition, baseline line, newly appended accepted line, current `HEAD`, `declared`, complete `source`, `changed`, verification, final review envelope, and `review`; recompute and validate `acceptedFeatureEvidenceIdentity` before it can authorize later incident work. For the exact current T009 event only, those inputs are its unchanged ten-path `declared`, complete current `source`, and complete 20-row `changed`. Every ordinary or later feature instead supplies declaration-equals-changed inputs.

Close only when the newest accepted line in the current exact owner's log matches the durable terminal key, `HEAD`, declaration, source, changed set, and review. Close uses only the latest matching accepted line, and that line authorizes close only when it is also the newest accepted line in that log. The exact current T009 lookup must use its unchanged ten-path `declared`, complete 20-row `changed`, and bound 9/1 partition interpretation. An older mismatch may remain audit history only when a newer exact match is the newest accepted line; any newer mismatch blocks rather than falling back to an older match. Any owner append difference or post-append drift in source, generated inventory, declaration, partition, verification, review, or protected bytes leaves the line stale and blocks close.

A missing baseline, undeclared path, declaration mismatch, post-review drift, generated drift, failed verification, or independent final review verdict `REJECT` blocks mutation, acceptance, close, and delivery claims. Missing or mismatched owner, terminal, source, generated, declaration, verification, or review evidence blocks the same way.

Do not add any new compiler, runtime, helper, command, framework, state store, ledger, or persistent report for this policy, and do not duplicate declarations or evidence in Beads notes.
# Implementation Plan: Automatic Core Dogfood Promotion

## Summary

Preserve the accepted core dogfood lifecycle and completed T006 continuity foundation, then revise `T007@9a4e7c12` in place to implement one transient fresh current-session acceptance route for exactly the current Feature 009 `T009@696e6369` materialization event. The route keeps the original valid pre-source baseline as immutable comparison authority, proves current `HEAD` is an explicitly authorized descendant, and derives the complete current 20-path source delta and expected complete generated projection from current repository evidence.

The revised route removes the impossible dependency on historical durable accepted HEAD, complete source, or dual-review identity fields from Features 003 or 006 or Feature 009 T008. It does not claim or reconstruct those fields. T008 supplies only its exact declaration and changed-identity evidence that exists; Feature 003 and Feature 006 owner and task records supply current attribution where available. Materialization authority instead comes from a passable pre-materialization packet plus independent Tester and Reviewer approvals grounded in independently reacquired or verified authoritative evidence.

The route separates authorization from terminal acceptance. Before materialization, it requires focused source, policy, and runtime checks that do not depend on current generated parity, deterministic complete projection and cleanup derivation, protected-prestate and dirt proof, and one isolated named parity-sensitive failure whose exact delta equals the expected projection delta. It includes Dude lint or another check only when that check can truthfully pass before projection. After materialization, T009 still runs the recursively discovered full suite, exact parity, lint, compose, pristine release build and lint, intended-scope and whitespace checks, fresh final independent review, and every existing terminal gate.

For this event only, the unchanged accepted-line format has explicit semantics: `declared` binds T009's unchanged ten-path declaration, `source` binds the complete current source inventory, and `changed` binds the complete 20-path original-baseline delta. The additional ten paths must exactly equal the fresh disjoint nine-path Feature 003 plus one-path Feature 006 attribution partition. T009 retains ownership of its eight listed generated outputs; five additional contributor-owned outputs and five no-output results are derived live from the ten contributor paths. Final intended scope is the complete disjoint global projection, not only T009's eight paths.

Implement T007 tests first in `scripts/current-format-contract.test.mjs`, then make minimal policy changes in `.github/skills/project/SKILL.md` and `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`. The project skill remains the concise pre-source and routing authority. The local skill remains the terminal-ready procedure owner and defines packet acquisition, invalidation, immediate-use authority, materialization handoff, and strict later-feature behavior. No new schema, evidence format, helper, runtime, state, store, ledger, API, framework, report, or command is introduced.

T007 performs no repository materialization and changes no `src/**`, base-owned generated core, Feature 009 artifact, owner log, task state, or generated board. After T007 receives focused evidence and independent acceptance, T009 alone acquires and consumes the packet, performs materialization, and claims acceptance only for its own work. Feature 003 and Feature 006 retain their existing ownership and history without retroactive acceptance or closure. Feature 008 T002 then resumes when full materializer verification is green, and T003 performs final bootstrap acceptance.

The canonical feature identity remains `.dude/specs/008-automatic-core-dogfood-promotion/spec.md`. This redefinition does not complete Feature 008.

## Technical Context

**Language/Version**: Dependency-free JavaScript ES modules on Node.js >= 20, Markdown skill contracts, Git, and shell embedded in existing repository guidance.

**Primary Dependencies**: Node built-ins, Git, existing source and ownership resolvers, existing `scripts/build-dev.mjs`, existing project and local skills, Node's built-in test runner, Dude lint, Dude compose, and independent review authorities.

**Storage**: No new storage. Existing coordinator-owned owner logs remain durable baseline and final acceptance evidence. The pre-materialization packet, inventories, protected-boundary snapshot, verification identities, and Tester and Reviewer approvals remain transient and immediate-use only.

**Testing**: Tests-first T007 additions to `scripts/current-format-contract.test.mjs`; existing Core Dogfood policy-contract and temporary-Git fixtures; focused source, policy, and runtime verification that can pass before projection; exact isolation of the named expected parity failure; Dude lint or other checks only when passable in the unmaterialized state; deterministic scope, no-source, no-generated-core, and no-Feature-009-write checks; independent Tester and Reviewer evidence reacquisition exercises. T009 retains the recursively discovered full suite and every lint, compose, release, parity, scope, whitespace, and final-review gate after materialization. Later T002 and T003 retain their existing acceptance gates.

**Target Platform**: Maintainer Git worktrees on supported desktop platforms and GitHub Actions Ubuntu runners using Node 20 and 22.

**Project Type**: Reusable bundle repository with authoritative core source under `src/`, committed generated dogfood under base-owned `.github/`, project-local workflow guidance, and Lightweight feature state under `.dude/`.

**Performance Goals**: Ancestry, inventory, declaration, attribution, projection, and byte checks remain linear in relevant commit ancestry, paths, and bytes. The route adds no service, daemon, network dependency, or persistent process.

**Constraints**: No isolation for this event. No new dependency, schema, API, helper artifact, runtime, command, framework, state store, ledger, ObjectiveRegistry, or persistent report. No materialization in T007. No `src/**`, base-owned generated-core, Feature 009 package, Feature 009 owner-log, or Feature 009 state write. No hardcoded current OID, content hash, generated byte set, or inferred historical acceptance. Reuse current Git, owner/task attribution, materializer mapping, verification surfaces, and independent roles.

## Guardrail Check

| Guardrail | Plan response |
|---|---|
| Prefer deterministic validation | Use exact terminal identity, fail-closed ancestry, canonical Git inventories, live declarations, tree/type/mode/object/byte identities, materializer mapping, expected cleanup and projection, protected-boundary comparison, and section-aware contracts for deterministic facts. |
| Reserve model reasoning for semantic decisions | Explicit continuity authority, concurrency suspicion, and substantive Tester and Reviewer approval remain independent judgments over the complete freshly derived packet. |
| Keep model guidance concise | Add one short first-adopter route and sequence to the project skill; keep detailed continuity gates in the existing local procedure. |
| Choose the smallest justified design | Reuse the original owner-log baseline, live T009 declaration, T008 evidence that exists, current owner/task attribution, Git, the current classifier and materializer, existing tests, and independent roles. |
| Keep optional disciplines opt-in | The user explicitly selected the current main checkout for this event; do not create or require isolation. |
| Protect unrelated work | Any unrelated or ambiguous source, generated, protected-boundary, or authority drift blocks; nothing is cleaned, adopted, or reclassified. |

No new guardrail is proposed.

## Existing Authorities And Current State

- `.github/skills/project/SKILL.md` is the accepted concise pre-source baseline and routing authority.
- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` is the accepted detailed post-readiness procedure owner.
- `scripts/current-format-contract.test.mjs` owns project-local Core Dogfood policy contracts and temporary-Git predicates.
- `scripts/build-dev.mjs` remains the sole repository materializer. The bridge does not invoke it.
- `scripts/build-dev.test.mjs` retains the accepted T002-local repair. T002 remains blocked because committed Feature 009 source is not yet materialized into base-owned generated core, so its exact full verification is still red outside that repair.
- T001, T004, T005, and T006 are completed accepted work and are not reopened.
- T004 established pre-resolver hidden-index proof and the project/local procedure split.
- T005 completed the remaining pre-resolver changes: the guard observes a failing `git ls-files`, uses a temporary file under `set -eu`, labels the full preflight as ten commands, and anchors ordering tests on the guard fence. No current implementation uses the stale process-substitution form described by the prior plan.
- T006 established the exclusive T009 descendant-continuity bridge, fresh checkout-HEAD binding, the closed rejection matrix, and ordinary preflight reuse. Its accepted refusal of the current checkout is preserved: the original-baseline delta has 20 source paths while T009's accepted declaration has ten.
- T003 remains the open explicit no-source bootstrap terminal. Its acceptance meaning survives and gains only the T007 dependency and composed-bridge coverage required by the sequence.
- Feature 009 `T009@696e6369` is the sole intended first adopter and remains authoritative for its live terminal declaration and implementation.
- Feature 009 T008 is complete. Its exact declaration and changed-identity evidence that actually exists are inputs; no missing accepted HEAD, complete source, or exact dual-review identity is inferred.
- Feature 003 remains the owner of the nine merged bundle-import and lint paths, and Feature 006 remains the owner of the one merged agent-frontmatter test path. Their exact current owners and tasks are attribution context, not historical materialization authority.
- T007 must resolve current attribution exactly where available and fail on resolver diagnostics or contradictory ownership. It must not require, reconstruct, or claim absent historical accepted identities.
- Feature 009 state and blockers remain under Feature 009 authority and are unchanged by this definition. T009 eligibility must be freshly resolved after T007 acceptance.
- The current 20-path delta and complete expected generated projection are derivable from current Git trees and bytes plus the existing mapping. Fresh Tester and Reviewer approval can therefore bind a complete current packet without a new persistent representation.
- No generated Feature 008 board, `## Discovered During Execution`, or `## Lightweight Execution History` exists.
- No active ObjectiveRegistry exists or is needed.

## Chosen Design

### 1. Preserve Procedure Ownership

Keep the existing ownership split:

- `.github/skills/project/SKILL.md` owns the terminal convention, complete ordinary pre-source baseline contract, concise first-adopter designation and sequence, and route to the local procedure.
- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` owns terminal-ready evidence, the one-time transient packet gate, materialization authority, invalidation and reacquisition, protected-boundary checks, final verification, independent review, accepted evidence, and close refusal.
- `scripts/current-format-contract.test.mjs` proves visible policy and deterministic predicate coverage only. It does not claim to prove future model routing, authorization judgment, review, materialization, or close behavior.

Do not duplicate T009's ten-path declaration or freeze current hashes, modes, bytes, or generated results. Resolve the live declaration from the active lane and derive all other packet identities from the current checkout immediately before use.

### 2. Preserve The Normal Terminal Contract

For planned exact `src/**` writes, definition continues to require exactly one open, non-`[P]`, `[Shared]` terminal with one complete `declared-src:` clause and durable dependencies on every source contributor. Exact backticked paths are unique and sorted in UTF-8 bytewise lexical order; directories and globs are invalid.

A normal no-source definition derives no terminal. Feature 008's `declared-src: none` terminal remains an explicit bootstrap exception and cannot authorize source mutation.

The independent Reviewer rejects a missing, second, closed, parallel, non-shared, malformed, incomplete, unsorted, duplicate, directory, glob, or contributor-deficient terminal.

### 3. Preserve Lane And Owner Authority

Start from the exact selected `spec_path` and require one exact direct owner with one owner log. Never infer identity from slug, package directory, title, branch, or task prose.

- Lightweight declaration authority is the canonical live task header.
- Tracked declaration authority is the corresponding live Beads issue text.
- A tracked `tasks.md` mirror and Beads notes are never declaration or evidence authority.
- The unique owner log remains the common append-only evidence carrier.

The route resolves Feature 009 from its exact package identity and live terminal authority. It does not read a copied declaration from Feature 008.

For the other ten paths, resolve the exact current Feature 003 and Feature 006 owners by exact `spec_path` and read current durable task attribution where available. A resolver diagnostic, multiple owner, contradictory attribution, or inferred ownership blocks. Missing historical accepted HEAD, source, or dual-review fields do not block because those records are context only and are never synthesized.

Current inputs are:

- the exact Feature 009 owner and package for original baseline, explicit continuity, T008 evidence that exists, and live T009 declaration;
- exact current Feature 003 and Feature 006 owners and tasks for attribution of inherited paths where available;
- current Git commit and source/generated trees, index and worktree facts, types, modes, object identities, and bytes;
- the existing source-to-generated mapping and materializer cleanup behavior;
- the current protected-boundary inventory;
- focused source, policy, and runtime verification that does not require current generated parity;
- conditional lint or other checks only when they can truthfully pass before projection;
- exact proof that one isolated named parity-sensitive failure equals the packet-described projection delta and that no unrelated failure exists;
- fresh independent Tester and Reviewer approvals based on independently reacquired or verified authoritative facts.

### 4. Acquire And Consume The Transient Packet

Add no evidence schema or second ledger. The one-time procedure holds the following inputs only in the current session:

1. Capture current checkout `HEAD`, the current source tree, and the original valid baseline identity; prove descendant ancestry and explicit continuity.
2. Resolve T009's exact active-lane declaration and require its accepted ten paths unchanged. Read only T008's exact declaration and changed-identity evidence that exists.
3. Derive the complete current source delta from the original baseline using current Git tree entries and current bytes. Require exactly 20 paths and bind each path's type, mode, object or content identity, and bytes.
4. Resolve exact current Feature 003 and Feature 006 owner/task attribution where available. Keep it as responsibility context; do not treat historical completion or review text as materialization authority.
5. Run the accepted source and generated dirt queries separately for index, worktree, untracked, ignored, and hidden-index layers. Every command must succeed, every tracked tag must be normal, and no unexpected dirt may be hidden or cancelled across layers.
6. Evaluate the existing mapping over the complete current source inventory and derive the expected complete generated inventory, exact destinations, explicit no-output results, stale-output removals, types, modes, content identities, and bytes. This is the projection oracle; no frozen list or caller-authored expected bytes may substitute for it.
7. Capture the protected-boundary prestate as exact path, type, mode, content identity, and bytes for immediate post-materialization comparison.
8. Run focused source, policy, and runtime checks that do not require current generated parity. Run Dude lint or another check before projection only when its contract can truthfully pass in the unmaterialized state; do not treat an expected failure as a pass.
9. Isolate `checked-in dev core is a byte-identical non-mutating projection of authoritative source` in `scripts/build-dev.test.mjs` with an anchored exact-name filter and run no other test in that invocation. Require exactly that one selected test to fail, require zero other failed, cancelled, or unexpectedly selected tests, and independently derive the observed path, type, mode, and byte delta between generated prestate and expected projection. That complete observed delta must equal the packet-described projection delta. A different title, second failure, unrelated diagnostic, missing delta, extra delta, generic expected-failure classification, or differently shaped mismatch blocks.
10. Send the complete packet to an independent Tester and an independent Reviewer. Each must independently reacquire the authoritative repository identities, bytes, mapping results, ownership facts, and command results, or independently verify every supplied value against those authorities. Each substantive approval must bind the current HEAD, original baseline, continuity, T009 task and declaration, T008 evidence actually used, complete source identities, contributor partition, expected generated cleanup and projection, dirt results, protected prestate, and passable verification. A generic approval or packet echo is insufficient.
11. Immediately rederive and compare every bound identity after both approvals. Any interruption, context loss, changed HEAD, byte, authority, declaration, dirt result, mapping, projection, protected prestate, verification, or approval invalidates the packet.
12. If the recheck is identical, the packet is sufficient authority for T009 to invoke the existing materializer once, immediately. It grants no other authority.

No packet, approval body, inventory, protected snapshot, or pre-acceptance digest is written to a new file, owner-log field, state surface, schema, report, or command output contract. If invalidated, discard it and reacquire every input and both approvals from current evidence.

### 5. Preserve Coordinator Log Ownership

Only the coordinator appends baseline or final accepted evidence. T006 and T007 append neither, and the transient packet is never appended.

Existing baseline and accepted line shapes remain unchanged. Stale and void lines remain append-only audit history and cannot authorize work.

For this exact current T009 event, preserve the accepted line's literal shape while interpreting its digests as follows:

- `declared` hashes only the unchanged ten paths in T009's live declaration;
- `source` hashes the complete current `src/**` inventory under the existing canonical shape;
- `changed` hashes all 20 rows in the original-baseline delta, including the ten rows outside `declared`;
- `review` binds `declared`, `source`, and `changed` plus the fresh disjoint 9/1 contributor partition identity and evidence, complete generated projection, post-materialization verification, and ownership boundaries.

The additional ten `changed` rows must exactly equal nine current Feature 003 paths plus one current Feature 006 path, be disjoint from T009's declaration, and match current source bytes and live mapping results. This exact exception is applied consistently during changed validation, materialization authorization, post-materialization acceptance, the immediate identity recheck, latest-match evidence selection, and close. It does not alter the durable line grammar or add a field. Every later and ordinary feature continues to require every changed row to appear in `declared` and retains normal evidence behavior.

The first adopter resolves the original valid baseline from the Feature 009 owner history. Current historical evidence identifies it as:

```text
head=136f6bb8353de887a94afc26b5197524cb78d935
src_tree=441141883cdf6589e6294ab255f8d30330bbb2af
```

These OIDs document the current owner-log fact only. Policy behavior must resolve and validate the original valid owner-log record and must not hardcode either OID in the project skill, local skill, or tests.

The later attempted record with `head=b6f94f3563fe12655d5e900c1372d68c0c337825` and `src_tree=c8d0563e5f90a262de7b50e1d125d33718764f32` is followed by an explicit `VOID` owner-log record because mandatory parity had not passed. It authorizes nothing and is never a fallback, replacement, or repair.

### 6. Preserve The Ordinary Post-Readiness Lifecycle

Outside the one exact adopter, retain the accepted local procedure without change:

1. require an exact current baseline whose `HEAD` and `HEAD:src` match the recorded ordinary interval;
2. require exact owner, terminal, declaration, source dependencies, and pre-promotion acceptance;
3. compute canonical evidence and require all changed source paths to be declared, except for the exact current T009 event's fresh disjoint 9/1 contributor partition under the Section 5 interpretation;
4. snapshot protected project boundaries;
5. materialize only when the changed set is nonempty;
6. prove exact generated inventory and bytes plus protected preservation;
7. after materialization, run focused gates, the recursively discovered full suite, lint, compose, pristine release build and lint, release integrity, intended-scope and whitespace checks, final parity, and fresh independent review;
8. append accepted evidence only after approval and immediately revalidate it;
9. close only against the latest matching evidence.

A missing or stale baseline, declaration mismatch, source drift, generated drift, verification failure, rejected review, or authority mismatch blocks without corrective mutation.

### 7. Complete Pre-Terminal Baseline Contract In The Project Skill

Section 7 now describes the accepted T004 and T005 implementation, not future work.

#### 7.1 Pre-Resolver Guard

Before the source resolver or ownership classifier executes repository source, run the four raw source dirt queries and the source hidden-index query from the ten-command preflight. Every command must succeed; dirt outputs must be empty; every tracked source entry must have the normal uppercase `H` tag.

The accepted guard observes `git ls-files` failure by redirecting its NUL-delimited output to a temporary file under `set -eu` before reading it:

```bash
set -eu
GUARD_TMP="$(mktemp -d)"
trap 'rm -rf "$GUARD_TMP"' EXIT HUP INT TERM
git ls-files -v -z -- src >"$GUARD_TMP/source-index-flags"
while IFS= read -r -d '' SRC_INDEX_ENTRY; do
    case "$SRC_INDEX_ENTRY" in
        H\ *) ;;
        *) exit 1 ;;
    esac
done <"$GUARD_TMP/source-index-flags"
rm -rf "$GUARD_TMP"
trap - EXIT HUP INT TERM
```

A nonzero Git exit, lowercase tag including assume-unchanged, `S` skip-worktree tag, malformed entry, or dirty source result blocks before either repository-source step. The ordering contract anchors on the `SRC_INDEX_ENTRY` guard fence. There is no process-substitution implementation and no remaining eight-command label.

After that guard, resolve the exact owner and terminal from authoritative source and the active lane. Any diagnostic, absent or multiple owner, path mismatch, missing or duplicate owner log, invalid terminal, declaration defect, or missing contributor blocks.

#### 7.2 Immutable Ordinary Identities

Capture exact current commit and source-tree identities before ordinary source mutation and require the source object to be a tree. Recompute both after all preflight checks and require byte equality before recording baseline evidence.

The first-adopter bridge in Section 8 does not recapture these identities. It consumes the already-valid original Feature 009 values and applies its separate continuity proof.

#### 7.3 Ten-Command Owned-Boundary Preflight

Retain all ten NUL-delimited commands: independent index-versus-base, worktree-versus-index, untracked, ignored, and hidden-index checks for `src/**`, plus the same five result classes for `.github/**`.

- Every command must succeed.
- All four tracked comparisons force file-mode comparison.
- Source dirt always blocks.
- Every generated candidate is passed through the authoritative ownership classifier.
- Only base-owned generated-core candidates block this predicate; pack, local, and project tiers remain outside it and are neither cleaned nor reclassified.
- Invalid UTF-8, boundary escape, unknown tier, malformed hidden-index row, or classifier failure blocks.
- Independent index and worktree layers prevent offsetting changes from cancelling.
- Lowercase hidden flags and skip-worktree flags block for source and base-owned generated core.

Then run the existing named read-only parity test and require no worktree mutation. Missing, stale, unexpected, or byte-different generated output blocks.

#### 7.4 Baseline Append And Immediate Recheck

Only after owner and terminal resolution, immutable identity capture, the complete ten-command preflight, fail-closed classification, current parity, and final identity comparison pass may the coordinator append the existing baseline line.

Immediately before ordinary first source mutation, repeat owner, terminal, declaration, identity, cleanliness, classification, and parity checks. A failure leaves the line as stale history and authorizes no source write.

#### 7.5 One Serialized Ordinary Interval

After a successful recheck, hold one locally controlled interval through materialization. A changed ordinary `HEAD`, source tree, terminal, declaration, unexpected source path, early generated-core mutation, or suspected concurrency blocks. Wait for a clean boundary or use isolation only after explicit user approval. Never transplant or retroactively create baseline evidence.

For normal future features, this strict exact identity rule remains unchanged. Section 8 is the only exception and only for its exact adopter.

### 8. One-Time Feature 009 Transient Acceptance Route

#### 8.1 Exact And Exclusive Designation

The bridge applies only when all of these identities are exact and current:

- Feature 009 exact package owner;
- terminal `T009@696e6369`;
- open, non-`[P]`, `[Shared]` live terminal authority;
- completed Feature 009 T008 with its exact recorded declaration and changed-identity evidence;
- completed and independently accepted Feature 008 continuity task `T006@62726964`;
- completed and independently accepted Feature 008 transient-route task `T007@9a4e7c12`;
- current main checkout, with no isolated-worktree route for this event.

Any other owner, feature, terminal, task key, lane mapping, or later feature receives no bridge authority.

T007 depends on completed T006, not T002. T006 already depends on completed T004 and T005, with T004 depending on T001. This preserves the accepted foundation and avoids recreating the materialization cycle.

#### 8.2 Resolve The Original Valid Baseline

From the exact Feature 009 owner log, identify the original valid pre-source baseline record for `T009@696e6369` and validate that owner history establishes it before source mutation with its required preflight and immediate recheck.

Require the same record to be the baseline referenced by the accepted Feature 009 lifecycle history. Do not select the latest syntactically matching line. Reject every later replacement, repaired, transplanted, post-source, stale, or explicitly void line.

The original line is immutable comparison authority for the entire bridge. No bridge path appends, rewrites, repairs, or supersedes it.

#### 8.3 Acquire One Complete Fresh Packet

Before T009 materialization, the local skill performs all of the following in one current evidence packet:

1. **Descendant proof**: prove current `HEAD` is a descendant of the original baseline commit. Equality is allowed by ancestry but is not required for this adopter. Command failure, missing commit, or non-descendant status blocks.
2. **Explicit authorization**: require exact current owner-log evidence that the intervening commit and merge continuity was explicitly authorized. Ancestry alone, informal inference, or authorization for another revision or interval blocks.
3. **Live declaration and existing T008 evidence**: resolve T009's exact live accepted ten-path declaration from the active lane and require it unchanged. Read T008's exact declaration and changed-identity evidence that actually exists. Do not require or infer a historical accepted HEAD, complete source identity, or dual-review binding.
4. **Fresh current source identity**: derive the complete source delta from the original baseline tree and current checkout. Require exactly 20 paths and bind each path's status, type, mode, object or content identity, and bytes. Any addition, deletion, rename, conflict, hidden suppression, unexplained byte, or count mismatch blocks unless represented exactly in the current packet.
5. **Current attribution context**: resolve Feature 003 and Feature 006 by exact `spec_path` with zero diagnostics and read exact current task attribution where available. Preserve that context in the review request, but do not make historical terminal, source, or review evidence a materialization prerequisite or authority.
6. **Current dirt layers**: run the full source and generated index, worktree, untracked, ignored, and hidden-index checks with file-mode sensitivity and fail-closed ownership classification. Bind every result. A failed command, malformed result, concealed path, unexpected dirt, or offsetting-layer attempt blocks.
7. **Live complete projection oracle**: evaluate the existing source-to-generated mapping and materializer behavior against the complete current source inventory. Preserve T009's eight listed generated destinations as its owned output scope. Evaluate the ten contributor paths live to derive exactly five additional contributor-owned generated destinations and five explicit no-output results. Derive stale-output removals, unchanged global inventory, final types, modes, content identities, and expected bytes. Do not freeze contributor destination paths or rely on a caller-authored path, hash, or byte list.
8. **Current generated prestate**: bind every current base-owned generated path's index, worktree, untracked, ignored, hidden-index, type, mode, identity, and bytes. Require the only parity difference to be the exact unmaterialized projection described by the packet; hand edits, early output, stale output outside expected cleanup, symlink drift, or unexplained bytes block.
9. **Protected-boundary prestate**: snapshot exact path, type, mode, content identity, and bytes for installed packs, project guidance, workflows, `.dude/**`, and every other protected boundary used by the existing materializer checks.
10. **Current authority**: re-resolve exact T009 owner, live terminal and declaration, dependencies, T008 evidence, accepted T006 and T007, explicit continuity, and pre-promotion readiness. Bind current Feature 003 and Feature 006 attribution without treating it as historical acceptance authority. Any diagnostic, ambiguity, missing prerequisite, or mismatch blocks.
11. **Passable pre-materialization verification**: run and bind focused source, policy, and runtime checks that do not require current generated parity. Run Dude lint or another check only when it can truthfully pass before projection. Separately run only `checked-in dev core is a byte-identical non-mutating projection of authoritative source` from `scripts/build-dev.test.mjs` through an anchored exact-name filter. Require exactly that selected test to fail and zero other failed, cancelled, or unexpectedly selected tests, then independently derive the observed generated-prestate-versus-expected-projection delta and require exact path, type, mode, and byte equality with the packet-described projection delta. Do not require the recursively discovered full suite, exact parity, compose, or pristine release gates to pass before projection when they depend on materialization.
12. **No concurrency**: observed or suspected overlapping source or base-owned generated-core activity blocks without actor attribution.
13. **Fresh dual independent approval**: present the complete packet to an independent Tester and an independent Reviewer. Each role must independently reacquire the authoritative repository, byte, mapping, ownership, and command evidence, or independently verify every supplied fact against those authorities. Each substantive record must approve and bind the current HEAD and trees, original baseline and continuity, T009 task and declaration, T008 evidence actually used, all 20 source identities, fresh disjoint 9/1 partition, every dirt layer, generated prestate, expected cleanup and complete projection, protected prestate, passable checks, and exact expected parity failure. A generic, echoed, partial, stale, or mismatched approval blocks.
14. **Immediate unchanged recheck**: after both approvals and immediately before materialization, reacquire and compare every packet input. Any interruption, context loss, changed HEAD, tree, byte, mode, declaration, authority, dirt result, mapping, expected projection, protected prestate, verification, or approval invalidates the entire packet.
15. **No new baseline or persistent packet**: a failed or stale gate appends no baseline and writes no packet, digest, approval body, inventory, schema, state, helper output, or report. Reacquisition starts from current evidence.

When all gates and the immediate recheck pass, the fresh Tester and Reviewer approvals are sufficient materialization authority for this exact T009 event. Historical Feature 003, Feature 006, and T008 records remain attribution and lifecycle context only.

#### 8.4 One-Time Canonical Evidence And Complete Generated Scope

Changed-set validation has one explicit event-scoped branch:

1. Resolve and hash T009's unchanged ten-path live declaration as `declared`.
2. Hash the complete current source inventory as `source` under the unchanged canonical source shape.
3. Derive and hash the complete 20-path original-baseline delta as `changed`.
4. Require the ten `changed` paths outside `declared` to equal exactly the fresh disjoint nine-path Feature 003 plus one-path Feature 006 partition, with current bytes, current owners, current tasks, and live mapping evidence.
5. Reject a missing, extra, overlapping, stale, differently attributed, byte-different, or mapping-different row.

The same branch remains active for packet authorization, the immediate pre-materialization recheck, post-materialization final review, accepted-line creation, immediate post-append recheck, latest-match lookup, and close. The accepted line remains exactly:

```text
- <UTC> - core-dogfood-accepted v1 terminal=<taskKey> head=<gitOid> declared=<sha256> source=<sha256> changed=<sha256> review=<sha256>
```

The final `review` envelope binds both source-set identities, the contributor partition identity and evidence, the complete generated projection, all post-materialization verification, and ownership boundaries. The transient packet remains unpersisted; only this normal final post-materialization evidence is durable.

T009's intended generated scope is interpreted for this event as its eight already listed and owned destinations. The global materializer is additionally authorized to write the five contributor-owned destinations derived live from the ten contributor paths, while the other five contributor paths are explicit no-output results. Final scope checks require those two generated sets to be disjoint, require their union plus unchanged inventory and applicable stale cleanup to equal the complete expected projection, and require no unexplained output. T009 claims and accepts only its eight outputs. The contributor features retain ownership and prior acceptance of the five additional outputs; materialization neither reopens nor re-accepts them.

#### 8.5 One Original Interval, Not Rebaselining

Authorized commit or merge continuity means the original serialized interval remained logically continuous despite explicitly permitted repository revision movement. It does not mean a second interval starts at current `HEAD`.

Therefore:

- changed-source comparison remains anchored to the original baseline source tree;
- T009's accepted ten-path declaration remains current and unchanged;
- T008 contributes only evidence that actually exists;
- the complete current delta and expected projection are freshly derived rather than accepted from historical identity fields;
- Feature 003 and Feature 006 ownership and task history remain unchanged and are not converted into new acceptance;
- no later line can make the changed set empty by moving the comparison base after source changes;
- a void replacement line remains non-authorizing history;
- a missing gate blocks and requires fresh packet acquisition rather than a reconstructed field.

#### 8.6 Normal Future Gates Remain Unchanged

After this one current adopter event, the local skill returns to strict ordinary behavior. Every later feature requires exact recorded baseline `HEAD` and `HEAD:src` matching, a clean ordinary interval, and all existing lifecycle gates. No future terminal may cite Feature 009, T006, T007, this transient packet, descendant continuity, or authorized merge continuity as a substitute for normal baseline equality.

#### 8.7 Preserve Feature 009 Ownership

The bridge authorizes only policy interpretation. Feature 009 `T009@696e6369` retains sole ownership of:

- actual repository materialization;
- its live declared source set;
- parity and protected-boundary verification after materialization;
- focused tests, the recursively discovered full suite, lint, compose, pristine release build and lint, complete generated-scope, final parity, and whitespace gates after materialization;
- fresh final independent review;
- the matching accepted Feature 008 evidence line and immediate recheck;
- derivation of its accepted feature evidence;
- its separate Feature 007 correction and review;
- its terminal state.

T009's accepted source declaration and acceptance claim remain limited to its own ten paths, and its generated-output ownership remains limited to its eight listed destinations. Feature 003 and Feature 006 retain their five live-derived generated destinations, source ownership, task history, prior acceptance records, and closure unchanged. Neither Feature 008 nor Feature 009 retroactively accepts, reopens, transfers, or closes that contributor work.

Feature 008 T007 copies none of the materialization steps, lists no declared source paths, appends no evidence, and mutates no Feature 009 or contributor package, owner log, board, snapshot, or task state.

### 9. Tests-First Transient Acceptance Route

Preserve completed T006 behavior and evidence. Write failing T007 assertions first in `scripts/current-format-contract.test.mjs`. Extend the existing Core Dogfood section-aware and temporary-Git coverage without adding a helper file or persistent fixture.

Focused contracts must prove:

- exact exclusive designation of Feature 009 `T009@696e6369`;
- route entry only after T006 and T007 focused evidence and independent acceptance;
- execution in the current main checkout with no isolated-worktree requirement or fallback for this event;
- original valid baseline resolution from owner history rather than literal OID policy;
- explicit rejection of the known void/replacement line and generic replacement fixtures;
- fail-closed descendant proof;
- explicit commit or merge authorization in addition to ancestry;
- unchanged T009 ten-path declaration and use of only the exact T008 declaration and changed-identity evidence that exists;
- explicit absence of any requirement or reconstruction for historical accepted HEAD, complete source, or dual-review identities from Features 003, 006, or T008;
- current source-delta computation relative to the original baseline with exactly 20 fresh path/type/mode/identity/byte records;
- zero-diagnostic exact resolution of Feature 003 and Feature 006 owners plus current task attribution where available, with historical records treated only as attribution;
- independent source and generated index, worktree, untracked, ignored, and hidden-index results with command-failure and concealed-dirt rejection;
- live deterministic derivation of the expected complete generated inventory, explicit no-output results, stale-output cleanup, types, modes, content identities, and bytes from the existing mapping and materializer;
- rejection of unexpected, hand-edited, stale, conflicting, mismatched, symlinked, or early generated output;
- exact protected-boundary prestate capture;
- focused source, policy, and runtime checks that can pass before projection, with other checks included only when truthfully passable;
- exact isolation of the named parity-sensitive failure and byte-complete equality between its observed delta and the expected projection delta, with no unrelated failure;
- separate substantive Tester and Reviewer approvals based on independently reacquired or verified authoritative evidence;
- sufficiency of those fresh approvals for immediate materialization despite absent historical identity fields;
- complete invalidation after interruption or any changed HEAD, tree, byte, mode, declaration, authority, dirt result, mapping, projection, protected prestate, verification, or approval;
- fresh reacquisition after invalidation rather than reconstruction;
- contributor ownership and audit-history preservation with no expansion of T009's declaration or acceptance claim;
- canonical final evidence with ten-path `declared`, complete current `source`, complete 20-path `changed`, fresh disjoint 9/1 contributor attribution, unchanged accepted-line grammar, and consistent authorization-through-close interpretation;
- complete generated scope comprising eight T009-owned outputs plus five live-derived contributor-owned outputs, five no-output results, unchanged inventory, and applicable stale cleanup without frozen contributor destinations;
- mandatory post-materialization recursively discovered full suite, exact parity, lint, compose, pristine release build and lint, intended-scope, whitespace, final review, and all existing terminal gates;
- no new baseline on any mismatch;
- no persistent packet, digest, inventory, approval body, ledger, store, schema, helper, runtime, API, command, state, framework, ObjectiveRegistry, or report;
- exact T006 -> T007 -> T009 -> T002 -> T003 sequence;
- unchanged strict ordinary behavior for later features;
- no materialization, source write, generated-core write, Feature 009 write, evidence append, or Feature 008 close in the bridge task;
- policy-only test claims.

Use existing test-local Git utilities to create one valid fresh packet plus non-descendant, missing-authorization, source-drift, declaration-drift, attribution-diagnostic, dirt-layer, hidden-index, mapping, cleanup, generated-byte, protected-boundary, verification, approval-binding, interruption, replacement-baseline, isolation, and future-feature cases. Keep fixtures transient.

The policy contract names the sole expected pre-materialization failure exactly as `checked-in dev core is a byte-identical non-mutating projection of authoritative source`. Execution isolates it with:

```bash
node --test \
    --test-name-pattern='^checked-in dev core is a byte-identical non-mutating projection of authoritative source$' \
    scripts/build-dev.test.mjs
```

The nonzero result is not generally accepted. Authorization requires exactly one selected failure with that full title, zero other failed or cancelled tests, and an independently derived observed generated delta exactly equal to the packet projection. Nonmatching tests may be skipped by the filter and contribute no evidence. The recursively discovered suite is not run until after materialization, when every test must pass.

After the tests are observably red for the missing bridge, add the minimum policy text:

- a concise transient-packet prerequisite, ownership rule, no-isolation rule, normal-future rule, and sequence in `.github/skills/project/SKILL.md`;
- one detailed transient acquisition, approval, invalidation, immediate-use, and handoff section in `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`.

Do not change the existing evidence schema, materializer, resolver, classifier, command surface, state, or task runtime.

### 10. T007 Focused Acceptance

T007 verification is limited to the transient packet route and its accepted scope:

```bash
node --test --test-name-pattern='T007 Core Dogfood' scripts/current-format-contract.test.mjs
node --test scripts/current-format-contract.test.mjs
node .github/skills/dude-lint/lint.mjs .
git diff --check
```

Fresh scope inspection must prove the T007 implementation diff is limited to:

- `scripts/current-format-contract.test.mjs`;
- `.github/skills/project/SKILL.md`;
- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`.

It must also prove:

- no `src/**` change;
- no base-owned generated-core change;
- no Feature 009 package, owner, task, board, snapshot, or state change;
- no new baseline or accepted line;
- no repository `build-dev` invocation;
- no helper, runtime, command, state, ledger, store, schema, API, framework, ObjectiveRegistry, packet artifact, or report;
- no schema or evidence-format change;
- independent Tester and Reviewer acceptance covers current source and generated identities, all dirt layers, attribution-only history, expected cleanup and complete projection, protected prestate, verification binding, immediate invalidation, no persistence, ownership, tests, scope, and sequence.

T007 is currently open and solely ready. Any execution failure leaves it open or routes blocker handling to the coordinator; its acceptance does not complete Feature 008.

### 11. Feature 009 T009 Handoff

After T007 is independently accepted, Feature 009 authority may freshly reevaluate its current blockers and readiness. Feature 008 does not mutate any blocker or T009 state.

T009 then applies Section 8 and, only if one complete fresh pre-materialization packet plus both independent approvals and the immediate unchanged recheck pass, runs its existing terminal procedure. It uses its unchanged live declaration and freshly derived complete current delta rather than an expanded or duplicated Feature 008 list. The materializer writes the complete authorized global projection: T009's eight owned outputs plus five contributor-owned outputs derived live, with five contributor no-output results and all expected cleanup accounted for. T009 then runs the recursively discovered full suite, exact parity, lint, compose, pristine release build and lint, complete intended-scope, whitespace, fresh final independent review, and every existing terminal gate.

Only after those post-materialization gates pass does the coordinator append normal durable evidence using the unchanged line shape and the event-only ten-path `declared` versus 20-path `changed` semantics. Immediate recheck, latest-match selection, and close repeat that interpretation. T009 claims acceptance only for its own ten source paths and eight generated outputs; contributor acceptance is neither transferred nor renewed.

A failed or invalidated packet leaves T009 open or blocked and creates no baseline, accepted evidence, Feature 007 correction, or generated-core mutation.

### 12. Resume T002, Then Complete T003 Acceptance

After T009 successfully materializes and accepts generated core, rerun T002's exact full materializer verification. Its already-accepted local test repair and exact task meaning remain unchanged. T002 closes only when that full verification is green; this definition does not clear its blocker or change its state.

T003 depends on T001, T002, T004, T005, T006, and T007. It remains the explicit no-source bootstrap terminal and runs only after all dependencies complete.

T003 preserves its existing substantive acceptance and adds these checks:

- T006 policy and focused acceptance are current;
- T007 transient-route policy, focused evidence, and independent acceptance are current;
- Feature 009 `T009@696e6369` was the only bridge adopter;
- the original valid baseline, not the void replacement, remained comparison authority;
- T009's accepted ten-path declaration remained unchanged and only T008 evidence that actually exists was used;
- Feature 003 and Feature 006 owner/task records remained attribution context only and their ownership, task history, acceptance records, and closure remained unchanged;
- one fresh pre-materialization packet exactly covered the 20-path original-baseline delta with current path/type/mode/identity/byte records;
- the existing mapping and materializer derived the exact complete generated inventory, explicit no-output results, stale cleanup, types, modes, identities, and bytes;
- T009's eight owned outputs and five live-derived contributor-owned outputs were disjoint and complete, all five contributor no-output results were accounted for, and no contributor destination was frozen into policy or claimed by T009;
- every source and generated dirt layer and protected-boundary prestate was bound;
- focused passable checks and the exact isolated expected parity failure bound the pre-materialization packet;
- independent Tester and Reviewer each reacquired or verified authoritative evidence, approved the complete packet, and an immediate recheck was unchanged;
- after materialization, the recursively discovered full suite, exact parity, Dude lint, compose, pristine release build and lint, intended-scope, whitespace, final review, and every existing terminal gate passed;
- final evidence retained the accepted-line shape, hashed ten paths as `declared` and all 20 original-baseline rows as `changed`, bound the fresh 9/1 partition, and matched through immediate recheck, latest-match selection, and close;
- no historical accepted HEAD, complete source, or dual-review identity was claimed or reconstructed;
- no persistent pre-acceptance packet or supporting framework was introduced;
- T009 materialization and accepted evidence are current;
- T002 full materializer verification is green;
- normal future exact-baseline behavior remains unchanged;
- no Feature 008 source or base-owned generated-core mutation was manufactured;
- all fresh route, malformed, first-adopter, future-feature, and close-blocking exercises pass;
- independent final review accepts the exact final Feature 008 evidence.

T003 may use the existing Feature 008 no-source baseline and accepted evidence flow. It does not rerun T009 implementation or materialization.

### 13. Preserve CI Verification

Retain the completed T001 CI behavior unchanged unless a focused contradiction is demonstrated. CI remains an early verification-only drift backstop with read-only repository authority. It performs no repair, commit, push, tag, release, publish, credential persistence, or remote mutation.

The bridge adds no CI step and grants no CI first-adopter authority.

### 14. Static And Live Evidence Boundary

Static contracts prove policy text and deterministic fixtures only. T007 independent acceptance and T003 final acceptance must separately exercise current model-facing route, contributor-owner, task, terminal, lane, authorization, projection, and review authorities.

Do not persist scenario packets, review bodies, protected snapshots, or authorization envelopes. Loss or staleness requires fresh evidence.

## Implementation Phases

### Phase 1: Preserve Completed Project Convention And CI

T001 is complete. Preserve its accepted project-local convention, evidence model, and bounded CI drift backstop byte-for-byte at the task-unit level.

### Phase 2: Hold The Materializer Contract

T002 remains blocked one-to-one with its exact external-dependency blocker. Its local repair is accepted; no new T002 implementation is derived. It resumes only after T009 materializes accepted Feature 009 source.

### Phase 3: Preserve Completed Procedure, Pre-Resolver, And Continuity Work

T004, T005, and T006 are complete. The plan matches their accepted implementation:

- hidden source index flags are checked before repository source executes;
- the guard captures `git ls-files` output in a temporary file under `set -eu` and observes failure;
- the ordering regression anchors on the guard fence;
- the preflight is consistently ten commands;
- no process-substitution guard remains.
- T006 binds ancestry to fresh checkout `HEAD`, rejects its closed invalid-packet matrix, reuses the ordinary preflight, preserves the original baseline, and correctly refuses the current T009-only declaration mismatch.

No T004, T005, or T006 state or substantive meaning changes.

### Phase 4: Implement And Independently Accept The Transient Route

T007 writes tests first, then only the two existing skill surfaces. It adds fresh acquisition of the complete 20-path source delta and complete expected generated projection; exact current owner/task attribution where available; every source and generated dirt layer; protected-boundary prestate; focused source, policy, and runtime checks that can pass before projection; conditional lint or other passable checks; exact isolation of the packet-described parity failure; independently reacquired or verified Tester and Reviewer evidence; immediate unchanged recheck; invalidation and complete reacquisition; event-only canonical evidence semantics; complete generated-scope semantics; ownership preservation; no isolation; and current-event exclusivity. It removes the historical accepted-identity prerequisite and adds no persistent packet, materialization, or cross-feature mutation.

### Phase 5: Run The Exclusive Freshly Accepted Adopter

Feature 009 `T009@696e6369` acquires one valid current-session packet, consumes it immediately after dual approval and recheck, and materializes the complete authorized projection. It then passes the recursively discovered full suite, exact parity, Dude lint, compose, pristine release build and lint, complete intended-scope, whitespace, every other existing terminal gate, and fresh final independent review. It records normal final evidence only afterward using the unchanged line shape and one-time ten-path `declared` versus 20-path `changed` interpretation, claims acceptance only for its own work, and performs its separate Feature 007 correction under Feature 009 authority. Each contributor retains separate ownership and history. This is not Feature 008 implementation work.

### Phase 6: Resume Materializer Verification And Final Bootstrap Acceptance

T002 resumes and closes only after exact full verification is green. T003 then performs Feature 008's final no-source bootstrap acceptance. Feature 008 remains incomplete until those execution and acceptance steps actually close.

## Source Write Inventory

| Path | Status and planned mutation |
|---|---|
| `.github/skills/project/SKILL.md` | Existing accepted T001/T004/T005/T006 policy; T007 adds only concise fresh-packet prerequisite, no-isolation rule, ownership preservation, current-event exclusivity, and sequence. |
| `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` | Existing accepted T004/T006 procedure; T007 adds detailed current-session acquisition, dual approval, invalidation, immediate-use, and handoff behavior without changing ordinary lifecycle behavior. |
| `scripts/current-format-contract.test.mjs` | Existing accepted T001/T004/T005/T006 tests; T007 adds tests-first fresh-packet and deterministic invalidation coverage. |
| `.github/workflows/ci.yml` | Completed T001 implementation; no T007 change planned. |
| `scripts/build-dev.test.mjs` | Accepted T002-local repair; no T007 change planned. |
| `scripts/build-dev.mjs` | Existing materializer; no T007 change permitted. |

T007 has no other implementation write path. In particular, it writes no `src/**`, base-owned generated core, Feature 009 or contributor artifact, generated board, task snapshot, state, owner evidence, helper, runtime, command, schema, ledger, framework, ObjectiveRegistry, or report.

## Requirements Traceability

| Requirements | Plan coverage | Tasks |
|---|---|---|
| FR-001 through FR-003 | Scope, terminal-ready trigger, and split procedure ownership | T001@8f2c1a47, T004@e2a91f6c, T006@62726964, T007@9a4e7c12, T003@c4e6812d |
| FR-004 through FR-007 | Terminal derivation, review, no-source exception, and lane authority | T001@8f2c1a47, T004@e2a91f6c, T003@c4e6812d |
| FR-008 through FR-012 | Accepted T004/T005 pre-source baseline, serialization, isolation, and consume-only behavior | T001@8f2c1a47, T004@e2a91f6c, T005@3d7b0af5, T003@c4e6812d |
| FR-013 through FR-021 | Canonical evidence, ordinary promotion, preservation, verification, and failure blocks | T001@8f2c1a47, T002@5b7d930e, T004@e2a91f6c, T003@c4e6812d |
| FR-022 through FR-026 | Honest static/live evidence boundary, CI, no-source scope, and exclusions | T001@8f2c1a47, T004@e2a91f6c, T005@3d7b0af5, T006@62726964, T007@9a4e7c12, T003@c4e6812d |
| FR-027 through FR-032 | Exclusive adopter, original baseline, continuity, unchanged declaration, existing T008 evidence, and attribution-only history | T006@62726964, T007@9a4e7c12, T003@c4e6812d |
| FR-033 through FR-041 | Complete fresh packet, current identities and dirt layers, expected projection, protected prestate, passable pre-materialization checks, isolated expected parity failure, and sufficiency | T007@9a4e7c12, T003@c4e6812d |
| FR-042 through FR-047 | Materialization-only authority, invalidation, no persistence, T009 ownership, materializer-only output, mandatory post-materialization gates, and final evidence | T007@9a4e7c12, T003@c4e6812d |
| FR-048 through FR-060 | Strict later behavior, sequence, exact reconciliation, independent evidence reacquisition, event-only canonical evidence, complete generated scope, and durable-evidence timing | T002@5b7d930e, T006@62726964, T007@9a4e7c12, T003@c4e6812d |

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Descendant ancestry is mistaken for authorization. | Require both fail-closed ancestry proof and exact explicit commit or merge authorization evidence; either missing input blocks. |
| A later baseline silently erases the changed set. | Resolve the original valid owner-log record, compute changed source only against it, and explicitly reject the known void replacement and generic rebaseline fixtures. |
| Missing historical identity fields are fabricated to make the route pass. | Explicitly forbid reconstruction; use only T008 evidence that exists, attribution-only Feature 003/006 records, and fresh current Git facts plus dual approval. |
| T009 is made to claim inherited source. | Preserve its accepted ten-path declaration and acceptance claim; bind the complete current delta in the materialization packet without transferring ownership. |
| Attribution is mistaken for materialization authority. | Resolve exact current owners and tasks where available, label them as attribution context, and make fresh Tester and Reviewer approval the only exceptional acceptance authority. |
| Current source evidence omits or conceals a path. | Derive the entire delta from the original baseline and current tree, require exactly 20 path/type/mode/identity/byte records, and bind every dirt layer separately. |
| Generated core is hand-edited, stale, conflicting, or would silently absorb work. | Apply the existing mapping and materializer behavior live to derive exact final inventory, cleanup, no-output results, types, modes, identities, and bytes; reject every unexplained prestate or result. |
| A stale packet survives interruption or drift. | Invalidate on any interruption or changed bound input and require full reacquisition plus new Tester and Reviewer approvals. |
| Pre-materialization verification is impossible because parity is expected to be red. | Run only passable focused checks, isolate the exact named parity-sensitive failure, and require its complete observed delta to equal the expected projection delta; reserve the full suite and all final gates for after materialization. |
| An unrelated failure is hidden inside the expected parity failure. | Name and execute the parity-sensitive check separately, compare its complete delta to the packet projection, and block on every extra failure, path, mode, type, or byte mismatch. |
| The transient packet becomes a new workflow system. | Prohibit persistence, digests, stores, schemas, helpers, APIs, commands, state, frameworks, ObjectiveRegistry entries, and reports. |
| Final evidence cannot represent T009's ten-path declaration and the complete 20-path delta. | Keep the accepted-line grammar unchanged, bind `declared` to ten paths and `changed` to all 20 rows, require the exact disjoint 9/1 partition, and carry that interpretation through authorization, review, recheck, latest-match selection, and close. |
| T009's intended scope omits contributor outputs produced by global materialization. | Preserve its eight owned destinations, derive five contributor destinations live, account for five no-output results and cleanup, verify the complete disjoint projection, and transfer no ownership or acceptance. |
| Feature 008 duplicates Feature 009 or contributor work. | Keep T007 policy/evidence-only, omit a declaration clause, ban materialization and cross-feature writes, and leave implementation and acceptance under each owning authority. |
| Depending on T002 recreates the bootstrap cycle. | Make T007 depend on completed T006, not T002; sequence T002 only after T009 materialization. |
| The exception leaks into later features. | Bind it to the current Feature 009 event, exact terminal identity, and an explicit ordinary-future branch retaining strict baseline equality; test later-feature refusal. |
| The project route becomes another full runbook. | Keep only designation, prerequisite, future rule, and sequence in the project skill; place detailed gates in the existing local procedure. |
| The plan drifts from completed T005 behavior. | Treat temp-file capture, `set -eu`, failure observation, fence anchoring, and ten-command naming as current facts; remove all future/process-substitution wording. |
| Static tests are mistaken for behavioral proof. | State policy-only limits in both skills and tests; require fresh independent T007 acceptance and live packet exercises at T003. |
| Current evidence is unavailable after interruption. | Block and reacquire the complete packet and both approvals; never reconstruct, infer, or append a replacement baseline. |
| Unrelated active work breaks verification. | Leave the affected task open or blocked; do not clean, adopt, or reclassify unrelated work. |

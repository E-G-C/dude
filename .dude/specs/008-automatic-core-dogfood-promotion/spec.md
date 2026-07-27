# Feature Specification: Automatic Core Dogfood Promotion

## Purpose

Make accepted main-core projection a required final-close concern for repository features that change authoritative core source, while keeping promotion local to this repository and separate from release, publication, and downstream upgrade behavior.

Before ordinary core work begins, always-available project guidance establishes one clean immutable pre-source baseline and one serialized interval. The terminal-ready procedure consumes that baseline, proves that accepted source and generated core still belong to the interval, validates the result, and permits close only against current independent acceptance. It never creates or repairs a baseline after source has changed.

For exactly the current Feature 009 `T009@696e6369` materialization event, the lifecycle also permits one transient fresh current-session cross-feature acceptance packet over the complete current 20-path original-baseline source delta and the expected complete generated projection. This packet supersedes the impossible requirement for durable historical accepted HEAD, source, or dual-review identity fields from Features 003 or 006 or Feature 009 T008. Those fields are not claimed to exist and must not be reconstructed.

The packet is deliberately passable before materialization. It binds current repository identities and bytes; T009's unchanged accepted ten-path declaration; the disjoint nine-path Feature 003 and one-path Feature 006 attribution partition; every source and generated dirt layer; protected-boundary prestate; explicit descendant continuity; deterministic complete projection and cleanup derivation; focused source, policy, and runtime checks that do not require current generated parity; and exact evidence that the packet-described unmaterialized projection is the sole expected parity failure. Dude lint or another check may be included before materialization only when it can truthfully pass in the unmaterialized state. The named parity-sensitive failure is isolated from all other checks and accepted only when its observed path, type, mode, and byte delta exactly equals the packet's expected projection delta; a second, generic, differently named, or differently shaped failure blocks.

The Tester and Reviewer independently reacquire authoritative Git, byte, mapping, ownership, and command-result evidence, or independently verify it against those authorities, rather than approving a coordinator-authored summary. Their fresh packet approvals authorize materialization only. They do not retroactively accept or close Features 003 or 006, transfer ownership, expand T009's declaration, or imply that missing historical evidence once existed. Any interruption or change to HEAD, bytes, authority, declaration, dirt state, protected prestate, mapping, expected projection, verification, or approval invalidates the packet and requires complete fresh reacquisition.

After materialization, T009 must still pass the recursively discovered full repository suite, exact source/generated parity, Dude lint, compose verification, pristine release build and release lint, intended-scope and whitespace checks, fresh final independent review, and every existing terminal gate. The transient packet waives none of those final gates and is not durable acceptance evidence.

For this event only, canonical final evidence keeps T009's ten-path `declared` identity unchanged while `changed` binds the complete 20-path original-baseline delta. The additional ten changed paths must freshly equal the disjoint nine-path Feature 003 plus one-path Feature 006 attribution partition and match current source bytes, live mapping, and complete projection. The accepted line retains its existing textual shape: `declared` hashes only T009's ten live declared paths, `source` hashes the complete current source inventory, `changed` hashes all 20 original-baseline changed rows, and `review` binds the declared and changed identities, contributor partition identity and evidence, complete projection, verification, and ownership boundaries. This exact interpretation governs changed-set validation, materialization authorization, post-materialization acceptance, immediate identity recheck, latest-match selection, and close. Every later or ordinary feature continues to require declaration-equals-changed behavior.

T009's eight listed generated destinations remain its owned outputs. The ten contributor paths are evaluated live through the existing mapping and must yield exactly five additional generated destinations plus five explicit no-output results; those five generated outputs remain owned and accepted by their contributor features. Final intended-scope verification covers the disjoint eight T009-owned outputs, five live-derived contributor outputs, and the unchanged inventory and stale-cleanup effects required by the complete global projection. Contributor destination paths are not frozen into this policy, T009 claims none of them, and materialization does not re-accept contributor work.

Only Feature 009 `T009@696e6369` may use this route, in the current main checkout without isolation. The original valid pre-source baseline remains immutable comparison authority, and explicitly authorized descendant movement remains continuity within the same interval rather than permission to rebaseline. After T009 succeeds, Feature 008 `T002@5b7d930e` may resume once its full materializer verification is green, and then `T003@c4e6812d` performs final bootstrap acceptance. Definition alone completes no task and Feature 008 remains incomplete.

## User Stories & Testing

### User Story 1: Define And Route Core Close Work (Priority: P1)

As a maintainer defining and executing core work, I receive one explicit terminal task for planned source changes, and the repository-local promotion procedure is selected only when that task is genuinely ready.

**Independent Test:** Exercise planned-source, no-source, not-ready, ready, malformed, and lane-authority scenarios against the current definition and review authorities.

**Acceptance Scenarios:**

1. **Given** planned changes to exact core source files, **When** canonical tasks are staged, **Then** exactly one open shared non-parallel terminal declares the complete exact source set and depends on every source contributor.
2. **Given** an incomplete, ambiguous, duplicate, unsorted, non-file, or otherwise invalid source declaration, **When** definition readiness is reviewed, **Then** review rejects it.
3. **Given** a missing source-contributing dependency, **When** definition readiness is reviewed, **Then** review rejects it.
4. **Given** an incomplete dependency, uncleared blocker, or missing pre-promotion acceptance, **When** terminal readiness is considered, **Then** the promotion procedure is not selected and generated core remains unchanged.
5. **Given** all source-contributing dependencies and pre-promotion acceptance prerequisites have cleared, **When** the canonical terminal becomes ready, **Then** the repository routes to its local promotion procedure.
6. **Given** definition completion without a ready canonical terminal, **When** the feature is reviewed, **Then** definition completion alone authorizes no materialization or close action.
7. **Given** no planned core source change, **When** tasks are derived, **Then** no normal core terminal is created.
8. **Given** execution in either supported lane, **When** declaration authority is consulted, **Then** exactly one live lane authority is used and mirrors or notes cannot override it.

### User Story 2: Establish And Preserve A Clean Original Baseline (Priority: P1)

As a maintainer starting core work, I can prove that the exact owner and terminal began from a clean immutable source and generated-core state before any source change.

**Independent Test:** Exercise clean, dirty, stale, concurrent, ambiguous, and retroactive baseline packets. Only a clean packet with exact ownership, current parity, recorded baseline evidence, and an immediate successful recheck may begin ordinary source work.

**Acceptance Scenarios:**

1. **Given** exact owner and terminal authority, immutable repository and source identities, clean owned boundaries, and current parity, **When** core work begins, **Then** the coordinator records bounded baseline evidence only after every preflight condition passes.
2. **Given** recorded baseline evidence, **When** the first source change is about to occur, **Then** the same ownership, identity, cleanliness, and parity conditions are immediately rechecked and any mismatch blocks.
3. **Given** an accepted baseline, **When** source work proceeds, **Then** one serialized interval remains in force through materialization and every changed source path remains declared.
4. **Given** observed or suspected concurrency, **When** isolation cannot be trusted, **Then** work blocks without assigning actor identity.
5. **Given** an unavailable clean boundary, **When** isolation is considered, **Then** an isolated workspace is used only after explicit user approval; otherwise work waits.
6. **Given** a missing, stale, mismatched, replacement, transplanted, or retroactively proposed baseline, **When** promotion is considered, **Then** promotion refuses it and records no substitute baseline.

### User Story 3: Acquire One Passable Pre-Materialization Acceptance Packet (Priority: P1)

As the maintainer completing the first live adopter, I can acquire one fresh packet that proves the complete current source delta and expected generated projection without fabricating unavailable historical identities.

**Independent Test:** Acquire one valid packet from current evidence while generated parity is still expected to be red, isolate the exact named parity-sensitive failure, and independently change its revision, bytes, declaration, attribution partition, authority, dirt state, mapping, expected projection, protected prestate, passable verification, or either approval. Only an unchanged packet whose expected projection delta exactly explains that one isolated failure may authorize immediate materialization.

**Acceptance Scenarios:**

1. **Given** the bounded Feature 008 bridge task has not received focused evidence and independent acceptance after `T006@62726964`, **When** Feature 009 `T009@696e6369` requests promotion, **Then** it remains blocked and no materialization occurs.
2. **Given** the bridge has been accepted, **When** any task other than Feature 009 `T009@696e6369` requests first-adopter treatment, **Then** the request is rejected.
3. **Given** the original valid pre-source baseline, **When** current continuity is evaluated, **Then** current revision is a proven descendant and explicit authority covers the intervening revision movement.
4. **Given** current Feature 009 authority, **When** packet inputs are acquired, **Then** T009's accepted ten-path declaration remains exact and unchanged, while T008 contributes only its exact declaration and changed-identity evidence that actually exists.
5. **Given** the complete current source state, **When** the packet is assembled, **Then** current trees, types, modes, object identities, and bytes derive exactly the complete 20-path original-baseline delta.
6. **Given** the ten additional paths, **When** their context is acquired, **Then** exact current Feature 003 and Feature 006 owners and tasks are resolved where available for attribution only; historical terminal or close evidence does not itself authorize materialization.
7. **Given** the current checkout, **When** cleanliness is acquired, **Then** source and base-generated inventories separately cover index, worktree, untracked, ignored, and hidden-index layers, including type and mode changes, without offsetting one layer against another.
8. **Given** the current source inventory, **When** projection evidence is acquired, **Then** the existing deterministic mapping derives every generated destination, every explicit no-output result, all expected stale-output cleanup, and the exact complete final projection without freezing contributor destinations in policy.
9. **Given** protected project boundaries, **When** packet acquisition begins, **Then** their exact current path, type, mode, and byte prestate is captured for post-materialization comparison.
10. **Given** one complete set of bound identities and expected output, **When** pre-materialization verification runs, **Then** focused source, policy, and runtime checks that do not require current generated parity pass, and Dude lint or another check is included only when it can truthfully pass before projection.
11. **Given** generated core still reflects the valid pre-materialization state, **When** parity is probed, **Then** one exact named parity-sensitive check is isolated and its complete observed delta equals the packet-described expected projection delta; any unrelated failure or extra mismatch blocks.
12. **Given** complete fresh facts and passing pre-materialization checks, **When** independent acceptance is requested, **Then** a Tester and a Reviewer each independently reacquire or verify the authoritative Git, byte, mapping, ownership, and command evidence and produce a substantive current-session packet approval.
13. **Given** both fresh approvals and an immediate unchanged recheck, **When** T009 proceeds without interruption, **Then** the packet is sufficient materialization authority for this exact event.
14. **Given** any interruption or any changed bound input, **When** materialization has not completed, **Then** the packet is discarded and every input, check, and approval is freshly reacquired rather than reconstructed.
15. **Given** packet acquisition, **When** persistence is considered, **Then** no pre-acceptance ledger, store, schema, helper, command, runtime, API, framework, ObjectiveRegistry, or report is created.

### User Story 4: Materialize Without Ownership Transfer (Priority: P1)

As a maintainer, I can complete the one-time projection while preserving contributor ownership and the exact sequence that resolves the bootstrap cycle.

**Independent Test:** Exercise the exact event, a wrong event, declaration expansion, contributor closure, projection drift, protected-boundary drift, every adjacent dependency, and a later ordinary feature. Only current T009 with unchanged ownership and sequence may proceed.

**Acceptance Scenarios:**

1. **Given** Feature 008 `T001@8f2c1a47`, `T004@e2a91f6c`, `T005@3d7b0af5`, and `T006@62726964` are complete, **When** revised `T007@9a4e7c12` is selected, **Then** it keeps its open state and durable identity, depends on T006 rather than T002, and is the sole ready Feature 008 task.
2. **Given** T007 is not independently accepted, **When** Feature 009 `T009@696e6369` is considered, **Then** first-adopter materialization remains unavailable.
3. **Given** T007 is accepted and all current T009 prerequisites pass, **When** T009 runs, **Then** it alone owns materialization, parity and protected-boundary verification, full gates, final independent review, final evidence, and its separate Feature 007 correction.
4. **Given** exact current Feature 003 and Feature 006 attribution, **When** T009 materializes, **Then** their artifacts, tasks, owner histories, acceptance claims, and closure remain unchanged, and T009 gains no claim over their work.
5. **Given** T009's existing intended output scope, **When** materialization is authorized, **Then** its eight listed generated destinations remain its owned outputs while the ten contributor paths map live to exactly five additional contributor-owned destinations and five no-output results.
6. **Given** successful materialization, **When** final intended scope, projection, and preservation are checked, **Then** the disjoint eight T009-owned outputs plus five live-derived contributor outputs, unchanged inventory, and applicable stale cleanup exactly match the complete global projection and every protected path matches its captured prestate.
7. **Given** contributor outputs produced by the global materializer, **When** ownership and acceptance are evaluated, **Then** T009 claims none of those outputs and neither contributor feature is re-accepted.
8. **Given** T009 has not successfully materialized and accepted its core projection, **When** T002 is reconsidered, **Then** its exact current external-dependency blocker remains effective.
9. **Given** T009 succeeds and full materializer verification is green, **When** T002 resumes, **Then** it retains its existing focused materializer meaning rather than absorbing terminal work.
10. **Given** T007 and T002 are not both complete, **When** T003 is considered, **Then** final bootstrap acceptance remains unavailable.
11. **Given** all prerequisites are accepted, **When** T003 performs final no-source acceptance, **Then** it validates the lifecycle without duplicating T009 materialization or contributor-feature work.
12. **Given** a later feature, **When** ordinary promotion is evaluated, **Then** exact ordinary baseline identities and every normal lifecycle gate remain required; this route grants no precedent.

### User Story 5: Close Only Against Bound Accepted Evidence (Priority: P1)

As a maintainer closing core work, I can prove that one serialized, independently accepted source revision produced generated core without adopting dirty, undeclared, concurrent, or drifted work.

**Independent Test:** Exercise fresh close packets for missing baseline, undeclared path, declaration mismatch, post-review source drift, generated drift, failed verification, and rejected review. Every invalid packet must block without corrective mutation.

**Acceptance Scenarios:**

1. **Given** accepted source changes and a ready terminal, **When** promotion begins, **Then** baseline authority and reviewed identities must remain current before generated core changes.
2. **Given** an accepted source change with no generated destination, **When** promotion runs, **Then** the source lifecycle still applies even if generated output is unchanged.
3. **Given** successful materialization, **When** preservation and parity are checked, **Then** generated core exactly reflects current authoritative source and protected project boundaries remain unchanged.
4. **Given** the exact current T009 event, **When** canonical final identities are computed, **Then** `declared` binds only its unchanged ten-path declaration, `source` binds the complete current source inventory, and `changed` binds the complete 20-path original-baseline delta whose additional ten rows exactly equal the disjoint nine-path Feature 003 and one-path Feature 006 partition.
5. **Given** successful post-materialization verification, **When** an independent reviewer accepts the bound evidence, **Then** the review binds declared identity, changed identity, contributor partition identity and evidence, complete projection, verification, and ownership boundaries before the coordinator records the unchanged accepted-line shape.
6. **Given** recorded final evidence, **When** immediate recheck, latest-match selection, or close occurs, **Then** the same event-only identity interpretation remains in force and every bound identity must still match.
7. **Given** drift after review or acceptance evidence, **When** close is considered, **Then** fresh affected verification, a new independent review, and later matching evidence are required.
8. **Given** no accepted source change in Feature 008's final bootstrap acceptance, **When** its terminal acceptance runs, **Then** promotion is a verified no-op and current parity is proved without changing generated core.
9. **Given** a missing or mismatched baseline, declaration, source identity, contributor partition, generated projection, verification result, or accepted review, **When** close is considered, **Then** close blocks without corrective mutation or delivery claim.
10. **Given** an ordinary or later feature, **When** final evidence is computed, **Then** every changed path must be declared and declaration-equals-changed behavior remains mandatory.

### User Story 6: Keep Continuous Integration A Bounded Verification Backstop (Priority: P2)

As a maintainer, I receive an early integration failure for covered repository drift without granting automation repository-write or release authority.

**Independent Test:** Exercise clean and dirty owned-boundary cases and confirm that automated integration accepts only a current generated projection while retaining read-only repository authority.

**Acceptance Scenarios:**

1. **Given** a clean checkout, **When** automated integration verifies the generated projection, **Then** it confirms a clean state before and after projection.
2. **Given** pre-existing visible or normally excluded drift in covered owned boundaries, **When** automated integration verifies projection, **Then** it fails and reports drift without repairing it.
3. **Given** normally excluded output outside covered owned boundaries, **When** automated integration runs, **Then** it does not represent that output as covered by this guarantee.
4. **Given** automated checkout and validation, **When** repository authority is inspected, **Then** it is read-only and performs no commit, push, tag, release, publish, credential persistence, or remote mutation.

## Edge Cases

- Definition completes while a terminal is absent, blocked, dependency-incomplete, or not independently accepted.
- The route selects the wrong procedure, the local procedure is unavailable, or its identity is inconsistent.
- Static policy checks pass while a future model fails to route or follow the procedure.
- A planned source-writing task produces no accepted source change.
- A source file is added, deleted, renamed, mode-changed, or modified.
- A declaration contains duplicate, unsorted, non-file, wildcard, or incomplete entries.
- A source contributor is omitted from terminal dependencies.
- Lightweight and tracked declarations disagree after import.
- Immutable repository or source identity changes after ordinary baseline capture.
- Source or base-owned generated core contains pre-existing visible, excluded, concealed, or offsetting dirt.
- Current HEAD, a source byte, a declaration, or an authority changes during packet acquisition.
- Generated core is hand-edited, materialized early, or reflects another source revision.
- Protected project boundaries change during materialization.
- A stale baseline or acceptance record remains in append-only history after later drift.
- Context is interrupted or transient approval evidence becomes unavailable before immediate use.
- Concurrent activity is suspected even when actor attribution is unavailable.
- The current revision equals neither the original baseline nor a descendant of it.
- Current revision descends from the original baseline but explicit continuity authorization is absent.
- Authorization exists for a different commit, merge, owner, terminal, or interval.
- The changed set is computed from a replacement baseline instead of the original valid baseline.
- The current original-baseline source delta is not exactly the expected 20 paths.
- T009's accepted declaration is not exactly its unchanged ten paths.
- T008 lacks a historical field that the packet must freshly derive instead.
- A Feature 003 or Feature 006 attribution owner or task is missing or ambiguous; no historical acceptance is inferred.
- Current source or generated type, mode, object identity, or bytes change between acquisition and immediate use.
- Index, worktree, untracked, ignored, or hidden-index facts change during acquisition.
- The materializer mapping changes, yields an unexpected destination, omits cleanup, or produces an unexpected no-output result.
- The current generated projection contains hand-edited, stale, early, symlinked, or unexplained output.
- Focused, full, lint, compose, or release verification binds a different revision or projection.
- The pre-materialization packet treats the known parity-sensitive failure as a generic expected failure, observes a second failure, or cannot prove that the complete observed parity delta equals the packet-described projection delta.
- A recursively discovered full suite or another parity-dependent final gate is incorrectly required to pass before materialization.
- Tester or Reviewer approval is missing, generic, stale, not independent, or does not bind the complete packet.
- A Tester or Reviewer merely echoes coordinator-supplied facts without independently reacquiring or verifying authoritative Git, byte, mapping, ownership, and command evidence.
- An attempted replacement baseline is retained in history and explicitly marked non-authorizing.
- Another feature attempts to claim first-adopter treatment.
- Feature 009's declaration is expanded to claim separately owned merged work.
- Final evidence hashes only T009's ten changed paths, expands `declared` to 20 paths, or fails to bind the fresh disjoint 9/1 contributor partition.
- A contributor destination is frozen into policy, overlaps a T009-owned destination, is omitted from final scope, or is attributed to T009 rather than its contributor feature.
- Feature 009 terminal work or contributor-feature work is mistakenly copied into Feature 008.
- Feature 008 `T002@5b7d930e` is made a predecessor of T007, recreating the dependency cycle.
- Feature 008 final bootstrap acceptance is attempted before the bridge, Feature 009 terminal, and materializer contract have cleared in order.
- A contributor feature is treated as retroactively accepted, transferred, reopened, or closed.
- A later feature attempts to reuse the current-session route.
- Full validation fails because of unrelated active work.

## Functional Requirements

- **FR-001:** The lifecycle MUST apply only to this repository's authoritative main core and its base-owned generated projection.
- **FR-002:** The local promotion procedure MUST be selected only when the canonical terminal is ready after all source-contributing dependencies and pre-promotion acceptance prerequisites have cleared. Definition completion alone MUST NOT authorize materialization or close.
- **FR-003:** Always-available project guidance MUST own the complete pre-source baseline contract and concise terminal route; the project-local promotion procedure MUST own detailed terminal-ready promotion and close behavior and MUST remain repository-local.
- **FR-004:** A definition with planned exact core source changes MUST stage exactly one open shared non-parallel terminal with a complete exact-file declaration and dependencies on every source contributor.
- **FR-005:** Independent definition readiness review MUST reject a missing, multiple, closed, parallel, malformed, incomplete, or dependency-deficient terminal.
- **FR-006:** A definition with no planned source change MUST normally derive no core terminal. Feature 008's explicit no-source terminal remains a bootstrap exception only.
- **FR-007:** Each supported execution lane MUST have exactly one live declaration authority. Mirrors and notes MUST NOT override it.
- **FR-008:** Before ordinary first source change, the coordinator MUST resolve exact owner and terminal authority, bind immutable repository and source identities, prove clean source and generated boundaries, and prove current parity.
- **FR-009:** Bounded baseline evidence MUST be recorded only after every preflight condition passes, and the same conditions MUST be rechecked immediately before first source change.
- **FR-010:** Ordinary core work MUST remain serialized from baseline through materialization. Observed or suspected concurrency MUST block without actor attribution.
- **FR-011:** If a clean serialized boundary is unavailable, work MUST wait or use isolation only after explicit user approval.
- **FR-012:** The terminal-ready procedure MUST validate and consume existing baseline evidence. It MUST NOT invent, repair, replace, transplant, or retroactively establish baseline authority.
- **FR-013:** Every ordinary accepted changed source file MUST be declared, and live declaration authority MUST match acceptance authority. The exact T009 exception MUST preserve its accepted ten-path declaration and MUST cover the remaining current delta only through the transient packet.
- **FR-014:** Baseline, declaration, source, changed-source, verification, authorization, and independent-review evidence MUST be bounded, reproducible, and drift-sensitive without storing source or generated contents in workflow history.
- **FR-015:** Promotion MUST run only for current source identities covered by ordinary accepted evidence or, for this exact T009 event, by the valid transient fresh packet. Source changes with no generated destination MUST still participate in the lifecycle.
- **FR-016:** A revision with no accepted source change MUST be a verified no-op that proves current parity without changing generated core.
- **FR-017:** Promotion MUST preserve installed optional artifacts, project-local guidance, workflows, and project workflow data, and MUST produce exact source-to-generated parity.
- **FR-018:** Final acceptance MUST include applicable focused and full verification, project and release-artifact integrity, scope checks, final parity, and fresh independent review.
- **FR-019:** Durable acceptance evidence MUST be coordinator-owned, append-only, recorded only after materialization and fresh final independent acceptance, and immediately revalidated. The transient pre-acceptance packet MUST NOT be persisted as a new ledger.
- **FR-020:** Later source, declaration, generated, verification, authorization, or review drift MUST require fresh affected evidence and MUST invalidate older authority.
- **FR-021:** Missing, ambiguous, stale, or mismatched ownership, baseline, declaration, source, generated, verification, authorization, preservation, or review evidence MUST block mutation, close, and delivery claims.
- **FR-022:** Static checks MUST claim only visible policy and reproducible predicate coverage. Acceptance MUST also include fresh authority exercises for valid, not-ready, no-source, malformed, first-adopter, and close-blocking scenarios.
- **FR-023:** Automated integration MUST be a verification-only backstop that detects covered drift, fails without repair, retains read-only repository authority, and performs no repository delivery or release mutation.
- **FR-024:** Feature 008 MUST make no planned authoritative source or base-owned generated-core mutation and MUST treat its no-source terminal as a bootstrap exception.
- **FR-025:** No optional-pack, technical-documentation, release, downstream, user-facing, or shipped-skill behavior is introduced by this feature.
- **FR-026:** No new command, framework, helper, state store, ledger, objective registry, compiler, runtime, or persistent scenario report is permitted.
- **FR-027:** Exactly Feature 009 `T009@696e6369` MUST be the sole and exclusive first adopter and materializer. No other task or feature may consume the bridge.
- **FR-028:** First-adopter eligibility MUST begin only after completed and accepted `T006@62726964` and revised `T007@9a4e7c12` have current focused evidence and independent acceptance.
- **FR-029:** The original valid pre-source baseline MUST remain immutable comparison authority. A later, replacement, repaired, transplanted, post-source, or explicitly void baseline MUST authorize nothing.
- **FR-030:** For Feature 009 `T009@696e6369`, current repository revision MUST be a proven descendant of the original baseline revision, and exact explicit authorization evidence for every intervening commit or merge continuity MUST be current. Ancestry without authorization MUST block.
- **FR-031:** T009's accepted ten-path declaration MUST remain exact and unchanged. T008 MUST contribute only its exact declaration and changed-identity evidence that actually exists; missing accepted HEAD, complete source identity, or dual-review fields MUST NOT be required or reconstructed.
- **FR-032:** Exact current Feature 003 and Feature 006 owners and tasks MUST be resolved where available for attribution context. Historical terminal, close, source, or review records MUST NOT themselves grant materialization authority.
- **FR-033:** Before materialization, one transient fresh current-session packet MUST cover the complete current 20-path original-baseline source delta and the expected complete generated projection.
- **FR-034:** The packet MUST bind current HEAD and relevant trees plus every covered source path's exact path, type, mode, object or content identity, and bytes.
- **FR-035:** The packet MUST bind independent current source and generated inventories for index, worktree, untracked, ignored, and hidden-index layers. A failed query, malformed result, concealed path, conflict, or offsetting dirt MUST block.
- **FR-036:** The packet MUST evaluate the existing deterministic materializer mapping and bind every expected destination, explicit no-output result, stale-output cleanup, final type, mode, content identity, and byte-complete projection.
- **FR-037:** The packet MUST capture exact protected-boundary prestate and require byte-for-byte and metadata-preserving comparison after materialization.
- **FR-038:** The packet MUST bind the current exact owner, task, terminal, lane, dependency, continuity, and pre-promotion authority needed for T009 without transferring any contributor's ownership.
- **FR-039:** Before materialization, the packet MUST require passing focused source, policy, and runtime checks that do not depend on current generated parity; it MAY include Dude lint or another check only when that check can truthfully pass in the unmaterialized state.
- **FR-040:** Before materialization, one exact named parity-sensitive failure MUST be isolated and its complete observed path, type, mode, and byte delta MUST equal the packet-described expected projection delta. No unrelated failure, extra mismatch, generic expected-failure allowance, or full-suite waiver is permitted.
- **FR-041:** When FR-029 through FR-040 pass and an immediate recheck is unchanged, the fresh approvals MUST be sufficient materialization authority for this exact event despite unavailable historical identity fields.
- **FR-042:** The transient packet MUST authorize materialization only. It MUST NOT retroactively accept or close Features 003 or 006, transfer ownership, expand T009's declaration, or claim that missing evidence existed.
- **FR-043:** Any interruption or change to HEAD, bytes, declaration, authority, dirt state, mapping, expected projection, protected prestate, verification, or approval MUST invalidate the packet and require complete fresh reacquisition.
- **FR-044:** No persistent pre-acceptance ledger, store, schema, helper, runtime, command, API, framework, ObjectiveRegistry, or report MAY be introduced.
- **FR-045:** Feature 009 T009 alone MUST own materialization, post-materialization parity and protected-boundary checks, the recursively discovered full repository suite, Dude lint, compose verification, pristine release build and release lint, intended-scope and whitespace checks, fresh final independent review, final evidence, and task state. The transient packet MUST waive none of these gates.
- **FR-046:** Generated core MUST be produced only by the existing materializer. Hand edits, unexplained output, incomplete cleanup, missing output, extra output, or byte mismatch MUST block.
- **FR-047:** Normal final T009 accepted evidence MUST be recorded only after materialization, final verification, fresh final independent review, and an immediate identity recheck.
- **FR-048:** Normal future features MUST retain exact ordinary baseline revision and source-tree matching plus every existing cleanliness, declaration, serialization, projection, verification, and review gate.
- **FR-049:** The enforced sequence MUST be completed Feature 008 T001, T004, T005, and T006; revised and accepted T007; Feature 009 T009; Feature 008 T002 after full materializer verification is green; then Feature 008 T003 final bootstrap acceptance.
- **FR-050:** T007 MUST depend on T006 and MUST NOT depend on T002. It MUST remain policy-and-evidence-only on existing project/local skills and tests and MUST perform no materialization or cross-feature mutation.
- **FR-051:** No automatic commit, push, tag, publish, release, credential persistence, or remote mutation MAY occur.
- **FR-052:** This redefinition MUST add and drop zero tasks; preserve T001, T004, T005, and T006 done unchanged; preserve T002 blocked with its exact blocker; revise T007 in place while preserving it open and solely ready; preserve T003 open with dependencies on T007 and T002; and leave Feature 008 incomplete.
- **FR-053:** A fresh independent Tester and a fresh independent Reviewer MUST each independently reacquire authoritative Git, byte, mapping, ownership, and command-result evidence, or independently verify every supplied value against those authorities, before approving the transient packet. Merely echoing a coordinator packet MUST block.
- **FR-054:** For this exact current T009 event only, canonical `declared` MUST hash only T009's unchanged ten-path live declaration, canonical `source` MUST hash the complete current source inventory under the existing shape, and canonical `changed` MUST hash the complete 20-path original-baseline delta.
- **FR-055:** The ten `changed` rows outside `declared` MUST freshly and exactly equal a disjoint attribution partition of nine Feature 003 paths and one Feature 006 path, and MUST match current source bytes, live mapping results, and complete projection evidence.
- **FR-056:** The existing accepted-line textual shape MUST remain unchanged. Its `review` digest MUST bind the declared and changed identities, contributor partition identity and evidence, complete projection, post-materialization verification, and ownership boundaries without adding a new durable field or persisting the transient packet.
- **FR-057:** The event-only FR-054 through FR-056 interpretation MUST govern changed-set validation, materialization authorization, post-materialization acceptance, immediate identity recheck, latest-match evidence selection, and close. Every later or ordinary feature MUST retain declaration-equals-changed validation and normal evidence behavior.
- **FR-058:** T009's eight listed generated destinations MUST remain its owned outputs. The ten contributor source paths MUST be evaluated live by the existing mapping to produce exactly five additional generated destinations and five explicit no-output results; contributor destination paths MUST NOT be frozen into policy.
- **FR-059:** Final intended-scope verification MUST cover the disjoint eight T009-owned generated outputs, five live-derived contributor-owned outputs, and the unchanged inventory and stale-cleanup effects required by the complete global projection. T009 MUST NOT claim contributor outputs, and materialization MUST NOT re-accept contributor features.
- **FR-060:** Normal durable accepted evidence MUST be recorded only after materialization, all post-materialization terminal gates, fresh final independent review, and immediate recheck. The transient packet and its approvals MUST remain immediate-use materialization authority only.

## Key Entities

- **Local Promotion Procedure:** The repository-only procedure selected at canonical terminal readiness for materialization, verification, acceptance evidence, and close checks.
- **Concise Project Route:** Always-available project guidance that establishes the pre-source baseline contract and routes ready terminal work without duplicating the terminal runbook.
- **Terminal Readiness:** The state in which every source-contributing dependency and pre-promotion acceptance prerequisite has cleared and no blocker remains.
- **Live Source Declaration:** The complete exact source-file set supplied by the current execution lane's authoritative terminal.
- **Original Valid Pre-Source Baseline:** The immutable repository and source identity, clean owned-boundary state, parity, and coordinator evidence validly established before Feature 009 source change.
- **Authorized Revision Continuity:** Explicit evidence that intervening commit or merge movement was permitted and that current revision remains a descendant within the same original interval.
- **T009 Live Declaration:** Feature 009's accepted ten-path declaration from the active execution authority, unchanged by this feature.
- **T008 Existing Evidence:** Only the exact declaration and changed-identity evidence actually recorded by T008.
- **Original-Baseline Changed Set:** Every current source change measured against the original valid baseline rather than against a replacement or current revision.
- **Attribution Context:** Exact current Feature 003 and Feature 006 owner and task identities where available, used to preserve responsibility but not as historical materialization authority.
- **Transient Fresh Current-Session Acceptance Packet:** Immediate-use pre-materialization evidence binding the complete current source delta, expected projection, current authorities, protected prestate, passable checks, the sole exact expected parity failure, and two independently reacquired or verified approvals.
- **Contributor Attribution Partition:** The fresh disjoint nine-path Feature 003 and one-path Feature 006 subset that accounts for every original-baseline changed row outside T009's unchanged declaration without transferring ownership.
- **Expected Complete Generated Projection:** Every final generated destination, type, mode, content, byte sequence, explicit no-output result, and stale-output removal derived through the existing materializer.
- **Complete Event Generated Scope:** The disjoint union of T009's eight owned generated destinations, five contributor-owned destinations derived live from the attribution partition, and the unchanged inventory and cleanup effects required by the global projection.
- **Protected-Boundary Prestate:** Current path, type, mode, and byte identities for project and workflow artifacts that materialization must preserve.
- **Materialization Authority:** Permission for current T009 to run the existing materializer once, immediately, under an unchanged valid packet.
- **Normal Final T009 Evidence:** Durable acceptance recorded only after materialization, final verification, final independent review, and immediate recheck.

## Success Criteria

- **SC-001:** A valid planned-source exercise derives exactly one open shared non-parallel terminal with complete exact declaration and all source-contributor dependencies; not-ready and definition-only cases authorize no promotion.
- **SC-002:** A no-source exercise derives no normal core terminal, and malformed exercises are independently rejected.
- **SC-003:** Ordinary pre-source exercises authorize no source change unless exact ownership, immutable identities, every cleanliness boundary, current parity, coordinator-recorded baseline evidence, and immediate recheck all pass.
- **SC-004:** Every first-adopter exercise designates only Feature 009 `T009@696e6369` as materializer; all other terminals receive zero bridge authority.
- **SC-005:** In every valid first-adopter exercise, current revision is a proven descendant of the original valid baseline and carries exact explicit continuity authorization; missing either property blocks.
- **SC-006:** Every valid packet preserves T009's exact ten-path declaration, uses only T008 evidence that actually exists, and derives exactly the complete current 20-path source delta from fresh trees, types, modes, identities, and bytes.
- **SC-007:** Every valid packet binds all current dirt layers, the existing materializer's exact cleanup and complete projection, protected-boundary prestate, and current authorities without unexplained or concealed drift.
- **SC-008:** Every valid packet includes passing focused source, policy, and runtime checks that do not require current generated parity, includes other checks only when they truthfully pass before projection, and proves one isolated named parity-sensitive failure has exactly the packet-described projection delta and no unrelated failure.
- **SC-009:** Replacement, repaired, transplanted, post-source, and explicitly void baseline records authorize zero promotions and create zero new baseline evidence.
- **SC-010:** A complete unchanged packet is sufficient for immediate T009 materialization without any historical durable accepted source or dual-review identity requirement.
- **SC-011:** Dependency checks enforce `T006@62726964` then the existing task, Feature 009 `T009@696e6369`, Feature 008 `T002@5b7d930e`, and Feature 008 `T003@c4e6812d` without introducing a dependency cycle.
- **SC-012:** Feature 009 `T009@696e6369` retains exclusive materialization and acceptance for its work, each merged contributor retains ownership and audit history, and Feature 008 duplicates neither.
- **SC-013:** Every interruption or identity, byte, authority, mapping, projection, verification, or approval change invalidates the packet and grants zero authority until complete fresh reacquisition.
- **SC-014:** The route creates no persistent pre-acceptance artifact, helper, schema, command, runtime, state, framework, API, ObjectiveRegistry, or report.
- **SC-015:** Promotion verification preserves all protected paths and contents and produces exact repeatable generated output.
- **SC-016:** Automated integration accepts the clean case, rejects covered drift, remains read-only, and performs no remote or release mutation.
- **SC-017:** Normal final T009 evidence is recorded only after materialization, full final verification, fresh final independent review, and immediate recheck.
- **SC-018:** Later-feature exercises receive zero transient authority and retain exact normal baseline matching plus all existing lifecycle gates.
- **SC-019:** After this redefinition, Feature 008 retains four completed tasks, one blocked materializer task with its exact blocker, one open final bootstrap task, and revised T007 open and solely ready, with no completion claim.
- **SC-020:** Both packet approvers independently reacquire or verify authoritative Git, byte, mapping, ownership, and command evidence; a coordinator-summary-only approval grants zero authority.
- **SC-021:** For the exact event, final canonical evidence has ten `declared` paths, a complete current `source` inventory, and 20 original-baseline `changed` rows whose additional ten rows exactly equal the fresh disjoint 9/1 contributor partition; the accepted line retains its existing textual shape.
- **SC-022:** Final generated-scope verification proves exactly eight T009-owned outputs plus five live-derived contributor-owned outputs are disjoint and complete, accounts for no-output and stale-cleanup results, and transfers or renews zero contributor acceptance.
- **SC-023:** T009 reaches final acceptance only after the recursively discovered full suite, exact parity, Dude lint, compose, pristine release build and lint, intended-scope and whitespace checks, every other existing terminal gate, and fresh final independent review pass after materialization.
- **SC-024:** Immediate recheck, latest-match evidence selection, and close reproduce the same one-time 10-declared/20-changed interpretation; every later or ordinary feature reproduces declaration-equals-changed behavior.

## Assumptions

- The canonical terminal becomes ready only after all source-contributing dependencies and pre-promotion acceptance prerequisites have cleared.
- The project route owns pre-source baseline establishment; the local procedure owns terminal-ready promotion and close behavior.
- The local procedure remains repository-specific and is neither shipped as core nor exposed as an end-user capability.
- The original valid Feature 009 baseline and the later explicit authorization records remain available as append-only owner evidence.
- The accepted T006 bridge refusal is valid: the original-baseline source delta contains 20 paths, while T009's accepted declaration contains its ten Feature 009 paths.
- T008 records exact declaration and changed-identity evidence but not the historical durable accepted HEAD, complete source identity, or exact dual-review binding previously required.
- Exact current Feature 003 and Feature 006 owners and tasks remain available for attribution where recorded, but their historical terminal evidence is not materialization authority for this exception.
- Current repository evidence can freshly derive the complete 20-path source delta and expected complete generated projection without reconstructing missing historical fields.
- T009's current definition lists eight owned generated destinations. The existing mapping derives, rather than policy freezes, exactly five generated destinations and five no-output results from the ten contributor paths.
- The recursively discovered full suite and exact parity cannot truthfully pass until T009 materializes the packet-described projection; they remain mandatory post-materialization gates.
- Actor identity is not inferred from repository state; ambiguity or suspected concurrency blocks.
- Transient inputs and approvals remain available through immediate use; interruption or loss requires complete fresh reacquisition, not reconstruction.
- Feature 009 remains unchanged by this definition transaction and remains authoritative for its own live terminal declaration and implementation scope.

## Out of Scope

- Implementing or accepting the existing bounded bridge task during definition.
- Mutating any current task glyph, blocker metadata, dependency metadata, board, snapshot, or execution state; this definition preserves T007 open and solely ready, T003 open, T002 blocked, and all completed tasks unchanged.
- Running materialization or changing authoritative source or base-owned generated core.
- Modifying Feature 009 artifacts, task state, owner history, declaration, or implementation.
- Expanding T009's accepted ten-path declaration or making Feature 009 implement, accept, or close separately owned merged work.
- Reassigning, re-accepting, or closing any merged contributor's work under Feature 008.
- Reconstructing or claiming nonexistent historical accepted HEAD, source, or dual-review identity fields.
- Completing Feature 008, Feature 009, or any task.
- Creating or recording a replacement baseline, accepted evidence line, or retroactive interval.
- Duplicating Feature 009's declared source list or terminal implementation in Feature 008.
- Optional-pack, technical-documentation, release, publication, downstream upgrade, or user-facing behavior.
- A persistent pre-acceptance packet, command, helper, framework, runtime, state store, ledger, schema, API, ObjectiveRegistry, or report.
- Creating an isolated workspace for the current T009 event or inferring actor identity.
- Cleanup, adoption, or reclassification of unrelated work.

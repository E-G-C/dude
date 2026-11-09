# Plan: Terminal Work disposition and fresh admission

Spec: `.dude/specs/094-terminal-work-fresh-admission/spec.md`
Owner: `.dude/ideas/094-terminal-work-fresh-admission.md`

Extend the shipped driver, runner, adapter, recovery reducer, and Lightweight lane. Use the established fence-and-fresh-admission pattern: irreversibly retire the original capability, retain its facts, then derive new authority only for a separately supplied request. The present driver has no supplier of retrospective host-death or post-dispatch external-effect proof; those paths refuse.

## Technical Context

| Field | Choice |
| --- | --- |
| Language/Version | Dependency-free JavaScript ES modules, `// @ts-check`, Node >= 20; Markdown policy and docs. |
| Primary Dependencies | Node built-ins and existing co-versioned core modules only. |
| Storage | Existing derived temporary claim/checkpoint pair and run-local files outside the workspace; existing lane log/snapshot/receipts. No new project state surface. |
| Testing | `node:test` in existing files, independent packet inverse, disposable short-root workspaces/stores, and actual release-only driver journeys. |
| Target Platform | Existing supported Node CLI platforms, including Windows; one process per test file. |
| Project Type | Reusable core workflow CLI/runtime and its owning policy. |
| Performance Goals | Bounded deterministic work under existing limits; strict measured packet savings for constructed repetition; no extra model exchange or background lifetime. No invented latency SLO. |
| Constraints | Spec FR-020 limits stay fixed; one task/owner/outstanding challenge, existing finite challenge derivation and 75-challenge unlimited ceiling, and 999-entry idea inventory remain unchanged. |

## Guardrails and structure

Existing project and bundle guardrails suffice; no new adoption, user ratification, or guardrail file write is needed. There is no visual UI change. Keep core independent of optional packs, preserve exact ownership and append-only history, and make all implementation deltas relative to the dirty task-start baseline.

Keep the core trio only. The contracts and verification below do not need separate research, schema, checklist, or design artifacts. There is no runtime evaluation objective to compile; acceptance uses ordinary verification, not a new evaluation sequence.

| Existing owner | Bounded change and actual consumer |
| --- | --- |
| `src/skills/dude-work/recovery.mjs` | Extend packet projection and read-only fresh-admission derivation; adapter/driver consume their results. |
| `src/skills/dude-work/host-adapter.mjs` | Observe actual built-in entries/results, retain original control bytes, preflight known completion, fence the original handle, and consume one private disposal capability. |
| `src/skills/dude-work/host-adapter-runner.mjs` | Orchestrate disposition once at `finish`; retain the actual handle and close challenge consumption. |
| `src/skills/dude-work/driver.mjs` | Supply immutable terminal retention, accept one qualified claim option, and bind the new request's single use. |
| `src/skills/dude-lightweight-execution/board.mjs` | Receive one narrowly qualified same-glyph claim through the existing permit/receipt path. |
| Work policy and `COOKBOOK.md` | Own detailed rules and operating forms; intake, coordinator, lane guidance, and user docs carry concise pointers. |

Reuse `prepareSpecialistResult` and `buildSpecialistAttestationWithText` without changing their semantics. Reuse `dude-engine/lib/lightweight-work-postimage.mjs` unchanged for exact lane/receipt postimages. Keep seven driver subcommands and ten semantic adapter operations. New lifecycle framing is not operation eleven.

## 1. Lossless packets and known-completion preflight

Implements FR-018–FR-023 and SC-004–SC-006.

Keep existing whole-payload/co-role sharing, packet-local current-run references, full-set typed/readable correspondence, raw charges before sharing, and maximal whole-event owner-log suffix semantics. Do not present these delivered mechanisms or lane-first/receipt preflight as new work.

Add a co-versioned `dude-work-model-view-v2` candidate with exactly `format`, `target`, `texts`, and `items`:

- A structured `task-history` item keeps its frame and non-history fields. Its history alternates exact literal spans and complete validated canonical-event objects. An eligible event inverses to exactly `- dude-run-event: ` plus canonical JSON plus one LF. Require exact current-format shape, serialization, prefix, body, and LF. CRLF, noncanonical, unknown, malformed, and unrelated text remains byte-exact literal content. Structuring another task's valid history grants it no authority for this target.
- The text table pools only complete byte-identical repeated strings at validated readable positions: verification definition/evidence and review expectation/check-definition/observed-evidence. A supported position holds a full string or exactly `{textRef:<nonnegative safe integer>}`. Order entries by first occurrence and canonical field order. Permit no cycles, recursive/unused/foreign references, or external lookup.
- Include a group only when its table entry, references, metadata, punctuation, and digit lengths save bytes. Rebuild the table and existing history references inside every actual measured prefix/suffix; omitted evidence cannot anchor a reference.
- Compare complete canonical packet bytes for identical evidence and owner suffix. Return one v2 packet only when strictly smaller; otherwise return v1, including ties. Machine Inspection, evidence hashes, captures, and stored histories never change.

Extend the existing independent test inverse for both formats. It must restore task-history text, trusted envelope bytes/descriptors, readable fields, frames, order, and duplicates, subject only to the established explicit owner-log suffix exception. Frozen 064/065 fixtures and hashes remain unchanged.

At actual `record-attempt-result`, validate/build the sole specialist pair once through the existing builder and retain the actual received records before invoking the reducer. Measure the complete accumulated capture candidate before accepting its provisional successor. Then derive the fully known completion batch and measure all remaining lane-first and receipt prefixes with the existing byte oracle and exact postimage builder. A bounded private operation capsule holds only this actual material and expires on use, failure, supersession, or end; add no RunState/checkpoint field.

At later prepare/apply/receipt boundaries, reacquire and rederive as today. Prediction grants no effect authority. A first known excess preserves accepted state, counters, pending authorization, and earlier effects, retains the latest rejected pair as unadmitted evidence, and performs no model call or predictable subsequent write. Do not reserve hypothetical worst-case prose or silently reduce a text allowance. Structural `respond`/specialist preflight still does not guarantee fit.

## 2. Original-owner fence, retention, and disposition

Implements FR-001–FR-008 and FR-024; SC-001–SC-002.

Preserve actual default-port provenance. Move capture/Inspection observation into a narrow trusted `runtimeEvidence` observer on the adapter's actual built-in invocation. The runner consumes inert input/result observations; the driver supplies the file-retention sink. The observer cannot choose a route or substitute a result. Stop injecting the driver's arbitrary runtime wrapper just to collect evidence. Existing injected runtime/lane ports remain compatible but cannot produce automatic disposition proof, even with copied default identities.

Record capture input before reducer entry so later rejected captures do not erase earlier originals. Record every entered built-in operation, authoritative return/refusal, lane permit/mutation, receipt, pre/postimage, current-run publication, and settlement. Unknown or unfinished entries stay unknown. Equal state, empty changed paths, a returned specialist pair, or workspace hashes alone cannot account for earlier effects.

The original call follows this order:

1. Construct the original terminal decision once at `finish` and stop accepting challenges/operations.
2. `sealTerminalOwner` validates the actual handle, supervisor, invocation, worker generation/token, and accepted bytes/revision, then permanently retires the admitted owner. Reject run, end/handoff/resume reuse. Keep accepted state unchanged and distinguish the pre-fence checkpoint-host revision from the new local fence revision.
3. Qualify effects from actual entered routes/results and current surfaces. Only built-in reads, pure authorization refusals with no accepted dispatch authority, or fully receipted synchronous Lightweight effects with complete publication/settlement qualify. Any accepted non-`none` attempt, exposed/initial specialist pair, pending attempt/completion/evaluation, unknown writer/effect, handoff/replacement, outstanding exchange, or lost host identity refuses.
4. Retain the original terminal, privately retained canonical creation/latest control bytes, complete captures, fence, and effect evidence. The driver's synchronous sink writes content first and manifest last outside the workspace, then reads back exact hashes. Use existing atomic publication style and normal file protections, without claiming crash-proof directory durability.
5. Recheck exact current owner, target, lane, pair hashes/revisions, and effects against the retained basis. Only this original handle can consume its opaque one-use disposal capability through existing store `clear`.
6. Remove checkpoint first; verify its absence, unchanged claim, and continued checkpoint absence; remove claim; freshly establish both absent. Publish a separate immutable disposition result, then return the original hard stop once and nonzero with auxiliary references only.

Retain claim and submitted initial checkpoint bytes when created, and every validated latest checkpoint write privately. Never reconstruct missing controls from hashes or serialized worker tokens. A JSON fence record is evidence, not the live disposal capability. No new invocation or `accepted-state.json` continuation file follows a terminal failure.

| Failure | Required handling |
| --- | --- |
| Missing original authority, unsettled entry, or initial pair mismatch | Remove neither artifact; preserve the original failure and first missing proof. |
| Retention/hash/readback fails after fence | Keep controls and the irreversible fence; no disposed result. |
| Checkpoint unlink fails | Stop with claim retained; no retry. |
| Checkpoint removed, claim fails or replacement appears | Keep remaining/replacement artifacts and original preimages; report exact partial removal. |
| Removal occurred but final absence/result publication is unproved | Report known facts separately; no fresh-admission eligibility. |

Feature 056 remains mutually exclusive with this disposal action: at most one clear. Its exact first-Assessment guards and compatibility behavior remain. A call without the new retention sink cannot manufacture fresh-admission proof. Feature 075 stays outside Work and grants no fresh claim. No PID/age/EOF/process probe, caller-authored death assertion, or unused external-observation API is added.

## 3. Closed producer-to-consumer contracts

Implements FR-005, FR-009–FR-016, and FR-025. These are new bounded records for the actual driver path, not public override hooks.

### Terminal evidence

`TerminalEvidenceManifestV1` has exactly `version:1`, `kind:'terminal-work-evidence'`, `binding`, `files`, and `inventoryHash`.

The closed `binding` contains:

- Identity: `workspaceIdentity`, `owner` exactly `{ideaPath,specPath}`, canonical Lightweight `target`, `invocationIdentity`, `admissionIdentity`, `supervisorAuthorityIdentity`, `workerTokenHash`, and `workerGeneration`.
- Controls/state: `checkpointKey`, `claimHash`, `checkpointHash`, `acceptedStateHash`, `acceptedStateByteLength`, `acceptedRevision`, `checkpointHostRevision`, and `fenceHostRevision`.
- Current source descriptors: `requirements` exactly `{spec,plan,taskUnit}` and `lanePoststate` exactly `{tasks,owner,taskState}`; each descriptor is `{path,sha256,byteLength}` for the complete file or exact task unit.
- Original result: `terminalOutcome`, `terminalReason`, and `terminalHash`, matching the retained terminal.

Each ordered `files` row is exactly `{role,name,sha256,byteLength}`. Required roles retain original terminal, controls, captures, host fence, and effects; include any existing challenge/response/packet files actually used by that proof. Names are producer-derived, contained run-local names, never arbitrary filesystem/URL selectors. The controls file retains canonical `{version,claim,checkpoint}` with full validated `CapturedBytesV1` envelopes. The capture file retains exactly the existing `currentRun`, `verification`, `review`, and `lint` streams, original byte envelopes, ordering, and duplicates. Keep raw tokens only in restricted original evidence, never reports or admission log lines.

Use fixed run-local `terminal-evidence.json` and sibling `terminal-disposition.json`; the consumer checks their identity link. Retain the pre-disposition terminal in immutable `terminal-original.json`, separate from the final result's auxiliary references. Final result/status publication must not rewrite a manifest member or create a hash cycle. Mutable status is not proof.

`inventoryHash` covers the complete binding and ordered file descriptors, excluding itself. `manifestIdentity` is SHA-256 of the entire canonical manifest; `dispositionIdentity` is SHA-256 of the entire canonical disposition. Reuse current lowercase hash, safe-integer, inert-data, canonical-base64, and path validation. Reject unknown fields, accessors/proxies where relevant, sparse arrays, unsafe names, corrupt bytes, or invalid bindings. Serialized identities establish correlation/integrity under the cooperative host model, not bearer permission or hostile-host authenticity.

### Disposition and refusal

`TerminalDispositionV1` has exactly `version`, `manifestIdentity`, `outcome`, `removal`, and `missingProof`. Version is 1. `outcome` is `disposed` or `refused`; a disposed result requires `{checkpoint:'absent',claim:'absent'}` from final fresh observations and null `missingProof`. A refused result records each artifact as `retained`, `removed`, or `unestablished` and one missing-proof object. `manifestIdentity` may be null only before a manifest could be retained.

That object has exactly `kind`, `subject`, `required`, and `nextOwnerAction`. Kinds are `owner-fence`, `exact-control-pair`, `effect-settlement`, `retained-source`, `current-target`, `learning-authority`, `capacity`, and `removal-absence`. Use a validated target/source/artifact as subject, never rejected model text.

Apply existing grammar, lane, authority, and safety refusals first. Within disposition, use the ordered lifecycle above; within admission, use the ordered checks below. Return only the first failed prerequisite, without duplicate layer prompts. Preserve the old halt report/reason; this auxiliary diagnostic is Work-owned, not a new Ship taxonomy.

### Driver and runner boundary

Add only `claim --terminal-evidence <manifest-file>`, mutually exclusive with `--state` and a separate `--retained-evidence` source. The coordinator supplies the exact already-known handoff for that target; never search old sessions, temporary directories, or checkpoints. Missing original reference/provenance produces one precise stop.

An optional runner `priorTerminal` object has exactly `manifestIdentity`, `dispositionIdentity`, `freshAdmissionIdentity`, and the complete new `setupReceipt`. Original validated `retainedEvidence` continues through its existing field. These references cannot choose a semantic route or supply liveness/effect verdicts. The file-retention sink and request-start observation are trusted driver dependencies, not caller JSON fields.

Keep `claim`, `run`, `assess`, `respond` including `--cancel`, `snapshot`, `diff`, and `ownership`; Work/Ship command grammars and ten semantic adapter operations stay unchanged.

## 4. Fresh same-key admission

Implements FR-009–FR-017 and SC-003.

`deriveFreshAdmissionV1` is read-only. It consumes current bindings/policy, complete original handoff/disposition/captures, and current Inspection. It returns eligible current target, fresh state, Inspection hash, evidence identities, required next learning gate, and fresh-admission identity, or unchanged state plus one missing proof. A saved request file is not proof of a new explicit user request.

The new-explicit-request gate belongs to the coordinator's existing intake authority. Do not invent a JSON permission boolean or natural-language parser in the driver. Its newly authorized claim call mints the request identity; files only bind that admitted call and its one runner start.

Before any new lane write:

1. Require a new explicit execution request, autonomous Lightweight policy, zero resolver/parser diagnostics, unique exact defined owner, exact durable target, completed dependencies, and normal precedence. Do not bypass an earlier in-progress task or select a later task.
2. Validate the original fence/disposition and all retained files for this workspace/owner/target. Require unchanged spec/plan/task-unit obligations and exact seal-bound current lane surfaces. This implementation supplies no mapping for changed definitions; stop for existing explicit reconciliation authority.
3. Freshly prove both controls absent and no conflicting live claim. Exclusive pair creation remains the admission atomicity boundary.
4. Revalidate complete retained-occurrence authority, readable preimages, dual-surface evidence, and no/settled supported effects. Never import the old accepted state.
5. Derive current learning readiness before writing: no repeat follows ordinary Assessment; an eligible repeat with absent or exactly matching required projection uses existing `resume-learning` before Assessment/authorization. Later/resolved/conflicting/one-sided/stale/unavailable governance refuses. Do not copy its selected alternative or recreate its identity at revision one.
6. Measure original source/descriptor/body/transport budgets and the actual new runner packet, including its extra empty live-current-run source. Measure the complete new claim marker/snapshot/receipt footprint before its permit is usable.

For a qualified unblocked `[~]` task only, add a Lightweight schema alternative: lane kind `claim`, reason `terminal-fresh-claim`, from/to both `~`, null unchanged blocker, no event lines, and one append-only owner-log line binding the new request/admission and old manifest/disposition identities. It states the old run remains terminal. A required `admissionIdentity` binds the new random request identity, parsed policy, fresh-state hash, evidence identities, canonical owner/target, pre-admission Inspection hash, target-mapping hash, and lane-prestate hash under a versioned domain.

The issuer must freshly derive this binding and eligibility; a self-consistent supplied hash is insufficient. Both recovery and the lane receiver reject the reason/extra field outside this exact alternative. Keep all other claim/resume, blocked, and tracked matrices unchanged; no Beads change.

Use the existing setup sequence: inspection, permit, lane application, receipt commitment, settled setup check, controlled end, pair-absence check, exact poststate reacquisition, then runner request. Fresh state uses the current policy with zero invocation counters and empty pending/completed arrays; old budgets and obligations stay in immutable evidence.

Setup compares against the seal's pre-admission surfaces. Runner start compares against the new setup receipt's poststate: rebuild the one authorized marker/snapshot postimage from retained preimages and the exact mutation, verify the receipt, then compare actual bytes. Do not compare the changed owner file directly to its old hash or exempt arbitrary drift. The new runner mints fresh supervisor/invocation/worker identities and reacquires authoritative learning, Assessment, authorization, verification, review, and close gates.

The append-only marker consumes the manifest's exact owner prestate, including a zero-event new failure. Concurrent stale readers contend on the existing exclusive pair; after the first marker, old prestate cannot support another setup. Preserve a partially committed setup and report its actual effects; never erase the marker to retry.

At actual `driver.run` entry, exclusively create immutable run-local `runner-request-used.json` beside the terminal-qualified setup request, binding its complete bytes/hash and fresh-admission identity before runner invocation. The runner validates that trusted start observation for every `priorTerminal` request. Refuse reuse or omission; uncertainty stays uncertain. A later request needs the most recent actual terminal handoff and a new setup. This single-use transport record is not a registry or hidden live owner.

## 5. Ship policy, delivery, and verification

Implements FR-016–FR-017, FR-024–FR-025, and SC-007.

After existing lifecycle/eligibility gates, Ship delegates the exact target and known handoff to Work. Eligible admission uses the ordinary driver path automatically; otherwise return its one precise missing-proof stop, not a request for technical facts or redundant cleanup consent. Keep normalized Ship policy, tracked precedence, resolved-ledger refusal, exact owner selection, and no automatic Git. Pre-Work answerability ends at Work start and every new Work outcome returns unchanged.

Keep detailed rules in Work and concrete flags/examples in its cookbook. Update the old v1-only/literal-history wording, original-owner release boundary, continuity/cleanup statements, retained-source description, and one-use admission guidance without broadening 056 or 075. Other guidance only points to this owner.

### Serial slices and owners

| Task | Slice | Requirement mapping |
| --- | --- | --- |
| `T001@6f4a8d21` | Lossless packet growth and known-completion preflight | FR-018–FR-023; US3 |
| `T005@e8c73a41` | Original-owner fence, immutable retention, and disposition; replaces archived `T002@b9e36c70` with the same scope | FR-001–FR-008, FR-024; US1 |
| `T003@d7a105bc` | Fresh same-key claim and driver/runner integration | FR-009–FR-015; US2 |
| `T004@c2f68e94` | Ship caller policy, owning docs, contract pins, generated parity, installed acceptance | FR-016–FR-017, FR-024–FR-025; all stories |

Runtime/tests/docs route to Coder (`dude-pack-coding-coder`); actual `SKILL.md` authoring routes to Skill Smith (`dude-pack-authoring-skill-smith`); coordinator agent-source changes route to Agent Smith (`dude-pack-authoring-agent-smith`). Independent Tester (`dude-pack-coding-tester`) verifies all declared checks. Independent Code Reviewer (`dude-pack-coding-reviewer`) reviews runtime/contracts/effects; `dude-reviewer` retains integrated readiness authority and checks policy/role boundaries. The coordinator routes these bounded assignments and owns state/close. No further unbounded architecture phase is required.

Exact writer inventories and command selectors are in `tasks.md`. Tasks 1–3 are source-only increments verified through disposable source-built paths; task 4 projects the co-versioned deliverables. Do not publish or operate a mixed installed version as the completed capability.

### Verification design

Use existing test files, not a new general harness. For the 1/2/4/8/16 growth experiment, keep a long readable definition constant but change actual observations/results so whole payloads differ. Include canonical approach/finding/governance history, current-run counterparts, successes/failures, authority frames, lint co-roles, and Unicode. Record full canonical v1/v2 bytes for identical evidence/suffix, raw counts, physical items, table/reference overhead, selected suffix, and inverse equality. Repeat with all-unique text and with unshared padding at exact byte boundaries. Assert original capture/history immutability and honest first-excess refusal.

Original-owner tests cover actual driver provenance, copied-identity injected ports, first/later refusal, pure authorization refusal, settled governance effects, every missing/partial control and retention failure, foreign/replaced/lost owner or exchange, escaped dispatch, unknown writer/receipt/publication, and unchanged original accounting/obligations. Fresh-admission tests cover no learning and required learning, later/resolved refusal, current target/readiness/source limits, same-glyph schema agreement, exact pre/poststate, marker/request replay, contention, and partial setup/start. Use synthetic equivalents of legacy Feature 089 facts for refusal only.

Update section-scoped contract pins and deletion falsifiers in `scripts/current-format-contract.test.mjs`: packet format/inverse/fixed limits; Ship grammar/answerability/no alternate workflow; 056 release/removal ordering/ten operations/runner dependencies; seven driver commands/cookbook flags; and 075 manual-only authority. Preserve manual, transport-loss, and no-rewind assertions. Build tests must keep helpers, tests, frozen fixtures, and synthetic evidence out of the release.

### Source-first generation and stop conditions

Capture dirty/untracked baselines and hashes before each authorized attempt. Before Assessment authorization, put every actual source, Tester, docs, and generated writer from that task into the UTF-8-sorted `Assessment.materialInputs.targets`; stop for scope repair before any additional writer.

For final generation, let `$S` be a fresh authorized short external source-build copy containing the current baseline plus the approved edits and required build inputs. Run `node "$S/scripts/build-dev.mjs" --repo "$S"`. Copy back only the ten named outputs in T004 after comparison. Never run broad build-dev cleanup in the dirty shared checkout, copy development-base-release metadata, normalize unrelated files, or overwrite unrelated content within a named file. A generated-only/source conflict needs owner resolution, not silent replacement.

Let `$B` be a separate fresh short external release output for `node scripts/build-release.mjs --out "$B"`. Acceptance exercises its real `.github/skills/dude-work/driver.mjs`, including eligible/refused producer and fresh-admission paths, learning/Assessment, normal receipt settlement/close, and final ownership checks. Use only disposable test-owned targets, stub tracked-lane discovery appropriately on Windows, await child completion, and remove only proved test-owned resources.

Tester records exact commands, exits, executed/failed/skipped counts, and per-file baseline differences. Zero-match or required skipped cases establish no coverage. Stop on lost evidence, unproved cleanup, replayed admission, changed limits, a failed inverse, acceptance after known excess, unauthorized delta, or a new unexplained failure. Existing unrelated failures stay visible rather than being repaired or relabeled in this feature.

Old current-format captures/checkpoints/RunState stay readable; old packets and terminal records are not rewritten or backfilled. Bundle rollback cannot undo a fence, removed control, committed marker, or receipt. Preserve their evidence and stop; never recreate old controls or erase consumption records. This plan authorizes no release, Feature 089 cleanup/execution, or native action.

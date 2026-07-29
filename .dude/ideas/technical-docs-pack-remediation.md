---
title: Technical Docs Pack Remediation
slug: technical-docs-pack-remediation
status: defined
spec_path: .dude/specs/007-technical-docs-pack-remediation/spec.md
---

# Idea: Technical Docs Pack Remediation

## Idea

Remediate the newly created `library/packs/technical-docs/` pack after independent review returned REJECT. Follow the traditional Dude workflow: this brainstorm captures intent only; implementation must not begin until explicit `@dude define technical-docs-pack-remediation` and later execution.

The desired outcome is one materially ready `technical-docs` library pack that:

- Preserves the agreed pack name, library destination, namespace, and public surface unless definition evidence requires a narrowly justified correction: 5 agents, 7 skills, and 2 prompts.
- Preserves the central multi-source principle: source material can come from multiple diverse kinds. A software repository or source tree is a first-class source, but not the only one; transcripts, notes, drafts, existing Markdown documents, and mixed inputs remain first-class supported paths.
- Corrects every accepted review finding rather than merely changing descriptions or suppressing checks.
- Makes repository intake complete, deterministic, bounded, read-only, and traceable: ordinary admitted source files cannot disappear; every examined or skipped path is accounted for; repository work units and `R*` identities are deterministic; symlink or path escapes and incomplete scans fail closed.
- Preserves source identity and provenance across mixed inputs: inputs do not collapse into an untraceable combined file; `C*`, `E*`, and `R*` evidence retains source kind and source reference; existing-document evidence retains heading provenance.
- Makes runtime scripts fail closed and safely repeatable: strict object-only JSONL, no malformed or empty-ledger false pass, no silent unreadable-input omissions, no input/output aliasing or self-ingestion, safe output-parent creation, canonical containment, bounded reads and traversal, validated numeric thresholds, and atomic writes.
- Corrects parser and routing defects identified by review: valid WEBVTT cue text beginning `NOTE`, `STYLE`, or `REGION` is preserved; chunk overlap remains inside budget and Unicode is not split; Markdown fences match correctly and C# headings survive; decision and action IDs route exactly once.
- Establishes one consistent final gate sequence with fresh evidence after reviewer mutations: intake and extraction completeness, strict merge, recall and completeness, planning and exact-once outline coverage, drafting, semantic review, final coverage and lint, then safe finalization. Stale gate reports cannot authorize output.
- Keeps the existing `writing` pack optional. When present, `technical-docs` may defer to its style and trope skills; when absent, `technical-docs` remains functional with complete local baseline guidance. Do not create a new required sibling-pack schema merely for this feature.
- Adds focused automated tests outside shipped pack artifacts and validates transcript-only, repository-only, mixed-source, and existing-document update modes. Pack composition, install and remove cleanup, standalone and writing-enabled operation, lint, full tests, release validation, and independent re-review are required before readiness.
- Does not weaken zero-fabrication traceability, coordinator-only boundaries, pack namespace rules, or the requirement for fresh independent approval.

The rejected review reproducibly established the following problem context. These findings define defects and acceptance concerns, not prescribed implementation mechanics:

1. Repository inventory omitted ordinary implementation files and had no deterministic repository unit or `R*` allocation or repository completeness gate.
2. Mixed prose preprocessing concatenated different source kinds and lost source boundaries.
3. `coverage.mjs` returned `ok:true` and exit 0 for a ledger containing `{"text":"missing id"}` with empty consumed data.
4. Package-manifest entry points could point through a skipped symlink outside the repository.
5. Fresh repository-only output could fail because the inventory output parent did not exist.
6. Existing-document `E*` provenance contradicted the evidence-ledger contract.
7. Coverage, review, and lint order left final evidence stale or internally inconsistent.
8. Ledger merge could ingest its own prior output and silently skip unreadable inputs.
9. Inventory completeness, bounds, threshold validation, WEBVTT parsing, Unicode chunking, Markdown fence and C# parsing, and decision or action digest routing had accepted defects.
10. Optional-writing language was inconsistent, and stale source skill names remained in prose.
11. No automated runtime or handoff tests or live end-to-end evidence covered the four source modes.

Keep WHAT, WHY, and acceptance intent in this idea. Do not freeze implementation details such as exact new helper filenames, JSON schema versions, command flags, limit values, or data structures; those belong to explicit definition and planning. Deterministic helpers may own reproducible parsing, validation, accounting, and safety, while agents own semantic extraction, drafting, and review, consistent with existing project guardrails.

Because the pack has not been released, do not require legacy compatibility or migration unless definition discovers a real current consumer. Existing prototype `.td-work` artifacts may be regenerated rather than silently normalized. Keep this as one feature because all accepted findings share the same source, provenance, and runtime-correctness contract and one acceptance boundary. Existing project guardrails already cover deterministic validation, minimal design, and optional disciplines, so this brainstorm proposes no new guardrail.

## Assumptions

- The stated pack identity and public surface of 5 agents, 7 skills, and 2 prompts remain the baseline; later definition may propose only a narrowly justified correction supported by evidence.
- The review findings are accepted problem evidence. Definition will translate them into technology-appropriate contracts and acceptance criteria without treating the observed defects as fixed implementation prescriptions.
- No current released consumer requires compatibility or migration. Definition may verify this assumption, and prototype `.td-work` artifacts may be regenerated rather than silently normalized.
- Transcript-only, repository-only, mixed-source, and existing-document update modes collectively bound the required source-mode acceptance surface.
- Feature 006, `simplify-context-footprint-audit`, is unrelated active execution and remains byte-untouched by this brainstorm and any later work unless separately authorized.

<!-- dude:managed:start -->
## Normalized Intent

### Remediate The Pack As One Acceptance Boundary

- Bring the existing `technical-docs` library pack from independently rejected prototype to materially ready status while preserving its agreed identity, optional integration model, and 5-agent, 7-skill, 2-prompt public surface unless definition evidence narrowly justifies a correction.
- Resolve every accepted review finding through working behavior and fresh evidence, not prose-only changes or suppressed checks.
- Treat repository intake, source identity, provenance, runtime safety, parser correctness, exact-once routing, final gate ordering, and four-mode validation as one coherent correctness contract.

### Preserve Multi-Source Traceability

- Keep repositories, transcripts, notes, drafts, existing Markdown documents, and mixed inputs as first-class paths without collapsing source identity.
- Require complete, deterministic, bounded, read-only, fail-closed repository accounting and traceable `C*`, `E*`, and `R*` evidence, including existing-document heading provenance.
- Preserve zero-fabrication traceability, coordinator-only boundaries, pack namespace rules, and fresh independent approval.

### Require Safe, Freshly Verified Operation

- Require fail-closed, repeatable runtime behavior for strict ledgers, readable and non-aliasing inputs, safe contained outputs, bounded processing, valid thresholds, correct parsing and chunking, and atomic persistence.
- Require a single final gate order whose evidence is refreshed after mutations and cannot become stale before safe finalization.
- Keep `writing` optional with complete local baseline guidance, and require focused external tests plus composition, cleanup, standalone and integrated operation, lint, full-suite, release, end-to-end, and independent review evidence before readiness.

## Constraints

- This is brainstorm intake only. Do not create a spec package under `.dude/specs/` and do not begin implementation until explicit definition and later execution.
- Do not prescribe exact helper filenames, schema versions, command flags, numeric limits, or internal data structures during brainstorm.
- Do not introduce a required sibling-pack schema solely for this feature or require unreleased compatibility or migration without evidence of a real current consumer.
- Keep all remediation findings in one feature because they share one source, provenance, runtime-correctness, and readiness boundary.
- Do not mutate Feature 006 or any unrelated idea, task state, profile, generated board, installed pack, or implementation artifact.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger
- [x] Open questions are resolved or consciously assumed

## Coordinator Log

- 2026-07-22 UTC - brainstorm captured
- 2026-07-22 UTC - defined -> .dude/specs/007-technical-docs-pack-remediation/spec.md
- 2026-07-22 UTC - Work iteration 1 claimed T001@00709e37 under autonomous policy; pre-start Inspection 6757a733ff3ae81dfffad0b8a6f3d800b0fbb70407eea4ff15a633d27feb3888 had no blockers and no ObjectiveRegistry entry
- 2026-07-22 UTC - Lightweight board rendered after T001@00709e37 claim
- 2026-07-22 UTC - T001@00709e37 attempt 1 verified 29/29 focused tests but independent Tester and Code Reviewer rejected filesystem-safety and foundation-contract gaps; autonomous post-block Inspection fb2cfa1ca15d4b4ddad85c1fa1bfc8f6bd604f4577cb37cfeea7d0aa600a26ec authorized one address-review recovery
- 2026-07-22 UTC - T001@00709e37 recovery attempt verified 39/39 focused tests but independent re-review repeated the immediate pre-publication finding and found two staged-directory defects
- 2026-07-22 UTC - T001@00709e37 blocked after post-block Inspection bbb42d01f0b9b0eac9597674dcd5a15ddf9e833e643e598de6bb772e9a4417ae; repeated-review protocol requires user decision before any third revision
- 2026-07-22 UTC - Lightweight board rendered after T001@00709e37 block
- 2026-07-27 UTC - initialized the canonical Lightweight Execution History append surface required by the existing atomic incident-supersession wrapper; no task glyph, blocker, dependency, definition, or technical-docs implementation changed
- 2026-07-29T01:12:13Z - T006@0073b54a closed: the stale `[~]` claim left by a stopped session was resumed and the Phase 6 slice implemented. `coverage.mjs` became a two-mode gate (`--mode outline` and `--mode document --stage pre-review|final`) with strict consumed coverage and exact-once assignment, `lint.mjs` was hardened onto the shared CommonMark fence tracker with registry-bound document limits, and `finalize.mjs` was newly implemented to validate the full gate chain, re-verify registered source bytes, re-authorize the update target, create contained parents one verified segment at a time, and publish only the authorized output atomically. Coordinator-run fresh verification: focused `node --test library/packs/technical-docs/tests/runtime-gates.test.mjs library/packs/technical-docs/tests/runtime-bounds.test.mjs` passed 71/71 with 0 skipped against a 55-test baseline, the whole pack passed 146/146, zero ablation markers remained, git diff --check was clean after the coordinator removed two trailing-blank-line-at-EOF defects, and no path outside the declared T006 write set changed
- 2026-07-29T01:12:13Z - T006@0073b54a independent review returned APPROVE after tracing every field `finalize.mjs` acts on, confirming shared-primitive reuse with no reimplemented or weakened containment, verifying fail-closed ordering with the first mutation at step 16 of 17, confirming genuinely atomic publication via `linkSync` no-replace for create and revalidated adjacent `renameSync` for replace/update, and judging the new tests failing-capable rather than vacuous. The reviewer accepted all six implementer disclosures, finding the residual unbound report fields carry no authority because publication emits bytes independently bound to the review and both final reports. Six non-blocking observations were recorded for later work, including a plan-internal tension where the canonical gate sequence claims repository-member revalidation that the fixed command interfaces give `finalize.mjs` no input to perform
- 2026-07-29T01:12:13Z - Lightweight board rendered after T006@0073b54a close; T007@00745381 is the only ready task and no task is in progress or blocked
<!-- dude:managed:end -->
- 2026-07-27T18:58:37Z - incident-supersession v1 intent=704d3efce1a5a51f9ca9b66f9a006def73a2227a3581190268498c9b2d18f72a branch=evidence-incomplete target=T001@00709e37
- 2026-07-27T20:57:50Z - Work recovery cycle 1 authorized address-review for T001@00709e37 from Inspection 85fbd962852d9026ee5669241ccb7e32e220d5bcfdc47845e5d17a638764b1ea; claimed the task in Lightweight Execution and cleared the superseded evidence-incomplete blocker
- 2026-07-27T20:58:48Z - Lightweight board rendered after T001@00709e37 guarded recovery claim
- 2026-07-27T21:21:01Z - T001@00709e37 recovery cycle 1 added five regressions and repaired the three surviving defects; fresh Tester verification passed 5/5 regressions and 44/44 focused tests, but independent Code Reviewer rejected callback-time atomic-file payload substitution, callback-time staged-directory operand substitution, and identity-poor destructive cleanup
- 2026-07-27T21:21:01Z - T001@00709e37 blocked after post-block Inspection 9164499563d6a230b48962d0dd77223144e3fa56f5993e97a9b778697b2fdd01 returned approval-required; another same-class revision requires explicit user decision, recovery counters remain 1/1 with no pending authorization, and all dependent tasks remain not ready
- 2026-07-27T21:21:22Z - Lightweight board rendered after T001@00709e37 recovery rejection and block
- 2026-07-27T21:24:32Z - user authorized a second T001@00709e37 revision; Work recovery cycle 2 authorized address-review from Inspection d32aa1e539864acacbb7970fe05344c5abe1068cbdd52bd6ea1d867204cbdc65, claimed the task, cleared the approval blocker, and rendered the board
- 2026-07-27T21:40:43Z - T001@00709e37 recovery cycle 2 bound temp/stage identity across the callback boundary and failed cleanup closed without proven ownership; Tester added four regressions and verified non-vacuity, focused suite passed 48/48, but independent Code Reviewer returned ESCALATE: F1 in-place temp rewrite still publishes bytes that mismatch the returned digest, F2 in-place mutation of a reused destination still returns reused:true, F3 the null-identity rule now blocks publication on identity-poor hosts against plan.md, F4 failure-path temp unlink is not ownership-checked
- 2026-07-27T21:40:43Z - T001@00709e37 blocked after post-block Inspection f1a2828ba10551bb749af9e7faae0e9825a98d2512953475ccb726637dd0ec2b returned approval-required; second failure on the same publish-integrity invariant requires a user decision, recovery counters are 2/2 with no pending authorization, and no dependent task is ready
- 2026-07-27T21:40:43Z - Lightweight board rendered after T001@00709e37 escalation block
- 2026-07-27T21:43:42Z - user authorized the F1-F4 revision; Work recovery cycle 3 authorized address-review from Inspection 4bed96d58e5cb2b0bc6527fd3e18ee080019e3f9a18caa83d72bf71d72e15775, claimed the task, cleared the escalation blocker, and rendered the board. Session policy remains guarded, so autonomous learning governance is not engaged
- 2026-07-27T22:03:16Z - T001@00709e37 recovery cycle 3 closed F1 by re-digesting the temp before publish, F2 by reordering the reuse callback above verifyExisting, F3 by scoping the null-identity rule to deletion only, and F4 by ownership-checking the failure-path unlink; Tester reconciled two stale assertions that encoded the F4 defect and added same-length/different-length in-place rewrite plus in-place reuse-mutation regressions
- 2026-07-27T22:03:16Z - T001@00709e37 closed: coordinator-run fresh verification passed 50/50 with 0 skipped, git diff --check clean, and independent Code Reviewer returned APPROVE; recorded non-blocking follow-ups M1 reuse-branch stagedIdentity recheck, M2 readStableBytes both-known-and-different, L1 reuse cleanup RuntimeError wrapping, L3 publishStagedDirectory doc refresh
- 2026-07-27T22:03:16Z - Lightweight board rendered after T001@00709e37 close; T002@00713c6e is now the only ready task
- 2026-07-27T22:04:20Z - Work iteration 2 claimed T002@00713c6e from pre-start Inspection 67ef44d3cde9da3535337517dc4d7dc78a8130f0e268209197b61d253ec86671 with no blockers; board rendered after the claim
- 2026-07-27T22:28:33Z - T002@00713c6e closed: implemented the schema-version-2 source manifest and authoritative source registry reusing T001 runtime primitives, coordinator-run fresh verification passed 55/55 canonical and 66/66 full pack with 0 skipped, git diff --check clean, and independent Code Reviewer returned APPROVE with no blocking or medium findings; recorded residuals L1 prospective case-variant --out alias, L2 relocated registry has no traversal skip disposition, L3 created output parents are not rolled back, L4 pack.md runtime-script list omits source-manifest and finalize for T007
- 2026-07-27T22:28:33Z - Lightweight board rendered after T002@00713c6e close; T003@0071daa5 and T004@007278dc became ready
- 2026-07-27T22:29:00Z - Work iteration 3 claimed T003@0071daa5 (Inspection 67e74032459999749241 2d06e0b233ecd2621ec5b2545463714ec444721893e5) and T004@007278dc (Inspection 081ae0c2b872d1c0dd8693a96a614bbe5745c7b240eb8b1d39b6051e92429bc7) for capped parallel dispatch; both are [P] with declared disjoint write sets, both dependencies are closed, and coordinator retains serialized state, log, and close authority
- 2026-07-27T23:29:50Z - T003@0071daa5 closed: per-source prose/document intake with WEBVTT block state machine, code-point-safe budgeting including overlap, T001 fence primitives, and hierarchical E* heading provenance; coordinator-run fresh verification passed 23/23 canonical and 95/95 full pack with 0 skipped, and independent Code Reviewer returned APPROVE with residuals only (locator `#L` delimiter collision to pin before T005, triplicated registry helpers awaiting a lib/ consolidation task, front-matter exclusion, unprotected sources.json, single-line setext, lone-CR handling)
- 2026-07-27T23:29:50Z - T004@007278dc blocked as contract-mismatch after independent Code Reviewer ESCALATE; fresh verification passed 17/17 canonical and 95/95 full pack, and the reviewer confirmed every accepted defect fixed in code, but plan.md line 110 mandates code-point-safe hard splitting of an oversized line while schemas.md line 248, data-model.md line 63, and plan.md line 116 require each admitted byte range to be represented once, and the closed RepositoryMember schema carries no sub-line offset; resolution requires explicit define, not coder rework, and must settle before T005 consumes R* units
- 2026-07-27T23:29:50Z - Lightweight board rendered after T003@00 71daa5 close and T004@007278dc block; no task is ready
- 2026-07-27T23:42:09Z - defined -> .dude/specs/007-technical-docs-pack-remediation/spec.md (Option D amendment): plan.md line 110 now splits only at line boundaries and records a file containing a line larger than one unit budget as an accounted skip with reason `oversized-line` that coexists with complete:true; user intent unchanged, spec.md/data-model.md/contracts/schemas.md/tasks.md byte-unchanged, and the once-only statements at schemas.md:248, data-model.md:63, and plan.md:116 preserved verbatim; reason vocabulary needed no amendment because `reason` is an open NonemptyString
- 2026-07-27T23:42:09Z - execution reconciliation after re-definition: all nine tasks kept by durable key with no changed, dropped, or new rows; Lightweight Execution History preserved; coordinator cleared the now-false contract-mismatch blocker and returned T004@007278dc to open, and coordinator-run dude-lint reported 0 warnings and 0 failures
- 2026-07-28T00:03:01Z - T004@007278dc closed: deleted the hard-split branch and classified a file containing any line larger than one unit budget as an accounted skip with reason `oversized-line`, net +5 implementation lines; coordinator-run fresh verification passed 18/18 canonical and 96/96 full pack with 0 skipped, git diff --check clean, dude-lint 0/0, and independent Code Reviewer returned APPROVE confirming the escalation closed at the mechanism level with the skip predicate the exact negation of the allocation threshold; Tester proved non-vacuity by restoring the old branch in a scratch copy outside the workspace, where the committed suite drops to 15/18
- 2026-07-28T00:03:01Z - Lightweight board rendered after T004@007278dc close; T005@00731713 is now the only ready task. Open follow-ups carried forward: protectedPaths omits registered file Sources, registered non-repo Sources inside a repo can also become R* candidates, repo-inventory registry validator is weaker than T003's, capability-probe bare returns report pass instead of skip, triplicated registry helpers await a lib/ consolidation, locator `#L` delimiter collision to pin before T005, and schemas.md:582 "per-file overflow" wording could be clarified
- 2026-07-28T00:10:14Z - `@dude work --policy autonomous` hard-stopped before claiming T005@00731713 with evidence-incomplete on subject occurrence-retention; no task state, board, snapshot, or definition byte changed. Root cause is a core write/read round-trip defect outside this feature: `src/skills/dude-work/recovery.mjs` writes `- dude-run-event: {...\"type\":\"incident-supersession\"...}` into `## Lightweight Execution History`, and `validateEventCommitmentV1` accepts that kind, but `V2_EVENT_TYPES` omits it, so `isV2AuthoritativeEventRecord` returns false, `t002EventCandidate` returns null, and `parseV2EventLines` throws `contains an unknown prefixed event record`. Causation proven on a temp copy: identical autonomous authorization returns evidence-incomplete with the event line present and authorized with it removed. Guarded policy is unaffected and T005 remains ready under it
- 2026-07-28T00:15:22Z - user chose to resume under guarded policy; Work iteration 1 of a new guarded invocation claimed T005@00731713 from pre-start Inspection 96cc04a9ddae16cf217bfd4a1f63d8665440de069385cef08b4f35c79c792390 with no blockers, and the board was rendered after the claim
- 2026-07-28T01:31:45Z - T005@00731713 attempt 1 rewrote merge-ledger (index/merge), extraction-audit, and ledger-digest and verified 32/32 focused and 128/128 full pack, but independent Code Reviewer returned REJECT on BLOCKING-1: extraction-audit omits `result.fragment.path` from both its alias guard and protectedPaths, so `--json <validated fragment>` overwrites a gate input and still reports ok:true, while sibling merge-ledger guards fragment paths in both modes. Recovery cycle 1 authorized address-review from post-block Inspection 224561117c4d58e5083706cd93aee2a3d613bd4e787059d56ea61de6258fcc0c; task remains in progress. Tester also found the original `C#` locator fixture vacuous with respect to end-anchoring and replaced it with a discriminating one
- 2026-07-28T01:52:32Z - T005@00731713 closed: recovery cycle 1 added fragment paths to both extraction-audit barriers using the merge-ledger pattern and corrected the digest snippet whitespace class to `\p{White_Space}`; coordinator-run fresh verification passed 34/34 canonical and 130/130 full pack with 0 skipped, git diff --check clean, dude-lint 0/0, and independent Code Reviewer returned APPROVE confirming the no-evidence fragment skip is complete by construction and the collapse-then-trim leaves no surviving edge whitespace. Non-vacuity proven both ways against reverted scratch copies. Accepted residuals carried forward: alias-guard asymmetry on result paths is cosmetic because the write-time barrier is byte-safe and input-vs-input aliasing is unreachable, O(n^2) result membership at large unit counts, `empty-result-set` code name for a non-empty set, output parents created before validation completes, symbol-qualified repository locators rejected pending a grammar, input field order unenforced, and plan.md line 128 should drop "or reread unit manifests" since contracts/schemas.md governs
- 2026-07-28T01:52:32Z - Lightweight board rendered after T005@00731713 close; T006@0073b54a is now the only ready task

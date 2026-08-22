# Implementation Plan: Ship Checkpoint Autonomy

## Summary

Amend the existing prompt authority for Ship rather than adding a resolver or
runtime. `dude-work-intake` will state the shared pre-Work sequence: the existing
stage owner runs all of its gates, then applies the qualitative answerability
test. `dude-feature-definition` will own the only detailed durable exception,
including already-answered definition clarifications and Ship-authorized
guardrail adoption. The coordinator will preserve stage ownership, carry
autonomous pre-Work dispositions only for the current invocation, and include
them in its existing response.

The Spec Lead agent will carry a concise pointer to the definition-owned policy.
Work and its runtime remain untouched. Focused contracts will replace Feature
017's unconditional no-answer assertions with the narrow supersession while
retaining its target, ownership, tracked-precedence, genuine-ambiguity, and Work
protections. Direct Ship and definition guidance will be aligned, then
authoritative `src/` changes will be projected to `.github/` only through the
existing development build.

The coordinator will also reconcile the existing guardrail-memory authority
preamble through `dude-memory-ledger`. That maintenance changes no guardrail
entry and is not a new guardrail adoption or candidate checkpoint; it removes
the live contradiction between the ordinary user-ratification rule and this
narrow explicit-Ship exception.

The canonical feature identity is
`.dude/specs/039-ship-checkpoint-autonomy/spec.md`, prospectively and exactly
owned by `.dude/ideas/ship-checkpoint-autonomy.md`.

This feature has no task-keyed runtime objective and no active ObjectiveRegistry
region.

## Technical Context

**Language/Version**: Markdown agent and skill authority plus dependency-free
ECMAScript module contract tests under Node.js 20 or newer

**Primary Dependencies**: Existing Dude coordinator, Spec Lead,
`dude-work-intake`, `dude-feature-definition`, unchanged `dude-work`, existing
`dude-memory-ledger`, section-aware current-format contract helpers,
source-to-dev projection, and current user documentation

**Storage**: Existing project guardrail memory only. Qualifying adopted
candidates may be added to its entries, while one coordinator-owned maintenance
write reconciles the authority preamble without adding or changing an entry.
Pre-Work dispositions remain transient conversation context. Add no state file,
decision ledger, audit carrier, registry, profile, or schema.

**Testing**: Focused section-bounded prompt and documentation contracts with
deletion-sensitive mutations; source/generated projection tests; recursive
Node.js suite; workspace and release lint; Compose verification; development and
release build tests; prose repetition review; diff and changed-path inspection

**Target Platform**: GitHub Copilot in VS Code or CLI on supported Dude
workspaces, with Node.js maintenance checks on macOS, Linux, and Windows

**Project Type**: Reusable Markdown multi-agent coordination bundle with
authoritative core under `src/`, generated dogfood core under `.github/`, and
direct guidance under `README.md` and `docs/`

**Performance Goals**: No runtime performance target applies. The prompt path
adds one bounded qualitative decision after existing owner gates and before
Work, with no background or per-task processing.

**Constraints**: Preserve stage-owner and coordinator write authority; preserve
Feature 017 target and tracked behavior; leave Work byte- and behaviorally
outside implementation scope; keep `src/` authoritative; generate `.github/`
only with `node scripts/build-dev.mjs`; add no central resolution or persistence
surface

## Specification Quality Validation

- Four prioritized, independently testable stories cover answerable pre-Work
  decisions, protective guardrail adoption, preserved stops and Work authority,
  and disposition visibility.
- Acceptance scenarios cover owner-first gates, label-only checkpoints,
  already-answered clarifications, wholly protective and mixed guardrail sets,
  all-irrelevant reject-and-continue, material rewrites and tradeoffs, genuine
  ambiguity, Work-returned stops, transient reporting, and the fixed-basis
  retrospective.
- FR-001 through FR-020 state observable WHAT and WHY without naming source
  files, test helpers, or projection mechanisms.
- SC-001 through SC-008 are measurable through owner-gate and disposition
  matrices, source contracts, Work-boundary regressions, report inspection, and
  prohibited-surface inventory.
- The exact Feature 017 supersession names User Story 3 acceptance scenario 3,
  the corresponding FR-017 user-controlled/no-answer slice, and SC-006's
  conflicting identical-stop slice. Target validation, tracked precedence,
  lifecycle ownership, same-owner authority, every other SC-006 outcome,
  ambiguity protections, and FR-019 Work authority remain intact.
- No unresolved clarification or `[NEEDS CLARIFICATION]` marker remains.

The specification satisfies its WHAT/WHY gate by inspection. This is not a lint,
publication, execution, or readiness claim.

## Verified Current Topology

1. `src/skills/dude-work-intake/SKILL.md` owns Ship's optional-target grammar,
   target and tracked precedence, lifecycle resolution, normalized Work handoff,
   and current blanket rule that Ship never supplies an answer to a brainstorm,
   definition, or guardrail checkpoint. It is the narrow shared Ship authority
   to replace that blanket rule with owner-first answerability.
2. `src/skills/dude-feature-definition/SKILL.md` owns clarification gates,
   guardrail candidate inference and persistence, spec-before-plan validation,
   first-definition publication, and definition write authority. Its current
   guardrail contract permits persistence only after user `accept` or `edit`, so
   this is where the Ship-authorized exception must be defined.
3. `src/agents/dude.agent.md` owns lifecycle orchestration, the concise Ship
   procedure, coordinator response shape, and the current prohibition on
   answering clarification or guardrail checkpoints. It can carry transient
   pre-Work disposition reporting without changing Work's response or audit.
4. `src/agents/dude-spec-lead.agent.md` repeats the user-only guardrail rule as
   terse role guidance. It needs a concise pointer and ownership statement, not
   a second copy of the detailed eligibility matrix.
5. `src/instructions/dude.instructions.md` already preserves specialist and
   coordinator authority, canonical ownership, current-only behavior, and YAGNI.
   It contains no conflicting checkpoint rule and needs no change.
6. `src/skills/dude-work/SKILL.md`, its host adapter and runner, and every Work
   test own execution-time classification, recovery, verification, review,
   close, audit, reporting, and learning governance. None needs a semantic
   change.
7. `scripts/current-format-contract.test.mjs` already owns the Ship source,
   authority, documentation, prohibited-artifact, and source/generated
   contracts. Its current assertions explicitly require unchanged clarification
   and guardrail checkpoints, so the focused regression belongs there rather
   than in a new test module.
8. Current direct guidance for Ship and definition lives in `README.md`,
   `docs/commands.md`, `docs/setup.md`, `docs/workflow.md`,
   `docs/walkthrough.md`, and `docs/reference.md`. Several of these currently say
   Ship never answers or always pauses at the same guardrail checkpoint.
9. `node scripts/build-dev.mjs` projects the four applicable authoritative source
   files to `.github/agents/` and `.github/skills/`. Existing build tests own
   exact projection parity.
10. `.dude/memory/guardrails.md` says in its authority preamble that only
    user-accepted guardrails become durable project rules. That absolute
    statement conflicts with the accepted explicit-Ship exception. The
    coordinator owns memory maintenance and `dude-memory-ledger` owns the
    matching write procedure; no specialist owns or receives this edit.

## Guardrail And Smallest-Design Check

Existing project guardrails already require deterministic contracts,
authoritative `src/` edits, generated-core discipline, concise model-facing
instructions, and the smallest design with a current caller. No new durable
project guardrail is needed. Reconciling the existing authority preamble is
coordinator maintenance, not a proposed rule, guardrail entry, or adoption
event, so definition does not pause for a guardrail candidate.

| Kept surface | Reachable need | Specification proof |
|---|---|---|
| Existing Ship resolver guidance | Ship needs one common owner-first answerability rule before its existing lifecycle handoff. | FR-001 through FR-006; SC-001, SC-002 |
| Existing definition authority | Clarification and guardrail behavior must stay with the owner that already evaluates and persists them. | FR-007 through FR-012; SC-003, SC-004 |
| Existing guardrail-memory authority preamble | Live project guidance must distinguish ordinary user ratification from the narrow explicit-Ship exception without changing an entry. | FR-013; SC-004 |
| Existing coordinator response | Users need same-invocation visibility without another report or audit. | FR-017, FR-018; SC-006 |
| Existing current-format contract suite | The replaced prohibition and preserved boundaries need direct deletion falsifiers in their current owner. | All FR; all SC |
| Existing development projection | Shipped dogfood authority must match `src/` exactly. | FR-013 through FR-020; SC-005, SC-008 |

Rejected designs:

- A central checkpoint resolver, shared decision service, parser, allowlist,
  score, rubric, confidence threshold, or exhaustive taxonomy. Existing stage
  owners already know whether their gates passed and what evidence they own.
- A Ship mode flag or another command. The explicit Ship invocation already
  supplies the bounded context.
- A disposition schema, state file, ledger, report, or persistent audit entry.
  The current coordinator response provides the required visibility.
- A Work change. The accepted scope ends when Work begins.
- A new test module. The existing section-aware Ship contract suite owns these
  exact source and documentation surfaces.
- A generalized policy-adoption mechanism. Only definition guardrails have a
  current durable caller for this exception.
- A specialist-owned memory edit or a new guardrail entry. The coordinator can
  reconcile the existing authority preamble through its installed memory skill.
- New supporting artifacts. No API, data model, schema, research record,
  quickstart, or checklist is needed for a bounded prompt-contract change.

## Artifact Ownership And Sequence

The closed installed roster resolves every authored artifact uniquely:

| Ordered outcome | Exact owner | Artifact boundary |
|---|---|---|
| Reusable skill procedure | Skill Smith | `src/skills/dude-work-intake/SKILL.md`, `src/skills/dude-feature-definition/SKILL.md` |
| Agent role and orchestration prose | Agent Smith | `src/agents/dude.agent.md`, `src/agents/dude-spec-lead.agent.md` |
| Guardrail-memory authority maintenance | Coordinator through `dude-memory-ledger`; no specialist dispatch | `.dude/memory/guardrails.md` authority preamble only |
| Contract authoring and all verification | Tester | `scripts/current-format-contract.test.mjs` and fresh verification evidence |
| Documentation, software integration, and development build | Coder | `README.md`, five direct docs, and generated projection through `node scripts/build-dev.mjs` |
| Independent acceptance | Reviewer | Read-only verdict over the unchanged revision and Tester evidence |

During implementation, only the coordinator mutates the planned memory
preamble, task glyphs or metadata, generated boards or mirrors, and execution-log
or execution-history state. Definition-log staging remains with the Spec Lead
under the first-definition transaction. Specialists report results without
applying coordinator-owned mutations. The tasks remain sequential because the
agent sources depend on the skill policy, the authority preamble depends on that
settled policy, contracts cover all three, and integration precedes verification
and review.

## Chosen Design

### 1. Put the common answerability sequence in the existing Ship owner

The unique installed Skill Smith authors this `SKILL.md` source.

Update `src/skills/dude-work-intake/SKILL.md` `## Ship` without changing grammar,
target selection, lifecycle resolution, tracked precedence, or the normalized
Work policy.

Replace the blanket checkpoint sentence with a short owner-first sequence:

1. The existing pre-Work stage applies all of its current eligibility,
   prerequisite, authority, and safety gates. A failed gate returns the same
   refusal before answerability.
2. After those gates pass, the same stage owner continues only when accepted
   intent, applicable context and guardrails, material evidence, and the user's
   interests make one conservative disposition clearly dominant within its
   authority and leave no material unresolved risk.
3. A checkpoint label has no independent stopping effect.
4. If the test is not met, the owner stops with the missing basis, the reason
   bounded delegation is insufficient, and the user choice that changes the
   outcome.

State that the examples of existing refusals remain illustrative rather than a
second taxonomy. Keep Ship itself from acquiring artifact or write authority:
the owning stage makes the disposition. Preserve the prohibitions on invented
assumptions and generic bypasses.

The intake-owned section should point definition decisions to
`dude-feature-definition` and stop the policy at the Work boundary. It must say
that Work-returned outcomes are passed through without reclassification, extra
retry, minimization, or override. Do not add a protocol object, parser, mode, or
new handoff route.

### 2. Make definition the detailed clarification and guardrail owner

The same Skill Smith authors this second `SKILL.md` source so reusable procedure
authority is not transferred to a general software writer.

Update `src/skills/dude-feature-definition/SKILL.md` `## Guardrail And Spec Gates`.
Keep ordinary brainstorm and define behavior unchanged: outside explicit Ship,
candidate guardrails still use the existing `accept`, `edit`, `reject`, or
`skip` checkpoint.

During an existing explicit Ship lifecycle subaction, after definition's normal
gates pass:

- Resolve a clarification only when accepted intent or material evidence already
  supplies the answer. Do not edit user-controlled question answers merely to
  manufacture completion, and do not say the user supplied a new answer.
- Adopt a wholly protective, applicable, intent-consistent candidate set through
  the existing definition-owner guardrail write path.
- For a mixed set, remove only candidates that are clearly irrelevant,
  speculative, or contrary to accepted intent. Adopt the qualifying remainder
  without rewriting it.
- When every candidate is clearly irrelevant, reject the whole set and continue
  under the applicable existing project and bundle guardrails.
- Stop on material rewriting, tradeoffs, conflicts, user-owned authority, or
  consequential uncertainty. Use the actionable stop content from FR-008.
- Do not choose `skip` when it would drop applicable project guardrails.
- Describe any autonomous adoption, narrowing, or reject-all result as
  Ship-authorized definition-owner action, never direct user ratification or a
  user `accept`, `edit`, `reject`, or `skip`.

The complete guardrail disposition matrix is:

| Candidate set after definition gates | Autonomous result | Continuing guardrails | Attribution |
|---|---|---|---|
| Wholly protective, applicable, and intent-consistent | Adopt the set | Existing project and bundle guardrails plus the adopted entries | Ship-authorized definition-owner action |
| Mixed, with only clearly irrelevant, speculative, or contrary candidates removable | Remove only those candidates and adopt the unchanged qualifying remainder | Existing project and bundle guardrails plus the adopted entries | Ship-authorized definition-owner action |
| Every candidate clearly irrelevant | Reject the whole set and continue | Applicable existing project and bundle guardrails | Ship-authorized definition-owner action, never a user `reject` |
| Material rewrite, tradeoff, conflict, user-owned authority, or consequential uncertainty | Stop for the outcome-changing user choice | Existing project and bundle guardrails remain in force | No autonomous disposition |
| A proposed `skip` would discard applicable project rules | Do not choose `skip`; use another qualifying row or stop | Applicable existing project and bundle guardrails remain in force | Never a user `skip` |

The adoption uses the existing `.dude/memory/guardrails.md` surface and existing
definition authority. Add no attribution field or durable disposition record;
the coordinator response carries attribution. The first-definition transaction,
spec-before-plan gate, exact owner checks, protected user content, and lint
handoff remain unchanged.

### 3. Keep agent orchestration and reporting in agent sources

The unique installed Agent Smith authors both `.agent.md` sources. Update
`src/agents/dude-spec-lead.agent.md` only enough to point to the detailed skill
rule and state the ordinary-versus-explicit-Ship distinction. Do not duplicate
the full answerability or guardrail matrix in the agent.

Update `src/agents/dude.agent.md` in `## Lifecycle` and `## Ship` so ordinary
guardrail pauses retain their current user choices while explicit Ship delegates
eligible decisions to the existing stage owner under the answerability rule.
The coordinator must not decide definition content, persist candidate guardrail
entries itself, or take over user-controlled idea sections.

For the current Ship invocation, retain only enough transient context to include
each autonomous pre-Work checkpoint, disposition, and concise rationale in the
existing final or stop response. Include reversibility or residual risk only
when material. This is response composition, not a new response schema or
persisted audit.

The Work handoff remains the existing exact normalized policy. At the boundary
where Work begins, the coordinator stops applying pre-Work answerability. It may
include earlier pre-Work dispositions in the eventual same-invocation response,
but Work's own dispositions stay in Work's existing audit and reporting and
every Work stop is returned unchanged.

Document the fixed-basis retrospective rule in the Ship owner and coordinator:
`why did you stop?` can expose an unnecessary interruption only when target,
accepted intent, material evidence, workflow state, authority, and environment
are unchanged and the question supplies no fact, choice, permission, or
authority. A changed basis is inconclusive.

### 4. Reconcile the live guardrail authority preamble

After the skill and agent authority agree, the coordinator directly loads
`dude-memory-ledger` and updates only the authority preamble in
`.dude/memory/guardrails.md`. It must distinguish ordinary definition, where
only user-accepted or user-edited candidates become durable, from the narrow
explicit-Ship definition-owner adoption authorized by this feature.

Preserve the heading and every existing `## Entries` item without changing user
meaning. Append no entry, do not call the maintenance write ratification or
adoption, and do not delegate it to Skill Smith, Agent Smith, Coder, Tester, or
Reviewer. This reconciliation uses existing coordinator memory authority and
does not trigger a guardrail-candidate pause.

### 5. Replace only the superseded source contracts

Extend `scripts/current-format-contract.test.mjs`; do not create another test
file.

Revise the existing Feature 017 Ship assertions narrowly:

- replace only User Story 3 acceptance scenario 3, FR-017's
  user-controlled/no-answer slice, and SC-006's identical-stop slice for
  owner-eligible, answerable pre-Work clarification and guardrail dispositions;
- preserve SC-006's same-owner requirement and identical outcomes for lean
  definition, verification, review, ownership, reconciliation, close, audit,
  reporting, learning governance, and tracked definition recovery;
- continue to reject Ship-owned definition writes, direct Ship answers,
  invented assumptions, generic checkpoint bypass, tracked import or fallback,
  and alternate Work implementation;
- continue to pin exact Ship grammar, target validation, lifecycle matrix,
  tracked precedence, owner authority, fixed Work policy, and no new Ship
  artifact inventory.

Add section-bounded requirements for:

- owner gates before answerability and unchanged owner refusals;
- checkpoint labels carrying no independent stop authority;
- the qualitative clearly-dominant conservative test with no score or class
  allowlist;
- definition resolution of already-answered clarification without invented user
  attribution;
- wholly protective adoption, mixed-set removal limits, all-irrelevant
  reject-and-continue under applicable existing project and bundle guardrails,
  material rewrite and uncertainty stops, `skip` protection, and
  Ship-authorized non-user attribution for every autonomous result;
- ordinary non-Ship guardrail choices remaining available;
- the reconciled guardrail-memory authority preamble, unchanged existing
  entries, and absence of a new guardrail entry;
- the Work boundary and unchanged returned stops;
- transient coordinator reporting separated from Work's formal audit;
- the six-part fixed-basis retrospective and no permission from the question;
  and
- absence of a central resolver, parser, mode, lane, taxonomy, state, report,
  audit carrier, or duplicate workflow.

Use the suite's existing `markdownSection`,
`missingParagraphRequirements`, visible-Markdown, mutation, inventory, and
source/generated helpers. Give each behavior a labeled deletion or weakening
falsifier. Do not add broad free-prose contradiction regexes that attempt to
infer semantics outside bounded named clauses.

### 6. Align only direct user guidance

The Coder is the narrowest installed writer for the combined documentation and
software-integration outcome. The Coder does not author the skill, agent, test,
or memory artifacts.

Update the six current Ship documentation surfaces:

- `README.md`: replace the promise that every clarification or guardrail
  checkpoint waits with a concise owner-first answerability explanation and link
  to the command reference.
- `docs/commands.md`: make `### @dude ship` the complete user-facing contract for
  eligible pre-Work dispositions, Ship-authorized guardrail adoption, narrowing,
  all-irrelevant rejection under existing project and bundle guardrails,
  actionable unresolved stops, non-user attribution, disposition reporting, the
  retrospective diagnostic, and unchanged Work authority. Keep the exact Ship
  and Work grammar.
- `docs/setup.md`: distinguish ordinary define's approval checkpoint from Ship's
  narrow definition-owner authority, including non-user-ratification
  attribution.
- `docs/workflow.md`: state the owner-first pre-Work rule and preserve stage
  ownership and the Work boundary without duplicating the full matrix.
- `docs/walkthrough.md`: update the fast-path and guardrail examples so they no
  longer teach that Ship always pauses at the same checkpoint.
- `docs/reference.md`: update feature-definition and guardrail rules with the
  explicit Ship exception and preserve ordinary definition behavior.

Keep language specific and concise. Run the installed writing-style and
avoid-AI-tropes guidance over the changed prose. The repeated policy belongs in
full only in `docs/commands.md`; the other guides should summarize and link.

### 7. Project authoritative source and inspect the boundary

After source, contracts, and docs agree, run:

```bash
node scripts/build-dev.mjs
```

The intended generated semantic changes are:

- `.github/agents/dude.agent.md`
- `.github/agents/dude-spec-lead.agent.md`
- `.github/skills/dude-work-intake/SKILL.md`
- `.github/skills/dude-feature-definition/SKILL.md`

No generated core file is hand-edited. Run the build a second time and require
no additional change. Use existing build tests to require exact projection
equivalence. Inspect all changed paths so no Work module, runtime, instruction,
pack, guardrail entry, other memory content, state, metadata, schema, or
historical feature package changed for this feature. The authority-preamble
maintenance in `.dude/memory/guardrails.md` is the sole intended memory diff.

## Test Strategy

### Focused contract authoring

The Tester extends the existing Ship and definition sections in
`scripts/current-format-contract.test.mjs`, then runs the focused Ship subset.
The contracts should fail when an owning paragraph is deleted or weakened and
should allow the narrow definition-owner action without allowing Ship or the
coordinator to take definition write authority.

```bash
node --test --test-name-pattern='Ship' scripts/current-format-contract.test.mjs
```

The Tester reports gaps without implementing product or documentation fixes.
Accepted `SKILL.md` gaps return to Skill Smith, `.agent.md` gaps return to Agent
Smith, authority-preamble gaps return to the coordinator, and documentation or
build-integration gaps return to Coder. Incorrect test expectations return to
Tester rather than being weakened by another owner.

### Source, documentation, and projection checks

Coder performs the development build twice and integrates the direct docs.
Tester then runs the source, documentation, and projection checks:

```bash
node scripts/build-dev.mjs
node --test scripts/current-format-contract.test.mjs
node --test --test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' scripts/build-dev.test.mjs
```

Tester inspects the four source/generated pairs, verifies that a fresh build has
no net change, checks the sole authority-preamble memory diff, and applies the
installed repetition report to the changed human-facing source, memory preamble,
and documentation set. Reviewer later decides whether reported repetition is
required contract language or avoidable duplication.

### Final integrated verification

The final Tester pass runs over one unchanged integrated revision:

```bash
node scripts/build-dev.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
node --test scripts/build-dev.test.mjs scripts/build-release.test.mjs
node scripts/build-release.mjs --out <fresh-external-temp-dir> --tag v0.0.0
node .github/skills/dude-lint/lint.mjs <fresh-external-temp-dir>
git diff --check
git status --porcelain --untracked-files=all
```

Accept only the documented pristine-release warning baseline and zero failures.
Inspect the release to confirm it carries the generated source policy and no
project definition package, test file, Ship-specific runtime, state, or audit
carrier. Confirm no changes under `src/skills/dude-work/` or its generated
counterpart.

Route the unchanged diff and the same fresh evidence to an independent Reviewer.
The review must check the exact Feature 017 supersession, owner-first gates,
guardrail matrix including all-irrelevant rejection, non-user attribution,
ordinary-definition behavior, reconciled memory authority, Work boundary,
transient reporting, retrospective rule, source/generated parity, direct docs,
artifact ownership, and every prohibited surface. Any rejection returns to the
owning Skill Smith, Agent Smith, coordinator, Tester, or Coder task and requires
fresh verification before re-review. Reviewer remains read-only and does not
select its successor.

## Phases

- **Phase 1 - Skill authority (T001)**: Skill Smith amends the two existing
  `SKILL.md` owners.
- **Phase 2 - Agent authority (T002)**: Agent Smith aligns the coordinator and
  Spec Lead `.agent.md` sources without duplicating the skill matrix.
- **Phase 3 - Memory authority (T003)**: the coordinator reconciles only the
  guardrail authority preamble through `dude-memory-ledger`.
- **Phase 4 - Focused contracts (T004)**: Tester replaces the exact superseded
  Feature 017 assertions and pins the complete guardrail and memory matrix.
- **Phase 5 - Guidance and integration (T005)**: Coder aligns direct docs and
  projects authoritative source with an idempotent development build.
- **Phase 6 - Verification and acceptance (T006, T007)**: Tester runs the
  complete gate, then Reviewer gives an independent verdict on the unchanged
  revision and evidence.

## Requirements Traceability

| Specification coverage | Plan ownership | Tasks |
|---|---|---|
| FR-001 through FR-008 / SC-001 through SC-003 | Common owner-first Ship rule and definition clarification handling (Chosen Design 1, 2, 3) | T001@736b696c, T002@6167656e, T004@74657374, T006@76657269, T007@72657677 |
| FR-009 through FR-013 / SC-004 | Complete guardrail matrix, non-user attribution, ordinary-command preservation, and authority-preamble reconciliation (Chosen Design 2, 3, 4) | T001@736b696c, T002@6167656e, T003@6d656d6f, T004@74657374, T005@696e7467, T006@76657269, T007@72657677 |
| FR-014 through FR-016 / SC-001, SC-005 | Exact Feature 017 supersession slices, preserved owner authority, and unchanged Work handoff (Chosen Design 1, 3, 5) | T001@736b696c, T002@6167656e, T004@74657374, T006@76657269, T007@72657677 |
| FR-017 through FR-019 / SC-006, SC-007 | Existing coordinator response, Work-audit separation, and fixed-basis retrospective (Chosen Design 1, 3) | T001@736b696c, T002@6167656e, T004@74657374, T005@696e7467, T006@76657269, T007@72657677 |
| FR-020 / SC-008 | Existing-suite inventory, changed-path inspection, generated parity, and release inspection (Chosen Design 5, 7) | T004@74657374, T005@696e7467, T006@76657269, T007@72657677 |
| All FR / all SC | Direct guidance, full verification, and independent acceptance | T005@696e7467, T006@76657269, T007@72657677 |

## Supporting Artifacts

Only `spec.md`, `plan.md`, and `tasks.md` apply. The feature changes bounded
prompt authority and direct guidance; no research, data model, API contract,
schema, quickstart, or quality checklist would add implementation value.

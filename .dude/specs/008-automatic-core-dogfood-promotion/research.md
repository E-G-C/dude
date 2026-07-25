# Research: Automatic Core Dogfood Promotion

## Decision Context

The refreshed intent establishes a recurring consumer and exact trigger for `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`: a canonical core terminal task that is ready after all source-contributing dependencies and pre-promotion acceptance prerequisites clear. Specification completion is explicitly not a trigger.

The rejected revision exposed a temporal constraint on that split. A skill loaded only at terminal readiness cannot establish evidence required before the first source mutation. Therefore the project skill cannot be reduced to trigger text alone: it must retain a concise, complete, executable pre-terminal baseline contract. The local skill begins at terminal readiness and consumes that already-established baseline.

Plan Sections 1 and 7 define the project-side contract; Plan Sections 5, 6, and 8 define the local-skill runbook. The plan remains the sole detailed design source until T004 implements the split.

## Current Local Findings

- Authoritative main-core source lives under `src/**`; committed dogfood core is base-owned output under `.github/**`.
- `.github/skills/project/SKILL.md` currently contains the full `## Core Dogfood Close` procedure implemented by completed T001.
- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` does not currently exist.
- Existing read-only authorities already resolve an exact defined owner, classify base-owned generated core, enumerate projectable source, and prove checked-in source/generated parity. The design can reuse them without a helper, state file, or runtime.
- T001's completed project convention and CI implementation remain valid historical work. T004 redistributes procedure ownership rather than reopening T001.
- T002 remains in progress with byte-identical task meaning. Feature 003 has resolved its former external dependency, so only coordinator-owned stale blocker removal remains.
- T003 remains the same open explicit no-source terminal acceptance, revised to exercise the timing-safe ownership split.
- Static source checks cannot prove future model routing, definition, review, or close behavior. Fresh T003 authority exercises remain necessary.
- This package's planned implementation paths contain no `src/**` or base-owned generated-core path.
- The current package has no generated board, `## Discovered During Execution`, or `## Lightweight Execution History` section.

## Baseline Timing Resolution

The always-available project guidance owns exactly the work that must happen before source mutation: exact owner and terminal resolution, immutable base identities, clean source and base-owned generated boundaries, current parity, coordinator-owned baseline append timing, immediate pre-mutation recheck, serialization, concurrency refusal, and user-opt-in worktree fallback.

The terminal-loaded local skill owns what follows readiness: baseline validation and consumption, reproducible evidence materialization, conditional projection, protected-boundary checks, the final verification runbook, independent final review, acceptance evidence, and latest-match close. It must refuse missing or stale baseline evidence and cannot invent, repair, replace, or retroactively establish it.

Baseline cleanliness requires independent index-to-base and worktree-to-index predicates in addition to untracked and ignored checks. A net base-to-worktree comparison is insufficient because offsetting repository states can cancel and hide a dirty index.

This is the smallest timing-safe split. It keeps project guidance concise by moving the much larger post-readiness procedure while leaving enough executable detail at the only point where baseline establishment can still occur.

## Accepted Review Corrections Preserved

- Static checks prove written contracts and deterministic predicates only. Fresh definition, routing, review, and close exercises remain current-session evidence and are not persisted as a fixture or report.
- The existing owner log remains the only durable evidence carrier. Evidence stays bounded and append-only, while detailed current-run and review inputs remain transient.
- Core work remains one clean serialized interval. Dirty or ambiguous boundaries and suspected concurrency block; actor identity is not inferred; worktree isolation remains explicit-user-opt-in only.
- CI remains a bounded verification-only backstop with read-only authority, covered owned-root drift detection, no repair, and no remote or release mutation.
- The existing materializer remains authoritative. Production changes remain conditional on a focused test demonstrating a defect.

## Decisions

| Area | Chosen decision | Rationale | Rejected alternatives |
|---|---|---|---|
| Procedure ownership | Complete pre-terminal baseline contract and route in `project`; detailed post-readiness procedure in `dude-local-core-dogfood-promotion`. | Baseline establishment must be available before source mutation, while terminal work has a named recurring consumer. | Keep the large procedure only in `project`; move the baseline into a terminal-loaded skill; duplicate the full runbook; ship a core skill. |
| Discovery trigger | Load only when the canonical terminal is ready after dependencies and pre-promotion acceptance clear. | Matches explicit user intent and prevents definition completion from causing side effects. | Load on spec completion, definition readiness, or any source edit. |
| Trigger enforcement | Model-facing route plus independent review and fresh exercises. | Fits existing authority without creating runtime machinery or overstating static tests. | Filesystem watcher, task compiler, close runtime, or behavioral claims from text tests. |
| Pre-terminal baseline | Executable project guidance establishes it; the terminal skill only validates and consumes it. | Preserves the baseline-before-mutation contract despite terminal-only loading. | Vague project mention; load the local skill early; permit retroactive baseline evidence. |
| Source declaration | One open non-`[P]` `[Shared]` terminal header with sorted exact backticked paths. | Keeps declaration visible and lane-portable. | Directory/glob declaration, hidden metadata, second board. |
| Dependency rule | Terminal depends on every task that can contribute source. | Prevents promotion before all source contributors settle. | Best-effort or inferred contributors at close. |
| No-source behavior | Derive no normal terminal; keep this package's explicit empty bootstrap exception. | Avoids unnecessary close work while allowing one-time convention acceptance. | Terminal task on every feature. |
| Tracked authority | Corresponding Beads issue text after import. | Preserves the one-live-board rule. | Read declaration from the `tasks.md` mirror or Beads notes. |
| Evidence carrier | Two bounded lines in the existing owner Coordinator Log. | Existing common lane-independent audit context, no new ledger. | Current-run persistence, lane history, Beads notes, new state file. |
| Evidence design | Reproducible identities and bounded owner-log records defined only in the plan/local skill. | Binds one accepted revision without turning research or project routing into duplicate runbooks. | Informal evidence, full-byte log persistence, or copied schemas across artifacts. |
| Concurrency | Clean preflight and serialized core interval; suspicion blocks. | Full materialization cannot safely isolate ambiguous source. | Treat unrelated dirty source as opaque, partially project, or infer actors. |
| CI boundary | Retain accepted T001 Git-visible and named-root ignored checks. | The refresh does not contradict the current verification-only design. | CI repair, remote mutation, or broader release authority. |
| Materializer | Complete T002 tests first; production change only for a demonstrated defect. | Existing materializer remains the chosen authority. | Wrapper, replacement materializer, or speculative rewrite. |
| Bootstrap | Empty declaration, no repository build mutation, full read-only parity and live route/authority acceptance. | Exercises the new ownership split without manufacturing source work. | Touch source solely to force promotion. |

## Rejected Alternatives

- **Trigger-only project route:** rejected because it leaves no executable baseline authority before the first source mutation.
- **Early local-skill loading:** rejected because the user-authorized trigger is terminal readiness, never specification completion or source-task start.
- **Retroactive baseline repair:** rejected because evidence created after mutation cannot prove a clean pre-mutation boundary.
- **Full duplication in both skills:** rejected because it creates conflicting procedure authorities and permanent context cost.
- **New helper, framework, ledger, runtime, or persistent exercise report:** rejected because existing authorities and transient evidence satisfy the failure modes without new product surface.

## Bootstrap Conclusion

The re-defined package:

- keeps completed T001 one-to-one as valid historical implementation;
- keeps in-progress T002 one-to-one and proposes only coordinator removal of stale blocker metadata;
- changes open T003 in place to validate the timing-safe route and procedure ownership;
- adds one open state-free T004 for tests-first extraction;
- drops and archives nothing;
- has no planned source or base-owned generated-core write;
- retains the explicit no-source terminal exception;
- does not invoke repository `build-dev` as a feature mutation;
- introduces no helper, compiler, runtime, command, state, ledger, ObjectiveRegistry, or report.

No unresolved research decision remains.
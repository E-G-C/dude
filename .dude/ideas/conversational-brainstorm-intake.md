---
title: Conversational Brainstorm Intake Recognition
slug: conversational-brainstorm-intake
status: defined
spec_path: .dude/specs/033-conversational-brainstorm-intake/spec.md
---

# Idea: Conversational Brainstorm Intake Recognition

## Idea

In this conversation I asked for advice about making the `design` pack generic. We refined it, and I accepted concrete direction — theme independence, decoupling Strata, and expecting more independent themes in the future. By that point we were plainly brainstorming a feature, but Dude just kept giving advice. It never noticed the shift or offered to capture it as an idea; it only recognized what had happened after I pointed out the miss.

I want Dude to notice when an ordinary conversation has turned into a feature brainstorm and guide me into the real workflow, instead of silently continuing as advice.

What I'm after:

- Tell direct advice or answering apart from sustained feature exploration. Not every casual thought, question, or recommendation is a brainstorm — don't label it as one.
- Recognize the transition once the conversation has accumulated an actionable proposed outcome plus scope, constraints, tradeoffs, or design direction that I've accepted or we've materially explored.
- Treat plain natural language like "we are brainstorming" or "this should be an idea" as clear intent. Don't make me type `@dude brainstorm` when what I mean is unambiguous.
- At the transition, say it plainly: `This has become a feature brainstorm.`
- Propose a concise slug, and say whether what we discussed is one bounded outcome or several that should become separate ledgers.
- Guide me through the existing lifecycle — don't silently keep giving advice, silently write state, define a package, or start implementing.
- When the transition was only inferred, ask me to confirm capture first. When I explicitly ask to capture or brainstorm in plain language, just route through the normal brainstorm workflow without demanding command syntax.
- After I confirm, capture what we actually agreed — the real accepted intent, open questions, and assumptions — into `.dude/ideas/<slug>.md` through the existing Spec Lead authority and `dude-feature-definition`. Don't invent some new ledger, state file, workflow, or write path.
- Capture still writes only the flat idea ledger. Definition stays a separate, explicit step. No automatic spec, package, tasks, or implementation.
- If there are several bounded outcomes, ask one split question or propose separate ledgers before writing, the same way intake already handles splits.
- Keep my uncertainty and half-formed thoughts intact instead of hardening advice into requirements too early.

This exact conversation is the motivating example. "Advice, please" about design-pack genericity was a fair question to answer directly. But once I accepted generic design and added full Strata decoupling and future themes, it had become feature brainstorming, and Dude should have surfaced the checkpoint then. Instead it only later recognized two separate outcomes — `theme-agnostic-design-workflow` and `conversational-brainstorm-intake` — after I flagged the miss, and I confirmed both should be captured separately.

I want this same ledger to cover continuous work-intake reassessment, not only advice becoming a brainstorm. Dude should re-run work-intake classification whenever a conversation or task changes character. These are two transition cases of that one continuous-intake behavior, not separate outcomes:

1. **Advice or exploration -> feature brainstorm.** Trigger when I have accepted a direction and the discussion describes a nameable project outcome with meaningful scope, constraints, or tradeoffs. State exactly: `This has become a feature brainstorm.` Propose a slug and whether the outcomes should split. Ask before capture when the transition is inferred; an explicit natural-language capture request needs no command syntax.
2. **Bounded direct task -> durable feature work.** Permit direct work while it remains one clear outcome with no unresolved behavior, new architecture, public contract, persistent state, or additional independent outcome. Before the next repository write, reclassify when those conditions stop being true or the original focused verification no longer proves completion. State why the task crossed the boundary. Offer to constrain it back to the original fix, capture the evolving intent as a brainstorm, or capture settled intent and proceed through explicit definition.

Once scope crosses the boundary, the checkpoint is mandatory. Continuing directly is allowed only if the expanded scope is dropped. Preserve valid work already completed; do not impose retroactive rollback or bureaucracy. Use no turn, file, token, or diff-size thresholds. A large mechanical change alone is not a feature.

Reuse the existing brainstorm, idea, define, routing, and Work behavior. Add no parser, counter, state store, registry, daemon, or alternate workflow. Keep GitHub issue intake separate.

## Open Questions

No open question blocks a later `define`. I accepted the transition-recognition model and the separate-ledger approach for distinct outcomes, so the shaping decisions are settled:

1. RESOLVED — Should Dude require the literal `@dude brainstorm` command before it can capture? No. Unambiguous natural-language intent ("we are brainstorming," "this should be an idea") routes through the existing brainstorm workflow without demanding command syntax.
2. RESOLVED — When the transition is only inferred, should Dude capture silently? No. It states `This has become a feature brainstorm.`, proposes a slug, identifies one or several outcomes, and asks for capture confirmation before any write.
3. DEFERRED (define/plan-time, not a blocker) — Where the transition rule and its response convention are documented — the coordinator agent instruction, the `dude-work-intake` skill, the universal instruction, or a combination — is an implementation-placement choice for the spec/plan. It does not change the accepted behavior and does not block capture or a later `define`. The same deferral covers placement of continuous reassessment and the direct-task boundary.
4. RESOLVED — Are advice-to-brainstorm and direct-task-to-durable-feature separate outcomes? No. They are two transition cases of one continuous work-intake reassessment behavior in this ledger.
5. RESOLVED — May direct work continue after it crosses the durable-feature boundary? Only if the expanded scope is dropped and the work is constrained back to the original bounded task.
6. RESOLVED — Should size thresholds or a large mechanical change trigger reclassification? No. The boundary is qualitative, and a large mechanical change alone is not a feature.

## Assumptions

- This strengthens the existing intake guidance and response behavior; it is not a new command, parser, workflow engine, state store, persistent registry, daemon, or automatic background capture (YAGNI).
- The transition test is qualitative and lives in intake judgment: an actionable proposed outcome plus accepted or materially explored scope, constraints, tradeoffs, or design direction. It deliberately avoids a numeric threshold, score, or turn counter.
- Recognition raises a checkpoint; it never captures on its own. An inferred transition asks for confirmation, and capture happens only after I agree or explicitly ask in natural language.
- Capture continues to flow through the existing Spec Lead delegation and `dude-feature-definition`, writing only the flat `.dude/ideas/<slug>.md`. Definition stays a separate explicit action; no spec, package, tasks, or implementation follow automatically.
- Several bounded outcomes reuse the existing intake split contract — one split question or a proposal of separate ledgers before any write — rather than a new mechanism.
- Where the rule and response convention live is a define/plan-time placement decision; it does not change behavior or block capture.
- My uncertainty and incomplete thoughts are preserved as captured; advice is not hardened into firm requirements prematurely.
- Work-intake classification is reassessed whenever a conversation or task changes character; its initial route is not permanent.
- Advice or exploration becomes a feature-brainstorm checkpoint when I have accepted a direction and the discussion describes a nameable project outcome with meaningful scope, constraints, or tradeoffs.
- A direct task remains direct only while it has one clear outcome and no unresolved behavior, new architecture, public contract, persistent state, or additional independent outcome, and its original focused verification still proves completion.
- Once that direct-task boundary is crossed, Dude reclassifies before the next repository write, explains why, and offers the three accepted paths. Continuing directly requires dropping the expanded scope.
- Valid completed work remains valid. Reclassification does not require retroactive rollback or added bureaucracy.
- No turn, file, token, diff-size, or other numeric threshold governs the checkpoint, and a large mechanical change alone is not a feature.
- The behavior reuses existing brainstorm, idea, define, routing, and Work behavior, adds no parser, counter, state store, registry, daemon, or alternate workflow, and remains separate from GitHub issue intake.

<!-- dude:managed:start -->
## Normalized Intent

- Add continuous work-intake reassessment whenever a conversation or task changes character. Advice-to-brainstorm and bounded-task-to-durable-feature are two transition cases of this one behavior, not separate outcomes.
- Keep direct facts, casual thoughts, questions, recommendations, and bounded tasks direct while their character remains unchanged.
- For advice or exploration, trigger the feature-brainstorm checkpoint when the user has accepted a direction and the discussion describes a nameable project outcome with meaningful scope, constraints, or tradeoffs.
- At that transition, state exactly `This has become a feature brainstorm.`, propose a concise slug, and say whether the outcomes should split.
- Ask before capture when the transition was inferred. Treat explicit natural-language capture as sufficient intent and do not require command syntax.
- After confirmation or an explicit capture request, reuse the existing brainstorm route, Spec Lead delegation, `dude-feature-definition`, flat idea ledger, and split handling. Definition remains a separate explicit action.
- Permit a bounded direct task while it remains one clear outcome with no unresolved behavior, new architecture, public contract, persistent state, or additional independent outcome, and while its original focused verification still proves completion.
- Before the next repository write, reclassify a direct task if any of those conditions stop being true or its original focused verification no longer proves completion.
- At the direct-task boundary, state why the task crossed it and offer three choices: constrain the work back to the original fix, capture evolving intent as a brainstorm, or capture settled intent and proceed through explicit definition.
- Make the checkpoint mandatory after the boundary is crossed. Direct continuation is permitted only when the expanded scope is dropped.
- Preserve valid work already completed. Do not require retroactive rollback or bureaucracy.
- Use qualitative judgment, not turn, file, token, diff-size, or other numeric thresholds. A large mechanical change alone is not a feature.
- Reuse existing brainstorm, idea, define, routing, and Work behavior; keep GitHub issue intake separate.
- Preserve user uncertainty and incomplete thought. Add no command, parser, counter, workflow engine, state store, persistent registry, daemon, alternate workflow, or automatic background capture.

## Current Evidence

Observed in current core source; grounding for definition, not user intent:

- `src/skills/dude-work-intake/SKILL.md` `## Triage` already classifies a request as a direct answer, one specialist task, independent subtasks, raw feature input for `brainstorm`, or an explicit `define`, and `## Brainstorm` already says separate bounded outcomes should split. It does not require classification to run again when a conversation or task changes character or define either transition boundary.
- `src/skills/dude-generic-routing/SKILL.md` routes implementation and mixed requests by their requested outcome and scope, but it does not say when an already-routed bounded task has become durable feature work or require reassessment before another repository write.
- `src/agents/dude.agent.md` already routes brainstorm, definition, direct specialist work, and Work and defines response conventions. It has no continuous-intake checkpoint, exact feature-brainstorm announcement, or direct-task boundary explanation and choice set.
- `src/agents/dude.agent.md` `## Lifecycle` and `src/instructions/dude.instructions.md` already make `brainstorm` the only route for capturing feature intent into `.dude/ideas/<slug>.md` and keep `define` separate; the missing piece is recognizing the moment to offer that route, not the route itself.
- The existing brainstorm/define split, Spec Lead delegation, flat-ledger-only capture, generic routing, and Work behavior already supply the routes this idea should reuse; no new authority or workflow state is required.

## Constraints

- This turn is brainstorm intake only: refresh exactly `.dude/ideas/conversational-brainstorm-intake.md` and nothing under `.dude/specs/`; run no implementation or tests, and touch no other idea, memory, instructions, skills, agents, docs, backlog projection, execution state, source, generated code, or GitHub state. Definition requires an explicit `define conversational-brainstorm-intake`.
- Keep both transitions in one ledger as one continuous work-intake reassessment behavior.
- Do not claim the brainstorm, definition, routing, or Work workflows are absent. Reuse their existing routes, authority, split handling, and flat-ledger capture.
- For inferred advice-to-brainstorm transitions, ask before capture; explicit natural-language capture needs no command syntax.
- Permit bounded direct work only under the accepted one-outcome, no-new-boundary conditions and while its original focused verification proves completion.
- Reclassify before the next repository write when direct work crosses the boundary, explain why, and offer the accepted constrain, brainstorm, or brainstorm-then-explicit-definition choices.
- The checkpoint is mandatory after scope crosses the boundary. Direct continuation requires dropping the expanded scope.
- Preserve valid completed work without retroactive rollback or bureaucracy.
- Use no turn, file, token, diff-size, or other numeric threshold; a large mechanical change alone is not a feature.
- Apply YAGNI: add no new command, parser, counter, workflow engine, state store, persistent registry, daemon, alternate workflow, or automatic background capture.
- Keep GitHub issue intake separate.
- Keep the eventual spec intent technology-agnostic; where the rule and response convention are documented is a define/plan-time placement decision.
- This capture creates no definition package.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger (one continuous work-intake reassessment behavior with two transition cases)
- [x] Open questions are resolved or consciously assumed (implementation placement deferred to define/plan)
- [x] Definition requires an explicit `define conversational-brainstorm-intake`

## Coordinator Log

- 2026-08-13 UTC - brainstorm captured; definition deferred to explicit `define`
- 2026-08-14 UTC - brainstorm refreshed for continuous work-intake reassessment; definition deferred to explicit `define`
- 2026-08-14 UTC - defined as .dude/specs/033-conversational-brainstorm-intake/spec.md; lightweight execution pending
- 2026-08-14 UTC - T001@696e746b closed: continuous reassessment added as one detailed `dude-work-intake` `## Continuous Reassessment` owner plus a thin coordinator `## Continuous Intake` section and shared rule 15, pinned by the section-bound mutation-resistant contract test and projected with `build-dev`; independent review REJECTed two blocking findings (evolving/settled intent bypassing idea capture; unresolvable `FR-011` reference in shipped instruction prose), both revised by different owners and re-reviewed APPROVE; fresh evidence 2,319 tests with 2,315 pass / 0 fail / 4 pre-existing skips, contract suite 99/99, lint 0 warnings / 0 failures, build-dev idempotent, `git diff --check` clean
- 2026-08-14 UTC - T002@67617465 closed: integrated acceptance over one unchanged revision — full suite 2,319 tests with 2,315 pass / 0 fail / 4 pre-existing skips, contract suite 99/99, lint 0 warnings / 0 failures, `compose verify` exit 0 across 16 packs with warning counts byte-identical to baseline, release build 64 files whose single `FEATURE_IDEAS_ROOT_MISSING` warning is identical at baseline and structural to release bundles, build-dev idempotent with only the three intended generated files, `git diff --check` clean, and an identical release file set with all three rules shipped and zero `FR-011` references; independent acceptance review APPROVE with no findings across every specification matrix; feature complete
<!-- dude:managed:end -->

---
title: Conversational Brainstorm Intake Recognition
slug: conversational-brainstorm-intake
status: draft
spec_path:
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

## Open Questions

No open question blocks a later `define`. I accepted the transition-recognition model and the separate-ledger approach for distinct outcomes, so the shaping decisions are settled:

1. RESOLVED — Should Dude require the literal `@dude brainstorm` command before it can capture? No. Unambiguous natural-language intent ("we are brainstorming," "this should be an idea") routes through the existing brainstorm workflow without demanding command syntax.
2. RESOLVED — When the transition is only inferred, should Dude capture silently? No. It states `This has become a feature brainstorm.`, proposes a slug, identifies one or several outcomes, and asks for capture confirmation before any write.
3. DEFERRED (define/plan-time, not a blocker) — Where the transition rule and its response convention are documented — the coordinator agent instruction, the `dude-work-intake` skill, the universal instruction, or a combination — is an implementation-placement choice for the spec/plan. It does not change the accepted behavior and does not block capture or a later `define`.

## Assumptions

- This strengthens the existing intake guidance and response behavior; it is not a new command, parser, workflow engine, state store, persistent registry, daemon, or automatic background capture (YAGNI).
- The transition test is qualitative and lives in intake judgment: an actionable proposed outcome plus accepted or materially explored scope, constraints, tradeoffs, or design direction. It deliberately avoids a numeric threshold, score, or turn counter.
- Recognition raises a checkpoint; it never captures on its own. An inferred transition asks for confirmation, and capture happens only after I agree or explicitly ask in natural language.
- Capture continues to flow through the existing Spec Lead delegation and `dude-feature-definition`, writing only the flat `.dude/ideas/<slug>.md`. Definition stays a separate explicit action; no spec, package, tasks, or implementation follow automatically.
- Several bounded outcomes reuse the existing intake split contract — one split question or a proposal of separate ledgers before any write — rather than a new mechanism.
- Where the rule and response convention live is a define/plan-time placement decision; it does not change behavior or block capture.
- My uncertainty and incomplete thoughts are preserved as captured; advice is not hardened into firm requirements prematurely.

<!-- dude:managed:start -->
## Normalized Intent

- Add a concrete conversational-transition rule and response convention to the existing intake so Dude recognizes when an advice or answering exchange has become a feature brainstorm, instead of silently continuing as advice.
- Distinguish direct advice or answering from sustained feature exploration; do not classify every casual thought, question, or recommendation as a brainstorm.
- Trigger recognition only once the conversation has accumulated an actionable proposed outcome plus accepted or materially explored scope, constraints, tradeoffs, or design direction.
- Treat unambiguous natural-language intent (for example "we are brainstorming" or "this should be an idea") as a brainstorm request; do not require the literal `@dude brainstorm` command.
- At the recognized transition, state plainly `This has become a feature brainstorm.`, propose a concise slug, and identify whether the discussion is one bounded outcome or several that should become separate ledgers.
- Guide the user through the existing lifecycle at that moment; never silently continue as advice, silently write state, define a package, or begin implementation.
- Ask for capture confirmation when the transition was inferred; when the user explicitly asks to capture or brainstorm in natural language, route directly through the existing brainstorm workflow without demanding command syntax.
- After confirmation, capture the conversation's actual accepted intent, open questions, and assumptions into `.dude/ideas/<slug>.md` through the existing Spec Lead delegation and `dude-feature-definition`; invent no alternate ledger, state file, workflow, or write authority.
- Keep brainstorm capture limited to the flat idea ledger, with definition a separate explicit action and no automatic spec, package, tasks, or implementation.
- For several bounded outcomes, reuse the existing intake split contract — ask one split question or propose separate ledgers before writing.
- Preserve the user's uncertainty and incomplete thought rather than hardening advice into requirements.
- Deliver this as strengthened intake guidance and response behavior only (YAGNI): no new command, parser, workflow engine, state, persistent registry, daemon, or automatic background capture, and no definition package created by this capture.

## Current Evidence

Observed in current core source; grounding for definition, not user intent:

- `src/skills/dude-work-intake/SKILL.md` `## Triage` already classifies a request as a direct answer, one specialist task, independent subtasks, raw feature input for `brainstorm`, or an explicit `define`, and `## Brainstorm` already says separate bounded outcomes should split — but neither gives a concrete rule for a conversation that starts as advice and becomes a feature, nor a response convention for surfacing that transition.
- `src/agents/dude.agent.md` `## Response` defines coordinator-verb and execution-state reply conventions and the guardrail-pause line, but carries no plain transition announcement for an advice exchange that has turned into a brainstorm.
- `src/agents/dude.agent.md` `## Lifecycle` and `src/instructions/dude.instructions.md` already make `brainstorm` the only route for capturing feature intent into `.dude/ideas/<slug>.md` and keep `define` separate; the missing piece is recognizing the moment to offer that route, not the route itself.
- The existing brainstorm/define split, Spec Lead delegation, and flat-ledger-only capture already supply the write authority and lifecycle this idea should reuse; no new authority is required.

## Constraints

- This turn is brainstorm intake only: create exactly `.dude/ideas/conversational-brainstorm-intake.md` and nothing under `.dude/specs/`; run no implementation or tests, and touch no other idea, memory, instructions, skills, agents, docs, backlog projection, or execution state. Definition requires an explicit `define conversational-brainstorm-intake`.
- Do not claim the brainstorm workflow is absent; the gap is a missing conversational-transition rule and response convention layered on the existing intake, not a missing lifecycle.
- Reuse the existing Spec Lead delegation, `dude-feature-definition`, and flat-ledger capture; invent no alternate ledger, state file, workflow, parser, or write authority.
- Apply YAGNI: add no new command, parser, workflow engine, persistent state, registry, daemon, or automatic background capture; strengthen the existing intake guidance and response behavior instead.
- Recognition surfaces a checkpoint and, for an inferred transition, asks for confirmation; it never captures silently, defines a package, or begins implementation.
- Keep the eventual spec intent technology-agnostic; where the rule and response convention are documented is a define/plan-time placement decision.
- This capture creates no definition package.

## Definition Checklist

- [x] Outcome is clear enough for brainstorm
- [x] Scope is coherent as one idea ledger (one conversational-intake recognition behavior)
- [x] Open questions are resolved or consciously assumed (implementation placement deferred to define/plan)
- [x] Definition requires an explicit `define conversational-brainstorm-intake`

## Coordinator Log

- 2026-08-13 UTC - brainstorm captured; definition deferred to explicit `define`
<!-- dude:managed:end -->

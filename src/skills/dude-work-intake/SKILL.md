---
name: "dude-work-intake"
description: "Use when triaging a new request, deciding whether to answer directly or route it, checking whether clarification is needed, drafting early feature ideas into brainstorm files, or deciding whether a brainstorm file is ready to define."
---

## Purpose

Establish a lightweight intake flow for Dude Coder work, including the file-based brainstorm stage.

## First-Session Signals

Treat the request as first-session or fresh-repo onboarding when one or more of these are true:

- the repo appears to have no active `brainstorm/` or `specs/` workflow artifacts yet
- the user asks how to start, asks for the minimum-question path, or asks for a quick start
- the user describes a fresh repo, first feature, or newly copied bundle

In that path, keep intake to three questions:

1. Is this one feature or several separate outcomes?
2. Do you want to implement now or just define?
3. What hard constraints materially change scope, compliance, approvals, or routing?

On the first substantive message in the session, if `brainstorm/` and `specs/` are absent or contain no active workflow artifacts, ask these three questions proactively instead of waiting for the user to request the minimum-question path.

If the first substantive request already clearly answers all three onboarding questions, treat onboarding as satisfied and move directly to `draft` or the next applicable step instead of re-asking the same questions.

If the user wants implementation now and does not explicitly ask for Beads, default to Lightweight Execution.

## Intake Questions

For each request, decide:

1. Is this a direct answer or specialist work?
2. Is this raw product input that should become or update `brainstorm/<slug>.md`?
3. Is the request single-domain or multi-domain?
4. Is there enough information to act?
5. Is the brainstorm file ready to define into `specs/<feature>/`?
6. Does the project already define a stronger process to follow?
7. Does bundle memory contain relevant decisions, guardrails, or context?

## Memory Check

Before routing any work, scan `.github/dudestuff/` for entries that apply to the
incoming request. Include relevant memories in the delegation context so
specialists don't contradict past decisions or repeat solved problems.

## Brainstorm Intake

- Keep one working ledger per feature under `brainstorm/<slug>.md`.
- Preserve the raw user draft inside `## User Draft`.
- Place active `## Open Questions` immediately after `## User Draft`, with each question followed by a visible `**Your answer:** _Type your answer here._` slot.
- Put Dude normalization, assumptions, open questions, and the definition checklist in the same file.
- If clarification is needed, keep it in the brainstorm file instead of scattering it across chat.
- The user may answer by editing the same file and asking Dude to draft it again.
- If the request clearly spans multiple bounded outcomes, recommend splitting it into separate brainstorm files before definition instead of letting one file become a roadmap.

## Definition Gate

A brainstorm file is ready to define when:

- the core user outcome is clear
- open questions are resolved or captured as conscious assumptions
- the feature is scoped tightly enough to become one `specs/<feature>/` package
- the user has asked Dude to define it, or the workflow explicitly calls for definition

## Default Handling

- Direct factual requests -> answer directly.
- Raw product or PRD input -> route to one brainstorm file and keep the conversation anchored there.
- Raw product or PRD input that spans several bounded outcomes -> recommend a split or ask one narrow question to decide whether to split before drafting.
- Single-domain work -> route to one specialist.
- Multi-domain work -> decompose before routing.
- Drafts ready for definition -> route to `@dude-spec-lead` for the standard definition package.
- Missing critical information -> ask one concise clarification question or add one focused question to the brainstorm file.

## Avoid

- asking broad exploratory questions when a narrow one will unblock the task
- inventing process overhead for simple requests
- splitting one feature across several intake files without a clear reason
- forcing decomposition when one specialist can handle the work
- ignoring existing team decisions or guardrails

---
name: "dude-generic-routing"
description: "Use when matching a user request, subtask, or task to the right specialist agent in the active roster."
---

# Generic Routing

## Purpose

Route requests to the smallest appropriate specialist set, regardless of domain.

## Routing Algorithm

1. **Discover the roster**: list all `.agent.md` files under `.github/agents/` (excluding `dude.agent.md`).
2. **Read each agent's scope**: compare the agent's `description` and `## Scope` section against the task.
3. **Match by keyword overlap**: the agent whose scope keywords best match the task gets the work.
4. **Prefer narrow over broad**: if two agents could handle it, pick the one with the more specific scope.
5. **No match**: if no specialist fits, ask the user whether to handle it directly or hire a new agent.

## Tie Breakers

- Prefer one specialist if one can credibly own the task.
- Split only when the domains are meaningfully different.
- Do not route review or acceptance to the implementation author.
- If a newly hired specialist matches the task more closely than an older one, prefer the new specialist.
- When uncertain, check bundle memory for past routing decisions.

## Authority Ownership

Maintain explicit owners for:

- **Planning authority** — assign to the specialist whose scope best covers planning, structure, and design tradeoffs.
- **Quality authority** — assign to the specialist whose scope best covers independent review and acceptance.

Mode-specific defaults:

- During feature definition under `specs/<feature>/`, default planning authority to `@dude-spec-lead`.
- During implementation, default planning authority to `@dude-lead` for implementation structure and execution tradeoffs.
- When a dedicated independent reviewer exists, default quality authority to that reviewer.

If the current owner is removed, replaced, or no longer the best fit, update the coordinator's routing guidance explicitly. If no clear owner exists, escalate to the user instead of inventing one.

## Conflict Resolution

When specialists disagree:

- the current planning authority has final say on structure and design questions
- the current quality authority has final say on acceptance and readiness
- if the disagreement spans both domains, escalate to the user

## Dynamic Roster Rule

The roster is whatever currently exists under `.github/agents/`. There are no permanent defaults. When agents are added or removed, the routing adapts automatically based on their scope descriptions.

## Task Matching

Use these heuristics when interpreting task text and labels during dispatch. The keyword catalog supplements the generic routing algorithm above.

### Route To Spec Lead

Keywords and signals:

- brief, draft, define
- define feature, write spec, specify
- feature brief, draft feature
- clarify requirements, resolve ambiguity
- create plan, implementation plan
- derive tasks, break down feature
- analyze consistency, spec quality
- `specs/<feature>/` artifacts

### Route To Lead

Keywords and signals:

- architecture, scaffolding, project setup
- design decision, trade-off
- module boundaries, configuration
- Phase 1 (Setup) or Phase 2 (Foundational) labels

### Route To Tester

Keywords and signals:

- test, regression, edge case
- validation, acceptance, coverage
- contract verification, QA, E2E

### Route To Reviewer

Keywords and signals:

- review, approve, reject
- readiness, final acceptance
- definition package readiness, import readiness
- spec compliance, quality gate

### Route To Bundle Import

Keywords and signals:

- import this agent, import this skill, fetch agent, fetch skill
- copy agent, copy skill, bring in agent, bring in skill
- install agent from `<url>`, install skill from `<url>`
- a single-file URL ending in `.agent.md` or `SKILL.md`

This is a coordinator-level skill route, not a specialist agent route. The coordinator runs the `dude-bundle-import` skill directly rather than dispatching to a roster member.

### Task Tie-Breaking Rules

- If the request is about defining, specifying, planning, or deriving tasks for a feature, prefer spec-lead.
- If the task is mostly implementation, prefer an implementation specialist over tester.
- If the task is explicitly about validation, prefer tester.
- If the task is about independent judgment after implementation, prefer reviewer.
- If the task mixes separable concerns, split it into independent tasks when the pieces can be executed independently.
- If the task is about project structure or tooling, prefer lead.

### Coordinator Summary Pattern

When routing, state:

- task ID (when present)
- short task name
- assigned specialist
- one-line reason for the assignment

---
name: receiving-code-review
description: "Use when receiving review feedback or rejection findings, especially before implementing suggested changes or disputing them."
---

# Receiving Code Review

> Companion skill: `reviewer-protocol` covers the reviewer-side rules for approval, rejection, and revision routing. Load it together with this skill when the rejection raises questions about who should perform the next revision cycle.

## Purpose

Handle review feedback with technical rigor instead of reflexive agreement.

## Workflow

1. Read the full feedback before reacting.
2. Clarify anything ambiguous before changing code.
3. Verify the feedback against the codebase, requirements, tests, and project guardrails.
4. Decide whether to accept, partially accept, or push back with technical reasoning.
5. Implement accepted changes one item at a time.
6. Re-run relevant verification before claiming the feedback is addressed.

## Rules

- Do not blindly implement unclear or speculative feedback.
- Do not respond with performative agreement; acknowledge technically or proceed directly to the fix.
- If the feedback conflicts with explicit user direction, architecture decisions, or project guardrails, escalate instead of improvising.
- When work is rejected, address the reviewer’s concrete findings directly rather than revisiting the entire task aimlessly.
- If feedback appears wrong, explain why with codebase-specific evidence.

## Useful Outputs

Return:

- items accepted
- items needing clarification
- items challenged with technical reasoning
- verification status after changes

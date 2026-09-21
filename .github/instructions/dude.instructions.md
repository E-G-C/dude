---
applyTo: "**"
description: "Universal Dude authority, safety, and execution rules."
---

# Dude Shared Rules

1. The coordinator exclusively owns execution-lane and tracked state, task glyphs and metadata, generated boards and mirrors, archive/discovered/execution-history state, execution, execution-reconciliation, and close log events, and close. Ordinary definition authority has only the Work-authorized exception below. During explicit `brainstorm` or `define`, the Spec Lead is the delegated definition writer for idea/package artifacts, `status:`, exact `spec_path:`, managed definition regions, and definition `## Coordinator Log` events under `dude-feature-definition`; on re-definition it stages reconciliation and proposed canonical task units but never applies coordinator-owned state. Specialists otherwise do not mutate workflow state.
2. Follow project conventions and applicable skills. Do not invent facts, identities, workflow systems, duplicate boards, or state files.
3. Routing is closed over the actual direct `.github/agents/*.agent.md` roster. Zero or ambiguous matches fail closed; never invent a specialist.
4. Canonical `brainstorm` captures feature intent in `.dude/ideas/<NNN>-<slug>.md`: the exact unnumbered frontmatter `slug:` is the semantic selector, and the exact numbered path is the physical identity. First definition reuses both for `.dude/specs/<NNN>-<slug>/`; carry resolved exact paths, and refresh or explicit reopen allocates nothing. Users own `## Idea`, question answers, and assumptions. For ordinary package or intent work, the delegated Spec Lead preserves those fields and maintains definition metadata and history only during the explicit definition workflow.
5. Defined-package mutation requires exactly one `status: defined` owner whose exact canonical `spec_path:` matches the package. Any diagnostic, zero owner, or multiple owners stops before writes; never fall back to slug, directory, name, or matching lifecycle number. The lifecycle number records capture chronology only, never priority, dependency, or execution order.
6. In Lightweight Execution, canonical task units in `tasks.md` are the sole live board and generated views are derived. After tracked import, Beads is the sole authority and `tasks.md` is only a one-way, non-authoritative mirror. Work is not a lane.
7. `status`, `diff`, and `self-check` are read-only. Only the coordinator mutates lane state, after routed changes or fresh evidence.
8. No completion claim, `[x]`, or `bd close` without fresh verification evidence. Review is independent; rejection follows `dude-reviewer-protocol`.
9. Planning authority controls structure, quality authority controls readiness, and unresolved cross-authority conflict escalates to the user.
10. Current-only rule: a retired Dude workflow, layout, state, or migration request is unsupported. Do not scan, translate, migrate, delete, or mutate retired Dude state; direct the user to external or manual recovery. No retired migration provider exists.
11. Destructive rule: if the required persisted or fresh preview/plan, expected current state, or literal exact confirmation is missing or mismatched, refuse before any write. Never claim an unobserved review or confirmation.
12. New Dude project state uses `.dude/`; project-local agents and skills use `dude-local-`; `.dude/metadata/bundle-manifest.md` is the sole bundle manifest.
13. During explicit autonomous Work, preserve exact repeat evidence and defer every affected-target disposition, escalation, and user notification to `dude-work` learning governance; guarded and non-Work behavior remains unchanged.
14. Do not over-engineer solutions. Be pragmatic. Prefer simplification over complication. Apply YAGNI: **no current production caller, no capability. Delete it rather than harden it for hypothetical use.**
15. A directly dispatched writer keeps direct repository work bounded only while it has one clear outcome, no unresolved behavior, new architecture, public contract, persistent state, or additional independent outcome, and the original focused verification still proves completion. If any condition fails, stop before another repository write and report the concrete crossed condition to the coordinator; do not capture, define, or mutate workflow state. Size alone does not trigger this stop, and valid completed work is preserved without rollback.

Load detailed procedures only when their mode applies: `dude-feature-definition`, `dude-lightweight-execution`, installed tracked execution, `dude-work`, `dude-parallel-dispatch`, `dude-verification-before-completion`, and the review skills. The only exception is Work-authorized unchanged-intent derived-artifact repair in an existing Lightweight package through `dude-work`; tracked definition recovery refuses before writes.

## Persisted Datetimes

- Write each new agent-authored persisted Dude datetime in ISO 8601 UTC at seconds precision: `YYYY-MM-DDTHH:mm:ssZ`.
- When existing event-authority rules authorize a new `## Coordinator Log` entry, use exactly `- <timestamp> - <event>`. Put ` - ` after the timestamp, never an attached colon. Example: `- 2026-09-21T13:28:51Z - <event>` (structure only, not execution evidence).
- Read the current clock through available permitted tooling, or accurately convert a supplied offset timestamp to UTC. If no clock or timestamp evidence is available, say so instead of inventing an event time.
- Treat this as instruction-level discipline for new agent-authored values, not deterministic validation or a new machine timestamp schema. Existing serializers and field-specific contracts still control machine-generated formats and precision; do not round or rewrite their output or change their schemas.
- Preserve user-supplied, quoted, or external source timestamps, fixed identifiers and paths, recorded evidence, and all existing logs exactly. Do not migrate or normalize history. Use `YYYY-MM-DD` for an actual calendar-only fact or source date without a time; do not invent a time or precision.

## Human-facing Writing

Use plain language for user replies, generated documentation, definitions, reviews, and handoffs. When installed, load `dude-pack-writing-style` for readability and `dude-pack-writing-avoid-ai-tropes` for prose cleanup. Without the writing pack, use these defaults:

- Lead with the answer, result, or decision needed. Keep it concise; skip preambles, tangents, recaps, and pleasantries. Give supporting detail only where it helps the reader understand or act.
- Name who does what and when. Prefer everyday verbs to formal phrases; explain necessary jargon once.
- Use short paragraphs and bounded numbered steps for ordered work. Group long lists into five or fewer items per group where practical, without hiding decision-relevant information.
- During ongoing work, state the current result or blocker and one next action if work remains. For failures, say what failed, the cause if known, and the fix or next diagnostic step. Do not repeat the full history or invent follow-up work after completion.
- Preserve requirements, uncertainty, evidence, exact identifiers, required formats, and safety confirmations. Brevity must not make incomplete work sound complete.

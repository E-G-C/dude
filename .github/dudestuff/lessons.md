# Dude Lessons

Solved challenges, learned patterns, and candidate future skills.

## Entries

- Require an explicit `specs/<feature>/` path when multiple feature directories exist; do not guess.
- Stop import on malformed or ambiguous `tasks.md` lines instead of inferring intent.
- Do not keep using `tasks.md` as the live board after import into Beads; if it is updated, it is only a one-way Beads-derived mirror.
- Keep optional operational tooling clearly marked as opt-in to avoid accidental workflow drift.
- Re-define reconciliation needs access to pre-change lightweight task history, such as a preserved snapshot or VCS diff; the rewritten package alone is not enough to explain surviving versus ambiguous checked work reliably.
- When `@dude flag` identifies standalone work with no active task to mark `[!]`, persist it in a durable artifact before calling it flagged: Beads issue, new brainstorm/spec package, or concise `.github/dudestuff/` context/lesson entry.

# Dude Lessons

Solved challenges, learned patterns, and candidate future skills.

## Entries

- Require an explicit `specs/<feature>/` path when multiple feature directories exist; do not guess.
- Stop import on malformed or ambiguous `tasks.md` lines instead of inferring intent.
- Do not keep using `tasks.md` as the live board after import into Beads; if it is updated, it is only a one-way Beads-derived mirror.
- Keep optional operational tooling clearly marked as opt-in to avoid accidental workflow drift.
- Re-define reconciliation needs access to pre-change lightweight task history, such as a preserved snapshot or VCS diff; the rewritten package alone is not enough to explain surviving versus ambiguous checked work reliably.
- When `@dude flag` identifies standalone work with no active task to mark `[!]`, persist it in a durable artifact before calling it flagged: Beads issue, new brief/spec package, or concise `.github/dudestuff/` context/lesson entry.
- Full test discovery: bare `node --test` under-discovers this repo's suite (it finds only top-level tests). Run the whole suite with `find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test`.
- Bundle-change validation gate before committing: full test suite green; `node .github/skills/dude-lint/lint.mjs .` 0 warnings / 0 failures; `node .github/skills/dude-compose/compose.mjs verify` exit 0; `build-release` then lint the `dist` output 0/0; after `build-dev`, `git status --porcelain -- .github` shows only the intended files; `git diff --check` clean.
- Never inspect a built release/output directory after running `compose add` against it — the install writes pack files and a `profile.md` into that dir and can yield false-positive "broken state" findings. Build to a pristine directory for release inspection.

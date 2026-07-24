---
name: "project"
description: "Project-specific domain knowledge, conventions, and patterns. Update this skill as the project evolves so Dude and specialists can use it as shared context."
---

# Project Knowledge

## Project Shape

- **Domain**: reusable Dude bundle for markdown-based multi-agent feature definition plus optional lightweight or Beads-tracked execution
- **Primary artifacts**: core source under `src/`, pack source under `library/packs/`, generated dogfood engine files under `.github/`, user docs, and project state under `.dude/`
- **Coordinator**: `@dude` owns routing, memory, skills, and team management
- **Current roster**: core is the coordinator, `@dude-spec-lead` (definition), and `@dude-reviewer` (readiness). Domain specialists come from installed packs — this repo uses the `authoring` pack (bundle-authoring smiths) and the `coding` pack (coder, tester, architect, code-reviewer).
- **Default first-run path**: ask whether the user wants to implement now or just define; if they want implementation and do not explicitly ask for Beads, default to Lightweight Execution, otherwise start with Definition Only

## Working Conventions

- The human decides desired outcome, hard constraints, and approvals; Dude owns normalization, routing, metadata bookkeeping, and handoff.
- If the user's first substantive request already answers the three onboarding questions, treat onboarding as satisfied and move directly to the next workflow step.
- `@dude brainstorm <idea>` is the sole intake command; it creates or refreshes the flat `.dude/ideas/<slug>.md` working ledger before definition.
- Refresh `.dude/specs/<feature>/` artifacts via `@dude define` instead of hand-maintaining generated state.
- `@dude status` is a read-only orientation command across definition, Lightweight Execution, and Tracked Execution; it must not import or mutate work.
- `status:`, `spec_path:`, and `## Coordinator Log` are Dude-maintained workflow metadata.
- `@dude track` means import or resume tracked execution in Beads; it does not compile the app.
- When Beads is unavailable or intentionally not used, `.dude/specs/<feature>/tasks.md` is the first-class markdown execution board.
- Supporting checklist files are advisory during Lightweight Execution; `tasks.md` remains the single live execution board before import, and any Dude-generated board region inside that file is derived guidance rather than a second board.
- In Lightweight Execution, canonical task headers may use `[ ]`, `[~]`, `[!]`, and `[x]`, with optional indented `deps:` and `blocked-by:` metadata lines.
- In Lightweight Execution, only the coordinator mutates task-state glyphs or task metadata after routed workflow changes and fresh verification evidence.
- Lightweight task lines use durable task IDs such as `T001@a1b2c3d4`.
- One bounded task may combine closely related code, tests, and docs when one fresh verification step proves the slice.
- Once imported, Beads is the only live execution board and source of truth. `tasks.md` may be kept updated only as a one-way, non-authoritative Beads mirror for portability and fallback.
- After Dude closes Beads work, mirror the Beads result back to the matching canonical task unit in `tasks.md` when the durable task key maps cleanly. Regenerate any derived board region, record the write-back in the uniquely owning idea's Coordinator Log, and run `dude-lint`.
- Use explicit `@dude sync Beads to tasks.md` for stale mirrors, manual Beads changes, or planned fallback from Tracked Execution to Lightweight Execution.
- Typed `@dude flag` prefixes are preferred, but plain-language blocker reports should still be classified when the intended type is clear.
- Guardrail ratification accepts `accept`, `edit`, `reject`, or `skip`; `skip` means continue with bundle defaults only.
- For clearly solo, exploratory, or hobby-style repos, inferred candidate guardrails should stay minimal.
- If guardrail inference yields no new project-specific entries beyond bundle defaults, continue definition without a separate guardrail pause.
- Surface the Windows Dolt server-mode path early whenever tracked execution is being enabled.
- Users may not know when worktrees would help; if a risky/high-churn change or truly independent parallel work would materially reduce risk or checkout contention, Dude may suggest them briefly with the concrete benefit and a simpler fallback instead of waiting for the user to ask.
- Ask the smallest set of questions that materially change scope, constraints, approvals, or routing.
- New Dude project-state reads and writes use only the current `.dude/ideas/`, `.dude/specs/`, `.dude/metadata/`, `.dude/memory/`, and `.dude/state/` surfaces. Older Dude layouts require external or manual recovery rather than an in-bundle migration workflow.

## Domain Knowledge

- This repository's primary deliverable is the reusable Dude bundle itself. Edit core in `src/`, catalog packs in `library/packs/`, and docs directly; rebuild generated `.github/` core output with `node scripts/build-dev.mjs`.
- `.dude/metadata/bundle-manifest.md` is the sole manifest for source dogfood, upgrades, and releases; no alternate compatibility manifest endpoint is read or emitted.
- First-time users are often unfamiliar with Beads, guardrails, `spec_path`, when `tasks.md` is live versus mirrored, what `[ ]` / `[~]` / `[!]` / `[x]` mean, and why a generated board region may appear there; prefer plain language, short examples, and explicit file ownership.
- Guardrail ratification is a normal pause point in definition, not a failure state.
- A lean definition package is valid; omit placeholder artifacts for domains that do not materially apply.
- If an idea clearly spans several bounded outcomes, split or narrow it before definition instead of letting one idea ledger become a roadmap.

## Core Dogfood Close

This repository-local convention covers authoritative core under `src/**` and its base-owned generated projection. It is a procedural, policy-only guarantee, not deterministic compilation: static tests prove policy coverage only and do not prove future Spec Lead derivation, Reviewer verdicts, or close behavior.

For planned writes to exact `src/**` files, stage exactly one open, non-`[P]`, `[Shared]` terminal task. Its header has one `declared-src:` clause containing the complete set of unique, exact, backticked file paths sorted in UTF-8 bytewise lexical order; directories and globs are invalid and must be rejected. The terminal depends by durable task key on every source-contributing task that can contribute an accepted source change.

Independent definition readiness review returns `REJECT` for a missing core terminal, more than one terminal, a terminal that is not open, any `[P]` terminal, or a terminal missing `[Shared]`. It also returns `REJECT` for a missing, duplicate, unsorted, incomplete, directory, or glob declaration, and for any missing contributing dependency.

A normal definition with no planned source write derives no normal core terminal. For this package, Feature 008, `declared-src: none` is only a bootstrap empty-set exception.

In Lightweight execution, the canonical open task header is declaration authority. In Tracked execution, the corresponding Beads issue text is declaration authority; `tasks.md` is a non-authoritative mirror and is not consulted as live authority. The unique owner's existing `## Coordinator Log` is the common evidence carrier in both lanes.

The exact baseline Coordinator Log line is:

- <UTC> - core-dogfood-baseline v1 terminal=<taskKey> head=<gitOid> src_tree=<gitTreeOid>

The exact accepted Coordinator Log line is:

- <UTC> - core-dogfood-accepted v1 terminal=<taskKey> head=<gitOid> declared=<sha256> source=<sha256> changed=<sha256> review=<sha256>

These evidence lines are append-only, contain identifiers and digests but no source or generated file bytes, and must each be less than 512 UTF-8 bytes. All evidence paths are workspace-relative POSIX paths; duplicate paths, invalid UTF-8 path representations, unsupported path types, or noncanonical ordering block. All evidence hashes are lowercase SHA-256 over UTF-8 canonical JSON with no insignificant whitespace.

`declared` hashes the exact JSON path array containing the complete, sorted, unique exact terminal paths. `source` hashes one complete sorted canonical JSON array of all current `src/**` file rows; directories are omitted. Source rows use keys in this exact order: `{"path":"src/example.mjs","type":"100644","content":"<base64-exact-bytes>"}`. Supported types are `100644`, `100755`, and `120000`; content is the base64 encoding of a regular file's exact bytes or a symlink's exact target bytes.

`changed` hashes one complete canonical JSON array sorted by path containing all baseline-diff rows. Added, modified, and type-changed paths use the exact current source-row shape; a deletion uses `type:"absent"` in the exact ordered shape `{"path":"src/removed.mjs","type":"absent"}`; a rename is one absent row plus one current row.

`review` does not hash the raw response. It hashes a fixed-order canonical envelope containing the exact transient Reviewer record: `{"version":1,"terminal":"T004@1234abcd","head":"<gitOid>","declared":"<sha256>","source":"<sha256>","changed":"<sha256>","verdict":"APPROVE","record":"<exact substantive Reviewer response>"}`. The complete exact substantive independent Reviewer response goes in `record` and binds the terminal, `HEAD`, `declared`, `source`, `changed`, generated parity, fresh verification, and the `APPROVE` verdict.

Baseline preflight binds immutable `HEAD` and `HEAD:src` only after proving no tracked, untracked, or ignored entries under `src/**` or base-owned generated core and proving exact source/generated parity. The coordinator appends the baseline line only after that clean preflight, then performs a fresh recheck of the same conditions immediately before the first source mutation. If preflight fails, wait for a clean boundary or use a worktree only after user approval or opt-in.

Serialize one core interval from baseline through materialization. Every changed source path must be declared, and the active declaration must match acceptance. Observed or suspected concurrency blocks; do not claim actor attribution, and otherwise rely only on a locally controlled interval.

Immediately before materialization, recompute the identities and require the independently reviewed identities to still match; materialize only the accepted source change, and run `node scripts/build-dev.mjs` only when `changed` is nonempty. Source tests under `src/**/*.test.mjs` trigger the lifecycle even with no generated destination. When there is no accepted source change and `changed` is empty, do not run `node scripts/build-dev.mjs`; parity is proved read-only. Materialization must preserve installed `dude-pack-*` artifacts, `.github/skills/project/**`, `.github/workflows/**`, and `.dude/**` exactly.

Final acceptance requires focused tests, the full repository suite, Dude lint, compose verification, a pristine external release build and lint, feature-scoped diff checks, final parity, and fresh independent review. Append the accepted line only after fresh independent `APPROVE`, then immediately recompute all bound identities. Close uses only the latest matching accepted line; any drift requires fresh independent review and a later accepted line.

A missing baseline, undeclared changed path, declaration mismatch, post-review source drift, generated drift, failed verification, or Reviewer verdict `REJECT` blocks without mutation, close, or delivery claim. Any missing or mismatched source, generated, declaration, verification, or review evidence likewise blocks.

Do not add a compiler, runtime, helper, command, state store, ledger, framework, or persistent scenario report for this policy, and do not duplicate declarations or evidence in Beads notes.

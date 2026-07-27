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

This repository-local, policy-only convention covers authoritative core under `src/**` and its base-owned generated projection. Static tests prove policy coverage only; they do not prove future Spec Lead derivation, Reviewer verdicts, model behavior, promotion, or close behavior.

The sole first adopter under accepted Feature 008 `T006@62726964` policy is only the current Feature 009 `T009@696e6369` materialization event in the current main checkout without isolation. Transient route eligibility begins only after current focused evidence and independent acceptance for both `T006@62726964` and `T007@9a4e7c12`. For that exact event only, the local promotion procedure requires one complete fresh current-session packet with exact disjoint 10/9/1 delta coverage and a live route to exactly five generated destinations plus five explicit no-output results. The packet authorizes one immediate materialization only after independent Tester and Reviewer approval and an unchanged recheck; it is not persisted or reconstructed. Every contributor retains separate ownership and audit history, and T009 claims only its own work.

For that current event, route only when current Lightweight authority and its task-state snapshot agree that the sole non-`[P]`, `[Shared]` T009 terminal has all eight Feature 009 dependencies done and only its exact T007 acceptance blocker remains to be resolved. The local procedure consumes T008's actual claim-and-close record shapes without adding fields, validates the original baseline's tree and chronology plus the complete user-authorized ordered chain through current `HEAD`, and permits close only from the newest exact accepted line after immediate recheck and runtime accepted-feature identity validation.

The exact route is completed `T001@8f2c1a47` -> `T004@e2a91f6c` -> `T005@3d7b0af5` -> `T006@62726964` -> accepted `T007@9a4e7c12` -> ready `T009@696e6369`, routed to the existing `dude-local-core-dogfood-promotion` skill -> `T002@5b7d930e` after full verification is green -> `T003@c4e6812d`. Every later feature retains exact baseline `HEAD` and `HEAD:src` plus every existing lifecycle gate; the transient route never weakens, generalizes, or substitutes for them.

Readiness rejects a missing terminal and rejects more than one terminal. In Lightweight execution, declaration authority is the canonical open task header; in Tracked execution, declaration authority is the corresponding Beads issue text and `tasks.md` is never live authority, only a non-authoritative mirror. The unique owner's `## Coordinator Log` is the common evidence carrier in both lanes. Baseline preflight binds immutable `HEAD` and `HEAD:src` only after tracked, untracked, ignored, and parity checks cover both `src/**` and base-owned generated core. A failed or dirty preflight waits, or uses an isolated worktree only after explicit user opt-in. One core interval is serialized from baseline through materialization; every changed source path is declared and the active declaration must match acceptance. Observed or suspected concurrency blocks the locally controlled interval without actor attribution.

For planned writes to exact `src/**` files, definition must stage exactly one open, non-`[P]`, `[Shared]` terminal task. Its header has one `declared-src:` clause containing the complete set of unique, exact, backticked file paths sorted in UTF-8 bytewise lexical order; directories and globs are invalid. The terminal depends by durable task key on every source-contributing task that can contribute an accepted source change.

Independent definition readiness review returns `REJECT` for a missing or second core terminal, a terminal that is not open, any `[P]` terminal, or a terminal missing `[Shared]`. It also returns `REJECT` for a missing, duplicate, unsorted, incomplete, directory, or glob declaration, and for any missing source-contributing dependency.

A normal definition with no planned source write derives no normal core terminal. For this package, Feature 008, `declared-src: none` is only a bootstrap empty-set exception and cannot authorize a source write.

### Resolve The Exact Owner And Terminal

Start from the exact selected feature `spec_path`; never fall back to or derive identity from a slug, package directory, title, branch, or task prose. Before invoking the source resolver, run the four raw `src` dirt queries and `git ls-files -v -z -- src` from the ten-command cleanliness block below, require every command to succeed, require all four dirt outputs to be empty, and require every returned tag to be the normal uppercase `H`; a failed command, a lowercase tag, including assume-unchanged, or an `S` skip-worktree tag blocks before executing the source resolver and before any `src/**` repository source runs.

```bash
set -eu
GUARD_TMP="$(mktemp -d)"
trap 'rm -rf "$GUARD_TMP"' EXIT HUP INT TERM
git ls-files -v -z -- src >"$GUARD_TMP/source-index-flags"
while IFS= read -r -d '' SRC_INDEX_ENTRY; do
	case "$SRC_INDEX_ENTRY" in
		H\ *) ;;
		*) exit 1 ;;
	esac
done <"$GUARD_TMP/source-index-flags"
rm -rf "$GUARD_TMP"
trap - EXIT HUP INT TERM
```

```bash
OWNER_RESULT="$(node src/skills/dude-engine/feature.mjs resolve \
	--root . \
	--spec "$SPEC_PATH" \
	--json)"
OWNER_PATH="$(OWNER_RESULT="$OWNER_RESULT" SPEC_PATH="$SPEC_PATH" node --input-type=module - <<'NODE'
import fs from 'node:fs';

const result = JSON.parse(process.env.OWNER_RESULT || 'null');
const specPath = process.env.SPEC_PATH;
if (!result || !Array.isArray(result.diagnostics) || result.diagnostics.length !== 0) {
		throw new Error('owner resolution returned diagnostics');
}
if (!result.owner || result.owner.specPath !== specPath
		|| !/^\.dude\/ideas\/[^/]+\.md$/.test(result.owner.ideaPath)) {
		throw new Error('owner resolution did not return one exact direct owner');
}
const ownerText = fs.readFileSync(result.owner.ideaPath, 'utf8');
if ((ownerText.match(/^## Coordinator Log\r?$/gm) || []).length !== 1) {
		throw new Error('exact owner must contain one Coordinator Log');
}
process.stdout.write(result.owner.ideaPath);
NODE
)"
test -n "$OWNER_PATH"
```

Require every command to exit successfully. `OWNER_PATH` must be the exact direct owner with one `## Coordinator Log`; any diagnostic, absent owner, multiple-owner condition, path mismatch, or missing or duplicate log blocks before mutation.

Resolve terminal and declaration authority from the active lane only. Lightweight execution uses the exact sibling `tasks.md` canonical units and their canonical task headers. Tracked execution uses the corresponding live Beads issue text; `tasks.md` is a non-authoritative mirror, and Beads notes are ignored as authority.

Require exactly one open, non-`[P]`, `[Shared]` core terminal with one durable task key and one complete `declared-src:` clause. The source-contributing task about to run must be a durable dependency of that terminal, and every path it may mutate must be an exact declared file. A directory, glob, duplicate, unsorted path, `none`, missing contributor, lane disagreement, or second terminal blocks source mutation.

### Capture Immutable Base Identities

From the repository root, capture and retain exact `HEAD` and `HEAD:src` values as immutable transient current-run inputs:

```bash
BASE_HEAD="$(git rev-parse --verify 'HEAD^{commit}')"
BASE_SRC_TREE="$(git rev-parse --verify 'HEAD:src')"
test "$(git cat-file -t "$BASE_SRC_TREE")" = tree
```

An absent `src` tree, command failure, or non-tree object blocks. After all preflight checks, rerun both `git rev-parse` commands and require the resulting `HEAD` and `HEAD:src` values to be byte-identical to the captured values; any mismatch blocks.

### Prove Both Owned Boundaries Clean

Run all eight NUL-delimited dirt queries plus both NUL-delimited hidden-index-flag checks and classify their results in one fail-closed preflight:

```bash
set -eu
BASELINE_TMP="$(mktemp -d)"
trap 'rm -rf "$BASELINE_TMP"' EXIT HUP INT TERM
git -c core.fileMode=true diff --cached --no-renames --name-only -z -- src >"$BASELINE_TMP/source-index"
git -c core.fileMode=true diff --no-renames --name-only -z -- src >"$BASELINE_TMP/source-worktree"
git ls-files --others --exclude-standard -z -- src >"$BASELINE_TMP/source-untracked"
git ls-files --others --ignored --exclude-standard -z -- src >"$BASELINE_TMP/source-ignored"
git ls-files -v -z -- src >"$BASELINE_TMP/source-index-flags"
git -c core.fileMode=true diff --cached --no-renames --name-only -z -- .github >"$BASELINE_TMP/generated-index"
git -c core.fileMode=true diff --no-renames --name-only -z -- .github >"$BASELINE_TMP/generated-worktree"
git ls-files --others --exclude-standard -z -- .github >"$BASELINE_TMP/generated-untracked"
git ls-files --others --ignored --exclude-standard -z -- .github >"$BASELINE_TMP/generated-ignored"
git ls-files -v -z -- .github >"$BASELINE_TMP/generated-index-flags"
node --input-type=module - "$BASELINE_TMP" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { classifyPath, TIER } from './src/skills/dude-engine/lib/ownership.mjs';

const root = process.argv[2];
const decoder = new TextDecoder('utf-8', { fatal: true });
const readPaths = (name) => {
	const bytes = fs.readFileSync(path.join(root, name));
	const body = bytes.at(-1) === 0 ? bytes.subarray(0, -1) : bytes;
	return body.length === 0 ? [] : decoder.decode(body).split('\0').filter(Boolean);
};
const readTaggedPaths = (name) => readPaths(name).map((entry) => {
	if (!/^[A-Za-z?] /.test(entry)) {
		throw new Error(`${name}: invalid ls-files -v entry`);
	}
	return { tag: entry[0], path: entry.slice(2) };
});

for (const name of ['source-index', 'source-worktree', 'source-untracked', 'source-ignored']) {
	const paths = readPaths(name);
	if (paths.length > 0) {
		process.stderr.write(`${name}: ${paths.join(', ')}\n`);
		process.exitCode = 1;
	}
}
const sourceFlagged = [];
for (const { tag, path: candidate } of readTaggedPaths('source-index-flags')) {
	if (!candidate.startsWith('src/')) {
		throw new Error(`source-index-flags: path escaped src boundary: ${candidate}`);
	}
	if (tag !== 'H') sourceFlagged.push(`${tag} ${candidate}`);
}
if (sourceFlagged.length > 0) {
	process.stderr.write(`source-index-flags: ${sourceFlagged.join(', ')}\n`);
	process.exitCode = 1;
}
const knownTiers = new Set(Object.values(TIER));
const classifyGenerated = (name, candidate) => {
	if (!candidate.startsWith('.github/')) {
		throw new Error(`${name}: path escaped .github boundary: ${candidate}`);
	}
	const tier = classifyPath(candidate);
	if (!knownTiers.has(tier)) {
		throw new Error(`${name}: ownership classification failed: ${candidate}`);
	}
	return tier;
};
for (const name of ['generated-index', 'generated-worktree', 'generated-untracked', 'generated-ignored']) {
	const paths = readPaths(name);
	const corePaths = [];
	for (const candidate of paths) {
		const tier = classifyGenerated(name, candidate);
		if (tier === TIER.CORE) corePaths.push(candidate);
	}
	if (corePaths.length > 0) {
		process.stderr.write(`${name}: ${corePaths.join(', ')}\n`);
		process.exitCode = 1;
	}
}
const generatedFlagged = [];
for (const { tag, path: candidate } of readTaggedPaths('generated-index-flags')) {
	if (classifyGenerated('generated-index-flags', candidate) === TIER.CORE && tag !== 'H') {
		generatedFlagged.push(`${tag} ${candidate}`);
	}
}
if (generatedFlagged.length > 0) {
	process.stderr.write(`generated-index-flags: ${generatedFlagged.join(', ')}\n`);
	process.exitCode = 1;
}
NODE
rm -rf "$BASELINE_TMP"
trap - EXIT HUP INT TERM
```

Every Git command, the Node process, and every authoritative `classifyPath` ownership classification of a generated candidate, including a generated hidden-index-flag candidate, must succeed. Classification fails closed: invalid UTF-8 path bytes, a path escaping `.github/`, an unknown tier, a classifier failure, or any dirt candidate classified as `TIER.CORE` blocks. `TIER.PACK`, `TIER.LOCAL`, and `TIER.PROJECT` paths remain outside this predicate and must not be cleaned, adopted, or reclassified.

The source and generated index-versus-`HEAD` and worktree-versus-index layers are independent, so offsetting changes cannot cancel. Staged additions, modifications, deletions, type changes, and unmerged or conflict paths remain visible and block; the separate queries also block untracked and ignored entries in the owned boundaries.

All four tracked comparisons force `core.fileMode=true` via `git -c core.fileMode=true diff`. Mode-only drift therefore blocks even when the repository has `core.fileMode=false`.

For tracked paths, the only normal tag is uppercase `H`. Every ordinary tracked entry under `src/**` and every authoritative `classifyPath`-confirmed `TIER.CORE` generated path must use that normal tag; lowercase tags, including assume-unchanged, and the `S` skip-worktree tag block.

Then run the exact named nonmutating parity test and require it to leave the worktree unchanged:

```bash
node --test \
	--test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' \
	scripts/build-dev.test.mjs
```

Failure, missing generated output, unexpected base-owned output, byte mismatch, or any worktree mutation blocks.

### Record And Recheck The Baseline

Only the coordinator may append this exact baseline line to the resolved owner's existing `## Coordinator Log`:

```text
- <UTC> - core-dogfood-baseline v1 terminal=<taskKey> head=<gitOid> src_tree=<gitTreeOid>
```

Append the baseline only after owner and terminal resolution, both immutable identity captures, all eight cleanliness checks plus both hidden-index-flag checks, fail-closed classification, passing parity, and the final identity comparison have succeeded. Use the durable terminal key, `BASE_HEAD`, and `BASE_SRC_TREE`; never rewrite an older line or store source or generated bytes.

After the append and immediately before the first source mutation, repeat the exact owner, active-lane terminal and declaration, both identity captures, all eight cleanliness checks, both hidden-index-flag checks, classification, and parity checks. Require the same owner, terminal key, declaration, `BASE_HEAD`, and `BASE_SRC_TREE`, plus clean boundaries and passing parity. Failure leaves the line as stale audit history, authorizes no source write, and requires a later complete clean preflight and later baseline line.

### Hold One Serialized Interval

After that recheck, permit one locally controlled core interval from the baseline through materialization. A changed `HEAD`, terminal, declaration, source path, or generated core, or any observed or suspected concurrent activity, blocks the interval; never infer or claim actor attribution. Do not overlap another `src/**` or base-owned generated-core mutation, and require every accepted changed source path to remain inside the active declaration.

If a clean serialized boundary cannot be established, wait. Offer an isolated worktree only as a fallback and use one only after explicit user opt-in; inside it, execute the whole owner, terminal, identity, cleanliness, parity, append, and immediate-recheck contract afresh. Never transplant or retroactively create baseline evidence.

Only when the canonical terminal is ready because all source-contributing dependencies and pre-promotion acceptance prerequisites have cleared should the coordinator discover and load `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`. Specification completion alone is not a trigger; the ready terminal routes to `dude-local-core-dogfood-promotion` for the post-readiness procedure.

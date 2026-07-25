# Implementation Plan: Automatic Core Dogfood Promotion

## Summary

Extract the post-readiness `Core Dogfood Close` runbook from the currently large project-skill section into `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`. Keep `.github/skills/project/SKILL.md` concise but complete for the earlier boundary: it identifies the terminal convention and contains the executable baseline contract needed before the first `src/**` mutation, then routes a ready terminal to the local skill. Revise the existing static tests to verify both artifacts while continuing to state that text contracts do not prove future model behavior.

Preserve the implemented early CI drift boundary, exact evidence model, serialized lifecycle, and existing materializer design. Strengthen the focused materializer fixture already in progress, then finish through the explicit no-source bootstrap terminal after the new extraction task is accepted.

The canonical feature identity is `.dude/specs/008-automatic-core-dogfood-promotion/spec.md`.

The implementation has no planned `src/**` or base-owned generated-core write. Repository `build-dev` is not run as a feature mutation.

## Technical Context

**Language/Version**: Dependency-free JavaScript ES modules on Node.js >= 20, Markdown skill contracts, Git, and shell embedded in GitHub Actions YAML.

**Primary Dependencies**: VS Code/Copilot skill discovery, Node built-ins, Git, GitHub Actions checkout/setup actions, existing `scripts/build-dev.mjs`, `scripts/build-release.mjs`, Dude lint, and Dude compose.

**Storage**: No new storage. The only durable lifecycle evidence is two bounded coordinator-owned lines in the unique owner's existing Coordinator Log. Task/current-run/Reviewer inputs remain transient. No evidence is copied to Beads notes.

**Testing**: Node's built-in test runner; section-aware project-route and local-skill source-contract tests; temporary Git repositories; focused build-dev fixtures; recursively discovered repository tests; Dude lint; compose verification; pristine external release build and lint; feature-scoped diff checks; read-only parity; independent review; fresh non-persisted authority exercises.

**Target Platform**: Maintainer Git worktrees on supported desktop platforms and GitHub Actions Ubuntu runners using Node 20 and 22.

**Project Type**: Reusable bundle repository with authoritative source under `src/`, committed generated dogfood under `.github/`, and project-owned local workflow guidance under `.github/skills/dude-local-*`.

**Performance Goals**: Canonical inventories and hashing remain linear in examined paths and bytes. Skill routing adds no runtime service, network operation, or persistent process.

**Constraints**: No planned source mutation; no optional-pack, technical-docs, release-source, downstream, user-facing, or shipped-skill change; no new dependency, helper file, command, framework, state store, ledger, ObjectiveRegistry, compiler, runtime, or persistent exercise report.

## Guardrail Check

| Guardrail | Plan response |
|---|---|
| Prefer deterministic validation | Use exact task grammar, canonical JSON digests, Git OIDs, path/type/content fixtures, Git status predicates, parity checks, and section-aware text contracts for deterministic facts. |
| Reserve model reasoning for semantic decisions | Skill discovery, Spec Lead derivation, Reviewer readiness, concurrency suspicion, and close judgment remain model-facing and are exercised fresh rather than claimed deterministic. |
| Keep model guidance concise | The project skill retains the terminal rule, one compact executable pre-terminal baseline contract, and the trigger/route; the focused local skill owns all post-readiness hashing, materialization, verification, and close mechanics. |
| Choose the smallest justified design | Reuse the existing Coordinator Log, canonical tasks or Beads issue text, current materializer, current tests, CI, and standard local-skill namespace. |
| Keep optional disciplines opt-in | A worktree is used only after user approval when the required clean serialized boundary is unavailable. |
| Protect unrelated work | Dirty source or generated core blocks instead of being treated as opaque; unrelated work is never cleaned or adopted. |

No new guardrail is proposed.

## Existing Authorities And Current State

- `.github/skills/project/SKILL.md` currently carries the complete project-local procedure. T001 implemented that contract and the early CI drift boundary; its completed result remains valid historical implementation.
- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` does not yet exist. T004 extracts and focuses the reusable procedure without changing its evidence or materialization semantics.
- The Spec Lead derives canonical tasks; an independent Reviewer controls definition readiness.
- `tasks.md` is authoritative only in Lightweight execution. After import, corresponding Beads issue text is authoritative and `tasks.md` is a mirror.
- The uniquely owning idea already contains an append-only `## Coordinator Log`.
- `scripts/build-dev.mjs` owns authoritative source-to-generated projection.
- `listCoreSourceFiles` in `scripts/build-release.mjs` owns projectable source enumeration.
- Existing ownership classification identifies base-owned generated core.
- `scripts/current-format-contract.test.mjs` owns project-local source contracts and already covers the implemented CI boundary.
- `scripts/build-dev.test.mjs` owns focused materializer fixtures and parity checks. T002 is in progress; its former Feature 003 dependency is complete and its stale blocker is proposed for coordinator removal.
- `.github/workflows/ci.yml` already has the T001 verification-only drift changes. They remain unchanged unless a focused contract test identifies a direct contradiction.

## Chosen Design

### 1. Split Concise Routing From The Reusable Procedure

Create exactly one project-local skill:

`.github/skills/dude-local-core-dogfood-promotion/SKILL.md`

Its frontmatter uses:

```yaml
---
name: "dude-local-core-dogfood-promotion"
description: "Use when a canonical terminal core dogfood promotion task becomes ready after all source-contributing dependencies and pre-promotion acceptance prerequisites have cleared."
---
```

The description starts with `Use when`, names the concrete terminal-ready trigger, and matches the reserved project-local directory name. The skill is project-owned and is not added to `src/**`, a pack manifest, the bundle manifest, or release output.

The local skill owns the detailed recurring procedure:

- trigger refusal when the canonical terminal is not ready;
- exact lane declaration authority;
- validation and consumption of the already-recorded baseline;
- accepted evidence format;
- canonical declared/source/changed/review hashes;
- reviewed-identity rechecks;
- conditional `build-dev` materialization;
- protected-boundary snapshots and parity;
- focused/full/release verification;
- independent final review, accepted-line append, immediate recheck, and latest-match close;
- no-source behavior and all failure blocks.

Reduce the existing `## Core Dogfood Close` project section to concise convention and routing authority. It retains everything that must be executable before terminal loading:

- planned exact `src/**` writes require one open, non-`[P]`, `[Shared]` terminal with a complete `declared-src:` clause and every source-contributing dependency;
- exact owner and active-lane terminal resolution before any source write;
- immutable `HEAD` and `HEAD:src` capture;
- independent index-versus-`HEAD`, worktree-versus-index, untracked, and ignored cleanliness checks for `src/**` and classifier-owned generated core;
- the named read-only current-parity check;
- the exact coordinator-owned baseline log line, appended only after clean preflight;
- immediate repetition of owner, terminal, identity, cleanliness, and parity checks before the first source mutation;
- one serialized interval from baseline through materialization, with observed or suspected concurrency blocking and no actor-attribution claim;
- wait-by-default behavior and isolated-worktree fallback only after explicit user opt-in;
- the local skill is discovered and loaded only after the terminal and pre-promotion acceptance prerequisites are ready;
- specification completion alone is not a trigger;
- no planned source write normally derives no terminal;
- the ready terminal routes to `dude-local-core-dogfood-promotion`.

The project section does not carry declared/source/changed/review hash schemas, protected-boundary snapshotting, materialization, the final verification matrix, accepted-line construction, or final-close sequencing. Those post-readiness details live only in the local skill. The exact implementation text for both sides is specified below and tested together.

### 2. Terminal-Readiness Gate

The trigger is semantic workflow routing, not a filesystem watcher or runtime hook.

A terminal is ready only when:

1. the active lane has exactly one canonical open non-`[P]` `[Shared]` core terminal;
2. its complete exact declaration is valid;
3. every source-contributing durable dependency has completed with required acceptance;
4. all pre-promotion focused verification and independent source acceptance prerequisites are current;
5. no blocker, ownership diagnostic, declaration mismatch, baseline invalidation, or concurrency concern remains.

Only then does Dude use the concise project route to discover and load the local skill. A defined spec, a staged task list, or a terminal with incomplete dependencies does not trigger skill loading or materialization.

No deterministic discovery engine is added. T003 exercises the ready and not-ready cases with the actual model-facing authorities, and static tests explicitly limit their claim to contract text.

### 3. Definition-Time Terminal Contract

For planned exact source-file writes:

- stage exactly one open `[Shared]` terminal task;
- do not add `[P]`;
- put the complete declaration in the terminal header after `declared-src:` as unique exact backticked file paths in UTF-8 bytewise lexical order;
- reject directory names such as `src/` and globs such as `src/**`;
- add every source-contributing task as a durable-key dependency;
- require independent definition readiness review.

Example:

```markdown
- [ ] T004@1234abcd [Shared] Materialize and accept core dogfood; declared-src: `src/agents/dude.agent.md`, `src/skills/dude-work/SKILL.md`
    deps: T001@aaaaaaaa, T003@cccccccc
```

A normal no-source definition derives no terminal task. This package's existing terminal task uses `declared-src: none` solely as an explicit bootstrap empty-set exception.

The independent Reviewer returns `REJECT` when planned exact source writes have no terminal, more than one terminal exists, the terminal is not open, it has `[P]`, it lacks `[Shared]`, its declaration is missing/duplicate/unsorted/incomplete/a directory/a glob, or any contributing dependency is absent.

### 4. Lane Portability

- Lightweight: the canonical task header is declaration authority.
- Tracked: import carries the open task text and durable key into the corresponding Beads issue; that issue text becomes declaration authority.
- The unique owner's Coordinator Log remains the evidence carrier in either lane.
- Do not duplicate declarations or evidence into Beads notes.
- Do not consult a tracked `tasks.md` mirror as authority.

### 5. Canonical Evidence Inputs

All hashes are lowercase hexadecimal SHA-256 over UTF-8 bytes of canonical JSON with no insignificant whitespace.

Paths are workspace-relative POSIX paths. Duplicate paths, unsupported path types, invalid UTF-8 path representations, or noncanonical ordering block.

#### Declared Hash

`declared` hashes a JSON array of exact declared paths:

```json
["src/agents/dude.agent.md","src/skills/dude-work/SKILL.md"]
```

The array is unique and sorted by UTF-8 bytewise lexical order. The bootstrap empty declaration hashes `[]`.

#### Source Hash

`source` hashes the complete current `src/**` inventory. Directories are omitted. Rows are sorted by path and use keys in this exact order:

```json
{"path":"src/example.mjs","type":"100644","content":"<base64-exact-bytes>"}
```

Supported `type` values are Git-compatible `100644`, `100755`, and `120000`. Symlink content is the exact target bytes. Unsupported types block. The canonical input is one JSON array containing every row, including source tests.

#### Changed Hash

`changed` hashes all rows that differ from the baseline `HEAD` source tree. Added, modified, or type-changed paths use the current source-row shape. A deletion uses:

```json
{"path":"src/removed.mjs","type":"absent"}
```

Renames are represented by one absent row and one current row. The array is complete and sorted by path.

#### Review Hash

The independent Reviewer returns a substantive record that binds the terminal durable key, immutable `HEAD`, `declared`/`source`/`changed` digests, generated parity, fresh verification, and leading verdict `APPROVE`.

The `review` input is a fixed-order canonical envelope containing the exact transient Reviewer record:

```json
{"version":1,"terminal":"T004@1234abcd","head":"<gitOid>","declared":"<sha256>","source":"<sha256>","changed":"<sha256>","verdict":"APPROVE","record":"<exact substantive Reviewer response>"}
```

The response and envelope remain transient. Only their final SHA-256 is logged. If the response is unavailable after interruption, obtain a fresh review.

### 6. Existing Coordinator Log Carrier

The coordinator appends evidence only to the unique owner's existing `## Coordinator Log`.

The exact pre-terminal baseline record and its append conditions are defined once in Plan Section 7.4 for the project skill.

The local skill owns the accepted record:

```text
- <UTC> - core-dogfood-accepted v1 terminal=<taskKey> head=<gitOid> declared=<sha256> source=<sha256> changed=<sha256> review=<sha256>
```

Rules:

- `<taskKey>` is the durable task key, not a lane-specific issue number.
- `<gitOid>` is the exact `HEAD` OID.
- `<gitTreeOid>` is the exact Git tree OID for `HEAD:src`.
- Every digest is lowercase 64-character SHA-256.
- Each complete line is less than 512 UTF-8 bytes.
- No source, generated, review, or other file bytes are written to the log.
- Lines are append-only audit context, not a board, state machine, or independently sufficient close record.
- Stale lines remain history and cannot authorize close.

### 7. Complete Pre-Terminal Baseline Contract In The Project Skill

This subsection is the implementation source of truth for the compact baseline guidance that T004 retains in `.github/skills/project/SKILL.md`. It is loaded with project knowledge and must be followed before the first mutation of any declared `src/**` path; waiting until the terminal-ready local skill would be too late.

#### 7.1 Resolve The Exact Owner And Terminal

The coordinator starts from the exact selected feature `spec_path`; it never derives identity from a slug, package directory, title, branch, or task prose. Before invoking repository source, run the four raw `src` dirt queries from Section 7.3, require every query to succeed, and require all four outputs to be empty. Then run the existing read-only resolver from authoritative source:

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

Require every command to exit successfully. `OWNER_PATH` is the exact direct owner and sole log carrier. Any diagnostic, absent owner, multiple-owner condition, path mismatch, or missing/duplicate owner log blocks before mutation.

Resolve the terminal from the active lane only:

- Lightweight uses the exact sibling `tasks.md` canonical units.
- Tracked execution uses the corresponding live Beads issue text; the markdown mirror and Beads notes are ignored as authority.
- Require exactly one open, non-`[P]`, `[Shared]` core terminal with one durable task key and one complete `declared-src:` clause.
- Require the source-contributing task about to run to be a durable dependency of that terminal and every path it may mutate to be an exact declared file. A directory, glob, duplicate, unsorted path, `none`, missing contributor, lane disagreement, or second terminal blocks source mutation. The `none` value is valid only for this package's no-source bootstrap and cannot authorize a source write.

#### 7.2 Capture Immutable Base Identities

From the repository root, capture and retain these exact values as transient current-run inputs:

```bash
BASE_HEAD="$(git rev-parse --verify 'HEAD^{commit}')"
BASE_SRC_TREE="$(git rev-parse --verify 'HEAD:src')"
test "$(git cat-file -t "$BASE_SRC_TREE")" = tree
```

An absent `src` tree, command failure, or non-tree object blocks. Re-run both `git rev-parse` commands after all preflight checks and require byte-identical values before recording the baseline.

#### 7.3 Prove Both Owned Boundaries Clean

Run all eight NUL-delimited dirt queries and classify their results in one fail-closed preflight:

```bash
set -eu
BASELINE_TMP="$(mktemp -d)"
trap 'rm -rf "$BASELINE_TMP"' EXIT HUP INT TERM
git diff --cached --no-renames --name-only -z -- src >"$BASELINE_TMP/source-index"
git diff --no-renames --name-only -z -- src >"$BASELINE_TMP/source-worktree"
git ls-files --others --exclude-standard -z -- src >"$BASELINE_TMP/source-untracked"
git ls-files --others --ignored --exclude-standard -z -- src >"$BASELINE_TMP/source-ignored"
git diff --cached --no-renames --name-only -z -- .github >"$BASELINE_TMP/generated-index"
git diff --no-renames --name-only -z -- .github >"$BASELINE_TMP/generated-worktree"
git ls-files --others --exclude-standard -z -- .github >"$BASELINE_TMP/generated-untracked"
git ls-files --others --ignored --exclude-standard -z -- .github >"$BASELINE_TMP/generated-ignored"
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

for (const name of ['source-index', 'source-worktree', 'source-untracked', 'source-ignored']) {
    const paths = readPaths(name);
    if (paths.length > 0) {
        process.stderr.write(`${name}: ${paths.join(', ')}\n`);
        process.exitCode = 1;
    }
}
const knownTiers = new Set(Object.values(TIER));
for (const name of ['generated-index', 'generated-worktree', 'generated-untracked', 'generated-ignored']) {
    const paths = readPaths(name);
    const corePaths = [];
    for (const candidate of paths) {
        if (!candidate.startsWith('.github/')) {
            throw new Error(`${name}: path escaped .github boundary: ${candidate}`);
        }
        const tier = classifyPath(candidate);
        if (!knownTiers.has(tier)) {
            throw new Error(`${name}: ownership classification failed: ${candidate}`);
        }
        if (tier === TIER.CORE) corePaths.push(candidate);
    }
    if (corePaths.length > 0) {
        process.stderr.write(`${name}: ${corePaths.join(', ')}\n`);
        process.exitCode = 1;
    }
}
NODE
rm -rf "$BASELINE_TMP"
trap - EXIT HUP INT TERM
```

Every Git command, the Node process, and every ownership classification must succeed. The source queries independently require an empty index-versus-`HEAD` result, an empty worktree-versus-index result, no untracked files, and no ignored files. The generated queries cover the same four classes; every candidate is passed through the authoritative classifier, and any classification failure or returned workspace-relative POSIX path classified as `TIER.CORE` blocks. Invalid UTF-8 path bytes also block. `TIER.PACK`, `TIER.LOCAL`, and `TIER.PROJECT` paths are outside this generated-core cleanliness predicate and must not be cleaned, adopted, or reclassified. Because the two tracked-state layers are queried independently, offsetting changes cannot cancel: staged additions, modifications, deletions, type changes, and unmerged/conflict paths remain visible even when worktree bytes match `HEAD`.

Then prove current complete source/generated parity with the existing read-only named test:

```bash
node --test \
    --test-name-pattern='checked-in dev core is a byte-identical non-mutating projection of authoritative source' \
    scripts/build-dev.test.mjs
```

The test must pass without changing the worktree. Failure, missing generated output, unexpected base-owned output, or byte mismatch blocks.

#### 7.4 Append Only After Clean Preflight, Then Recheck

Only the coordinator may append this exact line to the resolved owner's existing `## Coordinator Log`:

```text
- <UTC> - core-dogfood-baseline v1 terminal=<taskKey> head=<gitOid> src_tree=<gitTreeOid>
```

Use the resolved terminal durable key, `BASE_HEAD`, and `BASE_SRC_TREE`; do not store source or generated bytes. Append only after owner/terminal resolution, both immutable identity captures, all eight cleanliness queries plus fail-closed generated-path classification, current parity, and the final identity comparison have passed. Never rewrite an older line.

After the append and immediately before the first source mutation, repeat Sections 7.1 through 7.3 and both identity captures. Require the same owner path, terminal key and declaration, `BASE_HEAD`, `BASE_SRC_TREE`, empty boundary results, and passing parity. The coordinator-log append under `.dude/**` is the only expected pre-source difference and does not relax either owned boundary. A failed recheck leaves the appended line as stale audit history, authorizes no source write, and requires a later clean preflight and later baseline line.

#### 7.5 Hold One Serialized Interval

Once the recheck passes, the coordinator permits only one locally controlled core interval for that owner and terminal until materialization completes or the interval is abandoned. Do not start or overlap another `src/**` or base-owned generated-core mutation. A changed `HEAD`, changed terminal/declaration, unexpected source path, generated-core mutation before materialization, or observed or suspected concurrent activity invalidates the interval and blocks; do not infer which actor caused the change. Every accepted changed source path must remain inside the active declaration.

If a clean serialized boundary cannot be established, wait. An isolated worktree is only an offered fallback: create or use one only after explicit user opt-in, then execute the entire owner, terminal, identity, cleanliness, parity, append, and immediate-recheck contract afresh inside that worktree. Never transplant or retroactively create baseline evidence.

### 8. Post-Readiness Lifecycle In The Local Skill

The local skill loads only at terminal readiness. It first re-resolves the exact owner and live terminal, finds the existing matching project-contract baseline, and revalidates its `HEAD`, `HEAD:src`, declaration, serialized interval, source boundary, and generated boundary. It blocks on any missing, stale, mismatched, or retroactively proposed baseline. It never appends a replacement baseline, repairs an older line, or treats its own load time as the start of the interval.

#### Source Acceptance And Materialization

At terminal readiness, the local skill:

1. validates the exact owner, active declaration, baseline, completed source dependencies, and pre-promotion acceptance;
2. computes complete `declared`, `source`, and `changed` inputs;
3. requires every changed source path to be declared and the active declaration to equal the declaration being hashed;
4. immediately rechecks `HEAD`, declaration, source, changed rows, and generated preflight;
5. snapshots installed `dude-pack-*` artifacts, `.github/skills/project/**`, `.github/skills/dude-local-core-dogfood-promotion/**`, `.github/workflows/**`, and `.dude/**` as transient sorted path/type/content evidence after legitimate coordinator mutations;
6. runs repository `node scripts/build-dev.mjs` only when `changed` is nonempty;
7. proves exact expected generated inventory and bytes;
8. proves protected evidence is unchanged by the materializer.

Test-only source changes remain a nonempty `changed` set even when generated output is unchanged.

#### Final Acceptance And Close

The local skill requires focused tests, the recursively discovered full suite, Dude lint, compose verification, pristine external release build/lint, feature-scoped diff checks, final parity, and independent final review. The coordinator appends the accepted line only after `APPROVE`, immediately recomputes every bound identity, and closes only against the latest matching accepted line.

Drift after review or append leaves the prior line as stale audit history. Re-run affected verification, obtain fresh independent review, and append a later accepted line.

A missing baseline, undeclared path, declaration mismatch, post-review drift, generated drift, failed verification, or rejected review blocks without close or corrective mutation.

### 9. Fresh Authority Exercises

T003 performs current-session read-only exercises using the actual model-facing authorities.

#### Routing And Derivation Exercises

- Planned exact source writes produce one valid terminal stage.
- No planned source writes produce no normal terminal.
- A completed spec or dependency-incomplete terminal does not load the local skill or materialize.
- A fully ready terminal routes from the concise project convention to the exact local skill.
- The local skill's trigger and procedure are assessed without claiming static behavioral enforcement.
- Each malformed variant is independently reviewed: missing terminal, `[P]`, directory declaration, glob declaration, and missing contributing dependency.
- Clean, dirty, ignored, identity-drift, immediate-recheck, concurrency, and unapproved-worktree pre-source packets exercise the complete project baseline contract. Dirty packets retain ordinary staged-only and unstaged-only cases and add a temporary-Git cancellation case with `HEAD=A`, `B` staged in the index, and worktree bytes restored to `A`; the independent baseline predicates must reject both a source path and a base-owned generated-core representative.
- A terminal-ready packet with no matching pre-terminal baseline confirms that the local skill blocks instead of inventing or repairing evidence.

The independent Reviewer returns `REJECT` for every malformed variant.

#### Close Exercises

Supply transient close packets for missing baseline, undeclared changed path, active declaration differing from the bound declaration, source identity changed after review, generated projection drift, failed required verification, and Reviewer verdict `REJECT`.

The close authority blocks each packet without mutating files, task state, Beads, or logs. Results remain active-session evidence; no fixture, report, snapshot, helper, runtime, state, or ledger is persisted.

### 10. CI Verification Contract

Retain the T001 implementation that places `Dev-bundle drift check` directly after `actions/setup-node` and:

1. requires `git status --porcelain --untracked-files=all` to be empty;
2. rejects ignored entries under only `src`, `.github`, and `.dude`;
3. runs `node scripts/build-dev.mjs`;
4. requires the same Git-visible status to remain empty;
5. repeats the ignored-entry check for the same owned roots;
6. prints diagnostics and exits nonzero on failure;
7. performs no repair or remote mutation.

Top-level `permissions: contents: read` remains, checkout retains `persist-credentials: false`, and no commit/push/tag/release/publish/credential-bearing mutation step is allowed. Ignored `dist/` remains outside the named-root guarantee.

### 11. Static Contract Tests

Revise `scripts/current-format-contract.test.mjs` tests first so ownership follows the extraction.

Project-route assertions verify:

- one concise visible `## Core Dogfood Close` section;
- exact owner resolver and active-lane terminal rules;
- immutable `HEAD` and `HEAD:src` capture;
- independent index-versus-`HEAD`, worktree-versus-index, untracked, and ignored source/generated boundary checks using the shared ownership classifier and fail-closed generated-candidate classification;
- the named read-only parity check;
- the exact coordinator-owned baseline line, append-after-clean rule, and immediate full recheck;
- the serialized interval, concurrency block, no-attribution boundary, and explicit-user-opt-in worktree fallback;
- exact terminal-readiness language;
- the exact route to `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`;
- specification completion alone is not a trigger;
- the terminal/declaration/dependency convention remains visible;
- post-readiness evidence hashing, materialization, validation, and final-close procedure ownership is not duplicated there.

Local-skill assertions verify:

- exact `dude-local-core-dogfood-promotion` frontmatter identity;
- a description beginning with `Use when` and naming the ready terminal trigger;
- refusal to invent, repair, replace, or retroactively establish a baseline;
- lane, baseline-consumption, evidence-hashing, materialization, no-op, protected-boundary, validation, independent-review, latest-match, and failure clauses;
- project-only and non-shipped scope;
- no compiler, runtime, command, helper, state, ledger, Beads-note copy, or persistent report.

The test text explicitly says these assertions prove policy/contract coverage only. Existing CI predicate cases remain unchanged unless relocation of an assertion is required.

Temporary-Git baseline-predicate tests retain ordinary staged-only and unstaged-only rejection cases. They also commit bytes `A`, stage bytes `B`, then restore worktree bytes to `A` without resetting the index and require rejection despite the cancelling net `HEAD`-to-worktree view. Run that deterministic cancellation case for `src/example.txt` and for a base-owned generated-core representative such as `.github/skills/dude-example/SKILL.md`, with the generated candidate passing through the authoritative ownership classifier. Additional cases require rejection for staged deletion, staged type change, and an unmerged/conflict path. Any Git command or classifier failure fails the predicate rather than being interpreted as cleanliness.

### 12. Materializer Preservation Tests

Complete T002 in `scripts/build-dev.test.mjs` with a test-local transient snapshot recording sorted paths, path types, and exact content bytes for:

- installed `dude-pack-*` agents, instructions, prompts, and skills;
- nested `.github/skills/project/**`;
- `.github/skills/dude-local-core-dogfood-promotion/**` when present in the fixture;
- `.github/workflows/**`;
- nested `.dude/**` metadata, memory, ideas, specs, and state;
- expected base-owned generated core.

Prove all protected rows remain identical, every projectable source file appears at its exact destination with identical bytes, source tests have no generated destination, stale base-owned generated paths are removed, no unexpected generated path remains, and repeated materialization produces the same complete tree.

Modify `scripts/build-dev.mjs` only if the focused test first demonstrates a concrete production defect. Apply only the smallest repair and rerun the same focused test.

## This Feature's Bootstrap No-Source Acceptance

The implementation write set is:

- `.github/skills/project/SKILL.md`
- `.github/skills/dude-local-core-dogfood-promotion/SKILL.md`
- `.github/workflows/ci.yml`
- `scripts/current-format-contract.test.mjs`
- `scripts/build-dev.test.mjs`
- `scripts/build-dev.mjs` only if T002 proves a defect

It contains no `src/**` or base-owned generated-core path.

T003 uses `declared-src: none`, whose declaration hash input is `[]`, only for this package's explicit bootstrap terminal.

At T003 start:

1. execute the complete project baseline contract in Plan Section 7 for the explicit no-source bootstrap terminal;
2. append the baseline line only through the coordinator and complete the immediate recheck;
3. prove accepted T001/T002/T004 implementation paths are within the listed write set;
4. prove `changed` is `[]`;
5. do not invoke repository `node scripts/build-dev.mjs`;
6. run the fresh route, skill-trigger, Spec Lead, Reviewer, and close-packet exercises without persisting their reports;
7. run all required focused and full validation;
8. obtain independent final review over the exact final diff, evidence, and empty source change;
9. append the accepted line and immediately recompute all identities;
10. close only against the latest matching line.

The baseline and accepted lines are future coordinator execution writes, not part of this staged definition revision.

## Implementation Phases

### Phase 1: Existing Project Convention And CI Contract

T001 is complete. Its tests-first implementation established the detailed procedure in the project skill and the bounded early CI contract. Preserve that accepted implementation as the extraction source and historical foundation; do not reopen or transfer its state.

Focused evidence remains:

```bash
node --test scripts/current-format-contract.test.mjs
```

### Phase 2: Materializer Preservation Contract

Resume T002 after coordinator removal of its resolved external blocker. Complete the expanded fixture first in `scripts/build-dev.test.mjs` and verify:

```bash
node --test scripts/build-dev.test.mjs
```

Only a focused failing regression permits a minimal change to `scripts/build-dev.mjs`.

### Phase 3: Baseline Contract Retention And Local Procedure Extraction

T004 writes revised focused assertions first, creates the local skill, reduces the project skill to the concise complete pre-terminal contract and routing defined in Plan Sections 1 and 7, and updates only `scripts/current-format-contract.test.mjs` for ownership relocation. The local skill implements the post-readiness design in Plan Sections 5, 6, and 8.

Verification:

```bash
node --test scripts/current-format-contract.test.mjs
```

### Phase 4: Bootstrap And Live Authority Acceptance

After T001, T002, and T004 have accepted focused evidence:

```bash
node --test scripts/current-format-contract.test.mjs scripts/build-dev.test.mjs
find . -path ./dist -prune -o -name '*.test.mjs' -print0 | xargs -0 node --test
node .github/skills/dude-lint/lint.mjs .
node .github/skills/dude-compose/compose.mjs verify
```

Build and lint a pristine external release:

```bash
RELEASE_ROOT="$(mktemp -d)"
node scripts/build-release.mjs --out "$RELEASE_ROOT/pristine"
node "$RELEASE_ROOT/pristine/.github/skills/dude-lint/lint.mjs" "$RELEASE_ROOT/pristine"
```

Then run feature-scoped `git diff --check`, rerun the non-mutating parity test, prove no accepted `src/**` or base-owned generated-core delta, prove repository `build-dev` was not invoked as a feature mutation, run the fresh model-facing exercises, obtain independent final review, and append/recheck the accepted evidence line. Any failure leaves T003 open or blocked.

## Source Write Inventory

| Path | Planned mutation |
|---|---|
| `.github/skills/dude-local-core-dogfood-promotion/SKILL.md` | Create the project-only reusable terminal-readiness promotion procedure with matching skill identity and explicit trigger. |
| `.github/skills/project/SKILL.md` | Reduce the current large procedure to the concise complete pre-terminal baseline contract, terminal convention, and routing authority in Plan Sections 1 and 7. |
| `.github/workflows/ci.yml` | Preserve the accepted T001 verification-only early drift boundary; change only if a directly contradictory focused test requires it. |
| `scripts/current-format-contract.test.mjs` | Write extraction tests first and verify the concise route, local-skill contract, honest static-test boundary, and existing CI contract. |
| `scripts/build-dev.test.mjs` | Complete protected path/type/content, projection, source-test, stale-cleanup, and idempotence coverage. |
| `scripts/build-dev.mjs` | Conditional only after a focused T002 test demonstrates a production defect. |

No `src/**`, base-owned generated core, `library/packs/**`, technical-docs, release source/workflow, downstream, user-facing, shipped-skill, helper, or persistent state path is an implementation target.

The owner Coordinator Log may later receive its two bounded coordinator audit lines during T003. Those are not implementation writes or a new ledger.

## Requirements Traceability

| Requirements | Plan coverage | Tasks |
|---|---|---|
| FR-001 through FR-003 | Scope, terminal-ready trigger, and split procedure ownership | T004@e2a91f6c, T003@c4e6812d |
| FR-004 through FR-007 | Terminal derivation, review, no-source behavior, and lane authority | T001@8f2c1a47, T004@e2a91f6c, T003@c4e6812d |
| FR-008 through FR-012 | Complete pre-terminal baseline, serialization, worktree opt-in, and local-skill refusal | T001@8f2c1a47, T004@e2a91f6c, T003@c4e6812d |
| FR-013 through FR-021 | Bound evidence, materialization, preservation, verification, and failure blocks | T001@8f2c1a47, T002@5b7d930e, T004@e2a91f6c, T003@c4e6812d |
| FR-022 | Honest static checks and fresh authority exercises | T004@e2a91f6c, T003@c4e6812d |
| FR-023 | Verification-only CI | T001@8f2c1a47, T003@c4e6812d |
| FR-024 through FR-026 | Bootstrap and scope exclusions | T001@8f2c1a47, T002@5b7d930e, T004@e2a91f6c, T003@c4e6812d |

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| The project route and local skill disagree. | Keep the complete pre-terminal baseline contract and exact route in the project skill, keep post-readiness mechanics in the local skill, and test both section-aware contracts together. |
| The local skill is loaded before terminal readiness. | Put the negative trigger in both the concise route and local-skill preflight; exercise completed-spec and dependency-incomplete cases in T003. |
| Future model output violates the written convention. | Require independent definition readiness review and fresh terminal-routing exercises; do not treat static text as behavioral proof. |
| Pre-terminal baseline evidence is missing when the local skill loads. | Keep the complete executable baseline contract in always-available project guidance, test every required clause, and require the local skill to refuse missing or stale evidence instead of repairing it. |
| Static tests are mistaken for behavioral proof. | State and test their contract-only scope; run fresh model-facing exercises in T003. |
| Declaration differs between lanes. | Use canonical task text in Lightweight and corresponding Beads issue text after import; ignore the tracked mirror. |
| Evidence cannot be reconstructed after interruption. | Treat review/current-run data as transient and require fresh review plus a later accepted line. |
| Stale audit lines appear current. | Recompute identities and use only the latest fully matching line. |
| Dirty or concurrent source is swept into projection. | Require clean source/generated preflight and serialize the core interval; wait or use an approved worktree. |
| Canonicalization differs between actors. | Keep exact row shapes, ordering, encoding, and digest rules in the one local procedure. |
| CI overclaims filesystem coverage. | Limit the guarantee to Git-visible status plus ignored entries under three named roots; exclude ignored `dist/`. |
| A speculative materializer refactor expands risk. | Permit production changes only after a focused failing fixture. |
| Unrelated work breaks full validation. | Keep T003 open or blocked; do not clean, adopt, or reclassify that work. |
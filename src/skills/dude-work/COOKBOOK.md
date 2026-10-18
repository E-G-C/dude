# Work Driver Cookbook

`driver.mjs` in this directory runs autonomous Lightweight Work, including the Work portion of Ship, through the official setup adapter and runner. It claims one pending task, bridges the runner's challenges through files outside the workspace, builds and preflights each response with the official validators, captures attempt baselines, and reads one ownership pair. The coordinator keeps every semantic decision and dispatches the implementation, the Tester, and the independent Reviewer; the driver makes no model call and adds no command, grammar, lane, board, or project state. The Work skill in `SKILL.md` beside this file stays authoritative for policy, stops, and cleanup.

Run every command from the workspace root, where `--root .` names the workspace. `node .github/skills/dude-work/driver.mjs --help` prints the usage. The examples use these placeholders:

| Placeholder | Meaning |
|---|---|
| `<specPath>` | The owner's exact `spec_path:`, such as `.dude/specs/<NNN>-<slug>/spec.md` |
| `<taskKey>` | A canonical task key, such as `T001@a1b2c3d4` |
| `<claim>` | The claim directory that `claim` prints as `out` |
| `<exchange>` | The run directory that `run` prints as `dir` |
| `<scratch>` | A coordinator-owned directory outside the workspace for inputs, specialist records, baselines, and changed-path files |
| `<work arguments>` | The current invocation's Work arguments, such as `--policy autonomous`, or the controls Ship forwards: `--max unlimited --recover-on-block --recovery-cycles unlimited --policy autonomous` |

## Rules for the whole run

- Work is sequential: one task, one `run` process, and one outstanding challenge at a time.
- While a claim is held, from `claim` until `run` finishes, never edit the Inspection sources: the owner idea, `spec.md`, `plan.md`, `tasks.md`, and `.dude/state/task-state.json`. Drift refuses or hard-stops.
- Keep every run file outside the workspace: claim and exchange directories, Assessment inputs, specialist records, baselines, and changed-path files. Use fresh directories for every run and never reuse one. Specialists keep their scratch output outside the workspace too; otherwise `diff` reports it as a change.
- Publish responses only through `assess` and `respond`. They validate first and publish nothing on failure. Never write or edit a response file by hand.
- Never edit a task glyph, use the board helper's write commands, or append the claim line yourself. The official lane effects write the glyph, the snapshot, lane history, and the claim line.
- The driver runs no Git command, and nothing in this procedure commits or pushes.

## Subcommands and exit codes

| Subcommand | Purpose | Exit codes other than 0 |
|---|---|---|
| `claim` | Recheck admission and claim one pending task | 2, 3, or 4 refused; 5 stopped (section 2) |
| `run` | Run the official runner and bridge its challenges through files | 1 runner hard stop; 2 refused before the runner started |
| `assess` | Build, validate, and publish one Assessment response | 1 refused; nothing published |
| `respond` | Preflight and publish the specialist pair, or only the cancel envelope with `--cancel` | 1 refused; nothing published |
| `snapshot` | Capture the attempt baseline | 1 refused; nothing written |
| `diff` | Report the attempt's changed paths and check them against the authorization | 1 refused; nothing written |
| `ownership` | Read the official store's status for one workspace-target pair | 1 pair present; 2 refused or probe failed |

Every subcommand exits 64 on a usage error and 70 on an unexpected failure, with the stack on stderr. A refusal prints one JSON object with `"ok": false`, a `refused` message, and details such as `hint` or `unauthorized`. `run` exits 0 for every `ended` outcome, so read its `reason` before you continue.

## What each step writes

| Step | Workspace writes | Outside the workspace |
|---|---|---|
| Selection | None | None |
| `claim` | Only through the official lane effect: `[ ]` to `[~]` in `tasks.md`, the task-state snapshot glyph and time, and one owner log line, `- <UTC> - work: Claimed <taskKey> for the user-authorized autonomous Work invocation; implementation has not started.` | `<claim>/setup-report.json`, `supervisor.json`, and on success `runner-request.json`; a setup ownership pair that setup removes again |
| `run` | Only through the runner's lane effects: one `dude-run-event` approach line per recorded attempt, plus finding or governance lines, under `## Lightweight Execution History` in `tasks.md`; at settlement `[~]` to `[x]` and the snapshot glyph. The runner writes no owner log line. | The `<exchange>` files; the ownership pair, held during the run, cleared at an `ended` outcome, and possibly left by a hard stop |
| `assess`, `respond` | None | `response-<n>.json` beside its challenge |
| `snapshot`, `diff` | None | The `--out` file |
| `ownership` | None | None |
| Implementation, Tester, Reviewer | Only paths in the pending authorization | Their records and scratch output |
| Close | One close event line in the owner log, appended by the coordinator while no claim is held | None |

## 1. Select the next task

Selection is read-only and uses the existing readers.

1. Run `bd list --all --limit 0 --json`. Any imported issue means Tracked Execution owns the work: stop, with no Lightweight fallback. Missing, uninitialized, or empty Beads leaves Lightweight.
2. Resolve the owner. `select` returns the exact idea for a selector, and `resolve` must return exactly one owner for its spec path:

   ```text
   node .github/skills/dude-engine/feature.mjs select --root . --slug <slug> --json
   node .github/skills/dude-engine/feature.mjs resolve --root . --spec <specPath> --json
   ```

   Require `"status": "defined"` on the selected idea and carry its returned `ideaPath` and `specPath` unchanged. Any diagnostic, including a warning that exits 0, or a missing owner is `ambiguous state`. Without a selector, `inventory --root . --json` lists the defined owners, and more than one candidate with open tasks is ambiguous.
3. Read the board:

   ```text
   node .github/skills/dude-lightweight-execution/board.mjs parse .dude/specs/<NNN>-<slug>/tasks.md --json
   node .github/skills/dude-lightweight-execution/board.mjs next .dude/specs/<NNN>-<slug>/tasks.md
   ```

   `parse --json` must report no `warnings`. An unblocked `[~]` task comes before any new claim, and this procedure has no resume command, so stop and report it. `next` prints the first ready task key, or nothing, which is the `no ready task` natural stop.

`claim` repeats these checks itself before any mutation. It also requires the exact breadcrumb `<!-- audit log: <ideaPath>#coordinator-log -->` in `tasks.md`, completed dependencies, the first-ready order, an owner file that ends with LF, and a fresh Inspection with no blockers, no overflow, and no missing retained-occurrence evidence.

## 2. Claim the task

For the first task of the invocation:

```text
node .github/skills/dude-work/driver.mjs claim --root . --spec <specPath> --task <taskKey> -- <work arguments>
```

Everything after `--` goes unchanged to the Work invocation parser. The driver refuses any policy other than `autonomous`, and a feature selector in those arguments must resolve to the same owner. `--out <dir>` names a new claim directory outside the workspace; without it, `claim` creates a fresh `dw-XXXXXX` directory under the operating system temporary directory. `--state` is only for continuation (section 8).

The claim runs in a fixed order. It mints a one-shot setup supervisor identity and keeps it in `supervisor.json`, outside the checkpoint. Through the setup adapter it runs `fresh-inspection`, `authorize-lane-effect` with the `initial-claim` mutation, `apply-lane-effect`, and `commit-lane-receipt`. The committed receipt settles setup, so `settle-effect` is never called. Setup then ends with `controlled-end`, the official store must report the pair absent, and the driver rereads the exact owner, task mapping, and unblocked `[~]` before it publishes `runner-request.json` with the unchanged accepted state. A refused step gets the adapter's one correction, then a fresh Inspection and one retry.

On success `claim` prints `"exitCode": 0` with `out`, `report`, and `runnerRequest`. `setup-report.json` records the stage, every adapter step, the permit and receipt hashes, the claim line, and the pair status.

| Exit | Meaning | Next |
|---|---|---|
| 2 | Refused before any claim. The `stage` is one of `invocation`, `policy`, `target`, `lane`, `owner`, `selector`, `state`, `tasks`, `task`, `owner-log`, or `inspection`. A refused `--root` or `--out` also exits 2 and writes no report. | Report the stop; nothing was written to the workspace |
| 3 | Adapter admission refused, for example because an ownership pair already exists for this task | Report it; a present pair follows section 9 |
| 4 | Refused before any lane write; setup cancelled its own pair and proved it absent | Report the stop |
| 5 | Stopped after a lane write was entered, or the setup pair could not be released | Hard stop: read `pair` and `ownership` in the report, then section 9 |

## 3. Run the exchange

Start `run` as an attached asynchronous shell command, never detached, and leave it running until it finishes:

```text
node .github/skills/dude-work/driver.mjs run --request <claim>/runner-request.json
```

`--dir <dir>` names a new exchange directory outside the workspace; without it, `run` creates a fresh `dw-XXXXXX` directory under the operating system temporary directory. `--retained-evidence <file>` is described in section 7. The process runs the official runner in place and prints one JSON line per event: `started` with `pid`, `dir`, and `status`; `input-required` for each challenge with `n`, `kind`, `challenge`, `packet`, and `response`; and `finished` with the terminal fields. It waits for each response without a timeout. Do not stop the process while it waits; answer the challenge or cancel it (section 6).

`<exchange>/status.json` holds the current `state`: `running`, `waiting` with the current challenge, or `finished` with the terminal fields. Answer only the newest `n`, exactly once.

| File in `<exchange>` | Written | Content |
|---|---|---|
| `status.json` | At every state change, replacing the previous file | `state`, `pid`, `updatedAt`, and the current challenge or the terminal fields |
| `challenge-<n>.json` | Once per challenge | The runner's bound challenge: `kind`, `target`, `stateBase64`, `stateHash`, `inspection`, `challengeIdentity`, and, for a `specialist-pair`, `assessmentIdentity` |
| `packet-<n>.json` | For `assessment` and `learning-review` challenges | The `dude-work-model-view-v1` model packet |
| `response-<n>.json` | By `assess` or `respond` | The matching response or cancel envelope |
| `result.json` | At the end | The complete runner result, including `steps`, `haltReport`, and any blocker, capacity, cleanup, and ownership fields |
| `accepted-state.json` | Only after `ended`/`task-settled` | The settled state for the next claim in the same invocation |
| `retained-evidence.json` | When the runtime received capture inputs | The original `currentRun`, `verification`, `review`, and `lint` captures |

Each file appears complete because the driver writes a sibling temporary file and renames it into place.

## 4. Answer an `assessment` challenge

Read `packet-<n>.json` and the task unit in `tasks.md`, including its writer paths, acceptance commands, and scope. On a recovery Assessment the packet also carries the failed attempt's checks and findings. Write the input in `<scratch>` with exactly these six fields:

```json
{
  "action": "execute-task",
  "targets": [
    ".github/skills/widget/SKILL.md",
    "docs/widgets.md",
    "src/skills/widget/SKILL.md",
    "src/widget.mjs",
    "src/widget.test.mjs"
  ],
  "summary": "Reject an empty widget name before saving, add its regression test, update the guide, and regenerate the installed skill copy.",
  "intent": "unchanged",
  "equivalence": "none",
  "retention": "transient"
}
```

| Field | Rule |
|---|---|
| `action` | `execute-task` on the first attempt. After `verification-failed`, use `retry-task` (checks `verification`) or `address-test` (checks `lint` and `verification`; the Tester record also serves as the lint capture). After `review-rejected`, use `address-review` (checks `review` and `verification`). A recovery action on a first attempt, or `execute-task` on a recovery attempt, hard-stops as `invalid-action`. `assess` refuses `none` and `reconcile-derived-definition`; answer with `respond --cancel` instead. |
| `targets` | The complete writer set, canonical and sorted, as described below |
| `summary` | 1 to 1,024 UTF-8 bytes describing the concrete approach for this Inspection |
| `intent` | `unchanged`. `assess` refuses `changed` and `ambiguous`; that is a clarification stop, so cancel and report it. |
| `equivalence` | `none` on the first attempt and `distinct` for a materially different recovery attempt. `assess` refuses `same` and `equivalent`, which stop autonomous authorization as evidence-incomplete. |
| `retention` | `transient`. Durable retention goes through the memory and skill owners. |

The complete writer set lists every path the attempt may write: implementation files, Tester edits, generated copies and other derived deliverables, docs, and any path the task marks as conditional. For read-only work, name the artifacts actually inspected. Never pad the list. Each target is workspace-relative, uses forward slashes, and has no `./`, `..`, empty segment, or trailing slash. The list holds at least one path, has no duplicates, and is sorted in UTF-8 byte order, so `.github/` sorts before `README.md`, which sorts before `docs/`. `assess` repairs nothing, so rewrite task-file paths that use backslashes or carry annotations. The authorized set must also fit the 16,384-byte approach event; a larger set is refused, never trimmed.

```text
node .github/skills/dude-work/driver.mjs assess --root . --challenge <exchange>/challenge-<n>.json --input <scratch>/assessment-<n>.json
```

`assess` derives `evidenceHash` from the challenge's Inspection, `operations` from the action, and `checks` from the action's fixed check set. It validates the built Assessment with `validateAssessment(target, inspection, assessment)` and the material-input validator, publishes `response-<n>.json`, and prints the `assessmentIdentity`. A refusal prints the reason and a `hint` and publishes nothing.

The runner then re-inspects and authorizes. Evidence drift gets one correction or a fresh Inspection and then a new `assessment` challenge. Other authorization refusals, such as `invalid-action`, `recovery-disabled`, or an exhausted budget, are hard stops.

## 5. Implement only after the `specialist-pair` challenge

The `specialist-pair` challenge appears only after the runner has authorized the attempt, and it is the dispatch signal. Its `assessmentIdentity` matches the one `assess` printed, and the authorized writer set is that Assessment's `targets`, held in the challenge state as the single pending authorization. Nothing changes the workspace for this attempt before this point.

1. Take the baseline first, before any implementation or specialist edit:

   ```text
   node .github/skills/dude-work/driver.mjs snapshot --root . --out <scratch>/baseline-<n>.json
   ```

   The snapshot hashes every authored and generated file, records links without following them, and skips `.git` and `node_modules`. A file that was already dirty belongs to the baseline, so only a further change counts against this attempt. Take a new baseline at every `specialist-pair` challenge, including recovery attempts.
2. Route the implementation with exactly the authorized writer set. Then dispatch the Tester and an independent Reviewer. Save each sole structured record unchanged in `<scratch>`.
3. Check the actual changes against the authorization:

   ```text
   node .github/skills/dude-work/driver.mjs diff --root . --baseline <scratch>/baseline-<n>.json --challenge <exchange>/challenge-<n>.json --out <scratch>/changed-<n>.json
   ```

   `diff` prints each change as `{ "path": "src/widget.mjs", "change": "modified" }`, using `added`, `modified`, or `deleted`, and writes the sorted path array, such as `["src/widget.mjs", "src/widget.test.mjs"]`, to `--out`. If any changed path falls outside the authorization, `diff` exits 1, lists every such path under `unauthorized`, and writes no file. Do not respond then. Route the scope issue through ordinary Work; the authorization is never widened and the path is never hidden. If the attempt cannot continue inside its authorization, cancel (section 6) and report the stop.
4. Preflight and publish the actual pair (section 6).

## 6. Answer a `specialist-pair` challenge, or cancel

```text
node .github/skills/dude-work/driver.mjs respond --root . --challenge <exchange>/challenge-<n>.json --tester <scratch>/tester-<n>.json --reviewer <scratch>/reviewer-<n>.json --changed <scratch>/changed-<n>.json
```

The Tester record holds 1 to 16 checks with unique `definition` values, and every string holds 1 to 16,384 UTF-8 bytes. Keep failed rows. The 16-row limit is a ceiling, never permission to drop, trim, or merge obligations, and a skipped or zero-test run is not a passed check.

```json
{
  "checks": [
    {
      "definition": "node --test src/widget.test.mjs",
      "outcome": "passed",
      "evidence": "exit 0; tests 12, pass 12, fail 0, skipped 0"
    },
    {
      "definition": "node .github/skills/dude-lint/lint.mjs .",
      "outcome": "failed",
      "evidence": "exit 1; 1 failure: .github/skills/widget/SKILL.md frontmatter is missing 'description:'"
    }
  ]
}
```

An accepted review has no findings:

```json
{ "verdict": "accepted", "findings": [] }
```

A rejected review has 1 to 16 findings. `subjects` holds 1 to 16 unique strings of at most 128 bytes each, using forward slashes and no control characters. `failureClass` is a lowercase canonical identifier matching `^[a-z0-9][a-z0-9._:/@-]{0,127}$`, so uppercase letters are refused. `expectation.kind` is `governing-rule` or `expected-condition`. An `observed-evidence` observation carries its evidence text. A `check-result` observation carries nothing else, and its `checkDefinition` must equal one Tester `definition` exactly.

```json
{
  "verdict": "rejected",
  "findings": [
    {
      "basis": {
        "expectation": { "kind": "governing-rule", "reference": "Task scope: reject an empty widget name before any write." },
        "subjects": ["src/widget.mjs:40-52"],
        "failureClass": "missing-input-validation",
        "checkDefinition": "node --test src/widget.test.mjs"
      },
      "observation": { "kind": "observed-evidence", "evidence": "save('') writes widget.json before the name check runs." }
    },
    {
      "basis": {
        "expectation": { "kind": "expected-condition", "reference": "Lint reports 0 failures." },
        "subjects": [".github/skills/widget/SKILL.md"],
        "failureClass": "lint-failure",
        "checkDefinition": "node .github/skills/dude-lint/lint.mjs ."
      },
      "observation": { "kind": "check-result" }
    }
  ]
}
```

`respond` derives the outcome from the evidence, with no override:

| Evidence | `outcome` | Runner disposition |
|---|---|---|
| Any failed check | `failed` | `verification-failed` |
| No failed check and a rejected review | `blocked` | `review-rejected` |
| Otherwise, with changed paths | `succeeded` | `completed` |
| Otherwise, with `[]` changed | `no-change` | `completed` |

`operations` come from the pending authorization, and the records reach the runner exactly as read, with nothing cloned, repaired, or normalized first. Before publishing, `respond` runs the official preflight, `prepareSpecialistResult(acceptedState, result)` and `validateHostAdapterRequest` for the `record-attempt-result` request, against the challenge's accepted state. A refusal publishes nothing; have the owning specialist correct its record, then run `respond` again. The runner repeats every check at use, and the changed set must fit the 16,384-byte result material.

A failed or blocked result is progress, not a stop. The runner records the attempt in lane history and issues a new `assessment` challenge whose packet carries the failed checks and findings. With recovery enabled (`--recover-on-block` in the Work arguments) and budget left, answer it with a recovery action and `distinct` (section 4). Otherwise cancel and report `verification failed on <taskKey>` or `reviewer rejected <taskKey>`.

To cancel any challenge, publish its bound cancel envelope:

```text
node .github/skills/dude-work/driver.mjs respond --root . --challenge <exchange>/challenge-<n>.json --cancel
```

The runner performs its permitted cancellation and returns `ended`/`cancelled`. It clears the pair, the task stays `[~]`, and no `accepted-state.json` is written. The driver deletes nothing itself. Cancellation ends Work for this invocation.

A `learning-review` challenge appears only after a proven repeat, and the driver has no learning-review response maker. Answer it with `respond --cancel`, then report that learning review is required and name the learning-governance owner as the next action.

## 7. Read the terminal result

When `run` finishes, read `<exchange>/status.json` or the `finished` event. Both carry `outcome`, `reason`, and `haltReport`; `detail`, `blocker`, `capacity`, `cleanup`, `cleanupReason`, `orphan`, and `ownership` when the runner returned them; and the paths of `result.json`, `accepted-state.json`, and `retained-evidence.json`, with `null` for a file that was not written.

| `outcome` / `reason` | `run` exit | Meaning | Next |
|---|---|---|---|
| `ended` / `task-settled` | 0 | `[x]` applied, completion receipt committed, final audit done, pair cleared, `accepted-state.json` written | Continue in the same invocation (section 8) |
| `ended` / `cancelled` | 0 | The runner accepted the cancel and cleared the pair; the task stays `[~]` | Stop and report; select no next task in this invocation |
| `ended` / another reason | 0 | The runner ended without settling the task | Stop and report the reason and the next owner action |
| `hard-stop` / any reason | 1 | A named or unresolved halt | Stop and report `reason`, `detail`, `haltReport`, `blocker`, `capacity`, and the cleanup fields. Never retry silently. Check the pair (section 9). |
| Refused before the runner started | 2 | An unreadable request, a missing workspace, a reused or in-workspace `--dir`, or a second retained-evidence source | Nothing ran and nothing was written; correct the input |

A resolved `haltReport` names `reason`, `stopClass`, `target`, `subject`, `nextAction`, and `evidenceHash`; an unresolved one lists its `unresolved` fields. The stop class fixes the next action:

| `stopClass` | `nextAction` |
|---|---|
| `hard-stop` | `request-human-input` |
| `recoverable-checkpoint` | `inspect-and-recover` |
| `budget-stop` | `raise-budget-or-end-run` |
| `learning-stop` | `resolve-learning-governance` |
| `guard-stop` | `correct-request-and-reinspect` |

`cleanup` and `orphan` describe resources only, never execution success. A state returned in `result.json` after a cancel or hard stop is evidence; it never becomes continuation state.

`retained-evidence.json` holds the original capture inputs the runtime actually received, in received order and with duplicates, copied without change. A stop during a later capture keeps every earlier attempt's captures. Never edit, merge, rebuild, or normalize the file, and never fill a gap from packets, stdout, lane history, or a checkpoint. It is the existing handoff for a separately authorized fresh request whose task already has attempts in its lane history: pass it with `run --retained-evidence <file>`. The driver refuses a request that already carries `retainedEvidence`, and the runner validates provenance and every limit again before it takes ownership. Without the required captures the runner refuses admission, for example as `hard-stop`/`evidence-incomplete` with the detail `retainedEvidence: missing current-run`. This procedure starts no such request, because `claim` only claims a pending task. If the captures are unavailable, report that source as unavailable and keep the stop.

## 8. Continue in the same invocation

Only `ended`/`task-settled` continues, and only inside the same invocation while it remains authorized.

1. Confirm the pair is gone; `ownership` exits 0 with `"status": "absent"`:

   ```text
   node .github/skills/dude-work/driver.mjs ownership --root . --spec <specPath> --task <taskKey>
   ```

2. Run the read-only lint, `node .github/skills/dude-lint/lint.mjs .`.
3. Select the next ready task (section 1). `no ready task` is the natural stop.
4. Claim it with the settled state and the same Work arguments:

   ```text
   node .github/skills/dude-work/driver.mjs claim --root . --spec <specPath> --task <nextTaskKey> --state <exchange>/accepted-state.json -- <work arguments>
   ```

`claim` accepts `--state` only when the sibling `result.json` reports `ended`/`task-settled`, the state equals the state that result returned, its policy equals the parsed Work arguments, and it holds no pending work, completion, or learning. These files are transport evidence and cannot show that the invocation is still authorized. The next task takes a fresh claim and a fresh ownership pair, and its accounting carries forward unchanged. After a cancel, any other end, or a hard stop, do not continue.

## 9. Stops and the manual cleanup boundary

| Situation | Report |
|---|---|
| Imported Beads issues | Tracked Execution owns the work; never fall back to Lightweight |
| Unclear lane or owner, a resolver diagnostic, or unreadable Beads | `ambiguous state: <detail>` |
| `next` prints nothing | `no ready task` |
| An unblocked `[~]` task blocks the claim | The in-progress task; this procedure has no resume command |
| `claim` exit 2, 3, or 4 | The refusal's `stage` and `detail` |
| Changed or ambiguous intent | Cancel, then `clarification required: <detail>` |
| Failed verification or rejected review without recovery | Cancel, then `verification failed on <taskKey>` or `reviewer rejected <taskKey>` |
| `learning-review` challenge | Cancel, then report that learning review is required |
| `claim` exit 5 or a `run` hard stop | The reason, `haltReport`, and resource fields, then the cleanup boundary below |

The driver has no cleanup command and never removes an ownership pair. After a hard stop or a `claim` exit 5:

1. Read the exact pair with `ownership`. Exit 0 (`absent`) leaves nothing to remove; Work still stops and the task keeps its glyph. Exit 1 (`loaded` or `corrupt`) means the pair remains, and it blocks every later claim of this task.
2. Report a remaining pair and hand the decision to the user or operator.
3. Manual removal can follow only after the user or operator independently confirms that no invocation or coordinator supervisor remains for that key. It then follows the exact-pair procedure in the Work skill's `## Checkpoint Lifecycle And Manual Cleanup`, including its post-clean absence proof.

A PID, a process age, a timestamp, a saved state file, or an `ownership` result grants no cleanup, takeover, or continuation authority. Cleanup never resumes the stopped run, revives its state, or starts another task. A later run needs a separate explicit request and fresh admission.

## 10. Close out

The runner writes no task-close log line, and the driver has no close command. Append the close outcome only while no claim is held, after `run` has finished and `ownership` reports the last task's pair absent. The coordinator closes through its ordinary close protocol: it appends the close outcome as one UTC event line to the owner's `## Coordinator Log`, one feature close line for a finished feature, and runs lint. When the invocation closed at least one task, its final response carries the `## Completion Closeout` block once, even if later work stopped. Nothing in this procedure commits, pushes, or runs any other Git operation.

## Pitfalls

- On Windows, `status.json` is replaced by a rename at every state change, so a read that races the replacement can fail briefly, for example with ENOENT or EPERM. Retry the read instead of treating it as a stop. Read the file in one short operation and never hold it open: an open handle blocks the replacement, and a block that lasts about a minute can stop the run as `exchange-context-lost`.
- Write every input file as UTF-8 without a byte-order mark; the driver refuses a BOM-prefixed file as not JSON. When you build JSON with PowerShell's `ConvertTo-Json`, pass `-Depth 10`, because the default depth truncates nested findings.
- Neither the runner nor the driver has a response timeout, so long specialist work is fine. Losing the coordinator session or the attached `run` process is a hard stop that leaves the pair in place. This runner has no handoff or resume.
- Answer only the newest challenge, and only through `assess` or `respond`. A response bound to another challenge stops the run as `challenge-response-foreign` or `challenge-response-replayed`, a wrong kind as `challenge-response-out-of-order`, and a malformed envelope as `challenge-response-invalid`; each keeps the pair.
- `assess` and `respond` write `response-<n>.json` beside the file named `challenge-<n>.json`, so pass the challenge file in `<exchange>` itself. A second response to the same challenge is refused, and the first response stays untouched.
- One run answers at most 75 challenges under `--max unlimited`, or three times the `--max` value plus one. The next challenge stops the run as `challenge-budget-exhausted`.
- The model packet is limited to 256 KiB. An overflowing Inspection is a descriptor-only `evidence-incomplete` stop with no retry or splitting, and `claim` and `assess` both refuse one. Passing `respond` preflight does not prove the evidence fits: a large record can still overflow the packet when the runner captures it, which stops the run as `evidence-incomplete`.

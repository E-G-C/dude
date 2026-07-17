#!/usr/bin/env node
// @ts-check
/**
 * board.mjs — thin CLI over the `tasks.md` engine (`dude-engine/lib/tasks.mjs`).
 *
 * Deterministic read/derive/mutate for the Lightweight Execution board. The
 * coordinator calls these subcommands instead of hand-parsing `tasks.md`.
 *
 *   parse  <tasks.md> [--json]                  structured parse (+ warnings)
 *   ready  <tasks.md> [--json]                  ready-now task list
 *   next   <tasks.md>                           the single top ready task id
 *   render <tasks.md> [--stdout|--check|--write] regenerate the fenced board
 *   set    <tasks.md> <id> <state> [--write] [--blocked-by "..."]
 *   apply-states <tasks.md> --from <map.json> [--write]   batch glyph sync
 *   diff   <tasks.md> [--json]                  human-applied [x] vs snapshot
 *
 * Non-mutating by default. `--write` rewrites the file AND refreshes the
 * coordinator-state snapshot at <root>/.dude/state/task-state.json.
 *
 * Flags: --root <dir> (default cwd; anchors the snapshot key), --json.
 * Exit codes: 0 ok, 1 usage, 2 operation error, 3 `render --check` found stale.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseTasks,
  readyTasks,
  nextTask,
  renderBoard,
  boardIsStale,
  setTaskState,
  applyStates,
  glyphsOf,
  diffAgainstSnapshot,
} from '../dude-engine/lib/tasks.mjs';
import {
  readTaskState,
  upsertTaskStateEntry,
} from '../dude-engine/lib/task-state.mjs';
import {
  WORKSPACE_PATHS,
  resolveMutationPath,
} from '../dude-engine/lib/workspace-paths.mjs';

/** @param {ReturnType<typeof parseTasks>} parsed @param {string} id @returns {string[]} */
function taskUnitLines(parsed, id) {
  const task = parsed.byId.get(id);
  if (!task) return [];
  let endLine = task.headerLine + 1;
  while (endLine < parsed.lines.length && /^\s+\S/.test(parsed.lines[endLine])) endLine++;
  return parsed.lines.slice(task.headerLine, endLine);
}

/** @param {string[]} before @param {string[]} after @returns {{before:string[],after:string[]}} */
function changedSpan(before, after) {
  let prefixLength = 0;
  while (
    prefixLength < before.length
    && prefixLength < after.length
    && before[prefixLength] === after[prefixLength]
  ) prefixLength++;

  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength
    && suffixLength < after.length - prefixLength
    && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) suffixLength++;

  return {
    before: before.slice(prefixLength, before.length - suffixLength),
    after: after.slice(prefixLength, after.length - suffixLength),
  };
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {any} */
  const out = { root: process.cwd(), json: false, stdout: false, check: false, write: false, help: false };
  /** @type {string[]} */
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--stdout') out.stdout = true;
    else if (a === '--check') out.check = true;
    else if (a === '--write') out.write = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--from') out.fromPath = argv[++i];
    else if (a === '--blocked-by') out.blockedBy = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else pos.push(a);
  }
  out.cmd = pos[0];
  out.file = pos[1];
  out.id = pos[2];
  out.state = pos[3];
  return out;
}

const HELP = `board — tasks.md engine CLI

Usage:
  node board.mjs parse  <tasks.md> [--json]
  node board.mjs ready  <tasks.md> [--json]
  node board.mjs next   <tasks.md>
  node board.mjs render <tasks.md> [--stdout|--check|--write]
  node board.mjs set    <tasks.md> <id> <state> [--write] [--blocked-by "..."]
  node board.mjs apply-states <tasks.md> --from <map.json> [--write]
  node board.mjs diff   <tasks.md> [--json]

Flags: --root <dir> (snapshot anchor, default cwd), --json
`;

/** @param {any} args @returns {number} exit code */
function run(args) {
  if (args.help || !args.cmd || !args.file) {
    process.stdout.write(HELP);
    return args.help ? 0 : 1;
  }
  const file = path.resolve(args.file);
  if (!fs.existsSync(file)) {
    process.stderr.write(`[FAIL] file not found: ${args.file}\n`);
    return 2;
  }
  const root = path.resolve(args.root);
  const relKey = path.relative(root, file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');
  const parsed = parseTasks(content, { path: file });
  if (parsed.boardIssue) {
    if (args.cmd === 'parse' && args.json) {
      process.stdout.write(`${JSON.stringify({
        tasks: parsed.tasks,
        warnings: parsed.warnings,
        boardIssue: parsed.boardIssue,
        diagnosticTaskLines: parsed.diagnosticTaskLines,
      }, null, 2)}\n`);
    } else {
      process.stderr.write(`[FAIL] ${parsed.boardIssue}\n`);
      if (args.cmd === 'parse') {
        for (const diagnostic of parsed.diagnosticTaskLines) {
          process.stderr.write(`[DIAG] line ${diagnostic.line}: ${diagnostic.text}\n`);
        }
      }
    }
    return 2;
  }
  if (args.write && !/^\.dude\/specs\/[^/]+\/tasks\.md$/.test(relKey)) {
    process.stderr.write('[FAIL] writes require .dude/specs/<feature>/tasks.md\n');
    return 2;
  }
  if (args.write) {
    try {
      resolveMutationPath(root, relKey);
      resolveMutationPath(root, WORKSPACE_PATHS.TASK_STATE);
    } catch (error) {
      process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`);
      return 2;
    }
    const cur = readTaskState(root);
    if (cur.status === 'corrupt') {
      process.stderr.write(`[FAIL] corrupt task-state snapshot: ${cur.reason}\n`);
      return 2;
    }
  }

  switch (args.cmd) {
    case 'parse': {
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ tasks: parsed.tasks, warnings: parsed.warnings }, null, 2)}\n`);
      }
      else {
        for (const t of parsed.tasks) process.stdout.write(`[${t.glyph}] ${t.id} ${t.description}\n`);
        for (const w of parsed.warnings) process.stdout.write(`[WARN] ${w}\n`);
      }
      return 0;
    }
    case 'ready': {
      const ready = readyTasks(parsed);
      if (args.json) process.stdout.write(`${JSON.stringify(ready.map((t) => t.id), null, 2)}\n`);
      else if (ready.length === 0) process.stdout.write('(no ready tasks)\n');
      else for (const t of ready) process.stdout.write(`${t.id} ${t.description}\n`);
      return 0;
    }
    case 'next': {
      const t = nextTask(parsed);
      if (t) process.stdout.write(`${t.id}\n`);
      return 0;
    }
    case 'render': {
      const rendered = renderBoard(parsed);
      if (args.check) {
        const stale = boardIsStale(parsed);
        process.stdout.write(stale ? '[STALE] board differs from a fresh render\n' : '[OK] board up to date\n');
        return stale ? 3 : 0;
      }
      if (args.write) {
        fs.writeFileSync(file, rendered);
        upsertTaskStateEntry(root, relKey, glyphsOf(parseTasks(rendered)));
        process.stdout.write(`[OK] rendered board in ${args.file}\n`);
        return 0;
      }
      process.stdout.write(rendered); // default: --stdout
      return 0;
    }
    case 'set': {
      if (!args.id || !args.state) {
        process.stderr.write('[FAIL] set requires <id> <state>\n');
        return 1;
      }
      let result;
      try {
        result = setTaskState(parsed, args.id, args.state, args.blockedBy != null ? { blockedBy: args.blockedBy } : {});
      } catch (err) {
        process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
        return 2;
      }
      if (args.write) {
        fs.writeFileSync(file, result.content);
        upsertTaskStateEntry(root, relKey, glyphsOf(parseTasks(result.content)));
        process.stdout.write(`[OK] ${args.id} set to "${args.state}" in ${args.file}\n`);
        return 0;
      }
      const afterParsed = parseTasks(result.content, { path: file });
      const changed = changedSpan(
        taskUnitLines(parsed, result.task.id),
        taskUnitLines(afterParsed, result.task.id),
      );
      for (const line of changed.before) process.stdout.write(`- ${line}\n`);
      for (const line of changed.after) process.stdout.write(`+ ${line}\n`);
      process.stdout.write('(dry run; pass --write to apply)\n');
      return 0;
    }
    case 'apply-states': {
      if (!args.fromPath) {
        process.stderr.write('[FAIL] apply-states requires --from <map.json>\n');
        return 1;
      }
      /** @type {Record<string,string>} */
      let statesMap;
      try {
        statesMap = JSON.parse(fs.readFileSync(args.fromPath, 'utf8'));
      } catch (err) {
        process.stderr.write(`[FAIL] cannot read map: ${err instanceof Error ? err.message : String(err)}\n`);
        return 2;
      }
      const result = applyStates(parsed, statesMap);
      if (args.write) {
        fs.writeFileSync(file, result.content);
        upsertTaskStateEntry(root, relKey, glyphsOf(parseTasks(result.content)));
        process.stdout.write(`[OK] applied ${result.applied.length} state(s) in ${args.file}\n`);
      } else {
        process.stdout.write(`${result.applied.length} state(s) would change (dry run; pass --write)\n`);
      }
      for (const id of result.unknown) process.stdout.write(`[WARN] unknown task id in map: ${id}\n`);
      return 0;
    }
    case 'diff': {
      const cur = readTaskState(root);
      if (cur.status === 'corrupt') {
        process.stderr.write(`[FAIL] corrupt task-state snapshot: ${cur.reason}\n`);
        return 2;
      }
      const snap = cur.status === 'ok' ? cur.state[relKey]?.glyphs : undefined;
      const d = diffAgainstSnapshot(parsed, snap);
      if (args.json) process.stdout.write(`${JSON.stringify(d, null, 2)}\n`);
      else if (!d.baseline) process.stdout.write('(no snapshot baseline yet)\n');
      else if (d.unexpectedDone.length === 0) process.stdout.write('[OK] no human-applied [x] without a recorded baseline\n');
      else for (const id of d.unexpectedDone) process.stdout.write(`[UNVERIFIED-DONE] ${id}\n`);
      return 0;
    }
    default:
      process.stderr.write(`[FAIL] unknown command: ${args.cmd}\n`);
      return 1;
  }
}

/** @param {string} metaUrl @param {string|undefined} argv1 @returns {boolean} */
export function isMainModule(metaUrl, argv1) {
  if (!argv1) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(argv1));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  process.exit(run(parseArgs(process.argv.slice(2))));
}

export { run, parseArgs };

#!/usr/bin/env node
// @ts-check
/**
 * beads.mjs — deterministic prep for the Beads pack (installed at
 * `.github/skills/dude-pack-beads-workflow/`).
 *
 * Two mechanical transforms; neither shells out to `bd`. The coordinator runs
 * the emitted `bd` commands and keeps the judgment (reconciliation, ambiguity
 * stops) per the pack's SKILLs.
 *
 *   plan-import <tasks.md> --spec <spec_path> [--title "..."] [--json]
 *       Parse tasks.md and emit an import plan: one deferred epic + one issue
 *       per OPEN task (skips [x] history), the derived dependency edges among
 *       open tasks, and ready-to-run `bd create` / `bd dep` commands. Each issue
 *       description starts with `spec: <spec_path>` (the canonical identity).
 *
 *   mirror <tasks.md> --from <bd-list.json> [--write]
 *       Given `bd list --json`, map each issue's task key + status back to a
 *       canonical glyph and apply the batch to tasks.md (the one-way mirror).
 *
 * NOTE: this pack script imports the core engine at `../dude-engine/lib/...`,
 * which resolves only once installed under `.github/skills/`. It is validated
 * by the compose-install integration test (beads.test.mjs), not from source.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTasks,
  deriveDependencies,
  applyStates,
} from '../dude-engine/lib/tasks.mjs';

/** bd issue status -> canonical task glyph. */
const BD_STATE_GLYPH = {
  open: ' ',
  in_progress: '~',
  'in-progress': '~',
  inprogress: '~',
  blocked: '!',
  closed: 'x',
  done: 'x',
};

const TASK_KEY_RE = /T\d{3,}@[a-z0-9]{8}/;

/** @param {import('../dude-engine/lib/tasks.mjs').Task} t @returns {number} bd priority */
function priorityOf(t) {
  if (t.order <= 1000) return 1; // setup / foundational
  if (t.order >= 4000) return 3; // polish
  return 2;
}

/** @param {string} s @returns {string} shell-safe double-quoted string */
function q(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

/**
 * Build an import plan from a parsed tasks.md.
 * @param {ReturnType<typeof parseTasks>} parsed
 * @param {{ specPath: string, title?: string }} opts
 * @returns {{ spec_path: string, epic: any, issues: any[], deps: {from:string,to:string}[], skipped_done: string[], commands: string[] }}
 */
export function planImport(parsed, { specPath, title }) {
  const open = parsed.tasks.filter((t) => t.state !== 'done');
  const openIds = new Set(open.map((t) => t.id));
  const skipped_done = parsed.tasks.filter((t) => t.state === 'done').map((t) => t.id);

  const epicTitle = title || `Feature ${specPath}`;
  const epic = {
    title: epicTitle,
    status: 'deferred',
    description: `spec: ${specPath}\nEpic: ${epicTitle}`,
  };

  const issues = open.map((t) => {
    const label = t.label ? ` [${t.label}]` : '';
    const titleLine = `${t.id}${label} ${t.description}`;
    const desc = [
      `spec: ${specPath}`,
      `Task: ${titleLine}`,
      `State: [${t.glyph}]`,
      t.label ? `Story: ${t.label}` : null,
      t.deps.length ? `Deps: ${t.deps.join(', ')}` : null,
      t.blockedBy ? `Blocked-by: ${t.blockedBy}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return { key: t.id, title: titleLine, priority: priorityOf(t), state: t.glyph, description: desc };
  });

  // dependency edges among OPEN issues only (deps satisfied by done tasks are dropped)
  const deps = deriveDependencies(parsed).filter((e) => openIds.has(e.from) && openIds.has(e.to));

  /** @type {string[]} */
  const commands = [];
  commands.push(`bd create ${q(epic.title)} -t epic --status=deferred --description=${q(epic.description)} --json`);
  for (const it of issues) {
    commands.push(`bd create ${q(it.title)} -t task -p ${it.priority} --description=${q(it.description)} --json`);
  }
  for (const e of deps) commands.push(`bd dep ${q(e.from)} ${q(e.to)}   # ${e.from} depends on ${e.to}`);

  return { spec_path: specPath, epic, issues, deps, skipped_done, commands };
}

/**
 * Extract the canonical task key + glyph from a bd issue object.
 * @param {any} issue
 * @returns {{ key: string, glyph: string } | null}
 */
export function issueToState(issue) {
  const text = `${issue.description || ''}\n${issue.title || ''}`;
  const m = TASK_KEY_RE.exec(text);
  if (!m) return null;
  const status = String(issue.status || issue.state || '').toLowerCase().replace(/\s+/g, '_');
  const glyph = BD_STATE_GLYPH[status];
  if (glyph === undefined) return null;
  return { key: m[0], glyph };
}

/**
 * Build a {taskId: glyph} map from a `bd list --json` array.
 * @param {any[]} bdIssues
 * @returns {Record<string, string>}
 */
export function mirrorMap(bdIssues) {
  /** @type {Record<string,string>} */
  const map = {};
  for (const issue of Array.isArray(bdIssues) ? bdIssues : []) {
    const s = issueToState(issue);
    if (s) map[s.key] = s.glyph;
  }
  return map;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {any} */
  const out = { json: false, write: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--write') out.write = true;
    else if (a === '--spec') out.spec = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--from') out.from = argv[++i];
    else if (a === '--root') out.root = argv[++i];
    else if (a.startsWith('--')) out.help = true;
    else pos.push(a);
  }
  out.cmd = pos[0];
  out.file = pos[1];
  return out;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const HELP =
    'usage:\n' +
    '  node beads.mjs plan-import <tasks.md> --spec <spec_path> [--title "..."] [--json]\n' +
    '  node beads.mjs mirror <tasks.md> --from <bd-list.json> [--write]\n';
  if (args.help || !args.cmd || !args.file) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }
  if (!fs.existsSync(args.file)) {
    process.stderr.write(`[FAIL] file not found: ${args.file}\n`);
    process.exit(2);
  }
  const parsed = parseTasks(fs.readFileSync(args.file, 'utf8'), { path: args.file });

  try {
    if (args.cmd === 'plan-import') {
      if (!args.spec) throw new Error('plan-import requires --spec <spec_path>');
      if (parsed.warnings.length) throw new Error(`tasks.md has structural issues; fix first:\n  ${parsed.warnings.join('\n  ')}`);
      const plan = planImport(parsed, { specPath: args.spec, title: args.title });
      if (args.json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      else {
        process.stdout.write(`# import plan for ${args.spec} — ${plan.issues.length} open issue(s), ${plan.deps.length} dep(s), ${plan.skipped_done.length} done skipped\n`);
        for (const c of plan.commands) process.stdout.write(`${c}\n`);
      }
      return;
    }
    if (args.cmd === 'mirror') {
      if (!args.from) throw new Error('mirror requires --from <bd-list.json>');
      const bd = JSON.parse(fs.readFileSync(args.from, 'utf8'));
      const map = mirrorMap(Array.isArray(bd) ? bd : bd.issues || []);
      const result = applyStates(parsed, map);
      if (args.write) {
        fs.writeFileSync(args.file, result.content);
        process.stdout.write(`[OK] mirrored ${result.applied.length} state(s) into ${args.file}\n`);
      } else {
        process.stdout.write(`${result.applied.length} state(s) would change (dry run; pass --write)\n`);
      }
      for (const id of result.unknown) process.stdout.write(`[WARN] bd issue key not in tasks.md: ${id}\n`);
      return;
    }
    throw new Error(`unknown command: ${args.cmd}`);
  } catch (err) {
    process.stderr.write(`[FAIL] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}

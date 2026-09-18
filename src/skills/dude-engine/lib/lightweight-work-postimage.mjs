// @ts-check

import { parseTaskState } from './task-state.mjs';
import { glyphsOf, parseVisibleTasks } from './tasks.mjs';

/**
 * Construct bytes only. Callers retain ownership, mutation, event-conflict,
 * source/prestate validation, and all write/receipt authority.
 * @param {{
 *   tasks:Buffer, owner:Buffer, taskState:Buffer, tasksPath:string, taskKey:string,
 *   kind:string, toGlyph:string,
 *   blocker:{kind:string,before:string|null,after:string|null},
 *   eventLines:string[], ownerLogLines:string[], snapshotUpdatedAt:string,
 * }} input
 * @returns {{reason:string}|{tasks:Buffer,owner:Buffer,taskState:Buffer}}
 */
export function buildLightweightWorkPostimages(input) {
  const { tasks: bytes, blocker } = input;
  const snapshot = parseTaskState(input.taskState.toString('utf8'));
  if (snapshot.status === 'corrupt') return { reason: 'snapshot-corrupt' };
  const visible = parseVisibleTasks(bytes, { path: input.tasksPath });
  const parsed = visible.parsed;
  const task = parsed.byId.get(input.taskKey);
  if (!task) return { reason: 'mapping-missing' };
  const history = visible.historyOffset === null
    ? ''
    : bytes.subarray(visible.historyOffset).toString('utf8');
  const existingLines = new Set(history.split('\n'));
  const appendRecords = input.eventLines.filter(line => !existingLines.has(line))
    .map(line => `${line}\n`);
  /** @type {{start:number,end:number,text:Buffer}[]} */
  const edits = [];
  const headerLine = visible.lines[task.headerLine];
  const glyphMatch = /^- \[[^\]]*\]/.exec(parsed.lines[task.headerLine]);
  if (!glyphMatch) return { reason: 'lane-prestate-mismatch' };
  edits.push({
    start: headerLine.start,
    end: headerLine.start + glyphMatch[0].length,
    text: Buffer.from(`- [${input.toGlyph}]`),
  });

  if (blocker.kind !== 'unchanged') {
    let blockedLine = -1;
    /** @type {string|null} */
    let firstMetaIndent = null;
    for (let i = task.headerLine + 1; i < parsed.lines.length && /^\s+\S/.test(parsed.lines[i]); i += 1) {
      if (firstMetaIndent === null) firstMetaIndent = /^(\s+)/.exec(parsed.lines[i])?.[1] ?? null;
      if (/^\s*blocked-by:/.test(parsed.lines[i])) {
        blockedLine = i;
        break;
      }
    }
    const indent = firstMetaIndent ?? '   ';
    if (blocker.kind === 'add') {
      if (blockedLine !== -1) return { reason: 'lane-prestate-mismatch' };
      const separator = bytes.subarray(headerLine.contentEnd, headerLine.end).toString('utf8')
        || parsed.preferredSeparator;
      edits.push({
        start: headerLine.end,
        end: headerLine.end,
        text: Buffer.from(`${indent}blocked-by: ${blocker.after}${separator}`),
      });
    } else {
      if (blockedLine === -1) return { reason: 'lane-prestate-mismatch' };
      const meta = visible.lines[blockedLine];
      edits.push(blocker.kind === 'remove'
        ? { start: meta.start, end: meta.end, text: Buffer.alloc(0) }
        : {
          start: meta.start,
          end: meta.contentEnd,
          text: Buffer.from(`${indent}blocked-by: ${blocker.after}`),
        });
    }
  }

  if (appendRecords.length > 0) {
    if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) return { reason: 'lane-prestate-mismatch' };
    let prefix = '';
    if (visible.historyOffset === null) {
      const unsafeHistoryHeading = visible.lines.some(({ text }) => {
        const heading = /^ {0,3}##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(text);
        return heading !== null
          && heading[1].replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase()
            === 'lightweight execution history';
      });
      if (input.kind !== 'append-event'
        || parsed.tasks.length === 0
        || parsed.warnings.length > 0
        || parsed.byId.size !== parsed.tasks.length
        || unsafeHistoryHeading) {
        return { reason: 'lane-prestate-mismatch' };
      }
      const trailingLfCount = /\n+$/.exec(bytes.toString('utf8'))?.[0].length ?? 0;
      prefix = `${'\n'.repeat(Math.max(0, 2 - trailingLfCount))}## Lightweight Execution History\n\n`;
    }
    edits.push({
      start: bytes.length,
      end: bytes.length,
      text: Buffer.from(`${prefix}${appendRecords.join('')}`),
    });
  }

  edits.sort((left, right) => left.start - right.start);
  let cursor = 0;
  /** @type {Buffer[]} */
  const parts = [];
  for (const edit of edits) {
    if (edit.start < cursor) return { reason: 'lane-prestate-mismatch' };
    parts.push(bytes.subarray(cursor, edit.start), edit.text);
    cursor = edit.end;
  }
  parts.push(bytes.subarray(cursor));
  const tasks = Buffer.concat(parts);
  const ownerText = input.owner.toString('utf8');
  const ownerLines = new Set(ownerText.split('\n'));
  const owner = Buffer.from(ownerText + input.ownerLogLines
    .filter(line => !ownerLines.has(line)).map(line => `${line}\n`).join(''));
  const merged = {
    ...snapshot.state,
    [input.tasksPath]: {
      glyphs: glyphsOf(parseVisibleTasks(tasks, { path: input.tasksPath }).parsed),
      updated_at: `${input.snapshotUpdatedAt.slice(0, -1)}.000Z`,
    },
  };
  /** @type {import('./task-state.mjs').TaskState} */
  const ordered = {};
  for (const key of Object.keys(merged).sort()) ordered[key] = merged[key];
  return { tasks, owner, taskState: Buffer.from(`${JSON.stringify(ordered, null, 2)}\n`) };
}

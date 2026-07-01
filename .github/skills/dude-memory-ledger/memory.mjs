#!/usr/bin/env node
// @ts-check
/**
 * memory.mjs — consistent append + supersede-scan for the Dude memory ledger
 * files under `.github/dudestuff/` (decisions / guardrails / context / lessons).
 *
 * Appends one bullet entry, but first scores token-overlap against existing
 * entries so a near-duplicate is refused (not silently duplicated), and warns
 * when the file crosses the consolidation threshold. The judgment — whether to
 * consolidate, or force a similar-but-distinct entry — stays with the author.
 *
 *   append <file> --text "..."      append one entry (refuses near-duplicates)
 *   append <file> --from-stdin      read the entry text from stdin
 *   append <file> ... --force       append even if a near-duplicate exists
 *   append <file> ... --check       report overlap + count only; never write
 *
 * Exit codes: 0 ok, 1 usage, 2 refused (near-duplicate) / error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeString } from '../dude-engine/lib/text.mjs';
import { overlapScore, rankOverlap } from '../dude-engine/lib/text-analysis.mjs';

/** A new entry at or above this overlap with an existing one is a near-duplicate. */
export const DUP_THRESHOLD = 0.8;
/** Files with at least this many entries get a consolidation warning. */
export const CONSOLIDATE_AT = 20;

/**
 * Extract top-level bullet entries (`- ...` / `* ...`) from a memory file.
 * @param {string} content
 * @returns {{ text: string, line: number }[]}
 */
export function parseEntries(content) {
  const out = [];
  const lines = String(content).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^[-*]\s+(.*\S)\s*$/.exec(lines[i]);
    if (m) out.push({ text: m[1], line: i });
  }
  return out;
}

/**
 * Append one bullet entry to memory content (pure).
 * @param {string} content
 * @param {string} text
 * @returns {string}
 */
export function appendEntry(content, text) {
  const trimmed = String(content).replace(/\n+$/, '');
  const sep = trimmed === '' ? '' : '\n';
  return normalizeString(`${trimmed}${sep}- ${text.trim()}\n`);
}

/**
 * Analyze an append: overlaps vs existing entries + entry count.
 * @param {string} content
 * @param {string} text
 * @returns {{ entryCount: number, overlaps: {id:string,score:number}[], maxScore: number }}
 */
export function analyzeAppend(content, text) {
  const entries = parseEntries(content);
  const overlaps = rankOverlap(
    text,
    entries.map((e, i) => ({ id: `entry ${i + 1}: ${e.text.slice(0, 60)}`, text: e.text })),
    DUP_THRESHOLD
  );
  const maxScore = entries.reduce((m, e) => Math.max(m, overlapScore(text, e.text)), 0);
  return { entryCount: entries.length, overlaps, maxScore };
}

/**
 * @param {{ file: string, text: string, force?: boolean, check?: boolean }} opts
 * @returns {{ ok: boolean, code: number, warnings: string[], wrote: boolean, error?: string }}
 */
export function appendToFile({ file, text, force = false, check = false }) {
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const { entryCount, overlaps, maxScore } = analyzeAppend(content, text);
  /** @type {string[]} */
  const warnings = [];
  if (overlaps.length) {
    warnings.push(`near-duplicate of ${overlaps.length} existing entr(y/ies); closest ${overlaps[0].score}: "${overlaps[0].id}"`);
  }
  if (entryCount + 1 >= CONSOLIDATE_AT) {
    warnings.push(`file will have ${entryCount + 1} entries (>= ${CONSOLIDATE_AT}); consider consolidating`);
  }

  if (check) return { ok: true, code: 0, warnings, wrote: false };

  if (maxScore >= DUP_THRESHOLD && !force) {
    return {
      ok: false,
      code: 2,
      warnings,
      wrote: false,
      error: `refused: near-duplicate (overlap ${maxScore.toFixed(2)}). Consolidate, reword, or pass --force.`,
    };
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, appendEntry(content, text));
  return { ok: true, code: 0, warnings, wrote: true };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {any} */
  const out = { force: false, check: false, fromStdin: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--check') out.check = true;
    else if (a === '--from-stdin') out.fromStdin = true;
    else if (a === '--text') out.text = argv[++i];
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

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.cmd !== 'append' || !args.file) {
    process.stdout.write('usage: node memory.mjs append <file> --text "..." [--force] [--check]\n');
    process.exit(args.help ? 0 : 1);
  }
  const text = args.fromStdin ? readStdin().trim() : args.text;
  if (!text) {
    process.stderr.write('[FAIL] no entry text (use --text "..." or --from-stdin)\n');
    process.exit(1);
  }
  const r = appendToFile({ file: args.file, text, force: args.force, check: args.check });
  for (const w of r.warnings) process.stdout.write(`[WARN] ${w}\n`);
  if (!r.ok) {
    process.stderr.write(`[FAIL] ${r.error}\n`);
    process.exit(r.code);
  }
  process.stdout.write(r.wrote ? `[OK] appended to ${args.file}\n` : `[OK] check only; not written\n`);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}

export { appendToFile as _appendToFile };

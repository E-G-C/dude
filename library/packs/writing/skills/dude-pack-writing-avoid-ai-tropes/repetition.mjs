#!/usr/bin/env node
// @ts-check
/**
 * repetition.mjs — deterministic cross-file prose repetition report for the
 * writing pack (installed at `.github/skills/dude-pack-writing-avoid-ai-tropes/`).
 *
 *   node repetition.mjs <file> <file> [...] [--min-words 8] [--min-files 3]
 *
 * Reads only the files named on the command line: no globbing, no directory
 * walking, no configuration file, no allowance list, no stored state. Fenced
 * code blocks and inline code spans are removed before comparison, then the
 * remaining prose is compared on whitespace and case alone, within a block.
 *
 * It reports, it does not adjudicate. A reported phrase may be deliberate
 * contract wording; legitimacy is the reviewer's recorded judgment. Exit code
 * is 1 when findings exist, 0 when the set is clean, and 2 on a usage or read
 * error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIN_WORDS = 8;
const DEFAULT_MIN_FILES = 3;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE_RE = /(`+)[\s\S]*?\1/g;
const WORD_RE = /[\p{L}\p{N}]/u;
const SIGNATURE_SEPARATOR = '\u0000';
// A blank line, list marker, heading, table row, or blockquote marker starts a new block.
const BLOCK_BOUNDARY_RE = /\n[ \t\r]*(?=\n|[-*+][ \t]|\d+[.)][ \t]|#{1,6}[ \t]|>|\|)/g;
let blockBoundaryId = 0;

/** @typedef {{ file: string, text: string }} Document */
/** @typedef {{ phrase: string, words: number, files: string[] }} Finding */

/**
 * Remove fenced code blocks and inline code spans.
 * @param {string} markdown
 * @returns {string}
 */
export function stripCode(markdown) {
  const kept = [];
  /** @type {{ marker: string, length: number } | null} */
  let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const opener = FENCE_RE.exec(line);
    if (fence) {
      if (opener && opener[1][0] === fence.marker && opener[1].length >= fence.length) fence = null;
      continue;
    }
    if (opener) {
      fence = { marker: opener[1][0], length: opener[1].length };
      continue;
    }
    kept.push(line.replace(INLINE_CODE_RE, ' '));
  }
  return kept.join('\n');
}

/**
 * Split prose into comparable words on whitespace, case, and block boundaries.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return text
    .toLowerCase()
    // Each block boundary becomes a process-unique token, so no window can span two blocks.
    .replace(BLOCK_BOUNDARY_RE, () => ` \u0000${(blockBoundaryId += 1)} `)
    .split(/\s+/)
    // Drop pure-markup tokens so bullets and heading markers do not split identical prose.
    .filter((word) => WORD_RE.test(word));
}

/** @param {string[]} tokens @param {number} start @param {number} minWords */
function windowKey(tokens, start, minWords) {
  return tokens.slice(start, start + minWords).join(' ');
}

/**
 * Report each maximal contiguous phrase repeated verbatim across at least
 * `minFiles` of the supplied documents.
 * @param {Document[]} documents
 * @param {{ minWords?: number, minFiles?: number }} [options]
 * @returns {Finding[]}
 */
export function findRepeatedPhrases(documents, options = {}) {
  const minWords = options.minWords ?? DEFAULT_MIN_WORDS;
  const minFiles = options.minFiles ?? DEFAULT_MIN_FILES;
  const docs = documents.map((doc) => ({ file: doc.file, tokens: tokenize(stripCode(doc.text)) }));

  /** @type {Map<string, Set<string>>} */
  const windowFiles = new Map();
  for (const doc of docs) {
    for (let i = 0; i + minWords <= doc.tokens.length; i += 1) {
      const key = windowKey(doc.tokens, i, minWords);
      let files = windowFiles.get(key);
      if (!files) {
        files = new Set();
        windowFiles.set(key, files);
      }
      files.add(doc.file);
    }
  }

  /** @type {Map<string, string[]>} */
  const qualifying = new Map();
  for (const [key, files] of windowFiles) {
    if (files.size >= minFiles) qualifying.set(key, [...files].sort());
  }

  // Grow each qualifying window while the next one covers exactly the same files,
  // so one repeated clause becomes one phrase instead of many overlapping fragments.
  /** @type {Map<string, string[]>} */
  const candidates = new Map();
  for (const doc of docs) {
    for (let i = 0; i + minWords <= doc.tokens.length; i += 1) {
      const files = qualifying.get(windowKey(doc.tokens, i, minWords));
      if (!files) continue;
      const signature = files.join(SIGNATURE_SEPARATOR);
      let end = i;
      while (end + 1 + minWords <= doc.tokens.length) {
        const next = qualifying.get(windowKey(doc.tokens, end + 1, minWords));
        if (!next || next.join(SIGNATURE_SEPARATOR) !== signature) break;
        end += 1;
      }
      const phrase = doc.tokens.slice(i, end + minWords).join(' ');
      if (!candidates.has(phrase)) candidates.set(phrase, files);
      i = end;
    }
  }

  const entries = [...candidates];
  /** @type {Finding[]} */
  const findings = [];
  for (const [phrase, files] of entries) {
    const signature = files.join(SIGNATURE_SEPARATOR);
    const fragmentOfLonger = entries.some(([other, otherFiles]) => other.length > phrase.length
      && otherFiles.join(SIGNATURE_SEPARATOR) === signature
      && ` ${other} `.includes(` ${phrase} `));
    if (!fragmentOfLonger) findings.push({ phrase, words: phrase.split(' ').length, files });
  }
  findings.sort((a, b) => b.words - a.words
    || b.files.length - a.files.length
    || (a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : 0));
  return findings;
}

/**
 * @param {Finding[]} findings
 * @param {{ fileCount: number, minWords: number, minFiles: number }} context
 * @returns {string}
 */
export function formatReport(findings, context) {
  const scope = `${context.minWords}+ words repeated across ${context.minFiles} or more`
    + ` of ${context.fileCount} file(s)`;
  if (findings.length === 0) return `[OK] no phrase of ${scope}\n`;
  const lines = [`[FAIL] ${findings.length} phrase(s) of ${scope}\n`];
  findings.forEach((finding, index) => {
    lines.push(`${index + 1}. ${finding.words} words in ${finding.files.length} file(s)`);
    lines.push(`   "${finding.phrase}"`);
    for (const file of finding.files) lines.push(`   - ${file}`);
    lines.push('');
  });
  lines.push('Reported as evidence, not as a verdict: repeated wording may be deliberate.');
  return `${lines.join('\n')}\n`;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {string[]} */
  const files = [];
  let minWords = DEFAULT_MIN_WORDS;
  let minFiles = DEFAULT_MIN_FILES;
  let help = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    const flag = /^--(min-words|min-files)(?:=([\s\S]*))?$/.exec(arg);
    if (flag) {
      const raw = flag[2] !== undefined ? flag[2] : argv[++i];
      const value = Number(raw);
      const floor = flag[1] === 'min-words' ? 1 : 2;
      if (!Number.isInteger(value) || value < floor) {
        throw new Error(`--${flag[1]} requires an integer >= ${floor}`);
      }
      if (flag[1] === 'min-words') minWords = value;
      else minFiles = value;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
    files.push(arg);
  }
  return { files, minWords, minFiles, help };
}

/**
 * Read exactly the path the caller passed, with no resolution or traversal.
 * @param {string} file
 * @returns {Document}
 */
function readDocument(file) {
  if (!fs.statSync(file).isFile()) throw new Error(`not a regular file: ${file}`);
  return { file, text: fs.readFileSync(file, 'utf8') };
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
  const HELP = 'usage:\n'
    + '  node repetition.mjs <file> <file> [...] [--min-words 8] [--min-files 3]\n';
  /** @type {ReturnType<typeof parseArgs>} */
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n${HELP}`);
    process.exit(2);
    return;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  /** @type {Document[]} */
  let documents;
  try {
    documents = args.files.map(readDocument);
  } catch (error) {
    process.stderr.write(`[FAIL] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
    return;
  }
  const findings = findRepeatedPhrases(documents, args);
  process.stdout.write(formatReport(findings, {
    fileCount: documents.length,
    minWords: args.minWords,
    minFiles: args.minFiles,
  }));
  if (findings.length > 0) process.exit(1);
}

if (isMainModule(import.meta.url, process.argv[1])) {
  main();
}

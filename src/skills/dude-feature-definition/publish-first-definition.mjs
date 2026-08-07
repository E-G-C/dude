#!/usr/bin/env node
// @ts-check
/** Publish one staged first-definition owner transition and lean package core. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatterScalars, parseSpecIdentity } from '../dude-engine/lib/feature-identity.mjs';
import { scanMarkdownVisibility } from '../dude-engine/lib/tasks.mjs';
import { applyAtomicFileBatch } from './atomic-file-batch.mjs';

const OPTION_NAMES = Object.freeze(['--root', '--idea', '--spec', '--stage']);
const STAGE_NAMES = Object.freeze([
  'current-idea.md',
  'staged-idea.md',
  'spec.md',
  'plan.md',
  'tasks.md',
]);
const OWNER_KEYS = Object.freeze(['title', 'slug', 'status', 'spec_path']);
const PROTECTED_SECTIONS = Object.freeze(['Idea', 'Open Questions', 'Assumptions']);
const IDEA_PATH = /^\.dude\/ideas\/[^/\\#\s]+\.md$/;
const LEVEL_TWO_HEADING = /^ {0,3}##(?:[ \t]+|$)/;
const COORDINATOR_LOG_HEADING = /^ {0,3}##[ \t]+Coordinator Log(?:[ \t]+#+)?[ \t]*$/;
const MANAGED_END = '<!-- dude:managed:end -->';
const LINT_PATH = fileURLToPath(new URL('../dude-lint/lint.mjs', import.meta.url));

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {string[]} args */
function parseArguments(args) {
  if (args.length !== OPTION_NAMES.length * 2) {
    throw new Error('expected exactly --root, --idea, --spec, and --stage');
  }

  /** @type {Map<string, string>} */
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!OPTION_NAMES.includes(option)) throw new Error(`unknown argument ${option}`);
    if (options.has(option)) throw new Error(`option ${option} must appear exactly once`);
    if (!value || value.startsWith('--')) throw new Error(`option ${option} requires a value`);
    options.set(option, value);
  }
  for (const option of OPTION_NAMES) {
    if (!options.has(option)) throw new Error(`missing required option ${option}`);
  }

  const root = /** @type {string} */ (options.get('--root'));
  const idea = /** @type {string} */ (options.get('--idea'));
  const spec = /** @type {string} */ (options.get('--spec'));
  const stage = /** @type {string} */ (options.get('--stage'));
  if (!IDEA_PATH.test(idea) || idea.includes('\0')) {
    throw new Error('--idea must be a direct .dude/ideas/<slug>.md path');
  }
  if (!parseSpecIdentity(spec)) {
    throw new Error('--spec must be a direct .dude/specs/<feature>/spec.md path');
  }
  if (!path.isAbsolute(stage)) throw new Error('--stage must be an absolute directory path');
  return { root, idea, spec, stage };
}

/** @param {string} stagePath */
function readStage(stagePath) {
  const stageStat = fs.lstatSync(stagePath);
  if (!stageStat.isDirectory() || stageStat.isSymbolicLink()) {
    throw new Error('stage must be a real directory');
  }

  const entries = fs.readdirSync(stagePath, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  const expectedNames = [...STAGE_NAMES].sort();
  if (names.length !== expectedNames.length
    || names.some((name, index) => name !== expectedNames[index])) {
    throw new Error(`stage must contain exactly ${STAGE_NAMES.join(', ')}`);
  }

  /** @type {Record<string, Buffer>} */
  const bytes = {};
  for (const name of STAGE_NAMES) {
    const entry = entries.find((candidate) => candidate.name === name);
    const absolutePath = path.join(stagePath, name);
    const stat = fs.lstatSync(absolutePath);
    if (!entry?.isFile() || !stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`stage entry must be a regular file: ${name}`);
    }
    bytes[name] = fs.readFileSync(absolutePath);
  }
  return bytes;
}

/**
 * @param {Buffer} bytes
 * @param {string} state
 */
function parseOwnerFrontmatter(bytes, state) {
  try {
    const parsed = parseFrontmatterScalars(bytes, { canonicalKeys: OWNER_KEYS });
    for (const key of OWNER_KEYS) {
      if (!parsed.scalars.has(key)) throw new Error(`missing ${key}:`);
    }
    return parsed;
  } catch (error) {
    throw new Error(`${state} idea frontmatter is malformed (${errorMessage(error)})`);
  }
}

/**
 * @param {Buffer} bytes
 * @param {Array<{start:number,contentEnd:number,end:number,text:string}>} lines
 * @param {string} state
 */
function extractProtectedSections(bytes, lines, state) {
  /** @type {Array<{start:number,name:string|null}>} */
  const boundaries = [];
  /** @type {Map<string, number[]>} */
  const occurrences = new Map(PROTECTED_SECTIONS.map((name) => [name, []]));

  for (const line of lines) {
    if (!LEVEL_TWO_HEADING.test(line.text)) continue;
    const protectedHeading = /^ {0,3}##[ \t]+(Idea|Open Questions|Assumptions)(?:[ \t]+#+)?[ \t]*$/
      .exec(line.text);
    const boundaryIndex = boundaries.length;
    boundaries.push({ start: line.start, name: protectedHeading?.[1] ?? null });
    if (protectedHeading) occurrences.get(protectedHeading[1])?.push(boundaryIndex);
  }

  const indexes = PROTECTED_SECTIONS.map((name) => {
    const matches = occurrences.get(name) ?? [];
    if (matches.length !== 1) {
      throw new Error(`${state} idea must contain exactly one ## ${name} section`);
    }
    return matches[0];
  });
  if (!(indexes[0] < indexes[1] && indexes[1] < indexes[2])) {
    throw new Error(`${state} idea sections must be ordered ## Idea, ## Open Questions, ## Assumptions`);
  }

  /** @type {Map<string, Buffer>} */
  const sections = new Map();
  for (let index = 0; index < PROTECTED_SECTIONS.length; index += 1) {
    const boundaryIndex = indexes[index];
    const end = boundaries[boundaryIndex + 1]?.start ?? bytes.length;
    sections.set(
      PROTECTED_SECTIONS[index],
      Buffer.from(bytes.subarray(boundaries[boundaryIndex].start, end)),
    );
  }
  return sections;
}

/**
 * @param {Buffer} bytes
 * @param {Array<{start:number,contentEnd:number,end:number,text:string}>} lines
 * @param {string} state
 */
function extractCoordinatorLog(bytes, lines, state) {
  const headings = lines.filter((line) => COORDINATOR_LOG_HEADING.test(line.text));
  if (headings.length !== 1) {
    throw new Error(`${state} idea must contain exactly one ## Coordinator Log section`);
  }

  const heading = headings[0];
  const markerOffset = bytes.indexOf(MANAGED_END, heading.end, 'utf8');
  let end = markerOffset === -1 ? bytes.length : markerOffset;
  for (const line of lines) {
    if (line.start <= heading.start) continue;
    if (line.start >= end) break;
    if (LEVEL_TWO_HEADING.test(line.text)) {
      end = line.start;
      break;
    }
  }
  return Buffer.from(bytes.subarray(heading.start, end));
}

/** @param {Buffer} current @param {Buffer} staged @param {string} specPath */
function validateOwnerTransition(current, staged, specPath) {
  const currentFrontmatter = parseOwnerFrontmatter(current, 'current');
  const stagedFrontmatter = parseOwnerFrontmatter(staged, 'staged');
  if (currentFrontmatter.scalars.get('status')?.value !== 'draft') {
    throw new Error('current idea must have status: draft');
  }
  if (currentFrontmatter.scalars.get('spec_path')?.value !== '') {
    throw new Error('current idea must have an empty spec_path:');
  }
  if (stagedFrontmatter.scalars.get('status')?.value !== 'defined') {
    throw new Error('staged idea must have status: defined');
  }
  if (stagedFrontmatter.scalars.get('spec_path')?.value !== specPath) {
    throw new Error(`staged idea must have spec_path: ${specPath}`);
  }

  const currentLines = scanMarkdownVisibility(current, 'current idea', 'generic').lines;
  const stagedLines = scanMarkdownVisibility(staged, 'staged idea', 'generic').lines;
  for (const key of ['title', 'slug']) {
    const currentScalar = currentFrontmatter.scalars.get(key);
    const stagedScalar = stagedFrontmatter.scalars.get(key);
    const currentLine = currentScalar && currentLines[currentScalar.lineIndex];
    const stagedLine = stagedScalar && stagedLines[stagedScalar.lineIndex];
    if (!currentLine || !stagedLine
      || !current.subarray(currentLine.start, currentLine.end)
        .equals(staged.subarray(stagedLine.start, stagedLine.end))) {
      throw new Error(`staged idea must preserve ${key} bytes`);
    }
  }

  const currentSections = extractProtectedSections(current, currentLines, 'current');
  const stagedSections = extractProtectedSections(staged, stagedLines, 'staged');
  for (const name of PROTECTED_SECTIONS) {
    if (!currentSections.get(name)?.equals(stagedSections.get(name))) {
      throw new Error(`staged idea must preserve complete ## ${name} section bytes`);
    }
  }

  const currentLog = extractCoordinatorLog(current, currentLines, 'current');
  const stagedLog = extractCoordinatorLog(staged, stagedLines, 'staged');
  if (stagedLog.length < currentLog.length
    || !stagedLog.subarray(0, currentLog.length).equals(currentLog)) {
    throw new Error('staged Coordinator Log must preserve the exact current prefix');
  }
  const appended = stagedLog.subarray(currentLog.length).toString('utf8');
  if (!/^- \S[^\r\n]*(?:\r\n|\n|\r)$/u.test(appended)) {
    throw new Error('staged Coordinator Log must append exactly one complete definition event');
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const stage = readStage(options.stage);
  const currentIdea = stage['current-idea.md'];
  const stagedIdea = stage['staged-idea.md'];
  validateOwnerTransition(currentIdea, stagedIdea, options.spec);

  const root = path.resolve(options.root);
  const packageDirectory = path.posix.dirname(options.spec);
  applyAtomicFileBatch({
    root,
    changes: [
      { path: options.idea, expected: currentIdea, staged: stagedIdea },
      { path: options.spec, expected: 'missing', staged: stage['spec.md'] },
      { path: `${packageDirectory}/plan.md`, expected: 'missing', staged: stage['plan.md'] },
      { path: `${packageDirectory}/tasks.md`, expected: 'missing', staged: stage['tasks.md'] },
    ],
  }, () => {
    const lint = spawnSync(process.execPath, [LINT_PATH, root], {
      encoding: 'utf8',
      shell: false,
    });
    if (lint.error) throw new Error(`dude-lint invocation failed (${lint.error.message})`);
    if (lint.status !== 0) throw new Error('dude-lint failed');
  });

  process.stdout.write(`${options.spec}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[FAIL] ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

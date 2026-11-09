#!/usr/bin/env node
// @ts-check
/**
 * Publish one first-capture ledger at the freshly allocated lifecycle identity.
 *
 * `--number-advice <absolute-staged-advice-file>` is optional. Without it the
 * command is exactly the ordinary capture. With it, the advice is checked
 * whole before the authoritative inventory (./capture-number-advice.mjs), the
 * number becomes `max(fresh local maximum, accepted peer observed maximum) + 1`,
 * and the ledger and the conversation's capture receipt are created in one
 * file transaction whose postcondition and lint failures remove both. A crash
 * mid-transaction is not covered. Invalid advice refuses before any write and
 * never falls back to the ordinary capture.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_IDEA_KEYS,
  inventoryLifecycleIdentities,
} from '../dude-engine/lib/feature.mjs';
import { parseFrontmatterScalars, parseIdeaIdentity } from '../dude-engine/lib/feature-identity.mjs';
import { applyAtomicFileBatch } from './atomic-file-batch.mjs';

const LINT_PATH = fileURLToPath(new URL('../dude-lint/lint.mjs', import.meta.url));
const USAGE = 'expected exactly --root, --slug, and --stage, and optionally --number-advice';

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {string[]} args */
function parseArguments(args) {
  if (args.length !== 6 && args.length !== 8) throw new Error(USAGE);
  /** @type {Map<string, string>} */
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!['--root', '--slug', '--stage', '--number-advice'].includes(option)) throw new Error(`unknown argument ${option}`);
    if (options.has(option)) throw new Error(`option ${option} must appear exactly once`);
    if (!value || value.startsWith('--')) throw new Error(`option ${option} requires a value`);
    options.set(option, value);
  }
  if (!['--root', '--slug', '--stage'].every((option) => options.has(option))) throw new Error(USAGE);
  const root = /** @type {string} */ (options.get('--root'));
  const slug = /** @type {string} */ (options.get('--slug'));
  const stage = /** @type {string} */ (options.get('--stage'));
  const numberAdvice = options.get('--number-advice') ?? null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('--slug must be one exact canonical frontmatter slug');
  if (!path.isAbsolute(stage)) throw new Error('--stage must be an absolute file path');
  if (numberAdvice !== null && !path.isAbsolute(numberAdvice)) throw new Error('--number-advice must be an absolute file path');
  return { root, slug, stage, numberAdvice };
}

/** @param {string} stagePath @param {string} slug */
function readStagedLedger(stagePath, slug) {
  const stat = fs.lstatSync(stagePath);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('stage must be a regular file');
  const bytes = fs.readFileSync(stagePath);
  let frontmatter;
  try {
    frontmatter = parseFrontmatterScalars(bytes, { canonicalKeys: CANONICAL_IDEA_KEYS });
  } catch (error) {
    throw new Error(`staged idea frontmatter is malformed (${errorMessage(error)})`);
  }
  for (const key of ['title', 'slug', 'status', 'spec_path']) {
    if (!frontmatter.scalars.has(key)) throw new Error(`staged idea is missing ${key}:`);
  }
  if (frontmatter.scalars.get('slug')?.value !== slug) {
    throw new Error(`staged idea must have slug: ${slug}`);
  }
  if (frontmatter.scalars.get('status')?.value !== 'draft') {
    throw new Error('staged idea must have status: draft');
  }
  if (frontmatter.scalars.get('spec_path')?.value !== '') {
    throw new Error('staged idea must have an empty spec_path:');
  }
  return bytes;
}

/**
 * @param {ReturnType<typeof parseArguments>} options
 * @param {typeof import('./capture-number-advice.mjs') | null} numberAdvice The advice module, for an advised capture only.
 */
function main(options, numberAdvice) {
  const staged = readStagedLedger(options.stage, options.slug);
  // Advice is checked whole against the staged draft, this workspace, and its
  // own recorded conversation before the authoritative inventory below.
  const advice = numberAdvice && options.numberAdvice !== null
    ? numberAdvice.readNumberAdvice({ root: options.root, slug: options.slug, ledger: staged, file: options.numberAdvice })
    : null;

  // This is the authoritative re-read immediately before expected-missing
  // creation. Any earlier projection used to stage the ledger is advisory.
  const inventory = inventoryLifecycleIdentities({ root: options.root });
  const errors = inventory.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`lifecycle inventory is unsafe (${errors.map((item) => `${item.path}: ${item.message}`).join('; ')})`);
  }
  if (inventory.ideas.some((idea) => idea.slug === options.slug)) {
    throw new Error(`idea slug '${options.slug}' already exists; refresh its exact path instead`);
  }
  if (inventory.exhausted || inventory.nextNumber === null) {
    throw new Error('lifecycle identity range 001-999 is exhausted');
  }
  const selection = numberAdvice && advice
    ? numberAdvice.chooseAdvisedNumber(advice, /** @type {number} */ (inventory.nextNumberValue))
    : null;

  const ideaPath = `.dude/ideas/${selection ? selection.number : inventory.nextNumber}-${options.slug}.md`;
  const identity = parseIdeaIdentity(ideaPath);
  if (identity === null) throw new Error('allocated idea identity is invalid');
  const expectedIdeas = [
    ...inventory.ideas,
    {
      ideaPath,
      number: identity.number,
      numberValue: identity.numberValue,
      slug: identity.slug,
      status: 'draft',
      specPath: '',
    },
  ].sort((left, right) => (
    left.numberValue - right.numberValue
    || (left.ideaPath < right.ideaPath ? -1 : left.ideaPath > right.ideaPath ? 1 : 0)
  ));
  const expectedPackages = JSON.stringify(inventory.packages);
  /** @type {import('./atomic-file-batch.mjs').AtomicFileChange[]} */
  const changes = [{ path: ideaPath, expected: 'missing', staged }];
  if (numberAdvice && advice && selection) {
    const receipt = numberAdvice.captureReceipt(advice, selection, ideaPath);
    changes.push({ path: receipt.path, expected: 'missing', staged: receipt.bytes });
  }
  applyAtomicFileBatch({
    root: path.resolve(options.root),
    changes,
  }, () => {
    const published = inventoryLifecycleIdentities({ root: options.root });
    if (published.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      || JSON.stringify(published.ideas) !== JSON.stringify(expectedIdeas)
      || JSON.stringify(published.packages) !== expectedPackages) {
      throw new Error('lifecycle inventory drifted during first capture');
    }
    const lint = spawnSync(process.execPath, [LINT_PATH, path.resolve(options.root)], {
      encoding: 'utf8',
      shell: false,
    });
    if (lint.error) throw new Error(`dude-lint invocation failed (${lint.error.message})`);
    if (lint.status !== 0) throw new Error('dude-lint failed');
  });
  process.stdout.write(`${ideaPath}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    // Only an advised capture loads the advice checks and the A2A modules they
    // reuse; the ordinary capture's modules stay exactly what they were.
    main(options, options.numberAdvice === null ? null : await import('./capture-number-advice.mjs'));
  } catch (error) {
    process.stderr.write(`[FAIL] ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

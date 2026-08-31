#!/usr/bin/env node
// @ts-check
/** Thin CLI adapter for the read-only feature ownership library. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inventoryDefinedFeatures,
  inventoryLifecycleIdentities,
  resolveFeatureOwner,
  resolveIdeaSelector,
} from './lib/feature.mjs';

const USAGE = [
  'Usage:',
  '  node feature.mjs inventory --root <path> --json',
  '  node feature.mjs ideas --root <path> --json',
  '  node feature.mjs resolve --root <path> --spec <specPath> --json',
  '  node feature.mjs select --root <path> (--slug <slug> | --idea <ideaPath>) --json',
  '  node feature.mjs --help',
  '',
].join('\n');

/** @param {string} message @returns {never} */
function usageError(message) {
  process.stderr.write(`${message}\n${USAGE}`);
  process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(USAGE);
    return;
  }

  const command = args.shift();
  if (!['inventory', 'ideas', 'resolve', 'select'].includes(command ?? '')) {
    usageError(`unknown or missing command '${command || ''}'`);
  }

  /** @type {Map<string, string | true>} */
  const options = new Map();
  while (args.length > 0) {
    const option = args.shift();
    if (!['--root', '--spec', '--slug', '--idea', '--json'].includes(option ?? '')) {
      usageError(`unknown or extra argument '${option || ''}'`);
    }
    if (options.has(option)) usageError(`option '${option}' must appear exactly once`);
    if (option === '--json') {
      options.set(option, true);
      continue;
    }
    const value = args.shift();
    if (!value || value.startsWith('--')) usageError(`option '${option}' requires a value`);
    options.set(option, value);
  }

  if (!options.has('--root')) usageError("missing required option '--root'");
  if (!options.has('--json')) usageError("missing required option '--json'");
  if ((command === 'inventory' || command === 'ideas')
    && [...options.keys()].some((option) => !['--root', '--json'].includes(option))) {
    usageError(`selector options are not applicable to ${command}`);
  }
  if (command === 'resolve' && !options.has('--spec')) {
    usageError("missing required option '--spec'");
  }
  if (command === 'resolve'
    && [...options.keys()].some((option) => !['--root', '--spec', '--json'].includes(option))) {
    usageError('only --spec is applicable to resolve');
  }
  if (command === 'select') {
    const selectors = ['--slug', '--idea'].filter((option) => options.has(option));
    if (selectors.length !== 1) usageError('select requires exactly one of --slug or --idea');
    if (options.has('--spec')) usageError('--spec is not applicable to select');
  }

  const root = /** @type {string} */ (options.get('--root'));
  let result;
  if (command === 'inventory') result = inventoryDefinedFeatures({ root });
  else if (command === 'ideas') result = inventoryLifecycleIdentities({ root });
  else if (command === 'resolve') {
    result = resolveFeatureOwner({
      root,
      specPath: /** @type {string} */ (options.get('--spec')),
    });
  } else {
    result = resolveIdeaSelector({
      root,
      ...(options.has('--slug') ? { slug: /** @type {string} */ (options.get('--slug')) } : {}),
      ...(options.has('--idea') ? { ideaPath: /** @type {string} */ (options.get('--idea')) } : {}),
    });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

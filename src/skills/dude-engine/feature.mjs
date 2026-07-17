#!/usr/bin/env node
// @ts-check
/** Thin CLI adapter for the read-only feature ownership library. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventoryDefinedFeatures, resolveFeatureOwner } from './lib/feature.mjs';

const USAGE = [
  'Usage:',
  '  node feature.mjs inventory --root <path> --json',
  '  node feature.mjs resolve --root <path> --spec <specPath> --json',
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
  if (command !== 'inventory' && command !== 'resolve') {
    usageError(`unknown or missing command '${command || ''}'`);
  }

  /** @type {Map<string, string | true>} */
  const options = new Map();
  while (args.length > 0) {
    const option = args.shift();
    if (option !== '--root' && option !== '--spec' && option !== '--json') {
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
  if (command === 'inventory' && options.has('--spec')) {
    usageError("option '--spec' is not applicable to inventory");
  }
  if (command === 'resolve' && !options.has('--spec')) {
    usageError("missing required option '--spec'");
  }

  const root = /** @type {string} */ (options.get('--root'));
  const result = command === 'inventory'
    ? inventoryDefinedFeatures({ root })
    : resolveFeatureOwner({ root, specPath: /** @type {string} */ (options.get('--spec')) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

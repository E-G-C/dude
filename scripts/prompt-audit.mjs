#!/usr/bin/env node
// @ts-check
/** Repository wrapper for the authoring pack's generic prompt audit. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isMainModule,
  runCli,
} from '../library/packs/authoring/skills/dude-pack-authoring-prompt-audit/prompt-audit.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptsDirectory, '..');
export const repositoryProfiles = path.join(scriptsDirectory, 'prompt-audit-profiles.json');

export async function main(argv = process.argv.slice(2), io = {}) {
  return runCli(argv, {
    ...io,
    defaultRoot: repositoryRoot,
    defaultProfilesPath: repositoryProfiles,
  });
}

if (isMainModule(import.meta.url, process.argv[1])) {
  process.exitCode = await main();
}

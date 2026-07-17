#!/usr/bin/env node
// @ts-check
/**
 * canonicalize-installed-agents.mjs — strip the host editor's injected `model:`
 * frontmatter key from every installed `.github/agents/*.agent.md` in place.
 *
 * VS Code writes a per-agent `model:` line into an installed agent file when it
 * dispatches that agent as a subagent. That editor-owned key is not part of the
 * bundle-controlled source, so it makes the strict prompt audit (and compose
 * parity) see installed agents that no longer match source. This helper applies
 * the shared `normalizeAgentFrontmatter` transform so measurement sees the
 * canonical model-less bytes again.
 *
 * It only strips the injected `model:` line: genuine non-`model:` drift is left
 * intact so parity still catches it. It never reads or writes `profile.md`,
 * never invokes compose, and never copies from source.
 *
 * Path safety (locally-controlled-workspace threat model): every target is
 * resolved through `resolveMutationPath`, which refuses a symbolic-link
 * workspace root, `.github`, `.github/agents` category, or `*.agent.md` target
 * (or any ancestor) and any containment escape, so the tool never follows a
 * link to rewrite a file outside the workspace. It inventories only contained
 * direct regular `*.agent.md` targets, computes the COMPLETE prospective write
 * set, revalidates every target immediately before the first replacement, and
 * writes all-or-nothing: any preflight failure refuses the whole run before any
 * rewrite, leaving every target byte-identical.
 *
 * Dependency-free ESM. Targets Node >= 20. Exit codes: 0 ok, 2 error.
 * Usage: `node canonicalize-installed-agents.mjs [root]` (default: cwd).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAgentFrontmatter } from '../src/skills/dude-engine/lib/agent-frontmatter.mjs';
import { resolveMutationPath } from '../src/skills/dude-engine/lib/workspace-paths.mjs';

const AGENTS_REL = '.github/agents';

/**
 * Rewrite every `.github/agents/*.agent.md` under `root` to its canonical
 * model-less bytes, in place, only when the injected `model:` key is present.
 *
 * Refuses any symbolic-link component on the path to a target — a symlinked
 * workspace root, `.github`, `.github/agents` category, or `*.agent.md` target
 * (or any ancestor) — via `resolveMutationPath`, so it never follows a link out
 * of the workspace. It inventories only contained direct regular targets,
 * computes the COMPLETE prospective write set, revalidates every target
 * (containment + regular-file) immediately before the first replacement, and
 * writes all-or-nothing: any preflight failure refuses the whole run before any
 * rewrite, leaving every target unchanged.
 * @param {{ root: string }} opts
 * @returns {{ changed: string[] }} repo-relative paths that were rewritten
 */
export function canonicalizeInstalledAgents({ root }) {
  /** @type {string[]} */
  const changed = [];

  // 1. Resolve + validate the agents category. `resolveMutationPath` refuses a
  //    symlinked root, `.github`, or `agents` component and containment escapes.
  const agentsDir = resolveMutationPath(root, AGENTS_REL);
  if (!fs.existsSync(agentsDir)) return { changed };
  if (!fs.statSync(agentsDir).isDirectory()) return { changed };

  // 2. Preflight: build the COMPLETE write set over sorted entries. Any symlink
  //    target/ancestor or containment escape throws here — before any write —
  //    so an external file can never be reached through a link.
  const names = fs.readdirSync(agentsDir).sort();
  /** @type {{ abs: string, rel: string, framed: Buffer }[]} */
  const writeSet = [];
  for (const name of names) {
    if (!name.endsWith('.agent.md')) continue;
    const rel = `${AGENTS_REL}/${name}`;
    const abs = resolveMutationPath(root, rel);
    // A symlink target would already have thrown above; a non-regular entry
    // (e.g. a directory) is not a canonicalization target.
    if (!fs.lstatSync(abs).isFile()) continue;
    const bytes = fs.readFileSync(abs);
    const framed = normalizeAgentFrontmatter(bytes);
    if (!framed.equals(bytes)) writeSet.push({ abs, rel, framed });
  }

  // 3. Revalidate the entire write set immediately before the first write. Any
  //    change since preflight (new symlink, replaced target) throws with no
  //    writes performed.
  for (const item of writeSet) {
    const abs = resolveMutationPath(root, item.rel);
    if (!fs.lstatSync(abs).isFile()) {
      throw new Error(`unsafe mutation target '${item.rel}' is no longer a regular file`);
    }
  }

  // 4. Write: only now rewrite every target, preserving sorted order.
  for (const item of writeSet) {
    fs.writeFileSync(item.abs, item.framed);
    changed.push(item.rel);
  }
  return { changed };
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
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('usage: node canonicalize-installed-agents.mjs [root]\n');
    process.exit(0);
  }
  const positional = args.filter((a) => !a.startsWith('-'));
  const root = path.resolve(positional[0] ?? '.');
  try {
    const { changed } = canonicalizeInstalledAgents({ root });
    if (changed.length === 0) process.stdout.write('[OK] no injected model: frontmatter to strip\n');
    else for (const c of changed) process.stdout.write(`[canonicalized] ${c}\n`);
  } catch (e) {
    process.stderr.write(`[ERROR] ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(2);
  }
}

if (isMainModule(import.meta.url, process.argv[1])) main();

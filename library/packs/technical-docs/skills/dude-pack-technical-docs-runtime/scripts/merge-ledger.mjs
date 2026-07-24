#!/usr/bin/env node
// merge-ledger.mjs — Concatenate JSONL ledger fragments into one ordered ledger.
//
// The extractor writes one JSONL fragment per source unit (per chunk, per slice of
// a repository inventory). Before the planner runs, those fragments are merged into
// a single ledger.jsonl. This replaces the old shell/PowerShell merge one-liner
// (roughly `cat parts/*.jsonl 2>/dev/null > ledger.jsonl`) with a portable Node
// script so the same command works on every platform.
//
// Inputs are file paths or directories; a directory contributes its own *.jsonl
// files (non-recursive). Missing inputs are skipped silently, mirroring the old
// `2>/dev/null`. Blank lines are dropped. Entries are ordered stably by their
// parsed `id`; any line whose `id` cannot be parsed keeps its original order and is
// appended after the keyed entries. Ids are chunk-prefixed and unique by contract,
// so nothing is de-duplicated.
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/merge-ledger.mjs <input...> --out <ledger.jsonl>
//
// Prints a one-line summary to stderr. Exits 0 on success, 2 on bad arguments, and
// 3 when no ledger entries are found across all inputs.

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

// Expand each input path to a concrete list of files. A directory contributes its
// direct *.jsonl children (sorted for determinism). Missing paths are skipped.
function expandInputs(inputs) {
  const files = [];
  for (const p of inputs) {
    let st;
    try {
      st = statSync(p);
    } catch {
      continue; // missing input — skip silently (mirrors the old 2>/dev/null)
    }
    if (st.isDirectory()) {
      let names;
      try {
        names = readdirSync(p);
      } catch {
        continue;
      }
      for (const name of names.filter((n) => n.endsWith(".jsonl")).sort()) {
        files.push(join(p, name));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function main() {
  const argv = process.argv.slice(2);
  const inputs = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/merge-ledger.mjs <input...> --out <ledger.jsonl>\n"
      );
      process.exit(0);
    } else inputs.push(a);
  }
  if (inputs.length === 0) {
    process.stderr.write("error: no input files or directories given\n");
    process.exit(2);
  }
  if (!out) {
    process.stderr.write("error: require --out <ledger.jsonl>\n");
    process.exit(2);
  }

  const files = expandInputs(inputs);

  // Collect every non-blank line, remembering its original order and its parsed id
  // (null when the line is not JSON or carries no id).
  const records = [];
  let filesRead = 0;
  let order = 0;
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue; // unreadable — skip silently
    }
    filesRead++;
    for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
      const t = line.trim();
      if (!t) continue; // drop blank lines
      let id = null;
      try {
        const obj = JSON.parse(t);
        if (obj && typeof obj === "object" && obj.id != null) id = String(obj.id);
      } catch {
        /* not JSON — keep original order at the end */
      }
      records.push({ id, line: t, order: order++ });
    }
  }

  if (records.length === 0) {
    process.stderr.write(
      `error: no ledger entries found (read ${filesRead} file(s) from ${inputs.length} input path(s))\n`
    );
    process.exit(3);
  }

  // Keyed entries sort stably by id; unkeyed entries keep their original order and
  // follow the keyed block. Do not de-duplicate — ids are unique by contract.
  const keyed = records.filter((r) => r.id !== null);
  const unkeyed = records.filter((r) => r.id === null);
  keyed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.order - b.order));
  const ordered = [...keyed, ...unkeyed];

  const outText = ordered.map((r) => r.line).join("\n") + "\n";
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, outText);

  process.stderr.write(
    `merge-ledger: read ${filesRead} input file(s), wrote ${ordered.length} entries to ${out}\n`
  );
  process.exit(0);
}

main();

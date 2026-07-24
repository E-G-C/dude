#!/usr/bin/env node
// coverage.mjs — Prove no source detail was dropped from the document.
//
// Compares the set of ledger item ids (every traceable fact extracted from the
// transcript) against the set of consumed ids the drafter recorded while writing
// each section. Any ledger id that was never consumed is a potential loss and is
// reported back for a targeted patch. Consumed ids that do not exist in the ledger
// (dangling references) are also flagged.
//
// Inputs accept JSONL objects ({"id":"C001-F003", ...}), JSON strings, or bare
// id tokens, one per line.
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs --ledger <ledger.jsonl> --consumed <consumed.jsonl> [--json <out>]
//
// Exit code is non-zero when anything is uncovered, dangling, or has duplicate
// ledger ids; 0 when coverage is complete.

import { readFileSync, writeFileSync } from "node:fs";

function parseLines(file) {
  const raw = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  return raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

function extractItem(line) {
  if (line.startsWith("{") || line.startsWith('"')) {
    try {
      const v = JSON.parse(line);
      if (typeof v === "string") return { id: v };
      if (v && typeof v === "object") {
        const id = v.id ?? v.ref ?? v.ledgerId;
        if (id) return { id: String(id), type: v.type, importance: v.importance, section: v.section };
      }
      return null;
    } catch {
      /* fall through to bare token */
    }
  }
  return { id: line };
}

function loadItems(file) {
  const items = [];
  for (const line of parseLines(file)) {
    const it = extractItem(line);
    if (it && it.id) items.push(it);
  }
  return items;
}

function main() {
  const argv = process.argv.slice(2);
  let ledger = null;
  let consumed = null;
  let jsonOut = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ledger") ledger = argv[++i];
    else if (argv[i] === "--consumed") consumed = argv[++i];
    else if (argv[i] === "--json") jsonOut = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/coverage.mjs --ledger <ledger.jsonl> --consumed <consumed.jsonl> [--json out]\n"
      );
      process.exit(0);
    }
  }
  if (!ledger || !consumed) {
    process.stderr.write("error: require --ledger and --consumed\n");
    process.exit(2);
  }

  const ledgerItems = loadItems(ledger);
  const consumedItems = loadItems(consumed);

  // Duplicate ledger ids make the guarantee meaningless: two distinct facts that
  // share one id can be "covered" by a single consumed entry. Ids must be unique
  // per the evidence-ledger contract, so treat duplicates as a fatal defect.
  const ledgerIdCounts = new Map();
  for (const it of ledgerItems) {
    ledgerIdCounts.set(it.id, (ledgerIdCounts.get(it.id) || 0) + 1);
  }
  const duplicateLedgerIds = [...ledgerIdCounts.entries()]
    .filter(([, c]) => c > 1)
    .map(([id, count]) => ({ id, count }));

  const ledgerIds = new Set(ledgerIdCounts.keys());
  const consumedSet = new Set(consumedItems.map((it) => it.id));

  const uncovered = ledgerItems.filter((it) => !consumedSet.has(it.id));
  const dangling = [...consumedSet].filter((id) => !ledgerIds.has(id));

  const rank = (imp) => (imp === "high" ? 0 : imp === "medium" ? 1 : 2);
  uncovered.sort((a, b) => rank(a.importance) - rank(b.importance));

  // De-duplicate the uncovered display list by id.
  const seen = new Set();
  const uncoveredUnique = [];
  for (const it of uncovered) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    uncoveredUnique.push({ id: it.id, type: it.type, importance: it.importance });
  }

  const report = {
    ok: uncovered.length === 0 && dangling.length === 0 && duplicateLedgerIds.length === 0,
    ledgerCount: ledgerItems.length,
    uniqueLedgerIds: ledgerIds.size,
    consumedCount: consumedSet.size,
    uncoveredCount: uncoveredUnique.length,
    danglingCount: dangling.length,
    duplicateLedgerIdCount: duplicateLedgerIds.length,
    uncovered: uncoveredUnique,
    dangling,
    duplicateLedgerIds,
  };
  const outStr = JSON.stringify(report, null, 2);
  process.stdout.write(outStr + "\n");
  if (jsonOut) writeFileSync(jsonOut, outStr + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();

#!/usr/bin/env node
// extraction-audit.mjs — Backstop against silent under-extraction.
//
// The coverage gate (coverage.mjs) proves every *ledger* id reached the document.
// It cannot prove the *extractor* captured every fact in the source — a chunk that
// is under-extracted produces fewer ledger ids, and coverage still passes because
// it only compares consumed ids against the ledger that was actually produced.
//
// This script is the missing recall check. For each chunk it compares the number
// of ledger entries whose `source-chunk` matches the chunk id against the chunk's
// size, then flags chunks whose yield is near zero or far below their peers. The
// orchestrator re-extracts the flagged chunks before planning.
//
// SCOPE AND LIMITS: this is a *gross-failure* backstop. It reliably catches a chunk
// that yielded zero/near-zero entries or far fewer than its peers. It does NOT
// guarantee every topic inside an otherwise healthy chunk was captured — topic-level
// recall is the extractor's responsibility (its completeness sweep). Treat a pass
// here as "no chunk was grossly skipped," not "every fact was extracted."
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/extraction-audit.mjs \
//     --ledger <ledger.jsonl> --chunks <chunks.json> [--chunks <existing/chunks.json> ...] \
//     [--min-entries <n>] [--floor-per-1k <n>] [--ratio <r>] [--json <out>]
//
// Exit code is non-zero when any chunk is flagged (so the caller re-extracts);
// 0 when every chunk cleared the backstop.

import { readFileSync, writeFileSync } from "node:fs";

function parseJsonl(file) {
  const raw = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  const out = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* ignore non-JSON lines */
    }
  }
  return out;
}

function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function main() {
  const argv = process.argv.slice(2);
  let ledger = null;
  const chunkManifests = [];
  let jsonOut = null;
  // A chunk with fewer than this many entries is treated as a hard miss regardless
  // of size — extraction almost certainly skipped it.
  let minEntries = 2;
  // Absolute density floor: entries per 1000 approx tokens. Catches genuinely sparse
  // yield. Deliberately conservative to avoid false positives on low-content chunks.
  let floorPer1k = 5;
  // Relative floor: a chunk whose density is below ratio * median(density) is an
  // outlier next to its peers and is re-extracted.
  let ratio = 0.5;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ledger") ledger = argv[++i];
    else if (a === "--chunks") chunkManifests.push(argv[++i]);
    else if (a === "--min-entries") minEntries = parseInt(argv[++i], 10);
    else if (a === "--floor-per-1k") floorPer1k = parseFloat(argv[++i]);
    else if (a === "--ratio") ratio = parseFloat(argv[++i]);
    else if (a === "--json") jsonOut = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/extraction-audit.mjs --ledger <ledger.jsonl> --chunks <chunks.json> [--chunks ...] [--min-entries n] [--floor-per-1k n] [--ratio r] [--json out]\n"
      );
      process.exit(0);
    }
  }
  if (!ledger || chunkManifests.length === 0) {
    process.stderr.write("error: require --ledger and at least one --chunks\n");
    process.exit(2);
  }

  // Count ledger entries per source chunk.
  const counts = new Map();
  for (const item of parseJsonl(ledger)) {
    const id = item["source-chunk"] ?? item.sourceChunk;
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  // Gather chunks from every manifest (new material + existing-doc in update mode).
  const chunks = [];
  for (const mf of chunkManifests) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(mf, "utf8"));
    } catch (err) {
      process.stderr.write(`error: cannot read chunks manifest ${mf}: ${err.message}\n`);
      process.exit(2);
    }
    for (const c of manifest.chunks || []) {
      const approxTokens = c.approxTokens || Math.ceil((c.chars || 0) / 4) || 0;
      const entries = counts.get(c.id) || 0;
      const density = approxTokens > 0 ? entries / (approxTokens / 1000) : 0;
      chunks.push({ id: c.id, approxTokens, entries, density: Number(density.toFixed(2)) });
    }
  }

  if (chunks.length === 0) {
    process.stderr.write("error: no chunks found in the provided manifest(s)\n");
    process.exit(2);
  }

  const medianDensity = Number(median(chunks.map((c) => c.density)).toFixed(2));
  const relFloor = Number((ratio * medianDensity).toFixed(2));

  const flagged = [];
  for (const c of chunks) {
    const reasons = [];
    if (c.entries < minEntries) reasons.push(`entries ${c.entries} < min ${minEntries}`);
    if (c.density < floorPer1k) reasons.push(`density ${c.density}/1k < floor ${floorPer1k}/1k`);
    // Only apply the relative test when there are enough peers to form a stable median.
    if (chunks.length >= 3 && relFloor > 0 && c.density < relFloor)
      reasons.push(`density ${c.density}/1k < ${ratio}x median (${relFloor}/1k)`);
    if (reasons.length > 0) flagged.push({ id: c.id, entries: c.entries, density: c.density, reasons });
  }

  const report = {
    ok: flagged.length === 0,
    chunkCount: chunks.length,
    medianDensityPer1k: medianDensity,
    thresholds: { minEntries, floorPer1k, ratio, relativeFloorPer1k: relFloor },
    chunks,
    flaggedCount: flagged.length,
    flagged,
  };
  const outStr = JSON.stringify(report, null, 2);
  process.stdout.write(outStr + "\n");
  if (jsonOut) writeFileSync(jsonOut, outStr + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();

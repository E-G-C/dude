#!/usr/bin/env node
// ledger-digest.mjs — Compact, pre-structured view of the ledger for the planner.
//
// The planner is a single "reduce" call: it must group every ledger entry into
// sections and emit a coverage outline. Feeding it hundreds of raw JSONL objects
// (id + full text + type + tag + ... per line) makes that one call heavy enough to
// stall, because the model re-derives the tag grouping and re-scans types itself.
//
// This script does that bookkeeping deterministically. It groups ids by `tag`
// (in first-appearance order, which tracks narrative order), pre-lists the
// decision/action ids (which route to the Decisions and action items section) and
// the open-question ids, and gives one short example snippet per tag for naming.
// The planner then only has to arrange the tag groups into sections and copy id
// lists onto `covers:` lines — a much lighter task than reasoning over raw JSON.
//
// The full ledger is still available to the planner for detail; the digest just
// removes the bulk of the load from the common path.
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/ledger-digest.mjs --ledger <ledger.jsonl> [--out <digest.md>] [--snippet <chars>]
//
// Exits 0 on success, 2 on bad arguments or an unreadable ledger.

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
      /* skip non-JSON lines */
    }
  }
  return out;
}

function clean(text, max) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "\u2026";
}

function main() {
  const argv = process.argv.slice(2);
  let ledger = null;
  let out = null;
  let snippet = 90;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ledger") ledger = argv[++i];
    else if (a === "--out") out = argv[++i];
    else if (a === "--snippet") snippet = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/ledger-digest.mjs --ledger <ledger.jsonl> [--out digest.md] [--snippet chars]\n"
      );
      process.exit(0);
    }
  }
  if (!ledger) {
    process.stderr.write("error: require --ledger\n");
    process.exit(2);
  }
  if (!Number.isInteger(snippet) || snippet < 20) snippet = 90;

  let entries;
  try {
    entries = parseJsonl(ledger);
  } catch (err) {
    process.stderr.write(`error: cannot read ledger ${ledger}: ${err.message}\n`);
    process.exit(2);
  }
  if (entries.length === 0) {
    process.stderr.write("error: ledger has no parseable entries\n");
    process.exit(2);
  }

  const impRank = (v) => (v === "high" ? 0 : v === "medium" ? 1 : 2);
  const typeCounts = new Map();
  const decisionActionIds = [];
  const openQuestionIds = [];

  // Group by tag in first-appearance order.
  const tagOrder = [];
  const tags = new Map(); // tag -> { ids:[], types:Map, best:{importance,text} }

  for (const e of entries) {
    const id = e.id;
    if (!id) continue;
    const type = e.type || "fact";
    const tag = e.tag || "untagged";

    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (type === "decision" || type === "action") decisionActionIds.push(id);
    if (type === "open-question") openQuestionIds.push(id);

    if (!tags.has(tag)) {
      tags.set(tag, { ids: [], types: new Map(), best: null });
      tagOrder.push(tag);
    }
    const g = tags.get(tag);
    g.ids.push(id);
    g.types.set(type, (g.types.get(type) || 0) + 1);
    // Track the most important entry's text as the example snippet for this tag.
    if (!g.best || impRank(e.importance) < impRank(g.best.importance)) {
      g.best = { importance: e.importance, text: e.text };
    }
  }

  const typeSummary = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}=${c}`)
    .join(", ");

  const lines = [];
  lines.push(`# Ledger digest — ${entries.length} entries, ${tagOrder.length} tags`);
  lines.push("");
  lines.push(`types: ${typeSummary}`);
  lines.push("");
  lines.push("## Section-routing helpers");
  lines.push(
    `decision+action ids (route these to the "Decisions and action items" section): ${decisionActionIds.join(", ") || "(none)"}`
  );
  lines.push(`open-question ids (resolve only if another entry obviously answers them): ${openQuestionIds.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## Tags — assign each tag's ids to exactly one section (combine related tags)");
  lines.push("Each line: tag (count) [type breakdown] e.g. <snippet> :: <ids>");
  lines.push("");
  for (const tag of tagOrder) {
    const g = tags.get(tag);
    const typeBreak = [...g.types.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${t}\u00d7${c}`)
      .join(" ");
    const eg = clean(g.best?.text, snippet);
    lines.push(`- ${tag} (${g.ids.length}) [${typeBreak}] e.g. "${eg}" :: ${g.ids.join(", ")}`);
  }
  lines.push("");

  const digest = lines.join("\n") + "\n";
  if (out) {
    writeFileSync(out, digest);
    process.stderr.write(
      `digest: ${entries.length} entries -> ${tagOrder.length} tag groups, ${digest.length} chars written to ${out}\n`
    );
  } else {
    process.stdout.write(digest);
  }
  process.exit(0);
}

main();

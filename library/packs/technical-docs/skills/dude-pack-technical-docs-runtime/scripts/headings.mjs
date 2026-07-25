#!/usr/bin/env node
// headings.mjs — Extract the heading outline from a Markdown document.
//
// In update mode the planner reuses the existing document's section headings, but
// reading the whole prior document into the planner defeats context scaling for a
// large document. This emits just the heading lines — ATX (`#`..`######`) and
// setext (`=`/`-` underlines) — in order, ignoring `#` that appears inside fenced
// code blocks and any leading YAML front matter. The result is a compact outline
// the planner can consume cheaply regardless of how large the prior document is.
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/headings.mjs <doc.md> [--out <file>]
//
// Prints the heading list (one per line, normalized to ATX form) to stdout and,
// when --out is given, writes it there too. Exits 0 even when there are no
// headings (an empty outline is a valid result).

import { readFileSync, writeFileSync } from "node:fs";

function extractHeadings(md) {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");

  // Skip a leading YAML front-matter block so its `---` fences and `key: value`
  // lines cannot be mistaken for setext headings.
  let start = 0;
  if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
    for (let j = 1; j < lines.length; j++) {
      if (/^---\s*$/.test(lines[j])) {
        start = j + 1;
        break;
      }
    }
  }

  const out = [];
  let inFence = false;
  let fenceChar = "";
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks (``` or ~~~) so `#` inside them is never a heading.
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;

    // ATX heading: 1–6 leading '#', a space, text, optional trailing '#'.
    const atx = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (atx) {
      out.push({ level: atx[1].length, text: atx[2].trim() });
      continue;
    }

    // Setext heading: a non-blank text line directly underlined by '=' (H1) or
    // '-' (H2). Per CommonMark a '---' directly under a paragraph is a setext
    // underline, not a thematic break, so this is the correct interpretation.
    const next = lines[i + 1];
    if (
      next !== undefined &&
      line.trim() !== "" &&
      !/^\s{0,3}#/.test(line) &&
      !/^\s{0,3}(`{3,}|~{3,})/.test(line) &&
      /^\s{0,3}(=+|-+)\s*$/.test(next)
    ) {
      const isEq = next.trim()[0] === "=";
      out.push({ level: isEq ? 1 : 2, text: line.trim() });
      i++; // consume the underline line
      continue;
    }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  let input = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/headings.mjs <doc.md> [--out file]\n"
      );
      process.exit(0);
    } else input = a;
  }
  if (!input) {
    process.stderr.write("error: require <doc.md>\n");
    process.exit(2);
  }

  const md = readFileSync(input, "utf8");
  const headings = extractHeadings(md);
  const text = headings.map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n");
  const outStr = text.length ? text + "\n" : "";
  process.stdout.write(outStr);
  if (out) writeFileSync(out, outStr);
}

main();

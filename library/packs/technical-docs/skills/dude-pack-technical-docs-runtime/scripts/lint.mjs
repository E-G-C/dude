#!/usr/bin/env node
// lint.mjs — Deterministic structural checks for a finished Technical Document.
//
// Catches the mechanical defects that an LLM audit pass tends to miss, so the
// reviewer only has to act on real violations instead of re-reading the whole doc.
//
// Checks: leftover <!-- DIAGRAM --> and <!-- SECTION --> markers, any HTML
// comments/tags, unbalanced code fences, missing top-level title, heading-level
// jumps, and pure linear Mermaid blocks. Also tallies
// [NEEDS CLARIFICATION].
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/lint.mjs <file.md> [--json <out>]
//
// Prints a JSON report to stdout (and to --out if given). Exit code is non-zero
// when violations exist, 0 when clean.

import { readFileSync, writeFileSync } from "node:fs";

const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/?>/;

function stripMermaidLabel(node) {
  return node
    .trim()
    .replace(/^\|[^|]*\|\s*/, "")
    .replace(/[\[{(].*$/, "")
    .replace(/[^A-Za-z0-9_.$:-].*$/, "")
    .trim();
}

function addEdge(adjacency, reverseAdjacency, from, to) {
  if (!from || !to || from === "[" || to === "]") return;
  if (!adjacency.has(from)) adjacency.set(from, new Set());
  if (!reverseAdjacency.has(to)) reverseAdjacency.set(to, new Set());
  adjacency.get(from).add(to);
  reverseAdjacency.get(to).add(from);
}

function hasCycle(adjacency) {
  const visiting = new Set();
  const visited = new Set();

  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) || []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of adjacency.keys()) {
    if (visit(node)) return true;
  }
  return false;
}

function inspectMermaidBlock(blockLines) {
  const content = blockLines.join("\n");
  const bodyLines = blockLines.map((line) => line.trim()).filter(Boolean);
  const first = bodyLines.find((line) => !line.startsWith("%%")) || "";
  const lowerFirst = first.toLowerCase();

  if (lowerFirst.startsWith("sequencediagram")) {
    const hasControl = /^\s*(alt|else|opt|par|and|loop|critical|break)\b/im.test(content);
    return hasControl ? null : "Mermaid sequence diagram is purely linear; replace it with prose, numbered steps, or add only source-supported branches/alternates.";
  }

  if (!/^(graph|flowchart|statediagram-v2|statediagram)\b/i.test(first)) return null;

  const adjacency = new Map();
  const reverseAdjacency = new Map();
  let edgeCount = 0;
  let hasDecisionShape = false;
  let hasParallelSyntax = false;
  let hasChoiceState = false;

  for (const rawLine of bodyLines) {
    const line = rawLine.replace(/%%.*$/, "").trim();
    if (!line || /^(graph|flowchart|stateDiagram-v2|stateDiagram|direction|subgraph|end)\b/i.test(line)) continue;
    if (/<<\s*(choice|fork|join)\s*>>/i.test(line)) hasChoiceState = true;
    if (/\b[A-Za-z0-9_.$:-]+\s*\{/.test(line)) hasDecisionShape = true;
    if (/\s&\s/.test(line)) hasParallelSyntax = true;

    const edgeMatch = line.match(/^\s*([^\-~=]+?)\s*(?:-->|---|-.->|==>|--|~~>|--x|--o)\s*(.+?)\s*;?$/);
    if (!edgeMatch) continue;

    const from = stripMermaidLabel(edgeMatch[1]);
    const to = stripMermaidLabel(edgeMatch[2]);
    addEdge(adjacency, reverseAdjacency, from, to);
    edgeCount++;
  }

  if (edgeCount === 0) return null;

  const hasSplit = [...adjacency.values()].some((targets) => targets.size > 1);
  const hasMerge = [...reverseAdjacency.values()].some((sources) => sources.size > 1);
  const hasNonLinearStructure = hasDecisionShape || hasParallelSyntax || hasChoiceState || hasSplit || hasMerge || hasCycle(adjacency);

  return hasNonLinearStructure ? null : "Mermaid diagram is purely linear; replace it with prose, numbered steps, or a table unless the source supports a real branch, loop, merge, exception, or parallel path.";
}

function lint(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const violations = [];
  const add = (rule, line, message) => violations.push({ rule, line, message });

  let inFence = false;
  let fenceOpenLine = 0;
  let mermaidBlocks = 0;
  let currentFenceIsMermaid = false;
  let mermaidStartLine = 0;
  let mermaidLines = [];
  let lastHeadingLevel = 0;
  let firstHeading = true;
  let firstNonBlankSeen = false;
  let hasTitle = false;
  let needsClarification = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];

    const fenceMatch = line.match(/^\s*(```+|~~~+)(.*)$/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceOpenLine = ln;
        currentFenceIsMermaid = fenceMatch[2].trim().toLowerCase().startsWith("mermaid");
        if (currentFenceIsMermaid) {
          mermaidBlocks++;
          mermaidStartLine = ln;
          mermaidLines = [];
        }
      } else {
        if (currentFenceIsMermaid) {
          const message = inspectMermaidBlock(mermaidLines);
          if (message) add("linear-mermaid", mermaidStartLine, message);
        }
        inFence = false;
        currentFenceIsMermaid = false;
      }
      continue;
    }

    if (inFence && currentFenceIsMermaid) {
      mermaidLines.push(line);
    }

    const nc = line.match(/\[NEEDS CLARIFICATION/g);
    if (nc) needsClarification += nc.length;

    if (inFence) continue;

    const trimmed = line.trim();
    if (!firstNonBlankSeen && trimmed !== "") {
      firstNonBlankSeen = true;
      if (/^#\s+\S/.test(trimmed)) hasTitle = true;
      else add("title", ln, 'Document does not start with a top-level "# " title heading.');
    }

    if (/<!--\s*DIAGRAM\b/i.test(line)) {
      add("leftover-placeholder", ln, "Unresolved <!-- DIAGRAM ... --> placeholder remains.");
    } else if (/<!--\s*SECTION\b/i.test(line)) {
      add("leftover-section", ln, "Unfilled <!-- SECTION ... --> marker remains (a section was never drafted).");
    } else if (/<!--/.test(line)) {
      add("html-comment", ln, "HTML comment present in output.");
    }

    const tag = line.match(HTML_TAG);
    if (tag) add("html-tag", ln, `HTML tag present in output: ${tag[0]}`);

    const h = trimmed.match(/^(#{1,6})\s+(\S.*)$/);
    if (h) {
      const level = h[1].length;
      // Diagram captions (e.g. "#### Diagram 1 – Flow") are a deliberate convention
      // and are transparent to the structural heading sequence.
      const isDiagramCaption = /^Diagram\b/i.test(h[2]);
      if (!isDiagramCaption) {
        if (!firstHeading && level > lastHeadingLevel + 1) {
          add("heading-jump", ln, `Heading level jumps from ${lastHeadingLevel} to ${level}.`);
        }
        firstHeading = false;
        lastHeadingLevel = level;
      }
    }
  }

  if (inFence) add("unbalanced-fence", fenceOpenLine, "Unclosed code fence (opened here, never closed).");

  return {
    file,
    ok: violations.length === 0,
    stats: { lines: lines.length, mermaidBlocks, needsClarification, hasTitle },
    violations,
  };
}

function main() {
  const args = process.argv.slice(2);
  let file = null;
  let jsonOut = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") jsonOut = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      process.stdout.write("usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/lint.mjs <file.md> [--json <out>]\n");
      process.exit(0);
    } else if (!file) file = args[i];
  }
  if (!file) {
    process.stderr.write("error: no input file given\n");
    process.exit(2);
  }

  const report = lint(file);
  const outStr = JSON.stringify(report, null, 2);
  process.stdout.write(outStr + "\n");
  if (jsonOut) writeFileSync(jsonOut, outStr + "\n");
  process.exit(report.violations.length ? 1 : 0);
}

main();

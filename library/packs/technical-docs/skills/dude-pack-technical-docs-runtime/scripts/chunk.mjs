#!/usr/bin/env node
// chunk.mjs — Split cleaned transcript text into token-budgeted chunks with overlap.
//
// Produces the unit of scale for input: each chunk is small enough for one
// extractor call, and a manifest records ids/sizes. Splitting prefers paragraph
// boundaries, then sentence boundaries, and only hard-slices as a last resort.
// A small overlap carries trailing context into the next chunk so facts that
// straddle a boundary are not lost (duplicates are reconciled at the reduce step).
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs <clean.txt> --outdir <dir> [--budget <tokens>] [--overlap <tokens>] [--prefix C]
//
// Token counts are approximate (~4 chars/token) to avoid heavy dependencies.
// Writes chunk-NNN.txt files plus chunks.json into <dir>; prints the manifest JSON.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CHARS_PER_TOKEN = 4;

function splitSentences(paragraph) {
  const parts = paragraph.match(/[^.!?]+[.!?]+(?:["')\]]+)?\s*|[^.!?]+$/g);
  return parts ? parts.map((s) => s.trim()).filter(Boolean) : [paragraph];
}

// Break text into segments that are each <= budgetChars.
function segment(text, budgetChars) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const segments = [];
  for (const para of paragraphs) {
    if (para.length <= budgetChars) {
      segments.push(para);
      continue;
    }
    let buf = "";
    for (const sent of splitSentences(para)) {
      if (sent.length > budgetChars) {
        if (buf) {
          segments.push(buf);
          buf = "";
        }
        for (let i = 0; i < sent.length; i += budgetChars) {
          segments.push(sent.slice(i, i + budgetChars));
        }
        continue;
      }
      if ((buf + " " + sent).trim().length > budgetChars) {
        if (buf) segments.push(buf);
        buf = sent;
      } else {
        buf = buf ? buf + " " + sent : sent;
      }
    }
    if (buf) segments.push(buf);
  }
  return segments;
}

function overlapTail(text, overlapChars) {
  if (overlapChars <= 0 || text.length <= overlapChars) return "";
  const tail = text.slice(text.length - overlapChars);
  const sp = tail.indexOf(" ");
  return sp > 0 ? tail.slice(sp + 1) : tail; // snap to a word boundary
}

function pack(segments, budgetChars, overlapChars) {
  const chunks = [];
  let current = "";
  for (const seg of segments) {
    const candidate = current ? current + "\n\n" + seg : seg;
    if (candidate.length > budgetChars && current) {
      chunks.push(current);
      const ov = overlapTail(current, overlapChars);
      current = ov ? ov + "\n\n" + seg : seg;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function main() {
  const argv = process.argv.slice(2);
  let input = null;
  let outdir = null;
  // Extraction-safe default: ~3000 tokens (~12k chars) per chunk with ~200
  // overlap. Dense transcripts can produce 100+ JSONL facts from a 6000-token
  // chunk, which makes the extractor prone to stalls after reading the chunk.
  // Smaller chunks keep each subagent call and incremental ledger write bounded.
  let budget = 3000;
  let overlap = 200;
  let prefix = "C";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--outdir") outdir = argv[++i];
    else if (a === "--budget") budget = parseInt(argv[++i], 10);
    else if (a === "--overlap") overlap = parseInt(argv[++i], 10);
    else if (a === "--prefix") prefix = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/chunk.mjs <clean.txt> --outdir <dir> [--budget tokens] [--overlap tokens] [--prefix C]\n"
      );
      process.exit(0);
    } else input = a;
  }
  if (!input || !outdir) {
    process.stderr.write("error: require <clean.txt> and --outdir\n");
    process.exit(2);
  }
  if (!Number.isInteger(budget) || budget <= 0) {
    process.stderr.write(`error: --budget must be a positive integer (got "${budget}")\n`);
    process.exit(2);
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    process.stderr.write(`error: --overlap must be a non-negative integer (got "${overlap}")\n`);
    process.exit(2);
  }
  if (overlap >= budget) {
    process.stderr.write(`error: --overlap (${overlap}) must be smaller than --budget (${budget})\n`);
    process.exit(2);
  }

  const text = readFileSync(input, "utf8").replace(/\r\n?/g, "\n").trim();
  const budgetChars = budget * CHARS_PER_TOKEN;
  const overlapChars = Math.max(0, overlap * CHARS_PER_TOKEN);

  const segments = segment(text, budgetChars);
  const chunkTexts = pack(segments, budgetChars, overlapChars);

  mkdirSync(outdir, { recursive: true });
  const pad = Math.max(3, String(chunkTexts.length).length);
  const chunks = [];
  chunkTexts.forEach((ct, idx) => {
    const num = String(idx + 1).padStart(pad, "0");
    const id = `${prefix}${num}`;
    const file = `chunk-${num}.txt`;
    writeFileSync(join(outdir, file), ct + "\n");
    chunks.push({ id, file, chars: ct.length, approxTokens: Math.ceil(ct.length / CHARS_PER_TOKEN) });
  });

  const manifest = {
    source: input,
    outdir,
    budgetTokens: budget,
    overlapTokens: overlap,
    chunkCount: chunks.length,
    chunks,
  };
  writeFileSync(join(outdir, "chunks.json"), JSON.stringify(manifest, null, 2) + "\n");
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");

  if (chunks.length === 0) {
    process.stderr.write("error: no content to chunk \u2014 the input was empty after preprocessing\n");
    process.exit(3);
  }
}

main();

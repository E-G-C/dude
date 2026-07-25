#!/usr/bin/env node
// preprocess.mjs — Deterministic source-material cleaner for the TD pipeline.
//
// Handles transcripts (WEBVTT/SRT), rough notes, and plain text/markdown. For
// genuine WEBVTT it strips the header and NOTE/STYLE/REGION blocks; for any input
// it strips timestamps, cue identifiers (numeric cue numbers, or arbitrary WebVTT
// identifiers such as GUIDs, when immediately followed by a timestamp), and
// voice/format markup (<v ...>, <c ...>, <i>, inline <00:00:00.000> tags), then
// normalizes whitespace. Speaker *content* is preserved. Rough notes pass through
// largely unchanged — WEBVTT-only stripping is skipped unless the file begins with
// the WEBVTT header, so lines like "NOTE: ..." in notes are kept as content.
//
// Usage:
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs <input...> --out <file>
//   node .github/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs <input...>              (writes cleaned text to stdout)
//
// On success prints a JSON summary to stderr so stdout can stay clean when piping.
// When --out is given, the JSON summary is printed to stdout instead.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TS = "(?:\\d{1,2}:)?\\d{2}:\\d{2}[.,]\\d{3}";
const TS_RANGE = new RegExp(`${TS}\\s*-->\\s*${TS}(?:[ \\t]+[A-Za-z]+:[^\\s]+)*`, "g");
const INLINE_TS_TAG = new RegExp(`<${TS}>`, "g");
const TS_LINE_START = new RegExp(`^${TS}\\s*-->\\s*${TS}`);
const VOICE_TAG = /<\/?v\b[^>]*>/gi;
const CLASS_TAG = /<\/?c\b[^>]*>/gi;
const FMT_TAG = /<\/?(?:i|b|u|lang|ruby|rt)\b[^>]*>/gi;

function countAndStrip(text, re) {
  const n = (text.match(re) || []).length;
  return [text.replace(re, ""), n];
}

// A line is a cue identifier when the line that follows it is a timestamp range.
// Numeric SRT/VTT cue numbers are detected for any input (a blank line may sit
// between the number and the timestamp). For genuine WebVTT, an identifier may be
// arbitrary text — e.g. a Teams/Stream GUID like "ba598990-.../51-0" — so any
// non-blank, non-"-->" line *immediately* before a timestamp is treated as an
// identifier too. The "next line is a timestamp" guard keeps plain-text numeric or
// text lines (with no following timestamp) intact, so rough notes are unaffected.
function findCueIdentifierLines(rawLines, webVtt) {
  const drop = new Set();
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (t === "") continue;
    if (/^\d+$/.test(t)) {
      let j = i + 1;
      while (j < rawLines.length && rawLines[j].trim() === "") j++;
      if (j < rawLines.length && TS_LINE_START.test(rawLines[j].trim())) drop.add(i);
    } else if (
      webVtt &&
      !t.includes("-->") &&
      i + 1 < rawLines.length &&
      TS_LINE_START.test(rawLines[i + 1].trim())
    ) {
      drop.add(i);
    }
  }
  return drop;
}

// True only for genuine WebVTT (the spec requires the file to begin with the
// "WEBVTT" signature). Gates WebVTT-only stripping so rough notes and markdown
// that happen to contain "NOTE"/"STYLE"/"REGION" lines are not destroyed.
function isWebVtt(rawLines) {
  for (const l of rawLines) {
    const t = l.trim();
    if (t === "") continue;
    return /^WEBVTT\b/.test(t);
  }
  return false;
}

function cleanText(raw) {
  const text0 = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rawLines = text0.split("\n");
  const webVtt = isWebVtt(rawLines);
  const cueIdentifierLines = findCueIdentifierLines(rawLines, webVtt);

  let text = text0;
  let removedTimestamps = 0;
  let removedTags = 0;

  let n;
  [text, n] = countAndStrip(text, TS_RANGE);
  removedTimestamps += n;
  [text, n] = countAndStrip(text, INLINE_TS_TAG);
  removedTimestamps += n;
  for (const re of [VOICE_TAG, CLASS_TAG, FMT_TAG]) {
    [text, n] = countAndStrip(text, re);
    removedTags += n;
  }

  // The global strips above do not add or remove newlines, so line indices stay
  // aligned with rawLines and the cue-identifier set computed from them.
  const lines = text.split("\n");
  const kept = [];
  let skippingBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (skippingBlock) {
      if (trimmed === "") skippingBlock = false;
      continue;
    }
    if (webVtt && /^(NOTE|STYLE|REGION)\b/.test(trimmed)) {
      skippingBlock = true;
      continue;
    }
    if (webVtt && /^WEBVTT\b/.test(trimmed)) continue; // header line
    if (cueIdentifierLines.has(i)) continue; // SRT/VTT cue identifier (next line is a timestamp)
    kept.push(lines[i].replace(/^[ \t]+|[ \t]+$/g, ""));
  }

  let cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned) cleaned += "\n";
  return { cleaned, removedTimestamps, removedTags };
}

function main() {
  const argv = process.argv.slice(2);
  const inputs = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write("usage: node .github/skills/dude-pack-technical-docs-runtime/scripts/preprocess.mjs <input...> [--out <file>]\n");
      process.exit(0);
    } else inputs.push(a);
  }
  if (inputs.length === 0) {
    process.stderr.write("error: no input files given\n");
    process.exit(2);
  }

  let inputChars = 0;
  let removedTimestamps = 0;
  let removedTags = 0;
  const parts = [];
  for (const file of inputs) {
    const raw = readFileSync(file, "utf8");
    inputChars += raw.length;
    const r = cleanText(raw);
    removedTimestamps += r.removedTimestamps;
    removedTags += r.removedTags;
    parts.push(r.cleaned.trimEnd());
  }
  const cleaned = parts.filter(Boolean).join("\n\n") + "\n";

  const summary = {
    inputs,
    out,
    inputChars,
    outputChars: cleaned.length,
    approxInputTokens: Math.ceil(inputChars / 4),
    approxOutputTokens: Math.ceil(cleaned.length / 4),
    removedTimestamps,
    removedTags,
  };

  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, cleaned);
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    process.stdout.write(cleaned);
    process.stderr.write(JSON.stringify(summary, null, 2) + "\n");
  }
}

main();

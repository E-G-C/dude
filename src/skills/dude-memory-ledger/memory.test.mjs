// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseEntries,
  appendEntry,
  analyzeAppend,
  appendToFile,
  parseArgs,
  DUP_THRESHOLD,
  CONSOLIDATE_AT,
} from './memory.mjs';

test('parseEntries reads top-level bullet entries', () => {
  const c = '# Decisions\n\n- first fact\n- second fact\n  - nested (ignored)\n* star bullet\n';
  const e = parseEntries(c);
  assert.deepEqual(e.map((x) => x.text), ['first fact', 'second fact', 'star bullet']);
});

test('appendEntry adds a bullet and normalizes', () => {
  assert.equal(appendEntry('# T\n\n- a', 'b'), '# T\n\n- a\n- b\n');
  assert.equal(appendEntry('', 'first'), '- first\n');
});

test('analyzeAppend flags a near-duplicate and counts entries', () => {
  const c = '- avoid CRLF line endings in bundle files\n- use LF everywhere\n';
  const a = analyzeAppend(c, 'avoid CRLF line endings in the bundle files');
  assert.ok(a.maxScore >= DUP_THRESHOLD);
  assert.equal(a.entryCount, 2);
  assert.ok(a.overlaps.length >= 1);
});

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-mem-'));
  const file = path.join(dir, 'decisions.md');
  if (content != null) fs.writeFileSync(file, content);
  return { dir, file };
}

test('appendToFile writes a distinct entry', () => {
  const { dir, file } = tmpFile('# Decisions\n\n- ship packs as core\n');
  try {
    const r = appendToFile({ file, text: 'prefer sqlite for the session store' });
    assert.equal(r.ok, true);
    assert.equal(r.wrote, true);
    assert.ok(fs.readFileSync(file, 'utf8').includes('- prefer sqlite for the session store'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('appendToFile refuses a near-duplicate unless --force', () => {
  const { dir, file } = tmpFile('- normalize line endings to LF on import\n');
  try {
    const dup = 'always normalize line endings to LF on import';
    const refused = appendToFile({ file, text: dup });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 2);
    assert.match(refused.error || '', /near-duplicate/);
    // file untouched
    assert.equal(parseEntries(fs.readFileSync(file, 'utf8')).length, 1);
    // force appends anyway
    const forced = appendToFile({ file, text: dup, force: true });
    assert.equal(forced.ok, true);
    assert.equal(parseEntries(fs.readFileSync(file, 'utf8')).length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--check reports without writing', () => {
  const { dir, file } = tmpFile('- one existing entry\n');
  try {
    const r = appendToFile({ file, text: 'a brand new distinct note', check: true });
    assert.equal(r.wrote, false);
    assert.equal(parseEntries(fs.readFileSync(file, 'utf8')).length, 1, 'unchanged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('consolidation warning fires at the threshold', () => {
  const many = Array.from({ length: CONSOLIDATE_AT - 1 }, (_, i) => `- distinct entry number ${i} about topic ${i}`).join('\n');
  const { dir, file } = tmpFile(`${many}\n`);
  try {
    const r = appendToFile({ file, text: 'a genuinely different final note xyzzy' });
    assert.equal(r.ok, true);
    assert.ok(r.warnings.some((w) => /consider consolidating/.test(w)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseArgs parses append flags', () => {
  const a = parseArgs(['append', 'decisions.md', '--text', 'x', '--force']);
  assert.equal(a.cmd, 'append');
  assert.equal(a.file, 'decisions.md');
  assert.equal(a.text, 'x');
  assert.equal(a.force, true);
});

// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeLineEndings,
  stripTrailingWs,
  ensureFinalNewline,
  normalizeString,
  normalizeFile,
  normalizePath,
  isTextFile,
  TEXT_EXTENSIONS,
} from './text.mjs';

test('normalizeLineEndings converts CRLF and lone CR to LF', () => {
  assert.equal(normalizeLineEndings('a\r\nb\rc\n'), 'a\nb\nc\n');
  assert.equal(normalizeLineEndings('no newlines'), 'no newlines');
});

test('stripTrailingWs removes trailing spaces/tabs per line and at EOF', () => {
  assert.equal(stripTrailingWs('a  \nb\t\nc'), 'a\nb\nc');
  assert.equal(stripTrailingWs('keep  internal   spaces'), 'keep  internal   spaces');
  assert.equal(stripTrailingWs('trailing   '), 'trailing');
});

test('ensureFinalNewline yields exactly one trailing newline; empty stays empty', () => {
  assert.equal(ensureFinalNewline('a'), 'a\n');
  assert.equal(ensureFinalNewline('a\n\n\n'), 'a\n');
  assert.equal(ensureFinalNewline('a\n'), 'a\n');
  assert.equal(ensureFinalNewline(''), '');
});

test('normalizeString composes all three and is idempotent', () => {
  const messy = 'a  \r\nb\t\r\n\r\n';
  const once = normalizeString(messy);
  assert.equal(once, 'a\nb\n');
  assert.equal(normalizeString(once), once, 'idempotent');
});

test('normalizeFile rewrites only when changed and reports the change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-text-'));
  try {
    const f = path.join(dir, 'x.md');
    fs.writeFileSync(f, 'a  \r\nb\r\n');
    assert.equal(normalizeFile(f), true);
    assert.equal(fs.readFileSync(f, 'utf8'), 'a\nb\n');
    // second run is a no-op
    assert.equal(normalizeFile(f), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isTextFile only matches known text extensions', () => {
  assert.equal(isTextFile('a.md'), true);
  assert.equal(isTextFile('a.SCSS'), true);
  assert.equal(isTextFile('a.png'), false);
  assert.equal(isTextFile('LICENSE'), false);
  assert.ok(TEXT_EXTENSIONS.has('.mjs'));
});

test('normalizePath normalizes text files under a dir and leaves binaries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-text-'));
  try {
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    const md = path.join(dir, 'a.md');
    const nested = path.join(dir, 'sub', 'b.yml');
    const bin = path.join(dir, 'img.png');
    fs.writeFileSync(md, 'x\r\n');
    fs.writeFileSync(nested, 'y  \r\n');
    fs.writeFileSync(bin, Buffer.from([0x00, 0x0d, 0x0a, 0xff]));
    const changed = normalizePath(dir).sort();
    assert.deepEqual(changed, [md, nested].sort());
    assert.equal(fs.readFileSync(md, 'utf8'), 'x\n');
    assert.equal(fs.readFileSync(nested, 'utf8'), 'y\n');
    // binary untouched (byte-for-byte)
    assert.deepEqual([...fs.readFileSync(bin)], [0x00, 0x0d, 0x0a, 0xff]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

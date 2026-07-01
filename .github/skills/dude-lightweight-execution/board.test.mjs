// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run, parseArgs, readSnapshot } from './board.mjs';

const FIXTURE = `# Feature X — tasks

## Setup
- [x] T001@aaaaaaaa Setup repo

## Foundational
- [ ] T002@bbbbbbbb Foundational schema
   deps: T001@aaaaaaaa

## Polish
- [ ] T003@cccccccc Final polish
`;

/** Build a throwaway root with a tasks.md and a .github/dudestuff dir. */
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-board-'));
  fs.mkdirSync(path.join(root, '.github', 'dudestuff'), { recursive: true });
  fs.mkdirSync(path.join(root, 'specs', 'x'), { recursive: true });
  const file = path.join(root, 'specs', 'x', 'tasks.md');
  fs.writeFileSync(file, FIXTURE);
  return { root, file };
}

/** Capture stdout + stderr produced by run(). */
function capture(fn) {
  const chunks = [];
  const outOrig = process.stdout.write.bind(process.stdout);
  const errOrig = process.stderr.write.bind(process.stderr);
  // @ts-ignore
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  // @ts-ignore
  process.stderr.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  let code;
  try {
    code = fn();
  } finally {
    process.stdout.write = outOrig;
    process.stderr.write = errOrig;
  }
  return { code, out: chunks.join('') };
}

test('parseArgs reads command, file, flags, and root', () => {
  const a = parseArgs(['render', 'tasks.md', '--write', '--root', '/tmp/x']);
  assert.equal(a.cmd, 'render');
  assert.equal(a.file, 'tasks.md');
  assert.equal(a.write, true);
  assert.equal(a.root, '/tmp/x');
});

test('next prints the top ready task', () => {
  const { root, file } = scaffold();
  try {
    const { code, out } = capture(() => run({ cmd: 'next', file, root }));
    assert.equal(code, 0);
    assert.equal(out.trim(), 'T002@bbbbbbbb');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('render --check reports stale (exit 3) then clean (exit 0) after --write', () => {
  const { root, file } = scaffold();
  try {
    assert.equal(capture(() => run({ cmd: 'render', file, root, check: true })).code, 3);
    const w = capture(() => run({ cmd: 'render', file, root, write: true }));
    assert.equal(w.code, 0);
    assert.ok(fs.readFileSync(file, 'utf8').includes('<!-- dude:board:start -->'));
    assert.equal(capture(() => run({ cmd: 'render', file, root, check: true })).code, 0);
    // snapshot recorded
    const snap = readSnapshot(root);
    assert.equal(snap['specs/x/tasks.md'].glyphs['T001@aaaaaaaa'], 'x');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('set --write flips the glyph and updates the snapshot', () => {
  const { root, file } = scaffold();
  try {
    // establish a baseline snapshot first
    run({ cmd: 'render', file, root, write: true });
    const r = capture(() => run({ cmd: 'set', file, id: 'T002@bbbbbbbb', state: 'done', root, write: true }));
    assert.equal(r.code, 0);
    assert.ok(fs.readFileSync(file, 'utf8').includes('- [x] T002@bbbbbbbb Foundational schema'));
    assert.equal(readSnapshot(root)['specs/x/tasks.md'].glyphs['T002@bbbbbbbb'], 'x');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('set without --write is a dry run and does not touch the file', () => {
  const { root, file } = scaffold();
  try {
    const before = fs.readFileSync(file, 'utf8');
    const r = capture(() => run({ cmd: 'set', file, id: 'T002@bbbbbbbb', state: 'x', root }));
    assert.equal(r.code, 0);
    assert.match(r.out, /dry run/);
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'file unchanged');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('set on an unknown id exits 2', () => {
  const { root, file } = scaffold();
  try {
    assert.equal(capture(() => run({ cmd: 'set', file, id: 'T404@00000000', state: 'x', root, write: true })).code, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff flags a human-applied [x] after a baseline is recorded', () => {
  const { root, file } = scaffold();
  try {
    run({ cmd: 'render', file, root, write: true }); // baseline snapshot
    // simulate a user hand-checking T003
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('- [ ] T003@cccccccc', '- [x] T003@cccccccc'));
    const r = capture(() => run({ cmd: 'diff', file, root }));
    assert.match(r.out, /UNVERIFIED-DONE\] T003@cccccccc/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('diff without a snapshot reports no baseline', () => {
  const { root, file } = scaffold();
  try {
    const r = capture(() => run({ cmd: 'diff', file, root }));
    assert.match(r.out, /no snapshot baseline/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing file exits 2; usage without args exits 1', () => {
  assert.equal(capture(() => run({ cmd: 'next', file: '/nope/tasks.md', root: '/tmp' })).code, 2);
  assert.equal(capture(() => run({ help: false })).code, 1);
});

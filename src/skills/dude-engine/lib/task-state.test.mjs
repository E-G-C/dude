// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// TDD (T037): ./task-state.mjs is authored by the Coder step of this task. Until
// that module lands, every test in this file is RED with ERR_MODULE_NOT_FOUND —
// that module-not-found failure is the intended failing-first regression, not a
// defect. Once the Coder creates the shared parser/serializer, this whole file
// must go green.
// @ts-ignore -- ../lib/task-state.mjs is created by the T037 Coder step
import { parseTaskState, readTaskState, upsertTaskStateEntry } from './task-state.mjs';

/** A canonical `new Date().toISOString()`-shaped timestamp. */
const ISO = '2026-01-01T00:00:00.000Z';
/** A canonical task-file identity used as a snapshot key. */
const CANON = '.dude/specs/x/tasks.md';

/** @returns {Record<string, unknown>} a fully schema-valid populated snapshot. */
function validState() {
  return {
    [CANON]: {
      glyphs: { 'T001@aaaaaaaa': 'x', 'T002@bbbbbbbb': ' ' },
      updated_at: ISO,
    },
  };
}

/** Throwaway root that owns an empty `.dude/state` directory. @returns {string} */
function scaffold() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-task-state-'));
  fs.mkdirSync(path.join(root, '.dude', 'state'), { recursive: true });
  return root;
}

/** @param {string} root @returns {string} */
function statePath(root) {
  return path.join(root, '.dude', 'state', 'task-state.json');
}

// --- readTaskState (filesystem) --------------------------------------------

test('readTaskState reports a missing snapshot as absent', () => {
  const root = scaffold();
  try {
    assert.equal(fs.existsSync(statePath(root)), false);
    assert.deepEqual(readTaskState(root), { status: 'absent' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readTaskState reads an empty {} snapshot as ok with empty state', () => {
  const root = scaffold();
  try {
    fs.writeFileSync(statePath(root), '{}\n');
    const result = readTaskState(root);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.state, {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readTaskState reads a valid populated snapshot as ok with parsed state', () => {
  const root = scaffold();
  try {
    fs.writeFileSync(statePath(root), `${JSON.stringify(validState(), null, 2)}\n`);
    const result = readTaskState(root);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.state, validState());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('readTaskState treats a directory in place of the snapshot as corrupt', () => {
  const root = scaffold();
  try {
    fs.mkdirSync(statePath(root), { recursive: true });
    const result = readTaskState(root);
    assert.equal(result.status, 'corrupt');
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'nonempty reason');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  'readTaskState rejects a symlinked snapshot file as corrupt without reading its target',
  { skip: process.platform === 'win32' },
  () => {
    const root = scaffold();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-task-state-outside-'));
    try {
      const external = path.join(outside, 'task-state.json');
      fs.writeFileSync(external, '{"SECRET_SENTINEL":true}\n');
      fs.symlinkSync(external, statePath(root));
      const result = readTaskState(root);
      assert.equal(result.status, 'corrupt');
      assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'nonempty reason');
      assert.doesNotMatch(result.reason, /SECRET_SENTINEL/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  },
);

test(
  'readTaskState rejects a snapshot reached through an ancestor symlink as corrupt',
  { skip: process.platform === 'win32' },
  () => {
    const root = scaffold();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-task-state-ancestor-'));
    try {
      fs.writeFileSync(path.join(outside, 'task-state.json'), '{"SECRET_SENTINEL":true}\n');
      fs.rmSync(path.join(root, '.dude', 'state'), { recursive: true, force: true });
      fs.symlinkSync(outside, path.join(root, '.dude', 'state'), 'dir');
      const result = readTaskState(root);
      assert.equal(result.status, 'corrupt');
      assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'nonempty reason');
      assert.doesNotMatch(result.reason, /SECRET_SENTINEL/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  },
);

test(
  'readTaskState treats an unreadable (EACCES) snapshot as corrupt',
  { skip: process.platform === 'win32' },
  (context) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return context.skip('cannot exercise EACCES while running as root');
    }
    const root = scaffold();
    const target = statePath(root);
    try {
      fs.writeFileSync(target, `${JSON.stringify(validState())}\n`);
      fs.chmodSync(target, 0o000);
      const result = readTaskState(root);
      if (result.status === 'ok') {
        return context.skip('filesystem ignored 0o000 permissions');
      }
      assert.equal(result.status, 'corrupt');
      assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'nonempty reason');
    } finally {
      try {
        fs.chmodSync(target, 0o600);
      } catch {
        /* best effort */
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

// --- parseTaskState (pure) --------------------------------------------------

test('parseTaskState accepts an empty object and a valid populated snapshot', () => {
  const empty = parseTaskState('{}');
  assert.equal(empty.status, 'ok');
  assert.deepEqual(empty.state, {});

  const populated = parseTaskState(JSON.stringify(validState()));
  assert.equal(populated.status, 'ok');
  assert.deepEqual(populated.state, validState());
});

test('parseTaskState reports every wrong-schema shape as corrupt with a nonempty reason', () => {
  const cases = [
    // Non-object / array / null top -> the reused `malformed JSON object` wording.
    { name: 'array top', text: '[]', match: /malformed JSON object/ },
    { name: 'null top', text: 'null', match: /malformed JSON object/ },
    { name: 'number top', text: '42', match: /malformed JSON object/ },
    { name: 'string top', text: '"nope"', match: /malformed JSON object/ },
    { name: 'unparseable JSON', text: '{ not json', match: /malformed JSON object/ },
    // Non-canonical key -> the reused `invalid task-state key '<key>'` wording.
    {
      name: 'non-canonical key',
      text: JSON.stringify({ 'specs/x/tasks.md': { glyphs: {}, updated_at: ISO } }),
      match: /invalid task-state key 'specs\/x\/tasks\.md'/,
    },
    // Entry shape must be exactly { glyphs, updated_at }.
    { name: 'entry is a string', text: JSON.stringify({ [CANON]: 'nope' }) },
    { name: 'entry is an array', text: JSON.stringify({ [CANON]: [] }) },
    { name: 'entry is null', text: JSON.stringify({ [CANON]: null }) },
    { name: 'entry missing glyphs', text: JSON.stringify({ [CANON]: { updated_at: ISO } }) },
    { name: 'entry missing updated_at', text: JSON.stringify({ [CANON]: { glyphs: {} } }) },
    {
      name: 'entry extra field',
      text: JSON.stringify({ [CANON]: { glyphs: {}, updated_at: ISO, extra: true } }),
    },
    // glyphs map: object of durable task keys -> single-char state glyphs.
    { name: 'glyphs not an object', text: JSON.stringify({ [CANON]: { glyphs: [], updated_at: ISO } }) },
    { name: 'glyphs is null', text: JSON.stringify({ [CANON]: { glyphs: null, updated_at: ISO } }) },
    {
      name: 'bad task key',
      text: JSON.stringify({ [CANON]: { glyphs: { nope: 'x' }, updated_at: ISO } }),
    },
    {
      name: 'bad glyph value',
      text: JSON.stringify({ [CANON]: { glyphs: { 'T001@aaaaaaaa': 'z' }, updated_at: ISO } }),
    },
    // updated_at must match the strict new Date().toISOString() shape.
    {
      name: 'updated_at date only',
      text: JSON.stringify({ [CANON]: { glyphs: {}, updated_at: '2026-01-01' } }),
    },
    {
      name: 'updated_at without milliseconds',
      text: JSON.stringify({ [CANON]: { glyphs: {}, updated_at: '2026-01-01T00:00:00Z' } }),
    },
  ];

  for (const fixture of cases) {
    const result = parseTaskState(fixture.text);
    assert.equal(result.status, 'corrupt', `${fixture.name}: expected corrupt`);
    assert.ok(
      typeof result.reason === 'string' && result.reason.length > 0,
      `${fixture.name}: expected a nonempty reason`,
    );
    if (fixture.match) assert.match(result.reason, fixture.match, fixture.name);
  }
});

// --- upsertTaskStateEntry (validated write) ---------------------------------

test('upsertTaskStateEntry preserves unrelated features, sorts keys, and round-trips as ok', () => {
  const root = scaffold();
  try {
    const featureA = '.dude/specs/aaa/tasks.md';
    const featureB = '.dude/specs/bbb/tasks.md';
    const aEntry = { glyphs: { 'T001@aaaaaaaa': 'x' }, updated_at: ISO };
    fs.writeFileSync(statePath(root), `${JSON.stringify({ [featureA]: aEntry }, null, 2)}\n`);

    upsertTaskStateEntry(root, featureB, { 'T002@bbbbbbbb': ' ' });

    const result = readTaskState(root);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.state[featureA], aEntry, 'unrelated feature A preserved exactly');
    assert.deepEqual(result.state[featureB].glyphs, { 'T002@bbbbbbbb': ' ' });
    assert.match(
      result.state[featureB].updated_at,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      'a fresh ISO updated_at is stamped',
    );

    const raw = fs.readFileSync(statePath(root), 'utf8');
    const parsed = JSON.parse(raw);
    assert.deepEqual(
      Object.keys(parsed),
      Object.keys(parsed).slice().sort(),
      'keys serialized in sorted order',
    );
    assert.equal(raw, `${JSON.stringify(parsed, null, 2)}\n`, 'two-space indent + trailing newline');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upsertTaskStateEntry fails closed on pre-existing corruption and leaves the file byte-unchanged', () => {
  const cases = [
    { name: 'malformed JSON', body: '{ this is not json\n' },
    {
      name: 'wrong-schema glyph value',
      body: `${JSON.stringify(
        { [CANON]: { glyphs: { 'T001@aaaaaaaa': 'z' }, updated_at: ISO } },
        null,
        2,
      )}\n`,
    },
  ];

  for (const fixture of cases) {
    const root = scaffold();
    try {
      fs.writeFileSync(statePath(root), fixture.body);
      const before = fs.readFileSync(statePath(root));
      assert.throws(
        () => upsertTaskStateEntry(root, CANON, { 'T001@aaaaaaaa': 'x' }),
        `${fixture.name}: expected upsert to throw on pre-existing corruption`,
      );
      assert.deepEqual(
        fs.readFileSync(statePath(root)),
        before,
        `${fixture.name}: file must be byte-unchanged`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

// @ts-check
/**
 * Tests for repetition.mjs — the cross-file prose repetition report.
 * Every fixture is built in a temporary directory; the live `docs/` and
 * `README.md` files are deliberately never read, so repairing them cannot
 * break this suite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'repetition.mjs');

const CLAUSE = 'The coordinator owns lane state and the specialist reports the change back to it';
const PHRASE = 'Applicability is computed at dispatch and is never stored';
const LONG_CLAUSE = 'Every installed skill already carries a description written to be matched by the '
  + 'coordinator at dispatch time';

/** @param {string[]} args */
function run(args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Unique filler so no window repeats across files by accident. @param {string} seed */
function filler(seed, count = 24) {
  return Array.from({ length: count }, (_, i) => `${seed}word${i}`).join(' ');
}

/** @param {import('node:test').TestContext} t */
function fixtureDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dude-repetition-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** @param {string} dir @param {string} name @param {string} content */
function write(dir, name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

/**
 * One file per seed, each wrapping the shared body in unique filler.
 * @param {string} dir @param {number} count @param {(index: number) => string} body
 */
function writeSet(dir, count, body) {
  return Array.from({ length: count }, (_, i) => write(
    dir,
    `doc-${i}.md`,
    `# Doc ${i}\n\n${filler(`a${i}`)}\n\n${body(i)}\n\n${filler(`z${i}`)}\n`,
  ));
}

test('reports a clause repeated verbatim across five files', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 5, () => CLAUSE);
  const result = run(files);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /^\[FAIL\] 1 phrase\(s\)/);
  assert.match(result.stdout, /5 file\(s\)/);
  assert.ok(result.stdout.includes(CLAUSE.toLowerCase()), result.stdout);
  for (const file of files) assert.ok(result.stdout.includes(file), `missing ${file}`);
});

test('reports a phrase repeated verbatim across six files', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 6, () => PHRASE);
  const result = run(files);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /^\[FAIL\] 1 phrase\(s\)/);
  assert.match(result.stdout, /6 file\(s\)/);
  assert.ok(result.stdout.includes(PHRASE.toLowerCase()), result.stdout);
  for (const file of files) assert.ok(result.stdout.includes(file), `missing ${file}`);
});

test('signals a clean result when nothing repeats across files', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 4, (i) => `Distinct sentence ${i} ${filler(`b${i}`, 12)}`);
  const result = run(files);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^\[OK\] no phrase of 8\+ words repeated across 3 or more of 4 file\(s\)/);
});

test('ignores repetition inside fenced code blocks', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 4, () => `\`\`\`bash\n# ${CLAUSE}\n${CLAUSE}\n\`\`\``);
  const result = run(files);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^\[OK\]/);
});

test('ignores repetition inside inline code spans', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 4, () => `Run \`${CLAUSE}\` now.`);
  const result = run(files);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^\[OK\]/);
});

test('collapses overlapping windows into the longest shared phrase', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 4, (i) => `${filler(`c${i}`, 6)}. ${LONG_CLAUSE}. ${filler(`d${i}`, 6)}.`);
  const result = run(files);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /^\[FAIL\] 1 phrase\(s\)/);
  assert.ok(result.stdout.includes(`${LONG_CLAUSE.toLowerCase()}.`), result.stdout);
  assert.match(result.stdout, /1\. 17 words in 4 file\(s\)/);
});

test('--min-words lowers the phrase length threshold', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 3, () => 'Guidance reaches the acting specialist');

  assert.equal(run(files).code, 0);

  const overridden = run([...files, '--min-words', '5']);
  assert.equal(overridden.code, 1);
  assert.match(overridden.stdout, /^\[FAIL\] 1 phrase\(s\) of 5\+ words/);
  assert.ok(overridden.stdout.includes('guidance reaches the acting specialist'), overridden.stdout);
});

test('--min-files lowers the file count threshold', (t) => {
  const dir = fixtureDir(t);
  const files = writeSet(dir, 2, () => CLAUSE);

  assert.equal(run(files).code, 0);

  const overridden = run([...files, '--min-files=2']);
  assert.equal(overridden.code, 1);
  assert.match(overridden.stdout, /^\[FAIL\] 1 phrase\(s\) of 8\+ words repeated across 2 or more/);
  assert.ok(overridden.stdout.includes(CLAUSE.toLowerCase()), overridden.stdout);
});

test('a single-file set reports no cross-file findings', (t) => {
  const dir = fixtureDir(t);
  const file = write(dir, 'solo.md', `${CLAUSE}\n\n${CLAUSE}\n\n${CLAUSE}\n`);
  const result = run([file]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^\[OK\] no phrase of 8\+ words repeated across 3 or more of 1 file\(s\)/);
});

test('a phrase that only exists across a block boundary is not reported', (t) => {
  const dir = fixtureDir(t);
  // Seven words each: neither block reaches the 8-word floor, the join does.
  const tail = 'Back to the top of this guide';
  const head = 'Work stops when the lane is quiet';
  const files = writeSet(dir, 3, () => `${tail}\n## ${head}`);
  const result = run(files);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /^\[OK\]/);
});

test('an empty set completes cleanly', () => {
  const result = run([]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /^\[OK\] no phrase of 8\+ words repeated across 3 or more of 0 file\(s\)/);
});

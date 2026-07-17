// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./feature.mjs', import.meta.url));

/** @returns {string} */
function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-feature-cli-'));
}

/** @param {string} root @param {string} relativePath @param {string} content */
function write(root, relativePath, content) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

/** @param {string} root */
function define(root) {
  write(root, '.dude/specs/x/spec.md', '# X\n');
  write(
    root,
    '.dude/ideas/x.md',
    '---\nstatus: defined\nspec_path: .dude/specs/x/spec.md\n---\n',
  );
}

/** @param {string[]} args */
function run(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

test('CLI emits exact inventory and resolve library results as JSON with one LF', () => {
  const root = temporaryRoot();
  try {
    define(root);
    const inventory = run(['inventory', '--root', root, '--json']);
    assert.deepEqual(inventory, {
      code: 0,
      out: '{"features":[{"ideaPath":".dude/ideas/x.md","specPath":".dude/specs/x/spec.md"}],"diagnostics":[]}\n',
      err: '',
    });

    const resolve = run([
      'resolve',
      '--json',
      '--spec',
      '.dude/specs/x/spec.md',
      '--root',
      root,
    ]);
    assert.deepEqual(resolve, {
      code: 0,
      out: '{"owner":{"ideaPath":".dude/ideas/x.md","specPath":".dude/specs/x/spec.md"},"diagnostics":[]}\n',
      err: '',
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI exits zero for inventory warnings and two for error diagnostics', () => {
  const root = temporaryRoot();
  try {
    const warning = run(['inventory', '--root', root, '--json']);
    assert.equal(warning.code, 0, warning.err);
    assert.deepEqual(JSON.parse(warning.out).diagnostics.map((item) => item.code), [
      'FEATURE_IDEAS_ROOT_MISSING',
    ]);

    const error = run([
      'resolve',
      '--root',
      root,
      '--spec',
      '.dude/specs/x/spec.md',
      '--json',
    ]);
    assert.equal(error.code, 2, error.err);
    assert.deepEqual(JSON.parse(error.out).diagnostics.map((item) => item.code), [
      'FEATURE_IDEAS_ROOT_MISSING',
      'FEATURE_OWNER_NOT_FOUND',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI help exits zero and usage errors reject missing, duplicate, unknown, extra, and inapplicable options', () => {
  const help = run(['--help']);
  assert.equal(help.code, 0, help.err);
  assert.match(help.out, /^Usage:\n/);
  assert.equal(help.err, '');

  const cases = [
    [],
    ['unknown', '--root', '.', '--json'],
    ['inventory', '--json'],
    ['inventory', '--root', '.', '--root', '.', '--json'],
    ['inventory', '--root', '.', '--json', '--json'],
    ['inventory', '--root', '.', '--spec', '.dude/specs/x/spec.md', '--json'],
    ['inventory', '--root', '.', '--json', 'extra'],
    ['inventory', '--root', '.', '--unknown', '--json'],
    ['resolve', '--root', '.', '--json'],
    ['resolve', '--root', '--json'],
  ];
  for (const args of cases) {
    const result = run(args);
    assert.equal(result.code, 1, `${args.join(' ')}\n${result.out}${result.err}`);
    assert.equal(result.out, '', args.join(' '));
    assert.match(result.err, /Usage:/, args.join(' '));
  }
});

test('CLI is a thin direct library adapter with no scanning or child-process logic', () => {
  const source = fs.readFileSync(CLI, 'utf8');
  assert.match(
    source,
    /import \{ inventoryDefinedFeatures, resolveFeatureOwner \} from '\.\/lib\/feature\.mjs';/,
  );
  assert.doesNotMatch(source, /node:fs|node:child_process|readdir|readFile|lstat|statSync|spawn|execFile/);
  assert.doesNotMatch(source, /parseFrontmatterScalars|parseSpecIdentity|resolveSpecIdentity/);
});
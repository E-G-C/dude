// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventoryDefinedFeatures, resolveFeatureOwner } from './feature.mjs';

const MODULE = fileURLToPath(new URL('./feature.mjs', import.meta.url));

/** @returns {string} */
function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-feature-'));
}

/** @param {string} root @param {string} relativePath @param {string} content */
function write(root, relativePath, content) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

/** @param {string} status @param {string} specPath @returns {string} */
function ledger(status, specPath) {
  return `---\nstatus: ${status}\nspec_path: ${specPath}\n---\n\n## Idea\n\nBody.\n`;
}

/** @param {string} root @param {string} ideaName @param {string} feature */
function define(root, ideaName, feature) {
  const specPath = `.dude/specs/${feature}/spec.md`;
  write(root, specPath, `# ${feature}\n`);
  write(root, `.dude/ideas/${ideaName}.md`, ledger('defined', specPath));
}

/** @param {string} root @returns {Array<{ path: string, type: string, content?: string }>} */
function snapshot(root) {
  /** @type {Array<{ path: string, type: string, content?: string }>} */
  const entries = [];
  /** @param {string} directory @param {string} prefix */
  function visit(directory, prefix) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ))) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        entries.push({ path: relativePath, type: 'directory' });
        visit(absolutePath, relativePath);
      } else if (entry.isSymbolicLink()) {
        entries.push({ path: relativePath, type: 'symlink', content: fs.readlinkSync(absolutePath) });
      } else {
        entries.push({ path: relativePath, type: 'file', content: fs.readFileSync(absolutePath, 'utf8') });
      }
    }
  }
  visit(root, '');
  return entries;
}

test('inventory returns exact records sorted by specPath then ideaPath', () => {
  const root = temporaryRoot();
  try {
    define(root, 'z-owner', 'z-feature');
    define(root, 'm-owner', 'a-feature');
    define(root, 'a-owner', 'm-feature');

    assert.deepEqual(inventoryDefinedFeatures({ root }), {
      features: [
        { ideaPath: '.dude/ideas/m-owner.md', specPath: '.dude/specs/a-feature/spec.md' },
        { ideaPath: '.dude/ideas/a-owner.md', specPath: '.dude/specs/m-feature/spec.md' },
        { ideaPath: '.dude/ideas/z-owner.md', specPath: '.dude/specs/z-feature/spec.md' },
      ],
      diagnostics: [],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory aggregates sorted diagnostics, suppresses malformed cascades, and retains valid duplicate records', () => {
  const root = temporaryRoot();
  try {
    define(root, 'owner-b', 'shared');
    write(root, '.dude/ideas/owner-a.md', ledger('defined', '.dude/specs/shared/spec.md'));
    write(root, '.dude/ideas/draft-dangling.md', ledger('draft', '.dude/specs/missing/spec.md'));
    write(root, '.dude/ideas/malformed.md', '---\nstatus: defined\nspec_path: x\n');
    write(root, '.dude/ideas/missing-status.md', '---\nspec_path: nope\n---\n');
    write(root, '.dude/ideas/missing-spec.md', ledger('defined', ''));
    write(root, '.dude/ideas/invalid.md', ledger('ready', 'outside/spec.md'));

    const result = inventoryDefinedFeatures({ root });

    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/owner-a.md', specPath: '.dude/specs/shared/spec.md' },
      { ideaPath: '.dude/ideas/owner-b.md', specPath: '.dude/specs/shared/spec.md' },
    ]);
    assert.deepEqual(result.diagnostics.map(({ path: diagnosticPath, code, severity }) => ({
      path: diagnosticPath,
      code,
      severity,
    })), [
      { path: '.dude/ideas/draft-dangling.md', code: 'FEATURE_SPEC_PATH_DANGLING', severity: 'error' },
      { path: '.dude/ideas/invalid.md', code: 'FEATURE_SPEC_PATH_INVALID', severity: 'error' },
      { path: '.dude/ideas/invalid.md', code: 'FEATURE_STATUS_INVALID', severity: 'error' },
      { path: '.dude/ideas/malformed.md', code: 'FEATURE_FRONTMATTER_MALFORMED', severity: 'error' },
      { path: '.dude/ideas/missing-spec.md', code: 'FEATURE_SPEC_PATH_MISSING', severity: 'error' },
      { path: '.dude/ideas/missing-status.md', code: 'FEATURE_SPEC_PATH_INVALID', severity: 'error' },
      { path: '.dude/ideas/missing-status.md', code: 'FEATURE_STATUS_MISSING', severity: 'error' },
      { path: '.dude/specs/shared/spec.md', code: 'FEATURE_OWNER_DUPLICATE', severity: 'error' },
    ]);
    assert.equal(result.diagnostics.filter((item) => item.path.endsWith('/malformed.md')).length, 1);
    assert.match(result.diagnostics.at(-1)?.message || '', /owner-a\.md, \.dude\/ideas\/owner-b\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory enforces flat real ideas and symlink-safe roots and specs while continuing safe entries', { skip: process.platform === 'win32' }, () => {
  const root = temporaryRoot();
  const outside = temporaryRoot();
  const linkedRoot = `${root}-link`;
  try {
    define(root, 'valid', 'valid');
    write(root, '.dude/ideas/nested/hidden.md', ledger('defined', '.dude/specs/hidden/spec.md'));
    write(root, '.dude/ideas/notes.txt', 'unsupported\n');
    write(outside, 'linked.md', ledger('draft', ''));
    fs.symlinkSync(path.join(outside, 'linked.md'), path.join(root, '.dude/ideas/linked.md'));
    write(outside, 'spec.md', '# Outside\n');
    fs.mkdirSync(path.join(root, '.dude/specs/unsafe'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'spec.md'), path.join(root, '.dude/specs/unsafe/spec.md'));
    write(root, '.dude/ideas/unsafe.md', ledger('defined', '.dude/specs/unsafe/spec.md'));
    fs.symlinkSync(root, linkedRoot);

    const result = inventoryDefinedFeatures({ root });
    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/valid.md', specPath: '.dude/specs/valid/spec.md' },
    ]);
    assert.deepEqual(result.diagnostics.map((item) => [item.path, item.code]), [
      ['.dude/ideas/linked.md', 'FEATURE_IDEA_ENTRY_UNSUPPORTED'],
      ['.dude/ideas/nested', 'FEATURE_IDEA_ENTRY_UNSUPPORTED'],
      ['.dude/ideas/notes.txt', 'FEATURE_IDEA_ENTRY_UNSUPPORTED'],
      ['.dude/ideas/unsafe.md', 'FEATURE_SPEC_PATH_UNSAFE'],
    ]);
    assert.deepEqual(inventoryDefinedFeatures({ root: linkedRoot }).diagnostics.map((item) => item.code), [
      'FEATURE_ROOT_UNSAFE',
    ]);

    const missingRoot = temporaryRoot();
    const missing = inventoryDefinedFeatures({ root: missingRoot });
    assert.deepEqual(missing, {
      features: [],
      diagnostics: [{
        code: 'FEATURE_IDEAS_ROOT_MISSING',
        severity: 'warning',
        path: '.dude/ideas',
        message: 'canonical ideas root is missing',
      }],
    });
    fs.rmSync(missingRoot, { recursive: true, force: true });
  } finally {
    fs.unlinkSync(linkedRoot);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('resolve requires an exact query, one owner, and a globally error-free inventory', () => {
  const cleanRoot = temporaryRoot();
  const dirtyRoot = temporaryRoot();
  const emptyRoot = temporaryRoot();
  try {
    define(cleanRoot, 'x', 'x');
    assert.deepEqual(resolveFeatureOwner({ root: cleanRoot, specPath: '.dude/specs/x/spec.md' }), {
      owner: { ideaPath: '.dude/ideas/x.md', specPath: '.dude/specs/x/spec.md' },
      diagnostics: [],
    });
    const invalidQuery = resolveFeatureOwner({ root: cleanRoot, specPath: 'specs/x/spec.md' });
    assert.equal(invalidQuery.owner, null);
    assert.deepEqual(invalidQuery.diagnostics.map((item) => item.code), ['FEATURE_QUERY_INVALID']);

    define(dirtyRoot, 'x', 'x');
    write(dirtyRoot, '.dude/ideas/broken.md', 'not frontmatter\n');
    const globallyDirty = resolveFeatureOwner({ root: dirtyRoot, specPath: '.dude/specs/x/spec.md' });
    assert.equal(globallyDirty.owner, null);
    assert.deepEqual(globallyDirty.diagnostics.map((item) => item.code), ['FEATURE_FRONTMATTER_MALFORMED']);

    const absent = resolveFeatureOwner({ root: emptyRoot, specPath: '.dude/specs/x/spec.md' });
    assert.equal(absent.owner, null);
    assert.deepEqual(absent.diagnostics.map((item) => item.code), [
      'FEATURE_IDEAS_ROOT_MISSING',
      'FEATURE_OWNER_NOT_FOUND',
    ]);
  } finally {
    fs.rmSync(cleanRoot, { recursive: true, force: true });
    fs.rmSync(dirtyRoot, { recursive: true, force: true });
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }
});

test('feature ownership APIs are read-only and have no Beads or process back-edge', () => {
  const root = temporaryRoot();
  try {
    define(root, 'x', 'x');
    const before = snapshot(root);

    inventoryDefinedFeatures({ root });
    resolveFeatureOwner({ root, specPath: '.dude/specs/x/spec.md' });

    assert.deepEqual(snapshot(root), before);
    const source = fs.readFileSync(MODULE, 'utf8');
    assert.doesNotMatch(source, /dude-pack-beads|beads\.mjs|node:child_process|spawn(?:Sync)?\s*\(/);
    assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|rename|copyFile|chmod/);
    const resolverSource = source.slice(source.indexOf('export function resolveFeatureOwner'));
    assert.equal((resolverSource.match(/inventoryDefinedFeatures\(\{ root \}\)/g) || []).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// FR-029 (T034): the inventory must diagnose noncanonical owner metadata and
// draft ledgers that carry a resolvable spec_path, retain the still-valid
// ledgers, and never resolve an owner while any diagnostic exists. Supported
// matched-quoted scalar values stay accepted.
test('inventory rejects noncanonical owner metadata as malformed while retaining valid ledgers', () => {
  const root = temporaryRoot();
  try {
    define(root, 'keep', 'keep');
    write(root, '.dude/specs/quoted/spec.md', '# quoted\n');
    write(
      root,
      '.dude/ideas/quoted.md',
      '---\n"status": defined\nspec_path: .dude/specs/quoted/spec.md\n---\n\n## Idea\n\nBody.\n',
    );
    write(root, '.dude/specs/noncanon/spec.md', '# noncanon\n');
    write(
      root,
      '.dude/ideas/noncanon.md',
      '---\nstatus: defined\nspec_path: .dude/specs/noncanon/spec.md\npriority: high\n---\n\n## Idea\n\nBody.\n',
    );
    write(root, '.dude/specs/structured/spec.md', '# structured\n');
    write(
      root,
      '.dude/ideas/structured.md',
      '---\nstatus: defined\nspec_path: .dude/specs/structured/spec.md\ntitle: [a, b]\n---\n\n## Idea\n\nBody.\n',
    );

    const result = inventoryDefinedFeatures({ root });

    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/keep.md', specPath: '.dude/specs/keep/spec.md' },
    ]);
    const malformed = result.diagnostics
      .filter((item) => item.code === 'FEATURE_FRONTMATTER_MALFORMED')
      .map((item) => item.path);
    assert.deepEqual(malformed, [
      '.dude/ideas/noncanon.md',
      '.dude/ideas/quoted.md',
      '.dude/ideas/structured.md',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory flags draft ledgers with a resolvable spec_path and leaves dangling drafts unchanged', () => {
  const root = temporaryRoot();
  try {
    write(root, '.dude/specs/dr/spec.md', '# dr\n');
    write(root, '.dude/ideas/draft-resolvable.md', ledger('draft', '.dude/specs/dr/spec.md'));
    write(root, '.dude/ideas/draft-dangling.md', ledger('draft', '.dude/specs/missing/spec.md'));

    const result = inventoryDefinedFeatures({ root });
    const codesFor = (ideaPath) => result.diagnostics
      .filter((item) => item.path === ideaPath)
      .map((item) => item.code)
      .sort();

    // New FR-029 diagnostic: a draft must not carry a resolvable spec_path.
    assert.deepEqual(codesFor('.dude/ideas/draft-resolvable.md'), ['FEATURE_DRAFT_SPEC_PATH']);
    // Unchanged: a dangling draft spec_path stays a single dangling diagnostic.
    assert.deepEqual(codesFor('.dude/ideas/draft-dangling.md'), ['FEATURE_SPEC_PATH_DANGLING']);
    assert.deepEqual(result.features, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolve returns no owner when a noncanonical or draft-with-spec ledger poisons the inventory', () => {
  const poisons = [
    {
      name: 'noncanonical key ledger',
      apply: (root) => {
        write(root, '.dude/specs/other/spec.md', '# other\n');
        write(
          root,
          '.dude/ideas/other.md',
          '---\nstatus: defined\nspec_path: .dude/specs/other/spec.md\npriority: high\n---\n\n## Idea\n\nBody.\n',
        );
      },
    },
    {
      name: 'draft with resolvable spec_path',
      apply: (root) => {
        write(root, '.dude/specs/draftish/spec.md', '# draftish\n');
        write(root, '.dude/ideas/draftish.md', ledger('draft', '.dude/specs/draftish/spec.md'));
      },
    },
  ];

  for (const poison of poisons) {
    const root = temporaryRoot();
    try {
      define(root, 'x', 'x');
      poison.apply(root);
      const resolved = resolveFeatureOwner({ root, specPath: '.dude/specs/x/spec.md' });
      assert.equal(resolved.owner, null, `${poison.name}: ${JSON.stringify(resolved)}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('resolve still returns an owner for canonical ledgers that quote scalar values', () => {
  const root = temporaryRoot();
  try {
    write(root, '.dude/specs/x/spec.md', '# x\n');
    write(
      root,
      '.dude/ideas/x.md',
      '---\nstatus: "defined"\nspec_path: ".dude/specs/x/spec.md"\n---\n\n## Idea\n\nBody.\n',
    );

    const resolved = resolveFeatureOwner({ root, specPath: '.dude/specs/x/spec.md' });

    assert.deepEqual(resolved, {
      owner: { ideaPath: '.dude/ideas/x.md', specPath: '.dude/specs/x/spec.md' },
      diagnostics: [],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
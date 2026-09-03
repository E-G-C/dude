// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inventoryDefinedFeatures,
  inventoryLifecycleIdentities,
  resolveFeatureOwner,
  resolveIdeaSelector,
  selectLifecycleIdeaSummary,
} from './feature.mjs';

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

/** @param {string} status @param {string} specPath @param {string} slug @returns {string} */
function ledger(status, specPath, slug) {
  return `---\nslug: ${slug}\nstatus: ${status}\nspec_path: ${specPath}\n---\n\n## Idea\n\nBody.\n`;
}

/** @param {string} root @param {string} number @param {string} slug */
function define(root, number, slug) {
  const specPath = `.dude/specs/${number}-${slug}/spec.md`;
  write(root, specPath, `# ${number}-${slug}\n`);
  write(root, `.dude/ideas/${number}-${slug}.md`, ledger('defined', specPath, slug));
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

/**
 * Instrument synchronous reads before the operation starts, so a bounded
 * inventory cannot be mistaken for one that was only observed afterwards.
 * @template T
 * @param {() => T} operation
 * @returns {{ result: T, readPaths: string[] }}
 */
function observeReadPaths(operation) {
  const originalReadFileSync = fs.readFileSync;
  /** @type {string[]} */
  const readPaths = [];
  fs.readFileSync = function observedRead(file, ...args) {
    readPaths.push(path.resolve(String(file)));
    return originalReadFileSync.call(fs, file, ...args);
  };
  try {
    return { result: operation(), readPaths };
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
}

test('inventory returns exact records sorted by specPath then ideaPath', () => {
  const root = temporaryRoot();
  try {
    define(root, '003', 'z-feature');
    define(root, '001', 'a-feature');
    define(root, '002', 'm-feature');

    assert.deepEqual(inventoryDefinedFeatures({ root }), {
      features: [
        { ideaPath: '.dude/ideas/001-a-feature.md', specPath: '.dude/specs/001-a-feature/spec.md' },
        { ideaPath: '.dude/ideas/002-m-feature.md', specPath: '.dude/specs/002-m-feature/spec.md' },
        { ideaPath: '.dude/ideas/003-z-feature.md', specPath: '.dude/specs/003-z-feature/spec.md' },
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
    define(root, '001', 'shared');
    write(root, '.dude/ideas/002-owner-a.md', ledger('defined', '.dude/specs/001-shared/spec.md', 'owner-a'));
    write(root, '.dude/ideas/003-draft-dangling.md', ledger('draft', '.dude/specs/004-missing/spec.md', 'draft-dangling'));
    write(root, '.dude/ideas/004-malformed.md', '---\nstatus: defined\nspec_path: x\n');
    write(root, '.dude/ideas/005-missing-status.md', '---\nspec_path: nope\n---\n');
    write(root, '.dude/ideas/006-missing-spec.md', ledger('defined', '', 'missing-spec'));
    write(root, '.dude/ideas/007-invalid.md', ledger('ready', 'outside/spec.md', 'invalid'));

    const result = inventoryDefinedFeatures({ root });

    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/001-shared.md', specPath: '.dude/specs/001-shared/spec.md' },
      { ideaPath: '.dude/ideas/002-owner-a.md', specPath: '.dude/specs/001-shared/spec.md' },
    ]);
    assert.deepEqual(result.diagnostics.map(({ path: diagnosticPath, code, severity }) => ({
      path: diagnosticPath,
      code,
      severity,
    })), [
      { path: '.dude/ideas/002-owner-a.md', code: 'FEATURE_OWNER_IDENTITY_MISMATCH', severity: 'error' },
      { path: '.dude/ideas/003-draft-dangling.md', code: 'FEATURE_SPEC_PATH_DANGLING', severity: 'error' },
      { path: '.dude/ideas/004-malformed.md', code: 'FEATURE_FRONTMATTER_MALFORMED', severity: 'error' },
      { path: '.dude/ideas/005-missing-status.md', code: 'FEATURE_SLUG_MISSING', severity: 'error' },
      { path: '.dude/ideas/005-missing-status.md', code: 'FEATURE_SPEC_PATH_INVALID', severity: 'error' },
      { path: '.dude/ideas/005-missing-status.md', code: 'FEATURE_STATUS_MISSING', severity: 'error' },
      { path: '.dude/ideas/006-missing-spec.md', code: 'FEATURE_SPEC_PATH_MISSING', severity: 'error' },
      { path: '.dude/ideas/007-invalid.md', code: 'FEATURE_SPEC_PATH_INVALID', severity: 'error' },
      { path: '.dude/ideas/007-invalid.md', code: 'FEATURE_STATUS_INVALID', severity: 'error' },
      { path: '.dude/specs/001-shared/spec.md', code: 'FEATURE_OWNER_DUPLICATE', severity: 'error' },
    ]);
    assert.equal(result.diagnostics.filter((item) => item.path.endsWith('/004-malformed.md')).length, 1);
    assert.match(result.diagnostics.at(-1)?.message || '', /001-shared\.md, \.dude\/ideas\/002-owner-a\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory enforces flat real ideas and symlink-safe roots and specs while continuing safe entries', { skip: process.platform === 'win32' }, () => {
  const root = temporaryRoot();
  const outside = temporaryRoot();
  const linkedRoot = `${root}-link`;
  try {
    define(root, '001', 'valid');
    write(root, '.dude/ideas/nested/hidden.md', ledger('defined', '.dude/specs/hidden/spec.md'));
    write(root, '.dude/ideas/notes.txt', 'unsupported\n');
    write(outside, 'linked.md', ledger('draft', '', 'linked'));
    fs.symlinkSync(path.join(outside, 'linked.md'), path.join(root, '.dude/ideas/002-linked.md'));
    write(outside, 'spec.md', '# Outside\n');
    fs.mkdirSync(path.join(root, '.dude/specs/003-unsafe'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'spec.md'), path.join(root, '.dude/specs/003-unsafe/spec.md'));
    write(root, '.dude/ideas/003-unsafe.md', ledger('defined', '.dude/specs/003-unsafe/spec.md', 'unsafe'));
    fs.symlinkSync(root, linkedRoot);

    const result = inventoryDefinedFeatures({ root });
    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/001-valid.md', specPath: '.dude/specs/001-valid/spec.md' },
    ]);
    assert.deepEqual(result.diagnostics.map((item) => [item.path, item.code]), [
      ['.dude/ideas/002-linked.md', 'FEATURE_IDEA_ENTRY_UNSUPPORTED'],
      ['.dude/ideas/nested', 'FEATURE_IDEA_ENTRY_UNSUPPORTED'],
      ['.dude/ideas/notes.txt', 'FEATURE_IDEA_ENTRY_UNSUPPORTED'],
      ['.dude/ideas/003-unsafe.md', 'FEATURE_SPEC_PATH_UNSAFE'],
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
    define(cleanRoot, '001', 'x');
    assert.deepEqual(resolveFeatureOwner({ root: cleanRoot, specPath: '.dude/specs/001-x/spec.md' }), {
      owner: { ideaPath: '.dude/ideas/001-x.md', specPath: '.dude/specs/001-x/spec.md' },
      diagnostics: [],
    });
    const invalidQuery = resolveFeatureOwner({ root: cleanRoot, specPath: 'specs/x/spec.md' });
    assert.equal(invalidQuery.owner, null);
    assert.deepEqual(invalidQuery.diagnostics.map((item) => item.code), ['FEATURE_QUERY_INVALID']);

    define(dirtyRoot, '001', 'x');
    write(dirtyRoot, '.dude/ideas/002-broken.md', 'not frontmatter\n');
    const globallyDirty = resolveFeatureOwner({ root: dirtyRoot, specPath: '.dude/specs/001-x/spec.md' });
    assert.equal(globallyDirty.owner, null);
    assert.deepEqual(globallyDirty.diagnostics.map((item) => item.code), ['FEATURE_FRONTMATTER_MALFORMED']);

    const absent = resolveFeatureOwner({ root: emptyRoot, specPath: '.dude/specs/001-x/spec.md' });
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
    define(root, '001', 'x');
    const before = snapshot(root);

    inventoryDefinedFeatures({ root });
    resolveFeatureOwner({ root, specPath: '.dude/specs/001-x/spec.md' });

    assert.deepEqual(snapshot(root), before);
    const source = fs.readFileSync(MODULE, 'utf8');
    assert.doesNotMatch(source, /dude-pack-beads|beads\.mjs|node:child_process|spawn(?:Sync)?\s*\(/);
    assert.doesNotMatch(source, /writeFile|appendFile|mkdir|rmSync|rename|copyFile|chmod/);
    const resolverSource = source.slice(source.indexOf('export function resolveFeatureOwner'));
    assert.equal((resolverSource.match(/inventoryLifecycleIdentities\(\{ root \}\)/g) || []).length, 1);
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
    define(root, '001', 'keep');
    write(root, '.dude/specs/002-quoted/spec.md', '# quoted\n');
    write(
      root,
      '.dude/ideas/002-quoted.md',
      '---\nslug: quoted\n"status": defined\nspec_path: .dude/specs/002-quoted/spec.md\n---\n\n## Idea\n\nBody.\n',
    );
    write(root, '.dude/specs/003-noncanon/spec.md', '# noncanon\n');
    write(
      root,
      '.dude/ideas/003-noncanon.md',
      '---\nslug: noncanon\nstatus: defined\nspec_path: .dude/specs/003-noncanon/spec.md\npriority: high\n---\n\n## Idea\n\nBody.\n',
    );
    write(root, '.dude/specs/004-structured/spec.md', '# structured\n');
    write(
      root,
      '.dude/ideas/004-structured.md',
      '---\nslug: structured\nstatus: defined\nspec_path: .dude/specs/004-structured/spec.md\ntitle: [a, b]\n---\n\n## Idea\n\nBody.\n',
    );

    const result = inventoryDefinedFeatures({ root });

    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/001-keep.md', specPath: '.dude/specs/001-keep/spec.md' },
    ]);
    const malformed = result.diagnostics
      .filter((item) => item.code === 'FEATURE_FRONTMATTER_MALFORMED')
      .map((item) => item.path);
    assert.deepEqual(malformed, [
      '.dude/ideas/002-quoted.md',
      '.dude/ideas/003-noncanon.md',
      '.dude/ideas/004-structured.md',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory flags draft ledgers with a resolvable spec_path and leaves dangling drafts unchanged', () => {
  const root = temporaryRoot();
  try {
    write(root, '.dude/specs/001-dr/spec.md', '# dr\n');
    write(root, '.dude/ideas/001-dr.md', ledger('draft', '.dude/specs/001-dr/spec.md', 'dr'));
    write(root, '.dude/ideas/002-draft-dangling.md', ledger('draft', '.dude/specs/003-missing/spec.md', 'draft-dangling'));

    const result = inventoryDefinedFeatures({ root });
    const codesFor = (ideaPath) => result.diagnostics
      .filter((item) => item.path === ideaPath)
      .map((item) => item.code)
      .sort();

    // New FR-029 diagnostic: a draft must not carry a resolvable spec_path.
    assert.deepEqual(codesFor('.dude/ideas/001-dr.md'), [
      'FEATURE_DRAFT_SPEC_PATH',
      'FEATURE_NUMBER_COLLISION',
    ]);
    // Unchanged: a dangling draft spec_path stays a single dangling diagnostic.
    assert.deepEqual(codesFor('.dude/ideas/002-draft-dangling.md'), ['FEATURE_SPEC_PATH_DANGLING']);
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
        write(root, '.dude/specs/002-other/spec.md', '# other\n');
        write(
          root,
          '.dude/ideas/002-other.md',
          '---\nslug: other\nstatus: defined\nspec_path: .dude/specs/002-other/spec.md\npriority: high\n---\n\n## Idea\n\nBody.\n',
        );
      },
    },
    {
      name: 'draft with resolvable spec_path',
      apply: (root) => {
        write(root, '.dude/specs/002-draftish/spec.md', '# draftish\n');
        write(root, '.dude/ideas/002-draftish.md', ledger('draft', '.dude/specs/002-draftish/spec.md', 'draftish'));
      },
    },
  ];

  for (const poison of poisons) {
    const root = temporaryRoot();
    try {
      define(root, '001', 'x');
      poison.apply(root);
      const resolved = resolveFeatureOwner({ root, specPath: '.dude/specs/001-x/spec.md' });
      assert.equal(resolved.owner, null, `${poison.name}: ${JSON.stringify(resolved)}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('resolve still returns an owner for canonical ledgers that quote scalar values', () => {
  const root = temporaryRoot();
  try {
    write(root, '.dude/specs/001-x/spec.md', '# x\n');
    write(
      root,
      '.dude/ideas/001-x.md',
      '---\nslug: x\nstatus: "defined"\nspec_path: ".dude/specs/001-x/spec.md"\n---\n\n## Idea\n\nBody.\n',
    );

    const resolved = resolveFeatureOwner({ root, specPath: '.dude/specs/001-x/spec.md' });

    assert.deepEqual(resolved, {
      owner: { ideaPath: '.dude/ideas/001-x.md', specPath: '.dude/specs/001-x/spec.md' },
      diagnostics: [],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory accepts an exact package-less resolved ledger without granting it ownership', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    define(root, '001', 'defined');
    write(root, '.dude/ideas/002-draft.md', ledger('draft', '', 'draft'));
    write(root, '.dude/ideas/003-resolved.md', ledger('resolved', '', 'resolved'));

    // Act
    const inventory = inventoryDefinedFeatures({ root });
    const owner = resolveFeatureOwner({ root, specPath: '.dude/specs/001-defined/spec.md' });

    // Assert
    assert.deepEqual(inventory, {
      features: [
        { ideaPath: '.dude/ideas/001-defined.md', specPath: '.dude/specs/001-defined/spec.md' },
      ],
      diagnostics: [],
    });
    assert.deepEqual(owner, {
      owner: { ideaPath: '.dude/ideas/001-defined.md', specPath: '.dude/specs/001-defined/spec.md' },
      diagnostics: [],
    });
    assert.equal(
      inventory.features.some((feature) => feature.ideaPath === '.dude/ideas/003-resolved.md'),
      false,
      'a package-less resolved ledger never becomes an exact package owner',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory rejects invalid resolved metadata before it can become ownership', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    define(root, '001', 'keep');
    const cases = [
      {
        idea: 'canonical-owner-claim',
        content: ledger('resolved', '.dude/specs/001-keep/spec.md', 'canonical-owner-claim'),
        codes: ['FEATURE_RESOLVED_SPEC_PATH'],
      },
      {
        idea: 'dangling-path',
        content: ledger('resolved', '.dude/specs/003-missing/spec.md', 'dangling-path'),
        codes: ['FEATURE_RESOLVED_SPEC_PATH'],
      },
      {
        idea: 'malformed-path',
        content: ledger('resolved', 'not-a-canonical-spec-path', 'malformed-path'),
        codes: ['FEATURE_RESOLVED_SPEC_PATH'],
      },
      {
        idea: 'unsafe-path',
        content: ledger('resolved', '.dude/specs/..\\outside/spec.md', 'unsafe-path'),
        codes: ['FEATURE_RESOLVED_SPEC_PATH'],
      },
      {
        idea: 'quoted-nonempty-path',
        content: ledger('resolved', '".dude/specs/001-keep/spec.md"', 'quoted-nonempty-path'),
        codes: ['FEATURE_RESOLVED_SPEC_PATH'],
      },
      {
        idea: 'nonexact-status',
        content: ledger('"resolved"', '', 'nonexact-status'),
        codes: ['FEATURE_STATUS_INVALID'],
      },
      {
        idea: 'malformed-frontmatter',
        content: '---\nslug: malformed-frontmatter\nstatus: resolved\nstatus: resolved\nspec_path:\n---\n\n## Idea\n\nBody.\n',
        codes: ['FEATURE_FRONTMATTER_MALFORMED'],
      },
    ];
    for (const fixture of cases) {
      write(root, `.dude/ideas/${String(cases.indexOf(fixture) + 2).padStart(3, '0')}-${fixture.idea}.md`, fixture.content);
    }

    // Act
    const inventory = inventoryDefinedFeatures({ root });
    const codesFor = (idea) => inventory.diagnostics
      .filter((diagnostic) => diagnostic.path.endsWith(`-${idea}.md`))
      .map((diagnostic) => diagnostic.code);

    // Assert
    assert.deepEqual(inventory.features, [
      { ideaPath: '.dude/ideas/001-keep.md', specPath: '.dude/specs/001-keep/spec.md' },
    ]);
    for (const fixture of cases) {
      assert.deepEqual(codesFor(fixture.idea), fixture.codes, fixture.idea);
    }
    assert.match(
      inventory.diagnostics.find((diagnostic) => diagnostic.path.endsWith('-nonexact-status.md'))?.message ?? '',
      /invalid status 'resolved' \(valid: draft, defined, resolved\)/,
    );
    assert.equal(
      inventory.features.some((feature) => cases.some((fixture) => (
        feature.ideaPath.endsWith(`-${fixture.idea}.md`)
      ))),
      false,
      'every invalid resolved shape remains outside the owner inventory',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('duplicate defined owners remain diagnostic while a resolved bystander has zero ownership', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    write(root, '.dude/specs/001-shared/spec.md', '# shared\n');
    write(root, '.dude/ideas/001-shared.md', ledger('defined', '.dude/specs/001-shared/spec.md', 'shared'));
    write(root, '.dude/ideas/002-beta.md', ledger('defined', '.dude/specs/001-shared/spec.md', 'beta'));
    write(root, '.dude/ideas/003-resolved.md', ledger('resolved', '', 'resolved'));

    // Act
    const inventory = inventoryDefinedFeatures({ root });

    // Assert
    assert.deepEqual(inventory.features, [
      { ideaPath: '.dude/ideas/001-shared.md', specPath: '.dude/specs/001-shared/spec.md' },
      { ideaPath: '.dude/ideas/002-beta.md', specPath: '.dude/specs/001-shared/spec.md' },
    ]);
    assert.deepEqual(
      inventory.diagnostics.map((diagnostic) => [diagnostic.path, diagnostic.code]),
      [
        ['.dude/ideas/002-beta.md', 'FEATURE_OWNER_IDENTITY_MISMATCH'],
        ['.dude/specs/001-shared/spec.md', 'FEATURE_OWNER_DUPLICATE'],
      ],
    );
    assert.equal(
      inventory.features.filter((feature) => feature.ideaPath === '.dude/ideas/003-resolved.md').length,
      0,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Feature 024 (T001@6b657973): `depends-on` is a canonical idea-frontmatter key.
// Exercising the production CANONICAL_IDEA_KEYS set through the inventory and
// resolve paths, a plain space- or comma-separated scalar of idea slugs must
// validate as a clean defined owner, a structured flow or block-list value must
// still be rejected as malformed, an idea without the field must be unaffected,
// and status/spec_path resolution must be unchanged. No consumer of the declared
// dependency exists yet, so only recognition and rejection are asserted.

test('inventory validates plain space- and comma-separated depends-on scalars as clean defined owners', () => {
  const root = temporaryRoot();
  try {
    // Arrange: two defined owners declaring depends-on as a plain scalar.
    // Case 1 — space-separated slugs.
    write(root, '.dude/specs/001-space/spec.md', '# space\n');
    write(
      root,
      '.dude/ideas/001-space.md',
      '---\nslug: space\nstatus: defined\nspec_path: .dude/specs/001-space/spec.md\ndepends-on: alpha beta\n---\n\n## Idea\n\nBody.\n',
    );
    // Case 2 — comma-separated slugs.
    write(root, '.dude/specs/002-comma/spec.md', '# comma\n');
    write(
      root,
      '.dude/ideas/002-comma.md',
      '---\nslug: comma\nstatus: defined\nspec_path: .dude/specs/002-comma/spec.md\ndepends-on: alpha, beta\n---\n\n## Idea\n\nBody.\n',
    );

    // Act.
    const result = inventoryDefinedFeatures({ root });

    // Assert: both ideas inventory as clean defined owners with no diagnostics.
    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/001-space.md', specPath: '.dude/specs/001-space/spec.md' },
      { ideaPath: '.dude/ideas/002-comma.md', specPath: '.dude/specs/002-comma/spec.md' },
    ]);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory rejects structured flow and block-list depends-on values as malformed', () => {
  const root = temporaryRoot();
  try {
    // Arrange: a clean owner to retain, plus two structured depends-on values
    // strict canonical validation must still reject.
    define(root, '001', 'keep');
    // Case 3 — YAML flow sequence value.
    write(root, '.dude/specs/002-flow/spec.md', '# flow\n');
    write(
      root,
      '.dude/ideas/002-flow.md',
      '---\nslug: flow\nstatus: defined\nspec_path: .dude/specs/002-flow/spec.md\ndepends-on: [alpha, beta]\n---\n\n## Idea\n\nBody.\n',
    );
    // Case 4 — YAML block-list value.
    write(root, '.dude/specs/003-block/spec.md', '# block\n');
    write(
      root,
      '.dude/ideas/003-block.md',
      '---\nslug: block\nstatus: defined\nspec_path: .dude/specs/003-block/spec.md\ndepends-on:\n  - alpha\n  - beta\n---\n\n## Idea\n\nBody.\n',
    );

    // Act.
    const result = inventoryDefinedFeatures({ root });

    // Assert: neither structured ledger inventories; only the clean owner
    // survives, and each malformed ledger yields one malformed-frontmatter error.
    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/001-keep.md', specPath: '.dude/specs/001-keep/spec.md' },
    ]);
    assert.deepEqual(
      result.diagnostics.map((item) => [item.path, item.code, item.severity]),
      [
        ['.dude/ideas/002-flow.md', 'FEATURE_FRONTMATTER_MALFORMED', 'error'],
        ['.dude/ideas/003-block.md', 'FEATURE_FRONTMATTER_MALFORMED', 'error'],
        ['.dude/specs/002-flow/spec.md', 'FEATURE_OWNER_NOT_FOUND', 'error'],
        ['.dude/specs/003-block/spec.md', 'FEATURE_OWNER_NOT_FOUND', 'error'],
      ],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory leaves an idea without a depends-on field unaffected', () => {
  const root = temporaryRoot();
  try {
    // Arrange: a defined owner with no depends-on (case 5), alongside one that
    // declares it, so the widened canonical key set runs over both in one pass.
    define(root, '001', 'plain');
    write(root, '.dude/specs/002-declared/spec.md', '# declared\n');
    write(
      root,
      '.dude/ideas/002-declared.md',
      '---\nslug: declared\nstatus: defined\nspec_path: .dude/specs/002-declared/spec.md\ndepends-on: plain\n---\n\n## Idea\n\nBody.\n',
    );

    // Act.
    const result = inventoryDefinedFeatures({ root });

    // Assert: the depends-on-free idea validates exactly as before, and both
    // ideas inventory cleanly with no diagnostics.
    assert.deepEqual(result.features, [
      { ideaPath: '.dude/ideas/001-plain.md', specPath: '.dude/specs/001-plain/spec.md' },
      { ideaPath: '.dude/ideas/002-declared.md', specPath: '.dude/specs/002-declared/spec.md' },
    ]);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolve returns the owner by exact spec_path when depends-on is present', () => {
  const root = temporaryRoot();
  try {
    // Arrange: one defined owner that also declares depends-on (case 6).
    write(root, '.dude/specs/001-dep/spec.md', '# dep\n');
    write(
      root,
      '.dude/ideas/001-dep.md',
      '---\nslug: dep\nstatus: defined\nspec_path: .dude/specs/001-dep/spec.md\ndepends-on: alpha beta\n---\n\n## Idea\n\nBody.\n',
    );

    // Act.
    const resolved = resolveFeatureOwner({ root, specPath: '.dude/specs/001-dep/spec.md' });

    // Assert: status/spec_path resolution is unchanged; the owner resolves by
    // exact spec_path with no diagnostics.
    assert.deepEqual(resolved, {
      owner: { ideaPath: '.dude/ideas/001-dep.md', specPath: '.dude/specs/001-dep/spec.md' },
      diagnostics: [],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('summary selection resolves one exact owner without reading package documents', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    define(root, '001', 'selected');
    define(root, '002', 'other');
    write(root, '.dude/specs/001-selected/tasks.md', '- [ ] T001@aaaaaaaa Selected task\n');
    write(root, '.dude/specs/002-other/tasks.md', '- [ ] T001@bbbbbbbb Other task\n');
    const packageDocuments = [
      '.dude/specs/001-selected/spec.md',
      '.dude/specs/001-selected/tasks.md',
      '.dude/specs/002-other/spec.md',
      '.dude/specs/002-other/tasks.md',
    ].map((relativePath) => path.resolve(root, relativePath));

    // Act
    const observed = observeReadPaths(() => selectLifecycleIdeaSummary({
      root,
      target: '.dude/ideas/001-selected.md',
    }));

    // Assert
    assert.deepEqual(observed.result.idea, {
      ideaPath: '.dude/ideas/001-selected.md',
      number: '001',
      numberValue: 1,
      slug: 'selected',
      status: 'defined',
      specPath: '.dude/specs/001-selected/spec.md',
    });
    assert.deepEqual(observed.result.owner, {
      ideaPath: '.dude/ideas/001-selected.md',
      specPath: '.dude/specs/001-selected/spec.md',
    });
    assert.equal(observed.result.explicit, true);
    assert.deepEqual(observed.result.diagnostics, []);
    assert.deepEqual(
      observed.readPaths.filter((candidate) => packageDocuments.includes(candidate)),
      [],
      'summary selection must defer all package documents until its caller selects an owner',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('summary selection fails closed for invalid ownership and returns a chooser only for multiple valid candidates', () => {
  const cases = [
    {
      name: 'duplicate defined owner',
      arrange(root) {
        define(root, '001', 'alpha');
        write(root, '.dude/ideas/002-beta.md', ledger('defined', '.dude/specs/001-alpha/spec.md', 'beta'));
      },
      target: 'alpha',
      codes: ['FEATURE_OWNER_DUPLICATE', 'FEATURE_OWNER_IDENTITY_MISMATCH'],
    },
    {
      name: 'defined idea without a package',
      arrange(root) {
        write(root, '.dude/ideas/001-orphan.md', ledger('defined', '.dude/specs/001-orphan/spec.md', 'orphan'));
      },
      target: 'orphan',
      codes: ['FEATURE_OWNER_NOT_FOUND'],
    },
    {
      name: 'idea and package identity mismatch',
      arrange(root) {
        write(root, '.dude/specs/002-package/spec.md', '# package\n');
        write(root, '.dude/ideas/001-owner.md', ledger('defined', '.dude/specs/002-package/spec.md', 'owner'));
      },
      target: 'owner',
      codes: ['FEATURE_OWNER_IDENTITY_MISMATCH'],
    },
    {
      name: 'malformed summary ledger',
      arrange(root) {
        define(root, '001', 'valid');
        write(root, '.dude/ideas/002-malformed.md', 'not frontmatter\n');
      },
      target: 'valid',
      codes: ['FEATURE_FRONTMATTER_MALFORMED'],
    },
    {
      name: 'ambiguous exact slug selector',
      arrange(root) {
        write(root, '.dude/ideas/001-duplicate.md', ledger('draft', '', 'duplicate'));
        write(root, '.dude/ideas/002-duplicate.md', ledger('draft', '', 'duplicate'));
      },
      target: 'duplicate',
      codes: ['FEATURE_IDEA_SLUG_DUPLICATE'],
    },
  ];

  // Arrange, Act, Assert
  for (const fixture of cases) {
    const root = temporaryRoot();
    try {
      fixture.arrange(root);
      const result = selectLifecycleIdeaSummary({ root, target: fixture.target });
      assert.equal(result.idea, null, fixture.name);
      assert.equal(result.owner, null, fixture.name);
      for (const code of fixture.codes) {
        assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === code), `${fixture.name}: ${code}`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const root = temporaryRoot();
  try {
    write(root, '.dude/ideas/001-alpha.md', ledger('draft', '', 'alpha'));
    write(root, '.dude/ideas/002-beta.md', ledger('draft', '', 'beta'));

    const result = selectLifecycleIdeaSummary({ root });

    assert.equal(result.explicit, false);
    assert.equal(result.idea, null);
    assert.equal(result.owner, null);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.choices.map((choice) => choice.ideaPath), [
      '.dude/ideas/001-alpha.md',
      '.dude/ideas/002-beta.md',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('full-inventory APIs retain strict package-document validation after bounded selection was added', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    define(root, '001', 'valid');
    fs.mkdirSync(path.join(root, '.dude/specs/002-missing-spec'), { recursive: true });

    // Act
    const full = inventoryLifecycleIdentities({ root });
    const selector = resolveIdeaSelector({ root, slug: 'valid' });
    const owner = resolveFeatureOwner({ root, specPath: '.dude/specs/001-valid/spec.md' });

    // Assert
    assert.ok(full.diagnostics.some((diagnostic) => (
      diagnostic.code === 'FEATURE_PACKAGE_SPEC_MISSING'
      && diagnostic.path === '.dude/specs/002-missing-spec/spec.md'
    )));
    assert.equal(selector.idea, null, 'strict selector must refuse a globally incomplete package inventory');
    assert.ok(selector.diagnostics.some((diagnostic) => diagnostic.code === 'FEATURE_PACKAGE_SPEC_MISSING'));
    assert.equal(owner.owner, null, 'strict owner resolver must refuse a globally incomplete package inventory');
    assert.ok(owner.diagnostics.some((diagnostic) => diagnostic.code === 'FEATURE_PACKAGE_SPEC_MISSING'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
// @ts-check
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  inventoryLifecycleIdentities,
  resolveFeatureOwner,
  resolveIdeaSelector,
} from './feature.mjs';
import { parseIdeaIdentity, parseSpecIdentity } from './feature-identity.mjs';
import { deriveLifecycleModel } from '../../dude-lightweight-execution/backlog.mjs';
import { canonicalJson } from '../../dude-work/recovery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FEATURE_CLI = path.join(ROOT, 'src/skills/dude-engine/feature.mjs');
const CAPTURE = path.join(ROOT, 'src/skills/dude-feature-definition/publish-first-capture.mjs');
const DEFINE = path.join(ROOT, 'src/skills/dude-feature-definition/publish-first-definition.mjs');
const LINT = path.join(ROOT, 'src/skills/dude-lint/lint.mjs');
const FEATURE_DEFINITION_SKILL = path.join(ROOT, 'src/skills/dude-feature-definition/SKILL.md');
const CONFIG = fs.readFileSync(path.join(ROOT, 'src/config/agent-models.json'));

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-045-'));
}

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function ledger(slug, status = 'draft', specPath = '') {
  return [
    '---',
    `title: ${slug}`,
    `slug: ${slug}`,
    `status: ${status}`,
    `spec_path: ${specPath}`,
    '---',
    '',
    '## Idea',
    '',
    'Test intent.',
    '',
    '## Open Questions',
    '',
    '- None.',
    '',
    '## Assumptions',
    '',
    '- None.',
    '',
    '## Coordinator Log',
    '',
    '- 2026-08-30 Captured.',
    '',
  ].join('\n');
}

function idea(root, number, slug, status = 'draft', specPath = '') {
  const relative = `.dude/ideas/${number}-${slug}.md`;
  write(root, relative, ledger(slug, status, specPath));
  return relative;
}

function packageAt(root, number, slug) {
  const specPath = `.dude/specs/${number}-${slug}/spec.md`;
  write(root, specPath, '# Spec\n');
  return specPath;
}

function snapshot(root) {
  const entries = [];
  const visit = (directory, prefix = '') => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push(`d ${relative}`);
        visit(absolute, relative);
      } else if (stat.isSymbolicLink()) entries.push(`l ${relative} ${fs.readlinkSync(absolute)}`);
      else entries.push(`f ${relative} ${fs.readFileSync(absolute).toString('hex')}`);
    }
  };
  visit(root);
  return entries;
}

function lintLayout(root) {
  write(root, '.dude/metadata/bundle-manifest.md', '# Bundle Manifest\n\n```json\n{"source_repo":"x","source_ref":"main"}\n```\n');
  write(root, '.dude/metadata/profile.md', '# Install Profile\n\n```json\n{"installed":{}}\n```\n');
  write(root, '.github/skills/dude-engine/config/agent-models.json', CONFIG);
  write(root, '.github/skills/dude-engine/SKILL.md', '---\nname: dude-engine\ndescription: "fixture"\n---\n');
}

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('T001 authoritative brainstorm procedure publishes first capture through its dedicated helper', () => {
  // Arrange
  const procedure = fs.readFileSync(FEATURE_DEFINITION_SKILL, 'utf8');

  // Act / Assert
  assert.match(
    procedure,
    /## Brainstorm[\s\S]*node \.github\/skills\/dude-feature-definition\/publish-first-capture\.mjs --root \. --slug <slug> --stage <absolute-staged-ledger-file>/,
  );
});

test('T001 strict identity parsers accept only ASCII 001-999 paths', () => {
  // Arrange
  const acceptedIdea = '.dude/ideas/001-a-9.md';
  const acceptedSpec = '.dude/specs/999-z/spec.md';
  const rejected = [
    '.dude/ideas/000-zero.md', '.dude/ideas/01-short.md', '.dude/ideas/1000-long.md',
    '.dude/ideas/０１-a.md', '.dude/ideas/001-a/b.md', '.dude/ideas/001-a\\b.md',
    '.dude/ideas/001-a.md.bak',
  ];

  // Act / Assert
  assert.deepEqual(parseIdeaIdentity(acceptedIdea), {
    path: acceptedIdea, number: '001', numberValue: 1, slug: 'a-9',
  });
  assert.deepEqual(parseSpecIdentity(acceptedSpec), {
    kind: 'canonical', feature: '999-z', path: acceptedSpec,
    directoryPath: '.dude/specs/999-z', number: '999', numberValue: 999, slug: 'z',
  });
  for (const value of rejected) assert.equal(parseIdeaIdentity(value), null, value);
  for (const value of [
    '.dude/specs/000-zero/spec.md', '.dude/specs/01-short/spec.md',
    '.dude/specs/1000-long/spec.md', '.dude/specs/００１-wide/spec.md',
    '.dude/specs/001-a/other.md', '.dude/specs/001-a\\spec.md',
  ]) assert.equal(parseSpecIdentity(value), null, value);
});

test('T001 inventory reserves draft, defined, resolved, and package identities by max without gap reuse', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    idea(root, '001', 'draft');
    const spec = packageAt(root, '005', 'defined');
    idea(root, '005', 'defined', 'defined', spec);
    idea(root, '009', 'resolved', 'resolved');

    // Act
    const result = inventoryLifecycleIdentities({ root });

    // Assert
    assert.deepEqual(result.ideas.map(({ number, slug, status }) => ({ number, slug, status })), [
      { number: '001', slug: 'draft', status: 'draft' },
      { number: '005', slug: 'defined', status: 'defined' },
      { number: '009', slug: 'resolved', status: 'resolved' },
    ]);
    assert.equal(result.nextNumber, '010');
    assert.equal(result.exhausted, false);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 inventory fails closed for malformed, duplicate, drift, and unsafe identity evidence', { skip: process.platform === 'win32' }, () => {
  const root = temporaryRoot();
  const outside = temporaryRoot();
  try {
    // Arrange
    idea(root, '003', 'one');
    idea(root, '003', 'two');
    idea(root, '004', 'one');
    write(root, '.dude/ideas/005-mismatch.md', ledger('other'));
    write(root, '.dude/ideas/000-zero.md', ledger('zero'));
    packageAt(root, '003', 'package-one');
    packageAt(root, '003', 'package-two');
    write(outside, 'owner.md', ledger('outside'));
    fs.symlinkSync(path.join(outside, 'owner.md'), path.join(root, '.dude/ideas/006-link.md'));

    // Act
    const result = inventoryLifecycleIdentities({ root });

    // Assert
    assert.equal(result.nextNumber, null);
    assert.equal(result.exhausted, false);
    assert.deepEqual(result.diagnostics.map((entry) => entry.code), [
      'FEATURE_IDEA_IDENTITY_INVALID',
      'FEATURE_IDEA_NUMBER_DUPLICATE',
      'FEATURE_IDEA_SLUG_DUPLICATE',
      'FEATURE_NUMBER_COLLISION',
      'FEATURE_IDEA_SLUG_MISMATCH',
      'FEATURE_IDEA_ENTRY_UNSUPPORTED',
      'FEATURE_PACKAGE_NUMBER_DUPLICATE',
      'FEATURE_OWNER_NOT_FOUND',
      'FEATURE_OWNER_NOT_FOUND',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('T001 selection and exact-owner resolution never infer from a number, title, stem, or package', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    const owner = idea(root, '023', 'exact');
    const spec = packageAt(root, '023', 'exact');
    write(root, owner, ledger('exact', 'defined', spec));

    // Act
    const selectedSlug = resolveIdeaSelector({ root, slug: 'exact' });
    const selectedPath = resolveIdeaSelector({ root, ideaPath: owner });
    const bareNumber = resolveIdeaSelector({ root, slug: '023-exact' });
    const wrongPath = resolveIdeaSelector({ root, ideaPath: '.dude/ideas/023-other.md' });
    const resolved = resolveFeatureOwner({ root, specPath: spec });

    // Assert
    assert.equal(selectedSlug.idea?.ideaPath, owner);
    assert.equal(selectedPath.idea?.ideaPath, owner);
    assert.equal(bareNumber.idea, null);
    assert.deepEqual(bareNumber.diagnostics.map((item) => item.code), ['FEATURE_IDEA_NOT_FOUND']);
    assert.equal(wrongPath.idea, null);
    assert.deepEqual(wrongPath.diagnostics.map((item) => item.code), ['FEATURE_IDEA_NOT_FOUND']);
    assert.deepEqual(resolved.owner, { ideaPath: owner, specPath: spec });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 CLI exposes numeric inventory and rejects selector fallback', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    idea(root, '007', 'chosen');

    // Act
    const inventory = run(FEATURE_CLI, ['ideas', '--root', root, '--json']);
    const selection = run(FEATURE_CLI, ['select', '--root', root, '--slug', '007-chosen', '--json']);

    // Assert
    assert.equal(inventory.status, 0, inventory.stderr);
    assert.deepEqual(JSON.parse(inventory.stdout).nextNumber, '008');
    assert.equal(selection.status, 2);
    assert.deepEqual(JSON.parse(selection.stdout).diagnostics.map((item) => item.code), ['FEATURE_IDEA_NOT_FOUND']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 first capture allocates max-plus-one and leaves the workspace unchanged for duplicate and exhaustion diagnostics', () => {
  const root = temporaryRoot();
  const stage = path.join(root, 'stage.md');
  try {
    // Arrange
    lintLayout(root);
    idea(root, '004', 'earlier');
    const maxSpec = packageAt(root, '010', 'defined-max');
    idea(root, '010', 'defined-max', 'defined', maxSpec);
    fs.writeFileSync(stage, ledger('new-idea'));

    // Act
    const captured = run(CAPTURE, ['--root', root, '--slug', 'new-idea', '--stage', stage]);

    // Assert
    assert.equal(captured.status, 0, captured.stderr);
    assert.equal(captured.stdout, '.dude/ideas/011-new-idea.md\n');
    assert.ok(fs.existsSync(path.join(root, '.dude/ideas/011-new-idea.md')));

    // Arrange failure snapshots after the successful capture.
    const duplicateBefore = snapshot(root);
    const duplicate = run(CAPTURE, ['--root', root, '--slug', 'new-idea', '--stage', stage]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already exists; refresh its exact path/);
    assert.deepEqual(snapshot(root), duplicateBefore);

    const malformedRoot = temporaryRoot();
    try {
      lintLayout(malformedRoot);
      write(malformedRoot, '.dude/ideas/00-malformed.md', ledger('malformed'));
      const malformedStage = path.join(malformedRoot, 'stage.md');
      fs.writeFileSync(malformedStage, ledger('never'));
      const before = snapshot(malformedRoot);
      const malformed = run(CAPTURE, ['--root', malformedRoot, '--slug', 'never', '--stage', malformedStage]);
      assert.notEqual(malformed.status, 0);
      assert.match(malformed.stderr, /lifecycle inventory is unsafe/);
      assert.deepEqual(snapshot(malformedRoot), before);
    } finally {
      fs.rmSync(malformedRoot, { recursive: true, force: true });
    }

    const exhaustedRoot = temporaryRoot();
    try {
      lintLayout(exhaustedRoot);
      idea(exhaustedRoot, '999', 'last');
      const exhaustedStage = path.join(exhaustedRoot, 'stage.md');
      fs.writeFileSync(exhaustedStage, ledger('never'));
      const before = snapshot(exhaustedRoot);
      const exhausted = run(CAPTURE, ['--root', exhaustedRoot, '--slug', 'never', '--stage', exhaustedStage]);
      assert.notEqual(exhausted.status, 0);
      assert.match(exhausted.stderr, /001-999 is exhausted/);
      assert.deepEqual(snapshot(exhaustedRoot), before);
    } finally {
      fs.rmSync(exhaustedRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 first definition reuses the selected idea number and rolls back target-number collisions', () => {
  const root = temporaryRoot();
  const stage = path.join(root, 'stage');
  const selected = '.dude/ideas/021-draft.md';
  const spec = '.dude/specs/021-draft/spec.md';
  try {
    // Arrange
    lintLayout(root);
    const current = Buffer.from(ledger('draft'));
    write(root, selected, current);
    fs.mkdirSync(stage);
    const staged = Buffer.from(ledger('draft', 'defined', spec).replace('- 2026-08-30 Captured.', '- 2026-08-30 Captured.\n- 2026-08-30 Defined.'));
    write(stage, 'current-idea.md', current);
    write(stage, 'staged-idea.md', staged);
    write(stage, 'spec.md', '# Spec\n');
    write(stage, 'plan.md', '# Plan\n');
    write(stage, 'tasks.md', `<!-- audit log: ${selected}#coordinator-log -->\n\n# Tasks\n\n- [ ] T001@aaaaaaaa [Shared] Test.\n`);

    // Act
    const published = run(DEFINE, ['--root', root, '--idea', selected, '--spec', spec, '--stage', stage]);

    // Assert
    assert.equal(published.status, 0, published.stderr);
    assert.equal(published.stdout, `${spec}\n`);
    assert.ok(fs.existsSync(path.join(root, spec)));
    assert.equal(resolveFeatureOwner({ root, specPath: spec }).owner?.ideaPath, selected);

    // Arrange a distinct target that collides numerically.
    const collisionRoot = temporaryRoot();
    try {
      lintLayout(collisionRoot);
      write(collisionRoot, selected, current);
      packageAt(collisionRoot, '021', 'other');
      fs.cpSync(stage, path.join(collisionRoot, 'stage'), { recursive: true });
      const before = snapshot(collisionRoot);

      // Act
      const collision = run(DEFINE, ['--root', collisionRoot, '--idea', selected, '--spec', spec, '--stage', path.join(collisionRoot, 'stage')]);

      // Assert
      assert.notEqual(collision.status, 0);
      assert.match(collision.stderr, /lifecycle inventory is unsafe|already has a feature package claim/);
      assert.deepEqual(snapshot(collisionRoot), before);
    } finally {
      fs.rmSync(collisionRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 lint reports numeric owner drift and exact numbered audit breadcrumbs', () => {
  const root = temporaryRoot();
  try {
    // Arrange
    lintLayout(root);
    const spec = packageAt(root, '031', 'owner');
    const owner = idea(root, '031', 'owner', 'defined', spec);
    write(root, '.dude/specs/031-owner/tasks.md', [
      '<!-- audit log: .dude/ideas/031-wrong.md#coordinator-log -->',
      '',
      '# Tasks',
      '',
      '- [ ] T001@aaaaaaaa [Shared] Check exact owner.',
      '',
    ].join('\n'));
    const staleOwner = { ideaPath: '.dude/ideas/031-wrong.md', specPath: spec };
    const registry = {
      version: 1,
      owner: staleOwner,
      entries: [{
        taskKey: 'T001@aaaaaaaa',
        provenance: { kind: 'spec', refs: [{ path: spec, section: 'requirements' }] },
        contract: {
          id: 'obj-fixture', subject: 'Fixture objective', kind: 'numeric',
          evaluators: [{ id: 'fixture', version: 'v1' }],
          inputs: [{ id: 'source', kind: 'file', path: 'src/a.mjs', sha256: '0'.repeat(64) }],
          environment: [{ id: 'node', valueHash: '1'.repeat(64) }],
          conditions: ['fixture'],
          budget: { comparisons: 1, durationMs: 1, tokens: 0, costMicrounits: 0 },
          hardConstraints: [{ kind: 'verification', id: 'unit', target: 'src/a.test.mjs' }],
          tieRule: { mode: 'discard' },
          comparator: {
            mode: 'numeric', unit: 'ms', direction: 'minimize',
            sampleCount: 1, aggregation: 'median', tolerance: '0', meaningfulThreshold: '1',
          },
        },
      }],
    };
    write(root, '.dude/specs/031-owner/plan.md', [
      '# Plan',
      '<!-- dude:objective-registry:start -->',
      canonicalJson(registry),
      '<!-- dude:objective-registry:end -->',
      '',
    ].join('\n'));

    // Act
    const result = run(LINT, [root]);

    // Assert
    assert.equal(result.status, 1);
    assert.match(result.stdout, new RegExp(`audit breadcrumb target \\.dude/ideas/031-wrong\\.md is not a valid defined feature owner.*${owner}`));
    assert.match(result.stdout, /active ObjectiveRegistry owner must be the exact current owner/);
    assert.doesNotMatch(result.stdout, /first canonical line must be exactly/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('T001 numeric backlog ordering is chronological only within existing lifecycle buckets', () => {
  // Arrange
  const current = {
    identity: '.dude/ideas/099-active.md', ideaPath: '.dude/ideas/099-active.md',
    number: '099', numberValue: 99, slug: 'active', defined: true, hasInProgress: true,
  };
  const firstLater = {
    identity: '.dude/ideas/001-later.md', ideaPath: '.dude/ideas/001-later.md',
    number: '001', numberValue: 1, slug: 'later', defined: true,
  };
  const explicitlyFirst = {
    identity: '.dude/ideas/900-first.md', ideaPath: '.dude/ideas/900-first.md',
    number: '900', numberValue: 900, slug: 'first', defined: true,
  };

  // Act
  const model = deriveLifecycleModel({
    items: [current, firstLater, explicitlyFirst],
    order: ['first', 'later'],
  });

  // Assert
  assert.deepEqual(model.current.active.map((item) => item.number), ['099']);
  assert.deepEqual(model.current.next.map((item) => item.slug), ['first']);
  assert.deepEqual(model.planned.prioritizedLater.map((item) => item.slug), ['later']);
  assert.equal(model.current.active[0].group, 'active');
});

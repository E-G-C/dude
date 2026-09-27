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
  selectLifecycleIdeaSummary,
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
const SHARED_RULES = path.join(ROOT, 'src/instructions/dude.instructions.md');
const LINT_SKILL = path.join(ROOT, 'src/skills/dude-lint/SKILL.md');
const CONFIG = fs.readFileSync(path.join(ROOT, 'src/config/agent-models.json'));
const DUPLICATE_PREFIX_SOURCE_PAIRS = [
  ['src/skills/dude-engine/lib/feature.mjs', '.github/skills/dude-engine/lib/feature.mjs'],
  [
    'src/skills/dude-feature-definition/publish-first-definition.mjs',
    '.github/skills/dude-feature-definition/publish-first-definition.mjs',
  ],
  ['src/skills/dude-lightweight-execution/backlog.mjs', '.github/skills/dude-lightweight-execution/backlog.mjs'],
  ['src/skills/dude-feature-definition/SKILL.md', '.github/skills/dude-feature-definition/SKILL.md'],
  ['src/instructions/dude.instructions.md', '.github/instructions/dude.instructions.md'],
  ['src/skills/dude-lint/SKILL.md', '.github/skills/dude-lint/SKILL.md'],
];
// Reported collision examples reproduced only in disposable fixtures.
const REPORTED_PREFIX_PEERS = [
  { number: '074', slug: 'work-readable-evidence-handoff', status: 'defined' },
  { number: '074', slug: 'dude-canvas-about', status: 'defined' },
  { number: '075', slug: 'terminal-work-manual-resolution', status: 'defined' },
  { number: '075', slug: 'dude-development-base-release', status: 'draft' },
  { number: '075', slug: 'resolved-bystander', status: 'resolved' },
];

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

function writeLifecycleRecord(root, { number, slug, status }) {
  if (status !== 'defined') return { ideaPath: idea(root, number, slug, status), specPath: null };
  const specPath = packageAt(root, number, slug);
  return { ideaPath: idea(root, number, slug, status, specPath), specPath };
}

function lifecycleShape(inventory) {
  return {
    ideas: inventory.ideas.map(({ ideaPath, number, slug, status, specPath }) => ({ ideaPath, number, slug, status, specPath })),
    packages: inventory.packages.map(({ specPath, number, slug }) => ({ specPath, number, slug })),
    features: inventory.features,
    nextNumber: inventory.nextNumber,
    exhausted: inventory.exhausted,
    diagnostics: inventory.diagnostics,
  };
}

function markdownSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const level = heading.indexOf(' ');
  const end = lines.findIndex((line, index) => {
    const match = /^(#+) /.exec(line);
    return index > start && match !== null && match[1].length <= level;
  });
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
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

test('T001 active guidance lets distinct slugs share a prefix while keeping exact identity errors', () => {
  // Arrange
  const definition = fs.readFileSync(FEATURE_DEFINITION_SKILL, 'utf8');
  const brainstorm = markdownSection(definition, '## Brainstorm');
  const firstDefinition = markdownSection(definition, '## First Definition Transaction');
  const rules = fs.readFileSync(SHARED_RULES, 'utf8').split('\n');
  const captureRule = rules.find((line) => line.startsWith('4. ')) ?? '';
  const ownerRule = rules.find((line) => line.startsWith('5. ')) ?? '';
  const lintChecks = markdownSection(fs.readFileSync(LINT_SKILL, 'utf8'), '## Checks');
  const numericConflict = /duplicate[- ]number|number collision|never reused/i;

  // Act / Assert
  assert.match(brainstorm, /`max\(valid direct idea and package lifecycle numbers\) \+ 1` allocation/);
  assert.match(brainstorm, /never fills a gap and stops at `999`/);
  assert.match(brainstorm, /Different slugs may share a lifecycle number; the inventory rejects a duplicate slug, not a shared number\./);
  assert.doesNotMatch(brainstorm, numericConflict);
  assert.match(firstDefinition, /Do not allocate a package number\./);
  assert.match(firstDefinition, /A valid package with the same `<NNN>` and a different slug does not block definition\./);
  assert.match(
    firstDefinition,
    /A duplicate slug, existing target path, conflicting owner claim, inconsistent number or suffix, or ambiguous prospective selection stops before writes\./,
  );
  assert.doesNotMatch(firstDefinition, numericConflict);
  assert.match(captureRule, /Different slugs may share `<NNN>`; only a duplicate slug, a mismatched idea\/package pair, or competing claims to one exact path conflict\./);
  assert.match(ownerRule, /never fall back to slug, directory, name, or matching lifecycle number/);
  assert.match(ownerRule, /The lifecycle number records capture chronology only/);
  assert.doesNotMatch(lintChecks, /duplicate-number/);
  assert.match(lintChecks, /Unnumbered, malformed, out-of-range, duplicate-slug, and filename\/slug-mismatch identities fail\./);
  assert.match(lintChecks, /Ideas and packages with different slugs may share a number\./);
  assert.match(lintChecks, /has the matching lifecycle number and slug/);
  assert.match(lintChecks, /Duplicate owners fail and report every conflicting idea path/);
  assert.match(lintChecks, /matching numbers, slugs, titles, or directories never establish ownership/);
});

test('T001 duplicate-prefix sources and generated counterparts stay byte-identical', () => {
  for (const [source, generated] of DUPLICATE_PREFIX_SOURCE_PAIRS) {
    // Arrange
    const sourceBytes = fs.readFileSync(path.join(ROOT, source));

    // Act
    const generatedBytes = fs.readFileSync(path.join(ROOT, generated));

    // Assert
    assert.ok(generatedBytes.equals(sourceBytes), `${generated} must match ${source}; run node scripts/build-dev.mjs`);
  }
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
      'FEATURE_IDEA_SLUG_DUPLICATE',
      'FEATURE_IDEA_SLUG_MISMATCH',
      'FEATURE_IDEA_ENTRY_UNSUPPORTED',
      'FEATURE_OWNER_NOT_FOUND',
      'FEATURE_OWNER_NOT_FOUND',
    ]);
    // Sharing prefix 003 is not itself evidence of a conflict.
    assert.equal(result.diagnostics.some((entry) => entry.path === '.dude/ideas/003-two.md'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('T001 same-prefix draft, defined, resolved, and mixed inventories stay clean and exactly selectable', () => {
  const cases = [
    {
      name: 'draft-only',
      records: [
        { number: '012', slug: 'second-draft', status: 'draft' },
        { number: '012', slug: 'first-draft', status: 'draft' },
      ],
      nextNumber: '013',
    },
    {
      name: 'defined-only',
      records: [
        { number: '013', slug: 'beta', status: 'defined' },
        { number: '013', slug: 'alpha', status: 'defined' },
      ],
      nextNumber: '014',
    },
    {
      name: 'resolved-only',
      records: [
        { number: '014', slug: 'closed-two', status: 'resolved' },
        { number: '014', slug: 'closed-one', status: 'resolved' },
      ],
      nextNumber: '015',
    },
    {
      name: 'mixed',
      records: [
        { number: '015', slug: 'resolved-peer', status: 'resolved' },
        { number: '015', slug: 'draft-peer', status: 'draft' },
        { number: '015', slug: 'defined-peer', status: 'defined' },
        { number: '011', slug: 'earlier', status: 'draft' },
      ],
      nextNumber: '016',
    },
  ];
  for (const fixture of cases) {
    const root = temporaryRoot();
    try {
      // Arrange
      const written = fixture.records.map((record) => ({ ...record, ...writeLifecycleRecord(root, record) }));
      const ordered = [...written].sort((left, right) => (
        Number(left.number) - Number(right.number) || (left.ideaPath < right.ideaPath ? -1 : 1)
      ));

      // Act
      const full = inventoryLifecycleIdentities({ root });
      const summary = selectLifecycleIdeaSummary({ root });

      // Assert
      assert.deepEqual(full.diagnostics, [], fixture.name);
      assert.equal(full.nextNumber, fixture.nextNumber, fixture.name);
      assert.equal(full.exhausted, false, fixture.name);
      assert.deepEqual(full.ideas.map((entry) => entry.ideaPath), ordered.map((entry) => entry.ideaPath), fixture.name);
      assert.deepEqual(
        full.features,
        ordered.filter((entry) => entry.specPath).map(({ ideaPath, specPath }) => ({ ideaPath, specPath })),
        fixture.name,
      );
      assert.deepEqual(lifecycleShape(summary.inventory), lifecycleShape(full), fixture.name);
      assert.deepEqual(summary.diagnostics, [], fixture.name);
      assert.deepEqual(summary.contexts.flatMap((context) => context.diagnostics), [], fixture.name);
      assert.equal(summary.idea, null, `${fixture.name}: several peers never imply a sole selection`);
      assert.deepEqual(
        summary.choices.map((entry) => entry.ideaPath),
        ordered.filter((entry) => entry.status !== 'resolved').map((entry) => entry.ideaPath),
        `${fixture.name}: resolved peers are not choices`,
      );
      for (const record of written) {
        const label = `${fixture.name}: ${record.ideaPath}`;
        assert.equal(resolveIdeaSelector({ root, slug: record.slug }).idea?.ideaPath, record.ideaPath, label);
        assert.equal(resolveIdeaSelector({ root, ideaPath: record.ideaPath }).idea?.slug, record.slug, label);
        const explicit = selectLifecycleIdeaSummary({ root, target: record.slug });
        assert.equal(explicit.idea?.ideaPath, record.ideaPath, label);
        assert.deepEqual(
          explicit.owner,
          record.specPath ? { ideaPath: record.ideaPath, specPath: record.specPath } : null,
          label,
        );
        if (record.specPath) {
          assert.deepEqual(resolveFeatureOwner({ root, specPath: record.specPath }), {
            owner: { ideaPath: record.ideaPath, specPath: record.specPath },
            diagnostics: [],
          }, label);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('T001 reported 074 and 075 prefix peers keep exact identities and creation-order-independent ties', () => {
  const forward = temporaryRoot();
  const reverse = temporaryRoot();
  try {
    // Arrange the same records in opposite creation orders.
    const written = REPORTED_PREFIX_PEERS.map((record) => ({ ...record, ...writeLifecycleRecord(forward, record) }));
    for (const record of [...REPORTED_PREFIX_PEERS].reverse()) writeLifecycleRecord(reverse, record);

    // Act
    const inventory = inventoryLifecycleIdentities({ root: forward });
    const reversed = inventoryLifecycleIdentities({ root: reverse });

    // Assert
    assert.deepEqual(inventory.diagnostics, []);
    assert.equal(inventory.nextNumber, '076');
    assert.deepEqual(inventory.ideas.map((entry) => entry.ideaPath), [
      '.dude/ideas/074-dude-canvas-about.md',
      '.dude/ideas/074-work-readable-evidence-handoff.md',
      '.dude/ideas/075-dude-development-base-release.md',
      '.dude/ideas/075-resolved-bystander.md',
      '.dude/ideas/075-terminal-work-manual-resolution.md',
    ]);
    assert.deepEqual(inventory.packages.map((entry) => entry.specPath), [
      '.dude/specs/074-dude-canvas-about/spec.md',
      '.dude/specs/074-work-readable-evidence-handoff/spec.md',
      '.dude/specs/075-terminal-work-manual-resolution/spec.md',
    ]);
    assert.deepEqual(lifecycleShape(reversed), lifecycleShape(inventory));
    for (const record of written) {
      assert.equal(resolveIdeaSelector({ root: forward, slug: record.slug }).idea?.ideaPath, record.ideaPath, record.slug);
      assert.equal(resolveIdeaSelector({ root: forward, ideaPath: record.ideaPath }).idea?.slug, record.slug, record.slug);
      if (record.specPath) {
        assert.deepEqual(resolveFeatureOwner({ root: forward, specPath: record.specPath }), {
          owner: { ideaPath: record.ideaPath, specPath: record.specPath },
          diagnostics: [],
        }, record.slug);
      }
    }
    for (const number of ['074', '075']) {
      const bare = resolveIdeaSelector({ root: forward, slug: number });
      assert.equal(bare.idea, null, number);
      assert.deepEqual(bare.diagnostics.map((item) => item.code), ['FEATURE_IDEA_NOT_FOUND'], number);
      const summary = selectLifecycleIdeaSummary({ root: forward, target: number });
      assert.equal(summary.idea, null, number);
      assert.deepEqual(summary.diagnostics.map((item) => item.code), ['FEATURE_IDEA_NOT_FOUND'], number);
    }
    const unownedPeer = resolveFeatureOwner({ root: forward, specPath: '.dude/specs/074-other/spec.md' });
    assert.equal(unownedPeer.owner, null);
    assert.deepEqual(unownedPeer.diagnostics.map((item) => item.code), ['FEATURE_OWNER_NOT_FOUND']);
  } finally {
    fs.rmSync(forward, { recursive: true, force: true });
    fs.rmSync(reverse, { recursive: true, force: true });
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

test('T001 first capture allocates local max-plus-one after same-prefix peers without gap reuse and stops at 999', () => {
  const cases = [
    { name: 'empty inventory', records: [], expected: '.dude/ideas/001-next-idea.md' },
    { name: 'reported prefix peers', records: REPORTED_PREFIX_PEERS, expected: '.dude/ideas/076-next-idea.md' },
    {
      name: 'gap below a shared prefix',
      records: [
        { number: '001', slug: 'first', status: 'draft' },
        { number: '005', slug: 'peer-one', status: 'draft' },
        { number: '005', slug: 'peer-two', status: 'defined' },
      ],
      expected: '.dude/ideas/006-next-idea.md',
    },
    {
      name: 'shared 998',
      records: [
        { number: '998', slug: 'peer-one', status: 'resolved' },
        { number: '998', slug: 'peer-two', status: 'draft' },
      ],
      expected: '.dude/ideas/999-next-idea.md',
    },
  ];
  for (const fixture of cases) {
    const root = temporaryRoot();
    try {
      // Arrange
      lintLayout(root);
      for (const record of fixture.records) writeLifecycleRecord(root, record);
      const stage = path.join(root, 'stage.md');
      fs.writeFileSync(stage, ledger('next-idea'));
      const before = snapshot(root);

      // Act
      const captured = run(CAPTURE, ['--root', root, '--slug', 'next-idea', '--stage', stage]);

      // Assert
      assert.equal(captured.status, 0, `${fixture.name}: ${captured.stderr}`);
      assert.equal(captured.stdout, `${fixture.expected}\n`, fixture.name);
      const after = snapshot(root);
      assert.deepEqual(before.filter((entry) => !after.includes(entry)), [], `${fixture.name}: no existing byte changed`);
      assert.deepEqual(after.filter((entry) => !before.includes(entry)), [
        ...(fixture.records.length === 0 ? ['d .dude/ideas'] : []),
        `f ${fixture.expected} ${fs.readFileSync(stage).toString('hex')}`,
      ], fixture.name);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const refusals = [
    {
      name: 'shared 999 is exhausted',
      records: [
        { number: '999', slug: 'last-one', status: 'draft' },
        { number: '999', slug: 'last-two', status: 'defined' },
      ],
      exhausted: true,
      stderr: /001-999 is exhausted/,
    },
    {
      name: 'duplicate slug across prefixes is still unsafe',
      records: [
        { number: '004', slug: 'same', status: 'draft' },
        { number: '005', slug: 'same', status: 'draft' },
      ],
      exhausted: false,
      stderr: /lifecycle inventory is unsafe \(\.dude\/ideas\/004-same\.md: duplicate idea slug 'same'/,
    },
  ];
  for (const fixture of refusals) {
    const root = temporaryRoot();
    try {
      // Arrange
      lintLayout(root);
      for (const record of fixture.records) writeLifecycleRecord(root, record);
      const stage = path.join(root, 'stage.md');
      fs.writeFileSync(stage, ledger('never'));
      const inventory = inventoryLifecycleIdentities({ root });
      const before = snapshot(root);

      // Act
      const refused = run(CAPTURE, ['--root', root, '--slug', 'never', '--stage', stage]);

      // Assert
      assert.equal(inventory.exhausted, fixture.exhausted, fixture.name);
      assert.equal(inventory.nextNumber, null, fixture.name);
      assert.equal(inventory.diagnostics.length === 0, fixture.exhausted, fixture.name);
      assert.notEqual(refused.status, 0, fixture.name);
      assert.equal(refused.stdout, '', fixture.name);
      assert.match(refused.stderr, fixture.stderr, fixture.name);
      assert.deepEqual(snapshot(root), before, `${fixture.name}: zero writes`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('T001 first definition reuses the selected idea number beside a valid same-prefix package and refuses an orphan package', () => {
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

    // Arrange a valid package that shares prefix 021 under its own exact owner.
    const peerRoot = temporaryRoot();
    try {
      lintLayout(peerRoot);
      write(peerRoot, selected, current);
      const peerSpec = packageAt(peerRoot, '021', 'peer');
      const peerIdea = idea(peerRoot, '021', 'peer', 'defined', peerSpec);
      fs.cpSync(stage, path.join(peerRoot, 'stage'), { recursive: true });
      const peerBefore = snapshot(peerRoot).filter((entry) => entry.includes('021-peer'));

      // Act
      const beside = run(DEFINE, ['--root', peerRoot, '--idea', selected, '--spec', spec, '--stage', path.join(peerRoot, 'stage')]);

      // Assert
      assert.equal(beside.status, 0, beside.stderr);
      assert.equal(beside.stdout, `${spec}\n`);
      assert.deepEqual(resolveFeatureOwner({ root: peerRoot, specPath: spec }).owner, { ideaPath: selected, specPath: spec });
      assert.deepEqual(resolveFeatureOwner({ root: peerRoot, specPath: peerSpec }).owner, { ideaPath: peerIdea, specPath: peerSpec });
      assert.deepEqual(snapshot(peerRoot).filter((entry) => entry.includes('021-peer')), peerBefore);
    } finally {
      fs.rmSync(peerRoot, { recursive: true, force: true });
    }

    // Arrange an orphan same-prefix package; it is an owner error, not a peer.
    const orphanRoot = temporaryRoot();
    try {
      lintLayout(orphanRoot);
      write(orphanRoot, selected, current);
      packageAt(orphanRoot, '021', 'other');
      fs.cpSync(stage, path.join(orphanRoot, 'stage'), { recursive: true });
      const before = snapshot(orphanRoot);

      // Act
      const orphan = run(DEFINE, ['--root', orphanRoot, '--idea', selected, '--spec', spec, '--stage', path.join(orphanRoot, 'stage')]);

      // Assert
      assert.notEqual(orphan.status, 0);
      assert.equal(orphan.stdout, '');
      assert.match(orphan.stderr, /lifecycle inventory is unsafe/);
      assert.match(orphan.stderr, /feature package has no defined idea owner for '\.dude\/specs\/021-other\/spec\.md'/);
      assert.deepEqual(snapshot(orphanRoot), before);
    } finally {
      fs.rmSync(orphanRoot, { recursive: true, force: true });
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

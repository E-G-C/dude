// @ts-check
/** Unit coverage for version-1 install-profile validation and path safety. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PROFILE_INVENTORY_VERSION,
  inventoryDigest,
  resolveProfileArtifact,
  validateProfile,
} from './profile.mjs';

const AGENT_SOURCE = 'agents/dude-pack-demo-worker.agent.md';
const AGENT_PATH = `.github/${AGENT_SOURCE}`;
const PROMPT_SOURCE = 'prompts/dude-pack-demo-review.prompt.md';
const PROMPT_PATH = `.github/${PROMPT_SOURCE}`;

/**
 * @param {string} relativePath
 * @param {string} kind
 * @param {string} source
 * @returns {Record<string, unknown>}
 */
function artifactRecord(relativePath, kind, source) {
  return {
    path: relativePath,
    kind,
    source,
    source_sha256: '2'.repeat(64),
    installed_sha256: '3'.repeat(64),
  };
}

/**
 * @param {number | unknown} version
 * @param {Record<string, unknown>[]} artifacts
 * @param {string} [packName]
 * @returns {Record<string, any>}
 */
function inventoryFor(version, artifacts, packName = 'demo') {
  const inventory = {
    version,
    pack: packName,
    source: { type: 'library', location: '/catalog', ref: 'main' },
    manifest_sha256: '1'.repeat(64),
    artifacts,
    digest: '',
  };
  inventory.digest = inventoryDigest(inventory);
  return inventory;
}

/** @param {Record<string, any>} inventory */
function refreshDigest(inventory) {
  inventory.digest = inventoryDigest(inventory);
}

/**
 * @param {Record<string, any>} inventory
 * @param {string[]} [files]
 * @returns {Record<string, any>}
 */
function profileFor(inventory, files = inventory.artifacts.map((artifact) => artifact.path)) {
  return {
    enabled_packs: ['demo'],
    installed: {
      demo: {
        files,
        installed_at: '2026-07-13T00:00:00.000Z',
        inventory,
      },
    },
  };
}

/** @returns {string} */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-profile-'));
}

test('current complete inventories are version 1 and bind every artifact to its source', () => {
  // Arrange
  const artifacts = [
    artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE),
    artifactRecord('.github/skills/dude-pack-demo-helper', 'skills', 'skills/dude-pack-demo-helper'),
    artifactRecord(
      '.github/instructions/dude-pack-demo-review.instructions.md',
      'instructions',
      'instructions/dude-pack-demo-review.instructions.md',
    ),
    artifactRecord(PROMPT_PATH, 'prompts', PROMPT_SOURCE),
  ];
  const inventory = inventoryFor(1, artifacts);

  // Act
  const validated = validateProfile(profileFor(inventory));

  // Assert
  assert.equal(PROFILE_INVENTORY_VERSION, 1);
  assert.equal(validated.installed.demo.inventory?.version, 1);
  for (const artifact of validated.installed.demo.inventory?.artifacts ?? []) {
    assert.equal(artifact.path, `.github/${artifact.source}`, artifact.source);
  }
});

test('a version 2 inventory is rejected without migration or downgrade', () => {
  // Arrange
  const inventory = inventoryFor(2, [artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE)]);

  // Act + Assert
  assert.throws(
    () => validateProfile(profileFor(inventory)),
    /profile\.md installed\.demo\.inventory has unsupported version '2'/,
  );
});

test('the profile reader has no retired version-2 compatibility surface', () => {
  // Arrange
  const implementation = fs.readFileSync(new URL('./profile.mjs', import.meta.url), 'utf8');

  // Act + Assert
  assert.doesNotMatch(
    implementation,
    /\b(?:SUPPORTED_INVENTORY_VERSIONS|agentProjectionPaths)\b|version\s*[=!]==?\s*2|\b(?:migrat|downgrad|compatib)\w*/i,
  );
});

test('inventory validation rejects an artifact whose path is not its exact persisted source', () => {
  // Arrange
  const inventory = inventoryFor(1, [
    artifactRecord(AGENT_PATH, 'agents', 'agents/dude-pack-demo-other.agent.md'),
  ]);

  // Act + Assert
  assert.throws(
    () => validateProfile(profileFor(inventory)),
    /artifact '\.github\/agents\/dude-pack-demo-worker\.agent\.md' conflicts with source 'agents\/dude-pack-demo-other\.agent\.md'/,
  );
});

test('resolveProfileArtifact rejects a destination bound to another persisted source', () => {
  // Arrange
  const root = makeRoot();
  const artifact = artifactRecord(AGENT_PATH, 'agents', 'agents/dude-pack-demo-other.agent.md');
  try {
    // Act + Assert
    assert.throws(
      () => resolveProfileArtifact(root, AGENT_PATH, 'demo', /** @type {any} */ (artifact)),
      /does not match its exact persisted source inventory/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inventory validation refuses source and destination traversal forms', () => {
  // Arrange
  const unsafeSources = [
    '../agents/dude-pack-demo-worker.agent.md',
    'agents/../dude-pack-demo-worker.agent.md',
    'agents/nested/dude-pack-demo-worker.agent.md',
    '/agents/dude-pack-demo-worker.agent.md',
    'docs/dude-pack-demo-worker.agent.md',
    'agents',
  ];
  const unsafeDestinations = [
    '.github/agents/dude-pack-demo-worker.md',
    '.github/agents/nested/dude-pack-demo-worker.agent.md',
    '.github/agents/../../dude-pack-demo-worker.agent.md',
    '.github\\agents\\dude-pack-demo-worker.agent.md',
    '../dude-pack-demo-worker.agent.md',
    '/tmp/dude-pack-demo-worker.agent.md',
  ];

  // Act + Assert
  for (const source of unsafeSources) {
    const inventory = inventoryFor(1, [artifactRecord(AGENT_PATH, 'agents', source)]);
    assert.throws(() => validateProfile(profileFor(inventory)), /inventory has unsafe source/, source);
  }
  for (const destination of unsafeDestinations) {
    const inventory = inventoryFor(1, [artifactRecord(destination, 'agents', AGENT_SOURCE)]);
    assert.throws(
      () => validateProfile(profileFor(inventory)),
      /inventory has unsafe artifact path/,
      destination,
    );
  }
});

test('inventory validation retains namespace ownership and artifact-kind checks', () => {
  // Arrange
  const foreignInventory = inventoryFor(1, [
    artifactRecord(
      '.github/agents/dude-pack-beta-worker.agent.md',
      'agents',
      'agents/dude-pack-beta-worker.agent.md',
    ),
  ]);
  const wrongKindInventory = inventoryFor(1, [
    artifactRecord('.github/skills/dude-pack-demo-helper', 'agents', AGENT_SOURCE),
  ]);

  // Act + Assert
  assert.throws(
    () => validateProfile(profileFor(foreignInventory)),
    /is not owned by pack 'demo' under the dude-pack-demo-\* namespace/,
  );
  assert.throws(
    () => validateProfile(profileFor(wrongKindInventory)),
    /conflicts with kind 'agents'/,
  );
});

test('inventory validation retains artifact and inventory digest checks', () => {
  // Arrange
  const malformedArtifactInventory = inventoryFor(1, [
    artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE),
  ]);
  malformedArtifactInventory.artifacts[0].source_sha256 = 'not-a-sha256';
  refreshDigest(malformedArtifactInventory);

  const wrongInventoryDigest = inventoryFor(1, [
    artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE),
  ]);
  wrongInventoryDigest.digest = 'f'.repeat(64);

  // Act + Assert
  assert.throws(
    () => validateProfile(profileFor(malformedArtifactInventory)),
    /artifact '\.github\/agents\/dude-pack-demo-worker\.agent\.md' has an invalid SHA-256 digest/,
  );
  assert.throws(
    () => validateProfile(profileFor(wrongInventoryDigest)),
    /inventory digest does not match its exact artifact inventory/,
  );
});

test('profile files and inventory remain mutually congruent', () => {
  // Arrange
  const extraPath = '.github/agents/dude-pack-demo-extra.agent.md';
  const inventoryMissingFile = inventoryFor(1, [artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE)]);
  const fileMissingInventory = profileFor(inventoryMissingFile, [AGENT_PATH, extraPath]);

  const inventoryExtraFile = inventoryFor(1, [
    artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE),
    artifactRecord(extraPath, 'agents', 'agents/dude-pack-demo-extra.agent.md'),
  ]);
  const fileMissingArtifact = profileFor(inventoryExtraFile, [AGENT_PATH]);

  // Act + Assert
  assert.throws(
    () => validateProfile(fileMissingInventory),
    /files path '\.github\/agents\/dude-pack-demo-extra\.agent\.md' is absent from its exact inventory/,
  );
  assert.throws(
    () => validateProfile(fileMissingArtifact),
    /inventory contains an artifact absent from files/,
  );
});

test('a direct version-1 artifact resolves below the workspace root', () => {
  // Arrange
  const root = makeRoot();
  const artifact = artifactRecord(AGENT_PATH, 'agents', AGENT_SOURCE);
  try {
    // Act
    const resolved = resolveProfileArtifact(root, AGENT_PATH, 'demo', /** @type {any} */ (artifact));

    // Assert
    assert.equal(resolved, path.join(root, ...AGENT_PATH.split('/')));
    assert.equal(path.relative(root, resolved).startsWith('..'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveProfileArtifact refuses paths outside roots, traversal, and unsupported suffixes', () => {
  // Arrange
  const root = makeRoot();
  const outsideRoots = ['docs/guide.md', '.github/workflows/ci.yml'];
  const traversal = [
    '../.github/agents/dude-pack-demo-worker.agent.md',
    '.github/agents/../../etc/passwd',
    '.github/agents/./dude-pack-demo-worker.agent.md',
    '.github\\agents\\dude-pack-demo-worker.agent.md',
    '/tmp/dude-pack-demo-worker.agent.md',
    '',
  ];
  const badSuffixes = [
    '.github/agents/dude-pack-demo-worker.md',
    '.github/prompts/dude-pack-demo-review.md',
  ];
  try {
    // Act + Assert
    for (const relativePath of outsideRoots) {
      assert.throws(
        () => resolveProfileArtifact(root, relativePath, 'demo'),
        /is outside approved pack installation roots/,
        relativePath,
      );
    }
    for (const relativePath of traversal) {
      assert.throws(
        () => resolveProfileArtifact(root, relativePath, 'demo'),
        /unsafe pack profile path/,
        relativePath,
      );
    }
    for (const relativePath of badSuffixes) {
      assert.throws(
        () => resolveProfileArtifact(root, relativePath, 'demo'),
        /is not owned by pack 'demo'|is not a supported prompt artifact/,
        relativePath,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveProfileArtifact refuses an unowned direct path without exact inventory evidence', () => {
  // Arrange
  const root = makeRoot();
  try {
    // Act + Assert
    assert.throws(
      () => resolveProfileArtifact(root, '.github/agents/dude-spec-lead.agent.md', 'demo'),
      /is not owned by pack 'demo' under the dude-pack-demo-\* namespace without an exact persisted pack inventory/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveProfileArtifact refuses a symbolic link at every direct destination component', () => {
  // Arrange
  const linkComponents = [
    '.github',
    '.github/agents',
    '.github/agents/dude-pack-demo-worker.agent.md',
  ];

  // Act + Assert
  for (const linkRelativePath of linkComponents) {
    const root = makeRoot();
    try {
      fs.writeFileSync(path.join(root, 'decoy.md'), 'x\n');
      const linkPath = path.join(root, ...linkRelativePath.split('/'));
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      fs.symlinkSync(path.join(root, 'decoy.md'), linkPath);

      assert.throws(
        () => resolveProfileArtifact(root, AGENT_PATH, 'demo'),
        new RegExp(`contains symbolic link '${linkRelativePath.replace(/[.]/g, '\\.')}'`),
        linkRelativePath,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

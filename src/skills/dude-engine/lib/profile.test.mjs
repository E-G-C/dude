// @ts-check
/** Unit coverage for the canonical pack profile and its one predecessor transition. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseProfileDocument,
  resolveProfileArtifact,
  serializeProfileDocument,
  validateProfile,
} from './profile.mjs';

const AGENT = '.github/agents/dude-pack-demo-worker.agent.md';
const SKILL = '.github/skills/dude-pack-demo-helper';
const REMOTE_COMMIT = 'a'.repeat(40);

/** @param {string} pack */
function agentFor(pack) {
  return `.github/agents/dude-pack-${pack}-worker.agent.md`;
}

/** @returns {string} */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dude-profile-'));
}

/** @param {unknown} payload */
function document(payload) {
  return `# Install Profile\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

/** @param {Record<string, any>} inventory */
function predecessorDigest(inventory) {
  const payload = {
    version: inventory.version,
    pack: inventory.pack,
    source: inventory.source,
    manifest_sha256: inventory.manifest_sha256,
    artifacts: [...inventory.artifacts].sort((a, b) => a.path.localeCompare(b.path)),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * @param {string} pack
 * @param {{ type: 'library' | 'source', location: string, ref: string }} source
 * @param {string[]} [files]
 */
function predecessorEntry(pack, source, files = [agentFor(pack)]) {
  const artifacts = files.map((artifactPath) => {
    const kind = artifactPath.split('/')[1];
    return {
      path: artifactPath,
      kind,
      source: `${kind}/${artifactPath.split('/').at(-1)}`,
      source_sha256: 'b'.repeat(64),
      installed_sha256: 'c'.repeat(64),
    };
  });
  const inventory = {
    version: 1,
    pack,
    source,
    manifest_sha256: 'a'.repeat(64),
    artifacts,
    digest: '',
  };
  inventory.digest = predecessorDigest(inventory);
  return {
    files: [...files].sort(),
    installed_at: '2026-08-01T12:00:00.000Z',
    inventory,
  };
}

test('serializes and parses only the sorted minimal canonical profile source union', () => {
  // Arrange
  const profile = {
    installed: {
      demo: {
        files: [AGENT, SKILL],
        source: { type: 'local', location: '/catalog/packs' },
      },
      remote: {
        files: [agentFor('remote')],
        source: {
          type: 'remote',
          repository: 'file:///catalog.git',
          requested_ref: 'refs/tags/v1.0.0',
          resolved_commit: REMOTE_COMMIT,
        },
      },
    },
  };

  // Act
  const serialized = serializeProfileDocument(profile);
  const parsed = parseProfileDocument(serialized);

  // Assert
  assert.deepEqual(parsed, profile);
  assert.doesNotMatch(serialized, /enabled_packs|inventory|digest|sha256|installed_at/);
  assert.ok(serialized.indexOf('"demo"') < serialized.indexOf('"remote"'), 'pack keys are sorted');
});

test('canonical records reject unknown fields, duplicate or unsorted files, and invalid source variants', () => {
  // Arrange
  const base = {
    installed: {
      demo: { files: [AGENT], source: { type: 'local', location: '/catalog' } },
    },
  };
  const cases = [
    [{ ...base, enabled_packs: ['demo'] }, /complete predecessor entry/],
    [{ installed: { demo: { ...base.installed.demo, unexpected: true } } }, /unsupported or missing fields/],
    [{ installed: { demo: { ...base.installed.demo, files: [SKILL, AGENT] } } }, /must be sorted/],
    [{ installed: { demo: { ...base.installed.demo, files: [AGENT, AGENT] } } }, /repeats/],
    [{ installed: { demo: { files: [AGENT], source: { type: 'local', location: '/catalog', ref: 'main' } } } }, /exact local identity/],
    [{ installed: { demo: { files: [AGENT], source: { type: 'remote', repository: 'x', requested_ref: 'main', resolved_commit: 'short' } } } }, /exact remote identity/],
  ];

  // Act + Assert
  for (const [candidate, error] of cases) {
    assert.throws(() => validateProfile(candidate), error);
  }
});

test('canonical remote commits normalize only exact Git object widths and retain null transition state', () => {
  // Arrange
  const remote = (resolved_commit) => ({
    installed: {
      demo: {
        files: [AGENT],
        source: {
          type: 'remote',
          repository: 'file:///catalog.git',
          requested_ref: 'main',
          resolved_commit,
        },
      },
    },
  });
  const accepted = [
    ['a'.repeat(40), 'a'.repeat(40)],
    ['B'.repeat(40), 'b'.repeat(40)],
    ['c'.repeat(64), 'c'.repeat(64)],
    ['D'.repeat(64), 'd'.repeat(64)],
  ];
  const rejected = [
    'a'.repeat(39),
    'a'.repeat(41),
    'a'.repeat(63),
    'a'.repeat(65),
    `${'a'.repeat(39)}g`,
  ];

  // Act + Assert
  for (const [input, normalized] of accepted) {
    assert.equal(validateProfile(remote(input)).installed.demo.source.resolved_commit, normalized);
  }
  assert.equal(validateProfile(remote(null)).installed.demo.source.resolved_commit, null);
  for (const input of rejected) {
    assert.throws(() => validateProfile(remote(input)), /exact remote identity/);
  }
});

test('canonical records refuse namespace, traversal, pack-prefix, and cross-pack claims', () => {
  // Arrange
  const candidates = [
    {
      installed: {
        demo: { files: ['.github/agents/dude-pack-other-worker.agent.md'], source: { type: 'local', location: '/catalog' } },
      },
    },
    {
      installed: {
        demo: { files: ['.github/agents/../dude-pack-demo-worker.agent.md'], source: { type: 'local', location: '/catalog' } },
      },
    },
    {
      installed: {
        demo: { files: [AGENT], source: { type: 'local', location: '/catalog' } },
        'demo-extra': { files: ['.github/agents/dude-pack-demo-extra-worker.agent.md'], source: { type: 'local', location: '/catalog' } },
      },
    },
    {
      installed: {
        demo: { files: [AGENT], source: { type: 'local', location: '/catalog' } },
        other: { files: [AGENT], source: { type: 'local', location: '/catalog' } },
      },
    },
  ];

  // Act + Assert
  for (const candidate of candidates) {
    assert.throws(() => validateProfile(candidate), /unsafe|owned|collide|claimed/);
  }
});

test('path resolution refuses unsafe suffixes and symbolic links without following them', () => {
  // Arrange
  const root = makeRoot();
  try {
    const paths = [
      '../.github/agents/dude-pack-demo-worker.agent.md',
      '.github/agents/dude-pack-demo-worker.md',
      '.github/agents/nested/dude-pack-demo-worker.agent.md',
      '.github\\agents\\dude-pack-demo-worker.agent.md',
      '.github/prompts/dude-pack-demo-worker.md',
    ];

    // Act + Assert
    for (const candidate of paths) {
      assert.throws(() => resolveProfileArtifact(root, candidate, 'demo'), /unsafe|approved|owned|supported/);
    }
    fs.mkdirSync(path.join(root, '.github', 'agents'), { recursive: true });
    fs.symlinkSync(path.join(root, 'outside'), path.join(root, '.github', 'agents', 'dude-pack-demo-worker.agent.md'));
    assert.throws(() => resolveProfileArtifact(root, AGENT, 'demo'), /symbolic link/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a complete immediate predecessor converts to an unknown remote commit and canonical round-trips it', () => {
  // Arrange
  const predecessor = {
    enabled_packs: ['demo', 'remote'],
    installed: {
      demo: predecessorEntry('demo', { type: 'library', location: '/catalog/packs', ref: '' }, [AGENT, SKILL]),
      remote: predecessorEntry('remote', { type: 'source', location: 'file:///catalog.git', ref: 'stable' }),
    },
  };

  // Act
  const converted = parseProfileDocument(document(predecessor));
  const canonical = serializeProfileDocument(converted);
  const reparsed = parseProfileDocument(canonical);

  // Assert
  assert.deepEqual(converted, {
    installed: {
      demo: { files: [AGENT, SKILL], source: { type: 'local', location: '/catalog/packs' } },
      remote: {
        files: [agentFor('remote')],
        source: { type: 'remote', repository: 'file:///catalog.git', requested_ref: 'stable', resolved_commit: null },
      },
    },
  });
  assert.deepEqual(reparsed, converted);
  assert.doesNotMatch(canonical, /enabled_packs|inventory|digest|sha256|installed_at/);
});

test('predecessor conversion binds each digest-consistent artifact kind to its exact installation root', () => {
  // Arrange
  const valid = {
    enabled_packs: ['demo'],
    installed: {
      demo: predecessorEntry('demo', { type: 'library', location: '/catalog/packs', ref: '' }),
    },
  };
  const wrongKind = structuredClone(valid);
  const artifact = wrongKind.installed.demo.inventory.artifacts[0];
  artifact.kind = 'skills';
  artifact.source = 'skills/dude-pack-demo-worker.agent.md';
  wrongKind.installed.demo.inventory.digest = predecessorDigest(wrongKind.installed.demo.inventory);
  const bytes = Buffer.from(document(wrongKind));

  // Act + Assert
  assert.deepEqual(parseProfileDocument(document(valid)).installed.demo.files, [AGENT], 'valid artifact binding must still convert');
  assert.throws(
    () => parseProfileDocument(bytes),
    /inconsistent predecessor artifact bindings/,
    'an agent-root path relabeled as skills must not convert merely because its digest matches',
  );
  assert.deepEqual(bytes, Buffer.from(document(wrongKind)), 'rejected predecessor bytes changed');
});

test('only complete predecessor profiles convert and every refusal leaves profile bytes unchanged', () => {
  // Arrange
  const valid = {
    enabled_packs: ['demo'],
    installed: {
      demo: predecessorEntry('demo', { type: 'library', location: '/catalog/packs', ref: '' }),
    },
  };
  const cases = [
    ['inventory-less', (value) => { delete value.installed.demo.inventory; }],
    ['unsupported version', (value) => { value.installed.demo.inventory.version = 2; }],
    ['malformed hash', (value) => { value.installed.demo.inventory.artifacts[0].installed_sha256 = 'bad'; }],
    ['wrong digest', (value) => { value.installed.demo.inventory.digest = 'f'.repeat(64); }],
    ['mixed old/new', (value) => { delete value.installed.demo.installed_at; }],
    ['unknown field', (value) => { value.installed.demo.inventory.extra = true; }],
    ['enabled ghost', (value) => { value.enabled_packs = ['demo', 'ghost']; }],
    ['unsafe file', (value) => { value.installed.demo.files = ['.github/agents/../dude-pack-demo-worker.agent.md']; }],
    ['ambiguous source', (value) => { value.installed.demo.inventory.source = { type: 'source', location: 'relative', ref: '' }; }],
  ];

  // Act + Assert
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    const bytes = Buffer.from(document(candidate));
    assert.throws(() => parseProfileDocument(bytes), /profile\.md/);
    assert.deepEqual(bytes, Buffer.from(document(candidate)), `${label}: parser mutated its input bytes`);
  }
});
